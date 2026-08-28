# Agent Room MVP 计划

> 状态：Current  
> 架构批准日期：2026-08-23  
> Increment 3 Scope Scaffold：Accepted / source commit `eb3637b` / integrated into current `main` tree  
> Increment 3 Integration：Review 1 `changes_requested`  
> Increment 3 Integration Fix 1：Review 2 `approved` / 用户已接受 / `main` commit `e8f0da6db9f3f4ff426355fa1a84d19bae4db9f2`
> Increment 4：用户已接受 / `ACCEPTED` / main commit `44fd34959834b28c8909b589a203e4c48eadc5b0`
> Increment 5：Review 3 `approved` / 用户已接受 / `ACCEPTED` / 已进入版本化 `main`
> Increment 6：Review 3 `approved` / 用户已接受 / `ACCEPTED` / 已进入版本化 `main`
> Increment 7：Review `review-increment-007-codex-005` `approved` / 用户已接受 / `ACCEPTED` / main commit `97005f54555f6485c79f15860a58fe79c3ed593d`
> Increment 8：Fix Review 3 `approved` / 用户已最终接受 / `ACCEPTED` / main commit `8428046dded5f7542690735b3df8a5c5490e8090`
> Agent Room v0.3：六阶段方向与Stage 1 / Increment 9完整Contract已获用户确认；等待clean dispatch baseline

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

状态：`ACCEPTED` / Current。完整Implementation权威范围是[Increment 6 Task Contract](./INCREMENT_6_TASK_CONTRACT.md)，Review 2确认的最小修复范围是[Increment 6 Fix Task 1](./INCREMENT_6_FIX_TASK_1.md)。Fix已补齐missing/non-failed/non-terminal current-task retry source的direct regression，旧Task failed Event对新current Task继续按无source的新Implementation处理；Review `review-increment-006-codex-003`无finding、Decision为`approved`。用户已明确接受并另行授权提交完整accepted scope；Increment 6现已进入版本化`main`。

目标：交付可由operator显式执行的最小端到端runtime，并用representative fixture repository证明完整用户工作流与failure recovery。

范围：

- `/mcp/codex`增加`room_create`、`room_begin_architecture_review`、`room_request_user_confirmation`与`room_retry_run`，直接映射既有RoomService commands；
- 增加显式one-shot `room:run`，打开既有database、连接loopback `/mcp/claude`并执行恰好一个Run；
- 完整`RUN_FAILED → PLAN_READY → CODING` retry orchestration：继承source baseline、保留dirty worktree；session存在时exact resume，session缺失时同一Task lineage new session；
- 用file-backed SQLite、representative temporary Git repository、actual loopback MCP与fake Claude process完成`Implementation → Review → Fix → Review → ACCEPTED`；
- 以独立failure scenario证明失败后恢复且worktree不丢失；
- 同步documentation并保持existing Protocol/Room/Git/Runner/MCP/CLI regression。

非目标：daemon、scheduler、automatic wakeup/retry、真实paid Claude smoke、remote/auth、Git mutation、new state/schema/Event/error/dependency与Increment 7 packaging。

验收：

- actual MCP + file SQLite + Git + fake-process integration scenario到达`ACCEPTED`，并证明current references、cursor、session/baseline、Git evidence与artifact refs；
- failure scenario经actual `room_retry_run`恢复并保留worktree；同时覆盖source session为空时同lineage new session；
- one-shot CLI、九个Codex tools/一个Claude tool、zero-side-effect preflight/rollback与full regression直接通过；
- 实际行为与`PROJECT_RULES.md`、`ARCHITECTURE.md`、`ROOM_PROTOCOL.md`和Accepted Contract一致。

### 增量 7 — Codex Packaging

状态：[Increment 7 Task Contract](./INCREMENT_7_TASK_CONTRACT.md)已获用户完整确认，状态为`Accepted`。严格重执行已闭合Review 1三项finding；Review 2四项finding已形成Accepted [Increment 7 Fix Task 1](./INCREMENT_7_FIX_TASK_1.md)，Fix Coding已完成。[Increment 7 Fix Task 2](./INCREMENT_7_FIX_TASK_2.md)已完成Coding；Review 4 `review-increment-007-codex-004`确认Decision resume gate闭合，但Skill front matter的未引用colon-space导致标准YAML解析失败，Decision为`changes_requested`。用户已确认该finding与最小方案，[Increment 7 Fix Task 3](./INCREMENT_7_FIX_TASK_3.md)已完成Coding；Review `review-increment-007-codex-005`独立验证无finding、Decision为`approved`，用户已明确接受，当前为`ACCEPTED`，已进入版本化 `main` commit `97005f54555f6485c79f15860a58fe79c3ed593d`。Plugin与跨项目runtime现为Current capability；manual Codex Desktop smoke保持pending。

目标：安装一次Agent Room Plugin，在多个无关项目中复用同一通用Skill，同时让每个项目以独立MCP/runtime binding管理自己的Room service、port、database、project path/worktree与Claude process。

范围：

- repository-local marketplace登记的Agent Room Plugin与单一authoritative Skill；
- 每项目project-scoped `.codex/config.toml`绑定独立`/mcp/codex` endpoint；
- 每项目local-only `.agent-room/runtime.json`保存`agent_room_root`、`database_path`、`project_path`、`port`与`room_id`；该具体格式已获确认；
- Skill覆盖Room read/planning/Review workflow，并固定由Codex在host UI“帮我批准”/`approvals_reviewer=auto_review`下发起one-shot `room:run`；
- 首次Implementation只使用首次成功`room_submit_task`响应的`observed_baseline_head`并在同一step生成exact command；值丢失时fail closed，不从live HEAD猜测；
- two-project concurrent E2E证明独立Room/database/worktree/process可并行且无cross-project串扰；
- local Plugin installation/discovery与two-project configuration smoke。

非目标：

- 同一Room parallel Runs、daemon、scheduler、automatic wakeup/retry或background polling；
- Plugin硬编码project endpoint/path/Room，创建/修改/放宽active host approval policy，或把operator direct run作为approval拒绝fallback；
- 新protocol state/schema/Event/error/MCP tool、production runtime改造、dependency或remote/auth；Claude Coding与自动化测试不启动真实paid Claude，只有Contract指定的post-Coding manual smoke可由Codex在`auto_review`通过时执行一次；
- Codex business Coding权限或自动Fix/accept。

验收：

- Codex从两个项目各自配置读取正确Room state并只提交当前state允许、已获用户确认的entity；
- Codex固定发起`room:run`；host审批模式固定为“帮我批准”/`auto_review`，通过时至多执行一次并重新读取Room，拒绝时零Run、停止并报告；
- planned `run_id`在展示、approval与执行间稳定；首次baseline丢失或执行结果不确定时先读Room并停止猜测，不生成第二个Run；
- Project A/B的Run可真实时间重叠，且database/Event、Git、process/cwd/MCP与artifact完全隔离；每个Room的single-active-Run guard不退化；
- packaging不授予Codex business Coding权限、不修改host policy、不声明automatic wakeup；
- focused tests、scope、typecheck、full suite与如实记录的manual Codex Desktop smoke满足Accepted Contract。

实现与验证事实（严格重执行 candidate，2026-08-27）：

- Fix Task 1已重写repository marketplace为Codex当前嵌套schema，补齐三份project setup模板，并修正Skill的baseline authority、stable fresh `run_id`、quoted launcher、approval与post-run durable reread；Plugin manifest、two-project E2E与scope regression未由Fix修改。
- Fix Coding Result报告`tests/plugin-packaging.test.ts` 16/16、`tests/multi-project-e2e.test.ts` 1/1、`tests/scope.test.ts` 1/1、typecheck与全量259/259通过。
- Review 3仍确认两个阻塞：唯一Skill无YAML front matter；Decision answer(false)后Room保持`NEEDS_DECISION`，但Step 4只允许ready state，合法resume路径被阻断。现有packaging Oracle未直接覆盖这两个条件。
- Fix Task 2 Coding报告packaging 18/18、two-project 1/1、scope 1/1、typecheck与全量261/261通过；Review 4独立确认Decision continuation闭合，但标准YAML parser以`mapping values are not allowed here`拒绝Skill `description`中的`binding: validate`，说明局部front matter parser存在盲点。
- Fix Task 3 Coding报告packaging 18/18、two-project 1/1、scope 1/1、typecheck与全量261/261通过；Review `review-increment-007-codex-005`独立标准YAML解析、focused/full regression与scope/ancestry核对均通过，无finding，Decision为`approved`；用户已明确接受，当前为`ACCEPTED`，已进入版本化 `main` commit `97005f54555f6485c79f15860a58fe79c3ed593d`。
- 未执行：manual Codex Desktop smoke（未获得单独授权）；版本化提交已完成。

### 增量 8 — Automatic Project Setup

状态：[Increment 8 Task Contract](./INCREMENT_8_TASK_CONTRACT.md)、[Fix Task 1](./INCREMENT_8_FIX_TASK_1.md)与[Fix Task 2](./INCREMENT_8_FIX_TASK_2.md)均为`Accepted`且已完成。Fix Review 3 `review-increment-008-codex-003`确认table-context修复与direct regression无finding，focused setup 12/12、packaging 20/20、scope 1/1、typecheck及full test glob通过；用户授权后的actual installed-plugin Skill consumer evaluation也已覆盖direct/indirect/negative/boundary activation与bundled resource resolution并通过。Decision为`approved`，用户已于2026-08-28明确最终接受，Fix验收经验回收已完成；完整accepted scope由commit `8428046dded5f7542690735b3df8a5c5490e8090`进入版本化`main`，automatic setup现为Current capability。

目标：在现有唯一Agent Room Skill中增加显式setup mode，从operator提供的runtime root自动建立当前项目binding、启动existing`room:serve`，并在Codex Desktop reload后通过project-scoped MCP创建和验证Room。

范围：

- Skill-owned Node.js/TypeScript helper生成project-local database path、loopback ephemeral port与`room-<UUID>`，保守创建或合并runtime/config/gitignore；
- valid binding幂等复用，existing conflict或mismatch在写入前停止；
- loopback port关闭时启动一次service，开放时避免重复启动，Room identity由reload后的MCP验证；
- reload continuation只调用existing`room_create`与`room_get_state`，最终到达`DISCUSSION`；
- focused setup、packaging/scope与actual loopback E2E evidence。

非目标：新Room protocol/state/schema/Event/MCP/production CLI/dependency，global config或raw HTTP fallback，daemon/service manager，自动reload，`room:run`/Claude/paid smoke或Git mutation。

验收：fresh project只输入valid `agent_room_root`即可得到一致的五字段runtime、project MCP config与ignore rules；existing content保留、rerun identity稳定、conflict零写入；service/reload/MCP continuation到exact Room `DISCUSSION`，且setup不越过Room workflow与one-shot Runner gate。

### 增量 9 — Protocol v0.3 Participant / Role Foundation（Accepted）

状态：[六阶段路线图](./AGENT_ROOM_V03_ROADMAP.md)、[ADR-0003](./ADR/0003-participant-role-and-v03-evolution.md)与[Increment 9 Contract](./INCREMENT_9_TASK_CONTRACT.md)均已获用户明确确认；当前形成clean documentation/setup baseline，尚未调用`room_submit_task`。

目标：在保持Current串行lifecycle的前提下，以ParticipantProfile、RoleAssignment、generic actor/session和participant route替换固定`codex`/`claude`/`runner`identity；创建new v0.3 Room/database/binding，并把v0.2 database未改写地只读保留。

范围：

- protocol metadata、Participant/Profile/Assignment、history-frozen Task/Run/Review/Event identity；
- `agent_session_ref`、`/mcp/participants/{participant_id}`、multi-entity snapshot与default Codex/Claude/local Runner profiles；
- v0.2五字段binding到v0.3binding的保守切换，旧database不迁移、不删除；
- Current串行acceptance/failure/question/fix lifecycle等价回归；
- breaking self-hosted实现使用detached v0.2 launcher worktree驱动当前target main/Room。

非目标：multi-Run/Executor scheduler、Plan/Approval/DAG/Git write、Chat、SSE/VS Code、GitHub、新provider adapter或v0.2原地migration。

已确认：Plan-scope assignment与Approval延后到Stage 3的真实consumer；v0.3 binding exact新增字段；detached v0.2 launcher worktree与local runtime binding更新。

验收：default profiles完成现有串行end-to-end lifecycle；assignment变化只影响未来entity；历史participant/role不变；participant route role gate与跨Room隔离成立；v0.2database byte content不变且v0.3 writable service拒绝打开；Stage 2–6 capability未混入。

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

[Increment 6 Accepted Contract](./INCREMENT_6_TASK_CONTRACT.md) 已按用户选择从clean exact `main` baseline（dispatch `HEAD`=`7ac639a30ab2a94170ef69498e065fb16e77f833`）重新执行完整Implementation Task。[Increment 6 Fix Task 1](./INCREMENT_6_FIX_TASK_1.md)已补齐三类current-task retry source direct negative evidence，旧Task failed Event对新current Task按无source的new Implementation处理并保留stale caller拒绝。Review `review-increment-006-codex-003`无finding、Decision为`approved`；用户已明确接受并另行授权提交完整accepted scope。Increment 6现已进入版本化`main`，planning coordination tools、one-shot Runner CLI与failure retry为Current capability。

Increment 1–8均已接受并进入版本化`main`，继续构成Current v0.2 capability。Agent Room v0.3 Stage 1已完成Architecture Review Draft并进入`WAITING_FOR_USER_CONFIRMATION`；下一步是用户确认[Increment 9 Draft Contract](./INCREMENT_9_TASK_CONTRACT.md)的三项待确认边界，再分别处理受保护规则同步、documentation/setup Git baseline与独立worktree/开发Room授权。确认前不提交Task、不启动Claude/service、不切换database/binding。
