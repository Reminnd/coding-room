# TASK CONTRACT — T03-docs

## Contract

```yaml
status: Accepted
confirmed_by_user: true
task_id: T03-docs
type: Implementation Task
model_policy: fast_general
reasoning_effort: low
fallback_model_policy: none
base_sha: supplied_by_supervisor_at_dispatch
```

## Worker role

You are the documentation/authority migration Worker. Do not redesign the frozen architecture; make Current repository documentation consistently describe the confirmed Local Parallel Codex architecture while preserving prior Cloud work only as historical/superseded evidence.

Do not perform formal Review and do not modify product runtime code.

## Goal

Migrate PR #3's Cloud/Work Current documentation into one coherent Local Codex + Local Bridge + DAG/Ready Set + GitHub/fixed-Chat control-plane description while preserving the useful `docs/work/` and Review-authority foundation.

## Owned paths

Writable:

- `AGENTS.md`
- `CLAUDE.md`
- `PROJECT_RULES.md`
- `docs/documents/**`
- `docs/work/README.md`
- `docs/work/_templates/**`
- `docs/work/wf-increment-015-github-workflow-foundation/PLAN.md`
- `docs/work/wf-increment-015-github-workflow-foundation/EXECUTION_PLAN.md`
- `docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/STAGE.md`
- `docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/tasks/T01-room-status-help/**`

Read-only dispatch-control artifacts:

- `docs/work/wf-increment-015-github-workflow-foundation/SUPERVISOR_ROUTER_AGENT.md`
- `docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/ROUTER_CONTRACT.md`
- the four new Task Contracts under `T01-router`, `T02-actions`, `T03-docs`, `T04-bridge`

## Frozen architecture to document

```text
ChatGPT fixed Chat
→ Architecture / Plan / accepted Contract
→ GitHub persistent facts
→ GitHub Actions mechanical Router validation / dispatch-ready
→ Local GitHub-Codex Bridge
→ dependency DAG / Ready Set
→ maximum safe parallel Local Codex Workers
→ independent worktrees / task branches
→ actual Git fact collection
→ Supervisor Integration Gate
→ controlled task-to-Stage cherry-pick
→ linear Stage branch
→ GitHub Actions Stage verification
→ exact-head Ready for Review + chat-review
→ fixed Chat formal Review
→ always-confirm Fix if needed
→ user acceptance of exact Stage SHA
→ exact accepted Stage SHA non-force fast-forward to main
```

Current authority/frozen rules:

- GitHub = persistent project-development facts/control plane.
- Local Bridge = orchestrator/scheduler/Git delivery boundary.
- Local Codex = implementation surface.
- fixed Chat = sole formal Review Authority.
- Supervisor Integration is not formal Review.
- Cloud Codex has no normal execution role and is not an architecture dependency.
- Work is removed from Current architecture.
- GitHub native notifications may notify but are not Authority.
- Task→Stage = controlled cherry-pick with `source_task_sha → stage_commit_sha` mapping.
- Stage→main = exact accepted SHA, non-force fast-forward only.
- no automatic rebase/conflict resolution/fix/merge.
- no local queue DB, provider registry, generic plugin bus, heartbeat/lease, auto retry framework or hash index.
- `room:status --help` remains a later Pilot and must not be implemented here.

## Mandatory migration

### Root authority

Update root authority files so no Current section says Codex Cloud is the primary Coding/Supervisor surface, Work is a dependency, or manual Cloud dispatch is the normal chain. Historical statements may remain when clearly historical.

### Stage 4 architecture

Create a Current Local Parallel architecture amendment/document superseding Cloud-primary execution while retaining fixed-Chat formal Review, GitHub persistent control plane, mechanical Actions, and no API-key Actions requirement. Mark old Cloud-specific architecture/supervisor guidance Superseded where appropriate instead of erasing history.

### Agent guides

Current guides must cover Local Bridge discovery, DAG/Ready Set, model policy + reasoning effort, worktrees, Task Git facts, Supervisor Integration, task push, controlled cherry-pick, conflict-stop, Stage verification/Ready invalidation and exact Stage→main FF.

### `docs/work/` templates

Migrate templates so:

- Task template includes `depends_on`, `owns`, `model_policy`, `reasoning_effort`, runtime base-SHA semantics, verification/result contract;
- Router template describes one Stage DAG rather than one top-level task;
- Execution Plan supports dependency DAG and Ready Sets;
- Stage template supports candidate-ready/integration facts;
- Chat Review handoff includes actual base/head branches/SHAs, PR and Stage Contract;
- Subtask template is removed from Current routing or marked Superseded because logical Task is the default scheduling unit.

Do not add compatibility machinery for the unmerged old Router.

### Current Increment 15 work docs

Update Plan/Execution/Stage so this Foundation migration is Current and the old `T01-room-status-help` Pilot is deferred. Legacy Pilot Router material must not remain an active `dispatch_ready` source.

## Coding/document plan

1. Read every owned PR #3 file before editing.
2. Normalize Current terminology: Local Codex, Local Bridge, DAG, Ready Set, Supervisor Integration, Stage, fixed Chat, GitHub Actions.
3. Update root authority first.
4. Add/mark Stage 4 architecture and agent-guide supersession.
5. Migrate templates without duplicating full architecture text everywhere.
6. Update Increment 15 Plan/Execution/Stage and defer Pilot.
7. Repository-wide Current-language scan for Cloud, Work, old single-task Router wording and manual dispatch; keep only clearly historical/superseded occurrences.
8. Run links/merge-marker/authority-map checks and inspect final diff for product-code leakage.

## Model-specific guidance

This task uses a fast general model at low reasoning because architecture is frozen. Do not re-litigate decisions. Spend effort on consistency, links, state labels and contradictory Current wording. Prefer concise authoritative wording.

## User-facing wording rule

Any UI/final-product copy touched incidentally must stay direct product language; do not introduce meta-language such as "根据需求", "为了满足规则", "适用条件是" or implementation-rule commentary.

## Non-goals

- no `.github/**` edits;
- no `tools/codex-github-bridge/**` edits;
- no `src/**` edits;
- no `tests/status-cli.test.ts` edits;
- no package manifests;
- no Pilot coding;
- no new architecture authority;
- no generic provider/plugin framework.

## Verification

Required:

```text
git diff --check
relative Markdown link audit
merge-marker audit
Current-language audit for Cloud/Work/manual Cloud dispatch
Documentation Map / docs index consistency audit
```

Reuse existing audit commands when available; do not add dependencies solely for docs validation.

## Stop / needs_decision

Return `needs_decision` if consistency requires changing a frozen architecture decision, deleting historical evidence instead of superseding it, modifying read-only dispatch-control artifacts, or touching product/runtime code.

## Required Coding Result

```yaml
task_id: T03-docs
dispatch_id: <dispatch id>
reported_base_sha: <dispatch base>
reported_task_head_sha: <worker-reported sha>
changed_files:
  - <paths>
verification:
  diff_check: <pass/fail>
  links: <pass/fail>
  merge_markers: <pass/fail>
  current_language_audit: <pass/fail>
  authority_map: <pass/fail>
status: candidate_ready | blocked | needs_decision
notes: <only material documentation state changes>
```

The Supervisor independently verifies Git facts and scope.