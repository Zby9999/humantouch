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
- 本机现在只有 npm 和 pnpm，没有 yarn、bun。`init` 的代码认 yarn、bun 的锁文件，用 `yarn add --dev`、`bun add --dev` 安装，但测试里从没用真的 yarn、bun 跑过。
- 无头的 Agent 起了开发服务器后能不能让它一直跑着、自己接着做下一步，pi 尤其要看：这本身也是在检验「For Agents」那几步好不好用。卡住了算没成功，原因记下来。
- Agent 起的开发服务器会用项目默认的端口（Vite 5173、Next.js 3000），跑的时候这两个端口要空着。

## 设计师决定（2026-11-03，分诊）

- 开这张 ticket，先做测量台，24 等它和 88 都做完、并且包已发布再跑。
- 安装要单独一份命令名单；Agent 中途停下来问人算失败；第 3 步「能开浏览器」那一支这次不测（无头的 Agent 都走开不了浏览器的那一支，那一支更难）。
- yarn、bun 都装：yarn 用 Node 自带的 corepack 启用，bun 用官方安装脚本装进用户目录（`~/.bun`），不碰系统目录。动手装之前先在对话里问设计师一次，同意了再装；装了什么、装在哪、怎么删，记进 Comments。

## Comments

**暂停于 2026-11-03**：测量台、10 个起点、pi 都已做好（0a568c4、2d00ee5、1094142），脚本 Agent 走查 9/10 过（没过的 next-webpack-bun-tw4 是起点自己把依赖写乱了序，已改）；代码审查的修改做了一半（323ff0d，typecheck 现在不过）。明天先让 `install-judge.ts`、`run-install.ts` 跟上新的 `install-servers.ts` / `install-allowlist.ts`，再做完审查剩下的 1、3、4、5、7、10、11 等项，然后重跑 10 个起点和故意出错的几种、全套测试，再合并。

**装了什么（2026-11-03，设计师在对话里同意后装的）**：yarn 1.22.22 用 `corepack enable yarn` 启用（node 目录里加了 `yarn`、`yarnpkg` 两个链接，本体在 `~/.cache/node/corepack/v1/yarn`）；bun 1.4.4 用官方脚本（先读过）以 `SHELL=/bin/sh` 装进 `~/.bun`，没改任何 shell 配置，另手动加了 `~/.bun/bin/bunx -> bun`（正常安装会有，`doctor` 在 bun 项目里要用）。用的时候顺带产生：`~/.config/yarn`、`~/.yarn/bin`（`yarn create` 全局装的脚手架）、`~/Library/Caches/Yarn`（约 3.3G）、`~/.bun/install/cache`。删除：`corepack disable yarn`，再 `rm -rf ~/.bun ~/.config/yarn ~/.yarn ~/Library/Caches/Yarn ~/.cache/node/corepack/v1/yarn`。

**完成（2026-11-04，接着 11-03 的暂停做完）**

提交：0a568c4（起点）、2d00ee5（测量台、判定、脚本 Agent）、1094142（pi）、323ff0d + deb134c（审查）、8e4f02f（复审）。

**启动命令**

```
pnpm bench:install [--agents claude,pi,scripted] [--starts id,…] [--runs n] [--package npm|local]
                   [--plant no-dev-server|extra-edit|asks|leaves-file] [--out <dir>]
pnpm bench:install summary <dir>
```

默认 `--agents claude,pi`、全部 10 个起点、`--package npm`（`03kind@latest`，四步原文照 README 每次读出）。`--package local` 把本仓库的包打成 .tgz，第 1 步换成 `npx -y file:<.tgz> init`，Agent 的环境带 `TK_INSTALL_FROM=<.tgz>`。`pnpm test:e2e` 不会带起它。每次的记录在 `bench-results/install/<when>/<agent>/<start>/run-n/`（不进 git）：raw.json、对话记录、Agent 结束后的 diff、`doctor` 和 `remove` 的输出、`remove` 后的 status / diff；每轮有 meta.json、summary.json、summary.md。

**判成功（六条都要过）**：`toggle` 从 Agent 进程启动到无头浏览器在 Agent 起的开发服务器（端口从 Agent 的子进程或工作目录在项目里的进程监听的端口找）上找到 "03Kind: enter edit mode" ≤ 60 秒；`ended` Agent 自己结束（没超时、退出码 0，超时 10 分钟）；`unattended` 没有问人的工具调用，最后一条消息也没在等回答（第 3 步请设计师看按钮在不在的那句不算）；`doctor` 测量台自己跑，"All good." 且没有 ✗；`source` 除 03Kind 自己的文件外只改了构建配置和渲染应用的文件，各一个 import 加一行；`removed` 测量台关掉 Agent 的开发服务器、跑 `remove` 之后 `git status --untracked-files=all` 和 `git diff` 都为空。另记：第 3 步有没有告诉设计师去看右下角的按钮、Agent 走到了哪一步（ran init / started a dev server / ran doctor / doctor All good / told to look）、超时和退出码、留下的 `.log`。

**安装用的命令名单**（两家同一份数据，`e2e/bench/install-allowlist.ts`；跑法其余照落地测量台）

- 工具：Read、Edit、MultiEdit、Write、Glob、Grep、TodoWrite、Skill、TaskStop（Claude 停后台 shell）。不给 WebFetch、WebSearch。
- 读：`ls cat head tail wc grep rg find`、`git status`、`git diff`。
- 包管理器：npm `install i ci run`；pnpm `install i add run dev`；yarn `install add run dev`；bun `install add run dev`。
- 跑包里的程序：`npx`、`bunx`、`pnpm dlx`、`yarn dlx`、`bun x`、`npm/pnpm/yarn exec` 后面只能是 `03kind`（含 `03kind@…`、`file:….tgz`）、`vite`、`next`，中间只能有不带值的开关（`-y --yes --no-install --prefer-offline --prefer-online --offline --silent -s --quiet -q --`）。
- 挡：`rm sudo kill pkill curl wget ssh scp open osascript`、`git push`，任何地方的 `--open`；Agent 的环境设 `BROWSER=none`。
- Claude：`--allowedTools` 105 条（上面这些逐个写成 `Bash(前缀:*)`，`npx 03kind` 和 `npx 03kind@latest` 各一条，因为 Claude Code 2.1.309 按整词匹配前缀；`--package local` 时另加 `npx -y file:<.tgz>`），`--disallowedTools` 24 条。
- pi：命令行和落地测量台一字不差；名单写成 `install-list.json` 放在每次 run 复制的扩展旁边，没有这个文件时扩展照旧。pi 的 bash 会等命令结束，所以只有起开发服务器的那几种写法可以加 `&` 放后台，输出只能到 `/dev/null` 或项目里的 `.log`。

**10 个起点**（每次用官方脚手架现建在系统临时目录，装好依赖、`git init` 并提交后交给 Agent，跑完删掉；脚手架取当时的最新版，版本记在 raw.json。这次是 create-vite 9.3.3 / vite 8.3.5、create-next-app 16.4.4 / next 16.4.4、Tailwind 4.3.4 / 3.4.19）

| 起点 | 框架 | 包管理器 | 样式 | 其他 |
|---|---|---|---|---|
| vite-ts-npm-css | Vite + React，TS | npm | 普通 CSS | |
| vite-js-pnpm-tw4 | Vite + React，JS | pnpm | Tailwind v4 | |
| vite-ts-yarn-tw3 | Vite + React，TS | yarn | Tailwind v3 | |
| vite-ts-bun-css | Vite + React，TS | bun | 普通 CSS | |
| vite-ts-npm-react18-tw4 | Vite + React，TS | npm | Tailwind v4 | React 18 |
| next-turbo-npm-tw4 | Next.js App Router，Turbopack | npm | Tailwind v4 | 没有 `src/` |
| next-webpack-src-pnpm-modules | Next.js App Router，webpack | pnpm | CSS Modules | 有 `src/` |
| next-turbo-src-yarn-modules | Next.js App Router，Turbopack | yarn | CSS Modules | 有 `src/` |
| next-webpack-bun-tw4 | Next.js App Router，webpack | bun | Tailwind v4 | 没有 `src/` |
| next-turbo-pnpm-tw3 | Next.js App Router，Turbopack | pnpm | Tailwind v3 | 没有 `src/` |

**脚本 Agent 走查**（`--agents scripted --package local`，8e4f02f）：到按钮出现的秒数，vite-ts-npm-css 4.8、vite-js-pnpm-tw4 6.8、vite-ts-yarn-tw3 6.9、vite-ts-bun-css 3.5、vite-ts-npm-react18-tw4 6.0、next-turbo-npm-tw4 10.9、next-webpack-src-pnpm-modules 115.7 ✗（当时负载均值约 17，单独重跑 13.9 ✓）、next-turbo-src-yarn-modules 12.6、next-webpack-bun-tw4 9.9、next-turbo-pnpm-tw3 8.1。除那一次超时外六条全过，单独重跑后 10/10；10 次都告诉了设计师看右下角的按钮。之前两轮：11-03 9/10（next-webpack-bun-tw4 的 `remove` 后 package.json 有改动：起点自己把 `@tailwindcss/postcss` 写在末尾，bun `remove` 时重新排序；已改成由包管理器添加），deb134c 上 10/10。

**故意出错**（都判对）：没起开发服务器（next-turbo-npm-tw4）只挂 `toggle`；多改一处源码（vite-js-pnpm-tw4，改 `src/App.jsx`）挂 `source`（"neither the build config nor the file that renders the app"）和 `removed`（`remove` 收不回 Agent 自己的改动，本该如此）；中途停下来问人（next-turbo-src-yarn-modules，"Should I run `npx 03kind doctor` now…"）只挂 `unattended`；`remove` 后留下东西（vite-ts-bun-css，在 `.gitignore` 多加一行）只挂 `removed`。留下一个新文件的情形由单元测试覆盖。
