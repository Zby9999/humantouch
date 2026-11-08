> 前端调优线（会话 musing-hellman，分支 claude/musing-hellman-3caa3c）和设计师定下的东西。规划会话审每一轮时读这份。
> 每条：定了什么 / 为什么 / 涉及文件。日期是设计师说的那天。代码里同样的决定在注释里写作 `(designer, 2026-11-0x)`。

# 设计师的原则

- **调整时以真实画面为准，把设计带过来时以 Figma 为准**（2026-11-08）。
  - 例子：色块 Figma 是 22px，设计师在真实画面上看过选了 19px；之后 Figma 149:7027 把它改成 20px，就按 20px 做。
- 一轮里不急着跑整套 e2e，一轮改完再跑（2026-11-07）。中途只跑相关的 spec。
- 新的工作方式（2026-11-08，规划会话转达）：本会话当指挥，每个修改派子 agent 在自己的 worktree 里做，做完合回本分支，再给设计师看。

# 第 1 轮（2026-11-05 至 11-08，WIP 提交）

## 面板的骨架

- **左右面板从 240px 加宽到 320px**（11-07）。
  - 为什么：按 Figma 的面板宽度。
  - 文件：`styles.ts`。
  - e2e 的视口跟着加宽到 1440×720，让中间的画布仍是 800px 宽：`e2e/playwright.config.ts`。
- **编辑器字体换成 Geist**（11-07）。
  - 编辑层加载时注册字体；切换按钮出现得比字体早，先用系统字体。
  - 文件：`editor-font.ts`、`editor.ts`。
- **图标线宽从 1px 改成 1.25px**（切换按钮也一样）。
  - 文件：`toggle-styles.ts`、`styles.ts`、`icons.tsx`。
  - 影响包大小：toggle 的 gzip 要守住 10240 B 的上限。
- **面板里的文字不能被选中，输入框里的可以**（11-07）。
  - 文件：`styles.ts`。
- **去掉 Design / Variants 两个标签页**（11-08，Figma 149:7027）。
  - 什么都没选时，面板显示 Variants（项目的 Variables），标题写 Variants。选了图层就显示 Design。
  - 原来「Select a layer…」那句空状态文字去掉了。
  - Play 按钮保留（Figma 上没有，见「待定」）。
  - 为什么：和 Figma 一致，Figma 不选东西时显示页面的属性。
  - 文件：`Shell.tsx`、`VariantsPanel.tsx`、`styles.ts`、README 第 45 行。
- **Variants 面板**（11-07）：按分组列出项目的 Variables。
  - 设计师说过，「在对应属性里也能套用 Variable，所以这里能不能套用无所谓」。
  - 文件：`VariantsPanel.tsx`。

## 工具栏（11-08，Figma 149:7027）

- 工具栏竖排在画布右上角，离 Design 面板 8px，顶边 72px。
  - 尺寸：间距 3、内边距 3、圆角 12；按钮 32×32，圆角 8。
  - 选中的工具：白底，加一圈细阴影。
  - 为什么放在这个高度：和视图顶边齐，压在视图标签下面。再高就会挡住最后一个视图的标签和它的 +。
  - 文件：`styles.ts`（`.tk-tools`、`--tk-tool-chosen`）。
- **已知的小重叠**：Layers 面板收起、按 ⇧1 显示全部视图（1440×900）时，工具栏压住 Phone 视图右上角，宽 6px、高 20px。
  - 截图：`.scratch/toolbar-overlap.png`。
  - 设计师还没定是「先这样」还是「让画布留出位置」。后者要改 `camera.ts`，上次试的时候弄坏过画布测试。

## 尺寸和间距（11-08，Figma 149:7027）

- Section 之间 20px。
- Section 标题：高 24px，下方 4px；标题后面有一条线延伸到边缘，有按钮时停在按钮前 4px。
- 行与行之间 4px；两列网格的间距 4px。
- 输入框和选择框高 30px；行尾的图标按钮 30px。
- 多段式按钮 26×26；对齐方格最低 64px。
- 面板顶部的标签 12px、字重 500，颜色 `--tk-panel-label`。
- 多个效果之间有一条分隔线，线的上下各 4px。
- 文件：`styles.ts`。

## 字段

- **字的标签**（Width、X、Y、Blur、Spread）至少 32px 宽，左对齐（11-08）。
  - 较长的 Blur、Spread 用 9px 字号。
  - 阴影的 X、Y、Blur、Spread 用文字不用图标（11-07）。
  - 文件：`styles.ts`、`Properties.tsx`（`NumberField` 的 `small`）。
- **色块**：20px，带 0.5px 细边，距输入框左边 6px（11-08）。
  - 文件：`styles.ts`。
- **宽高和它的方式相连**（11-07）：数字框和 Fixed/Hug 选择框相接的地方圆角是 2px，两端 8px。描边那一排的几个部分（颜色、粗细、线型、边）也一样。
  - 方式选择框的字比数字淡一些。
  - 文件：`styles.ts`。
- **最小、最大宽高**（11-07）：
  - 宽、高输入框的末尾各有一个 +，只在悬停或聚焦时出现。
  - 点 + 弹出菜单，选 min/max width 或 min/max height。选好的一项作为单独一行加进来，带减号可以删掉。
  - 文件：`Properties.tsx`、`Select.tsx`、`styles.ts`。
  - 附带修了两处：菜单选项的点击会穿到 Width 输入框上；菜单要等定好位置后再拿焦点，否则 Esc 会传到画布、退出编辑模式。
- **选择框**用编辑器自己的菜单，不用系统下拉（11-05）。
  - 底下仍是原生 select，存值和读屏都靠它。
  - 文件：`Select.tsx`。
- **勾选框**（11-07、11-08）：
  - 方框 20px、无描边。未勾选：浅灰底、浅色勾；勾选后：深底、浅色勾。
  - 方框后面跟文字，整条没有底色，悬停时变成 #ededec，和旁边的按钮一样。
  - 默认占半格；一行里只有一个勾选框时占满整行。
  - 文件：`styles.ts`。
- **Appearance**（11-08）：透明度和圆角一行，Visible 和 Clip content 一行。
  - 文件：`Properties.tsx`。
- **常亮的按钮**（独立圆角、Wrap）开着时用强调色，和选中的工具一样（11-07）。

## 改动标记（ChangeMarks，11-07 起）

- 这一轮改过的属性，在它自己的输入框上显示：蓝底白字，最右侧有一个重置按钮。点重置就撤回这一处改动，可以再撤销。
  - 为什么：设计师要在面板上直接看到哪里改过、能一键撤回。
  - 文件：`ChangeMarks.tsx`、`Properties.tsx`、`GridSection.tsx`、`styles.ts`。
- **断点下的改动也标在输入框上，断点区里原来的改动列表去掉**（11-07，设计师选了「整个列表去掉」）。
  - 在断点视图里，重置会回到继承值；宽和 right、高和 bottom 一起重置。
  - 文件：`BreakpointSection.tsx`、`BreakpointMark.tsx`（只剩 `togetherWith`）、`Shell.tsx`。
  - 查过 ADR 0008：它没写断点区要列出改动，所以不冲突。
- **一个值的几个部分分开标**（11-07）：描边的颜色、粗细、线型、边，各自标记、各自重置。
  - 文件：`ChangeMarks.tsx`（`ValuePart`）、`Properties.tsx`（`STROKE_PARTS`、`MarkedSelect`）。
- **重置按钮在最右**（11-07）：在选择框上时，放在下拉箭头后面。
  - 按钮 26px，底色比蓝底深一档（blue 400），距边 2px（11-08）。
- **宽高的方式**（11-08）：
  - 只把 Hug/Fill 改成 Fixed（或反过来）：只有选择框变蓝，带重置按钮。
  - 数字也变成另一个尺寸（拖动、输入）：数字和选择框一起变蓝。
  - 用选择框改成 Fixed 时，按当时的实际尺寸固定，数字不变，不标。
  - 文件：`Properties.tsx`（`SIZING`、`sizeOf`、`FIXED_AT`）、`styles.ts`。
  - 测试：`e2e/tests/layout.spec.ts` 新增一条；`resize.spec.ts` 的断点拖动那条，现在两个重置按钮都要出现。

## 悬停和动效（11-08）

- **悬停只变深，不出现蓝框**：输入框、选择框从 neutral 150 变成 neutral 200。
  - 蓝框只表示选中（聚焦）状态。设计师原话：「hover时只加深，不显示蓝框，蓝框代表选中态」。
- **变蓝时不要动画，取消时要渐变**：设计师原话：「点击要无动画变蓝，取消再加渐变」。
  - 改了值，立刻变蓝；点重置，120ms 渐变褪回。
  - 输入框、选择框、勾选框都按这个规则。
  - 文件：`styles.ts`、`motion.ts`（`FIELD_STATE_MS = 120`；只是颜色变化，开了减少动态效果也保留）。

## 颜色和 Variables（11-05、11-07）

- **颜色选择器**是编辑层自己的，带 Variables 标签页（11-05）。
  - 渐变色在色条上编辑；画布上的图层显示渐变手柄，在每个视图里都能拖。
  - 文件：`ColorPanel.tsx`、`GradientHandles.tsx`、`color-spaces.ts`、`CanvasView.tsx`。
- 项目有颜色 Variables 时，没搜索的情况下按色板显示，项目自己的排在前面（11-07）。
  - 文件：`VariablePicker.tsx`。
- Variables 列表按和当前值的接近程度排序，最接近的在前（长度按 px，颜色按 OKLab 加不透明度）。
  - 文件：`variables.ts`。
- 套用 Variable 后，名字直接显示在输入框里，不另加框；指向它时提示可以打开 Variables（11-05）。
- 弹出层（颜色选择器、Variables）浮在 Design 面板左侧，用面板的配色（11-07）。
- 效果的 + 菜单里，阴影 Variables 排在效果类型下面，和 Figma 的效果样式一样（11-05）。

## 图层和图层信息（11-07）

- 图层信息：行高 24px，行间 4px，不加分隔线，标签宽 68px。「Not located」不用斜体，保留浅色。
  - 文本图层的名字就是它的文字内容。
  - 文件：`LayerInfo.tsx`、`styles.ts`。
- 图层树：有展开箭头的行缩进到箭头处；没有箭头的行缩进到图标处。
  - 文件：`LayerTreeView.tsx`。

## 交互行为（会改变行为的几处，请规划会话留意）

- **双击由编辑器自己判断**（11-05）：第二下在 700ms 内、离第一下不超过 8px、两下都没有拖动，才算双击。
  - 为什么：系统的双击速度要求点得比设计师觉得舒服的更快。
  - 文件：`selection.ts`、`CanvasView.tsx`、`AboveCanvas.tsx`、`ViewLabels.tsx`（去掉了几处 `onDblClick` 拦截）。

# 待定（等设计师）

- 工具栏和 Phone 视图的 6×20px 重叠：先这样，还是让画布留出位置。
- Fixed 改成 Hug/Fill 后，数字会跟着变成新的实际尺寸。现在只标选择框，数字要不要一起标，设计师还没说。
- Figma 149:7027 里还没做的：
  - 效果类型做成带图标、箭头在框内的输入框。
  - 面板拖动边缘的小把手。
  - Figma 上没有 Play 按钮，目前保留。

# 测试记录

- 2026-11-08，WIP 提交前：
  - 类型检查通过；单元测试 1030 条通过（1 条跳过）。
  - 面板相关 e2e（breakpoints、create、edit-mode、grid、layers、layout、move-placement、play、properties、resize、snapping、style-isolation、text-in-a-box、undo、variables-late、variables）：205 条全部通过。
  - 整套 e2e、性能、toggle 大小留到这一轮交审前再跑。
