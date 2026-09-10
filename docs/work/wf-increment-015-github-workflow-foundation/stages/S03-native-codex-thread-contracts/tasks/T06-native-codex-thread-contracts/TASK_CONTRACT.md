# TASK CONTRACT — T06-native-codex-thread-contracts

## Contract

```yaml
status: Exact Contract Frozen / Awaiting Pushed-SHA Acceptance
dispatchable: false
confirmed_by_user: false
implementation_authorized: false
task_id: T06-native-codex-thread-contracts
type: Documentation Implementation Task
model_policy: fast_general
reasoning_effort: low
fallback_model_policy: none
depends_on: []
planning_base_sha: c6f22fa110076a2784a39702c18a7c6ba99199db
base_sha: supplied_by_supervisor_from_actual_s03_stage_head
```

## Background

S02 T05 replaced the project-development Implementation Worker boundary with Codex app-server native task threads. T05F00 aligned the Root prompt so subagents remain default-deny but an exact Accepted Contract may explicitly authorize Root-only native multi-agent. T05F01 removed T05-specific Worker Result authority and preserved the existing Controller-owned Git/verification/delivery sequence. Formal Review repairs are included in exact accepted/integrated GitHub `main` `c6f22fa110076a2784a39702c18a7c6ba99199db`.

T06 is a new single-task S03 documentation implementation. It does not modify or replay S02. It uses the integrated native backend to synchronize the minimum project-development authority documents with behavior already established by source, tests and Git facts.

## Goal

Synchronize exactly six governance documents with the Current native Codex task-thread Worker and task-generic Worker Result boundaries while preserving GitHub/Git, Local Bridge scheduler/Git delivery, Supervisor Integration and fixed-Chat Review ownership.

## Requirements

1. Before editing, read the integrated implementations and direct tests for `CodexLauncher.launchWorker`, `runNativeWorker`, Worker prompt generation, generic Result validation, Controller candidate creation and lifecycle publication. Documentation claims must be traceable to those facts.
2. Establish one project-development flow:

   ```text
   GitHub/Git accepted Contract and dispatch facts
   → Local Bridge DAG / Ready Set
   → one fresh native Codex task thread in the assigned Task worktree
   → task-generic Worker Result + native process facts
   → Controller-owned Git observation, Router verification and candidate commit
   → Supervisor Integration
   → controlled Task-to-Stage cherry-pick
   → Stage exact-head verification
   → fixed Chat Formal Review
   → user exact-SHA acceptance
   → separately authorized non-force fast-forward to main
   ```

3. Keep GitHub/Git as persistent project-development truth and Local Bridge as the only scheduler/worktree/Git delivery boundary. A native thread is an ephemeral Worker execution surface, not workflow state, recovery authority, reviewer or merge actor.
4. Document the implemented native boundary exactly: app-server stdio; fresh ephemeral thread per Task; thread and turn explicitly bound to the Task worktree `cwd`; resolved model and reasoning effort passed natively; `approvalPolicy=never`; turn sandbox writable only in the Task worktree with network disabled; matching thread/turn final and terminal events required.
5. Document failure semantics exactly: unavailable native capability, request failure, invalid fresh thread/turn identity, model reroute, missing matching terminal event or unsupported terminal status returns `needs_decision`; no pre-S02 `codex exec` Worker fallback exists.
6. Document prompt authority exactly: every Worker receives the full Accepted Task Contract, dispatch envelope, owned paths and dependency facts. Subagent delegation is default-deny; only an exact Contract can authorize Root-only native multi-agent, and child-spawned writing descendants remain forbidden. T06 itself authorizes no subagent.
7. Document the task-generic Worker Result exactly. Required common fields are `task_id`, `dispatch_id`, `reported_base_sha`, `deviations`, `unresolved`, `questions` and `status`; allowed statuses are `implementation_ready | blocked | needs_decision`; only `implementation_ready` requires non-empty `changed_files`.
8. Keep authority separated: native IDs/status come from `processResult.native`; verification comes from Router `task.verification → runVerification()`; ownership comes from Router `owns`, observed working paths and `mechanicalGate()`; candidate commit identity comes from Controller-observed Git facts. Do not require Worker `native_backend`, `verification` or `reported_task_head_sha` fields.
9. Preserve the successful Controller order: semantic Result gate; Git observation/base/branch/staged/working-path/ownership checks; Worker/observed path equality; Router verification; post-verification observation; exact-path staging and cached diff-check; deterministic candidate commit; candidate/mechanical gate; Supervisor; dependency gate; Task push; controlled Stage integration and lifecycle publication.
10. Update Current/candidate statements accurately: S02 native Worker/generic Result implementation is Current at accepted/integrated `main=c6f22fa110076a2784a39702c18a7c6ba99199db`; T06 document changes remain an S03 candidate until Stage Review, user acceptance and main integration.
11. Preserve the distinction between Agent Room product runtime/Claude execution and the repository-development Local Codex control plane. Do not rewrite Room protocol, SQLite, product Runner or Claude Code behavior.
12. Record actual T06 dispatch, native thread/turn and Git delivery facts in `DEVELOPMENT_LOG.md` only after they occur. Thread/UI history remains observation and must not replace GitHub/Git evidence.

## Owned paths and scope

Writable paths are exactly:

- `AGENTS.md`
- `PROJECT_RULES.md`
- `docs/documents/DEVELOPMENT_LOG.md`
- `docs/documents/README.md`
- `docs/documents/STAGE_4_LOCAL_PARALLEL_ARCHITECTURE_AMENDMENT.md`
- `docs/documents/agent-guides/GIT_AND_PARALLEL_WORKFLOW.md`

All six paths must be materially synchronized and must be the complete changed-file set. No additional file is authorized. Detailed Current control-plane semantics belong in the Stage 4 amendment and Git guide; entry/index/log documents must route or record facts without duplicating a second detailed authority.

`CLAUDE.md`, `docs/documents/ARCHITECTURE.md`, `docs/documents/ROOM_PROTOCOL.md`, `docs/documents/OPERATIONS.md`, S01/S02 documents, `.github/**`, `tools/**`, `src/**`, `tests/**` and package manifests are read-only.

## Architecture decisions

- GitHub/Git remain persistent project-development truth.
- Local Bridge remains dependency DAG/Ready Set, Task worktree and Git delivery authority.
- Current Implementation Worker backend is `codex_native_task_threads`.
- one Ready Task uses one fresh ephemeral native thread and its assigned worktree.
- T06 Worker-spawned subagents are forbidden.
- task-generic Worker Result is semantic handoff, not native/verification/ownership/Git authority.
- native thread/UI history is observational only.
- Supervisor Integration is not Formal Review.
- fixed Chat is the only Formal Review Authority.
- Task→Stage remains controlled cherry-pick; Stage→main remains exact accepted SHA non-force fast-forward.

## Constraints

- Documentation-only Task with exact six-file ownership; no new file, ADR, schema, protocol version, dependency, command, workflow or implementation change.
- Match existing document style and preserve historical facts. S01/S02 history must not be rewritten as an active dispatch source.
- Do not generalize the implemented native backend into a provider abstraction, compatibility layer or persisted thread registry.
- No hash, checksum, fingerprint, patch-id index, local workflow database, retry framework, fallback, self-healing, automatic rebase or conflict resolution.
- Worker leaves the six-file Diff unstaged. Only the existing Controller may run Router verification, stage exact observed paths and create the Task candidate commit after all gates pass.
- Contract acceptance, Stage push, T06 branch/worktree creation, one-shot execution, Task push, Stage integration, Formal Review and Stage→main integration are separate permissions.

## Non-goals

- modifying or re-testing production source, Bridge source, product runtime, Room protocol, SQLite, Claude Runner, MCP/CLI, Plugin or package metadata;
- changing the native app-server interface, generic Result grammar, model policy mapping, scheduler, recovery, Git gates or GitHub lifecycle;
- authorizing native multi-agent for T06;
- accepting T06, approving S03, pushing any branch or modifying `main`;
- reviving `room:status --help`, S01 routing or the obsolete S02 placeholder as a dispatch source;
- documenting hypothetical Codex capability not exercised by the integrated implementation.

## Acceptance criteria

1. Actual changed files are exactly the six owned governance paths and every changed statement is supported by integrated source/tests/Git facts.
2. All six documents agree that S02 native Worker/generic Result is Current at `main=c6f22fa110076a2784a39702c18a7c6ba99199db`, while T06 edits remain an S03 candidate until accepted and integrated.
3. The documented native lifecycle matches fresh ephemeral thread, exact worktree `cwd`, model/effort, sandbox, matching terminal evidence, reroute rejection and no-fallback behavior.
4. The documented generic Result fields/statuses and separated authority owners match `controller.mjs`; no Worker-owned native, verification, ownership or candidate SHA claim is introduced.
5. The documented candidate sequence preserves all current Git observation, exact-path staging, verification, mechanical, Supervisor, dependency, push, cherry-pick, candidate publication and fixed-Chat gates.
6. Agent Room product runtime and Claude Code boundaries remain unchanged; no protocol/ADR/operations update is claimed.
7. All changed relative Markdown links resolve; no unresolved merge marker, whitespace error or duplicated Current authority is introduced.
8. After Worker verification, the existing Controller creates exactly one Conventional Commit on the T06 task branch from the exact six observed paths; Worker itself performs no Git write.

## Verification

| Check | Detects | Decision if failed |
|---|---|---|
| `git diff --check` | whitespace or patch-format defect in the exact six-file candidate | `blocked`; do not create candidate commit |
| relative Markdown link audit for the exact six changed governance files | broken authority/document navigation | `blocked`; correct within scope before delivery |
| merge marker audit for the exact six changed governance files | unresolved document conflict | `blocked`; do not create candidate commit |
| native task-thread and generic Worker Result authority consistency audit against integrated source and tests | stale, speculative or wrongly-owned interface claim | `blocked`; correct within scope or return `needs_decision` |
| Current/candidate and exact ownership audit | premature acceptance, duplicate authority or changed-file drift | `blocked`; do not create candidate commit |

Do not run unrelated product suites for this Markdown-only Task. Router supervisor checks remain manual semantic gates; `git diff --check` is the only Router command check. Stage Actions performs the existing complete mechanical candidate verification after integration.

## Documentation updates

This Task is the exact six-file documentation synchronization. Do not create an additional document or index. After S03 Formal Review, Codex performs the mandatory documentation impact audit; only the exact reviewed and user-accepted Stage head may be promoted to Current project documentation through separately authorized Stage→main integration.

## Question policy

Return `needs_decision` and stop if integrated source/tests contradict this Contract, correct documentation requires any seventh path, a six-path statement would change product architecture/protocol, or native execution cannot honor exact model/effort/worktree/no-fallback boundaries. Do not hide an implementation discrepancy with documentation and do not reduce the exact six-file scope.

## Required Coding Result

The final message must contain exactly one task-generic mapping with each known field exactly once:

```yaml
task_id: T06-native-codex-thread-contracts
dispatch_id: wf15-s03-t06-native-codex-thread-contracts-001
reported_base_sha: <actual immutable S03 dispatch base>
changed_files:
  - AGENTS.md
  - PROJECT_RULES.md
  - docs/documents/DEVELOPMENT_LOG.md
  - docs/documents/README.md
  - docs/documents/STAGE_4_LOCAL_PARALLEL_ARCHITECTURE_AMENDMENT.md
  - docs/documents/agent-guides/GIT_AND_PARALLEL_WORKFLOW.md
deviations: []
unresolved: []
questions: []
status: implementation_ready
```

For `blocked` or `needs_decision`, omit `changed_files` only when no complete implementation candidate exists and provide the reason in `unresolved` or `questions`. Do not add `native_backend`, `verification`, `reported_task_head_sha` or a second summary mapping; the Controller independently owns those facts and rejects duplicate known fields.
