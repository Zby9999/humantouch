# 159: Next.js 项目里，第三方 Web Component 也认出来、锁住

**What to build:** ticket 137（ADR 0017）让 shadow root 里的样式可以编辑，第三方 Web Component 的 shadow root 锁住不让改。怎么判断是第三方：Vite 插件包了一层 `customElements.define`，看定义来自哪个文件，在 `/node_modules/` 里就算第三方。Next.js 下没有这一层，所以 Next 项目里，第三方 Web Component 的 shadow root 现在当成项目自己的，可以编辑。改了以后，Agent 照「Every change」的规则不改第三方代码，留着不做、写进报告，不会改坏，只是设计师白改了一次。

要做到：

- Next.js 项目里（webpack 和 Turbopack 都算），第三方 Web Component 的 shadow root 和 Vite 下一样锁住。
- 项目自己的 Web Component 照旧可以编辑。
- 还是只认 `/node_modules/`（137 代定：vendor/、libs/ 这类目录不按目录名猜）。

用词以 GLOSSARY.md 为准，涉及 ADR 0017。测试只跑相关的部分，整套由规划会话在 main 上按批跑。重活照两槽锁排队。

**Blocked by:** 137。发布后做（规划会话 2026-11-12 定）。

**Status:** ready-for-agent

- [ ] 测试：Next 示例（webpack 和 Turbopack 各一个）里，一个来自 node_modules 的 Web Component 的 shadow root 锁住；项目自己定义的照旧能改。改前失败。
- [ ] Vite 下的行为不变。
- [ ] `pnpm typecheck`、`pnpm test`、相关 e2e 过。
