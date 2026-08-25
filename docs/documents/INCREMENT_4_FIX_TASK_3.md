# Increment 4 Fix Task 3 — Stale Submit-Review MCP Direct Evidence

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（由用户在原 Increment 4 session 中人工派发） |
| 创建/确认日期 | 2026-08-25 |
| Review ID | `review-increment-004-codex-003` |
| Parent Task | `increment-004-room-mcp-status-cli` |
| Lineage baseline | `6bb99797c95e0ad99a7cd1b38350bf6a0d8e6c31` |
| Target | `main` / `D:/agent/case/codex-claudecode-room` |

```yaml
task_id: increment-004-room-mcp-status-cli-fix-003
room_id: bootstrap-codex-claudecode-room
type: fix
parent_task_id: increment-004-room-mcp-status-cli
based_on_review_id: review-increment-004-codex-003

background: >
  Increment 4 Fix Task 2 已完成 candidate Coding。Codex Review 3 独立确认 actual
  McpServer/StreamableHTTPServerTransport cleanup、write-tool durable rollback、
  room_submit_review/room_ask_question retry-conflict 与 stale accept evidence 已闭环，
  npm run typecheck、MCP 26/26、相关 69/69 与全量 185/185 均通过。但当前
  room_submit_review MCP failure regression 只让当前 Run 保持 running，命中的是
  non-succeeded status guard；它没有在新 completed Run 已成为 current 后，通过真实
  /mcp/codex route 用新 review_id 重放旧 succeeded Run，因而不能直接证明 wrong-current
  guard 的 ProtocolError mapping、Review rollback、Room/current identity、Event 与 cursor
  不变。用户已确认 Review 3 finding 与以下最小方案。

goal: >
  仅补齐 room_submit_review 对 stale succeeded Run / wrong-current 的 MCP public-path
  direct regression，证明现有 current-Run guard 经 adapter 后保持 validation_failed 与
  durable state 不变；若 regression 通过则不修改任何 source。

confirmed_findings:
  - finding_id: inc4-r3-submit-review-stale-public-path
    solution: >
      在 tests/room-mcp.test.ts 构造两轮真实 Room lifecycle：run-1 succeeded 并提交
      review-1 后，经 Fix Task 完成 run-2，使 run-2 成为 current completed Run；随后通过
      /mcp/codex 的 room_submit_review，以新的 review_id 引用旧 run-1。调用前后使用既有
      room_get_state snapshot 直接比较 Room/current Task/current Run/current Review、Event
      list/count 与 cursor，并断言 validation_failed、stale Review 不存在。预期现有 adapter
      行为直接通过；只有该 regression 失败并证明 src/mcp/tools.ts mapping defect 时才允许
      对该文件做对应最小修复。

requirements:
  - 只修复 review-increment-004-codex-003 的一个 confirmed finding；review_fixes_only。
  - 新 regression 必须通过真实 /mcp/codex POST、SDK Client 与 room_submit_review tool，不能直接调用 RoomService.submitReview 代替。
  - fixture 必须先完成 task-1/run-1/review-1，再提交已确认 Fix Task task-2、完成 run-2，使 Room 为 REVIEW_REQUIRED 且 run-2 是 current completed Run。
  - stale command 必须使用从未持久化的新 review_id，引用 task-1/run-1；不得用既有 review-1 retry 冒充新的 stale command。
  - stale command 必须返回测试侧 literal validation_failed；不得从 implementation helper、error classifier 或 transition table 导入 expected code。
  - 调用前后必须经既有 MCP room_get_state snapshot 断言完整 durable state 相等，包括 Room state、current Task/Run/Review、Event list/count 与 cursor。
  - 必须额外断言 stale review_id 未持久化，Room 仍为 REVIEW_REQUIRED，current Task/Run 分别为 task-2/run-2。
  - 既有 room_submit_review legal create、same-ID/same-content retry 与 same-ID/different-content conflict tests 必须继续通过；不得复制或弱化这些场景。
  - regression 通过时不得修改 source。只有 regression 失败并证明 MCP adapter mapping defect 时，才允许最小修改 src/mcp/tools.ts，并在 Coding Result 精确记录 failing evidence 与修复。
  - 不修改 src/mcp/http.ts、cleanup seam/owner、RoomService、repository、snapshot、Git Observer、Runner、Status CLI、room:serve、protocol/schema/error 或 dependency。
  - 完成后只把 Fix 3 candidate Coding、实际 test/source diff 与 verification 写入 DEVELOPMENT_LOG；再次 Review 与用户接受前不得把 MCP/CLI/runtime 提升为 Current。

non_goals:
  - 新增 Room state/transition/Event/entity/schema/table/field/migration/protocol version/error code。
  - 修改 current Run authority、submitReview transaction/idempotency/guard order 或 RoomService regression。
  - 修改 actual request cleanup、observeRequestResource、onRequestCleanedUp、JSON response 或 HTTP resource ownership。
  - 增加新的 test helper、generic lifecycle builder、matrix framework、wrapper、compatibility layer 或 feature flag；优先复用既有 fixture 与 snapshot helper。
  - 扩展 retry/conflict、其它 write tool、Status CLI、room:serve、restart、Git gate、Increment 5/7 或 packaging scope。
  - 修改 package.json、package-lock.json、tsconfig、dependency、package script、SDK/Zod/Node/npm version。
  - 修复其它未确认问题、整理命名/注释/格式、运行 formatter，或修改本 Contract。
  - stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout 或历史改写。

architecture_decisions:
  - current completed Run 的 authority 继续来自 RoomService 既有 latest run_completed Event；本 Fix 只补 MCP adapter direct evidence，不改变 authority 或 transaction。
  - 同 ID retry/conflict 与新 stale command 是不同分类；本 regression 必须使用新 review_id，避免把既有幂等路径误判为 stale lifecycle command。
  - public MCP route 是本次 evidence boundary；RoomService 已有 stale succeeded Run test 只能作为补充，不能替代 adapter evidence。
  - 本 Task 不改变 product architecture/protocol，因此不新增 ADR 或 protocol version。

scope:
  - review_fixes_only
  - tests/room-mcp.test.ts 的单一 stale succeeded Run / wrong-current room_submit_review MCP regression
  - src/mcp/tools.ts 仅在 direct regression 证明 adapter mapping defect 时做最小修复
  - docs/documents/DEVELOPMENT_LOG.md 的 candidate Coding/verification 事实

constraints:
  - 保留原 Implementation lineage baseline_head 6bb99797c95e0ad99a7cd1b38350bf6a0d8e6c31。
  - 当前 branch 为 main，target worktree 为 D:/agent/case/codex-claudecode-room；继续修改当前未提交的完整 Increment 4 candidate Diff。
  - 用户必须在原 Increment 4 Claude session/conversation 中人工派发；若当前不是该 session，停止并报告，不得创建无关新 session 冒充 lineage。
  - current dirty worktree 属于同一 Implementation lineage；不重新执行 clean-worktree gate，不覆盖、回滚、拆分或格式化既有 candidate。
  - 测试使用既有 makeTask/makeRun/makeReview/makeFixTask/makeCodingResult/makeTerminalEvidence、startApp/connect/snapshot helper；只有现有 helper 无法表达 confirmed scenario 时才允许局部新增最小 test code。
  - expected review_id、task_id、run_id、Room state 与 error code 使用测试侧 literal；不得从 product implementation 导入 Oracle。
  - tests/room-mcp.test.ts 当前为原 Increment 4 lineage 的 untracked candidate file；Coding Result 必须精确说明新增 test，Codex 再次 Review 将读取完整文件，不能用 tracked-only git diff 冒充 Fix 3 delta。
  - dependency baseline 保持 @modelcontextprotocol/sdk@1.30.0、zod@4.4.3、@types/express@5.0.6、@types/node@24.13.3、typescript@7.0.2。
  - 本 Fix Contract 由 Codex 维护；Claude 不修改、复制或把它报告为 Claude-owned changed file。

acceptance_criteria:
  - 真实 /mcp/codex room_submit_review 以新 review_id 引用旧 succeeded run-1 时返回 validation_failed。
  - 失败后 stale Review 不存在，Room 仍为 REVIEW_REQUIRED，current Task/Run 仍为 task-2/run-2，current Review 与调用前一致。
  - 调用前后 public snapshot deepEqual，直接证明 Event list/count、cursor 与其它 durable state 均未变化。
  - 测试若错误引用 current run-2 或复用 review-1，应无法满足 stale-trigger assertions；测试名必须准确描述 stale succeeded Run / wrong-current route。
  - 既有 cleanup、Task failures、answer/accept/ask failures、review/question retry-conflict、stale accept、actor surface、JSON response、snapshot、Status CLI、room:serve、Git gate 与 restart tests 继续通过。
  - npm run typecheck、聚焦 MCP suite 与 npm test 通过；不使用 any、ts-ignore、skipLibCheck 变更、弱化 assertion 或删除既有 test。
  - 实际 Fix 3 Diff 只包含本 Task scope；若 regression 直接通过，source 文件保持不变。
  - Coding Result 的 changed_files、deviations、verification、tests、documentation_changes、unresolved 与 questions 与实际文件/Git 状态一致。

verification:
  - command: node --test "tests/room-mcp.test.ts"
    detects: stale succeeded Run 经真实 MCP room_submit_review 是否命中 wrong-current guard，并保持 Review/Room/current identity/Event/cursor 不变。
    decision_if_failed: 不得报告 completed；先区分 test fixture 错误与 adapter mapping defect，只允许本 Contract 指定的最小修复，超出 scope 返回 needs_decision。
  - command: npm run typecheck
    detects: 新 lifecycle fixture、MCP result narrowing 与 snapshot assertion 是否造成 TypeScript 偏移。
    decision_if_failed: 不得使用 any、ts-ignore 或配置绕过；仅修复本 Task 的 test/type 问题。
  - command: npm test
    detects: 新 direct regression 或允许的最小 adapter 修复是否破坏完整 Protocol、Room、Git、Runner、MCP、CLI 与 Scope regression。
    decision_if_failed: 不得删除或弱化既有测试；定位本 Task regression，超出 scope 返回 needs_decision。
  - command: git status --short --branch
    detects: branch、staged 状态或 task-owned path set 是否漂移；同时确认 tests/room-mcp.test.ts 仍属于原 lineage 的 untracked candidate。
    decision_if_failed: 不得 stage、清理或覆盖既有 candidate；报告无法安全分离的 scope drift。

documentation_updates:
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录 Fix Task 3 的实际 test/source diff、stale public-path evidence、verification、deviation 与 REVIEW_REQUIRED candidate 状态；用户接受前不提升 runtime capability。

question_policy: >
  若正确修复需要修改 src/mcp/http.ts、RoomService、repository、snapshot、Git/Runner/CLI/serve，
  新增 dependency、Room state/transition/entity/schema/table/field/migration/error，改变 tool
  surface/input/output、transaction/idempotency/current authority、cleanup ownership、package script
  或 Increment 5/7 boundary，停止受影响工作并返回 needs_decision。只有 direct regression 证明
  src/mcp/tools.ts 的 adapter mapping defect 时允许最小 source 修复；其它新 finding 不夹带处理。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: 2026-08-25T14:16:04Z
```

## 人工派发边界

- 用户已确认 Review 3 finding 与最小方案，但尚未授权 Codex 调用 Claude；由用户在原 Increment 4 Claude session/conversation 中人工派发本文。
- 派发必须注入本文全文；标准客户端支持 `@<path>` 时使用本文末尾指令。
- 若客户端不能保证解析 `@<path>`，用户必须粘贴本文完整内容，不能只发送 finding 摘要。
- 本次确认不授权 stage、commit、push、branch/worktree、merge、rebase、reset、clean、checkout、真实 paid smoke 或其它 Git 写操作。

## 人工派发指令

```text
执行 @docs/documents/INCREMENT_4_FIX_TASK_3.md 中已批准的完整 Fix Task。严格遵守其中的 scope、non_goals、constraints、verification 和 question_policy；完成后按 Coding Result Contract 返回结果。
```

## 相关文档

- [Increment 4 Task Contract](./INCREMENT_4_TASK_CONTRACT.md)
- [Increment 4 Fix Task 1](./INCREMENT_4_FIX_TASK_1.md)
- [Increment 4 Fix Task 2](./INCREMENT_4_FIX_TASK_2.md)
- [Architecture](./ARCHITECTURE.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [MVP Plan](./MVP_PLAN.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
