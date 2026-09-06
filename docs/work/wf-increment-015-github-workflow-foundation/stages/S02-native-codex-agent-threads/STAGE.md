# STAGE — S02-native-codex-agent-threads

- work_id: `wf-increment-015-github-workflow-foundation`
- status: `waiting_for_T05F00_retry_003_contract_acceptance`
- purpose: `repair_native_worker_transition_boundaries`
- goal: 在已集成 T05 native task-thread backend 上，先完成一次性 native sandbox wire mode bootstrap repair，再修复 Root delegation prompt 边界与 generic Worker Result boundary，同时保持既有 GitHub/Git、DAG、worktree、Supervisor Integration 与 Review authority 不变。
- main_base_sha: `bd41ea8a1e259300241a345a659e7da90e24af0d`
- stage_branch: `stage/wf-increment-015-github-workflow-foundation/S02-native-codex-agent-threads`
- dependencies: S01 `accepted_and_integrated` at exact GitHub `main` `bd41ea8a1e259300241a345a659e7da90e24af0d`
- integrated_task: [`T05-native-codex-thread-backend`](./tasks/T05-native-codex-thread-backend/TASK_CONTRACT.md), source `9cc6899b69a96c3d9cfbe12f57cf93fdf59bb434` → Stage commit `dbd10202f5289d91d7caab9c67e1de878b0ae843`
- bootstrap_repair: [`T05R00-native-sandbox-wire-mode`](./tasks/T05R00-native-sandbox-wire-mode/TASK_CONTRACT.md); `integrated`, source `ba077fc1a39f85c179e65aa39b64646f4aed716a` → Stage commit `ad3e00989932828e58e742bce66a6cf1e8ab0745`; not Router-dispatchable and MUST NOT be executed again
- retry_task: [`T05F00-root-multi-agent-prompt-boundary`](./tasks/T05F00-root-multi-agent-prompt-boundary/TASK_CONTRACT.md); historical dispatch `wf15-s02-t05f00-root-multi-agent-prompt-boundary-002` is `blocked` with `failure=typecheck_dependency_unavailable`, `candidate=none`, and the Stage unchanged at `03be655aa170a6ce40776e1e3dd0e1ed42510103`; active dispatch `wf15-s02-t05f00-root-multi-agent-prompt-boundary-003` is `Proposed`, `confirmed_by_user=false`, `environment_prep_required=true`, `fresh_run_once_authorized=false`
- downstream_proposed_task: [`T05F01-generic-worker-result-boundary`](./tasks/T05F01-generic-worker-result-boundary/TASK_CONTRACT.md); `Proposed`, `confirmed_by_user=false`, `execution_authorized=false`; not dispatchable until T05F00 is integrated and its own exact Contract is separately accepted
- planning_placeholder: [`T06-native-codex-thread-contracts`](./tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md); `Planning Placeholder`, `dispatchable=false`; exact documentation ownership remains unresolved until T05F01 is integrated and freshly inspected
- router: [`ROUTER_CONTRACT.md`](./ROUTER_CONTRACT.md)
- supervisor: [`SUPERVISOR_ROUTER_AGENT.md`](./SUPERVISOR_ROUTER_AGENT.md)
- lifecycle: `waiting_for_T05F00_retry_003_contract_acceptance`
- integration_facts: T05 is `integrated`; T05R00 implementation and verification completed through the authorized `manual_pre_native_codex_exec` path and is `integrated` as source `ba077fc1a39f85c179e65aa39b64646f4aed716a` → Stage commit `ad3e00989932828e58e742bce66a6cf1e8ab0745`; T05F00 dispatch `-002` is historical `blocked` after native thread/turn completion because the fresh Task worktree lacked materialized repository dependencies, focused tests passed 10/10, Bridge passed 98/98, `git diff --check` passed, typecheck was unavailable, and no candidate, Supervisor, Task push or integration exists; active dispatch `-003` is `Proposed` with `confirmed_by_user=false`; T05F01 is `Proposed` with `confirmed_by_user=false` and `execution_authorized=false`; T06 remains a `Planning Placeholder` with `dispatchable=false`
- candidate_verification: only after T05F00, T05F01 and a separately accepted exact T06 are integrated may the existing single `stage/**` workflow use its `stage_candidate_ready` path
- review_handoff: pending Actions-created Draft PR and exact dispatch handoff

## Frozen task order

```text
T05-native-codex-thread-backend integrated
→ historical T05F00 dispatch wf15-s02-t05f00-root-multi-agent-prompt-boundary-001 fails before native thread creation
→ T05R00 repairs the native sandbox wire enum
→ T05R00 source ba077fc1a39f85c179e65aa39b64646f4aed716a is integrated at Stage ad3e00989932828e58e742bce66a6cf1e8ab0745
→ STOP completed
→ historical T05F00 dispatch wf15-s02-t05f00-root-multi-agent-prompt-boundary-002 creates a native thread/turn but is blocked because the fresh Task worktree lacks materialized repository dependencies
→ preserve the dirty -002 Task worktree as historical failed-dispatch evidence
→ generate T05F00 retry Contract with active dispatch wf15-s02-t05f00-root-multi-agent-prompt-boundary-003
→ user accepts the exact -003 Contract
→ STOP
→ separately authorized cleanup removes the historical -002 dirty Task worktree/local branch
→ create a fresh -003 Task branch/worktree at the exact current Stage
→ Host runs exact npm ci from the repository lockfile
→ verify package manifests are unchanged, Git remains clean, node_modules is ignored-only and TypeScript resolves
→ user separately authorizes a fresh run-once for -003
→ fresh process loads the repaired native backend
→ execute only T05F00 dispatch wf15-s02-t05f00-root-multi-agent-prompt-boundary-003
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

The historical T05F00 dispatch `wf15-s02-t05f00-root-multi-agent-prompt-boundary-001` failed before native thread creation. Failure discovery used `codex-cli 0.149.1`; repair-time schema revalidation used `codex-cli 0.153.4`. Both schemas define the `ThreadStartParams.sandbox` write value as `workspace-write`. The root cause was the native ThreadStart sandbox wire enum mismatch in the pre-repair backend, not T05F00 implementation, model, `cwd`, or host approval.

T05R00 was the explicit one-time transition repair. Its `manual_pre_native_codex_exec` implementation completed, verification passed, and the Worker commit was blocked by the external worktree `index.lock` sandbox boundary. The user explicitly authorized the Host mechanical commit; the Host did not modify code. Independent Supervisor returned `ready_to_integrate`, and both the remote Task source `ba077fc1a39f85c179e65aa39b64646f4aed716a` and controlled Stage cherry-pick `ad3e00989932828e58e742bce66a6cf1e8ab0745` completed. T05R00 was not Router-managed, so no synthetic `task_integrated` Bridge event was published. It MUST NOT be executed again.

T05 is already integrated. T05F00 is the first transition native Worker after the T05 backend integration; it changes only the Worker prompt boundary and uses no internal multi-agent. Dispatch `wf15-s02-t05f00-root-multi-agent-prompt-boundary-001` is historical `needs_decision` and MUST NOT be replayed. Dispatch `wf15-s02-t05f00-root-multi-agent-prompt-boundary-002` is historical `blocked`: it created native thread `01a076af-a8fa-72b3-bc8a-bb61f3339b23`, completed turn `01a076af-a977-7863-82d0-6c1bef542b96`, passed focused 10/10, Bridge 98/98 and `git diff --check`, but the fresh Task worktree had no materialized repository dependencies, so `npm run typecheck` could not resolve `tsc`. It produced no candidate and did not reach Supervisor, Task push or integration; the Stage remained `03be655aa170a6ce40776e1e3dd0e1ed42510103`. Its dirty Task worktree is preserved as historical failed-dispatch evidence and MUST NOT be committed, reset, cleaned, checked out or reused for `-003` in this planning round.

The active retry dispatch is `wf15-s02-t05f00-root-multi-agent-prompt-boundary-003`; its exact Contract is `Proposed`, `confirmed_by_user=false`, and must be accepted again. After acceptance, the process stops before separately authorized cleanup and fresh worktree creation. The Host must run exact `npm ci` in that fresh, clean, exact-current-Stage worktree, then verify unchanged package manifests, clean Git state, ignored-only `node_modules` and resolvable TypeScript. This is Host execution-environment preparation, not T05F00 Coding, a Task deliverable, a Bridge fallback or a Task-owned change. Only after it passes may the user separately authorize a fresh `run-once`. The future executing Bridge process will still use the one-time legacy transition envelope. After T05F00 integration, that process MUST stop.

T05F01 is the first transition Task whose exact Contract authorizes Root-only native multi-agent. It may be dispatched only by a fresh process that has loaded the T05F00 prompt change, and its executing process still uses the pre-T05F01 Controller; therefore its outer final result also uses the one-time legacy transition envelope. After T05F01 integration, that process MUST stop. Neither transition compatibility envelope may become a production task-ID special case or compatibility mode.

T06 is the first docs-owned native Task after the generic Worker Result boundary is integrated. Its exact ownership cannot be frozen during this revision and requires fresh inspection of the actual integrated Controller.

## Acceptance path

```text
T05 is integrated
→ historical T05F00 dispatch wf15-s02-t05f00-root-multi-agent-prompt-boundary-001 records no native thread, turn or candidate and does not modify Stage
→ T05R00 repair completes through manual_pre_native_codex_exec
→ T05R00 source ba077fc1a39f85c179e65aa39b64646f4aed716a is integrated at Stage ad3e00989932828e58e742bce66a6cf1e8ab0745
→ STOP completed
→ T05F00 dispatch wf15-s02-t05f00-root-multi-agent-prompt-boundary-002 creates a native thread/turn but is blocked at typecheck_dependency_unavailable with no candidate or Stage change
→ preserve the historical -002 dirty Task worktree during this planning round
→ generate the T05F00 retry Contract with active dispatch wf15-s02-t05f00-root-multi-agent-prompt-boundary-003
→ exact -003 retry Contract accepted by user
→ STOP
→ separately authorized cleanup of the historical -002 dirty Task worktree/local branch
→ create a fresh -003 Task branch/worktree at the exact current Stage
→ Host runs exact npm ci and confirms unchanged manifests, clean Git, ignored-only node_modules and resolvable TypeScript
→ user separately authorizes a fresh run-once for -003
→ fresh process reloads the fixed native backend
→ fresh run-once dispatches and executes only T05F00 wf15-s02-t05f00-root-multi-agent-prompt-boundary-003
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

The failed T05F00 dispatch `wf15-s02-t05f00-root-multi-agent-prompt-boundary-001` is historical `needs_decision`; `coding_started=false`, native thread/turn IDs are `null`, no Task candidate or remote Task exists, and it MUST NOT be replayed or recovered as the active dispatch. Dispatch `wf15-s02-t05f00-root-multi-agent-prompt-boundary-002` is historical `blocked` at `typecheck_dependency_unavailable`, has no candidate, Supervisor, Task push or integration, and also MUST NOT be replayed. The current T05F00 retry Contract for `wf15-s02-t05f00-root-multi-agent-prompt-boundary-003` is `Proposed` with `confirmed_by_user=false`; the current next action is exact Contract acceptance, followed by STOP. T05F01 remains `Proposed` with `confirmed_by_user=false`; T06 remains a `Planning Placeholder`. Continuous `start` is forbidden for this transition. `room:status --help` remains Deferred. The S01 Router and all S01 Task/Fix Contracts remain immutable history and are not active dispatch sources. S02 does not restore S01 Bootstrap-B and does not allocate another Stage number.
