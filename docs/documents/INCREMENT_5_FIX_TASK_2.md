# Increment 5 Fix Task 2 — Contract-Named Regression Oracles

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（由用户在原 Increment 5 session 中人工派发） |
| 创建/确认日期 | 2026-08-26 |
| Review ID | `review-increment-005-codex-002` |
| Parent Task | `increment-005-decision-fix-resume` |
| Lineage baseline | `bcb9a9f9da451d64b4787d3967c0032cbc453602` |
| Current manual dispatch HEAD | `60683dd96aea24e8c2d3d7173a84c716cddbfabf`；派发前重新读取 live Git |
| Target | `main` / `D:/agent/case/codex-claudecode-room` |

```yaml
task_id: increment-005-decision-fix-resume-fix-002
room_id: agent-room-main
type: fix
parent_task_id: increment-005-decision-fix-resume
based_on_review_id: review-increment-005-codex-002

background: >
  Increment 5 Fix Task 1 已按 review-increment-005-codex-001 的 confirmed solution
  修复 Question 后 progress routing、answer 后 completed finalization retry/conflict 顺序与
  baseline mismatch fake-process isolation。Codex Review 2 独立验证 typecheck、聚焦 82/82、
  Git/MCP/Scope 45/45 与全量 207/207 均通过，未发现新的 source/runtime behavior、architecture、
  protocol、state、schema、Event type、dependency 或 scope 缺陷。Review 2 仅确认三项 Accepted
  Fix Task 1 已点名但现有 tests 尚未完整证明的 Oracle：同一 pause stream 的 Question 前后
  progress 分界、answer 后 retry/conflict 的完整 durable snapshot 不变，以及 baseline mismatch
  的 Room/Event/cursor 零副作用。用户已确认三项 finding 与以下最小 test-only solution。

goal: >
  仅补齐 review-increment-005-codex-002 的三项 confirmed test-evidence finding，使现有
  Fix Task 1 实现通过 Contract 点名的事件顺序、完整 durable-state snapshot 与零副作用
  direct regression；不修改任何 source/runtime behavior。

confirmed_findings:
  - finding_id: inc5-r2-pause-sequence-oracle
    solution: >
      调整 tests/claude-runner.test.ts 的既有 post-question fake-process regression，在同一
      Run/process 中先发送 init 与至少一个 interpreter 可识别的非终态 running progress，确认
      此时恰好追加一个 run_progress；随后经真实 RoomService.askQuestion 把 Run原子置为
      needs_decision，再发送 assistant/tool_result 等可识别非终态 progress与needs_decision
      terminal。最终按 Event sequence直接证明既有run_progress发生在question_asked之前，
      question_asked之后没有新增run_progress，同时仍恰好一个run_paused、零run_completed/
      run_failed并完成全部pause evidence。不得修改src/runner/claude-runner.ts或放宽实现断言。
  - finding_id: inc5-r2-finalization-snapshot-oracle
    solution: >
      调整 tests/room-service.test.ts 的answer后finalization retry/conflict regression：在
      finalizeNeedsDecision成功并answerQuestion后保存完整Run、Question、Room、Event list与
      cursor snapshot；same-payload retry必须返回created=false且前后完整snapshot deepEqual；
      different-payload必须返回literal id_conflict且前后完整snapshot deepEqual。不得只比较
      selected field或Event count，不修改src/room/room-service.ts。
  - finding_id: inc5-r2-baseline-zero-side-effect-oracle
    solution: >
      扩充tests/claude-runner.test.ts的baseline mismatch regression：在调用runClaude前保存
      完整Room与Event list/cursor，validation_failed后deepEqual；继续保留guaranteed-unequal
      valid hex、injected fake spawner、invocation count=0、Run不存在与artifact不存在断言，
      直接证明Run/process/artifact/Event/cursor/Room均无副作用。

requirements:
  - 只修复review-increment-005-codex-002的三项confirmed finding；review_fixes_only、test-only。
  - pause sequence必须位于同一runClaude fake-process execution，不能用独立RoomService unit test或另一个普通success Run替代Question前后边界。
  - Question前的line必须由ClaudeStreamInterpreter识别为非终态progress并实际产生恰好一个run_progress Event；init/result或返回null的line不满足。
  - Question后的assistant/tool-related line必须由interpreter识别为非终态progress，但不得产生新的run_progress；以Event sequence而非仅总数证明分界。
  - pause sequence最终仍持久化completed_at、session、exit、result/failure、Git evidence、artifact refs；Room/Run保持NEEDS_DECISION/needs_decision，恰好一个question_asked与run_paused，零run_completed/run_failed。
  - answer后same-payload retry与different-payload conflict必须分别比较完整Run、Question、Room、Event list与cursor；snapshot必须在操作前保存，不能从实现helper生成期望。
  - baseline mismatch必须在调用前保存Room与Event/cursor，并在拒绝后完整deepEqual；保留零spawn、零Run、零artifact断言。
  - 不得修改任何src文件、MCP test、Git Observer test、scope allowlist、package metadata、dependency、config或Fix Task 1。
  - 若新增direct assertion暴露真实source/runtime行为不满足Accepted Contract，停止受影响工作并返回needs_decision；不得把本test-only Fix扩大为source修复。
  - 既有decision/fix continuation、pause failure matrix、MCP pause gate、Git evidence、scope与全部regression继续通过。
  - 只把Fix Task 2 candidate test Diff、实际verification、deviation与REVIEW_REQUIRED状态写入DEVELOPMENT_LOG；用户接受前不得把Increment 5提升为Current。

non_goals:
  - 修改src/runner/claude-runner.ts、src/room/room-service.ts、src/git/git-observer.ts或其它source/runtime文件。
  - 新增或修改Room state、transition、Run status、Event type、entity、schema/table/migration、protocol version或error code。
  - 改变progress routing、finalization payload signature、continuation lineage、session/baseline authority、Git/artifact/process pipeline或failure precedence。
  - 新增helper module、generic snapshot framework、wrapper、compatibility layer、feature flag、hash/checksum、dependency、package script或scope allowance。
  - 修改MCP tool surface、Room initialization、Runner CLI/daemon/scheduler、Increment 6/7或其它未确认finding。
  - 真实Claude smoke、network、paid process、stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout或历史改写。

architecture_decisions:
  - 本Fix只补test Oracle，不改变Fix Task 1已确认并实现的runtime behavior；现有Room Run status、completed_at/pause payload与lineage Run继续分别拥有progress eligibility、finalization retry/conflict与resume authority。
  - Event sequence是progress/question顺序与cursor的独立durable Oracle；测试保存public RoomService返回的完整entity/Event snapshot，不导入实现私有helper生成期望。
  - baseline mismatch rejection继续发生在Run/process/artifact/Event创建前；fake process seam只证明process boundary未被调用，不建立新的runtime path。

scope:
  - review_fixes_only
  - tests/claude-runner.test.ts 中pause progress event-order与baseline mismatch零副作用Oracle
  - tests/room-service.test.ts 中answer后finalization retry/conflict完整snapshot Oracle
  - docs/documents/DEVELOPMENT_LOG.md 中Fix Task 2 candidate Coding/verification事实

constraints:
  - 保留原Implementation lineage baseline_head bcb9a9f9da451d64b4787d3967c0032cbc453602。
  - 当前branch为main、target worktree为D:/agent/case/codex-claudecode-room；继续使用当前完整Increment 5 candidate Diff，不重新执行clean-worktree gate。
  - 当前manual dispatch HEAD为60683dd96aea24e8c2d3d7173a84c716cddbfabf，派发前必须重新读取live branch/HEAD/status并确认原baseline仍是HEAD ancestor；本字段不授权commit或amend。
  - 用户在原Increment 5 Claude session/conversation中人工派发；若当前不是该session，停止并报告，不得创建无关新session冒充lineage。
  - 当前dirty worktree包含同一Implementation lineage source/test candidate与Codex-owned Review/planning文档；不得覆盖、回滚、拆分、stage、格式化或修改scope外既有candidate。
  - Claude只修改scope列出的两个test文件与DEVELOPMENT_LOG；不得修改PROJECT_RULES、Architecture、ROOM_PROTOCOL、ADR、MVP、Operations、README、Fix Task 1或本Fix Contract。
  - 测试期望必须使用测试侧literal Event type、error code与完整public snapshot；不得从private signature、classifier或实现导出的allowed table生成Oracle。
  - fake process/temp repository不得读取operator全局Claude settings、调用真实network或启动Claude；fixture owner path在finally删除。

acceptance_criteria:
  - 同一fake Run中，Question前至少一个可识别progress产生恰好一个run_progress，且其sequence小于question_asked；Question后至少一个可识别assistant/tool-related progress不增加run_progress。
  - 同一fake Run完成pause finalization：Room=NEEDS_DECISION、Run=needs_decision、completed_at与全部evidence非空、恰好一个question_asked与run_paused、零run_completed/run_failed。
  - 删除现有Question后progress guard会使该同一sequence regression稳定失败；测试不依赖init/result空progress绕过。
  - finalization成功并answerQuestion后，same-payload retry返回created=false，完整Run/Question/Room/Event list/cursor前后deepEqual。
  - answer后的different-payload返回literal id_conflict，完整Run/Question/Room/Event list/cursor前后deepEqual。
  - baseline mismatch对任意合法actual commit hash构造不同expected hash，返回literal validation_failed；Room/Event list/cursor前后deepEqual，未创建Run/artifact且fake spawner invocation count为0。
  - 实际source/runtime Diff相对Fix Task 1 Coding Result保持不变；本Fix新增Diff只包含两个test文件与DEVELOPMENT_LOG candidate事实。
  - npm run typecheck、聚焦suite、Git/MCP/Scope regression与npm test全部通过；full suite不依赖或启动真实Claude。
  - Coding Result完整包含changed_files、deviations、每个verification的status/result、tests、documentation_changes、unresolved与questions，且测试数量与live output一致。

verification:
  - command: node --test "tests/room-service.test.ts" "tests/claude-runner.test.ts"
    detects: 同一pause stream的Question前后progress Event顺序、answer后完整snapshot retry/conflict与baseline mismatch零副作用Oracle是否闭合。
    decision_if_failed: 不得报告completed或修改source；若仅为test fixture/assertion错误则在本scope修正，若暴露runtime缺陷则返回needs_decision。
  - command: node --test "tests/git-observer.test.ts" "tests/room-mcp.test.ts" "tests/scope.test.ts"
    detects: test-only变更是否破坏continuation Git evidence、MCP pause gate或frozen scope boundary。
    decision_if_failed: 不得放宽既有assertion或scope allowlist；定位test-only回归，超出scope返回needs_decision。
  - command: npm run typecheck
    detects: snapshot类型、Event sequence与fake-process fixture的TypeScript偏移。
    decision_if_failed: 不得使用any、ts-ignore、skipLibCheck或compatibility wrapper；只修复本Fix test类型问题。
  - command: npm test
    detects: 新Oracle是否破坏完整Protocol、Room、Git、Runner、MCP、CLI与Scope regression，或意外调用真实Claude。
    decision_if_failed: 不得删除/弱化测试或调用真实Claude确认；只修复test-owned regression，runtime缺陷返回needs_decision。
  - command: git diff --name-only
    detects: Fix Task 2净新增path是否超出两个test文件与DEVELOPMENT_LOG。
    decision_if_failed: 不得回滚既有lineage candidate；报告scope外新增Diff并停止。
  - command: git status --short --branch
    detects: branch、staged/untracked状态或candidate ownership是否漂移。
    decision_if_failed: 不得stage、清理、回滚或覆盖既有candidate；报告无法安全分离的drift。

documentation_updates:
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录Fix Task 2实际test Diff、三项Oracle、live verification、deviation与REVIEW_REQUIRED candidate状态；用户接受前不提升Current capability。

question_policy: >
  若新增Contract-named assertion暴露需要修改任何source/runtime behavior，或需要新增/修改Room
  state、transition、Run status、Event type、entity、schema/table/migration/protocol/error、MCP、
  package/dependency/scope、Runner CLI/daemon/scheduler/framework，启动真实或paid Claude，或执行
  Git mutation，停止受影响工作并返回needs_decision。其它新finding只报告、不夹带修复；两个
  test文件内最小fixture/helper与snapshot命名由Claude判断并在Coding Result记录。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: 2026-08-26T08:57:51Z
```

## 人工派发边界

- 用户已确认Review 2的三项finding与上述最小test-only solution；Fix Task 2为Accepted，但未授权Codex启动Claude。
- 用户继续在原Increment 5 Claude session/conversation中人工派发本文；派发前确认该session、`main`、live `HEAD`、原lineage baseline ancestry、0 staged与当前candidate/untracked Contract path set；未经独立Git授权不得为满足clean状态而提交、stage或清理本文。
- 标准客户端支持`@<path>`时使用本文末尾指令；不能保证解析时必须注入本文全文，不得只发送finding摘要。
- 本次确认不授权documentation commit、真实Claude smoke、stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout或清理。

## 人工派发指令

```text
执行 @docs/documents/INCREMENT_5_FIX_TASK_2.md 中已批准的完整 Fix Task。严格遵守其中的 confirmed_findings、review_fixes_only、scope、non_goals、constraints、verification、documentation_updates 和 question_policy；本 Task 仅允许修改两个 test 文件与 DEVELOPMENT_LOG，若新断言暴露 source/runtime 缺陷则返回 needs_decision，不得修改 source。完成后按 ROOM_PROTOCOL.md 的 Coding Result Contract 返回完整结果。不要执行 stage、commit、push、branch/worktree、reset、restore、clean 或清理操作。
```

如果人工客户端不能可靠解析`@docs/documents/INCREMENT_5_FIX_TASK_2.md`，必须把本文件完整内容直接注入同一次prompt；不得只发送上面一行或自行摘要Contract。

## 相关文档

- [Increment 5 Task Contract](./INCREMENT_5_TASK_CONTRACT.md)
- [Increment 5 Fix Task 1](./INCREMENT_5_FIX_TASK_1.md)
- [Architecture](./ARCHITECTURE.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [MVP Plan](./MVP_PLAN.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
