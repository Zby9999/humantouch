# 56: 只含文字的按钮与链接也能改外观

**What to build:** 页面上只含文字、但自己画出一个盒子的图层——`display` 不是 `inline`，并且有背景、边框、内边距、圆角或阴影之一（例如 `<button>Close</button>`，或做成按钮样子的 `<a>`、`<span>`）——不再归为文字图层，而是一个 Frame，里面是一个文字图层，与 Figma 里按钮是一个带文字的 Frame 一致。Frame 提供填充、描边、圆角、内边距、效果等容器的属性；里面的文字图层照常提供文字排版。纯文字（段落、标题、不画盒子的行内文字）仍整个是一个文字图层，行为不变。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 11、12、13、53（都已完成）

**Status:** done

- [x] 画出盒子的只含文字的图层，在图层树里显示为 Frame（图层名照旧按用途取，如 Button、Link），下面是一个文字图层；纯文字的图层不变
- [x] 这个 Frame 的属性面板提供填充（背景）、描边、圆角、内边距和效果（`box-shadow`），它在页面上原有的背景、边框、圆角和 `box-shadow` 能正确读出
- [x] 里面的文字图层提供文字排版（字体、字号、字重、颜色等），样式写在这个 Frame 自己的元素上，不为它包 `<span>`；改动说明写明改的是这个 Frame 里的文字
- [x] Frame 里只有这一段文字时，文字图层上的改动`done` 时在 Frame 的元素上核对，不再输出没能核对
- [x] 在画布上单击选中 Frame，双击直接修改文字内容（与 19 里双击文字一致）；里面的文字图层可以在图层树里选中
- [x] 撤销、断点上的改动、推广、设计变量和生成说明，对这个 Frame 和里面的文字图层都照常生效
- [x] 示例项目里 Dialog 的 Close 按钮能改背景、边框和圆角

## 背景

- 现象：只含文字的 `<button>`、`<a>` 现在是文字图层。13 让它的填充只改文字颜色，11、12 的描边、圆角和 `box-shadow` 不给文字图层，53 给它写的是 `text-shadow`，它原有的 `box-shadow` 不显示。示例项目里 Dialog 的 Close 按钮就是这样：设计师最常改的按钮，背景、边框、圆角都改不了。
- 根源在图层模型判定文字图层的规则（03），不是属性面板这条线带来的回退。属性面板线整线审查时发现，因为要改图层模型，没有在合并前做。
- 用户的决定（2026-10-29）：按带文字的 Frame 做，不在文字图层上加盒子属性的特例。那样的话，填充在同一种图层上有时是背景、有时是文字颜色。
- 实现提示：编辑层已经会把容器里混排的一段裸文字建成文字图层（03 的决定，例如按钮里既有图标又有文字时），主要改动在判定文字图层的规则。改了之后，要一并处理这种文字图层上改动的核对、画布上的点选，以及把这类按钮当作文字图层的已有测试（例如 Dialog 的 Close 按钮，53 已知限制里的那一条）。

**实现记录（2026-10-29）**

- 图层模型（`layers.ts`）：只含文字的元素（`isText`）在“画出盒子”时（`drawsBox`：自身 `display` 不是 `inline`、`contents`，且有不透明背景或背景图、任一边框宽度 > 0、任一圆角 > 0 或 `box-shadow`；只有内边距、没有这些时，只有 `<button>`、`<a>` 或 `role` 为 `button`、`link` 的才算，好让无底色的幽灵按钮也能改内边距和外观，只含文字的 `<td>`、`<th>`、`<li>`、`<p>`、`<span>` 等只有内边距时仍是一个文字图层；按显示时的样式判定，被改动隐藏的也一样）不再是文字图层，而按容器建：里面只有一个文字图层，即这个元素的全部文字（`textIn`：所有文字节点，行内片段里的也算，没有自己的元素，沿用混排裸文字的 `text` 字段）。容器照常按 `display` 分类：`inline-block`、`block` 的是 Frame（示例里 Dialog 的 Close 按钮），`inline-flex` 的是横向 Stack，名字照旧按用途取（Button、Link）。不画盒子的只含文字的元素整个仍是文字图层，行为不变。`layerOf(文字节点)` 改为向上找到所在的图层元素，并认 run 里任一节点，所以起始文字在 `<b>` 里时也能找回。为编辑而包上的 `<span data-vk-wrap>` 在 `isText` 里算作自己的图层，所以 Frame 的文字被包上之后仍是“Frame 里一个文字图层”。
- 新的判断：`isOnlyText(layer)`（Frame 唯一的内容是这段没有自己元素的文字）、`onlyTextOf(frame)`、`aroundText(frame)`（Frame 里只有这段文字，或它被包上的 `<span>`）。
- 编辑命令（`edits.ts`）：
  - `can`：Frame 唯一的文字只提供“只属于文字”的属性（`kinds` 只有 `text` 的：九项文字排版和 `textShadows`），读写都在 Frame 的元素上，文字靠继承变化，不包 `<span>`；它没有填充、描边、圆角、尺寸、位置、显隐、透明度。Frame 不提供文字属性（`kinds` 不含 frame）。`padding` 的 `kinds` 加上 frame，只对 `aroundText` 的 Frame 生效（`Definition.applies` 多了第二个参数 `layer`）。
  - 改动的目标（`targetOf`）：Frame 唯一的文字不记 `run`，记 `onlyText: true`，路径到这段文字（如 `Page › Dialog › Button › Close`），元素是 Frame 的开始标签；所以 `done` 在 Frame 的元素上核对（ADR 0006），不再输出没能核对。只有文字的 Frame 自己的改动也带上它的文字（`context.text`），以便标记移动后认出它。
  - Frame 和它的文字共用一个元素、一个图层 id：`ofLayer` 把记在这个 id 上的改动分给两者（文字排版、`textShadows` 和改文字属于文字，其余属于 Frame），用于断点上“在这里改过”的列表与继承、推广和推广后留下的改动。撤销、重做、继承、从改动列表撤回按属性找回图层（`layerFor`），`Step.texts` 记下哪些步骤是对文字做的，撤销、重做后选中的仍是文字图层。
  - 改文字（`setText`）：Frame 唯一的文字在 Frame 的元素上改，不包 `<span>`，与以前把按钮当作文字图层时写在同一个元素上。生成说明、删除、移动、挪出画布仍走 `ownElement`，像混排的裸文字一样先包 `<span>`（33 的做法）；`wrap` 改为把文字所在的整个行内片段一起包进去。
  - 推广（20）：Frame 和文字各自推广自己的改动；`inComponent` 允许 Frame 唯一的文字。
- 画布与外壳：在选中的只有文字的 Frame 上双击（或在选中 Frame 后双击其文字）直接在 Frame 的元素里打字（`CanvasView.tsx` 只改了双击的判断，另有挪出画布那一处判断排除文字图层）；`Shell` 打字开始时不包 `<span>`，结束后选中这段文字；`isOutside` 不再把画布外按钮的文字当作画布外的图层本身。单击按原来的深度规则选中 Frame，文字图层可在图层树选中。
- 属性面板：只有文字的 Frame（不是 Stack）多一段 “Padding”（与 Stack 段里的四边内边距是同一组控件 `PaddingFields`）；它的 Fill 是背景，Stroke、Corner radius、Effects（`box-shadow`）照常。文字图层有 Text 段、Fill（文字颜色）和 Effects（`text-shadow`），图层信息里说 “The text of Button: its text styles are written on Button itself.”
- 改动说明（`change-notes.ts`）：Layer 一行写成 “Close, the text in Button, `<button …>` (… › Button › Close)”；文字样式改动多一行 **The Frame's only text**：文字没有自己的元素，把文字样式写在 Frame 自己的元素上，由文字继承，不要给文字包元素。Skill 补了这一项。
- 测试：辅接缝 `edits.browser.test.ts` 新增 “text that draws a box is a Frame with a text layer in it”（10 个：图层模型与哪些仍是文字图层；Frame 读出页面原有的背景、描边、圆角、内边距、阴影，不提供文字属性；文字只提供文字属性、写在按钮上、不包 `<span>`、live 页面核对 shown；撤销重做仍是文字的改动、选中文字；改文字；生成说明与删除包 `<span>`、Frame 仍有内边距；旧的本轮继续可用；窄视图里各自的改动、Frame 的自由定位属于 Frame；隐藏后不改变分类），设计变量一节新增按钮文字的字号变量与按钮的内边距变量各归各的；`promote.browser.test.ts` 新增 Frame 与文字各自推广；命令行接缝 `cli.test.ts` 新增改动说明的 Layer 行与 **The Frame's only text** 一行；主接缝新增 `e2e/tests/text-in-a-box.spec.ts`（4 个，示例 Dialog 的 Close 按钮：图层树里是 Frame 和文字；改背景、描边、圆角、内边距并进改动列表；文字的字号写在按钮上、没有 span、撤销后仍选中文字；单击选中 Frame、双击改文字）。已有测试没有依赖“只含文字的按钮是文字图层”的断言，没有修改已有测试。

**已知限制**

- 判定看计算样式和标签：只有内边距的按钮、链接（含 `<a class="block px-3">` 这样的导航链接）也是 Frame 里一个文字图层；其他只含文字、只有内边距的图层（例如带内边距的 `<td>`、`<li>`）仍是文字图层，内边距在属性面板里改不了。`display: inline` 的元素即使有背景（行内高亮）仍整个是文字图层，背景改不了。
- 只有文字、`inline-flex` 或 `grid` 的按钮是 Stack 或 Grid，不是 Frame（按 03 的分类）。只有文字的 Frame 不提供 “Make Stack”。
- 给 Frame 唯一的文字写生成说明、删除、在 Frame 里拖动或挪出画布时，它会像混排的裸文字一样先包上 `<span>`（33 的做法），之后它是有自己元素的文字图层，再改文字样式就写在这个 `<span>` 上、改动带 `run`，`done` 输出没能核对。
- Frame 和它的文字共用一个元素，改动按属性分给两者；之前把按钮当作文字图层时记下的改动（同一元素、同一图层 id）照样对上：文字排版、文字阴影和改文字归文字，透明度、显隐、生成说明等归 Frame。这些旧改动的改动说明里 Layer 一行照旧（路径到按钮的文字为止、没有 **The Frame's only text** 一行），仍指向同一个元素。
- 改文字和推广的撤销、重做之后选中的是 Frame，不是文字（样式改动的撤销、重做选中文字）。
- `drawsBox` 不算 `outline`；背景是否透明按计算出的颜色的 alpha 是否为 0 判断（`rgba()` 的第四个值或 `/` 之后的值；`rgb()` 末尾的 0 是蓝色，不是 alpha）。

**收窄“画出盒子”（2026-10-29）**

- 只有内边距不再让任何只含文字的图层成为 Frame：只对 `<button>`、`<a>` 和 `role` 为 `button`、`link` 的算（`isButtonOrLink`），背景、边框、圆角、`box-shadow` 的判定不变。这样只含文字的 `<td>`、`<th>`（浏览器默认 1px 内边距）、带内边距的 `<li>` 等不再在图层树里多出一层 Frame。
- 顺带修正背景透明的判断：以前把 `rgb(255, 255, 0)` 这类蓝色为 0 的颜色当作透明（正则只看末尾的 `, 0)`），现在只认 `rgba()` 的第四个值或 `/` 之后的 alpha。
- 测试：`edits.browser.test.ts` 的 “text that draws a box is a Frame with a text layer in it” 新增一个：只有内边距的 `<th>`、`<td>`、`<li>` 是文字图层；只有内边距的幽灵 `<button>`、`display: block` 的 `<a>`、`role="button"` 的 `<span>` 是 Frame 里一个文字图层；有背景的 `<span>` 是 Frame 里一个文字图层。GLOSSARY 的“文字图层”条目补了一句：只含文字、但自己画出盒子的图层（例如按钮）是一个 Frame，里面一个文字图层。
