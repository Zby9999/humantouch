# 70: 改名为 03Kind

**What to build:** 产品从 Vernier Kit 改名为 03Kind（口头叫 Third Kind，中文叫「第三类」），设计师、Agent 和开发者能看到的地方一次改完，行为不变：

- **包与命令**：npm 包名 `03kind`，命令 `npx 03kind init`、`doctor`、`remove`、`claim`、`done`、`finish`、`last`；子路径 `03kind/vite`、`03kind/next`、`03kind/react`。
- **写进用户项目的代码**：JS 标识符不能以数字开头，所以 Vite 插件叫 `thirdKind()`，Next.js 包装叫 `withThirdKind()`，React 组件叫 `<ThirdKind />`。`init` 写进构建配置和挂载处的就是这几个名字。
- **写进用户项目的文件**：项目里的文件夹 `.vernier/` 改为 `.03kind/`，`.gitignore` 那一行随之改；Skill 放在 `03kind` 目录、名字叫 `03kind`；AGENTS.md 那一行以「03Kind:」开头。
- **页面上**：宿主元素 `<third-kind>`；编辑层界面的 CSS 类 `tk-`、CSS 变量 `--tk-`；写进页面和画布的属性 `data-tk-*`；浏览器本地存储的键以 `03kind:` 开头。
- **开发与测试**：环境变量 `VK_*` 改为 `TK_*`（如 `TK_E2E_PORT`、`TK_PERF_PORT`、`TK_PERF_HEADLESS`）；仓库里的包目录和 monorepo 的名字随之改。
- **文档**：描述现状的文档（GLOSSARY、spec、goals、roadmap、AGENTS.md、Skill、改动说明、命令输出、23 与 59 里的 Guide 草稿）里的产品名都改为 03Kind。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 22, 60, 61, 62, 63, 64, 65, 66, 67, 68

**Status:** ready-for-agent

- [ ] 上面列出的名字全部改完；除 ADR、已完成 ticket 和 git 历史外，仓库里不再有 `vernier`、`Vernier`、`vk-`、`--vk-`、`data-vk-`、`VK_` 字样，用一条检查固定下来，防止以后写回旧名
- [ ] 全量 typecheck、单测、e2e 通过，测试数量不少于改名前；设计师看到的行为、改动单的内容不变
- [ ] 打包检查用新包名通过，包里的命令叫 `03kind`；切换按钮体积仍 ≤ 10KB
- [ ] 在临时目录的全新 Vite 与 Next.js 项目里，用本地打的包走一遍 `init` → 开发服务器 → 切换按钮出现 → `doctor` 全部 ✓ → `remove` 后 git diff 为空
- [ ] Claude Code 与 Cursor CLI 都能认出名为 `03kind` 的 Skill；有一家不接受以数字开头的 Skill 名时，Skill 改叫 `third-kind`，并在 Comments 写明
- [ ] 不改的部分写在 Comments：ADR 和已完成的 ticket 是历史记录，保留原名；`.scratch/vernierkit/` 是内部的 ticket 目录，不改名

## 背景

- 用户决定（2026-10-30）：我们的工作方式是纯设计软件、装了 Agent 的设计软件之外的第三类，即装进 Agent 的设计工具，取「第三类」之意，名字带量产代号的感觉。03Kind 就是「第三类」，避开了 Type 03 在设计圈里容易被当成字体的问题。
- 包名 `03kind` 在 npm 上没人用；whois 查 `03kind.com` 没有注册。商标还没查。
- 还没发布、没有外部用户，所以不做旧名的兼容和迁移；本地示例项目里存着的旧画布会失效。
- 改名几乎动到整个仓库，所以等编辑层线（22、60、61、62）和落地线（63–68）都合进 main 后再做；60 会改编辑样式在画布上的存法，`data-vk-rules` 一类属性正在其中。必须在 59（README）和发布到 npm 之前完成。
- GitHub 仓库已于 2026-10-30 改名为 `Zby9999/03kind`（私有），本地的 origin 已指向新地址；旧地址由 GitHub 重定向。本 ticket 里出现仓库地址的地方（如 package.json 的 repository，若有）用新地址。
