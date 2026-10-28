# 11: 填充与描边

**What to build:** 属性面板提供完整的填充与描边：纯色、线性渐变、径向渐变（多个色标、可调角度）；描边的颜色、粗细、实线 / 虚线、分边设置。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 06, 25

**Status:** done

- [x] 可添加、删除、拖动色标，调整渐变角度，画布立即生效
- [x] 描边支持统一或分边设置
- [x] 已有的锥形渐变只读显示
- [x] 改动说明对每类改动给出设计意图与参考样式

## Comments

**实现记录（2026-10-28）**

- 新模块 `client/paint.ts`：填充与描边的设计语言值、读（计算样式）与写（画布 CSS）。`edits.ts` 只改了 `fill` 一项、加了 `stroke` 一项和 `setsOn`（见下），读颜色的 `colorReader` 移进 `paint.ts`（每个文档一个）。
- 填充：`{ type: "solid", color, opacity }`、`{ type: "linear", angle, stops }`、`{ type: "radial", shape, stops }`、`{ type: "conic", css }`；色标 `{ color, opacity, position }`，位置是 0–100 的 %。角度按 CSS（0° 自下而上，90° 自左向右）。只有一层背景、且是颜色或一个渐变时才提供填充；图片、多层背景、重复的线性 / 径向渐变不提供（和以前一样）。
  - 读：计算样式里的渐变按 CSS 规则补出省略的位置，px 换成 %，`to right`、`to top right`（按盒子比例）换成角度，Tailwind v4 的 `in oklab` 忽略。径向渐变的形状与中心（如 `circle at 30% 20%`）原样保留在 `shape`，面板不改它。
  - 写：颜色清掉已有的渐变；用渐变替换颜色时把颜色设为透明；在页面原有的渐变上改渐变时，渐变下面的颜色保留。只声明图层现在需要的 CSS，所以普通的颜色修改的参考样式仍只有 `background-color`。
  - 锥形渐变只读：`accepts` 拒绝设为锥形，面板只显示 "Conic gradient" 与说明，多选中只要有一个图层是锥形渐变，也只显示 Mixed、不能改。
- 描边：`{ color, opacity, weight, style }`，`weight` 是一个数（四边相同）或上右下左四个数，`style` 是 solid / dashed（页面的 dotted 读作 dashed）。写成 `border-width` / `border-style` / `border-color`；没有描边写 `border-width: 0px; border-style: none`。四边相同读回一个数，所以面板改分边时先归一（`strokeWith`），粗细为 0 即没有描边，`done` 的核对不会误报。
- "Currently set by"：`setsOn` 让填充在图层没有渐变时只查 `background-color`，不把 `background-image` 的"浏览器默认"写进改动说明。
- 面板（仿 Figma，spec "编辑层界面先仿 Figma 风格实现"）：
  - Fill 标题栏右侧是类型（Solid / Linear / Radial）和移除按钮。颜色转渐变是这个颜色淡出（Figma 的做法），渐变转颜色取第一个色标。
  - 渐变：线性有 Angle 数字框（可拖动图标、方向键），没有画布上的手柄。色标条显示渐变，色标是可拖动的手柄（`role="slider"`，方向键移动 1%、⇧ 10%，Delete 删除），点色标条空白处在该处加一个色标（颜色取渐变在那里的颜色），一次拖动是一步撤销。条下列出每个色标的位置、颜色、透明度和删除按钮（至少两个色标），"+" 在最宽的间隙中间加一个。
  - Stroke：颜色与透明度、移除；粗细、Solid / Dashed、Sides（All / Top / Right / Bottom / Left / Custom），Custom 显示上右下左四个数字框（四边相同时也保持显示，直到换别的选项）。
- 键盘：`CanvasView.tsx` 的 `isEditable` 把 `role="slider"` 算作自己处理按键的控件（方向键、Delete 不再移动或删除图层）；`Shell.tsx` 的撤销在 slider 上照常生效。两处各一行。
- 改动说明（`design-values.ts`）：如 "a linear gradient at 90° (left to right): #FF0000 at 0%, #0000FF at 50% opacity at 100%"、"a radial gradient from the middle out: …"、"1px solid #E5E7EB"、"dashed #FF0000, on some sides: top 0px, right 0px, bottom 1px, left 4px"、"no stroke"。只给四个正方向写方向词，斜角的方向依赖盒子比例，不写。Skill 补了一句 fill / stroke 的意思。
- 测试：辅接缝 `edits.browser.test.ts`（渐变的写与读、各种 CSS 写法的读、锥形只读、渐变下的颜色、描边统一 / 分边 / 虚线 / 没有、页面边框的读法、可用范围）；命令行接缝（渐变与描边的说法和参考样式）；主接缝 `properties.spec.ts`（线性渐变的角度与色标拖动、加、删、键盘、撤销，径向，锥形只读含多选，描边的各项）。

**已知限制**

- 径向渐变的形状、中心不能在面板里改，"可调角度"只对线性渐变。（已由 52 解决：面板可改中心与横纵半径；角度仍只对线性渐变，CSS 不能旋转椭圆。）
- 页面自定形状的径向渐变里用 px 写的色标位置，按默认椭圆的半径换算成 %，会有偏差。（已由 52 解决：色标保留 px，按真实的渐变长度画在色标条上。）
- 页面在渐变下面的颜色不显示在面板上（填充只有一层）。
- 小数粗细（如 0.5px）在 Chrome 的计算样式里会被取整到设备像素，核对可能误报。
- 和以前一样，0% 透明度的颜色读作没有填充。
