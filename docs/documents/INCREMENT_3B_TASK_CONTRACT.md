# Increment 3B Task Contract — Claude Stream Interpreter

> 状态：Draft / Not Accepted
> 日期：2026-08-24
> Parent goal：Increment 3 — Claude Runner
> Parallel role：Leaf B
> Bootstrap transport：`claude -p`
> 派发状态：禁止派发

本 Contract 是并行试点的 Leaf B 草案。`confirmed_by_user=false` 表示它尚不满足 Room Task schema 的派发门禁；用户最终批准后才可改为 `true` 和 `Accepted`。

```yaml
task_id: increment-003b-claude-stream-interpreter
room_id: bootstrap-codex-claudecode-room
type: implementation
parent_task_id: null
based_on_review_id: null

background: >
  Increment 1 已交付 Protocol/State Core，Increment 2 已交付只读 Git Observer。
  Increment 3 的 parent goal 是由 Runner 启动非交互 Claude Code process、解释 structured output、
  收集真实 process/Git evidence，并由 Runner 唯一推进 terminal Run state。为验证开发期
  branch/worktree 并行流程，本任务只实现 stream interpretation leaf；process transport、
  Room lifecycle 和 Integration 由其他 Task 拥有。本机 Claude Code 2.1.241 的受限真实 smoke
  已冻结 hook/init/result/session/structured_output 的当前 event shape。

goal: >
  交付一个逐行、确定性的 Claude Stream Interpreter，从 stdout JSONL 中识别唯一 init、
  required Room tool、session 与唯一 terminal result，并使用现有 codingResultSchema
  返回经验证的 CodingResult 或可区分的 interpretation failure。

requirements:
  - 在 src/runner/claude-stream.ts 实现独立 pure/application-neutral leaf；不得启动 process、创建 central Runner 或修改 durable state。
  - interpreter input 至少包含 expectedTaskId、requiredToolName、nullable expectedSessionId 和按顺序到达的 stdout line；requiredToolName 冻结为 mcp__agent_room__room_ask_question。
  - 只对 Process Transport 分离出的 stdout line 执行 JSON.parse；stderr 不是本模块输入。空 line 可以忽略，任一非空 malformed JSON line 返回明确 interpretation failure，不得静默跳过。
  - 不要求 init 是第一条 event；type=system 的 hook_started、hook_response、thinking_tokens 与未知 progress event 可以在 init 前后出现并作为非终态 progress evidence返回/记录。
  - 单个 hook_response outcome=error 不得单独决定 Run failure；真实 smoke 已证明 hook failure 后仍可能存在成功 terminal result。
  - initialization authority 是唯一 type=system, subtype=init event；提取非空 session_id、tools array、mcp_servers raw metadata、permissionMode 与 claude_code_version 的可用字段。
  - init 缺失或重复必须失败；init tools 不含 exact requiredToolName 时返回 required-tool-missing failure，不以 mcp_servers 非空或模型自述代替 tool availability。
  - terminal authority 是唯一 type=result event；assistant message、StructuredOutput tool_use、tool_result、hook 或 progress event 都不得作为 terminal authority。
  - terminal 必须满足 subtype=success、is_error=false、非空 session_id，且 session_id 与 init 完全一致；expectedSessionId 非 null 时 init/terminal 还必须与它完全一致。stop_reason=tool_use 是 structured output 的合法成功事实，不得要求 end_turn。
  - terminal 必须包含 object structured_output；使用现有 codingResultSchema 对其严格验证，再校验 CodingResult.task_id 等于 expectedTaskId。
  - terminal result JSON string 作为 raw evidence 保留，但 structured_output object 是 parser 的 CodingResult input；不得依赖 assistant text、Markdown fence 或重新从 result string 猜测缺失 object。
  - missing/duplicate terminal、terminal error、session mismatch、missing/invalid structured_output 与 task mismatch 必须返回可区分 failure reason；不得在本模块映射 ProtocolError code 或请求 Room transition。
  - 有效 outcome 至少返回 init session ID、required-tool evidence、validated CodingResult、terminal raw metadata 与非终态 progress evidence；不得复制为 durable Room/Git authority。
  - interpreter 完成后不得接受第二个 init/terminal 或改变已返回 outcome；实现可以使用最小显式 state，但不得建立通用 event framework/plugin registry。
  - 测试 fixture 必须是根据已授权真实 smoke shape 脱敏后的 literal JSONL，不包含真实 session ID、absolute user path、account/auth detail、model cost 或私有 prompt content。

non_goals:
  - 启动/终止 Claude process、构造 CLI arguments、stdin/stdout chunk framing 或 stderr capture。
  - central Runner orchestration、RoomService/RoomRepository/state-machine 修改、Run persistence 或 terminal transition。
  - Git baseline/completion evidence、artifact file、progress Event persistence 或 Question command implementation。
  - 真实 Room MCP server、MCP SDK、MCP connection handshake、Status CLI 或 Increment 4 end-to-end verification。
  - 为所有 Claude Code version 建 compatibility layer、event adapter registry、fallback parser 或 text-result recovery。
  - 解析 Claude 私有 transcript、assistant reasoning 或 tool arguments，或把 model self-report 当作 process/Git evidence。
  - 修改 protocol/schema/error set、package metadata、lockfile、tsconfig、scope regression、共享文档或 Leaf A 文件。
  - commit、push、branch/worktree mutation、merge、rebase、cherry-pick、stage、reset、clean 或 checkout。

architecture_decisions:
  - stdout JSONL meaning 由 Stream Interpreter 唯一解释；Process Transport 只负责 line framing；Integration 唯一映射 protocol failure 和 terminal transition。
  - init event 是 session/tool capability authority，required room_ask_question tool presence 比未冻结的 MCP internal status 更接近实际可调用 capability。
  - type=result event 是 terminal authority；structured_output object 是 CodingResult transport，原始 codingResultSchema 是 runtime validation authority。
  - hook/progress event 不是 terminal outcome；只有 terminal result 与独立 process exit 组合后，Integration 才能判断 Run success/failure。
  - 当前只支持本机已验证的 Claude Code 2.1.241 shape；version drift 由后续 capability gate 报告，不在本 leaf 内自动兼容。

scope:
  - src/runner/claude-stream.ts
  - tests/claude-stream.test.ts
  - tests/runner-fixtures/ 下仅供本 Task 使用的脱敏 Claude JSONL fixture

constraints:
  - 派发前必须完成、Review、接受并提交串行 Scope Scaffold，使 tests/scope.test.ts 允许本 leaf 的冻结文件且继续拒绝 central Runner/MCP/CLI 与 dependency drift。
  - 使用从同一已确认 planning baseline 创建的独立 branch codex/inc3-claude-stream 与独立 worktree；branch/worktree metadata 不写入 Room Task schema。
  - 只修改本 Contract scope；不得读取 Leaf A 未接受修改作为依赖，不得写入 main 或其他 worker worktree。
  - 只读复用 src/protocol/schema.ts 导出的 codingResultSchema 与 CodingResult type；不得复制 schema 或修改 protocol。
  - 不增加 dependency；JSON.parse 与现有 Zod 4 足够。若正确实现需要 package/lockfile/shared config 变化，返回 needs_decision。
  - 不修改 tests/scope.test.ts、src/room、src/git、PROJECT_RULES.md、ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md 或 DEVELOPMENT_LOG.md。
  - 关键 terminal authority、hook non-authority、session consistency 与 structured_output validation 使用必要的简体中文注释；不得逐行复述 event field。
  - 测试不得调用真实 Claude、产生模型费用、启动 MCP server、修改 Git repository 或依赖 operator 全局 Claude settings。

acceptance_criteria:
  - 真实 shape 的有效 new-session fixture 可以在 init 前包含 hook_started/hook_response，并返回 init session、required-tool evidence 与 validated CodingResult。
  - hook_response outcome=error 加成功 terminal 的 fixture仍成功解释，同时把 hook event保留为非终态 progress evidence。
  - 有效 resume fixture 的 init 与 terminal 使用 exact expectedSessionId 并成功返回；init/terminal/expected 三者任一 session mismatch 明确失败。
  - init missing、init duplicate 与 required tool missing 各自产生不同 failure reason，不返回 partial success outcome。
  - malformed nonempty stdout line 明确失败；未知但合法 JSON progress event 不被误判为 terminal。
  - assistant StructuredOutput tool_use 与 tool_result 都不能提前完成 interpreter；只有唯一 type=result terminal 可以完成。
  - terminal missing、terminal duplicate、subtype 非 success、is_error=true 与 missing structured_output 各自失败。
  - terminal stop_reason=tool_use 仍可成功；不得把它误报为 claude exit failure。
  - structured_output schema invalid 或 task_id 与 expectedTaskId 不同返回 coding-result failure，不把 result string fallback 当作成功。
  - 有效 outcome 中的 CodingResult 与 structured_output object结构一致，且不包含从 assistant text 推断的字段。
  - npm run typecheck、聚焦测试与 npm test 全部通过；既有 Protocol/Room/Git tests 无回归。

verification:
  - command: npm run typecheck
    detects: event narrowing、interpreter state、CodingResult schema/type 或 success/failure outcome union 的 TypeScript 偏移。
    decision_if_failed: 不得报告 completed；只修复本 Task 引入的类型错误。
  - command: node --test "tests/claude-stream.test.ts"
    detects: hook/init/tool/session/terminal authority、malformed line、structured_output validation 与 task membership interpretation 错误。
    decision_if_failed: 不得报告 completed；定位对应 stream public behavior 后在 task-owned scope 修复。
  - command: npm test
    detects: 新增 leaf 破坏既有 Protocol/Room/Git behavior，或 Scope Scaffold 的冻结 module/dependency boundary 发生漂移。
    decision_if_failed: 不得报告 completed；若失败要求修改共享 scope/config/protocol，返回 needs_decision，不得跨 worktree 修复。

documentation_updates: []

question_policy: >
  如果正确实现需要改变已冻结 event authority、required tool name、CodingResult schema、dependency、
  shared scope、protocol、Room lifecycle、process interface 或其他 worker 文件，停止受影响工作并返回
  needs_decision。不得为未知未来 Claude version 自行增加 compatibility path。

confirmed_by_user: false
created_by: codex
created_at: 2026-08-24T04:41:00Z
```

## 派发前置条件

1. 用户 Review 本 Draft 并明确批准；随后把状态改为 `Accepted`、`confirmed_by_user=true`。
2. 串行 Scope Scaffold 已 Review、接受并提交，main worktree clean。
3. 含本 Accepted Contract 的 planning baseline 已提交。
4. 用户明确授权创建 Leaf B branch/worktree，并记录实际 `baseline_head`、branch、worktree 与 task owner。
5. 通过已批准 bootstrap transport 向 Leaf B Claude Code 注入本文件全文；摘要不能替代 Contract。

## 参考文档

- [并行试点计划](./INCREMENT_3_PARALLEL_PILOT_PLAN.md)
- [Accepted Scope Scaffold Contract](./INCREMENT_3_SCOPE_SCAFFOLD_TASK_CONTRACT.md)
- [PROJECT_RULES.md](../../PROJECT_RULES.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [ROOM_PROTOCOL.md](./ROOM_PROTOCOL.md)
- [MVP_PLAN.md](./MVP_PLAN.md)
- [ADR-0002](./ADR/0002-agent-integration-lifecycle.md)
- [Claude Coding 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
