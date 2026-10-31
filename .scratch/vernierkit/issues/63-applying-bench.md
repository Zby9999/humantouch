# 63: 落地流程的测量台

**What to build:** 一套能反复跑的测量，回答「这次改动让落地更快、更稳了，还是更重、更慢了」，并在现在的代码上测出基线，供 64–68 对比。分两部分：

1. **脚本扮演 Agent 的剧本**，放进 e2e：照流程走；跳过 `done`；全改完才一起 `done`；做到一半退出、不 `finish`；没认领就改代码；两次进度之间停很久再继续。每个剧本输出 docs/goals.md Robust 一节的机制指标：核对覆盖率、进度准确、结束一轮后保住的未落地改动、停滞提示出现的时间、没认领改代码是否被发现。现在还没有的能力如实记为基线（例如保住 0%、没有提示）。
2. **真实 Agent 跑标准场景**：约 10 个标准场景，在示例项目的临时副本里，由真实 Agent 无人值守地落地，页面开在 headless 浏览器里供核对。从 Agent 的对话记录、归档的一轮结果和 git diff 算出：整轮用时、每条平均工具调用次数、全仓搜索次数、读入的字数、1:1 落地率、虚假的 ✓、是否跑了 `done` 和 `finish`、报告格式是否合规。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准（Robust 一节与度量规则），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0013）。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] 六个脚本剧本进 e2e，每个输出它对应的机制指标；本 ticket 只记录数值，不做达标断言（断言由 64–68 各自加上）
- [x] 约 10 个标准场景，每种改动至少出现一次，含断点改动与挪出、拖回画布，写明预期结果；场景可供 24 复用
- [x] 真实 Agent 跑分用单独一条命令启动，`pnpm test:e2e` 不会带起它；页面只在 headless 浏览器里打开，不抢设计师的焦点
- [x] 每个场景跑 3 次取中位数并给出波动范围；每次记下 Agent 的版本和所用模型；原始结果放在不进 git 的目录
- [x] 在当前 main 上测出基线：脚本剧本全部，真实 Agent 至少 Claude Code，Cursor CLI 能跑就测（本机没有 Codex，不测）；数字记在 Comments
- [x] 跑真实 Agent 前先问设计师（会用掉 Agent 的额度）
- [x] 写明怎么启动、怎么读结果，以及 64–68 记录前后数字的格式

## 背景

- 来自 2026-10-30 的讨论：Agent 不由我们控制，ADR 0013 决定落地不靠 Agent 守流程。用户要求每项改动都要量化收益，否则不知道软件是更快、更好用了，还是更重、更慢了（docs/goals.md 的度量规则）。
- 真实 Agent 的数字只拿同一 Agent、同一模型比较。设计师本机的 Claude Code 接的是网关上的模型，换模型后的数字不能和之前的直接比。
- 24 要人工在三家 Agent 上统计的指标，这里能自动算出大部分，24 可以直接用这套场景和跑分。

## Comments

**跑真实 Agent 的批准**

- 2026-10-30：设计师先批准 63 的基线，Claude Code 和 Cursor 两家，约 10 个场景 × 3 次 × 2 家，加冒烟，总数不超过 70 次。
- 2026-10-31：设计师批准整条线所有测试任务的真实 Agent 跑分，Claude（Sonnet 5.5 high）和 Cursor（Grok 4.7 256K High）都在内，63 的 70 次上限取消。

实际跑了多少次（每次是被测 Agent 的一次调用）：

| 用途 | 次数 | Agent / 模型 | 进不进基线 |
|---|---|---|---|
| 冒烟：认证失败 | 3 | npm 装的 Claude Code 2.1.191（claude-sonnet-4-6）2 次，`~/.local/bin` 的 cursor-agent 1 次 | 否：都没开始干活 |
| 冒烟：管线 | 3 | 桌面 app 的 Claude Code 2.1.309，Opus 5.5（`claude-opus-5-5`，effort 用设计师设置里的 xhigh）1 次；cursor-agent，Composer 2.5 Fast 1 次（shell 全被拒，没认领）；Cursor app 的 agent-cli，Grok 4.7 256K High 1 次（没固定 `--model`） | 否 |
| 第一批正式跑（作废） | 10 | Claude Code Opus 5.5（effort xhigh）5 次；Cursor Grok 4.7 256K High（没固定 `--model`）5 次 | 否：之后两家都改为显式固定模型与 effort，这 10 次只算冒烟 |
| 正式：Claude Code | 30 | Sonnet 5.5（`claude-sonnet-5-5`），`--effort high` | 是 |
| 正式：Cursor | 30 | Grok 4.7 256K High（`--model 'grok-4.7[context=256k,reasoning_effort=high,fast=false]'`） | 是 |
| 基线 B：Claude Code | 30 | 同上，Sonnet 5.5，`--effort high` | 是（基线 B） |
| 基线 B：Cursor | 30 | 同上，Grok 4.7 256K High | 是（基线 B） |
| 合计 | 136 | | 基线 A 60 次，基线 B 60 次 |

**测量台**

两部分，都在 `e2e/` 下：

1. 脚本剧本：`e2e/tests/applying-bench.spec.ts`。脚本扮演 Agent，在示例项目上把三条改动（循环里三张卡片的填充、圆角、描边）走一轮，六种走法各一个测试。只记数，不断言，断言由 64–68 各自加。跑在 e2e 的 project files 一组里，`pnpm test:e2e` 会带上它；单独跑：`pnpm build && VK_E2E_PORT=5600 npx playwright test -c e2e/playwright.config.ts --project "project files" --no-deps applying-bench`。可调的等待：`VK_BENCH_PAUSE_MS`（「停很久再继续」停多久，默认 15000）、`VK_BENCH_STALL_WATCH_MS`（「做到一半退出」后等提示多久，默认 15000）、`VK_BENCH_UNCLAIMED_WATCH_MS`（没认领改代码后等提示多久，默认 5000）。67 定下阈值后，把前两个设成阈值以上。停滞提示和「没认领在改代码」的提示还不存在，剧本按 `role="alert"`（或 `alertdialog`）、文字含 Agent / claim 来找；66、67 做出提示时，改剧本顶上的 `stallNotice`、`unclaimedNotice`，让它们找到自己的提示。
2. 真实 Agent 跑标准场景：`pnpm bench:agents`（默认两家 × 10 个场景 × 3 次，按顺序跑，不并发，先跑完每个场景的第 1 次）。选项：
   - `--agents claude,cursor`、`--scenarios <id,…>`、`--runs <n>`。
   - `--max-runs <n>`：跑满 n 次 Agent 就停。
   - `--out <目录> --first-run <n>`：在一批已有结果后面接着补第 n 次起的跑分；Agent 版本或命令行不同就拒绝。
   - `--dry`：不跑 Agent，只把每个场景设起来，检查改动种类对、页面上还没显示。
   - `pnpm bench:agents summary <目录>`：从原始结果按当前规则重算指标和汇总，不用重跑 Agent。

   `pnpm test:e2e` 不会带起它。每次跑完都核对模型，和固定的不一样就停掉整批。

   场景在 `e2e/bench/scenarios.ts`。每条改动写明：种类、页面能否核对、预期结果（文字一份，给 24 人工用；在页面里求值的一份，给测量台用）、说明里给出的设计变量。`e2e/tests/bench-scenarios.spec.ts` 在 e2e 里检查十个场景都还设得起来，落地前页面上都还没显示。

十个场景（每种改动至少一次）：

| 场景 | 改动 |
|---|---|
| cards-style | 循环里三张卡片的填充、圆角、描边（只改这一处使用） |
| button-over-rule | 按钮填充与圆角，现在由不在 CSS layer 里的 `button` 规则设定 |
| type-and-stack | 标题字号（变量 text-5xl）、段落文字颜色（变量 stone-900）、标题与 Badge 合成新 Stack |
| fill-gap-brief | 按钮宽度 Fill、卡片 gap 12（流式布局改成真正的 Stack）、按钮上的生成说明 |
| promote-and-grid | 圆角推广到 Card 组件、Grid 改 2 列、行距 24 |
| reorder-and-move | Header 移到段落后（Reorder）、按钮移进 Header（Move） |
| data-and-text | 删除一张数据卡片、复制一张、改标题文字 |
| put-back-and-new-text | 上一轮挪出画布并删掉的标题拖回 Header、新建文字、把段落挪出画布 |
| phone-breakpoints | 手机视图里：卡片填充、隐藏按钮、Grid 2 列 |
| dissolve-place-frame | 解散 hero 的 Stack、按钮 Y 下移 120px（Absolute）、新建带生成说明的 Frame |

每次真实跑：把示例项目（Vite + React 19 + Tailwind v4）复制到系统临时目录，用 `init` 从打好的包装上 Vernier Kit 并提交；每次 clone 一份，在 5620–5649 的一个端口起开发服务器；在 Playwright 的 headless shell 里照场景在编辑层里改；Agent 在那份 clone 里无人值守地落地，超时 20 分钟；Agent 退出后连同它留下的进程（Cursor 的 worker server）一起停掉。另开几个只看的页面（挡掉本机服务，不算设计师的页面），每秒按场景的预期看一次页面上新显示了哪条；每 250ms 读一次 `.vernier/` 和项目源码的修改时间，记下认领、每次 `done`、`finish` 和每次源码变化。

固定的命令行（以后每轮都用这两条，数字才能比）：

Claude Code，桌面 app 自带的那份（2.1.309；测量台在 `~/Library/Application Support/Claude/claude-code/<版本>/<hash>/claude.app/Contents/MacOS/claude` 里取最高版本，`VK_BENCH_CLAUDE` 可以改）：

```
'/Users/bingyizhang/Library/Application Support/Claude/claude-code/2.1.309/5af865b9901c/claude.app/Contents/MacOS/claude' -p '落地我的设计改动' --output-format stream-json --verbose --model claude-sonnet-5-5 --effort high --debug-file '<run folder>/claude-debug.log' --setting-sources project,local --strict-mcp-config --no-chrome --no-session-persistence --permission-mode acceptEdits --allowedTools 'Read,Edit,MultiEdit,Write,Glob,Grep,TodoWrite,Skill,Bash(npx vernierkit:*),Bash(git diff:*),Bash(git status:*),Bash(git log:*),Bash(git show:*),Bash(ls:*),Bash(cat:*),Bash(head:*),Bash(tail:*),Bash(wc:*),Bash(grep:*),Bash(rg:*),Bash(find:*),Bash(npx tsc:*)' --disallowedTools WebFetch,WebSearch
```

Cursor，Cursor app 自带的 agent-cli（2026.10.22-27dcf5f；测量台用 `~/Library/Application Support/Cursor/User/globalStorage/anysphere.cursor-agent-worker/agent-cli/.local/bin/cursor-agent`，没有时退回 PATH 上的 `cursor-agent`，`VK_BENCH_CURSOR` 可以改）：

```
'/Users/bingyizhang/Library/Application Support/Cursor/User/globalStorage/anysphere.cursor-agent-worker/agent-cli/.local/bin/cursor-agent' -p '落地我的设计改动' --output-format stream-json --model 'grok-4.7[context=256k,reasoning_effort=high,fast=false]' --trust --force --sandbox enabled
```

- 环境：只留 HOME、PATH（Cursor 的安装目录、Node、系统目录）、LANG、TERM、TMPDIR、USER、LOGNAME、SHELL，以及设计师 shell 里的代理变量（`.zshrc` 在 Clash 开着时设的 HTTPS_PROXY / HTTP_PROXY / NO_PROXY）。没有任何 ANTHROPIC_*、CLAUDE_*、模型设置，用设计师自己的登录。
- 模型与 effort：
  - Claude 固定 `claude-sonnet-5-5`、`--effort high`。init 事件核对的模型 30 次都是 `claude-sonnet-5-5`。effort 在 stream-json 和调试日志里都没有输出，只能确认命令行要求了 high。`--setting-sources project,local` 不读设计师的用户设置，设置里的 xhigh 进不来。调试日志显示 Claude Code 启用了以 `claude-opus-5-5` 为顾问模型的 AdvisorTool；它若被调用，会出现在 result 的 modelUsage 里，测量台把它算作子模型。这 30 次里一次都没出现。
  - Cursor 固定 `grok-4.7[context=256k,reasoning_effort=high,fast=false]`，就是设计师 `~/.cursor/cli-config.json` 里的 selectedModel。init 事件核对 30 次都是「Grok 4.7 256K High」。它的 explore 子 Agent 不限制，单独记子 Agent 调用和模型。
- Claude Code 的隔离：
  - `--setting-sources project,local` 不读设计师的用户设置，所以插件、hooks 都不加载；`--strict-mcp-config` 不带 MCP。init 事件显示 `mcp_servers: []`。
  - 权限是白名单：项目里的编辑自动通过；放行读文件和搜索的工具，以及上面列出的几种 shell 命令；其他 shell 命令一律拒绝，计入「被权限拦下的工具调用」。
- Cursor 的权限：
  - 无头跑时，不管项目里的 `.cursor/cli.json` 怎么写白名单，所有 shell 命令都被拒（冒烟时连 `echo` 都拒了），所以只能 `--force` 整体放开。
  - 放开的同时加 `--sandbox enabled`，写入只在项目里；`.cursor/cli.json`（git 不跟踪）另外禁用 `rm`、`sudo`、`curl`、`wget`、`ssh`、`scp`、`open`、`osascript`、`kill`、`pkill`。
  - 设计师用户级的 `~/.cursor/hooks.json`（一个 sessionStart 脚本）和用户级 skills/rules 仍会加载。
  - 两家的权限松紧不同，「被权限拦下」的数字不能横比。

**怎么读结果**

- 脚本剧本：每个剧本在输出里打一行 `bench <剧本>: {…}`，也写进 `bench-results/playbooks/<剧本>.json`（不进 git）。
- 真实跑分：原始结果在 `bench-results/agents/<开始时间>/`（不进 git）。
  - `meta.json`：两家的版本、模型、effort 和完整命令行。
  - `<agent>/<场景>/run-<n>/`：`transcript.jsonl`（stream-json 对话记录）、`agent.log`、Claude 的 `claude-debug.log`、`changeset.json`、`result.json`（归档的一轮；没 `finish` 时是 `state.json`）、`diff.patch`（相对这一轮开始时的代码）、`raw.json`（时间线、页面核对、每条改动开始前和结束时页面上显示了没有）。
  - 汇总：`measures.json`（每次一行）、`summary.json`、`summary.md`。每家一张总表（中位数与范围，是/否的指标给比例），一张按场景的表（每个场景 3 次的中位数与范围）。
- 指标怎么算（`e2e/bench/metrics.ts`，有单测）：
  - 整轮用时：`claim` 到 `finish`；没 `finish` 时算到 Agent 结束。「每条」再除以改动条数。
  - 每条平均工具调用：工具调用数除以改动条数。
  - 全仓搜索：没给到单个文件的搜索工具（Grep、Glob 等），以及搜目录的 shell 命令（`rg`、`find`、`git grep`、`grep -r`）。
  - 读入的字数：Skill（Skill 工具载入的正文、读 SKILL.md 文件、或在 shell 里 `cat` 它；Cursor 对长文件只给大小，按大小计）、`claim` 的输出、全部工具输出，各算各的。
  - 1:1 落地率两种：
    - 按 `done` 核对：页面能核对的改动中，归档时页面核对为显示的比例。哪些改动页面能核对，按 Skill 的说明，以及编辑层对循环数据删除不核对的实际情况。
    - 按页面预期：有预期的改动中，结束时页面上符合预期的比例。预期里含作用范围，例如只改这一处使用时，另一处使用的卡片要保持原样；在桌面视图里改的，在所有断点都要生效。
  - 虚假的 ✓：报告列在 ✓ 下、页面却没显示的改动。有预期的看预期，没有预期的看最后一次核对。
  - 是否跑了 `done` / `finish`。
  - 报告格式合规：最后一个 ✓ 段落和其后的 ⚠️ 段落里（或只有 ⚠️ 段落），每条改动正好出现一次，⚠️ 下每条都有原因和实际处理两行。标题可以是中文。
  - 设计变量使用率：说明里给出了设计变量的改动中，Agent 的 diff 里该变量（Tailwind 类，可带变体和 `!`，或 CSS 变量）在新增行出现得比删除行多的比例。只是跟着改写的那一行一起带过来的不算。
  - 两次进度最长间隔：进度指页面上新显示一条，或一次 `done`。
  - 没进度也没改源码的最长时间：从认领到 `finish`（或 Agent 结束），进度和源码变化都算 Agent 还在动。这是 67 说的「停住」，67 拿它定阈值。
  - 被权限拦下的工具调用、子 Agent 调用（及其模型）、API 重试次数（Claude Code 会报 API 没响应后的重试，这段等待不是 Agent 在想）。

**基线：脚本剧本（2026-10-30，当前 main 7275e98 上，每个剧本三条改动）**

| 剧本 | 核对覆盖率 | 进度环与页面之差（结束时 / 最大） | 停滞提示 | 留到下一轮 | 没认领改代码被发现 |
|---|---|---|---|---|---|
| 照流程走 | 100% | 0 / 1（改了、还没 `done` 时页面已显示） | 误报 0 次（看了 6 次） | – | 误报 0 次（看了 6 次） |
| 跳过 `done` | 0% | 3 / 3 | – | – | – |
| 全改完才一起 `done` | 100% | 0 / 3 | – | – | – |
| 做到一半退出、不 `finish` | 停下时 33%（只有 `done` 过的那条） | 停下时 0 | 15 秒内没出现 | 0%（两条没落地的一条不剩；已落地的那条也没再出现） | – |
| 没认领就改代码 | – | – | – | – | 否（看了 5 秒；编辑没暂停；画布改动保住 100%） |
| 两次进度之间停很久再继续 | 100% | 0 / – | 停顿 15 秒中 0 次，恢复后无残留 | – | – |

**基线：真实 Agent（2026-10-30 至 31，当前 main 7275e98 上的 Vernier Kit，10 个场景 × 3 次）**

原始结果：Claude 在 `bench-results/agents/2026-10-30T15-23-00-885Z/`，Cursor 在 `bench-results/agents/2026-10-30T15-52-04-019Z/`（不进 git，只在设计师这台机器上）。下表由 `summary` 生成；比例一栏是 30 次里为「是」的比例。

### claude：2.1.309 (Claude Code)，模型 claude-sonnet-5-5，effort high (--effort high)，子 Agent 模型 无，30 次，2026-10-30

| 指标 | 中位数（范围） | 次数 |
|---|---|---|
| 整轮用时 claim→finish（秒） | 20.84（9.53–223.36） | 30 |
| 整轮用时每条（秒） | 8.05（3.18–74.45） | 30 |
| Agent 总用时（秒） | 38.61（17.46–239.89） | 30 |
| 每条平均工具调用 | 3.5（2.67–5.67） | 30 |
| 全仓搜索次数 | 0（0–2） | 30 |
| 读入字数：Skill | 24482（24482–24482） | 30 |
| 读入字数：claim 输出 | 2936.5（1523–4858） | 30 |
| 读入字数：全部工具输出 | 30866（27795–35857） | 30 |
| 1:1 落地率（页面预期） | 1（0.67–1） | 30 |
| 1:1 落地率（done 核对） | 1（0–1） | 27 |
| 虚假的 ✓（条） | 0（0–1） | 30 |
| 跑了 done（比例） | 100% | 30 |
| 跑了 finish（比例） | 100% | 30 |
| 报告格式合规（比例） | 53% | 30 |
| 设计变量使用率 | 1（1–1） | 15 |
| 两次进度最长间隔（秒） | 6.08（0.29–183.34） | 30 |
| 没进度也没改源码的最长时间（秒） | 12.05（3.01–183.34） | 30 |
| 被权限拦下的工具调用 | 0（0–2） | 30 |
| 子 Agent 调用 | 0（0–0） | 30 |
| API 重试 | 0（0–1） | 30 |

| 场景 | 整轮用时每条（秒） | 每条平均工具调用 | 1:1 落地率（页面预期） | 虚假的 ✓（条） | 两次进度最长间隔（秒） | 没进度也没改源码的最长时间（秒） |
|---|---|---|---|---|---|---|
| button-over-rule | 8.18（6.14–15.46） | 3.5（3.5–5） | 1（1–1） | 0（0–0） | 0.34（0.29–6.54） | 12.4（9.27–18.99） |
| cards-style | 6.29（4.5–8.96） | 3.33（3–3.33） | 1（1–1） | 0（0–0） | 1.36（0.6–1.88） | 13.29（8.67–21.36） |
| data-and-text | 12.84（6.05–16.08） | 3.67（3.33–4） | 1（1–1） | 0（0–0） | 6.25（2.63–18.87） | 18.45（9.77–35.44） |
| dissolve-place-frame | 16.32（8.54–21.25） | 5（4.33–5.67） | 1（1–1） | 0（0–0） | 6.89（2.49–15.02） | 30.67（15.59–41.03） |
| fill-gap-brief | 11.01（6.91–11.92） | 4.33（4–4.67） | 1（1–1） | 0（0–0） | 5.92（4–8.82） | 12.24（11.85–19.3） |
| phone-breakpoints | 26.37（15.76–74.45） | 5.33（5–5.33） | 1（1–1） | 0（0–0） | 15.4（14.36–183.34） | 26.05（14.63–183.34） |
| promote-and-grid | 6.84（5.84–8.63） | 3（2.67–3） | 0.67（0.67–0.67） | 1（1–1） | 7.01（4.49–8.86） | 9.29（6.87–10.13） |
| put-back-and-new-text | 6.64（6.22–7.69） | 3.67（3.33–4） | 1（1–1） | 0（0–0） | 3.93（2.55–6.58） | 9.91（8.8–13.17） |
| reorder-and-move | 7.91（7.85–10.47） | 3.5（3.5–3.5） | 1（1–1） | 0（0–0） | 7.66（6.83–11.9） | 7.89（7.5–11.42） |
| type-and-stack | 5.52（3.18–6.56） | 2.67（2.67–3） | 1（1–1） | 0（0–0） | 3.17（1.76–4.72） | 4.75（3.01–11.08） |

### cursor：2026.10.22-27dcf5f，模型 Grok 4.7 256K High，effort reasoning_effort=high (in --model)，子 Agent 模型 无，30 次，2026-10-30

| 指标 | 中位数（范围） | 次数 |
|---|---|---|
| 整轮用时 claim→finish（秒） | 52.52（20.38–522.3） | 30 |
| 整轮用时每条（秒） | 22.01（8.94–174.1） | 30 |
| Agent 总用时（秒） | 86.28（48.63–556.72） | 30 |
| 每条平均工具调用 | 5.17（3.67–23.67） | 30 |
| 全仓搜索次数 | 3（0–21） | 30 |
| 读入字数：Skill | 24653（24653–49306） | 30 |
| 读入字数：claim 输出 | 2938.5（1525–6461） | 30 |
| 读入字数：全部工具输出 | 50486.5（31912–321443） | 30 |
| 1:1 落地率（页面预期） | 1（0.33–1） | 30 |
| 1:1 落地率（done 核对） | 1（0–1） | 27 |
| 虚假的 ✓（条） | 0（0–2） | 30 |
| 跑了 done（比例） | 100% | 30 |
| 跑了 finish（比例） | 100% | 30 |
| 报告格式合规（比例） | 100% | 30 |
| 设计变量使用率 | 1（1–1） | 15 |
| 两次进度最长间隔（秒） | 9.8（2.31–31.75） | 30 |
| 没进度也没改源码的最长时间（秒） | 35.71（9.85–471.88） | 30 |
| 被权限拦下的工具调用 | 0（0–2） | 30 |
| 子 Agent 调用 | 0（0–0） | 30 |
| API 重试 | 0（0–0） | 30 |

| 场景 | 整轮用时每条（秒） | 每条平均工具调用 | 1:1 落地率（页面预期） | 虚假的 ✓（条） | 两次进度最长间隔（秒） | 没进度也没改源码的最长时间（秒） |
|---|---|---|---|---|---|---|
| button-over-rule | 14.45（10.19–25.23） | 5（4.5–6.5） | 1（1–1） | 0（0–0） | 2.58（2.31–3.54） | 19.33（13.25–42.92） |
| cards-style | 16.67（15.48–24.71） | 6（5–6.33） | 1（1–1） | 0（0–0） | 3.47（3.18–3.98） | 37.45（33.96–52.53） |
| data-and-text | 37.63（27.36–46.63） | 6.33（5–8） | 1（1–1） | 0（0–0） | 8.31（8.21–15.12） | 78.93（55.93–112.27） |
| dissolve-place-frame | 51.1（44.74–108.75） | 13（8–19.67） | 1（0.33–1） | 0（0–2） | 31.22（31.15–31.75） | 104.72（91.89–222.6） |
| fill-gap-brief | 43.8（29.23–69.62） | 13（6–14.67） | 1（1–1） | 0（0–0） | 23.2（6.93–24.8） | 70（68.81–100.26） |
| phone-breakpoints | 116.71（53.08–174.1） | 17（6.67–23.67） | 1（1–1） | 0（0–0） | 21.32（15.69–25.29） | 308.92（123.28–471.88） |
| promote-and-grid | 11.78（8.94–17.43） | 3.67（3.67–3.67） | 0.67（0.67–1） | 1（0–1） | 8.54（6.14–12.93） | 11.47（11.44–23.64） |
| put-back-and-new-text | 17.58（14.91–26.11） | 5（4.67–5.33） | 1（1–1） | 0（0–0） | 8.05（7.9–23.74） | 26.29（25.1–29.56） |
| reorder-and-move | 18.31（13.71–19.32） | 4.5（4.5–5） | 1（1–1） | 0（0–0） | 11.34（10.81–14.12） | 12.77（9.85–20.03） |
| type-and-stack | 12.67（11.85–16.8） | 4.33（4–5） | 1（1–1） | 0（0–0） | 8.85（7.17–10.76） | 19.55（19.21–26.58） |

合计（30 次加在一起）：

| | Claude Code（Sonnet 5.5 high） | Cursor（Grok 4.7 256K High） |
|---|---|---|
| 按页面预期 1:1 的改动 | 78 / 81 | 77 / 81 |
| 虚假的 ✓ | 3 条（promote-and-grid 三次都是第 2 条） | 4 条（promote-and-grid 两次各 1 条；dissolve-place-frame 一次 2 条） |
| 报告格式合规 | 16 / 30 | 30 / 30 |
| 全仓搜索 | 共 17 次 | 共 122 次 |
| 被权限拦下 | 共 9 次 | 共 3 次 |
| 两次进度最长间隔 | 最长 183 秒（一次 API 181 秒没响应），其余不超过 19 秒 | 最长 32 秒 |
| 没进度也没改源码的最长时间 | 最长 183 秒（同上） | 最长 472 秒（phone-breakpoints：改完后长时间读文件、搜索，才 `finish`） |
| 子 Agent 调用 | 0 | 0 |
| API 重试 | 1 次 | Cursor 不报 |

**跑分中的发现（给 64–68 和 24）**

- 虚假的 ✓ 都出在页面核对漏看的地方：
  - promote-and-grid：设计师在桌面视图把 Grid 改成 2 列。Agent 两家都只把 `sm:grid-cols-3` 改成 `sm:grid-cols-2`，手机宽度还是 1 列。页面核对只在桌面宽度看，于是报「显示了」。改动说明写的是「all breakpoints」「from 3 to 2」，可页面上手机宽度本来就是 1 列，说明没有讲清楚。
  - dissolve-place-frame（Cursor 一次）：改成 absolute 的段落和按钮还留着 `mt-4`、`mt-6`，实际位置往下偏了 16、24px。核对 Y 只读 `top`，也报了「显示了」。
- 页面不核对的情况：reorder-and-move 的 Reorder，两家都得到「the layer cannot be told apart in its container on the page now」（按钮也被移进了 Header）；data-and-text 里删的是循环中的一项，编辑层也不核对。
- Claude 报告格式不合规的 14 次，都是把同一条改动同时列在 ✓ 和 ⚠️ 下（落地了，但写法和说明不完全一样），或者 ⚠️ 下缺「原因」那一行。Cursor 30 次都合规。
- Cursor 慢在核对之后：读文件、全仓搜索都多。phone-breakpoints 三次里两次超过 5 分钟。

**基线 B（d3ee07d，同步 main 之后）**

从现在起，64–68 的「改动前」都和基线 B 比，不再和上面的基线 A 比。

为什么重测：基线 A 量的是 main 7275e98 上的 Vernier Kit。之后同步 main，带进了编辑层线的 22、60、61、62。度量规则要求 64 的前后数字只差 64 本身的改动，所以在 d3ee07d 上重测了一遍。067d737（main 上「Merge the applying line: ticket 63」）和 d3ee07d 是同一份代码，`git diff` 为空。

两次之间的代码差别：
- 只改了编辑层（`packages/vernierkit/src/client/`）。
- Skill、CLI、`claim` 的输出、测量台（`e2e/bench/`、`applying-bench.spec.ts`）都没变。
- 所以两家读入的 Skill 字数、`claim` 输出字数和 A 一样。

- 日期：2026-10-31，北京时间 01:25–03:37。`summary` 里的日期按 UTC 记，写作 2026-10-30。
- 命令行：上面固定的两条，一字不差。和 A 的 `meta.json` 对过，命令行与版本都相同。
- 版本：
  - Claude Code 2.1.309，桌面 app 自带，和 A 相同。
  - Cursor agent-cli 2026.10.22-27dcf5f，Cursor app 自带，和 A 相同。
- 模型：
  - Claude：init 事件核对，30 次都是 `claude-sonnet-5-5`，`--effort high`，没有子模型。
  - Cursor：30 次都是「Grok 4.7 256K High」，没有子 Agent。
- 实际跑了多少次：两家各 30 次，都按顺序跑，没有并发，先跑完 Claude 再跑 Cursor（和 A 一样）。
  - 没有补跑，也没有作废的。
  - 有两次跑到 20 分钟超时：Cursor 的 dissolve-place-frame #1 和 #2。这是 Agent 自己的行为，不是外部原因，照常计入（见下文发现）。
- 原始结果（不进 git）：
  - Claude 在 `bench-results/agents/2026-10-30T17-25-02-495Z/`，Cursor 在 `bench-results/agents/2026-10-30T17-50-09-371Z/`。
  - 剧本结果在 `bench-results/playbooks/`。基线 A 的剧本结果另存在 `bench-results/playbooks-baselineA-7275e98/`。
- 同时跑过的检查：
  - `node --test 'e2e/bench/*.test.ts'`：13 个都过。
  - `bench-scenarios.spec.ts`：10 个都过。
  - `pnpm bench:agents --dry`：10 个场景都设得起来。

脚本剧本（`VK_E2E_PORT=5600`，六个都过，58 秒）：六个剧本的每项数字都和基线 A 一样。

| 剧本 | 核对覆盖率 | 进度环与页面之差（结束时 / 最大） | 停滞提示 | 留到下一轮 | 没认领改代码被发现 |
|---|---|---|---|---|---|
| 照流程走 | 100% | 0 / 1 | 误报 0 次（看了 6 次） | – | 误报 0 次（看了 6 次） |
| 跳过 `done` | 0% | 3 / 3 | – | – | – |
| 全改完才一起 `done` | 100% | 0 / 3 | – | – | – |
| 做到一半退出、不 `finish` | 停下时 33% | 停下时 0 | 15 秒内没出现 | 0%（已落地的那条也没再出现） | – |
| 没认领就改代码 | – | – | – | – | 否（看了 5 秒；编辑没暂停；画布改动保住 100%） |
| 两次进度之间停很久再继续 | 100% | 0 / – | 停顿 15 秒中 0 次，恢复后无残留 | – | – |

真实 Agent，和基线 A 并排（中位数（范围），30 次；比例一栏是为「是」的比例）：

| 指标 | Claude A | Claude B | Cursor A | Cursor B |
|---|---|---|---|---|
| 整轮用时 claim→finish（秒） | 20.84（9.53–223.36） | 22.85（9.82–213.52） | 52.52（20.38–522.3） | 61.52（25.76–544.24） |
| 整轮用时每条（秒） | 8.05（3.18–74.45） | 7.62（3.27–71.17） | 22.01（8.94–174.1） | 20.75（10.73–181.41） |
| Agent 总用时（秒） | 38.61（17.46–239.89） | 35.54（18.97–229.77） | 86.28（48.63–556.72） | 90.78（54.5–1200.23） |
| 每条平均工具调用 | 3.5（2.67–5.67） | 3.67（2.67–5.67） | 5.17（3.67–23.67） | 5.67（3.33–16） |
| 全仓搜索次数 | 0（0–2） | 1（0–2） | 3（0–21） | 2.5（0–12） |
| 读入字数：Skill | 24482（24482–24482） | 24482（24482–24482） | 24653（24653–49306） | 24653（24653–49306） |
| 读入字数：claim 输出 | 2936.5（1523–4858） | 2936.5（1523–4858） | 2938.5（1525–6461） | 2938.5（1525–4860） |
| 读入字数：全部工具输出 | 30866（27795–35857） | 31212.5（27795–35862） | 50486.5（31912–321443） | 51279.5（31912–316637） |
| 1:1 落地率（页面预期） | 1（0.67–1） | 1（0.67–1） | 1（0.33–1） | 1（0.67–1） |
| 1:1 落地率（done 核对，27 次） | 1（0–1） | 1（0–1） | 1（0–1） | 1（0–1） |
| 虚假的 ✓（条） | 0（0–1） | 0（0–1） | 0（0–2） | 0（0–1） |
| 跑了 done（比例） | 100% | 100% | 100% | 100% |
| 跑了 finish（比例） | 100% | 100% | 100% | 100% |
| 报告格式合规（比例） | 53% | 63% | 100% | 93% |
| 设计变量使用率（15 次） | 1（1–1） | 1（1–1） | 1（1–1） | 1（1–1） |
| 两次进度最长间隔（秒） | 6.08（0.29–183.34） | 4.01（0.13–11.42） | 9.8（2.31–31.75） | 11.35（2.97–98.53） |
| 没进度也没改源码的最长时间（秒） | 12.05（3.01–183.34） | 10.96（3.63–199.51） | 35.71（9.85–471.88） | 42.77（11.22–406.83） |
| 被权限拦下的工具调用 | 0（0–2） | 0（0–2） | 0（0–2） | 0（0–2） |
| 子 Agent 调用 | 0（0–0） | 0（0–0） | 0（0–0） | 0（0–0） |
| API 重试 | 0（0–1） | 0（0–1） | 0（0–0） | 0（0–0） |

合计（30 次加在一起）：

| | Claude A | Claude B | Cursor A | Cursor B |
|---|---|---|---|---|
| 按页面预期 1:1 的改动 | 78 / 81 | 78 / 81 | 77 / 81 | 79 / 81 |
| 虚假的 ✓ | 3 条（promote-and-grid 三次都是第 2 条） | 3 条（同 A） | 4 条 | 2 条（promote-and-grid #1、#2 的第 2 条） |
| 报告格式合规 | 16 / 30 | 19 / 30 | 30 / 30 | 28 / 30（不合规的两次都是超时、没有报告） |
| 全仓搜索 | 共 17 次 | 共 20 次 | 共 122 次 | 共 97 次 |
| 被权限拦下 | 共 9 次 | 共 6 次 | 共 3 次 | 共 4 次 |
| 超时（20 分钟） | 0 | 0 | 0 | 2（dissolve-place-frame #1、#2） |
| 两次进度最长间隔 | 最长 183 秒（API） | 最长 11 秒 | 最长 32 秒 | 最长 99 秒（phone-breakpoints #1；#3 是 95 秒） |
| 没进度也没改源码的最长时间 | 最长 183 秒（API） | 最长 200 秒（dissolve-place-frame #1，API 连接错误后重试） | 最长 472 秒 | 最长 407 秒（fill-gap-brief #3） |
| API 重试 | 1 次 | 1 次 | Cursor 不报 | Cursor 不报 |

### claude B：按场景（每个场景 3 次）

| 场景 | 整轮用时每条（秒） | 每条平均工具调用 | 1:1 落地率（页面预期） | 虚假的 ✓（条） | 两次进度最长间隔（秒） | 没进度也没改源码的最长时间（秒） |
|---|---|---|---|---|---|---|
| button-over-rule | 12.17（7.07–13.61） | 3.5（3.5–3.5） | 1（1–1） | 0（0–0） | 0.16（0.13–0.27） | 21.8（10.97–23.91） |
| cards-style | 3.82（3.65–7.28） | 3（3–3.33） | 1（1–1） | 0（0–0） | 1.49（0.96–2.1） | 6.59（6.41–15.67） |
| data-and-text | 8.41（7.95–10.14） | 3.67（3.33–4.67） | 1（1–1） | 0（0–0） | 4.01（3.04–5.55） | 12.98（12.42–17.55） |
| dissolve-place-frame | 9.09（8.25–71.17） | 4.67（4.67–5.67） | 1（1–1） | 0（0–0） | 5.24（4.11–7.97） | 14.22（10.96–199.51） |
| fill-gap-brief | 8.03（6.51–8.65） | 4.67（4.33–4.67） | 1（1–1） | 0（0–0） | 4（3.99–7.01） | 9.91（8.43–13.32） |
| phone-breakpoints | 12.59（10.27–12.71） | 5.33（5–5.33） | 1（1–1） | 0（0–0） | 4.58（4.25–11.42） | 16.53（14.16–20.33） |
| promote-and-grid | 4.87（4.79–5.84） | 4（3.67–4.33） | 0.67（0.67–0.67） | 1（1–1） | 3.57（2.59–4.79） | 7.69（4.99–8.3） |
| put-back-and-new-text | 7.11（4.61–9.29） | 3.67（3–3.67） | 1（1–1） | 0（0–0） | 3.8（2.4–5.84） | 8.69（7.4–13.41） |
| reorder-and-move | 7.17（6.75–15.54） | 4（3.5–4） | 1（1–1） | 0（0–0） | 6.29（1.1–7.01） | 10.28（6.98–19.92） |
| type-and-stack | 6.27（3.27–6.65） | 2.67（2.67–3） | 1（1–1） | 0（0–0） | 5.25（2.85–6.01） | 6.62（3.63–7.13） |

### cursor B：按场景（每个场景 3 次）

| 场景 | 整轮用时每条（秒） | 每条平均工具调用 | 1:1 落地率（页面预期） | 虚假的 ✓（条） | 两次进度最长间隔（秒） | 没进度也没改源码的最长时间（秒） |
|---|---|---|---|---|---|---|
| button-over-rule | 19.96（17.2–22.62） | 5（4.5–6.5） | 1（1–1） | 0（0–0） | 3.28（2.97–7.78） | 27.6（25.1–31.37） |
| cards-style | 20.05（18.71–20.86） | 6（5.67–6.33） | 1（1–1） | 0（0–0） | 3.41（3.2–3.5） | 45.13（41.02–49.79） |
| data-and-text | 39.7（33.44–56.38） | 6.33（6–7.33） | 1（1–1） | 0（0–0） | 15.21（14.02–20.15） | 83.74（62.82–113.35） |
| dissolve-place-frame | 70.23（53.49–71.74） | 15.67（10–16） | 1（1–1） | 0（0–0） | 32.74（27.79–51.37） | 106.98（105.98–132.74） |
| fill-gap-brief | 59.5（34.27–181.41） | 6（5.67–16） | 1（1–1） | 0（0–0） | 15.18（12.4–18.78） | 118.42（70.92–406.83） |
| phone-breakpoints | 76.56（73.89–77.54） | 7.67（7.33–10） | 1（1–1） | 0（0–0） | 95.39（6.91–98.53） | 120.82（90.73–196.52） |
| promote-and-grid | 13.81（10.73–20.65） | 3.67（3.67–4） | 0.67（0.67–1） | 1（0–1） | 7.37（6.28–23.15） | 25.59（16.52–29.36） |
| put-back-and-new-text | 18.8（13.81–22.69） | 5.33（4.67–5.33） | 1（1–1） | 0（0–0） | 8.33（7.85–12.2） | 33.86（20.26–44.51） |
| reorder-and-move | 15.04（12.88–15.29） | 5（5–5） | 1（1–1） | 0（0–0） | 10.09（8.59–10.09） | 13.91（11.22–16.23） |
| type-and-stack | 15.66（13.32–20.36） | 5（3.33–5.33） | 1（1–1） | 0（0–0） | 27.42（10.5–29.66） | 26.93（13.78–29.35） |

和基线 A 比，明显的差别：

- 总体上没有实质变化：
  - 两家的中位数都在 A 的波动范围里。
  - 1:1 落地率、done / finish、设计变量使用率都一样。
  - Skill 和 claim 输出的字数完全一样（这两样代码都没改）。
  - 编辑层的改动没有让落地变好或变差，可以当作同一个起点。
- Claude：
  - 虚假的 ✓ 和 A 一样，还是 promote-and-grid 三次都是第 2 条，原因同 A（只改了 `sm:` 断点）。
  - 报告格式合规从 16 / 30 到 19 / 30，不合规的原因同 A（同一条同时列在 ✓ 和 ⚠️ 下）。这是 Agent 本身的波动，不是代码带来的。
  - 长尾仍然只有一次 API 连接错误：dissolve-place-frame #1，约 196 秒没响应，之后重试。
- Cursor，新出现：dissolve-place-frame 三次都在落地后自己起了 Vite（`npx vite --port 5173`，A 里一次都没有）。
  - 其中 #1、#2 在 `finish` 之后（claim→finish 分别是 211、215 秒），想好报告却一直没有输出最后一条消息，挂到 20 分钟超时才被停掉。
  - 所以这两次的 Agent 总用时是 1200 秒，报告格式不合规（没有报告）。
  - 这是 Agent 自己的行为，不是外部原因，没有补跑。
  - 整轮用时只算到 `finish`，不受影响。
- Cursor 的 phone-breakpoints：两次进度最长间隔从 A 的 15.7–25.3 秒变成 6.9–98.5 秒。中位数 95 秒，有两次超过 90 秒。没进度也没改源码的最长时间反而比 A 短（中位数 121 秒，A 是 309 秒）。
- Cursor 的虚假的 ✓ 从 4 条降到 2 条：
  - A 里 dissolve-place-frame 那次留着 `mt-4`、`mt-6` 的情况，这次没出现。B 的 #1 在思考里写明了要「移除 mt-4 和 mt-6 避免偏移累加」。
  - 只是 3 次里的一次，不能算改进。
- Cursor 会用设计师用户级的 Playwright 插件（`@playwright/mcp`，默认是有窗口的浏览器）自己打开页面：
  - B 里有 4 次（dissolve-place-frame #1、#2，fill-gap-brief #3，共 25 次调用），A 里也有 4 次。
  - 它打开的页面有测量台的 `5643` 和它自己起的 `5173`。
  - 这可能在设计师屏幕上开出窗口，和「页面只在 headless 浏览器里开」不符。这是现在的隔离漏掉的（Cursor 的用户级插件照常加载）。
  - 要不要在测量台里关掉它，需要设计师决定：改了 Cursor 的运行环境，之后的数字就要和新的基线比。

**64–68 记录前后数字的格式**

改动前后各跑一次。「改动前」可以直接用基线 B 的数字。前提是 64–68 的改动之外，代码与 d3ee07d 相同，Agent 版本与模型也相同。不然就在改动前的提交上重跑。真实 Agent 要用同一 Agent、同一命令行、同一模型（就是上面那两条），场景可以只取相关的，但前后要一样。在 Comments 里贴：

```
**前后数字（日期，提交 <前> → <后>）**

脚本剧本：<剧本>
| 指标 | 改动前 | 改动后 | 目标 |
|---|---|---|---|
| 核对覆盖率 | 0% | 100% | 100% |

真实 Agent：<Agent 版本>，模型 <模型>，effort <effort>，场景 <id,…> × <n> 次；原始结果 bench-results/agents/<时间>/
| 指标 | 改动前 中位数（范围） | 改动后 中位数（范围） | 目标 |
|---|---|---|---|
| 整轮用时每条（秒） | | | 不高于前 |
| 每条平均工具调用 | | | 不高于前 |
| 读入字数：Skill / claim 输出 | | | 少于前（65） |
| 1:1 落地率（页面预期 / done 核对） | | | 不变差 |
| 虚假的 ✓（合计条数） | | | 0 |
| 报告格式合规（比例） | | | 不变差 |
| 没进度也没改源码的最长时间（秒） | | | （67 定阈值） |
```

**Cursor 的浏览器插件改成 headless（2026-10-31）**

从这次提交起，测量台里 Cursor 的两个浏览器插件都在 headless 浏览器里开页面，不会在设计师屏幕上开出窗口。只改了测量台给 Cursor 的运行条件。Vernier Kit 的代码、提示、模型、权限都没变。

- 换掉的是设计师用户级的两个插件：
  - Cursor 的 `playwright`（`npx -y @playwright/mcp@latest`，默认开有窗口的浏览器）；
  - `chrome-devtools-mcp`（Claude 的插件，Cursor 也加载，`npx chrome-devtools-mcp@1.11.0`，默认也开有窗口的 Chrome）。
- 怎么换：
  - 每次运行前，测量台在这次运行自己的结果文件夹里写两个同名的本地插件：`<run folder>/cursor-plugins/playwright`、`<run folder>/cursor-plugins/chrome-devtools-mcp`。
  - 每个插件只声明一个 MCP 服务器，服务器名、包和版本都和原插件一样，另外加了 `--headless --isolated`，并用 headless shell 的路径（`--executable-path` / `--executablePath`）。
  - chrome-devtools 那条比原插件多一个 `-y`，让 npx 不提问。
  - Cursor 的命令行在末尾加了两个 `--plugin-dir` 指向它们。Cursor 用同名的本地插件顶替已装的插件。
  - Agent 的项目里还是只有 `.cursor/cli.json`。
  - 用户级的 Cursor 配置、插件目录和 HOME 都没动。
- headless shell 的路径：
  - 从仓库 Playwright 的 `chromium.executablePath()` 推出同一修订号的 `chromium_headless_shell-<rev>`，这台机器上是 1248。也可以用 `VK_BENCH_HEADLESS_SHELL` 指定。
  - 找不到时就不传路径。两个服务器仍是 headless 加临时 profile，退回用 Chrome：没有窗口，也不碰设计师的 Chrome profile。
  - 每次运行的 `raw.json` 里有 `headlessShell` 一项，记下实际用的路径；退回 Chrome 时这一项是 null。
- 新记录：每次运行的 `raw.json` 里还有 `headedBrowsers`。
  - 测量台每秒看一次进程表，把 Agent 进程树里既不是 headless shell、也没带 `--headless` 的浏览器主进程记下来。只读进程表，不杀进程。
  - 有记录时，测量台在终端报一行。
  - 活不到一秒的浏览器可能漏掉，所以空列表只说明没看到。
  - 冒烟里两个 MCP 起的浏览器都在 Agent 进程（cursor-agent）的子孙里，所以看得到。
  - Claude Code 也记，它本来就不带 MCP。
- 先试过但不行的办法：
  - 环境变量 `PLAYWRIGHT_MCP_HEADLESS` 等：`@playwright/mcp` 自己认这些变量，但 agent-cli 起插件里的 MCP 时只传 HOME、LOGNAME、PATH、SHELL、TERM、USER，进不去。
  - 项目里的 `.cursor/mcp.json` 同名服务器：
    - 不加 `--approve-mcps` 时不加载（需要批准），起的仍是插件版；
    - 加了 `--approve-mcps`，两份都起；
    - 改用插件的标识名，起的还是插件版，而且那次运行退出码是 1。
- 验证（9 次 Cursor 冒烟，都在临时目录的示例项目副本里，不计入任何数字）：
  - 只回 OK 的一次，用的是测量台的 prepare 和命令行。每个名字只有一个 MCP 进程，参数里都带 headless：
    ```
    npm exec @playwright/mcp@latest --headless --isolated --executable-path /Users/bingyizhang/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell
    npm exec chrome-devtools-mcp@1.11.0 --headless --isolated --executablePath /Users/bingyizhang/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell
    ```
  - 真的开浏览器的一次：让它用 playwright 的 `browser_navigate`、chrome-devtools 的 `new_page` 各打开一次 5623 上的临时页面，两次都读回了标题。起的两个浏览器主进程都是 headless shell，没有有窗口的 Chrome，`headedBrowsers` 为空：
    ```
    67844 (父进程 playwright-mcp) …/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell --disable-field-trial-config … --headless …
    67846 (父进程 chrome-devtools-mcp) …/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell --allow-pre-commit-input … --headless=new …
    ```
  - 工具名不变：调用的是 `plugin-playwright-playwright-browser_navigate`、`plugin-chrome-devtools-mcp-chrome-devtools-new_page`，和基线 B 的 transcript 里一样。
  - chrome-devtools 插件带的 7 个 Skill（a11y-debugging 等）也还在：让它列可用的 Skill 时都列出来了。
    - 本地插件里不带 Skill，所以 Cursor 换掉的只是 MCP 服务器，原插件的 Skill 照常加载。
    - 这是冒烟里看到的，测量台不检查。agent-cli 升级后要再看一次。
  - 同样的「只回 OK」，加不加 `--plugin-dir`，送给模型的总输入都是 22781 token（加了的那次缓存命中少，未缓存 21629 + 缓存 1152；没加的 16253 + 6528）。工具和 Skill 的说明量没变。
- 条件差异：
  - 工具名和工具集不变，只是浏览器没有窗口。所以 64–68 仍和基线 B 比，记为条件差异。
  - Cursor 的命令行多了两个 `--plugin-dir`，所以不能把新的运行加进基线 A、B 的结果文件夹（测量台会拒绝），要另起一轮。
- 基线里 Cursor 可能开过有窗口浏览器的次数（数的是用 playwright 插件的调用，chrome-devtools 从没被调用过；用的都是默认的有窗口模式）：
  - 基线 A：4 次运行，21 次调用（dissolve-place-frame #1、#2，fill-gap-brief #1、#3）；
  - 基线 B：3 次运行，25 次调用（dissolve-place-frame #1、#2，fill-gap-brief #3）。上面基线 B 的发现里写的「4 次」应为 3 次。

**测量台跳过占用的端口（2026-10-31，ticket 64 的 63e2f57）**

- 测量台给每次运行挑端口（5620–5649）时，先看有没有东西在应答，有就跳过并在终端报一行。
- 起因：64 手动停掉一批跑分后，留下一个开发服务器占着 5624。测量台起服务器用 `--strictPort`，再等「这个端口应答」，会拿到留下那个服务器的应答，量错项目。
- 不影响任何计分，也不改 Agent 的运行条件。64 的两批里各跳过了一次 5624。


**位置的预期改为画布画出来的位置，基线 A、B 重新打分（2026-10-31，ticket 64 的补完）**

- 改了什么（`e2e/bench/scenarios.ts`，dissolve-place-frame）：
  - 解散的那条：header 和介绍段落相对 hero 的边框盒位置，原来和改动里的 X、Y 比；现在和 X、Y 加上它们在画布上的外边距比（段落 `mt-4` 是 16px，header 没有）。
  - 按钮 Y 那条：原来拿边框盒的 top 和 Y（488）比；现在和 Y 加画布上的上外边距比（`mt-6`，24px，即 512）。
  - 外边距从改动里读：编辑层从 64 的补完起，给按 X、Y 放置的改动（`x`、`y`、`absolute`、移成自由定位）和解散 Stack 里的每个图层记下画布上的外边距。
  - 新建 Frame 那条不变：新建的 Frame 在画布上没有外边距，原来的比法就是画出来的位置。其他九个场景没有拿位置和边框盒比的预期。
- 为什么：
  - 画布上 Y 就是 CSS `top`，外边距留着，画出来的位置是 top + 外边距。解散 Stack、拖成自由定位都是这样（`stack.spec.ts`）。总调度 10/31 决定这层语义不改。
  - 旧的预期按「边框盒位置 == Y」算，等于要求 Agent 去掉外边距，和画布不一致：
    - 照画布留着外边距的运行，被记成没落地，报告里的 ✓ 算成虚假的 ✓。
    - 去掉外边距、页面比画布高出 16、24px 的运行，却算 1:1。
- 怎么重新打分：
  - 不跑 Agent，在系统临时目录里重放。每次运行：
    1. 从当前代码打包，复制示例项目，用 `init` 装上；
    2. 在 5625 起的端口起开发服务器（5624 被残留的服务器占着，跳过）；
    3. 先在起始代码上量出 hero 里三个图层的外边距，补进存下的改动（旧的改动里没有）；
    4. 用 `git apply` 重放这次运行的 `diff.patch`（不含 `.vernier/`、`.playwright-mcp/`、`.cursor/`）；
    5. 等 3 秒，按测量台的做法开只看的页面，用旧预期和新预期各判一次。
  - 旧预期的判定和当时 `raw.json` 记下的 `shownAtEnd` 18 次全部一致，说明重放还原了当时的页面。
  - 只有 dissolve-place-frame 受影响，两家三组各 3 次，共 18 次。改过分的结果文件夹在 `bench-results/rescored-position-64/`（不进 git，每组一个文件夹，带 `summary.md`；`rescore.json` 是逐次的明细，`rescore.ts` 是重放用的脚本）。原来的结果文件夹没动。
- 18 次里 16 次去掉了外边距：header、段落、按钮的 `top` 分别写成 283.2、323.2、488px，外边距 0，画出来比画布高 0、16、24px。只有 Cursor A #2 和 Cursor 64 #1 留着外边距，和画布一致。

| 合计（30 次） | 原来 | 现在（按画布画出来的位置） |
|---|---|---|
| Claude A：按页面预期 1:1 | 78 / 81 | 72 / 81 |
| Claude A：虚假的 ✓ | 3 | 9（dissolve-place-frame 三次各 2 条） |
| Cursor A：按页面预期 1:1 | 77 / 81 | 75 / 81 |
| Cursor A：虚假的 ✓ | 4（其中 dissolve-place-frame #2 两条） | 6（dissolve-place-frame #1、#3 各 2 条；#2 不再算） |
| Claude B：按页面预期 1:1 | 78 / 81 | 72 / 81 |
| Claude B：虚假的 ✓ | 3 | 9（dissolve-place-frame 三次各 2 条） |
| Cursor B：按页面预期 1:1 | 79 / 81 | 73 / 81 |
| Cursor B：虚假的 ✓ | 2 | 4（dissolve-place-frame #3 两条；#1、#2 超时没有报告，不算 ✓） |

- 每次运行的「1:1 落地率（页面预期）」中位数四组都还是 1，范围下限从 0.67 变成 0.33。
- 「1:1 落地率（done 核对）」不受影响：它用的是当时页面核对的结果，重放没有重做页面核对。当时的核对只比 `top`，这 16 次按钮 Y 都报了「显示了」；按 64 补完后的核对，会报「没显示」，并说明是外边距的差别。
- 上面「基线 A」「基线 B」两节的表保留原来的数字。和 64–68 比时用这里的新数字，64 的数字在 64 的 Comments。

**记下「没认领在改代码」的提示（2026-10-31，ticket 66）**

- 每次真实 Agent 运行的 `raw.json` 多了两项，只记录，不改任何计分，`summary` 和 `measures.json` 也没变：
  - `unclaimedNotices`：从 Agent 开始算，设计师的页面上「The code is changing, but no Agent has claimed your changes」提示出现过几次；
  - `times.unclaimedNotices`：每次出现的时间。
- 怎么记（`e2e/bench/notices.ts`，有单测 `notices.test.ts`）：
  - 设计师页面的 context 先装一个初始化脚本，看着编辑层的 Shadow DOM，按编辑层给提示的标记（`data-vk-notice="unclaimed"`）记下每次出现。一闪而过的也记；页面刷新后接着记。
  - 这个提示只在编辑模式、没认领时出现。所以认领前出现的，是 Agent 没认领就改了代码，提示是对的；认领后出现的才是误报。用 `times.claim` 区分。
- 65 两家各复测 30 次时，顺带用这一项验证真实落地时 0 误报。之前的运行没有这一项。
- `--dry` 也查：设场景时出现这个提示，就报这个场景有问题。
- 剧本那边（`applying-bench.spec.ts`）：
  - `unclaimedNotice` 改为按标记找；
  - 「没认领就改代码」探「编辑还能不能改」时，点图层树限时 2 秒，只有被提示挡住才算暂停（原来不限时，提示挡住时会等到测试超时）；
  - 每个剧本多记 `unclaimedNoticesShown`；
  - 加了 66 的断言。数字见 66 的 Comments。


**不加载 Skill 的运行（2026-10-31，ticket 65 的 b5fdf36）**

- `pnpm bench:agents --no-skill`：项目里没有 Skill，Agent 只被告知「运行 `npx vernierkit claim`，照输出落地」。
  - 打基础项目时，`init` 之后、提交之前，拿掉它放进去的 Skill（`.agents/skills/vernierkit/`、`.claude/skills/vernierkit/`，空了的上级文件夹一起），以及 AGENTS.md 里指向它的那一行（只剩这一行时删掉整个文件）。所以 git 历史里也没有 Skill。
  - 包里自带的那份 `node_modules/vernierkit/skill/SKILL.md` 还在。
- 记录：
  - `meta.json` 多了 `skill`；
  - 每次运行的 `raw.json` 多了 `skill: false`（之前的运行没有这一项，按 true 算）；
  - `summary.md` 的标题注明「不加载 Skill」。
  - 命令行里提示词不同，所以不加载 Skill 的运行不能接进加载的那一批（测量台按命令行拒绝）。
- 计分只改了一处：读到包里自带的那份 Skill，也算「读入字数：Skill」。原来只认 `skills/vernierkit/SKILL.md`，没有 Skill 的 Agent 去 `node_modules` 里找到它时会漏算。
  - 用新规则把基线 A、B 和 64 的 6 个结果文件夹（各 30 次）在副本上重算了一遍：180 次的每项数字都和原来的 `measures.json` 一样。
- 单测：提示词和命令行（`agents.test.ts`）；拿掉 Skill 只拿掉 `init` 放的那些（`agents.test.ts`）；包里那份算读了 Skill（`metrics.test.ts`）。
- 不影响任何已有的计分，也不改加载 Skill 时的运行条件。

**`@playwright/mcp` 固定版本、不加载 Skill 的安装记录、读包的统计（2026-10-31，ticket 65 补修的 4ff531e 和本条）**

- `@playwright/mcp` 从 `@latest` 改为固定 0.0.83（`agents.ts` 的 `PLAYWRIGHT_MCP`）。
  - 来源：npx 缓存里 `@playwright/mcp@latest` 那份（`~/.npm/_npx/9833c18b2d85bc59`）装的是 0.0.83，10/7 装上，之后没换过（64、65 跑分时 npx 每次都去问 registry，仍是这一份；10/31 13:46 是 65 的 Cursor 批次碰过它）。
  - 缓存里另有一份 0.0.79（10/23），是不带 `@latest` 的 `npx @playwright/mcp` 装的，测量台没用过。
  - `chrome-devtools-mcp` 本来就固定在 1.11.0，没动。
  - 这两项写在每次运行自己的插件文件里，不在 Cursor 的命令行里，所以 `meta.json` 的命令行不变。
- `--no-skill` 的项目，`withoutSkill` 也把 `.vernier/install.json` 里 AGENTS.md 那一行的记录去掉（`edits` 里 AGENTS.md 的那条，`created` 里的 AGENTS.md），其他记录不动。有单测。
  - 说明：这只让 `remove` 不再去撤一条已经不在的行。
  - **没做到「免得 Agent 跑 `doctor` 或 `init` 时把 Skill 装回去」**：
    - `doctor` 直接看项目里的 SKILL.md 和 AGENTS.md，不看安装记录，所以仍会说「SKILL.md is missing: run `npx vernierkit init`」；`init` 总是写回 Skill。
    - 而且 `.vernier/` 被 `.gitignore` 忽略，每次运行的项目是 git clone 出来的，本来就没有 `install.json`。
    - 要真的挡住，得改 Agent 能跑的命令（Claude 的 `Bash(npx vernierkit:*)`、Cursor 的 `Shell(npx)`），这会改命令行，就不能和 65 的不加载 Skill 那批比了。没做，由总调度定。
    - 65 和补修这两批不加载 Skill 的 20 次 Claude 都没有跑 `doctor` 或 `init`。
- 新统计「读 node_modules/vernierkit（次）」（`metrics.ts` 的 `packageReads`，`summary.md` 多一行）：
  - 数读包本身的工具调用：读文件、在包里 grep，`node -e` 读包里的文件，pnpm store 里那份也算，包里自带的 Skill 也算；Cursor 的 glob 按它的 `targetDirectory` 算。
  - 跑命令行（`npx vernierkit …`、`node …/dist/cli.js claim`）不算。
  - Cursor 的 glob 的目标文件夹记在 `folder`，不当作搜索的路径，所以全仓搜索的数不变。
  - 用新统计把基线 A、B、64、65（两家）和 65 不加载 Skill 的 9 个结果文件夹在副本上重算了一遍：除了新的这一项，每项数字都和原来的 `measures.json` 一样。
  - 回补的数在 65 的 Comments。Claude 每批都是 0；Cursor A 39、B 5、64 26、65 99。
- 测量台等断点改动的各段读完、存下，才让 Agent 开始（`scenarios.ts` 的 `saved`，ticket 65 补修）。各段的值是编辑层在设计师改完约半秒后读的，测量台不等的话，Agent 可能在存下之前就认领。
- 不影响任何已有的计分，也不改 Agent 的命令行。

**基线 B'（Cursor）（2026-10-31，北京时间 16:31–17:52）**

为什么重测：65 之后 Cursor 的整轮用时比基线 B 高，可 B 测完已经过了半天多，Cursor 那边的模型服务可能变了。设计师决定在 B 的同一份代码上再测一次 Cursor，叫基线 B'，紧接着在最终代码上测，和 B' 比（见 65 的 Comments）。B 和 B' 的差，就是这半天模型服务漂移有多大。

条件：
- 代码：用 `git archive 067d737` 导出到系统临时目录（`$TMPDIR/vk-baselineBprime-067d737-wbmI/`）。067d737 和 B 测的 d3ee07d 是同一份代码，也就是基线 B 的代码。没有在 worktree 里切分支，也没有新建 worktree。
- 测量台：`e2e/bench/` 用 83d3227 里的那份，就是 B 当时用的，和 067d737 里的一字不差。在上面打了四个补丁：
  1. 109f7d2：Cursor 的两个浏览器插件改成 headless，用 `--plugin-dir` 加载，并记下 `headedBrowsers`（`git diff 83d3227 109f7d2 -- e2e/bench`）。
  2. 63e2f57：跳过已经有东西在应答的端口（`git diff cc746bc 63e2f57 -- e2e/bench`）。
  3. 4ff531e 里的一处：`@playwright/mcp` 固定到 0.0.83（只打了 `PLAYWRIGHT_MCP` 这一处和对应的测试，这个提交里的其他改动没打）。
  4. 跑到中途加的：用 `VK_BENCH_CURSOR_MODEL` 改 `--model` 的 id（和 2cced7f 同一行改动）。
     - 理由：账号拒绝了原来的 id，设计师事先定了「后面的运行改用 `grok-4.7-high`」。
     - 命令行里的 `--model` 要能看出用的是哪个 id。
  - 别的没打。现在的测量台会等断点改动的各段读完、存下才让 Agent 开始，旧代码不支持这一步，所以 B' 不用现在的测量台。
  - 补丁打完后：`pnpm typecheck` 通过，`node --test 'e2e/bench/*.test.ts'` 18 个都过，`--dry` 10 个场景都设得起来。
- 场景、提示、次数和 B 一样：10 个场景 × 3 次，顺序跑，先跑完每个场景的第 1 次。跑的时候没有跑测试。
- 版本：
  - agent-cli 用 `VK_BENCH_CURSOR` 指向 `.local/bin/cursor-agent` 这个 symlink，就是 64 起用的那一个。
  - 跑前跑后都核对过：它指向 `versions/2026.10.22-27dcf5f`，`--version` 是 2026.10.22-27dcf5f。
  - 两批的 meta.json 版本都是这个；命令行和 64、65 的逐字比过，只有 `--model` 不同（见下）。
- 模型 id：
  - 前 25 次用的是原来的 `grok-4.7[context=256k,reasoning_effort=high,fast=false]`，和 B 一样。
    - 24 次正常跑完。
    - 第 25 次（promote-and-grid #3，约 17:31）被拒：「Cannot use this model: grok-4.7[context=256k,…]」。可用的模型列表里有 `grok-4.7-high`，没有 256K 那个 id。
    - 这次 0 次工具调用，测量台照规则停掉了这一批。
  - 剩下 6 次（promote-and-grid #3 起：reorder-and-move、data-and-text、put-back-and-new-text、phone-breakpoints、dissolve-place-frame 各一次第 3 次）改用 `--model grok-4.7-high`，另起一个结果文件夹。
    - 测量台不让命令行不同的运行接进同一批，所以必须另起。
    - init 事件里 6 次报的都是「Grok 4.7 256K High」。
  - 设计师确认这两个 id 在 Cursor 那边是同一个模型。所以 30 次合在一起算，不分开统计。
  - 从这次起，测量台的 Cursor 默认用 `grok-4.7-high`（2cced7f），因为原来的 id 时好时坏。`VK_BENCH_CURSOR_MODEL` 可以改成别的 id，命令行里能看到实际用的是哪个。
- 补跑：被拒的那 1 次属于外部原因，用 `grok-4.7-high` 补跑了 1 次。没有作废的批次。
- 机器负载（开跑前用 ps 记）：
  - 第一批开跑前 load 2.9–3.5。在跑的有设计师的 Claude app、Notion、ChatGPT 和 Codex、pi。
  - 第二批开跑前 load 3.9–4.2。syspolicyd 占约 52%，另外开着 Grok Bot。
  - 5620–5649 和 5173 上都没有开发服务器。
- 原始结果（不进 git）：
  - `bench-results/agents/2026-10-31T08-31-09-baselineBprime-067d737/`：原 id 的 25 次，含被拒的 promote-and-grid #3。
  - `bench-results/agents/2026-10-31T09-34-05-baselineBprime-067d737-grok-4.7-high/`：6 次。
  - 合起来的 30 次在 `bench-results/rescored-Bprime/baselineBprime-067d737-30runs/`：去掉了被拒的那次，dissolve-place-frame 已按画布位置重新打分，统计用现在的 metrics 算过。
  - 同一文件夹里还有 `rescore.json`（逐次明细）、`rescore.ts`（就是 `rescored-position-64/` 里那份，没改），以及下面几张表用的分析脚本：`tally.ts`、`breakdown.py`、`stats.py`。

跑完后怎么打分：
- dissolve-place-frame 用 64 补完时的重放办法（`rescore.ts`）重新打分，比的是画布画出来的位置。
  - 3 次重放的旧预期判定，和当时 `raw.json` 记下的 `shownAtEnd` 全部一致。
  - 3 次都去掉了 `mt-4`、`mt-6`（header、段落、按钮的 `top` 写成 283.2、323.2、488px），画出来比画布高 0、16、24px。
  - 所以按新预期，每次都有 2 条没落地；报告里把它们列在 ✓ 下，算 2 条虚假的 ✓。
- 后来才加的统计（读 node_modules/vernierkit 的次数等），用现在的 `summary` 在合起来的副本上补算。
- 旧代码本来就没有的项记为不适用：`unclaimedNotices`（「没认领在改代码」的提示是 66 才有的）。

数字（中位数（范围），30 次）。B 的 1:1 和虚假的 ✓ 用按画布位置重新打分后的数字，其余各项用现在的 metrics 重算：

| 指标 | B | B' | 漂移 B → B' |
|---|---|---|---|
| 整轮用时 claim→finish（秒） | 61.52（25.76–544.24） | 66.45（25.85–538.93） | +8% |
| 整轮用时每条（秒） | 20.75（10.73–181.41） | 23.79（12.79–179.64） | +15% |
| claim→finish 合计（秒） | 3,319 | 3,371 | +1.6% |
| Agent 总用时（秒） | 90.78（54.5–1200.23） | 102.41（57.52–581.86） | |
| 每条平均工具调用（合计） | 5.67（3.33–16）；579 | 5.33（3.67–17.33）；583 | |
| 全仓搜索（中位数；合计） | 2.5；97 | 2；94 | |
| 读入字数：Skill / claim / 全部 | 24,653 / 2,938.5 / 51,279.5 | 24,653 / 2,938.5 / 51,292 | Skill、claim 不变（代码相同） |
| 读 node_modules/vernierkit（调用；运行数） | 5；2 | 9；1（phone-breakpoints #1） | |
| 按页面预期 1:1（合计） | 73 / 81 | 74 / 81 | |
| 虚假的 ✓（合计） | 4 | 7（dissolve-place-frame 三次各 2 条，promote-and-grid #2 一条） | |
| 设计变量使用率（15 次） | 1 | 1 | |
| 报告格式合规 | 28 / 30 | 30 / 30 | |
| 跑了 done / finish | 30 / 30，30 / 30 | 30 / 30，30 / 30 | |
| `done` 次数（合计） | 85 | 84 | |
| 两次进度最长间隔（秒） | 11.35（2.97–98.53） | 10.62（3.03–75.74） | |
| 没进度也没改源码的最长时间（秒） | 42.77（11.22–406.83） | 44.57（10.6–473.29） | |
| Light（每条 ≤ 3 次工具调用且 0 次全仓搜索） | 0 / 30 | 0 / 30 | |
| 超时（20 分钟） | 2 | 0 | |
| `unclaimedNotices` | 不适用 | 不适用（旧代码没有这个提示） | |
| `headedBrowsers` | 不适用（B 还没记这一项；3 次用过有窗口的 playwright 插件） | 30 次都为空 | |
| done、finish 输出里的「did not answer in time」 | 0 | 0 | |

漂移有多大：
- claim→finish：Mann-Whitney p ≈ 0.74，每条 p ≈ 0.73。
- 按场景（3 次的中位数）比，B' / B 的几何平均是 1.01，同一场景的 |log 比值| 中位数是 0.20，和 A 对 B 的 0.20 一样。
- 中位数高了 8%，合计只高了 1.6%，总体上没有可见的漂移。
- 同一场景的摆动照旧很大，例如 data-and-text 119 → 175 秒、fill-gap-brief 179 → 112 秒。
- B 里 dissolve-place-frame 有两次挂到超时，这次没有出现：B' 三次都没有自己起 Vite。
- 按页面预期 1:1 和虚假的 ✓ 也没有实质差别：B' 三次 dissolve-place-frame 都去掉了外边距，B 是一次（另两次超时，没有报告）。

| 场景（claim→finish 中位数，秒） | B | B' |
|---|---|---|
| button-over-rule | 39.9 | 48.8 |
| cards-style | 60.2 | 58.5 |
| data-and-text | 119.1 | 174.5 |
| dissolve-place-frame | 210.7 | 186.7 |
| fill-gap-brief | 178.5 | 111.6 |
| phone-breakpoints | 229.7 | 230.6 |
| promote-and-grid | 41.4 | 51.0 |
| put-back-and-new-text | 56.4 | 69.6 |
| reorder-and-move | 30.1 | 27.6 |
| type-and-stack | 47.0 | 38.8 |

从现在起，Cursor 的「改动前」和 B' 比，不再和 B 比。最终代码的数字和对比见 65 的 Comments。
