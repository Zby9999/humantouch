# 33: 任意图层上的生成说明

**What to build:** 设计师可以在任意已有图层上写一段生成说明，表达属性面板调不出来的意图（例如"按下时回弹感再强一点""标题超过两行就截断"）。带生成说明的图层在画布和图层树上有标记。改动说明把它作为一条独立改动（种类"生成说明"）列出，写明图层的源码位置、作用范围与说明原文；这条改动 `done` 时结果为"没能核对"。新建 Frame 上的生成说明仍归 19。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 06

**Status:** done

- [x] 属性面板中可为任意图层添加、修改、删除生成说明，画布即时显示标记
- [x] 图层树中带生成说明的图层有标记
- [x] 改动说明单列一节，包含图层位置、作用范围、说明原文
- [x] `done` 这条改动时输出没能核对，并提示 Agent 在报告中说明如何达成
- [x] Skill 补充：按说明达成意图，并在报告中写明做了什么
- [x] 撤销、逐条撤销、Discard all 对生成说明同样生效

## Comments

**实现记录（2026-10-29）**

- 改动单（`changeset.ts`）：`Change.kind` 多了 `"brief"`：属性名 `brief`（`BRIEF`），`before` 为 null，`after` 是说明原文；作用范围 `usage`，不带断点（在任何视图里写都作用于所有宽度）。同一图层再改说明仍是这一条改动（保留编号，`after` 换成最新的）；说明清空即删掉这条改动。新建 Frame 的生成说明仍写在它的 `create` 改动里（19、45）。
- 编辑命令（`edits.ts`，只加接入点）：
  - `brief(layer)` 改为对任意图层返回说明，没有时为 `""`（原来对非新 Frame 返回 null）；新增 `isNewFrame(layer)`，判断这个图层是否是新建的 Frame（它的说明写在画布上旁边的按钮里）。
  - `setBrief(layer, brief)` 对任意图层可用，返回说明所在的图层：新 Frame 走原来的路径；其他图层记一条 `brief` 改动，在这个使用处的所有实例上标 `data-vk-brief`。混排的裸文字先包 `<span>`（同改文字，`ownElement`）。每次提交是一步撤销（`structural`）。
  - `revertOne` 多一个 `brief` 分支，按图层 id 找元素（图层被删掉后也能撤回）；本轮新建的图层上的说明随新建一起撤回（`target.made`，`withDependents` 已有）。
  - 复制（`insertCopies`）：已有图层（不是本轮新建的）上的 `data-vk-brief` 不带到副本上：说明属于写它的那一处使用。本轮新建的 Frame（`data-vk-new="frame"`，包括复制进来的里层新 Frame 和新 Frame 的副本）的说明照旧带到副本上，与 19 原来的行为一致：副本在画布各视图和图层树上有同样的标记，属性面板的 "Brief" 一段显示这段说明（`brief(layer)` 在没有自己的 `brief` 改动时读元素上的说明）；`duplicate` 改动记下 `brief`（副本跟着做的说明）。在副本上再写说明记一条 `brief` 改动，`before` 是副本带来的说明（`after` 为 `""` 表示去掉）；改回原说明即无改动，撤销、逐条撤销（画布与保存的本轮）都回到带来的说明。
- 保存的本轮（`saved-round.ts`）：预览模式和刷新后在改动列表里逐条撤销，去掉各实例的 `data-vk-brief`。Discard all 在编辑模式中逐条 `revert`，同样生效。
- 界面：
  - 属性面板（新模块 `BriefSection.tsx`，`Shell` 放在 Design 面板最后）：只选中一个画布上的图层时有 "Brief" 一段（`role="group"`），新 Frame 和画布外的图层没有（前者用画布上的按钮，后者保持原样）。没有说明时标题旁是 "Add brief"（+），点开一个空输入框（沿用 19 的 `vk-textarea`），获得焦点；有说明时显示输入框和 "Remove brief"（−）。失焦或 ⌘Enter 时提交（去掉首尾空白，与原来相同则不记），Esc 恢复原文不提交；回车换行。输入框按图层（元素或裸文字的文字节点）和说明重建，撤销后跟着变。在画布上按下另一个图层时，面板先重绘、输入框没等到失焦就被换掉：卸载时把已输入但没提交的文字仍写到原图层上，选中不被拉回。
  - 画布标记（新模块 `BriefMark.tsx`，`CanvasView.tsx` 只加了接入点）：画布上每个带说明的图层（各实例）在每个视图里，右上角有一个小的强调色方块，内含 19 的 brief 图标（与新 Frame 旁的按钮同色同图标），不接收鼠标，读屏忽略。选中新 Frame 时，在显示按钮的那个视图里由按钮代替标记。隐藏（未绘制）的图层不画。
  - 图层树：沿用已有的 `vk-tree-brief`（Tabler 的 note 图标），它按 `data-vk-brief` 判断，所以任何带说明的图层都有标记，title 为 "Brief: …"。
  - `Shell` 里画布按钮和属性面板共用一个 `writeBrief`；裸文字包了 `<span>` 之后选中这个新图层。
- 改动说明（`change-notes.ts`、`design-values.ts`）：新 Frame 的副本那条 Duplicate 多一行 "**Brief:** “…”, as the Frame it copies has it. Make what it asks for in the copy too, as in that Frame."；副本上改写的说明，Brief 一行注明 "in place of the brief the copy was made with, “…”"，去掉时写 "none: taken off"，Design intent 为 "Make this copy without what the brief it was copied with asks for: leave it a Frame as the designer drew it."，改动列表显示 "taken off"。种类 "Brief"，每条一节：Layer、Location（源码位置，本轮新建的图层写 "New"）、Scope、Breakpoint（all breakpoints）、Design intent（按说明达成意图、按项目已有写法、在作用范围内，并在报告中写明做了什么）、**Brief:** 说明原文、Reference style（"none: a brief is the designer's words, not a style"）。改动列表显示 "Brief · Card  “…”"，过长截断（与新 Frame 的说明相同）。
- `done`（`cli.ts`）：生成说明不等页面核对，直接输出 "Not checked on the page: a brief asks for what the Design panel cannot set, so the page has no value to check it by. Say in your report how you achieved it: what you changed, and where."；理由文字放在 `service-protocol.ts`（`BRIEF_UNCHECKED`），页面上的核对（`check.ts` 的 `uncheckable`）对这种改动也给同样的理由。
- Skill：Duplicate 的落地规则补充新 Frame 副本按同一说明做、副本上的 Brief 改动替换它；种类表加 Brief；字段 Brief 说明两种用法；落地规则新增一条：按说明达成意图（可能是样式、过渡或动画、状态、prop、文字的限制），按项目已有写法、在作用范围内，所有宽度；`done` 不核对，在报告中写明做了什么（达成写在 ✓，只能接近或做不到写在 ⚠️）；"Not checked" 一项列入生成说明；报告示例加一行。
- 测试：辅接缝 1 `edits.browser.test.ts` 新增 "a brief on any layer"（已有图层的说明是一条独立改动、各实例都有标记；改说明仍是一条、清空即无改动、每次一步撤销；改动列表撤销在画布和保存的本轮上都去掉说明与标记；本轮新建的图层上的说明随新建撤回、复制已有图层不带说明；裸文字先包 `<span>`；页面核对给出没能核对），19 的用例改为新的 `brief` / `isNewFrame` 约定，并新增新 Frame 的副本带着说明（`duplicate` 改动的 `brief`、在副本上改写说明的 `before`、撤销与逐条撤销回到带来的说明）。命令行接缝 `cli.test.ts` 新增改动说明的一节和 `done` 的输出，以及新 Frame 副本的 Brief 行、副本上改写或去掉说明的一节。主接缝新增 `brief.spec.ts`（面板写说明后三个视图各 3 个标记、图层树标记、改动列表；改、Esc、Remove brief 与 ⌘Z / ⇧⌘Z；输入后直接在画布上点别的图层；多选没有这一段；编辑模式与预览模式的逐条撤销、⌘Z 找回、Discard all），`create.spec.ts` 补充新 Frame 选中时其他视图有标记，以及 ⌘D 复制它后副本在各视图、图层树和属性面板上都带着说明；`brief.spec.ts` 补充复制带说明的已有图层，副本没有说明。

**已知限制**

- 删除带说明的已有图层（或挪出画布）时，说明这条改动仍留在本轮里，与对它的样式改动一样；改动说明里会先后出现"达成说明"和"删除"。撤回删除后说明照旧。
- 复制带说明的已有图层，副本没有说明（说明只属于原来那处使用）；复制本轮新建、带说明的 Frame，副本带着同一段说明。
- 画布外的图层不能写说明；拖回画布后作为新图层可以写。
- 画布标记固定在图层右上角，图层很小或彼此紧挨时可能盖住相邻图层的一角；它不接收鼠标，不影响点选。
- `done` 对说明不等页面答复就输出，但仍照常写入核对请求，页面会答"没能核对"，没有人读这个答复。
- 推广到组件（ticket 20）未做，说明的作用范围总是这一处使用。

