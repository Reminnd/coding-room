# STAGE — S02-room-status-help-pilot

- work_id: `wf-increment-015-github-workflow-foundation`
- status: `waiting_for_s02_contract_acceptance`
- goal: 通过首个正常 Local Bridge / Actions Stage 链路，为 `room:status` 增加已冻结的无副作用 `--help` public behavior。
- main_base_sha: `bd41ea8a1e259300241a345a659e7da90e24af0d`
- stage_branch: `stage/wf-increment-015-github-workflow-foundation/S02-room-status-help-pilot`
- dependencies: S01 `accepted_and_integrated` at exact `main` `bd41ea8a1e259300241a345a659e7da90e24af0d`
- current_tasks: [`S02-T01-room-status-help`](./tasks/S02-T01-room-status-help/TASK_CONTRACT.md)
- router: [`ROUTER_CONTRACT.md`](./ROUTER_CONTRACT.md)
- supervisor: [`SUPERVISOR_ROUTER_AGENT.md`](./SUPERVISOR_ROUTER_AGENT.md)
- lifecycle: `planned`
- integration_facts: pending; no Implementation dispatch or Task-to-Stage integration is authorized before S02 Contract acceptance
- candidate_verification: after Task integration, MUST use the existing single `stage/**` workflow and its `stage_candidate_ready` path
- review_handoff: pending Actions-created Draft PR and exact dispatch handoff

## Acceptance path

```text
S02 Contract acceptance
→ normal Local Bridge dispatch
→ Task candidate verification and Supervisor Integration Gate
→ controlled Task-to-Stage cherry-pick
→ stage_candidate_ready repository dispatch
→ existing stage/** Actions candidate verification
→ fixed Chat formal Review of the exact PR head
→ user accepts the exact Stage SHA
→ non-force fast-forward to main
```

S02 MUST NOT use the S01 Bootstrap-B fallback. The S01 Router, S01 tasks and review-fix tasks `F05`/`F06`/`F07`/`F08` are immutable accepted history and are not dispatch inputs for this Stage. The superseded task-scoped S01 `T01-room-status-help/ROUTER_CONTRACT.md` remains historical evidence only.
