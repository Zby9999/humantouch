# 59: README、Guide 与 MIT 许可

**What to build:** README 面向设计师介绍产品与一轮的使用流程，并在上面放好几行字的 Guide（运行 init、启动开发服务器、确认切换按钮出现、运行 doctor），说明如何用 remove 卸载；仓库加入 MIT 许可。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 23（已完成）、70（已完成）

**Status:** done

- [x] README 用英文，面向设计师：03Kind 是什么、适用的项目（以 spec 为准，只写已支持的）、一轮的流程（预览 → 编辑 → 让 Agent 落地 → 看报告）。用词以 GLOSSARY.md 为准，界面上的字照编辑层实际显示的写
- [x] GitHub 仓库首页和 npm 的包页面显示同一份 README，只维护一份（例如打包时复制进包里），`pnpm pack` 打出的包里有它
- [x] README 上的 Guide 以 23 里第二版草稿为底，第 3 步照下面「设计师决定」改：Agent 能开浏览器就自己确认切换按钮，开不了就照样装完，最后告诉设计师下次打开页面时看右下角，不停下来等人
- [x] Guide 足够让一个 Agent 在 Vite 与 Next.js 项目上独立完成安装：用本地打的包，在临时目录的全新 Vite 与 Next.js 项目里，照 Guide 的最终文字一步步走通 init → 开发服务器 → `doctor` 全部 ✓，再走 remove 后 `git diff` 为空；切换按钮用 headless 浏览器确认。不跑真实 Agent，真实 Agent 的安装验收在 24
- [x] 说明如何用 `npx 03kind remove` 一条命令卸载，和 `remove` 的实际输出一致
- [x] 仓库根目录加 MIT 许可证 LICENSE，版权行为 `Copyright (c) 2026 Zby9999`；`pnpm pack` 打出的包里也有 LICENSE
- [x] 旧名检查通过；README 和 Guide 里出现的命令、按钮名、文件夹名都对照代码核过

## 背景

- 原是 23 的一部分。用户决定（2026-10-29）先搁置，不着急写，所以拆出来，等用户决定什么时候做。
- Guide 原也在 23。GLOSSARY 说 Guide 放在项目官网或 README 上，README 在本 ticket，所以用户决定（2026-10-30）把 Guide 也移到这里。23 的 Comments 里有一份 Guide 草稿，已对照 `init`、`remove` 的实际输出改过，并在临时目录的全新 Vite 与 Next.js 项目里用本地打的包走通（Next.js 只按第一版草稿跑过）。
- 开始前要问用户：README 用中文还是英文，许可证上署谁的名字。
- 草稿第 3 步写"打不开浏览器就请设计师看一眼"，与 24 的安装验收"无需人工介入"冲突，写 Guide 时一并考虑。

## 设计师决定（2026-11-03，分诊）

- README 用英文：要发布到 npm、在 GitHub 公开，读的人大多看英文；Guide 是复制给 Agent 的，草稿本来就是英文、按英文走通；编辑层界面上的字也是英文。中文版等有中文用户再加。
- 许可证署 GitHub 用户名 `Zby9999`，不署真名。
- Guide 第 3 步不再「打不开浏览器就请我看一眼」：Agent 能开浏览器就自己确认切换按钮；开不了就照样装完，最后告诉设计师下次打开页面时右下角应该有个圆形按钮，没有就告诉它。装得对不对由第 4 步的 `doctor` 查。这样 24 的「无需人工介入」照原样，不用改。
- 字标、字体之后再定，本 ticket 不做。

## Comments

**改名为 03Kind（2026-11-01，ticket 70 第三步）**：已查，无旧名（旧产品名、命令、包名、文件夹名和 vk 前缀，不分大小写地查过）。

**实现记录（2026-11-03）**

- `README.md`（仓库根目录，英文，面向设计师）：开头说 03Kind 是什么；`Projects it works with`（照 spec「技术范围」和 `init` 实际接受的：React 18 / 19，Vite 或 Next.js 16 及以上的 App Router（Turbopack 或 webpack），Tailwind v3 / v4、普通 CSS、CSS Modules，设计变量来自 CSS 变量、Tailwind v4 主题、Tailwind v3 配置；只在本地开发服务器上，正式构建里没有，`doctor` 会查）；`Guide`；`init` 动了哪些文件；`One round` 四步（Preview → Edit → Let the Agent apply them → Read the report，报告样子照 Skill 和 `report-form.ts`）；`Remove 03Kind`；`License`。
- 界面上的字照代码写：切换按钮 "03Kind: enter edit mode"（`Toggle.tsx`），Desktop / Tablet / Phone 视图（`ViewLabels.tsx`），Layers、Design 面板和其中 Position、Size、Stack、Padding、Fill、Stroke、Appearance、Effects、Text 各节，⇧A 做 Stack，Frame (F)、Text (T)，Brief 的占位字 "What should the Agent achieve here?"，Play 和 Esc，Back to preview mode，徽标和 Discard all（`ChangeList.tsx`），停住提示 "Your Agent seems to have stopped" 和 End this round、长按切换按钮（`StalledNotice.tsx`）。编辑层没有切换模式的快捷键，README 不提。用词对过 GLOSSARY，没用 _Avoid_ 里的词；"plugin" 只出现在 `remove` 原样的输出里。
- Guide 以 23 的第二版草稿为底，放在标了 `text` 的代码块里（GitHub 和 npm 上都有复制按钮）。第 3 步照设计师决定改为：能开浏览器就自己确认切换按钮；开不了也不停下等人，照样装完，最后告诉设计师下次打开页面时右下角应有一个圆形按钮，没有就告诉它。第 1、2、4 步与草稿相同。23 草稿里 remove 那一段移到 README 自己的 `Remove 03Kind` 一节，写给设计师，附 `remove` 在 npm 项目里的实际输出（下面走通时打出的，逐字一样），也说明 "Finish by hand" 和有未落地改动、正在落地时拒绝执行。
- 一份 README：只维护根目录那份。`packages/03kind/package.json` 加 `prepack`（把根目录的 `README.md`、`LICENSE` 复制进包目录）和 `postpack`（打完删掉）；`pnpm pack` 和 `pnpm publish` 都会跑这两个脚本。复制出的两个文件写进 `.gitignore`，打包中途失败留下也不会被提交。
- `LICENSE`：MIT，版权行 `Copyright (c) 2026 Zby9999`。`package.json` 的 `license` 原本就是 `MIT`。
- `e2e/tests/package.spec.ts` 加一条：打出的包里有 `README.md` 和 `LICENSE`，内容与根目录的逐字相同，LICENSE 有那行版权，`license` 是 MIT。

**照 Guide 的最终文字走一遍（2026-11-03）**

`pnpm pack` 打出本地 tgz，放在会话临时目录下 `mktemp -d` 的新目录里（不在仓库里）。第 1 步用 `TK_INSTALL_FROM=<tgz> npx -y --package=<tgz> 03kind init` 代替 `npx -y 03kind@latest init`（包还没发布）；第 2 步用 `init` 打出的命令，只加了端口参数。切换按钮用 Playwright 的 headless chromium 确认（找名为 "03Kind: enter edit mode" 的按钮、看位置、点开进编辑模式看到 Design 面板、点 "03Kind: back to preview mode" 回来、收集控制台报错）。

- Vite（`npm create vite@latest -- --template react-ts`，vite 8.3.5、React 19.3.1、npm）：`npm install`，`git init` 并提交。
  1. init：约 3.6 秒，退出 0，打出 `03Kind (Vite, npm):` 六项和 "Installed. Start the dev server (`npm run dev`) …"；改了 `vite.config.ts`（import 加 `thirdKind()`）和 `src/main.tsx`（import 加 `<ThirdKind />`），另加 Skill 两份、AGENTS.md（新建）、`.gitignore` 一行。
  2. `npm run dev -- --port 5620 --strictPort`：589ms 就绪。
  3. headless：切换按钮在 (1224, 744)，1280×800 窗口的右下角；点开进编辑模式、Design 面板出现，回预览模式正常；控制台 0 条报错。
  4. 开发服务器运行中 `npx 03kind doctor`：8 项全部 ✓，"All good."，退出 0。项目自己的 `npm run build`（`tsc -b && vite build`）也通过。
  5. 停开发服务器，`npx 03kind remove`：退出 0，打出 README 里那三行；`git status --untracked-files=all` 与 `git diff` 都为空（package-lock.json 也还原）。
- Next.js（`npx create-next-app@latest --yes --disable-git`，Next.js 16.4.4、React 19.3.0、Tailwind v4、Turbopack、npm，模板自带 AGENTS.md）：自己 `git init` 并提交。
  1. init：约 4.7 秒，退出 0；改了 `next.config.ts`（`withThirdKind(nextConfig)`）和 `app/layout.tsx`（`<ThirdKind />` 放在 `<body>` 末尾），AGENTS.md 末尾加一行，`.gitignore` 加一行。
  2. `npm run dev -- --port 5630`：Ready in 184ms。
  3. headless：切换按钮在右下角，进出编辑模式正常，控制台 0 条报错。
  4. 开发服务器运行中 `npx 03kind doctor`：8 项全部 ✓，"All good."，约 4 秒（含一次 `next build`，也就是项目自己的构建）；之后开发服务器仍返回 200。
  5. 停开发服务器，`npx 03kind remove`：退出 0，输出同上；`git status --untracked-files=all` 与 `git diff` 都为空（AGENTS.md 只去掉那一行）。
- 走完停掉了两个开发服务器，删掉了两个项目和 tgz。

**测试（2026-11-03）**

- `pnpm typecheck` 通过。
- `pnpm test`：第一次有 5 个浏览器测试文件 import 失败（新装依赖后 vite 预构建缓存的已知问题，0 条测试失败），重跑全部通过（vitest 34 个文件 804 条通过、1 条跳过；node:test 32 条通过，含旧名检查）。
- `TK_E2E_PORT=5600 pnpm test:e2e`：393 条通过、1 条跳过、1 条失败：`applying-bench.spec.ts:241`（Agent 停住的剧本，第 275 行等停住提示时拿到 null），与本 ticket 改的文件无关；重跑通过。整轮跑的时候 README 还在改，所以 `package.spec.ts` 也重跑了一次，7 条全部通过。

**风险**

- 包还没发布到 npm，Guide 第 1 步的 `npx -y 03kind@latest init` 现在跑不通；走通用的是本地 tgz。发布后要再按原文走一遍（24 的真实 Agent 安装验收）。
- 第 3 步「开不了浏览器」那一支没有真实 Agent 跑过，Agent 最后会不会照说那句话要在 24 里看。
- `prepack` / `postpack` 只在从 `packages/03kind` 用 pnpm 或 npm 打包、发布时跑；绕过它们（例如直接用别的工具打 tar）打出的包里就没有 README 和 LICENSE。`package.spec.ts` 用的是 `pnpm pack`，能抓到这种遗漏。
- README 里 "Next.js 16 or later" 照 `init` 的检查写；Webpack 只由 `next-install.spec.ts` 覆盖，全新 `create-next-app` 只按默认的 Turbopack 走过。
- README 写的是现在界面上的字，编辑层改字（例如切换按钮的名字）时 README 和 Guide 要跟着改，目前没有测试把两者绑在一起。
- npm 页面上 README 里的 `#guide` 锚点按 npm 自己的规则生成，没有在 npm 上实际看过（不发布就看不到）；LICENSE 只写文件名、不放相对链接，因为 package.json 没有 `repository`，npm 上相对链接会坏。

**按 code-review 修正（2026-11-03）**

- README 去掉 GLOSSARY「画布外的图层」「让位」_Avoid_ 里的 "aside"：编辑一节改为 "move them off the canvas: they stay beside it as off-canvas layers, for you to put back later"，Remove 一节改为 "with any off-canvas layers"。全文对过 GLOSSARY 的英文 _Avoid_ 词，别的只有 `git diff` 这条命令里的 diff，不算。
- 「桌面视图中的改动作用于所有断点」补上 GLOSSARY 断点和 ADR 0008 的例外：已在某个断点的视图里单独改过该属性的，那个断点不跟着变。
- Remove 一节：示例输出注明是没有画布外图层的 npm 项目；另加一句，有画布外的图层时第二项是 "Deleted .03kind/, with the 2 layers the designer had moved off the canvas"（照 `install.ts` 的原字，以两个为例）。
- `init` 改的两个文件前加 "such as"：`init` 也认别的扩展名的配置、`src/index.tsx` / `.jsx`、`src/app/layout.*`，这里只举例。
- `e2e/tests/package.spec.ts`：仓库根目录的路径改为文件顶部的常量 `REPOSITORY`，和 `install-copy.ts` 的 `PACKAGE`、`install.spec.ts` 的 `EXAMPLE` 一样。
- 测试：`pnpm typecheck` 通过；`pnpm test` 一次全部通过（vitest 34 个文件 804 条通过、1 条跳过；node:test 32 条通过，含旧名检查）；`pnpm build` 后 `TK_E2E_PORT=5600 pnpm exec playwright test -c e2e/playwright.config.ts e2e/tests/package.spec.ts` 7 条全部通过。

**设计师审 README（2026-11-03）**

- 「这里不要提别的产品」：开头两处去掉 Framer / Figma。第一行改为 "An editor layer for your project's local dev server: edit the page itself, visually, on a canvas, then have your Agent write the changes into the code."；第二段改为 "Click it, and the page freezes into a canvas, where you move, resize and restyle what is on it by hand, without touching the code."。后面点名 Claude Code、Cursor、Codex 的那句照旧。
- Guide 一节的标题 "## Guide" 改为 "## For agents"，让读项目的 Agent 知道这一节是写给它的；开头的链接改为 "the short install steps under [For agents](#for-agents) below"。标题下那句 "Copy this to your Agent, …" 和四步原样不动。GLOSSARY 里的 Guide 这个概念不变，只是 README 上那一节的标题不再叫 Guide。风险里说的 npm 页面锚点现在是 `#for-agents`，同样没在 npm 上看过。
- 测试和代码里没有引用这个标题或 `#guide` 的地方。全文对过 GLOSSARY 的 _Avoid_ 词和旧名，没有。
- 测试：`pnpm typecheck` 通过；`pnpm test` 一次全部通过（vitest 34 个文件 804 条通过、1 条跳过；node:test 32 条通过，含旧名检查）；`pnpm build` 后 `TK_E2E_PORT=5600 pnpm exec playwright test -c e2e/playwright.config.ts e2e/tests/package.spec.ts` 7 条全部通过。

设计师决定（2026-11-03，经规划会话转达）标题写作 "For Agents"，大写 A，与 README 别处和 GLOSSARY 的 "Agent" 一致；页内链接仍为 `#for-agents`。
