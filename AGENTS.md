# AGENTS.md

CineReel 项目级约定。所有参与本仓库的开发者与 AI 编码代理均须遵守本文件。若某个子项目内有更具体的 `AGENTS.md`，以该子项目内的文件为准。

## 项目概述

CineReel 是一个媒体服务 monorepo（AGPL-3.0）。仓库同时包含 Web 前端、C# 后端服务与 Hyper 客户端等子项目，通过 pnpm workspace 与 .NET 工程共同组织。

## 语言约定

- 所有文档（Markdown、ADR、Spec、Issue、README）、代码注释、提交信息均使用**中文**。
- 标识符（类名、方法名、变量名、文件名）使用**英文**。
- 日志 key、JSON 字段名、第三方 API 名称等技术标识符保持英文。

> 与 `.cursor/rules/language-zh-cn.mdc` 保持一致。

## 目录结构

- `apps/web` — Web 前端（Vite + React + Tailwind），npm 包名 `@cinereel/ui`
- `apps/hyper-client` — Hyper 客户端，npm 包名 `@cinereel/hyper-client`
- `apps/service` — 标准 ASP.NET Core Web API 服务（`CineReel.Service`），约定见 `apps/service/AGENTS.md`
- `service/` — 历史废弃的 C# 服务，仅用作参考（同名 `CineReel.Service`，分层结构完整）。
- `jellyfin/` —  Jellyfin 源码，仅用做架构参考（已在 `.gitignore` 中忽略，不入库）
- `packages/` — pnpm workspace 预留目录（当前无内容）
- `.agents/skills/` — 仓库内置 Agent 技能
- `.cursor/rules/` — Cursor 规则

## 包管理

- 使用 pnpm（`packageManager: pnpm@10.25.0`），workspace 由 `pnpm-workspace.yaml` 配置（`apps/*`、`packages/*`）。
- `apps/service` 是 .NET 项目，不走 pnpm；统一使用 `dotnet` 命令。

## 常用命令

Web 前端：

- 开发：`pnpm --filter @cinereel/ui dev`
- 构建：`pnpm --filter @cinereel/ui build`

C# 服务：

- 构建：`dotnet build apps/service/CineReel.Service.csproj`
- 运行：`dotnet run --project apps/service`
- 测试：`dotnet test`（约定见 `apps/service/AGENTS.md`）

## 通用约定

- 构建产物（`bin/`、`obj/`、`dist/`、`node_modules/` 等）不入库，已由 `.gitignore` 覆盖。
- 提交信息使用中文，遵循约定式提交风格（`feat(...)` / `fix(...)` / `refactor(...)` 等）。
- 需要记录架构决策时使用 ADR（架构决策记录）。
