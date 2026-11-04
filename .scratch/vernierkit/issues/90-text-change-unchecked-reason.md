# 90: 页面核对改字的改动

**What to build:** 改现有图层的字（Text 改动）现在页面从来不核对：样式改动、删除和一部分移动才核对，改字落在兜底那一支，`done` 还说它是结构改动（"of the changes to the structure, only reorders, absolute placements in the same container and deletions are checked on the page"），Agent 照这句话写报告就写错了类别。改字是设计师最常做的改动之一，不核对，它落没落对全凭 Agent 自报。要做到：页面按源码标记找到这个图层，看它的字是不是设计师最后打的字；核不了的情况给它自己的、准确的原因。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准（「Faithful」：虚假的 ✓ = 0；「Robust」：核对覆盖率），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0006、0013）。

**Blocked by:** 无

**Status:** done

- [x] 先复现，用剧本（脚本扮演 Agent，不跑真实 Agent）：改一个现有图层的字，Agent 写对、写错各一次，`done` 现在都说没能核对，原因是结构改动那句
- [x] **核对改字**：图层按源码标记找得到（不是这一轮新建的、不是数据里来的字、不是一段字里的一截）时，页面看它的字是不是最后打的那几个字，比法照新建文字（spec「核对」一节：新建文字要字对得上，以最后打的字为准）。页面上渲染了好几份（循环、组件用了好几次）时，每一份都要对上，和样式改动一样
- [x] **只改一处的改字**（组件用了好几次，设计师只改了其中一个使用处的字）：别的使用处的字没变，照 ticket 77、82 对样式改动的做法看；改到别的使用处算没显示，不报虚假的 ✓
- [x] 没显示时，`done` 照 80 的口吻说：页面上那里现在是什么字、画布上是什么字，该怎么改；`finish` 报告里 Why 那一行有相应的一句。说法由这条线代定，等设计师确认
- [x] **核不了时给它自己的原因**，不再落到结构改动那句：字是从数据里来的（例如卡片列表里的一项）、改的是一段字里的一截（例如加粗的那个词，已有「the text has no element of its own on the page」）、图层没有源码标记、这一轮新建的图层上的改字等，各自一句，照现有原因的口吻
- [x] 改动说明（`claim`）里「How the page checks」一节，这一轮有改字时说一次页面怎么核对改字；Skill 里如果有列出页面核对哪些改动的地方，也跟着改
- [x] 没有改字的场景，`claim`、`done`、`finish` 的输出逐字不变；切换按钮的包逐字节不变（核对代码在编辑层延迟加载的那部分里）
- [x] 测量台里有改字的标准场景（`data-and-text`、`next-server-usage-text` 等），脚本扮演 Agent 跑（`--scripted`）时，能核对的改字核为 shown

## 背景

- ticket 87 的审查发现（2026-11-03）：在 Next.js 示例的场景 `next-server-usage-text` 里，第三个 Stat 的 label 改字，`npx 03kind done` 对它说的是结构改动那句原因。原因来自 `check.ts` 的 `uncheckable()`：前面的分支都不认改字，落到兜底那句；`checkable()` 也只认样式、删除和一部分移动。
- 规划会话查了：核对代码在编辑层延迟加载的那部分（`editor.dev.js`）和命令行里，不在切换按钮的包里。
- 可选做法（分诊时）：1. 只改原因；2. 让页面核对改字，核不了的给准确原因；3. 不改。

## 设计师决定（2026-11-04，分诊）

- 选做法 2：改字很常见，不核对的话全凭 Agent 自报；有新建文字的比法可以照着做，也不碰切换按钮。
- 排在 ticket 88 前面：88 的数字会成为以后的基线，先补上改字的核对再跑。
- 先复现，再修。不跑真实 Agent。

## Comments

**由 ticket 87 那条线开出（2026-11-03，938d005）**：原来的标题是「改字的改动没在页面上核对时，`done` 说的原因是『结构改动』的」，状态 needs-triage，验收项是只改原因、加单元测试；分诊时改成上面的做法 2。

**实现记录（2026-11-04，8988826）**

验收项都做到了，照设计师选的做法 2。改字的改动（kind `text`）落在按源码标记找得到的图层上（不是这一轮新建的、不是数据里来的字、不是一段字里的一截）时，`checkable()` 认它能核对；页面用新的 `lookWords` 看图层的字（`wordsOn`，和新建文字的比法同一个函数，连着加粗、链接等片段一起读，空白算一个空格）是不是最后打的字，每一份实例都要对上；一份都找不到时答没能核对（「the layer is not on the page now」），不报 ✓。改字只在窗口宽度看（字不随宽度变）。「只改这一处」的改字照 77、82 的做法：认领时记下组件其他使用处的字，存进 `.03kind/other-usages.json`（文件格式不变），刷新后照样找回；改到别的使用处算没显示。核不了的各有自己的原因，不再落到结构改动那句。Skill 没有列出页面核对哪些改动，没改。spec「核对」一节加了改字一条，「How the page checks」一条、ADR 0013 一行跟着改。

剧本留作测试：`e2e/tests/applying-bench.spec.ts` 的「a text change (ticket 90)」，5 个：标题写对、标题写错、第四张卡片的标题只改这一处（写在使用处）、同一条写进 Card 本身（漏到别的卡片）、循环里卡片的标题加按钮里的「Get started」（核不了的）。

**审查后修正（2026-11-04，3ab3c13、bafe4e8）**

代码审查（effort high）找到 5 条，都修了：

1. **假的漏改**：这一轮另有数据改动（删除、复制、移动循环里的一项）落在同一组件的另一个使用处时，记下的元素没了，按第几个实例找回来的是另一项，`done` 会说「its words from “Arrange” to “Apply”」，把 Agent 引去撤销正确的删除。改为：只改这一处的改字，不看这一轮有数据改动的使用处。样式改动照旧（见遗留风险第 2 条）。
2. **可能的虚假 ✓**：这一处的元素不在页面上时，`movedElementsOf` 会把同一位置上另一个使用处的元素当成挪过的它；那个使用处正好是新字时会报 ✓。改为：这一轮保存的画布上有、标记没动的其他使用处，不当成它（`placedOnCanvas` 读画布时一并记下，`ChangeOnCanvas.stayedPut`，不进改动单）；画布上没有的使用处（Agent 在使用处上方加了几行，组件本身没动）照旧当作它挪过，照常核对。这条对样式、删除、自由定位的核对同样生效；12 个没有改字的场景 `--dry` 输出逐字不变。画布原来只在这一轮有新建图层时才解析，现在有组件使用处里的改动也解析（每轮一次，有缓存）。
3. **剧本测试在机器忙时不稳**：等页面记下其他使用处时吞掉了超时。改为不吞，等 `.03kind/other-usages.json` 里有改动 1 的记录再改代码。
4. **`<br>`**：Agent 用 `<br/>` 写换行时，`textContent` 读成「HelloWorld」，对的也报没显示。`wordsOn` 把 `<br>` 读作一个空格（76 的新建文字比法也受益）。
5. **两处措辞**：见代定第 7、4 条（已是改后的说法）。

**`claim` / `done` / `finish` 改前改后（逐字）**

改前（2eb5a32），五个剧本的 `done` 都是：

```
Change 1 done: 1 of 1 change applied.
Not checked on the page: of the changes to the structure, only reorders, absolute placements in the same container and deletions are checked on the page. That is no error: go on.
```

核不了的那个剧本：

```
Changes 1 and 2 done: 2 of 2 changes applied.
Change 1: not checked on the page: of the changes to the structure, only reorders, absolute placements in the same container and deletions are checked on the page. That is no error: go on.
Change 2: not checked on the page: the text has no element of its own on the page. That is no error: go on.
```

`finish` 把改字都放 ✓（「Round finished: 1 of 1 change applied.」，加「1 the page cannot check: keep it under ✓ if you applied it exactly as asked; …」）。`claim` 的「How the page checks」：

```
- **How the page checks:** the page reads new words, not at all: `done` says Not checked, which is no error; say in the report what you did.
```

改后：

- `claim`，这一轮有改字：

```
- **How the page checks:** the page reads new words by the words in the layer, its bold runs, links and other pieces with it, white space as one space, in every instance. Where it does not show, `done` says what the page shows instead, and at which width: you need not look further for how it checks.
```

  有只改这一处的改字时，「in every instance」后面接「; new words for this usage only by the component's other usages too, which are to read as they did」。

- 写对：

```
Change 1 done: 1 of 1 change applied.
Checked on the page: it shows the change.
```

  `finish`：「Round finished: 1 of 1 change applied.」，放 ✓。

- 写错：

```
Change 1 done: 0 of 1 change applied.
Checked on the page: it does not show the change. The layer reads “Third Kind Studios” on the page, not “Third Kind Studio” as on the canvas: change its words in the JSX, or where they are given when they come from a prop or a variable, and run `npx 03kind done 1` again.
```

  `finish`：

```
Round finished: 0 of 1 change applied. The page does not show: 1.
⚠️ Not applied 1:1
- 1. Text: <the layer>
  Why: the layer reads “Third Kind Studios” on the page, not “Third Kind Studio”: <what keeps it so>
  Instead: <what you did, or “left as it was”>
```

- 只改这一处，写在使用处：「Checked on the page: it shows the change.」，放 ✓。
- 写进 Card 本身（漏改）：

```
Change 1 done: 0 of 1 change applied.
Checked on the page: it shows the change, but on another usage of Card too: Card used at `src/App.tsx:40:11`, inside App used at `src/main.tsx:8:5`, its words from “Freeze” to “Your move” since the round was claimed. The change is for this usage only (Scope): make it at the usage, put the other usage back as it was, and run `npx 03kind done 1` again.
```

  `finish`：「Round finished: 0 of 1 change applied. Shown at other usages of its component too: 1.」，Why：「the page shows it at another usage of Card too, Card used at `src/App.tsx:40:11`, its words from “Freeze” to “Your move”: <what keeps it so>」。

- 核不了的：

```
Changes 1 and 2 done: 2 of 2 changes applied.
Change 1: not checked on the page: the words come from the data the loop goes through, and the page cannot tell the loop's instances apart. That is no error: go on.
Change 2: not checked on the page: the text has no element of its own on the page. That is no error: go on.
```

  `claim` 的「How the page checks」：「the page reads a change to one of a loop's instances alone and a change to a layer the page cannot find, not at all: …」（「new words」从核不了的清单里拿掉，核不了的改字归进已有的名目）。

没有改字的 12 个场景：在 2eb5a32 和本线上各跑 `--dry`，`claim`、`done`、`finish`、再次 `claim` 共 48 个文件逐字相同；只有 `data-and-text`、`next-server-usage-text` 两个场景的改字那几行不同。

**包体积**（未压缩 / gzip -9，对比同步后的 main a74fbb5）

- 切换按钮：`react.dev.js` 1,423 / 822 B、`chunk-UQJRS7YD.js` 21,575 / 9,164 B，sha256 和 main 相同，逐字节不变。
- `editor.dev.js`：326,058 / 110,841 → 327,427 / 111,284 B（+1,369 / +443）。
- `cli.js`：135,372 / 38,047 → 136,305 / 38,268 B（+933 / +221）。

*代定的事（待设计师确认）*

我按「最贴近 76、77、80、82、84」代定的：

1. **`done` 没显示的说法**：「The layer reads “<页面上的字>” on the page, not “<画布上的字>” as on the canvas: change its words in the JSX, or where they are given when they come from a prop or a variable, and run `npx 03kind done N` again.」，接在「Checked on the page: it does not show the change.」后面。怎么改照 claim 里 Text 一条的写法。
2. **`finish` 的 Why 一行**：「the layer reads “<页面上的字>” on the page, not “<画布上的字>”: <what keeps it so>」。
3. **漏到别的使用处**：沿用 77 的整句，只把属性那一截换成「its words from “<原来的字>” to “<现在的字>”」。
4. **原因：字从数据里来**：「the words come from the data the loop goes through, and the page cannot tell the loop's instances apart」。
5. **原因：这一轮新建的图层上的改字**：「the layer is new this round: the page checks its words with the change that makes it (change N)」。编辑层把新建文字上打的字并进新建那条改动，这一句只在手写的改动单里出现。
6. **其余核不了的沿用已有原因**：一段字里的一截「the text has no element of its own on the page」；没有源码标记「the layer has no source marker, so the page cannot find it」；复制、拖回的「the layer is new this round, so the page has no marker to find it by」；上一轮新建的那句。
7. **`claim`「How the page checks」**：这一轮有改字时说一次「new words by the words in the layer, its bold runs, links and other pieces with it, white space as one space, in every instance」；有只改这一处的改字时再接「new words for this usage only by the component's other usages too, which are to read as they did」。
8. **核不了的清单里拿掉「new words」**：核不了的改字归进已有的名目（「a change to one of a loop's instances alone」「a change to a layer the page cannot find」「a change to a layer made this round」），不另起一项。
9. **改字只在窗口宽度看**：字不随宽度变，不为它在各视图宽度建副本。
10. **审查修正 2 对所有种类生效**：不只改字，样式、删除、自由定位在这一处的元素不在页面上时也不再拿另一个使用处的元素来顶（原来可能报虚假的 ✓），改为没能核对；没有改字的场景输出不变。

**遗留风险**

1. **数据里的删除、移动、复制仍说结构改动那句**：删除本来是核对的，数据删除说「only … deletions are checked」最容易误导。改它会改动没有改字的一轮的输出，不在这条线的范围里，建议另开 ticket（编号在 main 上给）。
2. **样式的「只改这一处」也可能有审查修正 1 那种假漏改**：同一轮在另一个使用处删了循环里的一项，按第几个实例找回来的是另一项；样式的值通常各实例一样，很少碰到，修正 1 只做了改字。
3. **字按 `textContent` 比**：`display: none` 的片段（例如响应式隐藏的 `<span>`）、`sr-only` 的字也算进去。设计师在画布上打字会把隐藏的片段覆盖掉，Agent 照留着隐藏片段写对了，会报没显示（不会报虚假的 ✓）。
4. **漏改只看当前页面上、窗口宽度的其他使用处**，同 77。
5. **只改这一处、Agent 把字写死进组件、而其他使用处原来就是同样的字**：那些使用处的字没变，比不出漏改。
6. **审查修正 2 的边界**：这一处挪了、另一个使用处同时也挪了（两处上方都加了行）时，照原来按挪得最少的找，一样近时找不到，答没能核对。
7. **画布解析的范围变大**：有组件使用处里改动的一轮，现在都会解析保存的画布（每轮一次，有缓存）；大页面的性能测试在全量里通过，没有单独测量台的数字。

**合并前全量（2026-11-04，指挥，同步 main a74fbb5 后的 58ad0c2）**

- `pnpm typecheck` 通过。
- `pnpm test`：vitest 34 个文件，897 passed、1 skipped；node 测试通过。
- `TK_E2E_PORT=5400 pnpm test:e2e`：page 组 287 passed、1 failed（`breakpoints.spec.ts:204` 的 Fill color 输入，已知不稳），单独重跑通过；「project files」组用 `--project="project files" --no-deps` 跑完，120 passed、1 skipped。
- `TK_BENCH_PORT=5440 node e2e/bench/run-agents.ts --scripted`：5 个有脚本的场景全过（`data-and-text`、`r18-style-variables`、`r18-phone-and-stack`、`next-server-usage-text`、`next-client-stack-breakpoint`），两个改字场景的改字都核为 shown。86 还没合进 main，它新加的场景合进来后要再跑一次 `--scripted`。
