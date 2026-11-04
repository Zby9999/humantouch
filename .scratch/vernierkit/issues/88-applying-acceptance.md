# 88: 落地验收：Claude 和 pi 跑全部标准场景

**What to build:** Agent 验收的前一半（ticket 24 原来的落地部分）。用测量台让 Claude（Sonnet 5.5，effort medium；原定 high，设计师 2026-11-05 改）和无头 pi（DeepSeek v4.1 flash，command-code）各跑全部标准场景（85、86、87 补齐之后的那一套），按 docs/goals.md 分别出数，作为第一版在这两家 Agent 上的落地判定。结论决定要不要改 Skill 措辞，然后才发布到 npm。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0006、0012、0013）。

**Blocked by:** 85、86、87、90、92、95

**Status:** ready-for-agent

- [ ] 跑之前先问设计师：场景数 × 2 家 × 每个场景几次，总次数，估计用时；设计师同意了再跑。每个场景几次由设计师定（建议 Claude、pi 各 2 次，同一场景两次结果不一样时再补 1 次）
- [x] 每家分别出这些数（goals 的标准写在旁边）：
  - 1:1 落地率 ≥ 95%（以 `done` 的核对为准，不以 Agent 自报为准）
  - 虚假的 ✓ = 0
  - 设计变量使用率 ≥ 90%（存在匹配的设计变量时）
  - 每条改动平均 ≤ 3 次工具调用、0 次全仓搜索
  - 报告合规（每条没落地 1:1 的改动都在 ⚠️ 下，有原因和替代做法）
  - 核对覆盖率 100%、进度准确
  - 整轮用时和读入字数（记下来，作为以后的基线）
- [x] 按场景、按改动类别列出没达标的地方，每条找到原因（Agent 没照 Skill、Skill 写得不清楚、`claim` 的说明不够、页面核对判错、场景本身的问题），原始记录留在测量台的结果目录里
- [x] 结论记在 Comments：哪几项达标、哪几项没有；要不要改 Skill 措辞、要不要把截图从路线图提前（原 24 的最后一条）。要改的东西另开 ticket（编号在 main 上取），不在这张 ticket 里改代码
- [x] 开跑时把设计师 pi 的 `settings.json`、`models.json` 的指纹（内容摘要，不是内容本身）记进每次跑的结果；pi 带 fff 跑（ticket 92），结果里标明 fff 的版本
- [x] 87 的 `next-client-stack-breakpoint` 场景里，Yearly 选项的填色改在 `.selected` 规则上还是只改在 Yearly 上，两种都算对（87 代定第 7 条，设计师 2026-11-04 确认）；结果里写明每家 Agent 每次用的是哪一种。Next 场景的改动是不是写在 `.module.css` 里（87 遗留风险第 4 条），看 diff 人工核
- [x] **跑前检查一**：真实跑之前，测量台在 Agent 结束后量页面的等法改成和脚本那一遍一样（`endState`，等页面显示出来，最长 `SCRIPTED_END_MS`，现改名 `END_STATE_MS`），不再固定等 3 秒、刷新一次就量；只改测量台，不改 `packages/`，改完用 `--scripted` 再验一遍。否则 Next 编译慢时，写对了、`done` 核为 ✓ 的改动会被量成没显示，算成虚假的 ✓（86 遗留风险第 7 条）
- [x] **跑前检查二**：第一次真实跑 `flow-undo-last` 时先看 Claude 被权限拦下的次数；不是 0 就停下，先修名单再接着跑（86 遗留风险第 1 条：Claude Code 怎么匹配带管道的新规则，仓库里没法证实）
- [ ] Cursor、Codex 不在这次验收里；goals 不改（以后有额度再验）

## 背景

- 设计师决定（2026-11-03）：Agent 验收按「先跑落地验收（本 ticket），再发布到 npm（设计师自己操作），最后跑安装验收（ticket 24）」的顺序；这次只验 Claude 和 pi。docs/goals.md 不改：Codex、Cursor 以后还要验，这次不算偏离。
- 真实 Agent 的数字只拿同一 Agent、同一模型比较（goals「度量」）。之前的基线（ticket 63–68、76、81）是 Claude 和 Cursor 在旧场景上的，pi 没有基线，这次的数字就是它的基线。
- 跑的时候注意计时卫生：每次计时前后看 `ioreg -r -k AppleClamshellState -d 4`（合盖睡眠会拉长用时）。

## 设计师决定（2026-11-03，分诊）

- 只验 Claude 和 pi；先落地验收，再发布，最后安装验收。
- 任务由规划会话来拆。

## 设计师决定（2026-11-03，跑法）

- 跑法维持现状：Claude 照 63 起的白名单（只放行读、改、搜索的工具和 `npx 03kind`、`git diff` 等几种命令，不上网）和配置隔离（只读项目的设置，不带设计师的插件、hooks、MCP）；pi 照 ticket 85 同一个意思。
- 已知的偏差：白名单会挡下 Agent 正常的改文件方式（67 那轮 Agent 想用 `sed -i`、`python3`、`cat >` 改文件，被挡 7–13 次后改用 Edit），工具调用次数和用时只会比真实使用偏多、偏长，不会偏好看；1:1 落地率和虚假的 ✓ 由页面核对，不受影响。所以结论里把「被权限拦下的工具调用」单独列出来，每条改动平均工具调用次数同时给出含、不含被拦下的两个数。
- 考虑过的别的跑法：白名单换成只挡危险命令的黑名单；另用设计师自己的配置、全部放开跑少量对照；全部放开。设计师认为现状已能达到真实的检测效果。
- 例外（2026-11-04，设计师确认 86 代定第 8 条）：名单多放行 Skill 自己的撤销，`git -C <这一轮的项目> diff …` 和后面什么都不带的 `git -C <这一轮的项目> apply`；单独的 `git apply` 仍挡，安装验收（91）的名单不带。不放行的话撤销场景测到的是名单，不是 Skill。

## 设计师决定（2026-11-04，跑前检查）

- 86 遗留风险第 1、7 条写进跑前检查（上面两条），由这条线在真实跑之前处理。考虑过的别的做法：另开小 ticket 先改等法，88 等它；不改，碰到没显示的人工复核。

## 设计师决定（2026-11-04，开线）

- 前置都做完了（85、86、87、90、92、95）。现在开线，先做跑前检查一和二要准备的、算好总次数和用时来问设计师；真实跑等 93、96 都合进 main、机器闲下来再跑（开跑前看负载和合盖状态）。
- 考虑过的别的做法：等 93、96 都合完再开线；现在开线、准备好就跑，不等机器闲。
- Skill 要改的措辞保持英文（设计师 2026-11-04 定，见 ticket 86「设计师确认」）。

## 设计师决定（2026-11-05，次数和 effort）

- 每家 Agent 每个标准场景都跑 3 次：24 × 2 × 3 = 144 次，不再按「两次不一样才补第 3 次」。
- Claude 的 effort 压到 medium（Sonnet 5.5，原定 high）；pi 照旧 command-code 的 DeepSeek v4.1 flash，`--thinking high`。结论按这两个设置出数，和之前 effort high 跑的数不直接比。
- 现在开跑：93、96 都已合进 main（7f876c5），负载 5 左右，别的线都停着。先做跑前检查二（Claude 单跑一次 `flow-undo-last`，被权限拦下的次数要是 0），过了就接着跑完，不再问设计师；没过就停下修名单、再问。97、98 等这一轮跑完再开线。
- 考虑过的别的做法：各跑 2 次、两次不一样补第 3 次（约 1.5–2.5 小时）；各跑 1 次；effort 照原定 high。

## 设计师决定（2026-11-05，Claude 的次数）

- Claude（effort medium）每个标准场景默认跑 2 次；同一场景两次结果不一样时补跑第 3 次。pi（DeepSeek v4.1 flash）照原计划，每个场景 3 次。
- 总次数：Claude 48 次加补跑，pi 72 次。

## Comments

### 跑前检查一（2026-11-04）

- 改了什么（只改 `e2e/bench/run-agents.ts`，`packages/` 没动）：
  - Agent 结束后，`runOnce` 不再固定等 3 秒、刷新一次就量，改成和脚本那一遍同一个 `endState`：反复刷新页面，直到每条改动显示、场景的预期都成立，最长 `END_STATE_MS`（原 `SCRIPTED_END_MS`，30 秒，改名是因为真实跑也用它了）。结束时的 `atEnd` 和预期都取它的结果。
  - 每次刷新等所有宽度的页面都刷完（成功或失败）再看，不会去量还在加载的页面（审查时发现、已修）。
  - raw.json 多记两项，只记不计分，旧的原始结果照样能量：`endWaitMs`（结束后等了多久）；`endLoaded`（最后一次看时页面有没有刷新出来）。页面一直没刷出来（开发服务器挂了，或页面被改坏）时，测量台在控制台说一声，脚本那一遍按名字判失败。以前这种情况是刷新抛错、整次跑停掉；现在照常量完，但能和 Agent 自己没落地分开（审查时发现、已修）。
  - 代价：有改动没显示或预期不成立的那次跑，要等满 30 秒才量；Agent 用时按 Agent 自己的起止算，不受影响。
- 测试：没加单元测试。等的循环直接驱动 Playwright 页面，`run-agents.ts` 顶层就跑 `main`，没法单独引入；为了测它抽模块算硬拧。真实跑这条路和 `--scripted` 调的是同一个函数，由 `--scripted` 全程跑到。
  - `pnpm typecheck` 通过；测量台单元测试 121/121。
  - `TK_BENCH_PORT=5620 pnpm bench:agents --dry`：24/24，1 分 46 秒（load 35.8 → 18.6）。
  - `TK_BENCH_PORT=5620 pnpm bench:agents --scripted`：15/15，1 分 42 秒（load 10.4 → 9.4）。都没有重跑。
- 提交：54df44c（换等法）、46ff6b8（审查修的两处）。

### 代定的事（待设计师确认）

1. 结束时第一次看到全部显示、预期成立就量，不再留原来那 3 秒的余量。极端情况下，Agent 最后一下改坏了某条、开发服务器还没带进来，第一次刷新就会量成 ✓。窗口很小：最后一次改通常在 `done` 之前，`done` 本身等页面，之后 Agent 还要写报告。设计师定的是「和脚本那一遍一样」，所以没加「连续两次都成立」。
2. 标了 `notOneToOne` 的改动（如 `third-party` 的 Beta 徽章）结束时不等它显示，和脚本那一遍一样。Agent 照样改了、又列在 ✓ 下时，第一次刷新要是还没带进来，会量成虚假的 ✓。`third-party` 跑在 Vite 上，带得快，风险小；要等它，就得让这个场景每次做对的跑都多等 30 秒。真实跑里碰到这种情况，看 diff 人工复核。


### 设计师确认（2026-11-05）

- 跑前检查一的代定 1、2 都确认：结束时第一次看到全部显示、预期成立就量；标了 `notOneToOne` 的改动结束时不等它显示，真实跑里碰到 Agent 改了又列在 ✓ 下的，看 diff 人工复核。

### 跑前检查二（2026-11-05）

- Claude（effort medium）单跑一次 `flow-undo-last`（原始记录 `bench-results/agents/88-real/claude/flow-undo-last/run-1`）：被权限拦下 1 次。用时 18 秒，工具调用 6 次。撤销成功，场景整体预期 2/2 成立。
- 被拦的是 Claude 自己改写的命令：不带 `-C` 的 `git diff --binary … | git apply && git diff --stat && grep …`。紧接着它照 `npx 03kind last` 打印的原样（`git -C <项目> diff --binary … | git -C <项目> apply`）跑，放行了。
- 结论：Claude Code 对带管道的新规则匹配正常，86 遗留风险第 1 条解除。被拦的正是 86 代定第 8 条故意挡的裸 `git apply`，名单没错。

### 设计师决定（2026-11-05，跑前检查二）

- 名单不改，照跑。这类被拦照「跑法」的规矩单独列出；每条改动的工具调用次数同时给含、不含被拦的两个数。
- 考虑过的别的做法：放行裸 `git apply`（和 86 代定第 8 条相反，名单比真实使用宽）。

### 真实跑结果（2026-11-05）

原始记录在 `bench-results/agents/88-real/`（`meta.json`、`measures.json`、`summary.md`，每次跑一个 `<agent>/<scenario>/run-N/`）。下面的数都从这些文件来：`measures.json` 是跑完时量的，测量台代码（`e2e/bench/`）跑之后没改过，`summary.md` 已经是 Claude 50 次、pi 72 次，不用重新量。被拦的命令、进度、Yearly 的写法、`.module.css` 这几项是我从 transcript、`result.json`、`diff.patch` 另外数的，算法写在各节里。

#### 1. 跑法

| | Claude | pi |
|---|---|---|
| 版本 | Claude Code 2.1.317 | pi 1.4.0，带 pi-fff 0.11.0（`--fff-mode override`） |
| 模型 | `claude-sonnet-5-5` | `command-code/deepseek/deepseek-v4.1-flash`；72 次提供商回答的都是 `deepseek/deepseek-v4.1-flash-1017-cm` |
| effort 设的 / 看到的 | medium（`--effort medium`）/ null | high（`--thinking high`）/ high（72 次都是） |
| 次数 | 50 次：每个场景 2 次，`dissolve-place-frame`、`put-back-and-new-text` 两次结果不同，补了第 3 次；`flow-undo-last` 的 run-1 就是跑前检查二 | 72 次：每个场景 3 次 |
| 有改动的轮 | 48 次，146 条改动（`flow-undo-last` 没有 `claim`） | 69 次，210 条改动 |

- Claude 看到的 effort 是 null，这是设计好的：测量台只认 Claude Code 在 debug log 里说「降到了哪一档」（90053a7）。50 份 `claude-debug.log` 里没有一份提到 effort，就是说没降，按设的 medium 跑。
- pi 的 fff：72 次的 transcript 都把 grep、find 声明成 fff 的（`fffProblem` 都是 null）。fff 的工具一共只调了 9 次，在 6 次跑里。
- pi 配置的指纹：每次跑都记在 raw.json 的 `piConfig` 里（sha256）。`models.json` 72 次都一样。**`settings.json` 跑的过程中变了 4 次**，一共 5 个值，变过去的值没有再出现：开头 9 次一个；北京时间 00:50、00:51（UTC 16:50、16:51）各有 1 次是另外的值；00:52 起 23 次一个；01:21 起 38 次一个。我没看文件内容（规矩），所以不知道变的是什么。模型、thinking 72 次看到的都一样，影响结果的设置看来没变。要设计师看一眼是不是自己或 pi 在那时写了 `settings.json`。
- 时间：北京时间 2026-11-05 00:36 到 01:56，两家交替跑。raw.json 记的是 UTC（2026-11-04 16:36–17:56），所以 `summary.md` 标题里写的是「2026-11-04」。
- 机器：开跑时和每段跑完时一共看了 4 次（00:38–01:54），都没合盖（clamshell No）；1 分钟负载从 6.1 降到 2.3。最后补跑的 2 次 Claude（01:55–01:56）之后没再看。这两项记在跑的日志里，不在原始记录里。
- 名单照「跑法」：Claude 用 `--allowedTools` 白名单，pi 用测量台的扩展。

#### 2. 每家的数（goals 的标准写在旁边）

| 指标 | 标准 | Claude | 达标 | pi | 达标 |
|---|---|---|---|---|---|
| 1:1 落地率（按 `done` 的核对） | ≥ 95% | 98.4%（122/124 条） | 是 | 100%（180/180） | 是 |
| 1:1 落地率（按结束时页面上的预期） | 同上 | 99.3%（141/142） | 是 | 100%（204/204） | 是 |
| 虚假的 ✓ | 0 | 1 条 | **否** | 0 | 是 |
| 设计变量使用率 | ≥ 90% | 100%（52/52 条，30 次） | 是 | 100%（78/78 条，45 次） | 是 |
| 每条改动的工具调用，含被拦的 | ≤ 3 | 中位数 3.1（1.5–8.5）；合计 449/146 = 3.08 | **否**（刚过） | 中位数 4（1.2–12.67）；844/210 = 4.02 | **否** |
| 同上，不含被拦的 | ≤ 3 | 中位数 3.0（1.5–7.5）；409/146 = 2.80 | 是 | 中位数 3.5（1.2–12.33）；813/210 = 3.87 | **否** |
| 全仓搜索 | 0 | 中位数 0；9/50 次有，共 15 次 | **否** | 中位数 0；23/72 次有，共 46 次 | **否** |
| 读 `node_modules/03kind` | （ticket 65） | 0 | | 2 次跑有，12 次、14 次 | |
| 报告合规 | 每条没落地 1:1 的都在 ⚠️ 下，有原因和替代做法 | 94%（45/48） | **否** | 100%（69/69） | 是 |
| 落地不了 1:1 的改动报得对 | | 100%（2 次） | | 100%（3 次） | |
| 核对覆盖率 | 100% | 99.2%（123/124 条） | **否** | 100%（180/180） | 是 |
| 进度准确（差 0） | 0 | 46/48 次差 0，2 次差 1 | **否** | 69/69 次差 0 | 是 |
| 场景整体预期 | | 100%（4/4 次） | | 100%（6/6） | |
| 整轮用时 `claim`→`finish`（基线） | 记下 | 中位数 16.06 秒（5.48–65.89）；每条 5.5 秒（1.4–24.1）；Agent 总用时 26.15 秒（13.51–78.95） | 记基线 | 20.09 秒（9.57–122.11）；每条 7.58 秒（2.08–40.7）；Agent 总用时 28.17 秒（17.31–131.2） | 记基线 |
| 读入字数（基线） | 记下 | 全部工具输出中位数 12913.5（7804–19247）；Skill 3504；`claim` 6509.5（3405–9603） | 记基线 | 15525（7877–98263）；Skill 3633；`claim` 6497（3406–9604） | 记基线 |
| 被权限拦下的调用 | 单列 | 43 次，在 39/50 次跑里 | | 34 次，在 32/72 次跑里 | |
| 没认领改代码的提示、停住的提示、子 Agent | 0 | 都是 0 | | 都是 0 | |

几项怎么算的：

- 「不含被拦的」：每次跑 (工具调用数 − 被拦次数) / 改动条数，再取中位数；合计那一列是所有有改动的轮加起来再除。被拦的调用在 transcript 里也是一次工具调用，测量台照算（`toolCalls` 含它们）。Claude 的被拦次数取 transcript 最后 `result` 事件里的 `permission_denials`；pi 的取出错的工具结果里以测量台的拒绝语开头的（`metrics.ts` 的 `DENIED`）。我逐条数出来的和 `measures.json` 的 `permissionDenials` 每次都对得上。有改动的轮里被拦的：Claude 40 次，pi 31 次（另有 `flow-undo-last` 的 3 次、3 次）。
- 进度准确：测量台在真实跑里不直接算它。我拿 `finish` 时 `result.json` 的 `applied`（进度环显示的就是它的条数）比结束时页面预期成立的条数，只数有页面预期的改动。`fill-gap-brief` 的生成说明没有页面预期，这一条不数，同一场景的另 2 条照数。按条号逐条比，结果一样。Claude 差 1 的 2 次：dissolve-place-frame run-2（就是那条虚假的 ✓）、third-party run-2（核对判错）。
- 核对覆盖率：页面能核对的改动里，一轮结束前拿到「显示」或「没显示」的。

结论：pi 在 Faithful、Robust 两节全部达标。Claude 差在 1 条虚假的 ✓、3 份报告、1 条没拿到核对、2 次进度差 1，原因见第 6 节：没拿到核对的 1 条和进度差的 1 次根子在页面核对，进度差的另 1 次就是那条虚假的 ✓。两家都没达标的是 Light 一节的「每条 ≤ 3 次工具调用、0 次全仓搜索」：调用次数这半条，Claude 去掉被拦的才达标，pi 去掉了也没有；全仓搜索两家都不是 0。

#### 3. 被拦下的工具调用

Claude 43 次（每条按被拦的整条命令里让它被拦的那部分归类）：

| 被拦的命令 | 次数 | 场景 |
|---|---|---|
| `sed -i` 改文件（多半后面接 `sed -n` 看行、`&& npx 03kind done`） | 18 | breakpoint-kept、button-over-rule、flow-end-halfway、panel-padding-effects-opacity、panel-size、panel-text、placement-kept、promote-and-grid、tablet-breakpoint、variables |
| `python3 - <<'E'` 改文件 | 16 | data-and-text、dissolve-place-frame（3 次全有）、next-client-stack-breakpoint、next-server-usage-text、phone-breakpoints、r18-phone-and-stack、r18-style-variables、reorder-and-move |
| `cat > 文件 <<'EOF'` | 1 | cards-style run-1 |
| 不带 `-C` 的 `git apply`（撤销） | 3 | flow-undo-last run-1 一次、run-2 两次 |
| `cd 子目录 && cat …`（名单没有 `cd`） | 2 | next-client-stack-breakpoint run-1、run-2 |
| 看第三方库和开发服务器：`cat $(ls …)` 1 次，`curl localhost:…` 2 次 | 3 | third-party run-1、run-2 |

- 35 次是改文件的方式（`sed -i`、`python3`、`cat >`），和 67 那轮一样。被拦后 34 次接着改用 Edit；cards-style run-1 那次先跑了 `done`，看到没显示才用 Write 重写。被拦的命令后面接着的 `npx 03kind done` 也没跑，Claude 要再跑一次。
- 撤销场景两次都成功（预期 2/2）：被拦后照 `npx 03kind last` 打印的原样跑，放行了。

pi 34 次，除了 1 次撤销，都不改项目里的文件（跑构建工具那 3 次只往 `/tmp` 写）：

| 被拦的命令 | 次数 |
|---|---|
| 只读命令里夹着 `echo "---"` 当分隔（名单没有 `echo`）：16 次只因为它，另 2 次还夹着 `awk`、`sed -n` | 18 |
| `sed -n` 看几行 | 8 |
| 跑构建工具看生成的 CSS：`npx tailwindcss` 2 次，`npx vite build` 1 次 | 3 |
| `node -p`、`lsof`、`… \| sort \| uniq`、`echo "exit:$?"` 各 1 次 | 4 |
| 不带 `-C` 的 `git apply`（撤销，flow-undo-last run-3） | 1 |

- pi 改文件用自己的 edit 工具，没有一次因为改文件被拦。被拦的将近一半（16/34）只因为一个 `echo`。

#### 4. `next-client-stack-breakpoint` 的 Yearly 填色

5 次都改在 `.selected` 规则上（`background: rgb(239, 246, 255)` → `rgb(219, 234, 254)`），没有一次只改在 Yearly 上。两种都算对（87 代定第 7 条）。

| 跑 | 写法 |
|---|---|
| claude run-1、run-2 | `.selected` |
| pi run-1、run-2、run-3 | `.selected` |

#### 5. Next 场景是不是写在 `.module.css` 里

两个场景 10 次（Claude 2 + pi 3，各两场景），每条样式改动都写在 `.module.css` 里，没有内联样式，也没有改到全局 CSS。逐个 diff 看的：

- `next-client-stack-breakpoint`：新 Stack 的规则（`.group` 或 `.stack`）、`.selected`、`.saving` 的圆角和手机断点的 `@media` 都在 `components/BillingPicker.module.css`；`.tsx` 里只多了包一层的 `<div className={styles.…}>`。
- `next-server-usage-text`：填色在 `components/Stat.module.css` 的新 `.tinted`（Claude run-2 写在 `app/page.module.css` 的 `.stats .statTinted`，也是 module）；列数在 `app/page.module.css` 的 `@media`；`.tsx` 里只加了 prop、改了字。

没有不符合的。

#### 6. 没达标的地方和原因

按场景、改动类别列。原因分五类：Agent 没照 Skill、Skill 写得不清楚、`claim` 的说明不够、页面核对判错、场景本身的问题（或测量台）。

**没落地 1:1、虚假的 ✓、核对和进度**

| 场景 / 改动 | 跑 | 什么问题 | 原因 | 关键的一句 |
|---|---|---|---|---|
| dissolve-place-frame / 撤成 Frame（unstack，1） | claude/dissolve-place-frame/run-2 | 段落去掉了 `mt-4`，比画布高了 16px，页面预期不成立，又列在 ✓ 下：**虚假的 ✓**；进度环也因此多算 1 条（**进度**差 1）。结束时等满 30 秒（`endWaitMs` 30343），就是在等这条 | `claim` 的说明不够 | 报告：「段落去掉了 `mt-4`」 |
| third-party / 第三方 Surface 上的填色（1） | claude/third-party/run-1 | 页面显示了，`done` 却说没法核对：1:1（按核对）少 1，**核对覆盖率**少 1 | 页面核对判错 | `done`：「the layer is not on the page now」 |
| 同上 | claude/third-party/run-2 | 页面显示了，`done` 三次都说没显示：1:1（按核对）少 1，**进度**差 1；Claude 把它报在 ⚠️ 下（照核对报，报得没错） | 页面核对判错 | `done`：「The fill is no fill, not #F5F5F4」 |

- dissolve-place-frame：图层撤成绝对定位后「`top` 就是 Y、margin 留着」这条，`claim` 只写在「How the page checks」里；「Dissolving a Stack」那条只说给出的 `left` / `top`。撤成 Frame 这类页面不核对，`done` 拦不住。同一轮里第 2 条（按钮的 Y）的 `done` 已经说了「margin 要留着」，Claude 加回了按钮的 `mt-6`，没想到段落的 `mt-4` 也一样：Agent 也有一份，但根子在说明。同一处，Claude run-1 以为段落会比 Y 低 16px，pi run-2 为它去翻了 `node_modules/03kind` 的代码（见下）。3 次 Claude 里 2 次、3 次 pi 里 1 次被它绊住。
- third-party：两次 Claude 都在 Badge 外面包了一层（run-1 包 `<span>`，多 3 行；run-2 包 `<div className="contents …">`，多 2 行），Surface 从第 37 行挪到 40 / 39 行。pi 3 次都没在它上面加行，3 次都核对为显示。看代码（`packages/03kind/src/client/page-elements.ts`），原因对得上：
  - Surface 是第三方组件，它渲染的 `<div>` 自己没有源码标记，只有从使用处传下来的那个（`data-tk-usage`），页面按使用处的位置（37 行）认它。
  - 位置一变，页面就去找「挪了位置的图层」（`movedElementsOf`）：同一文件、同一标签、同一组件链里，离原来的行最近的那个。但这一步只看自己带源码标记的元素，Surface 的 `<div>` 根本不在候选里。
  - run-1 包的是 `<span>`，`App.tsx` 里没有别的候选 `<div>`，所以「not on the page」。run-2 包的是 `<div>`，它是唯一的候选，页面就读了它的填色（没填色）。
  - 这是读代码推出来的，没有重现。

**报告不合规**（3 次，都是 Claude，都是「同一条列了两次」）

| 场景 / 改动 | 跑 | 问题 | 原因 | 关键的一句 |
|---|---|---|---|---|
| dissolve-place-frame / 撤成 Frame（1） | claude/dissolve-place-frame/run-1 | change 1 listed more than once（✓、⚠️ 下各一次） | Agent 没照 Skill（底下是上面 margin 那条的疑问） | ⚠️ 下：「没有扣掉 `mt-4` / `mt-6`」 |
| dissolve-place-frame / Y（2） | claude/dissolve-place-frame/run-2 | change 2 listed more than once | Agent 没照 Skill（也读错了 `done` 说 margin 的那句） | 「页面实际显示位置可能是 512px,不是 488px。」 |
| put-back-and-new-text / 新文字（2） | claude/put-back-and-new-text/run-1 | change 2 listed more than once | Agent 没照 Skill | 「用 `max-w-[649.5px]`,宽屏上仍是 649.5px」 |

- Skill 第 5 步和 `finish` 打印的格式说明里都写了「goes under ⚠️ alone, not under ✓ as well」，Claude 48 次里有 3 次没照。⚠️ 下的每条都有 Why 和 Instead；按 goals 那句话本身，只有上面那条虚假的 ✓ 不在 ⚠️ 下。

**没出问题的几项**

- 设计变量：两家没有一条没用。
- 场景整体预期：都成立（Claude 4/4，pi 6/6）。
- `endLoaded` 都是 true；`endWaitMs` 除了上面那次 30.3 秒，Claude 最长 257 毫秒，pi 最长 257 毫秒。
- `third-party` 的 Beta 徽章（标了 `notOneToOne`）：Claude run-2、pi run-2、run-3 列在 ✓ 下，照跑前检查一代定 2 看了 diff：都在使用处改（`display: contents` 的包裹、header 上的子选择器、`[&>span]:w-[90px]`），没动 `acme-ui`，页面上确实 90px，只作用在这一个 Badge 上。不算虚假的 ✓。
- Claude `put-back-and-new-text` run-3 有 1 次 API 重试。

**一轮里 `done` 说没显示、后来改对的**（不算没达标，但用时、调用次数的离群值都在这里）

| 场景 / 改动 | 跑 | 什么情况 | 原因 | 关键的一句 |
|---|---|---|---|---|
| next-server-usage-text / 改字（2） | claude/next-server-usage-text/run-2 | Claude 把 `Stat.tsx` 的参数和 `page.tsx` 里第二个 Stat 都拆成多行。页面先读成第二个 Stat 的数值（“5,000”）；`page.tsx` 改回一行后读成第三个 Stat 的数值（“0”）；`Stat.tsx` 也改回一行才过 | 页面核对判错 | 「检查器是按原来的行号(34)找到那个元素的」 |
| 同上 | pi/next-server-usage-text/run-1、run-2 | 一样：`Stat.tsx` 的参数拆成多行，页面读成数值那个 `<span>`（“0”）；pi 改回一行才过 | 页面核对判错 | 「The check read the wrong element (the value span」 |
| next-server-usage-text / 填色（1） | pi/next-server-usage-text/run-1、run-3 | pi 把 `tinted` 加在第三个 Stat 上（改字的那个），说明写的是 `app/page.tsx:33:9`；`done` 说没显示是对的，pi 改了 | Agent 没照 Skill（没照说明里的 Scope） | `label="bytes shipped to production" tinted` |
| 其他 | claude/cards-style/run-1、dissolve-place-frame/run-2（按钮的 Y，见上面 margin 那条）、promote-and-grid/run-2、r18-phone-and-stack/run-2；pi/r18-style-variables/run-1、run-2 | `done` 说没显示都对（命令被拦没执行、margin 没留、少改断点、Tailwind v3 类的先后、变体的类压过使用处），Agent 照着改好了 | （核对起了作用） | |

- 读错改字的原因，看代码（同一个 `movedElementsOf`）对得上：它比的是每个候选现在的位置离图层原来的位置（本身的行，加上使用处的行）有多远，不是每个元素自己挪了多少。标签那个 `<span>` 在第 8 行，数值那个在第 7 行；上面多了 k 行，标签到了 8+k，数值到了 7+k，数值离 8 更近，就被当成了标签。同样是读代码推的，没有重现。
- 这个场景 pi 3 次的整轮是 114、122、113 秒（run-1、2、3），Claude run-2 是 65.9 秒（Claude 最长）。run-1、run-2 和 Claude run-2 是上面的核对判错：Agent 为了让核对认得出，把代码排回原来的行数，写法被核对牵着走。pi run-1、run-3 还有填错 Stat 那条；run-3 只有这一条，没有读错。

**读 `node_modules/03kind`**

- pi/next-server-usage-text/run-2：14 次，最多的一次。在查上面那个读错的元素，读了 `dist/editor.dev.js`（44703 字）、`dist/cli.js`（13244 字）。根子是页面核对判错；`claim` 已经说了「you need not look further for how it checks」，pi 没照。
- pi/dissolve-place-frame/run-2：12 次。动手之前就去 `cli.js`、`editor.dev.js` 里搜 `margin`，查绝对定位时 margin 怎么算。`claim` 的说明不够（同上面 margin 那条）。

**离群的几次**

- pi 那次 122 秒、98263 字、每条 12.67 次调用，是同一次：pi/next-server-usage-text/run-2（38 次调用 / 3 条），原因见上。
- pi 读入字数另外几个大的：pi/fill-gap-brief/run-2 68416 字（一条 `grep … node_modules/tailwindcss/dist/*.js` 输出 50480 字）；pi/panel-padding-effects-opacity/run-3 59915 字（`grep … tailwindcss/dist/lib.mjs` 44922 字）；pi/dissolve-place-frame/run-2 50674 字（见上）。都是去翻 Tailwind 的内部确认类会不会生成。Agent 没照 Skill（Skill 说命令行什么都给了，`done` 会看页面）。
- Claude `third-party` 每条 7 次（run-1 11 次 / 2 条，run-2 17 次 / 2 条）：两次都先去看 `acme-ui` 的代码，查 Badge、Surface 收不收 `className`（run-1 那条 `cat $(ls …)` 被拦）；pi 3 次也一样（16、22、11 次）。这一半是 `claim` 的说明不够：说明只说「drawn by a dependency: change it from the usage」，没说这个组件收不收 `className`、会不会把 props 传下去。run-2 多出来的是上面那次核对判错：两次 `sleep` 再 `done`、搜覆盖的规则、两次 `curl` 开发服务器被拦。

**全仓搜索**（goals 要 0）

- Claude 15 次：找类名合并工具（`grep -rn "twMerge\|clsx"`）5 次，在 cards-style run-1、run-2，fill-gap-brief run-1、run-2，phone-breakpoints run-2；找正文的字体从哪来 5 次（put-back-and-new-text run-1 3 次、run-2 2 次）；third-party 5 次（找 Badge 2、翻 `acme-ui` 1、核对判错后找覆盖的规则 2）。
  - 类名合并：`claim` 的「This usage only」说「the project's class-merging helper, if it has one」，有没有要 Agent 自己找。`claim` 的说明不够。
  - 正文字体：新文字的说明说「from what the page already uses for body text」，没说写在哪（`index.css` 的 `body`）。`claim` 的说明不够。
- pi 46 次：找组件的其他使用处（`grep -rn "Card" src` 之类，Card、BillingPicker、Stat）14 次；列 `src`、`vendor` 的文件（`find`）13 次；翻依赖内部（`tailwindcss`、`03kind`、`.next`）13 次；其他 6 次。
  - 其他使用处：说明只写「Other usages of Card stay as they are」，没写在哪。`claim` 的说明不够。
  - 列目录、翻依赖：Agent 没照 Skill。

#### 7. 结论

- **达标**：两家的 1:1 落地率（Claude 按核对 98.4%、按页面 99.3%；pi 都是 100%）、设计变量使用率（都是 100%）、撤销和保留上一轮的场景预期（都是 100%）。pi 的虚假的 ✓、报告合规、核对覆盖率、进度准确全部达标。
- **没达标**：
  - Claude 1 条虚假的 ✓（dissolve-place-frame run-2，`claim` 里 margin 那条没写在撤成 Frame 的规则里）；
  - Claude 报告 3 次把同一条列在 ✓、⚠️ 两处（Agent 没照 Skill）；
  - Claude 核对覆盖率 99.2%（third-party run-1）、进度 2 次差 1（third-party run-2 是页面核对判错；dissolve-place-frame run-2 就是那条虚假的 ✓）；
  - 两家每条调用和全仓搜索。Claude 含被拦的合计 3.08（没达标），不含是 2.80（达标）；pi 不含被拦的也要 3.87。全仓搜索 Claude 15 次、pi 46 次，都不是 0。
- 整轮用时、读入字数：第一份基线，记在第 2 节的表里。按 goals「度量」，只和同一 Agent、同一模型、同一 effort 比（Claude 这次是 medium，不和之前 high 的数比）。
- **最要紧的是页面核对判错**：源码里图层上面多了几行（拆成多行的参数或 JSX、包一层），页面去找挪了位置的图层时，会找错或找不到。看代码是 `movedElementsOf` 的两处：
  - 它按「现在离原来的行最近」挑，上面多了行时，紧挨在图层上面的那个元素反而更近，就挑错了（next-server-usage-text 读成数值）；
  - 它只看自己带源码标记的元素，第三方组件渲染的元素（只带使用处的标记）不在候选里，就找不到，或挑到 Agent 新加的元素（third-party）。

  Claude 按核对少的 2 条、覆盖率少的 1 条、进度差的 1 次，还有 pi 用时、调用、读入字数最大的那次（next-server-usage-text run-2），都是这个。Agent 为了让核对认出来，把代码排回原样。
- **Skill 措辞**：1:1 和虚假的 ✓ 不用改 Skill，问题在 `claim` 和页面核对。同一条列两次，Skill 和 `finish` 都已经写得很明白，不建议再加。只有 pi 的调用次数、全仓搜索这一项跟 Skill 有关：pi 开头总要看项目：每条改动 0.91 次 read（不算读 Skill）、1.10 次不跑 `npx 03kind` 的 bash（含被拦的）；Claude 是 0.27、0.35。要试的话，在第 2 步后面加一句（英文，照设计师 2026-11-04 定的）：

  > The notes name the file and line of each change: read those, and search the project only where a section says the layer is not located.

  不过要先跑 pi 对照，看得出收益再留（goals「度量」）。我倾向先修 `claim` 那三处（其他使用处、类名合并工具、正文样式在哪），它们直接对着搜索的原因，再看 pi 的数。
- **截图不提前**：路线图那条是「Agent 常误解布局类改动，再加回」。这次布局类改动（撤成 Frame、调换、新建 Frame、断点上的 Stack、放回）只错了 1 条，错在一条数值规则（margin 留着），截图也未必能让 Agent 看出 16px 的差；其余的 1:1 都对。
- **另开的 ticket**（编号在 main 上取，Status 都是 needs-triage）：
  - 99：图层上面多了几行时，页面核对仍找得到挪了位置的图层（修 `movedElementsOf` 的两处，先用脚本剧本重现）。
  - 100：`claim` 在「撤成 Frame」那条写明 margin 留着。
  - 101：`claim` 写明其他使用处、类名合并工具和正文样式在哪（目的是全仓搜索降到 0）；Skill 第 2 步要不要加上面那一句，放在 101 分诊时一起定。
  - 没开 ticket、要设计师定的：测量台名单要不要放行只打印的 `echo`（pi 被拦 34 次里 16 次只因为它，另 2 次也有它）。放了会让 pi 的数更接近真实使用，但这次的基线就不能直接比；这会改设计师定的「跑法」，所以先不开。
- **要设计师看的**：pi 的 `settings.json` 指纹跑的过程中变了 4 次（`models.json` 没变）。

#### 和别的 ticket 遗留风险有关的数据

- **ticket 84 遗留风险第 1、6 条**（还有第 3 条、代定第 5 条那句新说法）：122 次跑里没有一次 `done` 打出这几种说法（`check its \`position\``、`not placed absolute`、`the page moves the layer`、`keep it in its container's layout`、`laid out static`）。transcript 里搜到的只有 pi 读 `cli.js` 时带出来的字符串。标准场景碰不到这几种情况，88 的数据说明不了什么。要数据，得加一个场景（旁边视图里 `relative` 居中的图层，或同时写了 `left`、`right` 的）。
- **ticket 95 遗留风险第 1 条**（数据改动页面不核对）：`data-and-text` 5 次（Claude 2、pi 3），删除和复制两条都是「the change is to the data the loop goes through」那句原因，两家都照常往下做，结束时页面预期全部成立（Claude 6/6、pi 9/9）。这次没看到写错数据的。**第 3 条**（散字移动 `claim` 归进两项）：标准场景里没有，没碰到。
- **86 遗留风险第 1 条、代定第 8 条**：裸 `git apply` 被拦 4 次（Claude 3、pi 1），撤销 5 次都成功。名单照设计师 2026-11-05 定的不改。

### 代定的事（待设计师确认，2026-11-05）

1. Claude「两次结果不一样」的判法：任一条改动结束时显示与否、虚假的 ✓ 条数、报告合规、场景预期没成立的那几条，有一项两次不同就算。按这个判法，dissolve-place-frame、put-back-and-new-text 补了第 3 次，其余 22 个场景两次一样。
2. 「进度准确」测量台没给真实跑出数。这里拿 `finish` 时 `result.json` 里的 `applied`，和结束时页面上显示的改动比；没有页面预期的那条（Brief 的生成说明）不算。
3. 名单要不要放行 `echo`，没开 ticket，等设计师定（见第 7 节）。Skill 第 2 步那一句也没改，放在 101 分诊时定。
4. 安装测量台和落地测量台共用 Claude 的设置，所以现在也是 effort medium。ticket 24 里写的还是 high，没改，24 开线前要设计师定。
5. Claude 的 effort 只能从命令行核对是 medium：Claude Code 的调试日志只在降低 effort 时才写级别，50 次都没写，所以 `seen` 是空的。
6. pi 的 `settings.json` 指纹在这一轮里变了 4 次（北京时间 00:50、00:51、00:52、01:21，共 5 个值，之后没再出现以前的值），`models.json` 72 次都一样。没看文件内容；看起来像 pi 或它的提供商扩展在跑的时候写了这个文件，不像手改。请设计师看一眼。

### 机器状态

- 开跑时和每段跑完各看一次，共 4 次（00:38–01:54）：合盖都是 No，1 分钟负载从 6.1 降到 2.3。最后补跑的 2 次 Claude（01:55–01:56）开跑时负载 2.2、结束时 3.1，合盖 No。全程申请了保持唤醒，只跑无头浏览器，没有开窗口。

### 设计师确认（2026-11-05，真实跑）

- 代定 1（Claude「两次结果不一样」的判法）、2（「进度准确」的算法）、5（Claude 的 effort 只能从命令行核对是 medium）确认。
- 代定 6（pi 的 `settings.json` 指纹跑中变了 4 次）确认，结果有效。规划会话只看了修改时间和文件名、没打开文件：`settings.json` 最后修改 01:20:45；同一段时间设计师在「Pi Chat」里开了两个 pi 会话（00:48、01:16 开始），变化跟在它们后面，多半是那边写的，不是测量台。72 次模型、提供商回答的模型、thinking 都一样，`models.json` 没变。以后真实跑时，设计师先不在别处用 pi 改设置；指纹照记。
- 代定 3 定了：测量台的名单放行只打印的 `echo`（带 `>`、`>>` 写文件的照挡），两家一起改，从下一次真实跑起；放进 ticket 101 那条线做（101 修完本来要再跑真实 Agent）。这次的数照旧作基线，以后比「不含被拦」那一列。改了 2026-11-03 定的「跑法」，设计师同意。Claude 用 `sed -i`、`python3`、`cat >` 改文件被拦照旧，不改。Skill 第 2 步那一句放在 101 分诊时定。
- 代定 4 定了：ticket 24 的 Claude 也用 effort medium，pi 照旧 thinking high，和 88 一致；24 的写法已改。
