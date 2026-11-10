# 118: 测量台加 Stack 和 Grid 的标准场景

**What to build:** ticket 109（Stack 和 Grid 互转、Grid 格子的 Hug / Fill）和 110（⇧A 合成 Grid）只用脚本扮演 Agent，在 `applying-bench.spec.ts` 里走过，没有进测量台的标准场景，真 Agent 还没写过 Grid。要做到：测量台的标准场景里加上这些改动，真 Agent 能照常跑、照常出 1:1 和 `done` 的统计；下一次真 Agent 复验时一起跑。

参考 ticket 88（验收的做法和统计）、109、110 的 Comments，用词以 GLOSSARY.md 为准。

**Blocked by:** 109 的 follow-up（代定 6：按位置摆子图层的 Grid 也能改成 Stack）、110

**Status:** done

- [x] 新场景至少包括：
  - 桌面视图里横排 Stack 转 Grid、再改列数；
  - 手机视图里 Grid 改回竖排，只在手机上生效；
  - Grid 里一个格子 Hug 改 Fill；
  - 按 areas 摆的 Grid 在手机视图里改竖排；
  - ⇧A 把排成几行几列的自由图层合成 Grid。

  几个放一个场景里、怎么分作为代定。
- [x] 每个新场景都有脚本扮演 Agent 的写法（`apply`）：`--scripted` 全过，`done` 是 ✓
- [x] 原来 24 个场景的认领说明和 `done` 逐字不变（`--claim-out` 和改前 diff）；`--dry` 的个数变了，在 `docs/agents/` 或测量台说明里写上新的个数，88 的结果表注明「24 个场景时」
- [ ] 不跑真 Agent。真 Agent 跑这几个场景（Claude、pi 各 3 次）和下一次复验一起跑，例如 ticket 88 末尾第三方那条规则定下以后那次；开跑前问设计师额度
- [ ] e2e 全过

## 背景

- 设计师 2026-11-09 过 109 的代定 9 时同意：「另开一张票，加 2–3 个场景，等下次真 Agent 复验时一起跑」。
- 加进标准场景会改 88 的验收基数（24 个），所以 109 当时没加。

## 设计师决定（2026-11-09）

- 接在 109 那条线最后（109 → 110 → 109 follow-up → 117 → 118），照那条线的做法：设指挥，每张一个新的实现子 agent、一个审查子 agent，都用 effort medium。

## Comments

### 118 做了什么（2026-11-10；起点 bbb03a6，分支 worktree-agent-af8fec03a4ef1eb23）

**做了什么**

- 测量台的标准场景加了 3 个（`e2e/bench/scenarios.ts` 末尾，接在 108 的 `off-canvas-frame` 后面），5 种改动都在里面，一共 5 条改动。每个都有脚本扮演 Agent 的 `apply`，写法照 109、110 那几个剧本（`applying-bench.spec.ts`）里 Agent 写的。要上一轮先写好的（`w-fit` 的卡片、按区域摆的 Grid、四个方块），照 `placement-kept`、`variables` 的做法：`desk.edit` 改源码，`desk.settle` 作为这一轮的起点，等页面带进来再进编辑模式。
- `ScenarioChange` 多一个 `variableKept`（见代定 2）：改动的值是代码里已经写着、而且保持不变的 Variable（Stack 的间距转过去成了 Grid 的间距）。这种改动不写 `variable`，不算进设计变量使用率；`designProblems` 认它，值不是 Variable 却标了它也报出来。原来的场景都没有用到，`designProblems` 对它们的结果不变。
- 包、示例项目、Skill、改动说明都没改（`git diff bbb03a6 -- packages examples` 为空），切换按钮的包自然逐字节不变。
- 新的个数写在 `scenarios-other-examples.ts` 的 `STANDARD_SCENARIOS` 说明里：28 个（88 和两次复验时 24 个，108 起 25 个），`--scripted` 跑有 `apply` 的 19 个。88 的结果表（第 2 节）和两次复验的标题注明「24 个场景时」，并说新场景的数另算。

**场景**

| 场景 | 上一轮 | 这一轮 | 改动 |
|---|---|---|---|
| `stack-to-grid-and-cell-fill` | Card 加 `w-fit`（四张卡片都按内容） | 桌面视图：Header（横排 Stack）转 Grid，再把列数改成 3；循环的卡片（第一个 Card 的使用处）在 Grid 格子里 Hug 改 Fill | 1. Arrangement（Stack to Grid，3 列，行列间距 12px）；2. Width（Hug → Fill，这个使用处） |
| `make-grid-and-phone-stack` | 卡片下面一个 `relative h-60` 的 Frame，四个 100 × 40 的自由定位方块，两行两列 | 桌面视图：选中四个按 ⇧A 合成 Grid（2 列，行间距 16px、列间距 24px）；手机视图：卡片的 Grid 改竖排（只在 768px 以下） | 1. Make Grid；2. Arrangement（Grid to Stack，断点，范围 2 段） |
| `areas-grid-phone-stack` | Surface 640px 起按 areas 摆卡片，最后一张在最前（Tailwind 任意值，和 109 follow-up 的剧本同一套） | 手机视图：卡片的 Grid 改竖排（只在 768px 以下），说明里有「Placed in the Grid」那行 | 1. Arrangement（Grid to Stack，断点） |

每条的页面预期（`shows`）：
- Header：`display: grid`、3 列、行列间距 12px，标题和 Beta 徽章还在里面。
- Fill：390px、1280px 下循环的三张卡片和格子一样宽（1px 内），第四张（Your turn）比格子窄。390px 时格子比卡片的内容宽，这一宽度才分得出 Hug 和 Fill；1280px 时长文字的卡片本来就撑满格子。
- Make Grid：四个方块的父元素是 `display: grid`、2 列、16px / 24px，只装这四个，方块不再 absolute，每个离 Frame 的左上角和原来一样（1px 内），390px、1280px 都看。
- 手机竖排（两个场景）：390px、700px 是 flex 竖排、16px 间距（按 areas 的那个还要从上到下按写的顺序）；1280px 仍是 Grid（普通的 3 列；按 areas 的 `grid-template-areas` 还在、Your turn 在第一行）。700px 夹在 `sm` 和 `md` 中间，断点写错一档就看得出。

**数**

- `--dry`：main bbb03a6 上 25/25；分支 28/28。
- `--scripted`：分支 19/19（原来 16 个加 3 个），新的 3 个每条都是页面显示、`done` 核对 shown、报告没有 ⚠️，`finish` 全打 ✓。
- `--dry --claim-out`：main bbb03a6 上 25 份、分支上 28 份；原来 25 个场景逐个 `cmp`，逐字相同。`done` 的说法来自包里的代码，包没改。
- `pnpm typecheck` 过；`pnpm test` vitest 1145 过 1 跳过，node 125 过；`TK_E2E_PORT=6100` 跑 `bench-scenarios.spec.ts`（`--project="project files" --no-deps`）28 过，跑完 `git status` 里没有留下示例的改动。整套 e2e 没跑（指挥 review 后跑）。端口：`TK_BENCH_PORT=5540`。
- 没跑真 Agent。验收框里真 Agent 那一框没打勾，等下一次复验；「e2e 全过」那一框等指挥跑完整套再打。

**代定的事（待设计师确认）**

1. 怎么分：5 种改动放进 3 个场景，不是 5 个。都放在 React 19 + Tailwind v4 的示例上。一个场景里放两条互不影响的改动（不同的元素、不同的文件），省真 Agent 的次数：Claude 每场景 2–3 次、pi 3 次，3 个场景大约 15–18 次，5 个就要 25–30 次。
   - 按 areas 的那个单独一个场景，因为它和普通的手机竖排改的是同一个 Grid。
   - ⇧A 和普通的手机竖排放在一起：⇧A 在桌面视图里做，手机竖排在手机视图里做。
   - 格子 Hug 改 Fill 和桌面 Stack 转 Grid 放在一起，都在桌面视图里。
2. `variableKept`：Header 转 Grid、两个手机竖排的间距都按值对上了 spacing 的 Variable（`3`、`4`），说明里有 Variables 一行。Agent 照样留着原来的 `gap-3` / `gap-4` 就是对的，但 `usesVariable` 只认 diff 里加的比删的多，改写的那一行带着原来的类，算不上「用了」。标 `variable` 的话，写对的 Agent 会被算成没用 Variable，所以这三条标 `variableKept`，不算进使用率。
   - 考虑过的别的做法：设计师在这一轮顺手改间距，换成新的 Variable。没这样做，因为会改掉票里写的那几种改动。
   - ⇧A 那条的间距没有对上 Variable（16px / 24px），说明里只有 Tailwind 写法 `gap-x-6 gap-y-4`，所以也不写 `variable`。
3. 「再改列数」改成 3 列，不是 1 列：转 Grid 推算出来是 2 列，改成 3 列以后 Agent 照推算写 `grid-cols-2` 就看得出（同一视图里的列数并进转换那一条，109 代定 7）。Header 只有两个子图层，3 列时第三格是空的，不影响核对。
4. 格子 Fill 选的是循环的卡片（第一个 Card 的使用处），和 109 的剧本一样。这样也考 Agent「只改这个使用处」：第四张卡片得留着 `w-fit`。`apply` 照剧本把 Card 的类写成按 `title` 二选一。
5. 场景的 id 用英文短名：`stack-to-grid-and-cell-fill`、`make-grid-and-phone-stack`、`areas-grid-phone-stack`。三个场景排在 `SCENARIOS` 末尾，所以 `STANDARD_SCENARIOS` 里另两个示例的 4 个场景往后挪了，真实跑的顺序跟着变。

**遗留风险**

1. 真 Agent 没跑过，要等下一次复验（Claude、pi 各 3 次，见上面的验收框），开跑前问设计师额度。「Placed in the Grid」「Making a Grid」「Sizes in a Grid」这几行英文说明，真 Agent 第一次读到就在那时。
2. 场景数从 24 变成 28：下次复验的合计不能直接和 88 的比，要按场景分开，或只拿原来 24 个比。
3. `variableKept` 的三条，Agent 要是把间距改成任意值（`gap-[12px]`），测量台的设计变量使用率看不出来，只有页面预期（间距对）照样成立；要看 diff 人工核。
4. Make Grid 的页面预期要求每个方块离 Frame 的左上角和原来一样，Grid 的位置照说明写成 absolute（`left-[20px] top-[30px]`）。Agent 用别的办法摆到同一位置（例如 Frame 的内边距）也算对；画面要是挪了 1px 以上，就会判没显示，即使 `done` 的核对说 shown（110 的核对不比 Grid 自己的 X、Y，110 代定 8）。这种情况结束时看 diff 人工核。
5. Fill 那条的页面预期按宽度判：390px 下 Hug 的卡片宽度要是接近格子（字号、字体变了），可能分不出来。现在 Hug 的卡片比格子窄，`--dry` 时判没显示。
