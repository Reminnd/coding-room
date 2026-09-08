# TASK CONTRACT — T05F01-generic-worker-result-boundary

## Contract

```yaml
status: Proposed
confirmed_by_user: false
task_id: T05F01-generic-worker-result-boundary
type: Implementation Task
dispatch_id: wf15-s02-t05f01-generic-worker-result-boundary-002
task_branch: task/wf-increment-015-github-workflow-foundation/T05F01-generic-worker-result-boundary-002
depends_on:
  - T05F00-root-multi-agent-prompt-boundary
model_policy: coding_strong
reasoning_effort: high
fallback_model_policy: none
native_multi_agent: required
authority: root_only
child_git_authority: none
child_spawned_writing_subagents: false
persistent_child_state: false
implementation_authorized: false
environment_preparation_completed: false
run_once_authorized: false
```

This fresh Retry `-002` outer Contract and its complete internal Contract bundle are Proposed at Stage planning base `ec62546d6126ef5ecfbd0eceed100f916d75aa27` and await fresh user acceptance. The `-001` acceptance does not carry forward. Fresh acceptance will not authorize environment preparation, dispatch, Implementation or `run-once`; those remain separate gates.

## Background

The integrated Controller's Worker Result boundary is still globally T05-specific: it requires the Worker to self-report `native_backend` and `verification` and accepts the T05-only `pass-under-accepted-amendment` vocabulary. Those requirements reject a future docs-owned Task and assign authority to Worker self-report that already belongs to native process facts and Router verification.

T05F01 replaces only that result boundary and its direct tests. Existing Supervisor Integration, dependency gate, task push, controlled Task-to-Stage integration and lifecycle publication remain unchanged.

Dispatch `wf15-s02-t05f01-generic-worker-result-boundary-001` is immutable terminal `blocked` with exact reason `Worker completed with invalid required Coding Result: duplicate field task_id`. The production parser is correct to reject a duplicate known field. The duplicate arose because the Root was required to output an internal summary containing `task_id` and then a second outer Required Coding Result containing `task_id`. Retry `-002` repairs only that Contract output shape; it does not relax the parser. The `-001` branch/worktree remain untouched evidence and are not inputs to the fresh candidate.

## Goal

把 T05-specific Worker Result validation 改为 task-generic boundary，使 semantic status 在 working-tree observation 之前结算，并保留 Controller-owned candidate、Router ownership、native execution、verification、Supervisor 与 Git delivery 的现有权威。

## Generic Worker Coding Result contract

Every Worker result MUST contain these common fields:

- `task_id`
- `dispatch_id`
- `reported_base_sha`
- `deviations`
- `unresolved`
- `questions`
- `status`

`deviations`, `unresolved` and `questions` MUST be lists. `status` MUST be exactly one of `implementation_ready`, `blocked` or `needs_decision`.

`implementation_ready` additionally MUST contain:

- `changed_files`, a non-empty list.

`blocked` and `needs_decision` MUST NOT require `changed_files`, `native_backend`, `verification` or `reported_task_head_sha`; they MUST settle before `observeWorkingTree`, `runVerification` or candidate creation.

The generic Worker result MUST NOT require or treat these Worker self-reports as authority:

- `native_backend`
- `verification`

Native execution facts remain owned by `processResult.native`: `native_thread_id`, `native_turn_id` and `native_turn_status`. Verification remains owned by Router `task.verification` executed through `runVerification()`. Ownership remains owned by Router `owns`, independently observed `facts.actualChangedFiles`, and `mechanicalGate()`.

## Required control flow

1. Preserve the existing process error/non-zero-exit gate.
2. Parse the final message with a small deterministic generic subset; do not add YAML or schema dependencies.
3. Validate common identity/status/list fields before working-tree observation. Publish valid `blocked` or `needs_decision` immediately.
4. For `implementation_ready`, require a non-empty list-valued `changed_files`.
5. Preserve the current implementation-ready sequence without redesign:
   1. independently `observeWorkingTree`;
   2. require HEAD equals dispatch base, branch equals Task branch, staged paths empty and working paths non-empty;
   3. require normalized Worker `changed_files` set equals independently observed working paths;
   4. apply existing Router ownership gate to working paths;
   5. run Router `task.verification` through `runVerification()` and require ordinary passes;
   6. re-observe and reject HEAD/branch/staged/working-path drift;
   7. exact-path stage, cached diff-check and deterministic Controller candidate commit;
   8. `collectTaskFacts`, require candidate files equal verified working paths, then `mechanicalGate`;
   9. preserve Supervisor, dependency gate, Task push, controlled Stage integration and `task_integrated` publication.

T05F01 changes only the Worker Result parser/validator boundary. It MUST NOT rewrite the existing gates listed above.

## Architecture decisions

```yaml
worker_result_parser: small_deterministic_generic_subset
semantic_status_gate: before_working_tree_observation
worker_changed_files_gate: worker_set_matches_observed_working_paths
candidate_identity_authority: controller_git_facts
controller_candidate_sequence: preserved
native_execution_authority: processResult.native
verification_authority: task.verification_to_runVerification
ownership_authority: router_owns_plus_observed_working_paths_plus_mechanicalGate
supervisor_integration: preserved
git_delivery: preserved
task_specific_production_branches: forbidden
```

## Scope

Outer writable paths only:

- `tools/codex-github-bridge/controller.mjs`
- `tools/codex-github-bridge/tests/controller.test.mjs`

Everything else is read-only context. Internal child ownership partitions these two paths without changing outer ownership.

## Root-only native multi-agent execution

T05F01 MUST be executed by the Root Supervisor Router in [`T05F01_MULTI_AGENT_SUPERVISOR_ROUTER.md`](./T05F01_MULTI_AGENT_SUPERVISOR_ROUTER.md) using [`T05F01_MULTI_AGENT_ROUTER_CONTRACT.md`](./T05F01_MULTI_AGENT_ROUTER_CONTRACT.md). This exact Contract explicitly authorizes native multi-agent delegation only for that Root.

The Root MUST read every child exact Contract and inject its complete text in the first child turn. A child MUST NOT discover or choose its own Contract. A01 and A02 run concurrently as the initial Ready Set; Root focused verification follows; A03 runs read-only; Root full verification follows. Root then verifies the exact two-file outer scope, leaves the implementation unstaged, and returns the required `implementation_ready` transition result. Root and children have no Git write authority. Serial fake-agent fallback is forbidden. Native multi-agent unavailability returns `needs_decision`.

## Constraints and non-goals

- Production `controller.mjs` MUST NOT contain permanent task-ID branches for T05, T05F00 or T05F01.
- Do not retain `tools/codex-github-bridge/**` as a universal Worker-result path requirement.
- Do not generalize T05 `baseline_equivalent_no_new_regression` or `pass-under-accepted-amendment` into future Task semantics.
- Do not add a YAML dependency, schema registry, validator registry, provider registry, `Result`/`Either`, retry framework, compatibility mode, local database, hash index or patch-id index.
- Do not change Router grammar, native transport, model routing, scheduler, working-tree/candidate/Git gates, `collectTaskFacts`, `mechanicalGate`, `runVerification`, Supervisor implementation, Git implementation, integration behavior or GitHub lifecycle schema.
- Children have no Git authority, do not commit/push/checkout/rebase, and do not spawn writing descendants.
- Root does not `git add`, commit, push, integrate Stage, perform formal Review, write main or repair child-owned files itself.

## Acceptance criteria

1. A docs-owned `implementation_ready` result such as Router `owns=[docs/example.md]` and Worker/observed `changed_files=[docs/example.md]` reaches the normal working-tree/verification/candidate path without Worker `native_backend` or `verification` mappings.
2. Valid `blocked` and `needs_decision` results need no `changed_files` and settle before `observeWorkingTree`.
3. `implementation_ready` without `changed_files` is blocked.
4. Worker `changed_files` mismatch is blocked before Router verification or candidate creation.
5. Matching `changed_files` that violate Router `owns` are blocked by the existing ownership gate.
6. Router verification failure blocks before candidate creation.
7. Native facts are taken from `processResult.native` and continue into lifecycle/Supervisor evidence; Router verification executes independently and controls progress.
8. Existing exact staging, one Controller commit, candidate-file/mechanical gates, Supervisor, dependency, push, integration and publication regressions continue through the real `BridgeController.processResult` path.
9. Production contains no T05/T05F00/T05F01 task-ID special case and no T05 amendment vocabulary.
10. Exactly the two outer owned files change; Root leaves them unstaged and creates no commit.

## Verification

After A01 and A02 complete, Root MUST run this focused gate before A03:

- `node --test tools/codex-github-bridge/tests/controller.test.mjs`

Only after the focused gate passes may Root dispatch A03. After A03 passes, Root MUST run all of:

- `node --test tools/codex-github-bridge/tests/controller.test.mjs`
- `node --test tools/codex-github-bridge/tests/*.test.mjs`
- `npm run typecheck`
- `git diff --check`

Every command requires ordinary pass. The T05 baseline amendment does not apply. `npm test` is not required and MUST NOT be reported as passed.

## Transition execution compatibility

The Bridge process that executes T05F01 loads the current Controller before T05F01 changes begin. Therefore the final outer Worker result MUST use the transition envelope required by that already-loaded Controller. It MUST NOT be routed through the new generic validator during the same process. This is a one-time execution envelope, not a production compatibility mode; production code MUST NOT add `if task_id == T05F01` or any transition-task branch.

On success, the Root final message MUST contain exactly one parseable outer Coding Result mapping: one YAML code fence containing the complete mapping below, with no prose or second YAML summary before or after it. Each known parser field (`task_id`, `dispatch_id`, `reported_base_sha`, `changed_files`, `native_backend`, `verification`, `deviations`, `unresolved`, `questions`, `status`) MUST occur exactly once in the final message. Duplicate known fields remain invalid; production MUST NOT implement first-value-wins, last-value-wins or duplicate-field tolerance.

Before producing that single final mapping, Root MUST confirm internally that A01, A02 and A03 each returned `implementation_ready`, the exact outer changed-file set is correct, the working tree changes are unstaged, and Root has no commit authority. These orchestration facts stay in reasoning/internal coordination and MUST NOT be emitted as a second top-level Worker Result summary.

The legacy `full_tests` key is only the old parser's field name. Its value is the ordinary Bridge-suite command, not `npm test`.

## Documentation updates

None during implementation. This exact outer Contract, Root Supervisor Router, internal Router and three child Contracts are the complete T05F01 planning bundle.

## Question policy

Return `needs_decision` and stop if native multi-agent is unavailable, serial fake-agent execution would be required, a production file outside the two owned paths must change, any child would need a writing descendant, or preserving existing Supervisor/Git/integration behavior requires a scope or architecture change. Do not expand scope.

## Required Coding Result — one-time transition envelope

```yaml
task_id: T05F01-generic-worker-result-boundary
dispatch_id: wf15-s02-t05f01-generic-worker-result-boundary-002
reported_base_sha: <dispatch base>
changed_files:
  - tools/codex-github-bridge/controller.mjs
  - tools/codex-github-bridge/tests/controller.test.mjs
native_backend:
  interface: <actual native interface used>
  worker_mode: one_thread_per_task
  explicit_thread_cwd: pass
  explicit_turn_cwd: pass
  terminal_event: <actual terminal event/status boundary>
  silent_fallback: false
verification:
  bridge_tests: pass - node --test tools/codex-github-bridge/tests/controller.test.mjs
  typecheck: pass - npm run typecheck
  full_tests: pass - node --test tools/codex-github-bridge/tests/*.test.mjs
  diff_check: pass - git diff --check
deviations: []
unresolved: []
questions: []
status: implementation_ready | blocked | needs_decision
```

For `implementation_ready`, Root leaves exactly the two owned files unstaged and does not add, commit or push. The already-loaded Controller independently observes the working tree, runs Router verification, creates the deterministic candidate commit and continues the existing controlled delivery path. The transition-only mappings above are compatibility fields, not authority; authoritative native facts remain `processResult.native`, and authoritative verification remains Router `runVerification(task.verification)`.
