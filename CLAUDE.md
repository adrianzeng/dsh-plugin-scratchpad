# CLAUDE.md

> **改这个项目之前先读 [AGENTS.md](AGENTS.md)**（唯一事实源：架构、铁律、接口、测试、禁改区）。
> 本文件只放立刻要知道的最少信息。

## 这是什么

DSH（DeepSeek Harness）的速记便签插件 `dsh-plugin-scratchpad`，v2.0.1，MIT，开源。
两个半边：`index.js` 宿主（SQLite + HTTP + 模型工具），`client.js` 浏览器（UI）。

## 三条最容易踩的

1. **便签正文在 SQLite**（`~/.dsh/scratchpad/notes.db`），不在浏览器。浏览器只存 UI 偏好。
2. **只有 `POST /api/scratchpad/notes/:id/promote` 会写 `00-收件箱`**，一次一张卡，失败不重试。
3. **`client.js` 的 CSS 是内嵌在 `CSS` 数组里的字符串**，不是单独 `.css` 文件。

## 常用命令

```bash
node --test tests/*.test.mjs       # 全量（7 文件 / 15 项，改完必跑）
node tests/storage.test.mjs        # 只跑存储层
```

## 改动的自我检查

- 动了 `index.js` 的 `buildIdeaMarkdown` → 同步更新 `tests/storage.test.mjs` 断言和 `docs/IDEA-CONTRACT.md`
- 加了 UI 文案 → `client.js` 内嵌字典与 `locale/zh.json` / `locale/en.json` 都要加（parity 测试会红）
- 加了 CSS 类 → 前缀用 `dsh-notes-` 或 `dsh-note-bar-`，避免撞宿主样式
- 动了表结构 → 写迁移，不要 `DROP`
- 改了包名 → `cordis.patch.yml` 的 `name`、`client.js` 的模块 id、`tests/smoke-render.test.mjs` 断言三处一起改

## 别碰

`~/.dsh/profiles/desktop/` 下的插件装卸与依赖清单（本项目那一行除外）；灵台、agent-hub 的目录；`00-收件箱/HANDOFF.md`。

## 交付口径

测试绿只是及格线。能不能算做完，看真机：DSH 里记一条 → 投递 → 消费端「灵感」页出卡、六字段齐、无重复卡。
