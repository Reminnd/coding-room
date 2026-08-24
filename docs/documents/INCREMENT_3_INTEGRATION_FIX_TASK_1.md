# Increment 3 Integration Fix Task 1 — Current Task、Partial Session、Central Matrix 与 Lifecycle 文档

> 状态：Accepted  
> 用户确认日期：2026-08-24  
> Review ID：`review-increment-003-integration-codex-001`  
> Bootstrap transport：`claude -p --resume`  
> 派发状态：待用户/Codex 明确授权派发；当前为 `FIX_PLAN_READY`

```yaml
task_id: increment-003-claude-runner-integration-fix-001
room_id: bootstrap-codex-claudecode-room
type: fix
parent_task_id: increment-003-claude-runner-integration
based_on_review_id: review-increment-003-integration-codex-001

background: >
  Increment 3 Integration 在 branch codex/inc3-integration、baseline_head
  63059189e97f7419238f5a3678513d4ca5e50f0d 上完成 Coding。Codex Review 读取完整
  staged/unstaged/untracked Diff、Accepted Contract、源码、测试与候选文档，并独立运行
  npm run typecheck 和 npm test（118/118 passed）。测试绿灯未覆盖四项可达缺口：
  FIX_PLAN_READY 可启动旧 Implementation Task；required_tool_missing 丢失已观察 session；
  central runClaude matrix 未直接覆盖 Contract 点名的 transport/stream failure paths；
  ROOM_PROTOCOL 与 ARCHITECTURE 仍保留“初始化 MCP 后才进入 CODING”的旧语义。
  用户已确认以下四项 finding 与最小方案。

goal: >
  仅修复 Review 1 已确认的四项缺口，使 Runner 只执行 current Task、失败 Run 保留可靠
  session evidence、central public path 具备完整失败映射证据，并使 lifecycle 文档与
  已批准的 CODING startup/init 语义一致。

confirmed_findings:
  - finding_id: inc3-integration-r1-current-task-guard
    solution: >
      在 RoomService.startRun/resumeRun 的同一 transaction 中复用该 Room 最新
      task_submitted Event 作为 current Task authority。保留 insertRun 对同 ID/同 content
      retry 与同 ID/异 content conflict 的既有顺序；只对 newly inserted Run 执行 current
      Task guard。stale Task 以 validation_failed 回滚，不留下 Run、Event 或 Room state 变化。
      增加 startRun、resumeRun 与 runClaude public-path regression。
  - finding_id: inc3-integration-r1-partial-session-evidence
    solution: >
      ClaudeStreamInterpreter 在 non-empty session_id 已通过 expected-session 约束后、required
      Room tool 校验前保存最小 observed session evidence；required_tool_missing failure 携带该
      sessionId，但仍保持 ok=false、required tool authority 与既有 failure reason 不变。增加
      interpreter 与 runClaude regression，证明 failRun 持久化该 session。
  - finding_id: inc3-integration-r1-central-failure-matrix
    solution: >
      使用现有 fake process/temp repository seam，经 runClaude 直接覆盖 asynchronous child
      error、stdin EPIPE 后 late close(0)、signal exit、missing/invalid/duplicate init、malformed
      JSON、session mismatch、missing/duplicate/error terminal、invalid/mismatched/non-completed
      CodingResult。每个 case 断言唯一 failure mapping、一次 run_failed Event、无 run_completed
      Event，且 Room/Run terminal state 与 evidence 一致。
  - finding_id: inc3-integration-r1-lifecycle-documentation
    solution: >
      修正 ROOM_PROTOCOL transition precondition 与 ARCHITECTURE failure table：startRun/resumeRun
      atomic claim 先进入 CODING，process startup 与 MCP initialization 随后发生；startup/init
      failure 通过既有 CODING -> RUN_FAILED 结束。不新增 Room state、transition 或 protocol version。

requirements:
  - 只修复 review-increment-003-integration-codex-001 的四项 confirmed finding。
  - current Task authority 必须复用每个 Room sequence 最大的 task_submitted Event，不新增 active_task_id、schema、migration 或第二权威。
  - RoomService.startRun/resumeRun 必须保持同 ID/同 normalized content 的既有 Run retry 返回与同 ID/异 content 的 id_conflict；current Task guard 只应用于新 Run。
  - 新 Run 引用同 Room 的 stale Task 时必须 validation_failed；transaction rollback 后 Room state、runs table 与 Event sequence 全部不变，Claude process 与 artifact 均不得创建。
  - current Task 的 startRun/resumeRun 必须继续使用既有合法 transition，不能改变 transition pair、actor 或 Run field shape。
  - required_tool_missing 必须继续表示 exact frozen Room tool 缺失，不得因已观察 sessionId 返回 partial success；failure.sessionId 只保存 non-empty 且符合 expectedSessionId 约束的可靠值。
  - runClaude 收到 required_tool_missing 时必须进入 RUN_FAILED、failure.code=room_mcp_unavailable，并把已观察 sessionId 原子持久化到 Run.claude_session_id。
  - central fake-process matrix 必须直接调用 runClaude；leaf test 不能替代 central mapping、terminal evidence 与 single-settlement 证据。
  - stdin EPIPE 与 asynchronous child error 必须映射 claude_start_failed；late close/error 不得产生第二次 terminal transition。
  - signal exit 必须映射 claude_exit_failed；init 类 failure 必须映射 room_mcp_unavailable；其它 stream/session/terminal/schema/task/status failure 必须映射 coding_result_invalid。
  - 每个 central failure case 必须断言 exactly one run_failed Event、zero run_completed Event、Room=RUN_FAILED、Run=failed；只断言 error code 不足以验收。
  - ROOM_PROTOCOL 与 ARCHITECTURE 必须明确 CODING 先于 process startup/MCP init，并保持 0.2-design、既有 state/transition set 与 ADR-0002 candidate clarification 不变。
  - Fix Coding 完成后同步 Development Log、MVP Plan 与 Operations 的 candidate/REVIEW_REQUIRED 事实；用户接受与 commit 前不得把 Runner 提升为 main Current capability。

non_goals:
  - 新增 Room state、transition、Event type、SQLite table/field/migration、protocol error code 或 Run/Task/CodingResult public field。
  - 修改 Claude CLI flags、allowed tools、MCP config、JSONL framing、CodingResult schema、Git command/evidence set、artifact path 或 failure precedence。
  - 修改 accepted claude-process.ts leaf、Git Observer、repository schema、state-machine transition table、package metadata、lockfile、tsconfig 或 dependency。
  - 实现 Increment 4 MCP server/CLI、Increment 5 Question/Fix lineage orchestration、retry/timeout/kill、parallel Run、automatic wakeup 或真实 Claude smoke。
  - 修复本 Review 未确认的既有问题、重构 RoomService/Runner、增加通用 current-entity framework、compatibility layer、feature flag 或 test framework。
  - commit、push、stage、branch/worktree mutation、merge、rebase、cherry-pick、reset、restore、clean、checkout 或历史改写。

architecture_decisions:
  - current Task 是 Room 最新 task_submitted Event 指向的 Task；该 Event 与 submitTask transition 在同一 transaction 内，sequence 提供稳定顺序。
  - current Task guard 属于 RoomService 新 Run application boundary；Runner 继续通过 RoomService claim，不直接访问 repository/SQLite。
  - Run create idempotency 先于只适用于新 command 的 current Task validation；stale newly inserted Run 由同一 transaction rollback。
  - session lifecycle evidence 与 MCP capability authority 相互独立：可靠 session 可在 required tool 缺失时保留，但不能使 init 成功。
  - central integration tests 拥有 process/stream outcome 到 Room failure/evidence/transition 的 mapping Oracle；leaf tests 继续拥有各自内部 transport/interpreter behavior。
  - CODING 继续覆盖 atomic claim 后的 startup、MCP init、Coding 与 result collection；Fix 不改变 0.2-design architecture decision。

scope:
  - review_fixes_only
  - src/room/room-service.ts 的 newly inserted Run current Task guard
  - src/runner/claude-stream.ts 的可靠 partial session evidence
  - tests/room-service.test.ts 的 startRun/resumeRun stale/current Task 与 rollback/idempotency regression
  - tests/claude-stream.test.ts 的 required_tool_missing session evidence regression
  - tests/claude-runner.test.ts 的 stale Task、partial session 与完整 central failure matrix
  - tests/fixtures.ts 仅在上述 direct regression 需要最小既有 fixture helper 调整时
  - docs/documents/ROOM_PROTOCOL.md 与 docs/documents/ARCHITECTURE.md 的两处 lifecycle 语义修正
  - docs/documents/DEVELOPMENT_LOG.md、docs/documents/MVP_PLAN.md、docs/documents/OPERATIONS.md 的 candidate Fix Coding 状态同步

constraints:
  - 保留原 Implementation lineage baseline_head 63059189e97f7419238f5a3678513d4ca5e50f0d。
  - 当前 branch 为 codex/inc3-integration，target worktree 为 D:/agent/case/codex-claudecode-room-worktrees/inc3-integration。
  - Fix 继续修改当前未提交的完整 Integration task-owned Diff；不得覆盖、回滚或拆分既有 candidate。
  - insertRun 的 retry/conflict 判断与 new-command current Task guard 必须位于同一 transaction；不得把 stale validation 提前到会破坏已完成 create retry 的位置。
  - required tool lookup 与 success evidence 继续由 REQUIRED_ROOM_TOOL_NAME frozen constant 拥有；不得重新引入 caller-defined authority。
  - central test 的 expected failure code、Room state、Run status 与 Event type 使用 Contract/protocol 的测试侧 literal，不从 classifyTerminal 或 transition table 导入 Oracle。
  - 不修改 src/runner/claude-process.ts、tests/claude-process.test.ts 或 accepted leaf fixture；central tests只复用现有 exported fake-process seam。
  - 本 Fix Contract 由 Codex 维护；Claude 不修改、复制或把它报告为 Claude-owned changed file。
  - 不运行 formatter，不整理无关注释、命名、测试或文档。

acceptance_criteria:
  - 在 FIX_PLAN_READY 中，startRun 与 resumeRun 使用旧 Implementation Task 创建新 Run 均以 validation_failed 拒绝；Room 保持 FIX_PLAN_READY，旧/新 Task、Run 与 Event durable state 不变。
  - current Fix Task 的合法 resumeRun 继续进入 CODING；current Implementation Task 的合法 startRun 继续进入 CODING。
  - 同 ID/同 content 的既有 Run retry 继续返回 created=false 且不新增 Event；同 ID/异 content 继续 id_conflict；new stale Run rollback 后可用同 run_id 对 current Task 成功创建。
  - runClaude 在 FIX_PLAN_READY 收到 stale taskId 时不调用 fake spawn，不创建 artifact，不新增 Run/Event，并保持 Room state。
  - required_tool_missing 的 init 含合法 session_id 时，ClaudeStreamFailure.sessionId 等于该值；missing/invalid/mismatched session 继续按既有 reason 失败且不伪造可靠 session。
  - runClaude 的 required-tool failure 进入 RUN_FAILED、failure.code=room_mcp_unavailable，Run.claude_session_id 保存已观察 session，terminal transition 只有一次。
  - asynchronous child error、stdin EPIPE 后 late close(0)、signal exit、四类 init failure 以及全部点名 stream/session/terminal/CodingResult failure 均经 runClaude 返回规定 error code，并满足 exactly one run_failed / zero run_completed。
  - 成功 start/resume、completion Git evidence、artifact refs、progress Event、atomic terminal evidence 与六类 failure precedence 的既有 regression 继续通过。
  - ROOM_PROTOCOL transition table 不再把 MCP init 写成进入 CODING 的前置条件；ARCHITECTURE 不再写 Room MCP 缺失时“不开始 Coding”，两者都说明 CODING -> RUN_FAILED。
  - npm run typecheck、聚焦测试、scope regression 与 npm test 全部通过；无 dependency、schema、state、transition、error set 或 out-of-scope path drift。
  - Fix Coding Result 的 changed_files、tests、documentation_changes、verification、deviations、unresolved 与 questions 必须与实际完整 Diff 一致。

verification:
  - command: node --test "tests/room-service.test.ts" "tests/claude-stream.test.ts" "tests/claude-runner.test.ts"
    detects: current Task guard、Run retry/conflict/rollback、partial session evidence、central mapping 与 single terminal settlement 是否闭环。
    decision_if_failed: 不得报告 completed；只修复四项 confirmed finding，若需要改变 schema/state/leaf authority 则返回 needs_decision。
  - command: node --test "tests/scope.test.ts"
    detects: Fix 是否新增未批准 module/file、MCP/CLI、dependency 或放宽 exact runner boundary。
    decision_if_failed: 不得放宽 Scope；移除越界内容，确需新 boundary 时返回 needs_decision。
  - command: npm run typecheck
    detects: RoomService guard、interpreter failure union、Runner evidence 与 parameterized test fixture 的 TypeScript 偏移。
    decision_if_failed: 不得报告 completed；只修复本 Fix 引入的类型问题。
  - command: npm test
    detects: Fix 是否破坏既有 Protocol、Room、Git、Runner leaf、Scope 或完整 lifecycle regression。
    decision_if_failed: 不得删除/放宽测试或跨 scope 清理；定位 task-owned regression，必要时返回 needs_decision。
  - command: git diff -- src/room/room-service.ts src/runner/claude-stream.ts tests/room-service.test.ts tests/claude-stream.test.ts tests/claude-runner.test.ts tests/fixtures.ts docs/documents/ROOM_PROTOCOL.md docs/documents/ARCHITECTURE.md docs/documents/DEVELOPMENT_LOG.md docs/documents/MVP_PLAN.md docs/documents/OPERATIONS.md
    detects: Fix 是否只包含 confirmed finding 的最小实现、直接 regression 与候选文档同步。
    decision_if_failed: 移除本 Fix 产生的越界修改；无法安全分离时返回 needs_decision。

documentation_updates:
  - path: docs/documents/ROOM_PROTOCOL.md
    expected_change: 修正 PLAN_READY/FIX_PLAN_READY 进入 CODING 与 MCP init 的先后关系，不改变 0.2-design state/transition set。
  - path: docs/documents/ARCHITECTURE.md
    expected_change: 修正 Room MCP init failure 的 CODING -> RUN_FAILED 语义。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录 Fix Coding 实际 Diff、regression matrix、verification、deviation 与 REVIEW_REQUIRED 阶段。
  - path: docs/documents/MVP_PLAN.md
    expected_change: 同步 Increment 3 Fix Coding candidate 状态与 Increment 4 boundary。
  - path: docs/documents/OPERATIONS.md
    expected_change: 同步 candidate Runner current Task guard、failure session evidence、验证与 Review 状态；不新增启动命令。

question_policy: >
  若正确修复需要新增 state/transition/schema/table/field/error/dependency、改变 process leaf、CLI flags、
  required tool authority、Git/artifact semantics、failure precedence、MCP/CLI/Question/Fix orchestration，
  或修改 scope 外文件，停止受影响工作并返回 needs_decision。安全且不改变上述契约的测试参数化
  与局部命名由 Claude 判断并记录。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: 2026-08-24T12:50:13Z
```

## 派发边界

- 必须向 Claude Code 注入本文件全文；摘要、Review 消息或 finding 列表不能替代 Accepted Fix Task。
- Fix 使用当前 `codex/inc3-integration` worktree 与原 Implementation lineage，不创建新 branch/worktree。
- 本文件创建不构成 Coding 派发、真实 Claude 调用或任何 Git 写权限。

## 相关文档

- [Increment 3 Integration Accepted Task Contract](./INCREMENT_3_INTEGRATION_TASK_CONTRACT.md)
- [Architecture](./ARCHITECTURE.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
