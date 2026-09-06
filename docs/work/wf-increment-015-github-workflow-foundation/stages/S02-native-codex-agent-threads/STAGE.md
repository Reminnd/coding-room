# STAGE — S02-native-codex-agent-threads

- work_id: `wf-increment-015-github-workflow-foundation`
- status: `waiting_for_T05R01_contract_acceptance`
- purpose: `repair_native_worker_transition_boundaries`
- goal: 在已集成 T05 native task-thread backend 上，先冻结并完成 native linked-worktree Git sandbox repair，再执行 T05F00 `-003` 与后续 generic Worker Result boundary，同时保持既有 GitHub/Git、DAG、worktree、Supervisor Integration 与 Review authority 不变。
- main_base_sha: `bd41ea8a1e259300241a345a659e7da90e24af0d`
- stage_branch: `stage/wf-increment-015-github-workflow-foundation/S02-native-codex-agent-threads`
- dependencies: S01 `accepted_and_integrated` at exact GitHub `main` `bd41ea8a1e259300241a345a659e7da90e24af0d`
- integrated_task: [`T05-native-codex-thread-backend`](./tasks/T05-native-codex-thread-backend/TASK_CONTRACT.md), source `9cc6899b69a96c3d9cfbe12f57cf93fdf59bb434` → Stage commit `dbd10202f5289d91d7caab9c67e1de878b0ae843`
- bootstrap_repair: [`T05R00-native-sandbox-wire-mode`](./tasks/T05R00-native-sandbox-wire-mode/TASK_CONTRACT.md); `integrated`, source `ba077fc1a39f85c179e65aa39b64646f4aed716a` → Stage commit `ad3e00989932828e58e742bce66a6cf1e8ab0745`; not Router-dispatchable and MUST NOT be executed again
- proposed_bootstrap_repair: [`T05R01-native-linked-worktree-git-sandbox`](./tasks/T05R01-native-linked-worktree-git-sandbox/TASK_CONTRACT.md); `Proposed`, `confirmed_by_user=false`, `execution_surface=manual_pre_native_codex_exec`, `execution_authorized=false`; not Router-dispatchable and blocks T05F00 `-003` execution until separately accepted, implemented and integrated
- retry_task: [`T05F00-root-multi-agent-prompt-boundary`](./tasks/T05F00-root-multi-agent-prompt-boundary/TASK_CONTRACT.md); active dispatch `wf15-s02-t05f00-root-multi-agent-prompt-boundary-003` remains `Accepted`, `confirmed_by_user=true`, `bridge_event=none`, `execution_blocked_by=T05R01`, `fresh_run_once_authorized=false`; its fresh worktree and `npm ci` were prepared at Stage `fc126bb1f7d52b51787970ca62786362a8c7b1c9`, but this planning commit advances Stage, so `environment_prep_valid_for_future_dispatch=false` and the retained worktree is `stale_after_stage_advance`
- downstream_proposed_task: [`T05F01-generic-worker-result-boundary`](./tasks/T05F01-generic-worker-result-boundary/TASK_CONTRACT.md); `Proposed`, `confirmed_by_user=false`, `execution_authorized=false`; not dispatchable until T05F00 is integrated and its own exact Contract is separately accepted
- planning_placeholder: [`T06-native-codex-thread-contracts`](./tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md); `Planning Placeholder`, `dispatchable=false`; exact documentation ownership remains unresolved until T05F01 is integrated and freshly inspected
- router: [`ROUTER_CONTRACT.md`](./ROUTER_CONTRACT.md)
- supervisor: [`SUPERVISOR_ROUTER_AGENT.md`](./SUPERVISOR_ROUTER_AGENT.md)
- lifecycle: `waiting_for_T05R01_contract_acceptance`
- integration_facts: T05 and T05R00 are `integrated`; T05R01 is `Proposed`, `confirmed_by_user=false`, `execution_authorized=false` and not Router-dispatchable; T05F00 dispatch `-002` is historical `blocked` with no candidate or Stage change; active dispatch `-003` remains `Accepted`, `confirmed_by_user=true`, has no Bridge event and is blocked by T05R01 without dispatch rotation; its environment was prepared at Stage `fc126bb1f7d52b51787970ca62786362a8c7b1c9` but becomes stale when this planning revision advances Stage, so it must be retained now and later cleaned up/recreated from the post-T05R01 Stage before a new Host `npm ci`; T05F01 remains `Proposed` with `confirmed_by_user=false`; T06 remains a `Planning Placeholder`
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
→ fresh -003 worktree is prepared at Stage fc126bb1f7d52b51787970ca62786362a8c7b1c9 and Host npm ci completes
→ T05R01 Contract is generated as Proposed; the planning commit makes that prepared -003 environment stale
→ STOP and wait for exact T05R01 Contract acceptance
→ separately execute, verify and integrate T05R01 through manual_pre_native_codex_exec
→ STOP
→ separately authorized cleanup removes the retained stale -003 Task worktree/local branch
→ create a fresh -003 Task branch/worktree at the new exact Stage HEAD
→ Host runs exact npm ci; verify Git clean and TypeScript resolvable
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

The active retry dispatch is `wf15-s02-t05f00-root-multi-agent-prompt-boundary-003`; its exact Contract remains `Accepted` with `confirmed_by_user=true`, and no Bridge event exists for it. A fresh `-003` worktree at `fc126bb1f7d52b51787970ca62786362a8c7b1c9` already completed Host `npm ci`, but this planning commit advances the Stage and therefore makes that environment invalid for future dispatch. Do not delete it in this round; mark it `stale_after_stage_advance`. T05F00 execution is blocked by T05R01. After T05R01 is separately accepted, implemented and integrated, the process must stop; only then may separately authorized cleanup/recreation and Host `npm ci` prepare a fresh `-003` worktree from the new Stage HEAD. No `run-once` is currently authorized, and the unchanged dispatch ID does not rotate because no Bridge event exists.

T05R01 is the Proposed, non-Router-dispatchable bootstrap repair for the linked-worktree Git metadata sandbox boundary. Its future manual pre-native execution may change only `codex-app-server.mjs` and its direct test, and it must preserve the verified Diff if its own final commit reaches the same external Git metadata boundary. Any Host mechanical commit completion requires separate user authorization and is not a production fallback.

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
→ fresh -003 worktree and npm ci are prepared at Stage fc126bb1f7d52b51787970ca62786362a8c7b1c9
→ generate exact T05R01 Contract as Proposed and advance the Stage, making that -003 environment stale
→ user separately accepts exact T05R01
→ manual_pre_native_codex_exec implements and verifies T05R01 in an isolated repair worktree
→ controlled integration of T05R01
→ STOP
→ separately authorized cleanup of the retained stale -003 Task worktree/local branch
→ create a fresh -003 Task branch/worktree at the new exact Stage HEAD
→ Host runs exact npm ci and confirms clean Git and resolvable TypeScript
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

The failed T05F00 dispatch `wf15-s02-t05f00-root-multi-agent-prompt-boundary-001` is historical `needs_decision`; dispatch `-002` is historical `blocked`; neither may be replayed. The current T05F00 retry Contract for `wf15-s02-t05f00-root-multi-agent-prompt-boundary-003` remains `Accepted` with `confirmed_by_user=true`, `bridge_event=none`, `execution_blocked_by=T05R01` and `dispatch_rotated=false`. The current next action is exact T05R01 Contract acceptance. The prepared `-003` environment at `fc126bb1f7d52b51787970ca62786362a8c7b1c9` is retained but invalid after this Stage advance. T05F01 remains `Proposed` with `confirmed_by_user=false`; T06 remains a `Planning Placeholder`. Continuous `start` is forbidden for this transition. `room:status --help` remains Deferred. The S01 Router and all S01 Task/Fix Contracts remain immutable history and are not active dispatch sources. S02 does not restore S01 Bootstrap-B and does not allocate another Stage number.
