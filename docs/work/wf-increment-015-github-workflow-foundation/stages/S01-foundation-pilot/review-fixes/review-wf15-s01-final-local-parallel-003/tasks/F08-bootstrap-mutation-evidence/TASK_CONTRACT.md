# FIX TASK CONTRACT — F08-bootstrap-mutation-evidence

## Contract state

- review_id: `review-wf15-s01-final-local-parallel-003`
- confirmed finding: `R4-bootstrap-mutation-evidence`
- finding/minimum direction confirmed_by_user: `true`
- Contract generation authorized: `true`
- Contract generation source Stage SHA: `c08e2dd757b989f7f005d9c1703d08c519b8213b`
- exact Contract bundle acceptance: pending
- Coding authorized at generation: `false`
- task_id: `F08-bootstrap-mutation-evidence`
- dispatch_id: `wf15-s01-f08-bootstrap-mutation-evidence-001`
- type: Fix Task
- scope: `R4_evidence_only`
- model_policy: `coding_strong`
- current_resolved_model_hint: `gpt-5.6-sol`
- reasoning_effort: `medium`
- fallback_model_policy: none
- depends_on: none

The later runtime Coding gate is a current-chat user decision that accepts the exact generated Contract-bundle commit SHA and explicitly authorizes F08 Coding. Do not require a self-mutating Contract commit to flip this historical generation-state field.

## Worker role

You are the implementation Worker for one evidence-contract defect only. The Repository Bootstrap functional behavior is already accepted as correct; do not redesign it.

Do not Review, Merge, write `main`, edit the Stage branch directly, rerun F05/F06/F07, or modify any file outside ownership.

## Goal

Make the existing Repository Bootstrap machine-readable result explicitly report whether that invocation performed any allowed repository settings mutation.

The result must include the boolean field `mutation_performed`.

## Ownership

Writable only:

- `tools/codex-github-bridge/github.mjs`
- `tools/codex-github-bridge/tests/github.test.mjs`

Everything else is read-only.

## Required behavior

Preserve the existing `bootstrapActions(repository)` algorithm and add only invocation-local mutation evidence.

Required semantics:

1. Start the invocation with `mutationPerformed = false` or an equivalent local boolean.
2. If the repository is already ready and no settings write occurs, return `mutation_performed: false`.
3. If `enableActions()` is successfully called in this invocation, the eventual ready result must return `mutation_performed: true`.
4. If `enablePullRequestApproval()` is successfully called in this invocation, the eventual ready result must return `mutation_performed: true`.
5. If both writes are required and succeed, return `mutation_performed: true`.
6. Preserve the existing one-re-read-after-each-mutation behavior and the current `default_workflow_permissions` preservation rule.
7. If a write fails, retain existing `needs_decision` behavior; no successful result is required.
8. Do not infer mutation history from repository state. The field describes only the current bootstrap invocation.

The CLI already prints the object returned by `bootstrapActions`; do not edit CLI code merely to duplicate/pass through this field.

## Coding plan — coding_strong / medium

1. Read `bootstrapActions()` and the existing bootstrap tests completely.
2. Add one invocation-local boolean near the current bootstrap state reads.
3. Flip it only after a required settings write has successfully returned.
4. Include `mutation_performed` in the existing ready result object.
5. Extend the existing already-ready test to assert `false`.
6. Extend the existing minimal-mutation test to assert `true` while preserving the exact write count, one-re-read behavior, and `default_workflow_permissions: read` evidence.
7. If useful without new scaffolding, add/adjust one focused case proving a single missing setting also returns `true`; do not create a generic matrix framework.
8. Run focused and full Bridge tests plus `git diff --check`.
9. Inspect the final diff and remove any logging, history, persistence, retry, settings abstraction, or unrelated cleanup.

Reasoning priority: exact result semantics > preservation of existing bootstrap boundary behavior > tests > style.

## Acceptance criteria

- `bootstrapActions()` ready result always has boolean `mutation_performed`;
- already-ready/no-write path returns `false`;
- any successful required settings mutation in the invocation returns `true`;
- existing Actions-enabled and PR-creation-permission semantics remain unchanged;
- existing preservation of `default_workflow_permissions` remains unchanged;
- existing one-write/one-re-read behavior remains unchanged;
- policy/admin rejection still becomes `needs_decision` with no retry;
- no persistent mutation history/audit store is added;
- no CLI/controller/workflow/docs/package changes;
- only the two owned files change.

## Verification

Required:

- `node --test tools/codex-github-bridge/tests/github.test.mjs`
- `node --test tools/codex-github-bridge/tests/*.test.mjs`
- `git diff --check`

The Supervisor will independently re-read Git facts and verification process results.

## Stop / needs_decision

Return `needs_decision` if the requested evidence cannot be implemented without changing files outside ownership, changing repository permission semantics, adding persistence/history, adding a generic settings framework, adding retry/fallback behavior, or modifying the exact frozen architecture.

## Required Coding Result

Return these material facts only:

- review_id
- task_id
- dispatch_id
- reported_base_sha
- reported_task_head_sha
- changed_files
- focused github test result
- full Bridge test result
- diff-check result
- evidence for already-ready `mutation_performed=false`
- evidence for mutated `mutation_performed=true`
- status: `candidate_ready | blocked | needs_decision`
