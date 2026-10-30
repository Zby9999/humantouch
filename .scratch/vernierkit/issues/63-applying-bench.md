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
| 合计 | 76 | | 60 次进基线 |

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

**64–68 记录前后数字的格式**

改动前后各跑一次。真实 Agent 要用同一 Agent、同一命令行、同一模型（就是上面那两条），场景可以只取相关的，但前后要一样。在 Comments 里贴：

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
