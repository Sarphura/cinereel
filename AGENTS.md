# AGENTS.md

Cinereel 项目级约定。所有参与本仓库的开发者与 AI 编码代理均须遵守本文件。若某个子项目内有更具体的 `AGENTS.md`，以该子项目内的文件为准。

## 项目概述

Cinereel 是一个媒体服务 monorepo（AGPL-3.0）。仓库同时包含 Web 前端、C# 后端服务与 Hyper 客户端等子项目，通过 pnpm workspace 与 .NET 工程共同组织。

## 语言约定

- 所有文档（Markdown、ADR、Spec、Issue、README）、代码注释、提交信息均使用**中文**。
- 标识符（类名、方法名、变量名、文件名）使用**英文**。
- 日志 key、JSON 字段名、第三方 API 名称等技术标识符保持英文。

> 与 `.cursor/rules/language-zh-cn.mdc` 保持一致。

## 目录结构

- `apps/web` — Web 前端（Vite + React + Tailwind），npm 包名 `@cinereel/ui`
- `apps/hyper-client` — Hyper 客户端，npm 包名 `@cinereel/hyper-client`
- `apps/service` — ASP.NET Core Web 项目（`Cinereel`），约定见 `apps/service/AGENTS.md`
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

- 构建：`dotnet build apps/service/Cinereel.csproj`
- 运行：`dotnet run --project apps/service/Cinereel.csproj`
- 测试：`dotnet test apps/service/tests/Cinereel.Tests/Cinereel.Tests.csproj`

## 通用约定

- 构建产物（`bin/`、`obj/`、`dist/`、`node_modules/` 等）不入库，已由 `.gitignore` 覆盖。
- 提交信息使用中文，遵循约定式提交风格（`feat(...)` / `fix(...)` / `refactor(...)` 等）。
- 需要记录架构决策时使用 ADR（架构决策记录）。

## 协作方式

本项目默认采用教学式结对协作。目标不仅是完成代码，也要让开发者理解代码结构、调用链和设计取舍。

- 接到涉及陌生模块或结构性改动的任务时，AI 代理应先只读调查，说明入口、核心模块、数据流、依赖方向和扩展点，再开始修改。
- 涉及模块边界、领域模型、公共接口或架构决策时，先给出可选方案及其取舍，经开发者确认后再实现。
- 实现按可验证的小步骤推进。每一步说明修改了哪些文件、调用链如何变化、设计依据是什么，以及尚未处理的内容。
- 核心业务逻辑优先由开发者编写；AI 代理可提供伪代码、测试用例、修改清单、代码审查和验证支持。除非开发者明确授权，否则不要一次性代写完整功能。
- 开发者提交实现后，AI 代理默认先进行审查，指出行为错误、结构问题、遗漏测试和理解偏差；未经要求不直接改写。
- 解释代码时引用具体文件和符号，优先说明“为什么这样设计”以及“变化会影响哪里”，避免只复述代码内容。
- 开发者明确要求直接实现、修复或自动完成任务时，以该指令为准；完成后仍需简要交代关键结构变化和验证结果。
