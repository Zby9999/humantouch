# 18: Grid 编辑

**What to build:** 页面中已有的 Grid 在面板中可改列数与行列间距；子图层在 Grid 中拖动等于换格子顺序。不提供新建 Grid，也不提供 Stack 与 Grid 互相转换。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 15

**Status:** done

- [x] 修改列数、间距后画布立即生效
- [x] 在格子之间拖动换序正确
- [x] 改动说明与 Skill 覆盖 Grid 改动

## Comments

**修复记录（2026-10-29）**

- 自行放置图层的 Grid（有图层用具体的 `grid-row` / `grid-column` / `grid-area` 线或 `order ≠ 0`，或 `grid-auto-flow` 含 `dense`；只有 `span N` 不算）不提供换序：其中的图层拖动或微移原地不动、不记改动；从别处拖入的图层放在最后（a095c4d）。只用 `span` 的 Grid 按视图排出的格子换序（a89984a）。
