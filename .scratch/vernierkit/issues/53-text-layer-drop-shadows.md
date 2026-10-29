# 53: 文字图层的投影

**What to build:** 设计师能给文字图层添加、调整、移除投影（可多层），画布立即生效；写进样式时用 `text-shadow`。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 12（已完成）

**Status:** done

- [x] 文字图层的 Effects 里可添加多层投影，每层分别调整 X、Y、模糊与颜色，画布立即生效
- [x] 文字图层的投影没有扩展这一项，也不能选内阴影（`text-shadow` 做不到这两样）
- [x] 页面上已有的 `text-shadow` 读作投影
- [x] 同时选中文字图层与其他图层时，投影各按各的方式写：文字图层用 `text-shadow`，其他图层用 `box-shadow`（与 Figma 一样，多选时可以一起加投影）
- [x] 改动说明给出设计意图与参考样式

## 背景

- ticket 12 只给容器、图片、静态画面提供效果，文字图层没有效果；Figma 允许给文字加投影。
- 用户选择只为文字图层补投影：不做内阴影和扩展，也不在本 ticket 里给文字图层加模糊。

**实现记录（2026-10-29）**

- 投影的读写在 `client/effects.ts`：`readTextShadows` 读计算样式的 `text-shadow`，和 `box-shadow` 共用一个解析（`parseShadows`）；`writeTextShadows` 写 `x y blur color`，没有阴影写 `none`；`textCanDraw` 判定一组阴影文字能不能画（只有投影、扩展为 0）。值仍是 `Shadow`（`type` 恒为 `drop`、`spread` 恒为 0）。
- `edits.ts` 只加了一项属性 `textShadows`（`kinds: ["text"]`，`accepts` 用 `textCanDraw`，读写 `text-shadow`）和导入；`CanvasView.tsx` 没有改。撤销、"back where it started"、`done` 的核对（`readValue` + `sameValue`）都走已有的通用路径。没有独立元素的文字（loose text）和其他属性一样不提供。
- 面板（`Properties.tsx`）：Effects 段按图层取各自的属性——文字图层的阴影是 `textShadows`，其他图层是 `shadows`；文字图层没有模糊（读作没有，改动跳过它）。
  - 选中里有文字图层时：阴影行只有 X、Y、Blur 和颜色、透明度，没有 Spread；类型菜单只有 Drop shadow（模糊行的类型菜单另外保留它自己的类型）。"+" 加的仍是 Figma 默认投影（0 / 4 / 4，#000000 25%）。
  - 多选文字与其他图层：阴影按去掉 spread 后比较，相同就显示同一组阴影，改 X、Y、Blur、颜色时每个图层改自己的那一组，其他图层原有的 spread 不动；不同（例如另一图层有内阴影）显示 "Mixed shadows"，"+" 用一个新投影替换、移除一起去掉，文字写 `text-shadow`，其他写 `box-shadow`。其他图层有模糊时，文字读作没有，模糊行显示 Mixed（ticket 12 的规则）；在这一行输入、移除或换类型只作用于能有模糊的图层。
  - 把一个文字投影改到 X、Y、Blur 都是 0 也就是去掉它，同 ticket 12。
- 改动说明（`design-values.ts`）：`textShadows` 的标题也是 "Shadows"，说法同 ticket 12 但不提 spread："a drop shadow (x 0px, y 4px, blur 4px, #000000 at 25% opacity)"；参考样式是 `text-shadow`。Skill 补了一句文字图层的投影写成 `text-shadow`、没有扩展。
- 测试：辅接缝 `edits.browser.test.ts`（多层文字投影的写与读、每个实例、只有文字图层有、不接受内阴影和扩展、页面已有的 `text-shadow` 与不画东西的阴影）；命令行接缝 `cli.test.ts`（说法与参考样式）；主接缝 `properties.spec.ts`（文字图层加、改、删、撤销与类型菜单；页面已有的 `text-shadow`；文字与卡片多选：Mixed 与替换、spread 隐藏且保留、内阴影与模糊显示 Mixed、移除）。

**已知限制**

- `text-shadow` 会继承：父元素设的文字阴影在文字图层上读作它自己的投影；"Currently set by" 只找写在图层元素自身上的规则，这时为空，改动说明里也不会指向父元素的规则。
- 文字图层页面上已有的 `filter: blur()` 不读：和其他图层一起选中时那一行仍显示 Mixed，移除、修改都不会动文字图层的模糊（本 ticket 不给文字图层做模糊）。
- 多选文字与有模糊的图层时，模糊行一直是 Mixed：输入一个值只改有模糊的图层，文字读作没有，所以不会变成一个统一的值。
- 阴影按去掉 spread 比较：其他图层的阴影只靠 spread 才画出东西（如 Tailwind 的 ring）时，把 X、Y、Blur 都改成 0 会去掉文字的那个而保留它的，之后显示 Mixed。
- 只有文字的 `<button>`、`<a>` 也是文字图层：Effects 显示并写它的 `text-shadow`，页面上它已有的 `box-shadow` 不显示。
