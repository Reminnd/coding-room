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

## Documentation updates

None。

## Question policy

Return `needs_decision` without widening scope if T01 integrated facts contradict this Contract；Current reader compatibility cannot be retained；Fix authority is not unique；an unowned path/dependency/workflow is required；or Actions would acquire identity、decision、acceptance or launch authority。
