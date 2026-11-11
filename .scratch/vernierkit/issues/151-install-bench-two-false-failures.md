# 151: 安装测量台的两处误判：找按钮被不应答的端口拖住；Agent 删不掉自己建的临时文件

**What to build:** 设计师 2026-11-11 让 pi 先测一遍从 0 安装（`pnpm bench:install --agents pi --package local`，记录在 `bench-results/install/2026-11-11T11-11-12-758Z/`）。10 个起点成功 8 个。按钮出现时间的中位数是 23.1 s，Agent 会话的中位数是 49.3 s。没过的两次，规划会话读了记录，都是测量台误判，不是产品问题。

**1. next-webpack-src-pnpm-modules：按钮 116.9 s 才找到（要求 ≤ 60 s）**

- Agent 在 35 s 启动开发服务器，dev.log 在 ~43 s 显示 `✓ Ready in 2.2s`。
- dev.log 从头到尾只有一次 `GET / 200 in 3.5s`，说明测量台到 ~110 s 才第一次真正请求到 3000。
- 这次 next-server 除了 3000，还在 127.0.0.1 上开了一个内部端口（58788），同一个 pid。另外 4 个 Next 起点都只有 3000。
- 找按钮的循环（`run-install.ts` 的 `watchForToggle`）对每个看到的端口都 `page.goto(url, { timeout: 60_000 })`。最可能的经过：第一次看时，起点自己的端口还没监听，只有内部端口在。goto 到这个只接连接、不应答的端口，卡满 60 s。
- 同时 Agent 在跑 `doctor`，里面有一次生产构建（43 → 149 s），整台机器也更慢。

要做到：

- 找按钮不被某个不应答的端口拖住。比如：起点自己的端口优先；别的端口只在起点端口没有服务时才试，并且用短超时（几秒）；或者所有 goto 都用短超时、靠循环重试。
- 测到的时间仍以页面上真正出现按钮为准。编译慢的页面（Next webpack 第一次编译）不能因为超时变短而永远找不到：短超时只用在别的端口上，或者起点端口的超时足够让第一次编译完成。
- 先用测试复现「卡满 60 s」，再修。

**2. vite-ts-bun-css：多出一个 `ht-check.mjs`，判了「源码改动」和「remove 后不留东西」两条失败**

- Agent 打不开浏览器，就写了一个 `ht-check.mjs`，想用 fetch 检查服务器。
- 测量台的白名单不许 `node`，所以这个脚本没跑成。它想删掉：`find … -delete` 不许，`rm` 也不许。最后只好用 write 把它写成空文件。
- 结果「源码改动 ≤ 2 处」和「remove 后 git status 为空」两条都判失败。如果在设计师自己的 shell 里，它能删掉。

要做到：

- 安装测量台允许 Agent 删除它这次新建、git 没有跟踪的文件：`rm <路径>`，可以带 `-f`，不带 `-r`，不带通配符，路径在项目里。
- 已跟踪的文件、目录、项目外的路径照旧不许。
- applying 测量台（`bench:agents`）的白名单不变。

**3. 不改：Agent 自己重定向的开发日志**

- 5 个 Next 起点都留下了 Agent 自己写的日志，比如 `dev.log`、`humantouch-dev.log`。它们照旧只记成 note，不算失败。
- `remove` 不去删它们，因为这些文件不是 `init` 加的。

用词以 GLOSSARY.md 为准。重活（整套 `pnpm test`、`bench:install`）照 heavy-work lock 排队：`/private/tmp/humantouch-heavy.lock`。`bench:install` 用起点的默认端口 5173、3000，必须拿着锁跑。

**Blocked by:** None。在 Claude 的安装实测（ticket 24，发布后）之前做，不挡发布。

**Status:** ready-for-agent

- [x] 测试：一个只接连接、不应答的端口和起点端口同时在，按钮 1 s 后出现在起点端口上，测到的时间远小于 60 s（比如 < 10 s）。改前失败。
- [x] 测试：起点端口第一次编译要 20 s 以上的，照样能找到按钮。
- [x] 白名单测试（install 用的那份）：
  - 允许：项目里未跟踪的 `rm ht-check.mjs`、`rm -f ht-check.mjs`。
  - 不许：`rm -rf src`、已跟踪的 `rm src/App.tsx`、`rm ../x`、`rm *.mjs`、`rm -r tmp`。
  - applying 测量台的白名单测试逐条不变。
- [x] `pnpm bench:install --agents scripted` 全过。
- [x] `pnpm typecheck`、`pnpm test` 过。
- [ ] 合进 main 后，经设计师同意（用设计师的 pi 额度），用 pi 重跑这两个起点各一次。

## Comments

**2026-11-12，实现（分支 worktree-agent-abeaff2f65e54e5b5）**

改了什么：

- 找按钮：`watchForToggle` 从 `run-install.ts` 挪到新文件 `e2e/bench/toggle-watch.ts`，好单独测。逻辑改成：起点端口上有服务时，只看起点端口，goto 超时照旧 60 s，够 Next webpack 第一次编译。起点端口没有服务时，才看别的端口，每个 goto 只等 3 s。别的端口上编译慢的页面，下一轮再看，不会永远找不到。
- 删除：pi 的安装白名单（`install-list.json`）多了 `remove: true`。`allowlist.ts` 的 `shellAllowed` 多了一个参数 `removeIn`：给了它，`rm` 就照 `removesUntracked` 判。只许 `rm` 或 `rm -f`；每个文件写全名，不带通配符和花括号；是文件或链接，不是目录；所在目录的真实路径在项目里，不在 `.git` 里；git 既没跟踪也没忽略（`git ls-files --others --exclude-standard`）。同一行里 `rm` 前面有 `cd` 的，不许。被拒时，理由里会写这条规则。
- applying 测量台（`bench:agents`）没变：它的列表没有 `remove`，`rm` 照旧不许，理由也不提。`allowlist.test.ts`、`pi-extension.test.ts` 一行没改。
- Claude 的安装列表没变，`rm` 照旧在 deny 里（代定 1）。
- `install-judge.ts` 没改：删掉的文件 git status 里本来就没有。第 3 条（Agent 自己的日志）照旧。

测试：

- 新文件 `e2e/bench/toggle-watch.test.ts`，用真的 headless Chromium 和本机端口 7100–7102：
  - 一个只接连接、不应答的端口先在，起点端口 1 s 后才有服务。改前（逻辑原样挪过去时）测到 60.3 s，失败；改后 3.4 s 找到。
  - 起点端口第一次编译要 21 s（这之前的请求都等到 21 s 才答）。改前改后都在 ~21 s 找到。
- `install-allowlist.test.ts` 新加一条，用一个真的 git 项目：
  - 允许：`rm ht-check.mjs`、`rm -f ht-check.mjs`、两个新文件一起删、绝对路径、`rm -f ht-check.mjs && git status`。
  - 不许：`rm -rf src`、`rm src/App.tsx`、`rm ../x`、`rm *.mjs`、`rm -r tmp`，以及目录、`-rf`/`-i`/`--`、`?` 和花括号、git 忽略的文件、`.git/HEAD`、不存在的文件、光一个 `rm`、`cd src && rm …`、新文件和已跟踪的一起删、`rm … &`。
  - 没有安装列表时（applying 的）`rm ht-check.mjs` 照旧不许。改前第一条就失败。

数字：

- `pnpm typecheck` 过。`pnpm test`：vitest 1232 过、1 跳过；node 132 过。
- `pnpm bench:install --agents scripted --package local`：10/10。按钮中位数 7.3 s，最长 31.4 s（next-webpack-src-pnpm-modules）。会话中位数 8.8 s。
- 不带 `--package local`（默认 npm）跑过一次，10 个都失败：humantouch 还没发布，`init` 装不上，跟这次的改动无关。

代定：

1. Claude 的安装列表不放开 `rm`。Claude Code 的规则只按前缀匹配，分不出文件有没有被 git 跟踪；放开 `Bash(rm:*)` 就等于什么都能删。Claude 遇到同样的情况，还会留下文件，判失败。要放开，得用 PreToolUse hook 照 pi 的规则检查，另开票。
2. 只许删 git 既没跟踪、也没忽略的文件。被忽略的（比如 `node_modules` 里的、Agent 自己的 `dev.log`）不许删，日志本来也只记成 note。
3. 别的端口每个只等 3 s。起点端口上有服务时，别的端口完全不看。
4. 只要求文件是 git 没跟踪的，不查是不是这次 Agent 建的。起点刚 scaffold 完，所有文件都提交过，所以没跟踪的就是这次新建的（`init` 加的文件也算）。

风险：

1. 起点端口上要是有个只接连接、不应答的服务，别的端口就一直不看，每轮卡 60 s。真碰上的话，测到的时间会超 60 s，判失败，记录里能看出来。
2. Agent 可以删掉 `init` 加的、git 没跟踪的文件，比如 Skill 的文件。这样 doctor 会判失败，不会漏报。
3. 每个要删的文件都会跑一次 `git ls-files`。命令行里文件多的话会慢一点，不影响结果。

后续提议（编号在 main 上给）：Claude 的安装测量台用 PreToolUse hook，照 pi 的规则放开删除没跟踪的文件（见代定 1）。
