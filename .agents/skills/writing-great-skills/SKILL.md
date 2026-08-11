---
name: writing-great-skills
description: 编写与修改 Skill 的参考 —— 让 Skill 可预测的词汇与原则。
disable-model-invocation: true
---

## 语言与术语

本 Skill 与用户的所有对话、生成的提问、选项、解释、总结，以及后续生成或修改的所有文档（Markdown、HTML、ADR、Issue、Spec、报告、YAML 中的 `description` / `display_name` / `short_description` 等自然语言字段）一律使用**简体中文**，除非用户明确要求切换到其他语言。

代码标识符、类型 / 函数 / 文件名、路径、CLI 命令、配置键、API / 协议 / 库 / 产品名、缩写、字面量（commit hash、行号、错误信息等）保持原文不变。

本 Skill 的所有规范术语（见 [`GLOSSARY.md`](GLOSSARY.md)）一律保留**英文原文**，正文用中文解释；首次定义处可在英文术语后用括号给出中文释义。

---

Skill 的存在，是为了让一个随机系统在运行上变得**可预测（Predictability）** —— 这里的可预测是指 Agent 每次跑出**同样的过程**，而不是同样的输出；下文所有杠杆都为这一条根本价值服务。

**加粗术语**在 [`GLOSSARY.md`](GLOSSARY.md) 中给出完整定义，遇到不熟悉词条请先回查。

## Invocation（调用方式）

两种选择，代价不同：

- **Model-Invoked（模型调用）** Skill 保留 **description**，让 Agent 能自主触发，其他 Skill 也能命中它（你仍然可以手敲名字调用）。它会贡献 **context load**（上下文负载）—— 每轮对话都会把 description 放进窗口。机制：不写 `disable-model-invocation`，并在面向模型的 description 里写丰富的触发短语（"Use when the user wants…, mentions…"）。
- **User-Invoked（用户调用）** Skill 把 description 从 Agent 视野里拿掉：只有你手敲名字能触发，其他 Skill 都不能。它零上下文负载，但代价是 **cognitive load（认知负载）** —— _你_ 自己要当索引，记得住它存在。机制：写 `disable-model-invocation: true`，description 变成面向人的一句话摘要，去掉触发词列表。

只有当 Agent 必须自己命中、或别的 Skill 必须命中它时，才用 model-invoked。如果只可能手敲，就做成 user-invoked，省掉上下文负载。

User-Invoked Skill 多到记不住时，叠加的认知负载要用 **Router Skill** 治：一个 User-Invoked Skill，列出其他 Skill 名字与各自的命中时机。

## 撰写 description

Model-Invoked Skill 的 **description** 干两件事 —— 说清 Skill 是什么，并列出应该触发它的 **branch（分支）**。每多一字都会增加 **context load**，所以 description 比正文更值得修剪：

- **把 Skill 的 leading word 前置到 description 开头** —— description 是它做调用工作的主战场。
- **每个分支一条触发**。同一个分支的同义词是 **duplication（重复）** —— "build features using TDD … asks for test-first development" 是同一个分支被写了两次。合并；只保留真正不同的分支。
- **砍掉正文已经包含的同一性**。description 只留触发，外加一条"另一个 Skill 需要…"的可达声明。

## Information Hierarchy（信息层级）

Skill 由两种内容构成 —— **steps（步骤）** 和 **reference（参考）** —— 二者可以自由混搭：可以全步骤、全参考、或两者兼有。核心决策是用哪一种、各放在 **information hierarchy**（信息层级）的哪一格 —— 这是一把按 Agent 对素材的"立即需要度"排序的梯子：

1. **In-skill step（内联步骤）** —— `SKILL.md` 中有序的动作，最高一层：Agent 要做什么，按顺序。每一步以一条 **completion criterion（完成判据）** 收尾 —— 即判断这件事已经做好的条件。要让它 _可验证_（Agent 能区分做完与没做？），在需要时还要 _穷尽_（"每个改过的模型都对得上账"，而不是"产出一份改动清单"） —— 含糊的判据会招来 **premature completion（过早收尾）**。
2. **In-skill reference（内联参考）** —— `SKILL.md` 里的定义、规则或事实，按需查阅。它常常是一个正当的扁平同级集合（一份评审的所有规则排在同一档）—— 这是合理布局，不是异味。_本 Skill 全文都是 reference_。
3. **External reference（外部参考）** —— 参考从 `SKILL.md` 移出到独立文件，通过 **context pointer（上下文指针）** 触发、按需加载。（涵盖从 _已披露的_ 参考 —— 如 `GLOSSARY.md` 这种兄弟文件，仍算 Skill 的一部分 —— 到完完全全的 **external reference**，放在 Skill 系统之外、任何 Skill 都能指向。）

一条苛刻的完成判据会驱动充足的 **legwork（功课）** —— Agent 在工作中挖到的活儿 —— 无论 Skill 有没有步骤；因为"每条规则都应用过"既约束顺序步骤，也约束扁平参考。

下沉得不够，顶部就臃肿；下沉得太多，你又把 Agent 真正需要的材料藏起来了。整条决策就在这一拉一扯之间。

**Progressive disclosure（渐进披露）** 正是沿着梯子下移的动作 —— 从 `SKILL.md` 出去，进到链接文件 —— 让顶部保持可读。机制：Skill 目录下放一个以内容命名的 `.md` 链接文件（本 Skill 把全部定义披露到 `GLOSSARY.md`）。一个 Skill 可能被多种方式使用，每种不同的用法就是一个 **branch（分支）** —— 不同运行各走不同的路径。分支是最干净的披露测试：每个分支都要的写内联，只有部分分支要的推到指针后。**Context pointer** 的 _措辞_，而不是它的目标，决定 Agent 何时、以多可靠的程度去抓取材料。

梯子决定一块材料 _沉到多深_，**co-location（同位共置）** 则决定一旦到那一层，_什么与它并排_：把一个概念的定义、规则、注意事项放在同一标题下，而不是散落各处 —— 这样读到一处就会把邻近的内容一并带进来。

## 何时拆分

**Granularity（粒度）** 描述你把 Skill 切得多细；每切一刀就花掉两份负载之一，所以只在切得值得时拆。两种切法：

- **按 invocation 拆** —— 当你有一个独立的 **leading word** 想让它自己触发，或另一个 Skill 必须命中它时，拆出一个 **Model-Invoked** Skill。你要为新的常驻 **description** 付出 **context load**，所以这种独立可达必须值得。
- **按 sequence 拆** —— 当一串 **steps** 中，当前步骤之后的步骤（该步的 **post-completion steps（后置步骤）**）在诱惑 Agent 抢跑当前步骤（**premature completion**）时，把步骤序列拆开。把它们移出视野能鼓励 Agent 在当前任务上做更多 **legwork**。

## 修剪

让每个含义只在一个 **single source of truth（单一事实源）**：一个权威位置，修改行为只需改一处。

逐行检查 **relevance（相关性）**：这一行还与 Skill 的工作相关吗？

然后逐句（而不是只逐行）揪出 **no-op（空操作）** 句：把每个句子单独过一遍 no-op 测试，不通过的整句删掉，而不是改写它。大胆一点 —— 大多数失败的散文应该删掉，而不是重写。

## Leading words（领词）

**Leading word** 是一种紧致的概念，已经活在模型的预训练里，Agent 在运行 Skill 时会拿它来思考（例如 _lesson_、_fog of war_、_tracer bullets_）。在文本里反复出现（虽然不一定 —— 一个强领词也许只需一次），它会累积出分布式定义，用最少的 token 把整片行为锚定下来，靠调用模型已有的先验。

它对可预测性有双重服务。在正文中它锚定**执行（execution）**：每当这个词出现，Agent 都会拉出同样的行为。在 description 中它锚定**调用（invocation）**：同一个词同时出现在你的提示、文档和代码里时，Agent 会把这种共享语言和该 Skill 关联起来，更可靠地触发它。

主动寻找把 Skill 改造成使用 leading words 的机会。三处地方写出来的同义三元组是 **duplication**，description 用一整句去比划一个概念 —— 都该被 **collapse** 成一个 token。例子：

- "fast, deterministic, low-overhead" → _tight_ —— 把跨阶段的同一品质压缩进一个预训练词（一个 _tight_ 循环）。
- "a loop you believe in" → _red_ —— 把一个模糊门槛换成一个二元可观察的状态（循环在 bug 处变 _red_，或不红）。

收益双倍：少 token，_而且_ 给 Agent 思考时一个更锋利的钩子。假设每个 Skill 都在背负着能用 leading words 收编的复述 —— 去把它们找出来。

## Failure modes（失败模式）

用它们诊断用户可能在 Skill 上遇到的状况。

- **Premature completion（过早收尾）** —— 当前步骤还没真正做完就结束，注意力滑向"已经完成"。防御，按顺序：先把 completion criterion 磨锋利（便宜、局部）；只有在判据本质上含糊 _且_ 真的观察到抢跑时，才按序列拆分把后置步骤藏起来。
- **Duplication（重复）** —— 同一个含义出现在多处。代价是维护成本和 token，并让一个含义在层级上的权重被推得超过它真正的位次。
- **Sediment（沉淀）** —— 陈旧层堆积下来，因为加上去感觉安全、删掉感觉危险。任何没有修剪纪律的 Skill 的默认归宿。
- **Sprawl（蔓延）** —— Skill 太长，哪怕每行都是活的、唯一的。损害可读性、可维护性，浪费 token。处方是层级：把 **reference** 用指针披露，并按 **branch** 或 sequence 拆分，让每条路径只携带它需要的内容。
- **No-op（空操作）** —— 模型本来就会照做的一行，你却为它付负载说了一句空话。测试：与默认行为相比，这行会改变行为吗？一个弱的 leading word（_be thorough_ 而 Agent 本来就挺 thorough）是 no-op；解药是更强的词（_relentless_），不是换技巧。
- **Negation（否定）** —— 用禁止来引导会反噬：_不要想大象_ 把大象点名为可用而不是不可用。提示 **正向** —— 描述目标行为，让被禁的那一条根本不被说出；只有作为硬护栏、且无法用正向措辞时才用禁止，并同时配上一条"应该做什么"。