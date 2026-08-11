# 术语表 —— 编写高质量 Skill 的领域模型

Skill 存在的意义，是从一个随机系统里挤出确定性；根本价值是 **Predictability（可预测性）**，下面所有术语都是它的杠杆。这是 [`writing-great-skills`](SKILL.md) 的已披露参考。

术语按轴分组：**Invocation（调用）**（Skill 如何被触发）、**Information Hierarchy（信息层级）**（Skill 内容如何组织）、**Steering（引导）**（Skill 如何塑造 Agent 的运行时行为）、**Pruning（修剪）**（Skill 如何保持精简）。每条 **failure mode（失败模式）** 与治它的杠杆并列，标为 _failure mode_。

定义里的 **加粗术语** 本身也定义在本文中；按其标题检索即可。

## Predictability（可预测性）

Skill 让 Agent 在每次运行时表现出同样的 _方式_ —— 是过程一致，不是输出相同（一个头脑风暴 Skill 应当 _可预测地_ 发散；token 在变，行为不变）。其他术语都服务于此根本价值 —— 成本与可维护性是它的表征，不是竞争者。

_避免使用_：consistency、reliability、robustness、output-determinism。

## Invocation（调用方式）

Skill 如何被触发 —— 以及为这一选择付出的两份负载。

### Model-Invoked（模型调用）

保留 **description** 字段的 Skill，因此 Agent 能看到它并自主触发 —— 而人仍可手敲名字，所以 model-invoked 总是 _包含_ 人的可达。并不存在"仅模型"的状态：description 只 _增加_ Agent 的发现能力，绝不会移除人的可达。它为这份可发现性在每轮对话上付出永久的 **context load（上下文负载）**。因为让 Agent 能发现的那条 description 同样让它可被调用，所以它也能被其他 Skill 触达。如果一个 Model-Invoked Skill 的内容全是 **reference**，它也是共享参考的家：另一个 Skill 可以调用它，因此被多个 Skill 需要的参考应集中在一处。只有当 Agent 必须自己命中这个 Skill 时才选 model-invoked；如果它从不在 Agent 手里触发，去掉 description，省掉上下文负载。

_避免使用_：ability、tool、capability。

### User-Invoked（用户调用）

去掉 **description** 的 Skill —— Agent 看不到，只有手敲名字能触发（**user-only**，而 **Model-Invoked** 是 _人 + Agent_）。用 Agent 的可发现性换零 **context load**。因为没有 description，所以除了人没有任何东西能命中它：其他 Skill 也无法触发它。

_避免使用_：procedure、workflow、command。

### Description（描述）

Skill 机器可读的触发器，也是 **Model-Invoked** Skill 不得不始终挂在内存里的那条 **context pointer（上下文指针）**。它单纯的存在 _就是_ 调用轴：留着它 Skill 就是 Model-Invoked（且可被其他 Skill 触达）；删掉它 Skill 就是 **User-Invoked**，只能由人触发。这是 Model-Invoked Skill **context load** 的来源。

_避免使用_：frontmatter、summary。

### Context Pointer（上下文指针）

留在 Agent 上下文里的一条参考，给出一段上下文之外的素材，并编码出"何时抓取它"的条件。**Description** 是顶层 context pointer（上下文窗口 → Skill）；指向已披露文件的指针是同一对象下沉一级。决定 Agent _何时_ 抓取、以及 _多可靠_ 的，是它的 _措辞_，而不是它的目标。一个必要目标却配一条措辞含糊的指针，就是一个方差 bug：先打磨措辞，只有磨不利索才把材料内联回来。

_避免使用_：link、reference、import。

### Context Load（上下文负载）

**Model-Invoked** Skill 对 Agent 上下文窗口施加的代价 —— 它的 **description** 永远加载，既耗 token 又分散注意力。**User-Invoked** Skill 通过没有 description 而逃掉这份代价；也是拆出更多 Model-Invoked Skill 时的刹车。

_避免使用_：token cost、context bloat。

### Cognitive Load（认知负载）

**User-Invoked** Skill 对人施加的代价 —— 人必须脑子里装着：有哪些 Skill、何时该用哪个（人就是索引）。**Model-Invoked** 通过让 Agent 自发现来消除它，也是拆出更多 User-Invoked Skill 时的刹车。它不是要被最小化的代价：它是人的能动性的价格，是某些 Skill 保持 User-Invoked 的原因。在需要人判断的地方花它；在不需要的地方省它。

_避免使用_：human index、burden、overhead。

### Router Skill（路由 Skill）

一种 **User-Invoked** Skill，专门指向你的其他 User-Invoked Skill —— 逐一命名并说清何时该用 —— 这样人只需记住一个 Skill。它只能提示，不能触发：User-Invoked Skill 没有 **description**，所以除了人没有任何东西能命中它们。它是 **cognitive load** 在 User-Invoked Skill 变多时的解药。

_避免使用_：dispatcher、menu、registry、index、router procedure。

### Granularity（粒度）

Skill 切得多细。更细的切分会花掉两份负载之一：更多 **Model-Invoked** Skill 消耗 **context load**（窗口里挤进更多 description，互相抢注意力）；更多 **User-Invoked** Skill 消耗 **cognitive load**（人要记住更多、调用更多）。两种切法指导拆分。按 **invocation** 拆：在你有一个独立 **leading word** 让它自己触发时 —— 一个你真的在提示里用过的触发词 —— 拆出 Model-Invoked Skill。按 **sequence** 拆：在一条步骤序列中，某一步的 **post-completion steps** 需要藏起来时拆分，因为把它隔离到自己的上下文里就把后续步骤清掉了。要警惕反向：合并序列会让每一步的后置步骤对后续步骤可见，招致 premature completion。

_避免使用_：chunking、modularity。

## Information Hierarchy（信息层级）

Skill 内容如何组织，每块在梯子上沉到多深。

### Information Hierarchy（信息层级）

按 Agent 需要素材的立即度排序的 Skill 内容 —— 一把单梯子，由两种切法产生：留在文件里还是放到指针后，是步骤还是参考。各档：

- **Steps（步骤）** —— 文件内，主档。
- **Reference（参考）**，文件内 —— 次档。
- **Reference（参考）**，已披露 —— 在 **context pointer** 之后。

一个没有 **steps** 的 Skill 只用底下两档 —— 经常是合理的扁平同级集合（例如一份评审的所有规则排在一档），这是合理布局，不是异味。层级与调用无关：全步骤、全参考、或两者兼有的 Skill，都可以 Model- 或 User-Invoked。当 Skill 有 steps 时，本应被披露的文件内 reference 会把 steps 埋掉，让"注意到它"变成掷硬币 —— 是方差杠杆，不只是可读性。保持梯子顶部清晰；能下沉的都下推。

_避免使用_：structure、organization、layout。

### Steps（步骤）

Agent 按顺序执行的动作 —— 当 Skill 有步骤时，它是 Skill 内容的主档，也是它在 SKILL.md 里赢得一席之地的部分。不是每个 Skill 都有步骤：可以是全步骤（`tdd`）、全 **reference**（一份评审）、或两者兼有，与 invocation 无关。每一步以一条 **completion criterion（完成判据）** 收尾，或清晰或含糊。

_避免使用_：workflow、instructions、choreography。

### Reference（参考）

Agent 按需查阅的素材 —— 定义、事实、参数、示例、条件性指令。Skill 有 **steps** 时它是次档；没有 steps 时它是全部内容；也可以完全在某个 Skill 之外存在 —— 见 **External Reference**。通过 **context pointers** 触发，是 **progressive disclosure** 的首选目标。

_避免使用_：supporting material、docs、background。

### External Reference（外部参考）

位于 Skill 系统之外的 **reference** —— 普通文件，没有 **description**、没有 **steps**、不可调用 —— 任何 Skill 都能指向它。是共享参考的家，而这种参考不必自己触发；也是两个 **User-Invoked** Skill 唯一能共用的家，因为两者都没有 description，所以彼此也调不动对方。

_避免使用_：doc、resource、knowledge base。

### Progressive Disclosure（渐进披露）

把 **reference** 沿梯子下推 —— 移出 SKILL.md 放到 **context pointer** 之后 —— 让顶部保持可读。它不只是 token 优化；它是 **information hierarchy** 的守护。由 **branching（分支）** 许可：只为部分分支要的披露，所有路径都要的内联，若指针在必要素材上触发不可靠，先磨措辞，磨不利索才把它拉回内联。

_避免使用_：lazy loading、chunking。

### Co-location（同位共置）

把 Agent 一次需要的素材放在一处 —— 一个概念的定义、规则、注意事项放在同一标题下，而不是散在文件各段 —— 这样读到一处会把邻近内容一并带进来。是 **Information Hierarchy** 的"文件内"姊妹：层级决定一块素材 _沉到多深_，co-location 决定一旦到那一层，_什么与它并排_。并没有公式规定一份 **reference** 体的"正确格式"；检验标准是：Skill 应该读起来像为 Agent 写的文档，组合好的素材读起来像，散落的则不像。与 **Duplication** 不同：那是把一个含义重复到两处，而散落是把一个含义碎片化到许多处。

_避免使用_：grouping、clustering、cohesion。

### Sprawl（蔓延）

_Failure mode_。单纯过长的 Skill —— SKILL.md 行数过多 —— 与内容是否陈旧或重复无关。一份全活、全唯一的 Skill 也可能蔓延。它损害可读性（Agent 在能动手前要趟过更多，注意力在冗余上被稀释）、可维护性（每多一行就多一行要保持 **relevant**），还浪费 token。处方是 **information hierarchy**：把 **reference** 用 **context pointers** 下推，并按 **branch** 或 sequence 拆分，让每条路径只携带它需要的内容。与 **sediment**（由陈旧堆积造成的冗长）、**duplication**（由含义重复造成的冗长）不同 —— **sprawl** 就是长度本身，无论成因。

_避免使用_：bloat、length、size、verbosity。

## Steering（引导）

把 Agent 运行时行为拉向 **Predictability** 的杠杆。

### Branch（分支）

Skill 的一种调用方式 —— 它处理的一种情形 —— 让不同运行走不同路径。一个有许多 steps 的 Skill 可能带许多 branches；一条直线的 Skill 一个都没有。

_避免使用_：path、case、fork。

### Leading Word（领词）

一种紧致的概念 —— 也叫 _Leitwort_ —— 已经活在模型的预训练里，Agent 在跑 Skill 时会拿它来思考。它把一条行为准则用尽可能少的 token 编码出来，靠调用模型已有的先验（例如 _lesson_、_proximal zone of development_、_fog of war_、_tracer bullets_）。它作为 token 而非句子反复出现，会在整个 Skill 中累积起分布式定义，并把整片行为锚定下来。自己造词也能用，前提是定义得清，但自造词调不动先验 —— 你为定义付的 token，本可以用一个预训练词白拿。先用现成的词。

Leading word 为 **predictability** 服务两次。在正文里它锚定 **execution（执行）** —— Agent 每次碰到这个概念都会拉出同样的行为；在扁平 reference 里它把注意力聚焦到一类要去找的东西，每次跑都拉来合适的检查。在 **description** 里它锚定 **invocation（调用）** —— 而且不只在 Skill 之内：当同一个词同时出现在你的提示、文档和代码库里时，Agent 把这种共享语言和该 Skill 关联起来，更可靠地触发它。用你真正想要 Skill 时会用的 leading word 来写 description。

_避免使用_：keyword、term、motif。

### Completion Criterion（完成判据）

判断一个工作单元完成与否的条件 —— Agent 据此判断的目标。两个属性让它成为杠杆，不只是品质。它的 **clarity（清晰度）**（Agent 能区分做完与没做？）抵御 **premature completion** —— 含糊的边界（"理解到位了"）让 Agent 宣告完成、溜到下一步；这一轴需要 _steps_ 才能咬合，因为 premature completion 是步骤间失败。它的 **demand（苛刻度）**（它要求多少）设定 **legwork** —— "每个改过的模型都对得上账"逼出彻底的活儿，"产出一份改动清单"则不会 —— 这一轴 _不_ 受步骤约束：它也能约束一份扁平 reference，这就是一份无 steps 的 Skill 仍然能承载"每条规则都应用过"这种穷尽性门槛的方式。最强的判据同时可验证且穷尽。

_避免使用_：done condition、exit condition、stopping rule。

### Legwork（功课）

Agent 在单步之内、幕后的工作 —— 读文件、探索代码库、改动、挖出所需而不是甩给用户。它活在步骤结构之下：从不被写成独立步骤，潜藏在措辞里，由 Agent 而不是 Skill 控制。是 **post-completion steps** 跨步前拉力的"步内"对应物。由 **leading word**（_comprehensive_、_thorough_）或一条要求工作穷尽的 **completion criterion** 抬高 —— 包括把 demand 轴用在扁平 reference 上，这也是一份纯 reference 的 Skill 会覆盖所有档位的驱动力。当 demand 缺失，或 **premature completion** 把步骤截短，它就会变薄。

_避免使用_：scope、effort、diligence、coverage。

### Post-Completion Steps（后置步骤）

当前步骤之后的 **steps**。一旦可见，就把 Agent 往前拉向 **premature completion** —— 看到的越多，拉力越强；防御就是把序列拆开、把后置步骤藏起来。

_避免使用_：horizon、fog of war、lookahead。

### Premature Completion（过早收尾）

_Failure mode_。当前步骤还没真正做完就结束，因为 Agent 的注意力滑向"已经完成"而不是手头的活儿。一种步骤间失败：它需要 **steps** 才会发生 —— 一份无 steps 的 Skill 过早收尾不是 premature completion，而是未达标 demand 下的薄 **legwork**。两种力之间的拉锯：可见的 **post-completion steps**（往前的拉力）与 **completion criterion** 的清晰度（阻力 —— 一条锋利、可验证的边界守得住；一条含糊的会让位）。含糊是必要条件：一条锋利的边界无论后置步骤可见多少都守得住，所以一个从不抢跑的步骤无需防御。两条杠杆可以压住会抢跑的步骤，但要按顺序伸手：**先把边界磨锋利** —— 局部、便宜。只有当判据本质上含糊 _且_ 真的观察到抢跑时，才**把后置步骤藏起来** —— 而且藏只能在真正的上下文边界上起效（User-Invoked 的手交接，或一次子代理调度；一次内联的 Model-Invoked 调用会让后置步骤留在上下文里，清不掉）。它是薄 legwork 的一种成因，但与薄 legwork 不同：legwork 在步骤跑满时也可能薄。

_避免使用_：premature closure、the rush、rushing、shortcutting。

### Negation（否定）

_Failure mode_。用禁止来引导 —— 告诉 Agent _不要_ 做什么 —— 把被禁的行为拖进上下文，让它 _更_ 可用而不是更不可用。_不要想大象_，于是大象成了唯一的东西；_永远不要写冗长注释_，于是冗长就是 Agent 刚读到的模式。否定是一个弱修饰，会被强烈激活的概念压过，所以禁令读起来一半像是"去做那件事"的指令。它的 **leading word** 就是 _大象_：禁令在画面里点名的那个东西。治法：提示 **正向** —— 描述目标行为（"写一行注释"），让被禁的那条根本不被说出。禁令只有在无法用正向措辞表达的硬护栏上才赢得一席；即便如此，也要配上正向目标，让注意力落在"该做什么"上。

_避免使用_：ironic rebound、don't-prompting、the pink elephant。

## Pruning（修剪）

保持 Skill 精简 —— 每条处方与它治的失败模式并列。

### Single Source of Truth（单一事实源）

目标状态：每个含义只在一个权威位置，所以修改 Skill 行为只需改一处。**Duplication** 是它的违反。

_避免使用_：home、canonical location。

### Duplication（重复）

_Failure mode_。同一个含义给出多于一处 **single source of truth**。代价是维护成本（改一处必须改别处）、消耗 token，并放大权重 —— 重复一个含义会在层级上把它推到超过真实位次。是 **leading word** 的意外反面：leading word 故意反复以抬高注意力，但反复的是 token，从不是含义。

_避免使用_：repetition、redundancy。

### Relevance（相关性）

一行是否还与 Skill 的工作相关 —— 决定保留什么的镜片。一行可能失去 relevance：要么从来与任务无关（只是铺陈，或本应被披露的 **branch**），要么因陈旧而失去 —— 当它描述的行为或世界变了，它就漂移出去。更短的 Skill 更容易保持 relevance，因为每一行都更便宜去检查。与 **no-op** 不同：relevance 问的是这一行是否与任务相关，不问它是否改变行为。

_避免使用_：load-bearing、staleness、freshness。

### Sediment（沉淀）

_Failure mode_。旧内容层层堆积在 Skill 中、永远不清，因为加上去感觉安全、删掉感觉危险 —— 于是陈旧、无关的行越积越多，你得一层层往下挖才能找到还活着的部分。任何没有修剪纪律的 Skill 的默认归宿；是 **relevance** 的慢性侵蚀，与 **duplication** 的含义重复不同。

_避免使用_：accretion、bloat、cruft、rot。

### No-Op（空操作）

_Failure mode_。模型本来就照做的一条指令，你却付负载说了一句它本来就会做的事。测试：与默认行为相比，这行会改变行为吗？一行可以完全 **relevant**，却仍是 no-op。让 **leading word** 免费的那些先验，同样让 no-op 一文不值。

Leading word 是一种 _技巧_；No-Op 是对一行的 _判决_ —— 二者交叉。一个弱到顶不住默认行为的 leading word 是 no-op（_be thorough_ 而 Agent 本来就挺 thorough），修法是换个更强的词让它通过判决（_relentless_），不是换技巧。所以 No-Op 测试 —— 与默认行为相比，它会改变行为吗？—— 也是用来给 leading word 的重复打分的方式。这一切以模型为参照，不以读者为参照：两个人争论一行是否 no-op，是在争论默认行为，跑一遍 Skill 来裁定，不是辩论。

_避免使用_：redundant instruction、restating the obvious、belaboring。