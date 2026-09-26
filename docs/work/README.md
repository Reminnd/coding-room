# Workflow实例文档

`docs/work/`只保存具体Workflow实例的`PLAN`、`EXECUTION_PLAN`、`STAGE`、`TASK`、`ROUTER`与`FIX`；旧`SUBTASK`文件仅作为历史证据，不是Current调度单元。长期项目文档、Architecture Review、ADR、Current/Accepted状态和Agent guides位于[`docs/documents/`](../documents/README.md)。这里的Markdown是GitHub持久化交接面，不是generator、registry、database或Room authority。

每个实例使用稳定`work_id`目录；模板位于[`_templates/`](./_templates/)。Router中的Git SHA必须在执行时读取真实Git事实，不得静态填写。

## Increment 16 Candidate workflow

[Increment 16 Plan](./wf-increment-016-github-review-fix-acceptance-closure/PLAN.md)、[Execution Plan](./wf-increment-016-github-review-fix-acceptance-closure/EXECUTION_PLAN.md)、[S01 Stage](./wf-increment-016-github-review-fix-acceptance-closure/stages/S01-review-fix-acceptance-closure/STAGE.md)、[Router Contract](./wf-increment-016-github-review-fix-acceptance-closure/stages/S01-review-fix-acceptance-closure/ROUTER_CONTRACT.md)以及[T01](./wf-increment-016-github-review-fix-acceptance-closure/stages/S01-review-fix-acceptance-closure/tasks/T01-review-fix-lifecycle-core/TASK_CONTRACT.md)、[T02](./wf-increment-016-github-review-fix-acceptance-closure/stages/S01-review-fix-acceptance-closure/tasks/T02-review-fix-actions-selector/TASK_CONTRACT.md)、[T03](./wf-increment-016-github-review-fix-acceptance-closure/stages/S01-review-fix-acceptance-closure/tasks/T03-review-fix-documentation/TASK_CONTRACT.md)按`T01 → T02 → T03`保存 Candidate lineage。它们投影 Option A 的 GitHub PR comment lifecycle facts；decision、mechanical 与 handoff 使用互不替代的 closed grammar，仅允许`canonical_stage_router`与`prepared_fix_router`两种 selector mode。该实例仍须通过 implementation Review、用户接受并集成到`main`后才可成为 Current；实例文档不新增 database 或 authority。
