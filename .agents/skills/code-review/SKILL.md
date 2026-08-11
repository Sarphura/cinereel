---
name: code-review
description: 沿两条轴审查自某个固定点（commit、branch、tag 或 merge-base）以来的变更 —— Standards（代码是否遵循仓库文档化的编码规范？）与 Spec（代码是否如实实现了原始 issue / PRD 的要求？）。两个审查以并行子代理方式运行，并把结果并列呈现。用户想要评审分支、PR、进行中的变更，或要求"review since X"时使用。
---

## 语言与术语

本 Skill 与用户的所有对话、生成的提问、选项、解释、总结，以及后续生成或修改的所有文档（Markdown、HTML、ADR、Issue、Spec、报告、子代理 prompt 与返回报告、YAML 中的 `description` / `display_name` / `short_description` 等自然语言字段）一律使用**简体中文**，除非用户明确要求切换到其他语言。

代码标识符、类型 / 函数 / 文件名、路径、CLI 命令、配置键、API / 协议 / 库 / 产品名、缩写、字面量（commit hash、行号、错误信息、diff 片段、Fowler 书名、Smell 名等）保持原文不变。

本 Skill 的核心轴名 `Standards` 与 `Spec` 保留英文原文；Fowler 书中的 Smell 名称（如 _Mysterious Name_、_Duplicated Code_ 等）也保留英文原文。YAML 键、frontmatter 键和 Skill `name` 不变；`description`、`display_name`、`short_description` 中文化，但技术术语保留。

发给子代理的 prompt **必须**明确要求：返回的审查报告使用简体中文，标题、引言、结论、汇总等自然语言段落均为中文；引用的源码片段、规范原文、commit hash / 行号 / 错误信息 / Fowler Smell 名等字面量保持原文。

---

对 `HEAD` 与用户给定的固定点之间的 diff 做两轴评审：

- **Standards（规范轴）** —— 代码是否符合仓库文档化的编码规范？
- **Spec（需求轴）** —— 代码是否如实实现了原始的 issue / PRD / spec？

两条轴以**并行子代理**方式运行，避免污染彼此上下文；之后由本 Skill 汇总它们的发现。

如果 issue 跟踪器尚未提供给你，且 `docs/agents/issue-tracker.md` 缺失，先运行 `/setup-matt-pocock-skills`。

## 流程

### 1. 锁定固定点

无论用户说的是什么 —— 一个 commit SHA、branch 名、tag、`main`、`HEAD~5` 等等 —— 那就是固定点。如果用户没指定，先问。

一次性记录 diff 命令：`git diff <fixed-point>...HEAD`（三点式，与 merge-base 比）。同时记录 commit 列表 `git log <fixed-point>..HEAD --oneline`。

继续之前，先确认固定点能解析（`git rev-parse <fixed-point>`），且 diff 非空。错误的 ref 或空 diff 应当在此处就失败 —— 而不是跑到两个并行子代理里才发现。

### 2. 定位 spec 来源

按以下顺序寻找原始 spec：

1. commit 信息中引用的 issue（`#123`、`Closes #45`、GitLab `!67` 等）—— 通过 `docs/agents/issue-tracker.md` 中的流程获取。
2. 用户作为参数传入的路径。
3. `docs/`、`specs/`、`.scratch/` 下与 branch 名或功能匹配的 PRD / spec 文件。
4. 什么都找不到时，问用户 spec 在哪。如果用户说没有，**Spec** 子代理跳过，并报告"无 spec 可用"。

### 3. 定位规范来源

仓库中任何说明代码该怎么写的文档，如 `CODING_STANDARDS.md` 或 `CONTRIBUTING.md`。

在仓库自身文档之上，Standards 轴始终携带下方的 **Smell 基准线** —— 一组固定的 Fowler 代码异味（出自 _Refactoring_ 第 3 章），即便仓库没文档化也适用。两条规则约束它：

- **仓库优先**。文档化的仓库规范永远胜出；若仓库认可了基准线本会标记的某条做法，则压制该 smell。
- **永远是判断题**。每条 Smell 都是打了标签的启发式（"可能是 Feature Envy"），从不视为硬性违规 —— 并且，和本文件里所有规范一样，工具已经强制执行的就跳过。

每条 Smell 按 *是什么* → *如何修复* 的结构读，对照 diff 比对：

- **Mysterious Name** —— 函数、变量或类型的名字没有揭示它做什么、装什么。→ 重命名；如果想不出诚实的名字，说明设计本身就是糊的。
- **Duplicated Code** —— 同一逻辑形态在改动中出现多处（不同 hunk 或不同文件）。→ 抽取共享形态，让两边都调用它。
- **Feature Envy** —— 一个方法更多地去够另一个对象的数据，而不是自己的。→ 把方法挪到它羡慕的那个数据上。
- **Data Clumps** —— 同一组字段或参数总是结伴出现（一个类型要出生了）。→ 把它们合成一个类型，传递这个类型。
- **Primitive Obsession** —— 用基本类型或字符串顶替一个本该有自己类型的领域概念。→ 给这个概念一个自己的小类型。
- **Repeated Switches** —— 同一类型上的 `switch` / `if` 级联在改动中多次出现。→ 换成多态，或让两边共用一张映射。
- **Shotgun Surgery** —— 一个逻辑变更被迫在多个文件里散弹式改动。→ 把"一起变的东西"收拢到一个模块。
- **Divergent Change** —— 一个文件或模块被多个互不相关的原因修改。→ 拆分，让每个模块只为一个原因改变。
- **Speculative Generality** —— 为 spec 并不存在的需求添加抽象、参数或钩子。→ 删掉它；内联回去，直到真有需要再说。
- **Message Chains** —— 调用方不该依赖的 `a.b().c().d()` 长链导航。→ 把这条步进藏到第一个对象的一个方法后面。
- **Middle Man** —— 一个类或函数大部分只是再委托出去。→ 砍掉它，直接调真正的目标。
- **Refused Bequest** —— 子类或实现者忽略或覆写了它继承的大部分东西。→ 丢掉继承，改用组合。

### 4. 并行启动两个子代理

发一条消息，包含两次 `Agent` 工具调用。两边都用 `general-purpose` 子代理。

**Standards 子代理 prompt** —— 包含：

- 完整的 diff 命令与 commit 列表。
- 第 3 步找到的规范源文件清单，**加上第 3 步那份 Smell 基准线原文** —— 子代理没有其他方式访问它。
- 简报："**请用简体中文返回报告。** 逐文件 / 逐 hunk 报告（a）diff 中违反文档化规范的每一处：引用规范（文件 + 规则条款）；以及（b）你识别出的基准线 Smell：写出名字并引用 hunk。要区分硬性违规与判断题 —— 文档化规范的违反可以是硬性，基准线 Smell 永远是判断题，且文档化的仓库规范覆盖基准线。工具已经强制执行的跳过。控制在 400 字以内。"

**Spec 子代理 prompt** —— 包含：

- diff 命令与 commit 列表。
- spec 的路径或已抓取内容。
- 简报："**请用简体中文返回报告。** 报告：(a) spec 要求但缺失或不完整的需求；(b) diff 中未在 spec 中要求的行为（scope creep）；(c) 看实现似乎做了、但实现看起来不对的需求。每条结论引用 spec 原文。控制在 400 字以内。"

如果 spec 缺失，跳过 Spec 子代理，并在最终报告里注明。

### 5. 汇总

把两份报告分别放在 `## Standards` 和 `## Spec` 标题下，原文呈现或轻量清理。**不要**合并或重排 —— 两轴刻意保持独立（见 _为什么是两轴_）。

最后用一行总结：每轴的发现总数，以及该轴内最严重的问题（如有）。不要跨轴选出一个"胜者" —— 那正是分离要防止的重排。

## 为什么是两轴

一份改动可以过一轴而败另一轴：

- 符合所有规范但实现了错的事 → **Standards pass，Spec fail**。
- 精确按 issue 要求做但违背项目惯例 → **Spec pass，Standards fail**。

分别报告，避免一轴掩盖另一轴。