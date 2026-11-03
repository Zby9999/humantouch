# 92: 测量台里的 pi 带上 fff 的搜索工具

**What to build:** ticket 85 让测量台跑无头 pi，给的工具是 `read,bash,edit,write,grep,ls`，没有 `find`：pi 自带的 `find` 要调用 `fd`，测量台的 PATH 里没有 `fd`，`--offline` 也不让 pi 去下载（85 代定第 4 条）。设计师平时用的 pi 装了 pi-fff（`npm:@ff-labs/pi-fff`），它用 `fffind`、`ffgrep`、`fff-multi-grep` 换掉 pi 自带的 `find` 和 `grep`，用不着 `fd` / `rg`。设计师决定测量台里的 pi 带上 fff 的这几个工具，不加限制。这样 pi 有了找文件的工具，和 Claude 的 Glob、Grep 对等。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 85（已完成）

**Status:** ready-for-agent

- [ ] 只加载 pi-fff 这一个扩展（用设计师装好的那一份，按路径指名加载）；设计师的其他扩展照旧不加载，包括 `fff-broad-search-guard`（测量台有自己的命令名单）
- [ ] `fffind`、`ffgrep`、`fff-multi-grep` 放行，不加限制；pi 自带的 `find`、`grep` 由 fff 换掉（照 pi-fff 的 override 做法）
- [ ] fff 的「常用文件」库和查询历史库（pi-fff 配置里的 `frecencyDbPath`、`historyDbPath`）放在每次跑自己的目录里：各次跑互不影响，不读不写设计师 `~/.pi/agent/fff` 里的库；不改设计师的 `pi-fff.json`
- [ ] 指标：`fffind`、`ffgrep`、`fff-multi-grep` 算作搜索工具，计入工具调用次数；「全仓搜索」能认出它们（例如不限路径、不限文件类型的 `ffgrep`），判法写清楚，并照 85 的做法用一小段真实记录做单元测试
- [ ] 测量台记下 pi 这次带了 fff（版本号），`summary` 和 88 的结果里能看出来
- [ ] `--dry` 全部场景通过；pi 真实跑 1 次（任选一个场景），确认 fff 的工具真的出现、被用上，并且没碰设计师的 fff 库。跑之前问设计师
- [ ] Claude 的跑法不变

## 背景

- ticket 85 合并后（a9576e0），设计师看了 85 的代定第 4 条，说 `find` 可以给、fff 的工具可以不限制（2026-11-03）。规划会话查了 pi-fff 0.11.0：它在会话开始时在后台给项目建索引，按常用程度排序结果，会跨会话记住常用文件和查询；配置里有两个库的路径可以换。
- 这和 ticket 88「跑法维持现状、只带项目自己的东西」不冲突：设计师明确放开的只有 fff 这一个扩展。

## 设计师决定（2026-11-03，分诊）

- 测量台里的 pi 带上 fff 的搜索工具，不限制；只加载这一个扩展。
- 交给 85 那条线接着做（它熟悉这块代码），不另开新线。

## Comments

**暂停于 2026-11-03**（设计师额度快用完，明天继续）

已做：pi 按路径只加载 pi-fff 0.11.0，`--fff-mode override`（和设计师自己的 pi 一样，`grep`/`find` 由 fff 提供，`multi_grep` 不开），两个库放在每次跑自己的目录（8b7d103、e98bd61、ce47910）；`--dry` 10 个场景过，typecheck、`pnpm test` 过。pi 真实跑 1 次（设计师同意的，`button-over-rule`，`bench-results/agents/92-real-pi`）：claim→finish 14.36 秒，每条 4 次工具调用，1:1 100%，虚假的 ✓ 0，报告合规；fff 的 `grep`/`find` 声明给了模型，但 Agent 没调用（它用 shell 里的 `grep -rn`）；设计师的 `~/.pi/agent/fff` 修改时间没变。

下一步：代码审查（跑到一半停了，要重跑）；问设计师要不要再跑 1 次 pi（换个要找文件的场景）证明 fff 被用上，再用真实记录换掉 `fixtures/pi-fff.provisional.jsonl`；全量测试；记命令行前后、全仓搜索判法、代定和风险；合并。
