/**
 * Idea promotion checks: title hygiene (B2), the provenance line (B1), the
 * platform enum, the endpoint preference, and the ideaPath round-trip through
 * localStorage. Runs fully offline; no fetch is exercised here.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');

const now = Date.now();
const NOTES_KEY = 'dsh-plugin-scratchpad/notes/v2';
const PREFS_KEY = 'dsh-plugin-scratchpad/prefs/v1';
const store = new Map();
store.set(NOTES_KEY, JSON.stringify([
  {
    id: 'n-kept', text: '保留来源的便签', title: '保留来源的便签', remindAt: null, createdAt: now, done: false,
    doneAt: null, notifiedAt: null, ideaPath: '00-收件箱/2026-11-10_想法_保留来源的便签.md', promotedAt: now,
  },
  { id: 'n-plain', text: '没有投递字段的旧便签', title: '旧便签', remindAt: null, createdAt: now, done: true, doneAt: now, notifiedAt: null },
]));

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
const plugin = definitions[0].factory((name) => {
  if (name === 'react') return fakeReact;
  throw new Error('unexpected module require: ' + name);
});
const api = plugin.__test;
assert.ok(api, 'test surface must be exposed under the test flag');

// B2: characters that break the Doushu frontmatter are stripped, newlines
// collapse, a leading dash is dropped and the title is capped at 40 characters.
// The full-width colon (：) is YAML-safe and is intentionally kept.
assert.equal(api.sanitizeIdeaTitle('DSH#1 插件：便签'), 'DSH 1 插件：便签');
assert.equal(api.sanitizeIdeaTitle('多行\n第二行'), '多行 第二行');
assert.equal(api.sanitizeIdeaTitle('- 开头横杠'), '开头横杠');
assert.equal(api.sanitizeIdeaTitle('a[b]{c}|d?e"f<g>h!i:j'), 'a b c d e f g h i j');
assert.equal(api.sanitizeIdeaTitle('长'.repeat(60)).length, 40);
assert.equal(api.sanitizeIdeaTitle('   '), '');

// B1: the body starts with the provenance line, the raw note follows untouched.
const note = { id: 'n-abc', text: '第一行\n第二行原话', createdAt: now };
const body = api.buildIdeaBody(note);
assert.match(body, /^> 来源：速记便签 n-abc · \d{4}-\d{2}-\d{2} \d{2}:\d{2}\n/);
assert.ok(body.endsWith('\n第一行\n第二行原话'), 'the raw note must follow the provenance line');
assert.equal(api.firstLine(note.text), '第一行');

// Platforms are fixed Doushu field values.
assert.deepEqual(api.IDEA_PLATFORMS, ['全平台', '抖音', '小红书']);

// The endpoint prefix defaults to the observatory and persists through prefs.
assert.equal(api.getPrefs().ideaBase, '/lingtai-guanxingtai');
api.savePrefs({ ideaBase: '/my-ideas/' });
assert.equal(api.getPrefs().ideaBase, '/my-ideas');
assert.equal(JSON.parse(store.get(PREFS_KEY)).ideaBase, '/my-ideas');
assert.equal(api.normalizeIdeaBase('x/y//'), '/x/y');
assert.equal(api.normalizeIdeaBase(''), '/lingtai-guanxingtai');

// ideaPath survives the storage round-trip and defaults cleanly.
const kept = api.getNotes().find((item) => item.id === 'n-kept');
const plain = api.getNotes().find((item) => item.id === 'n-plain');
assert.equal(kept.ideaPath, '00-收件箱/2026-11-10_想法_保留来源的便签.md');
assert.equal(kept.promotedAt, now);
assert.equal(plain.ideaPath, '');
assert.equal(plain.promotedAt, null);

// Promoting records ideaPath on the note and persists it.
api.updateNote('n-plain', { ideaPath: '00-收件箱/2026-11-10_想法_旧便签.md', promotedAt: now });
const persisted = JSON.parse(store.get(NOTES_KEY));
const persistedPlain = persisted.find((item) => item.id === 'n-plain');
assert.equal(persistedPlain.ideaPath, '00-收件箱/2026-11-10_想法_旧便签.md');

// The probe never runs here (no window.location on the stub), so the action
// stays hidden by default — the offline guarantee for standalone use.
assert.equal(api.getIdeaAvailable(), false);

console.log('idea promote: ok');
