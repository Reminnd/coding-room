# Agent Room 运维手册

> 状态：Current
> 维护者：Codex（项目文档编写者及维护者）
> 最后维护日期：2026-08-30
> Last maintained review：`review-increment-009-codex-005`

本手册面向本机 operator，集中说明当前可用接口、组件结构、验证命令、状态与制品位置以及失败检查路径。协议字段和完整 transition 以 [ROOM_PROTOCOL.md](./ROOM_PROTOCOL.md) 为准，长期架构以 [ARCHITECTURE.md](./ARCHITECTURE.md) 为准；本手册不建立平行权威。

## 1. 当前运维基线

| 项目 | 当前事实 |
|---|---|
| Runner integration commit | `e8f0da6db9f3f4ff426355fa1a84d19bae4db9f2`；已进入 `main` |
| Accepted Scaffold source commit | `eb3637b642aaa88e1faab51a570c6fea688c3cf9`，保留于 `codex/increment-003-scope-scaffold` |
| Integration 状态 | Review 1 的四项 finding 已修复；Review 2 `approved`、用户已接受；commit 已 fast-forward 集成到 `main` |
| Runtime readiness | Protocol/Room domain、只读 Git Observer 与 central Runner TypeScript API 已在 `main` |
| Service readiness | Room server、MCP、Status CLI与one-shot `room:run`均已进入版本化 `main`；不包含 daemon manager、scheduler或automatic wakeup |
| Increment 6 | 用户已接受并进入版本化`main`；planning coordination tools、one-shot Runner CLI与failure retry为Current capability |
| 可执行验证 | Codex独立`npm run typecheck`与focused 95/95通过；Claude Coding Result报告全量242/242通过 |

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

artifact 写入 `.agent-room/artifacts/<run-id>/stdout.jsonl` 与 `stderr.log`，`artifact_refs` 使用 repository-root-relative path。Runner由`room:run` package script提供显式one-shot launcher；真实Claude smoke仍需用户明确授权，自动化验证使用fake-process fixture。

Current `main` baseline 的 `runClaude(input)` 已从 SQLite lineage（`getContinuationContext`）推导 mode/session/baseline，用 `observeContinuation` 对 continuation 执行 dirty-allowed、exact-HEAD gate，并以 `finalizeNeedsDecision` 持久化 pause evidence 与 `run_paused` Event。Increment 5、Fix Task 1 与 test-only [Fix Task 2](./INCREMENT_5_FIX_TASK_2.md) 已完成 Coding、Review、用户接受与版本化提交；三项 direct regression Oracle 已闭合。

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

Runtime 固定监听 `127.0.0.1`，显式接收 `--db <path> --project <path> --port <1..65535>`，并暴露 `/mcp/codex` 与 `/mcp/claude`；read-only Status CLI 显式接收 `--db <path> --room-id <id>`，且 missing database path 失败而不创建空 database。Current package scripts为`room:serve`、`room:status`与one-shot`room:run`。

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

### 4.2 Increment 5 Current implementation

[Increment 5 Accepted Contract](./INCREMENT_5_TASK_CONTRACT.md)、[Increment 5 Fix Task 1](./INCREMENT_5_FIX_TASK_1.md) 与 test-only [Increment 5 Fix Task 2](./INCREMENT_5_FIX_TASK_2.md) Coding 均已完成。Review `review-increment-005-codex-003` 无 finding，Decision 为 `approved`；用户已明确接受并另行授权提交完整 accepted scope。以下现为版本化 `main` 的 Current application behavior：

- Runner在 durable Question使 Room进入 `NEEDS_DECISION` 后，用 `finalizeNeedsDecision` 对同一 Run持久化 pause evidence（`claude_session_id`、`process_exit_code`、result/failure、`git_evidence`、`artifact_refs`、`completed_at`）并追加 `run_paused` Event；`answerQuestion` 在 pause finalization 完成前拒绝（answer-before-pause gate）。
- contract内 Decision与 Review-confirmed Fix经 `getContinuationContext` 从 SQLite lineage（answered Question / Review 引用的 reviewed Run）推导 exact session/baseline，`runClaude` 据此 resume；continuation 用 `observeContinuation`（dirty-allowed）保留既有 worktree changes 并只读验证 owning repository 的 `HEAD` 等于 inherited baseline。
- continuation继续复用 current `runClaude` process/stream/artifact/Git pipeline，不增加 MCP tool、package script、Runner CLI、daemon或 scheduler；failure 边界沿用既有 `claude_start_failed`/`claude_exit_failed`/`git_evidence_failed`/`artifact_write_failed` 单一 terminal settlement。

Review 3 证据：同一 fake process 中 Question 前 recognized progress 产生恰好一个 sequence 更小的 `run_progress`，Question 后 recognized progress 不再新增该 Event；answer 后 same-payload retry 与 different-payload conflict 分别对完整 Run/Question/Room/Event/cursor snapshot 保持 `deepEqual`；baseline mismatch 对 Room/Event/cursor 零副作用且零 spawn、零 Run、零 artifact。typecheck、聚焦 82/82、Git/MCP/Scope 45/45 与全量 207/207 均独立通过。用户已接受，完整 accepted scope 已进入版本化 `main`。

在Increment 5接受时，repository没有Room runtime database、Room initialization或Runner launcher command；该历史边界已由Increment 6的one-shot`room:run`替代。repository仍不内置runtime database，真实Claude smoke、push与其它Git写操作保持独立授权门禁。

### 4.3 Increment 6 Historical 运维流程

[Increment 6 Accepted Contract](./INCREMENT_6_TASK_CONTRACT.md) 规划的以下显式operator flow已完成clean-baseline re-execution与Fix Task 1（dispatch `HEAD`=`7ac639a30ab2a94170ef69498e065fb16e77f833`）、通过Codex Review、获用户接受并进入版本化`main`。这是v0.2历史流程，active v0.3操作见§4.6：

1. operator先独立启动现有`room:serve`，使用实际`/mcp/codex`创建Room、推进planning并提交Task；Current surface新增四个tools：`room_create`、`room_begin_architecture_review`、`room_request_user_confirmation`、`room_retry_run`。
2. 每次需要Coding时显式运行一次：

   ```text
   npm run room:run -- --db <existing-db> --project <git-worktree> --task-id <task-id> --run-id <run-id> --mcp-url http://127.0.0.1:<port>/mcp/claude [--baseline-head <full-head>]
   ```

   `--baseline-head`只用于首次new Implementation；Decision/Fix/retry从SQLite source Run继承。command不创建database/Room、不启动server、不自动运行下一Task。
3. Current CLI固定传入`agent_room` HTTP MCP config与`alwaysLoad=true`。durable succeeded/needs-decision输出`{room, run}`并exit 0；durable failed仍输出结果但exit 1；preflight或unsettled error写stderr并non-zero。
4. `room_retry_run`只记录现有`RUN_FAILED → PLAN_READY` decision。随后再次显式执行`room:run`：保留dirty worktree并校验unchanged inherited HEAD；source session存在时exact resume，不存在时同一Task lineage启动replacement session。

re-execution已闭合Review 1的dispatch baseline、CLI route/database/main wiring与coordination-tool public evidence。[Increment 6 Fix Task 1](./INCREMENT_6_FIX_TASK_1.md)又补齐missing/non-failed/non-terminal current-task source的Runner direct regression；旧Task failed Event对新current Task按无source的new Implementation处理，stale caller仍拒绝。Review `review-increment-006-codex-003`无finding、Decision为`approved`；用户已明确接受并另行授权提交完整accepted scope。operator现可在自行提供并启动本地Room runtime后显式使用`room:run`；本次版本化未执行runtime初始化或真实Claude smoke，push、stash删除和其它Git写操作继续分别授权。

### 4.4 Increment 7 Historical Plugin 与多项目配置

用户已确认[Increment 7 Accepted Contract](./INCREMENT_7_TASK_CONTRACT.md)全部内容；以下为已进入版本化`main`的v0.2历史runbook，active v0.3 binding与route见§4.6。严格重执行从clean documentation baseline的exact `HEAD`（`b9ebeffdcc8dd9c34718111b50fa3605a21ad17e`）派发；Review 2四项finding已形成Accepted [Fix Task 1](./INCREMENT_7_FIX_TASK_1.md)，Fix Coding已完成。[Fix Task 2](./INCREMENT_7_FIX_TASK_2.md)已完成Coding；Review 4因Skill front matter不是合法YAML而`changes_requested`：

1. Agent Room Plugin安装一次，只提供共享Skill。Project A/B各自保存project-scoped `.codex/config.toml`：

   ```toml
   [mcp_servers.agent_room]
   url = "http://127.0.0.1:<project-port>/mcp/codex"
   ```

2. 每个项目另有被Git忽略的`.agent-room/runtime.json`，Accepted字段为：

   ```json
   {
     "agent_room_root": "<absolute-agent-room-root>",
     "database_path": "<absolute-project-database-path>",
     "project_path": "<absolute-project-worktree-path>",
     "port": 43117,
     "room_id": "<project-room-id>"
   }
   ```

3. operator分别启动A/B的`room:serve`，端口、database、project path/worktree与Room必须不同。Codex通过各项目MCP读取和推进各自Room；需要Coding时只构造一次exact`room:run`。
4. Plugin workflow固定由Codex发起该command，host内部审批模式固定为UI“帮我批准”（`approvals_reviewer=auto_review`）。`auto_review`通过时Codex执行一次；拒绝时停止并报告，不claim Run、不改用operator direct run。Plugin不创建、修改或放宽active approval/rule；Current CLI的人工可调用性不作为本workflow步骤。
5. 首次Implementation必须在首次成功`room_submit_task`返回non-null`observed_baseline_head`时生成exact command；该值未持久化到Room snapshot，后续丢失时不得用live HEAD猜测。Decision/Fix/retry仍不传caller baseline。
6. planned`run_id`在command展示、approval与执行间保持不变；执行结果不确定时先读取Room，不生成第二个ID自动重试。
7. A/B可同时运行各自Claude process；同一Room仍只允许一个active Run。Run返回后Codex重新读取对应Room state，不自动调度后续Run。

Plugin Coding与自动化测试仍使用fake-process boundary。实现通过Review后，manual Codex Desktop smoke才验证“Codex发起 + `auto_review`审查 + one-shot Run + 重新读取Room”；`auto_review`拒绝或runtime未准备好时结果保持pending，不改用operator direct run，也不虚报通过。

实现状态（Current，2026-08-27）：Fix Task 1已修正marketplace、status、baseline、run identity、setup、approval与durable reread。Fix Task 2已正确加入answered `NEEDS_DECISION` continuation并报告packaging 18/18及全量261/261通过；Review 4独立标准YAML解析因`description`中的未引用`binding: validate`失败，证明局部parser未验证真实YAML scalar规则。用户已确认finding与最小方案，[Fix Task 3](./INCREMENT_7_FIX_TASK_3.md)已完成Coding；Review `review-increment-007-codex-005`独立验证标准YAML解析、packaging 18/18、two-project 1/1、scope 1/1、typecheck与全量261/261均通过，无finding，Decision为`approved`，用户已明确接受，已进入版本化 `main` commit `97005f54555f6485c79f15860a58fe79c3ed593d`。manual Codex Desktop smoke保持pending，Plugin与多项目配置现为Current command。

### 4.5 Increment 8 Historical automatic setup

> 状态：Historical / Superseded by §4.6。以下是[Increment 8 Accepted Contract](./INCREMENT_8_TASK_CONTRACT.md)的v0.2五字段版本化runbook，仅保留为迁移背景，不得用于当前project binding。

1. operator对当前项目显式请求setup，并首次提供一次absolute `agent_room_root`。setup验证该runtime root与existing`room:serve`/`room:run`，自动解析当前`project_path`。
2. setup自动生成`database_path=<project>/.agent-room/room.sqlite`、OS-assigned loopback `port`与`room_id=room-<UUID>`，保守建立五字段`.agent-room/runtime.json`、project-scoped `.codex/config.toml`与所需`.gitignore`条目。
3. existing runtime/config conflict、mismatch或invalid root必须在写入前停止。valid rerun复用identity；binding port已开放时不启动第二个process，关闭时启动一次existing`room:serve`。approval拒绝或bind失败保留binding并报告`service_start_pending`。
4. Skill报告Codex Desktop reload required并停止。reload后operator显式继续setup；Skill只通过当前project-scoped MCP调用existing`room_create`与`room_get_state`，验证exact Room处于`DISCUSSION`。
5. setup完成后停止，不调用`room:run`、不启动Claude、不修改Git或host policy。真实service/runtime setup smoke仍未运行；consumer routing evaluation不替代该operator-run smoke。
6. 实现状态（Current，2026-08-28，`ACCEPTED`）：Fix Task 2已收窄top-level ownership判断并补public CLI regression；Fix Review 3 `review-increment-008-codex-003`确认代码无finding，focused setup 12/12、packaging 20/20、scope 1/1、typecheck及full test glob通过。用户授权后，candidate已从`agent-room-local`安装为`0.1.0`，fresh tasks中的direct/indirect setup、missing-binding normal workflow、unsupported request与bundled helper/reference resolution全部通过，Decision为`approved`，且用户已明确最终接受；完整accepted scope已由commit `8428046dded5f7542690735b3df8a5c5490e8090`进入版本化`main`。manual service/runtime setup smoke仍未运行，不影响Current automatic setup capability。

### 4.6 Protocol v0.3 Stage 1 Current runtime

> 状态：Current。v0.3 source已进入版本化`main`并于2026-08-30完成独立授权的active project database/binding cutover；§4.4–4.5保留历史与通用setup背景，当前实际binding以本节为准。

当前project-local runtime：

| 项目 | Current值 | 验证与失败动作 |
|---|---|---|
| v0.3 database | `D:\agent\case\codex-claudecode-room\.agent-room\room-v0.3.sqlite`，exact protocol metadata=`0.3-design` | schema/version不exact时停止，不回落或改写旧database |
| archived v0.2 database | `D:\agent\case\codex-claudecode-room\.agent-room\room.sqlite`，由`archived_database_path`引用 | 只读保留；不迁移、不backfill、不删除、不由v0.3 writable service打开 |
| runtime binding | exact八字段；`port=59665`、`room_id=room-ebfafef2-f0e9-4fb1-9eef-ac5adef7445f`、`control_participant_id=codex-app` | extra/missing field、path/port/version/identity mismatch立即停止，不猜测替代值 |
| project MCP | `http://127.0.0.1:59665/mcp/participants/p~codex-app` | 必须与runtime exact匹配；不得用raw HTTP、unframed route、v0.2 route或其它project MCP绕过 |
| Room | `room-ebfafef2-f0e9-4fb1-9eef-ac5adef7445f`，state=`ACCEPTED`，waiting actor=`null` | `room_get_state`返回identity不一致或错误时停止；terminal Room不接收新Task，不创建第二Room规避既有binding门禁 |
| default authority | codex-app→planner/reviewer/orchestrator；claude-code-cli→worker；local-runner→executor | Participant/Assignment缺失或不一致时停止，不推进workflow |

Cutover成功证据：八字段runtime与config URL通过exact校验，loopback service已监听，project-scoped MCP加载成功；`room_get_state`返回同一Room identity、完整默认Participant/Assignment，Task/Run/Review/Question均为空。setup未创建重复Room，也未启动Claude Run或删除旧v0.2 database。随后经逐项授权完成Increment 10 Implementation、Fix与Review workflow；用户最终接受后Room进入`ACCEPTED`。

Current操作边界：

- Room service仍是operator控制的本地process，不新增service manager、自动重启或health scheduler。端口关闭时按Agent Room Skill的setup/normal-workflow门禁处理，不启动第二实例绕开冲突。
- Current Room=`ACCEPTED`且waiting actor=`null`；不得向该terminal Room提交新Task。后续规划需要新的planning Room/binding与独立授权，不能复用或改写该Room终态。
- `room:run`仍是one-shot、operator-approved边界；只有`PLAN_READY`、`FIX_PLAN_READY`或合法Decision continuation允许计划一次调用。cutover授权本身不授权Claude Run。当前command形态为：

  ```text
  npm --prefix "<AGENT_ROOM_ROOT>" run room:run -- --db "<DATABASE_PATH>" --project "<PROJECT_PATH>" --task-id "<TASK_ID>" --run-id "<RUN_ID>" --mcp-url "http://127.0.0.1:<PROJECT_PORT>/mcp/participants/p~claude-code-cli" [--baseline-head "<OBSERVED_BASELINE_HEAD>"]
  ```

  `--baseline-head`只用于首次new Implementation，并且只能来自同一次首次成功`room_submit_task`返回的`observed_baseline_head`；Fix、retry与Decision resume省略该参数。
- v0.3 binding、`.gitignore`和本次Current文档属于working-tree变更；stage、commit、push、旧database删除与detached v0.2 launcher cleanup继续分别授权。
- binding/config mismatch、Room identity mismatch、service不可达或MCP error均停止并报告；不使用direct SQLite、raw HTTP、旧route、另一project binding或live Git HEAD作为fallback。

### 4.7 Stage 2 v0.4 accepted candidate 运维视图（2026-08-31，未cutover）

> 状态：Accepted candidate。Increment 10最终Fix Review `review-increment-010-codex-003`无finding、Decision=`approved`，用户已最终接受且durable Room=`ACCEPTED`。§4.6的Current v0.3 runtime与command shape保持权威；本节不授权版本化、v0.4 cutover、旧database处理或Git写操作。

- candidate binding：fresh setup生成`room-v0.4.sqlite`、`protocol_version=0.4-design`、`archived_database_paths: []`；v0.3 binding migration把旧database按`[v0.2, v0.3]`顺序归档且逐byte保留；v0.2/v0.3 database不原地改写、不删除。
- candidate `room:run` command shape（每个RunAttempt一次）：

  ```text
  npm --prefix "<AGENT_ROOM_ROOT>" run room:run -- --db "<DATABASE_PATH>" --project "<PROJECT_PATH>" --run-id "<RUN_ID>" --attempt-id "<FRESH_ATTEMPT_ID>" --mcp-url "http://127.0.0.1:<PROJECT_PORT>/mcp/participants/p~claude-code-cli"
  ```

  不再携带`--task-id`或`--baseline-head`；worktree/baseline由Run首个attempt冻结并由后续attempt继承。
- candidate `room:status`输出`planning_waiting_actor`与per-Run `run_work_items`（`run_id`/`run_status`/`waiting_actor`/`current_task_id`/`current_attempt_id`/`current_question_id`/`current_review_id`），不再输出单一`current_run`。
- Review stop conditions已满足：normal双connection claim不把`database is locked`暴露给operator；ready work item显示即将执行的latest Task；Attempt进入Review前具有与effective terminal status一致的union-shaped result/failure，empty/overlap形态在零写前拒绝。v0.4 cutover仍需独立授权。
- candidate运维动作：`room_retry_run`回到`ready`后由下一`room:run`继续；`room_cancel_run`（需`confirmed_by_user`）把Run与active attempt置`cancel_requested`，Executor结算`canceled`；`room_add_run_guidance`只在Run无active attempt时接受，由下一attempt claim恰好消费一次。
- cutover/rollback门禁：Codex Review与用户接受已经满足；v0.4 cutover仍需独立授权。此前不得把binding切到v0.4、删除v0.2/v0.3 database或对candidate worktree执行Git写操作。
- Fix acceptance（2026-08-31）：Fix Task 1修复writer reservation、canonical terminal evidence与latest Task推导；Fix Task 2显式拒绝effective `needs_decision` empty evidence并保留两种合法形态。Fix Review `review-increment-010-codex-003`与full 353/353已通过，用户最终接受。
- 后续Approved运维方向：[哈希校验删除规划](./HASH_VALIDATION_REMOVAL_PLAN.md)与[ADR-0005](./ADR/0005-remove-git-baseline-hash-validation.md)已确认删除`baseline_head`/HEAD equality与`git_head_missing`；first attempt仍要求clean canonical Git worktree，continuation只校验canonical worktree而不拒绝branch/commit drift。Increment 11尚未实现，因此当前可执行命令与runtime contract不变。

### 4.8 Increment 11 Codex Coding dispatch（Accepted Contract）

- Coding不使用Agent Room terminal v0.3 Room或Claude `room:run`；用户指定独立Codex project task，model=`gpt-5.6-sol`、reasoning effort=`medium`。
- [Increment 11 Contract](./INCREMENT_11_TASK_CONTRACT.md)全文已确认；task创建仍需独立授权。
- 当前root worktree包含未提交的Increment 10 accepted candidate与planning docs。dispatch前必须另行授权版本化这些scope并确认clean exact `main` baseline；不得直接在dirty root上叠加新Implementation后把混合Diff交付Review。
- clean baseline形成并获得task创建授权后，Codex App使用saved project `codex-claudecode-room`创建独立worktree task；prompt完整注入Accepted Contract，不使用摘要。
- Coding task不得commit、push、merge、rebase、reset、clean、checkout或cutover。完成后由root Codex检查完整task-owned Diff与verification，再进入Review discussion。

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
| 执行一个 Runner Run | `npm run room:run -- ...` | Available（one-shot；要求既有database与已启动的Room service） |

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
5. 当前没有 service restart、database backup/restore或health probe；Increment 8 Accepted target只包含setup-time loopback port probe，不是Current health capability。one-shot Runner与failure retry已进入版本化`main`；retry仍由operator先调用`room_retry_run`，再显式执行一次`room:run`，不存在automatic retry或background scheduler。

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
| `review-increment-005-codex-001` | `changes_requested` / finding 与 solution 已确认 | pause 后 progress 可阻断 finalization；answer 后 finalization retry 失去幂等；HEAD drift regression 可能启动真实 Claude | [Fix Task 1](./INCREMENT_5_FIX_TASK_1.md) 已 Accepted并完成 Coding；见 Review 2 |
| `review-increment-005-codex-002` | `changes_requested` / finding 与 solution 已确认 | 三项实现修复正确且 full suite 为纯 fake-process 207/207；Fix regression 对同一 stream progress 分界、answer 后完整 durable snapshot、baseline mismatch 零副作用的直接 Oracle 不完整 | [Fix Task 2](./INCREMENT_5_FIX_TASK_2.md) 已 Accepted并完成 Coding；见 Review 3 |
| `review-increment-005-codex-003` | `approved` / 用户已接受并授权提交 | 三项 Contract-named test Oracle 均闭合；无 source/protocol/state/schema/Event/dependency变化 | 完整 accepted scope 已进入版本化 `main`；continuation 为 Current application capability |
| `review-increment-006-codex-001` | `changes_requested` / 用户已确认 findings 与方案 | `room:run` 接受错误loopback route并会初始化既存空database；CLI main、四个新增MCP tools与retry negative matrix的direct evidence不完整；dispatch未形成clean documentation baseline | 用户选择在clean documentation baseline上重新执行原Task；re-execution candidate已完成并验证（16/16、126/126、30/30、239/239），仍unavailable，等待新Review |
| `review-increment-006-codex-002` | `changes_requested` / solution已确认 | Review 1多数缺口已闭合；retry仍缺missing/non-failed/non-terminal current-task source direct regression；旧Task Event语义已确认为new current Task无source | [Fix Task 1](./INCREMENT_6_FIX_TASK_1.md)已Accepted；保持candidate unavailable，等待用户人工派发 |
| `review-increment-006-codex-003` | `approved` / 用户已接受 | 三类current-task损坏source已由`runClaude` direct regression闭合；既有guard正确，production source零改动 | Codex独立typecheck与focused 95/95通过；candidate等待版本化提交 |
| `review-increment-007-codex-001` | `changes_requested` / findings与方案已确认 | Skill launcher漏用`agent_room_root`；clean documentation baseline未形成；Task/Review/Question isolation direct evidence不完整 | 不生成Fix Task；首轮candidate已隔离，严格重执行从clean exact baseline（`b9ebeffd`）完成并闭合三项finding（249/249）；candidate待Review 2；不执行manual paid smoke |
| `review-increment-007-codex-002` | `changes_requested` / findings与方案已确认 | marketplace schema无效；Skill state/status入口与首次baseline authority错误；完整workflow/setup缺失 | [Fix Task 1](./INCREMENT_7_FIX_TASK_1.md)已`Accepted`，当前`FIX_PLAN_READY`；用户选择暂时人工派发，不执行manual paid smoke |
| `review-increment-007-codex-003` | `changes_requested` / findings与方案已确认 | 唯一Skill缺少YAML front matter；Decision answer(false)后durable `NEEDS_DECISION` resume被Skill自身ready-state gate阻断 | [Fix Task 2](./INCREMENT_7_FIX_TASK_2.md)已`Accepted`/`FIX_PLAN_READY`；用户人工派发，保持Plugin unavailable且不执行manual paid smoke |
| `review-increment-007-codex-004` | `changes_requested` / finding与方案已确认 | Decision resume gate已闭合；Skill front matter的未引用colon-space使标准YAML解析失败，packaging局部parser误报18/18通过 | [Fix Task 3](./INCREMENT_7_FIX_TASK_3.md)已`Accepted`；随后完成Fix Coding并进入下一次Review，保持Plugin unavailable且不执行manual paid smoke |
| `review-increment-007-codex-005` | `approved` / 用户已明确接受 | Fix Task 3已将description改为合法JSON-compatible double-quoted YAML scalar，并让packaging Oracle拒绝未引用colon-space；独立回归与scope/ancestry核对无finding | `main` commit `97005f54555f6485c79f15860a58fe79c3ed593d`；Plugin与多项目配置为Current capability，manual paid smoke仍未授权 |
| `review-increment-008-codex-001` | `changes_requested` / findings与方案已确认 | helper遗漏standard TOML dotted-key binding并发生非零写入；actual installed-plugin Skill consumer evaluation未运行 | [Fix Task 1](./INCREMENT_8_FIX_TASK_1.md)已`Accepted`/`FIX_PLAN_READY`；保持automatic setup candidate，等待人工派发，consumer evaluation需另行授权 |
| `review-increment-008-codex-002` | `changes_requested` / 等待用户确认 | top-level冻结dotted-key回归已闭合；classifier丢失TOML table context，误把unrelated table内嵌套同名key当作project binding；actual installed-plugin consumer evaluation仍为`not_run` | 保持automatic setup candidate并进入`REVIEW_DISCUSSION`；确认方案前不生成Fix Task，consumer evaluation仍需单独授权 |
| `review-increment-008-codex-002` solution | finding与方案已确认 | 运维目标不变；只收窄helper的top-level TOML ownership判断，actual consumer仍pending | [Fix Task 2](./INCREMENT_8_FIX_TASK_2.md)已`Accepted`/`FIX_PLAN_READY`；等待人工派发或另行执行授权，不安装/reload Plugin |
| `review-increment-008-codex-003` | `approved` / 用户已最终接受 / `ACCEPTED` | table-context修复与public CLI regression闭合，自动化验证全部通过；授权后的actual installed-plugin consumer evaluation覆盖direct/indirect/negative/boundary routing与bundled resource resolution并通过 | commit `8428046dded5f7542690735b3df8a5c5490e8090`已将automatic setup纳入Current；manual smoke、service/runtime setup、Claude与push仍未授权 |

| `review-increment-009-codex-002` | `changes_requested` / solution confirmed / Fix Task 2 Accepted | Fix Run成功且既有tests为green；direct probes确认production Runner固定executor、Task-scope reviewer acceptance错误、replacement retry失效、historical orchestrator残留authority与control binding identity不一致 | [Fix Task 2](./INCREMENT_9_FIX_TASK_2.md)已进入`FIX_PLAN_READY`；不cutover，本次未授权Run |
| `review-increment-009-codex-003` | `changes_requested` / solution confirmed / Fix Task 3 Accepted，Fix Coding完成（candidate，`REVIEW_REQUIRED`） | Fix Task 2五项finding已闭合，独立验证全部通过；公开schema允许`worker/2`等opaque identity，但raw participant route为404，encoded route被Runner/CLI exact comparison拒绝 | [Fix Task 3](./INCREMENT_9_FIX_TASK_3.md) Fix Coding完成：canonical single-segment encoding + `worker/2`的MCP/Runner/CLI direct regression（claude-runner 49/49、runner-cli 15/15、room-mcp 38/38、scope 1/1、full 314/314）全部通过；等待Fix Review 4，不cutover、不accept、不执行Git write |
| `review-increment-009-codex-004` | `changes_requested` / solution confirmed / Fix Task 4 Accepted，Fix Coding完成（candidate，`REVIEW_REQUIRED`） | Fix Task 3对`worker/2`的single-segment encoding与Runner/CLI gate正确；但schema允许`.`/`..`且`encodeURIComponent`保留dot，WHATWG URL parser把participant path归一化为当前/父路径，合法Participant不可达 | [Fix Task 4](./INCREMENT_9_FIX_TASK_4.md) Fix Coding完成：所有participant routes统一为`p~` + `encodeURIComponent(raw id)` framing，MCP只移除一次prefix恢复raw authority，unframed POST 404；`.`/`..`/`worker/2`的MCP/Runner/CLI/setup direct regression（room-mcp/claude-runner/runner-cli 108/108、plugin-setup/plugin-packaging 35/35、E2E 12/12、scope 1/1、full 321/321）全部通过；等待Fix Review 5，不cutover、不accept、不执行Git write |
| `review-increment-009-codex-005` | `approved` / 无finding / 用户已最终接受 | Fix Task 4固定`p~` framing在MCP、Runner、CLI、setup与Plugin consumer中保持raw identity/authority；unframed route在副作用前拒绝 | 独立typecheck、focused 108/108、35/35、12/12、scope 1/1与full 321/321通过；Room=`ACCEPTED`，经验回收完成；不cutover、不执行Git write |
| `review-increment-010-codex-001` | `changes_requested` / findings与方案已确认 | 真实双connection claim泄漏SQLite lock；terminal evidence允许矛盾shape；ready snapshot未引用latest Task | [Fix Task 1](./INCREMENT_10_FIX_TASK_1.md)闭合三项finding；不cutover、不执行Git write |
| `review-increment-010-codex-002` | `changes_requested` / finding与方案已确认 | effective `needs_decision`仍接受`result=null + failure=null`并产生durable写入 | [Fix Task 2](./INCREMENT_10_FIX_TASK_2.md)增加最小guard与public rollback regression |
| `review-increment-010-codex-003` | `approved` / 无finding / 用户已最终接受 | union-shaped evidence、public path、rollback、atomic claim与current Task语义全部闭合 | 独立typecheck、focused suites与full 353/353通过；Room=`ACCEPTED`，经验回收完成；未版本化、未cutover、未执行Git write |

后续每次 Review 调用 `backend-doc-authoring` skill，并按 [Codex 项目文档编写与维护指南](./agent-guides/CODEX_DOCUMENTATION_AUTHORING.md) 审计；存在运维影响时更新本节，无影响时在 Review Verification Summary 报告 `documentation: no_change`。
