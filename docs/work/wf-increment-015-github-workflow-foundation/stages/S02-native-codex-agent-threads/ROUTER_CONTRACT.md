# ROUTER CONTRACT — S02 Native Codex Transition Repair

> Planning handoff: the JSON uses the existing stage-generic Actions grammar. T05 remains present as the integrated recovery/dependency identity. T05F00 and T05F01 remain gated by separate exact Contract acceptance; this planning revision accepts neither Task. T06 is not in the Router Ready Set.

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
      "dispatch_id": "wf15-s02-t05f00-root-multi-agent-prompt-boundary-001",
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

- The Stage planning base is exact GitHub `main` `bd41ea8a1e259300241a345a659e7da90e24af0d`; runtime `base_sha` is re-read from the actual Stage branch by Local Bridge at each dispatch.
- T05 is already integrated with source `9cc6899b69a96c3d9cfbe12f57cf93fdf59bb434` mapped to Stage commit `dbd10202f5289d91d7caab9c67e1de878b0ae843`. Its Router entry remains only for recovery and dependency identity.
- Do not invoke Local Bridge `start`. Every remaining transition execution uses a separately authorized fresh `run-once`.
- T05F00 may run only after its exact Contract is separately changed to `Accepted`, `confirmed_by_user=true` at an exact pushed Stage SHA. The current `Proposed` Contract is not dispatch authority. Its `run-once` integrates only T05F00 and then MUST stop.
- T05F01 may run only after T05F00 is integrated and the exact T05F01 Contract is separately changed to `Accepted`, `confirmed_by_user=true` at a later exact pushed Stage SHA. Its fresh process must load the T05F00 prompt boundary before dispatch.
- T05F01 requires Contract-authorized Root-only native multi-agent. Native multi-agent unavailability returns `needs_decision`; serial fake-agent fallback is forbidden. After T05F01 integration, the process MUST stop.
- T05F00 and T05F01 each return the legacy transition Coding Result envelope accepted by the Controller already loaded at that Task's process start. This is execution compatibility only; production code must not add permanent task-ID branches or a compatibility mode.
- The current T06 file is a non-dispatchable Planning Placeholder and is not part of this Router's tasks or Ready Set. Only after T05F01 integration and a fresh inspection of the actual generic Controller may Codex determine material docs ownership and replace it with an exact Contract.
- T06 requires separate user acceptance at its later exact Stage SHA. It may describe only behavior established by integrated source, tests and Git facts, and must not describe the Stage candidate as Current before fixed-Chat Review and user acceptance.
- Do not read or dispatch the superseded `S02-room-status-help-pilot` or S01 task-scoped Router. `room:status --help` remains Deferred.
- S02 uses only the existing stage-generic Actions workflow and normal candidate verification path. No S01 Bootstrap-B fallback is permitted.
