# 09: Next.js 支持

**What to build:** Next.js App Router 项目也能使用全部已有功能：`withVernier()` 包装配置，同时支持 Turbopack 与 Webpack；`init` 能识别 Next.js 并在根布局挂载组件。服务端组件中的元素可编辑，但使用处无法确定时在改动说明中标注。本 ticket 回答规格中的两个先验证问题：Turbopack 下的源码标记、React 19 开发模式信息能否补全服务端组件的使用链。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] 新增 Next.js App Router + CSS Modules 示例项目，01–07 的端到端测试在其上通过
- [ ] Turbopack 与 Webpack 两种模式下源码标记都正确；如 Turbopack 不可行，记录结论与退路
- [ ] 服务端组件中的元素能显示元素位置；使用处无法确定时，改动说明标注使用处未确定并附页面地址与周边结构
- [ ] 关于 React 19 开发模式信息能否补全使用链的结论记录在 Comments 中
- [ ] `init` 在 Next.js 项目上一次装好，`doctor` 通过

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
