# Local Parallel Codex — S02 Native Task Thread Supervisor Router Agent

Owner: Codex。更新日期：2026-09-08。当前 lifecycle：`waiting_for_T05F01_environment_preparation`。

## Role and authority

Local Bridge 拥有 discovery、DAG/Ready Set 和受控 Git delivery；fixed Chat 是唯一 Formal Review Authority。Supervisor 只返回 `ready_to_integrate | blocked | needs_decision`，不 approve、merge、修改 `main` 或实现 Task。

当前入口为 [Router](./ROUTER_CONTRACT.md)、[Stage](./STAGE.md) 与 fresh [T05F01 Accepted Contract](./tasks/T05F01-generic-worker-result-boundary/TASK_CONTRACT.md)。Complete exact Contract bundle 已由用户在 Stage planning SHA `f55b256c9e43c6d54b86c35fa88a06c41c36edb2` 上接受；acceptance 不授权 environment preparation、dispatch、Task branch/worktree、Worker/children、Supervisor execution 或 `run-once`。

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

## T05F00 -005 integrated production fact

```yaml
source_task_sha: 3acabe66784ff1e66501b9c09e08cbf86ff9976a
stage_integration_sha: f79780251332ad89844392cc3185a981cc2f496d
native_thread_id: 01a07fdf-33d1-7153-8cf6-e681eb08c1f9
native_turn_id: 01a07fdf-3450-70a3-be08-fe722c96abe2
model: gpt-5.6-sol / medium
controller_verification: focused 11/11; Bridge 112/112; typecheck pass; diff-check pass
supervisor: ready_to_integrate
```

This confirms the T05F00 Root-only prompt boundary and current Controller-owned candidate sequence through the real production Bridge. It does not alter T05F00 -004 or T05D00 evidence.

## T05F01 fresh planning boundary

- Fresh identity remains dispatch=`wf15-s02-t05f01-generic-worker-result-boundary-001` and branch=`task/wf-increment-015-github-workflow-foundation/T05F01-generic-worker-result-boundary`; preflight found no execution trace requiring rotation.
- Contract=`Accepted`、`confirmed_by_user=true`、`implementation_authorized=false`、`environment_preparation_completed=false`、`run_once_authorized=false`。
- Goal仅为 generic Worker Result cleanup：future parser/validator common fields固定为 identity、three list fields与 status；success=`implementation_ready` 且需 non-empty `changed_files`；`blocked/needs_decision` 在 Git observation前settle。
- Future production result不要求 `native_backend`、`verification` 或 `reported_task_head_sha`。Native facts来自 `processResult.native`；verification来自 Router `task.verification → runVerification()`；ownership来自 Router `owns`、observed working paths与 `mechanicalGate()`。
- Current Controller observation、ownership、verification、revalidation、exact staging、candidate commit、Git facts、mechanical gate、Supervisor、push与Stage integration path全部保留，不属于新实现 scope。
- Outer production scope精确为 `controller.mjs` 与 `tests/controller.test.mjs`；第三个 production/test file需要 `needs_decision` 并停止。
- T05F01仍须由 Root-only native multi-agent执行：A01/A02 concurrent，A03 read-only且依赖 A01/A02 completion与Root focused verification。Children无Git authority；Root无 add/commit/push authority，最终保留 unstaged implementation供现有Controller形成candidate。
- 单次 transition Root result必须兼容预先加载的current Controller：status=`implementation_ready`、无 `reported_task_head_sha`；临时 `native_backend/verification` mappings仅 compatibility-only、non-authoritative。不得在production增加task-ID branch。

## Downstream / stopping boundary

当前 next action 只有 `T05F01_environment_preparation_authorization`；acceptance 不授权 environment preparation、`run-once` 或 Formal Review。[T06](./tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md) 保持 unchanged。

本轮只允许九份列明的 governance acceptance files、一个 `docs(s02): accept T05F01 generic result contract` commit 和一次 ordinary non-force Stage push。push 后停止；不得准备环境、创建 Task branch/worktree、执行 Worker/children/Supervisor、运行 Bridge、修改 production、Formal Review、PR Ready、merge 或写 main。
