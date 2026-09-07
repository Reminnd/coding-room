# STAGE — S02-native-codex-agent-threads

- work_id: `wf-increment-015-github-workflow-foundation`
- Owner: Codex
- updated: 2026-09-07
- status: `waiting_for_T05F00_retry_004_contract_acceptance`
- lifecycle: `waiting_for_T05F00_retry_004_contract_acceptance`
- purpose: `repair_native_worker_transition_boundaries`
- goal: 在已集成 native backend 与 linked-worktree sandbox repair 上完成 Worker prompt delegation boundary，再处理独立确认的 generic Worker Result boundary 与文档。
- main_base_sha: `bd41ea8a1e259300241a345a659e7da90e24af0d`
- planning_base_stage_sha: `4ea459e8ff2beb9c8db8bc5c665f44ceebcf49fa`
- stage_branch: `stage/wf-increment-015-github-workflow-foundation/S02-native-codex-agent-threads`
- dependencies: S01 `accepted_and_integrated` at exact GitHub main。
- router: [ROUTER_CONTRACT.md](./ROUTER_CONTRACT.md)
- supervisor: [SUPERVISOR_ROUTER_AGENT.md](./SUPERVISOR_ROUTER_AGENT.md)
- active_retry: [T05F00 exact Contract](./tasks/T05F00-root-multi-agent-prompt-boundary/TASK_CONTRACT.md)
- active_dispatch: `wf15-s02-t05f00-root-multi-agent-prompt-boundary-004`
- active_contract_status: `Proposed`
- confirmed_by_user: `false`
- environment_preparation_completed: `false`
- run_once_authorized: `false`
- active_dispatch_bridge_event_exists: `false`（本轮 GitHub 读取时）

## 已集成事实

| Task | Status | Source Task SHA | Stage commit SHA |
|---|---|---|---|
| T05-native-codex-thread-backend | integrated | `9cc6899b69a96c3d9cfbe12f57cf93fdf59bb434` | `dbd10202f5289d91d7caab9c67e1de878b0ae843` |
| T05R00-native-sandbox-wire-mode | integrated | `ba077fc1a39f85c179e65aa39b64646f4aed716a` | `ad3e00989932828e58e742bce66a6cf1e8ab0745` |
| T05R01-native-linked-worktree-git-sandbox | integrated | `e00aba7ad2cfb414c718c9a6be8ef9395711d6cc` | `4ea459e8ff2beb9c8db8bc5c665f44ceebcf49fa` |

T05 保留在 Router 供 recovery/dependency 使用；T05R00/T05R01 不属于 Router Task，禁止重复执行或补造 Bridge event。

## T05F00 历史与本轮诊断

- `-001` 为 historical `needs_decision`，`-002` 为 historical `blocked` dependency gap；均不得 replay。
- `wf15-s02-t05f00-root-multi-agent-prompt-boundary-003` 为 immutable historical `blocked`；`bridge_event_exists=true`、`replayable=false`、`preserved_dirty_worktree=true`。
- native thread：`01a07a28-4b47-7c82-98c5-1bb4cdd3cb18`；turn：`01a07a28-4bbd-7920-a605-386d96c6a455`；native terminal：`completed`。
- [Bridge terminal event](https://github.com/Reminnd/coding-room/pull/6#issuecomment-5565132417)：`Worker completed with invalid required Coding Result: status must be candidate_ready`。
- 历史目录 `D:/agent/case/codex-claudecode-room-codex-workers/T05F00-root-multi-agent-prompt-boundary` 保留为 `failed_dispatch_evidence`。HEAD 仍为 planning base、commit_count_from_base=0、staged_files=[]，只含两个 owned files 的 dirty Diff。不得修改、commit、integrate、cleanup 或直接复用为 retry candidate；cleanup 等待后续单独授权。

本轮重新验证为 focused 15/15、Bridge suite 103/103、typecheck 与 diff check 均 exit 0。详细命令、证据边界与最小 completion 要求由 [exact T05F00 Contract](./tasks/T05F00-root-multi-agent-prompt-boundary/TASK_CONTRACT.md) 拥有。Case A：`implementation_diff_appears_valid / candidate_or_result_completion_failed`，无需扩大 scope。原 Worker final 无法恢复，具体原因保持 unknown；重新验证不代表原 Worker 当时的结果。

## 后续门禁与顺序

1. 用户确认 `-004` exact Contract；当前 Proposed 不构成 execution authority。
2. 后续单独授权历史 worktree/local branch cleanup、从届时 exact Stage 创建 fresh `-004` Task worktree、Host `npm ci`；完成 package unchanged、Git clean、ignored dependencies 与 TypeScript resolvable gates。
3. 用户另行授权 exactly one fresh `run-once`，只执行 `-004`。native Worker 完成四项 verification、真实单一 candidate commit 与完整 result 后，既有 Bridge 独立 verification、Supervisor Integration 与 controlled integration 才能继续；失败即停止，禁止自动 Fix。
4. T05F00 integration + Stage push 后 STOP，返回 fixed Chat 核验 Stage SHA 与真实 `task_integrated`，再处理 T05F01 exact acceptance。
5. [T05F01](./tasks/T05F01-generic-worker-result-boundary/TASK_CONTRACT.md) 仍为 `Proposed`、`confirmed_by_user=false`；其未来 fresh process 必须加载 T05F00 prompt，并按独立 Accepted Contract 使用 Root-only native multi-agent；integration 后 STOP。
6. [T06](./tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md) 仍为 `Planning Placeholder`、不可 dispatch。T05F01 integration 后重新检查实际 Controller，确定 exact docs scope 并单独接受。
7. 所有必要 Task 完成后才允许既有 `stage_candidate_ready` 路径、Stage verification、fixed Chat Formal Review 和用户 exact-SHA acceptance。

本轮只写四个 governance files、一个 planning commit 和一次普通 non-force Stage push。continuous `start`、Worker、`run-once`、Supervisor Integration、Task push、cherry-pick、Formal Review、main write 与 merge 均不执行。S01 是 immutable history，`room:status --help` 保持 Deferred，不恢复 S01 Bootstrap-B。
