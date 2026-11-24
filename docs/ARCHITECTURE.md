# 架构

速记便签是一个 DSH bundle，分**两个半边**：宿主半边 `index.js`，浏览器半边 `client.js`。数据只在宿主那一侧。

```
浏览器 client.js                          宿主 index.js
  UI / 时间解析 / 看板 / 悬浮栏     ←→     SQLite / HTTP 路由 / 模型工具 / 投递写文件
        ↓                                        ↓
  localStorage（只有 UI 偏好）          ~/.dsh/scratchpad/notes.db（便签正文）
                                                 ↓ 人点「投到灵感」
                                          <库根>/00-收件箱/想法-*.md
```

## 三层数据

| 层 | 存什么 | 位置 | 丢了会怎样 |
| --- | --- | --- | --- |
| 便签正文 | `text`、提醒时间、状态、投递记录 | `~/.dsh/scratchpad/notes.db` | 真丢；这是唯一的正式数据 |
| UI 偏好 | 通知开关、延后时长、悬浮球位置、两种排序 | 浏览器 localStorage | 回到默认值，无妨 |
| 投递产物 | 想法卡 Markdown | `<库根>/00-收件箱/` | 跟着你的笔记库；本插件从不修改已投递的卡 |

为什么正文不放浏览器：宿主才是长活的那个。放这里之后，模型工具、IM Bot、其他 DSH 会话读到的都是同一份；关页面、换浏览器都不影响。

## 表结构

```sql
CREATE TABLE IF NOT EXISTS notes (
  id            TEXT PRIMARY KEY,          -- note-<yyyymmdd>-<6位随机>
  text          TEXT NOT NULL,             -- 原文，逐字保存
  remind_at     INTEGER,                   -- 毫秒时间戳；NULL = 不提醒
  status        TEXT NOT NULL DEFAULT 'active',  -- active | done | dropped
  created_at    INTEGER NOT NULL,
  done_at       INTEGER,
  source        TEXT NOT NULL DEFAULT 'web',     -- web | im | api
  promoted_at   INTEGER,                   -- 投递时刻；NULL = 没投过
  promoted_path TEXT                       -- 投出去的文件的绝对路径
);
CREATE INDEX IF NOT EXISTS idx_notes_status_remind ON notes(status, remind_at);
```

用 Node 内置的 `node:sqlite`（`DatabaseSync`），**没有第三方依赖**，也不起独立服务。

## 浏览器半边

`client.js` 是一个 UMD 风格的客户端模块，通过 `window.__ModuleLoader__.load({ id, factory })` 注册，注册三个位置：

| 位置 | 贡献 |
| --- | --- |
| `sidebar.panellist` | 侧栏入口图标 + `速记便签 N` 计数标签（id `scratchpad`） |
| `main` | 主页面：捕获框、便签列表、看板四块 |
| `shell.overlay` | 悬浮球 + 横栏列表（`notes-hud`） |

要点：

- **样式内嵌**在 `CSS` 数组里（字符串），不是独立 `.css` 文件；类名统一 `dsh-notes-` / `dsh-note-bar-` 前缀，避免撞宿主样式。
- **时间解析在客户端**：中文自然语言解析器把「明天十点」算成毫秒时间戳，再交给宿主；宿主不做自然语言解析。
- **宿主不可达时的降级**：首载拿不到宿主列表时，页面回退到 localStorage 快照（老版本数据），并在这段时间里把写操作也落在本地。这个降级只为了「宿主还在启动」的窗口不丢手感。**注意**：降级写入的便签不会自动回流到宿主库——用户下次操作时它们仍在浏览器里。这是一个已知的边界，见 README 的「已知限制」。
- **投递入口的显隐**：探 `GET /api/scratchpad/about` 通了才显示「投到灵感」，且只在 api 模式下探。

## 宿主半边

`index.js` 做四件事：

1. **建库与 CRUD**：`createNoteStore()` 打开 SQLite，准备语句，导出 `get/list/create/update/remove/promote`。
2. **挂 6 条 HTTP 路由**：`createHttpHandler(store)` 是纯函数（输入 `{method, pathname, query, body, ip}`），`createRouteCallback` 再把它适配到宿主实际给的回调形状。
3. **注册 3 个模型工具**：`createTools(store)`，经 `registerTools` 交给 `ctx.tools.register`。
4. **投递写文件**：`store.promote()`。

### 路由挂载

DSH 的 `webServer.register({ kind: 'prefix', path, handler })` 交给插件的是原生 `(req, res)`。`createRouteCallback` 同时兼容 Hono / 原生 Node / Express / Koa 四种形状，因为宿主版本之间可能换实现；命中哪一条取决于实参特征（有 `socket` 且第二参有 `setHeader` → 原生 Node）。

### 鉴权

两道检查，缺一不可：

1. **网络层**：`isLoopback(request.ip)`，非本机直接 403。认 `127.0.0.1`、`::1`、`localhost`、`::ffff:127.0.0.1`、`127.*`，以及**空 IP**（拿不到对端地址时按本机处理——桌面版可能走的是本地 socket）。
2. **浏览器层**：`createAccessCheck(ctx)`。宿主提供 `connection.requestRejection({ headers })` 时以它的判定为准（同源 + 登录态，返回值不是 `undefined` 即拒绝）；拿不到该服务时退回 `Origin` 与 `Host` 比对。

第二道是 2.0.1 补的。只挡 IP 挡不住「用户浏览器里打开的任意网页去 POST 127.0.0.1」——跨站请求带 `Origin`，网页读不到响应，但请求会真的打进来，能建便签、删便签、触发投递写文件。没有 `Origin` 的请求（curl、测试、宿主自己）照常放行，由第一道覆盖。

前端不绕行、不自造认证、不猜放行规则。

### 投递路径

```
POST /notes/:id/promote
  → store.promote(id, { platform })
      → resolveIdeaRoot()      读 ~/.dsh/lingtai/settings.json 的 root（缺省 C:\Creator / ~/Creator）
      → mkdir <root>/00-收件箱
      → buildIdeaMarkdown()    生成六字段 frontmatter + 原文
      → writeFileSync(flag:'wx')   已存在就报错，不覆盖
      → UPDATE notes SET promoted_at, promoted_path
```

请求体只能带 `platform`。**投递根不可由调用方指定**——这条是防止外部请求把文件写到任意位置。

## 测试地图

| 文件 | 覆盖 |
| --- | --- |
| `tests/storage.test.mjs` | 库结构、CRUD、状态流转、6 条路由、回环拒绝、跨站拒绝、投递文件内容 |
| `tests/time-parser.test.mjs` | 40 例中文时间解析 |
| `tests/idea-promote.test.mjs` | 标题净化、平台枚举、偏好持久化 |
| `tests/board-render.test.mjs` | 看板四块渲染与 Agent Hub 未运行的兜底 |
| `tests/export.test.mjs` | 导出 Markdown 与回导 |
| `tests/smoke-render.test.mjs` | stub 环境跑 `apply` 并渲染每个注册面 |
| `tests/locale-parity.test.mjs` | 中英字典键对齐、引用键都存在 |

`node --test tests/*.test.mjs` 跑全量：7 个文件 / 14 项。
