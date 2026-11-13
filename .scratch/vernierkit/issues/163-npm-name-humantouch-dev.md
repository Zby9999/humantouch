# 163: 包在 npm 上叫 humantouch-dev

**What to build:** 包在 npm 上的名字从 `humantouch` 改成 `humantouch-dev`。npm 拒绝发布 `humantouch`：它和已有的 `human-touch`（一个把 AI 写的文字改得像人写的小工具，与本产品无关）太像（2026-11-13 第一次发布时的 403）。设计师 2026-11-13 选了 `humantouch-dev`，和网站 human-touch.dev 对得上，不用建 npm 组织。

变的只有包名：

- 安装：`npx -y humantouch-dev@latest init`。`init` 装的、`remove` 卸的、`doctor` 查的依赖都是 `humantouch-dev`。
- 用户代码里的引入：`humantouch-dev/vite`、`humantouch-dev/next`、`humantouch-dev/react`，Next 的 loader 是 `humantouch-dev/next-loader`；`init` 写的、`doctor` 和 `remove` 认的都是这些。
- Vite 插件的 `optimizeDeps.exclude` 写新包名。

不变的：命令名还是 `humantouch`（`npx humantouch claim / done / finish / last / doctor / remove`），Skill 叫 humantouch，文件夹 `.humantouch/`，产品名 Human Touch，仓库 Zby9999/humantouch。

**Blocked by:** None. 发布前做（第一次发布被拒之后）。

**Status:** done

- [x] 包名、示例项目和网站的依赖、`init` / `doctor` / `remove` 的包名和引入路径、README 和网站的安装命令都改成 `humantouch-dev`。
- [x] 测试跟着改：install.test.ts、install / next-install / package e2e、bench 的允许名单和 `node_modules/humantouch-dev` 的路径。
- [x] `npm publish --dry-run` 不再删掉 bin（`./dist/cli.js` 改成 `dist/cli.js`，npm 11 发布时会删掉前一种写法）。

## Comments

**规划会话，2026-11-13**

设计师在对话里定的名字，我直接改（"帮我做吧"）。ADR、done 的票和 bench 的录像（fixtures 里的旧对话）照旧写 `humantouch`，它们是当时的记录。
