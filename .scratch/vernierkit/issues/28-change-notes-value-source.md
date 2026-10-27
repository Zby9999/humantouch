# 28: 改动说明写明当前值的来源

**What to build:** 编辑一项属性时，编辑层在画布上求出这项属性改前的值由哪条样式设定（样式规则或内联样式；规则所在文件、CSS layer、是否 important；规则只有一个类、元素又带着这个类时给出类名），记进改动单。改动说明为每条改动加一行"当前值的来源"，Skill 告诉 Agent 怎么用它：改那个类或那条规则；来源不在 CSS layer 里而项目的工具类在 layer 里（Tailwind v4）时，加类盖不过它；来源写在被多处使用的组件里、作用范围又是这一处使用时，把它改成组件给默认值、使用处可以覆盖，避免类名冲突。

参考本功能的 spec.md（同目录上一级，"改动单内容""改动说明"），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 06

**Status:** done

- [x] 填充与圆角改动记录改前值的来源：样式规则、内联样式，或没有任何样式设定（浏览器默认）
- [x] 来源给出选择器、所在文件（开发服务器提供时）、CSS layer、是否 important，以及对应的类名
- [x] 层叠顺序按 important、内联样式、CSS layer、优先级、先后顺序判定；媒体查询、`@supports`、嵌套规则都考虑在内
- [x] 改动说明中每条改动有"当前值的来源"一行；求不出时写明未知
- [x] Skill 补充如何根据来源修改，包括不在 layer 里的规则和组件内类名冲突两种情况
- [x] 辅接缝 1：在固定画布副本上调用编辑命令，断言记下的来源；主接缝：示例项目中按钮与卡片的改动说明写明各自的来源

## Comments

**实现记录（2026-10-23）**

- `client/style-source.ts`：`sourcesOf(el, properties)`。浏览器不给页面提供"哪条声明胜出"的查询，所以在画布上自己走一遍层叠：遍历画布的样式表（跳过画布自己的样式），对每条样式规则用 `el.matches` 筛选，再按 important、内联样式、CSS layer、优先级、先后顺序比出胜者。
  - 支持 `@media`（按画布的 `matchMedia`，冻结时视口相关的条件已固定）、`@supports`、`@layer` 声明与块（含嵌套和匿名 layer）、`@import`、CSS 嵌套（`&` 换成 `:is(父选择器)`）。`@container` 一律当作成立。
  - layer 的排序：不在 layer 里的普通声明胜过所有 layer；important 反过来，越早的 layer 越强、不在 layer 里的最弱。
  - 优先级自己计算，处理 `:is` / `:not` / `:has`（取参数中最大的）、`:where`（0）、`:nth-child(… of S)`、伪元素和转义字符（Tailwind 的 `.bg-\[\#fff\]`）。
  - 规则里用简写写的（`background: …`、`border-radius: …`），按写法报告简写。
  - 文件：Vite 开发模式注入的 `<style data-vite-dev-id>` 给出绝对路径；冻结器内联 `<link>` 时把地址记在 `data-vk-href` 上。改动说明里换成相对项目的路径。
  - 规则只有一个类、元素又带着这个类时，给出类名（Tailwind 工具类、CSS Modules 的类都适用）。
- 编辑命令（`edits.ts`）：每个属性登记它读的 CSS 属性（填充 `background-color`，圆角四个角）。第一次写画布前把元素原来的 `style` 存进 `data-vk-original-style`，内联样式的来源按它判断，不会把编辑自己写的 `!important` 当成页面的样式；它随画布保存，刷新后同样有效。改动单的 `sources` 和 `before` 一样保留第一次的。
- 改动说明多一行 **Currently set by**：例如 "class `bg-white`: rule `.bg-white` in CSS layer `utilities` of `src/index.css`, `background-color: var(--color-white)`"，或 "rule `button` in no CSS layer, of `src/index.css`, …"。各角来源不同时按属性分开写；求不出（旧的改动单）写 unknown。
- Skill：从来源下手；不在 CSS layer 里的规则胜过 layer 里的所有类，加 Tailwind 类不会生效；作用范围是这一处使用、类又写在被多处使用的组件里时，把它改成默认值可被覆盖，不在使用处叠加冲突的类。
- 测试：辅接缝 `test/edits.browser.test.ts` "where the value comes from"（layer 中的类、不在 layer 的规则、important 与媒体查询与内联样式、浏览器默认、嵌套规则、改回再改）；命令行接缝 `test/cli.test.ts`；主接缝 `claim.spec.ts` 在真实的 Tailwind v4 页面上断言卡片、按钮、根元素的来源。

**已知限制**

- 跨域样式表读不到规则，其中的声明不参与比较。
- 用户代理样式（浏览器默认）不区分具体规则，统一写 "nothing: the browser default applies"；继承来的属性（填充和圆角都不继承）暂不处理。

**代码审查后的修正（2026-10-23）**

- 样式表自身的媒体条件（`<style media="print">`、`<link media>`、`@import … screen`）和 `@import … supports()` 不成立时，其中的规则不参与比较。
- 嵌套在条件里、或写在嵌套规则之后的声明（`CSSNestedDeclarations`）按所在规则计入。
- 有读不到的跨域样式表、又没有可读的样式设定这项属性时，来源写 unknown（"a stylesheet from another origin may"），不再断言是浏览器默认值。
- 同一属性反复调整时只在第一次走层叠，拖动数值不再每一步都遍历样式表。
- `@scope` 规则暂不处理，其中的声明被忽略。
