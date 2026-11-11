# 138: shadow root 里的层能挪、排顺序、做成 Stack / Grid、改文字、删除

**What to build:** 在 137 的基础上，shadow root 里的层也能做结构上的改动：

- 拖动；
- 在容器里换顺序；
- ⇧A 做成 Stack、做成 Grid；
- 双击改文字；
- 复制、删除；
- 放成 Absolute。

改动单、`claim`、`done` 照对待页面上别的层的做法处理。

- 跨 shadow 边界的挪动先不支持，也就是把层从 shadow root 挪到外面，或者从外面挪进去。拖到边界外时，照「放不进去」的样子处理，并给出提示。具体怎么提示，和设计师定。
- 文字改动、复制、删除照现在的规则写进改动单。层有源码位置时照常落地；没有时照「找不到位置」的规矩说。

参考 135–137；用词以 GLOSSARY.md 为准。

**Blocked by:** 137

**Status:** done

- [x] e2e：在 135 的测试页面里，shadow root 里的两层换顺序、改一层的文字、把几层做成 Stack。画布、各视图、改动列表都对。
- [x] 拖到 shadow 边界外：放不进去，提示出现；具体样子照和设计师定的做。（规划会话 2026-11-12 定了 A：松手时的 toast，三种情况各一句，见「提示」）
- [x] 加一个 bench 场景（结构改动）：`--dry` 正确，`--scripted` 落地后 `done` 核对为显示了；已有场景的 `claim-out` 逐字不变。（加了两个：`shadow-root-structure`、`shadow-root-text`，原因见代定 6）
- [x] 没有 shadow root 的页面，结构改动的已有测试全过；相关的 spec 过，perf 相关文件过（整套由规划会话在 main 上跑）。

## Comments

### 做了什么（agent，2026-11-12）

- **容器的子层放在哪里**（`shadow-roots.ts` 新增 `holderOf`、`parentOf`）：宿主作为容器时，它的子层在它的 shadow root 里。`holderOf(el)` 是页面 open shadow root（有的话），否则是元素本身。用到它的地方：`slotsOf`、`relocate`、`syncOrders`/`layersIn`、`amongOf`、`compose`/`decompose`/`childOf`、`insertNew`/`insertCopies`/`insertPutBack`，以及 `structure-edits.ts` 里找新层的几处。这样 shadow root 最上面的层（比如宿主下的 panel）也能挪、排顺序、做成 Stack、复制、删除。`parentOf` 是 DOM 上的父元素，shadow root 顶层的取宿主，用在 `holdAbsolute`、`amongOf` 和 check 里。
- **层在容器里的位置不算编辑器自己的 `<style>`**（review 第 3 条）：`slotsOf` 跳过带 `data-ht-rules-for`、`data-ht-edit-styles`、`data-ht-look-styles` 的 style 元素（编辑样式放在 shadow root 末尾）。插入用新的 `slotAt`：位置在最后一层之后时，插在这些 style 前面，不插到它们后面。`relocate`、`insertNew`、`insertCopies`、`compose`、`decompose` 都改用它。
- **`placeable`**：改成比 `layer.el.parentNode === holderOf(layer.parent.el)`，不再比 `parentElement`。shadow root 顶层的层可以放置了；slot 进去的层仍然不行（代定 1）。`isLoop`、`structure-edits.ts` 里本地的 `madeLayer`（不是 `checkable.ts` 里那个）也改成比 `parentNode`。
- **跨边界规则**：`Editor.acrossShadowRoot(layer, container)`（`acrossShadowEdge`）比较层的 `getRootNode()` 和容器所装子层那棵树（`holderOf(container).getRootNode()`），不比 Layers 里的上一级。返回越过的是哪种边界，没越界是 null：
  - `slotted`：层是 slot 进去的，挪到哪里都算；
  - `out`：层在 shadow root 里，要去别的树（包括 `container` 为 null，即挪出画布、挪进 layer off canvas）；
  - `in`：层在外面，要进 shadow root（包括 `layer` 为 null，即画布外的层放回）。

  `canDrop` 拆成两半：`canDropIgnoringEdge`（不看边界时能不能放）加上边界检查。`canDuplicate` 对 slot 进去的层返回 false。没有 shadow root 的画布（`mayHoldShadowRoots`）直接返回 null。
- **拖动**（review 第 1 条改过）：`findDrop` 和 `shadowEdgeAt` 共用 `dropContainer`。它从指针下往外找容器：
  - 不看边界也放不进的，跳过，接着往外找，和以前一样；
  - 兄弟容器只从中间进，靠边时跳过，去它旁边；
  - 第一个不看边界能放的容器：越界就停下，返回越过的边界，即放不进去；不越界就放进去。

  所以页面上的层拖到旁边宿主的边上（指针在宿主 shadow root 里的文字上），会走到外面的 Stack，排在宿主旁边，和拖到别的层旁边一样（以前在这里就提示了）。拖到宿主中间，宿主不看边界本来能放，就停下给提示，不退到宿主旁边去放（代定 2）。`CanvasView` 把边界记在 `session.shadowEdge`，松手时不挪，并 `onHint(SHADOW_EDGE_HINTS[edge])`，由 Shell 的 `showToast` 显示。shadow root 里的层和 slot 进去的层拖到所有视图外面时，不挪出画布（`stays`），也给提示。拖进 layer off canvas、从画布外拖进 shadow root，同样处理。
- **复制宿主**（`insertCopies`）：先把复制出来的 shadow root 里原件的编辑样式表去掉（`dropCopiedEditStyles`）。复制品插进画布以后再给每个元素 `copyRules`，规则写进它自己所在的树。用 `elementsWithin`，所以 shadow root 里的层也去掉了 layer id 等标记，是复制品自己的层。最后 `editableShadowRoots(copy)` 补上画布样式。`copiedBreakpointsOf` 也会进到 shadow root 里。重做（redo）也走这条路，测了。
- **`freezeLook`**：宿主的 look 会把 shadow root 里的元素也冻结。它们的冻结样式放在各自 shadow root 里的一个 `<style data-ht-look-styles>`，shadow root 里页面自己的 `<style>` 去掉。继承照 flat tree（`flatParent`）。
- **check**：
  - 新层的位置（`findMade`）、reorder（`lookOrder`）读容器的子层时用 `holderOf`。
  - `holderOf`（排版上的父元素）和 absolute 的参照判断用 `parentOf`。
  - `changedAround` 用 `containsAcross`，可以跨 shadow root。
  - `writtenAround` 的 MADE 用 `queryWithin`。
  - `dropUnusedRules` 的 PUT_BACK/MADE 也进到 shadow root 里。
- **claim**（review 第 2 条改过）：
  - 只改结构、不写样式的改动（reorder、移进布局、文字、删除、没有 style 的复制，`structureOnly`），**Shadow root** 那行是：有位置时 "…: the change is to the markup the component renders into that shadow root, at **Location**, not to the page's markup outside it."；没有位置时去掉 ", at **Location**"。挪动和复制后面再加 "; it stays in that shadow root"。这类改动不再附 **Shadow roots** 那条样式规则。
  - 样式类改动（含 absolute、Stack）照 137 逐字不变。
  - 有 loc 照常写 Location；没有 loc 照「Not located」；第三方 Web Component 照 137 锁住。
- **对齐线**：拖动、拖手柄改尺寸时，shadow root 里的层照常吸附、画线，e2e 测了（136 推后的那一条）。
- **图层树重建**：e2e 核对了换顺序、改字、做 Stack 以后 Layers 的行。
- **ADR 0017**：最后一条 Consequence 改成「跨树的挪动一律拒绝（ticket 138），所以编辑样式从不换树」。文件名、编号不变。GLOSSARY 不改（第一轮加的那句撤了）。

### 提示（规划会话 2026-11-12 定了 A）

- 松手时画布底部的 toast（和 "Stroke must be a multiple of 0.5px." 同一个），约 3 秒后淡出，指针在上面时不消失。拖动过程中不加别的界面，和现有的「放不进去」一样什么都不画。
- 三种情况各一句，放在 `drag.ts` 的 `SHADOW_EDGE_HINTS`，不提 "shadow root"：
  - 层拖出它的组件（`out`）："This layer stays inside its component."
  - 从外面拖进组件（`in`）："Layers can't be moved into this component."
  - slot 进去的层（`slotted`）："This layer's place is set by its component."

### 测试与数字（负载下，2026-11-12，第二轮，合了 main 07670ae）

- `pnpm typecheck`：全过（packages/humantouch、三个例子、website、e2e）。
- `pnpm test`：vitest 59 个文件，1355 passed / 1 skipped；`node --test` 132/132。
- `test/shadow-structure.browser.test.ts` 共 12 个，第二轮新加 5 个：
  - 页面上的层拖到旁边宿主 shadow root 里的文字上、靠宿主上边：排到宿主前面；宿主拖到另一个宿主上，同样；拖到宿主中间：`findDrop` 为 null，`shadowEdgeAt` 为 `in`；
  - shadow root 顶层换顺序、做 Stack，撤销后重做；
  - shadow root 里已有编辑样式时，把层挪到最后：排在编辑样式前面，记下的 slot 是 1 → 2；
  - 复制宿主，撤销后重做：复制品有画布样式，层是自己的；
  - shadow root 里自由放置的四层 ⇧A 做成 Grid，撤销后重做。
  - 原有的越界规则测试改成断言返回的边界种类（`out`/`in`/`slotted`/null）。
- `test/cli.test.ts`：改文字那条换成新句子；新加一条，没有位置（Lit 写的）时不提 Location。
- e2e（`HT_E2E_PORT=6500`，只跑相关的）：
  - page 项目 171/171：`shadow-roots`、`drag`、`stack`、`grid`、`typing`、`move-placement`、`snapping`、`resize`、`undo`、`off-canvas`、`off-canvas-drag`、`create`、`views`、`style-copy`。
  - project files 项目（`--no-deps`）129/129：`claim`、`applying-bench`、`bench-scenarios`、`round`。
  - 跑完例子里没有遗留改动。
  - 新增 e2e 4 条：
    - 换顺序、改字、做 Stack：画布、三个视图、Layers、改动列表 3 条，撤销三次复原；
    - 放进 shadow root 里的 Frame，变成 Absolute：拖动和改尺寸都有对齐线。三种越界各出对应的那句：拖到页面标题上（out）、slot 进去的层拖到标题前（slotted）、页面的按钮拖进 shadow root 的 Frame（in），都不挪。shadow root 顶层的 Frame 挪到 panel 前，可以撤销；
    - （第二轮）页面上的一个 Stack 里有一层和两个宿主：那层拖到第二个宿主 shadow root 里的文字上、靠宿主上边，排到宿主前面，三个视图都对；拖到宿主中间，不挪，提示 "Layers can't be moved into this component."；撤销复原；
    - 删除、复制 shadow root 里的层，复制宿主：复制品有 shadow root 和画布样式，改复制品的 panel 不影响原件；改动列表 4 条，撤销四次复原。
- bench（`HT_BENCH_PORT=6520`）：
  - `--dry` 37/37。claim-out 和 main 07670ae 的 35 个场景（另起的 detached worktree，端口 6530）`diff -r` 比较：只多 `shadow-root-structure.md`、`shadow-root-text.md`，已有的逐字不变。两个新场景里是新句子：挪动的带 "it stays in that shadow root"，改字的不带。
  - `--scripted` 28/28，含两个新场景，`done` 核对为显示了。
- perf（`HT_PERF_HEADLESS=1 HT_PERF_PORT=6570`，`-g "dragging|claimed round"` 8 条，headless 仅作参考）：8 passed。
  - 拖动 60.0fps；拖手柄 58.8fps；20 张 Brief 卡片时拖动和缩放都是 60fps。
  - claimed round 的 check 最长一段，中位数 8–31ms。「96 张卡片改字」那一项标了 ✗：一次 hot update 里 check 有 1 个 long task（同机另一条线在 main 上的 headless 记录里也有同样的 1 个），headless 不判目标，测试是过的。

### 代定

1. **slot 进去的层在画布上哪里都挪不了**（规划会话 2026-11-12 确认）：换顺序、挪进别的容器、做 Stack、复制、挪出画布都不行；拖动时提示 "This layer's place is set by its component."。改文字、删除、改样式照常可以。要能挪，发布之后另开 ticket。
   - 原因：它在 Layers 里列在 slot 所在的那层下面（136 代定 2），但写在宿主的 light DOM 里。按 Layers 的位置挪，会把它塞进 shadow 树；按 light DOM 挪，又和看到的位置不一致。
   - 代价：第三方 Web Component 的 slot 内容（ADR 0017 说可以通过 slot 内容改）也不能拖动挪位置，只能改字、改样式、删除。
2. 从外面拖进 shadow root：从指针下往外数，第一个不看边界能放的容器越界，就算「放不进去」，不会退到宿主旁边去放（锁定层是退到旁边的）。不看边界也放不进的（比如文字）照常跳过。宿主本身作为容器（指针在宿主中间）也算进 shadow root；在宿主靠边的地方，照兄弟容器的规矩去宿主旁边。
3. shadow root 里的层不能挪出画布，也不能拖进 layer off canvas。画布外的层不能放回 shadow root 里。新建层（画框工具、文字工具）可以建在 shadow root 里，没有锁。
4. claim 的 **Shadow root** 行按改动种类分（第二轮照 review 改过）：只改结构的用新的说法，不附 **Shadow roots** 规则；其余照 137 逐字不变。新句子请规划会话过目（Skill/claim 用词保持英文）：
   - 有位置："the change is to the markup the component renders into that shadow root, at **Location**, not to the page's markup outside it."
   - 没有位置：同上，去掉 ", at **Location**"。
   - 挪动、复制后面加 "; it stays in that shadow root"；改字、删除不加。
5. 提示用 toast，松手时出现，拖动中不提示（规划会话已定，见「提示」）。
6. bench 加了两个场景，不是一个：同一轮里同时换顺序和改其中一层的字，两层的行号互换，按 ticket 99 的配对认不出哪个 marker 是标题的，文字核对是 unchecked。这在 light DOM 也一样，不是 shadow root 的问题。所以换顺序（`shadow-root-structure`）、改字（`shadow-root-text`）分开放。
7. 粘贴（⌘V）到边界另一侧时，照现有的 `canDrop` 不粘贴，不提示。

### 风险

1. `freezeLook` 的冻结样式按 shadow root 分开放。宿主挪出画布再放回来时，shadow root 里的 look 样式跟着复制品走，没有专门的 e2e。
2. 同一轮里换顺序 + 改字的组合在真实运行中会出现 unchecked（代定 6，ticket 99 的限制）。
3. `holderOf` 在 live page 的 check 里也会进 shadow root。如果页面上的容器恰好是第三方元素的宿主，读到的子层是它的 shadow 内容，和画布一致；但 closed shadow root 的宿主在画布和页面上都按 light DOM 读。
4. `check.ts` 里本地的 `holderOf`/`parentOf`，对 slot 进去的层给的是宿主；而它在 flat tree 里的父元素是 slot 所在的元素。`changedAround` 的 `containsAcross` 也是按 DOM 算的，不是按 flat tree。现在都走不到，因为 slot 进去的层不能挪。等它们能挪时，这两处要改用 `flatParent`。
5. look 的 `LOOK_STYLES_BASE`（look 文档的基础样式）只在 look 文档的 head 里，进不了 shadow root。shadow root 里的元素靠的是各自冻结的样式，目前没看到差别，但基础样式里有的东西 shadow root 里没有。

**规划会话，2026-11-12**

线上合并到 main 2c74e25。135–138 这条线全部完成。

代定：
- 1–6 都确认。
  - 第 4 条，claim 的句子写得清楚：改的是组件渲染进 shadow root 的标记，不是外面页面的标记。
  - 第 6 条，把 bench 分成两个场景，同意。ticket 99 的限制在 light DOM 里也一样。
- 第 7 条改一下：⌘V 粘贴到边界另一侧时，照旧不粘贴，但要用同一个 toast 提示，不能悄悄地什么都不做。文字是 `Layers can't be pasted into this component.`。这是个小改动，由这条线顺手补上。

风险 1–5 接受。风险 4（slot 进去的层能挪以后，要改用 flatParent）记在这里，以后开放挪动时一起处理。

这张票的整套验证跟下一批 main 一起跑。
