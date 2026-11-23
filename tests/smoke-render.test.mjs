/**
 * Smoke test: loads the plugin module against stub browser globals and a tiny
 * React shim, runs `apply` with a fake Cordis client context, and renders every
 * registered surface once. This catches undefined references and prop mistakes
 * in code paths that static syntax checks cannot reach.
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
  { id: 'n-future', text: '明天9点 交周报', title: '交周报', remindAt: now + 3600000, createdAt: now, done: false, doneAt: null, notifiedAt: null },
  { id: 'n-due', text: '买菜', title: '买菜', remindAt: now - 60000, createdAt: now - 1000, done: false, doneAt: null, notifiedAt: null },
  { id: 'n-done', text: '已完成的事项', title: '已完成的事项', remindAt: null, createdAt: now - 2000, done: true, doneAt: now - 500, notifiedAt: null },
]));
store.set('dsh-plugin-scratchpad/prefs/v1', JSON.stringify({ notify: true }));

const styleTags = [];
const timeouts = [];
const notifications = [];
let selectedPanel = null;

const windowStub = {
  __DSH_NOTES_TEST__: true,
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  },
  setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; },
  clearTimeout: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
};

const documentStub = {
  querySelector: () => null,
  createElement: () => ({ dataset: {}, textContent: '' }),
  head: { appendChild: (tag) => styleTags.push(tag) },
};

class NotificationStub {
  static permission = 'granted';
  static requestPermission() { return Promise.resolve('granted'); }
  constructor(title, options) { this.title = title; this.options = options; notifications.push(this); }
  close() {}
}

const fakeReact = {
  createElement(type, props, ...children) {
    return { type, props: { ...(props || {}), children } };
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}];
  },
  useEffect() {},
  useRef(value) {
    return { current: value };
  },
  useSyncExternalStore(subscribe, getSnapshot) {
    return getSnapshot();
  },
};

const definitions = [];
const loaderWindow = { ...windowStub, __ModuleLoader__: { load: (definition) => definitions.push(definition) } };
const evaluate = new Function('window', 'document', 'Notification', 'require', source);
evaluate(loaderWindow, documentStub, NotificationStub, (name) => {
  if (name === 'react') return fakeReact;
  throw new Error('unexpected module require: ' + name);
});

assert.equal(definitions.length, 1, 'exactly one module definition must be loaded');
const definition = definitions[0];
assert.equal(definition.id, 'dsh-plugin-scratchpad');
const plugin = definition.factory((name) => {
  if (name === 'react') return fakeReact;
  throw new Error('unexpected module require: ' + name);
});
assert.ok(plugin.__test, 'test surface must be exposed under the test flag');

const registrations = [];
const dictionaryRegistrations = [];
const ctx = {
  locale: {
    register: (ns, locale, dict) => {
      dictionaryRegistrations.push({ ns, locale, dict });
      return () => {};
    },
    bind: () => (key) => key,
    getLocale: () => ({ active: 'zh' }),
    subscribe: () => () => {},
  },
  get: (name) => (name === 'layout' ? { selectPanel: (id) => { selectedPanel = id; } } : undefined),
  inject: (_deps, callback) => callback({ layout: { selectPanel: (id) => { selectedPanel = id; } } }),
  effect: (callback) => callback(),
  slots: {
    inject: (_key, callback) => callback(),
    register: (options, component) => {
      registrations.push({ options, component });
      return () => {};
    },
  },
};

plugin.apply(ctx);

assert.deepEqual(dictionaryRegistrations.map((entry) => entry.locale).sort(), ['en', 'zh']);
assert.equal(styleTags.length, 1, 'one stylesheet must be inserted');
assert.equal(registrations.length, 3, 'three slot registrations are expected');
const byName = (name) => registrations.find((entry) => entry.options.name === name);
const main = byName('main');
const panellist = byName('sidebar.panellist');
const overlay = byName('shell.overlay');
assert.equal(main.options.key, 'scratchpad');
assert.equal(panellist.options.id, 'scratchpad');
assert.equal(panellist.options.order, 20);
assert.equal(overlay.options.id, 'notes-hud');
assert.ok(overlay.options.inject, 'the overlay entry must inject its open-panel callback');
assert.ok(registrations.every((entry) => entry.options.locale === 'scratchpad'));
assert.equal(panellist.options.label(), 'panel.title 2', 'the sidebar label carries the active count');

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

const t = (key) => key;
const panelMarkup = renderNode(fakeReact.createElement(plugin.__test.NotesPanel, { t }));
assert.ok(panelMarkup.includes('panel.heading 2'), 'the page heading carries the active count');
assert.ok(panelMarkup.includes('count.pending'), 'the page shows pending and record counts');
assert.ok(panelMarkup.includes('交周报'), 'active notes render in the page');
assert.ok(panelMarkup.includes('买菜'));
assert.ok(panelMarkup.includes('已完成的事项'), 'done notes render in the page');
assert.ok(panelMarkup.includes('明天9点 交周报'), 'the page shows the captured text verbatim');
assert.equal(panelMarkup.split('明天9点 交周报').length - 1, 1, 'each note renders exactly once');
assert.ok(!panelMarkup.includes('dsh-notes-card-title'), 'no derived title line is rendered');
assert.ok(panelMarkup.includes('prefs.order'), 'the footer exposes the record-order choice');

const hudMarkup = renderNode(fakeReact.createElement(plugin.__test.NotesHud, {
  t,
  usePanelInfo: (selector) => selector({ activePanelId: null }),
  onOpenPanel: () => { selectedPanel = 'scratchpad'; },
}));
assert.equal(hudMarkup, '2', 'the hud starts collapsed: only the launcher badge count is rendered');
assert.ok(!hudMarkup.includes('交周报'), 'collapsed hud hides the note bars');

const hiddenHud = renderNode(fakeReact.createElement(plugin.__test.NotesHud, {
  t,
  usePanelInfo: (selector) => selector({ activePanelId: 'scratchpad' }),
  onOpenPanel: () => {},
}));
assert.equal(hiddenHud, '', 'the hud hides while the notes page is open');

const barMarkup = renderNode(fakeReact.createElement(plugin.__test.NoteBar, {
  note: { id: 'n-future', text: '明天9点 交周报', title: '交周报', remindAt: now + 3600000, createdAt: now, done: false },
  now,
  t,
  onOpenPanel: () => {},
}));
assert.ok(barMarkup.includes('明天9点 交周报'), 'the bar shows the captured text verbatim');
assert.equal(barMarkup.split('明天9点 交周报').length - 1, 1, 'the bar text is not duplicated');

const editorMarkup = renderNode(fakeReact.createElement(plugin.__test.NoteEditor, {
  note: { id: 'n-future', text: '明天9点 交周报', title: '交周报', remindAt: now + 3600000, createdAt: now, done: false },
  t,
  onSave: () => {},
  onCancel: () => {},
  onDelete: () => {},
}));
assert.ok(editorMarkup.includes('item.save'));

const editingMarkup = renderNode(fakeReact.createElement(plugin.__test.NoteCard, {
  note: { id: 'n-future', text: '明天9点 交周报', title: '交周报', remindAt: now + 3600000, createdAt: now, done: false },
  now,
  t,
  editing: true,
  onEdit: () => {},
  onStopEdit: () => {},
}));
assert.ok(editingMarkup.includes('item.save'));

const switchMarkup = renderNode(fakeReact.createElement(plugin.__test.NotifySwitch, { t }));
assert.ok(switchMarkup.includes('prefs.notify'));

// Snooze duration defaults to ten minutes and is user-selectable.
assert.equal(plugin.__test.getPrefs().snoozeMinutes, 10);
const snoozeMarkup = renderNode(fakeReact.createElement(plugin.__test.SnoozeControl, { t }));
assert.ok(snoozeMarkup.includes('prefs.snooze'));
assert.ok(snoozeMarkup.includes('5 prefs.minutes'));
assert.ok(snoozeMarkup.includes('10 prefs.minutes'));
plugin.__test.savePrefs({ snoozeMinutes: 5 });
assert.equal(plugin.__test.getPrefs().snoozeMinutes, 5);
assert.equal(JSON.parse(store.get('dsh-plugin-scratchpad/prefs/v1')).snoozeMinutes, 5, 'snooze choice persists');
plugin.__test.savePrefs({ notify: true });
assert.equal(plugin.__test.getPrefs().snoozeMinutes, 5, 'updating notifications keeps the snooze choice');

// The launcher corner is a preference too.
assert.equal(plugin.__test.getPrefs().hudCorner, 'bottom');
const cornerMarkup = renderNode(fakeReact.createElement(plugin.__test.HudCornerControl, { t }));
assert.ok(cornerMarkup.includes('prefs.corner'));
assert.ok(cornerMarkup.includes('prefs.cornerBottom'));
assert.ok(cornerMarkup.includes('prefs.cornerTop'));
plugin.__test.savePrefs({ hudCorner: 'top' });
assert.equal(plugin.__test.getPrefs().hudCorner, 'top');
assert.equal(JSON.parse(store.get('dsh-plugin-scratchpad/prefs/v1')).hudCorner, 'top', 'corner choice persists');
plugin.__test.savePrefs({ snoozeMinutes: 10 });
assert.equal(plugin.__test.getPrefs().hudCorner, 'top', 'snooze update keeps the corner choice');

// Done records follow a user-selected order: recorded history (default) or completion time.
assert.equal(plugin.__test.getPrefs().doneSort, 'createdAt');
const orderMarkup = renderNode(fakeReact.createElement(plugin.__test.DoneSortControl, { t }));
assert.ok(orderMarkup.includes('prefs.order'));
assert.ok(orderMarkup.includes('prefs.orderHistory'));
assert.ok(orderMarkup.includes('prefs.orderDone'));
const orderSample = [
  { id: 'a', text: 'a', title: 'a', createdAt: 300, done: true, doneAt: 500, remindAt: null },
  { id: 'b', text: 'b', title: 'b', createdAt: 100, done: true, doneAt: 200, remindAt: null },
  { id: 'c', text: 'c', title: 'c', createdAt: 200, done: true, doneAt: 100, remindAt: null },
];
assert.deepEqual(
  plugin.__test.sortNotes(orderSample).map((note) => note.id),
  ['b', 'c', 'a'],
  'recorded order keeps the oldest record first so new ones append at the bottom',
);
plugin.__test.savePrefs({ doneSort: 'doneAt' });
assert.deepEqual(
  plugin.__test.sortNotes(orderSample).map((note) => note.id),
  ['a', 'b', 'c'],
  'completion order puts the most recently completed record first',
);
assert.equal(JSON.parse(store.get('dsh-plugin-scratchpad/prefs/v1')).doneSort, 'doneAt', 'record order persists');
plugin.__test.savePrefs({ doneSort: 'createdAt' });
assert.equal(plugin.__test.getPrefs().doneSort, 'createdAt');

// Active notes follow a user-selected order too: reminders first (default) or newest-written.
assert.equal(plugin.__test.getPrefs().activeSort, 'remind');
const activeMarkup = renderNode(fakeReact.createElement(plugin.__test.ActiveSortControl, { t }));
assert.ok(activeMarkup.includes('prefs.sortRemind'));
assert.ok(activeMarkup.includes('prefs.sortRecent'));
const activeSample = [
  { id: 'x', text: 'x', title: 'x', createdAt: 100, done: false, remindAt: 9000 },
  { id: 'y', text: 'y', title: 'y', createdAt: 300, done: false, remindAt: null },
  { id: 'z', text: 'z', title: 'z', createdAt: 200, done: false, remindAt: null },
];
assert.deepEqual(
  plugin.__test.sortNotes(activeSample).map((note) => note.id),
  ['x', 'y', 'z'],
  'reminder mode keeps the timed note on top, newest-written after it',
);
plugin.__test.savePrefs({ activeSort: 'recent' });
assert.deepEqual(
  plugin.__test.sortNotes(activeSample).map((note) => note.id),
  ['y', 'z', 'x'],
  'newest-written order ignores reminders and sorts by creation time',
);
assert.equal(JSON.parse(store.get('dsh-plugin-scratchpad/prefs/v1')).activeSort, 'recent', 'active order persists');
plugin.__test.savePrefs({ activeSort: 'remind' });
assert.equal(plugin.__test.getPrefs().activeSort, 'remind');

// The overdue seeded note must have scheduled a near-immediate timer.
assert.ok(timeouts.length >= 1, 'a reminder timeout must be scheduled');
const dueTimer = timeouts[0];
assert.ok(dueTimer.ms <= 100, 'overdue reminders fire almost immediately');

// Fire the due timer: mark notified and raise a system notification.
dueTimer.fn();
const updated = plugin.__test.getNotes();
const dueNote = updated.find((note) => note.id === 'n-due');
assert.ok(dueNote, 'the due note still exists');
assert.ok(dueNote.notifiedAt !== null, 'the due note is marked as notified');
assert.equal(notifications.length, 1, 'one system notification is raised');
assert.equal(notifications[0].title, 'notify.title');
assert.equal(notifications[0].options.body, '买菜');

// The overlay entry's injected callback selects the notes panel through ctx.layout.
overlay.options.inject().onOpenPanel();
assert.equal(selectedPanel, 'scratchpad');

// Snoozing moves the reminder and clears the notification watermark.
plugin.__test.snoozeNote('n-future', 10);
const snoozedNote = plugin.__test.getNotes().find((note) => note.id === 'n-future');
assert.ok(snoozedNote.remindAt >= now + 9 * 60000, 'snooze moves the reminder ten minutes out');
assert.equal(snoozedNote.notifiedAt, null, 'snoozing resets the notification watermark');
plugin.__test.updateNote('n-future', { title: '交周报（改）' });
assert.equal(plugin.__test.getNotes().find((note) => note.id === 'n-future').title, '交周报（改）');

// Store mutations reach the persisted snapshot.
plugin.__test.toggleDone('n-due');
const toggled = plugin.__test.getNotes().find((note) => note.id === 'n-due');
assert.equal(toggled.done, true);
plugin.__test.deleteNote('n-future');
assert.equal(plugin.__test.getNotes().some((note) => note.id === 'n-future'), false);
const persisted = JSON.parse(store.get('dsh-plugin-scratchpad/notes/v2'));
assert.equal(persisted.some((note) => note.id === 'n-future'), false, 'deletions persist');

// A count change re-registers the sidebar entry so its label number stays live.
const beforeEntries = registrations.filter((entry) => entry.options.name === 'sidebar.panellist').length;
plugin.__test.addNote('十分钟后 喝水', now + 10 * 60000);
const afterEntries = registrations.filter((entry) => entry.options.name === 'sidebar.panellist');
assert.ok(afterEntries.length > beforeEntries, 'the sidebar entry is re-registered when the count changes');
assert.equal(afterEntries[afterEntries.length - 1].options.label(), 'panel.title 1');
assert.equal(plugin.__test.countActive(), 1);

console.log('smoke render: ok (' + registrations.length + ' registrations, ' + notifications.length + ' notification)');
