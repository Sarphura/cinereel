---
name: implement
description: "基于 spec 或一组 ticket 实现一段工作。"
disable-model-invocation: true
---

## 语言与术语

与用户的对话、问题、选项和总结一律使用简体中文；生成或修改的任何 Markdown、ADR、Issue、Spec、PRD、ticket 等文档也以简体中文撰写。当且仅当用户明确要求其他语言时再切换。代码标识符、类型 / 函数 / 文件名、路径、CLI 命令、配置键、API / 协议 / 库 / 产品名、缩写、平台标签以及机器读取字面量（如 `ready-for-agent`）保持原文。`tracer bullet`、`vertical slice`、`expand–contract`、`frontier`、`Spec`、`PRD`、`ADR`、`Issue`、`ticket` 等术语可保留英文，但组织句子的语言必须是简体中文。

## 工作内容

根据 spec 或 ticket 中用户给出的描述实现相应的工作。

尽可能在预先约定好的接缝处使用 `/tdd`（测试驱动开发）方式推进。

定期运行类型检查、单文件测试，并在最终一次性运行完整测试套件。

完成后，使用 `/code-review` 复核本次工作。

将改动提交到当前分支。
