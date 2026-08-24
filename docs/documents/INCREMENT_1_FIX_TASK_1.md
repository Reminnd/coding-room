# Increment 1 Fix Task 1

> 状态：Accepted  
> 用户确认日期：2026-08-23  
> Review ID：`review-increment-001-codex-001`  
> Bootstrap transport：VS Code Claude Code  
> 派发状态：待派发

```yaml
task_id: increment-001-fix-001
room_id: bootstrap-codex-claudecode-room
type: fix
parent_task_id: increment-001-protocol-state-core
based_on_review_id: review-increment-001-codex-001

background: >
  Increment 1 实现通过 npm ci、typecheck 和既有 33 项测试，但 Codex Review 的
  in-memory reproduction 证明旧 Run、旧 Review、phantom confirmed finding 与非法
  timestamp 会被错误接受。用户已确认本 Fix Task 的最小解决方案。

goal: >
  在不改变已批准架构、持久化 schema 或 dependency baseline 的前提下，阻止 stale
  entity 推进 Room state，补齐 Fix finding 与 UTC timestamp 协议校验，并让 transition
  matrix 测试使用独立 oracle。

confirmed_findings:
  - finding_id: inc1-r1-active-entity
    solution: >
      使用现有 Room state、Run status 与 Event sequence 校验当前 Run/Review；不在 rooms
      增加 active_task_id、active_run_id 或 active_review_id。
  - finding_id: inc1-r1-fix-finding-membership
    solution: >
      每个 confirmed_findings.finding_id 必须存在于 based_on_review_id 对应的当前 Review。
  - finding_id: inc1-r1-timestamp-validation
    solution: >
      所有 protocol timestamp 复用严格 UTC ISO 8601 runtime validator。
  - finding_id: inc1-r1-transition-test-oracle
    solution: >
      测试独立声明 ROOM_PROTOCOL.md 规定的 14 条 transition 与 initiator，不再用实现表
      生成期望值。

requirements:
  - startRun 与 resumeRun 只接受适合进入 CODING 的 Run 初始 status，拒绝已经 terminal 或 needs_decision 的 Run input。
  - completeRun、failRun 与 askQuestion 只接受当前 running Run；失败必须保持 Run、Room 与 Event 不变。
  - completeRun 只接受 status=completed 的 CodingResult；blocked 或 needs_decision 不能进入 REVIEW_REQUIRED。
  - submitReview 只接受 succeeded、具有有效 completed CodingResult 且属于当前 Task/Room 的 Run。
  - 使用现有 per-Room Event sequence 判定当前 Review；acceptReview 和 Fix Task 只能引用最近一次 review_submitted Event 指向的 Review。
  - validateFixReferences 必须验证 confirmed finding ID 全部存在于 referenced current Review.findings。
  - 所有 timestamp 字段拒绝非 ISO 8601、非 UTC 或无效日期字符串；内部 now() 输出继续使用 Date.toISOString()。
  - state-machine tests 必须在测试侧独立列出协议规定的 transition matrix，再逐项验证实现。
  - 为已复现的 stale Run、stale Review、phantom finding、invalid timestamp 和非 completed CodingResult 增加 regression tests。
  - 修正 DEVELOPMENT_LOG.md：Fix 完成后的项目阶段为 REVIEW_REQUIRED，并删除将非空 timestamp 描述为协议一致的注记。

non_goals:
  - 不增加 active Task/Run/Review pointer column 或新 table。
  - 不增加 SQLite migration framework、compatibility layer、feature flag 或 parallel state path。
  - 不增加 dependency、test framework、hash、fingerprint 或 scoring model。
  - 不实现 Increment 2–5 的 Git Observer、Runner、MCP、session resume 或完整 Fix orchestration。
  - 不修改 PROJECT_RULES.md、ARCHITECTURE.md、ROOM_PROTOCOL.md、ADR、AGENTS.md 或 CLAUDE.md。
  - 不处理本 Review 未确认的建议或无关清理。

architecture_decisions:
  - SQLite 与现有 events table 继续作为 durable collaboration state；使用 sequence 最大的相关 Event 判定 current Review。
  - Run currentness 由现有 Room state、Run status 与关联关系校验，不增加未来需求驱动的持久化 pointer。
  - 未发布且无受支持消费者的当前 schema 不引入 migration 或 compatibility 机制。

scope:
  - review_fixes_only
  - src/protocol/schema.ts 的共享 timestamp validator。
  - src/room/repository.ts 中读取最新相关 Event 所需的最小 read method，如确有必要。
  - src/room/room-service.ts 的 Run、Review 与 Fix reference guards。
  - tests/protocol.test.ts、tests/state-machine.test.ts、tests/room-service.test.ts 的聚焦 regression tests。
  - DEVELOPMENT_LOG.md 的实现事实与阶段同步。

constraints:
  - 保留 Increment 1 的原始 baseline_head ba3db6ea3b66503f43d2bac48324454ae099a1d7。
  - 不覆盖或回滚当前 Implementation Task 的任何正确变更。
  - 每个新增 guard 的失败路径必须在同一 transaction 内 rollback，不产生 partial write 或 Event。
  - 不执行 commit、push、checkout、reset、clean、branch 或 history rewrite。

acceptance_criteria:
  - run-1 failed、retry、run-2 running 后，completeRun(run-1) 被拒绝，Room 保持 CODING，run-2 保持 running。
  - review-2 已提交后，acceptReview(review-1) 被拒绝，Room 保持 REVIEW_DISCUSSION。
  - Fix Task 引用 Review 中不存在的 finding ID 时被拒绝且不持久化 Task/Event。
  - start/resume/complete/fail/question/review Run path 对不合法 Run status 有聚焦测试。
  - not-a-timestamp、无效日期与非 UTC timestamp 被拒绝；有效 UTC ISO 8601 timestamp 被接受。
  - 测试侧独立 transition matrix 与 ROOM_PROTOCOL.md 的 14 条规则一致，并验证未列 pair 和错误 actor。
  - npm run typecheck 与 npm test 全部通过。
  - DEVELOPMENT_LOG.md 与实际 Fix 行为、验证结果及 REVIEW_REQUIRED 状态一致。

verification:
  - command: node --test "tests/room-service.test.ts" "tests/protocol.test.ts" "tests/state-machine.test.ts"
    detects: >
      Review reproduction 未被阻止、transaction rollback 失败、timestamp 或独立 matrix 回归失败。
    decision_if_failed: 不得报告 completed；仅修复对应 confirmed finding 后重跑。
  - command: npm run typecheck
    detects: guard、Event query、schema 或 test fixture 引入的 TypeScript 错误。
    decision_if_failed: 不得报告 completed；修复本 Fix Task 引入的类型错误。
  - command: npm test
    detects: Fix 对 Increment 1 既有 protocol、atomicity、idempotency、event sequence 或 full-cycle 行为造成回归。
    decision_if_failed: 不得报告 completed；定位 confirmed fix 与既有行为的冲突并停止扩大范围。

documentation_updates:
  - path: DEVELOPMENT_LOG.md
    expected_change: 记录 Fix Task、regression tests、验证结果、REVIEW_REQUIRED 状态，并移除错误 timestamp 注记。

question_policy: >
  若最小正确修复需要新增持久化字段、改变 ROOM_PROTOCOL、增加 dependency、扩大到后续
  Increment 或处理未确认 finding，停止并返回 needs_decision；不得自行扩大范围。

confirmed_by_user: true
created_by: codex
created_at: 2026-08-23T15:18:50Z
```

## 相关文档

- [Increment 1 Task Contract](./INCREMENT_1_TASK_CONTRACT.md)
- [ROOM_PROTOCOL.md](./ROOM_PROTOCOL.md)
- [PROJECT_RULES.md](../../PROJECT_RULES.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
