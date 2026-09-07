# TASK CONTRACT — T05F00-root-multi-agent-prompt-boundary

## Contract

```yaml
status: Proposed
confirmed_by_user: false
task_id: T05F00-root-multi-agent-prompt-boundary
type: Implementation Task
dispatch_id: wf15-s02-t05f00-root-multi-agent-prompt-boundary-004
task_branch: task/wf-increment-015-github-workflow-foundation/T05F00-root-multi-agent-prompt-boundary
depends_on:
  - T05-native-codex-thread-backend
model_policy: coding_strong
reasoning_effort: medium
fallback_model_policy: none
internal_multi_agent: false
worker_spawned_subagents: false
```

Owner: Codex. Reader: 用户与未来 Local Codex Worker。更新日期：2026-09-07。本 revision 等待用户确认全文；implementation goal 与 exact two-file scope 保持原 Accepted T05F00 语义。MUST 表示强制要求。

## Background

- `-001`：historical `needs_decision`，native thread 创建前因 sandbox wire enum mismatch 失败；不得 replay。
- `-002`：historical `blocked`，fresh worktree dependency gap 导致无法解析 TypeScript；不得 replay。
- T05R00 已 integrated：source `ba077fc1a39f85c179e65aa39b64646f4aed716a` → Stage `ad3e00989932828e58e742bce66a6cf1e8ab0745`。
- T05R01 已 integrated：source `e00aba7ad2cfb414c718c9a6be8ef9395711d6cc` → Stage `4ea459e8ff2beb9c8db8bc5c665f44ceebcf49fa`。两项 repair 均不属于 Router Task；不得补造 Bridge event。
- `wf15-s02-t05f00-root-multi-agent-prompt-boundary-003` 已为 immutable terminal history：native thread `01a07a28-4b47-7c82-98c5-1bb4cdd3cb18`、turn `01a07a28-4bbd-7920-a605-386d96c6a455`、native terminal `completed`；[真实 Bridge terminal event](https://github.com/Reminnd/coding-room/pull/6#issuecomment-5565132417) 为 `blocked`，exact reason：`Worker completed with invalid required Coding Result: status must be candidate_ready`。
- 历史 worktree 为 `D:\agent\case\codex-claudecode-room-codex-workers\T05F00-root-multi-agent-prompt-boundary`，branch 为本 Contract 的 `task_branch`，HEAD 为 `4ea459e8ff2beb9c8db8bc5c665f44ceebcf49fa`，`commit_count_from_base=0`、`staged_files=[]`；dirty files 恰为下述两个 owned files。该目录保留为 `failed_dispatch_evidence`，不得修改、commit、integrate 或复用为 `-004` candidate；cleanup 需要后续单独授权。
- Stage base 的 Worker prompt 仍无条件禁止 delegation；历史 dirty Diff 将其改为 exact Contract 授权下的 default deny，并保留 Root-only、child writing descendants 禁止和完整 Contract 注入。T05F00 自身不使用 multi-agent。

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

Native backend 使用 ephemeral thread，仅把匹配 `final_answer` 保存在当次 `processResult.lastMessage`；Controller 要求 `status == candidate_ready`，否则归一为 Bridge `blocked`。原 Worker final message 无法恢复，因此具体失败原因属于 `unknown_due_to_unrecoverable_worker_final_message`；不能反推出原始 status 的具体值，不能声称已证明 Git sandbox commit 失败。当前重新验证未发现 `implementation_verification_failure` 或必须扩大范围的 `contract_or_scope_gap`。

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
```

The minimum design is a Contract-governed prompt rule that the Worker can apply after reading the complete injected Contract. Production code MUST NOT identify T05F01 or any other task ID to grant authority.

## Scope

Writable only:

- `tools/codex-github-bridge/codex.mjs`
- `tools/codex-github-bridge/tests/codex.test.mjs`

Everything else is read-only context.

## Constraints and non-goals

- Do not create a permission registry, feature flag framework, agent registry, generic orchestration framework, compatibility mode or persistent delegation state.
- Do not add a Router field or change Router grammar.
- Do not build a Contract parser or task-ID allowlist.
- Do not change native transport, thread/turn `cwd`, model routing, scheduler, Git behavior, Supervisor Integration, controlled integration or GitHub lifecycle publication.
- Do not modify `controller.mjs` or any T05/T05F01/T06 Contract.
- Do not use internal multi-agent execution, spawn a subagent, push, modify Stage/main, perform formal Review, rebase, reset or force.

## Acceptance criteria

1. An ordinary Task prompt still states that subagent delegation is forbidden without exact Contract authorization.
2. A prompt carrying an exact Contract with explicit Root-only native multi-agent authorization contains no unconditional `do not spawn subagents` or equivalent `worker_spawned_subagents=false` assertion that contradicts it.
3. The generated prompt still contains the complete exact Contract text, existing dispatch identity, owned paths and dependency facts.
4. No new Router field, policy parser, task-ID branch, registry, framework or unrelated Bridge behavior appears in the Diff.
5. Both owned files and only those files are changed in the T05F00 Task commit.

## Verification

| Command | Detects | Decision if failed |
|---|---|---|
| `node --test tools/codex-github-bridge/tests/codex.test.mjs` | default-deny and explicit Root-only authorization prompt behavior, plus full Contract injection regression | `blocked`; do not commit or integrate |
| `node --test tools/codex-github-bridge/tests/*.test.mjs` | regression in the existing Bridge suite | `blocked`; do not commit or integrate |
| `npm run typecheck` | repository TypeScript compatibility | `blocked`; do not commit or integrate |
| `git diff --check` | whitespace and patch-format defects in the owned Diff | `blocked`; do not commit or integrate |

The historical T05 baseline-equivalence amendment does not apply. Every command above requires ordinary pass. `npm test` is not required and MUST NOT be reported as passed.

## Host execution-environment preparation

`-004` 当前为 `Proposed`、`confirmed_by_user=false`、`environment_preparation_completed=false`、`run_once_authorized=false`，尚无 Bridge event。

用户确认本 exact Contract 后，历史 `-003` worktree/local branch 的 cleanup、从届时 exact pushed Stage 创建 fresh Task branch/worktree、Host `npm ci` 与一次 fresh `run-once`仍分别需要授权。当前 planning 不执行这些动作。不得重放 `-001`、`-002` 或 `-003`，不得把历史 dirty Diff 直接提交或作为 candidate；fresh Worker 必须重新实现本 Contract。

未来 Host preparation 必须使用 repository lockfile 运行 `npm ci`，确认 package.json/package-lock.json unchanged、Git clean、node_modules 存在且 ignored、TypeScript resolvable。任一失败返回 `needs_decision` 并停止；production Bridge 不自动安装 dependencies。dispatch base 来自准备完成后获准执行时的实际 Stage，而非本 planning base。

## Candidate completion

仅在本 Contract 后续 Accepted 且 execution 单独获准后，Worker MUST：

1. 完整读取注入的 exact Contract，只在自己的 fresh Task worktree 实现下述两个 owned files。
2. 四项 Verification 全部 ordinary pass 后，才允许 stage 或生成 candidate；任一失败如实返回 `blocked` 并停止，不自动 Fix。
3. 仅执行 `git add -- tools/codex-github-bridge/codex.mjs tools/codex-github-bridge/tests/codex.test.mjs`，确认 staged paths 恰为两文件，禁止 `git add .`。
4. 在 Task branch 创建 exactly one Conventional Commit；不得 amend。commit parent 必须等于 dispatch base，commit_count_from_base 必须为 1，changed files 必须恰为两文件。
5. commit 成功后重新执行 `git rev-parse HEAD` 与 `git status --short`；确认 actual HEAD 是真实 candidate commit 且 worktree clean，再将 actual HEAD 写入 `reported_task_head_sha`。
6. 仅在真实 candidate commit 存在且以上条件成立时，使用下方完整 Required Coding Result 返回 `status: candidate_ready`。不能在 commit 之前报告 candidate，不能用预期 SHA 代替 actual HEAD。
7. commit 失败时保留实际 evidence，如实返回 `needs_decision` 或 `blocked` 与失败原因并停止；不得伪报 `candidate_ready`，不得 Host mechanical fallback。Controller 当前可能把非 candidate result 归一为 `blocked`，不因此修改 Controller 或加入 Task-specific compatibility。

## Bootstrap execution compatibility

The Bridge process that executes T05F00 loads the old Controller before T05F00 changes are made. Therefore T05F00's final Worker result MUST use the legacy transition envelope accepted by that already-loaded Controller. This is one-time execution compatibility; production code MUST NOT add `if task_id == T05F00`, another task-ID special case or a compatibility branch.

The legacy `full_tests` key below is only the old parser's field name. Its value is the ordinary Bridge-suite command, not `npm test`.

## Documentation updates

None during implementation. This exact planning Contract is the complete documentation authority for T05F00.

## Question policy

Return `needs_decision` and stop if the prompt boundary cannot be implemented within the two owned files without a new Router field, Contract policy parser, task-ID branch, framework, dependency or change to native transport/Git/Supervisor behavior. Do not expand scope.

## Required Coding Result — legacy transition envelope

```yaml
task_id: T05F00-root-multi-agent-prompt-boundary
dispatch_id: wf15-s02-t05f00-root-multi-agent-prompt-boundary-004
reported_base_sha: <dispatch base>
reported_task_head_sha: <40-char worker-reported Git SHA>
changed_files:
  - tools/codex-github-bridge/codex.mjs
  - tools/codex-github-bridge/tests/codex.test.mjs
native_backend:
  interface: <actual native interface used>
  worker_mode: one_thread_per_task
  explicit_thread_cwd: pass
  explicit_turn_cwd: pass
  terminal_event: <actual terminal event/status boundary>
  silent_fallback: false
verification:
  bridge_tests: pass - node --test tools/codex-github-bridge/tests/codex.test.mjs
  typecheck: pass - npm run typecheck
  full_tests: pass - node --test tools/codex-github-bridge/tests/*.test.mjs
  diff_check: pass - git diff --check
deviations: []
unresolved: []
questions: []
status: candidate_ready
```

上述 YAML 为成功 candidate 的完整 envelope。失败时如实填写实际 verification、unresolved/questions 与 `status: blocked` 或 `status: needs_decision`，不得沿用成功示例中的 pass；没有 candidate 时不得声称存在 candidate SHA。成功 envelope 的 `reported_task_head_sha` 必须来自 commit 后实际 HEAD。Worker 不 push；既有 Bridge gates 独立读取 Git、native execution 与 verification facts。
