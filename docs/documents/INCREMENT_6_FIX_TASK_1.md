# Increment 6 Fix Task 1 — Retry Negative Evidence and Current-Task Source Semantics

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（由用户在原 Increment 6 session 中人工派发） |
| 创建/确认日期 | 2026-08-26 |
| Review ID | `review-increment-006-codex-002` |
| Parent Task | `increment-006-end-to-end-mvp-runtime` |
| Lineage baseline | `7ac639a30ab2a94170ef69498e065fb16e77f833` |
| Current manual dispatch HEAD | `7ac639a30ab2a94170ef69498e065fb16e77f833`；派发前重新读取 live Git |
| Target | `main` / `D:/agent/case/codex-claudecode-room` |

```yaml
task_id: increment-006-end-to-end-mvp-runtime-fix-001
room_id: agent-room-main
type: fix
parent_task_id: increment-006-end-to-end-mvp-runtime
based_on_review_id: review-increment-006-codex-002

background: >
  Increment 6 已从 clean exact main baseline 完整重新执行。Codex Review 2 确认
  Review 1 的 dispatch baseline、CLI route/database/main wiring 与四个 coordination
  tool public evidence 已闭合，npm run typecheck 与全量 239/239 均通过。Review 2 仍确认
  两项 Medium finding：Accepted Contract 点名的 missing/non-failed/non-terminal retry
  source 尚无直接 regression；以及 Accepted 文字把旧 Task 的 failed Event 称作 stale
  source 必须拒绝，而现有实现与测试把它视为 current Task 无 retry source。用户已确认
  以下最小方案：补齐三类直接 evidence，并采用现有实现的 current-Task source 语义。

goal: >
  仅闭合 review-increment-006-codex-002 的两项 confirmed finding：为三类损坏的
  current-task retry source 补齐 Runner public-boundary 零副作用 regression，并使协议与
  Accepted Contract 明确旧 Task 的 failed Event 不属于新 current Task 的 retry source；
  除非新测试暴露真实缺陷，不修改 production behavior。

confirmed_findings:
  - finding_id: inc6-r2-retry-negative-matrix-incomplete
    solution: >
      在 tests/claude-runner.test.ts 通过 runClaude public boundary 直接构造三类 persisted
      retry-source 异常：latest run_failed Event 引用不存在的 Run、引用 current Task 的
      non-failed Run、引用 current Task 的 failed 但 completed_at 为空的 Run。每一类都断言
      existing ProtocolError、完整 durable snapshot 前后 deepEqual、fake process invocation=0、
      未创建新 Run、未创建 artifact，且 worktree authority 不变。优先使用窄小的本地 SQLite
      fixture mutation；只有测试证明现有 guard 失败时才允许最小 production 修复。
  - finding_id: inc6-r2-stale-source-semantics
    solution: >
      确认 retry source 必须属于 current Task。latest run_failed Event 若引用旧 Task 的 Run，
      该 Event 对新 current Task 不构成 source，按无 source 的 new_implementation 处理并继续
      既有 clean-baseline gate；caller 提交 stale/wrong taskId 仍拒绝。保留现有实现与回归，
      只修正文档中的 ambiguous stale-source wording，不新增 pointer、query、state 或 Event。

requirements:
  - 只修复 review-increment-006-codex-002 的两项 confirmed finding；review_fixes_only。
  - 在 runClaude public boundary 分别构造 missing source Run、current Task non-failed source Run、current Task failed 但 completed_at 为空的 source Run；不得以 helper-only 或 repository-only test 替代。
  - 三类异常均须在 spawn、新 Run、artifact 与新 Event 之前返回现有 ProtocolError；error code 使用测试侧 literal，不从 implementation classifier 或 allowed table 导入。
  - 每个异常场景在调用前保存并在拒绝后 deepEqual 完整 public durable snapshot：Room、current Task、所有 fixture-owned Run、Review、Question、Event list 与 cursor；missing source 场景还须证明被引用 Run 仍不存在。
  - 每个异常场景断言 fake process invocation count 为 0、目标 run_id 不存在、对应 artifact 目录不存在，并以调用前后 Git evidence 或明确 fixture 文件/HEAD 证明 worktree authority 未变化。
  - 测试 fixture 可在 temporary file-backed SQLite 中做最窄的 Event/Run 状态构造，以表达正常 public lifecycle 无法生成但 Accepted Contract 明确要求拒绝的损坏 persisted state；不得为测试新增 production mutation API、schema、migration或通用 corruption framework。
  - latest run_failed Event 引用旧 Task Run时，getContinuationContext/runClaude 对新 current Task 保持 new_implementation 语义；首次 Implementation 的 clean exact baseline gate仍适用。保留或最小调整既有直接 regression，使测试名称与 assertion明确该语义。
  - caller传入非current taskId仍以现有ProtocolError拒绝；该 stale caller case不得与旧Task Event case合并或改成new_implementation。
  - 只有新增direct regression失败并证明现有RoomService/Runner guard存在真实缺陷时，才允许在既有最窄boundary做修复；若三类测试直接通过，production source必须保持不变。
  - 既有coordination tools、one-shot CLI、acceptance/failure E2E、retry happy/null-session/HEAD drift、MCP、Git、Scope与全部regression继续通过。
  - 只把本Fix实际test/source Diff、verification、deviation与REVIEW_REQUIRED candidate事实写入DEVELOPMENT_LOG；用户接受前不得把Increment 6提升为Current。

non_goals:
  - 改变旧 Task failed Event 对新 current Task 的既有 new_implementation behavior。
  - 扫描历史 Event寻找较早的同Task failure、增加active/failed Run pointer、retry counter、queue、backoff、automatic retry或second authority。
  - 新增或修改Room state、transition、Run status、Event type、entity、schema/table/migration、protocol version、error code或dependency。
  - 修改MCP tool surface、CLI arguments/exit contract、session/baseline ownership、Git observer、artifact layout、CodingResult或Increment 5 continuation semantics。
  - 新增generic snapshot/corruption framework、wrapper、compatibility layer、feature flag、hash/checksum、package script或scope allowance。
  - 真实Claude smoke、network、paid process、stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout、stash删除或其它清理。

architecture_decisions:
  - retry source是current Task scoped authority，不是Room-wide history：只有latest run_failed Event引用current Task的terminal failed Run时才进入retry；引用旧Task Run等价于current Task无retry source。
  - missing Event target或current Task source的status/completed_at不合法表示durable reference损坏，必须拒绝；stale caller taskId是独立的current-entity validation，也必须拒绝。
  - Event/reference、Run status与completed_at继续是唯一现有authority；本Fix不增加schema、pointer、query hierarchy或protocol version。
  - direct negative evidence穿过runClaude并在preflight前后比较完整authority；test-only fixture mutation不建立production interface。

scope:
  - review_fixes_only
  - tests/claude-runner.test.ts 中三类retry-source direct negative regression及必要的最小fixture/snapshot helper
  - tests/room-service.test.ts 中仅在既有旧Task Event regression的名称或assertion需要与confirmed语义对齐时作最小调整
  - src/room/room-service.ts 或 src/runner/claude-runner.ts 仅在新增direct regression证明现有guard存在真实缺陷时作最小修复
  - docs/documents/DEVELOPMENT_LOG.md 中Fix Task 1 candidate Coding/verification事实

constraints:
  - 保留原Implementation lineage baseline_head 7ac639a30ab2a94170ef69498e065fb16e77f833。
  - 当前branch为main、target worktree为D:/agent/case/codex-claudecode-room；继续使用当前完整Increment 6 candidate Diff，不重新执行clean-worktree gate。
  - 派发前必须重新读取live branch/HEAD/status，确认HEAD仍为原lineage baseline、0 staged，并确认existing candidate与Codex-owned planning文档的path ownership；本字段不授权commit或amend。
  - 用户在原Increment 6 Claude session/conversation中人工派发；若当前不是该session，停止并报告，不得创建无关新session冒充lineage。
  - 当前dirty worktree包含同一Implementation lineage source/test/config candidate与Codex-owned Review/Fix planning文档；不得覆盖、回滚、拆分、stage、格式化或修改scope外既有candidate。
  - Claude不得修改PROJECT_RULES、Architecture、ROOM_PROTOCOL、ADR、MVP、Operations、README、原Implementation Contract或本Fix Contract；这些confirmed semantics由Codex维护。
  - 测试必须使用temporary owner directory、deterministic fake process与local fixture，并在finally释放database/process handles和临时目录；不得读取operator全局Claude settings或调用外部network。
  - 不得删除、弱化或改名规避既有assertion；只有与confirmed语义不一致的单条旧Task Event测试名称/说明可做最小对齐。

acceptance_criteria:
  - missing source Run、current Task non-failed source Run、current Task failed但completed_at为空三类场景均直接调用runClaude并返回测试侧literal ProtocolError。
  - 每类拒绝均发生在spawn/new Run/artifact/Event之前：fake process invocation=0、目标run_id不存在、artifact目录不存在，完整Room/Task/Run/Review/Question/Event list/cursor snapshot前后deepEqual，worktree authority不变。
  - latest run_failed Event引用旧Task Run时，新current Task仍被分类为new_implementation并执行既有clean exact baseline gate；不扫描或继承旧Task session/baseline。
  - stale/wrong caller taskId仍拒绝且完整durable snapshot不变；不得因旧Task Event语义澄清而放宽current Task identity guard。
  - 若三类新增regression直接通过，src production Diff相对Review 2 candidate保持不变；若未通过，source修改仅覆盖被测试证明的最窄guard缺陷并在Coding Result记录deviation。
  - npm run typecheck、focused Runner/RoomService tests、E2E/CLI/MCP/Git/Status/Scope regression与npm test全部通过；full suite不启动真实Claude。
  - Coding Result完整包含changed_files、deviations、每个verification的status/result、tests、documentation_changes、unresolved与questions，且数量与live output一致。

verification:
  - command: node --test "tests/room-service.test.ts" "tests/claude-runner.test.ts"
    detects: 三类current-task retry source损坏是否经public Runner boundary拒绝且零副作用，以及旧Task Event/new Implementation与stale caller语义是否保持分离。
    decision_if_failed: 先修正本Fix test fixture/assertion；只有证明确为现有guard缺陷时才做最小source修复，若需要改变confirmed semantics则返回needs_decision。
  - command: node --test "tests/e2e-workflow.test.ts" "tests/runner-cli.test.ts" "tests/room-mcp.test.ts"
    detects: Fix是否破坏actual MCP、one-shot CLI、failure recovery、coordination tool或complete workflow wiring。
    decision_if_failed: 不得绕过product boundary或放宽既有assertion；只修复本Fix引入的回归，超出confirmed scope返回needs_decision。
  - command: node --test "tests/git-observer.test.ts" "tests/room-serve.test.ts" "tests/status-cli.test.ts" "tests/scope.test.ts"
    detects: worktree evidence、runtime/status与frozen source/test/document boundary是否退化。
    decision_if_failed: 不得用generic allowance、Git mutation或scope扩张绕过；报告并停止超出本Fix的缺陷。
  - command: npm run typecheck
    detects: retry fixture、snapshot与conditional source change是否产生TypeScript偏移。
    decision_if_failed: 不得使用any、ts-ignore、skipLibCheck或compatibility wrapper；仅修复本Fix引入的类型问题。
  - command: npm test
    detects: 新negative matrix是否破坏完整Protocol、Room、Git、Runner、MCP、CLI与Scope regression，或意外启动真实Claude。
    decision_if_failed: 不得删除/弱化测试或调用真实Claude确认；只修复task-owned regression，超出scope返回needs_decision。
  - command: git diff --name-only
    detects: 本Fix净新增path是否超出允许的test、conditional source与DEVELOPMENT_LOG scope。
    decision_if_failed: 不得回滚既有lineage candidate；报告scope外新增Diff并停止。
  - command: git status --short --branch
    detects: branch、staged/untracked状态或candidate ownership是否漂移。
    decision_if_failed: 不得stage、清理、回滚或覆盖既有candidate；报告无法安全分离的drift。

documentation_updates:
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录Fix Task 1实际test/source Diff、三类direct Oracle、live verification、deviation与REVIEW_REQUIRED candidate状态；用户接受前不提升Current capability。

question_policy: >
  若新增direct regression要求改变用户已确认的旧Task Event/new Implementation语义，或需要新增/修改
  Room state、transition、Run status、Event type、entity、schema/table/migration、protocol/error、MCP、
  CLI contract、dependency、scope、daemon/scheduler/framework，启动真实或paid Claude，或执行Git mutation，
  停止受影响工作并返回needs_decision。三类test fixture的局部构造、明确snapshot helper命名与只有测试证明
  必要时的最窄existing guard修复由Claude判断并在Coding Result记录。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: 2026-08-26T14:42:41Z
```

## 人工派发边界

- 用户已确认Review 2的两项finding与上述最小solution；Fix Task 1为Accepted，但未授权Codex启动Claude。
- 用户继续在原Increment 6 Claude session/conversation中人工派发本文；派发前确认该session、`main`、live `HEAD`、原lineage baseline、0 staged与当前candidate path ownership。
- 标准客户端支持`@<path>`时使用本文末尾指令；不能保证解析时必须注入本文全文，不得只发送finding摘要。
- 本次确认不授权真实Claude smoke、stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout、stash删除或其它清理。

## 人工派发指令

```text
执行 @docs/documents/INCREMENT_6_FIX_TASK_1.md 中已批准的完整 Fix Task。严格遵守其中的 confirmed_findings、review_fixes_only、scope、non_goals、constraints、verification、documentation_updates 和 question_policy；优先补齐三类 direct regression，只有测试证明现有 guard 存在真实缺陷时才允许最小修改 production source。完成后按 ROOM_PROTOCOL.md 的 Coding Result Contract 返回完整结果。不要执行 stage、commit、push、branch/worktree、reset、restore、clean、checkout、stash删除或其它清理操作。
```

如果人工客户端不能可靠解析`@docs/documents/INCREMENT_6_FIX_TASK_1.md`，必须把本文件完整内容直接注入同一次prompt；不得只发送上面一行或自行摘要Contract。

## 相关文档

- [Increment 6 Task Contract](./INCREMENT_6_TASK_CONTRACT.md)
- [Architecture](./ARCHITECTURE.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [MVP Plan](./MVP_PLAN.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
