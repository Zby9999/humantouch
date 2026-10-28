# 22: 兼容性与性能基线

**What to build:** 在 50 的 React 18 + Tailwind v3 示例项目上，已有端到端测试全部通过；用约 5000 个元素的大页面建立并达成 docs/goals.md 中的 Flex 性能指标：进入编辑模式 ≤ 150ms、改数值到画面变化 ≤ 1 帧、拖拽 60fps。当前进入编辑模式的标准是 02 时定的 300ms，达不到新指标时在本 ticket 中优化。

性能指标要在设计师的电脑上、用有窗口的 Google Chrome 测：e2e 用的 headless shell 没有 GPU 合成，也不跟屏幕刷新同步，测出的耗时和帧率不代表真实体验。有窗口的 Chrome 会抢走设计师的焦点，所以性能测试与 e2e 分开运行，跑之前先问设计师，挑设计师不用电脑的时候跑。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 15, 36, 50

**Status:** ready-for-agent

- [ ] React 18 + Tailwind v3 示例项目上全链路测试通过（含使用链读取与设计变量读取）
- [ ] 大页面上、三个视图同时显示时，进入编辑模式 ≤ 150ms
- [ ] 大页面上改数值到画面变化 ≤ 1 帧
- [ ] 大页面上拖拽保持 60fps
- [ ] 性能测试在有窗口的 Google Chrome 中运行，单独启动，`pnpm test:e2e` 不会带起它
- [ ] 性能测试可重复运行，结果记录在 Comments 中
