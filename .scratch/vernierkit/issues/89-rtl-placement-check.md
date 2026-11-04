# 89: 从右往左排的页面上，左右两边都写了值时，`done` 可能报虚假的 ✓

**What to build:** 页面或图层是从右往左排的（`direction: rtl`，例如阿拉伯语、希伯来语的网站）时，图层左右两边都写了值，浏览器按 `right` 定它的位置，`left` 不起作用；从左往右时正好相反。ticket 75、83、84 判断「这一边挪不挪它」、核对「页面上挪了多少」时都按从左往右算。于是在从右往左的页面上，画布上真正起作用的 `right` 会被当成不挪它，那个宽度就不看了，Agent 写错了也报 ✓。要做到：哪一边说了算，跟着图层自己的 `direction`。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准（「Faithful」：虚假的 ✓ = 0），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0011、0014）。

**Blocked by:** 无（84 已完成）

**Status:** done

- [x] 先复现，用剧本或单元测试（脚本扮演 Agent，不跑真实 Agent）：从右往左的页面上，一个图层在手机上 `relative`，左右两边都写了值，在平板、桌面上按右边自由定位；在桌面视图改它的 X（ADR 0014，写成 `right`），Agent 只写 `md:right-[…]`，`done` 现在报 ✓
- [x] 判断「这一边挪不挪它」（84 的 `relative`，75 的自由定位、左右都写了值并且宽度定死的情况）和核对「页面上挪了多少」时，按图层算出来的 `direction` 定哪一边说了算。代码里改文字对齐、找样式出处的地方已经这样读 `direction`，照着做
- [x] 上下方向不受影响（`top` 总是说了算），不改
- [x] 不报虚假的 ✓；没显示时的说法照 84 已确认的那套，不另起新说法（要是非起不可，记进代定）
- [x] 从左往右的页面上，`claim`、`done`、`finish` 的输出逐字不变；切换按钮的包逐字节不变（包逐字节相同；输出只在原来就错的几种情况变了，见代定第 4 条，指挥代定接受，待设计师确认）
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

验收项基本都做到了，照设计师选的做法 1。图层左右两边都写了值时，哪一边说了算跟着浏览器的定法：看图层**包含块**的 `direction`（不是图层自己的，见「浏览器里看到的」），从左往右按 `left`，从右往左按 `right`；自由定位的图层只在宽度定死时才有一边说了算。「这一边挪不挪它」（84 的 `relative`，75 的自由定位）、「页面上挪了多少」（`lookOffset`），以及移动、改尺寸按哪一边（`placedFrom`）都照这个读。ticket 说的那条剧本在改前报虚假的 ✓，改后报没显示，写对了报 ✓。上下方向 `top` 总是说了算，没改。说法没起新的，都是 84 已确认的那套。从左往右的页面，`claim` 不变，`done`、`finish` 只在一种情况变了：页面上自由定位的图层两边都写了值、尺寸定死（审查后按几何读）时的 `right`（`bottom`）改动，现在按浏览器把它摆在哪里核对，三种结果会变（见代定第 4 条，原来写成「只在原来报虚假的 ✓ 时」，不对，见「按审查修正」）；别的逐字不变。切换按钮的包逐字节相同。

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
- **由窗口定位时看 `body` 的方向**（按审查修正时补看的）：没有定位参照的自由定位图层、固定在窗口上的图层，浏览器按 `body` 的 `direction` 定哪一边说了算，`<html dir="rtl"><body dir="ltr">` 按 `left`，`<html><body dir="rtl">` 按 `right`；`html` 自己定位了（`position: relative`）也一样看 `body`。和 CSS Writing Modes 说的根元素从 `body` 取方向一致。别的发现见「按审查修正」。

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
4. **页面上的自由定位按浏览器把它摆在哪里核对（审查后修正，从左往右也变了）**：页面上自由定位的图层两边都写了值、宽度（高度）定死时，没说了算的那一边写的值不摆它，可算出来的值就是写的值。`done` 原来照读，从右往左的 X、从左往右的 `right`、上下方向的 `bottom` 都会报虚假的 ✓。现在那一边按浏览器把它摆在哪里算（包含块的宽度减去说了算的那一边、外边距和图层的宽度），没显示时用原来的说法（80、75 的「is drawn at …」），只是数是图层实际画在的地方。这条改了从左往右页面的 `done` / `finish` 输出，在这种图层的 `right`（`bottom`）改动上有三种结果会变：(a) 原来报虚假的 ✓ 的（`right` 写对了，`left` 却把它摆在别处），现在报没显示；(b) 原来就没显示的，仍是没显示，只是「is drawn at …」后面的数从没说了算那一边写的值换成画出来的位置；(c) 原来报没显示的、其实是对的（`right` 过时，但 `left` 已经把它摆在画布那里），现在报 ✓。按审查修正后还多两处走这条：几何上定死的（`max-width`、`<canvas>`），和移动、新建图层的核对（`placedThere`，ticket 79、76）。ticket 说「上下方向不受影响」，指的是哪一边说了算（`top` 总是说了算），这一点没变；但上下方向的 `bottom` 改动在这种情况下的 `done` 也照上面三种变了。不做的话，ticket 要的「不报虚假的 ✓」在从右往左的 X 上做不到；只修从右往左又会留下一条一样的从左往右的规则，所以一起修了。
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
- **从左往右逐字不变，怎么确认的**：按代码看，`edgeGoneBy` 在从左往右时总答 `start`，`lookOffset` 退回原来的式子；`sideMoves`、`endOffsetPlaces`、`placedFrom` 不全是（复审后改正：审查后它们按 `sideDeclared` 读逻辑方向的边和 `inset`，从左往右写 `inset-inline-end`、`inset-inline` 两个值、四个值的 `inset` 的图层，现在按右边、下边定位，见代定第 4 条 (f)）；页面那边换值见「复审后修正」，只在两边都写并且排出来对不上空间时才换（原来写成「尺寸定死」）。按测试看，原有测试期望都没改、全部通过，其中有 `cli.test.ts` 的逐字比对和 e2e 的落地剧本（round、claim、applying-bench、bench-scenarios、next-round、react18-round 等）；上面每条单测的从左往右一半都是护栏。
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
2. **包含块读错时，核对的空间也错**（按审查修正后改写，原来说得太轻）：审查后 `placedAt` 用包含块的空间算没说了算的那一边，包含块找错了，不只方向会错，空间也错，一个从左往右本来对的 ✓ 会变成没显示。现在认 `position`（含定位了的 `html`）、所有变换、`filter`、`backdrop-filter`、`contain`、`will-change`，跳过 `display: contents`，和冻结时判断固定图层用的是同一条规则（`holdsPlacedLayers`）。还不认的：行内的定位参照（空间按它的外框量，折行时不准）、`<dialog>` 顶层这类，很少见。
3. **画布那边「宽度定死」仍按声明读**（复审后改写）：页面的核对按几何判断，画布那边（旁边视图第一次记下时、`placedFrom`）照 ADR 0011 不排版，按声明的宽度、高度，复审后加上自带尺寸的元素（`img`、`canvas`、`video`、`iframe`、`svg`、`input`、`object`、`embed`，只看标签）。还漏的只有 `max-width` / `min-width` 卡住的：从右往左两边都写时浏览器按右边摆，这里当成两边都摆它（`right` 仍进 `placedOtherwiseAt`、那个宽度不看），可能漏看，和改前一样。
4. **84 的遗留风险第 6 条在从右往左时反过来**：页面 `relative` 两边都写、从右往左时，X 的改动没显示，`done` 说「give it `left` 30px at this width too」，可页面上 `left` 已经是 30px，真正要去掉的是 `right`。不报虚假的 ✓，等 ticket 88 的数据和 84 的第 6 条一起看。
5. **读一次的记录会过时**、**一个视图代表一整段宽度**：同 75、83、84，不变。
6. 没跑真实 Agent。

**按审查修正（2026-11-03）**

指挥另跑了独立审查（effort high），找到几条还会报虚假的 ✓（或把对的 ✓ 报成没显示）的路，在同一条分支上修了（分支先同步过 main，8180016，带进 ticket 85 的 bench，没有再合并）。每条都先写测试、在当时的分支（fd1469b 之后的 8180016）上看着失败，再改。

*先在浏览器里看了*（Playwright 的 headless shell，临时的探测测试，没留在仓库里）。容器里图层 50px 宽，`left: 10px; right: 30px`：

- 没有定位参照的自由定位图层、固定图层：按 `body` 的方向（见上面「浏览器里看到的」最后一条）。
- 让元素成为定位参照的：`filter`、`backdrop-filter`、`contain: paint`、`will-change: transform`、`translate`、`transform` 都是（图层摆在那个 200px 的盒子里）；`container-type: inline-size`、`container-type: size` **不是**（自由定位、固定的图层都不摆在它里面）。冻结时判断固定图层的 `fixedToViewport` 原来把 `container-type` 也当成会接住固定图层，是错的。
- `display: contents` 的元素定位了也不是定位参照。
- `relative` 图层的父元素是 `display: contents` 或行内的 `<span>`、写了 `dir="ltr"`，外面是从右往左的块：浏览器按外面那个块的方向（按 `right` 挪）；父元素是 `inline-block` 时按它自己的方向（它自己是块）。
- 从右往左只写 `inset-inline-start: 5px`：算出来 `right` 是 5px，图层贴右边。
- 两边都写、宽度没写但 `max-width: 50px`，或 `<canvas>` 自带 50px 宽：从右往左都按 `right` 摆（宽度一样是定死的）。

*找到的和改的*

1. **`dir` 写在 `body` 上**（确认会报虚假的 ✓）：没有定位参照的、固定的图层，原来读 `html` 的方向。从右往左写在 `body` 上的页面，X 的改动 Agent 只写 `left: 30px`、页面手机上还有自己的 `right: 5px`，浏览器按 `right` 画在 335px，`done` 却报 ✓；`<html dir="rtl"><body dir="ltr">` 则反过来把对的报成没显示。改为包含块是窗口或根元素时读 `body` 的方向（`directionPlacing`，新文件 `client/containing-block.ts`），画布那边（`placedFrom`、`sideMoves`、`endOffsetPlaces`）和页面那边都照这个。
2. **逻辑方向的边**（确认会报虚假的 ✓）：「写了 `left` / `right` 没有」原来经 `declaredValue` 和 `style-source.ts` 的 `SHORTHANDS`，`inset-inline`、`inset-inline-start` 不管方向都算 `left`，`right` 什么都不认（`inset` 也不认）。Tailwind v4 的 `start-[5px]` 在从右往左的页面上写的是 `right`，`inset-x-*` 写 `inset-inline`。改为在 `placed-from.ts` 自己读（`sideDeclared`）：编辑写的物理边优先；页面上按图层自己的方向把 `inset-inline-start` / `-end`、`inset-inline`（两个值分给两边）、`inset` 对到物理的边。`style-source.ts` 只在编辑层的包里，但它的 `SHORTHANDS` 也决定改动说明里「Currently set by」写什么，改它会让从左往右的 `claim` 变，所以没动它。
3. **按几何判断「定死」**（`placedAt`）：页面那边不再看声明的宽度，而是看边、外边距和尺寸加起来和包含块的空间差不差 0.5px 以上，差就是有一边说了算。`max-width` 卡住的、`<canvas>` / `<img>` 自带尺寸的都认得了。画布那边照 ADR 0011 不排版，仍按声明的宽度、高度（见代定第 2 条、遗留风险第 3 条），原来的规则就这一处没改。
4. **包含块找错，空间也错，把对的 ✓ 报成没显示**（确认）：从左往右，图层在一个 `filter: blur(0)`、200px 宽的盒子里，页面上 `right: 32px; left: 118px; width: 50px` 正好摆在画布那里，原来 ✓，第一轮审查修正后读成「not shown」、数是 222（按 390 的空间算）。改为一条共用的规则 `holdsPlacedLayers`：所有变换（`transform`、`translate`、`rotate`、`scale`、`perspective`）、`filter`、`backdrop-filter`、`contain`（`paint` / `layout` / `strict` / `content`）、`will-change`（`transform` / `perspective` / `filter`）；不含 `container-type`（探测过）。冻结时的 `fixedToViewport` 改用同一条，于是 `container-type` 盒子里的固定图层现在照窗口钉住（原来没钉，见代定第 7 条）。根元素自己定位了时，按它的空间算，不按窗口。这个模块只在编辑层的包里。
5. **移动、新建图层的核对**（ticket 79、76 的 `placedThere`）：按某一边定位的那一边，原来比的是写的值，那个方向又不再按画出来的位置看，从左往右也会报虚假的 ✓（按右边定位的图层挪了，Agent 写 `right-[N]` 却留着 `left-…` 和定死的宽度）。改为 `placedAt` 读它被摆在哪里；按份额居中时乘的空间也改用包含块的空间（原来 `roomOf` 在两边都写时算的是写的值之和，`lookPosition` 居中那一支同样改了）。
6. **`relative` / `sticky` 的包含块**：原来直接取父元素，父元素是 `display: contents` 或行内元素、方向和外面不同时读错（审查确认会报虚假的 ✓）。改为往上找到第一个排版用的块，跳过 `display: contents` 和 `display: inline`。spec 里「`relative` 的是父元素」的说法一并改了。
7. **Standards**：`movedAcross` 改叫 `movedAlong`（across 在这里专指横向）；`TRANSFORMS` 没了，并进 `holdsPlacedLayers`；画布那边「尺寸定死并且按尾边说了算」合成一条 `endGoneBy`（`relative` 只看方向，自由定位还要尺寸定死），`sideMoves`、`endOffsetPlaces`、`placedFrom` 都用它；`placedOn` 只用一个取整（`rounded`）；`changeset.ts`、`edits.ts` 的说明重新折行。
8. **补的测试**见下。

*看了没改*

- `sideMoves` 的 `left` / `top` 那一边：X、Y 的改动在所有宽度同时写 `right: auto` / `bottom: auto`，画布上那一边总是说了算，照旧算挪动；页面上没让出来的由 `placedAt`、`movedAlong` 核对。
- 画布那边的「尺寸定死」不改成几何的：旁边视图第一次记下时不排版（ADR 0011）。
- `style-source.ts` 的 `SHORTHANDS`：理由见上面第 2 条。
- 行内的定位参照、顶层（`<dialog>`、popover）：很少见，写进遗留风险。

*测试和数字*

- `edits.browser.test.ts` +26 条（test.each 展开后算），都是先在当时的分支上失败、改后通过的，护栏和钉住现状的除外：
  - 由窗口定位：自由定位、固定各一，`dir` 在 `body` 上，没显示、数是画出来的 335px；`<html dir="rtl"><body dir="ltr">` 显示了（原来没显示）。移动这种两边都写的图层：`body` 从右往左改 `right`，`html` 从右往左而 `body` 从左往右改 X。
  - 逻辑方向：`inset-inline-start` 从右往左、`inset-inline` 两个方向，移动时改说了算的那一边，画出来往左挪 20px（从左往右那一条是护栏）。
  - 几何上定死：`max-width` 卡住（从左往右，`right` 的改动，没显示、332px），`<canvas>` 自带尺寸（从右往左，X 的改动，没显示、335px）。
  - 包含块的空间：`filter`、`backdrop-filter`、`contain: paint`、`will-change: transform`、`translate`、`transform`、`perspective` 的 200px 盒子里摆对了显示（原来前四种没显示）；`container-type: inline-size` 的盒子里浏览器按 board 摆，没显示、222px（钉住现状）。
  - `relative` 的包含块：父元素 `display: contents` 写了 `dir="ltr"`、行内 `<span dir="ltr">`、图层自己写 `dir="ltr"`（代定第 1 条，钉住），从右往左的块里都按 `right`：记下 `offsetInLayoutAt`，写对了显示。
  - `bottom`：从左往右、从右往左各一，页面上下都写、高度定死，按 `top` 说了算，没显示、72px（上下方向不分方向，钉住）。
  - `placedAt` 的外边距、内边距、边框和 `box-sizing`：`content-box` 302px、`border-box` 312px，外边距 4px，包含块带 5px 边框。
  - (c) 那种：从左往右 `right` 过时、`left` 已经把它摆在画布那里，显示了（钉住，第一轮审查修正后就是这样）。
  - 移动的核对（ticket 79 那条）加一句：`right` 照改动写了、却留着 `left` 和定死的宽度，没显示（原来报 ✓）。
- `freezer.browser.test.ts` +1 条：窗口上、`container-type` 盒子里的固定图层都钉住，`filter` 盒子里的不钉。在旧的 `freezer.ts` 上失败。
- 全量（按审查修正之后的代码）：
  - typecheck 通过。
  - 单测 856 通过、1 跳过；node 测试 65 条通过（含 ticket 85 带进来的 bench 测试和旧名检查）。
  - e2e（`TK_E2E_PORT=5800 pnpm test:e2e`）400 条：399 通过、1 跳过，一次跑过，没有重跑。切换按钮体积检查在里面，通过。
- 包体积：切换按钮 `react.dev.js` 1423 B（gzip 822 B）、`chunk-UQJRS7YD.js` 21575 B（gzip 9164 B），sha256 前 16 位仍是 `c83849f1557e0b1b`、`cdd6f09dfeaf13fa`，逐字节相同；`editor.dev.js` 324857 → 325260 B（+403 B），gzip 110357 → 110540 B（+183 B）。新文件 `containing-block.ts` 只进编辑层的包。

*代定的事，更新后*（第 1、3、5、6 条同上，改写的是第 2、4 条，新加第 7 条）

1. 按包含块的 `direction`，不按图层自己的；包含块是窗口或根元素时看 `body` 的方向（按审查修正补的，照浏览器）。
2. 自由定位的图层只在尺寸定死时才有一边说了算：页面的核对按几何判断（`max-width`、自带尺寸都算）；画布那边按声明的宽度、高度，不排版（ADR 0011）。
3. `placedFrom` 一起改，从右往左、宽度定死、两边都写的按右边处理。
4. 页面上自由定位、两边都写、尺寸定死的图层，`done` 按浏览器把它摆在哪里核对，从左往右的 `right`、上下方向的 `bottom` 也一样，移动和新建图层的核对也一样。从左往右会变的三种结果见上面代定第 4 条的 (a)、(b)、(c)；上下方向哪一边说了算没变。指挥已按「代定」接受，条件是包含块那条（上面第 4 条）修好、不让对的从左往右的输出变，已修。
5. 说法照 84 已确认的那套。
6. `sticky` 不分方向。
7. **冻结时 `container-type` 盒子里的固定图层照窗口钉住**（新加）：探测过浏览器不把 `container-type` 当成接住固定图层的盒子，原来的判断把这种图层当成不在窗口上、不钉。现在和浏览器一样，画布上它跟着窗口的位置冻结；只影响这一种页面。

*遗留风险，更新后*

1. 属性面板里的 X（同上）。
2. 包含块读错时，核对的空间也错（已改写，见上面遗留风险第 2 条）：还不认行内的定位参照（空间按外框量）、顶层的 `<dialog>` / popover。
3. 画布那边「尺寸定死」仍按声明读（已改写，见上面遗留风险第 3 条）。
4. 84 的遗留风险第 6 条在从右往左时反过来（同上）。
5. **逻辑的边和物理的边谁算数，没按层叠的先后排**（复审后改写）：`sideDeclared` 先看物理的边，只要哪条规则写了它就算它，再看逻辑的边、`inset-inline`、`inset`，各按自己的层叠取胜者，彼此之间按这个固定次序，不按哪条规则在后、哪条更具体；同一个块里也按 `SHORTHANDS` 的次序，不按书写次序。例如从左往右 `right-[10px] md:end-auto`，到 `md` 浏览器让 `right` 是 `auto`，这里仍当成写了 `right`。还有 `writing-mode` 竖排时逻辑的边不对到左右，按横排算。很少见。
6. 读一次的记录会过时、一个视图代表一整段宽度；没跑真实 Agent（同上）。

**暂停于 2026-11-03**

独立审查找到的 1–8 条都改完、补了测试（c4196a3），全量通过：typecheck、单测 856 通过 1 跳过、node 65 条、e2e 399 通过 1 跳过，没有重跑；切换按钮的包逐字节相同。还剩：「从左往右输出逐字不变」那一项留给指挥定（代定第 4 条），代定第 7 条和更新后的代定、遗留风险等设计师确认；按审查修正后没有再跑 code-review。

**复审后修正（2026-11-04）**

指挥让独立审查（effort high）复审了 c4196a3，找到两处会改掉从左往右本来对的输出，外加几条小的。分支先同步过 main（957f717，带进 ticket 87），没有再合并。每条修正都先写测试、在当时的分支（957f717）上看着失败；最后把改后的源码临时换回 957f717 的版本，又跑了一遍新测试确认都失败，再换回来。

*在浏览器里看了*（headless shell，临时的探测测试，没留下）：

- 让元素接住自由定位、固定图层的，Chromium 还认：`will-change` 写 `translate`、`rotate`、`scale`、`filter`、`perspective`、`contain`、`transform`（`opacity` 不认），`content-visibility: auto` / `hidden`，`transform-style: preserve-3d`。`container-type` 仍不认。
- 根元素上的 `filter` 不接住固定图层：页面滚了 500px，固定在 `top: 10px` 的图层仍在窗口的 10px 处。
- 缩放了的容器（`transform: scale(0.5)`，400px 宽）：`getBoundingClientRect` 是 200，`clientWidth` 和算出来的 `width` 是 400。
- headless shell 的滚动条是浮在上面的，不占地方：`overflow-y: scroll`、`scrollbar-gutter: stable`、`scrollbar-width: thin`、`::-webkit-scrollbar { width: 15px }` 的 200px 盒子，`clientWidth` 都是 200。所以有滚动条的情形测不了，代码照算（减去 `offsetWidth` 和 `clientWidth` 之差），没有测试钉住。

*找到的和改的*

1. **空间按画出来的框量**（高，确认）：按审查修正时 `placedAt` 用 `getBoundingClientRect` 量包含块的空间，把容器和它祖先的变换（缩放、旋转）都算进去了，而图层自己的边、外边距和尺寸是按排版算的，两者一对不上就当成「两边都写、没让出来」，把从左往右的 `right` / `bottom` 读错：容器 `transform: scale(0.5)` 时写对了的 `right: 32px` 报没显示、数是 -368；`rotate: 10deg` 时数是 37.21；main 报 ✓。居中的（`translate: -50%`）也一样，main 报 ✓、按审查修正后报没显示。改了两处：
   - 换值要先有两边都写了值（`sideDeclared`，左右两边都写，或上下都写），再看排出来对不上空间（`overConstrained`）；只写一边的永远不换，和 main 一样读算出来的值。
   - 空间改按排版量（`roomPlacing`）：包含块算出来的宽、高，按 `box-sizing` 加上内边距或去掉边框，再减去滚动条；由窗口定位的用根元素的 `clientWidth` / `clientHeight`；行内的包含块没有宽、高可读，照旧按框量。
   - 居中和移动的核对（`lookPosition` 居中那一支、`placedThere`）用的空间改为 `roomAlong`：没对不上时就是 main 用的 `roomOf`（改名 `extentOf`，边、外边距和尺寸加起来），对不上时才用包含块的空间。这样不是「两边都写、对不上」的图层，三处都和 main 逐字一样。
2. **三个值的 `inset` 读错**（中，确认）：浏览器把 `inset` 写成最短的样子，三个值时左边是第 2 个，两个值时下边是第 1 个；原来按「不够就取最后一个」读，`inset: 0 0 auto 0` 的左边读成 `auto`，从左往右移动这条横条就记成 `right` 0 → -20、画布上它被拉宽、`claim` 也变了（main 记 X）。改为按值的个数查表（1 到 4 个值各一套）。
3. **从左往右逻辑方向的边，`claim` 变了**（对的，原来没记）：从左往右写 `inset-inline-end`（Tailwind v4 的 `end-4`）或两个值的 `inset-inline: auto 16px` 的图层，现在按右边定位，移动记 `right` 16 → 36；main 记 X、写 `left: …; right: auto`，把它改成按左边定位，违背 ADR 0014。加了测试钉住，记进代定第 4 条 (f)。
4. **逻辑的边和物理的边谁说了算**（低，可能）：要按层叠先后排四种写法（物理的边、逻辑的边、`inset-inline`、`inset`），得把 `style-source.ts` 里层叠比较的内部（层、具体程度、次序）导出来再比，不是小改动，没做；遗留风险第 5 条改写成「跨规则也按固定次序」，带上例子。
5. **自带尺寸的元素**（可能报虚假的 ✓）：画布那边「尺寸定死」按声明读，从右往左两边都写、没写宽度的 `<img>` / `<canvas>` 在旁边视图里进了 `placedOtherwiseAt`、那个宽度不看。改为这几种标签（`img`、`canvas`、`video`、`iframe`、`svg`、`input`、`object`、`embed`）都算定死，只看标签，不排版（ADR 0011）。
6. **一条共用的规则**：冻结时的 `fixedToViewport` 改为直接用 `containingBlockOf`（于是也跳过 `display: contents`）；`holdsPlacedLayers` 照上面探测的结果加上 `content-visibility`、`preserve-3d` 和 `will-change` 的那几个值，根元素上的 `filter` / `backdrop-filter` 不算。冻结后钉不钉住因此又变了几种，见代定第 7 条。两个模块都只在编辑层的包里。
7. **Standards**：`endGoneBy` 改叫 `endWins`；`check.ts` 居中那一支的手写取整改用 `rounded`；`placed-from.ts` 的 `placedAt` 和 `changeset.ts` 的 `placedAt(change)` 撞名，前者改叫 `offsetPlacing`；三个「room」各说各量什么：`extentOf`（原 `roomOf`，边、外边距和尺寸加起来）、`roomPlacing`（包含块按排版的空间）、`roomAlong`（核对用的，前两者里该用的那个），`roomIn` 的说明写明是按画出来的框量、给画布上拖放用；`directionPlacing` 的类型改成 `"ltr" | "rtl"`；`containing-block.ts` 的文件说明和第一个函数的说明分开了；`check.ts` 里 `sideOff` 那句注释重写。

*看了没改*

- 有滚动条的包含块：headless shell 的滚动条不占地方，测不了（见上），代码照算。
- `placedFrom`、`stillCentered` 判断居中时量的是图层画出来的框：页面上容器缩放了时，用 `transform` 居中的（Tailwind v3）会被当成没居中。main 就这样，和本 ticket 无关，写进遗留风险第 7 条；复审要的那条测试改用 `translate` 居中（Tailwind v4），它不受影响。
- 逻辑的边按层叠排：见上面第 4 条。

*测试和数字*

- `edits.browser.test.ts` +12 条（test.each 展开后算）：缩放、旋转的容器里只按右边定位的，`right` 写对了显示（复审确认的那种），两边都写时仍按 `left`、没显示、332px；`inset` 一到四个值（含三个值从下边的）各一，移动时按各方向定位的那一边记；从左往右 `inset-inline-end`、两个值的 `inset-inline`，移动记 `right` 16 → 36（钉住 main 之后的变化）；`<canvas>` 两边都写、没写宽度，从右往左不进 `placedOtherwiseAt`、从左往右进（护栏）；缩放的容器里用 `translate` 居中的，移动、改 X，写对了都显示。在 957f717 上失败的：缩放、旋转各一，三个值的 `inset`，从右往左的 `<canvas>`，居中那条；其余是护栏和钉住的。
- `freezer.browser.test.ts` +6 条：`display: contents` 加 `filter` 的盒子里、根元素加 `filter` 时，固定图层照窗口钉住；`will-change: translate`、`will-change: contain`、`content-visibility: auto`、`transform-style: preserve-3d` 的盒子里不钉。在 957f717 上都失败。
- 全量：typecheck 通过；单测 874 通过、1 跳过；node 测试 65 条通过；e2e（`TK_E2E_PORT=5800 pnpm test:e2e`）401 条：全量那次 page 一组 283 通过、2 条失败（`breakpoints.spec.ts:204` 播放的那条、`next-install.spec`），project files 一组因此没跑；两条单独重跑都通过；再用 `--project="project files" --no-deps` 跑 project files 一组：114 通过、1 跳过、1 条失败（`applying-bench.spec.ts:570` Agent 中途停很久那条，停住提示一类），单独重跑通过。合起来 400 通过、1 跳过。切换按钮体积检查在里面，通过。
- 包体积：切换按钮 `react.dev.js` 1423 B（gzip 822 B）、`chunk-UQJRS7YD.js` 21575 B（gzip 9164 B），sha256 前 16 位仍是 `c83849f1557e0b1b`、`cdd6f09dfeaf13fa`，逐字节相同；`editor.dev.js` 325260 → 326058 B（+798 B），gzip 110540 → 110841 B（+301 B）；和 ticket 89 开始前（323972 B，gzip 110054 B）比 +2086 B，gzip +787 B。

*代定第 4 条，最终：从左往右和 main 比，输出变了的地方*

只有下面这些，每种原来的输出都是错的。没找到本来对、现在变了的从左往右输出（复审找到的两处都已改回和 main 一样）：

- (a) 页面上自由定位的图层两边都写了值、排出来对不上空间（宽度、高度定死，`max-width` 卡住，自带尺寸），浏览器按 `left`（`top`）摆它，`right`（`bottom`）的改动：页面上 `right` 写对了却不起作用，原来读写的值、报 ✓，是虚假的 ✓；现在报没显示。
- (b) 同样的图层，原来就没显示的：仍是没显示，只是「is drawn at …」后面的数从写的值换成画出来的位置；原来的数是图层并不在的地方。
- (c) 同样的图层，`right`（`bottom`）过时、但 `left`（`top`）已经把它摆在画布那里：原来按写的值报没显示，图层其实就在画布那里；现在报 ✓。
- (d) 移动、新建图层的核对（`placedThere`，ticket 79、76）在同样的图层上：按右边、下边定位的那一边原来比写的值、另一方向不看画出来的位置，`right` 写对却被 `left` 盖过时报 ✓；现在按它被摆在哪里比，(a)、(b)、(c) 三种同样会变。
- (e) 上下方向：`top` 总是说了算没变，但 `bottom` 的改动在同样的情况下照 (a) 到 (d) 变。ticket 说的「上下方向不受影响」指的是哪一边说了算，不是核对的输出。
- (f) 画布上（`claim` 的改动、改动单）：从左往右用逻辑方向的边或 `inset` 定位在右边、下边的图层（`inset-inline-end`、`end-*`，`inset-inline: auto 16px`，`inset-block-end`，四个值的 `inset: auto 0 0 auto`），现在照 ADR 0014 按右边、下边定位，移动、改尺寸记 `right` / `bottom`；main 读不出这些写法里的右边、下边，记成 X / Y、写 `left: …; right: auto`，悄悄把它改成按左边定位。
- 另外冻结的画布（不是 `claim` / `done` / `finish` 的输出）钉住固定图层的几种情况变了，见代定第 7 条。

*代定的事，最终*

1. 按包含块的 `direction`，不按图层自己的；包含块是窗口或根元素时看 `body` 的方向；`relative` / `sticky` 的包含块是排它的那个块，跳过 `display: contents` 和行内元素。
2. 自由定位的图层只在排出来对不上空间时才有一边说了算：页面的核对按排版的几何判断（要两边都写了值）；画布那边按声明的宽度、高度，加上自带尺寸的元素，不排版（ADR 0011）。
3. `placedFrom` 一起改：从右往左、宽度定死（或自带尺寸）、两边都写的按右边处理。
4. 页面上两边都写、对不上空间的自由定位图层按浏览器把它摆在哪里核对，从左往右的输出照上面 (a) 到 (f) 变；指挥已按代定接受（条件是对的从左往右输出不变，复审后已做到）。
5. 说法照 84 已确认的那套，不起新的。
6. `sticky` 不分方向。
7. 冻结时钉不钉住固定图层，照 Chromium 的定法：`container-type` 盒子里的、`display: contents` 盒子上的 `filter` 底下的、根元素有 `filter` 时的，现在钉住（原来不钉）；`will-change: translate` / `rotate` / `scale` / `contain`、`content-visibility: auto` / `hidden`、`transform-style: preserve-3d` 的盒子里的，现在不钉（原来钉住，画布上它跟着窗口摆，实际上跟着那个盒子）。

*遗留风险，最终*

1. 属性面板里的 X：从右往左、宽度定死、两边都写的自由定位图层，面板的 X 读写的 `left`，不是画出来的位置。不报虚假的 ✓。
2. 包含块读错时，核对的空间也错：还不认行内的定位参照（空间按外框量，折行时不准）、顶层的 `<dialog>` / popover。有滚动条的包含块在 headless shell 里测不了。
3. 画布那边「尺寸定死」按声明读，自带尺寸的元素按标签算：`max-width` / `min-width` 卡住的从右往左可能漏看（见上面第 3 条，已改写）。
4. 84 的遗留风险第 6 条在从右往左时反过来：`done` 叫 Agent 给 `left` 一个它已经有的值，真正要去掉的是 `right`。不报虚假的 ✓，等 ticket 88。
5. 逻辑的边和物理的边按固定次序算，不按层叠先后（见上面第 5 条，已改写）。竖排的 `writing-mode` 按横排算。
6. 读一次的记录会过时、一个视图代表一整段宽度；没跑真实 Agent。
7. **页面上的容器缩放、旋转了时，用 `transform` 居中的图层**（main 就有）：`placedFrom`、`stillCentered` 按图层画出来的框判断居中，容器缩放时 Tailwind v3 的 `-translate-x-1/2` 会被当成没居中，报没显示。不报虚假的 ✓；`translate` 居中（Tailwind v4）不受影响。

**合并前全量（2026-11-04，指挥）**

两轮独立审查（effort high）都跑了：第一轮找到 `body` 上的 `dir`、逻辑写法的边、包含块认错量错空间、移动的核对、`display: contents` 的父元素，第二轮（复审）找到空间按画出来的框量、三个值的 `inset` 读错，两处都会改掉对的从左往右输出，已改，见上面两节。复审之后我看了 `offsetPlacing`：只有两边都写了值、排出来又对不上空间时才换成画出来的位置，别的情况直接是算出来的值，和 main 一样；空间按排版量（算出来的尺寸、内边距、减滚动条），不按画出来的框。

分支先同步了 main（9cbef6c，带进 87 的确认和 90 的分诊，只有 ticket 文件，和本线不重叠），在同步后的代码上跑：

- `pnpm typecheck` 通过。
- `pnpm test`：单测 874 通过、1 跳过；node 测试 65 条通过。
- `TK_E2E_PORT=5800 pnpm test:e2e`：402 通过、1 跳过、1 失败。失败的是已知会抖的 `applying-bench.spec.ts:241`「the Agent stops halfway, with no finish; the toggle says so …」（停住提示），用 `--project="project files" --no-deps` 单独重跑通过。切换按钮体积检查在里面，通过。
- 包体积（这次构建）：`react.dev.js` 1423 B（gzip 822 B，sha256 前 16 位 `c83849f1557e0b1b`）、`chunk-UQJRS7YD.js` 21575 B（gzip 9164 B，`cdd6f09dfeaf13fa`），和 ticket 89 开始前逐字节相同；`editor.dev.js` 323972 → 326058 B（+2086 B），gzip 110054 → 110841 B（+787 B）。
- 合上盖子的状态是开着（`AppleClamshellState = No`）；没有跑计时的性能测试（多出来的读法只在改动第一次记下时和 `done` 的核对里，拖拽的路上没有新的排版，见复审）。

`done` / `finish` 前后见实现记录；代定 7 条、遗留风险 7 条见「代定的事，最终」「遗留风险，最终」。代定第 4 条（从左往右的输出在 (a) 到 (f) 几种原来就错的情况下变了）是指挥按 docs/goals.md「虚假的 ✓ = 0」和设计师分诊时「每处会报虚假的 ✓ 的地方都修」代定接受的，条件是对的从左往右输出不变，复审后已做到，待设计师确认。遗留风险第 1 条（属性面板的 X）如果要做，另开 ticket，编号在 main 上给。

合并前 main 又合进了 ticket 92（2515c21、b9ee04f，只改了 bench，和本线不重叠），再同步一次（aed39ef）重跑：typecheck 通过；单测 874 通过、1 跳过，node 测试 75 条通过；e2e 401 通过、1 跳过、2 失败，都是已知会抖的停住提示一类（`applying-bench.spec.ts:310`、`:570`），用 `--project="project files" --no-deps` 单独重跑都通过。切换按钮 sha256 前 16 位仍是 `c83849f1557e0b1b`、`cdd6f09dfeaf13fa`。
