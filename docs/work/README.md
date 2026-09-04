# Workflow实例文档

`docs/work/`只保存具体Workflow实例的`PLAN`、`EXECUTION_PLAN`、`STAGE`、`TASK`、`ROUTER`、`SUBTASK`与`FIX`。长期项目文档、Architecture Review、ADR、Current/Accepted状态和Agent guides位于[`docs/documents/`](../documents/README.md)。这里的Markdown是GitHub持久化交接面，不是generator、registry、database或Room authority。

每个实例使用稳定`work_id`目录；模板位于[`_templates/`](./_templates/)。Router中的Git SHA必须在执行时读取真实Git事实，不得静态填写。
