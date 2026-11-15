# Quick notes — DSH plugin

A left-sidebar entry named “速记便签” / “Quick notes” with a live pending count,
a minimal capture page, and a collapsible floating launcher. Note text can come
from any input method (including voice input through the OS/WeChat IME), and the
reminder time is detected from that text.

## What it registers

| Seat | Contribution |
| --- | --- |
| `sidebar.panellist` | Notepad icon + `速记便签 N` label, id `scratchpad`, order 20 |
| `main` | Capture page and note lists under key `scratchpad` |
| `shell.overlay` | Collapsible launcher + active note bars (`notes-hud`) |

The sidebar owns the entry button; the panel id is shared by the entry and the
`main` seat, so clicking the icon opens the page. The sidebar label is
re-registered when the active count changes so its number stays current.

## Behavior

- **Capture**: one auto-focused textarea; `Enter` saves, `Shift+Enter` inserts a
  newline. IME composition is respected, so voice input confirmed with Enter never
  saves mid-composition. The box clears and keeps focus for the next note.
- **Time detection**: a Chinese natural-language parser recognizes relative
  durations (`30分钟后`), day words (`明天/明早/今晚/后天/大后天`), weekdays
  (`下周一`), dates (`12月5日`), clocks (`9点半`, `15:30`, `下午3点`, `下午三点`) and
  `不提醒`. When a day word has no clock and would resolve into the past
  (for example `今天要做…` spoken at 16:00), the reminder becomes **one hour from
  now** instead of firing immediately. The detected time appears as a chip and
  can be overridden with the datetime field.
- **Verbatim display**: a note is always shown exactly once, as the raw Chinese
  text that was captured. There is no derived title or summary line above it, so
  the same sentence never appears twice. Short bars clamp to three lines and reveal
  the full text when expanded; the management page always shows the full text.
- **Reminders**: while the page is open, due notes are marked. An optional desktop
  notification uses the browser Notification API (permission is requested from the
  toggle in the page footer). Reminders missed while the app was closed stay due
  on next open.
- **Floating launcher**: active notes stay tucked behind one small circular icon
  anchored to the **center workspace column** (bottom-right by default, switchable
  to top-right), so an open right sidebar never covers it. Clicking it expands a
  quick-capture input plus the stack of three-line bars. Each bar expands to the
  full text with Done (green) / Snooze / Edit / Delete (red on hover), and the
  launcher footer has “打开速记便签 / 收起便签”. The icon turns warning-colored
  while any note is due.
- **Inline editing**: Edit on a bar opens a complete editor inside the bar
  (text, reminder time, re-detect, save, cancel, delete) without leaving the
  conversation, so no page switch is needed.
- **Quick capture**: the expanded launcher has a one-line input; `Enter` saves,
  the reminder time is detected from the text and previewed inline.
- **Markdown export**: the footer has 导出 Markdown / Export Markdown. It saves one `YYYY-MM-DD_速记便签.md` (frontmatter with type/date/source/counts, active notes first, finished records after, every note quoted verbatim) to the browser's download location. Export is still download-only; the only action that writes into the library is the explicit **投到灵感** promote action, which asks the host to create one file under `<Lingtai root>/00-收件箱/`.
- **Settings**: the page footer holds the desktop-notification switch, the
  **snooze duration** choice (5 or 10 minutes), the **launcher corner**
  (bottom-right or top-right of the center workspace) and the **record order**
  for finished notes. These UI preferences persist in localStorage.
- **Record order**: finished notes can be listed by **recorded order** (default:
  oldest record first, so newly added ones append at the bottom, which keeps the
  history readable) or by **completion time** (most recently completed first).
  Active notes stay sorted by reminder time in both modes.
- **Persistence**: notes live in the host's SQLite database at
  `%USERPROFILE%\.dsh\scratchpad\notes.db` and are read/written through the
  local `/api/scratchpad` endpoints. The first browser snapshot is moved into
  the host once (ids preserved), and localStorage remains only as an offline
  fallback when the host is not reachable. This is what lets the phone IM bot
  and any DSH session read and write the same notes through the model tools.
- **Read-only board**: a new block in the main panel shows today's notes,
  reminders in the next 24 hours, the five most recently promoted ideas, and
  Agent Hub workers (read from `127.0.0.1:4647`). If Agent Hub is down the
  block says so instead of failing.

Reminders are page-local: they fire while this page is open, and are not
scheduled with the app-wide Schedules feature.

## Promote to ideas (投到灵感)

Promotion is now a host action and no longer depends on the observatory being
reachable from the page. Every note gains a **投到灵感** action once the host
answers `GET /api/scratchpad/about`; otherwise the action stays hidden and no
other feature changes.

- **Where it writes**: `<root>\00-收件箱\想法-<yyyymmdd-HHmm>-<6位随机>.md`,
  where `root` is read from `~/.dsh/lingtai/settings.json` (default
  `C:\Creator`). This is the only action allowed to write outside
  `~/.dsh/scratchpad/`.
- **File content**: frontmatter with `type: idea`, `source: 速记便签`,
  `note_id`, `created`, `platform`, followed by
  `> 来源：速记便签 <noteId> · <YYYY-MM-DD HH:mm>` and the raw note text.
- **Platform**: the existing three-way choice (`全平台 / 抖音 / 小红书`) is
  passed to the host and written into the frontmatter; anything else falls back
  to `全平台`.
- **Title hygiene**: `: # [ ] { } > | * ? " < > !` and a leading `-` are
  stripped, newlines collapse and the title is capped at 40 characters. The P2
  file template has no title field, so the cleaned title is used only for the
  promote request/validation.
- **No auto-retry**: a failed write only returns an error — repeating the
  request could create a duplicate card. A promoted note keeps its text
  (deleting it stays a human decision) and records `promoted_at` /
  `promoted_path`.
- **Legacy endpoint setting**: the footer still exposes the old idea endpoint
  prefix for UI compatibility, but P2 promotion always goes through the host
  file writer.

## Files

- `package.json` — bundle manifest (`dsh.bundle.patch`, `dsh.client`), locale/icon exports
- `cordis.patch.yml` — inserts the `scratchpad` row
- `index.js` — host half: SQLite store, `/api/scratchpad` routes, three model
  tools, promote-to-ideas file writer
- `client.js` — browser module: host-backed notes store, reminder scheduler,
  time parser, both pages, read-only board
- `scripts/migrate-localstorage.mjs` — manual one-time migration from a
  Markdown export into the host database (`--dry-run` supported)
- `tests/time-parser.test.mjs` — standalone checks for the parser region in `client.js`
- `tests/idea-promote.test.mjs` — standalone checks for the promote-to-ideas
  helpers (title hygiene, provenance line, platform enum, endpoint preference,
  `ideaPath` round-trip)
- `tests/smoke-render.test.mjs` — loads the module against stub browser globals and a
  tiny React shim, runs `apply`, and renders every registered surface once
  (the module exposes a `window.__DSH_NOTES_TEST__`-guarded test surface only for it)
- `tests/export.test.mjs` — checks the Markdown export: file name, frontmatter, section order, verbatim quoting, empty state, download hand-off
- `tests/locale-parity.test.mjs` — asserts both dictionaries share the same keys and
  every referenced key exists
- `tests/storage.test.mjs` — SQLite CRUD, status transitions, six HTTP routes,
  loopback guard and promoted file content
- `tests/board-render.test.mjs` — renders the four board blocks and checks the
  Agent Hub loading fallback
- `SPEC-P2.md` — the P2 specification (storage, routes, tools, migration)
- `CHANGELOG-P2.md` — P2 changes, manual verification and known limitations
- `AGENTS.md` — **project contract: architecture, invariant rules, interfaces, tests,
  off-limits areas. Read this before changing anything.**
- `CLAUDE.md` — short entry note for Claude Code; defers to `AGENTS.md`
- `locale/en.json`, `locale/zh.json` — Plugin Manager display metadata
- `icon.svg` — Plugin Manager artwork

## License

MIT — see [LICENSE](LICENSE).

## Manage it

The bundle is installed into the `desktop` profile by link, so this directory is
the live package. Edit files here and refresh the app to load the new browser
module; run the checks with:

```
node --test tests/*.test.mjs
```

Individual checks can still be run directly:

```
node tests/time-parser.test.mjs
node tests/idea-promote.test.mjs
node tests/export.test.mjs
node tests/smoke-render.test.mjs
node tests/locale-parity.test.mjs
node tests/board-render.test.mjs
node tests/storage.test.mjs
```
