# 84: 图层在某些宽度相对挪动（`relative`、`sticky`）时，`done` 要 Agent 去设 `position`，`right` / `bottom` 在那里不看

**What to build:** 页面里有的图层在某些宽度是相对挪动（`relative` 或 `sticky`），在别的宽度自由定位，例如 `relative md:absolute md:left-[40px]`：手机上 `relative`，平板、桌面 `absolute`。在桌面视图里改它的 X 或 Y，改动作用于所有宽度，`left` / `top` 对 `relative` 也起作用，画布的手机视图里它也跟着挪了。现在有两个空子：

- **X、Y（83 留下的）**：那个宽度照常核对（83 代定第 1 条，设计师 2026-11-03 确认），但核对只认自由定位的图层。Agent 照改动写对了（`left-[60px]` 在所有宽度都有），`done` 仍说「At 390px wide, the layer is not placed absolute … check its `position` and `left`」，把 Agent 引去改 `position`，可能把手机上的排版改坏。
- **`right` / `bottom`（75 留下的）**：按右边、下边定位的图层，画布在某个视图里是 `relative` 时，那个宽度不看 `right` / `bottom`（`placedOtherwiseAt`）。可是 `left` 为 `auto` 时 `right` 在那里也挪动图层，Agent 写错了也可能报 ✓，是虚假的 ✓。

要做到：这种宽度上 `done` 比对图层的偏移本身，写对报 ✓，写错时说清这个宽度还要挪多少，不提 `position`。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0006、0008、0011、0013、0014）。

**Blocked by:** 无（83 已完成）

**Status:** done

- [x] 先复现，用剧本（脚本扮演 Agent，不跑真实 Agent）：(a) `relative md:absolute md:left-[40px]` 的图层，桌面视图改 X，Agent 写对，`done` 现在报「not placed absolute … check its `position`」；(b) 手机上 `relative`、平板桌面按右边定位的图层，桌面视图改 X（ADR 0014，写成 `right`），Agent 只写 `md:right-[…]`，`done` 现在报 ✓
- [x] X、Y 改动和按右边、下边定位的改动第一次记下时，除了 83、75 已记的宽度，再记下画布在旁边视图里是 `relative` / `sticky` 的宽度范围（改动单新字段）。按画布定，不按 Agent 改完后的页面定；读法照 75 代定第 4 条（第一次记下时读一次，ADR 0011）
- [x] 在这些宽度上比对偏移本身：页面上图层在那个宽度也是 `relative` / `sticky`（和画布一样），并且 `left`（`top`、`right`、`bottom`）等于改动的值，才算显示了。页面上在排版里（`static`），或在那里被改成了自由定位，都不算显示了
- [x] 没显示时换新说法：说这个宽度画布上把图层挪多少、页面上它的值是多少（或没挪动它），不提 `position` 和定位参照。`finish` 报告里 Why 那一行要有相应的一句。说法照 80 的口吻写，由这条线代定，等设计师确认
- [x] 不报虚假的 ✓（docs/goals.md）：`static` 的宽度照 83 跳过，`absolute` / `fixed` 的宽度照 80 的说法核对，都不变
- [x] 83 遗留风险第 7 条一并看：所有宽度都被跳过时的原因，在新做法下是不是仍然成立，不成立就改
- [x] 没有这种图层的场景，`claim`、`done`、`finish` 的输出逐字不变；切换按钮的包逐字节不变
- [x] 剧本或单元测试覆盖：`relative`、`sticky` 各一，X 和 `right` 各一，写对、写错各一

## 背景

- ticket 83 整线审查时发现（2026-11-03），见 83 的遗留风险第 5、6、7 条和「审查后修正」一节的「第二步的可选做法」。83 那条线已经起草过一句说法，可以从它出发：「At 390px wide, the layer is laid out static, so its `left` moves nothing, where the canvas moves it 60px from where its container lays it out: give it `left` 60px at this width too」。
- `sticky` 的 `left` / `top` 是贴住的阈值，不一定像 `relative` 那样直接挪动图层。先在画布里看清楚 `sticky` 图层在冻结的画布上怎么摆，再定它跟 `relative` 是不是同一种核对；比对的是 `left` / `top` 的值是不是改动的值，这一点两种都适用。
- 可选做法（分诊时）：
  1. 记下 `relative` / `sticky` 的宽度，在那里比对偏移，配新说法；`right` / `bottom` 一起补。
  2. 只修显示了的那条路：写对时报 ✓，写错时沿用现在的说法。
  3. 不改，在 spec 里写明。

## 设计师决定（2026-11-03，分诊）

- 选做法 1。一个空子把 Agent 引去改坏排版，一个报虚假的 ✓，都违背 docs/goals.md「不报虚假的 ✓」；`right` / `bottom` 和 X、Y 是同一个毛病，一起修。
- 新说法由这条线照 80 的口吻代定，记进「代定的事（待设计师确认）」。
- 先用剧本复现，再修。不跑真实 Agent。

## Comments

**实现记录（2026-11-03）**

*结论*

验收项都做到了，照设计师选的做法 1。X、Y 改动和按右边、下边定位的改动（在桌面视图改、作用于所有宽度）第一次记下时，除了 83、75 已记的「画布上这一边什么都不挪」的宽度（`placedOtherwiseAt`），再记下画布在旁边视图里让图层留在排版里、但被这一边的值挪动的宽度范围，连同那里是 `relative` 还是 `sticky`（改动单新字段 `offsetInLayoutAt`）。按画布定，第一次记下时读一次，只读算出来的 `position` 和声明的 `left` / `top`（75 代定第 4 条，ADR 0011）。这些宽度上 `done` 不再按自由定位核对，而是比对偏移本身：页面上图层在那里也是同样的 `relative`（`sticky`），并且这一边的值等于改动的值，才算显示了。写对了报 ✓（原来报「not placed absolute … check its `position`」）；只写 `md:right-[…]` 的不再报虚假的 ✓。没显示时的新说法说这个宽度画布上把图层挪多少（或贴在离哪边多远）、页面上它挪了多少或值是多少，不提 `position` 和定位参照；`finish` 的 Why 一行有相应的一句。`static` 的宽度照 83 跳过，`absolute` / `fixed` 的宽度照 80 的说法核对，都没变。没有这种图层的场景，`claim`、`done`、`finish` 的输出逐字不变；切换按钮的包逐字节相同。

*先复现*

用 e2e 剧本（`round.spec.ts` 新加两条，脚本扮演 Agent，不跑真实 Agent），在没改的代码（ccb4599）上跑，前后的输出是同一条剧本在两份代码上临时加打印跑出来的，打印没有留在仓库里：

- (a) 示例项目 hero 里一个图层 `relative h-[40px] w-[80px] bg-stone-300 md:absolute md:top-[30px] md:left-[40px]`（手机 `relative`，平板、桌面自由定位）。桌面视图属性面板 X 加 20（X 40 → 60）。`claim` 后 Agent 先只写 `md:left-[60px]`，`done 1`；再照改动写成 `left-[60px]`（所有宽度），`done 1`，`finish`。改前写对了仍报「At 390px wide, the layer is not placed absolute … check its `position` and `left` …」，复现了 ticket 说的第一个空子。改前改动单里这条两个范围都没有。
- (b) 一个图层 `relative h-[40px] w-[80px] bg-stone-300 md:absolute md:top-[30px] md:right-[40px]`（手机 `relative`，平板、桌面按右边定位）。桌面视图 X 加 20，照 ADR 0014 记成 `right` 40 → 20。`claim` 后 Agent 只写 `md:right-[20px]`，`done 1`，`finish`。改前改动单把手机的范围记进 `placedOtherwiseAt`（768px 以下），那个宽度不看，`done` 报 ✓、`finish` 放 ✓，就是虚假的 ✓；画布的手机视图里 `right: 20px`、`left` 没写，图层确实被往左挪了 20px。

*`done` / `finish` 前后*

`claim` 的输出前后逐字相同（两条剧本的 `claim` 在两份代码上逐字比过）。

(a)，只写 `md:left-[60px]` 时 `done 1`，改前：
```
Change 1 done: 0 of 1 change applied.
Checked on the page: it does not show the change. At 390px wide, the layer is not placed absolute, not absolute at X 60px: check its `position` and `left`, and that its container is its positioning reference, then run `npx 03kind done 1` again.
```
改后：
```
Change 1 done: 0 of 1 change applied.
Checked on the page: it does not show the change. At 390px wide, the page does not move the layer, where the canvas moves it 60px right of where its container lays it out: give it `left` 60px at this width too, then run `npx 03kind done 1` again.
```

(a)，写成 `left-[60px]` 后 `done 1`，改前和上面「改前」逐字相同；改后：
```
Change 1 done: 1 of 1 change applied.
Checked on the page: it shows the change.
```

(a) 的 `finish`（略去了末尾三条规则和报告外围的代码块标记，前后相同），改前：
```
Round finished: 0 of 1 change applied. The page does not show: 1.

End your reply with this report. Each change is under the heading the page's checks put it under: fill in each <…>, and keep each line short.

⚠️ Not applied 1:1
- 1. X: <the layer>
  Why: at 390px wide, the layer is not placed absolute on the page: <what keeps it so>
  Instead: <what you did, or “left as it was”>
```
改后：
```
Round finished: 1 of 1 change applied.

End your reply with this report. Each change is under the heading the page's checks put it under: fill in each <…>, and keep each line short.

✓ Applied
- 1. X: <the layer, and what you changed>
```

(b)，只写 `md:right-[20px]` 时 `done 1`，改前：
```
Change 1 done: 1 of 1 change applied.
Checked on the page: it shows the change.
```
改后：
```
Change 1 done: 0 of 1 change applied.
Checked on the page: it does not show the change. At 390px wide, the page does not move the layer, where the canvas moves it 20px left of where its container lays it out: give it `right` 20px at this width too, then run `npx 03kind done 1` again.
```

(b) 的 `finish`，改前：
```
Round finished: 1 of 1 change applied.

End your reply with this report. Each change is under the heading the page's checks put it under: fill in each <…>, and keep each line short.

✓ Applied
- 1. Right: <the layer, and what you changed>
```
改后：
```
Round finished: 0 of 1 change applied. The page does not show: 1.

End your reply with this report. Each change is under the heading the page's checks put it under: fill in each <…>, and keep each line short.

⚠️ Not applied 1:1
- 1. Right: <the layer>
  Why: at 390px wide, the page does not move the layer 20px left of where its container lays it out, as the canvas does: <what keeps it so>
  Instead: <what you did, or “left as it was”>
```

83 审查后修正那条剧本（`relative md:absolute`，只写 `md:left-[…]`）的 `done` 也随之从「not placed absolute …」换成上面 (a) 改后第一句的说法。别的说法（页面在那里 static、自由定位、或换成另一种，画布是 `sticky` 时）只用命令行单测测了，见「代定的事」第 5 条。

*sticky 在冻结的画布上怎么摆*

先在浏览器里看了（Playwright 的 headless shell，临时的探测测试，没留在仓库里）：画布的视图和页面一样高（`fitHeight`），不滚动。`sticky` 的 `left` / `top` 是贴住的阈值：图层排在离视图那条边不到这么远的地方时，才被推进来（在容器允许的范围里）；排得够远就一动不动。例如排在离视图上边 50px 处的图层，`top: 30px` 不挪它，`top: 80px` 把它推到 80px 处。浏览器给 `sticky` 算出的 `left` / `top` 就是写的值（`auto` 还是 `auto`，百分比还是百分比），不是挪了多远；`relative` 则算成挪了多远（只写 `right: 40px` 时 `left` 算成 -40px；两边都写时 `left` 生效，`right` 照样读出写的值）。所以两种都比这一边的值，但比法和说法不同：`relative` 比浏览器把它挪了多远，说「moves it 60px right of where its container lays it out」；`sticky` 比写的值（不是 px 的不算），说「keeps it at least 40px from the top of what it scrolls in」。

*做了什么*

- **记下范围**（`client/placed-from.ts`、`client/edits.ts`）：83 的 `sidePlaces`（这一边挪不挪它）换成 `sideMoves`，答这一边怎么挪它：按它自由定位（`placed`）、在排版里挪动（`relative` / `sticky`）、什么都不挪（null）。`left` / `top` 照 83：不是 static 就挪。`right` / `bottom`：自由定位的照 75（`endOffsetPlaces`）；`relative` 的只在没写 `left` / `top` 时算挪动（浏览器两边都有值时按 `left` / `top`），写了的照旧什么都不挪；`sticky` 的两边阈值都算数，算挪动。`edits.ts` 的 `viewsPlacingOtherwise` 改为 `viewsMovedOtherwise`，同时给出两份范围；条件和 75、83 一样（第一次记下、在所有宽度上改），不让旁边的视图追上、不排版。
- **改动单**（`client/changeset.ts`）：新字段 `offsetInLayoutAt: { breakpoint, position }[]`，写了说明；`placedOtherwiseAt` 的说明改成 `right` / `bottom` 在 static、或按 `left` / `top` 定位（自由定位或 relative）的宽度。`checkable.ts` 加了类型 `InLayout`、`Position` 和换算 `movedBy`（`right` / `bottom` 往反方向挪）。
- **核对**（`client/check.ts`）：在 `offsetInLayoutAt` 的宽度上（窗口宽度落在里面也一样）走新的 `lookOffset`，不先看是不是自由定位：每个实例在页面上都要和画布同一种 `position`，`relative` 时浏览器把它挪的距离（换成这一边的说法）、`sticky` 时这一边写的 px 值，等于改动的值，才算显示了。没显示时交给命令行的实际值是 `{ canvas, position, offset }`（`OffsetInLayout`；`sticky` 写的不是 px 时另带 `written`）。不读外边距：`relative` 的偏移从排版里的位置算起，外边距已经在里面。
- **`done`**（`cli.ts` 的 `offsetNotShown`）和 **`finish`**（`report-form.ts`，`canvasOffset` 两边共用）：新说法见代定第 5、6 条。
- spec「核对」一节 83 那句改了一处、新加一条；ADR 0014 的 Consequences 补了一句。改动说明（`claim`）没有改。

*代定的事（待设计师确认）*

我按「最贴近 75、80、83 和 ADR 0014」代定的：

1. **页面要和画布同一种**：画布那里是 `relative`，页面那里也要 `relative`；`sticky` 同理。换成另一种也算没显示（两种挪法不一样，`relative` 的 `top: 20px` 一定挪 20px，`sticky` 的可能不挪），所以改动单每段范围记下是哪一种。
2. **比什么**：`relative` 比浏览器把它挪了多远（`right` / `bottom` 反过来算），所以页面同时写了 `left: 8px` 和 `right: 32px` 时，`right` 是对的数但不挪它，不算显示了（「比对偏移本身」）；`sticky` 比这一边写的值，写成百分比的不算（数字一样也不算，见「按 code-review 修正」）。都不算外边距。
3. **`right` / `bottom` 在 `sticky` 宽度**：不管写没写 `left` / `top` 都记、都看（浏览器两边的阈值都用）；`relative` 的照指挥给的，写了 `left` / `top` 的照旧记进 `placedOtherwiseAt`、不看（那里 `right` 确实不挪它）。
4. **居中的图层不记这种范围**：`relative` 的居中图层（`left: calc(50% + 20px)` 加 translate）在排版里按容器宽度的份额挪，和改动记下的 px 对不上，要另做份额的换算；很少见，按自由定位核对（那个宽度仍是 80 的说法，不会报虚假的 ✓）。从左边居中的照旧；从右边居中的（`right: 50%` 加 translate）原来记进 `placedOtherwiseAt`、那个宽度不看，现在也按自由定位核对，不再可能报虚假的 ✓（见「审查后修正」）。见遗留风险第 1 条。
5. **`done` 的说法**（照 80 的口吻：「At 390px wide, the layer …: <该做什么>, then run `npx 03kind done 1` again.」，从 83 起草的那句出发）。画布那里是 `relative` 时，后半句是「where the canvas moves it 60px right of where its container lays it out」（`right` / `bottom` 说 left of / above，值为 0 时说「where the canvas leaves it unmoved in its container's layout」，见「审查后修正」）；`sticky` 时是「where the canvas keeps it at least 40px from the top of what it scrolls in」。前半句按页面：
   - 同样 `relative`、挪得不对：「At 390px wide, the page moves the layer 20px down, …」，没挪：「the page does not move the layer, …」；结尾「give it `left` 60px at this width too」。
   - 同样 `sticky`、值不对：「the layer's `top` is 20px, …」（没写：is `auto`；百分比：is `20%`）；结尾同上。
   - 页面那里 static：「the layer is laid out static, so its `left` moves nothing, …: have its `left` move it so at this width too」（83 的草稿；结尾改成「让它的 `left` 照样挪它」，因为 static 时只给 `left` 没用）。
   - 页面那里自由定位：「the layer is taken out of its container's layout, …: keep it in its container's layout at this width, and have its `left` move it so」。
   - 换成另一种：「the layer is placed sticky, so its `left` moves it only as the page scrolls, …」/「the layer is placed relative, so its `top` moves it from where its container lays it out, not as the page scrolls, …」，结尾「have its `left` move it so」/「keep it so」。
   都不说「check its `position`」，也不提定位参照。static、自由定位、换了一种这三种，其实要 Agent 改回画布那样的排法，只是不点名 `position`，见遗留风险第 3 条。
6. **`finish` 的 Why 一行**：「at 390px wide, the page does not move the layer 60px right of where its container lays it out, as the canvas does: <what keeps it so>」；`sticky`：「the page does not keep the layer at least 40px from the top of what it scrolls in, as the canvas does」。不分页面是怎么排的，和 80 那句一样只说一件事。
7. **83 遗留风险第 7 条，原因不改**：新做法下，X、Y 被跳过的只剩画布上 static 的宽度（`relative` / `sticky` 的都比对了），所以「at the widths the page is looked at, the canvas does not place the layer absolute」在会出现它的情况下（所有要看的宽度都是 static）是对的，也不再让人以为 `relative` 的宽度不看。`right` / `bottom` 那句（「places the layer otherwise than by its `right`」）同样成立。没改，免得没有这种图层的场景输出变了。
8. **「How the page checks」不补句**：照 83 代定第 2 条（设计师已确认）。

*测试*

接缝沿用 75、83 的选法（设计师和指挥不在场，没有当面商定）：编辑命令和页面核对、命令行、e2e 脚本扮演 Agent。都先写、先在没改的代码上看着失败，再实现（「写了 `left` 的 relative，`right` 不看」那条是不变的护栏，改前改后都该过）。

- **编辑命令和页面核对** `edits.browser.test.ts` +9 条（test.each 展开后算，含审查后加的 2 条）：
  - `relative`、`sticky` 各一：X、Y 都记下手机的范围和那里的 `position`，不进 `placedOtherwiseAt`；照改动写在所有宽度显示了；页面那里 static、自由定位，或 `top` 是别的值，没显示，给出页面的样子。
  - 按右边定位的图层，`relative`、`sticky` 各一，没写 `left`：`right` 记下范围；写对显示了，只在 `md` 以上写没显示。
  - `relative` 写了 `left`：`right` 照旧进 `placedOtherwiseAt`。
  - 页面 `relative` 同时写 `left` 和 `right`：`right` 数对也不算。
  - `sticky` 的 `top` 写成 `20%`：不算 20px（code-review 后加的，在前一个提交上失败）。
  - 居中的图层，从左边、从右边各一，画布在手机视图 `relative`：两个范围都不记，那个宽度按自由定位核对，照改动写了也是没显示（实际值 null），不跳过（审查后加的护栏，钉住遗留风险第 1 条现在的样子）。
  - **改了一条原有的期望**：83 审查后修正加的那条（`relative` / `sticky`，只在 500px 以上给 `left` / `top`）原来断言实际值是 null，也就是会说「not placed absolute」，正是本 ticket 要改掉的说法；现在断言新的实际值（`{ canvas, position, offset: 12 }` 和 `8`），结果仍是没显示、宽度 390。其余原有测试一条期望都没改。
- **命令行** `cli.test.ts` +1 条：十一种页面答案的 `done` 逐字、`finish` 七行 Why 逐字（第十一种是审查后加的，值为 0），输出里没有 `null`、`` `position` ``、positioning reference。
- **e2e** `round.spec.ts` +2 条：就是上面「先复现」的 (a)、(b)，断言改动单的两个范围和 `done` / `finish` 的逐字输出。改前都失败。
- **其他场景逐字不变，怎么确认的**：按代码看，只有画布在旁边视图里 `relative` / `sticky`、这一边挪动它的图层，才会多出 `offsetInLayoutAt`，核对、`done`、`finish` 只在拿到这个字段的范围、页面答出新的实际值时才走新路；`claim` 不读它。按测试看，原有测试除上面那一条外期望都没改，全部通过，其中有 `cli.test.ts` 的逐字比对和 e2e 的落地剧本（round、claim、applying-bench、bench-scenarios、next-round、react18-round 等）。
- **全量**（code-review 修正之后的代码）：
  - typecheck 通过。
  - 单测 816 通过、1 跳过；node 测试 32 条通过（含旧名检查）。
  - e2e（`TK_E2E_PORT=5800 pnpm test:e2e`）398 条：396 通过、1 跳过、1 失败。失败的是已知会抖的 `applying-bench.spec.ts`「the Agent stops halfway, with no finish; the toggle says so …」（停住提示没出现），单独重跑通过。切换按钮体积检查（install.spec、toggle-first.spec）在里面，通过。

*按 code-review 修正*

跑了 code-review（Standards、Spec 两个子 agent 并行）。改了：

- Spec：`sticky` 的值写成百分比时，浏览器算出的还是 `20%`，`parseFloat` 读成 20，和 20px 的改动比会报虚假的 ✓。改为只认 px，其余算没显示，`done` 说「the layer's `top` is `20%`」；加了单测，在前一个提交上失败。
- Standards：方向词（`right` / `right of` 等）原来在 `cli.ts`、`report-form.ts` 各写一张表，合成 `report-form.ts` 的 `movedWords`；`right` / `bottom` 反向的换算三处各写一遍，合成 `checkable.ts` 的 `movedBy`；读 px 改用 `property-table.ts` 的 `round`（在 `check.ts` 里引作 `rounded`，因为这个文件里很多函数的参数叫 `round`）；`canvasOffset` 的字段 `did` / `does` 改叫 `toDo` / `does`；页面的 `position` 用类型 `Position`，不是任意字符串；`offset!` 改成 `offset ?? 0`。
- ADR 0014 的 Consequences 补了一句（Standards 指出它只写了 `placedOtherwiseAt`）。

看了没改：`isOffsetInLayout` 放在 `report-form.ts`，不放 `check.ts`：`check.ts` 是页面那边的模块，命令行只引它的类型，和 `cli.ts` 里的 `isUncentered` 同理。`InLayout` 是代码里的词，设计师不会看到，没有进 GLOSSARY。居中图层、RTL、换了一种排法时的说法，写进代定和遗留风险。

*前后数字（docs/goals.md「度量」）*

包体积（gzip -9）：切换按钮 `react.dev.js` 1423 B（gzip 822 B）+ 共用 chunk `chunk-UQJRS7YD.js` 21575 B（gzip 9164 B），改前改后逐字节相同（同名，sha256 前 16 位 `c83849f1557e0b1b`、`cdd6f09dfeaf13fa` 前后一样）。编辑层延迟加载的部分 `editor.dev.js` 323018 → 323972 B（未压缩，+954 B），gzip 109733 → 110054 B（+321 B）。

性能没有跑：多出来的只在 X、Y、`right` / `bottom` 改动第一次记下时，读旁边视图的 `position` 本来就读，现在多读一次声明的 `left` / `top`（只在 `relative` 的 `right` / `bottom`）；核对时每个实例多读一次算好的样式。拖拽和连续改值的后续步子不读。

*遗留风险*

1. **居中的 `relative` 图层**（代定第 4 条）：画布在某个宽度 `relative`（或 `sticky`）居中的图层，从左边、从右边居中都一样，那个宽度按自由定位核对，写对了也说「not placed absolute … check its `position`」，就是 83 遗留风险第 5 条的那种误导，只留在这一小类。不报虚假的 ✓。为什么没在这条线修，见「审查后修正」。
2. **从右往左排的页面**（`direction: rtl`）：`relative` 两边都写时浏览器按 `right` 挪，`sideMoves` 和 `lookOffset` 都按从左往右算。画布上这种图层的 `right` 会被当成不挪它、跳过那个宽度，可能报虚假的 ✓。很少见，没处理。
3. **页面那里排法不同时的说法**（代定第 5 条）：页面在那里 static、自由定位、或换成另一种时，光给这一边一个值不够，要改回画布那样的排法，说法只说「have its `left` move it so」「keep it in its container's layout」，不点名 `position`。Agent 能不能看懂，要等真实 Agent 跑过才知道。
4. **`sticky` 在画布上常常看不出挪动**：视图不滚动，阈值多半不推它，设计师在手机视图里可能看不出改了什么，`done` 仍要页面那里的值一样。只会多报「没有显示」，不会报虚假的 ✓。
5. **读一次的记录会过时**、**一个视图代表一整段宽度**：同 75、83 的遗留风险，不变。
6. **页面 `relative` 同时写了 `left` 和 `right`**：`right` 的改动在那里比的是浏览器把它挪了多远（`left` 说了算），没显示时 `done` 说「the page moves the layer 8px right, …: give it `right` 32px at this width too」，可页面上 `right` 已经是 32px，真正要去掉的是 `left`。不报虚假的 ✓；很少见，说法没点出 `left`，Agent 可能要多跑一轮（审查时发现）。
7. 没跑真实 Agent。

**审查后修正（2026-11-03）**

独立审查跑了 code-review（Standards、Spec 两个子 agent 并行），自己又对着 ticket 一条条看了要多看的地方：

- **没找到会报虚假的 ✓ 的路**：页面 `relative` 同时写了 `left`，`right` 比的是浏览器挪了多远，不算显示了；`sticky` 写的不是 px 不算；页面窗口落在范围里照样比；页面 `relative`、画布 `sticky`（或反过来）不算；Y、`bottom` 和 X、`right` 走同一套（`movedBy`、`MOVED_WAY`）。
- **值为 0 时 `done` 的说法别扭**：画布那里 `relative`、改成 0 时，原来说「where the canvas leaves it where its container lays it out」，两个 where 连着。改成「where the canvas leaves it unmoved in its container's layout」；`finish` 那句随之从「the page does not leave the layer where its container lays it out, as the canvas does」变成「the page does not leave the layer unmoved in its container's layout, as the canvas does」。只有值为 0 的这一种变了，别的逐字不变。先在 `cli.test.ts` 加了这一种（第十一种），在改前看着失败。
- **居中的图层（遗留风险第 1 条）留着，没在这条线修**：ticket 说「这种宽度上 … 不提 `position`」，按字面这一类也在范围里。但要修，页面那边得在 `relative` 的宽度读出它的包含块有多宽、减去份额再比 px（现有的 `roomOf` 量的是自由定位时的空间，`relative` 时 `left` 和 `right` 互为相反数，加起来是 0，用不上），`sticky` 还要解析写的 `calc(50% + 20px)`；说法也要再起一套「画布把它挪到容器宽度的 50% 再往右 20px」，又是一批要设计师确认的代定。这不是小改动，而且很少见（画布在旁边视图里要 `relative`，而桌面视图里是居中的自由定位）。现在这一类不会报虚假的 ✓，只是说法会把 Agent 引去看 `position`。建议另开一张 ticket（编号在 main 上给）。
- **审查还发现，居中的图层从右边居中时行为变了，记录原来没写对**：83 的 `sidePlaces` 对 `right` / `bottom` 只认自由定位，所以画布在旁边视图 `relative` 的、从右边居中的图层，那个宽度原来记进 `placedOtherwiseAt`、不看，就是 ticket 说的 `right` 的那种虚假的 ✓；现在 `sideMoves` 答 `relative`，`!centered` 又不记 `offsetInLayoutAt`，两份都不进，按自由定位核对。不再可能报虚假的 ✓，换成了第 1 条的误导，按 docs/goals.md 这样更好，代码没改。实现记录原来说「照旧按自由定位核对」，对从右边居中的不对，代定第 4 条和遗留风险第 1 条已改正。加了一条护栏测试（从左边、从右边居中各一）：两个范围都不记，照改动写了也是没显示，不跳过。按代码看，这条在 ccb4599 上从右边居中的那一种会失败（那里记了 `placedOtherwiseAt`）。
- **新记一条遗留风险（第 6 条）**：页面 `relative` 同时写了 `left` 和 `right` 时，没显示的说法叫 Agent 给 `right` 一个它已经有的值，没点出是 `left` 在起作用。不报虚假的 ✓，没改。
- **看了没改**：
  - Standards 说 `Status:` 没改成 done：照指挥的意思留给指挥。
  - 新概念没进 GLOSSARY：`InLayout` 是代码里的词，设计师看不到，同实现记录。
  - `relative` / `sticky` 的分支在四处各写一遍（`placed-from.ts`、`check.ts`、`cli.ts`、`report-form.ts`）：每处问的不一样（这一边挪不挪它、页面上挪了多少、该怎么说、Why 怎么说），合成一张表反而要每处去查表再分支，没合。
  - `report-form.ts` 导出给 `done` 用的说法函数：同实现记录（`isUncentered` 同理）。
  - `movedBy` 的 `0 - value`、`offset ?? 0`：行为无误，没动。
- **测试和数字**：typecheck 通过；单测 818 通过、1 跳过（多出的两条是上面的护栏）；`cli.test.ts` 188 条全过。e2e 没有重跑（改的说法只在值为 0 时出现，两条 e2e 剧本不碰它），留给指挥跑全量。包体积：改的说法在 `report-form.ts`，只进命令行的 `cli.js`，不进页面的包；重新构建后切换按钮 `react.dev.js` 1423 B（gzip 822 B）、`chunk-UQJRS7YD.js` 21575 B（gzip 9164 B），sha256 前 16 位仍是 `c83849f1557e0b1b`、`cdd6f09dfeaf13fa`，逐字节相同；`editor.dev.js` 仍是 323972 B（gzip 110054 B）。

**合并前全量（2026-11-03，指挥）**

分支先同步了 main（4ea3284，带进 ticket 59 的 README、许可证和包信息，和本线不重叠），在同步后的代码上跑：

- `pnpm typecheck` 通过。
- `pnpm test`：单测 818 通过、1 跳过；node 测试 32 条通过（含旧名检查）。
- `TK_E2E_PORT=5800 pnpm test:e2e`：398 通过、1 跳过，一次跑过，没有重跑。切换按钮体积检查（install.spec、toggle-first.spec）在里面，通过。
- 前后合上盖子的状态都是开着（`AppleClamshellState = No`）；没有跑计时的性能测试。

`done` / `finish` 前后、包体积、代定的事和遗留风险见上面的实现记录和「审查后修正」：代定 8 条，遗留风险 7 条。遗留风险第 1 条（居中的 `relative` / `sticky` 图层仍说「check its `position`」）和第 2 条（`direction: rtl`）如果要做，另开 ticket，编号在 main 上给。

## 设计师确认（2026-11-03）

代定的八条全部确认：

1. 页面在那个宽度要和画布同一种排法（`relative` 对 `relative`，`sticky` 对 `sticky`），换了一种算没显示。
2. `relative` 比浏览器把它挪了多远，`sticky` 比写的 px 值（写成百分比的不算）。
3. `right` / `bottom` 在 `sticky` 宽度都看；在 `relative` 宽度写了 `left` / `top` 的照旧不看。
4. 居中的图层不记这种范围，按自由定位核对：不报虚假的 ✓，只是说法仍会提 `position`（遗留风险第 1 条）。
5. `done` 的新说法照 80 的口吻，不点名 `position`、不提定位参照。说法 Agent 能不能看懂，看 ticket 88 真实跑的结果。
6. `finish` 的 Why 一行只说一件事。
7. 所有宽度都被跳过时的原因不改。
8. 「How the page checks」不补句。

遗留风险第 1、2、6 条另行分诊。
