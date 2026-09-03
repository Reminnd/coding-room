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
> Agent Room v0.3：Stage 1已获用户最终接受并进入版本化`main`；active runtime已完成独立授权的database/binding cutover，Increment 10 workflow Room=`ACCEPTED`
> Increment 14：Contract `Accepted` / candidate `REVIEW_REQUIRED` / branch `codex/increment-14-validation-boundary-ee3cd96`

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

状态：[六阶段路线图](./AGENT_ROOM_V03_ROADMAP.md)、[ADR-0003](./ADR/0003-participant-role-and-v03-evolution.md)与[Increment 9 Contract](./INCREMENT_9_TASK_CONTRACT.md)均已获用户明确确认。Implementation Review 1与Fix Review 2的finding已分别由[Fix Task 1](./INCREMENT_9_FIX_TASK_1.md)和[Fix Task 2](./INCREMENT_9_FIX_TASK_2.md)处理。Fix Review 3方案由[Fix Task 3](./INCREMENT_9_FIX_TASK_3.md)实现；Fix Review 4的dot-segment finding由[Fix Task 4](./INCREMENT_9_FIX_TASK_4.md)按固定`p~` framing闭合。Fix Review 5 `review-increment-009-codex-005`无finding、Decision为`approved`；用户已最终接受，历史Room=`ACCEPTED`，Fix验收经验回收已完成。Stage 1完整accepted scope已进入版本化`main`，active runtime已于2026-08-30完成独立授权的cutover；新Room=`DISCUSSION`。Stage 2 entry gate（multi-Run/Executor scheduler）未满足，不提前交付。

实施事实（candidate implementation + Fix 1，2026-08-29）：

- `protocol_version`=`0.3-design`写入v0.3 database protocol metadata；全空表fresh建schema；有表但无metadata的v0.2 database在schema write前拒绝；wrong exact metadata同样以`protocol_version_mismatch`拒绝且database逐byte不变（Fix inc9-r6 public open回归）。
- `ParticipantProfile`字段冻结；`RoleAssignment` scope收窄为room|task（run/review scope在schema/MCP boundary拒绝）；resolution为exact entity scope优先；同scope/role active只由成功insert的rowid顺序决定，不信任caller `created_at`，same-ID retry不提升旧assignment；participant必须存在、enabled且adapter/capability与role兼容（Fix inc9-r2/r5）。
- createRoom bootstrap：codex-app→planner/reviewer/orchestrator（capabilities含supervising，single control endpoint）；claude-code-cli→worker；local-runner→executor；operator保留human profile但无active assignment（Fix inc9-r4）。Task提交固化planner/orchestrator，Run claim固化worker/executor，Review提交固化reviewer；Run/Review的worker/executor/reviewer按task_id的Task scope优先、Room fallback解析（Fix inc9-r2）。
- 已创建Run的askQuestion/progress/pause finalization/complete/fail只对照Run冻结的worker/executor identity；replacement对旧Run返回`actor_not_allowed`，disabled冻结actor re-enable后恢复（Fix inc9-r1）。所有same-ID retry在返回existing前执行authority校验：authorized same-content retry created=false且零Event，different content仍id_conflict，unknown/disabled/wrong-role为actor_not_allowed且durable snapshot不变（Fix inc9-r3）。
- `Event.actor`改为`actor_role + participant_id`；`Run.claude_session_id`改为`agent_session_ref`；MCP收敛为单一`/mcp/participants/{participant_id}` route（13个role-gated tools），v0.2固定routes返回not found；Runner走worker route。
- snapshot扩展为全部Participant/Assignment/Task/Run/Review/Question/Event；binding扩展为八字段（新增`protocol_version`、`control_participant_id`、`archived_database_path`），setup migration保守改写遗留`/mcp/codex` URL并幂等复用v0.3 identity；Fix inc9-r6 public CLI回归证明mode=migrated时旧database逐byte不变、rerun mode=reused且identity稳定、conflict零写入。
- 实现偏差：migration/reuse要求operator再提供一次`--agent-room-root`（stored v0.2 root指向v0.2代码，不能复用为v0.3 root），已记录于Coding Result deviation。
- 验证（Fix Coding）：`npm run typecheck` exit 0；protocol/room-service/room-state-snapshot 93/93、room-mcp/room-serve/status-cli 52/52、claude-process/claude-stream/claude-runner/runner-cli/e2e-workflow 105/105、plugin-setup/plugin-packaging/multi-project-e2e 34/34、scope 1/1、full `npm test` 304/304全部独立通过。
- Fix Task 2 Coding事实（2026-08-29，candidate，待Fix Review 3）：Runner把resolved executor participant作为唯一executor actor贯穿claim/progress/pause finalization/complete/fail，不再回退固定`local-runner`（inc9-fr2-1）；Review acceptance按Review冻结reviewer授权，replacement与Room default被拒（inc9-fr2-2）；Task/Run/Review same-ID retry按stored冻结identity认证，authorized same-content created=false零写入、different content id_conflict、replacement被拒，new entity继续消费current assignment（inc9-fr2-3）；Participant管理只认可active latest orchestrator assignment，historical replaced orchestrator三管理命令全部被拒零写入（inc9-fr2-4）；existing v0.3 binding只在`control_participant_id` exact为`codex-app`时复用，mismatch在任何写入前失败且三份文件逐byte不变（inc9-fr2-5）。Fix 2验证：claude-runner/room-service 114/114、room-mcp/plugin-setup 51/51、scope 1/1、typecheck与full 309/309、`git diff --check`全部独立通过。
- Fix Review 3 finding与方案已确认：`participant_id`继续是raw opaque identity；[Fix Task 3](./INCREMENT_9_FIX_TASK_3.md)只统一MCP/Runner/CLI的canonical single-segment URL encoding，并以`worker/2`补direct public-path evidence。
- Fix Task 3 Coding事实（2026-08-29，candidate，待Fix Review 4）：Runner与CLI各自从resolved worker assignment的raw identity用`encodeURIComponent`独立构造canonical single-segment route，`new URL(...).pathname` exact comparison继续拒绝raw多segment/未编码/错误participant/尾斜杠/query/fragment；MCP route把encoded segment解码回raw identity，application不做第二次decode，无wildcard或fallback route。direct regression（期望值均为测试侧literal）：MCP经`/mcp/participants/worker%2F2`调用`room_ask_question`成功且Event actor为raw `worker/2`/worker，raw `/mcp/participants/worker/2`返回404且Event list零变化；production `runClaude`以`worker/2`穿过route gate、claim与terminal settlement，raw多segment mcpConfig零副作用拒绝；public `room:run` CLI以encoded URL完成fake-process Run，raw多segment URL preflight失败且完整durable read-model snapshot逐字段不变。验证：claude-runner 49/49、runner-cli 15/15、room-mcp 38/38、scope 1/1、typecheck与full 314/314、`git diff --check`全部独立通过；schema/database/protocol version/Stage 2–6/dependency/source module未变。
- Fix Review 4：上述`worker/2` public paths正确且独立`typecheck`、full 314/314通过；但schema允许`.`/`..`，`encodeURIComponent`保留dot，WHATWG URL parser把participant path归一化为当前/父路径。finding `inc9-fr4-dot-segment-normalization`为high，Decision=`changes_requested`；用户确认解决方案前不生成下一Fix Task。
- Fix Task 4方案已确认：所有v0.3 participant routes统一为`/mcp/participants/p~{encodeURIComponent(raw participant_id)}`；MCP只验证/移除一次固定prefix并恢复raw authority identity，Runner/CLI/setup/Plugin consumer同步切换，unframed old candidate route不提供compatibility fallback。Contract为`Accepted`，随后已获单独Fix Run授权并完成Coding（见下一条）。
- Fix Task 4 Coding事实（2026-08-29，candidate，Fix Review 5 approved）：MCP POST route对framework解码后的segment只验证并移除恰好一次`p~` prefix，剩余值即raw authority identity，不二次percent-decode；unframed单segment POST返回404 JSON-RPC error、不注册tool、不进入authority，GET/DELETE仍对任何单segment 405。Runner/CLI从同一resolved worker assignment的raw identity独立构造framed route并exact compare，`p~`只存在于transport segment，claim/Event/Run保持raw。setup-project从validated `control_participant_id`生成framed control URL；既有config的旧unframed candidate URL按binding/config mismatch零写入拒绝（无auto-compat migration），Plugin SKILL/reference与packaging Oracle全部framed。direct regression（期望值均为测试侧literal）：MCP `.`/`..`经`p~.`/`p~..`调用实际tool成功且Event actor/Run冻结为raw identity，unframed `.../mcp/participants/.`/`.../mcp/participants/..` POST 404且Event list零变化；production `runClaude`以`.`/`..`穿过route gate与terminal settlement，unframed encoded mcpConfig零spawn/Run/Event/artifact拒绝；public `room:run` CLI以framed `p~.`/`p~..`完成fake-process Run，unframed URL preflight失败且完整durable read-model snapshot逐字段不变；setup三路径生成framed URL、unframed candidate config（section与frozen dotted形态）非零exit且三文件逐byte不变；`worker/2`回归更新为framed `p~worker%2F2`。验证：room-mcp/claude-runner/runner-cli 108/108、plugin-setup/plugin-packaging 35/35、e2e-workflow/multi-project-e2e/room-serve 12/12、scope 1/1、typecheck与full 321/321、`git diff --check`全部独立通过；schema/database/protocol version/Stage 2–6/dependency/source module未变。
- v0.3 database/binding已成为active runtime authority；v0.2 database不迁移、不backfill、不删除，通过`archived_database_path`只读保留。
- Fix Review 5：未发现finding；独立typecheck、focused 108/108、35/35、12/12、scope 1/1与full 321/321全部通过，Decision=`approved`。用户已最终接受，Room=`ACCEPTED`；未授权stage、commit、push或database/binding cutover。

目标：在保持Current串行lifecycle的前提下，以ParticipantProfile、RoleAssignment、generic actor/session和participant route替换固定`codex`/`claude`/`runner`identity；创建new v0.3 Room/database/binding，并把v0.2 database未改写地只读保留。

范围：

- protocol metadata、Participant/Profile/Assignment、history-frozen Task/Run/Review/Event identity；
- `agent_session_ref`、framed `/mcp/participants/p~{encodeURIComponent(raw participant_id)}`、multi-entity snapshot与default Codex/Claude/local Runner profiles；
- v0.2五字段binding到v0.3binding的保守切换，旧database不迁移、不删除；
- Current串行acceptance/failure/question/fix lifecycle等价回归；
- breaking self-hosted实现使用detached v0.2 launcher worktree驱动当前target main/Room。

非目标：multi-Run/Executor scheduler、Plan/Approval/DAG/Git write、Chat、SSE/VS Code、GitHub、新provider adapter或v0.2原地migration。

已确认：Plan-scope assignment与Approval延后到Stage 3的真实consumer；v0.3 binding exact新增字段；detached v0.2 launcher worktree与local runtime binding更新。

验收：default profiles完成现有串行end-to-end lifecycle；assignment变化只影响未来entity；历史participant/role不变；participant route role gate与跨Room隔离成立；v0.2database byte content不变且v0.3 writable service拒绝打开；Stage 2–6 capability未混入。

### 增量 10 — Stage 2 Execution Core（Accepted Contract）

状态：用户于2026-08-30确认[Stage 2 Architecture Review](./STAGE_2_EXECUTION_CORE_ARCHITECTURE_REVIEW.md)三项设计方向及[Increment 10 Contract](./INCREMENT_10_TASK_CONTRACT.md)全文。Implementation与两轮Fix均已完成；最终Fix Review `review-increment-010-codex-003`无finding、Decision=`approved`，typecheck、focused suites与full `npm test` 353/353均通过。用户于2026-08-31最终接受；accepted source已进入版本化`main`。截至该接受时active Room/database/binding仍为v0.3；其能力于2026-09-02随v0.5整体cutover进入Current runtime。

目标：交付one-shot multi-Run Execution Core，使同一Room内使用不同canonical worktree的logical Runs拥有独立RunAttempt、Question、failure、Review/Fix与acceptance lifecycle，并通过SQLite并发约束和唯一terminal settlement形成可验证闭环。

非目标：Scheduler、TaskGraph/DAG、Git Controller、worktree creation、same-worktree parallel、第二provider adapter、running Claude live steer、automatic retry/review/acceptance及v0.3原地migration。

进入Coding前门禁：完整Contract确认与planning Room transition已完成；当前授权只形成clean exact planning baseline并处理既有dirty config/plugin文件。随后仍须另行授权Current v0.3 Room的`room_submit_task`、按自托管隔离方案取得必要Git/worktree授权，并单独授权至多一次one-shot Run。v0.4 database/binding cutover仍需实现Review、用户接受后的独立授权。

Review状态（2026-08-31，candidate）：continuation Run `-007`报告的8条Contract verification与Codex独立typecheck/full 341/341均通过，但额外decision-changing probes确认：(1) deferred transaction下真实双connection claim的loser泄漏`database is locked`；(2) `settleRunAttempt`可持久化`succeeded + result=null + failure`；(3) ready work item的`current_task_id`为null或Fix前一Task。三项solution与Fix Task 1全文已确认；Fix Contract为`Accepted`，v0.4 database/binding cutover仍是独立门禁。

Fix验收（2026-08-31）：[Fix Task 1](./INCREMENT_10_FIX_TASK_1.md)闭合atomic claim、terminal evidence与ready current Task三项finding；[Fix Task 2](./INCREMENT_10_FIX_TASK_2.md)显式拒绝effective `needs_decision`的empty evidence，并保留result-carrying与pause-failure两种合法形态。Fix Review `review-increment-010-codex-003`确认完整public path、rollback与回归无finding；用户已最终接受。Accepted `0.4-design` source已由本次提交进入版本化`main`；只有另行授权runtime cutover后才成为Current operational capability。

### 增量 11 — 删除 Git Baseline Hash Validation（Accepted）

状态：用户于2026-08-31确认[哈希校验删除规划](./HASH_VALIDATION_REMOVAL_PLAN.md)的范围与失去HEAD/branch drift自动拒绝的取舍；[Architecture Review](./HASH_VALIDATION_REMOVAL_ARCHITECTURE_REVIEW.md)=`Approved`，[ADR-0005](./ADR/0005-remove-git-baseline-hash-validation.md)=`Accepted`。[Increment 11 Contract](./INCREMENT_11_TASK_CONTRACT.md)与[Fix Task 1](./INCREMENT_11_FIX_TASK_1.md)均为`Accepted`。Implementation Review 1=`changes_requested`；Fix Review `review-increment-011-codex-002`无finding、Decision=`approved`；用户于2026-09-01明确最终接受，Increment 11阶段=`ACCEPTED`。

目标：在v0.4首次cutover前，从target protocol、SQLite、Git Observer、Execution Core、public consumer与tests完整删除`baseline_head`/commit-object validation，同时保留first-attempt clean gate、canonical worktree lease、Git failure propagation与Run/Task/session lifecycle。

Coding route：用户指定独立Codex task，model=`gpt-5.6-sol`、reasoning effort=`medium`；不走Agent Room Claude Runner，不复用terminal v0.3 Room。该路由只适用于Increment 11，不永久改变项目角色。

Coding结果：独立Codex task从clean exact baseline `c449f40aebe3ff018610c59f34782a698463f907`完成baseline-free candidate；Fix Task 1仅补invalid public-path完整rollback/零副作用Oracle与Current文档状态，未修改production source或Plugin。再次Review与用户最终接受均已完成，accepted source已由本次提交进入版本化`main`；runtime cutover与旧database处理仍为独立门禁。

### Stage 3 — DAG Control Plane（Architecture Approved）

[Stage 3 Architecture Review](./STAGE_3_DAG_CONTROL_PLANE_ARCHITECTURE_REVIEW.md)=`Approved`、[ADR-0006](./ADR/0006-stage-3-dag-control-plane-and-git-controller.md)=`Accepted`。用户确认在accepted Stage 2/Increment 11 candidate上增加immutable `TaskGraphRevision`、generic `Approval`、structured write scope、one-shot reconcile Scheduler和preview-confirm-execute Git Controller；Scheduler只物化ready Task/Run，不启动process或执行Git write。

确认拆分：Increment 12先交付Graph/Approval/Scheduler、`per_task` acceptance与existing-worktree dispatch，零Git write；Increment 13再交付managed worktree、三个Git operation和`integration_only`。Accepted v0.4 source先版本化并保持active v0.3，Stage 3使用fresh `0.5-design`并在整体接受后单次cutover。Fix Review 5确认九个失效链接已闭合；派发门禁随后确认原task已存在字段完整的Fix Task 4 `final_answer`，唯一result finding失效、Decision更正为`approved`。[Fix Task 5](./INCREMENT_12_FIX_TASK_5.md)未派发并已`Superseded`。用户已最终接受Increment 12，阶段=`ACCEPTED`；accepted source已进入版本化`main`，整体runtime cutover随后于2026-09-02完成。

用户于2026-09-02确认[Increment 13 Git Controller Architecture Review](./INCREMENT_13_GIT_CONTROLLER_ARCHITECTURE_REVIEW.md)三项推荐及[Increment 13完整Task Contract](./INCREMENT_13_TASK_CONTRACT.md)：fixed `local-runner` actor的one-shot `room:git` CLI；existing allowlist下的single fast-forward lineage；保持v0.3 active并使用独立Codex worktree task完成candidate。Implementation Review `review-increment-013-codex-001`的四项finding已进入Accepted [Fix Task 1](./INCREMENT_13_FIX_TASK_1.md)，Fix Review 2的三项test/result evidence finding已由Accepted [Fix Task 2](./INCREMENT_13_FIX_TASK_2.md)闭合。Fix Review 3 `review-increment-013-codex-003`无finding、Decision=`approved`；用户已明确最终接受，阶段=`ACCEPTED`。完整accepted source由本次提交进入版本化`main`；GitAction与runtime写入仍未授权。

### 增量 14 — Validation Ownership 与 Internal Invariant Simplification（Candidate）

状态：用户于2026-09-03确认[Increment 14完整Contract](./INCREMENT_14_TASK_CONTRACT.md)并授权独立Codex Coding、单一commit与任务分支push。candidate从`start_head=ee3cd96315ed0c14220692c3bc92d6ecaff7430a`形成，当前阶段=`REVIEW_REQUIRED`；尚未Review或接受。

目标：公开协议、SQLite Schema、状态机、权限、CLI/MCP输出及外部失败语义不变；原始输入只在CLI/MCP等真实边界校验，typed内部调用链信任TypeScript、原子生命周期、`BEGIN IMMEDIATE`与SQLite约束。删除内部对象二次Zod parse和public lifecycle不可达分支，简化Attempt settlement与GitAction reservation，并让late progress以`false`表达已知竞争。

非目标：Snapshot性能、Service拆分、Setup/Plugin清理、UI文案、协议/Schema/error code变更、新抽象、fallback、自愈、retry或迁移。

验证：`npm run typecheck`通过；Contract focused suites 175/175通过；`npm test` 384/384通过。最终Git与文档检查在交付提交前后执行。

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

Increment 1–13 accepted source与Stage 3 planning已由commit `004969190215e354fc468e824d9c5e798f01e4fc`进入版本化`main`。经独立授权，active runtime已完成v0.3→v0.5 cutover；新Room `room-3f6e8b05-4c60-4114-a09a-0ab44f0ccca0`处于`DISCUSSION`且execution entities为空。下一规划动作必须由用户另行明确，不因setup自动进入Architecture Review。真实项目GitAction、push、Plugin reinstall、旧database删除与cutover文档提交仍分别授权。

### Increment 13 Accepted Source（Versioned）

- 从clean exact baseline `c7b4c2db0095632194940df40b49e0788257f099`完成typed `GitAction`、generic Approval consumer、fixed `local-runner` one-shot `room:git`、single reservation/crash settlement以及`create_worktree | commit_paths | integrate_fast_forward`。
- `integration_only`实现唯一terminal integration node、single fast-forward lineage、component policy acceptance/commit/dependency gate、terminal Review/acceptance与final ff derived completion。
- source、tests、Plugin workflow与权威文档已通过Fix Review 3并获用户最终接受，由commit `004969190215e354fc468e824d9c5e798f01e4fc`版本化；active runtime/database/binding随后经独立授权切换到v0.5。尚未执行项目GitAction、Plugin reinstall、push或旧database删除。
