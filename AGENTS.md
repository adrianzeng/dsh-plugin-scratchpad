# AGENTS.md —— 速记便签开发契约

> 改这个项目之前，**先读完本文件**。这是开发侧唯一事实源；`CLAUDE.md` 只是入口指针，面向使用者的说明在 `README.md`。
>
> 上游内容契约（可选集成）：`C:\Creator\docs\斗枢规范-v1.md`。本文件与它冲突时以斗枢规范为准，并把差异记在这里。

## 0. 一句话

**草稿留在宿主私有库里；只有人点「投到灵感」的那一条，才按约定变成一张想法卡。**

## 1. 现状

| 项 | 值 |
|---|---|
| 版本 | `2.0.0`（开源首发，功能等同 1.9.2） |
| DSH 包名 | `dsh-plugin-scratchpad`（2.0.0 起去掉了 `@local/` 前缀） |
| 仓库 | `github.com/adrianzeng/dsh-plugin-scratchpad`（公开，MIT） |
| 加载方式 | 开发时用 profile 里的 `link:` 依赖，改 `client.js` 刷新即生效；改 `index.js` 需重启 DSH |
| 测试 | `node --test tests/*.test.mjs` → 7 文件 / 14 项，全绿 |
| 上架 | DSH 插件市场，经 `awesome-dsh-plugin` 精选列表收录 |
| 阶段 | P2 已封版；P4（开源）已完成首轮；P3 未开始（见 §8） |

## 2. 架构：三层数据，两个半边

```
浏览器 client.js                     宿主 index.js
  UI / 时间解析 / 看板 / 导出    ←→    SQLite / HTTP 路由 / 模型工具 / 投递写文件
        ↓                                    ↓
  localStorage（只有 UI 偏好）        ~/.dsh/scratchpad/notes.db（便签主库）
                                             ↓ 人点「投到灵感」
                                      <库根>\00-收件箱\想法-*.md（想法卡）
                                             ↓ 现扫
                                      消费端「灵感」页（可选，本插件不依赖）
```

**三条硬事实：**

1. **便签正文只在 SQLite**，不在浏览器（v1.9.0 起）。浏览器里只剩偏好：通知开关、延后时长、悬浮球位置、两种排序、灵感接口前缀（后者已是死配置，见 §9）。
2. **投递不经过任何外部接口**。宿主直接写文件，消费端只是一个读者；没装消费端也能投递。
3. **消费端现扫目录**，无索引无缓存。文件落盘刷新即见。

细节（路由适配、降级路径、时间解析位置）见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

### 2.1 数据落点

| 数据 | 路径 | 会不会丢 |
|---|---|---|
| 便签主库 | `%USERPROFILE%\.dsh\scratchpad\notes.db`（可用 `DSH_SCRATCHPAD_DIR` 覆盖） | 不会（除非删文件）；**不在同步盘内** |
| UI 偏好 | 浏览器 localStorage `dsh-plugin-scratchpad/*` | 清浏览器数据会丢，无妨 |
| 想法卡 | `<库根>\00-收件箱\想法-<yyyymmdd-HHmm>-<6位随机>.md` | 不会，跟着库同步 |

库根从 `~/.dsh/lingtai/settings.json` 的 `root` 读（也可用 `DSH_LINGTAI_SETTINGS` 指向别的设置文件），缺省 Windows `C:\Creator`、其他系统 `~/Creator`。

### 2.2 notes 表

```sql
id TEXT PRIMARY KEY           -- note-<yyyymmdd>-<6位随机>
text TEXT NOT NULL            -- 原文，不改写
remind_at INTEGER             -- 毫秒；NULL = 无提醒
status TEXT DEFAULT 'active'  -- active | done | dropped
created_at INTEGER NOT NULL
done_at INTEGER
source TEXT DEFAULT 'web'     -- web | im | api
promoted_at INTEGER           -- 投递时刻；NULL = 没投过
promoted_path TEXT            -- 投出去的文件绝对路径
```

> 迁移脚本 `scripts/migrate-localstorage.mjs` 会带旧 id 入库，所以库里**可能**存在 localStorage 时代的 `n-<base36>` 形态 id，不要假设 id 一定是 `note-` 开头。

## 3. 铁律（改了就是破坏契约）

1. **写路径唯一**：只有 `POST /api/scratchpad/notes/:id/promote` 会写 `00-收件箱`。便签正文**永远**不自动写进去。一次投递只写一张卡。
2. **失败不自动重试**。重试会产生 `-2` 脏卡。任何网络/写盘失败 → 只报错。
3. **鉴权归宿主写死**：HTTP handler 第一行就是 `isLoopback` 检查，非本机一律 403。**前端不绕行、不自造认证、不猜放行规则。**
4. **投递根目录不可由调用方指定**。只从设置文件读，防止外部请求把文件写到任意位置。
5. **人工投递代替自动筛选**。便签什么都收（生活、工作、杂事），「投」是人的判断动作。AI 只能建议，**不能代投**。
6. **格式由写的人负责**。投出去的卡必须自带六个中文字段；读的人保持简单，不指望消费端做兼容补丁。英文小写键是 v1.7 兼容位，**别删**。
7. **一个文件同一时刻只有一个状态**；`promoted_at` 只是标记，不改 `status`。

## 4. 文件地图

| 文件 | 职责 | 改动注意 |
|---|---|---|
| `index.js` | 宿主：SQLite 库、6 条 HTTP 路由、3 个模型工具、投递写文件 | 改 schema 要写迁移；改投递格式要同步测试与 `docs/IDEA-CONTRACT.md` |
| `client.js` | 浏览器：UI、时间解析、看板、导出 Markdown | CSS 嵌在 `CSS` 数组里；类名前缀 `dsh-notes-` / `dsh-note-bar-` |
| `cordis.patch.yml` | 插件挂载声明（`id: scratchpad`, `name` 必须等于包名） | 改名要同步 `package.json` |
| `locale/zh.json` / `en.json` | 插件管理器里的元数据（`meta.title` / `meta.description` / `meta.detail`） | 两语言键必须齐，parity 测试会红 |
| `icon.svg` | 插件管理器图标 | — |
| `docs/DETAIL.md` + `docs/preview.svg` | 插件管理器详情页（单图） | 文档只放一行图，功能说明写进 `locale` 的 `meta.description` |
| `README.md` / `README.en.md` | 面向使用者的说明 | 功能数字必须与代码一致（市场会核对） |
| `docs/ARCHITECTURE.md` | 对外架构说明 | 与 §2 同步改 |
| `docs/IDEA-CONTRACT.md` | 投递契约（对外） | 与 §5.3 同步改 |
| `CONTRIBUTING.md` / `CHANGELOG.md` | 贡献流程与版本历史 | CHANGELOG 追加，不改历史条目 |
| `docs/history/` | P1/P2 规格与变更记录（历史档案） | 只读，不再更新 |
| `scripts/migrate-localstorage.mjs` | 旧数据迁移脚本 | 一次性工具，保留可追溯 |
| `tests/*.test.mjs` | 7 个测试文件 | 见 §6 |

## 5. 接口

### 5.1 HTTP（`/api/scratchpad`，仅本机 IP）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/about` | 探活，返回 `{ok, name, storage:'sqlite'}` |
| GET | `/notes?status=&limit=` | 列表，`status` 默认 active，可 `all` |
| POST | `/notes` | 新建（`text` 必填，可带 `remindAt` / `source`） |
| PATCH | `/notes/:id` | 单条改内容 / 提醒 / 状态 / `done` |
| DELETE | `/notes/:id` | 单条删除 |
| POST | `/notes/:id/promote` | **唯一的投递口**，body 只认 `{platform}` |

> 5.1 早期版本写成 `PATCH /notes`、`DELETE /notes`（批量），与代码不符；以本表为准。

### 5.2 模型工具（给任意 DSH 会话 / IM Bot）

| 工具 | 用途 |
|---|---|
| `note_add` | 记一条（`source: im`，原文逐字保存） |
| `note_list` | 查（状态筛选，默认 active / 20 条） |
| `note_promote` | 投递指定的一条 |

> Bot 通道走这三个工具，**不碰 localStorage，不自己写文件**。

### 5.3 投递产出格式

对外完整契约见 [`docs/IDEA-CONTRACT.md`](docs/IDEA-CONTRACT.md)，这里只留摘要。文件名：`想法-<yyyymmdd-HHmm>-<6位随机>.md`

```markdown
---
状态: 想法
平台: 全平台 | 抖音 | 小红书
主题: <便签首行，净化后截 40 字>
创建: <便签产生日 YYYY-MM-DD>
更新: <投递日 YYYY-MM-DD>
星位: 天枢
type: idea
source: 速记便签
note_id: <便签 id>
created: <YYYY-MM-DD HH:mm>
platform: <同上>
---

> 来源：速记便签 <id> · <便签产生时间 YYYY-MM-DD HH:mm>

<便签原文，不改写>
```

- 前六个中文键是读者依赖的字段；后面小写英文键是 v1.7 兼容位，别删。
- `创建` 取便签产生日、`更新` 取投递日 —— 消费端按「更新」倒序时按投递时间排，同时保留想法诞生日。
- 标题净化：去掉 `: # [ ] { } > | * ? " < > !`、行首 `-`、压空白、截 40 字（`sanitizeIdeaTitle`）。

## 6. 测试与验收

```bash
node --test tests/*.test.mjs      # 全量，7 文件 / 14 项
```

在个别受限环境（例如 DSH 的 Windows 沙箱）里 `node --test` 起子进程会被挡（`spawn EPERM`），可以逐文件跑 `node tests/<file>.test.mjs`，结果等价。

| 文件 | 覆盖 |
|---|---|
| `storage.test.mjs` | 库结构、CRUD、状态流转、6 条路由、回环拒绝、投递格式（8 项） |
| `time-parser.test.mjs` | 40 例中文时间解析 |
| `idea-promote.test.mjs` | 标题净化、平台枚举、偏好持久化 |
| `board-render.test.mjs` | 看板四地块渲染 + Agent Hub 未运行兜底 |
| `export.test.mjs` | 导出 Markdown 与回导 |
| `smoke-render.test.mjs` | stub 环境跑 `apply` 并渲染每个注册面 |
| `locale-parity.test.mjs` | 中英字典键对齐（93 键）+ 引用键都存在 |

**验收口径**：测试绿 ≠ 装好了。真机验收必须做一次：DSH 里记一条 → 点投递 → 消费端「灵感」页出现卡、六字段齐、`HANDOFF.md` 未被改、无 `-2` 重复卡。

## 7. 禁改区

- ❌ `%USERPROFILE%\.dsh\profiles\desktop\package.json` 与插件装卸（归 DSH；改名迁移时只允许改本项目那一行依赖 + 对应 bundle 名）
- ❌ 其他插件的目录（灵台、agent-hub 各自归各自的 agent）
- ❌ `00-收件箱/HANDOFF.md`（唯一状态源，只由人和 DSH 改）
- ❌ 已投递的想法卡（历史档案，只追加不改写）
- ❌ 把便签正文写进 `00-收件箱`（只有 promote 能写，且只写一张卡）

## 8. 阶段口径

| 阶段 | 版本 | 内容 | 状态 |
|---|---|---|---|
| P0 | 1.6.0 | 原始便签：纯浏览器 localStorage | 完成 |
| P1 | 1.7.0–1.8.0 | 投到灵感 + 界面美化（素笺墨线） | 完成、已真机验收 |
| P2 | 1.9.0–1.9.2 | 数据搬到宿主 SQLite + 3 个模型工具 + 看板四地块 + 中文六字段 | 完成、已封版（2026-11-16） |
| P4 | 2.0.0 | 开源：包名去前缀、对外文档拆分、上架插件市场 | 首轮完成（2026-11-23）；后续拆独立仓库 |
| P3 | — | Bot 通道（微信/企微/飞书扫码绑定）+ 多端同步 | 未开始 |

> 原计划里 P3 在 P4 之前，实际先做了 P4 的开源发布。P3 未动，顺序调整不影响任何契约。

## 9. 已知技术债

1. **便签主库不在同步盘**：`~/.dsh/scratchpad/notes.db` 不跟笔记库走。两台电脑同步时便签不同步，只有投出去的想法卡会同步。P3 要正面解决。
2. **文件名不是消费端规范格式**：产出 `想法-<yyyymmdd-HHmm>-<随机>.md`，规范建议 `YYYY-MM-DD_想法_标题.md`。当前不影响读取（六字段已带），改文件名需处理重名与非法字符。
3. **导出是客户端拼字符串**，没有服务端 export 接口；大库导出会占内存。
4. **宿主不可达时的降级写入不回流**：首载失败会切到 localStorage 模式；只有宿主列表为空时才会尝试回灌，已有数据后不会再触发。用户在宿主启动窗口里记的便签可能留在浏览器里。
5. **`prefs.ideaBase`（灵感接口）是死配置**：UI 还能改，但没有任何请求读它，探活和投递都走硬编码 `API_BASE`。
6. **没有版本化迁移设施**：只有 `CREATE TABLE IF NOT EXISTS`，没有 `PRAGMA user_version` 或 migrations 表。下一次改表要先搭这个。

## 10. 关联

| 用途 | 路径 / 链接 |
|---|---|
| 公开仓库 | https://github.com/adrianzeng/dsh-plugin-scratchpad |
| 市场条目（精选列表） | `awesome-dsh-plugin/awesome-dsh-plugin` → `data/plugins/adrianzeng__dsh-plugin-scratchpad.yml` |
| 斗枢规范（六字段 / 投递契约 §7） | `C:\Creator\docs\斗枢规范-v1.md` |
| 灵台观星台（可选消费端） | `E:\workPM\lingtai-guanxingtai` |
| 灵感页落点（本机） | `E:\Creator\00-收件箱` |
| 灵台设置（决定投递根） | `%USERPROFILE%\.dsh\lingtai\settings.json` |
| P1 原实施方案（历史） | WorkBuddy 工作区 `速记便签-投到灵感-第一期实施方案.md` |
