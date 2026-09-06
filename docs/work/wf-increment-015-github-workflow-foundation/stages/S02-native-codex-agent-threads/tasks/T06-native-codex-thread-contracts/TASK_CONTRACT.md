# PLANNING PLACEHOLDER — T06-native-codex-thread-contracts

## Contract

```yaml
status: Planning Placeholder
dispatchable: false
confirmed_by_user: false
task_id: T06-native-codex-thread-contracts
type: Pending Exact Implementation Task
depends_on:
  - T05F01-generic-worker-result-boundary
base_sha: pending_t05f01_integration
```

## Background

This file is not an exact Task Contract, is not an active Router dispatch source, and grants no Implementation or document-write authority. Any documentation paths named by an earlier T06 draft were preliminary predictions and MUST NOT be treated as Accepted scope.

T06 is deliberately downstream of the complete T05 → T05F00 → T05F01 transition. Its future exact Contract must describe the native Task Thread backend and generic Worker Result boundary that actually exist in the integrated source and tests, not an interface predicted during transition planning.

T05F00 is the first transition native Worker after T05 backend integration. T05F01 is the first transition Task using exact Contract-authorized Root native multi-agent. T06 is the first docs-owned native Task after the generic Worker Result boundary is integrated. A fresh Bridge process must load the T05F01-integrated Stage head and bind the T06 worktree as the native thread and turn `cwd`.

## Goal

Synchronize the minimum Current/candidate Contract and authority documentation with the actual T05 native Task Thread implementation while preserving existing GitHub/Git, Bridge scheduler, worktree, integration and fixed-Chat Review ownership.

## Exact Contract entry gate

The exact T06 Task Contract may be generated and frozen only after all of the following facts exist:

1. T05 is integrated.
2. T05F00 is integrated.
3. T05F01 is integrated.
4. A fresh Codex planning pass has inspected the actual generic Controller boundary.
5. Codex has determined which documentation ownership is materially required.
6. This placeholder has been replaced with an exact T06 Contract.
7. The user has separately accepted that exact T06 Contract at its exact pushed Stage SHA.

The replacement exact Contract must define its precise owned paths, requirements, non-goals, architecture decisions, constraints, acceptance criteria, verification, documentation updates and question policy from those integrated facts. It must be committed to the Stage with the corresponding T06 Router entry before the separate user-acceptance gate.

T06 becomes dispatchable only after all seven entry gates are satisfied. A fresh `run-once` must then load the native backend and generic result boundary from the T05F01-integrated Stage head before dispatching T06.

## Current ownership boundary

No concrete T06 owned document is frozen or authorized by this placeholder. `exact_ownership_frozen=false`. Exact documentation ownership remains unresolved until the entry gate above is satisfied.

## Preserved architecture decisions

- GitHub/Git remain persistent project-development truth.
- Local Bridge remains dependency DAG/Ready Set, worktree and Git delivery authority.
- T05 native task-thread backend is integrated into this Stage candidate but does not become Current project capability before S02 formal Review, user acceptance and main integration.
- one Task uses one fresh native thread and its assigned worktree.
- Worker-spawned subagents remain disabled unless an exact Accepted Task Contract authorizes Root-only native multi-agent; child-spawned writing descendants remain disabled.
- generic Worker Result does not make Worker self-report the authority for native execution, verification or ownership facts.
- native thread/UI history is observation, not authority.
- Supervisor Integration is not formal Review.
- fixed Chat remains the only formal Review Authority.
- Task→Stage remains controlled cherry-pick; Stage→main remains exact accepted SHA non-force fast-forward.

## Current placeholder boundaries

- Do not invoke Local Bridge `start` or `run-once` from this planning revision.
- Do not implement or accept T05F00, T05F01 or T06; do not perform formal Review, merge, write `main`, rebase, force push, retry, fall back silently, or add a hash/patch-id index or local workflow database.
- Do not freeze any exact T06 owned document before the integrated generic Controller has been freshly inspected.
- Do not change the T05 Contract, App Server native task-thread design, T05F00 prompt boundary or T05F01 generic result boundary while replacing this placeholder.
- Keep `room:status --help` Deferred, S01 immutable, and the superseded `S02-room-status-help-pilot` inactive.
