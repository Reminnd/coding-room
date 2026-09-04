# FIX TASK CONTRACT — F07-authority-lifecycle-docs

## Contract

```yaml
status: Proposed
plan_confirmed_by_user: true
confirmed_by_user: false
coding_authorized: false
review_id: review-wf15-s01-final-local-parallel-002
task_id: F07-authority-lifecycle-docs
dispatch_id: wf15-s01-f07-authority-lifecycle-docs-001
type: Fix Task
scope: current_authority_lifecycle_sync_only
contract_generation_source_stage_sha: c4a5faf9f51f6553e3c322adf5c13e3b3c40dbfe
base_sha: supplied_by_supervisor_after_F05_F06_integrated
model_policy: fast_general
current_resolved_model_hint: gpt-5.6-luna
reasoning_effort: low
fallback_model_policy: none
depends_on:
  - F05-actions-stage-generic
  - F06-bridge-recovery-bootstrap
confirmed_findings:
  - R1
  - R2
  - R3
```

`current_resolved_model_hint` is only the model currently mapped by `fast_general`. The Supervisor resolves actual capability at dispatch and must stop with `needs_decision` if the requested policy/effort is unavailable.

## Worker role

You are a focused Current-document synchronization Worker after F05 and F06 have actually been integrated.

Your job is to make existing Current authority/lifecycle docs accurately describe the implemented R1/R2/R3 behavior. Do not redesign architecture, rewrite history, clean up the whole repository or invent interfaces not present in the integrated code.

You are not the formal Reviewer.

## Owned paths

Only these six existing Current-doc candidates:

```text
docs/work/wf-increment-015-github-workflow-foundation/SUPERVISOR_ROUTER_AGENT.md
docs/work/wf-increment-015-github-workflow-foundation/PLAN.md
docs/work/wf-increment-015-github-workflow-foundation/EXECUTION_PLAN.md
docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/STAGE.md
docs/documents/agent-guides/CODEX_SUPERVISOR_ROUTER.md
docs/documents/agent-guides/GIT_AND_PARALLEL_WORKFLOW.md
```

These paths are the maximum allowed ownership set, not a requirement to touch all six. Modify only files whose Current statements actually need synchronization after reading integrated F05/F06 facts.

Do not edit Fix Plan/Router/Task Contracts in this Task.

## Runtime inputs

Supervisor supplies:

```yaml
current_stage_head:
F05:
  source_task_sha:
  stage_commit_sha:
  changed_files:
F06:
  source_task_sha:
  stage_commit_sha:
  changed_files:
```

Read actual integrated code/workflow before wording docs. Git facts outrank Worker result prose.

## Required Current facts to synchronize

### A. Stage-generic Actions

Where Current docs describe Actions dispatch, state the implemented behavior:

```text
one existing workflow handles stage/**
stage branch convention is stage/<workflow_id>/<stage_id>
workflow_id/stage_id and Router path are derived deterministically from actual Stage branch
normalized Router identity must equal GitHub event facts
existing stale-readiness and exact-head gates remain
```

Do not describe a second workflow, Router registry or fallback trigger.

### B. Restart recovery

Where Current docs describe Bridge restart/recovery, state:

```text
GitHub comments remain durable handoff input
current task state is selected by current dispatch identity
recovered task_integrated mappings are trusted only after minimum Git revalidation
remote Task SHA + Stage commit existence/ancestry + current ownership are required
inconsistency → needs_decision, not auto-repair/replay
```

Do not add local DB/hash index/patch-id/retry concepts.

### C. Repository Bootstrap lifecycle

Where Current docs describe repository adoption/Stage creation, state:

```text
repository discovery
→ explicit codex-github-bridge bootstrap
→ Repository Ready
→ create/push new Stage Router/branch
→ Actions dispatch
→ normal Local Bridge execution
```

Bootstrap may change only missing required repository Actions settings and is idempotent. Normal `start`/`run-once` perform read-only prerequisite checks and never use bootstrap as silent fallback.

Do not claim bootstrap actually returned `ready` unless the Supervisor supplies that runtime fact; this Task executes before the final explicit bootstrap run.

### D. S01 versus S02+

Keep the accepted distinction exact:

```text
S01: one-time Bootstrap-B exact-SHA mechanical verification + fixed Chat formal Review
S02+: normal Stage-generic Actions candidate verification path
```

Do not fake an S01 repository_dispatch verification event.

### E. Main semantics and Review authority

Current docs must remain consistent with:

```text
main = exact source already accepted by user
fixed Chat = sole formal Review Authority
Task candidates are never formally approved at Task level
user exact-SHA acceptance precedes non-force FF to main
```

## Document plan — optimized for `fast_general`, low reasoning

1. Read the actual F05/F06 Stage commits and the six owned files.
2. Make a compact fact checklist with only: generic Stage dispatch, recovery Git binding, bootstrap/preflight, S01/S02 distinction, main/review lifecycle.
3. For each owned file, change only stale Current statements relevant to that file's existing purpose.
4. Prefer one concise authoritative paragraph/link over duplicating implementation details.
5. Keep historical/Superseded documents historical; if a guide is already marked Superseded, change only the Current pointer needed to avoid contradiction.
6. Do not add exact future F07 or final Stage SHA into versioned docs.
7. Search the six owned files for stale claims after editing.
8. Run diff/consistency checks and stop.

Reasoning priority:

```text
actual integrated facts
> correct Current authority
> lifecycle distinction
> concise wording
> prose polish
```

No architecture exploration is needed.

## Non-goals

- no `.github/**` edits;
- no Bridge source/tests edits;
- no Fix Contract/history edits;
- no root-wide documentation authority cleanup;
- no `PROJECT_RULES.md`, `ARCHITECTURE.md`, `DEVELOPMENT_LOG.md` cleanup;
- no new ADR;
- no S02 Contract generation;
- no product code;
- no repository settings mutation;
- no formal Review;
- no `main` write.

## Boundary policy

Git/GitHub and integrated Stage facts supplied by Supervisor are external facts. Use them to choose wording. Do not build documentation validation tooling.

## Acceptance criteria

- docs that describe dispatch no longer imply S01-only Actions;
- docs that describe restart recovery state current-dispatch + minimum Git revalidation;
- docs that describe repository adoption place explicit bootstrap before new Stage push;
- normal `start`/`run-once` are described as read-only prerequisite checks;
- S01 Bootstrap-B remains distinct from S02+ normal Actions candidate verification;
- fixed Chat/exact-SHA/main semantics remain correct;
- no unimplemented future interface or future SHA is invented;
- no unrelated historical cleanup is performed;
- diff is limited to the six owned paths and ideally a smaller necessary subset.

## Verification

Required:

```text
git diff --check
Current authority/lifecycle consistency audit
repository bootstrap lifecycle wording audit
Stage-generic Actions wording audit
current-dispatch + Git recovery wording audit
S01 Bootstrap-B versus S02+ normal verification audit
exact-SHA/fixed-Chat/main semantics audit
```

## Stop / needs_decision

Return `needs_decision` if accurate documentation requires:

- modifying a file outside the six owned paths;
- documenting behavior not actually present in integrated F05/F06;
- changing frozen architecture or Review authority;
- inventing a future/self-referential SHA;
- beginning S02 work.

## Required Coding Result

```yaml
review_id: review-wf15-s01-final-local-parallel-002
task_id: F07-authority-lifecycle-docs
dispatch_id: wf15-s01-f07-authority-lifecycle-docs-001
reported_base_sha:
reported_task_head_sha:
changed_files:
  - <subset of six owned Current docs>
verification:
  diff_check:
  authority_lifecycle_consistency:
  bootstrap_wording:
  stage_generic_actions_wording:
  recovery_git_binding_wording:
  s01_s02_review_path_wording:
status: candidate_ready | blocked | needs_decision
notes: <material documentation facts only>
```
