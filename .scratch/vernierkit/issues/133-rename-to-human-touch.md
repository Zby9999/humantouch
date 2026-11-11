# 133: 改名为 Human Touch

**What to build:** 产品从 03Kind 改名为 Human Touch。设计师、Agent 和开发者能看到的地方一次改完，页面内部的名字也一起改，行为不变。做法和 ticket 70（Vernier Kit → 03Kind）一样，可以照它分三步。

设计师的理由（2026-11-11）：这个名字更形象，突出我们的调性：AI 加速的同时，人类设计师可以介入微调。

新名字（设计师 2026-11-11 定了包名和范围）：

- **包与命令**：
  - npm 包名 `humantouch`。`human-touch` 已经有人用了，是一个把 AI 文字改得像人写的工具，容易混淆。
  - 命令：`npx humantouch init`、`doctor`、`remove`、`claim`、`done`、`finish`、`last`。
  - 子路径：`humantouch/vite`、`humantouch/next`、`humantouch/react`、`humantouch/next-loader`。
  - 仓库里的包目录用 `git mv`，保留历史：`packages/03kind` → `packages/humantouch`。monorepo 名 `humantouch-monorepo`。
- **写进用户项目的代码**：
  - Vite 插件 `humanTouch()`；
  - Next.js 包装 `withHumanTouch()`；
  - React 组件 `<HumanTouch />`。
- **写进用户项目的文件**：
  - 文件夹 `.03kind/` → `.humantouch/`，`.gitignore` 那一行跟着改；
  - Skill 放在 `.agents/skills/humantouch`、`.claude/skills/humantouch`，名字叫 `humantouch`；
  - AGENTS.md 那一行以「Human Touch:」开头。
- **页面上**：
  - 宿主元素 `<human-touch>`；
  - CSS 类前缀 `tk-` → `ht-`，CSS 变量 `--tk-` → `--ht-`；
  - 属性 `data-tk-*` → `data-ht-*`；
  - 本地存储键、性能标记、事件，`03kind:` → `humantouch:`；
  - 其余内部名照同样的规则改：`__THIRD_KIND__`、`__THIRD_KIND_CODE__`、`X-03Kind-Token`、`virtual:03kind/code-updates`、CSS layer 名等，以及 `doctor` 查正式构建残留的那份列表（它要和这些名字一起改）。
- **开发与测试**：
  - 环境变量 `TK_*` → `HT_*`（`HT_E2E_PORT`、`HT_BENCH_PORT`、`HT_PERF_PORT`、`HT_PERF_HEADLESS` 等）；
  - 临时目录前缀 `03kind-*` → `humantouch-*`；
  - 内部文件名和标识符跟着改，比如 `third-kind-folder.ts`、`thirdKindFolder`、e2e 的 helper。
- **文档和界面文字**：
  - 描述现状的文档里，产品名都改为 Human Touch：GLOSSARY、spec、goals、roadmap、AGENTS.md、`docs/agents/`、README、Skill、改动说明、命令输出、`claim` 的说明；
  - 切换按钮的名字改为「Human Touch: enter edit mode」；
  - 还没完成的 ticket 里的命令和名字也改（103、105、111–116、128–130、24 等）。
  - README 第一段原来是 `03Kind (say "Third Kind")`，改成只写 Human Touch。
  - Skill 和其他英文文字照旧写英文。

**不改的部分：**

- 示例页面的大标题「Third Kind」保留（设计师 2026-11-11 定）。它只是示例页面的内容，拖动、缩放的测试和测量台都靠它的宽度（要宽于约 175px），很多场景的说明里也写着这个图层名。测试里把「Third Kind」当图层名或文字用的地方也不改。
- 历史记录保留原名：ADR、已完成的 ticket、`logs/`、git 历史。
- `.scratch/vernierkit/` 这个 ticket 目录照旧不改。
- GitHub 仓库名 `Zby9999/03kind` 由设计师自己改，这张票不动它，也不改 GitHub 设置。

参考 ticket 70（上次改名的做法、分步和风险）、`e2e/old-names.test.ts`，用词以 GLOSSARY.md 为准。

**Blocked by:** None. 设计师定在发布前做。

**Status:** done

- [x] 上面列出的名字全部改完。`e2e/old-names.test.ts` 加上 03Kind 的旧名：
  - 要拦的：`03kind`、`03Kind`、`ThirdKind`、`thirdKind`、`third-kind`、`THIRD_KIND`、`tk-`、`--tk-`、`data-tk-`、`TK_`，以及 70 那样的内部标识符形式；
  - 允许的：带空格的「Third Kind」（示例标题），以及历史记录。
  - Vernier 的检查照旧。
- [x] 全量 typecheck、单测、e2e 通过，测试数量不少于改名前；设计师看到的行为、改动单的内容不变。
- [x] 打包检查用新包名通过，包里的命令叫 `humantouch`。切换按钮体积仍 ≤ 10KB（10240 B），记下改前改后的字节数。名字变长了，余量要量。
- [x] `--dry` 29/29、`--scripted` 20/20。`--dry --claim-out` 和改前对比，差别只在名字上（产品名、命令、包名），列出来。
- [x] 在临时目录的全新 Vite 与 Next.js 项目里，用本地打的包走一遍：`init` → 开发服务器 → 切换按钮出现 → `doctor` 全部 ✓ → `remove` 后 git diff 为空。e2e 里已有的安装测试覆盖的，写明是哪一条。
- [x] Comments 写明不改的部分和原因。

## 规划会话的说明

- 不跑真实 Agent，不跑有窗口的 perf。
- Skill 名 `humantouch` 只有小写字母，不像 `03kind` 以数字开头，所以不再另外验证 Claude Code、Cursor 能否认出它。这是规划会话的代定。
- 中文名不定，GLOSSARY 里只写 Human Touch。这是规划会话的代定，设计师可以再定。
- 合进 main 以后，规划会话要处理两件事：
  - 示例项目里存着的旧画布 `.03kind/`，挪成 `.humantouch/`，不删；
  - 各个 worktree 要重新 `pnpm install`。

## Comments

### 做完（2026-11-11，分支 worktree-agent-a3941564ec6e76761）

照 ticket 70 分三步做，每步一个提交。

**第一步：包、命令、写进用户项目的名字（af988c12）**

- `git mv packages/03kind packages/humantouch`，历史保留。`third-kind-folder.ts` 也用 git mv 改为 `human-touch-folder.ts`。
- 包名和 bin 都叫 `humantouch`，monorepo 叫 `humantouch-monorepo`。pnpm-lock.yaml 由 `pnpm install` 重新生成。
- 写进项目的名字：`humanTouch()`、`withHumanTouch()`、`<HumanTouch />`，文件夹 `.humantouch/`，Skill `humantouch`，AGENTS.md 那一行以「Human Touch:」开头。
- 命令输出、Skill 正文、README、examples 的配置、e2e 的 helper（如 `npxHumanTouch()`、`readHumanTouchFile()`、`HUMAN_TOUCH_FOLDER`）、测量台的放行命令、录下的 pi 记录，都跟着改。
- README 第一段去掉了「say "Third Kind"」，只写 Human Touch。
- 仓库地址：设计师 2026-11-11 把 GitHub 仓库改名为 `Zby9999/humantouch`，规划会话转告后，package.json 的 `repository.url` 改为 `git+https://github.com/Zby9999/humantouch.git`。别处没有写旧仓库地址（ADR、已完成的 ticket 除外）。这和上面「不改的部分」原先写的「仓库名由设计师自己改，这张票不动」不同，以这次为准。没有动 git remote，也没有动 GitHub 设置。

**第二步：页面里和开发用的名字（56738e45、e4b5751f）**

- 宿主元素 `<human-touch>`，CSS 类 `ht-`，CSS 变量 `--ht-`，属性 `data-ht-*`。
- 存储键、性能标记、事件改为 `humantouch:`。另有 `__HUMAN_TOUCH__`、`__HUMAN_TOUCH_CODE__`、`X-Human-Touch-Token`、`virtual:humantouch/code-updates`、CSS layer `human-touch-edits`。
- `doctor` 查正式构建残留的列表改为 `human-touch`、`data-ht-`、`__HUMAN_TOUCH__`。
- 环境变量 `TK_*` 改为 `HT_*`，`VITE_TK_WRITE_FIXTURE` 改为 `VITE_HT_WRITE_FIXTURE`。临时目录前缀改为 `humantouch-*`。
- 测试里的标识符跟着改：`htSeen`、`__htDraw`、`__HT_BENCH` 等。
- e4b5751f 是补漏。第一次按词边界替换，漏了正则里 `\b` 后面的 `tk-ping`，也漏了 `VITE_` 后面的 `TK_`。全量 e2e 的 breakpoints.spec 因此失败。补上后，旧名检查也改成不靠词边界找这两种前缀。
- e2e 的 fixture `round-before-60/` 里的 `data-tk-*` 也改了。代码要读这些属性，不改就读不到。

**第三步：文档、还没完成的 ticket、旧名检查、本记录（10b6cf1f 和本提交）**

- 改了 GLOSSARY、AGENTS.md、goals.md、两份 spec，以及 24、103、105、111–116 里的命令和名字。roadmap、`docs/agents/`、128–130 里没有旧名。
- GLOSSARY 第一段改写：产品名 Human Touch，包和命令 `humantouch`，JS 标识符和元素名照上面写。旧名只写「见 ticket 70、133」，正文不写出来，否则旧名检查会拦。
- 24 里 70 那条记录的标题原是「改名为 03Kind（…）」，改成「ticket 70 改名（…）」，内容不动。
- `e2e/old-names.test.ts`：
  - Vernier 那一套照旧，23 的 Guide 草稿照旧要查。
  - 新加 03Kind 这一套：`03kind` 不分大小写，`ThirdKind`、`thirdKind`、`third-kind`、`THIRD_KIND`、`tk-`、`TK_`，词首的 `tk` 加大写字母，`__tk`、`__TK`。带空格的「Third Kind」放行。
  - 例外和原来一样：ADR、已完成的 ticket、`logs/`、ticket 目录的路径。23 已完成，Guide 现在在 README 里，所以这一套对 23 整份放行。
  - 写法照旧用字符类，文件本身不会被拦。
- 本 ticket 写着所有旧名。Status 改为 done 后，它按「已完成的 ticket」放行，不另开例外。所以要等所有验收项都满足再 done，旧名检查才过。

**不改的部分和原因**

- 示例页面的大标题「Third Kind」不改。这是设计师定的：拖动、缩放的测试和测量台靠它的宽度，场景说明里也拿它当图层名。测试、测量台、cli.test 里把它当图层名或文字用的地方也不改。
- ADR、已完成的 ticket、`logs/`、git 历史不改。它们是历史记录，保留原名。
- `.scratch/vernierkit/` 这个 ticket 目录不改名。

**数字（同一台机器）**

| | 改前（main） | 改后 |
|---|---|---|
| `pnpm build`、`pnpm typecheck` | 通过 | 通过 |
| vitest | 1208 passed、1 skipped | 1208 passed、1 skipped |
| node 测试（测量台和旧名检查） | 126 | 129，全过（旧名检查多了 3 条） |
| `HT_E2E_PORT=6100 pnpm test:e2e` | 606 passed、1 skipped | 605 passed、1 skipped、1 failed；失败的那条单独重跑 3 次都过 |
| 切换按钮，toggle-first.spec，已发布文件 gzip 后 | 9958 B | 9962 B |
| 切换按钮，install.spec，从打的包安装、Vite 送出的样子 | 10119 B | 10126 B |
| 体积上限 | 10240 B | 10240 B |
| `HT_BENCH_PORT=5540 pnpm bench:agents --dry` | 29/29 | 29/29 |
| `--scripted` | 20/20 | 20/20 |

- e2e 失败的那条是 round.spec:662（ticket 83 那条），等页面的条件超时 5 秒。用 `--project="project files" --no-deps --workers=1 --repeat-each=3` 重跑，3 次都过。round.spec 以前就有不稳的记录（ticket 102）。
- 体积：两份尺寸测试本来就打印字节数，这次不用加 console.log。名字变长，分别多了 4 B 和 7 B。按 install.spec 的口径，离上限还剩 114 B。
- `--dry --claim-out` 和 main 在 132 之后的输出逐字比较：29 份都有差别，都只在名字上。把旧输出里的 `03kind` 换成 `humantouch`、`03Kind` 换成 `Human Touch`、`data-tk-` 换成 `data-ht-` 以后，`diff -r` 为空。
  - 命令：`npx humantouch done <number> …`、`npx humantouch finish` 等，每份都有。
  - 产品名：`… in Human Touch.` 一类句子。
  - put-back-and-new-text 那一份里，画布外图层的源码片段带着 `data-ht-*` 属性，以前是 `data-tk-*`。这是页面上的属性名，也算名字。

**全新项目走一遍**

- e2e 里已有的覆盖：install.spec（Vite）和 next-install.spec（Next.js）都从打的包 `init`，看到切换按钮，`doctor` 全 ✓，`remove` 后 git 没有改动。但它们用的是示例项目的拷贝和 pnpm，不是脚手架新建的项目，所以又手动走了一遍。
- 两个项目都放在 session 的临时目录里，用 npm。包是 `pnpm pack` 打的 `humantouch-0.0.0.tgz`（约 400 kB）。`init` 用 `HT_INSTALL_FROM=<tgz> npx -y --package <tgz> humantouch init`，之后用 `npx humantouch`。页面用 Playwright headless 打开（1280×800）。
- Vite：`npm create vite@latest -- --template react-ts`。
  - `init` 输出 `Human Touch (Vite, npm):`。插件、`<HumanTouch />`、两份 Skill、AGENTS.md 那一行、`.gitignore` 都对。
  - 开发服务器的页面上有一个 `<human-touch>`。按钮「Human Touch: enter edit mode」在右下角（1232, 752，28×28），点开能进编辑模式，控制台没有报错。
  - `doctor` 8 项全 ✓，最后是 "All good."。停掉开发服务器后 `remove`，`git status`、`git diff` 都为空。
- Next.js：`npx create-next-app@latest --yes`（Next 16.4.6）。
  - `init` 输出 `Human Touch (Next.js, npm):`。`next.config.ts` 改为 `withHumanTouch(nextConfig)`，`app/layout.tsx` 挂上 `<HumanTouch />`，模板自带的 AGENTS.md 末尾加了「Human Touch:」那一行。
  - 切换按钮在，能进编辑模式，控制台没有报错。`doctor` 8 项全 ✓。
  - `remove` 后 `git status`、`git diff` 都为空。被忽略的只有 `.next/`、`next-env.d.ts`、`node_modules/`。
- 用完关掉了开发服务器，删掉了两个项目和 tgz。

**代定**

1. 请求头叫 `X-Human-Touch-Token`，两个词用连字符连起来，不叫 `X-HumanTouch-Token`。
2. 内部文件名、元素名、CSS layer 用两个词的 kebab 写法：`human-touch-folder.ts`、`<human-touch>`、`human-touch-edits`。包名、命令、文件夹、存储键照这张票，用一个词 `humantouch`。
3. e2e 的 helper 叫 `npxHumanTouch()`、`npxHumanTouchIn()`。
4. 对 03Kind 这一套旧名，ticket 23 整份放行，因为它已完成，Guide 已在 README 里。Vernier 那一套照旧查 23 的 Guide 草稿。
5. GLOSSARY 里不写旧名，只写「旧名见 ticket 70、133」，因为旧名检查会拦 GLOSSARY。
6. 24 里 70 那条记录的标题改成「ticket 70 改名」，不再写出旧名。
7. 旧名检查找 `tk-`、`TK_` 时不要求词边界，这样才拦得住 `\btk-`、`VITE_TK_`。现在仓库里没有被误拦的词。以后正常的词里出现 `tk-`、`TK_`，检查会误拦，到时要放宽。

**风险**

- 风险 1 已修，见下面「风险 1 的修法」。
- 合进 main 以后：示例项目里存着的旧画布 `.03kind/` 要挪成 `.humantouch/`（本 worktree 里没有）。包目录换了位置，各个 worktree 要重新 `pnpm install`。
- 包目录换位置后，第一次跑 vitest 可能因为 Vite 重新预构建依赖而失败（ticket 70 遇到过）。这次在新 worktree 里第一次就过了。
- 按 install.spec 的口径，切换按钮离上限只剩 114 B。

### 风险 1 的修法（2026-11-11，规划会话要求，同一分支）

- 问题：`doctor` 查正式构建残留的列表里有单独的 `human-touch`。正式构建里正常出现这个词（类名、网址、页面文字、npm 上那个同名的包）时，会误报 ✗。
- 先看了我们发出的每一份代码，留进正式构建时各带哪些字样（`pnpm build` 后的 dist）：
  - 切换按钮那份共用代码（`chunk-*.js`）：`data-ht-`、`__HUMAN_TOUCH__`、`X-Human-Touch-Token`，还有宿主元素名 `"human-touch"`。
  - 编辑层（`editor.dev.js`）：`data-ht-`、`human-touch-edits`。
  - 开发用的 React 入口（`react.dev.js`）：自己没有这些字样，但它导入切换按钮那份代码，一起打进去就带着那三样。正式入口 `react.js` 只是一个返回 null 的组件，什么都不带。
  - Vite 插件和 Next.js 的 loader：往页面代码里写 `data-ht-loc`、`data-ht-usage`。
- 改成：`RESIDUE = ["data-ht-", SERVICE_GLOBAL, TOKEN_HEADER, "human-touch-edits"]`，也就是 `data-ht-`、`__HUMAN_TOUCH__`、`X-Human-Touch-Token`、`human-touch-edits`。后两个直接取 `service-protocol.ts` 的常量，以后改名不会漏。
  - 去掉了单独的 `human-touch`。上面每一份残留都至少带一样新字样，所以原来抓得到的残留现在照样抓得到。
  - 没有用 `customElements.define("human-touch"`：压缩以后宿主元素名是一个变量（`Dt="human-touch"`），define 的参数不是这个字面量，这个字样抓不到。
- 测试（`test/install.test.ts`）：
  - 原来那条「正式构建里有编辑层代码就报 ✗」拆成 4 条，每条放一种真实的残留：切换按钮（宿主元素名和 `__HUMAN_TOUCH__`）、请求头、元素的源码标记 `data-ht-loc`、编辑样式的 CSS layer。都报 ✗。
  - 新加 1 条：正式构建里只有平常用到的 human-touch（类名 `human-touch`、网址 `/blog/human-touch`、文字 "A Human Touch"、`import("human-touch")`、元素 `human-touch-card`），`doctor` 报 ✓、退出码 0。
- 数字：`pnpm typecheck` 通过；vitest 1212 passed、1 skipped（原来 1208：一条拆成 4 条，再加 1 条）；node 测试 129 全过；`HT_E2E_PORT=6100` 跑 install.spec、next-install.spec、production-build.spec，14 passed。
- 风险：要是以后改了切换按钮或编辑层，让它不再带这四样字样里的任何一样，残留就查不出来了。现在靠上面这份逐个核对；没有测试拿打包出来的 dist 去比。
