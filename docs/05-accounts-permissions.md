# 账号与权限（规划）

## 目标场景

同一 Cinereel 节点上：

- **账号 A（Admin）**：可见全部面板（仪表盘、资料库、下载、订阅、发布、资料管理）
- **账号 B（Viewer）**：仅资料库展示（只读浏览），不可进入发布 / 订阅管理等

## 与 Drive 身份正交

```
应用账号（HTTP）          P2P 身份（Hyperdrive）
─────────────────         ─────────────────────
登录、角色、面板权限       主 Drive = 对外主页
不对应「一个主 Drive」     不对应「一个登录用户」
```

推荐关系：

- **一节点多账号**（本机/家庭共享一台 service）
- **一节点一个 Profile Drive**（对外仍是同一个发布者主页）
- 账号通过权限决定「谁能改 Profile / 谁能发布资源库」

不推荐：每账号自动创建一个主 Hyperdrive 当作账号 ID。

## 权限模型建议

用 **permission** 表达能力，角色是权限集合：

| Permission | 含义 | Viewer | Admin |
|------------|------|--------|-------|
| `library:read` | 资料库展示 | ✓ | ✓ |
| `download:*` | 下载任务 | | ✓ |
| `subscribe:*` | 订阅管理 | | ✓ |
| `publish:*` | 发布与资源管理 | | ✓ |
| `profile:write` | 编辑本机主页 | | ✓ |
| `admin:*` | 用户与系统设置 | | ✓ |

## 架构落点

```
Web（按 permission 显隐导航）
  → AuthGuard + PermissionsGuard
    → Feature Controllers
      → Drive / Swarm / Hyper（不感知账号）
```

新建例如 `AuthModule`：

- 用户 / 角色（或先简化 `admin | viewer`）
- Session 或 JWT
- Nest Guard + `@RequirePermissions(...)`

约束：

- **前端藏入口不够**；写接口必须在 Service 强制校验
- Drive / Hyper 层不引入 userId

## 资源级授权（进阶）

初期：角色决定功能面即可。

进阶：`userId + driveKey` ACL，例如 Viewer 只能看部分订阅库。仍不必改 Hyper 层。

## 落地顺序建议

1. Auth 骨架（登录、当前用户、permissions 下发）
2. 保护写接口（publish / mount / subscribe / delete / profile PATCH）
3. Sidebar / 路由按 permission 过滤
4. 为 Viewer 提供稳定的只读 library API（避免开放整套 drive 管理面）
5. 可选：资源级 ACL、审计日志
