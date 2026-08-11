---
name: codebase-design
description: 深度 Module 设计的共享术语。适用于用户希望设计或改进 Module 的 Interface、寻找深化机会、决定 Seam 的位置、提升代码的可测试性或 AI 可导航性，或其他 Skill 需要深度 Module 术语时。
---

# 代码库设计

设计**深度 Module**：以小型 Interface 封装大量行为，将 Interface 放在清晰的 Seam 上，并可通过该 Interface 进行测试。凡涉及代码设计或重构，都应使用这些术语与原则。目标是让调用方获得 Leverage，让维护者获得 Locality，并让所有人都能方便地测试。

## 语言与术语

- 默认使用简体中文与用户对话，并以简体中文提出问题、列出选项和撰写总结。生成或修改的 Markdown、HTML、ADR、Issue、Spec、报告等文档也使用简体中文；仅当用户明确要求其他语言时切换。
- 代码标识符、类型名、函数名、文件名、路径、CLI 命令、配置键、API、协议、库名、产品名、缩写和字面量保持原文。
- 架构术语必须始终保留以下英文原文并使用相同拼写：`Module`、`Interface`、`Implementation`、`Depth`、`Seam`、`Adapter`、`Leverage`、`Locality`。仅可在定义处附加中文解释；后文不得翻译或替换为近义词。

## 术语表

必须严格使用以下术语——不要用 `component`、`service`、`API` 或 `boundary` 替代。保持术语一致正是本规范的核心目的。

**Module**（模块）——任何同时具有 Interface 和 Implementation 的事物。这个概念刻意不限定规模：可以是函数、类、包，也可以是跨层切片。_避免使用_：`unit`、`component`、`service`。

**Interface**（接口）——调用方为正确使用 Module 而必须了解的一切：不仅包括类型签名，还包括不变量、顺序约束、错误模式、必需配置和性能特征。_避免使用_：`API`、`signature`（范围过窄——它们只指类型层面的表面）。

**Implementation**（实现）——Module 内部的代码主体。它与 **Adapter** 不同：一个事物可以是小型 Adapter，却有大型 Implementation（例如 Postgres 仓储）；也可以是大型 Adapter，却有小型 Implementation（例如内存测试替身）。讨论 Seam 时使用 `Adapter`；其他情况使用 `Implementation`。

**Depth**（深度）——Interface 所提供的 Leverage：调用方（或测试）每学习一个单位的 Interface，能够驱动多少行为。大量行为隐藏在小型 Interface 后时，Module 的 **Depth** 高；Interface 与 Implementation 几乎同样复杂时，Module 的 **Depth** 低。

**Seam**（接缝，Michael Feathers）——无需在某处直接编辑代码，就能改变行为的位置；也就是 Module 的 Interface 所在的*位置*。Seam 放在哪里本身就是一项设计决策，与 Seam 后放什么是两个不同的问题。_避免使用_：`boundary`（该词容易与 DDD 的 `bounded context` 混淆）。

**Adapter**（适配器）——在 Seam 处满足 Interface 的具体事物。它描述的是*角色*（填补哪个位置），而不是实质（内部有什么）。

**Leverage**（杠杆效应）——调用方从 Depth 中得到的收益：每学习一个单位的 Interface，就能获得更多能力。一份 Implementation 可以同时惠及 N 个调用点和 M 个测试。

**Locality**（局部性）——维护者从 Depth 中得到的收益：变更、缺陷、知识和验证集中在一处，而不是分散到各个调用方。一次修复，处处生效。

## 深度 Module 与浅层 Module

**深度 Module** = 小型 Interface + 大量 Implementation：

```
┌─────────────────────┐
│    小型 Interface   │  ← 方法少、参数简单
├─────────────────────┤
│                     │
│  深层 Implementation│  ← 隐藏复杂逻辑
│                     │
└─────────────────────┘
```

**浅层 Module** = 大型 Interface + 少量 Implementation（应避免）：

```
┌─────────────────────────────────┐
│          大型 Interface         │  ← 方法多、参数复杂
├─────────────────────────────────┤
│       薄层 Implementation       │  ← 只做透传
└─────────────────────────────────┘
```

设计 Interface 时，应询问：

- 能否减少方法数量？
- 能否简化参数？
- 能否在内部隐藏更多复杂性？

## 原则

- **Depth 是 Interface 的属性，而不是 Implementation 的属性。** 深度 Module 内部仍可由小型、可替换、可使用测试替身的部件组成——这些部件只是不属于 Interface。Module 既可以有位于 Interface 处的**外部 Seam**，也可以有 **Implementation 私有、供自身测试使用的内部 Seam**。
- **删除检验。** 想象删除这个 Module。如果复杂性随之消失，它原本只是透传层；如果复杂性重新出现在 N 个调用方中，它原本就在发挥价值。
- **Interface 就是测试表面。** 调用方和测试跨越同一个 Seam。如果想越过 Interface 测试内部，Module 的形态很可能有问题。
- **一个 Adapter 意味着 Seam 只是假设，两个 Adapter 才意味着 Seam 确实存在。** 除非跨越该 Seam 的内容确实会变化，否则不要引入 Seam。

## 面向可测试性进行设计

良好的 Interface 会让测试变得自然：

1. **接收依赖，不要自行创建依赖。**

   ```typescript
   // 易于测试
   function processOrder(order, paymentGateway) {}

   // 难以测试
   function processOrder(order) {
     const gateway = new StripeGateway();
   }
   ```

2. **返回结果，不要制造副作用。**

   ```typescript
   // 易于测试
   function calculateDiscount(cart): Discount {}

   // 难以测试
   function applyDiscount(cart): void {
     cart.total -= discount;
   }
   ```

3. **保持较小的表面积。** 方法越少，需要的测试越少；参数越少，测试准备越简单。

## 关系

- 一个 **Module** 恰好有一个 **Interface**（它向调用方和测试呈现的表面）。
- **Depth** 是 **Module** 的属性，并以其 **Interface** 为参照进行衡量。
- **Seam** 是 **Module** 的 **Interface** 所在的位置。
- **Adapter** 位于 **Seam** 处，并满足 **Interface**。
- **Depth** 为调用方带来 **Leverage**，为维护者带来 **Locality**。

## 不采用的表述

- **用 Implementation 行数与 Interface 行数之比表示 Depth**（Ousterhout）：这种方式会奖励给 Implementation 填充代码。本规范改用以 Leverage 表示 Depth 的方式。
- **把 `Interface` 理解为 TypeScript 的 `interface` 关键字或类的公开方法**：范围过窄——这里的 Interface 包括调用方必须了解的每一项事实。
- **使用 `boundary`**：该词容易与 DDD 的 `bounded context` 混淆。应使用 **Seam** 或 **Interface**。

## 进一步阅读

- **在给定依赖条件下深化一组 Module**——参见 [DEEPENING.md](DEEPENING.md)：依赖类别、Seam 纪律，以及“替换而非叠加”的测试策略。
- **探索备选 Interface**——参见 [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md)：并行启动多个子代理，以几种截然不同的方式设计 Interface，再从 Depth、Locality 和 Seam 位置等方面进行比较。
