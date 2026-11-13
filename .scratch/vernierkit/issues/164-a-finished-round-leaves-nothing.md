# 164: Agent 交了报告的一轮，什么都不留

**What to build:** 现在 Agent 跑完 `npx humantouch finish`，⚠️ Not shown 的改动还留在改动单里：切换按钮上显示数字，下次进入编辑模式回到同一张旧画布（ADR 0013）。设计师要单独清一轮，看到的也不是 Agent 改完的页面。

要做到（ADR 0019）：

- Agent 跑了 `finish`：这一轮的改动全部归档，✓、↪、⚠️ 都一样。改动单、画布、核对都删掉，切换按钮上没有数字。下次进入编辑模式，按新代码重新冻结。
- 一轮没有 `finish` 就结束了（End this round，按住切换按钮）：照旧，没落地的改动留到下一轮，回到同一张画布。
- `npx humantouch last` 照旧列出上一轮每条改动，标 Applied、Done differently、Not applied，⚠️ 的那几条也在。
- 说法跟着改：README「If the Agent stops partway」那一段说清只有没交报告的一轮才留改动；`finish` 的输出、Skill 里有说到「留到下一轮」的地方一起看。Skill 的措辞保持英文。

用词以 GLOSSARY.md 为准（「一轮」「落地」「改动单」等，要改的顺手改），涉及 ADR 0013、0018、0019。测试只跑相关的部分（round、next-round、off-canvas-round、react18-round 这几组 e2e，`--scripted` 里留到下一轮的场景），整套由规划会话在 main 上跑。

**Blocked by:** None (can start immediately)。在 ticket 24 之前做，做完发 0.1.1（设计师 2026-11-13 定）。

**Status:** ready-for-agent

- [ ] Agent `finish` 时有 ⚠️ 的改动：一轮结束后没有改动单，切换按钮上没有数字；再进编辑模式，画布按新代码冻结（看得到 Agent 改过的代码）。有测试。
- [ ] 设计师在 Agent 中途停下时结束一轮：没落地的改动照旧留到下一轮，同一张画布，从 1 重新编号。原来的测试照旧过。
- [ ] `last` 列出 `finish` 那一轮的全部改动，⚠️ 的标 Not applied。有测试。
- [ ] `--scripted` 里依赖「`finish` 后留到下一轮」的场景改成用 End this round 结束，或改判新的结果；改了哪些在 Comments 里说。
- [ ] README、Skill、`finish` 的输出和 GLOSSARY 的说法跟新规则一致。
