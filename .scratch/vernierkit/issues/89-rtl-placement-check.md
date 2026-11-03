# 89: 从右往左排的页面上，左右两边都写了值时，`done` 可能报虚假的 ✓

**What to build:** 页面或图层是从右往左排的（`direction: rtl`，例如阿拉伯语、希伯来语的网站）时，图层左右两边都写了值，浏览器按 `right` 定它的位置，`left` 不起作用；从左往右时正好相反。ticket 75、83、84 判断「这一边挪不挪它」、核对「页面上挪了多少」时都按从左往右算。于是在从右往左的页面上，画布上真正起作用的 `right` 会被当成不挪它，那个宽度就不看了，Agent 写错了也报 ✓。要做到：哪一边说了算，跟着图层自己的 `direction`。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准（「Faithful」：虚假的 ✓ = 0），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0011、0014）。

**Blocked by:** 无（84 已完成）

**Status:** ready-for-agent

- [x] 先复现，用剧本或单元测试（脚本扮演 Agent，不跑真实 Agent）：从右往左的页面上，一个图层在手机上 `relative`，左右两边都写了值，在平板、桌面上按右边自由定位；在桌面视图改它的 X（ADR 0014，写成 `right`），Agent 只写 `md:right-[…]`，`done` 现在报 ✓
- [x] 判断「这一边挪不挪它」（84 的 `relative`，75 的自由定位、左右都写了值并且宽度定死的情况）和核对「页面上挪了多少」时，按图层算出来的 `direction` 定哪一边说了算。代码里改文字对齐、找样式出处的地方已经这样读 `direction`，照着做
- [x] 上下方向不受影响（`top` 总是说了算），不改
- [x] 不报虚假的 ✓；没显示时的说法照 84 已确认的那套，不另起新说法（要是非起不可，记进代定）
- [ ] 从左往右的页面上，`claim`、`done`、`finish` 的输出逐字不变；切换按钮的包逐字节不变
- [x] spec「核对」一节补一句：哪一边说了算跟着图层的 `direction`

## 背景

- ticket 84 的遗留风险第 2 条（2026-11-03）。84 的第 1、6 条（居中的 `relative` 图层、页面同时写了左右两边时的说法）不会报虚假的 ✓，只是说法可能误导 Agent，先不做，等 ticket 88 真实 Agent 跑出数据再看。
- 可选做法（分诊时）：1. 只为这一条开 ticket，第 1、6 条等 88 的数据；2. 三条一起做；3. 都不做，在 spec 里写明从右往左的页面按从左往右核对。

## 设计师决定（2026-11-03，分诊）

- 选做法 1：至今每处会报虚假的 ✓ 的地方都修（79、80、83、84），这一条也修；第 1、6 条等 88 的数据再定。
- 先复现，再修。不跑真实 Agent。

## Comments

**实现记录（2026-11-03）**

*结论*

验收项基本都做到了，照设计师选的做法 1。图层左右两边都写了值时，哪一边说了算跟着浏览器的定法：看图层**包含块**的 `direction`（不是图层自己的，见「浏览器里看到的」），从左往右按 `left`，从右往左按 `right`；自由定位的图层只在宽度定死时才有一边说了算。「这一边挪不挪它」（84 的 `relative`，75 的自由定位）、「页面上挪了多少」（`lookOffset`），以及移动、改尺寸按哪一边（`placedFrom`）都照这个读。ticket 说的那条剧本在改前报虚假的 ✓，改后报没显示，写对了报 ✓。上下方向 `top` 总是说了算，没改。说法没起新的，都是 84 已确认的那套。从左往右的页面，`claim`、`done`、`finish` 只有一种情况变了：页面上自由定位的图层两边都写了值、宽度定死时，`right`（`bottom`）的改动原来按写的值核对、会报虚假的 ✓，现在按浏览器把它摆在哪里核对（审查时发现，见代定第 4 条）；别的逐字不变。切换按钮的包逐字节相同。

*先复现*

用 e2e 剧本（`round.spec.ts` 新加一条，脚本扮演 Agent，不跑真实 Agent），在没改的代码（587d213）上跑。前后的输出是同一条剧本在两份代码上临时加打印、把断言临时改成 soft 跑出来的，打印没有留在仓库里。

示例项目 hero 上加 `dir="rtl"`，里面一个图层 `relative left-[8px] right-[40px] h-[40px] w-[80px] bg-stone-300 md:absolute md:top-[30px] md:left-auto md:right-[40px]`：手机上 `relative`、左右两边都写了值，平板、桌面按右边自由定位。桌面视图属性面板 X 加 20，照 ADR 0014 记成 `right` 40 → 20。`claim` 后 Agent 先只写 `md:right-[20px]`，`done 1`；再把手机上的 `right-[40px]` 也改成 `right-[20px]`，`done 1`，`finish`。

改前改动单把手机的范围记进 `placedOtherwiseAt`（768px 以下），那个宽度不看，只写 `md:right-[20px]` 时 `done` 就报 ✓，是虚假的 ✓：画布的手机视图里浏览器按 `right` 摆它（从右往左），图层确实被往左挪了 40px，改动后该是 20px。改后这个范围记进 `offsetInLayoutAt`（`relative`）。

*浏览器里看到的*

先在浏览器里看了（Playwright 的 headless shell，临时的探测测试，没留在仓库里）。容器 400px 宽，图层 50px 宽，`left: 10px; right: 30px`：

- **哪个 `direction` 说了算：包含块的，不是图层自己的。** `relative`：容器 `rtl`、图层自己 `ltr`，仍按 `right` 挪（往左 30px）；容器 `ltr`、图层自己 `rtl`，仍按 `left` 挪（往右 10px）。`absolute`、宽度定死：同样按包含块。包含块和父元素不同时（`rtl` 的定位参照里套一层 `ltr` 的 div），按定位参照的 `rtl`，按 `right` 摆；反过来按 `left`。和 CSS 2.1 说的一样。ticket 写「图层自己的 direction」，两者只在图层（或它和包含块之间的元素）自己设了 `dir` 时才不同；照浏览器做，记进代定第 1 条。
- **`getComputedStyle` 给的值**：`relative`、从右往左、两边都写：`left` 10px、`right` 30px，都是写的值，不是挪了多远；只写 `right`：`left` -30px、`right` 30px；只写 `left`：`left` 10px、`right` -10px。所以从右往左时读算出来的 `right` 就是往左挪了多远，三种情况都对；从左往右读 `left`，和 84 一样。
- **`absolute`、两边都写、宽度定死**：从左往右、从右往左，算出来的 `left`、`right` 都是写的值（10px、30px），不是浏览器实际用的值；只写一边时另一边是实际的值（从右往左只写 `right: 30px`，`left` 读出 320px）。所以 **`lookPosition` 不是按几何核对的**：没说了算的那一边读出来是写的值，图层并不在那里。从右往左时按 `right` 定位的改动读到的是说了算的那边，是对的；X 的改动在页面两边都写的宽度上会报虚假的 ✓（从左往右的 `right` 改动同样，这是 75 起就有的）。审查时补上了，见「按 code-review 修正」。
- **`sticky`**：两边的阈值照旧都算，和方向无关，没改。
- **画布的视图保留页面的 `dir`**：`<html dir="rtl">` 的页面，桌面视图和旁边 390px 的视图里 `html` 都还有 `dir="rtl"`，图层的 `direction` 都是 `rtl`。冻结时整个根元素连属性一起复制，旁边的视图又照着复制，所以不是另一个更大的毛病。

*`claim` / `done` / `finish` 前后*

`claim` 的输出前后逐字相同（这条剧本的 `claim` 在两份代码上逐字比过）。

只写 `md:right-[20px]` 时 `done 1`，改前：
```
Change 1 done: 1 of 1 change applied.
Checked on the page: it shows the change.
```
改后：
```
Change 1 done: 0 of 1 change applied.
Checked on the page: it does not show the change. At 390px wide, the page moves the layer 40px left, where the canvas moves it 20px left of where its container lays it out: give it `right` 20px at this width too, then run `npx 03kind done 1` again.
```

手机上也写成 `right-[20px]` 后 `done 1`，前后相同：
```
Change 1 done: 1 of 1 change applied.
Checked on the page: it shows the change.
```

`finish`（在两处都写对之后跑的；略去了末尾三条规则和报告外围的代码块标记），前后相同：
```
Round finished: 1 of 1 change applied.

End your reply with this report. Each change is under the heading the page's checks put it under: fill in each <…>, and keep each line short.

✓ Applied
- 1. Right: <the layer, and what you changed>
```
改前只写 `md:right-[20px]` 时 `done` 已经报 ✓，那时跑 `finish` 也会把它放在 ✓ 下；改后那时跑 `finish`，Why 一行是 84 已确认的「at 390px wide, the page does not move the layer 20px left of where its container lays it out, as the canvas does: <what keeps it so>」（这条剧本没有在那时跑 `finish`，这句由 84 的命令行单测逐字钉着）。

*做了什么*

- **哪一边说了算**（`client/placed-from.ts`）：新的 `edgeGoneBy(el, axis)`：两边都写了值时浏览器按哪一边，上下总是 `top`；左右看包含块（`containingBlockOf`：`relative` / `sticky` / 在排版里的是父元素，`absolute` 是最近的不是 static 的、或有变换的祖先，`fixed` 是最近有变换的祖先，都没有就是根元素，代表窗口）算出来的 `direction`，`rtl` 按 `right`。只读算出来的样式，不排版（ADR 0011）；照 `style-source.ts`、`typography.ts` 那样读 `direction`。
- **这一边挪不挪它**：`sideMoves` 的 `relative`：`right` 原来只在没写 `left` 时算挪动，现在从右往左写了 `left` 也算（进 `offsetInLayoutAt`，不进 `placedOtherwiseAt`）。`endOffsetPlaces`（75 的自由定位）：写了 `left` 时，宽度定死并且从右往左，`right` 也算摆它（不再进 `placedOtherwiseAt`，那个宽度照常按自由定位核对）。`left` / `top` 那一边没改：X、Y 的改动在所有宽度同时写 `right: auto`，画布上那一边总是说了算（83 的规则照旧）。
- **页面上挪了多少**（`client/check.ts`）：`lookOffset` 的 `relative` 改用 `movedAcross`：按浏览器说了算的那一边读它挪了多远（从右往左读算出来的 `right`，往反方向），再换成改动那一边的说法。从左往右时和原来一样读 `left`。
- **移动、改尺寸按哪一边**（`placedFrom`）：原来「两边都写了值的按左边处理」，现在两边都写了值、宽度定死、浏览器按右边摆的（从右往左），按右边处理：在桌面视图里移动它改 `right`（ADR 0014），改宽度时同时改 `right`，左边不动。先写了测试看改前的样子：改前移动它写成 `left: …; right: auto`，图层从右边跳到左边去；改宽度时左边跟着动。见代定第 3 条。
- **审查后**：页面上的自由定位按浏览器把它摆在哪里核对（`placedAt`），见「按 code-review 修正」。
- 改动单（`changeset.ts`）两个字段的说明、`edits.ts` `viewsMovedOtherwise` 的说明补了一句。spec「核对」一节加了一条（哪一边说了算跟着图层的 `direction`，按包含块读，以及审查后的那一句），「控制点」一节「同时按左右两边定位的…照旧按左边」后补了从右往左的例外；ADR 0014 的 Consequences 里 84 那句和 75 边界那句各补了一个分句。改动说明（`claim`）、`done` / `finish` 的说法都没改。

*代定的事（待设计师确认）*

我按「最贴近 75、80、83、84 和 ADR 0014」代定的：

1. **按包含块的 `direction`，不按图层自己的**：ticket 写「跟着图层自己的 direction」，但浏览器看的是包含块的（`relative` 是父元素，自由定位是定位参照）。「哪一边说了算」照浏览器，spec 里写成「跟着图层的 `direction`，按浏览器的定法读它的包含块」。两者只在图层自己（或它和包含块之间的元素）设了 `dir` 时不同。包含块只认 `position` 和变换（`transform`、`translate`、`rotate`、`scale`、`perspective`），`filter`、`contain`、`will-change` 让元素成为包含块的情况不读，见遗留风险第 2 条。
2. **自由定位的图层只在宽度（高度）定死时才有一边说了算**：宽度没写（`auto`）时两边都摆它（图层被拉宽），不是哪一边说了算，照旧按左边处理（75 的边界，`inset-x-0` 即 Figma 的 Left & Right）。「定死」按声明的 `width` 是不是 `auto` 读，`<img>` 这类自带尺寸的、`max-width` 卡住的不算，见遗留风险第 3 条。
3. **`placedFrom` 一起改，碰了 ADR 0014 的「按左边处理」**：从右往左、宽度定死、两边都写的图层按右边处理（移动改 `right`，改尺寸时左边不动），因为浏览器按右边摆它；照旧按左边的话，在桌面视图里移动它写 `left` 并把 `right` 设成 `auto`，图层会从右边跳到左边，改尺寸时左边跟着动，和 Figma 相反。规则和上面是同一条，改动很小。ADR 0014 那句补了这个例外。属性面板里这种图层的 X 仍读写的 `left`，不是画出来的位置，见遗留风险第 1 条。
4. **页面上的自由定位按浏览器把它摆在哪里核对（审查后修正，从左往右也变了）**：页面上自由定位的图层两边都写了值、宽度（高度）定死时，没说了算的那一边写的值不摆它，可算出来的值就是写的值。`done` 原来照读，从右往左的 X、从左往右的 `right`、上下方向的 `bottom` 都会报虚假的 ✓。现在那一边按浏览器把它摆在哪里算（包含块的宽度减去说了算的那一边、外边距和图层的宽度），没显示时用原来的说法（80、75 的「is drawn at …」），只是数是图层实际画在的地方。这条改了从左往右页面的 `done` / `finish` 输出，但只在原来报虚假的 ✓ 的这一种情况；上下方向哪一边说了算没变（`top`），只是 `bottom` 不再按写的值核对。不做的话，ticket 要的「不报虚假的 ✓」在从右往左的 X 上做不到；只修从右往左又会留下一条一样的从左往右的规则，所以一起修了。
5. **说法照 84 已确认的那套，不起新的**：从右往左时 `relative` 页面挪了多少，照样说「the page moves the layer 40px left」，按浏览器实际挪的方向和距离；自由定位照样说「is drawn at …」。
6. **`sticky` 不分方向**：两边的阈值浏览器都用，照 84 代定第 3 条，没改。

*测试*

接缝沿用 75、83、84 的选法（设计师和指挥不在场，没有当面商定）：编辑命令和页面核对（`edits.browser.test.ts`）、e2e 脚本扮演 Agent（`round.spec.ts`）。说法没改，命令行（`cli.test.ts`）没加测试，原有的逐字比对照旧全过。都先写、先在没改的代码上看着失败，再实现；从左往右的护栏改前改后都该过。

- **编辑命令和页面核对** `edits.browser.test.ts` +11 条（test.each 展开后算，含审查后加的 3 条），每条都是从左往右、从右往左各一：
  - 按右边定位的图层，画布在手机视图 `relative`、两边都写：从左往右 `right` 进 `placedOtherwiseAt`（护栏）；从右往左记下 `offsetInLayoutAt`，照改动写了显示，只在 `md` 以上写没显示，实际值是页面上按 `right` 挪的 12px。
  - X 的改动，页面在手机上 `relative`、另有自己的 `right: 5px`：从左往右显示（`left` 说了算）；从右往左没显示，实际值 -5（改前读 `left`，报虚假的 ✓）。
  - 按右边定位的图层，画布在手机视图自由定位、两边都写、宽度定死：从左往右进 `placedOtherwiseAt`（护栏）；从右往左不进，那个宽度照常核对，写对显示、写错没显示。
  - 自由定位、两边都写、宽度定死的图层在桌面视图移动、改宽度：从左往右照旧是 X、改宽度不记 `placedFrom`（护栏）；从右往左是 `right`，画出来往左挪 20px，改宽度时左边不动。
  - （审查后）X 的改动，页面在手机上自由定位、另有自己的 `right`：从左往右显示；从右往左没显示，实际值是画出来的 335px；照改动把 `right` 设成 `auto` 后显示。
  - （审查后）从左往右，`right` 的改动，页面在手机上另有自己的 `left`：没显示，实际值是画出来的 332px（改前报虚假的 ✓）。
  - 原有测试一条期望都没改。
- **e2e** `round.spec.ts` +1 条：就是上面「先复现」那条，断言改动单的两个范围和 `done` / `finish` 的逐字输出。改前失败（`placedOtherwiseAt` 记了手机、`done` 报 ✓）。
- **从左往右逐字不变，怎么确认的**：按代码看，`edgeGoneBy` 在从左往右时总答 `start`，`sideMoves`、`endOffsetPlaces`、`placedFrom`、`lookOffset` 都退回原来的式子；`placedAt` 只在两边都写、尺寸定死、改动的那一边不是说了算的那边时才换值（代定第 4 条）。按测试看，原有测试期望都没改、全部通过，其中有 `cli.test.ts` 的逐字比对和 e2e 的落地剧本（round、claim、applying-bench、bench-scenarios、next-round、react18-round 等）；上面每条单测的从左往右一半都是护栏。
- **全量**（审查修正之后的代码）：
  - typecheck 通过。
  - 单测 829 通过、1 跳过；node 测试 32 条通过（含旧名检查）。
  - e2e（`TK_E2E_PORT=5800 pnpm test:e2e`）400 条：399 通过、1 跳过，一次跑过，没有重跑。切换按钮体积检查（install.spec、toggle-first.spec）在里面，通过。审查修正之前那次全量里，page 一组有 3 条失败（`off-canvas.spec.ts:173`、`next-install.spec`，都是已知会抖的；`variables.spec.ts:246`，和本线不相干），project files 一组因此没跑；修正后这次全过，所以没有单独重跑那 3 条。

*按 code-review 修正*

跑了 code-review（Standards、Spec 两个子 agent 并行）。改了：

- Spec、Standards 都指出：X 的改动在从右往左、页面上自由定位两边都写的宽度上，`lookPosition` 读到写的 `left`，会报虚假的 ✓（从左往右的 `right` 也一样，75 起就有）。改为按浏览器把它摆在哪里核对（`placedAt`，代定第 4 条）；加了 3 条单测，在前一个提交上失败。
- Standards：`containingBlockOf` 只认 `transform`，Tailwind v4 的 `-translate-x-1/2` 写的是 `translate`：补上 `translate`、`rotate`、`scale`、`perspective`。`endGoneBy` 和 `edgeGoneBy` 名字只差两个字母，改叫 `sizedFromEnd`；`placedFrom` 里重复了 `endOffsetPlaces` 的式子，改为直接用它；`lookOffset` 里两次反号的式子提成 `movedAcross`，`sticky` 时不再白算；两段说明重新折行。

看了没改：

- Standards 说 `sideMoves` 的 `left` 那一边从右往左仍算挪动：X、Y 的改动在所有宽度同时写 `right: auto`，画布上那一边总是说了算，按画布定没错；页面上没让出来的情况由上面的 `placedAt`、`movedAcross` 核对。
- Spec 说没看到改前失败、包没量：改前失败和包的数字在本记录里（「先复现」「前后数字」）。
- Spec 说改 ADR 0014 超出了 ticket：`placedFrom` 改了 ADR 0014 写明的「按左边处理」，84 也在那里补过一句，按指挥的意思补了。
- `Status:` 没改成 done：留给指挥。
- `<img>`、`max-width` 的定死尺寸：写进遗留风险。

*前后数字（docs/goals.md「度量」）*

包体积（gzip -9）：切换按钮 `react.dev.js` 1423 B（gzip 822 B）+ 共用 chunk `chunk-UQJRS7YD.js` 21575 B（gzip 9164 B），改前改后逐字节相同（同名，sha256 前 16 位 `c83849f1557e0b1b`、`cdd6f09dfeaf13fa` 前后一样）。编辑层延迟加载的部分 `editor.dev.js` 323972 → 324857 B（未压缩，+885 B），gzip 110054 → 110357 B（+303 B）。

性能没有跑：多出来的只在 X、Y、`right` / `bottom` 改动第一次记下时，旁边视图里图层两边都写了值才多读包含块的 `direction`（往上找定位参照，只读样式）；核对时每个 `relative` 实例多读一次包含块的样式，自由定位的实例两边都写、尺寸定死时多量一次包含块。拖拽和连续改值的后续步子不读。

*遗留风险*

1. **属性面板里的 X**：从右往左、宽度定死、两边都写的自由定位图层，面板的 X 读的是写的 `left`，不是画出来的位置。移动、微移、拖拽按差值改 `right`，结果是对的；在面板里直接输一个 X 会差出写的 `left` 和实际位置之差。不报虚假的 ✓。要修得让 X 按画出来的位置读，牵动面板和改动单，没在这条线做。
2. **包含块只认 `position` 和变换**：`filter`、`contain`、`will-change` 也让元素成为包含块；只有那个元素和再往上的定位参照方向不同时才会读错，很少见。
3. **「宽度定死」按声明读**：`<img>` 这类自带尺寸的、`max-width` 卡住的图层，两边都写时浏览器也按一边摆，这里当成两边都摆它（按左边处理，`right` 在从右往左时仍进 `placedOtherwiseAt`、不看），可能漏看，报虚假的 ✓ 的可能和改前一样。
4. **84 的遗留风险第 6 条在从右往左时反过来**：页面 `relative` 两边都写、从右往左时，X 的改动没显示，`done` 说「give it `left` 30px at this width too」，可页面上 `left` 已经是 30px，真正要去掉的是 `right`。不报虚假的 ✓，等 ticket 88 的数据和 84 的第 6 条一起看。
5. **读一次的记录会过时**、**一个视图代表一整段宽度**：同 75、83、84，不变。
6. 没跑真实 Agent。

