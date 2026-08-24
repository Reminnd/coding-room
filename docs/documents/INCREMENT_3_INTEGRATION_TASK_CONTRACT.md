# Increment 3 Integration Task Contract — Claude Runner Orchestration

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（由用户在完成 dispatch gate 后人工派发） |
| 创建日期 | 2026-08-24 |
| 用户确认日期 | 2026-08-24 |
| Parent goal | Increment 3 — Claude Runner |
| 关联 leaf commits | 3A `86c77a7c68b953343d67da3857859b0dd6d6c09c`；3B `1062a7500f8bb3e22c7c3818ddcac2e9eb625efa` |
| 当前 main | `320c730497b02ce7ae91e1dadc906fffe2a10a9f` |
| Bootstrap transport | `claude -p`；必须注入本文件获批后的全文 |

## 1. 结论与确认边界

本 Accepted Contract 把两个已接受 leaf 组合为一个最小 central Runner，并完成 Increment 3 已批准的 lifecycle 修正、terminal evidence 持久化、失败映射和 fake-process end-to-end 验收。

用户已于 2026-08-24 确认本 Contract，并决定暂时由用户人工派发。该确认只批准本文件中的完整 Implementation Task，不自动授权 Codex 执行任何 Git 写操作或 Claude Coding 派发：

- `confirmed_by_user=true`，项目阶段进入 `PLAN_READY`；
- documentation baseline commit、Integration branch/worktree 与 exact leaf commit 组合仍未执行；
- 用户只有在 Integration worktree clean、实际 `baseline_head` 已记录且本 Accepted Contract 位于目标 worktree 后，才人工派发 Coding；
- 本次确认不授权 Codex commit、cherry-pick、merge、branch/worktree mutation、Coding 派发、push 或清理；
- 不运行真实 Claude smoke，不产生模型费用。

```yaml
task_id: increment-003-claude-runner-integration
room_id: bootstrap-codex-claudecode-room
type: implementation
parent_task_id: null
based_on_review_id: null

background: >
  Increment 1 已交付 Protocol/State Core，Increment 2 已交付只读 Git Observer。
  Increment 3 Scope Scaffold 已集成；Claude Process Transport leaf commit
  86c77a7c68b953343d67da3857859b0dd6d6c09c 与 Claude Stream Interpreter leaf commit
  1062a7500f8bb3e22c7c3818ddcac2e9eb625efa 均已通过两轮 Review、获用户接受并独立提交。
  两个 leaf 只分别拥有 OS process fact 与 stream-json meaning，尚未连接 RoomService、
  Git Observer、artifact、terminal transition 或完整 Runner failure classification。
  用户已确认 CODING 覆盖 Runner claim 后的 process startup、MCP initialization、Coding
  与 result collection；startup/init failure 继续通过 CODING -> RUN_FAILED 结束，不增加 Room state。

goal: >
  交付一个最小 Claude Runner orchestration，使一个已批准 Task Contract 在 clean Git worktree
  上通过 accepted Process Transport 与 Stream Interpreter 执行，并且只依据 process、init、
  CodingResult、Git 与 artifact 的实际 evidence，把 Run 原子结束为 REVIEW_REQUIRED 或 RUN_FAILED。

requirements:
  - 在独立 Integration branch/worktree 中，从用户授权后形成的 clean integration baseline 开始；该 baseline 必须包含 main documentation baseline 与两个 exact accepted leaf commits。
  - 实现单一 central Runner public operation；input 至少包含 RoomService、run/task identity、target worktree、expected baseline_head、serialized Room MCP config、start/resume mode 与 nullable exact resumeSessionId。
  - Runner 必须从 RoomService 读取已持久化且 confirmed_by_user=true 的完整 TaskContract，并构造包含该完整 structured content 的 prompt；不得接受摘要代替 persisted Contract，也不得从普通文本猜测 Task。
  - process 启动前调用 establishCleanBaseline；repository/HEAD/dirty error 原样拒绝，且不得创建 Run、Event、artifact 或 CODING transition。
  - actual HEAD 必须等于 dispatch metadata 中的 expected baseline_head；不相等时以 validation_failed 拒绝且保持 Room/Run/Event 不变。
  - start mode 必须要求 resumeSessionId=null 并调用 RoomService.startRun；resume mode 必须要求 non-empty exact resumeSessionId 并调用 RoomService.resumeRun；不得使用 --continue 或推断最近 session。
  - RoomService.startRun/resumeRun 必须先 atomic 创建 running Run 并进入 CODING，之后 Runner 才启动 Claude process 和验证 MCP init；同步修正 ROOM_PROTOCOL 中 PLAN_READY/FIX_PLAN_READY -> CODING 的前置条件，不增加 STARTING Room state 或 PLAN_READY -> RUN_FAILED transition。
  - 复用 accepted startClaudeProcess、serializeCodingResultCliSchema、ClaudeStreamInterpreter 与 REQUIRED_ROOM_TOOL_NAME；不得复制 CLI flags、schema normalization、JSONL parser 或 required-tool authority。
  - Process stdout line 必须只交给 ClaudeStreamInterpreter；stderr 不进入 interpreter。Runner 可以保存 raw line/chunk artifact，但不得建立第二套 JSON parser 或从 assistant text/result string 恢复缺失 CodingResult。
  - 对 ClaudeStreamInterpreter 做最小 integration seam 扩展：非终态 line 可以向 Runner 返回 ClaudeProgressEvidence；failure outcome 必须携带已可靠观察到的 nullable sessionId 与既有 progress evidence。不得改变 init、tool、terminal 或 CodingResult authority。
  - RoomService 增加最小 current-running Run progress operation，把 progress 追加为 entity_type=run 的非终态 Event；progress write 不改变 Room/Run state，stale/non-running Run 必须 validation_failed 且不新增 Event。
  - RoomService.completeRun/failRun 必须在各自现有 transaction 内持久化 terminal evidence：claude_session_id、process_exit_code、git_evidence、artifact_refs，以及 result 或 failure；不得由 Runner 直接写 repository/SQLite 或绕过 state transition。
  - raw stdout 与 stderr 必须写入 target repository root 下 .agent-room/artifacts/<run-id>/stdout.jsonl 与 stderr.log；Run.artifact_refs 使用 repository-root-relative path，artifact 保持 Git ignored，不保存 Task/Review JSON mirror 或权威 diff.patch。
  - process 结束或 transport failure 后，Runner 必须调用 collectCompletionEvidence；即使 Run 失败也保留并持久化已成功观察到的 staged/unstaged/untracked path，绝不 reset、restore、clean、stage 或 commit target worktree。
  - 成功必须同时满足：process exitCode=0 且 signal=null、唯一有效 init 含 exact REQUIRED_ROOM_TOOL_NAME、session 一致、唯一 valid terminal、CodingResult.status=completed、CodingResult.task_id 匹配、completion Git evidence 成功、stdout/stderr artifact 成功。满足后只调用一次 completeRun 进入 REVIEW_REQUIRED。
  - ClaudeProcessStartError 与 ClaudeProcessInputError 映射 claude_start_failed；non-zero exit 或 signal 映射 claude_exit_failed；init_missing/init_error/init_duplicate/required_tool_missing 映射 room_mcp_unavailable；其它 interpreter/session/terminal/schema/task/status failure 映射 coding_result_invalid。
  - completion Git observation command failure 映射新增 git_evidence_failed；artifact 写入失败映射新增 artifact_write_failed。两者加入 ProtocolErrorCode 与 ROOM_PROTOCOL minimum error set，不增加 retry、fallback 或 parallel terminal path。
  - terminal classification 必须有单一 settlement owner；无论 process、stream、Git 或 artifact 出现几个 failure，RoomService.completeRun/failRun 总计最多调用一次，且后续 event 不得改写已确定 terminal result。
  - 更新 tests/scope.test.ts 只允许 exact central runner file 和本 Task 已批准的既有 runner leaf files；继续拒绝 src/mcp、src/cli、额外 top-level module 与 dependency drift。
  - 同步 Architecture、ROOM_PROTOCOL version、ADR-0002、MVP Plan、Operations 与 Development Log 的 candidate implementation facts；Increment 3 Review/用户接受前不得把 Runner 写成 main Current capability。

non_goals:
  - Room MCP server、Streamable HTTP、MCP SDK、六个 MCP tool handler 或真实 Room MCP connection；属于 Increment 4。
  - 完整 NEEDS_DECISION answer/resume product flow、Fix Task lineage orchestration 或 Question recovery；属于 Increment 5。Integration 只连接 explicit start/resume mode 与既有 RoomService operation。
  - Status CLI、service daemon、production database path、background scheduler、timeout/kill/retry/backoff、parallel Run 或 automatic wakeup。
  - 修改 accepted CLI flags、tool lists、schema normalization、JSONL event authority、CodingResult schema 或 Git command set。
  - 新 dependency、package/lockfile/tsconfig 变化、ORM、generic process/event/artifact framework、plugin registry、compatibility layer 或 feature flag。
  - 自动 commit、push、merge/cherry-pick、branch/worktree 创建或清理；这些由 Codex 在各自用户授权下执行，不属于 Claude Coding。
  - 真实 Claude smoke 或任何产生模型费用的测试；本机 Claude Code 2.1.241 capability 已由前置受限 smoke 冻结，本 Task 使用 fake process。

architecture_decisions:
  - CODING 从 Runner atomic claim/create Run 开始，覆盖 startup、MCP initialization、Coding 与 result collection；现有 CODING -> RUN_FAILED 是 startup/init/result/evidence failure 的唯一 Room terminal failure path。
  - Process Transport 继续只拥有 OS/process/prompt-delivery fact；Stream Interpreter 继续只拥有 stdout event meaning；central Runner 唯一组合这些 fact 并映射 Room failure/terminal transition。
  - Git 是 source/diff authority，SQLite Run 是 lifecycle/evidence reference authority，artifact 只保存大体积 raw stdout/stderr；三者不互相镜像。
  - RoomService 是 Run durable write 与 state transition 的唯一 boundary；Runner 不直接访问 repository 或 SQLite。
  - terminal evidence 与 Run status 在同一 RoomService transaction 内提交，避免 succeeded/failed Run 缺少已观察 process/Git/artifact evidence。
  - git_evidence_failed 与 artifact_write_failed 是真实 Integration failure 的最小机器可处理语义；不把观察失败降级为空 evidence，也不错误复用 claude/coding-result error。
  - Protocol version 从 0.1-design 提升为 0.2-design，并在 ADR-0002 追加已批准的 CODING/startup-init lifecycle clarification；不新增 Room state、entity、table 或 migration。

scope:
  - 组合并只读复用 accepted leaf commits 86c77a7c68b953343d67da3857859b0dd6d6c09c 与 1062a7500f8bb3e22c7c3818ddcac2e9eb625efa
  - src/runner/claude-runner.ts 的 central orchestration、prompt、artifact 与 terminal classification
  - src/runner/claude-stream.ts 的最小 progress/failure evidence integration seam
  - src/room/room-service.ts 的 progress append 与 atomic terminal evidence persistence boundary
  - src/protocol/errors.ts 的 git_evidence_failed 与 artifact_write_failed
  - tests/claude-runner.test.ts 及其最小 fake-process/temp-repository fixture
  - tests/claude-stream.test.ts、tests/room-service.test.ts、tests/scope.test.ts 中直接受上述 seam/contract 影响的 regression
  - docs/documents/ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、OPERATIONS.md、DEVELOPMENT_LOG.md 与 ADR/0002-agent-integration-lifecycle.md 的 candidate/current-state synchronization

constraints:
  - pre-dispatch Git metadata 必须记录 main documentation baseline、两个 accepted source commits、integration branch/worktree、组合后的 exact baseline_head 与 task owner；这些不是 Room Task schema field。
  - Claude 开始时 integration worktree 必须 clean，HEAD 必须包含两个 exact leaf commits；Claude 不执行 cherry-pick/merge/commit/stage/checkout。
  - 不修改 src/runner/claude-process.ts、tests/claude-process.test.ts 或两个 accepted leaf fixture，除非实际 integration Review 形成并经用户确认的新 finding。
  - 对 src/runner/claude-stream.ts 的修改只限 progress delivery 与 failure partial evidence，不改变 frozen authority 或现有 success/failure reason。
  - 不修改 src/git 的 command/process behavior；Git observation failure 在 Runner semantic boundary 映射，Git Observer 继续抛 ProtocolError/GitCommandError。
  - 不修改 SQLite table/schema、Task/CodingResult/Run field shape 或 state transition pair；只更新既有 Run fields 的写入时机和 protocol wording/version。
  - 关键 ownership、terminal precedence、atomic evidence、progress non-authority 与 failure mapping必须有必要的简体中文注释，不逐行复述代码。
  - fake process/temp repository 测试不得依赖 operator 全局 Claude settings、真实网络或真实 Room MCP server；所有临时资源在 finally 删除其 owner path。

acceptance_criteria:
  - pre-run non-repository、missing HEAD、dirty worktree 与 baseline mismatch 均不创建 Run/Event/artifact，不进入 CODING。
  - valid new-session fake Run 从 PLAN_READY 进入 CODING，再以 exit 0、required tool、valid completed CodingResult、Git evidence 与 artifacts 进入 REVIEW_REQUIRED；持久化 non-null sessionId、exitCode=0、actual baseline、三类 evidence 与两个 relative artifact refs。
  - valid explicit resume fake Run 只使用 exact resumeSessionId，RoomService.resumeRun 进入 CODING，init/terminal session 全部匹配并成功完成；start mode 拒绝 non-null resumeSessionId，resume mode 拒绝 null/empty sessionId。
  - fake process 在 target worktree 产生 staged/unstaged/untracked change 时，Run.git_evidence 精确反映 completion state；artifact path被 .gitignore 排除且不进入 untracked evidence。
  - hook/progress event 追加 run progress Event 但不改变 CODING；init/result 不误记为 progress，hook outcome=error 不单独导致 Run failure。
  - synchronous spawn error、child error 与 stdin EPIPE -> close(0) 均只产生一次 RUN_FAILED，failure.code=claude_start_failed；late close/error 不覆盖 failure。
  - non-zero exit 与 signal exit 均只产生一次 RUN_FAILED，failure.code=claude_exit_failed，即使 stdout 含看似成功 terminal 也不得进入 REVIEW_REQUIRED。
  - missing/invalid/duplicate init 或 missing exact Room tool -> room_mcp_unavailable；malformed JSON、session mismatch、missing/duplicate/error terminal、invalid/mismatched/non-completed CodingResult -> coding_result_invalid。
  - completion Git observation failure -> git_evidence_failed，不返回 empty evidence；artifact write failure -> artifact_write_failed，不伪造 artifact ref。两者均保留 target worktree且只执行一次 RUN_FAILED transition。
  - success/failure terminal update 与 session/exit/Git/artifact evidence 在同一 transaction 持久化；失败注入不得留下 succeeded Run、重复 terminal Event 或与 Run 不一致的 Room state。
  - existing Protocol/Room/Git/leaf tests 继续通过；scope regression 只新增 exact claude-runner.ts allowance，dependency baseline保持 zod + TypeScript/@types-node。
  - documentation 描述与实际 Diff、protocol version、error set、public API 和未实现 Increment 4/5 边界一致；Review 前保持 candidate，不宣称可启动 Room service。

verification:
  - command: node --test "tests/claude-runner.test.ts" "tests/room-service.test.ts" "tests/claude-stream.test.ts"
    detects: central start/resume lifecycle、process/stream/Git/artifact evidence、failure mapping、single terminal transition、Room atomic persistence 与 leaf integration seam 错误。
    decision_if_failed: 不得报告 completed；只在本 Contract scope 修复，若需要改变 state/schema/leaf authority 则返回 needs_decision。
  - command: node --test "tests/scope.test.ts"
    detects: central runner exact file allowance、MCP/CLI/额外 module 禁止边界或 dependency baseline 漂移。
    decision_if_failed: 不得放宽为目录级任意 allowance；若正确实现需要新增 module/dependency，返回 needs_decision。
  - command: npm run typecheck
    detects: accepted leaf interface、Runner outcome union、Room terminal evidence input、ProtocolErrorCode 与 test fixture 的 TypeScript 偏移。
    decision_if_failed: 不得报告 completed；只修复本 Task 引入的类型问题。
  - command: npm test
    detects: Integration 破坏既有 Protocol/Room/Git/Scope/leaf behavior，或文档承诺缺少直接 regression。
    decision_if_failed: 不得跨 scope 清理或放宽测试；定位 task-owned regression，必要时返回 needs_decision。

documentation_updates:
  - path: docs/documents/ARCHITECTURE.md
    expected_change: candidate Runner orchestration、evidence ownership 与 CODING startup/init boundary；Review 接受前不提升为 Current implementation。
  - path: docs/documents/ROOM_PROTOCOL.md
    expected_change: 0.2-design lifecycle precondition、Runner evidence persistence、progress 与新增 evidence/artifact error semantics。
  - path: docs/documents/ADR/0002-agent-integration-lifecycle.md
    expected_change: 追加 2026-08-24 已确认的 CODING 覆盖 startup/init clarification，不重写原 accepted decision。
  - path: docs/documents/MVP_PLAN.md
    expected_change: Increment 3 Integration candidate、验收状态与 Increment 4 boundary。
  - path: docs/documents/OPERATIONS.md
    expected_change: candidate Runner API/artifact/failure view；无 service/MCP/CLI 启动命令。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: actual changed files、fake-process matrix、verification、deviation 与 REVIEW_REQUIRED 阶段。

question_policy: >
  如果正确实现需要新增 Room state/transition、SQLite field/table/migration、MCP SDK/server、dependency、
  改变 accepted CLI flags/JSONL authority/CodingResult schema、修改 Process Transport leaf、增加真实付费 smoke、
  或无法用 git_evidence_failed/artifact_write_failed 表达真实 Integration failure，停止受影响工作并返回
  needs_decision。安全且不改变 contract 的局部命名/测试 fixture 选择由 Claude 判断并记录。

confirmed_by_user: true
created_by: codex
created_at: 2026-08-24T11:26:19Z
```

## 2. Dispatch 前置条件

1. 已完成：用户确认本 Contract，状态为 `Accepted`、`confirmed_by_user=true`。
2. 待完成：把本 Contract 与同步 planning/state 文档形成 clean Git documentation baseline。
3. 待完成：创建 `codex/inc3-integration` branch/worktree。
4. 待完成：把 exact leaf commits `86c77a7c…` 与 `1062a750…` 组合进 Integration branch；组合后必须 clean、无冲突，并记录实际 `baseline_head`。
5. 待完成：用户在满足以上 Git gate 后人工派发；prompt 必须引用本次 Accepted Contract 全文，不得摘要。Codex 未获本次 Coding 派发或 Git 写操作授权。

## 3. 已确认设计点

用户确认本 Contract，即确认以下既有计划的具体化：

1. `CODING` 从 `startRun/resumeRun` atomic claim 开始，覆盖 startup 与 MCP initialization；协议升至 `0.2-design`，不增加 Room state。
2. `RoomService` terminal operation 同 transaction 持久化 session/process/Git/artifact evidence。
3. Stream Interpreter 仅增加 progress/partial failure evidence seam，不改变现有 event authority。
4. 新增 `git_evidence_failed` 与 `artifact_write_failed`，避免把真实观察/制品失败伪装成 empty evidence 或 Claude/result failure。
5. Increment 4/5 能力继续延后；本 Task 只交付 fake-process 可验收的 central Runner。

## 4. 参考文档

- [Increment 3 Parallel Pilot Plan](./INCREMENT_3_PARALLEL_PILOT_PLAN.md)
- [Increment 3A Task Contract](./INCREMENT_3A_TASK_CONTRACT.md)
- [Increment 3B Task Contract](./INCREMENT_3B_TASK_CONTRACT.md)
- [Architecture](./ARCHITECTURE.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [MVP Plan](./MVP_PLAN.md)
- [ADR-0002](./ADR/0002-agent-integration-lifecycle.md)
- [Git and Parallel Workflow](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
