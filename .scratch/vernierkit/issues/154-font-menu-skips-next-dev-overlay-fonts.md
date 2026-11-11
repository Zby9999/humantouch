# 154: 字体菜单不列 Next 开发浮层自己的字体

**What to build:** 官网线 2026-11-12 在 149 合入后核对时发现：

- Next 16 的项目在 `next dev` 下，字体菜单里多出 `__nextjs-Geist`、`__nextjs-Geist Mono`。
- 这两个是 Next 开发浮层（dev overlay）自己用的字体，有 `url()`，只在开发服务器上有，线上没有。
- 任何 Next 16 项目在开发时都会看到它们。设计师选了也没意义：线上不存在这个字体。

要做到：

- 字体菜单不列 Next 开发浮层自己的字体。判断方式实现时定，比如：
  - 看 `@font-face` 规则所在的样式表属于开发浮层，例如在 `nextjs-portal` 的 shadow root 里，或由浮层的脚本注入；
  - 或者 Next 保留的 `__nextjs-` 前缀。
  
  在 Comments 写清选哪种、为什么。
- 页面文字真用到的字体照旧列。
- 只改字体菜单的列法，改动说明、`claim`、`done` 不动。

参考 ticket 13、140、149；用词以 GLOSSARY.md 为准。

**Blocked by:** None。发布前做（规划会话 2026-11-12 定：每个 Next 16 用户开发时都会看到）。

**Status:** ready-for-agent

- [ ] 单元或浏览器测试：一个模拟开发浮层的字体（按选定的判断方式），不列；同名但不是浮层的、页面文字用到的，照旧列。改前第一条失败。
- [ ] e2e：Next 示例（`examples/next-app-css-modules`）在 `next dev` 下，字体菜单里没有 `__nextjs-` 开头的 family。
- [ ] 140、149 的测试全过；`pnpm typecheck`、`pnpm test`、整套 e2e 过；`--dry` 全过，`claim-out` 逐字不变；`--scripted` 全过。
