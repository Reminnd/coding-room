# STAGE — S02-native-codex-agent-threads

- work_id: wf-increment-015-github-workflow-foundation
- Owner: Codex
- updated: 2026-09-07
- status: T05R02_accepted_waiting_for_environment_preparation
- lifecycle: waiting_for_T05R02_environment_preparation
- purpose: repair_native_worker_transition_boundaries
- goal: 先冻结 Controller-owned candidate commit repair，再 fresh planning T05F00 retry 与后续 generic Worker Result。
- main_base_sha: bd41ea8a1e259300241a345a659e7da90e24af0d
- planning_base_stage_sha: f777c32cce0852ef1eb4f89ac2a4121e02bc3e2f
- stage_branch: stage/wf-increment-015-github-workflow-foundation/S02-native-codex-agent-threads
- dependencies: S01 accepted_and_integrated at exact GitHub main
- router: [ROUTER_CONTRACT.md](./ROUTER_CONTRACT.md)
- supervisor: [SUPERVISOR_ROUTER_AGENT.md](./SUPERVISOR_ROUTER_AGENT.md)
- accepted_repair: [T05R02 exact Contract](./tasks/T05R02-controller-owned-candidate-commit/TASK_CONTRACT.md)
- accepted_contract_status: Accepted
- confirmed_by_user: true
- acceptance_base_stage_sha: 4f3ea99d279cac0d7281eff850766623b754d47a
- environment_preparation_authorized: false
- environment_preparation_completed: false
- implementation_authorized: false
- manual_pre_native_codex_exec_authorized: false
- Host_mechanical_commit_authorized: false
- router_dispatchable: false
- execution_surface: manual_pre_native_codex_exec
- run_once_authorized: false
- current_terminal_dispatch: wf15-s02-t05f00-root-multi-agent-prompt-boundary-004
- retry_005_created: false
## 已集成事实

| Task | Status | Source Task SHA | Stage commit SHA |
|---|---|---|---|
| T05-native-codex-thread-backend | integrated | `9cc6899b69a96c3d9cfbe12f57cf93fdf59bb434` | `dbd10202f5289d91d7caab9c67e1de878b0ae843` |
| T05R00-native-sandbox-wire-mode | integrated | `ba077fc1a39f85c179e65aa39b64646f4aed716a` | `ad3e00989932828e58e742bce66a6cf1e8ab0745` |
| T05R01-native-linked-worktree-git-sandbox | integrated | `e00aba7ad2cfb414c718c9a6be8ef9395711d6cc` | `4ea459e8ff2beb9c8db8bc5c665f44ceebcf49fa` |

T05 保留在 Router 供 recovery/dependency 使用；T05R00/T05R01 不属于 Router Task，禁止重复执行或补造 Bridge event。

## Immutable terminal history / diagnosis

T05F00 -001 historical needs_decision、-002 historical blocked dependency gap、-003 historical blocked 均不可 replay。-003 native thread=01a07a28-4b47-7c82-98c5-1bb4cdd3cb18、turn=01a07a28-4bbd-7920-a605-386d96c6a455 completed；[Bridge terminal event](https://github.com/Reminnd/coding-room/pull/6#issuecomment-5565132417) reason 为 Worker completed with invalid required Coding Result: status must be candidate_ready。原 -003 final 未恢复；其历史判断不再用作当前执行许可。

用户提供的最新 authority：-004 已 immutable terminal blocked；native thread=01a07ac6-b43e-7053-9263-47dca6c62301，turn=01a07ac6-b4c4-7243-88a7-a71c2460fc03。exact Bridge reason：

> Worker completed with invalid required Coding Result: reported_task_head_sha must be a non-empty string

原 [T05F00 -004 Accepted Contract](./tasks/T05F00-root-multi-agent-prompt-boundary/TASK_CONTRACT.md) 保持 unchanged，作为历史 dispatch Contract，不能继续执行。旧 environment-preparation waiting 状态已被 terminal blocked 取代。

T05D00 authoritative probe 证明 file create success、git add failure、commit not executed；native_git_candidate_capability=fail。失败边界为 linked_worktree_git_metadata_protected_by_native_sandbox，T05R01 writableRoots 假设不足。exact probe thread/turn、command/error 与目标 authority 由 [T05R02 Contract §1–4](./tasks/T05R02-controller-owned-candidate-commit/TASK_CONTRACT.md) 单一记录。

必须保留以下 runtime evidence，不修改、不 cleanup、不 stage/commit：

- D:/agent/case/codex-claudecode-room-codex-workers/T05F00-root-multi-agent-prompt-boundary 的 -004 dirty worktree。
- D:/agent/case/codex-claudecode-room-codex-workers/T05D00-native-git-commit-probe 及 probe/wf-increment-015-github-workflow-foundation/T05D00-native-git-commit-probe branch。

## Scope freeze / next gates

1. 用户已明确接受 exact T05R02 Contract；四个 production files 与三个 direct tests 为未来 exact seven-file implementation scope。候选由 Controller 在 sandbox 外创建；Worker 只交付 implementation_ready。目标尚未实现。
2. T05R02 不加入 Router tasks[] 或 Ready Set；Router JSON 保持 byte-equivalent，dispatch/dependencies/owns 不变。本轮不派发任何 Task，不伪造 task_integrated。
3. 下一步仅 T05R02_environment_preparation_authorization；environment preparation 完成后仍须 separate manual execution authorization。Contract Acceptance 不授予任何 Implementation 执行权限；后续执行固定 manual_pre_native_codex_exec、coding_strong/gpt-5.6-sol/high、fallback none、internal_multi_agent false。自身 verified Diff 的一次 Host mechanical commit 仅可由后续单独用户授权。
4. T05R02 integrated 且 process STOP 后，才 fresh planning T05F00 -005；使用 implementation_ready → Controller-owned candidate，-004 保持 immutable blocked。本轮不生成 -005 exact Contract、不旋转 dispatch。
5. [T05F01](./tasks/T05F01-generic-worker-result-boundary/TASK_CONTRACT.md) 仍 Proposed、confirmed_by_user=false、未执行。T05R02 integrated 后重审其 Contract 并移除重复范围，之后单独接受；本轮 Contract unchanged。
6. [T06](./tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md) 仍 Planning Placeholder，unchanged、不可 dispatch。完成必要 Task 后才进行 stage_candidate_ready、Stage verification、fixed Chat Formal Review 和用户 exact-SHA acceptance。

本轮 changed files exact 为 STAGE.md、ROUTER_CONTRACT.md、SUPERVISOR_ROUTER_AGENT.md 与 T05R02 TASK_CONTRACT.md。acceptance gates 通过后仅一个 docs(s02): accept T05R02 contract commit，parent exact 4f3ea99d279cac0d7281eff850766623b754d47a；一次 ordinary non-force Stage push 后 STOP。S01 immutable history、room:status --help Deferred 保持。
