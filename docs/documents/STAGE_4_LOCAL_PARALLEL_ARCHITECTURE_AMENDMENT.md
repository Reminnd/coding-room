# Stage 4 Local Parallel Architecture Amendment

| 属性 | 内容 |
|---|---|
| 文档状态 | Current |
| Owner | Codex |
| 更新日期 | 2026-09-04 |
| 生效范围 | 项目开发控制面 |

## 1. 结论

GitHub 是持久化事实与控制面；Local Bridge 是 discovery、scheduler 与 Git delivery boundary；Local Codex 是 implementation surface；ChatGPT fixed Chat 是唯一 formal Review Authority。Cloud Codex 与 Work 不属于 Current architecture。

```text
fixed Chat → accepted Contract → GitHub facts → Actions validation
→ Local Bridge → dependency DAG / Ready Set → parallel Local Codex worktrees
→ Git facts → Supervisor Integration → controlled task-to-Stage cherry-pick
→ Stage verification / exact-head Ready for Review → fixed Chat review
→ user acceptance → exact accepted Stage SHA non-force fast-forward to main
```

## 2. 冻结决策

- Local Bridge MUST stop on conflict; it MUST NOT rebase, auto-resolve, merge, retry, fix, or review.
- Task→Stage MUST record `source_task_sha → stage_commit_sha`; Stage→main MUST use exact accepted SHA and non-force fast-forward.
- Model policy and reasoning effort are Task Contract facts. Ready Set contains only dependency-satisfied tasks.
- GitHub Actions MAY notify, but notifications are not authority; Actions do not require an API key or run an LLM.
- There is no local queue database, provider registry, generic plugin bus, heartbeat/lease, automatic retry framework, or hash index.
- `room:status --help` remains deferred Pilot scope.

## 3. 责任边界与验收

Local Bridge discovers accepted Contracts, computes the DAG/Ready Set, creates independent worktrees/task branches, collects actual Git facts, and performs controlled integration. Supervisor Integration is not formal Review. A Stage is Ready for Review only when verification passes and its exact head is recorded; any later Stage change invalidates readiness. fixed Chat reviews the exact PR/Stage head and the user accepts the exact Stage SHA.
