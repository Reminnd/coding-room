# PLAN — Increment 16 GitHub Review / Fix / Acceptance Closure

| 字段 | 值 |
|---|---|
| contract_status | `Accepted` |
| confirmed_by_user | `true` |
| increment_id | `increment-016-github-review-fix-acceptance-closure` |
| workflow_id | `wf-increment-016-github-review-fix-acceptance-closure` |
| stage_id | `S01-review-fix-acceptance-closure` |
| baseline_head | `02ca6e1fa54c6aad2120da42f2bd951ae0e6039e` |
| formal_review_authority | `chatgpt_fixed_chat` |
| durable_storage_option | `Option A` |
| stage_bootstrapped | `false` |
| implementation_authorized | `false` |

## Background

Increment 15 established the GitHub/Git、Local Bridge、native Codex Worker、Controller and Supervisor control plane。Increment 16 closes the repository-development lifecycle from exact-SHA mechanical Stage verification and Fixed Chat Formal Review through user-confirmed Fix preparation、exact Fix-bundle acceptance、explicit Worker launch、Stage acceptance and separately authorized non-force Stage-to-main closure。

## Goal

Implement an explicit、typed、idempotent and recoverable Review/Fix/Acceptance/Closure lifecycle without transferring decision authority to GitHub Actions、handoff comments、labels、comment ordering、Local Bridge、Worker、Controller、Supervisor or Agent Room SQLite。

## Authority and architecture decisions

- Git owns commit/ref facts；GitHub Actions/Checks own exact-SHA mechanical verification and Actions observations。
- `chatgpt_fixed_chat` owns Formal Review；the user owns Fix confirmation、acceptance and persistent Git-write authorization。
- Local Bridge/Controller own scheduling、worktree preparation、Worker launch、verification orchestration and Git delivery sequencing；Supervisor only recommends integration readiness。
- `Option A` is the sole lifecycle storage model；no workflow database、Git ledger、hash、checksum or fingerprint is introduced。
- Lifecycle commands are exactly `record-review`、`prepare-fix`、`record-acceptance`、`close-stage`。
- Router modes are exactly `canonical_stage_router` and `prepared_fix_router`；`needs_decision` is a failure result。
- Worker Result remains task-generic；native、verification、ownership and candidate Git identity remain separately owned。
- Fix launch validation precedes scheduler、worktree、Bridge event、dispatch lifecycle and Worker mutation。
- Stage-to-main closure is exact-SHA、non-force and fast-forward-only。

Handoff、mechanical verification、Formal Review、user acceptance and closure authorization are distinct and non-substitutable facts。

## Task DAG

`T01-review-fix-lifecycle-core → T02-review-fix-actions-selector → T03-review-fix-documentation`

- execution policy：`strictly_serial`
- writing parallelism：`none`
- initial Ready Set：`T01-review-fix-lifecycle-core`

## Non-goals

- This persistence does not perform Coding、Stage bootstrap、Bridge、Worker、Supervisor or GitHub write。
- It does not change Room protocol、SQLite、product Runner、Claude Code、Router schema、Task identity、ownership、dependency、model policy or reasoning effort。
- It does not add a fifth lifecycle command、third Router mode、automatic Review/Fix/acceptance/closure、compatibility layer、dependency、rebase、merge commit、force push or automatic conflict resolution。

## Acceptance criteria and user acceptance

- All three Task identities、dispatch IDs、branches、Contract paths、dependencies、ownership and verification are persisted exactly。
- The Router parses with the Current reader and preserves every Task field。
- Router T03 verification mirrors the T03 Exact Task Contract；only the two Fixed Chat-approved non-semantic label normalizations are applied。
- Decision、mechanical and handoff grammars、typed acceptance、failure separation、Fix launch gate、closure tri-state and generic Worker Result remain complete。
- The matrix remains exactly 18 rows plus named `V10`、`V17` and `V18` subcases。

Increment 16 Implementation Contract Fix Round 5 passed Fixed Chat review and was explicitly accepted by the user。The persistence clarification changes neither architecture nor Contract semantics and requires no reacceptance。

Current state is Accepted Contract persistence only：the Stage is not bootstrapped、runtime Stage is not created、Implementation is not authorized and T01 must not start。
