# 137: shadow root 里的层能改样式，Agent 能落地，`done` 能核对

**What to build:** 设计师在 Design 面板里改 shadow root 里的一层，比如填色、圆角、间距、文字。改动在画布和各视图里马上显示，进改动列表；交给 Agent 时，`claim` 写清楚改哪里，`done` 能在页面上核对它有没有显示。

- 画布上的样式改动现在写成文档里的 CSS 规则，进不了 shadow root。改动要写进那个 shadow root 自己的样式里，比如往 shadow root 里加一个编辑样式表。断点规则（在 Tablet、Phone 改的只在那个断点生效）照常可用。
- 撤销、重做、⌥⌘C / ⌥⌘V 复制粘贴样式、Variables 绑定，在 shadow root 里的层上照常可用。
- `claim` 怎么写：
  - 层有源码位置（`data-ht-loc`，比如官网 hero 这种 React portal 渲染的 JSX）时，照常写 Location，改动写在源码里那一处。
  - 样式写在 shadow root 的 `<style>` 或组件的 styles 里时，说明要提到这一点：改的是那个组件自己的样式，不是全局 CSS。
  - 层没有源码位置（比如 Lit 模板）时，照现在「找不到位置」的规矩写。
- `done` 的页面核对要进到页面上的 open shadow root 里，按标记找到那一层再核对。找不到就照「Not checked」的规矩处理。

参考 135、136，`canvas-style.ts`、`check.ts`、`change-notes.ts`、`writing-rules.ts`；用词以 GLOSSARY.md 为准。这里有几个难反悔的决定，比如改动写到哪里、`claim` 怎么说，值得的话写一份 ADR，编号向规划会话要。

**Blocked by:** 136

**Status:** ready-for-agent

- [ ] e2e：在 135 的测试页面上改 shadow root 里一层的填色和圆角，画布和各视图都显示；在 Phone 视图改的只在 Phone 断点生效；撤销、重做照常。
- [ ] 加一个 bench 场景，在 shadow root 里的层上改样式：
  - `--dry` 能正确列出改动；
  - `--scripted` 按 `claim` 的说明改代码以后，`done` 核对为显示了；
  - 已有 29 个场景的 `claim-out` 逐字不变。
- [ ] 没有源码位置的层，`claim` 照「找不到位置」的规矩说。有单元测试。
- [ ] 没有 shadow root 的页面，样式改动、撤销、复制粘贴、核对的已有测试全过；perf（headless）不变差。
- [ ] `--scripted` 全过；整套 e2e 过。

## 规划会话补充（2026-11-11 晚，136 的问题 A、B）

- **第三方 Web Components 的层要锁住**，和 React 第三方组件一样：
  - 定义自定义元素的模块来自 `node_modules` 或 vendored 包的，它 shadow root 里的层在使用链上标 thirdParty。
  - 照 ticket 120 的「Third-party components」规则，只能走组件从使用处接收的东西改：属性、slot、CSS 自定义属性、`::part()`。
  - 加一个测试或 bench 场景，第三方 Web Component（比如一个放在示例 `node_modules` 里的小组件）里的层带 thirdParty，规则会出现。
- **`::part()` 写的样式算来源**，Design 面板和 `claim` 都要报出来；`:host-context()` 暂不算。
