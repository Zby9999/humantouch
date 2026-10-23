# 08: init 与 doctor（Vite）

**What to build:** 在一个干净的 Vite + React 项目中，Agent 运行 `npx vernierkit init` 即一次装好：识别框架与包管理器、装为开发依赖、构建配置加一行插件、根组件挂载编辑层组件、把 Skill 放进项目并在 AGENTS.md 中加一行指向、忽略 `.vernier/`。`doctor` 检查安装是否完整，并确认正式构建产物中没有编辑层代码。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] 在未安装的示例项目副本上运行 `init` 后，启动开发服务器即可看到切换按钮
- [ ] Skill 同时放入项目的 .agents/skills 与 .claude/skills 位置，AGENTS.md 中出现指向它的一行（AGENTS.md 不存在时创建）
- [ ] `.vernier/` 被加入 .gitignore
- [ ] 自动修改配置失败时，`init` 输出清晰的手动步骤
- [ ] 重复运行 `init` 不会产生重复修改
- [ ] `doctor` 报告各项安装状态，并跑一次正式构建确认零残留
- [ ] 从零开始到看到切换按钮的全过程可在 5 分钟内完成
