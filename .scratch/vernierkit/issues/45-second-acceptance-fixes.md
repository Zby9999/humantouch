# 45: 第二轮验收修正

**What to build:** 设计师验收 41–44 时提出：

1. 文字编辑时的框像 Figma 一样是 1px 蓝框，不加粗。
2. 新建的 Frame 在画布上没有任何边框或底色（以后由描边属性表达），选中、悬停时照常有选中框。
3. 生成说明的入口：选中新建的 Frame 时，画布上 Frame 旁边出现一个按钮，点击弹出输入框写生成说明；属性面板中不再有 Brief 一栏。
4. 合成的新 Stack 自己不带外边距：设计师看不到、也调不了外边距，Hug 的 Stack 上方因此多出一块空白。子图层的外边距照旧并入间距；最外侧的外边距不再移到新 Stack 上，Stack 与相邻图层之间少了这段距离。
5. 播放按钮紧挨在 "Design" 标题旁，改动数与 X 仍在右侧。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] 文字编辑框为 1px 蓝色
- [x] 新 Frame 未选中时在画布上看不到边框与底色
- [x] 选中新 Frame 时旁边有"写生成说明"按钮，点开可写、离开或回车生效，可撤销；面板中没有 Brief 一栏
- [x] 合成后新 Stack 没有外边距，Hug 时正好包住子图层；改动说明不再要求给 Stack 加外边距
- [x] Design 标题旁是播放按钮

## Comments

**实现记录（2026-10-28）**

- 文字编辑框：去掉 2px，与选中框一样是 1px 蓝框。
- 新 Frame：画布样式表里不再给 `data-vk-new="frame"` 加任何边框。
- 生成说明：`CanvasView.tsx` 的 `Brief`，选中一个新 Frame 时画在它右上方："Add brief" / "Brief" 按钮，点开一个输入框，回车或离开生效，Esc 不改；按下它不算点画布。属性面板的 Brief 一栏删去；图层树中的标记保留。
- 新 Stack 不带外边距：`stacks.ts` 的 `outerMargin` 删去。子图层的外边距仍并入间距、清零并记下来源；Stack 与相邻图层之间少了最外侧那段外边距，所在容器垂直居中时整体会挪一点（示例中 8px）。改动说明写 "the Stack has no margin"，Skill 同步。
- 播放按钮紧挨 "Design" 标题（`.vk-play`），改动数与 X 仍在右侧。
- 验收中看到的那块空白，是改前合成的 Stack 带着 `margin-top: 16px`（来自段落的 `mt-4`）；改后新合成的 Stack 不会再有。已有的那一轮里的旧 Stack 仍带着它，撤回重做一次合成即可。
