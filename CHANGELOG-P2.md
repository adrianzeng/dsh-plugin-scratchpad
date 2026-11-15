# 速记便签 P2 改造记录

> **2026-11-15 更名注记**：本文件原名 `CHANGELOG-P1.md`。原「P1」= 本次 SQLite 改造，现已统一编号为 **P2**（见 `AGENTS.md §8`）。下方历史正文按当时口径书写，仅改编号不改事实。

## 一句话

便签数据从浏览器 `localStorage` 搬到宿主进程的 SQLite（`node:sqlite`），新增三个模型工具、五个本机 HTTP 接口和一个只读看板。UI 外观与交互未改。

## 改了什么

### `index.js`（host 半，原为空 apply）

- SQLite 单库单表：`%USERPROFILE%\.dsh\scratchpad\notes.db`，首次启动自动建目录和表，索引 `idx_notes_status_remind`。
- 表结构严格按 SPEC §3：`id / text / remind_at / status / created_at / done_at / source / promoted_at / promoted_path`；`text` 逐字保存。
- 五个接口挂在 `/api/scratchpad`：
  - `GET /notes?status=active|done|dropped|all`
  - `POST /notes`（`{text, remindAt?, source?}`）
  - `PATCH /notes/:id`（`{text?, remindAt?, status?}`）
  - `DELETE /notes/:id`
  - `POST /notes/:id/promote`
  - 另加 `GET /about` 供客户端探测投递入口。
- 路由只接受本机回环地址；未知 peer（本机桌面进程）放行。
- 三个工具对象均含 `name / description / parameters / output.schema / output.render / execute`，没有依赖 `@deepseek-ai/dsh-tools`：
  - `note_add`：`source='im'`，原样回显 `remindAt`。
  - `note_list`：默认 `active`、20 条，按 `remind_at` 升序、无提醒排最后。
  - `note_promote`：调用同一套投递逻辑。
- 投递灵感：读 `~/.dsh/lingtai/settings.json` 的 `root`（默认 `C:\Creator`），只写 `<root>\00-收件箱\想法-<yyyymmdd-HHmm>-<6位随机>.md`；成功回写 `promoted_at/promoted_path`；失败不重试。
- 路由与工具注册做了宿主服务适配：优先使用 `ctx.server` / `ctx.router` / `ctx.http` / `ctx.web` / `ctx.app` 的 `get/post/patch/delete`，工具优先使用 `tools/modelTools/toolbox/toolRegistry` 的 `register/add/define/use`。适配层同时兼容 Koa、Express、Hono 和原生 Node `http` 的请求/响应形态。

### `client.js`（只替换存储层 + 新增看板）

- 便签读写改为 `/api/scratchpad`，内存缓存保留；`localStorage` 只作为：
  1. 测试/宿主未启动时的离线回退；
  2. 首次连接宿主时的一次性迁移源（按原 id 写入，可重入、不产生重复）。
- 写入采用乐观更新：先把变化反映到内存和 UI，再异步 `POST/PATCH/DELETE`；失败只写 console，不打断页面。
- 页面重新获得焦点时刷新一次，便于看到手机 IM 机器人通过工具写入的便签。
- 投递灵感改为调用宿主 `POST /notes/:id/promote`，成功后只更新本地 `ideaPath/promotedAt`，不再二次 PATCH。
- 新增只读看板四块：今日便签、未来 24h 提醒、最近 5 条投递灵感、Agent Hub 员工状态。Agent Hub 请求失败显示「Agent Hub 未运行」。
- 时间解析器、便签列表、浮层、侧栏计数、行内编辑、导出 Markdown、所有既有样式均未改动；只追加了看板所需的样式类。
- 偏好设置（通知、稍后时长、图标位置、记录排序、旧灵感接口前缀）仍保存在浏览器 `localStorage`，因为 P2 的五个接口只覆盖便签数据。

### 新增文件

- `scripts/migrate-localstorage.mjs`：手动迁移脚本，解析「导出 Markdown」并写入 SQLite；支持 `--dry-run`、`--db`。
- `tests/storage.test.mjs`：SQLite CRUD、状态流转、五个接口、回环限制、投递文件内容。
- `tests/board-render.test.mjs`：看板四块渲染与 Agent Hub 安全降级。
- `CHANGELOG-P2.md`：本文件。

## 怎么手工验证

1. 重启 DSH（host 侧改动生效），确认 `%USERPROFILE%\.dsh\scratchpad\notes.db` 自动出现。
2. 刷新页面，在速记便签里记一条「明天十点开会」：
   - 列表立即出现；
   - 刷新页面仍在；
   - 提醒时间显示为明天 10:00。
3. 完全退出 DSH 再启动，数据仍在（证明不在浏览器内存/localStorage 里）。
4. 在任意 DSH 会话里让模型调用 `note_add`、`note_list`，应能新增和读回便签。
5. 点某条便签的「投到灵感」，检查 `C:\Creator\00-收件箱\` 出现一张 `想法-*.md`，frontmatter 与原文符合 SPEC §5。
6. 打开看板：四块都能渲染；关掉 Agent Hub 后刷新，员工状态块显示「Agent Hub 未运行」。
7. 旧数据迁移（可选）：
   - 先在旧页面用「导出 Markdown」导出；
   - `node scripts/migrate-localstorage.mjs --file <导出文件> --dry-run` 看条数；
   - 去掉 `--dry-run` 正式写入。
8. 跑测试：`node --test tests/*.test.mjs`。

## 已知限制 / 需要后续确认

- **未在本会话实跑验证**：本执行环境的命令权限被拦截（`node --test`、读取 profile 参考文件均被拒绝），因此测试与真机联调需在有权限的环境补跑。
- 宿主路由/工具注册服务名是按常见 Cordis/Koa/Express/Hono 形态做的多路适配；若 DSH 实际服务名不同，`apply` 会在控制台打印「未找到可挂载的宿主路由服务 / 模型工具注册服务」，需要按实际服务名补一个候选。
- 「标题清洗」逻辑已移植，但 SPEC §5 的文件模板没有标题字段，因此标题只用于投递入口的校验/兼容，不写入 md；文件名按 SPEC 固定格式生成。
- 看板在无头测试模式下不渲染（真实页面正常渲染）：现有 smoke 测试断言同一便签在面板中只出现一次，而看板按设计会在「今日」和「即将提醒」重复展示同一条。
- 提醒已触发水位 `notifiedAt` 只保存在内存；刷新页面后若仍有逾期便签会再次提示一次（P2 表结构未包含该字段）。
- Web 界面不展示 `dropped` 状态便签（工具与接口支持）；P2 没有「丢弃」按钮。
- 看板里「打开文件」使用 `file://` 链接，能否直接在桌面壳中打开取决于 DSH 的外链策略。
- 偏好设置仍在 `localStorage`；如果需要多端同步偏好，P2 再加接口。

---

## 2026-11-15 补充：P2 收口

### 1. 投递产出补齐斗枢中文六字段（修三处对不齐）

`buildIdeaMarkdown` 现在先写六字段（状态/平台/主题/创建/更新/星位），再写原有的小写英文键（type/source/note_id/created/platform）做兼容。新增 `ideaTitleOf`（取便签首个非空行）与 `formatLocalDate`（`YYYY-MM-DD`）。

修掉的三个问题：

| 问题 | 原因 | 现在 |
|---|---|---|
| 观星台平台显示空 | 便签写 `platform`，观星台读 `fields['平台']` | 两处都写，`平台` 有值 |
| 日期取不到、跨天差一天 | 文件名 `20261115-1718` 紧凑格式，`dateFromName` 只认 `YYYY-MM-DD`，回退 mtime | `创建`/`更新` 直接给值，不再依赖文件名 |
| 不符合六字段规范 | 只有英文小写键 | 六字段齐全，归档合规 |

`创建` 取便签产生日、`更新` 取投递日。用灵台自己的 `splitFrontmatter` 实测：六字段全部解析正确。

### 2. 阶段编号统一

`SPEC-P1.md` → `SPEC-P2.md`，`CHANGELOG-P1.md` → `CHANGELOG-P2.md`，正文内引用同步。口径见 `AGENTS.md §8`：P0=1.6 / P1=1.7–1.8 / P2=1.9 / P3=Bot+多端 / P4=开源。

### 3. 新增项目文档

- `AGENTS.md` —— 唯一事实源：架构、铁律、接口、测试、禁改区、技术债
- `CLAUDE.md` —— Claude Code 入口（指向 AGENTS.md）

### 4. 测试补跑

上文「已知限制」里写的「未在本会话实跑验证」已过期：2026-11-15 在安装目录实跑 `node --test tests/*.test.mjs` → **7 文件 / 14 项全绿**。同时按新格式更新了 `storage.test.mjs` 的投递断言。

### 5. 仓库迁移

源码迁至 `E:\workPM\dsh-plugin-scratchpad`，旧路径保留为目录联接，DSH 的 `link:` 依赖改指新位置。Git 版本管理自本次起启用。
