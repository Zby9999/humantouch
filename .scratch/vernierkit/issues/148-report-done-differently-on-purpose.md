# 148: 报告分三栏：已落地、有意不同、没显示出来

**What to build:** ADR 0016 的第三部分（设计师 2026-11-11 定）。

现在报告只有两栏：✓ Applied 和 ⚠️ Not applied 1:1。两种情况都进了 ⚠️：

- 真正没生效、要查的；
- Agent 有意做得不一样的。可能是设计师在对话里改了主意（官网当天有 7 条：填色改用新的 neutral-250，没用画布上的 200），也可能是在其他宽度上的适配（ticket 147）。

设计师看报告时分不出哪些要管。

要做到：

- `finish` 排出的报告、Skill 里的报告格式改成三栏，标题措辞是代定，用词保持英文：
  - **✓ Applied**：页面显示了的。
  - **↪ Done differently**：有意不同的，每条写 Why。
    - ticket 147 的「适配了」自动归到这里，带上那个宽度画的是什么，Agent 补上原因。
    - Agent 自己说明有意不同的，也归到这里，比如设计师在对话里改了主意。
  - **⚠️ Not shown**：没显示出来的，照旧写 Why 和 Instead。
- Agent 怎么说明「这条是有意不同的」，形式是代定，要简单到能力弱的模型也不会用错。比如 `npx humantouch done 3 --differently "the designer asked for neutral-250 instead"`，或者在 `finish` 时给。
  - 说明了的，`done` 不再要它去修。
  - 改动所在宽度上画出来不一样、又没说明的，照旧在 ⚠️。
- 每条改动只出现在一栏里（照现在的规矩）。
- `last` 打印上一轮时，每条标 Applied、Done differently 或 Not applied，和报告一致。
- 编辑层界面上的改动列表要不要显示「有意不同」，是代定。不显示也可以，设计师在对话里看报告。

Skill 的用词保持英文（设计师 2026-11-04）。参考 ADR 0013、0016，ticket 147；用词以 GLOSSARY.md 为准。

**Blocked by:** 147。发布前做（设计师 2026-11-11 定）。

**Status:** ready-for-agent

- [ ] `--scripted` 加一个场景：一条改动脚本有意写成别的颜色，并说明原因；`finish` 的报告把它放在 ↪，原因照抄。另一条在手机宽度适配了的（147 的场景），也在 ↪。
- [ ] 没说明、改动所在宽度画出来不一样的，在 ⚠️；`done` 照旧要它修。
- [ ] 测试 `finish`、`last` 的输出；Skill 的报告格式和 `finish` 排出来的一致（照 ticket 86 以来的对照方式）。
- [ ] 已有场景的 `claim-out` 逐字不变；`--dry`、`--scripted` 全过。`finish` 输出有变的地方，在 Comments 里列出前后对比。
- [ ] `pnpm typecheck`、`pnpm test`、整套 e2e 过。
