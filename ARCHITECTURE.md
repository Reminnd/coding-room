# Agent Room 架构

> 状态：Current  
> 批准日期：2026-08-23  
> 范围：本地单用户 MVP

## 1. 系统上下文

Agent Room 协调用户、Codex App、Claude Code CLI、Git 与 VS Code 之间的串行协作工作流。

```text
用户 ↔ Codex App
        │
        │ 显式调用 Room MCP
        ▼
┌──────────────────────────────┐
│ Local Agent Room Service     │
│                              │
│ State Machine                │
│ SQLite Repository            │
│ Task / Review / Question     │
│ Claude Runner                │
│ Git Observer                 │
│ MCP Interface                │
│ Status CLI                   │
└──────────────┬───────────────┘
               │ 每个 Run 启动一次
               ▼
       Claude Code CLI
               │
               ▼
       Shared Git Worktree
               │
               ▼
        VS Code Git Diff
```

Codex App 保持为用户讨论、方案规划和 Review 界面。VS Code 保持为代码和 Diff 界面。Agent Room 不引入新的通用聊天室 UI 或编辑器。

## 2. 架构原则

1. 每类核心状态只有一个所有者。
2. 状态转换是行为约束，不是显示标签。
3. Runner 观察到的事实优先于模型自述。
4. 首版保持本地、串行且可直接检查。
5. MCP 只暴露协调能力。
6. Task Contract 是已批准设计与 Coding 实现之间的边界。
7. Review finding 在用户确认前不得转化为 Fix Task。

## 3. 模块边界

### 3.1 Room Service

负责进程启动、模块组装和本地生命周期。它在 loopback 上暴露 Room MCP endpoint，并协调 Runner 事件与持久化状态。

它不拥有源代码内容，也不编辑目标项目。

### 3.2 State Machine

每次 Room 状态转换都必须校验：

- 当前状态；
- 请求 actor；
- 引用的 Task、Review、Question 或 Run；
- 必需的用户确认门禁；
- 当前 active Run。

只有该模块可以修改 `rooms.state`。

### 3.3 SQLite Repository

持久化 Room、Task Contract、Run、Review、Question 和 Event。SQLite 是协作状态的权威存储。

Repository layer 负责 entity 创建和状态转换的 atomic transaction，不把记录镜像为 JSON 文件。

### 3.4 Claude Runner

负责 Claude CLI process 与 session 生命周期：

- 每个 Run 创建一个 process；
- 从已批准 Task Contract 构造 prompt；
- 传入 Room MCP 配置；
- 读取 structured CLI event；
- 记录 session ID 和 final result；
- 处理退出、中断和无效输出；
- 请求 Git Observer 获取实际完成证据；
- 请求对应的 Room 状态转换。

Runner 不决定需求、架构或 Review finding。

### 3.5 Git Observer

使用 Git CLI 进行只读仓库检查：

- 确认目标是 Git repository；
- 在新 Implementation Task 前强制 clean worktree；
- 记录 `baseline_head`；
- 收集 staged、unstaged 和 untracked 状态；
- 为 Codex Review 生成 metadata。

它不执行 commit、stage、reset、checkout、clean 或 restore。

### 3.6 MCP Interface

把已认证的本地 tool call 映射为 application command。它校验 tool input 和 actor 权限，然后委托 State Machine 与 repository。

它不暴露通用 `read_file`、`write_file`、`apply_patch`、`bash`、`git_diff` 或 `git_commit` tool。

### 3.7 Status CLI

提供 operator 可读的状态：

- active Room 和 state；
- 当前 Task 与 Run；
- 等待中的 actor；
- 待处理 Question；
- 最近 Run outcome；
- changed-file summary 信息。

CLI 读取 Room 状态。除非后续已批准需求明确增加，否则它不创建第二条状态转换路径。

## 4. 依赖方向

```text
MCP Interface ─┐
Status CLI ────┼──> Application Commands ──> State Machine
Runner ────────┘             │                    │
                             ├──> SQLite Repository
                             └──> Git Observer

Claude Runner ──> Claude Code CLI
Git Observer ───> Git CLI
```

Infrastructure module 不得调用 MCP handler 或 CLI presentation code。State Machine 不启动 process，也不执行 Git。

## 5. 状态所有权

| 关注点 | 所有者 | 持久化位置 |
|---|---|---|
| Room 协作状态 | State Machine | SQLite |
| Task、Review、Question、Run | SQLite Repository | SQLite |
| 代码与 Diff | Git | 目标 worktree |
| Claude runtime process | Claude Runner | process memory 与 Run record |
| Claude conversation history | Claude Code | Claude session storage；Room 只保存 session ID |
| 用户与 Codex 的讨论 | Codex App | Codex task history |
| 人工 Diff 检查 | VS Code | 无 |
| 大体积 Runner log | Artifact store | `.agent-room/artifacts/` |

## 6. 核心数据流

### 6.1 新 Implementation Task

1. 用户与 Codex 在 Codex App 中讨论需求和架构。
2. Codex 形成 Architecture Review 或计划，并等待用户明确确认。
3. Codex 使用已批准 Task Contract 调用 `room_submit_task`。
4. Room 校验合法状态、Git repository 和 clean-worktree 前置条件。
5. Room 保存 Task、`baseline_head` 和 `PLAN_READY`。
6. Runner claim 该 Task，创建新的 Claude session，并把 Room 转为 `CODING`。
7. Claude Code 编辑共享 worktree、运行规定检查并返回 Coding Result。
8. Runner 校验 process completion 和 result shape，再收集实际 Git 状态。
9. 成功时 Room 进入 `REVIEW_REQUIRED`；否则进入 `RUN_FAILED` 或 `NEEDS_DECISION`。

### 6.2 Review

1. 用户显式要求 Codex 检查 Room，或 Codex 在 turn 中调用 `room_get_state`。
2. Codex 读取实际 repository 和完整 task-owned Diff。
3. Codex 提交 structured Review。
4. Room 进入 `REVIEW_DISCUSSION`。
5. 用户与 Codex 在 Codex App 中讨论 finding 和解决方案。
6. 用户接受实现，或确认 Fix Plan。

### 6.3 Fix

1. Codex 调用 `room_submit_task`，其中 `type=fix`，并包含 Review ID、已确认 finding 和解决方案。
2. Room 校验 `review_fixes_only` scope 并进入 `FIX_PLAN_READY`。
3. Runner 启动新的 CLI process，并恢复该 Task lineage 的 Claude session。
4. 整个 Implementation cycle 继续使用同一个 baseline。
5. 完成后重新进入 `REVIEW_REQUIRED`。

### 6.4 Question

1. Claude 需要决策时调用 `room_ask_question`。
2. Room 持久化 Question 并进入 `NEEDS_DECISION`。
3. Runner 结束当前 Run，但不把它标记为 completed。
4. Codex 读取 Question 并与用户讨论。
5. 如果答案仍在已批准 contract 内，Codex 调用 `room_answer_question`，Runner 恢复 session。
6. 如果答案改变 scope 或 architecture，Codex 生成修订方案并重新进入用户确认门禁。

## 7. Claude Process 与 Session 模型

- Process lifetime：每个 Run 一个 Claude CLI process。
- Session lifetime：一个 Implementation Task lineage。
- Fix Task 恢复该 lineage 的 session。
- 新的无关 Implementation Task 创建新 session。
- 每个 Run 都接收完整关键 Task 要求；session history 是辅助上下文，不是权威来源。
- Room 保存 session ID，但不解析 Claude 的私有 transcript file。

初始 CLI 集成使用非交互 `claude -p` structured output。Runner 增量实施时，必须根据本机已安装 Claude Code version 验证准确 flags 与 permission rule。

## 8. MCP Transport 设计

MVP Room Service 在 loopback address 上暴露 Streamable HTTP。Codex App 与 Claude Code 连接同一个长期运行的 Room instance。

理由：

- 两个 consumer 观察同一个 process 和同一份 SQLite 状态；
- Runner 可以独立于某个 MCP client process 持续运行；
- 不需要 STDIO proxy 或重复的 in-memory server。

Endpoint 只允许本地访问。Remote access、OAuth 和 multi-user authorization 不在 MVP 范围内。

## 9. 持久化

概念性 SQLite entity：

- `rooms`
- `tasks`
- `runs`
- `reviews`
- `questions`
- `events`

大体积 stdout/stderr log 可以保存在：

```text
.agent-room/
  artifacts/
    <run-id>/
```

Database 只保存 artifact reference。Git Diff 保持为实时 Git 状态，不复制为权威 patch artifact。

## 10. 失败边界

| 失败 | 必须执行的行为 |
|---|---|
| 目标不是 Git repository | 以 `git_repository_missing` 拒绝 Implementation Task |
| 初始 worktree 非 clean | 以 `worktree_not_clean` 拒绝新 Implementation Task |
| Claude CLI 无法启动 | 记录 failed Run；进入 `RUN_FAILED` |
| Room MCP 未在 Claude 中加载 | 不开始 Coding；记录 Runner failure |
| Claude 请求决策 | 保存 Question；进入 `NEEDS_DECISION` |
| Claude 非零退出 | 保留 worktree 与 log；进入 `RUN_FAILED` |
| final result 缺失或无效 | 保留证据；进入 `RUN_FAILED` |
| 用户回答改变 scope | 返回规划和确认；不恢复旧 contract |
| Review 要求修改 | 进入 `REVIEW_DISCUSSION`；不得自动派发 |

## 11. 初始源码布局

```text
src/
  protocol/
  room/
  runner/
  git/
  mcp/
  cli/
tests/
runtime/
  .gitkeep
```

首版只有一个 package。只有已批准需求证明存在真实 packaging boundary 时，才能拆分 apps/packages。

## 12. 接口索引

权威 tool contract、entity field、state transition 和 result schema 定义在 [docs/ROOM_PROTOCOL.md](./docs/ROOM_PROTOCOL.md)。

## 13. 延后能力

- 自动唤醒 Codex Desktop 或向当前 task 注入消息；
- Claude Channels；
- 基于 Codex App Server 的 custom client；
- VS Code Extension；
- 多个并行 Claude worker；
- Room 管理多个 worktree；
- remote Room access；
- 第三方 Agent adapter。

每项延后能力都需要新的用户确认计划；如果改变长期边界，还需要新的 ADR。
