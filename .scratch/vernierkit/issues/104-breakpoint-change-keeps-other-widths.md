# 104: 断点上的改动，页面也核对范围外的宽度没被改到

**What to build:** 平板、手机视图里的改动只在那个断点的宽度范围里生效（ADR 0008），范围外的宽度应该照旧。页面核对今天只在范围里的宽度看这条改动显示了没有，范围外的不看（`widthsOf` 对有断点的改动只给范围里各段的宽度）。于是 Agent 把范围外的值也改了，`done` 仍说「shows the change」，Agent 列在 ✓ 下：虚假的 ✓。

ticket 88 的复验（2026-11-05，pi 一侧）碰上了一次：`phone-breakpoints` run-3 第 1 条，手机断点上循环里三张卡片填红，768 及以上四张都是白。pi 给 Card 加了 `fillClassName` 参数、默认 `bg-white`，在使用处传 `fillClassName="max-md:bg-[#FF0000]"`，把默认的 `bg-white` 整个换掉：768 以下是红的，768 及以上卡片没有填色（透明）。`done` 三次都说显示了。原始记录在主检出的 `bench-results/agents/2026-11-05T04-55-44-946Z/pi/phone-breakpoints/run-3/`（git 忽略）。这不是 97–101 带来的，88 里只是没碰上。

要做到：断点上的改动，页面除了在范围里的宽度看它显示了，还在范围外的宽度看这项属性和认领时一样；不一样就算没显示，`done` 说出在哪个宽度、从多少变成了多少，让 Agent 把范围外改回去。做法照 ticket 77 核对「只改这一处」时其他使用处的那一套（认领时记下值，之后变了就算没落地），不另起一套。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准（「断点」「视图」），并遵守 docs/adr/ 中的决策（ADR 0006 和它的 Consequences、0008、0011、0013）。

**Blocked by:** 无

**Status:** done

- [x] 先复现，用脚本剧本（脚本扮演 Agent，照 pi run-3 那样写）或单元测试，在没改的代码上看着 `done` 说显示了；再加一个范围外的值被改了的别种写法（例如 Tailwind 断点前缀写反、CSS 文件里 `@media` 写错范围）
- [x] 范围外的宽度：认领时（或这条改动第一次核对前）在每个范围外的视图宽度记下这项属性的值；之后在那里变了，这条改动算没显示，`done` 说宽度、改前、现在的值，说明这条改动只在哪个范围生效
- [x] 这一轮里同一个图层同一项属性在范围外另有改动的（例如桌面视图也改了填色、或别的断点也改了），那些宽度照那条改动核对，不按「保持原样」算；不出新的「没显示」误报
- [x] 不出新的虚假的 ✓：审查重点看这一条
- [x] `--dry` 24/24、`--scripted` 全过；其余 `done` 的输出逐字不变（只有范围外被改了的那种变）；切换按钮的包逐字节不变
- [x] 性能 headless 前后对比（`TK_PERF_HEADLESS=1`）：范围外多看几个宽度，不能让核对变慢到看得出（ADR 0011）
- [x] GLOSSARY、ADR 0006 的 Consequences、spec 需要时跟着改

## 背景

- ticket 88 复验的 pi 一侧（2026-11-05），结果记在 ticket 88 的「复验结果：pi 一侧」。虚假的 ✓ 是 goals 里最要紧的一条，设计师定在发布前修。

## 设计师决定（2026-11-05，分诊）

- 选做法 1：开 ticket，发布前修；先用脚本剧本复现，不跑真实 Agent。
- 考虑过的别的做法：放到发布后再修；不修，记作风险。
- 额度紧：会话和所有子 agent（含审查）都用 effort medium。

## Comments

**做了什么（起点 68004b3；提交 706b27a 实现，fb2a869 文档和性能用例，ffbeb6e 审查补修，f0b69a0 切换按钮逐字节不变）**

- 照 77 那一套，不另起：页面开始核对认领的一轮时，断点上的样式改动在每个范围外的宽度（页面窗口的宽度、每个视图的宽度，在范围外的那些）记下图层每个实例这项属性的值（设计语言），和 77 记的放在一起（`OtherUsagesNote.outside`），随认领存进 `.03kind/other-usages.json`。窗口以外的宽度在页面副本上读，副本先备好、等样式表载入一次。
- 之后每次核对这条改动、范围里显示了时再读：有一个实例的值不在记下的值里，就算没显示。认领后每次热更新的快速复查只比窗口宽度；`done`、`finish` 问的时候每个宽度都比，副本还在载入就答 loading，载入后再看（和范围里的副本一样）。
- 不比的宽度：这一轮在那个宽度另有改动改同一图层的同一属性（桌面视图、别的断点、组件本身；同一属性或参考样式有相同 CSS 属性），那里按那条改动核对。
- `done`：「Checked on the page: it shows the change, but outside its range too: at 1280px wide, its fill from #FFFFFF to no fill; at 768px wide, its fill from #FFFFFF to no fill since the round was claimed. The change applies below 768px only (`max-md:`): make it there alone, put the other widths back as they were, and run `npx 03kind done 1` again.」`finish` 开头一行加「Shown outside its breakpoint's range too: 1.」，报告放 ⚠️，Why 先填好「the page shows it outside its range too, at 1280px wide, its fill from #FFFFFF to no fill; …」；进度环、归档都不算它。
- 新代码：`check.ts` 的 `outsideOf`、`valuesAt`、`changedAround`；`other-usages.ts` 的 `noteChange`、`noteOutside`、`outsideChanged`、`unnoted`；`page-checks.ts` 接上；新类型在 `outside-protocol.ts`（见代定 9）。GLOSSARY「核对」、ADR 0006 Consequences、spec 的核对一节和性能一节随之改。

**复现和前后的 `done`**（`e2e/tests/applying-bench.spec.ts` 末尾新加「a change at a breakpoint, the widths outside its range kept (ticket 104)」4 个剧本，脚本扮演 Agent，`TK_E2E_PORT=5800`，窗口 1280px，平板视图 768px）

| 剧本 | 改前（68004b3） | 改后 |
|---|---|---|
| pi run-3 的写法：Card 加 `fillClassName` 默认 `bg-white`，循环传 `max-md:bg-[#FF0000]`（768 及以上没有填色） | 「Checked on the page: it shows the change.」/ shown / ✓ / 进度环 1 / 归档 applied [1] | 上面那段 / not shown / ⚠️ / 0 / [] |
| 循环的卡片写成不带断点的 `bg-[#ff0000]`（每个宽度都红） | （未在改前单跑，范围里显示，同上会是 shown） | 「… at 1280px wide, its fill from #FFFFFF to #FF0000; at 768px wide, …」/ not shown / ⚠️ |
| 对照：正确写法 `bg-white max-md:bg-[#ff0000]` | shown | 「Checked on the page: it shows the change.」/ shown / ✓（无误报） |
| 对照：桌面视图填蓝、手机视图填红，Agent 写 `bg-[#2563eb] max-md:bg-[#ff0000]` | shown / shown | shown / shown（范围外按桌面那条核对，无误报） |

- 单元测试：`test/outside-widths.test.ts`（哪些宽度看，4 个）、`test/outside.browser.test.ts`（记下、比、例外、副本在载入、78 只在窗口宽度记，5 个）。
- 正确的断点写法在测量台：`--scripted` 15 个场景（含 r18-phone-and-stack、next-client-stack-breakpoint 的断点改动）全过；改前改后各存下 `claim`、`done`、`finish` 共 42 份（不提交的补丁），`diff -r` 逐字相同。

**性能**（`TK_PERF_HEADLESS=1 TK_PERF_PORT=5810`，5006 个元素的大页面，headless 只作前后比较；改前 68004b3，改后 1 是 fb2a869，改后 2 是审查补修后的 ffbeb6e/f0b69a0 只跑「a claimed round」5 个）

| 认领期间每次热更新的核对 | 改前 | 改后 1 | 改后 2 |
|---|---|---|---|
| 新加：手机断点上 3 条改动、96 张卡片（这个例子的 `sm` 是 560px，范围一段），最长一段 中位数 / 最差 | 10.6 / 26.7ms | 13.6 / 26.4ms | 11.9 / 26.1ms |
| 同上，每次热更新合计 中位数 / p95 | 25.0 / 61.2ms | 44.3 / 100.7ms | 31.1 / 74.6ms |
| 同上，核对自己的 long task | 1 个（50ms，gap applied） | 0 | 0 |
| 原有：96 张卡片的 3 条改动，最长一段 中位数 / 最差 | 15.0 / 26.6ms | 21.0 / 26.4ms | 16.7 / 18.9ms |
| 原有：只改一处的 3 条改动、95 张另一处，最长一段 中位数 / 最差 | 13.2 / 27.2ms | 20.6 / 23.5ms | 8.3 / 15.6ms |

- 范围外多读窗口和 768 两个宽度，每次热更新合计多约 6–20ms，分在各片里，最长一片没变长，没有核对自己的 long task（ADR 0011）。全套 16 个改前、改后 1 都通过。headless 数据噪声大，只看前后。

**体积**

- 切换按钮逐字节不变：`chunk-UQJRS7YD.js` 21575 B（sha256 cdd6f09d…）、`react.dev.js` 1423 B（c83849f1…），和 68004b3、ticket 98 记的一样。toggle-first.spec 9991 B、install.spec 10153 B gzipped（上限 10240 B；这两项在 ffbeb6e 的全量 e2e 里量的）。
- `editor.dev.js` gzip 114,716 → 115,724 B（+1,008）；`cli.js` gzip 44,037 → 44,264 B（+227）。

**测试**

- `pnpm typecheck` 通过；`pnpm test`：vitest 1026 个通过、1 个跳过，测量台和旧名检查的 node 测试 125 个通过。
- `TK_E2E_PORT=5800 pnpm test:e2e`（ffbeb6e，同步过 main）：page 303 个通过、1 个失败：`motion.spec.ts:168`（等画布 iframe 30 秒超时，负载下；单独连跑 3 次都过，和核对无关），因此 project files 没跑，`--project="project files" --no-deps` 补跑：139 个通过、1 个跳过。
- f0b69a0 只把新类型挪出 `service-protocol.ts`、`cli.ts` 等改用 `outsideIn` 读；之后重跑了 typecheck、vitest 全部、applying-bench 里 104/77/82 的 17 个剧本、`--dry`（24/24）和 `--scripted`（15/15，输出和改前逐字相同），没有再跑全量 e2e。

**代定的事（待设计师确认）**

1. 范围外看哪些宽度：页面窗口的宽度和每个视图的宽度里在范围外的，不按项目断点再切段（ticket 说「每个范围外的视图宽度」）。
2. 放置类属性（X、Y、右、下、是否自由定位）不看范围外：周围布局一变它们就跟着变，容易误报。
3. 尺寸（宽高及上下限）和文字类属性：这一轮在那个宽度另有可能改到它的改动时，那个宽度不比，免得把这一轮自己的改动当成 Agent 改错。「可能改到」：同一图层或外层的样式改动，尺寸看除纯绘制（填充、圆角、阴影、透明度、模糊、裁切、文字颜色和装饰）以外的，文字看文字类的；外层的结构改动都算。填充、描边、间距等其他属性不受这条影响，照比。
4. 循环的几个实例按值的集合比：某个实例现在的值不在记下的值里才算变。
5. `done`、`finish`、报告 Why 的说法如上；`finish` 开头单列一行，和 77 的「Shown at other usages」并列；同时漏到其他使用处时先说其他使用处。
6. 认领后每次热更新的快速复查只比窗口宽度（不用副本）；`done`、`finish` 问的时候每个宽度都比。
7. 页面替 Agent 认领（ticket 78）时只在窗口宽度先记（备副本要时间，代码已在变）；其他宽度之后能记时补记。
8. 记不上的宽度（副本还在载入、那时图层不在页面上、后来加的视图）之后能记时补记；补记的不另存进 `.03kind/`（那里同一条改动以先存的为准）。等副本载入只等一次，之后照常往下看别的改动（审查补修，免得整轮卡住）。
9. 新类型放在新文件 `outside-protocol.ts`，`service-protocol.ts` 一个字不改：它在切换按钮的共用 chunk 里，压缩器按这个 chunk 源文件的文字（含类型，不含注释）给变量取名，加一个类型就让切换按钮的变量名换了（体积不变、字节变），77 当时就是这样。`done` 和报告用 `outsideIn` 读这个字段。

**风险和没做到的**

- 补记的宽度可能在 Agent 改代码之后才记，漏改成了基准，查不出（不会误报）：78 的自动认领时窗口以外的宽度、刷新页面后没存下的补记宽度都是这样。
- 只看窗口和视图宽度：两者之间的宽度改到了查不出（例如手机改动写成 `max-xl:`、窗口 1280，1024–1279 之间没有视图）。
- 代定 3 的例外会漏掉一些：这一轮另外改了外层或本层的尺寸、文字相关属性时，那个宽度上的尺寸、文字类漏改查不出。
- 循环实例按值的集合比，实例之间值互换查不出。
- 漏改时 `done` 要等到时限（约 1.5 秒）才答，和其他没显示的一样。
- `motion.spec.ts:168` 在全量负载下超时一次，以前不在偶发名单里，单跑都过。
- headless 性能只作前后比较；窗口模式没跑（会抢焦点）。
