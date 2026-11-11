# 136: shadow root 里的层能悬停、选中，在 Layers 里列出来

**What to build:** 135 让 shadow root 里的内容在画布上看得见了。这张票让设计师能像对待页面上别的层一样，在画布上悬停、点选、框选 shadow root 里的层，在 Layers 里展开看到它们。Design 面板也照常显示选中层的属性。

- 命中测试要进到 shadow root 里面。`elementFromPoint` 只返回宿主，要往里找，比如用 `shadowRoot.elementFromPoint`。
- Layers 的树从宿主往下接着列 shadow root 的子层。宿主本身照常是一层，层名的取法照现在的规则。
- Design 面板读选中层的样式时，要读 shadow root 里的样式表：现在的值从哪里来、Variables 用在哪里，这些读法都要进到 shadow root 里。
- 选中、悬停的框，尺寸标注、对齐线，在 shadow root 里的层上照常画。
- ⌘ 点击（选最深的层）、双击进到里层、Esc 回到上一层，这些照常可用，可以穿过 shadow 边界。

参考 135；用词以 GLOSSARY.md 为准。

**Blocked by:** 135

**Status:** done

- [x] e2e 用 135 的测试页面：
  - 点 shadow root 里的一层，它被选中，Design 面板显示它的值；
  - Layers 里它在宿主下面；
  - 悬停时有框；
  - ⌘ 点击能直接选到最深的层。
- [x] 没有 shadow root 的页面，选中、Layers、Design 面板的已有测试全过。
- [x] 选中一层的 perf 不变差（headless）。
- [x] `--dry` 29/29，`claim-out` 和改前逐字相同；`--scripted` 20/20；整套 e2e 过。（现在场景更多：`--dry` 31/31，`--scripted` 22/22，见 Comments。）

## Comments

**实现记录（2026-11-11，两轮 review 之后）**

做了什么：

- `shadow-roots.ts` 新增（只在「可能有 shadow root」的文档里才走新路子，`mayHoldShadowRoots`）：
  - `hitAt`：命中测试。先 `elementFromPoint`，碰到宿主就接着用 `shadowRoot.elementFromPoint` 往里找，嵌套的也找；要跳过某层时（拖动找容器）用 `elementsFromPoint`，每个 shadow root 里的元素排在它的宿主前面，跳过的是那层「显示出来的」全部：它里面的、它 shadow root 里的、slot 进去的。没有 shadow root 的文档和以前一样。
  - `flatParent`：层所在的上一级元素：slot 进去的是它的 slot，shadow root 最上面的是宿主，别的是父元素。
  - `shownChildren`：图层树在一个元素里读哪些子节点：宿主读它 shadow root 的；slot 读分到它的节点，没分到就读它自己的（后备内容）。
  - `styleShadowRoots`：给画布上每个 shadow root 加画布自己的样式（`transition: none`、`pointer-events: auto` 等，和文档的那份一样），用 adopted stylesheet，放在最后。好处是不在页面的节点中间加节点（`:first-child` 之类不受影响），`getHTML` 和复制都不带它，存轮次时不用去掉。`style-source.ts` 认得它（`isCanvasSheet`），不当成页面的样式。
- `layers.ts`：图层树从宿主往下接着列 shadow root 里的层；slot 进去的层列在 slot 所在的那层下面（slot 默认 `display: contents`，照现在的规矩穿过去）。宿主照常是一层，名字按现在的规矩取；可能有 shadow root 的文档里，文字层的名字取它显示出来的文字（见代定 3）。一层文字只取一棵树里的文字：比如 `<p>Hi <x-name></x-name></p>`，`x-name` 的 shadow root 里有字，`p` 就不再是一层文字，而是 Frame，下面是「Hi」和 `x-name` 两层文字（一段文字靠一个 Range 画框、命中，Range 跨不了树）。命中、`layerOf` 用 `hitAt`、`flatParent`。
- `views.ts`：各视图的命中测试同上。视图里新出现的宿主（`copyOf`）、放回画布的 look（`copyLook`）也给加画布样式（复制不带 adopted stylesheet）。
- `freezer.ts`：`editable`、`copyCanvas` 给 shadow root 加画布样式（`editableShadowRoots`）。
- `style-source.ts`（「现在的值从哪里来」，Variables 用在哪里走的 `winnersAmong` 也在这里）：
  - shadow root 里的元素：读那个 shadow root 自己的样式表（`<style>` 的，再是 adopted 的），不读文档的。
  - 宿主：文档的规则，再加它 shadow root 里的 `:host`、`:host(…)` 规则。
  - slot 进去的元素：文档的规则，再加它所在 shadow root 的 `::slotted(…)` 规则（前面可以有 slot 自己的选择器，比如 `slot[name=a]::slotted(p)`、`.box ::slotted(p)`）。slot 又被转进另一个 shadow root 的 slot 时，沿着 `assignedSlot` 一路读，每个 shadow root 的 `::slotted` 都算。
  - 层叠顺序照 CSS Cascade：先比 `!important`，再比来自哪棵树：元素自己那棵树的规则压过 shadow root 伸出来的（`:host`、`::slotted`）；important 的反过来。CSS layer 的先后每棵树各算各的。
  - 优先级：`:host(X)`、`:host-context(X)` 算一个伪类加上 X 的（CSS Scoping），比如 `:host([dark]) .title` 是 0,3,0，压过后面的 `.panel .title`（0,2,0）。
- `property-table.ts`、`typography.ts`、`containing-block.ts`：找父元素（所在的 Stack / Grid、百分比的基准、继承的文字样式、containing block）改用 `flatParent`，穿过 shadow 边界；slot 进去的层跳过 `display: contents` 的 slot。没有 shadow root 时 `flatParent` 就是 `parentElement`。
- ⌘ 点击、双击进里层、Esc 回上层、⇧ 点击：都按图层树走，图层树已经跨过 shadow 边界，没改 `selection.ts`。
- 选中框、悬停框、⌥ 的距离标注都按层的 `boxOf` 画，shadow root 里的层照样有，e2e 测了选中框、悬停框和 ⌥ 的距离。
- **对齐线这一条推后了，没有核对**：对齐线只在拖动、拖手柄改尺寸时出现，那是 137 / 138 的改动（shadow root 里的层现在还不能拖、不能改），这一票没法测，等 138 做拖动时一起核对。
- 135 的 e2e「点 shadow 里的内容选中宿主」改了：宿主是页面最外面的层，普通点一下照样选中宿主（选最外层的规矩没变），再往下走见下面的测试。

**测试**

- e2e（`e2e/tests/shadow-roots.spec.ts`，135 的测试页面）。测试页面加了一处：宿主自己的一段 `<p class="note">`，slot 到 shadow root 里 panel 的最后。
  - 点标题：选中宿主（第 1 级）。双击：进到 shadow root 里的 panel（第 2 级），Design 面板 Fill `FFE600`、圆角 `16`，都是 shadow root 的样式表写的。Esc 回宿主。
  - ⌘ 点击标题：直接选到标题（第 3 级），选中框和它一样大，字号 `24`；Layers 里是 `1 Stack / 2 Stack / 3 Shadow title / 3 Shadow body / 3 Fading / 3 Slotted note`，slot 进去的那段列在 panel 下面，和它显示的位置一样。
  - 悬停旁边的 body：悬停框和它一样大；按住 ⌥：标题到它的距离标出来，和画布上两者的间距一样；松开就没了。点它选中它。Esc 两次：panel，宿主。
  - ⌘ 点击 slot 进去的那段：选中它，选中框和它一样大，Layers 里在第 3 级。
  - Phone 视图里 ⌘ 点击 panel：选中框画在 Phone 视图里，圆角是 Phone 宽度下的 `4`。
  - 135 的两条（显示、存轮次再载入）加了 slot 以后照旧过。
  - 单独跑 4/4。
- 单元测试（`test/shadow-roots.browser.test.ts`，新增 8 个）：
  - 图层树：宿主下面是 shadow root 的层、slot 进去的层、嵌套 shadow root 的层，顺序和显示的一样；closed 的宿主只有自己的内容。
  - 命中：画布和 Phone 视图里都能命中 shadow root 里的层、嵌套的、slot 进去的；跳过一层时连它 shadow 里的、slot 进去的一起跳过。
  - shadow root 里 `pointer-events: none` 的层照样能命中；画布样式不算页面的值；存下的轮次里没有画布样式；重新打开、视图里也照样有。
  - 值的来源：shadow root 的 `<style>` 和 adopted 的规则；宿主上页面的 `#host` 压过 `:host`，`:host` 的 important 压过页面的 style 属性。
  - slot 进去的层：页面的 `p` 压过 `.box ::slotted(p)`，`::slotted` 提供页面没写的 `font-size`；`slot[name=x]::slotted` 不匹配默认 slot。
  - `:host([dark]) .title` 压过后面的 `.panel .title`，来源说的是前一条。
  - `<p>Hi <x-name></x-name></p>`（`x-name` 的 shadow root 里有字）：`p` 下面是「Hi」和「Ada Lovelace」两层文字，都有框，各自命中到自己。
  - 转了两道的 slot：两个 shadow root 的 `::slotted` 都读到。
- `pnpm typecheck` 通过。
- `pnpm test`：vitest 1237 passed、1 skipped（另有一个临时的 perf 测试文件，量完删了，不算）；`node --test` 129 pass。
- 整套 e2e（`HT_E2E_PORT=6500`，负载 3–11）：610 passed、1 skipped、4 挂。挂的都是 project files 组 `round.spec.ts` 的 556、614、707、742，等 Vite 改写后的 `App.tsx` 5s 超时，两边只差 import 的顺序（Vite 的 HMR 改写），和本票无关。单独 `--workers=1 --repeat-each=3` 跑 12/12 过。跑完示例没有残留改动。
- bench（`HT_BENCH_PORT=6520`）：`--dry` 31/31，`--claim-out` 和 main（7535c54d，packages 和本线 base 61f5f2d2 一样）的输出 `diff -r` 完全相同（31 个文件）。`--scripted` 22/22。场景比票上写的多（29 → 31、20 → 22），是后来加的。

**perf（`HT_PERF_HEADLESS=1 HT_PERF_PORT=6570`，负载 6–11）**

| 项目 | main | 本票 |
|---|---|---|
| 选中 96 张卡片中的一张：work 中位数 / p95 | 11.6 / 14.9ms | 10.3 / 19.0ms |
| 选中：按下到画出 中位数 / p95 | 24.0 / 27.2ms | 23.6 / 27.1ms |
| 进入编辑态 all entries 中位数 | 146.4ms | 132.1ms |

选中的 work p95 高一点（19.0 对 14.9），中位数低一点，都在目标 33.3ms 内，看作噪声。所以又直接量了热路径：4807 个元素、没有 shadow root 的页面，vitest 在同一个浏览器里各跑 15 次取中位数，base 和本票交替各两次：

- 建图层树：base 19.3 / 19.2ms，本票 19.7 / 19.2ms；
- 命中 200 个点：都是 1.8ms；
- 60 个元素读 7 个属性的来源：base 0.5 / 0.5ms，本票 0.6 / 0.5ms。

看不出差别。整套 perf 里本票挂了 1 条：`flex.perf.ts:1387`（20 张 Brief 卡片，拖动和缩放 60fps）。是准备阶段挂的：要点的位置被选中工具条的按钮挡住了，没测到帧率。单独 `--repeat-each=3` 跑 3/3 过，帧率 59.2–60。

### 代定的事（待设计师确认）

1. 画布样式用 adopted stylesheet 加进 shadow root，不加 `<style>` 节点。好处见上。代价：shadow root 被复制以后（视图里新出现的宿主、放回画布的 look 都补了）要记得再加一次。画布上复制图层（138）还没补：复制出来的宿主里 `pointer-events: none` 的层点不到，见风险。
2. slot 进去的层在 Layers 里列在 slot 所在的那层下面（和页面上看到的位置一样），不列在宿主的 light DOM 位置。宿主自己的 light DOM 里没被 slot 进去的子元素不显示，不列。
3. 可能有 shadow root 的文档里，文字层的名字一律取它显示出来的文字（比如宿主 `<x-button>` 的 shadow 里是 `<button><slot>`，或者 `<p>` 里有个 inline 的宿主），不是 `textContent`（`textContent` 只有 light DOM 的文字）。这类文档里，藏起来（`display: none`）的部分也就不进名字了。没有 shadow root 的文档照旧用 `textContent`。
4. 宿主的值的来源只认 `:host` 和 `:host(…)` 本身。`:host(.a):hover`、`:host-context(…)`、`:host` 后面再接别的，都不算，读出来会是「没有」或者别的规则。`::part()` 也没读（页面给组件内部层写的样式）。
7. 一层文字只取一棵树里的文字：文字跨了 shadow 边界，就拆成几层（见上面的 `<p>Hi <x-name>`）。
5. 非热路径（找父元素：所在的 Stack / Grid、继承的文字样式、containing block）的 `flatParent` 没按 `mayHoldShadowRoots` 分开，没有 shadow root 的页面上它就是 `parentElement`，多读一次 `assignedSlot`。图层树（每个元素都走）是分开的。
6. 冻结页面时 `containingBlockOf` 也穿过 shadow 边界了（`freezer.ts` 钉住 fixed 层时用它）。只影响页面上 shadow root 里或 slot 进去的固定定位层，没有 shadow root 的页面不变（135 的逐字节快照照样过）。

### 风险

- 画布上复制一个宿主（138 的复制）：复制出来的 shadow root 没有画布样式，里面 `pointer-events: none` 的层点不到，`transition` 也会在改样式时动起来。138 做复制时补 `editableShadowRoots`。
- 图层树、视图跟随画布：画布 shadow root 里的改动要重建图层树、刷新面板。135 让视图跟上了，但编辑器监听画布变化重建图层树这一层还没在 shadow root 上验过，要等 137 真正往 shadow root 里写改动时看。
- 文字跨两棵树（比如 `<p>Hi <x-name></x-name></p>` 这种 inline 组件，很容易碰到）：现在拆成几层文字，框和命中都对了（代定 7）。但 Frame 里夹在别的层之间的散文字（`drawnChildren` 的 run）遇到 `display: contents` 的 slot 会在元素边界断开，没见过跨树的情况，只是没专门测。
- 138 要注意：slot 进去的层在 Layers 里的上一级是 shadow 树里的层，可它在 DOM 里的父元素是宿主的 light DOM。所以「不能跨 shadow 边界挪动」要比 `getRootNode()`，不能比 Layers 里的上一级。`structure-edits.ts:410` 的 `placeable` 现在已经把 slot 进去的层和 shadow root 最上面的层都当成不能放置。
- 137 要注意：第三方 Web Components（比如 node_modules 里的 Shoelace）shadow root 里的层，没有 `loc`，也没有 thirdParty 的 usage chain，现在看起来就是普通的、能改的层，不像 React 第三方组件那样锁住。
- `slotAssignment: "manual"` 135 没复制，按名字分配，图层树也跟着按名字分配的读。
- 137 要接着做：改样式写进 shadow root；`claim` 讲清楚改的是组件自己的样式；`done` 的页面核对进 shadow root。`style-source` 现在能说出值来自 shadow root 的哪条规则（`file` 是 null，shadow root 的 `<style>` 没有来源文件），137 写 `claim` 时可以用。
