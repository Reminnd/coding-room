# INTERNAL SUBTASK CONTRACT — A02-capability-model-boundary

## Contract

```yaml
status: Proposed / exact Stage-SHA acceptance pending
task_id: A02-capability-model-boundary
type: T05 Internal Implementation Subtask
parent_task_id: T05-native-codex-thread-backend
goal: align_capability_inspection_with_supported_transport_without_changing_model_policy
model_policy: coding_strong
reasoning_effort: medium
fallback_model_policy: none
depends_on: []
read_only: false
git_authority: none
```

## Requirements

1. Replace the invalid `--stdio` capability assumption with evidence for the supported App Server listener boundary: `--listen` with `stdio://` and documented/default stdio semantics.
2. Keep the existing model policy resolver responsible for mapping `coding_strong` and `fast_general` to a currently available concrete model. Do not place a future concrete model version in this Contract or add a provider registry.
3. Preserve requested `reasoning_effort`, catalog availability checks, and the current no-fallback behavior when a Task declares no fallback policy.
4. Update direct capability/model tests so their fake help output and negative case exercise the supported listener contract rather than the invalid flag.

## Scope

Writable only:

- `tools/codex-github-bridge/model-router.mjs`
- `tools/codex-github-bridge/tests/model-router.test.mjs`

All other paths are read-only. Do not spawn another writing subagent. Do not run Git writes, commit, push, or publish GitHub events.

## Architecture decisions and non-goals

- Existing policy names and resolver ownership remain unchanged.
- No new model policy, concrete future model, transport implementation, Controller gate, dependency, fallback, compatibility layer, or documentation update is in scope.

## Acceptance criteria

- Capability inspection no longer requires or reports support through `--stdio`.
- Supported `--listen`/`stdio://` evidence is directly tested, including a missing-capability `needs_decision` case.
- Existing model availability, effort, and no-fallback tests remain green.
- Actual edits are limited to the two owned paths.

## Verification

| Command | Detects | Decision if failed |
|---|---|---|
| `node --test tools/codex-github-bridge/tests/model-router.test.mjs` | unsupported transport inspection or regression in model-policy/effort/no-fallback resolution | `blocked` |
| `git diff --check -- tools/codex-github-bridge/model-router.mjs tools/codex-github-bridge/tests/model-router.test.mjs` | whitespace defects in owned changes | `blocked` |

## Documentation updates

None.

## Question policy

Return `needs_decision` if the supported listener capability cannot be established without changing policy ownership, hard-coding a future model, adding a dependency/fallback, or editing outside ownership.

## Required subtask result

```yaml
task_id: A02-capability-model-boundary
changed_files: []
verification:
  focused_test:
  diff_check:
model_policy_preserved: true | false
status: candidate_ready | blocked | needs_decision
```
