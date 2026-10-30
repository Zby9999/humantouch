# 65: Skill 只留流程，写法随改动说明给出

**What to build:** Skill 只留一轮的流程：认领、落地、`done`、`finish`、报告。每种改动该怎么写（Stack、Grid、断点、挪回画布、数据改动等）挪进 `claim` 的输出，只在这一轮出现这类改动时打印一次。Agent 读得少、记得住；没加载 Skill、只跑了 `claim` 的 Agent，也能照输出走完一轮。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0013）。

**Blocked by:** 63, 64

**Status:** ready-for-agent

- [ ] Skill 只剩流程与报告格式，长度不超过现在的三分之一
- [ ] `claim` 的输出只包含这一轮出现过的改动种类的写法，每种只出现一次
- [ ] 真实 Agent（与 63 同一 Agent、同一模型）：每轮读入的字数比 63 的基线少；整轮用时、每条平均工具调用次数不高于基线；1:1 落地率、设计变量使用率、虚假的 ✓ 不变差；前后数字记在 Comments
- [ ] 不加载 Skill 的场景：只对 Agent 说「运行 `npx vernierkit claim`，照输出落地」，真实 Agent 能走完一轮，报告格式合规
- [ ] spec 中 Skill 的内容随之更新

## 背景

- 现在的 Skill 有 146 行，大部分是每种改动的写法，而一轮通常只出现其中几种。改动说明里已经有一部分是按需给的（如 Wrap it、Drop the margins）。
- 等 64 先改完 Skill 里 `done` 的说法，再动 Skill，避免两张同时改同一份文字。
