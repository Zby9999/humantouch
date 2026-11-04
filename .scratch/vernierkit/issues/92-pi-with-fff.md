# 92: 测量台里的 pi 带上 fff 的搜索工具

**What to build:** ticket 85 让测量台跑无头 pi，给的工具是 `read,bash,edit,write,grep,ls`，没有 `find`：pi 自带的 `find` 要调用 `fd`，测量台的 PATH 里没有 `fd`，`--offline` 也不让 pi 去下载（85 代定第 4 条）。设计师平时用的 pi 装了 pi-fff（`npm:@ff-labs/pi-fff`），它用 `fffind`、`ffgrep`、`fff-multi-grep` 换掉 pi 自带的 `find` 和 `grep`，用不着 `fd` / `rg`。设计师决定测量台里的 pi 带上 fff 的这几个工具，不加限制。这样 pi 有了找文件的工具，和 Claude 的 Glob、Grep 对等。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 85（已完成）

**Status:** done

- [x] 只加载 pi-fff 这一个扩展（用设计师装好的那一份，按路径指名加载）；设计师的其他扩展照旧不加载，包括 `fff-broad-search-guard`（测量台有自己的命令名单）
- [x] `fffind`、`ffgrep`、`fff-multi-grep` 放行，不加限制；pi 自带的 `find`、`grep` 由 fff 换掉（照 pi-fff 的 override 做法）
- [x] fff 的「常用文件」库和查询历史库（pi-fff 配置里的 `frecencyDbPath`、`historyDbPath`）放在每次跑自己的目录里：各次跑互不影响，不读不写设计师 `~/.pi/agent/fff` 里的库；不改设计师的 `pi-fff.json`
- [x] 指标：`fffind`、`ffgrep`、`fff-multi-grep` 算作搜索工具，计入工具调用次数；「全仓搜索」能认出它们（例如不限路径、不限文件类型的 `ffgrep`），判法写清楚，并照 85 的做法用一小段真实记录做单元测试
- [x] 测量台记下 pi 这次带了 fff（版本号），`summary` 和 88 的结果里能看出来
- [x] `--dry` 全部场景通过；pi 真实跑 1 次（任选一个场景），确认 fff 的工具真的出现、被用上，并且没碰设计师的 fff 库。跑之前问设计师
- [x] Claude 的跑法不变

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

**实现记录（2026-11-04，接着暂停处做完）**

*结论*

测量台里的 pi 只多加载 pi-fff 0.11.0 这一个扩展，override 模式（和设计师自己的 pi 一样），`grep`、`find` 由 fff 提供，用不着 `fd`/`rg`；fff 的两个库在每次跑自己的目录里，设计师的 `~/.pi/agent/fff` 和 `pi-fff.json` 没碰。每次跑记下 pi-fff 的版本和声明给模型的工具，summary 标题行写「带 pi-fff 0.11.0，工具 read, bash, edit, write, ls, grep, find」。两次真实跑都 1:1 100%、报告合规，fff 的工具声明了，但 Agent 都没调用：`claim` 已经给了文件和行号，用不着搜。Claude 的跑法没变。

*pi 的命令行*

之前（85）：
```
/Users/bingyizhang/.npm-global/bin/pi -p '落地我的设计改动' --mode json --provider command-code --model deepseek/deepseek-v4.1-flash --thinking high --no-session --offline --no-extensions -e '/Users/bingyizhang/.pi/agent/npm/node_modules/@commandcode/pi-commandcode-provider' -e '<run folder>/pi-extension/pi-extension.ts' --no-mcp --no-skills --skill .agents/skills/03kind --no-prompt-templates --no-themes --approve --tools read,bash,edit,write,grep,ls
```

之后：
```
/Users/bingyizhang/.npm-global/bin/pi -p '落地我的设计改动' --mode json --provider command-code --model deepseek/deepseek-v4.1-flash --thinking high --no-session --offline --no-extensions -e '/Users/bingyizhang/.pi/agent/npm/node_modules/@commandcode/pi-commandcode-provider' -e '/Users/bingyizhang/.pi/agent/npm/node_modules/@ff-labs/pi-fff' --fff-mode override --fff-frecency-db '<run folder>/fff/frecency' --fff-history-db '<run folder>/fff/history' --fff-follow-symlinks -e '<run folder>/pi-extension/pi-extension.ts' --no-mcp --no-skills --skill .agents/skills/03kind --no-prompt-templates --no-themes --approve --tools read,bash,edit,write,ls,grep,find
```

- pi-fff 取值的顺序是参数 > 环境变量 > `pi-fff.json`；`cleanEnv()` 不带任何 `FFF_*`，所以模式和两个库的路径都由参数定。设计师的 `pi-fff.json` 只有 `$schema` 和 `mode: override`。
- 查找器是 npm 包里带的本地库，`--offline` 下照常起来。
- 不花额度的 RPC 检查（测量台的参数，`--mode rpc`，不发 prompt）：生效的工具 `read, bash, edit, write, ls, grep, find`，其中 `grep`、`find` 由 `@ff-labs/pi-fff` 注册（参数带 `exclude`、`cursor`），pi 自带的 find 没注册；命令里有 `fff-mode`、`fff-health`、`fff-rescan`、`skill:03kind`；pi 打开的 `.mdb` 全在 `<run folder>/fff/` 下，`~/.pi/agent/fff` 下 0 个。

*fff 工具的计数判法*

- 认 fff 的调用：看 pi 第一条 system 消息里声明的工具参数，fff 的 `grep`、`find` 带 `exclude` 和 `cursor`，pi 自带的没有；`ffgrep`、`fffind`、`fff-multi-grep`、`multi_grep` 只属于 fff。记录里有 pi-fff、声明的 `grep`/`find` 却认不出是 fff 的（比如 pi-fff 以后改了参数名），测量台停下，和模型不对一样。
- 每次调用都计入工具调用次数。
- 全仓搜索：fff 的调用没给 path、path 是文件夹、或 path 带通配（`*.tsx`、`src/**`），算全仓；path 是一个文件（按 fff 自己的判法，以 `.` 加字母开头、最多 10 位的扩展名结尾，`src/v1.2` 算文件夹）不算。multi-grep 没给 constraints、constraints 多于一个词或带 `!`，算全仓。pi 自带工具和 Claude 的判法不变。
- 85 的三次记录用新代码重新 summary，数字逐行相同。
- 单元测试：声明和标记用 `92-real-pi` 截的 22 行真实记录（结果目录换成 `/t/run`，不含 home 路径和凭据）；fff 调用的样子真实记录里没有，用照 pi-fff 0.11.0 源码写的一小段合成记录测（测试里注明 SYNTHETIC）。

*真实跑*（设计师同意 2 次，每次跑前跑后合盖状态都是 No，`~/.pi/agent/fff` 的修改时间都没变）

| | 85 的 pi（无 fff） | 92 第 1 次 | 92 第 2 次 |
|---|---|---|---|
| 场景 | `button-over-rule` | `button-over-rule` | `reorder-and-move` |
| 整轮用时 claim→finish | 16.29 秒 | 14.36 秒 | 13.34 秒 |
| 每条平均工具调用 | 4 | 4 | 3.5 |
| 全仓搜索 | 0 | 1（shell 里的 `grep -rn "<button" src/`） | 0 |
| 读入字数：全部工具输出 | 12271 | 11773 | 11183 |
| 1:1 落地率 / 虚假的 ✓ / 报告合规 | 100% / 0 / ✓ | 100% / 0 / ✓ | 100% / 0 / ✓ |
| 调用 fff 的工具 | – | 0 | 0 |
| 被权限拦下 | 0 | 0 | 0 |

原始记录：`bench-results/agents/92-real-pi/`、`bench-results/agents/92-real-pi-2/`，两处 summary 都出数，`raw.json` 里有 `"extensions": {"pi-fff": "0.11.0"}`，`fff/frecency`、`fff/history` 在各自的跑目录里。

*验证*（同步 main c54d07e 之后）

- `pnpm typecheck`：通过。
- `pnpm test`：vitest 818 通过、1 跳过；node --test（含旧名字检查）75 通过。
- `pnpm bench:agents --dry`：14 个场景全过（87 合进来以后的全部场景）。
- `TK_E2E_PORT=5600 pnpm test:e2e`：第一遍在负载约 30 时，页面组挂了 3 条（`breakpoints.spec.ts:204` 的填值超时、`next-install.spec.ts:37` 连不上开发服务器、`undo.spec.ts:60` 读数早了一拍），项目文件组因此没跑。单独重跑这 3 条都过；`--project="project files" --no-deps` 114 通过、1 跳过；负载降到 8 后整个页面组重跑 288 条全过。合计 402 通过、1 跳过。
- pi 的 RPC 检查在审查的修正之后又跑了一次，fff 和测量台的扩展都照常加载。
- 代码审查（Standards、Spec 两条线，effort high）找出的都改了：路径前后带空白能绕过 `~/.pi` 规则、macOS 的 Data 卷别名能绕过 `~/.pi` 规则（b235bcf）；fixture 换成真实记录、fff 判一个文件的规则、认不出 fff 工具时停下、注释换行（ba99933）。

*代定的事（待设计师确认）*

1. **override 模式**，和设计师自己的 pi 一样：fff 的工具叫 `grep`、`find`，不叫 `ffgrep`、`fffind`；transcript 里靠声明的参数和 pi 自带的分开。
2. **不开 `fff-multi-grep`**：pi-fff 0.11.0 只在 `PI_FFF_MULTIGREP=1` 时才注册它，设计师的 shell 配置里没设，所以设计师自己的 pi 也没有它；pi-fff 作者在代码里写它「only harmful」。ticket 列了三个工具，这条和字面不同。要开的话，给 pi 的环境加这个变量、`--tools` 加 `multi_grep`，指标和扩展已经能处理。
3. **fff 搜什么范围都不限制，唯独碰不到 `~/.pi`**（85 的凭据规则）：测量台照 pi-fff 自己的算法找出它要建索引的文件夹，在 `~/.pi` 里或在它上面（`~`、`/Users`、`/`）就挡。
4. **两处审查补的漏洞对所有工具都生效**：路径前后带空白的一律挡（pi-fff 会去掉空白再用）；`~/.pi` 按设备号和 inode 比，macOS 的 `/System/Volumes/Data$HOME/.pi` 这种别名也挡（85 的 read、ls 原来也挡不住这种写法）。
5. **只把 `--fff-follow-symlinks` 固定为默认的「是」**：pi 1.4.0 给扩展的布尔参数一律当「是」，`=false` 不起作用；索引家目录、根目录两个开关只在搜到家目录或更上层时才起作用，而那些已被第 3 条挡掉，所以没另外固定。
6. **往已有的一轮里追加跑时，pi-fff 版本不同就拒绝**，免得两版的数混在一起。
7. **fff 调用的单元测试用合成记录**：两次真实跑都没调用 fff 的工具，没有真实样本。

*剩下的风险*

- **fff 的工具在真实跑里没被用过**：正常落地时 `claim` 给了文件和行号，Agent 用不着搜；fff 调用的计数只在合成记录上验证过。88 跑全部场景时，有调用的话核对一下计数。
- **跟随链接是开着的**：允许搜索的文件夹里如果有指向 `~/.pi` 的链接，fff 会顺着进去，测量台只看索引起点。家目录 4 层以内现在没有这种链接，名单里也没有 `ln`。
- **设计师的 `pi-fff.json` 不合法时**，pi 在调用模型之前就退出，那次跑不算数；以后多出的新键只能影响没被参数覆盖的设置。
- 名单仍是约束 Agent 行为的围栏，不是沙箱（85 的风险照旧）。

## 设计师确认（2026-11-04）

代定的七条全部确认：

1. override 模式，和设计师自己的 pi 一样，fff 的工具叫 `grep`、`find`。
2. 不开 `fff-multi-grep`（设计师自己的 pi 也没有它）。
3. fff 搜什么范围都不限制，唯独碰不到 `~/.pi`。
4. 路径前后带空白的一律挡；`~/.pi` 按设备号和 inode 比，macOS 的 Data 卷别名也挡，对所有工具都生效。
5. 只把 `--fff-follow-symlinks` 固定为默认的「是」。
6. 往已有的一轮里追加跑时，pi-fff 版本不同就拒绝。
7. fff 调用的单元测试用照 pi-fff 源码写的合成记录。
