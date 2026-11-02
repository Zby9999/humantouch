# 81: 76 之后 Cursor 落地 put-back-and-new-text 变慢

**What to build:** 先由设计师定要不要追。ticket 76 让页面能找到并核对这一轮新建的图层（核对覆盖率 0% → 100%，剧本里的虚假 ✓ 1 → 0），也因此在 `claim` 的说明里多写了新建图层放在哪里、页面怎么数。之后 Cursor 落地 put-back-and-new-text 这个场景，3 次都比 76 之前慢；同一批里 dissolve-place-frame 反而变快，Claude 两个场景前后范围重叠。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准（「度量」「Robust」的整轮用时、读入字数），用词以 GLOSSARY.md 为准。

**Blocked by:** 76（已完成）

**Status:** needs-triage

- [ ] 先确认是不是真变慢：同一 Agent、同一模型，put-back-and-new-text 前后各多跑几次（例如各 5 次），看 claim→finish 用时和读包、全仓搜索次数
- [ ] 如果是，找出 Agent 绕路的原因并改说明，改后 put-back 不慢于 76 之前，其他场景不变差
- [ ] 前后数字记在 Comments

## 背景

- 数字来自 76 的 Comments（2026-11-02，Cursor agent-cli 2026.10.22-27dcf5f，Grok 4.7 256K High）：
  - put-back-and-new-text：claim→finish 76 / 80 / 114 秒 → 121 / 141 / 175 秒，3 次都慢。
  - dissolve-place-frame：111 / 125 / 142 秒 → 97 / 104 / 128 秒，变快。
  - Cursor 总中位数 112.55 → 124.74 秒（+11%）；Claude 23.31 → 26.11 秒，范围重叠。
- 最慢的那次（175 秒）读了 03kind 包里的代码 7 次，想弄清新建文字算「容器里的第几个」：说明写「as its 3rd layer」，下一条改动又删掉了它前面的段落，Agent 弄不清页面按落地前还是落地后数。76 已在 How the page checks 加了「counted with this round's other changes applied or not」，最后一轮 3 次里仍有 1 次这样绕路。
- 可能的方向：说明里新建图层的位置直接写成这一轮其他改动落地后的位置，Agent 不必自己推算。
- 有新建图层的场景，`claim` 读入字数长了 6–7%（6,834 → 7,283、6,375 → 6,781 字）。

## Comments
