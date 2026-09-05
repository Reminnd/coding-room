# STAGE — S02-native-codex-agent-threads

- work_id: `wf-increment-015-github-workflow-foundation`
- status: `waiting_for_T05R00_exact_contract_acceptance`
- purpose: `repair_native_worker_transition_boundaries`
- goal: 在已集成 T05 native task-thread backend 上，先完成一次性 native sandbox wire mode bootstrap repair，再修复 Root delegation prompt 边界与 generic Worker Result boundary，同时保持既有 GitHub/Git、DAG、worktree、Supervisor Integration 与 Review authority 不变。
- main_base_sha: `bd41ea8a1e259300241a345a659e7da90e24af0d`
- stage_branch: `stage/wf-increment-015-github-workflow-foundation/S02-native-codex-agent-threads`
- dependencies: S01 `accepted_and_integrated` at exact GitHub `main` `bd41ea8a1e259300241a345a659e7da90e24af0d`
- integrated_task: [`T05-native-codex-thread-backend`](./tasks/T05-native-codex-thread-backend/TASK_CONTRACT.md), source `9cc6899b69a96c3d9cfbe12f57cf93fdf59bb434` → Stage commit `dbd10202f5289d91d7caab9c67e1de878b0ae843`
- bootstrap_repair: [`T05R00-native-sandbox-wire-mode`](./tasks/T05R00-native-sandbox-wire-mode/TASK_CONTRACT.md); `Proposed`, `confirmed_by_user=false`, `execution_authorized=false`, `execution_surface=manual_pre_native_codex_exec`; not Router-dispatchable
- blocked_task: [`T05F00-root-multi-agent-prompt-boundary`](./tasks/T05F00-root-multi-agent-prompt-boundary/TASK_CONTRACT.md); `Accepted`, `confirmed_by_user=true`, `execution_blocked_by=T05R00`; do not retry the failed dispatch or start a fresh `run-once` before T05R00 integration
- downstream_proposed_task: [`T05F01-generic-worker-result-boundary`](./tasks/T05F01-generic-worker-result-boundary/TASK_CONTRACT.md); `Proposed`, `confirmed_by_user=false`, `execution_authorized=false`; not dispatchable until T05F00 is integrated and its own exact Contract is separately accepted
- planning_placeholder: [`T06-native-codex-thread-contracts`](./tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md); `Planning Placeholder`, `dispatchable=false`; exact documentation ownership remains unresolved until T05F01 is integrated and freshly inspected
- router: [`ROUTER_CONTRACT.md`](./ROUTER_CONTRACT.md)
- supervisor: [`SUPERVISOR_ROUTER_AGENT.md`](./SUPERVISOR_ROUTER_AGENT.md)
- lifecycle: `waiting_for_T05R00_exact_contract_acceptance`
- integration_facts: T05 is `integrated`; T05R00 is `Proposed` with `confirmed_by_user=false`, `execution_authorized=false` and `manual_pre_native_repair=true`; T05F00 remains `Accepted` with `confirmed_by_user=true` but is blocked by T05R00; T05F01 is `Proposed` with `confirmed_by_user=false` and `execution_authorized=false`; T06 remains a `Planning Placeholder` with `dispatchable=false`
- candidate_verification: only after T05F00, T05F01 and a separately accepted exact T06 are integrated may the existing single `stage/**` workflow use its `stage_candidate_ready` path
- review_handoff: pending Actions-created Draft PR and exact dispatch handoff

## Frozen task order

```text
T05-native-codex-thread-backend integrated
→ native T05F00 attempt exposes sandbox enum mismatch before thread/start
→ T05R00 exact Contract Proposed
→ user accepts exact T05R00
→ user separately authorizes one-time pre-native codex exec repair
→ isolated T05R00 Task branch/worktree and candidate commit
→ independent Git/verification facts and Supervisor Integration
→ controlled T05R00 cherry-pick and non-force Stage push
→ STOP
→ fresh process reloads fixed codex-app-server.mjs
→ regenerate latest dispatch_ready Stage handoff
→ separate execution authorization for T05F00
→ fresh run-once executes T05F00 only
→ integrate
→ STOP
→ later T05F01 separate acceptance
→ fresh run-once
→ T05F01 Root uses Contract-authorized native multi-agent
→ integrate T05F01
→ STOP
→ fresh planning inspects the actual generic Controller boundary
→ generate exact T06 documentation ownership and Contract
→ user separately accepts exact T06
→ fresh run-once executes T06
```

The fresh T05F00 `run-once` failed before native thread creation. Local Codex `codex-cli 0.149.1` generated its installed App Server schema outside the repository; `ThreadStartParams.sandbox` references `SandboxMode`, whose exact enum is `read-only`, `workspace-write`, and `danger-full-access`. Production and its direct test both use `workspaceWrite`. The frozen root cause is therefore `native ThreadStart sandbox wire enum mismatch`: production defect=`workspaceWrite`, installed expected=`workspace-write`, and the FakeAppServer test accepted the invalid value because its direct Oracle expected the same invalid literal. This is not a T05F00, model, `cwd`, or host-approval failure.

T05R00 is an explicit one-time transition repair because the native Worker cannot currently pass `thread/start`. It is not in the Router tasks array or Ready Set and MUST NOT be discovered or executed by Local Bridge. Its only execution surface is a separately user-authorized `manual_pre_native_codex_exec`; production MUST NOT add `try native → codex exec`, a compatibility mode, or any persistent fallback. T05R00 integration MUST be followed by process STOP. A fresh process must load the repaired `codex-app-server.mjs` before any later T05F00 `run-once`.

T05 is already integrated. T05F00 is the first transition native Worker after the T05 backend integration; it changes only the Worker prompt boundary and uses no internal multi-agent. Its executing Bridge process still has the old Controller loaded, so its final result uses the one-time legacy transition envelope. After T05F00 integration, that process MUST stop.

T05F01 is the first transition Task whose exact Contract authorizes Root-only native multi-agent. It may be dispatched only by a fresh process that has loaded the T05F00 prompt change, and its executing process still uses the pre-T05F01 Controller; therefore its outer final result also uses the one-time legacy transition envelope. After T05F01 integration, that process MUST stop. Neither transition compatibility envelope may become a production task-ID special case or compatibility mode.

T06 is the first docs-owned native Task after the generic Worker Result boundary is integrated. Its exact ownership cannot be frozen during this revision and requires fresh inspection of the actual integrated Controller.

## Acceptance path

```text
T05 is integrated
→ failed T05F00 dispatch records no native thread, turn or candidate and does not modify Stage
→ T05R00 exact Contract is Proposed at the exact pushed Stage head containing this planning revision
→ user separately accepts T05R00
→ user separately authorizes the one-time manual pre-native codex exec repair
→ T05R00 candidate is independently verified, integrated by controlled cherry-pick and pushed non-force
→ STOP
→ fresh process reloads the fixed native backend and regenerates the latest dispatch_ready Stage handoff
→ user separately authorizes a fresh run-once for accepted T05F00 only
→ fresh run-once dispatches and executes T05F00 only
→ integrate T05F00
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

The failed T05F00 dispatch was `wf15-s02-t05f00-root-multi-agent-prompt-boundary-001`; `coding_started=false`, native thread/turn IDs are `null`, no Task candidate or remote Task exists, and the Stage remained at `8530bad754460ee4670bd9bbdf39cc1a9a8a3e0f`. Do not retry it. The current next action is user acceptance of the complete Proposed T05R00 Contract. T05F00 remains unchanged and Accepted but blocked by T05R00; T05F01 remains `Proposed` with `confirmed_by_user=false`. The Actions-created `dispatch_ready` handoff makes this Draft Stage discoverable; it does not authorize Coding. Continuous `start` is forbidden for this transition. `room:status --help` remains Deferred. The S01 Router and all S01 Task/Fix Contracts remain immutable history and are not active dispatch sources. S02 does not restore S01 Bootstrap-B and does not allocate another Stage number.
