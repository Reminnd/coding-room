# 开发日志

## 当前状态

- 日期：2026-08-24
- 项目阶段：ACCEPTED / Increment 3 Claude Runner；已提交到 Integration branch，尚未进入 `main`
- Room runtime state：不适用；目标 Room runtime 尚未实现，Increment 1 通过已批准 bootstrap transport 完成
- Architecture：用户已批准
- Implementation Task：`increment-003-claude-runner-integration` 为 Accepted；Review 1 `changes_requested`
- Fix Task：`increment-003-claude-runner-integration-fix-001` 为 Accepted、`confirmed_by_user=true`、`review_fixes_only=true`；Fix Coding、Codex Review 2 与用户接受均已完成
- 业务代码：`src/protocol`（schema/types/errors）、`src/room`（repository/state-machine/room-service）、`src/git`（git-process/git-observer）、`src/runner`（claude-process/claude-stream/claude-runner；Integration branch accepted implementation）
- Git repository：Integration worktree 在 branch `codex/inc3-integration`，lineage baseline 为 `63059189e97f7419238f5a3678513d4ca5e50f0d`；两个 accepted leaf、Integration/Fix、项目文档与 experience recovery 已形成 Integration branch commit。当前未进入 `main`，未获 push、merge 或清理授权

## 已完成

### 2026-08-24 — Increment 3 用户接受与经验回收

- 用户明确接受 `review-increment-003-integration-codex-002` 与 Increment 3 Claude Runner，项目阶段进入 `ACCEPTED`；没有 unresolved finding。
- 接受先完成产品/Review 门禁；用户随后另行授权提交当前已 Review 的 Integration/Fix 代码、测试和项目文档。提交已在 `codex/inc3-integration` 完成，授权不包含 push、merge、branch/worktree 清理或历史改写，当前尚未进入 `main`。
- Experience recovery 使用原四项 finding、Accepted Fix Task、实际完整 Diff、direct regression 与 Review 2 证据。已有 current entity 与 guard/idempotency 规则已覆盖，不重复扩写；新增两项可复用规则：failure classification 与可靠 partial lifecycle evidence 分开判断，以及 central orchestrator 必须直接证明 leaf outcome 到 protocol mapping、durable evidence 与唯一 terminal transition。
- Codex 经验写入 [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md) 第 12 节；Claude 实现与 regression 经验写入 [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md) 第 11 节。该回收不新增 Room state、Event、protocol field、runtime hook 或 ADR。

### 2026-08-24 — Increment 3 Integration Fix 1 Review 2

- Codex 以 `63059189e97f7419238f5a3678513d4ca5e50f0d` 为 lineage baseline，确认其同时包含 exact leaf commits `86c77a7c68b953343d67da3857859b0dd6d6c09c` 与 `1062a7500f8bb3e22c7c3818ddcac2e9eb625efa`，并审查完整 staged、unstaged、untracked task-owned Diff；当前 0 staged，Runner 仍为未提交 candidate。
- 四项 confirmed finding 均闭环：new Run 的 current Task guard 位于 Run retry/conflict 判定之后并保持 rollback；`required_tool_missing` 保留通过 expected-session 约束的 observed session；central `runClaude` failure matrix 直接断言唯一 mapping 与 single terminal transition；`ROOM_PROTOCOL.md`/`ARCHITECTURE.md` 统一为进入 `CODING` 后执行 startup/init、失败经 `CODING → RUN_FAILED`。
- 独立验证：`npm run typecheck` 通过；聚焦测试 96/96 通过；Scope 1/1 通过；`npm test` 139/139 通过。未运行真实 Claude smoke。
- Review ID：`review-increment-003-integration-codex-002`；Findings：无；Decision：`approved`。阶段进入 `REVIEW_DISCUSSION`，等待用户明确接受；Review 通过不自动授权 commit、push 或清理。
- Documentation impact audit：`documentation: updated`。修正 `PROJECT_RULES.md`、文档中心、Architecture/Protocol candidate 标记、MVP/Development/Operations 状态与并行计划中的历史 lifecycle 描述；未把 candidate 提升为 main Current capability。

### 2026-08-24 — Increment 3 Integration Fix 1 Coding 完成（candidate）

按 [Increment 3 Integration Fix Task 1](./INCREMENT_3_INTEGRATION_FIX_TASK_1.md) 修复 `review-increment-003-integration-codex-001` 的四项 confirmed finding：

- `inc3-integration-r1-current-task-guard`：`RoomService.startRun/resumeRun` 在同一 transaction 内复用该 Room 最新 `task_submitted` Event（`latestEventEntityId(roomId, 'task_submitted')`）作为 current Task authority；guard 位于 insertRun 幂等/conflict 判断之后，只对 newly inserted Run 执行，stale Task 以 `validation_failed` 回滚且不产生 partial write。
- `inc3-integration-r1-partial-session-evidence`：`ClaudeStreamInterpreter.acceptInit` 在 non-empty session 通过 expectedSessionId 约束后、required tool 校验前保存 `observedSessionId`；`required_tool_missing` failure 携带该 sessionId，`failRun` 原子持久化到 `Run.claude_session_id`；空 session 仍先失败为 `init_error` 且不伪造 session。
- `inc3-integration-r1-central-failure-matrix`：`tests/claude-runner.test.ts` 经 central `runClaude` 直接覆盖 asynchronous child error、stdin EPIPE 后 late close(0)、signal exit、四类 init failure（missing/invalid/duplicate/required_tool_missing）、malformed JSON、terminal session mismatch、missing/duplicate/error terminal、invalid/mismatched/non-completed CodingResult；每个 case 断言唯一 failure mapping、恰好一次 `run_failed`、零次 `run_completed`。
- `inc3-integration-r1-lifecycle-documentation`：`ROOM_PROTOCOL.md` transition table 与 `ARCHITECTURE.md` failure table 修正为 `CODING` 先于 process startup/MCP init，startup/init failure 经既有 `CODING → RUN_FAILED` 结束。

changed files：`src/room/room-service.ts`、`src/runner/claude-stream.ts`、`tests/room-service.test.ts`、`tests/claude-stream.test.ts`、`tests/claude-runner.test.ts`、`docs/documents/ROOM_PROTOCOL.md`、`docs/documents/ARCHITECTURE.md`、`docs/documents/DEVELOPMENT_LOG.md`、`docs/documents/MVP_PLAN.md`、`docs/documents/OPERATIONS.md`。未修改 accepted leaf（`claude-process.ts`/`claude-process.test.ts`/`claude-process-fake.ts`）、Git Observer、repository schema、state-machine transition table、package metadata、lockfile、tsconfig 或 dependency。未 commit、未 stage、未运行真实 Claude smoke。

### 2026-08-24 — Increment 3 Integration Review 1、方案确认与 Fix Task

- Codex 读取 baseline `63059189e97f7419238f5a3678513d4ca5e50f0d` 以来完整 staged/unstaged/untracked task-owned Diff，核对 Accepted Contract、Coding Result、源码、测试、候选文档与 Git 状态；Diff 为 13 个 modified、2 个 untracked、0 staged，全部位于 Integration scope。
- Review `review-increment-003-integration-codex-001` 确认四项 finding：`inc3-integration-r1-current-task-guard`（`FIX_PLAN_READY` 可启动旧 Task）、`inc3-integration-r1-partial-session-evidence`（`required_tool_missing` 丢失已观察 session）、`inc3-integration-r1-central-failure-matrix`（central public-path evidence 不完整）、`inc3-integration-r1-lifecycle-documentation`（协议/架构仍保留相反的 MCP-init 前置语义）。Decision：`changes_requested`。
- 定向复现证明：当前 Room 在 `FIX_PLAN_READY` 可创建 `task_id=task-1` 的旧 Run 并进入 `CODING`；含合法 `session_id=sess-observed` 但缺少 Room tool 的 init 返回 `required_tool_missing` 且 `sessionId=null`。
- Codex 独立验证 `npm run typecheck` 与 `npm test`（118/118）全部通过；现有 assertions 正确，但不能否定未覆盖 public path。文档检查 221 个 relative links 全部有效，无 merge marker 或越界 Markdown。
- 用户明确确认四项 finding 与最小方案。已创建 [Increment 3 Integration Fix Task 1](./INCREMENT_3_INTEGRATION_FIX_TASK_1.md)，阶段进入 `FIX_PLAN_READY`；确认不自动授权 Coding 派发、真实 Claude smoke 或 Git 写操作。
- Documentation impact audit：`documentation: updated`。同步 Accepted Fix Task、Review、当前阶段、文档中心、计划与运维状态；冲突的 `ROOM_PROTOCOL`/`ARCHITECTURE` candidate 语义由 Fix Coding 按 confirmed solution 修正，Runner 未提升为 main Current capability。

### 2026-08-24 — Increment 3 Integration Coding 完成（candidate）

按 [Increment 3 Integration Task Contract](./INCREMENT_3_INTEGRATION_TASK_CONTRACT.md) 在 `codex/inc3-integration` worktree（baseline_head `63059189e97f7419238f5a3678513d4ca5e50f0d`）交付 central Runner orchestration：

- `src/runner/claude-runner.ts`（新增）：单一 central operation `runClaude`，组合两个 accepted leaf（`claude-process.ts` + `claude-stream.ts`）与 `RoomService`/Git Observer/artifact。读取 persisted `confirmed_by_user=true` TaskContract、`establishCleanBaseline` 前置 gate、HEAD 与 expected baseline 一致校验、start/resume mode 校验（start 要求 `resumeSessionId=null`，resume 要求 non-empty exact id、绝不 `--continue`）、完整 Contract 经 stdin 送达、消费 stream、追加 progress Event、写入 `.agent-room/artifacts/<run-id>/stdout.jsonl` 与 `stderr.log`、收集 completion Git evidence，并以 `RunTerminalEvidence` 单一 settle 为 `completeRun`（`REVIEW_REQUIRED`）或 `failRun`（`RUN_FAILED`）。
- `src/protocol/errors.ts`：新增 `git_evidence_failed` 与 `artifact_write_failed`。
- `src/runner/claude-stream.ts`：`acceptLine` 对非终态 line 返回 `ClaudeProgressEvidence`；failure outcome 携带 nullable `sessionId` 与累积 `progress`。不改变 init/tool/terminal/CodingResult authority。
- `src/room/room-service.ts`：新增 `RunTerminalEvidence` 接口与 `appendRunProgress`（`run_progress` 非终态 Event，不改变状态）；`completeRun`/`failRun` 在同一 transaction 持久化 terminal evidence（`claude_session_id`、`process_exit_code`、`git_evidence`、`artifact_refs`）。
- failure mapping 优先级（单一 terminal settlement）：`claude_start_failed` > `claude_exit_failed` > `room_mcp_unavailable` > `coding_result_invalid` > `git_evidence_failed` > `artifact_write_failed`。
- 测试：`tests/claude-runner.test.ts`（新增，fake-process + temp-repo fixture 覆盖 start/resume、process/stream/Git/artifact evidence、全部六类 failure mapping 与单一 terminal transition）；`tests/claude-stream.test.ts`、`tests/room-service.test.ts` 新增 progress/evidence regression；`tests/scope.test.ts` 允许 `claude-runner.ts`。
- 未 commit、未 stage、未运行真实 Claude/付费 smoke；Git evidence 在 artifact 写入前收集，Runner 自写 artifact 不污染 evidence。

### 2026-08-24 — Increment 3 Integration Task Contract 批准

- 用户明确批准 [Increment 3 Integration Task Contract](./INCREMENT_3_INTEGRATION_TASK_CONTRACT.md)，其状态改为 `Accepted`、`confirmed_by_user=true`；项目阶段进入 `PLAN_READY`。
- 用户决定暂时人工派发。派发必须在 clean Integration worktree 中进行，且该 worktree 必须包含本次 Accepted Contract、main documentation baseline 与两个 exact accepted leaf commits，并记录组合后的实际 `baseline_head`。
- 本次确认不授权 Codex 提交当前文档、创建 branch/worktree、组合 leaf commits、执行 Claude Coding 派发、push 或清理；这些 Git/dispatch 动作仍未发生，Runner 也未提升为 Current capability。
- Documentation impact audit：`documentation: updated`。同步 Contract 状态、阶段、索引、计划与运维边界；Architecture、Room Protocol、ADR 和 runtime implementation 事实未改变。

### 2026-08-24 — Increment 3 Integration Draft Contract

- 用户要求继续后，Codex 依据已确认 Parallel Pilot boundary、两个 accepted leaf commits、当前 RoomService/Git Observer public API 与 protocol lifecycle 形成 [Increment 3 Integration Draft](./INCREMENT_3_INTEGRATION_TASK_CONTRACT.md)。
- Draft 的单一目标是交付 central Runner orchestration：clean baseline gate、完整 persisted Task prompt、start/resume claim、accepted process/stream leaf、progress Event、raw artifact、completion Git evidence、atomic terminal evidence 与单一 terminal transition。
- Draft 将已确认的 `CODING` startup/init clarification 具体化为 `ROOM_PROTOCOL 0.2-design`，不新增 Room state；同时把实际 Integration gap 列为待确认 scope：RoomService terminal evidence boundary、Interpreter progress/partial failure evidence seam，以及 `git_evidence_failed` / `artifact_write_failed` 两个机器可处理 error。
- Git 事实重新核对：上一轮 acceptance documents 已由 commit `320c730497b02ce7ae91e1dadc906fffe2a10a9f` 提交到 clean main；两个 leaf worktree 已移除，但 branch refs 与 accepted commits 仍存在且未进入 main ancestry。Integration baseline 必须在用户后续授权的 documentation commit、Integration worktree 创建与 exact leaf commit 组合后重新记录。
- 本次只创建 Draft 并同步 planning/state 文档；未提交、未创建 branch/worktree、未组合 commits、未派发 Coding、未运行真实 Claude 或测试。

### 2026-08-24 — Increment 3A/3B 接受、Leaf Commit 与 Fix 经验回收

- 用户明确接受 Increment 3A/3B Fix，并分别授权提交两个 leaf 的已 Review task-owned files；授权不包含 Integration、merge/cherry-pick、push、branch/worktree 清理或其它 Git 写操作。
- 3A 在 `codex/inc3-claude-process` 提交为 `86c77a7c68b953343d67da3857859b0dd6d6c09c`（`feat(runner): add Claude process transport`），实际仅包含 `src/runner/claude-process.ts`、`tests/claude-process.test.ts` 与 `tests/runner-fixtures/claude-process-fake.ts`；提交后 worktree clean。
- 3B 在 `codex/inc3-claude-stream` 提交为 `1062a7500f8bb3e22c7c3818ddcac2e9eb625efa`（`feat(runner): add Claude stream interpreter`），实际仅包含 `src/runner/claude-stream.ts`、`tests/claude-stream.test.ts` 与两个已 Review JSONL fixture；提交后 worktree clean。
- 提交前 staged diff 与 Review 2 path set 完全一致；实现输入自 Review 2 后未变化，因此未重复运行已经证明同一事实的 typecheck/测试，沿用 3A 聚焦 14/14、全量 71/71 与 3B 聚焦 24/24、全量 81/81 的独立验证证据。
- Fix 经验回收新增两类可复用规则：多 event process Promise 必须让 stdin/error/close 共享 first-settlement ownership，并用“failure 后出现表面成功事件”的 public-path regression 证明失败不会被改写；冻结 capability authority 时，TypeScript input、runtime lookup 与 success evidence 必须来自同一 module-owned constant，negative regression 必须证明普通 caller value 或 built-in 不能替代它。规则分别写入 Codex Review 与 Claude Coding 指南。
- Documentation impact audit：`documentation: updated`。仅同步用户接受、leaf commit、经验回收与 Integration 前置事实；Architecture、Room Protocol、ADR、dependency direction 和 `main` 的 current runtime capability 均未变化。

### 2026-08-24 — Increment 3A/3B Fix Review 2

- 自动 bootstrap result capture 失败后，用户人工恢复两个原 Claude session 并返回 Coding Result；两份结果均为 `completed`，无 deviation、unresolved 或 question。Codex 以用户返回结果作为导航，并以实时 Git、完整 task-owned Diff、源码、测试和独立命令作为 Review authority。
- `review-increment-003a-codex-002`：`ClaudeProcessInputError` 独立保留 command、完整 args、cwd 与 cause；stdin `error`、child `error` 与 `close` 共用 single-settlement boundary。直接 `EPIPE → close(0, null)` regression 证明 stdin failure 不再被普通 exit outcome 改写。完整 Diff 仅含 `src/runner/claude-process.ts`、`tests/claude-process.test.ts` 与最小 fake-process fixture；无 finding，Decision：`approved`。
- `review-increment-003b-codex-002`：`REQUIRED_ROOM_TOOL_NAME` 精确冻结为 `mcp__agent_room__room_ask_question`，同时拥有 literal input type、runtime init tools lookup 与 success evidence。built-in-only 与强制注入 `Read` 的两个 direct regression 均返回 `required_tool_missing`；JSONL fixture 未修改。完整 Diff 仅含本 leaf 原有四个 task-owned files；无 finding，Decision：`approved`。
- Codex 独立验证：3A 聚焦测试 14/14、`npm run typecheck`、全量测试 71/71；3B 聚焦测试 24/24、`npm run typecheck`、全量测试 81/81，全部通过。两边保持原 `HEAD` `97c47fed770fea675834538e2ca4550d37fdc548`、正确 branch、无 staged file 或 scope drift。
- Documentation impact audit：`documentation: updated`。仅同步 manual retry、Review 2、验证与当前阶段；Architecture、Room Protocol、ADR、dependency direction、public runtime capability 和 Integration boundary 均无变化，candidate 未提升为 Current。

### 2026-08-24 — Increment 3A/3B Fix 并行派发与 Result Validation Failure

- 用户明确授权并行派发两份 Accepted Fix Task。派发前核对共同 `baseline_head`、独立 branch/worktree、未 staged 状态、task-owned path set、原 Claude session 与本机 Claude Code `2.1.241`；两条 leaf 均通过。
- 受 sandbox Git ownership gate 影响的首轮启动在 Claude process 前失败且未修改代码；随后使用宿主执行权限并行恢复 session `082e2b70-0e35-440d-a9a4-71f1515e2660` 与 `b386f58f-4005-490e-8ee1-292b33cb2ed9`，两路 process 均 exit `0`。
- 两路 terminal stdout 行均无法通过 `JSON.parse`：3A 在 position 1892，3B 在 position 2041。artifact 中中文内容出现 mojibake，嵌套 `result` JSON 的 property quote escape 被吞掉；因此 stdout final result 不满足 bootstrap Coding Result transport，不能以 process exit 或模型自述替代。
- 两个 worktree 继续停留在原 branch 与原 `HEAD`，无 staged file；candidate 与 `.agent-room/artifacts/` 全部保留。当前按 `coding_result_invalid` 进入 `RUN_FAILED`，未执行 Codex Review、stage、module commit、Integration、push 或清理。
- 文档影响仅为 dispatch/result validation/current phase 事实；Architecture、Room Protocol、ADR、Accepted Fix scope 与 current runtime capability 不变。

### 2026-08-24 — Increment 3A/3B Review 1 方案确认与 Fix Task

- 用户明确确认 `review-increment-003a-codex-001` finding `inc3a-r1-stdin-write-failure` 及最小方案：stdin prompt delivery error 以独立 typed input/transport failure 向上拒绝，single-settlement guard 阻止后续 `close(0)` 改写失败，并增加 `EPIPE → close(0)` public-path regression。
- 用户明确确认 `review-increment-003b-codex-001` finding `inc3b-r1-required-tool-freeze` 及最小方案：用 single frozen constant 与 literal input type 固定 `mcp__agent_room__room_ask_question`，init lookup 和 success evidence 不再受任意 caller string 控制，并增加 built-in 不能替代 Room tool 的 regression。
- 已创建 [Increment 3A Fix Task 1](./INCREMENT_3A_FIX_TASK_1.md) 与 [Increment 3B Fix Task 1](./INCREMENT_3B_FIX_TASK_1.md)；两者均为 `review_fixes_only=true`、`confirmed_by_user=true`，保留原共同 baseline、独立 branch/worktree 与原 Claude session lineage。
- 当前阶段进入 `FIX_PLAN_READY / Increment 3A + Increment 3B`。本次确认不授权 Fix Coding 派发、真实付费 smoke、stage、module commit、Integration、push 或清理。
- 文档影响限于 Fix Contract、当前阶段、并行执行事实、文档索引与 candidate 运维视图；Architecture、Room Protocol、ADR、Accepted Implementation Contract 与 runtime capability 不变。

### 2026-08-24 — Increment 3A/3B Leaf Review 1

- Codex 分别收集两个 worktree 相对共同 `baseline_head` `97c47fed770fea675834538e2ca4550d37fdc548` 的完整 task-owned staged、unstaged 与 untracked Diff，并核对 Accepted Contract、Claude Coding Result、源码、测试、Git 状态和 module ownership；两边均只有 Contract scope 内的 untracked candidate files，无 staged/unstaged tracked change、commit 或 push。
- Review `review-increment-003a-codex-001` finding `inc3a-r1-stdin-write-failure`：`src/runner/claude-process.ts` 静默吞掉 child stdin error。最小 fault injection 证明 prompt write 返回 `EPIPE` 后 child `close(0, null)` 会被报告为普通 exit outcome，无法区分“完整 Task Contract 未送达”与成功 process fact，违反 Accepted Contract 的完整 stdin delivery 与 process failure boundary。Review Decision：`changes_requested`。
- Review `review-increment-003b-codex-001` finding `inc3b-r1-required-tool-freeze`：`ClaudeStreamInterpreterInput.requiredToolName` 接受任意 string，interpreter 直接以调用者值校验 init tools。最小复现移除 `mcp__agent_room__room_ask_question` 并传入 built-in `Read` 后仍返回 `ok: true`，违反 Accepted Contract 冻结 required Room tool authority 的要求。Review Decision：`changes_requested`。
- Codex 独立验证 Increment 3A：`npm run typecheck`、聚焦测试 13/13、全量测试 70/70；Increment 3B：`npm run typecheck`、聚焦测试 22/22、全量测试 79/79。既有测试无回归，但未覆盖上述两个 authority/failure boundary。
- 阶段进入 `REVIEW_DISCUSSION / Increment 3A + Increment 3B`。用户确认 finding 与最小方案前，不创建或派发 Fix Task；候选 leaf 不接受、不提交、不集成。Architecture、Room Protocol、Accepted Contract 和 Integration 计划不变，候选实现不提升为 Current capability。

### 2026-08-24 — Increment 3A/3B Task Contract 批准

- 用户明确批准 [Increment 3A Claude Process Transport](./INCREMENT_3A_TASK_CONTRACT.md) 与 [Increment 3B Claude Stream Interpreter](./INCREMENT_3B_TASK_CONTRACT.md) 两份完整 Task Contract；两者状态改为 `Accepted`，`confirmed_by_user=true`。
- 批准不改变已确认 module boundary：Leaf A 只拥有 process transport 与 line framing，Leaf B 只拥有 stream interpretation；公共 protocol、Room lifecycle、central Runner、Git wiring、package metadata 与 documentation 继续由后续 Integration Task 独占。
- 确认前 clean parent 为 `b35f7a2284c90285e897789aa2ac9e26e596c4ac`。由于 Accepted Contract 本身必须先进入 Git，最终共同 `baseline_head` 不预写为 parent hash，而在 documentation baseline commit 完成后按实际 `main` HEAD 记录。
- 用户随后单独授权本 Accepted Contract documentation baseline commit；仍未授权 branch/worktree 创建、Claude Coding 派发、真实付费 smoke、实现提交、push 或清理。当前阶段为 `PLAN_READY / Increment 3A + Increment 3B`。

### 2026-08-24 — Increment 3 Scope Scaffold 集成到 main

- 用户明确授权把 accepted Scaffold source commit `eb3637b642aaa88e1faab51a570c6fea688c3cf9` 集成并提交到 `main`；授权不包含 push 或 source branch/worktree 清理。
- `main` 在共同 ancestor `1416de2429e2124192442e8b6e7db3645db805c6` 后已有文档集中迁移 commit `71bb2db803a8dc96bb1b172996ef5f8ad3b8e96f`，因此采用 `cherry-pick --no-commit` 组合 accepted tree，并在提交前把 Fix Contract 从旧 `docs/` 路径归位到 `docs/documents/`；测试实现保持 accepted source commit 内容。
- 集成验证通过：聚焦 Scope test 1/1、`npm run typecheck`、`npm test` 57/57；文档目录、索引、相对链接、merge marker 与 staged scope 检查通过后才提交。
- 集成不新增 Runner、MCP、CLI、runtime interface、Room state、protocol field 或 dependency；Architecture 与 ADR 无变化。当前进入 `WAITING_FOR_USER_CONFIRMATION / Increment 3A/3B Task Contracts`。

### 2026-08-24 — Codex 全项目文档角色、Skill 门禁与文档集中迁移

- 用户明确将 Codex 的“运维文档编写者及维护者”扩展为全项目文档编写者及维护者；Codex 编写、补全、迁移、Review 或维护任何项目文档时 MUST 调用 `backend-doc-authoring` skill，并在每次 Review 后执行 documentation impact audit。
- 全部人类可查看项目文档已集中迁入 `docs/documents/`，新增 [项目文档中心](./README.md) 统一列出用途、状态、Owner 与依赖；根目录仅保留 `AGENTS.md`、`CLAUDE.md`、`PROJECT_RULES.md` 三个 agent/tooling 控制入口，旧路径不保留副本。
- 原运维专用指南由 [Codex 项目文档编写与维护指南](./agent-guides/CODEX_DOCUMENTATION_AUTHORING.md) 替代；运维手册继续作为全项目文档集中的人工操作与故障处置权威视图。
- 已同步角色入口、Claude candidate 文档边界、Documentation Map、细分指南路由和 Review Verification Summary 字段 `documentation: updated | no_change | blocked`。
- 该变更只调整文档角色、目录和维护工作流，不修改 business code、test、implementation config、Room state、Event、protocol 或 runtime，因此不新增 ADR。

### 2026-08-24 — Codex 运维文档角色与 Review 后维护门禁（Superseded）

- 用户明确为 Codex 增加“运维文档编写者及维护者”角色，要求每次 Review 后维护人工可查看的接口、架构与结构说明。
- 新建 `docs/documents/OPERATIONS.md`，按 accepted/current 与 candidate/integration 状态分离，记录当前 public application API、Git Observer、组件结构、可用命令、状态/制品位置和故障边界；明确 Runner、MCP、CLI 与 service entry 尚未实现，不发明启动命令。
- 当时新建的运维专用指南现已由 `docs/documents/agent-guides/CODEX_DOCUMENTATION_AUTHORING.md` 替代；Review 后运维影响审计继续由全项目文档门禁覆盖。
- 该角色是 Codex 文档工作流，不修改 Room state、Event、protocol、runtime、业务代码或测试，因此不新增 ADR。

### 2026-08-24 — Increment 3 Scope Scaffold Review、Fix、接受与独立提交

- Scope Scaffold 在 `codex/increment-003-scope-scaffold` 从 baseline `1416de2429e2124192442e8b6e7db3645db805c6` 执行；Implementation 只修改 `tests/scope.test.ts`。
- Review 1 复现 allowed filename 对应 directory 被错误接受；用户确认最小 `Dirent.isFile()` 与 literal filename 联合校验方案，并通过恢复原 Claude session 完成 Fix。
- Review 2 无 finding；Codex 独立 8-scenario matrix、`npm run typecheck` 与 `npm test`（57/57）全部通过。用户明确接受并授权提交。
- branch commit 为 `eb3637b642aaa88e1faab51a570c6fea688c3cf9`，提交时的实际 files 为 `tests/scope.test.ts` 与 `docs/INCREMENT_3_SCOPE_SCAFFOLD_FIX_TASK_1.md`；当时未 push、尚未集成到 `main`，后续集成事实见上方记录。
- 运维影响：Scope regression 与开发 branch baseline 变化，不新增 runtime interface、service command、Runner、MCP 或 CLI；已在 `docs/documents/OPERATIONS.md` 标明 accepted branch 与 main integration pending。

### 2026-08-24 — Increment 2 Fix 1 经验回收与流程自动化

- 按用户要求从 `review-increment-002-codex-001`、Accepted Fix Task、实际 Diff、两个 public-path corrupt-index regression 与二次 Review 提炼可复用经验，而不是复制单次历史描述。
- Codex Review 经验写入 `CODEX_REVIEW_AND_PLANNING.md`：observer 必须区分 success-empty、success-nonempty 与 failure；process exit fact 和 domain error mapping 属于不同 boundary；外部依赖 failure injection 必须直达每个 public operation；typecheck 不能证明 runtime callback context 来源正确。
- Claude Coding 经验写入 `CLAUDE_CODING_AND_FIX.md`：process failure 不得降级为 empty evidence；异步 `execFile` 从 callback 第三个参数读取 stderr；用“合法 HEAD + 损坏 index”构造最小 Git failure fixture；fixture cleanup 删除实际 owner path。
- `AGENTS.md`、`PROJECT_RULES.md` 与指南路由新增硬 Trigger：每个 Fix Task 二次 Review approved 且获用户明确接受后，Codex 在派发下一 Implementation/Fix Task 前执行经验回收；已有规则已覆盖或无新增经验时如实记录，不制造规则。
- 该自动化是 Codex 文档工作流，不修改 Room state、Event、protocol、Runner、业务代码或 Architecture，因此不新增 ADR；当前项目阶段保持 `PLAN_READY / Increment 3 Scope Scaffold`。

### 2026-08-24 — Increment 3 并行试点与 Scope Scaffold Contract 批准

- 用户确认 Increment 3 先试点两个独立 leaf module：`Claude Process Transport` 与 `Claude Stream Interpreter`；两者不交叉写入、独立 Review/接受/提交，随后由串行 Integration Task 组合。
- 用户确认 `CODING` 覆盖 Runner claim 后的 process startup 与 MCP initialization；startup/init failure 继续通过既有 `CODING → RUN_FAILED` 结束，不新增 Room state 或 transition。正式 protocol version、ADR 与实现同步留给 Integration Task。
- 经用户授权完成一次受限真实 Claude Code `2.1.241` smoke：禁用普通 tools、预算上限 `$0.25`，实际费用 `$0.06222`，exit code `0`，未修改项目文件；确认 `--verbose`、CLI JSON Schema normalization、hook/init/result/session 与 `structured_output` shape。
- 发现现有 `tests/scope.test.ts` 明确拒绝 `src/runner`，会使两个 leaf branch 的 `npm test` 必然失败；共享 regression 不能由两个 worker 并行修改，因此增加串行 Scope Scaffold 前置任务。
- 用户已批准 [Scope Scaffold Task Contract](./INCREMENT_3_SCOPE_SCAFFOLD_TASK_CONTRACT.md)，其唯一实现 scope 为 `tests/scope.test.ts`，不创建或实现 Runner；项目阶段进入 `PLAN_READY / Increment 3 Scope Scaffold`。
- 用户已授权当前 7 个 planning/state 文档的 documentation baseline commit 与随后的 Scope Scaffold bootstrap dispatch；未授权 branch/worktree、实现提交或 push，Leaf A/B Contract 保持 Draft。

### 2026-08-24 — Increment 2 接受与提交授权

- 用户明确接受 Increment 2，并授权将本次已 Review 的 task-owned 代码、测试、必要配置、Fix Contract 与实现状态文档提交到当前 `main`。
- 授权 scope 为 `src/git/git-process.ts`、`src/git/git-observer.ts`、`tests/git-observer.test.ts`、`tests/scope.test.ts`、`package.json`、`docs/INCREMENT_2_FIX_TASK_1.md`、`PROJECT_RULES.md` 与 `DEVELOPMENT_LOG.md`。
- 本次授权不包含 push、branch/worktree 操作、merge/rebase、历史改写或下一 Increment 文件。

### 2026-08-24 — Increment 2 Review 2

- Codex 读取原始 `baseline_head` `6e7e5eb8869b2947d7738f1f23b6eb7fdde64742` 以来的完整 task-owned staged/unstaged/untracked Diff，并核对 Fix Coding Result、Accepted Contract、Git 状态、源码、测试与实现文档；未发现新的 finding。
- `inc2-r1-evidence-exit-128` 已闭环：process boundary 对任何非零退出抛出 `GitCommandError`，repository/HEAD 的 exit 128 仅在对应 semantic boundary 映射为 ProtocolError，两个 public evidence operation 的 corrupt-index regression 直接证明观察失败不会返回 clean/empty evidence。
- `inc2-r1-git-error-stderr` 已闭环：`execFile` callback 第三个参数的 stderr 被保留到 `GitCommandError`；测试同时断言 command、args、cwd、exitCode 与非空 stderr。
- `inc2-r1-temp-fixture-cleanup` 已闭环：non-existent target 测试在 `finally` 删除实际创建的 parent fixture。
- Codex 独立运行 `node --test "tests/git-observer.test.ts"`（11/11）、`npm run typecheck` 与 `npm test`（57/57），全部通过；scope/dependency baseline、只读 Git command set、Increment 1 的 46 项测试均无回归。
- Review Decision：`approved`。阶段进入 `REVIEW_DISCUSSION / Increment 2`，等待用户明确接受；未获接受与 commit 授权前不提交。

### 2026-08-24 — Increment 2 Fix 1: Git Failure Semantics

按 [Increment 2 Fix Task 1](./INCREMENT_2_FIX_TASK_1.md) 修复 `review-increment-002-codex-001` 的 3 项 confirmed findings：

- `inc2-r1-evidence-exit-128`：`runGit` 不再把 exit 128 分类为 `missing`，而是对任何非零退出或进程启动失败以 `GitCommandError` 携带 command、args、cwd、exitCode 与 stderr 向上抛出；`resolveWorktreeRoot`/`resolveBaselineHead` 在各自 semantic boundary 捕获 `GitCommandError` 且 `exitCode === 128` 时映射为 `git_repository_missing`/`git_head_missing`，其余失败继续向上抛。`collectEvidence` 不再捕获或降级任何 diff/ls-files 失败，因此 `establishCleanBaseline`/`collectCompletionEvidence` 在 evidence command fatal failure 时都拒绝，不再返回 clean/empty evidence。
- `inc2-r1-git-error-stderr`：`runGit` 从异步 `execFile` callback 第三个参数读取 stderr（Buffer/string）并传入 `GitCommandError`，不再从 error object 假设 `.stderr` 属性存在。
- `inc2-r1-temp-fixture-cleanup`：non-existent target 测试显式保留 `makeFixture` 返回的 parent path，并在 `finally` 中删除，成功与 assertion failure 都不遗留 temporary directory。

changed files：`src/git/git-process.ts`、`src/git/git-observer.ts`、`tests/git-observer.test.ts`、`DEVELOPMENT_LOG.md`。保持只读命令集（rev-parse/diff/ls-files）与 `GitEvidence`/`CleanBaseline`/两个 public operation 的 external shape 不变，未新增 dependency、protocol error、状态或 mutation command。

### 2026-08-24 — Increment 2 Review 1 与 Fix 1 确认

- Codex 审查完整 task-owned Diff，`npm run typecheck` 通过，`npm test` 55 项全部通过；正常 repository、HEAD、clean/dirty worktree、三类 path evidence、scope 与 dependency baseline 实现正确。
- Review `review-increment-002-codex-001` 通过损坏 temporary repository index 的 fault injection 复现：evidence command exit 128 被 `runGit` 分类为 `missing`，随后 null stdout 被解释为空 array，使 `establishCleanBaseline` 在观察失败时错误返回 clean baseline。
- Review 同时确认异步 `execFile` 的 stderr 来自 callback 第三个参数，当前 `GitCommandError.stderr` 实际为空；non-existent target 测试只删除不存在的 child，稳定遗留 `makeFixture` 创建的 parent temporary directory。
- 用户确认三项 finding 与最小方向：process boundary 对非零退出抛出携带完整 context/stderr 的 `GitCommandError`，仅由 repository/HEAD semantic boundary 映射预期 ProtocolError；两个 public evidence operation 直接覆盖 fatal failure；测试删除实际创建的 parent fixture。
- 已创建 [Increment 2 Fix Task 1](./INCREMENT_2_FIX_TASK_1.md)，Fix lineage 保留原始 `baseline_head` `6e7e5eb8869b2947d7738f1f23b6eb7fdde64742`，阶段进入 `FIX_PLAN_READY`。

### 2026-08-24 — Increment 2: Git Preconditions and Evidence

按 [Increment 2 Task Contract](./INCREMENT_2_TASK_CONTRACT.md) 在独立 `src/git` infrastructure module 实现只读 Git Observer：

- `src/git/git-process.ts`：唯一 Git 调用入口，`node:child_process.execFile('git', [command, ...args])` 直接传 argument array（无 shell）、`encoding: 'buffer'` 保留 NUL 分隔输出；exit 128 分类为 `missing`，其余 process 失败以 `GitCommandError` 携带 command context（command、args、cwd、exit code、stderr）抛出。
- `src/git/git-observer.ts`：`GitEvidence`（staged/unstaged/untracked 去重、稳定排序的 root-relative path）与 `establishCleanBaseline` / `collectCompletionEvidence` 两个 operation。
- `establishCleanBaseline`：目标非目录/非 worktree/裸仓库 → `git_repository_missing`；`rev-parse --verify --end-of-options HEAD^{commit}` 无法解析 → `git_head_missing`；三类 evidence 任一非空 → `worktree_not_clean`；全空返回 repository root、完整 `baselineHead` 与 empty evidence。
- `collectCompletionEvidence`：不要求 worktree clean，从解析出的 owning worktree root 执行，覆盖整个 worktree 并返回 root-relative path。
- 三类 evidence 用 NUL-delimited output：staged `git diff --cached --name-only -z`、unstaged `git diff --name-only -z`、untracked `git ls-files --others --exclude-standard --full-name -z`；不解析 human-readable status。
- product code 只含 `rev-parse`/`diff`/`ls-files` 只读命令；fixture 的 `init/config/add/commit` 写操作只存在于测试代码。
- `package.json` description 改为项目级描述（`Local Agent Room — single-user MVP`），不改 dependency/script baseline。
- `tests/scope.test.ts` 改为拒绝 `src/runner`、`src/mcp`、`src/cli` 并允许 `src/git`，同时证明 dependency baseline 未漂移。

Git command boundary：`runGit` 是唯一 process 边界，所有 command 从解析出的 repository root 执行；`resolveWorktreeRoot` 先用 `fs.statSync` 区分“路径不存在”与“git 不可用”，再按 git exit 128 分类为非 worktree，其余失败带 command context 向上抛出。

### 2026-08-24 — Increment 2 Task Contract 批准

- 用户明确批准 [Increment 2 Task Contract](./INCREMENT_2_TASK_CONTRACT.md)，阶段进入 `PLAN_READY / Increment 2`。
- 已确认最小方案：独立 `src/git` Git Observer 使用 Node.js `child_process.execFile` 直接调用 Git CLI 只读命令；以完整 `HEAD` commit object ID 作为 baseline，并以 NUL-delimited output 收集 root-relative staged、unstaged、untracked path evidence。
- 本增量不接入 Runner、MCP 或 Room state，不修改 SQLite/schema/protocol error set，不增加 dependency，不生成 patch、hash、mirror 或 Git mutation path。
- 派发前仍需把 Accepted Contract 与现有协作文档形成 clean documentation baseline，并重新记录实际 `baseline_head`；当前批准不包含 commit、push 或 Claude Coding 派发授权。

### 2026-08-24 — Increment 1 Fix 3 Review 与接受

- Codex 复审完整 task-owned Diff，无 finding，Review Decision 为 `approved`。
- 聚焦幂等 regression 1 项通过，`npm run typecheck` 通过，`npm test` 46 项全部通过。
- 用户明确接受 Increment 1，并授权将已 Review 的代码、测试、必要配置、Fix Contract 与实现状态文档提交到当前 `main`；该授权不包含 push 或无关并发文档。

### 2026-08-24 — Fix 2/3 经验结构化与角色入口精简

- 按项目职责将 Fix 2/3 经验拆分：Codex 侧覆盖 lifecycle Review、public-path 证据、current entity 权威事实、guard 与 idempotency 组合审查、最小解决方案和 Task Contract 场景；Claude Code 侧覆盖最小实现、transaction 内 guard/idempotency 顺序、直接 public-path regression、durable-state assertion 与独立 Oracle。
- 新建的细分指南当前集中在 `docs/documents/agent-guides/`；`AGENTS.md` 与 `CLAUDE.md` 通过明确 Trigger 强制索引，形成入口 + 按需完整读取的渐进式结构。
- 清除 `AGENTS.md` 与 `CLAUDE.md` 中未解析的 merge marker，保留冲突内容中的有效派发、并行、注释语言和 Git 权限规则，并将细节归入对应指南。
- 同步 `PROJECT_RULES.md` Documentation Map 与规则变更记录；本次只修改角色/协作文档，不改变业务代码、测试、产品架构、Room protocol 或当前 `REVIEW_REQUIRED` 阶段。
- 文档结构验证：`AGENTS.md` 为 9,848 bytes / 163 行，`CLAUDE.md` 为 8,875 bytes / 137 行；两者均显著低于 32 KiB 入口预算。八份相关入口/指南无 merge marker，全部 relative Markdown link 可解析。

### 2026-08-24 — Increment 1 Review 3 与 Fix 3 确认

- Codex 再次 Review 确认 Fix 2 的 typecheck 与 45 项测试通过，stale succeeded Run guard 与 `resumeRun` public-path regression 已正确落地。
- 受支持的两轮 Run/Fix 最小复现同时证明：`review-1` 已成功持久化、`run-2` 完成后，同 ID/同 content 重试 `review-1` 会因 current Run guard 位于 `insertReview` 幂等判断之前而返回 `validation_failed`，违反 Increment 1 已批准的 entity create idempotency contract。
- 用户确认最小方案：先复用 `insertReview` 区分既有同内容 Review、ID 冲突与新 Review，只对新 Review 执行 current Run guard；新 stale Review 继续由同一 transaction rollback。不新增 schema、pointer、migration 或通用 abstraction。
- 已创建 [Increment 1 Fix Task 3](./INCREMENT_1_FIX_TASK_3.md)，阶段进入 `FIX_PLAN_READY`。

### 2026-08-24 — Increment 1 Fix 3: Submit-Review Idempotency Order

按 [Increment 1 Fix Task 3](./INCREMENT_1_FIX_TASK_3.md) 修复 `review-increment-001-codex-003` 的 1 项 confirmed finding：

- `inc1-r3-submit-review-idempotency`：将 `submitReview` 内 `insertReview` 的幂等判断移到 transaction 开头，先区分既有同内容 Review（直接返回 `created=false` 且不新增 Event）、同 ID/异 content（`id_conflict`）与新 Review；只有新 Review 才执行 task/room、succeeded、completed 与 current Run guard。新 stale Review 的 guard 失败仍由同一 transaction rollback，不留下 partial write。

current Run 权威事实继续来自该 Room sequence 最大的 `run_completed` Event；未新增 pointer、schema、migration 或通用 abstraction。

### 2026-08-24 — Increment 1 Fix 2: Submit-Review Current-Run Guard and resumeRun Coverage

按 [Increment 1 Fix Task 2](./INCREMENT_1_FIX_TASK_2.md) 修复 `review-increment-001-codex-002` 的 2 项 confirmed findings：

- `inc1-r2-submit-review-current-run`：`submitReview` 在写入 Review 前校验 `review.run_id` 等于该 Room sequence 最大的 `run_completed` Event 指向的 Run（复用 `latestEventEntityId`），不新增 active_run_id 或其他持久化 pointer。
- `inc1-r2-resume-run-test-coverage`：新增 NEEDS_DECISION 状态下直接调用 `resumeRun` 的 public-path regression，验证 terminal 与 `needs_decision` 初始 status 被拒绝且不产生 partial write；将原有测试重命名为仅描述 `startRun`，消除测试名与覆盖范围不符。

新增 guard 的失败路径仍在同一 transaction 内 rollback，不产生 Review、Run、Room 或 Event partial write。

### 2026-08-23 — Increment 1 Review 2 与 Fix 2 确认

- Codex 二次 Review 确认 Fix 1 的 typecheck 与 43 项测试通过，Fix finding membership、UTC timestamp 和独立 transition oracle 已正确落地。
- 受支持的两轮 Run/Fix 复现证明：run-2 完成后，旧的 succeeded run-1 仍可通过 `submitReview` 创建 current Review；`inc1-r1-active-entity` 尚未完全闭环。
- Review 同时确认 `startRun/resumeRun` 非法 status 测试实际只调用 `startRun`；当前 `resumeRun` 实现因共享 validator 行为正确，但缺少 Task Contract 要求的直接 public-path 验收证据。
- 用户确认最小方案：复用最近一次 `run_completed` Event 校验 `submitReview` 的 current Run，并补充 `resumeRun` 聚焦测试；不新增 pointer、schema、migration 或通用 active-entity abstraction。
- 已创建 [Increment 1 Fix Task 2](./INCREMENT_1_FIX_TASK_2.md)，阶段进入 `FIX_PLAN_READY`。

### 2026-08-23 — Increment 1: Protocol and State Core

按 [Increment 1 Task Contract](./INCREMENT_1_TASK_CONTRACT.md) 完成 MVP 第一个增量，实现可持久化、可恢复、atomic 执行或拒绝 state transition 的最小 domain core。

实现内容：

- 单 package npm 项目（ESM、TypeScript strict、无 formatter/lint/build framework）。
- `src/protocol`：RoomState、Actor、TaskContract（含 Fix 变体 superRefine 校验）、Run、CodingResult、Review、Question、Event 与 protocol error 的 zod runtime schema 及对应 TS type。
- `src/room/repository.ts`：`node:sqlite` DatabaseSync 的 rooms/tasks/runs/reviews/questions/events 最小 schema 与 CRUD；无 ORM。repository 不暴露绕过 transition 校验的 rooms.state 修改原语。
- `src/room/state-machine.ts`：ROOM_PROTOCOL.md 第 4 节 14 条合法 transition 表与纯校验（未列 pair → `invalid_transition`，错误 actor → `actor_not_allowed`）。
- `src/room/room-service.ts`：application service，在单个 SQLite transaction 内协调 entity write、state change 与 Event append；idempotency（同 id 同 content 返回既有 entity 不重复写 Event，同 id 异 content → `id_conflict`）；Event sequence 按 Room 从 1 严格递增。
- 依赖 baseline 落地：`zod@4.4.3`（runtime）、`typescript@7.0.2` + `@types/node@24.13.3`（dev）。

### 2026-08-23 — Increment 1 Fix 1: Stale Entity and Protocol Validation Guards

按 [Increment 1 Fix Task 1](./INCREMENT_1_FIX_TASK_1.md) 修复 `review-increment-001-codex-001` 的 4 项 confirmed findings，阻止 stale entity 推进 Room state 并补齐协议校验：

- `inc1-r1-active-entity`：用现有 Room state、Run status 与 per-Room Event sequence 判定当前 Run/Review，不新增 active_* pointer column。`startRun`/`resumeRun` 拒绝 terminal 或 `needs_decision` Run；`completeRun`/`failRun`/`askQuestion` 只接受 `running` Run；`acceptReview` 与 Fix Task 只引用最近一次 `review_submitted` Event 指向的 Review。
- `inc1-r1-fix-finding-membership`：`validateFixReferences` 校验每个 `confirmed_findings.finding_id` 都存在于 referenced current Review.findings。
- `inc1-r1-timestamp-validation`：所有 protocol timestamp 复用严格 `z.iso.datetime()` validator，拒绝非 ISO 8601、非 UTC offset 与无效日期；内部 `now()` 继续用 `Date.toISOString()`。
- `inc1-r1-transition-test-oracle`：`state-machine.test.ts` 改为测试侧独立声明 14 条 transition 与 initiator，不再用实现表生成期望值。

每个新增 guard 的失败路径都在同一 transaction 内 rollback，不产生 partial write 或 Event。

### 2026-08-23 — Architecture Review 与文档基线

- 根据当前 Codex 与 Claude Code capability 审查了初始 Agent Room 方案。
- 用户接受 MVP 使用 explicit Codex pull 的 notification model。
- 建立 Git、SQLite、Runner、Codex App 与 VS Code 的状态所有权。
- 用 Task-lineage session scope 替代 Room-wide Claude session scope。
- 把 process completion 与 Room transition ownership 交给 Runner。
- 定义当前 State Machine、Task/Run/Review/Question entity 和六个 MCP tool。
- 创建 MVP increment plan 和已接受的 architecture ADR。
- 将共享文档语言规范固化为“简体中文叙述，代码、标识符、命令、Schema 字段和技术专名保持 English”，并统一本轮创建的全部项目文档。

已创建文档：

- [PROJECT_RULES.md](../../PROJECT_RULES.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [ROOM_PROTOCOL.md](./ROOM_PROTOCOL.md)
- [MVP_PLAN.md](./MVP_PLAN.md)
- [ADR/0001-local-room-and-state-ownership.md](./ADR/0001-local-room-and-state-ownership.md)
- [ADR/0002-agent-integration-lifecycle.md](./ADR/0002-agent-integration-lifecycle.md)

## 当前事实

- Increment 1 已完成：`src/protocol`、`src/room` 与 `tests/` 已就绪；Git、MCP、process 等外部事实未在本增量实现，由 `tests/scope.test.ts` 负向断言证明。
- Increment 1 dependency baseline 已选择并落地：Node.js 24、npm 11、TypeScript 7、`@types/node` 24、Zod 4、内建 `node:sqlite` 与 `node:test`。
- MCP SDK 与 Claude Runner flags 留待其所属增量（Increment 3/4）验证，不属于 Increment 1。
- 用户已批准在 Room MCP 建成前使用受限 `claude -p` bootstrap transport；Increment 4 被接受后该路径终止。
- 用户已授权初始化 Git 并创建首个 documentation baseline commit；该授权不包含后续代码 commit、push 或历史改写。

## 验证

### 2026-08-24 — Increment 3 Integration

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/claude-runner.test.ts" "tests/room-service.test.ts" "tests/claude-stream.test.ts"`：聚焦 76 个测试全部通过，覆盖 start/resume lifecycle、process/stream/Git/artifact evidence、六类 failure mapping、单一 terminal transition 与 Room atomic evidence 持久化。
- `node --test "tests/scope.test.ts"`：1 项通过，确认 central runner exact file allowance 与 MCP/CLI/额外 module 禁止边界。
- `npm test`（`node --test`）：118 个测试全部通过，无回归。

### 2026-08-24 — Increment 3 Integration Fix 1

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/room-service.test.ts" "tests/claude-stream.test.ts" "tests/claude-runner.test.ts"`：聚焦 96 个测试全部通过，新增 stale current Task guard（start/resume/rollback/retry）、required-tool partial session evidence 与 central failure matrix（async error/EPIPE/signal/init/malformed/session/terminal/CodingResult）regression。
- `node --test "tests/scope.test.ts"`：1 项通过，central runner exact file allowance 边界不变。
- `npm test`（`node --test`）：139 个测试全部通过，无回归。

### 2026-08-23 — Increment 1

- `npm ci`：从 package-lock.json 重建 dependency tree，5 packages、0 vulnerabilities。
- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `npm test`（`node --test`）：33 个测试全部通过。
  - protocol schema 对每类 entity 的有效 fixture 与代表性无效 fixture（缺必填、非法 enum、非法 Fix shape、`confirmed_by_user=false`、非正 Event sequence）。
  - 14 条合法 transition 各自的正向测试 + 错误 actor 反向测试；exhaustive 11×11 transition matrix 证明所有未列 state pair 返回 `invalid_transition`。
  - 失败 create/transition 不产生 entity/state/Event partial write。
  - 同 id 同 content 幂等（不重复 Event）、同 id 异 content → `id_conflict`。
  - Event sequence 按 Room 从 1 递增、多 Room 相互独立。
  - database close/reopen 恢复 state、entity 与 event cursor。
  - 完整 Discussion → Plan → Coding → Review → Fix → Coding → Review → Accepted 循环。

### 2026-08-23 — Increment 1 Fix 1

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/room-service.test.ts" "tests/protocol.test.ts" "tests/state-machine.test.ts"`：42 个测试全部通过。
- `npm test`（`node --test`）：43 个测试全部通过（含 `scope.test.ts`）。
  - 新增 timestamp regression（合法 UTC ISO 8601 被接受；非 ISO 8601、非 UTC offset、无效日期被拒绝）。
  - 新增 stale Run / stale Review / phantom finding / 非 completed CodingResult / 非法 Run status 的聚焦 regression tests。
  - `state-machine.test.ts` 独立 oracle 与 ROOM_PROTOCOL.md 的 14 条规则一致，并验证未列 pair 与错误 actor。

### 2026-08-24 — Increment 1 Fix 2

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/room-service.test.ts"`：27 个测试全部通过。
- `npm test`（`node --test`）：45 个测试全部通过（含 `scope.test.ts`）。
  - 新增 stale succeeded Run（引用旧 run-1 被拒绝、引用当前 run-2 成功）与 resumeRun 非法初始 status 的聚焦 regression tests。
  - 原有 43 项测试继续通过，无回归。

### 2026-08-24 — Increment 1 Fix 3

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/room-service.test.ts"`：28 个测试全部通过。
- `npm test`（`node --test`）：46 个测试全部通过（含 `scope.test.ts`）。
  - 新增跨后续 Run 的 Review 幂等重试 regression（同 ID/同 content 返回既有 review、同 ID/异 content → `id_conflict`、新 review_id 引用旧 run-1 仍被拒、引用当前 run-2 成功）。
  - 原有 45 项测试继续通过，无回归。

### 2026-08-24 — Increment 2

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/git-observer.test.ts"`：9 个测试全部通过。
  - 非 repository 与不存在路径 → `git_repository_missing`；无 commit worktree → `git_head_missing`（HEAD 校验先于 clean gate）。
  - clean repo 返回与独立 `git rev-parse HEAD` 相同的 `baselineHead`、正确 repository root 与三个 empty array。
  - staged-only、unstaged-only、untracked-only 分别 → `worktree_not_clean`。
  - 组合 fixture 精确证明 staged / unstaged / 同 path 双分类 / 带空格 untracked 归入正确 set，ignored path 不归入 untracked。
  - 子目录调用仍观察整个 worktree 并返回 root-relative path；repository root 解析为 owning root。
  - merge-conflict fixture 证明 `git diff --name-only` 对同一 path 重复输出时 observer 正确去重；clean 与 dirty fixture 调用前后 HEAD 与 `git status --porcelain` 不变，证明只读。
  - 源码静态断言只发出 `rev-parse`/`diff`/`ls-files` 只读命令，且不含 mutation subcommand 字符串。
- `npm test`（`node --test`）：55 个测试全部通过（含 `scope.test.ts`）；原有 46 项 Increment 1 测试无回归。

### 2026-08-24 — Increment 2 Fix 1

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/git-observer.test.ts"`：11 个测试全部通过。
  - 新增两个 public-path fatal-failure regression：损坏 index 的临时仓库调用 `establishCleanBaseline` 与 `collectCompletionEvidence` 均以 `GitCommandError` 拒绝，且保留 command `diff`、args `['--cached','--name-only','-z']`、repository-root cwd、`exitCode=128` 与非空 stderr。
  - non-existent target 测试在 `finally` 中删除 `makeFixture` 返回的 parent directory，不再遗留临时目录。
  - 原有 9 项 Git Observer 测试（正常 repository、missing repository/HEAD、dirty gate、path classification、stable sort、dedup、subdirectory、ignored path、只读 invariant 与 mutation-command boundary）全部继续通过。
- `npm test`（`node --test`）：57 个测试全部通过（含 `scope.test.ts`）；原有 46 项 Increment 1 测试无回归。

### 2026-08-23 — 文档基线

- 枚举全部九个 Markdown 文档；
- 确认所有 relative Markdown link 均可解析；
- 确认所有新增 shared design document 都登记在 Documentation Map；
- 确认目录中没有意外生成的非文档文件；
- 确认 JSON mirror、保存 patch、Room-wide session 和 model-owned result reporting 只出现在拒绝、替代或历史语境；
- 修正过早使用 `PLAN_READY` 的状态标签，因为当前尚无有效 Task Contract。
- 确认叙述性英文段落已清除；剩余 English 内容仅为技术专名、标识符、状态、Schema、命令或文件名。
- 确认 Markdown code fence 与 inline code 的 backtick 可正常渲染，不存在转义残留。

## 阻塞项

无 unresolved finding。Increment 3 已获用户接受并提交到 Integration branch；当前未获 push、merge 或 branch/worktree 清理授权。

## 下一步

下一步由用户决定是否把 accepted Integration commit 集成到 `main`；merge、push 与 branch/worktree 清理必须分别明确授权。当前停止，不执行任何额外 Git 写操作。
