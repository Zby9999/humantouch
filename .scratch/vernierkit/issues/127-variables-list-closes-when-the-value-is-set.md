# 127: 值提交后，字段的 Variables 列表收起，不再挡住下面的控件

**What to build:** Design 面板的 Layout 一节里，设计师在 Gap 里输入一个数，输入框下面会弹出可选的 Variables 列表。设计师接着直接去点下面的方向按钮（横排、竖排），列表还开着，正好盖在按钮上，点到的是列表，不是按钮。得先按 Esc 或点别处关掉列表，才能点到。

这个问题 main 上原来就有。以前面板长、会滚动，一滚列表就关了，所以不显眼。121 去掉了 Design 面板的 Brief 一节，面板变短，就常碰到了。`layout.spec.ts:189` 和 `properties.spec.ts:1894` 两个测试，为此改成先离开 Gap 字段再点方向（121 的 Comments 第 2 条）。

要做到：
- 值一提交，列表就收起。提交包括回车、Tab，或者在别处按下鼠标让焦点离开字段。
- 输完 Gap 直接点方向按钮：一下就点中，Gap 的新值也提交了。改动列表里是两条改动，各自照常。
- 别的带 Variables 列表的字段，只要值提交后列表还挡着下面的控件，也一样处理。
- 列表什么时候弹出、里面有什么、怎么选一个 Variable，都照现在的样子，不改。

参考 ticket 117、119（Variables 的选法）、121 的 Comments 第 2 条，以及调校第 2 轮（合进 main 后的 Layout 一节）。用词以 GLOSSARY.md 为准。

**Blocked by:** 调校第 2 轮合进 main（它改了这一节）。This line goes after 126 on the Grid line.

**Status:** ready-for-agent

- [ ] e2e：在 Gap 里输入一个数，不按回车、不按 Esc，直接点方向按钮。方向改了，Gap 的新值也记下了，两条改动都在改动列表里。
- [ ] `layout.spec.ts:189` 和 `properties.spec.ts:1894` 改回直接点方向的写法，都能过。
- [ ] 列表弹出和选 Variable 的已有测试全过，行为不变。
- [ ] `--dry` 全过（29 个场景），`--dry --claim-out` 和改前逐字相同；`--scripted` 全过；切换按钮的包逐字节不变。
- [ ] 整套 e2e 过。

## 设计师决定（2026-11-10）

- 发布前修。
- 规划会话安排：
  - 接在 109 那条线后面：126 → 127。127 等调校第 2 轮合进 main 再开始。
  - 照常 conduct：一个新的实现子 agent、一个审查子 agent，都用 effort medium，端口用 5500 段。
