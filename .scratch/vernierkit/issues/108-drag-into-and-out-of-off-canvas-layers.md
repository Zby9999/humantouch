# 108: 往画布外的 Frame 里拖进拖出

**What to build:** 画布外的每个图层在自己的一张小页面里，有自己的编辑记录（ADR 0009）。现在图层在它们和画布之间只有两种走法：整个挪出画布、整个拖回视图（ticket 39、40）；画布外图层里面的图层只能在它里面挪。设计师在空白处摆一个 Frame（106）、拉好尺寸（107）以后，接下来要做的是把页面上的东西拖进去拼、拼好的一部分拖出来。要做到下面四种走法，和画布上拖图层一样顺手（吸附、落点框、插入线、Esc 取消、⌥ 复制、⌘Z 一步撤回）：

1. 画布上的图层拖进画布外的 Frame（或 Stack、Grid）：等于把它挪出画布，在页面上是删除；⌥ 拖是复制，页面上不变。
2. 画布外图层里面的图层拖进任一视图：等于拖回这一部分，在页面上是一次插入。
3. 画布外图层里面的图层拖到空白处：自己成为一个画布外的图层。
4. 画布外的图层（整个，或它里面的图层）拖进另一个画布外的 Frame：搬过去，不产生改动。

难点在给 Agent 的规则：同一个图层几经搬动后拖回页面，Agent 该移动原来的代码还是照片段重写。ADR 0009 的原则不变：同一轮内挪出、在画布外没编辑过的，拖回时撤掉删除、记成移动；编辑过、上一轮挪出、⌥ 复制的，拖回时是插入，附源码片段和固化的外观。下面这些开线时作为代定列给设计师：

- 画布上的图层拖进一个画布外的 Frame，这个 Frame 再拖回视图：Agent 拿到的是不是「新建（或插入）这个 Frame，把原来那段代码挪进去」，而不是删掉再照片段重写
- 从一个这一轮挪出的图层里拖出一部分：拖出的那部分算不算「没编辑过」、源码片段从哪里来；剩下的那部分算不算编辑过
- 外面那层是空白处新建的（106）、里面装着画布上挪过来的图层时，拖回的改动说明怎么写

参考本功能的 spec.md（同目录上一级，「画布外的图层」一节），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0001、0009、0011、0012、0013、0014）。

**Blocked by:** 106（拖进空白处新建的 Frame 要先有它）；同一条线上排在 107 之后

**Status:** done

- [x] 上面四种走法都能做，拖的过程里显示落点框和插入线；从外面拖进来时旁边不让位（ticket 40 的决定），在同一个图层里挪照现在的规则；Esc 放回原处，指针被取消时撤回
- [x] 每次拖一步 ⌘Z 撤回，两边一起回去；拖的过程里 ⌘Z、⇧⌘Z、Delete、方向键不起作用（ticket 61、62）
- [x] 走法 1：角标多一条删除，和直接拖到空白处一样；走法 3、4：角标不变；画布外的东西刷新、落地一轮、重新冻结后都还在原处
- [x] 改动说明照代定的规则写，每种拖回都有测试；能移动代码的情况 Agent 拿到的是移动，不是删掉重写；脚本扮演 Agent（`apply`）走一遍「画布上的图层拖进画布外的 Frame、Frame 拖回视图、落地、`done`」，核对是 ✓
- [x] ADR 0009 写进这几条规则；GLOSSARY 里「挪出画布」「拖回」的意思变宽了就跟着改；Skill 若要改，措辞用英文（设计师 2026-11-04 的决定）
- [x] 原来的改动说明逐字不变：`--dry` 24/24、`--scripted` 全过；切换按钮的包逐字节不变
- [x] 性能 headless 前后对比（`TK_PERF_HEADLESS=1`）：进入编辑模式、拖动不变差
- [x] e2e 全过；`off-canvas.spec.ts`、`off-canvas-round.spec.ts` 原有的测试不改

## 背景

- 设计师 2026-11-08 问画布外的 Frame 为什么不能编辑。规划会话的回答：每个画布外的图层是一张单独的小页面，拖进拖出是把图层从一张页面搬到另一张；ticket 39、40 只做了整个挪出、整个拖回，因为这两种给 Agent 的意思很清楚，其余的没进过 ticket，也没定给 Agent 的规则。

## 设计师决定（2026-11-08，分诊）

- 见 106 的「设计师决定」：三张一条线，106 → 107 → 108；调前端第 1 轮合进 main 后开线，发布前做完；设指挥（2026-11-09 改），每张一个实现子 agent、一个审查子 agent，都用 effort medium。
- 给 Agent 的规则由开线的会话作为代定列出，设计师逐条确认。

## Comments

**做了什么（起点 012d070 = 线分支 claude/nifty-borg-823e6d，含 107）**

- 四种走法都接上了：画布上的图层拖进画布外的 Frame/Stack/Grid（挪出画布，页面上是删除，⌥ 是复制）；画布外图层里面的一部分拖进视图（拖回这一部分）、拖到空白处（自己成为画布外的图层）；画布外的图层整个或一部分拖进另一个画布外的 Frame（搬过去，角标不变）。拖的过程里目标那边显示落点框和插入线，旁边不让位；Esc 放回、指针取消撤回；一步 ⌘Z 两边一起回去（`together` 把几个编辑器的记录并成一步）。
- 进到画布外图层里的图层记在那个图层自己的 ChangeSet 里，是一次 `putBack`，带着它的 `origin`；`OffCanvasOrigin` 多了 `inside`（代码写在哪个画布外图层里）和 `edits`（来这里之前的编辑）。拖回时 `remake` 照这些重建，改动说明照下面的代定写。
- 新代码：`off-canvas-moves.ts`（carry / moveInto / partOff）；`off-canvas.ts` 的 keptOf、makeFrom、remake（含 undelete：先撤这一轮的删除）；`CanvasView` 跨文档拖动和 holder；`change-notes.ts` 新的几句；`service.ts` 嵌套 kept 的片段和落地。
- 测试：`off-canvas-moves.browser.test.ts` 12 个；`cli.test.ts` +2、`off-canvas-service.test.ts` +1（改动说明）；e2e `off-canvas-drag.spec.ts` 5 个（四种走法、Esc、⌥、刷新、从列表撤回）；bench 新场景 `off-canvas-frame`（画布上的图层拖进画布外的 Frame、Frame 拖回视图、落地、`done`），`apply` 核对 ✓。

**数字**

- typecheck 过；vitest 1102 过 / 1 跳过；node 125 过；e2e（5400）561 过、1 跳过、0 失败；`off-canvas.spec.ts`、`off-canvas-round.spec.ts` 没改。
- `--dry` 25/25（原来 24 个和 main 的 `--claim-out` `diff -r` 相同，只多 `off-canvas-frame.md`）；`--scripted` 16/16。
- 切换按钮的包逐字节不变：chunk-2GJY7MXB.js 21372 B（a8c4c0d4bc3d）、react.dev.js 1423 B（bd6c2389b644）。editor.dev.js 497,447 → 505,487 B（gzip 176,257 → 178,829，+2.5 KB）；cli.js gzip 45,545 → 46,109。
- 性能（`TK_PERF_HEADLESS=1 TK_PERF_PORT=5410`，main 和分支交替跑；机器上另一条线在跑，负载高）：首次进入编辑模式 main 152.5/150.3 ms、分支 148.9/148.5 ms；全部进入 main 136.7/134.8、分支 132.4/132.2；拖动两边 60 fps；拉尺寸 fps 随负载变（同一负载下 main 47.8–48.9，分支相同），不算变差。

**代定（请设计师逐条确认）**

1. 给 Agent 的规则（已写进 ADR 0009）：
   - 画布上的图层拖进画布外的 Frame、这个 Frame 再拖回视图：这一轮挪出、没编辑过的，照旧撤掉删除、记成移动。空白处新建的 Frame（106）拖回时先撤删除，再算新建 Frame，所以 Agent 拿到的是「新建这个 Frame（含填充），把原来那段代码挪进去」，不是删掉重写。
   - 这一轮挪出的 Frame 里又拖进了图层：这个 Frame 算编辑过，拖回是插入（片段 + 外观）；拖进去的图层列在「Edited off the canvas」里，每个一句「代码还在原处，挪进来，不要删掉重写」。
   - 从这一轮挪出的图层里拖出一部分：这部分不算编辑过，`origin.inside` 记着它的代码在外面那层的代码里；拖回时改动说明让 Agent 先把这段代码挪出来，再删外面那层；外面那层因此算编辑过。片段只在外面那层的删除是这一轮时从它自己的位置取，否则为空。之前的编辑跟着 `origin.edits` 走。
   - ⌥ 拖在每种走法里都是复制，拖回时是插入。
2. 走法 1 在页面上是删除（和拖到空白处一样）；⌥ 是复制、页面不变。
3. 走法 3、4 角标不变。拖出的一部分沿用删除里的 id；空白处新建的图层整个拖进另一个时在那里重建；画出来的部分也重建。
4. 落在画布外图层的树根上（图层旁边）不接受，只能落进图层里面。
5. 散的文字（text run）不能跨文档拖。
6. 在改动列表里撤回一次删除，同时把它在画布外图层里的那份拿掉。
7. 拖进别的文档时目标那边显示落点框（ghost），不让位。

**风险**

- ~~画布外图层里拖出的一部分，若又从其中的 Frame 里挪出图层：拖回会被拒，零散的图层会丢。~~ 审查后已修（见下）。
- ~~在改动列表里撤回空白处新建的 Frame 的「新建」，挪进去的图层可能出现两次。~~ 审查后已修（见下）。
- 在列表里撤回一部分的拖回，它回来时是自己一个图层，不回到原来那层里。
- 同一 id 重复用到时靠 `find` 先找「there」（审查后加了注释和测试）。
- 一部分的片段只从它自己的位置取。
- 场景数变成 25（`bench-scenarios.spec` 会跑新场景）。
- 重建的改动编号接在撤回的那次删除之后。
- 性能是在另一条线高负载下测的。
- 没跑 code-review skill（交给指挥审查）。后续若要开 ticket/ADR，编号在 main 上给。

**审查后的修改（第 1 轮审查，1–7 和规范）**

1. 【高】拖回被拒时画布上的图层出现两次：`remake` 现在先定 missed，有 missed 就什么都不做、也不撤删除；`carry` 失败时用新的 `takeBackSince(history, since)` 把这一步里所有记录（包括撤删除那条）一起撤掉。
2. 【高】被拒的拖回进了重做栈：`carry` 和 `partOff`（makeFrom）失败时都改用 `takeBackSince`，不进 `future`，⇧⌘Z 不会重放。
3. 【高】拖进来的图层里又挪出图层（零散的图层）后，整个 Frame 拖不回、拖不出：现在能做。零散的图层跟外面那层一起走，在目标那边记成一次 `putBack`；`keptOf` 认出它是从拖进来的那层里挪出来的，`origin.inside` 指向那层（它的代码还在那层的代码里），路径是那层的路径加上它原来在里面的位置。拖进来那层算编辑过（插入，删除留着），改动说明里那层的删除会写「里面的某层在改动 M 拖回，先把那段代码挪过去再删」。
4. 【中】在改动列表里撤回空白处新建的 Frame 的新建：拖回时跟着撤掉删除、回到原处的图层，记在新建那条改动的 `madeOffCanvas.back` 里（新加的可选字段）；撤回时（`takenBackOff`，从 Shell 挪到 `off-canvas-moves.ts`）把它们从回到画布外的 Frame 里拿掉，像撤回删除时的 `parts` 一样。
5. 【中】可能的假「not shown」：写了 vitest，确认会报 `not shown: "there"`。修法：`lookDeleted` 里，这次删除的图层若被拖进了这一轮插回的画布外图层（`keptIn` 里有它的 id），只看它在原来的容器里是不是还在；代码挪进新代码里算删了。留在原处照旧是 `not shown`。
6. 【低】`find` 加了注释，加了测试（A 拖进 H、再拖出成为 id 还是 A 的图层、撤销两次、重做两次）。
7. 【低，可选】上一轮挪出的图层里拖出的一部分 `snippet: null`：要从外面那层存下的片段里按行列切出这一段 JSX，不便宜，这次没做，留作风险。
- 规范：`off-canvas-drag.spec.ts` 两处 `waitForTimeout(800)` 改成 `expect.poll` 读本地服务存下的一轮和画布外图层；`off-canvas-moves.ts` 的 `drawnIn` 改名 `isDrawnIn`；`change-notes.ts` 的片段代码块抽成 `snippetBlock`；`itself` 只留 `off-canvas.ts` 导出的一个。
- 确认：没有 `origin.edits` 的图层，`editsOf(layer)` 就是 `layer.edits.changes`（`[...(origin.edits ?? []), ...edits.changes]`），原来拖回的改动说明不变；`e2e/bench/scenarios.ts` 对 012d070 的 diff 只有末尾一段新增，没有删改的行。
- ADR 0009 加了零散图层、页面核对删除、撤回新建这三句。
- 新测试：`off-canvas-moves.browser.test.ts` +5（零散图层拖回视图、拖进别的画布外图层、被拒时全部原样且无可重做、从列表撤回新建、同一 id），`page-elements.browser.test.ts` +2（挪进插回图层里的删除：shown / 留在原处 not shown）。

**审查后的数字**

- typecheck 过；vitest 1109 过 / 1 跳过；node 125 过。
- e2e（5400）：第一次全跑我自己 `saved()` 里引用错（page.evaluate 里用了外面的常量），改好后 `off-canvas-drag.spec.ts` 单跑 5/5；再全跑 558 过、1 跳过、3 失败（中间电脑睡了一阵，round.spec:405 卡了 15.6 分钟；另两条是 applying-bench.spec:2028、bench-scenarios.spec 的 promote-and-grid），这 3 条用 `--project="project files" --no-deps` 单跑全过（27/27）。properties.spec:1193（动效）第一次失败一次，单跑过。
- `--dry` 25/25；和 main（012d070 的 src）的 `--claim-out` `diff -r`：原来 24 份相同，只多 `off-canvas-frame.md`（和审查前那份也相同）。`--scripted` 16/16。
- 切换按钮的包仍逐字节不变：chunk-2GJY7MXB.js 21372 B（a8c4c0d4bc3d）、react.dev.js 1423 B（bd6c2389b644）。editor.dev.js 506,645 B（gzip 179,127）；cli.js gzip 46,116。
- 新风险：零散图层又被挪进另一个零散图层时，里面那个跟着外面那个的外观走，不单独记它的代码在哪；拖进来那层先被拖走、零散的图层留下时，它之后拖回会失去「写在那层代码里」的关联（记成写在画布外那层里，附外观）。

### 指挥合并前复核（2026-11-10）

- 线分支并入 108（4103019）后同步 main（a0cd852，含 110）：`check.ts` 的 import 冲突，两边的名字合在一起（keptIn、PutBack 加上 main 的 isGridSettings、makesGrid、placedAt、Composed），别处无冲突。
- typecheck 过；`pnpm test` 1123 过 / 1 跳过。
- e2e（5400）：page 419/419 过；全跑时电脑合盖睡眠，project files 的 worker 被强制结束、145 条没跑。补跑 `--project="project files" --no-deps`：143 过、1 跳过、1 失败（applying-bench.spec:1158 睡眠中卡 15.2 分钟），单跑 4.0s 过。
- `--dry` 25/25；和 main（a0cd852）的 `--claim-out` `diff -r`：24 份相同，只多 `off-canvas-frame.md`。`--scripted` 16/16。
- perf（headless，5410，main 与分支交替）：首次进入编辑模式 main 135.3 / 138.2ms，分支 136.7ms；全部进入 main 120.5 / 122.0ms，分支 120.8ms；拖动、拖手柄 60fps。负载 10–15 时单次能到 229ms，两边一样受影响。审查确认进入编辑模式的路径上没有新增代码。
