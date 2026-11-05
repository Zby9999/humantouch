# 97: `auto` 外边距的图层，按方向键、拖出排版、解散 Frame 时不跳、不缩

**What to build:** ticket 96 让 `inset-x-0 mx-auto w-12` 这种宽度定死、靠两边 `auto` 外边距居中的自由图层保持居中，但还有三处和 `auto` 外边距有关的跳位，设计师按一下方向键或拖一下就看得到：

1. **宽度没写死、只有最大宽度的**（`fixed inset-x-0 mx-auto max-w-md`，toast、对话框、横幅常这样居中）：浏览器在容器比它宽时把它居中，编辑层不认作居中（96 只认宽度定死的，照 89 的代定第 2 条按声明读「定死」）。例如容器 400px、`max-w` 50px，图层画在 175，面板 X 读 175；方向键往左一下写成 `left: 155px; right: auto`，宽度跟着缩成内容那么宽，平板、手机视图里也不再居中。
2. **在排版里带 `mx-auto` 的图层**（例如居中的内容块 `mx-auto w-64`）拖出来变成自由定位：落点减去用掉的外边距，图层不落在松手的地方，往左跳那么多。
3. **解散 Frame**：Frame 里有一个靠 `auto` 外边距居中的子图层，解散后它写成 `left: x; right: auto`，`auto` 外边距算成 0，往左跳用掉的外边距那么多。

2、3 在 96 之前的代码上就这样。都不报虚假的 ✓（画布上在哪里，改动就记成哪里），但和 Figma 不一样。要做到：三处都不跳、不缩，第 1 种在浏览器把它居中的视图里也算居中，和 96 的一样保持居中。

另外，96 新加的 e2e `move-placement.spec.ts:196`（三个视图里中点都是 0）在机器忙时等旁边的视图超时过一次，没用 ticket 93 的写法，一起改稳。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准（「定位方式」），并遵守 docs/adr/ 中的决策（ADR 0011、0014，以及 ticket 79、89、94、96 的已确认代定）。

**Blocked by:** 无（不挡 88；开线时间见「设计师决定」）

**Status:** done

- [ ] 先复现，用单元测试或剧本（脚本扮演 Agent，不跑真实 Agent）：三处各一个，第 1 处从左往右、从右往左、竖直方向（`inset-y-0 my-auto max-h-*`）各一；在没改的代码上看着失败
- [ ] 第 1 处：在浏览器把它居中的视图里算居中，面板的 X（Y）显示画出来的位置；移动（面板输 X、方向键微移、拖动）、改尺寸、拖进别的 Frame、复制都保持居中，照 96 的写法（两边一加一减，外边距照旧 `auto`），宽度不缩。容器比它窄、它撑满的视图里怎样算、改尺寸写 `width` 还是 `max-width`，由这条线代定，照浏览器把它摆在哪里，记进代定
- [ ] 第 2 处：拖出排版变成自由定位的图层落在松手的地方，在每个视图里都不跳
- [ ] 第 3 处：解散 Frame 后子图层留在画出来的地方，不跳；之后它怎么定位（还居中、按一边）由这条线代定，照 ADR 0014 不悄悄改定位方式
- [ ] 改动单、`claim`、`done` 照 96 和 79：说清怎么写，`done` 在每个宽度按该在的位置核对，不报虚假的 ✓
- [ ] `move-placement.spec.ts:196` 照 93 的写法（`canvasInPlace`、`steadyBox`、`expect.poll`）改稳，测的内容不变；本线新加的 e2e 也照这个写法
- [ ] GLOSSARY「定位方式」、ADR 0014、spec 需要时跟着改
- [ ] 没有这几种图层的场景，`claim`、`done`、`finish` 的输出逐字不变；切换按钮的包逐字节不变

## 背景

- 96 的遗留风险第 4、5、6 条（独立审查第 4、7 条），2026-11-04 合并后提给设计师。
- 88 的场景里没有这几种图层（`placement-kept` 的居中用 `translate`），不影响 88。

## 设计师决定（2026-11-04，分诊）

- 选做法 1：开一张 ticket，三处跳位和那条 e2e 一起修；不挡 88。
- 等 88 的真实跑完、机器空下来再开线（88 要在机器空的时候跑）。
- 考虑过的别的做法：只修第 1 处，另两处留作风险；先不开，三处都记作风险。
- 先复现，再修。不跑真实 Agent。

## Comments

**实现记录（2026-11-05）**

*结论*

三处都不跳、不缩了。第 1 处：自由定位、两边都写了值、两边外边距都是 `auto`、尺寸没写（`auto`）却写了最大值（`inset-x-0 mx-auto max-w-md`，竖直 `inset-y-0 my-auto max-h-*`）的图层，现在算 `auto` 外边距居中（`placedFrom` 多了 `held: true`），从左往右、从右往左、竖直都一样；面板 X（Y）显示画出来的位置，移动（面板输 X、方向键、拖动）、拖进别的 Frame、复制都照 96 的写法两边一加一减、外边距照旧 `auto`，不写宽度，所以不缩；改尺寸（控制点、面板的 W / H 输 Fixed）改的是 `max-width`（`max-height`），宽度照旧 `auto`，控制点拖动时也不再被原来的最大值挡住。第 2 处：在排版里带 `auto` 外边距的图层（Stack 里的 `mx-auto w-64`）拖进 Frame 变成自由定位，落点不再减去这份外边距，落在松手的地方，写的 `left` 在每个视图里一样。第 3 处：解除分组（⌘⇧G）一个 Frame，里面靠 `auto` 外边距居中的子图层从画出来的位置算，放进外面的容器后照「拖进别的 Frame」仍居中，三个视图都不动；解散 Stack（⌥⇧A）时 `mx-auto` 的子图层也按画出来的位置记，按左边、上边定位，和别的子图层一样。读法沿用 96（`autoMarginsPlacing`、`marginsCentering`、`placedAlong`、`absoluteAt`、`offMiddle`）、94（`offsetPlacing` / `startOffsetOf`）、79（居中的保持居中），只在「认不认作居中」那一处加了最大值这一种，没有另起一套；`done` 的核对代码（`check.ts`）一行没改，按中点核对本来就对这种图层成立。

*先复现（单测，在没改的代码 14159a2 上跑）*

`edits.browser.test.ts` 新加一组「layers whose auto margins take up room do not jump (ticket 97)」：页面 800 宽，board `50vw`（桌面 400、手机视图 195），`#tag` `left: 0; right: 0; margin-inline: auto; max-width: 50px`，`#bar` 竖直方向同样。在 14159a2 上 17 条全部失败，摘录：

```
× held by its maximum, centered across, left to right …: nudged 20px back …   expected [ [ 155, 23.765625 ], … ] to deeply equal [ [ 155, 50 ], [ 52.5, 50 ] ]
× … down …                                                                    expected [ [ 155, +0 ], [ 155, +0 ] ] to deeply equal [ [ 155, 50 ], [ 52.5, 50 ] ]
× … resized …                                                                 expected [ [ 175, 50 ], [ 72.5, 50 ] ] to deeply equal [ [ 165, 70 ], [ 62.5, 70 ] ]
× … resized by its right handle on the canvas …                               expected { width: 50 } to deeply equal { width: 70 }
× held by a maximum wider than the phone's board …                            expected [ Array(2) ] to deeply equal [ [ 30, 300 ], [ -20, 195 ] ]
× … moved into another Frame, or copied …                                     expected [ 'other', [ 100, 50 ], '50px' ] to deeply equal [ 'other', [ 100, 50 ], '' ]
× … moved: the page shows it where its middle is …                            expected { outcome: 'not shown', … } to deeply equal { outcome: 'shown' }
× in a Stack's layout, centered by its auto margins, dragged out into a Frame  expected { …, x: 10, y: 30 } to match object { …, x: 185, y: 30 }
× a Frame dissolved, … as wide as it is set                                   expected [ [ +0, 50 ], [ -102.5, 50 ] ] to deeply equal [ [ 175, 50 ], [ 72.5, 50 ] ]
× a Stack dissolved, …                                                        expected [ [ +0, 50 ], [ +0, 50 ] ] to deeply equal [ [ 175, 50 ], [ 175, 50 ] ]
```

（第一条：微移后宽度缩成 23.8，手机视图也在 155；第 2 处：落点 10，松手在 185；解散后跳到 0。）`cli.test.ts` 新加的 `claim`、`done` 两条，把三份说明的源码（`change-notes.ts`、`cli.ts`、`writing-rules.ts`）换回 14159a2 跑，都失败（第三条「没有最大值时一个字都不多」是护栏，本来就过）。审查后加的「面板输 W」一条，在审查前的代码上失败（手机视图宽 260，不再撑满）。

*改前 / 改后，三个视图（e2e 量的）*

示例项目的页面，main 里加一个和页面一样宽的 board（高 240）。board 宽：桌面 848、平板 720、手机 342。数字是「桌面 / 平板 / 手机」里图层左边离容器左边多远，括号里是宽度和中点离容器中点多远；第 1 处每步之后撤销回原处再做下一步，在桌面视图里操作。量的脚本（scratchpad 里的 `zz-measure-97.spec.ts`）改前改后各跑一次，没有提交；提交的 e2e 是下面「测试」里那几条。

第 1 处：`top: 60px; left: 0; right: 0; margin-inline: auto; max-width: 400px`（宽度 `auto`，桌面、平板居中，手机撑满）。

| 操作 | 改前 | 改后 |
|---|---|---|
| 选中，面板 X | 224（画在 224 / 160 / 0，宽 400 / 400 / 342，中点 0） | 224（同左） |
| 方向键 ← 一下 | 223 / 223 / 223，宽 0 / 0 / 0（写成 `left: 223px; right: auto`，宽度缩成内容宽，这个空 div 是 0；中点 -201 / -137 / +52） | 223 / 159 / -1，宽 400 / 400 / 342（中点 -1 / -1 / -1） |
| 面板输 X = 244 | 244 / 244 / 244，宽 0（中点 -180 / -116 / +73） | 244 / 180 / 20，宽 400 / 400 / 342（中点 +20 / +20 / +20） |
| 拖动 +100 | 324 / 324 / 324，宽 0（中点 -100 / -36 / +153） | 324 / 260 / 100，宽 400 / 400 / 342（中点 +100 / +100 / +100） |
| 右边控制点往右拖 20 | 宽 400 / 400 / 400（被 `max-width` 挡住，没长；写成 `width: 400px`，手机视图里不再撑满，伸出 board，中点 +29） | 宽 440 / 440 / 342（写 `max-width: 440px`，两边对称地长，中点 0 / 0 / 0；手机仍撑满） |

第 2 处：一个和页面一样宽的 Stack（`flex-direction: column`），里面 `margin-inline: auto; width: 80px` 的图层（画在 384 / 320 / 131），下面是 board；把它往右 30、往下拖进 board（松手时图层左边离 board 左边 414）。

| | 改前 | 改后 |
|---|---|---|
| 落点（`left`） | 30 / 30 / 30（减去了用掉的外边距 384，往左跳 384） | 414 / 414 / 414（松手的地方；写的 `left` 在所有宽度一样，同从排版拖进 Frame 的任何图层） |

第 3 处：board 里一个 Frame（`left: 0; right: 0; top: 40px`，和 board 一样宽），里面 `top: 20px; left: 0; right: 0; margin-inline: auto; width: 80px` 的图层（画在 384 / 320 / 131，中点 0）。

| | 改前 | 改后 |
|---|---|---|
| ⌘⇧G 解除分组 Frame | 0 / -64 / -253（中点 -384：放过去时减了用掉的外边距，再按居中写两边，中点偏 384） | 384 / 320 / 131（中点 0 / 0 / 0，仍居中，在 board 里离上边 60） |
| ⌥⇧A 解散 Stack（Stack 内边距 8，`mx-auto` 的子图层） | 8 / 8 / 8（往左跳 376） | 384 / 384 / 384（桌面视图里不动；按左边定位，平板、手机里在 384，和解散 Stack 时别的子图层一样，见代定第 5 条） |

*改动单、`claim`、`done`*

- 改动单：移动记 X 改动，`placedFrom: { edge: "start", centered: true, margins: true, held: true }`，样式只有两边（`left: 20px; right: -20px`），没有宽度；改尺寸记 `maxWidth`（`maxHeight`）改动，样式 `max-width: 70px`，带同样的 `placedFrom`；拖进别的 Frame、复制时 `Place.absolute.placed` 带 `held: true`，样式不写宽度。
- `claim`：设计意图照 96（「Move it across, centered between its `left` and `right` by its auto margins …」，没改）。Placement 一行多一句「its width `auto`, held by its `max-width`」；改尺寸那条说「only its `max-width` changes, on both sides alike; give it no width, so it still fills the room its sides leave where that is less.」；拖进别的 Frame 的位置写「with its `margin-inline: auto` kept, its width `auto`, held by its `max-width`, as the layer is now」。写法规则多一条「Held by a maximum」（这一轮有这种改动才打印）：「resized, change its maximum, not its width; moved, give it no width either …」。
- `done`：照 96 按中点核对（`offMiddle`，尺寸取页面上在那个宽度画出来的大小，撑满的宽度上就是两边之间的空间）。照说明写两边：800、390 宽都「显示了」；写成 `left: 195px; right: auto`：图层缩成内容宽，390 宽「没有显示」（800 宽也一样，因为中点跟着宽度变了）；没显示时的说法在 96 那句里多「its width `auto`, held by its `max-width`」。没有虚假的 ✓。
- 没有这几种图层的场景：`claim`、`done`、`finish` 逐字不变（单测、命令行测试原有期望一条没改；bench 见「全量」）。

*代定的事（待设计师确认）*

1. **容器比最大值窄、图层撑满的视图里，也算居中，照浏览器摆它的样子**：这时浏览器让它撑满两边之间（CSS 2.1 10.3.7、10.4），中点仍在两边正中，所以和居中的视图用同一套：移动两边一加一减（撑满的视图里两边一起挪，宽度不变），读和写都按声明，不排版（ADR 0011）。「宽度没写」按声明读，照 89 代定第 2 条；`max-w-full` 这类永远撑满的也算（这时等于两边定位，两边一加一减和按左边定位落点一样，只是说明里多那句 held）。
2. **改尺寸写 `max-width`（`max-height`），不写 `width`**：控制点拖动、面板 W / H 输 Fixed 都是。写 `width` 会让它在窄的视图里不再撑满、伸出容器（改前的手机视图就是这样），等于悄悄改了定位方式；写最大值时宽的视图里两边对称地长、窄的视图里照旧撑满。拖动时不再被原来的最大值挡住（那个最大值就是要改的东西）。面板 W 选 Hug / Fill 照旧。
3. **拖进别的 Frame、复制时不写宽度**：原来移动到别处会写上 `width: 50px`（画出来的大小），宽度就定死了；这种图层不写，宽度照旧 `auto`。
4. **第 2 处：落点不减 `auto` 外边距，对所有 `auto` 外边距都这样**：在排版里 `margin-left: auto` 的图层（`mx-auto`，也包括被 `ml-auto` 推到另一边的）变成自由定位、按左边定位后，`auto` 外边距算成 0，所以落点就是 `left`。同一条规则（`marginsAside`）也用在方向键微移 Frame 普通排版里的图层、剪切 / 复制后粘贴进 Frame 的落点（`spotIn`）上。「每个视图都不跳」的意思是：写的 `left` 在所有宽度一样，桌面视图里落在松手处，旁边的视图里也在那个 X（和从排版拖进 Frame 的任何图层一样，不在旁边视图里另算居中）。
5. **第 3 处：解除分组的 Frame 里自由定位、居中的子图层仍居中；解散 Stack 时 `mx-auto` 的子图层按左边**：解除分组时子图层换到外面的容器，照 ADR 0014 和 79 代定第 8 条，定位方式跟着图层走，所以仍靠 `auto` 外边距居中，按画出来的位置算中点，三个视图都不动。解散 Stack 时子图层原来在排版里、没有定位方式，spec 写的是「全部改为自由定位并固定在原位」，所以照别的子图层按左边、上边定位在画出来的位置（`mx-auto` 留在代码里，按一边定位后它算成 0）；代价是平板、手机视图里它不再居中（和 Stack 里靠对齐居中的子图层解散后一样）。

*测试*

- `edits.browser.test.ts` +19 条（test.each 展开后）：第 1 处 13 条（读和微移、输 X / 放下并记下的样子、改尺寸，各三种方向；控制点不被最大值挡住；手机撑满时微移；拖进别的 Frame、复制不写宽度；`done` 在 800 / 390 宽；审查后加的面板输 W），第 2 处 1 条（`findDrop` 的落点、放下后两个视图的位置），第 3 处 3 条（解除分组：宽度定死、靠最大值卡住；解散 Stack）。原有测试期望一条没改。
- `cli.test.ts` +3 条：`claim`（Placement 三种、规则）、没有最大值时一个字都不多、`done` 的说法。
- e2e：`move-placement.spec.ts` 96 那条按 93 的写法改（`toHaveValue`、`expect.poll`，`pickTag` / `dragTag` / 控制点用 `steadyBox`，测的内容不变），+3 条（第 1 处的三视图：X、微移、输 X、拖动、右边控制点，宽度 400 / 400 / 342 → 440 / 440 / 342；第 2 处拖进 board 在三视图都在 414；第 3 处解除分组后三视图中点 0）。这四条 `--repeat-each=5` 20 次全过。

*按 code-review 修正*

跑了 code-review（Standards、Spec 两个子 agent，effort medium）。改了的：

- **（Spec，确认）面板输 W / H 没走代定第 2 条**：原来只有控制点改尺寸改道写 `max-width`，面板输 Fixed 宽度仍写 `width: Npx`，图层就定死了，手机视图里不再撑满（先写测试，看着失败：手机视图宽 260，该 195）。改为在 `setValue` 里统一改道（`heldMaxOf`），控制点和面板同一条路。原来那样，Placement 一行和「Held by a maximum」规则也会说法打架，这下不会出现。
- **（Standards）`heldCentered` 原来经 `placedFrom`**，不是这种图层时会量图层的框（`getBoundingClientRect`），每一步改尺寸都多一次排版读取；改为只读样式（`autoMarginsPlacing` + `heldByMax`，ADR 0011）。`keptSize` 也套上 `asShown`，和 `edits.ts` 一致。
- **（Standards）重复**：「its width `auto`, held by its `max-width`」三处共用 `heldWords`；`writing-rules.ts` 的两个「移动、复制的 `placed` 里有没有这种」共用 `placedSo`；删掉不再用的 `autoMarginsBefore`、多余的空行，折好一行过长的说明。
- 看了没改：`PlacedFrom` 用可选的 `held`，不改成标签联合（和 96 的 `margins` 同一写法）；`marginsAside` 的名字（说明里写清了「它被摆在其外的外边距，`auto` 的不算」）；`spotIn` 对所有调用方都不减 `auto` 外边距（剪切 / 复制粘贴、在 Frame 普通排版里微移也受益，记进代定第 4 条）；只有一边 `auto` 加最大值的（见遗留风险第 1 条）。

*全量*

- `pnpm typecheck` 通过。
- `pnpm test`：单测 960 通过、1 跳过（34 个文件）；node 测试 123 条通过。
- `TK_E2E_PORT=5800 pnpm test:e2e`：424 通过、1 跳过、1 失败。失败的是 96 的 `round.spec.ts:855`（脚本扮演 Agent，最后一步去掉 `mx-auto` 后 `done`，30 秒超时、读到「no page with 03Kind is open」）；单独 `--repeat-each=3` 又失败 1 次。在没改的源码（14159a2，重新 build）上同样 `--repeat-each=5` 也失败 1 次（同一步，读到「it shows the change」：页面还没换上改了的代码就核对了），所以是这条原有的不稳，和本线无关，见遗留风险第 4 条。page 一组全过，project files 一组跑了（切换按钮体积检查在里面，通过）。`move-placement.spec.ts` 的四条（96 那条改写的和新加的三条）`--repeat-each=5` 20 次全过。
- bench（`TK_BENCH_PORT=5840`）：`--dry` 24 个场景都 ✓，`--scripted` 15 个都 ✓，✓ / ✗ 行和指挥在 14159a2 上跑的基线逐行相同。场景里没有这几种图层。
- 性能没跑（这条线的改动只在自由定位、两边外边距都是 `auto` 的图层上多读一次声明的最大值；拖动开始时读一次外边距，和 96 一样，每一步不多读；没有新的排版读取）。

*包体积*

切换按钮 `react.dev.js` 1423 B（gzip -9 822 B，sha256 前 16 位 `c83849f1557e0b1b`）、`chunk-UQJRS7YD.js` 21575 B（gzip -9 9164 B，`cdd6f09dfeaf13fa`），和基线逐字节相同。编辑层 `editor.dev.js` 332022 → 332570 B（+548 B），gzip -9 112856 → 112993 B（+137 B）。

*遗留风险*

1. **只有一边 `auto` 加最大值的**（`inset-x-0 ml-auto max-w-md`，浏览器在宽的容器里把它推到右边）：没认，照旧按左边读，移动写 `left: …; right: auto`，宽度缩成内容宽（和改前的第 1 处一样）。ticket 只点名 `mx-auto`；要认，照 96 代定第 2 条按右边定位，但它在撑满的视图里是两边一起摆，只改 `right` 会改宽度，要另想。
2. **画布那边「尺寸没写」按声明读**（照 89 代定第 2 条）：写了 `width: auto` 以外的值、实际却被 `max-width` 卡住的（例如 `w-full max-w-md`）算尺寸定死，按 96 的写法两边一加一减，改尺寸写 `width`，在窄的视图里会和浏览器不同（伸出容器）。`min-width` 撑大的、`aspect-ratio` 的不认作这种。
3. **拖出排版的落点、解散 Stack 后的位置在所有宽度一样**（代定第 4、5 条）：旁边的视图里图层不再居中（和从排版拖进 Frame、解散 Stack 的任何图层一样）。
4. **`round.spec.ts:855`（96 那条脚本扮演 Agent）最后一步不稳**：改了源码后紧接着 `done`，有时页面还没换上新代码（读到「shows」），有时等不到页面（30 秒超时）；改前的代码上也一样。没有改它：不在这条线的范围，测试本身要等页面换上新代码再核对。
5. 读一次的记录会过时；一个视图代表一整段宽度；没跑真实 Agent（同 79、94、96）。

*后续 ticket 的建议（没有开号）*

- `round.spec.ts:855` 改稳：每次 `editSource` 之后先等页面上的图层变成新样子（`expect.poll`），再 `done`。
- 只有一边 `auto` 外边距、靠最大值卡住的图层（遗留风险第 1 条），要不要也保持贴边、不缩，交设计师定。

**独立审查（审查后，2026-11-05）**

跑了 code-review（Standards、Spec 两个子 agent）并自己看了 `14159a2..HEAD`。没找到虚假的 ✓、三个视图里第 1–3 处的跳位；不是 `auto` 外边距的图层（宽度定死、只有 `ml-auto` 的自由图层、`translate` 居中、排版里的图层）落点、微移、粘贴都和改前一样（非 `auto` 的外边距照旧减；自由图层的 `auto` 外边距原来是减了再由 `autoMarginBefore` 加回，结果相同），和 96 代定 2、94 代定 4 一致。没有这种图层时说明一字不多。

改了的（先写测试，看着失败）：

- **解散 Stack 记下的外边距和 X 对不上**（低）：`Dissolved.layers[].margins` 仍用 `marginsAt` 记用掉的外边距（`mx-auto` 的子图层记 175），X 却已经不含它，和类型说明「drawn past x and y by them」矛盾。改为 `marginsAside`（`auto` 的记 0）。目前没有核对读它，所以页面上没有变化。测试：解散 Stack 那条多一个断言，改前 `{ x: 175 }`。
- 补了一条改尺寸后撤销、重做的测试（`max-width` 回到 50、再到 70，宽度一直 `auto`），改前改后都过，只是补上覆盖。

*代定的事（待设计师确认，审查后）*

6. **撑满的视图里拖控制点**：手机视图里图层撑满（画 342，最大值 400），在那里往外拖，写的是手机断点的 `max-width: 362px`，画布上看不出变化（仍撑满）；往里拖从 342 开始算，写 `max-width: 322px`，两边对称地缩。照浏览器的摆法，没改；要不要在这种视图里提示或改成别的，交设计师。
7. **百分比的最大值**（`max-w-[50%]`）也算靠最大值卡住；改尺寸写成 px（`max-width: 70px`），按比例变成定死的最大值，和别处改尺寸写 px 一样。没改。

*遗留风险（审查后）*

6. **只在某个断点才有的最大值**（`md:max-w-md`）：桌面视图里算居中，没有最大值的视图（手机）里两边写了值、宽度 `auto`、外边距 `auto`，浏览器让它撑满，但不算居中，于是照 96 代定 6 只写 `left`、加两倍，那个视图里图层左边进 2Δ、右边不动，宽度缩 2Δ（改前是缩成内容宽，所以仍比改前好）。要修可以让「两边都写、尺寸 `auto`、两边外边距都 `auto`」的视图也算居中（两边一加一减在撑满时就是平移），但会改没有最大值的这类图层，交设计师。没写测试。
7. **`done` 只核对位置**：Agent 照两边写、又多写一个 `width` 时，在撑满的宽度上若那个宽度还放得下，中点对就报 ✓，但图层不再「在窄处撑满」；放不下时中点偏了，报「没有显示」。规则「Held by a maximum」说了不写宽度。
8. 改尺寸时每一步 `heldMaxOf` 读一次 `computedStyleMap`，靠最大值卡住的图层还走一次声明（`declaredValue`）；不排版（ADR 0011），没跑性能。

**合并前（2026-11-05，指挥）**

两轮审查都跑了：实现时的 code-review（Standards、Spec），和指挥另跑的独立审查（设计师 2026-11-05 让本线全部用 effort medium，审查也是）。独立审查没找到虚假的 ✓、没找到剩下的跳位，修了一条低的（解散 Stack 记下的外边距，7383d79），代定 6、7 和遗留风险 6–8 是它加的。

分支在 f19423f 同步了 main（带进 5363ebf，只改 ticket 88，不碰 `src`）。指挥在同步后的代码上自己跑了：

- `pnpm typecheck` 通过；`pnpm test` 单测 961 通过、1 跳过（34 个文件），node 123 条通过。
- `TK_E2E_PORT=5800 pnpm test:e2e`：page 一组 291 通过、1 条失败：`off-canvas.spec.ts:174`（96 里也记过的已知不稳，解除删除后 h1 5 秒内没显示），单独 `--repeat-each=3` 3 次全过。project files 一组用 `--project="project files" --no-deps` 补跑：133 通过、1 跳过（切换按钮体积检查在里面，通过）。实现时说的 `round.spec.ts:855` 这一轮没失败。
- `move-placement.spec.ts` 96 那条（现在在 213 行）和本线新加的三条（250、286、307 行）`--repeat-each=8`：32 次全过。
- bench（`TK_BENCH_PORT=5840`）：`--dry` 24 ✓、`--scripted` 15 ✓，✓ / ✗ 行和 14159a2 上的基线逐行相同。

*性能（headless，只作前后对比）*

`TK_PERF_HEADLESS=1 TK_PERF_PORT=5810 pnpm test:perf`，14159a2（另一个 worktree 里）和最后的代码各一次，都 15 条全过。中位数 / p95，改前 → 改后：改一个值 圆角 work 8.9 / 15.3 → 8.6 / 13.7ms、间距 10.4 / 11.5 → 9.8 / 13.0ms；撤销 圆角 12.4 / 15.3 → 12.6 / 24.6ms、间距 20.1 / 23.6 → 15.9 / 21.7ms；重做 圆角 12.6 / 22.1 → 12.7 / 13.8ms、间距 16.8 / 20.1 → 15.9 / 21.3ms；拖动卡片 60 → 60 fps；拖控制点改尺寸 58.0 → 59.6 fps；核对认领的一轮最长一段 14.3 / 17.9 → 11.5 / 16.5ms；进入编辑模式（全部）143.9 / 173.4 → 167.6 / 339.1ms（这一次没达到中位数 150 的目标）。进入编辑模式那条单独、改前改后交替各跑两次：改后 166.6、138.1，改前 169.2、134.7，改前的代码同样会超，是机器的噪声，和本线无关（本线不碰进入编辑模式）。

*包体积*

切换按钮 `react.dev.js` 1423 B（gzip -9 822 B，`c83849f1557e0b1b`）、`chunk-UQJRS7YD.js` 21575 B（gzip -9 9164 B，`cdd6f09dfeaf13fa`），和 14159a2 逐字节相同。编辑层 `editor.dev.js` 332022 → 332570 B（+548 B），gzip -9 112856 → 112996 B（+140 B）。

代定 1–7 见上（1–5 实现时，6–7 审查后）。请设计师重点看第 4 条（落点不减任何 `auto` 外边距，也用在微移、粘贴上；拖出排版的图层在旁边视图里在同一个 X，不再居中）和第 5 条（解散 Stack 时 `mx-auto` 的子图层按左边定位，平板、手机里不再居中）。遗留风险里最值得定的是第 6 条（审查后：只在某个断点才有的最大值）和第 1 条（只有一边 `auto` 加最大值的）；`round.spec.ts:855` 的不稳要不要开 ticket 也交设计师。

*再同步后（13078ae，带进 98）*

合并前 main 上合进了 98，分支再同步一次后重跑：`pnpm typecheck` 通过；`pnpm test` 单测 961 通过、1 跳过，node 123 通过；`TK_E2E_PORT=5800 pnpm test:e2e` 437 通过、1 跳过、0 失败，不用重跑（`round.spec.ts:855` 也过）。切换按钮的包仍逐字节相同；`editor.dev.js` 332651 B（gzip -9 113041 B，含 98 的改动）。

*合并后（82a65a6，指挥）*

合并前一刻 main 上合进了 100、101（71279dd，也改 `change-notes.ts`、`cli.ts`、`writing-rules.ts`），合并没有冲突，但合起来的代码在合并前没跑过，所以合并后在 main 上补跑了：`pnpm typecheck` 通过；`pnpm test` 单测 997 通过、1 跳过（35 个文件），node 125 通过；`TK_E2E_PORT=5800 pnpm test:e2e` 437 通过、1 跳过、0 失败，不用重跑；bench `--dry` 24 ✓、`--scripted` 15 ✓，✓ / ✗ 行和 14159a2 的基线逐行相同；切换按钮的包逐字节相同。100 的解散说明（「留着外边距，画在 `left`、`top` 加上它们」）和 `done` 的 `offByMargins` 读 `Dissolved.layers[].margins`：审查后那里 `auto` 的记 0（`mx-auto` 按左边定位后浏览器算成 0），两者一致。

## 设计师确认（2026-11-05）

- 代定 1–7 全部确认，包括重点看的第 4 条（拖出排版的图层落在松手处，所有宽度同一个 `left`，旁边视图里不再居中）和第 5 条（解除分组时居中的子图层仍居中；解散 Stack 时 `mx-auto` 的子图层按左边定位，照 spec 和别的子图层一样）。
