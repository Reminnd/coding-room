# STAGE — <stage_id>

- work_id: <work_id>
- status: planned | active | review_required | accepted
- goal: <stage outcome>
- stage_branch: <branch>
- dependencies: <accepted predecessors>
- tasks: <task links>
- lifecycle: planned | active | verification | ready_for_review | accepted | superseded
- integration_facts: <source_task_sha to stage_commit_sha, recorded at integration time>
- verification: <exact STAGE_VERIFICATION_V1 id, Stage SHA, commands and observed evidence>
- review_handoff: <exact CHAT_REVIEW_HANDOFF_V1 id, PR and immutable head>
- formal_review: <exact FORMAL_REVIEW_V1 id and PASS | REQUEST_CHANGES>
- stage_acceptance: <exact typed STAGE_ACCEPTANCE_V1 id and accepted Stage SHA>
- closure_authorization: <exact STAGE_CLOSURE_AUTHORIZATION_V1 id, expected main SHA and exact refspec>
- terminal_closure: <exact STAGE_CLOSED_V1 projection>

`review_handoff`、Formal Review、Stage acceptance、closure authorization与terminal closure是独立事实；`status: accepted`不能替代其中任一项。`close-stage`只允许三态：`main`已等于 accepted Stage SHA时不 push、仅补缺失 terminal projection；`main`等于 expected baseline时经 host approval执行 exact `<accepted_stage_sha>:refs/heads/main` non-force fast-forward；第三个或不可观察 SHA 时不 push并返回`needs_decision`。
