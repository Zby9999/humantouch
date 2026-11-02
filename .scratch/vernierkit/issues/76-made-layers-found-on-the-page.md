# 76: 同一轮新建的图层，页面找得到并核对

**What to build:** 设计师在一轮里新建图层（New Frame、New text），Agent 把它写进代码以后，页面要按改动记下的位置，在活页面上找到对应的元素，然后像对页面原有的图层一样核对：
- 新建本身：在不在给的位置，标签对不对；新建文字还要核对字对不对。
- 这一轮对它做的样式改动，例如新画的 Frame 又填了色、改了圆角。

现在这些改动一律答 Not checked，算不算落地全凭 Agent 自己 `done`。Agent 写错了值，页面也发现不了。

上一轮新建、已落地的图层不在本 ticket 里找回。这种图层只在一轮没落地完、下一轮回到同一张画布时才会出现。本 ticket 只把对它的核对理由改对。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0006、0013）。

**Blocked by:** 68（已完成）

**Status:** done

- [x] 新建本身也核对。页面按新建改动记下的容器、第几个图层和开头标签，在活页面上找到 Agent 写的元素：
  - 在给的位置找到了，标签也对得上，新建文字的字也对得上，就算显示了；
  - 找不到时，如实说没在给的位置找到。
- [x] 这一轮对新建图层的样式改动，和页面原有的图层一样核对，不再因为「新建」答 Not checked。
- [x] 新建图层放在另一个新建图层里面时，也能一层层找到。
- [x] 找到好几个对得上的元素时：
  - 都出自源码的同一处（写在循环或组件里、页面上渲染了好几份），算同一个图层，照常核对；
  - 出自源码的不同地方，不猜，答 Not checked，说找到了几处对得上的，并列出它们的源码位置。
- [x] 找到的源码位置不写进改动单，也不写进画布；每次核对都按位置重新找。
- [x] 上一轮新建、已落地的图层：
  - 不做找回，`claim` 照旧给层级路径和开头标签；
  - 页面核对的理由改为说它是上一轮新建的、页面找不到它，不再说「the layer is new this round」。
- [x] 核对覆盖率：先加一个脚本剧本，内容是新建一个 Frame、再给它填色、改圆角；量出这类改动（包括新建本身）拿到核对结果的比例，改前应为 0%，改后要到 100%。
- [x] 1:1 落地率和虚假 ✓：用脚本剧本前后各量一次。真实 Agent 只跑有新建图层的两个场景（dissolve-place-frame、put-back-and-new-text），跑之前先问设计师。
- [x] 改写说明里写自由定位的那句。现在是「absolute in …, at X …px and Y …px from its top left (CSS `left` and `top`), which is to be its positioning reference (`position: relative`)」，"which" 指谁不清楚。改为写明容器是定位参照、`position: relative` 加在容器上，这个图层本身不加，例如「…from the Frame's top left; the Frame, not this layer, is the positioning reference: give the Frame `position: relative` if it has none」。用 dissolve-place-frame 的真实 Agent 前后对比，一并看 Claude 的报告格式合规：最终代码上是 28 / 30，两次不合规都出在新建 Frame 那条，其中一次就是因为这句歧义。
- [x] 没有新建图层、也没有自由定位的场景，`claim`、`done`、`finish` 的输出逐字不变；其余场景输出的变化逐条列在 Comments。
- [x] 认领期间页面核对不出现 long task（约 5000 个元素的页面，每次热更新）；切换按钮不超过 10,240 B。
- [x] 前后数字记在 Comments（docs/goals.md「度量」）；spec 的核对一节随之更新。

## 背景

- 来自 ticket 68 的 Comments。68「没做到的、留下的风险」第 5 条说，上一轮新建的图层页面找不到，核对的理由还写着「the layer is new this round」。设计师 2026-11-01 要开这张。
- 页面找图层靠源码标记（JSX 上的位置标记，加上组件的使用处链）。改动对新建的图层只记着「新建它的那条改动」，还有层级路径和开头标签，没有源码位置：Agent 写进代码之前，它还不在源码里。活页面上 Agent 写出的元素其实带着源码标记，缺的是从改动到这个元素的对应关系。
- 新建图层上的样式改动是一条一条单独记的，新建那条只记位置、尺寸、文字和生成说明。所以只要设计师在一轮里画了新东西又调了它，就会遇到这个问题，和 Agent 有没有落地完无关。
- 测量台现有的 10 个场景里，新建图层的改动只有 dissolve-place-frame 的 New Frame 和 put-back-and-new-text 的 New text，没有场景再对新建的图层做改动。

## 设计师决定（2026-11-01，分诊）

- **只做同一轮的那一半。** 画布只在一轮没落地完时才留到下一轮。正常情况下全部落地，下次进入编辑模式会从活页面重新冻结，Agent 写的元素就是带源码标记的普通图层。跨轮的情况要同时满足三个条件：那一轮没落地完，那一轮里新建的图层已落地，下一轮又去改它。这种情况很少，68 的兜底已经够用：`claim` 给层级路径和开头标签，Agent 自己去源码里找。这和设计师选 68 方案 B 的理由一致：Agent 是在源码里找图层，不靠画布。
- **页面按位置找。** 不让 Agent 在 `done` 时报位置，因为那样又要靠 Agent（ADR 0013）；也不往用户源码里加临时标记（ADR 0003，卸载后 git diff 为空）。
- **不记住找到的源码位置。** 改动单和画布都不存，每次核对重新找。
- **新建本身也核对。** 在给的位置找到它，就是在核对它。
- **找到好几个对得上的：** 出自源码同一处的算一个；出自不同地方的不猜。
- **自由定位那句并进本 ticket。** 起因是落地线遗留的 Claude 报告合规 28 / 30：dissolve-place-frame #1 把那句读成图层自己要同时是 absolute 和 relative。不单开 ticket，也不单独花额度复测，因为本 ticket 本来就要用真实 Agent 前后跑 dissolve-place-frame。另一句「the designer drew nothing in it」不动：只有 #3 一次可能和它有关，判断不了；而且它是 65 补修四专门加的，加之前两家 Agent 会去找根本不存在的草图（有一批绕路 274 秒），删掉可能把这个问题带回来。

## Comments

**改名为 03Kind（2026-11-01，ticket 70 第三步）**：已查，无旧名（旧产品名、命令、包名、文件夹名和 vk 前缀，不分大小写地查过）。


**做了什么（起点 05210e9；提交 65a5fa3 测量，d564476 实现，1220200 不比标签，1c81579 位置信息不存进改动单，c4d6fad 说明补一句，本提交 Comments 和 Status）**

- 页面能找到同一轮新建的图层（新建 Frame、新建文字）：按新建那条改动记下的位置，在活页面上找 Agent 写出的元素（`check.ts` 的 `findMade`）。
  - 容器：页面原有的按源码标记找；容器本身是同一轮新建的 Frame，就先按它自己的位置找到它，一层层往里。容器是这一轮复制、拖回、合成的 Stack，或没有源码标记的，不找，答没能核对并说明为什么。
  - 在容器排版里的：按它在画布上**现在**是容器的第几个图层找，并允许一个范围：它前面的图层里，有几个页面一定有，几个页面可能还有或还没有（这一轮删除、移动、新建的，和移出这个容器的）。所以设计师后来在它前面删了图层（put-back-and-new-text 就是：新文字在介绍段下面，介绍段随后挪出画布），Agent 按顺序落地到一半、或全部落地后，都找得到。
  - 自由定位的：容器里自由定位的元素都算位置对（Agent 常把它写成容器的第一个子元素，dissolve-place-frame 两家都是）。
  - 不比标签（指挥定，见下）：在给的位置上找到一个容器原来没有的元素就算，不论用什么元素写；新建文字还要字对得上（以最后打的字为准）。
  - 容器原有的图层不算：按它们在画布上的样子（标签加文字，和重排用的 `signOf` 一样，移出去的也算），同样子的元素有几个是原有的就扣掉几个。不然新 Frame 的位置上是一个原有的 `<div>` 时，会被当成它（测试里先就是这样错的）。
  - 这些位置信息（前面几个图层、原有图层的样子）是页面开始核对时从这一轮保存的画布 `.03kind/canvas.html` 上读出来的（`moves.ts` 的 `placedOnCanvas`），什么都不存（指挥定，见下）。没有新建图层的一轮不读画布。刷新页面、换浏览器、认领后才打开页面，都从保存的画布读，照样找得到。
  - 容器在循环或组件里、页面上渲染了好几份，每一份里都要找到；找到的元素出自源码同一处（源码标记的位置相同）算一个图层，每一份都核对；出自好几处不猜，答 Not checked：「3 elements at its place match it, written at 2 places in the source (`src/components/Card.tsx:7:9`, `src/components/Card.tsx:9:9`): the page does not guess which is the layer」。
  - 找到的源码位置不存，每次核对都重新找。
- 新建本身也核对：找到就算显示了；自由定位的还要在容器里自由定位（容器是定位参照），画在设计师最后给的 X / Y。找不到算**没显示**，`done` 说找的是什么、那里现在是什么，例如「The page does not have the new text, reading “Works with any Agent.”, as the 2nd or 3rd layer of Stack (`<section …>`): it has <p class="mt-4 text-stone-600"> reading “A Framer-style editor layer for any page.” there. Write the new layer there, as the notes say, and run `npx 03kind done 2` again.」。`finish` 把它放 ⚠️，Why 写「the page does not have it where the change puts it」（和移动一样，原来会把对象直接打成 JSON）。
- 这一轮对新建图层的样式改动照常核对（在找到的元素上，每一份都看，断点改动按它自己的断点）。新建图层没找到时，样式改动答没能核对：「the layer is new this round, and not at its place on the page (change 1)」，没显示的结论在新建那条上。对新建图层的移动等结构改动照旧不核对，理由写「of the changes to a layer made this round, the page checks only the layer itself and its styles」。
- 上一轮新建、已落地的图层：不找回，`claim` 照旧（Location 写 Made in a round before，给层级路径和开头标签）。核对理由由「the layer is new this round, so the page has no marker to find it by」改为「the layer was made in a round before, and the page cannot find it: the canvas has no source marker for it」；How the page checks 里单列为「a change to a layer made in a round before, not at all」。这一轮复制、拖回的图层理由不变。
- 能不能核对仍是同源的：`checkable(change, round)` 现在要整轮的改动（找新建它的那条），`check.ts`、`writing-rules.ts`、`page-checks.ts` 都传整轮；`claim` 再跑一次只给没落地的改动时也按整轮判断。绑定测试加了 5 种：容器有源码标记的新 Frame、它上面的样式改动、新 Frame 里的新 Frame、复制出的图层上的样式改动、复制出的图层里的新 Frame。
- How the page checks：有页面能找到的新建图层时加一句「a new layer, and so the changes to it, by finding it where its section puts it, of whatever element: that layer of its container, counted with this round's other changes applied or not, one the container did not have before, new text with its words, or, placed absolute, one placed absolute in the container at the X and Y given; found written at more than one place in the source, it is not checked」。不能核对的种类里「a new layer」拆成「a new layer in a container the page cannot find」和「a layer put back」（拖回照旧不核对）。
- 自由定位那句（`change-notes.ts` 的 `placement`，新建、复制、拖回用）：由「…at X 40px and Y 60px from its top left (CSS `left` and `top`), which is to be its positioning reference (`position: relative`)」改为「…at X 40px and Y 60px from the container's top left (CSS `left` and `top`); the container, not this layer, is the positioning reference: give the container `position: relative` if it has none」。只改了这一句。
- spec 的核对、留到下一轮、改动单内容、改动说明四处随之改了。ADR 0013 里「上一轮 Agent 新建的图层在页面上还找不到，核对说没能核对」和实现一致（跨轮的不找回），没动。

**指挥定的（2026-11-02）**

- **不比标签。** 我原来按「标签也对得上」严格比（Frame 是 `<div>`、文字是 `<p>`，并在说明里告诉 Agent）。指挥改为不比：改前 12 次里 Cursor dissolve-place-frame 有 2 次新 Frame 没写 `<div>`（`<ul>` 等）；GLOSSARY 里 Frame 明说不是 Div；画布上的 `<div>`、`<p>` 是编辑层的做法，不是设计意图，逼 Agent 改成 `<div>` 会让代码变差。验收里「标签也对得上」按此解释：Frame 不比标签，文字比字。测试覆盖 Frame 写成 `<ul>`、`<section>`，文字写成 `<h2>`、`<span>` 都算显示了，原有的 `<div>` 不会被当成新 Frame。
- **位置信息不存进改动单。** 1220200 把这些信息存在 `changeset.json` 的 create 改动里（`among`）。Cursor 常读改动单，读到 among 看不懂，就去包里翻代码：1220200 的 put-back 三次转录里 among 出现 9、15、47 次，读包 7、83、67 次（改前 0 次），claim→finish 中位数从 112.55 秒变成 150.84 秒。指挥定把它移出 Agent 会读的改动单；现在由页面从保存的画布上读，不存任何文件。

**实现中自己定的**

- 「第几个图层」按画布现在的样子算，并允许一个范围，不按新建那一刻记下的 `nth`：按 `nth`，put-back-and-new-text 全部落地后新文字是第 2 个、`nth` 说第 3 个，会误报没显示。说明里也写明「counted with this round's other changes applied or not」（c4d6fad，见下面中间版本的绕路）。
- 自由定位的新建图层不看它在子元素里的顺序（画上去没有顺序），只看自由定位、定位参照和 X / Y；尺寸不核对（ticket 只要位置、标签、字；之后改的尺寸有自己的样式改动）。
- 在排版里的新建图层只在页面窗口宽度看；自由定位的和移动成自由定位一样，每个视图宽度都看位置。
- 新建图层找不到时，对它的样式改动答没能核对而不是没显示：没显示的结论已经在新建那条上。
- 「源码同一处」按元素自己的源码标记位置比，不比使用链：写在组件里、被不同地方用到渲染出的几份，也算同一处（ticket 写的「写在循环或组件里」）。
- 自由定位那句用「the container」而不是例句里的「the Frame」：这句也用在 Stack 里的自由定位（复制到 Stack 里等），写 the Frame 会和前面的「absolute in Stack (…)」对不上。
- 编辑模式里没认领时的自动认领（78 的情况 1）判断「页面显示出画布上的某条改动」时，用的是编辑中的改动，没有从画布读位置，新建图层按记下的 `nth` 找，偏向不自动认领。

**脚本剧本**（`e2e/tests/applying-bench.spec.ts`，`TK_E2E_PORT=5600`；改前在 05210e9 的产品代码上、不带 76 的断言跑；最终结果是 c4d6fad 上全量 e2e 里的那次）

| 剧本 | 指标 | 改前 | 改后 |
|---|---|---|---|
| 新建 Frame（hero 排版里，介绍段下面）、填红、圆角 4px，按说明落地，每条后 `done` | 核对覆盖率（三条有核对结果的比例） | **0%**（三条都 Not checked） | **100%** |
| 同上 | 页面核对显示 | 0/3 | 3/3 |
| 同上，Agent 把圆角写成 8px | 虚假 ✓（报告里 ✓ 但页面没显示） | **1**（3 在 ✓ 下） | **0**（3 在 ⚠️ 下，done 说「The corner radius is 8px, not 4px」） |
| 同上 | 归档里算落地的 | [1, 2, 3]（圆角错也算） | [1, 2] |
| 新 Frame 里再画一个 Frame（自由定位），填红，Agent 写成一个套一个 | 核对覆盖率 / 显示 | 0% / 0/3 | 100% / 3/3 |
| 在循环里的卡片里画新文字，Agent 写进 Card 一处（页面渲染 3 份） | 结果 | Not checked | shown |
| 同上，Agent 写在 Card 的两处（三元表达式两个分支） | 结果 | Not checked（理由是「结构改动不核对」） | Not checked，说「3 elements at its place match it, written at 2 places in the source (…Card.tsx:7:9, …Card.tsx:9:9)」 |
| 新文字在介绍段下面、介绍段随后挪出画布；认领后关掉设计师的页面，另开一个浏览器上下文打开页面 | 删除落地前 / 落地后 | – | shown / shown |

- 1:1 落地率按 `done` 核对：落地对的剧本 3/3；写错的剧本 2/3，和页面一致（改前按 done 算是 3/3，其中一条是错的）。
- 其他剧本（照流程、跳过 done、攒 done、半途退出、停很久、68 的四个、78 的四个）没改预期，c4d6fad 上照常通过。

**Agent 读到的输出**（`pnpm bench:agents --dry` 布置 10 个场景，接着跑 `done <全部>`、`finish`、再 `claim`，用一个不提交的补丁存下）

- 没有新建图层、也没有自由定位的 8 个场景：claim、done、finish、claim-again 共 32 份，c4d6fad 和 05210e9 逐字相同。
- 10 个场景存下的 `changeset.json` 里都没有 among。
- dissolve-place-frame（新 Frame，自由定位）：
  - claim 6,834 → 7,283 字：自由定位那句改写；How the page checks 加新建图层那句；「a new layer and a Stack made or dissolved, not at all」变为只剩「a Stack made or dissolved」。
  - done 714 → 788 字：新 Frame 由「not checked … only reorders, absolute placements … are checked」变为「does not show … The page does not have the new Frame placed absolute in Frame (…)」（dry 下没人落地）。
  - finish 1,002 → 1,104 字：新 Frame 从 ✓ 移到 ⚠️，Why 一行；「1 and 3 the page cannot check」变为「1 the page cannot check」。
- put-back-and-new-text（新文字在排版里）：
  - claim 6,375 → 6,781 字：How the page checks 加新建图层那句；「a new layer, not at all」变为「a layer put back, not at all」。
  - done 625 → 846 字：新文字变为没显示，说出范围（第 2 或第 3 个）和那里现在的介绍段。
  - finish 983 → 1,085 字：同上。
- 两个场景的 claim-again 变长，是因为 dry 下新建那条没显示、留到了下一轮（3,676 → 5,577，2,400 → 3,726 字）。

**真实 Agent**（两家版本、模型三批一致：Claude Code 2.1.309 + claude-sonnet-5-5 effort high；Cursor 2026.10.22-27dcf5f + Grok 4.7 256K High；场景 dissolve-place-frame、put-back-and-new-text 各 3 次；数字是中位数（范围），都用 76 之后的场景定义重算 summary，新建那条算页面能核对的）

| 指标 | Claude 改前 05210e9 | Claude 中间 1220200 | **Claude 最终 c4d6fad** | Cursor 改前 05210e9 | Cursor 中间 1220200 | **Cursor 最终 c4d6fad** |
|---|---|---|---|---|---|---|
| claim→finish（秒） | 23.31（12.06–30.89） | 20.01（13.88–27.94） | **26.11**（11.71–36.13） | 112.55（76.33–141.51） | 150.84（98.78–291.72） | **124.74**（96.46–175.33） |
| 每条用时（秒） | 7.77 | 6.67 | **8.7** | 37.52 | 50.28 | **41.58** |
| 每条工具调用 | 3.5 | 3 | **3** | 4.83 | 6.67 | **5.67** |
| 全仓搜索 | 0.5 | 0.5 | **0** | 3 | 5.5 | **4** |
| 读 node_modules/03kind | 0 | 0 | **0** | 0 | 1（0–16） | **0**（0–7） |
| 读入字数：claim 输出 | 6,584 | 6,955.5 | **7,011.5** | 6,585 | 6,956.5 | **7,012.5** |
| 读入字数：全部工具输出 | 14,795 | 14,723.5 | **15,400.5** | 59,348 | 40,219 | **54,256.5** |
| 1:1（页面预期） | 6/6 | 6/6 | **6/6** | 6/6 | 6/6 | **6/6** |
| 1:1（done 核对） | 0.5（新建那条不核对） | 1 | **1** | 0.5 | 1 | **1** |
| 新建那条核对为显示了 | 0/6（不核对） | 6/6 | **6/6** | 0/6 | 6/6 | **6/6** |
| 新 Frame 被判没显示 | – | 0 | **0** | – | 0 | **0** |
| 虚假 ✓ | 0 | 0 | **0** | 0 | 0 | **0** |
| 报告格式合规 | 4/6 | 5/6 | **6/6** | 6/6 | 6/6 | **6/6** |
| stalledNotices / unclaimedNotices | 0 / 0 | 0 / 0 | **0 / 0** | 0 / 0 | 0 / 0 | **0 / 0** |

- Claude 改前 2 次不合规都是 dissolve-place-frame 的新 Frame 同时列在 ✓ 和 ⚠️ 下，原因是 logo 用了占位文字，不是自由定位那句的歧义；中间那次不合规是 put-back 新文字没写死 649.5px 宽度，同样和 76 无关；最终 6/6。决断 51 说的那次歧义（把 position 两种都写）在三批 18 次 dissolve 里没再出现。
- 每次运行在转录里数了 among / changeset.json / node_modules/03kind 出现的次数（字符串出现次数，不是读包次数）：
  - 改前 Cursor：among 都是 0；changeset.json 7、0、0、0、5、5；node_modules/03kind 34（dissolve #1，glob 的输出）、其余 0。
  - 中间 1220200 Cursor：dissolve 三次 among 0、0、3；put-back 三次 among 9、15、47，node_modules/03kind 7、83、67。Claude 六次全是 0。
  - 最终 c4d6fad：Claude 六次全是 0。Cursor dissolve 三次 among 0、node_modules/03kind 0；put-back 三次 among 2、0、0，changeset.json 6、5、5，node_modules/03kind 32、0、0。
- **最终那轮还剩 1 次 76 引起的绕路：** Cursor put-back #1，认领后马上在包里搜「3rd layer|layerIndex|nth」，再读 cli.js、搜 nth / slot，还用 node 去拆 canvas.html，读包 7 次，27 次工具调用，claim→finish 175.33 秒（其余五次 96–141 秒）。起因是说明写新文字放在「as its 3rd layer」，而下一条改动把它前面的介绍段删了，它想弄清页面怎么数。按指挥的判定（6 次里 0 或 1 次就收下），记在风险里。
- **中间版本 1c81579 只重跑了 Cursor**（among 已移出改动单，Claude 读到的输出不变）：有效 4 次，claim→finish 162.4、184.3、131.3、1162.5 秒，1:1 都是 100%，合规 4/4。put-back #3 仍去包里读了 11 次，读的是「第几个怎么算」，所以加了 c4d6fad 那一句。1162.5 秒是被睡眠放大的（见下）。
- 结果目录：改前 `bench-results/agents/2026-11-02-before-05210e9/`；中间 `2026-11-02-after-1220200/`、`2026-11-02-after-1c81579-cursor/`；最终 `2026-11-02-after-c4d6fad/`；作废的严格标签那轮 `2026-11-02-strict-tags-voided-d564476/`。
- **作废的运行：**
  - 改前那轮 Cursor put-back #1 一次：我把 `--out` 写成相对路径，Cursor 的插件目录找不到，9 秒就退出。改用绝对路径后补跑。
  - 严格标签那一轮 12 次（d564476）：指挥改了设计（不比标签），整轮作废，不进对比。照实记一下：1:1 12/12，合规 12/12，新 Frame 6 次都写成 `<div>`、新文字 6 次都写成 `<p>`，没有一次因为要求 `<div>` 改写；Cursor put-back #1 为 among 读包 62 次。
  - 1c81579 那批 Cursor 的 put-back #2、dissolve #3 两次：上次我写成「Cursor 连接卡住」，**更正**：是这台 Mac 在 02:55:43 合盖进入 Clamshell Sleep，之后一直「睡约 15 分钟、醒 1–3 分钟」，转录里的 reconnecting 和 20 分钟超时都是睡眠造成的，不是 Cursor 的问题。dissolve #2 在 finish 之后卡了 15 分钟，只用它的 claim→finish。
  - 最终那轮 12 次在 14:19–14:41 跑完，没有作废，`pmset -g log` 这段时间里没有 Sleep / Wake；转录里没有 reconnecting。改前那轮（00:30–00:52）和 1220200 那轮（02:02–02:29）都在合盖之前。
- headedBrowsers 全部为空。78 的两个 toast 测量台在真实 Agent 运行里不记录；最终那轮 12 次都是先认领再改源码，toast 没有机会出现。

**性能**（`TK_PERF_PORT=5610 TK_PERF_HEADLESS=1`，约 5000 个元素的大页面，headless 只作前后比较；c4d6fad 相对 1c81579 只改了一句说明文字，用 1c81579 上量的数）

| 认领期间每次热更新的核对 | 改前 05210e9 | 改后 |
|---|---|---|
| 原有：96 张卡片的 3 条改动，最长一段（中位数 / 最差） | 11.7 / 14.2ms（另一次 14.0 / 29.0ms），自己的 long task 0 | 13.8 / 15.4ms，自己的 long task 0 |
| 新加：96 张卡片里的新文字和它的字号（含认领时从保存的画布读位置） | 页面不看这两条（0 次） | 14.1 / 16.1ms，自己的 long task 0，认领时也没有 |

- 全套性能测试（12 个）都过过；进入编辑模式、回到同一张画布、拖拽、拖控制点和改前在同一水平。

**体积**（gzip）

| 口径 | 改前 | 改后 | 上限 |
|---|---|---|---|
| 发布的切换按钮（toggle-first.spec） | 9,990 B | 9,990 B | 10,240 B |
| 装进项目后 Vite 送给页面的（install.spec） | 10,155 B | 10,154 B | 10,240 B |
| 进入编辑模式才加载的 `editor.dev.js` | 104,325 B | 105,769 B（+1,444） | – |
| `cli.js` | 32,792 B | 33,548 B（+756） | – |

- 切换按钮的文件没变；service-protocol.ts 只改了一行注释。

**测试**

- `pnpm typecheck` 通过。
- `pnpm test`：vitest 737 个通过、1 个跳过；测量台和旧名检查的 node 测试 32 个通过。新加的有 `edits.browser.test.ts`「layers made this round are found on the live page at their place, and checked there (ticket 76)」8 个，`cli.test.ts` 绑定测试 5 种和「claim and done, layers made this round found on the page (ticket 76)」5 个。
- `TK_E2E_PORT=5600 pnpm test:e2e`：c4d6fad 上 355 个通过、1 个跳过（14:12–14:18，没睡过）。
- 偶发：`code-changes.spec.ts:181`「a press held as the page changes ends first…」有一次全量里失败（5 秒内没等到 page-changed toast）。整个文件连跑 3 遍，在 05210e9 的源码上同样失败 1 次，单独连跑 6 次都过，是 78 的问题，整线审查时另查。合盖睡眠期间的几次 e2e（views.spec 等一跑 15 分钟）不算，c4d6fad 在醒着时重跑全过。
- 性能：「a claimed round」两个测试在 1c81579 上通过。

**风险和没做到的**

- Cursor 在 put-back 里仍可能为「第几个图层」去包里翻代码：最终 6 次里 1 次（读包 7 次，比其余几次慢约 40 秒），起因是说明给的「3rd layer」和后面的删除改动之间的落差。c4d6fad 那句「counted with this round's other changes applied or not」后从 1c81579 的 1/4 次降到 1/6 次，没有归零。
- Claude 最终 claim→finish 中位数 26.11 秒，比改前 23.31 秒多约 12%，范围重叠（11.71–36.13 比 12.06–30.89），n=6，中间版本是 20.01 秒，看作噪声，没再追。
- 不比标签以后，Frame 的身份只靠位置和「容器原来没有」：容器原有的同样子（标签加文字）元素被这一轮改过字、又落地了，可能被当成候选；在几个候选里出自同一处源码的会被当成同一个图层。
- 一轮里在新建图层前面、还没落地的结构改动多时，找的范围会宽一些，在范围里位置稍错也算对。
- 自动认领（78）判断新建图层时用记下的 `nth`，没从画布读位置；在它前面删过图层的情况下，Agent 没认领就落地新建图层，不会触发自动认领（会走情况 3 / 4 的 toast）。
- 新建 Frame 的尺寸不核对。

**整线审查补修（2026-11-02，起点 a28f0ca）**

- 同源（bd600d4）：「能不能找到同一轮新建的图层、它所在的容器」（`checkable.ts` 的 `madeLayer` / `findable`）和「为什么找不到」（`check.ts` 的 `madeUnfound` / `containerUnfound`）是同一个递归写了两份。现在只有 `checkable.ts` 的 `whereMade` 走一遍，找到时给出新建它的改动和位置，找不到时说是图层本身（上一轮新建 / 不是新建文字或 Frame）还是容器（没有源码标记 / 上一轮新建 / 不是新建出来的）；`checkable` 和 `check.ts` 的理由都从它推出，不会再分叉。「这个图层按源码标记找」也只写一处（`foundByMarker`），`checkable` 和 77 的其他使用处都用它。理由文字逐字没变。
- `RoundOnCanvas`（78 的补修 1）：`among` 不再挂在会存进 `changeset.json` 的 `Change` 类型上，只在「放到画布上的一轮」里有；核对只收这种一轮。改动单本来就不存它，这是让「没放到画布上就核对」写不出来。测试里核对一条孤立的改动时用 `placedOnCanvas(round, "")`（没有新建图层，不读画布）。
- `done` 说新建图层不在位置上时的容器名，改用改动说明自己的 `container()`（加了 `located` 参数，`false` 时只给名字和开头标签，和原来 `cli.ts` 自己拼的一样）（e4638fb）。
- 绑定测试（「How the page checks 说能核对，正好就是页面能核对的」）补了 75 的 `right`、`bottom` 两种：一种所有宽度、一种断点上（3bbe140）。
- Agent 读到的输出：10 个场景 `pnpm bench:agents --dry`，接着 `done <全部>`、`finish`、再 `claim`，40 份和 77 收尾时（a28f0ca）逐字相同（`diff -r` 无输出）。

## 设计师确认（2026-11-02）

指挥代定的事全部确认：新建的 Frame 不比标签，Agent 写成 `<section>`、`<ul>` 都算；新建文字比字，不比标签。位置信息不存进改动单，由页面从画布现场算；说明里那句「counted with this round's other changes applied or not」之后不再为措辞迭代。Cursor 在 put-back-and-new-text 变慢，见 ticket 81。
