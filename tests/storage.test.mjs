/**
 * Host storage checks: SQLite schema, CRUD, status transitions and the five
 * HTTP endpoints. Runs fully offline against a temporary database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createNoteStore,
  createHttpHandler,
  createAccessCheck,
  createTools,
  makeNoteId,
  parseExportMarkdown,
  API_PREFIX,
} from '../index.js';

function tempStore(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-scratchpad-store-'));
  const store = createNoteStore({ dir, now: Date.UTC(2026, 10, 13, 6, 0, 0) });
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return store;
}

function call(handler, method, path, body, query = {}) {
  return handler({
    method,
    pathname: API_PREFIX + path,
    query,
    body: body || {},
    ip: '127.0.0.1',
  });
}

test('ids follow note-yyyymmdd-random and the table accepts verbatim text', (t) => {
  const store = tempStore(t);
  const id = makeNoteId(Date.UTC(2026, 10, 13));
  assert.match(id, /^note-\d{8}-[0-9a-z]{6}$/);

  const text = '  第一行\n第二行：原样保存  ';
  const note = store.create({ text, remindAt: 1893456000000 });
  assert.equal(note.text, text, 'text must be stored verbatim');
  assert.equal(note.status, 'active');
  assert.equal(note.source, 'web');
  assert.equal(note.remindAt, 1893456000000);
});

test('list filters by status and orders reminders ascending', (t) => {
  const store = tempStore(t);
  const late = store.create({ text: '晚一点', remindAt: 3000 });
  const early = store.create({ text: '早一点', remindAt: 1000 });
  const none = store.create({ text: '不提醒', remindAt: null });
  store.create({ text: '已完成', status: 'done' });

  const active = store.list({ status: 'active' });
  assert.deepEqual(active.map((note) => note.id), [early.id, late.id, none.id]);
  assert.equal(store.list({ status: 'done' }).length, 1);
  assert.equal(store.list({ status: 'all' }).length, 4);
  assert.equal(store.list({ status: 'active', limit: 1 }).length, 1);
});

test('update moves status and maintains done_at; remove deletes', (t) => {
  const store = tempStore(t);
  const note = store.create({ text: '要完成的事' });
  const done = store.update(note.id, { status: 'done' });
  assert.equal(done.status, 'done');
  assert.ok(typeof done.doneAt === 'number');

  const undone = store.update(note.id, { status: 'active' });
  assert.equal(undone.status, 'active');
  assert.equal(undone.doneAt, null);

  const retitled = store.update(note.id, { text: '改过的原文', remindAt: 1234 });
  assert.equal(retitled.text, '改过的原文');
  assert.equal(retitled.remindAt, 1234);

  assert.equal(store.remove(note.id), true);
  assert.equal(store.get(note.id), null);
  assert.equal(store.remove(note.id), false);
});

test('the five HTTP endpoints answer with the shared record shape', async (t) => {
  const store = tempStore(t);
  const handler = createHttpHandler(store);

  const created = await call(handler, 'POST', '/notes', { text: '手机记一条', remindAt: 5000 });
  assert.equal(created.status, 201);
  assert.equal(created.body.text, '手机记一条');
  assert.equal(created.body.remindAt, 5000);
  assert.equal(created.body.source, 'web');

  const listed = await call(handler, 'GET', '/notes', null, { status: 'all' });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.notes.length, 1);

  const patched = await call(handler, 'PATCH', '/notes/' + created.body.id, { status: 'done' });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.status, 'done');

  const promoted = await call(handler, 'DELETE', '/notes/' + created.body.id);
  assert.equal(promoted.status, 200);
  assert.equal(promoted.body.ok, true);

  const missing = await call(handler, 'PATCH', '/notes/note-missing', { text: 'x' });
  assert.equal(missing.status, 404);
});

test('the HTTP layer rejects blank text and non-loopback callers', async (t) => {
  const store = tempStore(t);
  const handler = createHttpHandler(store);

  const blank = await call(handler, 'POST', '/notes', { text: '   ' });
  assert.equal(blank.status, 400);

  const remote = await handler({
    method: 'GET',
    pathname: API_PREFIX + '/notes',
    query: {},
    body: {},
    ip: '10.0.0.8',
  });
  assert.equal(remote.status, 403);
});

test('the access check blocks cross-site browser calls and defers to the host', async (t) => {
  const store = tempStore(t);

  // Without a connection service the Origin/Host fallback decides.
  const fallback = createHttpHandler(store, { access: createAccessCheck(null) });

  const crossSiteWrite = await fallback({
    method: 'POST',
    pathname: API_PREFIX + '/notes',
    query: {},
    body: { text: '来自别的网站' },
    ip: '127.0.0.1',
    headers: { host: '127.0.0.1:52497', origin: 'https://evil.example' },
  });
  assert.equal(crossSiteWrite.status, 403, 'a page on another origin must not write notes');
  assert.equal(store.list({ status: 'all' }).length, 0, 'the rejected write must not reach the store');

  const sameOrigin = await fallback({
    method: 'GET',
    pathname: API_PREFIX + '/notes',
    query: {},
    body: {},
    ip: '127.0.0.1',
    headers: { host: '127.0.0.1:52497', origin: 'http://127.0.0.1:52497' },
  });
  assert.equal(sameOrigin.status, 200);

  const nativeClient = await fallback({
    method: 'GET',
    pathname: API_PREFIX + '/notes',
    query: {},
    body: {},
    ip: '127.0.0.1',
    headers: {},
  });
  assert.equal(nativeClient.status, 200, 'no Origin means a native client, which stays allowed');

  // When the host exposes connection.requestRejection, its verdict wins.
  const seen = [];
  const ctx = {
    get(name) {
      if (name !== 'connection') return undefined;
      return {
        requestRejection({ headers }) {
          seen.push(headers);
          return headers['x-block'] === '1' ? new Error('blocked') : undefined;
        },
      };
    },
  };
  const hosted = createHttpHandler(store, { access: createAccessCheck(ctx) });
  const allowed = await hosted({
    method: 'GET', pathname: API_PREFIX + '/about', query: {}, body: {}, ip: '127.0.0.1', headers: { host: '127.0.0.1:52497' },
  });
  assert.equal(allowed.status, 200);
  const denied = await hosted({
    method: 'GET', pathname: API_PREFIX + '/about', query: {}, body: {}, ip: '127.0.0.1', headers: { 'x-block': '1' },
  });
  assert.equal(denied.status, 403);
  assert.equal(seen.length, 2, 'every request must go through the host check');

  // The loopback guard still runs first and keeps its own message.
  const remote = await hosted({
    method: 'GET', pathname: API_PREFIX + '/about', query: {}, body: {}, ip: '10.0.0.8', headers: {},
  });
  assert.equal(remote.status, 403);
  assert.equal(remote.body.error, '仅允许本机访问');
});

test('model tools expose the six required fields and share the store', async (t) => {  const store = tempStore(t);
  const tools = createTools(store);
  assert.deepEqual(tools.map((tool) => tool.name), ['note_add', 'note_list', 'note_promote']);
  for (const tool of tools) {
    assert.equal(typeof tool.name, 'string');
    assert.equal(typeof tool.description, 'string');
    assert.equal(typeof tool.parameters, 'object');
    assert.equal(typeof tool.output.schema, 'object');
    assert.equal(typeof tool.output.render, 'function');
    assert.equal(typeof tool.execute, 'function');
    assert.ok(tool.description.includes('不是工作账本'), 'the ledger disclaimer must be explicit');
  }

  const added = await tools[0].execute({ text: '手机记下的灵感', remindAt: 6000 });
  assert.equal(added.text, '手机记下的灵感');
  assert.equal(added.remindAt, 6000);
  assert.equal(store.get(added.id).source, 'im', 'note_add stores source=im');

  const listed = await tools[1].execute({});
  assert.equal(listed.count, 1);
  assert.equal(listed.notes[0].id, added.id);
  // Host contract: render(args, value) returns content parts (array of blocks).
  const parts = tools[0].output.render({}, added);
  assert.ok(Array.isArray(parts), 'render must return content parts, not a bare string');
  assert.ok(parts.some((part) => part.type === 'text' && part.text.includes('手机记下的灵感')));
});

test('parseExportMarkdown reads the Markdown export format', () => {
  const markdown = [
    '## 进行中（1）',
    '',
    '### 1. 2026-11-11 09:00',
    '- 编号：n-a',
    '- 提醒：2026-11-12 15:00',
    '- 状态：进行中',
    '',
    '> 第一行',
    '> 第二行',
    '',
    '## 已完成（1）',
    '',
    '### 2. 2026-11-09 08:00',
    '- 编号：n-b',
    '- 状态：已完成',
    '- 完成：2026-11-10 08:20',
    '',
    '> 旧便签',
    '',
  ].join('\n');

  const notes = parseExportMarkdown(markdown);
  assert.equal(notes.length, 2);
  assert.equal(notes[0].id, 'n-a');
  assert.equal(notes[0].text, '第一行\n第二行');
  assert.equal(notes[0].status, 'active');
  assert.equal(notes[0].remindAt, new Date(2026, 10, 12, 15, 0, 0, 0).getTime());
  assert.equal(notes[1].id, 'n-b');
  assert.equal(notes[1].status, 'done');
  assert.ok(typeof notes[1].doneAt === 'number');
});

test('promote writes exactly one Markdown file into the idea inbox', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-scratchpad-promote-'));
  const root = join(dir, 'Creator');
  mkdirSync(root, { recursive: true });
  const settings = join(dir, 'settings.json');
  writeFileSync(settings, JSON.stringify({ root }), 'utf8');
  process.env.DSH_LINGTAI_SETTINGS = settings;

  const store = createNoteStore({ dir: join(dir, 'data') });
  t.after(() => {
    store.close();
    delete process.env.DSH_LINGTAI_SETTINGS;
    rmSync(dir, { recursive: true, force: true });
  });

  const note = store.create({ text: '第一行\n第二行原话', createdAt: Date.UTC(2026, 10, 13, 6, 0, 0) });
  const handler = createHttpHandler(store);
  const response = await call(handler, 'POST', '/notes/' + note.id + '/promote', { platform: '小红书' });

  assert.equal(response.status, 200);
  assert.ok(response.body.path.startsWith(join(root, '00-收件箱')));
  assert.equal(existsSync(response.body.path), true);

  const markdown = readFileSync(response.body.path, 'utf8');
  // Doushu six-field frontmatter comes first, in the documented order.
  assert.ok(markdown.startsWith('---\n状态: 想法\n平台: 小红书\n主题: 第一行\n'));
  assert.ok(/^创建: 2026-11-13$/m.test(markdown), '创建 uses the note birth date');
  assert.ok(/^更新: \d{4}-\d{2}-\d{2}$/m.test(markdown), '更新 uses the promotion date');
  assert.ok(markdown.includes('\n星位: 天枢\n'));
  // Legacy lowercase keys stay for readers written against v1.7 cards.
  assert.ok(markdown.includes('\ntype: idea\n'));
  assert.ok(markdown.includes('\nsource: 速记便签\n'));
  assert.ok(markdown.includes('note_id: ' + note.id));
  assert.ok(markdown.includes('\nplatform: 小红书\n'));
  assert.ok(markdown.includes('> 来源：速记便签 ' + note.id + ' · '));
  assert.ok(markdown.includes('第一行\n第二行原话'));

  const reloaded = store.get(note.id);
  assert.equal(reloaded.promotedPath, response.body.path);
  assert.ok(typeof reloaded.promotedAt === 'number');
});
