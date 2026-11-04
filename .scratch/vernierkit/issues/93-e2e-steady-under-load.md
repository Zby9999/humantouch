# 93: e2e 在机器忙的时候也要稳

**What to build:** 几条线同时跑的时候，机器负载会到 30 上下，e2e 里有几条测试会挂，单独重跑又都能过。每挂一次就得重跑一整套 e2e（大约 9 分钟）。更麻烦的是，各条线自己验证时碰上了，可能以为是自己的改动坏了，白白去查。此外，e2e 里「项目文件」那一组依赖「页面」那一组：页面组只要挂一条，后面约 111 条就都不跑了。要做到：这类测试在机器忙时也稳定通过，测的内容不变。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准。

**Blocked by:** 86（场景补全也在加测试，等它合进去以后再改，免得冲突；87 已完成）

**Status:** done

- [x] 先修 2026-11-03 在 main 上验证时挂过的三条：
  - `off-canvas.spec.ts:173`（撤回删除后图层回到画布）：机器忙时 5 秒的等待不够，用了 7.5 秒；
  - `resize.spec.ts:488`（按右边、下边定位的图层在面板里改宽高）：按回车后马上读一次图层的尺寸就比，画面还没更新完，读到了旧的宽度；
  - `next-install.spec.ts`（webpack 那条）：Next.js 冷启动在机器忙时超过了等待上限。
- [x] 把 e2e 里同样写法的地方扫一遍：「做完一个操作马上读一次就断言」的，改成会重试、等画面更新完再比的断言；比的值不变，不放宽断言本身。真的需要等很久的（例如 Next.js 冷启动），放宽等待上限，并在旁边写明为什么
- [x] 不靠全局加重试次数或全局拉长超时把问题盖住
- [x] 在机器忙的时候证明它稳：同时制造负载（例如另起几个跑测试的进程），整套 e2e 连跑至少 3 轮，没有一条挂；改之前的代码在同样的负载下能看到挂（至少一轮）
- [x] 测试的数目、测的内容不变；`packages/` 不改，切换按钮的包逐字节不变

## 背景

- 2026-11-03 规划会话在 main 上验证 84、85 合并后的代码时碰到（负载 19 到 33，五条线同时在跑）。另外，87 那条线验证时碰到过 `create.spec.ts`「a double click on the selected text types in it」挂了一次，单独重跑通过；扫的时候一起看。
- 已知会抖的还有：vitest 的浏览器测试文件第一次跑时偶尔导入失败（Vite 预构建），`applying-bench.spec.ts` 的停住提示，`breakpoints.spec` 的 Fill 颜色输入框。能修的一起修，修不了的记下原因。

## 设计师决定（2026-11-03，分诊）

- 选做法 1：开 ticket 修这类测试（另两种是挂了就重跑、少开几条线并行）。
- 等 86 合进去以后再开工，免得和正在加测试的线冲突。

## Comments

**完成（2026-11-04，指挥会话）**：提交 f75a5ba、56e264c、5c620f1、c8eeb43、8a7cf02、26e5400，同步 main（91b468f，带进 94、95）之后又有 bf29f43、30d5a82（中间两次同步 main：7fc79b9、91b468f）。只改了 `e2e/`：36 个文件，`packages/`、`examples/` 没动，切换按钮的包逐字节不变。`--list` 改前改后都是 419 条、40 个文件；同步 main 以后 95 加了 2 条，最后三轮是 421 条，本线没加也没删。没有全局重试，`expect` 和测试的全局超时都没动。

*在负载下找到的原因*

1. 冷的开发服务器上第一次进编辑模式很慢：编辑层这时才编译。每轮最前面的 5–6 条测试等画布 5 秒等不到（breakpoints :46/:63/:123/:154/:173、applying-bench:138）。
2. 这个项目的 Variables 比画布晚到。到了以后 Design 面板里 VariableSlot 的输入框会重新挂上，之前的 fill、click 会丢掉回车或全选：variables:246 打成了「7122」而不是「71」，undo:236 的角标停在「2」而不是「3」，breakpoints:63/:204（Fill color）在旧代码的 trace 里也是选中落在 `/variables` 还没返回的时候（是吻合，不是证明）。
3. 操作完马上读一次就比（约 400 处，含 resize:488）。
4. 画布重新冻结时读到正要离开的 frame，「Frame was detached」（code-changes:234、applying-bench:484）。
5. Next.js 冷编译慢：next-round:69 的 About 页、next-install。
6. properties:771 拖动数字图标做 57 次单像素移动，负载下超过 30 秒。
7. 停住提示（ticket 67）：`done` 等页面的核对答完（layout effect）就返回，但停住计时听到这次 `done` 是在之后的 effect 里。机器忙时这个 effect 排到了 `clock.fastForward` 之后，计时从拨过去的新时间重新开始，提示就永远不出（同步 main 后的那轮里 applying-bench:581 挂，trace 证实：done 答完 5 毫秒后就拨了钟）。旧代码在负载下反复跑 70 次没复现，很少触发。
8. 「Discard all」时服务在 `existsSync` 和 `readFileSync` 之间把 `.03kind/` 的文件删了，读的那一下 ENOENT（applying-bench:820）。
9. bench-scenarios 收尾时逐字比开发服务器给出的模块，Vite 提升出来的两句 CJS 兼容代码顺序偶尔对调，永远对不上（规划会话在 main 上看到 flow-undo-last 挂）。

最初以为还有一条「进编辑模式时页面正在缩进画布，按键落空」，审查查明测试配置开着 `reducedMotion: "reduce"`，画布这时只淡入，不缩进，`.is-travelling` 从不出现，所以这条不成立；`canvasInPlace` 里那一步保留（不花时间），注释已改成实话。

*改了哪些测试，之前等什么、之后等什么*

- **`e2e/playwright.config.ts`**：加 `globalSetup: "./tests/warm-up.ts"`。之前：第一条进编辑模式的测试自己吃下编辑层的冷编译。之后：跑测试前在 dev、react 18、next 三台服务器上各进一次编辑模式（轮次留在内存里，不写 `.03kind/`），三台并排，共用一个 180 秒的期限，旁边写明为什么这么长；哪台没热起来就报哪台的名字和网址。Playwright 要等每台 webServer 的网址答话以后才跑 globalSetup，这 180 秒等的是浏览器第一次载页和编辑层第一次编译。
- **`e2e/tests/fixtures.ts`** 两个新帮手：
  - `canvasInPlace(page)`：之前进编辑模式等到画布里有 `h1` 就动手。之后再等 `/variables` 的请求都答完、再等两帧。请求是在页面里数的：初始化脚本包一层顶层窗口的 `fetch`，只数 `127.0.0.1:<端口>/variables`，答完（读完响应体的副本）才减一；页面刷新时接着等新文档。Shell 在第一次渲染时就发这个请求（`useState(loadVariables)`），所以画布出来时数字已经算上它。
  - `steadyBox(locator)`：之前读一次 bounding box 就拿去点或拖。之后要隔 50 毫秒读两次一样才用。
- **24 个 spec 的 `enterEditMode`**（autosave、breakpoints、brief、code-changes、create、drag、edit-mode、grid、layers、layout、move-placement、next-round、off-canvas-round、off-canvas、promote、properties、resize、round、shell、snapping、stack、undo、variables、views）：原来的等待后面加 `canvasInPlace(page)`。
- **`pick` 一类帮手**（breakpoints、autosave、promote、snapping、resize）和**数字图标的位置**（undo:81「a drag on a number's icon is undone as a whole」、undo:99、views:462、properties:771）：读一次 → `steadyBox`。
- **27 个 spec 里约 400 处 `expect(await X).m(v)` → `await expect.poll(() => X).m(v)`**，同一个 matcher、同一个值、同一句说明（用 TS 语法树批量改，再逐处看过）。按文件：properties 93、resize 51、views 32、drag 23、undo 22、edit-mode 19、layout 19、off-canvas 17、variables 15、layers 14、react18-round 12、snapping 12、code-changes 10、text-in-a-box 8、create 6、round/autosave/play/stack 各 4、grid/promote 3、shell/source-markers 2、breakpoints/move-placement/next/off-canvas-round 1。含 resize:489（原 :488，按回车后读宽高）、off-canvas:174（原 :173）、create:252（双击选中的文字打字）。有副作用的读法没改（`npx03kind`、`request.*`、`gitStatus`、`sh`、打开改动单的 `changeNames`、`noticeAfterStop` / `stopHalfway` 等），重试它们会重复动作。
- **两边都要读的比较**（grid:87、layers:527、layout:57、layout:194、views:567、snapping:109）：之前期望那一边只读一次。之后两边都在 `toPass({ timeout: 5_000 })` 里每次重读（5 秒就是 `expect.poll` 原来的默认值），比的值不变。
- **code-changes ~42/120/203/247**：画布标题字号的手写轮询和一次性读 → `toHaveCSS("font-size", 同一个值)`。
- **applying-bench**：`within()` 遇到「Frame was detached」算「还没好」；`canvasCard` 读的时候遇到同一个错误隔 100 毫秒再读，最多 5 秒，别的错误照抛。返回的值和所有断言不变。
- **bench-scenarios afterEach**：之前逐字比开发服务器给的模块。之后两边先把 Vite 提升出来的一段段 `const x = __vite__cjsImportN_…;` 在段内排好顺序再比，其他文字仍须逐字相同。这是收尾的等待（「改回去的文件服务器已经在给了」，86 的代定 11），不是测试本身的断言。
- **applying-bench 停住提示**：新帮手 `pageHeardTheLastMove(page)`，在页面里过两轮「发一条 MessageChannel 消息、再等一帧」，让 React 排好的 effect 先跑完。`noticeAfterStop`（:241、:310 用它）在拨钟之前、「sits still a long time」（:581）在 `done 2` 之后拨钟之前都先等它；后者还先等进度环到 2。之前：`done` 一返回就拨钟。
- **`e2e/tests/project-files.ts` 的 `readThirdKindFile`**：之前先 `existsSync` 再读。之后直接读，ENOENT 算「不在」返回 null，别的错误照抛。
- **properties:771**「dragging left and right on a number's icon」：`test.setTimeout(90_000)`，旁边写明是 57 次移动。
- **next-install:37**（webpack）：服务器答话的 `toPass` 60 → 150 秒，画布 `h1` 5 → 60 秒，整条 180 → `150_000 + 60_000 + 60_000` 秒，都写明了为什么。
- **next-round:70**：About 标题 5 → 30 秒（Turbopack 第一次编译 About 页）。

*负载和轮次*

- 负载：在草稿区复制一份工作区，用 `TK_E2E_PORT=5520` 循环跑 `--project=page`；另有一个调节脚本，5 分钟负载低于 19 且交换区剩余超过 800M 时开，1 分钟负载连续两次超过 38 或交换区剩余不到 300M 时停。同时在跑的还有别的线（5700 等）。每 30 秒记一次负载和交换区。
- 第一次尝试（实现时）负载太重：中位 37.6、最高 52，交换区用到约 10.5/11 GB。改前在那份负载下两轮全量分别挂 8 条、7 条（breakpoints 冷启动 5 条、next-install、code-changes:234、next-round:69；breakpoints:123、next-install、properties:398 的 toast、properties:770 超时、applying-bench:138、applying-bench:1743「fetch failed」、bench-scenarios flow-undo-last），按名字单跑几轮又挂了 breakpoints:63、:204、variables:246。改后中间两轮各挂过 undo:236、applying-bench:484 和 next-install，引出了 56e264c。
- 证明用的负载落在 ticket 说的范围附近：

| 轮 | 代码 | 1 分钟负载 中位 / 最高 | 交换区用量 平均 / 最高 | 结果 |
|---|---|---|---|---|
| A | 改前（cef746d 的 e2e） | 26.5 / 60.7 | 8455M / 10598M | 挂：page 组 2 条（breakpoints:187、:204，都是等 Design 面板的 Fill color 输入框 30 秒超时），project files 组因此没跑；用 `--no-deps` 补跑，另挂 1 条 off-canvas-round:30，是那份复制没有 `.git` 造成的，不算 |
| B1 | 26e5400 | 22.3 / 59.3 | 7433M / 9352M | 418 通过、1 跳过、0 挂、0 抖（12.1 分钟） |
| B2 | 26e5400 | 29.1 / 52.1 | 6907M / 8529M | 418 通过、1 跳过、0 挂、0 抖（12.8 分钟） |
| B3 | 26e5400 | 20.8 / 28.2 | 6663M / 8719M | 418 通过、1 跳过、0 挂、0 抖（11.0 分钟） |

  B 三轮都是在工作区里原样跑 `TK_E2E_PORT=5500 pnpm test:e2e`（每轮都 build），没有重跑。102 次采样里 18 次超过 33，多是启动时的尖峰，部分来自别的线。四台 webServer 每轮 4–9 秒就答话，离 Playwright 默认的 60 秒很远。
- 26e5400 上 `pnpm typecheck` 通过；`pnpm test`：vitest 34 个文件 898 通过、1 跳过，node 121 通过。
- **同步 main 之后（91b468f，带进 94、95）**：typecheck、`pnpm test`（vitest 913 通过、1 跳过）都过；一轮 `TK_E2E_PORT=5500 pnpm test:e2e`（负载约 16–22，没另加）419 通过、1 跳过、1 挂：applying-bench:581 停住提示（原因 7）。修了以后（bf29f43、30d5a82）用同样的负载办法重新证明：
  - 停住提示四条（:241/:310/:581/:761）反复跑：旧测试 40/40、30/30 通过（没复现）；修后 39/40、39/40，挂的两次一次是 :820 的 ENOENT（原因 8，30d5a82 修了），一次是下面「没能修稳」里的 :310 没保存。:581、:241 修后各 20 次全过。
  - 在 30d5a82 上原样跑三轮完整的，没有重跑：

| 轮 | 代码 | 1 分钟负载 中位 / 最高 | 交换区 最多已用 / 剩余最少 | 结果 |
|---|---|---|---|---|
| C1 | 30d5a82 | 25.4 / 31.6 | 9079M / 330M | 420 通过、1 跳过、0 挂、0 抖（11.9 分钟） |
| C2 | 30d5a82 | 25.7 / 43.3 | 11196M / 558M | 420 通过、1 跳过、0 挂、0 抖（14.0 分钟） |
| C3 | 30d5a82 | 25.9 / 44.2 | 11320M / 378M | 420 通过、1 跳过、0 挂、0 抖（14.0 分钟） |

  - 30d5a82 上 `pnpm typecheck` 通过；`pnpm test`：vitest 34 个文件 913 通过、1 跳过，node 测试通过。

*没能修稳的，和原因*

- **vitest 浏览器测试第一次跑时导入失败**：缓存是冷的时候，6 个浏览器测试文件报「optimized dependencies changed. reloading」（preact、preact/hooks、preact/jsx-dev-runtime、preact/test-utils）。要在 `packages/03kind/vitest.config.ts` 里加 `optimizeDeps.include` 这四个，属于 `packages/` 改动，本 ticket 不许，所以没改。只在缓存冷时出现。
- **`page-claim-service.test.ts`**（vitest，`last` 的 `git apply` 拿到空补丁，规划会话在别的线上看到一次）：在 `packages/03kind/test/`，同上没改，也没复现。
- **properties:399 的 toast**：改前挂过一次，改后没再挂。测试用 `clock.install()`，步骤之间真实时间在走；试过 `clock.pauseAt`，toast 要帧，6/6 都挂，已退回。保持按时间的写法。
- **applying-bench:1743「fetch failed」**：只见过一次，开发服务器一时没答话，没改。
- **停住提示**：修了（见上），但旧代码在负载下 70 次没复现，只有同步 main 后那一轮的 trace 作证。
- **applying-bench:310 第二轮「改了没存」**：修好停住提示以后反复跑时，负载冲到 44 那段 40 次里挂过 1 次：页面重新载入后三处改动都做了（显示「3 changes not applied yet」），但一直没发 `PUT /round`，`designTheRound` 等 changeset.json 5 秒没等到。保存走 500 毫秒的假 `setTimeout`，还有一道 `lastStatus === "claimed"` 的门；原因没查清，没改。trace 在指挥会话的草稿区（trace-keepwait）。之后三轮完整的都没再出现。
- **改前没复现、但写法相同所以照改的**：off-canvas:174、resize:489、create:252、undo:81、layout:184（Play 时的新尺寸）、undo:136。

*代定的事（待设计师确认）*

1. **预热放在 `globalSetup`**：一处长等待，不是重试，也不是全局超时（贴近分诊时选的做法 1）。代价：三台服务器有一台热不起来，整轮一条测试都不跑，最坏等 180 秒才报。
2. **每个 `enterEditMode` 都加 `canvasInPlace`**：Variables 到齐算进「进入编辑模式」，就是「等画面更新完再比」。
3. **有副作用的读法保持原样**（命令行、请求、打开改动单）：重试会重复动作。
4. **applying-bench 只动 `within` 一行和 `canvasCard` 一处**：95 同时在改这个文件，改得越少越不冲突。
5. **单条放宽的等待，旁边都写了原因**：next-install 150 / 60 / 270 秒，next-round 30 秒，properties 拖动 90 秒，预热 180 秒。
6. **toast 那条保持按时间**：暂停时钟会让它必挂，不算放宽。
7. **bench-scenarios 收尾的比较不管 Vite 兼容代码的先后**：只在提升出来的那几句之间排序，别的逐字比。
8. **vitest 冷缓存导入失败不修**：要改 `packages/`。若要修，是 `packages/03kind/vitest.config.ts` 加四个 `optimizeDeps.include`，可另开 ticket。
9. **证明时的负载**：一份循环跑 page 组的进程，加调节脚本把负载压在 19–33 附近；第一次实现时那份更重的负载（中位 38、交换区快满）不拿来做证明，只拿来找原因。
10. **停住提示等页面「把上一步听完」**：用页面里两轮消息加一帧，而不是固定睡一段时间；只在拨钟之前等，值不变。
11. **同步 main 后挂了一条，就修了再重新证明三轮**：最后的证明在 30d5a82 上，不拿 26e5400 那三轮充数。

*遗留风险*

1. **可能是产品本身的毛病**：Variables 晚到时，Design 面板里正在填的输入框会被重画，填的字或按的回车会丢。本地服务慢时设计师也会碰上。测试现在绕开了它（本 ticket 不改 `packages/`），值得开 ticket 分诊。
2. **next-install 在更重的负载或内存吃紧时仍可能挂**：第一次实现时负载中位 38、交换区快满，`Compiling /page` 150 秒都没编完；单独跑在同样负载下 4/4 通过。证明的三轮里没挂。
3. **drag、resize 里还有约 179 处 `boundingBox()` 只读一次**：只有 `pick` 一类和数字图标用了 `steadyBox`。
4. **`views.spec.ts:406` 期望那一边只读一次**（`offsetWidth`），老代码，没改。
5. **不经过 `canvasInPlace` 进编辑模式的测试**（react18-round、applying-bench、next.spec、claim）不等 Variables。react18-round 有一条故意扣着 `/variables`，用了这个帮手就会一直等，所以不能给它加。
6. **数 `/variables` 的包装只看顶层窗口的 `fetch`**：产品今天就是这么发的（`round-watch.ts` 的 `serviceRequest`）；换成别的发法，等待会直接放行，退回到改前的样子。
7. **e2e 配置里 webServer 默认只等 60 秒**：这次每台 4–9 秒就答话，但机器再忙时，Next 冷启动超过 60 秒会让整轮在第一条测试前就停。没改，挂了再单独放宽。
8. **「On the canvas at once」一类说法现在等于 5 秒内**：这是改成会重试的断言本身带来的，本 ticket 的做法就是这样。
9. **applying-bench:310 第二轮偶尔不保存**（见「没能修稳」）：40 次 1 次，原因没查清；再出现值得开 ticket。
10. **`pageHeardTheLastMove` 假定 React 的 effect 在两轮消息加一帧之内跑完**：今天成立；React 改调度方式时可能要再看。
