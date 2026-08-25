# Increment 4 Fix Task 2 — Request Cleanup 与 MCP Durable-state Direct Evidence

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（由用户在原 Increment 4 session 中人工派发） |
| 创建/确认日期 | 2026-08-25 |
| Review ID | `review-increment-004-codex-002` |
| Parent Task | `increment-004-room-mcp-status-cli` |
| Lineage baseline | `6bb99797c95e0ad99a7cd1b38350bf6a0d8e6c31` |
| Target | `main` / `D:/agent/case/codex-claudecode-room` |

```yaml
task_id: increment-004-room-mcp-status-cli-fix-002
room_id: bootstrap-codex-claudecode-room
type: fix
parent_task_id: increment-004-room-mcp-status-cli
based_on_review_id: review-increment-004-codex-002

background: >
  Increment 4 Fix Task 1 已完成 candidate Coding。Codex Review 2 独立确认
  npm run typecheck、聚焦 34/34 与全量 180/180 通过，JSON response、Status CLI
  read-only 与 room:serve project startup gate 已闭环；但 Accepted Fix Task 的两项
  direct evidence 仍不完整。现有 cleanup regression 只计数 onRequestCleanedUp callback，
  没有构造 client abort/connection close 或 non-ProtocolError handler/internal failure，
  也不能证明实际 McpServer/transport close boundary。现有 MCP failure tests 多数没有
  同时断言 Room/entity/Event/cursor rollback，且除 room_submit_task 外没有直接覆盖
  create retry/conflict/idempotency public path。用户已确认 Review 2 的两个 finding 与
  以下最小方案，并选择自行人工派发本 Accepted Fix Task。

goal: >
  仅补齐 Review 2 确认的 request-owned cleanup 与 MCP durable-state/idempotency
  public-path direct evidence；只有新增 direct regression 证明当前 adapter 确有缺陷时，
  才做对应最小 source 修复，同时保持既有 Room/Git/Runner authority、tool/schema/error、
  dependency、runtime command 与 Increment 5/7 boundary 不变。

confirmed_findings:
  - finding_id: inc4-r2-cleanup-direct-evidence
    solution: >
      在 tests/room-mcp.test.ts 直接观察实际 McpServer.close 与
      StreamableHTTPServerTransport.close boundary，不能只计数 onRequestCleanedUp。
      用真实 raw HTTP client 在 request-owned resource 已创建后主动 abort/close，另用
      non-ProtocolError tool handler/internal failure 经过真实 MCP route；分别断言同一
      request 的实际 server/transport 被关闭且无 late duplicate close。为可靠同步或观察
      所需的 test seam 必须局限于 src/mcp/http.ts，不形成 generic resource framework。
      若 direct regression 证明当前 closeOnce 对同一 underlying resource 产生重复或遗漏
      close，只在 src/mcp/http.ts 按 SDK ownership 做最小修复。
  - finding_id: inc4-r2-public-path-durable-matrix
    solution: >
      经对应 MCP route/tool 捕获调用前后 public Room snapshot 与必要 entity fact，直接断言
      error/result、Room state/current identity、Event count/list 与 cursor。补齐现有
      room_submit_task failure、room_submit_review、room_answer_question、room_accept_review、
      room_ask_question 的 rollback/blocked/current-entity assertion；对代表性非 Task create
      public path 增加 same ID/same content retry 与 same ID/different content conflict，证明
      created=false/既有 entity、无新增 Event 与 id_conflict durable-state 不变。不得用
      RoomService/shared helper tests 替代 MCP adapter evidence。

requirements:
  - 只修复 review-increment-004-codex-002 的两个 confirmed finding；review_fixes_only。
  - cleanup tests 必须通过真实 /mcp/codex 或 /mcp/claude POST 创建 request-owned McpServer/transport。
  - abort regression 必须在 server 已创建该 request resource 后由 client 主动关闭连接，并直接观察实际 close；不得用正常 response completion 冒充 abort。
  - internal-failure regression 必须让 non-ProtocolError 从真实 tool handler/application dependency 进入 SDK/internal tool-error path，并证明 request resource cleanup；不得只使用 invalid schema 或 ProtocolError。
  - actual close Oracle 必须绑定实际 McpServer.close/StreamableHTTPServerTransport.close invocation 或等价 resource boundary；onRequestCleanedUp 只可用于同步或补充，不能作为唯一 Oracle。
  - 每个被测 request 的 actual close count 必须稳定且无 late duplicate；测试结束必须恢复所有 spy/hook 并关闭自己创建的 client/server/temporary fixture。
  - durable-state matrix 必须使用测试侧 literal expected state/error/tool name，不从 implementation helper、transition table 或 classifier 导入 Oracle。
  - failure 前后必须同时比较 Room state、相关 entity、Event sequence/list 与 cursor；new create rollback 不得留下 entity/Event/transition。
  - same-ID/same-content retry 必须返回既有 entity/created=false 且不新增 Event；same-ID/different-content 必须返回 id_conflict 且 durable state 不变。
  - existing room_submit_task missing repository/HEAD/dirty/invalid-schema regression 必须补齐 Event/cursor 不变 assertion。
  - room_submit_review、room_answer_question、room_accept_review、room_ask_question 的现有 failure regression 必须补齐对应 entity/Event/cursor 不变 assertion；create retry/conflict 至少直接覆盖 room_submit_review 与 room_ask_question。
  - 只有 direct regression 失败并证明 adapter defect 时，才允许最小修改 src/mcp/http.ts 或 src/mcp/tools.ts；测试先失败、source 修复后通过，并在 Coding Result 精确记录。
  - 不改变 JSON response、actor-scoped exact tool surface、ProtocolError mapping、RoomService transaction/idempotency、shared snapshot、Status CLI 或 room:serve 行为。
  - 完成后只把 Fix 2 candidate Coding、实际 source/test diff 与 verification 写入 DEVELOPMENT_LOG；再次 Review 与用户接受前不得把 MCP/CLI/runtime 提升为 Current。

non_goals:
  - 新增 Room state/transition/Event/entity/schema/table/field/migration/protocol version/error code。
  - 修改 package.json、package-lock.json、tsconfig、dependency、package script、SDK/Zod/Node/npm version。
  - 重构 MCP adapter、RoomService、repository、snapshot、Git Observer、Runner、Status CLI 或 room:serve。
  - 新增 generic resource manager、wrapper、factory framework、compatibility layer、feature flag、session registry 或 background cleanup loop。
  - 实现 SSE、stateful MCP session、notification、resumability、remote auth/bind、health mutation、Runner control 或 Increment 5/7 能力。
  - 修改已闭环的 JSON Content-Type、Status read-only、startup project validation 或 SDK result type narrowing，除非本 Task 新 regression 直接证明回归。
  - 修复其它未确认问题、整理命名/注释/格式、运行 formatter，或修改本 Contract。
  - stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout 或历史改写。

architecture_decisions:
  - request-owned resource lifecycle 仍由 src/mcp/http.ts 的单一 idempotent cleanup owner 持有；本 Fix 只补真实 close evidence，并在 evidence 证明缺陷时收窄其实现。
  - MCP adapter public path 是当前支持边界；RoomService regression 只能补充，不能证明 route/tool 的 error mapping 与 durable-state 结果。
  - Room state、entity 与 Event sequence 继续是 durable rollback/idempotency Oracle；不新增 mirror、hash、counter table 或测试专用持久化状态。
  - 本 Task 不改变 product architecture/protocol，因此不新增 ADR 或 protocol version。

scope:
  - review_fixes_only
  - tests/room-mcp.test.ts 的 actual cleanup、abort/internal failure、durable rollback 与 retry/conflict public-path regression
  - src/mcp/http.ts 仅用于局部 test synchronization/observation seam，或 direct regression 证明的 actual cleanup defect 最小修复
  - src/mcp/tools.ts 仅在 direct public-path regression 证明 adapter mapping defect时最小修复
  - tests/fixtures.ts 仅在上述 MCP fixture 需要最小复用时调整
  - docs/documents/DEVELOPMENT_LOG.md 的 candidate Coding/verification 事实

constraints:
  - 保留原 Implementation lineage baseline_head 6bb99797c95e0ad99a7cd1b38350bf6a0d8e6c31。
  - 当前 branch 为 main，target worktree 为 D:/agent/case/codex-claudecode-room；继续修改当前未提交的完整 Increment 4 candidate Diff。
  - 用户必须在原 Increment 4 Claude session/conversation 中人工派发；若当前不是该 session，停止并报告，不得创建无关新 session 冒充 lineage。
  - current dirty worktree 属于同一 Implementation lineage；不重新执行 clean-worktree gate，不覆盖、回滚、拆分或格式化既有 candidate。
  - test seam 必须位于 src/mcp/http.ts 的 request-owned boundary，名称与职责只服务本 Contract 的同步/实际 close observation；不得向 RoomService/process-global state 扩散。
  - spy/hook 修改必须在 finally/t.after cleanup 中恢复，不能污染同文件后续测试或全量 suite。
  - abort/internal failure tests 必须有确定的 completion signal 与有限 timeout，不使用不受控 sleep 作为唯一同步条件。
  - expected tool/error/state/Event/cursor 使用 Contract/ROOM_PROTOCOL 的测试侧 literal；不得从 product implementation 导入 Oracle。
  - dependency baseline 保持 @modelcontextprotocol/sdk@1.30.0、zod@4.4.3、@types/express@5.0.6、@types/node@24.13.3、typescript@7.0.2。
  - 本 Fix Contract 由 Codex 维护；Claude 不修改、复制或把它报告为 Claude-owned changed file。

acceptance_criteria:
  - cleanup regression 直接构造正常 success、ProtocolError、SDK invalid input、non-ProtocolError handler/internal failure 与 client abort/connection close。
  - 每个上述 request 的实际 McpServer/transport close 都被直接观察；同一 request 无遗漏或 late duplicate close，测试结束无遗留 listener/transport/client/server。
  - 删除或绕过实际 resource close 会使 cleanup regression 失败；仅触发 onRequestCleanedUp 不能使测试通过。
  - room_submit_task missing repository/HEAD/dirty/invalid input 经 MCP 失败后，Task 不存在、Room state、Event list/count 与 cursor 全部不变。
  - room_submit_review 的 stale/wrong-current rollback、same-content retry、different-content conflict 经 MCP 直接证明 entity/Room/Event/cursor 与 created/error 语义。
  - room_ask_question 的 stale/non-running rollback、same-content retry、different-content conflict 经 Claude route 直接证明 entity/Room/Run/Event/cursor 与 created/error 语义。
  - room_answer_question 已回答/stale failure 与 room_accept_review blocking/stale failure 经 Codex route 直接证明相关 entity、Room、Event/cursor 不变。
  - 既有 actor surface、cross-route rejection、JSON Content-Type、Status CLI、room:serve、snapshot、Git gate、restart persistence 与全量 180 regression 继续通过。
  - npm run typecheck 与 npm test 通过；不使用 any、ts-ignore、skipLibCheck 变更、弱化 assertion 或删除既有 test。
  - 实际 Diff 只包含本 Task scope；若没有 direct regression 证明 source defect，source 文件保持不变。
  - Coding Result 的 changed_files、verification、tests、documentation_changes、deviations、unresolved 与 questions 与实际 Git/Diff 一致，并明确哪些 source change 由哪个 failing regression 触发。

verification:
  - command: node --test "tests/room-mcp.test.ts"
    detects: actual resource close、client abort、internal failure、MCP durable rollback 与 create retry/conflict direct evidence 是否闭环。
    decision_if_failed: 不得报告 completed；只修复两个 confirmed finding，若需要扩大 architecture/protocol/dependency 则返回 needs_decision。
  - command: node --test "tests/room-state-snapshot.test.ts" "tests/room-service.test.ts" "tests/git-observer.test.ts" "tests/status-cli.test.ts" "tests/room-serve.test.ts" "tests/scope.test.ts"
    detects: Fix 是否破坏 shared snapshot、Room transaction/idempotency、Git failure、Status read-only、startup gate 或 exact scope。
    decision_if_failed: 不得放宽既有 regression；定位本 Task 造成的回归，超出 scope 则返回 needs_decision。
  - command: npm run typecheck
    detects: cleanup observation/test hook、SDK types 与 public-path fixture 的 TypeScript 偏移。
    decision_if_failed: 不得使用 any、ts-ignore 或配置绕过；仅修复本 Task 类型问题。
  - command: npm test
    detects: Fix 是否破坏完整 Protocol、Room、Git、Runner、MCP、CLI、Scope lifecycle regression。
    decision_if_failed: 不得删除/弱化测试或跨 scope 清理；定位本 Task regression，必要时返回 needs_decision。
  - command: git diff -- src/mcp/http.ts src/mcp/tools.ts tests/room-mcp.test.ts tests/fixtures.ts docs/documents/DEVELOPMENT_LOG.md
    detects: 实际修改是否仅追溯到两个 confirmed finding，且没有夹带其它 source/test/document change。
    decision_if_failed: 移除本 Fix 产生的越界修改；无法安全分离时返回 needs_decision。

documentation_updates:
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录 Fix Task 2 的实际 source/test diff、direct evidence、verification、deviation 与 REVIEW_REQUIRED candidate 状态；用户接受前不提升 runtime capability。

question_policy: >
  若正确修复需要新增 dependency、Room state/transition/entity/schema/table/field/migration/error、
  改变 tool surface/input/output、RoomService transaction/idempotency、Git/Runner/snapshot/CLI/serve
  行为、MCP auth/session/SSE、package script、Increment 5/7 boundary，或修改 scope 外 product
  file，停止受影响工作并返回 needs_decision。direct regression 证明 src/mcp/http.ts 或
  src/mcp/tools.ts 的当前 adapter defect 时允许最小修复并精确记录；其它新 finding 不夹带处理。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: 2026-08-25T12:51:51Z
```

## 人工派发边界

- 用户在原 Increment 4 Claude session/conversation 中人工派发本文件；Codex 本轮不调用 Claude。
- 派发必须注入本文件全文；标准客户端支持 `@<path>` 时使用本文末尾给出的指令。
- 若客户端不能保证解析 `@<path>`，用户必须粘贴本文件完整内容，不能只发送 finding 摘要。
- 本次确认和人工派发不授权 stage、commit、push、branch/worktree、merge、rebase、reset、clean、checkout、真实 paid smoke 或其它 Git 写操作。

## 人工派发指令

```text
执行 @docs/documents/INCREMENT_4_FIX_TASK_2.md 中已批准的完整 Fix Task。严格遵守其中的 scope、non_goals、constraints、verification 和 question_policy；完成后按 Coding Result Contract 返回结果。
```

## 相关文档

- [Increment 4 Task Contract](./INCREMENT_4_TASK_CONTRACT.md)
- [Increment 4 Fix Task 1](./INCREMENT_4_FIX_TASK_1.md)
- [Architecture](./ARCHITECTURE.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [MVP Plan](./MVP_PLAN.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
