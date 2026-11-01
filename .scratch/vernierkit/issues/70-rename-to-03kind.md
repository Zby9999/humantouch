# 70: 改名为 03Kind

**What to build:** 产品从 Vernier Kit 改名为 03Kind（口头叫 Third Kind，中文叫「第三类」），设计师、Agent 和开发者能看到的地方一次改完，行为不变：

- **包与命令**：npm 包名 `03kind`，命令 `npx 03kind init`、`doctor`、`remove`、`claim`、`done`、`finish`、`last`；子路径 `03kind/vite`、`03kind/next`、`03kind/react`。
- **写进用户项目的代码**：JS 标识符不能以数字开头，所以 Vite 插件叫 `thirdKind()`，Next.js 包装叫 `withThirdKind()`，React 组件叫 `<ThirdKind />`。`init` 写进构建配置和挂载处的就是这几个名字。
- **写进用户项目的文件**：项目里的文件夹 `.vernier/` 改为 `.03kind/`，`.gitignore` 那一行随之改；Skill 放在 `03kind` 目录、名字叫 `03kind`；AGENTS.md 那一行以「03Kind:」开头。
- **页面上**：宿主元素 `<third-kind>`；编辑层界面的 CSS 类 `tk-`、CSS 变量 `--tk-`；写进页面和画布的属性 `data-tk-*`；浏览器本地存储的键以 `03kind:` 开头。
- **开发与测试**：环境变量 `VK_*` 改为 `TK_*`（如 `TK_E2E_PORT`、`TK_PERF_PORT`、`TK_PERF_HEADLESS`）；仓库里的包目录和 monorepo 的名字随之改。
- **文档**：描述现状的文档（GLOSSARY、spec、goals、roadmap、AGENTS.md、Skill、改动说明、命令输出、23 与 59 里的 Guide 草稿）里的产品名都改为 03Kind。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 22, 60, 61, 62, 63, 64, 65, 66, 67, 68

**Status:** ready-for-agent

- [x] 上面列出的名字全部改完；除 ADR、已完成 ticket 和 git 历史外，仓库里不再有 `vernier`、`Vernier`、`vk-`、`--vk-`、`data-vk-`、`VK_` 字样，用一条检查固定下来，防止以后写回旧名
- [x] 全量 typecheck、单测、e2e 通过，测试数量不少于改名前；设计师看到的行为、改动单的内容不变
- [x] 打包检查用新包名通过，包里的命令叫 `03kind`；切换按钮体积仍 ≤ 10KB
- [x] 在临时目录的全新 Vite 与 Next.js 项目里，用本地打的包走一遍 `init` → 开发服务器 → 切换按钮出现 → `doctor` 全部 ✓ → `remove` 后 git diff 为空
- [ ] Claude Code 与 Cursor CLI 都能认出名为 `03kind` 的 Skill；有一家不接受以数字开头的 Skill 名时，Skill 改叫 `third-kind`，并在 Comments 写明
- [x] 不改的部分写在 Comments：ADR 和已完成的 ticket 是历史记录，保留原名；`.scratch/vernierkit/` 是内部的 ticket 目录，不改名

## 背景

- 用户决定（2026-10-30）：我们的工作方式是纯设计软件、装了 Agent 的设计软件之外的第三类，即装进 Agent 的设计工具，取「第三类」之意，名字带量产代号的感觉。03Kind 就是「第三类」，避开了 Type 03 在设计圈里容易被当成字体的问题。
- 包名 `03kind` 在 npm 上没人用；whois 查 `03kind.com` 没有注册。商标还没查。
- 还没发布、没有外部用户，所以不做旧名的兼容和迁移；本地示例项目里存着的旧画布会失效。
- 改名几乎动到整个仓库，所以等编辑层线（22、60、61、62）和落地线（63–68）都合进 main 后再做；60 会改编辑样式在画布上的存法，`data-vk-rules` 一类属性正在其中。必须在 59（README）和发布到 npm 之前完成。
- GitHub 仓库已于 2026-10-30 改名为 `Zby9999/03kind`（私有），本地的 origin 已指向新地址；旧地址由 GitHub 重定向。本 ticket 里出现仓库地址的地方（如 package.json 的 repository，若有）用新地址。

## Comments

### 第一步：包与命令（2026-11-01，分支 claude/stoic-bose-b2d970）

70 分三步做，这是第一步：包、命令、写进用户项目的名字。验收项等三步都做完再勾。

**做了什么**

- 包：`packages/vernierkit` 用 git mv 移到 `packages/03kind`，历史保留。包名和 bin 都叫 `03kind`，子路径是 `03kind/vite`、`03kind/next`、`03kind/react`（还有 `03kind/next-loader`）。monorepo 叫 `03kind-monorepo`，根 package.json 的 `--filter` 跟着改，pnpm-lock.yaml 由 `pnpm install` 重新生成。package.json 原本没有 repository 字段，这一步没加。
- 写进用户项目的代码：Vite 插件 `thirdKind()`（`import thirdKind from "03kind/vite"`），Next.js 包装 `withThirdKind()`，React 组件 `<ThirdKind />`。`init` 写进构建配置和挂载处的是这几个名字；`doctor` 用它们认安装；`remove` 照 `.03kind/install.json` 的记录撤回，未经 `init` 安装时的提示也改成 `<ThirdKind />`。Vite 插件的 `name` 和 `optimizeDeps.exclude` 改为 `03kind`，Next 的 loader 改为 `03kind/next-loader`。
- 写进用户项目的文件：
  - 文件夹 `.vernier/` 改为 `.03kind/`，`.gitignore` 那一行和认它的正则跟着改，git 排除路径 `**/.03kind/**` 也改了。仓库自己的 `.gitignore` 同样改了。
  - Skill 放在 `.agents/skills/03kind`、`.claude/skills/03kind`，frontmatter 写 `name: 03kind`。
  - AGENTS.md 那一行以「03Kind:」开头。
- 命令输出、Skill 正文、改动说明里的命令名和包名都改了（`npx 03kind claim/done/finish/last/remove/init/doctor`、`03kind is a dependency` 等）。
- 内部命名：`vernier-folder.ts` 改为 `third-kind-folder.ts`（含 `thirdKindFolder`、`ThirdKindFolder`、`THIRD_KIND_DIR`），`thirdKindLoader`、`ignoresThirdKind`，临时目录前缀改为 `03kind-*`。
- examples、e2e 和测量台里对包、导入名、`.03kind/` 的引用都跟着改：
  - e2e 的 helper 改名：`npx03kind()`、`THIRD_KIND_FOLDER`、`readFolderFile()`、`clearFolder()`、`copyWithoutThirdKind()`。
  - 测量台的放行命令改为 `npx 03kind`，Skill 路径、AGENTS 行的正则、读包的正则和对应测试都跟着改。
  - e2e/perf 里的 `.vernier` 路径也改了。perf 只过了 typecheck，没有跑。

**改前、改后（同一台机器，e2e 用 VK_E2E_PORT=5900）**

| | 改前 | 改后 |
|---|---|---|
| `pnpm typecheck` | 通过 | 通过 |
| `pnpm test` 里的 vitest | 710 passed、1 skipped（31 个文件） | 710 passed、1 skipped（31 个文件） |
| `pnpm test` 里的 e2e/bench | 29 pass | 29 pass |
| `pnpm test:e2e` | 349 passed、1 skipped | 349 passed、1 skipped |
| 切换按钮体积，toggle-first.spec，已发布文件 gzip 后 | 9998 B | 10000 B |
| 切换按钮体积，install.spec，从打的包安装、Vite 送出的样子 | 10163 B | 10166 B |
| 体积上限 | 10240 B | 10240 B |
| `pnpm bench:agents --dry` | 没测 | 10 个场景全 ✓（打包 → 从 tarball `init` → 场景） |

- package.spec 是打包检查，改后用新包名通过。
- 体积多出 2–3 B，来自组件名 `ThirdKind` 比 `Vernier` 长。
- 体积是在两份尺寸测试里临时加 console.log 读出来的，读完就删了。

**风险**

- 切换按钮离上限只剩 74 B（install.spec 的口径）。改名前就只剩 77 B，第二步改页面上的名字（`<third-kind>`、`03kind:` 存储键等）时要再量。
- 包目录换了位置之后，第一次跑 vitest 的浏览器测试，有 5 个文件导入失败（Vite 在重新预构建依赖），第二次就全过了。改名前在新装依赖的 worktree 里第一次跑也是这样，属于环境原因，不是改名造成的。
- 在新 checkout 里，`pnpm typecheck` 要先 `pnpm build`：examples 的类型取自 dist。这一点改名前就是这样。

**留给后面两步**

- 页面上的名字：`<vernier-kit>`（HOST_TAG）、`vk-`、`--vk-`、`data-vk-*`、localStorage 的 `vernierkit:` 键、性能标记 `vernierkit:check`/`vernierkit:parts`/`vernierkit:enter-edit-mode`、`vernierkit-edits` 这个 CSS layer、事件 `vernierkit:code`、`__VERNIERKIT__` 和 `__VERNIERKIT_CODE__`、`X-Vernier-Token`、`virtual:vernierkit/code-updates`，还有 `doctor` 查正式构建残留的 RESIDUE 列表（它要跟着上面这些一起改）。
- 环境变量：`VK_*`，以及 `VERNIERKIT_INSTALL_FROM`、`VERNIERKIT_SERVICE`。
- 产品名「Vernier Kit」：这一步只改了命令名和包名，产品名在下面这些地方还没改：
  - 命令输出：如 `Vernier Kit (Vite, pnpm):`、`Vernier Kit removed`、`no page with Vernier Kit is open`。
  - 改动说明：`made by the designer in Vernier Kit`、`code Vernier Kit could not locate`。
  - Skill 的 description 和标题。
  - 页面上的 aria-label：`Vernier Kit: enter edit mode` 等。
  - 开发服务器日志和源码注释。
  
  所以同一段输出里新旧两个名字并存，比如「made in Vernier Kit … run `npx 03kind done`」，AGENTS 那一行已经是「03Kind:」。
- 示例页面自己的标题文字「Vernier Kit」：很多 e2e 按这个图层名选图层。它是示例内容，要不要改留给后面决定。
- 历史 fixture `**/fixtures/round-before-60/`：保持当时代码写出的原样，其中 claim.md 的开头还写着 `npx vernierkit`。测试只比较各条改动的段落，不受影响。
- 防止写回旧名的检查，以及文档里的产品名。

**已部分达成的验收项**

- 第 3 项已部分达成：「打包检查用新包名通过，包里的命令叫 `03kind`；切换按钮体积仍 ≤ 10KB」。
- 第 2 项目前成立：数量不少于改名前。
- 第 4 项（临时目录里走一遍全新项目）：install.spec 和 next-install.spec 已在临时目录里，用本地打的包走完 `init → 开发服务器 → 切换按钮 → doctor ✓ → remove → git 无改动`；完整的手动验收留到最后一步。
- 第 5 项没有验证：Claude Code、Cursor 能不能认以数字开头的 Skill 名。

### 第二步：页面上的名字（2026-11-01，分支 claude/stoic-bose-b2d970）

70 分三步做，这是第二步：packages/、examples/、e2e/ 里代码、测试、示例中剩下的旧名。验收项等三步都做完再勾。

**做了什么**

- 页面上的名字：
  - 宿主元素 `<third-kind>`（HOST_TAG）。
  - 编辑层的 CSS 类 `tk-`、CSS 变量 `--tk-`。
  - 写进页面和画布的属性 `data-tk-*`，`dataset.tkNotice` 等随之改。
  - CSS layer `third-kind-edits`。CSS 标识符不能以数字开头，所以这里不用 03kind。
  - localStorage 键 `03kind:layers-panel`、`03kind:views`、`03kind:toggle-corner`。
  - 性能标记 `03kind:check`、`03kind:parts`、`03kind:enter-edit-mode`，事件 `03kind:code`。
  - 虚拟模块 `virtual:03kind/code-updates`，请求头 `X-03Kind-Token`。
  - 全局变量 `__THIRD_KIND__`、`__THIRD_KIND_CODE__`。
- `doctor` 查正式构建残留的 RESIDUE 改为 `["third-kind", "data-tk-", "__THIRD_KIND__"]`。install.test 里埋的残留和 production-build.spec 查的残留都跟着换成新名字，所以测试仍然有效。
- 环境变量：
  - `VK_*` 改为 `TK_*`：`TK_E2E_PORT`、`TK_PERF_PORT`、`TK_PERF_HEADLESS`、`TK_PERF_RUN`、`TK_WRITE_FIXTURE`（Vite 里是 `VITE_TK_WRITE_FIXTURE`），以及 `TK_BENCH_*`。
  - `VERNIERKIT_INSTALL_FROM` 改为 `TK_INSTALL_FROM`，`VERNIERKIT_SERVICE` 改为 `TK_SERVICE`。
- 内部标识符：测试和测量台里挂在 window 上的 `vkSeen`、`__vkDraw`、`__vkBench*` 等，统一改为 `tk`/`__tk` 前缀。
- 产品名「Vernier Kit」改为「03Kind」，涉及：
  - 命令输出，如 `03Kind (Vite, pnpm):`、`03Kind removed`、`03Kind doctor`、`no page with 03Kind is open`。
  - 改动说明：`made by the designer in 03Kind`、`code 03Kind could not locate`。
  - Skill 的 description 和标题。
  - aria-label：`03Kind: enter edit mode`、`03Kind: back to preview mode`、`03Kind: applying design changes…`。
  - 报错、开发服务器日志、源码注释、快照。
- 示例页面：三个示例的 h1 改为「Third Kind」，页面 `<title>` 里的产品名改为「03Kind example: …」。e2e 和测量台里按标题文字选图层、比对标题的地方都跟着改。测试里设计师打的字原来是「Vernier…」，改为「Third…」；测量台场景里的「Vernier Studio」改为「Third Kind Studio」。打的字只用字母，不用「03Kind」，免得测试打字时碰上画布的数字键快捷键（现在只有 Shift+1 一个）。
- 历史 fixture `round-before-60`（两处）：
  - 旧名换成了新名字：`data-tk-*`、`third-kind-edits`、`npx 03kind`、`made … in 03Kind`、`code 03Kind could not locate`。存法仍是 60 之前的样子：每个实例各有一份 `<style data-tk-edit-styles data-tk-rules…>`。它测的仍是 60 之前的存法能照样打开，测试有意义。
  - e2e 那份画布里冻结的 h1 文字也随示例改为「Third Kind」。这样 styles.json 里 h1 的宽度在三个视图里都要从 184.172px 改为 179.109px。这个值是手改的：把画布里的文字换成新标题后，用现在的代码跑 autosave.spec 的这条测试，取它在三个视图里报出的 h1 宽度（三个视图相同）填进去。其余样式一个没动，仍是当时的代码写的。
- 示例标题怎么选：e2e 和测量台里有几处测法靠标题的宽度，改名不应改变它们测的东西，所以标题要和原来「Vernier Kit」的宽度接近（h1 原来 184.172px），且要多于一个词。这几处测法一律保持 51da820 时的样子，只把其中的旧名换成新名：drag.spec「dragged into another Stack … beside a locked layer」、测量台场景 reorder-and-move、resize.spec「text dragged narrower … as they wrap」。
  - 先试过「03Kind」（124.406px）：标题太窄，Beta 徽章落进标题行左边四分之一。按 drag.ts 的规则，同级的 Stack 只能从中间一半拖进去，前两处拖进 header 的那一步因此不成立；一个词拖窄也不会折行，resize 那条不成立。
  - 再试「03Kind Studio」（250.766px）：这三处都过，但 layers.spec「the hover outline … the deepest one」五次里五次失败。标题在画布上约 69.5 屏幕像素宽，悬停框和元素各自取整后差 1 px。
  - 最后用「Third Kind」（179.109px）：这三处和 layers.spec 都过，全量也全过。
  - 拖进 header 那一步的余量变小了：徽章中点要在标题行中间一半以内，大约要求 h1 宽于 174.5px。
- 清了 Next 示例的 `.next` 缓存（不进 git）。Turbopack 的持久缓存里还留着旧 loader 的输出，元素上没有 `data-tk-loc`，next.spec 有 3 条因此失败，清掉缓存后通过。

**改前、改后（同一台机器，e2e 用 TK_E2E_PORT=5900，改前用 VK_E2E_PORT=5900）**

| | 改前（51da820） | 改后 |
|---|---|---|
| `pnpm build`、`pnpm typecheck` | 通过 | 通过 |
| `pnpm test` 里的 vitest | 710 passed、1 skipped（31 个文件） | 710 passed、1 skipped（31 个文件） |
| `pnpm test` 里的 e2e/bench | 29 pass | 29 pass |
| `pnpm test:e2e` | 349 passed、1 skipped | 349 passed、1 skipped |
| 切换按钮体积，toggle-first.spec，已发布文件 gzip 后 | 10000 B | 9990 B |
| 切换按钮体积，install.spec，从打的包安装、Vite 送出的样子 | 10167 B | 10154 B（前几次同样的包量到 10152–10155 B） |
| 体积上限 | 10240 B | 10240 B |
| `pnpm bench:agents --dry` | 没测 | 10 个场景全 ✓ |

- 体积是在两份尺寸测试里临时加 console.log 读出来的，读完就删了。install.spec 的口径同一份代码几次之间差 1–3 B；第一步记的是 10166 B，这次改前量到 10167 B。
- 体积变小，因为 `third-kind` 比 `vernier-kit` 短，`03kind:` 比 `vernierkit:` 短，`03Kind:` 也比 `Vernier Kit:` 短。离上限还有约 85 B。
- `grep -rIn --exclude-dir=node_modules -iE 'vernier|vk-|VK_|\bvk[A-Z]|__vk' packages examples e2e` 什么也查不到，dist 和 `.next` 都已按新代码重新生成。

**风险**

- 本地示例项目或别处存着的旧画布（`data-vk-*`、`vernierkit-edits`）会失效，localStorage 里旧的 `vernierkit:` 键也不再读（面板开合、视图、切换按钮位置会回到默认）。没有外部用户，按 70 的约定不做迁移。
- 已有的 Next 项目，`.next` 里的 Turbopack 缓存要清掉一次，否则元素上没有 `data-tk-loc`。
- 有的测试靠示例标题的宽度：drag.spec、测量台 reorder-and-move 拖进 header 那一步，以及 layers.spec 的悬停框取整。这次的标题是按它们挑的。以后再改示例标题，要先量 h1 的宽度。
- e2e fixture 的 styles.json 里，h1 的宽度 179.109px 是手改的：现在的代码量出来的值，不是当时的代码写的。其余部分仍是当时写的。
- 代码评审提了一条，不属于这一步：`data-tk-` 前缀在约 20 处直接写成字面量，没有共用常量；e2e 里的 `X-03Kind-Token` 也没有从 `TOKEN_HEADER` 取。这些在改名前就是这样，这一步没动。

**留给第三步**

- 文档里的产品名：GLOSSARY、spec、goals、roadmap、AGENTS.md、docs/、未完成的 ticket、Guide 草稿。其中还写着 `VK_E2E_PORT`、`VK_PERF_*`、`VK_BENCH_*` 这些旧的环境变量名。
- e2e/bench 除环境变量之外的整理。
- 防止写回旧名的检查。
- 在临时目录的全新项目里走 init → doctor → remove。

### 第三步：文档、测量台与检查（2026-11-01，分支 claude/stoic-bose-b2d970）

70 分三步做，这是最后一步：文档、测量台、防止写回旧名的检查，以及在全新项目里走一遍。验收项除「Claude Code 与 Cursor CLI 都能认出名为 `03kind` 的 Skill」外都已勾上。那一项要跑真实 Agent，由用户另外安排，所以 Status 仍是 ready-for-agent。

**做了什么**

- 文档：GLOSSARY、AGENTS.md、`.scratch/vernierkit/spec.md`、`.scratch/sandbox/spec.md`、docs/goals.md 里的产品名改为 03Kind。具体是：
  - 包名 `03kind`，文件夹 `.03kind/`，`VK_BENCH_STALL_REAL` 改为 `TK_BENCH_STALL_REAL`；
  - goals 里的「Vernier Bench」改为「03Kind Bench」；
  - GLOSSARY 开头加了一段：口头叫 Third Kind，中文叫「第三类」，以及为什么 JS 标识符和元素名写作 Third Kind；
  - spec 的「包与模块」补了写进项目的 `thirdKind()`、`withThirdKind()`、`<ThirdKind />`。
  
  docs/roadmap.md、docs/agents/* 本来就没有旧名。
- Guide 草稿：23 的 Comments 里有两份 Guide 草稿，都改了，只改以 `>` 开头的行：
  - 产品名改为 03Kind；
  - 命令改为 `npx -y 03kind@latest init`、`npx 03kind doctor`、`npx 03kind remove`；
  - 文件夹改为 `.03kind/`；
  - 按钮名改为「03Kind: enter edit mode」，已对过 Toggle.tsx。
  
  23 的其余部分没动。59 里没有 Guide 草稿。
- 没做完的 ticket：Status 不是 done 的只有 24、59、74、75、76、77、78（70 除外）。不分大小写查了旧产品名、`vk`、`.vernier`，都没有旧名，在各自的 Comments 里写了「已查，无旧名」。
- 测量台 e2e/bench：前两步已经改干净，这一步没有要改的。
  - 临时目录前缀都是 `03kind-*`。
  - 包名、Skill 路径（`.agents/skills/03kind`、`.claude/skills/03kind`）、放行命令表、AGENTS 行的正则都用新名字。
  - `NO_SKILL_PROMPT` 是「运行 `npx 03kind claim`，照输出落地」。
  - `pnpm bench:agents --dry`：10 个场景全 ✓。
- 防止写回旧名的检查：`e2e/old-names.test.ts`，加在 `pnpm test` 里，跟在 `node --test 'e2e/bench/*.test.ts'` 后面。
  - 查的范围：git 跟踪的文件，加上未跟踪也未被忽略的文件（还没 `git add` 的新文件也查），文件内容和路径都查。二进制文件只查路径。
  - 查的写法：`vernier`、`Vernier`、`VERNIER`、`vk-`、`VK_`，区分大小写。`vk-` 已经包括 `--vk-` 和 `data-vk-`。检查文件自己用字符类写模式（如 `[v]ernier`），所以不用把自己列为例外。
  - 例外只有下面这些，理由写在文件头：
    - `docs/adr/`；
    - Status（文件里第一条 Status 行）为 done 或 resolved 的 ticket，任何 `.scratch/<功能>/` 下都算；
    - 旧目录下的 ticket 70；
    - 旧目录下的 ticket 23，但它以 `>` 开头的行（Guide 草稿）照查；
    - 旧目录下的 `logs/`；
    - 文字里作为路径出现的 `.scratch/vernierkit`。
  - 因为每个功能目录的 ticket 编号都从 01 开始，所以 23、70、`logs/` 只在旧目录下放行（这是代码评审提出的）。整份放行的文件，路径也放行。
  - 证明检查有效：
    - 在改名前的 198e218 上（临时 worktree，放进这份检查）跑，报 2896 行；
    - 在第二步结束时的 a92fe37 上跑，报 6 个文件，正是这一步要改的文档和 23 的草稿；
    - 临时往 `packages/03kind/src` 写一个 `data-vk-loc`，报出那一行，往 docs/ 写一个 `VK_E2E_PORT` 也报出；
    - 现在通过。
  - 另有两条单元测试：一条测每种旧写法都能查出、ticket 目录名和新名字不误报；一条测例外的范围。

**改前、改后（同一台机器，e2e 用 TK_E2E_PORT=5900）**

| | 改前（a92fe37，第二步结束） | 改后 |
|---|---|---|
| `pnpm build`、`pnpm typecheck` | 通过 | 通过 |
| `pnpm test` 里的 vitest | 710 passed、1 skipped（31 个文件） | 710 passed、1 skipped（31 个文件） |
| `pnpm test` 里的 node --test | 29 pass（e2e/bench） | 32 pass（e2e/bench 29 + 旧名检查 3） |
| `pnpm test:e2e` | 349 passed、1 skipped | 349 passed、1 skipped |
| 切换按钮体积，toggle-first.spec，已发布文件 gzip 后 | 9990 B | 9990 B |
| 切换按钮体积，install.spec，从打的包安装、Vite 送出的样子 | 10154 B | 10152 B |
| 体积上限 | 10240 B | 10240 B |
| `pnpm bench:agents --dry` | 10 个场景全 ✓ | 10 个场景全 ✓ |

- 体积读法和前两步一样：在两份尺寸测试里临时加 console.log，读完就还原了。这一步没改代码，install.spec 的 2 B 差别在同一份代码几次之间的浮动范围内。
- package.spec（打包检查）用新包名通过，包里的 bin 是 `03kind`。
- 第一次跑 e2e 时，breakpoints.spec 的「the change list says the breakpoint of each change made in a narrower view」等 Fill color 输入框超时，maxFailures 让其余 81 条没跑。当时机器负载约 11，全新 Next 项目正在 `npm install`。之后单独重跑这份 spec 通过，整套重跑 349 passed、1 skipped。

**全新项目走一遍**

两个项目都放在 session 的临时目录（scratchpad）里，都用官方脚手架建，`git init` 并提交初始状态。用的是第三步代码 `pnpm pack` 打出的 `03kind-0.0.0.tgz`（286 kB）。包还没发布到 npm，所以 `init` 用 `TK_INSTALL_FROM=<tgz> npx -y --package <tgz> 03kind init` 跑，`init` 装进项目的就是这个 tgz；`doctor`、`remove` 直接用 `npx 03kind`，取的是项目 node_modules 里的那份。页面用 Playwright 的 headless shell 打开（1280×800）。

- Vite：`npm create vite@latest -- --template react-ts`（create-vite 9.3.3，Vite 8.3.5，React 19.3，npm）。
  - `init`：约 3 秒。输出 `03Kind (Vite, npm):`，装了依赖，`vite.config.ts` 加了 `thirdKind()`，`src/main.tsx` 挂上 `<ThirdKind />`，Skill 放到 `.agents/skills/03kind` 和 `.claude/skills/03kind`，新建的 AGENTS.md 里写了以「03Kind:」开头的那一行，`.gitignore` 加了 `.03kind/`。最后提示 `npm run dev` 和 `npx 03kind doctor`。
  - 开发服务器：`npm run dev -- --port 5930 --strictPort`。页面上有一个 `<third-kind>`，切换按钮「03Kind: enter edit mode」在右下角（1224, 744，40×40）。点开进得了编辑模式（出现「03Kind: back to preview mode」），控制台没有报错。
  - `npx 03kind doctor`：8 项全 ✓（依赖、插件、挂载、两份 Skill、AGENTS.md、.gitignore、正式构建没有编辑层），最后是 "All good."
  - 先停开发服务器，再 `npx 03kind remove`：约 2 秒，输出 `03Kind removed:`，撤回了插件、`<ThirdKind />`、Skill、AGENTS.md 和 .gitignore 里的行，删了 `.03kind/`，`npm uninstall 03kind`。之后 `git diff`、`git status` 都为空，被忽略的只有 `node_modules/`（package-lock.json 也还原了）。
- Next.js：`npx create-next-app@latest --yes`（Next 16.4.3，App Router，Turbopack，Tailwind v4，npm，模板自带 AGENTS.md）。
  - `init`：约 46 秒，大部分时间花在 `npm install`，当时 e2e 全量在同时跑。输出 `03Kind (Next.js, npm):`，`next.config.ts` 改为 `withThirdKind(nextConfig)`，`app/layout.tsx` 在 body 里挂上 `<ThirdKind />`，AGENTS.md 末尾加了「03Kind:」那一行，其余和 Vite 一样。
  - 开发服务器：`npm run dev -- -p 5931`。`<third-kind>` 和切换按钮都在，按钮在右下角，进得了编辑模式，控制台没有报错。
  - `npx 03kind doctor`：8 项全 ✓，"All good."
  - 先停开发服务器，再 `npx 03kind remove`：约 2 秒。之后 `git diff`、`git status` 都为空，被忽略的只有 `.next/`、`next-env.d.ts`、`node_modules/`，这三项建项目时就有。
- 用完关掉了两个开发服务器，删掉了两个项目和 tgz。

**不改的部分**

- ADR（`docs/adr/`）是历史记录，保留原名。
- 已完成的 ticket（Status 为 done）是历史记录，保留原名。23 的 Guide 草稿是唯一的例外：59 要把它发布出去，所以改了。
- `.scratch/vernierkit/` 是内部的 ticket 目录，不改名。文档里写到这个路径的地方也照旧。
- `.scratch/vernierkit/logs/` 是历史记录，不改。
- git 历史不改。

**风险**

- 检查也查未跟踪、未被忽略的文件。在仓库里留了写着旧名的草稿或日志，`pnpm test` 会失败，需要把它放进被忽略的位置。
- 检查放在 `e2e/` 根目录（e2e 的 tsconfig 已经包含它，`pnpm typecheck` 会查到）。它查的是整个仓库，和 e2e 没关系，以后找它时要知道在这里。
- Status 为 wontfix 的 ticket 不在例外里。现在没有这样的 ticket，以后出现、又写着旧名时，要决定它算不算历史记录。
- 23 里只有 Guide 草稿用了新名字，周围的验证记录还写着 `vernierkit@latest`、`VERNIERKIT_INSTALL_FROM`。读的人要知道这是 70 有意改的，原因写在这里。
- 全新项目只用 npm 走过（两个脚手架默认都用 npm）；pnpm 由 e2e 的 install.spec、next-install.spec 覆盖。
- 23 和 59 指出的 Guide 第 3 步（「打不开浏览器就请设计师看一眼」）与 24 的「无需人工介入」冲突，这一步没动，仍留给 59。
