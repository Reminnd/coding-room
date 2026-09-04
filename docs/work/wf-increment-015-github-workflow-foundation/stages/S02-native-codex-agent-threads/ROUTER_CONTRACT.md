# ROUTER CONTRACT — S02 Native Codex Task Thread Adoption

> Planning handoff: the JSON uses the existing stage-generic Actions grammar. Local Bridge execution remains gated on explicit user acceptance of both S02 Task Contracts.

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
      "task_id": "T06-native-codex-thread-contracts",
      "dispatch_id": "wf15-s02-t06-native-codex-thread-contracts-001",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S02-native-codex-agent-threads/tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/T06-native-codex-thread-contracts",
      "depends_on": ["T05-native-codex-thread-backend"],
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
        "relative Markdown link audit",
        "merge marker audit",
        "native task-thread authority consistency audit against the integrated T05 implementation"
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

- The Stage planning base is exact GitHub `main` `bd41ea8a1e259300241a345a659e7da90e24af0d`; runtime `base_sha` is re-read from the actual Stage branch by Local Bridge at each dispatch.
- Do not invoke Local Bridge `start` or `run-once` until both Task Contracts are `Accepted`, `confirmed_by_user=true`, and the accepted revision is committed and pushed to this Stage branch.
- After acceptance, S02 uses two explicit `run-once` invocations: T05 through the pre-S02 Worker boundary, then T06 through a fresh process loaded from the T05-integrated Stage head. `start` is not used for this self-hosting transition.
- T05 MUST NOT silently fall back from the native task-thread backend once that backend is selected. An unavailable native thread or explicit-`cwd` capability returns `needs_decision`.
- T06 may document only behavior established by the integrated T05 source, tests and Git facts. It must not describe the candidate backend as Current before fixed-Chat Review and user acceptance.
- Do not read or dispatch the superseded `S02-room-status-help-pilot` or S01 task-scoped Router. `room:status --help` remains Deferred.
- S02 uses only the existing stage-generic Actions workflow and normal candidate verification path. No S01 Bootstrap-B fallback is permitted.
