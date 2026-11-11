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

- [x] 单元或浏览器测试：一个模拟开发浮层的字体（按选定的判断方式），不列；同名但不是浮层的、页面文字用到的，照旧列。改前第一条失败。
- [x] e2e：Next 示例（`examples/next-app-css-modules`）在 `next dev` 下，字体菜单里没有 `__nextjs-` 开头的 family。
- [x] 140、149 的测试全过；`pnpm typecheck`、`pnpm test`、整套 e2e 过；`--dry` 全过，`claim-out` 逐字不变；`--scripted` 全过。

## Comments

### 2026-11-12 实现（分支 worktree-agent-adca16d408104be0e，基于 main 96554d6）

先查了浮层的字体在哪（`examples/next-app-css-modules`，Next 16.4.3，`next dev`）：

- 浮层的脚本用 `useInsertionEffect` 往 `document.head` 插一个 `<style>`，里面四条 `@font-face`：`__nextjs-Geist`、`__nextjs-Geist Mono`，各两个 unicode-range 子集，`font-weight: 400 600`。
- 不在 `nextjs-portal` 的 shadow root 里。`<style>` 上没有任何属性，看不出是浮层的。
- `src` 都是 `url(/__nextjs_font/geist-….woff2)`。`/__nextjs_font/` 是 `next dev` 自己的路由，线上没有。
- 画布里是同一个 `<style>`，地址照写。Tablet、Phone 视图复制时把地址补全成 `http://localhost:…/__nextjs_font/…`。

选的判断方式：看 `src` 的地址。一个 face 的 `url()` 全在 `/__nextjs_font/` 下，就算浮层的。为什么：

- 看样式表归属不行：没有标记，也不在 shadow root 里。画布和视图复制以后，样式表从哪来更看不出。
- `__nextjs-` 前缀只是名字。项目自己的字体也可以叫这个名，ticket 也要「同名但不是浮层的照旧列」。
- 地址就是它「只在开发服务器上有」的原因。按路径比，相对地址和补全的 `localhost` 地址都认得。

改了什么：

- `fontsOf`（`typography.ts`）：149 的 `localOnly` 改名 `notTheProjects`。一条 `@font-face` 规则的 `src` 里没有项目的 `url()`，这条规则就算「不是项目的」：只有 `local()`（149），或者 `url()` 全在 `/__nextjs_font/` 下（154）。
- 新函数 `projectsUrl`：每个 `url()` 按样式表的地址解析（没有就用 `doc.baseURI`），再比路径。解析不了的（比如 base 是 `about:blank`），按写的原样比。
- 这样的 family 照 149 当作系统字体：只有页面文字的字体栈里第一个可用的是它时才列，字重是文字用到的字重。
- 只改了字体菜单的列法。`look.ts` 复制字体、改动说明、`claim`、`done` 都没动。
- `spec.md` 第 61 条：补「Next 开发浮层自己的字体除外，ticket 154」。

测试：

- 单元（`edits.browser.test.ts`）新测试：模拟浮层的两个 `__nextjs-Geist` face（相对地址）不列。项目自己的 `__nextjs-Brand`（`url("/fonts/…")`）照旧列出。`__nextjs-Geist Mono`（补全的 `localhost` 地址，后面跟 `local("Courier New")`，这样测试里才加载得上）被文字当第一个用，列出 500。改前失败（菜单里多了 `__nextjs-Geist` 400、500、600 等）。
- e2e（`next.spec.ts`）：Next 示例在 `next dev` 下进编辑模式。画布的 `document.fonts` 里有 `__nextjs-Geist`、`__nextjs-Geist Mono`；选标题，字体菜单里有 Georgia，没有 `__nextjs-` 开头的 family。用改前的 `typography.ts` 构建跑过一次，失败（菜单里有这两个 family）；改后过。
- 140、149 的单元测试和 `declared-fonts.spec` 都过。

数字（重活都在共用锁下跑）：

- `pnpm typecheck` 过。`pnpm test`：vitest 1262 过、1 跳过（52 个文件），node 测试过。
- 整套 e2e（`HT_E2E_PORT=7300`）：614 过、1 跳过、3 失败。3 条都在 project files 组，和字体无关：
  - `round.spec:443`、`round.spec:465`（拖手柄改大小、自由放置）：单独 `--workers=1` 重跑都过。
  - `applying-bench.spec:1527`（提升到 Card 的填色，`scope` 是 usage，不是 component）：单独重跑第一次又失败，再 `--repeat-each=3` 3/3 过。在 main 96554d6 的导出目录里单独跑也过。算负载和冷启动。
  - 跑完示例没留下改动。
- `--dry` 32/32，main 96554d6（`git archive` 导出的目录）也是 32/32。`--claim-out` 用 `diff -r` 比，逐字相同。
- `--scripted`：22/23。`r18-style-variables` 五条都是「the page's check says nothing」，单独重跑过。算负载。
- perf（`HT_PERF_HEADLESS=1`，`HT_PERF_PORT=7340`）：20/20。

代定：

1. 按 `src` 地址（`/__nextjs_font/`）判断，不按 `__nextjs-` 前缀，也不按样式表归属。理由见上。
2. 浮层的 family 和 149 的充数 family 一样处理：页面文字第一个用的是它时照旧列，只列用到的字重。
3. 一个 face 的 `src` 里只要有一个 `url()` 不在 `/__nextjs_font/` 下，这个 face 就算项目的，照旧列。
4. 按 family 算，同 149：同一个 family 里只要有一个项目的 face，浮层那些 face 的字重也照旧列。

风险：

1. 认的是 Next 16 的路径 `/__nextjs_font/`。Next 以后改了路径，这两个字体会回到菜单里（只会多列，不会少列）。只看了 Next 16.4.3，没看更早的版本。
2. 画布里 `<style>` 的地址是相对的，按画布文档的 `baseURI` 解析。现在和页面同源，路径对得上。
3. 别的框架的开发浮层要是也带字体（比如 Vite 的错误浮层），这张不管。
4. 整套 e2e 那 3 条失败只靠单独重跑判断为负载；`applying-bench.spec:1527` 单独重跑也失败过一次。
