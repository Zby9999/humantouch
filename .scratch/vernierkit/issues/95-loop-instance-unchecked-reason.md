# 95: 循环里的删除、复制、移动，`done` 给它自己的原因

**What to build:** 在画布上删掉、复制或挪动循环里的一项（例如特性列表里的 Arrange 卡片，卡片由同一段数据循环生成），页面核对不了：它分不清循环里的每一份。核对不了没问题，可 `done` 给的原因落在兜底那句「of the changes to the structure, only reorders, absolute placements in the same container and deletions are checked on the page」：这句说删除、调换顺序是核对的，这次的删除偏偏没核对，Agent 读了容易糊涂，报告里可能归错类。要做到：这类改动有它自己的、准确的原因，口吻照 90 给改字定的那句（「the words come from the data the loop goes through, and the page cannot tell the loop's instances apart」）。只改原因，不让页面去核对它们。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准（「Faithful」：报告合规），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0006、0013）。

**Blocked by:** 无

**Status:** done

- [x] 先复现，用剧本（脚本扮演 Agent，不跑真实 Agent）：测量台的 `data-and-text` 场景（删掉 Arrange 卡片、复制 Freeze 卡片），`done` 现在对这两条说的是兜底那句
- [x] 循环里的一项被删除、复制、调换顺序或挪走时，`done` 说它自己的一句原因（说清是循环所用的数据、页面分不清循环里的每一份），`finish` 报告里相应的地方跟着用；说法由这条线代定，等设计师确认
- [x] 把所有落到兜底那句的情况列一遍：兜底那句对它说得对的（例如复制一个不在循环里的图层），照旧；说得不对的，各给准确的原因，照现有原因的口吻
- [x] 改动说明（`claim`）「How the page checks」一节里核不了的名目，和新的原因说法对得上（已有「a change to one of a loop's instances alone」，看要不要跟着改）
- [x] 没有这类改动的一轮，`claim`、`done`、`finish` 的输出逐字不变；切换按钮的包逐字节不变
- [x] 测量台的标准场景跑 `--dry` / `--scripted`：只有含这类改动的场景（`data-and-text` 等）那几行变了，别的逐字不变

## 背景

- ticket 90 的遗留风险第 1 条（2026-11-04）：数据里的删除、移动、复制仍说结构改动那句，删除本来是核对的，这句最容易误导。90 那条线没改，因为改它会改变没有改字的一轮的输出。
- ticket 88 跑的标准场景 `data-and-text` 正好有删除、复制循环里的一项，88 一定会碰到这句。88 的数字会成为以后的基线，所以排在 88 前面。

## 设计师决定（2026-11-04，分诊）

- 选做法 1：开 ticket，只把原因改准确，排在 88 前面。
- 考虑过的别的做法：让页面真去核对这类改动（按每一份的字和顺序比画布），更彻底，但要新设计比法，88 要多等，等 88 的数据看这类改动出错多不多再定；先不动，等 88 的数据看 Agent 有没有被误导。
- 先复现，再修。不跑真实 Agent。

## Comments

**实现记录（2026-11-04）**

只改原因，`checkable()` 一字没动，页面不多核对什么。`uncheckable()`（`packages/03kind/src/client/check.ts`）在兜底那句之前加了三支：

1. 循环里的一项单独改（`change.data`）：改字照旧说 90 那句；删除、复制、调换顺序、挪动（自由定位、换容器）说新的一句「the change is to the data the loop goes through, and the page cannot tell the loop's instances apart」。放在「text runs on」那支之前：数据里的调换顺序碰上容器里有散字时，原来会说「text runs on」，现在也说数据这句，和 `claim` 的名目（数据那项排第一）一致。
2. 一个 Frame 唯一的字（按钮里的字，没有自己的元素，`Target.onlyText`）在这个 Frame 里自由定位：编辑层在桌面视图里把它当成移动（`wrap`），原来落到兜底那句，说「absolute placements in the same container … are checked」，偏偏没核对。现在照一段字里的一截的说法「the text has no element of its own on the page」（`checkable.ts` 新的 `textMovedInPlace`）。
3. 页面要是找得到容器就会核对的移动（同一个容器里的自由定位，或同一个容器里、容器里没有散字（有 `order`）的调换顺序），容器却找不到：照 76 给新建图层的容器的说法（`CONTAINER_UNFOUND`，一字不改）说为什么找不到容器；容器是这一轮新建的 Frame 时页面找得到它，但不核对里面的移动，说「its container is new this round, and the page checks no move in it」；这个 Frame 又在页面找不到的容器里时，说「its container is new this round, in a container the page cannot find」。

`finish` 的报告不带原因（只有「1 and 2 the page cannot check: …」），所以不用改；原因除了 `done`，只在本轮的核对结果里（`.03kind/checks.json`、归档的 `result.json`），跟着变。`claim` 的「How the page checks」只为第 2 支改了归类，见下面。spec「核对」一节加了一条（改字那组之后）；ADR 0013 没有列原因，没改。

剧本留作测试：`e2e/tests/applying-bench.spec.ts` 的「a loop's instance deleted, copied or moved (ticket 95)」，2 个：删掉 Arrange、复制 Freeze（测量台 `data-and-text` 的两条结构改动），脚本照数据写；Apply 卡片在 Grid 里按 ← 挪到 Arrange 前面（编辑层能做出来的循环里的调换顺序），脚本调换数据。单元测试：`packages/03kind/test/edits.browser.test.ts` 的「why the page cannot check a change to the structure (ticket 95)」，5 个（含按钮里的字原地自由定位），`cli.test.ts` 加 1 个（它在 `claim` 里的名目），用编辑层真做出来的改动（删除、复制、调换、自由定位循环里的一项；新 Stack 里调换；没有源码标记的容器里调换；不在循环里的复制、合成 Stack、解散 Stack、换容器、换容器并自由定位），做不出来的用改动单里手写的（换容器的数据移动、散字之间的数据调换、上一轮新建的容器、留到下一轮的新 Frame、从自由定位放回排版、拖回）。换容器的数据移动其实编辑层做得出来（`canDrop` 只要求两个容器的实例数相同），记下的也是 `data: true`，原因一样是数据那句；这里图省事用了手写的。

复现：改之前 `--dry` 的 `data-and-text`，`done` 对删除、复制两条说的都是兜底那句（见下面「`--dry` 对比」）；两个剧本在 cef746d 的构建上都失败在 `done`。单元测试：最先写的 4 个里 3 个先红（数据、数据换容器、找不到的容器），兜底照旧的那个本来就绿；按钮里的字那个（现在共 5 个）和审查后加的断言是边改代码边写的，没有单独先跑红。

**落到兜底那句的情况（改前 → 改后）**

`uncheckable()` 只在 `checkable()` 为否时说原因。逐支看下来，能落到兜底那句的只有「图层按源码标记找得到（不是这一轮新建的、有标记、不是一段字里的一截）、种类不是样式、改字、生成说明」的这些：

| 情况 | 改前 `done` | 改后 `done` |
|---|---|---|
| 循环里的一项单独删除 | 兜底那句 | 「the change is to the data the loop goes through, and the page cannot tell the loop's instances apart」 |
| 循环里的一项单独复制 | 兜底那句 | 同上 |
| 循环里的一项调换顺序 | 兜底那句（容器里有散字时是「text runs on among the layers of its container, so the page cannot tell their order」） | 同上 |
| 循环里的一项自由定位、换到别的容器 | 兜底那句 | 同上 |
| 在同一个容器里自由定位，或调换顺序（容器里没有散字），容器没有源码标记 | 兜底那句 | 「its container has no source marker, so the page cannot find it」 |
| 同上的容器里，容器里有散字时调换顺序 | 「text runs on among the layers of its container, so the page cannot tell their order」 | 照旧 |
| 同上的容器里，从自由定位放回排版 | 兜底那句 | 照旧 |
| 同上，容器是这一轮复制、拖回、合成的 Stack（例如先合成 Stack 再在里面调换） | 兜底那句 | 「its container is new this round (a copy, a layer put back or a new Stack), so the page has no marker to find it by」 |
| 同上，容器是上一轮新建的 | 兜底那句 | 「its container was made in a round before, and the page cannot find it」 |
| 同上，容器是这一轮新建的 Frame（只在留到下一轮的一轮里出现） | 兜底那句 | 「its container is new this round, and the page checks no move in it」 |
| 同上，容器是这一轮新建的 Frame，Frame 又在页面找不到的容器里 | 兜底那句 | 「its container is new this round, in a container the page cannot find」 |
| 复制不在循环里的图层 | 兜底那句 | 照旧 |
| 拖回画布的图层 | 兜底那句 | 照旧 |
| 合成 Stack、解散 Stack | 兜底那句 | 照旧 |
| 换到别的容器（排版里，或自由定位） | 兜底那句 | 照旧 |
| 在同一个容器里从自由定位放回排版 | 兜底那句 | 照旧 |
| 一个 Frame 唯一的字（按钮里的字，`Target.onlyText`）在这个 Frame 里自由定位（再拖一次也一样：仍是第一次记下的那条移动） | 兜底那句 | 「the text has no element of its own on the page」 |
| 一个 Frame 唯一的字换到别的容器 | 兜底那句 | 照旧（它在 Frame 里只有自己，没有顺序可调） |
| 样式改动走到「the layer's container cannot be found on the page」那支 | — | 照旧（实际走不到：找得到图层的样式改动都核对） |

照旧的几种，兜底那句说得对：它们不在「reorders, absolute placements in the same container and deletions」里。散字之间的调换顺序（不是循环里的）照旧说「text runs on」。没有源码标记、一段字里的一截、这一轮新建的图层上的改动，在兜底那支之前就各有原因，没变。

**`claim`「How the page checks」**：只改了一处归类：按钮里的字原地自由定位，原来归「a move into another container, or into a layout from a place of its own」（说错了），现在归「a change to a layer the page cannot find」，和 `done` 的「the text has no element of its own」对得上（`writing-rules.ts` 的 `UNCHECKED`、`movedUnchecked` 用同一个 `textMovedInPlace`）。只有这种改动的一轮 `claim` 才变；标准场景里没有。其余名目不用改。新的数据原因对应已有的「a change to one of a loop's instances alone」（判断条件就是 `change.data`，和 `done` 的数据那支同一个条件）；找不到容器的几种对应已有的「a move in a container made this round, or one the page cannot find」（`inUnfoundContainer`：同一个容器、容器是新建的或没有标记）；`inUnfoundContainer` 还包括找不到的容器里有散字时的调换顺序、从自由定位放回排版，这两种 `done` 照旧说「text runs on」和兜底那句，`claim` 也照旧（和 cef746d 相同，两边原来就这样说法不同，没动）；照旧的几种对应「a copy」「a layer put back」「a Stack made or dissolved」「a move into another container, or into a layout from a place of its own」。

**`claim` / `done` / `finish` 改前改后（逐字）**

剧本 1（删掉 Arrange、复制 Freeze）。改前（cef746d 的 `--dry` `data-and-text`，和剧本里这两条一样）：

```
Change 1: not checked on the page: of the changes to the structure, only reorders, absolute placements in the same container and deletions are checked on the page. That is no error: go on.
Change 2: not checked on the page: of the changes to the structure, only reorders, absolute placements in the same container and deletions are checked on the page. That is no error: go on.
```

改后：

```
Changes 1 and 2 done: 2 of 2 changes applied.
Change 1: not checked on the page: the change is to the data the loop goes through, and the page cannot tell the loop's instances apart. That is no error: go on.
Change 2: not checked on the page: the change is to the data the loop goes through, and the page cannot tell the loop's instances apart. That is no error: go on.
```

剧本 2（Apply 挪到 Arrange 前面），改后：

```
Change 1 done: 1 of 1 change applied.
Not checked on the page: the change is to the data the loop goes through, and the page cannot tell the loop's instances apart. That is no error: go on.
```

改前是同样的头一行，第二行是「Not checked on the page: of the changes to the structure, only reorders, absolute placements in the same container and deletions are checked on the page. That is no error: go on.」。

`claim` 改前改后逐字相同，「How the page checks」两个剧本都是：

```
- **How the page checks:** the page reads a change to one of a loop's instances alone, not at all: `done` says Not checked, which is no error; say in the report what you did.
```

`finish` 改前改后逐字相同（报告不带原因）：剧本 1「Round finished: 2 of 2 changes applied.」，✓ 下面「- 1. Delete: …」「- 2. Duplicate: …」，加「- 1 and 2 the page cannot check: keep each under ✓ if you applied it exactly as asked; if not, move it under ⚠️, with Why and Instead.」；剧本 2「Round finished: 1 of 1 change applied.」，「- 1. Reorder: …」，「- 1 the page cannot check: keep it under ✓ …」。

本轮核对结果（`result.json` 的 checks）跟着变：改后两条都是「unchecked: the change is to the data the loop goes through, …」。

**审查后修正（2026-11-04）**

代码审查（effort high）找到这些，修了：

1. **新 Frame 里的说法**：「of the changes in a container made this round, the page checks only the layers made in it」两头都不对（页面核对新 Frame 里有标记的图层的样式、改字、删除；这一轮新建在里面的图层的移动反倒不核对），改成「its container is new this round, and the page checks no move in it」（76 的口吻）。
2. **找不到容器那支管得太宽**：原来容器找不到时，容器里有散字的调换顺序也改说容器的原因（原来是「text runs on」），从自由定位放回排版也改说容器的原因（原来是兜底那句，对它说得对）。现在只管页面找得到容器就会核对的那两种（`after.absolute`，或 `!before.absolute` 且有 `order`），这两种照旧；加了测试钉住原来的说法。`claim` 对这两种和 cef746d 一样。
3. **按钮里的字**：改用已有的 `Target.onlyText` 认，不再从「`wrap` 而没有 `run`」推断；`cli.test.ts` 里手写的那条也带上 `onlyText`。
4. **测试**：「照旧」那组加了拖回；加了按钮里的字拖两次仍是同一条移动、仍带第一次的 `target` 和 `wrap`。
5. **记录**：换容器的数据移动编辑层做得出来，原来写成做不出来，改正了；先红的个数写准了。

没改的：审查第 5 条（先在断点上自由定位、再在桌面视图拖动的按钮里的字，`claim` 归进两项），改它会让有散字移动的一轮 `claim` 都变，写进遗留风险第 3 条。标准审查的几条代码气味（同一个「同一个容器」判断写在 `checkable`、`inUnfoundContainer`、`containerUnfound`、`textMovedInPlace` 四处；两句循环原因一句是常量一句是字面量）没动，测试里遮住文件级 `at` 的变量改了名。

**`--dry` 对比（全部 24 个场景）**

临时给 `run-agents.ts` 的 `setUp` 加了几行（没提交）：`--claim-out` 时在 `claim` 之后对每条改动 `done`、再 `finish`、再 `claim`，各存一个文件。在 cef746d（`dry-before`）和本线最后的 9e0468a（`dry-after`）各跑一次 `TK_BENCH_PORT=5440 node e2e/bench/run-agents.ts --dry --claim-out …`，两次 24 个场景都 ✓，各 96 个文件（24 × `claim`、`done`、`finish`、再次 `claim`）。

- 逐字不同的只有 `data-and-text.done.md`，只有删除、复制那两行（如上）；改字那行、`claim`、`finish`、再次 `claim` 都相同。
- `flow-undo-last.finish.md` 两边都是同一个报错（这个场景是撤销，没有一轮可以 `finish`），只差报错里的临时文件夹名，不算。
- 其余 22 个场景的 4 个文件逐字相同，包括落到兜底那句、照旧的那些：`reorder-and-move`（换容器）、`type-and-stack`（合成 Stack）、`dissolve-place-frame`（解散 Stack）、`put-back-and-new-text`（拖回）。标准场景里没有找不到容器的那几种。

审查修正后（5fe6045 的构建）又跑了一遍，存进 `dry-after2`，和 `dry-before` 比：96 个文件，同样只有 `data-and-text.done.md` 那两行不同，`flow-undo-last.finish.md` 只差临时文件夹名。这一遍跑了三次才齐：第一次跑到第 6 个场景时 Node 又报 socket `setTypeOfService EINVAL` 退出；剩下 19 个重跑时 `third-party` 等 locator 超时，而且 `data-and-text`、`phone-breakpoints` 的 `claim` 里 Card 多了 `pt-6`，那是我同时在跑的 e2e 正改着例子的 Card.tsx、测量台复制例子时带进去的；e2e 跑完后这三个单独重跑，都 ✓，结果如上。审查修正后没有再跑 `--scripted`。

**`--scripted`**

`TK_BENCH_PORT=5440 node e2e/bench/run-agents.ts --scripted`，15 个有脚本的场景：

- 改前（cef746d）：第一遍 12 个过；`variables` 等 locator 超时，`r18-phone-and-stack` 时 Node 报 socket `setTypeOfService EINVAL`，整个进程退出（机器忙）。剩下 4 个（`variables`、`r18-phone-and-stack`、`next-server-usage-text`、`next-client-stack-breakpoint`）单独重跑全过，合计 15 个全过。
- 改后（9e0468a 的构建）：15 个全过，一遍跑完。`data-and-text` 的删除、复制照旧没能核对（场景里本来就记的 `checkable: false`），改字核为 shown。

**包体积**（未压缩 / gzip -9，cef746d 的构建对比审查修正后的 5fe6045）

- 切换按钮：`react.dev.js` 1,423 / 822 B、`chunk-UQJRS7YD.js` 21,575 / 9,164 B，sha256 改前改后相同，逐字节不变。
- `editor.dev.js`：327,661 / 111,387 → 328,459 / 111,594 B（+798 / +207）。
- `cli.js`：136,305 / 38,268 → 136,587 / 38,317 B（+282 / +49，`claim` 的名目用到 `textMovedInPlace`）。

**测试**

- `pnpm typecheck` 通过（审查修正后也通过）。
- 审查修正后 `pnpm test`：vitest 34 个文件 904 passed、1 skipped，node 121 个全过。
- 审查修正前 `pnpm test`：vitest 34 个文件 904 passed、1 skipped；第一次跑 `page-claim-service.test.ts` 有 1 个失败（`last` 的 `git apply` 收到空补丁，和这条线无关，机器忙时的时序问题），单独重跑 9 个全过；node 测试 121 个全过。
- `TK_E2E_PORT=5400`，`claim.spec.ts` 加 `applying-bench.spec.ts`（`--project="project files" --no-deps`）：50 passed（审查修正后 5fe6045 上又跑一次，仍 50 passed），包括 ticket 90 的 5 个剧本和这条线的 2 个。`claim.spec.ts:120,146` 断言的兜底那句是换容器（自由定位）和合成 Stack，都是兜底说得对的，没改。
- 剧本先红：把 `dist` 换回 cef746d 的构建跑这 2 个剧本，都失败在 `done`（删除、复制、调换都说兜底那句），`claim`、`finish` 和改后逐字相同。
- 中途跑过一次整个 page 组（误把它当依赖带上了）：282 passed、3 failed（`next-install`、`undo.spec.ts:80`、`undo.spec.ts:136`），都不碰核对的原因，当时 `--dry` 在同一台机器上跑。没有再跑全量 e2e。

*代定的事（待设计师确认）*

我按「最贴近 77、80、84、90」代定的：

1. **循环里的一项删除、复制、调换顺序、挪动的原因**：「the change is to the data the loop goes through, and the page cannot tell the loop's instances apart」。后半句和 90 的改字那句逐字相同；前半句把「the words come from the data」换成「the change is to the data」，四种改动共用一句（对删除、复制、调换、挪动读着都对，`claim` 的 Data change 一条对它们说的也都是「the data the loop goes through」）。改字照旧说 90 那句，没并进来。
2. **数据里的调换顺序遇上散字**：说数据这句，不说「text runs on」：页面核不了它首先是因为分不清每一份，和 `claim` 把它归进「a change to one of a loop's instances alone」一致。
3. **同一个容器里的调换顺序、自由定位，容器找不到**（只管页面找得到容器就会核对的那两种；容器里有散字的调换、放回排版照旧）：原来说兜底那句（说调换顺序、自由定位是核对的），现在照 76 的容器原因逐字说（没有标记、这一轮复制拖回合成的、上一轮新建的）。不另起新句子。
4. **容器是这一轮新建的 Frame**（只在留到下一轮的一轮里会有）：「its container is new this round, and the page checks no move in it」，照 76 的口吻（审查后改的：原来那句「of the changes in a container made this round, the page checks only the layers made in it」两头都不对，页面其实核对新 Frame 里有标记的图层的样式、改字、删除，而这一轮新建在里面的图层的移动反倒不核对）。这个 Frame 又在页面找不到的容器里时（页面连 Frame 都找不到）：「its container is new this round, in a container the page cannot find」（审查时找到的，原来也说上面那句，不对）。
5. **兜底那句说得对的照旧逐字**：复制不在循环里的图层、拖回、合成或解散 Stack、换容器（包括换容器时自由定位）、从自由定位放回排版、按钮里唯一的字换到别的容器。
6. **按钮里的字原地自由定位**（按 `Target.onlyText` 认，不看 `wrap`：唯一的字被挪动时编辑层一定给它包 `<span>`、记 `wrap`，多看 `wrap` 不改变结果）：用已有的「the text has no element of its own on the page」，`claim` 里改归「a change to a layer the page cannot find」。这是唯一让 `claim` 变了的地方（只在有这种改动的一轮）。
7. **`claim` 别的名目不改**：已有的「a change to one of a loop's instances alone」「a move in a container made this round, or one the page cannot find」和新的原因对得上。
8. **`finish` 不改**：它的报告本来就不带原因。
9. **新的那支放在原来的位置**（找不到图层、没有标记、一段字里的一截这些原因之后），所以循环里的一项要是没有源码标记，照旧说「the layer has no source marker, so the page cannot find it」，`claim` 却归进数据那项（90 起改字也一样）。没调先后，免得别的一轮的输出变。

**遗留风险**

1. **Agent 仍可能把数据改动归错**：原因说准了，但页面照旧不核对数据改动，写错了数据（删错一项、复制到错的位置）`done` 也只说没能核对。设计师分诊时说等 88 的数据看出错多不多再定要不要真去核对。
2. **找不到容器的几种、按钮里的字原地自由定位，都没有标准场景**：只有单元测试（新 Stack 里调换是编辑层真做出来的，其余是改动单里手写的），88 碰不到；留到下一轮的新 Frame 那句只在那种一轮里出现，没有端到端测过。
3. **散字（一段字里的一截）在同一个容器里挪动**，`claim` 照旧同时归进「a change to a layer the page cannot find」和「a move into another container, or into a layout from a place of its own」两项（原来就这样，没动，免得别的一轮的 `claim` 变）。审查找到的同类一例：先在手机视图里把按钮里的字自由定位（编辑层给它包上 `<span>`，记成样式改动），再回桌面视图把这个 `<span>` 拖到按钮里别的位置；这条移动的 `target.run` 是 0、没有 `wrap`、没有 `onlyText`，`done` 说「the text has no element of its own on the page」（对），`claim` 却同时列进上面两项。改法是 `writing-rules.ts` 的 `movedUnchecked` 排除 `target.run !== undefined`，但这会让所有有散字移动的一轮 `claim` 都变，留给设计师定。
4. **循环里的一项没有源码标记时**，`done` 说没有标记，`claim` 说是循环里的一项（见代定第 9 条），两边说法不同，都不算错。
5. **跑基线时的两次环境问题**：改前的 `--scripted` 第一遍 `variables` 等 locator 超时、`r18-phone-and-stack` 时 Node 的 socket 报 `setTypeOfService EINVAL` 整个进程退出（机器忙，别的线也在跑），剩下 4 个单独重跑全过。

**合并前全量（2026-11-04，指挥）**

第一次在同步 main 981cbe6 后的 d4ac8c0 上跑（含审查修正 5fe6045）：typecheck 通过；vitest 904 passed、1 skipped；e2e 420 passed、1 skipped；`--scripted` 15 个一遍全过（审查修正后第一次跑）。跑完 main 合进了 ticket 94（e1f1db7，改了 `placed-from.ts`、`property-table.ts`、`structure-edits.ts` 和同一个测试文件），又同步一次（9a359b1，自动合并没有冲突），全部重跑：

- `pnpm typecheck` 通过。
- `pnpm test`：vitest 34 个文件，913 passed、1 skipped；node 测试 121 个全过。
- `TK_E2E_PORT=5400 pnpm test:e2e`：420 passed、1 skipped，没有失败。
- `TK_BENCH_PORT=5440 node e2e/bench/run-agents.ts --scripted`：15 个有脚本的场景一遍全过。
- 切换按钮的包：`react.dev.js`（c83849f1…）、`chunk-UQJRS7YD.js`（cdd6f09d…）sha256 和 cef746d 相同，逐字节不变。

## 设计师确认（2026-11-04）

- 「代定的事」1–9 条全部确认：循环里的一项删除、复制、调换、挪动共用数据那句；数据里的调换遇上散字也说数据那句；找不到容器照 76 的容器原因逐字说；这一轮新建的 Frame 那两句；兜底说得对的照旧；按钮里的字原地自由定位用「the text has no element of its own on the page」，`claim` 改归类；`claim` 别的名目、`finish` 不改；分支先后不调。
- 遗留风险第 3 条（散字在同一个容器里挪动，`claim` 同时归进两项）：先记着，不修。24 个标准场景的 `claim` 里都没有这种情况，88 碰不到；以后 88 的结论要改 `claim` 的说法时一起看。
