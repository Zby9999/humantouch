# 143: 色板里同一个数字在同一列，多出来的档收进可折叠的第二行

**What to build:** 设计师在官网上发现（2026-11-11，有截图）：Variables 的 Color 色板里，neutral 一行和 blue、purple 的列对不上，很不优雅。

- 官网的 neutral 有 0、50、100、150、200、250、300、400 … 950 共 14 档。blue 是 50–700，purple 是 100、200、400–700。
- 原因：ramp 的档全在 Tailwind 的 11 档上，才进 Tailwind 那一组的 11 列；neutral 多了 0、150、250，就自己成一组，列数不同。所以 neutral 的 500 和 blue 的 500 不在同一列。

设计师定的做法（2026-11-11）：

- 一开始选了「多的档单开一列」，后来改成「多的档收进第二行」。原因：现在每个色块已经够小了，这还只是多了几个 50；再加列，色块更小，就难点了。

做法：

- 大部分档在 Tailwind 档上的 ramp，和 Tailwind 那一组合成一组，主行照旧是 Tailwind 的 11 列。同一个数字永远在同一列，neutral 的 500 对 blue 的 500。ramp 没有的档照旧是虚线空格。
- 不在 Tailwind 档上的档，收进这个 ramp 的第二行。比如 neutral 的 0、150、250。
  - ramp 名字（标题）还是只有一个，在第一行。
  - 第二行默认折叠。有一个按钮展开、收起；展开后这个 ramp 是两行，第二行是多出来的那几档。
  - 只有有多余档的 ramp 才有这个按钮。
  - 第二行的色块和主行一样大，用同一套列宽。
- **设计师选定（2026-11-11，原型方案 A）**：
  - 原型在分支 `prototype/143-palette`（caab840a）：`.scratch/vernierkit/prototypes/143-palette-second-line.prototype.html`，底部黑条切换 A–D。照 A 做，样子和动效以原型为准。
  - 开关是名字左边、面板左侧留白里的一个小箭头，和分组标题的展开箭头同一种：收起时朝右，展开时朝下（转 -90° 到 0，160ms ease-out）。名字不让出宽度。整块名字（连同留白里的箭头）可以点，悬停有底色。
  - 第二行的色块放在比它小的那一档下面：150 在 100 下，250 在 200 下，没有更小的（0）放在第一列（50）下面。第二行其余位置空着，不画虚线格。
  - 展开、收起：第二行高度用 grid-template-rows 0fr→1fr，200ms ease-out（`cubic-bezier(0.23, 1, 0.32, 1)`）；色块淡入并从上方 3px 落下，彼此错开 25ms。prefers-reduced-motion 时不动。
  - 选中层用的 Variable 在折叠的第二行里时，自动展开，让它的选中圈看得见。
- 仍是代定，写进 Comments：
  - 展开状态记不记住。
  - Variable 弹出框里的色板没有名字列，箭头放哪里。
  - 「大部分」怎么算，比如至少一半的档在 Tailwind 档上。
- 不在 Tailwind 档上的别的体系照旧，比如 Radix 的 1–12，或 10–90。
- 一行最多 16 档、超过就折行的规矩（`LINE_MAX`）不变。
- Variables 面板的色板和 Variable 弹出框里的色板，用的是同一个排法，两处一起变。弹出框里的色板没有名字，按钮的放法是代定。

用词以 GLOSSARY.md 为准。

**Blocked by:** None。发布前做（设计师 2026-11-11 定）。

**Status:** ready-for-agent

- [x] 单元测试（`palette`）：用官网这三条 ramp（neutral 0、50、100、150、200、250、300、400 … 950；blue 50–700；purple 100、200、400–700），得到一组 Tailwind 的 11 列。各 ramp 的每一档在对应的列，缺的是空。neutral 另有第二行，是 0、150、250。只有 Tailwind 档的项目和改前相同，Radix 1–12 的例子也照旧。
- [x] e2e：示例里加一条带 0、150、250 的 ramp，或用已有示例改出这种情况。在 Variables 面板和 Variable 弹出框里：
  - 各 ramp 的 500 色块左边缘 x 相同，色块宽度和改前一样；
  - 第二行默认看不见；按按钮展开，0、150、250 出现在第二行，点其中一个能绑定；再按收起。
- [ ] 已有色板、Variables、弹出框的测试全过；`--dry` 全过，`claim-out` 和改前逐字相同；`--scripted` 全过；整套 e2e 过。

## Comments

### 改了什么

- **分组**（`VariantsPanel.tsx` 的 `palette`）：一条 ramp 至少一半的档在 Tailwind 的 11 档上，就进 Tailwind 那一组，主行照旧 11 列，同一个数字永远在同一列。原来是「全部档都在 Tailwind 档上」才进。不在 Tailwind 档上的档，进这条 ramp 的第二行：`Scale.ramps` 的每一项从 `[name, cells]` 变成 `[name, cells, extra?]`，`extra` 是第二行，也排在同一套 11 列上：
  - 每档放在比它小的那一档下面：150 在 100 下，250 在 200 下；没有更小的（0、25）放在第一列（50）下面；比 950 大的（1000）放在 950 下面。
  - 两档落在同一列时（比如 125、150、175 都在 100 下），后面的另起一行，仍在那一列（代定 4）。
  - 没有多余档的 ramp 没有第三项，所以只有 Tailwind 档的项目，`palette` 的结果和改前逐字相同。
- 不够一半的照旧自成一组，和以前一样按「大部分档相同」合组：Radix 1–12、10–90 都不变。`LINE_MAX`（16）不变。
- `paletteLines` 把第二行跟在 ramp 的第一行上返回。Tailwind 组只有 11 列，总是一行。
- **Variables 面板**（`Palette`）：有第二行的 ramp，名字换成一个按钮 `SecondLineButton`，照原型 A：
  - 名字左边、面板左侧 16px 留白里有一个 12px 的箭头（`chevron-down`）。收起时转 -90°（朝右），展开时 0°（朝下），160ms，`EASE_OUT`。
  - 名字不让出宽度，箭头是绝对定位的。
  - 悬停时，名字连同留白（inset -2px -2px -2px -16px）有 `--ht-field` 底色，箭头变深。按下时 scale 0.97。键盘聚焦有描边。
  - `aria-label` 是 `graphite, more steps`（含看得见的名字），`aria-expanded` 表示开合。
  - 第二行（`SecondLine`）在主行下面，色块和主行同一套列宽，用 `grid-column` 放在各自的列里。其余位置空着，不画虚线格。
- **展开、收起**：
  - 高度用 `grid-template-rows` 0fr→1fr，200ms，`cubic-bezier(0.23, 1, 0.32, 1)`。
  - 色块淡入 160ms，从上方 3px 落下 200ms，彼此错开 25ms（`--ht-order`）。
  - 收起后整行 `inert` 加 `visibility: hidden`（等 200ms 动完才藏），所以 Tab 不会走到看不见的色块上。
  - 展开时用 `clip-path: inset(-4px)` 而不是 `overflow: hidden` 来裁，这样选中圈和悬停圈不会被切掉。
  - `prefers-reduced-motion` 时高度、色块、箭头都不动画（`transition: none`）。
  - 时长放在 `motion.ts`：`SECOND_LINE_MS`、`SECOND_LINE_FADE_MS`、`SECOND_LINE_STAGGER_MS`、`CHEVRON_TURN_MS`。
- **自动展开**（`useSecondLines`）：Variable 一进入「在用」，它所在的 ramp 的第二行就展开。面板里看 `inUse`，弹出框里看 `bound`。之后设计师可以手动收起，直到在用的 Variable 再变。
- **Variable 弹出框**（`VariablePicker.tsx` 的 `PickerPalette`）：和面板同一套排法。行里加了 `second?: { name, lines }`。弹出框没有名字列，箭头单独放在列表左边 12px 的留白里（代定 2）。点第二行的色块，照常绑定。

### 测试

- 单元（`test/palette.test.ts`）：
  - 官网三条 ramp：neutral 进 11 列，第二行 0、150、250 在 50、100、200 下；blue、purple 各档在对应的列，缺的是空。
  - 改了一条已有的：Untitled UI 的 25、gray-1000 原来是自己的 13 列，现在是 11 列加第二行（代定 3）。
  - 新增两条：同一列撞车另起一行；不到一半的 ramp 照旧自成一组。
  - 原有的 Tailwind、Radix 1–12、10–90、shadcn 那几条没改，全过。
- e2e（`variables.spec.ts`，新增 1 条，ticket 143）：
  - 用 `addColors` 把官网的三条 ramp 加进 React 18 示例。改名叫 graphite、ocean、orchid，免得和 Tailwind 自己的颜色重名。不改 `examples/`。
  - 面板：graphite、ocean、orchid 的 500 和 brand-500 左边缘 x 相同、宽度相同（20px）。只有 graphite 有箭头，箭头在名字左边。0、150、250 默认看不见。点开后它们分别在 50、100、200 正下方，宽度相同，第二行没有虚线格。再点收起，又看不见了。
  - 弹出框：选中 Card，打开 Fill 的取色器，切到 Variables。500 对齐、宽度和 brand-500 相同，箭头在色块左边。点开后点 graphite-150，取色器关掉，chip 显示 graphite-150，画布上 Card 的背景是 rgb(237, 237, 236)。再从 chip 打开，第二行自己展开，graphite-150 有 `aria-selected`；点箭头收起。
  - 面板里点第二行的色块，没测绑定。原因是面板只在什么都没选中时出现，那时 `takes` 是空的，所有色块都点不了，主行也一样。面板的自动展开也是这个原因，实际用不到，只在弹出框里测了（风险 2）。

### 审查后的修正

- reduced-motion 那段的选择器特异性不够，挡不住展开时的 `transition-delay`，色块还会一个接一个出来。改成 `transition: none`，并且直接写上 `.is-open` 的选择器。
- 弹出框的行把 `name?`、`extra?` 合成一个 `second?`，不会出现只有一半的情况。`.ht-variants-ramp.is-bare` 的两条规则合成一条。

### 结果（基于 main 2ee7414）

按规划会话 2026-11-12 的轻量流程（后来不再排锁）：
- typecheck 过。
- `pnpm test`：vitest 1271 passed、1 skipped，node 132/132。
- e2e，`HT_E2E_PORT=6800`，跑了 `variables.spec.ts`、`dark-mode.spec.ts`、`code-variables.spec.ts`，共 36 条：35 过，1 条超时。
  - 超时的是 `variables.spec.ts:290`（ticket 131，字段匹配列表里按 ↓ 走到底）。它跑的是 spacing 字段的列表，和色板无关，这张票没碰那段代码，当时用了 37.9s。
  - 单跑 `--repeat-each=3`：第一次 1/3 过（超时）。在 main 2ee7414 的临时 worktree（6850）上 3/3 过，每次 4s。紧接着本分支再跑 3/3 过，每次 3.3s。记为机器忙。临时 worktree 已删。
- 没碰 Skill、claims 和落地那条路径，也没碰热路径（拖动、缩放、进出编辑模式、画布绘制），所以没跑 bench `--dry` / `--scripted` 和 perf。最后一条勾选框里这几项留给规划会话在 main 上整批跑。

## 代定

1. 「大部分」：至少一半的档在 Tailwind 的 11 档上（正好一半也算）。
2. 弹出框里的箭头放在列表左边 12px 的留白里，和主行垂直居中，10px。只有箭头是按钮，没有名字。悬停有底色。这样色块的列宽和改前一样。
3. Untitled UI 的 25 和 1000 这类「几乎都是 Tailwind 档」的 ramp，原来是自己的 13 列，现在也照这张票的规矩进 11 列，25、1000 收进第二行，分别在 50、950 下面。
4. 两档落在同一列下面时（比如 125、150、175 都在 100 下），每多一档另起一行，仍在那一列下面，不往右挪。这种情况展开后会是三、四行。
5. 展开状态不记住：只在这个色板还显示时保留。关掉 Variables 面板、选中图层再取消、关掉弹出框后，都回到收起。在用的 Variable 在第二行时照样会自己展开。
6. 自动展开只在 Variable「变成在用」时触发一次。设计师手动收起后，不会马上又弹开。
7. 按钮的无障碍名称是 `<ramp>, more steps`。
8. 弹出框里「在用」指字段当前绑定的 Variable（`bound`），面板里是选中图层用的（`inUse`）。

## 风险

1. `clip-path: inset(-4px)` 让展开过程中第二行的下边可以多露出 4px。实际看不出来（色块正在淡入）。
2. Variables 面板只在什么都没选中时出现，所以那里的色块点不了，「在用」也总是空的。面板里第二行的绑定和自动展开都没有真正的使用场景，只有弹出框用得到。以后面板如果在有选中时也出现，自动展开已经接好了。
3. 撞车另起行（代定 4）只在单元测试里测过，没有截图。真实项目里出现 125、175 这类档的不多。
4. 箭头放在面板和弹出框列表的 padding 里，靠的是这两个容器 `overflow: auto` 时 padding 区域可见。以后改了 padding（面板 16px，列表 12px），箭头会被切掉。
5. 没在 Safari、Firefox 上看过 `grid-template-rows` 的动画和 `inert`。两者都支持，但动画手感没确认。
