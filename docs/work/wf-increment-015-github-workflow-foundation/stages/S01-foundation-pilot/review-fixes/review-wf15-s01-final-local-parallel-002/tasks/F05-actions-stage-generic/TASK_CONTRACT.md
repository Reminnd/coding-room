# FIX TASK CONTRACT — F05-actions-stage-generic

## Contract

```yaml
status: Proposed
plan_confirmed_by_user: true
confirmed_by_user: false
coding_authorized: false
review_id: review-wf15-s01-final-local-parallel-002
task_id: F05-actions-stage-generic
dispatch_id: wf15-s01-f05-actions-stage-generic-001
type: Fix Task
scope: review_fixes_R1_only
contract_generation_source_stage_sha: c4a5faf9f51f6553e3c322adf5c13e3b3c40dbfe
base_sha: supplied_by_supervisor_from_exact_user_accepted_contract_bundle_head
model_policy: coding_strong
current_resolved_model_hint: gpt-5.6-sol
reasoning_effort: medium
fallback_model_policy: none
depends_on: []
confirmed_findings:
  - R1
```

`current_resolved_model_hint` is only the model currently mapped by the Bridge's `coding_strong` policy. The Supervisor must resolve the actual available model at dispatch; there is no silent fallback.

## Worker role

You own the smallest possible GitHub Actions fix for R1.

Do not redesign the workflow. Preserve the existing correct readiness invalidation, exact triggering SHA checkout, Draft Stage PR lifecycle, exact candidate verification, PR-head re-read and final head-drift guard.

You are not the formal Reviewer.

## Goal

Make the existing single workflow work for the repository Stage convention:

```text
stage/<workflow_id>/<stage_id>
```

For every legitimate Stage push:

```text
actual Stage branch
→ deterministically parse workflow_id + stage_id
→ derive docs/work/<workflow_id>/stages/<stage_id>/ROUTER_CONTRACT.md
→ read Router through the existing reader
→ require Router repository/workflow_id/stage_id/stage_branch == actual GitHub event facts
→ publish the existing Local dispatch handoff
```

Keep the existing `repository_dispatch(stage_candidate_ready)` verifier as the one normal S02+ candidate verifier.

## Owned path

Only:

```text
.github/workflows/codex-supervisor-dispatch.yml
```

Everything else is read-only.

## Required fix requirements

### A. Stage-generic push trigger

Replace the S01-only branch filter with the repository Stage namespace:

```yaml
on:
  push:
    branches:
      - "stage/**"
```

Do not add a second workflow or another trigger as fallback.

### B. Deterministic Stage branch parsing

Accept only the exact branch convention:

```text
stage/<workflow_id>/<stage_id>
```

The implementation should reject malformed branch shapes rather than scanning for a Router.

Derive:

```text
workflow_id
stage_id
router_contract_path=docs/work/<workflow_id>/stages/<stage_id>/ROUTER_CONTRACT.md
```

No Router directory scan, registry, nearest-match search or compatibility naming.

### C. Router identity binding

After reading the derived Router path with the existing `read-router-contract.mjs`, require:

```yaml
repository: $GITHUB_REPOSITORY
workflow_id: <derived workflow_id>
stage_id: <derived stage_id>
stage_branch: $GITHUB_REF_NAME
```

The branch-derived identity and Router identity must be equal before the handoff is published.

### D. Preserve existing correct lifecycle gates

Keep these semantics intact:

```text
new Stage head invalidates stale Ready/chat-review
exact triggering SHA checkout
active Stage PR remains Draft
candidate verifier checks exact candidate SHA
candidate verifier re-reads PR head after tests
Ready + chat-review only when verified SHA is still current PR head
final head-drift guard restores Draft/stale state when head changes
```

Do not weaken these blocks while generalizing Stage identity.

### E. No S01 runtime fallback

Do not add:

```text
workflow_dispatch fallback
manual trigger fallback
S01-specific bypass
old branch naming compatibility
second Router schema
dynamic workflow generation
```

S01 continues to use the approved Bootstrap-B review exception. The generalized workflow is the normal S02+ path once accepted into `main`.

## Coding plan — optimized for `coding_strong`, medium reasoning

1. Read the entire current workflow before editing.
2. Build a four-row scratch table: `event ref → parsed workflow_id → parsed stage_id → Router path`.
3. Change the push branch selector first; do not touch candidate verification yet.
4. Add the smallest shell parsing block that accepts exactly three Stage branch components (`stage`, workflow, stage) and rejects empty/extra components.
5. Derive one `ROUTER_PATH` value and reuse it in both current push-job places instead of hard-coding S01 twice.
6. Extend the existing Router equality checks to include derived `workflow_id` and `stage_id` as well as repository/stage_branch.
7. Leave the `repository_dispatch` verifier and stale/exact-head gates byte-identical where practical.
8. Trace all shell quoting and `$GITHUB_REF_NAME` usage once end-to-end.
9. Inspect the final diff for a second trigger, Router scan, compatibility branch or generalized framework; remove any such expansion.
10. Run exact required verification.

Reasoning priority:

```text
branch grammar + event identity
> Router path correctness
> exact SHA/readiness preservation
> shell/YAML quoting
> style cleanup
```

Do not spend reasoning on retry, future Router versions or dynamic discovery.

## Boundary policy

Validate only external event/ref/Router facts. Once branch components and normalized Router data are validated, trust them internally.

## Acceptance criteria

- push trigger handles `stage/**`, not only S01;
- exactly `stage/<workflow_id>/<stage_id>` is accepted;
- Router path is derived deterministically from those branch components;
- Router repository/workflow_id/stage_id/stage_branch match actual event facts;
- current S01 Stage branch still follows the same generic path;
- a representative future `stage/<workflow>/<S02-...>` branch follows the same generic path;
- malformed branch shapes are not accepted;
- stale readiness and exact PR-head gates remain intact;
- only the owned workflow file changes;
- no fallback/compatibility/registry/second workflow is added.

## Verification

Required:

```text
node --test tests/router-contract-reader.test.ts
git diff --check
Stage branch trigger/path derivation audit
Router identity binding audit
S01 valid-branch audit
representative S02 valid-branch audit
malformed-branch rejection audit
stale-ready regression audit
exact-PR-head gate regression audit
```

Do not add a dependency or a new test framework. If a mechanical shell snippet is used for branch parsing, verify it directly with representative strings rather than building a reusable framework.

## Stop / needs_decision

Return `needs_decision` if closing R1 requires:

- any file outside the owned workflow;
- a second workflow;
- Router schema change;
- API key/secret;
- dynamic Router registry/search;
- fallback trigger or legacy branch compatibility;
- weakening exact-head/stale-readiness behavior.

## Required Coding Result

```yaml
review_id: review-wf15-s01-final-local-parallel-002
task_id: F05-actions-stage-generic
dispatch_id: wf15-s01-f05-actions-stage-generic-001
reported_base_sha:
reported_task_head_sha:
changed_files:
  - .github/workflows/codex-supervisor-dispatch.yml
verification:
  router_reader_tests:
  diff_check:
  stage_branch_derivation:
  router_identity_binding:
  malformed_branch_rejection:
  stale_ready_regression:
  exact_head_regression:
status: candidate_ready | blocked | needs_decision
notes: <material workflow facts only>
```
