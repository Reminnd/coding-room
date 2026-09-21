# TASK CONTRACT — T02 Review / Fix Actions Selector

## Contract

```yaml
task_id: T02-review-fix-actions-selector
dispatch_id: wf16-s01-t02-review-fix-actions-selector-001
type: Implementation Task
status: Accepted
confirmed_by_user: true
implementation_authorized: false
depends_on:
  - T01-review-fix-lifecycle-core
task_branch: task/wf-increment-016-github-review-fix-acceptance-closure/T02-review-fix-actions-selector
task_contract_path: docs/work/wf-increment-016-github-review-fix-acceptance-closure/stages/S01-review-fix-acceptance-closure/tasks/T02-review-fix-actions-selector/TASK_CONTRACT.md
model_policy: coding_strong
reasoning_effort: high
fallback_model_policy: null
```

This Accepted Contract is not dispatch authority。S01 is not bootstrapped and Implementation remains unauthorized。

## Background

T01 provides strict structured records and lifecycle gates。T02 adds conflict-first selection between the normal canonical Router and one exact current prepared Fix Router while keeping Actions mechanical-only。

## Goal

Preserve bootstrap compatibility with the Current `ROUTER_CONTRACT_V1` reader and implement deterministic exact-SHA Router selection and mechanical handoff publication without acquiring Review、acceptance or Worker-launch authority。

## Requirements

1. Preserve the complete Current-compatible canonical Router payload in [ROUTER_CONTRACT.md](../../ROUTER_CONTRACT.md)。
2. Use exactly `canonical_stage_router` and `prepared_fix_router`；`needs_decision` is failure, not a third mode。
3. Strict-reduce all current Fix preparation records before selection and reject current conflict/malformed/ambiguity before handoff mutation。
4. Select canonical mode when no exact current Fix preparation exists；old-SHA preparation remains historical and cannot capture current。
5. Select Fix mode only for one exact current `FIX_PREPARED_V1` and bind its prepared SHA、Fix identities、source Review/confirmation and preallocated mapping。
6. Verify the exact prepared SHA and publish `STAGE_VERIFICATION_V1 PASS` before the exact Fix-bundle handoff。
7. Actions verification/handoff must not require Fix acceptance；Actions never allocates dispatch IDs、creates Formal Review/acceptance or launches Worker。
8. Keep `CHAT_REVIEW_HANDOFF_V1` and the Fix-bundle handoff non-substitutable。
9. Add a hard-coded Current-reader fixture for the exact Increment 16 initial Router；the oracle must not derive expected values from the Router under test。

## Architecture decisions

- Canonical and prepared Fix routing share one conflict-first classifier。
- Canonical identity derives from actual Stage event facts；prepared Fix identity derives from exact current `FIX_PREPARED_V1`。
- Actions remains mechanical-only。
- The initial Router must parse before any T01/T02 implementation exists；`model_policy` and `reasoning_effort` remain string fields。

## Scope and ownership

- `.github/scripts/read-router-contract.mjs`
- `.github/scripts/select-stage-contract.mjs`
- `.github/workflows/codex-supervisor-dispatch.yml`
- `tests/router-contract-reader.test.ts`
- `tests/stage-contract-selector.test.ts`

## Constraints

```yaml
root_worker: sole_writer
required_fresh_read_only_subagents: 2
maximum_subagents: 2
subagent_fallback: forbidden
T01_integrated_before_dispatch: true
new_dependency: forbidden
second_workflow: forbidden
git_writes_by_worker: forbidden
scope_expansion: needs_decision
```

## Non-goals

- T01 lifecycle grammar、Worker launch、Formal Review、acceptance or documentation changes；
- third Router mode、latest-comment-wins、new workflow/Stage topology or future-reader-only bootstrap Router。

## Acceptance criteria

- Initial Router parses with the unmodified authoritative-base reader and preserves all nine fields for all three Tasks。
- Normal Stage dispatches T01；T01 integration leaves T02 canonical-dispatchable；T02 integration leaves T03 canonical-dispatchable。
- One exact current Fix selects prepared mode；old-SHA preparation does not replace canonical mode；conflict/ambiguity creates zero handoff mutation。
- Actions verification/handoff does not require Fix acceptance and creates no decision、acceptance or Worker launch。
- Relevant portions of all 18 frozen cases pass。

## Verification

| Command | Detects | Decision if failed |
|---|---|---|
| `node --test tests/router-contract-reader.test.ts` | initial Router incompatibility or loss of exact identity、ownership、verification | CR16-012 unresolved；do not persist or dispatch |
| `node --test tests/router-contract-reader.test.ts tests/stage-contract-selector.test.ts` | Router grammar、conflict-first selection and exact modes | blocked；T03 cannot dispatch |
| `npm run typecheck` | type-contract inconsistency | blocked |
| `npm test` | repository regression | blocked |
| `git diff --check` | patch-format defect | correct only owned paths |

The Current-reader regression must deep-equal hard-coded scheduler、integration、review、fix-policy、execution and every normalized Task field, including exact IDs、paths、branches、dependencies、ownership、model policy、reasoning effort、fallback and verification。

## One-time T02 baseline-equivalence verification amendment

This amendment is strictly limited to the existing T02 lineage：

```yaml
task_id: T02-review-fix-actions-selector
dispatch_id: wf16-s01-t02-review-fix-actions-selector-001
workflow_id: wf-increment-016-github-review-fix-acceptance-closure
stage_id: S01-review-fix-acceptance-closure
maintenance_parent_stage_sha: 83643a99c8cdd2a923a4ead602a29aa9ad53ffc2
existing_failure_scope: plugin-packaging CRLF/LF baseline outside T02 ownership
accepted_exception: baseline_equivalent_no_new_regression
```
This amendment applies only to the first accepted Stage descendant produced by
 this exact Contract-maintenance operation, where：
-  the Stage commit has exactly one parent equal to
 83643a99c8cdd2a923a4ead602a29aa9ad53ffc2；
-  the commit changes exactly this T02 TASK_CONTRACT.md and no other path；
-  fixed Chat separately accepts that resulting exact Stage SHA and exact T02
 Contract blob before T02 implementation begins。
That accepted descendant becomes the exact T02 dispatch base。This amendment
 does not apply to another Task、dispatch、Stage lineage、replacement dispatch or
 later unrelated base。
npm test exiting 0 remains the standard full-regression success condition。
 A non-zero T02 full regression may be classified only as
 baseline_equivalent_no_new_regression, and only if every condition below is
 satisfied：
1.  A clean detached checkout of the exact accepted T02 dispatch base reproduces
 exactly 409 total tests、403 passed and 6 failed。
2.  The T02 candidate produces exactly 409 total、403 passed and 6 failed。
3.  The exact failing-test identity sets of dispatch base and T02 candidate are
 identical。
4.  The corresponding failure evidence for every failed test is exactly
 identical。
5.  Every failure remains inside the existing plugin-packaging CRLF/LF baseline
 outside T02 ownership。
6. t02_new_regressions == 0。
7. node --test tests/router-contract-reader.test.ts passes。
8. node --test tests/router-contract-reader.test.ts tests/stage-contract-selector.test.ts
 passes。
9. npm run typecheck passes。
10. git diff --check passes。
11.  Every actual T02 changed file remains inside exact T02 Router ownership。
If any condition is not satisfied, the result remains
 blocked；do not deliver。
The full suite MUST NOT be described as green or passed while it exits non-zero。
 The only permitted non-zero classification under this one-time amendment is：
```
baseline_equivalent_no_new_regression
```
This amendment does not authorize modification of：
- tests/plugin-packaging.test.ts；
-  Plugin files or Plugin Markdown；
-  line-ending configuration；
-  any T02-unowned path。
It does not authorize a new dependency、second workflow、third Router mode、
 automatic conflict resolution or scope expansion。
The normal T02 implementation constraints remain unchanged：
```
root_worker: sole_writer
required_fresh_read_only_subagents: 2
maximum_subagents: 2
subagent_fallback: forbidden
git_writes_by_worker: forbidden
```
This Contract-maintenance operation does not consume or waive those two fresh
 read-only subagents。They remain mandatory when the separately authorized T02
 implementation actually begins。
This amendment does not authorize：
-  T02 Worker launch；
-  T02 task worktree creation；
- task_dispatched publication；
-  T02 candidate commit by the Worker；
-  T02 Task branch push；
-  T02 Stage integration；
-  T03；
-  candidate-ready publication；
-  Stage-to-main closure；
-  PR merge；
-  force push。
After this Contract amendment is persisted to the Stage, fixed Chat must
 separately inspect and accept the exact resulting Stage SHA and exact T02
 Contract blob before the already-approved T02 implementation authorization may
 be exercised.

## Documentation updates

None。

## Question policy

Return `needs_decision` without widening scope if T01 integrated facts contradict this Contract；Current reader compatibility cannot be retained；Fix authority is not unique；an unowned path/dependency/workflow is required；or Actions would acquire identity、decision、acceptance or launch authority。
