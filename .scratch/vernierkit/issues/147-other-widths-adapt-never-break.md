# 147: 其他宽度允许适配、任何宽度不许破版

**What to build:** ADR 0016 的第二部分（设计师 2026-11-11 定）。

现在，桌面视图里的改动在每个视图宽度都要显示（ticket 64），不一样就是 not shown。官网当天有 7 条是这样被判错的：Agent 在手机宽度上为了不撑破，有意保留原样，比如 demo 宽 500、底部内边距 240。

反过来，能力弱的 Agent 照字面写 `w-[500px]`，手机上出现横向滚动，现在的核对反而判它显示了。

要做到，宽度分三档：

1. **改动所在的宽度：严格**（ticket 146 的「画出来一样就算」）。
2. **桌面视图里的改动，在其他视图宽度上：允许适配。**
   - 画出来和画布一样，算显示了。
   - 不一样时，不算没显示，这条改动照常算落地了。`done` 说出那里画的是什么，比如「At Phone (390px) it draws 342px wide, not 500px: if you adapted it there on purpose, say so in the report」。
   - 结果里要能分出「适配了」，给 ticket 148 的报告用。
3. **任何视图宽度：不许破版。** 只算这一轮之前没有、现在有了的问题。「之前」在认领时记下，和 ticket 77、104 记的一起。
   - 页面出现横向滚动：文档比窗口宽。
   - 这一层比它的容器宽。
   - 这一层被祖先的 `overflow` 截断。
   - 出现了就算没显示（not shown）。`done` 说出是哪条改动、哪个宽度、怎么修，比如「At Phone (390px) change 6 makes the page wider than the screen: use 500px from md up only, or keep it within its container」。措辞是代定，用词保持英文。
   - 破版检测只看这一轮改到的图层和它们的容器，不扫整页。

断点上的改动，范围外照 ticket 104 要求不变，这一条不放开（ADR 0016：漏了断点前缀把桌面改坏，不是适配）。

GLOSSARY「核对」改成新的说法。ADR 0008 已有指向 0016 的一句；spec 里讲核对的地方，如有，一并更新。

参考 ADR 0006、0008、0016，ticket 64、77、104、146；用词以 GLOSSARY.md 为准。

**Blocked by:** 146。发布前做（设计师 2026-11-11 定）。

**Status:** ready-for-agent

- [x] 加 bench 场景：在桌面视图把一层的宽度改成 500（手机视图上会撑出屏幕），`--scripted` 两种落地都跑一遍：
  - 照字面写（例如 `w-[500px]`）：Phone 宽度判为 not shown，`done` 给出破版的说法；
  - 适配写（例如 `w-full md:w-[500px]`）：判为显示了，结果里标出 Phone 宽度适配了，以及那里画的是什么。
- [x] 加 bench 场景：在手机视图改一层的内边距，脚本漏写断点前缀、把桌面也改了，照旧判为 not shown（ticket 104 不变）。
- [x] e2e 或浏览器测试：破版的三种情况各一条，都只在这一轮新出现时才报。这一轮之前就有横向滚动的页面，不报。
- [x] ticket 64 以来「桌面改动在别的视图宽度不显示就判 not shown」的测试，按新规矩改，Comments 里列出改了哪些。已有场景的 `claim-out` 逐字不变；`--dry`、`--scripted` 全过（结果有变的场景在 Comments 里逐条说明）。
- [ ] 可选，要先问设计师额度：pi（能力弱一点的模型）真跑「宽度改成 500」场景 ×3，看它照新的说法能不能改对。（没跑：真实 Agent 要设计师的额度，planner 交代不跑。）
- [x] `pnpm typecheck`、`pnpm test`、整套 e2e 过；核对耗时前后对比（headless），不明显变慢。（e2e 按 planner 2026-11-12 的轻规则只跑相关 spec，见 Comments。）

## Comments

**2026-11-12，实现（分支 `ticket-147`）**

改了什么：

- 三档宽度（`check.ts` 的 `checkAcross`）：
  - 改动所在的宽度照旧严格（146 的画出来一样就算）。
  - 桌面视图里的改动，窗口宽度显示了时，其他视图宽度上没显示的不再算 not shown：结果是 `{ outcome: "shown", adapted: [{ width, actual, drawn? }] }`（`ShownAdapted`，类型在新文件 `src/widths-protocol.ts`，和 `outside-protocol.ts` 一样放在 `service-protocol.ts` 之外，切换按钮的包逐字节不变，已比对）。`actual` 是那个宽度读到的值；宽高类另记画出来的 px（`drawn`）。148 的报告可以直接用 `adapted`。
  - `done`：「Checked on the page: it shows the change. At Phone (390px) it draws 342px wide, not 500px: if you adapted it there on purpose, say so in the report.」其他属性说「its fill is #FFFFFF, not …」；位置类和结构改动说「the layer is drawn elsewhere than on the canvas」；删除说「the layer is still on the page」。几个宽度用分号接，结尾说「at those widths」。这条改动照常算已落地。
  - 断点上的改动不变（104 的范围外照旧严格）。
- 不许破版（新模块 `src/client/breaks.ts`）：
  - 三种：页面横向滚动（文档比窗口宽，且这一层或它的容器伸出了屏幕，才算是它的）；这一层或它的容器比自己的容器内容宽（1px 以上）；这一层或它的容器被祖先的 `overflow: hidden/clip` 截断（自由定位的从定位参照往上算，fixed 不算；`<html>`、`<body>` 只算横向）。
  - 只看样式改动、页面按源码标记找得到的图层（`breakWidthsOf`），它要显示的每个宽度；只看这一层的元素（循环取前 8 个）和它们的容器。没画出来的（`display: none`、零面积）不看。
  - 认领时记下（`OtherUsagesNote.breaks`，和 77、104 的记录一起存进 `.humantouch/other-usages.json`，刷新后也在）；之后出现了记下时没有的才算。认领时页面已经横向滚动的，横向滚动不再报。页面替 Agent 认领的一轮（78）只在窗口宽度记。
  - 出现了算 not shown（`breaks`），`done`：「Checked on the page: it does not show the change. At Phone (390px) change 1 makes the page wider than the screen (it scrolls sideways) and the layer wider than its container (500px in 342px), which it did not as the round was claimed: use 500px only from a breakpoint up where it fits (a variant such as `md:`), or keep the layer within its container, and run `npx humantouch done 1` again.」位置类改动说「give it this place only from a breakpoint up where it fits …, or place the layer within its container」；断点上的改动说「keep the layer within its container there」。`finish` 开头单列「Shown, but breaking the layout at a width: 1.」，报告放 ⚠️，Why 先填好。
  - 认领后每次热更新的快速复查只看窗口宽度；`done`、`finish` 问的时候每个宽度都看（同 104）。
- planner 加的一项：`done` 按行核对改字时，块级元素分出的行也算换行（`words.ts` 的 `wordsOf(el, lines, blocks)`，核对用 `blocks`）。两个块之间算一次，块边上的 `<br>`、保留的换行不多算；行内元素、表格的格子不算。画布上读字不变。取代 144 的代定 9。
- GLOSSARY「核对」、spec（核对那节，桌面改动的宽度一条，加了破版和改字两条）改了。claim 的「How the page checks」一字没改（已有场景的 claim-out 要逐字不变），见代定 6。

测试：

- 新浏览器测试 `test/breaks.browser.test.ts`（11 条）：三种破版各一条（只有横向滚动：自由定位的盒子挪出屏幕；只有比容器宽：容器横向可滚；被截断：竖向、横向）；容器变宽；认领前已有横向滚动不报；认领前已破的同一种不报；没画出来的不报；哪些改动看破版；桌面改动在 Phone 适配（带 `drawn`）、窗口宽度照旧严格、断点改动照旧严格；`watchPage` 整条：认领时记下、代码破版后 not shown、修好后 shown。
- `test/promote.browser.test.ts` 加一条：块级分行算显示了，flex 块加 `<br>` 仍是一次，行里夹一个块多一行，行内 span 不算。
- `test/cli.test.ts` 加 5 条：适配的 `done`（填色、两个宽度的宽度）、破版的 `done`（页面变宽加比容器宽；断点改动的容器被截断加另一宽度的容器变宽）、`finish` 的开头和 ⚠️。
- 新 bench 场景（tw4）：`width-500-adapted`（按钮 Fixed 500，scripted 写 `w-full md:w-[500px]`：shown，Phone 适配，`done` 说 342px）、`width-500-literal`（同样的设计，scripted 照字面写 `w-[500px]`：not shown，`done` 给破版说法，报告在 ⚠️）、`phone-padding-prefix-missed`（手机视图里按钮上内边距 16，scripted 写成不带断点的 `pt-4`：not shown，`done` 说范围外也改了）。后两个是 `scriptedOnly`，真跑时不跑；场景多了字段 `scripted`（`done` 要说的话、要不要 not shown、哪些宽度适配），scripted pass 逐条查。这两个场景的 apply 先等页面把认领时的记录写进 `.humantouch/`（`notedAtClaim`），再改代码，见风险 1。

ticket 64 以来按新规矩改的测试：

- `test/edits.browser.test.ts`：22 处（`pageAt` 下面 ticket 75、83、84、89 的位置类测试，`not shown … width: 390` 改成 `shown, adapted: [{ width: 390, actual }]`，读到的值照旧断言），加上「a change made in the desktop view is checked as wide as the window and as wide as each view」（标题也改了）和 ticket 109 的「direction and gap changed in a narrower view, then made a Grid」各一处。
- `test/outside.browser.test.ts`、`test/promote.browser.test.ts`：认领时的记录多了 `breaks`（78 的 `noteRound` 也记破版），期望改了 3 处。
- `e2e/tests/round.spec.ts` 9 条：
  - 适配了（shown）：ticket 83「placed absolute at every width」、83 review、84（X）、84（right，`finish` 从 ⚠️ 改到 ✓）、89（右到左），以及 64 的「Grid's columns changed for `sm:` only」（Phone 画 1 列，进度环 1）。
  - 破版了（not shown，说法变了）：ticket 75（按左边写死，在 Tablet 和 Phone 伸出屏幕，宽度和 right 两条都报页面变宽）、79（居中的写死 px，在 Phone 伸出屏幕）、96（auto 外边距居中的写死 px，同上）。

数字：

- 分支从 main 3e0c277 开始，中途合了 main 7e48398（137、160），合并无冲突；以下都在合并之后。
- `pnpm typecheck` 过（website 也过）。`pnpm test`：vitest 57 个文件 1345 过、1 跳过；node 132 过、0 失败。
- e2e（`HT_E2E_PORT=6900`，只跑相关 spec）：`round.spec.ts` + `applying-bench.spec.ts` 570 过、0 失败（含它们依赖的 project）；`bench-scenarios.spec.ts` 的新场景和 `panel-width-as-maximum` 491 过、0 失败（同上，含依赖）。改 round.spec 前那一轮是 561 过、9 失败，就是上面那 9 条。
- `--dry`：38/38（main 7e48398 是 35/35）。`--claim-out` 和 main 做 `diff -r`：已有 35 个场景逐字相同，只多了 3 个新场景的文件。
- `--scripted`：29/29（main 上 26 个，多了 3 个新场景）。审查修改前的一整轮跑到第 5 个场景时 bench 进程崩在 undici 的 `setTypeOfService` EINVAL 上，这是负载下的噪声（以前也见过），重跑全过。合 main 之前单独跑新场景时，`phone-padding-prefix-missed` 有一次 not shown 没报：页面在副本载入、记下 104 的范围外记录之前代码就改了（见风险 1）。之后在 apply 里加了 `notedAtClaim`，就稳定了。
- 结果有变的已有场景：没有（已有场景都过，scripted 对 `adapted` 的检查要求一个都不适配，也过了）。
- 切换按钮的包：和 main 的 build 比，只有 `cli.js`、`editor.dev.js` 不同，其余逐字节相同。
- 核对耗时（浏览器微测，headless，机器忙，仅供参考；96 张卡片、每张 30 多个元素，圆角改动没落地，连看 6 次）：`checkAcross` 第一次 4.4ms、之后约 1.0–1.1ms；新加的破版比对每次 0.3–0.5ms；认领时记一次破版 8.4ms（每条改动只记一次）。没碰拖动、改尺寸、进出编辑模式、画布绘制，没跑 perf。
- 没跑真实 Agent（Claude、pi 都没跑）。

审查（两路子代理，medium）：改了 `breaks.ts` 里重复的 overflow 正则、`ViewLabels` 和 `design-values` 两处视图宽度常量合成一处、表格的格子不算块。其余记在代定和风险里。

代定：

1. 「适配」只给桌面视图里的改动，而且只在窗口宽度严格看过（显示了）时才放开；窗口宽度落在这一轮同一属性的断点改动范围里、没有严格的宽度可看时，其他宽度照旧严格。
2. 适配对所有种类的桌面改动都放开：样式、删除、自由定位的移动和新建。删除在 Phone 上还在，也算「适配了」（ADR 0016 没区分种类）。要不要让删除照旧严格，请设计师定。
3. 位置类改动适配时只说「the layer is drawn elsewhere than on the canvas」，不再说 75/83/84 那套「give it `left` 60px at this width too」。理由：这些已经不要求改。
4. 破版只看样式改动，而且图层要能按源码标记找到。这一轮新建的图层、移动、删除、改字都不看破版。新建的图层认领时还不在，没法记「之前」。
5. 破版的阈值：比容器宽要超过 1px（容器宽读的是整数）；横向滚动要文档比窗口宽，而且这一层或它的容器伸出了屏幕，才算是它的。`overflow: auto/scroll` 的祖先不算截断（能滚到）。自由定位的层不算「比容器宽」。
6. claim 的「How the page checks」一字没改：它说的「at each of the designer's views' widths」仍然对（还看，只是放宽），改它会让所有已有场景的 claim-out 变。Skill 和这段的新说法留给 148。
7. 视图名按宽度叫：390 是 Phone、768 是 Tablet，其他说「500px wide」，和画布的 `viewName` 一样。设计师改过视图宽度的，名字也跟着宽度走。
8. 措辞（英文）：见上面引的 `done`、`finish` 原文。
9. 块级分行：`display` 不是 inline*、contents、none、table-cell、table-column 的都算块。只在按行核对（改动里有换行）时用；不带换行的改字不受影响。

风险：

1. 「之前」是页面第一次看这条改动时记的，其他宽度要等页面副本载入。Agent 在这之前就改了代码（认领后马上写、副本载入慢、页面认领后才打开），记下的就是改坏后的样子，这个破版不会报（虚假的 ✓ 方向）。104 的范围外记录也有同样的问题。scripted 场景里等记录写好再改，就是为了避开这个时序。可以考虑认领时先等页面把各宽度记好再放行，留给 planner 定。
2. 破版按元素在页面上的序号（循环取前 8 个）对应。实例的个数或顺序变了，可能对错：新的破版被当成旧的，或者旧的被当成新的。
3. 认领后热更新的快速复查只看窗口宽度。一条已经显示的改动，后来的编辑在 Phone 上把它弄破了，要到 `done`、`finish` 问的时候才发现。
4. 页面整体缩放、`transform: scale` 下量的是画出来的盒子，判断可能偏。
5. 编辑层自己加在页面上的元素如果撑宽了页面，会算进「之前」，不会误报，但也可能掩盖认领后出现的横向滚动。

后续（不编号，交给 planner）：认领时等各宽度的记录写好再让 Agent 开始改（风险 1）；148 的 Skill、`finish` 三栏用 `adapted`。

**2026-11-12，审查后的修改（同一分支）**

审查的 8 条逐条对着代码核过，都成立；第 8 条按 planner 的意思只记风险。改了什么：

1. 破版只看能改变几何的属性。`breakWidthsOf` 跳过 `DRAWS_NO_BREAK`（新常量，在 `widths-protocol.ts`，CLI 也用）：填充、圆角、阴影、文字阴影、透明度、两种模糊、裁切、文字颜色、文字装饰、文字对齐。其余（尺寸、最小最大、内外边距、间距、X/Y/right/bottom/absolute、排列和列数、字号字距字重行高、描边、显隐等）照旧看。同一图层上还有别的能改变几何的改动时，`done` 不再只怪一条，改说「At Tablet (768px) the layer of changes 1 and 2 makes the page wider …, which it did not when the round was claimed; any of those changes may be what does it: …」（`design-values.ts` 的 `breakingWith`）。round.spec 的 ticket 75 那条（审查说的 ~l.652）正是这个情况：宽度那条原来背了 right→left 改写造成的破版，现在两条都说成「the layer of changes 1 and 2」。
2. 晚记的「之前」（按 planner 定的 (a)）。`watchPage` 里记一个 `codeChanged`：开始时页面已经不能记样式影响（`effects` 关了：认领后才打开，或代码先于认领变了）就是真；之后开发服务器说代码变了（`CODE_EVENT`），或没有开发服务器的消息时页面有任何变化，也置真。从那以后记下的破版记录带 `late: true`（`BreaksNote.late`，存进 `.humantouch/`）。晚记的宽度上看到的破版全算 not shown，每条带 `late`；`done` 说「…; the page could not note that width before the code changed, so it cannot tell whether that is new. If the change does it: <修法>, and run `npx humantouch done 1` again; if the page did so before the change, say so in the report.」新旧混着时分两句说。78 的路子：`noteRound` 在代码开始变时记的窗口宽度不算晚记（测试里看了），之后页面在其他宽度补记的算晚记。(b) 没做：CLI 不知道页面要记哪些宽度（窗口宽、视图宽都在页面那边），要等就得让页面另写一个「记完了」的标记，再给 claim 加一段等待，不算便宜；记在风险里。
3. `words.ts`：Stack、Grid（`display` 以 flex 或 grid 结尾）里的子元素不再一律算块。子元素只有画在前面那些的下方（top ≥ 已有的最低 bottom − 0.5px）才另起一行；并排的按词隔开（中间加一个空格），svg、img 夹在中间也一样。列方向、换了行的 wrap 照旧算行。
4. 被推出屏幕起始边算破版：从左到右是左边，从右到左是右边（看 `<html>` 的 `direction`），页面滚不过去，算「cut off by the screen」（`BreakFound.by: "screen"`），照旧只算新出现的。`done` 说「pushes the layer past the screen's edge, where the page cannot be scrolled to」。横向滚动只算结束边。`edits.browser.test.ts` ~l.4472（ticket 75 在 Phone 上差 390px）核过：那是推出了结束边（`left: 740px` 在 390px 宽的页面），页面会横向滚动，破版那一路能抓到；`checkAcross` 本身只管适配，照旧「shown, adapted」。在那条测试里加了一句，用同一个 Phone 页面查破版，得到「page wider」。
5. 同一种破版变严重也报。记录里多存每个破版伸出多少 px（`BreaksNote.over`，另存页面整体伸出屏幕多少，键 `page`）；之后同一种比记下时多伸出 4px 以上（`GREW_PX`）就算新的。认领时页面已经横向滚动的，只有页面伸得更远、而且这一层也伸得更远时才报横向滚动。旧记录没有 `over` 的，照旧只比有没有。
6. `clipped()` 改成沿包含块链走：每一步从当前元素的包含块往上（absolute 用 `offsetParent`，fixed 停，其他用父元素），所以 absolute 元素和它的定位祖先之间、不定位的 `overflow: hidden` 祖先不再算截断；定位祖先自己是 absolute 的，再从它的定位祖先接着走。返回伸出的 px（给第 5 条用）。`transform` 造成的包含块没管（`offsetParent` 不认它）。
7. 说法统一成「不算显示」（ADR 0016）：`done` 本来就说「it does not show the change」，「which it did not as the round was claimed」改成「when the round was claimed」；`finish` 的「Shown, but breaking the layout at a width: 1.」改成「Not shown, breaking the layout at a width: 1.」；报告的 Why 从「the page shows it, but at Phone …」改成「the page does not show it: at Phone …」，有晚记的再加「(the page could not note every width before the code changed)」。

测试（每条修改至少一条）：

- `breaks.browser.test.ts`（11 → 19 条）：不看破版的属性（fill、radius、opacity、shadows、textColor、textAlign）和看的（padding、gap、fontSize、letterSpacing、stroke、x）；已破的同一种、多伸出不到 4px 不报，更严重了报（比容器宽和被截断各一）；推出起始边（左到右、右到左各一）和右到左的结束边算横向滚动；absolute 元素和定位祖先之间的 `overflow: hidden` 不截断、定位祖先自己的截断、两层 absolute 往上接着走；`noteChange(…, late)` 晚记后全报且带 `late`；`watchPage` 三条：认领路子上页面开始时就不能记（`effectNotes(false)`）→ 晚记、已破的也报；开始核对后先来一次 `CODE_EVENT` → 之后补记的宽度是晚记的；78 路子：`noteRound` 先记窗口宽度（不带 late），之后 `watchPage` 关着 `effects` 也不报已有的破版。原来那条「认领前已破的同一种不报」改了（被截断的那半，宽度变大后截得更多，按第 5 条现在会报）。
- `promote.browser.test.ts` 加一条：flex 列方向、wrap 换到下一行算两行（shown），横排夹 svg、grid 两列都读成「Plan ahead」（not shown）。
- `cli.test.ts` 加 2 条：同一图层上宽度加内边距两条改动时的说法（圆角那条不点名）；晚记的 `done`、`finish` 开头、报告 Why。已有 3 条的说法跟着第 7 条改了。
- `edits.browser.test.ts` 那条 ticket 75 的测试加了破版的断言（见第 4 条）。
- `outside.browser.test.ts`、`promote.browser.test.ts` 里 3 处期望回到了 main 上的样子：填色、圆角的改动不再记破版。
- e2e `round.spec.ts` ticket 75 那条：claim 后先等 `.humantouch/other-usages.json` 里两条改动在 768 和 390 都有不晚记的破版记录，再改代码；期望改成「the layer of changes 1 and 2 … any of those changes may be what does it」。不等的话，这条测试改代码太快，Phone、Tablet 的副本还没载入就改了，记录是晚记的，`done` 给的是晚记那种说法（第一轮全跑时就是这样失败的，说明晚记的判断在真页面上起作用）。另外两条（79、96）的期望跟着第 7 条改了措辞。bench 场景 `width-500-literal` 的 `scripted.done` 同样改了措辞。

数字（审查修改之后；分支仍基于 main 7e48398，main 现在是 07670ae，按 brief 没有合）：

- `pnpm typecheck` 过（website 也过）。`pnpm test`：vitest 57 个文件 1356 过、1 跳过；node 132 过、0 失败。
- e2e（`HT_E2E_PORT=6900`）：`round.spec.ts` + `applying-bench.spec.ts` + `claim.spec.ts` + `promote.spec.ts` 一起跑 578 过、1 失败（就是上面 ticket 75 那条，改测试前）；改完单跑这条 `--workers=1 --repeat-each=3` 3/3 过。`bench-scenarios.spec.ts` 的 3 个新场景（含依赖）490 过、0 失败。
- `--dry`：38/38；base 7e48398 35/35。`--claim-out` 两边 `diff -r`：已有 35 个场景逐字相同，只多 3 个新场景的文件。临时 worktree 已删。跑之前发现 6924 端口上有一个 45 分钟前留下的孤儿 bench vite（父进程是 launchd，cwd 是 bench 的临时目录），在我的端口段里，停掉了；它让 base 的第一次 `--dry` 跳过了一个场景，停掉后重跑。
- `--scripted`：29/29（main 7e48398 上 26 个，多 3 个新场景），一次过。
- 结果有变的已有场景：没有。
- 没碰拖动、改尺寸、编辑模式、画布绘制；破版比对多算了伸出的 px，量的还是同样那些盒子，没跑 perf。没跑真实 Agent。

代定（接着上面的编号）：

10. 晚记按 planner 定的 (a)：代码变过之后才记的宽度，那里看到的破版都算 not shown，`done` 说分不清是不是新的，原来就有就在报告里说。「代码变过」= 开发服务器说的热更新；没有开发服务器的消息时，页面的任何 DOM 变化都算（和 ADR 0016 的样式影响记录一样）；页面开始核对时已经不能记样式影响的，也算。
11. 不看破版的属性：填充、圆角、阴影、文字阴影、透明度、两种模糊、裁切（`clip` 只截这一层里面的东西，这一层自己不会因此被截或撑宽）、文字颜色、文字装饰、文字对齐。显隐、描边、字重、行高、大小写都看。
12. 同一图层上有几条能改变几何的改动时，说成「the layer of changes 1 and 2」，加「any of those changes may be what does it」，修法仍按 `done` 问的那条给。只按图层（位置加组件链）认，不管断点，也不管那几条结果如何。
13. 变严重的阈值 4px（`GREW_PX`）。横向滚动是否变严重按页面整体伸出屏幕的 px 比。
14. 推出起始边算「被屏幕截断」，按 `<html>` 的 `direction` 定哪边是起始边；`<html>`、`<body>` 的 `overflow-x: hidden` 只算结束边（起始边已经由屏幕算过）。
15. Stack/Grid 里子元素分不分行按画出来的位置：在前面的下方才另起一行，并排的中间加空格。只在按行核对时用，不带换行的改字照旧。
16. 说法统一成「不算显示」：`finish` 的「Not shown, breaking the layout at a width: N.」仍单列一栏，不并进「The page does not show」。

代定 2（删除也适配）按 planner 的意思保留，没改。

风险（更新）：

- 风险 1 现在一半被第 2 条盖住：代码先变了，记录会标成晚记的，不会再悄悄地 ✓；但晚记时原来就有的破版也会报 not shown（偏向 ⚠️），要 Agent 在报告里说明。没有开发服务器消息的页面（一直在动的轮播、动画）几乎每次都会晚记。认领时等页面记完（(b)）仍值得做，留给 planner。
- 风险 3（认领后热更新的快速复查只看窗口宽度）不变，记给 148。
- 新：Stack/Grid 的子元素按 `getBoundingClientRect` 判断上下，有 `transform` 或负外边距叠在一起时，可能把并排当成分行，或反过来。
- 新：`clipped()` 用 `offsetParent` 找 absolute 元素的包含块，不认 `transform`、`filter`、`contain` 造成的包含块；`offsetParent` 为 null（祖先 `display: none`）时当作没被截。
- 新：「the layer of changes 1 and 2」按改动的目标认同一图层，循环里不同实例、不同使用处的同一个源码位置会被当成同一图层。

ticket 64 以来按新规矩改的测试（这次）：round.spec 的 ticket 75 那条（见上）；`breaks.browser.test.ts` 那条「已破的同一种不报」；其余见上面测试一节。
