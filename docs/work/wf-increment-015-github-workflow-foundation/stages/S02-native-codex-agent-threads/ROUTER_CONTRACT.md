# ROUTER CONTRACT — S02 Native Codex Transition Repair

> Owner: Codex。更新日期：2026-09-07。T05R02 manual bootstrap repair 已集成到 Stage `e2388030199400d62f11576fff51ff08441d6742`，未生成 synthetic Bridge lifecycle event。T05F00 -004 保持 immutable terminal blocked；fresh -005 Contract 为 Proposed / confirmed_by_user=false。`status: dispatch_ready` 是 Router 格式字段，不授予 Acceptance、environment preparation、Implementation、Worker、Supervisor execution 或 `run-once` 权限。
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
      "dispatch_id": "wf15-s02-t05f00-root-multi-agent-prompt-boundary-005",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S02-native-codex-agent-threads/tasks/T05F00-root-multi-agent-prompt-boundary/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/T05F00-root-multi-agent-prompt-boundary-005",
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

- main authority=`bd41ea8a1e259300241a345a659e7da90e24af0d`；fresh planning base Stage=`e2388030199400d62f11576fff51ff08441d6742`。
- T05R02 已作为 non-Router manual bootstrap repair 集成：source=`eb4e375cf2e044f3ddb23a99c5fb0d3370bc7dab` → Stage=`e2388030199400d62f11576fff51ff08441d6742`；`router_dispatchable=false`、`synthetic_bridge_event_created=false`。不得补造 `task_dispatched`、`task_supervised`、`task_integrated` 或其它 Bridge lifecycle event。
- T05F00 `-001/-002/-003/-004` 均为 immutable terminal history。`-004` status=`blocked`，exact reason 为 `Worker completed with invalid required Coding Result: reported_task_head_sha must be a non-empty string`；不得 replay、cleanup 或复用其 dirty worktree。T05D00 probe worktree/branch 同样保留 untouched。
- T05F00 JSON 只把 dispatch 旋转为 `wf15-s02-t05f00-root-multi-agent-prompt-boundary-005`，并把 branch 旋转为 `task/wf-increment-015-github-workflow-foundation/T05F00-root-multi-agent-prompt-boundary-005`。该 fresh local branch、remote branch 与 worktree 在 planning preflight 均不存在；本轮不得创建。
- T05F00 其它 JSON 字段保持 semantic-equivalent；T05F01 entry 与 scheduler/integration/review/fix_policy/execution 均 unchanged。
- Fresh T05F00 Contract=`Proposed`、`confirmed_by_user=false`。Goal、exact two-file owns、model=`coding_strong`、reasoning effort=`medium`、fallback=`none` 保持；自身 `internal_multi_agent=false`、`worker_spawned_subagents=false`。
- Completion 使用已集成 production authority：Worker `implementation_ready` → Controller independent working-tree/ownership gates → `runVerification` → revalidation → exact-path stage → deterministic candidate commit → `collectTaskFacts` → `mechanicalGate` → existing Supervisor/push/integration。Worker Git metadata authority=`none`，不得要求 `candidate_ready` 或 `reported_task_head_sha`。
- `native_backend` 与 `verification` 只属于 current transition envelope compatibility；native facts 来自 `processResult.native`，verification authority 来自 Router verification，ownership authority 来自 Router `owns`、Controller working-tree facts 与 `mechanicalGate`。
- T05F01 保持 `Proposed`、`confirmed_by_user=false` 且 entry/Contract 文件不变；未来 fresh planning 删除 T05R02 已解决的重复 scope，只保留 generic Worker Result cleanup。T06 unchanged。
- 当前 next_required_action=`T05F00_005_contract_acceptance`。`dispatch_ready` 不等于 execution authorization；禁止 Acceptance、environment preparation、Worker、Supervisor execution、continuous start 与 `run-once`。
- fixed Chat 是唯一 Formal Review Authority；Supervisor 不 approve/merge、无 main authority。未来既有 Task push、controlled cherry-pick、Stage push 与 publication 语义不变；禁止 force/rebase/自动解冲突。
- 本轮只修改四份 governance planning documents。通过 minimal planning validation 后只允许一个 `docs(s02): plan T05F00 retry 005` commit（parent=`e2388030199400d62f11576fff51ff08441d6742`）与一次 ordinary non-force Stage push，随后 STOP。
