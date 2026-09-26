# Room UI delivery review

| Field | Value |
|---|---|
| Status | Approved and integrated at 8bc2110; archive/room-ui-v1 |
| Reviewer | Local Codex under the user's task-scoped continuous-delivery delegation |
| Date | 2026-09-27 |
| Scope | ROOM_UI_DELIVERY_PLAN.md and ROOM_UI_IMPLEMENTATION_TASK.md |
| Baseline | Increment 16 accepted source `5a5ad73`, closure documentation `c0dbcd7` |
| Candidate | [PR #9](https://github.com/Reminnd/coding-room/pull/9) |

## Findings

No unresolved blocking findings. The following reachable issues were corrected before approval:

- `src/ui/application.ts`: a shared SQLite database can contain multiple Rooms. ID-only Question, Review, Run and GitAction operations now validate the selected project's Room before acting. HTTP tests reject cross-Room Question answers and Review acceptance, then verify the intended Room's lifecycle and restart persistence.
- `src/ui/application.ts`: Windows `code.cmd` cannot be spawned as a native executable. Resolve the installation's `Code.exe` and retain argument-array invocation; a real UI click opened the selected workspace containing spaces. Failed/interrupted Runner results now remain failed in launch display.
- `tools/taskctl.mjs`: unknown trailing arguments previously reached a mutation before being rejected. Parse and reject them before the HTTP call; CLI regression proves the Room remains in DISCUSSION.
- `frontend/src/pages/{Plans,Reviews,Git}Page.tsx`: JSON parsing now occurs inside the error boundary. A real malformed nodes payload displayed a visible alert without losing the form. DAG selection and work-item matching now retain Plan/revision identity.
- `tools/room-desktop/cdp.mjs`: the installed Codex frame policy required a renderer-scoped CSP override and a fresh document. Reloading during first bootstrap caused ERR_ABORTED and removed the renderer. The companion now waits for the actual loaded sidebar, registers the document-start script, reloads once, and reports connection only after the sidebar entry mounts. Cold startup from the installed shortcut and subsequent renderer reload both retained a working iframe.
- `tests/scope.test.ts`: the historical source-module allowlist did not include the approved UI adapter. Add only `ui` and its four owned files; retain the existing package/plugin/Git constraints.

## Open questions

None within the accepted delivery scope. No paid API or additional account was introduced.

## Review decision

`approved` under the current user delegation. This is a local delivery review, not a fabricated fixed-Chat Router response or typed acceptance record for Increment 16.

## Verification

- Ubuntu final [Actions run 36261848052](https://github.com/Reminnd/coding-room/actions/runs/36261848052): 415/415 tests, TypeScript, production Vite build and diff check passed. Final branch checks remain visible on PR #9.
- Windows: full run had 414 passing tests and the obsolete scope allowlist failure; after the narrow correction, scope 2/2 passed. HTTP/CLI 6/6, TypeScript and production build passed. Existing tests cover lifecycle, retry, cancellation, GitController and persistence; no paid live Claude Run was started for UI QA.
- Real browser: created Plan/revision, approved the revision, displayed its node and waiting reason, rejected malformed JSON visibly, switched projects/themes, filtered durable events and exported the QA archive. The scratch project registry entry was then removed; its database and archive were preserved. The real project stayed in DISCUSSION with zero Runs.
- Installed Windows Tauri release executable, Desktop `Room.lnk` and personal `room-ui` Skill. Invoked the shortcut without a terminal; it started the Codex profile, connected the sidebar and loaded the real React UI. Reload restored the open panel; stopping/restarting the owned Codex instance produced a new renderer with the same working panel. The pre-existing non-debug Codex instance was preserved.
- Actual VS Code process received the selected path as one argument. The UI and taskctl share the HTTP API; API restart retained the project registry and Room data.
- `documentation: updated`: UI/API, desktop installation, current architecture/operations, documentation maps and Increment 16 closure status are aligned. The pre-existing documentation-authoring guide modification is excluded.

## Operating limits

The sidebar is a local CDP injection, not an official Codex extension. It uses a loopback debugging endpoint and a renderer CSP override without editing Codex source or app.asar. When the existing Codex instance has no debug endpoint, Room opens a separate Codex window/profile. App DOM changes may require updating the companion; the same HTTP UI remains available in the built-in browser.

Run startup is explicit and one-shot. The Room runtime remains Claude-backed; repository implementation remains the native Codex Local Bridge workflow. The launcher starts MCP for its entry project; other imported projects retain their own MCP service bindings. Archive export preserves history and does not delete SQLite.
