# 143: 色板里同一个数字在同一列，多出来的档各开一列

**What to build:** 设计师在官网上发现（2026-11-11，有截图）：Variables 的 Color 色板里，neutral 一行和 blue、purple 的列对不上，很不优雅。

- 官网的 neutral 有 0、50、100、150、200、250、300、400 … 950 共 14 档。blue 是 50–700，purple 是 100、200、400–700。
- 原因：ramp 的档全在 Tailwind 的 11 档上，才进 Tailwind 那一组的 11 列；neutral 多了 0、150、250，就自己成一组，列数不同。所以 neutral 的 500 和 blue 的 500 不在同一列。

设计师定的做法（2026-11-11，「按数字对齐，多的档单开一列」）：

- 大部分档在 Tailwind 档上的 ramp，和 Tailwind 那一组合成一组。这一组的列是组里所有 ramp 的档的并集，按数字排。像 neutral 的 0、150、250，各插一列。
- 同一个数字永远在同一列：neutral 的 500 对 blue 的 500。ramp 没有的档照旧是虚线空格。
- 官网的例子是 14 列：0、50、100、150、200、250、300、400、500、600、700、800、900、950。blue、purple 在 0、150、250 这几列是虚线空格。
- 「大部分」怎么算是代定，比如至少一半的档在 Tailwind 档上。写进 Comments。
- 不在 Tailwind 档上的别的体系照旧，比如 Radix 的 1–12，或 10–90。
- 一行最多 16 档、超过就折行的规矩（`LINE_MAX`）不变。
- Variables 面板的色板和 Variable 弹出框里的色板，用的是同一个排法，两处一起变。

用词以 GLOSSARY.md 为准。

**Blocked by:** None。发布前做（设计师 2026-11-11 定）。

**Status:** ready-for-agent

- [ ] 单元测试（`palette`）：用官网这三条 ramp，得到一组 14 列，顺序如上，各 ramp 的每一档在对应的列，缺的是空。只有 Tailwind 档的项目照旧是 11 列，结果和改前相同。Radix 1–12 的例子照旧。
- [ ] e2e：示例里加一条带 0、150、250 的 ramp（或用已有示例改出这种情况），Variables 面板和 Variable 弹出框里，各 ramp 的 500 色块左边缘 x 相同，0、150、250 列在别的 ramp 上是空格。
- [ ] 已有色板、Variables、弹出框的测试全过；`--dry` 全过，`claim-out` 和改前逐字相同；`--scripted` 全过；整套 e2e 过。
