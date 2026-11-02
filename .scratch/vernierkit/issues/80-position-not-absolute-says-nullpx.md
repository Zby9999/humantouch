# 80: 图层在页面上还不是自由定位时，`done` 说「Y position is nullpx」

**What to build:** 改 X、Y（以及 75 加的右边、下边）的改动，如果图层在页面上还不是 `position: absolute`，`done` 现在会说「The Y position is nullpx, not 488px … Something overrides your change: see what sets the value in the notes (Currently set by)」。`nullpx` 是读不到值时漏出来的，后半句又把 Agent 引到「有别的样式盖住了」，而真正的原因是图层还没设成自由定位。`finish` 的 Why 一行也会写「the page shows the Y position nullpx」。要改成照实说：图层在页面上还不是自由定位，先检查它的 `position`、`left`/`top`，以及容器是不是它的定位参考。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0006、0013）。

**Blocked by:** 无

**Status:** ready-for-agent

- [ ] X、Y、右边、下边的改动，图层在页面上不是自由定位时，`done` 不出现 `null`，说出图层还不是自由定位、该检查什么（和「位置」改动现有的「not placed absolute」说法一致）
- [ ] `finish` 的 Why 一行同样不出现 `null`
- [ ] 剧本或单元测试：脚本扮演的 Agent 改了 Y 却没设 `position: absolute`，改前出现 `nullpx`，改后照上面说
- [ ] 其他场景的 `claim`、`done`、`finish` 输出逐字不变；变了的那几份前后各存一份记在 Comments

## 背景

- 落地线（78、76、77）整线审查时发现（2026-11-02）。测量台的 dissolve-place-frame 场景在没人落地时（`--dry`）就能看到：`done` 和 `finish` 都写了 `nullpx`。main 上一样。
- 原因：`client/check.ts` 的 `lookPosition` 遇到不是 absolute 的元素时，给出的 actual 是按 X/Y 读的值，读不到就是 `null`；`cli.ts` 里专门处理「不是自由定位」的分支只管「位置」（absolute）一种改动，X、Y、右边、下边落到通用的「Something overrides your change」那句，把 `null` 拼成了 `nullpx`。从 ticket 64（7c8049e）起就这样，不是落地线引入的。
- 真实 Agent 忘了设 `position: absolute` 时会碰到，`done` 的说法会把它引到错误的方向（去查 Currently set by）。

## 设计师决定（2026-11-02，分诊）

- 做，按上面的验收项。真实 Agent 照现在这句话会去查 Currently set by，绕错方向。不跑真实 Agent。

## Comments
