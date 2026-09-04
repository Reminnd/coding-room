# PLANNING PLACEHOLDER — T06-native-codex-thread-contracts

## Contract

```yaml
status: Planning Placeholder
dispatchable: false
confirmed_by_user: false
task_id: T06-native-codex-thread-contracts
type: Pending Exact Implementation Task
depends_on:
  - T05-native-codex-thread-backend
base_sha: pending_t05_integration
```

## Background

This file is not an exact Task Contract, is not an active Router dispatch source, and grants no Implementation or document-write authority. Any documentation paths named by an earlier T06 draft were preliminary predictions and MUST NOT be treated as Accepted scope.

T06 is deliberately downstream of T05. Its future exact Contract must describe the native Task Thread backend that actually exists in the integrated T05 source and tests, not an interface predicted before T05 implementation.

T06 is also the first real Stage Task that MUST be launched through the newly integrated native backend. A fresh Bridge process must load the T05-integrated Stage head and bind the T06 worktree as the native thread and turn `cwd`.

## Goal

Synchronize the minimum Current/candidate Contract and authority documentation with the actual T05 native Task Thread implementation while preserving existing GitHub/Git, Bridge scheduler, worktree, integration and fixed-Chat Review ownership.

## Exact Contract entry gate

The exact T06 Task Contract may be generated and frozen only after all of the following facts exist:

1. T05 has passed its mechanical gate and Supervisor Integration.
2. T05 has been controlled-cherry-picked into the Stage and the Stage branch has been pushed.
3. The first `run-once` has stopped without dispatching T06.
4. Codex has inspected the integrated T05 source, tests and Coding Result and determined which documentation is materially affected.

The replacement exact Contract must then define its precise owned paths, requirements, non-goals, architecture decisions, constraints, acceptance criteria, verification, documentation updates and question policy from those integrated facts. It must be committed to the Stage with the corresponding T06 Router entry.

T06 becomes dispatchable only after the user separately accepts that replacement exact Contract at its exact Stage SHA. A fresh `run-once` must then load the native backend from the T05-integrated Stage head before dispatching T06.

## Current ownership boundary

No concrete T06 owned document is frozen or authorized by this placeholder. Exact documentation ownership remains unresolved until the entry gate above is satisfied.

## Preserved architecture decisions

- GitHub/Git remain persistent project-development truth.
- Local Bridge remains dependency DAG/Ready Set, worktree and Git delivery authority.
- Implementation Worker backend becomes `codex_native_task_threads` only after S02 is reviewed, accepted and integrated.
- one Task uses one fresh native thread and its assigned worktree.
- Worker-spawned writing subagents remain disabled.
- native thread/UI history is observation, not authority.
- Supervisor Integration is not formal Review.
- fixed Chat remains the only formal Review Authority.
- Task→Stage remains controlled cherry-pick; Stage→main remains exact accepted SHA non-force fast-forward.

## Current placeholder boundaries

- Do not invoke Local Bridge `start` or `run-once` from this planning revision.
- Do not implement T05 or T06, perform formal Review, merge, write `main`, rebase, force push, retry, fall back silently, or add a hash/patch-id index or local workflow database.
- Do not change the T05 Contract, S02 goal or App Server native task-thread design while replacing this placeholder.
- Keep `room:status --help` Deferred, S01 immutable, and the superseded `S02-room-status-help-pilot` inactive.
