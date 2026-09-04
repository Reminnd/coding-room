# STAGE — S01-foundation-pilot

- work_id: `wf-increment-015-github-workflow-foundation`
- status: `dispatch_ready`
- goal: 完成 Final Local Parallel Bridge Migration 的 Foundation tasks。
- stage_branch: `stage/wf-increment-015-github-workflow-foundation/S01-foundation-pilot`
- current_tasks: `T01-router`, `T02-actions`, `T03-docs`, `T04-bridge`
- router: [`ROUTER_CONTRACT.md`](./ROUTER_CONTRACT.md)

S01 acceptance path: all required Stage work integrated → freeze exact Stage SHA → local/equivalent mechanical verification against that exact SHA → fixed Chat formal Review of exact PR head/full diff → user accepts exact SHA → non-force FF main.
S01 不声称 default-branch `repository_dispatch` verifier 已运行；S02+ 在 S01 进入 `main` 后使用正常 Actions candidate verification。legacy `T01-room-status-help` Deferred / Superseded for current S01 dispatch。
