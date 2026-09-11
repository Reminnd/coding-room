# ROUTER CONTRACT — S01 Review / Fix / Acceptance Closure

This Accepted initial Router is directly compatible with the Current reader。`status: dispatch_ready` is a schema value only；it does not mean the Stage is active、bootstrapped or authorized to launch a Worker。

<!-- ROUTER_CONTRACT_V1 -->

```json
{
  "contract_type": "router",
  "contract_version": 1,
  "status": "dispatch_ready",
  "repository": "Reminnd/coding-room",
  "workflow_id": "wf-increment-016-github-review-fix-acceptance-closure",
  "stage_id": "S01-review-fix-acceptance-closure",
  "stage_branch": "stage/wf-increment-016-github-review-fix-acceptance-closure/S01-review-fix-acceptance-closure",
  "scheduler": {
    "mode": "dependency_dag",
    "primary_objective": "minimize_wall_clock_time",
    "safe_parallelism_first": true,
    "ready_set": "all_dependencies_integrated_and_owned_paths_non_overlapping",
    "integration_order_when_simultaneously_eligible": ["topological_priority", "task_id"]
  },
  "tasks": [
    {
      "task_id": "T01-review-fix-lifecycle-core",
      "dispatch_id": "wf16-s01-t01-review-fix-lifecycle-core-001",
      "task_contract_path": "docs/work/wf-increment-016-github-review-fix-acceptance-closure/stages/S01-review-fix-acceptance-closure/tasks/T01-review-fix-lifecycle-core/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-016-github-review-fix-acceptance-closure/T01-review-fix-lifecycle-core",
      "depends_on": [],
      "owns": [
        "tools/codex-github-bridge/structured-records.mjs",
        "tools/codex-github-bridge/lifecycle.mjs",
        "tools/codex-github-bridge/tests/structured-records.test.mjs",
        "tools/codex-github-bridge/tests/lifecycle.test.mjs",
        "tools/codex-github-bridge/cli.mjs",
        "tools/codex-github-bridge/github.mjs",
        "tools/codex-github-bridge/git.mjs",
        "tools/codex-github-bridge/controller.mjs",
        "tools/codex-github-bridge/codex.mjs",
        "tools/codex-github-bridge/index.mjs",
        "tools/codex-github-bridge/tests/cli.test.mjs",
        "tools/codex-github-bridge/tests/github.test.mjs",
        "tools/codex-github-bridge/tests/git.test.mjs",
        "tools/codex-github-bridge/tests/controller.test.mjs",
        "tools/codex-github-bridge/tests/codex.test.mjs"
      ],
      "model_policy": "coding_strong",
      "reasoning_effort": "high",
      "fallback_model_policy": null,
      "verification": [
        "node --test tools/codex-github-bridge/tests/structured-records.test.mjs tools/codex-github-bridge/tests/lifecycle.test.mjs",
        "node --test tools/codex-github-bridge/tests/cli.test.mjs tools/codex-github-bridge/tests/github.test.mjs tools/codex-github-bridge/tests/git.test.mjs tools/codex-github-bridge/tests/controller.test.mjs tools/codex-github-bridge/tests/codex.test.mjs",
        "npm run typecheck",
        "npm test",
        "git diff --check"
      ]
    },
    {
      "task_id": "T02-review-fix-actions-selector",
      "dispatch_id": "wf16-s01-t02-review-fix-actions-selector-001",
      "task_contract_path": "docs/work/wf-increment-016-github-review-fix-acceptance-closure/stages/S01-review-fix-acceptance-closure/tasks/T02-review-fix-actions-selector/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-016-github-review-fix-acceptance-closure/T02-review-fix-actions-selector",
      "depends_on": ["T01-review-fix-lifecycle-core"],
      "owns": [
        ".github/scripts/read-router-contract.mjs",
        ".github/scripts/select-stage-contract.mjs",
        ".github/workflows/codex-supervisor-dispatch.yml",
        "tests/router-contract-reader.test.ts",
        "tests/stage-contract-selector.test.ts"
      ],
      "model_policy": "coding_strong",
      "reasoning_effort": "high",
      "fallback_model_policy": null,
      "verification": [
        "node --test tests/router-contract-reader.test.ts",
        "node --test tests/router-contract-reader.test.ts tests/stage-contract-selector.test.ts",
        "npm run typecheck",
        "npm test",
        "git diff --check"
      ]
    },
    {
      "task_id": "T03-review-fix-documentation",
      "dispatch_id": "wf16-s01-t03-review-fix-documentation-001",
      "task_contract_path": "docs/work/wf-increment-016-github-review-fix-acceptance-closure/stages/S01-review-fix-acceptance-closure/tasks/T03-review-fix-documentation/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-016-github-review-fix-acceptance-closure/T03-review-fix-documentation",
      "depends_on": ["T02-review-fix-actions-selector"],
      "owns": [
        "AGENTS.md",
        "PROJECT_RULES.md",
        "docs/documents/README.md",
        "docs/documents/ARCHITECTURE.md",
        "docs/documents/DEVELOPMENT_LOG.md",
        "docs/documents/MVP_PLAN.md",
        "docs/documents/OPERATIONS.md",
        "docs/documents/STAGE_4_LOCAL_PARALLEL_ARCHITECTURE_AMENDMENT.md",
        "docs/documents/agent-guides/README.md",
        "docs/documents/agent-guides/CODEX_REVIEW_AND_PLANNING.md",
        "docs/documents/agent-guides/GIT_AND_PARALLEL_WORKFLOW.md",
        "docs/documents/agent-guides/CHAT_GITHUB_REVIEW.md",
        "docs/work/README.md",
        "docs/work/_templates/ROUTER_CONTRACT_TEMPLATE.md",
        "docs/work/_templates/TASK_CONTRACT_TEMPLATE.md",
        "docs/work/_templates/FIX_TEMPLATE.md",
        "docs/work/_templates/STAGE_TEMPLATE.md",
        "docs/work/_templates/CHAT_REVIEW_HANDOFF_TEMPLATE.md"
      ],
      "model_policy": "coding_strong",
      "reasoning_effort": "high",
      "fallback_model_policy": null,
      "verification": [
        "git diff --check",
        "npm run typecheck",
        "npm test",
        "relative Markdown link and Documentation Map audit",
        "decision/mechanical/handoff, Router-mode, four-command, lifecycle-order and failure-semantics audit",
        "merge marker audit"
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
