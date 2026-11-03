# 91: 安装验收的测量台

**What to build:** ticket 24 要的安装验收要一套能反复跑的测量：现建一个全新项目，把 README「For Agents」那一节的四步原文交给无头的 Agent（Claude、pi），量到切换按钮出现用了多久，核对装得对不对，再 `remove`，核对 `git diff` 为空。现在的测量台（`pnpm bench:agents`）只会跑落地场景，不会做这些。这张 ticket 把它做出来，并在发布前用本地打的包、脚本扮演的 Agent 走通；发布以后，24 换成 npm 上的包和真实 Agent 直接跑。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准（「Light」「Reversible」），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 无

**Status:** ready-for-agent

- [ ] 单独一条命令启动（和 `bench:agents` 一样，`pnpm test:e2e` 不会带起它），能选 Agent（`claude`、`pi`，以及只用脚本扮演 Agent 的模式）、选起点、选包的来源（npm 上的 `03kind@latest`，或本地打的包）。Agent 的跑法和落地测量台同一套（Claude 的模型、effort、配置隔离，pi 用 ticket 85 接上的那套），只有命令名单不同（见下一条）
- [ ] **安装用的命令名单**：落地的名单（`npx 03kind`、`git diff` 等）挡得住 `npx -y 03kind@latest init` 和起开发服务器的命令，安装要单独一份。放行：读、改、搜索的工具，`npx`，四种包管理器的安装、运行脚本和执行命令，起开发服务器，`git status` / `git diff`。仍然挡：`rm`、`sudo`、`kill` / `pkill`、`curl`、`wget`、`ssh`、`scp`、`open`、`osascript`、`git push`，以及网页搜索、抓取工具。包管理器访问 npm 源要上网，这是放行的
- [ ] **起点清单**：10 个全新项目，每次都用官方脚手架现建在系统临时目录里，装好依赖、`git init` 并提交之后才交给 Agent（设计师的项目本来就装好了依赖、跑得起来）。覆盖 ticket 24 列的那些：Vite + React（TypeScript、JavaScript 各一）、Next.js App Router（Turbopack、webpack 各一，有 `src/` 和没有各一）、npm / pnpm / yarn / bun、Tailwind v4 / v3、CSS Modules、普通 CSS、React 18 至少一个
- [ ] **计时**：从 Agent 进程启动（收到四步）算起，到测量台用无头浏览器在 Agent 起的开发服务器上找到名为 "03Kind: enter edit mode" 的按钮为止。开发服务器在哪个端口，从 Agent 起的进程监听的端口找，不靠 Agent 自报；没找到就是没成功。同时记下 Agent 整个会话结束的时间
- [ ] **判成功**，每一项都要过：按钮出现 ≤ 60 秒；没有人工介入（从对话记录判：Agent 中途停下来问人、或最后一条消息在等人回答，都算要人工介入，算失败；第 3 步「最后告诉设计师去看右下角的按钮」不算）；Agent 结束后测量台自己跑一次 `doctor`，全部 ✓；用户源码只改了 ≤ 2 处（除 03Kind 自己的文件，也就是 `package.json`、锁文件、`.gitignore`、`AGENTS.md`、Skill 目录之外，只改了构建配置和渲染应用的文件，各是一个 import 加一行）
- [ ] **卸载**：测量台关掉 Agent 留着的开发服务器，再跑 `npx 03kind remove`，`git status --untracked-files=all` 和 `git diff` 都为空
- [ ] 第 3 步：无头的 Agent 开不了浏览器，记下它最后有没有告诉设计师去看右下角的按钮（只记录，不算成功条件）
- [ ] **走通**：脚本扮演 Agent、用本地打的包，10 个起点全部判成功；再让脚本 Agent 故意出几种错（没起开发服务器、多改了一处源码、中途停下来问人、`remove` 后留下文件），测量台都判对
- [ ] 每次的记录（用时、对话记录、`git diff`、`doctor` 和 `remove` 的输出）放在不进 git 的目录，能汇总出 24 要的数
- [ ] 不跑真实 Agent（发布前第 1 步跑不通，真实跑是 24 的事）

## 背景

- 规划会话对照 docs/goals.md 查 24 时发现（2026-11-03）：24 默认这套测量已经有了，其实没有；落地用的命令名单会挡住安装的第 1、2 步；「≤ 60 秒」没写怎么计。
- 本机现在只有 npm 和 pnpm，没有 yarn、bun。要不要装、怎么装由设计师定（见设计师决定）；没装就先不做那两种起点，记下来。
- 无头的 Agent 起了开发服务器后能不能让它一直跑着、自己接着做下一步，pi 尤其要看：这本身也是在检验「For Agents」那几步好不好用。卡住了算没成功，原因记下来。
- Agent 起的开发服务器会用项目默认的端口（Vite 5173、Next.js 3000），跑的时候这两个端口要空着。

## 设计师决定（2026-11-03，分诊）

- 开这张 ticket，先做测量台，24 等它和 88 都做完、并且包已发布再跑。
- 安装要单独一份命令名单；Agent 中途停下来问人算失败；第 3 步「能开浏览器」那一支这次不测（无头的 Agent 都走开不了浏览器的那一支，那一支更难）。
