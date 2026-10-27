# 31: remove：一条命令完整卸载

**What to build:** Agent 运行 `npx vernierkit remove`，撤回 `init` 所做的全部修改（构建配置、挂载、开发依赖、Skill、AGENTS.md 中的一行、.gitignore 中的一行），并删除 `.vernier/`；执行后 git diff 为空。有未落地的改动或正在落地的一轮时拒绝执行，并提示先落地或放弃。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] 在示例项目副本上 init 后再 remove，git diff 为空
- [ ] init 时 AGENTS.md 是新建的，remove 后它被删除；原本存在的，只移除那一行
- [ ] 有未落地的改动或一轮正在落地时，remove 拒绝执行并说明原因
- [ ] 重复运行 remove 不报错
- [ ] Skill 与 Guide 提到 remove
