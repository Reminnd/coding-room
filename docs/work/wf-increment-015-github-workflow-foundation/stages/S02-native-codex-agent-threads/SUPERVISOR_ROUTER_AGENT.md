# Local Parallel Codex — S02 Native Task Thread Supervisor Router Agent

Owner: Codex。更新日期：2026-09-07。当前 lifecycle：waiting_for_T05R02_environment_preparation。

## Role and authority

Local Bridge 拥有 discovery、DAG/Ready Set 和受控 Git delivery；fixed Chat 是唯一 Formal Review Authority。Supervisor 只返回 ready_to_integrate | blocked | needs_decision，不 approve、merge、改 main 或实现 Task。

当前入口为 [Router](./ROUTER_CONTRACT.md)、[Stage](./STAGE.md) 与 [T05R02 exact Contract](./tasks/T05R02-controller-owned-candidate-commit/TASK_CONTRACT.md)。T05R02 已是 Accepted target、confirmed_by_user=true，当前不得 Implementation 或 dispatch。Contract Acceptance 不等于执行授权。

## Immutable history / evidence

T05、T05R00、T05R01 integrated mapping 见 Stage；不重复执行，不给 Router 外 repair 补造 Bridge events。T05F00 -001/-002/-003 保持历史 terminal；最新 wf15-s02-t05f00-root-multi-agent-prompt-boundary-004 已 immutable blocked，不可 replay。exact Bridge reason：

> Worker completed with invalid required Coding Result: reported_task_head_sha must be a non-empty string

T05D00 native probe 证明 native_git_candidate_capability=fail；T05R01 gitCommonDir writableRoot 假设不足。exact probe/dispatch thread、turn、command 与 sandbox error 由 T05R02 Contract 拥有，不再沿用旧 waiting-for-environment 状态。

T05F00 -004 dirty worktree、T05D00 probe worktree/branch 保留不动。原 T05F00 -004 Contract 是 unchanged historical Accepted dispatch Contract，不是新执行授权。

## T05R02 acceptance boundary

- status=Accepted；confirmed_by_user=true；router_dispatchable=false。environment_preparation_authorized=false；environment_preparation_completed=false；implementation_authorized=false；manual_pre_native_codex_exec_authorized=false；Host_mechanical_commit_authorized=false。
- execution_surface=manual_pre_native_codex_exec；model_policy=coding_strong；model=gpt-5.6-sol；reasoning_effort=high；fallback=none；internal_multi_agent=false。
- 修复 Router native Worker 完成机制本身，不得经 Router Worker 自举，不加入 tasks[]/Ready Set、不伪造 task_integrated。
- 目标顺序与全部 gates 由 exact Contract 冻结：Worker implementation_ready → independent ownership/identity → Router verification → reread → Controller exact staging/one deterministic commit → existing mechanicalGate/Supervisor/delivery。
- native Worker 只修改 owned working-tree files、无 Git metadata write authority；candidate authority 为 sandbox 外 Controller。native facts 仍来自 processResult.native，verification authority 仍为 runVerification，Supervisor authority 不变。
- 下一 gate 固定为 environment preparation → separate manual execution authorization；当前两者均未授权。后续 bootstrap Git delivery 仍按单独授权推进。T05R02 自身 verified Diff 的一次 Host mechanical commit 仅可由后续单独用户授权；不能变成正常 Task fallback。

## Downstream / stopping boundary

当前不旋转 T05F00 dispatch，不生成 -005 Contract，不继续 T05F00。T05R02 integrated 且 process STOP 后才 fresh planning -005，使用新 candidate authority，-004 永久 immutable blocked。

[T05F01](./tasks/T05F01-generic-worker-result-boundary/TASK_CONTRACT.md) 仍 Proposed/confirmed_by_user=false，Contract unchanged、未执行；T05R02 集成后重审并删除重复范围，再单独接受。[T06](./tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md) 保持 Planning Placeholder/unchanged，不 dispatch。

本轮仅四份 governance 文档，Router JSON byte-equivalent，dependencies/owns 不变。acceptance checks 通过后一个 docs(s02): accept T05R02 contract commit（parent=4f3ea99d279cac0d7281eff850766623b754d47a）、一次普通 non-force Stage push，push 后 STOP。不得 continuous start、run-once、Worker、Supervisor execution、Task push、cherry-pick、Formal Review、main write 或 merge。next_required_action=T05R02_environment_preparation_authorization。
