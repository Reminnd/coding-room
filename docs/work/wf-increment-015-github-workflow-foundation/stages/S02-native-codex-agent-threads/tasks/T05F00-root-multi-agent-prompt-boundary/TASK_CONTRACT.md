# TASK CONTRACT — T05F00-root-multi-agent-prompt-boundary

## Contract

```yaml
status: Proposed
confirmed_by_user: false
task_id: T05F00-root-multi-agent-prompt-boundary
type: Implementation Task
dispatch_id: wf15-s02-t05f00-root-multi-agent-prompt-boundary-005
task_branch: task/wf-increment-015-github-workflow-foundation/T05F00-root-multi-agent-prompt-boundary-005
depends_on:
  - T05-native-codex-thread-backend
model_policy: coding_strong
reasoning_effort: medium
fallback_model_policy: none
internal_multi_agent: false
worker_spawned_subagents: false
implementation_authorized: false
environment_preparation_completed: false
run_once_authorized: false
```

Owner: Codex。Reader: 用户与未来 Local Codex Worker。更新日期：2026-09-07。本 fresh `-005` revision 等待用户确认 exact planning SHA；MUST 表示强制要求。

## Background

- `-001`：historical `needs_decision`，native thread 创建前因 sandbox wire enum mismatch 失败；不得 replay。
- `-002`：historical `blocked`，fresh worktree dependency gap 导致无法解析 TypeScript；不得 replay。
- T05R00 已 integrated：source `ba077fc1a39f85c179e65aa39b64646f4aed716a` → Stage `ad3e00989932828e58e742bce66a6cf1e8ab0745`。
- T05R01 已 integrated：source `e00aba7ad2cfb414c718c9a6be8ef9395711d6cc` → Stage `4ea459e8ff2beb9c8db8bc5c665f44ceebcf49fa`。两项 repair 均不属于 Router Task；不得补造 Bridge event。
- `wf15-s02-t05f00-root-multi-agent-prompt-boundary-003` 已为 immutable terminal history：native thread `01a07a28-4b47-7c82-98c5-1bb4cdd3cb18`、turn `01a07a28-4bbd-7920-a605-386d96c6a455`、native terminal `completed`；[真实 Bridge terminal event](https://github.com/Reminnd/coding-room/pull/6#issuecomment-5565132417) 为 `blocked`，exact reason：`Worker completed with invalid required Coding Result: status must be candidate_ready`。
- `-004` 已成为 immutable terminal `blocked`，exact reason 为 `Worker completed with invalid required Coding Result: reported_task_head_sha must be a non-empty string`。其 dirty worktree `D:\agent\case\codex-claudecode-room-codex-workers\T05F00-root-multi-agent-prompt-boundary` 必须继续作为 failure evidence 保留，不得修改、cleanup 或复用。
- Stage base 的 Worker prompt 仍无条件禁止 delegation；历史 dirty Diff 将其改为 exact Contract 授权下的 default deny，并保留 Root-only、child writing descendants 禁止和完整 Contract 注入。T05F00 自身不使用 multi-agent。

T05R02 已完成 manual bootstrap Stage integration：

```yaml
router_dispatchable: false
source_task_sha: eb4e375cf2e044f3ddb23a99c5fb0d3370bc7dab
stage_integration_sha: e2388030199400d62f11576fff51ff08441d6742
synthetic_bridge_event_created: false
```

不得为 T05R02 补造 `task_dispatched`、`task_supervised`、`task_integrated` 或其它 Bridge lifecycle event。T05D00 probe worktree/branch 继续保留 untouched。

Fresh `-005` identity 固定为本 Contract 的 `dispatch_id` 与 `task_branch`。Planning preflight 已确认 local branch、remote branch 与新 worktree 均不存在；本轮只记录 governance，不创建 branch/worktree。

### 2026-09-07 diagnosis verification

以下为本轮在历史 dirty worktree 重新运行的事实，不是恢复出的原 Worker verification：

| Command | Exit | Result | Test count |
|---|---|---|---|
| `node --test tools/codex-github-bridge/tests/codex.test.mjs` | 0 | pass | 15/15 |
| `node --test tools/codex-github-bridge/tests/*.test.mjs` | 0 | pass | 103/103 |
| `npm run typecheck` | 0 | pass | 不适用 |
| `git diff --check` | 0 | pass | 不适用 |

运行前后 branch、HEAD、status、unstaged/staged 完整 Diff 一致；exact two-file scope 保持不变，未运行 `npm test`。

Case A 判断：`implementation_diff_appears_valid`、`candidate_or_result_completion_failed`，`scope_change_required=false`。未发现需要第三个 code file 或 architecture 扩展的证据。本轮不是 Formal Review，也不接受历史 candidate。

上述 diagnosis 仅属于历史 dirty evidence，不是 fresh `-005` 执行证据。T05R02 已把 production completion 改为 `implementation_ready → Controller-owned candidate`；`-005` 不再沿用 Worker `candidate_ready` 或 `reported_task_head_sha`。

## Goal

修复 Worker prompt 层的 Root delegation 授权边界：默认禁止 subagent，但当完整 exact Accepted Task Contract 明确授权 Root-only native multi-agent 时，prompt 不再与该授权直接冲突。

## Requirements

1. Remove the unconditional meaning that every Task always has `worker_spawned_subagents=false`.
2. The default rule MUST remain: a Worker MUST NOT spawn subagents unless its complete exact Accepted Task Contract explicitly authorizes native multi-agent delegation.
3. When the complete exact Accepted Task Contract explicitly authorizes Root-only native multi-agent, the Worker prompt MUST NOT contain an absolute prohibition that contradicts that Contract.
4. Root-only authorization MUST NOT authorize child-spawned writing descendants. Child writing descendants remain forbidden unless a future exact Contract separately changes that boundary.
5. The exact Task Contract MUST continue to be injected in full into the Worker prompt together with the existing dispatch envelope, owned paths and dependency facts.
6. Implement the boundary as prompt semantics only. Do not add a Router field and do not parse the Contract into a new policy engine.
7. Add direct prompt tests for both reachable branches: the ordinary default Task remains forbidden from spawning subagents; an exact Contract that explicitly authorizes Root-only native multi-agent is not contradicted by the generated prompt.
8. T05F00 自身不使用 multi-agent：`internal_multi_agent=false`、`worker_spawned_subagents=false`。

## Architecture decisions

```yaml
boundary: worker_prompt_only
default_subagent_authority: forbidden
explicit_authority_source: complete_exact_accepted_task_contract
authorized_shape: root_only_native_multi_agent
child_spawned_writing_subagents: false
router_schema_change: false
contract_policy_engine: false
persistent_state_change: false
worker_git_metadata_authority: none
candidate_commit_authority: bridge_controller_outside_native_sandbox
completion_semantic: implementation_ready_to_controller_owned_candidate
```

The minimum design is a Contract-governed prompt rule that the Worker can apply after reading the complete injected Contract. Production code MUST NOT identify T05F01 or any other task ID to grant authority.

## Scope

Writable only:

- `tools/codex-github-bridge/codex.mjs`
- `tools/codex-github-bridge/tests/codex.test.mjs`

Everything else is read-only context。不得增加第三个 production/test file。

## Constraints and non-goals

- Do not create a permission registry, feature flag framework, agent registry, generic orchestration framework, compatibility mode, dependency or persistent delegation state.
- Do not add a Router field or change Router grammar.
- Do not build a Contract parser or task-ID allowlist.
- Do not change native transport, thread/turn `cwd`, model routing, scheduler, Controller, Git behavior, Supervisor Integration, controlled integration or GitHub lifecycle publication.
- Do not modify `controller.mjs`、`git.mjs`、`codex-app-server.mjs`、T05R02 Contract、T05F01 Contract 或 T06 Contract；不要实现 T05F01 generic Worker Result cleanup。
- Worker 不得执行 `git add`、`git commit`、`git push`、`git checkout`、`git branch`、`git reset` 或 `git rebase`；成功只留下 verified unstaged working-tree Implementation。
- Do not use internal multi-agent execution, spawn a subagent, modify Stage/main, perform formal Review, merge or force.

## Acceptance criteria

1. An ordinary Task prompt still states that subagent delegation is forbidden without exact Contract authorization.
2. A prompt carrying an exact Contract with explicit Root-only native multi-agent authorization contains no unconditional `do not spawn subagents` or equivalent `worker_spawned_subagents=false` assertion that contradicts it.
3. The generated prompt still contains the complete exact Contract text, existing dispatch identity, owned paths and dependency facts.
4. No new Router field, policy parser, task-ID branch, registry, framework or unrelated Bridge behavior appears in the Diff.
5. Worker completion 使用 `implementation_ready`，不要求 Worker stage/commit，不包含 `candidate_ready` 或 `reported_task_head_sha`。
6. Child-spawned writing descendants 仍明确禁止。
7. Both owned files and only those files are changed in the Controller-owned T05F00 Task commit.

## Verification

| Command | Detects | Decision if failed |
|---|---|---|
| `node --test tools/codex-github-bridge/tests/codex.test.mjs` | default-deny、explicit Root-only authorization、child-descendant prohibition、full Contract/dispatch injection 与 `implementation_ready` prompt boundary | `blocked`；不交付 candidate |
| `node --test tools/codex-github-bridge/tests/*.test.mjs` | existing Bridge completion、Controller-owned candidate 与 delivery regression | `blocked`；不交付 candidate |
| `npm run typecheck` | repository TypeScript compatibility | `blocked`；不交付 candidate |
| `git diff --check` | owned Diff whitespace/patch defects | `blocked`；不交付 candidate |

The historical T05 baseline-equivalence amendment does not apply. Every command above requires ordinary pass. `npm test` is not required and MUST NOT be reported as passed.

## Completion authority

T05F00 `-005` 必须使用已集成的 production sequence：

```text
Native Worker edits
→ implementation_ready
→ Controller independently observes working tree
→ ownership / identity gate
→ Router runVerification
→ post-verification revalidation
→ Controller exact-path stage
→ Controller deterministic candidate commit
→ collectTaskFacts
→ mechanicalGate
→ Supervisor
→ Task push
→ controlled Stage integration
→ task_integrated
```

Worker Git metadata authority=`none`。Candidate 只在 Controller commit 成功后存在，Worker 不得返回 `candidate_ready` 或 `reported_task_head_sha`。

### Current transition compatibility

Current Controller 在 `implementation_ready` transition 仍解析 `native_backend` 与 `verification` mappings。T05F00 success Result MUST 提供它们，但它们只属于 transition envelope compatibility：

- authoritative native facts 来自 `processResult.native`；
- authoritative verification 来自 Router `task.verification → runVerification()`；
- authoritative ownership 来自 Router `owns`、Controller 独立 working-tree facts 与 `mechanicalGate`。

Worker `verification` 值 MUST 来自 Worker 实际运行结果；Controller 仍独立重新运行全部 Router verification。不得在 T05F00 内清理 generic Result shape。

## Controller candidate gates

合法 `implementation_ready` 后，当前 Controller MUST 按以下顺序执行：

1. 独立观察 working tree。
2. `HEAD` 必须等于 dispatch base。
3. branch 必须等于 fresh `-005` `task_branch`。
4. staged paths 必须为空。
5. working paths 必须非空，并包含 ordinary untracked files。
6. Worker `changed_files` 必须与 actual working paths 集合完全相等，顺序不重要。
7. Router `owns` 必须覆盖全部 actual working paths。
8. `runVerification(task.verification)` 全部 ordinary pass；失败在 stage/commit 前 `blocked` 并停止。
9. Verification 后重新观察 `HEAD`、branch、staged paths 与 working path set。
10. 不允许 `HEAD`、branch、staged 或 path-set drift；失败不自动 restore。
11. Controller 只 stage verification 前独立观察到的 exact working paths；禁止 `git add .` 与 `git add -A`。
12. Staged path set 必须与 verified working path set 完全相等，且 `git diff --cached --check` 必须通过。
13. Controller 创建 exactly one deterministic commit；不得 amend 或 retry。
14. Commit message 固定为 `chore(task): complete T05F00-root-multi-agent-prompt-boundary`。
15. `collectTaskFacts` 必须确认 candidate 已形成，且 candidate changed-files 等于 verified working path set。
16. `mechanicalGate` 必须确认 exact parent/base、single parent、branch、clean worktree、ownership 与 commit diff-check。
17. 通过后继续 existing Supervisor、Task push、controlled Stage integration 与 publication；不得增加 Task-ID production special case。

`blocked` / `needs_decision` 必须在 candidate creation 前原 status settle。

## Environment preparation / execution authorization

当前 Contract 为 `Proposed`、`confirmed_by_user=false`。`implementation_authorized=false`、`environment_preparation_completed=false`、`run_once_authorized=false`。

Acceptance 需要下一轮用户确认 exact planning SHA。Contract Acceptance 不自动授权创建 fresh branch/worktree、安装 dependencies、启动 Worker、Supervisor execution 或 `run-once`；这些动作继续受各自门禁约束。禁止删除或复用 `-004` evidence 与 T05D00 probe。

## Documentation updates

Implementation 期间 `documentation_updates=none`。本 Contract 是 T05F00 `-005` 的完整 planning authority；本轮只维护 Stage、Router、Supervisor 与本文件。

T05F01 保持 `Proposed`、`confirmed_by_user=false` 且文件不变。T05R02 已解决 Worker commit authority、`implementation_ready` transition、Controller-owned candidate creation 与 precommit gates，因此 T05F01 未来 MUST fresh planning 并删除这些重复 scope，只保留 generic Worker Result cleanup；当前不接受或执行 T05F01。

## Question policy

若 prompt boundary 无法在 exact two-file scope 内完成，或必须新增 Router field、Contract parser、task-ID special case、framework、dependency，或改变 native transport/Controller/Git/Supervisor behavior，则返回 `needs_decision` 并停止；不得扩大 scope。

## Required Coding Result — implementation_ready transition envelope

```yaml
task_id: T05F00-root-multi-agent-prompt-boundary
dispatch_id: wf15-s02-t05f00-root-multi-agent-prompt-boundary-005
reported_base_sha: <dispatch base>
changed_files:
  - tools/codex-github-bridge/codex.mjs
  - tools/codex-github-bridge/tests/codex.test.mjs
native_backend:
  interface: <actual native interface>
  worker_mode: one_thread_per_task
  explicit_thread_cwd: pass
  explicit_turn_cwd: pass
  terminal_event: <actual terminal event>
  silent_fallback: false
verification:
  bridge_tests: pass - node --test tools/codex-github-bridge/tests/codex.test.mjs
  typecheck: pass - npm run typecheck
  full_tests: pass - node --test tools/codex-github-bridge/tests/*.test.mjs
  diff_check: pass - git diff --check
deviations: []
unresolved: []
questions: []
status: implementation_ready
```

该 success envelope 不包含 `reported_task_head_sha`，也不包含 `candidate_ready`。失败时必须如实返回同一 identity 与 lists，并使用 `status: blocked` 或 `status: needs_decision`；当前 Controller 在这两种 status 下不要求 success-only `native_backend` / `verification` maps，且必须在 candidate creation 前 settle。
