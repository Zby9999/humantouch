# 123: 热更新丢了一次结尾，之后每次 `done` 都要等满 20 秒

**What to build:** 页面核对等代码换上时，看开发服务器有没有正在进行的热更新（`updates.updating`）。Vite 每次热更新先发 `vite:beforeUpdate`，结束时发 `vite:afterUpdate`。只要有一次只来了开头、没来结尾，`updating` 就一直停在 1，直到页面关掉。之后每次 `done` 都要等满 `CHECK_ARRIVE_MS`（20 秒）才回答，离命令行的 26 秒上限不远。

答案仍然是对的，只是慢：真 Agent 会看到每次 `done` 都要 21 秒左右。ticket 102 那条测试偶发失败，就是这个情况：Playwright 的 30 秒超时先把页面关了。

丢掉结尾的可能原因：
- (a) 某个热更新的 accept 回调抛了错。Vite 8.3.4 的客户端在这里用了 try/finally，没有 catch。
- (b) 机器忙时某个模块的 import 一直没回来。
- (c) 某个 CSS `<link>` 既没触发 load，也没触发 error。

编辑层另一处已经有兜底：`code-changes.ts` 看 `updating` 时，超过 `UPDATE_LOST_MS`（5 秒）就当这次更新丢了。页面核对的两处没有这个兜底：
- `page-checks.ts` 的 `arrived`，约 326–344 行；
- `showsWithin` 的等待，约 379 行。

要做到：
- 页面核对这两处照 `code-changes.ts` 的做法，`updating` 超过 `UPDATE_LOST_MS` 就不再等，两处共用同一个常量。
- 一次热更新丢了结尾，不再拖慢之后的每次 `done`。
- 正常的热更新照旧等它结束再核对，核对结果逐字不变。

参考 ticket 102 的 Comments、spec.md「核对」（ADR 0006、0013），用词以 GLOSSARY.md 为准。

**Blocked by:** 102（同一条线，102 合进 main 之后做）

**Status:** done

- [x] 先从 102 那次失败的 trace 或日志里确认是 (a)、(b)、(c) 哪一种，写进 Comments。确认不了的话，就写明三种都能被这个兜底接住。（确认不了，见下面「实现记录」）
- [x] `page-checks.ts` 的两处等待都加上「超过 `UPDATE_LOST_MS` 就不再等」，常量从 `code-changes.ts` 共用。正常热更新的等待、`CHECK_SETTLE_MS`、`CHECK_ARRIVE_MS` 都不变。
- [x] 单元测试或 e2e 复现：页面收到一次 `vite:beforeUpdate`，没有 `vite:afterUpdate`。之后的 `done` 在 `UPDATE_LOST_MS` 加正常的稳定时间内回答，不再等满 20 秒，答案和不丢时一样。
- [x] `--dry` 全过（29 个场景），`--dry --claim-out` 和改前逐字相同，`--scripted` 全过；切换按钮的包逐字节不变。
- [ ] e2e 全过；`round.spec.ts:867` 照 102 的做法 `--repeat-each` 跑够 20 次不挂。

## 背景

- 109 那条线做 102 时，审查子 agent 发现的（2026-11-10）。102 只改测试；这一处是产品的风险，所以另开票。

## 规划会话决定（设计师不在，2026-11-10，回来后确认）

- 发布前做：它会让真 Agent 偶尔每次 `done` 都等 21 秒，而真 Agent 复验就在发布前。
- 接在 109 那条线后面：102 → 123。设指挥，派一个新的实现子 agent、一个审查子 agent，都用 effort medium。

### 实现记录（2026-11-10；起点 d2c6f1d，分支 worktree-agent-ae504d0c6ae8a055f）

**原因：确认不了是哪一种。** 102 那次失败没留下 trace（各 worktree 的 `test-results` 里都没有 round.spec 的 trace.zip），复现要压 CPU，这台机器上有别的会话，没压。照 Vite 8.3.4 的客户端（`dist/client/client.mjs`）推：
- 客户端把 HMR 消息排成一队，一次只处理一个（`createHMRHandler` 的 `Queue`）：上一次更新处理完，下一次的 `vite:beforeUpdate` 才发。
- (a) accept 回调抛错：`queueUpdate` 里 `fn()` 抛出，整个 `update` 处理失败，`vite:afterUpdate` 不发；队列接着处理后面的更新，后面的编辑照样到页面，`updating` 却永远多 1。和 102 的样子对得上：上一步的更新丢了结尾，200ms 后去掉 `mx-auto` 的更新进来又出去，`updating` 停在 1，`done` 等满 20 秒。
- (b) import 一直没回来、(c) `<link>` 既不 load 也不 error：这一次的处理一直挂着，后面的更新都排在它后面，页面再也拿不到新代码。慢但最终回来的 import 不会让 `done` 等 20 秒，所以要么真丢了，要么挂得比 20 秒还久。102 那次失败在最后一步，之后测试就结束了，分不出是 (a) 还是 (b)/(c)。
- 三种都被兜底接住：(a) 下一次更新开始时，之前数着的就当丢了（见下面）；(b)/(c) 时没有下一次开始，靠「开始了 `UPDATE_LOST_MS` 还没结尾就当结束」，`done` 等 5 秒后照页面实际的样子回答（这时页面没有新代码，答没显示，是实话）。

**做了什么**
- `code-changes.ts`：`UPDATE_LOST_MS` 导出（值 5000 不变），注释里说页面核对也用它。别的没动。
- `page-checks.ts`：新加 `updating()`，`arrived` 和 `showsWithin` 的等待都改用它，不再直接看 `updates.updating`。它算「有更新在进行」要同时满足：
  - 开发服务器数着的更新数，减去当作丢了的，还大于 0；
  - 最近一次开始（数目上升，即 `vite:beforeUpdate`）到现在不到 `UPDATE_LOST_MS`。开始核对时已经有更新在进行，就从开始核对算起。用的是最近一次**开始**的时间，不是最后一次事件、也不是丢了的那次的开始，所以一次新的、慢但正常的更新（5 秒内结束）照旧等到它结束。
  - 「当作丢了」：数目上升时，之前已经数着的都算丢了（Vite 一次只处理一个，下一次开始说明上一次已经处理完了，只是没发结尾）；数目降到它以下时跟着降。
- `CHECK_SETTLE_MS`、`CHECK_ARRIVE_MS`、`SHOW_MS`、`QUIET_MS` 都没动；正常更新的等待、核对结果和改动说明都不变。进入编辑模式的路径没加东西（只在认领后 `watchPage` 里多两个变量）。

**测试**（`edits.browser.test.ts`「a stroke is checked on the live page …」那组，假时钟，新 4 条）
- 只来 `beforeUpdate` 不来 `afterUpdate`，页面已显示：`UPDATE_LOST_MS` 前不答，之后 1 秒内答 ✓（改前要等满 `CHECK_ARRIVE_MS`）。
- 同上，页面没显示：在 `UPDATE_LOST_MS + CHECK_SETTLE_MS + 1s` 内答没显示，`actual` 和不丢时一样。
- 慢但正常的更新（4 秒后才结束）：结束前不答，结束后才答，和改前一样。
- 一次丢了结尾之后：下一次慢更新等到它自己结束为止；再下一次很快的更新，`done` 在 3 秒内答（只用时间兜底时要等到这次开始后 5 秒）。
- 前三条在 main 的 `page-checks.ts` 上都挂（等满 20 秒），慢更新那条改前改后都过。

**验证**：`pnpm typecheck` 过；`pnpm test` 1189 过 1 跳过，node 126 过；`round.spec.ts`、`code-changes.spec.ts` 用 `--project="project files" --no-deps` 52 过；96 那条（`round.spec.ts:911`，原 867）`--repeat-each 20` 20 过（负载约 2–3，没压 CPU）；`--dry` 29/29，`--dry --claim-out` 和 main d2c6f1d 的 29 份 `diff -r` 逐字相同；`--scripted` 20/20。整套 e2e 留给指挥。没压 CPU 复跑。

**包**：切换按钮 `react.dev.js` 1423 B（sha256 前 16 位 `bd6c2389b64451f0`）、`chunk-2GJY7MXB.js` 21372 B（`a8c4c0d4bc3db6a8`），和 d2c6f1d 逐字节相同。编辑层 `editor.dev.js` 532092 → 532137 B（+45 B），gzip -9 188603 → 188627 B（+24 B）。

#### 代定的事（待设计师确认）

1. 比票里写的多做了一步：「另一次更新开始时，之前数着的都当丢了」。只靠时间兜底的话，丢过一次之后 `updating` 永远至少是 1，之后每次改完马上 `done`，都要等到那次更新开始后 5 秒（单测里看到了），还是会拖慢之后的每次 `done`，只是从 20 秒变成 5 秒左右。
2. 计时从最近一次 `vite:beforeUpdate` 算起；开始核对时已有更新在进行，从开始核对算起。
3. `code-changes.ts`（画布上「代码变了」那一路）只导出了常量，没加第 1 条：丢过一次之后，那一路每次改动要多等约 5 秒才告诉画布。本票只管页面核对。

#### 遗留风险

1. 正常但超过 5 秒的更新（机器很忙、第一次拉很大的模块）会被当成丢了，`done` 可能提前答没显示。`code-changes.ts` 原来就是这样。
2. 第 1 条靠「Vite 一次只处理一个更新」。老版本的 Vite（peer 写的是 >=5）如果不排队，两次更新同时进行时会把先开始的当丢了；先开始的先结束时，后一次不再等，只剩 `updates.at >= codeAt` 或 `CHECK_SETTLE_MS` 拦着。不知道排队是 Vite 哪个版本加的，没查。Next.js 没有这份数，不受影响。
3. 原因没确认；没在压 CPU 下复跑 102 的失败。
4. 第 3 条的 `code-changes.ts` 那一路的 5 秒拖慢，要不要一起改，可以另开票。

**Review 后的修正（2026-11-10）**（上面「做了什么」「包」、代定 2–3、风险 1–2 里说的 5 秒和导出，以这一节为准）

- 页面核对不再用 `code-changes.ts` 的 `UPDATE_LOST_MS`，改用自己的 `PAGE_UPDATE_LOST_MS = 12_000`（`page-checks.ts`）。`code-changes.ts` 回到和 main 一字不差（不再导出）。原因：用 5 秒时，忙机器上 7 秒才拉完的正常更新，在开始后 5 秒就被当成丢了，`showsWithin` 在约 6.5 秒时答没显示，改前会等到它结束答 ✓。(a) 已经由「另一次开始时之前的算丢了」接住，计时只为 (b)/(c)，那时队列是永远卡住的，多等几秒没关系。12 秒加 `SHOW_MS` 仍在 `CHECK_ARRIVE_MS`（20 秒）里。这和规划会话写的「共用同一个常量」不同，指挥转告规划会话。
- 记的数（最近一次开始的时间、上次听到的数、当作丢了的数）从每个 `watchPage` 自己记，改成按页面窗口记一份（`WeakMap<Window, HotUpdates>`，第一次核对时装一个一直不摘的 `CODE_EVENT` 监听）。这样一轮里丢过的，下一轮新开的核对也知道，不会在下一轮第一次 `done` 时再等满一次阈值。
- 注释改了：不再说「照 code-changes 的做法」，写明两处的不同（从最近一次开始计时、减去当作丢了的）。`lost = Math.min(lost, count)` 只留在监听里一处。
- 测试：原来 4 条的阈值改成 `PAGE_UPDATE_LOST_MS`，「再下一次很快的更新」的上限收紧到 3 秒；新加 2 条：正常更新 7 秒才结束、页面在结束时才画上，等到它结束答 ✓；一轮里丢过一次，下一轮新开核对、没有新更新时 `done` 在 `CHECK_SETTLE_MS + 1s` 内答 ✓（把记的数改回每次核对自己记，这条就挂）。
- Vite 的排队：离线查不到 changelog（`node_modules` 里的 vite 包不带 CHANGELOG，pnpm store 是 sqlite，没联网）。本机能找到的 vite 6.4.3、7.3.x、8.0.12、8.1.x、8.3.4 的 `dist/client/client.mjs` 里都有 `createHMRHandler` 的队列；没找到 5.x 的副本，所以 **Vite 5.x 是否排队没确认**，见风险 2。

**重跑（修正后）**：`pnpm typecheck` 过；`pnpm test` 1191 过 1 跳过，node 126 过；`round.spec.ts`、`code-changes.spec.ts`（`--project="project files" --no-deps`）52 过；`round.spec.ts:911 --repeat-each 20` 20 过（负载 3–8，有别的会话，没压 CPU）；`--dry` 29/29，`--dry --claim-out` 和 main d2c6f1d 的 29 份逐字相同；`--scripted` 20/20。整套 e2e 留给指挥。

**包（修正后）**：切换按钮 `react.dev.js` 1423 B（`bd6c2389b64451f0`）、`chunk-2GJY7MXB.js` 21372 B（`a8c4c0d4bc3db6a8`），和 d2c6f1d 逐字节相同。编辑层 `editor.dev.js` 532092 → 532459 B（+367 B），gzip -9 188603 → 188710 B（+107 B）。

#### 代定（修正后，替换上面 2–3）

1. 同上面代定 1（审查建议保留）。
2. 页面核对的阈值是自己的 12 秒，不和 `code-changes.ts` 的 5 秒共用；计时从这个页面最近一次 `vite:beforeUpdate` 算起，第一次核对时已有更新在进行则从那时算起。
3. 记的数按页面窗口跨轮保留。`code-changes.ts` 不动。

#### 遗留风险（修正后，替换上面 1–2）

1. 正常但超过 12 秒的更新仍会被当成丢了，`done` 可能提前答没显示（之前是 5 秒）。
2. 代定 1 靠「Vite 一次只处理一个更新」。6.4.3 起确认有队列；5.x 没确认。5.x 如果不排队，两次更新同时进行时会把先开始的当丢了，先开始的先结束时后一次不再等，只剩 `updates.at >= codeAt` 或 `CHECK_SETTLE_MS` 拦着。建议（设计师定）：查清 5.x，必要时把 peer 从 `vite >=5` 提到确认有队列的版本；本票没改 peer。
3. 页面第一次核对之前就丢了的更新：那时还没装监听，数目停在 1，第一次核对要等到开始核对后 12 秒，或者下一次更新开始（那时就算丢了）。只会发生一次。
4. 原因没确认；没压 CPU 复跑。`code-changes.ts` 那一路丢过一次后每次多等约 5 秒，可另开票。
