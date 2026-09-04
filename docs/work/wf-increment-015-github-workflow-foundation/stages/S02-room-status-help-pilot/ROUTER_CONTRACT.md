# ROUTER CONTRACT — S02 room-status-help Pilot

> Planning handoff: the JSON uses the existing stage-generic Actions grammar. Local Bridge execution remains gated on explicit user acceptance of the S02 Task Contract.

<!-- ROUTER_CONTRACT_V1 -->

```json
{
  "contract_type": "router",
  "contract_version": 1,
  "status": "dispatch_ready",
  "workflow_id": "wf-increment-015-github-workflow-foundation",
  "stage_id": "S02-room-status-help-pilot",
  "repository": "Reminnd/coding-room",
  "stage_branch": "stage/wf-increment-015-github-workflow-foundation/S02-room-status-help-pilot",
  "scheduler": {
    "mode": "dependency_dag",
    "primary_objective": "minimize_wall_clock_time",
    "safe_parallelism_first": true,
    "ready_set": "all_dependencies_integrated_and_owned_paths_non_overlapping",
    "integration_order_when_simultaneously_eligible": ["topological_priority", "task_id"]
  },
  "tasks": [
    {
      "task_id": "S02-T01-room-status-help",
      "dispatch_id": "wf15-s02-t01-room-status-help-001",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S02-room-status-help-pilot/tasks/S02-T01-room-status-help/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/S02-T01-room-status-help",
      "depends_on": [],
      "owns": ["src/cli/status.ts", "tests/status-cli.test.ts"],
      "model_policy": "coding_strong",
      "reasoning_effort": "medium",
      "fallback_model_policy": null,
      "verification": [
        "node --test tests/status-cli.test.ts",
        "npm run typecheck",
        "npm test",
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

- The Stage planning base is exact GitHub `main` `bd41ea8a1e259300241a345a659e7da90e24af0d`; runtime `base_sha` is re-read from the actual Stage branch by Local Bridge at dispatch.
- Do not invoke `start` or `run-once` until the S02 Task Contract is `Accepted`, `confirmed_by_user=true`, and the accepted revision is committed and pushed to this Stage branch.
- Do not read or dispatch the superseded S01 task-scoped Router. Do not rerun or modify S01 or `F05`/`F06`/`F07`/`F08`.
- S02 uses only the existing stage-generic Actions workflow and normal candidate verification path. No Bootstrap-B fallback is permitted.
