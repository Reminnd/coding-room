# TASK CONTRACT — T05R01-native-linked-worktree-git-sandbox

## Contract

```yaml
status: Accepted
confirmed_by_user: true
execution_authorized: false
task_id: T05R01-native-linked-worktree-git-sandbox
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
task_branch: task/wf-increment-015-github-workflow-foundation/T05R01-native-linked-worktree-git-sandbox
router_dispatchable: false
```

This revision generates and freezes the exact T05R01 Contract only. It does not accept or execute the repair, run `npm ci`, start T05F00 `-003`, or authorize any Host mechanical commit. Execution requires separate user acceptance of this complete Contract and separate authorization of the one-time `manual_pre_native_codex_exec` surface.

## Background

T05 and T05R00 are integrated. T05R00 demonstrated the remaining linked-worktree boundary: its Worker could modify owned files and pass verification, but final `git commit` required a write to linked-worktree Git metadata outside the Worker worktree and was rejected at `.git/worktrees/.../index.lock` by the `workspace-write` sandbox.

Current production keeps `thread/start.sandbox=workspace-write` but does not send an explicit stable `turn/start.sandboxPolicy`. The native Worker therefore receives only its Task worktree as the effective writable workspace and cannot reliably complete the required candidate commit in a linked Git worktree.

T05F00 dispatch `wf15-s02-t05f00-root-multi-agent-prompt-boundary-003` remains `Accepted`, `confirmed_by_user=true`, and has no Bridge event. Its worktree and Host `npm ci` were prepared at Stage `fc126bb1f7d52b51787970ca62786362a8c7b1c9`; this planning commit advances Stage and makes that environment stale. T05F00 execution is blocked until T05R01 is separately accepted, implemented and integrated, followed by process STOP and a separately authorized fresh `-003` environment preparation from the new Stage HEAD.

T05R01 is not Router-dispatchable because it repairs the native Worker's own ability to finish a linked-worktree candidate commit. Requiring the unrepaired native Router Worker to commit this repair would depend on the boundary that the repair has not yet changed.

## Goal

让 native Worker 在保持 `workspace-write` 和 `approvalPolicy=never` 的前提下，仅对当前 Task worktree 及 Git 解析得到的 absolute common Git directory 拥有写权限，从而可完成 linked-worktree candidate commit。

## Requirements

1. In `runNativeWorker(...)`, before starting App Server, use existing `runChecked` with `runProcess` to execute exactly `git rev-parse --path-format=absolute --git-common-dir` with `cwd` equal to the exact Task `worktree`.
2. Trim the command stdout and require the resolved `gitCommonDir` to be non-empty and absolute. Git is the only common-dir authority.
3. If command execution fails or the result is empty or non-absolute, return the existing normalized `needs_decision` outcome before any App Server process or native thread is launched.
4. Add only the minimal injectable `run = runProcess` parameter to `runNativeWorker(...)` for this read-only resolution. Do not create a Git abstraction.
5. Preserve `thread/start` exactly at `sandbox: workspace-write` and `approvalPolicy: never`; preserve its model, `cwd`, `ephemeral` and `serviceName` behavior.
6. Add this exact stable policy shape to the existing `turn/start` request:

   ```yaml
   sandboxPolicy:
     type: workspaceWrite
     writableRoots:
       - <exact Task worktree>
       - <resolved absolute Git common dir>
     networkAccess: false
   ```

7. Preserve `turn/start.approvalPolicy=never`, model, effort, input and exact Task worktree `cwd`.
8. Preserve existing native thread/turn terminal correlation, reroute rejection, result normalization and absence of `codex exec` Worker fallback.
9. Add direct regression Oracles covering all required request and failure behavior below.

## Architecture decisions

```yaml
repair_scope: linked_worktree_git_metadata_write_boundary
git_common_dir_authority: git_rev_parse
git_common_dir_command:
  - git
  - rev-parse
  - --path-format=absolute
  - --git-common-dir
git_common_dir_cwd: exact_task_worktree
git_common_dir_requirements:
  non_empty: true
  absolute: true
preflight_failure: needs_decision_before_native_launch
process_runner: existing_runChecked_and_runProcess
run_native_worker_injection: run_equals_runProcess
thread_start_sandbox: workspace-write
turn_start_sandbox_policy_type: workspaceWrite
turn_start_writable_roots:
  - exact_task_worktree
  - resolved_absolute_git_common_dir
network_access: false
approval_policy: never
experimental_api: false
production_native_fallback: false
router_schema_change: false
multi_agent: false
```

`thread/start.sandbox` and `turn/start.sandboxPolicy.type` are different stable wire shapes. The former remains `workspace-write`; the latter is `workspaceWrite`.

## Scope

Writable only:

- `tools/codex-github-bridge/codex-app-server.mjs`
- `tools/codex-github-bridge/tests/codex.test.mjs`

Everything else is read-only context.

## Constraints

- Node 24 ESM and existing dependencies only.
- One isolated T05R01 Task branch, one isolated worktree and one candidate commit.
- Before future execution, create the repair worktree from the exact then-current Stage, run Host `npm ci`, and confirm Git is clean.
- Use only stable `turn/start.sandboxPolicy.writableRoots`; do not enable experimental API or protocol fields.
- Writable roots are exactly the Task worktree and the Git-resolved absolute common Git directory, in that order.
- No internal multi-agent or subagent execution.
- No Local Bridge `start` or `run-once` execution for T05R01.
- No push, Stage integration, main write, formal Review, rebase, reset, force push or cleanup from the Coding execution surface.

## Non-goals

- modifying `codex.mjs`, `controller.mjs`, `git.mjs`, `model-router.mjs`, `process.mjs`, Router schema, T05F00 exact Contract, T05F01 or T06;
- manually parsing `.git`, guessing a worktree metadata path, or deriving `.git/worktrees/...` from a Task ID;
- adding `runtimeWorkspaceRoots`, setting `experimentalApi=true`, or using any experimental protocol field;
- adding repository parent, worktree-root parent, the whole agent drive, user home or any other path to `writableRoots`;
- changing either approval policy to `on-request`, changing thread sandbox to `danger-full-access`, or adding interactive approval;
- adding a task-ID special case, fallback, compatibility registry, Git abstraction, dependency, retry path or automatic Host commit;
- executing T05F00 `-003`, cleaning its retained stale worktree, dispatching T05F01/T06, running Supervisor, pushing a Task, cherry-picking, formal Review, merge or main write.

## Direct test requirements

`tools/codex-github-bridge/tests/codex.test.mjs` MUST directly verify:

1. `runNativeWorker` executes exact command `git rev-parse --path-format=absolute --git-common-dir` with `cwd` equal to the exact Task worktree.
2. `thread/start.params.sandbox === 'workspace-write'`.
3. `turn/start.params.sandboxPolicy.type === 'workspaceWrite'`.
4. `turn/start.params.sandboxPolicy.writableRoots` deep-equals `[worktree, resolvedGitCommonDir]` with no additional root.
5. `turn/start.params.sandboxPolicy.networkAccess === false`.
6. `thread/start` and `turn/start` retain `approvalPolicy === 'never'`.
7. Both thread and turn `cwd` remain the exact Task worktree.
8. Existing native terminal thread/turn correlation behavior remains directly covered.
9. A failed, empty or non-absolute common-dir resolution produces `needs_decision` and launches no App Server/native thread.

The tests MUST NOT add a task-ID special case, fallback or compatibility registry.

## Acceptance criteria

1. Git common-dir resolution uses the exact Git command, exact Task worktree `cwd`, existing process helpers, and rejects failed, empty or non-absolute results before native launch.
2. The outbound `thread/start` request preserves exact sandbox, approval, model, `cwd`, `ephemeral` and `serviceName` behavior.
3. The outbound `turn/start` request contains the exact stable `sandboxPolicy` and no experimental field; its writable roots are exactly the Task worktree and resolved absolute common Git directory.
4. Approval remains `never`, network access remains false, and terminal correlation behavior is unchanged.
5. All nine direct test requirements are present and pass.
6. No abstraction, dependency, Router change, task-ID branch, fallback, retry or unrelated behavior appears in the Diff.
7. Exactly the two owned files are changed and, if the sandbox permits it, exactly one candidate commit is created on the isolated T05R01 Task branch.

## Verification

| Command | Detects | Decision if failed |
|---|---|---|
| `node --test tools/codex-github-bridge/tests/codex.test.mjs` | exact Git preflight, stable thread/turn sandbox request, approval, cwd, terminal correlation and no-launch failure Oracles | `blocked`; preserve evidence and do not commit or integrate |
| `node --test tools/codex-github-bridge/tests/*.test.mjs` | regression in the existing Bridge suite | `blocked`; preserve evidence and do not commit or integrate |
| `npm run typecheck` | repository TypeScript compatibility | `blocked`; preserve evidence and do not commit or integrate |
| `git diff --check` | whitespace and patch-format defects in the owned Diff | `blocked`; preserve evidence and do not commit or integrate |

Every command requires an ordinary pass. The historical T05 baseline-equivalence amendment does not apply. `npm test` is not required and MUST NOT be run or reported as passed.

## Execution compatibility

Future T05R01 execution uses `manual_pre_native_codex_exec` in an independent Task branch/worktree created from the exact then-current Stage. Host `npm ci` and clean Git are preconditions; they are not repair Coding or Task deliverables.

Because T05R01 is not integrated while its Worker runs, the Worker's own final `git commit` may still encounter the linked-worktree Git metadata sandbox boundary. If that occurs, preserve the fully verified Diff and return `needs_decision` or `blocked`. Do not expand the sandbox, use `danger-full-access`, retry automatically, or change the implementation scope. A Host mechanical commit completion requires separate user authorization and MUST NOT become a production fallback.

## Documentation updates

None during repair Coding. This exact Contract and the Stage/Router/Supervisor planning revision that introduces its gate are the complete T05R01 planning authority.

## Question policy

Return `needs_decision` and stop if the repair cannot be implemented in exactly the two owned files with the frozen stable policy, if Git common-dir resolution cannot provide a non-empty absolute path, if an experimental field, broader writable root, dependency, abstraction, fallback, retry or Router change appears necessary, or if the verified Worker cannot create its candidate commit. Do not expand scope or execute T05F00.

## Required Coding Result

```yaml
task_id: T05R01-native-linked-worktree-git-sandbox
status: candidate_ready | blocked | needs_decision
execution_surface: manual_pre_native_codex_exec
reported_task_head_sha: <40-character candidate commit SHA or null>
changed_files:
  - tools/codex-github-bridge/codex-app-server.mjs
  - tools/codex-github-bridge/tests/codex.test.mjs
git_common_dir_preflight:
  command: git rev-parse --path-format=absolute --git-common-dir
  cwd: <exact Task worktree>
  resolved_absolute: pass | fail
native_launch_started: true | false
verification:
  focused: <pass/fail + exact command>
  bridge_suite: <pass/fail + exact command>
  typecheck: <pass/fail + exact command>
  diff_check: <pass/fail + exact command>
deviations: []
unresolved: []
questions: []
```

For `candidate_ready`, the executor creates exactly one Conventional Commit on the T05R01 Task branch and does not push. If commit creation is blocked only by the pre-repair linked-worktree Git metadata sandbox, return the verified Diff without retry; any Host mechanical completion requires separate user authorization. The Supervisor independently re-reads Git and verification facts before any separately authorized integration.
