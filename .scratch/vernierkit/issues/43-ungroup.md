# 43: 解除分组（⌘⇧G）

**What to build:** 选中一个 Stack 或 Frame 按 ⌘⇧G（与 Figma 相同），去掉这一层：子图层放进它原来所在的容器，占它原来的位置，画面不动。所在容器是 Stack 时，子图层按顺序加入其排列；所在容器是 Frame 或子图层原来是自由定位时，子图层自由定位在原处。与解散（⌥⇧A）不同：解散保留 Frame，只去掉自动布局。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 42

**Status:** ready-for-agent

- [ ] Stack 中的 Stack 解除分组后，子图层依次加入外层 Stack，位置几乎不跳
- [ ] Frame 中的 Frame 解除分组后，子图层自由定位在原处
- [ ] 解除本轮新合成的 Stack 等于撤回那次合成
- [ ] 改动说明写明去掉哪个图层、子图层按顺序放到哪里；Skill 补充落地规则
- [ ] 可撤销，改动列表中可单独撤回
