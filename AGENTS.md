# AGENTS.md

Cinereel 项目级约定。所有参与本仓库的开发者与 AI 编码代理均须遵守本文件。若某个子项目内有更具体的 `AGENTS.md`，以该子项目内的文件为准。

## 项目概述

Cinereel 是一个包含 Web 前端、C# 后端服务等子项目的媒体服务 monorepo（AGPL-3.0）仓库，使用 RPC 与 IPFS 的 Kubo 节点通信交互，通过 pnpm workspace 与 .NET 工程共同组织。

## 语言约定

- 所有文档（Markdown、ADR、Spec、Issue、README）、代码注释、提交信息均使用**中文**。
- 标识符（类名、方法名、变量名、文件名）使用**英文**。
- 日志 key、JSON 字段名、第三方 API 名称等技术标识符保持英文。

## 目录结构

- `apps/web` — Web 前端（Vite + React + Tailwind），npm 包名 `@cinereel/ui`
- `apps/service` — ASP.NET Core Web 项目（`Cinereel`）；
- `packages/` — pnpm workspace 预留目录（当前无内容）
- `.agents/skills/` — 仓库内置 Agent 技能

## 包管理

- 使用 pnpm（`packageManager: pnpm@10.25.0`），workspace 由 `pnpm-workspace.yaml` 配置（`apps/*`、`packages/*`）。
- `apps/service` 是 .NET 项目，不走 pnpm；统一使用 `dotnet` 命令。

## 通用约定

- 构建产物（`bin/`、`obj/`、`dist/`、`node_modules/` 等）不入库，已由 `.gitignore` 覆盖。
- 提交信息使用**中文**，遵循约定式提交风格（`feat(...)` / `fix(...)` / `refactor(...)` 等）。


## 协作方式

- AI 做出的任何判断以已有代码为准，不需要查询任何用户已删除的历史记录。
- AI 不提供任何架构层面的操作，**仅提供建议**，让开发者手动操作。
- AI 协助开发者时，**严禁**涉及三个文件以上的复杂更改，仅给开发者提供修改步骤。
- 当开发者不明确项目组织结构时，向开发者提供官方或社区推荐做法，并向开发者说明做法的取舍。
- 当开发者询问内容时，可以查询网页对回答内容真实性进行检验，但不必进行实地测试，并标注未进行实地测试，除非开发者要求。
