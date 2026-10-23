# 23: Guide、README 与发布准备

**What to build:** 写好几行字的 Guide（运行 init、启动开发服务器、确认切换按钮出现、运行 doctor），README 介绍产品与使用流程，加入 MIT 许可，确认包可以发布到 npm（不实际发布）。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 08, 09

**Status:** ready-for-agent

- [ ] Guide 足够让一个 Agent 在 Vite 与 Next.js 项目上独立完成安装
- [ ] README 面向设计师说明一轮的流程（预览 → 编辑 → 让 Agent 落地 → 看报告）
- [ ] 包含 MIT 许可
- [ ] 打包检查通过：包内容完整、不含示例项目与测试文件
