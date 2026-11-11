# shadow root 里的改动写进那个 shadow root 自己的样式；`claim` 说改的是组件自己的样式

ticket 137，2026-11-11。135、136 让 open shadow root 里的层看得见、选得中。这一份定的是：改它们的样式时，画布上改动写在哪里，交给 Agent 时怎么说，第三方 Web Component 怎么对待。

## 依据

- 画布上的样式改动原来是文档 `<head>` 里的编辑样式表（每组实例一个 `<style>`，在 CSS layer `human-touch-edits` 里，全部 `!important`）。文档的规则进不了 shadow root，所以 shadow root 里的层改了也不显示。
- 官网的 hero 用 React 的 `createPortal` 渲染进 open shadow root，样式是 shadow root 里的一个 `<style>`。Lit 这类组件库的样式在 `adoptedStyleSheets` 里。两种情况下，Tailwind 类、全局 CSS、CSS Modules 都进不去。Agent 照着页面其他层的习惯去改全局 CSS，改了也不显示。
- 第三方 Web Components（比如 node_modules 里的 Shoelace）shadow root 里的层，和 React 第三方组件画的层一样，项目的源码管不到。

## 决定

**一、改动写进那个 shadow root 自己的编辑样式。**

- 层在哪棵树里，它的编辑样式就在哪棵树里（`scopeOf`）：文档里的层照旧写在 `<head>`；open shadow root 里的层写在那个 shadow root 里，放在它的最后。嵌套的 shadow root 写在最里面那一层。
- 写法和文档里一样：同一个 CSS layer `human-touch-edits`，全部 `!important`；断点上的改动是 media query。每个 shadow root 各有一个声明这个 layer 的 `<style>`，放在它第一个编辑样式表前面。
- 键（`data-ht-style`）和层的 id（`data-ht-layer`）按整个文档编号，跨 shadow root 不重复。
- 编辑样式是普通的 `<style>` 节点，不用 adopted stylesheet。这样它跟着画布走：各视图逐节点跟随、存下的轮次（`<template shadowrootmode>`）、重新打开、撤销重做都不用另写一套。
- 放在 shadow root 最后，不放在页面自己的节点前面：`:first-child`、`:nth-child()` 这类结构选择器不受影响。`:last-child` 和 `:only-child` 会受影响，见 Consequences。

**二、`claim` 说清楚改的是组件自己的样式。**

- 层在 shadow root 里时，改动多一行 `**Shadow root:**`：说明层在哪个宿主的 shadow root 里，页面的 CSS 进不去，改的是那个组件给自己 shadow root 写的样式，不是全局 CSS。How to write them 里加一条 **Shadow roots**：改 **Currently set by** 指的那条规则，它在组件渲染进 shadow root 的 `<style>` 里，或者组件 adopt 的样式里；没有规则可改时在那里加一条，或者照组件已有的写法改 Location 那个元素本身。
- **Currently set by** 认得 shadow root 自己的规则（`StyleSource.shadowRoot`，宿主的标签名）。这种规则没有文件，说成「`<x-panel>` 在它 shadow root 里的样式」。
- 有源码位置（`data-ht-loc`，比如 portal 渲染的 JSX）时照常写 Location。没有（Lit 模板这类不是 JSX 写的）时照「Not located」的规矩写，页面也不核对它。
- `::part()` 算来源（规划会话 2026-11-11）：页面给组件内部层写的 `x-chip::part(label)` 在 Design 面板和 `claim` 里都报出来。层叠按 CSS Cascade：外面树的普通规则压过 shadow root 自己的，important 的反过来。`:host-context()` 暂不算（只有 Chromium 支持，少见）。

**三、第三方 Web Components 照 React 第三方组件锁住**（规划会话 2026-11-11）。

- 开发服务器在页面最前面包一层 `customElements.define`，记下每个自定义元素是从哪段调用栈定义的（`DEFINED_GLOBAL`）。栈上除了这层以外的模块全在 `node_modules` 里，就算第三方定义的。项目自己的元素即使经过库的 helper 定义（Lit 的 `@customElement`），栈上也有项目自己的模块，不算。
- 第三方元素 shadow root 里 React 不认识的层，使用链最前面是这个元素（`thirdParty: true`，使用处是宿主在项目里的位置），再接宿主自己的链。于是它们和 React 第三方组件画的层一样成为锁定图层。
- `claim` 给它们另一条规则 **Third-party Web Components**：只能通过元素从使用处接收的东西改，即属性、slot 进去的内容、它读的 CSS 自定义属性、项目自己 CSS 里的 `::part()`；不能改依赖本身，也不能用别的办法伸进它的 shadow root。React 第三方组件那条规则照旧，只对不在 shadow root 里的层说，已有场景的改动说明不变。

**四、`done` 的页面核对进到页面的 open shadow root 里。**

- 按标记找层时，层在 shadow root 里、或者这一轮的画布有 shadow root，就连页面的 open shadow root 一起找；不然照旧只找文档树，没有 shadow root 的轮次不多花工夫。
- 别的宽度的页面副本（`page-copy.ts`）把页面的 open shadow root 连同 `<style>` 和 adopted stylesheet 一起复制，跟着页面变。页面冻结时没有 shadow root 的，不多走一遍。
- 比的是画出来的样子（ADR 0016），在 shadow root 里也一样。找不到的照「Not checked」的规矩。
- 存下的轮次在没有画布时解析（`revertSaved` 等）用 `Document.parseHTMLUnsafe`，把 `<template shadowrootmode>` 还原成 shadow root，再用 `htmlOf` 写回去。

## Considered Options

- **编辑样式用 adopted stylesheet 放进 shadow root**（136 给画布样式的做法）：不在 shadow root 里加节点。但视图逐节点跟随、存轮次、撤销都靠节点，adopted stylesheet 要另外同步、另外存。否决。
- **编辑样式放在 shadow root 最前面**：CSS layer 的顺序最稳（页面 shadow root 里有 layer 时也排在最前）。但会挪动页面节点的位置，`:first-child`、`:nth-child()` 会变。否决，换成放在最后。
- **改写宿主、用 `::part()` 从外面改**：只对暴露了 part 的层有用，而且 important 时压不过 shadow root 自己的 important。否决。
- **第三方 Web Components 不锁，照「找不到位置」说**：Agent 会去改 node_modules，或者从外面硬伸进去。否决（规划会话）。

## Consequences

- shadow root 最后多了编辑样式的 `<style>`：页面在 shadow root 里用 `:last-child`、`:nth-last-child()`、`:only-child` 的，画布上可能和页面不一样。很少见，先不处理。
- 编辑样式的 CSS layer 在 shadow root 里声明得最晚：页面 shadow root 里有 CSS layer、而且里面有 `!important` 时，页面的会压过编辑样式。很少见。
- 宿主元素自己的改动写在外面的树里。shadow root 里 `:host { … !important }` 会压过它（CSS Cascade：important 时里面的赢）。很少见。
- 第三方的判断只在 Vite 的开发服务器上有（它往页面里注入那段脚本）。Next.js 上第三方 Web Components 的层照「找不到位置」说，不锁。
- 138（结构改动）要接着处理：复制、挪动的元素进出 shadow root 时，它的编辑样式要跟着换到新的树里。
