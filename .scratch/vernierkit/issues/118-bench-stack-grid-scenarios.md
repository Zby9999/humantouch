# 118: 测量台加 Stack 和 Grid 的标准场景

**What to build:** ticket 109（Stack 和 Grid 互转、Grid 格子的 Hug / Fill）和 110（⇧A 合成 Grid）只用脚本扮演 Agent，在 `applying-bench.spec.ts` 里走过，没有进测量台的标准场景，真 Agent 还没写过 Grid。要做到：测量台的标准场景里加上这些改动，真 Agent 能照常跑、照常出 1:1 和 `done` 的统计；下一次真 Agent 复验时一起跑。

参考 ticket 88（验收的做法和统计）、109、110 的 Comments，用词以 GLOSSARY.md 为准。

**Blocked by:** 109 的 follow-up（代定 6：按位置摆子图层的 Grid 也能改成 Stack）、110

**Status:** ready-for-agent

- [ ] 新场景至少包括：
  - 桌面视图里横排 Stack 转 Grid、再改列数；
  - 手机视图里 Grid 改回竖排，只在手机上生效；
  - Grid 里一个格子 Hug 改 Fill；
  - 按 areas 摆的 Grid 在手机视图里改竖排；
  - ⇧A 把排成几行几列的自由图层合成 Grid。

  几个放一个场景里、怎么分作为代定。
- [ ] 每个新场景都有脚本扮演 Agent 的写法（`apply`）：`--scripted` 全过，`done` 是 ✓
- [ ] 原来 24 个场景的认领说明和 `done` 逐字不变（`--claim-out` 和改前 diff）；`--dry` 的个数变了，在 `docs/agents/` 或测量台说明里写上新的个数，88 的结果表注明「24 个场景时」
- [ ] 不跑真 Agent。真 Agent 跑这几个场景（Claude、pi 各 3 次）和下一次复验一起跑，例如 ticket 88 末尾第三方那条规则定下以后那次；开跑前问设计师额度
- [ ] e2e 全过

## 背景

- 设计师 2026-11-09 过 109 的代定 9 时同意：「另开一张票，加 2–3 个场景，等下次真 Agent 复验时一起跑」。
- 加进标准场景会改 88 的验收基数（24 个），所以 109 当时没加。

## 设计师决定（2026-11-09）

- 接在 109 那条线最后（109 → 110 → 109 follow-up → 117 → 118），照那条线的做法：设指挥，每张一个新的实现子 agent、一个审查子 agent，都用 effort medium。
