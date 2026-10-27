# 组件沙盒规格（占位）

**Status:** 未开始，待 Vernier Kit 第一版这一轮补完后单独立项。

已定的方向见 [ADR 0007](../../docs/adr/0007-component-sandbox.md)、[GLOSSARY.md](../../GLOSSARY.md) 中的"组件沙盒"，以及 [docs/goals.md](../../docs/goals.md) 中的 Flex 第二版指标。第一版只在选中工具条中预留了 States 入口的位置（见 `.scratch/vernierkit/spec.md`）。

## 立项时的流程

1. `/grill-with-docs`：拷问沙盒的范围与交互（状态、props 组合、组件级动效）。
2. `/prototype`（经 `/handoff` 进出）：验证能否通过开发服务器活加载组件源码模块，以及状态与变体平铺的界面。
3. `/to-spec` 写本文件，`/to-tickets` 拆到同目录的 `issues/` 下。
