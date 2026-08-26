# Increment 5 Task Contract — Decision 与 Fix Resume

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（仅在用户确认并完成 dispatch gate 后） |
| 创建日期 | 2026-08-25 |
| 用户确认日期 | 2026-08-25 |
| Parent goal | Increment 5 — Decision 与 Fix Resume |
| Planning main HEAD | `44fd34959834b28c8909b589a203e4c48eadc5b0` |
| Dispatch baseline | 包含本 Accepted Contract 的 clean `main` HEAD；派发前由 Git 读取 exact object ID |
| 评审目标 | 确认 Question pause、decision resume、Fix resume、lineage authority 与 dirty-worktree continuation gate |

## 1. Accepted 结论与授权边界

用户已于 2026-08-25 确认本完整 Contract，文档状态为 `Accepted`，项目阶段进入 `PLAN_READY`。用户选择暂时自行人工派发；Codex 只提供可复制指令，不启动 Claude、Room service、runtime database或 Runner launcher。用户于 2026-08-26 单独授权形成并修正本 documentation baseline；该授权不包含 Claude Coding、实现 commit、push、branch/worktree、真实 paid smoke或清理。

现有实现已经具备 `askQuestion`、`answerQuestion`、`resumeRun`、Fix reference validation 与 explicit `--resume` process capability，但尚未形成可用的 Decision/Fix continuation：Question 已把 Run/Room 置为 `NEEDS_DECISION` 后，central Runner 仍按普通 completed/failed Run settle；所有 resume 仍执行 clean-worktree gate；session、baseline、mode 与答案 context 仍由 caller 提供，而不是从 SQLite lineage 推导。Increment 5 只闭合这些 wiring，不重复实现现有 entity、transition、MCP tool 或 CLI transport。

```yaml
task_id: increment-005-decision-fix-resume
room_id: agent-room-main
type: implementation
parent_task_id: null
based_on_review_id: null

background: >
  Increment 1–4 已把 Protocol/State Core、Git Observer、central Claude Runner、actor-scoped
  Room MCP、shared snapshot 与 Status CLI 纳入 main。Current RoomService 已支持 Question、answer、
  Fix Task validation 与 resumeRun，Process Transport 已支持 exact --resume，Run 也已有 session、
  baseline、result、failure、Git evidence 与 artifact fields。当前缺口位于 application orchestration：
  room_ask_question 会在 Claude process 尚未结束时立即把 Run/Room 置为 NEEDS_DECISION，Runner
  随后无法用 completeRun/failRun 合法 settle；decision/Fix resume 又错误复用新 Implementation 的
  clean-worktree gate，并信任 caller 提供 mode/session/baseline，无法证明 Task-lineage continuity。

goal: >
  交付最小 Decision/Fix continuation orchestration，使 blocking Question Run 被 Runner 可靠暂停并
  持久化 process/Git/artifact evidence，contract 内答案与 Review-confirmed Fix 都从 SQLite lineage
  推导 exact session 和 baseline，在保留已有 worktree changes 的条件下恢复同一 Claude session，
  且改变 contract 的答案不能恢复旧 Task。

requirements:
  - 复用现有 RoomState、TaskContract、Run、Review、Question、Event 与 SQLite tables；不得新增 state、transition pair、entity、schema field、table、migration、pointer、cache、mirror 或 dependency。
  - RoomService 增加最小 needs-decision Run finalization boundary：只接受 current Run 已为 needs_decision、Room 为 NEEDS_DECISION、最新 question_asked 引用的 open Question 与该 Run/task/room 一致的场景。
  - finalization 必须在单一 transaction 内把 observed claude_session_id、process_exit_code、nullable CodingResult、nullable failure、Git evidence、artifact_refs 与 completed_at 写回同一 needs_decision Run；Room/Run status 保持 NEEDS_DECISION/needs_decision，不调用 completeRun 或 failRun。
  - finalization 必须追加恰好一个 run_paused Event，使 after_sequence polling 能观察 process 已停止且 evidence 已提交；相同 finalization payload 重试返回既有 Run且不重复 Event，不同 payload 以 id_conflict 失败并保持 durable state 不变。
  - answerQuestion 在写入答案前必须确认 referenced Question 是该 Room 最新 open Question，source Run 为 current needs_decision Run，且 source Run.completed_at 非 null；Runner 尚未 finalization 时以 validation_failed 拒绝，Question/Run/Room/Event/cursor 全部不变。
  - answer_changes_contract=false 时 Question 变为 answered 但 Room 保持 NEEDS_DECISION，等待 decision resume；answer_changes_contract=true 时继续执行既有 NEEDS_DECISION -> WAITING_FOR_USER_CONFIRMATION，旧 Task 不得恢复。
  - 增加单一 read-only continuation context boundary；只从当前 Room/Task 与现有 Event/reference 推导 continuation kind、source Run、exact baseline_head、exact non-empty claude_session_id 与 nullable answered Question，不接受 caller 覆盖这些 authority。
  - Decision resume 只允许 Room=NEEDS_DECISION、最新 Question status=answered、answer_changes_contract=false、Question.task_id/run_id/room_id 与 current Task/source Run 一致；prompt 必须同时包含完整 persisted TaskContract 与完整 answered Question/answer context。
  - Fix resume 只允许 Room=FIX_PLAN_READY、current Task.type=fix，并沿 task.based_on_review_id -> current Review.run_id -> succeeded source Run 推导 session 与 baseline；prompt 必须包含完整 persisted Fix Task，不从 Review prose 或 session history猜测 confirmed solution。
  - startRun 不得用于 NEEDS_DECISION 或 FIX_PLAN_READY；resumeRun 不得用于没有 prior lineage Run 的首次 PLAN_READY。既有 RUN_FAILED -> PLAN_READY retry仍可按 source Run是否已有可靠 session选择 start/resume，但完整 failure-retry orchestration留给 Increment 6。两个 public method必须直接覆盖本 Task触及的 wrong-mode/wrong-state rollback，不能只依赖 shared transition table。
  - Git Observer 增加一个只读 continuation observation：解析 owning worktree root、完整 HEAD 与 staged/unstaged/untracked evidence，但不要求 evidence 为空；任一 Git observation failure不得降级为空 evidence。
  - 新 Implementation start 继续使用 establishCleanBaseline，并校验 actual HEAD 等于 dispatch expected baseline。Decision/Fix continuation 使用 lineage baseline 与 continuation observation，允许保留 staged/unstaged/untracked changes，但 actual HEAD 必须等于 source Run.baseline_head，否则在创建新 Run/process/artifact/Event 前以 validation_failed 拒绝。
  - central Runner 对新 Implementation start 与 Decision/Fix continuation 使用同一 process/stream/artifact/completion evidence pipeline；continuation mode 与 --resume session 只能来自上述 continuation context。
  - Claude 成功调用 room_ask_question 后，Runner 必须检测 persisted needs_decision Run，并走 needs-decision finalization，而不是再调用 completeRun/failRun。有效 status=needs_decision CodingResult 可以持久化；missing/invalid/contradictory terminal 或 process/Git/artifact failure 记录为该 paused Run.failure，但不得覆盖 durable Question 或错误推进到 REVIEW_REQUIRED/RUN_FAILED。
  - Decision/Fix continuation 成功时创建新的 Run，继承 exact baseline，使用 exact --resume session，并按既有 terminal semantics 进入 REVIEW_REQUIRED 或 RUN_FAILED；不得使用 --continue、最近 session 推断或 Room-wide session。
  - MCP tool surface 保持六个 coordination tool；不得增加 Runner control、room_create、planning-transition、file、Shell、Patch 或 Git mutation tool。room_answer_question 必须直接覆盖新的 pause-finalized gate 与 rollback。
  - 更新 scope regression 的 Increment 标识与 exact existing-module boundary；不增加 top-level module、source directory、package script 或 dependency。
  - 同步 Architecture、ROOM_PROTOCOL、MVP Plan、Operations、Development Log 与 ADR-0002 的 candidate implementation facts；Review 与用户接受前不得把 Increment 5 写成 Current capability。

non_goals:
  - Room database 初始化、room_create/planning-transition public tool、Runner CLI/daemon、Task queue、scheduler、background polling、automatic wakeup 或 process manager。
  - Increment 6 的 representative repository端到端 workflow、完整 RUN_FAILED retry orchestration与真实 Claude smoke；Increment 7 的 Codex packaging/plugin/skill。
  - 改变 contract 的答案自动生成新 Task、自动清理/保存 partial worktree、自动 commit、push、merge、branch/worktree 或 cleanup。
  - timeout、kill、retry/backoff、parallel Run、multi-user、remote access、SSE、WebSocket 或 stateful MCP session。
  - 新 error code、new Run status、schema migration、generic lineage graph、generic workflow engine、feature flag、compatibility wrapper、hash 或 checksum。
  - 修改 Claude Process Transport 的 flags/tool list、Stream Interpreter 的 required-tool authority、CodingResult schema 或 Git mutation boundary。

architecture_decisions:
  - Task lineage continuity 由既有 structured references 推导：Decision 使用 current answered Question -> source Run；Fix 使用 current Fix Task -> based-on Review -> reviewed Run。Event sequence 只确定 current identity，不增加 active pointer。
  - Question 保存与 process pause 分成两个已有事实边界：room_ask_question 原子保存 Question并进入 NEEDS_DECISION；Runner process 结束后再原子提交 pause evidence 与 run_paused Event。answerQuestion 以 completed_at 作为 process 已停止 gate，避免旧 process 与 resume process 并行修改同一 worktree。
  - clean-worktree gate 只属于新的 Implementation lineage。Decision/Fix continuation 必须保留 lineage worktree changes，并用 unchanged HEAD + inherited baseline + read-only evidence 证明仍在同一代码状态边界。
  - session_id 与 baseline_head 是 persisted Run authority；caller 只提供 run identity、target worktree、MCP config 与 start dispatch expected baseline，不得定义 resume lineage。
  - needs-decision 后发生的 process/result/evidence failure 记录在 paused Run，不把已经 durable 的 Question 改写为 RUN_FAILED；用户仍可基于 Question 决策，resume 前必须存在可靠 non-empty session。

scope:
  - src/room/room-service.ts 与 src/room/repository.ts 中 continuation query、needs-decision finalization、answer gate 与 method-specific Run guard
  - src/git/git-observer.ts 中 dirty-allowed continuation observation
  - src/runner/claude-runner.ts 中 lineage-derived continuation、Question pause settlement 与 prompt context；只在现有 seam 必要时最小调整 src/runner/claude-stream.ts
  - tests/room-service.test.ts、tests/git-observer.test.ts、tests/claude-runner.test.ts、tests/room-mcp.test.ts 与 tests/scope.test.ts 的 direct regression
  - docs/documents/ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、OPERATIONS.md、DEVELOPMENT_LOG.md、ADR/0002-agent-integration-lifecycle.md 的 candidate/current-state synchronization

constraints:
  - Coding 必须从用户确认后形成的 clean exact documentation baseline 开始；Claude 不执行 Git write、commit、branch/worktree、push 或 cleanup。
  - 继续使用同一个 local SQLite authority、RoomService transaction boundary、Git CLI observer、process-per-Run 与 task-lineage session；不得建立第二套 lineage store。
  - continuation context 与 finalization 的 current Question/Task/Run authority必须来自 testable Event/reference，不扫描 JSON content 猜测 identity。
  - source Run 缺少 non-empty session、baseline 不匹配、Question 未 finalized、answer 改变 contract、stale Review/Question/Task 或 wrong Room state 时，必须在 spawn 与新 Run/Event/artifact 前拒绝。
  - runner pause finalization 的 retry/conflict、failure precedence、durable evidence 与 run_paused cursor semantics必须有必要简体中文注释，不逐行复述代码。
  - fake process/temp repository 测试不得依赖 operator 全局 Claude settings、真实 network、长期 service 或 paid Claude process；temporary owner path 在 finally 删除。

acceptance_criteria:
  - fake Claude Run 经真实 RoomService askQuestion 进入 NEEDS_DECISION 后，以 process exit 0、valid needs_decision CodingResult、session、Git evidence 与 artifacts 完成 pause finalization；Room/Run 保持 NEEDS_DECISION/needs_decision，completed_at 与 evidence 非空，恰好一个 question_asked 与一个 run_paused，零 run_completed/run_failed。
  - answerQuestion 在 run_paused 前返回 validation_failed 且 public MCP snapshot 前后 deepEqual；finalization 后 answer 成功。stale/non-current Question、wrong source Run 与已 answered Question的重复调用均不产生 partial write或重复 Event。
  - needs-decision process 在 valid Question 后出现 non-zero exit、invalid terminal、Git observation failure 或 artifact failure时，Question 保持 open、Room 保持 NEEDS_DECISION，paused Run 持久化可靠 session/evidence 与单一 failure，不产生 RUN_FAILED/REVIEW_REQUIRED。
  - contract 内 answer 后，decision continuation 从 persisted Question/source Run 推导 session/baseline；dirty worktree 被保留，actual HEAD 未变时新 Run 使用 exact --resume，prompt 包含完整 Task 与 answer，成功进入 REVIEW_REQUIRED。
  - answer_changes_contract=true 后旧 Task continuation 在 spawn/new Run/artifact/Event 前被拒绝，Room 保持 WAITING_FOR_USER_CONFIRMATION，partial worktree 不被清理或修改。
  - Review-confirmed Fix Task 从 current Review/source Run 推导 exact session/baseline；dirty implementation Diff 被保留，Fix prompt 包含完整 Fix Contract，成功创建 resume Run并进入 REVIEW_REQUIRED。
  - NEEDS_DECISION/FIX_PLAN_READY错误使用 startRun、首次 PLAN_READY错误使用 resumeRun、stale Task/Review/Question、missing source session、lineage baseline mismatch与 changed HEAD全部直接返回规定 ProtocolError，Room/entity/Event/cursor与 worktree authority不变；既有 RUN_FAILED retry regression继续通过。
  - continuation Git observation 对 staged/unstaged/untracked dirty fixture 返回稳定 root-relative evidence；missing repository/HEAD 与 evidence command failure保持现有 error semantics且不被解释为空。
  - existing Protocol/Room/Git/Runner/MCP/CLI tests 继续通过；scope/dependency/tool surface不漂移，npm run typecheck 与 npm test 通过。
  - candidate documentation 与实际 public API、run_paused Event、continuation gate、未实现 runtime launcher/Increment 6/7 boundary一致。

verification:
  - command: node --test "tests/room-service.test.ts" "tests/claude-runner.test.ts"
    detects: needs-decision pause finalization、answer-before-pause race、current entity/method-specific guard、lineage-derived Decision/Fix resume、single settlement 与 durable evidence错误。
    decision_if_failed: 不得报告 completed；只在本 Contract boundary 修复，若需要新 state/schema/transition则返回 needs_decision。
  - command: node --test "tests/git-observer.test.ts" "tests/room-mcp.test.ts"
    detects: dirty-allowed continuation HEAD/evidence gate、Git failure降级、room_answer_question public-path rollback、Event/cursor 与 MCP error mapping错误。
    decision_if_failed: 不得放宽 clean Implementation gate或MCP durable-state assertion；定位 task-owned defect，超出 scope则返回 needs_decision。
  - command: node --test "tests/scope.test.ts"
    detects: 新 top-level module/source file/package script/dependency/tool surface 或 Increment scope label漂移。
    decision_if_failed: 不得用目录级任意 allowance绕过；若正确实现确需新增 boundary，返回 needs_decision。
  - command: npm run typecheck
    detects: continuation context、nullable pause result/failure、RoomService/Runner/Git API 与测试 fixture 的 TypeScript偏移。
    decision_if_failed: 不得使用 any、ts-ignore、skipLibCheck或 compatibility wrapper；修复本 Task类型问题，否则返回 needs_decision。
  - command: npm test
    detects: Increment 5 破坏现有 Protocol/Room/Git/Runner/MCP/CLI behavior，或 Contract承诺缺少 direct regression。
    decision_if_failed: 不得跨 scope清理或放宽既有测试；只修复 task-owned regression，必要时返回 needs_decision。

documentation_updates:
  - path: docs/documents/ARCHITECTURE.md
    expected_change: candidate Question pause、lineage continuation、dirty-worktree resume 与 Runner ownership；接受前不提升为 Current。
  - path: docs/documents/ROOM_PROTOCOL.md
    expected_change: candidate run_paused Event、needs-decision finalization、answer gate 与 Decision/Fix continuation semantics；不改变 protocol version或 state set。
  - path: docs/documents/ADR/0002-agent-integration-lifecycle.md
    expected_change: candidate clarification：Task-lineage resume context来自 persisted Run，Question pause evidence由 Runner拥有。
  - path: docs/documents/MVP_PLAN.md
    expected_change: Increment 5 Draft/Coding/Review状态与 acceptance evidence。
  - path: docs/documents/OPERATIONS.md
    expected_change: candidate Runner continuation API、当前 unavailable launcher 与 pause/resume failure boundary。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: actual files、fake-process matrix、verification、deviation、Review decision与 documentation impact。

question_policy: >
  如果正确实现需要新增 Room state/transition/entity/schema/table/migration、改变 MCP tool surface、
  CodingResult/Question/Run field、Claude flags/tool authority、增加 dependency/package script/new source module、
  自动 kill/retry/scheduler/Runner CLI、真实 paid Claude smoke 或 Git mutation，停止受影响工作并返回
  needs_decision。不会改变 Contract 的局部命名、现有文件内 helper 与 fake fixture 选择由 Claude 判断并记录。

confirmed_by_user: true
created_by: codex
created_at: 2026-08-25T00:00:00Z
```

## 2. 人工 Dispatch prerequisite（documentation gate 已满足，尚未执行 Coding）

当前 repository 没有持久化 Room database，`room:serve` 不创建 Room 或推进 planning state，也没有 Runner CLI。用户因此明确选择本 Increment 暂时由自己人工派发完整 Accepted Contract；这是开发本项缺失 capability 的一次性 execution bridge，不恢复后续 Task 的通用 `claude -p` bootstrap规则，不建立第二套 Room state，也不把人工 process/result当作 Increment 5 runtime验收证据。

1. 本 Accepted Contract与同步 planning/state文档已经用户单独授权并形成 clean `main` documentation baseline；实际派发前仍必须重新确认 worktree clean。
2. 在 clean `main` 上记录 exact `baseline_head`、target worktree、branch与 task owner；用户人工客户端必须能够解析 `@docs/documents/INCREMENT_5_TASK_CONTRACT.md`，否则直接注入本文完整内容，不得使用摘要。
3. 人工 prompt只要求执行本 Accepted Contract并返回完整 Coding Result；不得追加未确认 implementation advice、finding、scope或 Git权限。
4. Claude不得 commit、push、创建/切换 branch/worktree、stage、reset、clean或清理 artifact；需要产品、架构、scope、dependency或权限决定时返回 `needs_decision`并停止受影响工作。
5. Codex后续 Review仍以 Accepted Contract、clean baseline、完整 staged/unstaged/untracked Diff、用户返回的 Coding Result与独立验证为 authority；人工 process exit或模型自述不能替代。

是否在后续 Increment 6 把 Room initialization/Runner launcher产品化，应在 Increment 5 接受后单独规划，不并入本 Contract。当前 documentation gate 已满足；exact `baseline_head`、target worktree、branch与 task owner以实际派发前的 live Git检查为准。

## 3. 人工派发指令（已满足 documentation gate）

```text
执行 @docs/documents/INCREMENT_5_TASK_CONTRACT.md 中已批准的完整 Implementation Task。严格遵守其中的 scope、non_goals、constraints、verification、documentation_updates 和 question_policy；完成后按 ROOM_PROTOCOL.md 的 Coding Result Contract 返回完整结果。不要执行 stage、commit、push、branch/worktree、reset、clean 或清理操作。
```

如果人工客户端不能可靠解析 `@docs/documents/INCREMENT_5_TASK_CONTRACT.md`，必须把本文件完整内容直接注入同一次 prompt；不得只发送上面一行或自行摘要 Contract。
