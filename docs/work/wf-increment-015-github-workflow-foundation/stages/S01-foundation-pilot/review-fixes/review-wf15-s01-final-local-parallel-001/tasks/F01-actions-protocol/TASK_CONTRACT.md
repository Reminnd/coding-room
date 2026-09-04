# FIX TASK CONTRACT — F01-actions-protocol

## Contract

```yaml
status: Accepted
confirmed_by_user: true
coding_authorized: true
review_id: review-wf15-s01-final-local-parallel-001
task_id: F01-actions-protocol
type: Fix Task
scope: review_fixes_only
model_policy: coding_strong
reasoning_effort: medium
fallback_model_policy: none
base_sha: supplied_by_supervisor_at_dispatch
reviewed_source_candidate:
  task: T02-actions
  sha: 01708f647259973bae0ac59eafd09d344170063b
confirmed_findings:
  - F2
  - F3
user_confirmed_solution:
  bootstrap: S01_option_B
  dispatch_marker: "<!-- LOCAL_CODEX_DISPATCH_HANDOFF_V1 -->"
  candidate_event_type: stage_candidate_ready
  router_payload_field: router_contract_path
```

## Worker role

You fix only the GitHub Actions mechanical control-plane candidate already reviewed as T02.

Do not redesign the workflow. Preserve behavior that the formal review found correct:
stale-Ready invalidation and exact PR-head verification before/after mechanical verification.

You are not the formal Reviewer.

## Goal

Produce one corrected `.github/workflows/codex-supervisor-dispatch.yml` candidate that:

1. publishes the one Current Local Codex dispatch-ready marker/schema consumed by the Bridge;
2. consumes the one Current `stage_candidate_ready` repository-dispatch payload emitted by the Bridge;
3. keeps exact-SHA Stage verification and stale-readiness invalidation intact;
4. implements the normal S02+ verifier path without adding a fake S01 workaround.

## Owned path

Only:

```text
.github/workflows/codex-supervisor-dispatch.yml
```

Everything else is read-only.

## Required source reconstruction

Start from the Supervisor-provided Stage `base_sha` on a new independent Fix branch/worktree.

The reviewed T02 source candidate is read-only evidence:

```text
01708f647259973bae0ac59eafd09d344170063b
```

Materialize its workflow change without rewriting that branch, then apply only this Contract's fixes.
Because the reviewed candidate owns only this workflow path, `git cherry-pick --no-commit` is acceptable.
If Git reports a conflict, stop `blocked`; do not auto-resolve.

Create one final Fix candidate commit.

## Confirmed fix requirements

### A. Dispatch-ready marker and schema

Publish exactly:

```text
<!-- LOCAL_CODEX_DISPATCH_HANDOFF_V1 -->
```

Structured fields:

```yaml
status: dispatch_ready
repository:
pr_number:
workflow_id:
stage_id:
router_contract_path:
contract_commit_sha:
stage_branch:
stage_head_sha:
execution_surface: local_codex
```

Do not emit a second old marker.
Do not add compatibility parsing.

### B. Candidate event consumer

The verifier job is triggered by:

```yaml
repository_dispatch:
  types:
    - stage_candidate_ready
```

Use one payload schema:

```yaml
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

Replace any `router_path` use with `router_contract_path`.
Do not accept both field names.

### C. Preserve existing correct gates

Do not weaken or remove:

- Stage push invalidates stale readiness;
- PR returns to Draft when a new Stage head invalidates old readiness;
- `chat-review` is removed for stale head;
- candidate verification uses the exact candidate SHA;
- the current PR head is re-read after tests;
- Ready + `chat-review` occurs only if verified SHA still equals PR head;
- the final head-drift guard remains.

### D. Bootstrap B

Do not add:

```text
S01 special event
workflow_dispatch fallback
manual Actions fallback
comment-trigger fallback
if stage == S01 bypass
```

S01 is reviewed through the externally approved one-time Bootstrap-B lifecycle.
This workflow remains the normal S02+ candidate verifier once it exists on `main`.

## Coding plan — optimized for `coding_strong`, medium reasoning

1. Read the reviewed workflow completely before editing.
2. Write a tiny event/state table on scratchpad:
   `Stage push → dispatch_ready`; `repository_dispatch(stage_candidate_ready) → verify candidate`.
3. Identify the exact marker producer and every `client_payload` read.
4. Make the minimum substitutions needed to freeze the one marker and one payload name.
5. Preserve the existing stale-Ready and exact-head blocks byte-for-byte where possible.
6. Check GitHub permission scope only for actions actually performed.
7. Trace shell variables from event payload to checkout/Router read/PR-head comparison.
8. Do not abstract repeated shell snippets unless the existing workflow already has that abstraction.
9. Run the required audits and inspect the final diff for unrelated changes.

Reasoning priority:

```text
event correctness
> exact SHA propagation
> shell/YAML quoting
> permissions
> style cleanup
```

Do not spend reasoning on hypothetical retries or future event versions.

## Non-goals

- no Bridge source edit;
- no docs edit;
- no Router reader edit;
- no product code;
- no S00;
- no S01 runtime bypass;
- no fallback trigger;
- no marker/schema compatibility;
- no LLM in Actions;
- no self-hosted runner;
- no API key;
- no automatic Review/fix/merge;
- no `main` write.

## Boundary policy

External boundaries here are GitHub event payload, PR/API state, checkout SHA and shell process exit.

Once a payload field has been read into the job's controlled variables, do not add redundant
internal re-validation unless the value crosses another external boundary.

## Acceptance criteria

- exact Local dispatch marker is present;
- old dispatch marker is absent from Current workflow behavior;
- candidate verifier uses `stage_candidate_ready`;
- `router_contract_path` is used consistently;
- existing stale-ready invalidation still exists;
- existing exact-head verification still exists;
- no S01 fallback path is added;
- diff contains only the owned workflow file.

## Verification

Required:

```text
git diff --check
mechanical YAML syntax/indent audit
event trigger audit
payload field-name audit
shell variable/path audit
stale-ready regression audit
exact-PR-head gate regression audit
```

Use existing lint tooling only if already present. Add no dependency.

## Stop / needs_decision

Return `needs_decision` if the accepted fix would require:

- another workflow file;
- a Router schema change;
- a secret/API key;
- self-hosted infrastructure;
- formal Review authority change;
- automatic merge;
- modification outside the owned path.

## Required Coding Result

```yaml
review_id: review-wf15-s01-final-local-parallel-001
task_id: F01-actions-protocol
dispatch_id: wf15-s01-f01-actions-protocol-001
reported_base_sha:
reported_task_head_sha:
changed_files:
  - .github/workflows/codex-supervisor-dispatch.yml
verification:
  diff_check:
  yaml_audit:
  event_audit:
  payload_audit:
  stale_ready_regression:
  exact_head_regression:
status: candidate_ready | blocked | needs_decision
notes: <material workflow facts only>
```
