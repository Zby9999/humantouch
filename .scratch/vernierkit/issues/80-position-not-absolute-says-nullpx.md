# 80: 图层在页面上还不是自由定位时，`done` 说「Y position is nullpx」

**What to build:** 改 X、Y（以及 75 加的右边、下边）的改动，如果图层在页面上还不是 `position: absolute`，`done` 现在会说「The Y position is nullpx, not 488px … Something overrides your change: see what sets the value in the notes (Currently set by)」。`nullpx` 是读不到值时漏出来的，后半句又把 Agent 引到「有别的样式盖住了」，而真正的原因是图层还没设成自由定位。`finish` 的 Why 一行也会写「the page shows the Y position nullpx」。要改成照实说：图层在页面上还不是自由定位，先检查它的 `position`、`left`/`top`，以及容器是不是它的定位参考。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0006、0013）。

**Blocked by:** 无

**Status:** done

- [x] X、Y、右边、下边的改动，图层在页面上不是自由定位时，`done` 不出现 `null`，说出图层还不是自由定位、该检查什么（和「位置」改动现有的「not placed absolute」说法一致）
- [x] `finish` 的 Why 一行同样不出现 `null`
- [x] 剧本或单元测试：脚本扮演的 Agent 改了 Y 却没设 `position: absolute`，改前出现 `nullpx`，改后照上面说
- [x] 其他场景的 `claim`、`done`、`finish` 输出逐字不变；变了的那几份前后各存一份记在 Comments

## 背景

- 落地线（78、76、77）整线审查时发现（2026-11-02）。测量台的 dissolve-place-frame 场景在没人落地时（`--dry`）就能看到：`done` 和 `finish` 都写了 `nullpx`。main 上一样。
- 原因：`client/check.ts` 的 `lookPosition` 遇到不是 absolute 的元素时，给出的 actual 是按 X/Y 读的值，读不到就是 `null`；`cli.ts` 里专门处理「不是自由定位」的分支只管「位置」（absolute）一种改动，X、Y、右边、下边落到通用的「Something overrides your change」那句，把 `null` 拼成了 `nullpx`。从 ticket 64（7c8049e）起就这样，不是落地线引入的。
- 真实 Agent 忘了设 `position: absolute` 时会碰到，`done` 的说法会把它引到错误的方向（去查 Currently set by）。

## 设计师决定（2026-11-02，分诊）

- 做，按上面的验收项。真实 Agent 照现在这句话会去查 Currently set by，绕错方向。不跑真实 Agent。

## Comments

**实现记录（2026-11-02）**

*结论*

验收项都做到了。X、Y、右边、下边的改动，图层在页面上还不是自由定位时，`done` 照「移动到自由定位」已有的说法，说图层还不是自由定位、不在给的位置，让 Agent 检查 `position` 和这个方向的那条边，以及容器是不是它的定位参考；不再出现 `nullpx`，也不再把 Agent 引去查 Currently set by。`finish` 的 Why 一行写「图层在页面上不是自由定位」。其他情况的输出没有变，切换按钮的包逐字节相同。

*原因比 ticket 写的多一种*

改前用 e2e 复现时发现，Agent 写了 `top` 却没设 `absolute` 时更糟：页面把写的 `top` 当成 Y 读出来，`done` 说「The Y position is 20px, not 20px … Something overrides your change」，自相矛盾。原因是页面遇到不是自由定位的图层时，仍从它身上读 `top` / `left` / `right` / `bottom` 当实际的值：

- 没写 `top`：读不到数（NaN），存进结果时变成 null，拼成 `nullpx`。
- 写了 `top`：读到的就是写的那个数，和改后值一样。
- 右边、下边没写：读成 0px。
- `position: relative` 的图层：读出一个数。

这几种其实都是同一件事：图层不是自由定位，这些值不决定它的位置。

*做了什么*

- **页面核对**（`client/check.ts`）：X、Y、右边、下边（以及自由定位）的改动，先看图层在页面上是不是自由定位（`position` 是 `absolute` 或 `fixed`）。不是，就算没显示，交给命令行的实际值是「没有」（null），不从它身上读值。原来只有自由定位那条改动这样做。
- **`done`**（`cli.ts`）：X、Y、右边、下边的改动拿到「没有」时，说：
  - Y：「The layer is not placed absolute, not absolute at Y 20px: check its `position` and `top`, and that its container is its positioning reference, then run `npx 03kind done 2` again.」
  - X 说 `X …px` 和 `left`；右边、下边说「not absolute at 0px from its container's right edge」和 `right` / `bottom`。
  - 不在窗口宽度时开头是「At 390px wide, the layer …」，和移动到自由定位的说法一样。
- **`finish`**（`report-form.ts`）：Why 一行写「the layer is not placed absolute on the page: <what keeps it so>」，不在窗口宽度时前面加「at 390px wide, 」。
- spec「核对」一节补了一条。

*改前改后（docs/goals.md「度量」）*

用 e2e 量（下面「测试」里的 round.spec 那条）：示例项目里解散 hero 中 Header 的 Stack，标题 Third Kind 往下挪 20px（Y 0 → 20），一共两条改动（1 解散 Stack，2 Y）。脚本扮演的 Agent `claim` 之后：先什么都没写就 `done 2`；再只给标题写上 `top-[20px]`、不写解散 Stack（标题仍在 header 的排版里，不是自由定位），再 `done 2`，然后 `finish`。改前是 b9938dd 的代码，改后是本 ticket 的代码。

`done 2`，什么都没写时：

改前：
```
Change 2 done: 0 of 2 changes applied.
Checked on the page: it does not show the change. The Y position is nullpx, not 20px, as the browser computes `top` and `bottom` on the layer. Something overrides your change: see what sets the value in the notes (Currently set by), fix it, and run `npx 03kind done 2` again.
```
改后：
```
Change 2 done: 0 of 2 changes applied.
Checked on the page: it does not show the change. The layer is not placed absolute, not absolute at Y 20px: check its `position` and `top`, and that its container is its positioning reference, then run `npx 03kind done 2` again.
```

`done 2`，写了 `top-[20px]`、没设自由定位时：

改前：
```
Change 2 done: 0 of 2 changes applied.
Checked on the page: it does not show the change. The Y position is 20px, not 20px, as the browser computes `top` and `bottom` on the layer. Something overrides your change: see what sets the value in the notes (Currently set by), fix it, and run `npx 03kind done 2` again.
```
改后：和上面「什么都没写」的改后一字不差。

`finish`（只有 Why 那一行变了，其余逐字相同；下面略去了报告外围的代码块标记和末尾三条规则）：

改前（写了 `top-[20px]`）：
```
Round finished: 0 of 2 changes applied. Not marked done: 1. The page does not show: 2.

End your reply with this report. Each change is under the heading the page's checks put it under: fill in each <…>, and keep each line short.

⚠️ Not applied 1:1
- 1. Dissolve Stack: <the layer>
  Why: <why it is not applied>
  Instead: <what you did, or “left as it was”>
- 2. Y: <the layer>
  Why: the page shows the Y position 20px, not 20px: <what keeps it so>
  Instead: <what you did, or “left as it was”>
```
（什么都没写就 `finish` 时，这一行改前是「Why: the page shows the Y position nullpx, not 20px: <what keeps it so>」。）

改后（两种情况相同）：
```
- 2. Y: <the layer>
  Why: the layer is not placed absolute on the page: <what keeps it so>
```

*其他场景的输出逐字不变，怎么确认的*

- 按代码看：命令行新加的两处只在「X、Y、右边、下边的改动，页面答的实际值是『没有』」时走；页面那边只在「这几种改动加上自由定位，图层不是自由定位」时换答案。自由定位那条改动原来答的就是「没有」，答案不变。其他种类的改动、其他属性都没碰。
- 按测试看：原有的测试一条期望都没改，全部照旧通过。`cli.test.ts` 里 `claim` / `done` / `finish` 逐字比对的测试（含 64、65、75、76、77 加的那些）、e2e 里的落地剧本（round、claim、applying-bench、bench-scenarios、next-round、react18-round 等）都在里面。
- 切换按钮的包逐字节相同（`react.dev.js` 1423 B，共用 chunk `chunk-HBO7Q6T2.js` 21575 B，校验和改前改后一样）。编辑层延迟加载的部分 `editor.dev.js` 317014 → 317010 B（未压缩；gzip 107592 → 107601 B）。
- 没有用测量台 `--dry --claim-out` 逐字比 `claim`：测量台的开发服务器固定用 5620 起的端口，不在这条线能用的端口里。`claim` 的输出只在一种很少见的情况会变（代定第 4 条），测量台的场景都不是。

*代定的事（待设计师确认）*

我按「最贴近设计师决定」代定的：

1. **自由定位那条改动不改说法**。在断点上改为自由定位（`absolute` 改动）的图层没被设成自由定位时，`done` 原来就说「The absolute placement is in the layout, not X …, Y …: Something overrides your change: see … (Currently set by)」，没有 `null`，也不在验收项里。这条改动设的正是 `position`，Currently set by 列的就是设 `position` 的地方，方向是对的，所以没改。
2. **用词照移动到自由定位已有的那句**「The layer is not placed absolute, not absolute at X … and Y …」，只换成一个方向；「该检查什么」只说这个方向的那条边（Y 说 `top`，右边说 `right`），和 75 里右边、下边外边距不对时那句「Check its `position` and `top` …」一致，不说 `left` 和 `top` 都查。
3. **`position: relative`、`sticky` 的图层也算「还不是自由定位」**。`relative` 时 `top` 会让它挪，但不是在容器里按坐标摆放；原来会说「Y 是多少 px … Something overrides」，现在说不是自由定位。`fixed` 照旧算自由定位，和页面其他地方一样。
4. **改动单没记外边距的老改动（ticket 65 之前存的）一样处理**。连带一处：一轮没落地完、下一轮 `claim` 按代码现状重读改前时，这种老的 X / Y 改动，图层不是自由定位就不改改前（原来会把 `relative` 图层的 `top` 当成改前）。记了外边距的改动原来就不改，没变。
5. **不提示「这一轮另一条改动会让它变成自由定位」**（例如解散 Stack、移动到自由定位）。`done` 只说这一条；Agent 照 `claim` 的说明落地那一条，就会设上 `absolute`。

*测试*

接缝沿用 75 的选法（设计师和指挥不在场，没有当面商定）：页面核对、命令行、e2e 脚本扮演 Agent。每条都先写、先看着在没改的代码上失败，再实现。

- **页面核对**（`edits.browser.test.ts`）+1 条：Y 和右边两条改动，图层是 `static` 和 `relative`，写了 `top` / `right` 和没写，四种都答「没显示，实际值没有」。改前答 30（读的是写的 `top`），失败。
- **命令行**（`cli.test.ts`）+1 条：X（没记外边距）、Y（记了外边距）、右边（在 390px 宽）、下边，页面都答「没有」：`done` 四句、`finish` 四行 Why 照上面说，不出现 `null`。改前是 `nullpx`，失败。
- **e2e**（`round.spec.ts`）+1 条：就是上面「改前改后」的剧本，没写、写了 `top` 两次 `done` 和 `finish` 都照新说法，输出里没有 `null`。改前两次 `done` 分别是 `nullpx` 和「20px, not 20px」，失败。
- **全量**：
  - typecheck 通过。
  - 单测 766 通过、1 跳过；node 测试 32 条通过（含旧名检查）。
  - e2e 共 378 条：377 通过、1 跳过。第一次全量跑（`TK_E2E_PORT=5800 pnpm test:e2e`）有两条失败，都和本 ticket 无关，单独重跑都过了：
    - `next-install.spec.ts` 第一条：Next.js（webpack）的开发服务器没起来，连不上端口（同一个文件里另外三条因此没跑）；
    - `variables.spec.ts`「typing part of a name in a field lists its group's Variables」：设计变量的下拉列表 5 秒内没出来。
    这两个文件单独重跑，12 条全过。第一次全量因为 page 组有失败，「project files」组（落地剧本，含本 ticket 新加的那条）没有开跑，单独跑了一遍：98 通过、1 跳过。

*按 code-review 修正*

（子 agent 不可用，两个方向我自己逐条看。）

- Standards：
  - 有改动：页面核对里表示「不是自由定位的那个元素」的变量原来叫 `loose`，看名字猜不出意思，改为 `notAbsolute`；`cli.ts` 里 `beforeOf` 的一句注释说「读到数字是在排版里的图层」，本 ticket 之后页面不再这样答，改成照实说。
  - 看了没改：「X、Y、右边、下边，实际值没有」这个判断在 `cli.ts` 和 `report-form.ts` 各写一次。两处旁边原有的判断（外边距不对）也是各写一次、各配各的句子，照原来的写法。
- Spec：
  - 四条验收项都对上了；不在窗口宽度时的说法也照移动到自由定位的写法。
  - 范围外的连带变化只有代定第 3、4 条，都是同一个原因（不是自由定位时不从图层身上读值）带出来的，写进了代定。

*遗留风险*

1. 没跑真实 Agent。新说法会不会让真实 Agent 先去落地解散 Stack 那条、再回来 `done`，要等下次测量台跑 dissolve-place-frame 才知道。
2. 图层设了 `absolute`、但容器不是它的定位参考时，X、Y、右边、下边的核对仍按原来的方式（不单独查定位参考），`done` 的说法里已经有「and that its container is its positioning reference」。这是原来就有的，本 ticket 没改。
3. 页面核对这几种改动时，每个元素多看一次 `position`（没记外边距的老改动）或少看一次、多看一次相抵（记了外边距的），开销可以不计，没有单独量。

**整线审查修正（2026-11-02）**

*结论*

定位线（80、79）的整线代码审查在 80 上找到两处：验收第 4 条没完全做到（代定第 4 条承认两处输出变了，却没存前后对照）；`done` 对拖进别的 Frame 又拖回的移动，不先说 80 的「not placed absolute」。前后对照补在下面；`done` 的顺序改好了（改法记在 79 的「整线审查修正」毛病 3，因为那一支是 79 加的）。另一个老问题写进遗留风险，没在这次修。

*审查找到的毛病*

1. **验收第 4 条：变了的输出没存前后对照**。代定第 4 条说两处输出变了：改动单没记外边距的老 X / Y 改动（ticket 65 之前存的），图层 `position: relative` 时：
   - `done` 原来走一般的样式比较，可能报「显示了」（`relative` 图层的 `top` 正好是改后值）；现在报没显示。
   - 留到下一轮、`claim` 重读改前时，原来把 `relative` 图层的 `top` 当改前；现在不改改前。
2. **`done` 的说法顺序**：拖进别的 Frame 又拖回、位置记了 `placed` 的移动，页面答「不是自由定位」时，`done` 先说「not where the notes place it」，不说 80 的那句。场景：按右边定位的图层拖出原 Frame 再拖回，Agent 没写 `absolute`。

*改了什么*

- **补前后对照**（毛病 1）：用脚本复现，改前是 b9938dd 的代码，改后是本次修正的代码。页面的核对在浏览器里跑（Playwright 的 headless shell），命令行用页面答出来的结果，两边都是各自版本的代码。场景：一个自由定位的图层 `left: 12px; top: 8px`，在画布上改 Y 到 30，改动单里去掉外边距（像 ticket 65 之前存的那样）；页面上这个图层是 `position: relative`。
  - (a) 页面写了 `top: 30px`，Agent 跑 `done 1` 和 `finish`。

    改前（页面答「显示了」）：
    ```
    Change 1 done: 1 of 1 change applied.
    Checked on the page: it shows the change.
    ```
    `finish` 的第一行是「Round finished: 1 of 1 change applied.」，这条在 ✓ 下面（「- 1. Y: <the layer, and what you changed>」）。这是一个虚假的 ✓：图层不是自由定位，Y 不决定它的位置。

    改后：
    ```
    Change 1 done: 0 of 1 change applied.
    Checked on the page: it does not show the change. The layer is not placed absolute, not absolute at Y 30px: check its `position` and `top`, and that its container is its positioning reference, then run `npx 03kind done 1` again.
    ```
    `finish`：「Round finished: 0 of 1 change applied. The page does not show: 1.」，这条在 ⚠️ 下面，Why 一行「the layer is not placed absolute on the page: <what keeps it so>」。
  - (b) 同一条 Y 改动留到下一轮，页面这时写的是 `top: 20px`，Agent 跑 `claim`（只有设计意图那一行变了，其余逐字相同）。

    改前：
    ```
    - **Design intent:** Change the Y position from 20px to 30px.
    ```
    改后（改前仍是上一轮的 8px）：
    ```
    - **Design intent:** Change the Y position from 8px to 30px.
    ```
  - 现在的 main 上存下来的改动都记了外边距（ticket 65 起），这两处只影响很老的改动单。
- **`done` 先说不是自由定位**（毛病 2）：移动的改动，页面答「不是自由定位」时，先说 80 那句，按说明给的那一边写该查什么：「The layer is not placed absolute, not absolute at 40px from its container's right edge and Y 8px: check its `position`, `right` and `top`, …」。没有 `placed` 的移动（从容器左上角按 X、Y 摆）说法逐字和原来一样。

*代定的事（待设计师确认）*

没有新的。毛病 2 的说法属于 79，代定记在 79（第 7 条）。

*测试*

- 命令行（`cli.test.ts`）+1 条（和 79 共用）：移动的改动、页面答「不是自由定位」，按右边定位、居中加按下边定位、按左上角三种的 `done`。没改的代码（9d5ab1d）前两种说「not where the notes place it」，失败；第三种和原来逐字一样。
- 前后对照的脚本没有放进仓库（它跑的是 b9938dd 的旧代码），结果原样贴在上面。

*全量结果*

和 79 的这次修正一起跑，见 79 的「整线审查修正」。

*遗留风险*

（接实现记录的遗留风险）

4. **只在某个宽度以上自由定位的图层，`done` 在窄的宽度叫 Agent 去设 `position`**。场景：图层只在 md 以上自由定位（例如 `md:absolute`，手机宽度在排版里），设计师在桌面视图改它的 X，作用于所有宽度。`done` 在 390px 宽度核对时，页面那里不是自由定位，说「At 390px wide, the layer is not placed absolute, not absolute at X …: check its `position` and `left` …」，要 Agent 在手机宽度也设成自由定位；但画布在那个宽度也不是自由定位，Agent 照做反而和画布不一样。这是 ticket 64（在页面窗口以外的宽度也核对）起就有的老问题，原来说的是「Something overrides your change」，80 的新说法让它更像一个明确的指令，更误导。这次没修，留给指挥开新 ticket、交设计师分诊。
