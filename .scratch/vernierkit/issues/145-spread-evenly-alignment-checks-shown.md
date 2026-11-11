# 145: Stack 设成「spread evenly」，`done` 说对齐没显示

**What to build:** 官网线落地设计师的一轮改动时发现（2026-11-11）。

- 官网 `website/app/page.tsx` 里 Feature 文字的 Stack 是纵向的，原来是 `md:justify-end`。
- 设计师在 Design 面板里把对齐设成「bottom left, spread evenly」。
- 页面的样式和参考样式完全一样：`justify-content: space-between`、`align-items: stretch`。
- 但 `done` 报 not shown：「The alignment is top left, spread evenly, not bottom left, spread evenly」。

原因（规划会话读代码核对过）：

- `property-table.ts` 的 `writeAlign` 在 `distribute` 时只写 `justify-content: space-between`。主轴上的那个点（这里是 bottom）在 CSS 里没有对应，写不出来。
- `readAlign` 从页面读回来，`space-between` 不在 `ALIGNMENTS` 里，主轴就读成 `start`。
- 页面核对按 JSON 逐字比较 `{ x, y, distribute }`，比了一个 CSS 表达不出来的部分，所以误报。和 ticket 142 是同一类问题（0 字间距）。

要做到：

- 两边都是 `distribute` 时，页面核对不比主轴上的点。横向 Stack 不比 `x`，纵向的不比 `y`；交叉轴照旧比。改后是 spread evenly、页面也是 `space-*` 且交叉轴一致的，`done` 判为显示了。
- 一边是 spread evenly、一边不是的，照旧判为不一样。
- 以改动最小为准，比如照 ticket 142 的做法，在 `check.ts` 的 `AS_WRITTEN` 里加一项。改动说明、`claim` 的写法这次不动，已有场景的 `claim-out` 逐字不变。
- 代定，写进 Comments：spread evenly 时，改动说明还写不写主轴上的点（比如「bottom left, spread evenly」）。这个点写不进 CSS，可能让 Agent 去找一个不存在的写法。要改的话，另开票。

用词以 GLOSSARY.md 为准。

**Blocked by:** None。发布前修（误报 not shown 是 `done` 的正确性问题，同 142）。

**Status:** ready-for-agent

- [ ] 单元或浏览器测试：纵向 Stack，改后 `{ x: start, y: end, distribute: true }`，页面 `justify-content: space-between`，判为显示了。横向 Stack 同理。交叉轴不一样，或者页面不是 `space-*` 的，判为 not shown。改前第一条失败。
- [ ] 加一个 bench 场景，或在已有的对齐场景上加一步：设成 spread evenly，主轴点不是 start；`--scripted` 落地后 `done` 判为显示了。已有场景的 `claim-out` 逐字不变。
- [ ] `pnpm typecheck`、`pnpm test`、整套 e2e 过；`--dry` 全过，`--scripted` 全过。
