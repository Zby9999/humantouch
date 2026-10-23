# 30: 改动说明的说法、图层名与撤销时的代码对比

**What to build:** 四处小改，都来自完整一轮验证中 Agent 视角的可用性问题：

- 作用范围从事实推出：写出图层的组件不在任何其他组件里时（如 App），直接写"在位置处修改"，不再写"只改这一处使用、其他使用处不变"。
- 图层名取设计师认得的东西：组件名 > 文字内容 > 元素的用途（Button、Link、Input 等）> 类型（Stack / Grid / Frame）。
- 撤销用 git tree：`claim` 和本轮结束（`finish` 或手动解锁）时，在 git 仓库中各把当时的代码记成一个 git tree，不改动暂存区与任何文件；`last` 给出这一轮源码的 diff 和反向应用的命令。不在 git 仓库中时照旧。
- 命令行的错误信息写到 stderr。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 07

**Status:** ready-for-agent

- [x] 写在最外层组件里的图层，作用范围写"在位置处修改"
- [x] `<button>` 等有用途的元素在图层树中显示为 Button 等名称，组件与文字图层的名称不变
- [x] `last` 输出上一轮源码的 diff 命令，按它反向应用即可撤销；记下代码时不改动 git 暂存区
- [x] 命令行的错误信息写到 stderr，退出码不变
- [x] Skill 的撤销步骤改为优先用 diff

## Comments

**实现记录（2026-10-23）**

- 作用范围（`change-notes.ts`）：使用链只有一层、且这一层有使用处位置时（写出图层的组件不在任何其他组件里，如 App），写 "Change it where it is written, at Location. App, which writes it, is used at `src/main.tsx:8:5`, outside any other component."；有多个实例时补一句一起变化。其余情况不变。
- 图层名（`layers.ts`）：Stack / Grid / Frame 类的图层按元素的用途命名：`button` → Button、`a[href]` → Link、`input` → Input、`textarea` → Text Area、`select` → Select、`form` → Form、`nav` → Navigation、`header` → Header、`footer` → Footer、`dialog` → Dialog；`role` 属性（button、link、dialog、navigation）优先。实例仍取组件名，文字图层仍取文字，图片、静态画面、锁定图层不变。示例页面里 "Get started" 按钮显示为 Button，标题行显示为 Header。
- 撤销时的代码对比（`vernier-folder.ts` 的 `snapshotCode`）：用一个临时的 git 索引（从真实索引复制，只重新计算改过的文件）在仓库顶层 `git add --all`，再 `git write-tree`，得到包括未跟踪文件在内的当时代码；真实的暂存区和任何文件都不动，临时索引用完即删。不在 git 仓库或没有 git 时返回 null。
  - `claim` 第一次认领时把它记进状态文件（`code`），本轮结束（`finish` 或手动解锁）时再记一次，两者一起写进归档的 `result.json`（`code: { repository, before, after }`）。
  - `last` 在说明开头给出 `git -C "<仓库>" diff <before> <after>`（这一轮的代码改动）和 `git -C "<仓库>" diff <after> <before> | git -C "<仓库>" apply`（撤销），并提醒先看 diff：落地期间别的编辑也在里面。
- 命令行：`Io` 多了 `error`，错误信息（没认领、编号不对、未知命令）写到 stderr，退出码不变。
- Skill：撤销步骤改为先看 diff、再反向应用；没有 diff 时照旧对照改动说明改回。
- 测试：命令行接缝 `test/cli.test.ts`（最外层组件的作用范围；错误写到 stderr；在临时 git 仓库里认领、改文件并新增文件、结束，按 `last` 给的命令撤销后文件复原、暂存区为空；不在 git 仓库时没有 diff）；主接缝 `layers.spec.ts` 的图层树与名称。e2e 中依赖按钮行位置的选择改为按名称 "Button"。

**已知限制**

- 记下的代码覆盖整个仓库（示例项目在 monorepo 里时就是整个 monorepo）。diff 中会混入落地期间其他人或其他工具做的修改，所以要求 Agent 先看再撤销。

**代码审查后的修正（2026-10-23）**

- 记下代码时排除 `.vernier/`（pathspec `:(exclude,glob)**/.vernier/**`），不再依赖项目忽略了它；`last` 给出的撤销命令带 `--binary`，二进制文件的改动也能反向应用。测试改为不忽略 `.vernier/`、并改动一个二进制文件。
- 状态文件里只给命令行用的字段（`claimedAt`、`code`）不再推送给页面。
- 文档中"快照"改称"当时的代码（git tree）"：GLOSSARY 把"快照"列为画布、静态画面要避免的词。
