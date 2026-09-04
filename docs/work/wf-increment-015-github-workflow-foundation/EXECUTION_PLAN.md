# EXECUTION PLAN — wf-increment-015-github-workflow-foundation

- status: Accepted
- bootstrap_base: `d5827a052190d63fb2fbbd9fbd970ba9db92ed64`
- stage: `S01-foundation-pilot`
- stage_branch: `stage/wf-increment-015-github-workflow-foundation/S01-foundation-pilot`
- task: `T01-room-status-help`
- task_branch: `task/wf-increment-015-github-workflow-foundation/T01-room-status-help`
- dispatch_id: `wf15-s01-t01-dispatch-001`
- fix_policy: `always_confirm`

顺序：Bootstrap commit/push → mechanical Router handoff → user dispatch → Pilot task branch → Stage branch push → mechanical verification/Ready for Review → fixed Chat formal review → user acceptance → exact accepted SHA non-force fast-forward。任何真实Git/Check冲突都停止；不rebase、不自动解冲突、不force push、不merge commit、不自动Fix。
