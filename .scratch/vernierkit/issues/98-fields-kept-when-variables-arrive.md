# 98: 变量晚到时，面板里正在输的字不丢

**What to build:** 进入编辑模式时，项目的 Variables 比画布晚到（本地服务慢、项目大、第一次编译时可能一两秒）。Design 面板里能套用变量的输入框（圆角、间距、颜色等）在变量还没到时只画输入框本身，变量到了以后外面多包一层放「套用变量」的按钮，这一包输入框就被整个换掉：正在输的字、光标、全选、刚按的回车都丢。ticket 93 在机器忙时测到过：输 71 变成 7122，撤销的角标停在 2 不是 3，Fill 颜色输入框等不到。不报虚假的 ✓，但设计师在这一两秒里输的东西会丢，或者落到不该落的地方。要做到：变量什么时候到都不影响正在输的输入框，焦点、已输的字、选中和回车都留着；变量到了以后，套用变量的按钮照常出现。

另外顺手修 ticket 93 代定第 8 条留下的：vitest 的浏览器测试在缓存冷的时候第一次跑，6 个文件报「optimized dependencies changed. reloading」导入失败（preact、preact/hooks、preact/jsx-dev-runtime、preact/test-utils）。93 不许改 `packages/`，所以没修；修法是在 03kind 包的 vitest 配置里把这四个预先列进 `optimizeDeps.include`。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准（「设计变量」），并遵守 docs/adr/ 中的决策。

**Blocked by:** 无（不挡 88；开线时间见「设计师决定」）

**Status:** done

- [x] 先复现，用浏览器单元测试或 e2e（扣住 `/variables` 的回应，在输入框里输字、全选、按回车，再放行）：在没改的代码上看着失败——焦点丢了、字丢了或输进去的不对
- [x] 变量到之前、到的那一刻、到了之后，能套用变量的每种输入框（Design 面板和 Grid 那一节里的都算）输的字、焦点、选中、回车都留着；套用变量的按钮在变量到了以后出现，没有变量的分组照旧不出现
- [x] 变量到了以后，面板别处的输入框也不因此被换掉（看一遍还有没有同样「到了才多包一层」的写法）
- [x] 03kind 包的 vitest 配置里预先列进那四个依赖；清掉 Vite 的预构建缓存后第一次跑 `pnpm test`，没有「optimized dependencies changed」导入失败
- [x] 加一条 e2e：照 `react18-round.spec.ts` 里扣住 `/variables` 的那条的办法让变量晚到，写法照 ticket 93（`steadyBox`、`expect.poll`），机器忙时也稳
- [x] 没有别的行为变化：`claim`、`done`、`finish` 的输出逐字不变；切换按钮的包逐字节不变；性能 headless 前后对比（`TK_PERF_HEADLESS=1`）

## 背景

- ticket 93 遗留风险第 1 条和代定第 8 条（2026-11-04 合并后提给设计师）。
- 规划会话看过代码：能套用变量的那一格在变量列表还空的时候直接返回输入框，有了变量才包进一层带按钮的容器，输入框在树里的位置变了，于是被换掉（是读代码的推断，复现时确认）。

## 设计师决定（2026-11-05，分诊）

- 选做法 1：开一张小 ticket，先复现再修输入框，顺手把 vitest 配置的四个依赖加上。
- 不挡 88；和 97 一样，等 88 的真实跑完、机器空下来再开线。
- 考虑过的别的做法：只修输入框、vitest 配置不修；先不开，记作风险。
- 不跑真实 Agent。

## Comments

**完成（2026-11-05，指挥会话）**：提交 b0360f5（vitest 配置）、597e56a（修法 + 新 e2e）、61d7a18、6f4267c（两轮审查的小改动），中间同步 main（5363ebf）。改了 `VariablePicker.tsx`、`Properties.tsx`、`styles.ts`、`vitest.config.ts`，新加 `e2e/tests/variables-late.spec.ts`，`e2e/tests/fixtures.ts` 只改了 `canvasInPlace` 那段注释。按规划会话转达，所有子 agent（含审查）都用 effort medium。

*原因（复现时确认，规划会话的推断对）*

- `VariableSlot` 在这一组没有设计变量时直接返回 `<>{children}</>`；变量到了以后包进 `div.tk-variable-slot`，外面再套 `TypingProvider`。输入框在树里换了位置，Preact 把它卸掉重挂。
- 另找到第二处：`Properties.tsx` 的 `ColorField`。hex 输入框只在有颜色变量时才套 `TypingProvider`，Fill color 一类颜色字段同样被换掉。
- 修法：`VariableSlot` 不管有没有变量都渲染同一个 `div.tk-variable-slot`，children 一直在 `TypingProvider` 里（没有可提供的就传 null，`useTypeahead` 拿到 null 和以前没有 provider 一样）；按钮和弹层只在有变量时出现。没有按钮时加 `is-alone`，样式 `display: contents`，布局和以前只有输入框时一样。ColorField 的 hex 也一直套 `TypingProvider`。

*查过的「到了才多包一层」的写法*

- `VariableSlot`（一处定义）：Width/Height、Min/Max、Gap、Padding ×4、Corner radius 和四个角、Font size、Effects 的 Shadow；GridSection 的 Row gap、Column gap。已修。
- `ColorField` 的 hex：已修。色块没修，见代定 2。
- Shell 的 `CatalogProvider` 一直挂着，只换 value；`variable()`、`shadowColor()` 只改 props；面板里别的条件渲染都不靠异步数据（grep 过 `useCatalog`、`catalog ?`、`catalog &&`、`.then(`、`useState(load`、`Provider value`）。

*复现，改前 / 改后*

新 e2e 扣住 `/variables`，两条测试各跑 6 种字段：
- 测试一：输到只差最后一个字，放行 `/variables`，马上输最后一个字，⌘A 全选，等变量按钮出现，看字段，再按 Enter。
- 测试二：放行前输完并按 Enter，放行后再输第二个值并按 Enter。

改前（没改的代码）12/12 挂：

| 字段 | 输的 | 字段显示 | 焦点 | 选区 |
|---|---|---|---|---|
| Corner radius | 71 | 14（原值） | 丢了 | [2,2] |
| Padding top | 71 | 22（原值） | 丢了 | [2,2] |
| Width | 171 | 171.5（原值） | 丢了 | [5,5] |
| Font size | 31 | 19（原值） | 丢了 | [2,2] |
| Row gap（Grid） | 71 | 22（原值） | 丢了 | [2,2] |
| Fill color | 123456 | 123456（被换掉时那次失焦把值套用了） | 丢了 | [6,6] |

测试二的 6 种：第一个值都已套用，但焦点丢了、光标在末尾，第二个值没地方输（就是 93 看到的「7122」一类）。

改后 12/12 通过：焦点在、显示输进去的字、选区 [0,n]，Enter 套用到画布（computed style 对得上）。变量按钮在变量到了以后出现；没有变量的分组不出按钮，靠现有的 variables.spec 两条（:143 Line height、:300）。临时 spec 导出 Design 面板每个元素的 rect（Card、Grid、Freeze、独立四角，变量到前、到后各一份），改前改后逐字一样（临时 spec 没提交）。稳定性：新 spec `--repeat-each=20` 240/240，1 分钟负载中位 21、最高 30；和 variables.spec 一起 `--repeat-each=3` 60/60。

*vitest 冷缓存*

- 缓存在 `packages/03kind/node_modules/.vite/vitest/ef98362b8a6b0c8cd804b0d227aa1ffeaba89786/deps`（browser 项目的那份），只清这一个目录。
- 改前：`dependencies optimized: preact, preact/hooks, preact/jsx-dev-runtime, preact/test-utils` → `optimized dependencies changed. reloading` → `Vite unexpectedly reloaded a test`；`Test Files 6 failed | 23 passed (34)`，和 93 说的一致。（整个 `.vite` 都不在时另一次：1 个文件 4 条挂 `reading '__H'`，stacks 的 iframe 60 秒没就绪。）
- 改后（browser 项目加 `optimizeDeps.include` 这四个），两次都先清 deps：没有任何 `[vite]` 行，`Test Files 34 passed`，939 通过、1 跳过。

*性能（headless，只比前后）*

- 进编辑模式 median 135.4 → 134.3ms；Corner radius 的 work p95 11.9 → 10.0ms；Stack gap 11.3 → 10.8ms；⌘Z / ⇧⌘Z p95：Corner radius 23.3 / 13.1 → 12.0 / 11.4ms，Stack gap 30.1 / 37.9 → 25.5 / 17.4ms；拖动、缩放 60fps。
- 实现时改后那轮有两项变差：「same canvas again」120 → 174.6ms、「a change at a breakpoint」longest step 12.5 → 24.6ms（负载约 18）；单独重跑 116.4 / 118.6ms、12.9ms，回到改前，判断是噪声。
- 同步 main 后合并前那轮（负载 15–27）15 条全过：same canvas again 134.0 / 147.0ms（saved / carried over），breakpoint 的 longest step median 16.2ms。

*包*

- 切换按钮的包逐字节不变：`react.dev.js` 1423 B（sha256 c83849f1…0636），`chunk-UQJRS7YD.js` 21575 B（cdd6f09d…9954）；toggle-first 9993 B gzipped，上限 10240。
- `editor.dev.js` 332022 → 332103 B（+81 B）。cli、next、vite、react.js 的源码没动，`claim`、`done`、`finish` 的输出不变。

*合并前（同步 main 5363ebf 后，6f4267c 之上）*

- `pnpm typecheck` 通过。
- `pnpm test`：vitest 34 个文件 939 通过、1 跳过；node 123 通过、0 挂。
- `TK_E2E_PORT=5500 pnpm test:e2e`：434 通过、1 跳过、0 挂、0 抖（10.2 分钟），没有重跑。
- `TK_BENCH_PORT=5540 pnpm bench:agents --dry` 和 `--scripted` 都全过（✓ 24 行 / 15 行，没有 ✗）。
- `TK_PERF_HEADLESS=1 TK_PERF_PORT=5510 pnpm test:perf` 15 条全过。

*审查（effort medium）*

没有必须修的。改了三条可选的：ColorField 的系统取色器在变量到了被换成色块按钮时，`picking` 复位（不然之后第一次取色会并进上一步撤销）；`canvasInPlace` 那段注释不再说字段会重画；新 spec 里「变量随最后一个键到」改成实话。没改的：`holdVariables` 没在失败时 `unroute`（和 react18-round 现有写法一样，context 关闭就没了）；`holdVariables` 和 react18-round 那段重复，没挪进 fixtures。

*代定的事（待设计师确认）*

1. **没有按钮时外框用 `display: contents`**：布局逐个 rect 比过一样；代价是 DOM 里多一层不生成盒子的 div（Effects 标题栏里也有一个空的）。
2. **ColorField 的色块不保**：没有颜色变量时是系统取色器 `<input type="color">`，有了以后是开 Custom/Variables 面板的按钮。要保住就得改行为，没动；变量到的那一刻若正开着系统取色器，它会被换掉（`picking` 已复位，撤销不会串）。hex 和不透明度两个输入框保住了。
3. **已经绑了设计变量的字段，变量到了照旧从输入框换成显示名字的芯片**（Effects 整组阴影也是）：「绑了就显示名字」是本意。只在重新载入恢复的回合里、之前亲手挑过变量的字段上发生（`bound` 只认 `picked`），这一两秒里在这种字段上输的字仍会丢。
4. **新 e2e 用 locator 点，不按坐标点，所以没用 `steadyBox`**；扣住 `/variables` 的测试按要求不调 `canvasInPlace`。
5. **「到的那一刻」不保证正好卡住**：放行后立刻输最后一个字；能每次确定的是「之前」和「之后」两种。
6. **审查的小改动由指挥会话自己改**（三处，一行代码、两段注释），没再开子 agent。

*遗留风险*

1. `optimizeDeps.include` 是手写清单：浏览器测试以后引入别的 Preact 入口（如 `preact/compat`）得手动补。
2. 代定 3 的情形：恢复的回合里绑过变量的字段，变量晚到时输的字仍会丢。真碰上了可以改成「正在输时先不换成芯片，失焦后再换」。
3. ticket 93 遗留风险 5 仍在：新测试也不经过 `canvasInPlace`，是故意的。
4. 新 e2e 的到达时刻随机（代定 5），只要断言都在按钮出现之后，就不会因此抖。

## 设计师确认（2026-11-05）

- 代定 1–6 全部确认。代定 2（色块不保）、3（恢复的回合里绑过变量的字段仍换成芯片）是很窄的边角，真碰上了再修（遗留风险第 2 条的做法）。
- 合并后 main（a619e5a）验证：typecheck 通过；单测 939 通过、1 跳过，node 123 通过；e2e page 一组 300 通过、1 挂（`off-canvas.spec.ts:174`，撤回删除后等画布上的 h1 5 秒没等到，1 分钟负载 20、四条线同时在跑），单独跑 3/3 通过；project files 一组 `--no-deps` 133 通过、1 跳过。
