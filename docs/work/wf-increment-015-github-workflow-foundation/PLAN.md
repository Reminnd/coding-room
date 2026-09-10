# PLAN — wf-increment-015-github-workflow-foundation

| 字段 | 值 |
|---|---|
| status | `accepted_and_integrated` |
| goal | Increment 15 GitHub Workflow Foundation 已完成并收口 |
| active_stage | `none` |
| active_task | `none` |
| terminal_accepted_integrated_sha | `97ae2d869c39730fe77fb14df2ac34f57c681eb8` |
| closure_reconciliation_base | `97ae2d869c39730fe77fb14df2ac34f57c681eb8` |

当前链路：GitHub/Git facts → Local Bridge → Local Codex → Supervisor Integration → controlled Stage → S01 Bootstrap-B exact-SHA verification + fixed Chat Review → accepted S01 FF main → S02+ normal Actions candidate verification。

Repository lifecycle：repository discovery → explicit `codex-github-bridge bootstrap`（仅幂等补齐缺失的 required Actions settings）→ Repository Ready → 创建并推送新的 Stage Router/branch → single stage-generic Actions dispatch → normal Local Bridge execution。`start`/`run-once` 只做 read-only prerequisite checks，不将 bootstrap 作为 silent fallback。

Stage dispatch uses one existing `stage/**` workflow. The `stage/<workflow_id>/<stage_id>` branch deterministically supplies the workflow/stage identity and Router path, which must match the normalized GitHub event facts; stale-readiness and exact-head gates remain.

S01 Foundation、S02 native Codex task-thread transition与S03 docs-owned T06均已完成、接受并集成。S02 Worker/generic Result实现 source authority仍为`c6f22fa110076a2784a39702c18a7c6ba99199db`；S03 T06只同步十四份治理文档，不改变product source、tests或Agent Room runtime。

S03历史Stage/Router/Task/Fix Contract保持immutable。Increment 15 terminal accepted/integrated SHA为`97ae2d869c39730fe77fb14df2ac34f57c681eb8`；本次manual non-Router closure reconciliation以同一exact SHA为base，只更新十五个Current ledger/docs。该SHA记录Increment 15终态与本次reconciliation起点，不是reconciliation完成后的永久current `main` HEAD。当前不存在Active Stage或Active Task，不创建S04/T07。
