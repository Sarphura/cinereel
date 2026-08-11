# 深化 Module

在给定依赖的情况下，如何安全地深化一组浅层 Module。本文沿用 [SKILL.md](SKILL.md) 中的术语——**Module**、**Interface**、**Seam**、**Adapter**。

## 依赖类别

评估某个深化候选对象时，应先对其依赖进行分类。依赖类别决定如何跨越 Seam 测试深化后的 Module。

### 1. 进程内

纯计算、内存状态且无 I/O。始终可以深化——合并这些 Module，并直接通过新的 Interface 进行测试。不需要 Adapter。

### 2. 可在本地替代

具有本地测试替代项的依赖（例如用 PGLite 替代 Postgres、使用内存文件系统）。只有存在替代项时才能深化。测试深化后的 Module 时，在测试套件中运行该替代项。Seam 位于内部；Module 的外部 Interface 不设置端口。

### 3. 远程但自有（端口与 Adapter）

跨网络运行的自有服务（微服务、内部 API）。在 Seam 处定义一个**端口**（Interface）。深度 Module 拥有逻辑；传输层以 **Adapter** 形式注入。测试使用内存 Adapter，生产环境使用 HTTP、gRPC 或队列 Adapter。

建议表述：*“在 Seam 处定义一个端口，为生产环境实现 HTTP Adapter，为测试实现内存 Adapter。这样，即使部署跨越网络，逻辑仍集中在一个深度 Module 中。”*

### 4. 真正的外部依赖（测试模拟）

无法控制的第三方服务（例如 Stripe、Twilio）。深化后的 Module 将外部依赖作为注入的端口接收；测试提供模拟 Adapter。

## Seam 纪律

- **一个 Adapter 意味着 Seam 只是假设，两个 Adapter 才意味着 Seam 确实存在。** 除非至少有两个合理的 Adapter（通常为生产 Adapter 和测试 Adapter），否则不要引入端口。只有一个 Adapter 的 Seam 只是间接层。
- **内部 Seam 与外部 Seam。** 深度 Module 既可以有位于 Interface 处的外部 Seam，也可以有 Implementation 私有、供自身测试使用的内部 Seam。不要仅仅因为测试会使用内部 Seam，就通过 Interface 将其暴露出去。

## 测试策略：替换，而非叠加

- 一旦建立了通过深化后 Module 的 Interface 进行测试的新测试，针对旧有浅层 Module 的单元测试就会成为冗余——应将其删除。
- 在深化后 Module 的 Interface 处编写新测试。**Interface 就是测试表面。**
- 测试应通过 Interface 断言可观察结果，而不是断言内部状态。
- 测试应能承受内部重构——它们描述的是行为，而非 Implementation。如果 Implementation 一变，测试也必须随之修改，那么测试已经越过 Interface 检查内部了。
