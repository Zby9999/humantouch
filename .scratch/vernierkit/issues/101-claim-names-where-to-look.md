# 101: `claim` 写明其他使用处、类名合并工具和正文样式在哪

**What to build:** ticket 88 的真实跑里，两家都没达到 goals 的「0 次全仓搜索」：Claude 50 次跑里 9 次共 15 次，pi 72 次跑里 23 次共 46 次。多数出在 `claim` 的说明留了空：

- 「This usage only」只说「Other usages stay as they are」，没说其他使用处在哪，Agent 去搜；
- 说「the project's class-merging helper, if it has one」，没说项目到底有没有，Agent 去搜；
- 新文字没说正文样式从哪来（字体、字号设在哪），Agent 去搜。

其余是 pi 列目录、读 Tailwind 内部文件。要做到：`claim` 在这三处直接给出答案（文件和行，或「没有」），让 Agent 不用搜。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 无

**Status:** done

- [x] 「This usage only」写明其他使用处的文件和行
- [x] 写明项目有没有类名合并工具（有的话是哪个、在哪）
- [x] 新文字写明正文样式从哪来
- [x] `--dry --claim-out` 前后对比，只多了这三种信息；`--scripted` 全过
- [x] 组件用的地方很多时怎样列（列几处、其余怎么说）由这条线代定，`claim` 不因此变得很长
- [x] 测量台的名单（Claude 和 pi 两家）放行只打印的 `echo`，带 `>`、`>>` 写文件的照挡（ticket 88 代定第 3 条，设计师 2026-11-05 定）；名单的单测跟着加

## 背景

- ticket 88 真实跑（2026-11-05），原始记录在 88 线的 `bench-results/agents/88-real/`。
- 88 的结论里还有一个可选做法：Skill 第 2 步加一句「The notes name the file and line of each change: read those, and search the project only where a section says the layer is not located.」。88 倾向先修 `claim` 这三处，再看 pi 的数；要不要也加这句，分诊时定。
- 要看改了有没有用，得再跑真实 Agent（用设计师的额度）；分诊时定跑不跑、跑几次。

## 设计师决定（2026-11-05，分诊）

- 选做法 1：ready-for-agent，和 100 交给同一条线，先做 100 再做 101，现在开线（和 97、98、99 并排）。
- Skill 第 2 步那一句这次不加：先修 `claim` 这三处，再看对照数据（88 的结论）。
- 名单放行 `echo` 放进这条线（88 代定第 3 条）。
- 不跑真实 Agent；要不要复验、跑几次，等这条线做完再定。
- 考虑过的别的做法：同时加 Skill 那一句；先只做 100，101 以后再说。

## Comments

**实现记录（2026-11-05）**

`claim` 打印说明时读一遍项目源码（新模块 `packages/03kind/src/where-to-look.ts`），把三样东西写进说明；Skill、`done`、页面核对、编辑层（toggle）都没动。只在说明本来提到它们的地方说，没找到可信的答案时照旧说原来那句。

1. **其他使用处**（**Scope** 一行，「This usage only」时）：用源码标记同一套解析（`source-marker.ts` 新加的 `openingTags`，和 `markSource` 一样的 Babel 解析、一样的 `file:line:column`），扫项目里的 JSX，找打开这个组件的元素。`claim` 原来并不知道别的使用处：使用链（`chain`）只有这一处，页面在核对时（`other-usages.ts`）也只看当前页面上的使用处。文件从 `git ls-files -co --exclude-standard` 取（不在 git 里就自己走目录，跳过 `node_modules`、隐藏目录和构建目录），自带 `package.json` 的子目录（vendored 包）不算。先用正则筛出含 `<Card` 的文件再解析。
2. **类名合并工具**（**How to write them** 的「This usage only」那条，原来是「if it has one」）：不搜索。依次看：这一轮改动涉及的文件（Location 和使用处所在文件）import 的 `cn` / `cx` / `clsx` / `classNames` / `twMerge` / `twJoin`（相对路径、`@/`、`~/`，`.js` 写法也找到 `.ts`）；常见位置（`src/lib/utils`、`lib/utils` 等 9 处）；`package.json` 的依赖（`tailwind-merge`、`clsx`、`classnames`）。定义所在文件 import 了 `tailwind-merge` 才算合并。
3. **正文样式**（新文字的 **Design intent**）：项目自己的样式表（CSS Modules 不算）里 `body` / `html` 上设了字体、颜色、行高、字距或 `@apply` 的规则（`@media` 等里面的不算，`@layer` 里的算），JSX 里 `<body>` / `<html>` 的 `className`，HTML 页面（Vite 的 `index.html`）里 `<body>` / `<html>` 的 `class` / `style`。

**说明的变化**（`--dry --claim-out`，`TK_BENCH_PORT=5620`，24 个场景；`diff -r claim-after-100 claim-after-101`，只有这三种）

- 其他使用处（cards-style、data-and-text、fill-gap-brief、phone-breakpoints；next-server-usage-text、r18-style-variables 类似）：

  > 改前：… It renders 3 instances, which change together. Other usages of Card stay as they are.
  >
  > 改后：… It renders 3 instances, which change together. Other usages of Card stay as they are: `src/App.tsx:41:9`.

  只有这一处时（next-client-stack-breakpoint 的 BillingPicker、third-party 的 Badge）：

  > 改后：… Badge has no other usage in the source. The layer is drawn by a dependency: …

- 类名合并工具（有「This usage only」的 9 个场景）：

  > 改前：… make the component's class a default the usage can replace (a prop, or the project's class-merging helper, if it has one).
  >
  > 改后（Vite + React 19、Next 两个示例）：… (a prop; the project has no class-merging helper).
  >
  > 改后（r18-style-variables，React 18 示例的 `cn` 只拼接）：… (a prop; the project has no class-merging helper: its `cn` at `src/lib/utils.ts:2` only joins classes, keeping both of two that conflict).

  有合并工具时（单测里）：「(a prop, or the project's class-merging helper, `cn` at `src/lib/utils.ts:3`)」；只有依赖时：「`twMerge` from `tailwind-merge`」。

- 正文样式（put-back-and-new-text）：

  > 改前：… from what the page already uses for body text.
  >
  > 改后：… from what the page already uses for body text: the rule `body` at `src/index.css:9`.

  都没设时：「…: nothing in the project's source sets it, on `body` or `html`.」

**长度**（字节；before = 100、101 之前，after-100、after-101）

| 场景 | before | after-100 | after-101 |
|---|---|---|---|
| breakpoint-kept | 6497 | 6497 | 6497 |
| button-over-rule | 4838 | 4838 | 4838 |
| cards-style | 6496 | 6496 | 6543 |
| data-and-text | 5161 | 5161 | 5188 |
| dissolve-place-frame | 7258 | 7379 | 7379 |
| fill-gap-brief | 6869 | 6869 | 6876 |
| flow-end-halfway | 4529 | 4529 | 4529 |
| flow-undo-last | 98 | 98 | 98 |
| next-client-stack-breakpoint | 9604 | 9604 | 9591 |
| next-server-usage-text | 8666 | 8666 | 8743 |
| panel-padding-effects-opacity | 5717 | 5717 | 5717 |
| panel-size | 5550 | 5550 | 5550 |
| panel-text | 5760 | 5760 | 5760 |
| phone-breakpoints | 8027 | 8027 | 8034 |
| placement-kept | 9237 | 9237 | 9237 |
| promote-and-grid | 6442 | 6442 | 6442 |
| put-back-and-new-text | 6813 | 6813 | 6851 |
| r18-phone-and-stack | 6934 | 6934 | 6934 |
| r18-style-variables | 7436 | 7436 | 7556 |
| reorder-and-move | 3406 | 3406 | 3406 |
| tablet-breakpoint | 6524 | 6524 | 6524 |
| third-party | 5560 | 5560 | 5547 |
| type-and-stack | 6149 | 6149 | 6149 |
| variables | 6711 | 6711 | 6711 |

中位数 6496.5 → 6496.5 → 6510.5；最多 +120（r18-style-variables）。

**测量台名单放行 `echo`**

- pi（和脚本剧本、Cursor 共用的 `SHELL`，`e2e/bench/allowlist.ts`）：加了 `echo`。`shellAllowed` 原来的规则不变：重定向只许到 `/dev/null` 或另一个流，`$` 展开、`$( )`、反引号都挡，`tee` 不在名单。单测（`allowlist.test.ts`）：
  - 放行：`echo "---"`、`echo ---`、`cat a && echo "---" && cat b`、`cat a; echo ---; cat b`、`ls src | head -5; echo '---'`、`echo x > /dev/null`、`echo x 2>&1`、`grep … 2>&1 && echo "--- done"`。
  - 挡下：`echo x > f`、`echo x >> f`、`echo x | tee f`、`echo x 1> f`、`echo x &> f`、`echo x >| f`、`echo x>f`、`echo $(rm f)`、`` echo `rm f` ``、`echo "exit:$?"`、`echo $HOME`、`echo x > src/App.tsx && cat src/App.tsx`、`echo {a,b}`。
  - Cursor 的名单也跟着有了 `Shell(echo)`。它本来就允许 `Write(**)`，跑在沙盒里（只能写项目），不会更松。
- Claude（`e2e/bench/agents.ts` 的 `--allowedTools`）：**不加** echo 规则（`NOT_FOR_CLAUDE`），单测（`agents.test.ts`）钉住没有 `Bash(echo…)`。依据是 Claude Code 官方文档 [Configure permissions](https://code.claude.com/docs/en/permissions)（2026-11-05 读）：
  - 「Read-only commands」一节：内置只读命令集「includes `ls`, `cat`, `echo`, …」，在每种模式下不经询问就跑。也就是说 Claude 的 `echo` 本来就放行；88 的 50 次 Claude 跑里有 2 次 `echo`，都没被拦，对得上。
  - 「Redirections」一节：`> file`、`>> file` 的目标按「Claude 直接写这个文件」检查（Edit 规则、受保护路径、工作目录），并写明「A rule such as `Bash(git commit *)` allows the command, not the target」。
  - [Permission modes](https://code.claude.com/docs/en/permission-modes) 的 acceptEdits 一节：工作目录里的文件编辑自动通过，还自动通过 `mkdir`、`touch`、`rm`、`mv`、`cp`、`sed`。

  所以加一条 `Bash(echo:*)` 不改变任何事；`echo … > 项目里的文件` 挡不挡，取决于 acceptEdits 对重定向目标的处理，不取决于名单。按文档，这种写很可能自动通过，和 Claude 本来就能用 Edit/Write 写文件一样。我没跑 claude 去验证。

**测试**

- 新单测：`packages/03kind/test/where-to-look.test.ts` 18 个（使用处、忽略 `node_modules` / gitignore / vendored 包、合并工具的几种情况、正文样式的几种来源、`@media` 里的不算）；`packages/03kind/test/cli.test.ts` 加 10 个（`claim` 说明里的三处文字，含很多使用处时列 3 处、其余计数）；`e2e/bench` 加 2 个。都先跑红再改。
- `e2e/tests/autosave.spec.ts`：ticket 60 的旧改动单夹具比「每条改动的说明照旧」，现在多了其他使用处，期望里把那句换成带 `src/App.tsx:42:9` 的（注释说明 ticket 101）。
- `pnpm typecheck` 通过；`pnpm test`：vitest 35 个文件 968 passed / 1 skipped，node 125 pass。
- `TK_BENCH_PORT=5620 pnpm bench:agents --scripted`：15/15 ✓。`--dry`：24/24 ✓。
- e2e（无头，`TK_E2E_PORT=5600`）：`claim.spec.ts`、`applying-bench.spec.ts`、`bench-scenarios.spec.ts` 共 363 passed（含依赖的项目）；`autosave.spec.ts` 那条 1 passed。

### 代定的事（待设计师确认）

1. **很多使用处时**：最多列 3 处，其余写「and K more, in `a.tsx` and `b.tsx`」（文件超过 3 个只写「in N files」）。只有这一处时写「Card has no other usage in the source.」。
2. **使用处找不到时不列**：源码里找不到页面给的那一处（组件按别的名字用、源码已和页面不同），就照旧只说「Other usages of Card stay as they are.」，不给可能错的列表。「Usage not determined」那种情况也不列。
3. **按标签名认组件**：`<Card>` 和 `<X.Card>` 都算 Card 的使用处，不看 import。别的文件里另有一个同名组件时会多列。
4. **只拼接的 `cn` 不算合并工具**：React 18 示例的 `cn` 只是 `filter(Boolean).join(" ")`，说「the project has no class-merging helper: its `cn` … only joins classes, keeping both of two that conflict」。定义所在文件 import 了 `tailwind-merge` 才算合并。
5. **合并工具的查找顺序**：先挑会合并的；同样会合并时，改动涉及的文件 import 的优先，其次常见位置，最后依赖里的包。只在依赖里有 `tailwind-merge`、项目没自己的 helper 时，说「the project's class-merging helper, `twMerge` from `tailwind-merge`」。
6. **没有 `package.json` 的目录不看**：三样都不说，照旧（单测的临时目录就是这样）。
7. **正文样式只看 `body` / `html`**：规则（设了字体、颜色、行高、字距或 `@apply`）、JSX 的 `className` / `style`（审查时加了 `style`）、HTML 页面的 `class` / `style`。`:root`、Tailwind `@theme` 的 `--font-*`、外层 `<main className>` 不算。都没有时说「nothing in the project's source sets it, on `body` or `html`」：特意说了「on `body` or `html`」，免得读成哪里都没设。
8. **Claude 不加 echo 规则**（依据见上）。pi、脚本剧本、Cursor 的名单加 `echo`。

### 剩下的风险

- 有没有用要真实 Agent 复验。88 里 pi 的全仓搜索有一大半是列目录、翻依赖，这次不管。
- 「nothing … sets it」在第 7 条之外的项目里会说错：字体设在 `:root`、`@theme`、外层组件的 `className` 上。Agent 读到「没有」可能就不去找了。
- 同名组件会多列（第 3 条）；`export { cn } from "./cn"` 这样转出的 helper 认不出，会说成没有或只拼接。
- `claim` 现在要读一遍项目的 JSX（先用正则筛，含组件名的才解析）。示例项目感觉不到；很大的项目没测过耗时。只在这一轮有「This usage only」或新文字时才读。
- Claude 的 `echo > 文件` 挡不挡，是 Claude Code 自己的事（acceptEdits 下很可能放行），测量台管不了。没跑 claude 验证。
- `html { font-size: 62.5% }` 这种只设 rem 基准的规则也会被当成正文样式列出。

**审查修正（2026-11-05）**（`bf640e2`、`3dd723b`；24 个场景的 `--dry --claim-out` 和改前一字不差，长度不变）

- 只读项目里的文件：`../` 开头的 import、git 列出的指向项目外的链接都不读（原来会读）。
- 宁可不说，不说错：组件名出现在解析不了的文件（语法错、超过 2 MB）或 MDX / Astro / Vue / Svelte 里，就不列使用处，照旧那句；改动涉及的文件 import 的 helper 读不到（项目外、别名如 `#/`）时，照旧「if it has one」，不说「没有」；打开 `<body>` / `<html>` 的模块解析不了时，照旧不说正文样式。
- 项目在一个忽略它的 git 仓库里时，`git ls-files` 列不出文件，改为自己走目录（原来会什么都找不到）；git 不跑 fsmonitor，10 秒超时。
- `<valueOf />` 这类和对象自带属性同名的标签会让扫描抛错；已修。`claim` 里查找出任何错都照旧打印说明（原来会在轮次已认领后退出，之后每次 `claim` 都一样）。

### 复验会在哪些场景看到

- 其他使用处：cards-style、fill-gap-brief（pi 搜 Card），next-client-stack-breakpoint（pi 搜 BillingPicker），next-server-usage-text（pi 搜 Stat）；data-and-text、phone-breakpoints、r18-style-variables、third-party 也会显示。
- 类名合并工具：cards-style、fill-gap-brief、phone-breakpoints（Claude 搜 `twMerge|clsx`），r18-style-variables（只拼接的 `cn`）。
- 正文样式：put-back-and-new-text（Claude 搜 Georgia）。
- `echo`：pi 的被拦次数（88 里 34 次中有 18 次带它），各场景都会有。比较时看「不含被拦」那一列。

### 合并前验证（线的会话，2026-11-05）

- 分支同步 main（0ffc7dc，合进 5363ebf）后：`pnpm typecheck` 通过；`pnpm test` vitest 975 通过、1 跳过，node 125 通过；`TK_E2E_PORT=5600 pnpm test:e2e` 422 通过、1 跳过、0 挂、0 抖；`--scripted` 15/15 ✓；`--dry` 24/24 ✓。
- 审查（effort medium，按规划会话转达的设计师决定，审查也用 medium）修了 6 处，都在 101 的 `where-to-look.ts` / `cli.ts`（bf640e2、3dd723b，见 101 的「审查修正」）；修完 `--dry --claim-out` 和审查前一字不差。
- `claim` 长度（字节，同一台机器、同一种 `--claim-out` 目录；子 agent 表里「before」那列是另一次输出，绝对数差几十字节，增减一样）：

| 场景 | 两张 ticket 之前 | 合并前 |
|---|---|---|
| cards-style | 6522 | 6569 |
| data-and-text | 5209 | 5236 |
| dissolve-place-frame | 7283 | 7404 |
| fill-gap-brief | 6913 | 6920 |
| next-client-stack-breakpoint | 9626 | 9613 |
| next-server-usage-text | 8694 | 8771 |
| phone-breakpoints | 8051 | 8058 |
| put-back-and-new-text | 6827 | 6865 |
| r18-style-variables | 7480 | 7600 |
| third-party | 5578 | 5565 |

  其余 14 个场景没变。`diff -r` 只有 100 的那一行和 101 的三种信息。
- 复验：规划会话在 97–101 都合进 main 后按 88 的次数重跑全部 24 个场景（设计师 2026-11-05 定），这条线不跑。
- 合并前 main 又进了 98（a619e5a），再同步（fca58e2）后重跑：typecheck 通过；vitest 975 通过、1 跳过，node 125 通过；e2e page 组 300 通过、1 挂（`create.spec.ts:252` 双击输入，h1 仍是 "Third Kind"，单独重跑 5/5 通过，算偶发，以前没记过这一条），project files 组补跑 133 通过、1 跳过；`--dry` 的说明和同步前一字不差；`--scripted` 15/15 ✓。

## 设计师确认（2026-11-05）

- 代定 1–8 全部确认。第 7 条（正文样式只看 `body` / `html`）想过 Tailwind v4 在 `@theme` 里设字体的项目：说明说「没有在 `body` 或 `html` 上设」，但新文字本来就继承页面的字体，Agent 什么都不加结果也对，风险小。第 3 条多列同名组件，最多让 Agent 多看一眼。
- 合并后 main（c8bbd0d）验证同 100。复验同 100。
