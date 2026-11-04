# 100: `claim` 在「撤成 Frame」那条写明 margin 留着

**What to build:** ticket 88 的真实跑里，Claude 唯一的一条虚假的 ✓ 出在 `dissolve-place-frame` run-2：Stack 撤成 Frame 后，它去掉了段落的 `mt-4`，段落比画布高 16px，却列在 ✓ 下。`claim` 里「X、Y 就是 `left`、`top`，margin 留着」只写在「How the page checks」那一节，「Dissolving a Stack」那条没写。三次 Claude 里两次在这里犹豫；pi run-2 为弄清楚读了 03kind 的代码 12 次。同一轮里按钮那条的 `done` 已经提醒过要留 margin，Claude 加回了按钮的 `mt-6`，没改段落，所以 Agent 也有一份责任。

要做到：撤成 Frame 的说明本身写明定位怎么算、margin 留着（英文，和 `claim` 其余说明同一种写法），Agent 不用翻到核对那一节才知道。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 无

**Status:** ready-for-agent

- [ ] `claim` 的「Dissolving a Stack」那条写明 `left`/`top` 怎么对应 X、Y，margin 留着
- [ ] 不改 Skill（88 的结论：问题在 `claim`，不在 Skill）
- [ ] `--dry --claim-out` 前后对比：只有撤成 Frame 的场景的说明变了
- [ ] `--scripted` 全过

## 背景

- ticket 88 真实跑（2026-11-05），原始记录在 88 线的 `bench-results/agents/88-real/claude/dissolve-place-frame/run-2`。
- 要看改了有没有用，得再跑真实 Agent（用设计师的额度）；分诊时定跑不跑、跑几次。

## 设计师决定（2026-11-05，分诊）

- 选做法 1：ready-for-agent，和 101 交给同一条线，先做 100 再做 101，现在开线（和 97、98、99 并排）。
- 不跑真实 Agent；要不要复验、跑几次，等这条线做完再定。
- 考虑过的别的做法：同时在 Skill 第 2 步加那一句；先只做 100，101 以后再说。
