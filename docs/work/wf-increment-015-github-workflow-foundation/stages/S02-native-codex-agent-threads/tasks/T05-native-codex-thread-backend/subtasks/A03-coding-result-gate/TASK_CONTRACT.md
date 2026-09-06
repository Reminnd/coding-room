# INTERNAL SUBTASK CONTRACT — A03-coding-result-gate

## Contract

```yaml
status: Proposed / exact Stage-SHA acceptance pending
task_id: A03-coding-result-gate
type: T05 Internal Implementation Subtask
parent_task_id: T05-native-codex-thread-backend
goal: preserve_the_complete_required_coding_result_gate
model_policy: coding_strong
reasoning_effort: medium
fallback_model_policy: none
depends_on: []
read_only: false
git_authority: none
```

## Requirements

1. Preserve the current candidate's complete outer T05 Required Coding Result parser and validation gate.
2. A native failure, empty/incomplete result, status-only result, missing required field, invalid nested shape/value, identity mismatch, invalid Task SHA, non-`candidate_ready` terminal result, or enabled fallback MUST remain unable to reach Git fact collection, Task push, Supervisor Integration, or Stage integration.
3. The Root Supervisor, not a child result, produces the unchanged outer T05 Required Coding Result after combined verification. Do not introduce a second child-result schema into Controller production behavior.
4. If the owned candidate is already correct, make no code change and report the focused evidence. Do not refactor the parser or broaden it into generic YAML/schema infrastructure.

## Scope

Writable only when necessary to preserve the accepted gate:

- `tools/codex-github-bridge/controller.mjs`
- `tools/codex-github-bridge/tests/controller.test.mjs`

All other paths are read-only. Do not spawn another writing subagent. Do not run Git writes, commit, push, or publish GitHub events.

## Architecture decisions and non-goals

- The existing outer Required Coding Result remains the sole Worker completion contract.
- App Server transport, model capability inspection, Supervisor implementation, Git delivery, generic result framework, documentation, and T06 are out of scope.

## Acceptance criteria

- The complete Required Coding Result is still required before Git fact collection.
- `blocked` and `needs_decision` results preserve their outer status and never reach Git mutation/integration.
- Direct Controller regressions cover the complete gate and remain green.
- No change is made when the current implementation already satisfies this Contract.

## Verification

| Command | Detects | Decision if failed |
|---|---|---|
| `node --test tools/codex-github-bridge/tests/controller.test.mjs` | any path that bypasses the complete Required Coding Result gate or loses terminal status | `blocked` |
| `git diff --check -- tools/codex-github-bridge/controller.mjs tools/codex-github-bridge/tests/controller.test.mjs` | whitespace defects in owned changes | `blocked` |

## Documentation updates

None.

## Question policy

Return `needs_decision` if preserving the gate requires changing the outer Required Coding Result, `supervisor.mjs`, Git semantics, or another unowned path. Do not weaken the gate to accommodate internal subtask summaries.

## Required subtask result

```yaml
task_id: A03-coding-result-gate
changed_files: []
verification:
  focused_test:
  diff_check:
complete_outer_gate_preserved: true | false
status: candidate_ready | blocked | needs_decision
```
