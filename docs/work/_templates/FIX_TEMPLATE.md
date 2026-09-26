# FIX — <fix_id>

- status: Draft | Accepted
- review_id: <origin review>
- review_fixes_only: true
- fix_round_id: <FIX_ROUND_OPENED_V1 identity>
- preparation_id: <FIX_PREPARED_V1 identity>
- task_id: <preallocated task identity>
- dispatch_id: <preallocated immutable dispatch identity>
- source_reference: <closed object with only source_kind and decision_reference>
- confirmed_finding: <invariant and evidence>
- confirmed_solution: <user-approved minimum>
- scope: <owned paths>
- non_goals: <excluded changes>
- acceptance_criteria: <regression evidence>
- verification: <commands>
- question_policy: stop if the confirmed solution cannot fit scope

Candidate Fix 顺序固定为：用户确认后的`FIX_ROUND_OPENED_V1` → immutable `FIX_PREPARED_V1` mapping → verification → exact `STAGE_VERIFICATION_V1` PASS → Fix handoff → typed `FIX_BUNDLE_ACCEPTANCE_V1` → fresh launch。handoff、label、author或机械记录都不能推断 acceptance；launch gate rejection不得发布 lifecycle event或消费预分配`dispatch_id`。
