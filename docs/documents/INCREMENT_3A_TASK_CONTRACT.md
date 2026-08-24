# Increment 3A Task Contract — Claude Process Transport

> 状态：Accepted
> 日期：2026-08-24
> 用户确认日期：2026-08-24
> Parent goal：Increment 3 — Claude Runner
> Parallel role：Leaf A
> Bootstrap transport：`claude -p`
> Baseline 状态：由本 Accepted Contract documentation baseline commit 建立；派发前以当前 `main` HEAD 记录实际 `baseline_head`
> 派发状态：未派发；等待 branch/worktree 与并行派发授权

用户已明确批准本 Contract；`confirmed_by_user=true` 使其满足 Task confirmation gate。Contract approval 本身只确认本文定义的目标、范围、约束和验收；用户随后单独授权本 documentation baseline commit，但仍未授权 branch/worktree 创建、Claude Coding 派发、实现提交或 push。

```yaml
task_id: increment-003a-claude-process-transport
room_id: bootstrap-codex-claudecode-room
type: implementation
parent_task_id: null
based_on_review_id: null

background: >
  Increment 1 已交付 Protocol/State Core，Increment 2 已交付只读 Git Observer。
  Increment 3 的 parent goal 是由 Runner 启动非交互 Claude Code process、解释 structured output、
  收集真实 process/Git evidence，并由 Runner 唯一推进 terminal Run state。为验证开发期
  branch/worktree 并行流程，本任务只实现 process transport leaf；stream interpretation、
  Room lifecycle 和 Integration 由其他 Task 拥有。本机 Claude Code 2.1.241 的受限真实 smoke
  已确认 stream-json、verbose、session 与 structured_output 的实际 boundary。

goal: >
  交付一个最小 Claude Process Transport，以无 shell argument array 启动单个非交互
  Claude Code process，通过 stdin 传入完整 prompt，并把 stdout line、stderr chunk、
  spawn failure、exit code 与 signal 作为未经语义解释的 process fact 返回给 Integration。

requirements:
  - 在 src/runner/claude-process.ts 实现独立 infrastructure leaf；不得创建 central Runner、application command 或 Room wiring。
  - transport input 至少包含 target cwd、完整 prompt、raw Coding Result JSON Schema、serialized Room MCP config、nullable resumeSessionId、stdout-line callback 与 stderr-chunk callback。
  - 使用 Node.js child_process.spawn 或等价无 shell process API，command 为 claude，arguments 以 array 传递，cwd 为 target worktree，shell 必须为 false/default false。
  - 完整 prompt 必须写入 child stdin 后关闭 stdin；不得把完整 Task Contract 放入 command-line argument，也不得摘要 Contract。
  - new Implementation session 不传 --resume；resumeSessionId 非 null 时精确传入 --resume <session-id>，不得使用 --continue 或推断最近 session。
  - 基础 argument contract 必须包含 -p、--verbose、--output-format stream-json、--json-schema <schema>、--mcp-config <config>、--strict-mcp-config、--permission-mode dontAsk、--tools <built-in-list> 与 --allowedTools <allowed-list>。
  - built-in tool list 只包含 Read、Edit、Write、Glob、Grep、Bash；allowed list 只包含这些 built-in tool 与 mcp__agent_room__room_ask_question。不得加入 Agent/Task、Web、browser、Git-specific wrapper 或其他 MCP tool。
  - 使用 Zod 4 从现有 codingResultSchema 生成的 raw JSON Schema；在 CLI serialization boundary 只递归删除实际已证明不兼容的根 $schema 与 minLength keyword，保留 properties、required、enum、array item 和 additionalProperties。
  - 不建立通用 JSON Schema compatibility registry、版本适配器或 retry fallback；CLI terminal object 仍由后续 interpreter 使用原始 codingResultSchema 严格验证。
  - stdout 必须按 UTF-8 JSONL line boundary 交给 callback，正确处理一个 chunk 含多行和一行跨多个 chunk；不得在本模块 JSON.parse 或识别 event subtype。
  - stderr 必须与 stdout 分离并原样交给 stderr callback；stderr 内容不得被本模块解释为 Run success/failure。
  - process 正常 close 时返回 exitCode 与 signal，使 exit 0、non-zero exit 与 signal exit 可区分；不得在本模块映射 ProtocolError code 或请求 Room transition。
  - spawn 无法启动时以最小 typed process-start failure 携带 command、args、cwd 与原始 cause 向上抛出；不得伪造 exit code 或返回成功 outcome。
  - 为 fake-process integration test 提供仅服务于 process boundary 的最小注入 seam；不得抽象为通用 command runner、process framework 或任意 Agent transport。
  - product module 不读取或写入 Claude transcript、Room database、Git、artifact directory 或其他 worktree。

non_goals:
  - JSON parse、init/MCP/session/result interpretation 或 CodingResult validation。
  - central Runner orchestration、RoomService/RoomRepository/state-machine 修改、Run persistence 或 terminal transition。
  - Git baseline、completion evidence、artifact persistence、progress Event 或 Question handling。
  - 真实 Room MCP server、MCP SDK、Status CLI、Codex MCP tool 或 Increment 4 wiring。
  - Claude model selection、fallback model、budget policy、retry/backoff、timeout scheduler、background agent 或 parallel Run。
  - 读取 Claude 私有 session transcript，使用 --continue，或创建 Room-wide session。
  - 修改 protocol/schema/error set、package metadata、lockfile、tsconfig、scope regression、共享文档或 Leaf B 文件。
  - commit、push、branch/worktree mutation、merge、rebase、cherry-pick、stage、reset、clean 或 checkout。

architecture_decisions:
  - Process Transport 只拥有 OS process fact；Stream Interpreter 拥有 Claude event meaning；Integration 拥有 protocol error mapping、Run persistence 与 terminal transition。
  - process-per-Run；new Implementation Task 不复用 session，Fix/decision resume 只使用明确 session ID。
  - prompt 通过 stdin 传入，避免 Windows command-line length 成为 Contract 长度边界。
  - non-interactive permission 使用 dontAsk 加显式 available/allowed tool list，避免 permission prompt 挂起；这不是对抗性 sandbox。
  - structured-output schema normalization 只处理本机真实 preflight 已否证的 $schema 与 minLength，Zod runtime schema 仍是最终 validation authority。
  - 本 leaf 不拥有 Room state，因此 hook error、stderr 或 non-zero exit只作为 process evidence返回，不自行判断 terminal Run outcome。

scope:
  - src/runner/claude-process.ts
  - tests/claude-process.test.ts
  - tests/runner-fixtures/ 下仅供本 Task fake process 使用的 fixture file

constraints:
  - 派发前必须完成、Review、接受并提交串行 Scope Scaffold，使 tests/scope.test.ts 允许本 leaf 的冻结文件且继续拒绝 central Runner/MCP/CLI 与 dependency drift。
  - 使用从同一 Accepted Contract documentation baseline 创建的独立 branch codex/inc3-claude-process 与独立 worktree；实际 baseline_head 在该文档提交完成后按 Git HEAD 记录，branch/worktree metadata 不写入 Room Task schema。
  - 只修改本 Contract scope；不得读取 Leaf B 未接受修改作为依赖，不得写入 main 或其他 worker worktree。
  - 不增加 dependency；Node.js 24 与现有 Zod 4 足够。若正确实现需要 package/lockfile/shared config 变化，返回 needs_decision。
  - 不修改 tests/scope.test.ts、src/protocol、src/room、src/git、PROJECT_RULES.md、ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md 或 DEVELOPMENT_LOG.md。
  - 关键 process ownership、stdin/line-boundary、schema normalization 与 spawn/close failure semantics 使用必要的简体中文注释；不得逐行复述代码。
  - 测试不得调用真实 Claude、产生模型费用、修改目标 Git repository 或依赖 operator 全局 Claude settings。

acceptance_criteria:
  - new-session invocation 使用 argument array、shell false、target cwd 和全部冻结基础 flags，且不包含 --resume/--continue。
  - resume invocation 只增加 --resume <exact-session-id>，其它 process contract 与 new session 相同。
  - stdin fixture 收到与 input 完全相同的完整 prompt，包含多行 Contract 时不截断、不摘要。
  - CLI schema serialization 删除根 $schema 与所有实际 minLength occurrence，同时保留 CodingResult object fields、required、enum、array item 与 additionalProperties false。
  - argument contract 包含 --verbose；测试不把仅 --output-format stream-json 视为有效组合。
  - stdout fixture 的 split-line、multi-line 与 final complete line 都按顺序各回调一次；stderr 保持独立且内容不丢失。
  - exit 0、non-zero exit、signal exit 与 spawn failure 有四个可区分 outcome；spawn failure 保留 command/args/cwd/cause。
  - transport 不 JSON.parse stdout，不检查 MCP/tool/session/result，不调用 RoomService/Git/artifact，不映射 protocol error。
  - product code 没有 shell command string、exec、Git mutation 或自动 commit path。
  - npm run typecheck、聚焦测试与 npm test 全部通过；既有 Protocol/Room/Git tests 无回归。

verification:
  - command: npm run typecheck
    detects: spawn/stdin/callback/outcome type、Node.js process API 或 JSON Schema input/output contract 的 TypeScript 偏移。
    decision_if_failed: 不得报告 completed；只修复本 Task 引入的类型错误。
  - command: node --test "tests/claude-process.test.ts"
    detects: arguments、schema normalization、stdin、stdout line framing、stderr separation、exit/signal 与 spawn failure boundary 错误。
    decision_if_failed: 不得报告 completed；定位对应 process public behavior 后在 task-owned scope 修复。
  - command: npm test
    detects: 新增 leaf 破坏既有 Protocol/Room/Git behavior，或 Scope Scaffold 的冻结 module/dependency boundary 发生漂移。
    decision_if_failed: 不得报告 completed；若失败要求修改共享 scope/config/protocol，返回 needs_decision，不得跨 worktree 修复。

documentation_updates: []

question_policy: >
  如果正确实现需要改变 interface、CLI flags、tool permission、schema normalization、dependency、
  shared scope、protocol、Room lifecycle、Git ownership 或其他 worker 文件，停止受影响工作并返回
  needs_decision。Bootstrap 阶段不得自行创建 branch、修改 Contract 或扩大 scope。

confirmed_by_user: true
created_by: codex
created_at: 2026-08-24T04:41:00Z
```

## 派发前置条件

1. 已满足：用户于 2026-08-24 明确批准本 Contract；状态为 `Accepted`，`confirmed_by_user=true`。
2. 已满足：串行 Scope Scaffold 已 Review、接受、提交并集成到 `main`；确认前 clean parent 为 `b35f7a2284c90285e897789aa2ac9e26e596c4ac`。
3. 已满足：本 Accepted Contract 及同步状态文档由本 documentation baseline commit 纳入 `main`；其实际 commit hash 是两个 leaf 的共同 `baseline_head`。
4. 待授权：创建 Leaf A branch/worktree，并记录共同 `baseline_head`、branch、worktree 与 task owner。
5. 待授权：通过已批准 bootstrap transport 向 Leaf A Claude Code 注入本文件全文；摘要不能替代 Contract。

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
