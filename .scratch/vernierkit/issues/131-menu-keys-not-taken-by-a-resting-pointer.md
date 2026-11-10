# 131: 长菜单里按方向键时，不被停着的鼠标抢走高亮

**What to build:** 设计师点开一个长菜单（比如字体列表），鼠标停在菜单上不动，然后按 ArrowDown。菜单跟着方向键滚动时，内容从静止的鼠标下面移过去，Chrome 会对移到鼠标下的选项触发 pointer enter。这个选项于是变成当前项，方向键就跳回去，或者卡住不动。

问题在于：两种菜单都是在 pointer enter 时把选项设成当前项：
- 下拉选择：`Select.tsx` 里选项的 `onPointerEnter`；
- 普通菜单：同一个文件里 `tk-menu-option` 的 `onPointerEnter`，它还会打开选项的说明。

两种菜单也都会跟着方向键滚动：一个改 `scrollTop`，一个用 `scrollIntoView`。短菜单不滚动，实际碰不到。

这是 126 的审查读代码时发现的，还没实际跑过。

要做到：
- 鼠标真的移动时，才把它下面的选项设成当前项。用 pointer move，或者「enter 之后有过 move」。菜单因为方向键而滚动时，鼠标不动，当前项就不变。
- 鼠标移动时照旧：移到哪个选项，哪个就是当前项；普通菜单的选项说明照旧弹出。
- 键盘的其余行为不变：Home、End、左右键、回车选中、Esc 关闭。

参考 ticket 126 的 Comments（审查记录），用词以 GLOSSARY.md 为准。

**Blocked by:** None technically. It is on the Grid line after 127.

**Status:** ready-for-agent

- [x] e2e 先复现：打开一个长得要滚动的菜单（字体列表），鼠标停在菜单里，连按 ArrowDown 到底。修改前当前项会被鼠标抢走，修改后当前项一路往下走、菜单跟着滚。下拉选择和普通菜单各一条。
- [x] `popover-exit.spec.ts` 里「a menu closed with the pointer …」那条，126 在键盘那段之前加了 `page.mouse.move(0, 0)`，绕开的正是这个问题。把它去掉，测试照样过。
- [x] 鼠标移到选项上它就成为当前项，普通菜单的选项说明照旧弹出：已有测试全过。
- [x] `--dry` 全过（29 个场景），`--dry --claim-out` 和改前逐字相同；`--scripted` 全过；切换按钮的包逐字节不变。
- [ ] 整套 e2e 过。

## 设计师决定（2026-11-10）

- 发布前修。
- 规划会话安排：
  - 接在 109 那条线后面：126 → 127 → 131。
  - 照常 conduct：派一个新的实现子 agent、一个审查子 agent，都用 effort medium，端口用 5500 段。

## 实现记录（2026-11-11）

- `Select.tsx`：两种菜单的选项都从 `onPointerEnter` 改成 `onPointerMove`。
  - 下拉选择：`onPointerMove` 时，选项可选、且不是当前项，才 `onActive(i)`。
  - 普通菜单：`onPointerMove` 时，选项可选、且不是当前项，才 `setActive(i)`；有说明、是鼠标、而且说明还不是这一项的，才 `setPointed`。这样鼠标在同一项里移动不会每次都重画。`onPointerLeave` 照旧收起说明。
- 先在页面里记了一遍事件：菜单因方向键滚动、鼠标不动时，Chrome 给滑到鼠标下的选项发 `pointerover` / `pointerenter` / `mouseover`，不发 `pointermove` / `mousemove`。所以只认 pointer move 就够了，不用再比坐标。
- 新测试两条，都是鼠标先移进菜单靠上的地方，停住，再连按 ArrowDown 到底：
  - `properties.spec.ts`「in a font menu long enough to scroll …」：先在画布页面里加载 40 个 `FontFace`（`local(Georgia)` 等），再选文字，字体菜单 42 项，比窗口长。每按一下当前项往下走一项，到最后一项；`aria-activedescendant` 也是它；菜单滚到底。然后鼠标移到倒数第二项上，它成为当前项，回车选中 Test Font 39。
  - `variables.spec.ts`「in Effects' + with very many shadow Variables, ↓ …」：和已有那条一样加 40 个 shadow Variable。鼠标移进 Variables 那一栏，它成为当前项，说明弹出；按到 elevation-40，这一栏滚过、最后一项整个在栏里。然后鼠标移到倒数第二项，它成为当前项，说明换成 elevation-39，回车加上。
  - 改前都失败：下拉选择那条按到第 25 项（开始滚动）时当前项跳回第 2 项；普通菜单那条应该是第 18 项，得到第 8 项。改后都过（各重复 3 次）。
  - 一开始鼠标停在菜单靠下的位置，改前也过：滚动时滑到鼠标下的正好是方向键移到的那一项，抢了也看不出来。所以鼠标要停在靠上。
- `popover-exit.spec.ts`「a menu closed with the pointer …」：去掉键盘那段前的 `page.mouse.move(0, 0)`，注释改成「指针停在 select 上，菜单打开在它下面，没移动就不抢」。重复 10 次全过。
- 结果：
  - typecheck 过；vitest 1205 passed / 1 skipped；node 测试 126/126。
  - e2e（`TK_E2E_PORT=6100`）：`popover-exit` + `variables` + `properties` + `layout` 116 passed；`variables-late` + `grid` + `stack` 32 passed。
  - 包：切换按钮的包（`editor.dev.js` 以外的 12 个文件）和 main c0145e60 逐字节相同；`editor.dev.js` 542,659 → 542,682 字节（+23），gzip -9 192,295 → 192,308（+13）。
  - bench（`TK_BENCH_PORT=5540`）：`--dry` 29/29，`--dry --claim-out` 和 main c0145e60 的 29 份逐字相同，`--scripted` 20/20。

## 审查后的修正（2026-11-11）

- 字段的 Variables 列表（`Matching variables`）也有同样的问题：`VariablePicker.tsx` 里 `Option`（`as="div"`）在 `onPointerEnter` 时选中，`Matches` 用 `scrollIntoView({ block: "nearest" })` 跟着 ↑ / ↓ 滚动（`.tk-matches` 最高 224px）。改成 `onPointerMove`，而且只在它还不是当前项时选中。取色器 Variables 里色块的 `onPointerEnter` 只显示提示，没动。
- 新测试 `variables.spec.ts`「in a field's list of very many matching Variables …」：加 40 个 spacing Variable（space-01 … space-40），在 Padding top 里输入 `space-`，列表 40 项，比 224px 高。鼠标移到列表靠上的地方停住，↓ 到最后一项，每一步都检查字段的 `aria-activedescendant`、选中的那一项、它整个在列表里；再 ↓ 一下绕回第一项（列表回到顶，`scrollTop` ≤ 4，是列表的 4px 内边距），↑ 一下回到最后一项（列表又滚到底）。然后鼠标移到倒数第二项，它成为当前项，回车用上它。改前失败：第 9 项时当前项被抢回第 3 项。改后过（重复 3 次）。
- `variables.spec.ts` 里两帧的等待改用文件已有的 `frames(page)`；`properties.spec.ts` 里没有可用的现成函数（`fixtures.ts` 里那处是内联的），去掉新加的 `twoFrames`，同样内联。
- 字体测试改用 data URL 字体不简单（要一份真的字体文件），没改，仍记在风险里。
- 结果：typecheck 过；vitest 1205 passed / 1 skipped；node 126/126；e2e `popover-exit` + `variables` + `variables-late` + `properties` + `layout` 129 passed；三条 131 的测试重复 3 次 9/9。包：`editor.dev.js` 以外的 12 个文件仍和 main 逐字节相同；`editor.dev.js` 542,659 → 542,693（+34），gzip -9 192,295 → 192,309（+14）。bench（`TK_BENCH_PORT=5540`）：`--dry` 29/29，`--dry --claim-out` 和 main 的 29 份逐字相同。

## 代定

1. 只认 `pointermove`，不做「enter 之后有过 move」的标记。两者效果一样：选项收到 pointermove 时指针就在它上面。
2. 菜单打开在静止的鼠标下时（126 的情况），鼠标下的选项也不再成为当前项，要等鼠标动一下。当前项还是已选中的那一项。
3. 普通菜单滚动时，原来那一项收到 `pointerleave`，说明照旧收起；滑到鼠标下的那一项不弹说明，鼠标动一下才弹。改前它会弹出那一项的说明。
4. 触屏：改前手指按下时 `pointerenter` 会把那一项设成当前项；现在不会（触屏只有拖动时才有 pointermove）。点一下照旧直接选中，所以看不出差别。
5. 字体菜单的测试用 `local(Georgia), local(Arial), local(Helvetica)` 造字体；这台 Mac 的 Chromium 上能加载。
6. 同一类的第三个列表（字段的 Variables 列表）也在这张票里改了，同样只认 pointer move。
7. 用滚轮或触控板滚动菜单、鼠标不动时，当前项不再跟着鼠标下的选项变：它留在原来那一项，可能已经滚出视野，直到鼠标动一下；这时按回车选中的是原来那一项。保留这个行为，记下给设计师看。

## 风险

1. 如果哪个浏览器在滚动或布局变化后也补发 `pointermove`（坐标不变），三种列表的问题都会回来；Chromium 现在不发（上面记过事件）。Firefox、Safari 没测。
2. 三条新测试每步都按一下、等一下当前项，40 步左右，各约 5 秒；机器忙时也是逐步断言，不靠时间。
3. 字体测试依赖系统上有 Georgia / Arial / Helvetica 之一；换到没有这些字体的 Linux 机器上，`face.load()` 会报错。

