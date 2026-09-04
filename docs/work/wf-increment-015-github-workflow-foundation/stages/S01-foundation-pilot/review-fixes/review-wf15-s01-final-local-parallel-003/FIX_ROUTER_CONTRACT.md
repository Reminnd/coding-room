# FIX ROUTER CONTRACT — S01 R4 Bootstrap Mutation Evidence

> Review ID: `review-wf15-s01-final-local-parallel-003`  
> Finding: `R4-bootstrap-mutation-evidence`  
> Finding/minimum direction: confirmed by user in the current fixed Chat  
> Contract generation source Stage SHA: `c08e2dd757b989f7f005d9c1703d08c519b8213b`  
> Contract bundle state: generated for exact-SHA user confirmation  
> Coding authorized at generation: **false**  
> Review/Merge/main write authorized: **false**

The JSON below is mechanically dispatchable but is not Coding authority. Worker launch requires a later current-chat user decision that explicitly accepts the exact Contract-bundle commit SHA and authorizes Coding. `dispatch_ready` must never be treated as that authorization.

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
      "task_id": "F08-bootstrap-mutation-evidence",
      "dispatch_id": "wf15-s01-f08-bootstrap-mutation-evidence-001",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/review-fixes/review-wf15-s01-final-local-parallel-003/tasks/F08-bootstrap-mutation-evidence/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/F08-bootstrap-mutation-evidence",
      "depends_on": [],
      "owns": [
        "tools/codex-github-bridge/github.mjs",
        "tools/codex-github-bridge/tests/github.test.mjs"
      ],
      "model_policy": "coding_strong",
      "reasoning_effort": "medium",
      "fallback_model_policy": null,
      "verification": [
        "node --test tools/codex-github-bridge/tests/github.test.mjs",
        "node --test tools/codex-github-bridge/tests/*.test.mjs",
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

R4 maps to the single implementation task `F08-bootstrap-mutation-evidence`; F05/F06/F07 are completed historical inputs and must not be rerun. After F08 integration, the required continuation is explicit repository bootstrap, exact-SHA S01 mechanical verification, PR-head equality re-read, and fixed Chat formal re-Review. No Review, Merge, or `main` write is authorized by this Contract bundle.