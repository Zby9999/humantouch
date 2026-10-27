# 08: init 与 doctor（Vite）

**What to build:** 在一个干净的 Vite + React 项目中，Agent 运行 `npx vernierkit init` 即一次装好：识别框架与包管理器、装为开发依赖、构建配置加一行插件、根组件挂载编辑层组件、把 Skill 放进项目并在 AGENTS.md 中加一行指向、忽略 `.vernier/`。`doctor` 检查安装是否完整，并确认正式构建产物中没有编辑层代码。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 07

**Status:** done

- [x] 在未安装的示例项目副本上运行 `init` 后，启动开发服务器即可看到切换按钮
- [x] Skill 同时放入项目的 .agents/skills 与 .claude/skills 位置，AGENTS.md 中出现指向它的一行（AGENTS.md 不存在时创建）
- [x] `.vernier/` 被加入 .gitignore
- [x] 自动修改配置失败时，`init` 输出清晰的手动步骤
- [x] 重复运行 `init` 不会产生重复修改
- [x] `doctor` 报告各项安装状态，并跑一次正式构建确认零残留
- [x] Agent 从收到 Guide 到切换按钮出现 ≤ 60 秒，全程无需人工介入
- [x] 对项目源码的改动不超过 2 处（构建配置一行、挂载一行）；Skill、AGENTS.md 与 .gitignore 中的一行不计入

## Comments

**实现记录（2026-10-27）**

- 模块：
  - `src/install.ts`：`init` 与 `doctor`（31 的 `remove` 也在这里）。框架之间的差别收在 `Framework` 里：构建配置文件、怎么加插件、挂载在哪个文件、怎么挂、手动步骤、正式构建命令。本 ticket 只有 Vite，09 加 Next.js。
  - `src/source-edits.ts`：对项目源码的修改，用 `@babel/parser` 找位置、只插入文字、不重排代码。`addVitePlugin` 在导出的配置对象（`defineConfig({…})`、返回对象的函数、或一个变量名）的 `plugins` 最前面插入 `vernier()`，没有 `plugins` 时补一个；`mountInEntry` 在入口模块 `render(…)` 的 JSX 里挂 `<Vernier />`：根元素有子元素（如 `<StrictMode>`）就放在最后一个子元素后面、按它的缩进另起一行，根元素是单独的 `<App />` 就包成 `<><App /><Vernier /></>`。import 行加在最后一个 import 之后，引号和分号跟随那一行。
  - `cli.ts` 的 `Io` 多了可选的 `exec`（运行包管理器与构建），node 测试里换成假的，默认用 `child_process.spawn`。
- 识别：项目根目录是从 `cwd` 往上最近的 `package.json`。包管理器按锁文件（`pnpm-lock.yaml`、`yarn.lock`、`bun.lock(b)`、`package-lock.json`，可以在更上层的 workspace 根目录）判断，其次是 `packageManager` 字段，默认 npm。没有 `react` 依赖、或既不是 Vite 也不是 Next.js 时拒绝安装，什么都不改。
- 挂载位置：入口模块取自 `index.html` 的 `<script type="module" src>`。项目源码里已经有文件引入 `vernierkit/react`（例如示例项目挂在 `App.tsx` 里）时，视为已挂载，不再挂第二个。
- **决定：** "构建配置一行、挂载一行"按"一处"理解，每处是 import 加一行使用（插件调用 / `<Vernier />`）。e2e 断言 `git status` 里除依赖、锁文件、Skill、AGENTS.md、.gitignore 外只有这两个文件，diff 的增删行正好是这几行。
- Skill 复制到 `.agents/skills/vernierkit/SKILL.md` 与 `.claude/skills/vernierkit/SKILL.md`；每次 `init` 都用包里的最新版覆盖。AGENTS.md 加一行指向前者，不存在就新建；`.gitignore` 加 `.vernier/`，已有忽略 `.vernier` 的行就不加。
- `init` 做过的事记在 `.vernier/install.json`：是否由它装了依赖、改了哪些行（每处记"改前的行 / 改后的行"）、新建了哪些文件。`remove` 靠它把行原样放回。重复运行时每一步都先检查是否已做，记录合并而不是覆盖。
- 手动步骤：配置或入口改不了（如 `module.exports = require(…)`、入口里没有 JSX 的 `render`）时，其余步骤照做，最后输出 "Finish by hand:" 和需要手写的代码，退出码 1。依赖装失败时直接停下，什么源码都不改，输出包管理器的报错和要手动运行的命令。
- `doctor`：逐项打 ✓ / ✗（依赖、插件、挂载、两处 Skill 是否最新、AGENTS.md、.gitignore），再通过包管理器跑一次 `vite build --outDir <临时目录>`，在产物的 js / css / html 里找 `vernier-kit`、`data-vk-`、`__VERNIERKIT__`。构建不写到项目的 `dist/`，也不改项目任何文件。有 ✗ 时退出码 1。
- 环境变量 `VERNIERKIT_INSTALL_FROM`：`init` 从这里安装（版本、tarball 或目录），用于发布前测试打好的包；e2e 用它装 `pnpm pack` 出的 tarball。
- 测试：
  - 命令行接缝 `test/install.test.ts`：临时目录里的 Vite 项目（npm / pnpm / yarn 锁文件、改不了的配置、没有 JSX 的入口、没有 `plugins` 的配置、函数形式的配置、单独的 `<App />`），断言写入的文件、执行的命令和输出。
  - 主接缝 `e2e/tests/install.spec.ts`：把示例项目复制到临时目录、拿掉 Vernier Kit、`pnpm install --prefer-offline`、提交到它自己的 git 仓库；然后用打包好的 tarball 跑真实的 `init`，启动这个副本的开发服务器（端口 `VK_E2E_PORT + 2`），等切换按钮出现。从运行 `init` 到切换按钮出现本机约 4 秒（含安装依赖），测试断言 < 60 秒；再断言只改了两处源码、重复 `init` 不改任何东西、`doctor` 全部 ✓。
- "Agent 从收到 Guide 到切换按钮出现 ≤ 60 秒"：命令这一段测得约 4 秒；真实 Agent 读 Guide 的耗时留给 24 的安装验收统计。

**审查后的修正（2026-10-27）**

- "已加插件"的判断从"文件里出现 `vernierkit/`"改为"引入了插件并且调用了它"（Vite：`vernierkit/vite` 且有 `vernier(`；Next.js：`vernierkit/next` 且有 `withVernier(`）。只引入不使用时 `init` 不再当作已完成，给出手动步骤；`doctor` 报 ✗。
- `init` → `git checkout .` → 再 `init`：重新修改一个文件时，先丢掉安装记录里这个文件的旧记录，`remove` 不会再因为找不到旧的那几行而误报"Finish by hand"。
- 包管理器的各条命令（安装、卸载、运行二进制、运行脚本）收进一张表 `COMMANDS`，不再分散在几个 switch 里。
