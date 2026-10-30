# 72: 改动列表的撤销键与编辑层一致，给 Agent 的说明不说 set aside

**What to build:** 预览模式的改动列表里，现在按 ⌘Y 会撤销，编辑层里 ⌘Y 却不响应。改动列表改用和编辑层同一套撤销键：⌘Z 撤销，⇧⌘Z 和 Ctrl+Y 重做，⌘Y 不响应（交给浏览器）。另外，给 Agent 的改动说明和 Skill 在讲画布外的图层时用了 "set aside"，GLOSSARY 要求避开 Aside，改为用画布外的图层（Off-canvas Layer）的说法。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0012）。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 改动列表和编辑层判断撤销键时共用一处，不再各写一份
- [ ] e2e：在改动列表里，⌘Y 既不撤销也不重做；Ctrl+Y 重做；⌘Z、⇧⌘Z 照旧
- [ ] 改动说明里讲"放回画布外图层的副本"的那句，以及 Skill 里 **Put back** 的解释，都不再出现 aside；单测把新的说法固定下来
- [ ] 全量单测和 e2e 通过

## 背景

- 来自编辑层线合并时（2026-10-30）报告的遗留风险第 9 条，用户决定修。
- Mac 上 Ctrl+Y 也重做，ADR 0012 已写明，不改。
