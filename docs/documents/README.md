# Agent Room 项目文档中心

| 属性 | 内容 |
|---|---|
| 文档状态 | Current |
| Owner | Codex（项目文档编写者及维护者） |
| 主要读者 | 用户、Codex、Claude Code、人工 operator |
| 最后更新日期 | 2026-08-24 |
| 生效范围 | 本仓库项目文档集 |
| 编写规范 | [`backend-doc-authoring` 强制维护指南](./agent-guides/CODEX_DOCUMENTATION_AUTHORING.md) |

## 1. 结论与查看入口

本目录是所有人类可查看项目文档的唯一集合。按以下顺序可以快速建立完整上下文：

1. [项目共享规则](../../PROJECT_RULES.md)
2. [系统架构](./ARCHITECTURE.md)
3. [Room 协议](./ROOM_PROTOCOL.md)
4. [MVP 计划](./MVP_PLAN.md)
5. [开发状态](./DEVELOPMENT_LOG.md)
6. [运维手册](./OPERATIONS.md)

根目录仅保留 `AGENTS.md`、`CLAUDE.md`、`PROJECT_RULES.md` 三个 agent/tooling 控制入口；它们不是第二套文档目录。

## 2. 文档目录、目的与依赖

### 2.1 核心权威文档

| 文档 | 状态 | Owner | 用途 | 主要依赖 |
|---|---|---|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Current | Codex | 系统边界、组件、dependency direction、数据流和失败边界 | Project Rules、ADR |
| [ROOM_PROTOCOL.md](./ROOM_PROTOCOL.md) | Current | Codex | entity、state、transition、MCP、Runner 与 error contract | Architecture、ADR |
| [MVP_PLAN.md](./MVP_PLAN.md) | Current | Codex | Increment 顺序、范围、验收与非目标 | Architecture、Protocol |
| [DEVELOPMENT_LOG.md](./DEVELOPMENT_LOG.md) | Current | Codex/Claude candidate | 当前阶段、已完成事实、验证与下一步 | Git、Review、Task Contract |
| [OPERATIONS.md](./OPERATIONS.md) | Current | Codex | 人工接口、结构、命令、状态/制品与故障处置 | Accepted Git、Architecture、Protocol |

### 2.2 Architecture Decision Records

| 文档 | 状态 | 决策范围 |
|---|---|---|
| [ADR-0001](./ADR/0001-local-room-and-state-ownership.md) | Accepted | 本地 Room、SQLite/Git/VS Code 状态所有权 |
| [ADR-0002](./ADR/0002-agent-integration-lifecycle.md) | Accepted | Codex pull、Runner process 与 Claude session lifecycle |

### 2.3 Increment 与 Fix Contracts

| 文档 | 状态 | 目的 |
|---|---|---|
| [Increment 1 Task](./INCREMENT_1_TASK_CONTRACT.md) | Accepted | Protocol 与 State Core |
| [Increment 1 Fix 1](./INCREMENT_1_FIX_TASK_1.md) | Accepted | stale entity 与 protocol validation guards |
| [Increment 1 Fix 2](./INCREMENT_1_FIX_TASK_2.md) | Accepted | current Run guard 与 `resumeRun` coverage |
| [Increment 1 Fix 3](./INCREMENT_1_FIX_TASK_3.md) | Accepted | Review idempotency order |
| [Increment 2 Task](./INCREMENT_2_TASK_CONTRACT.md) | Accepted | Git preconditions 与 evidence |
| [Increment 2 Fix 1](./INCREMENT_2_FIX_TASK_1.md) | Accepted | Git failure semantics |
| [Increment 3 Parallel Pilot](./INCREMENT_3_PARALLEL_PILOT_PLAN.md) | Current | 两个 leaf module 与串行 integration 计划 |
| [Increment 3 Scope Scaffold](./INCREMENT_3_SCOPE_SCAFFOLD_TASK_CONTRACT.md) | Accepted | 共享 Scope regression 前置任务 |
| [Increment 3 Scope Scaffold Fix 1](./INCREMENT_3_SCOPE_SCAFFOLD_FIX_TASK_1.md) | Accepted | 拒绝 allowed-name directory 的 Scope regression 修复 |
| [Increment 3A](./INCREMENT_3A_TASK_CONTRACT.md) | Draft | Claude Process Transport leaf |
| [Increment 3B](./INCREMENT_3B_TASK_CONTRACT.md) | Draft | Claude Stream Interpreter leaf |

### 2.4 Agent 执行指南

| 文档 | Reader | Trigger |
|---|---|---|
| [指南索引](./agent-guides/README.md) | Codex / Claude Code | 角色入口路由 |
| [Codex 文档编写与维护](./agent-guides/CODEX_DOCUMENTATION_AUTHORING.md) | Codex | 任意项目文档工作、每次 Review 后 |
| [Codex Review 与规划](./agent-guides/CODEX_REVIEW_AND_PLANNING.md) | Codex | 需求、架构、Task、Review、Fix、经验回收 |
| [Claude Coding 与 Fix](./agent-guides/CLAUDE_CODING_AND_FIX.md) | Claude Code | 任意 Implementation/Fix Task |
| [Git 与并行工作流](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md) | Codex / Claude Code | Git、branch/worktree、并行、integration |

## 3. 权威与维护规则

- 一项事实只保留一个详细权威位置；其它文档通过链接引用。
- Codex 编写或维护任何项目文档 MUST 调用 `backend-doc-authoring` skill。
- 每次 Review 后 MUST 审计并维护受影响文档；未接受 candidate 不得写成 Current。
- 新文档 MUST 放入本目录、登记在本索引和 `PROJECT_RULES.md` Documentation Map，并通过相对链接与 merge marker 检查。
- Deprecated 文档必须明确替代文档和停止生效日期，不得与 Current/Accepted 文档并列为有效。

## 4. 当前未决行动

- 评审并确认 Increment 3A/3B 的最终 Task Contract；确认前继续保持 Draft。
- 用户确认后记录当前 `main` HEAD 为共同 `baseline_head`，再分别获取 branch/worktree 创建与并行派发权限。
