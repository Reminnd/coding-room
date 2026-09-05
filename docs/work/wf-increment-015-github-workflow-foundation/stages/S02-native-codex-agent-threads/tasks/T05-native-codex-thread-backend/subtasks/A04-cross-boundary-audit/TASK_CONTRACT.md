# INTERNAL SUBTASK CONTRACT — A04-cross-boundary-audit

## Contract

```yaml
status: Proposed / exact Stage-SHA acceptance pending
task_id: A04-cross-boundary-audit
type: T05 Internal Read-Only Audit Subtask
parent_task_id: T05-native-codex-thread-backend
goal: audit_the_combined_t05_candidate_before_root_verification
model_policy: fast_general
reasoning_effort: medium
fallback_model_policy: none
depends_on:
  - A01-app-server-transport
  - A02-capability-model-boundary
  - A03-coding-result-gate
read_only: true
owns: []
git_authority: none
```

## Requirements

Read the combined existing T05 worktree after A01/A02/A03 finish and audit only these reachable cross-boundary invariants:

1. production and test Oracle agree on `["app-server", "--listen", "stdio://"]`; no `--stdio` or transport/backend fallback remains;
2. capability inspection accepts the supported listener boundary while the existing policy resolver still owns concrete model selection and effort validation;
3. native terminal success plus the complete outer Required Coding Result is still required before Git fact collection, Supervisor Integration, push, or Stage integration;
4. A01/A02/A03 actual edits are confined to their disjoint ownership;
5. current candidate changes in `tools/codex-github-bridge/supervisor.mjs` remain present and coherent without further modification.

Do not perform formal Review. Do not edit any file. Do not spawn another subagent. Do not run Git writes, commit, push, or publish GitHub events.

## Non-goals and stop rule

No exhaustive security audit, style review, speculative corner-case search, new test framework, retry, fallback, state store, documentation change, T06 work, or Git operation is authorized.

If a real Contract violation can be fixed wholly by A01/A02/A03 within their accepted scope, report it to Root as `blocked` with the exact owning subtask. If satisfying the accepted outer T05 Contract requires changing `tools/codex-github-bridge/supervisor.mjs` or any other unowned path, return `needs_decision`; do not propose or perform the scope expansion.

## Acceptance criteria

- Every listed invariant is checked against the combined source/tests rather than child self-report alone.
- No file changes occur.
- The result names only actual blocking evidence or states that the combined candidate is ready for Root verification.

## Verification

| Check | Detects | Decision if failed |
|---|---|---|
| Combined source/test ownership and boundary audit | cross-file mismatch that focused child tests cannot establish alone | `blocked` for an in-scope owner; otherwise `needs_decision` |
| `git diff --check` | whitespace defects in the combined T05 candidate | `blocked` |

## Documentation updates

None.

## Question policy

Return `needs_decision` only for a necessary change outside A01/A02/A03 ownership or an unresolved accepted-Contract conflict. Do not invent a workaround.

## Required subtask result

```yaml
task_id: A04-cross-boundary-audit
changed_files: []
audited_boundaries:
  transport:
  capability_model:
  coding_result_gate:
  ownership:
  supervisor_preservation:
status: candidate_ready | blocked | needs_decision
```
