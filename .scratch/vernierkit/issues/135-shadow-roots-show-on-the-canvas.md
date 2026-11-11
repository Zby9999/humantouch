# 135: 页面里 shadow root 中的内容，在画布、各视图和存下的轮次里都看得见

**What to build:** 设计师用 Human Touch 改官网（2026-11-11），hero 完全没进画布，画布上只剩一个空盒子。官网的 hero 是在一个 open shadow root 里渲染的：`attachShadow({ mode: "open" })`，再用 React 的 `createPortal` 把内容放进去，样式是 shadow root 里的一个 `<style>`。

Human Touch 现在完全不认 shadow DOM，有三处会把它丢掉：

- 冻结页面时用 `documentElement.cloneNode(true)`，不复制 shadow root；
- 各视图和存下的轮次用 `outerHTML` 存成文字，也没有 shadow root；
- 写回画布时用 `doc.write`，用不到 declarative shadow DOM。

用 Web Components 组件库的项目（比如 Lit 写的组件，样式常在 `adoptedStyleSheets` 里）都会碰到这个问题。

设计师决定（2026-11-11）：

- 发布前做到 shadow root 里的层也能改（135–138 这条线）。
- 官网的 hero 不改写法，留着当真实的例子。

这张票是第一步：只做「看得见」。

- 冻结时，把 open shadow root 的内容连同它的样式一起复制到画布上，`<style>` 和 `adoptedStyleSheets` 都要带上。
- 各视图（Desktop / Tablet / Phone）里也看得见。
- 存下的轮次重新打开时也看得见：存成文字时 shadow root 要能写出去、读回来，比如写成 `<template shadowrootmode="open">`，再按需要还原成 shadow root。
- 样式里依赖宽度的部分（媒体查询、视口单位）照页面上其他样式的做法处理，在每个视图里按那个视图的宽度生效。
- closed shadow root 读不到，宿主照现在的样子显示。在 Comments 里写明。
- 这一步不要求能选中 shadow root 里的层；点它的时候选中宿主，和现在一样。

参考 `freezer.ts`（`freeze`、`serializeCanvas`、写回画布的地方）和 `viewport.ts`；用词以 GLOSSARY.md 为准。真实的例子在官网线的 worktree `.claude/worktrees/laughing-turing-48a664`，看 `website/components/editor/HeroEditor.tsx`。

**Blocked by:** None.

**Status:** done

- [x] e2e 用一个专门的测试页面，不改 bench 场景用的示例内容，免得改动说明变了。页面里有一个 open shadow root，带 `<style>` 和 `adoptedStyleSheets` 两种样式。进入编辑态后：
  - shadow root 里的文字和样式在画布上和页面上一样；
  - Tablet、Phone 视图里按各自宽度显示；
  - 存下这一轮、重新载入后照样显示。
- [x] 没有 shadow root 的页面，冻结结果和改前逐字节相同（单元测试或对比测试）。
- [ ] 进入编辑态的 perf 不变差（headless，中位数 ≤150ms）。（见 Comments：机器负载高，改前改后都没到 150ms，A/B 看不出差别；要在安静的机器上再跑一次。）
- [x] `--dry` 29/29，`claim-out` 和改前逐字相同；`--scripted` 20/20；整套 e2e 过；切换按钮的包逐字节不变，变了就说明为什么。

## Comments

**实现记录（2026-11-11）**

做了什么：

- 新模块 `packages/humantouch/src/client/shadow-roots.ts`：
  - `ON_CANVAS`：画布上的 shadow root 用 `{ mode: "open", clonable: true, serializable: true }` 挂。clonable 让它跟着宿主走：复制到各视图（`importNode`）、复制图层、存轮次时的 `cloneNode` 都带上。serializable 让存轮次时能写出去。
  - `elementsWithin`：列出元素时把 open shadow root 里的元素也列进去。没有 shadow root 时，和原来 `[root, ...getElementsByTagName("*")]` 列的完全一样。
  - `htmlOf`：带 shadow root 时用 `getHTML({ serializableShadowRoots: true })` 写成 `<template shadowrootmode="open" shadowrootserializable shadowrootclonable>`；没有时原样用 `outerHTML`。
  - `attachDeclared`：浏览器的 `document.write` 没把 `<template shadowrootmode>` 变成 shadow root 时，手动还原。Chromium 自己会还原，这是给别的浏览器留的后路。
  - `NOT_THE_PAGES`：`nextjs-portal`（Next 的 dev overlay）、`next-route-announcer`、`vite-error-overlay` 不算页面的东西，不复制，和以前一样是空的。
- `freezer.ts`：
  - `freeze`：每个元素复制完，如果页面上它有 open shadow root，就在副本上挂一个，把里面的节点复制过去，再对里面的元素做同样的处理：`<style>`（CSSOM 插入的规则、`media`）、`<link>` 内联、视口单位、固定定位钉住、滚动、动画终态、usage chain。shadow root 的 `adoptedStyleSheets` 写成 shadow root 末尾的 `<style>`，和文档的做法一样，排在层叠的最后。嵌套的 shadow root 也一样处理。
  - 依赖宽度的样式（媒体查询、视口单位）：冻结后改写文档样式表时，把 shadow root 里的样式表也一起改写。之后每个视图按自己 iframe 的宽度生效，和页面上其他样式一样（ADR 0008）。
  - 存轮次（`serializeCanvas`）和视图（`copyCanvas`）都改用 `elementsWithin`，所以 shadow root 里的 `<style>`、`<canvas>`、表单值也照样处理。重新打开轮次（`restore`）后调用 `attachDeclared`。
  - 页面动画：`document.getAnimations()` 不包含 shadow root 里的动画，现在把 open shadow root 里的也读进来。脚本动画（比如官网 hero 里的 `animate(..., { fill: "forwards" })`）写终态，CSS 动画在副本里直接放到结尾。编辑层自己的 `<human-touch>` 和 `NOT_THE_PAGES` 不算在内。
  - 副本改成在画布自己的文档里做（`doc.importNode`），原来是在页面文档里 `cloneNode`。在页面文档里复制时，页面的自定义元素会被升级，constructor 和 connectedCallback 会在副本上跑一遍：自己再挂 shadow root、渲染两遍、抛错。现在副本上不跑页面的代码。连带的一点：画布里没有自定义元素的定义，`:defined` 原来对它们都不匹配。所以冻结时把样式表里的 `:defined` 改写成 `:is(*)`（见代定 3）。
  - 页面上已经是 clonable 的 shadow root：`importNode` 会把它原样带过来，跳过了上面的处理。现在遇到这种情况，先把宿主换成一个没有 shadow root 的同名元素，再按上面的做法重新复制。
- `views.ts`：视图逐节点跟随画布时，shadow root 和里面的节点也配对。画布上每个 shadow root 都加进 MutationObserver。之后画布 shadow root 里的改动（136–138 要用）会同步到视图，`elementOf` 也能找到 shadow root 里的元素。画布上新出现的宿主（比如复制图层）也一样处理，里面的 `<canvas>` 也画上。
- `off-canvas.ts`：画布外图层（look）存的 HTML 也带 shadow root（`serializeEditable` 用 `htmlOf`），载入时调用 `attachDeclared`。

closed shadow root：页面的脚本读不到它（`el.shadowRoot` 是 null），所以不复制。画布上宿主照现在的样子显示，只有宿主自己的 light DOM 子元素。e2e 和单元测试都有一个 closed 的例子，内容不会出现，也不会写进存下的轮次。

点 shadow root 里的内容时，选中的仍是宿主（136 再做进去），e2e 有一条测试守着。

**测试**

- 新的 e2e 测试页面：`e2e/fixtures/shadow-roots.html`。`e2e/tests/shadow-roots.spec.ts` 在 `/shadow-roots` 这个地址把它插到示例页面 body 的最前面，示例和 bench 场景都没动。页面里是一个 open shadow root：
  - 里面的 `<style>` 有两档媒体查询（≤1000px、≤500px）；
  - `adoptedStyleSheets` 里有 `:host`，还有一条 ≤500px 的圆角规则；
  - 还有一个跑着的脚本动画。
- 3 条 e2e：
  - 画布上的文字、颜色、圆角、padding、高度和页面上一样。Tablet 768 是绿色、16px；Phone 390 是蓝色、4px。动画在三个视图里都在终态（0.4），页面上的照常在跑；
  - 点 shadow 里的文字，选中框和宿主一样大；
  - 改了宿主的填色，存下轮次，重新载入，进入编辑态：画布是存下的那张（宿主是红色），shadow root 照样显示，各视图按各自宽度显示。
  - `--repeat-each=3` 9/9。
- `packages/humantouch/test/shadow-roots.browser.test.ts`，10 个：
  - 显示和各视图：`<style>` 和 constructable sheet、媒体查询、`vh`、slot、嵌套 shadow root、closed、样式不漏到外面；
  - 存下再打开，再存一次逐字节相同；
  - 画布 shadow root 里的改动同步到视图；
  - dev overlay 不复制；
  - CSS 动画；
  - 页面上已经是 clonable 的 shadow root；
  - `:not(:defined)` 隐藏的组件在画布上显示；
  - 自定义元素的代码不在副本上跑。
- **逐字节对比**：同一个文件里有一条快照测试（`test/__snapshots__/freezer-no-shadow-root.html`）。快照在**改代码前**的 base 1abe6c28 上录下：一个没有 shadow root 的页面，带媒体查询、CSSOM 规则、文档的 adoptedStyleSheets、没定义的自定义名元素、template、canvas、表单、fixed、script。录下的内容有四份：冻结结果、视图、存下的轮次、重新打开后再存。改完后快照一字不差。
- `pnpm typecheck` 通过。
- `pnpm test`：vitest 49 个文件 1221 passed、1 skipped；`node --test` 129 pass。
- 整套 e2e（`HT_E2E_PORT=6500`）：
  - 第一版 609 passed、1 skipped，0 挂。
  - 加上 review 修改后重跑，机器负载 30 多（别的会话在跑）。page 组 446 passed、9 挂，project files 组因此没跑（155 个）。挂的 9 个单独 `--workers=1 --repeat-each=3` 重跑：6 个 3/3 过；`popover-exit` 229、297 和 `properties` 1304（数字滚动）各挂 1/3。负载降到 9 左右再跑，9/9 过。这几个都和冻结无关，popover-exit 在 main 上也会抖。
  - `next-install` 单独跑 4/4 过。
  - project files 组单独跑（`--no-deps`）149 passed，`round.spec.ts` 614、662 挂了。单独 `--repeat-each=3` 跑 6/6 过。
  - 每次跑完示例都没有残留改动。
- bench（`HT_BENCH_PORT=6520`）：`--dry` 29/29，`--claim-out` 和改前 base 1abe6c28 的输出 `diff -r` 完全相同（29 个文件）。`--scripted` 20/20。
- 切换按钮的包：`react.js`、`react.dev.js`、`chunk-Q6CQAMUL.js` 和 base 逐字节相同。只有 `editor.dev.js` 变了，542837 → 545030 字节（+2193）。

**perf（`HT_PERF_HEADLESS=1 HT_PERF_PORT=6570`，进入编辑态，"all entries" 中位数）**

机器负载一直在 8–36 之间（别的会话在跑），改前改后都没到 150ms：

| 顺序 | 版本 | 中位数 | 负载 |
|---|---|---|---|
| 1 | 本票（整套 perf） | 191.5ms | ~11 |
| 2 | base | 191.6ms | ~11 |
| 3 | 本票 | 209.1ms | ~8 |
| 4 | 本票 | 286.2ms | ~15 |
| 5 | base | 236.1ms | ~10 |

前后两组 A/B 一次本票慢、一次 base 慢，看不出差别。直接量多出的工作：5000 个元素的页面，每次遍历找 shadow root 约 0.5–0.6ms。进入编辑态时桌面视图之前多两次（读页面动画、放稳画布），约 1.2ms；平板、手机视图各多约 1ms。这一条没打勾，等在安静的机器上再跑一次。

### 代定的事（待设计师确认）

1. shadow root 的 `adoptedStyleSheets` 写成 shadow root 末尾的普通 `<style>`，没有加标记，和文档的 `adoptedStyleSheets` 现在的做法一样。137 如果要分清「组件 styles 里的规则」和「shadow root 里 `<style>` 的规则」，再加标记。
2. 副本改在画布的文档里做，页面的自定义元素在画布上不再升级、不跑代码。好处是画布真正静态，不重复渲染。代价是画布上自定义元素的代码相关的行为都没了：比如以前桌面视图里靠 connectedCallback 渲染出来的东西（视图和存下的轮次里本来就没有）。没有 shadow root、也没有定义自定义元素的页面不受影响（快照为证）。
3. `:defined` 在画布上一律改写成 `:is(*)`，所有元素都算已定义。页面上 `x-foo:not(:defined) { display: none }` 这种"代码加载前先藏起来"的组件因此能显示。不精确的地方：页面上一直没定义的自定义元素，在画布上也被当成已定义。
4. Next 的 dev overlay（`nextjs-portal`）、route announcer 和 Vite 的错误 overlay 的 shadow root 不复制。名单写死在 `NOT_THE_PAGES`，别的框架的 dev 工具（比如 Astro 的 toolbar）还会被复制进来。
5. 画布自己的样式（`transition: none`、`pointer-events: auto`）这次没加进 shadow root。现在点 shadow 里的内容会穿到宿主上，正好是这一票要的。136（命中测试）和 137（改样式立刻显示）再加，存的时候要去掉。
6. 页面上已经是 clonable 的 shadow root，换掉宿主元素重新复制。宿主上原来的属性都保留。

### 风险

- **perf 没能在安静的机器上确认**，见上。
- closed shadow root 一律只显示宿主。用 closed 的组件库（少数 Web Components）在画布上仍是空盒子。
- shadow root 的 `slotAssignment: "manual"`（JS 手动分配 slot）没有复制过来，副本按名字分配，显示可能不一样。`delegatesFocus` 也没带。
- 视图跟随画布时，shadow root 里的改动是靠 MutationObserver 监听每个 shadow root 同步的。135 本身不改 shadow root 里的东西，所以这部分只有单元测试守着，要 136–138 真正用起来才算验过。
- 存下的轮次里，shadow root 是 `<template shadowrootmode>` 文本。`revertSaved`、`check.ts` 用 DOMParser 解析时，它就是普通 template，`elementsOf` 找不到里面的层。137 要处理。
- `page-copy.ts`（`done` 核对用的页面副本）和 `look.ts` 的 `freezeLook`（把宿主挪出画布时冻结样式）还不认 shadow root。前者是 137 的事，后者是 138 的事。挪出画布时 shadow 里的内容会跟着带过去，样式也在，但 shadow 里的元素没有冻结计算样式。
- 整套 e2e 第二次跑时有一条和本票无关的 unhandled error：`Cannot read properties of null (reading 'matchMedia')`，在 react 18 示例里读样式时 defaultView 是 null，像是测试结束时 iframe 被拿掉了。第一次跑没有。没有测试因此挂。
