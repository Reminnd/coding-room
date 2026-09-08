# Local Parallel Codex — S02 Native Task Thread Supervisor Router Agent

Owner: Codex。更新日期：2026-09-08。当前 lifecycle：`waiting_for_T05F00_005_environment_preparation`。

## Role and authority

Local Bridge 拥有 discovery、DAG/Ready Set 和受控 Git delivery；fixed Chat 是唯一 Formal Review Authority。Supervisor 只返回 `ready_to_integrate | blocked | needs_decision`，不 approve、merge、修改 `main` 或实现 Task。

当前入口为 [Router](./ROUTER_CONTRACT.md)、[Stage](./STAGE.md) 与 fresh [T05F00 -005 Accepted Contract](./tasks/T05F00-root-multi-agent-prompt-boundary/TASK_CONTRACT.md)。Contract Acceptance 不等于 execution authorization；在 environment preparation 获得单独授权前，禁止 dispatch、environment preparation、Task branch/worktree creation、Worker、Supervisor execution 与 `run-once`。

## Integrated repair / immutable history

T05R02 已作为 manual bootstrap repair 集成：

```yaml
router_dispatchable: false
source_task_sha: eb4e375cf2e044f3ddb23a99c5fb0d3370bc7dab
stage_integration_sha: e2388030199400d62f11576fff51ff08441d6742
synthetic_bridge_event_created: false
```

不得为 T05R02 补造 `task_dispatched`、`task_supervised`、`task_integrated` 或其它 Bridge lifecycle event。T05F00 `-001`、`-002`、`-003`、`-004` 全部保留为 immutable terminal history；`-004` 不可 replay：

> Worker completed with invalid required Coding Result: reported_task_head_sha must be a non-empty string

`D:/agent/case/codex-claudecode-room-codex-workers/T05F00-root-multi-agent-prompt-boundary` 的 `-004` dirty evidence，以及 T05D00 probe worktree/branch，必须保持 untouched。

## T05F00 -005 planning boundary

- Fresh dispatch=`wf15-s02-t05f00-root-multi-agent-prompt-boundary-005`；fresh branch=`task/wf-increment-015-github-workflow-foundation/T05F00-root-multi-agent-prompt-boundary-005`。本轮只把 identity 写入 governance，不创建 branch/worktree。
- Contract=`Accepted`、`confirmed_by_user=true`、`implementation_authorized=false`、`environment_preparation_completed=false`、`run_once_authorized=false`。
- 业务 Goal 仍仅是 Worker prompt 的 Root-only native multi-agent 授权边界；T05F00 自身 `internal_multi_agent=false`、`worker_spawned_subagents=false`。
- Future production scope 精确为 `tools/codex-github-bridge/codex.mjs` 与 `tools/codex-github-bridge/tests/codex.test.mjs`；不得增加第三个 production/test file。
- Completion 使用已集成的 `implementation_ready → Controller-owned candidate` authority。Worker Git metadata authority=`none`；不得要求或执行 Worker `git add`、`git commit`、`git push`、checkout、branch、reset 或 rebase。
- `native_backend` 与 `verification` 仅是当前 transition envelope compatibility；native authority 来自 `processResult.native`，verification authority 来自 Router `task.verification → runVerification()`，ownership authority 来自 Router `owns`、Controller working-tree facts 与 `mechanicalGate`。

## Downstream / stopping boundary

当前 next action 只有 `T05F00_005_environment_preparation_authorization`。在该授权前不得 dispatch、准备执行环境、创建 Worker 或创建 Task worktree；`run-once` 继续需要独立授权。

[T05F01](./tasks/T05F01-generic-worker-result-boundary/TASK_CONTRACT.md) 保持 `Proposed`、`confirmed_by_user=false`、文件不变；后续 fresh planning 只保留 generic Worker Result cleanup，删除 T05R02 已解决的 Worker commit authority、`implementation_ready` transition、Controller-owned candidate creation 与 precommit gate 重复 scope。[T06](./tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md) 保持 unchanged。

本轮只允许四份 governance Acceptance 文件、一个 `docs(s02): accept T05F00 retry 005 contract` commit 和一次 ordinary non-force Stage push。push 后停止；不得 environment preparation、Task branch/worktree creation、Worker、Supervisor execution、`run-once`、Task push、cherry-pick、Formal Review、PR Ready、merge 或 main write。
