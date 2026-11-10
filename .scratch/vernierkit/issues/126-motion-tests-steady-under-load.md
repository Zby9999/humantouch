# 126: 动画的 e2e 测试在机器忙时也要稳

**What to build:** 有几个测试检查设计师 11-08 定下的动画（收起层级时行的折叠、效果的折叠、弹出层的退场）。机器一忙它们就偶发失败，单独重跑又都能过。最近几乎每次跑整套 e2e 都要为它们重跑一次：

- `layers.spec.ts:316`：一个层级收起时，它的行往上收、淡出，后面的行升上来。106、110、120、122、123、125 合并后，以及规划会话的几次验证里都失败过。
- `properties.spec.ts:1193`：效果收起时，细节的副本往上走 8px 并淡出。119、120、123 都失败过。
- `popover-exit.spec.ts:34` 和 `:99`：弹出层的退场。109、119、122 都失败过。

这类失败会盖住真正的回归，验证时也总要人去判断「是不是又是那几个」。

要做到：
- 先弄清每个测试在机器忙时为什么失败，写进 Comments。比如：它在某个时间窗里采动画中间的一帧，机器忙时那一帧被跳过了；或者等待的时限太紧。
- 修测试，让它们在机器忙时也稳，但检查的东西不能变弱：动画的方向、距离、淡出，减少动态效果时立刻完成，这些都照样要检查。
- 不改产品（`packages/`）。如果发现是产品的动画在机器忙时真的不对，写进 Comments 并告诉规划会话。

参考 ticket 102（`round.spec` 在机器忙时变稳，同类做法）、ticket 93 的 e2e 约定（`canvasInPlace`、`steadyBox`、`expect.poll`）。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Comments 里写明这四个测试各自在机器忙时失败的原因。
- [x] 在人为压高 CPU 时，这四个测试各 `--repeat-each=20` 都不失败。压 CPU 的方式写进 Comments，比如并行开几个 `yes > /dev/null`，跑完要关掉。
- [x] 检查的内容不变弱。Comments 里逐条对照修改前后各检查了什么。
- [x] 整套 e2e 一次跑过。（指挥合并前在同步了 main fb226c6 的分支上跑：页面组 436 过，挂 2 条不在这张票里的（`panel-headers.spec.ts:105` 表头滚动、`popover-exit.spec.ts:298` 工具栏提示的宽限），单独各重跑 5 次全过；"project files" 组 `--no-deps` 151 过 1 跳过；这张票的五条一次都没挂；`--dry` 29/29 和 main 逐字相同；`--scripted` 20/20）
- [x] `packages/` 不动。

## 规划会话决定（设计师不在，2026-11-10，回来后确认）

- 只改测试，不改产品，不影响要发布的内容，所以现在就做，不用等发布。
- 交给 109 那条线：它发布前的票都做完了，现在闲着。照常 conduct：派一个新的实现子 agent、一个审查子 agent，都用 effort medium。端口用这条线的 5500 段。
- 压 CPU 只在这条线的 worktree 里做，跑完马上停。同一时间别的线可能也在跑测试。

**设计师确认（2026-11-10）：** 规划会话的代定都照通过。

**范围扩大（2026-11-10，规划会话）：** 审查发现 `popover-exit.spec.ts` 里「a menu opened again while it leaves」（main 上在 :69）也是同一类偶发失败，而且更严重：第三次点击本该落在 150ms 的退出动画里，机器忙时退出可能先播完，测试照样通过，其实没测到「退出途中再打开」。这一条并进本票，用 `watchLeaving` 修，并确认第三次点击确实落在退出途中，没落在里面就算失败或者重来。它也要在压 CPU 时 `--repeat-each=20`。

## Comments

### 实现记录（2026-11-10；起点 main 1676dc08，分支 worktree-agent-a2b73358e9acf7ddd）

**各自为什么失败**（先在原来的测试上压 CPU 复现：6 个 `yes`，`--repeat-each=10`，40 次挂了约 9 次）
- `layers.spec.ts`「a level closed folds up …」：读的是动画中间的状态。折叠的副本（`.tk-tree-fold`）只活 `LAYERS_FOLD_MS`（200ms），动画一结束（`clip.onfinish`）就移除；后面那行的上升动画没有 `fill`，结束就从 `getAnimations()` 里消失。点击之后测试还要先做四五次断言，每次一个来回，机器忙时 200ms 早过了。失败时读到的：`fold.locator(".tk-tree-row")` 是 0 个、`fold` 找不到（`toHaveAttribute` 超时）。
- `properties.spec.ts`「an effect folded goes …」：同一个原因，效果的副本（`.tk-effect-fold`）也是 200ms。失败时读到的：`getAnimations` 是 `[]`，或 `copies` 找不到。
- `popover-exit.spec.ts:34`（现在 60 行）「a menu closed with the pointer …」：两处。
  1. 点了选项以后才读菜单的离开状态，可菜单只留 `POPOVER_EXIT_MS`（150ms，`setTimeout`），机器忙时读的那一下已经在它移除以后。失败时读到的：`leavingState(menus)` 是 `[]`，`state` 是 `undefined`。
  2. 改了第 1 处以后又复现出另一个（50 次里 1–2 次）：后面用键盘那段，ArrowDown 打开、ArrowUp 两下、Enter，应该是 All，得到 Project。在页面里记了每个按键前后的状态：第一下 ArrowUp 把选中的从 Tailwind 移到 Project，4ms 后又回到 Tailwind。原因是鼠标还停在 select 上（前面 `filter.click()` 留下的），菜单正好打开在它下面，当前选项盖在鼠标下；浏览器在下一帧给那个选项发 `pointerenter`，`onPointerEnter` 把 active 设回 Tailwind。机器空闲时这一下在 ArrowUp 之前到，没影响；机器忙时晚到，就吃掉了一下 ArrowUp。这是产品照设计在做（指针进入的选项变成当前项），不是动画的问题。
- `popover-exit.spec.ts:99`（现在 127 行）「the color picker leaves …」：和 34 的第 1 处一样，取色器关掉以后才读，150ms 已过。

没有发现产品的动画在机器忙时真的不对。没用到 `waitForTimeout` 的测试；`:69` 的 `waitForTimeout(POPOVER_EXIT_MS + 100)` 不在这次的四个里，没动。

**改了什么**（只动 `e2e/tests/`，`packages/` 没动）
- `fixtures.ts` 新增两个：
  - `holdMotion(page)`：用 DevTools 协议把页面动画的播放速度设成 0（`Animation.setPlaybackRate`，`motion.spec.ts` 早就这么用），之后开始的动画也停在起点；返回的函数把速度设回 1。计时器照走。
  - `midway(locator, ms)`：把元素（含子元素）的动画都定到第 `ms` 毫秒，读算出来的位移（`DOMMatrix` 的 `m42`）和不透明度。
- 两个折叠测试：点之前 `holdMotion`，原来的检查一条不少，照原样读（这时副本和动画都还在）；再加中点采样；然后放开，等副本没了。
- 两个弹出层测试：新的 `watchLeaving(page, selector)`，点之前在编辑层的 shadow root 上挂 `MutationObserver`，有一个开始 `.is-leaving` 的那一刻，在页面里当场读下所有匹配元素的 `leaving / aria-hidden / inert / pointer-events`（和 `leavingState` 读的一样）；回调是微任务，150ms 的计时器不可能先跑。测试用 `expect.poll` 等这份记录。
- `:34` 键盘那段之前 `page.mouse.move(0, 0)`，把指针挪开。

**为什么检查没有变弱**（逐条对照）
- 折叠（两个测试一样）：
  - 改前：点击后立刻收起（`aria-expanded`、行没了）→ 现在同样。
  - 改前：副本 `aria-hidden`、有副本行、没有 treeitem（效果那边：没有输入框、副本里的值是 0）→ 现在同样。
  - 改前：关键帧包含 `none → translateY(-8px)` 和 `inset(0) → inset(0 0 100%)` → 现在同样。
  - 改前：后面那一行 / 那个效果有一个动画 → 现在同样。
  - 新增：动画的中点，副本向上移了（0 > y > -8px），淡了一部分（0 < 不透明度 < 1），后面那行 / 效果还在原位下方（y > 0，往上升）。改前只看关键帧写了什么，现在还看它真的按这个方向、在这个范围里动。
  - 改前：然后副本没了 → 现在放开以后同样要没了（证明动画放完会移除）。
  - 减少动态效果时立刻收起（layers 那条）→ 一字没改。
- 弹出层：
  - `:34` 改前：离开那一刻 `{ leaving: true, aria-hidden: "true", inert: true, pointer-events: "none" }`，只取第一个 → 现在要求整份就是这一个（多了「只有一个菜单」）。
  - `:99` 改前：只看有一个、在离开 → 现在和 `:34` 一样看全四项（更严）。
  - 读的时刻：改前是「点击返回后第一次读」，现在是「变成离开的那一刻」，比改前更早，正是「at once」要说的。
  - 之后的 `toBeHidden`、值、`toHaveCount(0, { timeout: POPOVER_EXIT_MS + 1000 })`（离开后会走）、Esc 和 Enter 立刻没了 → 一字没改。
  - 键盘那段挪开指针：按键、顺序、期望的值都没改，只是不让指针替用户选。

**次数和负载**（机器 12 核；同时别的线也在跑，所以「不压」时的负载也有 20 左右。负载是 `sysctl vm.loadavg` 的 1 分钟值，每 5 秒采一次）
- 压 CPU 的方式：跑之前起 6 个 `yes > /dev/null`，跑完按自己起的 PID 杀掉，每次跑完都确认 `pgrep -x yes` 是 0。脚本只在这次的 worktree 里用，没留在仓库。
- 修之前（原测试，压着）：四个各 10 次，挂了约 9 次（上面的读数就是这次的）；负载 8–49。
- 修之后，压着：
  - 四个一起 `--repeat-each=50`：200 过 0 挂，负载 18.1–26.3（平均 23.6）。
  - 各自 `--repeat-each=20`：layers 20/20（负载 19.4–20.0）、properties 20/20（17.9–21.0）、popover `:34` 20/20（18.9–21.7）、popover `:99` 20/20（19.4–20.2）。
- 修之后，不压：各自 `--repeat-each=20`：layers 20/20（负载 20.2–23.1）、properties 20/20（21.1–22.4）、popover `:34` 20/20（20.1–22.8）、popover `:99` 20/20（20.6–21.9）。
- 整个文件各跑一次（`--project=page`，不压，负载约 17–20）：`layers.spec.ts` 34 过、`properties.spec.ts` 64 过、`popover-exit.spec.ts` 7 过。
- `pnpm typecheck` 过。整套 e2e 留给指挥。

#### 代定的事（待设计师确认）

1. 折叠测试用「把动画停在起点、读完再放开」代替「赶在 200ms 里读」。停的是整个页面的动画（DevTools 的播放速度），不是只停折叠的；停的时间里只做读取，不碰别的动画。
2. 弹出层的离开状态改在「变成离开的那一刻」读（页面里的 MutationObserver），不再在点击返回之后读。
3. 折叠两个测试多了中点采样（方向、0–8px 之间、半淡、后面的往上升），比改前严。`:99` 也改成和 `:34` 一样看全四项。
4. `:34` 键盘那段前把指针挪到 (0, 0)。指针停在菜单下面时，选项被指针进入而成为当前项是产品照设计的行为，测试不去改它，只让键盘那段不受它干扰。

#### 遗留风险

1. `holdMotion` 靠 Chrome 的 DevTools 协议（`Animation.setPlaybackRate`）。e2e 只跑 Chromium，`motion.spec.ts` 也靠它；换浏览器要换做法。
2. 停住动画时整个页面的动画都停（包括别的面板的），只在读的那几步里；如果以后在停住期间加了要等别的动画结束的断言，会卡住直到超时。
3. `watchLeaving` 只在第一次出现 `.is-leaving` 时记一次；以后同一个测试里要再看一次离开，得再调一次。
4. 离开后「会走」那条仍是 `POPOVER_EXIT_MS + 1000` 的上限，这次压着跑（两个测试各 70 次）都没挂；机器比这次（负载 50 左右）还忙，理论上还可能超时。
5. 不压时的负载也有 20 左右（别的线在跑），没有在完全空闲的机器上跑过这 20 次。
6. 「a menu opened again while it leaves」（现在 97 行）也是点完再读离开状态，机器很忙时同样可能读晚。它不在这次的四个里，压着把 `popover-exit.spec.ts` 整个跑 15 遍没挂过，没改；要改可以照 `watchLeaving` 的做法。

**Review 后的修正（2026-11-10）**（上面「改了什么」「为什么检查没有变弱」、代定、风险里说的，和这一节不同处以这一节为准）

- 弹出层（审查第 1 条）：只记「开始离开那一刻」时，测试证明不了它真的留满退场的时间：被改成 0ms 就移除，或下一次渲染又去掉了 `inert`，都能过。`watchLeaving` 改成：
  - 从有一个开始 `.is-leaving` 起，到全都没了为止，每一次变化（子节点、任何属性）都把所有匹配元素的状态记一份；测试要求每一份都等于 `[{ leaving: true, aria-hidden: "true", inert: true, pointer-events: "none" }]`。
  - 在编辑层的 root 上用捕获阶段记下关掉它的那次点击的 `performance.now()`，再记下全都没了的时刻；要求两者相差不少于 `POPOVER_EXIT_MS - 1`（1ms 是 `performance.now()` 的粗化）。点击的捕获先于关掉它的处理，处理先于退场计时器开始，计时器不会提前跑，所以机器再忙这条也成立；用「开始离开那一刻」做起点反而不稳（计时器在渲染里就开始了，比那一刻早一点）。
  - 先确认这条有用：临时把下限改成 `POPOVER_EXIT_MS * 3`，两个测试都挂，读到 151.3ms、151.7ms；改回。
  - 等它没了用 `expect.poll`，上限照旧 `POPOVER_EXIT_MS + 1000`；之后 `toHaveCount(0)` 再确认一次。
  - 记录放在页面 window 的 `LEAVING_RECORD`（`"__e2eLeaving"`）下。
- 减少动态效果（审查第 2 条）：原来的 `await expect(fold).toHaveCount(0)` 会重试 5 秒，正常的折叠也会过，不是「立刻」。现在点之前 `holdMotion`，点完只读一次：`expect(await fold.count()).toBe(0)`，后面那一行也没有动画（CSS 过渡除外，悬停的颜色）。效果那边「opened, at once」同样：停住动画再点开，副本 0 个只读一次，这一组里除了 CSS 过渡没有动画。
- 折叠的时长（审查第 3 条）：副本上读到的每个动画、后面那一行 / 那个效果的动画，`effect.getTiming().duration` 都要等于 `LAYERS_FOLD_MS`。
- 小的：
  - 两个折叠测试的检查合进 `fixtures.ts` 的 `expectFolding(fold, rows, after)`：关键帧、时长、后面的一个动画、中点采样。
  - `midway` 改名 `seekTo`。
  - `motion.spec.ts` 和 `properties.spec.ts` 数字滚动那两处用的是 0.1、0.02、0.05 这类慢放，不是停住，`holdMotion` 换不上，没动。
- 第 4 条（`:97`）和长菜单里指针的事：不在这张票里，记进下面的风险。

**修正后重跑**（负载同上，1 分钟值，每 5 秒采一次）
- 压着（6 个 `yes`，跑完杀掉，`pgrep -x yes` 为 0），各自 `--repeat-each=20`：layers 20/20（负载 4.5–11.2，开始时机器刚好闲下来，1 分钟值还在往上走）、properties 20/20（10.5–13.9）、popover `:34` 20/20（12.4–23.4）、popover `:99` 20/20（21.8–25.3）。为了在更高的负载下也看一遍，四个一起 `--repeat-each=50`：200/200（18.9–36.9，平均 25.2）。
- 不压，各自 `--repeat-each=20`：layers 20/20（22.2–23.4）、properties 20/20（20.2–21.7）、popover `:34` 20/20（22.6–24.1）、popover `:99` 20/20（20.9–22.2）。
- 整个文件各一次（不压，负载约 18–31）：`layers.spec.ts` 34 过、`properties.spec.ts` 64 过、`popover-exit.spec.ts` 7 过。`motion.spec.ts` 没动，没跑。
- `pnpm typecheck` 过。整套 e2e 留给指挥。

#### 代定（修正后，替换上面 2、3）

2. 弹出层看的是「从开始离开到没了」的每一次变化，并且没了的时刻不早于关掉它的点击之后 `POPOVER_EXIT_MS`。起点用点击的捕获，不用「开始离开那一刻」，理由见上。
3. 折叠两个测试多了中点采样和时长；「立刻」（减少动态效果的收起、效果的打开）改成停住动画后只读一次。`:99` 也看全四项。

#### 遗留风险（修正后，补在上面后面）

7. （上面的风险 6 不再成立：这一条已并进本票，见下面「范围扩大后」。）
8. 长到要滚动的菜单里（`Select.tsx` 200 行、395 行的 `onPointerEnter`），指针停着不动时，滚到它下面的选项也会成为当前项，抢掉键盘选中的那一项。这是产品的行为，不在这张票里；指挥会交给规划会话。
9. 「没了不早于点击后 `POPOVER_EXIT_MS`」只给了下限 1ms 的余量：如果以后 Chrome 把 `performance.now()` 粗化到 1ms 以上，可能误报；现在读到的是 151ms 左右。

**范围扩大后：「a menu opened again while it leaves」（2026-11-10；合进 main fb226c6d 后做）**

- 原因：点第二下让菜单离开以后，才去读离开状态（`leavingState`），和 `:34` 一样，机器忙时那一下可能晚于 150ms 的退场。更要紧的是第三下：它本该落在退场途中，可机器忙时退场可能先放完、菜单已经移除，第三下就只是「重新打开」，原来的检查（一个菜单、不在离开、`opacity` 1、等过退场时间还在）照样全过，等于没测到「退场途中再打开」。压着跑这个测试 40 次，有 6 次第一轮就是这样（见下）。
- 改了什么（还是只动 `popover-exit.spec.ts`）：
  - `watchLeaving` 改成记录离开以后经过的各个阶段和时刻：`leaving`（有一个在离开）、`gone`（全没了）、`shown`（在，且没有在离开的），每次阶段变化记下 `performance.now()`；离开期间每次变化都记下全部状态；第一次 `shown` 时记下状态。按下的时刻在 window 的捕获阶段记 `pointerdown`（比 click 更早，点外面关掉也适用），`leaves()` 要求从按下到 `gone` 不少于 `POPOVER_EXIT_MS - 1`，离开期间每一份都是 `LEAVING`。三处离开（`:34` 选项、取色器的 Close、这一条的点外面）都用它。
  - 第三下是否落在退场途中：看阶段序列。`leaving shown` 就是在退场途中重新显示（中间没有 `gone`：退场计时器一跑，菜单当即移除，点击处理不会插在计时器和重绘之间），`leaving gone shown` 就是退场先完了。后一种不算过，菜单这时已重新打开，于是把「点第二下、点第三下」重来，最多 5 轮；5 轮都没落进去就失败（「the click once more landed within the exit in one of 5 tries」）。出现第二种以外的序列也直接失败。重来时在测试的 annotations 里记一条 `tries`。
  - 落进去以后：离开期间每份都是 `LEAVING`，重新显示那一刻是 `[{ leaving: false, aria-hidden: null, inert: false, pointer-events: "auto" }]`（只有一个菜单），`opacity` 1；再等 `POPOVER_EXIT_MS + 100` 后，阶段序列仍然只是 `leaving shown`，没有 `gone`：被取消的退场没有回来把它移除（改前只看「还可见」）。之后选 Drop shadow 照旧。
  - 这里留下了一个 `waitForTimeout(POPOVER_EXIT_MS + 100)`：要证明的是「这段时间里没有移除」，没法用 poll 等；它只会比写的更长，机器忙不会让它误报。
- 先确认两条路都通：临时在第二、三下之间等 `POPOVER_EXIT_MS + 50`（只在前两轮），测试在第 3 轮落进去并通过；每轮都等，就以「5 tries」失败；改回。
- 次数和负载（1 分钟值，每 5 秒采一次）：
  - 五个测试压着各自 `--repeat-each=20`：layers 20/20（负载 6.8–14.7，刚开始机器闲，1 分钟值还在上升）、properties 20/20（19.5–23.5）、popover `:34` 20/20（20.4–21.8）、popover 取色器 20/20（18.7–19.8）、本条 20/20（17.1–18.1）。
  - 不压各自 `--repeat-each=20`：layers 20/20（15.4–16.6）、properties 20/20（14.1–16.8）、popover `:34` 20/20（15.0–19.6）、取色器 20/20（17.5–19.8）、本条 20/20（18.3–29.3）。
  - 五个一起压着 `--repeat-each=40`：200/200，0 flaky，负载 18.2–38.6；本条 40 次里 6 次第一轮退场先完了，第二轮都落进去了。
  - 整个文件各一次（不压，负载约 29–33）：`layers.spec.ts` 34 过、`properties.spec.ts` 64 过、`popover-exit.spec.ts` 7 过。`pnpm typecheck` 过。`motion.spec.ts` 没动。整套 e2e 留给指挥。

#### 代定（范围扩大后，补在上面后面）

5. 第三下没落进退场时重来，而不是失败：机器忙时这很常见（压着 40 次里 6 次），失败只会变成新的偶发失败；最多 5 轮，都没落进去才算失败。
6. 「按下」的时刻改用 window 捕获阶段的 `pointerdown`（上面「review 后的修正」里说的是 click）：点外面关掉的那一下不一定在编辑层里触发 click，`pointerdown` 对三处都早于关掉它的处理。

#### 遗留风险（范围扩大后）

10. 重来最多 5 轮：如果机器忙到每轮第三下都晚于 150ms，这条会失败；这次压着最多用到第 2 轮。
11. 「下限 `POPOVER_EXIT_MS - 1`」现在从 `pointerdown` 算起：按下和松开之间在机器忙时会隔开一段，如果有回归把退场缩短，这段间隔会把它遮住一部分；机器闲时照样抓得到（量到的约 151ms）。
