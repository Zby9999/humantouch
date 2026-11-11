# 138: shadow root 里的层能挪、排顺序、做成 Stack / Grid、改文字、删除

**What to build:** 在 137 的基础上，shadow root 里的层也能做结构上的改动：

- 拖动；
- 在容器里换顺序；
- ⇧A 做成 Stack、做成 Grid；
- 双击改文字；
- 复制、删除；
- 放成 Absolute。

改动单、`claim`、`done` 照对待页面上别的层的做法处理。

- 跨 shadow 边界的挪动先不支持，也就是把层从 shadow root 挪到外面，或者从外面挪进去。拖到边界外时，照「放不进去」的样子处理，并给出提示。具体怎么提示，和设计师定。
- 文字改动、复制、删除照现在的规则写进改动单。层有源码位置时照常落地；没有时照「找不到位置」的规矩说。

参考 135–137；用词以 GLOSSARY.md 为准。

**Blocked by:** 137

**Status:** ready-for-agent

- [ ] e2e：在 135 的测试页面里，shadow root 里的两层换顺序、改一层的文字、把几层做成 Stack。画布、各视图、改动列表都对。
- [ ] 拖到 shadow 边界外：放不进去，提示出现；具体样子照和设计师定的做。
- [ ] 加一个 bench 场景（结构改动）：`--dry` 正确，`--scripted` 落地后 `done` 核对为显示了；已有场景的 `claim-out` 逐字不变。
- [ ] 没有 shadow root 的页面，结构改动的已有测试全过；整套 e2e 过；perf（headless）不变差。
