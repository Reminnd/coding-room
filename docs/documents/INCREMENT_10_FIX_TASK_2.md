# Increment 10 Fix Task 2 — Empty `needs_decision` Evidence Guard

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| Reader | 用户、Claude Code、Codex Reviewer |
| 评审目标 | 执行已确认的 `inc10-fix1-r1-empty-needs-decision-evidence` 最小 Fix Contract |
| 生效范围 | Increment 10 Fix Task 1 candidate 的 terminal evidence validation |
| Parent Task | `increment-010-execution-core-multi-run-fix-001` |
| Based on Review | `review-increment-010-codex-002` |
| 创建日期 | 2026-08-31 |

## 1. 已确认决定与派发门禁

用户已于 2026-08-31 确认 finding `inc10-fix1-r1-empty-needs-decision-evidence` 及其最小方向：

- `decision_requested` Attempt 的 effective `needs_decision` 只允许两种 canonical evidence：
  1. `result` 为同 Task、`status=needs_decision` 的 `CodingResult`，且 `failure=null`；
  2. `result=null`，且 `failure` 非空，用于 existing Executor 的 pause-failure evidence。
- `result=null + failure=null` MUST 以 `validation_failed` 拒绝，并保持完整 durable snapshot 不变。
- 不修改 schema、transition table、Executor、WorkerAdapter、repository、public command 或 protocol version。

上述 solution 与下方完整 Contract 均已由用户确认；本文状态为 `Accepted`、`confirmed_by_user=true`。本次确认不授权调用 `room_submit_task`、启动 Claude 或执行 Git 写操作。

## 2. Accepted Task Contract

```yaml
task_id: increment-010-execution-core-multi-run-fix-002
room_id: room-ebfafef2-f0e9-4fb1-9eef-ac5adef7445f
type: fix
parent_task_id: increment-010-execution-core-multi-run-fix-001
based_on_review_id: review-increment-010-codex-002

background: >
  Increment 10 Fix Run run-increment-010-fix-005 已在 lineage baseline
  1be0cc2e37aebf69234276ff88c5c95eb92f6495 上成功完成。Fix Review
  review-increment-010-codex-002 确认 writer reservation 与 ready current Task 两项修复正确，
  typecheck、focused suites 与 full 352/352 均通过；但 public settleRunAttempt probe 证明
  decision_requested Attempt 仍接受 status=needs_decision、result=null、failure=null，并把
  Attempt/Run 推进 needs_decision、追加一个 terminal Event。用户已确认 finding 与最小方向。

goal: >
  仅闭合 effective needs_decision 的 empty evidence 分支：拒绝 result=null 与 failure=null，
  保留已确认的 result-carrying 与 pause-failure 两种 legal shape，并用 direct public regression
  证明 validation_failed 与完整 durable snapshot 不变；不改变其它 Increment 10 candidate 行为。

confirmed_findings:
  - finding_id: inc10-fix1-r1-empty-needs-decision-evidence
    solution: >
      在 RoomService.settleRunAttempt 已确定 effective terminal target 后，使 needs_decision
      validation 只接受两种互斥形态：同 Task needs_decision result + failure=null，或
      result=null + non-null failure。result=null + failure=null 必须 validation_failed 且
      完整 durable snapshot 不变。新增 decision_requested public settleRunAttempt direct regression；
      保留 cancel_requested 的 cancel-wins canonicalization 与已有两种 legal evidence regression。

requirements:
  - 只修复上述 confirmed finding；review_fixes_only。
  - effective target 为 needs_decision 时 MUST 恰好满足一种 legal evidence shape：
      1. result 非空、result.status=needs_decision、result.task_id=attempt.task_id、failure=null；
      2. result=null、failure 非空。
  - effective needs_decision 的 result=null、failure=null MUST 抛出 validation_failed。
  - invalid null/null command MUST 在同一 transaction 内 rollback；Room、Run、Attempt、Task、Question、Review、Guidance、Participant、RoleAssignment、Event 与 cursor 的完整 public durable snapshot MUST 与调用前 deepEqual。
  - regression MUST 通过 public RoomService path 构造 ready Run、claim Attempt、ask Question 进入 decision_requested，再调用 settleRunAttempt；不得直接调用 private helper、repository 或 SQLite mutation。
  - 现有 result-carrying needs_decision 与 result-null/non-null-failure pause evidence MUST 继续成功；不得弱化、删除或 skip 现有 regression。
  - validation MUST 使用 cancel override 后的 effective target。cancel_requested Attempt 继续唯一 canonicalize 为 canceled + result=null + failure=null；不得把其 null/null caller payload误判为 needs_decision invalid evidence。
  - existing terminal same-payload retry、different-payload id_conflict、transition error precedence、first-writer-wins、exactly-one terminal Event 与 Question lifecycle MUST 保持。
  - candidate仍不是Current implementation；Fix Coding与再次Review完成前不得宣称Increment 10已通过。

non_goals:
  - 修改 Run/RunAttempt/CodingResult/Question/Event schema、状态集合、transition table、error code或protocol version。
  - 修改 Executor、WorkerAdapter、Claude process/stream、Git Observer、artifact、MCP、CLI、plugin、setup或binding。
  - 修改 RoomRepository、SQLite schema/index/transaction mode、并发claim或worktree lease修复。
  - 修改 state snapshot、current Task推导或其它已通过的Fix Task 1行为。
  - compatibility layer、migration、feature flag、generic validator framework、新module、新dependency、retry/backoff或额外抽象。
  - stage、commit、push、merge、rebase、reset、restore、clean、checkout或其它Git write。
  - active v0.3 runtime修改、v0.4 database/binding cutover、旧database删除或启动未经另行授权的Claude Run。

architecture_decisions:
  - terminal status/evidence一致性继续由 RoomService.settleRunAttempt application boundary拥有；复用existing canonicalSettlePayload，不新增authority。
  - needs_decision legal evidence是两个明确形态的union，不以result是否为空作为唯一guard；null/null不表达任何可接受terminal事实。
  - cancel-wins继续先确定effective canceled target，再执行该target的canonicalization；本Fix不改变transition或idempotency顺序。

scope:
  - review_fixes_only
  - src/room/room-service.ts 中 effective needs_decision 的最小 canonical evidence validation
  - tests/room-service.test.ts 中 null/null public settlement rollback regression，以及两种legal shape与cancel-wins既有evidence保持

constraints:
  - 继承 lineage baseline_head 1be0cc2e37aebf69234276ff88c5c95eb92f6495；保留当前task-owned dirty candidate，不重新执行clean-worktree gate，不回滚或清理既有修改。
  - target branch/actual HEAD保持main/lineage baseline，0 staged；不得覆盖Codex-owned Contract、Review或状态文档。
  - 实现修改 SHOULD 是 existing needs_decision branch 的最小boolean validation，不新增通用validation abstraction。
  - 测试Oracle MUST 使用测试侧literal expected error和完整snapshot；不得从production helper导入expected shape。
  - 如正确修复需要scope外文件、schema/transition/Executor/repository变化、新dependency、runtime cutover或Git write，停止并调用room_ask_question。

acceptance_criteria:
  - decision_requested Attempt收到needs_decision + result=null + failure=null时返回validation_failed，完整public durable snapshot deepEqual不变。
  - 同一初始状态下，同Task needs_decision result + failure=null继续成功推进Attempt/Run为needs_decision并保留open Question。
  - 同一初始状态下，result=null + non-null failure继续成功推进Attempt/Run为needs_decision并持久化failure evidence。
  - cancel_requested Attempt继续canonical settle为canceled + result=null + failure=null；既有retry/conflict/Event语义不变。
  - typecheck、room-service focused、claude-runner pause focused、scope与full regression全部通过；不得删除、skip或弱化既有assertion。
  - actual Diff只包含本Contract scope及Codex另行维护的权威文档；未执行Git write或runtime cutover。

verification:
  - command: npm run typecheck
    detects: 最小validation与test fixture之间的TypeScript contract drift。
    decision_if_failed: 只修复本Fix类型错误；不得使用any、ts-ignore、skipLibCheck或新dependency。
  - command: node --test "tests/room-service.test.ts"
    detects: null/null仍被接受、invalid settlement产生partial durable write，或两种legal needs_decision/cancel-wins regression被破坏。
    decision_if_failed: 只修复existing canonicalSettlePayload的needs_decision branch或direct fixture；不得改变状态机、repository或Executor。
  - command: node --test "tests/claude-runner.test.ts"
    detects: service validation是否意外拒绝Executor实际产生的result-carrying或pause-failure evidence。
    decision_if_failed: 保持Executor不变，只修复service union validation；若Contract冲突则返回needs_decision。
  - command: node --test "tests/scope.test.ts"
    detects: scope外source/test、schema、new module、dependency或runtime文件是否进入Fix。
    decision_if_failed: 不放宽allowlist掩盖越界；移除越界修改或返回needs_decision。
  - command: npm test
    detects: 最小Fix是否破坏Stage 1 Current或Increment 10其它candidate public lifecycle。
    decision_if_failed: 只修复本Fix引入的回归；不得删除、skip或弱化既有assertion。
  - command: git diff --check && git status --short --branch
    detects: whitespace、staged/HEAD、unexpected path与candidate ownership drift。
    decision_if_failed: 不stage、清理、回滚或改写历史；只修复本Fix新增格式错误，归属不明时停止。

documentation_updates: []

question_policy: >
  若正确修复需要修改schema、transition、Executor、WorkerAdapter、repository、SQLite、public command、
  protocol version、scope外source/test、新module/dependency、active runtime/binding、v0.4 cutover、
  旧database或任何Git write，停止受影响工作并调用room_ask_question。existing needs_decision
  boolean条件与direct test case在本Contract冻结行为内可作最小实现选择，并在Coding Result记录。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: "2026-08-31T11:00:59.467Z"
```

## 3. Room 派发边界

- 本Fix Task已通过`room_submit_task`创建；one-shot Run `run-increment-010-fix-006`以process exit 0、Coding Result `completed`成功结算。
- Fix Review `review-increment-010-codex-003`无finding、Decision=`approved`；独立验证typecheck、room-service 63/63、claude-runner 51/51、scope 1/1与full 353/353全部通过。
- 用户已最终接受Review `review-increment-010-codex-003`与Increment 10；Current v0.3 Room=`ACCEPTED`。Increment 10 candidate在版本化与v0.4 cutover前仍不是Current implementation。
- stage、commit、push、v0.4 database/binding cutover与旧database删除均未授权。

## 4. 相关文档

- [Increment 10 Fix Task 1](./INCREMENT_10_FIX_TASK_1.md)
- [Increment 10 Accepted Contract](./INCREMENT_10_TASK_CONTRACT.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
