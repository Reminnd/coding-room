# TASK CONTRACT — T05R00-native-sandbox-wire-mode

## Contract

```yaml
status: Accepted
confirmed_by_user: true
execution_authorized: false
task_id: T05R00-native-sandbox-wire-mode
type: Native Bootstrap Repair Task
execution_surface: manual_pre_native_codex_exec
manual_pre_native_repair: true
depends_on:
  - T05-native-codex-thread-backend
blocks_execution_of:
  - T05F00-root-multi-agent-prompt-boundary
model_policy: coding_strong
reasoning_effort: medium
fallback_model_policy: none
internal_multi_agent: false
worker_spawned_subagents: false
task_branch: task/wf-increment-015-github-workflow-foundation/T05R00-native-sandbox-wire-mode
```

This revision generates and freezes the exact T05R00 Contract only. It does not accept or execute the repair. Execution requires separate user acceptance of this complete Contract and separate authorization of the one-time pre-native `codex exec` surface.

## Background

T05 is integrated. The fresh T05F00 `run-once` failed before `thread/start` returned a thread: `Invalid request: unknown variant workspaceWrite, expected one of read-only, workspace-write, danger-full-access`. It produced no native thread ID, turn ID, Task candidate or remote Task and did not modify the Stage. T05F00 remains Accepted and unchanged, but its execution is blocked until this repair is integrated.

The locally installed `codex-cli 0.149.1` generated its App Server JSON schema in a temporary directory outside the repository. `v2/ThreadStartParams.json` defines `sandbox` by reference to `SandboxMode`, whose exact enum is:

- `read-only`
- `workspace-write`
- `danger-full-access`

Current production sends `sandbox: workspaceWrite` in `tools/codex-github-bridge/codex-app-server.mjs`. The direct test expects the same invalid value in `tools/codex-github-bridge/tests/codex.test.mjs`; `FakeAppServer` therefore accepts a wire value rejected by the installed protocol.

## Goal

让 native `thread/start` 使用本机 installed App Server 接受的 sandbox wire value，并让 direct test 对该 wire value建立真实回归 Oracle。

## Requirements

1. Change only the `thread/start` sandbox preset from `workspaceWrite` to `workspace-write` in `tools/codex-github-bridge/codex-app-server.mjs`.
2. Change the direct `thread/start` request Oracle in `tools/codex-github-bridge/tests/codex.test.mjs` to the literal `sandbox: workspace-write`.
3. The focused regression MUST fail if production source later sends `workspaceWrite` again.
4. Preserve the existing direct assertions for exact worktree `cwd`, App Server argv, resolved model, `approvalPolicy`, ephemeral thread, turn `cwd`, turn model/effort, terminal thread/turn correlation and absence of `codex exec` Worker fallback.
5. Do not add or modify `turn/start sandboxPolicy`; the current implementation does not use it and the observed failure occurs at `thread/start`.
6. Keep `FakeAppServer` narrow. It does not become a generic installed-protocol validator.
7. Produce one candidate commit on the isolated T05R00 Task branch only after every exact verification command passes. Do not push or integrate from the Coding execution surface.

## Architecture decisions

```yaml
fix_scope: wire_enum_only
wire_authority: installed_codex_app_server_schema
installed_codex_version_at_contract_generation: 0.149.1
installed_thread_start_sandbox_enum:
  - read-only
  - workspace-write
  - danger-full-access
production_defect: workspaceWrite
installed_expected: workspace-write
execution: pre_native_bootstrap_repair
production_native_fallback: false
persistent_compatibility_mode: false
new_dependency: false
router_schema_change: false
multi_agent: false
```

This is an explicit transition repair, not a fallback architecture. The one-time external execution surface exists only because the current native Worker cannot pass `thread/start`. Future native Worker creation failures remain `needs_decision` and MUST NOT trigger `codex exec` automatically.

## Scope

Writable only:

- `tools/codex-github-bridge/codex-app-server.mjs`
- `tools/codex-github-bridge/tests/codex.test.mjs`

Everything else is read-only context.

## Constraints

- Node 24 ESM and existing dependencies only.
- One isolated Task branch, one isolated worktree and one candidate commit.
- No internal multi-agent or subagent execution.
- No Local Bridge native `start` or `run-once` execution for T05R00.
- No push, Stage integration, main write, formal Review, rebase, reset, force push or cleanup from the Coding execution surface.
- Git facts, candidate verification, Supervisor Integration, controlled cherry-pick and non-force Stage push remain later independently authorized operations.

## Non-goals

- modifying `codex.mjs`, `controller.mjs`, `model-router.mjs`, `scheduler.mjs`, `scope.mjs`, `supervisor.mjs`, `git.mjs` or `github.mjs`;
- modifying package files, `docs/documents/**`, T05F00 implementation, T05F01 implementation or the T06 placeholder;
- adding `turn/start sandboxPolicy`;
- adding a sandbox abstraction, protocol validator, dependency, Router field, compatibility mode, retry path or task-ID branch;
- adding `try native → codex exec` or any other production backend fallback;
- retrying T05F00, starting a native run-once, performing formal Review, making PR #6 ready, merging, or writing `main`.

## Acceptance criteria

1. The actual outbound `thread/start` request contains the exact literal `sandbox: workspace-write`.
2. Replacing the production literal with `workspaceWrite` makes `node --test tools/codex-github-bridge/tests/codex.test.mjs` fail at the direct request Oracle.
3. All existing direct assertions named in Requirement 4 remain present and pass.
4. No `turn/start sandboxPolicy`, production fallback, compatibility mode, abstraction, dependency, Router schema change or task-ID special case appears in the Diff.
5. Exactly the two owned files are changed and exactly one candidate commit is created on the isolated T05R00 Task branch.

## Verification

| Command | Detects | Decision if failed |
|---|---|---|
| `node --test tools/codex-github-bridge/tests/codex.test.mjs` | installed wire literal regression and preservation of exact native request, prompt, correlation and no-fallback assertions | `blocked`; do not commit or integrate |
| `node --test tools/codex-github-bridge/tests/*.test.mjs` | regression in the existing Bridge suite | `blocked`; do not commit or integrate |
| `npm run typecheck` | repository TypeScript compatibility | `blocked`; do not commit or integrate |
| `git diff --check` | whitespace and patch-format defects in the owned Diff | `blocked`; do not commit or integrate |

Every command requires an ordinary pass. The historical T05 baseline-equivalence amendment does not apply. `npm test` is not required and MUST NOT be reported as passed.

## Documentation updates

None during repair Coding. This exact planning Contract, plus the Stage/Router/Supervisor planning revision that introduces its bootstrap gate, is the complete T05R00 documentation authority.

## Question policy

Return `needs_decision` and stop if the repair cannot be limited to the exact two owned files and the exact `workspaceWrite` → `workspace-write` wire/Oracle change, if the installed schema evidence has become contradictory, or if a dependency, abstraction, compatibility mode, production fallback, Router change or other scope expansion appears necessary. Do not retry T05F00 or start a native Worker.

## Required Coding Result

```yaml
task_id: T05R00-native-sandbox-wire-mode
status: candidate_ready | blocked | needs_decision
execution_surface: manual_pre_native_codex_exec
reported_task_head_sha: <40-character candidate commit SHA or null>
changed_files:
  - tools/codex-github-bridge/codex-app-server.mjs
  - tools/codex-github-bridge/tests/codex.test.mjs
verification:
  focused: <pass/fail + exact command>
  bridge_suite: <pass/fail + exact command>
  typecheck: <pass/fail + exact command>
  diff_check: <pass/fail + exact command>
deviations: []
unresolved: []
questions: []
```

For `candidate_ready`, the executor creates exactly one Conventional Commit on the T05R00 Task branch and does not push. The Supervisor independently re-reads the candidate commit, parent, changed files, complete Diff, worktree status and verification evidence before any separately authorized controlled integration.
