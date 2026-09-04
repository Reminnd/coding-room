# Codex Supervisor Router指南

> 状态：Superseded（2026-09-04）。本指南保留 Cloud Supervisor 历史证据；Current 路由由 Local Bridge 按 Stage DAG/Ready Set 执行。

Current authority/lifecycle is documented by the Local Supervisor Router and Git/parallel-worktree guides: one existing `stage/**` Actions workflow, explicit idempotent repository bootstrap, current-dispatch plus minimum Git recovery revalidation, and fixed Chat as sole formal Review Authority. This historical Cloud guide must not be used as a Current dispatch path.

| 属性 | 值 |
|---|---|
| 状态 | Superseded |
| Surface | ChatGPT Pro Codex Cloud |

## 职责

Codex负责Plan初稿、Supervisor路由和Accepted Contract的Coding执行。GitHub保存Plan/Contract/commit/branch/PR/Check/Review handoff；Work仅发送Ready for Review通知；Room SQLite不保存项目开发Plan/Contract/Review。

## Dispatch

1. 从Stage PR读取唯一`ROUTER_CONTRACT_V1`与唯一JSON fenced block。
2. 核对`status=dispatch_ready`、repository、work/stage/task/dispatch、branch、Review和fix policy。
3. 以GitHub trigger与commit对象读取actual `contract_commit_sha`/head，不接受Router静态SHA。
4. 用户在Codex Cloud显式发布：`执行 @<TASK_CONTRACT.md path> 中已批准的完整 Implementation Task。严格遵守 scope、non_goals、constraints、verification 和 question_policy；完成后按 Coding Result Contract 返回结果。`
5. Coding结果只进入Task/Stage branch；Supervisor不得approve、merge或自动Fix。

## 停止条件

Router不唯一、JSON/required external field无效、branch/SHA Git事实不一致、Contract未Accepted、GitHub API失败或实现要求突破冻结边界时立即停止并报告。不得增加fallback、重复parse、cache、registry、dispatch database或provider abstraction。
