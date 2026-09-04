# FIX TASK CONTRACT — F02-bridge-delivery

## Contract

```yaml
status: Accepted
confirmed_by_user: true
coding_authorized: true
review_id: review-wf15-s01-final-local-parallel-001
task_id: F02-bridge-delivery
type: Fix Task
scope: review_fixes_only
model_policy: coding_strong
reasoning_effort: high
fallback_model_policy: none
base_sha: supplied_by_supervisor_at_dispatch
reviewed_source_candidate:
  task: T04-bridge
  sha: 6dfa570bf1f9240caf9f32d6140eacaa18bdf8c3
confirmed_findings:
  - F2
  - F3
  - F5
user_confirmed_solution:
  bootstrap: S01_option_B
  dispatch_marker: "<!-- LOCAL_CODEX_DISPATCH_HANDOFF_V1 -->"
  candidate_event_type: stage_candidate_ready
  router_payload_field: router_contract_path
  remote_push_confirmation: one_exact_remote_ref_read
```

## Worker role

You fix only the reviewed Local GitHub-Codex Bridge candidate.

Preserve the already-correct Ready Set scheduler, ownership isolation, model-routing behavior,
Supervisor Integration statuses, conflict abort behavior, and `start` / `run-once` semantics.

Do not redesign the Bridge into a generic agent framework.

## Goal

Produce one corrected Bridge candidate that:

1. discovers the exact Current Local dispatch-ready handoff published by Actions;
2. emits the exact normal S02+ `stage_candidate_ready` repository-dispatch event when Stage is complete;
3. confirms task-branch and Stage pushes by one exact remote-ref re-read;
4. keeps Git/GitHub/process data as boundary facts without redundant internal validation.

## Owned paths

Only:

```text
tools/codex-github-bridge/**
```

Everything else is read-only.

## Required source reconstruction

Start from the Supervisor-provided Stage `base_sha` on a new independent Fix branch/worktree.

Materialize the reviewed T04 candidate:

```text
6dfa570bf1f9240caf9f32d6140eacaa18bdf8c3
```

without rewriting its source branch, then apply only F2/F3/F5.

Because the source candidate owns only `tools/codex-github-bridge/**`,
`git cherry-pick --no-commit` is acceptable.

Git conflict => abort/blocked. No automatic resolution.

Create one final Fix candidate commit.

## Confirmed fix requirements

### A. Dispatch discovery marker

Search exactly:

```text
<!-- LOCAL_CODEX_DISPATCH_HANDOFF_V1 -->
```

and require the structured Local handoff's normal Current status:

```yaml
status: dispatch_ready
```

Read the Current field:

```text
router_contract_path
```

Do not accept the old marker.
Do not support alias fields.

Update focused tests so they prove the Current marker and reject/ignore the old handoff as appropriate
to existing discovery semantics without creating a compatibility layer.

### B. Stage candidate publication

When the Stage becomes `candidate_ready`, preserve the durable candidate comment/label facts already
used by the Bridge, and additionally publish exactly one GitHub repository dispatch:

```yaml
event_type: stage_candidate_ready
client_payload:
  status: candidate_ready
  repository:
  pr_number:
  workflow_id:
  stage_id:
  router_contract_path:
  stage_branch:
  stage_head_sha:
```

Use actual runtime candidate facts already held by the Bridge.
Do not create a second candidate schema or second scheduler state.

No retries. A GitHub/API publication failure is a real external-boundary failure and must surface.

S01 note:

```text
the event may not start candidate verification before the workflow exists on main;
do not add special-case code for that;
Bootstrap-B review handles S01 externally;
the event is the Current S02+ path.
```

### C. Exact remote ref after task push

After the existing task branch push returns success:

```text
read remote task ref exactly once
→ require remote SHA == expected source_task_sha
```

Use the existing Git/process adapter and the smallest command needed, for example an exact
`git ls-remote` ref query or equivalent existing Git boundary.

Mismatch/failure => report failure/blocked.
Do not retry or poll.

### D. Exact remote ref after Stage push

After Stage push:

```text
read remote Stage ref exactly once
→ require remote SHA == local stage_commit_sha
```

Only after equality may integration mapping/delivery facts be treated as durably pushed.

No retry/poll.

### E. Preserve correct implementation

Do not disturb:

- dependency DAG / Ready Set behavior;
- safe parallel ownership gate;
- one Worker = one task branch + worktree;
- actual Git fact collection after Worker completion;
- exactly three Supervisor Integration outcomes;
- controlled cherry-pick;
- conflict abort;
- no silent model fallback;
- `start` immediate dependency unlock;
- `run-once` one-set semantics.

## Coding plan — optimized for `coding_strong`, high reasoning

1. Read the reviewed Bridge implementation and tests fully.
2. Draw only three external-boundary flows:
   - GitHub dispatch comment → discovery;
   - Stage complete → GitHub candidate event;
   - local push → remote ref equality.
3. Locate the smallest existing functions owning those boundaries (`github` delivery/discovery and `git` push).
4. Change marker/field names at the boundary, not throughout unrelated internal structures.
5. Add repository-dispatch publication to the existing candidate-delivery function rather than building a new publisher subsystem.
6. Add one reusable exact-remote-ref read primitive in the Git adapter if both task/Stage pushes can share it naturally.
7. Call it immediately after each successful push and compare with the already-known expected SHA.
8. Use real temporary bare remotes for Git tests; prove one success and one mismatch/failure boundary where practical.
9. Extend GitHub adapter tests to prove exact event type/payload and exact Local dispatch marker.
10. Run the complete Bridge test suite and diff check.
11. Inspect final diff for provider registry, retry loop, duplicated state or schema compatibility; remove any such expansion.

Reasoning priority:

```text
Git topology and remote truth
> event/payload contract
> process boundary behavior
> regression preservation
> abstraction/style
```

## Non-goals

- no Actions workflow edit;
- no docs edit;
- no Router schema edit;
- no Local DB/queue;
- no retry/backoff;
- no webhook/tunnel;
- no provider/plugin framework;
- no stale-recovery framework;
- no automatic rebase/conflict resolution;
- no formal Review;
- no `main` write;
- no S01 runtime special-case.

## Boundary policy

Validate:

- GitHub API/comment payload when read;
- exact Git command/process result;
- exact remote ref returned after push.

Trust the Bridge's already-validated internal candidate/task objects.
Do not revalidate every internal field before calling another internal function.

## Acceptance criteria

- discovery uses only `LOCAL_CODEX_DISPATCH_HANDOFF_V1`;
- candidate publication emits exact `stage_candidate_ready`;
- payload uses `router_contract_path`;
- task push is followed by one exact remote-ref equality check;
- Stage push is followed by one exact remote-ref equality check;
- no retry/poll/fallback exists;
- all existing Bridge behavioral tests still pass;
- focused new regression tests cover F2/F3/F5;
- diff stays under `tools/codex-github-bridge/**`.

## Verification

Required:

```text
node --test tools/codex-github-bridge/tests/*.test.mjs
git diff --check
```

Tests must include:

```text
Current Local dispatch marker discovery
old marker not treated as Current
stage_candidate_ready repository dispatch exact event/payload
task push remote SHA confirmation
Stage push remote SHA confirmation
existing Ready Set/start/run-once/Supervisor/cherry-pick/conflict behavior
```

Use real temporary Git repositories/remotes for Git topology.

## Stop / needs_decision

Return `needs_decision` if the confirmed fix requires:

- package manifest edits;
- a second GitHub workflow;
- Router schema change;
- persistent local state;
- undocumented Codex flags;
- fallback/retry machinery;
- changes outside `tools/codex-github-bridge/**`.

## Required Coding Result

```yaml
review_id: review-wf15-s01-final-local-parallel-001
task_id: F02-bridge-delivery
dispatch_id: wf15-s01-f02-bridge-delivery-001
reported_base_sha:
reported_task_head_sha:
changed_files:
  - <tools/codex-github-bridge paths>
verification:
  bridge_tests:
  diff_check:
boundary_evidence:
  dispatch_marker:
  candidate_event:
  task_remote_sha_check:
  stage_remote_sha_check:
status: candidate_ready | blocked | needs_decision
notes: <material Git/GitHub/process facts only>
```
