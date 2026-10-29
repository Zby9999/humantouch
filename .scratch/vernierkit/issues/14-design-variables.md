# 14: 设计变量

**What to build:** 本机服务读取项目中的设计变量（CSS 变量、Tailwind v4 主题、Tailwind v3 配置），属性面板按颜色、间距、圆角、字号、阴影分组显示，并提供 Figma 式的变量选择：点击颜色色块弹出颜色选择器，其中的变量页签按分组列出颜色变量（带色块预览、可搜索）；数值输入框旁的变量按钮打开对应分组的变量列表（可搜索）；已选用变量的输入框显示为变量名标签，可换成别的变量或解除绑定改回数值。设计师选用变量后，改动单与改动说明记录变量名，Skill 指示 Agent 引用变量而不是写死数值。读不到变量时只显示数值输入。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 10, 11, 12, 13, 50

**Status:** done

- [x] 三种来源的变量都能被读出并正确分组（Tailwind v3 用 50 的示例项目验证）
- [x] 布局、填充、描边、圆角、效果、文字中所有适用的输入框都提供变量选择器
- [x] 颜色选择器中有变量页签，按分组列出颜色变量并带色块预览
- [x] 变量列表可搜索
- [x] 已选用变量的输入框显示变量名标签，可更换变量或解除绑定
- [x] 选用变量后画布立即生效，改动说明中写明变量名
- [x] Skill 中补充优先引用变量的规则
- [x] 没有设计变量的项目中面板正常工作

## Comments

**补充（2026-10-23，来自完整一轮验证）**

Agent 落地时发现：设计师输入的精确颜色很少等于 Tailwind v4 的现成类（它的色板是 oklch），Skill 又没说近似值算不算"有合适的类"，Agent 只能自己判断。决定：变量只按精确相等判断，不让 Agent 判断近似。

- 设计师选用了变量：改动单记变量名。
- 自由输入的值：编辑层检查它是否恰好等于某个变量（换算到同一色彩空间后比较），等于就写明变量名，否则在改动说明中写明"没有对应变量，用精确值"。
- Skill 同步：有变量名就引用变量；写明没有对应变量时用精确值（Tailwind 用任意值），不找近似的类。

**实现记录（2026-10-29）**

- 读取（本机服务，新模块 `src/variables.ts`，`GET /variables`，不进保存的队列，每次进入编辑模式现读）：
  - CSS 变量：项目里的 `.css`（跳过 `node_modules`、`dist`、`build`、`out`、`coverage` 和点开头的目录；最多 300 个文件、8 层、每个 512KB）中 `@theme` 以外的 `--*` 声明。同名取第一个，所以 `:root` 先于 `.dark`。
  - Tailwind v4：项目 CSS 有 `@import "tailwindcss"` 时，读项目安装的 `tailwindcss/theme.css`（跳过 `reference` 块）作为默认值，再读项目自己的 `@theme`（覆盖同名默认值；`--color-*: initial` 清掉一个命名空间）。`--spacing` 生成 0、px、0.5 … 96 共 35 个步长，按类名后缀命名，值为 `calc(<spacing> * n)`。
  - Tailwind v3：用项目安装的 `tailwindcss/loadConfig` 与 `resolveConfig` 解析 `tailwind.config.*`；与空配置解析出的默认主题比较，值不同或默认里没有的算项目自己的。嵌套颜色用 `-` 连接，`DEFAULT` 取上一级名字（圆角的 `DEFAULT` 即 `rounded`），字号取数组第一项，`<alpha-value>` 换成 1。
  - 值里的 `var()` 用已读到的变量代入（v3 主题里的 `hsl(var(--primary))` 也是）；代入不了的不显示。
  - 分组：先按命名空间（v4 的 `--color-*`、`--spacing`/`--spacing-*`、`--radius-*`、`--text-*`（不含 `--text-*--*`）、`--shadow-*`；v3 的 colors、spacing、borderRadius、fontSize、boxShadow）。普通 CSS 变量先看名字，依次是 shadow、radius/rounded、colo(u)r、space/spacing、font/text/size，取第一个与值的类型相符的组；名字里没有这些词的再按值的类型：颜色、阴影，单个长度归入间距。只认 px、rem 和它们的 `calc()`/`min()`/`max()`/`clamp()`，不认 %、vw、em。项目自己的排在前面。
  - 共享的类型 `Variable`、`VariableGroup` 在 `service-protocol.ts`。
- 编辑层（新模块 `client/variables.ts`）：
  - `resolveVariables` 在画布文档里换算每个变量：颜色用画布的取色（与读图层颜色同一个 sRGB 读法），长度用探测元素的 `margin-left`（按页面的 rem），阴影用 `readShadows`。换算不了的去掉。
  - `bind` 给出改动的值的每一部分是哪个变量，只按精确相等判断：
    - 部分有：整值 `""`、`top` 等四边、`top-left` 等四角、`color`、`stop 1` 等色标。
    - 设计师选用的记为 `picked`，这部分的值不变就一直保留；解除绑定、改了值或撤销时重新按相等判断。
    - 没有变量相等时记 `null`。
- `edits.ts` 的改动：
  - `createEditor` 多一个可选的 `Binder`；`set` 的选项多一个 `variables`（选用或解除）。
  - `apply` 记录 `variables`，撤销重做时带上当时选用的变量。
  - `Editor.variables(layer, property)` 给面板读选用的变量。
  - 只解除绑定、值不变时也是一步编辑；选用一个与图层现值相同的变量不产生改动，也不产生撤销步。
  - `changeset.ts` 的 `Change` 加 `variables`，同一改动再改时随值更新。`CanvasView.tsx` 没有改。
- 面板（新模块 `client/VariablePicker.tsx`，`Properties.tsx` 接入；`Shell.tsx` 进入编辑模式时取变量，换算后经 context 给面板，并交给编辑命令判断相等）：
  - 颜色：有颜色变量时，色块是按钮，打开颜色选择器（浮层在属性面板左侧）。
    - 浮层有 Custom 页签（系统取色器）和 Variables 页签。Variables 页签按 "This project · brand"、"This project"、"Tailwind · red" 等分组列出，带色块和数值，可搜索。
    - 选用后，hex 与透明度的位置显示变量名，点它换别的变量，旁边的按钮解除绑定。
    - 适用于填充、渐变色标、描边颜色、文字颜色；阴影颜色不提供。
  - 数值：字段旁的六边形按钮打开该组变量列表（可搜索，显示 px）。选用后字段显示变量名，可换可解除。
    - 适用于宽、高、最小 / 最大宽高、间距、四边内边距、圆角与四角圆角、字号。
  - 阴影：Effects 标题栏有阴影变量按钮，选用后整体替换阴影列表，显示为变量名，解除后恢复各阴影行。选中里有文字图层时不提供。
  - 浮层按 Esc 或点外面关闭，焦点回到打开它的按钮。
  - 没有变量的项目：没有变量按钮，色块仍是系统取色器，与以前一样。
- 改动说明（新模块 `src/variable-notes.ts`，`change-notes.ts` 在 Design intent 后加一行 **Variables**）：
  - 有对应变量时写出变量名和用法："the gap is the Variable `gutter`, from the Tailwind theme: use its class, `gap-gutter`"。Tailwind v4 另附 `var(--color-…)`；CSS 变量写成 `var(--x)`。
  - 没有时写明 "no Variable has …'s value: use the exact value (with Tailwind, an arbitrary value: `gap-[23px]`), not a class or Variable whose value is close"。半透明颜色写成 `bg-[#3D63F5]/50`。
  - 类名前缀按属性与部分：bg、text、border、gap、pt/pr/pb/pl、w、h、min-w…、rounded / rounded-tl…、shadow；渐变色标是 from / via / to。
  - Skill 补了 **Variables** 的解释和 "Use the Variables the notes name" 一条：有变量名就引用，没有就用精确值，不找近似的类。
- 测试：
  - 新的 `test/variables.test.ts`：v3 示例的完整读取与排序、v3 主题里的 `var()`、v4 默认主题与步长、v4 项目 `@theme` 覆盖与清空、CSS 变量分组、没有变量、本机服务的口令。
  - `edits.browser.test.ts`：画布换算、自由输入的精确相等（含不同色彩空间、"相近不算"）、选用的保留与撤销、解除、色标、没有变量。
  - `cli.test.ts`：变量的说法与类名，没有对应变量的说法与任意值（含半透明）。
  - e2e 新的 `variables.spec.ts`：v3 示例上颜色选择器的 Variables 页签、搜索、选用、换、解除；内边距的变量按钮、换、解除与撤销；圆角、阴影、宽、字号；v4 示例的默认步长；Next 示例没有变量按钮。
  - `react18-round.spec.ts`：输入的 #EEF4FF 在改动说明里写成 `brand-50`。
  - `claim.spec.ts`：8px 写成 `gap-2`。`properties.spec.ts` 的取色器测试改为先打开颜色选择器。

**整线审查后的修正（2026-10-29）**

整线 code-review 对照"所有适用的输入框都提供变量选择器"和 spec 的"否则写明没有对应变量，用精确值"，补了三处：

- Grid 的行间距、列间距（ticket 18 后加的 `rowGap`、`columnGap`）归入间距组：`client/variables.ts` 的 `GROUPS` 与 `slotsOf` 加上它们，`GridSection.tsx` 两个字段旁有变量按钮（可换、可解除，也有 32 的按名称找与接近提示）。改动说明的类名前缀是 `gap-y`、`gap-x`。
- 阴影颜色是颜色变量：`shadows` 与 `textShadows` 的每个阴影的颜色是一个部分（`shadow 1`、`shadow 2`…），Effects 里阴影行的颜色字段和填充一样，色块打开颜色选择器（有 Variables 页签），选用后显示变量名标签，可换可解除；文字图层的投影也有。精确相等时改动说明写 "the color of shadow 1 is the Variable `brand-500` … `shadow-brand-500`"（文字图层是 `text-shadow-…`），没有时写没有对应变量与 `shadow-[#000000]/25`。阴影整体恰好是一个阴影变量（选用或相等）时只记这个阴影变量，不再逐个记它的颜色，和 Figma 的效果样式一样。
- 变量还没读回来时做的改动：`Shell.tsx` 在变量读回、换算后调用新的 `bindRecorded`，给本轮里已记下、还没有 `variables` 的样式改动按它们当时的值（`after`）做精确相等判断，补上变量名或"没有对应变量"，然后照常存一次、刷新改动列表。已经有变量判断的改动不动；已离开编辑模式或这一轮已 Discard 的不补。读取失败或项目没有变量时什么也不补，改动说明没有 **Variables** 行；Skill 的兜底仍成立（"Follow how the project already writes styles"：没有 Variables 行的就按项目的写法用类，找不到合适的类才用任意值）。
- 顺带：`client/service.ts` 的 `loadVariables` 改用共用的 `serviceRequest`，不再自己拼请求头。非 2xx 的回答现在也会在控制台提示一次，仍返回空列表。
- 测试：`edits.browser.test.ts` 加 Grid 行列间距、阴影颜色（含文字图层、整体是阴影变量时）、变量晚到后补判断；`cli.test.ts` 加 `gap-y`/`gap-x` 与阴影颜色的说法；e2e `variables.spec.ts` 加 Grid 两个间距的变量按钮、阴影颜色从颜色选择器选用与撤销、文字投影颜色按名称选用；`react18-round.spec.ts` 加"变量请求被拦住时改的填充，放行后存下的改动与改动说明写 `brand-50`"。

**已知限制**

- 只认设计师选用的变量显示变量名标签；页面源码里本来就用了变量（如 `p-gutter`）的值，面板显示数值，不显示标签。
- 选用一个与图层现值恰好相同的变量不产生改动：源码写死的值想改成引用变量，这样做不到。
- 同一个 CSS 变量在多处定义（如 `.dark` 主题）只取第一处；媒体查询、主题切换下的不同值不区分。
- Tailwind 的字号类（`text-lead`）同时设置行高；改动说明按字号给类名，没有提醒行高会一起变。
- 文字图层的投影不提供阴影变量（`text-shadow` 画不了 spread / inset，v4 的 `--text-shadow-*` 也未读），只有每个投影的颜色变量。
- 阴影颜色的类（`shadow-brand-500`）在 Tailwind 里给这一层所有阴影上同一种颜色；几个阴影颜色不同时，Agent 要把变量写进阴影值里（v4 用 `var(--color-…)`，v3 没有现成的 CSS 变量）。Tailwind v3 没有 `text-shadow-*` 类。
- 长度变量只认 px 和 rem（含 calc 等），% 和 vw 不认，em 不认。v4 的 `--container-*`、`--breakpoint-*` 等其他命名空间不读。
- v3 的配置由 `loadConfig`（jiti）加载，有模块缓存，开发服务器运行中改了配置，可能要重启才会读到新值。没有 `loadConfig` 的旧版 v3 退回 `import()`，读不了 `.ts` 配置。
- 每次进入编辑模式都要现读一次（遍历项目 CSS、加载 v3 配置），大项目上会多花一点时间；读取不在保存的队列里，不会挡住保存。
- 颜色按画布读成 8 位 sRGB 后比较：两个 oklch 颜色恰好落在同一个 sRGB 值上时，会被看成同一个变量（取排在前面的）。
