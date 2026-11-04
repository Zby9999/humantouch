# 96: 用 `auto` 外边距居中的自由图层，移动时保持居中

**What to build:** Tailwind 里让自由定位的图层水平居中，除了 `left-1/2 -translate-x-1/2`（ADR 0014 已认作居中），还常写 `inset-x-0 mx-auto w-12`：左右都贴 0、宽度定死，多出来的地方由两边的 `auto` 外边距吃掉（竖直方向是 `inset-y-0 my-auto h-12`）。编辑层不认这种写法是居中，把它当成按左边定位，于是从左往右的页面上（ticket 94 之后从右往左也一样）：容器 400px 宽、图层 50px 宽画在 175，面板的 X 显示 0（写的 `left`）；方向键往左微移一下，`right` 变成 `auto`、两边外边距都算成 0，图层跳到 -20，不是 155；在画布上移动它，写成 `left: 300px; right: auto`，平板、手机视图里它离开中间，正是 ADR 0014 要避免的悄悄改了定位方式。都不报虚假的 ✓（画布上在哪里，改动就记成哪里），但设计师一按方向键就看得到。要做到：这种写法也算居中，面板的 X 显示它画在哪里，移动、微移、改尺寸都保持居中，只改偏离中心多少，和 `translate(-50%)` 居中的一样。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准（「定位方式」），并遵守 docs/adr/ 中的决策（ADR 0011、0014，以及 ticket 79、89、94 的已确认代定）。

**Blocked by:** 无

**Status:** done

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

**按独立审查修正（2026-11-04）**

指挥另跑了独立审查（effort high，探针在 scratchpad 的 `review/`），在同一条分支上修（指挥先把 main 合进来，020018e，只动了 bench 和 ticket 文件，和本线不重叠）。每条源码修正都先写测试、看着失败再改；有的在本线之前的源码（9f9b4b0）上也跑了。

*找到的和改的*

1. **新的虚假 ✓（中高，确认；本线引入，另有一个 9f9b4b0 就有的洞）**：
   - 本线让 `placedFrom` 对 `auto` 外边距居中的图层也答 `centered: true`，于是 `check.ts` 的「仍居中」（原 `stillCentered`）把它也当成 `translate` 居中。`translate` 居中的图层移动后，页面去掉 translate、改写 `right: 0; margin-inline: auto`，`done` 报「显示了」，图层却画在别处：探针 P11（拖出再拖回，board 400，画布 200，页面 290），P1b（X +20，board 300，画布 150，页面 170）。改：判断改名 `centeredByTranslate`，要 `centered && !margins`。
   - 9f9b4b0 就有的：拖出再拖回、记了 `placed` 的移动只比那一边的值（`placedThere` 的 `sideOff`），translate 留着、再加 `right-0 mx-auto`，那一边仍是 `calc(50% + 20px)`，报「显示了」，图层画在 270（该在 200）。X 改动（`lookPosition`）在非窗口宽度也一样（那里外边距「不知道」，只比那一边）。改：那一边所在的那条边上有 `auto` 外边距在占地方（`autoMarginTakesRoom`），那一边就没把图层摆在它给的位置，算「没有显示」；`placedThere` 和 `lookPosition` 都这样。没照指挥说的「把外边距加进去比」：79 的代定第 7 条（设计师已确认）定了记 `placed` 的方向只比那一边、不比外边距，而 `right` / `bottom` 那边画布也没记外边距；只拦 `auto` 外边距已经堵上这个洞，别的写法不变（见代定第 7 条）。
   - 测试：`edits.browser.test.ts` 一条（X +20 页面去 translate 加 `mx-auto`；拖出再拖回，去 translate、留 translate 加 `mx-auto`、照写三种）。在改前的本线代码（020018e）上失败（`expected 'shown' to be 'not shown'`）；在 9f9b4b0 上「留 translate 加 `mx-auto`」那一句失败（就是那个旧洞），其余两句在那里本来就对。
2. **旁边视图里不这样居中时，移动让图层在那里跳（中，确认）**：从右往左、手机视图里页面的断点把它改成 `right: auto; left: 16px; margin-inline: 0`，在桌面视图里移动它，写 `left: 20px; right: -20px`，手机视图里两边都写了值、宽度定死，从右往左 `right` 说了算，图层从 16 跳到 165（9f9b4b0：16 → 20）。改：移动第一次记下时，看每个旁边的视图里这个方向是不是也靠两边的 `auto` 外边距居中（`viewsUncentered`，照 `viewsMovedOtherwise` 读计算样式，不排版）；有不是的，就只写起点那一边、加两倍（`left: 40px`），终点那一边照各个宽度原样不写，那些视图的范围记进改动（`uncenteredAt`），`done` 在那些宽度按写的 `left` 核对（`offSide`，外边距知不知道照 `drawnThere`）。桌面视图仍居中、中点往右 20；手机视图照 `left` 摆，从 16 到 40，从左往右、从右往左一样。改动说明写「Give its `left` twice as much more, `left: 40px` (Tailwind's `left-[40px]`), keeping its `right` and its auto margins as the page has them at each width: where the page does not center it so, below 800px, it is placed by that `left`.」；`done` 在那里说「…where the canvas places it by its `left`, 40px, as it does not center it by its auto margins there: give it that `left` at this width too…」。见代定第 6 条。测试：`edits.browser.test.ts` 从左往右、从右往左各一条（三视图位置、改动单、页面在 1000 / 390 宽的核对）；改前从左往右是 `[195, 20]`、从右往左 `[195, 165]`，都失败；`cli.test.ts` 一条（说明和 `done` 的说法），改前说明里是 `right: undefined`，失败。
3. **容器比图层加两边还窄时 `done` 永远不过（中，确认）**：原来 `done` 总按两边外边距相等算该在哪里；浏览器在剩下的空间是负的时候，横向不平分（CSS 2.1 10.3.7：从左往右左外边距取 0，从右往左右外边距取 0、左外边距吃掉负数），于是页面和画布都画在 20（从右往左都在 -35），`done` 却等 -7.5，报「没有显示」。改：`offMiddle` 按画布的两边（改动写的 `left` / `right`；只写了起点那一边时，从中点推出终点那一边）在那个宽度照浏览器的规则算该画在哪里；竖向（CSS 2.1 10.6.4）没有这条例外，负的也平分，在 Chrome 里量过，和画布、页面一致。测试：从左往右、从右往左、竖向各一条（图层 250 宽 / 高，手机视图的 board 195）：页面照画布写时在 390、1000 都「显示了」；改前横向两条失败，竖向本来就过。
4. **（不修，记进遗留风险）`inset-x-0 mx-auto max-w-*`、宽度 `auto`**：不算居中（「定死」照 94 代定第 2 条按声明读）；X 读 175，微移写 `left: 155px; right: auto`，宽度也跟着缩。指挥会向设计师提后续 ticket。
5. **性能（低）**：`findDrop` 每次指针移动都跑，本线加的读 `auto` 外边距（`absolute()` + `computedStyleMap()`）每步两次。改：拖动开始时读一次（`DragSession.autoMargins`），`findDrop` 收它。更正上面实现记录「性能」一节的话：本线第一版拖动途中每一步多读两次，不是「每一步不多读」；这次修正后才是。另外更正 94 合并前的一句「`autoMargin` 只在从右往左时才读」：本线之后，`placedFrom` / `endWins` 在从左往右时，对每个两边都写了值的自由图层也读 `computedStyleMap()`（只读样式，不排版）。
6. **说法（低）**：
   - 移动的 `done`，记了 `placed` 但位置不对、或不是自由定位时，`auto` 外边距居中的那个方向原来说「check its `position`, `left` and `top`」；改为「`left` and `right` with its `margin-inline: auto`, and `top`」（`sidesToCheck`，两处共用）。`cli.test.ts` 原有那条的期望改了，新加一句，改前失败。
   - 下一轮重读改前（`readAgain`）：原来 `auto` 外边距居中的改动不更新 `centeredOn.before`，说明仍说「its middle from 50%…」。改：`offMiddle` 的 `actual` 带上页面上图层中点现在在哪里（`share`：仍这样居中的，照两边读成百分比加 px；否则画出来的 px），`readAgain` 照 79 的做法换上。浏览器测试三处期望加 `share`，改前失败；`cli.test.ts` 加一条重读的。
7. **（不修，记进遗留风险）解散 Frame**：读了 `structure-edits.ts` 1050–1060：每个子图层的位置是画出来的边框减去算出来的外边距，`auto` 外边距居中的子图层那里减掉的是用掉的 175px，再写 `left: x; right: auto`，`auto` 外边距算成 0，图层往左跳 175。9f9b4b0 一样（这条线没碰这里）。
8. **整理（低）**：`extentOf` 把已经读的 `getComputedStyle` 传给 `sizeAlong`；`centeringSides` 的说明缩短。

*代定的事，更新后*

1. **写进代码的样子**（同上）：两边都保留、外边距照旧 `auto`，一个加、一个减同样多；拖进别的 Frame、复制时以 0 为准一加一减。
2. **只有一边外边距是 `auto` 的，按另一边定位**（同上）。
3. **`done` 按画出来的位置核对，不按写法**（同上），并且照浏览器在空间不够时的摆法（审查后，见第 3 条）。
4. **面板的 X 把 `auto` 外边距占掉的地方算进去**（同上），拖动时在开始时读一次（审查后）。
5. **改尺寸两边对称地长**（同上）。
6. **（新）旁边有视图不这样居中时，只写起点那一边、加两倍**：目标是不给那个视图添一个它原来没有的、会把它摆到别处的 `right`（ADR 0014，从右往左时它说了算）。那个视图里图层照写的 `left` 摆，和任何在所有宽度改的 X 一样，`left` 换成新写的值（例子里 16 → 40；9f9b4b0 是 16 → 20，那时写的就是 X）；不写成断点改动，因为桌面视图改的照例在所有宽度。代价：桌面视图里两边之间窄了 40，窄的宽度上比原来早一点不再居中（代定第 1 条说的那种），只在这种页面上。从左往右、从右往左一样（从左往右时两边都写本来也不跳，但为了一条规则，同样只写 `left`）。
7. **（新）`translate` 居中、按右边定位的，`auto` 外边距在那一边占地方就算没显示，别的外边距照旧不比**：照 79 已确认的代定第 7 条，记 `placed` 的方向只比那一边；只拦会把图层摆到别处的 `auto` 外边距（`ml-auto` / `mx-auto` 之类）。X / `right` 改动在知道画布外边距的宽度照旧连外边距一起比，在别的宽度原来只比那一边，现在多拦这一种。

*遗留风险，更新后*

1. 旁边视图里定位方式不同（审查第 2 条修了「不这样居中」那种）：旁边视图里也居中、但两边的写法不同（例如手机视图 `inset-x-4`），照所有宽度写的两边，手机视图里两边被改成桌面的值，中点照算，不跳但两边变了；`done` 按中点核对，Agent 照写就过。
2. ~~容器太窄~~（审查第 3 条已修）。
3. `translate` 写法多报（代定第 3 条）。
4. 在排版里带 `mx-auto` 的图层被拖出来变成自由定位，落点照旧减去用掉的外边距，会跳（原来就这样）。
5. **（新，审查第 4 条）`inset-x-0 mx-auto max-w-*`、宽度 `auto` 不算居中**：X 读 175，微移写 `left: 155px; right: auto`，宽度跟着缩成内容宽。照 94 代定第 2 条（「定死」按声明读）；指挥会向设计师提后续。
6. **（新，审查第 7 条）解散 `auto` 外边距居中的子图层所在的 Frame**，子图层往左跳用掉的外边距那么多（9f9b4b0 就这样）。
7. 读不出百分比的两边按算出来的 px 写；读一次的记录会过时（`uncenteredAt` 也是第一次记下时读）；一个视图代表一整段宽度；没跑真实 Agent。

*全量（最后的代码）*

- `pnpm typecheck` 通过。
- `pnpm test`：单测 939 通过、1 跳过（34 个文件）；node 测试 121 条通过。
- `TK_E2E_PORT=5800 pnpm test:e2e`：page 一组 287 通过、2 条失败：`off-canvas.spec.ts:173`（已知不稳），和本线自己的 `move-placement.spec.ts:196`（第一步「三个视图里中点都是 0」5 秒内没等到旁边的视图跟上，机器忙时那条跑了 14.1s）；两条单独重跑都过，`move-placement.spec.ts:196` 再用 `--repeat-each=4` 跑 4 次全过。project files 一组因此没跑，用 `--project="project files" --no-deps` 补跑：133 通过、1 跳过（含 `round.spec.ts` 那条和切换按钮体积检查）。
- bench（`TK_BENCH_PORT=5840`）：`--dry` 24 个场景都 ✓，`--scripted` 15 个都 ✓，和 9f9b4b0 上跑的输出逐行比对相同。

*性能（headless，只作前后对比）*

`TK_PERF_HEADLESS=1 TK_PERF_PORT=5810 pnpm test:perf` 在最后的代码上：15 条全过。中位数 / p95，和 9f9b4b0 那次比：改一个值 圆角 work 10.4 / 14.2ms（改前 8.7 / 12.0）、间距 10.6 / 17.0ms（15.2 / 26.7）；按住方向键 圆角 8.5 / 13.8ms（10.5 / 14.0）、间距 13.2 / 15.5ms（11.6 / 16.9）；拖动卡片 60 fps（60）；拖控制点改尺寸 59.6 fps（52.6）；核对认领的一轮最长一段 15.4 / 16.5ms（22.6 / 24.2）；进入编辑模式 133.7ms（134.8）。前后在同一水平，方向不一致是噪声；性能场景里没有这种图层。

*包体积（最后的代码）*

切换按钮 `react.dev.js` 1423 B（gzip -9 822 B，sha256 前 16 位 `c83849f1557e0b1b`）、`chunk-UQJRS7YD.js` 21575 B（gzip -9 9164 B，`cdd6f09dfeaf13fa`），和 9f9b4b0 逐字节相同。编辑层 `editor.dev.js` 328607 → 332022 B（和 9f9b4b0 比 +3415 B；上一版 330693），gzip -9 111660 → 112856 B（+1196 B；上一版 112335）。

**合并前（2026-11-04，指挥）**

两轮审查都跑了：实现时的 code-review（Standards、Spec，修了 `ml-auto` 副本把外边距算两次那条），和指挥另跑的独立审查（effort high），后者要求修的六条（新的虚假 ✓、旁边视图不这样居中时跳到另一边、容器太窄时 `done` 永远过不了、拖动每步多读、`done` 的用词、重跑后说明里的中点）都已先写测试、看着失败再改（见上一节）；`max-w-*` 宽度 `auto` 不算居中、解散 Frame 时子图层跳，两条按指挥的意思记进遗留风险，没改。前一条和 94 已确认的代定 2 一致，要不要开后续 ticket 交设计师定。

分支在 020018e 同步了 main（带进 88 的第一条开跑前检查，不碰 `src`），之后 main 没有新提交。指挥在最后的代码上自己跑了：`pnpm typecheck` 通过；`pnpm test` 单测 939 通过、1 跳过，node 121 条通过。e2e 用实现者在同一份代码（b5736eb）上的全量：page 一组 287 通过、2 条失败（`off-canvas.spec.ts:173` 已知会抖，本线新加的 `move-placement.spec.ts:196` 在负载下等旁边视图超时），指挥把这两条单独各重跑 3 遍，6 条全过；project files 一组 `--no-deps` 133 通过、1 跳过，切换按钮体积检查在里面，通过。`bench:agents --dry` 24 ✓、`--scripted` 15 ✓，✓/✗ 行和 9f9b4b0 逐行相同。性能 headless 15/15 通过（`flex.perf.ts:836` 这次改前、改后的最后一轮都过了，只在第一版改后那轮失败一次、单独重跑通过）。切换按钮的包逐字节相同；`editor.dev.js` +3415 B（gzip -9 +1196 B）。

代定 1–7 见「代定的事，更新后」，其中第 2 条（只有 `ml-auto` 的按右边定位）和 94 已确认的代定 4 在这一种写法上不同，第 6 条（旁边视图不这样居中时只写 `left`、加两倍）会让那个视图里图层挪得比设计师在桌面视图里挪的多，请设计师重点看这两条。
