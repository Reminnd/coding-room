# ROUTER CONTRACT — <task_id>

<!-- ROUTER_CONTRACT_V2: one Stage DAG and Ready Set -->

```json
{"contract_type":"router","contract_version":2,"work_id":"<work_id>","stage_id":"<stage_id>","status":"dispatch_ready","repository":"<owner/repo>","stage_branch":"<stage_branch>","tasks":[{"task_id":"<task_id>","depends_on":[],"task_branch":"<task_branch>","worktree":"<worktree>","model_policy":"<policy>","reasoning_effort":"<effort>"}],"ready_set":["<task_id>"],"review":{"authority":"chatgpt_fixed_chat","transport":"github_pull_request","notifications":"non_authoritative"},"integration":{"mode":"controlled_task_to_stage_cherry_pick","conflict":"stop"},"fix_policy":{"mode":"always_confirm"}}
```
