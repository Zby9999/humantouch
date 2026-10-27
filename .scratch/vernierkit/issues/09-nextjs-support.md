# 09: Next.js 支持

**What to build:** Next.js App Router 项目也能使用全部已有功能：`withVernier()` 包装配置，同时支持 Turbopack 与 Webpack；`init` 能识别 Next.js 并在根布局挂载组件。服务端组件中的元素可编辑，但使用处无法确定时在改动说明中标注。本 ticket 回答规格中的两个先验证问题：Turbopack 下的源码标记、React 19 开发模式信息能否补全服务端组件的使用链。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 08

**Status:** done

- [x] 新增 Next.js App Router + CSS Modules 示例项目，01–07 的端到端测试在其上通过
- [x] Turbopack 与 Webpack 两种模式下源码标记都正确；如 Turbopack 不可行，记录结论与退路
- [x] 服务端组件中的元素能显示元素位置；使用处无法确定时，改动说明标注使用处未确定并附页面地址与周边结构
- [x] 关于 React 19 开发模式信息能否补全使用链的结论记录在 Comments 中
- [x] `init` 在 Next.js 项目上一次装好，`doctor` 通过

## Comments

**Turbopack 源码标记验证（2026-10-21，分支 `spike/turbopack-markers`）**

在 Portfolio Website 副本上验证（Next 16.2.6，App Router，Tailwind v4，three.js/motion），结论：**可行，无需退路。**

- 做法：`turbopack.rules['*.tsx']` 配一个 webpack 风格 loader（`vernierkit/next-loader`，复用源码标记转换），条件 `{ all: ['development', { not: 'foreign' }] }`。**不要写 `as`**：`as: '*.tsx'` 会把文件名变成 `X.tsx.tsx`。
- 结果：首页 253 个元素中 198 个带元素位置标记，抽查位置全部正确；第三方（lucide、motion 内部）不被标记；无水合报错。服务端组件里对客户端组件的使用处（如 `layout.tsx` 的 `<RouteTransition>`）也能从组件树读到使用处位置标记。
- 性能：冷启动首页编译 2.2s（不加 loader 2.4s），热更新无明显差别，都在误差内。
- 正式构建（`next build`，Turbopack）：客户端与服务端产物都零残留，`development` 导出条件被正确认出。
- webpack 模式（`next dev --webpack`）：在 `webpack()` 里加 `enforce: 'pre'` 的同一个 loader，结果与 Turbopack 一致。
- 需要带回主线的修正：
  1. `vernierkit/react` 构建产物要加 `"use client"`，否则放进根布局（服务端组件）会报错。
  2. CommonJS loader 要把 `@babel/parser`、`magic-string` 打包进去，并直接导出函数，否则互操作出错。
- 仍未回答：React 19 开发模式信息能否补全服务端组件本身（如 `RootLayout`）的使用链。服务端组件不出现在浏览器的组件树里，这一项按原计划留在本 ticket。

**实现记录（2026-10-27）**

- 示例项目 `examples/next-app-css-modules`：Next 16.4.3 App Router + CSS Modules + React 19.3。`app/page.tsx` 与 `components/Card.tsx` 是服务端组件，`components/GetStarted.tsx` 是客户端组件（按钮 + 对话框）。
  - Next 16.4 起 `next dev` 会在项目里写 AGENTS.md（带 `nextjs-agent-rules` 标记块），示例里把它提交了，和真实项目一致；tsconfig 保持 Next 改写后的样子（它会强制加回 `incremental`、`esModuleInterop`）；`.gitignore` 忽略 `.next/`、`next-env.d.ts`、`*.tsbuildinfo`。
  - `typecheck` 先 `next typegen` 再 `tsc`，干净的检出也能通过。
- `vernierkit/next`：`withVernier(config)`，`config` 可以是对象或函数，返回 Next 接受的函数形式；对用户的 `NextConfig` 类型是泛型，原样返回同一类型，不依赖 `next` 的类型。只在 `phase-development-server` 时改配置，其余阶段（含 `next build`）原样返回：
  - Turbopack：`turbopack.rules` 的 `*.tsx`、`*.jsx` 加 `vernierkit/next-loader`，条件 `{ not: "foreign" }`（不写 `as`，见 spike）；用户已有同名规则时合并成数组。
  - webpack：在用户自己的 `webpack()` 之后，`enforce: "pre"` 加同一个 loader，排除 `node_modules`。
  - 本机服务：在加载配置的进程里启动（每个进程一次），把 `{ url, token }` 的 JSON 放进 `env.VERNIERKIT_SERVICE`。`<Vernier />` 挂载前读 `process.env.VERNIERKIT_SERVICE`（打包器在客户端代码里把它换成字面量），设好 `window.__VERNIERKIT__`；Vite 下没有 `process`，读取包在 try 里，页面上本来就有全局变量。dev server 重启后口令会变，Turbopack 的持久缓存也会重新替换（e2e 里多次重启后自动保存照常）。
- 打包：`vernierkit/next` 同时出 ESM 与 CJS（`next.config.js` 可以 `require`）；`next-loader` 是 CJS，把 `@babel/parser`、`magic-string` 打包进去并直接导出函数；`vernierkit/react` 的两个构建加 `"use client"`。spike 列出的两处修正都已带回主线。
- **发现并修复：** Next 的遥测后台进程（`next/dist/telemetry/detached-flush.js`）也会以开发阶段加载 next.config，本机服务的 HTTP 服务器和 `watchFile` 让它永远不退出。现在本机服务对两者都 `unref()`，只跟着所在的开发服务器存活（Vite 不受影响）。
- `init` / `doctor`（`src/install.ts` 的 Next.js `Framework`）：
  - 依赖里有 `next` 就按 Next.js 处理（Next 项目可能为了 Vitest 装了 Vite）。
  - 配置 `next.config.{ts,mts,mjs,js,cjs}`：把 `export default X` / `module.exports = X` 包成 `withVernier(X)`，ESM 加 import，CJS 加 `require`；已被别的插件包过的，在最外面再包一层。
  - 根布局 `app/layout.*` 或 `src/app/layout.*`：在 `<body>` 的最后一个子元素后挂 `<Vernier />`；找不到 `<body>` 时输出手动步骤。
  - `doctor` 跑 `next build`，输出照常在 `.next`（Next 16 的 `next dev` 用 `.next/dev`，两者可同时运行），在 `.next/static`、`.next/server` 里找残留。构建会改写 `next-env.d.ts`（可能还有 tsconfig.json），`doctor` 结束后把它们恢复原样。
- 源码标记：Turbopack 与 webpack 两种模式都正确（e2e：示例项目用 Turbopack，`init` 后的副本用 webpack）。
- **React 19 开发模式信息能否补全服务端组件的使用链（规格"先验证的问题" 4）——结论：能补全大部分，使用链读取模块不用改。**
  - 服务端组件在浏览器里没有 fiber，但它渲染的元素和客户端组件，其 fiber 的 `_debugOwner` 是这个服务端组件的 `ReactComponentInfo`（`{ name, env: "Server", props, owner }`），`props` 里带着源码标记转换插入的 `data-vk-usage`。使用链读取本来就沿 `owner` 读 `ComponentInfo`，示例中卡片的使用链是 `Card used at app/page.tsx:24:11`，`Card` 是服务端组件。实测于 Next 16.4.3 + React 19.3，Turbopack 与 webpack 相同。
  - 补不全的是最外层的路由组件（`page.tsx`、`layout.tsx` 的默认导出）：Next 的路由渲染它们，不经过项目里的 JSX，`owner` 为空，没有使用处。这些组件里直接写的元素，改动说明标 "Usage not determined"，并附页面地址（`at /pricing?plan=team`）和图层在页面上的路径（Layer 一行）。
  - 为此 target 的 `context` 多了 `page`：冻结时页面的路径与查询，冻结器写在画布根元素的 `data-vk-page` 上，随画布保存和恢复。
  - 如果 React 版本的 `ComponentInfo` 不带 `props`（早期 19.0），服务端组件的使用处会同样落到 "Usage not determined"，按上面的规则处理。
- **决定：** "01–07 的端到端测试在其上通过"按功能覆盖来做。Next 的 e2e 放在独立文件里，覆盖 01–07 在 Next 上的关键路径，不把 Vite 的每个测试复制一遍（那些测试大量断言 Tailwind 类名和 Vite 示例的内容）：
  - `next.spec.ts`（Turbopack）：切换按钮出现（01）；服务端、客户端组件元素的元素位置（01）；冻结后画布上服务端组件的使用链（02/03）；在图层树选中卡片改填充，同一使用处的三个实例一起变（03/04）。
  - `next-round.spec.ts`（真实 `.vernier/`）：自动保存、刷新后恢复（05）；`claim` 的改动说明里服务端组件的使用处，以及使用处未确定时的页面地址（06）；改 CSS Module 后 `done` 在页面上核对通过、`finish`（07）。
  - `next-install.spec.ts`（webpack）：示例副本拿掉 Vernier Kit 后 `init`，`next dev --webpack` 下切换按钮与标记出现；只改了两处源码；`doctor` 全部 ✓（真实的 `next build`，零残留）；`remove` 后 `git status` 为空。
  - 端口：示例的 Next 开发服务器 `VK_E2E_PORT + 3`，安装副本 `+ 4`。
- Skill 加了一条 CSS Modules：页面上是打包后的类名，要改的是组件引入的 `.module.css` 里对应的本地类名。
- 已知限制：
  - CSS Modules 下 "Currently set by" 给出的是打包后的类名和 chunk 地址（如 `Card-module__aGLaxq__card`、`_next/static/chunks/….css`），不是 `.module.css` 文件本身。
  - `withVernier` 以 `process.cwd()` 为项目根目录，`next dev` 在项目目录里运行时成立。
  - Next 每个加载配置的进程都会启动一个本机服务（`unref` 后不会拖住进程），页面只用编译客户端代码的那一个。
