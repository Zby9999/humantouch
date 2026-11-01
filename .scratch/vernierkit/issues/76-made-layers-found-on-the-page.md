# 76: Agent 新建的图层在页面上找得到

**What to build:** Agent 按新建改动（New Frame、New text）写进代码的图层，页面要能找到它，让对它的改动也能在页面上核对，并让下一轮画布上的它能指回源码。现在这类图层在页面上没有源码标记可认：

- 这一轮新建的图层：新建本身、以及这一轮对它的改动（例如新建的 Frame 再填色），页面核对一律答 Not checked，理由是「the layer is new this round, so the page has no marker to find it by」（`client/check.ts` 的 `uncheckable`，`client/checkable.ts` 的 `checkable` 遇到 `target.made` 就不核对）。
- ticket 68 之后，上一轮新建、已落地的图层留在同一张画布上，画布上它也没有源码标记。对它的改动，`claim` 只能写「Made in a round before … Find it in the source from its place on the page」，Currently set by 写 unknown（`change-notes.ts` 的 `MADE_BEFORE`），页面核对仍答 Not checked，理由还是「new this round」那句，对上一轮的图层说得不对。

要做的是让页面（以及下一轮的画布）知道这个图层在源码里是哪一个，具体怎么认由设计师在分诊时定（见待定问题）。

参考本功能的 spec.md（同目录上一级），目标与指标以 docs/goals.md 为准，用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策（ADR 0006、0013）。

**Blocked by:** 68

**Status:** needs-triage

- [ ] 这一轮新建、Agent 已写进代码的图层，页面找得到它；对它的样式改动按 `checkable` 的其余规则核对（和页面原有的图层一样），不再因为「新建」答 Not checked
- [ ] 上一轮新建、已落地的图层，下一轮对它的改动：`claim` 给出它在源码里的位置（Location），Currently set by 由页面读出；页面核对和页面原有的图层一样
- [ ] 页面仍找不到时（例如 Agent 没按改动写、或写在了别处），核对的理由如实说是哪种情况，不再对上一轮的图层说「new this round」
- [ ] 核对覆盖率（docs/goals.md Robust：页面能核对的改动，一轮结束前拿到核对结果的比例 100%）：开工时用剧本量出对新建图层的改动有多少拿到核对结果，作为基线（按现在的代码应为 0%），做完达到 100%
- [ ] 1:1 落地率、虚假 ✓：对新建图层的改动改由 `done` 核对计入，测量台前后各量一次
- [ ] 没有新建图层的一轮，10 个测量台场景的 `claim`、`done`、`finish` 输出逐字不变；有新建图层的场景（dissolve-place-frame、put-back-and-new-text）输出的变化逐条列在 Comments
- [ ] 认领期间页面核对不出现 long task（约 5000 个元素的页面，每次热更新）；切换按钮不超过 10,240 B；正式构建里编辑层代码 0 字节，源码里不留只为 Vernier Kit 加的东西（除非设计师在分诊时另定）
- [ ] Agent 落地每条改动平均工具调用数、全仓搜索次数：对上一轮新建图层的改动，前后各量（docs/goals.md Light：平均 ≤ 3 次，0 次全仓搜索）
- [ ] 前后数字记在 Comments（docs/goals.md「度量」）；spec 的核对一节、ADR 0013 最后一条后果里「上一轮 Agent 新建的图层在页面上还找不到」随之更新

## 背景

- 来自 ticket 68 的 Comments：设计师 2026-11-01 改了方案（方案 B：一轮结束时还有没落地的改动，下一轮回到同一张画布，不重新冻结），之后的审查补修（11/01，起点 ed1fb77）把「上一轮新建」改为只看改动单里有没有新建它的改动，并写出 `MADE_BEFORE` 那段说明。68「没做到的、留下的风险」第 5 条：「上一轮新建的图层在页面上找不到，核对的原因那句还写『the layer is new this round』。让它在页面上找得到要另开 ticket」。设计师 2026-11-01 要开这张。
- ADR 0013 的最后一条后果写着这个代价：「上一轮 Agent 新建的图层在页面上还找不到，核对说没能核对」。
- 页面找图层靠源码标记（JSX 上的 `data-vk-loc`，加上组件的使用处链），改动记着的是 `target.loc`。对新建图层的改动记着 `target.made`（新建它的那条改动的图层 id）和层级路径、开头标签，没有它在源码里的位置：Agent 写进代码之前它不在源码里，写进之后改动单也不知道它写在了哪一行。活页面上 Agent 写的元素其实有源码标记，缺的是从改动到这个标记的对应。
- 现在测量台的 10 个场景里，新建图层的改动有 dissolve-place-frame 的 New Frame、put-back-and-new-text 的 New text；没有场景对新建的图层再做改动，也没有跨轮的新建图层。要量这一项得先加剧本。

## 待定问题（等设计师定）

1. 页面靠什么认出 Agent 写的元素就是新建的那个图层？可能的做法（不替设计师选）：
   - 页面按新建改动给的位置（容器、第几个图层）和开头标签在活页面上找，找到后读它的源码标记；
   - Agent 在 `done` 时报出它写在哪里（例如 `done 3 --at src/App.tsx:20:7`），页面按这个位置找；
   - Agent 写代码时给元素加一个临时标记，`finish` 或 Vernier Kit 自己再去掉（会碰用户源码，要和 ADR 0003、「卸载后 git diff 为空」一起考虑）；
   - 其他做法。
2. 找到之后，改动单里要不要把 `target.made` 换成真的 `loc`（之后的改动、下一轮的 `claim` 都按源码位置写）？换的时机是页面第一次核对到它、`done`、还是 `finish`？
3. 上一轮新建、已落地的图层，下一轮画布上要不要补上源码标记（画布是上一轮冻结的，68 不重新冻结）？补的话是进入编辑模式时补，还是 `claim` 时由活页面告诉？
4. 新建本身（New Frame、New text 这条改动）要不要也核对，核对什么（元素在不在、在不在给的位置、文字对不对）？还是只核对之后对它的改动？
5. 页面找到了好几个都对得上的元素（循环里、或 Agent 写了不止一处）时算什么？
