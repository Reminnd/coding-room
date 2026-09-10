# PLAN — wf-increment-015-github-workflow-foundation

| 字段 | 值 |
|---|---|
| status | S03CF01 Repaired Locally / Awaiting Stage Push Authorization |
| goal | 在已接受并集成的 S02 native Codex Worker 基线上恢复并执行 T06 exact 14-path authority synchronization |
| current_stage | [`S03-native-codex-thread-contracts`](./stages/S03-native-codex-thread-contracts/STAGE.md) |

当前链路：GitHub/Git facts → Local Bridge → Local Codex → Supervisor Integration → controlled Stage → S01 Bootstrap-B exact-SHA verification + fixed Chat Review → accepted S01 FF main → S02+ normal Actions candidate verification。

Repository lifecycle：repository discovery → explicit `codex-github-bridge bootstrap`（仅幂等补齐缺失的 required Actions settings）→ Repository Ready → 创建并推送新的 Stage Router/branch → single stage-generic Actions dispatch → normal Local Bridge execution。`start`/`run-once` 只做 read-only prerequisite checks，不将 bootstrap 作为 silent fallback。

Stage dispatch uses one existing `stage/**` workflow. The `stage/<workflow_id>/<stage_id>` branch deterministically supplies the workflow/stage identity and Router path, which must match the normalized GitHub event facts; stale-readiness and exact-head gates remain.

S01 Foundation 与 S02 native Codex task-thread transition 已完成、接受并集成；当前 GitHub `main` exact head 为 `c6f22fa110076a2784a39702c18a7c6ba99199db`。S03 只包含一个 docs-owned T06，不重开 S02 implementation，不恢复 legacy `room:status --help` Pilot。T06 future Worker implementation ownership 是 exact 14 paths；本次 `S03CF01` manual governance repair 只修改既有 6-file Contract bundle，两者不得混淆。

S03 Stage 已建立并 push，Draft PR #7 已存在；pushed candidate `ddbc5a35d734eaca908090013b3ce29202086483` 因 Contract drift 未被接受。`S03CF01` 已在该 parent 上本地恢复 Contract semantics；当前仍不授权 repair push、T06 task branch/worktree、Local Bridge `start`/`run-once` 或 Implementation。下一步必须先单独授权推送 exact repair head，经既有 stage-generic Actions 重新验证并取得 exact handoff，再由用户接受 exact pushed Contract SHA；T06 dispatch 仍需后续独立授权。
