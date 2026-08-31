# Project Setup

This reference describes the project-local setup that binds one target project to its own Agent Room instance. The shared Plugin contains no project-specific value: every project keeps its own `.codex/config.toml` MCP entry, its own `.agent-room/runtime.json` and its own ignore rules.

## Automatic setup (Skill setup mode)

On an explicit operator request, the Agent Room Skill runs its setup mode with the Skill-owned helper `scripts/setup-project.ts` (Node.js standard library only). The operator provides the local Agent Room repository root (`agent_room_root`) once for a fresh binding (and again for a v0.2 migration); the helper resolves the current project path from the working directory, validates the root and every existing file before any write, then plans and writes conservatively:

- Fresh binding (no `.agent-room/runtime.json` and no `[mcp_servers.agent_room]` in `.codex/config.toml`): a v0.4 binding with `database_path` = `<project>/.agent-room/room-v0.4.sqlite` (absolute, auto-generated), `port` = OS-assigned ephemeral loopback port (JSON integer `1..65535`), `room_id` = `room-<UUID>` (auto-generated), `protocol_version` = `0.4-design`, `control_participant_id` = `codex-app`, `archived_database_paths` = `[]`. The helper creates the `.agent-room` parent directory but never initializes the database schema — only the existing `room:serve` does.
- Valid v0.4 binding: the exact identity (including the ordered `archived_database_paths`) is reused; only missing matching config/gitignore entries are appended, or a leftover v0.2 `/mcp/codex` URL is conservatively updated to the framed participant route; semantically identical files are never rewritten.
- Valid v0.3 binding (eight fields with `archived_database_path`): migrated. Every old database stays byte-unchanged at its original path (never deleted, renamed or rewritten); the helper creates `<project>/.agent-room/room-v0.4.sqlite` with a new `room_id`, reuses the port, and sets `archived_database_paths` to the version-ordered archive list — the v0.2 archived path recorded in the v0.3 binding (when present) followed by the old v0.3 database path. The stored v0.3 root points at the same Agent Room source tree (now v0.4) and is reused after validation; `--agent-room-root` may be omitted and, when provided, must resolve to the same directory. The framed participant route is identical in v0.3 and v0.4, so the config URL needs no rewrite. Migration reruns reuse the same v0.4 identity: no second database, Room, profile or assignment, and no archive entry is ever the new service `database_path`.
- Valid v0.2 binding (five fields): migrated. The old database stays byte-unchanged at its original path (never deleted, renamed or rewritten) and is recorded as the single entry of `archived_database_paths`; the helper creates `<project>/.agent-room/room-v0.4.sqlite` with a new `room_id`, reuses the port, sets `protocol_version`/`control_participant_id` and updates the config URL from the leftover v0.2 `/mcp/codex` route to the framed participant route. `--agent-room-root` is required again (the stored v0.2 root points at v0.2 code). Migration reruns reuse the same v0.4 identity.
- Invalid binding, missing runtime with an existing `[mcp_servers.agent_room]`, same-URL conflict, `agent_room_root` mismatch, an archive entry equal to `database_path` (the active database must never appear in `archived_database_paths`), a config URL that is neither the framed participant route nor the leftover v0.2 `/mcp/codex` URL (for example an unframed `.../mcp/participants/codex-app` candidate URL — binding/config mismatch, never auto-migrated) or any other runtime/config mismatch: stop and ask the operator; zero writes, no overwrite, no renamed server, no second port.

```text
node "<AGENT_ROOM_ROOT>/plugins/agent-room/skills/agent-room/scripts/setup-project.ts" --agent-room-root "<AGENT_ROOM_ROOT>"
```

The helper prints one deterministic JSON summary: `mode` (`created`/`migrated`/`reused`), the eight runtime values, config/gitignore change summary, the exact `room:serve` command inputs and `reload_required`. This stdout is informational only — the Room never treats it as durable state. Running the helper with `--probe` prints `{"port_open":true|false}` for the binding's loopback port.

The Skill then starts the existing `room:serve` when the port is closed (host background process boundary, bounded wait for the existing listening success signal), reports Codex Desktop reload required and stops. After the reload the operator runs the setup continuation: the Skill re-validates the binding and the MCP URL, calls `room_get_state`, creates the exact Room once via `room_create` when it does not exist yet, and verifies the same Room reaches `DISCUSSION`. Setup never invokes the one-shot launcher (`room:run`), never starts a Claude process and never mutates Git.

The three files are shown below for manual review.

## 1. `.codex/config.toml` — project-scoped MCP entry (merge, never overwrite)

Add the following server entry to the target project's existing `.codex/config.toml` (merge; never overwrite the whole file):

```toml
[mcp_servers.agent_room]
url = "http://127.0.0.1:<PROJECT_PORT>/mcp/participants/p~codex-app"
```

- Replace `<PROJECT_PORT>` with the same port used in `.agent-room/runtime.json` (the setup helper generates this port and writes the exact URL itself). The route is the framed participant route of the project's control participant (`codex-app`): the canonical segment is `p~` plus the raw participant id (transport framing; the raw id stays `codex-app` in the binding and all Room authority). An unframed `.../mcp/participants/codex-app` URL is not the participant route and is rejected as a binding/config mismatch; the v0.2 `/mcp/codex` alias route no longer exists.
- If `.codex/config.toml` already defines `mcp_servers.agent_room`, or any existing server entry uses the same `url`, stop and ask the operator how to proceed; do not silently overwrite. A leftover `http://127.0.0.1:<PROJECT_PORT>/mcp/codex` URL is updated to the framed participant route only by the setup helper's migration/reuse plan (conservative in-place URL rewrite, everything else verbatim).
- If the project binding cannot be determined, stop and ask the operator.

## 2. `.agent-room/runtime.json` — eight required fields

Create `.agent-room/runtime.json` in the target project with exactly these eight fields:

```json
{
  "agent_room_root": "<AGENT_ROOM_ROOT>",
  "database_path": "<DATABASE_PATH>",
  "project_path": "<PROJECT_PATH>",
  "port": <PROJECT_PORT>,
  "room_id": "<ROOM_ID>",
  "protocol_version": "0.4-design",
  "control_participant_id": "codex-app",
  "archived_database_paths": []
}
```

- `agent_room_root`: absolute path of the local Agent Room repository (contains its own `package.json` with the `room:run` script). The setup helper persists the operator-provided root; manual replacement must stay an absolute path.
- `database_path`: absolute path of this project's file-backed SQLite database. The setup helper generates `<project>/.agent-room/room-v0.4.sqlite` (fresh or migration); only the existing `room:serve` initializes the database schema.
- `project_path`: absolute path of the target project; must equal the project the operator is working in.
- `port`: the loopback port of this project's Room MCP server, as a JSON integer in `1..65535` (the setup helper uses an OS-assigned ephemeral loopback port; migration reuses the stored port).
- `room_id`: the Room bound to this project (created via `room_create`), a non-empty string (the setup helper generates `room-<UUID>`; migration generates a new id for the new v0.4 database).
- `protocol_version`: exactly `0.4-design`; any other value is an invalid binding.
- `control_participant_id`: the project-scoped control participant (`codex-app`), a non-empty string; the MCP URL and all Room commands target this participant.
- `archived_database_paths`: ordered JSON array of absolute paths of the archived databases of previous protocol versions — for a fresh binding `[]`, for a v0.2 migration `[<old v0.2 database path>]`, for a v0.3 migration the v0.2 archived path recorded in the v0.3 binding (when present) followed by the old v0.3 database path. No entry may equal `database_path`: the active database never appears in the archive list.
- No other fields, no secrets, no machine-specific defaults.

## 3. `.gitignore` — local runtime files (merge, never overwrite)

Add the following lines to the target project's existing `.gitignore` (merge; never overwrite):

```text
.agent-room/runtime.json
.agent-room/room.sqlite
.agent-room/room.sqlite-*
.agent-room/room-v0.3.sqlite
.agent-room/room-v0.3.sqlite-*
.agent-room/room-v0.4.sqlite
.agent-room/room-v0.4.sqlite-*
.agent-room/artifacts/
```

The runtime binding, the local database files (current and archived) and the local artifact directory must not be versioned.
