# ROUTER CONTRACT — <stage_id>

<!-- ROUTER_CONTRACT_V1 -->

```json
{"contract_type":"router","contract_version":1,"status":"dispatch_ready","workflow_id":"<workflow_id>","stage_id":"<stage_id>","repository":"<owner/repo>","stage_branch":"<stage branch>","scheduler":{"mode":"dependency_dag","primary_objective":"minimize_wall_clock_time","safe_parallelism_first":true,"ready_set":"all_dependencies_integrated_and_owned_paths_non_overlapping","integration_order_when_simultaneously_eligible":["topological_priority","task_id"]},"tasks":[{"task_id":"<task_id>","dispatch_id":"<dispatch_id>","task_contract_path":"<repository-relative TASK_CONTRACT.md>","task_branch":"<task branch>","depends_on":[],"owns":["<owned path>"],"model_policy":"<policy>","reasoning_effort":"<effort>","fallback_model_policy":null,"verification":["<command and expected evidence>"]}],"integration":{"task_to_stage":"controlled_cherry_pick","record_mapping":["task_id","source_task_sha","stage_commit_sha"],"automatic_rebase":false,"automatic_conflict_resolution":false,"force":false},"review":{"authority":"chatgpt_fixed_chat","transport":"github_pull_request","supervisor_may_approve":false,"supervisor_may_merge":false},"fix_policy":{"mode":"always_confirm"},"execution":{"primary_surface":"local_codex","cloud_primary":false,"work":"removed","local_state_database":false}}
```

该 JSON 保持 Current reader 兼容的 initial `ROUTER_CONTRACT_V1` grammar；不得在 initial Router 中加入 runtime selector mode 或 acceptance。Increment 16 Candidate selector 只产生`canonical_stage_router`或`prepared_fix_router`；`needs_decision`是失败，不是第三种 mode。prepared Fix projection 必须保持`verification → PASS → Fix handoff`，且不得由 Actions 推断 acceptance 或启动 Worker。

Increment 16 T03 的`verification`必须逐字并按下列顺序保存：

1. `git diff --check`
2. `npm run typecheck`
3. `npm test`
4. `relative Markdown link and Documentation Map audit`
5. `decision/mechanical/handoff, Router-mode, four-command, lifecycle-order and failure-semantics audit`
6. `merge marker audit`
