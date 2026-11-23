# Quick notes · dsh-plugin-scratchpad

A scratchpad plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH): one entry in the left sidebar, type a sentence, and a Chinese reminder time is picked out of it automatically. Notes live in the host's SQLite database, so the model and any DSH session read and write the same notes through tools.

In one sentence: **drafts stay in a local database, and only the one note a human promotes becomes a Markdown idea card.**

![Quick notes: sidebar entry, note bars and the promote action](docs/preview.svg)

## What it does

- **Capture and go**: one auto-focused textarea; Enter saves, Shift+Enter inserts a newline. Voice input works, and an Enter that confirms an IME composition never saves half a sentence.
- **Chinese reminder-time detection**: `30分钟后`, `明天十点`, `明早`, `今晚`, `后天`, `下周一`, `12月5日`, `9点半`, `15:30`, `下午三点`, and `不提醒` are recognized. The detected time shows as a chip and can be overridden.
- **Floating note bars**: active notes stay behind one small circular icon; opening it shows three-line bars where you can edit, complete, snooze, or delete a note next to the conversation, without switching pages.
- **Board**: today's notes, reminders in the next 24 hours, recently promoted ideas, and Agent Hub workers. If Agent Hub is not running the block says so instead of failing.
- **Markdown export**: exports all notes to `YYYY-MM-DD_速记便签.md`, quoting every note verbatim.
- **Three model tools**: `note_add` / `note_list` / `note_promote`, usable from any DSH session or IM bot.

## Install

**Plugin market (recommended)**: in DSH open **Settings → Plugins → Discover**, search for “速记便签”, and install. A page refresh is usually enough.

**Command line**, replacing `<profile>` with your profile name (the desktop app usually uses `desktop`):

```sh
dsh plugin --profile <profile> add github:adrianzeng/dsh-plugin-scratchpad
```

**Prebuilt package** (no local build, fastest):

```sh
dsh plugin --profile <profile> add https://github.com/adrianzeng/dsh-plugin-scratchpad/releases/download/v2.0.0/dsh-plugin-scratchpad-2.0.0.tgz
```

Refresh the page and “速记便签” appears in the sidebar. The plugin has **no third-party dependencies** and no build step.

## Where notes live

| Data | Location | Notes |
| --- | --- | --- |
| Note text | `~/.dsh/scratchpad/notes.db` (SQLite, single `notes` table) | Created on first start |
| UI preferences | Browser localStorage | Notification switch, snooze length, launcher corner, sort order |
| Promoted idea cards | `<library root>/00-收件箱/*.md` | Written only when you press **投到灵感** |

Note text is **not** in the browser. The browser is a read/write client; the host process owns the data. Closing the page, switching browsers, or restarting DSH keeps the notes, and every other session in the same DSH sees the same notes through the tools.

Override the database location with the `DSH_SCRATCHPAD_DIR` environment variable.

## Promote to ideas (optional)

If a library root is configured, every note gains a **投到灵感** button: the host writes one Markdown idea card into `<library root>/00-收件箱/`. This is the only action that writes outside `~/.dsh/scratchpad/`.

Configure the root by creating `~/.dsh/lingtai/settings.json`:

```json
{ "root": "D:\\MyLibrary" }
```

Without it the default is used (`C:\Creator` on Windows, `~/Creator` elsewhere). **If you never configure a root you can ignore this button entirely** — everything else works, and only the promote action reports a missing root.

Each card carries a fixed set of frontmatter fields; format, field meanings, and how readers consume them are documented in the [idea contract](docs/IDEA-CONTRACT.md).

Three hard rules for anyone changing the code:

1. Only `POST /api/scratchpad/notes/:id/promote` writes into `00-收件箱`, one card at a time.
2. **No automatic retry on failure** — a retry produces a duplicate `-2` card, so it only reports the error.
3. The promote root comes from the settings file only; an HTTP caller cannot choose the path.

## Model tools

| Tool | Purpose |
| --- | --- |
| `note_add` | Save one note (text stored verbatim, optional millisecond reminder timestamp) |
| `note_list` | List notes (status filter, active by default, reminder time ascending) |
| `note_promote` | Promote one specific note into an idea card |

All three go through the host database; they never touch localStorage and never compose file paths themselves.

## HTTP endpoints

Prefix `/api/scratchpad`, **loopback only** — non-local requests get 403.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/about` | Health probe: `{ok, name, storage}` |
| GET | `/notes?status=&limit=` | List |
| POST | `/notes` | Create |
| PATCH | `/notes/:id` | Update text / reminder / status |
| DELETE | `/notes/:id` | Delete |
| POST | `/notes/:id/promote` | Promote (the only file-writing endpoint) |

Details: [architecture](docs/ARCHITECTURE.md).

## Privacy and boundaries

- **No network access.** The plugin starts no server and listens on no port; HTTP reuses the host's existing local server.
- **No reporting.** No analytics, no telemetry, no remote calls.
- **Your data stays on your disk**: one SQLite file, plus the Markdown cards you promote yourself.

## Known limitations

- **Reminders are page-level**: they fire while the page is open. Ones missed while it was closed stay due on next open. The plugin does not use DSH Schedules.
- **The note database does not follow your sync folder**: `~/.dsh/scratchpad/` is outside your note library, so multi-machine sync is up to you (promoted idea cards do sync with the library).
- **The Agent Hub block** on the board reads `127.0.0.1:4647`; without Agent Hub it says “not running”.
- **Idea file names** use a compact stamp, `想法-<yyyymmdd-HHmm>-<6 random>.md`, not the `date_status_title` convention; readers take their data from the frontmatter fields, not the file name.

## Development

```sh
node --test tests/*.test.mjs     # full suite: 7 files / 14 tests
```

One layer at a time:

```sh
node tests/storage.test.mjs      # schema, CRUD, six routes, promote format
node tests/time-parser.test.mjs  # 40 Chinese time-parsing cases
```

Read [AGENTS.md](AGENTS.md) before changing code — it is the project contract (architecture, invariants, interfaces, off-limits areas). Contribution flow: [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

| Document | Contents |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Development contract: architecture, invariants, interfaces, tests, off-limits areas |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Three data layers, two halves, route and tool internals |
| [docs/IDEA-CONTRACT.md](docs/IDEA-CONTRACT.md) | Idea card contract: fields, file name, failure semantics |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [docs/history/](docs/history/) | P1/P2 specifications and change records (archived, not updated) |

## License

MIT — see [LICENSE](LICENSE).

中文版：[README.md](README.md).
