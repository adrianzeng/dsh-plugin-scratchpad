# 变更记录

按 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的粗粒度整理；版本号遵循语义化版本。P1/P2 期的逐条细节在 [docs/history/CHANGELOG-P2.md](docs/history/CHANGELOG-P2.md)。

## [2.0.0] — 2026-11-23

开源首发。功能与 1.9.2 一致，变的是外形和身份。

### 变更

- **包名** `@local/dsh-plugin-scratchpad` → `dsh-plugin-scratchpad`。这是破坏性变更：已安装的用户需要按新的包名重装一次（旧 profile 里的 `link:`/依赖名不再匹配）。
- 仓库转为公开，补齐对外文档：[README](README.md)（中文）/ [README.en.md](README.en.md)（英文）、[架构](docs/ARCHITECTURE.md)、[投递契约](docs/IDEA-CONTRACT.md)、[贡献指南](CONTRIBUTING.md)、插件管理器详情页（`docs/DETAIL.md` + `docs/preview.svg`）。
- `package.json` 补 `repository` / `homepage` / `bugs` / `engines` / `scripts.test`，`files` 纳入 `docs`。
- 历史规格与变更记录移入 [docs/history/](docs/history/)，标注为历史档案。
- 上架 DSH 插件市场（通过 `awesome-dsh-plugin` 精选列表收录）。

### 没变

- 数据格式、HTTP 接口、投递卡片字段、三个模型工具的名字与行为，全部与 1.9.2 相同。升级不需要迁移数据库。

## [1.9.2] — 2026-11-16

- 进行中便签的排序可切换：按提醒时间，或按最近写的。
- 全界面字号放大一档，长便签更好读。

## [1.9.1] — 2026-11-16

- P2 封版基线：宿主 SQLite 存储、6 条 HTTP 路由、3 个模型工具、投递写入中文六字段 frontmatter。
- 文档收口：AGENTS.md 校正版本号，P2 标记为已封版。

## [1.9.0] — 2026-11-15

- 便签正文从浏览器 localStorage 搬到宿主 SQLite（`~/.dsh/scratchpad/notes.db`）。
- 新增 3 个模型工具：`note_add` / `note_list` / `note_promote`。
- 新增 6 条本机 HTTP 路由，前缀 `/api/scratchpad`。
- 主页面新增只读看板：今日便签、未来 24 小时提醒、最近投递、Agent Hub 状态。
- 投递改为宿主写文件，不再依赖灵台接口在线。
- 新增一次性迁移脚本 `scripts/migrate-localstorage.mjs`。

## [1.7.0 – 1.8.0] — 2026-11

- 新增「投到灵感」：把一条便签投递成想法卡（当时走灵台接口）。
- 界面美化：素笺墨线视觉。

## [1.6.0] — 2026-11

- 最初的便签插件：左侧栏入口、浮层横栏、中文时间解析，数据在浏览器 localStorage。
