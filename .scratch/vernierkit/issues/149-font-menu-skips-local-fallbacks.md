# 149: 字体菜单不列只用本机字体充数的后备 family

**What to build:** 140 的评审发现（2026-11-11），设计师定了发布前修。

- 140 让字体菜单列出项目用 `@font-face` 声明的所有 family，包括没加载的。
- 副作用：next/font 为每个字体自动生成一个后备 family，名字像 `__Rajdhani_Fallback_1a2b3c`，`src` 只有 `local("Arial")`，用来在字体加载前对齐尺寸。它现在每次都会出现在字体菜单里，算一个 Regular。140 之前，它只在字体换进来的那一刻偶尔是 loaded。
- 官网用的是 Next 16，拿掉 493045bf 的绕法后最先看到。

要做到：

- 一个 family 的所有 face 的 `src` 都只有 `local(...)`、没有 `url(...)` 时，字体菜单不列它。比如 next/font 的 `__X_Fallback_*`，或者手写的 `size-adjust` 后备。
- `src` 从页面样式表的 `@font-face` 规则里读（`CSSFontFaceRule`），`FontFace` 对象读不到 `src`。读不到规则的（跨域样式表），照 140 的做法列出。
- 页面文字正在用的字体照旧列出，比如文字的字体栈里第一个可用的就是它。
- 图标字体这类有 `url()` 的照旧列出，这张不管。
- 只改字体菜单的列法。改动说明、`claim`、`done` 不动。

用词以 GLOSSARY.md 为准。

**Blocked by:** 140（合进 main 后）。发布前做（设计师 2026-11-11 定）。

**Status:** ready-for-agent

- [ ] 单元测试（`fontsOf`）：一个 family 只有 `src: local("Arial")` 的 face，不列。一个 family 有 `url()` 的 face，照旧列出。同一个 family 一个 face 是 `local()`、一个是 `url()` 的，照旧列出。
- [ ] e2e 或浏览器测试：在 140 的字体示例里加一个 next/font 式的后备 family（`local("Arial")` 加 `size-adjust`），字体菜单里没有它。
- [ ] 140 的测试全过；`pnpm typecheck`、`pnpm test`、整套 e2e 过；`--dry` 全过（`claim-out` 逐字不变），`--scripted` 全过。
