# 23: Guide 与发布前的打包检查

**What to build:** 写好几行字的 Guide（运行 init、启动开发服务器、确认切换按钮出现、运行 doctor），并说明如何用 remove 卸载；确认包可以发布到 npm（不实际发布）。README 与 MIT 许可已拆到 59，暂时搁置，本 ticket 不写。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 08, 09

**Status:** ready-for-agent

- [ ] Guide 足够让一个 Agent 在 Vite 与 Next.js 项目上独立完成安装
- [ ] Guide 说明如何用 remove 一条命令卸载
- [ ] 打包检查通过：包内容完整、不含示例项目与测试文件
