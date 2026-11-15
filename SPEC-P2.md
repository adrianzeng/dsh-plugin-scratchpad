# 速记便签 P2 改造规格（Claude 员工执行版）

> 本文是唯一需求来源。执行前先通读，再动手。
> 作者：DSH Lead（需求方）。你是执行者，遇到与本文冲突的想法先停下来汇报，不要自行改变方向。
>
> **2026-11-15 更名注记**：本文件原名 `SPEC-P1.md`。当时的「P1」指的就是 SQLite 改造，与 1.7/1.8 的「投到灵感」撞名。现统一为 **P2**，阶段口径见 `AGENTS.md §8`。

---

## 0. 一句话目标

把「速记便签」的数据从**浏览器 localStorage**搬到**宿主进程的 SQLite**，并对外暴露三个模型工具 + 一个渲染用的 HTTP 接口。
UI 外观一行不改。旧数据可迁移。手机 IM 机器人从此能读写便签。

---

## 1. 现状（已核实的事实，不要重复调查）

| 文件 | 大小 | 现状 |
|---|---|---|
| `index.js` | 126 字节 | host 半，**完全没有行为**，只有空 apply |
| `client.js` | ~107 KB | 浏览器半：便签列表、浮层、侧边栏计数、中文时间解析器、投递灵感按钮 |
| `tests/` | 4 个 | time-parser / idea-promote / smoke-render / export |
| `package.json` | 1.0 KB | `@local/dsh-plugin-scratchpad` v1.9.0，link 安装在 DSH desktop profile |

**病根**：便签数据存在 `localStorage`。host 进程读不到、模型没有工具、手机端完全无法访问。

**已确认可用的固定资产，不要重写**：
- `client.js` 里的中文时间解析器（"明天十点""下周一""9点半""不提醒"等）
- 便签列表 / 浮层 / 侧边栏计数 / 行内编辑 / 导出 Markdown 这些 UI
- `tests/` 里现有 4 个测试

---

## 2. 硬约束（违反任何一条即视为不合格）

1. **不许改 UI 外观与交互**。可以改数据读写那一层，视觉和交互不动。
2. **现有 4 个测试必须继续通过**（`tests/*.test.mjs`，用 `node --test` 跑）。
3. **不引入任何第三方依赖**。宿主 Node 版本 v24.22.2，`node:sqlite` 内置可用，直接用。
4. **不起服务、不监听端口、不依赖网络**。SQLite 是本地单文件。
5. **不写 `C:\Creator` 以外的任何外部目录**（投递灵感时写 `00-收件箱` 是唯一例外，见 §5）。
6. **不要动 `client.js` 里的时间解析器与 UI 渲染代码**，只替换存储读写层。
7. **工具定义不要 `require('@deepseek-ai/dsh-tools')`**——profile 目录下解析不到，宿主只要求工具对象满足 `name / description / parameters / output.schema / output.render / execute` 六项（参考 `~/.dsh/profiles/desktop/node_modules/dsh-work-assistant/index.js` 的写法，它是同宿主下的成功范例）。
8. 所有面向用户的文案保持中文。

---

## 3. 存储设计

**位置**：插件自身数据目录，建议 `%USERPROFILE%\.dsh\scratchpad\notes.db`（首次启动自动 `mkdir -p`）。
文件单库，单表。

```sql
CREATE TABLE IF NOT EXISTS notes (
  id           TEXT PRIMARY KEY,          -- note-<yyyymmdd>-<nanoid 风格短随机>
  text         TEXT NOT NULL,             -- 便签原文，逐字保存，不加工
  remind_at    INTEGER,                   -- 毫秒时间戳；NULL = 不提醒
  status       TEXT NOT NULL DEFAULT 'active',  -- active | done | dropped
  created_at   INTEGER NOT NULL,
  done_at      INTEGER,
  source       TEXT NOT NULL DEFAULT 'web',     -- web | im | api
  promoted_at  INTEGER,                   -- 投递灵感时间，NULL = 未投递
  promoted_path TEXT                      -- 灵感 md 的绝对路径
);
CREATE INDEX IF NOT EXISTS idx_notes_status_remind ON notes(status, remind_at);
```

**要点**：
- `text` 必须逐字保存（现有 README 明确"verbatim"，这条不能破）。
- 时间解析仍由 `client.js` 现有解析器在**客户端**完成，把 `remind_at` 毫秒数传给 host；host 不做自然语言解析。若 IM 来源需要解析，再单独加，P2 不做。

---

## 4. 宿主 HTTP 接口（给 client.js 用）

挂在 DSH 宿主已有的插件路由机制上，前缀 `/api/scratchpad`，只接受本机回环。至少要这五个：

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/notes` | 列表，支持 `?status=active\|done\|dropped\|all` |
| POST | `/notes` | 新建 `{text, remindAt?, source?}`，返回完整记录 |
| PATCH | `/notes/:id` | 改 `{text?, remindAt?, status?}` |
| DELETE | `/notes/:id` | 删除 |
| POST | `/notes/:id/promote` | 投递灵感（见 §5） |

`client.js` 把原来所有 localStorage 读写替换成对这五个接口的调用。**本地先保留一个内存缓存**，避免每次渲染都打一次网络。

---

## 5. 投递灵感（唯一允许写外部目录的动作）

1. 读 `~/.dsh/lingtai/settings.json` 的 `root`（默认 `C:\Creator`）
2. 写一个 `.md` 到 `<root>\00-收件箱\`，文件名 `想法-<yyyymmdd-HHmm>-<6位随机>.md`
3. 内容格式（**2026-11-15 起补齐斗枢中文六字段**；小写英文键保留做 v1.7 兼容）：

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
note_id: <noteId>
created: <YYYY-MM-DD HH:mm>
platform: 全平台
---

> 来源：速记便签 <noteId> · <便签产生时间 YYYY-MM-DD HH:mm>

<便签原文>
```

> **为什么补中文六字段**：观星台读 `fields['平台']` / `fields['创建']` / `fields['更新']` / `fields['主题']`。只写英文键会导致平台空、日期退回文件名解析（紧凑格式认不出，再退回 mtime，跨天差一天）、标题靠四级回退兜底。写的人守规矩，读的人才能简单。
>
> `创建` 取便签产生日、`更新` 取投递日：观星台按「更新」倒序时按投递时间排列，同时保留想法诞生日。

4. 成功后把 `promoted_at` / `promoted_path` 写回 notes 表，返回路径。
5. **失败不要自动重试**（会产生重复卡片），只返回错误。
6. 标题清洗沿用现有逻辑（`: # [ ] { } > | * ? " < > !`、行首 `-`、换行折叠、截断 40 字）。

> 注意：**不要**把便签本身写进 `00-收件箱`。只有点「投递灵感」这一个动作才写，且一次只写一张。

---

## 6. 三个模型工具（给 IM 机器人 / 任意 DSH 会话用）

| 工具名 | 参数 | 行为 |
|---|---|---|
| `note_add` | `{ text: string, remindAt?: number }` | 记一条，`source='im'`，返回 id + 解析出的提醒时间（原样回显） |
| `note_list` | `{ status?: 'active'\|'done'\|'dropped'\|'all', limit?: number }` | 按提醒时间升序返回，默认 active、20 条 |
| `note_promote` | `{ id: string }` | 调 §5 的投递逻辑，返回 md 路径 |

工具 `description` 里要写清：这是用户的速记便签，记灵感和待办用，**不是**工作账本。

---

## 7. 看板页（P2 可以只做最小版）

在插件已有的 `main` 面板里新增一个只读区块，四块内容：

1. 今日便签（created_at 是今天的）
2. 即将提醒（remind_at 在未来 24h 内，按时间升序）
3. 最近投递的灵感（promoted_at 非空，取最近 5 条，可点击打开文件）
4. Agent Hub 员工状态（GET `http://127.0.0.1:4647/api/workers`，只读展示 name + activeTaskTitle + 队列数；**请求失败就显示"Agent Hub 未运行"，不能报错崩页面**）

样式沿用插件现有视觉，不要引入新的设计语言。

---

## 8. 迁移

写一个一次性脚本 `scripts/migrate-localstorage.mjs`：读入用户导出的 Markdown（导出格式见 `tests/export.test.mjs`），解析成 notes 行插入 SQLite。`--dry-run` 先打印将插入多少条。**不自动跑**，由用户手动执行。

---

## 9. 验收（全部满足才算完成）

1. `node --test tests/*.test.mjs` 全绿（原有 4 个 + 新增的存储/投递测试）。
2. 手动：页面记一条"明天十点开会"→ 刷新页面仍在 → 提醒时间正确。
3. 手动：杀掉 DSH 重启 → 数据仍在（证明不在浏览器内存里）。
4. 在任意 DSH 会话里让模型调 `note_add` / `note_list` 能成功。
5. 点「投递灵感」→ `C:\Creator\00-收件箱\` 出现一张 md，内容与便签原文一致，frontmatter 正确。
6. 看板四块内容都能渲染；Agent Hub 关掉时不崩。

---

## 10. 交付物

- 改完的 `index.js`（host 半：SQLite + 路由 + 3 个工具 + 投递逻辑）
- 改完的 `client.js`（只替换存储层 + 新增看板区块）
- `scripts/migrate-localstorage.mjs`
- 新增测试文件
- 一份 `CHANGELOG-P2.md`：改了什么、怎么手工验证、有哪些已知限制

---

## 11. 明确不做（P2 边界）

- ❌ 不做 Telegram 通道（那是 P2，通道继续用 `@xmanrui/dsh-im`）
- ❌ 不做手机端界面
- ❌ 不合并 work-assistant
- ❌ 不动灵台/斗枢的读取逻辑（P2 只"投递"，不读灵台）
- ❌ 不改插件 id、包名、版本号命名规则

---

## 12. 开工顺序建议

1. 先读 `client.js`，定位所有 `localStorage` 调用点，列出清单（**先汇报清单，不要直接改**）
2. 写 `index.js` host 半（表 + 路由 + 工具），本地用 curl/Invoke-RestMethod 自测
3. 改 `client.js` 存储层
4. 加看板块
5. 补测试 + 迁移脚本
6. 跑全量测试，写 CHANGELOG-P2.md

每完成第 2、4 步各汇报一次（一两句话即可），不要等全做完才说。
