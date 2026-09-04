# PLAN — wf-increment-015-github-workflow-foundation

| 字段 | 值 |
|---|---|
| status | Accepted / PLAN_READY |
| goal | 完成 Final Local Parallel Bridge Migration 的 S01 Foundation |
| current_stage | [`S01-foundation-pilot`](./stages/S01-foundation-pilot/STAGE.md) |

当前链路：GitHub/Git facts → Local Bridge → Local Codex → Supervisor Integration → controlled Stage → S01 Bootstrap-B exact-SHA verification + fixed Chat Review → accepted S01 FF main → S02+ normal Actions candidate verification。

Repository lifecycle：repository discovery → explicit `codex-github-bridge bootstrap`（仅幂等补齐缺失的 required Actions settings）→ Repository Ready → 创建并推送新的 Stage Router/branch → single stage-generic Actions dispatch → normal Local Bridge execution。`start`/`run-once` 只做 read-only prerequisite checks，不将 bootstrap 作为 silent fallback。

Stage dispatch uses one existing `stage/**` workflow. The `stage/<workflow_id>/<stage_id>` branch deterministically supplies the workflow/stage identity and Router path, which must match the normalized GitHub event facts; stale-readiness and exact-head gates remain.

S01 当前只交付 Foundation 的四个并行任务；legacy `room:status --help` Pilot 延后，不是当前 dispatch source。
