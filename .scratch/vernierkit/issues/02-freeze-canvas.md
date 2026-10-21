# 02: 冻结画布与编辑模式外壳

**What to build:** 设计师点击切换按钮进入编辑模式：当前页面状态被冻结成画布（同源 iframe 中的整页副本，按原始宽度显示），界面变为仿 Figma 的三栏外壳（左图层树占位、中画布、右属性面板占位），可缩放、平移；再次点击回到预览模式。本 ticket 同时回答规格中的两个先验证问题：冻结的速度与还原度、使用 vh 单位的页面如何正确显示。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 01

**Status:** ready-for-agent

- [x] 进入编辑模式后，画布上的页面与原页面在视觉上一致（字体、固定定位元素、动态注入的样式）
- [x] 画布按原始页面宽度显示；空格加拖动平移，⌘ 加滚轮或双指捏合缩放，⇧1 缩放到适合窗口
- [x] 冻结时页面上进行中的动画直接跳到结束状态
- [x] 视频、图表画布显示为冻结时刻的静态画面；跨域 iframe 显示为灰色占位框加名称
- [x] 使用 vh 单位的区域（如占满一屏的首屏）在画布上显示正确，解决方式记录在本 ticket 的 Comments 中
- [x] 编辑层外壳跟随系统浅色 / 深色模式
- [x] 在示例项目上实测进入编辑模式的耗时并记录在 Comments 中；如明显超过 300ms，记录原因与对策
- [x] 切换回预览模式后页面恢复可交互

## Comments

**实现记录（2026-10-21）**

- 模块：`client/freezer.ts`（冻结器，`freeze(page, iframe) → Canvas`）、`CanvasView.tsx`（缩放、平移）、`Shell.tsx`（三栏外壳）、`EditorLayer.tsx`（预览 / 编辑模式切换）。编辑模式中切换按钮的名称变为 "Vernier Kit: back to preview mode"。
- 冻结方式：`cloneNode` 整个 `<html>`，写入带 `sandbox="allow-same-origin"` 的 iframe（先 `document.write` doctype 保证与原页面同一渲染模式；脚本不运行），去掉 `script`、`noscript`（脚本关闭时会显示出来）和编辑层宿主。冻结同步完成，原页面不被修改。
- 样式：`<style>` 保留原文；文本为空但 CSSOM 里有规则（CSS-in-JS 的 `insertRule`）时序列化规则；同源 `<link>` 内联为 `<style>`，`url()` 解析为绝对地址，`@import` 展开；`adoptedStyleSheets` 追加到末尾；跨域 `<link>` 在画布中重新加载，字体与跨域样式表最多等 500ms 再测量高度。画布内额外加 `transition: none !important`，之后的编辑可立即生效。
- 动画：CSS 动画在画布中重新开始，随即 `finish()`；无限循环的取消，停在基础样式。脚本驱动的动画（WAAPI，如 motion 库）在原页面上跳到结束前 0.001ms 读取结束值、再跳回原时间点，不触发 `finish` 事件，页面继续播放；读到的结束值以内联样式写到画布。纯 JS 逐帧驱动的动画只能取冻结时刻的样子。
- 无法复制的内容：图表 `<canvas>` 复制位图；`<video>` 变为保存当前帧的 `<canvas>`；跨域 iframe 变为灰色占位框，名称取 `title` / `name` / 域名。这三种都带 `data-vk-frozen` 属性，供 03 识别为静态画面图层。
- 固定定位：画布没有自己的视口。固定定位元素（以及以初始包含块为参照的绝对定位元素）按冻结时的位置钉住：`top` / `left` 加上滚动偏移，宽高和外边距写为像素（`auto` 外边距用于居中弹窗）。祖先带 `transform` 等、由祖先作为包含块的固定定位元素不钉。原生 `<dialog>`（`showModal`）和 popover 在画布中重新打开。内部滚动容器保留滚动位置。
- 画布视图：初始缩放 = min(100%, 适合宽度)，原页面冻结时的滚动位置对齐到顶部。滚轮平移，⌘ / Ctrl + 滚轮与触控板捏合以指针为中心缩放，空格加拖动或中键拖动平移，⇧1 缩放到适合窗口（2%–3200%）。编辑模式期间 `body` 设为 `inert`，页面不接收焦点和点击，退出时恢复。

**铺满一屏的遮罩（2026-10-22，设计师验收时提出）**

固定定位的遮罩（如弹窗的变暗背景，`fixed inset-0`）钉住后只盖住冻结时那一屏，画布上其余部分没有变暗。拉伸遮罩会把它居中的弹窗挪到整页中间，所以改成"视觉上延伸"：冻结器把冻结时铺满整个屏幕、且有背景色或 `backdrop-filter` 的固定定位元素记为 `Canvas.backdrops`（所盖住的那一屏位置、背景色、背景滤镜、累计透明度）。画布视图在 iframe 之外、那一屏的上方和下方补画同样的颜色与模糊。遮罩本身仍是一屏大小，弹窗位置不变，补画的部分不是图层。背景渐变不延伸，只延伸背景色。之后改遮罩填充（11）时，补画部分也要跟着更新。

**vh 的解决方式**

画布 iframe 和整页一样高。不处理的话，`100vh` 会按整页高度计算：首屏被撑高，整页随之再变高。做法：

1. 把视口单位改写为像素：`vh` / `vw` / `vmin` / `vmax` / `vi` / `vb` 及 `s` / `l` / `d` 前缀，按冻结时的 `innerWidth` / `innerHeight` 计算。范围是画布内所有可读样式表的声明（含自定义属性、`@keyframes`、`calc()`）和元素的内联样式；`url()` 与字符串里的内容不改。
2. 依赖视口尺寸的媒体查询（width / height / aspect-ratio / orientation）按原页面 `matchMedia` 的结果固定为 `all` 或 `not all`。宽度断点也要固定，因为画布 iframe 的宽度取 `clientWidth`（不含滚动条），而原页面的媒体查询按 `innerWidth` 计算。
3. `<html>` 的高度固定为原页面上的高度，`height: 100%` 链条仍以视口为终点。

iframe 先按原视口高度插入，等字体加载后再测 `scrollHeight`，设为整页高度。测试：`e2e/tests/edit-mode.spec.ts` 中 "areas sized in viewport units…"（`h-screen` 首屏、内联 `calc(var(--half) - 10px)`、`50vw`）。

**进入编辑模式的耗时**

测量范围是从点击切换按钮到画布绘制完成后（`performance.measure("vernierkit:enter-edit-mode")`），在本机 Chrome 上测得：

- 示例项目（31 个元素）：有界面 12–15ms；无头 30–62ms（首次最慢）
- 额外加 3000 个元素：有界面 30–37ms；无头 35–101ms（首次最慢）

远低于 300ms，暂不需要对策。

**已知限制（留给后续 ticket）**

- 页面打开原生模态 `<dialog>`（`showModal`）时，浏览器把对话框以外的内容全部设为 inert，切换按钮点不到（实测把宿主放进顶层 popover 也不行）。快捷键（用户故事 15）能绕开这个问题，测试里暂用 `dispatchEvent` 触发。建议在 22 兼容性中处理。
- 以下内容不能完整复制：Shadow DOM（Web Components）的内容；`preserveDrawingBuffer: false` 的 WebGL 画布会变成空白；只有 poster 的视频也是空白；同源 iframe 会在画布中重新加载，且脚本被禁用。
- 同一个 `<style>` 既有文本又被 `insertRule` 追加了规则时，追加的规则会丢失；跨域样式表中的视口单位无法改写；sticky 元素停在自然位置。
- 被钉住的固定定位元素带有冻结时写入的内联 `top` / `left` / 宽高 / 外边距，03 的图层模型读取样式时要知道这是冻结产物。
- Safari 的 gesture 捏合事件未处理。
