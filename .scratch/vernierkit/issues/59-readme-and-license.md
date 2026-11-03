# 59: README、Guide 与 MIT 许可

**What to build:** README 面向设计师介绍产品与一轮的使用流程，并在上面放好几行字的 Guide（运行 init、启动开发服务器、确认切换按钮出现、运行 doctor），说明如何用 remove 卸载；仓库加入 MIT 许可。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 23（已完成）、70（已完成）

**Status:** ready-for-agent

- [ ] README 用英文，面向设计师：03Kind 是什么、适用的项目（以 spec 为准，只写已支持的）、一轮的流程（预览 → 编辑 → 让 Agent 落地 → 看报告）。用词以 GLOSSARY.md 为准，界面上的字照编辑层实际显示的写
- [ ] GitHub 仓库首页和 npm 的包页面显示同一份 README，只维护一份（例如打包时复制进包里），`pnpm pack` 打出的包里有它
- [ ] README 上的 Guide 以 23 里第二版草稿为底，第 3 步照下面「设计师决定」改：Agent 能开浏览器就自己确认切换按钮，开不了就照样装完，最后告诉设计师下次打开页面时看右下角，不停下来等人
- [ ] Guide 足够让一个 Agent 在 Vite 与 Next.js 项目上独立完成安装：用本地打的包，在临时目录的全新 Vite 与 Next.js 项目里，照 Guide 的最终文字一步步走通 init → 开发服务器 → `doctor` 全部 ✓，再走 remove 后 `git diff` 为空；切换按钮用 headless 浏览器确认。不跑真实 Agent，真实 Agent 的安装验收在 24
- [ ] 说明如何用 `npx 03kind remove` 一条命令卸载，和 `remove` 的实际输出一致
- [ ] 仓库根目录加 MIT 许可证 LICENSE，版权行为 `Copyright (c) 2026 Zby9999`；`pnpm pack` 打出的包里也有 LICENSE
- [ ] 旧名检查通过；README 和 Guide 里出现的命令、按钮名、文件夹名都对照代码核过

## 背景

- 原是 23 的一部分。用户决定（2026-10-29）先搁置，不着急写，所以拆出来，等用户决定什么时候做。
- Guide 原也在 23。GLOSSARY 说 Guide 放在项目官网或 README 上，README 在本 ticket，所以用户决定（2026-10-30）把 Guide 也移到这里。23 的 Comments 里有一份 Guide 草稿，已对照 `init`、`remove` 的实际输出改过，并在临时目录的全新 Vite 与 Next.js 项目里用本地打的包走通（Next.js 只按第一版草稿跑过）。
- 开始前要问用户：README 用中文还是英文，许可证上署谁的名字。
- 草稿第 3 步写"打不开浏览器就请设计师看一眼"，与 24 的安装验收"无需人工介入"冲突，写 Guide 时一并考虑。

## 设计师决定（2026-11-03，分诊）

- README 用英文：要发布到 npm、在 GitHub 公开，读的人大多看英文；Guide 是复制给 Agent 的，草稿本来就是英文、按英文走通；编辑层界面上的字也是英文。中文版等有中文用户再加。
- 许可证署 GitHub 用户名 `Zby9999`，不署真名。
- Guide 第 3 步不再「打不开浏览器就请我看一眼」：Agent 能开浏览器就自己确认切换按钮；开不了就照样装完，最后告诉设计师下次打开页面时右下角应该有个圆形按钮，没有就告诉它。装得对不对由第 4 步的 `doctor` 查。这样 24 的「无需人工介入」照原样，不用改。
- 字标、字体之后再定，本 ticket 不做。

## Comments

**改名为 03Kind（2026-11-01，ticket 70 第三步）**：已查，无旧名（旧产品名、命令、包名、文件夹名和 vk 前缀，不分大小写地查过）。
