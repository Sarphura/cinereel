# 落地清单

基于当前代码扫描（主 Drive = Profile、资源库写 `ownerProfileKey`、订阅发现主页）。

## 现状对照

| 能力 | 状态 |
|------|------|
| 主 Drive 存在且启动 announce | 已有 |
| 资源 Drive namespace 创建 / 宣告 | 已有 |
| 订阅挂载远端 | 已有 |
| 订阅读 `/descriptor.json` 的 name/type | 已有 |
| 发布时 **写入** `/descriptor.json` | 已有 |
| `ownerProfileKey` | 已有（发布模型） |
| 主盘 `/profile.json` | 已由 Profile API 初始化并维护；发布流程维护 collections |
| 后端 `GET/PATCH /api/profile` | 已有 |
| 订阅后解析并展示 owner 主页 | 后端已解析 owner；前端入口待做 |
| 头像 stream / preview API | Profile 头像已有 `/api/profile/avatar`；资源 preview 待实现 |

## 改动清单

### 1. 约定与模型

- [x] 文档化 descriptor：`{ name, type, ownerProfileKey }`
- [x] 文档化 profile：与前端 `ProfileRecord` 对齐
- [x] `DriveRecord` 增加 `ownerProfileKey?` 供订阅缓存

### 2. Publish

涉及：`apps/service/src/modules/publish/service/drive.service.ts` 等

- [x] `create`：对新建资源 Drive `putJson('/descriptor.json', { name, type, ownerProfileKey: hyper.driveKey })`
- [x] rename / 类型变更：同步改写 descriptor
- [x] create / delete：维护主盘 `collections`

### 3. Profile API

- [x] 新增 `ProfileModule`（读写主 Drive）
- [x] `GET/PATCH /api/profile`
- [x] 头像写入主盘 + 可访问 URL
- [x] 启动时 seed 空 `/profile.json`
- [x] 注册进 `AppModule`

### 4. Subscribe

涉及：`subscribe.service.ts`、DTO、前端订阅页

- [x] 解析 `ownerProfileKey`
- [x] `mountRemoteDrive(profileKey)` 并读 `/profile.json`
- [x] 响应携带 owner 摘要，并提供按 profileKey 查询 API
- [x] descriptor / profile 读取增加更稳健的 wait / 重试

### 5. Frontend

- [ ] 本地 Profile 编辑对接真实 API
- [ ] 订阅列表 / 详情展示 owner 入口
- [ ] 远端主页页（collections → 打开或订阅资源库）
- [ ] 对齐头像 URL 与真实文件接口

### 6. Infra 小调整

- [ ] 注释 / 文档：主 Drive = Profile Drive，避免再当默认媒体盘
- [ ] 确保可按任意 hex key mount profile（不依赖 `drives.json` 先有记录）——`mountRemoteDrive` 已接近

## 建议实施顺序

1. 发布时写 descriptor + `ownerProfileKey`（立刻改善新库可发现性）
2. Profile API 落主盘（打通前端已有页）
3. 发布时维护 collections
4. 订阅侧解析 owner → 拉 profile
5. 前端主页 / owner 入口
6. （并行或稍后）账号权限、传输治理

## 风险

| 风险 | 处理 |
|------|------|
| 主盘曾被默认写入杂文件 | 当 Profile 用前检查 store；必要时清理或迁移 |
| 每订阅多挂一个 profile | 复用 `SwarmService.remoteDrives` 缓存 |

早期阶段不要求兼容无 descriptor / 无 `ownerProfileKey` 的旧库；发布与订阅路径按完整约定实现即可。

## 最小闭环

三件事即可打通主路径：

1. `DriveService.create` 写 descriptor  
2. Profile API 读写主盘  
3. `SubscribeService.add` 跟读 `ownerProfileKey`  

其余为体验、迁移与治理增强。
