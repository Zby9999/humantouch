# 109: Stack 和 Grid 互相转换

**What to build:** 页面原有的 Grid 现在可以改列数、行列间距、在格子之间拖动换序（ticket 18），但不能把一个 Stack 改成 Grid，也不能把 Grid 改回 Stack；18 当时为了第一版小一点划了出去。设计师试用后觉得很必要。要做到：像 Figma 的自动布局那样，在 Stack 一节的方向旁边多一个 Grid，选了这个 Stack 就变成 Grid；Grid 一节里也能改回横排或竖排的 Stack。转换时推算列数，画面不跳：横排 N 个图层转成 N 列一行，竖排转成一列，横排换行的照现在每行几个算列数；间距变成行列间距，内边距不变，子图层顺序不变。改回 Stack：一列的变竖排，一行的变横排，几行几列的变横排加换行。

这是同一个元素换一种排列方式，不是结构性改动，所以照 ADR 0008：在平板、手机视图里转只在那个断点生效（例如桌面三列的 Grid、手机上竖排的 Stack），有断点标记，可以重置；在桌面视图里转作用于所有断点（除非某个断点单独改过）。对 Agent 是一条样式改动，页面核对算出的 `display` 和列数、间距。

参考本功能的 spec.md（同目录上一级，「拖拽与布局」「属性面板」「合成与解散 Stack」），用词以 GLOSSARY.md 为准（Stack、Grid），并遵守 docs/adr/ 中的决策（ADR 0006、0008、0011、0013）。

**Blocked by:** 无（开线时间见「设计师决定」：调前端第 1 轮合进 main 之后）

**Status:** done

- [x] Stack 一节的方向里有 Grid，选了就转成 Grid，面板换成 Grid 一节；Grid 一节里能改回横排、竖排的 Stack；样子照 Figma，细节可作为代定
- [x] 转换画面不跳：子图层的位置、尺寸和转之前一样（1px 以内，和 ⇧A 合成一样的标准）；做不到的情况（例如子图层宽度各不相同、转成等宽列会变）怎么取舍作为代定
- [x] 子图层的 Hug / Fill / Fixed、对齐、均匀分布、`auto` 外边距在两种排列之间怎么对应作为代定；页面原有的、按 `grid-template-areas` 或按行列号放子图层的 Grid 改回 Stack 时怎么办，也作为代定
- [x] Grid 格子上的 Hug / Fill 改动（调前端第 1 轮已能改）Agent 那边跟上：写法规则只在 Grid 里出现，核对认 `w-full`，`apply` 走一遍是 ✓（见「背景」最后一条）
- [x] 平板、手机视图里转只在那个断点生效，有断点标记、可重置；桌面视图里转作用于所有断点；旁边的视图照 ADR 0011 跟上
- [x] 一次转换是改动列表里的一条，⌘Z 一步撤回；改动说明写成这个图层排列方式的样式改动，照项目的写法（Tailwind 的 `grid grid-cols-3 gap-6`、CSS 的 `display: grid`）；`done` 核对 `display`、列数、行列间距，断点改动照 ticket 104 也看范围外的宽度
- [x] 脚本扮演 Agent（`apply`）走一遍「Stack 转 Grid、落地、`done`」和「手机视图里 Grid 改回竖排、落地、`done`」，核对是 ✓
- [x] 原来的改动说明逐字不变：`--dry` 24/24、`--scripted` 全过；切换按钮的包逐字节不变
- [x] 性能 headless 前后对比（`TK_PERF_HEADLESS=1`）：进入编辑模式（余量只有几毫秒，见 ticket 105）、改数值、拖动不变差
- [x] e2e 全过；新测试照 ticket 93 的写法；spec 的 Out of Scope 里去掉这一条，相应章节补上

## 背景

- 设计师 2026-11-09：「新建 Grid 以及 Stack 和 Grid 互相转换……我试用了一下感觉很必要」。spec 的 Out of Scope 里原有「新建 Grid、Stack 与 Grid 互相转换」，出自 ticket 18 的范围。
- 调前端第 1 轮（f046089，2026-11-09 合进 main）起，Grid 里没写尺寸的格子读作 Fill（撑满它的列宽、行高；图片、视频这类保持自己的尺寸），面板在 Grid 的格子上也让选 Fill：Hug 写 `fit-content` 加 `justify-self` / `align-self: auto`，Fill 写 `auto` 加 `stretch`。Agent 那边还没跟上（规划会话审第 1 轮时发现）：写法规则「Sizes」只讲 Stack 里的 Fill；页面核对把格子里的 `width: 100%`（`w-full`）读成 Fixed，Agent 照常用 `w-full` 写 Fill 会被判没显示。本张定 Hug / Fill 在两种排列之间的对应时以此为准，并补上：Grid 里 Fill、Hug 的写法规则（只在改动的图层在 Grid 里时出现，原来的改动说明逐字不变）；核对把格子里的 `100%` 读作 Fill；`apply` 走一遍「Grid 里一个格子 Hug 改 Fill、落地、`done`」，核对是 ✓。

## 设计师决定（2026-11-09，分诊）

- 照 Figma，在 Stack 一节的方向旁边加 Grid；新建 Grid 走 ⇧A（ticket 110）。
- 109、110 一条线，发布前做，等调前端第 1 轮合进 main 再开线；和 106–108 那条线改的地方不同，可以并行。117（复制、粘贴样式，2026-11-09）接在这条线后面：109 → 110 → 117。
- 额度紧：不设指挥，开线的会话自己按 109 → 110 的顺序做，每张派一个审查子 agent；都用 effort medium。
- 设计师 2026-11-09（开线时）改为设指挥：开线的会话只指挥，不自己写；每张票派一个新的实现子 agent（worktree），再派一个审查子 agent；一个 agent 不做多张票；都用 effort medium。

## Comments

**做了什么（起点 52d7ff0；提交 3eff4ae 实现、测试、文档，9ee44f3 面板少读样式，之后一条写这里和测试类型修正）**

- 新属性 `arrangement`（`property-table.ts`）：Stack 读成 `{ type: "stack", direction, wrap, gap, crossGap? }`（`gap` 沿方向，换行时 `crossGap` 是换行间距），Grid 读成 `{ type: "grid", columns, rowGap, columnGap }`。写：Grid 是 `display: grid`（行内的保持 `inline-grid`）+ `grid-template-columns: repeat(N, minmax(0, 1fr))` + `row-gap` / `column-gap`；Stack 是 `display: flex` + `flex-direction` + `flex-wrap` + 两个间距（不换行时两个都是 gap，所以 `gap-6` 也对）。按行列号、区域、`order`、`dense` 放子图层的 Grid（`placesItself`）不提供转换。
- 推算（新文件 `client/arrangement.ts`，`Editor.arrangedAs`）：横排不换行 N 个 → N 列一行；横排换行 → 列数取最宽一行的图层数，行间距取换行间距；竖排 → 一列；间距 → 行列间距。变回 Stack：竖排用行间距；横排在几行几列时换行（列间距作间距、行间距作换行间距），一行或一列的不换行。数图层时跳过自由定位、不显示的，`display: contents` 的往里数。
- 面板：Stack 一节的方向 Segmented 多一个 Grid（图标 `grid`）；Grid 一节顶上加同一组三个选项，Grid 选中，点横排、竖排变回 Stack。两节的重置都把 `arrangement` 算进去（`STACK_PROPERTIES` 加了它，⇧A 刚合成的 Stack 撤掉时也一起撤）。转过的 Stack 方向一组的标记看 `arrangement`。
- 一条改动、⌘Z 一步：同一视图里转过之后，再改列数、行列间距、方向、间距、换行都并进这条 `arrangement`（`edits.ts` 的 `arrangedAnew`），改回原样就不算改动。断点：照 ADR 0008，走现有的 `editHere`，在手机、平板视图只在那个断点生效、可重置；图层树按桌面建，所以 `Editor.can` 按正在工作的视图里元素实际的 `display` 判断 Stack / Grid（`arrangedKind`），面板跟着换节；桌面转了会重建图层树。
- 改动说明（`change-notes.ts`）：设计意图「Change the arrangement from a horizontal Stack with a gap of 24px to a Grid of 3 equal columns, with a row gap of 24px and a column gap of 24px.」，另一行「**Stack to Grid:** …, as `display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 24px; column-gap: 24px` does (Tailwind's `grid grid-cols-3 gap-6`). Take off what lays it out as a Stack now (…), and give it this in its place. Keep its padding, its layers in the order they are written, and their own classes as they are.」；反过来是「Grid to Stack」，同种之间只是「Arrangement」。写法规则新加「Stacks and Grids」。改动列表标题「Arrangement」。
- 核对（`check.ts`）：照常读 `arrangement` 比 JSON（display、列数、行列间距）。另外：这一轮更早的、被之后同一范围的转换重新排过的方向 / 间距 / 对齐 / 换行 / 列数 / 行列间距改动，答没能核对「change N lays the layer out anew, as a Grid: the page checks how it is laid out by that change」（不然会误报没显示）；桌面转换 + 某个断点单独改列数（或反过来）时，那个断点范围的宽度不拿另一条看（`widthsOf`、`changesTheSame` 把 `arrangement` 和这些属性算作同一件事）。
- 背景最后一条（Grid 格子的 Hug / Fill）：宽、高改动在第一次记下时图层在 Grid 格子里，记 `Change.cell`；有这样的改动才打印新规则「Sizes in a Grid」（Fill：`w-full` / `h-full`，或 `auto` 加 `justify-self` / `align-self: stretch`；Hug：`fit-content`，`w-fit`）。原来「Sizes」一字不改。核对把格子里的 `100%` 读作 Fill（`size().read`：`(stack || inGrid(el)) && declared === "100%"`）。

**脚本扮演 Agent**（`e2e/tests/applying-bench.spec.ts` 末尾「a Stack made a Grid, a Grid a Stack, and a Grid's cell made Fill (ticket 109)」3 个剧本，没有加标准场景，见代定 9）

| 剧本 | Agent 写 | `done` | finish |
|---|---|---|---|
| 桌面视图里 Header（横排 Stack）转 Grid | `grid grid-cols-2 items-center gap-3` | 「Checked on the page: it shows the change.」 | ✓ [1] |
| 手机视图里卡片的 Grid 改竖排（范围 2 段：<640 一列、640–767 三列） | Surface 加 `max-md:flex max-md:flex-col` | 「Checked on the page: it shows the change.」（范围外 768、1440 仍是三列，104 的检查不误报） | ✓ [1] |
| 循环的卡片先写成 `w-fit`（上一轮），设计师在格子里改 Fill | 循环那份换成 `w-full` | 「Checked on the page: it shows the change.」（改前会读成 Fixed 判没显示） | ✓ [1] |

- e2e UI（`grid.spec.ts` 2 个）：Stack 一节方向旁的 Grid、Grid 一节显示、接着改列数仍是一条、Grid 一节改竖排、⌘Z 一步一步回去；手机视图里 Grid 改竖排只在手机视图、标记、重置回 Grid。
- 单测：`edits.browser.test.ts` 新 describe 9 个（读、推算、1px 内不跳、一条改动、断点、核对、`widthsOf`、格子 `100%`）；`cli.test.ts` 4 个（规则出现与否、说明逐字）。

**验证**：`pnpm typecheck` 过；`pnpm test` 1069 过 1 跳过，node 125 过；`TK_E2E_PORT=5500 pnpm test:e2e` 545 过 1 跳过（一次跑完，无重跑）；`--dry` 24/24；`--scripted` 15/15；`--dry --claim-out` 在 52d7ff0 和分支上各 24 份，`diff -r` 逐字相同。

**性能**（`TK_PERF_HEADLESS=1 TK_PERF_PORT=5510`，headless 只作前后比较；改前 52d7ff0，改后 3eff4ae 全套）

| | 改前 | 改后 |
|---|---|---|
| 进入编辑模式 全部 中位数 / p95 | 125.4 / 152.2ms | 126.3 / 143.7ms |
| 同一画布再进入（存下的一轮 / 带过来的一轮）中位数 | 113.0 / 115.2ms | 106.9 / 110.7ms |
| 改数值 圆角 work 中位数 / p95 | 13.9 / 16.6ms | 13.9 / 16.4ms |
| 改数值 Stack 间距 work 中位数 / p95 | 12.7 / 16.7ms | 16.6 / 17.5ms |
| 拖动卡片 / 拖控制点 fps | 60 / 60 | 60 / 60 |
| 认领后热更新核对 最长一段 中位数（3 条改动） | 20.4ms | 18.1ms |

- Stack 间距 work 的中位数差 4ms，查了：9ee44f3 让面板对 Stack 不再为 `arrangement`、内边距读样式，仍 16.2ms；随后把源码换回 52d7ff0 同一台机器同一时段只跑这两条，改前也是 15.4 / 15.9ms，所以是机器状态，不是这张票（p95 前后都在 16–18ms）。进入编辑模式的路径没加东西。

**包**：切换按钮 `react.dev.js` 1423 B（sha256 前 16 位 `bd6c2389b64451f0`）、`chunk-2GJY7MXB.js` 21372 B（`a8c4c0d4bc3db6a8`），和 52d7ff0 逐字节相同。编辑层 `editor.dev.js` 485949 → 490761 B（+4812 B），gzip -9 172015 → 173608 B（+1593 B）。

**Review 后的修正（2026-11-09）**：转换后选的间距 Variable 记到转换那条上（代定 7）；手机先改方向 / 间距、桌面再转 Grid 时手机宽度核对转换那条（代定 11）；只在桌面换了种类时重建图层树；`align` 移出 `ARRANGED`（代定 8）；之后被转成 Grid 的不再写「Make it a Stack」（代定 12）；`can()` 对非 Stack / Grid 图层先按种类返回、不再调 `shown`。重跑：typecheck、`pnpm test`（1072 passed、1 skipped；node 125）、`grid.spec.ts` + `stack.spec.ts` 13 passed、`variables*.spec.ts` 31 passed、109 的 3 个剧本、`--dry` 24/24、认领说明和 52d7ff0 逐字相同、`--scripted`。没碰进入编辑模式的路径，性能没重跑。

### 代定的事（待设计师确认）

1. 样子：Grid 是方向 Segmented 的第三个选项（图标用 Columns 字段已有的 `grid`）；Grid 一节顶上放同一组三个选项，单独一行在列数上面。外观交给调前端。
2. 变回 Stack 时方向由设计师点的那个决定（照 Figma），推算只定换不换行和间距：横排在几行几列时换行，一行或一列不换行；竖排不换行。票里「一列的变竖排、一行的变横排」就是点对应那个时画面不跳。
3. 等宽列：转成 Grid 一律写等宽列（`repeat(N, minmax(0, 1fr))`，同 `grid-cols-N`，和 ticket 18 的列数一致）。子图层宽度各不相同（例如 Hug 的按钮一排）时会变成一样宽，画面会动；不写成按现在宽度的固定轨道。
4. 子图层的样式不动（不加改动）：Stack 里 Hug 的子图层在 Grid 里变成撑满格子（Grid 默认 stretch），Fill（flex-grow）在 Grid 里没有意义、照样撑满；`auto` 外边距照原样留着。对齐（`justify-content`、`align-items`）不转换：横排 Stack 的 `items-center` 在 Grid 里意思一样，竖排的交叉轴对齐在 Grid 里变成了竖直方向（会跳），见风险 2。
5. 竖排换行的 Stack 转 Grid 当一列（顺序按列流，Grid 按行流，没法不跳）。
6. 按行列号、区域、`order`、`dense` 放子图层的 Grid 不提供变回 Stack（Grid 一节不出现那三个选项）。
7. 转换后同一视图里改列数、间距、方向、换行并进转换那一条（一条改动、Agent 只看到最终的排法）；但 Grid 一节的列数、间距字段不再单独标记（标记在方向那组上），重置也是整条。桌面转换后在手机视图改列数是手机上单独一条 `columns` 改动。间距选了间距 Variable 也并进这一条：Variable 记在转换那条上、按字段分（`rowGap`、`columnGap`，Stack 是 `gap`、换行时 `crossGap`），说明的 Variables 一行写「the row gap is the Variable `gutter` … `gap-y-gutter`」；输入的间距和别的间距一样按值自动对上 Variable，所以有 Variable 目录时转换那条也会多一行 Variables（review 后，2026-11-09）。
8. 更早的方向 / 间距 / 列数等改动被之后的转换重新排过时，核对答没能核对、说由转换那条核对；改动说明里那几条照旧列出。对齐（`align`）不算在被重新排的里面：转回 Stack 时照常核对，只有之后转成 Grid 时才交给转换那条（Grid 上读不出 Stack 的对齐）。
11. 按 ADR 0008：先在手机视图改方向或间距、再在桌面转 Grid 时，手机宽度上核对转换那条（之前那里什么都没核对）；手机那条改动留下的 CSS 页面上还在，所以那几个字段（间距；Stack 的方向、换行）在那里不比，比其余的（Grid 的类型、列数等）。手机那几条本身仍答没能核对、由转换那条核对；手机上的间距因此在那个宽度谁都不核对（review 后，2026-11-09）。
12. 改动说明里，之后又被转成 Grid（同一范围）的「做成真正的 Stack」那一行不写了（`**Make it a Stack:**`），免得叫 Agent 写 flex 竖排；写法规则那条「Make it a Stack」仍按改动上的标记出现。
9. `apply` 走一遍用的是 `applying-bench.spec.ts` 里的剧本（脚本扮演 Agent），没有加到 `STANDARD_SCENARIOS`：加了会让 `--dry` 不再是 24 个、改动 88 的验收基数。要进标准场景另开票。
10. 说明里的 Tailwind 写法按默认 4px 一级算（24px → `gap-6`，对不上写 `gap-[13px]`），规则里另说用项目的间距刻度。

### 遗留风险

1. 同一个改动里先转 Grid 再转回不同方向时，画布上会留着前一次写的 `grid-template-columns`（或 `flex-wrap`）声明，对 flex / grid 不起作用，参考样式里没有，撤销整条时一起清掉；只是画布样式表里多一行。
2. 竖排 Stack 有交叉轴对齐（`items-center`）时转 Grid，子图层会从居中变成撑满（Grid 的 `align-items` 管竖直方向），画面跳；没有把对齐转换成 `justify-items`。
3. 推算按画布上子图层的上边分行（1px 内同一行）；子图层高低不齐的换行 Stack 可能多数出一行，列数取最宽一行仍然对。
4. 页面原有的 `display: contents` 包裹层里的子图层按它里面的数。
5. 断点视图里 `arrangedKind` 只按元素的 `display` 判断 Stack / Grid；桌面是 Grid、手机由页面自己的 CSS 变成 block 的情况照旧当 Grid。
6. 转换那条的说明里 Tailwind 写法（`grid grid-cols-3 gap-6`）按 4px 刻度算，Variables 一行另写项目 Variable 的类（`gap-y-gutter`）；两者不一致时靠规则「用项目的间距刻度」让 Agent 取 Variable，没有专门合并。
7. 撤销一次多字段的 Variable 选择时，其他字段之前选的 Variable 按「仍是那个值就保留 picked」恢复（和 padding 的各边一样的现有行为），不一定回到选之前的未选状态。
8. 代定 11 的掩码按字段写死（`ARRANGED_FIELDS`）：Stack 的方向会连带不比间距（主轴间距随方向读）。断点范围部分重叠的情况没有单独测。

### 设计师确认（2026-11-09，规划会话里逐条过）

- 1、2、3、4、5、7、8、10、11、12：照代定。第 3、4 条照代定，就是转成 Grid 一律等宽列、不动子图层；一排宽度不一的 Hug 图层转过去会变成等宽、撑满格子，这一点接受。
- 6 改了：「我们是一个设计层，这里也能修改和回退比较好」。按位置摆子图层的 Grid（`grid-template-areas`、行列号、`dense`、`order`）也提供改成 Stack：
  - 子图层按图层顺序排，也就是 Layers 面板里的顺序、代码里写的顺序，照 Figma。原来的摆放和这个顺序不同时画面会变，设计师看得到，用 ⌘Z、重置或拖动换序处理。`order` 在 Stack 里照样起作用。
  - 改动说明叫 Agent 不动子图层自己的位置写法：在平板、手机视图里转时其他宽度还要用它们，在桌面视图里转时它们不再起作用，留着无害。
  - ⌘Z、重置照别的转换。手机视图里把桌面按 areas 摆的 Grid 改成竖排，是要照顾到的常见用法。
  - 由这条线在 110 合进 main 之后、117 之前，派一个新的子 agent 做，提交写「Ticket 109 follow-up」。
- 9：另开 ticket 118，给测量台加 Stack 和 Grid 互转的标准场景，等下一次真 Agent 复验时一起跑。

### 109 follow-up（代定 6 改了之后，2026-11-10；起点 a0cd852，分支 worktree-agent-ae3afe5e9411e0803）

**做了什么**

- 面板：`arrangement` 去掉了 `placesItself` 的限制（`property-table.ts`），按区域、行列号、`dense`、`order` 摆子图层的 Grid，Grid 一节顶上也有横排、竖排、Grid 三个选项。改成 Stack 就是 flex：子图层按代码里写的顺序（Layers 面板的顺序）排，`order` 照样起作用；推算和别的 Grid 一样（竖排用行间距；横排按画布上的行数决定换不换行）。⌘Z、重置、断点、之后改间距并进这一条，都走原来的路，没有另写。
- 改动上的新标记 `placedInGrid`（`changeset.ts`，`edits.ts` 第一次记下时定）：转之前是 Grid、转成 Stack，并且在任何一个视图里 `placesItself`（例如手机上一列按顺序，640px 起按区域摆，在手机视图里转也算）。只有这一种改动的说明多一行：「**Placed in the Grid:** its layers are placed in it by more than the order they are written (`grid-template-areas`, `grid-area`, `grid-row`, `grid-column`, `dense` or `order`). Leave those classes and rules as they are, on it and on its layers: at widths where it stays a Grid they still place its layers, and in the Stack they do nothing, but `order`, which orders its layers there too.」写法规则「Stacks and Grids」一字没改。
- 核对：没改代码。Stack 的 `arrangement` 只读 display、方向、换行、间距，页面上留着的 `grid-template-areas` / `grid-area` 不影响；范围外的宽度照 104 记下认领时的值（仍是 Grid）再比。
- 文档：spec「Stack 与 Grid 互相转换」去掉「不提供变回 Stack」，写上按图层顺序排；GLOSSARY 的 Grid 补一句。

**测试**

- 单测 `edits.browser.test.ts`（109 那个 describe）：原来「不提供」那条改成提供；新 3 条：按区域摆的 Grid 转竖排后画面按写的顺序、记 `placedInGrid`、之后改间距仍是一条、⌘Z 回到按区域；按顺序摆的 Grid 转 Stack、Stack 转 Grid 都不记；手机视图里转只在手机、页面上留着 areas 的 flex 竖排核对是 ✓、仍是 Grid 时是没显示、重置回去。`cli.test.ts` 1 条：新行只在 `placedInGrid` 的 Grid → Stack 出现。
- e2e `grid.spec.ts` 1 条（照 93 的写法）：页面按区域倒着摆四张卡片，手机视图里选 Grid 改竖排，手机按图层顺序、桌面和平板不变，⌘Z、⇧⌘Z、重置。
- 剧本 `applying-bench.spec.ts`「the cards' Grid, laid out by areas from 640px, made a vertical Stack in the phone view」：上一轮把 Surface 写成 640px 起按区域摆（Tailwind 任意值），手机视图改竖排（范围 2 段），Agent 只加 `max-md:flex max-md:flex-col`、areas 留着：认领后第一次是没显示（不误报 ✓），`done`「Checked on the page: it shows the change.」，finish ✓ [1]，说明里有新行。

**验证**：`pnpm typecheck` 过；`pnpm test` 1105 过 1 跳过，node 125 过；`TK_E2E_PORT=6100 pnpm test:e2e` 页面组 414 过、1 个已知 flake（popover-exit.spec.ts:34，单独重跑过），"project files" 组用 `--no-deps` 补跑 144 过；`--dry` 24/24；`--scripted` 15/15；`--dry --claim-out` 在 a0cd852 和分支上各 24 份，`diff -r` 逐字相同。

**性能**（`TK_PERF_HEADLESS=1 TK_PERF_PORT=6110`，headless 只作前后比较）

整套前后各跑一次（改前 a0cd852，改后 544d60f）；改后那次机器负载高（load 6–10，同时有别的会话），进入编辑模式和拉控制点差得多，所以又在负载降到 3–4 时把 a0cd852（临时 worktree）和分支背靠背各跑一遍这几条：

| | 改前整套 | 改后整套（负载高） | 背靠背 a0cd852 | 背靠背分支 |
|---|---|---|---|---|
| 进入编辑模式 全部 中位数 / p95 | 123.4 / 144.9ms | 183.8 / 328.8ms | 137.0 / 161.3ms | 138.6 / 171.1ms |
| 再进入 中位数 | 109.5ms | 153.7ms | 117.4ms | 118.4ms |
| 改数值 圆角 work 中位数 / p95 | 13.5 / 16.7ms | 14.0 / 21.8ms | 17.0 / 18.6ms | 9.9 / 14.8ms |
| 改数值 Stack 间距 work 中位数 / p95 | 15.7 / 17.7ms | 15.3 / 19.7ms | 17.1 / 18.0ms | 12.8 / 17.0ms |
| 按住方向键 间距 work 中位数 / p95 | 10.2 / 13.7ms | 11.9 / 13.3ms | 15.9 / 18.0ms | 13.8 / 16.4ms |
| 拖动卡片 / 拖控制点 fps | 60 / 60 | 60 / 56.8 | — / 57.6 | — / 58.0 |
| 认领后热更新核对 最长一段 中位数 | 30.3ms | 15.8ms | — | — |

- 背靠背的数前后一样（在噪声里），整套改后那次的差是机器状态。进入编辑模式的路径没加东西：去掉 `applies` 只让 `can()` 少读一次样式；`placedInAView` 只在第一次记下 Grid 改 Stack 时跑。

**包**：切换按钮 `react.dev.js` 1423 B（`bd6c2389b64451f0`）、`chunk-2GJY7MXB.js` 21372 B（`a8c4c0d4bc3db6a8`），和 a0cd852 逐字节相同。编辑层 `editor.dev.js` 503134 → 503266 B（+132 B），gzip -9 177815 → 177852 B（+37 B）。

#### 代定的事（待设计师确认）

1. 新的一行只在「Grid 改成 Stack、而且转之前在某个视图里按位置摆」时出现，看所有视图（不只是正在工作的那个）：手机上本来按顺序、宽一点才按区域摆的 Grid 在手机视图里转，也提醒 Agent 别动那些写法。Stack 转 Grid、按顺序摆的 Grid 转 Stack 的说明逐字不变。
2. 转换的推算不因按位置摆而改：竖排用行间距；横排按画布上数出的行数决定换不换行（区域摆成几行就算几行）。转过去画面按图层顺序变，不做「照现在的视觉顺序重排图层」。
3. 转成 Stack 后同一改动里再转回 Grid：写的是等宽列，页面原有的 `grid-template-areas` 和子图层的 `grid-area` 还在，会又按区域摆；和原样一样时整条消失（109 的「改回原样就不算改动」）。没有专门处理。

#### 遗留风险

1. 核对不看子图层的摆放：Agent 如果在转换时删了 `grid-area` 之类的写法，范围外的宽度上画面会变，但那里 Grid 的列数、间距没变，`done` 仍是 ✓（104 只比这条改动的属性）。说明里那一行是唯一的防线。
2. 桌面视图里转、`order` 不是 0 的子图层：Stack 里仍按 `order` 排，所以画布上和 Layers 面板的顺序不一样（设计师确认过 `order` 照样起作用）；之后在这个 Stack 里拖动换序仍照 Stack 的规则改写的顺序，`order` 会让结果和拖到的位置不一致。
3. 代定 3 的情况（转 Stack 再转回 Grid）画布上的 Grid 是等宽列加原来的区域，推算不一定和画面一致。
4. 「Placed in the Grid」是英文说明，没有真 Agent 跑过（ticket 118 的标准场景里可以带上这一种）。
