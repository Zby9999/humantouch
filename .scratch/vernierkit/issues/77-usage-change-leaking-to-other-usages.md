# 77: 「只改这一处」的改动漏到组件的其他使用处时，页面查得出来

**What to build:** 设计师只改一个使用处的改动（没有推广到组件本身），Agent 可能直接写进组件本身，让组件的其他使用处也跟着变。现在 `done` 只看这一处，照样说显示了，报告里放在 ✓ 下。要改成：页面也看同一组件在当前页面上的其他使用处，发现这条改动要改的属性在那里也变了，就算没落地，并告诉 Agent 改到了哪一处、哪个属性从多少变成了多少，让它改回去。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0006、0013）。

**Blocked by:** 65（已完成）

**Status:** done

- [x] 认领时，页面记下同一组件在当前页面上其他使用处的值，只记这条改动参考样式里的那几个属性。之后代码一变，就看这些值有没有变。下面三种情况不查：
  - 其他使用处不在当前页面上；
  - 某个使用处这一轮自己也有改动，它自己那些改动要改的属性不算；
  - 组件本身这一轮有改动，那些属性不算。
- [x] 查出漏改时，这条改动算没落地：`done` 说这一处显示了，但也改到了组件的另一个使用处，给出那个使用处的位置，以及哪个属性从多少变成了多少；`finish` 的报告把它放在 ⚠️ 下；进度环不算它。
- [x] 剧本：一条「只改这一处」的改动，脚本扮演的 Agent 把它写进组件本身，组件的另一个使用处随之变了。基线：按现在的代码，`done` 说显示了，`finish` 放在 ✓ 下，发现率 0%。目标：发现率 100%，按上一条的方式说出来。
- [x] 同一剧本做对照：Agent 只改这一处（例如给组件加一个参数，只在这一处传），不误报，误报 0 次。
- [x] 推广过的改动（改组件本身）、不在组件里的图层、循环里的实例：前后行为不变，各有一个用例。
- [x] 认领期间页面核对的代价（docs/goals.md Robust，约 5000 个元素的页面，每次热更新）：不出现 long task。要查的元素变多了，前后各量一次。
- [x] 没有漏改的一轮，10 个测量台场景的 `claim`、`done`、`finish` 输出逐字不变；Agent 每轮读入的字数前后各量一次。
- [x] docs/goals.md 里虚假 ✓ 的定义改为：报告已落地，但页面上没生效，或者改到了作用范围以外。
- [x] 前后数字记在 Comments（docs/goals.md「度量」）；spec 的核对一节、ADR 0006 / 0013 随之更新。

## 背景

- 实例：ticket 67 Comments 里 Claude 的 fill-gap-brief #3。
  - 改动 2 是把循环里 3 张卡片（同一个使用处）的 gap 改成 12px。
  - Agent 改的是 `Card` 组件本身：`<article>` 加上 `flex flex-col ${gap}`，默认 `gap-2`，去掉 `<p>` 的 `mt-2`，这 3 张传 `gap="gap-3"`。
  - 第 4 张卡片是另一个使用处，因此也成了 flex。靠 `gap-2` 它看起来和原来一样，但已经不是 `display: block`。
  - 页面核对只看这一处的 3 张，`done` 说显示了。场景的页面预期「the fourth card is as it was」不成立，测量台按页面预期把它算作一次虚假的 ✓。
- 之后 65 补修五（c39f839）在 `claim` 的「How the page checks」里加了一句：改到范围外的元素，即使 `done` 说显示了也不行。c39f839 上两家各复测 30 次，60 次都没有改到范围外的元素。所以现在靠的是 Agent 读了说明照做，页面不兜底。
- 真实 Agent 上这种情况少见，真实 Agent 的数字很难看出前后差别，主要靠剧本测机制。

## 设计师决定（2026-11-01，分诊）

- **要做，只做简单的版本。** ADR 0013 定的是落地不靠 Agent 自觉，这里现在恰恰只靠 Agent 自觉；而且漏改是设计师最难自己发现的错误，另一个使用处在别的页面上时会悄悄进代码。
- **只查这条改动参考样式里的那几个属性。** 连带改掉的其他属性不查（例如 #3 那次第 4 张的 `display` 从 block 变成 flex）：全部样式都比，代价大，误报多。#3 那次第 4 张的 gap 也变了（从 `normal` 变成 8px），按这个口径查得出。
- **改前的值是认领时活页面上的值**，和 68 之后改前在认领时重读一致。
- **其他使用处不在当前页面上时不查。** 其他使用处或组件本身这一轮也有改动时，那些属性不算漏改。
- **查出来算没落地**，放在 ⚠️ 下，进度环不算，`done` 说清是哪个使用处的哪个属性。
- **虚假 ✓ 的定义扩为**「报告已落地，但页面上没生效，或者改到了作用范围以外」。
- **先只查「只改这一处」。** 其他作用范围（例如只改一个实例的数据改动）真出现了再说。

## Comments

**改名为 03Kind（2026-11-01，ticket 70 第三步）**：已查，无旧名（旧产品名、命令、包名、文件夹名和 vk 前缀，不分大小写地查过）。

**做了什么（起点 1e583b6；提交 c949655 实现和测试，本提交 Comments 和 Status）**

- 「只改这一处」的样式改动（改动说明的 Scope 写「This usage only」的那些，和 `writing-rules.ts` 同一个判断，`forOneUsage` 挪进了 `checkable.ts` 两边共用），页面开始核对这一轮时，先记下同一组件在当前页面上其他使用处这项属性的值（新模块 `client/elsewhere.ts`）：
  - 「其他使用处」：同一源码位置（组件里写这个图层的地方）、使用链不同的元素，每个实例都记（`page-elements.ts` 的 `otherUsagesOf`）。循环里同一个使用处的几个实例是同一处，不算。
  - 只记这条改动那项属性，按页面窗口的宽度，读法和核对一样（设计语言的值，例如间距、填充）。
  - 不记的：某个使用处这一轮自己也改了这项属性（同一属性，或参考样式里有相同的 CSS 属性）；组件本身这一轮也改了这项属性（推广过的改动）时，这条改动整个不查；其他使用处不在当前页面上的，自然没有可记的。
- 之后每次核对这条改动、它在图层上显示了时，再读这些元素：有一个变了，这条改动就算没显示（`page-checks.ts`）。认领后每次热更新的快速复查也看，所以先落地对、后来又写进组件本身，也会退回没显示，进度环随之减少。
- `done` 的说法（一处漏改）：「Checked on the page: it shows the change, but on another usage of Card too: Card used at `src/App.tsx:42:9`, inside App used at `src/main.tsx:8:5`, its fill from #FFFFFF to #FF0000 since the round was claimed. The change is for this usage only (Scope): make it at the usage, put the other usage back as it was, and run `npx 03kind done 1` again.」漏到几处时写「on 2 other usages of Card too」，逐处列出。
- `finish`：开头一行把它单列为「Shown at other usages of its component too: 1.」（不混进「The page does not show」）；报告里放 ⚠️，Why 先填好「the page shows it at another usage of Card too, Card used at `src/App.tsx:42:9`, its fill from #FFFFFF to #FF0000: <what keeps it so>」。归档里不算落地，进度环不算它。
- `claim` 再跑一次时按页面重读改前（68）的那段，碰到这种结果不拿它改改前（图层上显示的是改后的值）。
- 记下的值存在页面内存里。页面读回这一轮时（认领的推送到了以后会再读一次改动单，核对随之重开）沿用同一份，不重新记；这一轮不再被认领时丢掉（`EditorLayer.tsx`）。
- 文档：goals.md 虚假 ✓ 的定义改为「报告已落地，但页面上没生效，或者改到了作用范围以外」；spec「核对」加一条；ADR 0006、0013 各在 Consequences 加一条。

**实现中自己定的**

- 「参考样式里的那几个属性」按这条改动的那一项属性读，读法和核对一样（设计语言），不逐个比参考样式里的 CSS 属性。理由：把普通的流式布局改成 Stack 时，参考样式里带着 `display: flex`、`flex-direction`，设计师决定里点名 #3 那次第 4 张的 `display` 不查；按这个读法，#3 的间距读出来是从 0px 到 8px（浏览器原始值是 `normal` 到 8px），照样查得出。
- 只在页面窗口的宽度记、只在窗口宽度比；窗口宽度和记下时不同就不比（量不准，宁可不报）。所以只写在某个断点上的漏改（例如组件里加 `max-md:`），窗口不在那个范围时查不出。这是「只做简单的版本」的取舍，见风险。
- 记下的元素被重新画过（不在页面上了），按使用处和它是第几个实例重新找；源码标记也挪了、找不到，就不比，不报。
- 「某个使用处这一轮自己也有改动」按使用链认：那个使用处上这个组件写的任何图层，改了同一属性（或参考样式有相同 CSS 属性）都算。「组件本身这一轮有改动」按组件名认。
- `claim` 的 How the page checks 没有加句子：原来那句「an edit that also changes elements outside the scope is wrong, though `done` says it shows」作为对 Agent 的要求仍成立，漏改时 `done` 自己把情况和做法说全，不必让每轮的说明都变长。所以 10 个场景的 `claim` 逐字不变（含有「This usage only」的 4 个场景也不变）。
- 测试接缝照 spec「测试接缝」：主接缝（示例项目的剧本）、辅接缝 1（固定画布 + 活页面上的页面核对，`promote.browser.test.ts`），以及 `cli.test.ts` 的 `done` / `finish` 文字。
- e2e 里原来「脚本扮演的 Agent」把对循环卡片的改动直接写进 Card 组件，按 77 这正是漏改（第 4 张「Your turn」也变了），20 个测试因此失败。改成只改循环那一处：新加 `forTheLoopAlone`（`e2e/tests/project-files.ts`），把元素的 `className` 写成按标题区分第 4 张（`title === "Your turn" ? 原来的 : 改后的`），只动 Card 一个文件；Next 例子用 CSS Modules，加一个 `.loop` 类只给循环的卡片。涉及 applying-bench 的 8 个剧本、round.spec 7 个、react18-round、next-round 各 1 个。等 Card 恢复的检查同时改严（原来只看服务出的 Card 里还有原来的类名，按标题区分后那串类名还在，下一个测试会开在旧代码上）。剧本断言的指标（核对覆盖率、进度差、提示次数）没改。
- 新剧本里脚本 Agent 认领后先等页面看过一眼（checks.json 里有这条的结果）再改代码，和真实 Agent 读完说明才动手一样，见风险里的竞态。

**脚本剧本**（`e2e/tests/applying-bench.spec.ts` 新加「a change for one usage of the Card (ticket 77)」6 个；`TK_E2E_PORT=5600`；改前在 1e583b6 的产品代码上、不带 77 的断言跑；改后是最终那次全量 e2e 里的结果）

| 剧本 | 指标 | 改前 | 改后 |
|---|---|---|---|
| 循环卡片填红，Agent 写进 Card 本身（第 4 张也红） | `done` / 结果 | 「it shows the change」/ shown | 说出第 4 张（Card used at `src/App.tsx:42:9` …）、fill 从 #FFFFFF 到 #FF0000 / not shown |
| 同上 | `finish` 报告 / 进度环 / 归档算落地 | ✓ / 1 / [1] | ⚠️（Why 已填）/ 0 / [] |
| 循环卡片间距 12px，Agent 写进 Card，默认 `gap-2`（#3 的写法，第 4 张成了 flex、间距 8px） | `done` / 报告 / 进度环 | shown / ✓ / 1 | 说出第 4 张、gap 从 0px 到 8px / ⚠️ / 0 |
| 两个漏改剧本合计 | 发现率 | **0%**（0/2） | **100%**（2/2） |
| 对照：同样的间距，Agent 只给循环那一处传 `flex flex-col gap-3`（3 个实例都变，第 4 张不变） | 误报 | 0 | **0** |
| 对照：第 4 张填红，Agent 加一个 `fill` 参数、只在第 4 张传（循环的 3 张不变） | 误报 | 0 | **0** |
| 推广到 Card 本身的填充，Agent 写进 Card | 结果 / 报告 | shown / ✓ | shown / ✓（不变） |
| App 自己写的介绍段（不在组件里）半透明，Agent 写在 App 里 | 结果 / 报告 | shown / ✓ | shown / ✓（不变） |

- 「循环里的实例」用间距的对照剧本测：循环那一处的 3 个实例一起变，不算漏改。单元测试里另有：第 4 张自己也改了填充、组件本身也改了填充时不算漏改；先落地对、后来写进组件本身，页面看到后退回没显示（带 undone）；推广过的改动照旧。
- 两个漏改剧本里 Agent 读到的输出：`done` 80 → 384 / 375 字；`finish` 开头一行 38 → 85 字，⚠️ 一段 0 → 210 / 200 字（只在漏改时）。

**Agent 读到的输出**（`pnpm bench:agents --dry` 布置 10 个场景，接着跑 `done <全部>`、`finish`、再 `claim`，用不提交的补丁存下）

- 1e583b6 和 c949655 两份共 40 个文件（claim、done、finish、claim-again 各 10 份）逐字相同（`diff -r` 无输出）；1e583b6 这份也和合并时的 out-merged 逐字相同。dry 下没有 Agent 改代码，所以这就是「没有漏改的一轮」。
- 每轮读入的字数前后相同。claim 的字数：button-over-rule 4,838、cards-style 6,496、data-and-text 4,916、dissolve-place-frame 7,258、fill-gap-brief 6,869、phone-breakpoints 8,027、promote-and-grid 6,442、put-back-and-new-text 6,767、reorder-and-move 3,406、type-and-stack 6,149。其中 cards-style、data-and-text、fill-gap-brief、phone-breakpoints 4 个有「This usage only」的改动，claim 也没变（没加句子，见上）。

**性能**（`TK_PERF_PORT=5610 TK_PERF_HEADLESS=1`，5006 个元素的大页面，headless 只作前后比较）

| 认领期间每次热更新的核对 | 改前 1e583b6 | 改后 |
|---|---|---|
| 原有：96 张卡片的 3 条改动，最长一段（中位数 / 最差） | 13.2 / 14.3ms，自己的 long task 0 | 13.5 / 15.5ms，0 |
| 原有：96 张卡片里的新文字和它的字号 | 14.3 / 16.4ms，0 | 15.9 / 18.7ms，0 |
| 新加：第 1 张商品卡改成单独一处使用（测试里临时改 BigPage），3 条改动在它上面，热更新把改动写进组件本身，另一处使用的 95 张随之变了 | 9.5 / 11.7ms，0；每次热更新合计中位数 21.2ms；结束时进度环 3（漏改没查出） | 9.2 / 13.6ms，0；合计中位数 32.4ms；进度环 0（3 条都查出漏改） |

- 目标「每次热更新不出现 long task」达到；要查的元素多了 95 个 × 3 条，每次热更新合计多约 11ms，分在各片里，最长一片没超过 14ms。
- 全套性能测试（13 个）在 c949655 上都过（16:08–16:14，没睡过）：进入编辑模式中位数 136.0ms、再次进入 108.8ms，回到同一张画布 109.1 / 108.3ms；新加的那个在全套里是最长一段 11.4 / 14.3ms，0 个 long task。

**体积**（gzip）

| 口径 | 改前 | 改后 | 上限 |
|---|---|---|---|
| 发布的切换按钮（toggle-first.spec） | 9,990 B | 9,989 B | 10,240 B |
| 装进项目后 Vite 送给页面的（install.spec） | 10,152 B | 10,153 B | 10,240 B |
| 进入编辑模式才加载的 `editor.dev.js` | 106,929 B | 107,560 B（+631） | – |
| `cli.js` | 34,409 B | 34,889 B（+480） | – |

- 新代码在只有编辑模式加载的 `elsewhere.ts`、`page-checks.ts` 等；`service-protocol.ts` 只加了类型（编译后没有字节），两种口径的 ±1 B 是打包带来的，离上限仍约 87 B。

**测试**

- `pnpm typecheck` 通过。
- `pnpm test`：vitest 761 个通过、1 个跳过（新加 `promote.browser.test.ts` 6 个、`cli.test.ts` 3 个）；测量台和旧名检查的 node 测试 32 个通过。
- `TK_E2E_PORT=5600 pnpm test:e2e`：最终一次（15:59–16:06，没睡过）372 个通过、1 个跳过、2 个失败：`code-changes.spec.ts:181`「按着鼠标时」（已知偶发，78 的）和 applying-bench「the Agent sits still a long time between two changes」（停住提示在快进时钟后 5 秒内没出现，计时剧本在负载下的偶发，同类见决断 49）。两条各单独连跑 3 次都过。改测试前的第一次全量 20 个失败，就是上面说的脚本 Agent 漏改。
- 性能：「a claimed round」3 个在改前、改后都通过；全套 13 个在 c949655 上通过。

**风险和没做到的**

- 只看窗口宽度：只写在某个断点上的漏改（组件里加 `max-md:` 之类），窗口不在那个范围时查不出；其他视图宽度上的副本不记、不比。
- 记下的值只在页面内存里：认领后才打开页面、或认领期间刷新页面，按那时的页面重新记，之前已经写进去的漏改查不出（不会误报）。78 的自动认领也一样：Agent 没认领就把改动写进组件，页面认领时漏改已在页面上，查不出。
- 竞态：页面在收到认领推送后的第一眼才记（通常一两百毫秒内）。Agent 认领后几乎同时就改代码、热更新又先到，记下的就是改后的值，查不出。真实 Agent 读完说明才动手，间隔以秒计；脚本测试里会碰到，所以新剧本先等页面看过一眼。改测试前那次全量里两个漏改剧本就是这样漏掉的（后来把读回这一轮时沿用记下的值也加上了）。
- 只按使用链区分使用处：组件里一个元素被两个不同的外层组件用到（例如 Card 在 List 里，List 用了两处），算两处使用；推广是推到离图层最近的组件，和这个一致。
- 只看这一项属性：连带改掉的其他属性（例如 #3 第 4 张的 `display`）照设计师决定不查。继承来的属性：别的图层（不在同一使用处）这一轮的改动让其他使用处的这项属性变了，会被当成漏改；这种组合没在测试里出现。
- 漏改时 `done` 要等约 1.5 秒（等这条改动「显示」等到时限），和其他没显示的结果一样。
- e2e 里脚本 Agent 按标题区分第 4 张卡片，只为测试方便，不是推荐写法；新剧本里的对照用的是传参数的写法。

**整线审查补修（2026-11-02，起点 a28f0ca）**

- 命名统一成 other usages（和 GLOSSARY「使用处」一致）（e4638fb）：`client/elsewhere.ts` 改名 `client/other-usages.ts`；`looksElsewhere` → `looksAtOtherUsages`，`elsewhereNow` → `otherUsagesChanged`，记下的值 `OtherUsages` → `OtherUsagesNoted`；核对结果里的 `elsewhere` 字段 → `otherUsages`（类型 `Elsewhere` → `OtherUsageChanged`，`checks.json` 里的字段名随之改，Agent 不读它）；`design-values.ts` 的 `elsewhereWords` → `otherUsagesWords`，`cli.ts` 的 `shownElsewhere` → `shownAtOtherUsages`。
- 「`Card used at …`」的写法原来在 `design-values.ts`（77 加的）和 `change-notes.ts` 的 Scope 两处一共三份，现在共用 `usedAt` / `usagePlace`。
- 「这一处只按源码标记找图层」的条件改用 `checkable.ts` 共用的 `foundByMarker`，不再自己写一遍（bd600d4）。
- GLOSSARY「核对」补上：只改这一处的改动，还看组件在当前页面上的其他使用处（4609dd8）。
- Agent 读到的输出：10 个场景 40 份和 77 收尾时逐字相同。切换按钮：toggle-first.spec 9,989 → 9,992 B、install.spec 10,153 → 10,153 B（上限 10,240 B）；发布的切换按钮文件未压缩的字节数没变（共用 chunk 21,575 B、`react.dev.js` 1,423 B），差的 3 B 是共用 chunk 文件名的哈希和压缩器给的变量名变了。`editor.dev.js` 107,560 → 107,727 B（+167，主要是 78 补修 1 的放到画布上）。

## 设计师确认（2026-11-02）

指挥代定的事全部确认：只查这条改动改的那项属性，用设计语言的值读；没有漏改时 `claim` 的说明不加句子、输出逐字不变。查不出的几种情况见 ticket 82。
