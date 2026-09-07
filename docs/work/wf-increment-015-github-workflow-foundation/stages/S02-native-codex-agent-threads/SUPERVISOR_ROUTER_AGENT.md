# Local Parallel Codex — S02 Native Task Thread Supervisor Router Agent

Owner: Codex。更新日期：2026-09-07。当前 lifecycle：`waiting_for_T05F00_retry_004_environment_preparation`。

## Role and authority

Local Bridge 为 `Reminnd/coding-room` 的 `S02-native-codex-agent-threads` 执行 discovery、dependency DAG/Ready Set、native Task execution 与受控 Git 交付。fixed Chat = Formal Review Authority；Supervisor 只可返回 `ready_to_integrate | blocked | needs_decision`，不得 Formal Review、approve、merge、修改 main 或实现 Task。

执行前完整读取 [Router](./ROUTER_CONTRACT.md)、当次 [exact T05F00 Contract](./tasks/T05F00-root-multi-agent-prompt-boundary/TASK_CONTRACT.md) 和实际 GitHub/Git/thread facts；状态汇总见 [Stage](./STAGE.md)。不要使用 S01 或 superseded Pilot Router。

## 已完成 transition 与 immutable history

T05、T05R00、T05R01 已 integrated。T05R01 source `e00aba7ad2cfb414c718c9a6be8ef9395711d6cc` → Stage `4ea459e8ff2beb9c8db8bc5c665f44ceebcf49fa`。T05R00/T05R01 均在 Router 外，不得执行或补造 Bridge events。

T05F00 `-001` historical needs_decision、`-002` historical blocked dependency gap、`wf15-s02-t05f00-root-multi-agent-prompt-boundary-003` historical terminal blocked 永久不可 replay。`-003` native thread `01a07a28-4b47-7c82-98c5-1bb4cdd3cb18`、turn `01a07a28-4bbd-7920-a605-386d96c6a455` completed，真实 Bridge reason 为 `Worker completed with invalid required Coding Result: status must be candidate_ready`。

历史 dirty workspace `D:/agent/case/codex-claudecode-room-codex-workers/T05F00-root-multi-agent-prompt-boundary` 必须保留为 failed_dispatch_evidence，直到后续单独 cleanup 授权；不得修改、stage、commit、integrate 或复用为新 candidate。原始 final message 不可恢复；本轮重新验证与 Case A 判断见 exact Contract，不能由 Bridge reason 反推原 Worker status 或声称已证明 commit sandbox 失败。

## Active retry -004

Active dispatch 为 `wf15-s02-t05f00-root-multi-agent-prompt-boundary-004`：

- status: Accepted
- confirmed_by_user: true
- bridge_event_exists: false（本轮读取时）
- environment_preparation_completed: false
- run_once_authorized: false
- model_policy: coding_strong
- reasoning_effort: medium
- fallback: none
- internal_multi_agent: false
- worker_spawned_subagents: false

用户已明确接受 Stage `23b0866cd3ff22c253c725fd73c9b94f71f37906` 中的 exact Contract；dispatch `-004` 不再旋转。当前仍不得 run-once：historical `-003` dirty worktree/local branch 尚未在单独授权下 cleanup，fresh `-004` worktree 尚未创建，Host `npm ci` 与 Git clean/environment gates 尚未完成，fresh run-once 尚未单独授权。Acceptance 不授予 environment preparation 或 execution authority；continuous start 禁止。

## Future execution gates

1. Exact retry Contract Accepted / confirmed_by_user=true；后续 cleanup/fresh Task worktree/Host npm ci 与一次 run-once 各有授权。
2. Repository Actions ready、Router/PR/handoff identity 一致、GitHub main 符合 lineage、local/remote Stage equal 且 clean；fresh Task HEAD 等于获准 dispatch base，Task branch 正确且 clean，package unchanged、node_modules ignored、TypeScript resolvable。
3. 当前 dispatch 无 terminal 或未结算 event；若事实不一致，needs_decision 并停止，不 repair、retry 或旋转 dispatch。
4. Fresh process 使用 native backend、one Task = one native thread、coding_strong / gpt-5.6-sol / medium、no fallback；完整注入 exact Contract。T05F00 自身禁止 subagent。
5. Worker 只改变 exact two owned files；四项 verification ordinary pass 后 stage 两路径、创建 exactly one Conventional Commit、重新读取 HEAD 并返回真实 candidate_ready。candidate 不成立或 commit 失败即停止，不 Host mechanical fallback、不自动 Fix。
6. Bridge 独立核验 candidate parent、single commit、changed files、clean worktree、reported SHA、native terminal 与 verification；Supervisor 仅 ready_to_integrate 时允许普通 Task push、remote equality gate、controlled cherry-pick、普通 Stage push、remote equality gate 与真实 task_integrated。
7. Conflict → git cherry-pick --abort → blocked；禁止 force、rebase、自动解冲突。T05F00 integration + Stage push 后 STOP；不得在同一 process 继续下游。

本轮不执行这些 future gates 中的 mutation；acceptance commit/push 不授予 environment preparation 或 execution，普通 Stage push 成功后立即 STOP。

## Downstream acceptance and handoff

T05F01 仍 Proposed / confirmed_by_user=false。T05F00 集成并停止后，fixed Chat 核验新 Stage SHA 与真实 task_integrated，再接受 exact T05F01。未来 T05F01 fresh process 必须加载 T05F00 prompt；Root 完整读取 outer Contract、internal Router、所有 child exact Contracts，按已确认 Contract 使用 native multi-agent；child writing descendants 不得自动继承 Root 授权，不可用时 needs_decision，禁止 serial fake-agent fallback。T05F01 集成后 STOP。

T06 仍 Planning Placeholder，不属于 Ready Set；T05F01 集成后重新检查实际 generic Controller 才能确定 exact docs ownership、生成 Contract 并由用户单独接受。完成必要 Task 前禁止 stage_candidate_ready 和 PR Ready for Review。最终 Stage 仅由 fixed Chat Formal Review，用户另行 exact-SHA acceptance；Supervisor 无 main authority。

保持 GitHub/Git 为持久化 authority，不增加本地 workflow database、Router field、Task-ID special case、compatibility mode 或 automatic Fix。
