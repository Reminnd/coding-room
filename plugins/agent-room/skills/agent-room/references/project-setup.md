# Project Setup

This reference describes the project-local setup that binds one target project to its own Agent Room instance. The shared Plugin contains no project-specific value: every project keeps its own `.codex/config.toml` MCP entry, its own `.agent-room/runtime.json` and its own ignore rules.

## Automatic setup (Skill setup mode)

On an explicit operator request, the Agent Room Skill runs its setup mode with the Skill-owned helper `scripts/setup-project.ts` (Node.js standard library only). The operator provides the local Agent Room repository root (`agent_room_root`) exactly once; the helper resolves the current project path from the working directory, validates the root and every existing file before any write, then plans and writes conservatively:

- Fresh binding (no `.agent-room/runtime.json` and no `[mcp_servers.agent_room]` in `.codex/config.toml`): `database_path` = `<project>/.agent-room/room.sqlite` (absolute, auto-generated), `port` = OS-assigned ephemeral loopback port (JSON integer `1..65535`), `room_id` = `room-<UUID>` (auto-generated). The helper creates the `.agent-room` parent directory but never initializes the database schema — only the existing `room:serve` does.
- Valid existing binding: the exact identity is reused; only missing matching config/gitignore entries are appended; semantically identical files are never rewritten.
- Invalid binding, missing runtime with an existing `[mcp_servers.agent_room]`, same-URL conflict, `agent_room_root` mismatch or runtime/config mismatch: stop and ask the operator; zero writes, no overwrite, no renamed server, no second port.

```text
node "<AGENT_ROOM_ROOT>/plugins/agent-room/skills/agent-room/scripts/setup-project.ts" --agent-room-root "<AGENT_ROOM_ROOT>"
```

The helper prints one deterministic JSON summary: `mode` (`created`/`reused`), the five runtime values, config/gitignore change summary, the exact `room:serve` command inputs and `reload_required`. This stdout is informational only — the Room never treats it as durable state. Running the helper with `--probe` prints `{"port_open":true|false}` for the binding's loopback port.

The Skill then starts the existing `room:serve` when the port is closed (host background process boundary, bounded wait for the existing listening success signal), reports Codex Desktop reload required and stops. After the reload the operator runs the setup continuation: the Skill re-validates the binding and the MCP URL, calls `room_get_state`, creates the exact Room once via `room_create` when it does not exist yet, and verifies the same Room reaches `DISCUSSION`. Setup never invokes the one-shot launcher (`room:run`), never starts a Claude process and never mutates Git.

The three files are shown below for manual review.

## 1. `.codex/config.toml` — project-scoped MCP entry (merge, never overwrite)

Add the following server entry to the target project's existing `.codex/config.toml` (merge; never overwrite the whole file):

```toml
[mcp_servers.agent_room]
url = "http://127.0.0.1:<PROJECT_PORT>/mcp/codex"
```

- Replace `<PROJECT_PORT>` with the same port used in `.agent-room/runtime.json` (the setup helper generates this port and writes the exact URL itself).
- If `.codex/config.toml` already defines `mcp_servers.agent_room`, or any existing server entry uses the same `url`, stop and ask the operator how to proceed; do not silently overwrite.
- If the project binding cannot be determined, stop and ask the operator.

## 2. `.agent-room/runtime.json` — five required fields

Create `.agent-room/runtime.json` in the target project with exactly these five fields:

```json
{
  "agent_room_root": "<AGENT_ROOM_ROOT>",
  "database_path": "<DATABASE_PATH>",
  "project_path": "<PROJECT_PATH>",
  "port": <PROJECT_PORT>,
  "room_id": "<ROOM_ID>"
}
```

- `agent_room_root`: absolute path of the local Agent Room repository (contains its own `package.json` with the `room:run` script). The setup helper persists the operator-provided root; manual replacement must stay an absolute path.
- `database_path`: absolute path of this project's file-backed SQLite database. The setup helper generates `<project>/.agent-room/room.sqlite`; only the existing `room:serve` initializes the database schema.
- `project_path`: absolute path of the target project; must equal the project the operator is working in.
- `port`: the loopback port of this project's Room MCP server, as a JSON integer in `1..65535` (the setup helper uses an OS-assigned ephemeral loopback port).
- `room_id`: the Room bound to this project (created via `room_create`), a non-empty string (the setup helper generates `room-<UUID>`).
- No other fields, no secrets, no machine-specific defaults.

## 3. `.gitignore` — local runtime files (merge, never overwrite)

Add the following lines to the target project's existing `.gitignore` (merge; never overwrite):

```text
.agent-room/runtime.json
.agent-room/room.sqlite
.agent-room/room.sqlite-*
.agent-room/artifacts/
```

The runtime binding, the local database files and the local artifact directory must not be versioned.
