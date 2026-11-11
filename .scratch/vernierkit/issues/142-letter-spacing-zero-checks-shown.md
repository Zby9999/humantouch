# 142: 字间距改成 0，`done` 一直说没显示

**What to build:** 官网线报来（2026-11-11）。设计师把官网标题的字间距从 0.8px 改成 0，Agent 写成了 `tracking-[0px]`。页面上确实是 0，但 `done` 一直报 not shown，`finish` 只能把它列在 ⚠️ 下。

原因（规划会话读代码核对过）：

- 字间距为 0 时，Chrome 的 `getComputedStyle` 给的是 `normal`，不是 `0px`。
- `readLetterSpacing`（`typography.ts`）把 `normal` 读成 `0%`，也就是「字号的 0%」，跟 Figma 的说法一样。
- 改后的值是 `0px`。页面核对的 `sameValue`（`check.ts`）按 JSON 逐字比较，`{0, "%"}` 和 `{0, "px"}` 不一样，所以判为 not shown。

要做到：

- 字间距 0，不管写成 `0px`、`0%`、`0em`、`normal` 还是不写，页面核对都算同一个值。改后是 0 而页面显示 0 的，`done` 判为显示了。
- 别的长度照旧按单位比较。0 以外的值不要因为这次放宽。
- 怎么改由实现决定，以改动最小为准，比如核对时把 0 长度当作相等。如果改读法（让 `normal` 按页面写的单位读），面板显示和改动说明的变化要写进 Comments。
- 行高的 `normal`（读作 Auto）不受影响。

用词以 GLOSSARY.md 为准。

**Blocked by:** None。发布前修（误报 not shown 是 `done` 的正确性问题）。

**Status:** ready-for-agent

- [ ] 单元或浏览器测试：页面字间距写成 `0px`（Chrome 读出 `normal`），改后是 `0px` 或 `0%`，核对都判为显示了；改后是 `0.5px`、页面是 0 时，仍判为 not shown。
- [ ] 加一个 bench 场景，或在已有的字体场景上加一步：字间距改成 0，`--scripted` 落地后 `done` 判为显示了。已有场景的 `claim-out` 逐字不变。
- [ ] `pnpm typecheck`、`pnpm test`、整套 e2e 过；`--dry` 全过，`--scripted` 全过。
