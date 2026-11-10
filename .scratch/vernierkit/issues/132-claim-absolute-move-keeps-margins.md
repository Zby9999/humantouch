# 132: `claim` 的「Moves」那条写明：挪成 Absolute 的图层，margin 留着

**What to build:** 131 合并后，我在 main e937b4ea 上跑了 42 次真实运行。Claude 没登录，那 21 次没有结果。pi 在 `off-canvas-frame` 里 3 次全错在同一条：第 4 条，把介绍段落挪进新 Frame，放成 Absolute。

- pi 每次都去掉了段落的 `mt-4`，写成 `absolute left-6 top-[35px]`。段落因此比画布上高了 16px。
- 3 次 pi 都把它列在 ✓ 下面。run-2 还写了理由：「`mt-4` dropped so Y is exactly 35px」。

这和 ticket 100 是同一个问题，只是出在另一条说明里。

- 03Kind 里 X、Y 就是 `left`、`top`，margin 留着。图层画在 `left`、`top` 再加上 margin 的位置。
- 这句话现在只写在两处：
  - 「Dissolving a Stack」和「Dissolving a Grid」两条（ticket 100 加的）；
  - 「How the page checks」里能核对的那种放置。
- 「Moves」那条只写了「the `left` / `top` given」。
- 这次的 Frame 是新加的，页面找不到它，`done` 说 Not checked。所以 Agent 既看不到核对那一节的这句话，`done` 也拦不住它。

要做到：

- 「Moves」那条，在被挪成 Absolute 的图层带 margin 时（改动单里有 `margins`），写明：
  - `left`、`top` 就是给的 X、Y；
  - margin 留着；
  - 图层画在 `left`、`top` 加上 margin 的位置，去掉一个 margin 就会挪开同样多。
- 用英文，和「Dissolving a Stack」那句同一种写法。
- 不带 margin 的挪动，说明一字不变。

参考 ticket 100（同样的修法）、ADR 0014，用词以 GLOSSARY.md 为准。

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] 「Moves」那条，在图层带 margin 时写明 margin 留着、怎么画。不带 margin 的不变。
- [ ] 不改 Skill。和 100 的结论一样：问题在 `claim`。
- [ ] `--dry --claim-out` 前后对比：只有挪成 Absolute、而且图层带 margin 的场景，说明变了，至少有 `off-canvas-frame`。
- [ ] `--scripted` 全过；整套 e2e 过。
- [ ] 改完以后，`off-canvas-frame` 用真实 Agent 跑几次看效果。跑不跑、跑几次，由设计师定，会用到额度。

## 背景

- 原始记录：`bench-results/agents/2026-11-10T17-35-07-090Z/pi/off-canvas-frame/run-1` 到 `run-3`，看 `diff.patch` 和 transcript 末尾的报告。
- pi 这一轮的汇总：
  - 1:1 落地率（页面预期）92%（33/36 条）；
  - done 核对 100%（33/33 条）；
  - 虚假的 ✓ 3 条，全是这一条；
  - 其他 6 个场景全是 100%。
- 页面核对（`check.ts` 的 `drawnThere`）能核对时，已经把 margin 算进去了。所以只有核对不了的放置（比如放进新 Frame）会漏掉。

## 规划会话的建议（2026-11-11，等设计师定）

- 放在发布前，而且放在 Claude 那 21 次真实运行之前。理由：
  - 改动小，只改一条说明，有 ticket 100 的先例；
  - Claude 补跑时，`off-canvas-frame` 也就顺带验证了这个修正。
- 不放在发布前也可以：它只在「挪进核对不了的容器、图层又带 margin」时出现。
