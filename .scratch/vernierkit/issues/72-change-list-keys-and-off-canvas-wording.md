# 72: 改动列表的撤销键与编辑层一致，给 Agent 的说明不说 set aside

**What to build:** 预览模式的改动列表里，现在按 ⌘Y 会撤销，编辑层里 ⌘Y 却不响应。改动列表改用和编辑层同一套撤销键：⌘Z 撤销，⇧⌘Z 和 Ctrl+Y 重做，⌘Y 不响应（交给浏览器）。另外，给 Agent 的改动说明和 Skill 在讲画布外的图层时用了 "set aside"，GLOSSARY 要求避开 Aside，改为用画布外的图层（Off-canvas Layer）的说法。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0012）。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] 改动列表和编辑层判断撤销键时共用一处，不再各写一份
- [x] e2e：在改动列表里，⌘Y 既不撤销也不重做；Ctrl+Y 重做；⌘Z、⇧⌘Z 照旧
- [x] 改动说明里讲"放回画布外图层的副本"的那句，以及 Skill 里 **Put back** 的解释，都不再出现 aside；单测把新的说法固定下来
- [x] 全量单测和 e2e 通过

## 背景

- 来自编辑层线合并时（2026-10-30）报告的遗留风险第 9 条，用户决定修。
- Mac 上 Ctrl+Y 也重做，ADR 0012 已写明，不改。

## Comments

**实现记录（2026-10-31）**

*做了什么*

1. **改动列表的撤销键改用编辑层的判断**（`ChangeList.tsx`）：原来改动列表自己比对 Z 和 Y，⌘Y 被当成撤销，Ctrl+⇧Y 当成重做，⌘⇧Y 也当成撤销，而且连浏览器的默认动作一起拦下。现在它和编辑层用同一个函数 `historyKey`（`canvas-keys.ts`，ticket 61 起编辑层撤销用的就是它，里面再按 `editorCommand` 比对字母和修饰键）：⌘Z（以及 Ctrl+Z）撤销，⇧⌘Z 和 Ctrl+Y 重做，⌘Y、⌘⇧Y、Ctrl+⇧Y 都不是编辑层的键，列表不管，浏览器照常处理（不拦默认动作）。以后编辑层的撤销键再改，改动列表自动跟着改。顺带的：鼠标按着时（ADR 0012）列表里的撤销键也按"什么也不做"处理；预览模式下没有能按着的操作，实际不会遇到。编辑模式里打开的改动列表不变：那里的 ⌘Z 一直归画布（列表本来就不接撤销键）。
2. **给 Agent 的改动说明**（`change-notes.ts`）：按住 ⌥ 挪出画布的副本拖回时，说明原来写"set aside off the canvas as a copy"，改为 "Put a copy of this layer here: the off-canvas layer put back is a copy of it, so the layer it copies stays where it is."（把这个图层的一个副本放在这里：拖回的画布外的图层是它的副本，所以它复制的那个图层留在原处）。意思不变，用词改成 GLOSSARY 的画布外的图层（Off-canvas Layer）。改动说明每次 `claim` 时按改动单重新写出，之前保存的一轮也会用新说法。
3. **Skill**（`skill/SKILL.md`）：改动种类列表里 **Put back** 的解释原来是 "a layer the designer had moved off the canvas, set aside beside it, put back onto it"，改为 "an off-canvas layer, one the designer had moved off the canvas, put back onto it"；后面专讲 **Put back** 怎么落地的那一段开头也改成 "an off-canvas layer, one the designer moved off the canvas, comes back onto it"，两处说法一致。
4. 顺手改了两处代码注释里的 aside：拖拽让位（Make Room）的注释、`off-canvas.spec.ts` 里讲画布外的图层的注释。都只是注释，GLOSSARY 的 _Avoid_ 里有 Aside。

*测试*

- e2e（`undo.spec.ts` 新加 1 条）：做三条改动回到预览模式，打开改动列表，先在列表里撤销两条。按 ⌘Y、⌘⇧Y，改动条数和列表都不变，而且每次都检查到浏览器的默认动作没有被拦；⌘Z、Ctrl+Z 依次撤销列表里的撤销，Ctrl+Y、⇧⌘Z 依次重做，每次都检查到默认动作被拦下（编辑层接了这个键）；最后在既有可撤销、又有可重做的一步时再按 ⌘Y，仍然什么都不变。先在没改的代码上跑过，这条在第一次按 ⌘Y 时就失败（默认动作被拦了，说明列表把它当成了撤销），改后通过。
- 单测：`cli.test.ts` 里画布外副本拖回的那条，期望的说明换成新句子，并加上不出现 set aside；`install.test.ts` 新加 1 条，固定 Skill 里两处 **Put back** 的新说法，并检查 Skill 里不出现 set aside、aside beside、aside off。两条先在没改的文案上跑过，都失败，改后通过。检查用 "set aside" 这类词组而不是单个 aside，因为 HTML 的 `<aside>` 元素在改动说明和 Skill 里可能合理出现。
- 改动列表共用的判断没有另加单测：`historyKey` 本身的各种键在 `canvas-keys.browser.test.ts` 里已经有（ticket 61、62），这里要证明的是列表确实用了它，e2e 覆盖。
- 全量：typecheck 通过；单测 556 通过、1 跳过（改动前 555）；e2e 290 通过、1 跳过、1 失败（改动前 289 通过）。失败的是已知的 `autosave.spec.ts:255`：ticket 60 的测试素材 `e2e/fixtures/round-before-60/` 里写死了别的 worktree 的绝对路径，编辑层线在修，和这张无关。第一次跑单测时浏览器里的测试文件因为刚装好依赖、Vite 第一次预构建而加载失败，再跑一次全部通过，不是代码问题。

*前后数字*

不涉及性能指标（docs/goals.md「度量」）：这张只改按键的判断和文案。改动列表只在编辑层的那一部分代码里（进入编辑模式时才加载），切换按钮的体积不变，`toggle-first.spec.ts` 的 10KB 检查照常通过。

*按 code-review 修正（2026-10-31）*

- Spec：没有缺的或做错的。指出两处范围外的小改动（拖拽让位、画布外测试的注释），都是按 GLOSSARY 换词，保留。指出 e2e 里第一次按 ⌘Y 的结果被紧接着的 ⌘⇧Y 覆盖、⇧⌘Z 和 Ctrl+Z 后没检查默认动作，已改成每按一次都检查。
- Standards：没有违反文档规定的。改了：e2e 里记"默认动作是否被拦"的变量原名 `kept`，读起来像"浏览器留着"，意思正相反，改名 `takenFromBrowser`；`ChangeList` 里的判断改写，不再需要 `!` 断言；`historyKey` 的说明补上改动列表也用它；`install.test.ts` 里读 Skill 文件的代码出现两次，提成一个常量；"不出现 aside"的检查原来是整个词 aside，会误伤 `<aside>` 元素，收窄为上面的词组。没改的：新单测的名字里有 set aside，是在说"不能出现的词"，保留。

*遗留风险*

- ⌘Y 交给浏览器这件事，测试只证明了编辑层没有拦它（默认动作没被阻止）；浏览器是否真的打开历史记录要看浏览器本身，没有在有窗口的 Chrome 里看过（按规定不开有窗口的浏览器）。
- Ctrl+⇧Y、⌘⇧Y 以前在列表里分别是重做、撤销，现在都不响应，和编辑层一致。如果有人习惯了，会觉得少了键；ticket 只要求和编辑层一致，没有另外处理。
- 代码里其他 aside（"margins aside""edits aside"、选中框 "steps aside"）是普通英语，不是讲画布外的图层或让位，没有改。

