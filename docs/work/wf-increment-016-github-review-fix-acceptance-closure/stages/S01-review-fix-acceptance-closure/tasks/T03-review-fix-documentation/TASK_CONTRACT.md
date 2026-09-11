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

## Documentation updates

Mode is `exact_owned_documentation_synchronization` over every path in scope。

## Question policy

Return `needs_decision` without widening scope if integrated T01/T02 behavior contradicts the frozen lifecycle；correct synchronization requires a forbidden path；Current/Candidate facts conflict；or a new command、authority、record type、ADR or product decision is required。
