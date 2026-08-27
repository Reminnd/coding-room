---
name: agent-room
description: "Use when the operator asks to run the Agent Room workflow for the current project or its local `.agent-room/runtime.json` binding: validate the project-local Room binding, follow the durable Room state through planning, one-shot Claude Run, Question, Review/Fix and acceptance, and invoke the Agent Room launcher at most once per approved task run."
---

# Agent Room Skill

Run the Agent Room workflow for the current project: validate the project-local Room binding, follow the durable Room state through planning, one-shot run, question, retry, review, fix and acceptance, and invoke the Agent Room launcher exactly once per approved task run.

## Overview

The Agent Room coordinates user, Codex and Claude Code on a shared local Git worktree: Codex submits a Task Contract, Claude Code executes it via a one-shot Runner process, Codex reviews the actual Diff. Each project owns a local Room instance: a per-project Room service on a loopback port, a file-backed SQLite database, and a project-scoped MCP endpoint at `http://127.0.0.1:<PROJECT_PORT>/mcp/codex`. The one-shot launcher script (`room:run`) executes exactly one Claude Code run.

Codex is the fixed caller of the one-shot launcher in this workflow. The host approval mode is the operator-configured UI "帮我批准" (`approvals_reviewer=auto_review`): one approval authorizes at most one launcher invocation; a rejection means zero invocations. The Skill never modifies the approval policy, never writes active permission rules, never asks for ad-hoc npm/shell allow rules, and never falls back to an operator-run command.

The SQLite Room is the single durable state authority. The launcher's process output is not an authority: after every planned invocation the Skill re-reads the Room and reports only the durable snapshot. This Skill never turns Codex into a business coding actor — Claude Code is the only actor that edits the working tree.

## When To Use

- The operator asks to run the Agent Room workflow for a project, or
- The project's `.agent-room/runtime.json` exists and the Room MCP server is running, and
- The Room is in a state that allows the next workflow step (planning, run, question, retry, review, fix or acceptance).

Do not use for free-form conversation or for inspecting the Room outside the workflow; the project-scoped MCP endpoint is the authority for reading state.

## Prerequisites

- Node.js installed; the Agent Room repository is present locally.
- The target project has a `.agent-room/runtime.json` and a project-scoped `.codex/config.toml` as described in `references/project-setup.md`.
- The target project's Room MCP server is already running on the configured loopback port (the operator starts it with the Agent Room `room:serve` script before this workflow; the Skill does not initialize runtime).
- The target project is the project you are currently working in.

## Step 1 — Validate the project-local runtime binding

Read the current project's `.agent-room/runtime.json`. It must be a JSON object containing exactly these five required fields and no others:

| Field | Required shape |
|---|---|
| `agent_room_root` | absolute path string; must resolve to a directory containing the Agent Room repository `package.json` with a `room:run` script |
| `database_path` | absolute path string; the operator-chosen file-backed SQLite database of this project |
| `project_path` | absolute path string; after normal host path resolution must equal the current target project |
| `port` | JSON integer in `1..65535` |
| `room_id` | non-empty string |

Validation rules — any violation stops the workflow and is reported; the Skill never guesses, scans or falls back to another project's configuration:

- A missing field, an extra field, a wrong type, a non-absolute path, a non-integer or out-of-range `port`, or an empty `room_id` → stop and report.
- `project_path` must resolve (via the host's normal path resolution) to the current target project directory. If it resolves to any other directory → stop and report a project binding mismatch.
- `agent_room_root` must contain the Agent Room `package.json` whose `scripts` define `room:run`. If not → stop and report; the target project does not need its own `room:run` script or package manifest.
- `database_path` is the operator-chosen file-backed database of this project. It is not derived from any other file, and the Skill does not scan for or infer databases.

## Step 2 — Validate the project-scoped MCP binding

Read the current project's `.codex/config.toml`. It must define `[mcp_servers.agent_room]` with a `url` that matches exactly `http://127.0.0.1:<runtime.port>/mcp/codex` (loopback host, the exact `port` from `runtime.json`, exact `/mcp/codex` route). A missing server, a different URL, or a mismatch with `runtime.port` → stop and report before any Task command or launcher invocation.

Then call `room_get_state` on the project-scoped MCP endpoint with `room_id = <ROOM_ID>` and confirm the returned Room identity equals `<ROOM_ID>`. A mismatch or an error → stop and report.

## Step 3 — Follow the durable Room state

Read the Room with `room_get_state` (the project-scoped `/mcp/codex` endpoint is the workflow authority; `room:status` may be used only for manual CLI viewing). The Room state decides the only legal next action:

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
npm --prefix "<AGENT_ROOM_ROOT>" run room:run -- --db "<DATABASE_PATH>" --project "<PROJECT_PATH>" --task-id "<TASK_ID>" --run-id "<RUN_ID>" --mcp-url "http://127.0.0.1:<PROJECT_PORT>/mcp/claude" [--baseline-head "<OBSERVED_BASELINE_HEAD>"]
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
