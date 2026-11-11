# 133: 改名为 Human Touch

**What to build:** 产品从 03Kind 改名为 Human Touch。设计师、Agent 和开发者能看到的地方一次改完，页面内部的名字也一起改，行为不变。做法和 ticket 70（Vernier Kit → 03Kind）一样，可以照它分三步。

设计师的理由（2026-11-11）：这个名字更形象，突出我们的调性：AI 加速的同时，人类设计师可以介入微调。

新名字（设计师 2026-11-11 定了包名和范围）：

- **包与命令**：
  - npm 包名 `humantouch`。`human-touch` 已经有人用了，是一个把 AI 文字改得像人写的工具，容易混淆。
  - 命令：`npx humantouch init`、`doctor`、`remove`、`claim`、`done`、`finish`、`last`。
  - 子路径：`humantouch/vite`、`humantouch/next`、`humantouch/react`、`humantouch/next-loader`。
  - 仓库里的包目录用 `git mv`，保留历史：`packages/03kind` → `packages/humantouch`。monorepo 名 `humantouch-monorepo`。
- **写进用户项目的代码**：
  - Vite 插件 `humanTouch()`；
  - Next.js 包装 `withHumanTouch()`；
  - React 组件 `<HumanTouch />`。
- **写进用户项目的文件**：
  - 文件夹 `.03kind/` → `.humantouch/`，`.gitignore` 那一行跟着改；
  - Skill 放在 `.agents/skills/humantouch`、`.claude/skills/humantouch`，名字叫 `humantouch`；
  - AGENTS.md 那一行以「Human Touch:」开头。
- **页面上**：
  - 宿主元素 `<human-touch>`；
  - CSS 类前缀 `tk-` → `ht-`，CSS 变量 `--tk-` → `--ht-`；
  - 属性 `data-tk-*` → `data-ht-*`；
  - 本地存储键、性能标记、事件，`03kind:` → `humantouch:`；
  - 其余内部名照同样的规则改：`__THIRD_KIND__`、`__THIRD_KIND_CODE__`、`X-03Kind-Token`、`virtual:03kind/code-updates`、CSS layer 名等，以及 `doctor` 查正式构建残留的那份列表（它要和这些名字一起改）。
- **开发与测试**：
  - 环境变量 `TK_*` → `HT_*`（`HT_E2E_PORT`、`HT_BENCH_PORT`、`HT_PERF_PORT`、`HT_PERF_HEADLESS` 等）；
  - 临时目录前缀 `03kind-*` → `humantouch-*`；
  - 内部文件名和标识符跟着改，比如 `third-kind-folder.ts`、`thirdKindFolder`、e2e 的 helper。
- **文档和界面文字**：
  - 描述现状的文档里，产品名都改为 Human Touch：GLOSSARY、spec、goals、roadmap、AGENTS.md、`docs/agents/`、README、Skill、改动说明、命令输出、`claim` 的说明；
  - 切换按钮的名字改为「Human Touch: enter edit mode」；
  - 还没完成的 ticket 里的命令和名字也改（103、105、111–116、128–130、24 等）。
  - README 第一段原来是 `03Kind (say "Third Kind")`，改成只写 Human Touch。
  - Skill 和其他英文文字照旧写英文。

**不改的部分：**

- 示例页面的大标题「Third Kind」保留（设计师 2026-11-11 定）。它只是示例页面的内容，拖动、缩放的测试和测量台都靠它的宽度（要宽于约 175px），很多场景的说明里也写着这个图层名。测试里把「Third Kind」当图层名或文字用的地方也不改。
- 历史记录保留原名：ADR、已完成的 ticket、`logs/`、git 历史。
- `.scratch/vernierkit/` 这个 ticket 目录照旧不改。
- GitHub 仓库名 `Zby9999/03kind` 由设计师自己改，这张票不动它，也不改 GitHub 设置。

参考 ticket 70（上次改名的做法、分步和风险）、`e2e/old-names.test.ts`，用词以 GLOSSARY.md 为准。

**Blocked by:** None. 设计师定在发布前做。

**Status:** ready-for-agent

- [ ] 上面列出的名字全部改完。`e2e/old-names.test.ts` 加上 03Kind 的旧名：
  - 要拦的：`03kind`、`03Kind`、`ThirdKind`、`thirdKind`、`third-kind`、`THIRD_KIND`、`tk-`、`--tk-`、`data-tk-`、`TK_`，以及 70 那样的内部标识符形式；
  - 允许的：带空格的「Third Kind」（示例标题），以及历史记录。
  - Vernier 的检查照旧。
- [ ] 全量 typecheck、单测、e2e 通过，测试数量不少于改名前；设计师看到的行为、改动单的内容不变。
- [ ] 打包检查用新包名通过，包里的命令叫 `humantouch`。切换按钮体积仍 ≤ 10KB（10240 B），记下改前改后的字节数。名字变长了，余量要量。
- [ ] `--dry` 29/29、`--scripted` 20/20。`--dry --claim-out` 和改前对比，差别只在名字上（产品名、命令、包名），列出来。
- [ ] 在临时目录的全新 Vite 与 Next.js 项目里，用本地打的包走一遍：`init` → 开发服务器 → 切换按钮出现 → `doctor` 全部 ✓ → `remove` 后 git diff 为空。e2e 里已有的安装测试覆盖的，写明是哪一条。
- [ ] Comments 写明不改的部分和原因。

## 规划会话的说明

- 不跑真实 Agent，不跑有窗口的 perf。
- Skill 名 `humantouch` 只有小写字母，不像 `03kind` 以数字开头，所以不再另外验证 Claude Code、Cursor 能否认出它。这是规划会话的代定。
- 中文名不定，GLOSSARY 里只写 Human Touch。这是规划会话的代定，设计师可以再定。
- 合进 main 以后，规划会话要处理两件事：
  - 示例项目里存着的旧画布 `.03kind/`，挪成 `.humantouch/`，不删；
  - 各个 worktree 要重新 `pnpm install`。
