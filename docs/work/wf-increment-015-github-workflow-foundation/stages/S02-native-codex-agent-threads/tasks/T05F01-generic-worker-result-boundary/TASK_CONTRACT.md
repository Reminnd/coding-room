# TASK CONTRACT — T05F01-generic-worker-result-boundary

## Contract

```yaml
status: Proposed
confirmed_by_user: false
task_id: T05F01-generic-worker-result-boundary
type: Implementation Task
dispatch_id: wf15-s02-t05f01-generic-worker-result-boundary-001
task_branch: task/wf-increment-015-github-workflow-foundation/T05F01-generic-worker-result-boundary
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
```

This planning revision generates the exact outer Contract and its internal Contract bundle only. It does not accept or dispatch T05F01. Execution requires T05F00 integration and separate user acceptance of this complete T05F01 bundle at the then-current exact pushed Stage SHA.

## Background

The integrated Controller's Worker Result boundary is still globally T05-specific: it requires the Worker to self-report `native_backend` and `verification`, constrains `changed_files` to `tools/codex-github-bridge/**`, and accepts the T05-only baseline-amendment vocabulary. Those requirements reject a future docs-owned T06 and assign authority to Worker self-report that already belongs to native process facts, Router verification and independent Git facts.

T05F01 replaces only that result boundary and its direct tests. Existing Supervisor Integration, dependency gate, task push, controlled Task-to-Stage integration and lifecycle publication remain unchanged.

## Goal

把 T05-specific Worker Result validation 改为 task-generic boundary，使 semantic status 在 Git facts 之前结算，`candidate_ready` 的 commit/file identity 由 Worker report 与独立 Git facts 立即交叉核对，并保留 Router ownership、native execution、verification、Supervisor 与 Git delivery 的既有权威。

## Generic Worker Coding Result contract

Every Worker result MUST contain these fields:

- `task_id`
- `dispatch_id`
- `reported_base_sha`
- `deviations`
- `unresolved`
- `questions`
- `status`

`deviations`, `unresolved` and `questions` MUST be lists. `status` MUST be exactly one of `candidate_ready`, `blocked` or `needs_decision`.

`candidate_ready` additionally MUST contain:

- `reported_task_head_sha`, a 40-character Git SHA;
- `changed_files`, a non-empty list.

`blocked` and `needs_decision` do not require `reported_task_head_sha` or `changed_files` and MUST settle before Git fact collection.

The generic Worker result MUST NOT require or treat these Worker self-reports as authority:

- `native_backend`
- `verification`

Native execution facts remain owned by `processResult.native`: `native_thread_id`, `native_turn_id` and `native_turn_status`. Verification remains owned by Router `task.verification` executed through `runVerification()`. Ownership remains owned by Router `owns`, independently observed `facts.actualChangedFiles`, and `mechanicalGate()`.

## Required control flow

1. Preserve the existing process error/non-zero-exit gate.
2. Parse the final message with a small deterministic generic subset; do not add YAML or schema dependencies.
3. Before `collectTaskFacts`, validate `task_id`, `dispatch_id`, `reported_base_sha`, allowed `status`, and the three required list fields.
4. If `status=blocked`, publish `blocked` immediately and do not call `collectTaskFacts`.
5. If `status=needs_decision`, publish `needs_decision` immediately and do not call `collectTaskFacts`.
6. If `status=candidate_ready`, additionally require a valid 40-character `reported_task_head_sha` and non-empty `changed_files` before collecting Git facts.
7. Call `collectTaskFacts(task, worktree, baseSha)` only for a semantically valid `candidate_ready` result.
8. Immediately compare `reported_task_head_sha` with `facts.taskHeadSha`. A mismatch publishes `blocked` and stops.
9. Next compare the normalized Worker-reported `changed_files` set with the normalized `facts.actualChangedFiles` set. Set order is irrelevant; exact membership is required. A mismatch publishes `blocked` and stops.
10. Either identity mismatch MUST occur before `mechanicalGate`, `runVerification`, Supervisor Integration, push or controlled integration.
11. After both identity gates pass, call the existing `mechanicalGate(task, facts)` so Router ownership remains authoritative.
12. Then execute the existing `runVerification(task.verification)` path independently of Worker self-report.
13. Preserve the existing clean-after-verification gate, complete Diff collection, Supervisor Integration, dependency gate, task push, controlled integration and `task_integrated` publication.

## Architecture decisions

```yaml
worker_result_parser: small_deterministic_generic_subset
semantic_status_gate: before_git_facts
candidate_identity_order:
  - reported_head_matches_git_head
  - reported_changed_files_set_matches_git_changed_files_set
  - router_ownership_mechanical_gate
  - router_verification
native_execution_authority: processResult.native
verification_authority: task.verification_to_runVerification
ownership_authority: router_owns_plus_git_facts_plus_mechanicalGate
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

The Root MUST read every child exact Contract and inject its complete text in the first child turn. A child MUST NOT discover or choose its own Contract. A01 and A02 run concurrently as the initial Ready Set; Root focused verification follows; A03 runs read-only; Root full verification follows; Root creates exactly one outer Task commit and returns the required legacy transition result. Serial fake-agent fallback is forbidden. Native multi-agent unavailability returns `needs_decision`.

## Constraints and non-goals

- Production `controller.mjs` MUST NOT contain permanent task-ID branches for T05, T05F00 or T05F01.
- Do not retain `tools/codex-github-bridge/**` as a universal Worker-result path requirement.
- Do not generalize T05 `baseline_equivalent_no_new_regression` or `pass-under-accepted-amendment` into future Task semantics.
- Do not add a YAML dependency, schema registry, validator registry, provider registry, `Result`/`Either`, retry framework, compatibility mode, local database, hash index or patch-id index.
- Do not change Router grammar, native transport, model routing, scheduler, `collectTaskFacts`, `mechanicalGate`, `runVerification`, Supervisor implementation, Git implementation, integration behavior or GitHub lifecycle schema.
- Children have no Git authority, do not commit/push/checkout/rebase, and do not spawn writing descendants.
- Root does not push, integrate Stage, perform formal Review, write main or repair child-owned files itself.

## Acceptance criteria

1. A docs-owned `candidate_ready` result such as Router `owns=[docs/example.md]` and Worker/Git `changed_files=[docs/example.md]` reaches the normal Controller path without Worker `native_backend` or `verification` mappings.
2. `blocked` and `needs_decision` publish their semantic status without collecting Git facts.
3. An incomplete or wrong-identity candidate is blocked before downstream Git/verification/Supervisor/delivery gates as specified.
4. Head mismatch and Worker/Git file-set mismatch are independently rejected before `mechanicalGate`.
5. A matching Worker/Git file set that violates Router ownership is rejected by `mechanicalGate`, proving identity and ownership remain separate gates.
6. Native facts are still taken from `processResult.native`; Router verification still executes and controls progress.
7. Existing Supervisor, dependency, push, integration and publication regression tests continue to pass through the real `BridgeController.processResult` path.
8. The production Diff contains no permanent T05/T05F00/T05F01 branch, universal Bridge path rule, T05 amendment semantics or prohibited framework/dependency.
9. Exactly the two outer owned files are changed and exactly one outer Conventional Commit is created.

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

The Bridge process that executes T05F01 loaded the old Controller before T05F01 changes began. Therefore the final outer Worker result MUST use the legacy transition envelope accepted by that already-loaded Controller. It MUST NOT be routed through the new generic validator during the same process. This is a one-time execution envelope, not a production compatibility mode; production code MUST NOT add `if task_id == T05F01` or any transition-task branch.

The legacy `full_tests` key is only the old parser's field name. Its value is the ordinary Bridge-suite command, not `npm test`.

## Documentation updates

None during implementation. This exact outer Contract, Root Supervisor Router, internal Router and three child Contracts are the complete T05F01 planning bundle.

## Question policy

Return `needs_decision` and stop if native multi-agent is unavailable, serial fake-agent execution would be required, a production file outside the two owned paths must change, any child would need a writing descendant, or preserving existing Supervisor/Git/integration behavior requires a scope or architecture change. Do not expand scope.

## Required Coding Result — legacy transition envelope

```yaml
task_id: T05F01-generic-worker-result-boundary
dispatch_id: wf15-s02-t05f01-generic-worker-result-boundary-001
reported_base_sha: <dispatch base>
reported_task_head_sha: <40-char worker-reported Git SHA>
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
status: candidate_ready | blocked | needs_decision
```

For `candidate_ready`, Root creates exactly one outer Conventional Commit on the T05F01 Task branch and does not push. Existing Local Bridge independently re-reads Git, native execution and verification facts before controlled integration.
