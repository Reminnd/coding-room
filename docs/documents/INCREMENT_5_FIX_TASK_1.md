# Increment 5 Fix Task 1 — Pause Settlement、Finalization Idempotency 与 Fake-Process Isolation

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（由用户在原 Increment 5 session 中人工派发） |
| 创建/确认日期 | 2026-08-26 |
| Review ID | `review-increment-005-codex-001` |
| Parent Task | `increment-005-decision-fix-resume` |
| Lineage baseline | `bcb9a9f9da451d64b4787d3967c0032cbc453602` |
| Manual dispatch HEAD | 用户授权的 Codex docs-only descendant commit；派发前从 live Git 读取 exact object ID |
| Target | `main` / `D:/agent/case/codex-claudecode-room` |

```yaml
task_id: increment-005-decision-fix-resume-fix-001
room_id: agent-room-main
type: fix
parent_task_id: increment-005-decision-fix-resume
based_on_review_id: review-increment-005-codex-001

background: >
  Increment 5 candidate Coding 已完成。Codex Review 1 确认三项可达缺陷：Question
  将 Run 持久化为 needs_decision 后，后续正常 stream progress 仍进入 running-only
  appendRunProgress 并可在 pause finalization 前抛错；finalizeNeedsDecision 在既有
  completed_at retry/conflict 判定前要求 Question 仍 open，导致 answer 后同 payload retry
  失去幂等；一个 dispatch baseline mismatch regression 用末位替换为 0 构造 expected
  hash，在真实 HEAD 已以 0 结尾时不会形成 mismatch，且因未注入 fake spawner 会进入
  本机真实 Claude process。本次 npm test 因第三项得到 205/206。用户已确认三项 finding
  与以下最小 solution。

goal: >
  仅修复 review-increment-005-codex-001 的三项 confirmed finding，使 Question 后的真实
  stream 顺序可靠完成单一 run_paused settlement，pause-finalized Run 在 Question answered
  后仍保持既有 payload retry/conflict 契约，并让 baseline mismatch regression 确定性地在
  零 process spawn 下验证拒绝。

confirmed_findings:
  - finding_id: inc5-r1-pause-progress-after-question
    solution: >
      保留 Question 前 running Run 的既有 run_progress 行为；room_ask_question 已把同一 Run
      持久化为 needs_decision 后，Runner 继续消费后续 stdout 以完成 interpreter、raw artifact、
      terminal 与 pause evidence，但不得再把后续非终态 progress 交给只接受 running 的
      appendRunProgress。增加 fake-process direct regression，按 init/running progress ->
      room_ask_question -> assistant/tool_result 等有效非终态 progress -> needs_decision result/exit
      的顺序执行，并证明恰好一次 run_paused、零 run_completed/run_failed，且不会因 progress
      guard 中断 finalization。不得放宽 appendRunProgress 的通用 running-only guard。
  - finding_id: inc5-r1-finalization-idempotency-order
    solution: >
      finalizeNeedsDecision 在同一 transaction 内先识别 run.completed_at 已存在的 completed
      command：按已持久化 result/failure/evidence 与 incoming payload 比较，相同 payload 返回
      既有 Run、created=false 且不新增 Event，不同 payload 返回 id_conflict 且 durable state
      不变。只有首次 finalization 才执行 current needs_decision Run、Room=NEEDS_DECISION、latest
      open Question 与 run/task/room membership guard。替换现有 reject-after-answered 错误预期，
      直接覆盖 answer 后的同 payload retry 与不同 payload conflict。
  - finding_id: inc5-r1-baseline-test-real-claude
    solution: >
      dispatch baseline mismatch regression 必须构造 guaranteed-unequal 且仍为合法 hex object ID
      的 expected hash；测试显式注入 asserting fake/throwing spawner，记录 invocation count，并
      断言 mismatch 以 validation_failed 在 process start 前拒绝且 invocation count=0。不得依赖
      operator 全局 Claude、network、真实或 paid Claude process。

requirements:
  - 只修复 review-increment-005-codex-001 的三个 confirmed finding；review_fixes_only。
  - Question durable 前，既有 running Run 的非终态 progress 仍按当前行为追加 run_progress；不得删除或全局禁用 progress evidence。
  - Question durable 后，Runner 必须继续消费 stdout line、保留 raw artifact、解释 terminal output并收集可靠 Git/artifact/process evidence，但不得调用 running-only appendRunProgress。
  - needs-decision fake-process regression 必须在 askQuestion 后至少发送一个 interpreter 可识别为非终态 progress 的 assistant/tool-related line；只发送 init/result 或其它返回 null 的 line 不满足本 finding。
  - 上述顺序必须最终持久化 completed_at、session、exit、result/failure、Git evidence、artifact refs 与恰好一个 run_paused；Room/Run 保持 NEEDS_DECISION/needs_decision，零 run_completed/run_failed。
  - 不修改 appendRunProgress 接受状态，不让 needs_decision Run 产生新的 run_progress Event；不得用 catch-and-ignore ProtocolError 掩盖其它 progress failure。
  - finalizeNeedsDecision 对 completed_at 非 null 的 Run必须先处理 same-payload retry/different-payload conflict；该判定不依赖 Question 继续 open 或 Room 继续处于首次 finalization state。
  - 首次 finalizeNeedsDecision 继续执行原 Contract 的 current Run、Room、latest open Question 与 membership guard；answer-before-finalization 继续 validation_failed 且无 partial write。
  - answer 后 exact same pause payload retry返回既有 Run、created=false、Event/cursor不变；different payload返回 id_conflict，Run/Question/Room/Event/cursor不变。
  - baseline mismatch test必须用测试侧逻辑保证 expected hash与 actual baselineHead不同，并显式注入不会启动外部 process的 spawner；断言 spawner未被调用。
  - 既有 decision/fix continuation、answer_changes_contract、Git evidence、MCP pause gate、scope与全部 regression继续通过。
  - 只把 Fix 1 candidate Coding、实际 Diff、验证与 deviation 写入 DEVELOPMENT_LOG；再次 Review 与用户接受前不得把 Increment 5 提升为 Current。

non_goals:
  - 新增或修改 Room state、transition、Run status、Event type、entity、schema field/table、migration、protocol version或error code。
  - 放宽 appendRunProgress 的 running-only invariant，或为 needs_decision 增加第二条 durable progress path。
  - 重写 ClaudeStreamInterpreter、Process Transport、artifact pipeline、Git Observer、continuation lineage、session/baseline authority或terminal classifier。
  - 新增 buffering queue、generic stream state machine、wrapper、compatibility layer、feature flag、retry/backoff、hash/checksum或dependency。
  - 修改 MCP tool surface、Room initialization、Runner CLI/daemon/scheduler、Increment 6/7、package metadata、lockfile、tsconfig或scope boundary。
  - 修复其它未确认问题、整理相邻代码/测试/注释/格式，或修改本 Fix Contract。
  - 真实 Claude smoke、network、paid process、stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout或历史改写。

architecture_decisions:
  - Room Run status继续是 durable progress eligibility authority；Question把 Run变为 needs_decision 后，Runner仍拥有 process/stdout/artifact与pause settlement，但不把后续 line写成 running progress Event。
  - raw stdout artifact与Room run_progress Event职责不同：前者保留完整process evidence，后者只描述Run仍running时的非终态进度；本 Fix不新增parallel authority。
  - completed_at与Run中已持久化pause payload拥有已完成finalization的retry/conflict authority；open Question lifecycle guard只约束首次command，不得误伤已完成command的幂等重试。
  - baseline mismatch rejection仍发生在Run/process/artifact/Event创建前；测试必须用injected process seam证明这一边界，不以真实Claude行为作为Oracle。

scope:
  - review_fixes_only
  - src/runner/claude-runner.ts 中 Question 后 progress routing 的最小修复
  - src/room/room-service.ts 中 finalizeNeedsDecision retry/conflict 与首次 lifecycle guard 顺序的最小修复
  - tests/claude-runner.test.ts 中真实 pause stream 顺序 regression 与 deterministic zero-spawn baseline mismatch regression
  - tests/room-service.test.ts 中 answer 后 finalization retry/conflict regression
  - docs/documents/DEVELOPMENT_LOG.md 中 Fix 1 candidate Coding/verification 事实

constraints:
  - 保留原 Implementation lineage baseline_head bcb9a9f9da451d64b4787d3967c0032cbc453602。
  - 当前 branch为main、target worktree为D:/agent/case/codex-claudecode-room；继续修改当前未提交的完整Increment 5 source/test candidate Diff。
  - 用户已明确授权在人工Fix派发前提交本Fix Contract与Codex Review/planning/state文档。该docs-only commit可以让manual dispatch HEAD成为原lineage baseline的descendant，但不得包含任何source/test/package/runtime文件；派发前必须用live Git证明原baseline是current HEAD的ancestor，并核对baseline..HEAD commit path只包含本次授权文档。
  - 上述docs-only descendant只属于本次人工开发delivery metadata，不改变产品candidate的exact sourceRun.baseline_head gate、不修改Run authority，也不得被实现为runtime例外。人工派发不调用candidate runClaude；再次Review仍从原lineage baseline审查完整committed/uncommitted task-owned Diff。
  - 用户在原Increment 5 Claude session/conversation中人工派发；若当前不是该session，停止并报告，不得创建无关新session冒充lineage。
  - 当前dirty worktree属于同一Implementation lineage并包含Codex Review/Fix planning文档；不重新执行clean-worktree gate，不覆盖、回滚、拆分、stage或格式化既有candidate。
  - Claude只修改scope列出的source/test与DEVELOPMENT_LOG，不修改PROJECT_RULES、Architecture、ROOM_PROTOCOL、ADR、MVP、Operations、README或本Fix Contract。
  - progress routing必须基于既有durable Run status/RoomService public fact或当前Runner已知事实；不得复制Room state machine或创建第二个status owner。
  - retry/conflict比较继续复用既有runPauseSignature/pausePayloadSignature与SQLite transaction；不得引入hash、第二套结构比较或repository schema。
  - fake process/temp repository测试不得读取operator全局Claude settings、调用真实network或启动Claude；fixture owner path在finally删除。
  - 关键progress routing与guard/idempotency顺序使用必要简体中文注释，解释invariant而非逐行复述。

acceptance_criteria:
  - fake Run在running期间可追加既有run_progress；room_ask_question后继续收到assistant/tool-related非终态line不会抛validation_failed，也不会在question_asked后新增run_progress。
  - 同一fake Run最终完成pause finalization：Room=NEEDS_DECISION、Run=needs_decision、completed_at/evidence非空、恰好一个question_asked和一个run_paused、零run_completed/run_failed。
  - 上述regression若删除Question后progress routing修复会稳定失败，且不是只通过init/result空progress绕过。
  - 首次finalizeNeedsDecision仍拒绝wrong Room/Run/Question/membership与answer-before-finalization，失败时entity/Event/cursor无partial write。
  - finalization成功并answerQuestion后，同payload retry返回created=false且完整durable state/Event/cursor不变；different payload返回id_conflict且完整durable state/Event/cursor不变。
  - 原reject-after-answered测试被更正，不再把违反Accepted Contract的validation_failed固化为期望。
  - baseline mismatch regression对任意合法actual commit hash都构造不同expected hash，返回literal validation_failed，未创建Run/artifact/Event且fake spawner invocation count为0。
  - npm run typecheck、两个聚焦suite与npm test全部通过；full suite不依赖或启动真实Claude process。
  - 实际Fix Diff仅包含本scope；Coding Result的changed_files、deviations、verification、tests、documentation_changes、unresolved与questions和Git事实一致。

verification:
  - command: node --test "tests/room-service.test.ts" "tests/claude-runner.test.ts"
    detects: Question后真实非终态progress是否中断pause finalization、answer后finalization retry/conflict是否违约，以及baseline mismatch是否可能spawn process。
    decision_if_failed: 不得报告completed；只修复三项confirmed finding，若需要新state/schema/event/progress authority或真实process则返回needs_decision。
  - command: node --test "tests/git-observer.test.ts" "tests/room-mcp.test.ts"
    detects: 最小Runner/RoomService修复是否破坏continuation Git evidence、pause-finalized MCP gate或public durable-state语义。
    decision_if_failed: 不得放宽Git/MCP assertion或跨scope清理；定位本Fix引入的回归，超出confirmed scope返回needs_decision。
  - command: node --test "tests/scope.test.ts"
    detects: source/module/dependency/tool surface与Increment 5 frozen scope是否漂移。
    decision_if_failed: 不得扩大allowlist或新增boundary；恢复到本Fix现有文件scope，否则返回needs_decision。
  - command: npm run typecheck
    detects: progress routing、finalization transaction order与fake spawner fixture的TypeScript偏移。
    decision_if_failed: 不得使用any、ts-ignore、skipLibCheck或compatibility wrapper；只修复本Fix类型问题。
  - command: npm test
    detects: 三项Fix或测试隔离是否破坏完整Protocol、Room、Git、Runner、MCP、CLI与Scope regression。
    decision_if_failed: 不得删除/弱化测试或调用真实Claude确认；只修复task-owned regression，超出scope返回needs_decision。
  - command: git status --short --branch
    detects: branch、staged状态或task-owned path set是否漂移。
    decision_if_failed: 不得stage、清理、回滚或覆盖既有candidate；报告无法安全分离的scope drift。

documentation_updates:
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录Fix Task 1实际source/test Diff、三项regression证据、verification、deviation与REVIEW_REQUIRED candidate状态；用户接受前不提升Current capability。

question_policy: >
  若正确修复需要新增/修改Room state、transition、Run status、Event type、entity、schema/table/
  migration/protocol/error，放宽appendRunProgress，重写stream/process/artifact/Git/lineage authority，
  修改MCP/package/dependency/scope，新增Runner CLI/daemon/scheduler/retry/framework，启动真实或paid
  Claude，或执行任何Git mutation，停止受影响工作并返回needs_decision。其它新finding只报告，
  不夹带修复；局部变量/helper与fake fixture的最小选择由Claude判断并在Coding Result记录。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: 2026-08-26T07:24:13Z
```

## 人工派发边界

- 用户本次只确认 Review 1 的三项 finding 与最小 solution；Fix Task 已 Accepted，但尚未授权 Codex 启动 Claude。
- 用户继续在原 Increment 5 Claude session/conversation 中人工派发本文；派发前确认该 session、`main`、原 lineage baseline 是 live docs-only dispatch `HEAD` 的 ancestor、docs commit path精确、0 staged 与当前 source/test candidate 未漂移。
- 标准客户端支持 `@<path>` 时使用本文末尾指令；不能保证解析时必须注入本文全文，不得只发送 finding 摘要。
- 本次确认不授权真实 Claude smoke、stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout 或清理。

## 人工派发指令

```text
执行 @docs/documents/INCREMENT_5_FIX_TASK_1.md 中已批准的完整 Fix Task。严格遵守其中的 confirmed_findings、review_fixes_only、scope、non_goals、constraints、verification、documentation_updates 和 question_policy；完成后按 ROOM_PROTOCOL.md 的 Coding Result Contract 返回完整结果。不要执行 stage、commit、push、branch/worktree、reset、restore、clean 或清理操作。
```

如果人工客户端不能可靠解析 `@docs/documents/INCREMENT_5_FIX_TASK_1.md`，必须把本文件完整内容直接注入同一次 prompt；不得只发送上面一行或自行摘要 Contract。

## 相关文档

- [Increment 5 Task Contract](./INCREMENT_5_TASK_CONTRACT.md)
- [Architecture](./ARCHITECTURE.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [MVP Plan](./MVP_PLAN.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
