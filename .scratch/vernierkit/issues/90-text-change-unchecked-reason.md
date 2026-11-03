# 90: 改字的改动没在页面上核对时，`done` 说的原因是「结构改动」的

**What to build:** 一条改字（Text）的改动在页面上核对不了时，`done` 给的原因是 "of the changes to the structure, only reorders, absolute placements in the same container and deletions are checked on the page"，好像它是一条结构改动。改字有自己的原因可说（例如新的文字页面不核对），Agent 照这句话写报告就会写错类别。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准（「Faithful」里的核对覆盖率和报告），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 无

**Status:** needs-triage

- [ ] 改字的改动在页面上没核对时，`done`（以及 `result.json` 里的原因）说的是改字自己的原因，不再落到结构改动那句
- [ ] 有单元测试覆盖这条原因；切换按钮的包大小按 goals 的要求看

## 背景

- ticket 87 的审查发现（2026-11-03）：在 Next.js 示例的场景 `next-server-usage-text` 里，第三个 Stat 的 label 改字，`npx 03kind done` 对它说的是上面那句结构改动的原因。
- 原因来自 `packages/03kind/src/client/check.ts` 的 `uncheckable()`：前面的分支都不认改字，最后落到结构改动的兜底那句。没有测试覆盖改字的原因。
- 不影响落地本身；影响 Agent 报告里写的原因（ticket 88 会数报告合规）。
