# STAGE — <stage_id>

- work_id: <work_id>
- status: planned | active | review_required | accepted
- goal: <stage outcome>
- stage_branch: <branch>
- dependencies: <accepted predecessors>
- tasks: <task links>
- lifecycle: planned | active | verification | ready_for_review | accepted | superseded
- integration_facts: <source_task_sha to stage_commit_sha, recorded at integration time>
- verification: <commands and observed evidence>
- review_handoff: <exact PR/head and status, populated at handoff time>
