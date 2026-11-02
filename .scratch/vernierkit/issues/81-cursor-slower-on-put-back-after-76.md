# 81: 76 之后 Cursor 落地 put-back-and-new-text 变慢

**What to build:** 设计师定了要追（见下面「设计师决定」）。ticket 76 让页面能找到并核对这一轮新建的图层（核对覆盖率 0% → 100%，剧本里的虚假 ✓ 1 → 0），也因此在 `claim` 的说明里多写了新建图层放在哪里、页面怎么数。之后 Cursor 落地 put-back-and-new-text 这个场景，3 次都比 76 之前慢；同一批里 dissolve-place-frame 反而变快，Claude 两个场景前后范围重叠。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准（「度量」「Robust」的整轮用时、读入字数），用词以 GLOSSARY.md 为准。

**Blocked by:** 76（已完成）

**Status:** ready-for-agent

- [ ] `claim` 的说明里，这一轮新建图层的位置直接写成这一轮所有改动都落地之后的位置（容器里的第几个），Agent 不必自己推算落地前后；页面核对新建图层的做法照旧
- [ ] 前后对比用 main 上改前的代码和改后的代码，同一 Agent、同一模型：put-back-and-new-text 的 Claude、Cursor 各跑 5 次；dissolve-place-frame 各跑 3 次。记 claim→finish 用时、读 03kind 包的次数、全仓搜索次数、`claim` 读入的字数，以及 1:1 落地率和报告合规
- [ ] 改后 put-back-and-new-text 的 Cursor 用时中位数不慢于改前，读包次数下降；dissolve-place-frame 和 Claude 不变差；1:1 落地率和报告合规不下降
- [ ] 没有新建图层的场景，`claim`、`done`、`finish` 的输出逐字不变
- [ ] 跑真实 Agent 前先问设计师，说明总次数（约 32 次）
- [ ] 前后数字记在 Comments

## 背景

- 数字来自 76 的 Comments（2026-11-02，Cursor agent-cli 2026.10.22-27dcf5f，Grok 4.7 256K High）：
  - put-back-and-new-text：claim→finish 76 / 80 / 114 秒 → 121 / 141 / 175 秒，3 次都慢。
  - dissolve-place-frame：111 / 125 / 142 秒 → 97 / 104 / 128 秒，变快。
  - Cursor 总中位数 112.55 → 124.74 秒（+11%）；Claude 23.31 → 26.11 秒，范围重叠。
- 最慢的那次（175 秒）读了 03kind 包里的代码 7 次，想弄清新建文字算「容器里的第几个」：说明写「as its 3rd layer」，下一条改动又删掉了它前面的段落，Agent 弄不清页面按落地前还是落地后数。76 已在 How the page checks 加了「counted with this round's other changes applied or not」，最后一轮 3 次里仍有 1 次这样绕路。
- 可能的方向：说明里新建图层的位置直接写成这一轮其他改动落地后的位置，Agent 不必自己推算。
- 有新建图层的场景，`claim` 读入字数长了 6–7%（6,834 → 7,283、6,375 → 6,781 字）。

## 设计师决定（2026-11-02，分诊）

- 追，做法是说明里直接写这一轮所有改动落地后的位置。3 次全都比 76 之前慢，最慢那次绕路的原因说得清，不太像波动；这样写对 Claude 也没坏处。
- 不先回头确认 76 之前是不是真的更快（76 不会退回去），直接拿 main 上改前、改后的代码比。
- 排在 80 之后做，不急。

## Comments
