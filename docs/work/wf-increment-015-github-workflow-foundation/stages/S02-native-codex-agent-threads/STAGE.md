# STAGE — S02-native-codex-agent-threads

- work_id: `wf-increment-015-github-workflow-foundation`
- status: `waiting_for_s02_contract_acceptance`
- purpose: `adopt_codex_native_task_thread_backend`
- goal: 将 Local Bridge 的 Implementation Worker backend 从一次性 `codex exec` process 切换为一个 Ready Task 对应一个 Codex native task thread，并保持既有 GitHub/Git、DAG、worktree、integration 与 Review authority 不变。
- main_base_sha: `bd41ea8a1e259300241a345a659e7da90e24af0d`
- stage_branch: `stage/wf-increment-015-github-workflow-foundation/S02-native-codex-agent-threads`
- dependencies: S01 `accepted_and_integrated` at exact GitHub `main` `bd41ea8a1e259300241a345a659e7da90e24af0d`
- current_tasks: [`T05-native-codex-thread-backend`](./tasks/T05-native-codex-thread-backend/TASK_CONTRACT.md), [`T06-native-codex-thread-contracts`](./tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md)
- router: [`ROUTER_CONTRACT.md`](./ROUTER_CONTRACT.md)
- supervisor: [`SUPERVISOR_ROUTER_AGENT.md`](./SUPERVISOR_ROUTER_AGENT.md)
- lifecycle: `planned`
- integration_facts: pending; no Implementation dispatch or Task-to-Stage integration is authorized before both S02 Task Contracts are accepted
- candidate_verification: after both Tasks are integrated, MUST use the existing single `stage/**` workflow and its `stage_candidate_ready` path
- review_handoff: pending Actions-created Draft PR and exact dispatch handoff

## Frozen task order

```text
T05-native-codex-thread-backend
→ integrate T05 into Stage
→ stop the pre-S02 Bridge process
→ restart run-once from the T05-integrated Stage head
→ T06-native-codex-thread-contracts through the native task-thread backend
```

T05 is the backend implementation Task and therefore runs once through the accepted pre-S02 `codex exec` Worker boundary. This is the explicit S02 bootstrap path, not a fallback. T06 depends on T05 and may run only after a fresh Bridge process loads the integrated native backend.

## Acceptance path

```text
user accepts both exact S02 Task Contracts
→ run-once dispatches and integrates T05 only
→ fresh run-once from the T05-integrated Stage head dispatches and integrates T06
→ Bridge publishes stage_candidate_ready
→ existing stage/** Actions candidate verification
→ fixed Chat formal Review of the exact PR head
→ user accepts the exact Stage SHA
→ non-force fast-forward to main
```

The Actions-created `dispatch_ready` handoff makes this Draft Stage discoverable; it does not authorize Coding. `room:status --help` remains Deferred. The S01 Router and all S01 Task/Fix Contracts remain immutable history and are not active dispatch sources. S02 does not restore S01 Bootstrap-B and does not allocate another Stage number.
