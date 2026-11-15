# AGENTS.md —— 速记便签项目契约

> 任何 agent 改这个项目之前，**先读完本文件**。这是唯一事实源；`CLAUDE.md` 只是入口指针。
> 上级内容契约：`C:\Creator\docs\斗枢规范-v1.md`（本文件与它冲突时，以斗枢规范为准并在本文件记录差异）。

## 0. 一句话

**草稿留在浏览器与宿主私有库里；只有人点「投到灵感」的那一条，才按斗枢规矩变成一张想法卡。**

## 1. 现状

| 项 | 值 |
|---|---|
| 版本 | `1.9.0` |
| 阶段 | **P2 完成**（阶段口径见 §8） |
| DSH 包名 | `@local/dsh-plugin-scratchpad` |
| 加载方式 | profile 里的 `link:` 依赖，改源码刷新 DSH 即生效，无需 pnpm 重装 |
| 测试 | `node --test tests/*.test.mjs` → 7 文件 / 14 项 |

## 2. 架构：三层数据，两个半边

```
浏览器 client.js                     宿主 index.js
  UI / 时间解析 / 看板 / 导出    ←→    SQLite / HTTP 路由 / 模型工具 / 投递写文件
        ↓                                    ↓
  localStorage（只有 UI 偏好）        ~/.dsh/scratchpad/notes.db（便签主库）
                                             ↓ 人点「投到灵感」
                                      E:\Creator\00-收件箱\想法-*.md（想法卡）
                                             ↓ 现扫
                                      灵台观星台「灵感」页
```

**三条硬事实：**

1. **便签正文只在 SQLite**，不在浏览器（v1.9.0 起）。浏览器里只剩偏好：通知开关、提醒提前量、悬浮球位置、已完成排序、灵感接口地址。
2. **投递不经过灵台接口**。宿主直接写文件，灵台降级为一个读者。灵台没装也不影响投递。
3. **观星台现扫目录**，无索引无缓存。文件落盘刷新即见。

### 2.1 数据落点

| 数据 | 路径 | 会不会丢 |
|---|---|---|
| 便签主库 | `C:\Users\ZHY\.dsh\scratchpad\notes.db` | 不会（除非删文件）；**不在同步盘内** |
| UI 偏好 | 浏览器 localStorage `dsh-plugin-scratchpad/*` | 清浏览器数据会丢，无妨 |
| 想法卡 | `<灵台根>\00-收件箱\想法-<yyyymmdd-HHmm>-<6位随机>.md` | 不会，跟斗枢一起同步 |

灵台根从 `~/.dsh/lingtai/settings.json` 的 `root` 读，缺省 `C:\Creator`。

### 2.2 notes 表

```sql
id TEXT PRIMARY KEY           -- n-<yyyymmdd>-<6位随机>
text TEXT NOT NULL            -- 原文，不改写
remind_at INTEGER             -- 毫秒；NULL = 无提醒
status TEXT DEFAULT 'active'  -- active | done | dropped
created_at INTEGER NOT NULL
done_at INTEGER
source TEXT DEFAULT 'web'     -- web | im | api
promoted_at INTEGER           -- 投递时刻；NULL = 没投过
promoted_path TEXT            -- 投出去的文件绝对路径
```

## 3. 铁律（改了就是破坏契约）

1. **写路径唯一**：只有 `POST /api/scratchpad/notes/:id/promote` 会写 `00-收件箱`。便签正文**永远**不写进斗枢。一次投递只写一张卡。
2. **失败不自动重试**。重试会产生 `-2` 脏卡。任何网络/写盘失败 → 只报错。
3. **鉴权归宿主写死**：HTTP handler 第一行就是 `isLoopback` 检查，非本机一律 403。**前端不绕行、不自造认证、不猜放行规则。**
4. **投递根目录不可由 HTTP 调用方指定**。只从 `settings.json` 读，防止外部请求把文件写到任意位置。
5. **人工投递代替自动筛选**。便签什么都收（生活、工作、杂事），「投」是人的判断动作。AI 只允许做「建议投递」标记，**不允许代投**。
6. **斗枢格式由写的人负责**。投出去的文件必须自带六字段，读的人（观星台）保持简单。不要指望消费端做兼容补丁。
7. **一个文件同一时刻只有一个状态**；`promoted_at` 只是标记，不改 `status`。

## 4. 文件地图

| 文件 | 职责 | 改动注意 |
|---|---|---|
| `index.js` | 宿主：SQLite 库、6 条 HTTP 路由、3 个模型工具、投递写文件 | 改 schema 要写迁移；改投递格式要同步测试与 SPEC |
| `client.js` | 浏览器：UI、时间解析、看板、导出 Markdown | CSS 嵌在 `CSS` 数组里；类名前缀 `dsh-notes-` / `dsh-note-bar-` |
| `cordis.patch.yml` | 插件挂载声明 | 一般不动 |
| `locale/zh.json` / `en.json` | 插件管理器里的显示名与描述 | 两语言键必须齐，parity 测试会红 |
| `icon.svg` | 插件管理器图标 | — |
| `SPEC-P2.md` | P2 契约（存储、接口、迁移） | 与代码不一致时先改代码再改它 |
| `CHANGELOG-P2.md` | P1 改造变更记录 | 追加，不改历史 |
| `scripts/migrate-localstorage.mjs` | 旧数据迁移脚本 | 一次性工具，保留可追溯 |
| `tests/*.test.mjs` | 7 个测试文件 | 见 §6 |

## 5. 接口

### 5.1 HTTP（`/api/scratchpad`，仅本机 IP）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/about` | 探活，返回 `{ok, name, storage:'sqlite'}` |
| GET | `/notes?status=&limit=` | 列表，`status` 默认 active |
| POST | `/notes` | 新建（`text` 必填，可带 `remindAt`） |
| PATCH | `/notes` | 批量改状态 / 内容 |
| DELETE | `/notes` | 批量删 |
| POST | `/notes/:id/promote` | **唯一的投递口**，body `{platform}` |

### 5.2 模型工具（给 IM Bot / 任意 DSH 会话）

| 工具 | 用途 |
|---|---|
| `note_add` | 记一条（`source: im` 可标来源） |
| `note_list` | 查（带状态筛选） |
| `note_promote` | 投递一条 |

> Bot 通道走这三个工具，**不碰 localStorage，不自己写文件**。

### 5.3 投递产出格式（P2 起）

文件名：`想法-<yyyymmdd-HHmm>-<6位随机>.md`

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

- 前六个中文键是斗枢规范，**读者只依赖它们**；后面小写英文键是 v1.7 兼容位，别删（旧卡还在库里）。
- `创建` 取便签产生日、`更新` 取投递日 —— 保证观星台按「更新」倒序时按投递时间排，同时保留想法诞生日。
- 标题净化：去掉 `: # [ ] { } > | * ? " < > !`、行首 `-`、压换行、截 40 字（`sanitizeIdeaTitle`）。

## 6. 测试与验收

```bash
node --test tests/*.test.mjs      # 全量，14 项
```

| 文件 | 覆盖 |
|---|---|
| `storage.test.mjs` | 库结构、CRUD、状态流转、6 条路由、投递格式 |
| `time-parser.test.mjs` | 40 例中文时间解析 |
| `idea-promote.test.mjs` | 标题净化、平台枚举、偏好持久化 |
| `board-render.test.mjs` | 看板四地块渲染 |
| `export.test.mjs` | 导出 Markdown 与回导 |
| `smoke-render.test.mjs` | stub 环境跑 `apply` 并渲染每个注册面 |
| `locale-parity.test.mjs` | 中英字典键对齐（69 键）+ 引用键都存在 |

**验收口径**：测试绿 ≠ 装好了。真机验收必须做一次：DSH 里记一条 → 点投递 → 观星台「灵感」页出现卡、六字段齐、`HANDOFF.md` 未被改、无 `-2` 重复卡。

## 7. 禁改区

- ❌ `C:\Users\ZHY\.dsh\profiles\desktop\package.json` 与插件装卸（归 DSH；迁移时只允许改本项目那一行 `link:`）
- ❌ 其他插件的目录（灵台、agent-hub 各自归各自的 agent）
- ❌ `00-收件箱/HANDOFF.md`（唯一状态源，只由人和 DSH 改）
- ❌ 已投递的想法卡（历史档案，只追加不改写）
- ❌ 把便签正文写进 `00-收件箱`（只有 promote 能写，且只写一张卡）

## 8. 阶段口径（避免命名撞车）

| 阶段 | 版本 | 内容 | 状态 |
|---|---|---|---|
| P0 | 1.6.0 | 原始便签：纯浏览器 localStorage | 完成 |
| P1 | 1.7.0–1.8.0 | 投到灵感 + 界面美化（素笺墨线） | 完成、已真机验收 |
| **P2** | **1.9.0** | **数据搬到宿主 SQLite + 3 个模型工具 + 看板四地块 + 中文六字段** | **完成、已真机验收** |
| P3 | — | Bot 通道（微信/企微/飞书扫码绑定）+ 多端同步 | 未开始 |
| P4 | — | 开源：拆契约文档、两个仓库各自独立 | 未开始 |

> **历史坑**：`SPEC-P1.md` / `CHANGELOG-P1.md` 里的「P1」指的是 P2（SQLite 改造），已在 2026-11-15 改名为 `-P2`。以后一律按本表说话。

## 9. 已知技术债

1. **便签主库不在同步盘**：`~/.dsh/scratchpad/notes.db` 不跟 `E:\Creator` 走。两台电脑同步时便签不同步，只有投出去的想法卡会同步。P3 要正面解决。
2. **文件名不是斗枢规范格式**：产出 `想法-20261115-1718-xxxxxx.md`，规范建议 `YYYY-MM-DD_想法_标题.md`。当前不影响读取（六字段已带），改文件名需处理重名与非法字符。
3. **导出是客户端拼字符串**，没有服务端 export 接口；大库导出会占内存。

## 10. 关联

| 用途 | 路径 |
|---|---|
| 斗枢规范（六字段 / 投递契约 §7） | `C:\Creator\docs\斗枢规范-v1.md` |
| 灵台观星台（消费端） | `E:\workPM\lingtai-guanxingtai` |
| 灵感页落点 | `E:\Creator\00-收件箱` |
| 灵台设置（决定投递根） | `C:\Users\ZHY\.dsh\lingtai\settings.json` |
| P1 原实施方案（历史） | WorkBuddy 工作区 `速记便签-投到灵感-第一期实施方案.md` |
