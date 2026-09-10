# ROUTER CONTRACT — S03 Native Codex Thread Contracts

> Owner: Codex。冻结基线：`c6f22fa110076a2784a39702c18a7c6ba99199db`。该 JSON 使用现有 stage-generic Router grammar；`status: dispatch_ready` 仅表示机械格式可验证，不表示本地 freeze 已获得 Stage push、Contract acceptance、environment preparation 或 T06 dispatch authority。
<!-- ROUTER_CONTRACT_V1 -->

```json
{
  "contract_type": "router",
  "contract_version": 1,
  "status": "dispatch_ready",
  "workflow_id": "wf-increment-015-github-workflow-foundation",
  "stage_id": "S03-native-codex-thread-contracts",
  "repository": "Reminnd/coding-room",
  "stage_branch": "stage/wf-increment-015-github-workflow-foundation/S03-native-codex-thread-contracts",
  "scheduler": {
    "mode": "dependency_dag",
    "primary_objective": "minimize_wall_clock_time",
    "safe_parallelism_first": true,
    "ready_set": "all_dependencies_integrated_and_owned_paths_non_overlapping",
    "integration_order_when_simultaneously_eligible": ["topological_priority", "task_id"]
  },
  "tasks": [
    {
      "task_id": "T06-native-codex-thread-contracts",
      "dispatch_id": "wf15-s03-t06-native-codex-thread-contracts-001",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S03-native-codex-thread-contracts/tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/T06-native-codex-thread-contracts",
      "depends_on": [],
      "owns": [
        "AGENTS.md",
        "PROJECT_RULES.md",
        "docs/documents/DEVELOPMENT_LOG.md",
        "docs/documents/README.md",
        "docs/documents/STAGE_4_LOCAL_PARALLEL_ARCHITECTURE_AMENDMENT.md",
        "docs/documents/agent-guides/GIT_AND_PARALLEL_WORKFLOW.md"
      ],
      "model_policy": "fast_general",
      "reasoning_effort": "low",
      "fallback_model_policy": null,
      "verification": [
        "git diff --check",
        "relative Markdown link audit for the exact six changed governance files",
        "merge marker audit for the exact six changed governance files",
        "native task-thread and generic Worker Result authority consistency audit against integrated source and tests",
        "Current/candidate and exact ownership audit"
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

- S03 planning base is exact accepted/integrated GitHub `main` `c6f22fa110076a2784a39702c18a7c6ba99199db`; runtime `base_sha` must be re-read from the actual Stage branch at dispatch.
- Router `depends_on=[]` is correct because T05/T05F00/T05F01 are cross-Stage accepted history already contained in the S03 base, not S03 tasks.
- Do not push this Stage until separately authorized. After push, do not create the T06 task branch/worktree or invoke Local Bridge until the user accepts the exact pushed Contract SHA and separately authorizes environment preparation and one-shot execution.
- T06 must use one fresh native Codex task thread bound to its assigned worktree. Native capability, exact model/effort, explicit `cwd`, reroute or matching terminal observation failure returns `needs_decision`; no pre-S02 `codex exec` fallback is allowed.
- T06 Worker Result is task-generic. Worker self-report is not authority for native facts, Router verification, ownership or candidate commit identity.
- S01/S02 remain immutable accepted history. `room:status --help` remains Deferred. Repository bootstrap, alternate Stage, local workflow database, replay and silent repair are forbidden.
