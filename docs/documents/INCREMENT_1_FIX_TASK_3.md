# Increment 1 Fix Task 3

> 状态：Accepted  
> 用户确认日期：2026-08-24  
> Review ID：`review-increment-001-codex-003`  
> Bootstrap transport：VS Code Claude Code  
> 派发状态：待派发

```yaml
task_id: increment-001-fix-003
room_id: bootstrap-codex-claudecode-room
type: fix
parent_task_id: increment-001-protocol-state-core
based_on_review_id: review-increment-001-codex-003

background: >
  Increment 1 Fix 2 的 typecheck 与 45 项测试通过，且两项 confirmed findings 已按批准方案修复。
  Codex 再次 Review 发现，submitReview 的 current Run guard 位于 insertReview 的幂等判断之前：
  review-1 已成功持久化、Fix run-2 完成后，同 ID/同 content 重试 review-1 会因引用旧
  run-1 而返回 validation_failed。最小复现已确认该行为违反 Increment 1 已批准的
  entity create idempotency contract。用户已确认本 Fix Task 的最小解决方案。

goal: >
  在保持 Fix 2 current-Run guard、持久化 schema 与既有状态机不变的前提下，恢复
  submitReview 对已持久化同 ID/同 content Review 的幂等重试语义，同时继续拒绝新建的
  stale-Run Review。

confirmed_findings:
  - finding_id: inc1-r3-submit-review-idempotency
    solution: >
      在 submitReview transaction 内先通过 insertReview 区分既有同内容 Review、ID 冲突
      与新 Review。既有同内容 Review 直接返回且不新增 Event；同 ID/不同 content 继续返回
      id_conflict；只有新 Review 才执行 currentRunId guard。新 stale Review 在 guard 失败后
      由同一 transaction rollback，不留下 Review、Room 或 Event partial write。

requirements:
  - submitReview 对已持久化的同 ID/同 schema-normalized content Review 必须返回既有 entity，created=false，且不新增 Event，即使 Room 后续已完成新的 Run。
  - submitReview 对同 ID、不同 content 必须继续返回 id_conflict，不修改 Room、Review 或 Event。
  - run-2 完成并进入 REVIEW_REQUIRED 后，使用新 review_id 引用旧 succeeded run-1 的 Review 必须继续返回 validation_failed，Room 保持 REVIEW_REQUIRED，且不持久化新 Review 或 Event。
  - 同一状态下，使用新 review_id 引用当前 run-2 的合法 Review 必须继续成功进入 REVIEW_DISCUSSION。
  - current Run 的权威事实继续来自该 Room sequence 最大的 run_completed Event；不得新增 pointer、schema 或替代路径。
  - 保持 Fix 2 的 resumeRun public-path regression 以及 Increment 1 其他既有正确行为。
  - 更新 DEVELOPMENT_LOG.md，记录 Review 3、Fix 3、回归测试与实际验证结果；Fix 完成后阶段恢复为 REVIEW_REQUIRED。

non_goals:
  - 不增加 active Task/Run/Review pointer column、新 table 或 SQLite migration。
  - 不建立通用 idempotency wrapper、active-entity abstraction、compatibility layer 或重复验证循环。
  - 不修改 ROOM_PROTOCOL.md、ARCHITECTURE.md、ADR、AGENTS.md、CLAUDE.md 或 PROJECT_RULES.md。
  - 不处理 Increment 2–5 的 Git Observer、Runner、MCP、session resume 或其他未确认问题。
  - 不增加 dependency、feature flag、hash、fingerprint 或并发防护。

architecture_decisions:
  - repository insertReview 继续拥有同 ID/同 content 与同 ID/不同 content 的判定；不复制结构比较逻辑。
  - submitReview current Run guard 只约束新 Review。既有同内容 Review 的重复提交是已完成 create 的幂等重试，不是新的 state transition。
  - 新 Review 可以先在 transaction 内暂时 insert，再执行 current Run guard；guard 失败时现有 tx rollback 保证该记录不可持久化。

scope:
  - review_fixes_only
  - src/room/room-service.ts 中 submitReview 幂等判断与 current Run guard 的最小顺序调整。
  - tests/room-service.test.ts 中跨后续 Run 的 Review 幂等重试 regression，以及对新 stale Review 既有 regression 的保持。
  - DEVELOPMENT_LOG.md 的实现事实与阶段同步。

constraints:
  - 保留 Increment 1 的原始 baseline_head ba3db6ea3b66503f43d2bac48324454ae099a1d7。
  - 只修改完成本 Fix Task 所必需的实现、测试与 DEVELOPMENT_LOG.md；不得覆盖或整理其他未提交文档变更。
  - 所有失败路径必须在同一 transaction 内 rollback，不产生 Review、Room 或 Event partial write。
  - 不执行 commit、push、checkout、reset、clean、branch 或 history rewrite。

acceptance_criteria:
  - review-1 已成功提交、Fix run-2 完成后，再次提交与原 review-1 同 ID/同 content 的请求返回 created=false 和既有 review-1，Room 保持 REVIEW_REQUIRED，Event 数量不变。
  - 上述状态下，同 review_id 但不同 content 的请求返回 id_conflict，Room 与 Event 不变。
  - 上述状态下，使用新 review_id 引用 run-1 仍返回 validation_failed，新 Review 不持久化，Room 与 Event 不变。
  - 使用新 review_id 引用 run-2 仍成功进入 REVIEW_DISCUSSION。
  - 原有 45 项测试继续通过，新增 Review idempotency regression 通过。
  - npm run typecheck 与 npm test 全部通过。
  - DEVELOPMENT_LOG.md 与实际 Fix 行为、验证结果及 REVIEW_REQUIRED 状态一致。

verification:
  - command: node --test "tests/room-service.test.ts"
    detects: >
      跨后续 Run 的既有 Review 同内容重试仍被误拒、ID 冲突被错误接受、新 stale Review
      被错误持久化、current Run Review 被误拒，或失败路径产生 partial write。
    decision_if_failed: 不得报告 completed；仅修复对应 confirmed finding 后重跑。
  - command: npm run typecheck
    detects: submitReview 顺序调整或 regression test 引入的 TypeScript 错误。
    decision_if_failed: 不得报告 completed；修复本 Fix Task 引入的类型错误。
  - command: npm test
    detects: Fix 对 Increment 1 既有 protocol、atomicity、idempotency、Event sequence、Fix 2 guard 或完整循环造成回归。
    decision_if_failed: 不得报告 completed；定位本 Fix 与既有行为的冲突，不扩大范围。

documentation_updates:
  - path: DEVELOPMENT_LOG.md
    expected_change: 记录 Review 3、Fix Task 3、regression tests、验证结果与 REVIEW_REQUIRED 状态。

question_policy: >
  若最小正确修复需要新增持久化字段、改变 ROOM_PROTOCOL、增加 dependency、扩大到后续
  Increment 或处理未确认 finding，停止并返回 needs_decision；不得自行扩大范围。

confirmed_by_user: true
created_by: codex
created_at: 2026-08-23T16:17:09Z
```

## 相关文档

- [Increment 1 Task Contract](./INCREMENT_1_TASK_CONTRACT.md)
- [Increment 1 Fix Task 2](./INCREMENT_1_FIX_TASK_2.md)
- [ROOM_PROTOCOL.md](./ROOM_PROTOCOL.md)
- [PROJECT_RULES.md](../../PROJECT_RULES.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
