# 100: `claim` 在「撤成 Frame」那条写明 margin 留着

**What to build:** ticket 88 的真实跑里，Claude 唯一的一条虚假的 ✓ 出在 `dissolve-place-frame` run-2：Stack 撤成 Frame 后，它去掉了段落的 `mt-4`，段落比画布高 16px，却列在 ✓ 下。`claim` 里「X、Y 就是 `left`、`top`，margin 留着」只写在「How the page checks」那一节，「Dissolving a Stack」那条没写。三次 Claude 里两次在这里犹豫；pi run-2 为弄清楚读了 03kind 的代码 12 次。同一轮里按钮那条的 `done` 已经提醒过要留 margin，Claude 加回了按钮的 `mt-6`，没改段落，所以 Agent 也有一份责任。

要做到：撤成 Frame 的说明本身写明定位怎么算、margin 留着（英文，和 `claim` 其余说明同一种写法），Agent 不用翻到核对那一节才知道。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 无

**Status:** done

- [x] `claim` 的「Dissolving a Stack」那条写明 `left`/`top` 怎么对应 X、Y，margin 留着
- [x] 不改 Skill（88 的结论：问题在 `claim`，不在 Skill）
- [x] `--dry --claim-out` 前后对比：只有撤成 Frame 的场景的说明变了
- [x] `--scripted` 全过

## 背景

- ticket 88 真实跑（2026-11-05），原始记录在 88 线的 `bench-results/agents/88-real/claude/dissolve-place-frame/run-2`。
- 要看改了有没有用，得再跑真实 Agent（用设计师的额度）；分诊时定跑不跑、跑几次。

## 设计师决定（2026-11-05，分诊）

- 选做法 1：ready-for-agent，和 101 交给同一条线，先做 100 再做 101，现在开线（和 97、98、99 并排）。
- 不跑真实 Agent；要不要复验、跑几次，等这条线做完再定。
- 考虑过的别的做法：同时在 Skill 第 2 步加那一句；先只做 100，101 以后再说。

## Comments

**实现记录（2026-11-05）**

只改了 `packages/03kind/src/writing-rules.ts` 里「Dissolving a Stack」那条的说明（`claim` 的 **How to write them**），Skill、`done`、页面核对、编辑层（toggle）都没动。撤成 Frame 记下的 X、Y 本来就是去掉 margin 后的 `left`、`top`（`structure-edits.ts` 的 `unstack`：位置减去 `marginLeft` / `marginTop`），这次只是在这条说明里把它说出来。

改前：

> give each layer `position: absolute`, the `left` / `top` given and its size. The page should look the same afterwards.

改后：

> give each layer `position: absolute`, its `left` and `top` the X and Y given, and its size; keep its margins: it is drawn at `left` and `top` plus its margins, so one taken off moves it by as much. The page should look the same afterwards.

用的是「How the page checks」里放置为绝对定位那句的说法（「its `left` and `top` the X and Y given」「drawn at `left` and `top` plus its margins」），两处一致。「How the page checks」那句没删也没缩：它在 `dissolve-place-frame` 里出现是因为第 2 条（按钮的 Y）是放置的改动，别的场景里放置、移动到自由定位的改动也靠它；撤成 Frame 页面不核对，单独一轮撤成 Frame 时「How the page checks」本来就不说 margin（新测试断言了这一点）。

**`--dry --claim-out` 前后对比**（`TK_BENCH_PORT=5620`，24 个场景）

- 只有 `dissolve-place-frame` 变了，只变了「Dissolving a Stack」那一行（`diff -r` 一处）。别的场景都没有撤成 Frame（`r18-phone-and-stack`、`next-client-stack-breakpoint`、`type-and-stack` 是合成 Stack，不走这条说明），一字未变。
- 长度：`dissolve-place-frame` 7283 → 7404 字节（+121）。

**测试**

- `packages/03kind/test/cli.test.ts` 加 1 个：「a Stack dissolved: its rule says each layer's `left` and `top` are its X and Y and that it keeps its margins, without how the page checks a layer placed absolute (ticket 100)」。先跑红（旧说明），改后绿。原有的「Dissolving a Stack」/「Sizes」名目测试照旧通过。
- `pnpm typecheck` 通过。
- `pnpm test`：第一次冷缓存有 7 个 vitest 浏览器文件没起来（iframe 60 秒没就绪），整套重跑 34 个文件全过，940 passed / 1 skipped；`node --test` 123 pass。
- `TK_BENCH_PORT=5620 pnpm bench:agents --scripted`：15/15 ✓（`dissolve-place-frame` 没有剧本，不在其中）。
- `TK_E2E_PORT=5600 pnpm exec playwright test -c e2e/playwright.config.ts e2e/tests/stack.spec.ts`（无头）：5 passed。没有 e2e 断言这条说明的文字。

### 代定的事（待设计师确认）

1. 不给例子（没写「such as `mt-4`」）：`claim` 的说明对 Tailwind 和 CSS 文件的项目一样用，`done` 说 margin 没留时已经给了「such as `mt-6` or `margin-top`」。
2. 不管这一轮撤成的图层有没有 margin，这句都说（不按 `Dissolved.layers[].margins` 条件化）：多 121 字节，条件化要多一份判断，说明还会因场景时有时无。
3. 「How the page checks」里放置为绝对定位那句保留原样，不缩不挪（理由见上）；同一个 `claim` 里两处说了同一件事，`dissolve-place-frame` 正是这种情况。
4. 「so one taken off moves it by as much」这半句是新加的说法（`claim` 别处没有），用来说清后果；没有说「不然 `done` 会说没显示」，因为撤成 Frame 页面不核对。

### 剩下的风险

- 有没有用要真实 Agent 复验才知道；88 里 Claude run-2 是看了按钮那条 `done` 的提醒后仍去掉了段落的 `mt-4`，Agent 那一份责任这条说明管不到。
- 撤成 Frame 仍然不核对（「a Stack made or dissolved, not at all」），去掉 margin 照样不会被 `done` 拦下。
- 「Moves」那条说明里也有「the `left` / `top` given」（移动到别的容器里自由定位），没说 margin；这次没碰（不在本 ticket 范围，88 也没在那里出错）。

### 复验会在哪些场景看到

只有 `dissolve-place-frame`（88 里出问题的那个：Claude run-1、run-2，pi run-2）。

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

- 代定 1–4 全部确认。
- 合并后 main（c8bbd0d，97–101 都在）验证：typecheck 通过；单测 1017 通过、1 跳过，node 125 通过；e2e 439 通过、1 跳过、0 挂、0 抖。复验在 97–101 都合进后由规划会话按 88 的次数重跑 24 个场景。
