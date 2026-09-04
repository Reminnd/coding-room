# S01 Review Fix Plan — Final Local Parallel Bridge Migration

> Review ID: `review-wf15-s01-final-local-parallel-001`
> Scope: `review_fixes_only`
> Status: `Accepted`
> Coding authorized: `true`
> Formal Review authority: `chatgpt_fixed_chat`

## 1. Purpose

This plan fixes only the confirmed findings from the formal review of
`wf-increment-015-github-workflow-foundation / S01-foundation-pilot`.

The user has explicitly selected **Bootstrap option B**:

```text
S01 itself is the one-time bootstrap trust root.
S01 does not require the repository_dispatch verifier to already exist on main.
After the exact S01 Stage SHA passes equivalent mechanical verification,
fixed Chat performs formal Review, the user accepts that exact SHA,
and main is advanced by non-force fast-forward.
From S02 onward, the normal GitHub Actions candidate verification path is mandatory.
```

Do not create S00, a bootstrap runtime mode, fallback verifier, second workflow state,
retry framework, compatibility layer, or alternative review authority.

## 2. Planning Git facts

These are planning-time facts and MUST be re-read from Git/GitHub at dispatch because
branch heads are external state.

```yaml
repository: Reminnd/coding-room
workflow_id: wf-increment-015-github-workflow-foundation
stage_id: S01-foundation-pilot
stage_branch: stage/wf-increment-015-github-workflow-foundation/S01-foundation-pilot
planning_stage_head: 46a74692dff6393c97e9a46c7bf2bdb53bfbe6ac

already_integrated:
  T01-router:
    source_task_sha: 98838831343ffc7410a0e880309c4c3988142c67
    stage_commit_sha: 46a74692dff6393c97e9a46c7bf2bdb53bfbe6ac

reviewed_source_candidates:
  T02-actions: 01708f647259973bae0ac59eafd09d344170063b
  T03-docs: 17e36ca30083c4907142b791a85ae51fded33630
  T04-bridge: 6dfa570bf1f9240caf9f32d6140eacaa18bdf8c3
```

The three reviewed source candidates remain read-only evidence. Do not rewrite,
force-push, rebase, or mutate those branches.

## 3. Confirmed findings and disposition

| Finding | Severity | Disposition |
|---|---|---|
| F1 — S01 `repository_dispatch` verifier cannot bootstrap itself from non-default branch | High | Resolved by user decision B. No implementation workaround, no S00. |
| F2 — Actions publishes `LOCAL_CODEX_DISPATCH_HANDOFF_V1`, Bridge searches old `CODEX_DISPATCH_HANDOFF_V1` | High | Fix in F01 + F02 using one exact Current dispatch marker. |
| F3 — Bridge candidate completion does not emit the `stage_candidate_ready` repository dispatch consumed by Actions; payload naming is inconsistent | High | Fix F01 + F02. S01 itself still uses bootstrap verification; the event is the normal S02+ path. |
| F4 — Current Increment 15 Plan / Execution Plan / Stage docs remain old Cloud/Pilot state | High | Fix in F04 after code/authority fixes are integrated. |
| F5 — Task/Stage push does not re-read remote ref SHA | Medium | Fix in F02 with exactly one post-push remote ref read and exact equality check. |
| F6 — Router template invents V2/static runtime fields incompatible with frozen V1 reader | Medium | Fix in F03. Keep `ROUTER_CONTRACT_V1`; runtime SHA/worktree/model resolution remain runtime facts. |
| F7 — Current authority/templates still route to Superseded Cloud/Subtask semantics | Medium | Fix in F03; F04 updates only current Increment lifecycle docs. |

## 4. Frozen protocol decisions for this Fix

### 4.1 Dispatch-ready handoff

Use one exact marker:

```text
<!-- LOCAL_CODEX_DISPATCH_HANDOFF_V1 -->
```

The structured handoff uses these Current names:

```yaml
status: dispatch_ready
repository:
pr_number:
workflow_id:
stage_id:
router_contract_path:
contract_commit_sha:
stage_branch:
stage_head_sha:
execution_surface: local_codex
```

Do not support the old `<!-- CODEX_DISPATCH_HANDOFF_V1 -->` marker as a fallback.
Do not accept both names.

### 4.2 Candidate-ready event

The Local Bridge publishes one GitHub repository dispatch when all required Stage tasks
are integrated:

```yaml
event_type: stage_candidate_ready
client_payload:
  status: candidate_ready
  repository:
  pr_number:
  workflow_id:
  stage_id:
  router_contract_path:
  stage_branch:
  stage_head_sha:
```

Optional durable integration mappings may remain in the candidate comment/handoff,
but Actions must not require a second payload schema for the same fact.

Use `router_contract_path` everywhere. Do not keep `router_path` compatibility.

### 4.3 S01 bootstrap exception

For **S01 only**:

```text
all Fix tasks integrated
→ exact Stage SHA frozen
→ equivalent mechanical verification executed against that exact SHA
→ fixed Chat reads exact PR head + full diff + Contracts + verification evidence
→ user accepts exact SHA
→ non-force FF main
```

S01 formal Review does not require an Actions-produced `Ready + chat-review` state,
because the candidate verifier is being introduced by S01 itself.

Do not encode this as an application/runtime `if S01` branch.
It is a one-time development lifecycle decision.

From S02 onward:

```text
candidate_ready
→ repository_dispatch(stage_candidate_ready)
→ GitHub Actions exact-SHA mechanical verification
→ Ready + chat-review
→ fixed Chat formal Review
→ user accepts exact SHA
→ non-force FF main
```

## 5. Fix DAG

```text
Initial Ready Set
{
  F01-actions-protocol,
  F02-bridge-delivery,
  F03-docs-authority
}

F01-actions-protocol ─┐
F02-bridge-delivery ──┼─→ F04-stage-lifecycle-docs
F03-docs-authority ───┘
```

Why F04 is not launched initially:

- `PLAN.md`, `EXECUTION_PLAN.md`, and `STAGE.md` describe lifecycle state.
- They must not guess future integration facts.
- F04 starts only after the first three fixes are actually integrated.
- This is a real dependency, not defensive serialization.

## 6. Task model routing

The Router stores stable policy names rather than hard-coding a model version.

| Task | Policy | Reasoning | Prompt strategy |
|---|---|---:|---|
| F01 Actions protocol | `coding_strong` | medium | Declarative event/state-table reasoning; preserve existing exact-head gates; minimize YAML/shell edits. |
| F02 Bridge delivery | `coding_strong` | high | Git topology and external-boundary invariants; use real temp remotes; no retry/provider abstractions. |
| F03 Docs authority | `fast_general` | medium | Frozen architecture; build a source-of-truth matrix, then remove Current contradictions without redesign. |
| F04 Lifecycle docs | `fast_general` | low | Small fact synchronization task; write only verified current lifecycle state and Bootstrap-B history. |

At runtime, the Supervisor resolves each policy against the actually installed Local Codex
capabilities. If the requested policy cannot be resolved and no explicit fallback exists,
return `needs_decision`. Never silently substitute a model.

## 7. Worker branch strategy

Every Fix Worker still gets one independent worktree and one Fix task branch.

Initial F01/F02/F03 branches are created from the same frozen actual Stage head.

The reviewed source candidate is read-only evidence. To avoid rewriting old task branches
and to preserve a single corrected candidate commit:

```text
new Fix branch from frozen Stage base
→ materialize only the reviewed source candidate changes needed inside this Fix task's owned paths
→ apply confirmed Review fixes
→ run focused verification
→ create one Fix candidate commit
```

A Worker may use `git cherry-pick --no-commit <reviewed_source_sha>` only when the reviewed
candidate touches exclusively its owned paths. If ownership is split, materialize only owned
paths. A Git conflict is a real Git boundary failure: abort/stop and report `blocked`.
Do not add automatic conflict resolution.

F04 starts from the actual Stage head after F01/F02/F03 integration and does not need to
reconstruct an old candidate commit.

## 8. Boundary-validation rule

Validate only real boundaries:

```text
Router Markdown/JSON input
Git/GitHub branch/ref/API facts
reviewed source candidate SHA existence
filesystem/worktree
git/codex/test process exit
Git remote ref after push
Local Codex model/capability resolution
```

After parsing/validating boundary data into internal typed structures, trust it.
Do not repeatedly validate internal objects created by the program itself.

Specifically forbidden for this Fix:

```text
retry loops for push/read
poll-until-consistent loops
fallback GitHub event
old/new marker compatibility
router V1/V2 compatibility
generic provider registry
generic event bus
local state database
lease / heartbeat
automatic stale-recovery framework
automatic rebase
automatic conflict resolution
force push
```

## 9. Integration order

F01/F02/F03 may complete in any order. The Supervisor integrates any eligible completed
candidate immediately using stable order only if multiple become eligible at the same instant.

For each task:

```text
mechanical gate
→ Supervisor Integration
→ push Fix task branch
→ read exact remote task ref once and require equality
→ controlled cherry-pick source Fix commit into Stage
→ push Stage
→ read exact remote Stage ref once and require equality
→ record source_task_sha → stage_commit_sha
```

No formal Review occurs at task level.

## 10. S01 completion after Fix integration

After F04 is integrated:

1. Re-read exact remote Stage SHA.
2. Confirm all required original work plus Fix tasks are represented in the Stage and no task is blocked/needs_decision.
3. Run the Bootstrap-B mechanical suite against that exact Stage SHA:

```text
node --test tests/router-contract-reader.test.ts
node --test tools/codex-github-bridge/tests/*.test.mjs
npm run typecheck
npm test
git diff --check
```

4. Re-read the Stage PR head and require exact equality with the verified SHA.
5. Produce a fixed-Chat Review handoff that explicitly states:

```yaml
bootstrap_verification: S01_option_B
actions_candidate_verifier_used: false
verified_stage_sha: <exact SHA>
formal_review_authority: chatgpt_fixed_chat
```

Do not fake an Actions `Ready + chat-review` result for S01.
Do not write `main`.

## 11. Acceptance criteria for this Fix Plan

The Fix is ready for a new formal Review only when:

- F2–F7 are addressed exactly by their assigned task;
- F1 remains resolved by Bootstrap B without new runtime architecture;
- frozen Router schema remains V1;
- Actions and Bridge use the same exact dispatch marker and payload names;
- Bridge emits the S02+ `stage_candidate_ready` event;
- remote task and Stage push results are confirmed by one exact remote-ref re-read;
- Current docs no longer route normal development through Codex Cloud/Work/Subtask;
- Increment 15 Plan/Execution/Stage describe the actual Final Local Parallel migration and the one-time S01 Bootstrap-B review path;
- all required tests/audits pass;
- exact Stage SHA is mechanically verified before fixed Chat Review;
- `main` remains untouched until user acceptance.

## 12. Authorization state

The user explicitly confirmed this Fix Plan, Router, and every Fix Task Contract for Coding.

```yaml
status: Accepted
confirmed_by_user: true
coding_authorized: true
stage: FIX_PLAN_READY / CODING
```
