# Agent Room 项目共享规范

> 状态：Current  
> 生效日期：2026-08-23  
> 当前阶段：ACCEPTED / Increment 5 已进入版本化 `main` / 等待后续规划

本文件是 Codex 与 Claude Code 共同遵循的项目规范入口。Codex 的专属职责见 [AGENTS.md](./AGENTS.md)，Claude Code 的专属职责见 [CLAUDE.md](./CLAUDE.md)。项目目标、架构、协议、计划和当前事实以本文件及 Documentation Map 中标记为 `Current` 或 `Accepted` 的文档为准。

## 1. 项目目标

构建一个本地、单机、自用的 Agent Room，使以下工作流可持久化、可恢复、可审查：

```text
用户与 Codex 讨论方案
→ 用户确认
→ Codex 提交结构化 Task Contract
→ Claude Code CLI 修改共享 Git worktree 并验证
→ Codex 审查实际 Diff
→ 用户与 Codex 讨论 Review 和解决方案
→ Codex 提交 Fix Task
→ Claude Code CLI 修复
→ 循环直至用户接受
```

项目不以“两个 Agent 自由聊天”为目标。Room 的核心职责是保存协作状态、执行门禁以及明确下一位 actor，而不是复制 Codex、Claude Code、Git 或 VS Code 已有能力。

## 2. 范围

### 2.1 MVP 范围

- 一个本地 Room 对应一个项目工作目录。
- Codex App 通过 Room MCP 显式读取状态、提交 Task、Review、答案和接受决定。
- Claude Runner 以非交互方式启动 Claude Code CLI。
- Claude Cong de 在用户当前 Git worktree 中读取、编辑、测试和生成 CodiResult。
- Git 是代码状态唯一权威来源；VS Code 负责人工 Diff 查看。
- SQLite 是协作实体与状态机唯一权威来源。
- 支持 Implementation → Review → Fix → Accepted 完整循环。
- 支持 Claude 提问、Run 失败和显式恢复。
- 提供最小本地 CLI，例如查看 Room 状态。

### 2.2 非目标

- 不开发独立 Web 前端、浏览器 IDE 或自建 Diff Viewer。
- 不开发 VS Code Extension；它属于 MVP 后的可选阶段。
- 不依赖自动唤醒或向用户当前打开的 Codex Desktop task 注入消息。
- 不引入 Redis、Kafka、PostgreSQL、Docker、微服务或向量数据库。
- 不支持多用户、远程部署、对抗性 operator 或并行修改同一 worktree。
- 不在 MCP 中重复实现通用文件读取、文件写入、Shell、Patch 或 Git Diff 工具。
- 不以未来接入任意 Agent 为由增加插件化 actor 框架。

## 3. 权威来源与指令优先级

发生冲突时按以下顺序处理：

1. 用户当前明确要求。
2. Codex 执行时的 [AGENTS.md](./AGENTS.md)，或 Claude Code 执行时的 [CLAUDE.md](./CLAUDE.md)。
3. 本文件中当前有效的共享规则。
4. Documentation Map 中标记为 `Accepted` 或 `Current` 的架构、协议、计划和 ADR。
5. 源代码、测试和实际 Git 状态提供的实现事实。
6. 其他说明、示例、Issue、聊天记录和第三方资料。

发现冲突时必须停止受影响工作并指出冲突，不得静默选择。普通 Markdown 链接只是导航；执行者必须实际读取 Documentation Map 指定的文档。

## 4. 角色与权限

### 4.1 用户

- 确认需求、架构、Task Contract、Review 解决方案和最终接受。
- 决定是否初始化 Git、提交、推送或执行其他有外部影响的操作。

### 4.2 Codex

- 负责需求分析、架构、规划、共享文档和 Review。
- 作为全项目文档编写者及维护者，调用 `backend-doc-authoring` skill 编写、补全、迁移、Review 并维护 `docs/documents/` 下所有项目文档。
- 只有在用户确认后才能提交 Implementation Task 或 Fix Task。
- 可以读取代码、Git 状态和 Diff，并运行与 Review 结论直接相关的只读检查或测试。
- 不编写业务代码、测试或实现配置，不代替 Claude Code 完成 Coding Task。
- Review 后必须先与用户讨论；用户确认解决方案后才能提交 Fix Task。

### 4.3 Claude Code

- 只执行已批准 Task Contract 或 Fix Task。
- 负责业务代码、测试、必要配置和实现相关候选文档。
- 不改变需求、架构、范围或验收标准。
- 不自行 commit、push、切换分支或改写历史。
- 需要产品、架构或范围决定时调用 `room_ask_question` 并停止受影响工作。

### 4.4 Room 与 Runner

- Room 持久化协作状态并验证状态转换。
- Runner 启动和终止 Claude CLI、读取输出、判断进程结果、采集实际 Git 状态并推进 Run 状态。
- 模型自述不能代替 Runner 的进程结果或实际 Git 证据。

## 5. 状态所有权

| 状态 | 唯一所有者 |
|---|---|
| 源代码、staged/unstaged/untracked 变更 | Git working tree |
| Task、Review、Question、Run、事件和 Room 状态 | SQLite |
| Claude process 与 session 生命周期 | Claude Runner |
| 用户与 Codex 的自由讨论 | Codex App |
| 人工代码与 Diff 查看 | VS Code |
| Runner 大体积 stdout/stderr 制品 | `.agent-room/artifacts/` |

禁止用 `current/*.json`、任务 JSON 镜像、Review JSON 镜像或 `diff.patch` 建立平行权威状态。

## 6. 当前有效架构

- 本地单进程 Room Service。
- TypeScript 与 Node.js。
- Room MCP 通过 loopback 上的 Streamable HTTP 暴露给 Codex App 和 Claude Code。
- SQLite 直接保存 Room 协作实体；除非后续证据证明必要，否则不引入 ORM。
- Runner 使用 Node.js process API 启动 Claude Code CLI。
- Git 集成直接调用 Git CLI；不引入 `simple-git`。
- Claude 每个 Run 使用独立 CLI process。
- 一个新的 Implementation Task 创建新的 Claude session；其 Fix Task 链复用该 session。
- Codex App 使用显式拉取模型；用户触发 Codex 检查 Room 更新。

详细结构见 [ARCHITECTURE.md](./docs/documents/ARCHITECTURE.md)，协议见 [ROOM_PROTOCOL.md](./docs/documents/ROOM_PROTOCOL.md)。长期决策见 [ADR/0001-local-room-and-state-ownership.md](./docs/documents/ADR/0001-local-room-and-state-ownership.md) 与 [ADR/0002-agent-integration-lifecycle.md](./docs/documents/ADR/0002-agent-integration-lifecycle.md)。

## 7. 工作流与门禁

当前有效主流程：

```text
DISCUSSION
→ ARCHITECTURE_REVIEW
→ WAITING_FOR_USER_CONFIRMATION
→ PLAN_READY
→ CODING
→ REVIEW_REQUIRED
→ REVIEW_DISCUSSION
→ FIX_PLAN_READY
→ CODING
→ REVIEW_REQUIRED
→ ACCEPTED
```

协议可以增加 `NEEDS_DECISION` 和 `RUN_FAILED` 等真实失败状态，但不得绕过用户确认：

- 没有用户确认，不得从方案进入 Coding。
- Review 完成后必须进入 REVIEW_DISCUSSION。
- 没有用户确认解决方案，不得提交 Fix Task。
- 没有用户接受，不得进入 ACCEPTED。

具体合法转换、actor 和失败语义见 [ROOM_PROTOCOL.md](./docs/documents/ROOM_PROTOCOL.md)。

### 7.1 Superseded — Room MCP 建成前的 Bootstrap 路径

> 状态：Superseded（2026-08-25）。用户已明确接受并提交 Increment 4；后续 Task Contract 改用 Room MCP。Room runtime 初始化与 Runner launcher 是独立 dispatch prerequisite，不恢复旧 `claude -p` Task transport。

2026-08-25 一次性开发执行例外：Increment 5 正在实现的正是缺失的 Decision/Fix continuation，而当前 repository 尚无 Room initialization 与 Runner launcher command。用户明确选择暂时自行人工派发完整 [Increment 5 Accepted Contract](./docs/documents/INCREMENT_5_TASK_CONTRACT.md)；Codex 只提供指令、不启动 Claude。该例外只覆盖本次开发 Task 的人工 delivery/result return，不恢复通用 bootstrap规则、不建立平行 Room authority，也不授权 Claude执行任何 Git写操作。Accepted documentation已于 2026-08-26 形成 clean `main` baseline；实际派发仍须从 live Git记录 exact `HEAD` 并确认 staged、unstaged、untracked均为空。

用户于 2026-08-23 明确批准 Increment 1 Task Contract，并批准以下临时 bootstrap 路径：

- 在 Increment 4 的 Room MCP 被 Review 并接受前，Codex 可以使用本机 `claude -p`，把完整且已由用户批准的 Task Contract 直接交给 Claude Code CLI。
- Bootstrap Task 必须包含稳定 `task_id`、`confirmed_by_user=true` 和本文件要求的完整契约字段；CLI prompt 摘要不能替代 Task Contract。
- Claude Code 的 stdout final result 暂时代替尚未可用的 Room Coding Result transport，但仍必须满足 [ROOM_PROTOCOL.md](./docs/documents/ROOM_PROTOCOL.md) 的 Coding Result shape。
- Claude 需要产品、架构、范围、依赖或权限决定时，必须返回 `needs_decision` 并结束当前 process；Codex 与用户确认后才能启动新的 process。
- Git baseline、clean-worktree gate、Codex Review、Review discussion、Fix approval 和最终接受门禁保持不变。
- Bootstrap 路径只改变 Task/Result 的临时 transport，不改变目标产品架构，不形成第二套持久化 Room state。
- 2026-08-25 用户接受 Increment 4 后，本路径已终止；后续 Task 改用经版本化集成的 Room MCP。

## 8. Task 与交付契约

Task Contract、Fix Task、Coding Result 和 Review 的必填信息以 [AGENTS.md](./AGENTS.md)、[CLAUDE.md](./CLAUDE.md) 和 [ROOM_PROTOCOL.md](./docs/documents/ROOM_PROTOCOL.md) 的共同约束为准。

核心规则：

- 一个 Task 只有一个可验证目标。
- Task 使用逻辑 scope；除非确有必要，不把预测文件列表当作硬边界。
- Fix Task 必须引用原 Review 和用户已确认的解决方案。
- Runner 捕获 CLI 最终结果并验证实际 Git 状态。
- Claude 的最终输出必须满足 Coding Result Contract；缺失或无效结果不能被标记为成功。

## 9. Git 与工作区规则

- 首个 Implementation Task 派发前，目标目录必须是 Git repository 且 worktree clean。
- 一个 Implementation Task 及其全部 Fix Task 共用同一 `baseline_head`。
- Runner 必须采集 tracked、staged、unstaged 和 untracked 状态。
- CODING 期间用户不同时编辑目标 worktree。
- Room 不自动 commit、checkout、reset、clean、merge、rebase 或 push。
- 未经用户明确授权，Codex、Claude Code 和 Runner 都不得执行上述操作。
- `.agent-room/` 默认是未版本化运行目录；只有本文件将某类制品明确列为版本化资产时才可提交。

### 9.1 开发期多 Claude Code 并行试点

- 本节只规范本项目的开发执行方式，不表示 Agent Room MVP 已支持一个 Room 多个并行 Run，也不授权 Room 管理 branch 或 worktree。
- Increment 1 与 Increment 2 保持串行；Increment 2 被 Review、接受并提交后，才可选择两个接口已稳定的独立 leaf module 进行首轮并行试点。
- 并行前由 Codex 完成最小项目骨架、公共协议、模块接口和 dependency direction，并由用户确认任务拆分及创建 branch/worktree 所需的 Git 权限。不得以并行为由先建通用 Agent framework 或空 placeholder。
- 每个 Claude Code 使用从同一已确认 `baseline_head` 创建的独立 branch 和独立 worktree，只执行自己的标准 Implementation Task Contract；禁止两个 Agent 修改同一 worktree。
- 模块 Task 必须能独立验证，并通过现有 Contract 字段明确依赖、接口、逻辑 scope 和禁止触及的共享边界。branch、worktree 与 baseline 属于 Git dispatch metadata，不增加 Room protocol field。公共 Schema、central configuration、package lockfile、公共入口和未稳定接口先串行完成，或留给后续 Integration Task。
- 每个模块 Task 分别经过 Coding Result、Codex Review、用户接受和独立提交。所有 module commit 被接受后，再由独立 Integration Task 组装并运行跨模块验证；merge、cherry-pick、commit 和 branch/worktree 操作仍分别需要用户明确授权。
- 并行试点失败时保留各 worktree 和证据，回到串行 integration；不得通过共享目录抢写、自动冲突覆盖或放宽测试维持并行。

## 10. 测试与验证

- 每次检查必须对应具体可检测失败及会改变的决定。
- 状态机、Task 交接、问题恢复、Run 失败和 Runner 协议优先使用集成测试。
- 新增行为必须有聚焦测试；无法自动化时提供可重复人工步骤。
- 不以模型自述、单个成功日志或测试通过代替完整验收。
- 不重复运行输入未变化且已证明同一事实的昂贵检查。

## 11. 开发原则

- 以一个可独立验收的端到端增量为开发单位。
- 产品代码实现最小正确闭环，不增加未请求的抽象、兼容层、Feature Flag 或 runtime 并行路径；开发执行并行仅适用第 9.1 节。
- 优先复用现有依赖；新增依赖前必须核查标准库、当前依赖和官方能力。
- 不顺手重构、格式化或清理无关代码。
- 重大架构、协议、持久化或状态所有权变化必须由用户确认并更新 ADR。
- 编写或维护任何项目文档前，Codex 必须读取 `backend-doc-authoring` skill 及对应 references，并按 `docs/documents/agent-guides/CODEX_DOCUMENTATION_AUTHORING.md` 执行；所有人类可查看文档必须位于 `docs/documents/`，根目录只保留三个 agent/tooling 控制入口。
- 每次 Review 后，Codex 必须审计需求、接口、架构、结构、状态、命令、运维与开发事实：有变化时更新对应权威文档，无变化时在 Review 验证摘要明确 `documentation: no_change`；未接受 candidate 不得写成 Current。该门禁不增加 Room state 或 runtime hook。
- 每个 Fix Task 经 Codex 二次 Review 通过并获用户明确接受后，Codex 在派发下一 Implementation/Fix Task 前完成一次证据化经验回收，按角色写入 `docs/documents/agent-guides/`；已有规则已覆盖或没有新增经验时如实记录，不制造规则。该文档门禁不增加 Room state、Event 或 protocol field。
- 代码必须包含解释模块职责、关键 invariant、非显然分支、取舍和失败语义所需的注释；注释默认使用简体中文，不逐行复述代码。
- 项目文档与代码注释默认使用简体中文；代码、标识符、命令、Schema 字段和技术专名保持 English。

## 12. 文档地图

| 文档 | 用途 | 维护者 | 读取时机 | 状态 |
|---|---|---|---|---|
| [PROJECT_RULES.md](./PROJECT_RULES.md) | 共享规范入口与当前有效规则 | Codex | 每个非简单项目任务 | Current |
| [AGENTS.md](./AGENTS.md) | Codex 专属角色与流程契约 | 用户/Codex | Codex 会话入口 | Protected |
| [CLAUDE.md](./CLAUDE.md) | Claude Code 专属执行契约 | 用户/Codex Review | 每次 Claude Coding | Protected |
| [docs/documents/README.md](./docs/documents/README.md) | 人工查看的项目文档总入口、用途与依赖关系 | Codex | 查看或维护任意项目文档 | Current |
| [docs/documents/agent-guides/README.md](./docs/documents/agent-guides/README.md) | Agent 细分指南路由与权威关系 | Codex | 角色入口路由或指南维护 | Current |
| [docs/documents/agent-guides/CODEX_DOCUMENTATION_AUTHORING.md](./docs/documents/agent-guides/CODEX_DOCUMENTATION_AUTHORING.md) | `backend-doc-authoring` 驱动的全项目文档编写与维护方法 | Codex | 任意文档工作；每次 Review 后 | Current |
| [docs/documents/agent-guides/CODEX_REVIEW_AND_PLANNING.md](./docs/documents/agent-guides/CODEX_REVIEW_AND_PLANNING.md) | Codex 架构、规划、Review、解决方案与 Fix 经验回收方法 | Codex | 需求、架构、规划、Task、Review、Fix 方案或 Fix 验收后 | Current |
| [docs/documents/agent-guides/CLAUDE_CODING_AND_FIX.md](./docs/documents/agent-guides/CLAUDE_CODING_AND_FIX.md) | Claude Code Coding、Fix、process failure 与回归测试方法 | Codex/Claude 候选 | 每个 Implementation Task 或 Fix Task | Current |
| [docs/documents/agent-guides/GIT_AND_PARALLEL_WORKFLOW.md](./docs/documents/agent-guides/GIT_AND_PARALLEL_WORKFLOW.md) | Git 权限、baseline、并行 worktree 与 integration | Codex/Claude | Git、并行或 integration 任务 | Current |
| [docs/documents/ARCHITECTURE.md](./docs/documents/ARCHITECTURE.md) | 系统结构、模块边界、依赖和数据流 | Codex | 每个非简单项目任务 | Current |
| [docs/documents/ROOM_PROTOCOL.md](./docs/documents/ROOM_PROTOCOL.md) | 状态机、实体、MCP 和 Runner 协议 | Codex | 协议、Runner、MCP、状态任务 | Current |
| [docs/documents/MVP_PLAN.md](./docs/documents/MVP_PLAN.md) | MVP 增量、顺序、验收和非目标 | Codex | 规划与 Task Contract 生成 | Current |
| [docs/documents/OPERATIONS.md](./docs/documents/OPERATIONS.md) | 人工运维接口、架构/结构、命令、状态/制品与恢复视图 | Codex | 人工运维；每次 Review 后维护 | Current |
| [docs/documents/INCREMENT_1_TASK_CONTRACT.md](./docs/documents/INCREMENT_1_TASK_CONTRACT.md) | Increment 1 已批准 Implementation Task Contract | Codex | Increment 1 Coding、Review 与 Fix 规划 | Accepted |
| [docs/documents/INCREMENT_1_FIX_TASK_1.md](./docs/documents/INCREMENT_1_FIX_TASK_1.md) | Increment 1 Review 1 已确认的最小 Fix Task | Codex | Increment 1 Fix Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_1_FIX_TASK_2.md](./docs/documents/INCREMENT_1_FIX_TASK_2.md) | Increment 1 Review 2 已确认的最小 Fix Task | Codex | Increment 1 Fix 2 Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_1_FIX_TASK_3.md](./docs/documents/INCREMENT_1_FIX_TASK_3.md) | Increment 1 Review 3 已确认的最小 Fix Task | Codex | Increment 1 Fix 3 Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_2_TASK_CONTRACT.md](./docs/documents/INCREMENT_2_TASK_CONTRACT.md) | Increment 2 已批准 Implementation Task Contract | Codex | Increment 2 Coding、Review 与 Fix 规划 | Accepted |
| [docs/documents/INCREMENT_2_FIX_TASK_1.md](./docs/documents/INCREMENT_2_FIX_TASK_1.md) | Increment 2 Review 1 已确认的最小 Fix Task | Codex | Increment 2 Fix Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_3_PARALLEL_PILOT_PLAN.md](./docs/documents/INCREMENT_3_PARALLEL_PILOT_PLAN.md) | Increment 3 两个 leaf module 并行试点与串行 Integration 计划 | Codex | Increment 3 Scaffold、Leaf 与 Integration 规划 | Current |
| [docs/documents/INCREMENT_3_SCOPE_SCAFFOLD_TASK_CONTRACT.md](./docs/documents/INCREMENT_3_SCOPE_SCAFFOLD_TASK_CONTRACT.md) | 并行派发前共享 Scope regression 串行前置任务 | Codex | Scope Scaffold Coding 与 Review | Accepted |
| [docs/documents/INCREMENT_3_SCOPE_SCAFFOLD_FIX_TASK_1.md](./docs/documents/INCREMENT_3_SCOPE_SCAFFOLD_FIX_TASK_1.md) | Scope Scaffold Review 1 已确认的最小 Fix Task | Codex | Scope Scaffold Fix Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_3A_TASK_CONTRACT.md](./docs/documents/INCREMENT_3A_TASK_CONTRACT.md) | Claude Process Transport leaf Implementation Task Contract | Codex | Leaf A Coding、Review 与 Integration 规划 | Accepted |
| [docs/documents/INCREMENT_3B_TASK_CONTRACT.md](./docs/documents/INCREMENT_3B_TASK_CONTRACT.md) | Claude Stream Interpreter leaf Implementation Task Contract | Codex | Leaf B Coding、Review 与 Integration 规划 | Accepted |
| [docs/documents/INCREMENT_3A_FIX_TASK_1.md](./docs/documents/INCREMENT_3A_FIX_TASK_1.md) | Leaf A Review 1 已确认的 stdin prompt delivery failure 最小 Fix Task | Codex | Leaf A Fix Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_3B_FIX_TASK_1.md](./docs/documents/INCREMENT_3B_FIX_TASK_1.md) | Leaf B Review 1 已确认的 required Room tool authority 最小 Fix Task | Codex | Leaf B Fix Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_3_INTEGRATION_TASK_CONTRACT.md](./docs/documents/INCREMENT_3_INTEGRATION_TASK_CONTRACT.md) | 两个 accepted leaf 与 Room/Git/artifact 的串行 Claude Runner Integration Task Contract | Codex | Increment 3 Integration Coding 与 Review | Accepted |
| [docs/documents/INCREMENT_3_INTEGRATION_FIX_TASK_1.md](./docs/documents/INCREMENT_3_INTEGRATION_FIX_TASK_1.md) | Integration Review 1 已确认的 current Task、partial session、central matrix 与 lifecycle 文档 Fix | Codex | Increment 3 Integration Fix Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_4_TASK_CONTRACT.md](./docs/documents/INCREMENT_4_TASK_CONTRACT.md) | actor-scoped Room MCP、共享状态 snapshot 与 read-only Status CLI Implementation Task Contract | Codex | Increment 4 Coding 与 Review | Accepted |
| [docs/documents/INCREMENT_4_FIX_TASK_1.md](./docs/documents/INCREMENT_4_FIX_TASK_1.md) | Increment 4 Review 1 五项 confirmed finding 的最小 Fix Task | Codex | Increment 4 Fix Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_4_FIX_TASK_2.md](./docs/documents/INCREMENT_4_FIX_TASK_2.md) | Increment 4 Review 2 cleanup 与 durable-state direct evidence 最小 Fix Task | Codex | Increment 4 Fix 2 Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_4_FIX_TASK_3.md](./docs/documents/INCREMENT_4_FIX_TASK_3.md) | Increment 4 Review 3 stale submit-review MCP direct evidence 最小 Fix Task | Codex | Increment 4 Fix 3 Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_5_TASK_CONTRACT.md](./docs/documents/INCREMENT_5_TASK_CONTRACT.md) | Decision/Fix Resume、Question pause 与 lineage continuation Implementation Task Contract | Codex | Increment 5 Coding、Review 与 Fix规划 | Accepted |
| [docs/documents/INCREMENT_5_FIX_TASK_1.md](./docs/documents/INCREMENT_5_FIX_TASK_1.md) | Increment 5 Review 1 三项 confirmed finding 的最小 Fix Task | Codex | Increment 5 Fix Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_5_FIX_TASK_2.md](./docs/documents/INCREMENT_5_FIX_TASK_2.md) | Increment 5 Review 2 三项 confirmed regression-oracle finding 的 test-only Fix Task | Codex | Increment 5 Fix Coding 与再次 Review | Accepted |
| [docs/documents/DEVELOPMENT_LOG.md](./docs/documents/DEVELOPMENT_LOG.md) | 已完成事实、验证、阻塞与下一步 | Codex/Claude 候选 | 每个非简单项目任务 | Current |
| [docs/documents/ADR/0001-local-room-and-state-ownership.md](./docs/documents/ADR/0001-local-room-and-state-ownership.md) | 本地架构与状态所有权决策 | Codex | 架构、存储、Git 相关任务 | Accepted |
| [docs/documents/ADR/0002-agent-integration-lifecycle.md](./docs/documents/ADR/0002-agent-integration-lifecycle.md) | Codex 拉取与 Claude Runner 生命周期决策 | Codex | Agent 集成与 Runner 任务 | Accepted |

“会话必读”文档为：

1. `PROJECT_RULES.md`
2. `docs/documents/ARCHITECTURE.md`
3. `docs/documents/DEVELOPMENT_LOG.md`

当前任务涉及协议、Runner、MCP、状态或 Git 基线时，还必须读取 `docs/documents/ROOM_PROTOCOL.md`。生成 Task Contract 时必须读取 `docs/documents/MVP_PLAN.md`。任何项目文档工作还必须调用 `backend-doc-authoring` skill 并读取 `docs/documents/agent-guides/CODEX_DOCUMENTATION_AUTHORING.md`。

## 13. 规则变更

- 当前规则不得被静默删除或覆盖。
- 变更规则时必须记录日期、原因、替代内容和相关 ADR。
- 旧规则必须明确标记为 `Superseded` 或 `Deprecated`，避免新旧规则同时表现为有效。
- Claude Code 对共享规则、架构和 ADR 的修改只是候选 Diff，必须由 Codex Review，并在重大变化时由用户确认。
- 2026-08-23：用户确认在 Increment 2 被接受后，以两个独立 leaf module 试点“独立 branch/worktree + 独立 Implementation Task + 串行 integration”的开发期并行方式。该规则不替代 MVP 的单 Room/单 Run 产品边界，因此本次不新增 ADR；若未来把并行 worker 或 worktree management 纳入产品 runtime，必须另行 Architecture Review、用户确认和 ADR。
- 2026-08-23：用户明确代码必须包含必要注释，代码注释默认使用简体中文，代码、标识符、命令、Schema 字段和技术专名保持 English；该规则只澄清编码与 Review 标准，不改变架构，因此不新增 ADR。
- 2026-08-24：用户要求把 Fix 2/3 的可复用经验按 Codex 与 Claude Code 职责拆分，并采用入口路由 + 细分指南的渐进式读取结构。`AGENTS.md`/`CLAUDE.md` 保留角色硬边界和强制索引，详细 Review/规划、Coding/Fix、Git/并行方法当前位于 `docs/documents/agent-guides/`；同时清除两份入口中的未解析 merge marker。该变更整理角色执行知识，不改变产品架构或 Room protocol，因此不新增 ADR。
- 2026-08-24：用户确认 Increment 3 并行试点拆分为 `Claude Process Transport` 与 `Claude Stream Interpreter` 两个独立 leaf module，先串行更新共享 Scope regression，再分别 Review、接受、提交并通过独立 Integration Task 组装。用户同时确认 `CODING` 覆盖 Runner claim 后的 process startup 与 MCP initialization，既有 startup/init failure 继续走 `CODING → RUN_FAILED`，不增加 Room state 或 transition；protocol version、ADR 与实现同步留给 Increment 3 Integration Task。
- 2026-08-24：用户要求总结 Increment 2 Fix 1 的可复用经验，并把“每个 Fix Task 验收后自动执行经验回收”固化为 Codex 文档工作流门禁。经验按 Codex Review 与 Claude Coding 职责写入细分指南；自动化只覆盖 Trigger、路由和一致性检查，不增加 Room state、protocol field、runtime hook 或 ADR。
- Superseded 2026-08-24：Codex 的“运维文档编写者及维护者”窄角色已由下一条全项目文档角色替代；Review 后运维维护要求继续包含在新角色中。
- 2026-08-24：用户明确要求 Codex 调用 `backend-doc-authoring` skill 编写和维护所有项目文档，并把人类可查看文档统一迁入 `docs/documents/`。根目录只保留 `AGENTS.md`、`CLAUDE.md`、`PROJECT_RULES.md` 三个 agent/tooling 控制入口；新增文档总索引和全项目文档维护指南，不保留旧路径副本。该变更只调整文档角色、目录和工作流，不改变产品 architecture、Room protocol 或 runtime，因此不新增 ADR。

## 14. 当前阶段

架构已于 2026-08-23 经用户确认。Increment 1–3 已完成、通过 Review、获用户接受并进入 `main`；Increment 3 Claude Runner commit `e8f0da6db9f3f4ff426355fa1a84d19bae4db9f2` 已 fast-forward 集成。Increment 4 已通过 Review、获用户接受，并以 commit `44fd34959834b28c8909b589a203e4c48eadc5b0` 把 Room MCP、Status CLI、shared snapshot、测试、依赖、Fix Contract 与最终文档状态纳入版本化 `main` baseline；通用 bootstrap Task transport 已 `Superseded`。用户已确认 [Increment 5 Accepted Contract](./docs/documents/INCREMENT_5_TASK_CONTRACT.md)，Claude Coding、[Fix Task 1](./docs/documents/INCREMENT_5_FIX_TASK_1.md) 与 test-only [Fix Task 2](./docs/documents/INCREMENT_5_FIX_TASK_2.md) Coding 均已完成。Codex Review `review-increment-005-codex-003` 对 Fix Task 2 无 finding，Decision 为 `approved`；三项 Contract-named Oracle、typecheck、聚焦 82/82、Git/MCP/Scope 45/45 与全量 207/207 均独立通过。用户已明确接受该 Review 与 Increment 5，并另行授权把完整 accepted scope 提交到 `main`；Decision/Fix continuation 现为版本化 Current capability。该提交授权不包含 push、runtime初始化、Runner launcher、branch/worktree、真实Claude smoke或清理。
