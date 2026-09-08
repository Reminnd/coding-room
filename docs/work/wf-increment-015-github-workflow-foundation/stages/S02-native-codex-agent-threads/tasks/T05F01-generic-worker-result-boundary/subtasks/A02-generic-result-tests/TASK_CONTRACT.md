# SUBTASK CONTRACT — A02-generic-result-tests

## Contract

```yaml
status: Proposed
confirmed_by_user: false
task_id: A02-generic-result-tests
parent_task_id: T05F01-generic-worker-result-boundary
parent_dispatch_id: wf15-s02-t05f01-generic-worker-result-boundary-002
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

This Subtask is executable only after fresh acceptance of the outer T05F01 Retry `-002` Contract and when Root dispatches this complete exact text. It is not an independent Local Bridge Task or Git authority.

## Goal

Add direct `BridgeController.processResult` coverage proving the generic Worker Result boundary, semantic stop gate and preservation of the current Controller-owned candidate path and downstream authorities.

## Required test matrix

Tests MUST exercise the real `BridgeController.processResult` path and MUST NOT replace it with a mocked final-validator boolean.

1. A docs-owned `implementation_ready` Task reaches the normal path, for example Router `owns=[docs/example.md]` and Worker/observed `changed_files=[docs/example.md]`, without `native_backend` or `verification` mappings.
2. A valid `blocked` result with common identity and list fields, but no `changed_files`, settles before `observeWorkingTree`.
3. A valid `needs_decision` result has the same early-settlement behavior.
4. `implementation_ready` without `changed_files` is blocked.
5. Worker `changed_files` and actual working-path mismatch is blocked before Router verification and candidate creation.
6. Matching `changed_files` that violate Router `owns` are blocked by the existing ownership gate.
7. Router verification failure is blocked before candidate creation.
8. Native thread/turn/status facts come from `processResult.native` and continue into existing lifecycle and Supervisor evidence.
9. Existing Controller candidate regressions remain passing: exact staging, one Controller commit, candidate-file/mechanical gates, Supervisor, dependency, Task push, controlled Stage integration and publication.
10. Production contains no T05, T05F00 or T05F01 task-ID special case.

The order Oracle MUST demonstrate semantic non-success before observation, Worker/observed exact-set agreement before Router verification/candidate creation, ownership as an independent gate, Router verification before candidate creation, and the unchanged downstream Controller sequence afterward. Path-set comparison is order-insensitive after the same normalization used by the production boundary.

## Scope and non-goals

- Writable only: `tools/codex-github-bridge/tests/controller.test.mjs`.
- Do not modify production, fixtures outside this file, Router, Contracts or package files.
- Do not add a separate validator implementation in tests or derive expected results from production parser tables.
- Do not add T05 task-ID cases, `candidate_ready`, `reported_task_head_sha` or T05 baseline-amendment vocabulary as generic behavior.
- Do not commit, push, checkout, rebase, reset, publish lifecycle events or spawn a writing child.

## Acceptance criteria

- All ten required regressions have direct, assertion-backed coverage through `processResult` or direct source assertion for the task-ID prohibition.
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
status: implementation_ready | blocked | needs_decision
```
