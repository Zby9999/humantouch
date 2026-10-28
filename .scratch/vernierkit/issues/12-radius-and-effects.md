# 12: 圆角与效果

**What to build:** 属性面板提供分角圆角，以及效果：多层投影、内阴影、图层模糊、背景模糊。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 06, 25

**Status:** done

- [x] 圆角可在统一与分角之间切换
- [x] 可添加多层投影并分别调整偏移、模糊、扩展、颜色
- [x] 内阴影、图层模糊、背景模糊可添加与移除
- [x] 改动说明对每类改动给出设计意图与参考样式

## Comments

**实现记录（2026-10-28）**

- 新模块 `client/effects.ts`：阴影与模糊的设计语言值、读（计算样式）与写（画布 CSS）。`edits.ts` 只加了三项属性（`shadows`、`layerBlur`、`backgroundBlur`）和一行导入、一行类型导出；`paint.ts` 只把 `split` 导出。`CanvasView.tsx` 没有改。
- 阴影：`{ type: "drop" | "inner", x, y, blur, spread, color, opacity }`，一个图层的阴影是一个列表，第一个在最上面（CSS 的顺序），写成一条 `box-shadow`，没有阴影写 `none`。
  - 读：计算样式按逗号拆开，`inset` 读作内阴影。偏移、模糊、扩展都为 0 的阴影什么也不画，不论颜色都不读（Tailwind 用来组合的 `0 0 #0000`、ring 的 `0 0 0 0px #fff` 偏移）；面板里把一个阴影改到四项都是 0 也就是去掉它，和描边粗细为 0 一样。Tailwind 的 ring 读作一个扩展、无模糊的阴影。
- 模糊：图层模糊是 `filter` 里的 `blur()`，背景模糊是 `backdrop-filter` 里的 `blur()`，值是 CSS 的 px（null 为没有）。滤镜里的其他函数（`grayscale()` 等）原样保留、位置不变，只改、加或去掉 `blur()`。滤镜里有两个 `blur()` 时不提供该项。
- 面板（仿 Figma）：
  - Appearance：Corner radius 旁边是 Independent corners 开关，打开后在下面显示四个角（左上、右上 / 左下、右下）。四角不同的图层一选中就是打开的；关上时四角保持原样，统一的框显示 Mixed，输入一个值四角一起改。开关状态只对这一次选中有效；Appearance 不随选中重建，没按 Enter 的输入仍落在原图层上。
  - Effects（在 Stroke 之后）："+" 加一个投影（Figma 默认：0 / 4 / 4 / 0，#000000 25%）。每个效果一行：类型（Drop shadow / Inner shadow / Layer blur / Background blur）和移除；阴影下面是 X、Y、Blur、Spread 和颜色、透明度；模糊下面是一个 Blur 数字框。换类型时阴影与模糊之间带着模糊值互换（一步撤销）；图层模糊、背景模糊各只有一个，已有的那个在类型里不可选。多选时阴影不同显示 "Mixed shadows" 和移除，"+" 用一个新投影替换它们（Figma 的做法）；模糊不同显示 Mixed。阴影的行在阴影增减时重建：拖动数字框的图标把一个阴影拖到什么也不画、去掉了它，这次拖动就到此结束，不会接着改下一个阴影。
- 改动说明（`design-values.ts`）："a drop shadow (x 0px, y 4px, blur 4px, spread 0px, #000000 at 25% opacity) and an inner shadow (…), the first on top"、"no shadow"、"Layer blur / Background blur … from none to 4px"；分角圆角沿用原来的 "top-left 12px, …"。参考样式是 `box-shadow`、`filter`、`backdrop-filter`、`border-radius`。Skill 补了一句圆角、阴影、两种模糊的意思。
- 测试：辅接缝 `edits.browser.test.ts`（多层投影与内阴影的写与读、页面阴影的读法含 Tailwind 的占位与 ring、两种模糊的加与去、与其他滤镜共存、两次 blur 不提供）；命令行接缝（分角圆角、阴影、两种模糊的说法和参考样式）；主接缝 `properties.spec.ts`（分角开关与四角、页面阴影、阴影的增删改与换类型、两种模糊、撤销、拖到什么也不画的阴影、多选 Mixed 与替换、文字图层没有效果）。

**已知限制**

- 文字图层没有效果（CSS 的文字阴影是另一个属性 `text-shadow`），和描边一样只给容器、图片、静态画面。
- 模糊值是 CSS `blur()` 的 px，不是 Figma 的模糊值（Figma 的图层 / 背景模糊大约是 CSS 的两倍）；阴影的模糊与 Figma 相同。
- 多个实例的其他滤镜函数不同时，写入按所选实例的滤镜拼出一条，所有实例相同。
- 背景模糊只读写 `backdrop-filter`，不读 `-webkit-backdrop-filter`。
- 滤镜里的 `drop-shadow()`（如 Tailwind 的 `drop-shadow-*`）不读作阴影，面板不显示，写模糊时原样保留。
- 新效果加在列表最后（画在最下面）。
- 和填充一样，`done` 的核对按读回的 sRGB 十六进制颜色严格比较，页面上用 `color-mix()` 写的阴影颜色可能差一位而误报。
- "Currently set by" 只给出胜出的那条规则；Tailwind 的 ring 与 shadow、blur 与 grayscale 等共用一条 `box-shadow` / `filter`，来源可能是另一个类。
