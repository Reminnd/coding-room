# Agent Room UI 与 HTTP API

| 属性 | 内容 |
|---|---|
| 文档状态 | Candidate（UI-01 implementation） |
| Owner | Codex |
| Reader | 本地 operator、Codex Skill/CLI consumer、维护者 |
| 生效范围 | Windows 单用户、本地 loopback Room UI |
| 权威依赖 | [系统架构](./ARCHITECTURE.md)、[Room 协议](./ROOM_PROTOCOL.md) |

## 1. 结论与边界

Room UI 是现有 Agent Room application commands 的本地 React 操作面。HTTP API、`taskctl` 与浏览器使用同一入口；SQLite、`RoomService`、one-shot Runner 和 `GitController` 继续分别拥有 durable workflow、execution 与 GitAction authority。UI registry 只保存项目绑定，不复制 Task、Run、Review、Question、Event 或 Git 状态。

服务 MUST 绑定 `127.0.0.1`。本功能不增加账户、remote hosting、cloud service、paid API、任意 terminal console 或新的 Codex provider adapter。

## 2. 安装与启动

要求 Node.js 与根 `package.json` 的 `engines` 一致。

```powershell
npm ci
npm --prefix frontend ci
npm run room:ui -- --port 4317
```

默认地址为 `http://127.0.0.1:4317`，默认 UI registry 为当前目录的 `.agent-room/ui-projects.json`。指定独立 registry：

```powershell
npm run room:ui -- --port 4317 --config "D:\local-state\agent-room-ui.json"
```

`room:ui` 先执行 Vite production build，再由同一 loopback HTTP server 提供 `frontend/dist` 与 `/api/*`。开发前端可单独运行 `npm --prefix frontend run dev`，但 production 入口仍是上述同源 server。

## 3. 项目绑定与 setup

推荐在 UI 的 setup 页输入项目绝对路径，并读取该项目既有 `.agent-room/runtime.json`。读取成功后 registry 保存：

- `project_id` 与显示名称；
- absolute `project_path`、`database_path`；
- `room_id`、`control_participant_id`；
- existing MCP `port`。

也可手动输入同一组值。所有 Room API path 都包含 explicit `project_id`，因此 action 不依赖全局“当前项目”隐式路由。调用方不能提交 actor；planner/reviewer/orchestrator 固定使用项目配置的 control participant，executor/git controller 从所选 Room 的 durable assignment 解析。

绑定不会创建、迁移或覆盖数据库。`database_path` 缺失时 UI 显示配置错误；只有 operator 点击“显式创建新 Room”并发送 `confirm_create=true` 后，server 才创建 fresh SQLite 并调用 existing `RoomService.createRoom`。wrong-version、corrupt 或不匹配的既有数据库继续由现有 protocol/version gate 拒绝。

## 4. 工作台

- 总览：从 snapshot 计算 Room/Run/Question/Review/GitAction 状态和待处理事项。
- 计划 / Tasks：显示最新 revision 的 dependency edges、node/status/details；创建 Plan、immutable revision、明确 approval 和 one-shot reconcile。Implementation Task 只通过 approved graph revision materialize；direct task action 只接受 protocol-valid Fix Task。
- 执行：显示 durable Run/Attempt/evidence；ready Run 通过 existing `runRoomRun` one-shot boundary 异步启动，HTTP 立即返回 `202`。同一 Run 在 active Attempt 或 active UI launch 时拒绝重复启动。
- Questions：显示 question/options/context，提交 answer 与 `answer_changes_contract`。
- Reviews：提交 structured Review、明确接受 approved Review，并准备/提交完整 Fix Task Contract。
- Git：读取当前 branch/status/worktrees；preview/decision/execute/reconcile 全部调用 `GitController`，不接受 arbitrary Git argv。
- 历史：过滤 Event，并导出 archive JSON。导出只读取 snapshot，不删除或修改 SQLite。
- 设置：管理 theme、Participant enabled state 与 RoleAssignment。Participant/role mutation 继续通过现有 application methods。

轮询每四秒读取 selected project snapshot 与 launch 状态。轮询不会重建 page component，因此 focused/dirty form、选中 Run/record 保持；HTTP 错误持续显示，直到 operator 明确关闭。

## 5. Run、MCP 与 VS Code

启动 ready Run 时，server 使用 selected project 的 `database_path`、Run actual/fallback project worktree、fresh `attempt_id`，并从 configured `port` 与 Run frozen worker identity 构造 canonical MCP route：

```text
http://127.0.0.1:<port>/mcp/participants/p~<encoded-worker-participant-id>
```

对应 MCP service 必须已经运行。UI 不在后台创建 service manager，不轮询 ready queue，也不自动启动下一 Run。cancel、retry 与 guidance 调用 `RoomService`；guidance 只在 attempt 间隙保存，不声明 live steer。

“VS Code”通过 `code --reuse-window <target>` 的 argument array 打开 selected project 或 Run durable `worktree_path`，包含空格的路径仍是单个 argument。没有 worktree 的 Run 会被明确拒绝。Native Codex repository development 继续属于 Local Bridge；UI 不伪造 native panel 或 Codex adapter。

## 6. HTTP API

Base URL：`http://127.0.0.1:<ui-port>`。JSON mutation 使用 `Content-Type: application/json`。API 不使用 browser-only token；server 仅监听 loopback，并拒绝非 loopback `Host`/`Origin`。Protocol/application refusal 返回：

```json
{
  "error": {
    "code": "validation_failed",
    "message": "diagnostic"
  }
}
```

### 6.1 Project 与 read API

| Method | Path | 语义 |
|---|---|---|
| `GET` | `/api/health` | server readiness |
| `GET` / `POST` | `/api/projects` | 列出或添加 UI project binding |
| `POST` | `/api/projects/import-runtime` | 从 absolute project path 读取 runtime binding |
| `DELETE` | `/api/projects/:projectId` | 只删除 registry entry；不删除数据库 |
| `POST` | `/api/projects/:projectId/create-room` | 显式 fresh create；body=`{"confirm_create":true}` |
| `GET` | `/api/projects/:projectId/state` | 完整 authoritative snapshot |
| `GET` | `/api/projects/:projectId/events?after_sequence=0&type=...` | Event filter |
| `GET` | `/api/projects/:projectId/git` | read-only branch/status/worktrees |
| `GET` | `/api/projects/:projectId/launches` | 当前 server process 的 async launch outcome |
| `GET` | `/api/projects/:projectId/export` | download archive JSON |

### 6.2 Action API

所有 action 使用：

```text
POST /api/projects/:projectId/actions/:action
```

支持的 `:action`：

| Domain | Actions |
|---|---|
| Planning | `begin-architecture-review`, `request-user-confirmation`, `create-plan`, `create-plan-revision`, `decide-plan-revision`, `reconcile-plan`, `submit-fix-task` |
| Execution | `retry-run`, `cancel-run`, `add-guidance` |
| Question / Review | `answer-question`, `submit-review`, `accept-review` |
| Git | `git-preview`, `decide-git-action`, `git-execute`, `git-reconcile` |
| Participant | `register-participant`, `set-participant-enabled`, `create-role-assignment` |

输入先由 UI action schema 校验；组装后的 protocol entity 再由现有 Zod schema与 service guard 校验。caller-provided `actor` 是 unknown field，会在任何 Room write 前拒绝。

例：读取 snapshot：

```powershell
curl.exe "http://127.0.0.1:4317/api/projects/project-a/state"
```

例：回答 Question：

```powershell
curl.exe -X POST `
  -H "Content-Type: application/json" `
  -d '{"question_id":"question-1","answer":"采用 Option A","answer_changes_contract":false}' `
  "http://127.0.0.1:4317/api/projects/project-a/actions/answer-question"
```

例：异步启动 ready Run：

```powershell
curl.exe -X POST `
  -H "Content-Type: application/json" `
  -d '{"run_id":"run-1","attempt_id":"attempt-ui-1"}' `
  "http://127.0.0.1:4317/api/projects/project-a/runs/start"
```

## 7. `taskctl`

`taskctl` 只调用上述 HTTP API，不直接打开 SQLite，也不接受 actor override。

```powershell
npm run taskctl -- projects list
npm run taskctl -- --json state project-a
npm run taskctl -- action project-a answer-question --file .\answer.json
npm run taskctl -- events project-a --after 120 --type question_answered
npm run taskctl -- export project-a --out .\room-archive.json
npm run taskctl -- open project-a --run-id run-1
```

默认 URL 为 `http://127.0.0.1:4317`；使用 `--url` 覆盖 UI port，使用 `--json` 输出 machine-readable result。`--data <json>` 与 `--file <path>` 互斥。

## 8. Restart、archive 与限制

- Restart 后 registry 从 configured JSON 恢复，Room entities/actions 从 selected SQLite 恢复。
- in-process launch display 不作为 durable authority，server restart 后不恢复；Run/Attempt/Event 的 durable outcome继续从 snapshot读取。
- archive 是当前 project binding + full snapshot 的 JSON artifact，不包含 SQLite file copy，不删除 history。
- UI 不迁移 archived database、不自动启动 MCP service、不自动审批 revision/review/GitAction、不执行 arbitrary shell/Git command。
- 本 Candidate 的实际 in-app browser screenshots 与交互验收由 Controller 执行；本文只声明代码与 focused HTTP/semantic verification 支持的行为。
