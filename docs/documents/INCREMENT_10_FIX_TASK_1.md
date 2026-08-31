# Increment 10 Fix Task 1 — Claim Serialization、Terminal Evidence 与 Current Task

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（仅在本文转为 `Accepted`、通过 `room_submit_task` 提交且用户另行授权 one-shot Fix Run 后） |
| 创建日期 | 2026-08-31 |
| Solution 确认日期 | 2026-08-31 |
| Contract 确认日期 | 2026-08-31 |
| Terminal evidence clarification 确认日期 | 2026-08-31 |
| Review ID | `review-increment-010-codex-001` |
| Parent Task | `increment-010-execution-core-multi-run` |
| Reviewed Run | `run-increment-010-implementation-007` |
| Lineage baseline | `1be0cc2e37aebf69234276ff88c5c95eb92f6495` |
| Target | `main` / `D:/agent/case/codex-claudecode-room` |

## 1. 结论与边界

本 Fix 只闭合 `review-increment-010-codex-001` 的三项 confirmed findings。用户已确认 finding、最小方向与本文完整 Fix Contract；本文现为可提交 Room、可测试的 `Accepted` Contract。提交 Fix Task 不授权启动 Run。

1. 同一 `ready Run` 的两个真实并发 claim MUST 在写事务进入 guard 前完成 writer serialization；恰好一个成功，loser 稳定返回 `run_already_active`，不得泄漏 `ERR_SQLITE_ERROR: database is locked`。
2. `settleRunAttempt` MUST 在 terminal target 确定后验证或 canonicalize `status/result/failure`，不得把无有效 `CodingResult` 的 success 写入 `review_required`；planner 已提交 cancel 时继续保持 cancel-wins。
3. `run_work_items.current_task_id` MUST 从目标 Run 的 latest Task 独立推导，不能依赖 latest Attempt；initial-ready 与 fix-ready 均必须返回即将执行的 Task。

### 1.1 用户确认的 `needs_decision` evidence clarification

用户于 2026-08-31 明确选择方案 1。该决定是 `inc10-r2-invalid-terminal-evidence` 的权威解释，并替代本文后续条款中把所有 effective `needs_decision` 都收窄为“必须携带 `CodingResult` 且 `failure=null`”的字面理解：

- result-carrying form：当 `result` 非空时，MUST 满足 `result.status=needs_decision`、`result.task_id=attempt.task_id` 且 `failure=null`；mismatched result 或 result/failure 并存 MUST 以 `validation_failed` 零写入拒绝。
- pause-failure form：existing accepted Executor 在 `decision_requested` 后收集 process/stream/Git/artifact evidence 失败时，MAY 以 `result=null`、non-null `failure` settle effective `needs_decision`。该形式保存“暂停后的证据收集失败”，不表示第二个业务 Decision result。
- 本 clarification 不修改 Executor classification、RunAttempt transition table、Question lifecycle、public command、schema 或 protocol version；`decision_requested → needs_decision` 仍是唯一相关 transition。

```yaml
task_id: increment-010-execution-core-multi-run-fix-001
room_id: room-ebfafef2-f0e9-4fb1-9eef-ac5adef7445f
type: fix
parent_task_id: increment-010-execution-core-multi-run
based_on_review_id: review-increment-010-codex-001

background: >
  Increment 10 continuation Run run-increment-010-implementation-007 已在lineage baseline
  1be0cc2e37aebf69234276ff88c5c95eb92f6495上完成candidate Coding并成功结算；Codex
  独立验证git diff check、typecheck与full 341/341通过。Review仍通过真实public probes确认
  三项缺陷：deferred BEGIN下两个SQLite connection同时通过active-attempt guard时，loser
  泄漏ERR_SQLITE_ERROR database is locked；settleRunAttempt接受succeeded + result=null +
  non-null failure并把Run推进review_required；ready Run的run_work_items.current_task_id
  因仅依赖latest Attempt而返回null，Fix Task提交后还会继续暴露旧Task。Review
  review-increment-010-codex-001已以changes_requested提交，Current v0.3 Room进入
  REVIEW_DISCUSSION。用户已确认三项finding与下述最小solution。

goal: >
  仅修复Review 1确认的claim writer serialization、terminal evidence一致性与per-Run current
  Task推导，使真实双连接claim稳定收敛为一个winner和一个domain loser，使Attempt terminal
  status与持久化result/failure相互一致，并使initial/Fix ready work item准确指向即将执行的
  Task；不改变Stage 2架构、public capability集合或其它已完成candidate行为。

confirmed_findings:
  - finding_id: inc10-r1-concurrent-claim-lock
    solution: >
      在claim guard执行前取得SQLite writer reservation；推荐把RoomService write transaction
      boundary切换为BEGIN IMMEDIATE，使竞争writer先串行化、loser在winner commit后重读durable
      state并返回run_already_active或worktree_already_owned。使用两个独立Worker/SQLite
      connection在调用public claimRunAttempt前通过测试侧barrier同时起跑，直接证明same-Run与
      same-worktree竞争不会泄漏raw SQLite error且loser零残留。
  - finding_id: inc10-r2-invalid-terminal-evidence
    solution: >
      在settleRunAttempt解析attempt并确定cancel override后的terminal target，再执行单一
      status/evidence一致性校验。succeeded只接受同Task completed CodingResult且failure=null；
      needs_decision的result-carrying form只接受同Task needs_decision CodingResult且failure=null；
      existing Executor的pause-failure form保留result=null与non-null failure。failed/interrupted
      只接受result=null与non-null failure。cancel_requested继续优先收敛为canceled，并把已
      作废的caller classification canonicalize为canceled/result=null/failure=null，以同一
      canonical payload参与terminal retry/conflict判断。
  - finding_id: inc10-r3-ready-current-task
    solution: >
      run_work_items.current_task_id直接来自latestTaskForRun(run_id)，current_attempt_id继续来自
      latestAttemptForRun；两条reference独立推导。增加initial Implementation ready与Fix Task
      ready的snapshot/MCP/Status direct regression，证明current Task存在且Fix不会暴露旧Task。

requirements:
  - 只修复上述三项confirmed findings；`review_fixes_only`。
  - RoomService的write transaction MUST在任何claim guard read之前取得SQLite writer reservation；推荐使用existing `tx` boundary的`BEGIN IMMEDIATE`，不得增加lock table、mutex service、retry loop、sleep/backoff或第二transaction authority。
  - 两个独立SQLite connection并发claim同一ready Run时 MUST恰好一个成功；loser MUST返回`run_already_active`，且不得创建loser Attempt、消费guidance、冻结错误worktree/baseline、改变Run/Room或追加Event。
  - 两个不同ready Runs并发claim同一canonical worktree时 MUST恰好一个成功；loser MUST返回`worktree_already_owned`并保持其Run ready、worktree/baseline为null、无Attempt/Event残留。
  - 不同canonical worktree的两个Runs继续允许真实时间重叠；writer serialization只覆盖短SQLite transaction，不得把process execution串行化。
  - 并发regression MUST在两个Worker/connection调用public `claimRunAttempt`前使用测试侧barrier同步起跑；不得用先后调用、repository直写或production test hook冒充concurrent public evidence。
  - `settleRunAttempt` MUST先保留existing terminal same-payload retry/id-conflict顺序，再对仍可settle的Attempt解析effective terminal target并验证canonical evidence；invalid payload抛出`validation_failed`且完整durable snapshot不变。
  - effective `succeeded` MUST要求`result.status=completed`、`result.task_id=attempt.task_id`且`failure=null`；缺失、wrong status、wrong task或non-null failure全部拒绝。
  - effective `needs_decision` 的 result-carrying form MUST要求`result.status=needs_decision`、`result.task_id=attempt.task_id`且`failure=null`；existing Executor在`decision_requested`后的pause-failure form MAY使用`result=null`与non-null `failure`。两种形式都只允许existing `decision_requested → needs_decision` transition，不新增terminal status或第二transition。
  - effective `failed|interrupted` MUST要求`result=null`与non-null `failure`；不得把completed/needs_decision result与failure terminal混存。
  - existing Attempt为`cancel_requested`时planner intent继续优先：caller的success/failure/decision classification作废，持久化与retry comparison使用canonical `canceled + result=null + failure=null`，其它session/process/Git/artifact evidence保持首次结算事实；只产生一个`run_attempt_canceled` Event。
  - terminal first-writer-wins、same canonical payload retry、different canonical payload`id_conflict`、conditional update与exactly-one terminal Event语义全部保持。
  - `run_work_items.current_task_id` MUST直接使用目标Run的latest persisted Task；`current_attempt_id`、Question与Review reference继续各自使用现有per-Run owner，不新增current pointer或schema字段。
  - initial Implementation Task提交后、首次claim前，ready work item MUST返回该Implementation Task；changes-requested Review提交Fix Task后、Fix attempt claim前，ready work item MUST返回Fix Task而不是prior Attempt Task。
  - shared snapshot、`room_get_state`与Status CLI MUST对上述ready states返回相同current Task；Plugin仍按Run选择动作，不新增Task参数或第二read model。
  - candidate文档 MUST把Review 1、confirmed solutions、Fix candidate与重新验证事实写为Draft/Candidate；修复和再次Review完成前不得继续宣称atomic claim已验收，不得把v0.4写成Current。

non_goals:
  - SQLite migration、新table/column/index、lock entity、daemon、scheduler、queue、automatic retry或cross-process lock service。
  - 修改Run/RunAttempt/Task/Question/Review/Guidance/Event schema、状态集合、transition table、MCP tool数量或protocol version。
  - 修改Executor/WorkerAdapter/process transport/stream interpreter、Claude prompt/session lineage、Git Observer、artifact layout或setup binding/archive格式。
  - 新provider adapter、dynamic registry、Stage 3 TaskGraph/Scheduler/Git Controller、worktree creation、same-worktree process parallel、live steer或Stage 4–6能力。
  - 把SQLite arbitrary long-lived external lock统一映射为domain conflict；本Fix只闭合Contract点名的正常并发claim transaction race。
  - 新dependency、package script、source module、generic validation framework、compatibility layer或feature flag。
  - 修改active v0.3 database/binding、执行v0.4 cutover、删除v0.2/v0.3 database或改写detached launcher。
  - stage、commit、push、merge、rebase、reset、restore、clean、checkout、stash删除或其它Git write。
  - 未经用户另行授权启动任何one-shot Fix Run。

architecture_decisions:
  - SQLite仍是claim与worktree lease的唯一authority；writer reservation只改变transaction begin mode，不增加新的lock owner。
  - writer transaction只串行化短durable mutation；不同worktree的Claude process仍在transaction commit后并发执行。
  - terminal evidence一致性属于`RoomService.settleRunAttempt` application boundary；schema保留字段shape，service基于effective target与current Attempt执行cross-field/membership validation。
  - `needs_decision`区分result-carrying business-decision evidence与result-null pause-failure evidence；该区分保持existing Executor/transition contract，不把pause-failure伪装成`failed|interrupted`或新的Question answer。
  - cancel-wins通过canonical canceled payload表达；被planner cancel作废的worker classification不成为第二terminal truth。
  - current Task已经由per-Run Task lineage唯一推导；复用`latestTaskForRun`，不新增`current_task_id`持久化字段或Event。

scope:
  - review_fixes_only
  - src/room/room-service.ts中的writer transaction begin、claim stable error路径与terminal evidence validation/canonicalization
  - src/room/repository.ts中仅在stable claim error mapping确有必要时的最小调整
  - src/room/state-snapshot.ts中的per-Run latest Task reference
  - tests/execution-core.test.ts中的真实双Worker/双connection same-Run与same-worktree concurrent claim regression
  - tests/room-service.test.ts中的terminal evidence matrix、cancel canonical retry/conflict与完整rollback regression
  - tests/room-state-snapshot.test.ts、tests/room-mcp.test.ts、tests/status-cli.test.ts中的initial-ready/fix-ready current Task direct evidence
  - tests/scope.test.ts中的existing allowed-path Oracle（仅在新Fix Contract/test path需要更新时）
  - docs/documents/ADR/0004-execution-core-run-attempt-and-concurrency.md、ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、OPERATIONS.md、DEVELOPMENT_LOG.md中的Review/Fix candidate同步

constraints:
  - 继承lineage baseline_head `1be0cc2e37aebf69234276ff88c5c95eb92f6495`；Fix continuation不得重新执行clean-worktree gate或丢弃当前task-owned dirty candidate。
  - target branch与actual HEAD保持`main`/lineage baseline，0 staged；当前37 modified与4 untracked implementation paths、Codex新增Fix Contract/index/status文档均须保留，不得覆盖、回滚、stage、清理或拆分。
  - Current coordination authority仍为protocol v0.3 Room `room-ebfafef2-f0e9-4fb1-9eef-ac5adef7445f`；本文顶层不增加target v0.4 `run_id`。Fix通过v0.3 `room_submit_task`提交后继承reviewed Run的baseline/session lineage。
  - 本Draft确认前不得调用`room_submit_task`；转为Accepted并提交后，Fix Run仍需用户另行授权fresh v0.3 Run ID，且不传`--baseline-head`。
  - 使用Node.js built-in `worker_threads`、`node:sqlite`、existing Zod/RoomService；不得新增dependency、package script、production test hook、sleep/backoff或非确定性多次重跑。
  - 并发Oracle使用测试侧literal expected error/status/Event，不得从production transition/index/error helper导入期望值。
  - invalid settlement每个场景在调用前保存完整public durable snapshot，失败后`deepEqual`；不得只断言error code或单个字段。
  - 如正确修复需要schema/database migration、新lock owner、public command变化、new module/dependency、cancel语义取舍变化、Stage 3–6能力、runtime cutover或任何Git write，停止并调用`room_ask_question`。

acceptance_criteria:
  - deterministic双Worker/双SQLite connection same-Run claim恰好一个success、一个`run_already_active`；无raw SQLite error，loser完整零残留。
  - deterministic双Worker/双SQLite connection same-worktree不同Run claim恰好一个success、一个`worktree_already_owned`；loser Run仍ready且无worktree/baseline/Attempt/Event写入。
  - different-worktree multi-Run process overlap与全部existing concurrency/lease regression保持通过。
  - running Attempt对`succeeded + result=null/non-completed/wrong-task/non-null-failure`均`validation_failed`且完整snapshot不变；合法completed result仍进入review_required。
  - decision_requested Attempt的result-carrying form只接受同Task needs_decision result且failure=null；existing pause-failure form接受result=null与non-null failure。failed/interrupted仍只保存failure而不保存result。
  - cancel_requested Attempt即使收到已作废的success/failure classification，也唯一settle为canonical canceled；same caller retry幂等，真实evidence差异仍`id_conflict`，terminal Event恰好一个。
  - initial-ready work item返回Implementation Task；fix-ready work item在claim前返回Fix Task；shared snapshot、MCP `room_get_state`与Status CLI结果一致。
  - typecheck、focused suites、scope与full regression全部通过；原341 tests不得删除、skip或弱化，新增Oracle直接覆盖public boundary。
  - candidate文档与实际Fix行为一致；active runtime仍为v0.3，v0.4未cutover，未执行Git write或旧database删除。

verification:
  - command: npm run typecheck
    detects: transaction、terminal payload helper、snapshot reference与Worker-based fixture之间的TypeScript contract drift。
    decision_if_failed: 只修复本Fix类型；不得使用any、ts-ignore、skipLibCheck、wrapper或新dependency。
  - command: node --test "tests/execution-core.test.ts"
    detects: 两个真实connection是否仍先后执行、same-Run/same-worktree loser是否泄漏database is locked、产生partial write，或different-worktree执行被错误串行化。
    decision_if_failed: 只修复RoomService transaction/index error boundary与deterministic test synchronization；不得增加lock service或retry loop。
  - command: node --test "tests/room-service.test.ts"
    detects: contradictory terminal evidence仍被接受、wrong Task result进入Review、cancel canonicalization破坏first-writer/retry/conflict/Event或invalid settle产生partial write。
    decision_if_failed: 修复`settleRunAttempt`最窄application boundary；不得改变状态机或Runner ownership。
  - command: node --test "tests/room-state-snapshot.test.ts" "tests/room-mcp.test.ts" "tests/status-cli.test.ts"
    detects: initial/Fix ready current Task仍为null/stale，或shared snapshot、MCP、Status CLI对同一Run产生不同reference。
    decision_if_failed: 只修复existing latestTaskForRun read path与direct fixtures；不得新增pointer/schema/second read model。
  - command: node --test "tests/protocol.test.ts" "tests/state-machine.test.ts" "tests/claude-runner.test.ts" "tests/worker-adapter.test.ts" "tests/e2e-workflow.test.ts"
    detects: Fix是否意外改变protocol shape、transition、Executor/adapter settlement、cancel/Question/Review/Fix lifecycle或session lineage。
    decision_if_failed: 只修复由本Fix引入的回归；正确修复需改变既有contract时返回needs_decision。
  - command: node --test "tests/scope.test.ts"
    detects: schema/migration/new module/dependency/Stage 3–6、active runtime或scope外文件是否进入Fix。
    decision_if_failed: 不放宽allowlist掩盖越界；移除越界修改或返回needs_decision。
  - command: npm test
    detects: focused修复是否破坏Stage 1 Current behavior或Increment 10其它candidate public lifecycle。
    decision_if_failed: 只修复task-owned regression；不得删除、skip或弱化既有assertion。
  - command: git diff --check && git status --short --branch
    detects: whitespace、staged/untracked/HEAD、Fix净新增path与candidate ownership drift。
    decision_if_failed: 不stage、清理、回滚或改写历史；只修复本Fix新增格式错误，归属不明时停止。

documentation_updates:
  - path: docs/documents/ADR/0004-execution-core-run-attempt-and-concurrency.md
    expected_change: 记录Review 1确认的deferred transaction缺陷、Fix candidate writer reservation与未cutover状态。
  - path: docs/documents/ARCHITECTURE.md
    expected_change: 把atomic claim candidate描述更新为经真实并发Oracle验证的writer-serialized transaction事实；Fix Review前保持Candidate。
  - path: docs/documents/ROOM_PROTOCOL.md
    expected_change: 补充claim stable loser与terminal status/evidence一致性、cancel canonical payload及current Task推导语义。
  - path: docs/documents/MVP_PLAN.md
    expected_change: 记录Review 1、confirmed solutions、Fix Coding/Review状态与Stage 3 gate仍未满足。
  - path: docs/documents/OPERATIONS.md
    expected_change: 记录raw database lock不得作为normal claim race结果，以及ready work item current Task的operator视图。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录Fix实际Diff、并发/settlement/snapshot direct evidence、verification、deviation与Room状态；不得预写通过。

question_policy: >
  若正确修复需要schema/database migration、新lock table/service、retry/backoff、public command或状态机变化、
  cancel-wins语义变化、新module/dependency/adapter、Stage 3–6能力、active v0.3 runtime/binding修改、
  v0.4 cutover、旧database删除或任何Git write，停止受影响工作并调用room_ask_question。existing
  RoomService内局部helper命名、BEGIN IMMEDIATE的最小封装位置、Worker test fixture组织与文档段落
  位置可在本Contract冻结行为内作最小选择，并在Coding Result记录。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: "2026-08-31T03:02:32.947Z"
```

## 2. Room 派发边界

- durable Current v0.3 Room现为`RUN_FAILED`、waiting actor=`planner`；current Run=`run-increment-010-fix-004`，current Question为空，current Review=`review-increment-010-codex-001`。
- 用户已确认三项finding、solution与本文完整Contract；本文为`Accepted`、`confirmed_by_user=true`，已通过Current v0.3 `room_submit_task`完整提交。
- 用户已确认第1.1节terminal evidence clarification。Runs `run-increment-010-fix-003/-004`均在未获得该聊天答案的旧continuation context中重复返回`needs_decision`，并由v0.3 Runner以`coding_result_invalid`终结；这不撤销已实现candidate或本clarification。
- submission创建Task `increment-010-execution-core-multi-run-fix-001`并追加`task_submitted` Event sequence `321217`；Fix continuation不重新建立baseline，`observed_baseline_head=null`。
- 下一次`room_retry_run`、fresh Fix Run ID、一次`room:run`、任何service restart、stage、commit、push、cutover与旧database删除均需分别授权。
- 后续Fix Run继承reviewed implementation lineage baseline/session，保留task-owned dirty worktree，不传`--baseline-head`，不修改detached v0.3 launcher。

## 3. 相关文档

- [Increment 10 Accepted Contract](./INCREMENT_10_TASK_CONTRACT.md)
- [Stage 2 Architecture Review](./STAGE_2_EXECUTION_CORE_ARCHITECTURE_REVIEW.md)
- [ADR-0004](./ADR/0004-execution-core-run-attempt-and-concurrency.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [MVP Plan](./MVP_PLAN.md)
- [Operations](./OPERATIONS.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
