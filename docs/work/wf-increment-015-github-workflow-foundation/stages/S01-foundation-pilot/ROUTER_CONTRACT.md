# ROUTER CONTRACT — Final Local Parallel Bridge Migration

<!-- ROUTER_CONTRACT_V1 -->

```json
{
  "contract_type": "router",
  "contract_version": 1,
  "status": "dispatch_ready",
  "workflow_id": "wf-increment-015-github-workflow-foundation",
  "stage_id": "S01-foundation-pilot",
  "repository": "Reminnd/coding-room",
  "stage_branch": "stage/wf-increment-015-github-workflow-foundation/S01-foundation-pilot",
  "scheduler": {
    "mode": "dependency_dag",
    "primary_objective": "minimize_wall_clock_time",
    "safe_parallelism_first": true,
    "ready_set": "all_dependencies_integrated_and_owned_paths_non_overlapping",
    "integration_order_when_simultaneously_eligible": ["topological_priority", "task_id"]
  },
  "tasks": [
    {
      "task_id": "T01-router",
      "dispatch_id": "wf15-s01-t01-router-001",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/tasks/T01-router/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/T01-router",
      "depends_on": [],
      "owns": [".github/scripts/read-router-contract.mjs", "tests/router-contract-reader.test.ts"],
      "model_policy": "coding_strong",
      "reasoning_effort": "high",
      "fallback_model_policy": null,
      "verification": ["node --test tests/router-contract-reader.test.ts", "npm run typecheck", "git diff --check"]
    },
    {
      "task_id": "T02-actions",
      "dispatch_id": "wf15-s01-t02-actions-001",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/tasks/T02-actions/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/T02-actions",
      "depends_on": [],
      "owns": [".github/workflows/codex-supervisor-dispatch.yml"],
      "model_policy": "coding_strong",
      "reasoning_effort": "medium",
      "fallback_model_policy": null,
      "verification": ["git diff --check", "mechanical workflow syntax and path audit"]
    },
    {
      "task_id": "T03-docs",
      "dispatch_id": "wf15-s01-t03-docs-001",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/tasks/T03-docs/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/T03-docs",
      "depends_on": [],
      "owns": ["AGENTS.md", "CLAUDE.md", "PROJECT_RULES.md", "docs/documents/**", "docs/work/README.md", "docs/work/_templates/**", "docs/work/wf-increment-015-github-workflow-foundation/PLAN.md", "docs/work/wf-increment-015-github-workflow-foundation/EXECUTION_PLAN.md", "docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/STAGE.md", "docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/tasks/T01-room-status-help/**"],
      "model_policy": "fast_general",
      "reasoning_effort": "low",
      "fallback_model_policy": null,
      "verification": ["git diff --check", "relative Markdown link audit", "merge marker audit", "Cloud/Work Current-language audit", "documentation authority consistency audit"]
    },
    {
      "task_id": "T04-bridge",
      "dispatch_id": "wf15-s01-t04-bridge-001",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/tasks/T04-bridge/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/T04-bridge",
      "depends_on": [],
      "owns": ["tools/codex-github-bridge/**"],
      "model_policy": "coding_strong",
      "reasoning_effort": "high",
      "fallback_model_policy": null,
      "verification": ["node --test tools/codex-github-bridge/tests/*.test.mjs", "git diff --check"]
    }
  ],
  "integration": {
    "task_to_stage": "controlled_cherry_pick",
    "record_mapping": ["task_id", "source_task_sha", "stage_commit_sha"],
    "automatic_rebase": false,
    "automatic_conflict_resolution": false,
    "force": false
  },
  "review": {"authority": "chatgpt_fixed_chat", "transport": "github_pull_request", "supervisor_may_approve": false, "supervisor_may_merge": false},
  "fix_policy": {"mode": "always_confirm"},
  "execution": {"primary_surface": "local_codex", "cloud_primary": false, "work": "removed", "local_state_database": false}
}
```

## Dispatch notes

- This Router describes the Final Migration itself, not the later `room:status --help` Pilot.
- Initial Ready Set is all four tasks because every `depends_on` list is empty and write ownership is disjoint.
- Runtime `base_sha`, resolved local model, worktree path, task head SHA and Stage mapping are Git/process facts supplied by the Supervisor at dispatch/integration time; they are intentionally not static fields in this versioned Router.
- No task may modify the Supervisor Router Agent, this Router Contract, or another task's Task Contract during Worker execution.