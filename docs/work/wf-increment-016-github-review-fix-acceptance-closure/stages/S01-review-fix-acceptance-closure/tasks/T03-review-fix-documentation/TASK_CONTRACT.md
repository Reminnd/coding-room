# TASK CONTRACT — T03 Review / Fix Documentation

## Contract

```yaml
task_id: T03-review-fix-documentation
dispatch_id: wf16-s01-t03-review-fix-documentation-001
type: Implementation Task
status: Accepted
confirmed_by_user: true
implementation_authorized: false
depends_on:
  - T02-review-fix-actions-selector
task_branch: task/wf-increment-016-github-review-fix-acceptance-closure/T03-review-fix-documentation
task_contract_path: docs/work/wf-increment-016-github-review-fix-acceptance-closure/stages/S01-review-fix-acceptance-closure/tasks/T03-review-fix-documentation/TASK_CONTRACT.md
model_policy: coding_strong
reasoning_effort: high
fallback_model_policy: null
```

This Accepted Contract is not dispatch authority。S01 is not bootstrapped and Implementation remains unauthorized。

## Background

T01 and T02 implement the accepted lifecycle behavior。T03 synchronizes the exact authority documents and templates without modifying implementation or promoting candidate behavior before integration。

## Goal

Make all T03-owned documents and templates describe the same Router、authority、acceptance、launch、recovery and closure behavior as the integrated implementation。

## Requirements

1. Document `Option A` and every authority owner；keep decision、mechanical and handoff grammars distinct。
2. Document closed nested caller-supplied `source_reference` and exactly four lifecycle commands。
3. Document `record-acceptance --record-type`、both legal target types、typed identity and cross-type isolation。
4. Document normal canonical and prepared Fix Router modes and the Current-reader-compatible initial Router grammar。
5. Preserve Fix ordering：verification → PASS → Fix handoff → acceptance；Actions does not launch Worker。
6. Document the batch pre-dispatch launch gate before scheduler、worktree、event and dispatch mutation；rejection is command-level zero-event `PRE_MUTATION_FAILURE` and does not consume the preallocated dispatch。
7. Document exact cached Contract-byte launch behavior and `POST_MUTATION_UNCERTAIN` stop/recovery semantics。
8. Document exact non-force closure/main tri-state；preserve generic Worker Result。
9. Preserve T01 → T02 → T03、exact ownership and exactly 18 frozen verification rows plus named subcases。
10. Keep Increment 16 Candidate until implementation Review、user acceptance and integration；update indexes、Documentation Map and relative links only during authorized T03 Coding。

## Architecture decisions

- `Option A` remains the sole lifecycle storage model；Fixed Chat owns Formal Review；the user owns acceptance and Git-write authorization。
- Actions owns only mechanical verification/projections；normal and prepared Fix Router paths remain distinct；record families and handoffs remain non-substitutable。
- Worker Result remains task-generic；Stage-to-main closure remains exact-SHA、non-force、fast-forward-only。
- Candidate behavior is not Current before acceptance and integration。

## Scope and exact ownership

- `AGENTS.md`
- `PROJECT_RULES.md`
- `docs/documents/README.md`
- `docs/documents/ARCHITECTURE.md`
- `docs/documents/DEVELOPMENT_LOG.md`
- `docs/documents/MVP_PLAN.md`
- `docs/documents/OPERATIONS.md`
- `docs/documents/STAGE_4_LOCAL_PARALLEL_ARCHITECTURE_AMENDMENT.md`
- `docs/documents/agent-guides/README.md`
- `docs/documents/agent-guides/CODEX_REVIEW_AND_PLANNING.md`
- `docs/documents/agent-guides/GIT_AND_PARALLEL_WORKFLOW.md`
- `docs/documents/agent-guides/CHAT_GITHUB_REVIEW.md`
- `docs/work/README.md`
- `docs/work/_templates/ROUTER_CONTRACT_TEMPLATE.md`
- `docs/work/_templates/TASK_CONTRACT_TEMPLATE.md`
- `docs/work/_templates/FIX_TEMPLATE.md`
- `docs/work/_templates/STAGE_TEMPLATE.md`
- `docs/work/_templates/CHAT_REVIEW_HANDOFF_TEMPLATE.md`

Explicitly forbidden：`CLAUDE.md`、`docs/documents/ROOM_PROTOCOL.md`、`docs/documents/agent-guides/CODEX_DOCUMENTATION_AUTHORING.md`、`tools/**`、`.github/**`、`src/**` and `tests/**`。

## Constraints

```yaml
root_worker: sole_writer
required_fresh_read_only_subagents: 2
maximum_subagents: 2
subagent_fallback: forbidden
backend_doc_authoring_required: true
T02_integrated_before_dispatch: true
git_writes_by_worker: forbidden
scope_expansion: needs_decision
```

## Non-goals

- implementation、tests or workflow changes；Room protocol、SQLite、MCP or product Runner changes；
- fifth lifecycle command、new authority/storage/ADR/dependency、Contract acceptance or immutable Increment 15 history rewrite；
- editing the pre-existing `CODEX_DOCUMENTATION_AUTHORING.md` EOL/stat noise。

## Acceptance criteria

- All 18 owned files form the exact T03 changed set and use the same closed schemas as implementation。
- No fifth command、third Router mode、acceptance inference、canonical Fix gate leak、rejected-launch event/dispatch consumption or post-mutation zero-write claim appears。
- Exact closure bindings and the exact 18-row matrix remain；Current/Candidate status is accurate。
- Relative links、indexes and Documentation Map agree；no merge marker or duplicate Current authority exists。

## Verification

| Kind | Command or check | Detects | Decision if failed |
|---|---|---|---|
| command | `git diff --check` | patch-format defects | correct only owned paths |
| command | `npm run typecheck` | template/type consumer regressions | blocked |
| command | `npm test` | repository regressions | blocked |
| check | `relative Markdown link and Documentation Map audit` | broken navigation or duplicate authority | blocked |
| check | `decision/mechanical/handoff, Router-mode, four-command, lifecycle-order and failure-semantics audit` | authority or lifecycle documentation drift | blocked |
| check | `merge marker audit` | unresolved document conflict | blocked |

The Router `verification` array must mirror the six names above in the same order。The capitalization of `Documentation Map` and the absence of the obsolete word `grammar` after `handoff` are the Fixed Chat-approved non-semantic persistence clarification；no other verification entry changes。

## One-time T03 baseline-equivalence verification amendment

This amendment is strictly limited to the existing T03 lineage：

```yaml
task_id: T03-review-fix-documentation
dispatch_id: wf16-s01-t03-review-fix-documentation-001
workflow_id: wf-increment-016-github-review-fix-acceptance-closure
stage_id: S01-review-fix-acceptance-closure
maintenance_parent_stage_sha: b135a4fc3fa06421b33eedbc58a92976634968f8
existing_failure_scope: plugin-packaging CRLF/LF baseline outside T03 ownership
accepted_exception: baseline_equivalent_no_new_regression
```

This amendment applies only to the first accepted Stage descendant produced by
this exact Contract-maintenance operation, where：

- the Stage commit has exactly one parent equal to
  `b135a4fc3fa06421b33eedbc58a92976634968f8`；
- the commit changes exactly this T03 `TASK_CONTRACT.md` and no other path；
- Fixed Chat separately accepts the resulting exact Stage SHA and exact T03
  Contract blob before T03 implementation begins。

That accepted descendant becomes the exact T03 dispatch base。This amendment
does not apply to another Task、dispatch、Stage lineage、replacement dispatch or
later unrelated base。

`npm test` exiting 0 remains the standard full-regression success condition。
A non-zero T03 full regression may be classified only as
`baseline_equivalent_no_new_regression`, and only if every condition below is
satisfied：

1. A clean detached checkout of the exact accepted T03 dispatch base reproduces
   exactly 409 total tests、403 passed and 6 failed。
2. The T03 candidate produces exactly 409 total tests、403 passed and 6 failed。
3. The exact failing-test identity sets of dispatch base and T03 candidate are
   identical。
4. The corresponding failure evidence for every failed test is exactly
   identical。
5. Every failure remains inside the existing `plugin-packaging` CRLF/LF
   baseline outside T03 ownership。
6. `t03_new_regressions == 0`。
7. `git diff --check` passes。
8. `npm run typecheck` passes。
9. `relative Markdown link and Documentation Map audit` passes。
10. `decision/mechanical/handoff, Router-mode, four-command, lifecycle-order and failure-semantics audit`
    passes。
11. `merge marker audit` passes。
12. The actual T03 candidate changed-file set is exactly the 18 owned paths
    declared by this Contract and contains no other path。

If any condition is not satisfied, the result remains `blocked`；do not
deliver。

The full suite MUST NOT be described as green or passed while it exits
non-zero。The only permitted non-zero classification under this one-time
amendment is：

```text
baseline_equivalent_no_new_regression
```

This amendment does not authorize modification of：

- `tests/plugin-packaging.test.ts`；
- Plugin files or Plugin Markdown；
- line-ending configuration；
- `CLAUDE.md`；
- `docs/documents/ROOM_PROTOCOL.md`；
- `docs/documents/agent-guides/CODEX_DOCUMENTATION_AUTHORING.md`；
- `tools/**`；
- `.github/**`；
- `src/**`；
- `tests/**`；
- any path outside exact T03 ownership。

It does not authorize a fifth lifecycle command、third Router mode、new
authority/storage/ADR/dependency、automatic conflict resolution or scope
expansion。

The normal T03 implementation constraints remain unchanged：

```yaml
root_worker: sole_writer
required_fresh_read_only_subagents: 2
maximum_subagents: 2
subagent_fallback: forbidden
backend_doc_authoring_required: true
T02_integrated_before_dispatch: true
git_writes_by_worker: forbidden
scope_expansion: needs_decision
```

This Contract-maintenance operation does not consume or waive those two fresh
read-only subagents。They remain mandatory when a separately authorized T03
implementation actually begins。

This amendment does not authorize：

- changing `implementation_authorized: false`；
- T03 Worker launch；
- T03 task worktree creation；
- `task_dispatched` publication；
- T03 candidate commit by the Worker；
- T03 Task branch push；
- T03 Stage integration；
- candidate-ready publication；
- Formal Review；
- Stage acceptance；
- Stage-to-main closure；
- PR merge；
- force push。

After this Contract amendment is persisted to the Stage, Fixed Chat must
separately inspect and accept the exact resulting Stage SHA and exact T03
Contract blob。T03 implementation still requires separate explicit user
authorization。

## Documentation updates
Mode is `exact_owned_documentation_synchronization` over every path in scope。

## Question policy

Return `needs_decision` without widening scope if integrated T01/T02 behavior contradicts the frozen lifecycle；correct synchronization requires a forbidden path；Current/Candidate facts conflict；or a new command、authority、record type、ADR or product decision is required。
