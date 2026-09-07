# ROUTER CONTRACT — S02 Native Codex Transition Repair

> Owner: Codex。更新日期：2026-09-07。当前 T05F00 -004 已 immutable terminal blocked，不可 replay。用户已接受 [T05R02](./tasks/T05R02-controller-owned-candidate-commit/TASK_CONTRACT.md)，Accepted / confirmed_by_user=true / router_dispatchable=false；仍为 non-Router manual bootstrap repair，尚未 environment prepared/authorized/executed。JSON 保持 byte-equivalent；status: dispatch_ready 是既有 Router 格式字段，不授予执行权限。
<!-- ROUTER_CONTRACT_V1 -->

```json
{
  "contract_type": "router",
  "contract_version": 1,
  "status": "dispatch_ready",
  "workflow_id": "wf-increment-015-github-workflow-foundation",
  "stage_id": "S02-native-codex-agent-threads",
  "repository": "Reminnd/coding-room",
  "stage_branch": "stage/wf-increment-015-github-workflow-foundation/S02-native-codex-agent-threads",
  "scheduler": {
    "mode": "dependency_dag",
    "primary_objective": "minimize_wall_clock_time",
    "safe_parallelism_first": true,
    "ready_set": "all_dependencies_integrated_and_owned_paths_non_overlapping",
    "integration_order_when_simultaneously_eligible": ["topological_priority", "task_id"]
  },
  "tasks": [
    {
      "task_id": "T05-native-codex-thread-backend",
      "dispatch_id": "wf15-s02-t05-native-codex-thread-backend-001",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S02-native-codex-agent-threads/tasks/T05-native-codex-thread-backend/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/T05-native-codex-thread-backend",
      "depends_on": [],
      "owns": ["tools/codex-github-bridge/**"],
      "model_policy": "coding_strong",
      "reasoning_effort": "high",
      "fallback_model_policy": null,
      "verification": [
        "node --test tools/codex-github-bridge/tests/*.test.mjs",
        "npm run typecheck",
        "npm test",
        "git diff --check"
      ]
    },
    {
      "task_id": "T05F00-root-multi-agent-prompt-boundary",
      "dispatch_id": "wf15-s02-t05f00-root-multi-agent-prompt-boundary-004",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S02-native-codex-agent-threads/tasks/T05F00-root-multi-agent-prompt-boundary/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/T05F00-root-multi-agent-prompt-boundary",
      "depends_on": ["T05-native-codex-thread-backend"],
      "owns": [
        "tools/codex-github-bridge/codex.mjs",
        "tools/codex-github-bridge/tests/codex.test.mjs"
      ],
      "model_policy": "coding_strong",
      "reasoning_effort": "medium",
      "fallback_model_policy": null,
      "verification": [
        "node --test tools/codex-github-bridge/tests/codex.test.mjs",
        "node --test tools/codex-github-bridge/tests/*.test.mjs",
        "npm run typecheck",
        "git diff --check"
      ]
    },
    {
      "task_id": "T05F01-generic-worker-result-boundary",
      "dispatch_id": "wf15-s02-t05f01-generic-worker-result-boundary-001",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S02-native-codex-agent-threads/tasks/T05F01-generic-worker-result-boundary/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/T05F01-generic-worker-result-boundary",
      "depends_on": ["T05F00-root-multi-agent-prompt-boundary"],
      "owns": [
        "tools/codex-github-bridge/controller.mjs",
        "tools/codex-github-bridge/tests/controller.test.mjs"
      ],
      "model_policy": "coding_strong",
      "reasoning_effort": "high",
      "fallback_model_policy": null,
      "verification": [
        "node --test tools/codex-github-bridge/tests/controller.test.mjs",
        "node --test tools/codex-github-bridge/tests/*.test.mjs",
        "npm run typecheck",
        "git diff --check"
      ]
    }
  ],
  "integration": {
    "task_to_stage": "controlled_cherry_pick",
    "record_mapping": ["task_id", "source_task_sha", "stage_commit_sha"],
    "automatic_rebase": false,
    "automatic_conflict_resolution": false,
    "force": false
  },
  "review": {
    "authority": "chatgpt_fixed_chat",
    "transport": "github_pull_request",
    "supervisor_may_approve": false,
    "supervisor_may_merge": false
  },
  "fix_policy": {"mode": "always_confirm"},
  "execution": {
    "primary_surface": "local_codex",
    "cloud_primary": false,
    "work": "removed",
    "local_state_database": false
  }
}
```

## Dispatch gates

- main authority=bd41ea8a1e259300241a345a659e7da90e24af0d；planning exact Stage=f777c32cce0852ef1eb4f89ac2a4121e02bc3e2f；acceptance exact base Stage=4f3ea99d279cac0d7281eff850766623b754d47a。
- T05、T05R00、T05R01 已 integrated，source/Stage mapping 见 [Stage](./STAGE.md)。T05 entry 只供 recovery/dependency，T05R00/T05R01 不属于 tasks[]；不得 replay 或补造 Bridge event。
- T05F00 -001/-002/-003/-004 均为 immutable terminal history。当前 JSON 保留 wf15-s02-t05f00-root-multi-agent-prompt-boundary-004；其 status=blocked，exact reason 为 Worker completed with invalid required Coding Result: reported_task_head_sha must be a non-empty string。thread/turn 与 T05D00 probe 见 T05R02 Contract。
- T05D00 native_git_candidate_capability=fail：可写 working tree，不可写 linked-worktree Git metadata。T05R01 gitCommonDir writableRoot 不足以解决。不得 replay -004、准备 -005、旋转 dispatch、修改 dependencies/owns 或继续执行 T05F00。
- T05R02 仅为 Router 外 Native Bootstrap Repair Task；execution_surface=manual_pre_native_codex_exec，model_policy=coding_strong，gpt-5.6-sol/high，fallback none，internal_multi_agent false。不得加入 tasks[]/Ready Set，不伪造 task_integrated。
- 当前 next_required_action=T05R02_environment_preparation_authorization。T05R02 已 Accepted，但 environment_preparation_completed=false、implementation_authorized=false、manual_pre_native_codex_exec_authorized=false；environment preparation 后仍须 separate manual execution authorization。目标 authority 为 Worker working_tree_implementation_only / Git metadata none，Controller outside sandbox 创建 candidate，Router owns + independent facts 和 runVerification 为 gate authority；完整順序见 exact T05R02 Contract，当前生产尚未实现。
- T05R02 integrated 且 process STOP 后才 fresh planning T05F00 -005，使用 implementation_ready → Controller-owned candidate。T05F01 仍 Proposed/confirmed_by_user=false，当前 Contract unchanged；届时重审并删除 T05R02 已解决的重复范围。
- T06 保持 Router 外 Planning Placeholder，不 dispatch。必要 Task 未完成前不得 stage_candidate_ready 或 PR Ready for Review。
- T05F00 -004 dirty worktree 与 T05D00 probe worktree/branch 必须保留不动。continuous start、run-once、任意 Task dispatch 本轮均禁止。
- fixed Chat 是唯一 Formal Review Authority；Supervisor 不 approve/merge、无 main authority。未来既有 Task push、remote equality、controlled cherry-pick、Stage push 与 publication 语义不变；conflict abort/blocked，禁止 force/rebase/自动解冲突。
- 本轮只修改四份 governance documents 的 acceptance 状态与 prose；JSON bytes 不变。通过 acceptance gates 后一次 docs(s02): accept T05R02 contract commit（parent=4f3ea99d279cac0d7281eff850766623b754d47a）、一次 ordinary non-force Stage push，随后 STOP。S01 immutable history、room:status --help Deferred 保持。
