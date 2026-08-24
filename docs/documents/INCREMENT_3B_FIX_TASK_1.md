# Increment 3B Fix Task 1 — Frozen Required Room Tool Authority

> 状态：Accepted
> 用户确认日期：2026-08-24
> Review ID：`review-increment-003b-codex-001`
> Bootstrap transport：`claude -p --resume`
> 派发状态：人工 retry 已完成；Review 2 `approved`，用户已接受；leaf commit `1062a7500f8bb3e22c7c3818ddcac2e9eb625efa`，尚未集成

```yaml
task_id: increment-003b-claude-stream-interpreter-fix-001
room_id: bootstrap-codex-claudecode-room
type: fix
parent_task_id: increment-003b-claude-stream-interpreter
based_on_review_id: review-increment-003b-codex-001

background: >
  Increment 3B Implementation 在 branch codex/inc3-claude-stream、共同 baseline
  97c47fed770fea675834538e2ca4550d37fdc548 上完成；typecheck、22 项聚焦测试与
  79 项全量测试均通过。Codex Review 的最小复现从 init tools 删除
  mcp__agent_room__room_ask_question，并向 constructor 传入 built-in Read；当前 interpreter
  仍返回 ok: true，并把 Read 报告为 required-tool evidence。该行为把冻结的 Room decision
  tool authority 交给普通 caller string，违反原 Accepted Contract。用户已确认以下最小方案。

goal: >
  把 Stream Interpreter 的 required tool authority 固定为 exact
  mcp__agent_room__room_ask_question，使任意 built-in 或 caller-provided string 都不能替代该能力证据。

confirmed_findings:
  - finding_id: inc3b-r1-required-tool-freeze
    solution: >
      定义单一 frozen REQUIRED_ROOM_TOOL_NAME constant，并将
      ClaudeStreamInterpreterInput.requiredToolName 限定为该 constant 的 string literal type；
      interpreter 的 init tools 校验与 success evidence 始终使用 frozen constant，而不是任意
      caller string。增加 init 只含 built-in Read 且不含 Room tool 时必须
      required_tool_missing 的直接 regression，并证明 built-in 不能改变 authority。

requirements:
  - 只修复 review-increment-003b-codex-001 已确认的 required Room tool freeze finding。
  - 在 claude-stream module 定义唯一 REQUIRED_ROOM_TOOL_NAME，其值精确为 mcp__agent_room__room_ask_question。
  - ClaudeStreamInterpreterInput.requiredToolName 必须使用 typeof REQUIRED_ROOM_TOOL_NAME 的 literal type，不得保持任意 string。
  - init tools capability 校验与成功 outcome.requiredTool.name 必须以 frozen constant 为 authority，不得信任调用者提供的其它 tool name。
  - init tools 不含 frozen Room tool 时必须返回现有 required_tool_missing；即使 tools 包含 Read、Edit、Write、Glob、Grep 或 Bash 也不得成功。
  - 有效 fixture 包含 exact Room tool 时继续成功；不得改变 init、session、terminal、progress 或 codingResultSchema authority。
  - regression 必须直接调用 ClaudeStreamInterpreter，覆盖“built-in 存在、Room tool 缺失”并断言不返回 partial success。
  - 保留现有 failure reason union；不得为 caller 配置增加 protocol/domain error、fallback 或 compatibility path。

non_goals:
  - 修改 required Room tool 的名称、CLI allowedTools、MCP server config、process transport 或 Increment 4 connection handshake。
  - 修改 terminal authority、structured_output validation、session matching、progress evidence、CodingResult schema 或 result string semantics。
  - 修改 Leaf A、central Runner、Room、Git Observer、Scope regression、protocol/schema、package metadata、lockfile、tsconfig 或共享文档。
  - 增加 tool registry、plugin system、多个 required tool、alias、version adapter 或通用 capability framework。
  - 处理本 Review 未确认的其它 stream、JSONL、Claude version 或 MCP 问题。
  - commit、push、stage、branch/worktree mutation、merge、rebase、cherry-pick、reset、restore、clean、checkout 或历史改写。

architecture_decisions:
  - init tools 继续是 capability authority；本 Fix 只冻结要查询的 exact Room tool name，不改变 authority source。
  - frozen constant 同时拥有 TypeScript input constraint、runtime tools lookup 与 success evidence name，避免 caller/config 漂移形成第二权威。
  - 最小修复留在现有 leaf，不增加 dependency、failure reason、protocol mapping 或 integration wiring。

scope:
  - review_fixes_only
  - src/runner/claude-stream.ts 中 frozen required tool constant、literal input type 与 authority lookup
  - tests/claude-stream.test.ts 中 built-in 不能替代 Room tool 的直接 regression

constraints:
  - 保留原始 baseline_head 97c47fed770fea675834538e2ca4550d37fdc548。
  - 当前 branch 为 codex/inc3-claude-stream，target worktree 为 D:/agent/case/codex-claudecode-room-worktrees/inc3-claude-stream。
  - 恢复原 Implementation Task 的 Claude session b386f58f-4005-490e-8ee1-292b33cb2ed9；Fix 继续修改当前未提交的 task-owned Diff。
  - 本 Fix Contract 位于 main 的 Codex 文档权威源；派发时注入全文，Claude 不修改、复制或报告该文档为 changed_files。
  - 不读取 Leaf A 未接受修改，不写入 main、其他 worktree 或 Contract scope 外路径。
  - 不运行 formatter，不重排无关代码，不修改 JSONL fixture，除非现有 literal fixture 无法直接表达 confirmed regression。

acceptance_criteria:
  - REQUIRED_ROOM_TOOL_NAME 的值精确等于 mcp__agent_room__room_ask_question，input.requiredToolName 在 TypeScript 中只接受该 literal。
  - init tools 包含 Read 等 built-in 但不含 frozen Room tool 时返回 reason=required_tool_missing，不返回 ok=true 或 built-in requiredTool evidence。
  - interpreter 的成功 outcome.requiredTool.name 始终是 frozen Room tool；caller-provided built-in 不能改变校验对象或 evidence。
  - 有效 new-session/resume fixture、hook/progress、session、terminal 与 CodingResult 的既有测试继续通过。
  - npm run typecheck、聚焦测试与 npm test 全部通过；Protocol、Room、Git、Scope 与 dependency regression 无回归。
  - 最终 Claude-owned Diff 只包含 src/runner/claude-stream.ts 与 tests/claude-stream.test.ts，且只增加 confirmed finding 所需的最小实现和测试。

verification:
  - command: node --test "tests/claude-stream.test.ts"
    detects: built-in 是否仍可替代 frozen Room tool、required_tool_missing 是否丢失，以及既有 stream authority 是否回归。
    decision_if_failed: 不得报告 completed；只修复 confirmed required-tool freeze 与其直接 regression。
  - command: npm run typecheck
    detects: frozen constant、literal input type、constructor usage 或 test call site 的 TypeScript 偏移。
    decision_if_failed: 不得报告 completed；只修复本 Fix 引入的类型错误。
  - command: npm test
    detects: Fix 是否破坏既有 Protocol、Room、Git、Scope、dependency 或另一 leaf 的冻结边界。
    decision_if_failed: 不得跨 scope 修复；若必须改变共享 boundary，返回 needs_decision。
  - command: git diff -- src/runner/claude-stream.ts tests/claude-stream.test.ts
    detects: Diff 是否仅包含 confirmed finding 的最小 constant/type/lookup 与 regression。
    decision_if_failed: 移除本 Fix 产生的越界修改；无法安全处理则返回 needs_decision。

documentation_updates: []

question_policy: >
  若正确修复需要改变 exact required tool name、failure reason、event authority、process interface、
  protocol、Room lifecycle、dependency、shared scope、Leaf A 或任何其它文件，停止并返回 needs_decision。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: 2026-08-24T10:03:31Z
```

## 相关文档

- [Increment 3B Accepted Task Contract](./INCREMENT_3B_TASK_CONTRACT.md)
- [Increment 3 Parallel Pilot Plan](./INCREMENT_3_PARALLEL_PILOT_PLAN.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
