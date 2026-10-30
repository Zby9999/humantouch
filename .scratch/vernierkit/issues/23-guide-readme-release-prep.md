# 23: 发布前的打包检查

**What to build:** 确认包可以发布到 npm（不实际发布）：包内容完整，不含示例项目与测试文件。Guide 原本也在本 ticket，但它要放在 README 上，所以与 README、MIT 许可一起移到了 59；下面 Comments 里的 Guide 草稿留给 59 用。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 08, 09

**Status:** done

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

**按 code-review 修正打包检查与 Guide 草稿（2026-10-29）**

- `package.spec.ts`：
  - 整个文件只打一次包：`test.describe.configure({ mode: "default" })`，在 `fullyParallel` 下也按顺序跑在同一个 worker 里（之前 5 个 worker 各 `pnpm pack` 一次）。没用 `serial`：这几条检查互不依赖，一条失败不该跳过其余几条。
  - 解包目录改名 `unpacked`，读包内文件收成一个 `read(file)`；删掉匹配不到任何文件的 `.d.cts` 条件（`.d.cts` 本来就不匹配 `\.tsx?$`）。
  - "不含 `workspace:`" 那条在 `pnpm pack` 下永远不会失败（它会改写 `workspace:`），改成：dependencies 与 peerDependencies 的每一项都是 registry 能解析的 semver 范围（不是 `workspace:`、`file:`、`link:`、git、URL 或 dist-tag）。临时把 `magic-string` 改成 `github:…` 时这条失败。
  - 相对引入：ES 模块里补上副作用引入（`import"./x.js"`、`import "./x.js"`），`.cjs` 里查 `require("./…")`；`.cjs` 只查 `require`，因为 next-loader.cjs 内联的 babel 里有像 `from "./module"` 的字符串。三种写法临时加到 dist 里时都失败。
  - 新增：dist 里的裸引入（去掉 Node 内置模块，tsup 输出时去掉了 `node:` 前缀，所以按 `builtinModules` 判断）都在发布出的 dependencies 或 peerDependencies 里；cli.js 字符串里的 `vernierkit/vite` 等按自引用处理，要求是 `exports` 里的子路径。按实际 dist，裸引入只有 `@babel/parser`（cli/vite/next 三份）、`magic-string`（vite.js）和 `react`（react.dev.js）；vite、next 只在类型里，next-loader.cjs 已内联 babel，只 require 了 `path`。临时加一个 `import "left-pad"` 时这条失败，`node:fs` 不误报。
  - README/LICENSE 白名单改成 npm 总会打进包的规则（npm-packlist：根目录的 `package.json`，以及 `readme`、`copying`、`license`、`licence` 加任意扩展名，大小写不敏感），注释里写明是 npm 的行为。临时放 `README.md`、`license` 时通过，`files` 里加 `CHANGELOG.md` 时失败。
  - 测试标题不再说 "as npm would publish it"。
- Guide 草稿对照 `install.ts` 改了：
  - `init` 打出 "Finish by hand" 后还有一行 "Then run `npx vernierkit doctor`."（install.ts:288），所以写 "If it prints"；`init` 从 stderr 报错退出（装不上依赖让人装好后重跑 init、找不到 package.json、不是 React 项目、不是 Vite 或 Next.js 16+）时，照报错做，做不到就告诉设计师。
  - 开发服务器用 `init` 打出的命令（install.ts:291 的 `${script} dev`，如 `npm run dev`、`pnpm dev`）；要手动完成时 `init` 不打这条命令，就用项目自己的 `dev` 脚本。
  - `remove` 遇到 `init` 加的行之后被改过（或卸载依赖失败）时，打出 "Finish by hand" 并以 1 退出（install.ts:369、:393、:396–399）；照做之后 `git diff` 里不再有 Vernier Kit 的东西（项目自己后来的改动当然还在）。
  - "layers I set aside off the canvas" 改用 GLOSSARY 的 "off-canvas layers"；其余用词（editor layer、toggle、design changes、applying a round）对过 GLOSSARY，没有用到 _Avoid_ 里的词。
- 新草稿按原文走过一遍（临时目录、`npm create vite@latest -- --template react-ts`、本地 tgz）：`init` 打出 `npm run dev`，开发服务器起来后 headless 浏览器里切换按钮在右下角、点开进得了编辑模式、控制台无报错，开发服务器运行中 doctor 全部 ✓；`remove` 后 `git status` 为空。另外验证了：先改过 vite.config.ts 里 `init` 加的那行再 `remove`，打出 "Finish by hand" 并退出 1，照做后 `git diff` 里只剩项目自己的那处改动；去掉 vite.config.ts 时 `init` 打出 "Finish by hand"、不打开发服务器命令；空目录里 `init` 从 stderr 报 "No package.json…" 并退出 1。

Guide 草稿（取代上面那份）：

> Install Vernier Kit, an editor layer for this project's dev server, so I can edit the page and hand you the changes:
>
> 1. In the project's root folder, run `npx -y vernierkit@latest init`. If it prints "Finish by hand", make those edits. If it stops with an error instead, do what the error says; if you cannot, tell me why.
> 2. Start the dev server with the command `init` printed (if it printed none, the project's own `dev` script) and leave it running.
> 3. Open the page it serves and confirm the Vernier Kit toggle is at its bottom right: a round button named "Vernier Kit: enter edit mode". If you cannot open a browser, ask me to look.
> 4. Run `npx vernierkit doctor`. Fix whatever it marks ✗ and run it again, until it says "All good."
>
> To remove Vernier Kit, run `npx vernierkit remove` in the project's root folder. It takes out everything `init` added and deletes `.vernier/`, with any off-canvas layers, leaving `git diff` empty. If it prints "Finish by hand" (lines `init` added were changed since), make those edits too; then nothing of Vernier Kit is left in `git diff`. It refuses while I have design changes not applied yet, or while you are applying a round.

**Guide 移到 59（2026-10-30）**

- 用户决定：Guide 的两条验收项（让 Agent 在 Vite 与 Next.js 项目上独立完成安装、说明用 remove 卸载）移到 59，与 README、MIT 许可一起做；本 ticket 只剩打包检查，标 done。
- 原因：GLOSSARY 说 Guide 放在项目官网或 README 上，README 在 59，而 59 又被 23 阻塞，两张互相卡住。
