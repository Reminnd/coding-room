# EXECUTION PLAN — Increment 16 GitHub Review / Fix / Acceptance Closure

| 字段 | 值 |
|---|---|
| contract_status | `Accepted` |
| confirmed_by_user | `true` |
| baseline_head | `02ca6e1fa54c6aad2120da42f2bd951ae0e6039e` |
| stage_branch | `stage/wf-increment-016-github-review-fix-acceptance-closure/S01-review-fix-acceptance-closure` |
| stage_bootstrapped | `false` |
| implementation_authorized | `false` |
| fix_policy | `always_confirm` |

## 1. Exact DAG and task identities

| Order | Task | Dispatch | Dependency |
|---:|---|---|---|
| 1 | `T01-review-fix-lifecycle-core` | `wf16-s01-t01-review-fix-lifecycle-core-001` | none |
| 2 | `T02-review-fix-actions-selector` | `wf16-s01-t02-review-fix-actions-selector-001` | T01 |
| 3 | `T03-review-fix-documentation` | `wf16-s01-t03-review-fix-documentation-001` | T02 |

Execution is strictly serial and `writing_parallelism=none`。Ownership and verification are authoritative in the three linked Task Contracts under [S01](./stages/S01-review-fix-acceptance-closure/STAGE.md)。

## 2. Router modes

- `canonical_stage_router`：no logical strict-valid current `FIX_PREPARED_V1` binds the exact current Stage head and no malformed/conflicting fact makes that conclusion ambiguous；Fix acceptance is not required。
- `prepared_fix_router`：exactly one strict-valid current `FIX_PREPARED_V1` binds the exact current Stage head with no conflict or ambiguity。Actions order is exact-SHA verification → `STAGE_VERIFICATION_V1 PASS` → exact Fix-bundle handoff；Actions neither requires acceptance nor launches Worker。
- old-SHA preparation is historical evidence。Conflict、malformed or ambiguous current authority returns `needs_decision` before handoff mutation。

## 3. Lifecycle and grammars

Normal：canonical Router → Ready Task → handoff → fresh `start`/`run-once` → common gate → worktree → `task_dispatched` → Worker → verification → controlled integration → Router re-evaluation。S01 order is T01 → T02 → T03 → exact-head verification → `CHAT_REVIEW_HANDOFF_V1`。

Fix：`FORMAL_REVIEW_V1 REQUEST_CHANGES` → exact user confirmation → fresh `prepare-fix` → `FIX_ROUND_OPENED_V1` → immutable bundle/preallocated IDs → prepared commit → `FIX_PREPARED_V1` → exact non-force push → verification/PASS → Fix handoff → typed Fix acceptance → fresh `start`/`run-once` → Fix launch gate → same preallocated dispatch → Worker。

Closure：exact-head PASS → Review handoff → `FORMAL_REVIEW_V1 PASS` → `STAGE_ACCEPTANCE_V1` → separate `STAGE_CLOSURE_AUTHORIZATION_V1` → fresh `close-stage` → Host approval → exact non-force fast-forward → `STAGE_CLOSED_V1` → labels → PR close。

Decision records use `CODEX_DECISION_RECORD_V1` and exactly five types：`FORMAL_REVIEW_V1`、`FIX_ROUND_OPENED_V1`、`FIX_BUNDLE_ACCEPTANCE_V1`、`STAGE_ACCEPTANCE_V1`、`STAGE_CLOSURE_AUTHORIZATION_V1`。The strict envelope rejects duplicate/missing/unknown/extra/null/defaulted/coerced fields and requires closed caller-supplied `source_reference`。

Mechanical records use `CODEX_GITHUB_LIFECYCLE_RECORD_V1` and exactly `FIX_PREPARED_V1`、`STAGE_VERIFICATION_V1`、`STAGE_CLOSED_V1`；they cannot create decision authority、Formal Review、acceptance、Worker authority or closure authorization。Review and Fix handoffs are separate projections and non-substitutable。

## 4. Typed acceptance and launch gate

`record-acceptance --record-type` is mandatory、has no default and accepts only `FIX_BUNDLE_ACCEPTANCE_V1 | STAGE_ACCEPTANCE_V1`。Identity is `[record_type, acceptance_id]`；same type/id/payload reuses、changed payload returns `needs_decision`、equal scalar IDs across types remain distinct。Invalid/missing/mismatched type is zero-write `PRE_MUTATION_FAILURE`。

`BridgeController.run()` completes read-only discovery、exact Router/Task parsing and one batch gate before `fetchStage`、worktrees、scheduler、`publishEvent`、`processResult` or Worker launch。Common predicates require Accepted/confirmed Contracts、exact task/dispatch/path/handoff/Stage lineage and durably known `NOT_STARTED`。Prepared Fix adds exact current preparation/SHA/PASS/handoff/acceptance、structural mapping equality、remote Stage/PR equality and known prior-start state。

Any false、missing、stale、ambiguous or unobservable predicate returns command-level `needs_decision` / `PRE_MUTATION_FAILURE` with zero event、replacement dispatch、worktree、Worker、Git/GitHub or durable dispatch mutation。Only full success permits worktrees → one `task_dispatched` using the original ID → one Worker using cached accepted Contract bytes。

## 5. Recovery and closure

- `PRE_MUTATION_FAILURE` means no external mutation began in this invocation and zero write is guaranteed。
- `POST_MUTATION_UNCERTAIN` means an external mutation began but its effect cannot be proven；stop、perform no dependent mutation、do not blindly retry/rollback and require a fresh invocation that re-reads authority。
- Same identity/payload may be reused；repair only a proven missing later projection；conflict/multiple/unobservable facts return `needs_decision`。

Closure tri-state：main == accepted Stage SHA means no push and only missing terminal projection repair；main == expected baseline means fresh `close-stage`、Host approval and exact `<accepted_stage_sha>:refs/heads/main` with `force=false`；third/unobservable SHA means no push and `needs_decision`。Force、force-with-lease、rebase、merge commit、automatic conflict resolution/retry、wildcard or moving refspec、unattended push and PR merge are forbidden。

## 6. Generic Worker Result

Common fields are `task_id`、`dispatch_id`、`reported_base_sha`、lists `deviations/unresolved/questions` and status `implementation_ready | blocked | needs_decision`。Only `implementation_ready` adds non-empty repository-relative `changed_files`。Native、verification、ownership、candidate identity、Review、acceptance、integration and workflow state remain outside Worker authority。

## 7. Direct Fix launch subcases

| Case | Setup | Required result |
|---|---|---|
| A | Fix handoff exists；acceptance absent | `PRE_MUTATION_FAILURE`；zero mutation |
| B | acceptance exists；PASS stale | zero mutation |
| C | acceptance exists；handoff stale | zero mutation |
| D | prior start unknown/unmatched | `needs_decision`；no new lifecycle fact |
| E | all predicates valid | one worktree、one original dispatch、one launch |
| F | A then valid acceptance then fresh rerun | original dispatch remains usable；no replacement |

A–E run through both `start` and `run-once`；F is a two-invocation durable sequence through each。

## 8. Frozen 18-case verification matrix

| ID | Scenario and direct Oracle | Failure decision |
|---|---|---|
| V01 | `FORMAL_REVIEW_V1 REQUEST_CHANGES` requires non-empty unique findings and cannot launch Fix. | Block lifecycle. |
| V02 | PASS requires explicitly empty findings and creates no acceptance/Git authority. | Block Review recording. |
| V03 | Exact confirmed solution creates one typed Fix round；unconfirmed/widened input writes nothing. | Block Fix preparation. |
| V04 | Fix round、preparation and dispatch IDs are pairwise distinct；mapping immutable. | Block Fix bundle. |
| V05 | Same typed identity/payload reuses without duplicate mutation. | Block idempotency. |
| V06 | Same typed identity/different payload returns `needs_decision` without mutation. | Block lifecycle. |
| V07 | Strict grammar rejects missing authority、implicit/default decisions、duplicate keys and unknown fields before mutation. | Block parser. |
| V08 | Mechanical records、labels and authors cannot satisfy Review、acceptance or execution. | Block authority model. |
| V09 | Prepared Fix verification/handoff precede acceptance；Actions never launches Worker. | Block Fix Actions flow. |
| V10 | Launch requires exact accepted bundle/mapping/handoff/SHA、fresh invocation and known start state. | Block Worker launch. |
| V11 | Review handoff、Formal Review、Stage acceptance and closure authorization remain four facts. | Block closure flow. |
| V12 | Stale Review、handoff、verification、acceptance or Stage SHA cannot pass current gate. | Block transition. |
| V13 | `PRE_MUTATION_FAILURE` proves all mutation spies zero and is never claimed after a possible write. | Block classification. |
| V14 | Comment、label、dispatch and prepared-push response loss use read-before-write；ambiguity stops. | Block retry. |
| V15 | Main-push loss uses exact three-way classification；third-SHA causes no push. | Block closure. |
| V16 | Terminal response loss repairs only missing projection after exact closure；no auto Fix/Worker/merge. | Block terminal processing. |
| V17 | Router selector subcases `a–f` pass through the public Actions selector. | Block T02/T03 dispatch. |
| V18 | Typed acceptance subcases `a–g` pass through public CLI/downstream gates. | Block T01. |

`V17.a–f` cover canonical/no-Fix、T01/T02 sequential unblocking、one exact current Fix、old-SHA history and conflict/malformed/ambiguous zero-handoff rejection。`V18.a–g` cover exact Fix/Stage targets、missing/unknown/mismatched types and cross-type isolation including equal scalar acceptance IDs。

## 9. Fixed Chat handoff and stop

Ready for Fixed Chat requires exact-order integration、exact mapping、per-Task verification、remote Stage head = PR head、all checks and PASS on that head、all 18 rows/subcases、exact Review handoff、consistent code/tests/templates/docs and no unresolved Worker/Controller/Supervisor result or `POST_MUTATION_UNCERTAIN`。Stage change、stale verification、mapping/ownership/dependency drift、observer failure or unresolved mutation invalidates readiness。

The gate cannot create Formal Review、acceptance、main-write authority、merge or close。The Contract is Accepted, but Stage bootstrap and Implementation remain unauthorized；do not begin T01。
