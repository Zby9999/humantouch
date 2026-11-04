# 87: 标准场景补全：React 18 + Tailwind v3、Next.js + CSS Modules，和常见的代码写法

**What to build:** 测量台现在只在 Vite + React 19 + Tailwind v4 示例上跑。README 写了支持 React 18 / 19、Vite 或 Next.js 16 以上（App Router）、Tailwind v3 / v4、普通 CSS 和 CSS Modules。让测量台能在仓库里另外两个示例上跑标准场景，并把真实项目里常见、示例里还没有的代码写法加进来，Agent 验收才算覆盖了常见情况。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 无

**Status:** done

- [x] 测量台能换示例项目：每个场景说明在哪个示例上跑；Vite 示例照旧，Next.js 示例要能起开发服务器、等它就绪、在它上面核对（e2e 里已有 Next.js 的安装和落地测试可以借用）。现有场景照旧在 React 19 + Tailwind v4 示例上，id 和预期不变
- [x] **React 18 + Tailwind v3 示例**的场景：设计变量来自 `tailwind.config.js`；至少覆盖样式改动（填色、间距、圆角、字号）、一条断点改动、一条结构改动（新建 Stack 或重排）
- [x] **Next.js + CSS Modules 示例**的场景：样式写在 `.module.css` 里（落地时改 CSS 文件，不改成 Tailwind 或行内样式）；Server Component 和 `'use client'` 组件各有改动；至少覆盖样式改动、一条断点改动、一条结构改动、改字
- [x] **常见代码写法**，示例里没有的就加（只加，不改现有页面上已有的东西，免得现有测试的图层树变了；改了要说明为什么，并同步改那些测试）：用 `cn()` / `clsx` 拼 className、按 props 选样式的组件变体（例如 `variant="primary"`）、同一个组件用了好几次时只改一个使用处、条件渲染出来的元素
- [x] 每个新场景 `--dry` 空跑：都做得出改动，页面上一条都还没显示；再用脚本扮演 Agent 写对的代码跑一遍，每条都显示了
- [x] 原有测试全过；切换按钮的包逐字节不变
- [x] 不跑真实 Agent

## 背景

- 设计师决定（2026-11-03）：Agent 验收要尽可能覆盖所有常见情况。Design 面板和流程上的缺口在 ticket 86，两张 ticket 互不依赖，可以同时做；都会往场景清单里加东西，后合的那条线要同步先合的那条。
- 示例项目也被很多 e2e 测试用着（spec 里写着功能测试用小示例），加东西前先看哪些测试按图层名、文字或结构找元素。

## 设计师决定（2026-11-03，分诊）

- 尽可能覆盖所有常见情况；任务由规划会话来拆。

## Comments

**实现记录（2026-11-03）**

*结论*

验收项都做到了。测量台能换示例项目：场景多了 `example`（不写就是 React 19 + Tailwind v4 示例），每个用到的示例各准备一份 base（拆掉仓库里手接的 03Kind，再用 `init` 从打好的包装上），开发服务器按示例起 Vite 或 `next dev`（Turbopack）并等它就绪。新加 4 个场景，放在新文件 `e2e/bench/scenarios-other-examples.ts`，`STANDARD_SCENARIOS` 是原来 10 个加这 4 个。原来 10 个场景的 id、预期和设计步骤一字没改（`scenarios.ts` 只多了导出、`example`、`apply` 和 `saved()` 的一处等待条件，见下）。`packages/` 没有改动，切换按钮的包逐字节不变。没有跑真实 Agent。

*新场景*

| id | 示例 | 改动 | 覆盖 |
|---|---|---|---|
| `r18-style-variables` | vite-react18-tw3 | Pricing 标题字号 44px（`text-display`）；条件渲染的 Save 20% yearly 标签圆角 14px（`rounded-card`）；按钮行间距 22px（`gap-gutter`）；Compare plans 填 #EEF4FF（`bg-brand-50`），只改这一个使用处；`cn()` 拼 className 的那行字号 19px（`text-lead`） | 样式改动（字号、圆角、间距、填色），设计变量来自 `tailwind.config.js`；`cn()`、按 `variant` 选样式的 Button（用了三次，Talk to us 也是 secondary，只改 Compare plans）、条件渲染 |
| `r18-phone-and-stack` | vite-react18-tw3 | 手机断点（项目的 `max-sm:`，560px 以下）标签填 #DBE6FF（`bg-brand-100`），在 390、768、1280 核；标题和标签合成新 Stack（纵向，gap 16） | 断点改动、结构改动（新建 Stack），条件渲染的元素进 Stack |
| `next-server-usage-text` | next-app-css-modules | 第二个 Stat 填 #E8F0FF，只改这一个使用处；第三个 Stat 改字（label 改为 “bytes shipped to production”）；手机断点（`(max-width: 767px)`）stats 网格改 1 列，在 390、768、1280 核 | Server Component 上的样式、改字、断点；同一组件用了三次只改一处；落地改 `.module.css` |
| `next-client-stack-breakpoint` | next-app-css-modules | Yearly 选项（当前选中，className 用模板字符串按条件拼）填 #DBEAFE；条件渲染的 Two months free 提示圆角 12px；手机断点隐藏这条提示；Billing 标题和选项行合成新 Stack（纵向，gap 12） | `'use client'` 组件上的样式、断点、结构改动；条件渲染；落地改 `.module.css` |

Next 两个场景每条改动的预期都写明改在哪个 `.module.css`，不改成 Tailwind 类或行内样式。

*示例里加的东西（都只加，放在已有内容之后）*

- vite-react18-tw3：新文件 `src/lib/utils.ts`（`cn()`，shadcn 那种写法，不带 tailwind-merge）、`src/components/Button.tsx`（`variant` 选样式）；`src/App.tsx` 在卡片之后加一个 Pricing section（h2、`yearlySaving > 0 &&` 条件渲染的标签、用 `cn()` 的一行字、三个 Button）。
- next-app-css-modules：新文件 `components/Stat.tsx` + `Stat.module.css`（Server Component）、`components/BillingPicker.tsx` + `BillingPicker.module.css`（`'use client'`，useState，`{yearly && <p>}`）；`app/page.tsx` + `page.module.css` 在卡片之后、footer 之前加 `.stats` 网格和 BillingPicker。
- 加之前核过各测试的找法：没加 `article`、`Card`、`h1`，React 18 没新增 Grid 和主题值，Next 没新增媒体查询以外的东西；`Card` 计数、`article` 的个数和顺序、`Stack.nth(1)`、`treeitem.nth(1)`、变量面板的「This project」分组、项目断点读取都不受影响。没有改任何已有测试的断言。

*测量台的改动*

- `Scenario.example`、`Scenario.apply(desk)`（脚本扮演 Agent 写对的代码，只通过 `desk.edit`）。
- `pnpm bench:agents --scripted`：先做 `--dry` 的全部检查，然后 `claim` → `apply` → 等页面显示（最多 30 秒）→ `done` 全部改动 → `finish` → 重新加载页面。以下任一条就算失败：改动自己的测试在它的宽度上没显示；改动没有自己的测试（Brief 除外）；可核对的改动在 `result.json` 里的核对不是「shown」（缺了、没及时回答也算）；带设计变量的改动在 diff 里没写那个变量（按 `usesVariable` 数）。这和 ticket 86 分支上的 `--scripted`（`apply` / `applyScripted`）同名同义，后合的那条线只需合并实现。
- `saved()` 等断点 parts 的条件从 `!parts` 改成 `parts === null`：只有一段的断点范围本来没有 parts（React 18 和 Next 的手机断点都是），原来的写法会一直等。React 19 示例照旧等到读完（03Kind 在保存前同步把 `parts` 设成 null）。
- 端口：从 `TK_BENCH_PORT`（默认 5620）起 30 个，两个 checkout 同时跑测量台可以分开（这次就撞见另一条线同时在 5620 段跑）。
- `next dev` 加 `--hostname localhost`、`NEXT_TELEMETRY_DISABLED=1`；显式给 `--port` 时 Next 不换端口，只另占 03Kind 服务的随机高位端口。
- `install-copy.ts` 的 `stop()` 返回 promise，等进程退出（5 秒后 SIGKILL），进程已退出时不再报 `kill ESRCH`；测量台在删项目副本前等它，删副本放在自己的 `finally` 里。`install.spec`、`next-install.spec` 也等开发服务器退出（原来会在临时目录留下副本）。
- `e2e/tests/bench-scenarios.spec.ts`：14 个场景各在自己示例的 dev server 上核「做得出改动、都还没显示」，测完还原场景改过的源文件；`project-files.ts` 多了 `npx03kindIn(dir)`。

*审查（code-review，effort high）后修正*

1. 和 ticket 86 的 `--scripted` 对齐：字段改叫 `apply`，失败条件照 86 的严格版本（见上）。
2. `r18-style-variables` 第 5 条原来永远数不到设计变量：第 1 条把 `text-lead` 从标题上拿掉、第 5 条加到那行字上，`usesVariable` 看到 +1/−1。标题改为从 `text-xl` 起。
3. `r18-phone-and-stack` 的变量改为 `bg-brand-100`（移动优先的写法也算）。
4. Yearly 原来填 #1C1917，深色字压在深色底上，改为 #DBEAFE。
5. Next 场景的预期写明改 `.module.css`。
6. 开发服务器进程和临时目录的清理（见上）；`TK_BENCH_PORT`；`next dev` 只听 localhost。

*验证（同步 main 到 a9576e0 / 9590acc 之后，即 ticket 85 合进来以后）*

- 合并冲突只在 `run-agents.ts` 的参数段（85 把 `--agents` 默认改成 `claude,pi`、`out` 改成绝对路径；本线加了 `--scripted` 和 `STANDARD_SCENARIOS`），两边都保留。
- `pnpm typecheck` 通过。
- `pnpm test`：vitest 34 个文件 818 通过、1 跳过；node 测试 65/65。
- `TK_E2E_PORT=5400 pnpm test:e2e`：第一次跑 page 项目里 `create.spec.ts`「a double click on the selected text types in it」失败一条（双击改字，收到的仍是旧字；不在已知会抖的名单里，但本线没碰 React 19 示例和 `packages/`），后面 115 条因依赖没跑；单独重跑 3 次都过，整套重跑 402 通过、1 跳过、0 失败。切换按钮体积检查（install.spec、toggle-first.spec）在里面，通过
- `TK_BENCH_PORT=5440 pnpm bench:agents --dry`：14 个场景全部 ✓（做得出改动，页面上一条都还没显示）。
- `--scripted`：4 个新场景全部 ✓（每条都显示了，可核对的都核为 shown，带变量的都写了变量）。原来 10 个没有 `apply`，不在脚本跑里。
- 前后合盖状态都是开着（`AppleClamshellState = No`）；没跑计时的性能测试。

*03Kind 本身的问题*

- 改字的改动在页面上核对不了时，`done` 说的是结构改动那句原因（`check.ts` 的 `uncheckable()` 落到兜底）。已在 main 上开 ticket 90（938d005，needs-triage），这里没修。
- Next/Turbopack 下 "Currently set by" 给的是打包后的类名和 chunk 地址（如 `BillingPicker-module__nW0Cta__selected`、`_next/static/chunks/….css`），不是 `.module.css` 文件。这是 ticket 09 已记的限制（Skill 有一条 CSS Modules 的说明），没再开 ticket；ticket 88 跑 Next 场景时留意它对工具调用数和全仓搜索的影响。

**代定的事（待设计师确认）**

1. 脚本跑的参数叫 `--scripted`，场景字段叫 `apply`，和 ticket 86 分支上的同名同义；没有 `apply` 的场景（原来 10 个）不在脚本跑里，不算失败。
2. `--scripted` 在 `done` 之前最多等 30 秒让页面带上新代码（Next 带得慢）；86 是直接 `done`。
3. 新场景放在单独的 `scenarios-other-examples.ts`，免得和 86 往 `scenarios.ts` 加的场景撞上；场景 id 用示例前缀（`r18-`、`next-`）加改动类别。
4. 每个示例的 base 先拆掉仓库手接的线再 `init`；React 18 示例的 `src/big/BigPage.tsx` 也挂着切换按钮，一起拆，`init` 之后挂在 `src/main.tsx`。Next 的开发服务器用 Turbopack（它的默认），不用 webpack。
5. 设计变量只用 `tailwind.config.js` 里已有的值（display、card、gutter、brand-50、brand-100、lead），没有新加主题值（变量面板的测试列着项目颜色）；标题起始字号用 Tailwind 默认的 `text-xl`，不是主题值，免得场景的变量有歧义。Next 示例没有设计变量，它的改动不写 `variable`。
6. 常见写法的分布：`cn()` 和 `variant` 在 React 18 示例；Next 用模板字符串按条件拼 className，没有引入 clsx（免得改 lockfile、要联网装）；「同一组件只改一处」两个示例都有（Button、Stat）；条件渲染两个示例都有。
7. Yearly 选项的预期：改 `.selected` 规则或只改 Yearly 都算对（页面在 Yearly 选中时核对）；填色用 #DBEAFE，而不是加一条文字颜色改动。
8. 新 Stack 的 gap（React 18 16px、Next 12px）按 03Kind 记在改动单里的值核对。
9. 测量台端口可用 `TK_BENCH_PORT` 改，默认仍是 5620；不在代码里写死本机其他线的禁用端口。`stop()` 等 5 秒再 SIGKILL。

**遗留风险**

1. 脚本对不对只由 `--scripted` 验证，e2e 只核「做得出、还没显示」那一半；03Kind 或示例以后变了，脚本可能失效而没人发现，要有人跑 `--scripted`。
2. 和 ticket 86 合并：两条线都加了 `apply`、`--scripted`，名字和意思一样，但 `run-agents.ts` 里各有一份 `applyScripted`、`setUp`、`withScenario`（本线的带示例），后合的那条线要合成一份，86 的 `designProblems` 并进 `setUpProblems`、报告检查照 86 的留下。
3. Next 冷启动慢：机器忙时 e2e 的 120 秒超时、测量台 180 秒的就绪等待可能不够。
4. Next 场景「改 `.module.css`，不改成 Tailwind 或行内样式」只写在预期里，测量台没有按 diff 数它；ticket 88 看 diff 时要人工核。
5. `--scripted` 不覆盖原来 10 个场景（没给它们写 `apply`，免得和 86 在同一批条目上冲突）。
6. 加第四个示例要改几处（`HAND_WIRED`、就绪等待、spec 里的服务地址等），没合成一张表。
7. 没跑真实 Agent（属于 ticket 88）。
