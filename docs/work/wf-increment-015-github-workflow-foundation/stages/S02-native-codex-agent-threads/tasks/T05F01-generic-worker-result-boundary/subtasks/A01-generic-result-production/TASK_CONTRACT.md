# SUBTASK CONTRACT — A01-generic-result-production

## Contract

```yaml
status: Proposed under outer T05F01 acceptance
task_id: A01-generic-result-production
parent_task_id: T05F01-generic-worker-result-boundary
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

This Subtask is executable only when Root dispatches the complete exact text under an Accepted outer T05F01 Contract. It is not an independent Local Bridge Task or Git authority.

## Goal

Implement the task-generic Worker Result production boundary in `controller.mjs` while preserving the existing independent native, Router verification, ownership, Supervisor and Git delivery authorities.

## Coding plan

1. Remove the T05-specific `WORKER_RESULT_MAPS` requirement.
2. Keep the generic parser a small deterministic subset; do not add YAML/schema dependencies or registries.
3. Do not require Worker `native_backend`.
4. Do not require Worker `verification`.
5. Support exactly `candidate_ready`, `blocked` and `needs_decision`.
6. Validate always-required identity/status/list fields before any Git facts; publish `blocked` and `needs_decision` without `collectTaskFacts`.
7. Require a valid 40-character `reported_task_head_sha` and non-empty `changed_files` for `candidate_ready`.
8. Immediately after `collectTaskFacts`, compare the reported head with `facts.taskHeadSha`.
9. Next compare the normalized reported `changed_files` set with normalized `facts.actualChangedFiles` as exact sets.
10. Preserve `mechanicalGate` as the Router ownership authority after both identity gates pass.
11. Preserve independent `runVerification(task.verification)` after the ownership gate.
12. Preserve `processResult.native` as the source of native thread/turn/status facts.
13. Preserve existing clean verification, complete Diff, Supervisor Integration, dependency gate, push, controlled integration and publication flow.
14. Modify no other file.

## Required generic semantics

Always required: `task_id`, `dispatch_id`, `reported_base_sha`, list-valued `deviations`, `unresolved`, `questions`, and allowed `status`.

For `candidate_ready` only: valid `reported_task_head_sha` and non-empty `changed_files`.

Both candidate identity mismatches publish `blocked` before `mechanicalGate`, `runVerification`, Supervisor, push or integration. Worker `native_backend` and `verification` maps, if present in prose, do not become authority or a required schema.

## Scope and non-goals

- Writable only: `tools/codex-github-bridge/controller.mjs`.
- Do not modify tests, Router, Supervisor, Git, verification, native adapter or any Contract.
- Do not add permanent T05/T05F00/T05F01 branches, universal Bridge path rules or T05 baseline-amendment semantics.
- Do not add YAML, registry, provider abstraction, `Result`/`Either`, retry, compatibility, local DB, hash or patch-id infrastructure.
- Do not commit, push, checkout, rebase, publish lifecycle events or spawn a writing child.

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
status: candidate_ready | blocked | needs_decision
```
