# 102: 96 那条脚本扮演 Agent 的 e2e，改完源码等页面换上再核对

**What to build:** `e2e/tests/round.spec.ts` 里 ticket 96 加的那条（「a layer centered by its auto margins, moved: … done checks where its middle is at every view's width …」，97 合并时在 855 行附近）最后几步不稳：脚本改了源码（`editSource`）紧接着跑 `done`，有时页面还没换上改了的代码就核对了（该说没显示时读到「it shows the change」），有时等不到页面（30 秒超时，读到「no page with 03Kind is open」）。ticket 97 在没改的源码上也复现了（`--repeat-each=5` 挂 1 次），和产品无关，是测试的写法。挂一次就得重跑一整套 e2e，线上验证时还可能误以为是自己的改动坏了。要做到：这条测试在机器忙时也稳定通过，测的内容不变。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准。

**Blocked by:** 无（开线时间见「设计师决定」）

**Status:** ready-for-agent

- [ ] 先在没改的测试上看着它挂（`--repeat-each` 跑到挂为止，或在机器忙时跑），记下挂在哪一步、读到了什么
- [ ] 每次 `editSource` 之后、`done` 之前，先等页面上的图层变成新样子（照 ticket 93 的写法，`expect.poll` 或 web-first 断言），再核对；比的值、`done` 要说的话都不变
- [ ] 同一个文件里别的「改了源码马上 `done`」的地方顺手看一遍，同样的写法一起改
- [ ] 只改 `e2e/`，`packages/` 不动；测试的数目、测的内容不变
- [ ] 改后 `--repeat-each` 跑够次数（至少 20 次）不挂；整套 e2e 跑一遍不挂

## 背景

- ticket 97 遗留风险第 4 条和「后续 ticket 的建议」（2026-11-05 合并后提给设计师）。

## 设计师决定（2026-11-05，分诊）

- 选做法 1：只为这条测试开一张小 ticket，只改测试；排在真实复验（97–101 合进后按 88 的次数重跑 24 个场景）之后再开线，让复验在机器空的时候跑。
- 97 的遗留风险第 1 条（只有一边 `auto`、靠最大值卡住的图层）和第 6 条（只在某个断点才有的最大值）记作风险，不开 ticket。
- 考虑过的别的做法：三处一起开 ticket；都不开。
- 额度紧：开线时会话和所有子 agent（含审查）都用 effort medium。

## 规划会话决定（设计师不在，2026-11-10，回来后确认）

- 提前到发布前做。
  - 这条测试越来越常挂：118、119、120 合进 main 后的验证里都挂过。
  - 在 69234b63 上，机器空（负载 5）、单进程单独跑也挂，读到的是「no page with 03Kind is open」，就是本票写的「改完源码马上 `done`」。
  - 它让每条线合并前的检查都多一轮重跑。只改测试，很小。
- 接在 109 那条线后面：122 → 102。设指挥，派一个新的实现子 agent、一个审查子 agent，都用 effort medium。
