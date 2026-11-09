# 110: ⇧A 合成 Grid

**What to build:** 现在选中几个自由定位的图层按 ⇧A，会合成一个 Stack，自动推断方向、间距、内边距和对齐（spec 50）。要做到：选中的图层排成了几行几列（至少两行两列、行和列大致对齐）时，⇧A 合成一个 Grid，推断列数、行列间距和内边距，画面不跳；排不成行列、或拿不准时照旧合成 Stack。解散 Grid（⌥⇧A）和解散 Stack 一样：子图层变成自由定位、停在原位，Grid 变成 Frame。

参考本功能的 spec.md（同目录上一级，「合成与解散 Stack」），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0006、0013）。

**Blocked by:** 109（Grid 的面板、改动说明和核对要先有）

**Status:** done

- [x] 排成至少两行两列的自由图层按 ⇧A 合成 Grid：列数、行列间距、内边距推断出来，子图层的位置、尺寸和合成前一样（1px 以内）；行列不齐到多少还算 Grid 作为代定
- [x] 排成一行、一列，或排不成行列的，照旧合成 Stack，结果和现在逐字一样
- [x] ⌥⇧A 解散 Grid：子图层变成自由定位、停在原位，Grid 变成 Frame；⌘⇧G 解除分组照 Stack 的规则
- [x] 一次合成或解散是一条改动，⌘Z 一步撤回；改动说明照合成 Stack 的写法写成新建一个 Grid 容器；`done` 核对容器在、`display` 是 Grid、列数和间距对
- [x] 脚本扮演 Agent（`apply`）走一遍「⇧A 合成 Grid、落地、`done`」，核对是 ✓
- [x] 原来的改动说明逐字不变：`--dry` 24/24、`--scripted` 全过；切换按钮的包逐字节不变
- [x] 性能 headless 前后对比（`TK_PERF_HEADLESS=1`）：进入编辑模式、⇧A 不变差
- [x] e2e 全过，`stack.spec.ts` 原有的测试不改；spec 的「合成与解散 Stack」补上 Grid

## 背景

- 同 109：设计师 2026-11-09 要新建 Grid；分诊时定为沿用 ⇧A 的推断，不另加新建 Grid 的工具。

## 设计师决定（2026-11-09，分诊）

- 见 109 的「设计师决定」：109、110 一条线，发布前做，调前端第 1 轮合进 main 后开线，可和 106–108 并行；设指挥（2026-11-09 改），每张一个实现子 agent、一个审查子 agent，都用 effort medium。

## Comments

**做了什么（起点 0e966d1；提交 6c034c7 实现、测试、spec、GLOSSARY，之后合了 main 的 eb84bad，一条写这里）**

- 推断（`client/stacks.ts` 的 `inferGrid`）：选中的图层都是自由定位时先试 Grid。按上边分行、按左边分列（`IN_GRID` = 1px 以内算同一行、同一列）；至少两行两列；除最后一行外每行排满，最后一行从左排起；列宽取最宽的图层，所有图层一样宽、同一行一样高（各 1px 以内）；行间距、列间距各取中位数（不能是负的）；再逐个验算每个图层在 Grid 里的位置和尺寸离现在 1px 以内。任何一条不成立就返回 null，照旧走 `inferStack`，结果和原来逐字一样。子图层按行排序。
- 合成（`structure-edits.ts` 的 `stack`）：同一条 `stack` 改动、同一套 `compose` / `decompose`，⌘Z 一步。`Composed` 现在是 `(StackSettings | GridSettings) & {place, layers}`，Grid 的设置是 `{ grid: {type: "grid", columns, rowGap, columnGap}, padding }`（`isGridSettings`、`makesGrid`、`dissolvesGrid` 在 `changeset.ts`）。样式 `gridStyle`：`display: grid`、`grid-template-columns: repeat(N, minmax(0, 1fr))`（109 的 `equalColumns`）、`row-gap`、`column-gap`；Frame 变 Grid 时加内边距（四边到格子的实际距离，正好撑满 Frame 现在的大小）；新建的 Grid 和新建 Stack 一样自由定位在图层原来的左上角、没有内边距、不写宽度。`STACK_CSS` 加了三个 Grid 属性，撤销时一起清掉。
- 解散（`unstack`）：`canUnstack`、`canUngroup` 认 `grid`。`before` 是 `GridSettings`（读 `arrangement`、`padding`），`display: grid` → `block`（`inline-grid` → `inline-block`），来源读 `display` 和 `grid-template-columns`。页面原有的 Grid 也能解散、解除分组。
- 改动列表：「Make Grid · 4 layers, 2 columns, row gap 16px, column gap 24px」；「Dissolve Grid · Grid → Frame」。Stack 的照旧。
- 改动说明（`change-notes.ts`）：Layer 行「a new Grid, in …」；设计意图「Wrap these 4 layers, in this order, in a new Grid: a Grid of 2 equal columns, with a row gap of 16px and a column gap of 24px, no padding. Place it absolute in …」（Frame 是「Make this Frame a Grid: …」）；另一行「**Grid:** lay its layers out as `display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 16px; column-gap: 24px` does (Tailwind's `grid grid-cols-2 gap-x-6 gap-y-4`). It fills its cells row by row, in the order its layers are written: no `grid-row`, `grid-column` or `order`.」；Join the layout / Drop the margins 里 Stack 换成 Grid。解散：「Dissolve this Grid (a Grid of 3 equal columns, …): make it a Frame, …」。
- 写法规则（`writing-rules.ts`）：「Making a Stack」只给 Stack，新「Making a Grid」；「Dissolving a Stack」只给 Stack，新「Dissolving a Grid」。How the page checks 新一句「a new Grid by the element its layers are in on the page: …」；没能核对的名目里原来的「a Stack made or dissolved」只算 Stack，新加「a new Grid whose layers the page cannot all find」「a Grid dissolved」。没有 Grid 的一轮逐字不变。
- 核对（`checkable.ts` 的 `gridOfFound`，`check.ts` 的 `lookGrid`）：容器（Frame 变的就是 Frame 本身）和每个图层都按源码标记找得到、不是循环里单独的数据改动时核对。看留在 Grid 里的图层（之后同一轮移出、删掉的不算）都在同一个元素里（跳过 `display: contents`）：新建的要是容器里的一个新元素，Frame 变的就是那个 Frame；它 `display: grid`、列数相同、两个间距 0.5px 以内。之后同一轮又改了这个 Grid 的列数、间距的，那几项不比；之后被解散或改成 Stack 的答没能核对。照所有断点的改动在页面宽度和每个视图宽度看。没显示时 `done` 说「The layers are not all in one new element in their container, as the notes have the new Grid: wrap them in it, …」或「The new Grid's element lays its layers out as …, not …」。
- 源码标记跟踪：Agent 在几个 `<div>` 外面包一个 `<div>`、独占一行时，标记按种类配对会有两种同样长的配法，`elementsOf` 判断不了，找不到图层。`lookGrid` 先照常找，找不到再用「照说明写好的画布」找（`writtenAround`：保存的画布上新 Grid 的元素标成写在第一个图层那一行之前、同一个文件），配对就只有一种。只用在合成 Grid 的核对上。
- 面板多选时的「Make Stack」按钮走同一个 `stack`，排成行列时也合成 Grid（按钮字不变）。

**脚本扮演 Agent**（`applying-bench.spec.ts` 末尾「free layers in two rows of two made a Grid (ticket 110)」）：上一轮在 App.tsx 卡片下面写了一个 Frame，四个 100 × 40 的自由定位方块，两行两列；设计师选中四个按 ⇧A；Agent 在外面包 `<div className="absolute left-[20px] top-[30px] grid grid-cols-2 gap-x-6 gap-y-4">`（独占一行，后面的行都下移），去掉方块的 `absolute left-… top-…`。写之前核对是 not shown（不误报 ✓）；`done 1`「Checked on the page: it shows the change.」；`finish` 打勾 [1]。

- e2e UI（`grid.spec.ts` 1 个）：注入四个自由方块，⇧A → Grid 选中、位置尺寸 1px 内不动、面板 Columns 2 / Row gap 16 / Column gap 24、改动列表 Make Grid；⌥⇧A → Frame、仍不动、Dissolve Grid；⌘Z 两步回到原样、没有改动。`stack.spec.ts` 没改。
- 单测：`stacks.browser.test.ts` 4 个（推断、最后一行不满、Frame 内边距、1px 容差、一行 / 一列 / 太少 / 空格 / 大小不齐 / 间距不齐 / 重叠都不是 Grid）；`edits.browser.test.ts` 4 个（合成不动、一条改动、⌘Z 原样；Frame 变 Grid、一行照旧 Stack；解散页面原有的 Grid、能解除分组；页面核对：没包、包对、列数错、写成 flex、独占一行的 `<div>`、之后改列数）；`cli.test.ts` 4 个（说明、规则、How the page checks、解散、`done` 的两种说法）。

**验证**（代码在 6c034c7；之后合进来的 eb84bad 只改了 109、118 两个票文件）：`pnpm typecheck` 过；`pnpm test` vitest 1093 过 1 跳过、node 125 过；`TK_E2E_PORT=5500 pnpm test:e2e` 552 过 1 跳过（一次跑完，无重跑）；`--dry` 24/24；`--scripted` 15/15；`--dry --claim-out` 在 0e966d1（scratchpad 里的 detached worktree）和分支上各 24 份，`diff -r` 逐字相同。合了 eb84bad 之后（acc205c）重跑一遍：typecheck 过；`pnpm test` 1093 过 1 跳过、node 125 过；e2e 页面组 408 过、layers.spec.ts:316（已知 flake）挂 1 个，单独重跑过，「project files」组用 `--no-deps` 补跑 143 过 1 跳过；`--dry` 24/24，认领说明和 0e966d1 逐字相同；`--scripted` 15/15。

**性能**（`TK_PERF_HEADLESS=1 TK_PERF_PORT=5510 pnpm test:perf`，headless 只作前后比较）。第一轮（改前 0e966d1 下午、改后 6c034c7 傍晚）机器负载差得多（另一条线在跑，load 5–6），改后整体都慢了，连拖控制点的帧率都掉到 52.9，所以晚上又在同一时段背靠背跑了一对（先 0e966d1 的 detached worktree，再分支），以这一对为准：

| | 改前 0e966d1 | 改后（分支） |
|---|---|---|
| 进入编辑模式 全部 中位数 / p95 | 145.6 / 177.4ms | 131.1 / 189.8ms |
| 第一次进入 / 再进入 中位数 | 160.5 / 118.2ms | 148.1 / 116.7ms |
| 改数值 圆角 work 中位数 / p95 | 9.3 / 11.6ms | 10.5 / 14.1ms |
| 改数值 Stack 间距 work 中位数 / p95 | 10.5 / 12.1ms | 11.8 / 17.5ms |
| 拖动卡片 / 拖控制点 fps | 60 / 60 | 60 / 59.6 |

- 两次都在噪声里（同一时段里中位数一高一低，p95 各有高低）；进入编辑模式的路径没加东西（推断只在 ⇧A 时跑，核对只在已认领后跑）。性能测量里没有 ⇧A 这一项（见风险 6）。下午那一轮：改前 进入全部中位数 119.9ms，改后 144.2ms（负载下），不作数。

**包**：切换按钮 `react.dev.js` 1423 B（sha256 前 16 位 `bd6c2389b64451f0`）、`chunk-2GJY7MXB.js` 21372 B，和 0e966d1 逐字节相同（`cmp`）。编辑层 `editor.dev.js` 496973 → 501564 B（+4591 B），gzip -9 175661 → 177222 B（+1561 B）；review 后 502660 B、gzip 177604 B（比 0e966d1 +5687 / +1943 B），切换按钮仍逐字节相同。

**Review 后的修正（2026-11-09）**：核对 `lookGrid` 补了几种会误报 ✓ 或误报没显示的情况（代定 11–13）。
- 图层还留着 `absolute left-… top-…`（没照 Join the layout），判没显示，`done` 说「The layers are still placed absolute, so the new Grid does not lay them out: take their absolute positioning off (Join the layout), …」。
- 格子不对：顺序和画布不同（B、C 对调）、多包了一个别的图层，判没显示，`done` 说「The new Grid's element does not hold these layers alone, in the order listed: …」；包的元素不直接在容器的排版里（更深一层）也判没显示。
- 之后同一轮移动或删掉整个 Grid，答没能核对；之后把其中几个合成 Stack，不再误报没显示。
- How the page checks：容器是这一轮新建的、或在循环里单独改的，不再同时列「a new Grid whose layers the page cannot all find」；`uncheckable` 对数据改动先给循环的原因。
- 解散列宽不一样的页面 Grid，说明不写 equal。
- 重跑：typecheck；`pnpm test` vitest 1095 过 1 跳过、node 125 过；`stack.spec.ts` + `grid.spec.ts` 14 过；110 的剧本（`--project="project files" --no-deps`）过；`--dry` 24/24，认领说明和 0e966d1 逐字相同；`--scripted` 15/15。e2e 用的端口是 5580：重跑时 5500、5510 被另一个会话的 eval（`…/scratchpad/eval/runs/T1-base-1/repo`）起的 vite 占着，没动它。没重跑完整 e2e 和性能（指挥合并后跑）。

### 代定的事（待设计师确认）

1. 只有选中的都是自由定位的图层才试 Grid（票里说的「自由定位的图层」）；排在流里的图层（换行 Stack、页面 Grid 里的）排成行列时照旧合成 Stack。
2. 「行列不齐到多少还算 Grid」：1px，和「画面不跳 1px 以内」同一个标准。位置、宽、同一行的高都要在 1px 以内；更不齐的照旧合成 Stack，不把它们吸齐成 Grid（画布拖动有吸附，拖齐的一般是整齐的）。
3. 图层要一样宽、同一行一样高：等宽列里宽度不同的会被撑开（Grid 默认 stretch），不另写 `justify-items` 保持各自宽度。
4. 有空格（中间缺一个、最后一行不从左排起）不算 Grid：Grid 按顺序填格子，写不出空格。
5. 新建的 Grid 不写宽度（同新建 Stack），自由定位时按内容收缩，列宽就是图层宽；Frame 变 Grid 时内边距取四边到格子的实际距离（不像自由图层合成 Stack 那样两边取近的、剩下交给对齐）。
6. 改动列表标题「Make Grid」「Dissolve Grid」，种类仍是 `stack` / `unstack`（改动单格式不变）；多选时面板的「Make Stack」按钮字不改，排成行列时也合成 Grid；Grid 一节不加「Dissolve Grid」按钮，只有 ⌥⇧A（样子交给调前端）。
7. 页面原有的 Grid 现在也能 ⌥⇧A 解散、⌘⇧G 解除分组（原来只有 Stack）。解散 Grid 和解散 Stack 一样不核对。
8. 核对：间距允许 0.5px（推断的间距从画布位置量出来，可能是 15.99），列数要相同；在所有视图宽度看；之后同一轮改了列数、间距的不比那几项，之后被解散或改成 Stack 的不核对，之后移出、删掉的图层不要求在 Grid 里。不核对 Grid 自己的位置（X、Y），票里只要求容器在、`display`、列数和间距。
9. 找不到时用「照说明写好的画布」再找一次（见「源码标记跟踪」），只为合成 Grid 加，别的核对不变。Agent 写在别处或用组件包时仍可能找不到，答没能核对，不会误报。
10. `apply` 走一遍用 `applying-bench.spec.ts` 的剧本，没加进标准场景（118 做）。
11. 核对时要求 Grid 的元素「正好是这些图层」（review 后，2026-11-09）：它直接在容器的排版里（跳过 `display: contents`），格子里只有这些图层（之后同一轮移进、新建、复制、拖回、合成进来的另算几格），顺序和改动单一样（之后同一轮有移动或合成把图层放进它、可能重排时不比顺序），图层不能还是自由定位。没有用「保存的画布里有没有这个元素」判断是不是新元素：图层放进一个已有的 Grid 时，那个 Grid 原来的格子会多出来，照样判没显示。
12. 之后同一轮移动或删掉整个 Grid 的，答没能核对（不按移动后的容器去找）；之后把其中几个图层合成 Stack（或 Grid）的，那几个不要求直接在 Grid 里，新合成的那个算一格（review 后）。
13. 页面原有的 Grid 列宽不一样（`200px 1fr`）时解散，说明写「a Grid of 2 columns」，不写 equal（`GridSettings.unequal`，review 后）。

### 遗留风险

1. 新建的 Grid 按内容收缩：容器比 Grid 还窄（图层本来就超出容器）时列会被压窄，画面会动（新建 Stack 同样）。
2. 自由定位时靠 `translate` 居中、或从右边、下边摆的图层，进 Grid 后 translate 还在，会跳（合成 Stack 原来就这样）。
3. Frame 是 `content-box` 时加内边距会让 Frame 变大（合成 Stack 同样）。
4. `writtenAround` 假设 Agent 把新元素写在第一个图层之前、同一个文件；写法不同时答没能核对。
5. 循环渲染的实例合成 Grid 时，每个成员找到的是同一批元素：格子数要不少于图层数，顺序只能按第一次出现的比，核对偏宽松。
7. 图层放进一个已有的、原本是空的 Grid 元素时，格子、顺序、列数都对得上，会判显示了（没比保存的画布）。
6. 性能测量里没有 ⇧A 这一项；⇧A 只多了一次 O(n log n) 的推断，只在全是自由定位时做，没有测。
