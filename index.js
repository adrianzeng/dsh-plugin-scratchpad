/**
 * Host half of the Scratchpad bundle.
 *
 * P2 moved note storage out of the browser: every note now lives in a single
 * SQLite file under `~/.dsh/scratchpad/notes.db` (node:sqlite, built into the
 * host Node). This module owns
 *
 * - the SQLite table and its CRUD helpers,
 * - the five local HTTP endpoints consumed by client.js (`/api/scratchpad`),
 * - the three model tools (`note_add` / `note_list` / `note_promote`),
 * - promote-to-ideas, the only action allowed to write outside `~/.dsh/`.
 *
 * No third-party dependency, no listening socket of its own: routes are handed
 * to the DSH host's existing server service.
 */
import { DatabaseSync } from 'node:sqlite';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

/** HTTP prefix shared by every endpoint. */
export const API_PREFIX = '/api/scratchpad';
/**
 * Cordis waits for these services before calling apply(), so `ctx.tools` and
 * `ctx.webServer` are real objects by then. Same declaration style as
 * @furongjun1999/dsh-memory (`export const inject = ['tools']`).
 */
export const inject = ['tools'];
/** Human-readable plugin name for host logs. */
export const name = 'scratchpad';
/** Note statuses accepted by the API and the tools. */
export const NOTE_STATUSES = ['active', 'done', 'dropped'];
/** Note sources accepted by the API and the migration path. */
export const NOTE_SOURCES = ['web', 'im', 'api'];
/** Platform values carried into the idea frontmatter. */
export const IDEA_PLATFORMS = ['全平台', '抖音', '小红书'];

const DAY_MS = 86400000;
const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Default data directory: `%USERPROFILE%\.dsh\scratchpad`. */
export function resolveDataDir() {
  const override = process.env.DSH_SCRATCHPAD_DIR;
  if (typeof override === 'string' && override.trim() !== '') return resolve(override.trim());
  return join(homedir(), '.dsh', 'scratchpad');
}

/** Zero-pad a two-digit field. */
function pad2(value) {
  return String(value).padStart(2, '0');
}

/** Local `YYYY-MM-DD HH:mm` stamp used by the idea file and tool output. */
export function formatLocalStamp(ts) {
  const date = new Date(ts);
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
    + ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}

/** Local `YYYY-MM-DD` date, the format the Doushu 创建/更新 fields use. */
export function formatLocalDate(ts) {
  const date = new Date(ts);
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

/** Local `YYYYMMDD` stamp used by note ids. */
function compactDay(ts) {
  const date = new Date(ts);
  return String(date.getFullYear()) + pad2(date.getMonth() + 1) + pad2(date.getDate());
}

/** Local `YYYYMMDD-HHmm` stamp used by idea file names. */
function compactMinute(ts) {
  const date = new Date(ts);
  return compactDay(ts) + '-' + pad2(date.getHours()) + pad2(date.getMinutes());
}

/** Short nanoid-style random token. */
export function randomToken(length = 6) {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return out;
}

/** `note-<yyyymmdd>-<6 random>` as required by the schema. */
export function makeNoteId(now = Date.now()) {
  return 'note-' + compactDay(now) + '-' + randomToken(6);
}

/**
 * Strip characters that would break the idea frontmatter, collapse newlines,
 * drop a leading dash and cap the title at 40 characters. Ported verbatim from
 * the client half (Doushu spec v1 §7 title hygiene).
 */
export function sanitizeIdeaTitle(raw) {
  let title = String(raw ?? '').replace(/\r?\n/g, ' ');
  title = title.replace(/[:#[\]{}>|*?"<!]/g, ' ');
  title = title.replace(/\s+/g, ' ').trim();
  title = title.replace(/^[-\s]+/, '');
  return title.slice(0, 40).trim();
}

/**
 * Idea title = first non-blank line of the note, sanitized. Falls back to an
 * empty string so callers can decide on their own placeholder.
 */
export function ideaTitleOf(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  for (const line of lines) {
    if (line.trim() !== '') return sanitizeIdeaTitle(line);
  }
  return '';
}

/** Read the Lingtai root from `~/.dsh/lingtai/settings.json` (default C:\Creator). */
export function resolveIdeaRoot(settingsPath) {
  const file = settingsPath
    || process.env.DSH_LINGTAI_SETTINGS
    || join(homedir(), '.dsh', 'lingtai', 'settings.json');
  let root = process.platform === 'win32' ? 'C:\\Creator' : join(homedir(), 'Creator');
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed !== null && typeof parsed === 'object'
      && typeof parsed.root === 'string' && parsed.root.trim() !== '') {
      root = parsed.root.trim();
    }
  } catch (error) {
    /* missing or unreadable settings: keep the documented default */
  }
  return isAbsolute(root) ? root : resolve(root);
}

/** Directory that receives promoted idea files. */
export function resolveInboxDir(settingsPath) {
  return join(resolveIdeaRoot(settingsPath), '00-收件箱');
}

/**
 * Build the Markdown for one promoted note. The card carries the Doushu
 * six-field frontmatter (状态/平台/主题/创建/更新/星位) so that any reader —
 * Lingtai included — gets platform, title and dates without guessing from the
 * file name. The legacy lowercase keys (type/source/note_id/created/platform)
 * stay for backwards compatibility with cards and readers from v1.7.
 */
export function buildIdeaMarkdown(note, options = {}) {
  const platform = IDEA_PLATFORMS.includes(options.platform) ? options.platform : '全平台';
  const now = typeof options.now === 'number' ? options.now : Date.now();
  const created = formatLocalStamp(now);
  const bornAt = note && note.createdAt ? note.createdAt : now;
  const provenance = formatLocalStamp(bornAt);
  const noteId = note && note.id ? note.id : '';
  const text = note && typeof note.text === 'string' ? note.text : '';
  const title = ideaTitleOf(text) || '未命名想法';
  return [
    '---',
    '状态: 想法',
    '平台: ' + platform,
    '主题: ' + title,
    '创建: ' + formatLocalDate(bornAt),
    '更新: ' + formatLocalDate(now),
    '星位: 天枢',
    'type: idea',
    'source: 速记便签',
    'note_id: ' + noteId,
    'created: ' + created,
    'platform: ' + platform,
    '---',
    '',
    '> 来源：速记便签 ' + noteId + ' · ' + provenance,
    '',
    text,
    '',
  ].join('\n');
}

/** Convert one SQLite row into the camelCase record shared with the client. */
function toRecord(row) {
  if (row === undefined || row === null) return null;
  return {
    id: row.id,
    text: row.text,
    remindAt: row.remind_at === null || row.remind_at === undefined ? null : Number(row.remind_at),
    status: row.status,
    createdAt: Number(row.created_at),
    doneAt: row.done_at === null || row.done_at === undefined ? null : Number(row.done_at),
    source: row.source,
    promotedAt: row.promoted_at === null || row.promoted_at === undefined ? null : Number(row.promoted_at),
    promotedPath: row.promoted_path ?? null,
  };
}

/** Reject blank captures without altering the stored text. */
function requireText(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    const error = new Error('便签内容不能为空');
    error.status = 400;
    throw error;
  }
  return text;
}

/** Normalize an optional numeric timestamp. */
function optionalTimestamp(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

/**
 * Open (and initialize) the note database.
 *
 * @param options.dir - override the data directory (tests, migration).
 * @param options.dbPath - override the database file directly.
 * @param options.now - fixed clock used when generating ids (tests).
 */
export function createNoteStore(options = {}) {
  const dataDir = options.dir
    || (options.dbPath ? dirname(resolve(options.dbPath)) : resolveDataDir());
  mkdirSync(dataDir, { recursive: true });
  const dbPath = options.dbPath ? resolve(options.dbPath) : join(dataDir, 'notes.db');
  const db = new DatabaseSync(dbPath);

  db.exec([
    'CREATE TABLE IF NOT EXISTS notes (',
    '  id           TEXT PRIMARY KEY,',
    '  text         TEXT NOT NULL,',
    '  remind_at    INTEGER,',
    "  status       TEXT NOT NULL DEFAULT 'active',",
    '  created_at   INTEGER NOT NULL,',
    '  done_at      INTEGER,',
    "  source       TEXT NOT NULL DEFAULT 'web',",
    '  promoted_at  INTEGER,',
    '  promoted_path TEXT',
    ');',
    'CREATE INDEX IF NOT EXISTS idx_notes_status_remind ON notes(status, remind_at);',
  ].join('\n'));

  const getStatement = db.prepare('SELECT * FROM notes WHERE id = ?');
  const allStatement = db.prepare('SELECT * FROM notes ORDER BY (remind_at IS NULL), remind_at ASC, created_at DESC');
  const allLimitedStatement = db.prepare('SELECT * FROM notes ORDER BY (remind_at IS NULL), remind_at ASC, created_at DESC LIMIT ?');
  const statusStatement = db.prepare('SELECT * FROM notes WHERE status = ? ORDER BY (remind_at IS NULL), remind_at ASC, created_at DESC');
  const statusLimitedStatement = db.prepare('SELECT * FROM notes WHERE status = ? ORDER BY (remind_at IS NULL), remind_at ASC, created_at DESC LIMIT ?');
  const insertStatement = db.prepare([
    'INSERT INTO notes (id, text, remind_at, status, created_at, done_at, source, promoted_at, promoted_path)',
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ].join(' '));

  const store = {
    /** Absolute path of the opened database, handy for tests and logs. */
    path: dbPath,
    /** Raw handle for advanced callers (migration script). */
    db,

    /** Read one note by id, or null. */
    get(id) {
      return toRecord(getStatement.get(String(id)));
    },

    /** Use the original id when a migration replays a local snapshot. */
    has(id) {
      return getStatement.get(String(id)) !== undefined;
    },

    /**
     * List notes. `status` is one of active/done/dropped/all; `limit` caps the
     * rows. Ordering is reminder time ascending with unset reminders last.
     */
    list(query = {}) {
      const status = query.status === undefined || query.status === null || query.status === ''
        ? 'all'
        : String(query.status);
      if (status !== 'all' && !NOTE_STATUSES.includes(status)) {
        const error = new Error('未知的便签状态：' + status);
        error.status = 400;
        throw error;
      }
      const rawLimit = query.limit === undefined || query.limit === null || query.limit === ''
        ? null
        : Number(query.limit);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.trunc(rawLimit) : null;
      let rows;
      if (status === 'all') rows = limit === null ? allStatement.all() : allLimitedStatement.all(limit);
      else rows = limit === null ? statusStatement.all(status) : statusLimitedStatement.all(status, limit);
      return rows.map(toRecord);
    },

    /**
     * Create one note. Extra fields (`id`, `createdAt`, `status`, `doneAt`,
     * `promotedAt`, `promotedPath`) exist so the one-time local migration can
     * be lossless and idempotent; the HTTP API only documents the first three.
     */
    create(input = {}) {
      const text = requireText(input.text);
      const now = typeof options.now === 'number' ? options.now : Date.now();
      const id = typeof input.id === 'string' && input.id.trim() !== '' ? input.id.trim() : makeNoteId(now);
      const existing = store.get(id);
      if (existing !== null) return existing;

      const rawStatus = input.status === undefined ? 'active' : String(input.status);
      const status = NOTE_STATUSES.includes(rawStatus) ? rawStatus : 'active';
      const source = NOTE_SOURCES.includes(input.source) ? input.source : 'web';
      const remindAt = optionalTimestamp(input.remindAt);
      const createdAt = optionalTimestamp(input.createdAt) ?? now;
      let doneAt = optionalTimestamp(input.doneAt);
      if (status === 'done' && doneAt === null) doneAt = now;
      if (status !== 'done') doneAt = null;
      const promotedAt = optionalTimestamp(input.promotedAt);
      const promotedPath = typeof input.promotedPath === 'string' && input.promotedPath !== ''
        ? input.promotedPath
        : null;

      insertStatement.run(
        id, text, remindAt, status, createdAt, doneAt, source, promotedAt, promotedPath,
      );
      return store.get(id);
    },

    /**
     * Patch one note. Accepts `text`, `remindAt`, `status`, `doneAt` (the last
     * one only through the migration path). Returns the updated record or null.
     */
    update(id, patch = {}) {
      const current = store.get(id);
      if (current === null) return null;
      const sets = [];
      const values = [];

      if (Object.prototype.hasOwnProperty.call(patch, 'text')) {
        sets.push('text = ?');
        values.push(requireText(patch.text));
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'remindAt')) {
        sets.push('remind_at = ?');
        values.push(optionalTimestamp(patch.remindAt));
      }

      let nextStatus = current.status;
      if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
        const raw = String(patch.status);
        if (!NOTE_STATUSES.includes(raw)) {
          const error = new Error('未知的便签状态：' + raw);
          error.status = 400;
          throw error;
        }
        nextStatus = raw;
        sets.push('status = ?');
        values.push(raw);
      } else if (Object.prototype.hasOwnProperty.call(patch, 'done')) {
        nextStatus = patch.done === true ? 'done' : 'active';
        sets.push('status = ?');
        values.push(nextStatus);
      }

      if (nextStatus === 'done') {
        const explicitDoneAt = optionalTimestamp(patch.doneAt);
        if (explicitDoneAt !== null) {
          sets.push('done_at = ?');
          values.push(explicitDoneAt);
        } else if (current.status !== 'done' || current.doneAt === null) {
          sets.push('done_at = ?');
          values.push(Date.now());
        }
      } else if (current.status === 'done' || Object.prototype.hasOwnProperty.call(patch, 'status')) {
        sets.push('done_at = NULL');
      }

      if (sets.length === 0) return current;
      values.push(String(id));
      db.prepare('UPDATE notes SET ' + sets.join(', ') + ' WHERE id = ?').run(...values);
      return store.get(id);
    },

    /** Delete one note; true when a row was removed. */
    remove(id) {
      const result = db.prepare('DELETE FROM notes WHERE id = ?').run(String(id));
      return Number(result.changes) > 0;
    },

    /**
     * Promote one note into `00-收件箱` under the Lingtai root. The file is
     * written exactly once — failures are surfaced, never retried.
     */
    promote(id, options = {}) {
      const note = store.get(id);
      if (note === null) return null;
      const root = options.root ? resolve(options.root) : resolveIdeaRoot(options.settingsPath);
      if (!existsSync(root)) {
        const error = new Error('灵感根目录不存在：' + root);
        error.status = 500;
        throw error;
      }
      const inbox = join(root, '00-收件箱');
      mkdirSync(inbox, { recursive: true });
      const now = typeof options.now === 'number' ? options.now : Date.now();
      const fileName = '想法-' + compactMinute(now) + '-' + randomToken(6) + '.md';
      const filePath = join(inbox, fileName);
      const markdown = buildIdeaMarkdown(note, { platform: options.platform, now });
      writeFileSync(filePath, markdown, { encoding: 'utf8', flag: 'wx' });
      db.prepare('UPDATE notes SET promoted_at = ?, promoted_path = ? WHERE id = ?')
        .run(now, filePath, note.id);
      return {
        path: filePath,
        promotedAt: now,
        note: store.get(note.id),
      };
    },

    /** Close the database handle (host dispose). */
    close() {
      try {
        db.close();
      } catch (error) {
        /* already closed */
      }
    },
  };

  return store;
}

/** Parse the exported Markdown format (tests/export.test.mjs) into note seeds. */
export function parseExportMarkdown(markdown) {
  const text = String(markdown ?? '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const notes = [];
  let current = null;

  const finish = () => {
    if (current === null) return;
    const body = current.body.join('\n').replace(/\n+$/, '');
    if (body.trim() !== '') {
      notes.push({
        id: current.id || makeNoteId(current.createdAt),
        text: body,
        remindAt: current.remindAt,
        status: current.done ? 'done' : 'active',
        createdAt: current.createdAt,
        doneAt: current.doneAt,
      });
    }
    current = null;
  };

  const parseStamp = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/.exec(String(value).trim());
    if (match === null) return null;
    return new Date(
      Number(match[1]), Number(match[2]) - 1, Number(match[3]),
      Number(match[4]), Number(match[5]), 0, 0,
    ).getTime();
  };

  for (const line of lines) {
    const heading = /^###\s+\d+\.\s+(.+)$/.exec(line);
    if (heading !== null) {
      finish();
      const createdAt = parseStamp(heading[1]);
      if (createdAt === null) continue;
      current = { createdAt, id: null, remindAt: null, done: false, doneAt: null, body: [] };
      continue;
    }
    if (current === null) continue;
    if (/^##\s+/.test(line)) {
      finish();
      continue;
    }
    const meta = /^-\s*(编号|提醒|状态|完成)[:：]\s*(.*)$/.exec(line);
    if (meta !== null && current.body.length === 0) {
      const key = meta[1];
      const value = meta[2].trim();
      if (key === '编号') current.id = value || null;
      else if (key === '提醒') current.remindAt = parseStamp(value);
      else if (key === '状态') current.done = value === '已完成';
      else if (key === '完成') current.doneAt = parseStamp(value);
      continue;
    }
    if (line.startsWith('>')) {
      current.body.push(line.replace(/^>\s?/, ''));
      continue;
    }
    if (current.body.length > 0 && line.trim() === '') current.body.push('');
  }
  finish();
  return notes;
}

/** Allowed `/notes` query statuses. */
function normalizeStatus(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const status = String(value);
  return status === 'all' || NOTE_STATUSES.includes(status) ? status : null;
}

/** JSON response tuple used by the pure handler. */
function response(status, body) {
  return { status, body };
}

/** Loopback-only guard; an unknown peer is allowed (desktop local socket). */
function isLoopback(ip) {
  if (typeof ip !== 'string' || ip.trim() === '') return true;
  const value = ip.trim();
  return value === '127.0.0.1'
    || value === '::1'
    || value === 'localhost'
    || value === '::ffff:127.0.0.1'
    || value.startsWith('127.');
}

/** Lower-cased plain header bag from Node/WHATWG/Fetch header shapes. */
export function plainHeaders(value) {
  if (value === null || value === undefined || typeof value !== 'object') return {};
  if (typeof value.entries === 'function') {
    try {
      const out = {};
      for (const [key, item] of value.entries()) {
        out[String(key).toLowerCase()] = String(item);
      }
      return out;
    } catch (error) {
      return {};
    }
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null) continue;
    out[String(key).toLowerCase()] = Array.isArray(item) ? String(item[0]) : String(item);
  }
  return out;
}

/**
 * Browser-origin guard, independent of the host.
 *
 * A cross-site request carries an Origin header on its non-simple methods, so
 * an Origin that does not match the Host means the call came from a page other
 * than this app. Requests without Origin come from native clients (tests, curl,
 * the host itself) and stay allowed — the loopback check already covers them.
 */
export function isSameOrigin(headers) {
  const bag = plainHeaders(headers);
  const origin = bag.origin;
  if (origin === undefined || origin === '') return true;
  const host = bag.host;
  if (host === undefined || host === '') return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch (error) {
    return false;
  }
}

/**
 * Access check used by the mounted handler.
 *
 * DSH exposes `connection.requestRejection({ headers })` to plugins that mount
 * HTTP routes; it returns `undefined` when the request is same-origin and
 * logged in (same usage as lingtai's host half). When that service is not
 * available the handler falls back to the Origin/Host comparison, so a page on
 * another site still cannot drive the API from the user's browser.
 *
 * @param ctx - the cordis context this bundle was applied with.
 * @returns {(request: object) => (string|null)} null = allowed, string = denial reason.
 */
export function createAccessCheck(ctx) {
  return function access(request = {}) {
    let connection;
    try {
      connection = ctx !== null && ctx !== undefined && typeof ctx.get === 'function'
        ? ctx.get('connection')
        : undefined;
    } catch (error) {
      connection = undefined;
    }
    if (connection !== undefined && connection !== null
      && typeof connection.requestRejection === 'function') {
      try {
        const headers = plainHeaders(request.headers);
        return connection.requestRejection({ headers }) === undefined
          ? null
          : '请求被宿主的访问检查拒绝（需要同源且已登录）';
      } catch (error) {
        return '请求鉴权失败';
      }
    }
    return isSameOrigin(request.headers) ? null : '跨站请求被拒绝';
  };
}

/**
 * Pure HTTP handler shared by every route adapter. Input:
 * `{ method, pathname, query, body, ip, headers }`; output: `{ status, body }`.
 *
 * `options.access` stays optional so the handler is testable on its own; the
 * mounted app always passes `createAccessCheck(ctx)`. The loopback check runs
 * first and cannot be bypassed by it.
 */
export function createHttpHandler(store, options = {}) {
  const access = typeof options.access === 'function' ? options.access : null;
  return async function handle(request = {}) {
    const method = String(request.method || 'GET').toUpperCase();
    const pathname = String(request.pathname || '/');
    const query = request.query || {};
    const body = request.body !== null && typeof request.body === 'object' ? request.body : {};

    if (!isLoopback(request.ip)) return response(403, { error: '仅允许本机访问' });
    if (access !== null) {
      const denial = access(request);
      if (typeof denial === 'string' && denial !== '') return response(403, { error: denial });
    }
    if (pathname !== API_PREFIX && !pathname.startsWith(API_PREFIX + '/')) {
      return response(404, { error: '未知接口' });
    }
    const rest = pathname.slice(API_PREFIX.length) || '/';

    if (rest === '/about' && method === 'GET') {
      return response(200, { ok: true, name: 'scratchpad', storage: 'sqlite' });
    }

    if (rest === '/notes' || rest === '/notes/') {
      if (method === 'GET') {
        const status = normalizeStatus(query.status, 'active');
        if (status === null) return response(400, { error: '未知的便签状态' });
        let limit = null;
        if (query.limit !== undefined && query.limit !== '') {
          const parsed = Number(query.limit);
          if (!Number.isFinite(parsed) || parsed <= 0) return response(400, { error: 'limit 必须是正整数' });
          limit = Math.trunc(parsed);
        }
        return response(200, { notes: store.list({ status, limit }) });
      }
      if (method === 'POST') {
        try {
          const record = store.create({
            text: body.text,
            remindAt: body.remindAt,
            source: body.source === undefined ? 'web' : body.source,
            id: body.id,
            createdAt: body.createdAt,
            status: body.status,
            doneAt: body.doneAt,
            promotedAt: body.promotedAt,
            promotedPath: body.promotedPath,
          });
          return response(201, record);
        } catch (error) {
          return response(error.status || 400, { error: error.message });
        }
      }
      return response(405, { error: '方法不允许' });
    }

    const noteMatch = /^\/notes\/([^/]+)$/.exec(rest);
    if (noteMatch !== null) {
      const id = decodeURIComponent(noteMatch[1]);
      if (method === 'PATCH') {
        try {
          const patch = {};
          if (Object.prototype.hasOwnProperty.call(body, 'text')) patch.text = body.text;
          if (Object.prototype.hasOwnProperty.call(body, 'remindAt')) patch.remindAt = body.remindAt;
          if (Object.prototype.hasOwnProperty.call(body, 'status')) patch.status = body.status;
          if (Object.prototype.hasOwnProperty.call(body, 'done')) patch.done = body.done;
          if (Object.prototype.hasOwnProperty.call(body, 'doneAt')) patch.doneAt = body.doneAt;
          const record = store.update(id, patch);
          if (record === null) return response(404, { error: '便签不存在' });
          return response(200, record);
        } catch (error) {
          return response(error.status || 400, { error: error.message });
        }
      }
      if (method === 'DELETE') {
        const removed = store.remove(id);
        if (!removed) return response(404, { error: '便签不存在' });
        return response(200, { ok: true, id });
      }
      return response(405, { error: '方法不允许' });
    }

    const promoteMatch = /^\/notes\/([^/]+)\/promote$/.exec(rest);
    if (promoteMatch !== null) {
      if (method !== 'POST') return response(405, { error: '方法不允许' });
      const id = decodeURIComponent(promoteMatch[1]);
      try {
        // The idea root is resolved from ~/.dsh/lingtai/settings.json only;
        // HTTP callers may not redirect the write outside that directory.
        const result = store.promote(id, { platform: body.platform });
        if (result === null) return response(404, { error: '便签不存在' });
        return response(200, result);
      } catch (error) {
        return response(error.status || 500, { error: error.message });
      }
    }

    return response(404, { error: '未知接口' });
  };
}

/** Read a Node request body as JSON (bodyparser-less fallback). */
function readNodeBody(req) {
  return new Promise((resolveBody) => {
    if (req === null || typeof req.on !== 'function') {
      resolveBody({});
      return;
    }
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 5 * 1024 * 1024) data = data.slice(0, 5 * 1024 * 1024);
    });
    req.on('end', () => {
      try {
        resolveBody(data === '' ? {} : JSON.parse(data));
      } catch (error) {
        resolveBody({});
      }
    });
    req.on('error', () => resolveBody({}));
  });
}

/** Coerce a route target's body into a plain object. */
async function ensureBody(candidate) {
  if (candidate !== null && typeof candidate === 'object') return candidate;
  if (typeof candidate === 'string' && candidate !== '') {
    try {
      const parsed = JSON.parse(candidate);
      return parsed !== null && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }
  return {};
}

/** Query object from a URL, tolerating URLSearchParams-shaped inputs. */
function queryOf(value) {
  if (value === undefined || value === null) return {};
  if (typeof value === 'object' && typeof value.entries === 'function') {
    return Object.fromEntries(value.entries());
  }
  if (typeof value === 'object') return { ...value };
  return {};
}

/**
 * One callback shape that works for Koa-router, Express, Hono and raw Node
 * http handlers, so the host can hand us whichever server service it exposes.
 */
function createRouteCallback(handler) {
  return async function scratchpadRoute(first, second) {
    // Hono / Fetch-style context: c.req + c.json.
    if (first !== null && typeof first === 'object'
      && first.req !== undefined && typeof first.json === 'function') {
      const request = first.req;
      const url = new URL(request.url);
      let body = {};
      if (String(request.method).toUpperCase() !== 'GET' && String(request.method).toUpperCase() !== 'HEAD') {
        try {
          body = await request.json();
        } catch (error) {
          body = {};
        }
      }
      const result = await handler({
        method: request.method,
        pathname: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body: await ensureBody(body),
        ip: typeof request.header === 'function' ? request.header('x-forwarded-for') : '',
        headers: plainHeaders(request.headers),
      });
      return first.json(result.body, result.status);
    }

    // Raw Node http: (req, res).
    if (first !== null && typeof first === 'object' && first.socket !== undefined
      && second !== null && typeof second === 'object'
      && typeof second.setHeader === 'function' && typeof second.end === 'function') {
      const url = new URL(first.url || '/', 'http://127.0.0.1');
      let body = first.body;
      if (body === undefined && String(first.method).toUpperCase() !== 'GET' && String(first.method).toUpperCase() !== 'HEAD') {
        body = await readNodeBody(first);
      }
      const result = await handler({
        method: first.method,
        pathname: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body: await ensureBody(body),
        ip: first.socket && first.socket.remoteAddress ? first.socket.remoteAddress : '',
        headers: plainHeaders(first.headers),
      });
      second.statusCode = result.status;
      second.setHeader('content-type', 'application/json; charset=utf-8');
      second.end(JSON.stringify(result.body));
      return;
    }

    // Express: (req, res).
    if (first !== null && typeof first === 'object'
      && second !== null && typeof second === 'object'
      && typeof second.json === 'function' && typeof first.setHeader !== 'function') {
      const url = new URL(first.originalUrl || first.url || '/', 'http://127.0.0.1');
      const result = await handler({
        method: first.method,
        pathname: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body: await ensureBody(first.body),
        ip: first.ip || (first.socket && first.socket.remoteAddress) || '',
        headers: plainHeaders(first.headers),
      });
      second.status(result.status).json(result.body);
      return;
    }

    // Koa: (ctx, next).
    if (first !== null && typeof first === 'object' && (first.request !== undefined || first.req !== undefined)) {
      const request = first.request || {};
      const raw = first.req;
      const url = new URL(first.originalUrl || first.url || request.url || '/', 'http://127.0.0.1');
      let body = request.body;
      if (body === undefined && raw !== undefined && raw !== null
        && String(first.method || request.method || 'GET').toUpperCase() !== 'GET') {
        body = typeof raw.readableEnded === 'boolean' && raw.readableEnded ? {} : await readNodeBody(raw);
      }
      const result = await handler({
        method: first.method || request.method || 'GET',
        pathname: url.pathname,
        query: queryOf(first.query) && Object.keys(queryOf(first.query)).length > 0
          ? queryOf(first.query)
          : Object.fromEntries(url.searchParams),
        body: await ensureBody(body),
        ip: first.ip || request.ip || (raw && raw.socket ? raw.socket.remoteAddress : ''),
        headers: plainHeaders(request.headers),
      });
      first.status = result.status;
      first.body = result.body;
      return;
    }

    throw new Error('scratchpad: 不支持的路由上下文');
  };
}

/** Candidate host services that can mount HTTP routes. */
function serviceCandidates(ctx, names) {
  const found = [];
  for (const name of names) {
    try {
      if (ctx !== null && ctx !== undefined && typeof ctx.get === 'function') {
        const service = ctx.get(name);
        if (service !== null && service !== undefined) found.push(service);
      }
    } catch (error) {
      /* service not available */
    }
    try {
      const service = ctx === null || ctx === undefined ? undefined : ctx[name];
      if (service !== null && service !== undefined) found.push(service);
    } catch (error) {
      /* property access can throw on exotic contexts */
    }
  }
  return [...new Set(found)];
}

/**
 * Mount the five endpoints on whichever server service the host provides.
 * Returns the service that accepted them, or null.
 */
export function registerRoutes(ctx, handler) {
  const callback = createRouteCallback(handler);
  const services = serviceCandidates(ctx, ['webServer', 'server', 'router', 'http', 'web', 'app', 'httpServer']);
  for (const service of services) {
    // This host mounts plugin HTTP through `webServer.register({ kind: 'prefix' })`;
    // work-assistant and lingtai-guanxingtai both use exactly this shape.
    if (typeof service.register === 'function' && typeof service.get !== 'function') {
      try {
        service.register({ kind: 'prefix', path: API_PREFIX, handler: callback });
        return service;
      } catch (error) {
        /* fall through to the router-shaped candidates */
      }
    }
    const canMountMethods = typeof service.get === 'function'
      && typeof service.post === 'function'
      && typeof service.patch === 'function'
      && typeof service.delete === 'function';
    if (canMountMethods) {
      try {
        service.get(API_PREFIX + '/about', callback);
        service.get(API_PREFIX + '/notes', callback);
        service.post(API_PREFIX + '/notes', callback);
        service.patch(API_PREFIX + '/notes/:id', callback);
        service.delete(API_PREFIX + '/notes/:id', callback);
        service.post(API_PREFIX + '/notes/:id/promote', callback);
        return service;
      } catch (error) {
        /* try the next candidate */
      }
    }
    if (typeof service.route === 'function') {
      try {
        service.route(API_PREFIX, callback);
        return service;
      } catch (error) {
        /* try the next candidate */
      }
    }
  }
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn('[scratchpad] 未找到可挂载的宿主路由服务；HTTP 接口未注册。');
  }
  return null;
}

/** Shared tool result shape for the three model tools. */
function toolOutput(description, properties) {
  return {
    schema: {
      type: 'object',
      description,
      properties,
      additionalProperties: true,
    },
    // Host contract: render(args, value) must return content parts (array),
    // the executor calls `.some(...)` on it — returning a bare string crashes
    // with "content.some is not a function".
    render(_args, value) {
      const result = value && typeof value === 'object' && value.result !== undefined
        ? value.result
        : value;
      return [{ type: 'text', text: renderText(result) }];
    },
  };
}

function renderText(result) {
  if (result === null || result === undefined || typeof result !== 'object') return String(result ?? '');
  if (Array.isArray(result.notes)) {
    if (result.notes.length === 0) return '没有符合条件的便签。';
    return result.notes.map((note) => {
      const when = note.remindAt === null || note.remindAt === undefined
        ? '不提醒'
        : formatLocalStamp(note.remindAt);
      return '[' + note.id + '] ' + when + ' · ' + note.text;
    }).join('\n');
  }
  if (typeof result.path === 'string' && result.path !== '') {
    return '已投递到灵感：' + result.path;
  }
  if (typeof result.id === 'string') {
    const when = result.remindAt === null || result.remindAt === undefined
      ? '不提醒'
      : formatLocalStamp(result.remindAt);
    return '已记下（' + result.id + '，' + when + '）：' + result.text;
  }
  return JSON.stringify(result);
}

/** Drop null/undefined fields: the holder rejects nullable JSON types in schemas. */
function compactNull(value) {
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null || item === undefined) continue;
    out[key] = item;
  }
  return out;
}

/** Three model tools; no `@deepseek-ai/dsh-tools` dependency. */
export function createTools(store) {
  return [
    {
      name: 'note_add',
      description: '记录一条速记便签。这是用户的速记便签，记灵感和待办用，不是工作账本；原文照录，不要改写。提醒时间用毫秒时间戳传入，没有就不传。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '便签原文，逐字保存' },
          remindAt: { type: 'number', description: '提醒时间（毫秒时间戳），可省略' },
        },
        required: ['text'],
        additionalProperties: false,
      },
      output: toolOutput('新建的便签记录', {
        id: { type: 'string' },
        text: { type: 'string' },
        remindAt: { type: 'number', description: '提醒时间（毫秒时间戳）；无提醒时不返回该字段' },
        status: { type: 'string' },
        createdAt: { type: 'number' },
      }),
      async execute(args = {}) {
        const record = store.create({
          text: args.text,
          remindAt: args.remindAt,
          source: 'im',
        });
        return compactNull({
          id: record.id,
          text: record.text,
          remindAt: record.remindAt,
          status: record.status,
          createdAt: record.createdAt,
        });
      },
    },
    {
      name: 'note_list',
      description: '列出用户的速记便签（记灵感和待办用，不是工作账本）。默认只列进行中的便签，按提醒时间升序。',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'done', 'dropped', 'all'],
            description: '筛选状态，默认 active',
          },
          limit: { type: 'number', description: '最多返回条数，默认 20' },
        },
        additionalProperties: false,
      },
      output: toolOutput('符合条件的便签列表', {
        notes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              text: { type: 'string' },
              remindAt: { type: 'number', description: '提醒时间（毫秒时间戳）；无提醒时不返回该字段' },
              status: { type: 'string' },
              createdAt: { type: 'number' },
            },
          },
        },
        count: { type: 'number' },
      }),
      async execute(args = {}) {
        const status = args.status === undefined || args.status === null ? 'active' : String(args.status);
        if (status !== 'all' && !NOTE_STATUSES.includes(status)) {
          const error = new Error('未知的便签状态：' + status);
          error.status = 400;
          throw error;
        }
        const rawLimit = args.limit === undefined || args.limit === null ? 20 : Number(args.limit);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.trunc(rawLimit) : 20;
        const notes = store.list({ status, limit }).map((note) => compactNull({
          id: note.id,
          text: note.text,
          remindAt: note.remindAt,
          status: note.status,
          createdAt: note.createdAt,
        }));
        return { notes, count: notes.length };
      },
    },
    {
      name: 'note_promote',
      description: '把一条速记便签投递成灵感卡片，写入灵台根目录的 00-收件箱。这是用户的速记便签，记灵感和待办用，不是工作账本；只投递指定的一张，不重试。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '便签 id（note-…）' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      output: toolOutput('投递结果', {
        path: { type: 'string' },
        promotedAt: { type: 'number' },
      }),
      async execute(args = {}) {
        const result = store.promote(args.id);
        if (result === null) {
          const error = new Error('便签不存在：' + args.id);
          error.status = 404;
          throw error;
        }
        return { path: result.path, promotedAt: result.promotedAt };
      },
    },
  ];
}

/** Register the tools through whichever tool registry the host exposes. */
export function registerTools(ctx, tools) {
  // Primary path on this host: `ctx.tools.register(tool)` (same as qiaomu-rss-dsh).
  const direct = ctx === null || ctx === undefined ? undefined : ctx.tools;
  if (direct !== null && direct !== undefined && typeof direct.register === 'function') {
    for (const tool of tools) direct.register(tool);
    return direct;
  }
  const registries = serviceCandidates(ctx, ['tools', 'modelTools', 'toolbox', 'toolRegistry']);
  for (const registry of registries) {
    for (const method of ['register', 'add', 'define', 'use']) {
      if (typeof registry[method] === 'function') {
        try {
          for (const tool of tools) registry[method](tool);
          return registry;
        } catch (error) {
          /* try another registry/method */
        }
      }
    }
  }
  if (typeof ctx.registerTool === 'function') {
    for (const tool of tools) ctx.registerTool(tool);
    return ctx;
  }
  if (typeof ctx.tool === 'function') {
    for (const tool of tools) ctx.tool(tool);
    return ctx;
  }
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn('[scratchpad] 未找到模型工具注册服务；note_add / note_list / note_promote 未注册。');
  }
  return null;
}

/** Host plugin entry: one store, five routes, three tools. */
export function apply(ctx) {
  const store = createNoteStore();
  // The access check is bound to this ctx so it can reach the host's
  // connection service; it is the CSRF half of the guard, the handler's own
  // loopback check is the network half.
  const handler = createHttpHandler(store, { access: createAccessCheck(ctx) });
  const tools = createTools(store);

  // Routes MUST be mounted from inside ctx.inject(['webServer']): reading
  // ctx.webServer outside a declared dependency makes cordis' reflection proxy
  // throw "cannot get property without inject" (work-assistant hit exactly this
  // and lost its routes). Declaring `inject` above covers the tools service.
  let mountedRoutes = null;
  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['webServer'], (injected) => {
        const result = registerRoutes(injected, handler);
        if (result === null) registerRoutes(ctx, handler);
        return result;
      });
    } catch (error) {
      mountedRoutes = registerRoutes(ctx, handler);
    }
  } else {
    mountedRoutes = registerRoutes(ctx, handler);
  }
  const mountedTools = registerTools(ctx, tools);
  if (mountedTools === null && typeof ctx.inject === 'function') {
    try {
      ctx.inject(['tools'], (injected) => registerTools(injected, tools));
    } catch (error) {
      /* no injectable tool registry */
    }
  }

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => () => store.close(), 'scratchpad: close sqlite');
  }
  return { store, handler, tools };
}
