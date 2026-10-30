# 60: 同一图层各实例的编辑样式并成一条规则

**What to build:** 现在画布上每个被编辑的元素各有一个编辑样式表（画布 head 里的一个 `<style>`，规则以 JSON 记在 `data-vk-rules` 里）。改一个循环里的图层时，它的每个实例各有一个，96 个商品卡片就是 96 个样式表，改一步数值要改 96 个样式表，每个视图的样式失效检查都按样式表的数量付钱。把同一图层各实例的编辑样式并成一条规则（选择器按图层，例如 `[data-vk-layer="…"]`），或至少并进同一个样式表，让改数值时每个视图要检查的样式表从"实例数"个降到一个。设计师看到的画面、改动单的内容都不变；保存的画布格式会变，要给出兼容或迁移的办法。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（视图与断点见 ADR 0008，挪出画布的图层见 ADR 0009）。

**Blocked by:** None（设计师 2026-10-30 决定在本线、ticket 22 收尾之前做；本 ticket 依赖的就地改规则已在 22 里做完）

**Status:** done

- [x] 动手前在本 ticket 的 Comments 里写下方案：编辑样式新的数据结构（按图层还是按样式表）、断点（ADR 0008）的 media query 怎样放、画布外的图层（ADR 0009，`serializeEditable`）是否一起改，以及下面的兼容方案；设计师确认后再动手
- [x] 自动保存（`.vernier/` 里的画布）和改动单的 JSON 字段：写明哪些不变、哪些变；变的给出兼容或迁移方案（读到旧格式时怎样转成新格式、是否需要版本号）
- [x] 旧的保存画布仍能打开：用改动前保存的画布（含断点上的改动、多个实例的图层、画布外的图层）恢复，画面与改动前一致，之后还能继续编辑、撤销
- [x] 就地改规则（`canvas-style.ts` 的 `restyleInPlace`）和 `syncEditStyles` 的约定在新结构下仍成立：保存画布、新加视图、跟随画布的视图、`asPage` 读完页面本来的样式后，都显示最新值
- [x] 改动单的内容、`claim` 输出、设计师看到的画面都没有变化；全量 typecheck、单测、e2e 通过，测试数量不少于改动前
- [x] 用 headless 模式（`VK_PERF_HEADLESS=1 VK_PERF_PORT=5420 pnpm test:perf`）前后对比改 Corner radius 与 Stack Gap 的主线程时间，记在 Comments 中；有窗口 Chrome 的验收数字等设计师同意后再跑

## 背景

- 来自 ticket 22 的 headless 测量：大页面上改第 6 个商品卡片（96 个实例）的 Corner radius 时，96 个样式表让每个视图的样式失效检查花约 6ms；同样的改动放在一个样式表里约 2.5ms，写在 style 属性上约 1.6ms。并起来每个视图约省 4–5ms，三个视图约 12–15ms。
- 这要改编辑样式的数据结构（现在每个元素一个 key），因而改保存画布的格式，影响自动保存与恢复。设计师决定不在 22 里做，另开本 ticket 单独做（2026-10-29，见 22 的 Comments"设计师的回答"第 2 条）。
- 22 已做的就地改规则（`canvas-style.ts`）保留；本 ticket 只减少样式表的数量，不改就地改的做法。

## Comments

**方案，待设计师确认（2026-10-30）**

本条只是方案，没有改代码。设计师确认（或改动下面"需要设计师决定的问题"里的推荐）后再动手。

*现状*

编辑样式在 `canvas-style.ts`（下称"编辑样式模块"）里：

- 每个被编辑过的元素带一个 key（`data-vk-style="n"`），画布 head 里有一个对应的 `<style data-vk-edit-styles data-vk-rules-for="n" data-vk-rules='…'>`。`data-vk-rules` 的 JSON 是唯一的依据，分四块：`lifted`（元素 style 属性里原有的 important 声明，冻结器写的）、`copied`（复制或拖回的图层带来的样子）、`promoted`（推广到组件的改动）、`edits`（本轮的改动；`base` 是所有宽度，`at` 是各断点，ADR 0008）。CSS 文字由 JSON 写出，选择器是 `[data-vk-style="n"]`，断点放在各自的 `@media` 里，全部在 `@layer vernierkit-edits` 里。
- 模块的接口是"一次一个元素"：`declare` / `restoreStyle` / `relayOut` / `declarePromoted` / `copyRules` / `lookRules` 都收一个元素。调用方（`edits.ts`、`stacks.ts`、`moves.ts`、`layer-changes.ts`、`promote.ts`、`structure-edits.ts`、`saved-round.ts`）对图层的每个实例各调一次，所以 96 个实例就是 96 个 key、96 个样式表；改一步数值要解析和写 96 份 JSON、走 96 次 `restyleInPlace`（每次都 `replaceSync` 一个新的 CSSStyleSheet），每个视图的样式失效检查也按 96 个变化的样式表付钱。
- 写出：`serializeCanvas`（保存画布、自动保存 `.vernier/` 里的画布）、`serializeEditable`（画布外图层的 look，进 `.vernier/off-canvas.json`，拖回时还作为 `PutBack.layer.look` 进改动单）、`copyCanvas`（新加的视图），三处都先 `syncEditStyles` 把文字按 JSON 写出；`dropUnusedRules` 去掉没有元素用的样式表。
- 读回：`restore`（打开保存的画布）和 `revertSaved`（没有画布时撤回改动）都先跑 `moveInlineEdits`，把更早的"改动写在 style 属性里"的格式搬进编辑样式。撤销/重做的历史只在内存里，步骤按图层 id 和数值重做（`apply` / `restoreStyle`），不碰 key。
- 视图跟随（`views.ts`）：旁边的视图逐节点复制画布，编辑样式的元素收到新 JSON 后自己 `syncEditStyles`；只改编辑样式的变化在"一步改值"期间先不收（晚一帧，之后会改为停手后追上）。

*同一图层的各实例什么时候规则不同*

逐个查了写编辑样式的地方，下面几种情况下同一图层的实例会有不同的规则，所以"一个图层永远只有一条规则"不成立：

1. 只动了循环里的一个实例：移动（`moves.ts` 的 `relocate`，`data-vk-move` 标在那个实例上）、删除（`hide`，`data-vk-deleted`）。`restoreStyle` 也按这两个标记逐元素过滤其余改动。
2. `lifted` 是逐元素的：元素 style 属性里本来就有 important 声明（冻结器钉住的固定定位元素，或页面自己写的 inline important），各实例可能不同。
3. 冻结器钉住的元素的滚动偏移（`pinOffsetOf`，`data-vk-pin-offset`）：`put` 按元素把 left/top 加上偏移。同一次冻结的偏移都一样，但一个实例被钉住、另一个没有时就不同。
4. 复制和拖回的图层：`copied` 是按每个原件当时的样子逐元素记的，原件各实例不同时，副本各实例也不同。
5. 自由定位的容器：`holdAbsolute` 只给 position 还是 static 的实例写 `position: relative`。
6. 推广到组件（`promoted`）按组件写出的元素逐个写，这些元素分属不同使用处（不同图层 id），有的还没有图层 id。
7. 复制品和拖回图层里面的元素、推广涉及的其他使用处的元素：有编辑样式但还没有图层 id（第一次被编辑时才盖上）。`apply` 里也是先写样式、后盖图层 id。

断点（ADR 0008）、画布外的图层（ADR 0009）、播放（ADR 0010）本身不会让实例之间不同：断点的改动对全部实例一样，只是规则里多一个 `@media` 块。

所以方案是：**同一图层规则相同的实例共用一条规则（一个 key、一个样式表）；规则不同的实例是例外，自己另有一个 key**。常见情况（改数值、改断点上的值）下一个图层只有一个样式表；只动了一个实例时是"大家一个 + 例外一个"。

*新的数据结构*

不换选择器，换"key 指的是什么"：key 从"一个元素"变成"一组规则完全相同的元素"。

```html
<style data-vk-edit-styles="" data-vk-rules-for="7" data-vk-rules='{"lifted":{},"edits":{"base":{"style":{"border-radius":"16px"}},"at":[]}}'>@layer vernierkit-edits{[data-vk-style="7"]{border-radius:16px!important}}</style>
<style data-vk-edit-styles="" data-vk-rules-for="9" data-vk-rules='{…同上，再加上移动写的 position/left/top…}'>…</style>
…
<article data-vk-layer="12" data-vk-style="7">…</article>   ← 95 个实例共用 7
<article data-vk-layer="12" data-vk-style="9" data-vk-move="…">…</article>   ← 被单独移动的那个实例：例外
```

- 不变式：**同一个 key 的元素，图层 id 相同（且不为空），规则相同**。没有图层 id 的元素（复制品和拖回图层的内部元素、推广涉及的未编辑元素）照旧一个元素一个 key，不参与合并。
- 断点的 media query 仍放在各组自己的样式表里，位置和写法都不变（全部宽度的规则在前，各断点按 `widestFirst` 在后，隐藏规则单独一条）。
- 为什么不用 ticket 里举的 `[data-vk-layer="…"]` 做选择器：(a) 图层 id 是改动单里的身份，不该兼管样式；(b) 例外的实例同时匹配图层规则和自己的规则，要靠来源顺序覆盖，而"图层隐藏、这个实例不隐藏"之类的情况要专门写反向声明；(c) 还没有图层 id 的元素也有编辑样式。也考虑过"全部编辑样式放进一个样式表"：任何结构变化（新断点、新元素）都要重写整张表的文字，旁边视图同步也是整张表，不如按组。
- 选择器、属性名、样式表的形状都和现在一样，**旧格式正好是新格式的一个特例（每组一个元素）**，这是下面兼容方案的基础。

*模块与接口（编辑样式模块）*

- 接口从"一个元素"改为"一组元素"：`declare(els, declarations, breakpoint)`、`restoreStyle(els, names, others, breakpoint)`、`relayOut(els, …)`、`declarePromoted(els, changes)`、`lookRules(els, …)`。仍接受单个元素（当作一组一个），调用方可以逐步改。
- 实现里只有一个入口做分组（内部 seam）：对传进来的元素算出各自的新规则（逐元素算，所以 1–7 条的差异自然保留），然后：
  - 一组的全部成员（在文档里按 key 查到的元素）都在这次调用里、且新规则都一样：**就地改这一个样式表**（`restyleInPlace`，和现在单个元素时一样）。这是改数值的快路径。
  - 否则按新规则分开：相同的放进同一个新 key；新规则和同一图层已有的某组完全相同时并进那组（例如撤销单个实例的移动后，它回到大家那组）；没有成员的组去掉样式表。
- 读的接口不变：`hiddenByEdit`、`declaredByEdit`、`asShown`、`asPage`、`rematch`、`syncEditStyles`、`changesEditStyles`、`isEditStyles`、`dropUnusedRules`。`asPage` 读一个元素时会临时去掉整组的改动（还原方式不变，期间不绘制），只读那一个元素，结果不受影响。
- 逐个元素调用仍然正确（每次把那个元素分出去，再并到与它相同的组里），只是没有快路径的收益；所以只有改数值的热路径必须按组调用，其他调用方按组调用是为了整齐和少写样式表。
- `apply`（`edits.ts`）里改为先给实例盖图层 id、再写样式，第一次编辑就能成组。
- 依赖方向不变：编辑样式模块只读元素上的 `data-vk-layer` 属性（常量本来就在这个模块里），不依赖图层树（`layers.ts`）；调用方依赖它，`freezer.ts` 依赖它（已是如此）。

*保存画布与自动保存的新格式*

- 自动保存的画布（`serializeCanvas`）：同上，一个 `data-vk-style` 值可以出现在多个元素上，样式表少了；没有新字段、新属性。
- 不加版本号：旧格式是新格式的特例，新代码直接能读。
- 画布外的图层（`serializeEditable`，进 `.vernier/off-canvas.json`，拖回时进改动单的 `PutBack.layer.look`，Agent 在改动说明里会读到）：推荐写出时**展开成每个元素一份**（同一组的元素各给一个 key、各复制一个样式表），这样 look 的形状和现在完全一样。画布外的文档很小，合并没有性能收益（见问题 1）。
- **改动单（ChangeSet）JSON 不变**：改动里不记 key；按上面推荐，唯一可能带编辑样式的 `PutBack.layer.look` 也保持现在的形状。`claim` 输出、改动说明不变。

*兼容与迁移*

- 打开旧画布（`restore`）和没有画布时撤回（`revertSaved`）：现在都先跑 `moveInlineEdits`。把它和新的"读时合并"包成一个函数（例如 `upgradeEditStyles(doc)`）：先把更早的 inline 格式搬进编辑样式，再把同一图层规则完全相同的元素并成一组（留最小的 key，删其余的样式表）。幂等，对新格式是空操作。画面不变，因为合并前后每个元素匹配的声明完全相同。
- 打开后继续编辑和撤销：可以。撤销历史本来就不跨刷新，打开后新做的步骤按图层 id 重做，不依赖 key；被合并的组下次改值就走快路径。
- 写回：总是新格式（画布外图层的 look 按推荐展开）。
- 不能自动迁移的情况：没有找到。旧格式里的每个元素的 key 都还有效，合并只是可选的提速。唯一不兼容的方向是**降级**：用新格式保存的画布被旧版本的 Vernier Kit 打开时显示正确，但旧版本只移动或删除一个实例时会改到共用的样式表，让其他实例也跟着动（见问题 2）。

*就地改规则与 `syncEditStyles` 的约定*

- 不变：`data-vk-rules` 的 JSON 是唯一依据；结构不变时就地改，否则写文字；保存画布、新加视图、跟随画布的视图、`asPage` 之后都由 `syncEditStyles` 按 JSON 写出文字。
- 变的只是"一个样式表对应多个元素"。快路径上一步只改一个样式表，`syncEditStyles` 和 `restyleInPlace` 都只做一次。分组变化（分出例外、并回去）会改元素的 `data-vk-style` 属性并增删样式表，走写文字的路径，和现在第一次编辑一个元素时一样。
- 断点上第一次改值（多一个 `@media` 块，结构变了）现在要重写 96 张表的文字，以后只重写一张。

*对视图跟随的影响*

- 跟随的逻辑不用改。快路径上一步只产生一条"某个样式表的 `data-vk-rules` 变了"的记录，仍算"只改编辑样式"，照旧晚一帧（或停手后）再收；收的时候旁边的视图只同步一个样式表，追上的任务约 2–3ms 会降到 1ms 以内，两个旁边视图各自重画那一帧的样式失效检查也各省约 3ms（参考值，不计入达标条件）。
- 分组变化（单个实例的移动/删除及其撤销）改了元素属性，旁边的视图照旧立即收下，和现在一样。

*风险*

1. **共用的样式表被不该改的实例看到**：只有一组的全部成员都在这次调用里才就地改。成员按"当前文档里带这个 key 的元素"算，暂时离开文档的元素算不到。现在会离开文档又回来的只有本轮做出来的图层（撤销创建、复制、拖回时整体拿下，重做时放回同样的元素，`structure-edits.ts` 的 `madeLayer`），它们的全部实例总是一起拿下，组内不会一半在文档里、一半不在；Stack 的组成与拆开是同步拿下放回。加测试锁住；以后新增"拿下一部分实例"的操作要注意这一点。
2. **改动面**：七个调用方都要换成按组调用（逐个调用仍正确，可分步改），撤销/重做的步骤间接受影响。用旧格式 fixture 和现有全部测试兜住。
3. **降级**（见问题 2）。
4. **收益可能比估计少**：96 个实例共用一个选择器后，那 96 个元素的样式仍要重算（"算样式"约 1–1.5ms 的部分省不掉）；省下的是"每个变化的样式表"的失效检查和 96 次 JSON 与 CSSOM 操作。数字要以前后对比为准。
5. 画布外图层按推荐写出时展开、读进来时不合并，两条路不对称；如果设计师选不展开，就去掉展开这一步，改动单里的 look 在"画布外图层里有多实例图层被编辑过"时会变少几个样式表。

*会改动的模块*

- `canvas-style.ts`：分组、按组的写接口、`upgradeEditStyles`（含现在的 `moveInlineEdits`）、写出画布外 look 时的展开；文件头注释改为按组描述。
- `edits.ts`：`apply`、`cutting`、`inheritStep`、`referenceAt` 按组调用；先盖图层 id 再写样式。
- `stacks.ts`、`moves.ts`、`layer-changes.ts`（`insertNew`、`insertCopies`、`insertPutBack`、`hide`、`unhide`）、`promote.ts`（`showComponent`）、`structure-edits.ts`（`showPromoted`）、`saved-round.ts`：按组调用；`saved-round.ts` 改调 `upgradeEditStyles`。
- `freezer.ts`：`restore` 改调 `upgradeEditStyles`；`serializeEditable` 写出时展开。
- 不改：`views.ts`（可能只改注释）、`changeset.ts`、`undo-steps.ts`、`look.ts`、`off-canvas.ts`、服务端、`change-notes.ts`、读样式的模块（`property-table.ts`、`typography.ts`、`stroke-weight.ts`、`layers.ts`）。
- 文档：不需要新 ADR；GLOSSARY 不涉及。

*实现顺序*

0. 动代码之前，用现在的代码生成旧格式 fixture（见测试计划），并记下它们的期望值。
1. 编辑样式模块：内部分组与按组的写接口，单个元素的调用照旧可用；`upgradeEditStyles`；look 的展开。
2. `edits.ts` 的热路径按组调用，headless 前后对比。
3. 其余调用方按组调用。
4. 全量 typecheck、单测、e2e。

*测试计划*

- 浏览器单测（`edits.browser.test.ts` 等，编辑样式要真实 DOM）：
  - 循环的多个实例改值：只有一个编辑样式表；连续改值时只有这一个样式表的 JSON 变（数 MutationRecord），三个视图、保存的画布、之后新加的视图都显示最新值（扩展 22 加的 3 条）。
  - 只移动/删除一个实例：分成两组，画面正确；撤销后并回一组。
  - `lifted` 不同、钉住偏移不同的实例：各自成组，值正确。
  - 断点：多个实例在断点上改值、和全部宽度交替改、撤销，只有一个样式表，media query 正确。
  - 复制、拖回、推广（多个使用处）后画面与现在一致。
  - `asPage` 读共用组的一个实例：读到页面本来的值，之后各实例仍显示最新值。
  - 本轮做出的图层被撤销创建、期间改了别的图层、再重做：样子不变（锁住风险 1）。
  - `serializeEditable` 写出的 look 是每个元素一份；新旧 look 都能 `bring` 回来并继续编辑。
  - `revertSaved` 在旧格式和新格式的保存画布上都正确。
- 旧格式 fixture：步骤 0 用现在的代码保存一轮，包含：循环里多个实例的图层在全部宽度和断点上的改动、只移动和只删除一个实例、复制、推广、画布外图层和拖回、更早的 inline 格式（已有一条）。测试打开它：每个视图里每个元素的计算样式与 fixture 记下的一致；编辑样式表的数量变少；之后继续编辑、撤销；再保存、再打开，结果一致；改动单 JSON 与 `claim` 输出与 fixture 记下的一字不差。
- e2e：`autosave.spec.ts` 加一条，把 fixture 放进 `.vernier/` 后进入编辑模式，画面、改动单、继续编辑与撤销都正确；`claim.spec.ts` 现有的断言照旧通过。
- 测试数量不少于改动前。
- headless 前后对比：在当前提交上和改完后各跑 3 次 `VK_PERF_HEADLESS=1 VK_PERF_PORT=5420 pnpm test:perf`，记改 Corner radius 和 Stack Gap 的第一帧主线程时间（中位数 / p95），再各录一次 trace，看桌面视图的样式失效检查、编辑命令的 JS、旁边视图追上的任务。预期（headless，参考）：Corner radius 约 27–28 → 22ms，Gap 约 38–39 → 33ms，主要来自样式失效检查约 5.5 → 2.5ms 和写 96 份规则约 2ms。有窗口下预计约省 4–5ms（Corner radius p95 22.7 → 约 17–18ms，Gap 33.2 → 约 28ms），仍高于 16.7ms；有窗口的验收数字等设计师同意后再跑。

*需要设计师决定的问题*

1. **画布外图层的 look 是否也合并**：look 存在 `.vernier/off-canvas.json`，拖回时进改动单，Agent 在改动说明里会读到。推荐：**写出时展开成每个元素一份**，改动单和 Agent 看到的 look 与现在完全一样；画布外的文档很小，合并没有收益。另一种是不展开，代码少一步，但"画布外图层里有多实例的图层被编辑过"时，改动单里的 look 会和现在不同（意思相同、样式表更少）。
2. **降级**：用新版本保存的画布，被旧版本的 Vernier Kit 打开后，只移动或删除一个实例会让其他实例跟着动。推荐：**不支持降级，不加版本号**（项目里的 `.vernier/` 只跟当前装的版本走）。如果需要防，只能改属性名让旧版本完全读不到编辑样式，代价是旧版本打开时画面丢掉全部改动，更糟。
3. **打开旧画布时合并**：推荐**合并**（读时合并），旧的一轮打开后改值也走快路径；画面不变。另一种是只让新的编辑成组，旧画布在被改过的图层上才慢慢合并，打开时零改动，但旧的一轮继续编辑时仍慢。
4. **选择器**：ticket 里举的是按图层的 `[data-vk-layer="…"]`；方案用"共用 key"，选择器仍是 `[data-vk-style="…"]`（原因见"新的数据结构"）。推荐**用共用 key**。这一条对画面和改动单没有影响，只请设计师知道和 ticket 原文不同。

**设计师的回答（2026-10-30）**

1. **整体方案同意**：规则相同的实例共用一个编辑样式表（共用 key，选择器仍是 `[data-vk-style]` 一类，不采用 ticket 原文"按图层 id 写选择器"的做法，设计师已知悉这一点与原文不同）；单独改过的实例分出去用自己的表，规则重新一致时并回；改动单 JSON、`claim` 输出、改动说明都不变。
2. **画布外图层的外观不合并**：写出时仍按每个元素一份展开，改动单和 Agent 读到的内容与现在完全一样。
3. **不支持降级，不加版本号**。
4. **打开旧格式的画布时合并**规则相同的实例（画面不变，之后可继续编辑、撤销，改数值走快路）。

状态改为 ready-for-agent。

**实现（2026-10-30）**

按方案和设计师的回答做完。提交：b9f1ca1（记设计师的回答）、51b4834（旧格式 fixture 与对照测试）、f8a18e9（编辑样式按组写、改数值的热路径按组调用、打开旧画布时合并）、ce5b1dd（单独移动/删除的实例分出与并回，及其他分组测试）、c3bb4aa（其余调用方按组写）、a22e9db（注释）、f5ddfe1（code review 后的修正）、本提交（记录）。

*做了什么*

- 编辑样式模块（`canvas-style.ts`）：`declare`、`restoreStyle`、`relayOut`、`declarePromoted` 收一个或一组元素。每个元素的新规则逐个算（钉住偏移、`lifted`、单独移动/删除的标记等差异照旧保留），算完按"图层 id + 规则 JSON"分组写进样式表：
  - 一组的全部成员都在这次调用里、新规则都一样，而且这个图层没有别的组时，就地改这一个样式表（快路径，`restyleInPlace` 一次）。
  - 否则按规则分组：先找同一图层里规则已经相同的组并进去，再用这些元素自己的 key（没有别的元素用它时），都不行才分一个新 key；没有元素的样式表去掉。没有图层 id 的元素各自一组。
- 不变式：同一个 key 的元素，图层 id 相同、规则相同。选择器、属性名、`data-vk-rules` 的 JSON 形状都没变，旧格式是"每组一个元素"的特例。
- `upgradeEditStyles`（`restore`、`revertSaved` 调用）：先 `moveInlineEdits`，再 `shareEditStyles`，把同一图层规则相同的实例并成一组，留最小的 key。对新格式什么也不做。
- 调用方按组调用：`edits.ts`（`apply`、`cutting`、`inheritStep`、`referenceAt`）、`moves.ts`（`relocate`、`holdAbsolute`、`releaseAbsolute`）、`stacks.ts`（四个函数都把各实例收齐后一次写）、`layer-changes.ts`（`insertNew`、`hide`、`unhide`）、`promote.ts`（`showComponent`）、`structure-edits.ts`（`showPromoted`）、`saved-round.ts`。
- 不改：`views.ts`、`changeset.ts`、`undo-steps.ts`、`look.ts`、服务端、`change-notes.ts`。ADR 0011 的追上规则不变：快路径上一步只有一条"某个样式表的规则变了"的记录，仍算"只改编辑样式"。
- 不需要新 ADR；GLOSSARY 不涉及。

*哪些不变、哪些变*

- 改动单 JSON、`claim` 输出、改动说明：不变。测试用旧代码生成的 fixture 逐字对照：同样的操作现在记下的改动单和画布外图层 JSON 与当时一字不差；`claim` 输出与当时一字不差。
- 自动保存的画布（`.vernier/canvas.html`）：同一个 `data-vk-style` 可以出现在多个元素上，样式表少了。没有新字段，没有版本号，不支持降级。
- 画布外图层（`.vernier/off-canvas.json`，拖回时的 `PutBack.layer.look`）：不变，每个元素一份。

*偏离方案之处*

1. **先写样式、后盖图层 id，和原来一样**。方案写的是 `apply` 改为先盖 id 再写样式。但这样一来，元素上 `data-vk-layer` 属性的位置会排到 `data-vk-style` 前面，画布外图层的 look 字符串会变，而 `claim` 原样打印这段 look。所以盖 id 的顺序不变，改为把将要盖的 id 作为第四个参数传给 `declare`（`edits.ts` 的 `idFor`），第一次编辑就能成组。
2. **画布外图层的文档里根本不合并**（`keepEditStylesApart`，`off-canvas.ts` 显示每个画布外图层时调用）。方案的做法是"合并、写出时再展开"，先这样实现了。code review 指出：先编辑循环、再编辑别的元素时，展开后的 key 和样式表顺序与以前不同，look 字符串因此不一样。改为画布外的文档每个元素各用自己的样式表，与以前的做法逐字相同，展开那一步也删掉了。画布外的文档很小，合并本来就没有收益。
3. **快路径多一个条件**：这个图层不能有别的组。图层里有例外的实例时（例如单独移动的那个），每一步改值都走一般路径。一般路径照样就地改每组的样式表（每组一个），只是每步多几次全文档的属性查询。headless 测量用的图层没有例外，所以这种情况没有单独量。
4. `insertCopies`、`insertPutBack` 仍然逐个复制品写：每个复制品放进文档前，样子已各自算好。之后经一般路径并进同一图层规则相同的组，结果正确（方案说逐个调用仍然正确）。
5. 测试计划里的"撤销创建、期间改了别的图层、再重做"：用编辑器改别的图层会清空重做栈，所以"期间"那一步改为直接对别的图层调用 `declare`。

*测试*

- 旧格式 fixture（动代码前用当时的代码生成，提交在 51b4834）：
  - `packages/vernierkit/test/fixtures/round-before-60/`：测试自己的页面上做了一轮，包括循环里 4 个 Card 在全部宽度和两个断点上的改动（其中一个 Card 的 style 属性里有页面自己的 important 声明）、只移动一个实例、只删除一个实例、复制标题、推广按钮的填充、移出画布并在画布外编辑后拖回的图层、留在画布外并编辑过的图层。
  - `e2e/fixtures/round-before-60/`：示例项目里做了一轮，包括 Card 的填充、圆角、手机断点上的圆角、删除一个实例，附 `claim` 输出。
  - 写 fixture 的测试只在设了 `VITE_VK_WRITE_FIXTURE` 或 `VK_WRITE_FIXTURE` 时运行，而且不会覆盖已有的 fixture。
- 打开旧 fixture 后检查了以下各项：
  - 三个视图里每个元素的计算样式与 fixture 记下的一致。
  - 改动单和画布外图层的 JSON 与 fixture 逐字相同。
  - 循环中规则相同的实例共用一个样式表，编辑样式表比 fixture 少。
  - 改一步数值只改各组的样式表（3 个：有 important 声明的那个、单独移动的那个、其余的；删掉的不算图层）。
  - 继续编辑、撤销后与 fixture 一致；再保存、再打开，结果相同。
  - 每个改动在没有画布时撤回（`revertSaved`），结果与当时一致。
  - 留在画布外的旧图层可以继续编辑并拖回，look 里仍是每个元素一份。
  - e2e：打开后三个视图一致，改动单文件没被改写；继续编辑后撤销，改动单回到原样，`claim` 输出逐字相同。
- 新增的分组测试在 `edit-styles.browser.test.ts`，覆盖以下情形：
  - 一个样式表，连续改值只有它变；三个视图、保存的画布、之后新加的视图都显示最新值。
  - 单独移动或删除一个实例时分出去，撤销后并回。
  - 有 important 声明的实例、钉住偏移不同的实例各自成组。
  - 断点上的值和全部宽度的值交替改、再撤销，仍只有一个样式表，media query 正确。
  - `asPage`。
  - 本轮做出的图层撤销再重做。
  - 新格式画布上的 `revertSaved`。
- 全量（最后一个代码提交 f5ddfe1）：`pnpm typecheck` 通过；单测 526 个通过、1 个跳过（写 fixture 的那个），改动前是 513 个；e2e 273 个通过、1 个跳过（写 fixture 的那个），改动前是 272 个。

*headless 前后对比*（`VK_PERF_HEADLESS=1 VK_PERF_PORT=5420 pnpm test:perf`，各跑 3 次，只作参考，不是验收数字）

| 量 | 改动前（9e848de 之后的代码，3 次） | 改动后（c3bb4aa，3 次） |
|---|---|---|
| 改 Corner radius 第一帧主线程时间 中位数 | 29.6 / 28.6 / 27.6ms | 21.3 / 20.8 / 20.7ms |
| 同上 p95 | 31.2 / 33.0 / 30.2ms | 23.4 / 24.3 / 23.5ms |
| 改 Stack Gap 第一帧主线程时间 中位数 | 38.3 / 39.1 / 38.7ms | 30.7 / 31.1 / 30.2ms |
| 同上 p95 | 59.0 / 42.1 / 41.9ms | 33.8 / 35.1 / 31.8ms |
| 按住方向键 Corner radius p95 | 87.0 / 29.1 / 32.6ms | 23.7 / 22.4 / 21.6ms |
| 按住方向键 Gap p95 | 42.0 / 39.1 / 42.6ms | 34.9 / 34.2 / 34.3ms |
| 改数值后三个视图都显示（Radius / Gap 中位数） | 约 129–134 / 148–153ms | 约 119–120 / 140–142ms |
| 进入编辑模式（16 次中位数 / p95） | 144.7 / 133.8 / 144.2；p95 195 / 163 / 222ms | 150.1 / 142.4 / 139.9；p95 266 / 268 / 156ms |
| 拖拽（每次平均 fps 中位数；帧间隔 p95；迟到帧） | 55.7 / 55.3 / 51.7；33.3ms；23、26、52 帧 | 55.2 / 55.7 / 55.7；33.3ms；27、25、25 帧 |

- 改数值第一帧约省 8ms（Radius 约 28.6 → 20.8ms，Gap 约 38.7 → 30.7ms），比方案估计的约 5–6ms 多，原因是写 96 份规则和 96 次 `replaceSync` 也省了。
- 进入编辑模式这条路径的代码没有变：新冻结的页面没有编辑样式，`restore` 里的合并只在打开保存的画布时才跑。三次的中位数和改动前在同一范围；p95 前后都在 155–270ms 之间跳动，是 headless 本身的波动。拖拽没有变差。
- code review 修正（f5ddfe1）之后又跑了 1 次确认：Radius 20.8 / 23.6ms，Gap 28.7 / 30.2ms，进入编辑模式 139.4 / 155.1ms，拖拽 56.8fps。
- 有窗口 Chrome 的验收数字，等设计师同意后在 ticket 22 的验收里跑。

*风险*

- 共用的样式表只在一组的全部成员都在这次调用里时才就地改；成员按"当前文档里带这个 key 的元素"算。现在会暂时离开文档的只有本轮做出来的图层，它们的实例总是一起拿下（已有测试锁住）。以后新增"只拿下一部分实例"的操作时要注意这一点。
- 不支持降级：新格式的画布被旧版本打开后，单独移动或删除一个实例会带动其他实例。设计师已接受。
