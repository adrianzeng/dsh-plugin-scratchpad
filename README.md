# 速记便签 · dsh-plugin-scratchpad

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）用的速记便签插件：左侧栏一个入口，记一句话，自动认出中文里的提醒时间；便签存在宿主的 SQLite 里，模型和任何 DSH 会话都能通过工具读写同一份数据。

一句话：**草稿留在本地库里，只有人点「投到灵感」的那一条，才会变成一张 Markdown 想法卡。**

![速记便签：左侧栏入口、便签横栏与投递动作](docs/preview.svg)

## 它做什么

- **记一句就走**：一个自动聚焦的输入框，回车保存、Shift+回车换行。用语音输入也行，输入法组合过程中的回车不会误存。
- **中文提醒时间自动识别**：`30分钟后`、`明天十点`、`明早`、`今晚`、`后天`、`下周一`、`12月5日`、`9点半`、`15:30`、`下午三点`、`不提醒` 都能认；认出来的时间显示成标签，也可以手动改。
- **悬浮横栏**：进行中的便签收在右下角一个小圆图标后面，点开才展开成三行横条，可以在对话旁边直接编辑、完成、延后、删除，不用切页面。
- **看板**：今日便签、未来 24 小时提醒、最近投递的想法、Agent Hub 员工状态。Agent Hub 没开就显示「未运行」，不会让页面崩掉。
- **导出 Markdown**：一键导出全部便签为 `YYYY-MM-DD_速记便签.md`，原文逐字引用。
- **三个模型工具**：`note_add` / `note_list` / `note_promote`，任何 DSH 会话或 IM Bot 都能记事、查事。

## 安装

**插件市场（推荐）**：DSH 里打开 **设置 → 插件 → 发现**，搜「速记便签」，点安装。多数情况下刷新页面就生效。

**命令行**，把 `<profile>` 换成你正在用的 profile 名（桌面版一般是 `desktop`）：

```sh
dsh plugin --profile <profile> add github:adrianzeng/dsh-plugin-scratchpad
```

**预构建包**（不跑本地构建，最快）：

```sh
dsh plugin --profile <profile> add https://github.com/adrianzeng/dsh-plugin-scratchpad/releases/download/v2.0.0/dsh-plugin-scratchpad-2.0.0.tgz
```

装完刷新页面，左侧栏出现「速记便签」。这个插件**没有第三方依赖**，也不需要构建步骤。

## 便签存在哪

| 数据 | 位置 | 说明 |
| --- | --- | --- |
| 便签正文 | `~/.dsh/scratchpad/notes.db`（SQLite，单表 `notes`） | 插件自己建库，首次启动自动创建目录 |
| UI 偏好 | 浏览器 localStorage | 通知开关、延后时长、悬浮球位置、排序方式；清了不心疼 |
| 投递出的想法卡 | `<库根>/00-收件箱/*.md` | 只有你点「投到灵感」时才写 |

便签正文**不在浏览器里**——这是本插件和普通便签最大的区别：浏览器只是读写端，宿主进程才是数据主人。所以关掉页面、换浏览器、重启 DSH，便签都还在；同一个 DSH 里的其他会话和模型工具读到的也是同一份。

数据库路径可以用环境变量 `DSH_SCRATCHPAD_DIR` 覆盖。

## 投到灵感（可选）

配了「库根」的人，每条便签会多一个 **投到灵感** 按钮：点一下，宿主在 `<库根>/00-收件箱/` 写一张 Markdown 想法卡。这是本插件**唯一**允许写到 `~/.dsh/scratchpad/` 之外的动作。

库根这样配置——建 `~/.dsh/lingtai/settings.json`：

```json
{ "root": "D:\\MyLibrary" }
```

不配就用默认值（Windows `C:\Creator`，其他系统 `~/Creator`）。**没配过库根的人可以完全无视这个按钮**：其他功能都不受影响，只有点投递时才会报「灵感根目录不存在」。

投递出来的卡片自带一套固定 frontmatter 字段，格式、字段含义和「读的人怎么用」写在 [投递契约](docs/IDEA-CONTRACT.md)。

三条硬规矩，改代码前必须知道：

1. 只有 `POST /api/scratchpad/notes/:id/promote` 会写 `00-收件箱`，一次只写一张卡。
2. **失败不自动重试**——重试会产出 `-2` 重复卡，所以只报错。
3. 投递根只从设置文件读，HTTP 调用方不能指定路径。

## 模型工具

| 工具 | 作用 |
| --- | --- |
| `note_add` | 记一条（原文逐字保存，可带毫秒时间戳提醒） |
| `note_list` | 查（按状态筛选，默认进行中，按提醒时间升序） |
| `note_promote` | 把指定的一条投递成想法卡 |

这三个工具走宿主数据库，不碰 localStorage，也不自己拼文件路径。

## HTTP 接口

前缀 `/api/scratchpad`，**只接受本机回环地址，且必须同源**：宿主提供 `connection.requestRejection` 时以它为准（同源 + 登录态），取不到时退回 Origin/Host 比对。非本机请求一律 403，浏览器里打开的别的网页也调不动它。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/about` | 探活，返回 `{ok, name, storage}` |
| GET | `/notes?status=&limit=` | 列表 |
| POST | `/notes` | 新建 |
| PATCH | `/notes/:id` | 改内容 / 提醒 / 状态 |
| DELETE | `/notes/:id` | 删除 |
| POST | `/notes/:id/promote` | 投递（唯一的写文件口） |

接口细节见 [架构说明](docs/ARCHITECTURE.md)。

## 隐私与边界

- **不联网**。插件不起服务、不监听端口，HTTP 只是复用宿主已有的本机服务。
- **不上报**。没有埋点、没有遥测、没有远程调用。
- **数据就在你自己的磁盘上**：一个 SQLite 文件，加你主动投递出去的 Markdown。

## 已知限制

- **提醒是页面级的**：页面开着才触发；关掉期间错过的，下次打开还是「已到期」。它不占用 DSH 的定时任务。
- **便签库不跟着同步盘走**：`~/.dsh/scratchpad/` 不在你的笔记库目录里，多机同步需要自己解决（投递出去的想法卡会跟着库同步）。
- **看板里的 Agent Hub 区块**：读 `127.0.0.1:4647`，没装 Agent Hub 就显示未运行。
- **想法卡文件名**用紧凑时间戳 `想法-<yyyymmdd-HHmm>-<6位随机>.md`，不是「日期_状态_标题」那种规范命名；读取方靠 frontmatter 六字段拿信息，不靠文件名。

## 开发

```sh
node --test tests/*.test.mjs     # 全量：7 个文件 / 14 项
```

只跑一层：

```sh
node tests/storage.test.mjs      # 库结构、CRUD、6 条路由、投递格式
node tests/time-parser.test.mjs  # 中文时间解析 40 例
```

改代码前读 [AGENTS.md](AGENTS.md)——它是本项目的开发契约（架构、铁律、接口、禁改区）。贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | 开发契约：架构、铁律、接口、测试、禁改区 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 三层数据、两个半边、路由与工具的实现细节 |
| [docs/IDEA-CONTRACT.md](docs/IDEA-CONTRACT.md) | 投递契约：卡片字段、文件名、失败语义 |
| [CHANGELOG.md](CHANGELOG.md) | 版本历史 |
| [docs/history/](docs/history/) | P1/P2 期的规格与变更记录（历史档案，不再更新） |

## 许可

MIT，见 [LICENSE](LICENSE)。

English version: [README.en.md](README.en.md).
