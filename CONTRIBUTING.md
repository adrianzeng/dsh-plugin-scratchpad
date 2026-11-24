# 贡献指南

欢迎改代码、报问题、提想法。这个项目小，规矩不多，但有几条是为了不弄坏别人的数据。

## 环境

- Node.js **≥ 22.5**（用了内置的 `node:sqlite`）
- 一个能跑 DSH 的环境，用来做真机验证（可选但强烈建议）
- **不引入第三方运行时依赖**。这条是硬要求：插件要能在没有网络、只有宿主 Node 的机器上直接跑。

## 本地开发

```sh
git clone https://github.com/adrianzeng/dsh-plugin-scratchpad.git
cd dsh-plugin-scratchpad
node --test tests/*.test.mjs      # 应该 7 个文件 / 14 项全绿
```

装进自己的 DSH 做真机验证：

```sh
dsh plugin --profile <profile> add link:/绝对路径/dsh-plugin-scratchpad
```

改 `client.js` 后刷新页面即可；改 `index.js`（宿主半边）需要重启 DSH。

## 改之前必须知道的

[AGENTS.md](AGENTS.md) 是开发契约，改代码前读一遍。最容易被踩坏的几条：

1. **写路径唯一**：只有 `POST /api/scratchpad/notes/:id/promote` 写 `00-收件箱`，一次一张卡。
2. **失败不自动重试**：重试会产生 `-2` 重复卡。
3. **鉴权两层**：每个 HTTP handler 先做回环检查（非本机 403），再做访问检查（宿主的 `connection.requestRejection`，取不到时退回 Origin/Host 同源比对）。
4. **投递根不由调用方指定**：只从设置文件读。
5. **投递卡片必须自带六个中文字段**；英文小写键是兼容位，别删。

## 改动的自检清单

- 动了 `index.js` 的 `buildIdeaMarkdown` → 同步 `tests/storage.test.mjs` 断言和 [docs/IDEA-CONTRACT.md](docs/IDEA-CONTRACT.md)
- 加了 UI 文案 → 中英两份字典都要加，`tests/locale-parity.test.mjs` 会红
- 加了 CSS 类 → 用 `dsh-notes-` 或 `dsh-note-bar-` 前缀
- 动了表结构 → 写迁移，不要 `DROP`；老用户的 `notes.db` 不能因为升级就空掉

## 提交

- 一个提交做一件事，提交信息用中文或英文都行，说清楚改了什么、为什么。
- 改行为请在 PR 里附带：怎么验证的（命令输出，或真机截图/描述）。
- 涉及投递格式或路由契约的改动，请在 PR 描述里点明「这是契约变更」，方便 review。

## 报问题

提 issue 时附上：DSH 版本、Node 版本、系统、复现步骤、期望结果和实际结果。涉及投递失败时，**不要贴便签原文**，贴错误信息就够。
