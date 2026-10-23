# 07: 完整的一轮落地

**What to build:** Agent 按 Skill 认领后逐条落地并汇报进度，最后结束一轮：编辑层在认领时自动收起成切换按钮并锁定，进度环随 `done` 逐渐长满、角标递减，`finish` 后归档并解锁，页面热更新为真实结果。设计师可长按手动解锁；Agent 可用 `last` 取得上一轮改动说明来撤销上一轮。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 06

**Status:** ready-for-agent

- [x] `claim` 后编辑层（若处于编辑模式）自动收起为切换按钮，按钮在落地期间不可用
- [x] 每次 `done <编号>` 后进度环增长、角标减一
- [x] `finish` 后本轮归档到历史，按钮恢复可用，可开始新一轮
- [x] 长按切换按钮手动解锁：已完成的改动归档，未完成的改动记入归档，画布丢弃
- [x] `last` 输出上一轮的改动说明
- [x] Skill 补全：完整流程（claim → 逐条落地并 done → finish）、固定报告格式（✓ 已落地 / ⚠️ 无法 1:1 落地的改动、原因、实际处理方式）、撤销上一轮的做法
- [x] 主接缝：端到端测试走通 claim → done → finish 并断言锁定、进度与解锁

## Comments

**实现记录（2026-10-23）**

- 命令行（`src/cli.ts`）：
  - `done <编号>`：把这条改动记入状态文件的 `done`，输出 "Change 2 done: 1 of 2 changes applied."。没认领、编号不在本轮里时报错，退出码 1，状态不变。重复 `done` 同一条不重复记。
  - `finish`：本轮归档，输出完成了几条；有没 `done` 的改动时列出编号，提醒 Agent 在回复里报告原因。
  - `last`：输出最近一轮的改动说明，每条带 Status（Applied / Not applied）。没有历史时说明没有可撤销的。
  - 已认领时再运行 `claim`：重新输出改动说明，每条带 Status（Done / Not done yet），已完成的不清零。Agent 丢了上下文时可以重新拿到。
- `.vernier/` 目录（`src/vernier-folder.ts`）：
  - `archiveRound(folder, ended)`：改动单和 `result.json`（`ended: "finished" | "unlocked"`、`done`、`at`）写进 `history/<结束时间>/`，再删掉画布、改动单，最后删状态文件。状态文件最后删，是因为本机服务和编辑层以它消失作为"一轮结束"的信号，到那时本轮文件已经不在了。`finish` 和手动解锁走同一个函数，区别只在 `ended`。画布不归档。
  - `readLastRound`：历史目录名是 ISO 时间（`:`、`.` 换成 `-`），按名字排序取最后一个。
- 本机服务（`src/service.ts`）：
  - `GET /events`：一直开着的响应，每行一个 `RoundStatus`（`{ status: "editing" }` 或 `{ status: "claimed", done }`），先发当前状态，之后状态变了再发。命令行在另一个进程里改状态文件，服务用 `fs.watchFile` 每 100ms 看一次（文件不存在也能看，不必为此先建 `.vernier/`）。
  - `POST /unlock`：手动解锁，按现状结束本轮。
  - 已认领时 `PUT` / `DELETE /round` 返回 409：Agent 正在落地的改动单不会被编辑层的延迟保存覆盖或删掉。
  - EventSource 不能带请求头，所以客户端用 `fetch` 读流（`client/service.ts` 的 `watch`），断开 1 秒后重连（开发服务器重启时）。
- 编辑层：
  - `EditorLayer.tsx`：收到已认领时，处于编辑模式就收起（和点击切换按钮一样的动画）。已认领 → 编辑中，说明一轮结束了，重新读一次本轮（此时已归档，读到的是没有），之后进入编辑模式会重新冻结。
  - `Toggle.tsx`：落地期间 `aria-disabled`，名称为 "Vernier Kit: applying design changes. Press and hold to unlock."，鼠标悬停有同样的提示。外圈是 `role="progressbar"` 的进度环（名称 "Applying design changes"，`aria-valuenow` 为已完成数、`aria-valuemax` 为总数），角标显示未完成数。按住 1 秒解锁，按住期间白色的环跑一圈表示还要按多久；拖动就不算按住。键盘按住 Enter / Space 同样可以。按住结束时松手产生的 click 不会把编辑层打开：那时按钮可能已经解锁。
- Skill 补全：完整流程（claim → 每条落地后立刻 done → finish）、固定报告格式（✓ Applied / ⚠️ Not applied 1:1，附 Why / Instead）、用 `last` 撤销上一轮。
- 测试：
  - 命令行接缝 `test/cli.test.ts`：done、finish、last、重复 claim。
  - 主接缝 `e2e/tests/round.spec.ts`：在编辑模式中运行 claim 后编辑层收起并锁定；done 推进进度环、角标递减；finish 后解锁并重新冻结；落地期间刷新仍然锁定；长按解锁的归档内容；短按无效。
  - `fixtures.ts` 的内存版本机服务补了 `/events`（只有"编辑中"）和 `/unlock`。

**已知限制**

- 认领发生时，编辑层里还没来得及保存的最后一次编辑（0.5 秒内）不进入本轮，随画布一起丢弃。
- 跨进程的竞争：`PUT /round` 已经通过"未认领"检查、还没写完时，Agent 恰好运行 `claim`，打印的改动说明可能比随后写入的改动单少一处修改。概率很低，没有处理。
- "页面热更新为真实结果"靠开发服务器自己的热更新，编辑层不做额外处理。
- 两个标签页同时打开时都会锁定，任一个长按都会解锁。

**代码审查后的修正（2026-10-23）**

- 只剩状态文件、本轮已经不在（例如 `done` 在手动解锁后才写回状态，或归档中途进程退出）时，`readState` 视为未认领并删掉这个状态文件。原来这种情况下 `/unlock` 回 409，设计师会被永久锁住。
- 认领后，编辑层不再用自己手里的本轮更新角标、进度环和预览，而是重新从本机服务读一次：Agent 拿到的是什么，界面就显示什么。认领之后的保存直接忽略，不再在本地留下 Agent 没拿到的改动。
- 页面加载后，本机服务的第一条状态到达前，编辑模式先等着；状态是已认领时不会打开新的编辑层。原来刷新后的几毫秒里点切换按钮能在落地期间进入编辑模式。
- 键盘按住 Enter 解锁时，按键重复产生的 click 不会在解锁后打开编辑层。
- 状态推送按顺序读取，旧状态不会晚于新状态发出。
- 测试：`test/cli.test.ts` "a claimed state left without its round"；`round.spec.ts` "an edit not yet saved when the Agent claims…"。
- 留待以后：撤销上一轮（`last`）不认领、不锁定编辑层，规格里撤销只要求 `last` 加对照改回；改动说明还没有设计变量，留给 14。
