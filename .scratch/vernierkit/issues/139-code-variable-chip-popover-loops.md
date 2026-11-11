# 139: 点代码里写的 Variable 的名字，弹出框飞到左上角、字段一直闪

**What to build:** 设计师改官网时发现（2026-11-11，有截图），这个 bug 比较严重：

- 在 Design 面板里点一个 Variable 的名字，比如 Height 的 `7`、Gap 的 `2`，弹出框「… variables」没有出现在面板旁边，而是飞到窗口左上角；
- 字段在 Variable 名字和输入框之间来回切换，一直闪。

规划会话在 main a03b23f2 上，用 `vite-react19-tw4` 示例复现了：选中「Get started」按钮，点 Gap 的 `2`，弹出框出现在 (8, 8)，Gap 变成了输入框，页面随后卡住，脚本都跑不了。

原因（读代码得出）：

- 代码里写的 Variable（ticket 119，`inCode`），在设计师往字段里输入时不显示名字：`useTypedIn` 把 `offered.bound` 置为 null。
- `useTypedIn` 的 `onFocusIn` 挂在 `VariableSlot` 外层的 div 上，只要聚焦的是 `input` 就算「在输入」。
- 弹出框 `Popover` 渲染在这个 div 里面，`VariableList` 一挂上就把焦点给它的搜索框（`search.current?.focus()`）。
- 结果是一个循环：
  - 搜索框聚焦，算作在输入，名字被换成输入框，弹出框跟着卸掉；
  - 搜索框失焦，名字又出现，是一个新的元素；
  - 弹出框按旧的、已经不在页面上的名字元素定位，`getBoundingClientRect` 全是 0，于是落在左上角；
  - 搜索框又聚焦……如此反复。
- e2e 默认打开 `detachCodeVariables`，会自动断开代码里的 Variable，所以一直没有测试点过这种名字。

要做到：

- 点代码里写的 Variable 的名字，弹出框和别的 Variable 一样，出现在面板旁边、和字段对齐。名字留在原处，不闪，焦点在搜索框里。
- 只有设计师往字段本身输入时，才算「在输入」。弹出框、取色器里的输入框都不算。
- ticket 119 的行为不变：往字段里输入时，代码里的 Variable 名字照旧让位给输入框，离开字段后再显示。
- 同一个外层 div 里其他会自动聚焦输入框的弹出框也检查一遍，比如取色器、阴影、渐变。

**Blocked by:** None. 发布前修。

**Status:** ready-for-agent

- [ ] e2e，用 `detachCodeVariables: false`：
  - 选中一个用代码里的 Variable 的层（例如示例里的按钮，Gap 是 `2`），点 Gap 的名字。弹出框在 Design 面板左边、和 Gap 对齐，名字还在，焦点在搜索框；
  - 在弹出框里选另一个 Variable，Gap 换成它；
  - Esc 关闭后焦点回到名字上。
  - 修改前这条测试会失败。
- [ ] 同样的情况，再用一种颜色 Variable（Fill）和一种别的数值（Padding 或 Height）各测一次。
- [ ] ticket 119 的已有测试全过：往字段里输入时名字让位，离开后显示。
- [ ] typecheck、`pnpm test`、整套 e2e 过；`--dry` 29/29（`claim-out` 和改前逐字相同）、`--scripted` 20/20；切换按钮的包逐字节不变。
