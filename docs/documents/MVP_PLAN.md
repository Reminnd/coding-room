# Agent Room MVP 计划

> 状态：Current  
> 架构批准日期：2026-08-23  
> Increment 3 Scope Scaffold：Accepted / source commit `eb3637b` / integrated into current `main` tree  
> Increment 3 Integration：Review 1 `changes_requested`  
> Increment 3 Integration Fix 1：Review 2 `approved` / 用户已接受 / `main` commit `e8f0da6db9f3f4ff426355fa1a84d19bae4db9f2`
> Increment 4：用户已接受 / `ACCEPTED` / main commit `44fd34959834b28c8909b589a203e4c48eadc5b0`
> Increment 5：Review 3 `approved` / 用户已接受 / `ACCEPTED` / 已进入版本化 `main`

## 1. 目标

交付一个本地端到端工作流：已批准的 Codex Task Contract 由 Claude Code CLI 在共享 Git worktree 中执行，完成后交给 Codex Review；用户讨论并确认解决方案后可以继续 Fix，最终由用户明确接受。

## 2. 全局验收标准

只有同时满足以下条件，MVP 才算完成：

1. State Machine 拒绝非法 transition，并强制执行所有用户确认门禁。
2. 新 Implementation Task 不能在非 clean Git worktree 中启动。
3. Runner 启动 Claude Code CLI，并记录实际 process、result 与 Git evidence。
4. Claude 可以因 blocking Question 停止，并在获得用户确认答案后恢复。
5. Codex 可以提交 Review，但不会自动派发 Fix。
6. 用户确认的 Fix Task 恢复同一 Task lineage session。
7. 新的无关 Implementation Task 创建新的 Claude session。
8. 完整 Implementation → Review → Fix → Review → Accepted 循环通过 integration test。
9. VS Code 可以显示实时 Git Diff，而 Room 不生成平行 Diff artifact。
10. Architecture、protocol 和 development-state 文档与实际行为一致。

## 3. 全局非目标

- Web UI 或 VS Code UI。
- 自动唤醒 Codex Desktop。
- 一个 Room 中存在多个并行 Run。
- Room 管理 worktree 或 branch。
- Remote 或 multi-user deployment。
- 通用 Agent adapter framework。
- 自动 commit 或 push。

### 3.1 开发执行策略

MVP 的产品增量仍按依赖顺序串行接受；开发期并行只是交付手段，不改变一个 Room 只有一个 active Run 的验收边界。

- Increment 1 与 Increment 2 串行完成、Review、接受并提交，以先稳定 protocol/state core 和 Git baseline/evidence。
- Increment 2 被接受后，Codex 可以选择两个互不依赖的 leaf module 作为首轮并行试点。试点前先串行确定公共 interface、fixture、错误语义和最小 integration seam。
- 可并行模块必须具有独立输入输出、独立验证和不交叉的写入范围；需要共同修改 protocol、schema、package metadata、lockfile 或 central wiring 的工作不并行。
- 每个并行模块使用标准独立 Implementation Task Contract、branch 和 worktree，分别 Review 和接受。branch/worktree 信息作为 Git dispatch metadata，不扩展 Room protocol；最终由独立 Integration Task 组合 accepted commits 并执行跨模块测试。
- 本策略不要求 MVP 实现 parallel scheduler、Room-managed worktree 或 automatic merge，不把开发期协调状态写入 Room runtime schema。

## 4. 增量顺序

### 增量 1 — Protocol 与 State Core

目标：创建带 SQLite persistence 的最小可执行 Room domain。

范围：

- 初始化项目 package；
- protocol type 与 validation；
- SQLite schema 与 repository；
- 实现合法 transition service；
- 实现 event sequence；
- 聚焦 state-transition integration test。

验收：

- [ROOM_PROTOCOL.md](./ROOM_PROTOCOL.md) 中所有 transition 都有通过的正向与反向测试；
- entity creation 与对应 transition 保持 atomic；
- 相同内容的重复 ID 操作具备 idempotency，不同内容的冲突 ID 失败；
- 本增量不实现 Runner、Git integration 或 MCP transport。

Verification 检测：

- 非法 actor/state combination 被错误接受；
- entity/state 发生 partial write；
- event order 不稳定；
- protocol/schema 出现偏移。

### 增量 2 — Git Preconditions 与 Evidence

目标：让 Git 成为可强制执行的代码状态边界。

范围：

- repository 与 `HEAD` 检查；
- 实现 clean-worktree gate；
- 捕获 baseline；
- 收集 staged/unstaged/untracked evidence；
- 使用 temporary repository 的聚焦 integration test。

验收：

- non-repository、missing-HEAD 与 dirty-worktree 输入产生规定 error；
- clean repository 能产生 baseline；
- completion evidence 覆盖 tracked、staged 与 untracked change；
- 不执行任何 Git mutation command。

### 增量 3 — Claude Runner

目标：通过 Claude Code CLI 执行一个已批准 Task Contract，并准确分类 Run。

范围：

- 实现 process-per-Run lifecycle；
- 构造 Task prompt；
- 解析 structured event；
- 收集 MCP initialization evidence；
- 捕获 session ID；
- 校验 Coding Result；
- 映射 exit/failure；
- fake-process integration test，以及一次经明确授权的真实 CLI smoke test。

验收：

- success 进入 `REVIEW_REQUIRED`；
- startup、MCP、exit 和 invalid-result failure 进入 `RUN_FAILED`；
- failure 后保留 worktree；
- 根据本机已安装 Claude CLI 验证准确 permission flag；
- Runner 而不是 Claude tool call 拥有 terminal Run state。

### 增量 4 — Room MCP 与 Status CLI

目标：向 Codex 和 Claude 暴露已批准的 coordination command。

范围：

- 实现 loopback Streamable HTTP MCP；
- [ROOM_PROTOCOL.md](./ROOM_PROTOCOL.md) 定义的六个 tool；
- actor 与 schema validation；
- 实现 event cursor read；
- 实现 read-only status CLI。

验收：

- Codex tool call 强制执行 confirmation 与 state gate；
- Claude 在 Room tool surface 中只能提出 Question；
- CLI 显示当前 waiting actor 与 active entity；
- MCP 不暴露 file、Shell、Patch 或通用 Git tool。

当前 Accepted implementation 见 [Increment 4 Task Contract](./INCREMENT_4_TASK_CONTRACT.md)：同一 loopback process/SQLite authority 使用 `/mcp/codex` 与 `/mcp/claude` 两个 stateless Streamable HTTP route，通过 exact tool registration enforce actor；MCP 与 CLI 共享只读 Room state snapshot；首次 Implementation Task submission 连接既有 clean Git gate。Fix Task 1–3 已闭环 request cleanup、durable-state/idempotency evidence 与 `room_submit_review` stale succeeded Run / wrong-current MCP direct regression；Review `review-increment-004-codex-004` 为 `approved`，用户已接受并授权提交。实现已进入版本化 `main` baseline，bootstrap transport 已终止。

### 增量 5 — Decision 与 Fix Resume

目标：支持 Question recovery 和 Review-confirmed Fix Run。

范围：

- 实现 `NEEDS_DECISION` flow；
- contract 内答案的 resume；
- 改变 contract 的答案返回 planning；
- 校验 Fix Task；
- 恢复 Task-lineage session。

验收：

- blocking Question 不能被静默当作 completion；
- 改变 scope 的答案不能恢复旧 contract；
- Fix Task 必须引用现有 Review 与已确认 finding；
- Fix Run 复用该 lineage 的 session 与 baseline。

当前 Accepted design见 [Increment 5 Task Contract](./INCREMENT_5_TASK_CONTRACT.md)。Contract把已有 primitives收敛为以下最小闭环：Question保存后由 Runner完成 needs-decision Run pause evidence并产生 `run_paused` cursor；answer只在旧 process已停止后生效；Decision/Fix continuation从 persisted Question/Review/source Run推导 exact session与 baseline；新 Implementation仍要求 clean worktree，而 continuation保留 dirty Diff并校验 unchanged `HEAD`。Contract不增加 state/schema/MCP tool/dependency、Runner daemon或 scheduler。[Increment 5 Fix Task 1](./INCREMENT_5_FIX_TASK_1.md) 已闭合 Review 1 的三项实现缺陷，test-only [Fix Task 2](./INCREMENT_5_FIX_TASK_2.md) 已补齐 Contract-named event-order 与 durable zero-side-effect evidence。Review `review-increment-005-codex-003` 无 finding、全量 207/207 独立通过并获用户明确接受；完整 accepted scope 已进入版本化 `main`，现为 Current。

### 增量 6 — End-to-End MVP

目标：使用 representative fixture repository 证明完整用户工作流。

范围：

- 提交 Implementation Task；
- 执行 Claude Run；
- 收集 Git evidence；
- 提交 Review；
- 进入 Review discussion state；
- 提交 Fix Task；
- 第二次 Review；
- 完成 explicit acceptance；
- 同步 documentation。

验收：

- 一个 integration scenario 到达 `ACCEPTED`；
- failure scenario 可以恢复并保留 worktree；
- 实际行为与 `PROJECT_RULES.md`、`ARCHITECTURE.md` 和 `ROOM_PROTOCOL.md` 一致。

### 增量 7 — Codex Packaging

目标：让 Room workflow 在 Codex App 中可发现、可重复使用。

范围：

- personal Codex plugin 或 skill；
- Room MCP 配置；
- 编写 workflow instruction；
- local installation 与 smoke verification。

验收：

- Codex 可以显式读取 Room state 并提交已批准 entity；
- packaging 不把业务代码写入职责授予 Codex；
- 不引入 automatic wakeup 声明。

## 5. Task Contract 规则

每个 increment 只有满足以下条件后，才能转换为独立 Task Contract：

1. Codex 检查 repository state 和当前 Development Log。
2. Codex 把该 increment 的 acceptance criterion 映射到聚焦测试。
3. 所有 dependency choice 都已经根据当前 official capability 和既有 dependency 完成验证。
4. 用户明确批准具体 Task Contract。

除非新发现的 dependency 要求用户确认改变计划，否则严格按顺序实施。

Room MCP 在 Increment 4 才可用。用户已于 2026-08-23 批准：Increment 1–4 可以按 `PROJECT_RULES.md` 的受限 bootstrap 规则，通过本机 `claude -p` 接收完整已批准 Task Contract；该路径不建立平行 Room state，并在 Increment 4 被接受后终止。

## 6. 当前下一步

Increment 1 与 Increment 2 已完成、通过 Review、获用户接受并提交。Increment 3 的串行 Scope Scaffold 已完成并集成；Increment 3A/3B 已完成 Coding、Review、Fix、用户接受与独立提交，commits 为 `86c77a7c68b953343d67da3857859b0dd6d6c09c` 和 `1062a7500f8bb3e22c7c3818ddcac2e9eb625efa`。[Increment 3 Integration Task Contract](./INCREMENT_3_INTEGRATION_TASK_CONTRACT.md) 已获用户确认，具体化 central Runner、`CODING` startup/init lifecycle、terminal evidence、Git/artifact failure 与 fake-process matrix。

Integration Coding 已完成，但 Review `review-increment-003-integration-codex-001` 对 current Task guard、failure partial session evidence、central public-path matrix 与 lifecycle 文档一致性提出四项 finding，Decision 为 `changes_requested`。用户已确认最小方案，[Integration Fix Task 1](./INCREMENT_3_INTEGRATION_FIX_TASK_1.md) 为 Accepted。Fix Coding 已按四项 confirmed finding 完成并验证（current Task authority 复用最新 `task_submitted` Event、`required_tool_missing` 保留 observed session、central `runClaude` 直接覆盖全部 transport/stream failure path、协议/架构统一为 `CODING → RUN_FAILED` startup/init 语义）。Codex Review 2 未发现阻塞 finding，Decision 为 `approved`，用户已明确接受。Increment 3 commit `e8f0da6db9f3f4ff426355fa1a84d19bae4db9f2` 已 fast-forward 集成到 `main`，Runner 现为 Current TypeScript capability。

[Increment 4 Task Contract](./INCREMENT_4_TASK_CONTRACT.md) 已冻结 dual-route actor authority、shared Room snapshot、new-only Implementation clean Git gate、explicit loopback runtime parameters 与 exact MCP SDK dependency。Fix Task 3 的 stale succeeded Run / wrong-current MCP direct regression 已通过，Review `review-increment-004-codex-004` 无 finding，`npm run typecheck`、MCP 27/27 与全量 186/186 通过。用户已接受，implementation 已由 commit `44fd34959834b28c8909b589a203e4c48eadc5b0` 进入版本化 `main` baseline。

[Increment 5 Accepted Contract](./INCREMENT_5_TASK_CONTRACT.md)、[Fix Task 1](./INCREMENT_5_FIX_TASK_1.md) 与 test-only [Fix Task 2](./INCREMENT_5_FIX_TASK_2.md) Coding 均已完成。Review `review-increment-005-codex-003` 确认同一 pause stream Question 前后 progress 分界、answer 后 retry/conflict 完整 durable snapshot、baseline mismatch Event/cursor/Room 零副作用三项 Oracle 均闭合，无 finding，Decision 为 `approved`。用户已明确接受并另行授权提交完整 accepted scope；Increment 5 已进入版本化 `main`。真实 Claude smoke、push与后续 Increment 规划仍是独立门禁。
