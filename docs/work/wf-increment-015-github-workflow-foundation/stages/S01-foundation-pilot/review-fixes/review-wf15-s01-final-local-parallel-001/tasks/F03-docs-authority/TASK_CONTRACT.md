# FIX TASK CONTRACT — F03-docs-authority

## Contract

```yaml
status: Accepted
confirmed_by_user: true
coding_authorized: true
review_id: review-wf15-s01-final-local-parallel-001
task_id: F03-docs-authority
type: Fix Task
scope: review_fixes_only
model_policy: fast_general
reasoning_effort: medium
fallback_model_policy: none
base_sha: supplied_by_supervisor_at_dispatch
reviewed_source_candidate:
  task: T03-docs
  sha: 17e36ca30083c4907142b791a85ae51fded33630
confirmed_findings:
  - F6
  - F7
user_confirmed_solution:
  router_contract_version: 1
  current_execution_surface: local_codex
  current_orchestrator: local_github_codex_bridge
  formal_review_authority: chatgpt_fixed_chat
  cloud_primary: false
  work_dependency: false
  logical_task_default: true
```

## Worker role

You fix only the authority/guides/templates portion of the reviewed T03 documentation candidate.

The architecture is frozen. This is consistency work, not architecture design.

Do not edit the current Increment 15 `PLAN.md`, `EXECUTION_PLAN.md`, `STAGE.md`, or legacy
`T01-room-status-help/**`; those belong to F04 after code fixes integrate.

## Goal

Make Current repository authority and reusable templates consistently describe the accepted
Local Parallel Codex architecture, while preserving old Cloud material only as clearly
Superseded/Historical evidence.

Fix the Router template back to the frozen V1 contract and remove Current routing that still sends
new development through Superseded Cloud/Subtask paths.

## Owned paths

Writable only:

```text
AGENTS.md
CLAUDE.md
PROJECT_RULES.md
docs/documents/**
docs/work/README.md
docs/work/_templates/**
```

Read-only:

```text
docs/work/wf-increment-015-github-workflow-foundation/PLAN.md
docs/work/wf-increment-015-github-workflow-foundation/EXECUTION_PLAN.md
docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/STAGE.md
docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/tasks/T01-room-status-help/**
current Stage Router / Task Contracts / Supervisor Router Agent
```

## Required source reconstruction

Start from the Supervisor-provided Stage base.

The reviewed T03 candidate is read-only evidence:

```text
17e36ca30083c4907142b791a85ae51fded33630
```

Materialize only this Contract's owned paths from that candidate, preserving its already-correct
Local Parallel architecture amendment and Current/Superseded direction.

Do not import lifecycle-doc paths owned by F04.

Apply only F6/F7 corrections and create one final Fix candidate commit.

## Frozen architecture vocabulary

Current normal chain:

```text
GitHub/Git persistent facts
→ Local GitHub-Codex Bridge
→ dependency DAG / Ready Set
→ Local Codex Workers
→ independent task branches/worktrees
→ actual Git/process facts
→ Supervisor Integration
→ controlled Task→Stage cherry-pick
→ source_task_sha → stage_commit_sha
→ Stage
→ mechanical Stage verification
→ fixed Chat formal Review
→ user accepts exact Stage SHA
→ non-force FF main
```

Also preserve:

```text
Supervisor Integration != formal Review
Cloud is not primary
Work is not a dependency
no local state DB
no hash index
no auto rebase
no auto conflict resolution
no auto fix/merge
```

## Confirmed fix requirements

### A. Router template remains V1

`docs/work/_templates/ROUTER_CONTRACT_TEMPLATE.md` must use:

```text
<!-- ROUTER_CONTRACT_V1 -->
contract_version: 1
```

It must model:

- one Stage DAG;
- tasks with `depends_on`, `owns`, `model_policy`, `reasoning_effort`, verification;
- controlled cherry-pick integration;
- fixed Chat formal Review;
- runtime facts supplied at dispatch/integration time.

Do not put static runtime values such as actual base SHA, worktree path, resolved model, task head SHA,
or Stage mapping into the versioned template.

Do not add a V1/V2 compatibility section.

### B. Current root routing

Fix Current routing in `AGENTS.md`, `CLAUDE.md`, `PROJECT_RULES.md` so normal GitHub Router /
development execution points to the Current Local Parallel supervisor/guide path, not the
Superseded Cloud Supervisor guide.

Historical Cloud references may remain only when explicitly labeled historical/superseded.

### C. Current agent guides

Ensure Current guides do not contradict:

```text
Local Bridge is orchestrator
Local Codex is implementation surface
fixed Chat is formal Review authority
GitHub/Git are persistent facts
```

If `CODEX_SUPERVISOR_ROUTER.md` is marked Superseded, no Current root route may present it as the
normal development control plane.

Do not delete useful historical evidence merely to eliminate a keyword.

### D. Reusable templates

Complete only the already-accepted migration:

- Execution Plan template supports dependency DAG / Ready Set;
- Stage template supports integration/candidate lifecycle facts without self-referential static SHA fields;
- Chat Review handoff template includes repository/PR, base branch/SHA, head branch/SHA, Stage Contract path, status;
- Task template retains `depends_on`, `owns`, model policy/reasoning, runtime base semantics and result contract;
- Subtask template is removed from Current routing or clearly Superseded;
- `docs/work/README.md` no longer presents Subtask as the normal default scheduling unit.

Do not invent another planning hierarchy.

### E. Git workflow guide

If the Current Git/parallel guide still says `Task/Subtask` is the normal Stage integration route,
change only the Current wording needed to make logical Task the default scheduling unit.

Do not rewrite unrelated historical sections.

## Coding/document plan — optimized for `fast_general`, medium reasoning

1. Build a small source-of-truth matrix from:
   - current Stage Router V1;
   - Current Local Parallel architecture amendment;
   - accepted Task Contracts;
   - Current root authority.
2. Materialize the reviewed T03 candidate only for owned paths.
3. Keep all already-correct Local Parallel/Superseded edits.
4. Fix the Router template first: V1, no static runtime facts.
5. Fix reusable templates against the frozen matrix.
6. Fix root Current routing so no active route points normal development to a Superseded Cloud guide.
7. Fix `docs/work/README.md` / Git guide Current Subtask wording.
8. Run targeted searches for:
   - `ROUTER_CONTRACT_V2`;
   - Current Cloud primary/manual Cloud dispatch;
   - Current Work dependency;
   - Current `Task/Subtask` default wording;
   - root route to Superseded Cloud supervisor.
9. Classify matches as Current vs Historical/Superseded before editing; do not blindly delete keywords.
10. Run link/merge-marker/authority audits and inspect final diff.

Reasoning priority:

```text
authority consistency
> template contract correctness
> Current/Superseded status
> links
> prose polish
```

Do not revisit architecture choices.

## User-facing wording rule

If any final product/UI wording is incidentally touched, keep it direct product language.
Do not introduce requirement/meta commentary.

## Non-goals

- no `.github/**`;
- no Bridge source;
- no `src/**`;
- no package manifests;
- no current Increment 15 PLAN/EXECUTION/STAGE edit;
- no legacy Pilot lifecycle edit;
- no Router V2;
- no compatibility layer;
- no new architecture authority;
- no product Pilot coding.

## Boundary policy

Documentation files are repository inputs/outputs; validate links and authority map at the document boundary.

Do not add exhaustive defensive validation scripts for internal document structures.
Reuse existing audits/searches where possible.

## Acceptance criteria

- no Current Router template V2;
- Router template is V1-compatible in terminology and static/runtime fact separation;
- root Current routing no longer sends normal development to a Superseded Cloud guide;
- reusable templates cover DAG/Ready Set, Stage facts, exact Chat handoff and logical Task default;
- Subtask is not a Current default scheduling unit;
- historical Cloud evidence remains clearly historical/superseded;
- no lifecycle docs owned by F04 are changed;
- diff stays inside owned paths.

## Verification

Required:

```text
git diff --check
relative Markdown link audit
merge-marker audit
ROUTER_CONTRACT_V2 Current audit
Cloud/Work Current-language audit
root routing vs Current/Superseded audit
Task/Subtask Current-default audit
Documentation Map / docs index consistency audit
```

Do not add a new dependency solely for docs validation.

## Stop / needs_decision

Return `needs_decision` if consistency would require:

- changing frozen architecture;
- modifying current Stage Router/Task Contracts/Supervisor Router;
- touching F04 lifecycle paths;
- deleting historical evidence rather than status-labeling it;
- product/runtime code changes.

## Required Coding Result

```yaml
review_id: review-wf15-s01-final-local-parallel-001
task_id: F03-docs-authority
dispatch_id: wf15-s01-f03-docs-authority-001
reported_base_sha:
reported_task_head_sha:
changed_files:
  - <owned documentation paths>
verification:
  diff_check:
  links:
  merge_markers:
  router_v1_audit:
  current_language_audit:
  authority_map:
  subtask_current_audit:
status: candidate_ready | blocked | needs_decision
notes: <material authority/template changes only>
```
