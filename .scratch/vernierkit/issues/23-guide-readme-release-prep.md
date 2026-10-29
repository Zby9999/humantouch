# 23: Guide 与发布前的打包检查

**What to build:** 写好几行字的 Guide（运行 init、启动开发服务器、确认切换按钮出现、运行 doctor），并说明如何用 remove 卸载；确认包可以发布到 npm（不实际发布）。README 与 MIT 许可已拆到 59，暂时搁置，本 ticket 不写。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 08, 09

**Status:** ready-for-agent

- [ ] Guide 足够让一个 Agent 在 Vite 与 Next.js 项目上独立完成安装
- [ ] Guide 说明如何用 remove 一条命令卸载
- [x] 打包检查通过：包内容完整、不含示例项目与测试文件

## Comments

**实现记录（2026-10-29）**

- 打包检查：`e2e/tests/package.spec.ts`，在 e2e 里用 `pnpm pack` 打出发布时的包、解开后断言：
  - 不是 private，dependencies / peerDependencies 里没有 `workspace:`；
  - `bin` 和 `exports` 指向的每个文件（含三个 `types`）都在包里，`skill/SKILL.md` 也在（`init` 从这里复制 Skill）；
  - 打出的 ES 模块从同目录引入的文件都在包里（共享 chunk，以及第一次进入编辑模式才加载的 `editor.dev.js`）；
  - 包里只有 `dist/`、`skill/` 和 npm 总会打进去的 `package.json`（以后加上的 README、LICENSE 也允许），`dist/` 里没有测试、fixture 或 `.ts` 源码。
- `npm pack --dry-run`：19 个文件，`dist/*`（含 sourcemap，约 1.3MB 的 `.map`，带 `sourcesContent`）、`skill/SKILL.md`、`package.json`；打包 636.5 kB，解开 2.3 MB。
- `npm view vernierkit`：404，包名未被占用（`vernier-kit` 也是 404）。
- **Guide 还没有放进仓库：** GLOSSARY 说 Guide 放在项目官网或 README 上，而 README 拆到了 59、目前没有官网，spec 和代码里也没有别处指明它的位置。下面是草稿，等用户决定放在哪里。
- 草稿已按原文验证过（临时目录、全新项目、本地打的 tgz 代替 `vernierkit@latest`，用 `VERNIERKIT_INSTALL_FROM` 让 `init` 装这个 tgz）：
  - Vite（`npm create vite@latest -- --template react-ts`，npm）：init 约 4 秒，`npm run dev` 后 headless 浏览器里右下角出现切换按钮、点开能进编辑模式，doctor 全部 ✓，项目自己的 `npm run build`（`tsc -b`）也通过；`remove` 后 `git status` 为空（npm 的 package-lock.json 也逐字节还原）。
  - Next.js 16.4（`create-next-app@latest --yes --use-pnpm`，Turbopack、Tailwind v4，模板自带 AGENTS.md）：init 约 3 秒，`pnpm dev` 后切换按钮出现、能进编辑模式，开发服务器运行中跑 doctor 全部 ✓；`remove` 后 `git status` 为空（AGENTS.md 只去掉那一行）。

Guide 草稿：

> Install Vernier Kit, an editor layer for this project's dev server, so I can edit the page and hand you the changes:
>
> 1. In the project's root folder, run `npx -y vernierkit@latest init`. If it ends with "Finish by hand", make those edits.
> 2. Start the project's dev server (such as `npm run dev`) and leave it running.
> 3. Open the page it serves and confirm the Vernier Kit toggle is at its bottom right: a round button named "Vernier Kit: enter edit mode". If you cannot open a browser, ask me to look.
> 4. Run `npx vernierkit doctor`. Fix whatever it marks ✗ and run it again, until it says "All good."
>
> To remove Vernier Kit, run `npx vernierkit remove` in the project's root folder. It takes out everything `init` added and deletes `.vernier/`, with any layers I set aside off the canvas, leaving `git diff` empty. It refuses while I have design changes not applied yet, or while you are applying a round.

**去掉 source map（2026-10-29）**

- 用户决定发布包里不带 source map。`tsup.config.ts` 的浏览器端构建不再生成 source map（34 加的 `sourcemap: true` 去掉），仓库里的示例和发布包用的是同一份 `dist/`。没有只在 `files` 里排除 `.map`：那样打出的 js 末尾仍有 `//# sourceMappingURL=…`，在全新 Vite 项目里实测开发服务器会报 "Failed to load source map … ENOENT"。
- `package.spec.ts` 加一条：包里没有 `.map`，也没有 js/cjs 带 `sourceMappingURL` 注释。
- `npm pack --dry-run` 现在 15 个文件：打包 264.8 kB，解开 1.0 MB（之前 636.5 kB / 2.3 MB）。全新 Vite 项目（本地 tgz）里切换按钮出现、进得了编辑模式，开发服务器和浏览器控制台都没有 source map 警告，doctor 全部 ✓。
- 代价：在浏览器开发者工具里看到的是压缩后的编辑层代码，仓库里调试也一样；需要时临时在 `tsup.config.ts` 打开 `sourcemap` 再构建。
