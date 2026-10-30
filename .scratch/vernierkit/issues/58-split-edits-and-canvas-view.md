# 58: 预备：拆分编辑命令与画布视图（行为不变）

**What to build:** 编辑层里两个文件已经过大：`edits.ts`（约 2400 行）同时放着属性表的读写与应用、断点范围与拆分规则、撤销步骤的合并、结构性改动和画布外图层；`CanvasView.tsx`（约 1300 行）同时管相机、拖拽、吸附标记、视图布局和键盘。按职责把它们拆成更深、更小的模块。纯重构，设计师看不到任何变化。放在 22 之前做，性能优化时改动能落在边界清楚的模块里。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（视图与断点见 ADR 0008，挪出画布的图层见 ADR 0009，播放见 ADR 0010）。

**Blocked by:** 57

**Status:** done

- [x] 动手前在本 ticket 的 Comments 里写下拆分方案：用 codebase-design 的词汇，列出模块名、各自的接口和依赖方向
- [x] 分几次小提交完成，每次提交后 typecheck 和相关测试都通过
- [x] 模块与接口的命名遵守 GLOSSARY.md；自动保存和改动单的 JSON 字段名不变
- [x] 全量 typecheck、单测、e2e 都通过，测试数量不少于拆分前
- [x] 设计师可见的行为和改动单的内容都没有变化

## 背景

- 视图线和属性面板线的代码审查都建议拆这两个文件，但要等两条线都合并，否则冲突太多。两条线已于 2026-10-29 合并进 main。
- 视图线收尾时留下的后续卡。57 也会改 `edits.ts`，所以等 57 合并后再从 main 开始，不与它同时进行。

## Comments

**拆分方案（2026-10-29，动手前）**

用 codebase-design 的词汇：每个新 module 只给调用方一个小 interface，seam 放在已有职责的分界处；依赖只朝一个方向走（下面的箭头指向被依赖的一方），没有新的环。纯重构：自动保存和改动单的 JSON 字段名、设计师看到的行为都不变。拆分前：typecheck 通过，单测 469 个，e2e 264 个。

`edits.ts`（2366 行）拆成：

1. `property-table.ts`（属性表）：每个属性怎样从元素读出、写成哪些 CSS、由哪些 CSS 设置。Interface：值的类型（`PropertyValues`、`Property`、`Size`、`Align`……与 `Definition`），`readValue`、`readAsShown`、`definitionOf`、`cssOf`、`isTextProperty`、`placesItself`、`stackOf`、`absolute`。实现里藏着整张表和尺寸、对齐、位置、圆角的读写规则。不知道 Editor、视图和改动单。依赖：paint、effects、typography、stroke-weight、grid-tracks、style-source、canvas-style。
2. `layer-target.ts`（Agent 怎样在源码里找到图层）：`targetOf(layer, instances)`、`openingTag(el)`。依赖：layers、canvas-style、freezer 的标记。`typography.ts`、`check.ts` 改从这里拿 `openingTag`，去掉 typography → edits 的值依赖。
3. `undo-steps.ts`（撤销步骤的合并）：`History`、`createHistory`、`Step`，以及 `createSteps(history, sync, layersOf)` 给出 `push`、`group`、`show`、`undo`、`redo`。实现里藏着"同一次调整合成一步"、"一串微移合成一步"、"每次重做先做 `first`"、批量时延后同步视图这些规则。依赖：layers（`framedText`）。这是一条真 seam：画布的 Editor 和每个画布外图层的 Editor 共用一个 History，各自一个 Steps。可以不用 DOM 单测，按 tdd 补测试。
4. `breakpoint-edits.ts`（断点范围与拆分规则，ADR 0008）：`createWorkingView(views, project)` 给出设计师在哪个视图里工作（`at`、`current`、`beside`、`breakpointIn`、`breakpointAt`、`viewAt`、`shownIn`），以及纯函数 `rangeOfEdit(atBreakpoints, width, range, project)`：一处编辑落在哪个断点上、要先切掉哪条已有改动（38 的拆分规则）。依赖：breakpoints、views 的类型、changeset 的类型。`rangeOfEdit` 可以不用 DOM 单测。
5. `structure-edits.ts`（结构性改动与画布外图层，ADR 0009）：移动、微移、Stack / 解散 / 取消编组、新建、复制、删除、改文字、生成说明、拖回、`originOf`、撤回、推广。Interface：`createStructureEdits(core)` 返回 `Editor` 中这些命令的一部分；`core` 是 `edits.ts` 交给它的内部 seam（layer tree、id 的分配、Steps、`editHere` 这类样式编辑原语）。依赖：上面 1–4，以及 layer-changes、moves、stacks、promote、changeset。

`edits.ts` 剩下：`Editor` 的 interface（调用方照旧从这里拿 `createEditor`、`Editor`、`Destination`、`SetOptions`）、`createEditor` 把上面几块组合起来，以及样式编辑本身（`apply`、`edit`、`editHere`、`inherit`、`variables`、`set`、`can`、`read`、`measure`）。依赖方向：`edits.ts` → structure-edits → breakpoint-edits / undo-steps / layer-target / property-table；property-table 与 layer-target 不依赖任何编辑命令。

`CanvasView.tsx`（1326 行）拆成：

6. `camera.ts`（相机）：`Camera`、`Bounds`，`transformOf`、`currentCamera`、`scrolled`、`initialCamera`、`fitCamera`、`boundsOf`、`zoomAt`、`cameraIn`、`place`，以及缩放的上下限与边距。纯函数（`currentCamera` 读一次计算样式），不依赖 preact。可以单测。
7. `canvas-drag.ts`（拖拽会话）：`DragSession`、`unshifted`、`setStyles`、`restoreStyles`、`boxFrom`、`DRAG_THRESHOLD`、`SNAP_PX`。藏着拖拽时给画布元素临时加样式、再原样还回去的规则。依赖：drag、layers、views 的类型。
8. `CanvasOverlays.tsx`（画布上方的标记）：`Outline`、`Marks`（吸附与测距标记）、`Brief`、`SelectionToolbar`。依赖：camera、icons、layers、snap 的类型。
9. `view-layout.ts`（视图布局，ADR 0008）：`Placed`、`Shown`、`keyOf`、`layoutViews(canvas, desktop, widths, beside)` 把桌面视图和其他视图并排放到舞台上；`offCanvasPlaced(offCanvas)` 放画布外图层。纯函数，依赖 views、off-canvas 的类型、ViewLabels 的 `viewName`。
10. 键盘：`useCanvasKeys` 留在 `CanvasView.tsx` 还是拆出，看拆完前面几块后它和组件状态缠得多紧再定；拆的话放进 `canvas-keys.ts`，依赖 camera。

`CanvasView.tsx` 剩下：组件本身的状态、指针事件、冻结与进出编辑模式的动画、播放。依赖方向：CanvasView → CanvasOverlays / canvas-drag / view-layout → camera。

分几次小提交：每拆出一块一次，每次 typecheck 和相关单测（edits、off-canvas、promote、stacks 的浏览器测试，以及新加的单测）通过，必要时跑相关 e2e。

**实现记录（2026-10-29）**

按上面的方案拆完，分 11 次代码提交（最后一次是审查后的修正），每次 typecheck 与单测通过，相关 e2e 分批跑过；最后全量 typecheck、单测 495 个（拆分前 469，新增 26 个）、e2e 264 个全部通过。自动保存和改动单的 JSON 字段名没有动，改动单的记录顺序与内容不变。

和方案不同的地方：

- `Editor` 的 interface（连同 `Destination`、`SetOptions`、`Binder`、`LayerToPutBack`）放进了 `edit-commands.ts`，`edits.ts` 照旧把它们导出给调用方。这样 `structure-edits.ts` 只依赖这个类型模块，不再回指 `edits.ts`，没有新的环（审查指出的类型环）。
- `breakpoint-edits.ts` 的 `WorkingView` 最后是 `at`、`beside`、`breakpoint`、`breakpointAt`、`viewAt`、`shown`、`shownAt`、`inDesktop`（拖回时临时按桌面视图做结构改动，原来是手动保存再恢复 `current`）。
- `ofText`（一条改动是不是改文字）和 `same` 放在了 `property-table.ts`：属性表因此知道改动单里哪些改动是改文字的，文件头已写明。
- 键盘拆了出来，但不是 hook：`canvas-keys.ts` 的 `canvasKey(event, state)` 只回答"这个键在画布上做什么"，组件照它执行；`Tool` 类型也搬到这里。`isEditable` 跟着搬来，Shell 也从这里拿。
- 画布上方的标记叫 `AboveCanvas.tsx`，没有用方案里的 `CanvasOverlays`（GLOSSARY 里 Overlay 是编辑层要避开的词）。拖拽结束时还原样式的函数叫 `restoreDragStyles`，避开"拖回 (Put back)"。

行数：`edits.ts` 2366 → 422（样式编辑与组合），`CanvasView.tsx` 1326 → 858（组件状态、指针事件、进出编辑模式的动画、播放）。新模块：`property-table.ts` 566、`structure-edits.ts` 1091、`edit-commands.ts` 225、`undo-steps.ts` 170、`breakpoint-edits.ts` 109、`layer-target.ts` 49；`AboveCanvas.tsx` 194、`canvas-drag.ts` 152、`camera.ts` 108、`view-layout.ts` 75、`canvas-keys.ts` 67。

留给以后：`structure-edits.ts` 仍有一千多行，移动与微移（`move`、`nudge`、`canDrop` 和它们的位置计算）可以再拆成一块，但它们和新建、复制、删除共用 `placeOf`、`wrap` 等，要再开一个内部 seam；`EditorCore` 有 16 个成员，比较宽。ticket 22 调性能时如果要动这里，可以顺带做。

**最后 review 修正（2026-10-30）**

- **camera.ts 恢复成纯函数**（b8b01ac，ticket 22 的提交）：ticket 22 第七、八轮往 `camera.ts` 里加了改 DOM 的 `drawOnlyWhatShows` 和带定时器的 `onceAtRest`、`AT_REST_MS`，不符合上面拆分方案第 6 条。它们搬进新模块 `stage-redraw.ts`（相机停下或动画结束后让 stage 重新只画看得到的部分），单测跟着搬：`camera.browser.test.ts` 改名 `stage-redraw.browser.test.ts`，`camera.test.ts` 里 onceAtRest 的 5 条搬进 `stage-redraw.test.ts`。`camera.ts` 剩下的都是纯函数，只有 `currentCamera` 读一次计算样式（方案里已写明）。
- **edits.ts 和 edit-commands.ts 的分工**（11fadc9）：两个文件的头注释原来都自称 "edit commands"。现在 `edit-commands.ts` 写明它只放类型，是调用方看到的 Editor；`edits.ts` 写明它组装 Editor（`createEditor`），自己做样式编辑，结构改动在 `structure-edits.ts`。
- **一条导入路径**：`edits.ts` 原来转发 `Binder`、`Destination`、`Editor`、`LayerToPutBack`、`SetOptions` 这些类型（和没人用的 `LAYER_ID_ATTR`），而 `structure-edits.ts` 为了避开环直接从 `edit-commands.ts` 拿。转发删掉了，所有模块和测试都从 `edit-commands.ts` 拿这些类型，只从 `edits.ts` 拿 `createEditor`。
- 设计师看到的不变；typecheck、单测、e2e 通过。
