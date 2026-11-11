# 24: Agent 验收：安装

**What to build:** Agent 验收的后一半：安装验收。包发布到 npm 之后，Claude（Sonnet 5.5，effort medium；原定 high，设计师 2026-11-05 改，和 88 一致）和无头 pi（DeepSeek v4.1 flash，command-code）各在 10 个全新项目里，从 README「For Agents」那一节的四步原文开始安装（`npx -y humantouch@latest init`，不拿本地打的包代替），确认切换按钮出现，再运行 `remove`。落地的那一半（原来这张 ticket 的标准场景部分）移到 ticket 88。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准（「Light」「Reversible」），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 88、91；包已发布到 npm（设计师自己操作，发布前把 GitHub 仓库设为公开）

**Status:** ready-for-human

- [ ] 跑之前先问设计师：2 家 × 10 个项目 = 20 次安装，估计用时；设计师同意了再跑
- [ ] 10 个全新项目覆盖常见的起点，每个都用官方脚手架现建，不复用：Vite + React（TypeScript、JavaScript 各一）、Next.js App Router（Turbopack 默认、webpack 各一，有 `src/` 和没有各一）；包管理器 npm、pnpm、yarn、bun 都有；样式 Tailwind v4、Tailwind v3、CSS Modules、普通 CSS 都有；React 18 至少一个。具体十个由这条线列出来，跑之前给设计师看
- [ ] 每次安装：从 Agent 收到「For Agents」的四步到切换按钮出现 ≤ 60 秒，全程没有人插手；`doctor` 全部 ✓；用户源码只改 ≤ 2 处（构建配置 1 行 + 挂载 1 行，goals「Light」）
- [ ] 第 3 步：Agent 开不了浏览器时（无头跑就是这样），照样装完，最后告诉设计师下次打开页面右下角应有一个圆形按钮。切换按钮在不在由测量台用无头浏览器确认，不以 Agent 自报为准
- [ ] 2 家 × 10 个项目 100% 成功；没成功的，记下卡在哪一步、为什么
- [ ] 每个项目装完再 `remove`：`git diff` 为空，没有留下文件（goals「Reversible」）
- [ ] 结论记在 Comments：要不要改 README / For Agents 的措辞，要改的另开 ticket（编号在 main 上取）
- [ ] Cursor、Codex 不在这次验收里；goals 不改（以后有额度再验）

## 设计师决定（2026-11-03，重新分诊）

- Agent 验收拆开：先跑落地验收（ticket 88），再发布到 npm（设计师自己操作），最后跑安装验收（本 ticket）。理由：落地验收不依赖发布，可能要改 Skill 措辞，改好再发布第一版；安装验收要照 For Agents 原文，第 1 步只有发布后才跑得通。
- 这次只验 Claude（Sonnet，medium）和无头 pi（command-code 的 DeepSeek v4.1 flash）：Cursor 没有额度。docs/goals.md 不改：Codex、Cursor 以后还要验，这次不算偏离。
- 测量台接上 pi 在 ticket 85，标准场景补全在 86、87，安装验收的测量台（命令名单、计时、判成功的办法）在 91。

## Comments

**ticket 70 改名（2026-11-01，第三步）**：已查，无旧名（旧产品名、命令、包名、文件夹名和 vk 前缀，不分大小写地查过）。

**重新分诊前的验收项（2026-11-03 之前）**：原来的 Blocked by 是 07, 09, 14, 16, 17, 18, 19, 20, 21, 22, 26, 27, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 50，都已完成。原来的标准场景、三家 Agent 落地、1:1 落地率、设计变量使用率、工具调用次数、Skill 措辞和截图的结论，移到 ticket 88；安装和 remove 两项留在这里。

## 设计师决定（2026-11-05，effort）

- Claude 用 effort medium，pi 照旧 `--thinking high`，和 ticket 88 的真实跑一致（88 代定第 4 条）。安装测量台和落地测量台共用 Claude 的设置，88 已经改成 medium，不用另配。
- 考虑过的别的做法：24 改回 high，为安装验收另配一份设置。
