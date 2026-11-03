# 87: 标准场景补全：React 18 + Tailwind v3、Next.js + CSS Modules，和常见的代码写法

**What to build:** 测量台现在只在 Vite + React 19 + Tailwind v4 示例上跑。README 写了支持 React 18 / 19、Vite 或 Next.js 16 以上（App Router）、Tailwind v3 / v4、普通 CSS 和 CSS Modules。让测量台能在仓库里另外两个示例上跑标准场景，并把真实项目里常见、示例里还没有的代码写法加进来，Agent 验收才算覆盖了常见情况。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 无

**Status:** ready-for-agent

- [ ] 测量台能换示例项目：每个场景说明在哪个示例上跑；Vite 示例照旧，Next.js 示例要能起开发服务器、等它就绪、在它上面核对（e2e 里已有 Next.js 的安装和落地测试可以借用）。现有场景照旧在 React 19 + Tailwind v4 示例上，id 和预期不变
- [ ] **React 18 + Tailwind v3 示例**的场景：设计变量来自 `tailwind.config.js`；至少覆盖样式改动（填色、间距、圆角、字号）、一条断点改动、一条结构改动（新建 Stack 或重排）
- [ ] **Next.js + CSS Modules 示例**的场景：样式写在 `.module.css` 里（落地时改 CSS 文件，不改成 Tailwind 或行内样式）；Server Component 和 `'use client'` 组件各有改动；至少覆盖样式改动、一条断点改动、一条结构改动、改字
- [ ] **常见代码写法**，示例里没有的就加（只加，不改现有页面上已有的东西，免得现有测试的图层树变了；改了要说明为什么，并同步改那些测试）：用 `cn()` / `clsx` 拼 className、按 props 选样式的组件变体（例如 `variant="primary"`）、同一个组件用了好几次时只改一个使用处、条件渲染出来的元素
- [ ] 每个新场景 `--dry` 空跑：都做得出改动，页面上一条都还没显示；再用脚本扮演 Agent 写对的代码跑一遍，每条都显示了
- [ ] 原有测试全过；切换按钮的包逐字节不变
- [ ] 不跑真实 Agent

## 背景

- 设计师决定（2026-11-03）：Agent 验收要尽可能覆盖所有常见情况。Design 面板和流程上的缺口在 ticket 86，两张 ticket 互不依赖，可以同时做；都会往场景清单里加东西，后合的那条线要同步先合的那条。
- 示例项目也被很多 e2e 测试用着（spec 里写着功能测试用小示例），加东西前先看哪些测试按图层名、文字或结构找元素。

## 设计师决定（2026-11-03，分诊）

- 尽可能覆盖所有常见情况；任务由规划会话来拆。
