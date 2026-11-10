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

- [ ] e2e 先复现：打开一个长得要滚动的菜单（字体列表），鼠标停在菜单里，连按 ArrowDown 到底。修改前当前项会被鼠标抢走，修改后当前项一路往下走、菜单跟着滚。下拉选择和普通菜单各一条。
- [ ] 鼠标移到选项上它就成为当前项，普通菜单的选项说明照旧弹出：已有测试全过。
- [ ] `--dry` 全过（29 个场景），`--dry --claim-out` 和改前逐字相同；`--scripted` 全过；切换按钮的包逐字节不变。
- [ ] 整套 e2e 过。

## 设计师决定（2026-11-10）

- 发布前修。
- 规划会话安排：
  - 接在 109 那条线后面：126 → 127 → 131。
  - 照常 conduct：派一个新的实现子 agent、一个审查子 agent，都用 effort medium，端口用 5500 段。
