# ROUTER CONTRACT — S02 Native Codex Transition Repair

> Owner: Codex。更新日期：2026-09-09。T05、T05F00 -005 与 T05F01 -002 已全部集成；current integrated dispatch 为 `wf15-s02-t05f01-generic-worker-result-boundary-002`。Stage `7de85b277693f7a907af907929d00239f9c62fd4` 的 fixed Chat Formal Review 结果为 `REQUEST_CHANGES`，blockers=`FR-S02-001, FR-S02-002`。下方 JSON 是 byte-semantic frozen Router contract；其中 `status: dispatch_ready` 不表示当前存在新 Task dispatch。
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

## Current Stage and review gates

- main authority=`bd41ea8a1e259300241a345a659e7da90e24af0d`；T05 source=`9cc6899b69a96c3d9cfbe12f57cf93fdf59bb434` → Stage=`dbd10202f5289d91d7caab9c67e1de878b0ae843`；T05F00 -005 source=`3acabe66784ff1e66501b9c09e08cbf86ff9976a` → Stage=`f79780251332ad89844392cc3185a981cc2f496d`；T05F01 -002 source=`f6bafbf5df27a6cab8440fd7b577e49f8b6a74d6` → Stage=`7de85b277693f7a907af907929d00239f9c62fd4`。
- T05R02 manual bootstrap history 与 synthetic-event prohibition 保持不变。T05F00 `-001/-002/-003/-004` 仍是 immutable terminal history；`-004` dirty worktree 与 T05D00 probe worktree/branch 必须 untouched。
- T05F00 -005 已由 production Bridge 集成：source=`3acabe66784ff1e66501b9c09e08cbf86ff9976a` → Stage=`f79780251332ad89844392cc3185a981cc2f496d`；native thread=`01a07fdf-33d1-7153-8cf6-e681eb08c1f9`，turn=`01a07fdf-3450-70a3-be08-fe722c96abe2`，model=`gpt-5.6-sol / medium`；Controller focused=`11/11`、Bridge=`112/112`、typecheck=`pass`、diff-check=`pass`；Supervisor=`ready_to_integrate`。
- T05F01 dispatch `wf15-s02-t05f01-generic-worker-result-boundary-001` 已 immutable terminal blocked，exact reason=`Worker completed with invalid required Coding Result: duplicate field task_id`，process exit=`0`，native thread=`01a08136-8359-7471-a380-2f412e853bdb`，turn=`01a08136-83d1-7b00-97fc-86c2d0f7aaed`。原branch=`task/wf-increment-015-github-workflow-foundation/T05F01-generic-worker-result-boundary`，worktree=`D:/agent/case/codex-claudecode-room-codex-workers/T05F01-generic-worker-result-boundary`；两者不得 replay 或 cleanup。该attempt未形成Controller candidate、Task push、Stage integration或`candidate_ready`，main unchanged。
- 上方 T05F01 Router entry记录已集成 dispatch `wf15-s02-t05f01-generic-worker-result-boundary-002` 与 task branch `task/wf-increment-015-github-workflow-foundation/T05F01-generic-worker-result-boundary-002`；`depends_on`、`owns`、model policy、reasoning effort、fallback 与 verification 保持 semantic identical，T05F00 entry unchanged。
- T05、T05F00 -005 与 T05F01 -002 已全部集成；Router 当前没有新的 Task dispatch。T05F01 -002 的 historical Contract=`Accepted`、`confirmed_by_user=true`。
- T05F01 只清理 Worker Result generic boundary：common fields=`task_id/dispatch_id/reported_base_sha/deviations/unresolved/questions/status`；status 只允许 `implementation_ready/blocked/needs_decision`；仅 `implementation_ready` 额外要求 non-empty `changed_files`。
- Future generic Worker Result 不要求 `native_backend`、`verification` 或 `reported_task_head_sha`。Native authority=`processResult.native`；verification authority=`task.verification → runVerification()`；ownership authority=`Router owns + observed working paths + mechanicalGate()`；candidate identity 由 Controller Git facts产生。
- Current successful sequence保持：semantic status gate → `observeWorkingTree` 与 HEAD/branch/staged/working-path/changed-files/ownership gates → Router verification → post-verification re-observation → exact staging/cached diff-check/deterministic commit → `collectTaskFacts`/candidate-file gate/`mechanicalGate` → Supervisor → dependency → Task push → controlled Stage integration → `task_integrated`。T05F01 不重写这些 gates。
- T05F01 production change 精确落在 `controller.mjs` 与 `tests/controller.test.mjs`；该历史 implementation scope 已随 `-002` 集成完成。T06 不在 Router JSON 中，仍不可 dispatch。
- T05F01 使用了 Root-only native multi-agent execution：A01/A02 concurrent initial Ready Set，A03 在两者完成且 Root focused verification 通过后 read-only audit；children 无 Git 或 writing-descendant authority；Root 未 add/commit/push，由既有 Controller 形成 candidate。
- T05F01 的 successful Root final message 只输出一个完整 YAML code fence，即 one-time transition Required Coding Result。`native_backend` 与 `verification` mappings 仅用于 transition compatibility 且均非-authoritative；production duplicate-field rejection 保持不变，未添加 T05F01 task-ID production branch。
- Stage `7de85b277693f7a907af907929d00239f9c62fd4` 已完成 candidate publication 与 GitHub verification；fixed Chat Formal Review 结果为 `REQUEST_CHANGES`，blockers=`FR-S02-001, FR-S02-002`，尚无 `PASS`。
- fixed Chat 是唯一 Formal Review Authority；Supervisor 不 approve、`REQUEST_CHANGES`、merge 或写 `main`。每个新的 Stage head 都必须重新经过 candidate publication、GitHub verification 与 fixed Chat Formal Review；取得 `PASS` 和用户授权前不得 Stage→main integration。
- S02FR01 是 manual non-Router repair，不得创建 Bridge Task lifecycle、Worker、children、Supervisor execution 或 synthetic lifecycle event。本轮 repair 后停止，等待 candidate refresh authorization。
