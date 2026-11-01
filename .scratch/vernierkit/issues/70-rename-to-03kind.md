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

- [ ] 上面列出的名字全部改完；除 ADR、已完成 ticket 和 git 历史外，仓库里不再有 `vernier`、`Vernier`、`vk-`、`--vk-`、`data-vk-`、`VK_` 字样，用一条检查固定下来，防止以后写回旧名
- [ ] 全量 typecheck、单测、e2e 通过，测试数量不少于改名前；设计师看到的行为、改动单的内容不变
- [ ] 打包检查用新包名通过，包里的命令叫 `03kind`；切换按钮体积仍 ≤ 10KB
- [ ] 在临时目录的全新 Vite 与 Next.js 项目里，用本地打的包走一遍 `init` → 开发服务器 → 切换按钮出现 → `doctor` 全部 ✓ → `remove` 后 git diff 为空
- [ ] Claude Code 与 Cursor CLI 都能认出名为 `03kind` 的 Skill；有一家不接受以数字开头的 Skill 名时，Skill 改叫 `third-kind`，并在 Comments 写明
- [ ] 不改的部分写在 Comments：ADR 和已完成的 ticket 是历史记录，保留原名；`.scratch/vernierkit/` 是内部的 ticket 目录，不改名

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
