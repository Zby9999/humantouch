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

**Status:** done

- [x] 单元或浏览器测试：页面字间距写成 `0px`（Chrome 读出 `normal`），改后是 `0px` 或 `0%`，核对都判为显示了；改后是 `0.5px`、页面是 0 时，仍判为 not shown。
- [x] 加一个 bench 场景，或在已有的字体场景上加一步：字间距改成 0，`--scripted` 落地后 `done` 判为显示了。已有场景的 `claim-out` 逐字不变。
- [x] `pnpm typecheck`、`pnpm test`、整套 e2e 过；`--dry` 全过，`--scripted` 全过。

## Comments

**2026-11-11，实现（分支 worktree-agent-a745a79234de0149a）**

改了什么：

- 改的是核对，不是读法。`check.ts` 的 `AS_WRITTEN` 加了一项 `letterSpacing`：页面读出来的字间距和改后的值都是 0（不管单位），就算同一个值；别的情况照旧用 `sameValue` 逐字比较。所以非 0 的长度不会因为这次放宽，比如改后 2px、页面写 0.0625em（标题 32px 下也是 2px），仍判为 not shown，读出来的是 6.25%。
- `readLetterSpacing` 没改：`normal` 仍读作 0%。面板显示、改动说明都和以前一样。not shown 时报的 actual 也还是页面读出的值（0 时是 0%）。
- 行高的 `normal`（Auto）走的是 `readLineHeight`，不受影响。
- 也看了别的比较路径：其他宽度的核对走的是同一个 `lookStyle`，一起修好了。`other-usages.ts` 比的是两次页面读数（读法相同，0 两次都读作 0%），不和 `after` 比，不用改。

测试：

- 新浏览器测试 `test/letter-spacing-check.browser.test.ts`：画布上标题的字间距是 0.8px，改成 0px 或 0%。页面写 `0px`、`0`、`0em`、`0%`、`normal`，都判为显示了（先断言 Chrome 把 `0px` 算成 `normal`）。改成 0.5px 或 2% 而页面是 0 时，判为 not shown，actual 是 0%。非 0 的长度照旧按单位比。改前，0px 那条失败。
- 新 bench 场景 `panel-letter-spacing-zero`（tw4 示例）：intro 段落的字间距在面板里改成 `0px`（body 设的是 0.02em），scripted 写成 `tracking-[0px]`。改前 `--scripted` 失败（"change 1: the page's check says not shown"，⚠️ 下有 1 条），改后通过。已有场景都没动。

数字：

- `pnpm typecheck` 过。`pnpm test`：vitest 1215 过、1 跳过；node 129 过。
- 整套 e2e（`HT_E2E_PORT=6600`）：607 过、1 跳过、2 失败，两条都是 project files 组的 `round.spec.ts:556` 和 `:614`（ticket 75 的放置）。单独用 `--project="project files" --no-deps --workers=1 --repeat-each=3` 重跑，6/6 过，是负载下的抖动。
- `--dry` 30/30（main 是 29/29）。`--claim-out` 和 main 85c19a22 做 `diff -r`，已有的 29 个场景逐字相同，只多了新场景的 `panel-letter-spacing-zero.md`。
- `--scripted` 21/21（多了新场景，以前是 20）。

代定：

1. 改核对，不改读法：面板里 0 的字间距仍显示 0%，即使页面写的是 0px。
2. 0 和 0 相等，不看单位，也包括 0em、0rem。

风险：

1. `AS_WRITTEN` 的说明写的是「浏览器画得和写的不一样的属性」，字间距这一项的 `draw` 什么也不画，只是比较时把 0 当作相等。如果以后这张表加更多「只换比较」的项，说明要跟着改。
2. bench 的场景数变了（`--dry` 30、`--scripted` 21），以前记下的数字以这个为准。
