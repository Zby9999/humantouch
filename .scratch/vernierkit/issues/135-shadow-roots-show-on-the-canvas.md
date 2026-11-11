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

**Status:** ready-for-agent

- [ ] e2e 用一个专门的测试页面，不改 bench 场景用的示例内容，免得改动说明变了。页面里有一个 open shadow root，带 `<style>` 和 `adoptedStyleSheets` 两种样式。进入编辑态后：
  - shadow root 里的文字和样式在画布上和页面上一样；
  - Tablet、Phone 视图里按各自宽度显示；
  - 存下这一轮、重新载入后照样显示。
- [ ] 没有 shadow root 的页面，冻结结果和改前逐字节相同（单元测试或对比测试）。
- [ ] 进入编辑态的 perf 不变差（headless，中位数 ≤150ms）。
- [ ] `--dry` 29/29，`claim-out` 和改前逐字相同；`--scripted` 20/20；整套 e2e 过；切换按钮的包逐字节不变，变了就说明为什么。
