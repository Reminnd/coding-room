# TASK CONTRACT — T01 Review / Fix Lifecycle Core

## Contract

```yaml
task_id: T01-review-fix-lifecycle-core
dispatch_id: wf16-s01-t01-review-fix-lifecycle-core-001
type: Implementation Task
status: Accepted
confirmed_by_user: true
implementation_authorized: false
depends_on: []
task_branch: task/wf-increment-016-github-review-fix-acceptance-closure/T01-review-fix-lifecycle-core
task_contract_path: docs/work/wf-increment-016-github-review-fix-acceptance-closure/stages/S01-review-fix-acceptance-closure/tasks/T01-review-fix-lifecycle-core/TASK_CONTRACT.md
model_policy: coding_strong
reasoning_effort: high
fallback_model_policy: null
```

This Accepted Contract is not dispatch authority。S01 is not bootstrapped and Implementation remains unauthorized。

## Background

Implement the strict lifecycle grammar、four public lifecycle commands、explicit typed acceptance target、pre/post mutation recovery、Fix launch gate and exact non-force closure while preserving the generic Worker Result。

## Goal

Implement the lifecycle core so decision authority remains external、every current Fix launch predicate is checked before dispatch mutation and uncertain external writes are never represented as zero-write。

## Requirements

1. Implement all decision、mechanical and handoff grammars in the Accepted package。
2. Implement exactly `record-review`、`prepare-fix`、`record-acceptance` and `close-stage`。
3. Require `record-acceptance --record-type` with exactly `FIX_BUNDLE_ACCEPTANCE_V1 | STAGE_ACCEPTANCE_V1` and use `[record_type, acceptance_id]` identity。
4. Preserve caller-supplied decision and solution payloads exactly。
5. Split Controller load into read-only discovery/gate and post-gate execution preparation；batch-gate every prepared Fix Task before scheduler invocation。
6. Strict-read and cache exact Router/Task Contract bytes before mutation；Worker launch uses those cached bytes。
7. Reject gate failure at command level without Bridge event publication and preserve the original preallocated `dispatch_id`。
8. Publish `task_dispatched` only after worktree preparation and full gate success。
9. Preserve `PRE_MUTATION_FAILURE` and `POST_MUTATION_UNCERTAIN` separation and read-before-write recovery at every named external boundary。
10. Preserve exact non-force closure、main tri-state、generic Worker Result and Controller ownership of native/process、verification、ownership and Git facts。

### Structured records

Decision marker：

```text
<!-- CODEX_DECISION_RECORD_V1 -->
```

Allowed types are exactly `FORMAL_REVIEW_V1`、`FIX_ROUND_OPENED_V1`、`FIX_BUNDLE_ACCEPTANCE_V1`、`STAGE_ACCEPTANCE_V1`、`STAGE_CLOSURE_AUTHORIZATION_V1`。

```yaml
envelope:
  - exactly one decision marker
  - exactly one JSON fenced block
  - JSON root is exactly one object
  - duplicate members at any nesting level are rejected
  - missing, unknown, extra, null, defaulted or coerced fields are rejected
  - record_type must be one exact supported literal
source_reference:
  additional_properties: false
  required:
    source_kind: exact type-specific literal
    decision_reference: non-empty caller-supplied opaque immutable string
transport_provenance:
  writer_or_github_author: transport_only
  may_satisfy_decision_authority: false
  may_replace_source_reference: false
idempotency:
  same_typed_identity_same_structural_payload: reuse_without_duplicate_effect
  same_typed_identity_different_payload: needs_decision_without_overwrite
  comparison: direct_structural_comparison
  object_member_order: irrelevant
  string_values_and_array_order: preserved
  hashing_or_normalization: forbidden
```

#### Decision record schemas

`FORMAL_REVIEW_V1`：

```yaml
identity: [FORMAL_REVIEW_V1, review_id]
required:
  - review_id
  - review_handoff_id
  - verification_id
  - workflow_id
  - stage_id
  - repository
  - pull_request_number
  - stage_branch
  - reviewed_stage_sha
  - decision
  - decision_authority
  - source_reference
  - finding_ids
constants:
  decision_authority: chatgpt_fixed_chat
  source_reference.source_kind: fixed_chat_assistant_decision
decision_rules:
  PASS: finding_ids must be explicitly empty
  REQUEST_CHANGES: finding_ids must be non-empty and unique
```

It binds the exact current `CHAT_REVIEW_HANDOFF_V1`、its `verification_id`、its exact verified SHA and the unchanged remote Stage/PR head。

`FIX_ROUND_OPENED_V1`：

```yaml
retry_lookup_identity: confirmation_id
generated_stable_identity: fix_round_id
required:
  - fix_round_id
  - confirmation_id
  - review_id
  - reviewed_stage_sha
  - solution_decision
  - decision_authority
  - source_reference
  - confirmed_finding_ids
  - confirmed_solution_id
  - confirmed_solution_payload
constants:
  solution_decision: confirmed
  decision_authority: user
  source_reference.source_kind: fixed_chat_user_decision
```

The caller-supplied solution payload is preserved without summarizing、completing、translating、normalizing、reinterpreting or widening it。

`FIX_BUNDLE_ACCEPTANCE_V1`：

```yaml
identity: [FIX_BUNDLE_ACCEPTANCE_V1, acceptance_id]
required:
  - acceptance_id
  - fix_round_id
  - fix_preparation_id
  - prepared_stage_sha
  - router_contract_path
  - verification_id
  - handoff_id
  - task_dispatch_mapping
  - decision
  - decision_authority
  - source_reference
constants:
  decision: accepted
  decision_authority: user
  source_reference.source_kind: fixed_chat_user_decision
```

`STAGE_ACCEPTANCE_V1`：

```yaml
identity: [STAGE_ACCEPTANCE_V1, acceptance_id]
required:
  - acceptance_id
  - review_id
  - handoff_id
  - verification_id
  - accepted_stage_sha
  - decision
  - decision_authority
  - source_reference
constants:
  decision: accepted
  decision_authority: user
  source_reference.source_kind: fixed_chat_user_decision
```

`STAGE_CLOSURE_AUTHORIZATION_V1`：

```yaml
identity: [STAGE_CLOSURE_AUTHORIZATION_V1, closure_authorization_id]
required:
  - closure_authorization_id
  - stage_acceptance_id
  - review_id
  - repository
  - stage_branch
  - accepted_stage_sha
  - expected_main_sha
  - exact_refspec
  - force
  - execution_semantics
  - decision
  - decision_authority
  - source_reference
constants:
  repository: Reminnd/coding-room
  stage_branch: stage/wf-increment-016-github-review-fix-acceptance-closure/S01-review-fix-acceptance-closure
  expected_main_sha: 02ca6e1fa54c6aad2120da42f2bd951ae0e6039e
  exact_refspec: "<accepted_stage_sha>:refs/heads/main"
  force: false
  execution_semantics: non_force_fast_forward_only
  decision: authorized
  decision_authority: user
  source_reference.source_kind: fixed_chat_user_decision
```

Closure authorization is durable evidence、not a reusable bearer capability；every push still requires a fresh explicit `close-stage` invocation and current Host approval。

#### Mechanical record schemas

Mechanical marker：

```text
<!-- CODEX_GITHUB_LIFECYCLE_RECORD_V1 -->
```

Allowed types are exactly `FIX_PREPARED_V1`、`STAGE_VERIFICATION_V1`、`STAGE_CLOSED_V1`。Mechanical records cannot contain or create `decision`、`decision_authority`、decision-record `source_reference`、Formal Review authority、user acceptance、Worker execution authority or closure authorization。

`FIX_PREPARED_V1`：

```yaml
identity: [FIX_PREPARED_V1, fix_preparation_id]
required:
  - fix_preparation_id
  - fix_round_id
  - workflow_id
  - stage_id
  - repository
  - pull_request_number
  - stage_branch
  - source_review_id
  - source_confirmation_id
  - source_stage_sha
  - solution_id
  - prepared_stage_sha
  - router_contract_path
  - tasks
  - record_authority
  - source_kind
constants:
  record_authority: local_bridge_controller
  source_kind: git_observation
task_entry_required:
  - task_id
  - dispatch_id
  - fix_round_id
  - fix_preparation_id
  - task_branch
  - task_contract_path
  - immutable_dispatch_facts
```

`fix_round_id`、`fix_preparation_id` and every `dispatch_id` are immutable and pairwise distinct。Dispatch IDs are preallocated before bundle materialization；the prepared bundle cannot predict or contain its own not-yet-created commit SHA。

`STAGE_VERIFICATION_V1`：

```yaml
identity: [STAGE_VERIFICATION_V1, verification_id]
required:
  - verification_id
  - event_id
  - workflow_id
  - stage_id
  - stage_sha
  - result
  - checks
  - record_authority
constants:
  record_authority: github_actions
result: PASS | FAIL
```

`STAGE_CLOSED_V1`：

```yaml
identity: [STAGE_CLOSED_V1, closure_id]
required:
  - closure_id
  - closure_authorization_id
  - review_id
  - accepted_stage_sha
  - observed_main_sha
  - pull_request_number
  - record_authority
constants:
  record_authority: local_bridge_controller
semantics: observed_terminal_projection_only
```

#### Handoff schemas

`CHAT_REVIEW_HANDOFF_V1` is an Actions-produced mechanical invitation before Formal Review。Its exact payload contains：

```text
status
repository
pull_request_number
workflow_id
stage_id
base_branch
base_sha
head_branch
head_sha
stage_contract_path
router_contract_path
verification_id
review_authority
```

```yaml
constants:
  status: ready_for_chat_review
  review_authority: chatgpt_fixed_chat
forbidden:
  - decision
  - decision_authority
  - source_reference
  - finding_ids as a Review result
  - user acceptance
  - Git-write authorization
```

The Fix-bundle dispatch handoff is a distinct mechanical projection binding the prepared Fix SHA、Fix identities and exact preallocated `task_id -> dispatch_id` mapping。Neither handoff may satisfy the other handoff's consumer gate。

### Pre-dispatch gate and failure semantics

Placement is `BridgeController.run()` after read-only repository/Stage/PR/handoff/comment/ref discovery and before `fetchStage`、Stage/Task worktree creation、scheduler、`publishEvent`、`processResult` or Worker launch。All selected Contracts pass one batch gate。

Common predicates：Accepted/confirmed Task Contract；exact task ID、dispatch ID、Contract path、handoff and Stage lineage；durably known `NOT_STARTED`。Prepared Fix predicates add one exact current `FIX_PREPARED_V1`、exact prepared SHA、current exact PASS、exact Fix handoff、exact Fix acceptance、structurally equal mapping、exact Router/preparation/handoff/acceptance/Task lineage、remote Stage and PR heads at the prepared SHA and known prior-start state。

False、missing、stale、ambiguous or unobservable input returns command-level `needs_decision` / `PRE_MUTATION_FAILURE` with zero Bridge events、replacement dispatches、worktrees、Worker launch、Git/GitHub mutation and durable dispatch change。The rejection does not enter `processResult()`。Only full success permits exact worktrees → one `task_dispatched` using the same preallocated ID → one Worker launch using cached Contract bytes。

Every `V10.A–D` public failure case through both `start` and `run-once` asserts zero calls to `fetchStage`、`ensureStageWorktree`、`ensureTaskWorktree`、`publishEvent`、`processResult`、scheduler、Worker launcher、replacement dispatch allocator and all Git/GitHub mutation methods。Read-only discovery、comments、`readRepositoryFile` and read-only remote-ref observation remain permitted。Case E permits exactly one Task worktree、one `task_dispatched` and one Worker launch with the original preallocated `dispatch_id`；Case F proves a rejected invocation does not consume that ID and a later fresh invocation performs exactly one eventual dispatch/launch with zero replacement allocation。

`POST_MUTATION_UNCERTAIN` never claims zero write：stop、do not perform dependent mutation、blind retry or rollback；a fresh invocation re-reads authority and repairs only proven missing later projections。

The covered external mutation boundaries are PR comment、label/Draft/ready projection、`repository_dispatch`、local prepared commit materialization、prepared Stage push、Worker launch/start observation、main push、terminal comment、terminal label and PR close。

### Closure

If remote main equals accepted Stage SHA, do not push and repair only missing terminal projections。If it equals expected main baseline, require fresh `close-stage`、current Host approval and exact `<accepted_stage_sha>:refs/heads/main` with `force=false`。A third or unobservable SHA returns `needs_decision` with no push。Terminal order is `STAGE_CLOSED_V1 → labels → PR close`。

## Scope

Create exactly：

- `tools/codex-github-bridge/structured-records.mjs`
- `tools/codex-github-bridge/lifecycle.mjs`
- `tools/codex-github-bridge/tests/structured-records.test.mjs`
- `tools/codex-github-bridge/tests/lifecycle.test.mjs`

Modify exactly：

- `tools/codex-github-bridge/cli.mjs`
- `tools/codex-github-bridge/github.mjs`
- `tools/codex-github-bridge/git.mjs`
- `tools/codex-github-bridge/controller.mjs`
- `tools/codex-github-bridge/codex.mjs`
- `tools/codex-github-bridge/index.mjs`
- `tools/codex-github-bridge/tests/cli.test.mjs`
- `tools/codex-github-bridge/tests/github.test.mjs`
- `tools/codex-github-bridge/tests/git.test.mjs`
- `tools/codex-github-bridge/tests/controller.test.mjs`
- `tools/codex-github-bridge/tests/codex.test.mjs`

Explicitly forbidden paths include `errors.mjs`、`scheduler.mjs`、`supervisor.mjs`、`scope.mjs`、`verification.mjs`、`model-router.mjs`、`process.mjs`、`codex-app-server.mjs` under the Bridge, plus `.github/**`、`docs/**`、`src/**`、`tests/**` and `CLAUDE.md`。

## Constraints

```yaml
root_worker: sole_writer
required_fresh_read_only_subagents: 3
maximum_subagents: 3
subagent_fallback: forbidden
child_spawned_writing_descendants: forbidden
new_dependency: forbidden
git_writes_by_worker: forbidden
scope_expansion: needs_decision
```

## Non-goals

- Actions Router selection owned by T02 or documentation owned by T03；
- fifth lifecycle command or automatic Review、Fix、acceptance、Worker launch or closure；
- new database、dependency、scheduler abstraction or compatibility layer；
- Room protocol、SQLite、product Runner、Plugin or Claude changes；
- PR merge、rebase、force push、automatic conflict resolution or unrelated cleanup。

## Acceptance criteria

- Exact record grammars and authority mappings are enforced；exactly four lifecycle commands are routable；acceptance target is explicit and type-isolated。
- `V10.A–F` pass through both public execution commands；failure creates no Bridge event/worktree and corrected acceptance reuses the original dispatch。
- canonical mode does not require Fix evidence；`scheduler.mjs` remains unchanged。
- all named response-loss boundaries preserve uncertainty；closure bindings/no-force arguments are proven；generic Worker Result remains unchanged。
- Relevant portions of the frozen 18-row matrix pass。

## Verification

| Command | Detects | Decision if failed |
|---|---|---|
| `node --test tools/codex-github-bridge/tests/structured-records.test.mjs tools/codex-github-bridge/tests/lifecycle.test.mjs` | strict record grammar、authority、idempotency and lifecycle order | blocked；do not deliver |
| `node --test tools/codex-github-bridge/tests/cli.test.mjs tools/codex-github-bridge/tests/github.test.mjs tools/codex-github-bridge/tests/git.test.mjs tools/codex-github-bridge/tests/controller.test.mjs tools/codex-github-bridge/tests/codex.test.mjs` | public CLI、pre-dispatch gate、recovery、Git/GitHub order and launch | blocked；do not deliver |
| `npm run typecheck` | type-contract inconsistency | blocked；do not deliver |
| `npm test` | repository regression | exit `0` remains the standard success condition；a non-zero exit is `blocked；do not deliver` unless the exact one-time baseline-equivalence amendment below is satisfied in full |
| `git diff --check` | patch-format defect | correct only owned paths |

### One-time baseline-equivalence verification amendment

This amendment is strictly bound to the following identity：

```yaml
task_id: T01-review-fix-lifecycle-core
dispatch_id: wf16-s01-t01-review-fix-lifecycle-core-001
dispatch_base_sha: d4f09e920e783a6b789a8d744e2ff648f1cc5535
workflow_id: wf-increment-016-github-review-fix-acceptance-closure
stage_id: S01-review-fix-acceptance-closure
```

It does not apply to any other Task、dispatch、Stage、base SHA or future unrelated `npm test` failure。`npm test` exiting `0` remains the standard full-regression success condition。A non-zero full regression may be classified only as `baseline_equivalent_no_new_regression` and only when every condition below is satisfied：

1. A clean detached checkout of exact base `d4f09e920e783a6b789a8d744e2ff648f1cc5535` reproduces the baseline。
2. The exact base and current T01 worktree have identical total、pass and fail counts。
3. Their failing-test identity sets are exactly equal。
4. The corresponding failure evidence for every failing test is exactly equal。
5. `t01_new_regressions == 0`。
6. The focused lifecycle/structured-record tests pass。
7. The five Bridge test files required by this Contract pass。
8. `npm run typecheck` passes。
9. `git diff --check` passes。
10. Every actual changed file remains inside T01 ownership。

If any condition is not satisfied, the result remains `blocked；do not deliver`。

The six `plugin-packaging` failures are not fixed。This amendment does not authorize changes to `tests/plugin-packaging.test.ts`、Plugin files、Plugin Markdown、line-ending configuration or any T01-unowned path。`npm test` MUST NOT be described as green or passed；the only permitted exception classification is `baseline_equivalent_no_new_regression`。

The exact-base verification reconfirmed the following evidence：

```yaml
dispatch_base_sha: d4f09e920e783a6b789a8d744e2ff648f1cc5535

clean_detached_exact_base:
  total: 409
  passed: 403
  failed: 6

current_T01_worktree:
  total: 409
  passed: 403
  failed: 6

failure_sets_identical: true
failure_evidence_identical: true
t01_new_regressions: 0

existing_failure_scope: plugin-packaging CRLF/LF baseline outside T01 ownership
accepted_exception: baseline_equivalent_no_new_regression
```

This amendment does not change the T01 Goal、Requirements、owned paths、model policy、architecture decisions or dispatch identity。It does not authorize a new Worker、T02、T03、Task delivery or Stage-to-main closure。

Persisting this amendment to the Stage does not automatically authorize T01 resume。Only after the push may fixed Chat separately inspect and accept the exact amended Stage SHA before the existing T01 candidate lineage can continue。

## Documentation updates

None。

## Question policy

Return `needs_decision` without scope expansion if implementation requires `scheduler.mjs` or any unowned path；authority/identity is conflicting；binding/current state is stale or ambiguous；Worker-start state is unknown；external mutation cannot be re-observed；or a dependency/fifth command appears necessary。

## One-time Supervisor-only operational gate amendment

T01 may add one `supervise-only` Bridge operational execution mode using only its already-owned `cli.mjs`, `controller.mjs`, `codex.mjs`, `git.mjs` and corresponding already-owned tests.

`supervise-only` is not a fifth lifecycle command. It creates no decision record, mechanical lifecycle record, Bridge event or authority; performs no lifecycle mutation, Worker launch, Task push, Stage integration, candidate publication or Stage closure; and never routes through normal `BridgeController.run()`, `processResult()` or `finishIfComplete()`.

The mode has two phases. `plan` performs read-only preflight and emits the exact Host execution plan. `execute` directly compares fresh read-only facts with that approved plan, requires current Host authorization, invokes the existing read-only `runSupervisor()` exactly once for an already-created exact candidate, returns its complete status and reason, then stops unconditionally.

Preflight binds the exact Task, dispatch, candidate, parent, branch, worktree, Accepted Contract ref/path/blob, Router ownership, remote Stage, PR facts, mechanical-gate facts, verification evidence, explicit Codex executable, model, reasoning effort, environment/network policy and complete parent-to-candidate Diff. Any mismatch returns `needs_decision` before Codex launch with zero Git/GitHub/lifecycle mutation.

Every future `supervise-only plan` MUST explicitly disclose these accepted Host approval residuals:

- the exact upstream request endpoint remains runtime-resolved by `codex.exe`; Host approval binds only an explicit provider/destination family, such as OpenAI Codex via ChatGPT auth / `chatgpt.com:443`, and does not freeze an exact request path;
- one Host-approved `codex.exe` launch may perform internal transport retry; the Bridge performs no retry, fallback or automatic second Supervisor launch, but one launch is not represented as one HTTPS transmission;
- the read-only Codex Supervisor may start necessary local read-only shell/Git children; MCP, `node_repl`, computer-use, completion notifier and other unnecessary integrations are disabled, without claiming an absolute bound on `codex.exe` internal child count.

Normal `start`, `run-once` and Worker → Supervisor → delivery behavior remain unchanged. Task delivery continues to require separate authorization.

This amendment does not itself authorize implementation, candidate amend, Supervisor execution, private-repository transmission or delivery. The accepted Host approval residuals likewise grant none of those authorities and are not a future candidate SHA bearer capability.

The amendment is bound to the existing Task lineage:

```yaml
task_id: T01-review-fix-lifecycle-core
dispatch_id: wf16-s01-t01-review-fix-lifecycle-core-001
dispatch_base_sha: d4f09e920e783a6b789a8d744e2ff648f1cc5535
```

No replacement dispatch is authorized by this amendment.

## One-time zero-capacity subagent waiver for candidate-binding repair

This waiver is strictly limited to the following existing T01 lineage and
repair attempt:
```yaml
task_id: T01-review-fix-lifecycle-core
dispatch_id: wf16-s01-t01-review-fix-lifecycle-core-001
dispatch_base_sha: d4f09e920e783a6b789a8d744e2ff648f1cc5535
pre_amend_candidate_sha: 612b46fdb11a4c72289e5be53b3bed73048fd3b1
repair_scope:
  - tools/codex-github-bridge/controller.mjs
  - tools/codex-github-bridge/tests/controller.test.mjs
repair_purpose: remove the static Supervisor-only candidate SHA binding and bind the exact per-invocation candidate to request, verification evidence, Git observation, complete Diff and approved-plan comparison
```

The current Host execution environment reports `agents=0/0`, so no native
read-only subagent capacity is available.

For this exact repair only, the Contract requirement
`required_fresh_read_only_subagents: 3` is waived to zero.

This waiver does not change the general T01 constraint and does not create
a fallback policy. `required_fresh_read_only_subagents: 3`,
`maximum_subagents: 3`, and `subagent_fallback: forbidden` remain the
governing constraints for all other implementation work, repair rounds and
future findings.

For this exact repair only, zero fresh read-only subagents is accepted
because the Host reports zero available subagent capacity. The Root Worker
must instead independently complete and report the same three audit
responsibilities that would otherwise have been delegated:

1. static binding and strict candidate-authority audit;
2. request → verification evidence → Git observation → execution plan →
   approved-plan lineage audit;
3. regression-test coverage and candidate-drift audit.

The Root Worker remains the sole writer. No additional writing agent is
authorized. Root self-audit under this waiver is not a general subagent
fallback mechanism and creates no precedent outside this exact repair.

This waiver applies only to the already-completed dynamic candidate-binding
repair whose pre-incorporation Task candidate HEAD is
`612b46fdb11a4c72289e5be53b3bed73048fd3b1`.

It applies only while all of the following facts remain true before the
repair is incorporated into the candidate:

- Task ID remains `T01-review-fix-lifecycle-core`;
- dispatch ID remains `wf16-s01-t01-review-fix-lifecycle-core-001`;
- dispatch base remains
  `d4f09e920e783a6b789a8d744e2ff648f1cc5535`;
- the Task worktree HEAD before incorporation remains
  `612b46fdb11a4c72289e5be53b3bed73048fd3b1`;
- that candidate has exactly one parent;
- that parent remains
  `d4f09e920e783a6b789a8d744e2ff648f1cc5535`;
- the repair modifies only
  `tools/codex-github-bridge/controller.mjs` and
  `tools/codex-github-bridge/tests/controller.test.mjs`;
- all other previously verified Supervisor-only implementation files remain
  byte-for-byte unchanged during this repair;
- the production hardcoded historical candidate SHA is removed;
- per-invocation `candidate_sha` is strictly request-bound;
- the request candidate is exactly bound to verification evidence;
- the request candidate is exactly bound to local Git observation and HEAD;
- parent, branch, ownership and mechanical-gate facts remain exact;
- complete Diff authority remains
  `dispatch_base_sha..request_candidate_sha`;
- approved-plan candidate drift remains rejected before Codex launch;
- focused tests pass;
- the required Bridge test set passes;
- typecheck passes;
- diff-check passes;
- the existing one-time baseline-equivalence amendment remains satisfied in
  full;
- `t01_new_regressions == 0`.

For the verification evidence already produced for this exact repair, the
accepted reported state is:

- focused: `23/23`;
- Bridge: `123/123`;
- typecheck: `pass`;
- diff-check: `pass`;
- full suite: `403/409`;
- exact-base baseline: `403/409`;
- failure identity sets identical: `true`;
- failure evidence identical: `true`;
- new regressions: `0`;
- classification:
  `baseline_equivalent_no_new_regression`.

The full suite is not green and MUST NOT be described as passed. The existing
six `plugin-packaging` failures remain the accepted exact-base failures under
the previously persisted baseline-equivalence amendment.

Before this repair may be incorporated into the Task candidate, fixed Chat
must separately accept the exact Stage SHA and exact TASK_CONTRACT blob
containing this completed waiver, and a fresh read-only audit must confirm
that the repair and worktree facts listed above have not changed.

If that fresh audit finds any new implementation defect requiring additional
code changes, this waiver does not authorize that new repair. If the normal
three-subagent requirement still cannot be satisfied for that new repair, a
new Contract decision is required.

This waiver expires immediately after this exact candidate-binding repair is
incorporated into the Task candidate, or earlier if any bound fact above
changes.

This waiver does not authorize a replacement dispatch. The existing
`dispatch_id` and original dispatch base remain unchanged.

This waiver does not authorize:

- additional implementation edits beyond the already-completed exact repair;
- changes to any unowned path;
- modification of `supervisor.mjs`;
- candidate amend by this Stage-maintenance operation;
- Task branch push;
- Supervisor execution;
- `supervise-only execute`;
- private-repository payload transmission to the Supervisor model;
- Task delivery;
- Stage integration of the Task candidate;
- lifecycle event publication;
- T02;
- T03;
- Stage-to-main closure;
- PR merge;
- force push.

Candidate incorporation, `supervise-only plan`, Host execution approval,
Supervisor execution and Task delivery each remain subject to their separate
authorization boundaries.

## One-time dynamic Accepted-Contract authority repair amendment

This amendment is strictly limited to the existing T01 lineage and the
Supervisor-only Accepted-Contract authority defect discovered after candidate
`3322fb35816d1bfde6355e31818c3eb9221caf86` was created.

The defect is that Supervisor-only production binding still compiles concrete
historical values for `accepted_stage_sha` and `task_contract_blob_sha`.

Legitimate Stage-level Contract maintenance changes those Git object
identities. Therefore concrete accepted Stage SHA and Contract blob SHA MUST
NOT be production constants.

For Supervisor-only requests, `accepted_stage_sha` and
`task_contract_blob_sha` are exact per-invocation authority inputs.

They are not trusted caller assertions.

Before any Codex launch, fresh read-only preflight MUST prove:

- request `accepted_stage_sha` equals the current remote Stage branch HEAD;
- request `accepted_stage_sha` equals PR #8 head SHA;
- PR #8 remains OPEN and draft, with base `main` and the exact Stage head branch;
- the fixed T01 TASK_CONTRACT.md path exists at exactly the requested Stage SHA;
- the Git blob of that exact path equals request `task_contract_blob_sha`;
- Supervisor Contract bytes are read from that exact Stage Git object.

The Contract bytes MUST NOT come from:
- Task working tree;
- mutable local docs;
- default branch;
- historical Contract object.

Any mismatch returns `needs_decision` before Codex launch with zero
Git/GitHub/lifecycle mutation.

The execution plan MUST bind the exact requested/observed:
- `accepted_stage_sha`;
- `task_contract_blob_sha`.

`execute` MUST freshly re-observe those facts and include them in the existing
direct structural comparison against the Host-approved plan.

Thus Stage or Contract authority drift prevents Supervisor launch.

The repair authorized by this amendment is limited to:

- `tools/codex-github-bridge/controller.mjs`;
- `tools/codex-github-bridge/tests/controller.test.mjs`.

No other implementation path is authorized without a fresh Contract decision.

The Host currently reports `agents=0/0`.

The previous zero-capacity waiver has been consumed and MUST NOT be reused.

For this exact Accepted-Contract authority repair only,
`required_fresh_read_only_subagents: 3` is waived to zero.

The general T01 constraints remain unchanged:

- `required_fresh_read_only_subagents: 3`;
- `maximum_subagents: 3`;
- `subagent_fallback: forbidden`.

For this exact repair, Root must independently perform:

1. static Accepted-Contract binding audit;
2. request → remote Stage → PR → exact Git blob → execution-plan authority audit;
3. approved-plan Stage/blob drift and regression-test audit.

This amendment is bound to:

- task `T01-review-fix-lifecycle-core`;
- dispatch `wf16-s01-t01-review-fix-lifecycle-core-001`;
- dispatch base `d4f09e920e783a6b789a8d744e2ff648f1cc5535`;
- pre-repair candidate `3322fb35816d1bfde6355e31818c3eb9221caf86`.

If a new implementation defect is discovered after this exact repair,
this waiver does not cover it.

This amendment does NOT authorize:

- Task candidate amend;
- Task branch push;
- Supervisor execution;
- supervise-only execute;
- private payload transmission;
- Task delivery;
- Stage integration;
- lifecycle publication;
- T02;
- T03;
- Stage-to-main closure;
- PR merge;
- force push;
- replacement dispatch.

After persistence, fixed Chat must separately accept the new Stage SHA and
new TASK_CONTRACT blob before implementation repair begins.

## Review handoff identity clarification amendment

The Accepted Contract previously required
`FORMAL_REVIEW_V1.review_handoff_id` while the exact
`CHAT_REVIEW_HANDOFF_V1` payload omitted a handoff identity field.
That combination is internally inconsistent because a Formal Review
cannot exactly bind an identifier that is absent from the mechanical
handoff being referenced.

The effective exact `CHAT_REVIEW_HANDOFF_V1` payload is therefore:
```text
status
repository
pull_request_number
workflow_id
stage_id
base_branch
base_sha
head_branch
head_sha
stage_contract_path
router_contract_path
verification_id
review_authority
handoff_id
```
