# 137: shadow root 里的层能改样式，Agent 能落地，`done` 能核对

**What to build:** 设计师在 Design 面板里改 shadow root 里的一层，比如填色、圆角、间距、文字。改动在画布和各视图里马上显示，进改动列表；交给 Agent 时，`claim` 写清楚改哪里，`done` 能在页面上核对它有没有显示。

- 画布上的样式改动现在写成文档里的 CSS 规则，进不了 shadow root。改动要写进那个 shadow root 自己的样式里，比如往 shadow root 里加一个编辑样式表。断点规则（在 Tablet、Phone 改的只在那个断点生效）照常可用。
- 撤销、重做、⌥⌘C / ⌥⌘V 复制粘贴样式、Variables 绑定，在 shadow root 里的层上照常可用。
- `claim` 怎么写：
  - 层有源码位置（`data-ht-loc`，比如官网 hero 这种 React portal 渲染的 JSX）时，照常写 Location，改动写在源码里那一处。
  - 样式写在 shadow root 的 `<style>` 或组件的 styles 里时，说明要提到这一点：改的是那个组件自己的样式，不是全局 CSS。
  - 层没有源码位置（比如 Lit 模板）时，照现在「找不到位置」的规矩写。
- `done` 的页面核对要进到页面上的 open shadow root 里，按标记找到那一层再核对。找不到就照「Not checked」的规矩处理。

参考 135、136，`canvas-style.ts`、`check.ts`、`change-notes.ts`、`writing-rules.ts`；用词以 GLOSSARY.md 为准。这里有几个难反悔的决定，比如改动写到哪里、`claim` 怎么说，值得的话写一份 ADR，编号向规划会话要。

**Blocked by:** 136

**Status:** done

- [x] e2e：在 135 的测试页面上改 shadow root 里一层的填色和圆角，画布和各视图都显示；在 Phone 视图改的只在 Phone 断点生效；撤销、重做照常。
- [x] 加一个 bench 场景，在 shadow root 里的层上改样式：
  - `--dry` 能正确列出改动；
  - `--scripted` 按 `claim` 的说明改代码以后，`done` 核对为显示了；
  - 已有 29 个场景的 `claim-out` 逐字不变。
- [x] 没有源码位置的层，`claim` 照「找不到位置」的规矩说。有单元测试。
- [x] 没有 shadow root 的页面，样式改动、撤销、复制粘贴、核对的已有测试全过；perf（headless）不变差。
- [x] `--scripted` 全过；整套 e2e 过。

## 规划会话补充（2026-11-11 晚，136 的问题 A、B）

- **第三方 Web Components 的层要锁住**，和 React 第三方组件一样：
  - 定义自定义元素的模块来自 `node_modules` 或 vendored 包的，它 shadow root 里的层在使用链上标 thirdParty。
  - 照 ticket 120 的「Third-party components」规则，只能走组件从使用处接收的东西改：属性、slot、CSS 自定义属性、`::part()`。
  - 加一个测试或 bench 场景，第三方 Web Component（比如一个放在示例 `node_modules` 里的小组件）里的层带 thirdParty，规则会出现。
- **`::part()` 写的样式算来源**，Design 面板和 `claim` 都要报出来；`:host-context()` 暂不算。

## Comments

### 做了什么（agent，2026-11-12）

- **改动写到哪里**：每个 shadow root 一个作用域（`scopeOf`）。shadow root 里的层，编辑样式表（`style[data-ht-rules-for]`，`human-touch-edits` 层、`!important`、断点照旧用 media query）加在那个 shadow root 的末尾，层顺序样式放在第一张编辑样式表前；key、id 仍在整个文档里编号。`elementsOf`、`readRules`、`copyRules`、`dropUnusedRules`、`syncEditStyles`、`nextKey` 都进到 open shadow root 里（只在 `mayHoldShadowRoots` 的文档上，没有 shadow root 的页面走原来的路）。撤销、重做、⌥⌘C/⌥⌘V、Variables 绑定、保存与恢复轮次都跟着走（存的轮次用 `Document.parseHTMLUnsafe` 恢复 declarative shadow root：`parseCanvas`）。
- **来源（style-source）**：`Candidate.inner` 换成 `depth`（本树 0、`:host`/`::slotted` 1、`::part` -1），按 CSS Cascade 的树上下文比较：普通声明外层赢，`!important` 内层赢。`::part()` 规则算来源（Design 面板和 claim 都报），`:host-context()` 不算。shadow root 自己的规则在来源上记 `shadowRoot`（host 的标签名）。
- **claim**：`Target.shadowRoot`（host 的开始标签）。有 `data-ht-loc` 照写 Location；另加一行 **Shadow root**：改的是那个组件给它 shadow root 的样式，不是全局 CSS（新规则 **Shadow roots**）；没有位置（Lit）照「Not located」的规矩。shadow root 自己的规则在 Set by 里写成「of the styles `<tag>` has in its shadow root」，也不再出「A rule in no CSS layer」。
- **第三方 Web Components（规划会话 A）**：开发时注入的脚本（`src/definitions.ts`，经 `vite.ts` 的 `transformIndexHtml`）包住 `customElements.define`，记下定义时的调用栈；包装之后的模块帧全在 `/node_modules/` 下的，算依赖定义的（`definedByDependency`）。没有 fiber 的层，`webComponentChain` 把 host 作为 `thirdParty` 放进使用链，照 120 的规则锁住；claim 的 Shadow root 行改说「从使用处改，用它接收的东西（见 **Third-party Web Components**）」，规则列出属性、slot、CSS 自定义属性和 `::part()`。
- **done 的核对**：`page-elements` 的标记查找在页面或存的画布有 shadow root 时进到里面（`deep`），找不到照「Not checked」。其他宽度的页面副本（page-copy）把页面的 open shadow root 连同 adopted 样式表一起复制，节点跟着同步（adopted 样式表只抄一次）；页面可克隆的 shadow root 也处理了。编辑层自己的 `<human-touch>` 和 `NOT_THE_PAGES` 的不算（review 后修，见下）。
- **例子与 bench**：`examples/vite-react19-tw4` 加 `/shadow` 页（`src/shadow/ShadowPanel.tsx`，React portal 进 open shadow root，样式写在 `<style>` 里），`main.tsx` 只在末尾加动态 import，已有行号不动。新 bench 场景 `shadow-root-style`（填色 #2563EB、圆角 10，apply 步改 ShadowPanel.tsx 里 `.panel` 的 CSS 字符串）。
- **ADR 0017**：`docs/adr/0017-edits-inside-shadow-roots.md`。

### 测试与数字

- vitest 1279 passed / 1 skipped；node --test 132/132；typecheck 过。新 `test/shadow-edits.browser.test.ts` 15 个，`test/cli.test.ts` 加 3 个 claim 测试（有位置的 shadow 层、Lit 无位置、第三方）。
- 整套 e2e（合 main 15e0492 之后）：618 passed / 1 failed / 1 skipped。失败的是 `applying-bench.spec.ts:1527`（promote 到 Card），单独重跑 1/3 过：测试在 promote 保存之前就读了 changes.json。和 shadow root 无关（`componentElements` 在没有 shadow root 的文档上仍是 `querySelectorAll`），之前的整套 e2e 里它是过的。改成 `expect.poll` 等 scope 之后单独重跑 4/4 过。
- shadow e2e（`e2e/tests/shadow-roots.spec.ts`）：填色、圆角在画布和各视图显示，Phone 圆角只在 Phone，撤销重做，第三方 `acme-chip` 被锁、存下的 target 带 `thirdParty` 和 `shadowRoot`：全过。
- bench `--dry`：main 32 个场景，本分支 33 个（多 `shadow-root-style`）。`--claim-out` 与 main 用 `diff -r` 比：只多 `shadow-root-style.md`，已有的逐字不变。`--scripted` 24/24 过，含 `shadow-root-style`（done 核对为显示了）。
- perf（headless，`HT_PERF_HEADLESS=1`）20 passed。toggle chunk 10126 B（预算 10240 B）。

### 代定

1. 编辑样式表加在 shadow root 的末尾（不是开头）：要压过 shadow root 自己的普通规则；`:last-child` 一类选择器可能受影响（见风险）。
2. host 元素本身的改动留在外层树（文档）的编辑样式里，只有 shadow root 里的层才写进 shadow root。
3. 第三方只认 `/node_modules/` 下的模块；放在别的目录里的 vendored 包不认（规划会话 2026-11-12 确认：不按 `vendor/`、`libs/` 推断；node_modules 以外的 vendored 包由 **Every change** 管，Agent 留下不做并报告。已写进 ADR 0017）。
4. 只有 Vite 插件注入包装脚本；Next.js 下没有第三方 Web Component 的检测（规划会话确认，ticket 159 发布后做）：在那之前 Next 里第三方 Web Component 的 shadow root 算项目自己的、能改，Agent 照 **Every change** 留下不做并报告。已写进 ADR 0017 Consequences。
5. 例子的 `/shadow` 页用动态 import 加，为了不动 `main.tsx` 已有的行号（已有场景的 claim-out 不变）。
6. 第三方的检测用 e2e 的 route 提供 `/node_modules/acme-elements/chip.js`，没有在例子里真放一个 node_modules 包（例子的 node_modules 不入库）。
7. claim 的 Variables 行对 shadow 层不提 Tailwind 类：Tailwind 主题的变量写成 `var(--…)`（主题没给 CSS 变量时写它的值），没有变量时只说用准确的值（review 4）。
8. `applying-bench.spec.ts:1527` 的竞争：promote 之后等 scope 存成 component，放进 `changeACard`（测试的竞争，不是产品行为；reviewer 确认）。

### 风险

1. 只认 `/node_modules/`；设计系统用 `register()` 之类、或在项目代码里调 `define` 注册第三方元素时，会被当成项目自己的（漏锁）。
2. 调用栈默认 10 帧，很深的定义链可能把项目的元素误判为第三方。
3. `dropUnusedRules` 的 PUT_BACK/MADE 和 check 的 `writtenAround` MADE 仍只看 light DOM（138 要处理）。138 还要在层在树之间移动时搬编辑样式。
4. page-copy 的 observer 在 shadow root 被移走后仍在观察它（直到副本关闭）；`copyAll` 在每个页面上多一次 O(n) 的遍历找 host（只在 `copyAll` 时，副本建立和过期重建时各一次）。页面自己没有 shadow root 时不 deep，不复制、不跟编辑层的界面。
9. 页面副本里 adopted 样式表只在复制时抄一次：页面之后再改 adopted 样式表（`replaceSync`、换一组），其他宽度的核对看到的是旧的样式。
5. `webComponentChain` 对所有没有 fiber 的层都会跑（读一次全局表，很轻）。
6. 编辑样式加在 shadow root 末尾，会影响 shadow root 里的 `:last-child`/`:nth-last-child` 之类选择器。
7. 页面在 shadow root 里分了层的 `!important` 会压过编辑；shadow root 的 `:host { … !important }` 会压过 host 上的编辑（Cascade 规定）。
8. ~~GLOSSARY 还没有 shadow root 的词条~~：已加 Shadow root、编辑样式两条（review 8）。

### review 后的修改（2026-11-12）

1. **页面副本不再复制编辑层自己的 shadow root**（high）：`hostsPagesShadowRoot`（`shadow-roots.ts`）去掉 `<human-touch>` 和 `NOT_THE_PAGES`，`copyAll` 的 hosts、`copyOf` 的 deep 判断、`queryDeep` 都用它。开发时每个页面都有 `<human-touch>`，之前副本因此总是 deep、复制编辑层界面、跟着界面的每次变化重排。加单元测试：只有 `<human-touch>` 和 `vite-error-overlay` 有 shadow root 的页面，副本里没有 shadow root、不 deep。ADR 0017 §四、上面的风险 4 已改。
2. **React 第三方组件在项目自己的 shadow root 里**（medium）：`webComponentChain` 生成的那一级标 `webComponent: true`，claim 的 Shadow root 行和三条规则按这个标记选。portal 进 shadow root 的 Radix 一类组件，现在得到 **Third-party components** 和 **Shadow roots**，不再被说成自定义元素。加 cli 测试。
3. **`definedByDependency` 认各浏览器的栈**：只读带脚本地址的行，包装那一层按最上面一行的地址去掉（不按位置），认 `at async …`。加 Firefox、Safari 格式和 async 帧的测试。
4. **Variables 行**：shadow root 里的层不提 Tailwind 类（代定 7 已改）。
5. `page-copy.ts` 的注释改正：adopted 样式表只抄一次，不跟（风险 9）。
6. claim 措辞改成 "the styles of the component that renders into its shadow root"（宿主常常只是普通的 `<section>`）。
7. 加 ⌥⌘C/⌥⌘V 跨树测试（文档层 → shadow 层，再回来，各写进自己树的编辑样式，撤销照常）；`applying-bench:1527` 的 poll 挪进 `changeACard`。
8. GLOSSARY 加 Shadow root、编辑样式两条。规划会话对 vendored 和 Next.js 的答复写进了 ADR 0017 和上面的代定 3、4。

**检查（不用锁，2026-11-12 02:40–03:09）**：
- `pnpm typecheck`：packages/humantouch 和三个例子都过；website 在 `video/Root.tsx` 上失败（Remotion 和 @types/react 的类型不合），这个分支没碰那个文件，是 main 上的。
- `pnpm test`：vitest 1284 passed / 1 skipped，node --test 132/132。
- e2e（只跑相关的）：
  - page 项目：`shadow-roots`、`style-copy`、`variables`，28 passed / 2 failed。失败的是 `shadow-roots:51`（像素相似度 0.87 < 0.9）和 `variables:290`（超时），都是机器忙；单独重跑 2/2 过。
  - project files 项目（`--no-deps`）：`applying-bench`、`claim`、`round`、`bench-scenarios`，125/125 过。
- bench `--dry`：33 个场景。claim-out 和 main 15e0492 的 32 个比，只多 `shadow-root-style.md`，其余逐字不变。`--scripted` 24/24 过。
- perf（headless，只作参考）：20 passed。
- 例子里没有遗留改动。

**规划会话，2026-11-12**

线上合并到 main b8649a6，ADR 0017 一起合进去了。

代定 1–8 都确认。
- 第 3、4 条照规划会话之前的答复：第三方只认 `/node_modules/`；Next.js 的检测是 ticket 159，发布后做。
- 第 1 条：编辑样式表放在 shadow root 末尾，压过组件自己的普通规则。这和 light DOM 的编辑样式一致。

风险都接受。
- 给 138 的那几条（dropUnusedRules、writtenAround 只看 light DOM；层跨树移动；复制宿主；跨 shadow 边界）由 138 处理。

这张票的整套验证跟下一批 main 一起跑。
