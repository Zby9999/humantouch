# 132: `claim` 的「Moves」那条写明：挪成 Absolute 的图层，margin 留着

**What to build:** 131 合并后，我在 main e937b4ea 上跑了 42 次真实运行。Claude 没登录，那 21 次没有结果。pi 在 `off-canvas-frame` 里 3 次全错在同一条：第 4 条，把介绍段落挪进新 Frame，放成 Absolute。

- pi 每次都去掉了段落的 `mt-4`，写成 `absolute left-6 top-[35px]`。段落因此比画布上高了 16px。
- 3 次 pi 都把它列在 ✓ 下面。run-2 还写了理由：「`mt-4` dropped so Y is exactly 35px」。

这和 ticket 100 是同一个问题，只是出在另一条说明里。

- 03Kind 里 X、Y 就是 `left`、`top`，margin 留着。图层画在 `left`、`top` 再加上 margin 的位置。
- 这句话现在只写在两处：
  - 「Dissolving a Stack」和「Dissolving a Grid」两条（ticket 100 加的）；
  - 「How the page checks」里能核对的那种放置。
- 「Moves」那条只写了「the `left` / `top` given」。
- 这次的 Frame 是新加的，页面找不到它，`done` 说 Not checked。所以 Agent 既看不到核对那一节的这句话，`done` 也拦不住它。

要做到：

- 「Moves」那条，在被挪成 Absolute 的图层带 margin 时（改动单里有 `margins`），写明：
  - `left`、`top` 就是给的 X、Y；
  - margin 留着；
  - 图层画在 `left`、`top` 加上 margin 的位置，去掉一个 margin 就会挪开同样多。
- 用英文，和「Dissolving a Stack」那句同一种写法。
- 不带 margin 的挪动，说明一字不变。

参考 ticket 100（同样的修法）、ADR 0014，用词以 GLOSSARY.md 为准。

**Blocked by:** None.

**Status:** ready-for-agent

- [x] 「Moves」那条，在图层带 margin 时写明 margin 留着、怎么画。不带 margin 的不变。
- [x] 不改 Skill。和 100 的结论一样：问题在 `claim`。
- [x] `--dry --claim-out` 前后对比：只有挪成 Absolute、而且图层带 margin 的场景，说明变了，至少有 `off-canvas-frame`。
- [ ] `--scripted` 全过；整套 e2e 过。
- [ ] 改完以后，`off-canvas-frame` 用真实 Agent 跑几次看效果。跑不跑、跑几次，由设计师定，会用到额度。

## 背景

- 原始记录：`bench-results/agents/2026-11-10T17-35-07-090Z/pi/off-canvas-frame/run-1` 到 `run-3`，看 `diff.patch` 和 transcript 末尾的报告。
- pi 这一轮的汇总：
  - 1:1 落地率（页面预期）92%（33/36 条）；
  - done 核对 100%（33/33 条）；
  - 虚假的 ✓ 3 条，全是这一条；
  - 其他 6 个场景全是 100%。
- 页面核对（`check.ts` 的 `drawnThere`）能核对时，已经把 margin 算进去了。所以只有核对不了的放置（比如放进新 Frame）会漏掉。

## 规划会话的建议（2026-11-11，等设计师定）

- 放在发布前，而且放在 Claude 那 21 次真实运行之前。理由：
  - 改动小，只改一条说明，有 ticket 100 的先例；
  - Claude 补跑时，`off-canvas-frame` 也就顺带验证了这个修正。
- 不放在发布前也可以：它只在「挪进核对不了的容器、图层又带 margin」时出现。

## Comments

**实现记录（2026-11-11）**

只改了 `packages/03kind/src/writing-rules.ts` 里「Moves」那条说明（`claim` 的 **How to write them**）。Skill、`done`、页面核对都没动。

- 怎么判断：改动单里挪成 Absolute 的 `move`，`moveTo`（`structure-edits.ts`）总会记下 `margins`（画布上的左、上 margin，没有就是 `{ x: 0, y: 0 }`）。新加的 `placedWithMargins`：`kind === "move"`、`after.absolute` 有、`margins.x` 或 `margins.y` 不是 0。
- 这一轮有一条这样的挪动，「Moves」才换成新写法（`list.some(...)`，和 ticket 122 那句一样）。别的轮次一字不变。

改前（不带 margin 时仍是这句）：

> A layer placed absolute gets `position: absolute` and the `left` / `top` given, in a container that is its positioning reference: give the container `position: relative` (`relative`) if it is not positioned yet.

改后（这一轮有带 margin 的图层挪成 Absolute 时）：

> A layer placed absolute gets `position: absolute`, its `left` and `top` the X and Y given, in a container that is its positioning reference: give the container `position: relative` (`relative`) if it is not positioned yet. Keep its margins: it is drawn at `left` and `top` plus its margins, so one taken off moves it by as much.

后半句和「Dissolving a Stack / Grid」那句同样的说法。

**`--dry --claim-out` 前后对比**（`TK_BENCH_PORT=5540`，29 个场景，对比 main 6efa60fd 的输出）

- 只有 `off-canvas-frame.md` 变了，只变了第 42 行「Moves」那一行（`diff -r` 一处）。6502 → 6619 字节（+117）。
- 另一个有「Moves」的场景 `reorder-and-move` 没有挪成 Absolute，一字未变。其余 27 个一字未变。

**测试**

- `packages/03kind/test/cli.test.ts` 加 1 组（3 个）：挪成 Absolute，margin 有 / 是 0 / 没记下。先跑红（有 margin 那个），改后绿。
- `pnpm typecheck` 通过（新 worktree 要先 `pnpm build`，Next 示例的 typegen 要 `dist`）。
- `pnpm test`：vitest 48 个文件 1208 passed / 1 skipped；`node --test` 126 pass。
- `TK_BENCH_PORT=5540 pnpm bench:agents --scripted`：20/20 ✓（含 `off-canvas-frame`）。
- e2e（`TK_E2E_PORT=6100`，无头）：`claim.spec.ts`、`off-canvas-round.spec.ts`、`applying-bench.spec.ts`，连同它们依赖的组共 520 passed，0 挂。没有 e2e 断言「Moves」的文字。整套 e2e 留给规划会话。

### 代定的事（待设计师确认）

1. 按条件说（只在有带 margin 的挪动时），不像 100 那样总说。因为 ticket 和 brief 都要求不带 margin 的说明一字不变。
2. 一轮里只要有一条带 margin 的挪动，整条「Moves」就换新写法，那一轮其他挪成 Absolute 的图层也看到「Keep its margins」。对没有 margin 的图层这句不会错。
3. 带 margin 时，「the `left` / `top` given」也换成「its `left` and `top` the X and Y given」（ticket 要求写明 `left`、`top` 就是 X、Y）。没有改成独立的一句，而是就地替换，和「Dissolving」的写法一致。
4. 只看 `move`。`duplicate`（复制并放成 Absolute）没有记 `margins`，这次不管。
5. 「How the page checks」里能核对的放置那句不动：两处说同一件事，能核对时 `done` 还会拦。
6. 不给例子（没写「such as `mt-4`」），理由同 100 代定 1。

### 风险

- 有没有用，要真实 Agent 复验 `off-canvas-frame` 才知道（跑不跑由设计师定）。pi 3 次都主动写了「`mt-4` dropped so Y is exactly 35px」，一句说明不一定拦得住。
- 挪进新 Frame 仍然不核对，去掉 margin 照样不会被 `done` 拦下。
- margin 是在设计师做改动的那个视图记下的；断点下 margin 不同的情况，这句没有细说（核对那句也一样）。
- 复制成 Absolute（`duplicate`）如果带 margin，Agent 看不到这句（见代定 4）。
