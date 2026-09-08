# STAGE — S02-native-codex-agent-threads

- work_id: wf-increment-015-github-workflow-foundation
- Owner: Codex
- updated: 2026-09-08
- status: T05F00_005_integrated_waiting_for_T05F01_fresh_contract_acceptance
- lifecycle: waiting_for_T05F01_fresh_contract_acceptance
- purpose: fresh_plan_generic_worker_result_boundary
- goal: 仅清理 Worker Result parser/validator 的 T05-specific self-report requirement，保留现有 Controller-owned candidate architecture。
- main_base_sha: bd41ea8a1e259300241a345a659e7da90e24af0d
- planning_base_stage_sha: f79780251332ad89844392cc3185a981cc2f496d
- stage_branch: stage/wf-increment-015-github-workflow-foundation/S02-native-codex-agent-threads
- dependencies: S01 accepted_and_integrated at exact GitHub main
- router: [ROUTER_CONTRACT.md](./ROUTER_CONTRACT.md)
- supervisor: [SUPERVISOR_ROUTER_AGENT.md](./SUPERVISOR_ROUTER_AGENT.md)
- integrated_repair_history: [T05R02 exact Contract](./tasks/T05R02-controller-owned-candidate-commit/TASK_CONTRACT.md)
- proposed_contract: [T05F01 fresh Contract](./tasks/T05F01-generic-worker-result-boundary/TASK_CONTRACT.md)
- proposed_contract_status: Proposed
- confirmed_by_user: false
- environment_preparation_completed: false
- implementation_authorized: false
- router_dispatchable: false
- run_once_authorized: false
- current_integrated_dispatch: wf15-s02-t05f00-root-multi-agent-prompt-boundary-005
- proposed_dispatch: wf15-s02-t05f01-generic-worker-result-boundary-001
- next_required_action: T05F01_contract_acceptance

## 已集成事实

| Task | Status | Source Task SHA | Stage commit SHA | Bridge lifecycle |
|---|---|---|---|---|
| T05-native-codex-thread-backend | integrated | `9cc6899b69a96c3d9cfbe12f57cf93fdf59bb434` | `dbd10202f5289d91d7caab9c67e1de878b0ae843` | existing Router history |
| T05R00-native-sandbox-wire-mode | integrated | `ba077fc1a39f85c179e65aa39b64646f4aed716a` | `ad3e00989932828e58e742bce66a6cf1e8ab0745` | non-Router repair；不得补造 |
| T05R01-native-linked-worktree-git-sandbox | integrated | `e00aba7ad2cfb414c718c9a6be8ef9395711d6cc` | `4ea459e8ff2beb9c8db8bc5c665f44ceebcf49fa` | non-Router repair；不得补造 |
| T05R02-controller-owned-candidate-commit | manual bootstrap repair integrated | `eb4e375cf2e044f3ddb23a99c5fb0d3370bc7dab` | `e2388030199400d62f11576fff51ff08441d6742` | `router_dispatchable=false`；`synthetic_bridge_event_created=false` |
| T05F00-root-multi-agent-prompt-boundary -005 | integrated | `3acabe66784ff1e66501b9c09e08cbf86ff9976a` | `f79780251332ad89844392cc3185a981cc2f496d` | production Bridge；Supervisor `ready_to_integrate` |

T05R02 的 authoritative Git facts 仅为上述 source/Stage mapping。不得补造 `task_dispatched`、`task_supervised`、`task_integrated` 或其它 Bridge lifecycle event。

## Immutable terminal history / diagnosis

T05F00 `-001`、`-002`、`-003`、`-004` 全部是 immutable terminal history，不得 replay、改写或 cleanup。最新 terminal dispatch `wf15-s02-t05f00-root-multi-agent-prompt-boundary-004` 的 status=`blocked`，exact Bridge reason：

> Worker completed with invalid required Coding Result: reported_task_head_sha must be a non-empty string

必须保留以下 runtime evidence，不修改、不 cleanup、不 stage/commit：

- D:/agent/case/codex-claudecode-room-codex-workers/T05F00-root-multi-agent-prompt-boundary 的 -004 dirty worktree。
- D:/agent/case/codex-claudecode-room-codex-workers/T05D00-native-git-commit-probe 及 probe/wf-increment-015-github-workflow-foundation/T05D00-native-git-commit-probe branch。

## T05F00 -005 production evidence

```yaml
source_task_sha: 3acabe66784ff1e66501b9c09e08cbf86ff9976a
stage_integration_sha: f79780251332ad89844392cc3185a981cc2f496d
native_thread_id: 01a07fdf-33d1-7153-8cf6-e681eb08c1f9
native_turn_id: 01a07fdf-3450-70a3-be08-fe722c96abe2
resolved_model: gpt-5.6-sol
reasoning_effort: medium
controller_verification:
  focused: 11/11
  bridge: 112/112
  typecheck: pass
  diff_check: pass
supervisor: ready_to_integrate
```

## Scope freeze / next gates

1. T05F00 -005 已通过真实 production Bridge 集成；T05F00 -004 dirty worktree 与 T05D00 probe evidence 继续 untouched。
2. [T05F01 fresh Contract](./tasks/T05F01-generic-worker-result-boundary/TASK_CONTRACT.md) 保持 `Proposed`、`confirmed_by_user=false`。Fresh preflight 已确认 `-001` 无 lifecycle event、local/remote branch 或非 planning-residue worktree，因此 identity 不旋转。
3. T05F01 仅清理 generic Worker Result parser/validator：future result 不要求 `native_backend`、`verification` 或 `reported_task_head_sha`，成功 status 为 `implementation_ready`。T05R02 与 T05F00 已建立的 Controller candidate path 全部作为 current behavior 保留。
4. T05F01 future production scope 精确为 `controller.mjs` 与 `tests/controller.test.mjs`；若需要第三个 production/test file，必须 `needs_decision` 并停止。
5. T05F01 仍是 T05F00 Root-only native multi-agent prompt boundary 的真实 consumer；当前只生成 Contract，不接受、不准备环境、不 dispatch、不执行 children 或 `run-once`。
6. [T06](./tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md) 保持 unchanged、不可 dispatch。
7. 当前唯一 next gate 是 `T05F01_contract_acceptance`；不是 environment preparation、`run-once` 或 Formal Review。

本轮只修改九份列明的 T05F01 governance planning files。验证后只允许一个 `docs(s02): replan T05F01 generic result cleanup` commit（parent exact `f79780251332ad89844392cc3185a981cc2f496d`）和一次 ordinary non-force Stage push；push 后立即停止。
