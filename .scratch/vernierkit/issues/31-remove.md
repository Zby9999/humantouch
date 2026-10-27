# 31: remove：一条命令完整卸载

**What to build:** Agent 运行 `npx vernierkit remove`，撤回 `init` 所做的全部修改（构建配置、挂载、开发依赖、Skill、AGENTS.md 中的一行、.gitignore 中的一行），并删除 `.vernier/`；执行后 git diff 为空。有未落地的改动或正在落地的一轮时拒绝执行，并提示先落地或放弃。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 08

**Status:** done

- [x] 在示例项目副本上 init 后再 remove，git diff 为空
- [x] init 时 AGENTS.md 是新建的，remove 后它被删除；原本存在的，只移除那一行
- [x] 有未落地的改动或一轮正在落地时，remove 拒绝执行并说明原因
- [x] 重复运行 remove 不报错
- [x] Skill 与 Guide 提到 remove（Skill 已加；Guide 还没有，由 23 写，23 已列出"说明如何用 remove 卸载"）

## Comments

**实现记录（2026-10-27）**

- `remove` 在 `src/install.ts`，和 `init` 共用 `.vernier/install.json`：
  - `init` 每改一处，记下这几行改前、改后的样子；`remove` 倒序把"改后"的整行换回"改前"，只认整行匹配。这样构建配置、挂载、AGENTS.md、.gitignore 用同一套撤回方式，而且是逐字节还原（包括原文件末尾有没有换行）。
  - `init` 新建的文件（AGENTS.md、.gitignore），撤回后内容为空就删掉；原本存在的只去掉那一行。
  - 删除两处 Skill 目录，`.agents/skills`、`.claude/skills` 等上层目录空了也一起删（别的 skill 留着）；删除整个 `.vernier/`；如果依赖是 `init` 装的，最后用同一个包管理器卸载（`pnpm remove` / `npm uninstall` / `yarn remove` / `bun remove`）。卸载放在最后，因为运行中的命令行本身就在 `node_modules/vernierkit` 里。
- 拒绝执行：`state.json` 存在（一轮正在落地）时提示先 `finish`；`changeset.json` 里还有改动时提示先落地或让设计师在编辑层里放弃。两种情况都不改任何文件，退出码 1。
- 重复运行：没有安装记录时输出 "Vernier Kit is not installed here"，退出码 0；如果 `vernierkit` 仍是依赖（不是 `init` 装的），提示手动卸载。
- **决定：** `init` 之后被改过的行（例如 `plugins` 里又加了别的插件）不强行撤回，原样留下，在 "Finish by hand" 里写出 `init` 当时的改前 / 改后，退出码 1；其余照常撤回。
- Skill 末尾加了 "Removing Vernier Kit" 一节：何时运行 `remove`、它撤回什么、被拒绝时怎么办。
- 测试：
  - 命令行接缝 `test/install.test.ts`：init 后 remove，整个项目目录逐文件与 init 前相同；新建的 AGENTS.md / .gitignore 被删；别的 skill 保留；未落地改动、正在落地时拒绝；重复运行不报错；被改过的行给出手动步骤。
  - 主接缝 `e2e/tests/install.spec.ts`：在 08 的同一个副本上，真实的 `remove`（包括 `pnpm remove` 还原锁文件）之后 `git status --porcelain --untracked-files=all` 为空；再运行一次仍为空、不报错。

**审查后的修正（2026-10-27）**

- 有行要手动撤回时，输出不再同时声称"全部撤回"，改为"除下面这些行外都已撤回"。
- 包管理器在 08 的修正里收进 `COMMANDS` 表。只有 pnpm 的卸载在 e2e 里验证过锁文件逐字节还原；npm、yarn 的卸载在命令行接缝里只断言命令本身。
