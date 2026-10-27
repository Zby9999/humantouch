# 10: 布局类属性

**What to build:** 属性面板提供布局类属性：自由定位图层的 X / Y；宽、高的 Fixed / Hug / Fill 与最小、最大尺寸；Stack 的方向、间距、四边内边距、九宫格对齐、均匀分布、换行；透明度、显示 / 隐藏、裁剪内容。多选时数值不同的属性显示 Mixed 并可统一修改。全部使用设计语言，不出现 CSS 术语。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 06, 25

**Status:** done

- [x] 每个属性修改后画布立即生效，并产生对应改动记录与改动说明
- [x] Fill 只在父容器为 Stack 时可选
- [x] 普通从上到下排列的区域显示为纵向 Stack；修改其间距或对齐时，改动说明与 Skill 指示 Agent 把它改为真正的 Stack
- [x] 外边距不在面板中出现
- [x] 锁定图层只提供位置与外部尺寸
- [x] 多选时数值不同的属性显示 Mixed，修改后统一生效
- [x] 辅接缝 1 覆盖设计语言到画布样式的对应（Hug / Fill / Fixed、Stack 参数、自由定位）
- [x] 新属性在改动预览中生效

## Comments

**交接（2026-10-23，开工前请读，流程见 21 的交接）**

每个新属性都要接上已有的几件事：

- 在 `edits.ts` 的 `PROPERTIES` 里登记：适用的图层类型、`read`（读成设计语言）、`write`（画布上的 CSS，也是改动的 `style`、即参考样式）、`sets`（它读哪些 CSS 长属性）。缺了 `sets`，改动说明的 "Currently set by"（28）就没有；`read` 必须能用 `readValue` 在真实页面上读出与 `after` 结构完全相同的值，否则 `done` 的核对（29）会误报 "not shown"。
- 改动预览（25）直接把 `style` 注入真实页面，所以 `write` 产出的 CSS 要能单独作用在真实元素上，不能依赖画布特有的状态。
- `change-notes.ts` 的 `PROPERTIES` 名称表和 `value()` 要给新属性写好说法（设计语言，不出现 CSS 术语）。

10 本身：

- **冻结器钉住的样式。** 固定定位的元素（以及以页面为参照的绝对定位元素）在冻结时被写了内联 `!important` 的 `top` / `left` / 宽高 / 外边距（02、03 的已知限制）。读 X / Y、Fixed 尺寸之前，先在冻结器里给这些元素标记"哪些属性是冻结时钉住的"，否则会把冻结产物当成页面的值，"Currently set by" 也会写成内联样式。
- **Hug / Fill / Fixed 从声明值判断，不能从计算值判断。** 计算后的宽高永远是 px。`style-source.ts` 的 `sourcesOf` 能给出胜出的声明（如 `width: 100%`、类 `w-full`、`flex: 1`），可以复用来判断，并且同时得到来源。
- **普通从上到下排列的区域**显示为纵向 Stack，实际是块级流。改它的间距或对齐时，画布上要真的改成 `display: flex; flex-direction: column` 才能所见即所得；改动说明要写明"把它改为真正的 Stack"，Skill 同步。
- **显示 / 隐藏。** 图层模型会跳过 `display: none` 的元素（`layers.ts` 的 `drawnChildren`），用 `display: none` 隐藏会让图层从图层树里消失、再也选不回来。画布上要换一种方式隐藏，或让图层模型保留被设计师隐藏的图层。
- **多选目前不存在。** 选中是单个图层（`Shell.tsx` 的 `selected: Layer | null`，`selection.ts` 也是单选）。验收要求多选与 Mixed，需要先把选中改成一组图层（⇧ 单击、图层树多选）。`NumberField` 已经支持 `null` 显示为 Mixed。
- **锁定图层只提供位置与外部尺寸**：`kinds` 里要允许 `locked`，但只限这几项。
- 外边距不出现在面板中。

**实现记录（2026-10-23）**

- 新属性（`edits.ts` 的 `PROPERTIES`）：`x`、`y`、`width`、`height`、`minWidth` / `maxWidth` / `minHeight` / `maxHeight`、`direction`、`gap`、`padding`、`align`、`wrap`、`opacity`、`visible`、`clip`。设计语言的值：尺寸是 `{ type: "fixed", value }` / `{ type: "hug" }` / `{ type: "fill" }`（Fixed 是含边框和内边距的外部尺寸；Hug、Fill 不带数字，否则核对时页面宽度不同就会误报）；最小、最大尺寸为 px 或 null（没有）；内边距是上右下左四个数；对齐是九宫格 `{ x, y }` 加 `distribute`（均匀分布，即 `space-between`），对齐和分布合成一个属性，因为两者都写 `justify-content`。
- 定义的约定有变化：`write(value, el)` 能看元素（Fixed 在 `content-box` 时减去内边距和边框，尺寸按父 Stack 的方向写主轴或交叉轴），`writes` 列出可能写的全部 CSS 属性（撤销时去掉它们），`accepts` 判断某个值能不能用（Fill），`stack` 标出 Stack 自己的属性。
- Hug / Fill / Fixed 的判断：主轴上 `flex-grow > 0` 为 Fill；否则看声明值（`declaredValue`：画布上的编辑是内联 `!important`，其余用 `sourcesOf` 的胜出声明）：`auto` / `fit-content` 等随内容的值在交叉轴上被拉伸时为 Fill（flex 看 `align-self` / `align-items`，块级流只看宽度），否则 Hug；Stack 里的 `100%` 为 Fill；其他为 Fixed，数值取计算后的外部尺寸。写入：Fill 在主轴写 `flex: 1 1 0%` 和 `width: auto`，交叉轴写 `align-self: stretch`；Hug 写 `fit-content`；Fixed 写 px。
- Fill 只在有空间可分的 Stack 里可选：flex Stack 的两个方向、块级流的宽度；自由定位、Grid / Frame 里和块级流的高度都不行（`accepts`，面板里该选项禁用，`set` 拒绝）。
- 普通从上到下排列的区域：改它的方向、间距、对齐或换行时，画布上加 `display: flex; flex-direction: column`（方向按当前的），元素上记 `data-vk-as-stack`，改动带 `asStack: true`；改动说明多一行 "Make it a Stack"，Skill 同步（也说明了 Fixed / Hug / Fill 和 Stack 的意思，并提醒外边距在 flex 里不再折叠）。改内边距不会转换。
- 起始对齐：交叉轴的 "start" 在页面原本是拉伸（`normal` / `stretch`）时写 `stretch`，免得只改纵向对齐就让 Fill 的子图层缩回去。
- 冻结器钉住的样式：`pinToViewport` 在元素上记 `data-vk-pinned`（钉住的 CSS 属性）和固定定位元素随滚动的偏移 `data-vk-pin-offset`。`sourcesOf` 忽略钉住的内联声明，所以 "Currently set by" 和 Hug / Fixed 的判断读的是页面自己的样式；X / Y 读时减去偏移、写到画布时加上偏移（`declare`），改动的 `style` 仍是页面上的值，改动预览直接可用。
- 隐藏：画布上仍用 `display: none`，图层模型（`layers.ts` 的 `hiddenByEdit`）保留被设计师隐藏的图层，图层树里还在、可以再选中显示。隐藏的图层只提供 Visible。
- 撤销遇到多个改动写同一个 CSS 属性（如转成 Stack 的 `display` 和隐藏的 `display`）：恢复一项属性时，先恢复页面原来的值，再把这个图层其余改动的样式重新写上（`restoreStyle(el, property, others)`，画布和保存的本轮共用）。撤回一条改动时从改动单记的值出发，不读画布（隐藏图层读不出间距）。
- 多选：选中改为一组图层（`Shell` 的 `selected: Layer[]`，最后选的在末尾，单击的深度从它算）。⇧ 单击画布或图层树加入、移出选中；Esc 选中各自的父图层；每个选中图层都有选中框。属性面板只显示全部图层都有的属性，值不同显示 Mixed（数字框、复选框半选、尺寸下拉 "Mixed"）；修改按各图层自己的当前值算出新值（例如只改一边内边距），用 `editor.batch` 合成一步，⌘Z 一起撤销。`undo` / `redo` 改为返回图层数组。
- 面板（`Properties.tsx`）分段：Position（X、Y，仅自由定位）、Size（宽高的数字和 Fixed / Hug / Fill 下拉，输入数字即变 Fixed；最小最大尺寸留空为没有）、Stack（方向、间距、九宫格对齐、均匀分布、换行、四边内边距）、Appearance（透明度、圆角、Visible、Clip content）、Fill。没有外边距。锁定图层只有 Position 和宽高。
- 改动的说法（`design-values.ts`）：如 "Change the width from Hug to Fill."、"Change the alignment from top left to bottom center, spread evenly."、"Change the X position from 12px to 40px."。
- 编辑模式中切换按钮移到画布上方（离开左右面板各 240px），属性面板变长后不再挡住面板底部的控件。
- 测试：辅接缝 1 `edits.browser.test.ts`（尺寸的读与写、`content-box`、Fill 可用范围、最小最大、Stack 各参数、块级流转 Stack、自由定位与钉住的偏移、透明度 / 裁剪 / 隐藏、同一 CSS 属性的多个改动、锁定图层、批量一步撤销）；命令行接缝（说法、"Make it a Stack"）；主接缝新增 `layout.spec.ts`（尺寸、Stack、块级流、外观与隐藏、滚动后冻结的固定元素 X / Y 及其改动预览、锁定图层、多选与 Mixed、⇧ 单击画布、改动预览），`claim.spec.ts` 的布局改动说明，`round.spec.ts` 的布局改动核对。

**已知限制**

- 交叉轴对齐改成居中或末端时，尺寸为 auto 的子图层会从 Fill 变成 Hug（CSS 的拉伸只在 start 生效），Figma 里 Fill 的子图层不受影响。
- X / Y 是 CSS 的 `left` / `top`（相对定位参照的内边距边缘），父容器不是定位参照时，与"相对父图层"不同；15 的拖动会处理父容器设为定位参照。
- Grid、Frame 里的子图层只有 Fixed / Hug；Grid 的单元格拉伸显示为 Hug，留给 18。
- 读声明值要走一遍样式表，面板每次刷新对每个选中图层的宽高各走一次；大页面上若慢，再加缓存。

**设计师验收后的修改（2026-10-27）**

- 隐藏图层后面板保持原样：原来隐藏的图层只提供 Visible，面板其他各段一下子消失，Visible 也跳了位置。现在隐藏的图层照常提供并读出全部属性（编辑命令读、测量时把它暂时按显示状态排版，同一刻再隐藏回去，不会绘制出来；`Editor.measure` 给出显示时的位置大小），选中保留，面板不变，可以直接再勾上 Visible，也可以在隐藏时改其他属性（画布上仍保持隐藏，撤销重放时隐藏最后生效）。
