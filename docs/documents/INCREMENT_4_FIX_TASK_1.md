# Increment 4 Fix Task 1 — JSON Transport、Read-only CLI、Startup Gate 与 MCP Public-path Evidence

> 状态：Accepted
> 用户确认日期：2026-08-25
> Review ID：`review-increment-004-codex-001`
> Bootstrap transport：`claude -p --resume`（派发前恢复原 Increment 4 session ID）
> 派发状态：待用户/Codex 明确授权派发；当前为 `FIX_PLAN_READY`

```yaml
task_id: increment-004-room-mcp-status-cli-fix-001
room_id: bootstrap-codex-claudecode-room
type: fix
parent_task_id: increment-004-room-mcp-status-cli
based_on_review_id: review-increment-004-codex-001

background: >
  Increment 4 在 main、baseline_head 6bb99797c95e0ad99a7cd1b38350bf6a0d8e6c31
  上完成 candidate Coding。Codex Review 核对完整 staged/unstaged/untracked Diff、Accepted
  Contract、Coding Result、源码、测试与候选文档，并独立运行 typecheck、全量测试和三个
  public behavior probe。npm test 162/162 通过，但 npm run typecheck 在 room-mcp tests
  失败；raw MCP initialization 返回 text/event-stream，成功路径 cleanup 注册过晚；
  room:status 会对既存空 SQLite 文件创建 schema；room:serve 接受不存在的 project 并
  宣告 ready；MCP adapter tests 未直接覆盖 Contract 点名的失败、rollback 与 restart
  public paths。用户已确认以下五项 finding 与最小方案。

goal: >
  仅修复 Review 1 已确认的五项缺口，使 Increment 4 candidate 满足 strict typecheck、
  stateless JSON-response/request resource lifecycle、Status CLI read-only、runtime startup
  validation 与完整 MCP public-path evidence，同时保持既有 Room/Git/Runner authority、
  tool surface、schema、dependency 和 Increment 5/7 boundary 不变。

confirmed_findings:
  - finding_id: inc4-r1-typecheck
    solution: >
      在 tests/room-mcp.test.ts 的 SDK result boundary 使用最小 type guard 或明确的结构收窄
      后再读取 content text；不得使用 any、ts-ignore、关闭 strict check、修改 tsconfig 或
      放宽 SDK type。npm run typecheck 必须通过。
  - finding_id: inc4-r1-json-response-lifecycle
    solution: >
      为每个 request-owned StreamableHTTPServerTransport 显式启用 enableJsonResponse=true。
      在 handleRequest 前建立同一 idempotent cleanup owner；正常完成、connection close/abort
      与异常路径都必须关闭 request-owned McpServer/transport，多个 completion signal 不得导致
      underlying resource 重复关闭。增加 raw HTTP Content-Type 与可观察 cleanup direct regression。
  - finding_id: inc4-r1-status-read-only
    solution: >
      Status CLI 使用 new DatabaseSync(path, { readOnly: true }) 打开既存 database，继续复用
      当前 RoomService/shared snapshot boundary。有效 Room database 必须可读；既存空 database
      必须 non-zero 失败且不创建任何 Room table；missing path 继续失败且不得创建文件。
      不新增 repository abstraction、schema mode 或 migration。
  - finding_id: inc4-r1-runtime-startup-validation
    solution: >
      room:serve 在打开 database 前校验 --project 指向已存在目录；不存在或非目录时写 stderr、
      non-zero exit，且不得创建 --db 文件或输出 listening。Git repository/HEAD/clean gate 仍只在
      首次 Implementation submission 执行，不在 startup 提前强化。增加 invalid project、
      invalid/corrupt database、invalid port/args 与 bind failure 的 child-process regression。
  - finding_id: inc4-r1-public-path-matrix
    solution: >
      通过 in-process SDK client/raw HTTP 与 file-backed SQLite/temp Git fixture，直接覆盖 Contract
      点名的 missing repository/HEAD、invalid schema、wrong current entity、unresolved blocking
      Review、failure rollback、create retry/conflict 与 service restart persistence。测试必须调用
      对应 MCP route/tool，断言 tool error、Room/entity/Event durable state 和 cursor；RoomService、
      Git Observer 或共享 helper tests 不能替代 adapter public-path evidence。只有 direct regression
      暴露真实 adapter 缺陷时，才在本 Fix scope 内做最小实现修改。

requirements:
  - 只修复 review-increment-004-codex-001 的五项 confirmed finding。
  - /mcp/codex 与 /mcp/claude 必须继续使用 stateless per-request McpServer/transport，但每个 POST response 必须使用 application/json，不得返回 SSE stream、session ID、resumability token 或 background notification。
  - 每个 request 的 cleanup 必须由单一 idempotent owner 协调；正常 response 完成、client close/abort、server/transport connect failure 与 handler failure 均不得遗留 request-owned listener、server 或 transport。
  - cleanup regression 必须观察真实 request-owned resource 的 close 行为；不得只搜索源码字符串或仅证明 HTTP server 可以 stop。
  - actor authority 必须继续由两个 route 的 exact registration surface 决定；Codex 五个 tool、Claude 一个 tool 的名称与 schema 不变。
  - ProtocolError 继续映射稳定 {code,message} tool error；非 ProtocolError 继续由 SDK 处理，不增加 Room protocol error code或 stack exposure。
  - Status CLI 必须以 SQLite read-only connection 调用共享 snapshot；有效 database 调用前后 schema、Room、Task、Run、Review、Question 与 Event 均不变。
  - 既存空 SQLite file、missing Room、corrupt/unopenable database、invalid args 均必须 stderr + non-zero exit，不得输出成功 JSON；空 file 不得被初始化为 Room schema。
  - room:serve 必须在任何 database open/schema initialization 前拒绝 missing/non-directory project；失败不得创建 database 或输出 listening。
  - room:serve 对合法 directory 不提前执行 Git clean/HEAD gate；new-only Implementation clean gate、existing-ID retry/conflict order 与 Fix skip gate 保持不变。
  - bind/database/config failure 必须产生 non-zero process result；child-process tests 必须可靠终止自己创建的 server/process，并清理自己的 temporary fixture。
  - MCP public-path tests 必须直接覆盖 room_submit_task 的 missing repository/missing HEAD/dirty rollback、invalid schema，以及 room_submit_review、room_answer_question、room_accept_review、room_ask_question 的代表性 current-entity/blocked/idempotency/rollback failure。
  - file-backed database 上关闭第一套 HTTP app/connection 后，以新 DatabaseSync、RoomService 与 app 重新读取同一 Room state，直接证明 restart persistence。
  - tests 中 SDK result 必须经类型安全收窄；不得用 any、ts-ignore、skipLibCheck 或弱化 assertion 让 typecheck 变绿。
  - Fix Coding 完成后同步 Architecture、ROOM_PROTOCOL、MVP Plan、Operations 与 Development Log 的 candidate/REVIEW_REQUIRED 事实；用户接受前不得把 MCP/CLI/runtime 提升为 Current 或终止 bootstrap transport。

non_goals:
  - 新增或修改 Room state、transition、Event type、entity、SQLite table/field/schema、migration、protocol version、error code、Task/Run/Review/Question field。
  - 改变六个 MCP tool 的名称、actor、input/output schema、structuredContent、existing-ID idempotency/conflict、Git gate order或 RoomService transaction behavior。
  - 新增 dependency、修改 package scripts、package-lock、Node/npm engine、tsconfig、Zod/MCP SDK version 或 test framework。
  - 实现 SSE、stateful MCP session、notification、resumability、remote bind/auth、OAuth、TLS、health mutation、daemon manager、watch mode、backup/restore 或 automatic Runner control。
  - 把 Git repository/HEAD/clean validation移到 room:serve startup，或重新定义合法 project directory 下 missing service database 的创建语义。
  - 修改 RoomRepository/RoomService schema initialization、shared snapshot authority、Git Observer command set、Runner lifecycle 或 Increment 5 Question/Fix orchestration。
  - 修复未确认问题、重构 adapter、增加通用 resource manager/wrapper、compatibility layer、feature flag 或 speculative abstraction。
  - commit、push、stage、branch/worktree mutation、merge、rebase、reset、restore、clean、checkout 或历史改写。

architecture_decisions:
  - JSON response 是已冻结的 Streamable HTTP response mode；stateless 表示 transport 不保留 session，不表示使用 SSE stream。
  - request-owned McpServer/transport 的生命周期止于单个 HTTP request；cleanup owner 位于 src/mcp/http.ts，不上移到 RoomService 或 process-global registry。
  - Status CLI 的 read-only 保证由 SQLite connection mode enforcement；共享 RoomService/snapshot read path 保持不变，不建立第二个 read model。
  - project path shape validation 属于 runtime configuration boundary；Git repository、HEAD 与 cleanliness 仍由 existing Git Observer 在 new Implementation submission boundary 拥有。
  - adapter public path 是当前支持边界；共享 domain/helper regression 只能作为补充，不能替代每个 route/tool 的 transport、error 与 rollback evidence。

scope:
  - review_fixes_only
  - src/mcp/http.ts 的 JSON response 与 request-owned resource cleanup
  - src/mcp/serve.ts 的 project/startup validation 与失败顺序
  - src/cli/status.ts 的 SQLite read-only open
  - src/mcp/tools.ts 仅在新增 direct regression 证明现有 adapter mapping 违反 Accepted Contract 时做最小修复
  - tests/room-mcp.test.ts 的 type narrowing、raw transport、cleanup、failure/rollback/idempotency 与 restart regression
  - tests/status-cli.test.ts 的 valid read-only、existing-empty、missing/corrupt database regression
  - tests/room-serve.test.ts 的 runtime child-process startup/bind/config regression
  - tests/fixtures.ts 仅在上述 direct regression 需要复用最小 existing entity fixture 时调整
  - docs/documents/ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、OPERATIONS.md、DEVELOPMENT_LOG.md 的 candidate Fix 状态同步

constraints:
  - 保留原 Implementation lineage baseline_head 6bb99797c95e0ad99a7cd1b38350bf6a0d8e6c31。
  - 当前 branch 为 main，target worktree 为 D:/agent/case/codex-claudecode-room；Fix 继续修改当前未提交的完整 Increment 4 candidate Diff。
  - Fix 派发前必须恢复并记录原 Increment 4 Claude session ID；不得用新的无关 session 冒充同一 Fix lineage。
  - current dirty worktree 属于同一 Implementation lineage；Fix 不重新执行 clean-worktree gate，不覆盖、回滚、拆分或格式化既有 candidate。
  - request cleanup 的测试 seam 如确有必要，必须局限于 src/mcp/http.ts 与 tests/room-mcp.test.ts，不改变 product route/tool public contract，不形成 generic resource framework。
  - runtime test 使用 ephemeral loopback port 或显式占用的 temporary port；production --port 仍要求 1..65535，不新增默认 port 0。
  - Status CLI read-only solution使用 Node.js DatabaseSync 既有 readOnly option；不修改 repository schema initialization 来绕过只读失败。
  - public-path expected tool name、error code、Room state、entity/Event count、cursor 与 Content-Type 使用 Contract/protocol 的测试侧 literal，不从 implementation helper 导入 Oracle。
  - dependency baseline 精确保持 @modelcontextprotocol/sdk@1.30.0、zod@4.4.3、@types/express@5.0.6、@types/node@24.13.3、typescript@7.0.2。
  - 本 Fix Contract 由 Codex 维护；Claude 不修改、复制或把它报告为 Claude-owned changed file。
  - 不运行 formatter，不整理无关注释、命名、测试或文档。

acceptance_criteria:
  - npm run typecheck 通过，tests/room-mcp.test.ts 不含 any、ts-ignore、skipLibCheck 或未收窄的 unknown content indexing。
  - raw initialize、listTools 与 callTool POST response 的 Content-Type 为 application/json 且不包含 text/event-stream；两个 route 的 exact tool surface 与 cross-route rejection 不变。
  - 每个成功 request、ProtocolError request、SDK/internal failure 与 client close/abort 都触发同一 idempotent cleanup；underlying request-owned resource 不重复关闭且无遗留 listener/transport。
  - Status CLI 对有效 Room database 输出与 room_get_state 相同的 state/current identity/cursor，调用前后 schema/entity/Event 不变。
  - Status CLI 对既存空 SQLite file non-zero 失败，执行后 sqlite_master 仍没有 Room tables；missing path 仍不存在；corrupt/unopenable database 不输出成功 JSON。
  - room:serve 对 missing/non-directory project non-zero 失败、stderr 非空、stdout 不含 listening，且 missing --db path 仍不存在；合法 project directory 不因当前 worktree dirty 被 startup 拒绝。
  - room:serve invalid args/port、corrupt/unopenable database 与 occupied port bind failure 均 non-zero 退出，不输出 false-ready signal；正常合法配置只监听 127.0.0.1。
  - room_submit_task 经 MCP 对 missing repository 返回 git_repository_missing、missing HEAD 返回 git_head_missing、dirty worktree 返回 worktree_not_clean；各失败均不创建 Task/Event 或改变 Room state。
  - invalid tool input 由 SDK 返回 tool error 且不产生 durable write；ProtocolError 继续返回 stable {code,message} without stack。
  - submit review、answer question、accept review 与 ask question 的代表性 stale/wrong-current/blocking/retry/conflict failure 均直接经过对应 route/tool，并断言 Room/entity/Event/cursor rollback 或幂等不变。
  - 关闭并重新创建 file-backed DatabaseSync、RoomService 与 HTTP app 后，room_get_state 返回同一 Room state、current entity 与 cursor。
  - room_get_state cursor polling、waiting_actor/current entity、new-only Git gate/idempotency order、Status output、GET/DELETE 405 与 existing 162 regression behavior 继续通过。
  - dependency、package script、schema、state/transition、tool/error set 与 scope 不漂移；candidate 文档与实际修复、验证和未实现 Increment 5/7 boundary 一致。
  - Fix Coding Result 的 changed_files、tests、documentation_changes、verification、deviations、unresolved 与 questions 必须与实际完整 Diff 一致。

verification:
  - command: node --test "tests/room-mcp.test.ts" "tests/status-cli.test.ts" "tests/room-serve.test.ts"
    detects: JSON response/cleanup、SDK result typing、MCP public-path failure/rollback/restart、Status read-only 与 runtime startup/bind/config failure 是否闭环。
    decision_if_failed: 不得报告 completed；只修复五项 confirmed finding，若需要改变 protocol/schema/dependency/runtime boundary 则返回 needs_decision。
  - command: node --test "tests/room-state-snapshot.test.ts" "tests/room-service.test.ts" "tests/git-observer.test.ts" "tests/scope.test.ts"
    detects: Fix 是否破坏 shared snapshot authority、Room transaction/idempotency/current entity、Git failure semantics 或 exact module/dependency scope。
    decision_if_failed: 不得放宽既有 regression；定位 task-owned adapter/test错误，超出本 Fix scope则返回 needs_decision。
  - command: npm run typecheck
    detects: SDK call result/content narrowing、Express response lifecycle、DatabaseSync readOnly option 与 child-process fixture 的 TypeScript 偏移。
    decision_if_failed: 不得使用 any、ts-ignore 或配置绕过；仅修复本 Fix 范围的类型问题。
  - command: npm test
    detects: Fix 是否破坏 Protocol、Room、Git、Runner、MCP、CLI、Scope 或完整 lifecycle regression。
    decision_if_failed: 不得删除/放宽测试或跨 scope 清理；定位 task-owned regression，必要时返回 needs_decision。
  - command: git diff -- src/mcp/http.ts src/mcp/serve.ts src/cli/status.ts src/mcp/tools.ts tests/room-mcp.test.ts tests/status-cli.test.ts tests/room-serve.test.ts tests/fixtures.ts docs/documents/ARCHITECTURE.md docs/documents/ROOM_PROTOCOL.md docs/documents/MVP_PLAN.md docs/documents/OPERATIONS.md docs/documents/DEVELOPMENT_LOG.md
    detects: Fix 是否只包含 confirmed finding 的最小实现、direct regression 与 candidate 文档同步。
    decision_if_failed: 移除本 Fix 产生的越界修改；无法安全分离时返回 needs_decision。

documentation_updates:
  - path: docs/documents/ARCHITECTURE.md
    expected_change: 同步 candidate JSON response/request lifecycle、read-only CLI 与 startup validation 修复事实；接受前不提升为 Current。
  - path: docs/documents/ROOM_PROTOCOL.md
    expected_change: 同步 candidate transport/public-path evidence；不修改现有 tool/schema/state/error contract。
  - path: docs/documents/MVP_PLAN.md
    expected_change: 同步 Increment 4 Fix Coding verification 与再次 Review 状态，保持 Increment 5/7 boundary。
  - path: docs/documents/OPERATIONS.md
    expected_change: 同步 candidate command、read-only/startup failure 与 unavailable 状态；用户接受前不提供 Current runbook。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录 Fix 实际 Diff、direct regression、verification、deviation 与 REVIEW_REQUIRED 阶段。

question_policy: >
  若正确修复需要新增 dependency、Room state/transition/entity/schema/table/field/migration/error、
  改变 tool surface、Git gate/idempotency order、Runner lifecycle、MCP auth/session/SSE、package script、
  status output contract、room:serve missing-database semantics、Increment 5/7 boundary，或修改 scope 外
  product file，停止受影响工作并返回 needs_decision。新增 direct regression 暴露 src/mcp/tools.ts
  的 confirmed adapter defect 时允许最小修复并在 Coding Result 记录；其它新 finding 不夹带处理。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: 2026-08-25T11:18:28Z
```

## 派发边界

- 必须向 Claude Code 注入本文件全文；摘要、Review 消息或 finding 列表不能替代 Accepted Fix Task。
- Fix 使用当前 `main` worktree、原 Increment 4 baseline 与原 Claude session；不创建新 branch/worktree。
- 派发前必须记录 exact original session ID、target worktree、branch、baseline 与 task owner。
- 本文件创建和用户对解决方案的确认不构成 Claude Coding 派发、真实 Claude 调用、commit、push 或其他 Git 写权限。

## 相关文档

- [Increment 4 Accepted Task Contract](./INCREMENT_4_TASK_CONTRACT.md)
- [Architecture](./ARCHITECTURE.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [MVP Plan](./MVP_PLAN.md)
- [Operations](./OPERATIONS.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
