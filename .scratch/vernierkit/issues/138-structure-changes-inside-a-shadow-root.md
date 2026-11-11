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

**Status:** done（提示的最终样子等规划会话定，见下面「提示」）

- [x] e2e：在 135 的测试页面里，shadow root 里的两层换顺序、改一层的文字、把几层做成 Stack。画布、各视图、改动列表都对。
- [x] 拖到 shadow 边界外：放不进去，提示出现；具体样子照和设计师定的做。（放不进去、提示出现已做；提示现在是占位：画布底部的 toast，一句英文，见「提示」。最终样子待规划会话选）
- [x] 加一个 bench 场景（结构改动）：`--dry` 正确，`--scripted` 落地后 `done` 核对为显示了；已有场景的 `claim-out` 逐字不变。（加了两个：`shadow-root-structure`、`shadow-root-text`，原因见代定 6）
- [x] 没有 shadow root 的页面，结构改动的已有测试全过；整套 e2e 过；perf（headless）不变差。（按 2026-11-12 的轻量规则只跑相关 e2e，没跑整套）

## Comments

### 做了什么（agent，2026-11-12）

- **容器的子层放在哪里**（`shadow-roots.ts` 新增 `holderOf`、`parentOf`）：宿主作为容器时，它的子层在它的 shadow root 里。`holderOf(el)` 是页面 open shadow root（有的话），否则是元素本身。用到它的地方：`slotsOf`、`relocate`、`syncOrders`/`layersIn`、`amongOf`、`compose`/`decompose`/`childOf`、`insertNew`/`insertCopies`/`insertPutBack`，以及 `structure-edits.ts` 里找新层的几处。这样 shadow root 最上面的层（比如宿主下的 panel）也能挪、排顺序、做成 Stack、复制、删除。`parentOf` 是 DOM 上的父元素，shadow root 顶层的取宿主，用在 `holdAbsolute`、`amongOf` 和 check 里。
- **`placeable`**：改成比 `layer.el.parentNode === holderOf(layer.parent.el)`，不再比 `parentElement`。shadow root 顶层的层可以放置了；slot 进去的层仍然不行（代定 1）。`isLoop`、`madeLayer` 也改成比 `parentNode`。
- **跨边界规则**：`Editor.acrossShadowRoot(layer, container)`（`acrossShadowEdge`）比较层的 `getRootNode()` 和容器所装子层那棵树（`holderOf(container).getRootNode()`），不比 Layers 里的上一级。以下情况算越界：
  - 两棵树不同；
  - 层是 slot 进去的；
  - `container` 为 null，即挪出画布、挪进 layer off canvas；shadow root 里的层和 slot 进去的层都算越界；
  - `layer` 为 null，即画布外的层（off canvas 放回）要进 shadow root。

  `canDrop` 先问它；`canDuplicate` 对 slot 进去的层返回 false。没有 shadow root 的画布（`mayHoldShadowRoots`）直接返回 false。
- **拖动**：`findDrop` 从指针下往外找容器，碰到第一个越界的容器就停下，返回 null，即放不进去。它不会接着往外找到宿主旁边去，所以从外面拖进 shadow root 时，不会落到宿主外面。`stopsAtShadowEdge` 在放不进去时判断是不是边界造成的。`CanvasView` 记下 `session.shadowEdge`，松手时不挪，并 `onHint(SHADOW_EDGE_HINT)`，由 Shell 的 `showToast` 显示。shadow root 里的层和 slot 进去的层拖到所有视图外面时，不挪出画布（`stays`），也给提示。拖进 layer off canvas、从画布外拖进 shadow root，同样处理。
- **复制宿主**（`insertCopies`）：先把复制出来的 shadow root 里原件的编辑样式表去掉（`dropCopiedEditStyles`）。复制品插进画布以后再给每个元素 `copyRules`，规则写进它自己所在的树。用 `elementsWithin`，所以 shadow root 里的层也去掉了 layer id 等标记，是复制品自己的层。最后 `editableShadowRoots(copy)` 补上画布样式。`copiedBreakpointsOf` 也会进到 shadow root 里。
- **`freezeLook`**：宿主的 look 会把 shadow root 里的元素也冻结。它们的冻结样式放在各自 shadow root 里的一个 `<style data-ht-look-styles>`，shadow root 里页面自己的 `<style>` 去掉。继承照 flat tree（`flatParent`）。
- **check**：
  - 新层的位置（`findMade`）、reorder（`lookOrder`）读容器的子层时用 `holderOf`。
  - `holderOf`（排版上的父元素）和 absolute 的参照判断用 `parentOf`。
  - `changedAround` 用 `containsAcross`，可以跨 shadow root。
  - `writtenAround` 的 MADE 用 `queryWithin`。
  - `dropUnusedRules` 的 PUT_BACK/MADE 也进到 shadow root 里。
- **claim**：
  - 只改结构、不写样式的改动（reorder、移进布局、文字、删除、没有 style 的复制，`structureOnly`），**Shadow root** 那行改成 "…: the change is to what the component that renders into its shadow root renders there, at Location; it stays in that shadow root."，也不再附 **Shadow roots** 那条样式规则。
  - 样式类改动（含 absolute、Stack）照 137。
  - 有 loc 照常写 Location；没有 loc 照「Not located」；第三方 Web Component 照 137 锁住。
- **对齐线**：拖动、拖手柄改尺寸时，shadow root 里的层照常吸附、画线，e2e 测了（136 推后的那一条）。
- **图层树重建**：e2e 核对了换顺序、改字、做 Stack 以后 Layers 的行。
- GLOSSARY 的 Shadow root 词条加了一句：不能挪进挪出，slot 进去的层不能挪。

### 提示（待规划会话选）

- 现在的占位：`drag.ts` 的 `SHADOW_EDGE_HINT = "Layers can't move into or out of a shadow root."`。松手时在画布底部中间的 toast 里显示（和 "Stroke must be a multiple of 0.5px." 同一个 toast），约 3 秒后淡出，指针在上面时不消失。
- 拖动过程中，现有的「放不进去」就是什么都不画：没有容器框，没有插入线。占位沿用这个做法，拖动中不加别的。
- 改起来只动一个字符串，或 `CanvasView` 里 `endDrag` 开头那一处 `onHint?.(…)`。
- 选项见交付报告。

### 测试与数字（负载下，2026-11-12）

- `pnpm typecheck`：全过（packages/humantouch、三个例子、website）。
- `pnpm test`：vitest 57 个文件，1337 passed / 1 skipped；`node --test` 132/132。
  - 第一次和 bench 一起跑时，3 个文件的 iframe 60s 没起来，测试本身没挂；单独重跑全过。
- 新增 `test/shadow-structure.browser.test.ts`，7 个：
  - 越界规则：出、进、slot 进去的、挪出画布、画布外的层；没有 shadow root 的画布永远不越界；
  - shadow root 顶层换顺序，编辑样式留在 shadow root 里，可以撤销；
  - 做成 Stack；
  - 复制宿主：有画布样式，层是复制品自己的，改复制品不影响原件；
  - 复制和删除，各视图都对；
  - 宿主的 look 冻结 shadow root 里的样式。
- `test/cli.test.ts` 加 1 个：shadow root 里的层改文字的 claim。
- e2e（`HT_E2E_PORT=6500`，只跑相关的）：
  - page 项目 170/170：`shadow-roots`（新增 3 条）、`drag`、`stack`、`grid`、`typing`、`move-placement`、`snapping`、`resize`、`undo`、`off-canvas`、`off-canvas-drag`、`create`、`views`、`style-copy`。
  - project files 项目（`--no-deps`）129/129：`claim`、`applying-bench`、`bench-scenarios`、`round`。
  - 跑完例子里没有遗留改动。
  - 新增 e2e 3 条：
    - 换顺序、改字、做 Stack：画布、三个视图、Layers、改动列表 3 条，撤销三次复原；
    - 放进 shadow root 里的 Frame，变成 Absolute：拖动和改尺寸都有对齐线；拖到页面标题上、slot 进去的层拖到标题前、页面的按钮拖进 shadow root 的 Frame，这三种都不挪，并出现提示；shadow root 顶层的 Frame 挪到 panel 前，可以撤销；
    - 删除、复制 shadow root 里的层，复制宿主：复制品有 shadow root 和画布样式，改复制品的 panel 不影响原件；改动列表 4 条，撤销四次复原。
- bench（`HT_BENCH_PORT=6520`）：
  - `--dry` 37/37。claim-out 和 main e86982c 的 35 个场景（另起的 detached worktree）`diff -r` 比较：只多 `shadow-root-structure.md`、`shadow-root-text.md`，已有的逐字不变。
  - `--scripted` 28/28，含两个新场景，`done` 核对为显示了。
- perf（`HT_PERF_HEADLESS=1 HT_PERF_PORT=6570`，只跑拖动和 claimed round 相关的 8 条，仅作参考）：8 passed。
  - 拖动 60.0fps；拖手柄 58.8fps；20 张 Brief 卡片时拖动和缩放都是 60fps。
  - claimed round 的 check 最长一段：中位数 11–32ms，都在 50ms 内。

### 代定

1. **slot 进去的层在画布上哪里都挪不了**：换顺序、挪进别的容器、做 Stack、复制、挪出画布都不行；拖动时给同一个提示。改文字、删除、改样式照常可以。
   - 原因：它在 Layers 里列在 slot 所在的那层下面（136 代定 2），但写在宿主的 light DOM 里。按 Layers 的位置挪，会把它塞进 shadow 树；按 light DOM 挪，又和看到的位置不一致。
   - 代价：第三方 Web Component 的 slot 内容（ADR 0017 说可以通过 slot 内容改）也不能拖动挪位置，只能改字、改样式、删除。
2. 从外面拖进 shadow root：指针下第一个越界的容器就算「放不进去」，不会退到宿主旁边去放（锁定层是退到旁边的）。宿主本身作为容器（指针在宿主的 padding 上）也算进 shadow root。
3. shadow root 里的层不能挪出画布，也不能拖进 layer off canvas。画布外的层不能放回 shadow root 里。新建层（画框工具、文字工具）可以建在 shadow root 里，没有锁。
4. claim 的 **Shadow root** 行按改动种类分：只改结构的用新的说法，不附 **Shadow roots** 规则；其余照 137 逐字不变。新句子要规划会话过目（Skill/claim 用词保持英文）。
5. 提示用 toast，松手时出现，拖动中不提示（见「提示」）。
6. bench 加了两个场景，不是一个：同一轮里同时换顺序和改其中一层的字，两层的行号互换，按 ticket 99 的配对认不出哪个 marker 是标题的，文字核对是 unchecked。这在 light DOM 也一样，不是 shadow root 的问题。所以换顺序（`shadow-root-structure`）、改字（`shadow-root-text`）分开放。
7. 粘贴（⌘V）到边界另一侧时，照现有的 `canDrop` 不粘贴，不提示。

### 风险

1. ⇧A 做成 Grid 只在代码上走了和 Stack 同一条路（`compose`/`childOf` 用 `holderOf`），shadow root 里没有专门测 Grid。
2. ADR 0017 Consequences 最后一条（「138 要处理：复制、挪动的元素进出 shadow root 时，编辑样式跟着换树」）现在不需要了，因为跨树的挪动被拒绝。复制宿主时，复制品的编辑样式写进它自己的 shadow root。要不要改 ADR 由规划会话决定，没有编号。
3. `freezeLook` 的冻结样式按 shadow root 分开放。宿主挪出画布再放回来时，shadow root 里的 look 样式跟着复制品走，没有专门的 e2e。
4. 同一轮里换顺序 + 改字的组合在真实运行中会出现 unchecked（代定 6，ticket 99 的限制）。
5. `holderOf` 在 live page 的 check 里也会进 shadow root。如果页面上的容器恰好是第三方元素的宿主，读到的子层是它的 shadow 内容，和画布一致；但 closed shadow root 的宿主在画布和页面上都按 light DOM 读。
