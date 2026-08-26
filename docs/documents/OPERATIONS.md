# Agent Room 运维手册

> 状态：Current
> 维护者：Codex（项目文档编写者及维护者）
> 最后维护日期：2026-08-25
> Last maintained review：`review-increment-004-codex-004`

本手册面向本机 operator，集中说明当前可用接口、组件结构、验证命令、状态与制品位置以及失败检查路径。协议字段和完整 transition 以 [ROOM_PROTOCOL.md](./ROOM_PROTOCOL.md) 为准，长期架构以 [ARCHITECTURE.md](./ARCHITECTURE.md) 为准；本手册不建立平行权威。

## 1. 当前运维基线

| 项目 | 当前事实 |
|---|---|
| Runner integration commit | `e8f0da6db9f3f4ff426355fa1a84d19bae4db9f2`；已进入 `main` |
| Accepted Scaffold source commit | `eb3637b642aaa88e1faab51a570c6fea688c3cf9`，保留于 `codex/increment-003-scope-scaffold` |
| Integration 状态 | Review 1 的四项 finding 已修复；Review 2 `approved`、用户已接受；commit 已 fast-forward 集成到 `main` |
| Runtime readiness | Protocol/Room domain、只读 Git Observer 与 central Runner TypeScript API 已在 `main` |
| Service readiness | Room server、MCP、Status CLI 已由 commit `44fd34959834b28c8909b589a203e4c48eadc5b0` 进入版本化 `main`；Runner 仍是 TypeScript API，不包含 daemon manager |
| 可执行验证 | `npm run typecheck`、MCP 27/27 与全量 186/186 通过；stale succeeded Run / wrong-current MCP direct regression 已闭环 |

`room:serve`/`room:status` script 已进入版本化 `main` baseline。它们要求 operator 显式提供本地 database/project/port 或 room ID；没有 `npm start`、Room daemon、implicit production SQLite path 或 service manager。

## 2. 架构与目录结构

当前 implemented dependency flow：

```text
tests / future application entry
        │
        ├──> src/protocol
        │      schemas · types · ProtocolError
        │
        ├──> src/room/RoomService
        │      │
        │      ├──> RoomRepository ──> caller-provided SQLite DatabaseSync
        │      └──> state-machine
        │
        ├──> src/runner (Current implementation)
        │      ClaudeRunner ──> RoomService · Git Observer · claude-process · claude-stream
        │
        └──> src/git/Git Observer ──> git-process ──> local Git CLI

Current, ACCEPTED (versioned main baseline):
Room MCP (src/mcp) · Status CLI (src/cli) · runtime service entry (room:serve)
```

| 路径 | 状态 | 运维责任 |
|---|---|---|
| `src/protocol/` | Implemented | runtime schema、entity type、error code |
| `src/room/` | Implemented | SQLite domain repository、state transition、application service |
| `src/git/` | Implemented | clean baseline 与 completion Git evidence；只读 Git command |
| `src/runner/` | Implemented | `claude-runner.ts` central orchestration 组合 `claude-process.ts` 与 `claude-stream.ts`；位于 `main` |
| `src/mcp/` | Current | actor-scoped MCP、JSON response、request cleanup、durable-state/idempotency 与 stale submit-review evidence 已闭环 |
| `src/cli/` | Current | read-only Status CLI；SQLite read-only 打开，既存空 database 不被初始化 |
| `.agent-room/artifacts/` | Bootstrap/runtime artifact location | Git ignored；保存 Claude stdout/status 等本地证据 |

## 3. 当前已实现接口

### 3.1 Protocol

`src/protocol/schema.ts` 导出并由 Zod 验证：

- `RoomState`、`Actor`；
- `TaskContract`、`Run`、`CodingResult`、`Review`、`Question`、`Event`；
- 对应 `*Schema` runtime validator 与严格 UTC timestamp validator。

`src/protocol/errors.ts` 导出 `ProtocolError`、`ProtocolErrorCode` 与 error schema。完整 field、transition 与 error code 见 [ROOM_PROTOCOL.md](./ROOM_PROTOCOL.md)。

### 3.2 Room application API

`RoomService` 是当前 rooms.state 修改的 application boundary；caller 必须传入 `node:sqlite` 的 `DatabaseSync`。

| 分组 | Public methods | 责任 |
|---|---|---|
| Room/planning | `createRoom`、`transitionToArchitectureReview`、`transitionToWaitingForUserConfirmation`、`retryAfterFailure` | 创建 Room 与规划/失败恢复 transition |
| Task | `submitTask` | 校验并持久化 Implementation/Fix Task |
| Run | `startRun`、`resumeRun`、`completeRun`、`failRun` | 管理 Run lifecycle 与 terminal result |
| Question | `askQuestion`、`answerQuestion` | 管理 blocking decision flow |
| Review | `submitReview`、`acceptReview` | 提交 Review 与用户接受 |
| Read | `getRoom`、`getTask`、`getRun`、`getReview`、`getQuestion`、`listEvents` | 读取 domain entity 与 event cursor |

这些是 TypeScript application APIs，不是 HTTP/MCP endpoint；当前没有长期运行 process 暴露它们。

### 3.3 Git Observer API

| Export | 行为 |
|---|---|
| `establishCleanBaseline(targetPath)` | 验证 non-bare Git worktree、解析完整 `HEAD`、要求 staged/unstaged/untracked 全空 |
| `collectCompletionEvidence(targetPath)` | 在 dirty worktree 中收集三类 root-relative path evidence |
| `GitCommandError` | 保留 command、args、cwd、exit code 与 stderr；process failure 不降级为空 evidence |

Git Observer 只执行 `rev-parse`、`diff` 与 `ls-files`；不会 stage、commit、checkout、reset、clean、merge、rebase 或 push。

### 3.4 Runner API

`src/runner/` 已在 `main` 交付 central Runner orchestration：

| Export | 行为 |
|---|---|
| `runClaude(input)` | 单一 central operation：读取 persisted `confirmed_by_user=true` TaskContract、clean baseline gate、start/resume claim、启动 Claude process、消费 stream、追加 progress Event、写入 artifact、收集 completion Git evidence，并以 `RunTerminalEvidence` 原子 settle 为 `completeRun`（`REVIEW_REQUIRED`）或 `failRun`（`RUN_FAILED`） |
| `RunTerminalEvidence`（`room-service.ts`） | `claude_session_id`、`process_exit_code`、`git_evidence`、`artifact_refs`；terminal transition 同一 transaction 持久化 |
| failure mapping | `claude_start_failed` > `claude_exit_failed` > `room_mcp_unavailable` > `coding_result_invalid` > `git_evidence_failed` > `artifact_write_failed`；单一 terminal settlement |

artifact 写入 `.agent-room/artifacts/<run-id>/stdout.jsonl` 与 `stderr.log`，`artifact_refs` 使用 repository-root-relative path。Runner本身没有 package script或 launcher command；真实 Claude smoke需经用户明确授权，coding只使用 fake-process fixture。

Current `runClaude(input)` 的 explicit resume seam 仍由 caller提供 `mode`、`resumeSessionId` 与 `expectedBaselineHead`，并对 start/resume统一执行 clean-worktree gate。它已验证底层 process/stream/terminal能力，但尚未形成 Question/Fix product continuation；该缺口已有 Increment 5 Accepted design，Candidate implementation尚未开始。

## 4. Current MCP 外部接口

[ROOM_PROTOCOL.md 第 11 节](./ROOM_PROTOCOL.md#11-mcp-tools-接口) 定义且当前已实现以下 MCP tools：

- `room_get_state`
- `room_submit_task`
- `room_submit_review`
- `room_answer_question`
- `room_accept_review`
- `room_ask_question`

Runner process contract 与 terminal Run mapping 已由 Increment 3 实现；Room MCP transport、tool handlers、shared state snapshot、Status CLI 与 runtime entry 已由 Increment 4 实现并由 commit `44fd34959834b28c8909b589a203e4c48eadc5b0` 进入版本化 `main`。Fix Task 1–3 已完成，Review `review-increment-004-codex-004` 为 `approved`，用户已接受；bootstrap `claude -p` Task transport 已 `Superseded`。

### 4.1 Increment 4 Current 运维接口

Runtime 固定监听 `127.0.0.1`，显式接收 `--db <path> --project <path> --port <1..65535>`，并暴露 `/mcp/codex` 与 `/mcp/claude`；read-only Status CLI 显式接收 `--db <path> --room-id <id>`，且 missing database path 失败而不创建空 database。package script 为 `room:serve` 与 `room:status`（`src/mcp/serve.ts`、`src/cli/status.ts`）。

启动命令：

```text
npm run room:serve -- --db <path> --project <path> --port <1..65535>
```

成功信号为 stdout 输出 `Room MCP listening on http://127.0.0.1:<port>`；startup 参数、project、database 或 bind 失败时 stderr 输出原因并 non-zero exit。停止当前前台 service 使用终端中断；重启时用相同显式参数重新执行命令，没有 background daemon manager。

状态查询命令：

```text
npm run room:status -- --db <path> --room-id <id>
```

成功时 stdout 输出 deterministic pretty JSON 且 exit 0；invalid args、missing Room 或无法读取 database 时 stderr 输出原因并 non-zero exit。raw MCP response 为 `application/json`；`room:status` 只读且既存空 database 不创建 schema，`room:serve` 在 open database 前拒绝 invalid project。

### 4.2 Increment 5 Accepted design / Candidate implementation（不可用）

[Increment 5 Accepted Contract](./INCREMENT_5_TASK_CONTRACT.md) 已获用户确认，规划以下 TypeScript application behavior：

- Runner在 durable Question使 Room进入 `NEEDS_DECISION` 后，对同一 Run持久化 pause evidence并追加 `run_paused` Event；answer在 pause完成前拒绝。
- contract内 Decision与 Review-confirmed Fix从 SQLite lineage推导 exact session/baseline，保留既有 dirty worktree并验证 `HEAD` 未偏离。
- continuation继续使用 current `runClaude` process/stream/artifact/Git pipeline，不增加 MCP tool、package script、Runner CLI、daemon或 scheduler。

当前 repository没有 Room runtime database，也没有 Room initialization或 Runner launcher command。用户选择本 Increment暂时自行人工派发完整 Accepted Contract；Codex只提供指令，不运行 Claude。该一次性开发 execution bridge不属于 Current product interface；Accepted documentation baseline已建立，实际派发前只需重新确认 live `main` HEAD与 clean worktree。

## 5. 人工操作命令

### 5.1 环境前置

- Node.js：`>=24.15.0 <25`
- npm：项目声明 `npm@11.12.1`
- Git CLI：必须可从本机 PATH 调用

### 5.2 安装与验证

```powershell
npm ci
npm run typecheck
npm test
```

| 操作 | 当前命令 | 状态 |
|---|---|---|
| 安装 lockfile dependency | `npm ci` | Available |
| TypeScript 验证 | `npm run typecheck` | Available |
| 完整 regression | `npm test` | Available |
| 启动 Room service | `npm run room:serve -- --db <path> --project <path> --port <1..65535>` | Available |
| 停止/重启 Room service | 前台终端中断；使用相同显式参数重新启动 | Available（manual） |
| 查询 runtime status/health | 无 | Unavailable |
| 查询 Room state snapshot | `npm run room:status -- --db <path> --room-id <id>` | Available |
| 调用 MCP | service 启动后使用 `/mcp/codex` 或 `/mcp/claude` | Available |

## 6. 状态、存储与制品

| 事实 | Owner | 当前路径/状态 |
|---|---|---|
| source、staged/unstaged/untracked | Git worktree | 实时 `git status`/Diff；不保存平行 patch authority |
| Room entity/state | SQLite | Schema 已实现；由 caller 提供 `DatabaseSync`，尚无固定 production database path |
| process/session lifecycle | Claude Runner / Run record | central Runner 已实现；没有 background scheduler 或 service lifecycle command |
| bootstrap stdout/status | Local artifact | `.agent-room/artifacts/<task-or-run>/`，Git ignored |
| 人工 Diff | VS Code | 直接打开目标 Git worktree |

`.agent-room/artifacts/` 是证据制品而非 Room durable state。失败后优先保留，不要用其内容替代实时 Git 或 SQLite authority。

## 7. 故障检查与恢复边界

1. 先用 `git status --short --branch` 确认实际 branch、staged、unstaged 与 untracked scope。
2. 运行 `npm run typecheck` 和聚焦/完整测试，区分类型偏移与行为回归。
3. Git Observer 抛出 `ProtocolError` 时按 `git_repository_missing`、`git_head_missing`、`worktree_not_clean` 处理；`GitCommandError` 表示观察 command 本身失败，不能解释为 clean/empty。
4. 历史 bootstrap artifact 继续保留在 `.agent-room/artifacts/`；bootstrap transport 已 `Superseded`，不得为后续 Task 再启动。
5. 当前没有 service restart、database backup/restore、health probe 或 Runner retry CLI；需要这些能力时必须先完成对应 Increment 和 Review。

所有 protocol error code 见 [ROOM_PROTOCOL.md 第 14 节](./ROOM_PROTOCOL.md#14-错误码)。

## 8. Increment 3 Integration 状态

Increment 3 Runner TypeScript API 与 Increment 4 Room MCP、Status CLI、runtime service entry 均已进入版本化 `main` baseline。Room service 仍是 operator 显式启动的前台 local process，不包含 background scheduler、daemon manager 或自动 Runner wakeup。

## 9. Review 后维护记录

| Review ID | Decision / acceptance | 运维影响 | 处理 |
|---|---|---|---|
| `review-increment-003-scope-scaffold-codex-001` | `changes_requested` | 仅 Scope regression 错误接受 allowed-name directory；无 runtime interface 或 architecture 变化 | 保持 current operational view；finding 交由 Fix Task |
| `review-increment-003-scope-scaffold-codex-002` | `approved` / 用户已接受 | Scope regression 正确冻结两个 leaf filename；仍未实现 Runner/MCP/CLI | Scaffold 已集成到 `main`；Fix Contract 已归位到项目文档中心 |
| `review-increment-003a-codex-001` | `changes_requested` / solution 已确认 | stdin prompt delivery failure 被降级为普通 close outcome；candidate 尚不可用 | Fix 已完成；见 Review 2 |
| `review-increment-003b-codex-001` | `changes_requested` / solution 已确认 | required Room tool authority 可被 caller string 替代；candidate 尚不可用 | Fix 已完成；见 Review 2 |
| `review-increment-003a-codex-002` | `approved` / 用户已接受 | typed stdin failure 与 single-settlement regression 已闭环；leaf commit `86c77a7c68b953343d67da3857859b0dd6d6c09c`，尚未集成 | 保持 `main` current operational view；等待独立 Integration Task |
| `review-increment-003b-codex-002` | `approved` / 用户已接受 | frozen required Room tool authority 与 direct regression 已闭环；leaf commit `1062a7500f8bb3e22c7c3818ddcac2e9eb625efa`，尚未集成 | 保持 `main` current operational view；等待独立 Integration Task |
| `review-increment-003-integration-codex-001` | `changes_requested` / finding 与 solution 已确认 | stale Task 可进入 Coding、required-tool failure 丢失 session、central failure evidence 不完整、协议/架构 startup-init 语义冲突 | Fix Coding 已完成并验证；保持 Runner candidate，等待二次 Review 与用户接受 |
| `review-increment-003-integration-codex-002` | `approved` / 用户已接受 | 四项 finding 均闭环；无新增 runtime command，Runner 为 TypeScript API | commit `e8f0da6db9f3f4ff426355fa1a84d19bae4db9f2` 已 fast-forward 集成到 `main` |
| `review-increment-004-codex-001` | `changes_requested` / finding 与 solution 已确认 | MCP response/resource lifecycle、Status CLI read-only、runtime startup gate 与 public-path regression 不符合 Contract；`typecheck` 失败 | [Fix Task 1](./INCREMENT_4_FIX_TASK_1.md) 已 Accepted 且 Fix Coding 已完成并验证；MCP/CLI/runtime 仍 unavailable，等待再次 Review 与用户接受 |
| `review-increment-004-codex-002` | `changes_requested` / finding 与 solution 已确认 | JSON response、Status read-only、startup gate 与 typecheck 已闭环；cleanup abort/internal-failure 及 durable Event/cursor/idempotency public-path evidence 不完整 | [Fix Task 2](./INCREMENT_4_FIX_TASK_2.md) 已 Accepted；保持 MCP/CLI/runtime unavailable，等待用户人工派发 |
| `review-increment-004-codex-003` | `changes_requested` / finding 与 solution 已确认 | actual cleanup 与多数 durable rollback/retry/conflict evidence 已闭环；`room_submit_review` stale succeeded Run / wrong-current MCP direct regression 缺失 | [Fix Task 3](./INCREMENT_4_FIX_TASK_3.md) 已 Accepted；保持 MCP/CLI/runtime unavailable，等待用户人工派发 |
| `review-increment-004-codex-004` | `approved` / 用户已接受并授权提交 | stale succeeded Run / wrong-current MCP direct regression 已闭环；无 architecture/protocol version change | bootstrap 已 `Superseded`；Increment 4 进入版本化 `main` baseline |

后续每次 Review 调用 `backend-doc-authoring` skill，并按 [Codex 项目文档编写与维护指南](./agent-guides/CODEX_DOCUMENTATION_AUTHORING.md) 审计；存在运维影响时更新本节，无影响时在 Review Verification Summary 报告 `documentation: no_change`。
