---
name: room-ui
description: "Operate the local Agent Room workbench through its shared HTTP API: inspect projects, plans, runs and Questions, submit authorized lifecycle actions, and export history. Use for requests to operate Room; not for unrelated repository coding."
---

# Room workbench

Use the same local HTTP API as the React UI and taskctl. Default base URL is `http://127.0.0.1:4317`; use an explicitly configured Room URL when present. Never edit SQLite or maintain a second workflow ledger.

1. Read `GET /api/health` and `GET /api/projects`. Select the project matching the user's current workspace; when several match, use its room_id and project_path to resolve selection. Do not pick the first unrelated project.
2. Read `GET /api/projects/{project_id}/state` before acting. Room planning state, per-Run status, Questions, Reviews, DAG and GitActions are authoritative. A process running or an HTTP 202 response does not mean a Run succeeded.
3. Use the repository's `tools/taskctl.mjs --help` and `docs/documents/ROOM_UI.md` for current action arguments. Use `POST /api/projects/{project_id}/actions/{action}` with the documented payload, or the matching taskctl command. Project identity is in the route, not a caller-invented actor.
4. Act within the user's current authorization. Preserve earlier delegation; do not request repetitive approvals. Explain any substantive missing decision. Record answers/Review decisions faithfully and never fabricate `confirmed_by_user` for unapproved work.
5. Read durable state after an operation. On an ambiguous timeout, inspect the relevant entity/attempt before retrying. Do not start a second Run attempt just because the first HTTP response was interrupted.

Useful reads: `/state`, `/events`, `/git`, `/launches`, `/export` under the project route. Starting an already-ready Run uses `POST /runs/start`; VS Code uses `POST /open-vscode`. Archive export preserves the database and is not deletion. Use the relevant worktree for review.

If the API is offline, launch the installed Room desktop shortcut or report that the local service is unavailable. Do not fall back to direct database mutation or substitute a mock result. The CDP panel and browser page are views of this service; closing a view does not cancel a Run.
