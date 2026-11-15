/**
 * Board checks: the four read-only blocks render, with the Agent Hub block
 * falling back to a quiet loading/down label instead of throwing. Runs against
 * stub browser globals; no network and no host process is involved.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');

const now = Date.now();
const store = new Map();
store.set('dsh-plugin-scratchpad/notes/v2', JSON.stringify([
  { id: 'n-today', text: '今天记的一条', title: '今天记的一条', remindAt: now + 3600000, createdAt: now, done: false },
  { id: 'n-idea', text: '已经投递过的便签', title: '已经投递过的灵感', remindAt: null, createdAt: now - 1000, done: false, ideaPath: 'C:\\Creator\\00-收件箱\\想法-20261113-1200-abc123.md', promotedAt: now - 500 },
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
const plugin = definitions[0].factory((name) => {
  if (name === 'react') return fakeReact;
  throw new Error('unexpected module require: ' + name);
});
const api = plugin.__test;
assert.ok(api && api.NotesBoard, 'the board must be exposed to the headless harness');

function renderNode(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(renderNode).join('');
  if (typeof node === 'object') {
    if (typeof node.type === 'function') return renderNode(node.type(node.props || {}));
    return renderNode(node.props && node.props.children);
  }
  return '';
}

const markup = renderNode(fakeReact.createElement(api.NotesBoard, { t: (key) => key }));
assert.ok(markup.includes('board.title'), 'the board heading renders');
assert.ok(markup.includes('board.today'), 'today block renders');
assert.ok(markup.includes('board.upcoming'), 'upcoming block renders');
assert.ok(markup.includes('board.recentIdeas'), 'recent ideas block renders');
assert.ok(markup.includes('board.workers'), 'Agent Hub block renders');
assert.ok(markup.includes('board.hubLoading'), 'the hub block starts in a safe loading state');
assert.ok(markup.includes('今天记的一条'), 'today notes are listed');
assert.ok(markup.includes('已经投递过的便签'), 'promoted ideas are listed');

console.log('board render: ok');
