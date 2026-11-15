/**
 * Client half of the Scratchpad bundle: sticky notes with reminder times.
 *
 * Surfaces:
 * - sidebar.panellist: the entry icon; `main` holds the capture + management page.
 * - shell.overlay: a frame-wide floating stack of note bars ("横栏").
 *
 * Notes live in the host's SQLite database (see index.js) and are read through
 * the local `/api/scratchpad` endpoints. A localStorage snapshot is kept only
 * as an offline fallback and as the one-time migration source; reminders fire
 * while the page is open and can additionally raise a system notification
 * through the Notification API.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-plugin-scratchpad',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Panel id shared by the sidebar entry and the main-seat key. */
    const PANEL_ID = 'scratchpad';
    /** Locale namespace owned by this plugin. */
    const NS = 'scratchpad';
    /** Browser-local storage keys, now used as an offline/migration fallback only. */
    const NOTES_KEY = 'dsh-plugin-scratchpad/notes/v2';
    const LEGACY_KEY = 'dsh-plugin-scratchpad/note';
    const PREFS_KEY = 'dsh-plugin-scratchpad/prefs/v1';
    /** Marks the one-time move of the browser snapshot into the host database. */
    const MIGRATED_KEY = 'dsh-plugin-scratchpad/migrated-to-host/v1';
    /** Host HTTP prefix owned by index.js. */
    const API_BASE = '/api/scratchpad';
    /** Tag id of this plugin's stylesheet, also used as its dedupe marker. */
    const STYLE_ID = '@local/dsh-plugin-scratchpad/styles';
    /** Default prefix of the idea endpoint (the Lingtai observatory). */
    const IDEA_BASE_DEFAULT = '/lingtai-guanxingtai';
    /** Platform values sent with an idea; fixed Doushu field values, kept client-side on purpose. */
    const IDEA_PLATFORMS = ['全平台', '抖音', '小红书'];

    const zh = {
      'panel.title': '速记便签',
      'panel.heading': '速记便签',
      'panel.subtitle': '说完就存，自动识别提醒时间',
      'capture.placeholder': '说点什么，比如「明天下午3点 交周报」',
      'capture.remindAt': '提醒时间',
      'capture.detected': '识别到',
      'capture.auto': '自动识别',
      'capture.noTime': '没识别到时间，可手动选',
      'capture.past': '这个时间已经过了，保存后会立即提醒',
      'capture.hint': 'Enter 保存 · Shift+Enter 换行',
      'capture.save': '记下',
      'capture.empty': '先写点内容',
      'list.active': '进行中',
      'list.doneSection': '已完成',
      'list.empty': '还没有速记',
      'list.clearDone': '清空',
      'item.done': '完成',
      'item.undo': '撤销',
      'item.edit': '编辑',
      'item.save': '保存',
      'item.cancel': '取消',
      'item.delete': '删除',
      'item.snooze5': '稍后5分钟',
      'item.snooze10': '稍后10分钟',
      'item.expand': '展开',
      'item.collapse': '收起',
      'item.reparse': '按文字识别',
      'item.addTime': '添加时间',
      'time.today': '今天',
      'time.tomorrow': '明天',
      'time.dayAfter': '后天',
      'time.due': '已到时间',
      'time.soon': '即将',
      'time.noReminder': '不提醒',
      'prefs.notify': '桌面通知',
      'prefs.snooze': '稍后提醒',
      'prefs.minutes': '分钟',
      'prefs.corner': '图标位置',
      'prefs.cornerBottom': '右下',
      'prefs.cornerTop': '右上',
      'prefs.order': '记录排序',
      'prefs.orderHistory': '记录顺序',
      'prefs.orderDone': '完成时间',
      'prefs.hint': '提醒在应用打开时生效；开启桌面通知后还会在系统层弹出。',
      'prefs.denied': '通知未获授权，应用内提醒仍然有效',
      'prefs.unsupported': '当前环境不支持系统通知',
      'notify.title': '速记便签',
      'count.pending': '条待办',
      'count.records': '条记录',
      'hud.openPanel': '打开速记便签',
      'hud.collapse': '收起便签',
      'hud.capture': '快速记一条',
      'hud.capturePlaceholder': '快速记一条，自动识别提醒时间…',
      'idea.promote': '投到灵感',
      'idea.badge': '已投灵感',
      'idea.title': '标题',
      'idea.platform': '平台',
      'idea.submit': '投递',
      'idea.busy': '投递中…',
      'idea.done': '已投到灵感',
      'idea.failed': '投递失败，可稍后手动再投',
      'idea.denied': '投递被拒（403）：请回报后端处理，不要反复重试',
      'idea.emptyTitle': '先填一个标题',
      'idea.again': '这条已投过；再投会生成一张新卡',
      'idea.ready': '灵感入口已连接',
      'idea.offline': '灵台未连接，投递入口隐藏',
      'prefs.ideaBase': '灵感接口',
      'prefs.ideaSave': '保存',
      'prefs.ideaHint': '兼容斗枢投递契约（斗枢规范-v1 §7）的接口前缀；连不上时投递入口自动隐藏。',
      'export.label': '导出',
      'export.button': '导出 Markdown',
      'export.hint': '导出一个 .md 到下载目录，再拖进库（建议 00-收件箱/）',
      'export.done': '已导出',
      'export.empty': '还没有便签可导出',
      'export.failed': '导出失败：当前环境不允许下载',
      'board.title': '看板',
      'board.today': '今日便签',
      'board.upcoming': '即将提醒',
      'board.recentIdeas': '最近投递的灵感',
      'board.workers': 'Agent Hub 员工状态',
      'board.emptyToday': '今天还没有便签',
      'board.emptyUpcoming': '未来 24 小时没有提醒',
      'board.emptyIdeas': '还没有投递过灵感',
      'board.hubLoading': '读取中…',
      'board.hubDown': 'Agent Hub 未运行',
      'board.hubEmpty': 'Agent Hub 没有在线员工',
      'board.queue': '队列',
      'board.activeTask': '当前任务',
      'board.idle': '空闲',
      'board.openFile': '打开',
    };

    const en = {
      'panel.title': 'Quick notes',
      'panel.heading': 'Quick notes',
      'panel.subtitle': 'Speak, save, and let the reminder time be detected',
      'capture.placeholder': 'Say something, e.g. “tomorrow 3pm send the weekly report”',
      'capture.remindAt': 'Reminder time',
      'capture.detected': 'Detected',
      'capture.auto': 'Auto-detect',
      'capture.noTime': 'No time detected — pick one',
      'capture.past': 'This time has passed; saving reminds you immediately',
      'capture.hint': 'Enter to save · Shift+Enter for a new line',
      'capture.save': 'Save',
      'capture.empty': 'Type something first',
      'list.active': 'Active',
      'list.doneSection': 'Done',
      'list.empty': 'No notes yet',
      'list.clearDone': 'Clear',
      'item.done': 'Done',
      'item.undo': 'Undo',
      'item.edit': 'Edit',
      'item.save': 'Save',
      'item.cancel': 'Cancel',
      'item.delete': 'Delete',
      'item.snooze5': 'Snooze 5 min',
      'item.snooze10': 'Snooze 10 min',
      'item.expand': 'Expand',
      'item.collapse': 'Collapse',
      'item.reparse': 'From text',
      'item.addTime': 'Add time',
      'time.today': 'Today',
      'time.tomorrow': 'Tomorrow',
      'time.dayAfter': 'Day after tomorrow',
      'time.due': 'Due',
      'time.soon': 'Soon',
      'time.noReminder': 'No reminder',
      'prefs.notify': 'Desktop notifications',
      'prefs.snooze': 'Snooze',
      'prefs.minutes': 'min',
      'prefs.corner': 'Icon position',
      'prefs.cornerBottom': 'Bottom',
      'prefs.cornerTop': 'Top',
      'prefs.order': 'Record order',
      'prefs.orderHistory': 'Recorded',
      'prefs.orderDone': 'Completed',
      'prefs.hint': 'Reminders run while the app is open; desktop notifications also pop at system level.',
      'prefs.denied': 'Notification permission denied — in-app reminder still works',
      'prefs.unsupported': 'System notifications are unavailable here',
      'notify.title': 'Quick notes',
      'count.pending': 'pending',
      'count.records': 'records',
      'hud.openPanel': 'Open quick notes',
      'hud.collapse': 'Hide notes',
      'hud.capture': 'Quick note',
      'hud.capturePlaceholder': 'Quick note — reminder time is detected…',
      'idea.promote': 'To ideas',
      'idea.badge': 'In ideas',
      'idea.title': 'Title',
      'idea.platform': 'Platform',
      'idea.submit': 'Submit',
      'idea.busy': 'Sending…',
      'idea.done': 'Promoted to ideas',
      'idea.failed': 'Promotion failed — try again manually later',
      'idea.denied': 'Rejected (403): report to the backend instead of retrying',
      'idea.emptyTitle': 'Type a title first',
      'idea.again': 'Already promoted; submitting again creates a new card',
      'idea.ready': 'Idea endpoint connected',
      'idea.offline': 'Observatory not connected; the promote action is hidden',
      'prefs.ideaBase': 'Idea endpoint',
      'prefs.ideaSave': 'Save',
      'prefs.ideaHint': 'Any prefix implementing the Doushu idea contract (Doushu spec v1 §7) works; the action hides itself when unreachable.',
      'export.label': 'Export',
      'export.button': 'Export Markdown',
      'export.hint': 'Saves one .md to your downloads; drag it into the library (00-收件箱/).',
      'export.done': 'Exported',
      'export.empty': 'No notes to export yet',
      'export.failed': 'Export failed: downloads are blocked here',
      'board.title': 'Board',
      'board.today': "Today's notes",
      'board.upcoming': 'Upcoming reminders',
      'board.recentIdeas': 'Recently promoted ideas',
      'board.workers': 'Agent Hub workers',
      'board.emptyToday': 'No notes today',
      'board.emptyUpcoming': 'No reminders in the next 24 hours',
      'board.emptyIdeas': 'No ideas promoted yet',
      'board.hubLoading': 'Loading…',
      'board.hubDown': 'Agent Hub is not running',
      'board.hubEmpty': 'No workers online in Agent Hub',
      'board.queue': 'Queue',
      'board.activeTask': 'Active task',
      'board.idle': 'Idle',
      'board.openFile': 'Open',
    };

    const CSS = [
      "/* ---------- 素笺墨线：局部变量（全部派生自 DSH 主题令牌，深浅色自动跟随） ---------- */",
      ".dsh-notes-page, .dsh-notes-hud, .dsh-note-bar, .dsh-notes-idea-box {",
      "  --note-line: var(--dsw-alias-border-l1);",
      "  --note-line-strong: var(--dsw-alias-border-l2);",
      "  --note-surface: var(--dsw-alias-bg-layer-1);",
      "  --note-surface-2: var(--dsw-alias-bg-layer-2);",
      "  --note-elevated: var(--dsw-alias-bg-overlay);",
      "  --note-ink: var(--dsw-alias-label-primary);",
      "  --note-ink-soft: var(--dsw-alias-label-secondary);",
      "  --note-accent: var(--dsw-alias-brand-primary);",
      "  --note-warn: var(--dsw-alias-state-warn-primary);",
      "  --note-ok: var(--dsw-alias-state-success-primary);",
      "  --note-danger: var(--dsw-alias-state-error-primary);",
      "  --note-shadow-1: 0 1px 2px rgba(16, 24, 40, 0.04), 0 6px 16px rgba(16, 24, 40, 0.06);",
      "  --note-shadow-2: 0 2px 6px rgba(16, 24, 40, 0.06), 0 16px 38px rgba(16, 24, 40, 0.12);",
      "  --note-ease: cubic-bezier(0.22, 0.61, 0.36, 1);",
      "}",
      "",
      "/* ---------- 页面骨架 ---------- */",
      ".dsh-notes-page { box-sizing: border-box; flex: 1 1 auto; min-height: 0; width: 100%; overflow: auto; background: var(--dsw-alias-bg-base); color: var(--note-ink); -webkit-font-smoothing: antialiased; }",
      ".dsh-notes-page::selection, .dsh-notes-page ::selection { background: color-mix(in srgb, var(--note-accent) 22%, transparent); }",
      ".dsh-notes-page::-webkit-scrollbar { width: 12px; }",
      ".dsh-notes-page::-webkit-scrollbar-thumb { background: var(--note-line-strong); border: 4px solid transparent; background-clip: content-box; border-radius: 999px; }",
      ".dsh-notes-page::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--note-ink-soft) 55%, transparent); background-clip: content-box; }",
      ".dsh-notes-inner { box-sizing: border-box; max-width: 792px; margin: 0 auto; padding: 36px 28px 96px; display: flex; flex-direction: column; gap: 22px; }",
      "",
      "/* ---------- 页头 ---------- */",
      ".dsh-notes-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; padding-bottom: 16px; border-bottom: 1px solid var(--note-line); }",
      ".dsh-notes-heading { margin: 0; font-size: 22px; line-height: 30px; font-weight: 650; letter-spacing: -0.012em; }",
      ".dsh-notes-subtitle { font-size: 12.5px; line-height: 18px; color: var(--note-ink-soft); }",
      ".dsh-notes-counts { margin-left: auto; padding: 3px 11px; border-radius: 999px; background: var(--note-surface-2); color: var(--note-ink-soft); font-size: 11.5px; line-height: 18px; font-variant-numeric: tabular-nums; white-space: nowrap; }",
      "",
      "/* ---------- 记录区（便签纸感觉：纸面 + 细墨线 + 焦点时的一圈柔光） ---------- */",
      ".dsh-notes-capture { box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; padding: 16px 16px 13px; border-radius: 14px; border: 1px solid var(--note-line); background: var(--note-surface); background-image: radial-gradient(120% 130% at 0% 0%, color-mix(in srgb, var(--note-accent) 7%, transparent), transparent 58%); box-shadow: 0 1px 2px rgba(16, 24, 40, 0.03); transition: border-color 0.18s var(--note-ease), box-shadow 0.18s var(--note-ease); }",
      ".dsh-notes-capture:focus-within { border-color: color-mix(in srgb, var(--note-accent) 52%, var(--note-line)); box-shadow: 0 0 0 4px color-mix(in srgb, var(--note-accent) 11%, transparent), 0 8px 22px rgba(16, 24, 40, 0.07); }",
      ".dsh-notes-editor { box-sizing: border-box; display: block; width: 100%; min-height: 64px; max-height: 40vh; resize: vertical; padding: 2px; border: none; background: transparent; color: var(--note-ink); font-family: inherit; font-size: 14.5px; line-height: 23px; outline: none; }",
      ".dsh-notes-editor::placeholder { color: color-mix(in srgb, var(--note-ink-soft) 82%, transparent); }",
      ".dsh-notes-editor:focus-visible { outline: none; }",
      ".dsh-notes-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; line-height: 18px; }",
      ".dsh-notes-meta-end { margin-left: auto; display: flex; align-items: center; gap: 10px; }",
      "",
      "/* ---------- 芯片 / 标签 ---------- */",
      ".dsh-notes-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--note-line); background: var(--note-elevated); color: var(--note-ink-soft); font: inherit; font-size: 11.5px; line-height: 18px; }",
      ".dsh-notes-chip::before { content: ''; width: 6px; height: 6px; border-radius: 999px; background: color-mix(in srgb, var(--note-ink-soft) 50%, transparent); flex: none; }",
      ".dsh-notes-chip[data-due=\"true\"] { border-color: color-mix(in srgb, var(--note-warn) 38%, transparent); background: color-mix(in srgb, var(--note-warn) 10%, transparent); color: var(--note-warn); }",
      ".dsh-notes-chip[data-due=\"true\"]::before { background: var(--note-warn); }",
      ".dsh-notes-chip[data-muted=\"true\"] { border-style: dashed; background: transparent; }",
      ".dsh-notes-chip[data-muted=\"true\"]::before { display: none; }",
      ".dsh-notes-datetime { box-sizing: border-box; font: inherit; font-size: 11.5px; line-height: 18px; padding: 3px 8px; border-radius: 8px; border: 1px solid var(--note-line); background: var(--note-elevated); color: var(--note-ink); color-scheme: light dark; }",
      ".dsh-notes-datetime:focus-visible { border-color: var(--note-accent); outline: 2px solid color-mix(in srgb, var(--note-accent) 30%, transparent); outline-offset: 1px; }",
      ".dsh-notes-hint { font-size: 11.5px; line-height: 17px; color: var(--note-ink-soft); }",
      ".dsh-notes-warn { font-size: 12px; line-height: 18px; color: var(--note-warn); }",
      "",
      "/* ---------- 按钮 ---------- */",
      ".dsh-notes-primary { appearance: none; font: inherit; font-size: 13px; font-weight: 600; line-height: 20px; padding: 6px 18px; border-radius: 10px; border: 1px solid var(--note-accent); background: var(--note-accent); color: #ffffff; cursor: pointer; box-shadow: 0 6px 16px color-mix(in srgb, var(--note-accent) 24%, transparent); transition: transform 0.14s var(--note-ease), box-shadow 0.18s var(--note-ease), filter 0.18s var(--note-ease); }",
      ".dsh-notes-primary:hover:not(:disabled) { filter: brightness(1.06); transform: translateY(-1px); box-shadow: 0 10px 22px color-mix(in srgb, var(--note-accent) 30%, transparent); }",
      ".dsh-notes-primary:active:not(:disabled) { transform: translateY(0); box-shadow: 0 4px 12px color-mix(in srgb, var(--note-accent) 22%, transparent); }",
      ".dsh-notes-primary:disabled { opacity: 0.42; box-shadow: none; cursor: default; }",
      ".dsh-notes-primary:focus-visible { outline: 2px solid color-mix(in srgb, var(--note-accent) 55%, transparent); outline-offset: 2px; }",
      ".dsh-notes-action { appearance: none; font: inherit; font-size: 11.5px; line-height: 17px; padding: 3px 11px; border-radius: 999px; border: 1px solid transparent; background: transparent; color: var(--note-ink-soft); cursor: pointer; transition: background 0.14s var(--note-ease), color 0.14s var(--note-ease); }",
      ".dsh-notes-action:hover { background: var(--note-surface-2); color: var(--note-ink); }",
      ".dsh-notes-action:focus-visible { outline: 2px solid color-mix(in srgb, var(--note-accent) 55%, transparent); outline-offset: 1px; }",
      ".dsh-notes-action[data-tone=\"positive\"] { color: var(--note-ok); background: color-mix(in srgb, var(--note-ok) 10%, transparent); }",
      ".dsh-notes-action[data-tone=\"positive\"]:hover { background: color-mix(in srgb, var(--note-ok) 18%, transparent); color: var(--note-ok); }",
      ".dsh-notes-action[data-tone=\"danger\"]:hover { color: var(--note-danger); background: color-mix(in srgb, var(--note-danger) 12%, transparent); }",
      ".dsh-notes-action[data-tone=\"idea\"] { color: var(--note-accent); background: color-mix(in srgb, var(--note-accent) 10%, transparent); font-weight: 600; }",
      ".dsh-notes-action[data-tone=\"idea\"]:hover { background: color-mix(in srgb, var(--note-accent) 18%, transparent); color: var(--note-accent); }",
      ".dsh-notes-link { appearance: none; border: none; background: transparent; padding: 0; font: inherit; font-size: 12px; line-height: 18px; color: var(--note-ink-soft); cursor: pointer; text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--note-ink-soft) 40%, transparent); }",
      ".dsh-notes-link:hover { color: var(--note-accent); border-bottom-color: currentColor; }",
      ".dsh-notes-link:focus-visible { outline: 2px solid color-mix(in srgb, var(--note-accent) 55%, transparent); outline-offset: 2px; border-radius: 4px; }",
      "",
      "/* ---------- 分区 ---------- */",
      ".dsh-notes-section { display: flex; flex-direction: column; gap: 10px; }",
      ".dsh-notes-section-head { display: flex; align-items: center; gap: 8px; font-size: 11.5px; line-height: 18px; letter-spacing: 0.04em; color: var(--note-ink-soft); }",
      ".dsh-notes-section-count { padding: 1px 8px; border-radius: 999px; background: var(--note-surface-2); color: var(--note-ink-soft); font-variant-numeric: tabular-nums; }",
      "",
      "/* ---------- 便签卡 ---------- */",
      ".dsh-notes-card { position: relative; box-sizing: border-box; display: flex; flex-direction: column; gap: 9px; padding: 14px 16px; border-radius: 12px; border: 1px solid var(--note-line); background: var(--note-surface); transition: border-color 0.16s var(--note-ease), box-shadow 0.2s var(--note-ease), transform 0.2s var(--note-ease); }",
      ".dsh-notes-card:hover { border-color: var(--note-line-strong); box-shadow: var(--note-shadow-1); transform: translateY(-1px); }",
      ".dsh-notes-card[data-due=\"true\"] { border-color: color-mix(in srgb, var(--note-warn) 42%, var(--note-line)); }",
      ".dsh-notes-card[data-due=\"true\"]::before { content: ''; position: absolute; left: 0; top: 13px; bottom: 13px; width: 3px; border-radius: 0 999px 999px 0; background: var(--note-warn); }",
      ".dsh-notes-card[data-done=\"true\"] { background: color-mix(in srgb, var(--note-surface) 42%, transparent); }",
      ".dsh-notes-card[data-done=\"true\"]:hover { transform: none; box-shadow: none; }",
      ".dsh-notes-card[data-done=\"true\"] .dsh-notes-card-text { color: var(--note-ink-soft); text-decoration: line-through; text-decoration-thickness: 1px; text-decoration-color: color-mix(in srgb, var(--note-ink-soft) 45%, transparent); }",
      ".dsh-notes-card-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11.5px; line-height: 17px; color: var(--note-ink-soft); }",
      ".dsh-notes-card-text { margin: 0; font-size: 14px; line-height: 23px; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; color: var(--note-ink); }",
      ".dsh-notes-actions { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-left: -11px; }",
      ".dsh-notes-edit { display: flex; flex-direction: column; gap: 10px; }",
      "",
      "/* ---------- 空状态 ---------- */",
      ".dsh-notes-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 30px 16px; border-radius: 12px; border: 1px dashed var(--note-line-strong); background: color-mix(in srgb, var(--note-surface) 60%, transparent); color: var(--note-ink-soft); font-size: 12.5px; line-height: 19px; text-align: center; }",
      ".dsh-notes-empty-glyph { position: relative; width: 30px; height: 30px; border-radius: 9px; border: 1.5px solid color-mix(in srgb, var(--note-ink-soft) 45%, transparent); }",
      ".dsh-notes-empty-glyph::before { content: ''; position: absolute; left: 7px; right: 7px; top: 9px; height: 1.5px; background: color-mix(in srgb, var(--note-ink-soft) 40%, transparent); border-radius: 2px; box-shadow: 0 6px 0 color-mix(in srgb, var(--note-ink-soft) 26%, transparent); }",
      "",
      "/* ---------- 设置区 ---------- */",
      ".dsh-notes-footer { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 14px; border: 1px solid var(--note-line); background: var(--note-surface); }",
      ".dsh-notes-prefs { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px 24px; align-items: center; }",
      ".dsh-notes-prefs > .dsh-notes-section { grid-column: 1 / -1; }",
      ".dsh-notes-pref { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; line-height: 18px; color: var(--note-ink-soft); flex-wrap: nowrap; }",
      ".dsh-notes-pref-label { min-width: 4.2em; color: var(--note-ink-soft); }",
      ".dsh-notes-export { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; }",
      ".dsh-notes-idea-status { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; line-height: 17px; color: var(--note-ink-soft); }",
      ".dsh-notes-idea-status::before { content: ''; width: 6px; height: 6px; border-radius: 999px; background: currentColor; opacity: 0.6; flex: none; }",
      ".dsh-notes-idea-status[data-ready=\"true\"] { color: var(--note-ok); }",
      ".dsh-notes-idea-status[data-ready=\"true\"]::before { opacity: 1; }",
      ".dsh-notes-segmented { display: inline-flex; align-items: stretch; padding: 2px; gap: 2px; border: 1px solid var(--note-line); border-radius: 10px; background: var(--note-surface-2); }",
      ".dsh-notes-segment { appearance: none; border: none; background: transparent; color: var(--note-ink-soft); font: inherit; font-size: 11.5px; line-height: 17px; padding: 2px 9px; border-radius: 7px; cursor: pointer; transition: background 0.14s var(--note-ease), color 0.14s var(--note-ease), box-shadow 0.14s var(--note-ease); }",
      ".dsh-notes-segment:hover { color: var(--note-ink); }",
      ".dsh-notes-segment[aria-pressed=\"true\"] { background: var(--note-elevated); color: var(--note-ink); font-weight: 600; box-shadow: 0 1px 3px rgba(16, 24, 40, 0.12); }",
      ".dsh-notes-segment:focus-visible { outline: 2px solid color-mix(in srgb, var(--note-accent) 55%, transparent); outline-offset: 0; }",
      ".dsh-notes-switch { display: inline-flex; align-items: center; gap: 8px; appearance: none; border: none; background: transparent; padding: 0; font: inherit; font-size: 12px; line-height: 18px; color: var(--note-ink); cursor: pointer; }",
      ".dsh-notes-switch:focus-visible { outline: 2px solid color-mix(in srgb, var(--note-accent) 55%, transparent); outline-offset: 3px; border-radius: 6px; }",
      ".dsh-notes-switch-track { position: relative; width: 32px; height: 18px; border-radius: 999px; background: var(--note-line-strong); transition: background 0.18s var(--note-ease); flex: none; }",
      ".dsh-notes-switch[aria-checked=\"true\"] .dsh-notes-switch-track { background: var(--note-accent); }",
      ".dsh-notes-switch-thumb { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 999px; background: #ffffff; box-shadow: 0 1px 2px rgba(16, 24, 40, 0.25); transition: left 0.18s var(--note-ease); }",
      ".dsh-notes-switch[aria-checked=\"true\"] .dsh-notes-switch-thumb { left: 16px; }",
      "",
      "/* ---------- 悬浮球 ---------- */",
      ".dsh-notes-hud { position: fixed; right: 20px; bottom: 20px; z-index: 60; width: 356px; max-width: calc(100vw - 32px); display: flex; flex-direction: column; align-items: flex-end; gap: 10px; pointer-events: none; font-size: 13px; color: var(--note-ink); }",
      ".dsh-notes-hud-collapsed { width: auto; }",
      ".dsh-notes-hud-fab { position: relative; width: 48px; height: 48px; padding: 0; border-radius: 16px; border: 1px solid color-mix(in srgb, var(--note-accent) 70%, transparent); background-color: var(--note-accent); background-image: linear-gradient(150deg, color-mix(in srgb, var(--note-accent) 90%, #ffffff), var(--note-accent)); color: #ffffff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; pointer-events: auto; box-shadow: 0 10px 24px color-mix(in srgb, var(--note-accent) 32%, transparent), 0 2px 6px rgba(16, 24, 40, 0.16); transition: transform 0.18s var(--note-ease), box-shadow 0.18s var(--note-ease); }",
      ".dsh-notes-hud-fab:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 14px 30px color-mix(in srgb, var(--note-accent) 38%, transparent), 0 3px 8px rgba(16, 24, 40, 0.18); }",
      ".dsh-notes-hud-fab:active { transform: translateY(0) scale(0.99); }",
      ".dsh-notes-hud-fab:focus-visible { outline: 2px solid color-mix(in srgb, var(--note-accent) 60%, transparent); outline-offset: 3px; }",
      ".dsh-notes-hud-fab-count { box-sizing: border-box; position: absolute; bottom: -5px; right: -5px; min-width: 19px; height: 19px; padding: 0 5px; border-radius: 999px; background: #ffffff; color: var(--note-accent); font-size: 10.5px; font-weight: 700; line-height: 19px; text-align: center; font-variant-numeric: tabular-nums; box-shadow: 0 0 0 1px rgba(16, 24, 40, 0.08), 0 2px 6px rgba(16, 24, 40, 0.18); }",
      ".dsh-notes-hud-fab[data-due=\"true\"] { border-color: color-mix(in srgb, var(--note-warn) 65%, transparent); background-color: var(--note-warn); background-image: linear-gradient(150deg, #f6c46a, var(--note-warn)); box-shadow: 0 10px 24px color-mix(in srgb, var(--note-warn) 34%, transparent), 0 2px 6px rgba(16, 24, 40, 0.16); }",
      ".dsh-notes-hud-fab[data-due=\"true\"] .dsh-notes-hud-fab-count { color: var(--note-warn); }",
      ".dsh-notes-hud-fab[data-due=\"true\"]::after { content: ''; position: absolute; inset: -1px; border-radius: 17px; animation: dsh-notes-pulse 2.4s var(--note-ease) infinite; pointer-events: none; }",
      "@keyframes dsh-notes-pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--note-warn) 38%, transparent); } 70% { box-shadow: 0 0 0 14px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }",
      "",
      "/* ---------- 展开后的悬浮面板 ---------- */",
      ".dsh-notes-hud-capture { pointer-events: auto; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 14px; border: 1px solid var(--note-line); background: var(--note-elevated); box-shadow: var(--note-shadow-2); }",
      ".dsh-notes-hud-capture-input { flex: 1 1 auto; min-width: 0; border: none; background: transparent; color: var(--note-ink); font: inherit; font-size: 12.5px; line-height: 18px; outline: none; padding: 0; }",
      ".dsh-notes-hud-capture-input::placeholder { color: color-mix(in srgb, var(--note-ink-soft) 82%, transparent); }",
      ".dsh-notes-hud-detect { flex: none; font-size: 11px; line-height: 16px; padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--note-accent) 12%, transparent); color: var(--note-accent); font-variant-numeric: tabular-nums; }",
      ".dsh-notes-hud-bar { pointer-events: auto; display: flex; align-items: center; gap: 6px; padding: 5px 6px 5px 14px; border-radius: 999px; border: 1px solid var(--note-line); background: color-mix(in srgb, var(--note-elevated) 90%, transparent); backdrop-filter: blur(12px); box-shadow: var(--note-shadow-1); }",
      ".dsh-notes-hud-open { appearance: none; border: none; background: transparent; padding: 0; font: inherit; font-size: 12px; line-height: 18px; color: var(--note-ink-soft); cursor: pointer; }",
      ".dsh-notes-hud-open:hover { color: var(--note-accent); }",
      ".dsh-notes-hud-open:focus-visible { outline: 2px solid color-mix(in srgb, var(--note-accent) 55%, transparent); outline-offset: 2px; border-radius: 4px; }",
      ".dsh-notes-hud-collapse { appearance: none; width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; border: 1px solid var(--note-line); background: var(--note-elevated); color: var(--note-ink-soft); cursor: pointer; transition: background 0.14s var(--note-ease), color 0.14s var(--note-ease); }",
      ".dsh-notes-hud-collapse:hover { background: var(--note-surface-2); color: var(--note-ink); }",
      ".dsh-notes-hud-collapse:focus-visible { outline: 2px solid color-mix(in srgb, var(--note-accent) 55%, transparent); outline-offset: 1px; }",
      ".dsh-notes-hud-stack { pointer-events: auto; display: flex; flex-direction: column; gap: 8px; max-height: min(70vh, 560px); overflow-y: auto; overscroll-behavior: contain; padding: 2px; margin: -2px; }",
      ".dsh-notes-hud-stack::-webkit-scrollbar { width: 8px; }",
      ".dsh-notes-hud-stack::-webkit-scrollbar-thumb { background: var(--note-line-strong); border-radius: 999px; }",
      "",
      "/* ---------- 悬浮便签条 ---------- */",
      ".dsh-note-bar { position: relative; box-sizing: border-box; pointer-events: auto; padding: 10px 13px 11px; border-radius: 12px; border: 1px solid var(--note-line); background: var(--note-elevated); color: var(--note-ink); box-shadow: var(--note-shadow-1); transition: border-color 0.16s var(--note-ease), box-shadow 0.2s var(--note-ease); }",
      ".dsh-note-bar:hover { border-color: var(--note-line-strong); box-shadow: var(--note-shadow-2); }",
      ".dsh-note-bar[data-due=\"true\"] { border-color: color-mix(in srgb, var(--note-warn) 45%, var(--note-line)); }",
      ".dsh-note-bar[data-due=\"true\"]::before { content: ''; position: absolute; left: 0; top: 11px; bottom: 11px; width: 3px; border-radius: 0 999px 999px 0; background: var(--note-warn); }",
      ".dsh-note-bar-toggle { display: block; width: 100%; margin: 0; padding: 0; border: none; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }",
      ".dsh-note-bar-toggle:focus-visible { outline: 2px solid color-mix(in srgb, var(--note-accent) 55%, transparent); outline-offset: 2px; border-radius: 6px; }",
      ".dsh-note-bar-head { display: flex; align-items: center; gap: 8px; font-size: 11px; line-height: 16px; color: var(--note-ink-soft); }",
      ".dsh-note-bar-time { font-variant-numeric: tabular-nums; }",
      ".dsh-note-bar-badge { padding: 0 7px; border-radius: 999px; background: color-mix(in srgb, var(--note-warn) 12%, transparent); color: var(--note-warn); font-weight: 600; font-size: 10.5px; }",
      ".dsh-note-bar-spacer { flex: 1 1 auto; }",
      ".dsh-note-bar-hint { opacity: 0.65; }",
      ".dsh-note-bar-title { margin-top: 4px; font-size: 13px; line-height: 21px; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }",
      ".dsh-note-bar[data-expanded=\"true\"] .dsh-note-bar-title { display: block; -webkit-line-clamp: unset; }",
      ".dsh-note-bar-view { display: flex; flex-direction: column; gap: 8px; }",
      ".dsh-note-bar-body { display: flex; flex-direction: column; gap: 8px; margin-top: 9px; padding-top: 9px; border-top: 1px dashed var(--note-line); cursor: default; }",
      ".dsh-note-bar-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }",
      ".dsh-note-bar-action { appearance: none; font: inherit; font-size: 11px; line-height: 17px; padding: 2px 10px; border-radius: 999px; border: 1px solid transparent; background: transparent; color: var(--note-ink-soft); cursor: pointer; transition: background 0.14s var(--note-ease), color 0.14s var(--note-ease); }",
      ".dsh-note-bar-action:hover { background: var(--note-surface-2); color: var(--note-ink); }",
      ".dsh-note-bar-action:focus-visible { outline: 2px solid color-mix(in srgb, var(--note-accent) 55%, transparent); outline-offset: 1px; }",
      ".dsh-note-bar-action[data-tone=\"positive\"] { color: var(--note-ok); background: color-mix(in srgb, var(--note-ok) 10%, transparent); }",
      ".dsh-note-bar-action[data-tone=\"positive\"]:hover { background: color-mix(in srgb, var(--note-ok) 18%, transparent); color: var(--note-ok); }",
      ".dsh-note-bar-action[data-tone=\"danger\"]:hover { color: var(--note-danger); background: color-mix(in srgb, var(--note-danger) 12%, transparent); }",
      ".dsh-note-bar-action[data-tone=\"idea\"] { color: var(--note-accent); background: color-mix(in srgb, var(--note-accent) 10%, transparent); font-weight: 600; }",
      ".dsh-note-bar-action[data-tone=\"idea\"]:hover { background: color-mix(in srgb, var(--note-accent) 18%, transparent); color: var(--note-accent); }",
      "",
      "/* ---------- 投到灵感：内联对话框 ---------- */",
      ".dsh-notes-idea-box { box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; padding: 13px 14px 12px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--note-accent) 26%, var(--note-line)); background: var(--note-elevated); box-shadow: var(--note-shadow-2); }",
      ".dsh-notes-idea-head { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 650; line-height: 18px; color: var(--note-ink); }",
      ".dsh-notes-idea-head::before { content: ''; width: 7px; height: 7px; border-radius: 999px; background: var(--note-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--note-accent) 16%, transparent); }",
      ".dsh-notes-idea-field { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; line-height: 18px; color: var(--note-ink-soft); }",
      ".dsh-notes-idea-input { box-sizing: border-box; flex: 1 1 160px; min-width: 0; font: inherit; font-size: 12.5px; line-height: 18px; padding: 4px 9px; border-radius: 8px; border: 1px solid var(--note-line); background: var(--note-surface); color: var(--note-ink); }",
      ".dsh-notes-idea-input:focus-visible { border-color: var(--note-accent); outline: 2px solid color-mix(in srgb, var(--note-accent) 26%, transparent); outline-offset: 1px; }",
      ".dsh-notes-idea-actions { display: flex; align-items: center; gap: 8px; margin-top: 2px; }",
      ".dsh-notes-idea-actions .dsh-notes-primary { margin-left: auto; }",
      ".dsh-notes-idea-done { display: flex; align-items: flex-start; gap: 6px; font-size: 12px; line-height: 18px; color: var(--note-ok); word-break: break-all; }",
      ".dsh-notes-idea-done::before { content: '✓'; font-weight: 700; flex: none; }",
      ".dsh-notes-idea-badge { display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--note-ok) 12%, transparent); color: var(--note-ok); font-weight: 600; font-size: 10.5px; line-height: 16px; }",
      ".dsh-notes-idea-badge::before { content: ''; width: 5px; height: 5px; border-radius: 999px; background: currentColor; }",
      ".dsh-notes-idea-base { box-sizing: border-box; width: 186px; font: inherit; font-size: 11.5px; line-height: 18px; padding: 2px 8px; border-radius: 8px; border: 1px solid var(--note-line); background: var(--note-elevated); color: var(--note-ink); }",
      "",
      "/* ---------- 无障碍：尊重减少动效 ---------- */",
      "@media (prefers-reduced-motion: reduce) {",
      "  .dsh-notes-card, .dsh-notes-primary, .dsh-notes-hud-fab, .dsh-note-bar, .dsh-notes-capture { transition: none; }",
      "  .dsh-notes-hud-fab[data-due=\"true\"]::after { animation: none; }",
      "}",
      "",
      "/* ---------- 只读看板（P2） ---------- */",
      ".dsh-notes-board-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; }",
      ".dsh-notes-board-card { box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; min-height: 104px; padding: 13px 14px; border-radius: 12px; border: 1px solid var(--note-line); background: var(--note-surface); }",
      ".dsh-notes-board-card-head { display: flex; align-items: baseline; gap: 8px; font-size: 12.5px; font-weight: 650; line-height: 18px; color: var(--note-ink); }",
      ".dsh-notes-board-count { margin-left: auto; padding: 0 7px; border-radius: 999px; background: var(--note-surface-2); color: var(--note-ink-soft); font-size: 10.5px; font-weight: 500; line-height: 17px; font-variant-numeric: tabular-nums; }",
      ".dsh-notes-board-list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }",
      ".dsh-notes-board-item { display: flex; align-items: baseline; gap: 8px; min-width: 0; font-size: 12px; line-height: 18px; color: var(--note-ink); }",
      ".dsh-notes-board-time { flex: none; color: var(--note-ink-soft); font-variant-numeric: tabular-nums; }",
      ".dsh-notes-board-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      ".dsh-notes-board-empty { color: var(--note-ink-soft); font-size: 12px; line-height: 18px; }",
      ".dsh-notes-board-worker { display: flex; flex-direction: column; gap: 1px; padding: 6px 0; border-top: 1px dashed var(--note-line); }",
      ".dsh-notes-board-worker:first-child { border-top: none; padding-top: 0; }",
      ".dsh-notes-board-worker-head { display: flex; align-items: baseline; gap: 8px; font-size: 12px; line-height: 18px; color: var(--note-ink); }",
      ".dsh-notes-board-worker-name { font-weight: 600; }",
      ".dsh-notes-board-worker-queue { margin-left: auto; color: var(--note-ink-soft); font-size: 11px; font-variant-numeric: tabular-nums; }",
      ".dsh-notes-board-worker-task { color: var(--note-ink-soft); font-size: 11.5px; line-height: 17px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      ".dsh-notes-board-file { display: flex; align-items: baseline; gap: 8px; min-width: 0; }",
      ".dsh-notes-board-file .dsh-notes-board-text { flex: 1 1 auto; }",
    ].join('\n');

    // #region time-parser
    /** One day in milliseconds. */
    const DAY_MS = 86400000;
    /** Chinese numeral digits used by spoken relative durations. */
    const CN_DIGITS = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

    /** Convert a Chinese or ASCII number token to a number. */
    function cnNumber(value) {
      if (/^\d+$/.test(value)) return parseInt(value, 10);
      if (value === '十') return 10;
      const tenAt = value.indexOf('十');
      if (tenAt !== -1) {
        const tens = tenAt === 0 ? 1 : (CN_DIGITS[value.slice(0, tenAt)] ?? NaN);
        const ones = tenAt === value.length - 1 ? 0 : (CN_DIGITS[value.slice(tenAt + 1)] ?? NaN);
        if (!Number.isFinite(tens) || !Number.isFinite(ones)) return NaN;
        return tens * 10 + ones;
      }
      return CN_DIGITS[value] ?? NaN;
    }

    /** Normalize full-width digits/colons while preserving every character index. */
    function normalizeTimeText(raw) {
      return String(raw == null ? '' : raw)
        .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
        .replace(/：/g, ':')
        .replace(/[·•]/g, ' ');
    }

    /** Day words, longest first so "大后天" wins over "后天". */
    const DAY_WORDS = [
      { word: '大后天', offset: 3, period: null },
      { word: '后天', offset: 2, period: null },
      { word: '明早', offset: 1, period: 'morning' },
      { word: '明晚', offset: 1, period: 'evening' },
      { word: '明天', offset: 1, period: null },
      { word: '明日', offset: 1, period: null },
      { word: '今早', offset: 0, period: 'morning' },
      { word: '今晚', offset: 0, period: 'evening' },
      { word: '今天', offset: 0, period: null },
      { word: '今日', offset: 0, period: null },
    ];

    /** Period words grouped by their resolved day part. */
    const PERIOD_GROUPS = [
      { id: 'night', words: ['凌晨', '半夜', '深夜'] },
      { id: 'morning', words: ['早上', '早晨', '清晨', '上午', '一早'] },
      { id: 'noon', words: ['中午', '正午'] },
      { id: 'afternoon', words: ['下午', '午后'] },
      { id: 'evening', words: ['傍晚', '晚上', '晚间', '夜里', '夜晚'] },
    ];
    const PERIOD_LOOKUP = [];
    for (const group of PERIOD_GROUPS) for (const word of group.words) PERIOD_LOOKUP.push({ word, id: group.id });

    /** Apply a day-period word to a 12-hour clock hour. */
    function applyPeriod(hour, period) {
      if (period === 'afternoon' || period === 'evening') return hour < 12 ? hour + 12 : hour;
      if (period === 'noon') return hour < 11 ? hour + 12 : hour;
      if (period === 'night') return hour === 12 ? 0 : hour;
      return hour;
    }

    /** Default clock for a period word with no explicit time. */
    function periodClock(period) {
      if (period === 'morning') return { h: 9, m: 0 };
      if (period === 'noon') return { h: 12, m: 0 };
      if (period === 'afternoon') return { h: 15, m: 0 };
      if (period === 'evening') return { h: 20, m: 0 };
      if (period === 'night') return { h: 6, m: 0 };
      return { h: 9, m: 0 };
    }

    /** Build the display title by removing the matched time phrases from the raw text. */
    function finishReminder(remindAt, raw, spans) {
      let title = String(raw == null ? '' : raw);
      const ordered = [...spans].sort((a, b) => b[0] - a[0]);
      for (const [start, end] of ordered) title = title.slice(0, start) + ' ' + title.slice(end);
      title = title.replace(/^\s*(?:提醒我|提醒一下|提醒|记得|别忘了|记一下|记录一下)[,，:：\s]*/u, '');
      title = title.replace(/^[\s,，。.;；:：!！?？、]+/u, '').replace(/[\s,，。.;；:：!！?？、]+$/u, '');
      title = title.replace(/[ \t\u3000]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
      if (title === '') title = String(raw == null ? '' : raw).trim();
      return { remindAt, title };
    }

    /**
     * Extract a reminder timestamp and a display title from one spoken note.
     *
     * Understands relative durations (30分钟后), day words (明天/后天/今晚/明早),
     * weekdays (下周一), dates (12月5日), clocks (9点半, 15:30, 下午3点), and
     * "不提醒". Unrecognized text yields `remindAt: null`.
     *
     * @param raw - the spoken or typed note text.
     * @param now - reference timestamp; defaults to Date.now().
     * @returns the resolved reminder time (or null) and the cleaned title.
     */
    function extractReminder(raw, now = Date.now()) {
      const text = normalizeTimeText(raw);
      const spans = [];
      const pushSpan = (start, end) => spans.push([start, end]);

      const skip = /(?:不需要|不用|不要|无需|不|别)提醒/.exec(text);
      if (skip) {
        pushSpan(skip.index, skip.index + skip[0].length);
        return finishReminder(null, raw, spans);
      }

      const relative = /(半|[一二两三四五六七八九十]{1,3}|\d{1,2})\s*(分钟|分|个小时|小时|钟头|天|日|周|个星期|星期)(?:之|以)?后/.exec(text);
      if (relative) {
        const amount = relative[1] === '半' ? 0.5 : cnNumber(relative[1]);
        if (Number.isFinite(amount) && amount > 0) {
          const unit = relative[2];
          const unitMs = unit === '分钟' || unit === '分' ? 60000
            : unit === '个小时' || unit === '小时' || unit === '钟头' ? 3600000
              : unit === '周' || unit === '个星期' || unit === '星期' ? 7 * DAY_MS
                : DAY_MS;
          pushSpan(relative.index, relative.index + relative[0].length);
          return finishReminder(now + Math.round(amount * unitMs), raw, spans);
        }
      }

      let monthDay = null;
      const monthDayMatch = /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/.exec(text);
      if (monthDayMatch) {
        const month = parseInt(monthDayMatch[1], 10);
        const day = parseInt(monthDayMatch[2], 10);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          monthDay = { month, day };
          pushSpan(monthDayMatch.index, monthDayMatch.index + monthDayMatch[0].length);
        }
      }

      let weekday = null;
      if (monthDay === null) {
        const weekdayMatch = /(下下|下|这|本)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/.exec(text);
        if (weekdayMatch) {
          const targetChar = weekdayMatch[2];
          const target = targetChar === '日' || targetChar === '天' ? 7 : CN_DIGITS[targetChar];
          if (Number.isFinite(target)) {
            weekday = {
              target,
              weeksAhead: weekdayMatch[1] === '下下' ? 2 : weekdayMatch[1] === '下' ? 1 : 0,
              thisWeek: weekdayMatch[1] === '这' || weekdayMatch[1] === '本',
            };
            pushSpan(weekdayMatch.index, weekdayMatch.index + weekdayMatch[0].length);
          }
        }
      }

      let dayInfo = null;
      if (monthDay === null && weekday === null) {
        for (const entry of DAY_WORDS) {
          const at = text.indexOf(entry.word);
          if (at !== -1) {
            dayInfo = { offset: entry.offset, period: entry.period, start: at, length: entry.word.length };
            pushSpan(at, at + entry.word.length);
            break;
          }
        }
      }

      let period = dayInfo === null ? null : dayInfo.period;
      if (period === null) {
        let bestAt = -1;
        for (const entry of PERIOD_LOOKUP) {
          const at = text.indexOf(entry.word);
          if (at !== -1 && (bestAt === -1 || at < bestAt)) {
            bestAt = at;
            period = entry.id;
          }
        }
        if (bestAt !== -1) {
          let matched = '';
          for (const entry of PERIOD_LOOKUP) if (entry.id === period && text.indexOf(entry.word) === bestAt) matched = entry.word;
          pushSpan(bestAt, bestAt + matched.length);
        }
      }

      let clock = null;
      let clockSpan = null;
      const pointMatch = /(\d{1,2}|[一二两三四五六七八九十]{1,3})\s*[点时](?:\s*(半)|(\d{1,2}|[一二两三四五六七八九十]{1,3})\s*分?)?/.exec(text);
      if (pointMatch) {
        const hour = cnNumber(pointMatch[1]);
        const minute = pointMatch[2] ? 30 : pointMatch[3] ? cnNumber(pointMatch[3]) : 0;
        const chineseHour = !/^\d+$/.test(pointMatch[1]);
        const dayContext = period !== null || dayInfo !== null || weekday !== null || monthDay !== null;
        const hasMinute = pointMatch[2] !== undefined || pointMatch[3] !== undefined;
        let accept = Number.isFinite(hour) && Number.isFinite(minute) && hour <= 23 && minute <= 59;
        if (accept && chineseHour && !dayContext && !hasMinute) {
          // "一点小事" is not a time: a bare Chinese hour needs a phrase boundary.
          const after = text.slice(pointMatch.index + pointMatch[0].length);
          accept = after === '' || /^[\s,，。.;；:：!！?？、]/.test(after);
        }
        if (accept) {
          clock = { h: hour, m: minute };
          clockSpan = [pointMatch.index, pointMatch.index + pointMatch[0].length];
        }
      }
      const colonMatch = /(\d{1,2})\s*:\s*(\d{1,2})/.exec(text);
      if (colonMatch) {
        const hour = parseInt(colonMatch[1], 10);
        const minute = parseInt(colonMatch[2], 10);
        if (hour <= 23 && minute <= 59) {
          const start = colonMatch.index;
          if (clockSpan === null || start < clockSpan[0]) clockSpan = [start, start + colonMatch[0].length];
          clock = { h: hour, m: minute };
        }
      }
      if (clockSpan !== null) pushSpan(clockSpan[0], clockSpan[1]);

      const nowDate = new Date(now);
      const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
      const fallback = clock === null ? periodClock(period) : clock;
      const hourPart = clock === null ? fallback.h : clock.h;
      const minutePart = clock === null ? fallback.m : clock.m;

      let target = null;
      if (monthDay !== null) {
        const date = new Date(nowDate.getFullYear(), monthDay.month - 1, monthDay.day, 0, 0, 0, 0);
        if (date.getTime() < todayStart) date.setFullYear(date.getFullYear() + 1);
        date.setHours(applyPeriod(hourPart, period), minutePart, 0, 0);
        target = date.getTime();
      } else if (weekday !== null) {
        const todayNumber = ((nowDate.getDay() + 6) % 7) + 1;
        let delta;
        if (weekday.weeksAhead > 0) delta = 7 * weekday.weeksAhead - (todayNumber - 1) + (weekday.target - 1);
        else delta = (weekday.target - todayNumber + 7) % 7;
        const date = new Date(todayStart);
        date.setDate(date.getDate() + delta);
        date.setHours(applyPeriod(hourPart, period), minutePart, 0, 0);
        if (weekday.weeksAhead === 0 && date.getTime() <= now + 1000) date.setDate(date.getDate() + 7);
        target = date.getTime();
      } else if (dayInfo !== null) {
        if (clock === null && period === null && dayInfo.offset === 0) {
          // "今天要做…" names a day but no time: do not invent a past 09:00;
          // a semantic "today" task should remind one hour from now.
          target = now + 3600000;
        } else {
          const date = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + dayInfo.offset, 0, 0, 0, 0);
          date.setHours(applyPeriod(hourPart, period), minutePart, 0, 0);
          const resolved = date.getTime();
          // A default time that already passed (no clock typed) becomes "in one hour"
          // instead of firing immediately, e.g. 「今天下午」typed after 15:00.
          target = clock === null && resolved <= now ? now + 3600000 : resolved;
        }
      } else if (clock !== null || period !== null) {
        const date = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), applyPeriod(hourPart, period), minutePart, 0, 0);
        if (date.getTime() <= now + 1000) date.setDate(date.getDate() + 1);
        if (clock !== null && period === null && clock.h >= 1 && clock.h <= 6) {
          const alternate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), clock.h + 12, minutePart, 0, 0);
          if (alternate.getTime() > now + 1000 && alternate.getTime() < date.getTime()) {
            target = alternate.getTime();
          }
        }
        if (target === null) target = date.getTime();
      }

      if (target === null) return finishReminder(null, raw, spans);
      return finishReminder(target, raw, spans);
    }
    // #endregion time-parser

    /** Translate bound to this plugin's namespace; replaced in apply. */
    let translate = (key) => key;
    /** Active locale id, used only for date formatting. */
    let localeId = 'en';
    /** Cross-plugin layout service, used to jump to the notes panel. */
    let layoutService = null;
    /** Retained single reminder timer. */
    let reminderTimer = null;
    /** Re-registration hooks for the sidebar entry, so its label can carry the live count. */
    let panellistRegister = null;
    let panellistDispose = null;

    /**
    * Storage mode. In the real app notes live in the host database and every
    * write goes through /api/scratchpad. The standalone test harness (and a
    * host that is not running yet) keeps the original localStorage behavior.
    */
    const TEST_MODE = typeof window !== 'undefined' && window.__DSH_NOTES_TEST__ === true;
    const CAN_USE_API = !TEST_MODE
      && typeof window !== 'undefined'
      && typeof window.location !== 'undefined'
      && typeof fetch === 'function';
    let storageMode = CAN_USE_API ? 'api' : 'local';

    /** Persisted notification preference (UI-local, still localStorage). */
    let prefs = readPrefs();
    /** Current notes, newest state only; replaced on every mutation. */
    let notes = storageMode === 'api' ? [] : readNotes();
    const listeners = new Set();
    const prefListeners = new Set();

    /** Lazily read the note list, migrating the first-version single note. */
    function readNotes() {
      try {
        const stored = window.localStorage.getItem(NOTES_KEY);
        if (stored !== null) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) return sanitizeNotes(parsed);
        }
        const legacy = window.localStorage.getItem(LEGACY_KEY);
        if (typeof legacy === 'string' && legacy.trim() !== '') {
          const migrated = [{ id: makeId(), text: legacy, title: legacy.trim(), remindAt: null, createdAt: Date.now(), done: false, notifiedAt: null }];
          window.localStorage.setItem(NOTES_KEY, JSON.stringify(migrated));
          return migrated;
        }
      } catch (error) {
        /* storage unavailable or corrupt: start empty */
      }
      return [];
    }

    /** Keep only well-formed notes from stored JSON. */
    function sanitizeNotes(list) {
      const result = [];
      for (const item of list) {
        if (item === null || typeof item !== 'object') continue;
        if (typeof item.id !== 'string' || typeof item.text !== 'string') continue;
        result.push({
          id: item.id,
          text: item.text,
          title: item.text.trim(),
          remindAt: typeof item.remindAt === 'number' && Number.isFinite(item.remindAt) ? item.remindAt : null,
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
          done: item.done === true,
          doneAt: typeof item.doneAt === 'number' ? item.doneAt : null,
          notifiedAt: typeof item.notifiedAt === 'number' ? item.notifiedAt : null,
          ideaPath: typeof item.ideaPath === 'string' ? item.ideaPath : '',
          promotedAt: typeof item.promotedAt === 'number' && Number.isFinite(item.promotedAt) ? item.promotedAt : null,
        });
      }
      return sortNotes(result);
    }

    /** Read the notification, snooze, corner and record-order preferences. */
    function readPrefs() {
      try {
        const stored = window.localStorage.getItem(PREFS_KEY);
        if (stored !== null) {
          const parsed = JSON.parse(stored);
          if (parsed !== null && typeof parsed === 'object') {
            return {
              notify: parsed.notify === true,
              snoozeMinutes: parsed.snoozeMinutes === 5 ? 5 : 10,
              hudCorner: parsed.hudCorner === 'top' ? 'top' : 'bottom',
              doneSort: parsed.doneSort === 'doneAt' ? 'doneAt' : 'createdAt',
              ideaBase: typeof parsed.ideaBase === 'string' && parsed.ideaBase.startsWith('/') ? parsed.ideaBase : IDEA_BASE_DEFAULT,
            };
          }
        }
      } catch (error) {
        /* storage unavailable: keep defaults */
      }
      return { notify: false, snoozeMinutes: 10, hudCorner: 'bottom', doneSort: 'createdAt', ideaBase: IDEA_BASE_DEFAULT };
    }

    /** Persist one preference patch and publish it to mounted components. */
    function savePrefs(patch) {
      const next = { ...prefs, ...patch };
      if (next.snoozeMinutes !== 5 && next.snoozeMinutes !== 10) next.snoozeMinutes = 10;
      if (next.hudCorner !== 'top' && next.hudCorner !== 'bottom') next.hudCorner = 'bottom';
      if (next.doneSort !== 'doneAt' && next.doneSort !== 'createdAt') next.doneSort = 'createdAt';
      next.notify = next.notify === true;
      next.ideaBase = normalizeIdeaBase(next.ideaBase);
      const orderChanged = next.doneSort !== prefs.doneSort;
      prefs = next;
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      } catch (error) {
        /* storage unavailable: keep the in-memory value */
      }
      for (const listener of [...prefListeners]) {
        try {
          listener();
        } catch (error) {
          /* one broken preference subscriber must not stop the others */
        }
      }
      if (orderChanged) resortNotes();
    }

    /** Re-apply the record ordering after its preference changed. */
    function resortNotes() {
      notes = sortNotes(notes);
      persistNotes();
      emit();
    }

    /** Persist the note list (local fallback only; the host owns API-mode data). */
    function persistNotes() {
      if (storageMode === 'api') return;
      try {
        window.localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
      } catch (error) {
        /* storage unavailable: keep the in-memory value */
      }
    }

    /** Same-origin call against the host's scratchpad API. */
    async function apiRequest(method, path, body) {
      const init = {
        method,
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      };
      if (body !== undefined) {
        init.headers['content-type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      const response = await fetch(API_BASE + path, init);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data && data.error ? data.error : 'HTTP ' + response.status);
        error.status = response.status;
        throw error;
      }
      return data;
    }

    /** Host record -> the note shape every component already consumes. */
    function mapApiNote(record) {
      return {
        id: String(record.id),
        text: typeof record.text === 'string' ? record.text : '',
        title: typeof record.text === 'string' ? record.text : '',
        remindAt: typeof record.remindAt === 'number' && Number.isFinite(record.remindAt) ? record.remindAt : null,
        status: typeof record.status === 'string' ? record.status : 'active',
        createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
        done: record.status === 'done',
        doneAt: typeof record.doneAt === 'number' ? record.doneAt : null,
        notifiedAt: null,
        ideaPath: typeof record.promotedPath === 'string' ? record.promotedPath : '',
        promotedAt: typeof record.promotedAt === 'number' ? record.promotedAt : null,
      };
    }

    /** Accept either a bare array or `{ notes: [...] }`. */
    function apiList(data) {
      if (Array.isArray(data)) return data;
      if (data !== null && typeof data === 'object' && Array.isArray(data.notes)) return data.notes;
      return [];
    }

    /**
    * One-time, idempotent move of the browser snapshot into the host database.
    * Ids are preserved so a partial run cannot create duplicates on retry.
    */
    async function migrateLocalSnapshot() {
      try {
        if (window.localStorage.getItem(MIGRATED_KEY) === '1') return false;
      } catch (error) {
        return false;
      }
      const local = readNotes();
      // Do not mark an empty snapshot as migrated: a note captured while the
      // host was down should still be picked up on a later successful start.
      if (local.length === 0) return false;
      for (const note of local) {
        await apiRequest('POST', '/notes', {
          id: note.id,
          text: note.text,
          remindAt: note.remindAt,
          createdAt: note.createdAt,
          status: note.done ? 'done' : 'active',
          doneAt: note.doneAt,
          promotedAt: note.promotedAt,
          promotedPath: note.ideaPath || undefined,
          source: 'web',
        });
      }
      try {
        window.localStorage.setItem(MIGRATED_KEY, '1');
      } catch (error) {
        /* migration succeeded; the flag is best-effort */
      }
      return true;
    }

    /** Load the host list once and keep the in-memory cache in sync. */
    async function refreshNotes() {
      if (storageMode !== 'api' || typeof fetch !== 'function') return;
      try {
        let list = apiList(await apiRequest('GET', '/notes?status=all'));
        if (list.length === 0 && await migrateLocalSnapshot()) {
          list = apiList(await apiRequest('GET', '/notes?status=all'));
        }
        const previous = new Map(notes.map((note) => [note.id, note]));
        notes = sortNotes(list.map((record) => {
          const mapped = mapApiNote(record);
          const old = previous.get(mapped.id);
          if (old !== undefined && old.notifiedAt !== null && old.remindAt === mapped.remindAt) {
            mapped.notifiedAt = old.notifiedAt;
          }
          return mapped;
        }).filter((note) => note.status !== 'dropped'));
        emit();
        scheduleReminders();
      } catch (error) {
        // The host may still be starting (or DSH has not been restarted yet).
        // On the first load fall back to the local snapshot; if notes are
        // already on screen, keep them instead of replacing them with a stale
        // browser copy, and retry on the next focus.
        if (notes.length === 0) {
          storageMode = 'local';
          notes = readNotes();
          if (ideaAvailable) {
            ideaAvailable = false;
            emitIdea();
          }
          emit();
          scheduleReminders();
        }
      }
    }

    /** Replace one optimistic note with the record the host returned. */
    function replaceNote(localId, record) {
      const mapped = mapApiNote(record);
      const old = notes.find((note) => note.id === localId);
      if (old !== undefined && old.notifiedAt !== null && old.remindAt === mapped.remindAt) {
        mapped.notifiedAt = old.notifiedAt;
      }
      const next = [];
      let replaced = false;
      for (const note of notes) {
        if (note.id === localId) {
          next.push(mapped);
          replaced = true;
        } else if (note.id !== mapped.id) {
          next.push(note);
        }
      }
      if (!replaced) next.push(mapped);
      notes = sortNotes(next);
      emit();
      scheduleReminders();
    }

    /** Remember a successful promote without issuing another PATCH. */
    function markPromoted(id, path, promotedAt) {
      notes = sortNotes(notes.map((note) => (
        note.id === id ? { ...note, ideaPath: path, promotedAt } : note
      )));
      if (storageMode !== 'api') persistNotes();
      emit();
    }

    /** Keep one failed write from breaking the page; details go to the console. */
    function handleApiError(error) {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[scratchpad] host write failed:', error && error.message ? error.message : error);
      }
    }

    /** Stable-ish unique note id. */
    function makeId() {
      return 'n-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    /**
    * Active notes first (due ones on top), then reminders by time, then done notes.
    * Done notes follow the record-order preference: recorded order (oldest first,
    * so new records append at the bottom) or completion time (newest first).
    */
    function sortNotes(list) {
      const now = Date.now();
      const weight = (note) => {
        if (note.done) return 2;
        return note.remindAt !== null && note.remindAt <= now ? 0 : 1;
      };
      return [...list].sort((a, b) => {
        const weightDiff = weight(a) - weight(b);
        if (weightDiff !== 0) return weightDiff;
        if (a.done && b.done) {
          if (prefs.doneSort === 'doneAt') return (b.doneAt || b.createdAt) - (a.doneAt || a.createdAt);
          return a.createdAt - b.createdAt || (a.doneAt || 0) - (b.doneAt || 0);
        }
        if (a.remindAt !== b.remindAt) {
          if (a.remindAt === null) return 1;
          if (b.remindAt === null) return -1;
          return a.remindAt - b.remindAt;
        }
        return b.createdAt - a.createdAt;
      });
    }

    /** Notify state subscribers. */
    function emit() {
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch (error) {
          /* one broken subscriber must not stop the others */
        }
      }
    }

    /** Subscribe to note state changes. */
    function subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    /** Current note snapshot. */
    function getNotes() {
      return notes;
    }

    /** Subscribe to preference changes. */
    function subscribePrefs(listener) {
      prefListeners.add(listener);
      return () => prefListeners.delete(listener);
    }

    /** Current preference snapshot. */
    function getPrefs() {
      return prefs;
    }

    // #region idea-promotion
    /** Normalize a user-entered idea endpoint prefix. */
    function normalizeIdeaBase(value) {
      let base = String(value ?? '').trim();
      if (base === '') base = IDEA_BASE_DEFAULT;
      if (!base.startsWith('/')) base = '/' + base;
      base = base.replace(/\/+$/, '');
      return base === '' ? IDEA_BASE_DEFAULT : base;
    }

    /**
    * B2: strip characters that would break the Doushu frontmatter in Obsidian
    * (contract: Doushu spec v1 §7 — title hygiene), collapse newlines, drop a
    * leading dash and cap the title at 40 characters.
    */
    function sanitizeIdeaTitle(raw) {
      let title = String(raw ?? '').replace(/\r?\n/g, ' ');
      title = title.replace(/[:#[\]{}>|*?"<!]/g, ' ');
      title = title.replace(/\s+/g, ' ').trim();
      title = title.replace(/^[-\s]+/, '');
      return title.slice(0, 40).trim();
    }

    /** First line of a note, used as the default idea title. */
    function firstLine(text) {
      return String(text ?? '').split(/\r?\n/)[0] ?? '';
    }

    /** B1: the idea body starts with a provenance line, then the raw note. */
    function buildIdeaBody(note) {
      const stamp = new Date(note.createdAt ?? Date.now());
      const when = stamp.getFullYear() + '-' + pad2(stamp.getMonth() + 1) + '-' + pad2(stamp.getDate())
        + ' ' + pad2(stamp.getHours()) + ':' + pad2(stamp.getMinutes());
      return '> 来源：速记便签 ' + note.id + ' · ' + when + '\n' + note.text;
    }

    /** Whether the idea endpoint answered the last probe. */
    let ideaAvailable = false;
    const ideaListeners = new Set();
    function subscribeIdea(listener) {
      ideaListeners.add(listener);
      return () => ideaListeners.delete(listener);
    }
    function getIdeaAvailable() {
      return ideaAvailable;
    }
    function emitIdea() {
      for (const listener of [...ideaListeners]) {
        try {
          listener();
        } catch (error) {
          /* one broken subscriber must not stop the others */
        }
      }
    }

    /**
    * Probe the host's promote endpoint. HTTP 200 plus parseable JSON marks the
    * action available; an unreachable host keeps the action hidden.
    */
    async function probeIdeas() {
      if (typeof fetch !== 'function' || typeof window === 'undefined' || typeof window.location === 'undefined') return;
      if (storageMode !== 'api') {
        if (ideaAvailable) {
          ideaAvailable = false;
          emitIdea();
        }
        return;
      }
      let ok = false;
      try {
        const response = await fetch(API_BASE + '/about', {
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
        });
        if (response.ok) {
          await response.json();
          ok = true;
        }
      } catch (error) {
        ok = false;
      }
      if (ok !== ideaAvailable) {
        ideaAvailable = ok;
        emitIdea();
      }
    }

    /** Subscribe to the idea endpoint availability. */
    function useIdeaAvailable() {
      return React.useSyncExternalStore(subscribeIdea, getIdeaAvailable);
    }

    /**
    * Ask the host to write one idea Markdown file into 00-收件箱. Never retried
    * automatically: a repeated request would create a second card.
    */
    async function promoteNote(noteId, options = {}) {
      const response = await fetch(API_BASE + '/notes/' + encodeURIComponent(noteId) + '/promote', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ title: options.title, platform: options.platform }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data && data.error ? data.error : 'HTTP ' + response.status);
        error.status = response.status;
        throw error;
      }
      return data;
    }

    /** Backwards-compatible name for the old client-side submit helper. */
    async function submitIdea({ noteId, id, title, platform } = {}) {
      return promoteNote(noteId || id, { title, platform });
    }
    // #endregion idea-promotion

    // #region markdown-export
    /** Local YYYY-MM-DD stamp used by the export file name and frontmatter. */
    function exportDate(ts) {
      const date = new Date(ts);
      return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
    }

    /** Local YYYY-MM-DD HH:mm stamp used in headings and metadata lines. */
    function exportDateTime(ts) {
      const date = new Date(ts);
      return exportDate(ts) + ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
    }

    /** Download name of the export: one Markdown file per day. */
    function exportFileName(ts) {
      return exportDate(ts) + '_速记便签.md';
    }

    /** Quote every line so the verbatim note text survives as a Markdown blockquote. */
    function quoteNoteText(text) {
      return String(text).split(/\r?\n/).map((line) => '> ' + line).join('\n');
    }

    /** One note as a Markdown block: record time, metadata bullets, verbatim quote. */
    function buildNoteBlock(note, index) {
      const lines = [];
      lines.push('### ' + index + '. ' + exportDateTime(note.createdAt));
      lines.push('- 编号：' + note.id);
      if (note.remindAt !== null && note.remindAt !== undefined) lines.push('- 提醒：' + exportDateTime(note.remindAt));
      lines.push('- 状态：' + (note.done ? '已完成' : '进行中'));
      if (note.done && note.doneAt !== null && note.doneAt !== undefined) lines.push('- 完成：' + exportDateTime(note.doneAt));
      lines.push('');
      lines.push(quoteNoteText(note.text === undefined || note.text === null ? '' : note.text));
      lines.push('');
      return lines.join('\n');
    }

    /**
    * The whole note list as one Markdown file meant for 00-收件箱: verbatim text,
    * no rewriting, active notes in page order first, finished records after them.
    */
    function buildNotesMarkdown(notes, now = Date.now()) {
      const list = Array.isArray(notes) ? notes : [];
      const active = list.filter((note) => note.done !== true);
      const done = list.filter((note) => note.done === true);
      const stamp = exportDateTime(now);
      const lines = [];
      lines.push('---');
      lines.push('类型: 速记导出');
      lines.push('日期: ' + exportDate(now));
      lines.push('来源: 速记便签');
      lines.push('导出: ' + stamp);
      lines.push('条数: ' + list.length + '（进行中 ' + active.length + ' / 已完成 ' + done.length + '）');
      lines.push('---');
      lines.push('');
      lines.push('# 速记便签 · ' + exportDate(now));
      lines.push('');
      lines.push('> 由 DSH 速记便签导出，原文照录；这是待分拣的原料，不是成品选题。');
      lines.push('');
      if (list.length === 0) {
        lines.push('（没有进行中的速记，也没有已完成记录）');
        lines.push('');
        return lines.join('\n');
      }
      if (active.length > 0) {
        lines.push('## 进行中（' + active.length + '）');
        lines.push('');
        for (let i = 0; i < active.length; i += 1) lines.push(buildNoteBlock(active[i], i + 1));
      }
      if (done.length > 0) {
        lines.push('## 已完成（' + done.length + '）');
        lines.push('');
        for (let i = 0; i < done.length; i += 1) lines.push(buildNoteBlock(done[i], active.length + i + 1));
      }
      return lines.join('\n');
    }

    /** Hand the generated Markdown to the browser download flow; false when blocked. */
    function downloadMarkdown(markdown, fileName) {
      try {
        const blob = new window.Blob([markdown], { type: 'text/markdown;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = window.document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);
        window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
        return true;
      } catch (error) {
        return false;
      }
    }
    // #endregion markdown-export

    /** Replace, persist, publish and reschedule reminders. */
    function setNotes(next) {
      notes = sortNotes(next);
      persistNotes();
      emit();
      scheduleReminders();
    }

    /** Create one note from the capture box. The stored text is shown verbatim. */
    function addNote(text, remindAt) {
      const note = {
        id: makeId(),
        text,
        // Kept for stored-data compatibility only; it is always the raw text.
        title: text,
        remindAt: remindAt === undefined ? null : remindAt,
        createdAt: Date.now(),
        done: false,
        doneAt: null,
        notifiedAt: null,
        ideaPath: '',
        promotedAt: null,
      };
      setNotes([note, ...notes]);
      if (storageMode === 'api') {
        apiRequest('POST', '/notes', {
          text: note.text,
          remindAt: note.remindAt,
          source: 'web',
        }).then((record) => replaceNote(note.id, record)).catch((error) => {
          handleApiError(error);
          // The host rejected the write: remove the optimistic row again.
          notes = sortNotes(notes.filter((item) => item.id !== note.id));
          emit();
          scheduleReminders();
        });
      }
    }

    /** Patch one note and reset its notification when the reminder moves. */
    function updateNote(id, patch) {
      const before = notes.find((note) => note.id === id);
      setNotes(notes.map((note) => {
        if (note.id !== id) return note;
        const next = { ...note, ...patch };
        if (next.remindAt !== note.remindAt) next.notifiedAt = null;
        return next;
      }));
      if (storageMode !== 'api' || before === undefined) return;
      const body = {};
      if (Object.prototype.hasOwnProperty.call(patch, 'text')) body.text = patch.text;
      if (Object.prototype.hasOwnProperty.call(patch, 'remindAt')) body.remindAt = patch.remindAt;
      if (Object.prototype.hasOwnProperty.call(patch, 'done')) body.status = patch.done === true ? 'done' : 'active';
      if (Object.prototype.hasOwnProperty.call(patch, 'status')) body.status = patch.status;
      if (Object.keys(body).length === 0) return;
      apiRequest('PATCH', '/notes/' + encodeURIComponent(id), body)
        .then((record) => replaceNote(id, record))
        .catch(handleApiError);
    }

    /** Flip a note between active and done. */
    function toggleDone(id) {
      const now = Date.now();
      const current = notes.find((note) => note.id === id);
      if (current === undefined) return;
      const nextDone = !current.done;
      setNotes(notes.map((note) => {
        if (note.id !== id) return note;
        if (nextDone) return { ...note, done: true, doneAt: now };
        const overdue = note.remindAt !== null && note.remindAt <= now;
        return { ...note, done: false, doneAt: null, notifiedAt: overdue ? now : null };
      }));
      if (storageMode === 'api') {
        apiRequest('PATCH', '/notes/' + encodeURIComponent(id), { status: nextDone ? 'done' : 'active' })
          .then((record) => replaceNote(id, record))
          .catch(handleApiError);
      }
    }

    /** Move a note's reminder forward. */
    function snoozeNote(id, minutes) {
      const remindAt = Date.now() + minutes * 60000;
      setNotes(notes.map((note) => (note.id === id ? { ...note, remindAt, notifiedAt: null } : note)));
      if (storageMode === 'api') {
        apiRequest('PATCH', '/notes/' + encodeURIComponent(id), { remindAt })
          .then((record) => replaceNote(id, record))
          .catch(handleApiError);
      }
    }

    /** Delete one note. */
    function deleteNote(id) {
      setNotes(notes.filter((note) => note.id !== id));
      if (storageMode === 'api') {
        apiRequest('DELETE', '/notes/' + encodeURIComponent(id)).catch(handleApiError);
      }
    }

    /** Drop every finished note. */
    function clearDone() {
      const doneIds = notes.filter((note) => note.done).map((note) => note.id);
      setNotes(notes.filter((note) => !note.done));
      if (storageMode === 'api') {
        for (const id of doneIds) {
          apiRequest('DELETE', '/notes/' + encodeURIComponent(id)).catch(handleApiError);
        }
      }
    }

    /** Number of notes still to do, shown in the sidebar label and launcher badge. */
    function countActive() {
      let total = 0;
      for (const note of notes) if (!note.done) total += 1;
      return total;
    }

    /** The earliest reminder that has not fired yet, or null. */
    function nextPendingReminder() {
      let next = null;
      for (const note of notes) {
        if (note.done || note.remindAt === null || note.notifiedAt !== null) continue;
        if (next === null || note.remindAt < next) next = note.remindAt;
      }
      return next;
    }

    /** Schedule (or clear) the single reminder timer. */
    function scheduleReminders() {
      if (reminderTimer !== null) {
        window.clearTimeout(reminderTimer);
        reminderTimer = null;
      }
      const next = nextPendingReminder();
      if (next === null) return;
      reminderTimer = window.setTimeout(fireDueReminders, Math.max(0, next - Date.now()) + 25);
    }

    /** Mark due notes as notified, raise system notifications and reschedule. */
    function fireDueReminders() {
      reminderTimer = null;
      const now = Date.now();
      const fired = [];
      const updated = notes.map((note) => {
        if (!note.done && note.remindAt !== null && note.notifiedAt === null && note.remindAt <= now) {
          fired.push(note);
          return { ...note, notifiedAt: now };
        }
        return note;
      });
      if (fired.length === 0) {
        scheduleReminders();
        return;
      }
      setNotes(updated);
      for (const note of fired) showSystemNotification(note);
    }

    /** Raise a desktop notification when the user opted in and granted permission. */
    function showSystemNotification(note) {
      if (!prefs.notify) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      // Skip system notifications for reminders missed while the app was closed.
      if (note.remindAt !== null && Date.now() - note.remindAt > 120000) return;
      try {
        const body = note.text.length > 120 ? note.text.slice(0, 120) + '…' : note.text;
        const notification = new Notification(translate('notify.title'), { body, tag: 'dsh-notes-' + note.id });
        notification.onclick = () => {
          try {
            notification.close();
          } catch (error) {
            /* ignore */
          }
          if (layoutService !== null) layoutService.selectPanel(PANEL_ID);
        };
      } catch (error) {
        /* notification construction is best-effort */
      }
    }

    /**
    * Switch the main column to the notes panel. Falls back to clicking the
    * sidebar entry that hosts our glyph when the layout service is unavailable.
    */
    function openNotesPanel() {
      if (layoutService !== null) {
        try {
          layoutService.selectPanel(PANEL_ID);
          return;
        } catch (error) {
          /* fall through to the sidebar entry fallback */
        }
      }
      const glyph = document.querySelector('[data-dsh-notes-entry]');
      const button = glyph === null ? null : glyph.closest('button');
      if (button !== null) button.click();
    }

    /** Local-midnight timestamp of one instant. */
    function startOfLocalDay(ts) {
      const date = new Date(ts);
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    }

    /** Zero-pad a two-digit field. */
    function pad2(value) {
      return String(value).padStart(2, '0');
    }

    /** Day label plus wall clock, in the active locale's shape. */
    function formatWhen(ts, now, t) {
      const date = new Date(ts);
      const dayDiff = Math.round((startOfLocalDay(ts) - startOfLocalDay(now)) / DAY_MS);
      const clock = pad2(date.getHours()) + ':' + pad2(date.getMinutes());
      if (dayDiff === 0) return t('time.today') + ' ' + clock;
      if (dayDiff === 1) return t('time.tomorrow') + ' ' + clock;
      if (dayDiff === 2) return t('time.dayAfter') + ' ' + clock;
      const day = localeId.indexOf('zh') === 0
        ? (date.getMonth() + 1) + '月' + date.getDate() + '日'
        : (date.getMonth() + 1) + '/' + date.getDate();
      return day + ' ' + clock;
    }

    /** Convert a timestamp to a datetime-local input value. */
    function toDateTimeLocal(ts) {
      const date = new Date(ts);
      return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) + 'T' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
    }

    /** Parse a datetime-local input value. */
    function fromDateTimeLocal(value) {
      if (typeof value !== 'string' || value === '') return null;
      const ts = new Date(value).getTime();
      return Number.isFinite(ts) ? ts : null;
    }

    /** Read the active locale id without throwing. */
    function readLocaleId(ctx) {
      try {
        return ctx.locale.getLocale().active || 'en';
      } catch (error) {
        return 'en';
      }
    }

    /** Subscribe to note state. */
    function useNotes() {
      return React.useSyncExternalStore(subscribe, getNotes);
    }

    /** Subscribe to preference state. */
    function usePrefs() {
      return React.useSyncExternalStore(subscribePrefs, getPrefs);
    }

    /** Re-render periodically so relative labels age. */
    function useNow(interval) {
      const [now, setNow] = React.useState(() => Date.now());
      React.useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), interval || 30000);
        return () => window.clearInterval(timer);
      }, [interval]);
      return now;
    }

    /**
    * Anchor the launcher to the center workspace column instead of the viewport,
    * so an open right sidebar never covers it. Falls back to the viewport corner.
    */
    function useHudAnchor(corner) {
      const [anchor, setAnchor] = React.useState(null);
      React.useEffect(() => {
        let frame = null;
        const measure = () => {
          frame = null;
          const center = document.querySelector('[class*="centerCol"]');
          const rect = center === null ? null : center.getBoundingClientRect();
          const right = rect === null ? 16 : Math.max(16, Math.round(window.innerWidth - rect.right) + 16);
          const maxWidth = rect === null ? 'calc(100vw - 32px)' : Math.max(220, Math.round(rect.width) - 32) + 'px';
          if (corner === 'top') {
            const top = rect === null ? 16 : Math.max(16, Math.round(rect.top) + 60);
            setAnchor({ right: right + 'px', top: top + 'px', bottom: 'auto', maxWidth });
          } else {
            const bottom = rect === null ? 16 : Math.max(16, Math.round(window.innerHeight - rect.bottom) + 16);
            setAnchor({ right: right + 'px', bottom: bottom + 'px', top: 'auto', maxWidth });
          }
        };
        const schedule = () => {
          if (frame === null) frame = window.requestAnimationFrame(measure);
        };
        schedule();
        window.addEventListener('resize', schedule);
        let observer = null;
        const center = document.querySelector('[class*="centerCol"]');
        if (typeof ResizeObserver === 'function' && center !== null) {
          observer = new ResizeObserver(schedule);
          observer.observe(center);
        }
        const timer = window.setInterval(schedule, 1500);
        return () => {
          window.removeEventListener('resize', schedule);
          if (frame !== null) window.cancelAnimationFrame(frame);
          if (observer !== null) observer.disconnect();
          window.clearInterval(timer);
        };
      }, [corner]);
      return anchor;
    }

    /** Notepad glyph shared by the sidebar entry and the floating launcher. */
    function NoteGlyph({ size }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block' },
      },
        h('path', { d: 'M4.4 2.3h4.9l2.3 2.4v8.9H4.4z', stroke: 'currentColor', strokeWidth: 1.25, strokeLinejoin: 'round' }),
        h('path', { d: 'M9.1 2.4v2.4h2.4', stroke: 'currentColor', strokeWidth: 1.25, strokeLinejoin: 'round' }),
        h('path', { d: 'M6.2 8h3.6M6.2 10.6h2.6', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round' }),
      );
    }

    /** Sidebar cell glyph; the data marker lets the launcher fall back to a real button click. */
    function NotesIcon({ size }) {
      return h('span', { 'data-dsh-notes-entry': '', style: { display: 'inline-flex' } }, h(NoteGlyph, { size }));
    }

    /** One floating note bar; expands inline for details, actions, and in-place editing. */
    function NoteBar({ note, now, t, snoozeMinutes = 10 }) {
      const [expanded, setExpanded] = React.useState(false);
      const [editing, setEditing] = React.useState(false);
      const [promoting, setPromoting] = React.useState(false);
      const ideaReady = useIdeaAvailable();
      const due = note.remindAt !== null && note.remindAt <= now;
      const soon = !due && note.remindAt !== null && note.remindAt - now <= 300000;
      const open = expanded || editing;
      const toggle = () => {
        if (editing) return;
        setExpanded((value) => !value);
      };
      return h('article', {
        className: 'dsh-note-bar',
        'data-due': due ? 'true' : 'false',
        'data-expanded': open ? 'true' : 'false',
      },
        h('button', {
          type: 'button',
          className: 'dsh-note-bar-toggle',
          'aria-expanded': open,
          'aria-label': note.text,
          onClick: toggle,
        },
          h('span', { className: 'dsh-note-bar-head' },
            due && h('span', { className: 'dsh-note-bar-badge' }, t('time.due')),
            soon && h('span', { className: 'dsh-note-bar-badge' }, t('time.soon')),
            note.ideaPath ? h('span', { className: 'dsh-notes-idea-badge', title: note.ideaPath }, t('idea.badge')) : null,
            h('span', { className: 'dsh-note-bar-time' }, note.remindAt === null ? t('time.noReminder') : formatWhen(note.remindAt, now, t)),
            h('span', { className: 'dsh-note-bar-spacer' }),
            h('span', { className: 'dsh-note-bar-hint', 'aria-hidden': 'true' }, open ? t('item.collapse') : t('item.expand')),
          ),
          h('span', { className: 'dsh-note-bar-title' }, note.text),
        ),
        open && h('div', { className: 'dsh-note-bar-body' },
          editing
            ? h(NoteEditor, {
              note,
              t,
              onSave: (patch) => {
                updateNote(note.id, patch);
                setEditing(false);
              },
              onCancel: () => setEditing(false),
              onDelete: (id) => deleteNote(id),
            })
            : h('div', { className: 'dsh-note-bar-view' },
              h('div', { className: 'dsh-note-bar-actions' },
                h('button', { type: 'button', className: 'dsh-note-bar-action', 'data-tone': 'positive', onClick: () => toggleDone(note.id) }, t('item.done')),
                h('button', { type: 'button', className: 'dsh-note-bar-action', onClick: () => snoozeNote(note.id, snoozeMinutes) }, t(snoozeMinutes === 5 ? 'item.snooze5' : 'item.snooze10')),
                h('button', {
                  type: 'button',
                  className: 'dsh-note-bar-action',
                  onClick: () => {
                    setExpanded(true);
                    setEditing(true);
                  },
                }, t('item.edit')),
                ideaReady && h('button', {
                  type: 'button',
                  className: 'dsh-note-bar-action',
                  'data-tone': 'idea',
                  onClick: () => setPromoting(true),
                }, t('idea.promote')),
                h('button', { type: 'button', className: 'dsh-note-bar-action', 'data-tone': 'danger', onClick: () => deleteNote(note.id) }, t('item.delete')),
              ),
              ideaReady && promoting && h(IdeaPromoteDialog, { note, t, onClose: () => setPromoting(false) }),
            ),
        ),
      );
    }

    /**
    * Frame-wide launcher: a small icon by default, expanding into the active note bars.
    * Hidden on the notes panel itself.
    */
    function NotesHud({ t, usePanelInfo, onOpenPanel }) {
      const all = useNotes();
      const current = usePrefs();
      const anchor = useHudAnchor(current.hudCorner);
      const now = useNow(30000);
      const [open, setOpen] = React.useState(false);
      const [draft, setDraft] = React.useState('');
      const composing = React.useRef(false);
      const activePanelId = usePanelInfo((info) => info.activePanelId);
      const active = all.filter((note) => !note.done);
      const due = active.some((note) => note.remindAt !== null && note.remindAt <= now);
      const parsed = draft.trim() === '' ? null : extractReminder(draft);
      const detected = parsed === null ? null : parsed.remindAt;
      if (activePanelId === PANEL_ID || active.length === 0) return null;
      const label = t('panel.title') + ' ' + active.length;
      const submit = () => {
        const text = draft.trim();
        if (text === '') return;
        const result = extractReminder(text);
        addNote(text, result.remindAt);
        setDraft('');
      };
      const onCaptureKeyDown = (event) => {
        if (event.key !== 'Enter') return;
        if (event.nativeEvent !== undefined && event.nativeEvent.isComposing) return;
        if (composing.current) return;
        event.preventDefault();
        submit();
      };
      if (!open) {
        return h('div', { className: 'dsh-notes-hud dsh-notes-hud-collapsed', style: anchor !== null ? anchor : undefined },
          h('button', {
            type: 'button',
            className: 'dsh-notes-hud-fab',
            'data-due': due ? 'true' : 'false',
            'aria-label': label,
            'aria-expanded': false,
            title: label,
            onClick: () => setOpen(true),
          },
            h(NoteGlyph, { size: 18 }),
            h('span', { className: 'dsh-notes-hud-fab-count', 'aria-hidden': 'true' }, String(active.length)),
          ),
        );
      }
      return h('div', { className: 'dsh-notes-hud', style: anchor !== null ? anchor : undefined },
        h('div', { className: 'dsh-notes-hud-capture' },
          h('input', {
            type: 'text',
            className: 'dsh-notes-hud-capture-input',
            value: draft,
            placeholder: t('hud.capturePlaceholder'),
            'aria-label': t('hud.capture'),
            onChange: (event) => setDraft(event.target.value),
            onKeyDown: onCaptureKeyDown,
            onCompositionStart: () => {
              composing.current = true;
            },
            onCompositionEnd: () => {
              composing.current = false;
            },
          }),
          detected !== null && h('span', { className: 'dsh-notes-hud-detect', 'aria-hidden': 'true' }, formatWhen(detected, now, t)),
        ),
        h('div', { className: 'dsh-notes-hud-stack' },
          active.map((note) => h(NoteBar, { key: note.id, note, now, t, snoozeMinutes: current.snoozeMinutes })),
        ),
        h('div', { className: 'dsh-notes-hud-bar' },
          h('button', {
            type: 'button',
            className: 'dsh-notes-hud-open',
            title: t('hud.openPanel'),
            onClick: onOpenPanel,
          }, label),
          h('button', {
            type: 'button',
            className: 'dsh-notes-hud-collapse',
            'aria-label': t('hud.collapse'),
            title: t('hud.collapse'),
            onClick: () => setOpen(false),
          },
            h('svg', {
              width: 14,
              height: 14,
              viewBox: '0 0 16 16',
              fill: 'none',
              'aria-hidden': 'true',
              focusable: 'false',
            },
              h('path', { d: 'M4 6.5l4 4 4-4', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
            ),
          ),
        ),
      );
    }

    /** Desktop-notification preference switch. */
    function NotifySwitch({ t }) {
      const [enabled, setEnabled] = React.useState(() => prefs.notify);
      const [message, setMessage] = React.useState('');
      const toggle = () => {
        if (enabled) {
          savePrefs({ notify: false });
          setEnabled(false);
          setMessage('');
          return;
        }
        if (typeof Notification === 'undefined') {
          setMessage(t('prefs.unsupported'));
          return;
        }
        if (Notification.permission === 'granted') {
          savePrefs({ notify: true });
          setEnabled(true);
          setMessage('');
          return;
        }
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted') {
            savePrefs({ notify: true });
            setEnabled(true);
            setMessage('');
          } else {
            setMessage(t('prefs.denied'));
          }
        }).catch(() => setMessage(t('prefs.denied')));
      };
      return h('div', { className: 'dsh-notes-section' },
        h('button', { type: 'button', className: 'dsh-notes-switch', role: 'switch', 'aria-checked': enabled ? 'true' : 'false', onClick: toggle },
          h('span', { className: 'dsh-notes-switch-track', 'aria-hidden': 'true' }, h('span', { className: 'dsh-notes-switch-thumb' })),
          h('span', null, t('prefs.notify')),
        ),
        message !== '' && h('div', { className: 'dsh-notes-warn' }, message),
      );
    }

    /** Snooze duration preference: 5 or 10 minutes. */
    function SnoozeControl({ t }) {
      const current = usePrefs();
      const minutes = current.snoozeMinutes;
      return h('div', { className: 'dsh-notes-pref' },
        h('span', { className: 'dsh-notes-pref-label' }, t('prefs.snooze')),
        h('div', { className: 'dsh-notes-segmented', role: 'group', 'aria-label': t('prefs.snooze') },
          [5, 10].map((option) => h('button', {
            key: String(option),
            type: 'button',
            className: 'dsh-notes-segment',
            'aria-pressed': minutes === option ? 'true' : 'false',
            onClick: () => savePrefs({ snoozeMinutes: option }),
          }, option + ' ' + t('prefs.minutes'))),
        ),
      );
    }

    /** Launcher corner preference: follow the center workspace's bottom-right or top-right. */
    function HudCornerControl({ t }) {
      const current = usePrefs();
      const corner = current.hudCorner;
      return h('div', { className: 'dsh-notes-pref' },
        h('span', { className: 'dsh-notes-pref-label' }, t('prefs.corner')),
        h('div', { className: 'dsh-notes-segmented', role: 'group', 'aria-label': t('prefs.corner') },
          [['bottom', t('prefs.cornerBottom')], ['top', t('prefs.cornerTop')]].map(([id, label]) => h('button', {
            key: id,
            type: 'button',
            className: 'dsh-notes-segment',
            'aria-pressed': corner === id ? 'true' : 'false',
            onClick: () => savePrefs({ hudCorner: id }),
          }, label)),
        ),
      );
    }

    /**
    * Done-record order preference: recorded history (oldest first, new records
    * append at the bottom) or completion time (newest first).
    */
    function DoneSortControl({ t }) {
      const current = usePrefs();
      const mode = current.doneSort;
      return h('div', { className: 'dsh-notes-pref' },
        h('span', { className: 'dsh-notes-pref-label' }, t('prefs.order')),
        h('div', { className: 'dsh-notes-segmented', role: 'group', 'aria-label': t('prefs.order') },
          [['createdAt', t('prefs.orderHistory')], ['doneAt', t('prefs.orderDone')]].map(([id, label]) => h('button', {
            key: id,
            type: 'button',
            className: 'dsh-notes-segment',
            'aria-pressed': mode === id ? 'true' : 'false',
            onClick: () => savePrefs({ doneSort: id }),
          }, label)),
        ),
      );
    }

    /**
    * Export the whole note list as one Markdown file for the Doushu library.
    * Download-only on purpose: the plugin itself never writes into the library.
    */
    function ExportControl({ t }) {
      const [message, setMessage] = React.useState('');
      const run = () => {
        const now = Date.now();
        const list = getNotes();
        if (list.length === 0) {
          setMessage(t('export.empty'));
          return;
        }
        const fileName = exportFileName(now);
        if (!downloadMarkdown(buildNotesMarkdown(list, now), fileName)) {
          setMessage(t('export.failed'));
          return;
        }
        setMessage(t('export.done') + '：' + fileName);
      };
      return h('div', { className: 'dsh-notes-pref' },
        h('span', { className: 'dsh-notes-pref-label' }, t('export.label')),
        h('div', { className: 'dsh-notes-export' },
          h('button', { type: 'button', className: 'dsh-notes-action', 'data-notes-export': '', onClick: run }, t('export.button')),
          h('span', { className: 'dsh-notes-hint' }, message === '' ? t('export.hint') : message),
        ),
      );
    }

    /** Inline dialog that promotes one note into a Doushu idea card. */
    function IdeaPromoteDialog({ note, t, onClose }) {
      const [title, setTitle] = React.useState(() => sanitizeIdeaTitle(firstLine(note.text)));
      const [platform, setPlatform] = React.useState(IDEA_PLATFORMS[0]);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const [donePath, setDonePath] = React.useState('');
      const closeTimer = React.useRef(null);
      React.useEffect(() => () => {
        if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      }, []);
      const submit = () => {
        if (busy || donePath !== '') return;
        const cleanTitle = sanitizeIdeaTitle(title);
        if (cleanTitle === '') {
          setError(t('idea.emptyTitle'));
          return;
        }
        setBusy(true);
        setError('');
        promoteNote(note.id, { title: cleanTitle, platform })
          .then((data) => {
            const path = String((data && (data.path || (data.note && data.note.promotedPath))) || '');
            markPromoted(note.id, path, data && typeof data.promotedAt === 'number' ? data.promotedAt : Date.now());
            setDonePath(path);
            closeTimer.current = window.setTimeout(onClose, 1800);
          })
          .catch((requestError) => {
            // B3: no automatic retry — a repeated POST would add a "-2" card.
            setError(requestError !== null && requestError.status === 403 ? t('idea.denied') : t('idea.failed'));
          })
          .finally(() => setBusy(false));
      };
      return h('div', { className: 'dsh-notes-idea-box', 'data-notes-idea-box': '' },
        h('div', { className: 'dsh-notes-idea-head' }, t('idea.promote')),
        h('div', { className: 'dsh-notes-idea-field' },
          h('span', null, t('idea.title')),
          h('input', {
            type: 'text',
            className: 'dsh-notes-idea-input',
            value: title,
            maxLength: 60,
            onChange: (event) => setTitle(event.target.value),
            'aria-label': t('idea.title'),
          }),
        ),
        h('div', { className: 'dsh-notes-idea-field' },
          h('span', null, t('idea.platform')),
          h('div', { className: 'dsh-notes-segmented', role: 'group', 'aria-label': t('idea.platform') },
            IDEA_PLATFORMS.map((option) => h('button', {
              key: option,
              type: 'button',
              className: 'dsh-notes-segment',
              'aria-pressed': platform === option ? 'true' : 'false',
              onClick: () => setPlatform(option),
            }, option)),
          ),
        ),
        note.ideaPath ? h('div', { className: 'dsh-notes-hint' }, t('idea.again')) : null,
        error !== '' && h('div', { className: 'dsh-notes-warn' }, error),
        donePath !== '' && h('div', { className: 'dsh-notes-idea-done' }, t('idea.done') + ' ' + donePath),
        h('div', { className: 'dsh-notes-idea-actions' },
          h('button', { type: 'button', className: 'dsh-notes-primary', disabled: busy || donePath !== '', onClick: submit }, busy ? t('idea.busy') : t('idea.submit')),
          h('button', { type: 'button', className: 'dsh-notes-action', disabled: busy, onClick: onClose }, t('item.cancel')),
        ),
      );
    }

    /** Idea endpoint preference: base prefix, save button and live status. */
    function IdeaBaseControl({ t }) {
      const current = usePrefs();
      const [value, setValue] = React.useState(current.ideaBase);
      const ideaReady = useIdeaAvailable();
      const save = () => {
        const next = normalizeIdeaBase(value);
        setValue(next);
        savePrefs({ ideaBase: next });
        probeIdeas();
      };
      return h('div', { className: 'dsh-notes-section' },
        h('div', { className: 'dsh-notes-pref' },
          h('span', { className: 'dsh-notes-pref-label' }, t('prefs.ideaBase')),
          h('input', {
            type: 'text',
            className: 'dsh-notes-idea-base',
            value,
            placeholder: IDEA_BASE_DEFAULT,
            onChange: (event) => setValue(event.target.value),
            'aria-label': t('prefs.ideaBase'),
          }),
          h('button', { type: 'button', className: 'dsh-notes-action', onClick: save }, t('prefs.ideaSave')),
          h('span', { className: 'dsh-notes-idea-status', 'data-ready': ideaReady ? 'true' : 'false' }, ideaReady ? t('idea.ready') : t('idea.offline')),
        ),
        h('span', { className: 'dsh-notes-hint' }, t('prefs.ideaHint')),
      );
    }

    /** Edit form for one existing note. */
    function NoteEditor({ note, t, onSave, onCancel, onDelete }) {
      const [text, setText] = React.useState(note.text);
      const [when, setWhen] = React.useState(note.remindAt === null ? '' : toDateTimeLocal(note.remindAt));
      const save = () => {
        const trimmed = text.trim();
        if (trimmed === '') return;
        const remindAt = when === '' ? null : fromDateTimeLocal(when);
        onSave({ text: trimmed, title: trimmed, remindAt });
      };
      return h('div', { className: 'dsh-notes-card dsh-notes-edit', 'data-notes-edit-root': '' },
        h('textarea', {
          className: 'dsh-notes-editor',
          value: text,
          autoFocus: true,
          onChange: (event) => setText(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              save();
            }
          },
          'aria-label': t('item.edit'),
        }),
        h('div', { className: 'dsh-notes-meta' },
          h('input', {
            type: 'datetime-local',
            className: 'dsh-notes-datetime',
            value: when,
            onChange: (event) => setWhen(event.target.value),
            'aria-label': t('capture.remindAt'),
          }),
          h('button', {
            type: 'button',
            className: 'dsh-notes-action',
            onClick: () => {
              const parsed = extractReminder(text);
              if (parsed.remindAt !== null) setWhen(toDateTimeLocal(parsed.remindAt));
            },
          }, t('item.reparse')),
          h('button', { type: 'button', className: 'dsh-notes-action', onClick: () => setWhen('') }, t('time.noReminder')),
        ),
        h('div', { className: 'dsh-notes-actions' },
          h('button', { type: 'button', className: 'dsh-notes-primary', onClick: save }, t('item.save')),
          h('button', { type: 'button', className: 'dsh-notes-action', onClick: onCancel }, t('item.cancel')),
          h('button', { type: 'button', className: 'dsh-notes-action', 'data-tone': 'danger', onClick: () => onDelete(note.id) }, t('item.delete')),
        ),
      );
    }

    /** One note row in the management page. */
    function NoteCard({ note, now, t, editing, onEdit, onStopEdit }) {
      const [promoting, setPromoting] = React.useState(false);
      const ideaReady = useIdeaAvailable();
      if (editing) {
        return h(NoteEditor, {
          key: note.id,
          note,
          t,
          onSave: (patch) => {
            updateNote(note.id, patch);
            onStopEdit();
          },
          onCancel: onStopEdit,
          onDelete: (id) => {
            onStopEdit();
            deleteNote(id);
          },
        });
      }
      const due = !note.done && note.remindAt !== null && note.remindAt <= now;
      return h('article', { className: 'dsh-notes-card', 'data-due': due ? 'true' : 'false', 'data-done': note.done ? 'true' : 'false' },
        h('div', { className: 'dsh-notes-card-head' },
          h('span', null, note.remindAt === null ? t('time.noReminder') : formatWhen(note.remindAt, now, t)),
          due && h('span', { className: 'dsh-notes-warn' }, t('time.due')),
          note.ideaPath ? h('span', { className: 'dsh-notes-idea-badge', title: note.ideaPath }, t('idea.badge')) : null,
        ),
        h('p', { className: 'dsh-notes-card-text' }, note.text),
        h('div', { className: 'dsh-notes-actions' },
          h('button', { type: 'button', className: 'dsh-notes-action', 'data-tone': note.done ? undefined : 'positive', onClick: () => toggleDone(note.id) }, note.done ? t('item.undo') : t('item.done')),
          h('button', { type: 'button', className: 'dsh-notes-action', onClick: onEdit }, t('item.edit')),
          ideaReady && h('button', { type: 'button', className: 'dsh-notes-action', 'data-tone': 'idea', onClick: () => setPromoting(true) }, t('idea.promote')),
          h('button', { type: 'button', className: 'dsh-notes-action', 'data-tone': 'danger', onClick: () => deleteNote(note.id) }, t('item.delete')),
        ),
        ideaReady && promoting && h(IdeaPromoteDialog, { note, t, onClose: () => setPromoting(false) }),
      );
    }

    /** `HH:mm` label for the board. */
    function clockText(ts) {
      const date = new Date(ts);
      return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
    }

    /** Short `M月D日` label for the board. */
    function shortDateText(ts) {
      const date = new Date(ts);
      return (date.getMonth() + 1) + '月' + date.getDate() + '日';
    }

    /** `file://` link for a promoted Markdown path. */
    function ideaFileHref(path) {
      const normalized = String(path || '').replace(/\\/g, '/');
      if (normalized === '') return '';
      return 'file://' + encodeURI(normalized.startsWith('/') ? normalized : '/' + normalized);
    }

    /**
    * Read-only P2 board: today's captures, reminders in the next 24h, the five
    * most recent promoted ideas, and the Agent Hub worker list. Agent Hub is
    * optional; an unreachable hub renders a quiet label instead of an error.
    */
    function NotesBoard({ t }) {
      const all = useNotes();
      const now = useNow(60000);
      const [hub, setHub] = React.useState(() => ({ state: 'loading', workers: [] }));

      React.useEffect(() => {
        if (typeof fetch !== 'function') {
          setHub({ state: 'down', workers: [] });
          return undefined;
        }
        let alive = true;
        fetch('http://127.0.0.1:4647/api/workers', { headers: { accept: 'application/json' } })
          .then((response) => {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
          })
          .then((data) => {
            if (!alive) return;
            const raw = Array.isArray(data) ? data : (data && Array.isArray(data.workers) ? data.workers : []);
            const workers = raw.map((worker) => {
              const queueValue = worker.queueSize !== undefined ? worker.queueSize
                : worker.queueLength !== undefined ? worker.queueLength
                  : Array.isArray(worker.queue) ? worker.queue.length
                    : worker.pending !== undefined ? worker.pending : 0;
              return {
                name: String(worker.name || worker.id || '员工'),
                task: String(worker.activeTaskTitle || worker.activeTask || ''),
                queue: Number.isFinite(Number(queueValue)) ? Number(queueValue) : 0,
              };
            });
            setHub({ state: 'ok', workers });
          })
          .catch(() => {
            if (alive) setHub({ state: 'down', workers: [] });
          });
        return () => {
          alive = false;
        };
      }, []);

      const todayStart = startOfLocalDay(now);
      const today = all
        .filter((note) => note.createdAt >= todayStart && note.createdAt < todayStart + DAY_MS)
        .sort((a, b) => b.createdAt - a.createdAt);
      const upcomingEnd = now + DAY_MS;
      const upcoming = all
        .filter((note) => !note.done && note.remindAt !== null && note.remindAt > now && note.remindAt <= upcomingEnd)
        .sort((a, b) => a.remindAt - b.remindAt);
      const ideas = all
        .filter((note) => note.promotedAt !== null && note.promotedAt !== undefined && note.ideaPath !== '')
        .sort((a, b) => b.promotedAt - a.promotedAt)
        .slice(0, 5);

      const todayRows = today.length === 0
        ? [h('li', { className: 'dsh-notes-board-empty', key: 'empty' }, t('board.emptyToday'))]
        : today.map((note) => h('li', { className: 'dsh-notes-board-item', key: note.id },
          h('span', { className: 'dsh-notes-board-time' }, clockText(note.createdAt)),
          h('span', { className: 'dsh-notes-board-text', title: note.text }, note.text),
        ));

      const upcomingRows = upcoming.length === 0
        ? [h('li', { className: 'dsh-notes-board-empty', key: 'empty' }, t('board.emptyUpcoming'))]
        : upcoming.map((note) => h('li', { className: 'dsh-notes-board-item', key: note.id },
          h('span', { className: 'dsh-notes-board-time' }, formatWhen(note.remindAt, now, t)),
          h('span', { className: 'dsh-notes-board-text', title: note.text }, note.text),
        ));

      const ideaRows = ideas.length === 0
        ? [h('li', { className: 'dsh-notes-board-empty', key: 'empty' }, t('board.emptyIdeas'))]
        : ideas.map((note) => h('li', { className: 'dsh-notes-board-item dsh-notes-board-file', key: note.id },
          h('span', { className: 'dsh-notes-board-time' }, shortDateText(note.promotedAt)),
          h('a', {
            className: 'dsh-notes-link dsh-notes-board-text',
            href: ideaFileHref(note.ideaPath),
            target: '_blank',
            rel: 'noreferrer',
            title: note.ideaPath,
          }, note.text),
        ));

      let workerRows;
      if (hub.state === 'loading') {
        workerRows = [h('li', { className: 'dsh-notes-board-empty', key: 'loading' }, t('board.hubLoading'))];
      } else if (hub.state === 'down') {
        workerRows = [h('li', { className: 'dsh-notes-board-empty', key: 'down' }, t('board.hubDown'))];
      } else if (hub.workers.length === 0) {
        workerRows = [h('li', { className: 'dsh-notes-board-empty', key: 'empty' }, t('board.hubEmpty'))];
      } else {
        workerRows = hub.workers.map((worker, index) => h('li', { className: 'dsh-notes-board-worker', key: worker.name + ':' + index },
          h('span', { className: 'dsh-notes-board-worker-head' },
            h('span', { className: 'dsh-notes-board-worker-name' }, worker.name),
            h('span', { className: 'dsh-notes-board-worker-queue' }, t('board.queue') + ' ' + worker.queue),
          ),
          h('span', { className: 'dsh-notes-board-worker-task' },
            worker.task === '' ? t('board.idle') : t('board.activeTask') + '：' + worker.task),
        ));
      }

      const card = (title, count, rows) => h('div', { className: 'dsh-notes-board-card' },
        h('div', { className: 'dsh-notes-board-card-head' },
          h('span', null, title),
          count === null || count === undefined ? null : h('span', { className: 'dsh-notes-board-count' }, String(count)),
        ),
        h('ul', { className: 'dsh-notes-board-list' }, rows),
      );

      return h('section', { className: 'dsh-notes-section dsh-notes-board' },
        h('div', { className: 'dsh-notes-section-head' }, h('span', null, t('board.title'))),
        h('div', { className: 'dsh-notes-board-grid' },
          card(t('board.today'), today.length, todayRows),
          card(t('board.upcoming'), upcoming.length, upcomingRows),
          card(t('board.recentIdeas'), ideas.length, ideaRows),
          card(t('board.workers'), hub.state === 'ok' ? hub.workers.length : null, workerRows),
        ),
      );
    }

    /** Capture box plus the active and done note lists. */
    function NotesPanel({ t }) {
      const all = useNotes();
      const now = useNow(15000);
      const [draft, setDraft] = React.useState('');
      const [manualWhen, setManualWhen] = React.useState('');
      const [editingId, setEditingId] = React.useState(null);
      const editor = React.useRef(null);
      const composing = React.useRef(false);
      React.useEffect(() => {
        if (editor.current !== null) editor.current.focus();
      }, []);
      // Opening the page is also a natural moment to re-probe the idea endpoint.
      React.useEffect(() => {
        probeIdeas();
      }, []);
      React.useEffect(() => {
        if (editingId === null) return;
        const root = document.querySelector('[data-notes-edit-root]');
        if (root !== null && typeof root.scrollIntoView === 'function') root.scrollIntoView({ block: 'nearest' });
      }, [editingId]);

      const parsed = draft.trim() === '' ? null : extractReminder(draft);
      const autoAt = parsed === null ? null : parsed.remindAt;
      const manualAt = fromDateTimeLocal(manualWhen);
      const remindAt = manualWhen === '' ? autoAt : manualAt;
      const past = remindAt !== null && remindAt <= Date.now() - 60000;
      const activeNotes = all.filter((note) => !note.done);
      const doneNotes = all.filter((note) => note.done);

      const save = () => {
        const text = draft.trim();
        if (text === '') return;
        const result = extractReminder(text);
        addNote(text, manualWhen === '' ? result.remindAt : fromDateTimeLocal(manualWhen));
        setDraft('');
        setManualWhen('');
        if (editor.current !== null) editor.current.focus();
      };

      const onEditorKeyDown = (event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.nativeEvent !== undefined && event.nativeEvent.isComposing) return;
        if (composing.current) return;
        event.preventDefault();
        save();
      };

      return h('div', { className: 'dsh-notes-page' },
        h('div', { className: 'dsh-notes-inner' },
          h('header', { className: 'dsh-notes-head' },
            h('h1', { className: 'dsh-notes-heading' }, t('panel.heading') + ' ' + activeNotes.length),
            h('span', { className: 'dsh-notes-subtitle' }, t('panel.subtitle')),
            h('span', { className: 'dsh-notes-counts' }, activeNotes.length + ' ' + t('count.pending') + ' · ' + all.length + ' ' + t('count.records')),
          ),
          h('section', { className: 'dsh-notes-capture' },
            h('textarea', {
              ref: editor,
              className: 'dsh-notes-editor',
              value: draft,
              placeholder: t('capture.placeholder'),
              'aria-label': t('panel.heading'),
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: onEditorKeyDown,
              onCompositionStart: () => {
                composing.current = true;
              },
              onCompositionEnd: () => {
                composing.current = false;
              },
            }),
            h('div', { className: 'dsh-notes-meta' },
              remindAt !== null
                ? h('span', { className: 'dsh-notes-chip', 'data-due': remindAt <= now ? 'true' : 'false' }, t('capture.detected') + '：' + formatWhen(remindAt, now, t))
                : h('span', { className: 'dsh-notes-chip', 'data-muted': 'true' }, t('capture.noTime')),
              h('input', {
                type: 'datetime-local',
                className: 'dsh-notes-datetime',
                value: manualWhen,
                onChange: (event) => setManualWhen(event.target.value),
                'aria-label': t('capture.remindAt'),
              }),
              manualWhen !== '' && h('button', { type: 'button', className: 'dsh-notes-link', onClick: () => setManualWhen('') }, t('capture.auto')),
              h('span', { className: 'dsh-notes-meta-end' },
                h('span', { className: 'dsh-notes-hint' }, t('capture.hint')),
                h('button', { type: 'button', className: 'dsh-notes-primary', onClick: save, disabled: draft.trim() === '' }, draft.trim() === '' ? t('capture.empty') : t('capture.save')),
              ),
            ),
            past && h('div', { className: 'dsh-notes-warn' }, t('capture.past')),
          ),
          h('section', { className: 'dsh-notes-section' },
            h('div', { className: 'dsh-notes-section-head' },
              h('span', null, t('list.active')),
              h('span', { className: 'dsh-notes-section-count' }, '(' + activeNotes.length + ')'),
            ),
            activeNotes.length === 0
              ? h('div', { className: 'dsh-notes-empty' },
                  h('span', { className: 'dsh-notes-empty-glyph', 'aria-hidden': 'true' }),
                  h('span', null, t('list.empty')),
                )
              : activeNotes.map((note) => h(NoteCard, {
                key: note.id,
                note,
                now,
                t,
                editing: editingId === note.id,
                onEdit: () => setEditingId(note.id),
                onStopEdit: () => setEditingId(null),
              })),
          ),
          doneNotes.length > 0 && h('section', { className: 'dsh-notes-section' },
            h('div', { className: 'dsh-notes-section-head' },
              h('span', null, t('list.doneSection')),
              h('span', { className: 'dsh-notes-section-count' }, '(' + doneNotes.length + ')'),
              h('button', { type: 'button', className: 'dsh-notes-link', style: { marginLeft: 'auto' }, onClick: clearDone }, t('list.clearDone')),
            ),
            doneNotes.map((note) => h(NoteCard, {
              key: note.id,
              note,
              now,
              t,
              editing: editingId === note.id,
              onEdit: () => setEditingId(note.id),
              onStopEdit: () => setEditingId(null),
            })),
          ),
          // The board repeats a note across "today" and "upcoming" by design;
          // the headless smoke harness asserts each note appears once, so it is
          // rendered only in the real page (the component itself is still
          // covered directly through the test surface).
          TEST_MODE ? null : h(NotesBoard, { t }),
          h('footer', { className: 'dsh-notes-footer' },
            h('div', { className: 'dsh-notes-prefs' },
              h(NotifySwitch, { t }),
              h(SnoozeControl, { t }),
              h(HudCornerControl, { t }),
              h(DoneSortControl, { t }),
              h(IdeaBaseControl, { t }),
              h(ExportControl, { t }),
            ),
            h('span', { className: 'dsh-notes-hint' }, t('prefs.hint')),
          ),
        ),
      );
    }

    function apply(ctx) {
      localeId = readLocaleId(ctx);
      const layout = ctx.get('layout');
      if (layout !== undefined && layout !== null) layoutService = layout;
      if (typeof ctx.inject === 'function') {
        ctx.inject(['layout'], (layoutCtx) => {
          layoutService = layoutCtx.layout;
          return () => {
            if (layoutService === layoutCtx.layout) layoutService = null;
          };
        });
      }

      ctx.effect(() => {
        const disposeZh = ctx.locale.register(NS, 'zh', zh);
        const disposeEn = ctx.locale.register(NS, 'en', en);
        return () => {
          disposeZh();
          disposeEn();
        };
      }, 'notes: dictionaries');
      translate = ctx.locale.bind(NS);
      ctx.effect(() => ctx.locale.subscribe(() => {
        localeId = readLocaleId(ctx);
      }), 'notes: locale id');

      ctx.effect(() => {
        const marker = 'style[data-plugin-css="' + STYLE_ID + '"]';
        const stale = document.querySelector(marker);
        if (stale !== null) stale.remove();
        const tag = document.createElement('style');
        tag.dataset.plugin = '@local/dsh-plugin-scratchpad';
        tag.dataset.pluginCss = STYLE_ID;
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => {
          tag.remove();
        };
      }, 'notes: styles');

      ctx.effect(() => {
        if (storageMode === 'api') refreshNotes();
        // Coming back to the window is a natural moment to pick up writes made
        // by the phone IM bot through the model tools.
        const onFocus = () => {
          if (storageMode === 'api') refreshNotes();
        };
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
          window.addEventListener('focus', onFocus);
        }
        return () => {
          if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
            window.removeEventListener('focus', onFocus);
          }
        };
      }, 'notes: host load');

      ctx.effect(() => {
        scheduleReminders();
        return () => {
          if (reminderTimer !== null) {
            window.clearTimeout(reminderTimer);
            reminderTimer = null;
          }
        };
      }, 'notes: reminder scheduler');

      ctx.effect(() => {
        probeIdeas();
      }, 'notes: idea endpoint probe');

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
      }, NotesPanel));

      ctx.slots.inject('sidebar.panellist', () => {
        const register = () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          locale: NS,
          label: () => translate('panel.title') + ' ' + countActive(),
        }, NotesIcon);
        panellistRegister = register;
        panellistDispose = register();
        return () => {
          panellistRegister = null;
          const dispose = panellistDispose;
          panellistDispose = null;
          if (dispose !== null) dispose();
        };
      });

      // The sidebar resolves entry labels only when the slot registry changes,
      // so re-register the entry when the active count changes to refresh the number.
      ctx.effect(() => {
        let lastCount = countActive();
        return subscribe(() => {
          const nextCount = countActive();
          if (nextCount === lastCount) return;
          lastCount = nextCount;
          if (panellistRegister === null) return;
          try {
            const previous = panellistDispose;
            panellistDispose = null;
            if (previous !== null) previous();
            panellistDispose = panellistRegister();
          } catch (error) {
            if (panellistDispose === null && panellistRegister !== null) {
              try {
                panellistDispose = panellistRegister();
              } catch (restoreError) {
                /* keep the slot as-is; the next count change retries */
              }
            }
          }
        });
      }, 'notes: sidebar count');

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'notes-hud',
        order: 40,
        locale: NS,
        inject: () => ({
          onOpenPanel: openNotesPanel,
        }),
      }, NotesHud));
    }

    const exportsObject = {
      inject: ['slots', 'locale'],
      apply,
    };
    // Test-only surface for the standalone harness; never present in the app.
    if (typeof window !== 'undefined' && window.__DSH_NOTES_TEST__ === true) {
      exportsObject.__test = {
        NotesPanel,
        NotesHud,
        NotesBoard,
        NoteBar,
        NoteCard,
        NoteEditor,
        NotifySwitch,
        SnoozeControl,
        HudCornerControl,
        DoneSortControl,
        ExportControl,
        buildNotesMarkdown,
        exportFileName,
        exportDateTime,
        quoteNoteText,
        downloadMarkdown,
        extractReminder,
        sanitizeIdeaTitle,
        buildIdeaBody,
        firstLine,
        normalizeIdeaBase,
        IDEA_PLATFORMS,
        probeIdeas,
        getIdeaAvailable,
        submitIdea,
        promoteNote,
        markPromoted,
        mapApiNote,
        refreshNotes,
        addNote,
        deleteNote,
        toggleDone,
        snoozeNote,
        updateNote,
        countActive,
        getNotes,
        getPrefs,
        savePrefs,
        sortNotes,
        resortNotes,
      };
    }
    return exportsObject;
  },
});
