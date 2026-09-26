# Room UI delivery and closure

| Field | Value |
|---|---|
| Status | Accepted and integrated at 8bc2110; archived as archive/room-ui-v1 |
| Owner | Local Codex |
| Date | 2026-09-27 |
| Authorization | User goal and explicit acceptance of recommendations 2–7 |

## Scope and authorization

The user requests closure, integration and archival of current work followed by a complete Room UI inside Local Codex. The user accepted Windows local single-user operation, multiple local projects, simplified Chinese, system light/dark themes, a compact workspace, existing authenticated Codex/Claude execution and no additional paid API by default.

For this delivery, Local Codex owns planning, contracts, implementation, Worker dispatch, review, fixes, validation, commits, push and integration without repeated user approval. This is a task-scoped replacement for the previous fixed-Chat-only review and per-round confirmation requirements. Local Codex implements the desktop integration directly and assigns the API/React/CLI to an independent Worker with bounded ownership. Product-facing approval functionality remains present. Material scope changes, unresolved conflicts and new paid services require user input.

Archive accepted history and evidence; clean only integrated, clean temporary branches/worktrees. Preserve databases, uncommitted work and the active task. No permission to delete historical data or rewrite Git history is inferred.

## Deliverables

1. Resolve Increment 16 CI failures; verify and review the complete candidate; fast-forward the accepted exact SHA into main and archive the completed stage.
2. First implement/probe CDP attachment, document-start script injection, a native-looking Room panel loading the dashboard in an iframe, and a clickable Codex sidebar entry. Do not modify Codex source or app.asar. If practical attempts cannot make it work, use the explicitly authorized Codex in-app browser fallback. Persistence means the Room launcher reconnects/reinjects after reload/restart; do not claim a third-party supported native extension API.
3. Deliver project switching, Room overview, Plan/Task and dependency visualization, execution controls/logs, Question answers, Review/Fix, acceptance/Git integration, history/archive and settings.
4. Provide a VS Code button opening the relevant project/worktree for Git inspection. Preserve native Codex review navigation where supported.
5. Verify real UI actions against existing Room/SQLite and GitHub/Git authorities, restart/reconnect behavior, and the installed in-app surface. A static mockup or simulated state is insufficient.
6. Use one HTTP API for the React + TypeScript UI, taskctl CLI, and Codex Skill. Provide a Tauri desktop launcher (JS/TS/Rust) with one-click startup without a terminal. Language percentages are not acceptance criteria.

## Execution boundaries

Use existing Room services and Local Bridge operations, preserving their data authority. Do not add a parallel workflow database. Each implementation task has bounded ownership, an explicit contract and controller-owned Git delivery. Verify behavior at the public boundary, then continue to the next milestone.

## Current evidence

Increment 16 is accepted and integrated at `5a5ad734a5a5cbe0fffa02a628a505f0f108c363`, archived as `archive/increment-016`; PR #8 is merged. The newline and platform-fixture CI failures were fixed and Ubuntu 409/409 passed. See [closure](./INCREMENT_16_CLOSURE.md).

Room API/React/CLI implementation was delivered by native Worker UI-01 and integrated with the controller-owned Tauri/CDP/Skill implementation. Actual interaction, desktop cold startup, renderer reload and fixes are recorded in [Room UI review](./ROOM_UI_REVIEW.md); [PR #9](https://github.com/Reminnd/coding-room/pull/9) carries the complete delivery. No browser fallback was needed for the verified Codex build.

The pre-existing modification to `agent-guides/CODEX_DOCUMENTATION_AUTHORING.md` remains outside this delivery.