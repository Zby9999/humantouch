# 可行性调研：DialKit 形态的 "Figma-like 网页可视化编辑器"

> 调研日期：2026-10-14。所有事实性陈述都附了一手来源链接（官方文档、GitHub 源码/README、规范、官方博客/changelog）。标注 **未验证** 的条目，是没能追到一手来源，或者一手来源本身没写清楚的。标注 **推断** 的条目，是作者根据一手资料做的推理，不是来源原话。
>
> 源码类结论来自 2026-10-14 对相关仓库 `main`/`master` 分支的浅克隆阅读。

---

## 0. TL;DR 结论

**可行，前提是收窄范围、选对"回写代码"的方式。** 一句话：做成 **"dev-only 叠加层 + Figma 式属性面板 + 结构化变更单（ChangeSet）→ 交给 coding agent 落地（部分安全子集确定性直写）"**，难度和风险都可控，而且业界正在往这个方向收敛。反过来，**"对任意现存代码库，像 Figma 一样自由拖拽/重组，并确定性地写回干净源码"**，目前没有任何产品做到通用，属于实际上未解决的问题。

关键判断：

1. **DialKit 本身不处理"回写代码"**。它的回写方式是：面板里的 **Copy** 按钮生成一段 "Update the useDialKit configuration … with these values" 的 JSON+指令，用户粘贴给 agent 落地（[`src/copy-instruction.ts`](https://github.com/joshpuckett/dialkit/blob/main/src/copy-instruction.ts)，[README · Presets and persistence](https://github.com/joshpuckett/dialkit#presets-and-persistence)）。它的"Agent Guide"其实就是官网上一段让 agent 安装、挂载 `<DialRoot />` 的提示词（[joshpuckett.me/dialkit](https://joshpuckett.me/dialkit)）。所以 DialKit 能成立，靠的是 **显式绑定**：值本来就在 `useDialKit(...)` 的配置里，agent 知道往哪写。你的工具面对的是 **隐式的任意 DOM**，难度高一个量级。
2. **"选中 → 面板改样式 → 实时预览 → 交给 agent 应用"已经是主流**：v0 Design Mode 的 Apply 会把待定编辑发给 chat 由模型生成新版本（[v0 docs](https://v0.app/docs/design-mode)）；Figma Make 的属性面板把编辑暂存在 prompt box，应用时由 agent 改代码（[Figma blog, 2026-07-30](https://www.figma.com/blog/properties-panel-and-annotations-now-in-figma-make/)）；Cursor 的可视化编辑器同样是 "tell the agent to apply it"（[Cursor blog, 2025-12-11](https://cursor.com/blog/browser-visual-editor)）。Chrome DevTools 甚至宣布将在 Chrome 152 弃用 AI 自动样式修复，改为 "Copy to coding agent"（[What's new in DevTools 149](https://developer.chrome.com/blog/new-in-devtools-149)）。
3. **确定性直写源码的成功案例都靠强约束**：Onlook 只支持 Next.js + Tailwind（[README](https://github.com/onlook-dev/onlook#what-you-can-do-with-onlook)），并且把 `data-oid` 属性**直接写进用户源码**来做映射（[`packages/file-system/src/code-fs.ts`](https://github.com/onlook-dev/onlook/blob/main/packages/file-system/src/code-fs.ts)）。Lovable 只编辑自己 AI 生成的项目，用自定义 Vite 插件给每个 JSX 组件分配稳定 ID（[Lovable blog](https://lovable.dev/blog/visual-edits)）。
4. **最接近你设想的现成开源件是 Agentation 的 "Layout mode"**：它能在页面上对区块做自由拖拽、8 向缩放、吸附参考线，然后输出 Markdown 版的 "Suggested Layout Changes"，里面带像素到 CSS 的换算提示，交给 agent 实现（[`design-mode/rearrange.tsx`](https://github.com/benjitaylor/agentation/blob/main/package/src/components/design-mode/rearrange.tsx)，[`design-mode/output.ts`](https://github.com/benjitaylor/agentation/blob/main/package/src/components/design-mode/output.ts)）。但它的许可证是 **PolyForm Shield 1.0.0**，不是 OSI 开源许可，不能拿来做竞品（[README · License](https://github.com/benjitaylor/agentation#license)）。
5. **React 19 移除了 `_debugSource`**（[react/react#28265](https://github.com/react/react/pull/28265)），官方至今没给 1:1 替代（[issue #31981](https://github.com/react/react/issues/31981)，仍为 open）。DOM→源码映射应该走 **编译期注入属性**（code-inspector-plugin 的做法），或者 **owner stack + source map**（React Grab 经 `bippy` 的做法）。

**建议**：MVP 只做 React（Vite/Next dev），属性面板加"同父容器内重排"加 Hug/Fill/Fixed 尺寸语义，输出 ChangeSet 走 MCP/剪贴板交给 agent。确定性直写放到第二阶段，只覆盖"静态 className 字面量 / 静态 style 对象 / 同文件静态兄弟节点重排"这个安全子集。"自由拖到任意位置并跨父级重组"放到更后面，而且默认语义是 **flow-aware**（重排/换父级），不默认转成 `position:absolute`。

---

## 1. DialKit 解析

| 项 | 事实 | 来源 |
|---|---|---|
| 仓库 | `joshpuckett/dialkit`，作者 Josh Puckett，MIT，2026-01-24 创建，约 1.2k stars（2026-10-14） | [GitHub](https://github.com/joshpuckett/dialkit)，[LICENSE](https://github.com/joshpuckett/dialkit/blob/main/LICENSE) |
| 定位 | "Live controls for tuning interfaces. Adjust values, compare versions, and edit animation timing in your running app." | [README](https://github.com/joshpuckett/dialkit#readme) |
| 版本/适配 | npm 包 `dialkit` v2.0.1；React 18+ / Solid / Svelte 5 / Vue 3 / Vanilla，分别从 `dialkit`、`dialkit/solid` 等子路径导入 | [package.json](https://github.com/joshpuckett/dialkit/blob/main/package.json)，[README · Quick start](https://github.com/joshpuckett/dialkit#quick-start) |
| 用法 | 在布局里挂一次 `<DialRoot />`，在组件里调用 `useDialKit("Card", { radius: [24, 0, 64], color: "#a78bfa" })` 拿到值，再自己绑到 style 上 | [README · React](https://github.com/joshpuckett/dialkit#react) |
| 控件 | Slider、Toggle、Text、Color、Select、Image、XY pad、Spring、Easing、Action、Folder；另有 Timeline dock | [README · Controls](https://github.com/joshpuckett/dialkit#controls)，[docs/timeline.md](https://github.com/joshpuckett/dialkit/blob/main/docs/timeline.md) |
| 持久化 | 默认不持久化；`persist: true` 写入 `localStorage` 的 `dialkit:${id}` 键，也可选 `sessionStorage` | [docs/reference.md · Persistence](https://github.com/joshpuckett/dialkit/blob/main/docs/reference.md#persistence) |
| **回写代码** | 面板 **Copy** 把当前值和一条应用指令放进剪贴板。指令原文开头是 `Update the ${hookName} configuration for "${panelName}" with these values:`，接 JSON，结尾是 "Apply these values as the new defaults in the … call."；Timeline 版本还会让 agent 加一条 `TODO(production)` 注释 | [`src/copy-instruction.ts`](https://github.com/joshpuckett/dialkit/blob/main/src/copy-instruction.ts) |
| 生产环境 | 框架版 root 在生产构建中默认隐藏，可用 `productionEnabled` 打开 | [README · Panel layout](https://github.com/joshpuckett/dialkit#panel-layout) |
| **Agent guide 形态** | 官网有 "Or just tell your agent to set it up" 的安装提示词（装 `dialkit motion`，把 `<DialRoot />` 作为 `{children}` 的兄弟节点挂到 root layout，引入 `dialkit/styles.css`），另有 4 条 "Prompts to get started" 示例提示词。仓库里**没有**官方 `SKILL.md` / `AGENTS.md` / `llms.txt` | [joshpuckett.me/dialkit](https://joshpuckett.me/dialkit)；仓库文件列表（README/CONTRIBUTING/docs/*） |
| 第三方 skill | claudskills.com 上有一个 `dialkit` SKILL.md，指向该仓库为 upstream，但没写作者，**不是官方发布的** | [claudskills.com/skills/dialkit](https://claudskills.com/skills/dialkit/SKILL.md) |

**对本项目的启示：**

- DialKit 的"agent 集成"有两半：一半是**安装引导**（一段 prompt），一半是**回传格式**（Copy 出带指令的 JSON）。你的工具可以沿用这个双半结构，但两半都要做重：安装要加 dev 插件和源码定位，回传要描述"改了哪个元素、在哪个文件哪一行、改了什么、上下文布局是什么"。
- DialKit 不需要 DOM→源码映射，因为开发者（或 agent）**事先**声明了可调参数。可以考虑一个混合模式：在任意元素上编辑，同时允许 agent "把这个元素的这几个属性提升成 DialKit 式显式参数"。这是一个有特色、实现简单的差异点（**推断**）。

---

## 2. 现有工具版图

图例：**相关度** 高 = 可直接借鉴架构或作为竞品；中 = 借鉴局部；低 = 概念参考。

### 2.1 "在你自己的运行中应用上叠加编辑 / 选取"类（最相关）

| 名称 | 链接 | 做什么 | 如何映射回代码 | 开源? | 相关度 |
|---|---|---|---|---|---|
| **Onlook** | [onlook-dev/onlook](https://github.com/onlook-dev/onlook) | 面向 Next.js + Tailwind 的可视化代码编辑器，"Figma-like UI"、图层、在父容器内拖拽重排、插入 div、改 Tailwind 样式 | 写文件时把 `data-oid` 注入 JSX 并**保存到源码**（[`code-fs.ts`](https://github.com/onlook-dev/onlook/blob/main/packages/file-system/src/code-fs.ts) 调用 [`addOidsToAst`](https://github.com/onlook-dev/onlook/blob/main/packages/parser/src/ids.ts)）。编辑先作用于 iframe 里的 DOM，再用 Babel AST 改代码（[architecture.mdx](https://github.com/onlook-dev/onlook/blob/main/docs/content/docs/developers/architecture.mdx)）。样式先转 CSS 再由 `CssToTailwindTranslator` 转成 Tailwind 类，用 `twMerge` 合并（[`code/tailwind.ts`](https://github.com/onlook-dev/onlook/blob/main/apps/web/client/src/components/store/editor/code/tailwind.ts)） | Apache-2.0 | **高** |
| **Agentation** | [benjitaylor/agentation](https://github.com/benjitaylor/agentation) | React 工具条：点选元素加批注、多选、区域选、暂停动画；**Layout mode**：区块自由拖拽/缩放/吸附、放置线框组件 | 不改代码。输出结构化 Markdown（选择器、位置、可选源文件路径、组件树、计算样式）；附带 MCP server `agentation-mcp`，提供 `agentation_get_pending`、`agentation_resolve`、`agentation_watch_annotations` 等工具（[README](https://github.com/benjitaylor/agentation#readme)，[mcp/src](https://github.com/benjitaylor/agentation/tree/main/mcp/src)）。Layout mode 输出 "Suggested Layout Changes" + 像素→CSS 换算公式（[`output.ts`](https://github.com/benjitaylor/agentation/blob/main/package/src/components/design-mode/output.ts)） | **否**（PolyForm Shield 1.0.0） | **高**（产品形态最近） |
| **React Grab** | [aidenybai/react-grab](https://github.com/aidenybai/react-grab) | 悬停任意元素按 ⌘C，复制元素 + 组件栈 + 源码位置给 agent；`npx grab@latest init` 安装；导出 `react-grab/primitives`（命中测试、源码上下文、冻结页面） | 运行时读 React fiber，经 [`bippy`](https://github.com/aidenybai/bippy) 的 `getSource`/`getOwnerStack` 拉取 bundle 和 source map 解析位置，Next.js 还做服务端帧符号化（[`core/context.ts`](https://github.com/aidenybai/react-grab/blob/main/packages/react-grab/src/core/context.ts)）。自带 skill：用 `npx react-grab@latest pull` 轮询抓取（[`skills/react-grab/SKILL.md`](https://github.com/aidenybai/react-grab/blob/main/skills/react-grab/SKILL.md)） | MIT | **高**（选取层 + 源码定位可直接用） |
| **code-inspector-plugin** | [zh-lx/code-inspector](https://github.com/zh-lx/code-inspector) | 点 DOM 打开 IDE 到对应行 | 编译期注入 `data-insp-path`（[`constant.ts`](https://github.com/zh-lx/code-inspector/blob/main/packages/core/src/shared/constant.ts)）。支持 Vue2/3、React、Preact、Solid、Svelte、Astro（[README](https://github.com/zh-lx/code-inspector#readme)）；有 vite/webpack/esbuild/turbopack/mako 插件。JSX 转换会把**调用处路径**经 props 传给组件根元素（`__codeInspectorPath`，[`transform-jsx.ts`](https://github.com/zh-lx/code-inspector/blob/main/packages/core/src/server/transform/transform-jsx.ts)） | MIT | **高**（映射层首选参考） |
| **LocatorJS** | [infi-pc/locatorjs](https://github.com/infi-pc/locatorjs) | 点 UI 组件打开 IDE | React 适配器沿 `_debugOwner` 找 `_debugSource`（[`findDebugSource.ts`](https://github.com/infi-pc/locatorjs/blob/master/packages/runtime/src/adapters/react/findDebugSource.ts)）。另有 Babel 插件注入 `data-locatorjs` 属性的 "data-id" 模式（[`packages/babel-jsx`](https://github.com/infi-pc/locatorjs/tree/master/packages/babel-jsx)） | 仓库未声明 SPDX 许可（GitHub API 返回空）**未验证** | 中 |
| **click-to-component** | [ericclemmons/click-to-component](https://github.com/ericclemmons/click-to-component) | Option+Click 打开 VS Code | 直接读 `instance._debugSource`（[`getSourceForInstance.js`](https://github.com/ericclemmons/click-to-component/blob/main/packages/click-to-react-component/src/getSourceForInstance.js)）。React 19 已移除该字段（[#28265](https://github.com/react/react/pull/28265)），**推断**在 React 19 上失效 | MIT | 低（反面教材） |
| **vite-plugin-vue-inspector** | [webfansplz/vite-plugin-vue-inspector](https://github.com/webfansplz/vite-plugin-vue-inspector) | Vue 3 点元素跳源码 | 从 Vue 编译后的 render 输出加 Vite source map 记录位置，Vapor 模式等情况回退到 dev-only 的 `data-v-inspector` 标记（README） | MIT | 中 |
| **vite-plugin-svelte inspector** | [docs/inspector.md](https://github.com/sveltejs/vite-plugin-svelte/blob/main/docs/inspector.md) | Svelte 点元素跳源码 | 读元素上的 `__svelte_meta.loc`（[`Inspector.svelte`](https://github.com/sveltejs/vite-plugin-svelte/blob/main/packages/vite-plugin-svelte/src/plugins/inspector/runtime/Inspector.svelte)） | MIT | 中 |
| **react-dev-inspector** | [zthxxx/react-dev-inspector](https://github.com/zthxxx/react-dev-inspector) | 点 React 组件跳 IDE | **未验证**具体机制（未读源码） | MIT | 低 |
| **Stagewise** | [stagewise-io/stagewise](https://github.com/stagewise-io/stagewise) | 现在是 "open source agentic IDE"（桌面应用，内置浏览器加 agent）。旧 CLI 包描述为 "stagewise is now a desktop app. This CLI is deprecated." | 由内置 agent 改代码（README）。早期"注入到应用里的 toolbar"形态的细节在当前仓库中**未验证** | AGPL-3.0 | 中（说明"注入式 toolbar"赛道有人转型） |
| **Motion Studio** | [motion.dev/docs/studio](https://motion.dev/docs/studio) | 在运行中的网站上放时间线编辑 Motion 动画 | 编辑先只做本地预览；Apply 时 "Simple edits are written straight to code by the Motion Studio server"，接了 agent 就由 agent 写，没接则复制 prompt 到剪贴板；**拒绝过期编辑**（"Studio rejects stale edits"）；代码里以表达式写的值在时间线上只读；用 Vite/Next/Webpack 的 dev 插件接入 | 商业订阅 | **高**（混合回写策略的最佳先例） |
| **VisBug** | [GoogleChromeLabs/ProjectVisBug](https://github.com/GoogleChromeLabs/ProjectVisBug) | 浏览器扩展，在任意页面上用设计工具交互方式改 DOM/样式 | 不回写代码。仓库已 **archived**（GitHub API `archived: true`） | Apache-2.0 | 中（交互参考） |
| **Chrome DevTools** | [Workspaces](https://developer.chrome.com/docs/devtools/workspaces) | Elements/Styles 编辑；连接 workspace 文件夹后可保存回源文件；AI assistance 可 "Apply to workspace" | Chrome 152 起弃用 AI 自动样式修复，改用 "Copy to coding agent"；DevTools MCP server 已稳定（[DevTools 149](https://developer.chrome.com/blog/new-in-devtools-149)，[chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)） | Chromium 开源 | 中 |
| **Polypane** | [polypane.app](https://polypane.app/) | 多视口开发浏览器，Elements 面板可在所有 pane 同步改 DOM/CSS | 厂商页面未描述源码回写 | 商业 | 低 |

### 2.2 AI 应用生成平台内置的可视化编辑

| 名称 | 链接 | 做什么 | 如何映射回代码 | 开源? | 相关度 |
|---|---|---|---|---|---|
| **v0 Design Mode** | [v0.app/docs/design-mode](https://v0.app/docs/design-mode) | 选中元素，面板改排版、颜色、背景、margin/padding、边框、透明度、圆角、阴影、文字；结构性修改用自然语言 | Apply 把待定编辑、指令和截图发到 chat，v0 生成新版本（"Applying creates a normal v0 chat version"）；检测到 Tailwind 时给出兼容值 | 否 | 高（UX 参考） |
| **Lovable Visual Edits** | [lovable.dev/blog/visual-edits](https://lovable.dev/blog/visual-edits)（2025-03-13） | 点选元素改 Tailwind 类、颜色等 | 自定义 Vite 插件给 AI 生成的每个 JSX 组件分配稳定 ID；项目代码同步到浏览器做 AST（Babel/SWC）；客户端 Tailwind 生成器做乐观预览；保存时由 AST 生成 JSX 并做行级 diff，再 HMR | 否 | 高（确定性直写的参考架构） |
| **Bolt Visual Edits** | [support.bolt.new/building/visual-edits](https://support.bolt.new/building/visual-edits) | Select 工具，上下方向键在父子间切换，可改文本、颜色、字号、对齐 | 编辑先批量暂存，点 "Save changes" 才改代码，"Bolt uses tokens only when you save"，**推断**落地由 LLM 完成 | 否 | 中 |
| **Cursor 浏览器可视化编辑器 / Design Mode** | [cursor.com/blog/browser-visual-editor](https://cursor.com/blog/browser-visual-editor)（2025-12-11），[Changelog 3.7](https://cursor.com/changelog/design-mode-improvements) | 在内置浏览器里拖动渲染后的元素跨 DOM 树重排；侧栏暴露 React props 切换变体；样式控件包括滑杆、调色板、自定义 token、flex/grid、排版；3.7 加入多选和语音 | "tell the agent to apply it"：由 agent 定位组件并改代码 | 否 | **高**（最直接的竞品） |
| **Figma Make（属性面板 + 本地代码 beta）** | [blog 2026-07-30](https://www.figma.com/blog/properties-panel-and-annotations-now-in-figma-make/)，[blog 2026-05-28](https://www.figma.com/blog/figma-make-now-on-your-local-code/) | 属性面板（行高、字距、透明度、z-index、边框、间距、圆角等），拖拽重排；可连接本地/生产代码库（Mac Beta 桌面版） | "Direct manipulation stages every edit in the prompt box"，应用时 agent 改代码并消耗 credits；本地代码模式下 "the agent finds the relevant code and edits it" | 否 | **高**（竞品） |
| **Builder.io Fusion** | [docs: get-started-fusion](https://www.builder.io/c/docs/get-started-fusion)，[blog 2025-06-18](https://www.builder.io/blog/introducing-fusion) | 连接现有 git 仓库，在 Visual Editor 中可视化编辑或用 prompt 修改，然后 Send PR | 文档未说明可视化编辑到代码是确定性转换还是 AI 生成（**未验证**）；PR 中 @builderio-bot 可继续修改（[fusion-toolbar](https://www.builder.io/c/docs/fusion-toolbar)） | SDK 开源（[BuilderIO/builder](https://github.com/BuilderIO/builder)），Fusion 否 | 中 |
| **Tempo Labs** | tempo.new | 第三方资料称其为面向 React 的可视化编辑器 | **未验证**：没找到官方技术文档 | 否 | 低 |

### 2.3 "设计工具是真源"类（反方向：设计→代码）

| 名称 | 链接 | 做什么 | 映射方式 | 开源? | 相关度 |
|---|---|---|---|---|---|
| **Plasmic** | [plasmicapp/plasmic](https://github.com/plasmicapp/plasmic)，[codegen 指南](https://docs.plasmic.app/learn/codegen-guide/) | React 可视化构建器，可拖用户的代码组件 | `plasmic sync` / `plasmic watch` 把设计生成到用户仓库，Plasmic 设计是 "source of truth" | MIT | 低-中 |
| **Webflow DevLink** | [DevLink Export quickstart](https://developers.webflow.com/devlink/docs/quick-start/quick-start-component-export) | 把 Webflow 组件导出为 React | `webflow devlink export` 写到 `./webflow`，手改会被覆盖（[What's exported](https://developers.webflow.com/devlink/docs/component-export/whats-exported)）；集成页称其为 "one-way synchronization"（[webflow.com/integrations/react](https://webflow.com/integrations/react)） | 否 | 低 |
| **Subframe** | [docs.subframe.com](https://docs.subframe.com/learn/concepts) | 设计器生成 React + Tailwind | CLI 把组件同步到 `src/subframe/components`，主题 token 同步为 Tailwind 配置；也可经 MCP 给 agent | 否 | 低 |
| **Framer** | [Framer Academy: Stacks](https://www.framer.com/academy/lessons/framer-fundamentals-stacks-and-relative-positioning)，[Positioning modes](https://www.framer.com/academy/lessons/layer-positioning-modes-in-framer) | 自有画布：普通 Frame 的子项默认绝对定位，Stack 按行/列加 gap/padding/对齐流式排列，Stack 内允许 absolute 子项 | 不编辑外部代码库 | 否 | 中（"absolute vs stack" 交互模型参考） |
| **Locofy** | [Auto layout 文档](https://www.locofy.ai/docs/plugin/classic/design-structure/responsiveness/auto-layout/) | Figma → 代码 | 文档称 auto layout 对应 CSS Flexbox | 否 | 低 |
| **Figma MCP code-to-canvas** | [developers.figma.com](https://developers.figma.com/docs/figma-mcp-server/code-to-canvas/) | 把运行中的网页 UI 抓成可编辑的 Figma 图层（beta） | 单向抓取，不回写；社区反馈抓出来的是原始 frame，不对应库组件（[forum #51286](https://forum.figma.com/suggest-a-feature-11/figma-mcp-generate-figma-design-should-resolve-html-elements-to-existing-library-components-instead-of-raw-frames-51286)） | 否 | 中（另一条路线：在真 Figma 里改，再让 agent 对 diff） |

### 2.4 页面构建器框架（拥有自己的数据模型，不编辑任意现存代码）

| 名称 | 链接 | 要点 | 开源? | 相关度 |
|---|---|---|---|---|
| **Puck** | [puckeditor/puck](https://github.com/puckeditor/puck) | React 可视化编辑器，组件经 `config.components` 注册（含 `fields` 与 `render`），README 示例中由 `save(data)` 回调把数据交给你自己存储（"You own your data"） | MIT | 低（编辑器 UX 参考） |
| **Craft.js** | [prevwong/craft.js](https://github.com/prevwong/craft.js) | 拖拽页面编辑器框架，组件里用 `useNode()` 的 `connect/drag` 连接器；最近一次 push 是 2025-02 | MIT | 低 |
| **GrapesJS** | [GrapesJS/grapesjs](https://github.com/GrapesJS/grapesjs) | HTML 模板构建框架（Blocks、Style Manager、Layer Manager） | BSD-3（GitHub 显示 NOASSERTION，**未验证**） | 低（Style Manager 面板参考） |
| **tldraw Make Real** | [tldraw/make-real](https://github.com/tldraw/make-real) | 画 UI 草图交给 LLM 生成 HTML；仓库已 archived | 未声明 | 低 |

### 2.5 属性面板/调参库

| 名称 | 链接 | 要点 | 开源? |
|---|---|---|---|
| **Leva** | [pmndrs/leva](https://github.com/pmndrs/leva) | `useControls` hook，12+ 种输入；README 标注 "under heavy development" | MIT |
| **Tweakpane** | [cocopon/tweakpane](https://github.com/cocopon/tweakpane) | 无依赖的调参面板，受 dat.GUI 启发，有插件和主题 | MIT |
| **Theatre.js** | [theatre-js/theatre](https://github.com/theatre-js/theatre) | 动效编辑器（studio + 时间线）；README 称 1.0 开发**暂时转到私有仓库** | Apache-2.0 |
| **DialKit** | 见 §1 | — | MIT |

> 结论：属性面板库都是**显式绑定**模型（先声明参数再绑定）。你的面板面对的是任意 DOM 元素的计算样式，**建议自己实现面板**，需要的 Figma 式控件（数值拖拽、色板、阴影编辑器）可以参考 DialKit/Tweakpane 的交互（**推断**）。

---

## 3. 技术构件与限制

### 3.1 叠加层 / 选取层

- **命中测试**：`document.elementsFromPoint()` 返回该点上从顶到底的所有元素（[MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/elementsFromPoint)），可用来实现 Figma 式"Cmd+点击穿透到深层"。React Grab 把它封装成 `getElementAtPoint(x, y, { container, filter })`，并约定 `data-react-grab-ignore` 跳过工具自身 UI（[README · Customize hit testing](https://github.com/aidenybai/react-grab#customize-hit-testing)）。
- **包围盒**：`getBoundingClientRect()` 返回含 transform 的视口坐标矩形（[MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect)）。滚动、尺寸变化、DOM 变化都要重算，可以用 `ResizeObserver`（[MDN](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver)）+ `MutationObserver` + rAF。被 rotate/scale 的元素只能拿到外接矩形，要画真实旋转框得自己解析 `transform` 矩阵（**推断**）。
- **UI 隔离**：工具 UI 挂在 shadow root 里（[`attachShadow`](https://developer.mozilla.org/en-US/docs/Web/API/Element/attachShadow)），防止宿主 CSS 污染。React Grab 和 Agentation 都这么做（[`mount-root.ts`](https://github.com/aidenybai/react-grab/blob/main/packages/react-grab/src/utils/mount-root.ts)，[`components/shadow-root`](https://github.com/benjitaylor/agentation/tree/main/package/src/components/shadow-root)）。React Grab 源码注释里记录了一个真实坑：宿主节点必须挂到 `<body>` 而不是 `<html>`，否则 Next.js hydration 报错，而且应用替换 `<body>` 后要重新挂载。
- **压在模态框之上**：宿主应用的 `<dialog>`/popover 位于 top layer（[MDN](https://developer.mozilla.org/en-US/docs/Glossary/Top_layer)），普通 z-index 压不住，工具 UI 自身也可能需要进 top layer（**推断**）。
- **iframe / shadow DOM 内的宿主元素**：Agentation 支持 open shadow roots 和同源 iframe（[README · Features](https://github.com/benjitaylor/agentation#features)），跨源 iframe 无法注入（浏览器同源策略）。
- **冻结状态**：hover 菜单、动画这类瞬态 UI 需要"冻结"后才好编辑。React Grab primitives 提供 page freezing（[README](https://github.com/aidenybai/react-grab#build-your-own-react-grab)），Agentation 提供 animation pause。
- **两种宿主模式**：(a) **注入式**：库直接跑在用户页面里（DialKit/React Grab/Agentation）；(b) **iframe 宿主式**：编辑器把应用装进 iframe（Onlook："Our editor receives the preview link and displays it in an iFrame"，[README · How it works](https://github.com/onlook-dev/onlook#how-it-works)）。你要做"Guide for Agent 集成进现有应用"，应该选 (a)。

### 3.2 拖拽 / 缩放 / 重排库

| 库 | 拖拽 | 缩放 | 旋转 | 吸附/参考线 | 排序列表 | 多选/框选 | 维护状态 | 来源 |
|---|---|---|---|---|---|---|---|---|
| **Moveable**（daybrush） | ✓ | ✓ | ✓ | ✓ Snappable（guideline） | ✗ | Groupable | 最近 npm 发布 `moveable@0.53.0` 在 2023-12，仓库最后 push 2024-06 → **维护风险** | [README](https://github.com/daybrush/moveable#-features) |
| **Selecto**（daybrush） | — | — | — | — | — | ✓ 拖框选择 | 最后 push 2024-06 | [README](https://github.com/daybrush/selecto) |
| **interact.js** | ✓ | ✓ | 手势 | ✓ snap modifiers（网格等） | ✗ | — | 活跃（2026-08 push） | [README](https://github.com/taye/interact.js) |
| **dnd-kit** | ✓ | ✗ | ✗ | 自定义碰撞检测 | ✓ `@dnd-kit/dom/sortable`、多容器、嵌套 | — | 活跃；新架构分 `abstract`/`dom`/各框架适配层 | [README](https://github.com/clauderic/dnd-kit) |
| **Pragmatic drag and drop** | ✓（基于原生 HTML5 DnD） | ✗ | ✗ | 可选 drop indicator | ✓ | — | 活跃；单向镜像仓库，不收 PR | [README](https://github.com/atlassian/pragmatic-drag-and-drop) |

**建议（推断）**：这些库都假设**你拥有被拖元素的渲染**（React 组件内用 hook），而叠加层编辑器拖的是宿主的任意 DOM。实际做法通常是 **在叠加层里画代理框**（handles 在 shadow DOM 里），拖拽时给宿主元素临时加 `transform`/`position:fixed`，落下后再翻译成语义操作。Onlook 就是自己写的：拖动时把元素设为 `position:fixed` 加 `transform`，同时在父容器里插入一个占位 stub，用兄弟元素的包围盒算插入索引，flex-row、block、grid 各有算法（[`move/drag.ts`](https://github.com/onlook-dev/onlook/blob/main/apps/web/preload/script/api/elements/move/drag.ts)，[`move/stub.ts`](https://github.com/onlook-dev/onlook/blob/main/apps/web/preload/script/api/elements/move/stub.ts)）。Agentation 的 Layout mode 也是自写：8 个方向手柄、5px 吸附阈值、参考线（[`rearrange.tsx`](https://github.com/benjitaylor/agentation/blob/main/package/src/components/design-mode/rearrange.tsx)）。所以 Moveable 可以用于原型期，但核心交互最好自己写，或者只拿 interact.js 做底层手势。

### 3.3 核心概念难题：流式布局 vs Figma 的 absolute + auto layout

Figma 有两种模型：普通 Frame 里子项绝对定位；auto layout Frame 里子项按方向/间距/对齐流式排列，子项可以设 `layoutPositioning: 'ABSOLUTE'` 脱离流（[Figma Plugin API · layoutPositioning](https://developers.figma.com/docs/plugins/api/properties/nodes-layoutpositioning/)）。Framer 是同样的二分法（[Framer Academy](https://www.framer.com/academy/lessons/layer-positioning-modes-in-framer)），并建议 "relative positioning by default — absolute should be a last resort"（[Framer marketplace tutorial](https://www.framer.com/marketplace/tutorials/beginner-mistakes/)）。

现有工具怎么调和"自由拖拽"和 flow 布局：

| 工具 | 策略 | 来源 |
|---|---|---|
| Onlook | 若元素本身 `position:absolute`，就改 `left/top`（`dragAbsolute`）；否则**只在同一父容器内重排**，按父容器 display（flex 行/列、grid、block）算插入索引，最后写成 JSX 子节点顺序变化（`moveElementInNode`）。另有 `groupElementsInNode` 把多个兄弟包进新容器 | [`drag.ts`](https://github.com/onlook-dev/onlook/blob/main/apps/web/preload/script/api/elements/move/drag.ts)，[`code-edit/move.ts`](https://github.com/onlook-dev/onlook/blob/main/packages/parser/src/code-edit/move.ts)，[`code-edit/group.ts`](https://github.com/onlook-dev/onlook/blob/main/packages/parser/src/code-edit/group.ts) |
| Agentation Layout mode | 允许完全自由地拖动/缩放区块，**但不直接改 CSS**，而是输出新旧矩形，并附上翻译规则："vertical gap → `margin-top` 或 `gap`""居中判断 → `margin-inline: auto`""宽度占容器百分比 → `width: X%`"，再加父容器的 `display/flex-direction/gap`，交给 agent 推断语义 | [`output.ts`](https://github.com/benjitaylor/agentation/blob/main/package/src/components/design-mode/output.ts) |
| Cursor | "drag rendered elements across the DOM tree"，交给 agent 应用 | [Cursor blog](https://cursor.com/blog/browser-visual-editor) |
| Figma Make | "drag elements to reorder them"，文中只提到重排 | [Figma blog](https://www.figma.com/blog/properties-panel-and-annotations-now-in-figma-make/) |

**作者观点**：正确默认是 **flow-aware 拖拽**，也就是拖动等于"在父容器里换顺序"或"移入另一个容器"（re-parent），由插入指示线表达。只有用户显式按修饰键或开启 "absolute" 时，才转成 `position:absolute` + 偏移。随手的像素级自由拖拽如果直接写成 absolute，会毁掉响应式。Agentation 的"自由拖 + 让 agent 解释意图"是另一条可行路线，适合"粗排版草图"场景，二者可以并存。

#### Figma auto layout ↔ CSS 映射（作者推导；Figma 侧取自 Plugin API，CSS 侧取自 MDN）

| Figma（[FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)） | CSS |
|---|---|
| `layoutMode: HORIZONTAL / VERTICAL` | `display:flex; flex-direction: row / column`（[MDN flexbox](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Basic_concepts_of_flexbox)） |
| `layoutMode: GRID` + `gridColumnSizes/gridRowSizes/gridColumnGap/gridRowGap` | `display:grid; grid-template-columns/rows; column-gap/row-gap` |
| `itemSpacing` | `gap`（[MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/gap)） |
| `layoutWrap: WRAP` + `counterAxisSpacing` | `flex-wrap: wrap` + 交叉轴 `row-gap`/`column-gap` |
| `paddingTop/Right/Bottom/Left` | `padding-*` |
| `primaryAxisAlignItems: MIN/CENTER/MAX/SPACE_BETWEEN/SPACE_AROUND/SPACE_EVENLY` | `justify-content: flex-start/center/flex-end/space-between/space-around/space-evenly`（[MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/justify-content)） |
| `counterAxisAlignItems: MIN/CENTER/MAX/BASELINE` | `align-items: flex-start/center/flex-end/baseline`（[MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/align-items)） |
| `counterAxisAlignContent: SPACE_BETWEEN` | `align-content: space-between` |
| 子项 `layoutSizingHorizontal: FILL`（主轴） | `flex: 1 1 0` / `flex-grow:1`（[MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/flex-grow)）；FILL 在交叉轴 → `align-self: stretch` |
| `HUG` | `width: fit-content` / `auto`（容器靠内容撑开） |
| `FIXED` | `width: Npx` + `flex-shrink: 0` |
| `layoutPositioning: ABSOLUTE` + constraints | `position:absolute` +（父 `position:relative`）+ `top/left/right/bottom` |
| `strokesIncludedInLayout: true` | Figma 文档自己说等同 `box-sizing: border-box`（[FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)） |
| `fills`（多层 Paint） | 多层 `background` / gradient |
| `strokes`（inside/center/outside） | `border`（只能在内侧）；outside 需要用 `outline` 或 `box-shadow` spread 模拟 |
| `effects` DROP_SHADOW / INNER_SHADOW | `box-shadow` / `box-shadow: inset`（[MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/box-shadow)） |
| `effects` LAYER_BLUR / BACKGROUND_BLUR | `filter: blur()` / `backdrop-filter: blur()` |
| `cornerRadius` | `border-radius` |
| `opacity` / `blendMode` | `opacity` / `mix-blend-mode` |
| `clipsContent` | `overflow: hidden` |

**映射不对称（推断）**：CSS 有而 Figma 没有的概念包括 margin（含负 margin、margin collapsing）、`flex-shrink`、`order`、百分比/`vw`/`clamp()`、媒体查询和容器查询、级联/继承/特异性、`position: sticky`、层叠上下文、文本流内联布局。所以属性面板 **不能只做 Figma 的子集**，至少要能**展示**这些值（否则用户看到的"Figma 值"与实际渲染不一致），并对 margin 等提供"高级"区。Figma 的 HUG/FILL/FIXED 是很好的**交互层抽象**，面板可以用它表达，再翻译成上表的 CSS。

### 3.4 DOM → 源码映射

| 方法 | 原理 | 状态/限制 | 来源 |
|---|---|---|---|
| React `_debugSource` / `__source` | Babel `transform-react-jsx-source` 把文件/行/列编进 JSX，React 存到 fiber | **React 19 已移除**："Remove __self and __source location from elements … Along with all the places using it like the `_debugSource` on Fiber"（合并于 2024-02-07）。官方改为惰性提取组件调用点，代价是行号精度变差。社区仍在请求 opt-in 恢复，issue open | [#28265](https://github.com/react/react/pull/28265)，[#31981](https://github.com/react/react/issues/31981)，[babel plugin](https://babeljs.io/docs/babel-plugin-transform-react-jsx-source) |
| owner stack + source map | 用 dev 版 React 的 owner stack（`captureOwnerStack` 为 dev-only API），抓 bundle 和 source map 还原位置 | React Grab 经 `bippy` 实现。代价是要额外网络请求（React Grab 专门做了请求队列和超时）；#31981 指出同一行多个同名元素无法区分 | [react.dev captureOwnerStack](https://react.dev/reference/react/captureOwnerStack)，[`core/context.ts`](https://github.com/aidenybai/react-grab/blob/main/packages/react-grab/src/core/context.ts) |
| **编译期注入 `data-*` 属性**（推荐） | Vite/Webpack/Babel/SWC 插件在 dev 构建时给每个宿主 JSX 元素加 `data-xxx="file:line:col"` | code-inspector-plugin（`data-insp-path`，多框架）；LocatorJS babel 插件（`data-locatorjs`）；Lovable 自定义 Vite 插件。精确到列。缺点：只能标记**宿主元素**（div/span），组件实例需要像 code-inspector 那样把调用点经 props 传下去，组件不透传 props 时会断链 | [code-inspector `transform-jsx.ts`](https://github.com/zh-lx/code-inspector/blob/main/packages/core/src/server/transform/transform-jsx.ts)，[Vite plugin API](https://vite.dev/guide/api-plugin) |
| 把 ID **写进源码** | Onlook 给 JSX 加持久 `data-oid` 并写盘 | 映射最稳，支持 branch 冲突处理；代价是**污染用户源码**，需要用户接受 | [`ids.ts`](https://github.com/onlook-dev/onlook/blob/main/packages/parser/src/ids.ts)，[`code-fs.ts`](https://github.com/onlook-dev/onlook/blob/main/packages/file-system/src/code-fs.ts) |
| Vue | 编译 render 输出 + source map；回退 `data-v-inspector` | Vue 3 + Vite | [vite-plugin-vue-inspector README](https://github.com/webfansplz/vite-plugin-vue-inspector) |
| Svelte | dev 模式元素上带 `__svelte_meta.loc` | — | [`Inspector.svelte`](https://github.com/sveltejs/vite-plugin-svelte/blob/main/packages/vite-plugin-svelte/src/plugins/inspector/runtime/Inspector.svelte) |
| 选择器/文本 grep | 只给 agent CSS 选择器和类名，由 agent 自己 grep | Agentation 默认方式（"so AI agents can `grep` for the exact code"）；准确率取决于 agent | [README · How it works](https://github.com/benjitaylor/agentation#how-it-works) |

**建议**：首选编译期注入（dev-only 插件，不写源码），以 owner stack 作兜底（类似 React Grab），以选择器作最终兜底。ChangeSet 里**同时携带三者**，交给 agent 交叉验证。

### 3.5 写回代码

**AST 工具**：Babel（Onlook、Lovable 都用）、[recast](https://github.com/benjamn/recast)（保留原格式的打印）、[ts-morph](https://github.com/dsherret/ts-morph)、[jscodeshift](https://github.com/facebook/jscodeshift)。Onlook 在 AST 写回后还跑 Prettier 格式化（[`packages/parser/src/prettier`](https://github.com/onlook-dev/onlook/tree/main/packages/parser/src/prettier)）。用 Prettier 重排会产生和本次编辑无关的 diff 噪音，recast 风格的最小化打印更合适（**推断**）。

**样式落点的难度梯度（推断，按经验排序）**：

1. **Tailwind 静态 `className="..."` 字面量**：最容易。Onlook 的 `addClassToNode` 对字符串字面量用 `twMerge` 合并；遇到 `className={cn(...)}` 这种调用表达式，就**往参数里追加一个字符串**（[`code-edit/style.ts`](https://github.com/onlook-dev/onlook/blob/main/packages/parser/src/code-edit/style.ts)，[tailwind-merge](https://github.com/dcastil/tailwind-merge)）。注意 Tailwind 把源码当纯文本扫描，动态拼接的类名不会生成 CSS（[Tailwind docs](https://tailwindcss.com/docs/detecting-classes-in-source-files)）：写回的必须是完整类名；任意值（如 `w-[137px]`）在写盘、HMR 重新扫描之前没有 CSS，所以**实时预览必须先用注入样式表**（Onlook 文档原话："changes are injected into the page through a CSS stylesheet or DOM manipulation"，[architecture.mdx](https://github.com/onlook-dev/onlook/blob/main/docs/content/docs/developers/architecture.mdx)）。
2. **静态 `style={{...}}` 对象字面量**：容易，但会把设计意图固化成内联样式，违背多数代码库的规范。
3. **CSS Modules / 全局 CSS 文件**：要从元素反查命中的规则（多个规则、特异性、媒体查询），再决定改哪条规则还是新增规则。规则通常被多个元素共享，改一处会波及别处。中等偏难。
4. **CSS-in-JS（styled-components/emotion）、设计 token、`cva` 变体**：值来自变量、主题或 props 组合，确定性改写基本不可行，应交给 agent。
5. **动态值**（`className={isActive ? 'a' : 'b'}`、props 驱动）：Motion Studio 的处理值得照搬："Values set as expressions in code are read-only"（[Motion Studio docs](https://motion.dev/docs/studio)）。

**一对多问题**：列表渲染（`items.map(...)`）、条件渲染、可复用组件，都让一个 JSX 节点对应多个 DOM 节点，或一个 DOM 节点对应"组件定义处 + 使用处"两个可能的修改位置。Onlook 的做法是给元素打 `DynamicType`（`array`/`conditional`/`unknown`），对这类元素**禁止删除**，并区分 `instanceId`（使用处）和 `oid`（定义处）（[`models/element/layers.ts`](https://github.com/onlook-dev/onlook/blob/main/packages/models/src/element/layers.ts)，[`editor/element/index.ts`](https://github.com/onlook-dev/onlook/blob/main/apps/web/client/src/components/store/editor/element/index.ts)）。你的面板需要像 Figma 的 "main component vs instance" 那样，让用户明确选择"改这一个实例（用 props/className 覆盖）"还是"改组件本身（影响所有实例）"（**推断**）。

### 3.6 另一条路：不写代码，输出"变更单"给 agent

| 工具 | 输出形态 | 传输 |
|---|---|---|
| DialKit | JSON 值 + 一句应用指令 | 剪贴板 |
| React Grab | `[<a class="…">…</a> in LoginForm (at components/login-form.tsx:46:19)]` 形式的上下文 | 剪贴板；`npx react-grab pull` 的 skill 循环 |
| Agentation | Markdown（支持 compact/standard/detailed/forensic 四档）；有 "Annotation Format Schema"（官网导航标 AFS 1.1，**具体规范未读，未验证**） | 剪贴板；MCP server（HTTP `localhost:4747`）；官网列有 webhooks/API 页面 |
| v0 / Figma Make / Bolt / Cursor | 平台内部的"待定编辑批次" | 平台内 agent |
| Motion Studio | 简单编辑直写，否则发给已连接 agent，再否则复制 prompt | 自有 server / agent / 剪贴板 |
| Chrome DevTools | "Copy to coding agent"（摘要 prompt 或原始对话） | 剪贴板 |

来源：DialKit [`copy-instruction.ts`](https://github.com/joshpuckett/dialkit/blob/main/src/copy-instruction.ts)；React Grab [README](https://github.com/aidenybai/react-grab#how-it-works)；Agentation [README](https://github.com/benjitaylor/agentation#connect-to-your-agent)、[agentation.com](https://agentation.com)、[`output.ts`](https://github.com/benjitaylor/agentation/blob/main/package/src/components/design-mode/output.ts)；Motion [docs](https://motion.dev/docs/studio)；Chrome [DevTools 149](https://developer.chrome.com/blog/new-in-devtools-149)。

### 3.7 Agent 集成面

- **Claude Code skill**：一个文件夹加 `SKILL.md`（YAML frontmatter：`name`、`description`），可以附带 `scripts/` 和参考文件；正文只在被调用时加载（"a skill's body loads only when it's used"）；可放在项目 `.claude/skills/`、个人 `~/.claude/skills/` 或 plugin 中（[Claude Code docs · Skills](https://code.claude.com/docs/en/skills)）。
- **AGENTS.md**："A simple, open format for guiding coding agents"（[agents.md](https://agents.md/)）。
- **llms.txt**：Jeremy Howard 提出的约定，在网站根目录放 `/llms.txt` 帮 agent 使用网站（[llmstxt.org](https://llmstxt.org/)）。
- **MCP**：[规范](https://modelcontextprotocol.io/specification)。Agentation 的 MCP 是最贴近的先例：本地 HTTP server 同时服务浏览器工具条和 agent，提供 `get_pending / acknowledge / resolve / reply / watch_annotations` 等工具。它的 setup skill 特别强调要验证 **"浏览器反馈真的到达 agent"**，不能只看到工具条显示、MCP 健康就算完成（[`skills/agentation/SKILL.md`](https://github.com/benjitaylor/agentation/blob/main/skills/agentation/SKILL.md)）。
- **dev-server 插件**：Vite 插件 `transform` 钩子用来注入源码位置，`configureServer` 用来挂本地 API（[Vite plugin API](https://vite.dev/guide/api-plugin)）。Motion Studio 对 Next.js 用 `withMotionStudio` + 独立 `npx motion-studio serve`，对 Vite 用插件（[Motion Studio docs](https://motion.dev/docs/studio)），可以照搬这种分层。

---

## 4. 难点清单与他人解法

| 难点 | 难度 | 他人怎么做 | 建议 |
|---|---|---|---|
| 选中、悬停、多选、图层树 | 易 | React Grab primitives、Agentation、Bolt（方向键在父子间切换） | 自写 + 参考 React Grab primitives（MIT） |
| 属性面板（读计算样式、实时预览） | 易-中 | v0、Figma Make、Onlook 用注入样式表预览 | 预览一律走注入 stylesheet（按 `data-loc` 选择器），不碰源码 |
| 同父重排 | 中 | Onlook stub + 插入索引 + AST 重排 JSX 子节点 | 照做；遇到列表/条件节点就降级为"交给 agent" |
| 跨父 re-parent / 编组 group / 解组 | 中-难 | Onlook `group.ts`/`insert.ts`；Cursor 交给 agent | 确定性只支持同文件；跨组件/跨文件交给 agent |
| 自由像素拖拽 → 语义布局 | **难（实际未解决）** | Agentation 输出"像素 + 翻译公式"让 agent 推断；Framer/Figma 在自有画布里用 absolute | 默认 flow-aware；"自由拖"作为草图模式，输出意图 |
| 尺寸 Hug/Fill/Fixed | 中 | Figma API 语义 | 作为面板抽象，翻译成 §3.3 的 CSS |
| DOM→源码（React 19） | 中 | 编译期属性 / owner stack + source map | 编译期属性为主，owner stack 兜底 |
| 写回 Tailwind/inline | 中 | Onlook、Lovable（AST + twMerge + 客户端 Tailwind） | 第二阶段做 |
| 写回 CSS 文件/CSS-in-JS/token | 难 | 基本都交给 agent（v0/Figma/Cursor） | 交给 agent，ChangeSet 附"计算值 + 可能的 token 候选" |
| 列表/条件/组件实例（一对多） | 难 | Onlook 标 `DynamicType` 并限制操作；Motion Studio 把表达式值设为只读 | UI 上明示"实例 vs 定义"，动态值只读 |
| 写回后 HMR 状态丢失/选中丢失 | 中 | Onlook 用持久 oid 重新定位；Lovable 用稳定 ID | 用 `file:line:col` 加 DOM 路径重新定位；写回后重新匹配 |
| 并发/过期编辑 | 中 | Motion Studio "rejects stale edits" | ChangeSet 带源文件 hash，agent/写入器先校验 |
| 响应式断点 | 难 | Locofy 按断点设规则；v0/Figma 未细述 | MVP 只编辑当前视口，ChangeSet 附视口宽度 |

---

## 5. 推荐架构、MVP 与路线图

### 5.1 架构（推荐）

```
┌──────────── 用户的 dev 应用（Vite / Next dev）────────────┐
│  [build] dev 插件：给宿主 JSX 注入 data-gx-loc="file:l:c" │
│          （参考 code-inspector；调用点经 props 透传）       │
│  [runtime] <EditorRoot/>（shadow DOM，必要时进 top layer） │
│     ├─ Selection：elementsFromPoint + 图层树 + 冻结        │
│     ├─ Handles：自绘代理框；flow-aware 拖拽/缩放/插入线     │
│     ├─ Inspector：Figma 式面板 ↔ 计算样式（Hug/Fill/Fixed）│
│     ├─ Preview：注入 stylesheet，[data-gx-loc=..] 覆盖      │
│     └─ ChangeLog：Action 列表（可撤销、可序列化）           │
└─────────────┬─────────────────────────────────────────────┘
              │ ChangeSet JSON（HTTP/WebSocket）
┌─────────────▼──────────── 本地 companion server ──────────┐
│  - MCP server：get_pending_changes / mark_applied / reply  │
│  - 可选 Deterministic Writer（安全子集，带文件 hash 校验）│
│  - 剪贴板兜底：Markdown prompt（DialKit/Agentation 式）     │
└─────────────┬─────────────────────────────────────────────┘
              │
        Coding agent（Claude Code / Cursor / Codex …）
        由 SKILL.md "apply-changes" 指导如何按项目规范落地
```

**ChangeSet 草案（作者设计）**：

```jsonc
{
  "version": 1,
  "viewport": { "width": 1440, "height": 900 },
  "changes": [{
    "id": "c1",
    "target": {
      "loc": "src/components/Card.tsx:42:7",       // 编译期属性
      "ownerStack": ["Card (src/components/Card.tsx:40)", "Grid (src/app/page.tsx:18)"],
      "selector": "main > section:nth-child(2) > div.card",
      "instance": { "kind": "list-item", "index": 2, "of": 6 },  // 一对多提示
      "fileHash": "sha1:…"                          // 过期检测
    },
    "op": "setStyle",                               // setStyle | reorder | reparent | wrap | unwrap | setText
    "before": { "gap": "16px", "padding": "24px" },
    "after":  { "gap": "12px", "padding": "20px" },
    "intent": { "sizing": { "horizontal": "FILL" } },  // Figma 语义，供 agent 理解
    "context": { "parentDisplay": "flex", "flexDirection": "column", "styling": "tailwind" }
  }]
}
```

### 5.2 "Guide for the Agent" 交付物

1. **`SKILL.md`（install）**：检测框架、包管理器；安装包；加 dev 插件；挂载 `<EditorRoot/>`（参照 DialKit 的 "sibling of `{children}`" 措辞）；配置 MCP（`claude mcp add …`）；**端到端验证**：在页面上做一次测试编辑，确认 agent 能通过 MCP 读到（照搬 Agentation setup skill 的验证要求）。
2. **`SKILL.md`（apply-changes）**：教 agent 读 ChangeSet；优先用项目已有的 token、Tailwind 主题、CSS Modules；一对多时先问用户"改实例还是改定义"；落地后调用 `mark_applied` 回报。
3. 同一份内容放进 README 的 "Tell your agent" 段（DialKit 式），以及 `AGENTS.md` 片段 / `llms.txt`，照顾非 Claude agent。

### 5.3 MVP（建议范围）

- **框架**：React 18/19 + Vite、Next.js（App Router，dev）；样式 Tailwind 或纯 CSS。
- **功能**：悬停/选中/Shift 多选；图层树（仅宿主元素，标出组件边界和动态节点）；属性面板（Layout：flex 方向/gap/padding/对齐/wrap；Size：W/H + Hug/Fill/Fixed + min/max；Fill；Stroke；Radius；Effects：box-shadow/blur；Typography；Opacity）；**同父容器重排**（flow-aware 插入线）；撤销/重做；ChangeSet 经 MCP 和剪贴板导出。
- **不做**：确定性写盘、跨父重组、自由 absolute 拖拽、断点、Vue/Svelte。
- **成功标准**：在 3 个真实开源项目上（例如 shadcn 模板、一个 CSS Modules 项目、一个 Next 项目），agent 依据 ChangeSet 一次就正确落地的比例。这个指标同时检验 ChangeSet 的设计质量。

### 5.4 路线图

| 阶段 | 内容 |
|---|---|
| v0.1 MVP | 见上 |
| v0.2 | 确定性写入器（安全子集：静态 `className` 字面量 / `cn()` 追加、静态 `style` 对象、同文件静态兄弟重排），带文件 hash 校验；失败自动降级为交给 agent |
| v0.3 | 跨父 re-parent、Wrap in Auto-layout（选中多个兄弟 → 包一层 flex 容器，Figma 的 Shift+A）、解组；"实例 vs 定义"切换 |
| v0.4 | token 感知：读取 Tailwind 主题 / CSS 变量，面板优先显示 token，并把它写进 ChangeSet；"提升为 DialKit 式参数"按钮 |
| v0.5 | 草图模式：自由拖拽/缩放（Agentation 式），输出意图描述，由 agent 翻译为布局 |
| v1 | Vue / Svelte（`data-v-inspector`、`__svelte_meta`）；断点编辑；多页面；与 Figma 的双向（code-to-canvas 抓取 → Figma 改 → diff） |

### 5.5 关键风险

1. **竞品密度高**：Cursor、v0、Figma Make、Builder Fusion、Onlook 都在做"可视化编辑 → agent 落地"。差异化应该放在：**agent 无关、本地、注入到任意现有应用、DialKit 式一行安装、开放的 ChangeSet 格式**（**推断**）。
2. **React 内部 API 漂移**：`_debugSource` 已删；owner stack 是 dev-only API；fiber 字段随版本变化。编译期注入受这类漂移的影响最小。
3. **Next.js RSC**：服务端组件渲染出的 DOM 没有客户端 fiber。React Grab 为此专门做了服务端帧符号化（[`core/context.ts`](https://github.com/aidenybai/react-grab/blob/main/packages/react-grab/src/core/context.ts)），而编译期属性对 RSC 同样有效（属性会进 HTML）（**推断**）。
4. **语义翻译质量**：自由拖拽和 CSS 文件/CSS-in-JS 改动的质量取决于 agent。v0 社区有用户反馈 Design Mode 应用时会改动无关元素（[Vercel Community](https://community.vercel.com/t/why-v0-design-mode-applies-unsolicited-changes-to-surrounding-elements-during-targeted-edits/36673)，用户反馈，非官方），说明"精确 diff + 最小改动"约束必须写进 apply skill。
5. **许可证**：Agentation（PolyForm Shield）不能 fork 来做竞品；Stagewise 是 AGPL；Onlook（Apache-2.0）、React Grab（MIT）、code-inspector（MIT）、DialKit（MIT）可以参考或引用。
6. **依赖维护**：Moveable/Selecto 2024 年后不活跃；Leva 标注重度开发中；Theatre.js 开发转入私有仓库。核心交互建议自研。

---

## 6. 开放问题

1. 目标用户是"设计师在开发者的 dev 环境里调 UI"，还是"开发者自己快速微调"？这决定了默认要不要写盘，以及面板密度。
2. 是否接受向源码写入持久 ID（Onlook 式）？接受的话，映射和 HMR 后重新定位都简单得多，代价是 diff 噪音。
3. "自由拖拽"的真实需求，是"重新排版草图"（适合 Agentation 式意图输出），还是"像素级精修"（适合面板数值和 flow-aware 拖拽）？
4. 只服务 Claude Code，还是 agent 无关？（后者应以 MCP + 剪贴板 Markdown 为主，skill 为辅。）
5. Agentation 的 Annotation Format Schema（AFS 1.1）是否值得兼容，以复用它的生态？（规范内容**未验证**。）
6. 未在一手资料中验证的点：Tempo Labs 机制；Builder Fusion 可视化编辑是确定性还是 AI；Stagewise 旧 toolbar 实现；Theatre.js 状态导出细节；GrapesJS 与 LocatorJS 的确切许可证。

---

## 7. 来源列表

**DialKit**
- https://github.com/joshpuckett/dialkit （README、`package.json`、`src/copy-instruction.ts`、`docs/reference.md`、`docs/timeline.md`、LICENSE）
- https://joshpuckett.me/dialkit
- https://claudskills.com/skills/dialkit/SKILL.md （第三方，非官方）

**选取 / 定位 / 反馈工具**
- https://github.com/onlook-dev/onlook （README、`docs/content/docs/developers/architecture.mdx`、`packages/parser/src/ids.ts`、`packages/parser/src/code-edit/{style,move,group}.ts`、`packages/file-system/src/code-fs.ts`、`apps/web/preload/script/api/elements/move/{drag,stub,helpers}.ts`、`packages/models/src/element/layers.ts`、`apps/web/client/src/components/store/editor/{element/index.ts,code/tailwind.ts}`）
- https://github.com/benjitaylor/agentation （README、`skills/agentation/SKILL.md`、`skills/agentation-self-driving/SKILL.md`、`mcp/src`、`package/src/components/design-mode/{output,rearrange,types}.ts(x)`、`package/src/components/page-toolbar-css/index.tsx`）
- https://agentation.com
- https://github.com/aidenybai/react-grab （README、`skills/react-grab/SKILL.md`、`packages/react-grab/src/core/context.ts`、`src/utils/mount-root.ts`）
- https://github.com/aidenybai/bippy
- https://github.com/zh-lx/code-inspector （README、`packages/core/src/shared/constant.ts`、`packages/core/src/server/transform/transform-jsx.ts`）
- https://github.com/infi-pc/locatorjs （README、`packages/runtime/src/adapters/react/findDebugSource.ts`、`packages/babel-jsx`）
- https://github.com/ericclemmons/click-to-component （`getSourceForInstance.js`）
- https://github.com/webfansplz/vite-plugin-vue-inspector
- https://github.com/sveltejs/vite-plugin-svelte/blob/main/docs/inspector.md 、`Inspector.svelte`
- https://github.com/zthxxx/react-dev-inspector
- https://github.com/stagewise-io/stagewise （README、`apps/deprecated-cli/package.json`）
- https://github.com/GoogleChromeLabs/ProjectVisBug
- https://motion.dev/docs/studio
- https://polypane.app/

**React 源码信息**
- https://github.com/react/react/pull/28265
- https://github.com/react/react/issues/31981
- https://react.dev/reference/react/captureOwnerStack
- https://babeljs.io/docs/babel-plugin-transform-react-jsx-source
- https://github.com/ArnaudBarre/vite-plugin-react-click-to-component

**平台内可视化编辑**
- https://v0.app/docs/design-mode
- https://community.vercel.com/t/why-v0-design-mode-applies-unsolicited-changes-to-surrounding-elements-during-targeted-edits/36673
- https://lovable.dev/blog/visual-edits
- https://support.bolt.new/building/visual-edits
- https://cursor.com/blog/browser-visual-editor
- https://cursor.com/changelog/design-mode-improvements
- https://www.figma.com/blog/properties-panel-and-annotations-now-in-figma-make/
- https://www.figma.com/blog/figma-make-now-on-your-local-code/
- https://www.builder.io/blog/introducing-fusion
- https://www.builder.io/c/docs/get-started-fusion
- https://www.builder.io/c/docs/fusion-toolbar
- https://developer.chrome.com/docs/devtools/workspaces
- https://developer.chrome.com/blog/new-in-devtools-149
- https://github.com/ChromeDevTools/chrome-devtools-mcp

**设计→代码 / 页面构建器 / 面板库**
- https://github.com/plasmicapp/plasmic ，https://docs.plasmic.app/learn/codegen-guide/
- https://developers.webflow.com/devlink/docs/quick-start/quick-start-component-export ，https://developers.webflow.com/devlink/docs/component-export/whats-exported ，https://webflow.com/integrations/react
- https://docs.subframe.com/learn/concepts
- https://www.framer.com/academy/lessons/framer-fundamentals-stacks-and-relative-positioning ，https://www.framer.com/academy/lessons/layer-positioning-modes-in-framer ，https://www.framer.com/marketplace/tutorials/beginner-mistakes/
- https://www.locofy.ai/docs/plugin/classic/design-structure/responsiveness/auto-layout/
- https://developers.figma.com/docs/figma-mcp-server/code-to-canvas/
- https://forum.figma.com/suggest-a-feature-11/figma-mcp-generate-figma-design-should-resolve-html-elements-to-existing-library-components-instead-of-raw-frames-51286
- https://github.com/puckeditor/puck ，https://github.com/prevwong/craft.js ，https://github.com/GrapesJS/grapesjs ，https://github.com/tldraw/make-real
- https://github.com/pmndrs/leva ，https://github.com/cocopon/tweakpane ，https://github.com/theatre-js/theatre

**拖拽库**
- https://github.com/daybrush/moveable ，https://github.com/daybrush/selecto ，https://github.com/taye/interact.js ，https://github.com/clauderic/dnd-kit ，https://github.com/atlassian/pragmatic-drag-and-drop

**Figma 布局模型**
- https://developers.figma.com/docs/plugins/api/FrameNode/
- https://developers.figma.com/docs/plugins/api/properties/nodes-layoutsizinghorizontal/
- https://developers.figma.com/docs/plugins/api/properties/nodes-layoutpositioning/
- https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout

**Web 平台 / 工具链**
- https://developer.mozilla.org/en-US/docs/Web/API/Document/elementsFromPoint
- https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
- https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver
- https://developer.mozilla.org/en-US/docs/Web/API/Element/attachShadow
- https://developer.mozilla.org/en-US/docs/Glossary/Top_layer
- https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Basic_concepts_of_flexbox
- https://developer.mozilla.org/en-US/docs/Web/CSS/{gap,justify-content,align-items,flex-grow,box-shadow}
- https://tailwindcss.com/docs/detecting-classes-in-source-files
- https://github.com/dcastil/tailwind-merge
- https://github.com/benjamn/recast ，https://github.com/dsherret/ts-morph ，https://github.com/facebook/jscodeshift
- https://vite.dev/guide/api-plugin

**Agent 集成**
- https://code.claude.com/docs/en/skills
- https://agents.md/
- https://llmstxt.org/
- https://modelcontextprotocol.io/specification
