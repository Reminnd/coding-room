# Agent Room 项目文档中心

| 属性 | 内容 |
|---|---|
| 文档状态 | Current |
| Owner | Codex（项目文档编写者及维护者） |
| 主要读者 | 用户、Codex、Claude Code、人工 operator |
| 最后更新日期 | 2026-08-27 |
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
| [Increment 3A](./INCREMENT_3A_TASK_CONTRACT.md) | Accepted | Claude Process Transport leaf |
| [Increment 3B](./INCREMENT_3B_TASK_CONTRACT.md) | Accepted | Claude Stream Interpreter leaf |
| [Increment 3A Fix 1](./INCREMENT_3A_FIX_TASK_1.md) | Accepted | stdin prompt delivery failure propagation |
| [Increment 3B Fix 1](./INCREMENT_3B_FIX_TASK_1.md) | Accepted | frozen required Room tool authority |
| [Increment 3 Integration](./INCREMENT_3_INTEGRATION_TASK_CONTRACT.md) | Accepted | 组合 accepted leaf、Room/Git/artifact 与 terminal transition 的 central Runner |
| [Increment 3 Integration Fix 1](./INCREMENT_3_INTEGRATION_FIX_TASK_1.md) | Accepted | 修复 current Task guard、partial session evidence、central failure matrix 与 lifecycle 文档冲突 |
| [Increment 4](./INCREMENT_4_TASK_CONTRACT.md) | Accepted | actor-scoped Room MCP、共享状态 snapshot 与 read-only Status CLI |
| [Increment 4 Fix 1](./INCREMENT_4_FIX_TASK_1.md) | Accepted | 修复 JSON response/resource lifecycle、Status read-only、startup gate、typecheck 与 MCP public-path evidence |
| [Increment 4 Fix 2](./INCREMENT_4_FIX_TASK_2.md) | Accepted | 补齐 actual request cleanup 与 MCP durable-state/idempotency public-path direct evidence |
| [Increment 4 Fix 3](./INCREMENT_4_FIX_TASK_3.md) | Accepted | 补齐 stale succeeded Run / wrong-current submit-review MCP direct evidence |
| [Increment 5](./INCREMENT_5_TASK_CONTRACT.md) | Accepted | Question pause evidence、contract 内 Decision resume 与 Review-confirmed Fix resume |
| [Increment 5 Fix 1](./INCREMENT_5_FIX_TASK_1.md) | Accepted | 修复 Question 后 progress settlement、answer 后 finalization idempotency 与 baseline test fake-process isolation |
| [Increment 5 Fix 2](./INCREMENT_5_FIX_TASK_2.md) | Accepted | 补齐同一 stream progress 分界、完整 durable snapshot 与 baseline mismatch 零副作用 Oracle |
| [Increment 6](./INCREMENT_6_TASK_CONTRACT.md) | Accepted | planning/failure coordination tools、one-shot Runner CLI、RUN_FAILED retry 与真实边界 E2E |
| [Increment 6 Fix 1](./INCREMENT_6_FIX_TASK_1.md) | Accepted | 补齐retry source negative direct evidence并统一current-Task source语义 |
| [Increment 7](./INCREMENT_7_TASK_CONTRACT.md) | Accepted | shared Agent Room Plugin、project-local MCP/runtime binding 与跨项目并行隔离 |
| [Increment 7 Fix 1](./INCREMENT_7_FIX_TASK_1.md) | Accepted | 修复marketplace schema、Skill lifecycle/baseline与setup/packaging direct evidence |
| [Increment 7 Fix 2](./INCREMENT_7_FIX_TASK_2.md) | Accepted | 补齐Skill YAML front matter并修正NEEDS_DECISION Decision resume gate与direct Oracle |
| [Increment 7 Fix 3](./INCREMENT_7_FIX_TASK_3.md) | Accepted | 修正description YAML scalar合法性并补齐malformed colon-space negative Oracle |
| [Increment 8](./INCREMENT_8_TASK_CONTRACT.md) | Accepted | 单一Agent Room Skill自动建立project binding、启动service并在reload后创建/验证Room |
| [Increment 8 Fix 1](./INCREMENT_8_FIX_TASK_1.md) | Accepted | 修复dotted-key config conflict并闭合actual installed-plugin Skill consumer evidence门禁 |
| [Increment 8 Fix 2](./INCREMENT_8_FIX_TASK_2.md) | Accepted | 修复dotted-key classifier丢失TOML table context导致的unrelated config误判 |

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

## 4. 当前状态与未决行动

- 两个 leaf 的共同 `baseline_head` 已记录为 `97c47fed770fea675834538e2ca4550d37fdc548`，branch/worktree、首轮 Coding/Review、Fix 与 Review 2 均已完成。
- Increment 3A/3B 已接受并分别形成 leaf commit `86c77a7c68b953343d67da3857859b0dd6d6c09c` 与 `1062a7500f8bb3e22c7c3818ddcac2e9eb625efa`，随后通过 Integration commit 集成。
- Integration Coding 已在 `codex/inc3-integration`、baseline `63059189e97f7419238f5a3678513d4ca5e50f0d` 完成；Review `review-increment-003-integration-codex-001` 的四项 finding 与最小方案已获用户确认。
- [Increment 3 Integration Fix Task 1](./INCREMENT_3_INTEGRATION_FIX_TASK_1.md) 已完成 Coding；Codex Review 2 为 `approved`，用户已明确接受。Increment 3 commit `e8f0da6db9f3f4ff426355fa1a84d19bae4db9f2` 已 fast-forward 集成到 `main`，main integration 状态文档 successor commit 为 `2c2b880905eb7b39a0a84814dd7d5c3b0165a763`。
- Increment 4 Fix Task 3 已完成 Coding；Review `review-increment-004-codex-004` 无 finding，Decision 为 `approved`，MCP 27/27 与全量 186/186 通过。用户已明确接受，完整 implementation scope 已由 commit `44fd34959834b28c8909b589a203e4c48eadc5b0` 纳入版本化 `main` baseline；bootstrap Task transport 已 `Superseded`。
- [Increment 5 Accepted Contract](./INCREMENT_5_TASK_CONTRACT.md)、[Fix Task 1](./INCREMENT_5_FIX_TASK_1.md) 与 test-only [Fix Task 2](./INCREMENT_5_FIX_TASK_2.md) Coding 均已完成。Review `review-increment-005-codex-003` 无 finding，Decision 为 `approved`；用户已明确接受并另行授权提交完整 accepted scope。Decision/Fix continuation、测试、Fix Contract 与最终文档状态现已进入版本化 `main`，为 Current capability。
- [Increment 6 Accepted Contract](./INCREMENT_6_TASK_CONTRACT.md) 已从 clean exact `main` baseline `7ac639a30ab2a94170ef69498e065fb16e77f833` 重新执行；[Fix Task 1](./INCREMENT_6_FIX_TASK_1.md)已补齐三类current-task retry source direct negative evidence，production source未改动。
- Review `review-increment-006-codex-003`无finding、Decision为`approved`；Codex独立验证`npm run typecheck`与focused 95/95通过，Claude Coding Result报告全量242/242通过。用户已明确接受并另行授权提交完整accepted scope；planning coordination tools、one-shot Runner CLI与failure retry现已进入版本化`main`，为Current capability。Fix经验回收已完成；push、runtime初始化、真实Claude smoke、branch/worktree、stash删除与其它清理仍为独立门禁。
- Increment 7严格重执行已从clean exact baseline `b9ebeffdcc8dd9c34718111b50fa3605a21ad17e`完成，Review 1三项finding已闭合；Review 2四项finding已形成Accepted [Fix Task 1](./INCREMENT_7_FIX_TASK_1.md)，Fix Coding已完成。[Fix Task 2](./INCREMENT_7_FIX_TASK_2.md)已完成Coding；Review 4 `review-increment-007-codex-004`确认Decision resume gate闭合，但Skill `description`中的未引用colon-space使front matter无法由标准YAML parser加载，测试侧局部parser误报通过。用户已确认finding与最小方案，[Fix Task 3](./INCREMENT_7_FIX_TASK_3.md)已完成Coding；Review `review-increment-007-codex-005`独立验证无finding、Decision为`approved`，用户已明确接受，Increment 7已进入版本化 `main` commit `97005f54555f6485c79f15860a58fe79c3ed593d`，Plugin与多项目配置现为Current capability，manual Codex Desktop smoke保持pending。
- [Increment 8 Accepted Contract](./INCREMENT_8_TASK_CONTRACT.md)、[Fix Task 1](./INCREMENT_8_FIX_TASK_1.md)与[Fix Task 2](./INCREMENT_8_FIX_TASK_2.md)均已完成。Fix Review 3 `review-increment-008-codex-003`确认table-context finding已闭合、代码与direct regression无finding；focused setup 12/12、packaging 20/20、scope 1/1、typecheck及full test glob独立通过。用户授权后，candidate已从local marketplace安装，fresh-task direct/indirect/negative/boundary activation与bundled helper/reference resolution全部通过；Decision为`approved`，用户已于2026-08-28明确最终接受，Fix验收经验回收已完成。完整accepted scope已由commit `8428046dded5f7542690735b3df8a5c5490e8090`进入版本化`main`，automatic setup现为Current capability。
