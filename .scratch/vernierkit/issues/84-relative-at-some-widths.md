# 84: 图层在某些宽度相对挪动（`relative`、`sticky`）时，`done` 要 Agent 去设 `position`，`right` / `bottom` 在那里不看

**What to build:** 页面里有的图层在某些宽度是相对挪动（`relative` 或 `sticky`），在别的宽度自由定位，例如 `relative md:absolute md:left-[40px]`：手机上 `relative`，平板、桌面 `absolute`。在桌面视图里改它的 X 或 Y，改动作用于所有宽度，`left` / `top` 对 `relative` 也起作用，画布的手机视图里它也跟着挪了。现在有两个空子：

- **X、Y（83 留下的）**：那个宽度照常核对（83 代定第 1 条，设计师 2026-11-03 确认），但核对只认自由定位的图层。Agent 照改动写对了（`left-[60px]` 在所有宽度都有），`done` 仍说「At 390px wide, the layer is not placed absolute … check its `position` and `left`」，把 Agent 引去改 `position`，可能把手机上的排版改坏。
- **`right` / `bottom`（75 留下的）**：按右边、下边定位的图层，画布在某个视图里是 `relative` 时，那个宽度不看 `right` / `bottom`（`placedOtherwiseAt`）。可是 `left` 为 `auto` 时 `right` 在那里也挪动图层，Agent 写错了也可能报 ✓，是虚假的 ✓。

要做到：这种宽度上 `done` 比对图层的偏移本身，写对报 ✓，写错时说清这个宽度还要挪多少，不提 `position`。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0006、0008、0011、0013、0014）。

**Blocked by:** 无（83 已完成）

**Status:** ready-for-agent

- [ ] 先复现，用剧本（脚本扮演 Agent，不跑真实 Agent）：(a) `relative md:absolute md:left-[40px]` 的图层，桌面视图改 X，Agent 写对，`done` 现在报「not placed absolute … check its `position`」；(b) 手机上 `relative`、平板桌面按右边定位的图层，桌面视图改 X（ADR 0014，写成 `right`），Agent 只写 `md:right-[…]`，`done` 现在报 ✓
- [ ] X、Y 改动和按右边、下边定位的改动第一次记下时，除了 83、75 已记的宽度，再记下画布在旁边视图里是 `relative` / `sticky` 的宽度范围（改动单新字段）。按画布定，不按 Agent 改完后的页面定；读法照 75 代定第 4 条（第一次记下时读一次，ADR 0011）
- [ ] 在这些宽度上比对偏移本身：页面上图层在那个宽度也是 `relative` / `sticky`（和画布一样），并且 `left`（`top`、`right`、`bottom`）等于改动的值，才算显示了。页面上在排版里（`static`），或在那里被改成了自由定位，都不算显示了
- [ ] 没显示时换新说法：说这个宽度画布上把图层挪多少、页面上它的值是多少（或没挪动它），不提 `position` 和定位参照。`finish` 报告里 Why 那一行要有相应的一句。说法照 80 的口吻写，由这条线代定，等设计师确认
- [ ] 不报虚假的 ✓（docs/goals.md）：`static` 的宽度照 83 跳过，`absolute` / `fixed` 的宽度照 80 的说法核对，都不变
- [ ] 83 遗留风险第 7 条一并看：所有宽度都被跳过时的原因，在新做法下是不是仍然成立，不成立就改
- [ ] 没有这种图层的场景，`claim`、`done`、`finish` 的输出逐字不变；切换按钮的包逐字节不变
- [ ] 剧本或单元测试覆盖：`relative`、`sticky` 各一，X 和 `right` 各一，写对、写错各一

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
