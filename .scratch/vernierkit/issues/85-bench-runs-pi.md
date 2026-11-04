# 85: 测量台接上无头 pi（DeepSeek v4.1 flash）

**What to build:** 这次 Agent 验收用 Claude Code 和 pi 两家（Cursor 没有额度，Codex 以后再验）。测量台（`pnpm bench:agents`）现在只会跑 Claude 和 Cursor。要接上 pi：无头跑（`pi -p`），模型是 `command-code` 下的 `deepseek/deepseek-v4.1-flash`，和 Claude 一样只带项目自己的东西，从 pi 的对话记录里数出和 Claude 一样的指标。Claude 照旧：桌面 app 自带的 Claude Code，`claude-sonnet-5-5`，`--effort high`。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准（「度量」「Light」「Faithful」「Robust」），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0012、0013）。

**Blocked by:** 无

**Status:** done

- [x] 测量台多一家 Agent `pi`：用设计师装好的 pi（另有环境变量可指定别的），提供商 `command-code`、模型 `deepseek/deepseek-v4.1-flash`、思考档位 `high`，都写死在参数里，不跟设计师 pi 的默认设置走；对话记录里的模型不是它时，测量台停下，和 Claude 一样
- [x] 只带项目自己的东西，和 Claude 的 `--setting-sources project,local --strict-mcp-config` 同一个意思：不加载设计师的扩展、MCP 服务器、全局 skills、prompt 模板和全局 AGENTS.md；项目里的 `.agents/skills/03kind/` 和 AGENTS.md 照常加载（项目要信任才加载 `.agents/skills`，用 `--approve`）。不复制、不打印设计师 pi 的登录凭据
- [x] 命令和 Claude 一样只放行那份名单（`npx 03kind`、`git diff` 等，见测量台里给 Claude 的 allowlist），别的 shell 命令挡掉；不上网（没有网页搜索、抓取工具）。pi 自己没有命令白名单，用测量台自带、只在跑分时加载的扩展做到
- [x] 证明 pi 真的加载了 Skill：参照 Cursor 那次的证明（ticket 70：用 `/03kind …` 当斜杠命令问，0 次读文件还知道 SKILL.md 的内容），或者 pi 的对话记录里直接列出了加载的 skills。只是 Agent 自己找到并读了 SKILL.md 不算
- [x] 从 pi 的 JSON 对话记录（`--mode json`）数出：工具调用次数、全仓搜索次数、读 03kind 包的次数、`claim` 到 `finish` 的用时、最后的报告（报告合规照现有的判法）；单元测试用录下来的一小段真实记录
- [x] 不开带窗口的浏览器（测量台已有的检查照用）；pi 跑的时候不抢设计师的焦点
- [x] `--agents` 默认改成 `claude,pi`；Cursor 的支持留着不删
- [x] 先 `--dry` 全部场景空跑通过；再 Claude、pi 各跑 1 次真实的（任选一个场景），跑之前问设计师。两家的记录都能 `summary` 出数

## 背景

- 设计师决定（2026-11-03）：Agent 验收按「先跑落地验收，再发布到 npm，最后跑安装验收」的顺序；这一次只验 Claude（Sonnet，high）和无头 pi（DeepSeek v4.1 flash，command-code）。docs/goals.md 不改：Codex、Cursor 以后还要验，这次不算偏离。
- pi 1.4.0 的情况（规划会话查的）：`pi -p` 非交互，`--mode json` 出对话记录，`--provider` / `--model` / `--thinking` 选模型和档位，`--no-extensions`、`--no-mcp`、`--no-skills`、`--no-context-files` 分别关掉扩展、MCP、skills、AGENTS.md，`-e` 加载指定的扩展，`PI_CODING_AGENT_DIR` 换配置目录。项目 `.agents/skills/` 要信任项目才加载（`--approve`）；AGENTS.md 不管信任都加载。pi 不会在每次调用工具前问人，安全靠限制它能碰的东西（pi 文档 security.md）。
- 关掉全局 skills 又要留住项目 Skill、关掉全局 AGENTS.md 又要留住项目 AGENTS.md，用哪几个开关组合由这条线定（例如单独的配置目录只放模型和登录的引用），记进代定。

## 设计师决定（2026-11-03，分诊）

- 只验 Claude 和 pi；Claude 用 Sonnet、effort high，pi 用 command-code 的 DeepSeek v4.1 flash。
- pi 的思考档位用 high，和 Claude 对齐（规划会话提出，设计师没有反对）。
- 真实 Agent 跑之前问设计师。

## Comments

**实现记录（2026-11-03）**

*结论*

测量台多了一家 Agent `pi`，`--agents` 默认 `claude,pi`，Cursor 照旧能跑。pi 无头跑在 Command Code 的 DeepSeek v4.1 flash 上，思考档位 high，只带项目的 Skill 和 AGENTS.md；shell 命令只放行和 Claude 同一份名单（`e2e/bench/allowlist.ts` 里的 `SHELL`，Claude 的 `--allowedTools` 和 pi 的扩展都从这里取）。pi 的 JSON 记录数得出和 Claude 一样的指标，另外记下加载了哪些 skills、提供商实际回答的模型。全部场景空跑通过；Claude、pi 各 1 次真实跑（`button-over-rule`）都 1:1 100%、虚假的 ✓ 0、报告合规。

*两家的命令行*（`commandLine` 的输出，`<run folder>` 是每次跑的结果目录）

Claude（没有改）：
```
'/Users/bingyizhang/Library/Application Support/Claude/claude-code/2.1.309/5af865b9901c/claude.app/Contents/MacOS/claude' -p '落地我的设计改动' --output-format stream-json --verbose --model claude-sonnet-5-5 --effort high --debug-file '<run folder>/claude-debug.log' --setting-sources project,local --strict-mcp-config --no-chrome --no-session-persistence --permission-mode acceptEdits --allowedTools 'Read,Edit,MultiEdit,Write,Glob,Grep,TodoWrite,Skill,Bash(npx 03kind:*),Bash(git diff:*),Bash(git status:*),Bash(git log:*),Bash(git show:*),Bash(ls:*),Bash(cat:*),Bash(head:*),Bash(tail:*),Bash(wc:*),Bash(grep:*),Bash(rg:*),Bash(find:*),Bash(npx tsc:*)' --disallowedTools WebFetch,WebSearch
```

pi：
```
/Users/bingyizhang/.npm-global/bin/pi -p '落地我的设计改动' --mode json --provider command-code --model deepseek/deepseek-v4.1-flash --thinking high --no-session --offline --no-extensions -e '/Users/bingyizhang/.pi/agent/npm/node_modules/@commandcode/pi-commandcode-provider' -e '<run folder>/pi-extension/pi-extension.ts' --no-mcp --no-skills --skill .agents/skills/03kind --no-prompt-templates --no-themes --approve --tools read,bash,edit,write,grep,ls
```

- `TK_BENCH_PI` 可指定别的 pi。环境照 `cleanEnv()`，没有任何 API key。
- `command-code` 不是 pi 自带的提供商，是设计师装的扩展 `@commandcode/pi-commandcode-provider`；`--no-extensions` 关掉全部扩展后只用 `-e` 加回它和测量台自己的扩展（`e2e/bench/pi-extension.ts`，每次跑复制到结果目录，记下那次用的是哪一版）。
- 测量台的扩展：bash 只放行名单上的命令（按 bash 的方式拆词：去引号、处理反斜杠；`$` 展开、反引号、花括号展开、可能展开成选项的通配、单独的 `&`、写文件的重定向和选项都挡；`cd` 只能进项目里的文件夹）；write、edit 只能写项目里；任何工具和命令都碰不到 `~/.pi`；全局 AGENTS.md 去掉，只留项目里的。处理出错就挡。挡下的调用结果以 `DENIED` 开头，记作「被权限拦下的工具调用」。
- 记录里的模型（`provider/model`）不是 `command-code/deepseek/deepseek-v4.1-flash`，或中途换了模型，测量台停下。

*pi 加载了 Skill 的证明*

1. 不花额度的：用测量台的参数起 pi 的 RPC 模式，`get_commands` 只有一条 `skill:03kind`（项目里的 `.agents/skills/03kind/SKILL.md`），`get_state` 是 `command-code/deepseek/deepseek-v4.1-flash`、`high`。不加 `--no-skills` 时会多出设计师的约 40 个用户 skills。
2. 斜杠命令（花了 1 次额度，设计师同意的 3 次之一）：在只有 SKILL.md 和 AGENTS.md 的临时 git 项目里，照测量台的方式跑 `pi`，问 `/skill:03kind 不要读任何文件，也不要运行任何命令：只凭已经放进你上下文的这份 Skill，说出它的名字、作用，以及它让你按什么顺序运行哪几条命令；再说明你是通过 Skill 机制拿到它的，还是自己去读了文件。` 结果：0 次工具调用；用户消息以 `<skill name="03kind" …>` 开头，SKILL.md 全文由 pi 放进去（3934 字）；回答说出了 `claim` → 逐条落地 → `done` → `finish` → 报告（✓ Applied / ⚠️ Not applied 1:1，Why、Instead），以及 `last`、`remove` 两条支线，这些只在 SKILL.md 正文里；记录里的思考档位是 high。
3. 每次跑的记录：pi 的第一条 system 消息里 skills 只有 `03kind`，context 只有项目的 AGENTS.md（没有全局的，也没有 CLAUDE.md）。测量台现在把它记进每次跑的 measures，summary 标题行写「加载的 skills 03kind」。

*空跑*

`pnpm bench:agents --dry`：10 个场景全过（在同步了 main 的分支上又跑了一次，见下面的验证）。

*真实跑*（设计师同意 3 次：Skill 证明 1 次、Claude 1 次、pi 1 次）

| | Claude（Sonnet 5.5，effort high） | pi（DeepSeek v4.1 flash，thinking high） |
|---|---|---|
| 场景 | `button-over-rule`（2 条改动） | 同 |
| 整轮用时 claim→finish | 21.41 秒（每条 10.71） | 16.29 秒（每条 8.15） |
| Agent 总用时 | 40.08 秒 | 24.35 秒 |
| 每条平均工具调用 | 3.5 | 4 |
| 全仓搜索 | 1 | 0 |
| 读 node_modules/03kind | 0 | 0 |
| 读入字数：Skill / claim / 全部工具输出 | 3504 / 4837 / 10981 | 3633 / 4838 / 12271 |
| 1:1 落地率（页面预期 / done 核对） | 100% / 100% | 100% / 100% |
| 虚假的 ✓ | 0 | 0 |
| done、finish、报告合规 | ✓ ✓ ✓ | ✓ ✓ ✓ |
| 设计变量使用率 | 1 | 1 |
| 被权限拦下 | 0 | 0 |
| 提供商回答的模型 | – | `deepseek/deepseek-v4.1-flash-1017-cm` |

- 原始记录：`bench-results/agents/85-real/`（Claude）、`bench-results/agents/85-real-pi/`（pi），两处 `pnpm bench:agents summary <dir>` 都出数。每次计时前后合盖状态都是 No。
- 第一次两家一起跑时 pi 没起来：`--out` 给的是相对路径，pi 在项目里启动，找不到结果目录里的扩展，启动就退出（没调模型，不占额度）。改成绝对路径（4ae7802）后单独重跑 pi 一次，就是上表的数。同一个毛病让那次 Claude 的 debug 日志写进了项目：它的 diff 里多了那份日志，effort 也没从日志里核对到（参数里写死的是 high）；落地的改动和指标不受影响，没有重跑。
- 两次真实跑用的是代码审查之前的版本；审查之后名单变严、pi 少了 `find` 工具（见代定 4）。两次跑里的 shell 命令拿新规则核过，都放行；`85-real` 里那次空的 pi 记录照旧没有数。
- Claude 记录里列出的 skills（03kind 和 deep-research、dataviz、update-config、loop、code-review 等约 20 个）是 Claude Code 自带的，设计师的用户 skills 一个都没进来。

*验证*（同步 main 46d2771 之后）

- `pnpm typecheck`：通过。
- `pnpm test`：vitest 818 通过、1 跳过；node --test（含旧名字检查）65 通过。
- `TK_E2E_PORT=5600 pnpm test:e2e`：398 通过、1 跳过。（同步前跑过一次，`grid.spec.ts` 手机视图那条的图层选中断言超时一次，没跑完的 109 条重跑后全过；同步后这次一次就过。）
- `pnpm bench:agents --dry`：10 个场景全过。
- 代码审查做了两轮（Standards、Spec 两条线），找出的都改了：名单能用引号、反斜杠、花括号、`$'…'` 绕过（第一轮，在 bash 里实测确认过）；pi 自己的工具能碰到项目外和 `~/.pi`；`cd -P`、单写 `cd` 能离开项目（第二轮）。审查后改动的提交：22e04ef、ed32d9b、0292167、7663e47、610b63c。

*代定的事（待设计师确认）*

1. **pi 用设计师自己的配置目录，关掉开关，不另建配置目录。** 登录只在 `~/.pi/agent/auth.json`（`/login` 存的），pi 没有指向别处登录文件的设置；另建目录就得复制凭据，所以不建。代价：设计师的 `settings.json`（比如这个模型的压缩设置）和 `models.json` 里按模型的覆盖照样作用于测量台的跑；`SYSTEM.md`、`APPEND_SYSTEM.md` 也挡不住，现在都没有。
2. **全局 AGENTS.md 由测量台的扩展去掉。** pi 没有单独关全局 AGENTS.md 的开关，`--no-context-files` 会连项目的一起关。
3. **Skill 按路径加载**（`--no-skills --skill .agents/skills/03kind`），不靠发现；靠发现会带进设计师约 40 个用户 skills。没有 Skill 的跑（`--no-skill`），路径不存在，pi 什么也不加载，命令行除提示外不变。
4. **pi 的工具是 `read,bash,edit,write,grep,ls`。** 比 pi 默认的四个多了 grep、ls，对应 Claude 的 Grep、Glob；不给 `find`，它要 `fd`，测量台的 PATH 里没有，`--offline` 也不让 pi 去下载（每次都会失败）。shell 里的 `find` 照常能用。
5. **名单的规则比 Claude 的 `Bash(命令:*)` 严**：`$` 展开、反引号、花括号展开、可能展开成选项的通配（`find . -name *.tsx` 不加引号会被挡，理由会告诉 Agent）、写文件的重定向、`find -exec/-delete`、`rg --pre/--hostname-bin`、`git --output`、tsc 写到别处的选项都挡；`cd` 只能进项目里的文件夹；输出可以丢到 `/dev/null` 或 `2>&1`。按 88 的设计师决定，被挡下的另算。
6. **pi 自己的工具也加了路径规则**：write、edit 只能写项目里，任何工具都不能碰 `~/.pi`（Claude 的 Read 读项目外不受限，pi 的 read 也只挡 `~/.pi`）。搜索类工具和命令碰到 `~/.pi` 的上级目录也挡，`grep -rn x /` 这种极少见的写法会被误挡。
7. **模型按 `provider/model` 记**，中途换了就停；提供商回答的具体模型（`responseModel`）只记下，不因它停（它带版本后缀，和写死的名字本来就不同）。
8. **另加了 `--no-session`、`--offline`**，对应 Claude 的 `--no-session-persistence`，不往 `~/.pi/agent/sessions` 写东西，也不做版本检查、目录更新。effort 从记录里的 `thinkingLevel` 核对。
9. **提供商用的是设计师装好的那一份**，包括设计师本地对 `index.ts` 的改动；那处改动只加了 `thinkingLevelMap: {max: "max"}`，让菜单里显示 max，不改请求。
10. **单元测试的 pi 记录**是从 `85-real-pi` 那次截的 26 行（结果目录换成 `/t/run`，不含 home 路径和任何凭据）；被挡下和 API 重试真实记录里没出现，用小段合成记录测。

*剩下的风险*

- **名单是约束 Agent 行为的围栏，不是沙箱**（Claude 也一样）：Agent 可以在项目里改 `.git/config` 或 `.gitattributes`，让 `git diff` 跑外部程序；改 `tsconfig.json` 的 `outDir` 让 `npx tsc` 写到项目外；改 `node_modules/03kind` 再跑 `npx 03kind`。项目里本来就有指向项目外、目标不存在的软链时，write 可以借它写到外面（pi 自己建不出软链）。
- **pi 照样读设计师的 `settings.json` 和 `models.json`**（代定 1）：设计师以后改了这两个文件，pi 的数可能跟着变。88 跑之前可以看一眼。
- **提供商静默换了模型不会停**：提供商回答的具体模型记下了，没拿来判；88 出数时可以看各次的 `responseModel` 是否一致。
- **`rg` 不在测量台的 PATH 上**（只在设计师别的工具的目录里），名单上的 `rg` 对两家都等于没有；以前的 Claude 基线也一样。
- 真实跑只有 1 次，两家的数只说明能跑通、能出数，不能拿来比较，基线在 88 出。

## 设计师确认（2026-11-03）

- 代定第 4 条：设计师说 `find` 可以给、fff 的工具可以不限制，另开 ticket 92（测量台里的 pi 带上 pi-fff 的 `fffind`、`ffgrep`、`fff-multi-grep`，只加载这一个扩展，fff 的库放在每次跑自己的目录），由本线接着做。
- 其余九条（1–3、5–10）全部确认。
- 第 1 条加一个保险：ticket 88 开跑时把设计师 pi 的 `settings.json`、`models.json` 的指纹（内容摘要）记进结果，配置改了、数字跟着变时看得出来（写进 88）。
- 剩下的风险照记，接受：名单是围栏不是沙箱（Agent 在临时副本里干活，没有理由去改 git、tsconfig 的配置）。
