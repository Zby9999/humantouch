# 148: 报告分三栏：已落地、有意不同、没显示出来

**What to build:** ADR 0016 的第三部分（设计师 2026-11-11 定）。

现在报告只有两栏：✓ Applied 和 ⚠️ Not applied 1:1。两种情况都进了 ⚠️：

- 真正没生效、要查的；
- Agent 有意做得不一样的。可能是设计师在对话里改了主意（官网当天有 7 条：填色改用新的 neutral-250，没用画布上的 200），也可能是在其他宽度上的适配（ticket 147）。

设计师看报告时分不出哪些要管。

要做到：

- `finish` 排出的报告、Skill 里的报告格式改成三栏，标题措辞是代定，用词保持英文：
  - **✓ Applied**：页面显示了的。
  - **↪ Done differently**：有意不同的，每条写 Why。
    - ticket 147 的「适配了」自动归到这里，带上那个宽度画的是什么，Agent 补上原因。
    - Agent 自己说明有意不同的，也归到这里，比如设计师在对话里改了主意。
  - **⚠️ Not shown**：没显示出来的，照旧写 Why 和 Instead。
- Agent 怎么说明「这条是有意不同的」，形式是代定，要简单到能力弱的模型也不会用错。比如 `npx humantouch done 3 --differently "the designer asked for neutral-250 instead"`，或者在 `finish` 时给。
  - 说明了的，`done` 不再要它去修。
  - 改动所在宽度上画出来不一样、又没说明的，照旧在 ⚠️。
- 每条改动只出现在一栏里（照现在的规矩）。
- `last` 打印上一轮时，每条标 Applied、Done differently 或 Not applied，和报告一致。
- 编辑层界面上的改动列表要不要显示「有意不同」，是代定。不显示也可以，设计师在对话里看报告。

Skill 的用词保持英文（设计师 2026-11-04）。参考 ADR 0013、0016，ticket 147；用词以 GLOSSARY.md 为准。

**Blocked by:** 147。发布前做（设计师 2026-11-11 定）。

**Status:** done

- [x] `--scripted` 加一个场景：一条改动脚本有意写成别的颜色，并说明原因；`finish` 的报告把它放在 ↪，原因照抄。另一条在手机宽度适配了的（147 的场景），也在 ↪。
- [x] 没说明、改动所在宽度画出来不一样的，在 ⚠️；`done` 照旧要它修。
- [x] 测试 `finish`、`last` 的输出；Skill 的报告格式和 `finish` 排出来的一致（照 ticket 86 以来的对照方式）。
- [x] 已有场景的 `claim-out` 逐字不变；`--dry`、`--scripted` 全过。`finish` 输出有变的地方，在 Comments 里列出前后对比。
- [x] `pnpm typecheck`、`pnpm test`、整套 e2e 过。（e2e 按 planner 的轻规则只跑相关 spec，见 Comments。）

## Comments

**2026-11-12，实现（分支 `ticket-148`）**

改了什么：

- 报告三栏（`report-form.ts`）：标题放进 `REPORT_HEADINGS`：`✓ Applied`、`↪ Done differently`、`⚠️ Not shown`。每条改动归哪一栏由 `sectionOf` 定，`finish` 的报告和 `last` 都用它，所以两边一致：
  - 图层破版了（147 的 `breaks`）→ ⚠️，说明了也一样（ADR 0016：任何宽度不许破版）。
  - Agent 用 `--differently` 说明了的 → ↪。Why 是「页面画的是什么: 原因」，原因照抄；页面显示了（或核对不了）就只写原因。
  - 已落地、核对标了 `adapted` 的 → ↪，Why 是「at Phone (390px) it draws 342px wide, not 500px: <why you did it so>」，Agent 补原因。
  - 其余已落地的 → ✓；没落地的 → ⚠️（Why 和 Instead 照旧）。
- 怎么说明（代定 1）：`npx humantouch done 3 --differently "the designer asked for neutral-250 instead"`，也认 `--differently=…`，可以一次给几条（`done 1 2 --differently "…"`，同一个原因）。没给原因、后面跟的是选项或本轮改动的编号时，`done` 拒绝并给出写法。原因存在 `state.json` 的 `differently`（按编号），归档进 `result.json`。
  - `done` 对说明了的改动说「Done differently, as you said: “…”. It goes under ↪ in the report, with that reason: nothing to fix.」，不再要它修。破版的例外：照旧给破版的说法，再加一句「Done differently on purpose or not, it is not to break the layout at any width.」
  - 说明了的改动算已落地（`appliedOf`），进度环算它，一轮结束不留到下一轮；破版的不算。
- 适配的 `done` 说法：「…: if you adapted it there on purpose, say so in the report.」改成「…: done differently there, it goes under ↪ in the report, where you say why.」（`adaptedWords` 拆出 `adaptedAtWords`，报告也用）。
- `last`：每条标 **Applied**、**Done differently** 或 **Not applied**，和报告的三栏一一对应（`LAST_STATUS`）。
- `finish` 第一行末尾加「Done differently: 1, 3.」（有 ↪ 时）。
- Skill（英文）：第 3 步加一段 `--differently` 的用法；报告格式改成三栏，例子里加一条 ↪；规则三条换成新的 `REPORT_RULES`（Skill 里逐字包含，ticket 86 的对照照旧）；`last` 那句加了 Done differently。website 里两份 Skill 副本（`.claude/`、`.agents/`）同步成一样的；README 第 4 节和 `website/lib/readme.ts` 的说法跟着改。
- GLOSSARY：「核对」里适配只限排版类改动；新词条「有意不同 (Done differently)」。
- planner 交代的第 1 条（147 代定 2 改）：`check.ts` 的 `STRICT_EVERYWHERE`（delete、create、text）：桌面视图里的删除、新建、改字在其他宽度不再算适配，照旧严格。其余（样式、移动）照旧可以适配，见代定 3。147 的测试和场景里没有删除、新建、改字靠 `adapted` 的，一处都不用改（逐条查过 `edits.browser.test.ts`、`breaks.browser.test.ts`、round.spec 里的 `adapted`：都是位置、宽度、填色、Grid 列数）。`adaptedWords` 里删除那句「the layer is still on the page」到不了了，删掉。
- planner 交代的第 2 条（147 风险 3）：核过，`done` 和 `finish` 问页面时（`watchPage.ask`），已经显示的改动走 `check` → `checkAcross`，每个宽度重新看（副本先 `sync`），不用热更新时只看窗口宽度的那个结果。所以 ✓、↪ 不会站在过期的其他宽度结果上。加了测试（`breaks.browser.test.ts`「ticket 147's risk 3」）：桌面改的宽度在 Phone 适配了，显示了；之后代码在 Phone 破版，热更新只看窗口宽度，还是 shown；`done` 问的时候是 not shown，带 Phone 的破版。`finish` 的 closing 走同一条路。热更新也看其他宽度没做：每次热更新要给每条已显示的改动同步、排版每个视图的副本，正是 page-checks 开头说的特意省掉的那部分（ADR 0013：不能出现 long task），而结果只在 `done`、`finish` 时用得上，那时本来就重看。

`finish` 输出的前后对比：

1. 标题：`⚠️ Not applied 1:1` → `⚠️ Not shown`。
2. 规则三条：
   - 前：「- List every change once, under one heading only. One applied, but not exactly as asked, goes under ⚠️ alone, not under ✓ as well; more to say of one applied exactly goes on its ✓ line. / - Give each change under ⚠️ both lines, Why and Instead. / - Leave the ⚠️ section out only when every change was applied exactly. Keep each line short.」
   - 后：「- List every change once, under one heading only. One done differently on purpose (the designer asked for it otherwise, say, or it is adapted at a width) goes under ↪ alone; one applied, but not exactly as asked, under ⚠️ alone; more to say of one applied exactly goes on its ✓ line. / - Give each change under ↪ its Why, and each under ⚠️ both lines, Why and Instead. / - Leave out ↪ and ⚠️ when no change is under them. Keep each line short.」
3. 核对不了的提示：「keep it under ✓ if you applied it exactly as asked; if not, move it under ⚠️, with Why and Instead.」→「keep it under ✓ if you applied it exactly as asked; if you did it differently on purpose, move it under ↪, with Why; if you could not apply it as asked, move it under ⚠️, with Why and Instead.」
4. 适配了的改动（如 width-500-adapted、round.spec ticket 84 的 right）：
   - 前：`Round finished: 1 of 1 change applied.` + `✓ Applied\n- 1. Right: <the layer, and what you changed>`
   - 后：`Round finished: 1 of 1 change applied. Done differently: 1.` + `↪ Done differently\n- 1. Right: <the layer>\n  Why: at Phone (390px) the layer is drawn elsewhere than on the canvas: <why you did it so>`
5. 说明了的改动（新）：`↪ Done differently\n- 1. Fill: <the layer>\n  Why: the page shows the fill #FFFFFF, not #FF0000 at 50% opacity: the designer asked for neutral-250 instead`，第一行加「Done differently: 1.」。
6. 其余（✓、⚠️ 的条目、Why 的写法、第一行别的部分）不变。

测试：

- `cli.test.ts` 新 describe「the report in three sections」7 条：`--differently` 的 `done` 和 `state.json`、说明后再 `done` 不撤销、没说明的照旧要修；`--differently=`、缺原因、后面跟编号时拒绝；`finish` 三栏（说明的、适配的、没显示的各一条，每条一次，原因照抄）、归档的 `differently`、`last` 的三种标注；适配的加 `--differently` 原因；说明了但破版的：`done` 给修法、不算落地、`finish` 放 ⚠️、`last` 标 Not applied；全是数字的原因；Skill 里有三个标题和 `--differently` 的写法。已有的 7 条跟着改了标题、适配说法和核对不了的提示。
- `edits.browser.test.ts` 加一条：桌面视图里删掉的图层，Phone 上还在 → not shown（`actual: "there"`），各宽度都删了 → shown。不改 `check.ts` 时这条失败（核过）。
- `breaks.browser.test.ts` 加风险 3 那条（见上）。
- `e2e/bench/metrics.test.ts` 加一条：`checkReport` 认 ↪（`differently`），↪ 下没有 Why 的算不合格式，只有 ↪ 也算报告。
- e2e：round.spec ticket 84 right 那条的 `finish` 期望改成 ↪；4 条适配的 `done` 说法、grid 列数那条跟着改；applying-bench.spec 两处 `⚠️ Not applied 1:1` 的正则改成 `⚠️ Not shown`。
- bench：`checkReport`（`metrics.ts`）认三栏，`ReportCheck.differently` 只在有 ↪ 时才有（旧的期望不用改）；scripted pass（`run-agents.ts`）对 `scripted.differently` 的改动单独跑 `done N --differently "…"`，查 ↪ 里的改动正好是说明的和适配的、原因逐字在 Why 行末尾，⚠️ 里不再算说明了的；填报告时 ↪ 的 `<why you did it so>` 填 “adapted to fit”。场景的 `scripted` 多了 `differently` 字段。
- 新 bench 场景 `report-done-differently`（tw4，`scriptedOnly`）：段落文字颜色 #1A1A1A（scripted 写成 `text-stone-800`，`--differently "the designer asked for stone-800 instead"`）→ ↪，原因照抄；按钮宽 500（`w-full md:w-[500px]`，Phone 适配）→ ↪；标题字号 46（scripted 写成 `text-[40px]`，不说明）→ not shown，`done` 说「it does not show the change」，⚠️。用 #1A1A1A、46 是为了避开 Variable（stone-900、5xl 会被 `--dry` 要求写 Variable）。

数字：

- 分支从 main a1edc38（含 146、147）开始。main 现在到 d9e0851（138 的后续），没合。
- `pnpm typecheck` 过（website 也过）。`pnpm test`：vitest 60 个文件 1392 过、1 跳过；node 133 过、0 失败。第一次跑时 3 个浏览器测试文件导入失败、1 个 iframe 60 秒没就绪（agent-stall、code-changes、later、pointer-held，和这次改动无关），重跑全过，记为负载噪声。
- e2e（`HT_E2E_PORT=6900`，`pnpm build` 之后）：round.spec + applying-bench.spec + claim.spec + code-changes.spec + next-round.spec + off-canvas-round.spec + react18-round.spec，连同依赖的 project，606 过、0 失败。bench-scenarios.spec 只跑 `report-done-differently|width-500|phone-padding-prefix-missed`（含依赖）495 过、0 失败。审查后的修改之后（重新 `pnpm build`），round.spec + applying-bench.spec + claim.spec（含依赖）又跑一次：583 过、0 失败。
- `--dry`：41/41（base a1edc38 40/40）。`--claim-out` 和 base 做 `diff -r`：已有 40 个场景逐字相同，只多 `report-done-differently.md`。临时 worktree 已删。新场景第一次 `--dry` 因为 Variable（stone-900、5xl）不过，改成 #1A1A1A、46 后过。
- `--scripted`：32/32，审查修改前后各跑一次，都一次过。
- 结果有变的已有场景：width-500-adapted 的改动从 ✓ 移到 ↪（`done` 的说法也变了，`scripted.done` 跟着改）；其余没有。
- 没碰热路径（页面核对只多了一个 `Set.has`），没跑 perf。没跑真实 Agent。

审查（两路子代理，medium）后的修改：

1. 说明了的改动如果破版，照旧 not shown、给修法、放 ⚠️、不算落地（两路都提了：原来 `--differently` 能绕过「不许破版」）。
2. 全是数字的原因（如 `"250"`）当原因，只有是本轮改动编号时才当作没给原因。
3. `sectionOf`、`reportFor` 的 `differently` 统一成 `Record<string, string>`，和存的一样。

代定：

1. 说明的形式：`done <编号…> --differently "<原因>"`（也认 `--differently=<原因>`）；`finish` 时不另给。说明一次就整轮有效，之后再 `done` 不撤销（原来报的是错的，Agent 可以在报告里自己挪）。
2. 标题：`✓ Applied`、`↪ Done differently`、`⚠️ Not shown`（ticket 原文的写法）。`last` 照 ticket 标 Applied / Done differently / Not applied，所以 ⚠️ 那栏在 `last` 里叫 Not applied，和标题不同字。
3. 只有删除、新建、改字在其他宽度严格（planner 点名的三种）；样式里不改几何的（填色、圆角、透明度等）照旧可以适配，147 的「填色在 Phone 适配」测试不变。要不要让这类也严格，请 planner 定。
4. 说明了的改动算已落地：进度环算它，一轮结束不留到下一轮，画布上按画布的值归档（和适配的一样，画布不反映 Agent 实际写的值）。
5. ↪ 的 Why：有页面事实时写「页面画的是什么: 原因」（适配用 `adaptedAtWords`，没显示用原来 ⚠️ 的 `pageShows`），没有就只写原因；没说明原因的占位是 `<why you did it so>`。↪ 只有 Why，没有 Instead。
6. 说明了但页面照样显示的（或核对不了的），也放 ↪：以 Agent 说的为准。
7. 破版压过说明：说明了也放 ⚠️，`done` 加一句「Done differently on purpose or not, it is not to break the layout at any width.」。
8. `done` 对没显示的改动不提 `--differently`（不想让能力弱的模型拿它逃过修），只在 Skill 和适配的说法里提；没装 Skill 的 Agent 走老路，放 ⚠️。claim 的「How the page checks」一字没改（claim-out 逐字不变）。
9. 编辑层的改动列表不显示「有意不同」（ticket 说不显示也可以）。
10. 措辞（英文）：见上面引的 `done`、`finish` 原文。

风险：

1. 147 和 148 之间归档的轮次，核对里有 `adapted` 的，`last` 现在标 Done differently，当时的报告是 ✓。只影响这几天的旧轮次。
2. `--differently` 可能被拿来躲修：说明了就不要求修（除了破版）。设计师在 ↪ 里能看到页面画的是什么和原因，不是悄悄地 ✓；真实 Agent 的数据要看下次真跑。
3. 风险 3 的结论依赖 `done`/`finish` 问页面时页面在：没开页面时，`waitForChecks` 用这一轮看到过的 shown（可能是热更新只看窗口宽度时的结果）。这是原来就有的行为，没改。
4. 页面没及时回答 closing 时，`finish` 用的是最近一次结果，也可能是热更新只看窗口宽度的结果。同上，原来就有。

后续（不编号，交给 planner）：代定 3（不改几何的样式要不要也严格）；真跑时看 `--differently` 的用法和误用。

**2026-11-12，第二轮审查后的修改（同一分支，合了 main d9e0851）**

审查的每条都对着代码核过，都成立。改了什么：

1. 适配只限排版（planner 的第 1 条，原来做窄了）：原来只把删除、新建、改字排除在外，填色、文字颜色、圆角、透明度这些在 Phone 画得不一样也算适配，进 ↪，不用修（例：填红色，弱模型写 `bg-white md:bg-red-500`）。现在改成白名单 `ADAPTABLE`（`widths-protocol.ts`）加 `adaptable(change)`：只有挪动（`move`），和样式里的 x、y、right、bottom、absolute、宽高和最小最大、padding、gap、rowGap、columnGap、direction、align、wrap、columns、arrangement、fontSize、lineHeight 可以适配；其余（`DRAWS_NO_BREAK` 那些画法，字重、字体、字距、大小写、描边、显隐，删除、新建、改字、新建 Stack 等，以及以后新加、名单上没有的属性）在每个宽度严格。`check.ts` 的 `STRICT_EVERYWHERE` 删了。GLOSSARY「核对」按代码改了。147 那条 mock「填色适配」的 cli 测试改成 gap（「its gap is 8px, not 16px」）。`edits.browser.test.ts` 里 147 的「填色在 Phone 适配」改成 not shown（标题也改了）。
2. `--differently` 不再盖住页面的事实，也不再绕过严格的核对：
   - (a) `done` 先说页面画的是什么，再说原因：没显示时「Checked on the page: it does not show the change as on the canvas: the page shows the fill #FFFFFF, not #FF0000 at 50% opacity.」，适配了时「Checked on the page: it shows the change. At Phone (390px) …」，核对不了时「Not checked on the page: …」；然后「Done differently, as you said: “…”. It goes under ↪ in the report, with that reason: nothing to fix.」
   - (b) 破版、范围外（104）、其他使用处（77）都压过说明（`stillToFix`，`widths-protocol.ts`）：`sectionOf` 放 ⚠️，`appliedOf` 不算落地，`done` 照旧给修法，再加一句：「Done differently on purpose or not, it is not to break the layout at any width.」/「… a change at a breakpoint is not to change the widths outside its range.」/「… a change for one usage is not to change its component's other usages.」
3. Skill（英文）第 3 步那段改成：「A change you chose to make differently on purpose (the designer asked for something else in the conversation, say): run `npx humantouch done <number> --differently "<why>"`, one change at a time. It then goes under ↪ in the report with that reason. It is not for a change you could not make show: that goes under ⚠️. A break of the layout, a change outside its breakpoint's range, or one at other usages is still to fix, said or not.」去掉了「It is not to be fixed then」。website 两份副本同步；README 第 4 节、`website/lib/readme.ts` 跟着改。`REPORT_RULES` 没变，86 的逐字对照照旧过。
4. (a) `--differently` 只收一个编号：给了几个就拒绝，说「Give one change with --differently, and its own reason: `npx humantouch done 1 --differently "the designer asked for neutral-250 instead"`. Run it again for each other change done differently; run `npx humantouch done <number> …` for the rest.」（对弱模型最简单：一条一个原因，不会把别的改动带进去。）(b) 原因里的空白和换行并成一个空格，``` 换成 '，不会截断报告的代码块或打乱 `checkReport`。(c) 拼错的选项（`--diferently`）说「Unknown option --diferently: `done` takes the numbers of the changes, and for one done differently on purpose, --differently and the reason: …」。
5. `finish` 时页面没再看的改动（没在时限里回答 closing，或没有页面开着）：第一行末尾加「The page did not look again at 1 and 2: as last checked.」。每条照页面最后一次说的放（代定 12）：已显示的改动，页面存下的结果来自它最后一次在所有宽度一起看的时候（热更新只看窗口宽度，而且只在不显示时才写），所以 ✓/↪ 就是「最后一次完整核对」放的那栏，只是之后的编辑可能在别的宽度改了它，第一行说明这一点。
6. 补的测试：见下。

`finish` 输出的前后对比（这一轮新增的）：

- 第一行：页面没再看时，末尾多「The page did not look again at …: as last checked.」。原来那条「页面关了，看到的照旧算」的测试（progress 那组）的第一行跟着变成「Round finished: 2 of 3 changes applied. The page does not show: 2. The page did not look again at 1 and 2: as last checked.」。
- 桌面视图里的画法改动在其他宽度画得不一样：原来进 ↪（Why「at Phone (390px) its fill is #FFFFFF, not …: <why you did it so>」），现在进 ⚠️，第一行「The page does not show: N.」。
- 说明了、但改到范围外或其他使用处的：原来进 ↪，现在进 ⚠️，第一行照 104/77 的说法。

测试（这一轮）：

- `cli.test.ts`：先说页面事实的 `done`；一个编号、拼错的选项、缺原因的错误；原因并成一行、``` 去掉、报告里只有两处 ```；说明了但范围外（104）、其他使用处（77）各一条：`done` 给修法和那句话、不算落地、`finish` 放 ⚠️；没页面再看时 `finish` 的第一行。三栏那组 7 → 11 条。
- `breaks.browser.test.ts`：`adaptable` 白名单（排版的可以，画法、字重、字距、描边、显隐、名单外的属性、删除、新建、改字、Stack 不行）；填色在 Phone 不一样 → not shown、不带 `adapted`。
- `edits.browser.test.ts`：147 的「填色适配」改成 not shown；删除那条照旧。

数字（第二轮，合了 main d9e0851 之后）：

- `pnpm typecheck` 过（website 也过）。`pnpm test`：vitest 60 个文件 1399 过、1 跳过；node 133 过、0 失败。
- e2e（`HT_E2E_PORT=6900`，`pnpm build` 之后）：round.spec + applying-bench.spec + claim.spec + code-changes.spec + next-round.spec + off-canvas-round.spec + react18-round.spec，连同依赖的 project，607 过、0 失败；examples 没留改动。
- `--dry`：41/41（main d9e0851 40/40）。`--claim-out` 和 main d9e0851 做 `diff -r`：已有 40 个场景逐字相同，只多 `report-done-differently.md`。临时 worktree 已删。
- `--scripted`：32/32，一次过。
- 结果有变的已有场景：这一轮没有（scripted 场景里没有靠画法适配的；width-500-adapted 仍在 ↪，report-done-differently 的三条照旧）。

代定（接着上面的编号）：

11. 能适配的属性用白名单（planner 的决定，coordinator 转达）：排版几何加字号、行高；新属性默认严格。`margin` 不在名单上，因为没有单独的外边距改动（外边距是别的改动的一部分）。textAlign 算画法，严格。
12. 页面没再看的改动，照页面最后一次说的放，第一行说明；不挪到 ⚠️。
13. `--differently` 一次只收一个编号。
14. 原因的清理：空白并成一个空格，三个以上的反引号换成一个 '。
15. 代定 3 作废（被第 1 条取代）；代定 7 扩成：破版、范围外、其他使用处都压过说明。代定 1 里「可以一次给几条」作废。

风险（更新）：

- 风险 3、4（没页面、没及时回答时用最后一次结果）：现在 `finish` 第一行会说出来，但结果本身还是旧的。
- 新：白名单以后加属性时要记得想清楚能不能适配；不加就是严格（偏向 ⚠️，不会悄悄 ✓）。
- 新：`done` 拒绝 `-` 开头的参数（当成未知选项），负数编号本来也不存在。

**规划会话，2026-11-12**

线上合并到 main 6c5db9f。147 代定 2 的修改（只有排版类改动在其他宽度适配；删除、新建、改字照旧严格）和 147 风险 3（`done` / `finish` 时每个宽度重看）都在这张票里做了，有测试。

代定：
- 1、2、4–14 都确认。3 作废。
- 11 的字号、行高确认能适配：响应式排字很常见（小屏字小一档）。textAlign 算画法、严格，确认；真要在手机上改对齐，Agent 可以用 `--differently` 说明，进 ↪，设计师看得到原因。
- 6（说明了、页面照样显示的也放 ↪）确认：以 Agent 的说明为准，原因摆在设计师面前。
- 8 确认：`done` 只在 Skill 和适配的说法里提 `--differently`，不在没显示的改动后面提，免得它变成躲修的出口。

风险 1–5 接受。风险 2（拿 `--differently` 躲修）等真实 Agent 跑的数据，那时看 ↪ 里的原因是不是站得住。

网站的 README 和 Skill 副本跟着改了（website/lib/readme.ts、website 下两份 SKILL.md），线上网站要等设计师在网站线上重新部署才会更新。

这张票的整套验证跟 main 6c5db9f 一起跑。
