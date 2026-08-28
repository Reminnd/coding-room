# ADR-0003：Participant / Role 解耦与 v0.3 分阶段演进

| 属性 | 内容 |
|---|---|
| 状态 | Accepted |
| 日期 | 2026-08-29 |
| Owner | Codex |
| 决策范围 | Actor identity、role authority、protocol version、Room migration 与后续 multi-Run/DAG/UI provider 演进 |
| 关联计划 | [Agent Room v0.3 路线图](../AGENT_ROOM_V03_ROADMAP.md) |

## 1. 背景

Current v0.2 将 `codex`、`claude`、`runner` 固化为 `Actor`，MCP route 固化为 `/mcp/codex` 与 `/mcp/claude`，Run 固化 `claude_session_id`，并按单 Room 单 Run、无专用 UI 设计。用户现要求可替换 Participant、角色分配、多 Run、DAG、Planner/Reviewer Chat、VS Code Cockpit 与 GitHub projection。

该要求直接触发 [ADR-0001](./0001-local-room-and-state-ownership.md) 的并行 Run、Room worktree 与专用 UI 重新评估条件，也替换 [ADR-0002](./0002-agent-integration-lifecycle.md) 中固定 Codex/Claude 生命周期的长期方向。Git、SQLite、Runner 与人工讨论的权威边界仍应保留。

## 2. 决策

### 2.1 Identity 与 authority 分离

- `ParticipantProfile` 描述可参与 Room 的 human、agent 或 service identity；provider/model 细节只通过 `config_ref` 引用，不把 secret 写入 Room。
- `RoleAssignment` 把 `planner`、`worker`、`reviewer`、`executor`、`git_controller`、`orchestrator` 分配给 Participant。
- role 决定 command authority；participant 决定谁实际执行。Event 同时记录 `actor_role` 与 `participant_id`。
- Run、Review 等 lifecycle entity 在创建时复制其解析后的 Participant identity；后续 assignment 变化不改写历史。

### 2.2 Protocol v0.3 与数据切换

- v0.3 使用新 database identity 与显式 protocol metadata，不对 v0.2 SQLite 原地 migration/backfill。
- 现有 v0.2 database 保持原路径、内容与历史 actor 不变，并在 binding 切换后只读保留。
- v0.3 writable service遇到 v0.2 database必须在 schema write 前拒绝；不得通过兼容 parser 把旧 Event 改写成新 Event。
- 产品切换只在 Stage 1 Implementation Review 通过、用户接受且版本化集成后执行。

### 2.3 Route 与 session 泛化

- v0.3 MCP route 目标为 `/mcp/participants/{participant_id}`；route 只确认 participant identity，实际 tool authority仍由已持久化 assignment和tool对应role共同决定。
- v0.3 不把 `/mcp/codex`、`/mcp/claude` 作为长期 alias。Current v0.2 service可继续服务正在进行的 Stage 1 开发协调，切换完成后停止。
- `agent_session_ref` 替代 `claude_session_id`，其 adapter-specific value保持 opaque；只有对应 WorkerAdapter解释。

### 2.4 分阶段交付

- Stage 1只交付 protocol identity、assignment、generic actor/session、v0.3 persistence、route/binding和现有串行工作流等价回归。
- Stage 2才交付 Executor abstraction与same-Room multi-Run。
- Stage 3才交付 TaskGraphRevision、Scheduler、Git Controller与真实 Plan-scope assignment/Approval consumer。
- Stage 4–6分别交付 Chat、VS Code Cockpit与GitHub Provider；未完成阶段不得通过 Stage 1 type存在宣称能力已可用。

## 3. 开发协调决策

Stage 1 会修改当前 runtime 自身。若直接在当前绑定 worktree 修改 `room:run`、schema 与MCP route，首次 Run 可以由旧进程完成，但任何 Fix/Decision resume 会重新加载 candidate代码并无法安全驱动v0.2协调database。

因此dispatch保留当前Room和目标main worktree，但为Current v0.2 launcher创建固定planning baseline的detached worktree：

```text
detached v0.2 launcher worktree
        │  room:serve / room:run（只加载Current v0.2代码）
        ▼
current Room ── drives ──> target main worktree
                              └── candidate v0.3 code / tests / docs
```

launcher worktree创建、local runtime binding更新、文档提交与最终删除/清理分别需要用户独立授权。launcher worktree不承载Task修改、不需要branch或commit；该做法是开发执行隔离，不是Stage 3产品Git Controller。

## 4. 已确认的Stage 1边界

1. Stage 1暂不创建无consumer的`Plan`与`Approval` entity；Room/Task/Run/Review层assignment先落地，Plan-scope assignment和Approval在Stage 3随真实TaskGraph/Git action consumer交付。
2. v0.3 binding拟增加`protocol_version`、`control_participant_id`与`archived_database_path`；exact字段在Stage 1 Contract确认后冻结。
3. Stage 1只支持现有`codex_app`、`claude_code_cli`与`local_runner`adapter；其它provider profile可注册但未有已验收adapter时不得被解析为可执行assignment。

用户已于2026-08-29明确确认以上三项边界。Stage 1 Implementation仍是candidate；只有Review通过、用户接受并进入版本化`main`后，v0.3才能替代Current v0.2实现。

## 5. 备选方案

### 原地迁移 v0.2 SQLite

拒绝作为推荐方案。它必须改写历史Event actor与Run session字段，增加回滚和兼容矩阵；用户已要求v0.2只读归档与新v0.3 Room。

### 永久保留固定 route alias

拒绝。会形成第二套actor authority，并使“participant route是否真正生效”无法验收。

### Stage 1同时实现Executor、DAG与Cockpit

拒绝。它把protocol、process、Git write和UI故障域合并为单一不可独立Review的变更。

### 为未来Plan/Approval先建立空表和generic API

暂不采用。没有真实consumer时无法形成有意义的lifecycle、transaction与public-path验收。

## 6. 后果

- v0.3获得可替换身份和角色权威，同时保留SQLite、Git、Runner与人工讨论的单一权威边界。
- Stage 1是breaking cutover，需要独立worktree和双Room开发隔离。
- v0.2历史可检查但不再由v0.3 writable service推进。
- Stage 2–6必须复用Stage 1 frozen interface，不能重新引入provider-specific actor字段。

## 7. 重新评估条件

- 用户要求v0.2数据可继续推进而非只读查看；
- `Plan`或`Approval`在Stage 1出现真实public consumer；
- 现有adapter无法表达至少一个已批准Participant；
- dynamic participant route无法在当前MCP transport中稳定注册；
- 独立worktree/开发Room成本高于一次性兼容层且有直接证据。
