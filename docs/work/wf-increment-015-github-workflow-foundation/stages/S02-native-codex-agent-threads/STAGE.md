# STAGE — S02-native-codex-agent-threads

- work_id: `wf-increment-015-github-workflow-foundation`
- status: `waiting_for_T05F00_exact_contract_acceptance`
- purpose: `repair_native_worker_transition_boundaries`
- goal: 在已集成 T05 native task-thread backend 上，先修复 Root delegation prompt 边界，再修复 generic Worker Result boundary，同时保持既有 GitHub/Git、DAG、worktree、Supervisor Integration 与 Review authority 不变。
- main_base_sha: `bd41ea8a1e259300241a345a659e7da90e24af0d`
- stage_branch: `stage/wf-increment-015-github-workflow-foundation/S02-native-codex-agent-threads`
- dependencies: S01 `accepted_and_integrated` at exact GitHub `main` `bd41ea8a1e259300241a345a659e7da90e24af0d`
- integrated_task: [`T05-native-codex-thread-backend`](./tasks/T05-native-codex-thread-backend/TASK_CONTRACT.md), source `9cc6899b69a96c3d9cfbe12f57cf93fdf59bb434` → Stage commit `dbd10202f5289d91d7caab9c67e1de878b0ae843`
- next_proposed_task: [`T05F00-root-multi-agent-prompt-boundary`](./tasks/T05F00-root-multi-agent-prompt-boundary/TASK_CONTRACT.md); not dispatchable until exact Contract acceptance
- downstream_proposed_task: [`T05F01-generic-worker-result-boundary`](./tasks/T05F01-generic-worker-result-boundary/TASK_CONTRACT.md); not dispatchable until T05F00 is integrated and its own exact Contract is separately accepted
- planning_placeholder: [`T06-native-codex-thread-contracts`](./tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md); exact documentation ownership remains unresolved until T05F01 is integrated and freshly inspected
- router: [`ROUTER_CONTRACT.md`](./ROUTER_CONTRACT.md)
- supervisor: [`SUPERVISOR_ROUTER_AGENT.md`](./SUPERVISOR_ROUTER_AGENT.md)
- lifecycle: `transition_repair_planned`
- integration_facts: T05 is integrated; T05F00 and T05F01 are Proposed with `confirmed_by_user=false`; T06 remains a non-dispatchable Planning Placeholder
- candidate_verification: only after T05F00, T05F01 and a separately accepted exact T06 are integrated may the existing single `stage/**` workflow use its `stage_candidate_ready` path
- review_handoff: pending Actions-created Draft PR and exact dispatch handoff

## Frozen task order

```text
T05-native-codex-thread-backend integrated
→ user accepts the exact T05F00 Contract at its exact Stage SHA
→ fresh run-once executes and integrates T05F00 only
→ STOP
→ user separately accepts the exact T05F01 Contract
→ fresh run-once
→ T05F01 Root uses Contract-authorized native multi-agent
→ integrate T05F01
→ STOP
→ fresh planning inspects the actual generic Controller boundary
→ generate exact T06 documentation ownership and Contract
→ user separately accepts exact T06
→ fresh run-once executes T06
```

T05 is already integrated. T05F00 is the first transition native Worker after the T05 backend integration; it changes only the Worker prompt boundary and uses no internal multi-agent. Its executing Bridge process still has the old Controller loaded, so its final result uses the one-time legacy transition envelope. After T05F00 integration, that process MUST stop.

T05F01 is the first transition Task whose exact Contract authorizes Root-only native multi-agent. It may be dispatched only by a fresh process that has loaded the T05F00 prompt change, and its executing process still uses the pre-T05F01 Controller; therefore its outer final result also uses the one-time legacy transition envelope. After T05F01 integration, that process MUST stop. Neither transition compatibility envelope may become a production task-ID special case or compatibility mode.

T06 is the first docs-owned native Task after the generic Worker Result boundary is integrated. Its exact ownership cannot be frozen during this revision and requires fresh inspection of the actual integrated Controller.

## Acceptance path

```text
T05 is integrated
→ user accepts exact T05F00 at the new exact Stage SHA
→ fresh run-once dispatches and integrates T05F00 only
→ STOP
→ user separately accepts exact T05F01 after T05F00 integration
→ fresh run-once dispatches T05F01 with Root-only native multi-agent
→ integrate T05F01
→ STOP
→ Codex inspects the actual generic Controller and freezes exact T06 docs ownership
→ user separately accepts exact T06 at that later exact Stage SHA
→ fresh run-once dispatches and integrates T06
→ Bridge publishes stage_candidate_ready
→ existing stage/** Actions candidate verification
→ fixed Chat formal Review of the exact PR head
→ user accepts the exact Stage SHA
→ non-force fast-forward to main
```

This planning revision is not acceptance of T05F00 or T05F01. The Actions-created `dispatch_ready` handoff makes this Draft Stage discoverable; it does not authorize Coding. Continuous `start` is forbidden for this transition. `room:status --help` remains Deferred. The S01 Router and all S01 Task/Fix Contracts remain immutable history and are not active dispatch sources. S02 does not restore S01 Bootstrap-B and does not allocate another Stage number.
