# ROUTER CONTRACT — S02 Native Codex Transition Repair

> Owner: Codex。更新日期：2026-09-08。T05F00 -005 已由真实 production Bridge 集成到 Stage `f79780251332ad89844392cc3185a981cc2f496d`。T05F01 `-001` 已 immutable terminal blocked；Retry `-002` complete exact Contract bundle 为 `Proposed`，等待 fresh outer acceptance。`status: dispatch_ready` 是 Router 格式字段，不授予 environment preparation、Implementation、Worker、Supervisor execution 或 `run-once` 权限。
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
      "dispatch_id": "wf15-s02-t05f00-root-multi-agent-prompt-boundary-005",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S02-native-codex-agent-threads/tasks/T05F00-root-multi-agent-prompt-boundary/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/T05F00-root-multi-agent-prompt-boundary-005",
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
      "dispatch_id": "wf15-s02-t05f01-generic-worker-result-boundary-002",
      "task_contract_path": "docs/work/wf-increment-015-github-workflow-foundation/stages/S02-native-codex-agent-threads/tasks/T05F01-generic-worker-result-boundary/TASK_CONTRACT.md",
      "task_branch": "task/wf-increment-015-github-workflow-foundation/T05F01-generic-worker-result-boundary-002",
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

- main authority=`bd41ea8a1e259300241a345a659e7da90e24af0d`；T05F00 -005 integrated Stage=`f79780251332ad89844392cc3185a981cc2f496d`；T05F01 Retry `-002` planning base Stage=`ec62546d6126ef5ecfbd0eceed100f916d75aa27`。
- T05R02 manual bootstrap history 与 synthetic-event prohibition 保持不变。T05F00 `-001/-002/-003/-004` 仍是 immutable terminal history；`-004` dirty worktree 与 T05D00 probe worktree/branch 必须 untouched。
- T05F00 -005 已由 production Bridge 集成：source=`3acabe66784ff1e66501b9c09e08cbf86ff9976a` → Stage=`f79780251332ad89844392cc3185a981cc2f496d`；native thread=`01a07fdf-33d1-7153-8cf6-e681eb08c1f9`，turn=`01a07fdf-3450-70a3-be08-fe722c96abe2`，model=`gpt-5.6-sol / medium`；Controller focused=`11/11`、Bridge=`112/112`、typecheck=`pass`、diff-check=`pass`；Supervisor=`ready_to_integrate`。
- T05F01 dispatch `wf15-s02-t05f01-generic-worker-result-boundary-001` 已 immutable terminal blocked，exact reason=`Worker completed with invalid required Coding Result: duplicate field task_id`，process exit=`0`，native thread=`01a08136-8359-7471-a380-2f412e853bdb`，turn=`01a08136-83d1-7b00-97fc-86c2d0f7aaed`。原branch=`task/wf-increment-015-github-workflow-foundation/T05F01-generic-worker-result-boundary`，worktree=`D:/agent/case/codex-claudecode-room-codex-workers/T05F01-generic-worker-result-boundary`；两者不得 replay 或 cleanup。该attempt未形成Controller candidate、Task push、Stage integration或`candidate_ready`，main unchanged。
- 上方 T05F01 Router entry只把dispatch改为 `wf15-s02-t05f01-generic-worker-result-boundary-002`、task branch改为 `task/wf-increment-015-github-workflow-foundation/T05F01-generic-worker-result-boundary-002`；`depends_on`、`owns`、model policy、reasoning effort、fallback与verification保持semantic identical，T05F00 entry unchanged。
- Retry `-002` T05F01 Contract=`Proposed`、`confirmed_by_user=false`、`implementation_authorized=false`、`environment_preparation_completed=false`、`run_once_authorized=false`。当前 next_required_action=`T05F01_002_contract_acceptance`。
- T05F01 只清理 Worker Result generic boundary：common fields=`task_id/dispatch_id/reported_base_sha/deviations/unresolved/questions/status`；status 只允许 `implementation_ready/blocked/needs_decision`；仅 `implementation_ready` 额外要求 non-empty `changed_files`。
- Future generic Worker Result 不要求 `native_backend`、`verification` 或 `reported_task_head_sha`。Native authority=`processResult.native`；verification authority=`task.verification → runVerification()`；ownership authority=`Router owns + observed working paths + mechanicalGate()`；candidate identity 由 Controller Git facts产生。
- Current successful sequence保持：semantic status gate → `observeWorkingTree` 与 HEAD/branch/staged/working-path/changed-files/ownership gates → Router verification → post-verification re-observation → exact staging/cached diff-check/deterministic commit → `collectTaskFacts`/candidate-file gate/`mechanicalGate` → Supervisor → dependency → Task push → controlled Stage integration → `task_integrated`。T05F01 不重写这些 gates。
- T05F01 production owns 精确为 `controller.mjs` 与 `tests/controller.test.mjs`。若必须修改第三个 production/test file，返回 `needs_decision` 并停止。T06 unchanged。
- T05F01 保留 Root-only native multi-agent execution：A01/A02 concurrent initial Ready Set，A03 在两者完成且 Root focused verification通过后 read-only audit；children 无 Git 或 writing-descendant authority；Root 不 add/commit/push，只留下 unstaged implementation 并返回 `implementation_ready`。
- 执行 T05F01 的既有 Bridge process 会预先加载 current Controller，所以successful Root final message必须只输出一个完整YAML code fence，即one-time transition Required Coding Result。`native_backend` 与 `verification` mappings仅用于transition compatibility且均非authoritative；final message前后不得输出第二套包含known parser fields的summary，不得放宽production duplicate-field rejection，也不得添加 T05F01 task-ID production branch。
- fixed Chat 是唯一 Formal Review Authority；Supervisor 不 approve/merge、无 main authority。Fresh Contract尚未accepted；其未来acceptance也不授权 environment preparation、Task branch/worktree、Worker/children、Supervisor execution、`run-once`、Formal Review、PR Ready、merge 或 main write。
- 本轮只修改九份列明的 governance planning files。通过 governance validation 后只允许一个 `docs(s02): plan T05F01 retry 002 result envelope` commit（parent=`ec62546d6126ef5ecfbd0eceed100f916d75aa27`）与一次 ordinary non-force Stage push，随后 STOP。
