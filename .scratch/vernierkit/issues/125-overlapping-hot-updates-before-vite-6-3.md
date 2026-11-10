# 125: Vite 6.3 以前，两次热更新会重叠；页面核对不能因为「另一次开始了」就把前一次当丢了

**What to build:** ticket 123 让页面核对在另一次热更新开始时，把之前还没结束的当作丢了（123 的代定 1）。这一步成立的前提是 Vite 一次只处理一条 HMR 消息。Vite 6.3.0 起才是这样（vitejs/vite#19793，「fix(hmr): run HMR handler sequentially」）。

03Kind 的 peer 写的是 `vite >=5`。在 Vite 5.x 和 6.0–6.2 上，客户端收到消息就各自开始处理，两次热更新会重叠。比如 Agent 很快地先改 A、再改 B：
1. A 开始，B 开始，这时 A 被当作丢了；
2. A 结束，核对算出「没有在进行的更新」，可这时 B 还在拉；
3. B 落地如果慢过 `SHOW_MS`，`done` 就误答没显示。

Agent 读到「没显示」，可能去改本来没错的代码。

要做到：
- 页面核对知道开发服务器的 Vite 会不会一条一条地处理 HMR 消息（6.3.0 起会）。
- 会的，照 123 现在的做法。
- 不会的，不因为「另一次开始了」就当前一次丢了，只靠 `PAGE_UPDATE_LOST_MS` 计时。丢过一次以后，之后的 `done` 最多多等到那次开始后 12 秒，这只在真丢了的时候发生。
- Next.js 不受影响：它没有这份数，123 也没动它。
- 不改 peer 范围。要不要提高最低版本，由设计师定。

参考 ticket 123 的 Comments（代定 1、风险 2、规划会话决定）、spec.md「核对」（ADR 0006、0013），用词以 GLOSSARY.md 为准。

**Blocked by:** None technically. It is on the Grid line after 124.

**Status:** done

- [x] 页面能知道 Vite 是不是 6.3.0 及以上（比如由插件在服务器那边读 Vite 的版本，带给页面）。读不到版本的，按「不会一条一条处理」对待。
- [x] 单元测试复现 Vite 5 的重叠：A 开始、B 开始、A 结束、B 稍后结束，页面在 B 结束时才画上。不会一条一条处理时，`done` 等到 B 结束才答 ✓；会的时候，照 123 现在的测试。
- [x] 123 加的测试全过。会一条一条处理的 Vite 上，核对行为和 123 一字不差。
- [x] `--dry` 全过（29 个场景），`--dry --claim-out` 和改前逐字相同，`--scripted` 全过；切换按钮的包逐字节不变。
- [x] e2e 全过。（指挥合并前在同步了 main d0ddcc5 的分支上跑整套：589 过 1 跳过，一次过；`--dry` 29/29 和 main 逐字相同；`--scripted` 20/20）

## 规划会话决定（设计师不在，2026-11-10，回来后确认）

- 发布前做：发布时写的是支持 `vite >=5`，这一处是 123 新带进来的回归，只出现在 6.3 以前的 Vite 上。
- 接在 109 那条线后面：124 → 125。照常 conduct：派一个新的实现子 agent、一个审查子 agent，都用 effort medium。

### 实现记录（2026-11-10；起点 dc5121f，分支 worktree-agent-a51c9e7072189109a）

**做了什么**
- `src/vite-version.ts`（新）：`updatesInTurn(version)`，Vite 6.3.0 及以上答是；6.3.0 的预发布版、6.3.0 以前、读不出的（`undefined`、空串、`latest`、`6.x` 这类）都答否。
- `CodeUpdates`（`service-protocol.ts`）多一个 `inTurn: boolean`：开发服务器是不是一次只处理一个更新。
- `page-checks.ts` 的 `hotUpdates` 监听里，数目上升时：
  - `inTurn` 为真：之前数着的都算丢了，和 123 一字不差。
  - 否则：只有最近一次开始已经过了 `PAGE_UPDATE_LOST_MS`（12 秒），之前数着的才算丢了（见代定 1）；其余只靠 123 已有的计时：最近一次开始后 12 秒还没结尾，就不再等。
  - `updating()`、`PAGE_UPDATE_LOST_MS`、`CHECK_SETTLE_MS`、`CHECK_ARRIVE_MS`、`SHOW_MS`、`QUIET_MS` 都没动。
- Next.js 没有 `CODE_GLOBAL`，`hotUpdates` 照旧返回 undefined，不受影响。peer 照旧是 `vite >=5`。进入编辑模式的路径没加东西；`code-changes.ts` 没动。

**版本怎么到页面**：插件（`src/vite.ts`）从 `vite` 包导入 `version`（Vite 5 起就导出），在服务器那边算 `updatesInTurn(version)`，写进它本来就提供的虚拟模块 `virtual:03kind/code-updates`：`window.__THIRD_KIND_CODE__ = { at, updating: 0, inTurn: true|false }`。模块内容在插件加载时就定了，页面不多一次请求。`version` 按 03kind 包所在的位置解析 `vite`，pnpm 的 peer 和 npm 的提升下都是项目自己那份（见风险 2）。

**测试**
- `edits.browser.test.ts`「a stroke is checked on the live page …」那组（假时钟）：`withUpdates` 多一个参数 `{ inTurn = true }`，123 的 6 条照旧按 6.3 及以上跑，一字没改。新 3 条：
  - 6.3 以前：A 开始、B 开始、A 结束、4 秒后 B 结束，页面这时才画上。B 结束前不答，结束后答 ✓。
  - 同样的顺序，6.3 及以上：A 结束后就答没显示（123 的做法；6.3 起不会这样重叠，这条只说明 `inTurn` 起作用）。
  - 6.3 以前：A 丢了结尾；1 秒后 B 开始又结束，改动没显示：B 开始后 `PAGE_UPDATE_LOST_MS` 内不答，之后答没显示。再过 12 秒，C 开始又结束：`done` 3 秒内答（代定 1）。
  - 把监听改回 123 的做法，第 1、3 条挂；去掉代定 1 那一步，第 3 条挂。
- `vite-version.test.ts`（新，node）：版本判断的几组例子；插件给页面的模块里 `inTurn` 和所在的 Vite 一致，示例和测试用的 8.3.4 答是。
- 另三个测试文件（`agent-stall`、`code-changes`、`page-changed`）和 `edits` 里另一条手造的 `CodeUpdates`，只补了 `inTurn: true`。

**验证**：`pnpm typecheck` 过；`pnpm test` 1198 过 1 跳过（48 个文件），node 的 bench、old-names 测试过；`--dry` 29/29，`--dry --claim-out` 和 main dc5121f（同一 worktree 里换回 main 的 `packages/03kind` 构建）的 29 份 `diff -r` 逐字相同；`--scripted` 20/20；`round.spec.ts`、`code-changes.spec.ts`（`--project="project files" --no-deps`）52 过。整套 e2e 留给指挥。没压 CPU。

**包**：切换按钮 `react.dev.js` 1423 B（sha256 前 16 位 `bd6c2389b64451f0`）、`chunk-2GJY7MXB.js` 21372 B（`a8c4c0d4bc3db6a8`），和 dc5121f 逐字节相同。编辑层 `editor.dev.js` 532459 → 532509 B（+50 B），gzip -9 188710 → 188735 B（+25 B）。插件 `vite.js` 42712 → 43161 B（+449 B，在服务器那边）。

#### 代定的事（待设计师确认）

1. 6.3 以前也不是纯计时：另一次开始时，如果最近一次开始已经过了 12 秒，之前数着的都算丢了。只靠计时的话，丢过一次以后数目永远至少是 1，页面开着的时候之后每次 `done` 都要等到那次更新开始后 12 秒，比 123 之前的 20 秒好不了多少。加了这一步，多等的只有丢了之后 12 秒内开始的那几次；12 秒里没有新的开始，下一次就照常快。正常更新不会跑 12 秒（超过 12 秒的本来就按丢了算，见 123 的风险 1）。
2. 只认 6.3.0 正式版及以上；6.3.0 的预发布版（修复在 6.3.0-beta.2 里）也按「不会一条一条处理」对待：只会慢，不会误答。
3. 版本在服务器那边从 `vite` 包读（`import { version } from "vite"`），不用 Vite 7 起才有的 `this.meta.viteVersion`，这样 5.x、6.x 也读得到。

#### 遗留风险

1. 6.3 以前，丢过一次以后，接下来 12 秒内开始的更新，`done` 要等到它开始后 12 秒（再加显示的时间）才答，不论它多快结束：分不出结尾是哪一次的。
2. 读到的是 03kind 包解析到的 `vite`，不一定是正在跑的那个（比如 monorepo 里 03kind 带着另一份 Vite）。旧服务器配上新 Vite 包时会误当成一条一条处理，回到本票之前的样子。（审查后已修，见下面「Review 后的修正」。）
3. 代定 1 的边界：A 是一次超过 12 秒的正常更新，之后 B 开始，A 被当丢了；A 结束时数目降下来，B 也就不再等了。只在单次更新超过 12 秒时出现。
4. 示例都是 Vite 8.3.4，6.3 以前的路径只有单测覆盖，没在真的 Vite 5 / 6.0–6.2 服务器上跑过。要不要加一个老 Vite 的示例或提高 peer 下限，仍等设计师定。

**Review 后的修正（2026-11-10）**（上面「版本怎么到页面」、代定 3、风险 1–2 里说的，以这一节为准）

- 不再在模块顶层 `import { version } from "vite"`。那样读到的是 03kind 自己解析到的 Vite：workspace、`npm link`、`file:` 装的时候是 03kind 的 devDependency，不是服务器的（这个仓库里示例永远读到 8.3.4，老 Vite 的示例也会得 `inTurn: true`）。而且插件原来只按类型引 `vite`，改成运行时引以后，项目只经框架间接带着 Vite、自己没写 `vite` 的，加载 `03kind/vite` 就报 `ERR_MODULE_NOT_FOUND`。
- 现在在 `configResolved(config)` 里读（`vite-version.ts` 的 `viteVersionFor`），依次试：
  1. `this.meta.viteVersion`（Vite 7 起有，7 起的都 ≥6.3）；
  2. 在 try 里，从项目根 `createRequire(path.join(config.root, "package.json"))("vite/package.json").version`；
  3. 在 try 里，懒加载 `import("vite")`。
  都读不到按否。`CODE_UPDATES` 改成在 `load` 里按读到的结果生成。构建出的 `dist/vite.js` 里没有静态的 `vite` 运行时引入，只剩第 3 步那一处动态 `import("vite")`。
- `vite-version.ts` 里不具名的 `(-)?` 改成具名组 `(?<prerelease>-)?`。
- 测试：`vite-version.test.ts` 先调 `configResolved` 再看 `load`。新加：项目根下假的 `node_modules/vite/package.json` 写 5.4.11（和 03kind 自己的 8.3.4 不同），得 `inTurn: false`；同一个根、`this.meta.viteVersion` 说 7.1.0，得 `inTurn: true`；03kind 包自己的根，得 `inTurn: true`。

**重跑（修正后，已合 main d0ddcc5）**：`pnpm typecheck` 过；`pnpm test` 1200 过 1 跳过（48 个文件），node 的 bench、old-names 测试过；`--dry` 29/29，`--dry --claim-out` 和 main 的 29 份 `diff -r` 逐字相同（d0ddcc5 比 dc5121f 只多文档，用的是先前 dc5121f 的那 29 份）；`--scripted` 20/20；`round.spec.ts`、`code-changes.spec.ts`（`--project="project files" --no-deps`，端口 6100，示例的开发服务器照常起来）52 过。整套 e2e 留给指挥。

**包（修正后）**：切换按钮 `react.dev.js` 1423 B（`bd6c2389b64451f0`）、`chunk-2GJY7MXB.js` 21372 B（`a8c4c0d4bc3db6a8`），和 dc5121f 逐字节相同。编辑层 `editor.dev.js` 532459 → 532509 B（+50 B），gzip -9 188710 → 188735 B（+25 B），和修正前一样。插件 `vite.js` 42712 → 43623 B（+911 B，服务器那边）。

#### 代定（修正后，替换上面 3）

3. 版本依次从 `this.meta.viteVersion`、项目根解析到的 `vite/package.json`、03kind 懒加载的 `vite` 读，都读不到按否。

#### 遗留风险（修正后，替换上面 1–2）

1. 6.3 以前，丢过一次以后，接下来 12 秒内开始的更新，`done` 要等到它开始后 12 秒（再加显示的时间）才答，不论它多快结束：分不出结尾是哪一次的。审查补充：代定 1 只在 12 秒里没有新开始时才把卡住的那次算丢了；一个 Agent 的更新如果总是相隔不到 12 秒开始，卡住的那次就一直不算丢了，每次 `done` 都等到最近一次开始后 12 秒。只会慢，不会误答。
2. 前两步都读不到时（Vite 6 及以前、项目根解析不到 `vite`，比如 Vite 只装在框架自己的依赖里），退到 03kind 自己解析到的 `vite`，这时仍可能不是正在跑的那个；连这也读不到就按否，只会慢、不会误答。
