# TASK CONTRACT — T04-bridge

## Contract

```yaml
status: Accepted
confirmed_by_user: true
task_id: T04-bridge
type: Implementation Task
model_policy: coding_strong
reasoning_effort: high
fallback_model_policy: none
base_sha: supplied_by_supervisor_at_dispatch
```

## Worker role

You implement the Local GitHub-Codex Bridge only. The Bridge is the development orchestrator between GitHub persistent facts and Local Codex Workers. It does not generate product business code itself and it is not the formal Reviewer.

Keep the implementation small, explicit and repository-specific. Do not turn this into a generic agent platform.

## Goal

Create `tools/codex-github-bridge/**` implementing the minimum Local Parallel Codex control plane required by the accepted architecture:

- GitHub dispatch discovery;
- Stage Router loading;
- DAG/Ready Set scheduling;
- model policy + reasoning effort routing;
- isolated worktree/task branch lifecycle;
- Local Codex Worker launch;
- actual Git/process result collection;
- Supervisor Integration Gate;
- task branch push;
- controlled task→Stage cherry-pick;
- `source_task_sha → stage_commit_sha` mapping;
- Stage push and GitHub handoff updates;
- `start` and `run-once` CLI semantics.

## Owned paths

Only:

- `tools/codex-github-bridge/**`

Everything else is read-only context.

## Runtime constraints

Prefer Node 24 ESM and standard library only unless an existing repository dependency can be reused without manifest edits.

Do not modify `package.json` or `package-lock.json`.

External boundaries may invoke `git`, `gh`, local `codex`, filesystem and child-process APIs. Use existing local credentials; never persist GitHub tokens or ChatGPT/OAuth material in the repo or logs.

## Required CLI

Implement at minimum:

```text
codex-github-bridge start
codex-github-bridge run-once
```

A direct Node entry point is acceptable when package scripts cannot be changed within scope.

### `start`

```text
read GitHub/Git state
→ compute Ready Set
→ launch complete safe Ready Set concurrently
→ process any completed candidate immediately
→ integrate when dependencies are satisfied
→ recompute DAG immediately
→ launch newly-unblocked tasks without waiting for unrelated workers
```

### `run-once`

```text
read current GitHub/Git state once
→ compute current Ready Set
→ launch the whole Ready Set concurrently
→ wait for only this launched set
→ gate/integrate eligible completed tasks
→ do not launch a newly-created Ready Set
→ exit
```

## Logical modules

Code organization is implementation-defined, but responsibilities must be clear for:

1. GitHub Discovery
2. Router Loader
3. DAG Scheduler
4. Model Router
5. Worktree Manager
6. Codex Launcher
7. Task Result Collector
8. Supervisor Integration
9. Stage Integrator
10. GitHub Delivery
11. CLI

No provider registry or plugin bus.

## GitHub discovery

The Bridge actively reads GitHub using `gh`/GitHub API. GitHub never calls into the user's Windows machine.

Discover Stage PR/work where `codex-dispatch-ready` and structured handoff identify repository, workflow ID, Stage ID, Stage branch, Router Contract path and dispatch/contract Git facts.

Do not add webhook server, public port, tunnel or webhook secret.

## Router boundary

Use the accepted repository Router reader/output as the schema boundary rather than implementing a second competing schema. After successful parse, trust the normalized internal object; still validate runtime external facts such as actual branch SHA, filesystem/worktree state and process result.

## Ready Set scheduler

Keep only runtime in-memory task/process state. Persistent authority remains GitHub/Git.

Ready iff:

```text
not_started
AND all depends_on tasks integrated
AND owned paths do not overlap concurrently running tasks
```

No SQLite, Redis, dispatch DB, lease, heartbeat or distributed lock. On restart, reconstruct from GitHub/Git and accepted Contracts.

## Model Router

At dispatch:

1. inspect the actual installed Local Codex CLI and supported invocation surface;
2. validate that requested model policy can be mapped to an actually usable model;
3. pass requested reasoning effort only through a supported mechanism;
4. use only explicitly declared fallback policy when primary is unavailable;
5. without fallback, return `needs_decision`.

Never silently substitute another model. Do not invent undocumented Codex flags. Inspect actual local `codex --help` / relevant supported help first. If the installed CLI cannot satisfy the frozen model-routing rule safely, stop with `needs_decision` and report the exact missing capability.

## Worktree / task branch lifecycle

Each concurrent Worker must have its own task branch, worktree, and immutable dispatch `base_sha` from actual Stage state.

Initial independent Ready tasks share one frozen Stage base. A dependent task may start only after prerequisites are integrated, using an actual Stage SHA containing them.

Never let multiple Codex Workers edit the same checkout.

## Worker launch

Each Worker receives repository/worktree, task/dispatch IDs, actual base SHA, task branch, exact Task Contract, owned paths, model policy + resolved model, reasoning effort, and explicit instruction that it is implementation Worker rather than formal Reviewer.

The Bridge does not generate product implementation itself.

## Task result collection

After Codex exits, independently read:

```yaml
task_id:
dispatch_id:
base_sha:
task_head_sha:
parent_sha:
actual_changed_files:
verification:
process_exit:
status:
  candidate_ready | blocked | needs_decision
```

Do not trust model-reported SHA/file/test facts when Git/process state can be re-read.

## Mechanical gate

Before Supervisor reasoning verify:

- commit exists;
- parent/base relation matches dispatch;
- changed files remain inside Router-owned paths;
- required focused verification actually passed;
- worktree is in an acceptable deliverable state.

Fail on real external-boundary errors; do not add speculative recovery/retry frameworks.

## Supervisor Integration

After mechanical checks, run a Local Codex Supervisor prompt over exact Task Contract, actual commit/parent, complete diff, actual files, verification evidence, dependency facts and ownership.

Allowed result only:

```text
ready_to_integrate
blocked
needs_decision
```

Never request formal `APPROVE` or `REQUEST_CHANGES`.

## Task durability and Stage integration

Push a candidate Task branch promptly after it passes mechanical gating so local failure does not erase it. Git push failure is a real failure and must be reported.

Use exactly one Stage integration worktree. For eligible task:

```text
git cherry-pick <source_task_sha>
```

On success record `task_id`, `source_task_sha`, `stage_commit_sha`, push Stage, and recompute Ready Set.

On conflict:

```text
git cherry-pick --abort
→ blocked
→ stop that integration
```

No ours/theirs automation, AI conflict resolution, rebase, force-push or merge commit.

## Stage completion / delivery

Stage is `candidate_ready` only when every required Router task is integrated and no required task is blocked/needs_decision. Publish/update GitHub facts so Actions can mechanically verify exact Stage head. Bridge never marks formal Review approval and never writes `main`.

## Logging

Keep logs concise and operator-readable. Expose IDs/SHAs/process outcomes without secrets. Do not log tokens, OAuth material or full environment dumps. No second persistent status database.

## Coding plan

1. Inspect repository layout and Node constraints.
2. Inspect actual local `git`, `gh` and `codex` help/capabilities before finalizing command adapters.
3. Define smallest internal data structures matching accepted Router output; do not repeatedly re-validate trusted internal objects.
4. Implement/test DAG Ready Set calculation as pure unit first.
5. Implement worktree/task-branch lifecycle and Git fact collection with temp-repository fixtures.
6. Implement child-process launcher boundaries with only the injection seam needed for deterministic tests; no provider framework.
7. Implement mechanical task gate.
8. Implement Supervisor Integration prompt/result parser with exactly three statuses.
9. Implement controlled cherry-pick + conflict-abort using real temporary Git repositories.
10. Implement `run-once`, then continuous `start` on the same primitives.
11. Implement GitHub discovery/delivery around `gh` after core scheduler/Git invariants are covered.
12. Run focused tests and verify no manifest/product-runtime changes.

## Model-specific guidance

This task uses a strong coding model with high reasoning because it combines process lifecycle, Git topology, concurrency and external CLI boundaries. Spend reasoning on invariants and real failure boundaries. Keep code explicit and repository-specific; avoid defensive checks for impossible typed-internal states once external input is validated.

## Non-goals

No product `src/**`, `room:status --help`, Cloud executor, API-key LLM calls, self-hosted runner, webhook/tunnel, local DB/queue, provider registry/plugin bus/MCP framework, lease/heartbeat, automatic stale recovery/retry framework, hash index, automatic conflict resolution, formal Review, or main merge/write.

## Verification

At minimum:

```text
node --test tools/codex-github-bridge/tests/*.test.mjs
git diff --check
```

Tests must cover Ready Set for independent tasks, dependency unlock, ownership conflict prevention, `run-once` single-set semantics, `start` immediate dependent unlock, actual Git fact collection, worktree isolation, allowed Supervisor statuses, controlled cherry-pick mapping, conflict abort/blocked result, and no silent model fallback.

Use real temporary Git repositories when testing Git topology.

## Stop / needs_decision

Return `needs_decision` if implementation requires package manifest changes, persistent local DB, undocumented/invented Codex flags, silent model substitution, automatic conflict recovery, product-runtime changes, or scope outside `tools/codex-github-bridge/**`.

## Required Coding Result

```yaml
task_id: T04-bridge
dispatch_id: <dispatch id>
reported_base_sha: <dispatch base>
reported_task_head_sha: <worker-reported sha>
changed_files:
  - <paths>
verification:
  bridge_tests: <pass/fail + command>
  diff_check: <pass/fail + command>
local_codex_capability:
  inspected: true
  model_policy_resolution: <supported | needs_decision>
status: candidate_ready | blocked | needs_decision
notes: <only material Bridge/Git/process facts>
```

The Supervisor independently re-reads Git/process facts before integration.