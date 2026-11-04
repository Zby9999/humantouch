# 96: 用 `auto` 外边距居中的自由图层，移动时保持居中

**What to build:** Tailwind 里让自由定位的图层水平居中，除了 `left-1/2 -translate-x-1/2`（ADR 0014 已认作居中），还常写 `inset-x-0 mx-auto w-12`：左右都贴 0、宽度定死，多出来的地方由两边的 `auto` 外边距吃掉（竖直方向是 `inset-y-0 my-auto h-12`）。编辑层不认这种写法是居中，把它当成按左边定位，于是从左往右的页面上（ticket 94 之后从右往左也一样）：容器 400px 宽、图层 50px 宽画在 175，面板的 X 显示 0（写的 `left`）；方向键往左微移一下，`right` 变成 `auto`、两边外边距都算成 0，图层跳到 -20，不是 155；在画布上移动它，写成 `left: 300px; right: auto`，平板、手机视图里它离开中间，正是 ADR 0014 要避免的悄悄改了定位方式。都不报虚假的 ✓（画布上在哪里，改动就记成哪里），但设计师一按方向键就看得到。要做到：这种写法也算居中，面板的 X 显示它画在哪里，移动、微移、改尺寸都保持居中，只改偏离中心多少，和 `translate(-50%)` 居中的一样。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准（「定位方式」），并遵守 docs/adr/ 中的决策（ADR 0011、0014，以及 ticket 79、89、94 的已确认代定）。

**Blocked by:** 无

**Status:** ready-for-agent

- [x] 先复现，用单元测试或剧本（脚本扮演 Agent，不跑真实 Agent）：上面那个例子，从左往右、从右往左各一，竖直方向一个；面板 X（Y）读 0，微移跳到 -20，移动后旁边的视图里不再居中
- [x] 认得 `auto` 外边距居中：那个方向两边都写了值、两边外边距都是 `auto`、尺寸定死时，定位方式是居中。只有一边是 `auto` 的（例如 `ml-auto`，图层被推到另一边），算哪一种由这条线代定，照浏览器把它摆在哪里
- [x] 面板的 X（Y）显示图层画出来的位置，读法照 94（`offsetPlacing` 那一套），不另起一套
- [x] 移动（面板输 X、方向键微移、拖动）、改尺寸、拖进别的 Frame 仍是自由定位、复制：都保持居中，只改偏离中心多少，照 ADR 0014 和 ticket 79 对居中的做法；写进代码的样子由这条线代定（例如保留两边和 `auto` 外边距，只改两边的差），记进代定
- [x] 改动单记下居中的定位方式，改动说明（`claim`）照 79 说清怎么写，`done` 在每个宽度按居中算出该在的位置核对，不报虚假的 ✓
- [x] GLOSSARY「定位方式」、ADR 0014 补上这种居中的写法；spec 相应的地方跟着改
- [x] 没有这种图层的场景，`claim`、`done`、`finish` 的输出逐字不变；切换按钮的包逐字节不变

## 背景

- ticket 94 审查时发现（2026-11-04）：94 的代定第 4 条让从右往左的这种图层按左边处理，和从左往右今天一样；但从左往右本来就有上面三个毛病（94 遗留风险第 2 条是微移跳位）。
- 这种居中写法常见，比 94 修的从右往左两边都写的写法常见得多。88 的场景里没有它（`placement-kept` 的居中用 `translate`），不影响 88。

## 设计师决定（2026-11-04，分诊）

- 选做法 1：开 ticket，照 ADR 0014 把 `auto` 外边距居中也算作居中；不挡 88，现在就可以开线。
- 考虑过的别的做法：同样做但排在 88 后面；只修微移跳位，居中保不保留先不管；不做。
- 先复现，再修。不跑真实 Agent。

## Comments

**实现记录（2026-11-04）**

*结论*

验收项都做到了。自由定位、那个方向两边都写了值、尺寸定死、两边外边距都是 `auto` 的图层（`inset-x-0 mx-auto w-12`，竖直 `inset-y-0 my-auto h-12`），现在算居中（`placedFrom` 多了 `margins: true`），从左往右、从右往左、竖直都一样。面板的 X（Y）显示它画在哪里（写的那一边加上 `auto` 外边距占掉的地方，ticket 的例子是 175）；面板输 X、方向键微移、拖动、改尺寸、拖进别的 Frame、复制都保持居中，只改偏离中心多少；写进代码的是两边一个加、一个减同样多（`left: 0; right: 0` 往右 20px 写成 `left: 20px; right: -20px`，外边距照旧 `auto`）。改动单里仍是 X（Y）改动，`centeredOn` 记中点所在的百分比和多出来的 px；`claim` 说清怎么写，另有一条写法规则「Centered by auto margins」；`done` 在每个宽度按中点核对，Agent 写成从一边算的 px（在窗口宽度对）或去掉 `auto` 外边距，在别的宽度（或所有宽度）报「没有显示」。只有一边外边距是 `auto` 的，照浏览器摆它的那一边定位（代定第 2 条）。读法沿用 94（`offsetPlacing`）和 79（居中、`centeredOn`、`placedAlong`、`done` 的居中核对），没有另起一套。没有这种图层的场景：单测、命令行测试的期望一条没改（只改了 94 那条正是这种图层的测试，见「测试」），bench 的 dry、scripted 前后一样；切换按钮的包逐字节相同。

*先复现*

`edits.browser.test.ts` 新加一组「a layer centered by auto margins (ticket 96)」：页面 800px 宽，board `50vw`（桌面 400、手机视图 390px 宽时 195），`#tag` 用 `left: 0; right: 0; margin-inline: auto; width: 50px` 横向居中，`#bar` 用 `top/bottom: 0; margin-block: auto; height: 50px` 竖向居中（board 高也是 `50vw`）。从左往右、从右往左、竖直三种各跑三条：读 X（Y）、微移 -20、输 X（Y）= 195 和放到 195。先在没改的代码（9f9b4b0）上跑，9 条全部失败：

```
× centered across, left to right: its X or Y reads where it is drawn …            AssertionError: expected +0 to be 175
× centered …, nudged 20px back: it stays centered, 20px off its middle, in every view   AssertionError: expected [ -20, -20 ] to deeply equal [ 155, 52.5 ]
× centered …, its X or Y typed, or let go there: …                                AssertionError: expected [ 'typed', [ 195, 195 ] ] to deeply equal [ 'typed', [ 195, 92.5 ] ]
Tests  9 failed
```

即：面板 X（Y）读 0；微移一下桌面、手机都跳到 -20；输 195 后手机视图里也在 195（board 只有 195 宽，图层跑到 board 外，不再居中）。三种方向的结果一样（从右往左因为 94 的代定第 4 条按左边处理，和从左往右一样）。脚本扮演 Agent 的 `round.spec.ts` 新加那条在没改的代码上也失败（`Expected: 384, Received: 0`，面板 X）。

*三个视图，前后（e2e 量的）*

示例项目的页面，main 里加一个和页面一样宽的 board（高 240），里面一个 80 × 40 的图层 `top: 60px; left: 0; right: 0; margin-inline: auto`，在桌面视图里操作，每步之后撤销回原处再做下一步。board 宽：桌面 848、平板 720、手机 342。数字是图层左边离 board 左边多远（「桌面 / 平板 / 手机」），括号里是中点离 board 中点多远。从左往右、从右往左（board `dir="rtl"`）两次量的数逐个相同。

| 操作 | 改前 | 改后 |
|---|---|---|
| 选中，面板 X | 0（图层画在 384） | 384 |
| 方向键 ← 一下 | -1 / -1 / -1（中点 -385 / -321 / -132，跳到左边） | 383 / 319 / 130（中点 -1 / -1 / -1） |
| 面板输 X（改前输 0 + 20 = 20，改后 384 + 20 = 404） | 20 / 20 / 20（中点 -364 / -300 / -111） | 404 / 340 / 151（中点 +20 / +20 / +20） |
| 在画布上拖动 +100 | 100 / 100 / 100（中点 -284 / -220 / -31；落点按「画出来的位置减用掉的外边距」算，落在 100） | 484 / 420 / 231（中点 +100 / +100 / +100） |
| 右边控制点往右拖 20 | 宽 100，中点 0（`auto` 外边距自己把它摆回中间，右边只出去 10，不跟指针） | 宽 120，中点 0（照居中图层：两边对称地长，和 `translate` 居中的一样，75） |

改前的面板输 X、微移、拖动都写 `left: …px; right: auto`，外边距算成 0，图层离开中间，旁边的视图里也不在中间（ADR 0014 要避免的悄悄改了定位方式）。改后三个视图里中点离 board 中点一直一样多。

*改动单、`claim`、`done`，前后*

ticket 的例子（board 400，图层画在 175），面板输 X = 195：

- 改前：改动单 `x` 0 → 195，样式 `left: 195px; right: auto`，没有 `placedFrom`；说明是普通的「Change the X position from 0px to 195px」。页面写 `left: 195px; right: auto` 时 390px 宽也报「显示了」——画布上在那个宽度也是 195，不算虚假的 ✓，但图层已经不居中了。
- 改后：改动单 `x` 175 → 195，`placedFrom: { edge: "start", centered: true, margins: true }`，`centeredOn: { before: { percent: 50, px: 0 }, after: { percent: 50, px: 20 } }`，样式 `left: 20px; right: -20px`，`margins: { x: 0, y: 0 }`（`auto` 外边距算进了 X，不再另算）。
- 改后的 `claim`（设计意图）：「Move it across, centered between its `left` and `right` by its auto margins as it is: its middle from 50% of its container's width from its left edge to 50% of its container's width from its left edge, and 20px past that. Give its `left` and `right` as much more and less, `left: 20px; right: -20px` (Tailwind's `left-[20px] right-[-20px]`), keeping both and its auto margins. Its X position goes from 175px to 195px as the designer saw it, but do not write that px value with the other side `auto`: as its container grows or shrinks, it stays centered, as far past its middle.」Placement 一行：「the layer is centered across between its `left` and `right` by its auto margins (`margin-inline: auto`, Tailwind's `mx-auto`), and stays so: keep both sides and the auto margins, only how far past the middle it is changes.」写法规则多一条「Centered by auto margins」（有这种改动才打印，原来的「Centered」这时不打印）；「How the page checks」多一句按中点核对。改尺寸的 Placement 一行说「only its width changes, on both sides alike」；拖进别的 Frame、复制时位置写成「centered across between `left: 25px` and `right: -25px` by its auto margins (its middle at 50% of the Frame's width from its left edge, and 25px past that, with its `margin-inline: auto` kept, as the layer is now)」。
- 改后的 `done`（单测量的，页面 800 / 390 宽）：`left: 20px; right: -20px`（`mx-auto` 在）两个宽度都「显示了」；`left: 195px; right: auto` 在 800 显示、在 390「没有显示」（`actual: { value: 195, at: 92.5, margins: true }`），说「At 390px wide, the layer is drawn at 195px from its container's left edge, where the canvas centers it by its auto margins at 92.5px, its middle at 50% of its container's width there, and 20px past that. Keep it centered between its `left` and `right` by its auto margins (…), its sides as the notes give them (`left: 20px; right: -20px`), not a px value from one side, and run …」；去掉 `mx-auto`（`margin-inline: 0`）在 800 就「没有显示」（画在 20，该在 195）；没改代码时「没有显示」（175，该在 195）。`round.spec.ts` 用示例项目的 Tailwind v4（`inset-x-0 … mx-auto`）照这几步走了一遍，结果一样。

*别处看了的*

- **读 X 的几处**：面板 X / Y 和 `absolute` 读数（`offsetOf`）、微移的起点（`freePlaceOf`）都改用同一个 `startOffsetOf`（94 的 `offsetPlacing` 加上 `auto` 外边距占掉的地方，`autoMarginBefore`）；只对自由定位的图层加，外边距不是 `auto` 时加 0，所以别的图层读数不变。
- **拖动的落点**（`drag.ts` 的 `findDrop`）：原来减去用掉的左外边距（175），改成不减 `auto` 的那一份，所以落点就是 X。拖动途中的位移、translate 没动。
- **改动单的外边距**（`edits.ts` 记的 `margins`）：`auto` 外边距算进 X 了，记的外边距去掉这一份（例子里 175 → 0），页面核对和 `done` 的说法不会把它算两次。
- **改尺寸**（`canvas-resize.ts`）：居中图层两边对称地长，只记宽 / 高，照原来的居中路径走，不用改代码。
- **拖进别的 Frame、复制、删除后放回**（`placedAlong`、`absoluteAt`）：`Place.absolute.placed` 记中点（百分比 + px，带 `margins: true`），写的时候两边以 0 为准一加一减（`centeringSides`）。
- **页面核对**（`check.ts`）：X 改动（`lookPosition`）和记了 `placed` 的移动（`placedThere`）都按中点（`offMiddle`）：页面上图层画出来的左边（写的那一边加外边距）要等于记下的中点在那个宽度的位置减半个尺寸。不看 `translate`，不再要求「仍居中」那一步（79 那一步看 translate，这里看画出来的位置，已经包含了）。
- **旁边视图的范围**（`placedOtherwiseAt`、`offsetInLayoutAt`）：这种图层和 `translate` 居中的一样当成居中，不记 `offsetInLayoutAt`；94 审查那条（从右往左、手机视图里这样居中时 `right` 不摆它，记进 `placedOtherwiseAt`）照旧通过。
- **从右往左**：两边外边距都是 `auto` 时浏览器从左往右、从右往左摆的一样（CSS 2.1 10.3.7），所以同一套；中点、X 都从左边量。
- **ADR 0011**：判断只读 `computedStyleMap()`（两边、两个外边距是不是 `auto`）和已有的声明读法（尺寸定死，照 89 代定第 2 条），没有新的排版读取；X 多读一次 `computedStyleMap`。

*做了什么*

- `client/checkable.ts`：`PlacedFrom` 加可选的 `margins: true`；`centeringSides`、`middleOf`（中点和两边互换）、`AUTO_MARGINS`、`AUTO_MARGINS_CLASS`。
- `client/placed-from.ts`：`autoMarginsPlacing`（两边外边距的 `auto` 怎样摆它：both / 只有起点那边 → 按末端 / 只有末端那边 → 按起点）；`placedFrom` 认居中；`endWins` 按它判断一边 `auto` 的；`autoMarginBefore`、`startOffsetOf`、`middleShareOf`、`computedShareOf`、`sizeAlong`；`placedAlong` 记中点。
- `client/property-table.ts`：`offsetOf` 用 `startOffsetOf`；`absoluteAt` 写两边。
- `client/edits.ts`：`marginsCentering`（两边一加一减，记 `centeredOn`、`placedFrom`）；`centeringSide` 不再接这种图层；`marginsPast`。
- `client/structure-edits.ts`：`freePlaceOf` 用 `startOffsetOf`。`client/drag.ts`：落点不减 `auto` 外边距。
- `client/check.ts`：`offMiddle`，`lookPosition`、`placedThere` 用它。
- `change-notes.ts`、`cli.ts`、`writing-rules.ts`：设计意图、Placement、位置的说法，`done` 的 `notAtMiddle`、不是自由定位时的说法，写法规则和「How the page checks」各一条（只在有这种改动时打印）。
- GLOSSARY「定位方式」、ADR 0014（Consequences 一条）、spec（改尺寸、移动、面板 X、拖进别的 Frame、写法规则、核对六处）。

*代定的事（待设计师确认）*

1. **写进代码的样子：两边都保留、外边距照旧 `auto`，两边一个加、一个减同样多**（`left: 0; right: 0` 往右 20px → `left: 20px; right: -20px`，Tailwind `left-[20px] right-[-20px]`；原来是百分比的照旧保留百分比，只改 px）。理由：两边之间的空间不变，所以每个宽度中点都在容器中点往右 20px，和 79 的「保留百分比、只改多出来的 px」同一个意思；只改一边的差（例如 `left: 40px; right: 0`）也能居中偏 20，但两边之间窄了 40px，窄的宽度上图层比空间大时浏览器把左外边距算成 0，图层就不再居中。Tailwind 里读起来是两个 inset 类，Agent 照写不用算。拖进别的 Frame、复制时没有原来的两边可依，写成以 0 为准一加一减（中点在中间往右 25 → `left: 25px; right: -25px`）。
2. **只有一边外边距是 `auto` 的，按另一边定位**：只有起点那边 `auto`（`ml-auto`，两边都写了值、宽度定死），浏览器把它推到右边（CSS 2.1 10.3.7，从左往右、从右往左都一样），就按右边定位：X 显示它画在哪里（例子里 350），移动改 `right`，和 79 按右边定位的一样；只有末端那边 `auto`（`mr-auto`）照旧按左边。这和 94 的代定第 4 条（一边 `auto` 时按左边处理）在 `ml-auto` 上不一样：按左边处理时 X 读 0、图层画在 350，微移一下 `right` 变成 `auto`、外边距算成 0，图层跳到 -20，正是这张 ticket 修的毛病，浏览器的摆法清楚地说按右边。`mr-auto` 和 94 一致；两边都 `auto` 时 94 说「不是哪一边说了算」，这里进一步认作居中。
3. **`done` 按画出来的中点核对，不按写法**：Agent 写成从一边算的 px（另一边 `auto`）时，在窗口宽度对，在别的视图宽度报「没有显示」，`done` 说画布在那个宽度把它居中在哪里，让它保留两边和 `auto` 外边距；去掉了 `auto` 外边距，图层画在写的那一边，各宽度都报「没有显示」。页面靠别的办法画在同一个地方（例如只写两边、外边距是算好的 px，或 board 在各宽度一样宽时写 px），算显示了：画布和页面在那些宽度一样，不是虚假的 ✓。不看 `translate`：Agent 改成 `left-[calc(50%+20px)] -translate-x-1/2` 时报「没有显示」（多报，不是虚假的 ✓）。
4. **面板的 X 读画出来的位置，把 `auto` 外边距占掉的地方算进去，也算进拖动的落点和微移的起点**：只对自由定位的图层，外边距不是 `auto` 时照旧（X 是 `left`，外边距另算），所以没有这种图层的读数不变。在排版里（不是自由定位）带 `mx-auto` 的图层被拖出来变成自由定位时，落点照旧减去用掉的外边距（原来就会跳，没改，见遗留风险）。
5. **改尺寸照 `translate` 居中的做法：两边对称地长**（拖右边控制点 20px，宽 +40），和 75 的居中一致；改前浏览器自己把它摆回中间，宽只 +20、两边各出去 10，不跟指针。

*测试*

- `edits.browser.test.ts` +16 条（test.each 展开后算）：上面 9 条复现（读、微移、输 / 放，三种方向，先在 9f9b4b0 上看着失败）；改动单记什么、再输一次仍是一条改动；改尺寸；只有一边 `auto` 的两条（`ml-auto` 画在 350、读 350、微移改 `right` 0 → 20、手机视图 145 → 125；`mr-auto` 照旧改 X）；`done` 在 800 / 390 宽的五种写法；拖进别的 Frame、撤销、⌘D 复制；`ml-auto` 原地复制记 `right` 0（审查后加，见下）。另改了 94 的一条（「centered by auto margins (`inset-x-0 mx-auto`)」，从左往右、从右往左）：它钉住的正是这里改掉的行为（X 读 0、微移跳到 -20），期望改成 X 读 175、记 `x` 175 → …、微移落在 155。原有别的测试期望一条没改。
- `cli.test.ts` +2 条：`claim`（设计意图、Placement 两种、拖进 Frame 的位置、规则名、「How the page checks」）；`done`（中点不对、不是自由定位）。两条先写、看着失败再改。
- e2e：`move-placement.spec.ts` +1 条（拖动途中在指针下、松手落点、三视图中点、微移、输 X、右边控制点，改动数）；`round.spec.ts` +1 条（脚本扮演 Agent：改动单、`claim`、`done` 没写 / 写成一边的 px / 照说明写 / 去掉 `mx-auto`），在 9f9b4b0 上失败、改后通过。

*按 code-review 修正*

跑了 code-review（Standards、Spec 两个子 agent）。改了的：

- **（Spec，确认的毛病）`ml-auto` 的图层复制、拖进别的 Frame 时 `right` 记错**：`placedAlong` 从 X 算 `right` 时又减了一次用掉的左外边距（X 已经算进去了），⌘D 记成 `right: -350px`。先写测试看着失败（记成 `px: -350`），改成不减 `auto` 那一份，记 `right` 0。
- **（Spec）`autoMarginBefore` 只对自由定位的图层加**：原来对在排版里带 `mx-auto` 的图层也加，会改变它被拖出来时的落点（没有这种居中图层的场景也会变），收回到只管自由定位。
- **（Standards）** 中点公式两处 → `checkable.ts` 的 `middleOf`；`check.ts` 和 `cli.ts` 都叫 `middleOff` 的两个函数改名 `offMiddle`、`notAtMiddle`；`drag.ts` 用共用的 `Axis` 类型；`offMiddle` 说明里写清它算任何外边距（不只是 `auto` 的），所以和 `startOffsetOf` 不同。
- 看了没改：`lookPosition` 的 `byMargins` 布尔参数、各处按 `margins` 分支（照 79 对 `centered` 的做法）；过窄的容器（见遗留风险第 2 条）；`translate` 写法多报（代定第 3 条）。

*全量*

- `pnpm typecheck` 通过。
- `pnpm test`：单测 931 通过、1 跳过（34 个文件）；node 测试 121 条通过。
- `TK_E2E_PORT=5800 pnpm test:e2e`：page 一组 288 通过、1 条失败（`snapping.spec.ts:247` 手机视图里微移，面板 X 没等到出现，`element(s) not found`），project files 一组因此没跑；`snapping.spec.ts` 单独重跑 11 条全过。再用 `--project="project files" --no-deps` 跑 project files 一组：133 通过、1 跳过（含 `round.spec.ts` 新加那条）。切换按钮体积检查在里面，通过。
- bench（`TK_BENCH_PORT=5840`）：改前、改后各跑 `--dry` 和 `--scripted`。dry：24 个场景改前改后都 ✓；scripted：15 个场景改前改后都 ✓。两次的输出（每个场景的 ✓ 行）逐行比对相同。场景里没有这种图层（`placement-kept` 的居中用 `translate`）。

*性能（headless，只作前后对比）*

改前（9f9b4b0）改后（4e3d640）各跑一次 `TK_PERF_HEADLESS=1 TK_PERF_PORT=5810 pnpm test:perf`。改前 15 条全过（`flex.perf.ts:836` 这次也过了）；改后 14 通过、1 失败，失败的是 `flex.perf.ts:836`（⌘Z 时旁边视图是否等着：19 of 20，要 20），单独重跑通过。改后那次机器负载高（load average 十几），进入编辑模式的中位数 228.6ms（p95 568.9），单独重跑 `flex.perf.ts:588` 是 130.5ms（p95 156.2），改前 134.8ms。相关的数（中位数 / p95）：

| | 改前 | 改后 |
|---|---|---|
| 改一个值，圆角，work | 8.7 / 12.0ms | 14.8 / 24.3ms |
| 改一个值，Stack 间距，work | 15.2 / 26.7ms | 15.7 / 25.4ms |
| 按住方向键，圆角，work | 10.5 / 14.0ms | 8.2 / 8.9ms |
| 按住方向键，间距，work | 11.6 / 16.9ms | 9.5 / 10.5ms |
| 拖动卡片 fps | 60 / 60 | 60 / 60 |
| 拖控制点改尺寸 fps | 52.6 / 47.9 | 59.6 / 59.6 |
| 核对认领的一轮，最长一段 | 22.6 / 24.2ms | 12.2 / 14.5ms |
| 进入编辑模式（全部） | 134.8ms | 228.6ms（负载高；单独重跑 130.5ms） |

两次方向不一致，是机器负载的噪声。性能场景里的图层都不是 `auto` 外边距居中的，多出来的读法只在自由定位的图层上走：读一次 X 多一次 `computedStyleMap`（外边距 `auto` 时再读一次算出来的外边距），`placedFrom` 每次多一次 `computedStyleMap`（两个外边距；是 `auto` 时才读两边和走层叠看尺寸），拖动放下时多读一次；拖动途中每一步不多读。没有新的排版读取。

*包体积*

切换按钮 `react.dev.js` 1423 B（gzip -9 822 B，sha256 前 16 位 `c83849f1557e0b1b`）、`chunk-UQJRS7YD.js` 21575 B（gzip -9 9164 B，`cdd6f09dfeaf13fa`），改前改后逐字节相同。编辑层 `editor.dev.js` 328607 → 330693 B（+2086 B），gzip -9 111660 → 112335 B（+675 B）。

*遗留风险*

1. **在旁边视图里定位方式不同**：桌面视图里这样居中、手机视图里页面的断点改成别的（例如 `left: 8px; right: auto`）时，在所有宽度记下的两边一加一减会在手机视图里改那一边的值；`done` 在那里按中点核对，可能报「没有显示」（多报，不是虚假的 ✓）。和 79 的遗留风险第 2 条同一类。
2. **容器比图层加两边还窄时**，浏览器把左外边距算成 0、图层不再居中（CSS 2.1 10.3.7）；读中点（`middleShareOf`）、`done` 都按两边外边距相等算，这时会多报「没有显示」。原来的页面在那个宽度本来就不居中，少见。
3. **`translate` 写法多报**（代定第 3 条）：Agent 改用 `left-[calc(50%+20px)] -translate-x-1/2` 时 `done` 报「没有显示」，说法让它照说明写两边。
4. **在排版里带 `mx-auto` 的图层被拖出来变成自由定位**，落点照旧减去用掉的外边距，会跳（原来就这样，代定第 4 条，没改）。
5. 两边是 `var()` 之类读不出百分比时按算出来的 px 写（`computedStyleMap` 一般能读出 Tailwind v4 的 `calc(var(--spacing) * 0)`，算出来就是 px，不受影响）；读一次的记录会过时；一个视图代表一整段宽度；没跑真实 Agent（同 79、94）。
