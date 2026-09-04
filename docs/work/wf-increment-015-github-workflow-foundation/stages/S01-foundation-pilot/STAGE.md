# STAGE — S01-foundation-pilot

- work_id: `wf-increment-015-github-workflow-foundation`
- status: `dispatch_ready`
- goal: 以`room:status --help`真实Pilot验证GitHub/Actions/Codex Cloud/PR/Chat Review闭环。
- stage_branch: `stage/wf-increment-015-github-workflow-foundation/S01-foundation-pilot`
- task: [`T01-room-status-help`](./tasks/T01-room-status-help/TASK_CONTRACT.md)
- router: [`ROUTER_CONTRACT.md`](./tasks/T01-room-status-help/ROUTER_CONTRACT.md)

Bootstrap不得修改Pilot的production/test路径。Stage只有一个写入Task，因此不拆Subtask。
