# FIX ROUTER CONTRACT — S01 Review Fixes

> Review ID: `review-wf15-s01-final-local-parallel-001`
> Authorization state: Accepted / confirmed by user / Coding authorized
> This Router is structurally V1-compatible so it does not require a second Router schema.

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
      "task_id": "F01-actions-protocol",
      "dispatch_id": "wf15-s01-f01-actions-protocol-001",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/review-fixes/review-wf15-s01-final-local-parallel-001/tasks/F01-actions-protocol/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/F01-actions-protocol",
      "depends_on": [],
      "owns": [".github/workflows/codex-supervisor-dispatch.yml"],
      "model_policy": "coding_strong",
      "reasoning_effort": "medium",
      "fallback_model_policy": null,
      "verification": ["git diff --check", "mechanical workflow syntax/event/payload/path audit"]
    },
    {
      "task_id": "F02-bridge-delivery",
      "dispatch_id": "wf15-s01-f02-bridge-delivery-001",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/review-fixes/review-wf15-s01-final-local-parallel-001/tasks/F02-bridge-delivery/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/F02-bridge-delivery",
      "depends_on": [],
      "owns": ["tools/codex-github-bridge/**"],
      "model_policy": "coding_strong",
      "reasoning_effort": "high",
      "fallback_model_policy": null,
      "verification": ["node --test tools/codex-github-bridge/tests/*.test.mjs", "git diff --check"]
    },
    {
      "task_id": "F03-docs-authority",
      "dispatch_id": "wf15-s01-f03-docs-authority-001",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/review-fixes/review-wf15-s01-final-local-parallel-001/tasks/F03-docs-authority/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/F03-docs-authority",
      "depends_on": [],
      "owns": [
        "AGENTS.md",
        "CLAUDE.md",
        "PROJECT_RULES.md",
        "docs/documents/**",
        "docs/work/README.md",
        "docs/work/_templates/**"
      ],
      "model_policy": "fast_general",
      "reasoning_effort": "medium",
      "fallback_model_policy": null,
      "verification": [
        "git diff --check",
        "relative Markdown link audit",
        "merge marker audit",
        "Cloud/Work Current-language audit",
        "documentation authority consistency audit"
      ]
    },
    {
      "task_id": "F04-stage-lifecycle-docs",
      "dispatch_id": "wf15-s01-f04-stage-lifecycle-docs-001",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/review-fixes/review-wf15-s01-final-local-parallel-001/tasks/F04-stage-lifecycle-docs/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/F04-stage-lifecycle-docs",
      "depends_on": [
        "F01-actions-protocol",
        "F02-bridge-delivery",
        "F03-docs-authority"
      ],
      "owns": [
        "docs/work/wf-increment-015-github-workflow-foundation/PLAN.md",
        "docs/work/wf-increment-015-github-workflow-foundation/EXECUTION_PLAN.md",
        "docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/STAGE.md",
        "docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/tasks/T01-room-status-help/**"
      ],
      "model_policy": "fast_general",
      "reasoning_effort": "low",
      "fallback_model_policy": null,
      "verification": [
        "git diff --check",
        "Current Increment lifecycle consistency audit",
        "legacy Pilot dispatch_ready audit",
        "Bootstrap-B wording audit"
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
  "fix_policy": {
    "mode": "always_confirm"
  },
  "execution": {
    "primary_surface": "local_codex",
    "cloud_primary": false,
    "work": "removed",
    "local_state_database": false
  }
}
```

## Runtime dispatch notes

- The Router remains V1. Do not add `ROUTER_CONTRACT_V2`.
- F01/F02/F03 form the initial Ready Set.
- Their runtime base SHA is one common exact Stage head frozen by the Supervisor immediately before launch.
- F04 becomes Ready only after F01/F02/F03 are actually integrated.
- Runtime SHA, worktree, resolved model and mapping values are runtime facts and are not static Router fields.
- Task Contracts are still authorization gates. A Worker MUST NOT be dispatched while its Contract is `Proposed` or `confirmed_by_user=false`.
