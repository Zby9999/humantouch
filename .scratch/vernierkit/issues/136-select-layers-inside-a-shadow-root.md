# 136: shadow root 里的层能悬停、选中，在 Layers 里列出来

**What to build:** 135 让 shadow root 里的内容在画布上看得见了。这张票让设计师能像对待页面上别的层一样，在画布上悬停、点选、框选 shadow root 里的层，在 Layers 里展开看到它们。Design 面板也照常显示选中层的属性。

- 命中测试要进到 shadow root 里面。`elementFromPoint` 只返回宿主，要往里找，比如用 `shadowRoot.elementFromPoint`。
- Layers 的树从宿主往下接着列 shadow root 的子层。宿主本身照常是一层，层名的取法照现在的规则。
- Design 面板读选中层的样式时，要读 shadow root 里的样式表：现在的值从哪里来、Variables 用在哪里，这些读法都要进到 shadow root 里。
- 选中、悬停的框，尺寸标注、对齐线，在 shadow root 里的层上照常画。
- ⌘ 点击（选最深的层）、双击进到里层、Esc 回到上一层，这些照常可用，可以穿过 shadow 边界。

参考 135；用词以 GLOSSARY.md 为准。

**Blocked by:** 135

**Status:** ready-for-agent

- [ ] e2e 用 135 的测试页面：
  - 点 shadow root 里的一层，它被选中，Design 面板显示它的值；
  - Layers 里它在宿主下面；
  - 悬停时有框；
  - ⌘ 点击能直接选到最深的层。
- [ ] 没有 shadow root 的页面，选中、Layers、Design 面板的已有测试全过。
- [ ] 选中一层的 perf 不变差（headless）。
- [ ] `--dry` 29/29，`claim-out` 和改前逐字相同；`--scripted` 20/20；整套 e2e 过。
