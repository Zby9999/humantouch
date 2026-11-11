# 155: 安装测量台里的 Claude 也能删掉自己新建的文件

**What to build:** ticket 151 的代定 1（规划会话 2026-11-12 定）。

- 151 让安装测量台里的 pi 能 `rm` 项目里 git 不跟踪的单个文件，判断在 `allowlist.ts` 的 `removesUntracked`。
- Claude 的安装列表还是不许 `rm`。它的权限规则只能按命令前缀写，分不出文件有没有被 git 跟踪；直接放开 `Bash(rm:*)` 等于什么都能删。
- 结果：Claude 写了临时脚本也删不掉，会和 pi 那次一样，判「源码改动」和「remove 后不留东西」两条失败。

要做到：

- Claude 的安装运行里，加一个 PreToolUse hook，对 `rm` 套用和 pi 一样的规则：可以带 `-f`、写全名的文件、在项目里、不在 `.git`、git 既不跟踪也不忽略。符合就放过，不符合就拒绝。拒绝时的说明和 pi 的一致。
- 只用在安装测量台。applying 测量台（`bench:agents`）的设置不变。
- 规则复用 `removesUntracked`，不另写一份。

参考 ticket 151、ticket 24；用词以 GLOSSARY.md 为准。

**Blocked by:** None。在 Claude 的安装实测（ticket 24，发布后）之前做。

**Status:** ready-for-agent

- [ ] 测试：在 Claude 的安装设置下，hook 对 151 测过的那些 `rm` 命令给出和 pi 一样的放过、拒绝结果。
- [ ] applying 测量台的设置和测试逐条不变。
- [ ] `pnpm bench:install --agents scripted --package local` 全过；`pnpm typecheck`、`pnpm test` 过。
