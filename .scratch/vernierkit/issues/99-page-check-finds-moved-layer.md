# 99: 图层上面多了几行时，页面核对仍找得到挪了位置的图层

**What to build:** ticket 88 的真实跑发现，源码里图层上面多了几行（参数或 JSX 拆成多行、外面包一层），页面核对去找「挪了位置的图层」（`movedElementsOf`）时会找错或找不到，把写对的改动核成没显示，或读了旁边元素的样式。读代码看是两处：

- 它按「现在离图层原来的行最近」挑候选。上面多了 k 行时，紧挨在图层上面的元素反而离原来的行更近，就被挑中（`next-server-usage-text`：`Stat.tsx` 的参数拆成多行后，文字核对读成了数值「5,000」「0」）。
- 它只看自己带源码标记（`data-tk-loc`）的元素。第三方组件渲染的元素只带使用处传下来的 `data-tk-usage`，不在候选里，于是找不到（`third-party` Claude run-1：「the layer is not on the page now」），或挑到 Agent 新加的元素（run-2：读了新包的 `<div>`，三次说「no fill」）。

要做到：图层上面多了行、包了一层，或它是第三方组件的元素时，`done` 仍核到这个图层本身；找不准时如实说找不到，不读别的元素。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 无

**Status:** needs-triage

- [ ] 先复现：拿 `next-server-usage-text`（`Stat.tsx` 的参数拆成多行）和 `third-party`（Surface 上面多了几行，比如给 Badge 包一层）做脚本剧本（`apply`）或单元测试，在没改的代码上看着核错
- [ ] 两处都修：上面多了行时挑的是图层本身；只带 `data-tk-usage` 的第三方组件元素也在候选里
- [ ] 找不准时说找不到，不读旁边的元素；不出新的虚假的 ✓
- [ ] `--dry` 24/24、`--scripted` 全过；其余 `done` 的输出逐字不变

## 背景

- ticket 88 真实跑（2026-11-05）：Claude 按核对少的 2 条、核对覆盖率少的 1 条、进度差 1 的 1 次，还有 pi 用时、调用、读入字数最大的那次（`next-server-usage-text` run-2：整轮 122 秒，读 `node_modules/03kind` 14 次），都是这个。Agent 为了让核对认出来，把代码排回了原样。原始记录在 88 线的 `bench-results/agents/88-real/`。
- 原因是读代码推出来的，复现时确认。
- 顺带看到的：页面核对分不出 `w` 和 `max-w`（Claude put-back-and-new-text run-1 用 `max-w-[649.5px]` 代替固定宽度，核成显示；它在 ⚠️ 下说明了，不算虚假的 ✓）。分诊时定要不要一起做。
