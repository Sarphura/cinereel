---
name: improve-codebase-architecture
description: 扫描代码库寻找可加深的机会，以可视化 HTML 报告展示，并就所选机会进行质疑式讨论。
disable-model-invocation: true
---

# 改进代码库架构

发现架构层面的摩擦，并提出**可加深的机会**——即将浅层模块改造为深层模块的重构。目标是提升可测试性与 AI 可导航性。

本命令以项目的领域模型为依据，并建立在共享的设计词汇之上：

- 运行 `/codebase-design` 技能以获取架构词汇（**Module**、**Interface**、**Depth**、**Seam**、**Adapter**、**Leverage**、**Locality**）及其原则（删除测试、“接口即测试面”、“一个 Adapter = 假设的 Seam，两个 = 真实的 Seam”）。在所有建议中精确使用这些术语——不要漂移到 “component”“service”“API”“boundary”。
- `CONTEXT.md` 中的领域语言为优质 Seam 给出名字；`docs/adr/` 中的 ADR 记录了本命令不应重新讨论的决策。

## 语言与术语

- **默认语言**：简体中文。本 Skill 与用户的对话、问题、选项、总结，以及生成的 HTML 架构报告、Markdown/ADR 等文档，均使用简体中文。仅当用户明确要求其他语言时才切换。
- **保留英文**的内容：代码标识符、类型/函数/文件名、路径、CLI 命令、配置键、API/协议/库/产品名、缩写和字面量。
- **架构术语保留英文原文**：`Module`、`Interface`、`Implementation`、`Depth`、`Seam`、`Adapter`、`Leverage`、`Locality`。中文正文围绕这些英文术语组织，不得替换为其他近义词。
- **若使用子代理**，其 prompt 必须明确要求以简体中文返回分析。

## 流程

### 1. 探索

**先定范围再扫描——YAGNI。** 加深一个 Module 的价值在于让它未来的修改更容易，因此要特别关注代码库中近期频繁变动的部分。在动手观察之前，先决定*看哪里*：

- 如果用户给出了方向——某个 Module、子系统、痛点——直接接受，跳过下面的推断。
- 否则，回溯一段较长的提交历史（`git log --oneline`），找出代码库的热点——反复出现的文件与区域——让这些路径优先吸引你的注意。如果变更分散、没有明显热点，则扩大扫描范围。

先阅读项目的领域词汇表（`CONTEXT.md`）以及你将触及区域的 ADR。

然后使用 Agent 工具，以 `subagent_type=Explore` 走查代码库。不要套用僵化的启发式——以探索式的方式进行，并记录你感受到摩擦的位置：

- 理解一个概念是否需要在多个小模块之间反复跳转？
- 哪些 Module 是**浅层**的——接口几乎与实现一样复杂？
- 哪里为了可测试性抽出了纯函数，但真正的 bug 隐藏在它们的调用方式中（缺乏**Locality**）？
- 紧耦合的 Module 是否在其 Seam 处发生泄漏？
- 代码库的哪些部分未被测试，或难以通过现有 Interface 进行测试？

对任何你怀疑是浅层的东西应用**删除测试**：删除它会让复杂度集中，还是仅仅平移？得到“会集中”的答案就是你要的信号。

### 2. 以 HTML 报告展示候选

将一个自包含的 HTML 文件写入 OS 临时目录，避免污染仓库。从 `$TMPDIR` 解析临时目录，回退到 `/tmp`（Windows 上回退到 `%TEMP%`），写入路径 `<tmpdir>/architecture-review-<timestamp>.html`，确保每次运行都得到新文件。为用户打开它——Linux 用 `xdg-open <path>`，macOS 用 `open <path>`，Windows 用 `start <path>`——并告知绝对路径。

报告使用 **Tailwind via CDN** 进行布局与样式，使用 **Mermaid via CDN** 绘制那些以图/流程/时序能可靠表达结构的图。将 Mermaid 与手工 CSS/SVG 视觉混用——当关系是图状（调用图、依赖、时序）时用 Mermaid；当需要更具编辑感（质量图、横截面、折叠动画）时使用手工 div/SVG。每个候选都配一张**Before/After 可视化**。要做得视觉化。

每个候选渲染一张卡片，包含：

- **Files**——涉及的文件/Module
- **Problem**——当前架构为何造成摩擦
- **Solution**——用平实的语言描述将要发生的变化
- **Benefits**——围绕 Locality 与 Leverage 展开，并说明测试将如何改善
- **Before / After diagram**——左右并排、手绘风格，呈现浅层状态与加深状态
- **Recommendation strength**——取值为 `Strong`、`Worth exploring`、`Speculative` 之一，作为徽章渲染

报告末尾添加**Top recommendation**段落：你会首先攻克哪个候选，以及原因。

**领域词汇使用 `CONTEXT.md` 中的术语；架构词汇使用 `/codebase-design` 中的术语。** 如果 `CONTEXT.md` 定义了“Order”，就讨论“the Order intake module”——而不是“the FooBarHandler”，更不是“the Order service”。

**ADR 冲突**：若某个候选与现有 ADR 相悖，仅在摩擦真实到值得重新审视该 ADR 时才提出。在卡片中明确标注（例如一个警示框：_“与 ADR-0007 相悖——但值得重开，因为……”_）。不要罗列 ADR 禁止的每一个理论性重构。

完整的 HTML 脚手架、图示模式与样式指引见 [HTML-REPORT.md](HTML-REPORT.md)。

不要立刻提出 Interface。文件写入完成后，向用户提问：“你想深入探索哪一个？”

### 3. 质疑循环（Grilling loop）

用户选定候选后，运行 `/grilling` 技能，与用户一起走过决策树——约束、依赖、加深后 Module 的形态、Seam 后面藏着什么、哪些测试可以保留。

随着决策逐步明晰，副作用就地发生——运行 `/domain-modeling` 技能，使领域模型保持同步：

- **给加深的 Module 起了一个 `CONTEXT.md` 里没有的名字？** 把该术语加入 `CONTEXT.md`。若文件不存在则按需创建。
- **在对话中收紧了某个模糊术语？** 立刻更新 `CONTEXT.md`。
- **用户以承重级的理由拒绝了候选？** 提供一份 ADR，措辞为：_“要不要把这一点记入 ADR，避免未来的架构评审再提出来？”_ 仅在该理由对未来探索者避免重复建议真正必要时才提议——跳过临时性的理由（“现在不值得做”）与不言自明的理由。
- **想探索加深后 Module 的备选 Interface？** 运行 `/codebase-design` 技能，使用其“design-it-twice”并行子代理模式。