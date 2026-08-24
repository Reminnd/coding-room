# Agent Room 运维手册

> 状态：Current
> 维护者：Codex（项目文档编写者及维护者）
> 最后维护日期：2026-08-24
> Last maintained review：`review-increment-003-scope-scaffold-codex-002`

本手册面向本机 operator，集中说明当前可用接口、组件结构、验证命令、状态与制品位置以及失败检查路径。协议字段和完整 transition 以 [ROOM_PROTOCOL.md](./ROOM_PROTOCOL.md) 为准，长期架构以 [ARCHITECTURE.md](./ARCHITECTURE.md) 为准；本手册不建立平行权威。

## 1. 当前运维基线

| 项目 | 当前事实 |
|---|---|
| main baseline | `1416de2429e2124192442e8b6e7db3645db805c6` |
| Accepted Scaffold commit | `eb3637b642aaa88e1faab51a570c6fea688c3cf9`，位于 `codex/increment-003-scope-scaffold` |
| Integration 状态 | Scaffold 已 Review、接受并提交，但尚未集成到 `main` |
| Runtime readiness | 仅 Protocol/Room domain 与只读 Git Observer 已实现 |
| Service readiness | Room server、Runner、MCP、Status CLI 均未实现，当前不可启动 |
| 可执行验证 | `npm run typecheck`、`npm test` |

不要执行或编写 `npm start`、Room daemon、MCP endpoint、Status CLI 或 production SQLite 路径；当前 repository 没有这些入口。

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
        └──> src/git/Git Observer ──> git-process ──> local Git CLI

planned, not implemented:
Runner · Room MCP · Status CLI · runtime service entry
```

| 路径 | 状态 | 运维责任 |
|---|---|---|
| `src/protocol/` | Implemented | runtime schema、entity type、error code |
| `src/room/` | Implemented | SQLite domain repository、state transition、application service |
| `src/git/` | Implemented | clean baseline 与 completion Git evidence；只读 Git command |
| `src/runner/` | Not implemented on `main` | Increment 3 后续能力 |
| `src/mcp/` | Not implemented | Increment 4 后续能力 |
| `src/cli/` | Not implemented | Increment 4 后续能力 |
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

## 4. Planned 外部接口

[ROOM_PROTOCOL.md 第 11 节](./ROOM_PROTOCOL.md#11-mcp-tools-接口) 设计了以下 MCP tools，但当前全部 unavailable：

- `room_get_state`
- `room_submit_task`
- `room_submit_review`
- `room_answer_question`
- `room_accept_review`
- `room_ask_question`

Runner process contract、MCP initialization、Claude session resume 与 terminal Run mapping 仍属于 Increment 3/4 后续实现。Draft Contract 或 bootstrap `claude -p` 不等于已部署 Room interface。

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
| 启动 Room service | 无 | Unavailable |
| 停止/重启 Room service | 无 | Unavailable |
| 查询 runtime status/health | 无 | Unavailable |
| 调用 MCP/CLI | 无 | Unavailable |

## 6. 状态、存储与制品

| 事实 | Owner | 当前路径/状态 |
|---|---|---|
| source、staged/unstaged/untracked | Git worktree | 实时 `git status`/Diff；不保存平行 patch authority |
| Room entity/state | SQLite | Schema 已实现；由 caller 提供 `DatabaseSync`，尚无固定 production database path |
| process/session lifecycle | Future Runner | 尚未实现 |
| bootstrap stdout/status | Local artifact | `.agent-room/artifacts/<task-or-run>/`，Git ignored |
| 人工 Diff | VS Code | 直接打开目标 Git worktree |

`.agent-room/artifacts/` 是证据制品而非 Room durable state。失败后优先保留，不要用其内容替代实时 Git 或 SQLite authority。

## 7. 故障检查与恢复边界

1. 先用 `git status --short --branch` 确认实际 branch、staged、unstaged 与 untracked scope。
2. 运行 `npm run typecheck` 和聚焦/完整测试，区分类型偏移与行为回归。
3. Git Observer 抛出 `ProtocolError` 时按 `git_repository_missing`、`git_head_missing`、`worktree_not_clean` 处理；`GitCommandError` 表示观察 command 本身失败，不能解释为 clean/empty。
4. Claude bootstrap 失败时保留 `.agent-room/artifacts/` 与目标 worktree，不执行自动 reset/clean。
5. 当前没有 service restart、database backup/restore、health probe 或 Runner retry CLI；需要这些能力时必须先完成对应 Increment 和 Review。

所有 protocol error code 见 [ROOM_PROTOCOL.md 第 14 节](./ROOM_PROTOCOL.md#14-错误码)。

## 8. Pending Review Impact

当前无尚未接受的 runtime/interface/architecture candidate。Scaffold commit 尚待集成到 `main`，因此两个 leaf module 仍不得把它当作 main baseline。

## 9. Review 后维护记录

| Review ID | Decision / acceptance | 运维影响 | 处理 |
|---|---|---|---|
| `review-increment-003-scope-scaffold-codex-001` | `changes_requested` | 仅 Scope regression 错误接受 allowed-name directory；无 runtime interface 或 architecture 变化 | 保持 current operational view；finding 交由 Fix Task |
| `review-increment-003-scope-scaffold-codex-002` | `approved` / 用户已接受 | Scope regression 正确冻结两个 leaf filename；仍未实现 Runner/MCP/CLI | 建立本手册；记录 accepted branch commit 与 main integration pending |

后续每次 Review 调用 `backend-doc-authoring` skill，并按 [Codex 项目文档编写与维护指南](./agent-guides/CODEX_DOCUMENTATION_AUTHORING.md) 审计；存在运维影响时更新本节，无影响时在 Review Verification Summary 报告 `documentation: no_change`。
