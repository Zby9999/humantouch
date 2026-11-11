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

**Status:** done

- [x] 单元或浏览器测试：纵向 Stack，改后 `{ x: start, y: end, distribute: true }`，页面 `justify-content: space-between`，判为显示了。横向 Stack 同理。交叉轴不一样，或者页面不是 `space-*` 的，判为 not shown。改前第一条失败。
- [x] 加一个 bench 场景，或在已有的对齐场景上加一步：设成 spread evenly，主轴点不是 start；`--scripted` 落地后 `done` 判为显示了。已有场景的 `claim-out` 逐字不变。
- [x] `pnpm typecheck`、`pnpm test`、整套 e2e 过；`--dry` 全过，`--scripted` 全过。

## Comments

**2026-11-11，实现（分支 worktree-agent-a2fb2b39624f7d7bb）**

改了什么：

- 照 142 的做法，只改核对。`check.ts` 的 `AS_WRITTEN` 加了一项 `align`：页面读出来的和改后的都是 spread evenly（`distribute`）时，只比交叉轴上的点，横向 Stack 比 `y`，纵向比 `x`，主轴的方向用 `stackOf` 从页面上读。只要有一边不是 spread evenly，照旧用 `sameValue` 逐字比较 `{ x, y, distribute }`。
- `readAlign`、`writeAlign`、改动说明、`claim` 都没动。not shown 时报的 actual 还是页面读出的值，spread evenly 时主轴仍读作 start。
- 页面上 `space-between`、`space-around`、`space-evenly` 都算 spread evenly（`readAlign` 本来就这么读，`DISTRIBUTED = /^space-/`）。
- `AS_WRITTEN` 的说明补了一句：有的项什么也不画，只换比较的方法（0 不看单位，或者不比 CSS 写不出的那部分）。这是 142 风险 1 提到的。
- 其他宽度的核对走同一个 `lookStyle`，一起修好了。

测试：

- 新浏览器测试 `test/spread-evenly-check.browser.test.ts`：画布上的 Stack 是 center center，改成纵向 `{ start, end, distribute: true }`，页面 `space-between`/`space-around`/`space-evenly` 加 `stretch`，都判为显示了；横向 `{ end, center, distribute: true }`，页面 `space-between` 加 `center`，判为显示了。交叉轴不一样的（纵向页面 `align-items: center`，横向页面 `flex-end`），判为 not shown。只有一边是 spread evenly 的（改后 spread、页面 `flex-end`；改后不 spread、页面 `space-between`），判为 not shown。不是 spread evenly 时，主轴照旧比。改前前两条失败。
- 新 bench 场景 `panel-spread-evenly`（tw4 示例）：hero（纵向 Stack，`justify-center`）在面板里点 Bottom left，Gap sizing 选 Auto，一条改动，意图是「bottom left, spread evenly」，参考样式 `justify-content: space-between`、`align-items: stretch`。scripted 把 `justify-center` 换成 `justify-between`。改前 `--scripted` 失败（"change 1: the page's check says not shown"，⚠️ 下有 1 条），改后通过。已有场景都没动。

数字：

- `pnpm typecheck` 过。`pnpm test`：vitest 1220 过、1 跳过；node 129 过。
- 整套 e2e（`HT_E2E_PORT=6600`）：608 过、1 跳过、2 失败，都是 project files 组的 `round.spec.ts:510`（ticket 80）和 `:556`（ticket 75）。单独用 `--project="project files" --no-deps --workers=1 --repeat-each=3` 重跑，6/6 过，是负载下的抖动。
- `--dry` 31/31（main 5c4fdf92 是 30/30）。`--claim-out` 和 main 5c4fdf92 做 `diff -r`，已有的 30 个场景逐字相同，只多了新场景的 `panel-spread-evenly.md`。
- `--scripted` 22/22（多了新场景，以前是 21）。

代定：

1. 改核对，不改读法：页面是 `space-*` 时，面板和 not shown 的 actual 里主轴仍显示 start。
2. `space-around`、`space-evenly` 也算 spread evenly，和 `space-between` 一样判为显示了。面板只写 `space-between`，但读法本来就把三种都当 spread evenly。
3. 票里留的代定：spread evenly 时改动说明还写主轴上的点。新场景的说明就是「Change the alignment from center left to bottom left, spread evenly.」，参考样式里没有对应的 CSS。这次没改，要改另开票。

风险：

1. 主轴方向是从页面读的。如果 Agent 同一轮把 Stack 的方向也改了，而页面的方向和改后的方向不一样，比的是页面方向的交叉轴。方向那条改动自己会判 not shown，所以不会漏报。
2. bench 的场景数变了（`--dry` 31、`--scripted` 22），以前记下的数字以这个为准。
