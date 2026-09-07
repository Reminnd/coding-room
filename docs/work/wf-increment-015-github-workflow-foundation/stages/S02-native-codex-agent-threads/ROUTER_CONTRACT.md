# ROUTER CONTRACT — S02 Native Codex Transition Repair

> Owner: Codex。更新日期：2026-09-07。Active T05F00 retry `-004` 为 Proposed / confirmed_by_user=false，尚无 Bridge event，environment 未准备，run-once 未授权。JSON 的既有 `status: dispatch_ready` 是 Router 格式字段，不替代 exact Task acceptance 或 execution 授权。当前 lifecycle 为 `waiting_for_T05F00_retry_004_contract_acceptance`。

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

- Stage lineage 的 GitHub main 为 `bd41ea8a1e259300241a345a659e7da90e24af0d`；本 planning base 为 `4ea459e8ff2beb9c8db8bc5c665f44ceebcf49fa`。未来 dispatch base 由实际 Stage 重新读取。
- T05 已 integrated，source `9cc6899b69a96c3d9cfbe12f57cf93fdf59bb434` → Stage `dbd10202f5289d91d7caab9c67e1de878b0ae843`；其 entry 仅供 recovery/dependency 使用，不得 replay。
- T05R00 已 integrated：source `ba077fc1a39f85c179e65aa39b64646f4aed716a` → Stage `ad3e00989932828e58e742bce66a6cf1e8ab0745`。
- T05R01 已 integrated：source `e00aba7ad2cfb414c718c9a6be8ef9395711d6cc` → Stage `4ea459e8ff2beb9c8db8bc5c665f44ceebcf49fa`。两项 repair 不加入 tasks[] 或 Ready Set，不重复执行、不补造 Bridge event。
- T05F00 `-001` historical needs_decision、`-002` historical blocked dependency gap、`-003` historical terminal blocked 均不可 replay。`-003` 已有真实 Bridge event，dirty worktree 保留为 failed_dispatch_evidence，禁止 commit/integrate；cleanup 等待后续单独授权。
- Active dispatch 为 `wf15-s02-t05f00-root-multi-agent-prompt-boundary-004`，exact [Task Contract](./tasks/T05F00-root-multi-agent-prompt-boundary/TASK_CONTRACT.md) 为 `Proposed`、`confirmed_by_user=false`，本轮读取时无 Bridge event。不能将 dispatch rotation 视为 acceptance、environment preparation 或 execution authority。
- `-004` 必须先获得 exact Contract acceptance，再单独授权 cleanup、fresh worktree 与 Host npm ci，确认 package unchanged、Git clean、dependencies ignored、TypeScript resolvable，最后单独授权一次 fresh run-once；当前不得 run-once。
- continuous start 始终禁止。T05F00 integration + Stage push 后必须 STOP，再返回 fixed Chat 核验新 Stage 与真实 task_integrated。
- T05F01 仍 Proposed / confirmed_by_user=false，不 dispatch。其 future exact acceptance 后必须用 fresh process 加载 T05F00 prompt；Root-only native multi-agent 不可用时 needs_decision，禁止 serial fake-agent fallback；integration 后 STOP。
- T06 仍是 Router 外的 Planning Placeholder。T05F01 集成后才确定 exact docs scope 并单独接受；完成前不发布 stage_candidate_ready、不将 PR #6 标记 Ready for Review。
- Transition Worker 继续使用当次 Controller 已支持的 legacy result envelope。production 不增加 Task-ID branch、Router field、policy engine、compatibility mode 或 fallback。
- fixed Chat 是唯一 Formal Review Authority；Supervisor 不 approve、不 merge、无 main authority。Git conflict 必须 abort 后 blocked，禁止 rebase、自动解冲突或 force push。
- S01 Router/Task 是 immutable history，不得作为 active dispatch source；room:status --help 仍 Deferred，不恢复 Bootstrap-B。历史 thread/turn、重新验证与 completion 要求详见 exact Task Contract；执行门禁见 [Supervisor](./SUPERVISOR_ROUTER_AGENT.md)。
