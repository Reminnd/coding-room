# TASK CONTRACT — T05-native-codex-thread-backend

## Contract

```yaml
status: Accepted
confirmed_by_user: true
task_id: T05-native-codex-thread-backend
type: Implementation Task
model_policy: coding_strong
reasoning_effort: high
fallback_model_policy: none
depends_on: []
base_sha: supplied_by_supervisor_at_dispatch
```

## Background

The accepted Local Bridge already owns GitHub discovery, Router validation, DAG/Ready Set scheduling, task branch/worktree isolation, Git fact collection, Supervisor Integration and controlled Task-to-Stage integration. Its Worker boundary currently launches one non-interactive `codex exec` process per Task.

S02 changes only that Worker execution boundary. Bridge remains the scheduler and Git delivery authority; GitHub/Git remain persistent truth; fixed Chat remains formal Review Authority.

## Goal

Implement the minimum native Codex task-thread backend so every Bridge-dispatched Ready Task runs in its own native Codex thread and assigned worktree, with observable terminal turn status and no silent fallback.

## Requirements

1. Inspect the actual installed, documented Local Codex surface before finalizing the adapter. Prefer the existing `codex app-server` protocol when it provides the required stable boundary. If the current repository cannot implement the four required capabilities without a new dependency or a materially different interface, return `needs_decision` instead of changing package manifests.
2. Initialize the native Codex connection according to the supported protocol and create one new thread per Task. Do not resume or reuse another Task's thread history.
3. Supply the assigned Task worktree as explicit `cwd` on both native thread start and turn start. The task branch, immutable runtime base SHA and clean worktree gate remain owned by existing Bridge/Git code.
4. Supply the resolved concrete model and reasoning effort through supported native thread/turn fields. Keep the existing Router `model_policy` resolution and no-fallback rule; do not add a provider registry or hard-code a new permanent model in the Task Contract.
5. Deliver only that Task's complete Contract, dispatch envelope, owned paths and dependency facts as turn input. Set `worker_spawned_subagents=false`; the Worker must not create writing subagents.
6. Observe native thread/turn events until the matching turn reaches `completed`, `failed`, or `interrupted`. Correlate every event by exact thread ID and turn ID; output from another concurrent Task must not settle this Task.
7. Normalize the native outcome for the existing controller without treating app-server process liveness as Task success. A Worker is eligible for Git fact collection only after its own turn completes successfully and its required Coding Result is present.
8. Preserve existing Git mechanical gate, focused verification, Supervisor Integration, task push, remote SHA re-read, controlled cherry-pick, Stage push, recovery and candidate publication behavior. This Task must not redesign those components.
9. Preserve full Ready Set concurrency. At least two independent Ready Tasks must be able to have distinct native turns in progress concurrently, with distinct thread IDs and their own explicit worktree `cwd`.
10. When native thread creation, explicit `cwd`, requested model/effort or terminal event observation is unavailable, return `needs_decision`. Never fall back to `codex exec`, another provider, a shared thread, or a worker-spawned subagent.
11. Use the existing local Codex account/authentication. Do not introduce API keys, export OAuth material, or persist credentials, prompts, thread history or a second workflow state database.

## Architecture decisions

```yaml
execution:
  agent_backend: codex_native_task_threads
  worker_mode: one_thread_per_task
  thread_cwd_policy: task_worktree
  worker_spawned_subagents: false
scheduling:
  authority: local_bridge
  model: dependency_dag
isolation:
  task_branch: required
  worktree: required
  ownership: required
persistent_authority:
  github_git: true
  native_thread_history: false
fallback:
  worker_backend: none
```

The protocol adapter and internal file split are implementation details. Do not add a generic executor/provider abstraction. The existing non-worker Supervisor Integration invocation may retain its current execution path; this Contract only replaces the Implementation Worker boundary.

## Owned paths and scope

Writable only:

- `tools/codex-github-bridge/**`

Everything else is read-only context. No package manifest or lockfile changes are authorized.

Expected implementation work is limited to the existing Codex launcher/controller/result boundary and direct tests or fixtures under the owned directory. Reuse the existing process helper and scheduler where they remain correct.

## Constraints

- Node 24 ESM and existing dependencies only.
- No edits to `.github/**`, `src/**`, root authority documents, `docs/**`, package manifests or product tests.
- No Local Bridge `start`/`run-once` invocation from this Task beyond the Supervisor's separately authorized dispatch of T05 itself.
- No provider registry, generic plugin/MCP bus, local queue/thread database, lease, heartbeat, automatic respawn/retry, custom UI, second state machine, hash/patch-id index, rebase, force push or automatic conflict handling.
- Do not implement `room:status --help` and do not reactivate any S01 Router.

## Non-goals

- formal Review or main integration;
- changing DAG, Ready Set, ownership or Git integration semantics;
- persisting Codex thread history as project authority;
- resuming a Task in another Task's thread;
- native UI customization;
- migrating the non-worker Supervisor Integration call unless the current implementation makes separation impossible and the user first confirms the change;
- documenting the candidate as Current; T06 owns that post-implementation synchronization.

## Acceptance criteria

1. A Worker dispatch creates one fresh native Codex thread and one turn, and both start requests carry the exact assigned worktree `cwd`.
2. Two independent Ready Task launches can overlap before either turn settles; their thread IDs, turn IDs, prompts, models, efforts and worktree paths remain isolated.
3. Each Worker receives only its own exact Contract/envelope/ownership/dependency facts and cannot spawn a writing subagent through the S02 Worker path.
4. Matching `completed`, `failed` and `interrupted` terminal events produce deterministic normalized outcomes; unrelated or stale thread/turn events cannot settle the Worker.
5. A successful native turn proceeds through existing Git fact collection and gates. A native failure or missing required Coding Result cannot reach task push or Stage integration.
6. Missing native capability, explicit `cwd`, model/effort or terminal observation yields `needs_decision` and zero `codex exec` Worker fallback.
7. Existing recovery, remote Task/Stage SHA verification, Supervisor Integration, controlled cherry-pick and candidate publication tests remain green.
8. Restart requires only GitHub/Git/Contracts; no local database or thread-history recovery authority is created.
9. Actual changed files remain inside `tools/codex-github-bridge/**` and one Conventional Commit is created on the T05 task branch only after all required verification passes.

The concurrency and protocol tests MUST use a deterministic fake app-server boundary capable of withholding terminal events until both turns are in progress. Tests must assert the actual outbound request fields and correlated inbound events, not only mock a final launcher return value.

## Verification

| Command | Detects | Decision if failed |
|---|---|---|
| `node --test tools/codex-github-bridge/tests/*.test.mjs` | native protocol lifecycle, exact `cwd`, per-Task isolation, concurrent turns, terminal mapping, no fallback, and preservation of Bridge/Git behavior | `blocked`; do not commit or integrate |
| `npm run typecheck` | repository TypeScript compatibility after the Bridge change | `blocked`; do not commit or integrate |
| `npm test` | regression in accepted product/runtime behavior | exit `0` is the standard success condition; a non-zero exit is `blocked` unless the exact one-time amendment below is satisfied in full |
| `git diff --check` | whitespace or patch-format defects in the owned Diff | `blocked`; do not commit or integrate |

### One-time baseline-equivalence verification amendment

This accepted amendment applies only to `task_id=T05-native-codex-thread-backend` dispatched from `dispatch_base_sha=4058fc11aa5ca51eccea9a97d80a82b978c528ca`. It does not change the T05 Goal, Requirements, owned paths, model policy, implementation scope or any architecture decision.

`npm test` exiting `0` remains the standard full-regression success condition. If `npm test` exits non-zero, this T05 full regression may be classified as `baseline_equivalent_no_new_regression` only when all of the following conditions hold:

1. A clean detached checkout of exact base `4058fc11aa5ca51eccea9a97d80a82b978c528ca` reproduces the baseline result.
2. The clean baseline and current T05 worktree have exactly the same pass and fail counts.
3. Their failing-test identity sets are exactly equal.
4. The corresponding failure evidence for every failing test is exactly equal.
5. `t05_new_regressions == 0`.
6. Focused Bridge tests pass.
7. `npm run typecheck` passes.
8. `git diff --check` passes.

If any condition is not satisfied, the result remains `blocked`; T05 MUST NOT be committed or integrated. This exception MUST NOT be applied to another Task, Stage, dispatch base or future `npm test` failure.

The existing `plugin-packaging` failures are not considered fixed. This amendment does not authorize changes to `tests/plugin-packaging.test.ts`, Plugin files, line-ending configuration or any path outside T05 ownership.

The already obtained baseline-equivalence evidence for this amendment is:

```yaml
dispatch_base_sha: 4058fc11aa5ca51eccea9a97d80a82b978c528ca
clean_detached_exact_base:
  passed: 403
  failed: 6
current_T05_worktree:
  passed: 403
  failed: 6
failure_sets_identical: true
failure_evidence_identical: true
t05_new_regressions: 0
existing_failure_scope: plugin-packaging CRLF/LF baseline outside T05 ownership
accepted_exception: baseline_equivalent_no_new_regression
```

This evidence is recorded directly in the Contract. It MUST NOT be expanded into a hash index, patch-id index, baseline database or new verification framework.

## Documentation updates

None. T06 depends on the integrated T05 implementation and owns the exact authority/documentation synchronization.

## Question policy

Return `needs_decision` and stop if:

- native Codex task thread + explicit worktree `cwd` cannot be implemented on the actually supported local interface;
- a new dependency or package manifest change is required;
- the change cannot be limited to the Implementation Worker boundary;
- existing Git/DAG/recovery/integration semantics would need redesign;
- any fallback, retry framework, persistent thread state or scope outside owned paths appears necessary.

Do not guess undocumented flags or silently preserve `codex exec` as a Worker fallback.

## Required Coding Result

```yaml
task_id: T05-native-codex-thread-backend
dispatch_id: <dispatch id>
reported_base_sha: <dispatch base>
reported_task_head_sha: <worker-reported sha>
changed_files:
  - <paths>
native_backend:
  interface: <actual supported interface used>
  worker_mode: one_thread_per_task
  explicit_thread_cwd: <pass/fail>
  explicit_turn_cwd: <pass/fail>
  terminal_event: <actual event/status boundary>
  silent_fallback: false
verification:
  bridge_tests: <pass/fail + command>
  typecheck: <pass/fail + command>
  full_tests: <pass/fail + command>
  diff_check: <pass/fail + command>
deviations: []
unresolved: []
questions: []
status: candidate_ready | blocked | needs_decision
```

The Supervisor independently re-reads Git, verification and native execution facts before integration.
