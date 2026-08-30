---
name: agent-room
description: "Use when the operator asks to run the Agent Room workflow for the current project or its local `.agent-room/runtime.json` binding, or to set up the Agent Room for the current project from an operator-provided agent_room_root: validate the project-local Room binding, follow the durable Room state through planning, one-shot Claude Run, Question, Review/Fix and acceptance, and invoke the Agent Room launcher at most once per approved task run."
---

# Agent Room Skill

Run the Agent Room workflow for the current project: validate the project-local Room binding, follow the durable Room state through planning, one-shot run, question, retry, review, fix and acceptance, and invoke the Agent Room launcher exactly once per approved task run. On an explicit operator request, run the setup mode that binds the current project to its own local Agent Room service.

## Overview

The Agent Room coordinates user, Codex and Claude Code on a shared local Git worktree: Codex submits a Task Contract, Claude Code executes it via a one-shot Runner process, Codex reviews the actual Diff. Each project owns a local Room instance: a per-project Room service on a loopback port, a file-backed SQLite database, and a project-scoped MCP endpoint at `http://127.0.0.1:<PROJECT_PORT>/mcp/participants/p~<CONTROL_PARTICIPANT_ID>` (framed v0.3 participant route — `p~` plus the raw participant id; the control participant is `codex-app`, so the concrete URL is `http://127.0.0.1:<PROJECT_PORT>/mcp/participants/p~codex-app`). The one-shot launcher script (`room:run`) executes exactly one Claude Code run.

Codex is the fixed caller of the one-shot launcher in this workflow. The host approval mode is the operator-configured UI "帮我批准" (`approvals_reviewer=auto_review`): one approval authorizes at most one launcher invocation; a rejection means zero invocations. The Skill never modifies the approval policy, never writes active permission rules, never asks for ad-hoc npm/shell allow rules, and never falls back to an operator-run command.

The SQLite Room is the single durable state authority. The launcher's process output is not an authority: after every planned invocation the Skill re-reads the Room and reports only the durable snapshot. This Skill never turns Codex into a business coding actor — Claude Code is the only actor that edits the working tree.

## When To Use

- The operator asks to run the Agent Room workflow for a project, or
- The operator explicitly asks to set up the Agent Room for the current project (setup mode), or
- The project's `.agent-room/runtime.json` exists and the Room MCP server is running, and
- The Room is in a state that allows the next workflow step (planning, run, question, retry, review, fix or acceptance).

Do not use for free-form conversation or for inspecting the Room outside the workflow; the project-scoped MCP endpoint is the authority for reading state. Setup mode is never entered implicitly: in the normal workflow a missing or invalid binding stops and reports.

## Prerequisites

Normal workflow (Steps 1-4):

- Node.js installed; the Agent Room repository is present locally.
- The target project has a `.agent-room/runtime.json` and a project-scoped `.codex/config.toml` as described in `references/project-setup.md`.
- The target project's Room MCP server is already running on the configured loopback port (the operator starts it with the Agent Room `room:serve` script before this workflow; the normal workflow does not initialize runtime).
- The target project is the project you are currently working in.

Setup mode: the operator provides the local Agent Room repository root (`agent_room_root`) once; the setup mode establishes the binding, starts the service and, after a Codex Desktop reload, creates the Room. Details below and in `references/project-setup.md`.

## Setup mode — explicit project setup

Entry: the operator explicitly asks to initialize the Agent Room for the current project and provides the local Agent Room repository root (`agent_room_root`) exactly once; the helper persists it in the project binding. Setup mode is never entered implicitly: in the normal workflow a missing binding stops and reports.

### Phase 1 — establish the binding and start the service

1. Validate `agent_room_root`: resolve it to an absolute path and confirm the directory contains the Agent Room `package.json` whose scripts define both `room:serve` and `room:run`. Stop before any project write if this fails.
2. Run the Skill-owned deterministic helper from the target project working directory:

```text
node "<AGENT_ROOM_ROOT>/plugins/agent-room/skills/agent-room/scripts/setup-project.ts" --agent-room-root "<AGENT_ROOM_ROOT>"
```

   The helper reads and validates every existing file before any write, then plans or stops:
   - No runtime binding and no `[mcp_servers.agent_room]` in `.codex/config.toml` → create a fresh v0.3 binding: `database_path` = `<PROJECT_PATH>/.agent-room/room.sqlite` (absolute), `port` = an OS-assigned ephemeral loopback port (JSON integer in `1..65535`), `room_id` = `room-<UUID>`, `protocol_version` = `0.3-design`, `control_participant_id` = `codex-app`, `archived_database_path` = `null`; create or conservatively merge the three files.
   - Valid v0.3 binding → reuse its exact `agent_room_root`, `database_path`, `port`, `room_id` and identity fields; only append missing matching config/gitignore entries or conservatively update a leftover v0.2 `/mcp/codex` URL to the framed participant route; semantically identical files are never rewritten.
   - Valid v0.2 binding (five fields, archive input) → migrate: keep the old database byte-unchanged at its original path (never delete, rename or rewrite it), create `<PROJECT_PATH>/.agent-room/room-v0.3.sqlite` with a new `room_id`, reuse the port, set `archived_database_path` to the old database path, and update the config URL to the participant route; `--agent-room-root` is required again because the stored v0.2 root points at v0.2 code. Migration reruns reuse the same v0.3 identity — no second database, Room, profile or assignment.
   - Invalid binding, `agent_room_root` mismatch, missing runtime with an existing `[mcp_servers.agent_room]`, same-URL conflict, `archived_database_path` equal to `database_path`, a config URL that is neither the framed participant route nor the leftover v0.2 `/mcp/codex` URL (for example an unframed `.../mcp/participants/codex-app` candidate URL — rejected as a binding/config mismatch, never auto-migrated), or any other runtime/config mismatch → stop with zero writes and report; ask the operator how to proceed. Never overwrite, never rename a server, never pick a second port to dodge a conflict.
   The helper prints one deterministic JSON summary: `mode` (`created`/`migrated`/`reused`), the eight runtime values, config/gitignore change summary, the exact `room:serve` command inputs and `reload_required`. This stdout is informational only — the Room never treats it as durable state.
3. Probe the binding's loopback port:

```text
node "<AGENT_ROOM_ROOT>/plugins/agent-room/skills/agent-room/scripts/setup-project.ts" --probe
```

   The probe prints `{"port_open":true|false}` for the current project binding. If the port is open, do not start a second process. If it is closed, start exactly one existing `room:serve` through the host-supported background process boundary, capturing its output:

```text
npm --prefix "<AGENT_ROOM_ROOT>" run room:serve -- --db "<DATABASE_PATH>" --project "<PROJECT_PATH>" --port <PROJECT_PORT>
```

   Wait for the existing listening success signal (the probe reports `port_open:true` within a short bounded wait). The probe is not Room identity authority. If host approval rejects the start or the bind fails, keep the generated binding, report `service_start_pending` and stop. No service manager, no automatic restart, no health scheduler.
4. Report Codex Desktop reload required and stop. The project-scoped `.codex/config.toml` MCP entry loads only after the reload; never bypass it with raw HTTP, another project's MCP, global Codex config or direct database writes.

### Phase 2 — setup continuation (after reload)

The operator explicitly continues setup after the Codex Desktop reload:

1. Re-validate per Step 1 and Step 2: the eight runtime fields, the exact `http://127.0.0.1:<PROJECT_PORT>/mcp/participants/p~codex-app` config URL and the service.
2. Call `room_get_state` with the exact generated `room_id`. If the Room does not exist yet, call `room_create` once with that exact `room_id` (setup mode only), then call `room_get_state` again: it must return the same Room with state `DISCUSSION`. If the same-id Room already exists, reuse it (idempotency). Any other MCP error stops and reports.
3. Setup is complete when the binding is consistent, the service is reachable and the Room exists with readable identity and `DISCUSSION` state. Report the result and stop — do not begin an Architecture Review, do not submit a Task, do not invoke the launcher, do not start a Claude process and do not create the next turn.

The setup mode never enters the normal workflow: it uses only the existing `room:serve`, `room_create` and `room_get_state`. Everything else — planning, run, question, review, fix and acceptance — stays behind the normal workflow gates.

## Step 1 — Validate the project-local runtime binding

Read the current project's `.agent-room/runtime.json`. A v0.3 binding is a JSON object containing exactly these eight required fields and no others:

| Field | Required shape |
|---|---|
| `agent_room_root` | absolute path string; must resolve to a directory containing the Agent Room repository `package.json` with a `room:run` script |
| `database_path` | absolute path string; the operator-chosen file-backed SQLite database of this project |
| `project_path` | absolute path string; after normal host path resolution must equal the current target project |
| `port` | JSON integer in `1..65535` |
| `room_id` | non-empty string |
| `protocol_version` | exactly `0.3-design` |
| `control_participant_id` | non-empty string; the project-scoped control participant (`codex-app`) |
| `archived_database_path` | absolute path string or `null`; the archived v0.2 database path (never equal to `database_path`) |

Validation rules — any violation stops the workflow and is reported; the Skill never guesses, scans or falls back to another project's configuration:

- A missing field, an extra field, a wrong type, a non-absolute path, a non-integer or out-of-range `port`, an empty `room_id`, a `protocol_version` other than `0.3-design`, an empty `control_participant_id`, an `archived_database_path` that is neither absolute nor `null`, or an `archived_database_path` equal to `database_path` → stop and report.
- `project_path` must resolve (via the host's normal path resolution) to the current target project directory. If it resolves to any other directory → stop and report a project binding mismatch.
- `agent_room_root` must contain the Agent Room `package.json` whose `scripts` define `room:run`. If not → stop and report; the target project does not need its own `room:run` script or package manifest.
- `database_path` is the operator-chosen file-backed database of this project. It is not derived from any other file, and the Skill does not scan for or infer databases.
- A v0.2 five-field binding is not a valid v0.3 binding: it is archive input for setup migration (see Setup mode). In the normal workflow a missing, v0.2 or invalid binding stops and reports; setup migration is never entered implicitly.

## Step 2 — Validate the project-scoped MCP binding

Read the current project's `.codex/config.toml`. It must define `[mcp_servers.agent_room]` with a `url` that matches exactly `http://127.0.0.1:<runtime.port>/mcp/participants/p~<runtime.control_participant_id>` (loopback host, the exact `port` from `runtime.json`, the framed v0.3 participant route — `p~` prefix plus the raw participant id). A missing server, a different URL (including an unframed `.../mcp/participants/<id>` candidate URL), a leftover v0.2 `/mcp/codex` route, or a mismatch with `runtime.port` → stop and report before any Task command or launcher invocation (a leftover v0.2 URL is migrated only through setup mode, never fixed in the normal workflow).

Then call `room_get_state` on the project-scoped MCP endpoint with `room_id = <ROOM_ID>` and confirm the returned Room identity equals `<ROOM_ID>`. A mismatch or an error → stop and report.

## Step 3 — Follow the durable Room state

Read the Room with `room_get_state` (the project-scoped `/mcp/participants/p~codex-app` endpoint is the workflow authority; `room:status` may be used only for manual CLI viewing). The Room state decides the only legal next action:

| Room state | Required action |
|---|---|
| `DISCUSSION` | Only begin an Architecture Review: call `room_begin_architecture_review` (after the Architecture Review artifact is prepared). New Rooms are only created with `room_create`. |
| `ARCHITECTURE_REVIEW` | When the plan is ready, request user confirmation: call `room_request_user_confirmation`. |
| `WAITING_FOR_USER_CONFIRMATION` | Wait for the user's explicit confirmation. Only after the user confirms, submit the complete Accepted Task Contract via `room_submit_task` (with `confirmed_by_user: true`, `created_by: codex`). |
| `PLAN_READY` / `FIX_PLAN_READY` | These ready states allow planning exactly one Run. Proceed to Step 4. |
| `CODING` | Report the current active Run (from the snapshot) and stop. Zero launcher invocations. |
| `NEEDS_DECISION` | While the current Question is still open, the only legal action is to read it, get the user's answer, and call `room_answer_question` with `question_id`, `answer` and `answer_changes_contract` — zero launcher invocations. With `answer_changes_contract=false` the Room keeps `NEEDS_DECISION`: the answered continuation is then a Step 4 entry for exactly one resume Run (no `--baseline-head`; the persisted source Run owns baseline and session). With `answer_changes_contract=true` the Room returns to planning/confirmation and the old Task must not be resumed; that branch never enters Step 4. |
| `RUN_FAILED` | Only after the user decides to retry, call `room_retry_run` (moves the Room back to `PLAN_READY`), then plan the retry Run in Step 4. |
| `REVIEW_REQUIRED` | Review the actual task-owned Diff (VS Code / Git), then call `room_submit_review` with the structured Review (including an empty `findings` list when the implementation is correct). |
| `REVIEW_DISCUSSION` | Wait for the user's decision: submit a confirmed Fix Task (which moves the Room to `FIX_PLAN_READY`) or, when no blocking finding remains and the user accepts, call `room_accept_review` with `review_id` and `confirmed_by_user: true`. |
| `ACCEPTED` | Report and stop. |

The Skill never starts a second run while a Run is active, never auto-fixes, never auto-accepts, and never schedules repeated runs.

## Step 4 — Plan exactly one one-shot invocation

Only from `PLAN_READY`, `FIX_PLAN_READY`, or a `NEEDS_DECISION` Decision continuation whose `answer_changes_contract=false` has already succeeded (the current Question is answered and no longer open; the read model is `NEEDS_DECISION` with `current_question` = null, and the existing `room:run` preflight / getContinuationContext verifies the same current Task and Run lineage — never guess or create a Task):

1. **Run identity**: choose a fresh non-empty `run_id` that does not exist in this Room (check the Room snapshot; do not reuse any completed, failed, needs-decision or active Run id, and do not mint a second `run_id` when an approval or process outcome is uncertain). This exact `run_id` is shown in the command, presented in the approval request, and used in the invocation — it never changes.
2. **Baseline head (first new Implementation only)**: the `--baseline-head` value comes exclusively from the `observed_baseline_head` of the same first successful `room_submit_task` response — bind that exact value into this same planned command immediately. Never read the live Git HEAD and never run a Git HEAD command as a fallback. If the response value is `null` or was lost → zero invocation and report `needs_decision`.
   - Fix runs, decision resumes with `answer_changes_contract=false`, and `RUN_FAILED` retries omit `--baseline-head`; the persisted source Run owns their baseline and session.
3. **Exact command** — run from the target project working directory, quoting every path/ID/URL value:

```text
npm --prefix "<AGENT_ROOM_ROOT>" run room:run -- --db "<DATABASE_PATH>" --project "<PROJECT_PATH>" --task-id "<TASK_ID>" --run-id "<RUN_ID>" --mcp-url "http://127.0.0.1:<PROJECT_PORT>/mcp/participants/p~claude-code-cli" [--baseline-head "<OBSERVED_BASELINE_HEAD>"]
```

`--baseline-head` appears only in the first new Implementation invocation. The launcher is resolved against the validated `agent_room_root`; the target project does not need to expose any package manifest or `room:run` script.

4. **Approval**: present the same exact command to the operator and request exactly one eligible escalation through the host UI approval (the operator-configured "帮我批准" / `approvals_reviewer=auto_review`). Approval authorizes at most one invocation; rejection means zero invocations — report the rejection. Never modify the approval policy, never write an active `prefix_rule` or equivalent allow/sandbox rule, never request arbitrary npm/shell allow rules, and never fall back to an operator-run command.
5. **Execute once** when approved.
6. **After the command returns** — regardless of exit code, stdout or model self-report — call `room_get_state` again for the same `room_id` and verify the same `run_id` / current Run. Report only the durable snapshot state: `REVIEW_REQUIRED`, `NEEDS_DECISION`, `RUN_FAILED`, `CODING`, or whatever the Room actually shows. If the approval result or the process outcome is uncertain, re-read the Room first, and only then decide or ask the operator; never re-execute or mint a second `run_id` while the claim is unconfirmed.

## Optional — manual status viewing

For manual CLI viewing only (not the workflow authority), the real `room:status` script with its existing arguments may be used:

```text
npm --prefix "<AGENT_ROOM_ROOT>" run room:status -- --db "<DATABASE_PATH>" --room-id "<ROOM_ID>"
```

The project MCP snapshot remains the workflow authority.

## One-shot authorization semantics

- The Skill provides no active `prefix_rule` (or equivalent allow/sandbox rule) write step and does not modify the operator's approval policy.
- One approval → at most one launcher invocation and one Run; zero approvals → zero invocations; a rejected approval is reported as such.
- Each fresh implementation run uses its own Claude CLI process and session; the fix chain resumes the original session via the persisted source Run.

## Non-goals

- No planning beyond the Room's legal transitions, no direct edits to the target project's files, no commit/push/branch/reset/clean or any other Git write operation, no starting a real Claude process by the Skill itself.
- No multi-project scheduling inside one approval, no parallel runs inside a single Room, no scheduling of repeated runs.
- Setup mode never invokes the one-shot launcher (`room:run`), never submits a Task, never starts a Claude process and never mutates Git; it never adds a service manager, automatic restart, health scheduler, global Codex config or raw HTTP fallback.
