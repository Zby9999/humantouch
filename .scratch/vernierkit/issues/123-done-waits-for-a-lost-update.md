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

**Status:** ready-for-agent

- [ ] 先从 102 那次失败的 trace 或日志里确认是 (a)、(b)、(c) 哪一种，写进 Comments。确认不了的话，就写明三种都能被这个兜底接住。
- [ ] `page-checks.ts` 的两处等待都加上「超过 `UPDATE_LOST_MS` 就不再等」，常量从 `code-changes.ts` 共用。正常热更新的等待、`CHECK_SETTLE_MS`、`CHECK_ARRIVE_MS` 都不变。
- [ ] 单元测试或 e2e 复现：页面收到一次 `vite:beforeUpdate`，没有 `vite:afterUpdate`。之后的 `done` 在 `UPDATE_LOST_MS` 加正常的稳定时间内回答，不再等满 20 秒，答案和不丢时一样。
- [ ] `--dry` 全过（29 个场景），`--dry --claim-out` 和改前逐字相同，`--scripted` 全过；切换按钮的包逐字节不变。
- [ ] e2e 全过；`round.spec.ts:867` 照 102 的做法 `--repeat-each` 跑够 20 次不挂。

## 背景

- 109 那条线做 102 时，审查子 agent 发现的（2026-11-10）。102 只改测试；这一处是产品的风险，所以另开票。

## 规划会话决定（设计师不在，2026-11-10，回来后确认）

- 发布前做：它会让真 Agent 偶尔每次 `done` 都等 21 秒，而真 Agent 复验就在发布前。
- 接在 109 那条线后面：102 → 123。设指挥，派一个新的实现子 agent、一个审查子 agent，都用 effort medium。
