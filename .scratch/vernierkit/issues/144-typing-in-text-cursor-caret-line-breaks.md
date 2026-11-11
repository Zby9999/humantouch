# 144: 在画布上改文字：竖光标、点哪选哪、Return 换行

**What to build:** 设计师说现在在画布上改文字很不好用（2026-11-11，有截图），有三个问题：

1. 编辑文字时，鼠标还是箭头，不是文字的竖光标（I-beam）。
2. 点不准：点一下放光标、拖动选字，落的位置是偏的。
3. 按 Return 想换行，现在只能结束编辑。

现在的做法（规划会话读代码看到的）：

- 双击文字图层，那个视图里的元素变成 `contenteditable="plaintext-only"`。
- 指针事件在画布外层的 viewport 上，光标和选区是自己算的：先把指针位置换算成视图里的坐标（`toView`），再交给视图文档的 `caretPositionFromPoint`（`CanvasView.tsx` 的 `pressInTyped` / `caretAt`）。偏差多半出在这一步的换算，比如缩放、视图标题栏、视图里的滚动。要实际诊断，不要猜。
- Enter 和 Esc 都会结束编辑。结束时文字的空白全部合成一个空格（`replace(/\s+/g, " ")`），所以换行也会丢掉。

设计师定的做法（2026-11-11）：

- **光标**：编辑文字时，指针在这段文字上显示竖光标；离开文字，照常是箭头。没在编辑时不变。
- **点哪选哪**：点一下光标落在点的位置；拖动选中的就是拖过的字。双击选词、三击全选、⇧点击扩展选区也一样准。要在每个视图（桌面、平板、手机）、任何缩放、视图滚动过以后都准。
- **换行**：
  - Return 和 ⇧Return 在光标处换行。
  - Esc、点别处、⌘Return 结束编辑，保留改好的文字（Esc 本来就是保留，不是取消）。
  - 文字里的换行留在画布上，各视图都显示成换行。撤销、重做照常。
  - 同一行里连续的空格照旧合成一个。
- **交给 Agent**：
  - 改动说明写清楚换行在哪，以及在代码里怎么写，比如 JSX 里的 `<br />`。项目已有自己写法的，照项目的。具体措辞是代定，Skill 和改动说明的用词保持英文。
  - `done` 核对时，页面上换行的位置和改动一致才算显示了。

用词以 GLOSSARY.md 为准；涉及 ADR 0012（按住时不编辑）。

**Blocked by:** None。发布前做（设计师 2026-11-11 定）。

**Status:** ready-for-agent

- [x] e2e，光标：编辑文字时，文字上的 `cursor` 是 `text`，文字外是箭头；结束编辑后恢复。
- [x] e2e，点准：在桌面和手机视图、100% 和放大后的缩放下，点在某个字的左半边，光标落在这个字前；拖过一个词，选中的正好是这个词。修改前这条测试会失败（先写测试，证明偏差）。
- [x] e2e，换行：双击文字，在中间按 Return 输入第二行，按 Esc。画布和各视图显示两行，改动列表有这条改动，⌘Z 撤回。⌘Return 和点别处也能结束编辑。
- [x] 加一个 bench 场景（文字里加换行）：`--dry` 列出改动并写清换行，`--scripted` 落地后 `done` 判为显示了；已有场景的 `claim-out` 逐字不变。
- [x] 已有文字编辑的测试全过（Enter 结束编辑的那些按新规矩改，Comments 里写明改了哪些）；`pnpm test`、整套 e2e 过。

## Comments

### 诊断：点不准是怎么来的（2026-11-11，实测）

- 先按规划会话怀疑的地方量：`pressInTyped` / `caretAt` 的换算（`toView` → `caretPositionFromPoint`）本身没错。在桌面、手机视图，缩放 26%（适应）、87%、288%，devicePixelRatio 1 和 2 下，用二分法找光标从字 2 后跳到字 3 后的那个点，和字中线相差 0.02 视图 px（就是二分的精度），每个字左 1/4 处点下去，光标都落在字前。
- 真正的偏差来自 `.ht-viewport` 被浏览器滚动了。它是 `overflow: hidden`，不能手动滚，但浏览器能用脚本或"把光标露出来"的方式滚它。打字时文字超出画布视口的边，浏览器就把视口滚过去，让光标露出来。`toCanvas` 只看相机，不看视口的 `scrollLeft` / `scrollTop`，从此按下、拖动、悬停、选中框都差这么多，直到重新加载。
  - 实测：先放大，让文字从视口左边 40px 处开始，再打一长串字超过右边或下边。之后视口的 `scrollLeft` 是：桌面 200% 标题 318px，桌面 400% 标题 596px、段落 428px，手机 400% 标题 120px、段落 428px。偏差就是这么多屏幕 px，例如桌面 200% 时是 159 视图 px，大约 16 个字。
  - 不超出边时（文字整个在视口里），偏差是 0：所以点哪选哪在大多数时候是准的，一打字打过边就整个偏了。这正好就是"视图滚动过以后"。
  - 试过把视口改成 `overflow: clip`（不再是可滚动的容器），结果浏览器转去滚宿主页面的 `window`（scrollY 296），更糟，没有用。
- 修法（`CanvasView.tsx`）：视口上监听 `scroll`，一滚就把 `scrollLeft` / `scrollTop` 清回 0，同时相机移动同样的距离。画布看起来停在浏览器滚到的地方（光标照样露出来，像在页面里打字一样），换算也一直对。修后同样场景偏差 0：新测试里每个能看见的字都点得准。

### 改了什么

- **竖光标**：编辑文字时，指针在被编辑的那段文字的框里（和"按下放光标"用的是同一个判断 `inTyped`：同一视图、在元素框里），视口加 `is-over-typed`，`cursor: text`。拖着选字时也保持竖光标。按着空格（平移）时还是手形。其他视图里同一段字、文字外、结束编辑后都是箭头。双击进入编辑时和用 T 画出文字后立刻是竖光标，不用等鼠标动。
- **Return 换行**：Return 和 ⇧Return 交给浏览器自己处理。`plaintext-only` 下 Chrome 在光标处插入 "\n"，编辑中元素是 `white-space: pre-wrap`，所以看得到换行。Esc 和 ⌘Return（Ctrl+Return）结束编辑，点别处照旧也结束。输入法组字中的 Enter / Esc 不拦。按着鼠标时（ADR 0012）原来拦回车，现在拦 ⌘Return；Return 是打字，照常。ADR 0012 的那条 Consequences 补了一句。
- **文字和换行**：新模块 `client/words.ts`。
  - `wordsOf(el, lines)`：`<br>` 读成 "\n"，`white-space` 保留换行的元素（pre、pre-wrap、pre-line、break-spaces）里的 "\n" 也读成换行，别的空白照旧合成一个空格。
  - `tidyWords`：每行里连续空白合成一个空格并去掉首尾空格；开头、结尾的换行去掉，中间的（包括空行）保留。
  - 结束编辑时在去掉 `contenteditable` 之前读，因为那时还是 pre-wrap。
- **画到画布上**：`layer-changes.ts` 的 `writeWords` 把 "\n" 写成 `<br>`。它用在改字（`writeText`）、新建文字（`insertNew`）、新建文字改字（`setText` 的 create 分支）这几处。撤销、重做、存下的一轮重新加载都走这几处。三个视图跟着画布，都显示换行。图层名把换行当空格（"Third Kind"，不会把两行连成一个词）。
- **改动列表**：`“Third Kind” → “Third↵Kind↵Studio One”`（↵ 表示换行，`quotedWords`；Brief 照旧用 `quoted`，不换成 ↵）。
- **改动说明**（只在改动前或改动后有换行时才出现，`breaksLines`，其他场景逐字不变）：
  - Design intent 后面加一句，比如 `The new words are in 2 lines: “Third” and “Kind”, a line break where ↵ is.`；去掉换行时加 `The new words are on one line, with no line break.`；新建文字加 `It reads in 2 lines: …`。
  - How to write them 加一条 **Line breaks**：`the notes give the new words line by line, each line break shown as ↵. Break the line there the way the project already breaks lines in text; in JSX with no way of its own, `<br />`. Take out a line break the new words no longer have. No space around a break is part of the words.`
  - How the page checks 加一句：`line breaks in the words by where the page breaks their lines: at a `<br>`, or at a new line the text keeps (`white-space: pre-line`, say), none more and none fewer`。
- **`done` 核对**（`check.ts`）：只对改动前或改动后有换行的改字，按行比较（`wordsOn(el, true)`）：换行要在同样的位置，不多也不少。新建文字有换行的，也按行找。组件其他使用处（ticket 90）也按行读。没有换行的改字照旧：`<br>` 当空格。
- **bench 场景** `text-line-break`：标题在 "Third" 后按 Return、按 Esc，改成两行。脚本落地写成 `>Third<br />Kind</h1>`。`shows` 看 `h1.innerText === "Third\nKind"`。

### 已有测试按新规矩改的（Enter 结束编辑 → Esc）

- `e2e/tests/create.spec.ts`：「T and a drag in a Stack make new text there …」、「T and a click …」那条（"A much longer line of words"）、「while the pointer is held, … T」那条按完键松手后打字的那步、「a double click on the selected text types in it …」、「while text is typed in, a click in it places the caret there …」。
- `e2e/tests/text-in-a-box.spec.ts`：「a click on the Close button selects it; a double click types in its words」。
- `e2e/tests/made-off-canvas.spec.ts`：「T clicked in the blank space makes text there …」、Brief 之后用 T 在 Frame 里打 "Launch" 的那步。
- `e2e/tests/applying-bench.spec.ts`：新文字 "Fresh"、"Fresh line" 两条（ticket 76），和 1761 行那条（打字后 `toHaveText(words)`）。
- `e2e/bench/scenarios.ts`：`data-and-text`（"Third Kind Studio"）、`put-back-and-new-text`（"Works with any Agent."）。`e2e/bench/scenarios-other-examples.ts`：`next-server-usage-text`（"bytes shipped to production"）。改动单内容一样，`claim-out` 逐字不变（见下）。
- `e2e/perf/flex.perf.ts`：用 T 画出新文字、打 "Ships in a day" 后结束编辑的那步（第二次审查发现的）。
- 原来按 Enter 后接着按 Esc 的（applying-bench 两条、put-back-and-new-text），现在是 Esc 结束编辑，再一个 Esc 照旧选上一层。Brief 卡片、面板字段里的 Enter 没动。

### 新测试

- `e2e/tests/typing.spec.ts`，共 10 条：
  - 竖光标 2 条：文字上 / 文字外 / 结束后；另一个视图里同一段字是箭头。
  - 点准 6 条：桌面、平板、手机 × 100%、200%。先放大，把标题放在视口左下角，打一长串字超过右边（桌面）或下边（手机、平板换行）。然后对每个看得见、上面没有编辑层东西挡着的字：
    - 单击左 1/4 处，光标在字前；
    - ⇧单击扩展到另一个字前，选中的正好是中间那段；
    - 从一个词第一个字左 1/4 拖到最后一个字右 3/4，选中这个词；
    - 双击另一个词，选中那个词；三击选中全部。
  - 换行 2 条：
    - 中间 Return、末尾 ⇧Return、输入 "Studio   One"，Esc。三个视图 `innerText` 都是 "Third\nKind\nStudio One"，画布上 2 个 `<br>`，改动列表 `“Third Kind” → “Third↵Kind↵Studio One”`，⌘Z 回到一行，⇧⌘Z 又是三行。
    - 手机视图里 ⌘Return 结束，末尾多按的 Return 不留；再在桌面视图里换行后点别处结束，三行。
- 修改前失败：把视口 scroll → 相机那段临时去掉、重新构建，4 条点准（当时还只有桌面、手机）全失败。光标应在 1 / 3，实际在 0 或 61。恢复后通过。
- 单元测试：`edits.browser.test.ts` 2 条（带换行的字画成 `<br>`、读回来、撤销；源码里已有 `<br>` 的读成换行，合成一行是改动；新建文字的换行）；`cli.test.ts` 2 条（有换行的说明逐行写清、Line breaks 规则、核对一句；没有换行时说明里没有任何 "line break" 字样）。

### 第一次审查后的修正（f366c4f）

- Brief 里的换行照旧原样引用：只有图层的字用 ↵（`quotedWords`），`quoted` 不变。
- 读字的函数移到 `client/words.ts`；`check.ts` 的 `wordsOn` 改由它读，去掉重复的遍历。"有没有换行"统一用 `breaksLines`（`design-values.ts`）。
- 组件其他使用处、图层名、`typography.ts` 列出的片段也读到换行（片段和图层名里换行当空格）。
- 用 T 画出文字后立刻是竖光标；点准测试加了双击、三击和平板视图。

### 第二次审查后的修正（d59ff15，2026-11-12）

- **必须修：凭空多出的换行改动。** 文字节点里本来就有 "\n"（例如 `{item.description}` 的数据里有换行、多行的模板字符串），页面上 `white-space: normal` 把它画成空格。Chromium 一进入 `plaintext-only` 编辑，就把 `white-space` 换成 `pre-wrap`（`nowrap` 换成 `pre`），那个 "\n" 就显示成换行，结束时被读成换行。结果双击后什么都不改、按 Esc，也会记一条 “One Two” → “One↵Two”，并叫 Agent 加 `<br>`。
  - 修法：开始编辑前（`beginTyping`，设 `contentEditable` 之前），把元素里那些 "\n" 被画成空格的文字节点（看节点父元素的 `white-space`）里的换行连同两边的空白换成一个空格（`words.ts` 的 `spaceOutNewLines`）。结束时画布照旧用开始前的 `innerHTML` 还原。
  - 新 e2e：画布标题的文字改成 "Third\n   Kind"，在桌面、手机视图各双击一次再按 Esc：编辑中读到 "Third Kind"，结束后没有改动。修改前这条失败（读到两行），修改后通过。
- **播放时的滚动**：视口 scroll 变成相机移动时，播放中照滚轮、键那样用 `scrolled(...)` 限在播放的页面里。
- **画布外新建文字的竖光标**：在空白处用 T 点出文字时，新图层这一帧还不在 `outside` 列表里，所以下一帧直接拿被编辑元素在它自己 iframe 里的框来比（`pointsAtTyped`）。这个框允许差 1 屏幕 px，因为 iframe 放的位置比点的地方偏了零点几 px（实测 0.07px）。新 e2e：空白处 T 点一下，鼠标不动，就是竖光标。
- `e2e/perf/flex.perf.ts` 里 T 画出文字后的 Enter 改成 Esc。
- 新单元测试：
  - `edits.browser.test.ts`：存下的一轮有换行，重新打开还是 `<br>`，从存下的一轮撤回这条后回到原来的字。
  - `promote.browser.test.ts`：`done` 按行核对。三个实例都是 `<br>` 时显示了；少一个换行、多一个换行都判为没显示；`white-space: pre-line` 加 "\n" 判为显示了，`normal` 加 "\n" 判为没显示。
- 编辑中别的视图什么时候显示换行，实测见代定 10。

### 结果（合并 main 15e0492 后，分支 76fca7f 之上）

- 合并 main 有三处冲突：`check.ts` 的 import、`layers.ts` 文字图层名（main 的 shadow DOM 分支加上我的 `wordsOf(el, false)`）、`design-values.ts` 其他使用处的字（main 的 `nth` 加上我的 `quotedWords`）。都两边保留。
- typecheck 过。
- `pnpm test`：vitest 1267 passed / 1 skipped，node 132/132。
- 整套 e2e（`HT_E2E_PORT=6800`）：628 passed、1 skipped、1 失败，13.3 分钟；跑完 `examples/` 没有残留改动。
  - 失败的是 `applying-bench.spec.ts:1527`「the loop's cards filled red, promoted to the Card itself …」：`changesNow()[0].scope` 是 `usage`，不是 `component`，也就是 Promote 那一步没落到改动单里就读了。和打字无关。
  - 单跑 `--workers=1 --repeat-each=5`：本分支 2/5 过。在 main 15e0492 上同样跑：3/5 过。main 上也会失败，不是这张票带来的。
  - 上一遍（合并前）失败过的 `code-changes.spec.ts:253`「the toasts …」这次整套里过了，单跑 3/3 过，记为机器忙。
- bench（`HT_BENCH_PORT=6820`）：
  - `--dry` 33/33（main 32 个 + `text-line-break`）。
  - `--dry --claim-out` 和 main 15e0492（scratchpad 里临时的 detached worktree，同一次持锁里跑）`diff -r`：已有 32 份逐字相同，只多出 `text-line-break.md`。
  - `--scripted` 24/24，含 `text-line-break`。
- perf（`HT_PERF_HEADLESS=1 HT_PERF_PORT=6840`）：20/20，8.1 分钟。
- 合并前（同步 f7780b49）那一遍的数字：vitest 1224、node 129、e2e 621 过 0 失败、`--dry` 32/32、`--scripted` 23/23、perf 20/20。

## 代定

1. 视口被浏览器滚动时，相机跟着移同样的距离：打字打过边，画布跟着光标走，就像页面里打字时页面会滚一样。也可以不跟（画布不动，光标跑到视口外看不见）；那样要另外挡住浏览器的滚动，没有现成的 CSS 办法（`overflow: clip` 会让浏览器去滚宿主页面）。这个监听一直开着，不只在编辑文字时：别的原因（例如 Playwright 点击前把元素滚进视野、⌘F 查找）滚到视口时也一样变成相机移动。
2. 竖光标的范围是被编辑元素的整个框，和"按下放光标"的范围一致。块级的段落比文字宽，所以文字右边的空白也是竖光标，点下去光标落在行尾。
3. Return、⇧Return 都换行；⌘Return（Ctrl+Return）结束。Brief 卡片是 Enter 结束、⇧Enter 换行，两处不一样，是照 ticket 写的。
4. 开头和结尾的换行不留：在最前面按 Return、或最后按 Return 再结束，编辑中看得到空行，结束后去掉。中间的空行（连按两次 Return）保留，画成两个 `<br>`。
5. 每行首尾的空格去掉，行内连续空格合成一个。
6. 画布上换行一律写成 `<br>`；给 Agent 的说明里用 ↵ 表示换行，并逐行列出。改动列表里也用 ↵。
7. 源码里已经有 `<br>` 的文字，现在读成带换行的字。设计师只改了其中一个字时，说明里也会出现换行的那句和 Line breaks 规则，`done` 也按行核对。示例项目里没有 `<br>`，所以 bench 不受影响。
8. 说明的措辞（Design intent 后的那句、Line breaks 规则、核对那句），见上面"改动说明"。
9. `done` 按行核对只认 `<br>` 和 `white-space` 保留的 "\n"。用块级元素（两个 `display: block` 的 span）分行的不算换行，会判为没显示。
10. 编辑中别的视图什么时候显示换行（实测）：
    - 在桌面视图里打字时，三个视图都马上显示换行。行里连续的空格编辑中也照样显示，结束后才合成一个。原因是桌面视图就是画布本身，别的视图连 `contenteditable` 属性一起跟着它，所以也是 `pre-wrap`。
    - 在平板或手机视图里打字时，只有那个视图马上显示换行；画布和别的视图把 "\n" 画成空格，按 Esc 后才显示。
    - 两种情况结束后都一样。要不要让别的视图在编辑中也一律显示（或者一律不显示），请设计师定。
11. 页面上被画成空格的 "\n"（数据、多行字符串里的），开始编辑时先变成一个空格，所以编辑中也显示成空格，不会变成换行。只编辑不改字，就没有改动。改了字，新字里这个位置就是空格。

## 风险

1. Chrome `plaintext-only` 下 Return 插入的是 "\n"，靠的是编辑中的 `pre-wrap`。别的浏览器可能插入 `<br>` 或 `<div>`。`<br>` 能读到，`<div>` 读不到换行，那一行会并进前一行。没测 Firefox / Safari。
2. 视口的 scroll 监听在 scroll 事件里同步清零、`setCamera`。Preact 在微任务里重画，同一帧内画布不跳。在很慢的机器上如果晚一帧，可能闪一下。
3. 核对按行时用的是 `getComputedStyle(white-space)`，只对含 "\n" 的文字节点调用。文字节点很多、又都含换行的页面上会慢一点。
4. bench 场景的 `shows` 用 `innerText`，依赖标题没有 `text-transform`。示例里没有。
5. 改动说明的新措辞没有用真实 Agent 跑过（这张票不跑真实 Agent）。`<br />` 写法、项目自己的写法（比如数组里的字符串加 `whitespace-pre-line`）是否都能被 Agent 照做，要等下一次真实跑。
6. `spaceOutNewLines` 靠的是 Chromium 进入 `plaintext-only` 时把 `white-space` 换成 `pre-wrap` / `pre`。别的浏览器如果不换，这一步没有坏处，只是多做了一次。如果哪个浏览器换成了别的值，判断会落空。
7. 画布外新建文字的竖光标是在下一帧判断的，允许差 1 屏幕 px。缩放很小的时候，1 屏幕 px 在画布上很宽（26% 时约 4 画布 px），文字框外边一点点也会是竖光标，但点下去不会放光标（按下的判断没有这 1px 的余量）。
8. `applying-bench.spec.ts:1527`（Promote 后马上读改动单）在 main 上也时好时坏（3/5），和这张票无关，可能要另开一张。
