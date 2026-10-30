# 63: 落地流程的测量台

**What to build:** 一套能反复跑的测量，回答「这次改动让落地更快、更稳了，还是更重、更慢了」，并在现在的代码上测出基线，供 64–68 对比。分两部分：

1. **脚本扮演 Agent 的剧本**，放进 e2e：照流程走；跳过 `done`；全改完才一起 `done`；做到一半退出、不 `finish`；没认领就改代码；两次进度之间停很久再继续。每个剧本输出 docs/goals.md Robust 一节的机制指标：核对覆盖率、进度准确、结束一轮后保住的未落地改动、停滞提示出现的时间、没认领改代码是否被发现。现在还没有的能力如实记为基线（例如保住 0%、没有提示）。
2. **真实 Agent 跑标准场景**：约 10 个标准场景，在示例项目的临时副本里，由真实 Agent 无人值守地落地，页面开在 headless 浏览器里供核对。从 Agent 的对话记录、归档的一轮结果和 git diff 算出：整轮用时、每条平均工具调用次数、全仓搜索次数、读入的字数、1:1 落地率、虚假的 ✓、是否跑了 `done` 和 `finish`、报告格式是否合规。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准（Robust 一节与度量规则），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0013）。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] 六个脚本剧本进 e2e，每个输出它对应的机制指标；本 ticket 只记录数值，不做达标断言（断言由 64–68 各自加上）
- [x] 约 10 个标准场景，每种改动至少出现一次，含断点改动与挪出、拖回画布，写明预期结果；场景可供 24 复用
- [x] 真实 Agent 跑分用单独一条命令启动，`pnpm test:e2e` 不会带起它；页面只在 headless 浏览器里打开，不抢设计师的焦点
- [x] 每个场景跑 3 次取中位数并给出波动范围；每次记下 Agent 的版本和所用模型；原始结果放在不进 git 的目录
- [ ] 在当前 main 上测出基线：脚本剧本全部，真实 Agent 至少 Claude Code，Cursor CLI 能跑就测（本机没有 Codex，不测）；数字记在 Comments
- [x] 跑真实 Agent 前先问设计师（会用掉 Agent 的额度）
- [x] 写明怎么启动、怎么读结果，以及 64–68 记录前后数字的格式

## 背景

- 来自 2026-10-30 的讨论：Agent 不由我们控制，ADR 0013 决定落地不靠 Agent 守流程。用户要求每项改动都要量化收益，否则不知道软件是更快、更好用了，还是更重、更慢了（docs/goals.md 的度量规则）。
- 真实 Agent 的数字只拿同一 Agent、同一模型比较。设计师本机的 Claude Code 接的是网关上的模型，换模型后的数字不能和之前的直接比。
- 24 要人工在三家 Agent 上统计的指标，这里能自动算出大部分，24 可以直接用这套场景和跑分。

## Comments

**设计师批准真实 Agent 跑分（2026-10-30）**

只批 63 的基线：Claude Code 和 Cursor CLI 两家，约 10 个场景 × 每场景 3 次 × 2 家 = 60 次正式跑，加搭建时的冒烟调试，总数不超过 70 次；冒烟先用 1 个场景 × 1 次 × 每家。64 之后的复测不在这次批准内，要另问。

**测量台（2026-10-30）**

两部分，都在 `e2e/` 下：

1. 脚本剧本：`e2e/tests/applying-bench.spec.ts`。脚本扮演 Agent，在示例项目上把三条改动（循环里三张卡片的填充、圆角、描边）走一轮，六种走法各一个测试。只记数，不断言，断言由 64–68 各自加。跑在 e2e 的 project files 一组里，`pnpm test:e2e` 会带上它；单独跑：`pnpm build && VK_E2E_PORT=5600 npx playwright test -c e2e/playwright.config.ts --project "project files" --no-deps applying-bench`。可调的等待：`VK_BENCH_PAUSE_MS`（「停很久再继续」停多久，默认 15000）、`VK_BENCH_STALL_WATCH_MS`（「做到一半退出」后等提示多久，默认 15000）、`VK_BENCH_UNCLAIMED_WATCH_MS`（没认领改代码后等提示多久，默认 5000）。67 定下阈值后，把前两个设成阈值以上。停滞提示和「没认领在改代码」的提示还不存在，剧本按 `role="alert"`（或 `alertdialog`）、文字含 Agent / claim 来找；66、67 做出提示时，改剧本顶上的 `stallNotice`、`unclaimedNotice`，让它们找到自己的提示。
2. 真实 Agent 跑标准场景：`pnpm bench:agents`（默认两家 × 10 个场景 × 3 次，按顺序跑，不并发）。选项：`--agents claude,cursor`、`--scenarios <id,…>`、`--runs <n>`；`--dry` 不跑 Agent，只把每个场景设起来，检查改动种类对、页面上还没显示；`pnpm bench:agents summary <目录>` 从原始结果重算指标和汇总（改了计算规则后用它，不用重跑 Agent）。`pnpm test:e2e` 不会带起它。场景在 `e2e/bench/scenarios.ts`，每条改动写明种类、页面能否核对、预期结果（文字一份，给 24 人工用；页面上求值的一份，给测量台用），以及说明里给出的设计变量；`e2e/tests/bench-scenarios.spec.ts` 在 e2e 里检查十个场景都还设得起来、落地前页面都不显示。

每次真实跑：把示例项目（Vite + React 19 + Tailwind v4）复制到系统临时目录，用 `init` 从打好的包装上 Vernier Kit 并提交；每次 clone 一份，在 5620–5649 的一个端口起开发服务器；headless shell 里打开页面，照场景在编辑层里改；Agent 在那份 clone 里无人值守地落地，超时 20 分钟。页面只开在 Playwright 的 headless shell 里。另开几个只看不报的页面（挡掉本机服务，不算设计师的页面），每秒按场景的预期看一次页面上新显示了哪条；每 250ms 读一次 `.vernier/`，记下认领、每次 `done`、`finish` 的时间。

固定的命令行（以后每轮都用这一条，数字才能比）：

```
/Users/bingyizhang/.npm-global/bin/claude -p '落地我的设计改动' --output-format stream-json --verbose --setting-sources project,local --strict-mcp-config --no-chrome --no-session-persistence --permission-mode acceptEdits --allowedTools 'Read,Edit,MultiEdit,Write,Glob,Grep,TodoWrite,Skill,Bash(npx vernierkit:*),Bash(git diff:*),Bash(git status:*),Bash(git log:*),Bash(git show:*),Bash(ls:*),Bash(cat:*),Bash(head:*),Bash(tail:*),Bash(wc:*),Bash(grep:*),Bash(rg:*),Bash(find:*),Bash(npx tsc:*)' --disallowedTools WebFetch,WebSearch
/Users/bingyizhang/.local/bin/cursor-agent -p '落地我的设计改动' --output-format stream-json --trust
```

- 环境：只留 HOME、PATH（Agent 自己的安装目录、Node、系统目录）、LANG、TERM、TMPDIR、USER、LOGNAME、SHELL，以及设计师 shell 里的代理变量（`.zshrc` 在 Clash 开着时设的 HTTPS_PROXY / HTTP_PROXY / NO_PROXY）。没有任何 ANTHROPIC_*、CLAUDE_*、模型设置，用设计师自己的登录和账号默认模型；实际模型从对话记录开头的 init 事件读出。二进制路径可用 `VK_BENCH_CLAUDE`、`VK_BENCH_CURSOR` 改。
- Claude Code：`--setting-sources project,local` 不读设计师的用户设置（插件、hooks、MCP 都不加载；用户设置里的 effortLevel 也不生效，用默认），`--strict-mcp-config` 不带 MCP。冒烟时 init 事件显示 `mcp_servers: []`、`plugins: []`，skills 里只有项目的 vernierkit 和内置的几个。权限是白名单：项目里的编辑自动通过；读文件和搜索的工具，以及上面列出的几种 shell 命令（`npx vernierkit`、只读的 git、`ls`/`cat`/`grep`/`rg`/`find` 等、`npx tsc`）；其他 shell 命令一律拒绝，计入「被权限拦下的工具调用」。
- Cursor：没有命令行参数可以只放行一部分命令，测量台在 clone 里写 `.cursor/cli.json`（git 不跟踪），放行同一批命令的第一个词（`Shell(npx)`、`Shell(git)`……）和项目里的读写。设计师用户级的 `~/.cursor/hooks.json`（一个 sessionStart 脚本）和用户级 skills/rules 仍会加载：Cursor 没有对应的开关，改它们又要动设计师的配置。这份白名单 Cursor 是否照办，还没有验证（见下）。

**怎么读结果**

- 脚本剧本：每个剧本在输出里打一行 `bench <剧本>: {…}`，也写进 `bench-results/playbooks/<剧本>.json`（不进 git）。
- 真实跑分：原始结果在 `bench-results/agents/<开始时间>/`（不进 git）：`meta.json`（两家的版本和完整命令行）；`<agent>/<场景>/run-<n>/` 下有 `transcript.jsonl`（stream-json 对话记录）、`agent.log`、`changeset.json`、`result.json`（归档的一轮；没 `finish` 时是 `state.json`）、`diff.patch`（相对这一轮开始时的代码）、`raw.json`（时间线、页面核对、每条改动开始前和结束时页面上显示没有）。汇总是 `measures.json`（每次一行）、`summary.json`、`summary.md`：每家一张总表（中位数与范围、次数），一张按场景的表（每个场景 3 次的中位数与范围），表头写着 Agent 版本、模型和日期。
- 指标怎么算（`e2e/bench/metrics.ts`，有单测）：
  - 整轮用时：`claim` 到 `finish`；没 `finish` 时算到 Agent 结束。「每条」再除以改动条数。
  - 每条平均工具调用：工具调用数除以改动条数。
  - 全仓搜索：没给到单个文件的搜索工具（Grep、Glob 等），以及搜目录的 shell 命令（`rg`、`find`、`git grep`、`grep -r`）。
  - 读入的字数：Skill（Skill 工具载入的正文，或读 SKILL.md）、`claim` 的输出、全部工具输出，各算各的。
  - 1:1 落地率两种。按 `done` 核对：页面能核对的改动中，归档时页面核对为显示的比例。按页面预期：有预期的改动中，结束时页面上符合预期的比例；预期里含作用范围，例如只改这一处使用时，另一处使用的卡片要保持原样。
  - 虚假的 ✓：报告列在 ✓ 下、页面却没显示的改动；有预期的看预期，没有预期的看最后一次核对。
  - 是否跑了 `done` / `finish`。
  - 报告格式合规：最后一个 ✓ 段落和其后的 ⚠️ 段落里，每条改动正好出现一次，⚠️ 下每条都有原因和实际处理两行。标题可以是中文。
  - 设计变量使用率：说明里给出了设计变量的改动中，Agent 新增的代码行用了该变量（Tailwind 类，可带变体和 `!`，或 CSS 变量）的比例。
  - 两次进度之间的最长间隔：进度指页面上新显示一条或一次 `done`，从认领算到 `finish`（或 Agent 结束）。67 拿它定「Agent 停住」的阈值。
  - 被权限拦下的工具调用数。

**基线：脚本剧本（2026-10-30，当前 main 7275e98 上，每个剧本三条改动）**

| 剧本 | 核对覆盖率 | 进度环与页面之差（结束时 / 最大） | 停滞提示 | 留到下一轮 | 没认领改代码被发现 |
|---|---|---|---|---|---|
| 照流程走 | 100% | 0 / 1（改了、还没 `done` 时页面已显示） | 0 次 | – | – |
| 跳过 `done` | 0% | 3 / 3 | – | – | – |
| 全改完才一起 `done` | 100% | 0 / 3 | – | – | – |
| 做到一半退出、不 `finish` | 停下时 33%（只有 `done` 过的那条） | 停下时 0 | 15 秒内没出现 | 0%（两条没落地的一条不剩） | – |
| 没认领就改代码 | – | – | – | – | 否（看了 5 秒；编辑没暂停；画布改动保住 100%） |
| 两次进度之间停很久再继续 | 100% | 0 / – | 停顿 15 秒中 0 次，恢复后无残留 | – | – |

**基线：真实 Agent（2026-10-30）：没测成**

冒烟（cards-style × 1 次）一共调用了 3 次 Agent（Claude Code 2 次、Cursor 1 次），都在认证这一步失败，没有做任何落地。正式跑没有开始。这 3 次计入批准的 70 次以内。

- Claude Code 2.1.191：init 事件里的模型是 `claude-sonnet-4-6`（账号默认）。每次请求都返回 401「OAuth access token is invalid」，重试两次后放弃；加上设计师的代理变量再试一次，结果相同。`claude auth status` 在同样的干净环境里显示已用 claude.ai 登录（subscriptionType 为 null），可见钥匙串里存的 token 服务端不认了。按说明没有退回到会话里的网关。
- Cursor CLI 2026.07.01-41b2de7：`-p` 报「Authentication required」。在完整的会话环境里跑 `cursor-agent --list-models` 也一样；`cursor-agent status` 只看本地，显示已登录，但附带「unable to fetch user details」。看来登录已经失效。
- 接下来：设计师重新登录两家（`claude` 里 `/login`，`cursor-agent login`），然后跑 `pnpm bench:agents`（60 次，几个小时）。跑完把 `summary.md` 的数字记在这里。认证之后的那段管线（认领、`done`、`finish` 的时间线，页面核对，git diff，指标和汇总）已经用一个模仿 Claude Code stream-json 的脚本 Agent 端到端走过一遍，结果正确。Cursor 的 stream-json 解析是照文档写的，还没见过真实的对话记录：第一次真实跑之后先对一遍，必要时改 `parseTranscript` 再 `summary` 重算。

**64–68 记录前后数字的格式**

改动前后各跑一次，用同一 Agent、同一模型（真实 Agent 只用相关的场景也行，但前后要一样），在 Comments 里贴：

```
**前后数字（日期，提交 <前> → <后>）**

脚本剧本：<剧本>
| 指标 | 改动前 | 改动后 | 目标 |
|---|---|---|---|
| 核对覆盖率 | 0% | 100% | 100% |

真实 Agent：<Agent 版本>，模型 <模型>，场景 <id,…> × <n> 次；原始结果 bench-results/agents/<时间>/
| 指标 | 改动前 中位数（范围） | 改动后 中位数（范围） | 目标 |
|---|---|---|---|
| 整轮用时每条（秒） | | | 不高于前 |
| 每条平均工具调用 | | | 不高于前 |
| 读入字数：Skill / claim 输出 | | | 少于前（65） |
| 1:1 落地率（页面预期 / done 核对） | | | 不变差 |
| 虚假的 ✓ | | | 0 |
| 两次进度最长间隔（秒） | | | （67 定阈值） |
```
