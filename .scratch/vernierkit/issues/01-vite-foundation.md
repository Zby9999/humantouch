# 01: Vite 打底：源码标记 + 切换按钮

**What to build:** 在一个 Vite + React 19 + Tailwind v4 示例项目中，开发时页面上出现切换按钮（点击暂时无操作或只给出占位反馈），页面中由项目源码写出的元素都带有元素位置标记，组件使用处带有使用处位置标记。正式构建时编辑层完全不存在。同时搭好单一 npm 包 `vernierkit` 的骨架、示例项目和端到端测试框架，后续 ticket 都在此基础上扩展。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] 开发模式下打开示例项目，页面上出现切换按钮，可拖到任意角落
- [x] 页面中由项目源码写出的元素带有正确的 文件:行:列 元素位置标记；组件使用处带有使用处位置标记
- [x] 第三方依赖中的代码不被打标记
- [x] 源码标记转换只插入属性、不改变行号（辅接缝 2：样例源码快照测试覆盖常见 JSX 写法）
- [x] 正式构建产物中不含任何编辑层代码，切换按钮不出现
- [x] 编辑层挂载在 Shadow DOM 中，页面样式与编辑层样式互不影响
- [x] 端到端测试框架可以启动示例项目并断言切换按钮出现（主接缝）

## Comments

**实现记录（2026-10-14）**

- 包结构：`packages/vernierkit`，子入口 `vernierkit/vite`（插件 `vernier()`）与 `vernierkit/react`（组件 `<Vernier />`）。`react` 子入口用 `development` 导出条件选开发版，其余情况是返回 null 的空组件；`vite build --mode development` 也验证过零残留。
- 标记：HTML 元素加 `data-vk-loc="文件:行:列"`，组件使用处加 `data-vk-usage="文件:行:列"`（行、列都从 1 起）。使用处标记是传给组件的 prop，不一定出现在 DOM 上，要通过 React 组件树读取（使用链读取模块会用到）。Fragment 不打标记；已有标记不重复打；路径含 `node_modules` 的模块不处理。workspace 链接进来的包（真实路径不在 node_modules）视为项目源码，会被标记。
- 编辑层：Preact，挂在 `<html>` 下的 `<vernier-kit>` 的 open Shadow DOM 中，`:host { all: initial !important }` 截断继承样式。切换按钮可拖到四角，松手吸附到最近的角并记在 localStorage。
- 工具链：TypeScript 用 6.x（tsup 9 生成 d.ts 需要 TS 的 JS API，TS 7 不提供）。e2e 用本机已装的 Google Chrome（`channel: "chrome"`），不另外下载 Playwright 浏览器。
- 命令：`pnpm test`（源码标记转换快照）、`pnpm test:e2e`（构建包后启动示例的开发服务器与正式构建预览）、`pnpm typecheck`。
- 未做（留给后续 ticket）：本机服务的 host / 口令限制（`vite --host` 时切换按钮仍会出现）。
