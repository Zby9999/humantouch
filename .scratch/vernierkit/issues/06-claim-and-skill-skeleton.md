# 06: 认领：claim 输出改动说明 + Skill 骨架

**What to build:** Agent 运行 `npx vernierkit claim` 即可认领当前改动单，终端输出一份写给 Agent 的 Markdown 改动说明（每条改动含种类、位置、作用范围、设计意图、参考样式）。同时建立 Skill 骨架：何时触发、如何认领与阅读改动说明、落地通用规则（跟随项目写法、不改第三方依赖）。之后的功能 ticket 各自往改动说明和 Skill 中补充自己那类改动。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 05

**Status:** done

- [x] `claim` 把状态标记为已认领，并输出改动说明
- [x] 改动说明对 04 中的填充与圆角改动给出种类、位置、作用范围、设计意图与参考样式
- [x] 未定位、使用处未确定的改动在说明中有明确标注
- [x] 没有改动时 `claim` 给出明确提示且不改变状态
- [x] Skill 骨架包含触发条件、认领流程、跟随项目写法（Tailwind 改类名 / CSS 文件改 CSS）、不改第三方依赖
- [x] 主接缝：在示例项目中做改动后运行 `claim`，断言输出内容

## Comments

**实现记录（2026-10-23）**

- 模块：
  - `src/vernier-folder.ts`：`.vernier/` 目录，本机服务和命令行都经过它读写。`vernierFolder(root)` 给出各文件路径；`readChangeSet`、`readState` / `writeState`、`writeAtomically`。状态文件 `state.json` 只在已认领时存在：`{ "status": "claimed", "done": [] }`，没有这个文件就是编辑中。
  - `src/cli.ts`：命令行，`run(args, { cwd, write })` 返回退出码，便于在 node 测试里直接调用；`src/bin.ts` 是可执行入口，打包成 `dist/cli.js`，`package.json` 的 `bin` 指向它，`npx vernierkit claim` 即可运行。项目根目录取 `cwd` 往上最近一个带 `.vernier/` 的目录，没有就是 `cwd`。
  - `src/change-notes.ts`：改动说明，`describeChanges(changes)` 输出 Markdown。每条改动一节：Kind、Layer（图层名、元素的开始标签、页面上的图层路径）、Location、Scope、Design intent、Reference style。
  - `skill/SKILL.md`：Skill 模板，随包发布（`files` 加了 `skill`）。08 的 `init` 负责复制进项目。
- 改动单的 target 多了 `context`：图层从页面往下的名称路径和元素的开始标签（id、class）。未定位的改动只能靠它在源码里找。
- 标注规则：
  - 没有元素位置 → Location 写 **Not located**，提示从 Layer 一行给出的页面位置去找。
  - 使用链最内层的组件没有使用处位置、又不是第三方 → Scope 写 **Usage not determined**（Next.js 服务端组件会出现，09 再验证）。
  - 作用范围写出整条使用链（"Card used at …, inside App used at …"），并说明多个实例一起变化、其他使用处不变。Skill 里写明：图层代码在被多处使用的组件里时，要在这处使用上改（传 prop、className、变体），不要改组件本身。
- 没有改动时 `claim` 输出 "No design changes to apply…"，退出码 0，不创建 `.vernier/`、不改状态。
- 改动说明和 Skill 用英文，与编辑层界面一致。
- 本机服务改为通过 `vernier-folder.ts` 读写文件，去掉了重复的实现。
- 测试：
  - 命令行接缝 `test/cli.test.ts`：在临时目录里放改动单，断言输出与状态文件。
  - 主接缝 `e2e/tests/claim.spec.ts`：在示例项目里改填充、圆角和一个没有标记的图层，等自动保存后运行真实的 `dist/cli.js claim`。
  - 写真实 `.vernier/` 的 e2e 测试（`autosave`、`claim`，以及 07 的 `round`）放进单独的 Playwright 项目 "project files"，`workers: 1`，跨文件也逐个执行；其余测试在 "page" 项目里并行。
