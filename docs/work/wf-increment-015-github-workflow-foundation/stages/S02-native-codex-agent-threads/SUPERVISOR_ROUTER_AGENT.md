# Local Parallel Codex — S02 Native Task Thread Supervisor Router Agent

Owner: Codex。更新日期：2026-09-09。当前 lifecycle：`post_task_integration_formal_review_cycle`。

## Role and authority

Local Bridge 拥有 discovery、DAG/Ready Set 和受控 Git delivery；fixed Chat 是唯一 Formal Review Authority。Supervisor 只返回 `ready_to_integrate | blocked | needs_decision`，不 approve、merge、修改 `main` 或实现 Task。

当前入口为 [Router](./ROUTER_CONTRACT.md)、[Stage](./STAGE.md) 与 [T06 Planning Placeholder](./tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md)。T05、T05F00 -005 与 T05F01 -002 已全部集成；Router 当前没有新的 Task dispatch。

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

## T05F01 integrated production fact

- Dispatch `wf15-s02-t05f01-generic-worker-result-boundary-001` immutable terminal blocked：exact reason=`Worker completed with invalid required Coding Result: duplicate field task_id`，process exit=`0`，native thread=`01a08136-8359-7471-a380-2f412e853bdb`，turn=`01a08136-83d1-7b00-97fc-86c2d0f7aaed`。其branch/worktree保留为dirty evidence，不得replay或cleanup；未形成Controller candidate、Task push、Stage integration或`candidate_ready`。
- Dispatch `wf15-s02-t05f01-generic-worker-result-boundary-002` 已由 production Bridge 集成：source=`f6bafbf5df27a6cab8440fd7b577e49f8b6a74d6` → Stage=`7de85b277693f7a907af907929d00239f9c62fd4`；Supervisor=`ready_to_integrate`。
- T05F01 generic Worker Result boundary 已集成：future parser/validator common fields 固定为 identity、three list fields 与 status；success=`implementation_ready` 且需 non-empty `changed_files`；`blocked/needs_decision` 在 Git observation 前 settle。
- Future production result 不要求 `native_backend`、`verification` 或 `reported_task_head_sha`。Native facts 来自 `processResult.native`；verification 来自 Router `task.verification → runVerification()`；ownership 来自 Router `owns`、observed working paths 与 `mechanicalGate()`。
- Current Controller observation、ownership、verification、revalidation、exact staging、candidate commit、Git facts、mechanical gate、Supervisor、push 与 Stage integration path 全部保持。
- T05F01 使用了 Root-only native multi-agent execution：A01/A02 concurrent，A03 read-only 且依赖 A01/A02 completion 与 Root focused verification。Children 无 Git authority；Root 未 add/commit/push，由现有 Controller 形成 candidate。

## Current Formal Review boundary

- Stage `7de85b277693f7a907af907929d00239f9c62fd4` 的 fixed Chat Formal Review 结果为 `REQUEST_CHANGES`，blockers=`FR-S02-001, FR-S02-002`；尚无 `PASS`。
- fixed Chat 是唯一 Formal Review Authority。Supervisor 不得 approve、`REQUEST_CHANGES`、merge、写 `main` 或重新执行 T05F01。
- 每个新的 Stage head 都必须经过 fresh candidate publication、GitHub verification 与 fixed Chat Formal Review。取得 `PASS` 与后续用户授权前，不得执行 Stage→main integration。
- S02FR01 是 manual non-Router Formal Review repair；不得创建 Bridge Task lifecycle、Worker、children、Supervisor execution 或 synthetic lifecycle event。
- [T06](./tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md) 仍为 `Planning Placeholder`、`dispatchable=false`、`confirmed_by_user=false`；等待当前 Formal Review cycle resolution 后再 fresh planning。

S02FR01 仅修复已确认的 Formal Review blockers。repair push 后停止；不得刷新 candidate、运行 Bridge、执行 Worker/children/Supervisor、重新 Formal Review、PR Ready、merge 或写 main。
