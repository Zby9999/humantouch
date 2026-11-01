> 落地线（tickets 63–68）指挥会话的决断记录，原样存档（2026-11-01 从该会话的临时目录拷来）。结论以各 ticket 的 Comments 为准；这里留的是当时的判断过程。

# 落地线决断记录

（10/31 16:2x 重建：原文件和慢运行分析报告在 15:30–16:14 之间被清掉，按总调度在对话里写过的每一次追加重建。备份在上一级目录 decisions-backup.md。）

设计师 2026-10-31 凌晨起休息，要求自主决断跑完，最后报告每个决断。

## 设计师亲自定的
- 真实 Agent：先批 63 基线 70 次 → 10/31 放开为整条线全部批准。
- Claude：桌面 app 自带的 Claude Code（2.1.309），Sonnet 5.5、effort high，显式固定。之前的 Opus 5.5 xhigh、npm 2.1.191 的跑只算冒烟。
- Cursor：Cursor.app 自带的 agent-cli，主模型 Grok 4.7 256K High 显式固定；explore 子 Agent（Composer 2.5）不限制。
- 67 的真实 Agent 复测只跑 Claude。
- 清理 Kimi：删 ~/.zshrc 的 claude()/claude-kimi()；删 ~/.claude/settings.json 里指向 ollama.com 的 env 和 "model": "glm-5.2"。备份 *.bak-20261030-kimi-cleanup。钥匙串 KIMI_API_KEY、~/.kimi-code、明文 DASHSCOPE_API_KEY 留给设计师。
- origin 改名（vernierkit → 03kind）：设计师在 app 里确认了新 origin，sync_with_base_branch 恢复。
- 10/31 设计师亲自 kill 92622（5624 上残留的开发服务器）。
- 10/31 设计师要求单独分析慢的运行是模型还是工具的问题。
- 10/31 Cursor 基线模型被拒时，设计师选「换 Grok 4.7 High 重测」（前提：原 id 不能用）。

## 总调度自主决断（按对话顺序）
1. 同步 main 后在新代码上两家各重测基线 B，作为 64 的「之前」；7275e98 上的基线 A 保留。
2. 【63 问题 1】接受 Cursor 无头跑用 `--force` + `--sandbox enabled` + 禁用命令表；两家「被权限拦下」不横比。
3. 【63 问题 2】接受 Claude effort 只能从命令行 `--effort high` + `--debug-file` 确认。
4. 【63 问题 3】Grid 列数：场景预期（所有宽度 2 列）对。核对一侧交给 64（桌面视图改动在每个视图宽度核对），说明一侧交给 65（claim 写清作用于所有宽度、已有断点写法要一并覆盖）。
5. 【63 发现】absolute 图层留 margin、核对只读 top：交给 64。
6. 63 合回 main 与重测基线分两个子线程。
7. 测量台给 Agent 的环境加 PLAYWRIGHT_MCP_* 变量 → 验证不通（agent-cli 不把变量传给插件 MCP），改为同名插件盖掉：项目级 mcp.json 盖不过，最终用 `--plugin-dir` 同名 headless 插件（109f7d2）；工具集不变，B 仍是对比点。
8. Cursor 的 browser-use 插件暂不处理（A、B 60 次从未调用），靠 headedBrowsers 监测（之后 200 多次全空）。
9. 【位置核对】保留画布语义（Y = top，外边距保留）；核对改为与画布渲染位置（Y + 画布上的外边距）比；测量台预期同改，A、B、64 用 diff.patch 重放重新打分。
10. 【Cursor 64 变慢】接受「噪声 + 做法变化」，64 不单独补跑；门槛放到 65 之后。
11. 【进度环中途多算】显示过的改动在代码变化时也复查。
12. 补跑 97e3f25 之后的 code-review；查清并修掉「第二个页面」（本机服务漏掉 StrictMode 的断开）。
13. 同步 main 的时机：最终合并时再同步并全量测试（含画布线 cdc7391 的自由图层 X/Y e2e），保持对比在同一底座上。
14. 66 不单跑真实 Agent；测量台记 unclaimedNotices，由 65 的复测顺带验证 0 误报（70 次全 0）。
15. 接受 66 子线程自定的判定：「影响页面」= 开发服务器给该页面送了热更新；1 秒内的热更新算一次；剧本「还能不能编辑」改为限时 2 秒。
16. 修 64 的时序问题（认领后马上改代码时环滞后）→ 3d78ebf 4d57d39。
17. 给 67 的约束：切换按钮只剩 239 B 余量，「Agent 好像停了」的提示代码放在后加载部分。
18. 修 done 认回答（按唯一 key，不靠毫秒时间戳）→ 2f035d6 446a477 299f522；接受剩余风险（回答被盖掉时 done 超时而不给假结果；之后各批 0 次）。
19. 65 的安排：两家各 30 + 不加载 Skill 各 10；追加三条验收（所有宽度说明、claim 开头 done 说法对齐、报告格式不易错）；最终门槛：65 后 Cursor 整轮用时若仍高于基线，整条线不合回 main。
20. 慢运行分析与实现子线程并行（只读、不碰 worktree）——唯一一次并行。
21. 65 补修（按分析修 claim/done/finish 的说明、断点按段、页面已开着、Breakpoints 例子、finish 预排 ✓/⚠️、复制写第几个；测量台固定 playwright-mcp、去掉 AGENTS.md 行），只复测 Claude。
22. Cursor 基线模型被拒 → 问设计师（见上）。
23. 接受「断点按段核对」（每段各看一个宽度）。
24. 先修按段读值的 long task 和读不到，要求 claim 输出逐字不变，免 Claude 重测 → 638f439 60ed3f3 9623bd4。
25. 接受：doctor/init 可装回 Skill（测量台局限）；「How the page checks」与 check.ts 双写（维护风险，最终 review 看能否同源生成）。
26. Cursor 重测子线程在确认模型时发现原 id 又能用（两个 id 的 init 都报 Grok 4.7 256K High），停下没跑，冒烟 2 次只回 OK。→ 问设计师。
27. 草稿目录被清空 → 重建本文件并在上一级留备份；之后每份 brief 加一条「不要删草稿目录里不是你建的文件」。

## 台账
### 63（d743e2d 389f049 fcbd214 bab94fb 29229ee；合并 067d737 已 push）
- 基线 A（7275e98；各 30 次，中位数）：每条 Claude 8.05 / Cursor 22.01 秒；工具调用 3.5 / 5.17；全仓搜索 0 / 3；Skill 字数 24482 / 24653；1:1 78/81 / 77/81；虚假 ✓ 3 / 4；报告合规 53% / 100%。
- 剧本 A：照流程 覆盖 100% 差 0；跳过 done 覆盖 0% 差 3；攒 done 最大差 3；半途退出 无提示、留存 0%；没认领改代码 未发现；停很久 无提示。
- 合并：同步带入 93 个提交；冲突仅 .gitignore、package.json；typecheck 过；单测 555+13；e2e 306 过 1 跳过。067d737 没有 Co-Authored-By 行。
### 基线 B（83d3227；代码 d3ee07d = 067d737 同树）
- 剧本数字与 A 相同。两家各 30 次，版本/命令行与 A 相同。
- A→B：每条 Claude 8.05→7.62 / Cursor 22.01→20.75；claim→finish 20.84→22.85 / 52.52→61.52；1:1 78→78 / 77→79；虚假 ✓ 3→3 / 4→2；合规 16→19 / 30→28。
- Cursor dissolve-place-frame 自起 Vite，两次挂到 20 分钟超时。A、B 里 Cursor 可能开过有窗口浏览器：A 4 次运行、B 3 次运行。
### 测量台修补（ticket 63）：109f7d2 headless 同名插件、raw.json 记 headlessShell/headedBrowsers；63e2f57 跳过占用端口；f83f397 按画布渲染位置的预期；b25e582 unclaimedNotices；b5fdf36 --no-skill；4ff531e 7ce0b99 playwright-mcp 0.0.83、读包统计
### 64（4d1d62f 97e3f25 e6dc97e 9704022 cc746bc 63e2f57 44975b4；补完 7c8049e f83f397 7fcb5fe bab6ea7 fd1f5ff b382319 6259622；时序 3d78ebf 4d57d39；认回答 2f035d6 446a477 299f522）
- 剧本：跳过 done 覆盖 0%→100%、进度差 3→0；攒 done 最大差 3→0；半途退出停下时覆盖 33%→100%。
- 性能 5006 元素：认领期间核对 0 long task。两条不稳 e2e 负载下各连续 20 次过。
- 重新打分后（1:1 / 虚假 ✓）：Claude A 72/9、B 72/9、64 75/6；Cursor A 75/6、B 73/4、64 77/2。
- Claude B→64：每条 7.62→5.46；claim→finish 22.85→14.01。Cursor B→64：每条 20.75→27.73、claim→finish 61.52→69.77（p≈0.61；多出的是认领到第一次改源码之间的思考）。
### 66（03d8a7a b25e582 74de8ea eca42fe c351f83 5256ed5）
- 没认领就改代码：未发现 → 100% 发现（87–200ms），编辑已暂停，改动保住 100%；误报测试全 0；切换按钮 9,990→10,001 B（限 10,240）。
### 65（8f5ee30 b5fdf36 90c572f 5c36f44 751c288；补修 aa899bd 4ff531e aba6682 5a7fcdf 7ce0b99；补修二 638f439 60ed3f3 9623bd4）
- Skill 146→40 行；claim 输出 2,936→6,199 字（补修后）；每轮全部读入 Claude 31,212→13,185。
- Claude（B→65→补修）：每条 7.62→5.19→4.78；claim→finish 22.85→14.88→12.62；1:1 72→77→81/81；虚假 ✓ 9→4→0；合规 19→26→30/30。不加载 Skill：合规 8→10/10，1:1 27/27。
- Cursor（B→65，256K 模型，补修前）：每条 20.75→29.05、claim→finish 61.52→76.21（门槛不过）；1:1 73→81/81；虚假 ✓ 4→0；合规 28→30；全仓搜索 97→173；读 node_modules/vernierkit 5→99 次调用。
- 补修二：按段读值 long task 9/9→0/12；10 场景 claim 输出与 aba6682 逐字相同。
### 慢运行分析（报告文件已丢失，结论如下）
- 慢的时间几乎都在模型；claim/done/finish 只占慢运行整轮 0–10%。
- Claude A/B 的慢是 API 卡 181 秒重试；首字节中位数 A/B 1.4–2.0 秒、64/65 1.0–1.2 秒 → Claude 的提速有一部分来自模型服务变快。
- Cursor 慢在长思考、反复规划、绕路（全仓搜索、读我们的 dist 和 Tailwind 源码、自己开浏览器）；三次超时是自起 vite 又被禁 kill。
- 65 的 Cursor 比 64 多出的时间里工具只占 27 秒，绕路读包和画布快照 32→92 次——说明缺口所致 → 65 补修。

## 遗留给设计师
- 残留进程：Cursor worker-server pid 85248（子线程停它被拦）。pid 57987 是设计师自己的 cursor-agent，不动。
- 临时目录：vernierkit-bench-run-dSjBfg、vernierkit-bench-pack-o4TdBr；production-build.spec 每次 e2e 留 vernierkit-build-*（约 249 个）；/tmp/vk64tr。
- 66 的提示样式只是基本深色卡片，设计师没看过。
- Kimi 残留：钥匙串 KIMI_API_KEY、~/.kimi-code、~/.zshrc 里的明文 DASHSCOPE_API_KEY。
- 10/31 16:2x 【设计师定】Cursor 用原 id（grok-4.7[context=256k,reasoning_effort=high,fast=false]）重测：基线代码 B' 30 + 最终代码 30 + 不加载 Skill 10，共 70 次，两批挨着跑；中途被拒就换 grok-4.7-high 接着跑并记下。
- 10/31 设计师 kill 85248 时它已自行退出（no such process）。
- 10/31 18:50 B' 第 26 次（promote-and-grid #3）原 id 又被拒，后续 B' 与最终代码都用 grok-4.7-high。【设计师定】两个 id 是同一模型，B' 30 次当一个整体比较；以后测量台默认 grok-4.7-high。

### Cursor 重测（2cced7f a47728f 4bca12a ed26d76；10/31 19:4x 核对：提交在、工作区干净）
- B' 30 次有效（原 id 24 + grok-4.7-high 6，另 1 次被拒补跑）；最终 9623bd4 30 次；不加载 Skill 10 次。agent-cli 2026.10.22-27dcf5f，init 都报 Grok 4.7 256K High。
- B → B' → 最终（中位数）：claim→finish 61.52 → 66.45 → 60.06；每条 20.75 → 23.79 → 20.02（p 0.36 / 0.30，不显著）；1:1 73 → 74 → 81/81；虚假 ✓ 4 → 7 → 0；合规 28 → 30 → 30；Light 0 → 0 → 5/30；读入全部 51,292 → 25,368 字。
- 变差：全仓搜索合计 94 → 114；读 vernierkit 包 9 → 30 次调用（集中在 dissolve-place-frame：拿不准 top 要不要扣外边距；phone-breakpoints：去读 Tailwind 源码查 `sm:` 与 `sm:max-md:` 的先后）。4 个场景慢 16–94%。
- 不加载 Skill：10/10 走完，合规 10/10，1:1 27/27，中位数 120.93 秒；3 次自己找到包里的 SKILL.md。
28. 【门槛】最终代码 Cursor 的两项用时都不高于 B'，门槛达到。但按核心规则，有指标变差（全仓搜索、读包）就不能合回 main → 派 65 补修三，把两处说明写清（画出来的位置 = top + 外边距、top 照给的写；逐段改时类的先后/改哪个类）。测量安排：补修三不单跑真实 Agent，要求 10 个场景里其余场景的 claim 输出逐字不变；Claude 用 67 的 30 次（在含补修三的代码上）当作 Claude 的最终数字；68 之后在最终代码上再跑 Cursor 30 次，对比 B'（门槛）和 9623bd4（读包、全仓搜索是否降下来）。
### 65 补修三（fffcb8e；10/31 核对：提交在、工作区干净）
- 自由定位那句改成「left/top 就是给的 X、Y，外边距保留不扣，画在 left/top 加外边距处」(+25 字，只 dissolve-place-frame)；Breakpoints 加一句 Tailwind 哪个类生效的顺序（在 4.3.3 与 3.4.19 上编译核对；+323 字，只 phone-breakpoints）。其余 8 个场景 claim 输出逐字不变；done/finish 不受影响。typecheck 过；vitest 631 过 1 跳；测量台 28 过；e2e 324 过 1 跳。切换按钮 10,001 B 不变。
- 风险：Tailwind 那句只核对两个版本、没写任意值断点；phone-breakpoints 多读 323 字，Claude 是否变慢看 67 的 30 次。
29. 【67 安排】阈值照 ticket 的定法：用现有真实 Agent 数据（两家、最新代码为主）里「没有页面进度、没有 done、源码没变」的最长时长取 1.5 倍；数值长也照定（写进风险），不当设计问题停。测量台加 stalledNotices，67 跑 Claude 30 次（同时作 Claude 含补修三的最终数字，对比 65 补修的 06-51-29 批），Cursor 的误报在 68 之后的最终 Cursor 30 次里顺带测。
### 67（0e96358；10/31 核对：提交在、工作区干净、Status done）
- 阈值 551 秒 = 1.5 × 367.14（Cursor 最终代码不加载 Skill 的最长停住段；Claude 最长 24 秒）。旧代码上 Cursor 有过 603、473、407 秒。
- 剧本：做到一半退出 无提示 → 真实时间 551,149 ms 出现（上限 556,000）；停很久再继续 误报 0、恢复即消失；结束这一轮与长按逐项相同。
- claim 重新跑：原来全量再印一遍 → 只给页面核对后没落地的改动；Skill −8 字。测量台加 stalledNotices，measures/summary 也加 unclaimedNotices。
- Claude 30 次（2026-10-31T12-37-19-686Z；2.1.309、sonnet-5-5、high；load 8.9–10.9，65 补修批时 6.7–7.4）vs 65 补修：claim→finish 12.62→15.22（p≈0.38）；每条 4.78→5.28；全仓搜索 20→24（p≈0.55）；1:1 81→80/81、虚假 ✓ 0→1（都是 fill-gap-brief #3：gap 写进 Card 组件本身、第 4 张卡也变 flex，done 没查出）；读入 13,185→13,334；读包 0；合规 30/30；stalledNotices/unclaimedNotices 0、headedBrowsers 空。补修三加字的两个场景没变差。
- 切换按钮 10,001 B 不变；editor.dev.js 98,439→99,078 B。e2e 325 过 1 跳（第一次在 load 23 下 views.spec.ts:188 帧时序失败 1 条，重跑通过）。
30. 【67 的 Claude 数字】对比基线 B 全部更好，只有全仓搜索 20→24 高于 B（不显著）。1:1 与虚假 ✓ 是同一次运行、claim 输出逐字相同，记为 Agent 偶然；但它暴露 done 不查「只改这一处」是否漏到别的使用处 → 记为遗留，最终审查时提议新 ticket。全仓搜索在最终审查里结合最终 Cursor 批一起看来源，若仍高于基线且查得出原因，按核心规则交给设计师。
31. 【68 安排】只用剧本，不跑真实 Agent；要求新一轮 claim/done/finish 输出在 10 个场景逐字不变（变了就得补跑 Claude）；改画布的代码对照 main 上画布线（cdc7391 等）只读看一眼，预判合并冲突。
- 10/31 【设计师定】额度快见底：68 这轮做完就暂停，明天再继续。68 之后不再派任何子线程（最终 Cursor 30 次、最终审查、合回 main 都留到明天）。
### 68（10/31 停在设计问题上，没有提交；HEAD 仍是 0e96358，工作区干净）
- 子线程读完后停下，5 个设计问题待设计师定（附推荐）：
  1. 留下的改动与新代码冲突：画布以「改后」为准；「改前」推荐按新代码重读（新代码已等于改后就算落地、不留）；结构改动涉及的任一图层找不到或不唯一，整条连同依赖算「找不到」。注意：上一轮新建的 Frame 已落地、它的样式改动没落地时，会变成「找不到」。
  2. 找不到的改动：推荐在改动列表行尾加「· Layer not found」（文字待定）；用行上的撤销放弃，⌘Z 可撤回；不放弃时下一轮 claim 推荐照给并注明找不到；每次进编辑模式再找一次。
  3. 进入编辑模式：推荐重新应用期间按钮显示 busy、应用完再显示画布（有留下的改动时会慢于 150ms）；需定 150ms 目标是否只管没留改动的情况。
  4. 编号：推荐按原顺序从 1 重编。
  5. 重新应用不算一步撤销（⌘Z 不整批撤掉）。
  另请确认：结束后、再进编辑模式前，角标显示留下的条数、改动列表可撤单条；Agent 自己 finish 时没落地的照旧归档不留；归档保留整轮改动单，last 不变。
- 基线（0e96358）：剧本留到下一轮 0%；切换按钮 10,001 B；进入编辑模式中位数 124.8ms、p95 149.0ms；10 场景 claim 输出存于 scratchpad/claim-0e96358/。
- 合并风险：spec.md 228 行附近与 main（「手柄」→「控制点」）会有相邻行冲突；Shell.tsx、ChangeList.tsx、edits.ts、edit-commands.ts、测试文件可能有小冲突。
- 11/01 【设计师定 68】1) 改前按新代码重读，新代码已等于改后算落地不留；结构改动涉及的图层任一找不到/不唯一，整条连同依赖算找不到；上一轮新建 Frame 上的样式改动标找不到，先接受，另开 ticket（让 Agent 新建的图层在页面上可找）。2) 找不到的改动：不逐行标，折叠成改动列表末尾一行「N changes not on this canvas」，点开逐条列出（附上一轮页面地址）、可逐条放弃；角标照算全部；下一轮 claim 照给并注明画布上找不到；每次进入编辑模式都再找一次。（3–5 待续）
- 11/01 【设计师定 68 方向】改走 B：设计师结束一轮时不丢画布，下次进入编辑模式回到同一张画布（沿用 spec 225「有未落地改动时回到同一张画布」）；已落地的归档、从列表拿掉、留在画布上当底；没落地的留在列表里；都落地或放弃后才按新代码重新冻结。理由：Agent 在源码里找，不靠画布；重新冻结再叠回去只为让画布反映代码现状，预览模式已能看到，不值一个 10 种改动的映射模块和一串找不到的问题。随之：第 1 条「改前按新代码重读」保留（认领时由活页面读）；第 2 条折叠行、每次再找不再需要；第 3 条 busy 不再需要；新建 Frame 另开 ticket 仍保留（页面核对仍查不了 Agent 新建的图层）。要改 ADR 0013 最后一条后果、ticket 68、spec「手动解锁…画布丢弃」、GLOSSARY「一轮」。
- 11/01 【设计师定 68，按 B】4) 留下的改动按原顺序从 1 重编，新改的接在后面。5) 已落地的当画布的底，⌘Z 和列表都撤不了（退代码用 last）；留下的用列表逐条放弃，Discard all 照常；⌘Z 只撤这次新做的编辑。6) Agent 自己 finish 时没落地的（⚠️）也留到下一轮、画布保留（扩大了 ticket 原来只写「设计师结束一轮」的范围）。7) 确认：结束后、再进编辑模式前角标显示留下的条数、列表可逐条放弃，这时 claim 拿到留下的；归档照旧保留整轮改动单，last 不变。
32. 【新 ticket 的编号时机】「让 Agent 新建的图层在页面上可找」这张 ticket 不在 68 里开：按编号规矩开完要把 main 同步进分支，会把画布线（69–73）提前带进来，打乱「最终合并时才同步、对比在同一底座上」（决断 13）。改到合回 main 那一步，由合并子线程在 main 上编号、写好。
33. 11/01 设计师说「现在派」→ 派 68 子线程（按 B）。
### 68（e5b2877；11/01 核对：提交在、工作区干净、Status done）
- 按 B 做：finish 与 POST /unlock 都走 archiveRound，按 appliedOf（与 64、67 同源）分已落地/没落地；有没落地的就保留画布，没落地的按原顺序从 1 重编（标 carried），已落地的进改动单 applied、在 restore 里挪到编辑样式下一层当底；下一轮 claim 先用新标记 opening 问页面，页面已显示的算落地，其余「改前」换成页面现在的值；断点分段的改动认领前由页面重读。
- 剧本（bench-results/playbooks-68/）：没落地的留下 0% → 100%（做到一半退出 2/2、新剧本 4/4、finish 有 ⚠️ 2/2）；画布一致性 76 个元素 × 位置 + 23 项计算样式，桌面/768/390/画布外各 0 处不同，⌘Z 后 0，finish 剧本 75 个 0；编号 1–4 + 5；改前读成代码现值 #FF0000；last 可用；都放弃/都落地后重新冻结。
- Agent 读到的输出：没留下改动时 10 场景 claim 与 claim-0e96358/ 逐字相同；加不提交补丁跑 done 全部 + finish，claim/done/finish 30 份 0 份不同。
- 性能（headless，前后紧挨跑）：进入编辑模式（重新冻结）中位数 135.1 → 128.7ms；回到同一张画布（保存的一轮）125.8/137.8 → 123.5/137.9ms；有留下改动的一轮 111.8/134.4ms（新路）。切换按钮 10,001 B 不变；editor.dev.js 99,091 → 99,533 B。
- 测试：typecheck 过；vitest 647 过 1 跳、node 29/29；e2e 327 过 1 跳（一次全量里 67 stops-halfway 偶发失败，单独 3/3、文件 9/9、最后全量过）；perf 7 过。改了两条 e2e 期望（round.spec 长按、off-canvas-round 第一条）以符合新行为。
- 文档：ticket 68 重写；ADR 0013 最后一条后果改成回到同一张画布并在 Considered Options 补被否的「重新应用」；spec 状态行、225、用户故事 96、新增「留到下一轮」一节；GLOSSARY「画布」「一轮」；另改了 ADR 0001 一句（brief 外）。
- 没达成：回到同一张画布时每次进入有 1 个约 115–120ms 的 long task；0e96358 同一条路也是 1 个、最长 119ms，不是 68 引入。
- 风险：已落地的「这一处」挪到底层后压在「组件本身」下面，同属性时画布显示组件的值（没测）；同一元素有已落地改动又有留下的结构改动时，放弃那条结构改动撤不干净；留下改动的 sources 没重读；有留下改动时 claim 要等页面答 opening（没量）；claimCarried 与 67 的 claim 再跑一次有重复代码。
- 合并冲突预判（merge-tree）：CanvasView.tsx 解构行（takeIn vs 69 的 onResize）、spec ~225、e2e/perf/flex.perf.ts、Shell.tsx import 行、SKILL.md。
34. 【68 的 long task】不算 68 的退步：同一条路在 0e96358 上就有，数值相同；核心规则只拦「变差」，这项没变差 → 不补修，记入遗留，最终报告里请设计师定要不要另开 ticket（要动恢复画布的方式）。
35. 【68 改了 ADR 0001】接受：不改的话「一轮只对应一张画布」和 0013 新后果互相矛盾；domain-modeling 判断不用新 ADR，没占编号。
36. 【Claude 不补跑】68 在没留下改动的一轮里 claim/done/finish 30 份输出逐字不变，测量台每次只跑一轮、不会出现留下的改动 → Claude 的最终数字仍用 67 的 30 次（12-37-19-686Z，0e96358 含补修三）。
37. 【68 的两条撤销风险】不单派补修：最终审查里的 code-review 从分叉点看，若查实「放弃留下的结构改动撤不干净」能复现，再派补修；否则记入遗留。
38. 【最终 Cursor 30 次】在 e5b2877 上用现在的测量台跑 10 场景 × 3，grok-4.7-high；门槛对 B'（claim→finish 66.45 秒、每条 23.79 秒）；同时对 9623bd4 最终批看读包（30）、全仓搜索（114）是否降回 B'（9 / 94）附近，拆来源；顺带看 stalledNotices 误报。不加 --no-skill 批（9623bd4 已测过，68 没改 Skill 的这部分说法）。
39. 11/01 13:3x 派最终 Cursor 30 次子线程（e5b2877，grok-4.7-high，先 --dry 冒烟查测量台在 68 下是否依赖旧行为）。跑的时候我不跑测试，最终审查等它跑完。
### 最终 Cursor 30 次（e5b2877；记录 9bea5a5 ticket 65、ed1fb77 ticket 67；11/01 核对：提交在、工作区干净）
- 2026.10.22-27dcf5f，grok-4.7-high（init 都报 Grok 4.7 256K High），有效 30、补跑 0、作废 0，另冒烟 1 次；13:32–14:36，开跑前 load 5.6。测量台没改（只读归档与 state.json，不依赖画布丢弃）。结果 bench-results/agents/2026-11-01T05-32-37-final-e5b2877/。
- B / B' / 9623bd4 / e5b2877 中位数：claim→finish 61.52 / 66.45 / 60.06 / 69.11；每条 20.75 / 23.79 / 20.02 / 24.91；合计 3,319 / 3,371 / 3,017 / 2,498 秒；几何平均比 B'→e5b2877 0.76，p 0.19 / 0.16。
- 门槛没过：两项中位数都高于 B'（+4% / +5%）。30 次分两堆（15 次 ≤60 秒、15 次 ≥78 秒），中位数落在空档；推高它的是 button-over-rule：B' 45–50 秒，9623bd4 74.5/94.5/124.5，e5b2877 78.5/108.2/207.6（两批 6/6 都慢于 B' 全部 3 次），387/394 秒是模型思考，在「收窄 button 规则」与「按钮上用 !」之间来回换。这段说法和 B' 的 Skill 第 76–77 行几乎相同，只是从 Skill 挪进了 claim（64），原因没查清。
- 补修三有效：全仓搜索 94 → 114 → 80（低于 B'）；读包 9 → 30 → 11（仍比 B' 多 2：dissolve-place-frame #3 拿不准检查器看 top 还是画出来的位置 7 次；找「sketch」4 次）；读 Tailwind 27 → 44 → 5；phone-breakpoints 绕路 453 → 61 秒。
- 新发现：没有草图的 Frame，claim 也写「laid out as the sketch shows」（change-notes.ts:390、writing-rules.ts:142），Cursor 去找草图（9623bd4 #3 也有）。
- stalledNotices / unclaimedNotices 30 次都是 0；最长停住段 201 秒（阈值 551 的 37%）。
- 1:1 81/81，虚假 ✓ 0，合规 30/30，Light 2/30，超时 0。
- 小事：读包统计不算打包临时目录（少算 1 次）；子线程写 scratchpad/compare.py 时可能盖掉了原有的同名文件，没法还原。
40. 【门槛没过 → 按核心规则整条线暂缓合回 main，交设计师定】我的看法：整体更快（合计 −26%、几何平均 0.76、准确率 81/81 与 0 虚假 ✓），中位数 +4% 来自一个场景的模型思考、且分布两堆；但 button-over-rule 是两批一致的变慢，不是噪声。
41. 11/01 【设计师定】门槛：放行，按整体更快判定（合计 −26%、几何平均 0.76）；button-over-rule 变慢与「没有草图也写 as the sketch shows」两件，合回 main 时由合并子线程在 main 上各开一张 ticket（连同决断 32 的「让 Agent 新建的图层在页面上可找」，共三张）。
### 最终审查（11/01 15:0x 起，我自己做）
- typecheck 过；vitest 647 过 1 跳（30 个文件）；node 29/29。e2e 后台在跑（先把 bench-results/playbooks/ 备份到 scratchpad/review/playbooks-before，跑完恢复）。
- code-review 从 067d737 起：Standards、Spec 两个子线程并行在看。
- Claude 全仓搜索 20 → 24 的来源（按场景合计 B 17-25-02 / 65 补修 06-51-29 / 67 12-37-19）：button-over-rule 4/4/5、cards-style 4/3/4、dissolve-place-frame 0/2/2、fill-gap-brief 5/3/3、phone-breakpoints 3/3/4、promote-and-grid 3/0/1、put-back-and-new-text 1/3/4、type-and-stack 0/2/1，其余 0。多出的 4 次散在 4 个场景、各 +1，和 B 比没有集中的场景 → 记为噪声（p≈0.55），不交设计师。
- Cursor 全仓搜索最终 80，低于 B' 94，原问题已解决。
42. 11/01 【设计师定】不在最终审查前修。审查做完再看：查出必须修的 → 连同「草图」那句（button-over-rule 查得出原因也算）作 65 补修四一起修，两家各复测一次再合（不用新编号、不提前同步 main）；没查出拦合并的 → 照决断 41 先合，在 main 上开三张 ticket。新建图层可找那张无论如何合并后另做。
- e2e（含剧本）：327 过 1 跳，4.8 分钟，一次通过。剧本结果存 scratchpad/review/playbooks-final/，bench-results/playbooks/ 已恢复成跑前的样子（diff 无差别）。
- Robust 逐项：
  1. 核对覆盖率 100%：follows-the-workflow / skips-done / done-all-at-the-end / pauses-then-goes-on / stops-halfway 都是 1 ✓。
  2. 进度差 0：都是 0 ✓。
  3. 设计师结束一轮，没落地的留下 100%：stops-halfway、carries-over-what-is-left、finishes-with-changes-left、ends-round-from-notice（提示里结束与长按逐项相同）都留下、已落地的不回列表 ✓。
  4. 停住提示：551,306 ms（上限 556,000）✓；误报：剧本 0（停 541 秒不提示），真实 Agent Claude 30 + Cursor 30 都 0 ✓。
  5. 没认领却改代码：193 ms 发现 ✓；误报：其余剧本 0，真实 Agent 0 ✓。
  6. 5000 元素页面每次热更新的核对不出现 long task：perf 全套 7 过（68 子线程在 e5b2877 上跑；之后只改了记录）✓。
  7. 整轮用时不高于基线：Claude ✓（对 B）；Cursor 中位数比 B' 高 4–5% ✗，设计师按整体更快放行（决断 41）。
  8. 读入字数不高于基线：Cursor 全部 51,292 → 26,756.5 ✓；Claude 13,334（B 的 Skill 24,653 字，现在 3,562）✓。
- code-review Standards（我核对过前两条）：
  - 硬：65 验收清单 Cursor 那项还勾着，目标没达到，要么取消勾、要么写上设计师放行（决断 41）。
  - 确认：writing-rules.ts:199–207 的 checked 手抄 check.ts:38–65 的 uncheckable/checkable，已经漂移：check.ts:61 对容器没有 loc 或是 made 的移动答不核对，sameContainer 不查 → 说明说按位置核对、页面答 Not checked。没有测试把两处绑在一起（REPORT_RULES 有，cli.test.ts:1804）。
  - 确认：cli.ts:98（67 的 claim 再跑一次）「1 of its 3 changes are applied」单复数错，cli.ts:137（68）是对的；两段尾巴重复（cli.ts:92–101 与 130–140）。
  - 判断题：ask-and-wait 三处重复；page-copy.ts 抄 views.ts 四处；within/contains、标记过滤、「这一轮的结果」判断四处；opening/check/closing 数据团；cli.ts 与 report-form.ts 的 kind 分支重复；changesWord 改名；claimCarried 7 个参数；cli.ts 为 64/65/67/68 都改（发散式变化）；cli.ts:210–211 双空行。
- code-review Spec（我读代码核对过 1、2、3）：
  1. 确认：画布层序 copied < promoted < edits（canvas-style.ts:467–469）；已落地的「这一处」挪进 copied、留下的「组件本身」在 promoted → 同属性时画布显示组件的值，和结束前不一致（违反 68 验收「差异 0」）；测试只有已落地的组件改动。
  2. 确认：holdAbsolute 把 position: relative 写进容器的 edits（moves.ts:82–88），容器有已落地改动时随之进 copied；放弃留下的绝对定位移动时 releaseAbsolute 只还原 edits（moves.ts:92–98）→ 容器还是 relative。
  3. 确认：X/Y 的 actual 是 {value, margin}（check.ts:294），readsBefore 照收（cli.ts:150）→ 「Change the X from [object Object]px to 40px」。
  4. 分段的范围各段读出相同时，意图退回 change.before，仍是冻结值（change-notes.ts:186–187）。
  5. 边缘：留下的都放弃后，再改上一轮新建且已落地的图层，说明写「not in the source yet」（change-notes.ts:446）。
  - spec 缺口：留下改动的 sources 不重读（spec 只要求改前）；done 不查「只改这一处」漏到别的使用处（spec 与 ADR 都没要求，goals 的虚假 ✓ 定义也不含）。
43. 【审查结论】有必须修的：68 的 1–5（1 违反验收「差异 0」，3 给 Agent 乱码），加 Standards 的说明与核对漂移、单复数。按决断 42 走「先修再合」，但我答应过设计师审查后请他在两条路里选，所以先问。
44. 11/01 【设计师定】先修再合；留下改动的「Currently set by」也按活页面重读（放进 68 补修，spec 补一句）。安排：① 68 补修（审查 1–5 + sources 重读 + 把 claimCarried 与 67 的 claim 再跑一次的尾巴合成一处、顺带修单复数；没留下改动时 10 场景 claim/done/finish 逐字不变；不跑真实 Agent）→ ② 65 补修四（草图那句；「页面怎么核对」改成与 check.ts 同源并加测试；65 验收清单注明设计师放行；查 button-over-rule 原因，查得出就修，要选写法就停下问）→ ③ Cursor 30 + Claude 30 复测 → ④ 合回 main（开新建图层可找、done 漏到别的使用处两张；button-over-rule 没修好就再开一张）。
45. 11/01 派 68 补修子线程（审查 1–5、sources 重读、claim 尾巴合并与单复数；剧本到 playbooks-68fix/；不跑真实 Agent）。65 补修四等它提交后再派（同在 cli.ts / writing-rules.ts 附近，不并行）。
### 68 补修（a1a0deb；11/01 16:2x 核对：提交在、工作区干净、Status done）
- 1 新加 taken 层（copied < promoted < taken < edits）；2 定位参考的 position: relative 归给放成绝对定位的那条改动；3 beforeOf：X/Y 取 left/top（{value, margin} 的 value）；4 分段各段相同时写回 before；5 madeBefore 改为「改动单里没有新建它的改动」；6 opening 带 sources: true，页面一起读 Currently set by；7 claimedAgain 合并两条尾巴、askPages 合并三处问页面，单复数修好。每条把修复撤回时都有测试失败。
- typecheck 过；vitest 656 过 1 跳、node 29；e2e 全量 328 过 1 跳（在 code-review 后的小改之前）；小改后只重跑 applying-bench/round/claim 三个文件 49 过、pauses-then-goes-on 偶发 1 次（单独重跑过）。
- 剧本（playbooks-68fix/）：画布逐元素 78 个中 57 个不同 → 0；Card padding 16 → 24px（结束前 24）；撤销移动后容器 relative → static；Currently set by 冻结的 p-5 → pt-6；留下 100%。
- Agent 读到的：没留下改动的一轮 10 场景 claim、20 份 done/finish 和 0e96358 逐字相同；有留下改动的一轮 8 相同、2 不同（「its 1 change is」；dissolve-place-frame 的 Y「nullpx」→「368px」）。
- 性能：重新冻结 131.8 → 114.6ms，同一张画布 108.8 → 108.6，有留下的 110.0 → 106.4；回到同一张画布每次 1 个约 100ms long task（照旧）。切换按钮 10,001 → 9,998 B。
- 风险：本轮新建图层的前提靠 withDependents；组件改动多处使用时 sources 只读第一处；只处理了定位参考的 relative；code-review 的几处判断题没改。
46. 【68 补修收下】全量 e2e 没在最后一版上跑 → 由 65 补修四的全套测试一并覆盖（它在 a1a0deb 之上跑全量），不另派。
47. 11/01 16:3x 派 65 补修四（草图那句；「页面怎么核对」与 check.ts 同源并加绑定测试，PLACING 合一；65 验收注明放行；只用已有对话记录查 button-over-rule，要选写法就不改、交设计师；全量 e2e 兼替 a1a0deb 补跑）。
### 65 补修四（a661a73；11/01 核对：提交在、工作区干净、Status done、第 13 行放行注明在）
- 草图：新加 changeset.ts 的 drawnIn（和打不打 **Sketch:** 同一判断），没草图时 Brief 行与「New Frame with a brief」改成按尺寸、照 brief 排版，不提草图；有草图逐字不变；混合的一轮加一句。
- 核对同源：新模块 client/checkable.ts（checkable + PLACING，只有 import type），check.ts 与 writing-rules.ts 共用；漂移那种（新建或找不到的容器里的移动）列进「not at all」；绑定测试 16 种（改前 2 种失败）；PLACING 三份合一（测量台也 import）。
- 测试：typecheck 过；vitest 675 过 1 跳、node 29；e2e 328 过 1 跳（兼替 a1a0deb 补跑全量）；playbooks 恢复 diff 无差别。
- claim 输出：只有 dissolve-place-frame 变（6,650 → 6,653 字，两行），其余 9 场景逐字不变；done/finish 不受影响；Skill 不变 3,688 字；切换按钮 9,998 B。
- button-over-rule 查明：改动部分 claim 与 B' 逐字相同；不同在上下文——B' 的「last resort」夹在 24,653 字 Skill 的约 20 条里，Cursor 直接用 `!`（3/3 写 rounded-lg! bg-[#2563EB]!）；现在在 claim 末尾 5 条里，被当成先后顺序，先试收窄（6/6 改 CSS：@layer base 1、各种 :not/选择器 5），再加「whatever class or rule gives it」让它想到改全局规则也能过核对（提计算样式 B' 0/3 → 4/6）。最长思考 17–28 秒 → 41–72 秒。没改：要定写法，是设计问题。
- 留下的：新建或找不到的容器里重排时，done 的理由仍是笼统那句（改它会改 done 输出）；绑定测试只覆盖 16 种。
48. 11/01 【设计师定】button-over-rule：规则还管着范围外的元素时，不动规则，在这个图层上用 important 类（B' 的写法）；「How the page checks」补一句：核对只看这个图层，改到范围外的元素即使能过核对也不行。→ 派 65 补修五（小改，只动说明），之后再派两家复测。done 不查漏到别处那张 ticket 合并时照开。
### 65 补修五（c39f839；11/01 核对：提交在、工作区干净、Status done）
- What sets the value now：规则管的元素都在范围内才改规则，否则不动它、只为这个图层覆盖（Tailwind 用图层上的类，CSS 文件/Modules 给图层自己的类写规则）；A rule in no CSS layer：v4 上覆盖它的类用 important 形式（`bg-[#2563EB]!`、`rounded-lg!`），去掉 narrow it / last resort；How the page checks 补「and on nothing else: an edit that also changes elements outside the scope is wrong, though `done` says it shows」。SKILL.md 没有这几句、没动；spec 三处转述跟改。
- 测试：新加 2 个（撤回修复时正好这 2 个失败）；vitest 677 过 1 跳、node 29；e2e 4 次全量：第 1 次 stops-halfway（67 停住提示）没出现、load 约 5.6，后 3 次 328/1 全过。
- claim：7 个场景 +169～+285 字（约 3–6%），data-and-text、put-back-and-new-text、reorder-and-move 不变；done/finish 不受影响；Skill 3,688 不变；切换按钮 9,998 B。
- 风险：例子 `bg-[#2563EB]!` 正好是 button-over-rule 的答案；「A rule in no CSS layer」在 Tailwind v3 类、CSS Modules 规则上也打印（新句子只对 v4 说 `!`）；v3 高特异度规则要 `!bg-…` 前缀没讲；图层没有类时要先给一个没写明。
49. 【stops-halfway 偶发】68 与补修五各在高负载下失败过一次（停住提示没出现），单独/重跑都过 → 记入遗留风险（计时剧本在 load ≥5 时不稳），不拦合并。
50. 派复测：c39f839 上 Cursor 30（grok-4.7-high，门槛对 B'）+ Claude 30（2.1.309、sonnet-5-5、high，对 B），顺序跑、不并行、不同时跑测试。
### 复测 c39f839（记录 7ce7910 ticket 65、afd1862 ticket 67；11/01 18:5x 核对：提交在、工作区干净）
- 版本：Cursor 2026.10.22-27dcf5f + grok-4.7-high（init Grok 4.7 256K High）；Claude 2.1.309 + sonnet-5-5 + high。各有效 30、补跑 0、作废 0；Cursor 17:32–18:32 load 4.2，Claude 18:32–18:48 load 1.7。结果 agents/2026-11-01T09-32-06-final-c39f839-cursor/、…10-32-41-final-c39f839-claude/，分析 bench-results/retest-c39f839/。
- Cursor（B / B' / e5b2877 / c39f839）：claim→finish 61.52 / 66.45 / 69.11 / 47.84；每条 20.75 / 23.79 / 24.91 / 15.95；几何平均对 B' 0.67（p 0.066 / 0.039）；全仓搜索 97 / 94 / 80 / 74；读包 5 / 9 / 11 / 0；读入全部 51,292 → 24,486.5；1:1 81/81；虚假 ✓ 0；合规 30/30；Light 3/30。门槛达到。
- Claude（B / 65 补修 / 67 / c39f839）：claim→finish 22.85 / 12.62 / 15.22 / 14.66；每条 7.62 / 4.78 / 5.28 / 5.15（对 B 几何平均 0.69，p≈0.001）；全仓搜索 20 / 20 / 24 / 17；1:1 81/81；虚假 ✓ 0；合规 19 / 30 / 30 / 28；读包 0。门槛达到。
- button-over-rule：Cursor 17.3 / 21.5 / 28.0 秒（B' 中位 48.8，e5b2877 108.2），最长思考 6–12 秒；两家 6/6 只在按钮上写 `rounded-lg! bg-[#2563EB]!`，没动 index.css / Dialog.tsx。
- dissolve-place-frame：不再找 sketch（0 次），Cursor 读包 11 → 0、绕路 274 → 0 秒。
- 60 次 diff 都没改到范围外的元素；fill-gap-brief 6/6 只给 3 张卡传 flex，第 4 张仍 block。
- stalledNotices / unclaimedNotices 60 次 0；最长停住段 Cursor 196 秒、Claude 24 秒。
51. 【复测收下】两家门槛都过；整条线对基线没有变差的指标。唯一比上一批差的是 Claude 报告合规 30/30 → 28/30（都在 dissolve-place-frame 第 3 条新建 Frame，同一条同时列在 ✓ 和 ⚠️ 下，不是虚假 ✓；#1 把 Design intent 里「absolute … positioning reference (position: relative)」读成两种 position 都写，补修四、五没改这行；#3 可能受补修四新句「the designer drew nothing in it」影响，只 1 次）。对 B（19/30）仍更好 → 按先例（决断 30：和基线比）不拦合并，写进最终报告的遗留，请设计师定要不要改那几句。
52. 【合并】派合并子线程：同步 main（a13f1e5，画布线 72、71、73、69 等 27 个提交）、在 worktree 解冲突（spec ~230、flex.perf.ts、SKILL.md、CanvasView.tsx、Shell.tsx）、跑 typecheck / test / e2e（含 cdc7391 的自由图层 X/Y）/ perf、比对合并后 claim 输出；merge --no-ff「Merge the applying line: tickets 64, 66, 65, 67 and 68」并 push；之后在 main 上按编号规矩开两张 ticket：让 Agent 新建的图层在页面上可找、done 查不出「只改这一处」漏到别的使用处。button-over-rule 和草图都已修好，不开。
### 合回 main（11/01 19:xx 核对：main = origin/main = f4a8943，主目录只有 ?? .claude/，worktree 干净且已快进到 f4a8943）
- 58d4ada 把 main（a13f1e5，27 个提交：画布线 72、71、73、69，ticket 74、75）同步进分支；5 个冲突两边都留，SKILL.md 取本线版本（main 2a5bcbd 的「set aside → off-canvas layer」意思已在 claim 里）。
- 4978884（ticket 65）：main 的 install.test.ts 断言 Skill 里有 Put back 两句，与 65 砍掉的 Skill 冲突 → 改为只查 Skill 不说 set aside，put back 由 cli.test.ts「claim, layers off the canvas put back」覆盖。
- 测试：typecheck 过；vitest 710 过 1 跳、node 29；e2e 348 过 1 跳 1 失败（applying-bench.spec.ts:240 stops-halfway 偶发，单独重跑过）；perf 10/10（进入编辑模式 135.5ms，回到同一张画布 116.3 / 122.4ms，拖拽与拖控制点 60fps，认领期间核对最长 14.7ms）。claim 输出与 fix5/claim-final 逐字相同。
- aff5557「Merge the applying line: tickets 64, 66, 65, 67 and 68」已 push；ticket 76（ec949f7，made-layers-found-on-the-page）、77（f4a8943，usage-change-leaking-to-other-usages）都是 needs-triage，已 push。
53. 【合并收下】install.test.ts 放宽接受（是 65 既定做法的后果，不是新改动）；stops-halfway 第三次偶发，照决断 49 记遗留。落地线完成。
