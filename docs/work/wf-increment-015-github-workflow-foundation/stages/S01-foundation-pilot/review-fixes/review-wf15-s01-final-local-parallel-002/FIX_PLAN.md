# S01 Review Fix Plan 2 — Stage-generic dispatch, recovery Git binding, repository bootstrap

> Review ID: `review-wf15-s01-final-local-parallel-002`  
> Source PR: `Reminnd/coding-room#4`  
> Source reviewed Stage SHA: `dbed43f02a8b748c6503f1f27b9da8f9578ef140`  
> Formal Review decision: `changes_requested`  
> Status: `Proposed`  
> Planning change authorized: `true`  
> Coding authorized: `false`  
> Formal Review authority: `chatgpt_fixed_chat`

## 1. Purpose

This plan fixes only the three findings from the fixed-Chat formal Review of the exact PR #4 head above.

It does not reopen the already accepted historical Fix Plan:

```text
review-wf15-s01-final-local-parallel-001
```

That directory remains immutable review history. This is a new Fix revision.

The requested result is the smallest correct path from the current S01 candidate to a reusable S02+ Local Bridge control plane:

```text
R1 — make the existing Actions Stage dispatch path actually Stage-generic
R2 — bind restart recovery to the current dispatch and necessary Git facts
R3 — prepare required repository Actions permissions before the first Stage push
```

No implementation Coding is authorized by this document until the user explicitly accepts the revised Fix Plan / Router / Task Contracts.

## 2. Frozen architecture that must not change

```text
GitHub/Git persistent facts
→ Local Bridge
→ Local Codex Workers
→ mechanical gate
→ Supervisor Integration
→ controlled Task→Stage cherry-pick
→ Stage verification
→ fixed Chat formal Review
→ user accepts exact SHA
→ non-force FF main
```

Still frozen:

```yaml
execution_surface: local_codex
scheduler: dependency_dag
safe_parallelism_first: true
worker_worktree_isolation: required
worker_task_branch_isolation: required
git_fact_authority: true
formal_review_authority: chatgpt_fixed_chat
fix_policy: always_confirm
automatic_rebase: false
automatic_conflict_resolution: false
force_push: false
local_state_database: false
hash_index: false
```

S01 continues to use the already accepted one-time Bootstrap-B review path. This Fix does not create an S00 or an S01 runtime fallback.

## 3. Confirmed findings and revised disposition

| Finding | Severity | Revised disposition |
|---|---|---|
| R1 — `.github/workflows/codex-supervisor-dispatch.yml` listens only to the S01 Stage branch and hard-codes the S01 Router path | High | Generalize the existing workflow to the repository Stage branch convention. No second workflow. |
| R2 — restart reconstruction accepts Bridge PR-comment task state without binding it to the current Router dispatch and necessary Git facts | High | Filter recovered events to the current `task_id + dispatch_id`, then verify recovered integrated mappings against exact remote Task ref and current Stage history. |
| R3 — first Stage push can fail before Bridge discovery because repository Actions PR-creation permission was never prepared | High | Add deterministic repository bootstrap before Stage creation/push. Configure only missing required repository settings, once/idempotently; normal Stage runs only assert readiness. |

## 4. R1 — Stage-generic Actions dispatch

### 4.1 Required behavior

Keep the single existing workflow:

```text
.github/workflows/codex-supervisor-dispatch.yml
```

Change the push trigger from one S01 branch to the repository Stage namespace:

```text
stage/**
```

The Stage branch contract remains:

```text
stage/<workflow_id>/<stage_id>
```

For a push to that namespace, derive the Router path deterministically from the branch convention:

```text
docs/work/<workflow_id>/stages/<stage_id>/ROUTER_CONTRACT.md
```

Then use the existing dependency-free Router reader and require the normalized Router facts to match:

```yaml
repository: actual repository
workflow_id: derived workflow_id
stage_id: derived stage_id
stage_branch: actual pushed Stage branch
```

Do not scan the repository for candidate Routers and do not add a Router registry.

### 4.2 Preserve existing correct gates

Do not weaken:

```text
new Stage head → invalidate stale Ready/chat-review
exact triggering SHA checkout
Draft Stage PR while active
exact candidate SHA verification
re-read current PR head after verification
Ready + chat-review only when verified SHA is still exact PR head
final head-drift guard
```

The `repository_dispatch(stage_candidate_ready)` verifier remains the single normal S02+ candidate verifier.

### 4.3 Non-goals

```text
no second workflow
no workflow_dispatch fallback
no S01 special runtime branch
no dynamic workflow generation
no directory search for Router files
no compatibility trigger for the old S01-only behavior
```

## 5. R2 — Restart recovery must bind GitHub handoff state to Git facts

### 5.1 Current boundary

PR comments remain durable GitHub handoff facts, but they are an external input boundary and cannot by themselves prove that a Task is still integrated in the current Stage.

### 5.2 Current-dispatch filtering

After the current Router is loaded, recovery must consider only Bridge events whose:

```yaml
task_id: matches a current Router task
dispatch_id: exactly matches that task's current dispatch_id
status: is one of the Bridge's accepted task lifecycle statuses
```

Historical comments from an older dispatch of the same `task_id` must not make the current task `integrated`.

Do not create a new event version or compatibility parser.

### 5.3 Minimal Git revalidation for recovered `task_integrated`

For every recovered integrated mapping, perform only the Git checks necessary to establish current durable state:

```text
1. read the exact remote Task branch ref once
2. require remote Task ref == recorded source_task_sha
3. require recorded stage_commit_sha exists in current fetched Stage history
4. require stage_commit_sha is an ancestor of the current actual Stage head
5. re-read that Stage commit's changed files and require they remain inside the task's Router ownership
```

If any required fact disagrees:

```text
needs_decision
```

Do not silently downgrade the task to `not_started`, and do not automatically recreate/replay the task.

### 5.4 Deliberate exclusions

Do not add:

```text
patch-id / hash index
full-history audit
re-run of old task tests on every restart
polling
retry/backoff
automatic stale recovery
automatic branch repair
second persistent state store
```

The goal is not to distrust every historical fact. The goal is to prevent a current Router run from treating stale or Git-inconsistent comments as current integration truth.

## 6. R3 — Repository Bootstrap before Stage creation

### 6.1 Why normal Bridge startup is too late

The normal Bridge currently discovers work only after Actions has created/located the Stage PR and published the Local dispatch handoff.

Therefore repository permission preparation cannot exist only inside normal `start` / `run-once`: on a repository whose Actions PR-creation setting is missing, the first Stage push may fail before the Bridge can discover anything.

Repository preparation must happen before the first Stage branch push that depends on this workflow.

### 6.2 Add one deterministic bootstrap command

Extend the existing Local Bridge CLI with one repository-preparation mode:

```text
codex-github-bridge bootstrap
```

The Root Supervisor / repository-adoption flow invokes it after repository discovery and before creating or pushing a new Stage branch.

This is not a new scheduler or service. It is an idempotent external-boundary preparation command.

### 6.3 Required repository facts

Bootstrap checks only the repository settings proven necessary by the current workflow:

```yaml
github_actions_enabled: true
actions_can_create_or_approve_pull_requests: true
```

Implementation uses the current GitHub repository Actions settings APIs through the existing `gh` boundary.

For the workflow-permission update, preserve the repository's existing `default_workflow_permissions`; do not broaden it to `write` merely to make this workflow work. The workflow continues to declare its own minimum job permissions.

### 6.4 Idempotent behavior

```text
read current repository settings
→ already correct: no write
→ missing setting + current gh credential may administer repository: change only that setting
→ re-read each mutated setting exactly once
→ require expected value
```

If GitHub rejects the mutation because the local credential lacks repository administration permission or an organization/enterprise policy prevents the repository-level change:

```text
needs_decision
```

Do not attempt to modify organization or enterprise policy.

### 6.5 Normal Stage startup

`start` and `run-once` perform a read-only repository prerequisite check before Router scheduling:

```text
ready → continue
missing/drifted → needs_decision
```

They do not repeatedly rewrite repository settings.

The mutation path remains `bootstrap`; normal Stage execution is read/assert-only.

### 6.6 Supervisor responsibility

Before a new Stage branch is created/pushed, the Root Supervisor must ensure:

```text
repository discovered
→ deterministic Bridge bootstrap passes
→ only then create/push Stage Router/branch
```

The Supervisor Agent coordinates this step but does not improvise GitHub permission changes itself. The deterministic Bridge command owns the external write.

### 6.7 Deliberate exclusions

Do not add:

```text
PAT/token creation
credential storage
secret manager
permission database
organization-policy mutation
enterprise-policy mutation
retry loop
permission repair daemon
per-Stage permission rewrite
generic repository settings manager
```

## 7. Fix task structure

Use three tasks only.

```text
Initial Ready Set
{
  F05-actions-stage-generic,
  F06-bridge-recovery-bootstrap
}

F05-actions-stage-generic ───────┐
                                ├─→ F07-authority-lifecycle-docs
F06-bridge-recovery-bootstrap ──┘
```

F05 and F06 have disjoint ownership and may run in parallel. F07 waits for both because it records actual implemented lifecycle behavior.

### F05 — Actions Stage-generic dispatch

```yaml
task_id: F05-actions-stage-generic
depends_on: []
owns:
  - .github/workflows/codex-supervisor-dispatch.yml
model_policy: coding_strong
reasoning_effort: medium
```

Required verification:

```text
git diff --check
workflow trigger/path derivation audit
Router identity binding audit
stale-ready regression audit
exact-head gate regression audit
```

### F06 — Bridge recovery + repository bootstrap

R2 and R3 stay in one task because they share the same Bridge/GitHub/CLI ownership. Splitting them would serialize two workers over the same files without gaining safe parallelism.

```yaml
task_id: F06-bridge-recovery-bootstrap
depends_on: []
owns:
  - tools/codex-github-bridge/**
model_policy: coding_strong
reasoning_effort: high
```

Required verification:

```text
node --test tools/codex-github-bridge/tests/*.test.mjs
git diff --check
current-dispatch recovery test
stale-dispatch rejection test
recovered remote Task SHA mismatch test
recovered Stage ancestry mismatch test
repository bootstrap already-ready/no-write test
repository bootstrap minimal-write + one re-read test
repository bootstrap permission/policy failure → needs_decision test
normal start/run-once preflight is read-only test
```

Use temporary Git repositories/remotes for Git topology. Stub only the GitHub API boundary needed for deterministic permission tests; do not add a generic mock framework.

### F07 — Authority/lifecycle documentation sync

```yaml
task_id: F07-authority-lifecycle-docs
depends_on:
  - F05-actions-stage-generic
  - F06-bridge-recovery-bootstrap
model_policy: fast_general
reasoning_effort: low
```

Limit documentation changes to Current files that must describe the implemented behavior, especially:

```text
docs/work/wf-increment-015-github-workflow-foundation/SUPERVISOR_ROUTER_AGENT.md
docs/work/wf-increment-015-github-workflow-foundation/PLAN.md
docs/work/wf-increment-015-github-workflow-foundation/EXECUTION_PLAN.md
docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/STAGE.md
docs/documents/agent-guides/CODEX_SUPERVISOR_ROUTER.md
docs/documents/agent-guides/GIT_AND_PARALLEL_WORKFLOW.md
```

Do not rewrite unrelated historical documents.

Docs must state:

```text
Repository bootstrap precedes first/new Stage push.
Normal Bridge Stage execution does not rewrite permissions.
The existing single Actions workflow handles Stage branches generically.
Restart recovery uses current dispatch identity plus necessary Git facts.
S01 remains the one-time Bootstrap-B exception; S02+ uses normal Actions candidate verification.
```

## 8. Integration and execution rules

For every Coding task after explicit user confirmation:

```text
independent Fix branch + worktree
→ Worker implementation
→ focused verification
→ exactly one candidate commit
→ Bridge re-reads Git/process facts
→ Supervisor Integration
→ task branch push
→ one exact remote Task ref confirmation
→ controlled cherry-pick into Stage
→ Stage push
→ one exact remote Stage ref confirmation
→ record source_task_sha → stage_commit_sha
```

No formal Review occurs at Task level.

F07 begins only after F05 and F06 are actually integrated.

## 9. Repository bootstrap execution point for this Fix

Implementing the `bootstrap` command is not enough to prove the repository is prepared.

After F06 is integrated into the S01 Stage and before the next lifecycle step that relies on future Stage PR creation, the Root Supervisor must run the deterministic bootstrap command once against `Reminnd/coding-room` and record only:

```yaml
repository: Reminnd/coding-room
actions_enabled: true
actions_pr_creation_permission: true
mutation_performed: true | false
status: ready
```

If it returns `needs_decision`, stop. Do not ask a Worker to bypass the repository policy.

This external preparation is not a Worker Coding action and does not authorize any `main` write.

## 10. Final S01 verification after Fix integration

After F05/F06/F07 are integrated and repository bootstrap is ready:

```text
1. re-read exact remote Stage SHA
2. run Bootstrap-B mechanical suite against that exact SHA
3. require PR #4 current head == verified SHA
4. fixed Chat performs a new formal Review of the exact PR head/full diff
5. user accepts exact SHA
6. only then non-force FF exact accepted SHA to main
```

Mechanical suite remains:

```text
node --test tests/router-contract-reader.test.ts
node --test tools/codex-github-bridge/tests/*.test.mjs
npm run typecheck
npm test
git diff --check
```

Do not fake an S01 `Ready + chat-review` event. Bootstrap-B remains the approved S01 lifecycle exception.

## 11. Acceptance criteria

This Fix is ready for formal re-Review only when:

- the single Actions workflow handles the repository Stage namespace instead of only S01;
- Router path is derived deterministically from the Stage branch and exact Router identity is validated;
- stale Ready/exact-head gates remain intact;
- recovery ignores events from a non-current dispatch;
- recovered integrated tasks are bound to exact remote Task ref and current Stage ancestry/ownership;
- repository bootstrap prepares required Actions repository settings before new Stage push;
- bootstrap writes only when a required setting is missing and re-reads once after a write;
- normal `start` / `run-once` do not rewrite repository permissions;
- insufficient admin permission or owning policy restriction produces `needs_decision`;
- no new workflow, local DB, retry framework, hash index, permission manager, compatibility layer or automatic recovery is introduced;
- all focused and full mechanical verification passes at one exact Stage SHA;
- `main` remains unchanged until user accepts that exact SHA.

## 12. Authorization state

```yaml
review_id: review-wf15-s01-final-local-parallel-002
plan_status: Proposed
planning_change_authorized: true
coding_authorized: false
main_write_authorized: false
merge_authorized: false
next_required_decision: user_accepts_revised_fix_plan_before_router_task_contracts_and_coding
```
