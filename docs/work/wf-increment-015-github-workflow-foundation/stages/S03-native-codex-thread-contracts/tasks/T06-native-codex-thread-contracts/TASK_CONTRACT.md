# TASK CONTRACT — T06-native-codex-thread-contracts

## Contract

```yaml
status: Exact Contract Repair Candidate / Awaiting Pushed-SHA Acceptance
dispatchable: false
confirmed_by_user: false
implementation_authorized: false
run_once_authorized: false
task_id: T06-native-codex-thread-contracts
type: Implementation Task
model_policy: coding_strong
reasoning_effort: high
fallback_model_policy: null
depends_on: []
stage_creation_base_sha: c6f22fa110076a2784a39702c18a7c6ba99199db
base_sha: supplied_by_supervisor_from_actual_s03_stage_head
```

## Background

S02 T05 replaced the project-development Implementation Worker boundary with Codex app-server native task threads. T05F00 aligned the Root prompt so subagents remain default-deny but an exact Accepted Contract may explicitly authorize Root-only native multi-agent. T05F01 removed T05-specific Worker Result authority and preserved the existing Controller-owned Git/verification/delivery sequence. Formal Review repairs are included in exact accepted/integrated GitHub `main` `c6f22fa110076a2784a39702c18a7c6ba99199db`.

T06 is a new single-task S03 documentation implementation. It does not modify or replay S02. It uses the integrated native backend to synchronize the exact fourteen project-development authority documents approved by Fresh Planning with behavior already established by source, tests and Git facts.

S03 Stage and Draft PR #7 already exist. The pushed candidate `ddbc5a35d734eaca908090013b3ce29202086483` is rejected Contract history because it reduced the approved model/effort and future ownership. `S03CF01` repairs only the six existing Contract governance files; those six repair paths are not T06 implementation ownership. This Contract remains unconfirmed, unauthorized and non-dispatchable until the repaired Stage head is pushed under separate authorization, mechanically validated, handed off at an exact SHA and explicitly accepted by the user.

## Goal

Synchronize exactly fourteen governance documents with the Current native Codex task-thread Worker and task-generic Worker Result boundaries while preserving GitHub/Git, Local Bridge scheduler/Git delivery, Supervisor Integration and fixed-Chat Review ownership.

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
10. Update Current/candidate statements accurately across all fourteen owned documents: S02 native Worker/generic Result implementation is Current at accepted/integrated `main=c6f22fa110076a2784a39702c18a7c6ba99199db`; T06 document changes remain an S03 candidate until Stage Review, user acceptance and main integration.
11. Preserve the distinction between Agent Room product runtime/Claude execution and the repository-development Local Codex control plane. Do not rewrite Room protocol, SQLite, product Runner or Claude Code behavior.
12. Record actual T06 dispatch, native thread/turn and Git delivery facts in `DEVELOPMENT_LOG.md` only after they occur. Thread/UI history remains observation and must not replace GitHub/Git evidence.

## Owned paths and scope

Writable paths are exactly:

- `AGENTS.md`
- `CLAUDE.md`
- `PROJECT_RULES.md`
- `docs/documents/README.md`
- `docs/documents/ARCHITECTURE.md`
- `docs/documents/DEVELOPMENT_LOG.md`
- `docs/documents/MVP_PLAN.md`
- `docs/documents/STAGE_4_LOCAL_PARALLEL_ARCHITECTURE_AMENDMENT.md`
- `docs/documents/agent-guides/README.md`
- `docs/documents/agent-guides/CODEX_DOCUMENTATION_AUTHORING.md`
- `docs/documents/agent-guides/CODEX_REVIEW_AND_PLANNING.md`
- `docs/documents/agent-guides/CLAUDE_CODING_AND_FIX.md`
- `docs/documents/agent-guides/GIT_AND_PARALLEL_WORKFLOW.md`
- `docs/work/wf-increment-015-github-workflow-foundation/SUPERVISOR_ROUTER_AGENT.md`

All fourteen paths must be materially synchronized and must be the complete changed-file set. No fifteenth path is authorized. Detailed Current control-plane semantics belong in the Stage 4 amendment and Git guide; entry/index/log documents must route or record facts without duplicating a second detailed authority.

The six-file S03 Contract governance bundle is read-only during future T06 implementation: workflow `PLAN.md` and `EXECUTION_PLAN.md`, S03 `STAGE.md`, `ROUTER_CONTRACT.md`, Stage-local `SUPERVISOR_ROUTER_AGENT.md` and this `TASK_CONTRACT.md`. `docs/documents/ROOM_PROTOCOL.md`, `docs/documents/OPERATIONS.md`, S01/S02 documents, `.github/**`, `tools/**`, `src/**`, `tests/**` and package manifests are also read-only.

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

- Documentation-only implementation with exact fourteen-file ownership; no new file, ADR, schema, protocol version, dependency, command, workflow or production implementation change.
- Match existing document style and preserve historical facts. S01/S02 history must not be rewritten as an active dispatch source.
- Do not generalize the implemented native backend into a provider abstraction, compatibility layer or persisted thread registry.
- No hash, checksum, fingerprint, patch-id index, local workflow database, retry framework, fallback, self-healing, automatic rebase or conflict resolution.
- Worker leaves the fourteen-file Diff unstaged. Only the existing Controller may run Router verification, stage exact observed paths and create the Task candidate commit after all gates pass.
- Contract acceptance, Stage push, T06 branch/worktree creation, one-shot execution, Task push, Stage integration, Formal Review and Stage→main integration are separate permissions.

## Non-goals

- modifying or re-testing production source, Bridge source, product runtime, Room protocol, SQLite, Claude Runner, MCP/CLI, Plugin or package metadata;
- changing the native app-server interface, generic Result grammar, model policy mapping, scheduler, recovery, Git gates or GitHub lifecycle;
- authorizing native multi-agent for T06;
- accepting T06, approving S03, pushing any branch or modifying `main`;
- reviving `room:status --help`, S01 routing or the obsolete S02 placeholder as a dispatch source;
- documenting hypothetical Codex capability not exercised by the integrated implementation.

## Acceptance criteria

1. Actual changed files are exactly the fourteen owned governance paths and every changed statement is supported by integrated source/tests/Git facts.
2. All fourteen documents agree that S02 native Worker/generic Result is Current at `main=c6f22fa110076a2784a39702c18a7c6ba99199db`, while T06 edits remain an S03 candidate until accepted and integrated.
3. The documented native lifecycle matches fresh ephemeral thread, exact worktree `cwd`, model/effort, sandbox, matching terminal evidence, reroute rejection and no-fallback behavior.
4. The documented generic Result fields/statuses and separated authority owners match `controller.mjs`; no Worker-owned native, verification, ownership or candidate SHA claim is introduced.
5. The documented candidate sequence preserves all current Git observation, exact-path staging, verification, mechanical, Supervisor, dependency, push, cherry-pick, candidate publication and fixed-Chat gates.
6. Agent Room product runtime and Claude Code boundaries remain unchanged; no protocol/ADR/operations update is claimed.
7. All changed relative Markdown links resolve; no unresolved merge marker, whitespace error or duplicated Current authority is introduced.
8. After Worker verification, the existing Controller creates exactly one Conventional Commit on the T06 task branch from the exact fourteen observed paths; Worker itself performs no Git write.

## Verification

| Check | Detects | Decision if failed |
|---|---|---|
| `node --test tools/codex-github-bridge/tests/*.test.mjs` | regression in the existing Local Bridge native Worker, Result, Controller, Router verification or delivery boundaries described by T06 | `blocked`; do not create candidate commit |
| `git diff --check` | whitespace or patch-format defect in the exact fourteen-file candidate | `blocked`; do not create candidate commit |
| exact changed-path / Worker `changed_files` consistency | observed path drift or a self-report that does not match the Git working set | `blocked`; do not stage or commit |
| no S01/S02 historical Stage modification | mutation of immutable accepted Stage history | `blocked`; return `needs_decision` if correction requires historical edits |
| Current authority consistency | stale, speculative, duplicated or wrongly-owned native/Result/Git/Review claim | `blocked`; correct within scope or return `needs_decision` |
| Agent Room Claude runtime and Local Codex development surface distinction | accidental rewrite of product runtime/Claude behavior while documenting repository development | `blocked`; correct within scope or return `needs_decision` |
| relative Markdown link audit for the exact fourteen changed T06 implementation files | broken authority/document navigation | `blocked`; correct within scope before delivery |
| merge marker audit for the exact fourteen changed T06 implementation files | unresolved document conflict | `blocked`; do not create candidate commit |

Do not modify Bridge tests; run the existing suite. Do not run unrelated product suites for this documentation Task. The six non-command checks remain `runVerification()` supervisor-check evidence; they must not be converted to shell commands or a shell fallback. Stage Actions performs the existing complete mechanical candidate verification after integration.

## Documentation updates

This Task is the exact fourteen-file documentation synchronization. Do not create an additional document or index. After S03 Formal Review, Codex performs the mandatory documentation impact audit; only the exact reviewed and user-accepted Stage head may be promoted to Current project documentation through separately authorized Stage→main integration.

## Question policy

Return `needs_decision` and stop if integrated source/tests contradict this Contract, correct documentation requires any fifteenth path, a fourteen-path statement would change product architecture/protocol, or native execution cannot honor exact model/effort/worktree/no-fallback boundaries. Do not hide an implementation discrepancy with documentation and do not reduce the exact fourteen-file scope.

## Required Coding Result

The final message must contain exactly one task-generic mapping with each known field exactly once:

```yaml
task_id: T06-native-codex-thread-contracts
dispatch_id: wf15-s03-t06-native-codex-thread-contracts-001
reported_base_sha: <actual immutable S03 dispatch base>
changed_files:
  - AGENTS.md
  - CLAUDE.md
  - PROJECT_RULES.md
  - docs/documents/README.md
  - docs/documents/ARCHITECTURE.md
  - docs/documents/DEVELOPMENT_LOG.md
  - docs/documents/MVP_PLAN.md
  - docs/documents/STAGE_4_LOCAL_PARALLEL_ARCHITECTURE_AMENDMENT.md
  - docs/documents/agent-guides/README.md
  - docs/documents/agent-guides/CODEX_DOCUMENTATION_AUTHORING.md
  - docs/documents/agent-guides/CODEX_REVIEW_AND_PLANNING.md
  - docs/documents/agent-guides/CLAUDE_CODING_AND_FIX.md
  - docs/documents/agent-guides/GIT_AND_PARALLEL_WORKFLOW.md
  - docs/work/wf-increment-015-github-workflow-foundation/SUPERVISOR_ROUTER_AGENT.md
deviations: []
unresolved: []
questions: []
status: implementation_ready
```

For `blocked` or `needs_decision`, omit `changed_files` only when no complete implementation candidate exists and provide the reason in `unresolved` or `questions`. Do not add `native_backend`, `verification`, `reported_task_head_sha` or a second summary mapping; the Controller independently owns those facts and rejects duplicate known fields.
