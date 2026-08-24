# Increment 3A Fix Task 1 — stdin Prompt Delivery Failure

> 状态：Accepted
> 用户确认日期：2026-08-24
> Review ID：`review-increment-003a-codex-001`
> Bootstrap transport：`claude -p --resume`
> 派发状态：人工 retry 已完成；Review 2 `approved`，用户已接受；leaf commit `86c77a7c68b953343d67da3857859b0dd6d6c09c`，尚未集成

```yaml
task_id: increment-003a-claude-process-transport-fix-001
room_id: bootstrap-codex-claudecode-room
type: fix
parent_task_id: increment-003a-claude-process-transport
based_on_review_id: review-increment-003a-codex-001

background: >
  Increment 3A Implementation 在 branch codex/inc3-claude-process、共同 baseline
  97c47fed770fea675834538e2ca4550d37fdc548 上完成；typecheck、13 项聚焦测试与
  70 项全量测试均通过。Codex Review 的最小 fault injection 证明：child stdin write
  返回 EPIPE 后，即使 child 随后 close(0, null)，当前 transport 仍返回普通
  { exitCode: 0, signal: null } outcome。该行为把“完整 Task Contract 未送达”的
  transport failure 降级为成功 process exit fact，违反原 Accepted Contract 的完整
  stdin delivery 与 process failure boundary。用户已确认以下最小解决方案。

goal: >
  使 Claude Process Transport 对 stdin prompt delivery failure 返回可区分的 typed
  transport/input failure，并保证后续 close/error event 不能把该失败改写为普通 exit outcome。

confirmed_findings:
  - finding_id: inc3a-r1-stdin-write-failure
    solution: >
      删除静默 stdin error handler；以最小 typed ClaudeProcessInputError 携带 command、args、
      cwd 与原始 cause 拒绝 startClaudeProcess Promise，并复用单次 settlement guard，确保
      已观察到的 stdin failure 不被之后的 close/error 改写。增加 fake Writable 返回 EPIPE、
      随后 child close(0, null) 的直接 public-path regression；保留正常 close、spawn failure、
      stdout/stderr 和完整 prompt 行为不变。

requirements:
  - 只修复 review-increment-003a-codex-001 已确认的 stdin prompt delivery finding。
  - child stdin write/end 发生异步 error 时，不得静默吞掉、伪造 exit code或返回普通 ClaudeProcessOutcome。
  - stdin failure 必须以独立 typed ClaudeProcessInputError 拒绝，保留 command、完整 args、cwd 与原始 cause。
  - stdin failure、spawn error event 与 close event 继续共享单次 settlement ownership；先完成的 failure/outcome 一旦确定，后续 event 不得改变 Promise 结果或产生第二次 settlement。
  - ClaudeProcessStartError 继续只表示同步 spawn failure 或 child error event；不得把 stdin delivery failure 错报为 process-start failure。
  - 正常 stdin 仍必须收到与 input 完全一致的完整多行 prompt，并在写入后关闭；不得改变 CLI argument、schema serialization、stdout line framing 或 stderr separation。
  - fake process fixture 只增加注入 stdin write failure 所需的最小 seam；不得创建通用 stream/process fault framework。
  - regression 必须直接调用 startClaudeProcess，构造 stdin EPIPE 后 close(0, null)，并断言 typed rejection 的稳定 context 与后续 close 不改变结果。

non_goals:
  - 修改 CLI flags、tool lists、schema normalization、resume semantics、stdout/stderr callback shape 或普通 exit outcome。
  - 在本 leaf 映射 ProtocolError、Run failure code、Room transition、artifact、Git evidence 或 retry/backoff。
  - 修改 Leaf B、central Runner、Room、Git Observer、Scope regression、protocol/schema、package metadata、lockfile、tsconfig 或共享文档。
  - 增加 timeout、abort controller、process kill、stdin retry、通用 command runner 或兼容层。
  - 处理本 Review 未确认的其它 process、stream、encoding 或平台问题。
  - commit、push、stage、branch/worktree mutation、merge、rebase、cherry-pick、reset、restore、clean、checkout 或历史改写。

architecture_decisions:
  - Process Transport 继续只拥有 OS process 与 prompt delivery fact；stdin failure 是 transport fact，不是 Room/domain semantic。
  - spawn/start failure、stdin/input failure 与正常 close outcome 保持可区分；Integration 后续负责映射 protocol failure 和 terminal transition。
  - 最小修复复用现有 Promise settlement boundary，不增加 process state machine、framework 或 dependency。

scope:
  - review_fixes_only
  - src/runner/claude-process.ts 中 stdin failure propagation 与 single-settlement boundary
  - tests/claude-process.test.ts 中对应 public-path regression
  - tests/runner-fixtures/claude-process-fake.ts 中仅供该 regression 使用的最小 failure seam

constraints:
  - 保留原始 baseline_head 97c47fed770fea675834538e2ca4550d37fdc548。
  - 当前 branch 为 codex/inc3-claude-process，target worktree 为 D:/agent/case/codex-claudecode-room-worktrees/inc3-claude-process。
  - 恢复原 Implementation Task 的 Claude session 082e2b70-0e35-440d-a9a4-71f1515e2660；Fix 继续修改当前未提交的 task-owned Diff。
  - 本 Fix Contract 位于 main 的 Codex 文档权威源；派发时注入全文，Claude 不修改、复制或报告该文档为 changed_files。
  - 不读取 Leaf B 未接受修改，不写入 main、其他 worktree 或 Contract scope 外路径。
  - 不运行 formatter，不重排无关代码，不修改既有测试名称或 fixture 行为，除非该行直接服务 confirmed finding。

acceptance_criteria:
  - fake stdin write 返回 EPIPE、child 随后 close(0, null) 时，startClaudeProcess 以 ClaudeProcessInputError 拒绝，不返回 exitCode 0 outcome。
  - ClaudeProcessInputError 精确保留 command=claude、实际 args、target cwd 与原始 EPIPE cause。
  - stdin failure 后的 close/error event 不改变已返回 rejection，也不触发第二次 settlement。
  - 正常完整多行 prompt、new/resume argument、schema normalization、stdout framing、stderr callback、exit 0、non-zero exit、signal exit 与 spawn failure 的既有测试继续通过。
  - npm run typecheck、聚焦测试与 npm test 全部通过；Protocol、Room、Git、Scope 与 dependency regression 无回归。
  - 最终 Claude-owned Diff 只包含上述三个 Increment 3A task-owned files，且只增加 confirmed finding 所需的最小实现和测试。

verification:
  - command: node --test "tests/claude-process.test.ts"
    detects: stdin EPIPE 是否仍被吞掉、typed error context 是否丢失、late close 是否改写 outcome，以及既有 process boundary 是否回归。
    decision_if_failed: 不得报告 completed；只修复 confirmed stdin failure 与受其直接影响的 fake seam。
  - command: npm run typecheck
    detects: ChildProcess stdin error、typed failure、settlement guard 或 test seam 的 TypeScript 偏移。
    decision_if_failed: 不得报告 completed；只修复本 Fix 引入的类型错误。
  - command: npm test
    detects: Fix 是否破坏既有 Protocol、Room、Git、Scope、dependency 或另一 leaf 的冻结边界。
    decision_if_failed: 不得跨 scope 修复；若必须改变共享 boundary，返回 needs_decision。
  - command: git diff -- src/runner/claude-process.ts tests/claude-process.test.ts tests/runner-fixtures/claude-process-fake.ts
    detects: Diff 是否仅包含 confirmed finding 的最小实现与 regression。
    decision_if_failed: 移除本 Fix 产生的越界修改；无法安全处理则返回 needs_decision。

documentation_updates: []

question_policy: >
  若正确修复需要改变 Promise success shape、CLI/process interface、ProtocolError、Room lifecycle、
  dependency、shared scope、Leaf B 或任何其它文件，停止并返回 needs_decision。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: 2026-08-24T10:03:31Z
```

## 相关文档

- [Increment 3A Accepted Task Contract](./INCREMENT_3A_TASK_CONTRACT.md)
- [Increment 3 Parallel Pilot Plan](./INCREMENT_3_PARALLEL_PILOT_PLAN.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
