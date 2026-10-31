# 65: Skill 只留流程，写法随改动说明给出

**What to build:** Skill 只留一轮的流程：认领、落地、`done`、`finish`、报告。每种改动该怎么写（Stack、Grid、断点、挪回画布、数据改动等）挪进 `claim` 的输出，只在这一轮出现这类改动时打印一次。Agent 读得少、记得住；没加载 Skill、只跑了 `claim` 的 Agent，也能照输出走完一轮。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0013）。

**Blocked by:** 63, 64

**Status:** done

- [x] Skill 只剩流程与报告格式，长度不超过现在的三分之一（146 → 40 行，25,106 → 3,673 字节）
- [x] `claim` 的输出只包含这一轮出现过的改动种类的写法，每种只出现一次
- [ ] 真实 Agent（与 63 同一 Agent、同一模型）：每轮读入的字数比 63 的基线少；整轮用时、每条平均工具调用次数不高于基线；1:1 落地率、设计变量使用率、虚假的 ✓ 不变差；前后数字记在 Comments（未全部达到：Claude 每项都达到；Cursor 整轮用时中位数 61.52 → 76.21 秒，高于基线 B，其余各项达到。归因见 Comments「Cursor 整轮用时高于基线 B」。补修之后只复测了 Claude，Cursor 待设计师定）
- [ ] 不加载 Skill 的场景：只对 Agent 说「运行 `npx vernierkit claim`，照输出落地」，真实 Agent 能走完一轮，报告格式合规（未全部达到：Claude 已达到，见下一项；Cursor 没跑成，账号里的 Grok 4.7 256K High 在主批之后不能用了，外部原因，见 Comments。Cursor 待设计师定）
- [x] 不加载 Skill 的场景，Claude：10 次都走完一轮，报告合规比 65 的 8 / 10 好。10/31 补修加入、补修后达到：10 / 10（见 Comments「补修：页面怎么核对、断点逐段、`finish` 排好报告」）
- [x] spec 中 Skill 的内容随之更新
- [x] 桌面视图的改动，`claim` 的输出写清两点：作用于所有宽度；项目里该属性已有的断点写法（`sm:`、`md:`）一并覆盖。只在这一轮出现桌面视图的样式改动时打印。10/31 总调度加入，理由：63 的 Grid 列数场景里，两家 Agent 都只改了 `sm:grid-cols-*`，手机宽度仍是 1 列。（promote-and-grid 两家各 3 次都 1:1）
- [x] `claim` 输出开头的「done after each」和新的 Skill 对齐：改完一条或一组相关改动后 `done`，`finish` 前至少一次。10/31 总调度加入，理由：64 发现这句和 64 改过的 Skill 对不上。
- [x] 报告格式写得更不容易出错，合规率不比基线 B 差，争取更高。10/31 总调度加入，理由：基线里 Claude 不合规的两种方式是同一条同时出现在 ✓ 和 ⚠️ 下、⚠️ 缺理由那一行。（Claude 19 / 30 → 26 / 30，Cursor 28 / 30 → 30 / 30；「同时在两处」仍有 4 次）

## 背景

- 现在的 Skill 有 146 行，大部分是每种改动的写法，而一轮通常只出现其中几种。改动说明里已经有一部分是按需给的（如 Wrap it、Drop the margins）。
- 等 64 先改完 Skill 里 `done` 的说法，再动 Skill，避免两张同时改同一份文字。

## Comments

**64 交来的输入：Skill 放宽 `done` 之后 Cursor 怎么分配时间（2026-10-31，64 的补完）**

64 把 Skill 里「每条改完立刻 `done`」放宽成「改完一条或一组相关改动后 `done`」。从 Cursor 的对话记录看（基线 A、B 和 64 各 30 次，Grok 4.7 256K High），这句话改变了它的做法，但没有让它总体变慢（归因的全文在 64 的 Comments「Cursor 整轮用时变差的归因」）：

- 做法变了：
  - A、B 里是改一条、`done` 一次、再想下一条：每次运行编辑次数中位数 3，`done` 中位数 3。
  - 64 里先把所有改动一起想好，再连着改完，最后一次 `done`：编辑中位数 2，`done` 中位数 1。
  - 认领到第一次改源码之间的时间，中位数 35.1 → 42.2 → 60.9 秒（A → B → 64）；第一次改源码到最后一次之间，14.6 → 19.3 → 0.6 秒。
  - 例如 put-back-and-new-text #2，认领后一段 51.6 秒的思考里排好了三条的先后：「先恢复 h1，再插入新文本，最后删除 p。这样新文本会成为第三层」。
- 总时间没有多：
  - 按场景比，64 / B 的几何平均是 0.87，A、B 两次之间同一场景的摆动中位数在 20% 左右。
  - claim→finish 的 Mann-Whitney 检验：B 对 64 p ≈ 0.6，A 对 B p ≈ 0.55。
- 但「没进度也没改源码的最长时间」变长：中位数 42.77 → 61.5 秒。三组里这段最长时间几乎都落在认领到第一次改源码之间（A 29/30 次，B 27/30，64 30/30），64 只是这段更长。
  - 67 按这个数定停滞提示的阈值时要知道：批量报 `done` 会让 Cursor 在头一段不动更久，但不是卡住。
  - 65 改写 Skill 时可以考虑：要不要让 Agent「想好一条就先改一条」，好让进度环早些动；要权衡 Claude 在 64 里因为批量报 `done` 省下的时间（每条 7.62 → 5.46 秒），两家都要复测。
- `claim` 输出开头还写着「run `npx vernierkit done <number>` after each」，和 64 改过的 Skill（一条或一组后 `done`，至少一次）对不上。
  - 对话记录里没有看到 Agent 因为这句犹豫（64 的 30 次 Cursor 思考里只有一处提到 each，和这句无关）。
  - 64 没改它：改了 `claim` 输出就要两家复测，才能确认 Claude 已有的收益不变。
  - 65 本来就要把写法挪进 `claim` 的输出，并两家各复测 30 次，在 65 里一起改。

**做了什么（提交 8f5ee30、b5fdf36 和本条，起点 299f522）**

- Skill（`packages/vernierkit/skill/SKILL.md`）只剩一轮的流程（认领、落地、`done`、`finish`、报告）、报告格式，以及撤销、卸载各一段「跑这条命令，照输出做」。
  - 146 行 → 40 行，25,106 → 3,634 字节。Agent 读入的字数：Claude 24,935 → 3,458，Cursor 25,106 → 3,584。
  - 有单测守着：不超过原来的三分之一（行数和字数都算）；Skill 里的报告格式和 `finish` 输出的逐字相同。
- `claim` 的输出（`change-notes.ts`、新的 `writing-rules.ts`）：
  - 开头一段改成一轮怎么走：按顺序落地；改完一条或一组相关改动后 `done`，可一次报多条，`finish` 前至少一次；`finish` 结束一轮，并给出报告格式。原来的「run `npx vernierkit done <number>` after each」去掉了（10/31 第 2 条）。
  - 每条改动那一节一个字没改。
  - 最后加一节「How to write them」，只列这一轮出现的改动种类的写法，每种一次。每轮都有的只有「Every change」一条：设计意图是目标，参考样式只用来理解；照项目已有写法；做不到 1:1 时取最接近的或不做，都写进报告；不改第三方依赖。其余 20 条各有触发条件：
    - What sets the value now（有样式改动或解散 Stack）
    - All breakpoints（有桌面视图的样式改动，10/31 第 1 条：作用于所有宽度；项目里该属性已有的 `sm:`、`md:`、媒体查询一并覆盖；本轮在断点单独改过的宽度除外；`done` 在每个视图宽度核对）
    - A rule in no CSS layer、CSS Modules（按「当前值的来源」）
    - Breakpoints、Absolute at a breakpoint
    - This usage only、The component itself
    - Moves、Cells of a Grid、Grids
    - Making a Stack、Make it a Stack、Dissolving a Stack、Sizes
    - New Frame with a brief、Brief、Text、Copies、Data changes
  - 文字从原 Skill 的对应条目搬过来，没有新加做法。例外：「All breakpoints」里「本轮在断点单独改过的宽度保留那条改动的值」一句，来自 ADR 0008（桌面视图的改动作用于所有断点，除非某个断点已单独改过），原 Skill 没有写。改动那一节已经写全的（新建文字、删除、拖回画布、Wrap it、Drop the margins、设计变量等）不另列。
  - `last`（撤销上一轮）的输出不带这一节。
- `finish` 的输出在结果那一行之后给出报告格式，和 Skill 的一样（10/31 第 3 条）。针对基线里 Claude 不合规的两种情况，多写了三句：
  - 每条只出现一次、只在一个标题下；
  - 落地了但和要求不完全一样的只放 ⚠️，不同时放 ✓，要补充的话写在 ✓ 那一行里；
  - ⚠️ 下每条都有 Why 和 Instead 两行。
- `done` 遇到页面没能核对的改动时，在后面加一句「That is no error: go on.」。原来这句只在 Skill 里，没加载 Skill 的 Agent 读不到。
- 测试：
  - 两条「一轮在 60 之前存下」的固定样例测试（单测、e2e 各一条）原来逐字比对整份 `claim` 输出。现在逐字比对每条改动的那几节，样例文件 `claim.md` 没动。
  - 比对 `finish` 输出的测试改成比第一行。
- 测量台（记进 63，提交 b5fdf36）：`--no-skill`；包里自带的那份 `node_modules/vernierkit/skill/SKILL.md` 被读到也算读了 Skill。

示例（Claude 主批每个场景 3 次的中位数，读入字数：claim 输出 / 全部工具输出）：

| 场景 | 这一轮列出的写法 | claim 输出 B → 65 | 全部工具输出 B → 65 |
|---|---|---|---|
| reorder-and-move | Every change、Moves | 1,523 → 2,809 | 28,726 → 9,504 |
| put-back-and-new-text | Every change | 4,858 → 5,793 | 32,797 → 13,169 |
| promote-and-grid | Every change、What sets the value now、All breakpoints、The component itself、Grids | 3,063 → 5,561 | 29,252 → 11,377 |
| fill-gap-brief | 再加 This usage only、Make it a Stack、Sizes、Brief | 2,668 → 5,891 | 31,452 → 13,980 |
| phone-breakpoints | Every change、What sets the value now、Breakpoints、This usage only、Grids | 3,472 → 6,489 | 33,479 → 16,951 |

`claim` 的输出变长了 0.9–3.2 千字，Skill 少了约 2.1 万字，每轮合计少一半以上。

**前后数字（2026-10-31，提交 299f522 → b5fdf36）**

脚本剧本（`VK_E2E_PORT=5600`，b5fdf36 上，全套 e2e 里跑的一次；结果 `bench-results/playbooks-65-b5fdf36/`）：六个剧本的每项数字都和 66 一样，没有变差。

| 剧本 | 66 | 65 |
|---|---|---|
| 照流程走 | 100% / 0 / 0；误报 0 | 100% / 0 / 0；误报 0（看了 6 次） |
| 跳过 `done` | 100% / 0 / 0；误报 0 | 100% / 0 / 0；误报 0 |
| 全改完才一起 `done` | 100% / 0 / 0；误报 0 | 100% / 0 / 0；误报 0 |
| 做到一半退出、不 `finish` | 100% / 0；15 秒内没出现；0%；误报 0 | 同左 |
| 没认领就改代码 | 是；196ms；是；100% | 是；26ms；是；100% |
| 两次进度之间停很久再继续 | 100% / 0；0 次；误报 0 | 同左 |

真实 Agent：
- 两家顺序跑，先 Claude 后 Cursor，没有并发。跑的时候没有跑单测或 e2e。
- 机器上的其他负载（ps 记的）：
  - 设计师自己的 Chrome、Notion、Claude app 和另一个 CLI 会话，load 4–8。
  - 另一个项目（Pi Chat）的 Vite 开在 5173。测量台不用这个端口，但 B、64 里 Cursor 在 dissolve-place-frame 自己起过 `npx vite --port 5173`；这次 Cursor 没有起 Vite。
- 版本、模型都和基线 B 一样，meta.json 逐项核对过：
  - Claude Code：`VK_BENCH_CLAUDE` 固定到 `claude-code/2.1.309/5af865b9901c` 那份（机器上另有 2.1.308），2.1.309，`claude-sonnet-5-5`，`--effort high`。命令行和 B 一字不差。30 次的 init 事件都是 `claude-sonnet-5-5`，没有子模型。
  - Cursor：`VK_BENCH_CURSOR` 指向 64 用的同一个 symlink，跑前跑后都指向 `versions/2026.10.22-27dcf5f`，Grok 4.7 256K High。命令行和 64 一字不差（比 B 多两个 `--plugin-dir`，63 已说明）。30 次都是 Grok 4.7 256K High，没有子 Agent。
- 都没有补跑，也没有作废的批次。
- 原始结果：Claude `bench-results/agents/2026-10-31T03-40-24-561Z/`，Cursor `bench-results/agents/2026-10-31T03-57-30-289Z/`。
- 1:1 和虚假的 ✓：A、B、64 用 63 里按画布画出来的位置重新打分后的数字（`bench-results/rescored-position-64/`）；65 的运行本来就按新预期打分。

### Claude Code（Sonnet 5.5 high），中位数（范围），30 次

| 指标 | A | B | 64 | 65 | 目标 |
|---|---|---|---|---|---|
| 整轮用时 claim→finish（秒） | 20.84（9.53–223.36） | 22.85（9.82–213.52） | 14.01（4.85–30.23） | 14.88（5.99–43.77） | 不高于 B ✓ |
| 整轮用时每条（秒） | 8.05（3.18–74.45） | 7.62（3.27–71.17） | 5.46（1.62–10.08） | 5.19（2–14.59） | 不高于 B ✓ |
| Agent 总用时（秒） | 38.61 | 35.54 | 23.37 | 24.15（13.72–53.5） | |
| 每条平均工具调用 | 3.5（2.67–5.67） | 3.67（2.67–5.67） | 3.33（2–4.67） | 3.33（2–6.33） | 不高于 B ✓ |
| 全仓搜索次数（合计） | 0（0–2）；17 | 1（0–2）；20 | 0（0–2）；18 | 0（0–2）；14 | |
| 读入字数：Skill | 24,482 | 24,482 | 24,935 | 3,458（3,458–3,698） | |
| 读入字数：claim 输出 | 2,936.5（1,523–4,858） | 2,936.5 | 2,936.5 | 5,588（2,809–6,489） | |
| 读入字数：全部工具输出（每轮合计） | 30,866（27,795–35,857） | 31,212.5（27,795–35,862） | 31,865（28,664–34,991） | 12,890.5（9,504–19,005） | 少于 B ✓ |
| 按页面预期 1:1 的改动（合计） | 72 / 81 | 72 / 81 | 75 / 81 | 77 / 81 | 不变差 ✓ |
| 1:1 落地率（done 核对，27 次） | 1（0–1） | 1（0–1） | 1（1–1） | 1（1–1） | |
| 虚假的 ✓（合计条数） | 9 | 9 | 6 | 4 | 不变差 ✓ |
| 设计变量使用率（15 次） | 1 | 1 | 1 | 1 | 不变差 ✓ |
| 报告格式合规 | 16 / 30 | 19 / 30 | 23 / 30 | 26 / 30 | 不比 B 差 ✓ |
| 跑了 done / finish | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | |
| `done` 次数（合计） | 105 | 93 | 45 | 45 | |
| 两次进度最长间隔（秒） | 6.08 | 4.01（0.13–11.42） | 1.31（0.09–10.84） | 1.21（0.02–15.81） | |
| 没进度也没改源码的最长时间（秒） | 12.05 | 10.96（3.63–199.51） | 8.84（3.21–17.89） | 9.29（3.75–18.27） | |
| Light：每条 ≤ 3 次工具调用且 0 次全仓搜索 | 6 / 30 | 4 / 30 | 8 / 30 | 11 / 30 | 目标 30 / 30 |

- 整轮用时：B 对 65 的 Mann-Whitney p ≈ 0.005（每条 p ≈ 0.003）。和 64 差不多（p ≈ 0.82）：65 的省时主要是 64 的批量 `done` 带来的，65 又少读了一半的字。
- 虚假的 ✓：
  - dissolve-place-frame 三次各 1 条，64 是各 2 条：三次都按 `done` 的提示保留了按钮的 `mt-6`，只有解散 Stack 那条还去掉了段落的 `mt-4`。
  - data-and-text #1 一条：复制了删掉一张卡片后排第 2 的「Apply」，不是原来第 1 张「Freeze」，又把这条同时列在 ✓ 和 ⚠️ 下。
    - 这次运行读到的 `claim` 输出里，每条改动那一节和 64 一字不差。
    - 复制那一节只说「Card，第 2 位」，没说复制的是循环里的第几个实例。这个缺口 65 之前就有，B、64 的 6 次碰巧都对。
- 报告格式：不合规的 4 次都是同一条同时列在 ✓ 和 ⚠️ 下（data-and-text #1、#3，dissolve-place-frame #1、#2）。「⚠️ 下缺理由」这次没有出现（B 1 次，64 2 次）。

### Cursor（Grok 4.7 256K High），中位数（范围），30 次

| 指标 | A | B | 64 | 65 | 目标 |
|---|---|---|---|---|---|
| **整轮用时 claim→finish（秒）** | 52.52（20.38–522.3） | **61.52（25.76–544.24）** | 69.77（19.73–430.41） | **76.21（12.19–639.76）** | 不高于 B ✗ |
| **整轮用时每条（秒）** | 22.01（8.94–174.1） | **20.75（10.73–181.41）** | 27.73（7.45–143.47） | **29.05（4.06–213.25）** | 不高于 B ✗ |
| Agent 总用时（秒） | 86.28 | 90.78 | 106.67 | 115.19（45.16–678.86） | |
| 每条平均工具调用 | 5.17（3.67–23.67） | 5.67（3.33–16） | 5.17（3–22） | 5.58（2.67–22） | 不高于 B ✓（差 0.09） |
| 全仓搜索次数（合计） | 3（0–21）；122 | 2.5（0–12）；97 | 3（0–16）；111 | 4（0–20）；173 | 变差 |
| 读入字数：Skill | 24,653 | 24,653 | 25,106 | 3,584（3,584–7,168） | |
| 读入字数：claim 输出 | 2,938.5 | 2,938.5（1,525–4,860） | 2,938.5 | 5,589（2,810–6,490） | |
| 读入字数：全部工具输出（每轮合计） | 50,486.5 | 51,279.5（31,912–316,637） | 54,905（34,934–319,534） | 24,663.5（12,290–606,532） | 少于 B ✓（中位数） |
| 按页面预期 1:1 的改动（合计） | 75 / 81 | 73 / 81 | 77 / 81 | 81 / 81 | 不变差 ✓ |
| 1:1 落地率（done 核对，27 次） | 1（0–1） | 1（0–1） | 1（1–1） | 1（1–1） | |
| 虚假的 ✓（合计条数） | 6 | 4 | 2 | 0 | 不变差 ✓ |
| 设计变量使用率（15 次） | 1 | 1 | 1 | 1 | 不变差 ✓ |
| 报告格式合规 | 30 / 30 | 28 / 30 | 29 / 30 | 30 / 30 | 不比 B 差 ✓ |
| 跑了 done / finish | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | |
| `done` 次数（合计） | 85 | 85 | 38 | 31 | |
| 超时（20 分钟） | 0 | 2 | 1 | 0 | |
| 两次进度最长间隔（秒） | 9.8 | 11.35（2.97–98.53） | 3.4（0.46–35.94） | 2.75（0.97–36.26） | |
| 没进度也没改源码的最长时间（秒） | 35.71 | 42.77（11.22–406.83） | 61.5（14.65–346.12） | 67.97（7.54–603.19） | |
| Light：每条 ≤ 3 次工具调用且 0 次全仓搜索 | 0 / 30 | 0 / 30 | 2 / 30 | 4 / 30 | 目标 30 / 30 |

- 读入字数的范围上限 606,532 是 phone-breakpoints 的一次：Cursor 把 Tailwind 和 Vernier Kit 包里打包后的 JS 读了一遍，见下面的归因。
- 1:1 81/81、虚假的 ✓ 0、报告 30/30，是四组里最好的。dissolve-place-frame 三次画出来的位置都和画布一致。

**Cursor 整轮用时高于基线 B（验收没达到，65 之后仍高于 B）**

- 中位数 61.52 → 76.21 秒，每条 20.75 → 29.05 秒，30 次的合计 3,319 → 4,621 秒（+39%）。64 已经高于 B（69.77 秒），65 又高了一些。
- 不是全面变慢，而是几个场景拖长了，摆动变大。按场景比（每个场景 3 次的 claim→finish 中位数，秒）：

  | 场景 | A | B | 64 | 65 |
  |---|---|---|---|---|
  | promote-and-grid | 35.3 | 41.4 | 37.5 | 15.7 |
  | data-and-text | 112.9 | 119.1 | 103.4 | 76.7 |
  | cards-style | 50.0 | 60.2 | 37.3 | 35.0 |
  | type-and-stack | 38.0 | 47.0 | 24.3 | 27.7 |
  | reorder-and-move | 36.6 | 30.1 | 20.4 | 24.4 |
  | fill-gap-brief | 131.4 | 178.5 | 122.3 | 136.5 |
  | button-over-rule | 28.9 | 39.9 | 62.1 | 75.7 |
  | put-back-and-new-text | 52.8 | 56.4 | 75.9 | 123.6 |
  | dissolve-place-frame | 153.3 | 210.7 | 247.9 | 386.5 |
  | phone-breakpoints | 350.1 | 229.7 | 205.8 | 486.2 |

  - 65 / B 的几何平均 0.98：6 个场景快了，4 个慢了。
  - 同一场景的摆动：65 对 B |log 比值| 的中位数 0.57，A 对 B 只有 0.20。
  - Mann-Whitney：B 对 65 p ≈ 0.70，每条 p ≈ 0.63；A 对 B p ≈ 0.55。中位数的差不显著，但合计和长尾确实变差了。
- 慢的四个场景，多出来的时间花在哪：对话记录里，Cursor 在「检查器」怎么核对上想得多，并去读 Vernier Kit 包的代码找答案。

  | Cursor | 读 `node_modules/vernierkit` 的工具调用 | 读 Tailwind 包 | 读 `.vernier/` 的文件 | 全仓搜索合计 |
  |---|---|---|---|---|
  | A | 43 次（3 次运行） | 36 | 28 | 122 |
  | B | 5 次（2 次运行） | 13 | 16 | 97 |
  | 64 | 26 次（1 次运行） | 27 | 22 | 111 |
  | 65 | 100 次（8 次运行） | 55 | 52 | 173 |

  - 8 次里的说法：
    - dissolve-place-frame #1 是「正在查阅 vernierkit 包的源码，以确认 `done` 命令的具体校验逻辑」；
    - phone-breakpoints #1 是「确认检查器在断点范围内选取的具体视口宽度」；
    - fill-gap-brief #2 是「The checker likely compares computed or used styles」。
  - 推断：原 Skill 有一段讲页面怎么核对。断点改动在范围里的一个宽度核对（`below 640px` 按手机宽度）；所有断点的改动在页面宽度和每个视图宽度核对；结构改动里只核对 Reorder、同容器的 Absolute 和 Delete。
  - 65 把这段当作流程以外的东西去掉了，`claim` 的输出里也没有对应的一条，只在「All breakpoints」里带了一句。Cursor 不知道检查器在哪个宽度看，就去源码里找。Claude 没有这样做。
  - 另外两处，文字和 B 的 Skill 一样，没有新加：
    - phone-breakpoints：「Breakpoints」里 `grid-cols-1 sm:grid-cols-3` 的例子（低于 640px），Cursor 拿它去套 768px 以下的改动，又去验证 Tailwind v4 里 `max-md:` 和 `sm:` 的先后（读 Tailwind 打包后的源码，三次都是）。
    - button-over-rule：在几种盖过 `button` 规则的写法之间来回权衡，64 已经记过。
    - 规则挪到了 `claim` 输出的末尾，紧挨着要改的那几条，可能让 Cursor 更字斟句酌，这一点没有办法单独验证。
  - Claude 读的是同一份输出，没有变慢（见上）。
- 可能的改法（没有做，要两家各再跑 30 次才知道，Cursor 额度要总调度定）：在 `claim` 输出的开头或 `done` 的说明里，用一两句话说清页面在哪些宽度、按什么核对（「断点改动在它范围里的一个宽度核对；桌面视图的改动在页面宽度和每个视图宽度核对；你不必知道更多，没显示时 `done` 会说是哪个宽度」），并说不必去读 Vernier Kit 的代码。
- 按 brief：65 之后 Cursor 的整轮用时仍高于基线 B，整条线不合回 main，由总调度决定下一步。

**三项统计（主批两家各 30 次）**

- `unclaimedNotices`：60 次全是 0，认领前、认领后都没有（按 `times.claim` 分）。真实落地时「没认领在改代码」的提示误报 0 次。
- `headedBrowsers`：60 次全部为空。
- 「the page did not answer in time」：只数 `done`、`finish` 的输出，60 次都是 0（64 的 60 次也是 0）。
  - Cursor 的对话记录全文里出现过 23 次（7 次运行），都是它读 Vernier Kit 包的代码（`dist/cli.js` 等）时读到的这句字符串，不是 `done` 的回答。
  - 64 的 Cursor 记录里那 3 次（dissolve-place-frame #1）也是这样。

**不加载 Skill 的场景（10 个场景各 1 次，和主批分开记）**

只对 Agent 说「运行 `npx vernierkit claim`，照输出落地」（`pnpm bench:agents --no-skill --runs 1`，见 63）。

怎么确认真的没加载：
- Claude Code 的 Skill 是 `init` 复制进项目的 `.claude/skills/vernierkit/SKILL.md`（另有 `.agents/skills/` 一份和 AGENTS.md 一行）。主批 30 次的 init 事件里 `skills` 都有 `vernierkit`。
- 这一批 10 次的 init 事件里都没有 `vernierkit`；对话记录里没有出现 `SKILL.md`；读入字数：Skill 10 次都是 0。
- Cursor 是按 AGENTS.md 那一行去读 `.agents/skills`、`.claude/skills` 下的文件（主批 30 次都读了）。这两处和 AGENTS.md 那一行都不在了，所以 Cursor 同样读不到。

Claude Code（2.1.309，`claude-sonnet-5-5`，`--effort high`，命令行只有提示词不同；原始结果 `bench-results/agents/2026-10-31T05-38-19-602Z/`）：

| 指标（中位数（范围），10 次） | 不加载 Skill | 对照：主批 65（30 次） |
|---|---|---|
| 走完一轮（claim、done、finish 都跑了） | 10 / 10 | 30 / 30 |
| 报告格式合规 | 8 / 10 | 26 / 30 |
| 整轮用时 claim→finish（秒） | 13.92（6.39–40.58） | 14.88（5.99–43.77） |
| 整轮用时每条（秒） | 6.1（2.13–13.53） | 5.19（2–14.59） |
| 每条平均工具调用 | 2.83（1.67–5.33） | 3.33（2–6.33） |
| 读入字数：Skill / claim 输出 / 全部工具输出 | 0 / 5,588 / 9,395.5 | 3,458 / 5,588 / 12,890.5 |
| 按页面预期 1:1 的改动（合计） | 26 / 27 | 77 / 81 |
| 虚假的 ✓（合计） | 1（dissolve-place-frame，解散 Stack 那条去掉了段落的 `mt-4`） | 4 |
| 设计变量使用率 | 1 | 1 |
| `unclaimedNotices` / `headedBrowsers` / did not answer in time | 0 / 空 / 0 | 0 / 空 / 0 |

- 报告不合规的 2 次，和主批一样：同一条同时列在 ✓ 和 ⚠️ 下。
  - reorder-and-move #1：Move 落地了，又在 ⚠️ 下说按钮的 `mt-6` 留着可能不合适。
  - dissolve-place-frame #1：解散 Stack 那条两处都列，⚠️ 下还缺一行。

Cursor：没跑成。
- 第一次运行（cards-style #1，13:44）Cursor 的服务当场拒绝：「Cannot use this model: grok-4.7[context=256k,reasoning_effort=high,fast=false]」，0 次工具调用。测量台按「模型不对」停掉了整批。
- 随后 `cursor-agent --list-models` 列出的 grok 4.7 只有 `grok-4.7-low/medium/high/xhigh`（及 fast），没有 256K 那一档。主批 30 次（最后一次约 13:37 结束）都还是 Grok 4.7 256K High。
- 账号能用的模型在这几分钟里变了，是外部原因。按 brief 不换成别的模型（换了就不能和基线比），这一批停下，由总调度决定。
- 这 1 次记作外部原因的尝试，不进任何数字；结果文件夹 `bench-results/agents/2026-10-31T05-44-47-220Z/`。

**code-review（299f522 到 90c572f，两路）**

修了的（5c36f44）：
- 触发条件漏了几处：
  - 「Sizes」（Fixed、Hug、Fill 的含义）原来只在改宽高时打印。现在新建 Frame、解散 Stack、断点上改为自由定位也打印，这几种改动的说明里也有「Fixed 宽 × 高」。
  - 「What sets the value now」现在也在合成 Stack、且说明里有「Currently set by（外边距）」时打印。
  - 「Make it a Stack」现在也在复制的图层在断点上是真正的 Stack 时打印。
- 原 Skill 里两句没跟过来，补上了：
  - 做不到 1:1 时取最接近的，仍要 `done`；不做就不 `done`。这句在「Every change」和 Skill 里。
  - `finish` 列出没 `done` 的改动时，原来只说「Report why in your reply」，现在说「Report them under ⚠️, with why」。原来这句只在 Skill 里。
- 命名和结构：
  - 写法的类型 `Rule` 改名 `HowToWrite`：「规则」和说明里的 CSS 规则同名。`for` 改名 `calledFor`。
  - 每条写法按一条改动判断，不再各自包一层 `list.some`。
  - 报告格式挪进自己的模块 `report-form.ts`。

**review 之后的改动没有用真实 Agent 复测。** 上面的数字是 8f5ee30（Skill 3,634 字节）上跑的。5c36f44 的变化：
- Skill 多 39 字节；
- 每轮的「Every change」多约 40 字；
- dissolve-place-frame 多一条「Sizes」，约 160 字；
- `finish` 遇到没 `done` 的改动时那一句换了说法。

没改的（判断题）：
- 没加回原 Skill 里「页面怎么核对」那一段（断点改动在哪个宽度核对、结构改动核对哪几种）。
  - review 也指出这是丢掉的说明，和上面 Cursor 读包代码的归因是同一件事。
  - 加回来会改变 Cursor 读到的东西，要两家各再跑 30 次才知道效果。Cursor 现在连模型都用不了，这一项交给总调度定。
- `forOneUsage` 和 `change-notes.ts` 的 `scope()` 判断同一件事（是不是只改一处使用），各写了一次。共用要让 `change-notes.ts` 反过来引入写法模块，留着；两处都有测试。
- 测量台：
  - `project.ts` 里 Skill 的文件夹和 AGENTS.md 那一行，和 `install.ts` 各写了一份。测量台不能直接引入包的源码（Node 跑 `.ts` 要求带扩展名），留着；单测按 `init` 写的那一行检查。
  - `skill` 和提示词在 `main`、`runOnce` 里各算一次；`prompt = PROMPT` 的默认值写了四处。都是测量台内部的，留着。
- 不加载 Skill 的项目里，`.vernier/` 的安装记录还记着 AGENTS.md 那一行。Agent 若跑 `doctor`，会被告知 `init`，`init` 会把 Skill 装回来。这批 10 次都没有跑 `doctor` 或 `init`。
- 两条「在 60 之前存下的一轮」的测试改为逐字比对每条改动那几节，比原来宽松。原因：这两条测试要守的是存下的改动单读出来和当时一样，开头和末尾的写法是 65 有意改的。样例文件 `claim.md` 没动，旧的 `claim` 输出也还能对上。

**测试**

- `pnpm typecheck` 通过。
- `pnpm test`：
  - 8f5ee30 上 vitest 608 个通过、1 个跳过，测量台的 node 测试 24 个通过；
  - 5c36f44 上 vitest 613 个通过、1 个跳过，node 测试 24 个通过。
  - 新加的：`claim` 开头一段 1 个；写法 26 个（每种改动带出哪条写法、每条只出现一次、`last` 不带）；`finish` 的报告格式 1 个；Skill 和 `finish` 的格式逐字相同 1 个；Skill 的长度 1 个；测量台 3 个。
- `VK_E2E_PORT=5600 pnpm test:e2e`：b5fdf36、5c36f44 上各 321 个通过、1 个跳过（4.9 分钟、4.8 分钟）。
- 六个剧本：两次都和 66 一样。结果在 `bench-results/playbooks-65-b5fdf36/`、`bench-results/playbooks-65-5c36f44/`。
- `pnpm bench:agents --dry`、`--dry --no-skill`：10 个场景都设得起来。

**没做到的、有风险的**

- Cursor 整轮用时高于基线 B（见上）。按 brief，整条线不合回 main，由总调度决定。可能的改法是在命令的输出里补上页面怎么核对，要两家复测。
- 不加载 Skill：
  - Cursor 没跑成，Grok 4.7 256K High 在这个账号上不能用了。之后能用了要补跑 10 次；要是换模型，就不能和基线比了。
  - Claude 报告合规 8 / 10。
- 报告格式：最主要的那种不合规（同一条同时在 ✓ 和 ⚠️ 下），Claude 仍有 4 / 30（主批）和 2 / 10（不加载 Skill）。
  - 只靠说明压不住。要再往下压，可以让 `finish` 按页面结果先列好每条该放在哪一节，Agent 只填文字；这是新的做法，没做。
- data-and-text 的复制那一节没说复制的是循环里的第几个实例，Claude 这次复制错了一次。这个缺口 65 之前就有，没改，可以单开一张。
- `claim` 的输出每轮多了 0.9–3.2 千字。「All breakpoints」几乎每轮都会打印（有桌面视图的样式改动就打印）。Skill 少了约 2.1 万字，合计仍少一半以上。

**补修：页面怎么核对、断点逐段、`finish` 排好报告（2026-10-31，提交 aa899bd、4ff531e、aba6682 和本条，起点 751c288）**

起因：65 之后 Claude 每项都达标，Cursor 整轮用时比基线 B 高 39%。慢运行分析（只读 transcript）显示多出来的时间几乎都是模型在想、在绕路，起因是说明有缺口：原 Skill 讲页面怎么核对的那段删了，命令输出里没补，Cursor 去读 `node_modules/vernierkit`；phone-breakpoints 写「从 1 到 2」，页面在 640–767px 却是 3 列；「Breakpoints」的例子被套到 768px；Cursor 自己起 vite、开浏览器。总调度定了下面七项，这次只复测 Claude。

做了什么：

1. **说清页面怎么核对。**
   - 「How to write them」最后加一条「How the page checks」，只写这一轮出现的种类，每种一次：
     - 样式改动读浏览器对参考样式里那几个 CSS 属性算出的值（`getComputedStyle`），每个实例都看；
     - 所有断点的改动在页面宽度和每个视图宽度看；
     - 断点改动在项目断点切出的每一段各看一个宽度；
     - 自由定位看画出来的位置，重排看顺序，删除看图层不在了；
     - 页面核对不了的种类点名列出（`done` 会说没能核对，不是错误）。
     - 末尾一句：没显示时 `done` 会给出页面上的值和宽度，不必再去找它怎么核对。
     - 哪些种类能核对，照 `check.ts` 的规则判断（review 后对齐：换容器、裹了 `<span>` 的移动、从自由定位挪回流式的移动都算核对不了）。
   - 原来「All breakpoints」里那句 `done` 怎么核对挪到这一条，不再说两遍。
   - `done` 说没显示时，样式改动多说读的是哪个 CSS 属性（「as the browser computes `grid-template-columns` on the layer」）；断点改动也给出宽度，并说改动在那个宽度也生效。原来断点改动没显示时不说宽度，只说「Something overrides your change」。
2. **断点改动逐段写改前 → 改后。**
   - 断点范围里有项目断点时（手机视图的 0–767px 里有 Tailwind 的 `sm` 640px），编辑层把范围切成几段（`partsOf`）。
   - 设计师改完约半秒，编辑层在页面的一份副本上每段取一个宽度，读出页面现在（代码还没改）的值，记进改动（`parts`）再保存一次（`range-parts.ts`，从 `Shell.tsx` 调）。
   - 各段的值不同时，设计意图逐段写：「below 640px (`max-sm:`), from 1 to 2; 640px to 767px (`sm:max-md:`), from 3 to 2」，断点一行不再写「改前的值是它在这些宽度显示的值」。各段相同时照旧只写一次。
   - 页面核对也按段：每段看一个宽度（窗口所在的那段在窗口宽度，其余在下沿，从 0 起的在上沿减 1px）。原来只看 767px：Agent 只改了 `sm:max-md:` 时，390px 还是 1 列，也算显示了。
   - 读不到时照旧：设计师半秒内就离开编辑模式或 Agent 已认领、之前保存的一轮（打开时原样，不补读）。
3. **说明页面和开发服务器已经开着。** `claim` 开头一句：「The designer's page and its dev server are running already, and the page checks your edits as the code changes: start no dev server, and open no browser to look.」review 后改为有打开的页面时才说（`checks.json` 里有页面、本机服务还在）。
4. **「Breakpoints」不再举具体类名。** 改成：照断点一行的写法；设计意图逐段给出时每段各有设值的类或规则，都改到新值；正好覆盖那段宽度（或一段）的类就改它，不另加。「Absolute at a breakpoint」里的 `max-md:` 例子也去掉了。「All breakpoints」的 `grid-cols-1 sm:grid-cols-3` → `grid-cols-2` 留着：它说的是所有宽度，没有套错范围的问题。
5. **`finish` 先排好报告（ADR 0013）。**
   - `finish` 末尾给出这一轮的报告骨架，按页面核对的结果分好：
     - 已落地的放 ✓；
     - 页面没显示的放 ⚠️，Why 先填好页面上的值和宽度，后面留 `<what keeps it so>`；
     - 没 `done` 的放 ⚠️，Why 留给 Agent；
     - 页面看不出来、`done` 过的先放 ✓，下面一句「看不出来的这几条，照做了就留在 ✓，没有就挪到 ⚠️ 并写两行」。
   - 后面跟原来的三条规则，和 Skill 里逐字相同（单测守着）。Skill 的第 4、5 步改成「照 `finish` 排好的报告填」，通用示例留着。Skill 3,634 → 3,742 字节，仍是 40 行。
   - 第一行「Report them under ⚠️, with why」「Report them as not applied 1:1, with why」两句去掉了，骨架里已经有。
6. **数据改动写明是第几个实例。** 循环里单个实例的删除、复制、移动、改文字，记下它是第几个（按页面渲染的顺序，画布上删掉的也算）和它的文字（`instance`）。复制那一节写「the layer is one of the 3 instances a loop renders, the 1st of them, which reads “Freeze Turn the current page into a canvas.”」。
7. **测量台（ticket 63，见 63 的 Comments）。** `@playwright/mcp` 固定在 0.0.83；`--no-skill` 的项目去掉安装记录里 AGENTS.md 那一行；新统计「读 node_modules/vernierkit」。

**测试**

- `pnpm typecheck` 通过。
- `pnpm test`：vitest 624 个通过、1 个跳过；测量台的 node 测试 27 个通过。新加或改的测试：
  - `claim`：逐段的设计意图 1 个；有页面时才说页面开着 1 个；「How the page checks」3 个；「Breakpoints」不举类名 1 个；数据改动写第几个 1 个。
  - `done`：断点改动按段没显示时说宽度 1 个；原来几条没显示的说法补上读的 CSS 属性。
  - `finish`：排好的报告 2 个；Skill 和 `finish` 的规则逐字相同 1 个。
  - 浏览器：`partsOf` 1 个；按段核对 1 个；在页面副本上读各段的值 1 个；循环实例记下第几个 4 处。
  - 测量台：`@playwright/mcp` 的版本 2 处；去掉安装记录 1 个；读包的统计 2 个。
- `VK_E2E_PORT=5600 pnpm test:e2e`：aba6682 上 322 个通过、1 个跳过（5.0 分钟）。
  - 新加的一条：在手机视图改 Grid 列数，`changeset.json` 里存下两段（640px 以下 1 列、640–767px 3 列），`claim` 逐段写。
  - 改了的几条：
    - `done` 没显示的说法；
    - 手机视图的改动先等两段存下再认领，第一段在 639px 看；
    - `finish` 的第一行；
    - 数据改动的那两句。
- 六个剧本：每项都和 65（5c36f44）一样，「没认领就改代码」189ms（65 是 186ms）。结果在 `bench-results/playbooks-65fix-aba6682/`。
- `pnpm bench:agents --dry`、`--dry --no-skill`：10 个场景都设得起来。测量台等断点改动的各段存下才开始（`scenarios.ts` 的 `saved`）。
- 切换按钮体积（照 66 的量法：`react.dev.js` + 共用 chunk，gzip，zlib 默认级别）：751c288 10,001 B → aba6682 10,001 B，限额 10,240 B，没变。进入编辑模式才加载的 `editor.dev.js` 97,381 → 97,960 B。

**code-review（751c288 到 4ff531e，两路）**

修了的（aba6682）：
- 「How the page checks」原来自己判断能不能核对，和 `check.ts` 不一致：裹 `<span>` 的移动、从自由定位挪回流式的移动被说成能核对。现在照 `check.ts` 的条件。
- 移动和改文字记的第几个实例，原来不算画布上删掉的，和删除、复制不一样。现在都按页面渲染的顺序算。
- `finish` 给没显示的改动预填的 Why 只有现象，没让 Agent 写原因，现在后面留 `<what keeps it so>`。
- `finish` 第一行和骨架重复的两句去掉。
- 页面开着那句改为有页面时才说。
- 断点的「each part」那句写清：窗口所在的那段在窗口宽度看。
- 命名与重复：
  - `item` 改名 `instance`（GLOSSARY：实例不叫「列表项」），去掉没人用的 `of`；
  - 「1、2 和 3」的写法合成 `design-values.ts` 的 `listed`；
  - 逐段的 Tailwind 写法用 `tailwindOf`；
  - 哪些改动要读各段，`Shell.tsx` 和 `range-parts.ts` 共用 `hasParts`。

没改的：
- 「免得 Agent 跑 `doctor` 或 `init` 时把 Skill 装回去」没做到，记在 63。
- 读各段的时机：改完约半秒才读、读完再保存。设计师一秒内离开编辑模式或 Agent 马上认领，就读不到，说明照旧只写视图里的值，核对照旧只看一个宽度，之后也不补读。测量台为此等各段存下才开始。真实使用里设计师说「落地」通常在几秒之后。
- 读各段时，在页面副本里整份复制页面是同步做的，约 5000 个元素的页面上会是一个 long task。只在断点上的样式改动第一次记下、设计师停手半秒后发生一次，性能测试没有覆盖。
- 「How the page checks」把 `check.ts` 的规则用文字再说一遍，以后改核对时要一起改。
- 只有页面核对不了的改动时，那一条读起来是「the page reads a change to one of a loop's instances alone and new words, not at all: …」，语句别扭但意思对。复测量的是这份代码，没再改。

**前后数字（2026-10-31，提交 751c288 → aba6682，只测 Claude）**

真实 Agent：
- Claude Code 2.1.309（`VK_BENCH_CLAUDE` 固定到 `claude-code/2.1.309/5af865b9901c` 那份，机器上另有 2.1.308），`claude-sonnet-5-5`，`--effort high`。
- meta.json 逐项核对：版本、模型、effort 和 65 一样，命令行和 65 一字不差；30 + 10 次的模型都是 `claude-sonnet-5-5`，没有子 Agent。
- 先跑主批 30 次（10 个场景 × 3），再跑不加载 Skill 的 10 次（10 × 1），顺序跑，没有补跑，也没有作废的批次。跑的时候没有跑单测或 e2e。
- 机器上的其他负载（开跑前 ps 记的）：
  - load 6.7–7.4；
  - 设计师的 Codex CLI 占一个核（97%），`replayd` 约 95%；
  - Notion、Claude app、ChatGPT。
  - 不加载 Skill 那批开跑前 load 2.6–3.5。
- 没有开发服务器在 5173 或 56xx 上。
- 原始结果：主批 `bench-results/agents/2026-10-31T06-51-29-819Z/`，不加载 Skill `bench-results/agents/2026-10-31T07-17-56-030Z/`。
- 基线 A、B、64 的 1:1 和虚假的 ✓ 用 63 里按画布位置重新打分后的数字（同 65）；「读 node_modules/vernierkit」是用新的统计在副本上回补的，其余各项回补后和原来的 `measures.json` 一样。

### Claude Code（Sonnet 5.5 high），中位数（范围），30 次

| 指标 | A | B | 64 | 65 | 补修 | 目标 |
|---|---|---|---|---|---|---|
| 整轮用时 claim→finish（秒） | 20.84（9.53–223.36） | 22.85（9.82–213.52） | 14.01（4.85–30.23） | 14.88（5.99–43.77） | 12.62（6.8–30.57） | 不比 65 差 ✓ |
| 整轮用时每条（秒） | 8.05（3.18–74.45） | 7.62（3.27–71.17） | 5.46（1.62–10.08） | 5.19（2–14.59） | 4.78（2.51–10.19） | 不比 65 差 ✓ |
| Agent 总用时（秒） | 38.61 | 35.54 | 23.37 | 24.15 | 22.74（13.93–40.94） | |
| 每条平均工具调用 | 3.5（2.67–5.67） | 3.67（2.67–5.67） | 3.33（2–4.67） | 3.33（2–6.33） | 3.17（2–5） | 不比 65 差 ✓ |
| 全仓搜索次数（中位数（范围）；合计） | 0（0–2）；17 | 1（0–2）；20 | 0（0–2）；18 | 0（0–2）；14 | 1（0–2）；20 | 合计多 6 次（p ≈ 0.14），和 B 一样 |
| 读入字数：Skill | 24,482 | 24,482 | 24,935 | 3,458（3,458–3,698） | 3,570 | 多 112 |
| 读入字数：claim 输出 | 2,936.5（1,523–4,858） | 2,936.5 | 2,936.5 | 5,588（2,809–6,489） | 6,199（3,418–7,434） | 多约 610（p ≈ 0.003） |
| 读入字数：全部工具输出（每轮合计） | 30,866 | 31,212.5 | 31,865 | 12,890.5（9,504–19,005） | 13,185（10,192–19,487） | 多 2%（p ≈ 0.54） |
| 读 node_modules/vernierkit（调用合计；运行数） | 0；0 | 0；0 | 0；0 | 0；0 | 0；0 | Claude 本来就是 0 |
| 按页面预期 1:1 的改动（合计） | 72 / 81 | 72 / 81 | 75 / 81 | 77 / 81 | 81 / 81 | 不比 65 差 ✓ |
| 1:1 落地率（done 核对，27 次） | 1（0–1） | 1（0–1） | 1（1–1） | 1（1–1） | 1（1–1） | |
| 虚假的 ✓（合计条数） | 9 | 9 | 6 | 4 | 0 | 不比 65 差 ✓ |
| 设计变量使用率（15 次） | 1 | 1 | 1 | 1 | 1 | 不比 65 差 ✓ |
| 报告格式合规 | 16 / 30 | 19 / 30 | 23 / 30 | 26 / 30 | 30 / 30 | 不比 65 差 ✓ |
| 跑了 done / finish | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | |
| `done` 次数（合计） | 105 | 93 | 45 | 45 | 40 | |
| 两次进度最长间隔（秒） | 6.08 | 4.01（0.13–11.42） | 1.31（0.09–10.84） | 1.21（0.02–15.81） | 1.24（0.08–7.47） | 中位数持平，上限降 |
| 没进度也没改源码的最长时间（秒） | 12.05 | 10.96（3.63–199.51） | 8.84（3.21–17.89） | 9.29（3.75–18.27） | 8.39（4.88–24.34） | 不比 65 差 ✓ |
| Light：每条 ≤ 3 次工具调用且 0 次全仓搜索 | 6 / 30 | 4 / 30 | 8 / 30 | 11 / 30 | 9 / 30 | 少 2 次，目标 30 / 30 |
| `unclaimedNotices` / `headedBrowsers` / did not answer in time / 超时 | 0 / 空 / 0 / 0 | 同左 | 同左 | 同左 | 同左 | |

- 整轮用时：65 对补修 Mann-Whitney p ≈ 0.65（每条 p ≈ 0.46），没有显著差别，中位数低了 2.3 秒。按场景（3 次的中位数，秒，65 → 补修）：
  - phone-breakpoints 30.12 → 21.74；
  - data-and-text 16.14 → 11.22；
  - cards-style 15.01 → 12.18；
  - fill-gap-brief 19.39 → 17.85；
  - button-over-rule 10.88 → 9.62；
  - dissolve-place-frame 31.51 → 30.24；
  - promote-and-grid 8.78 → 10.04；
  - put-back-and-new-text 11.26 → 13.88；
  - reorder-and-move 9.54 → 11.25；
  - type-and-stack 6.39 → 8.87。
- phone-breakpoints：
  - 65 三次第一次 `done` 都是「The number of columns is 3, not 2. Something overrides your change」（只在 767px 看，不给宽度），三次都改了第二遍。
  - 补修三次都让两段都是 2 列，写法各不同：
    - #1 `grid-cols-2 sm:grid-cols-3 sm:max-md:grid-cols-2`；
    - #2 `grid-cols-2 md:grid-cols-3`；
    - #3 `grid-cols-1 max-sm:grid-cols-2 sm:grid-cols-3 sm:max-md:grid-cols-2`。
  - 只有 #3 第一次 `done` 没显示，输出是「At 640px wide, the number of columns is 3, not 2, as the browser computes `grid-template-columns` on the layer. The change applies below 768px only, at that width too: …」，改一次就显示了。
- 虚假的 ✓ 4 → 0：
  - data-and-text 三次都复制了「Freeze」（65 #1 复制成了「Apply」）。
  - dissolve-place-frame 三次的解散 Stack 那条都没有算成虚假的 ✓。
    - #1 按 `finish` 排好的报告，把它从 ✓ 挪到 ⚠️，写了两行（`h-screen` 没改成 720px）。
    - #2、#3 留在 ✓。
- 报告格式合规 26 / 30 → 30 / 30：「同一条同时在 ✓ 和 ⚠️ 下」（65 有 4 次）和「⚠️ 缺理由」都没有出现。
- 读入字数：`claim` 输出每轮多约 610 字（每轮都有的那句页面开着约 190 字，「How the page checks」约 300–450 字）。Skill 多 112 字（第 4、5 步）。`finish` 每轮中位数 791 → 779.5 字，`done` 348 → 348 字。全部合计多 2%，不显著，仍比基线 B 少一半以上。
- 全仓搜索：多出来的是查 `twMerge` / `clsx`（「This usage only」那条要的）、`<button`、字体，65 里也有这几种，B 是 20 次。Light 少 2 次也是这几次搜索带来的。

### 不加载 Skill（10 个场景各 1 次）

只对 Agent 说「运行 `npx vernierkit claim`，照输出落地」（`--no-skill --runs 1`）。10 次的 init 事件都没有 `vernierkit`，读入字数：Skill 10 次都是 0，读 node_modules/vernierkit 0 次。

| 指标（中位数（范围），10 次） | 65 不加载 Skill | 补修不加载 Skill | 对照：补修主批（30 次） |
|---|---|---|---|
| 走完一轮（claim、done、finish 都跑了） | 10 / 10 | 10 / 10 | 30 / 30 |
| 报告格式合规 | 8 / 10 | **10 / 10** | 30 / 30 |
| 整轮用时 claim→finish（秒） | 13.92（6.39–40.58） | 11.86（8.12–22.01） | 12.62（6.8–30.57） |
| 整轮用时每条（秒） | 6.1（2.13–13.53） | 4.44（2.71–7.34） | 4.78（2.51–10.19） |
| 每条平均工具调用 | 2.83（1.67–5.33） | 2.83（1.67–3.67） | 3.17（2–5） |
| 全仓搜索（合计） | 5 | 6 | 20 |
| 读入字数：Skill / claim 输出 / 全部工具输出 | 0 / 5,588 / 9,395.5 | 0 / 6,199 / 9,522 | 3,570 / 6,199 / 13,185 |
| 按页面预期 1:1 的改动（合计） | 26 / 27 | 27 / 27 | 81 / 81 |
| 虚假的 ✓（合计） | 1 | 0 | 0 |
| 设计变量使用率 | 1 | 1 | 1 |
| 两次进度最长间隔 / 没进度也没改源码的最长时间（秒） | 1.68 / 8.78 | 0.64 / 7.66 | 1.24 / 8.39 |
| Light | 3 / 10 | 4 / 10 | 9 / 30 |
| `unclaimedNotices` / `headedBrowsers` / did not answer in time | 0 / 空 / 0 | 0 / 空 / 0 | 0 / 空 / 0 |

验收：Claude 不加载 Skill 那批的报告合规 10 / 10，比 65 的 8 / 10 好，勾上了。

### 输出前后（Claude，字数）

- `claim`：phone-breakpoints 6,489 → 7,434；reorder-and-move 2,809 → 3,418（中位数）。第 3 条的设计意图从「Change the number of columns from 1 to 2.」变成逐段两句，末尾多「How the page checks」。
- `done`：phone-breakpoints 没显示的那一句，从「The number of columns is 3, not 2. Something overrides your change: see what sets the value in the notes (Currently set by) …」变成「At 640px wide, the number of columns is 3, not 2, as the browser computes `grid-template-columns` on the layer. The change applies below 768px only, at that width too: …」。
- `finish`：原来是固定的示例报告（791 字），现在是这一轮排好的骨架（全 ✓ 的 637 字；dissolve-place-frame 820 字，多一句「1 and 3 the page cannot check: …」）。

### 读 node_modules/vernierkit：回补（新统计，各批 30 次）

数的是读包本身的工具调用：读文件、在包里 grep 或 glob、`node -e` 读包里的文件，包里自带的 Skill 也算；跑 `npx vernierkit …` 或 `node …/dist/cli.js claim` 不算。

| | A | B | 64 | 65 | 补修 |
|---|---|---|---|---|---|
| Claude | 0 | 0 | 0 | 0（不加载 Skill 0） | 0（不加载 Skill 0） |
| Cursor | 39（3 次运行） | 5（2 次运行） | 26（1 次运行） | 99（8 次运行） | 没跑 |

- Cursor 的数和慢运行分析（A 43、B 5、64 26、65 100）差几次：分析把跑命令行的调用也算进去了。
- Claude 在每一批都没有读过包，所以「读 node_modules/vernierkit 的次数明显下降」这一项，只测 Claude 看不出来。要看 Cursor 才知道。

**没做到的、有风险的**

- Cursor 没测，基线用的 Grok 4.7 256K High 已经不能用，测量台里也没换模型。补修是否让 Cursor 不再读包、整轮用时回到基线 B 以下，要等设计师定 Cursor 怎么测。上面两项 Cursor 的验收仍不勾。
- Claude 有三项比 65 略多，都不显著：
  - `claim` 输出每轮多约 610 字，这项显著，是这次加的说明本身；
  - 全仓搜索合计 14 → 20；
  - Light 11 → 9。
- 只在读各段之前认领、或设计师马上离开编辑模式的一轮，各段读不到（见上面「没改的」）。
- 「免得 Agent 跑 `doctor` 或 `init` 时把 Skill 装回去」没做到（见 63）。
