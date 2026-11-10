# 102: 96 那条脚本扮演 Agent 的 e2e，改完源码等页面换上再核对

**What to build:** `e2e/tests/round.spec.ts` 里 ticket 96 加的那条（「a layer centered by its auto margins, moved: … done checks where its middle is at every view's width …」，97 合并时在 855 行附近）最后几步不稳：脚本改了源码（`editSource`）紧接着跑 `done`，有时页面还没换上改了的代码就核对了（该说没显示时读到「it shows the change」），有时等不到页面（30 秒超时，读到「no page with 03Kind is open」）。ticket 97 在没改的源码上也复现了（`--repeat-each=5` 挂 1 次），和产品无关，是测试的写法。挂一次就得重跑一整套 e2e，线上验证时还可能误以为是自己的改动坏了。要做到：这条测试在机器忙时也稳定通过，测的内容不变。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准。

**Blocked by:** 无（开线时间见「设计师决定」）

**Status:** done

- [x] 先在没改的测试上看着它挂（`--repeat-each` 跑到挂为止，或在机器忙时跑），记下挂在哪一步、读到了什么
- [x] 每次 `editSource` 之后、`done` 之前，先等页面上的图层变成新样子（照 ticket 93 的写法，`expect.poll` 或 web-first 断言），再核对；比的值、`done` 要说的话都不变
- [x] 同一个文件里别的「改了源码马上 `done`」的地方顺手看一遍，同样的写法一起改
- [x] 只改 `e2e/`，`packages/` 不动；测试的数目、测的内容不变
- [x] 改后 `--repeat-each` 跑够次数（至少 20 次）不挂；整套 e2e 跑一遍不挂（指挥合并前在同步了 main c264586 的分支上跑整套：589 过 1 跳过，一次过；`--dry` 29/29 和 main 逐字相同；`--scripted` 20/20）

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

## 实现记录（2026-11-10）

**看到的失败。** 没改的测试，机器空（负载约 5）`--repeat-each 20` 全过；另开 10 个 `yes` 压 CPU（12 核，负载约 15）再跑 20 次，挂 2 次，都挂在最后一步（原 912 行，去掉 `mx-auto` 之后的 `done`）：读到「Not checked on the page: no page with 03Kind is open」，同时报 30 秒测试超时。trace 里看：去掉 `mx-auto` 的写入在上一步改动的 HMR 之后约 200ms 就到了，页面在拉这次更新时 `done` 已经去问它；页面一直没回答，`done` 等了二十多秒，测试到 30 秒被收掉、页面关了，`done` 才读到「没有开着的页面」。也就是本票写的「改完源码马上 `done`」，只是表现成没回答，而不是答错。

**改了什么。** 只动 `e2e/tests/round.spec.ts` 的「done checks the change on the page」这一组：
- 新加 `drawnWith(layer, ...classes)`：用 `expect.poll` 等页面上的图层带上改后的每个类名，而且每个类名的规则已经在页面的 `<style>` 里（ticket 93 的写法，跟 166 行看样式表的办法一样）。还加了 `button(page)` 定位示例里的按钮。
- 96 那条：三次 `editSource` 后各等一次（`left-[…]`；`left-[40px] right-[-40px]`；`mx-auto` 不在了）。
- 同文件其余「改了源码马上 `done`」的地方一起改：按钮的 fill（类名，以及改 CSS 后 `toHaveCSS` 背景色）、描边颜色、self-stretch、拖出来的宽度、自由放置的 pin、75/79/83/84/89 那几条从右、从下、居中、`md:` 的图层、phone 视图的 `max-md:` fill、Grid 的列数，以及「挪了行号」那条（等按钮背景色变了，并且 `data-tk-loc` 换了行）。
- 原本已经在等的地方（描边粗细的 `expect.poll(drawn)`、80 那条的 `toHaveClass`、建图层时的 `goto` 循环）没动。测试数、测的内容、比的值、`done` 要说的话都没变；`packages/` 没动。

**跑了几次。**
- 改后，96 那条 `--repeat-each 30`：30 过（负载 3–7，另一会话的 e2e 同时在跑）。
- 整个 `round.spec.ts` 一遍：29 过。
- 改后没再用 `yes` 压 CPU 复跑：当时发现另一个会话在 5700 端口跑 e2e，压机器会扰它（改前那 20 次压测时它可能已经在跑）。

**代定。**
1. 等的是「类名在、规则在」，不是算出来的值：好几步改前改后在窗口宽度下位置一样（就是要靠别的宽度分辨），等计算值分不出来。
2. 「挪了行号」那条没有可见的变化，等的是按钮的 `data-tk-loc` 变了。

**风险。**
1. 观察到的挂法是页面没回答：页面在 HMR 进行中被问时会一直不答（大概是 `updating` 在两次很近的更新之间卡住，`page-checks.ts` 的 `arrived` 不像 `code-changes.ts` 那样用 `UPDATE_LOST_MS` 兜底）。这是产品里的事，本票不动 `packages/`；真实 Agent 改完马上 `done` 也会碰到，值得设计师看要不要开票。
2. 改后没有在人为压 CPU 下复跑；指挥跑整套 e2e 时可以留意这条。
