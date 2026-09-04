# FIX TASK CONTRACT — F04-stage-lifecycle-docs

## Contract

```yaml
status: Accepted
confirmed_by_user: true
coding_authorized: true
review_id: review-wf15-s01-final-local-parallel-001
task_id: F04-stage-lifecycle-docs
type: Fix Task
scope: review_fixes_only
model_policy: fast_general
reasoning_effort: low
fallback_model_policy: none
base_sha: supplied_by_supervisor_after_dependencies_integrated
depends_on:
  - F01-actions-protocol
  - F02-bridge-delivery
  - F03-docs-authority
confirmed_findings:
  - F4
user_confirmed_solution:
  bootstrap: S01_option_B
  current_stage_tasks:
    - T01-router
    - T02-actions
    - T03-docs
    - T04-bridge
  legacy_room_status_pilot: deferred
```

## Worker role

You synchronize only the current Increment 15 lifecycle documents after the code/authority Fix tasks
have actually been integrated.

Do not redesign architecture and do not edit reusable authority/templates.

This task exists after the first Ready Set specifically so it can write real current lifecycle state
instead of guessing future Git facts.

## Goal

Make `PLAN.md`, `EXECUTION_PLAN.md`, and `STAGE.md` accurately describe:

- Final Local Parallel Bridge Migration as Current S01 work;
- T01/T02/T03/T04 as the active Foundation task set;
- old `T01-room-status-help` Pilot as deferred/non-dispatch Current work;
- the user-selected S01 Bootstrap-B Review path;
- normal S02+ Actions candidate verification after S01 enters main.

## Owned paths

Only:

```text
docs/work/wf-increment-015-github-workflow-foundation/PLAN.md
docs/work/wf-increment-015-github-workflow-foundation/EXECUTION_PLAN.md
docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/STAGE.md
docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/tasks/T01-room-status-help/**
```

Everything else is read-only.

## Runtime inputs

At dispatch, the Supervisor supplies actual integrated dependency facts for F01/F02/F03 and the
actual current Stage head.

Read actual Git facts rather than copying planning snapshots.

Do not attempt to write F04's own future Stage commit SHA into its commit; that would be self-referential.
Its final mapping is runtime GitHub/Supervisor evidence.

## Confirmed fix requirements

### A. PLAN.md

Current goal must be the Local Parallel Foundation migration, not Codex Cloud + Work + Pilot execution.

Describe the high-level accepted chain concisely:

```text
GitHub/Git facts
→ Local Bridge
→ Local Codex
→ Supervisor Integration
→ controlled Stage
→ S01 Bootstrap-B exact-SHA verification + fixed Chat Review
→ accepted S01 FF main
→ S02+ normal Actions candidate verification
```

Do not turn PLAN into a copy of the architecture document.

### B. EXECUTION_PLAN.md

Current execution plan must list the real S01 Foundation tasks:

```text
T01-router
T02-actions
T03-docs
T04-bridge
```

and describe their dependency/parallel model consistently with the frozen Stage Router.

Do not keep `T01-room-status-help` as the active Foundation execution task.

The old Pilot may be listed only as deferred follow-up.

### C. STAGE.md

Current Stage Contract/state must point to the Stage-level Router:

```text
docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/ROUTER_CONTRACT.md
```

not the old Pilot Router.

Record only actual lifecycle facts available at dispatch.
Do not invent future Fix/source/Stage SHAs.

State the S01 acceptance path exactly:

```text
all required Stage work integrated
→ freeze exact Stage SHA
→ local/equivalent mechanical verification against that exact SHA
→ fixed Chat formal Review of exact PR head/full diff
→ user accepts exact SHA
→ non-force FF main
```

State explicitly that S01 does not pretend the default-branch `repository_dispatch` verifier ran.

State normal S02+ path separately.

### D. Legacy `T01-room-status-help`

Ensure legacy Pilot Router material cannot be mistaken for the active S01 dispatch source.

Use the smallest status/document change needed:

```text
Deferred / Superseded for current S01 dispatch
```

Do not delete useful historical Pilot design unless already required by accepted docs policy.
Do not implement the Pilot.

## Coding/document plan — optimized for `fast_general`, low reasoning

1. Read actual current Stage head and dependency integration facts supplied by Supervisor.
2. Read current Stage-level Router and only the four owned lifecycle areas.
3. Replace old Cloud/Pilot Current state with the frozen Local Parallel S01 state.
4. Keep descriptions short; link to Current authority instead of duplicating architecture.
5. Mark old Pilot dispatch material deferred/superseded using the existing repository status style.
6. Add one concise S01 Bootstrap-B lifecycle paragraph.
7. Add one concise S02+ normal Actions paragraph.
8. Search only the owned lifecycle files for stale:
   - active `T01-room-status-help`;
   - active old Pilot Router path;
   - Codex Cloud primary;
   - Work dependency;
   - false claim that S01 Actions candidate verifier ran.
9. Run diff/consistency audits.

Reasoning priority:

```text
actual lifecycle facts
> Current/deferred status
> Bootstrap-B accuracy
> concise wording
```

Do not redesign anything.

## Non-goals

- no root authority/template edit;
- no `.github/**`;
- no Bridge source;
- no product code;
- no Pilot implementation;
- no final self-referential Stage SHA mapping;
- no new review state machine;
- no S00.

## Boundary policy

Git/GitHub runtime facts supplied at dispatch are external facts.
Use them as the source for current status.

Do not add validation logic to documentation tooling.

## Acceptance criteria

- PLAN describes Local Parallel S01, not Cloud-primary Pilot;
- EXECUTION_PLAN lists T01–T04 as current Foundation tasks;
- STAGE points to the Stage-level Router;
- legacy Pilot is not `dispatch_ready` Current work;
- S01 Bootstrap-B is accurately distinguished from S02+ Actions verification;
- no unverified future SHA is invented;
- diff stays in owned lifecycle paths.

## Verification

Required:

```text
git diff --check
Current Increment lifecycle consistency audit
active Router path audit
legacy Pilot dispatch_ready audit
Cloud/Work Current-language audit within owned files
Bootstrap-B wording audit
```

## Stop / needs_decision

Return `needs_decision` if the required lifecycle truth would need:

- a frozen architecture change;
- edits outside owned paths;
- inventing a future/self-referential SHA;
- product Pilot implementation.

## Required Coding Result

```yaml
review_id: review-wf15-s01-final-local-parallel-001
task_id: F04-stage-lifecycle-docs
dispatch_id: wf15-s01-f04-stage-lifecycle-docs-001
reported_base_sha:
reported_task_head_sha:
changed_files:
  - <owned lifecycle paths>
verification:
  diff_check:
  lifecycle_consistency:
  router_path_audit:
  legacy_pilot_audit:
  bootstrap_b_audit:
status: candidate_ready | blocked | needs_decision
notes: <material lifecycle facts only>
```
