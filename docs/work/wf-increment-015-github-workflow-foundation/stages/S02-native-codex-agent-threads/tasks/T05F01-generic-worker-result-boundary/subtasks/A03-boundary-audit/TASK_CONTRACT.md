# SUBTASK CONTRACT — A03-boundary-audit

## Contract

```yaml
status: Proposed under outer T05F01 acceptance
task_id: A03-boundary-audit
parent_task_id: T05F01-generic-worker-result-boundary
type: Internal Read-Only Audit Subtask
depends_on:
  - A01-generic-result-production
  - A02-generic-result-tests
  - root_focused_verification
model_policy: fast_general
reasoning_effort: medium
read_only: true
git_authority: none
child_spawned_writing_subagents: false
owns: []
```

This Subtask may run only after A01/A02 complete and Root focused verification passes. It is read-only and MUST NOT modify any file.

## Goal

Audit the combined T05F01 candidate against the exact outer Contract, production authority boundaries, required control-flow order and focused-test evidence.

## Required checks

A03 MUST independently report each boolean:

- `generic_worker_result_boundary=true`
- `permanent_t05_special_case_absent=true`
- `worker_native_self_report_removed=true`
- `worker_verification_self_report_removed=true`
- `candidate_identity_order=true`
- `independent_head_match=true`
- `independent_changed_files_match=true`
- `ownership_preserved=true`
- `native_facts_preserved=true`
- `router_verification_preserved=true`
- `semantic_status_stop_gate=true`
- `supervisor_preserved=true`
- `git_delivery_preserved=true`
- `t05f00_contract_governed_root_delegation=true`

The audit MUST inspect the complete combined Diff and the focused verification result. It MUST distinguish identity agreement from Router ownership and must verify that `blocked`/`needs_decision` stop before Git facts.

## Finding routing

- A production defect in `controller.mjs`: return `blocked` with `owner=A01`.
- A test/evidence defect in `controller.test.mjs`: return `blocked` with `owner=A02`.
- A change required in any other production file: return `needs_decision` and identify the path/reason.
- No finding: state that the combined boundary is correct and return `candidate_ready`.

Do not edit, fix, reformat, commit, push, checkout, rebase, spawn a writing child, perform formal Review or expand scope.

## Required Audit Result

```yaml
task_id: A03-boundary-audit
read_only: true
generic_worker_result_boundary: true | false
permanent_t05_special_case_absent: true | false
worker_native_self_report_removed: true | false
worker_verification_self_report_removed: true | false
candidate_identity_order: true | false
independent_head_match: true | false
independent_changed_files_match: true | false
ownership_preserved: true | false
native_facts_preserved: true | false
router_verification_preserved: true | false
semantic_status_stop_gate: true | false
supervisor_preserved: true | false
git_delivery_preserved: true | false
t05f00_contract_governed_root_delegation: true | false
owner: A01 | A02 | none
findings: []
unresolved: []
questions: []
status: candidate_ready | blocked | needs_decision
```
