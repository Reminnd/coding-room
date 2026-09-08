# T05F01 INTERNAL MULTI-AGENT ROUTER CONTRACT

> Bundle state: Accepted under exact outer T05F01 Contract acceptance at Stage planning SHA `f55b256c9e43c6d54b86c35fa88a06c41c36edb2`. Acceptance does not authorize environment preparation, dispatch or Coding.

This is an internal execution contract for one logical T05F01 Task. It is not the Local Bridge Router, a Git Task graph, a formal Review result or a second workflow authority.

```json
{
  "contract_type": "t05f01_internal_multi_agent_router",
  "contract_version": 1,
  "status": "accepted_under_outer_exact_contract_acceptance",
  "outer_task": {
    "task_id": "T05F01-generic-worker-result-boundary",
    "dispatch_id": "wf15-s02-t05f01-generic-worker-result-boundary-001",
    "task_branch": "task/wf-increment-015-github-workflow-foundation/T05F01-generic-worker-result-boundary",
    "depends_on": ["T05F00-root-multi-agent-prompt-boundary"],
    "owns": [
      "tools/codex-github-bridge/controller.mjs",
      "tools/codex-github-bridge/tests/controller.test.mjs"
    ]
  },
  "root_supervisor": {
    "model_policy": "coding_strong",
    "reasoning_effort": "high",
    "fallback_model_policy": null,
    "native_multi_agent": "required",
    "authority": "root_only",
    "owns_contract_delivery": true,
    "owns_focused_verification": true,
    "owns_full_verification": true,
    "owns_scope_validation": true,
    "leaves_unstaged_implementation": true,
    "git_authority": "none"
  },
  "scheduler": {
    "authority": "t05f01_root_supervisor_router",
    "mode": "dependency_dag",
    "initial_ready_set": [
      "A01-generic-result-production",
      "A02-generic-result-tests"
    ],
    "root_focused_verification_after_ready_set": "node --test tools/codex-github-bridge/tests/controller.test.mjs",
    "audit_after_focused_verification": "A03-boundary-audit",
    "serial_fake_agent_fallback": false,
    "persistent_child_state": false
  },
  "subtasks": [
    {
      "task_id": "A01-generic-result-production",
      "contract_path": "subtasks/A01-generic-result-production/TASK_CONTRACT.md",
      "depends_on": [],
      "owns": ["tools/codex-github-bridge/controller.mjs"],
      "model_policy": "coding_strong",
      "reasoning_effort": "high",
      "read_only": false
    },
    {
      "task_id": "A02-generic-result-tests",
      "contract_path": "subtasks/A02-generic-result-tests/TASK_CONTRACT.md",
      "depends_on": [],
      "owns": ["tools/codex-github-bridge/tests/controller.test.mjs"],
      "model_policy": "coding_strong",
      "reasoning_effort": "medium",
      "read_only": false
    },
    {
      "task_id": "A03-boundary-audit",
      "contract_path": "subtasks/A03-boundary-audit/TASK_CONTRACT.md",
      "depends_on": [
        "A01-generic-result-production",
        "A02-generic-result-tests",
        "root_focused_verification"
      ],
      "owns": [],
      "model_policy": "fast_general",
      "reasoning_effort": "medium",
      "read_only": true
    }
  ],
  "child_authority": {
    "git": "none",
    "commit": false,
    "push": false,
    "checkout": false,
    "rebase": false,
    "reset": false,
    "spawned_writing_subagents": false,
    "github_lifecycle_events": false
  },
  "delivery": {
    "root_git_add": false,
    "root_commit": false,
    "root_push": false,
    "root_stage_integration": false,
    "working_tree_delivery": "exact_two_owned_files_unstaged",
    "transition_result_status": "implementation_ready",
    "transition_compatibility_maps": ["native_backend", "verification"],
    "transition_compatibility_maps_authoritative": false,
    "stop_after_result": true
  }
}
```

## Dispatch gates

1. T05F00 MUST be integrated first.
2. The user MUST separately accept the complete exact outer T05F01 bundle at the active exact Stage SHA.
3. Root MUST use Codex native multi-agent; serial fake-agent fallback is forbidden.
4. Root MUST read and inject each complete exact child Contract in the first child turn.
5. A01 and A02 MUST start concurrently. Their ownership is disjoint.
6. Root focused verification MUST pass before A03 is dispatched.
7. A03 is read-only. It may identify A01/A02 ownership of a defect but may not edit.
8. Root full verification MUST pass before Root confirms exactly the two outer owned files are modified and unstaged.
9. Root MUST NOT `git add`, commit or push. It returns the one-time `implementation_ready` transition envelope and stops. The production Controller retains candidate creation, push, integration and lifecycle authority.
