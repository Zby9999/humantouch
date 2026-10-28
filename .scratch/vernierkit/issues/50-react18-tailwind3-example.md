# 50: React 18 + Tailwind v3 示例项目

**What to build:** 新增第三个示例项目：Vite + React 18 + Tailwind v3。它的 Tailwind 配置中自定义了颜色、间距、圆角、字号等主题值以及断点，页面上用到这些主题值和断点前缀（如 md:）。编辑层在这个项目上全链路可用：冻结、使用链读取、编辑、改动单、`claim` / `done`。它供 14 读取 Tailwind v3 配置、38 读取 Tailwind v3 断点、22 做兼容与性能测试时使用，不必各自另建。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] 示例项目使用 React 18 与 Tailwind v3，主题中有自定义的颜色、间距、圆角、字号与断点，页面上用到了它们
- [x] e2e 中加入这个项目的开发服务器（端口随 `VK_E2E_PORT` 偏移，不与已有端口冲突），并有覆盖一轮的端到端测试：进入编辑模式、改一处、`claim`、`done` 核对通过
- [x] 在 React 18 上读出的使用链与 React 19 示例一致；不一致处在本 ticket 中修好
- [x] 已有示例项目的测试全部通过
