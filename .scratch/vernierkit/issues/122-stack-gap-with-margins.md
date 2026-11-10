# 122: Stack 的间距改成 0，子图层之间还留着外边距

**What to build:** 设计师在调前端第 2 轮里发现的 bug。

**复现**（`examples/vite-react18-tw3`）：
- 选中一张卡片 Card。它在源码里是普通的块级排版，上下排列，编辑层把它显示成竖排 Stack，面板上间距是 0。
- 把间距改成 0，或者改成任何值。
- 画布上标题和正文之间仍多出 8px：改成 0 时是 8px，改成 16 时是 24px。

**原因：**
- Card.tsx 的正文是 `<p className="mt-2 …">`。
- 改间距时，编辑层把这层排版变成真正的 Stack（写 `display: flex; flex-direction: column; gap`），但子图层的外边距原样留着，所以画面上的距离是间距加 8px。
- 读也读错了：这种还不是 flex 的 Stack，面板的间距一律读成 0，可画面上明明有 8px。

**要做到：**
- 面板上的间距，就是子图层之间画面上实际的距离。
- 改间距后，画面上的距离就是设计师选的值。
- 这和 ⇧A 合成 Stack 已经在做的一样（spec「合成与解散 Stack」：子图层之间的外边距并入间距、子图层外边距清零，面板上的间距就是实际的间距；ticket 42）。
- 给 Agent 的说明里写明要去掉哪些外边距，Agent 照着把 `mt-2` 去掉。

参考本功能的 spec.md（同目录上一级，「属性面板」「合成与解散 Stack」），用词以 GLOSSARY.md 为准（Stack、间距），并遵守 docs/adr/ 中的决策（ADR 0006、0008）。

**Blocked by:** 无

**Status:** done

- [x] **读：** Stack 的间距读成子图层之间画面上实际的距离，这里是 8。
  - 页面原来就是 flex 的 Stack，子图层又带外边距时，也照这个读。
  - 子图层之间的距离不一样时，面板怎么显示作为代定。可以照多选时的 Mixed，也可以照 ⇧A 取中位数。
  - 原来读得对的（没有外边距的 Stack），读出来一个字都不变。
- [x] **改：** 改间距时，子图层之间的外边距清零，再写间距，画面上的距离就是选的值。
  - 最外侧的外边距（第一个图层的上边、最后一个的下边）怎么办，作为代定。照 ⇧A，是挪到 Stack 自己身上，还是留着不动。
  - `auto` 外边距（居中用的）不动。
  - ⌘Z 一步撤回，外边距一起回来。
- [x] **断点：** 在平板、手机视图里改间距只在那个断点生效（ADR 0008）。外边距清零也只在那个断点。
  - 页面在不同宽度用不同外边距时，各视图各读各的。
- [x] **改动说明：** 有外边距被清零的间距改动，说明里多一行 **Drop the margins**，点名哪些图层，和 ⇧A 合成时那一行一样（ticket 42）。
  - 写法规则「Make it a Stack」现在说要让子图层看起来和原来一样（「their margins no longer collapse … may need adjusting」），和清零外边距对不上。要不要改、怎么改，作为代定，Skill 和认领说明的写法保持英文。
  - 没有外边距的间距改动，说明逐字不变：`--dry` 全过（d996f27 起 28 个场景）。`--dry --claim-out` 和改前比，只有这种情况多出那一行，在 Comments 里列出来。
- [x] **核对：** `done` 不能只看 `row-gap` / `column-gap`。Agent 写了 `gap-0` 却留着 `mt-2`，页面上的距离还是 8px，要答没显示，说哪个图层还有多少外边距，不能是 ✓。
  - 子图层之间的距离等于选的值，才算显示。
- [x] **脚本扮演 Agent：** `apply` 走一遍「react18 例子里卡片间距改 0、落地、`done`」，核对是 ✓。
  - 再走一遍只改 gap、不去外边距的，`done` 答没显示。
  - 原来的 `--scripted` 全过。
- [x] **性能：** headless 前后对比（`TK_PERF_HEADLESS=1`）。进入编辑模式不变差，读外边距放在选中、改值时，不放在进入时。改数值不变差。
- [ ] **测试和文档：** e2e 全过；新测试照 ticket 93 的写法；spec 的「属性面板」间距那一条补上这一点。

## 背景

- 设计师 2026-11-10，在调前端第 2 轮里发现，「交给规划写工单」。调前端那边没有改代码。它提的修法：读成实际距离，改间距时清零子图层之间的外边距，说明里写「Drop the margins」，照 ⇧A 合成的做法。设计师还没确认细节，说明的措辞要设计师过目。
- 规划会话核对过：
  - `property-table.ts` 的 `gap.read` 在 `!stack.flex` 时直接返回 0；
  - `edits.ts` 改 Stack 属性时对还不是 flex 的排版写 `display: flex` 和 `flex-direction`（`asStack`），不碰子图层的外边距；
  - ⇧A 合成时的 `unmargined` 和说明里的「Drop the margins」在 `structure-edits.ts`、`change-notes.ts`。

## 设计师决定（2026-11-10）

- 发布前做。
- 接在 109 那条线后面，排在 120 之后（120 → 122）。照那条线的做法：设指挥，派一个新的实现子 agent、一个审查子 agent，都用 effort medium。
- 代定的几件（距离不一样时怎么显示、最外侧的外边距、「Make it a Stack」那条规则的措辞）由那条线先定，回来给设计师确认。

## Comments

### 实现（2026-11-10；起点 main 69234b6，分支 worktree-agent-acf7dad5cd5356dd0）

**做了什么**

- 读（`property-table.ts` 新函数 `roomBetween`）：Stack 的 `gap` 读成子图层之间画面上的距离。子图层之间（前一个的下边 / 右边、后一个的上边 / 左边；反向、从右到左时反过来）有外边距时，flex 按「间距 + 两边外边距」算，普通排列按浏览器的外边距合并算（取大的，负的减掉）；几处不一样取中位数（照 ⇧A）。没有这种外边距时照旧读写好的间距，一字不变。`auto` 外边距（`computedStyleMap` 读关键字）、第一个图层前、最后一个图层后的外边距都不算；普通排列里的行内元素不算。只在读 `gap` 时算（选中、改值），不进进入编辑模式的路径。react18 的 Card 读 8。
- 改（`edits.ts`）：改间距的改动第一次记下时，按正在工作的视图读出子图层之间的外边距，记在改动上（`Change.marginsDropped`：图层、`{ "margin-top": "8px" }`、写这些外边距的来源）；画布上在这些图层上把那几边写成 0（`droppedStyle`），和间距同一步，⌘Z 一步撤回、外边距一起回来；拖动、方向键接着改仍是这一条。`canvas-style.ts` 的 `changesOn` 把这些 0 算作那些图层身上的改动，所以重置、断点上的切分（`cutting`）、继承（`inheritStep`）、存下的一轮撤回（`saved-round.ts`）都跟着走。断点：在平板、手机视图里改，外边距只在那个断点清零（ADR 0008）。
- 改动说明（`change-notes.ts`）：有 `marginsDropped` 的改动多两行：
  - `**Drop the margins:** the layers have a margin between them now: \`margin-top: 8px\` on Turn the current page into a canvas. (\`<p class="mt-2 text-caption text-muted">\`, at \`src/components/Card.tsx:5:7\`). In the Stack, the room between them is its gap alone: take it off, and keep any margin around the first and the last.`（断点上是「take it off at these widths only」）
  - `**Currently set by** (the margins): class \`mt-2\`: …`（和 ⇧A 那行同名）
- 写法规则（`writing-rules.ts`，代定 3）：这一轮有「做成真正的 Stack、又清零外边距」的改动时，「Make it a Stack」后面补一句；How the page checks 加一项「a gap that takes over its layers' margins (**Drop the margins**) by the room between each two of its layers as drawn: its gap and any margin left between them together」。没有外边距的轮次两处都一字不变。第三方组件的规则（ticket 120）也把这些图层算进去。
- 核对（`check.ts` 新 `lookGap`）：每两个子图层之间的距离都等于选的值（0.5px 内）才算显示；没有外边距的 Stack 照旧比写好的间距。留着外边距时答没显示，`actual` 是 `{ gap, margins: [{ layer, side, px }] }`。`done`：「Checked on the page: it does not show the change. The room between the Stack's layers is 8px, not 0px: Body (\`margin-top: 8px\`) has a margin between the layers, which adds to its gap. Take it off (Drop the margins), and run \`npx 03kind done 1\` again.」；`finish` 的原因一行「the room between the layers on the page is 8px, not 0px: … has a margin between the layers still」；带过来的一轮读回 `before` 时取 `gap`。
- 解散 Stack 的说明（`structure-edits.ts`）里「Stack (vertical, with a gap of …)」仍写代码里写的间距（子图层留着外边距），不用新读法，所以 `dissolve-place-frame` 的说明不变。

**脚本扮演 Agent**

| | 在哪 | Agent 写 | `done` |
|---|---|---|---|
| react18 卡片间距改 0 | 标准场景 `r18-card-gap`（`scenarios-other-examples.ts`，`--scripted` 第 20 个） | Card 加 `tight` 属性：循环那处 `flex flex-col gap-0`、正文去掉 `mt-2`；第四张卡片不变 | ✓（`--scripted` 过：页面测试、核对 shown、`gap-0`、报告） |
| react19 卡片间距改 0，只改 gap | 剧本 `applying-bench.spec.ts`「the loop's cards given no gap (ticket 122)…」 | 循环那处传 `flex flex-col gap-0`，`mt-2` 留着 | 没显示，点名 `margin-top: 8px`，finish 不打 ✓ |

- 原来的两个剧本跟着改（ticket 77 那组）：`usage-leak-gap` 原来 Agent 给其他使用处 `gap-2`、去掉 `mt-2`，第四张卡片现在读 8→8，画面没变、不再算漏改，所以改成 `gap-4`（「its gap from 8px to 16px」）；`usage-only-gap` 原来只传 `flex flex-col gap-3`、留着 `mt-2`，画面上是 20px，按新核对是没显示，所以传的类加上 `[&>p]:mt-0`。
- `fill-gap-brief` 的页面测试加上「标题和正文之间画面上正好 12px」（没有 `apply`，只影响真 Agent 跑）。

**测试**

- 单测 `edits.browser.test.ts` 新 describe 5 条：读（普通排列 8、flex 中位数 8、`auto` 外边距不算）；改 0 后距离 0、外侧外边距留着、接着改 16 仍一条、⌘Z 一步回到 8 和 block、⇧⌘Z；`auto` 外边距不动、中间图层两边都清；手机视图只在手机清零；页面核对留着外边距没显示带 `actual`、去掉后 ✓。`cli.test.ts` 4 条：说明两行和规则两处、断点上的写法、没有外边距时不出现、`done` 和 `finish` 的话。
- e2e `layout.spec.ts`（照 93 的写法）：「普通排列改间距变真正的 Stack」改成先读 8、改 16、正文外边距 0、距离 16、⌘Z 回到 8；新加「手机视图里改间距只在手机清零」；「全屏播放」那条改成 16。`claim.spec.ts` 那条 Card 间距改成 16，断言 8→16、`gap-4`、Drop the margins、Currently set by (the margins)。

**验证**：`pnpm typecheck` 过；`pnpm test` 1181 过 1 跳过，node 126 过；`--dry` 29/29；`--scripted` 20/20；e2e 页面组 claim/stack/properties/layout/layers/undo/views/code-variables/react18-round 435 过（`layout.spec.ts` 改后单独 19 过），"project files" 组 `--no-deps` 跑 claim、applying-bench、bench-scenarios 92 过。整套 e2e 留给指挥。

**认领说明的差别**（`--dry --claim-out`，69234b6 和分支，`diff -r`）：28 份里只有 `fill-gap-brief.md` 不同（卡片间距改 12，正文有 `mt-2`），另多一份新场景 `r18-card-gap.md`。`fill-gap-brief.md`：

- 设计意图 `Change the gap from 0px to 12px.` → `Change the gap from 8px to 12px.`
- 多一行 `**Drop the margins:** the layers have a margin between them now: \`margin-top: 8px\` on Turn the current page into a canvas. (\`<p class="mt-2 text-sm text-stone-600">\`, at \`src/components/Card.tsx:5:7\`). In the Stack, the room between them is its gap alone: take it off, and keep any margin around the first and the last.`
- 多一行 `**Currently set by** (the margins): class \`mt-2\`: rule \`.mt-2\` in CSS layer \`utilities\` of \`src/index.css\`, \`margin-top: calc(var(--spacing) * 2)\``
- 规则「Make it a Stack」末尾多一句 `Where its gap changes, the change says which margins to take off (**Drop the margins**): take those off, and its gap is all the room between its children.`
- How the page checks 在断点那项后多一项 `a gap that takes over its layers' margins (**Drop the margins**) by the room between each two of its layers as drawn: its gap and any margin left between them together`

其余 27 份逐字相同（第一版里 `dissolve-place-frame` 因解散说明用了新读法多出「gap of 20px」，已改回读写好的间距）。

**性能**（`TK_PERF_HEADLESS=1 TK_PERF_PORT=6110`，headless 只作前后比较；改前 69234b6 整套、改后分支整套，另把选中和改数值两条背靠背各跑一次）

| | 改前整套 | 改后整套 | 背靠背 69234b6 | 背靠背分支 |
|---|---|---|---|---|
| 进入编辑模式 全部 中位数 / p95 | 124.1 / 142.9ms | 124.7 / 144.8ms | — | — |
| 再进入 中位数 | 105.7ms | 110.0ms | — | — |
| 改数值 圆角 work 中位数 / p95 | 9.0 / 16.4ms | 15.1 / 16.7ms | 14.8 / 16.7ms | 14.0 / 16.2ms |
| 改数值 Stack 间距 work 中位数 / p95 | 13.5 / 16.5ms | 15.9 / 17.0ms | 15.8 / 17.0ms | 17.0 / 17.6ms |
| 间距 ⌘Z work 中位数 / p95 | 17.4 / 21.5ms | 16.8 / 21.4ms | — | — |
| 选中 work 中位数 / p95 | 10.0 / 17.3ms | 19.8 / 22.5ms | 19.1 / 22.4ms | 19.0 / 21.5ms |

- 整套改后那次选中和圆角都慢了（圆角这张票没碰），背靠背跑 main 也是 19ms，是机器状态，不是这张票。进入编辑模式的路径没加东西：外边距只在读 `gap`（选中、改值）和第一次记下间距改动时读。

**包**：切换按钮 `react.dev.js` 1423 B（`bd6c2389b64451f0`）、`chunk-2GJY7MXB.js` 21372 B（`a8c4c0d4bc3db6a8`），和 69234b6 逐字节相同。编辑层 `editor.dev.js` 528657 → 531273 B（+2616 B），gzip -9 187444 → 188275 B（+831 B）。

#### Review 后的修正（2026-11-10）

- 中位数能设（必修 1）：距离不一样时，改间距的起点记成每处的距离（`before: [8, 24]`，`gapBefore`），所以输入任何值、包括显示的中位数，都记一条改动并清零外边距；先输 12 再输 16 也不会因为「回到起点」把改动删掉。⌘Z、撤回到起点（值就是那个列表）才删掉改动、外边距回来。说明的设计意图写「Change the gap from 8px and 24px between its layers to 16px.」。
- `done` 不再说「is 0px, not 0px」（必修 2）：留着外边距时报的是每处距离的最小到最大（「0px–8px」，一样时一个值）。
- 转换之后改间距（必修 3）：本轮转成 Stack 之后，子图层之间有外边距（或这个视图里间距已经清过外边距）时，改间距不再并进转换那条，而是一条自己的间距改动，记 `marginsDropped`、清零、`done` 照新核对；转换那条的核对本来就不比之后另有改动的字段（`arrangedOver`），所以不会误报。见代定 7。
- `order`（必修 4）：`roomBetween` 在 flex 里按 `order`（和 `ordersOf` 一样读）再按代码顺序排，算画面上相邻的两个。有单测。
- 每个宽度外边距不同（必修 5，选便宜的做法，代定 8）：`lookGap` 只看改动点名的那几边（按图层的源码标记和边）有没有去掉，加上写的间距等于选的值；说明里没点名、画布上也有的外边距不看，不怪 Agent。没有 `marginsDropped` 的间距改动照旧只比写的间距（和改前一样）。
- 措辞：去掉「now」（「the layers have a margin between them: …」）；文字图层名字末尾的句号去掉（「on Turn the current page into a canvas (`<p …>`, at …)」）。How the page checks 那一项随核对改成「a gap that takes over its layers' margins (**Drop the margins**) by its gap as the browser computes it and by those margins being gone from the layers named, each side named」。
- `layout.spec.ts` 里手机视图那条用 `ControlOrMeta`。ticket 88 的记录补了一句：标准场景现在 29 个，`fill-gap-brief` 的间距那条从 122 起多看标题和正文之间正好 12px，前后结果不能直接比。
- 新单测 3 条（中位数能设、⌘Z 两步回到起点；`order`；Grid 改 Stack 后改间距是单独一条），核对那条加了「没点名的外边距不怪」「没有 `marginsDropped` 的照旧比写的间距」；`cli.test.ts` 加 1 条（不均匀的起点怎么写）。
- 重跑：`pnpm typecheck` 过；`pnpm test` 1185 过 1 跳过，node 126 过；`--dry` 29/29；`--scripted` 20/20；e2e 页面组 layout/stack/properties/grid/undo/layers/views 171 过，"project files" 组 `--no-deps` 跑 claim、applying-bench、bench-scenarios 92 过。认领说明和 69234b6 比仍只有 `fill-gap-brief.md` 不同、多一份 `r18-card-gap.md`；`fill-gap-brief.md` 的差别和上面列的一样，只是 Drop the margins 那行没有「now」、名字后没有句号，How the page checks 那一项是上面的新写法。包：切换按钮仍逐字节相同；`editor.dev.js` 532092 B，gzip -9 188603 B（比 69234b6 +3435 B / +1159 B）。性能没重跑（改动只在读间距、改间距和核对里）。

#### 代定的事（待设计师确认）

1. 距离不一样时面板显示中位数（照 ⇧A 合成取中位数），不显示 Mixed：Mixed 在面板里是多选时的意思，单选一个 Stack 显示 Mixed 会以为选了几个；Figma 的自动布局也只有一个间距值。这时输入任何值，包括显示的中位数，都算一条改动、清零外边距，改完每处都是那个值（review 后）。
2. 最外侧的外边距（第一个图层前、最后一个图层后）留着不动，不像 ⇧A 那样挪到 Stack 上：改间距只管子图层之间，挪到 Stack 上会连带改它的内边距或外边距（Figma 里间距和内边距也分开）。说明里写「keep any margin around the first and the last」。交叉方向的外边距（竖排时左右）也不动。
3. 「Make it a Stack」规则原句不改，只在这一轮有清零外边距的改动时补一句「Where its gap changes, the change says which margins to take off (**Drop the margins**): take those off, and its gap is all the room between its children.」：只改对齐、方向、换行的普通排列仍要「看起来和原来一样」，原句对它们还对；没有外边距的轮次说明逐字不变。
4. 说明那一行点名图层用 `名字 (\`<标签>\`, at \`位置\`)`（和解散 Stack 列图层一样），不只写名字：文字图层的名字就是它的字（「Turn the current page into a canvas.」），光写名字 Agent 不好找。`done` 那句只写名字（按源码位置对上改动里的图层，对不上时写标签和字）。
5. 只有改 `gap` 时清零外边距；转 Grid / Stack（`arrangement`）、改对齐、改方向不动外边距，转换的推算仍按写好的间距（ticket 109 的读法没改）。
6. 按住方向键、拖动改间距：外边距按第一次记下时清零，之后不再重读。
7. （review 后）本轮把 Grid 转成 Stack 之后再改间距，子图层之间有外边距时，间距是一条自己的改动（改动列表里两条），不并进转换那条；没有外边距时照 109 并进去。这样不用给转换那条另加「哪一步清零」的撤销逻辑。间距的设计变量这时记在间距那条上。
8. （review 后）每个宽度外边距不同时选了便宜的做法：核对只看改动点名的边有没有去掉、写的间距对不对，不按每个打开的视图分别记外边距。代价：某个宽度上点名的那几边之外还有外边距（说明没提、画布上也有），那里画面上的距离不等于选的值，`done` 仍答显示了。

#### 遗留风险

1. 普通排列只算相邻两个兄弟的外边距合并；外边距穿过空元素、或从子图层里面穿出来合并（子图层的第一个孩子有 `mt-*`）时，读出来和画面不一样，清零的也不是那一处。
2. （review 后 `order` 已按画面顺序）`flex-wrap` 换行处前后两个图层的外边距也算成「之间」并清零。
3. 页面在不同宽度用不同外边距（`mt-2 md:mt-4`）时，桌面视图改间距只清零桌面视图读到的那几边，按所有宽度写 0；别的宽度才有的边不清。
4. 「代码里的设计变量」（ticket 119）读间距用新读法的值：有外边距时和代码里写的 `gap-*` 对不上，就不说代码用的是哪个变量。
5. 推广到组件（Promote）的间距改动，清零的外边距跟着改动走，但没有专门测。
5a. （review 6，没做）清零的外边距跟着图层走：之后把那个图层换到第一个、或挪出这个 Stack，它的那一边仍是 0，说明里仍点名它；没有在换序、挪出时重算。要做得在每次移动改动后重算间距改动的 `marginsDropped`，和撤销步骤交织，不便宜。
5b. （review 7，没做）复制一个在某断点改过间距的图层时，`copiedBreakpoints` 只带间距值和 `asStack`，不带 `marginsDropped`：副本里的子图层是新图层，原来记的图层 id 对不上，要带得按副本里的图层重新对应。副本的说明因此不提去外边距。
6. 新措辞（Drop the margins 那行、规则补的那句、`done` 的那句）都是英文，没跑过真 Agent。
7. 整套 e2e 没跑：页面组里别的用到卡片间距的测试（例如 `undo.spec.ts`、`views.spec.ts` 改间距的）这次跑了的都过，没跑到的交给指挥的整套。
