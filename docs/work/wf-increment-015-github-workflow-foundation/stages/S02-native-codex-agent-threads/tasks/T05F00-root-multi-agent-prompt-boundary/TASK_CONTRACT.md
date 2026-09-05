# TASK CONTRACT — T05F00-root-multi-agent-prompt-boundary

## Contract

```yaml
status: Accepted
confirmed_by_user: true
task_id: T05F00-root-multi-agent-prompt-boundary
type: Implementation Task
dispatch_id: wf15-s02-t05f00-root-multi-agent-prompt-boundary-001
task_branch: task/wf-increment-015-github-workflow-foundation/T05F00-root-multi-agent-prompt-boundary
depends_on:
  - T05-native-codex-thread-backend
model_policy: coding_strong
reasoning_effort: medium
fallback_model_policy: none
internal_multi_agent: false
worker_spawned_subagents: false
```

This planning revision generates the exact Contract only. It does not accept or dispatch T05F00. Execution requires separate user acceptance of this complete Contract at the exact pushed Stage SHA.

## Background

T05 is integrated and the native Worker now receives its exact Task Contract through `buildWorkerPrompt`. The current prompt and dispatch envelope still unconditionally state `worker_spawned_subagents=false` and `do not spawn subagents` for every Worker. That absolute rule conflicts with the downstream T05F01 exact Contract, which authorizes only its Root Supervisor Router to use Codex native multi-agent capability.

T05F00 is the transition prerequisite that removes only this contradiction. It does not itself use multi-agent execution.

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
dispatch_id: wf15-s02-t05f00-root-multi-agent-prompt-boundary-001
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
status: candidate_ready | blocked | needs_decision
```

For `candidate_ready`, the Worker creates exactly one Conventional Commit on the Task branch containing only the two owned files and does not push. Existing Local Bridge gates independently re-read Git, native execution and verification facts before controlled integration.
