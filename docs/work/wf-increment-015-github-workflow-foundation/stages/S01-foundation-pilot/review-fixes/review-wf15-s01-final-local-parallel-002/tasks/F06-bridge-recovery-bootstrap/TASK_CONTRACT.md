# FIX TASK CONTRACT — F06-bridge-recovery-bootstrap

## Contract

```yaml
status: Proposed
plan_confirmed_by_user: true
confirmed_by_user: false
coding_authorized: false
review_id: review-wf15-s01-final-local-parallel-002
task_id: F06-bridge-recovery-bootstrap
dispatch_id: wf15-s01-f06-bridge-recovery-bootstrap-001
type: Fix Task
scope: review_fixes_R2_R3_only
contract_generation_source_stage_sha: c4a5faf9f51f6553e3c322adf5c13e3b3c40dbfe
base_sha: supplied_by_supervisor_from_exact_user_accepted_contract_bundle_head
model_policy: coding_strong
current_resolved_model_hint: gpt-5.6-sol
reasoning_effort: high
fallback_model_policy: none
depends_on: []
confirmed_findings:
  - R2
  - R3
```

`current_resolved_model_hint` is only the model currently mapped by the Bridge's `coding_strong` policy. The Supervisor must inspect actual Local Codex capability at dispatch; no silent fallback is allowed.

## Worker role

You fix two connected external-boundary problems inside the existing Local GitHub-Codex Bridge:

```text
R2 — restart reconstruction must bind comment handoff state back to current dispatch + necessary Git facts
R3 — repository prerequisites must be prepared explicitly before Stage creation/push
```

Keep them in one Task because both own the same Bridge/GitHub/CLI surface. Do not split them into competing Workers or redesign the Bridge.

## Owned paths

Only:

```text
tools/codex-github-bridge/**
```

Everything else is read-only.

Current relevant seams already exist in:

```text
github.mjs      — discover(), latestTaskStates(), gh boundary
controller.mjs  — load(), run(), current Router/Stage context
git.mjs         — fetchStage(), remote ref/Git topology helpers
cli.mjs         — start/run-once command boundary
errors.mjs      — needs_decision / blocked semantics
```

Reuse these seams unless the smallest correct implementation naturally adds a tiny Bridge-local helper.

## R2 goal — current-dispatch recovery bound to Git truth

PR comments remain durable handoff input, but they cannot alone prove that an old Task mapping is still valid for the current Router dispatch.

### A. Current handoff must match actual Stage/PR head

At discovery/load require the selected Local dispatch handoff's:

```text
stage_head_sha
```

to equal the actual current remote Stage head and current Stage PR head. A handoff for a superseded Stage SHA is not current work.

### B. Filter events by current Task + dispatch identity

After loading the current Router, reconstruct task state only from events where:

```yaml
task_id: matches a current Router task
dispatch_id: exactly equals that current Router task's dispatch_id
repository: current repository
workflow_id: current workflow_id
stage_id: current stage_id
stage_branch: current stage_branch
status: an accepted Bridge lifecycle status
```

Do not let an older dispatch of the same `task_id` mark the current task integrated/blocked/needs_decision.

Do not create a V2 event or compatibility parser.

### C. Revalidate recovered `task_integrated` mappings with minimum Git facts

For each recovered integrated event:

```text
1. read the exact remote Task branch ref once
2. require remote Task head == recorded source_task_sha
3. require recorded stage_commit_sha exists in the fetched current Stage history
4. require recorded stage_commit_sha is an ancestor of current actual Stage head
5. read that Stage commit's changed files
6. require changed files remain inside the current Router task owns
```

If any required fact disagrees:

```text
needs_decision
```

Do not silently downgrade to `not_started`, replay the Task, find a substitute commit, rebase, or rewrite historical comments.

Use current Router ownership and existing `assertOwnedFiles` semantics rather than creating a second scope checker.

### D. Do not over-audit history

Explicitly exclude:

```text
patch-id/hash index
full-history scan
automatic rerun of old verification
retry/backoff/polling
lease/heartbeat
automatic stale repair
second persistent state store
```

Read only the Git facts needed by current scheduling.

## R3 goal — deterministic Repository Bootstrap

Add one explicit CLI mode:

```text
bootstrap
```

The Root Supervisor/repository-adoption flow runs it before creating or pushing a Stage whose workflow may need to create a Draft Stage PR.

### A. Repository/Git prerequisite facts

Bootstrap checks only:

```text
local repository exists
origin exists
local origin target corresponds to requested GitHub repository
GitHub CLI authentication/access works for requested repository
```

Do not create credentials, PATs, secret storage or a generic repository manager.

### B. Required GitHub Actions capabilities

Check exactly:

```yaml
github_actions_enabled: true
actions_can_create_or_approve_pull_requests: true
```

Preserve the repository's current `default_workflow_permissions`; do not broaden it to `write` merely to satisfy PR creation.

### C. Bootstrap mutation semantics

```text
read current required setting
→ already correct: zero write
→ missing required setting: mutate only that setting once
→ re-read that mutated setting exactly once
→ require equality
```

If GitHub rejects the write due to repository administration permission or organization/enterprise policy:

```text
needs_decision
```

No retry, policy bypass or org/enterprise mutation.

### D. Normal `start` / `run-once`

Before scheduling, normal execution performs a **read-only** repository prerequisite check:

```text
ready → continue
missing/drifted → needs_decision
```

It must never call `bootstrap` as a hidden fallback and must never rewrite repository settings.

## Coding plan — optimized for `coding_strong`, high reasoning

### Phase 1 — map current facts before editing

1. Read `github.mjs`, `controller.mjs`, `git.mjs`, `cli.mjs`, `scope.mjs`, `errors.mjs` and existing Bridge tests completely.
2. Draw two small state diagrams only:
   - recovery: `GitHub handoff/comments → current Router → Git revalidation → scheduler state`;
   - bootstrap: `repository/origin + gh access + Actions settings → ready | one minimal mutation | needs_decision`.
3. Identify data already available in `BridgeController.load()` and avoid adding duplicate state objects.

### Phase 2 — recovery implementation

4. Bind handoff `stage_head_sha` to actual Stage/PR head at `load()` before trusting event state.
5. Change state reconstruction so it receives current Router/task identity instead of treating all parsed comments as authoritative.
6. Reuse existing GitRepository process boundary to add the smallest helpers needed for:
   - exact remote branch SHA read;
   - commit existence/ancestor test against fetched Stage;
   - changed-files read for one Stage commit.
7. Reuse `assertOwnedFiles` for current ownership verification.
8. Convert any recovered integrated mismatch directly to `needs_decision`; do not mutate history or restart the Task.

### Phase 3 — bootstrap implementation

9. Extend CLI parsing with exactly one new mode: `bootstrap`.
10. Keep repository discovery/identity checks at the CLI/GitHub boundary; do not create a new service hierarchy.
11. Add focused GitHubClient methods for only the current Actions settings APIs required by the Contract.
12. Implement a deterministic `bootstrap` path that writes only missing required settings and re-reads each mutated setting once.
13. Add a read-only prerequisite assertion used by `start`/`run-once`; make the call explicit before Router scheduling.
14. Preserve existing model inspection and scheduling paths; bootstrap should not launch Codex or load a Router.

### Phase 4 — focused tests

15. Use temporary Git repositories and bare remotes for ancestry/ref/changed-file tests.
16. Stub only the `gh` external boundary for repository-setting tests; do not build a generic API mock framework.
17. Prove success and rejection cases listed below.
18. Run the full Bridge test suite and inspect the diff for duplicate state, broad settings abstractions, retries or compatibility logic.

Reasoning priority:

```text
current dispatch identity
> Git topology truth
> external permission boundary
> exact needs_decision semantics
> existing scheduler preservation
> abstraction/style
```

## Required focused tests

Recovery:

```text
current dispatch integrated event + matching remote Task SHA + valid Stage ancestor + owned files → restored integrated
same task_id but stale dispatch_id → ignored for current dispatch
handoff stage_head_sha != current Stage/PR head → needs_decision
recovered remote Task SHA mismatch → needs_decision
missing recorded stage_commit_sha → needs_decision
stage_commit_sha not ancestor of current Stage head → needs_decision
recovered Stage commit changed file outside current owns → needs_decision
```

Repository bootstrap:

```text
already-ready repository → zero settings write
Actions disabled and writable → enable only required setting + one re-read
PR-creation permission missing and writable → change only required setting + one re-read
preserve default_workflow_permissions
admin permission/policy rejection → needs_decision
bootstrap performs no Worker launch/Router scheduling
start/run-once ready preflight → continue with no settings write
start/run-once missing/drifted prerequisite → needs_decision with no settings write
```

Regression:

```text
existing Ready Set behavior remains
existing task branch/worktree isolation remains
existing exact remote push confirmation remains
existing controlled cherry-pick/conflict abort remains
existing Supervisor Integration outcomes remain
no silent model fallback added
```

## Boundary policy

Validate only GitHub API/comment input, Git refs/topology, repository/origin identity, process exits and Actions settings responses. Trust already-validated internal Router/task objects.

## Acceptance criteria

- current dispatch handoff is bound to actual Stage/PR head;
- old dispatch comments cannot make a new dispatch Task terminal;
- recovered integrated mappings require exact remote Task SHA, valid Stage ancestry and current ownership;
- all recovery inconsistencies become `needs_decision` without automatic repair;
- `bootstrap` exists as one explicit deterministic CLI mode;
- bootstrap checks only current repository/GitHub/Actions prerequisites;
- already-ready bootstrap causes zero settings writes;
- missing setting is changed once and re-read once;
- normal `start`/`run-once` only assert prerequisites and never mutate settings;
- no PAT/secret manager/org-policy mutation/settings framework/retry/local DB/hash index is introduced;
- all changes stay under `tools/codex-github-bridge/**`.

## Verification

Required:

```text
node --test tools/codex-github-bridge/tests/*.test.mjs
git diff --check
```

## Stop / needs_decision

Return `needs_decision` if the correct implementation requires:

- package manifest/dependency changes;
- files outside `tools/codex-github-bridge/**`;
- local workflow database or hash index;
- automatic retry/rebase/conflict resolution/stale repair;
- PAT/API-key creation/storage;
- organization/enterprise policy mutation;
- generic repository-settings framework;
- fallback execution path;
- Router/event schema versioning.

## Required Coding Result

```yaml
review_id: review-wf15-s01-final-local-parallel-002
task_id: F06-bridge-recovery-bootstrap
dispatch_id: wf15-s01-f06-bridge-recovery-bootstrap-001
reported_base_sha:
reported_task_head_sha:
changed_files:
  - <tools/codex-github-bridge paths>
verification:
  bridge_tests:
  diff_check:
recovery_evidence:
  current_dispatch_filter:
  handoff_stage_head_binding:
  remote_task_sha_binding:
  stage_ancestry_binding:
  owned_paths_binding:
bootstrap_evidence:
  already_ready_zero_write:
  minimal_write_one_reread:
  default_workflow_permissions_preserved:
  permission_policy_failure_needs_decision:
  normal_start_run_once_read_only:
status: candidate_ready | blocked | needs_decision
notes: <material Git/GitHub/process/repository facts only>
```
