# 48: 编辑器图标换成 Hugeicons Stroke Rounded

**What to build:** 设计师指定编辑器图标统一使用开源的 Hugeicons Stroke Rounded（免费版，MIT）。在线框风格的开源图标里，它的设计工具类图标最全：对齐、均分、描边、边框、编组、组件、透明度、文字属性都有。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `icons.tsx` 中的 20 个图标全部换成 Hugeicons Stroke Rounded，14px 显示，线宽 1.25px
- [x] 不增加运行时依赖，SVG 内联
- [x] 附上 Hugeicons 的 MIT 许可，打包产物中保留

## Comments

**被取代（2026-10-28）**：设计师对比后改用 Tabler Icons，见 49。

**实现记录（2026-10-28）**

- 对照：stack-vertical → `layout-2-row`，stack-horizontal → `layout-2-column`，grid → `grid-view`，frame → `frame`，text → `text`，image → `image-03`，still → `play-square`，instance → `component`，lock → `square-lock-02`，radius → `square-round-corner`，plus → `plus-sign`，minus → `minus-sign`，gap → `align-horizontal-space-between`，close → `cancel-01`，opacity → `transparency`，undo → `undo-02`，sidebar → `sidebar-left`，play → `play`，pointer → `cursor-01`，brief → `sticky-note-03`。
- SVG 取自 Iconify 的 `hugeicons` 集（MIT）；上游许可为 github.com/hugeicons/hugeicons 的 LICENSE.md，原文以 `/*! */` 注释放在 `icons.tsx` 顶部，构建后保留在 `react.dev.js` 中。
- 浮动开关按钮上的图案是 Vernier Kit 自己的标志，没有换。

**调整（2026-10-28）**

- 设计师用滑块对比后定为 14px、线宽 1.25px。两个值是 `styles.ts` 里 `:host` 上的样式变量 `--vk-icon-size` 与 `--vk-icon-stroke`；线宽用 `vector-effect: non-scaling-stroke` 按屏幕像素算，不随图标大小缩放，改其中一个不影响另一个。

**已知限制**

- 免费版里没有内边距、宽高、阴影、行高、约束这几类图标，以后需要时按同样的 24px 网格和 1.5 线宽自己画。
