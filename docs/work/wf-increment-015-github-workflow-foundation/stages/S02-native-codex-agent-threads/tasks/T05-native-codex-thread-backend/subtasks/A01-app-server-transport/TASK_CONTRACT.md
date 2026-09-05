# INTERNAL SUBTASK CONTRACT — A01-app-server-transport

## Contract

```yaml
status: Proposed / exact Stage-SHA acceptance pending
task_id: A01-app-server-transport
type: T05 Internal Implementation Subtask
parent_task_id: T05-native-codex-thread-backend
goal: correct_the_native_app_server_stdio_transport
model_policy: coding_strong
reasoning_effort: high
fallback_model_policy: none
depends_on: []
read_only: false
git_authority: none
```

## Requirements

1. Preserve the outer T05 one-native-thread-per-Task behavior, exact thread/turn correlation, explicit worktree `cwd`, no backend fallback, and normalized terminal outcomes.
2. Production App Server argv MUST be exactly `["app-server", "--listen", "stdio://"]`. `--stdio` is forbidden. Do not add transport or backend fallback.
3. Update the deterministic fake App Server tests to assert the exact production argv and preserve overlapping-turn, isolation, terminal-status, missing-capability, and no-`codex exec` Worker evidence.
4. Keep the existing process helper boundary minimal. Do not add retry, respawn, compatibility parsing, dependency, or a generic transport/provider abstraction.

## Scope

Writable only:

- `tools/codex-github-bridge/codex-app-server.mjs`
- `tools/codex-github-bridge/codex.mjs`
- `tools/codex-github-bridge/process.mjs`
- `tools/codex-github-bridge/tests/codex.test.mjs`

All other paths are read-only. Do not spawn another writing subagent. Do not run Git writes, commit, push, or publish GitHub events.

## Architecture decisions and non-goals

- `stdio` remains the only production App Server transport for T05.
- App Server process liveness is not Task success.
- Model resolution, Coding Result validation, Supervisor Integration, Git delivery, workflow state, formal Review, T06, and documentation are out of scope.

## Acceptance criteria

- Production and direct test Oracle use the exact explicit supported argv.
- No `--stdio`, alternate transport, `codex exec` Worker fallback, or provider fallback remains in the owned paths.
- Existing native lifecycle and concurrency regressions remain green.
- Actual edits are limited to the four owned paths.

## Verification

| Command | Detects | Decision if failed |
|---|---|---|
| `node --test tools/codex-github-bridge/tests/codex.test.mjs` | wrong App Server argv or regression in native lifecycle, correlation, concurrency, `cwd`, and no-fallback behavior | `blocked` |
| `git diff --check -- tools/codex-github-bridge/codex-app-server.mjs tools/codex-github-bridge/codex.mjs tools/codex-github-bridge/process.mjs tools/codex-github-bridge/tests/codex.test.mjs` | whitespace defects in owned changes | `blocked` |

## Documentation updates

None. This subtask changes only the existing T05 candidate implementation; the Stage planning bundle already freezes the transport contract.

## Question policy

Return `needs_decision` if the explicit supported argv cannot be implemented within the owned files without a dependency, fallback, protocol redesign, or change to `supervisor.mjs`. Otherwise make only the minimum correction.

## Required subtask result

```yaml
task_id: A01-app-server-transport
changed_files: []
verification:
  focused_test:
  diff_check:
transport_argv:
status: candidate_ready | blocked | needs_decision
```
