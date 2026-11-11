# 68: 结束一轮时没落地的改动留到下一轮

**What to build:** 一轮结束时还有没落地的改动，画布不丢，下一轮回到同一张画布（设计师 2026-11-01 定，见 Comments）。两种结束都算：设计师结束这一轮（67 的「结束这一轮」或长按手动解锁，同一个 `endRound`），以及 Agent 自己 `finish` 时还有没落地的改动（报告里的 ⚠️）。

- 「已落地」和 64、67 同源：页面显示了的，或页面看不出来、Agent `done` 过的。
- 已落地的改动照常归档，从改动单和改动列表里拿掉，但留在画布上当底：⌘Z 和改动列表都撤不了它们，要退回代码用 `last`。
- 没落地的留在改动单和改动列表里，按原来的顺序从 1 重新编号，新改的接在后面；改动列表、`claim`、`done` 用同一套编号。
- 下次进入编辑模式回到同一张画布，不重新冻结；样子和结束前一致，断点上的改动、画布外的图层也一样。代码在这期间被手改过的（编辑模式外手改、别的工具改；Agent 落地这一轮带来的不算）：只改了样式，画布换上页面现在的样式表，图层和改动照旧；元素、类名或文字也改了，画布不动，提示设计师（ticket 141，设计师 2026-11-11 定）。⌘Z 只撤这次新做的编辑；留下的改动用改动列表逐条放弃，Discard all 照常可用。
- 两轮之间：角标显示留下了几条，改动列表可以逐条放弃；这时 Agent 跑 `claim`，拿到的就是这些留下的改动加上之后新改的。
- 留下的改动的「改前」由活页面在认领时按代码现状重新读；`claim` 写「从页面现在的值到改后」，页面已经显示的算已落地。「Currently set by」也由活页面重读，和改前在同一次问里（设计师 2026-11-01 定）；没有打开的页面时都不问。开头的写法和 67「claim 再跑一次」一致。
- 结构改动涉及的图层在活页面上找不到时照旧：页面核对说找不到，Agent 照源码位置去改。画布上不做「找不到」的标记。
- 上一轮 Agent 新建、已落地的图层（例如新建的 Frame），对它的改动没落地的照常留下；`claim` 给出层级路径和开头标签让 Agent 找到它，页面核对照旧说没能核对。
- 留下的改动都落地或都放弃之后，下次进入编辑模式才按新代码重新冻结；所有改动都落地时，和以前一样归档、丢画布。
- 归档里照旧保留整轮的改动单，`last` 不变。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0002、0005、0009、0012、0013）。

**Blocked by:** 60, 63, 64

**Status:** done

- [x] 「做到一半退出 → 结束这一轮 → 再进入编辑模式」剧本：没落地的改动 100% 留到下一轮（63 测出的基线是 0）；已落地的不再出现在改动列表里
- [x] Agent `finish` 时有 ⚠️：没落地的改动同样 100% 留下，已落地的不再出现
- [x] 再进入编辑模式，画布和结束前一致：逐个图层比计算样式和位置，差异 0；断点上的改动、画布外的图层各有一个用例
- [x] 已落地的改动 ⌘Z 和改动列表都撤不了；留下的改动可以逐条放弃，Discard all 照常可用
- [x] 下一轮 `claim` 只给出留下来的和新改的改动，编号从 1 开始，开头和 67「claim 再跑一次」一致；用 `last` 撤销上一轮照常可用
- [x] 都落地或都放弃之后，再进入编辑模式按新代码重新冻结
- [x] 没有留下改动的一轮，10 个测量台场景的 `claim`、`done`、`finish` 输出逐字不变
- [x] 进入编辑模式（回到同一张画布）中位数 ≤ 150ms；切换按钮不超过 10,240 B
- [x] 前后数字记在 Comments；spec、GLOSSARY 的「一轮」「画布」、ADR 0013 的最后一条后果随之更新

## 背景

- 原来手动解锁时，没完成的改动只记进归档，画布丢弃，设计师要重做。Agent 中断的代价全落在设计师身上。
- 60 改了保存画布的格式，本 ticket 在 60 之后做，避免两张同时改画布的保存与恢复。

## Comments

**设计师 2026-11-01 改了方案**

- ticket 原来要求：下次进入编辑模式时按新代码重新冻结，把留下的改动重新应用到新画布上，找不到的图层在改动列表里标出来。
- 设计师否掉了这个做法，改成回到同一张画布。理由：Agent 是在源码里找图层，不靠画布；重新冻结只是为了让画布反映代码现状，这一点预览模式已经能看到；为它写一个按 10 种改动重做画布的模块，还要处理一串「找不到」的问题，不值得。
- 同时把 Agent 自己 `finish` 时还有没落地的改动（⚠️）也算进来，这超出了 ticket 原来的范围，是设计师定的。
- What to build 和验收项按新方案改写，去掉了「重新应用到新画布」和「找不到的标出」。ADR 0013 的最后一条后果、ADR 0001 的「一轮只对应一张画布」、spec 和 GLOSSARY 的「一轮」「画布」随之改了。

**做了什么（起点 0e96358，一个提交）**

- 结束一轮（`archiveRound`，`finish` 和 `POST /unlock` 共用）：按 `appliedOf` 算已落地，和进度、67 的「claim 再跑一次」同源。全都落地就和以前一样丢画布；否则 `carryOver`（`changeset.ts`）把没落地的按原顺序从 1 重新编号、标 `carried`，已落地的放进改动单的 `applied`，画布和 `checks.json`（只清掉核对结果，保留打开的页面数）留着。归档的改动单是这一轮自己的，不带上一轮的 `applied`。
- 画布当底（`takeInApplied`，`saved-round.ts`；`takeInEdits`，`canvas-style.ts`）：画布下次打开（`restore` 时、排版之前）或在预览模式里从改动列表撤销时，把 `applied` 的样式从编辑样式挪到底下一层（和复制出的图层的样子同一层 `copied`），撤销、`asPage` 都把它当页面自己的；已落地的改文字去掉原文记录，之后再改，改前就是已落地的字。之后保存的改动单没有 `applied`。
- 编号接着：新改动从 `lastId`（留下的条数）往后编。
- 下一轮 `claim`（`claimCarried`，`cli.ts`）：有打开的页面时，先带一个新标记 `opening` 问页面（和 `done`、`finish` 的问法一样，页面在 `EditorLayer` 里回答），等它回答：显示了的算已落地；其余样式改动的改前换成页面现在的值，写回改动单。断点范围被切成几段的，`parts` 在结束一轮时置为待读，认领前由页面重新读（ticket 65 的机制）。没有打开的页面时不问。
- 上一轮新建、已落地的图层：画布上的标记不动。改动说明的 Location 写「Made in a round before … Find it in the source from its place on the page」，Currently set by 写 unknown；Layer 一行照旧给层级路径和开头标签。页面核对照旧说没能核对（原因还是「the layer is new this round」那句）。只在有留下改动的一轮里这样写，其他轮逐字不变。
- 两轮之间：页面听到一轮结束就重新读这一轮，角标是留下的条数；改动列表的撤销、Discard all 不用改。

**剧本**（`e2e/tests/applying-bench.spec.ts`，结果在 `bench-results/playbooks-68/`，`bench-results/playbooks/` 跑完恢复原样）

| | 前（0e96358，`playbooks-67/stops-halfway.json`） | 后 |
|---|---|---|
| 做到一半退出、结束这一轮：没落地的留下 | 0% | **100%**（stops-halfway 2/2；carries-over-what-is-left 4/4） |
| 已落地的回到列表里 | – | 否 |
| `finish` 有 ⚠️：没落地的留下 | 0%（画布丢弃） | **100%**（finishes-with-changes-left 2/2） |
| 再进编辑模式，画布逐个元素比（位置和 23 项计算样式，三个视图加画布外的图层） | 重新冻结 | 76 个比了，**0 个不同**（桌面、平板、手机、画布外各 0）；⌘Z 之后仍 0；finish 那个剧本 75 个，0 个不同 |
| 断点上的改动（手机视图的透明度）/ 画布外的图层（标题挪出画布） | – | 都留下，所在视图 0 个不同 |
| 编号 | – | 留下的 1–4，新改的 5；下一轮 claim 的小节 1–5 |
| 新改已落地的填充，改前 | – | #FF0000（代码现在的值），不是冻结时的白色 |
| 改动列表撤销（预览模式）留下的圆角和新填充 | – | 卡片仍是红色（已落地），圆角回到 12px |
| `last` | – | 照常给出上一轮，Applied / Not applied |
| 都放弃 / 都落地之后再进编辑模式 | – | 都按新代码重新冻结（画布上没有编辑标记） |

- 67 的 stops-halfway 和 ends-round-from-notice：断言加上 68 的两条，结果 `unappliedKeptForNextRound: 1`、`.vernier/` 留下 canvas.html 和 changeset.json、下一轮 2 条、角标有。
- 下一轮 claim 的开头（carries-over-what-is-left，原文）：「This round carries 4 changes over from the round before, not applied then (1, 2, 3 and 4), and none of its 5 changes are applied yet. Left: 5 changes, made by the designer in Vernier Kit. Apply them …」。页面已经显示的说「1 of its 3 changes is applied already (2), as the designer's page shows it」，都显示了只说一句让它 `finish`（单测）。

**Agent 读到的输出**

- 没有留下改动的一轮：10 个场景 `pnpm bench:agents --dry --claim-out` 的 claim 和 0e96358 逐字相同。另在两个版本上用一个不提交的补丁让 dry run 接着跑 `done <全部>` 和 `finish`：10 个场景的 claim、done、finish 共 30 份输出逐字相同。
- 同一补丁里 `finish` 之后再 `claim`：8 个场景有留下的改动，开头都是上面的写法，后面的小节和第一轮相同（只少了已落地的那几节、编号前移）；data-and-text、reorder-and-move 全都落地（页面核对不了的、done 过的算已落地），旧代码和新代码都说没有改动。

**性能**（ticket 22 的测试，`VK_PERF_PORT=5610 VK_PERF_HEADLESS=1`，headless shell，只作前后对比）

| | 0e96358 | 68 |
|---|---|---|
| 进入编辑模式（重新冻结），全部中位数 | 124.8ms（昨天）/ 135.1ms（今天，紧挨着跑） | 128.7ms（紧挨着跑）/ 135.4ms（全套） |
| 回到同一张画布：保存的一轮，中位数 / p95 | 125.8 / 137.8ms | 123.5 / 137.9ms |
| 回到同一张画布：留下改动的一轮，中位数 / p95 | 没有这条路 | 111.8 / 134.4ms（全套 126.6 / 135.3ms） |
| 回到同一张画布时的 long task | 每次 1 个，最长 119ms | 每次 1 个，最长 115–117ms |

- 新加的测试「the same canvas again」：大页面、3 条改动，先在保存的一轮上进 8 次（每次重新载入）再加同页再进一次，然后 Agent 落地圆角并 `finish`，在留下改动的一轮上同样测；改动单在此期间不会被保存，所以每次进入都把已落地的重新挪到底。
- 回到同一张画布本来就有一个约 115–120ms 的 long task，68 之前就有，68 没有加；「0 个 long task」这一条这条路做不到，见下。

**切换按钮体积**（`react.dev.js` 加共享 chunk，gzip）：前后都是 819 + 9,182 = **10,001 B**，没变。`editor.dev.js` 99,091 → 99,533 B。

**没做到的、留下的风险**

- 回到同一张画布时每次 1 个约 115ms 的 long task，68 前后一样，不是 68 加的。估计是把保存的画布写进 iframe 并排版（没细查）；要消掉得改恢复画布的方式，没在这里做。
- 已落地的改动挪到底层后，压在组件本身的改动下面：同一个元素上，已落地的「这一处」改动和留下的「组件本身」改动改同一个 CSS 属性时，看起来会变成组件的值。没遇到过，没测。
- 留下的结构改动（移动、合成 Stack 等）在一个也有已落地改动的元素上，除了参考样式之外写的东西会一起挪到底层，之后放弃这条留下的改动时不会完全撤掉。
- 留下的改动的 `sources`（Currently set by）还是冻结时读的，没有重读。
- 上一轮新建的图层在页面上找不到，核对的原因那句还写「the layer is new this round」。让它在页面上找得到要另开 ticket（合回 main 时编号）。
- 有留下改动的一轮，`claim` 要等页面回答 `opening` 才打印，比平常的 claim 慢一些（和一次 `done` 差不多，没单独量）。

**审查后补修（11/01，起点 ed1fb77）**

最终审查查出 7 条，设计师已定，都修了。只影响有留下改动的一轮，另有 67「claim 再跑一次」恰好 1 条已落地时的一个词。

- **画布和结束前不一致**（违反「差异 0」）：原来已落地的「只改这一处」挪进 `copied`，压在留下的「组件本身」改动（`promoted`）下面，画布显示组件的值。现在编辑样式多一层 `taken`（`canvas-style.ts`），放已落地的编辑，层序是 copied < promoted < taken < edits，和结束前编辑所在的位置一样；已落地的「组件本身」改动照旧进 `copied`。`asPage` 把 `taken` 当页面自己的。
- **放弃留下的绝对定位移动，容器还是 relative**：`holdAbsolute` 写在容器上的 `position: relative` 原来跟着进了底层。现在 `takeInApplied` 把它算作「把图层放成绝对定位的那条改动」的（和 `changesOn` 对断点上的 `within` 一样）：那条改动留下，它就留在 edits；已落地，才进底层。列表里放弃（画布开着）和预览模式里撤销（`revertSaved`）都走这里。
- **X/Y 的改前成了 `[object Object]`**：`claim` 重读改前时，X/Y 取页面上的 `left`/`top`（`{value, margin}` 的 `value`，和 `check.ts` 的 `lookPosition`、65 补修三的说法一致：X、Y 就是 left/top，外边距另算）；Absolute 取 `{x, y}`；页面上没有绝对定位（读出来不是数）就保留原来的改前，不写成 `nullpx`。
- **分段改动的改前是旧的**：各段由页面在认领前重读（65 的机制）；各段相同时，这个值写回改动的 `before`，说明里的「从…到…」就是页面现在的值。
- **边缘情况的位置说明**：「上一轮新建」改为只看改动单里有没有新建它的改动，不再要求有留下的改动；留下的都放弃后再改上一轮新建、已落地的图层，也写「Made in a round before」和 Currently set by unknown。本轮内一个图层的新建改动被撤掉时，对它的改动一起撤掉（`withDependents`），所以「本轮新建却找不到新建它的改动」不会出现，`newLayer` 里那个兜底（「earlier this round」）去掉了。
- **Currently set by 也重读**：`claim` 的 `opening` 问法带 `sources: true`，页面对没显示的样式改动在读出 `actual` 的那个元素上一起读出 sources（`property-table.ts` 的 `sourcesFor`，和编辑时读的元素、CSS 属性同一套），写回改动单。`done`、`finish` 的问法不带，不读。没有打开的页面就不问。
- **审查（code-review）之后再改的**：带外边距的 X/Y 只认页面读出的 `{value, margin}`（页面上绝对定位、画在别处），读出的是数说明图层在排版里，保留原来的改前；页面读出的 sources 为空时不覆盖；有留下改动的一轮只有 1 条改动时，开头写「its 1 change is …」。
- **重复代码**：`claim` 再跑一次和有留下改动的 `claim` 共用 `claimedAgain`（全都落地的一句、`so`、`left`、说明）；三处「问页面并等回答」合成 `askPages`。67 那条路恰好 1 条已落地时由「1 of its 3 changes are applied」改为「is applied」，其余输出不变。

测试（去掉对应修复会失败的）：`carried-round.browser.test.ts` 的「the component's change left under its usage's applied」（1）、「a move absolute left in a container with a change applied」（2，画布开着和不开各一次）；`cli.test.ts` 的两条 X 用例（3）、「a change at a range in parts carried over」（4）、「a change made since to a layer made in a round before, every change left of that one discarded」（5）、「what sets a change's value carried over is read again」（6，命令行）、「says of one change applied that it is」和 68 原有的「with a page open…」（7）；`edits.browser.test.ts` 的「asked by claim of a change carried over…」（6，页面）。

**剧本**（新剧本 carries-over-under-and-around；结果在 `bench-results/playbooks-68fix/`，修复前的在 `before-ed1fb77/`；`bench-results/playbooks/` 跑前备份，跑完恢复原样）

- 场景：Card（循环那处）padding top 16 后 Promote（#1，组件本身），再改这处 24（#2）；页面上手加的一个 Frame（#board）填绿色（#3），把 Get started 按钮拖进去，绝对定位（#4）。Agent 把 `p-5` 写成 `p-5 pt-6`（页面显示 #2，不显示 #1），`done 3`，停住；设计师长按结束。

| | 前（ed1fb77） | 后 |
|---|---|---|
| 没落地的留下 | 100%（#1、#4 → 1、2） | 100%（同） |
| 再进编辑模式，逐个元素比（三个视图） | 78 个比了，**57 个不同**（每个视图 19） | 78 个比了，**0 个不同** |
| 循环那 3 张 Card 的 padding top（结束前 24px） | 16px（组件的值压上来） | 24px |
| 预览模式里撤销 #4 之后，#board 的 position | relative | **static**（填充仍是已落地的绿色，按钮回到原处） |
| 编辑模式里放弃 #1 之后，Card 的 padding top | 24/24/24/20px | 24/24/24/20px（循环那 3 张是已落地的 24；单独那张是冻结时的 20） |
| 下一轮 claim，#1 的 Currently set by | class `p-5`（冻结时） | `padding-top`: class `pt-6`；其余三边：class `p-5`（页面现在的） |

- 其余 9 个剧本（含 68 的 carries-over-what-is-left、finishes-with-changes-left）在修复后的代码上照常通过，数字和 `playbooks-68/` 相同（只有计时差 1ms 级：提示出现的时刻 551,301 → 551,312ms，没认领改代码的提示 84 → 83ms）：画布 76 / 75 个比了，0 个不同。

**Agent 读到的输出**

- 没有留下改动的一轮：10 个场景 `--dry --claim-out` 的 claim 和 `claim-0e96358/` 逐字相同；用不提交的 `rest-out.patch` 接着跑 `done <全部>` 和 `finish`，20 份输出和 `rest-0e96358/` 逐字相同（补丁用完已撤）。
- 有留下改动的一轮（同一补丁里 `finish` 之后再 `claim`，和 e5b2877 的 `rest-68/` 比）：10 个场景里 8 个逐字相同（页面重读的 sources 和冻结时一样，代码没变）。不同的 2 个：
  - 只留下 1 条的一轮（dissolve-place-frame、put-back-and-new-text），开头的单复数：前「…not applied then (1), and none of its 1 changes are applied yet. Left: 1 change, …」，后「…not applied then (1), and its 1 change is not applied yet. Left: 1 change, …」；全都落地时同样由「all 1 of its changes are applied already, as the designer's page shows them」改为「its 1 change is applied already, as the designer's page shows it」（单测）。67 的「claim 再跑一次」不用这个写法，照旧。
  - dissolve-place-frame 的 Y：前 `- **Design intent:** Change the Y position from nullpx to 488px.`，后 `- **Design intent:** Change the Y position from 368px to 488px.`（页面上这个按钮现在不是绝对定位，没有 Y 可读，保留原来的改前）。
- 页面上绝对定位、画在别处的 X（单测）：前「Change the X position from [object Object]px to 40px.」，后「from 32px to 40px.」（32 是页面的 `left`，外边距 8px 另算）。
- Currently set by（剧本，见上表）：前 `class \`p-5\``；后 `` `padding-top`: class `pt-6`: rule `.pt-6` in CSS layer `utilities` of `src/index.css`, …; `padding-right`, `padding-bottom`, `padding-left`: class `p-5`: … ``。同一节的意图前后都是「Change the padding from top 24px, right 20px, bottom 20px, left 20px to top 16px, …」。
- 67「claim 再跑一次」恰好 1 条已落地：「1 of its 3 changes are applied (1)」→「1 of its 3 changes is applied (1)」。

**性能**（`VK_PERF_PORT=5610 VK_PERF_HEADLESS=1 pnpm test:perf`，headless shell，前后紧挨着跑，只作对比）

| | ed1fb77 | 补修后 |
|---|---|---|
| 进入编辑模式（重新冻结），全部，中位数 / p95 | 131.8 / 165.6ms | 114.6 / 137.9ms |
| 回到同一张画布：保存的一轮，中位数 / p95 | 108.8 / 116.4ms | 108.6 / 114.4ms |
| 回到同一张画布：留下改动的一轮，中位数 / p95 | 110.0 / 119.5ms | 106.4 / 114.3ms |
| 回到同一张画布时的 long task | 每次 1 个，最长 102 / 105ms | 每次 1 个，最长 100 / 101ms |
| 认领期间核对、读分段 | 核对自身 0 个 long task | 同 |

- 都在 150ms 以内。上次（68）是 128.7、123.5、111.8ms，机器状态不同，只看同一次前后。

**切换按钮体积**（gzip）：10,001 → **9,998 B**（819 + 9,182 → 818 + 9,180）。`editor.dev.js` 99,533 → 99,760 B。

**留下的风险**

- 上面「没做到的、留下的风险」里第 2、3、4 条（已落地的被组件改动压住、结构改动写的东西放弃时撤不干净、sources 没重读）由本次补修解决；第 1、5、6 条照旧。
- 绝对定位之外，结构改动在别的元素上写的东西（合成 Stack 时成员的 `position: static`、去掉的外边距，解散时的定位）本来就在 `changesOn` 里，随那条改动；没另加用例。
- sources 在读出 `actual` 的那个元素上读：组件改动有多处使用时，读的是第一处没显示的；分段改动读的是没显示的那一段。


**设计师 2026-11-01（分诊落地线的遗留）**：回到同一张画布时约 100ms 的 long task 不开 ticket。进入编辑模式 ≤ 150ms 达标；从新冻结进入时主线程同样一口气忙到画好；它落在进场动画里；goals 里「0 个 long task」管的是认领期间的核对。这条路的耗时超过 150ms 时再处理。
