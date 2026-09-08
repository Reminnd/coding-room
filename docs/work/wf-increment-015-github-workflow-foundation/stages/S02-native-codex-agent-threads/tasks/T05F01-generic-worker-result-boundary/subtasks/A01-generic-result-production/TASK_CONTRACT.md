# SUBTASK CONTRACT — A01-generic-result-production

## Contract

```yaml
status: Proposed
confirmed_by_user: false
task_id: A01-generic-result-production
parent_task_id: T05F01-generic-worker-result-boundary
parent_dispatch_id: wf15-s02-t05f01-generic-worker-result-boundary-002
type: Internal Implementation Subtask
depends_on: []
model_policy: coding_strong
reasoning_effort: high
read_only: false
git_authority: none
child_spawned_writing_subagents: false
owns:
  - tools/codex-github-bridge/controller.mjs
```

This Subtask is executable only after fresh acceptance of the outer T05F01 Retry `-002` Contract and when Root dispatches this complete exact text. It is not an independent Local Bridge Task or Git authority.

## Goal

Implement the task-generic Worker Result production boundary in `controller.mjs` while preserving the existing independent native, Router verification, ownership, Supervisor and Git delivery authorities.

## Coding plan

1. Remove the T05-specific `WORKER_RESULT_MAPS` requirement.
2. Keep the generic parser a small deterministic subset; do not add YAML/schema dependencies or registries.
3. Do not require Worker `native_backend`.
4. Do not require Worker `verification`.
5. Support exactly `implementation_ready`, `blocked` and `needs_decision`.
6. Validate common identity/status/list fields before working-tree observation; publish valid `blocked` and `needs_decision` without `observeWorkingTree`.
7. Require non-empty list-valued `changed_files` only for `implementation_ready`; do not parse or require `reported_task_head_sha`.
8. Preserve the current `implementation_ready` sequence and change no existing gate: working-tree observation and HEAD/branch/staged/working-path checks; Worker/observed changed-file exact-set check; Router ownership; Router verification; post-verification re-observation; exact staging; cached diff-check; deterministic Controller commit; `collectTaskFacts`; candidate-file gate; `mechanicalGate`; Supervisor; dependency; push; integration; publication.
9. Preserve `processResult.native` as the source of native thread/turn/status facts.
10. Modify no other file.

## Required generic semantics

Always required: `task_id`, `dispatch_id`, `reported_base_sha`, list-valued `deviations`, `unresolved`, `questions`, and allowed `status`.

For `implementation_ready` only: non-empty `changed_files`.

Worker/observed working-path mismatch publishes `blocked` before Router verification or candidate creation. Router ownership remains a separate existing gate. Worker `native_backend` and `verification` maps, if present in prose, do not become authority or a required production schema.

## Scope and non-goals

- Writable only: `tools/codex-github-bridge/controller.mjs`.
- Do not modify tests, Router, Supervisor, Git, verification, native adapter or any Contract.
- Do not add permanent T05/T05F00/T05F01 branches or T05 baseline-amendment semantics.
- Do not redesign Worker commit authority, `implementation_ready` transition, working-tree observation, ownership, verification, revalidation, exact staging, candidate commit, Git facts, mechanical gate, push or integration.
- Do not add YAML, registry, provider abstraction, `Result`/`Either`, retry, compatibility, local DB, hash or patch-id infrastructure.
- Do not commit, push, checkout, rebase, reset, publish lifecycle events or spawn a writing child.

## Acceptance criteria

- Production control flow and authority match the outer Contract exactly.
- Only `controller.mjs` changes.
- A01 returns its result to Root without Git writes.
- If another production file is required, return `needs_decision`; do not expand scope.

## Verification

Root owns executable focused/full verification after A01 and A02 complete. A01 MUST perform a direct inspection of its complete owned Diff and report any deviation; it MUST NOT race A02 by treating a concurrently changing test result as final authority.

## Required Subtask Result

```yaml
task_id: A01-generic-result-production
changed_files:
  - tools/codex-github-bridge/controller.mjs
production_boundary: implemented | blocked | needs_decision
deviations: []
unresolved: []
questions: []
status: implementation_ready | blocked | needs_decision
```
