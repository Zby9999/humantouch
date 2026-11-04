# 101: `claim` 写明其他使用处、类名合并工具和正文样式在哪

**What to build:** ticket 88 的真实跑里，两家都没达到 goals 的「0 次全仓搜索」：Claude 50 次跑里 9 次共 15 次，pi 72 次跑里 23 次共 46 次。多数出在 `claim` 的说明留了空：

- 「This usage only」只说「Other usages stay as they are」，没说其他使用处在哪，Agent 去搜；
- 说「the project's class-merging helper, if it has one」，没说项目到底有没有，Agent 去搜；
- 新文字没说正文样式从哪来（字体、字号设在哪），Agent 去搜。

其余是 pi 列目录、读 Tailwind 内部文件。要做到：`claim` 在这三处直接给出答案（文件和行，或「没有」），让 Agent 不用搜。

参考本功能的 spec.md（同目录上一级），用词以 GLOSSARY.md 为准，并遵守 docs/adr/ 中的决策。

**Blocked by:** 无

**Status:** needs-triage

- [ ] 「This usage only」写明其他使用处的文件和行
- [ ] 写明项目有没有类名合并工具（有的话是哪个、在哪）
- [ ] 新文字写明正文样式从哪来
- [ ] `--dry --claim-out` 前后对比，只多了这三种信息；`--scripted` 全过

## 背景

- ticket 88 真实跑（2026-11-05），原始记录在 88 线的 `bench-results/agents/88-real/`。
- 88 的结论里还有一个可选做法：Skill 第 2 步加一句「The notes name the file and line of each change: read those, and search the project only where a section says the layer is not located.」。88 倾向先修 `claim` 这三处，再看 pi 的数；要不要也加这句，分诊时定。
- 要看改了有没有用，得再跑真实 Agent（用设计师的额度）；分诊时定跑不跑、跑几次。
