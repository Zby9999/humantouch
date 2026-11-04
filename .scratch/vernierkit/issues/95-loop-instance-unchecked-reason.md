# 95: 循环里的删除、复制、移动，`done` 给它自己的原因

**What to build:** 在画布上删掉、复制或挪动循环里的一项（例如特性列表里的 Arrange 卡片，卡片由同一段数据循环生成），页面核对不了：它分不清循环里的每一份。核对不了没问题，可 `done` 给的原因落在兜底那句「of the changes to the structure, only reorders, absolute placements in the same container and deletions are checked on the page」：这句说删除、调换顺序是核对的，这次的删除偏偏没核对，Agent 读了容易糊涂，报告里可能归错类。要做到：这类改动有它自己的、准确的原因，口吻照 90 给改字定的那句（「the words come from the data the loop goes through, and the page cannot tell the loop's instances apart」）。只改原因，不让页面去核对它们。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准（「Faithful」：报告合规），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0006、0013）。

**Blocked by:** 无

**Status:** ready-for-agent

- [ ] 先复现，用剧本（脚本扮演 Agent，不跑真实 Agent）：测量台的 `data-and-text` 场景（删掉 Arrange 卡片、复制 Freeze 卡片），`done` 现在对这两条说的是兜底那句
- [ ] 循环里的一项被删除、复制、调换顺序或挪走时，`done` 说它自己的一句原因（说清是循环所用的数据、页面分不清循环里的每一份），`finish` 报告里相应的地方跟着用；说法由这条线代定，等设计师确认
- [ ] 把所有落到兜底那句的情况列一遍：兜底那句对它说得对的（例如复制一个不在循环里的图层），照旧；说得不对的，各给准确的原因，照现有原因的口吻
- [ ] 改动说明（`claim`）「How the page checks」一节里核不了的名目，和新的原因说法对得上（已有「a change to one of a loop's instances alone」，看要不要跟着改）
- [ ] 没有这类改动的一轮，`claim`、`done`、`finish` 的输出逐字不变；切换按钮的包逐字节不变
- [ ] 测量台的标准场景跑 `--dry` / `--scripted`：只有含这类改动的场景（`data-and-text` 等）那几行变了，别的逐字不变

## 背景

- ticket 90 的遗留风险第 1 条（2026-11-04）：数据里的删除、移动、复制仍说结构改动那句，删除本来是核对的，这句最容易误导。90 那条线没改，因为改它会改变没有改字的一轮的输出。
- ticket 88 跑的标准场景 `data-and-text` 正好有删除、复制循环里的一项，88 一定会碰到这句。88 的数字会成为以后的基线，所以排在 88 前面。

## 设计师决定（2026-11-04，分诊）

- 选做法 1：开 ticket，只把原因改准确，排在 88 前面。
- 考虑过的别的做法：让页面真去核对这类改动（按每一份的字和顺序比画布），更彻底，但要新设计比法，88 要多等，等 88 的数据看这类改动出错多不多再定；先不动，等 88 的数据看 Agent 有没有被误导。
- 先复现，再修。不跑真实 Agent。
