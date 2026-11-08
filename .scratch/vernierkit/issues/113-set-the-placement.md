# 113: 在面板里设定位方式

**What to build:** 编辑层现在认得自由定位图层的定位方式（从左边或上边、右边或下边、居中），改尺寸、移动时都保留它（ticket 75、79、96、97，ADR 0014），但没有设它的界面：ADR 0014 写明「编辑层不提供设定约束的界面」。设计师在 Figma 里用约束（Constraints）决定父容器变大变小时子图层怎么跟着走。要做到：选中自由定位的图层，Position 一节里能看到、也能改它两个方向的定位方式，横向 Left / Right / Left & Right / Center，竖向 Top / Bottom / Top & Bottom / Center，样子照 Figma 的约束。改了以后图层在画布上不动，只是改成按新的一边摆；父容器在画布上改尺寸时，子图层照它的定位方式跟着走（CSS 本来就这样）。Left & Right 是左右两边都写距离、宽度随父容器变（`inset-x-*`），Top & Bottom 同理。Figma 的 Scale（按比例）不做，留在路线图。

不另起新词：仍叫「定位方式」，它本来就是 Figma 约束里的这几种（GLOSSARY）。

参考本功能的 spec.md（同目录上一级，「移动时保留定位方式」），用词以 GLOSSARY.md 为准（「定位方式」），并遵守 docs/adr/ 中的决策（ADR 0006、0008、0014）。

**Blocked by:** 无（发布以后做，见 111 的「设计师决定」：排在图片之后）

**Status:** ready-for-agent

- [ ] 选中一个自由定位的图层，Position 一节显示它两个方向现在的定位方式（按 GLOSSARY 认出的那几种，包括 `translate(-50%)` 和 `auto` 外边距居中）；多选、不是自由定位的图层不显示或不能改
- [ ] 改定位方式时图层在每个视图里都不动（1px 以内），画布上的写法换成按新的一边；Left & Right、Top & Bottom 时尺寸改成随父容器变；居中写成哪一种（`translate`、`calc(50% …)`、`auto` 外边距）作为代定
- [ ] 父容器在画布上改尺寸（控制点、面板改宽高），子图层照定位方式跟着走，三个视图都一样
- [ ] 平板、手机视图里改只在那个断点生效（ADR 0008），有断点标记、可重置
- [ ] 一次改是改动列表里的一条，⌘Z 一步撤回；之后再移动、改尺寸照 ADR 0014 保留新的定位方式
- [ ] 改动说明写明新的定位方式和距离，照项目的写法；`done` 核对算出的 `left` / `right` / `top` / `bottom` / 宽高 / `transform`，断点改动照 ticket 104 也看范围外的宽度；ADR 0014 原来那几条核对规则照旧
- [ ] 脚本扮演 Agent（`apply`）走一遍「改成按右边、落地、`done`」和「改成 Left & Right、落地、`done`」，核对是 ✓
- [ ] 原来的改动说明逐字不变：`--dry` 24/24、`--scripted` 全过；切换按钮的包逐字节不变
- [ ] 性能 headless 前后对比（`TK_PERF_HEADLESS=1`）：进入编辑模式、改数值、拖动不变差
- [ ] e2e 全过，`move-placement.spec.ts` 原有的测试不改；GLOSSARY「定位方式」去掉「编辑层没有设约束的界面」、补上 Left & Right；ADR 0014 的 Consequences 相应改；docs/roadmap.md、spec 的 Out of Scope 写明 Scale 仍不做

## 背景

- docs/roadmap.md「第一版之后（已承诺）」的「约束 / 钉住（Pin）」。设计师 2026-11-09 定为开 ticket。

## 设计师决定（2026-11-09，分诊）

- 不另起新词，沿用「定位方式」；加上 Left & Right 和设它的界面；Scale 不做，留在路线图。
- 发布以后做，排在图片（111、112）之后；都用 effort medium。
