# Project Setup

This reference describes the project-local setup that binds one target project to its own Agent Room instance. The shared Plugin contains no project-specific value: every project keeps its own `.codex/config.toml` MCP entry, its own `.agent-room/runtime.json` and its own ignore rules.

All values below are placeholders — replace them with the values of the current project. Do not use another machine's paths, secrets, permission rules or defaults that could pollute other projects.

## 1. `.codex/config.toml` — project-scoped MCP entry (merge, never overwrite)

Add the following server entry to the target project's existing `.codex/config.toml` (merge; never overwrite the whole file):

```toml
[mcp_servers.agent_room]
url = "http://127.0.0.1:<PROJECT_PORT>/mcp/codex"
```

- Replace `<PROJECT_PORT>` with the same port used in `.agent-room/runtime.json`.
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

- `agent_room_root`: absolute path of the local Agent Room repository (contains its own `package.json` with the `room:run` script).
- `database_path`: absolute path of this project's file-backed SQLite database, chosen by the operator.
- `project_path`: absolute path of the target project; must equal the project the operator is working in.
- `port`: the loopback port of this project's Room MCP server, as a JSON integer in `1..65535`.
- `room_id`: the Room bound to this project (created via `room_create`), a non-empty string.
- No other fields, no secrets, no machine-specific defaults.

## 3. `.gitignore` — local runtime files (merge, never overwrite)

Add the following lines to the target project's existing `.gitignore` (merge; never overwrite):

```text
.agent-room/runtime.json
.agent-room/artifacts/
```

`.agent-room/runtime.json` and the local artifact directory must not be versioned.
