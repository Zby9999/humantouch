# 49: 编辑器图标换成 Tabler Icons

**What to build:** 设计师把 Hugeicons、Lucide、Tabler 三套放在一起比较后，选了 Tabler Icons 的线框风格（MIT），显示为 13px、线宽 1px。Hugeicons 免费版只有 Stroke Rounded，太圆；不那么圆的 Sharp 与 Standard 只在付费版里，而付费版不允许把图标源文件随 npm 包分发。Tabler 更方正，而且有 Hugeicons 免费版缺的设计图标：内边距、外边距、行高、阴影、模糊、宽高 Hug、各边边框、布尔运算、翻转。取代 48 的图标选择。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `icons.tsx` 中的 20 个图标全部换成 Tabler Icons outline
- [x] 图标 13px，线宽 1px（`--vk-icon-size`、`--vk-icon-stroke`）
- [x] 附上 Tabler Icons 的 MIT 许可，打包产物中保留

## Comments

**实现记录（2026-10-28）**

- 对照：stack-vertical → `layout-rows`，stack-horizontal → `layout-columns`，grid → `layout-grid`，frame → `frame`，text → `letter-t`，image → `photo`，still → `movie`，instance → `components`，lock → `lock`，radius → `border-radius`，plus → `plus`，minus → `minus`，gap → `spacing-horizontal`，close → `x`，opacity → `opacity`，undo → `arrow-back-up`，sidebar → `layout-sidebar`，play → `player-play`，pointer → `pointer`，brief → `note`。
- SVG 取自 Iconify 的 `tabler` 集；上游许可为 github.com/tabler/tabler-icons 的 LICENSE，原文以 `/*! */` 注释放在 `icons.tsx` 顶部，构建后保留在 `react.dev.js` 中。
- 线宽由样式统一覆盖（`vector-effect: non-scaling-stroke`），SVG 里原有的 `stroke-width="2"` 不起作用。

**已知限制**

- 静态画面（`movie`）与生成说明（`note`）是近似的选择：Tabler 没有"方框里一个播放键"或便签样式的图标。
- 用虚点表示的图标（圆角、透明度，以及以后的内边距、边框）在 13px、1px 下点很小，偏淡。
