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

**Status:** done

- [x] e2e：在 Gap 里输入一个数，不按回车、不按 Esc，直接点方向按钮。方向改了，Gap 的新值也记下了，两条改动都在改动列表里。
- [x] `layout.spec.ts:189` 和 `properties.spec.ts:1894` 改回直接点方向的写法，都能过。
- [x] 列表弹出和选 Variable 的已有测试全过，行为不变。
- [x] `--dry` 全过（29 个场景），`--dry --claim-out` 和改前逐字相同；`--scripted` 全过；切换按钮的包逐字节不变。
- [x] 整套 e2e 过。（指挥合并前在同步了 main e636ece9 的分支上跑整套：603 过 1 跳过，一次过；typecheck 过；vitest 1205 过 1 跳过；node 126 过；`--dry` 29/29 和 main 逐字相同；`--scripted` 20/20）

## 设计师决定（2026-11-10）

- 发布前修。
- 规划会话安排：
  - 接在 109 那条线后面：126 → 127。127 等调校第 2 轮合进 main 再开始。
  - 照常 conduct：一个新的实现子 agent、一个审查子 agent，都用 effort medium，端口用 5500 段。

## Comments

### 127 做了什么（2026-11-10；起点 main 797a1e07，分支 worktree-agent-a24c016bf99ea9cc3）

**原因**

- 字段一聚焦，`useTypeahead` 就把同组的 Variables 列在 `Matches` 里（输数字时按接近程度排，全列出来），列表一直开到字段失焦、按 Esc 或选中一个为止。回车提交值后字段仍有焦点（`select()`），列表照开。
- 列表放在字段下面（放不下才放上面），宽 200px，压在面板上。Layout 一节里 Gap 下面紧挨着方向按钮，列表正好盖住它们：实测 Vertical 按钮中心点上是列表里的 `6` 那一项。
- 列表的选项按下时 `preventDefault`（不让字段失焦），点击就选用。所以「输完直接点方向」点到的是一个 Variable，Gap 换成了它，方向没改。这比「点不到」更糟。只靠「提交时收起」修不了这一条：按下的那一下本身就落在列表上，焦点还没离开字段，也就没有提交。

**做了什么**

- 回车提交后列表收起（`Typeahead.closedOnEnter()`，审查后由 `committed()` 改名；`TextField` 回车时调用；用 Esc 已有的 `closed` 状态）。再输入就重新弹出，重新聚焦也会。Tab、在别处按下鼠标，本来就让字段失焦、提交、收起列表，没有改。
- 列表的位置改到它所在面板的左边（Design 面板，或字段所在的弹出框 `.tk-popover`），顶端和字段顶端对齐，放不下就往上挪，保证整个列表在窗口里。这和取色器、Variables 弹出框放的一侧相同。所以列表不再盖住面板里的任何控件，输完 Gap 直接点方向，一下就点中；按下让 Gap 失焦，新值照常提交。改动列表里是 Gap、Direction 两条。面板左边放不下（窗口太窄）时，照原来放在字段下面或上面。
- 列表什么时候弹出、里面有什么、顺序、怎么选（点击、↑ / ↓ 加回车）、Esc 都没改。

**涉及哪些字段**

- 所有带 Variables 列表的字段都走 `TextField` 的同一条路：Gap、Grid 的行距和列距、四边内边距、圆角、宽高、字号、Fill 和 Stroke 的 hex 等。改动是通用的，没有按字段单独处理。

**测试**

- `layout.spec.ts` 新增 2 条：
  - 在 Gap 里输入、不按回车也不按 Esc，直接点 Vertical：方向变成 column，Gap 是 24px，列表没了，改动列表读作 Gap、Direction 两条；列表在 Design 面板左边，没有盖住面板。
  - 回车后列表收起，焦点留在 Gap，紧接着点方向能点中；再输入时列表重新弹出；Tab 提交并收起列表。
- `layout.spec.ts`「a Stack's direction, gap, padding and alignment」和 `properties.spec.ts`「a Stack made in this round」去掉了先 `blur()` Gap 的绕法，改回 `setField`／回车之后直接点方向，都能过。`layout.spec.ts` 里 Padding left 前那句注释原来写的是「列表一直开着」，已经不对了，改了措辞，代码没动。
- 写法照 93：`steadyBox`、`expect.poll`、web-first 断言；字段按自己的 label 找。
- `TK_E2E_PORT=6100`，`--project=page` 跑了 `layout`、`properties`、`code-variables`、`variables`、`variables-late`：123 条全过，已有的列表和选 Variable 测试一字未改。
- 整套 e2e 留给 conductor。

**数**

- `pnpm typecheck` 过；`pnpm test` 中 vitest 1205 过、1 跳过，node 126 过、0 失败。
- bench（`TK_BENCH_PORT=5540`）：`--dry` 分支 29/29，main 797a1e07 也是 29/29；`--dry --claim-out` 两边各 29 份，`diff -r` 逐字相同；`--scripted` 20/20。
- 包：切换按钮的包（`editor.dev.js` 以外的 12 个文件）和 main 797a1e07 逐字节相同。`editor.dev.js` 从 542,176 字节变成 542,419 字节（+243）；gzip -9 后从 192,169 变成 192,225（+56）。
- 进入编辑模式那条路上什么都没加，所以没跑 perf。

**设计师决定（2026-11-10）**

1. 列表放在面板左边，顶端和字段对齐；左边放不下时，照原来放在字段下面或上面（原代定 1）。
2. 回车提交后列表就收起，值没改也收起；要再输入或重新聚焦才会出来（原代定 2，接受）。

**风险**

1. 列表盖在画布上 Design 面板左边那一块。列表一聚焦就弹出，这一点和取色器不同（取色器要点了才打开），所以设计师在那一块按下鼠标，可能选中一个 Variable，而不是点到画布。
2. 窗口很窄、弹出框左边放不下，或者画布那一栏不到大约 208px（200px 的列表加 8px 间距）时，列表照原来放在字段下面或上面，ticket 里说的问题会回来。现有测试的窗口宽 1440，覆盖不到这些情况。
3. 画布那一栏很窄时，列表可能压到 Layers 面板上。

### 审查后的修改（2026-11-11；main 合到 b6f0514f）

- **工具栏**：列表的右边和工具栏 `.tk-tools` 的右边对齐，都在 `panel.left - 8`，而且列表的 z-index 更高。字段在面板上部时（W、H，或面板滚动后的 Gap），列表会盖住工具，点工具就选中了一个 Variable。现在列表和工具栏上下重叠时，就放到工具栏下面（距离 8px）；下面放不下，就放到工具栏左边。
- **绕法**：`properties.spec.ts` 里的 `width.blur()` 和 `grid.spec.ts` 里 Row gap 的 `blur()` 都去掉了，回车之后列表就关了，两条测试照常通过。
- **测试**：`layout.spec.ts` 新增 1 条：聚焦 Width，列表在面板左边，不和工具栏重叠；直接点 Brief 工具能选中，Width 的值不变。「回车收起」那条测试里加了一步：回车关掉列表以后，先点 Padding left，再点回 Gap，列表重新出来。
- **措辞**：
  - `styles.ts` 里 `.tk-matches` 的注释和 `useTypeahead` 的文档注释都改成新位置，并写明了放不下时怎么办。
  - 测试标题改了：`variables.spec.ts:21`、`:324`，`variables-late.spec.ts:78`，`layout.spec.ts` 里 gap sizing 那条。
  - `properties.spec.ts:214` 的注释也改了。
  - `committed()` 改名为 `closedOnEnter()`。
- **数**：
  - `pnpm typecheck` 通过；`pnpm test` vitest 1205 过、1 跳过，node 126 过、0 失败。
  - e2e（`TK_E2E_PORT=6100`，`--project=page`）：`layout`、`properties`、`grid`、`code-variables`、`variables`、`variables-late` 共 139 条全过。
  - bench（`TK_BENCH_PORT=5540`）：`--dry` 29/29，`--dry --claim-out` 和 main 的 29 份逐字相同（main 从 797a1e07 到现在只改了 `canvas-failed.spec.ts`，包没变），`--scripted` 20/20。
  - 包：切换按钮的包（`editor.dev.js` 以外的 12 个文件）和 main 逐字节相同；`editor.dev.js` 从 542,176 到 542,659 字节（+483），gzip -9 从 192,169 到 192,295（+126）。
- 整套 e2e 留给 conductor。
