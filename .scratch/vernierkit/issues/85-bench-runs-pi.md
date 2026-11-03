# 85: 测量台接上无头 pi（DeepSeek v4.1 flash）

**What to build:** 这次 Agent 验收用 Claude Code 和 pi 两家（Cursor 没有额度，Codex 以后再验）。测量台（`pnpm bench:agents`）现在只会跑 Claude 和 Cursor。要接上 pi：无头跑（`pi -p`），模型是 `command-code` 下的 `deepseek/deepseek-v4.1-flash`，和 Claude 一样只带项目自己的东西，从 pi 的对话记录里数出和 Claude 一样的指标。Claude 照旧：桌面 app 自带的 Claude Code，`claude-sonnet-5-5`，`--effort high`。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准（「度量」「Light」「Faithful」「Robust」），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0012、0013）。

**Blocked by:** 无

**Status:** ready-for-agent

- [ ] 测量台多一家 Agent `pi`：用设计师装好的 pi（另有环境变量可指定别的），提供商 `command-code`、模型 `deepseek/deepseek-v4.1-flash`、思考档位 `high`，都写死在参数里，不跟设计师 pi 的默认设置走；对话记录里的模型不是它时，测量台停下，和 Claude 一样
- [ ] 只带项目自己的东西，和 Claude 的 `--setting-sources project,local --strict-mcp-config` 同一个意思：不加载设计师的扩展、MCP 服务器、全局 skills、prompt 模板和全局 AGENTS.md；项目里的 `.agents/skills/03kind/` 和 AGENTS.md 照常加载（项目要信任才加载 `.agents/skills`，用 `--approve`）。不复制、不打印设计师 pi 的登录凭据
- [ ] 命令和 Claude 一样只放行那份名单（`npx 03kind`、`git diff` 等，见测量台里给 Claude 的 allowlist），别的 shell 命令挡掉；不上网（没有网页搜索、抓取工具）。pi 自己没有命令白名单，用测量台自带、只在跑分时加载的扩展做到
- [ ] 证明 pi 真的加载了 Skill：参照 Cursor 那次的证明（ticket 70：用 `/03kind …` 当斜杠命令问，0 次读文件还知道 SKILL.md 的内容），或者 pi 的对话记录里直接列出了加载的 skills。只是 Agent 自己找到并读了 SKILL.md 不算
- [ ] 从 pi 的 JSON 对话记录（`--mode json`）数出：工具调用次数、全仓搜索次数、读 03kind 包的次数、`claim` 到 `finish` 的用时、最后的报告（报告合规照现有的判法）；单元测试用录下来的一小段真实记录
- [ ] 不开带窗口的浏览器（测量台已有的检查照用）；pi 跑的时候不抢设计师的焦点
- [ ] `--agents` 默认改成 `claude,pi`；Cursor 的支持留着不删
- [ ] 先 `--dry` 全部场景空跑通过；再 Claude、pi 各跑 1 次真实的（任选一个场景），跑之前问设计师。两家的记录都能 `summary` 出数

## 背景

- 设计师决定（2026-11-03）：Agent 验收按「先跑落地验收，再发布到 npm，最后跑安装验收」的顺序；这一次只验 Claude（Sonnet，high）和无头 pi（DeepSeek v4.1 flash，command-code）。docs/goals.md 不改：Codex、Cursor 以后还要验，这次不算偏离。
- pi 1.4.0 的情况（规划会话查的）：`pi -p` 非交互，`--mode json` 出对话记录，`--provider` / `--model` / `--thinking` 选模型和档位，`--no-extensions`、`--no-mcp`、`--no-skills`、`--no-context-files` 分别关掉扩展、MCP、skills、AGENTS.md，`-e` 加载指定的扩展，`PI_CODING_AGENT_DIR` 换配置目录。项目 `.agents/skills/` 要信任项目才加载（`--approve`）；AGENTS.md 不管信任都加载。pi 不会在每次调用工具前问人，安全靠限制它能碰的东西（pi 文档 security.md）。
- 关掉全局 skills 又要留住项目 Skill、关掉全局 AGENTS.md 又要留住项目 AGENTS.md，用哪几个开关组合由这条线定（例如单独的配置目录只放模型和登录的引用），记进代定。

## 设计师决定（2026-11-03，分诊）

- 只验 Claude 和 pi；Claude 用 Sonnet、effort high，pi 用 command-code 的 DeepSeek v4.1 flash。
- pi 的思考档位用 high，和 Claude 对齐（规划会话提出，设计师没有反对）。
- 真实 Agent 跑之前问设计师。
