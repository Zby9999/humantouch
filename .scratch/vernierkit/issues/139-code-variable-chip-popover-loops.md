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

**Status:** done

- [x] e2e，用 `detachCodeVariables: false`：
  - 选中一个用代码里的 Variable 的层（例如示例里的按钮，Gap 是 `2`），点 Gap 的名字。弹出框在 Design 面板左边、和 Gap 对齐，名字还在，焦点在搜索框；
  - 在弹出框里选另一个 Variable，Gap 换成它；
  - Esc 关闭后焦点回到名字上。
  - 修改前这条测试会失败。
- [x] 同样的情况，再用一种颜色 Variable（Fill）和一种别的数值（Padding 或 Height）各测一次。
- [x] ticket 119 的已有测试全过：往字段里输入时名字让位，离开后显示。
- [x] typecheck、`pnpm test`、整套 e2e 过；`--dry` 29/29（`claim-out` 和改前逐字相同）、`--scripted` 20/20；切换按钮的包逐字节不变。

## Comments

**2026-11-11，实现（分支 worktree-agent-abda3ce8259060636）**

改了什么：

- `useTypedIn`（`VariablePicker.tsx`）：只有字段自己的输入框聚焦才算「在输入」。新的 `ownField(target, slot)`：是 `input`、在这个外层 div 里，并且不在 div 里的某个 `.ht-popover` 里。`onFocusIn` 和 `onFocusOut`（看 `relatedTarget`）都用它。所以 Variables 列表的搜索框、取色器 Custom 里的 Hex / 透明度 / OKLCH 字段（渐变、阴影的颜色也在这个取色器里）都不再算。弹出框里如果又有一个 Variable 字段（它的外层 div 在弹出框里面），它自己的输入框对它仍算「在输入」：判断的是弹出框在不在这个 div 里，不是有没有祖先弹出框。
- `Popover`：定位时（挂上、窗口改大小）如果锚点已经不在页面上（`!anchor.isConnected`），就关掉，不再落到 (8, 8)；正在淡出的不动，留在原处淡出。`leaving` 和 `onClose` 经 ref 读最新的，effect 的依赖还是 `[anchor]`。选「关掉」而不是「重新找锚点」：锚点不在了说明那个名字 / 色块已经换成了新元素，重新找要知道是哪个字段，比关掉复杂；再点一次就开。只改这一处也能断开循环（弹出框会关掉），但名字仍会让位，所以两处都改。
- 其他会自动聚焦输入框的弹出框：只有 `VariableList` 的搜索框挂上时自己聚焦；编辑层里用 `Popover` 的只有 Variables 弹出框和取色器，菜单（`Select.tsx` 的 `ht-menu`）里没有输入框。`Properties.tsx` 的 `ColorField` 也用 `useTypedIn`，同一个函数，一起修好。

测试（`e2e/tests/code-variables.spec.ts`，整个文件本来就是 `detachCodeVariables: false`），共用 `pickFromName`：点代码里写的 Variable 的名字 → 弹出框在 Design 面板左边、在名字左边、和名字同高（放不下最高 520px 时照旧往上挪，测试按同一规则算期望的 top，并要求 top > 8）；名字还在；焦点在搜索框；选另一个 Variable，名字换成它；再点开，Esc 关闭，焦点回到名字。

- tw4 示例的按钮：Gap `2` → `3`，Padding left `4` → `6`；
- tw3 示例 hero 的按钮：Fill `brand-500` → `ink`。前面加了一步：从色块打开取色器、切到 Custom、点 Hex，名字 `brand-500` 还在，没有换成输入框。
- 改前两条都失败（弹出框一直在动，`steadyBox` 超时）；改后过。

数字：

- `pnpm typecheck` 过；`pnpm test`：vitest 1212 过、1 跳过，node 129 过。
- 整套 e2e（`HT_E2E_PORT=6600`）：page 组 457 条，454 过、3 条失败（`motion.spec:318`、`motion.spec:374`、`popover-exit.spec:297`），单独 `--workers=1 --repeat-each=3` 重跑（连同 code-variables 整个文件）30/30 过，是负载下的抖动。page 组有失败，project files 组没跑，单独 `--project="project files" --no-deps`：151 过、1 跳过（要 `HT_WRITE_FIXTURE` 的那条）。
- `--dry` 29/29，`--claim-out` 和 main a03b23f2 的 `diff -r` 逐字相同；`--scripted` 20/20。
- 包：切换按钮的包（`editor.dev.js` 以外的 12 个文件）和 main 00bfb7a8 逐字节相同；`editor.dev.js` 542,837 → 543,034 字节（+197），gzip -9 192,340 → 192,408（+68）。

代定：

1. 锚点不在页面上时弹出框关掉，不重新找锚点；焦点不交还（锚点已经没了）。
2. 弹出框里的输入框一律不算「在输入」，不只是搜索框：在取色器 Custom 的 Hex 里输入时，代码里的 Variable 名字留着。
3. 「和 Gap 对齐」：窗口放不下 520px 时按现有规则往上挪（e2e 窗口里 Gap 和 Fill 都被挪了），测试按这个规则算，不要求 top 等于名字的 top。

风险：

1. 靠 `.ht-popover` 类名认弹出框；以后若有不用 `Popover`、又带输入框的弹出框放进 `VariableSlot` / `ColorField`，要么用这个类，要么在 `ownField` 里加上。
2. 锚点只在挂上和窗口改大小时检查；弹出框开着时锚点被换掉不会马上关，要等下一次定位。现在的循环在挂上时就拦住了。
3. ticket 119「往字段里输入时名字让位」只有 `variables-late.spec` 间接覆盖（夹具会解开代码里的 Variable），这次没加专门的测试。
