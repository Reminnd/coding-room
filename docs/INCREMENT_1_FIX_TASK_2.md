# Increment 1 Fix Task 2

> 状态：Accepted  
> 用户确认日期：2026-08-23  
> Review ID：`review-increment-001-codex-002`  
> Bootstrap transport：VS Code Claude Code  
> 派发状态：待派发

```yaml
task_id: increment-001-fix-002
room_id: bootstrap-codex-claudecode-room
type: fix
parent_task_id: increment-001-protocol-state-core
based_on_review_id: review-increment-001-codex-002

background: >
  Increment 1 Fix 1 的 typecheck 与 43 项测试通过，但 Codex 二次 Review 使用受支持的
  两轮 Run/Fix 流程证明：run-2 完成并进入 REVIEW_REQUIRED 后，旧的 succeeded run-1
  仍可提交 Review，并使该旧 Review 成为 current Review。Review 同时确认，声称覆盖
  startRun/resumeRun 非法初始 status 的测试实际只调用了 startRun。用户已确认本 Fix
  Task 的最小解决方案。

goal: >
  在不改变已批准架构、持久化 schema 或 dependency baseline 的前提下，使
  submitReview 只接受当前完成 Run，并补齐 resumeRun 非法初始 status 的直接测试证据。

confirmed_findings:
  - finding_id: inc1-r2-submit-review-current-run
    solution: >
      在 submitReview 写入 Review 前，要求 review.run_id 等于当前 Room 最近一次
      run_completed Event 指向的 Run；复用现有 Event sequence 与
      latestEventEntityId，不新增 active_run_id 或其他持久化 pointer。
  - finding_id: inc1-r2-resume-run-test-coverage
    solution: >
      在 NEEDS_DECISION 状态下直接调用 resumeRun，验证 terminal 与 needs_decision
      初始 status 被拒绝且不产生 Run、Room 或 Event partial write。

requirements:
  - submitReview 除现有 task/room、succeeded status 与 completed CodingResult 校验外，还必须验证 referenced Run 是当前 Room 最近一次 run_completed Event 指向的 Run。
  - run-2 完成并进入 REVIEW_REQUIRED 后，引用旧 succeeded run-1 的 Review 必须以 validation_failed 被拒绝，Room 保持 REVIEW_REQUIRED，且不持久化 Review 或 Event。
  - 引用当前 run-2 的合法 Review 必须继续成功进入 REVIEW_DISCUSSION。
  - 直接覆盖 resumeRun public path：在 NEEDS_DECISION 状态下，succeeded、failed 与 needs_decision 初始 status 均被拒绝，并验证没有 partial write。
  - 保持 startRun、completeRun、failRun、askQuestion、Fix finding membership、UTC timestamp 与独立 transition oracle 的现有正确行为。
  - 更新 DEVELOPMENT_LOG.md，记录 Review 2、Fix 2、回归测试与实际验证结果；Fix 完成后阶段恢复为 REVIEW_REQUIRED。

non_goals:
  - 不增加 active Task/Run/Review pointer column、新 table 或 SQLite migration。
  - 不建立通用 active-entity abstraction、历史 Run 全量扫描或重复验证循环。
  - 不修改 ROOM_PROTOCOL.md、ARCHITECTURE.md、ADR、AGENTS.md 或 CLAUDE.md。
  - 不处理 Increment 2–5 的 Git Observer、Runner、MCP、session resume 或其他未确认问题。
  - 不增加 dependency、feature flag、compatibility layer、hash、fingerprint 或并发防护。

architecture_decisions:
  - REVIEW_REQUIRED 只能由 completeRun atomic transition 产生，并在同一 transaction 内追加 run_completed Event；因此该 Room sequence 最大的 run_completed Event 是当前可审查 Run 的现有权威事实。
  - current Run 校验位于 submitReview application boundary；不改变 repository schema 或协议字段。
  - resumeRun 保持复用 normalizeRunForCoding；本任务只补直接 public-path regression，不增加第二套 status validation。

scope:
  - review_fixes_only
  - src/room/room-service.ts 的 submitReview current Run guard。
  - tests/room-service.test.ts 的 stale succeeded Run 与 resumeRun 聚焦 regression tests。
  - DEVELOPMENT_LOG.md 的实现事实与阶段同步。

constraints:
  - 保留 Increment 1 的原始 baseline_head ba3db6ea3b66503f43d2bac48324454ae099a1d7。
  - 只修改完成本 Fix Task 所必需的实现、测试与 DEVELOPMENT_LOG.md；不得覆盖或整理其他未提交文档变更。
  - 所有新增 guard 的失败路径必须在同一 transaction 内 rollback，不产生 Review、Run、Room 或 Event partial write。
  - 不执行 commit、push、checkout、reset、clean、branch 或 history rewrite。

acceptance_criteria:
  - review-1 已提交、Fix run-2 已完成后，submitReview 引用 run-1 被拒绝，Room 保持 REVIEW_REQUIRED，旧 Review 不持久化且 Event 数量不变。
  - 同一状态下 submitReview 引用 run-2 成功，Room 进入 REVIEW_DISCUSSION。
  - resumeRun 对 succeeded、failed 与 needs_decision 初始 status 均返回 validation_failed，Room 保持 NEEDS_DECISION，不持久化新 Run/Event。
  - 原有 43 项测试继续通过，新增 regression test 通过。
  - npm run typecheck 与 npm test 全部通过。
  - DEVELOPMENT_LOG.md 与实际 Fix 行为、验证结果及 REVIEW_REQUIRED 状态一致。

verification:
  - command: node --test "tests/room-service.test.ts"
    detects: >
      stale succeeded Run 仍能提交 Review、current Run Review 被误拒绝、resumeRun 非法 status
      未被拒绝，或失败路径产生 partial write。
    decision_if_failed: 不得报告 completed；仅修复对应 confirmed finding 后重跑。
  - command: npm run typecheck
    detects: submitReview guard 或 regression test 引入的 TypeScript 错误。
    decision_if_failed: 不得报告 completed；修复本 Fix Task 引入的类型错误。
  - command: npm test
    detects: Fix 对 Increment 1 既有 protocol、atomicity、idempotency、Event sequence 或完整循环造成回归。
    decision_if_failed: 不得报告 completed；定位本 Fix 与既有行为的冲突，不扩大范围。

documentation_updates:
  - path: DEVELOPMENT_LOG.md
    expected_change: 记录 Review 2、Fix Task 2、regression tests、验证结果与 REVIEW_REQUIRED 状态。

question_policy: >
  若最小正确修复需要新增持久化字段、改变 ROOM_PROTOCOL、增加 dependency、扩大到后续
  Increment 或处理未确认 finding，停止并返回 needs_decision；不得自行扩大范围。

confirmed_by_user: true
created_by: codex
created_at: 2026-08-23T15:56:39Z
```

## 相关文档

- [Increment 1 Task Contract](./INCREMENT_1_TASK_CONTRACT.md)
- [Increment 1 Fix Task 1](./INCREMENT_1_FIX_TASK_1.md)
- [ROOM_PROTOCOL.md](./ROOM_PROTOCOL.md)
- [PROJECT_RULES.md](../PROJECT_RULES.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
