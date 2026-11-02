# 81: 76 之后 Cursor 落地 put-back-and-new-text 变慢

**What to build:** 设计师定了要追（见下面「设计师决定」）。ticket 76 让页面能找到并核对这一轮新建的图层（核对覆盖率 0% → 100%，剧本里的虚假 ✓ 1 → 0），也因此在 `claim` 的说明里多写了新建图层放在哪里、页面怎么数。之后 Cursor 落地 put-back-and-new-text 这个场景，3 次都比 76 之前慢；同一批里 dissolve-place-frame 反而变快，Claude 两个场景前后范围重叠。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准（「度量」「Robust」的整轮用时、读入字数），用词以 GLOSSARY.md 为准。

**Blocked by:** 76（已完成）

**Status:** done

- [x] `claim` 的说明里，这一轮新建图层的位置直接写成这一轮所有改动都落地之后的位置（容器里的第几个），Agent 不必自己推算落地前后；页面核对新建图层的做法照旧
- [x] 前后对比用 main 上改前的代码和改后的代码，同一 Agent、同一模型：put-back-and-new-text 的 Claude、Cursor 各跑 5 次；dissolve-place-frame 各跑 3 次。记 claim→finish 用时、读 03kind 包的次数、全仓搜索次数、`claim` 读入的字数，以及 1:1 落地率和报告合规
- [x] 改后 put-back-and-new-text 的 Cursor 用时中位数不慢于改前，读包次数下降；dissolve-place-frame 和 Claude 不变差；1:1 落地率和报告合规不下降（Claude 报告合规 8/8 → 7/8：那次不合规出在说明逐字没变的 dissolve-place-frame，不是这次改动引起的，见 Comments，请设计师确认）
- [x] 没有新建图层的场景，`claim`、`done`、`finish` 的输出逐字不变
- [x] 跑真实 Agent 前先问设计师，说明总次数（约 32 次）（设计师已同意 32 次，由指挥转达）
- [x] 前后数字记在 Comments

## 背景

- 数字来自 76 的 Comments（2026-11-02，Cursor agent-cli 2026.10.22-27dcf5f，Grok 4.7 256K High）：
  - put-back-and-new-text：claim→finish 76 / 80 / 114 秒 → 121 / 141 / 175 秒，3 次都慢。
  - dissolve-place-frame：111 / 125 / 142 秒 → 97 / 104 / 128 秒，变快。
  - Cursor 总中位数 112.55 → 124.74 秒（+11%）；Claude 23.31 → 26.11 秒，范围重叠。
- 最慢的那次（175 秒）读了 03kind 包里的代码 7 次，想弄清新建文字算「容器里的第几个」：说明写「as its 3rd layer」，下一条改动又删掉了它前面的段落，Agent 弄不清页面按落地前还是落地后数。76 已在 How the page checks 加了「counted with this round's other changes applied or not」，最后一轮 3 次里仍有 1 次这样绕路。
- 可能的方向：说明里新建图层的位置直接写成这一轮其他改动落地后的位置，Agent 不必自己推算。
- 有新建图层的场景，`claim` 读入字数长了 6–7%（6,834 → 7,283、6,375 → 6,781 字）。

## 设计师决定（2026-11-02，分诊）

- 追，做法是说明里直接写这一轮所有改动落地后的位置。3 次全都比 76 之前慢，最慢那次绕路的原因说得清，不太像波动；这样写对 Claude 也没坏处。
- 不先回头确认 76 之前是不是真的更快（76 不会退回去），直接拿 main 上改前、改后的代码比。
- 排在 80 之后做，不急。

## Comments

**做了什么（起点 b9938dd；提交 aa51f8a 实现，本提交 Comments 和 Status）**

- `claim` 的说明里，新建文字、新建 Frame 在容器排版里的位置，改为这一轮所有改动都落地之后它是容器的第几个（`change-notes.ts` 的 `landed`）：从新建时记下的 `nth` 起，按这一轮之后的改动在同一个容器里、在它前面拿走的图层（删除、挪出画布、移走、合成 Stack 带走的）减去，放进来的（移入、新建、复制、拖回、合成的 Stack）加上，每条按它自己记下的位置算。改动单里的 `nth` 不变，页面核对新建图层的做法照旧（按画布现在的样子、允许一个范围）。
- 这一轮还有别的改动给同一个容器的排版加、减或挪动图层（在它之前或之后都算）时，位置后面加一句「, once all of this round's changes are applied」；没有别的改动时只写第几个，和原来逐字相同。
- put-back-and-new-text 的新文字：「as its 3rd layer」→「as its 2nd layer, once all of this round's changes are applied」。
- Grid 的第几格同样按落地后算（「as its 2nd layer: the Grid's 2nd cell, once all of this round's changes are applied」）；带生成说明的新 Frame 的草图里，新建的图层也写落地后的位置（草图本来就写「设计师最后留下的样子」）。
- 这些情况照旧写新建时的位置、不加那句：设计师之后自己移动了这个新图层（它有自己的移动改动，说从第几到第几）、把它合成进 Stack、解散了它的容器；新建图层是自由定位的（dissolve-place-frame 就是，不涉及第几个）。
- spec「改动说明」一节加了一条（ticket 81）。
- 测试：`cli.test.ts`「claim, a new layer's place once the round is applied (ticket 81)」7 个（后面删掉它前面的图层；后面移入、合成 Stack；只在它之后或之前有改动；容器没有别的排版改动时不变；它自己后来被移动时不变；Grid；草图）。原有一个测试的预期跟着变了：同一个 Stack 里先新建 Frame（第 4 个）、后在第 2 个新建文字，Frame 落地后是第 5 个，两条都加那句。

**实现中自己定的**

- 那句话只在容器排版这一轮还有别的改动时加，不是每个新建图层都加：没有别的改动时「第几个」落地前后一样，不必多读几个字，原有说明和测试也不动。
- 用「once all of this round's changes are applied」，不改 How the page checks 里那句「counted with this round's other changes applied or not」（设计师在 76 确认那句不再为措辞迭代；它说的是页面怎么找，允许落地到一半，和说明给的落地后位置不矛盾）。
- 只改新建文字和新建 Frame（ticket 说的「新建图层」，和 76 一致）。复制、拖回、合成的 Stack 的位置照旧写记下时的第几个：它们没有和 76 一样的「页面按位置找」的说法，也不在这次测量的问题里；改它们会让没有新建图层的场景（例如复制）的输出变，违反「逐字不变」。
- 用改动单本身推算落地后的位置，不读保存的画布：CLI 在 Node 里，没有 DOM，读 canvas.html 要加解析依赖；改动单里每条结构改动都记着容器和第几个，够推。

**Agent 读到的输出**（`pnpm bench:agents --dry` 布置 10 个场景，接着跑 `done <全部>`、`finish`、再 `claim`，用一个不提交的补丁存下，和 76 一样）

- 40 份里 38 份 b9938dd 和 aa51f8a 逐字相同（`diff` 无输出），包括 dissolve-place-frame 的 4 份（新 Frame 是自由定位的）和 8 个没有新建图层的场景的 32 份。
- put-back-and-new-text：claim 6,781 → 6,827 字（+46，只有新文字那条设计意图一句：「as its 3rd layer.」→「as its 2nd layer, once all of this round's changes are applied.」）；claim-again 3,726 → 3,772 字（dry 下新文字没落地、留到下一轮，同一句）；done 846、finish 1,085 字不变。

**真实 Agent**（设计师同意的 32 次，一次不多：put-back-and-new-text 两家各 5 次、dissolve-place-frame 两家各 3 次，改前、改后两个版本。版本、模型和 76 一样：Claude Code 2.1.309（桌面 app 自带）+ claude-sonnet-5-5 effort high；Cursor agent-cli 2026.10.22-27dcf5f + Grok 4.7 256K High。改前在 b9938dd 的临时 worktree 里 build 和跑，用完已删。每次只跑一次 Agent，改前、改后交替：第 1、3、5 轮先改前，第 2、4 轮先改后。19:44–20:45 跑完，32 次都正常结束，没有作废、没有补跑。数字是中位数（范围）。）

| 指标 | Claude 改前 b9938dd | **Claude 改后 aa51f8a** | Cursor 改前 b9938dd | **Cursor 改后 aa51f8a** |
|---|---|---|---|---|
| put-back claim→finish（秒，5 次） | 17.69（14.89–23.36） | **18.28**（10.22–27.35） | 124.72（105.72–304.19） | **68.49**（61.6–76.04） |
| put-back 每次（秒） | 19.04、15.94、14.89、17.69、23.36 | 20.34、16.59、10.22、18.28、27.35 | 304.19、124.72、105.72、110.26、225.96 | 68.49、61.6、75.52、64.72、76.04 |
| put-back 读 node_modules/03kind（每次） | 0、0、0、0、0 | 0、0、0、0、0 | **13、0、0、0、16** | **0、0、0、0、0** |
| put-back 全仓搜索（每次） | 1、1、1、1、1 | 2、1、2、1、1 | 13、6、2、3、11 | 4、3、3、3、2 |
| put-back 工具调用（每次） | 7 ×5 | 8、7、8、8、8 | 37、20、14、16、39 | 15、11、12、12、11 |
| put-back 读入字数：claim 输出 | 6,766 | 6,812 | 6,767 | 6,813 |
| put-back 读入字数：全部工具输出 | 14,027（13,969–14,572） | 14,399（13,790–14,829） | 99,236（22,988–108,081） | 21,252（19,847–41,645） |
| dissolve claim→finish（秒，3 次） | 33.67（25.29–35.37） | **26.73**（20.42–27.33） | 144.9（122.51–180.49） | **110.79**（104.6–144.16） |
| dissolve 读 node_modules/03kind | 0 | 0 | 0 | 0 |
| 全部 8 次 claim→finish（秒） | 21.2（14.89–35.37） | 20.38（10.22–27.35） | 134.81（105.72–304.19） | 75.78（61.6–144.16） |
| 每条用时（秒） | 7.07 | 6.79 | 44.94 | 25.26 |
| 每条工具调用 | 2.33 | 2.67 | 6.17 | 4.17 |
| 全仓搜索 | 1 | 1 | 4.5 | 3 |
| 读入字数：全部工具输出 | 14,461 | 14,664 | 72,131 | 22,859.5 |
| 1:1（done 核对 / 页面预期） | 8/8 / 8/8 | 8/8 / 8/8 | 8/8 / 8/8 | 8/8 / 8/8 |
| 虚假 ✓ | 0 | 0 | 0 | 0 |
| 报告格式合规 | 8/8 | **7/8** | 8/8 | 8/8 |
| stalledNotices / unclaimedNotices | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

- **Cursor put-back 改前 5 次里 2 次（#1 304 秒、#5 226 秒）去包里翻代码**，就是本 ticket 说的绕路：转录里 node_modules/03kind 出现 73、101 次，canvas.html 26、19 次，nth 109、83 次；读包 13、16 次。其余 3 次 106–125 秒。改后 5 次都没进包（node_modules/03kind 5 份转录里都是 0；#1 看了改动单，changeset.json 6 次、canvas.html 1 次、nth 3 次，其余 4 次这三个都是 0），61.6–76.0 秒，比改前没绕路的 3 次也快。
- 判定：Cursor put-back 用时中位数 124.72 → 68.49 秒，不慢于改前；读包从 5 次里 2 次（共 29 次）降到 0。dissolve-place-frame 两家都没变差（Claude 33.67 → 26.73，Cursor 144.9 → 110.79 秒；它的输出逐字没变，这个差是同一输入的起伏，量级约 20–25%，所以 put-back 那 3 次没绕路的变快也不全算在这次改动上）。Claude put-back 17.69 → 18.28 秒，范围重叠，看作噪声；它多出的全仓搜索（#1、#3 各 2 次）都是找正文字体（`grep font-body|Georgia`），和位置无关。1:1 不降。
- **报告合规 Claude 8/8 → 7/8**：不合规的是改后 dissolve-place-frame #2，change 1（解散 Stack）同时列在 ✓ 和 ⚠️ 下（`h-screen` 换成固定 720px 的说明写进了 ⚠️），和 76 改前那两次同一类。dissolve-place-frame 的 claim、done、finish 两个版本逐字相同（dry 和真实运行里 claim 都是 7,257 字），所以不是这次改动引起的；按规则不补跑。put-back（说明变了的场景）两家改前、改后都是 5/5。
- 结果目录：改前 `bench-results/agents/2026-11-02-before-b9938dd/`，改后 `bench-results/agents/2026-11-02-after-aa51f8a/`（`--out` 都是绝对路径，在本 worktree 下，git 忽略）。
- **作废的运行：没有。** 每次运行前后都查了 `ioreg -r -k AppleClamshellState`，32 次都是 `No`；`pmset -g log` 19:44–20:45 没有 Sleep / Wake，只有别的程序的显示器唤醒断言。转录里没有 reconnecting。headedBrowsers 全部为空。
- 跑的时候机器上别的线也在跑（开始前 load average 约 30，结束时约 5），改前、改后交替跑，受的影响相同。

**体积**（gzip）：只改了 `cli.js`（34,875 → 35,330 B，+455）；`editor.dev.js`（107,592 B）和切换按钮（`react.dev.js` 823 B）不变，install.spec 口径没动。页面代码没改，性能测试没跑。

**测试**

- `pnpm typecheck` 通过（这个 worktree 第一次跑时，examples 的类型检查要先有 `dist`，`pnpm build` 后通过）。
- `pnpm test`：vitest 771 个通过、1 个跳过；测量台和旧名检查的 node 测试 32 个通过。
- `TK_E2E_PORT=5600 pnpm test:e2e`：最后一次全量（20:47 起，机器负载低时）376 个通过、1 个跳过。之前机器负载高（load average 约 30）时连跑两次全量，`next-install.spec.ts:37`「init installs 03Kind into a Next.js project…」都在 60 秒内等不到 Next 的开发服务器（`ERR_CONNECTION_REFUSED` 5604），后面依赖它的 101 个没跑；单独跑这个文件 4 个都过，"project files" 单独跑 97 个过。和这次改动无关（它只改 `claim` 的说明文字），是负载下 Next 冷启动慢。

**风险和没做到的**

- 推算靠改动单的顺序：一个图层的移动只记一条（第一次的编号，最后的位置），设计师先移动 A、再新建文字、再把 A 移到别处时，A 的那条编号在新建之前，推算不到它后来的移动，新文字的「第几个」可能差 1。页面核对照旧按画布找、允许范围，不会因此误判；只是说明可能和落地后差一个。
- 新建图层后来被设计师自己移动、合成进 Stack、或容器被解散时，照旧写新建时的位置、不加那句，「落地前还是落地后」仍要 Agent 看后面那条改动。
- 复制、拖回、合成的 Stack 的「第几个」没改，仍是记下时的位置；有同样的歧义，但没测到绕路，也不在本 ticket 里。
- n 小：put-back 每家 5 次、dissolve 3 次。Cursor 改后 5 次都没进包，改前 2/5，可能还有没测到的绕路；Claude 两个版本范围重叠。
- 没调用 code-review 技能（它会另起子 agent，按指挥的要求不派），自己按 ticket 和 spec 对过一遍 diff。

**整线审查补修（2026-11-02，起点 1c24e4c；提交 2d2e1e1 实现、测试和 spec，acc354f 测试补一句断言，本提交 Comments）**

- **草图里两种位置混用：成立，已修。** 1c24e4c 的草图里新建的图层写落地后的位置（`landed`），复制、移入、拖回的图层仍写记下时的位置，同一张草图里可能两个图层同一个序数。改为整张草图都按落地后写：带生成说明的 Frame 是这一轮新建的，起初是空的，`layoutOnceApplied` 按改动单的顺序把放进这个 Frame、从它拿出去的图层排一遍（放进来的按那条改动记下的第几个插入，拿出去的按图层去掉），得到落地后的顺序，每个图层写它在其中是第几个；不在其中的（后来又被拿走）照旧写记下的位置。这是设计师「直接写这一轮所有改动落地后的位置」最贴近的做法，不用另做设计决定：两种口径没有要取舍的，序数一致也不冲突。原来的 `(made && landed(c, list)?.nth) || place.nth` 随之换成 `at === -1 ? place.nth : at + 1`（`at` 是它在落地后顺序里的下标）。
  - 测试：`cli.test.ts`「in a new Frame's sketch, every layer is where it lands, put back, copied or moved in as well as drawn: no two at the same place」：新文字、复制进来、移进来、再在最前面新建文字，改前「Button (a copy): 2nd」「Button (moved in): 1st」和「Pricing: 1st」撞号，改后 1st–4th 各一个。81 原来那条草图测试（两条新文字）照旧通过。
  - 草图只在新建了带生成说明的 Frame 时出现，所以没有新建图层的场景不可能变；`--dry` 的 10 个场景都没有草图（见下面比对）。
- **命名（第 7 条）：** `landed()` / `interface Landed` → `placeOnceApplied()` / `PlaceOnceApplied`（和注释里的「once the round is applied」、GLOSSARY 的 Apply 一致）；`placement(place, at)` 的 `at` → `onceApplied`；局部 `once` → `asApplied`；`layoutChanges` 的 `out` / `inn` → `takenOut` / `putIn`（现在带着图层，草图要按图层排）。
- **`layoutChanges()` 和 `placedAt()` 的重复：复用了。** 放入的位置直接取 `client/changeset.ts` 的 `placedAt`（移动、复制、新建、拖回、合成的 Stack，五种和原来按 kind 分支取的一样；「把这个 Frame 变成 Stack」没有位置，原来也是空），`layoutChanges` 只自己写拿出去的（删除、移动的原位置，合成 Stack 带走的成员）。`placesOf()` 没复用：它是「改动碰到的位置」，复制会带上原件的位置、没有删除，和这里的「拿出去」意思不同。输出不变（cli.test.ts 全部通过、dry 比对逐字相同）。

**Agent 读到的输出**（`pnpm bench:agents --dry` 布置 10 个场景，接着跑 `done <全部>`、`finish`、再 `claim`，用不提交的补丁存下，比完已还原；改前是本 worktree 里换回 1c24e4c 的 `packages/03kind/src` 再 build）

- 1c24e4c 和改后两份共 40 个文件逐字相同（`diff -r` 无输出），包括 put-back-and-new-text：claim 6,827 字、done 846、finish 1,085、claim-again 3,772，新文字那句仍是「as its 2nd layer, once all of this round's changes are applied」。

**体积**（gzip，Node zlib 默认级别）：`cli.js` 132,023 / 37,315 → 132,519 / 37,457 B（+142，含 82 补修里本机服务的改动）；`change-notes.ts` 只有 CLI 用，切换按钮的文件逐字节不变（见 82 的补修）。

**测试**：`pnpm typecheck` 通过；`pnpm test` vitest 804 个通过、1 个跳过，node 测试 32 个通过；`TK_E2E_PORT=5600 pnpm test:e2e` 全量 393 个通过、1 个跳过（和 82 的补修同一次）。

**风险**

- 草图里的顺序也靠改动单的顺序推：一个图层的移动只记一条（第一次的编号、最后的位置），在这个 Frame 里移动过两次的图层，按第一次的编号排，可能差一个位置。只是说明里的序数，页面核对不靠它；序数之间不会撞号。
- 新建图层自己的 Design intent 仍用 `placeOnceApplied`（从记下的位置起加减），和草图里的排法在上面这种移动两次的情况下可能差一；其他情况两者相同（新测试里 Plans 两处都是 3rd）。
