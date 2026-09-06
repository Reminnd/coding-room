# ROUTER CONTRACT — S02 Native Codex Transition Repair

> Planning handoff: Router schema is unchanged. T05F00 dispatch `wf15-s02-t05f00-root-multi-agent-prompt-boundary-001` is historical `needs_decision`; `wf15-s02-t05f00-root-multi-agent-prompt-boundary-002` is historical `blocked`. Dispatch `-002` successfully created native thread `01a076af-a8fa-72b3-bc8a-bb61f3339b23` and completed turn `01a076af-a977-7863-82d0-6c1bef542b96`; focused tests passed 10/10, the Bridge suite passed 98/98, and `git diff --check` passed. No candidate was created, Supervisor and integration were not executed, and the Stage remained unchanged at `03be655aa170a6ce40776e1e3dd0e1ed42510103`. The failure boundary was unavailable repository dependencies in the fresh Task worktree, so `npm run typecheck` could not resolve `tsc`; this was not a T05F00 implementation, TypeScript compile, test, model, or native app-server failure. The active retry dispatch is `wf15-s02-t05f00-root-multi-agent-prompt-boundary-003`; its Contract is `Accepted` with `confirmed_by_user=true`. Environment preparation is required but incomplete, and no fresh `run-once` is authorized. T05 remains present as the integrated recovery/dependency identity. T05R00 is integrated from source `ba077fc1a39f85c179e65aa39b64646f4aed716a` to Stage commit `ad3e00989932828e58e742bce66a6cf1e8ab0745`. T05F01 remains `Proposed` with `confirmed_by_user=false`. T06 remains a `Planning Placeholder` and is not in the Router Ready Set.

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
      "dispatch_id": "wf15-s02-t05f00-root-multi-agent-prompt-boundary-003",
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
- Failure discovery used `codex-cli 0.149.1`; repair-time schema revalidation used `codex-cli 0.153.4`. Both define the `ThreadStartParams.sandbox` write value as `workspace-write`. Version `0.149.1` is historical discovery evidence, not the current installed-version claim.
- T05R00 is integrated: source `ba077fc1a39f85c179e65aa39b64646f4aed716a` → Stage commit `ad3e00989932828e58e742bce66a6cf1e8ab0745`. It was not Router-managed, so no synthetic `task_integrated` Bridge event exists. T05R00 MUST NOT be discovered, replayed or executed again.
- Do not invoke Local Bridge `start`. Every remaining transition execution uses a separately authorized fresh `run-once`.
- T05F00 dispatch `wf15-s02-t05f00-root-multi-agent-prompt-boundary-001` is historical `needs_decision`; dispatch `wf15-s02-t05f00-root-multi-agent-prompt-boundary-002` is historical `blocked`. Neither may be replayed or treated as current recovery state. Dispatch `-002` created the recorded native thread and completed turn, but fresh-worktree dependencies were unavailable: focused tests passed 10/10, the Bridge suite passed 98/98 and `git diff --check` passed, while `npm run typecheck` could not resolve the root `typescript` devDependency because `node_modules/` had not been materialized. It produced no candidate, Supervisor result or integration and did not modify the Stage.
- The active T05F00 retry dispatch is `wf15-s02-t05f00-root-multi-agent-prompt-boundary-003`. Its exact Contract is `Accepted` with `confirmed_by_user=true`; environment preparation is incomplete, a fresh `run-once` is not authorized, and the Task MUST NOT be dispatched now.
- Cleanup of the historical dirty `-002` Task worktree/local branch still requires its separately ordered authorization. The Host MUST then create a fresh, clean `-003` Task branch/worktree at the exact current Stage and run exact `npm ci` from the repository lockfile before any `run-once`. This is Host execution-environment preparation, not T05F00 Coding, a Task deliverable, a Bridge fallback or a Task-owned file change. The production Bridge MUST NOT be changed to install dependencies automatically.
- After environment preparation, `package.json` and `package-lock.json` MUST remain unchanged, Git status MUST remain clean, `node_modules` MUST exist only as the ignored local dependency tree, and the TypeScript package MUST resolve. Only then may the user separately authorize one fresh `run-once` for dispatch `-003`. That process executes and integrates only T05F00, then MUST stop.
- T05F01 remains `Proposed` with `confirmed_by_user=false` and is not dispatchable. It may run only after T05F00 is integrated and the exact T05F01 Contract is separately changed to `Accepted`, `confirmed_by_user=true` at a later exact pushed Stage SHA. Its fresh process must load the T05F00 prompt boundary before dispatch.
- T05F01 requires Contract-authorized Root-only native multi-agent. Native multi-agent unavailability returns `needs_decision`; serial fake-agent fallback is forbidden. After T05F01 integration, the process MUST stop.
- T05F00 and T05F01 each return the legacy transition Coding Result envelope accepted by the Controller already loaded at that Task's process start. This is execution compatibility only; production code must not add permanent task-ID branches or a compatibility mode.
- The current T06 file is a non-dispatchable Planning Placeholder and is not part of this Router's tasks or Ready Set. Only after T05F01 integration and a fresh inspection of the actual generic Controller may Codex determine material docs ownership and replace it with an exact Contract.
- T06 requires separate user acceptance at its later exact Stage SHA. It may describe only behavior established by integrated source, tests and Git facts, and must not describe the Stage candidate as Current before fixed-Chat Review and user acceptance.
- Do not read or dispatch the superseded `S02-room-status-help-pilot` or S01 task-scoped Router. `room:status --help` remains Deferred.
- S02 uses only the existing stage-generic Actions workflow and normal candidate verification path. No S01 Bootstrap-B fallback is permitted.
