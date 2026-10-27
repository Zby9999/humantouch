# 17: 合成与解散 Stack

**What to build:** 选中几个图层按 ⇧A 合成 Stack：根据当前位置推断方向、间距（相邻间距中位数）、内边距与对齐，合成后画面几乎不跳动。解散 Stack：子图层变为自由定位并固定在原位，原 Stack 变为 Frame，画面不动。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 15

**Status:** done

- [x] 横向跨度大于纵向时合成为横排，否则竖排
- [x] 合成前后图层位置偏差在可接受范围内（有测试覆盖典型排列）
- [x] 解散后每个子图层位置、尺寸与解散前一致
- [x] 改动说明清楚表达合成（含子图层顺序与推断出的参数）与解散
- [x] Skill 补充合成与解散的落地规则
- [x] 辅接缝 1 覆盖推断算法的各种分支

## Comments

**实现记录（2026-10-27）**

- 改动单（`changeset.ts`）：`Change.kind` 多了 `"stack"` 和 `"unstack"`。
  - 合成（`stack`）：`after` 是 `Composed`：推断出的 `direction` / `gap` / `padding` / `align`，按顺序排好的子图层（图层 id、`Target`、原来的 `Place`），以及新 Stack 的位置 `place`（所在容器、第几个、在容器子节点中的位置、全是自由定位时的 X / Y）。`place` 为 null 表示单独选中的 Frame 自己变成了 Stack。`before` 为 null。`target`：新 Stack 写它所在的容器（Agent 要在那里写新元素），Frame 变 Stack 写这个 Frame。
  - 解散（`unstack`）：`before` 是解散前的 `StackSettings`，`after` 是 `Dissolved`：Frame 的大小，每个子图层的 X / Y / 宽高和放在原位的 CSS。`sources` 记 `display` / `flex-direction` 由谁设定，改动说明照常写 "Currently set by"。
  - 新建的图层：新 Stack 的元素带 `data-vk-made`（它自己的图层 id），并沿用所在容器的使用链（写在容器的 JSX 里，否则其中的子图层会被当成实例）。图层模型的 `Layer.made`、`Target.made` 指向它；图层模型按 `made` 把各实例里的新 Stack 归为一组。之后对新 Stack 的改动是普通改动，`Target` 带 `made`、不算"未定位"，改动说明的位置写 "New: the layer is made in change N"，"Currently set by" 写 "nothing yet: the layer is new"；`done` 不核对（新图层在页面上没有标记）。19 的新建与复制沿用这一套。
- 推断（`stacks.ts` 的 `inferStack`，用外边距盒）：
  - 方向：比较"横向铺开多少"和"纵向铺开多少"，都是去掉最宽 / 最高那一个之后的跨度；横向更大为横排，否则（含相等、只有一个图层）竖排。**与规格字面"横向跨度大于纵向"有出入**：直接比跨度时，竖着排列的两段全宽文字会被判为横排、画面大跳，所以改为比较铺开的程度。对规格设想的自由定位图层，两者结果一致。
  - 顺序按主轴位置排；间距取相邻图层间距的中位数（偶数个取中间两个的平均），重叠时算 0。
  - 交叉方向的对齐：比较各图层与整体在起点、中线、终点上的最大偏差，取最小的（相同时按起点、中线、终点的顺序）。所有图层在交叉方向上一样宽（高）时写 `align-items: stretch`（设计语言仍是起点对齐），这样原来被拉伸的图层合成后仍然拉伸，不会缩回内容宽度。
  - 内边距：选中多个图层时新 Stack 正好包住它们，内边距为 0；单独选中一个 Frame 按 ⇧A 时（Figma 的做法），这个 Frame 自己变成 Stack，内边距取它的边框内侧到图层的距离，即规格的"内边距取外框到图层的距离"。
  - 外边距保留：间距按外边距盒量，所以 `mt-4` 这类外边距之外再加推断出的间距，画面不跳。
- 编辑命令（`edits.ts`）：`canStack` / `stack(layers)`、`canUnstack` / `unstack(layer)`。
  - 能合成：同一容器里的图层（直接子元素，不是混排的裸文字，不是冻结时钉在窗口的元素），且每个都在容器的每个实例里（循环渲染出的几个实例不能合成）；或单独一个有子图层的 Frame。新 Stack 放在第一个图层原来的位置；图层全是自由定位时新 Stack 也自由定位，停在它们的外框处，原来自由定位的图层改为 `position: static` 进入布局。
  - 能解散：Stack 的子图层都是元素（不含混排裸文字）且不是循环实例。解散后 Stack 写固定宽高、`display: block`（`inline-flex` 写 `inline-block`），未定位时加 `position: relative`；子图层写 `position: absolute`、`left` / `top`（相对边框内侧，减去外边距）和宽高。
  - 在使用处的每个实例里一起做（与其他编辑一致）。画布上的结构改动（`stacks.ts` 的 `compose` / `decompose` / `dissolve` / `undissolve`）只靠图层 id 和改动的值，编辑中的画布与保存的本轮共用。
  - 撤销：合成、解散各是一步；撤销合成后选中原来的图层，重做选中新 Stack（`Step.back`）。
  - 改动列表逐条撤销会连带撤销"建立在它之上"的改动（`withDependents`）：对新 Stack 本身、移入移出它的改动，以及之后又改变同一图层位置的结构改动，按编号从新到旧一起撤销；编辑模式中是一步，可以 ⌘Z 找回。
  - 图层身上来自结构改动的样式（解散后子图层的绝对定位、合成时的 `position: static`）在撤销其他改动时会重新写上（`canvas-style.ts` 的 `changesOn`，撤销样式改动、移动、合成、解散都用它）。
- 界面：⇧A 合成，⌥⇧A 解散（与 Figma 相同；⌥ 在 Mac 上会打出别的字母，按键位判断）；输入框和对话框里不响应。属性面板：多选可合成的图层或单选 Frame 时出现 Stack 一栏和 "Make Stack" 按钮；Stack 一栏标题旁有 "Dissolve Stack" 按钮。合成后选中新 Stack，解散后选中变成的 Frame。
- 改动说明（`change-notes.ts`、`design-values.ts`）：种类 "Make Stack" / "Dissolve Stack"。合成写新 Stack 的方向、间距、内边距、对齐，按顺序列出子图层（名称、开始标签、源码位置），以及放在容器的第几个或自由定位的 X / Y；Frame 变 Stack 写"Make this Frame a Stack"；有自由定位的子图层时多一行 "Join the layout"。解散写原来的 Stack 参数、Frame 的固定大小和定位参照，并逐个列出子图层的 X / Y / 宽高。改动列表显示如 "Make Stack · Frame  3 layers, horizontal, gap 24px"、"Dissolve Stack · Header  horizontal Stack → Frame"。
- Skill：种类说明、"New" 位置、"Join the layout"，以及合成（用一个新元素按顺序包住、flex 行或列）与解散（去掉 flex、固定大小、定位参照、子图层绝对定位）的落地规则。
- 改动预览与核对：合成、解散都计入 "N changes show once applied"；`done` 对结构类改动返回 "unchecked"（原因改为 "only style changes are checked on the page so far, not changes to the structure"），对新图层上的改动也返回 "unchecked"。
- 测试：辅接缝 1 `edits.browser.test.ts`（横排及中位数间距与顺序、竖排居中、终点对齐与"铺开不比纵向多"为竖排、重叠为 0 间距、Frame 变 Stack 的内边距、布局中合成不跳动且保持拉伸、各实例一起合成与循环实例不能合成、能否合成、撤销重做、新 Stack 上的改动及连带撤销、保存的本轮上撤回合成；解散后大小位置不变、有内边距边框外边距时不跳、撤销重做与保存的本轮、合成后再解散、能否解散）；命令行接缝（新 Stack、布局中与 Frame 变 Stack、解散、新图层上的改动）；主接缝新增 `stack.spec.ts`（⇧A 与 ⌘Z、Frame 中的自由定位图层用面板按钮合成、面板与 ⌥⇧A 解散、预览模式中计入"落地后可见"并出现在改动列表）。

**已知限制**

- 新 Stack 在会拉伸子元素的父 Stack 中会被拉满交叉方向（不加 `align-self`），其中居中或靠后对齐的图层可能因此移动；起点对齐（最常见）不受影响。
- 横排合成时，原来块级、宽度随父容器的图层会缩为内容宽度（位置不变）。
- 一个图层先被合成进新 Stack、再被拖动时，这次拖动并入它更早的移动改动（合并规则不变），改动说明的先后可能与实际操作顺序不同。
- 解散后再改子图层的 X / Y，然后在改动列表里单独撤回解散时，这些 X / Y 改动留在改动单里（画布上无害）。
- 不能合成或解散含混排裸文字的 Stack（例如按钮里的 "Get started"），也不能合成循环渲染的实例。
