# 150: 在画布上试本机装的字体，保留下来的交给 Agent 装进项目

**What to build:** 设计师 2026-11-11 提出并定下做法，发布后做。

- 字体菜单应该能看到本机装的所有字体。
- 画布是 Playground，设计师在里面随便试，试的时候什么都不装进项目。
- 只有保留下来、交给 Agent 的改动，才让 Agent 把新字体装进项目。

做法：

- **字体菜单分两组**：
  - **In this project**：项目里已有的，照 ticket 13、140、149 的列法。
  - **On this computer**：本机装的字体。
  - 菜单加搜索，本机字体可能有上千个。
- **列本机字体**：用浏览器的 Local Font Access 接口（`queryLocalFonts()`，Chrome、Edge 有）。
  - 第一次要设计师点一下授权，Chrome 规定必须由用户手势触发。所以「On this computer」先是一个按钮，比如 "Show fonts on this computer"，点了弹授权，同意后列出。
  - 拒绝了，就照旧只有项目里的字体，并说明怎么在浏览器设置里重新允许。
  - 每个字体的字重，从它的样式（Light、Bold、Italic……）得出。
- **Safari、Firefox** 没有这个接口：不出现这一组，给一个输入框，设计师输入字体名字就能试；本机装了就显示出来。
- **试**：选了本机字体，画布和各视图马上按名字用上它，不往项目里装任何东西。撤销、重做、换回照常。
  - 面板上标出它不在项目里，比如一个小标记 "Not in project"。措辞是代定。
- **交给 Agent**：
  - 改动说明写明这个字体项目里还没有，只装在设计师的电脑上；要照项目加载字体的方式把它加进来，比如 next/font/google、Fontsource，或者项目自己的 `@font-face`。
  - 写法规则写死：
    - 不许把设计师电脑上的字体文件拷进项目；
    - 只从官方来源取，比如 Google Fonts、Fontsource、字体厂商，并看许可是否允许随项目分发；
    - 取不到的（比如 Apple 的 SF Pro、苹方，或买来的商业字体），在报告的「↪ Done differently」栏写明原因，改用项目里最接近的字体。
  - 用词保持英文（Skill、改动说明）。
- **核对**：Agent 装好后，页面文字用上了这个字体、画出来和画布一样，就算显示了（ADR 0016）。next/font 会把 family 名改成带 hash 的名字，核对要认得出来。

参考 ticket 13（排版）、140、149，ADR 0016、ticket 148（↪ 一栏）；用词以 GLOSSARY.md 为准。可能需要给「本机字体」定一个词，写进 GLOSSARY。

**Blocked by:** 140、149、146、148。发布后做（设计师 2026-11-11 定）。

**Status:** ready-for-agent

- [ ] e2e（Chrome，授权用 Playwright 的 `local-fonts` 权限）：点 "Show fonts on this computer"，列出本机字体；搜索能找到；选一个项目里没有的本机字体，画布和各视图换成它，面板标出不在项目里，⌘Z 撤回。
- [ ] 拒绝授权、或浏览器没有这个接口时：没有这一组，有输入字体名字的框，输入后能试。
- [ ] `--dry` 加一个场景：字体改成本机字体，改动说明写清要装进项目、不许拷本机文件、取不到怎么办。已有场景的 `claim-out` 逐字不变。
- [ ] `--scripted` 加一个场景：脚本照 next/font/google 装一个 Google 字体，`done` 判为显示了；另一个脚本说明取不到，报告把它放在 ↪。
- [ ] 菜单打开耗时：本机上千个字体时不卡（headless 前后对比）。
- [ ] `pnpm typecheck`、`pnpm test`、整套 e2e 过。
