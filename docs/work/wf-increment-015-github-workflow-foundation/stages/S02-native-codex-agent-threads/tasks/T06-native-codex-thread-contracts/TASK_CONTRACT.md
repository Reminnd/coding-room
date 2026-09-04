# TASK CONTRACT — T06-native-codex-thread-contracts

## Contract

```yaml
status: Draft
confirmed_by_user: false
task_id: T06-native-codex-thread-contracts
type: Implementation Task
model_policy: fast_general
reasoning_effort: low
fallback_model_policy: none
depends_on:
  - T05-native-codex-thread-backend
base_sha: supplied_by_supervisor_after_t05_integration
```

## Background

T06 is deliberately downstream of T05. Authority documents must describe the native Task Thread backend that actually exists in the integrated T05 source and tests, not an interface predicted by this planning Contract.

T06 is also the first real Stage Task that MUST be launched through the newly integrated native backend. A fresh Bridge process must load the T05-integrated Stage head and bind the T06 worktree as the native thread and turn `cwd`.

## Goal

Synchronize the minimum Current/candidate Contract and authority documentation with the actual T05 native Task Thread implementation while preserving existing GitHub/Git, Bridge scheduler, worktree, integration and fixed-Chat Review ownership.

## Requirements

1. Before editing, read the integrated T05 commit, complete Diff, tests, native backend result and current authority text. Record the actual interface, native thread/turn lifecycle, explicit `cwd` fields, model/effort boundary, terminal outcome and no-fallback behavior.
2. Update only authority statements that would otherwise misdescribe the implemented development control plane. Use one precise data flow:

   ```text
   GitHub/Git facts
   → Local Bridge DAG / Ready Set
   → one native Codex task thread per Ready Task worktree
   → native turn outcome + Git facts
   → Supervisor Integration
   → controlled Task-to-Stage cherry-pick
   → Stage verification
   → fixed Chat formal Review
   ```

3. Keep Local Bridge as the sole scheduler and Git delivery boundary. Native threads are Worker execution surfaces, not persistent authority, DAG owners, Reviewers or merge actors.
4. State that Worker Task threads are fresh per Task, explicitly bound to their task worktree, receive only their own Contract/dispatch facts, and do not spawn writing subagents in the S02 backend.
5. State that native capability or explicit-`cwd` failure returns `needs_decision` with no `codex exec` Worker fallback. Do not generalize this into provider or compatibility policy.
6. Preserve all accepted Task branch/worktree ownership, Git fact re-read, remote SHA, recovery, Supervisor Integration, controlled cherry-pick, exact-head verification, fixed-Chat Review and exact accepted SHA fast-forward rules.
7. Preserve the distinction between Agent Room product runtime/Claude execution and the project-development Local Codex control plane. Do not rewrite historical product architecture or protocol sections.
8. Record T05/T06 as an S02 candidate until fixed-Chat Review and explicit user acceptance. Do not mark the native backend Current, Accepted or integrated into `main` during T06 Coding.
9. Record the actual T06 native thread/turn dispatch evidence in the candidate development log without treating thread history or UI state as Git authority.
10. Keep `room:status --help` Deferred, S01 immutable, and the wrong `S02-room-status-help-pilot` superseded. Do not allocate or activate another Stage.

## Owned paths and scope

Writable only:

- `AGENTS.md`
- `PROJECT_RULES.md`
- `docs/documents/DEVELOPMENT_LOG.md`
- `docs/documents/README.md`
- `docs/documents/STAGE_4_LOCAL_PARALLEL_ARCHITECTURE_AMENDMENT.md`
- `docs/documents/agent-guides/GIT_AND_PARALLEL_WORKFLOW.md`

Modify only files whose existing Current/candidate description is materially affected by the integrated T05 facts. Unchanged owned files may remain untouched.

`CLAUDE.md` is read-only. Its current distinction between Local Codex project-development work and Claude Code Agent Room runtime remains accurate on the S02 planning base. If the actual T05 implementation creates a real contradiction there, return `needs_decision` instead of expanding scope.

## Architecture decisions

- GitHub/Git remain persistent project-development truth.
- Local Bridge remains dependency DAG/Ready Set, worktree and Git delivery authority.
- Implementation Worker backend becomes `codex_native_task_threads` only after S02 is reviewed, accepted and integrated.
- one Task uses one fresh native thread and its assigned worktree.
- Worker-spawned writing subagents remain disabled.
- native thread/UI history is observation, not authority.
- Supervisor Integration is not formal Review.
- fixed Chat remains the only formal Review Authority.
- Task→Stage remains controlled cherry-pick; Stage→main remains exact accepted SHA non-force fast-forward.

## Constraints

- Documentation-only Task; no `.github/**`, `tools/**`, `src/**`, test or package-manifest changes.
- Do not redesign the T05 interface, add a protocol version, create an ADR, or invent fields absent from actual T05 implementation.
- Do not duplicate detailed authority across files. Keep the Stage 4 amendment/Git guide as detailed sources and use concise routing text elsewhere.
- No Local Bridge `start`, Repository Bootstrap, Implementation dispatch, formal Review, merge or main write from this Task beyond the Supervisor's separately authorized T06 `run-once` execution.
- No hash/patch-id index, local workflow/thread database, provider abstraction, compatibility layer, automatic retry/rebase/conflict handling or silent fallback.

## Non-goals

- product code, Bridge code, test code or workflow changes;
- accepting S02 or promoting the candidate to Current;
- changing Room protocol, SQLite, Runner or Claude Code behavior;
- documenting hypothetical SDK/App Server fields not used by T05;
- restoring `room:status --help` or S01 routing;
- adding another Stage or Task.

## Acceptance criteria

1. Every changed authority statement matches the integrated T05 source, tests and Coding Result; no document claims a predicted or unavailable native capability.
2. Current/candidate status is explicit: accepted `main` remains `bd41ea8a1e259300241a345a659e7da90e24af0d`, while native backend implementation remains an S02 candidate pending formal Review and user acceptance.
3. The documented data flow preserves Bridge scheduling, per-Task worktree isolation, Git fact authority, Supervisor Integration, controlled cherry-pick, Actions verification and fixed-Chat Review.
4. T06 native dispatch evidence records exact thread/turn/worktree facts without making thread history a persistent source of truth.
5. `room:status --help` remains Deferred; no S01 or wrong S02 Router becomes active.
6. All changed relative links resolve, no unresolved merge marker exists, and no duplicated Current authority is introduced.
7. Actual changed files stay inside the owned documentation paths and one Conventional Commit is created on the T06 task branch only after verification passes.

## Verification

| Check | Detects | Decision if failed |
|---|---|---|
| `git diff --check` | whitespace or patch-format defects | `blocked`; do not commit or integrate |
| relative Markdown link audit for changed files | broken authority/document navigation | `blocked`; do not commit or integrate |
| merge marker audit for changed files | unresolved document conflict | `blocked`; do not commit or integrate |
| compare every native-backend statement with integrated T05 source/tests/result | speculative or stale interface claims | `blocked`; correct within scope or return `needs_decision` |
| Current/candidate and authority-owner audit | premature Current promotion or duplicated authority | `blocked`; do not commit or integrate |

Do not rerun unrelated product tests when T06 changes only Markdown. The existing Stage Actions candidate verifier will run the complete mechanical suite after integration.

## Documentation updates

This Task is the documentation update. No additional document or index may be created. Codex performs the final documentation impact audit after formal S02 Review and, after user acceptance, promotes only the accepted exact implementation facts to Current.

## Question policy

Return `needs_decision` and stop if:

- T05 actual behavior differs materially from the frozen native-thread architecture;
- correct documentation requires a file outside the owned paths, including `CLAUDE.md`;
- implementation facts are incomplete or internally contradictory;
- the candidate cannot be described without changing architecture, Room protocol or public product behavior.

Do not resolve an implementation discrepancy in documentation.

## Required Coding Result

```yaml
task_id: T06-native-codex-thread-contracts
dispatch_id: <dispatch id>
reported_base_sha: <T05-integrated dispatch base>
reported_task_head_sha: <worker-reported sha>
native_dispatch:
  thread_id: <observed native thread id>
  turn_id: <observed native turn id>
  worktree_cwd: <assigned task worktree>
  turn_status: <completed | failed | interrupted>
changed_files:
  - <paths>
authority_updates:
  - <actual fact synchronized>
verification:
  diff_check: <pass/fail>
  links: <pass/fail>
  merge_markers: <pass/fail>
  implementation_consistency: <pass/fail>
  current_candidate_boundary: <pass/fail>
deviations: []
unresolved: []
questions: []
status: candidate_ready | blocked | needs_decision
```

The Supervisor independently re-reads Git facts, changed files and native thread/turn outcome before integration.
