# FIX ROUTER CONTRACT — S01 Review Fix Round 2

> Review ID: `review-wf15-s01-final-local-parallel-002`  
> Fix Plan 2: user-confirmed in the current fixed Chat  
> Contract generation source Stage SHA: `c4a5faf9f51f6553e3c322adf5c13e3b3c40dbfe`  
> Contract bundle state: generated for user confirmation  
> Coding authorized: **false**  
> Merge/main write authorized: **false**

This Fix Router is structurally V1-compatible with the existing dependency-free Router reader. The JSON field `status=dispatch_ready` means only that the Router is mechanically parseable and contains a complete DAG. It does **not** authorize Worker launch. The Supervisor must additionally enforce every Task Contract's authorization gate and the user's acceptance of the exact Contract-bundle commit SHA.

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
      "task_id": "F05-actions-stage-generic",
      "dispatch_id": "wf15-s01-f05-actions-stage-generic-001",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/review-fixes/review-wf15-s01-final-local-parallel-002/tasks/F05-actions-stage-generic/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/F05-actions-stage-generic",
      "depends_on": [],
      "owns": [".github/workflows/codex-supervisor-dispatch.yml"],
      "model_policy": "coding_strong",
      "reasoning_effort": "medium",
      "fallback_model_policy": null,
      "verification": [
        "node --test tests/router-contract-reader.test.ts",
        "git diff --check",
        "Stage branch trigger and Router path derivation audit",
        "Router identity binding audit",
        "stale-ready and exact-PR-head gate regression audit"
      ]
    },
    {
      "task_id": "F06-bridge-recovery-bootstrap",
      "dispatch_id": "wf15-s01-f06-bridge-recovery-bootstrap-001",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/review-fixes/review-wf15-s01-final-local-parallel-002/tasks/F06-bridge-recovery-bootstrap/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/F06-bridge-recovery-bootstrap",
      "depends_on": [],
      "owns": ["tools/codex-github-bridge/**"],
      "model_policy": "coding_strong",
      "reasoning_effort": "high",
      "fallback_model_policy": null,
      "verification": [
        "node --test tools/codex-github-bridge/tests/*.test.mjs",
        "git diff --check",
        "current-dispatch recovery and stale-dispatch rejection tests",
        "remote Task SHA, Stage ancestry and owned-path recovery tests",
        "repository bootstrap ready/no-write, minimal-write, and needs_decision tests",
        "start/run-once repository prerequisite read-only test"
      ]
    },
    {
      "task_id": "F07-authority-lifecycle-docs",
      "dispatch_id": "wf15-s01-f07-authority-lifecycle-docs-001",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/review-fixes/review-wf15-s01-final-local-parallel-002/tasks/F07-authority-lifecycle-docs/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/F07-authority-lifecycle-docs",
      "depends_on": [
        "F05-actions-stage-generic",
        "F06-bridge-recovery-bootstrap"
      ],
      "owns": [
        "docs/work/wf-increment-015-github-workflow-foundation/SUPERVISOR_ROUTER_AGENT.md",
        "docs/work/wf-increment-015-github-workflow-foundation/PLAN.md",
        "docs/work/wf-increment-015-github-workflow-foundation/EXECUTION_PLAN.md",
        "docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/STAGE.md",
        "docs/documents/agent-guides/CODEX_SUPERVISOR_ROUTER.md",
        "docs/documents/agent-guides/GIT_AND_PARALLEL_WORKFLOW.md"
      ],
      "model_policy": "fast_general",
      "reasoning_effort": "low",
      "fallback_model_policy": null,
      "verification": [
        "git diff --check",
        "Current authority/lifecycle consistency audit",
        "repository bootstrap lifecycle wording audit",
        "Stage-generic Actions wording audit",
        "current-dispatch plus Git recovery wording audit",
        "S01 Bootstrap-B versus S02+ normal verification audit"
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

## Exact planning facts

The user accepted Fix Plan 2, but has not yet accepted this generated Contract bundle or authorized Coding. Therefore:

```yaml
fix_plan_2_confirmed: true
exact_contract_bundle_confirmed: false
coding_authorized: false
formal_review_authorized: false
merge_authorized: false
main_write_authorized: false
```

At a later Coding authorization, the Supervisor must re-read the remote Stage head and require it to equal the exact Contract-bundle SHA accepted by the user. Do not use `c4a5faf...` as the runtime Worker base after the bundle itself has been committed.

## DAG

```text
Initial Ready Set
{
  F05-actions-stage-generic,
  F06-bridge-recovery-bootstrap
}

F05-actions-stage-generic ───────┐
                                 ├─→ F07-authority-lifecycle-docs
F06-bridge-recovery-bootstrap ───┘
```

F05 and F06 have disjoint ownership and should run concurrently once Coding is explicitly authorized. F07 starts only after both are actually integrated into the Stage.

## Stable rules

- Bridge is the DAG/Ready Set scheduling authority.
- one Task = one task branch + one independent worktree + one owned-path set.
- Git/GitHub facts outrank Worker, comment and UI claims.
- Task → Stage is controlled cherry-pick only.
- fixed Chat is the only formal Review Authority.
- user accepts exact SHA before non-force FF to `main`.
- no hash index, local workflow DB, automatic rebase, automatic conflict resolution, force push or silent fallback.
