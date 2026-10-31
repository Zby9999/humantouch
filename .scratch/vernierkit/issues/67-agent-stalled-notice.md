# 67: Agent 停住时提示设计师

**What to build:** 认领之后，如果一段时间里页面上没有新的改动显示、Agent 没有 `done`、源码也没变，切换按钮上直接出现「Agent 好像停了」，给两个选择：继续等（并提示设计师对 Agent 说「继续落地」，`claim` 会重新给出还没做的改动），或结束这一轮。Agent 恢复后提示自动消失。长按手动解锁照旧可用。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0005、0012）。

**Blocked by:** 63, 64

**Status:** done

- [x] 等待多久算停住，由 63 测出的真实 Agent 两次进度之间最长的间隔来定（例如取其 1.5 倍），定法和数值写在 Comments
- [x] 「做到一半退出」剧本：提示在停住后不超过阈值 + 5 秒出现
- [x] 「两次进度之间停很久再继续」剧本与真实 Agent 跑分：Agent 正常工作时误报 0 次；恢复后提示消失
- [x] 「结束这一轮」与长按手动解锁效果相同
- [x] 前后数字记在 Comments，spec 随之更新

## 背景

- 现在 Agent 中断后编辑层一直锁着，要设计师知道长按切换按钮才能解锁，这个入口不好找。
- 进度要按页面算（64），否则 Agent 不报 `done` 时会被误判为停住。

## Comments

**做了什么（起点 fffcb8e，一个提交）**

- 认领之后，页面看得到的三样东西一段时间都没动，切换按钮旁边就出现「Your Agent seems to have stopped」（`StalledNotice.tsx`，`data-vk-notice="stalled"`）。这三样是：
  - 64 的页面进度：进度环的条数变了，含页面先看到的 `seen`；
  - `done` 的问答：`done` 的 ask key、`claimed.done`、`finish` 的 closing key；
  - 66 用的热更新：开发服务器给这个页面送了热更新，开始和结束都算。
- 任意一样动了，提示马上消失，重新计时。计时在 `agent-stall.ts`（`watchStall`、`STALL_MS`）。页面回到前台时再看一次，因为后台标签页的计时器可能晚到。认领前、一轮结束后都不提示；改动列表开着时也不显示。
- 两个选择：
  - **Keep waiting**：提示消失，重新等一整段。提示里写了可以直接对 Agent 说的话：“Continue applying my design changes”。
  - **End this round**：和长按走同一个 `endRound`（`POST /unlock`）。长按照旧可用。手动解锁后丢弃画布的行为没动，留给 68。
- `claim` 重新跑，原来是把所有改动再打一遍，每条标 `Done` / `Not done yet`，而且按 Agent 自己报的 `done` 算，不按页面算。现在：
  - 只给出还没落地的改动，按 `appliedOf` 算：页面显示了的，或 `done` 过且页面没说没显示的，都算已落地。
  - 开头说已落地几条、是哪几条，后面的「How to write them」也只覆盖剩下的改动。
  - 全部落地时只说一句，让它运行 `finish`。
  - Skill 第 1 步那句改成 “Running `claim` again prints the notes for the changes not applied yet.”，Skill 少了 8 个字。
- 提示的代码和样式都在后加载的 `editor.dev.js` 里，`Toggle.tsx` 没改。
- 测量台：
  - raw.json 加了 `stalledNotices` 和 `times.stalledNotices`。
  - measures.json 加了 `stalledNotices`、`stalledNoticesAtMs`，并把 `unclaimedNotices`、`unclaimedNoticesAtMs` 一起放了进去。66 原来只记在 raw.json 里；这一项超出了 brief，因为写法要一样才一并加上。
  - summary.md 加了两行指标，末尾一行写提示合计，并逐次列出出现的时刻（从 Agent 开始算）。
  - `recordNotices` 同时记两种提示，同一个页面只记一份。
- spec 的改动：
  - 用户故事加 95a；
  - `.vernier/` 状态一节写明 `claim` 重新跑时怎样；
  - 新增「Agent 停住时（ticket 67）」一节；
  - 测试接缝写明阈值怎样缩短。

**阈值：怎么定的、数据分布、数值**

- 停住的定义照 ticket：页面上没有新进度、Agent 没有 `done`、源码也没变，三者同时成立。每次运行取最长的一段，从 `claim` 算到 `finish`。
- 信号来自 raw.json：
  - `times.dones`：`state.check.at` 每次变化，也就是每次 `done`；
  - `times.shown`：观察页上某条改动第一次显示；
  - `times.edits`：项目里源码的 mtime 变化。
- 自己补算的方法（`scratchpad/stall.py`）：把 claim、范围内的上述信号、finish 排好序，取相邻两个之间的最长间隔。最新四批和 measures.json 里的 `maxStillMs` 最大值逐一相同。
- 测量台的 `maxStillMs` 本来就把 `done` 算进了 progress，所以和 ticket 的定义一致。
- 核对了两点：
  - mtime 是不是就等于「给页面送了热更新」：最新四批 diff 里改到的文件只有 `src/App.tsx`、`src/components/Card.tsx`、`src/index.css`，都是页面用到的模块。
  - 最长那次（Cursor 不加载 Skill，dissolve-place-frame #1）第一次改的是 `src/App.tsx`，见 transcript 的 editToolCall 时刻。之前 6 分钟都在读 `node_modules/vernierkit/dist/editor.dev.js`。
- 剔除了这些运行：
  - 超时：B Cursor dissolve-place-frame #1、#2（17-50-09），64 Cursor dissolve-place-frame #3（22-08-36）；
  - 中途退出、没有 claim：65 Cursor cards-style #1（05-44-47），B' Cursor promote-and-grid #3（08-31-09）。
  - 最新四批一条都没剔。

| 批次（代码） | 次数 | 中位数 | p90 | 最长（秒） | 最长那次 |
|---|---|---|---|---|---|
| Claude 65 补修 `06-51-29-819Z` | 30 | 8.39 | 14.98 | 24.34 | dissolve-place-frame #2，claim→第一次改 |
| Claude 补修不加载 Skill `07-17-56-030Z` | 10 | 7.66 | 11.80 | 16.28 | dissolve-place-frame #1 |
| Cursor 最终 `09-52-55-final-9623bd4` | 30 | 49.68 | 237.17 | 282.48 | phone-breakpoints #2 |
| Cursor 最终不加载 Skill `11-06-12-final-9623bd4-noskill` | 10 | 78.92 | 195.03 | **367.14** | dissolve-place-frame #1 |
| 参考：Claude 64 `21-52-07` / 65 `03-40-24` / 65 不加载 Skill `05-38-19` / B `17-25-02` / A `15-23-00` | 30/30/10/30/30 | 8.84/9.29/8.78/10.96/12.05 | | 17.89/18.27/20.75/199.51/183.34 | |
| 参考：Cursor 64 `22-08-36` / 65 `03-57-30` / B' `08-31-09` + `09-34-05` / B `17-50-09` / A `15-52-04` | 29/30/24+6/28/30 | 59.8/67.97/44.57,64.6/37.44/35.71 | | 346.12/**603.19**/473.29,151.82/406.83/471.88 | |

- 最新四批每次运行最长的一段（秒，升序）：
  - Claude 30 次：4.9 … 15.1、18.6、24.3；
  - Cursor 30 次：7.6 … 165.7、170.9、237.1、237.2、246.8、258.5、282.5；
  - Cursor 不加载 Skill 10 次：7.4、17.5、27.7、34.9、35.9、121.9、188.4、194.6、195.0、367.1。
- 40 + 40 次里，最长的一段都在 claim 和第一次改源码之间（Cursor 先想、先读），没有一次落在两次改动之间或最后一次改动到 `finish` 之间。
- 早期批次里有 4 次例外：B Cursor fill-gap-brief #3 是最后一个信号到 `finish` 406.83 秒；B 和 A 各有几次落在中间。
- **阈值 = 1.5 × 367.14 秒 = 550.7 秒，取整为 551 秒（`STALL_MS = 551_000`，约 9 分 11 秒）。** 倍数照 ticket 用 1.5，没有换。

**剧本（`e2e/tests/applying-bench.spec.ts`，`bench-results/playbooks/`）**

- 怎么缩短阈值：用 Playwright 的 `page.clock` 把页面的时间往前拨，编辑层里没有为测试留任何开关或配置。设 `VK_BENCH_STALL_REAL=1` 时，「做到一半退出」按真实时间等满。
- 「做到一半退出」（stops-halfway）：

| | 前（fffcb8e，65 补修三跑的 e2e，2026-10-31 20:08） | 后 |
|---|---|---|
| 提示在停住后多久出现 | 无提示（看了 15 秒，`stallNoticeAfterMs: null`） | 真实时间：**551,149 ms**（阈值 551,000，上限 556,000）✓；时钟拨快：551,302 ms ✓ |
| 结束这一轮后提示还在吗 | – | 不在 |
| 进度差 / 核对覆盖率（停住时） | 0 / 100% | 0 / 100% |
| 没认领的提示 | 0 | 0 |

  真实时间那次在 2026-10-31 12:27–12:37Z，load 约 10，这一轮的剧本结果都在 `bench-results/playbooks-67/`（`bench-results/playbooks/` 里原有的结果没动）。

- 「两次进度之间停很久再继续」（pauses-then-goes-on）：

| | 前 | 后 |
|---|---|---|
| 停的时间 | 15 秒 | 阈值减 10 秒（541 秒，时钟拨快） |
| 停的时间内出现的提示（误报） | 无提示 | 0 ✓ |
| 停过阈值时有提示吗 | – | 有 |
| 恢复（代码送到页面）后提示还在吗 | 无提示 | 不在 ✓ |
| `finish` 后再拨过一个阈值，有提示吗 | – | 没有 |
| 整次出现的提示 | – | 1（停过阈值那一次） |

- 照流程走的剧本（follows-the-workflow）：停住提示 0 次，改成断言。
- 新增「结束这一轮和长按效果相同」（ends-round-from-notice）：
  - 同一轮停在一半，一次从提示点 End this round，一次长按，逐项比较。比较的项有：归档的 `ended`、`done`、`applied`、每条核对结果，`.vernier/` 剩下的文件，切换按钮可用与否和角标，再进编辑模式时的改动数和画布。
  - 两边完全相同：`ended: "unlocked"`、done [1]、applied [1]，1 shown、2 和 3 not shown，`.vernier/` 只剩 history，角标 0，下一轮 0 条，画布上卡片是红色。
  - 同一个测试里还测了：Keep waiting 后提示消失，再过阈值减 5 秒仍然没有，再过 6 秒又出现。

**切换按钮体积**（照 34 / 66 的量法：`react.dev.js` 加它导入的共享 chunk，gzip，zlib 默认级别）

- fffcb8e：819 + 9,182 = **10,001 B**，改后同样 **10,001 B**（819 + 9,182），限额 10,240 B，没变。
- 进入编辑模式才加载的 `editor.dev.js` 是 98,439 → 99,078 B。

**真实 Agent：Claude 30 次（也是 Claude 的最终数字）**

- 运行条件：
  - Claude Code 2.1.309，`VK_BENCH_CLAUDE` 固定到桌面 app 的 `claude-code/2.1.309/5af865b9901c`，跑前跑后 `--version` 都是 2.1.309；
  - `claude-sonnet-5-5`，`--effort high`。
- meta.json 和 65 补修批 `2026-10-31T06-51-29-819Z` 逐项比对，完全相同：版本、模型、effort、命令行、skill。
- 30 次的模型都是 `claude-sonnet-5-5`，没有子 Agent，API 重试 0。
- 运行方式：`pnpm bench:agents --agents claude --runs 3`，无头，每次都在临时目录的示例项目副本里跑，开发服务器端口 5620 起。
  - 开跑前 5620–5649 都空着。
  - 开跑前 load 8.9–10.9，`replayd` 约 280%，另有别的工具开着的几个 Chrome for Testing（不是测量台的）。
  - 跑完 load 7.6–9.7。65 补修批开跑前是 6.7–7.4。
  - 一次跑完，没有补跑，也没有作废的批次。跑的时候没有跑单测或 e2e。
- 原始结果：`bench-results/agents/2026-10-31T12-37-19-686Z/`。
- 代码：fffcb8e（含 65 补修三）加本 ticket。本 ticket 只改了 Skill 第 1 步的一句（少 8 字），claim 第一次的输出一字没动。phone-breakpoints 和 dissolve-place-frame 两个场景的 claim 变长，是补修三加的字。
- **停住提示 `stalledNotices` 30 次都是 0（误报 0）**，`unclaimedNotices` 30 次都是 0，`headedBrowsers` 30 次都是空。超时 0，退出码都是 0。

| 指标，中位数（范围），30 次 | 65 补修 `06-51-29-819Z` | 67 `12-37-19-686Z` | 比较 |
|---|---|---|---|
| 整轮用时 claim→finish（秒） | 12.62（6.8–30.57） | 15.22（5.74–28.59） | 中位数多 2.6 秒，Mann-Whitney p ≈ 0.38，不显著；上限低了 |
| 整轮用时每条（秒） | 4.78（2.51–10.19） | 5.28（1.91–9.53） | p ≈ 0.28 |
| Agent 总用时（秒） | 22.74（13.93–40.94） | 24.43（14.49–41.23） | p ≈ 0.27 |
| 每条平均工具调用 | 3.17（2–5） | 3.33（2–4.67） | p ≈ 0.38；合计 96.3 → 99.0 |
| 全仓搜索（中位数（范围）；合计） | 1（0–2）；20 | 1（0–2）；24 | 多 4 次，p ≈ 0.55 |
| 读入字数：Skill | 3,570 | 3,562 | 少 8（本 ticket 改的那句） |
| 读入字数：claim 输出 | 6,199（3,418–7,434） | 6,199（3,418–7,757） | 只有补修三的两个场景变了，见下 |
| 读入字数：全部工具输出 | 13,185（10,192–19,487） | 13,334.5（10,184–19,820） | 合计多 0.9%，p ≈ 0.97 |
| 读 node_modules/vernierkit | 0 | 0 | |
| 按页面预期 1:1 的改动（合计） | 81 / 81 | **80 / 81** | 少 1，见下 |
| 1:1（done 核对，27 次） | 27 次都是 1 | 27 次都是 1 | |
| 虚假的 ✓（合计） | 0 | **1** | 变差，见下 |
| 报告格式合规 | 30 / 30 | 30 / 30 | |
| Light：每条 ≤ 3 次工具调用且 0 次全仓搜索 | 9 / 30 | 8 / 30 | 少 1 次，目标 30 / 30 |
| 跑了 done / finish | 100% / 100% | 100% / 100% | |
| `done` 次数（合计） | 40 | 44 | |
| 设计变量使用率（15 次） | 1 | 1 | |
| 两次进度最长间隔（秒） | 1.24（0.08–7.47） | 1.25（0.1–4.35） | |
| 没进度也没改源码的最长时间（秒） | 8.39（4.88–24.34） | 9.41（3.64–21.44） | 最长 21.44 秒，离阈值 551 秒很远 |
| 被权限拦下的工具调用（合计） | 7 | 13 | 都是 Agent 想用 `python3 -` 或 `sed -i`、`cat >` 改文件，被拦下后改用 Edit |
| 停住提示 / 没认领的提示 / headedBrowsers | – / 0 / 空 | **0 / 0 / 空** | |

- 按场景（3 次的中位数）：整轮用时（秒）、每条工具调用、claim 输出字数、全部字数。
  - button-over-rule：9.62 → 9.67、3.5 → 3.5、4,565 → 4,565、10,824 → 10,816；
  - cards-style：12.18 → 15.79、3 → 3.33、6,226、14,181 → 14,232；
  - data-and-text：11.22 → 12.88、2.67 → 3、4,928、12,495 → 12,582；
  - **dissolve-place-frame**：30.24 → 27.03、4.67 → 4.33、6,624 → 6,649（+25）、19,152 → 18,586；
  - fill-gap-brief：17.85 → 22.48、3.33 → 3.67、6,599、15,425 → 15,556；
  - **phone-breakpoints**：21.74 → 21.62、4 → 4、7,434 → 7,757（+323）、16,085 → 17,254；
  - promote-and-grid：10.04 → 13.0、2.67 → 3.33、6,172、11,997 → 11,994；
  - put-back-and-new-text：13.88 → 15.23、2.67 → 2.67、6,376、13,891 → 13,908；
  - reorder-and-move：11.25 → 10.97、3 → 3、3,418、10,192 → 10,184；
  - type-and-stack：8.87 → 6.29、2.33 → 2、5,882、12,794 → 12,762。
- 补修三的两个场景：
  - phone-breakpoints：
    - claim 多 323 字，全部字数多约 1,170；
    - 用时、工具调用持平，全仓搜索 3 → 4；
    - 三次 `done` 都没有一次说没显示（65 补修 #3 有一次），1:1 9 / 9。
  - dissolve-place-frame：
    - claim 多 25 字；
    - 用时 30.24 → 27.03，工具调用 4.67 → 4.33；
    - `done` 次数合计 7 → 6，说没显示的 1 → 0，1:1 9 / 9。
  - 这两个场景没有变差。
- **变差的一项：fill-gap-brief #3**，改动 2（循环里 3 张卡片的 gap 改成 12px）。
  - Agent 改了 `Card` 组件本身：
    - `<article>` 加 `flex flex-col ${gap}`，默认 `gap-2`；
    - 去掉 `<p>` 的 `mt-2`；
    - 这 3 张卡片传 `gap="gap-3"`。
  - 第 4 张卡片因此也成了 flex，靠 `gap-2` 看起来和原来一样，但不再是 `display: block`。场景的预期「the fourth card is as it was」不成立，1:1 少 1。报告里把它列在 ✓ 下，所以算一次虚假的 ✓。
  - 页面核对只看这一处使用的 3 张，结果是显示了。
  - 这个场景的 claim 输出和 65 补修一字不差（6,599 字），是 Agent 写法上的偶然，和本 ticket 的改动无关。按要求没有调代码。
- 用时：中位数多 2.6 秒、全仓搜索多 4 次，都不显著。这次开跑时机器负载比 65 补修高（load 约 9–11 对 6.7–7.4），多出来的时间集中在 cards-style、fill-gap-brief、promote-and-grid 这些 claim 一字没变的场景，看不出和本 ticket 有关。如实记下。
- **Cursor 这次没跑**，设计师定的。Cursor 的停住误报，会在 ticket 68 之后用最终代码跑 Cursor 30 次时一并测，那时直接用测量台默认的 `grok-4.7-high`。最新两批 Cursor 的停住时长最长 282.48 秒（加载 Skill）和 367.14 秒（不加载），都低于阈值 551 秒。按 1.5 倍定的阈值，用这两批的数据回看不会误报，但没有实测过。

**测试**

- 新增和改动的测试：
  - `test/agent-stall.browser.test.ts`（4 条）：阈值前不提示，到了才提示；热更新、`moved()` 和继续等都会重新计时并收起提示；停掉以后什么都不说。
  - `test/cli.test.ts`「claim, again」（3 条）：只给出没落地的（`done` 过和页面显示了的都不给）；`done` 过但页面说没显示的再给；全部落地时只让它 `finish`。
  - `e2e/bench/notices.test.ts`：停住提示按标记记，和没认领的提示分开。
  - e2e 剧本：stops-halfway、pauses-then-goes-on，新增 ends-round-from-notice；follows-the-workflow 加了停住提示 0 次的断言。
- `pnpm typecheck` 通过。
- `pnpm test`：vitest 29 个文件，637 条通过、1 条跳过；`node --test` 29 条通过。
- `VK_E2E_PORT=5600 pnpm test:e2e`：
  - 第一次 249 通过、1 失败、76 没跑。失败的是 `views.spec.ts:188`（⌘Z 后邻视图同一帧，ADR 0011），当时 load 23；单独重跑 3/3 通过，project files 那 76 条单独跑也都通过。
  - 第二次完整跑：325 通过、1 跳过（原本就跳过的那条）。
  - `VK_BENCH_STALL_REAL=1` 单独跑 stops-halfway 一次，9.2 分钟，通过。
- 没跑 ticket 22 的性能测试。改动只在认领之后起作用（一个计时器、一个热更新监听，每次渲染拼一个短字符串），那时编辑模式已经收起，不碰拖拽和改值，不影响大页面上的编辑性能。

**code-review（fffcb8e 到工作区，两路）**

- Standards：没有明确违反文档的。按意见改了这些：
  - 去掉 `stallNotice` 这个别名；
  - 测试里把 `thinStroke` 改名为 `halfOpacity`（它其实是不透明度）；
  - 长按的几步抽成 `pressAndHold`；
  - 注释写错了位置的那句（「End this round, from the notice」）改正；
  - `agent-stall.ts` 开头说清：它自己只看热更新，进度和 `done` 由编辑层通过 `moved()` 告诉它；
  - 多看的 5 秒取名 `WATCH_PAST_MS`；
  - `stop()` 补了注释。
- Standards 提了但没改的：
  - spec 的状态一行仍写「画布丢弃」，这和 ADR 0013 冲突，是原来就有的，留给 68；
  - e2e 从页面模块 `agent-stall.ts` 导入 `STALL_MS`。这个模块导入时没有副作用，Playwright 能加载；
  - summary 里指标名的字符串重复用了两次。
- Spec：没有大的偏离。按意见改了这些：
  - 提示里给出一句能直接对 Agent 说的话；
  - spec 写明已认领时才打开的页面从打开时起算；
  - `recordNotices` 在同一个页面上只记一份，以前第二轮会重复记。
- `unclaimedNotices` 进 measures.json 和 summary.md 超出了 brief，已在上面注明。

**验收**

- [x] 阈值：由真实 Agent 最长的停住时长定，倍数 1.5，定法和数值见上：551 秒。
- [x] 「做到一半退出」：真实阈值下 551,149 ms，不超过阈值 + 5 秒。
- [x] 「两次进度之间停很久再继续」：误报 0，恢复后提示消失。真实 Agent 方面：Claude 30 次误报 0；Cursor 留到 68 之后测，见上。
- [x] 「结束这一轮」：和长按走同一条代码路径，逐项测过，效果相同。
- [x] 前后数字记在上面，spec 已更新。

**风险**

- 阈值约 9 分钟。Agent 真的退出后，设计师最多要等这么久才看到提示。阈值的长短是被 Cursor 不加载 Skill 时认领后长时间读包撑起来的，Claude 最长只有 24 秒。
- 早期代码上有更长的一段：65 Cursor phone-breakpoints #2 停了 603 秒，B 的 fill-gap-brief #3 在 finish 前停了 407 秒。Cursor 再出现这样的情况会误报。68 之后的 Cursor 30 次要看这一项。
- 读不到热更新时（Next.js）只看进度和 `done`。Agent 改了一长段代码、页面又一直看不出改动时，会比 Vite 上更早提示。这种情况没测。
- 已认领时才打开或刷新的页面，从打开时起算，提示最多晚一个阈值。
- 页面在后台标签页里时计时器会晚到，回到前台时马上再看一次；后台时没有提示，反正也看不到。
- 剧本用 Playwright 的时钟拨快页面时间，只在 stops-halfway 用真实时间量过一次（要 9 分多钟），默认的 e2e 里不跑。
