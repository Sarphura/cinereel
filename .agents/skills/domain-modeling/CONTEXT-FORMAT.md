# CONTEXT.md 格式规范

本文件定义本项目 `CONTEXT.md` 术语表的结构、规则与示例模板。所有面向用户的标题、说明、占位文字均使用简体中文；领域术语（`Order`、`Invoice`、`Customer` 等）按术语表原样保留。

## 结构

```md
# {上下文名称}

{一到两句：说明这个上下文是什么，以及为什么存在。}

## 语言

**Order**：
{一到两句对该术语的定义}
_避免使用_：Purchase、transaction

**Invoice**：
交付后发送给客户的付款请求。
_避免使用_：Bill、payment request

**Customer**：
下单的个人或组织。
_避免使用_：Client、buyer、account
```

## 规则

- **态度鲜明**：同一个概念有多个说法时，挑最好的一个，其他全部列到 `_避免使用_` 下面。
- **定义尽量紧凑**：最多一两句话。只定义"是什么"，不定义"怎么做"。
- **只收录本上下文特有的术语**：通用编程概念（超时、错误类型、工具模式）哪怕项目里大量使用，也不要写进来。收录前先问自己：这是本上下文独有的概念，还是通用编程概念？只有前者才收录。
- **自然成簇时用小标题分组**：如果所有术语都属于同一个紧密领域，平铺列表也可以。

## 单上下文 vs 多上下文仓库

**单上下文（多数仓库）**：仓库根目录放一个 `CONTEXT.md`。

**多上下文**：仓库根目录放一个 `CONTEXT-MAP.md`，列出所有上下文、所在位置与彼此关系：

```md
# 上下文地图

## 上下文

- [Ordering](./src/ordering/CONTEXT.md) —— 接收并跟踪客户订单
- [Billing](./src/billing/CONTEXT.md) —— 生成发票并处理付款
- [Fulfillment](./src/fulfillment/CONTEXT.md) —— 管理仓库分拣与发货

## 关系

- **Ordering → Fulfillment**：Ordering 发出 `OrderPlaced` 事件；Fulfillment 消费这些事件以开始分拣
- **Fulfillment → Billing**：Fulfillment 发出 `ShipmentDispatched` 事件；Billing 消费这些事件以生成发票
- **Ordering ↔ Billing**：共享 `CustomerId` 与 `Money` 类型
```

Skill 会自动判断当前项目使用哪种结构：

- 如果 `CONTEXT-MAP.md` 存在，先读它来找到所有上下文。
- 如果只有仓库根目录的 `CONTEXT.md`，则是单上下文。
- 如果两者都不存在，在第一个术语被确认时按需懒创建仓库根目录的 `CONTEXT.md`。

存在多个上下文时，自动判断当前话题属于哪个上下文。如果判断不清，向用户提问确认。