# 120: 第三方组件画的图层，不许从使用处伸进去改

**What to build:** 改动说明的写法规则「Every change」现在只说不许改第三方代码（`node_modules`、vendored packages），只能改在那里的改动留着不做、写进报告。真实 Agent 跑 `third-party` 场景时找到了一条绕法。acme-ui 的 Badge 不收 class、style，设计师把它的宽度改成 90px，有的 Agent 就在使用处包一层，用后代选择器伸进组件库里面那个元素去改：`<span className="contents [&>span]:w-[90px] [&>span]:shrink-0">`。页面上确实显示了，Agent 报 ✓。88 的 6 次里有 3 次这样做，复验时 3 次里有 1 次。这种写法依赖组件库内部怎么画，库一升级（例如里面的 `span` 换成 `div`）就悄悄失效，也不报错。

要做到：改动的图层由第三方组件画出来时，写法规则多出一条单独的规则，说也不许从使用处伸进它的元素里改，做不到就留着不做、写进报告。别的改动说明逐字不变。

参考 ticket 88 Comments 末尾「复验结果：Claude 一侧」和「待设计师定」第 2 条，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0013）。

**Blocked by:** 无

**Status:** done

- [x] 写法规则加一条，例如叫「Third-party components」，只在这一轮有改动的图层是第三方组件画的时候出现，判断看使用链上它所在的那一层是不是第三方。意思大致是：也不要从使用处伸进它的元素里改，例如包一层、写后代选择器（`[&>span]:…`），或者对它的类名写全局规则；这依赖组件库怎么画它们，做不到就留着不做、写进报告。英文措辞作为代定，Skill 和认领说明的写法保持英文。
- [x] 「Every change」那一条一字不改。没有第三方图层的轮次，改动说明逐字不变：`--dry` 全过，`--dry --claim-out` 和改前 diff 只有带第三方图层的场景（`third-party`）多出这一条，在 Comments 里列出来。
- [x] Skill 里如果也讲第三方代码，跟着补半句，措辞同上。没讲就不加。
- [x] `--scripted` 全过：`third-party` 的脚本照旧把 Badge 那条留着不做，报在 ⚠️ 下。
- [x] `done` 要不要认出「伸进第三方元素改」并提示，作为代定。建议先不做，靠规则加真实 Agent 复验看效果。
- [ ] 不跑真 Agent。真 Agent 只重跑 `third-party`，Claude 和 pi 各 3 次，和 118 新场景的真跑并在一起，由规划会话在 118、120 都合进 main 后跑，开跑前问设计师额度。
- [ ] e2e 全过；包的大小照常记；切换按钮的包逐字节不变。

## 背景

- ticket 88 Comments「待设计师定」第 2 条。

## 设计师决定（2026-11-10）

- 选 A：不许从使用处伸进第三方组件改，单独一条规则，只对第三方图层出现。
- 真 Agent 复验并到 118 之后一起跑。
- 接在 109 那条线后面：118 → 110 follow-up → 120。设指挥，每张一个新的实现子 agent、一个审查子 agent，都用 effort medium。

## Comments

### 120 实现（2026-11-10；起点 main 25b8882，分支 worktree-agent-a340fc34a854e3596）

**做了什么**

- 写法规则（`writing-rules.ts`）在「Every change」后面加一条「Third-party components」，只在这一轮有改动的图层使用链最里那一层是第三方（`target.chain[0].thirdParty`，和锁定图层、认领说明 Scope 里「The layer is drawn by a dependency」用的是同一份使用链）时出现。措辞（代定 1）：

  > - **Third-party components:** a layer a third-party component draws is changed only by what the component takes from its usage (a prop, a `className` or `style` it passes on). Do not reach into its elements from the usage either: no wrapper with descendant selectors (`[&>span]:w-[90px]`), no global rule on its class names. Those depend on how the library draws its elements, and stop working, with no error, once it draws them otherwise: a change that cannot be made without them is left out and reported.

- 「Every change」一字没改，别的规则、改动各节都没动。
- Skill：只有报告格式的例子里有「the component library sets it and cannot be changed from the usage」，没有讲第三方代码的规则，所以没加。
- `done` 不认「伸进第三方元素改」（代定 2），照 ticket 的建议先不做。
- 测试：`cli.test.ts` 1 条：项目自己的图层的改动没有这条；第三方组件画的图层（锁定图层，`loc: null`，`chain[0].thirdParty`）的改动，规则前两条是「Every change」「Third-party components」，「Every change」和没有第三方图层时逐字相同。

**认领说明对比**：`TK_BENCH_PORT=5540 pnpm bench:agents --dry --claim-out`，main 25b8882 和分支各 28 份，`diff -r` 只有 `third-party.md` 一处，「Every change」那行之后多出一行：

```
31a32
> - **Third-party components:** a layer a third-party component draws is changed only by what the component takes from its usage (a prop, a `className` or `style` it passes on). Do not reach into its elements from the usage either: no wrapper with descendant selectors (`[&>span]:w-[90px]`), no global rule on its class names. Those depend on how the library draws its elements, and stop working, with no error, once it draws them otherwise: a change that cannot be made without them is left out and reported.
```

（`third-party` 的两条改动里，Grid 是 App 写的 `<Surface>` 的元素，已定位，使用链最里是 App，不算第三方；只有 Badge 那条叫出这条规则。）

**验证**：`pnpm typecheck` 过；`pnpm test` 1147 过 1 跳过，node 126 过；`--dry` 28/28；`--scripted` 19/19（`third-party` 的脚本照旧只填 Surface，Badge 那条留着不做、报在 ⚠️ 下）。e2e 没有改到的测试，`applying-bench.spec.ts -g third-party` 本想单独跑，`-g` 没挡住依赖的页面组，结果页面组 426 过、2 个折叠动画的测试没过（`layers.spec.ts:316`、`properties.spec.ts:1193`，load 45 时），单独重跑都过；然后 `--project="project files" --no-deps` 跑 third-party 的 2 个剧本，都过。整套 e2e 由指挥在 review 后跑，所以最后一个框没打勾；性能不涉及（只改了 CLI 打出的说明），没跑。跑的时候机器负载很高（load 30–45）。

**包**（改前改后各 build 一次比）：切换按钮 `react.dev.js` 1423 B（`bd6c2389b64451f0`）、`chunk-2GJY7MXB.js` 21372 B（`a8c4c0d4bc3db6a8`），逐字节相同。编辑层 `editor.dev.js` 516620 B，gzip -9 182693 B，也逐字节相同（`575e2fe9632b063a`；写法规则只在 CLI 里）。`cli.js` 172631 → 173400 B（+769 B），gzip -9 47652 → 47903 B（+251 B）。

#### 代定的事（待设计师确认）

1. 新规则的英文措辞（上面那段），名字「Third-party components」，放在「Every change」紧后面。先说只能用组件从使用处收的东西改（prop、它传下去的 `className` 或 `style`），再说也不要伸进它的元素里，例子用真实 Agent 写过的 `[&>span]:w-[90px]`，理由是库换个画法就悄悄失效，最后是做不到就留着不做、写进报告。
2. `done` 不认出「伸进第三方元素改」，不提示。要认得从代码改动里找出包在第三方组件外的后代选择器、对它类名的全局规则，不是小改动；先靠规则和真 Agent 复验看效果。
3. 判断只看改动自己的图层（`target`）：挪动、做 Stack 时，容器或别的被带到的图层是第三方的，不叫出这条（这些改动写在使用处的 JSX 上，不伸进组件里面）。

#### 遗留风险

1. 规则没有真 Agent 跑过：要等规划会话在 118、120 合进 main 后重跑 `third-party`（Claude、pi 各 3 次）才知道包一层的写法是不是没了。
2. 使用链靠 React 开发构建里的 fiber；读不到使用链（`chain` 为空）时这条不出现，只剩「Every change」那半句。
3. 组件收 `className`、只是不传到要改的那个元素上时，Agent 可能把 class 传到组件外层就当改了（宽度等会在外层显示出来）；规则没有专门说这种。
