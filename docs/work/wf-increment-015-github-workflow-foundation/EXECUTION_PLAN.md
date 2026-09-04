# EXECUTION PLAN — wf-increment-015-github-workflow-foundation

- status: Accepted
- bootstrap_base: `d5827a052190d63fb2fbbd9fbd970ba9db92ed64`
- stage: `S01-foundation-pilot`
- stage_branch: `stage/wf-increment-015-github-workflow-foundation/S01-foundation-pilot`
- router: [`S01 Stage Router`](./stages/S01-foundation-pilot/ROUTER_CONTRACT.md)
- current_tasks: `T01-router`, `T02-actions`, `T03-docs`, `T04-bridge`
- fix_policy: `always_confirm`

S01 Ready Set 四项无依赖且 ownership 不重叠，可并行执行；完成后 controlled cherry-pick 集成。S01 采用 Bootstrap-B exact-SHA verification → fixed Chat Review → user acceptance → non-force FF main。S02+ 使用正常 Actions candidate verification；legacy `T01-room-status-help` Deferred / Superseded。

Repository bootstrap is an explicit, idempotent prerequisite that changes only missing required Actions settings; normal `start`/`run-once` are read-only checks and never silently bootstrap. After Repository Ready, create/push the Stage Router/branch and dispatch through the single existing `stage/**` workflow; branch-derived `workflow_id`/`stage_id`/Router identity must match GitHub event facts.
