# 129: 把值换成同值的另一个 Variable，也算一次改动

**What to build:** 现在，图层上的值来自 `primary`，设计师把它换成值一样的 `brand-500`，改动列表什么也不记，面板也仍然显示 `primary`。⌥⌘V 粘一个同值的别的 Variable 也是这样。这是 119 的代定 3，和 117「选一个值和现在一样的变量不算改动」一致。

可在设计系统里，这是有意义的改动：设计师想让这处跟着 `brand-500` 走，以后 `primary` 改了，它不跟着变。Figma 里重新绑定变量也是一次改动。

要做到：
- 只换 Variable、值不变，也记成一条改动。
- 改动说明里写清楚：值不变，只是改用这个 Variable。
- `done` 能核对代码里用的确实是新的那个 Variable。核对不了的，照「Not checked」的规矩处理。

参考 ticket 117、119，用词以 GLOSSARY.md 为准。

**Blocked by:** None. This is after publishing.

**Status:** ready-for-agent

- [ ] 在面板里把同值的 Variable 换掉，改动列表多一条，面板显示新 Variable 的名字。⌥⌘V 同样如此。
- [ ] 改动说明写明「值不变、改用 X」，有对应的 bench 场景（`--dry`、`--scripted`）。
- [ ] `done` 能核对时核对用的是哪个 Variable；不能核对时说 Not checked。
- [ ] 现有场景的 `--dry --claim-out` 逐字不变。

## 设计师决定（2026-11-10）

- 照 119 的规划会话代定：发布后另开这张票。
