# 10: 布局类属性

**What to build:** 属性面板提供布局类属性：自由定位图层的 X / Y；宽、高的 Fixed / Hug / Fill 与最小、最大尺寸；Stack 的方向、间距、四边内边距、九宫格对齐、均匀分布、换行；透明度、显示 / 隐藏、裁剪内容。多选时数值不同的属性显示 Mixed 并可统一修改。全部使用设计语言，不出现 CSS 术语。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 06, 25

**Status:** ready-for-agent

- [ ] 每个属性修改后画布立即生效，并产生对应改动记录与改动说明
- [ ] Fill 只在父容器为 Stack 时可选
- [ ] 普通从上到下排列的区域显示为纵向 Stack；修改其间距或对齐时，改动说明与 Skill 指示 Agent 把它改为真正的 Stack
- [ ] 外边距不在面板中出现
- [ ] 锁定图层只提供位置与外部尺寸
- [ ] 多选时数值不同的属性显示 Mixed，修改后统一生效
- [ ] 辅接缝 1 覆盖设计语言到画布样式的对应（Hug / Fill / Fixed、Stack 参数、自由定位）
- [ ] 新属性在改动预览中生效

## Comments

**交接（2026-10-23，开工前请读，流程见 21 的交接）**

每个新属性都要接上已有的几件事：

- 在 `edits.ts` 的 `PROPERTIES` 里登记：适用的图层类型、`read`（读成设计语言）、`write`（画布上的 CSS，也是改动的 `style`、即参考样式）、`sets`（它读哪些 CSS 长属性）。缺了 `sets`，改动说明的 "Currently set by"（28）就没有；`read` 必须能用 `readValue` 在真实页面上读出与 `after` 结构完全相同的值，否则 `done` 的核对（29）会误报 "not shown"。
- 改动预览（25）直接把 `style` 注入真实页面，所以 `write` 产出的 CSS 要能单独作用在真实元素上，不能依赖画布特有的状态。
- `change-notes.ts` 的 `PROPERTIES` 名称表和 `value()` 要给新属性写好说法（设计语言，不出现 CSS 术语）。

10 本身：

- **冻结器钉住的样式。** 固定定位的元素（以及以页面为参照的绝对定位元素）在冻结时被写了内联 `!important` 的 `top` / `left` / 宽高 / 外边距（02、03 的已知限制）。读 X / Y、Fixed 尺寸之前，先在冻结器里给这些元素标记"哪些属性是冻结时钉住的"，否则会把冻结产物当成页面的值，"Currently set by" 也会写成内联样式。
- **Hug / Fill / Fixed 从声明值判断，不能从计算值判断。** 计算后的宽高永远是 px。`style-source.ts` 的 `sourcesOf` 能给出胜出的声明（如 `width: 100%`、类 `w-full`、`flex: 1`），可以复用来判断，并且同时得到来源。
- **普通从上到下排列的区域**显示为纵向 Stack，实际是块级流。改它的间距或对齐时，画布上要真的改成 `display: flex; flex-direction: column` 才能所见即所得；改动说明要写明"把它改为真正的 Stack"，Skill 同步。
- **显示 / 隐藏。** 图层模型会跳过 `display: none` 的元素（`layers.ts` 的 `drawnChildren`），用 `display: none` 隐藏会让图层从图层树里消失、再也选不回来。画布上要换一种方式隐藏，或让图层模型保留被设计师隐藏的图层。
- **多选目前不存在。** 选中是单个图层（`Shell.tsx` 的 `selected: Layer | null`，`selection.ts` 也是单选）。验收要求多选与 Mixed，需要先把选中改成一组图层（⇧ 单击、图层树多选）。`NumberField` 已经支持 `null` 显示为 Mixed。
- **锁定图层只提供位置与外部尺寸**：`kinds` 里要允许 `locked`，但只限这几项。
- 外边距不出现在面板中。
