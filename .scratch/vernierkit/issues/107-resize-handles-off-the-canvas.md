# 107: 画布外的图层也有控制点

**What to build:** ticket 69 给画布上的图层加了控制点（四角白色小方块、四边改尺寸的光标，拖角改宽高、拖边改一个方向，拖过的方向变成 Fixed），画布外的图层没有：69 的代定第 14 条说它们在自己的小 iframe 里，改尺寸还要连带改那个 iframe 的大小，留待需要时另做。设计师在空白处摆一个 Frame、在里面拼东西，最先要做的就是拉大拉小它。要做到：单独选中画布外的图层（整个图层，或它里面的图层）时，控制点和画布上一样出现、一样用（⇧、⌥、⌘ 关吸附、W × H、Esc 取消、指针被取消时撤回），整个图层改尺寸时它所在的那块地方跟着变大变小，里面的东西照 CSS 跟着变。不产生改动；拖回时新的尺寸作为插入的一部分写进改动单。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准（「控制点」），并遵守 docs/adr/ 中的决策（ADR 0009、0012）和 ticket 69 的代定（除第 14 条外照旧）。

**Blocked by:** 无（同一条线上排在 106 之后，开线时间见 106）

**Status:** done

- [x] 单独选中画布外的图层或它里面的图层，控制点出现；拖角、拖边改尺寸的规则和画布上一样（ticket 69 的代定 1–13、15）
- [x] 整个画布外的图层改尺寸：它在空白处占的地方跟着变，不被裁掉、不留空；从左边、上边拉时，它的左上角跟着动；里面 Hug、Fill 的图层照 CSS 跟着变
- [x] 角标数量不变、改动单不变；刷新后尺寸还在；⌘Z 一步撤回一次改尺寸，拖的过程里 ⌘Z、⇧⌘Z、Delete 不起作用（ticket 61、62）
- [x] 改过尺寸再拖回：照 ADR 0009，算在画布外编辑过，拖回是一次插入，带着新尺寸
- [x] 画布上的控制点、拖动、改尺寸一处不变：e2e 全过，`resize.spec.ts` 不改
- [x] 性能 headless 前后对比（`TK_PERF_HEADLESS=1`）：进入编辑模式、改尺寸不变差；切换按钮的包逐字节不变

## 背景

- 设计师 2026-11-08 问画布外的 Frame 为什么不能编辑；规划会话列出的四项之一。ticket 69 代定第 14 条当时设计师确认过「留待需要时另做」，现在需要了。

## 设计师决定（2026-11-08，分诊）

- 见 106 的「设计师决定」：三张一条线，106 → 107 → 108；调前端第 1 轮合进 main 后开线，发布前做完；设指挥（2026-11-09 改），每张一个实现子 agent、一个审查子 agent，都用 effort medium。

## Comments

**做了什么（起点 1c310d6 = main，含线分支 claude/nifty-borg-823e6d）**

- 控制点（`CanvasView.tsx`）：`withHandles` 不再要求图层在画布的文档里，改成「单独选中、不是它所在那棵树的根、能改宽或高」，用图层自己的编辑器判断（`editorOf`）。画布外的根（body）没有控制点，整个画布外的图层（根下第一层）和它里面的图层都有。画的时候按 `shows(shown, layer)`：画布上的图层在每个视图里画，画布外的只在它自己那里画（`data-view="Off canvas"`）。
- 按下控制点（`pressHandle`）：用按下的那处的编辑器（`editorIn`）；画布外的不调 `views.sync`、`setActive`（只有画布有视图）。整个画布外的图层时，`ResizeSession.whole` 记下它按下时在空白处的左上角。之后每一步 `resizeStep` 用那处的编辑器算，和画布上同一套：⇧、⌥、⌘ 关吸附、3px 才开始、W × H、Esc、指针被取消时撤回、按着时键不起作用（ADR 0012），都没另写。
- 整个图层：`canvas-resize.ts` 在 `whole` 时不找吸附目标（空白处没有东西可对齐，和在空白处拖动它一样），每一步多给一个 `at`：它的左上角在空白处该到哪（按下时的位置加上框的左上角移了多少；从左边、上边拉，或 ⌥ 从中心改时会动）。`Shell.onResize` 拿到 `at` 且和现在的位置不同时，把挪位置作为 `along` 交给 `Editor.resize`（新加的可选参数：在同一个 group 里 `editor.along(make, unmake)`），所以尺寸和位置是同一步撤销、同一次 Esc 撤回，连续的几步照旧并成一步（改尺寸的 run）。
- 它占的地方：本来就跟着图层变——宽度由 body（`max-content`）的 ResizeObserver（`fitWidth`），高度由视图的 `fitHeight(…, 0)`（每帧，floor 为 0），放大缩小都对，没改 `off-canvas.ts`。W × H 和参考线按它现在的位置画（`shownNow`），从左边拉时不落在按下时的地方。
- 改动：画布外的编辑记在它自己的改动里（width / height 的 Fixed），角标、改动单不变；刷新后在（`keep()` 带着外观和改动、新的 x / y）。挪出的图层改过尺寸就算编辑过：拖回是 `putBack`，尺寸在 `kept.edits` 里，改动说明的「Edited off the canvas」逐条写出（和别的编辑同一写法，改动说明没有新写法）；空白处新建的拖回时 `remake` 照样把 width / height 在画布上再做一遍。
- spec「画布外的图层」一节加一条控制点，「控制点」一节去掉「画布外的图层不显示控制点」；用户故事 32v 已在；GLOSSARY「控制点」补一句画布外也有。

**测试**

- 单元（`test/off-canvas.browser.test.ts` 新 describe，3 个）：整个画布外的图层改尺寸，带着 `along` 挪左上角，两步并成一步；它占的地方变大再变小（宽高都跟着缩）；⌘Z 一步回到原尺寸原位置、⇧⌘Z 回来；`save()` 是新位置和尺寸改动；画布的改动单为空。`takeBack`（Esc）连位置一起撤回、没有可重做的。挪出的图层改宽度后拖回：`putBack` 的 `edits` 里是 width Fixed 320，放回去的宽度是 320。
- e2e 新文件 `e2e/tests/off-canvas-resize.spec.ts`（4 个，`canvasInPlace`、`steadyBox`、`expect.poll`）：空白处的 Frame 有 8 个控制点、视图里没有；拖右下角放大，W × H、面板 Width、它占的地方跟着变、位置不动，再拖小到比原来小，⌘Z 两次、⇧⌘Z，刷新后还在，无角标；拖左上角：左上角跟着指针、右下边不动，拖的过程里 ⌘Z、Delete 无效，Esc 撤回；拖左边松手，一次 ⌘Z 连位置一起回去；里面画的 Frame 有控制点、改尺寸外面的 Frame 不变；挪出的标题拖右边改窄（变高），拖回板子里三个视图里都是新宽度，改动列表是「Delete · Third Kind」「Put back · Third Kind」。
- 改了两个旧测试文件的按法（`resize.spec.ts` 没动）：`off-canvas.spec.ts` 的 `dragOffTo` 和两处 grab、`off-canvas-round.spec.ts` 一处、`snapping.spec.ts:145` 一处，原来按在画布外图层左上角往里 3px。现在选中的画布外图层在那里有控制点（和画布上一样，ticket 69 代定 2、3：缩小时图层只有 47 × 10 屏幕 px，3px 处落在左上角的控制点上），会变成改尺寸。改成按在控制点之外（往里 12px、上下居中），松手时指针照旧落在原来那点（落点由指针定，结果不变）；按自由定位落点核对的那一条改成「左上角落在那里」。没改之前这几条有 6 条失败（全量跑时 snapping 那条也是），1 条是拖成了改尺寸却碰巧通过。
- `pnpm typecheck` 过；`pnpm test`：vitest 1068 过、1 跳过，node 125 过。
- `TK_E2E_PORT=5400 pnpm test:e2e`：549 过、1 跳过，无失败（改 snapping 那条之后的全量）。
- `TK_BENCH_PORT=5440 pnpm bench:agents --dry` 24/24；`--scripted` 15/15；main（1c310d6）和本分支 `--dry --claim-out` 24 份 `diff -r` 相同。

**性能**（`TK_PERF_HEADLESS=1 TK_PERF_PORT=5410`，headless 只作前后比较；改前 = 本 worktree 换回 1c310d6 的 src，改后本分支，先后跑；16 个都过）

| | 改前 | 改后 |
|---|---|---|
| 进入编辑模式 全部 中位数 / p95 | 120.1 / 158.1ms | 121.3 / 141.7ms |
| 首次进入 / 再次进入 中位数 | 136.6 / 104.2ms | 137.5 / 104.8ms |
| 改数值 圆角 work 中位数 / p95 | 10.0 / 14.0ms | 9.1 / 15.8ms |
| 改数值 Stack gap work 中位数 / p95 | 11.1 / 15.6ms | 11.0 / 16.8ms |
| ⌘Z Stack gap work 中位数 / p95 | 15.8 / 20.5ms | 14.7 / 22.3ms |
| 拖动 fps 最差 / 帧间隔 p95 | 60 / 16.8ms | 60 / 16.7ms |
| 拖控制点 fps 最差 / 帧间隔 p95 | 60 / 16.7ms | 60 / 16.7ms |

- 进入编辑模式的路径上没加代码：新代码只在选中、按下控制点、改尺寸时跑（`withHandles` 多查一次图层所在的画布外图层，只在有选中时）。差别在噪声里。

**体积**

- 切换按钮逐字节不变：`chunk-2GJY7MXB.js` 21372 B（sha256 a8c4c0d4bc3d…）、`react.dev.js` 1423 B（bd6c2389b644…），和改前一样。
- `editor.dev.js` 490,564 → 491,048 B，gzip 173,812 → 174,028 B（+216）；`cli.js` 不变（44,264 B gzip）。

**代定的事（待设计师确认）**

1. 整个画布外的图层在空白处改尺寸时不吸附（空白处没有容器、兄弟可对齐；拖着挪它时也不吸附）。照 Figma 的话，顶层 Frame 改尺寸会吸到别的顶层 Frame 的边；要吸到旁边的视图或别的画布外图层，可以另做。里面的图层照画布上的规则吸附。
2. 从左边、上边拉（或 ⌥ 从中心改）时它的左上角跟着动，挪位置和改尺寸同一步撤销，Esc 一起撤回；挪位置不进它自己的改动（和在空白处拖动它一样，只是它在空白处的位置）。
3. 选中的画布外图层，按在它四边往里 4px 内、四角附近是改尺寸，不再是拖动（和画布上一样）；缩得很小时要按中间才能拖走它。旧测试的按法因此改了（见上）。
4. 画布外没有断点：在画布外改的尺寸拖回时，挪出的写进 putBack 的编辑，空白处新建的在所有宽度上再做一遍（同 106 代定 5）。
5. 位置取整到 1px（`place` 本来就取整）：图层原来的宽度有小数时，从左边拉松手后右边可能差不到 1px。
6. 在画布上是 Fill 的图层挪出画布后读作 Hug（画布外 body 是 `max-content`，它有多宽就多宽），所以拖回时「Edited off the canvas」那一行写的是画布外的值，例如「Change the width from Hug to Fixed 320px」，不是画布上的 Fill。照现有行为不改（画布外的编辑本来就按画布外读，和别的属性一样）；要写成画布上的值需另做。

**风险和没做到的**

- 图层宽度变化时，iframe 宽度在同一帧的 ResizeObserver 里跟上，高度在下一帧（视图每帧 fit 一次），所以变高的那一帧下面可能被裁掉一帧，肉眼难见。
- 挪出的图层若原来是 Fill（在画布外 body 是 `max-content`），拖控制点后变成 Fixed，拖回时也是 Fixed（和画布上拖一样，ticket 69）。
- 改动说明的「Edited off the canvas」里尺寸那条用现有写法；审查后在 `cli.test.ts` 加了一条逐字核对（Hug → Fixed 320px），测量台场景里仍没有画布外的图层。前面一行写的是画布外的值（代定 6）。
- 窗口模式性能没跑（会抢焦点）。
- 没调 code-review 技能（审查由指挥另派）。

**审查后补修（2026-11-09）**

- 一步没改尺寸、只挪了左上角时（例如宽度停在最小值上，或取整后同一个值），原来这一步只有 `along`，它的键是「resize 」（没有图层 id），并不进前面的改尺寸 run：Esc 只撤这一步，⌘Z 要按两次。现在 `Editor.resize` 的 `along` 直接按这个图层的 id 记（`push`，layers 是它的 id），键和 run 一样，并进同一步。单元测试加一条：第二步宽度不变只挪位置，一次 ⌘Z、一次 Esc 都整个回去（修之前会停在 -340）。
- `Shell` 里挪位置的条件抽成 `movedWith(layer, at)`，去掉没用的 `[0, 0]` 分支；`{x, y}` 项目里没有现成的点类型（`At` 是 clientX / clientY），照旧内联。
- `cli.test.ts` 加一条：挪出的图层在画布外改了宽度、拖回，「Edited off the canvas」逐字是「Width of Title (…): Change the width from Hug to Fixed 320px.」。
- e2e：按着控制点时也按 ⇧⌘Z（不起作用）；新加一条：拖左边松手、刷新后位置和尺寸都还在。指针被取消没加（Playwright 发不出 pointercancel，代码和画布上同一条路径）。
- 只跑了：`pnpm typecheck` 过；`pnpm test` vitest 1070 过、1 跳过，node 125 过；`off-canvas-resize.spec.ts`、`off-canvas.spec.ts`、`resize.spec.ts`（`-c e2e/playwright.config.ts --project=page`，5400）42 个全过。全量 e2e、性能、测量台由指挥合并后跑。

