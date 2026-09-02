---
name: agent-room
description: "Use when the operator asks to run the Agent Room workflow for the current project or its local `.agent-room/runtime.json` binding, or to set up the Agent Room for the current project from an operator-provided agent_room_root: validate the project-local Room binding, follow the durable planning-only Room state and per-Run work items through planning, one-shot RunAttempt, Question, Review/Fix and acceptance, and invoke the Agent Room launcher at most once per approved task run."
---

# Agent Room Skill

Run the Agent Room workflow for the current project: validate the project-local Room binding, follow the durable planning-only Room state and per-Run work items through planning, one-shot attempt, question, retry, review, fix and acceptance, and invoke the Agent Room launcher exactly once per approved task run. On an explicit operator request, run the setup mode that binds the current project to its own local Agent Room service.

## Overview

The Agent Room coordinates user, Codex and Claude Code on a shared local Git worktree: Codex submits a Task Contract (which atomically creates a ready Run), Claude Code executes it via a one-shot Runner attempt, Codex reviews the actual Diff. Each project owns a local Room instance: a per-project Room service on a loopback port, a file-backed SQLite database, and a project-scoped MCP endpoint at `http://127.0.0.1:<PROJECT_PORT>/mcp/participants/p~<CONTROL_PARTICIPANT_ID>` (framed participant route — `p~` plus the raw participant id; the control participant is `codex-app`, so the concrete URL is `http://127.0.0.1:<PROJECT_PORT>/mcp/participants/p~codex-app`). The one-shot launcher script (`room:run`) executes exactly one RunAttempt of one Run.

Increment 12 creates Implementation Runs only through `Plan` → immutable `TaskGraphRevision` → exact user `Approval` → manual one-shot `room_reconcile_plan`. Reconcile consumes operator-prepared existing worktrees, creates ready Runs, and never launches Claude or mutates Git. `room_submit_task` remains available only for a confirmed Fix on an existing `review_discussion` Run.

The Room itself stays in the planning-only states `DISCUSSION` / `ARCHITECTURE_REVIEW` / `WAITING_FOR_USER_CONFIRMATION`. Execution state lives in per-Run work items: each Run has its own ready/execution/needs-decision/review/accepted lifecycle, its own worktree lease and session lineage. The snapshot's `run_work_items` list (sorted by `created_at` then `run_id`) is the authority for which Run waits on which actor; the Skill never infers a single "current Run".

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

1. Validate `agent_room_root`: resolve it to an absolute path and confirm the directory contains the Agent Room `package.json` whose scripts define `room:serve`, `room:run` and `room:git`. Stop before any project write if this fails.
2. Run the Skill-owned deterministic helper from the target project working directory:

```text
node "<AGENT_ROOM_ROOT>/plugins/agent-room/skills/agent-room/scripts/setup-project.ts" --agent-room-root "<AGENT_ROOM_ROOT>"
```

   The helper reads and validates every existing file before any write, then plans or stops:
   - No runtime binding and no `[mcp_servers.agent_room]` in `.codex/config.toml` → create a fresh v0.5 binding: `database_path` = `<PROJECT_PATH>/.agent-room/room-v0.5.sqlite` (absolute), `port` = an OS-assigned ephemeral loopback port (JSON integer in `1..65535`), `room_id` = `room-<UUID>`, `protocol_version` = `0.5-design`, `control_participant_id` = `codex-app`, `archived_database_paths` = `[]`; create or conservatively merge the three files.
   - Valid v0.5 binding → reuse its exact `agent_room_root`, `database_path`, `port`, `room_id`, identity fields and `archived_database_paths`; only append missing matching config/gitignore entries or conservatively update a leftover v0.2 `/mcp/codex` URL to the framed participant route; semantically identical files are never rewritten.
   - Valid v0.3 binding (eight fields with `archived_database_path`, archive input) → migrate: keep every old database byte-unchanged at its original path (never delete, rename or rewrite any of them), create `<PROJECT_PATH>/.agent-room/room-v0.5.sqlite` with a new `room_id`, reuse the port, and set `archived_database_paths` to the version-ordered archive list — the v0.2 archived path recorded in the v0.3 binding (when present) followed by the old v0.3 database path. The stored v0.3 `agent_room_root` points at the same Agent Room source tree (now v0.5), so it is reused after validation; `--agent-room-root` may be omitted, and if provided must resolve to the same directory. Migration reruns reuse the same v0.5 identity — no second database, Room, profile or assignment.
   - Valid v0.2 or v0.4 binding → stop with zero writes. Increment 12 supports only fresh v0.5 and the active v0.3→v0.5 path; it adds no v0.4 compatibility layer or direct v0.2 migration.
   - Invalid binding, `agent_room_root` mismatch, missing runtime with an existing `[mcp_servers.agent_room]`, same-URL conflict, an archive list entry equal to `database_path` (the active database must never appear in `archived_database_paths`), a config URL that is neither the framed participant route nor the leftover v0.2 `/mcp/codex` URL (for example an unframed `.../mcp/participants/codex-app` candidate URL — rejected as a binding/config mismatch, never auto-migrated), or any other runtime/config mismatch → stop with zero writes and report; ask the operator how to proceed. Never overwrite, never rename a server, never pick a second port to dodge a conflict.
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

Read the current project's `.agent-room/runtime.json`. A v0.5 binding is a JSON object containing exactly these eight required fields and no others:

| Field | Required shape |
|---|---|
| `agent_room_root` | absolute path string; must resolve to a directory containing the Agent Room repository `package.json` with a `room:run` script |
| `database_path` | absolute path string; the operator-chosen file-backed SQLite database of this project |
| `project_path` | absolute path string; after normal host path resolution must equal the current target project |
| `port` | JSON integer in `1..65535` |
| `room_id` | non-empty string |
| `protocol_version` | exactly `0.5-design` |
| `control_participant_id` | non-empty string; the project-scoped control participant (`codex-app`) |
| `archived_database_paths` | JSON array of absolute path strings (may be empty); the version-ordered archived databases of previous protocol versions (no entry may equal `database_path`) |

Validation rules — any violation stops the workflow and is reported; the Skill never guesses, scans or falls back to another project's configuration:

- A missing field, an extra field, a wrong type, a non-absolute path, a non-integer or out-of-range `port`, an empty `room_id`, a `protocol_version` other than `0.5-design`, an empty `control_participant_id`, an `archived_database_paths` that is not an array of absolute path strings, or an archive entry equal to `database_path` → stop and report.
- `project_path` must resolve (via the host's normal path resolution) to the current target project directory. If it resolves to any other directory → stop and report a project binding mismatch.
- `agent_room_root` must contain the Agent Room `package.json` whose `scripts` define `room:run`. If not → stop and report; the target project does not need its own `room:run` script or package manifest.
- `database_path` is the operator-chosen file-backed database of this project. It is not derived from any other file, and the Skill does not scan for or infer databases.
- A v0.2 five-field or v0.3 eight-field binding is not a valid v0.5 binding. Setup mode rejects v0.2 and accepts only v0.3 as migration input; in the normal workflow a missing, v0.2, v0.3 or invalid binding stops and reports. Setup migration is never entered implicitly.

## Step 2 — Validate the project-scoped MCP binding

Read the current project's `.codex/config.toml`. It must define `[mcp_servers.agent_room]` with a `url` that matches exactly `http://127.0.0.1:<runtime.port>/mcp/participants/p~<runtime.control_participant_id>` (loopback host, the exact `port` from `runtime.json`, the framed participant route — `p~` prefix plus the raw participant id). A missing server, a different URL (including an unframed `.../mcp/participants/<id>` candidate URL), a leftover v0.2 `/mcp/codex` route, or a mismatch with `runtime.port` → stop and report before any Task command or launcher invocation (a leftover v0.2 URL is migrated only through setup mode, never fixed in the normal workflow).

Then call `room_get_state` on the project-scoped MCP endpoint with `room_id = <ROOM_ID>` and confirm the returned Room identity equals `<ROOM_ID>`. A mismatch or an error → stop and report.

## Step 3 — Follow the durable Room state and per-Run work items

Read the Room with `room_get_state` (the project-scoped `/mcp/participants/p~codex-app` endpoint is the workflow authority; `room:status` may be used only for manual CLI viewing). The snapshot has two authorities: the planning-only Room state and the sorted `run_work_items` list. The Room state decides the only legal next planning action:

| Room state | Required action |
|---|---|
| `DISCUSSION` | Only begin an Architecture Review: call `room_begin_architecture_review` (after the Architecture Review artifact is prepared). New Rooms are only created with `room_create`. |
| `ARCHITECTURE_REVIEW` | When the plan is ready, request user confirmation: call `room_request_user_confirmation`. |
| `WAITING_FOR_USER_CONFIRMATION` | Wait for the user's explicit decision on the exact latest Draft revision. Call `room_decide_plan_revision` with `confirmed_by_user: true`; a decision returns the Room to `DISCUSSION`, and no Task/Run exists until manual reconcile. |

For a new Implementation, call `room_create_plan` once, then `room_create_plan_revision` with complete `TaskSpec`, dependencies, exact worker assignment, priority and structured write scopes. After approval, select an eligible `graph_work_item`, prepare an existing Git worktree, and call `room_reconcile_plan` once with its path. Missing worktree mappings remain waiting. Never auto-reconcile, auto-launch or infer approval. If `answer_changes_contract=true`, create a new revision with fresh replacement node/task/run IDs; never resume or mutate the old node.

For each Run in `run_work_items` (sorted by `created_at` then `run_id`), its `status` and `waiting_actor` decide the only legal next action for that Run:

| Run status | Required action |
|---|---|
| `ready` | Plan exactly one one-shot invocation for this Run (Step 4) — a new Implementation Run's first attempt, a Fix Task continuation, a decision resume with `answer_changes_contract=false`, or a `room_retry_run` retry. Before a retry attempt, the planner may add guidance with `room_add_run_guidance` (a fresh `guidance_id`, the Run's `run_id` and the guidance text; only while the Run has no active attempt — the next attempt claim consumes it exactly once). |
| `running` / `cancel_requested` | Report the active attempt and stop. Zero launcher invocations while the Run has an active attempt. When the user confirms a cancel, the planner calls `room_cancel_run` with the Run's `run_id`, a reason and `confirmed_by_user: true` (the Run and its active attempt move to `cancel_requested`; the Executor settles the attempt `canceled`). |
| `needs_decision` | While the current Question is still open, the only legal action is to read it, get the user's answer, and call `room_answer_question` with `question_id`, `answer` and `answer_changes_contract` — zero launcher invocations. With `answer_changes_contract=false` the Run returns to `ready`: the answered continuation is then a Step 4 entry for exactly one resume attempt (the persisted Run owns its canonical worktree and session). With `answer_changes_contract=true` the Room moves to planning confirmation and the old Task must not be resumed; that branch never enters Step 4. |
| `failed` / `canceled` | Only after the user decides to retry, call `room_retry_run` with the Run's `run_id` (moves the Run back to `ready`), then plan the retry attempt in Step 4. |
| `review_required` | Review the actual task-owned Diff (VS Code / Git), then call `room_submit_review` with the structured Review bound to the Run's latest succeeded attempt (including an empty `findings` list when the implementation is correct). |
| `review_discussion` | Wait for the user's decision: submit a confirmed Fix Task via `room_submit_task` with `type: "fix"` for this Run (which returns the Run to `ready` without changing the planning-only Room state) or, when no blocking finding remains and the user accepts, call `room_accept_review` with `review_id` and `confirmed_by_user: true`. |
| `accepted` | Report and stop; the Run's worktree lease is released. |

The Skill never starts an attempt while a Run has an active attempt, never auto-fixes, never auto-accepts, and never schedules repeated runs.

## Step 4 — Plan exactly one one-shot invocation

Only for a Run whose work item status is `ready` (a new Implementation Run after Task submission, a Fix Task continuation, a decision resume whose `answer_changes_contract=false` has already succeeded — the current Question is answered and no longer open — or a `room_retry_run` retry):

1. **Run identity**: the `run_id` comes exclusively from the durable snapshot — the ready Run shown in `run_work_items` (for a new Implementation Task it is the explicit `run_id` of the Task Contract Codex submitted). Never mint a second `run_id` when an approval or process outcome is uncertain; the exact `run_id` is shown in the command, presented in the approval request, and used in the invocation — it never changes.
2. **Attempt identity**: choose a fresh non-empty `attempt_id` that does not exist in this Room (per attempt, per invocation). The persisted Run owns the canonical worktree (frozen by the first attempt's clean-Git gate) and the session lineage — the command never carries a `--task-id` or Git revision argument.
3. **Exact command** — run from the target project working directory, quoting every path/ID/URL value:

```text
npm --prefix "<AGENT_ROOM_ROOT>" run room:run -- --db "<DATABASE_PATH>" --project "<PROJECT_PATH>" --run-id "<RUN_ID>" --attempt-id "<FRESH_ATTEMPT_ID>" --mcp-url "http://127.0.0.1:<PROJECT_PORT>/mcp/participants/p~claude-code-cli"
```

   The launcher is resolved against the validated `agent_room_root`; the target project does not need to expose any package manifest or `room:run` script. The worker route is the Run's frozen worker identity (`claude-code-cli` in the bootstrap Room).
4. **Approval**: present the same exact command to the operator and request exactly one eligible escalation through the host UI approval (the operator-configured "帮我批准" / `approvals_reviewer=auto_review`). Approval authorizes at most one invocation; rejection means zero invocations — report the rejection. Never modify the approval policy, never write an active `prefix_rule` or equivalent allow/sandbox rule, never request arbitrary npm/shell allow rules, and never fall back to an operator-run command.
5. **Execute once** when approved.
6. **After the command returns** — regardless of exit code, stdout or model self-report — call `room_get_state` again for the same `room_id` and verify the same `run_id` in `run_work_items` and its latest attempt (`current_attempt_id`). Report only the durable snapshot state: `review_required`, `needs_decision`, `failed`, `canceled`, or whatever the Run actually shows. If the approval result or the process outcome is uncertain, re-read the Room first, and only then decide or ask the operator; never re-execute or mint a second `attempt_id` while the claim is unconfirmed.

## GitAction workflow — explicit preview, decision and one-shot execution

When the durable snapshot reports an eligible `git_waiting_reason`, Git mutation remains a separate operator-controlled workflow. The fixed Git actor is the enabled, current `local-runner` participant with the Room-scoped `git_controller` assignment and `git_control` capability; the control participant never executes Git.

1. Select exactly one eligible operation and a fresh `git_action_id`. Run one `room:git preview` command from the target project directory through the validated Agent Room root. The command includes `--db`, `--git-action-id`, `--room-id`, `--revision-id`, `--node-id`, `--operation` and only that operation's typed fields. Preview observes live Git facts and persists the exact typed intent; it performs zero Git mutation.
2. Re-read `room_get_state` and show the operator the exact persisted preview, including its action ID, operation, repository/worktree/branch/path fields and `preview_event_sequence`. Do not summarize away fields.
3. Ask the operator whether to approve that exact preview. Only after explicit confirmation call `room_decide_git_action` as the planner with a fresh `approval_id`, `target_type=git_action_preview`, `target_id=<GIT_ACTION_ID>`, the exact decision and `confirmed_by_user=true`. Rejection means zero execute invocation; any later proposal uses a fresh action ID and preview.
4. For an approved and still-unstale action, present the exact one-shot execution command and request one host execution approval:

```text
npm --prefix "<AGENT_ROOM_ROOT>" run room:git -- execute --db "<DATABASE_PATH>" --git-action-id "<GIT_ACTION_ID>"
```

   One approval authorizes at most one invocation. Rejection means zero invocation. Never add an allow rule, execute automatically, retry, clean up, or substitute another Git command.
5. After the command returns, re-read `room_get_state` and report only the durable action status/result and Git waiting projection. `failed` and `outcome_unknown` are terminal and are never replayed. An `executing` action whose process ownership was lost may only use the explicit read-only `room:git reconcile` command after operator direction; reconciliation marks `outcome_unknown` and never infers success or starts Git.

The fixed operation allowlist is `create_worktree`, `commit_paths` and `integrate_fast_forward`. It does not include arbitrary argv, shell execution, push/fetch/pull, merge commits, cherry-pick, rebase, reset, checkout, clean, branch/worktree deletion, force, amend or conflict resolution. `room_reconcile_plan` only projects eligibility and materializes durable work; it never invokes `room:git` or `room:run`.

## Optional — manual status viewing

For manual CLI viewing only (not the workflow authority), the real `room:status` script with its existing arguments may be used:

```text
npm --prefix "<AGENT_ROOM_ROOT>" run room:status -- --db "<DATABASE_PATH>" --room-id "<ROOM_ID>"
```

The project MCP snapshot remains the workflow authority.

## One-shot authorization semantics

- The Skill provides no active `prefix_rule` (or equivalent allow/sandbox rule) write step and does not modify the operator's approval policy.
- One approval → at most one launcher invocation, one RunAttempt; zero approvals → zero invocations; a rejected approval is reported as such.
- Each attempt uses its own Claude CLI process; the session lineage is per-Run: fix and decision continuations reuse the exact session recorded by the Run's latest reliable attempt, and a failure retry may use a replacement session. A new Run never inherits another Run's session.

## Non-goals

- No planning beyond the Room's legal transitions, no direct edits to the target project's files, no commit/push/branch/reset/clean or any other Git write operation, no starting a real Claude process by the Skill itself.
- No multi-project scheduling inside one approval, no scheduling of repeated runs; the Skill never orchestrates parallel Runs itself — each invocation executes exactly one attempt of one Run.
- Setup mode never invokes the one-shot launcher (`room:run`), never submits a Task, never starts a Claude process and never mutates Git; it never adds a service manager, automatic restart, health scheduler, global Codex config or raw HTTP fallback.
