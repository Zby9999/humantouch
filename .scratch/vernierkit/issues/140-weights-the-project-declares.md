# 140: 字重菜单列出项目声明了的字重，不只是已经加载的

**What to build:** 设计师改官网时发现（2026-11-11，官网线报来）：Text 段的字重菜单只列出画布上已经加载的字体文件。

- 例子：官网用 next/font 加载 Rajdhani 300–700，页面文字只用到 600。浏览器只加载用到的字重，所以菜单里只有 Semi Bold。
- 设计师想试 Light 或 Bold，得先去改代码，让页面用上这个字重。
- 官网那边先绕开了（493045bf）：在 html、body 的隐藏伪元素里把每个字重都用一次。

原因：`fontsOf`（ticket 13）只认 `document.fonts` 里状态为 loaded 的 face。ticket 13 当时定的是「字体、字重只能选已加载的」。但项目用 `@font-face` 声明了的字重，页面一用上浏览器就会去加载，所以选它是安全的。

要做到：

- 字重菜单列出项目用 `@font-face` 声明了的所有字重：状态 loaded 或 unloaded 的都算，加载失败（error）的不算。可变字体的范围照旧按 100 展开。
- 选了一个还没加载的字重，画布和各视图里马上用它显示。加载完成前可以短暂显示后备字体，不卡住面板。
- 字体菜单同理：声明了、但页面文字还没用到的 web font 也列出来。
- 换字体时「换到最近的字重」改成按声明了的字重算。
- 系统字体不变：只列页面文字用到的字重。
- 改动说明、`claim`、`done` 的写法不变。

用词以 GLOSSARY.md 为准。

**Blocked by:** None。发布前做（设计师 2026-11-11 定）。做完告诉官网线，拿掉 493045bf 的绕法。

**Status:** done

- [x] e2e：示例里加一个声明了几个字重、页面只用到一个的 web font。字重菜单列出全部声明的字重；选一个没用到的，画布上的文字换成这个字重（按字形宽度或 `document.fonts` 里的状态判断），⌘Z 撤回。
- [x] 单元测试：`fontsOf` 列出 unloaded 的 face，不列 error 的；同一字重分成几个 unicode-range 子集的只列一次。
- [x] ticket 13 已有的字体、字重测试全过；`--dry` 29/29，`claim-out` 和改前逐字相同；`--scripted` 全过；整套 e2e 过。

## Comments

### 2026-11-11 实现（分支 worktree-agent-ac79ac8c5cb0b9cd3，基于 main 85c19a22）

改了什么：

- `fontsOf`（`typography.ts`）：web font 的 face 只要状态不是 error 就算，loaded 和 unloaded 都列，字重照旧经 `weightsOf` 展开（可变字体按 100）。同一字重按 `unicode-range` 分成几个 face，在 `add` 的 Set 里合成一个。系统字体那段没动：仍只列页面文字用到的字重。`isWebFont`、`firstThere` 本来就用 `status !== "error"`，现在三处一致。
- `Properties.tsx` 的 Text 段：变量 `loaded` 改名 `offered`（web font 是声明了的字重，系统字体是用到的字重），注释跟着改；逻辑没变：菜单里列 `fontsOf` 给的字重，加上文字当前的字重（不在里面时灰掉）。
- 选一个没加载的字重：只写 `font-weight`，浏览器看到文字要用它就去加载（画布和各视图的 iframe 里都有项目的 `@font-face`，`look.ts` 本来就复制），加载完成前短暂显示后备字体，面板不等。
- 换字体时「换到最近的字重」：代码里本来就不换字重（设计师 2026-11-08 定），是浏览器按 CSS 字体匹配在声明了的 face 里挑最近的，loaded 与否不影响。所以这条不用改代码，只改了注释。
- 字体菜单：声明了、但页面文字没用到的 web font 现在也列出来（单元测试 `Unused`）。
- 示例：`examples/vite-react19-tw4/fonts.html` + `src/fonts/`：Space Grotesk 用 Fontsource 声明 300、500、700（每个字重三个 unicode-range 子集），标题只用 500。另开一页，主页面和 ticket 13 的测试不受影响；页面不写 `body` 规则（写了的话 `claim` 给新文字列 body 规则时会多列一条，`put-back-and-new-text` 的 claim-out 就变了）。
- 示例的拷贝（`install.spec.ts`、`e2e/bench/project.ts` 的 `HAND_WIRED`）：像 big 页一样把 `FontsPage.tsx` 里的 `<HumanTouch />` 也拿掉，否则 `init` 以为已经挂上，不改 App，install.spec 第一条失败。
- `spec.md` 第 61 条用户故事：「项目已加载的」改为「项目已加载或用 `@font-face` 声明了的，ticket 140」。

测试：

- 单元（`edits.browser.test.ts`）：原 ticket 13 的「fonts offered」测试，期望里加上 `Unused`（以前因为没加载不列，现在按本 ticket 要列），标题改成 declares；新测试：Display 600 的 Latin 子集 loaded、扩展子集 unloaded，300 两个子集 unloaded，800 和 Broken 加载失败（error），`fontsOf` 只给 `Display [300, 600]`。改前新测试失败。
- e2e（`e2e/tests/declared-fonts.spec.ts`）：打开 fonts.html，选标题：字体 Space Grotesk、字重 500；三个视图里 300 的 Latin face 都是 unloaded；字重菜单 Light / Medium / Bold，都能选；选 Light，面板马上是 300，三个视图的标题都是 300、300 的 face 变成 loaded，字重标为已改；⌘Z 回到 500。改前失败（菜单只有 Medium）。

数字：

- `pnpm typecheck` 过；`pnpm test`：vitest 1213 过、1 跳过（48 个文件），node 129 过。
- 整套 e2e（`HT_E2E_PORT=6700`）：第一次 install.spec 第一条失败（上面那个拷贝问题，已修，单独重跑 install.spec 11/11）。修后再跑：page 组 458 条，456 过，`motion.spec:77`、`popover-exit.spec:297` 失败，单独 `--workers=1 --repeat-each=3` 6/6 过，算负载；project files 组单独 `--no-deps` 151 过。新 e2e 单独 `--repeat-each=3` 3/3，每次约 1 秒。
- `--dry` 29/29，`--claim-out` 和 85c19a22（`git archive` 导出的目录）`diff -r` 逐字相同。第一次和 project files 组同时跑，拷到了被 e2e 临时改过的 App.tsx，不算，示例静下来后重跑才相同。
- `--scripted` 20/20。
- perf（`HT_PERF_HEADLESS=1`）：19 过，`flex.perf.ts:904`（圆角 ⌘Z，旁边视图 18/20 帧跟上）失败，单独 `--repeat-each=3` 3/3 过，算负载。

合进 main 46258d9e（142、145）后重跑（`declared-fonts.spec` 选字重前三个视图的状态改成 `expect.poll`）：

- `pnpm typecheck` 过；`pnpm test`：vitest 1221 过、1 跳过（50 个文件），node 129 过。
- 整套 e2e：page 组 458 条，456 过，`undo.spec:248`、`variables.spec:290` 失败，连同 `declared-fonts` 单独 `--workers=1 --repeat-each=3` 9/9 过，算负载；project files 组 152 过、1 跳过，`code-changes.spec:77` 失败，单独重跑 3/3 过，算负载。
- `--dry` 31/31（main 现在 31 个场景），`--claim-out` 和 46258d9e 导出目录的输出 `diff -r` 逐字相同；`--scripted` 22/22；perf（headless）20/20。dry、scripted、perf 在共用锁下跑。

代定：

1. 声明了但从没加载过的字重，就算它的地址是坏的，也照样列出（状态是 unloaded，只有加载失败过一次才变成 error）；选了它只会一直显示后备字体。照 ticket 字面做，没有先试着加载。
2. 原 ticket 13 的单元测试里，没被文字用到的 `Unused` 现在列出来：改了这条测试的期望。
3. 示例另开一页 `fonts.html`，不改主页面（主页面的字体菜单、字重菜单有 ticket 13 的测试逐项断言）。
4. 「换到最近的字重」不加代码，交给浏览器的字体匹配，它本来就在声明了的 face 里挑。
5. fonts.html 只在 dev 服务里有，`vite build` 不打包它（production-build 测试用不到）。

风险：

1. next/font 会生成 `__X_Fallback_hash` 的 `@font-face`（`src: local("Arial")` 加 metric override）。现在它总会列在字体菜单里（Regular）；改前 swap 期间它常常也是 loaded，所以以前就可能出现。官网线（Next 16）最可能看到。要不要按「一个 family 的 face 全是 `local()`」跳过，规划者在问设计师，需要的话另开 ticket；不挡 140。
2. `fontsOf` 在面板渲染时算；face 的状态之后变了（比如选了的字重加载失败），菜单要等下一次渲染才更新。
3. 用 `document.fonts.add(new FontFace(...))` 加的 face（不是样式表里的 `@font-face`）以前就不会复制到 Tablet / Phone 视图；现在没加载的也列出来，选了以后只在画布上显示，旁边的视图不显示。示例和测试都只用 CSS 声明。
4. 单元测试靠这台机器有 Arial（原 FONT_PAGE 也是）。
5. 做完要告诉官网线拿掉 493045bf 的绕法（ticket 里写了，这条线没碰官网）。
6. `font-display: optional` 的 face：选了一个没加载的字重，过了约 100ms 的阻塞期还没加载完，Chrome 这次页面加载里就一直用后备字体，不再换回来，和 ticket 说的「短暂显示后备字体」不一样。next/font 和 Fontsource 默认是 swap，影响小。
7. 只给部分 unicode-range 子集声明的字重（比如 300 只有 vietnamese 子集）也会列出；拉丁文字用它时，落到字体栈里的下一个字体。

