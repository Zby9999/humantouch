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

**Status:** done

- [x] 单元测试（`fontsOf`）：一个 family 只有 `src: local("Arial")` 的 face，不列。一个 family 有 `url()` 的 face，照旧列出。同一个 family 一个 face 是 `local()`、一个是 `url()` 的，照旧列出。
- [x] e2e 或浏览器测试：在 140 的字体示例里加一个 next/font 式的后备 family（`local("Arial")` 加 `size-adjust`），字体菜单里没有它。
- [x] 140 的测试全过；`pnpm typecheck`、`pnpm test`、整套 e2e 过；`--dry` 全过（`claim-out` 逐字不变），`--scripted` 全过。

## Comments

### 2026-11-11 实现（分支 worktree-agent-a10dd666fd8166e28，基于 main 72ea28d）

改了什么：

- `fontsOf`（`typography.ts`）：新函数 `localOnly` 读页面样式表里的 `@font-face` 规则（`CSSFontFaceRule`，按 `rule.type` 认，因为规则在画布的 realm 里）。它跟着 `@import`、`@media` 这类嵌套规则往里读，也读 `adoptedStyleSheets`。一个 family 的规则 `src` 都没有 `url()`，就算只用本机字体充数。
- 这样的 family 不按声明的字重列，当作系统字体：只有页面文字的字体栈里第一个可用的是它时才列，字重是文字用到的字重。
- 读不到的 face 照 140 列出：跨域样式表的规则读不到，`document.fonts.add` 加的 face 没有规则。做法是数 `document.fonts` 里这个 family 的 face，比读到的 `local()` 规则多，就照旧列。
- 有 `url()` 的 family 照旧列。同一个 family 一个 `local()`、一个 `url()` 的，也照旧列。
- 只改了字体菜单的列法。`isWebFont`、`firstThere`、`stackOf`、改动说明、`claim`、`done` 都没动。
- 示例 `fonts.css`：加一个 next/font 式的后备 family `__Space_Grotesk_Fallback_149`（`src: local("Arial")` 加 `size-adjust` 和 metric override）。标题的字体栈照 next/font 写成 `"Space Grotesk", "__Space_Grotesk_Fallback_149", sans-serif`。
- `spec.md` 第 61 条：补「只用 `local()` 充数的后备 family 除外，ticket 149」。

测试：

- 单元（`edits.browser.test.ts`）新测试：next/font 式后备、两个 face 都是 `local()` 的 Handmade、`@media` 里的 Nested 都不列。Mixed（`local()` 加 `url()`）列出 400、700。Icons（`url()`）列出。脚本加的 Scripted 列出。文字栈里第一个可用的是后备（前一个没声明）时，列出它，400。Stand-in 被文字用到，只列文字的 600。改前失败。
- ticket 13 的 `FONT_PAGE`：Brand、Unused 原来用 `src: local(...)` 当 web font 的替身，按本 ticket 就不该列了。给它们在 `local()` 后面加了 `url()`，测试原意不变，期望不改。
- e2e（`declared-fonts.spec.ts`）：140 的测试里加一句，字体菜单是 Georgia、Space Grotesk，没有后备 family。

数字（都在共用锁下跑）：

- `pnpm typecheck` 过。`pnpm test`：vitest 1241 过、1 跳过（51 个文件），node 129 过。
- 整套 e2e（`HT_E2E_PORT=6600`）：613 过、1 跳过，第一次就全过，没有重跑。跑完示例没留下改动。
- `--dry` 31/31。`--claim-out` 和 72ea28d（`git archive` 导出的目录）`diff -r` 逐字相同。main 那边第一次 `data-and-text` 失败（「2 changes saved, not 3」，已知的负载噪声），单独重跑过了，再 diff 相同。
- `--scripted` 22/22。
- perf（`HT_PERF_HEADLESS=1`，`HT_PERF_PORT=6640`）：20/20。

代定：

1. 只用本机字体充数的 family，文字正在用它时当作系统字体列：只列文字用到的字重，不列声明的全部字重。
2. 「全是 `local()`」按 family 算，不按 face 算：一个 family 只要有一个 `url()` face，它的 `local()` face 的字重也照旧列（测试里的 Mixed 400）。
3. 没有 `url()` 的无效规则（比如 `src` 写坏了）也算只用本机字体，不列。
4. ticket 13 的单元测试页改成 `local()` 加 `url()`，不改期望。

风险：

1. 跨域样式表里的 face 读不到，靠数 face 判断。跨域样式表和同源样式表各声明一个同名、都是 `local()` 的 family 时，它照旧会列。少见。跨域这条没有单元测试，测试页造不出跨域样式表。
2. `fontsOf` 每次面板渲染都走一遍所有样式表规则。Tailwind 开发样式表规则多，perf 20/20 没看出变慢，更大的项目没量过。
3. `@media` 里当前不生效的 `@font-face` 规则也算进 `local()` 规则数。只会让判断偏向「不列」，而这种 family 本来就是 `local()`。
4. 官网线（Next 16）拿掉 493045bf 的绕法后可以再看一眼：next/font 实际生成的后备 family 应该不再出现在菜单里。这条线没碰官网。

**规划会话，2026-11-12（设计师离开电脑，把决定交给规划会话，并批准合并）**

- 规划会话审了代码（`localOnly` 读 `@font-face` 规则，跟进 `@import`、`@media` 和 `adoptedStyleSheets`，读不到的照 140 列），无问题。合入 main 后，整套验证和这一批（136、官网、114）一起在 main 上跑。
- 代定 1–4 都确认：
  1. 文字正在用的充数 family 当系统字体列，只列用到的字重。
  2. 「全是 `local()`」按 family 算。
  3. 没有 `url()` 的无效规则也算充数。
  4. ticket 13 的测试页补 `url()`，期望值不改。
- 风险 1–3 接受。
- 风险 4：请官网线拿掉 493045bf 以后，在官网上确认 next/font 的后备 family 不再出现在字体菜单里。
