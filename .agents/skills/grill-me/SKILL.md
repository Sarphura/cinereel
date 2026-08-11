---
name: grill-me
description: 通过不间断的追问来打磨某个方案或设计。
disable-model-invocation: true
---

## 语言与术语

本 Skill 默认使用 **简体中文**：

- 与用户的对话、问题、选项、总结、解释、复述均使用简体中文。
- 生成或修改的所有文档（笔记、报告、Markdown 等）使用简体中文。
- 只有当用户明确要求切换语言（例如“请用英文回答”）时才使用其他语言。

以下内容必须保持原文（即使本身是英文术语，也原样使用，中文仅作解释或备注）：

- 代码标识符：变量名、函数名、类名、文件名、路径。
- CLI 命令、Shell 命令、配置键、环境变量、JSON/YAML 字段名。
- 库、框架、产品、协议、API、缩写的规范名称。
- 本项目的工作流术语：`grilling`、`Bootstrapping`、`Challenge`、`Refinement`、`ADR`、`CONTEXT.md`、`AskQuestion` 等。
- 领域中一旦确立的规范术语，原样复用，不得翻译或意译。

中文化时只翻译自然语言说明、标题、模板文字、UI 文案（`description`、`display_name`、`short_description` 等元数据）。示例定义与示例代码中的规范领域术语保留原文。

---

发起一次 `/grilling` 会话。