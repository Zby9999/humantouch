# 13: 文字

**What to build:** 属性面板为文字图层提供完整排版控制：字体（仅项目已加载的）、字号、字重、行高、字距、对齐、颜色、大小写、下划线 / 删除线。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 06, 25

**Status:** done

- [x] 字体列表只包含项目已加载的字体
- [x] 各项修改画布立即生效
- [x] 段落中的行内片段随整个文字图层一起变化
- [x] 改动说明对每类改动给出设计意图与参考样式

**实现记录（2026-10-29）**

- 新模块 `client/typography.ts`：九项文字属性 `fontFamily`、`fontWeight`、`fontSize`、`lineHeight`、`letterSpacing`、`textAlign`、`textColor`、`textCase`、`textDecoration` 的读写（`TYPOGRAPHY`，只对文字图层），和面板用的字体列表 `fontsOf`。
  - 字体：读作文字字体栈里第一个可用的字体（已加载的 web 字体，或量宽度判定系统里有的字体）；改字体时写成页面上用这个字体的文字所用的那个字体栈（如 `"Space Grotesk", sans-serif`），参考样式里 Agent 能对上项目的写法。
  - 字体列表：`document.fonts` 里状态为 loaded 的 family（字重取已加载的 face，可变字体的范围按 100 展开），加上页面文字用到的每个字体栈里第一个可用的系统字体（字重取页面文字用它的字重）。
  - 行高 / 字距：面板按 Figma 显示 Auto、px、%（占字号的百分比）；单位沿用页面写的：页面写无单位数、%、em 时读成 %，写回同样的单位；px、rem 读成 px，rem 写回 rem（按根字号换算）；读不出单位（`var()`、`calc()`）或设计师输入另一种单位时，% 写成无单位数（字距写成 em），px 写成 px。页面写在祖先上的也算（继承来的）。字号用 px。
  - 行内片段：样式写在文字图层自身，片段靠继承一起变化。改动时把图层的这项值临时换成两个相差很远的值、看各片段是否跟着变（不改画布，当场还原）：不跟着变的片段算“保持自己的值”（`bolder`、`0.75em` 这类相对值跟着变，不算）；装饰不继承，片段自己画的线与图层不同才算。保持自己值的片段记在改动的 `keeps` 里（开始标签、文字、它的值）。
- `edits.ts` 只加了接入点：`PropertyValues` 继承 `TypographyValues`、属性表里 `...TYPOGRAPHY`、导出 `Definition`、`Definition` 上两个可选钩子 `keeps`（记入改动）和 `setOn`（继承来的样式，“Currently set by”去找它继承自的那个元素上的规则，如 `body`）。`changeset.ts` 的 `Change` 加 `keeps`（同一改动再改时随值更新）。`CanvasView.tsx` 没有改。撤销、实例、视图同步、`done` 的核对都走已有的通用路径。
- 面板（`Properties.tsx`）：文字图层显示 Text 段，按 Figma UI3 排：字体；字重、字号；行高、字距；对齐（左、中、右、两端）；大小写（As typed、Upper、Lower、Title）；装饰（无、下划线、删除线）。文字颜色在 Fill 段，用 ticket 11 的 ColorField（只有颜色，没有渐变和移除）。字体、字重只能选已加载的；文字现有的字体或字重没加载时作为禁用项显示。换字体时如果新字体没有加载当前字重，像 Figma 一样换到最近的已加载字重，和字体一起算一步撤销。多选文字图层时不同的值显示 Mixed，一起改。行高、字距可以拖图标调，从 Auto 拖时从约 1.2 倍字号的 px 开始。
- 改动说明（`design-values.ts`、`change-notes.ts`）：Font、Font weight（"Semi Bold (600)"）、Font size、Line height（"Auto (the font's own)"、"150% of the font size"、"24px"）、Letter spacing、Text alignment（"justified"）、Text color、Case（"as typed"、"upper case"…）、Decoration；参考样式就是画布上写的 CSS。有片段保持自己的值时加一行 **Inline fragments**，写明在文字图层整体上改、并列出保持自己值的片段及其值。Skill 补了这些词的解释，以及继承来的文字样式应写在图层自身上。
- 测试：`edits.browser.test.ts`（各项读写与参考样式、单位沿用、字体列表与字体栈、行内片段、继承来源、live 页面核对）；`cli.test.ts`（各项说法与参考样式、Inline fragments 一行）；`properties.spec.ts`（Text 段逐项改画布、换字体换字重与撤销、多选 Mixed、非文字图层没有 Text 段、文字图层的 Fill 只是颜色）。

**已知限制**

- 没有独立元素的文字（与元素混排的一段文字）和其他属性一样不提供文字样式。
- 系统字体浏览器无法得知装了哪些字重：只列页面文字用这个字体的字重。通用字体族（`system-ui`、`sans-serif` 等）按关键字列出，不显示它实际落到的字体名；字体栈里都量不出时取最后一个名字。
- 字体列表与行高、字距的单位判定每次渲染都现算（扫描画布文字、向上找声明），大页面上可能偏慢。
- 装饰只表示一种线：同时有下划线和删除线读作下划线，上划线读作无；从祖先画下来的装饰读作无。
- 多选文字图层颜色不同时 Fill 显示 Mixed、不能直接改（与 ticket 11 填充的 Mixed 一致）。
- 片段判定用两个探测值：恰好在两值下相同的相对值（如 `font-weight: bolder` 在极端字重）会误判为保持自己的值。
- 面板上文字颜色叫 Fill（同 Figma），改动列表和改动说明里叫 Text color。
- “行内片段（inline fragments）”还不在 GLOSSARY.md 里，可交给 domain-modeling 补。

