# SUBTASK CONTRACT — A02-generic-result-tests

## Contract

```yaml
status: Proposed under outer T05F01 acceptance
task_id: A02-generic-result-tests
parent_task_id: T05F01-generic-worker-result-boundary
type: Internal Test Subtask
depends_on: []
model_policy: coding_strong
reasoning_effort: medium
read_only: false
git_authority: none
child_spawned_writing_subagents: false
owns:
  - tools/codex-github-bridge/tests/controller.test.mjs
```

This Subtask is executable only when Root dispatches the complete exact text under an Accepted outer T05F01 Contract. It is not an independent Local Bridge Task or Git authority.

## Goal

Add direct `BridgeController.processResult` coverage proving the generic Worker Result boundary, identity-gate order and preservation of downstream authorities.

## Required test matrix

Tests MUST exercise the real `BridgeController.processResult` path and MUST NOT replace it with a mocked final-validator boolean.

1. A docs-owned candidate reaches the normal Controller path, for example Router `owns=[docs/example.md]` and Worker/Git `changed_files=[docs/example.md]`.
2. A generic Worker result does not need `native_backend`.
3. A generic Worker result does not need `verification`.
4. Worker/Git changed-file set mismatch publishes `blocked` before `mechanicalGate`.
5. Reported head mismatch publishes `blocked` before `mechanicalGate`.
6. Matching Worker/Git file sets that violate Router ownership are rejected by `mechanicalGate`.
7. `status=blocked` publishes `blocked` without collecting Git facts.
8. `status=needs_decision` publishes `needs_decision` without collecting Git facts.
9. An incomplete `candidate_ready` result is blocked.
10. Wrong `task_id`, `dispatch_id`, `reported_base_sha`, or malformed `reported_task_head_sha` is rejected at the required semantic gate.
11. Native thread/turn/status facts still come from `processResult.native`.
12. `task.verification` is still actually executed and controls progress.
13. Existing Supervisor, dependency, push, controlled integration and publication regressions continue to pass.

The order Oracle MUST demonstrate that head mismatch is checked first, changed-file exact-set mismatch second, Router ownership third, and Router verification afterward. The Worker/Git changed-file comparison is order-insensitive exact set membership after the same path normalization used by the production boundary.

## Scope and non-goals

- Writable only: `tools/codex-github-bridge/tests/controller.test.mjs`.
- Do not modify production, fixtures outside this file, Router, Contracts or package files.
- Do not add a separate validator implementation in tests or derive expected results from production parser tables.
- Do not add T05 task-ID cases or preserve T05 baseline-amendment vocabulary as generic behavior.
- Do not commit, push, checkout, rebase, publish lifecycle events or spawn a writing child.

## Acceptance criteria

- All thirteen required behaviors have direct, assertion-backed coverage through `processResult`.
- Gate-order cases assert downstream calls were not made.
- Existing successful integration path remains covered.
- Only `controller.test.mjs` changes.
- If production outside A01 ownership or another test file is required, return `needs_decision`; do not expand scope.

## Verification

Root owns the focused command after A01 and A02 complete: `node --test tools/codex-github-bridge/tests/controller.test.mjs`. A02 MUST inspect its complete owned Diff and return its result without treating a concurrent pre-A01 test run as final evidence.

## Required Subtask Result

```yaml
task_id: A02-generic-result-tests
changed_files:
  - tools/codex-github-bridge/tests/controller.test.mjs
required_matrix: covered | blocked | needs_decision
deviations: []
unresolved: []
questions: []
status: candidate_ready | blocked | needs_decision
```
