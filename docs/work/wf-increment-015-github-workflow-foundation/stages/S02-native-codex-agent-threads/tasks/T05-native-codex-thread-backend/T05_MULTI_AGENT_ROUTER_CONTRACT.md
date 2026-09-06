# T05 INTERNAL MULTI-AGENT ROUTER CONTRACT

> Contract bundle state: generated for exact Stage-SHA acceptance
> Generation source Stage SHA: `740b51479421ab087323fc5ae66255a0d591d0a1`
> Resume/Coding authorized at generation: **false**

This is an internal execution contract for the existing T05 logical Task. It is not a Local Bridge Router, Git Task graph, formal Review result, or second workflow authority.

```json
{
  "contract_type": "t05_internal_multi_agent_router",
  "contract_version": 1,
  "status": "awaiting_exact_stage_sha_acceptance",
  "outer_task": {
    "task_id": "T05-native-codex-thread-backend",
    "dispatch_id": "wf15-s02-t05-native-codex-thread-backend-001",
    "task_branch": "task/wf-increment-015-github-workflow-foundation/T05-native-codex-thread-backend",
    "original_dispatch_base_sha": "4058fc11aa5ca51eccea9a97d80a82b978c528ca",
    "preserved_local_candidate_sha": "66ba6b514de40c5b11da36d1e6822798900613d1",
    "worktree_policy": "reuse_existing_t05_worktree_only"
  },
  "root_supervisor": {
    "model_policy": "coding_strong",
    "reasoning_effort": "high",
    "owns_final_combined_verification": true,
    "owns_single_commit_amend": true
  },
  "scheduler": {
    "authority": "t05_root_supervisor_router",
    "mode": "dependency_dag",
    "initial_ready_set": [
      "A01-app-server-transport",
      "A02-capability-model-boundary",
      "A03-coding-result-gate"
    ],
    "audit_after_ready_set": "A04-cross-boundary-audit",
    "serial_fake_agent_fallback": false,
    "persistent_state": false
  },
  "subtasks": [
    {
      "task_id": "A01-app-server-transport",
      "contract_path": "subtasks/A01-app-server-transport/TASK_CONTRACT.md",
      "depends_on": [],
      "owns": [
        "tools/codex-github-bridge/codex-app-server.mjs",
        "tools/codex-github-bridge/codex.mjs",
        "tools/codex-github-bridge/process.mjs",
        "tools/codex-github-bridge/tests/codex.test.mjs"
      ],
      "model_policy": "coding_strong",
      "reasoning_effort": "high",
      "read_only": false
    },
    {
      "task_id": "A02-capability-model-boundary",
      "contract_path": "subtasks/A02-capability-model-boundary/TASK_CONTRACT.md",
      "depends_on": [],
      "owns": [
        "tools/codex-github-bridge/model-router.mjs",
        "tools/codex-github-bridge/tests/model-router.test.mjs"
      ],
      "model_policy": "coding_strong",
      "reasoning_effort": "medium",
      "read_only": false
    },
    {
      "task_id": "A03-coding-result-gate",
      "contract_path": "subtasks/A03-coding-result-gate/TASK_CONTRACT.md",
      "depends_on": [],
      "owns": [
        "tools/codex-github-bridge/controller.mjs",
        "tools/codex-github-bridge/tests/controller.test.mjs"
      ],
      "model_policy": "coding_strong",
      "reasoning_effort": "medium",
      "read_only": false
    },
    {
      "task_id": "A04-cross-boundary-audit",
      "contract_path": "subtasks/A04-cross-boundary-audit/TASK_CONTRACT.md",
      "depends_on": [
        "A01-app-server-transport",
        "A02-capability-model-boundary",
        "A03-coding-result-gate"
      ],
      "owns": [],
      "model_policy": "fast_general",
      "reasoning_effort": "medium",
      "read_only": true
    }
  ],
  "git_authority": {
    "subagents": "none",
    "branches_or_worktrees": false,
    "commit": false,
    "push": false,
    "github_lifecycle_events": false,
    "root_final_commit_count": 1,
    "root_final_commit_operation": "amend_existing_t05_commit"
  },
  "review": {
    "supervisor_integration_gate_preserved": true,
    "formal_authority": "chatgpt_fixed_chat"
  }
}
```

## Frozen shared transport contract

Production App Server invocation MUST use this explicit supported argv:

```json
["app-server", "--listen", "stdio://"]
```

Running `app-server` without a listener is transport-equivalent because `stdio` is the documented default, but T05 implementation and its direct Oracle MUST use the explicit form above. `--stdio`, transport fallback, and backend fallback are forbidden.

## Dispatch and completion gates

1. This exact Contract bundle MUST first be accepted by the user at its pushed Stage SHA. The generated files alone do not authorize T05 resume or Coding.
2. The T05 Root MUST receive the complete amended T05 Contract, this Router, the Root Supervisor instructions, and all four subcontracts from the accepted Stage revision. A path-only reference to the preserved T05 candidate checkout is insufficient because that checkout must not be modified by this planning commit.
3. Native multi-agent capability MUST be available. If it is unavailable, Root returns `needs_decision`; it MUST NOT execute the subtasks serially under fake agent labels.
4. Root launches A01, A02, and A03 as the initial parallel Ready Set. Each child may write only its exact `owns`; no child may create another writing subagent.
5. After all three return, Root launches A04 read-only against the combined working tree. A04 never writes.
6. `tools/codex-github-bridge/supervisor.mjs` remains at the preserved candidate content. If A04 finds that changing it is necessary to satisfy the accepted outer T05 Contract, the result is `needs_decision`; no child or Root expands scope.
7. Root independently checks child results, runs the complete outer T05 verification, confirms the final changed-file set remains within the original T05 ownership, and produces the unchanged outer Required Coding Result.
8. Only Root may amend the existing T05 commit. The T05 branch MUST still contain one deliverable commit whose parent is the original dispatch base. Root does not push or publish GitHub lifecycle events; existing Local Bridge and Supervisor Integration retain those duties.
