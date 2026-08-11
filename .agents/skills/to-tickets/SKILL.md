---
name: to-tickets
description: 将计划、Spec 或当前对话拆解为一组 tracer-bullet ticket，并发布到配置的 tracker；每条 ticket 声明其阻塞边——本地场景下每条 ticket 一个文件、依赖关系以文本形式列出，真实 tracker 上则使用原生的阻塞链接。
disable-model-invocation: true
---

## 语言与术语

与用户的对话、问题、选项、拆分方案和总结一律使用简体中文；生成或修改的所有 Markdown / ADR / Issue / Spec / PRD / ticket 文档也以简体中文撰写。如果用户明确要求其他语言，再切换语言。代码标识符、类型 / 函数 / 文件名、路径、CLI 命令、配置键、API / 协议 / 库 / 产品名、缩写以及机器读取字面量（如 `ready-for-agent`、`/setup-matt-pocock-skills`）保持原文。`tracer bullet`、`vertical slice`、`expand–contract`、`frontier`、`Spec`、`PRD`、`ADR`、`Issue`、`ticket`、`Blocked by`、`Status`、`Parent`、`What to build`、`Acceptance criteria` 等术语可保留英文，但模板标题、字段说明、提问内容与示例文字必须用中文组织句子。

# 拆为 Ticket

将计划、Spec 或对话拆解为一组 **ticket**——tracer-bullet vertical slice，每条 ticket 显式声明其**阻塞关系**。

issue tracker 与 triage 标签词汇应该已经被提供给你——如果没有，请先运行 `/setup-matt-pocock-skills`。

## 流程

### 1. 收集上下文

直接从对话上下文已有的内容开始工作。如果用户在调用参数中传入了引用（spec 路径、Issue 编号或 URL），先获取并完整阅读其正文与评论。

### 2. 探索代码库（可选）

如果此前尚未探索过代码库，请先进行探索以了解代码现状。Ticket 标题与描述应使用项目的领域术语词汇，并尊重你所触及区域内的 ADR。

寻找可以预先重构（prefactor）的机会，让实现更容易——"先让变更变简单，再做简单的变更"。

### 3. 起草 Vertical Slice

将工作拆解为 **tracer bullet** ticket。

<vertical-slice-rules>

- 每个 slice 必须切出"狭窄但完整"的一刀，穿透所有层（schema、API、UI、测试）——是 vertical，而不是某一层的 horizontal slice。
- 每个完成态的 slice 都可以独立演示或独立验收。
- 每个 slice 的体量应适合在单个全新的上下文窗口内完成。
- 任何预先重构都应该先于 slice 完成。

</vertical-slice-rules>

为每条 ticket 标注其**阻塞边**——即在它开始之前必须先完成的其它 ticket。没有阻塞者的 ticket 可以立即开始。

**Wide refactor（影响面广泛的重构）是对 vertical slicing 的例外。**所谓 **wide refactor**，是指那种"一次机械改动"——重命名一列、重新类型化一个共享符号——其**影响半径**会扩散到整个代码库，单次编辑就会同时破坏成千上万的调用点，没有 vertical slice 可以绿色落地。不要硬塞进 tracer bullet，而要把它的执行序列组织成 **expand–contract**。先 expand：在旧形式旁并排加入新形式，确保一切都还能工作；再按批次（按包、按目录、以影响半径大小为粒度）把调用点迁移过去，每一批单独成 ticket、阻塞于 expand 之后，让 CI 一批一批地保持绿色，因为旧形式暂时还在；最后 contract：删除旧形式，前提是已经没有调用者引用它，该删除 ticket 阻塞于每一批迁移 ticket 之后。如果连批次自身都无法独立保持绿色，那就保留整体序列，但让所有批次共享一个集成分支，并由一个最终的 integrate-and-verify ticket 阻塞所有批次——只有在那里才承诺绿色落地。

### 4. 与用户确认

以编号列表形式向用户呈现拟定的拆分方案。每条 ticket 展示：

- **标题**：简短而有描述性的名称
- **阻塞于**：哪一条（些）其它 ticket 必须先完成（若无则省略）
- **交付内容**：从用户视角看，这条 ticket 让哪些端到端行为得以工作

向用户询问：

- 这样的粒度是否合适？（太粗 / 太细）
- 阻塞关系是否正确——每条 ticket 是否只依赖于真正卡住它的那些 ticket？
- 是否需要将某些 ticket 合并或进一步拆分？

迭代直到用户确认整个拆分方案。

### 5. 发布 ticket 到所配置的 tracker

发布获批的 ticket。**发布方式**取决于 `/setup-matt-pocock-skills` 所配置的 tracker——ticket 内容在两种方式下都一样，只是阻塞关系的表达形式不同：

- **本地文件** → 在 `.scratch/<feature-slug>/issues/<NN>-<slug>.md` 下为每条 ticket 单独写一个文件，编号从 `01` 起、按依赖顺序排列（阻塞者在前）。每个文件的"阻塞于"列出其所依赖的 ticket 编号或标题。每条 ticket 一个文件，绝不合并为单一文件，使用下面的逐 ticket 模板。
- **真实 issue tracker（GitHub、Linear 等）** → 按依赖顺序（阻塞者在前）逐条发布，使每条 ticket 的阻塞关系能引用真实标识符。优先使用该平台原生的阻塞或子 issue 关系；如无原生支持，则将每条 ticket 的"阻塞于"设置为对应的阻塞 issue。除非另有说明，给 ticket 打上 `ready-for-agent` triage 标签——这些 ticket 在设计上就是 agent 可抓取的。

沿 **frontier** 工作：任一条 ticket，只要它的所有阻塞者都已经完成，就可以开始。对于一条纯粹的链式依赖，从上到下推进即可。

不要关闭或修改任何父 issue。

<local-ticket-template>

# <NN> — <Ticket 标题>

**交付内容：** 从用户视角描述这条 ticket 让哪些端到端行为得以工作——不要按"逐层"罗列实现清单。

**阻塞于：** 列出阻塞本 ticket 的 ticket 编号或标题；若无阻塞者，则写"无，可立即开始"。

**状态：** ready-for-agent

- [ ] 验收标准 1
- [ ] 验收标准 2

</local-ticket-template>

<issue-template>

## 父 Issue

对 tracker 上父 issue 的引用（如果来源是一条已存在的 issue，否则省略本节）。

## 交付内容

从用户视角描述这条 ticket 让哪些端到端行为得以工作——不要按"逐层"罗列实现清单。

## 验收标准

- [ ] 验收标准 1
- [ ] 验收标准 2

## 阻塞于

- 列出每一条阻塞 ticket 的引用；若无则写"无，可立即开始"。

</issue-template>

无论采用哪种形式，都应避免指明具体的文件路径或代码片段——它们很快就会过时。例外：如果某个原型产出的片段能以比散文更精确的方式编码一项决策（状态机、reducer、schema、类型形态），可以内联它并简短标注它来自原型。裁剪到只剩决策密度最高的部分——不是可运行的 demo，只保留那些关键片段。
