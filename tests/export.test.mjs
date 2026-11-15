/**
 * Markdown export checks: file name, frontmatter, section order, verbatim
 * blockquotes, empty state, and the download hand-off (success and blocked).
 * Runs fully offline against the module's test surface.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');

const NOTES_KEY = 'dsh-plugin-scratchpad/notes/v2';
const PREFS_KEY = 'dsh-plugin-scratchpad/prefs/v1';
const store = new Map();
store.set(NOTES_KEY, JSON.stringify([]));
store.set(PREFS_KEY, JSON.stringify({ notify: false, snoozeMinutes: 10, hudCorner: 'bottom', doneSort: 'createdAt', ideaBase: '/lingtai-guanxingtai' }));

const clicked = [];
const windowStub = {
  __DSH_NOTES_TEST__: true,
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  },
  setTimeout: () => 1,
  clearTimeout: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
  Blob: class BlobStub {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options ? options.type : '';
    }
  },
  URL: {
    createObjectURL: () => 'blob:notes-export',
    revokeObjectURL: () => {},
  },
  document: {
    createElement: () => ({
      style: {},
      click: () => clicked.push('click'),
    }),
    body: { appendChild: () => {}, removeChild: () => {} },
  },
};

const documentStub = {
  querySelector: () => null,
  createElement: () => ({ dataset: {}, textContent: '' }),
  head: { appendChild: () => {} },
};

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children } }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: (value) => ({ current: value }),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
};

const definitions = [];
const loaderWindow = { ...windowStub, __ModuleLoader__: { load: (definition) => definitions.push(definition) } };
const evaluate = new Function('window', 'document', 'Notification', 'require', source);
evaluate(loaderWindow, documentStub, class NotificationStub {}, (name) => {
  if (name === 'react') return fakeReact;
  throw new Error('unexpected module require: ' + name);
});
assert.equal(definitions.length, 1, 'exactly one module definition must be loaded');
const api = definitions[0].factory((name) => {
  if (name === 'react') return fakeReact;
  throw new Error('unexpected module require: ' + name);
}).__test;
assert.ok(api, 'test surface must be exposed under the test flag');

const stamp = new Date(2026, 10, 11, 9, 5, 0, 0).getTime();

// Stamps, file name and quoting.
assert.equal(api.exportDateTime(stamp), '2026-11-11 09:05');
assert.equal(api.exportFileName(stamp), '2026-11-11_速记便签.md');
assert.equal(api.quoteNoteText('第一行\n第二行'), '> 第一行\n> 第二行');
assert.equal(api.quoteNoteText(''), '> ');

const notes = [
  { id: 'n-a', text: '明天下午3点 交周报\n记得带上数据', remindAt: new Date(2026, 10, 12, 15, 0).getTime(), createdAt: new Date(2026, 10, 11, 9, 0).getTime(), done: false, doneAt: null },
  { id: 'n-b', text: '随手记：看一期关于灵台的视频', remindAt: null, createdAt: new Date(2026, 10, 10, 21, 30).getTime(), done: false, doneAt: null },
  { id: 'n-c', text: '已完成的旧便签', remindAt: null, createdAt: new Date(2026, 10, 9, 8, 0).getTime(), done: true, doneAt: new Date(2026, 10, 10, 8, 20).getTime() },
];

const markdown = api.buildNotesMarkdown(notes, stamp);
const lines = markdown.split('\n');

// Frontmatter carries the honest counts and does not claim a content status.
assert.equal(lines[0], '---');
assert.ok(markdown.includes('类型: 速记导出'));
assert.ok(markdown.includes('来源: 速记便签'));
assert.ok(markdown.includes('日期: 2026-11-11'));
assert.ok(markdown.includes('导出: 2026-11-11 09:05'));
assert.ok(markdown.includes('条数: 3（进行中 2 / 已完成 1）'));
assert.ok(!markdown.includes('状态: 想法'), 'export must not invent a content status');

// Active notes first, finished records after them; numbering continues.
const activeAt = markdown.indexOf('## 进行中（2）');
const doneAt = markdown.indexOf('## 已完成（1）');
assert.ok(activeAt >= 0 && doneAt > activeAt, 'active section must come before the done section');
assert.ok(markdown.includes('### 1. 2026-11-11 09:00'));
assert.ok(markdown.includes('### 2. 2026-11-10 21:30'));
assert.ok(markdown.includes('### 3. 2026-11-09 08:00'));

// Metadata bullets: reminder only when present, completion only when done.
assert.ok(markdown.includes('- 提醒：2026-11-12 15:00'));
assert.equal((markdown.match(/- 提醒：/g) || []).length, 1, 'only the note with a reminder gets that line');
assert.ok(markdown.includes('- 完成：2026-11-10 08:20'));
assert.ok(markdown.includes('- 编号：n-c'));

// Verbatim text survives as a blockquote, one line each.
assert.ok(markdown.includes('> 明天下午3点 交周报\n> 记得带上数据'));

// Empty list still produces a valid, readable file.
const empty = api.buildNotesMarkdown([], stamp);
assert.ok(empty.includes('条数: 0（进行中 0 / 已完成 0）'));
assert.ok(empty.includes('（没有进行中的速记，也没有已完成记录）'));

// Download hand-off: true when the browser flow exists, false when it throws.
assert.equal(api.downloadMarkdown('# hi', 'a.md'), true);
assert.equal(clicked.length, 1, 'the anchor must be clicked once');
const savedBlob = loaderWindow.Blob;
loaderWindow.Blob = undefined;
assert.equal(api.downloadMarkdown('# hi', 'a.md'), false);
loaderWindow.Blob = savedBlob;

console.log('export: ok');
