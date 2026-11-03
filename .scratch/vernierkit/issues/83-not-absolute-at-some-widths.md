# 83: 图层只在某些宽度自由定位时，`done` 在别的宽度要 Agent 去设 `position`

**What to build:** 页面里有的图层只在某些宽度是自由定位（例如 `md:absolute`：平板、桌面自由定位，手机上在排版里）。在桌面视图里改它的 X 或 Y，改动作用于所有宽度；`done` 在每个视图的宽度上核对，到了手机宽度，图层在页面上不是自由定位，`done` 就说「At 390px wide, the layer is not placed absolute … check its `position` and `left`」（ticket 80 的说法）。但画布在手机视图里它也不是自由定位，设计师看到的就是这样：Agent 照代码写对了，那个宽度本来就不该看，`done` 却报「没有显示」，还把 Agent 引去改 `position`，可能把手机上的排版改坏。要定：这类宽度怎么核对、`done` 怎么说。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0006、0008、0013、0014）。

**Blocked by:** 无

**Status:** done

- [x] 先复现：脚本扮演的 Agent 照改动写对了 X，`done` 在画布不是自由定位的那个宽度报「没有显示」（定位线整线审查读代码时发现，还没有用剧本复现过）
- [x] 照 75 的做法（`placedOtherwiseAt`）：X、Y 改动第一次记下时，看画布在旁边的视图里是不是自由定位；不是的视图所代表的宽度，`done` 不看。按画布定，不按 Agent 改完后的页面定。所有核对的宽度都被跳过时，`done` 说没能核对，原因写明画布在那些宽度上不是自由定位，和 75 代定第 6 条一致
- [x] 不报虚假的 ✓（docs/goals.md）：画布在某个宽度是自由定位、页面上不是时，照旧报「没有显示」，按 80 的说法
- [x] 改动说明里「How the page checks」如有需要补一句；没有这种图层的场景，`claim`、`done`、`finish` 的输出逐字不变
- [x] 剧本或单元测试覆盖：只在 `md` 以上自由定位的图层，在桌面视图改 X

## 背景

- 定位线（80、79）整线审查时发现（2026-11-02）。从 ticket 64 起就这样（以前 `done` 在那个宽度说「Something overrides your change」或 `nullpx`），ticket 80 的新说法让它更像是 Agent 的错：明确要 Agent 去设 `position`。
- 同类的情况 ticket 75 已经处理过一种：按右边定位的图层，画布在某个视图不按右边定位时，`done` 在那个视图代表的宽度不看 `right`（改动单的 `placedOtherwiseAt`，按画布定，不按 Agent 改完后的页面定；设计师 2026-11-02 确认）。X、Y 改动和图层是不是自由定位没有这样处理。
- 可选做法：
  1. 照 75 的做法：改动第一次记下时，看旁边的视图里画布是不是自由定位，不是的视图，它代表的宽度 `done` 不看。
  2. 照看，但在画布也不是自由定位的宽度，`done` 换个说法（例如说明那个宽度画布上也不是自由定位，不用改），不算「没有显示」。
  3. 不改，在 spec 里写明。

## 设计师决定（2026-11-03，分诊）

- 选做法 1，照 75：哪个宽度该不该看，以画布（设计师看到的样子）为准，这一点设计师在 75 已确认。做法 2 每次都要多给 Agent 一段话，它用不上；做法 3 留着一条可能把排版改坏的错误引导。
- 先用剧本复现，再修。不跑真实 Agent。

## Comments

**实现记录（2026-11-03）**

*结论*

验收项都做到了。照 75 的做法：X、Y 改动（在桌面视图改、作用于所有宽度）第一次记下时，看画布在平板、手机等旁边的视图里是不是自由定位；不是的视图，把它代表的宽度范围记进改动（`placedOtherwiseAt`），`done` 不看那些宽度，窗口宽度落在里面也不看。按画布定，不按 Agent 改完后的页面定，所以画布在某个宽度是自由定位、页面上不是时，照旧按 80 的说法报「没有显示」。改动说明（`claim`）没有变；没有这种图层的场景，`claim`、`done`、`finish` 的输出逐字不变。切换按钮的包逐字节相同。

*先复现*

用 e2e 剧本（`round.spec.ts` 新加的一条，脚本扮演 Agent，不跑真实 Agent）：示例项目 hero 里两个图层，一个 `md:absolute md:top-[30px] md:left-[40px]`（平板、桌面自由定位，手机在 hero 的排版里），一个 `absolute top-[90px] left-[40px]`（各宽度都自由定位）。在桌面视图的属性面板里，第一个 X 加 20、Y 加 10，第二个 X 加 20，共 3 条改动（1 X、2 Y 是第一个的，3 X 是第二个的）。`claim` 之后，Agent 把第一个照改动写成 `md:top-[40px] md:left-[60px]`；第二个写成 `md:absolute md:top-[90px] md:left-[60px]`，手机上变成在排版里，和画布不一样。然后 `done 1`、`done 2`、`done 3`、`finish`。

在没改的代码（50d443b）上跑：第一个照改动写对了，`done 1`、`done 2` 却报「At 390px wide, the layer is not placed absolute … check its `position` and `left`」，复现了 ticket 说的毛病。

*`done` 前后*

`claim` 的输出前后逐字相同（同一个剧本在两份代码上各跑一次，逐行比过）。变了的是 `done 1`、`done 2`、`finish`；`done 3` 只有第一行的计数变了（另两条现在算显示了），第二行逐字不变。

`done 1`，改前：
```
Change 1 done: 0 of 3 changes applied.
Checked on the page: it does not show the change. At 390px wide, the layer is not placed absolute, not absolute at X 60px: check its `position` and `left`, and that its container is its positioning reference, then run `npx 03kind done 1` again.
```
改后：
```
Change 1 done: 2 of 3 changes applied.
Checked on the page: it shows the change.
```

`done 2`，改前：
```
Change 2 done: 0 of 3 changes applied.
Checked on the page: it does not show the change. At 390px wide, the layer is not placed absolute, not absolute at Y 40px: check its `position` and `top`, and that its container is its positioning reference, then run `npx 03kind done 2` again.
```
改后：
```
Change 2 done: 2 of 3 changes applied.
Checked on the page: it shows the change.
```

`done 3`（画布在各宽度都自由定位、页面在手机上不是：不报虚假的 ✓，照旧「没有显示」），改前：
```
Change 3 done: 0 of 3 changes applied.
Checked on the page: it does not show the change. At 390px wide, the layer is not placed absolute, not absolute at X 60px: check its `position` and `left`, and that its container is its positioning reference, then run `npx 03kind done 3` again.
```
改后：
```
Change 3 done: 2 of 3 changes applied.
Checked on the page: it does not show the change. At 390px wide, the layer is not placed absolute, not absolute at X 60px: check its `position` and `left`, and that its container is its positioning reference, then run `npx 03kind done 3` again.
```

`finish`（略去了末尾三条规则，前后相同），改前：
```
Round finished: 0 of 3 changes applied. The page does not show: 1, 2, 3.

End your reply with this report. Each change is under the heading the page's checks put it under: fill in each <…>, and keep each line short.

⚠️ Not applied 1:1
- 1. X: <the layer>
  Why: at 390px wide, the layer is not placed absolute on the page: <what keeps it so>
  Instead: <what you did, or “left as it was”>
- 2. Y: <the layer>
  Why: at 390px wide, the layer is not placed absolute on the page: <what keeps it so>
  Instead: <what you did, or “left as it was”>
- 3. X: <the layer>
  Why: at 390px wide, the layer is not placed absolute on the page: <what keeps it so>
  Instead: <what you did, or “left as it was”>
```
改后：
```
Round finished: 2 of 3 changes applied. The page does not show: 3.

End your reply with this report. Each change is under the heading the page's checks put it under: fill in each <…>, and keep each line short.

✓ Applied
- 1. X: <the layer, and what you changed>
- 2. Y: <the layer, and what you changed>

⚠️ Not applied 1:1
- 3. X: <the layer>
  Why: at 390px wide, the layer is not placed absolute on the page: <what keeps it so>
  Instead: <what you did, or “left as it was”>
```
（报告外围的代码块标记略去了。）

所有要看的宽度都被跳过时（窗口和各视图宽度都在画布不是自由定位的范围里，例如 Agent 的页面窗口窄到手机宽度），`done` 改后说：
```
Not checked on the page: at the widths the page is looked at, the canvas does not place the layer absolute. That is no error: go on.
```
改前这时在窗口宽度上看，说「The layer is not placed absolute, not absolute at X 60px: check its `position` and `left` …」。这一种只用单元测试测了页面的答案，命令行的拼法是原有的（「Not checked on the page: <原因>. That is no error: go on.」）。

*做了什么*

- **记下画布不是自由定位的宽度**（`client/edits.ts`）：75 加的「看旁边视图」原来只对 `right` / `bottom`，现在 X、Y 也看。X、Y 看的是图层在那个视图里是不是自由定位（`position` 是 `absolute` 或 `fixed`）；`right` / `bottom` 照旧，还看 `left` / `top` 有没有值。条件和 75 一样：这条改动第一次记下时、在所有宽度上改的；只读旁边视图里图层算出来的 `position`，不让旁边的视图追上、不排版（ADR 0011）。
- **核对**（`client/check.ts`）：跳过哪些宽度原来就按 `placedOtherwiseAt` 定，不用改。只改了全都跳过时的原因：X、Y 说「the canvas does not place the layer absolute」，`right` / `bottom` 照旧说「places the layer otherwise than by its `right`」。
- 改动单字段 `placedOtherwiseAt` 的说明（`client/changeset.ts`）、spec「核对」一节各补了一句。改动说明没有改（代定第 2 条）。

*代定的事（待设计师确认）*

我按「最贴近设计师决定」代定的：

1. **只看是不是自由定位，不看 X、Y 是不是「按这条边」定位**。`right` / `bottom` 还要看 `left` / `top` 有没有值，X、Y 不用：改 X 写的是 `left` 加 `right: auto`（Y 同理），作用于所有宽度，所以画布上只要是自由定位，X、Y 就决定它的位置。钉在窗口上的 `fixed` 图层也算自由定位，和页面其他地方一样。
2. **「How the page checks」不补句**。设计师选做法 1 时说过，做法 2 每次要多给 Agent 一段它用不上的话；75 跳过 `right` / `bottom` 的宽度时也没有在说明里补。被跳过的宽度上 `done` 不再说话，Agent 不需要知道。
3. **全都跳过时的原因**照 75 代定第 6 条，写「在核对的宽度上，画布上的图层不是自由定位」（英文见上），不说「图层不在页面上」。
4. **什么时候读旁边的视图**照 75 代定第 4 条：这条改动第一次记下时读一次。X、Y 改动不改 `position`，早读晚读一样。

*测试*

接缝沿用 75 的选法（设计师和指挥不在场，没有当面商定）：编辑命令和页面核对、e2e 脚本扮演 Agent。都先在没改的代码上看着失败（第二条单测是不报虚假 ✓ 的护栏，改前改后都该过）。

- **编辑命令** `edits.browser.test.ts` +2 条：
  - 页面自己的媒体查询让画布的手机视图里图层在排版里：X、Y 两条改动都记下手机的宽度范围；照改动写后在手机宽度「显示了」；窗口在手机宽度时窗口宽度也不看，全都跳过时答没能核对和上面的原因。没改的代码记不下范围，失败。
  - 画布各视图都自由定位：不记范围；页面在手机宽度上不是自由定位时「没有显示」，实际值是「没有」（80 的说法）。
- **e2e** `round.spec.ts` +1 条：就是上面「先复现」的剧本，断言改动单的 `placedOtherwiseAt`（第一个的 X、Y 记下 768px 以下，第二个不记）、写之前三条都「没有显示」、照写后 1、2「显示了」、3 照 80 的说法「没有显示」。在没改的代码上失败（改动单里没有范围；`done 1` 报不是自由定位）。前后的输出是同一条剧本在两份代码上加了临时打印跑出来的，打印没有留在仓库里。
- **其他场景逐字不变，怎么确认的**：
  - 按代码看：只有画布在某个旁边视图里不是自由定位的图层，X、Y 改动才会多出 `placedOtherwiseAt`；没有这个字段，核对和以前完全一样。`claim` 和 `finish` 不读这个字段。
  - 按测试看：原有的测试一条期望都没改，全部照旧通过，其中有 `cli.test.ts` 里 `claim` / `done` / `finish` 逐字比对的测试，和 e2e 里的落地剧本（round、claim、applying-bench、bench-scenarios、next-round、react18-round 等）。
- **全量**：
  - typecheck 通过。
  - 单测 806 通过、1 跳过；node 测试 32 条通过（含旧名检查）。
  - e2e（`TK_E2E_PORT=5800 pnpm test:e2e`）394 通过、1 跳过，一次跑过，没有重跑。切换按钮体积检查（install.spec、toggle-first.spec）在里面，通过。

*前后数字（docs/goals.md「度量」）*

包体积（gzip -9）：切换按钮 `react.dev.js` 822 B + 共用 chunk `chunk-UQJRS7YD.js` 9164 B，改前改后逐字节相同（同一个文件名，校验和相同）。编辑层延迟加载的部分 `editor.dev.js` 322868 → 322964 B（未压缩，+96 B），gzip 109685 → 109720 B（+35 B）。

性能没有跑：多出来的只有一处，X、Y 改动第一次记下时，读旁边每个视图里这个图层算出来的 `position`（一个视图一次），之后的步子不读。性能测试里拖的是卡片（排版里的重排）、按住方向键改的是圆角和间距，都碰不到 X、Y，跑了也量不到这一下。旁边的视图在这一刻还没收到这一步（ADR 0011），样式是算好的，读 `position` 一般不用重算样式。

*按 code-review 修正*

（code-review 没有另外跑，由指挥审。）自己看了一遍：改动只在 75 原有的那条路径上加了 X、Y 一支，命名照周围的写法（`viewsPlacingOtherwise` 改为接受 `PLACED_BY` 的那一项，`edits.ts` 里新变量叫 `placedBy`，避开同一函数里已有的 `along`）。

*遗留风险*

1. **Agent 把图层在画布不是自由定位的宽度也设成自由定位，`done` 不管**。例如把 `md:absolute md:left-[40px]` 改成 `absolute left-[60px]`：手机宽度上页面和画布不一样，但那个宽度不看，X 照样报「显示了」。改前这时也报「显示了」（页面在各宽度都是自由定位、`left` 都对），不是本 ticket 带来的；75 的 `right` / `bottom` 同样。X、Y 的核对只看位置，不看 `position` 有没有被改到别的宽度。
2. **读一次的记录会过时**（同 75 整线审查遗留风险第 1 条）：同一轮里先改了 X，之后又在手机视图里把这个图层改成自由定位（`absolute` 改动），记下的范围不跟着变，手机宽度仍不看 X。手机视图里那条改动自己会在手机宽度核对位置。
3. **一个视图代表一整段宽度**（同 75 遗留风险第 3 条）：手机范围 0–767px 里项目还有 `sm` 断点、两段自由定位不同时，按手机视图那一个宽度算整段。
4. 没跑真实 Agent。
