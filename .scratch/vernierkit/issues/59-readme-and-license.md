# 59: README、Guide 与 MIT 许可

**What to build:** README 面向设计师介绍产品与一轮的使用流程，并在上面放好几行字的 Guide（运行 init、启动开发服务器、确认切换按钮出现、运行 doctor），说明如何用 remove 卸载；仓库加入 MIT 许可。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 23（已完成）、70（改名为 03Kind）

**Status:** needs-triage

- [ ] README 面向设计师说明一轮的流程（预览 → 编辑 → 让 Agent 落地 → 看报告）
- [ ] README 上的 Guide 足够让一个 Agent 在 Vite 与 Next.js 项目上独立完成安装
- [ ] 说明如何用 remove 一条命令卸载
- [ ] 包含 MIT 许可

## 背景

- 原是 23 的一部分。用户决定（2026-10-29）先搁置，不着急写，所以拆出来，等用户决定什么时候做。
- Guide 原也在 23。GLOSSARY 说 Guide 放在项目官网或 README 上，README 在本 ticket，所以用户决定（2026-10-30）把 Guide 也移到这里。23 的 Comments 里有一份 Guide 草稿，已对照 `init`、`remove` 的实际输出改过，并在临时目录的全新 Vite 与 Next.js 项目里用本地打的包走通（Next.js 只按第一版草稿跑过）。
- 开始前要问用户：README 用中文还是英文，许可证上署谁的名字。
- 草稿第 3 步写"打不开浏览器就请设计师看一眼"，与 24 的安装验收"无需人工介入"冲突，写 Guide 时一并考虑。

## Comments

**改名为 03Kind（2026-11-01，ticket 70 第三步）**：已查，无旧名（旧产品名、命令、包名、文件夹名和 vk 前缀，不分大小写地查过）。
