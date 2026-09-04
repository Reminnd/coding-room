# TASK CONTRACT — T01-router

## Contract

```yaml
status: Accepted
confirmed_by_user: true
task_id: T01-router
type: Implementation Task
model_policy: coding_strong
reasoning_effort: high
fallback_model_policy: none
base_sha: supplied_by_supervisor_at_dispatch
```

## Worker role

You are the implementation Worker for the Router boundary only. Treat Markdown/JSON Router input as untrusted external text, but trust the normalized typed object after successful parsing. Optimize for a small deterministic implementation, not a generic schema platform.

Do not perform formal Review and do not modify any path outside this Contract.

## Goal

Replace the PR #3 single-task Router reader with a dependency-free Stage-level DAG Router reader that can drive Local Parallel Codex scheduling.

## Owned paths

Only:

- `.github/scripts/read-router-contract.mjs`
- `tests/router-contract-reader.test.ts`

Everything else is read-only context.

## Mandatory behavior

The reader must mechanically reject at the Router text boundary:

1. missing or duplicate `<!-- ROUTER_CONTRACT_V1 -->` markers;
2. anything other than exactly one JSON fenced block;
3. malformed JSON or non-object root;
4. wrong fixed contract type/version/status;
5. missing/empty repository, workflow, Stage or branch fields;
6. missing/empty task list;
7. duplicate `task_id` or duplicate `dispatch_id`;
8. dependencies referencing unknown task IDs;
9. a dependency cycle;
10. missing task contract path/branch/owned paths/model policy/reasoning effort/verification;
11. invalid formal Review authority or Supervisor merge/approval permissions;
12. non-`always_confirm` fix policy;
13. non-local primary execution surface, `cloud_primary=true`, or Work not removed;
14. task-to-Stage policy other than controlled cherry-pick or automatic rebase/conflict/force enabled.

For owned paths, reject only contract-level overlaps that are mechanically obvious from exact paths or identical declared patterns. Do not build a generic glob algebra engine; runtime ownership checks remain the Supervisor boundary responsibility.

Normalized output must omit static Git SHA fields if hostile/legacy input supplies them.

## Coding plan

1. Read the current reader and tests completely.
2. Read the accepted Stage Router Contract completely and extract only fields actually needed by the Supervisor.
3. Replace old single-task requirements with Stage/DAG validation.
4. Implement uniqueness/reference/cycle checks with simple `Set`/`Map` and DFS/Kahn logic; no dependency.
5. Keep errors specific enough for operator diagnosis and focused tests.
6. Add positive coverage for the accepted four-task Router and negative coverage for every real boundary above.
7. Preserve CLI behavior: one path argument in, one normalized JSON line out.
8. Run focused verification and inspect final diff for scope leakage.

## Model-specific guidance

This task uses a strong coding model with high reasoning because parser mistakes can make the scheduler unsafe. Spend reasoning on invariants and negative tests, not abstractions. Prefer explicit code over frameworks. Do not add Zod/AJV or package dependencies.

## Non-goals

- no Bridge implementation;
- no GitHub Actions changes;
- no docs migration;
- no product runtime changes;
- no schema generator;
- no generic plugin/provider layer;
- no hash index/cache;
- no compatibility layer for the unmerged old single-task Router;
- no static Git SHA trust.

## Verification

Must pass:

```text
node --test tests/router-contract-reader.test.ts
npm run typecheck
git diff --check
```

Do not alter package manifests to satisfy the `.mjs` boundary.

## Stop / needs_decision

Return `needs_decision` rather than expanding scope if correct implementation requires changing the accepted Router schema, modifying any file outside owned paths, adding a dependency, or introducing a compatibility/fallback version not in this Contract.

## Required Coding Result

```yaml
task_id: T01-router
dispatch_id: <dispatch id>
reported_base_sha: <dispatch base>
reported_task_head_sha: <worker-reported sha>
changed_files:
  - <paths>
verification:
  router_tests: <pass/fail + command>
  typecheck: <pass/fail + command>
  diff_check: <pass/fail + command>
status: candidate_ready | blocked | needs_decision
notes: <only material implementation facts>
```

The Supervisor independently re-reads all Git facts.