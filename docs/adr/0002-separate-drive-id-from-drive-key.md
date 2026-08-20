# ADR-0002：分离 DriveId 与 DriveKey

- 状态：已接受
- 日期：2026-08-19

## 背景

Cinereel 使用 Hyperdrive 承载 Drive 的文件内容。Hyperdrive 以公钥识别和访问内容，现有 Web 前端与 Hyper Client 将这个公钥称为 `driveKey`，并在多处把它当作 Drive 的唯一标识。

与此同时，Cinereel 的其他 Feature 需要稳定引用 Drive。例如 Publication 通过 Drive 的身份建立唯一发布关系，并以该身份执行状态查询和删除约束。如果直接把 Hyperdrive 公钥作为 Drive 的领域身份，领域模型会与当前存储协议绑定；未来更换内容载体、迁移密钥或调整 Hyperdrive 集成方式时，所有跨 Feature 引用都会受到影响。

因此需要明确：Drive 的领域身份是否等同于 Hyperdrive 公钥。

## 决策

- `DriveId` 是由 Cinereel 分配的内部 `Guid`，是 Drive 的稳定领域身份。
- `DriveKey` 是 Hyperdrive 用于定位和访问文件内容的公钥，不是 Drive 的领域身份。
- Drive 创建后，`DriveId` 不因底层存储或密钥变化而改变。
- 其他 Feature 使用 `DriveId` 引用 Drive，不使用 `DriveKey` 建立领域关系。
- Cinereel 的 Drive HTTP 路由使用 `DriveId` 标识资源。
- Drive 的 HTTP 响应同时提供 `driveId` 与 `driveKey`，让调用方可以识别 Cinereel 资源并按需分享或访问 Hyperdrive 内容。
- 不额外提供一套按 `DriveKey` 操作 Drive 的同义路由；需要从外部 `DriveKey` 建立关系的用例在所属入口完成解析。
- 一个 `DriveKey` 同时最多关联一个 Drive，持久化层必须保证该唯一性。
- `DriveId` 与 `DriveKey` 使用不同的类型表达，避免在编译期无法发现的误传。

## 备选方案

### DriveId 直接使用 DriveKey

此方案与现有 Web 前端和 Hyper Client 的契约最接近，不需要维护额外的身份映射，按公钥查询内容也更直接。

但它会把领域身份与 Hyperdrive 的公钥格式及密钥生命周期绑定。跨 Feature 关系将隐式依赖存储技术，更换内容载体或迁移密钥时需要级联修改引用，因此不采用。

### 同时保留两个标识，但不规定各自职责

此方案可以推迟选择，并允许不同调用方自行决定使用哪个标识。

但两个标识会逐渐被混用，Publication、HTTP 路由和持久化关系可能各自选择不同的主标识，导致查找、唯一性和错误处理语义不一致，因此不采用。

## 后果

正面影响：

- Drive 的身份不依赖 Hyperdrive，其他 Feature 可以稳定引用 Drive。
- `DriveId` 与 `DriveKey` 的职责明确，可以通过类型系统阻止二者混用。
- Cinereel 的 HTTP Interface 与 Feature 间引用统一使用同一种身份语义。
- 未来迁移内容载体或调整密钥管理时，不必改写所有领域关系。

代价与约束：

- 持久化层需要保存 `DriveId` 到 `DriveKey` 的映射，并对 `DriveKey` 建立唯一约束。
- 通过 `DriveKey` 收到的请求或 Hyper Client 回调必须先解析到对应的 `DriveId`。
- 创建 Drive 涉及 Hyper Client 与本地持久化两个步骤，需要定义部分失败时的补偿或恢复策略。
- 现有 Web 前端以 `driveKey` 作为列表选择和资源路由参数，需要迁移为 `driveId`；分享、订阅等确实依赖 Hyperdrive 公钥的场景继续使用 `driveKey`。
