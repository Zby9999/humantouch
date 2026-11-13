# 164: Agent 交了报告的一轮，什么都不留

**What to build:** 现在 Agent 跑完 `npx humantouch finish`，⚠️ Not shown 的改动还留在改动单里：切换按钮上显示数字，下次进入编辑模式回到同一张旧画布（ADR 0013）。设计师要单独清一轮，看到的也不是 Agent 改完的页面。

要做到（ADR 0019）：

- Agent 跑了 `finish`：这一轮的改动全部归档，✓、↪、⚠️ 都一样。改动单、画布、核对都删掉，切换按钮上没有数字。下次进入编辑模式，按新代码重新冻结。
- 一轮没有 `finish` 就结束了（End this round，按住切换按钮）：照旧，没落地的改动留到下一轮，回到同一张画布。
- `npx humantouch last` 照旧列出上一轮每条改动，标 Applied、Done differently、Not applied，⚠️ 的那几条也在。
- 说法跟着改：README「If the Agent stops partway」那一段说清只有没交报告的一轮才留改动；`finish` 的输出、Skill 里有说到「留到下一轮」的地方一起看。Skill 的措辞保持英文。

用词以 GLOSSARY.md 为准（「一轮」「落地」「改动单」等，要改的顺手改），涉及 ADR 0013、0018、0019。测试只跑相关的部分（round、next-round、off-canvas-round、react18-round 这几组 e2e，`--scripted` 里留到下一轮的场景），整套由规划会话在 main 上跑。

**Blocked by:** None (can start immediately)。在 ticket 24 之前做，做完发 0.1.1（设计师 2026-11-13 定）。

**Status:** done

- [x] Agent `finish` 时有 ⚠️ 的改动：一轮结束后没有改动单，切换按钮上没有数字；再进编辑模式，画布按新代码冻结（看得到 Agent 改过的代码）。有测试。
- [x] 设计师在 Agent 中途停下时结束一轮：没落地的改动照旧留到下一轮，同一张画布，从 1 重新编号。原来的测试照旧过。
- [x] `last` 列出 `finish` 那一轮的全部改动，⚠️ 的标 Not applied。有测试。
- [x] `--scripted` 里依赖「`finish` 后留到下一轮」的场景改成用 End this round 结束，或改判新的结果；改了哪些在 Comments 里说。
- [x] README、Skill、`finish` 的输出和 GLOSSARY 的说法跟新规则一致。

## Comments

**实现（2026-11-14，本票会话 nice-heyrovsky-b8aba6）**

- `archiveRound(folder, ended)`：只有 `ended === "unlocked"`（End this round、按住切换按钮，走 service 的 `/unlock`）才 `carryOver`；`"finished"`（`finish`）一律归档，删掉 changeset、canvas、checks（page、other-usages、state 本来就删）。客户端同一张画布的逻辑（EditorLayer、Shell、freezer、saved-round、cli 的 `claimCarried`）原样保留，unlock 还在用。
- 审查找到的：`finish` 时没落地的改动里有画布外的（挪出画布的删除、拖回、在画布外新建后拖回），整轮扔掉会让 `off-canvas.json` 和代码对不上（挪出的图层在页面上还在、off-canvas 里也有一份；拖回的图层两边都没了，违反 ADR 0009）。修法：`finished` 时对没落地的改动做 Discard all 同样的回退（`offCanvasWithout` 从 EditorLayer.tsx 挪到 client/changeset.ts 共用）。测试在 off-canvas-service.test.ts。
- 文案：README「If the Agent stops partway」那段、Skill 第 4 步（英文）、GLOSSARY「一轮」「画布」两条跟 ADR 0019 对齐；几处代码注释顺手改了。

**`--scripted` / 测试里改了哪些（验收第 4 条）**

- `e2e/tests/applying-bench.spec.ts` 的 playbook `finishes-with-changes-left`（记录名没变，字段换了）：原来断言 ⚠️ 的留到下一轮、同一张画布、第二轮全落地后才重新冻结；改判为：`finish` 后没有改动单、切换按钮上没有数字、再进编辑模式重新冻结且画布上是 Agent 改过的填色、`last` 三条依次 Applied / Not applied / Not applied。
- 依赖「`finish` 后留下」的单测改成 unlock 结束：cli.test.ts（carried-over 一组、Stacks 那条、`finish names…` 改断言只剩 history 并查 `last`），page-service.test.ts、page-claim-service.test.ts（POST /unlock，或 finish 后重放一轮）。新增：`finish` 有没落地的改动什么都不留 + `last` 全列；unlock 照旧留。
- `e2e/bench/scenarios.ts` 里两处 `finish`（714、1615）都是全部落地，不受影响，没改。
- `e2e/perf/flex.perf.ts`「the same canvas again」原来靠 `finish` 造留下的一轮，改成按住切换按钮（否则 carried 那一行悄悄不测）。perf 没跑（按规矩），由规划会话决定。

**代定**

1. `finish` 的输出不改：它本来就没说「留到下一轮」；不往报告规则里加「⚠️ 不会留下」，免得 claim/finish 文案变动影响 Agent 行为。Skill 第 4 步加了一句英文说明。
2. 画布外改动在 `finish` 时按 Discard all 回退（见上），而不是留着不动。
3. `last` 的标法沿用 ticket 148（⚠️ 和没标 done 的都是 Not applied），不新增「Skipped」之类。
4. website/ 里两份 SKILL.md 副本没同步（website 线自己的事；发 0.1.1 时随 init 更新）。

**风险**

1. Agent 跑了 `finish` 却跳过几条的，这几条只在报告里（ADR 0019 已接受）；真实 Agent 数据要等下一次真跑。
2. 画布外回退只覆盖 `offCanvasWithout` 认得的三类（`offCanvas` 删除、`putBack`、`madeOffCanvas`）；画布外图层自己的编辑（`edits`）不属于一轮，照旧。
3. perf 那一处改成按住切换按钮后没实际跑过。

**规划会话，2026-11-14**

线上合并到 main dd6e522，我审过了：`archiveRound` 只在 `unlocked` 时 `carryOver`，`finished` 整轮归档，客户端同一张画布的逻辑留给 unlock，和 ADR 0019 一致。审查找到的画布外改动回退修得对：挪出画布的删除没落地，图层还在代码里，从 off-canvas 拿掉，下次冻结时它在画布上；拖回的没落地，放回画布外。

代定：
- 1、2、3 确认。
- 4 改一下：website/ 下两份 SKILL.md 副本由我在 main 上同步了（只差第 4 步那一句），和 148 时一样，网站跟着包走。

风险 1–3 接受。风险 3（perf 那处没跑过）由我在 main 上跑整套时带上无头 perf。
