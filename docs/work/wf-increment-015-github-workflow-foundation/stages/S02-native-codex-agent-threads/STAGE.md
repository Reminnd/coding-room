# STAGE — S02-native-codex-agent-threads

- work_id: wf-increment-015-github-workflow-foundation
- Owner: Codex
- updated: 2026-09-08
- status: T05F00_005_accepted_waiting_for_environment_preparation
- lifecycle: waiting_for_T05F00_005_environment_preparation
- purpose: fresh_plan_root_multi_agent_prompt_boundary
- goal: 以已集成的 Controller-owned candidate completion authority，冻结 T05F00 fresh retry -005 Contract。
- main_base_sha: bd41ea8a1e259300241a345a659e7da90e24af0d
- planning_base_stage_sha: e2388030199400d62f11576fff51ff08441d6742
- stage_branch: stage/wf-increment-015-github-workflow-foundation/S02-native-codex-agent-threads
- dependencies: S01 accepted_and_integrated at exact GitHub main
- router: [ROUTER_CONTRACT.md](./ROUTER_CONTRACT.md)
- supervisor: [SUPERVISOR_ROUTER_AGENT.md](./SUPERVISOR_ROUTER_AGENT.md)
- integrated_repair_history: [T05R02 exact Contract](./tasks/T05R02-controller-owned-candidate-commit/TASK_CONTRACT.md)
- accepted_contract_status: Accepted
- confirmed_by_user: true
- environment_preparation_completed: false
- implementation_authorized: false
- router_dispatchable: false
- run_once_authorized: false
- current_terminal_dispatch: wf15-s02-t05f00-root-multi-agent-prompt-boundary-004
- proposed_dispatch: wf15-s02-t05f00-root-multi-agent-prompt-boundary-005
- retry_005_created: true
- next_required_action: T05F00_005_environment_preparation_authorization

## 已集成事实

| Task | Status | Source Task SHA | Stage commit SHA | Bridge lifecycle |
|---|---|---|---|---|
| T05-native-codex-thread-backend | integrated | `9cc6899b69a96c3d9cfbe12f57cf93fdf59bb434` | `dbd10202f5289d91d7caab9c67e1de878b0ae843` | existing Router history |
| T05R00-native-sandbox-wire-mode | integrated | `ba077fc1a39f85c179e65aa39b64646f4aed716a` | `ad3e00989932828e58e742bce66a6cf1e8ab0745` | non-Router repair；不得补造 |
| T05R01-native-linked-worktree-git-sandbox | integrated | `e00aba7ad2cfb414c718c9a6be8ef9395711d6cc` | `4ea459e8ff2beb9c8db8bc5c665f44ceebcf49fa` | non-Router repair；不得补造 |
| T05R02-controller-owned-candidate-commit | manual bootstrap repair integrated | `eb4e375cf2e044f3ddb23a99c5fb0d3370bc7dab` | `e2388030199400d62f11576fff51ff08441d6742` | `router_dispatchable=false`；`synthetic_bridge_event_created=false` |

T05R02 的 authoritative Git facts 仅为上述 source/Stage mapping。不得补造 `task_dispatched`、`task_supervised`、`task_integrated` 或其它 Bridge lifecycle event。

## Immutable terminal history / diagnosis

T05F00 `-001`、`-002`、`-003`、`-004` 全部是 immutable terminal history，不得 replay、改写或 cleanup。最新 terminal dispatch `wf15-s02-t05f00-root-multi-agent-prompt-boundary-004` 的 status=`blocked`，exact Bridge reason：

> Worker completed with invalid required Coding Result: reported_task_head_sha must be a non-empty string

必须保留以下 runtime evidence，不修改、不 cleanup、不 stage/commit：

- D:/agent/case/codex-claudecode-room-codex-workers/T05F00-root-multi-agent-prompt-boundary 的 -004 dirty worktree。
- D:/agent/case/codex-claudecode-room-codex-workers/T05D00-native-git-commit-probe 及 probe/wf-increment-015-github-workflow-foundation/T05D00-native-git-commit-probe branch。

## Scope freeze / next gates

1. Fresh identity 固定为 dispatch `wf15-s02-t05f00-root-multi-agent-prompt-boundary-005`、branch `task/wf-increment-015-github-workflow-foundation/T05F00-root-multi-agent-prompt-boundary-005`。Planning preflight 已确认 local branch、remote branch 与 worktree 均不存在；本轮不创建它们。
2. [T05F00 -005 Contract](./tasks/T05F00-root-multi-agent-prompt-boundary/TASK_CONTRACT.md) 为 `Accepted`、`confirmed_by_user=true`。只修复 Worker prompt 的 Root-only native multi-agent 授权边界；future writable production paths 精确为 `codex.mjs` 与 `tests/codex.test.mjs`。
3. T05R02 已解决 Worker commit authority、`implementation_ready` transition、Controller-owned candidate creation 与 precommit working-tree gates。T05F00 -005 使用该 production authority，不再要求 Worker `git add`、`git commit`、`candidate_ready` 或 `reported_task_head_sha`。
4. [T05F01](./tasks/T05F01-generic-worker-result-boundary/TASK_CONTRACT.md) 保持 `Proposed`、`confirmed_by_user=false` 且文件不变。后续必须 fresh planning，删除 T05R02 已完成的重复 scope，仅保留 generic Worker Result cleanup。
5. [T06](./tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md) 保持 unchanged、不可 dispatch。
6. 当前 next gate 仅为 `T05F00_005_environment_preparation_authorization`。`dispatch_ready` 是 Router 格式状态，不是 `run-once` 授权；environment preparation、Implementation、Worker、Supervisor execution 与 `run-once` 均未授权。

本轮 Acceptance 仅修改 `STAGE.md`、`ROUTER_CONTRACT.md`、`SUPERVISOR_ROUTER_AGENT.md` 与 T05F00 `TASK_CONTRACT.md`。验证后只允许一个 `docs(s02): accept T05F00 retry 005 contract` commit（parent exact `f8f3a2c47b97887493f29a766a571c26d70955b6`）和一次 ordinary non-force Stage push；push 后立即停止，不执行 environment preparation、Implementation、Task/Stage integration、Formal Review、PR Ready、merge 或 main write。
