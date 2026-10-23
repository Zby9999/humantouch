# 22: 兼容性与性能基线

**What to build:** 新增 Vite + React 18 + Tailwind v3 示例项目，已有端到端测试全部通过；用约 3000 个元素的大页面建立性能基线：进入编辑模式耗时与拖拽帧率。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 15

**Status:** ready-for-agent

- [ ] React 18 + Tailwind v3 示例项目上全链路测试通过（含使用链读取与设计变量读取）
- [ ] 大页面上进入编辑模式 < 300ms
- [ ] 大页面上拖拽保持 60fps
- [ ] 性能测试可重复运行，结果记录在 Comments 中
