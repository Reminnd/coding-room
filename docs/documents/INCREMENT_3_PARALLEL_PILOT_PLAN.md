# Increment 3 并行 Leaf Module 试点计划

> 状态：Current / Confirmed Plan
> 日期：2026-08-24
> 用户确认日期：2026-08-24
> Parent goal：Increment 3 — Claude Runner
> Planning baseline：`7345950fac08343cf3eb18cce2ac06c909ca4293`
> Leaf Contract 状态：Increment 3A/3B Accepted / 2026-08-24
> Dispatch baseline：本 Accepted Contract documentation baseline commit 的实际 `main` HEAD；派发前记录该 hash

## 1. 结论

Increment 3 可以拆出两个写入不交叉、无需互相等待、可独立验证的 leaf module：

1. `Claude Process Transport`：拥有 Claude CLI argument-array process boundary 与原始 process evidence。
2. `Claude Stream Interpreter`：拥有 `stream-json` initialization、session 与 terminal structured result 的解释和验证。

两者只依赖 Node.js、现有 `src/protocol` 和本轮冻结的 interface，不互相 import。它们不能分别宣称 Increment 3 完成；后续独立 `Integration Task` 才能连接 `RoomService`、Git Observer、artifact、Run terminal transition 与 documentation。

该拆分适合作为 branch/worktree 协作流程试点，但不会缩短这个小型 Increment 的总交付时间。额外成本来自两次独立 Review、两次接受与提交授权，以及一次 Integration Task；不得为扩大并行工作量而增加 abstraction。

## 2. 派发前阻塞决定

### 2.1 `CODING` 是否包含 startup 与 MCP initialization

当前协议存在不可同时满足的 lifecycle 约束：

- `PLAN_READY → CODING` 的前置条件包含“Claude MCP 已初始化”。
- `CODING → RUN_FAILED` 又负责 process startup 与 initialization failure。
- 当前 `RoomService.startRun()` 创建 Run 后立即进入 `CODING`。

如果 MCP 必须在进入 `CODING` 前初始化，CLI 无法启动或 MCP 初始化失败时就没有合法路径进入 `RUN_FAILED`。

推荐的最小修正：

- `CODING` 表示 Runner 已 claim 本次 Run，覆盖 process startup、MCP initialization、Coding 和 result collection。
- `startRun` / `resumeRun` atomic 创建 `running` Run 并进入 `CODING`，之后才启动 Claude process。
- startup、MCP initialization、non-zero exit 与 invalid result 分别映射既有 `claude_start_failed`、`room_mcp_unavailable`、`claude_exit_failed`、`coding_result_invalid`，并通过既有 `CODING → RUN_FAILED` 结束。
- 不增加 `STARTING` Room state、`PLAN_READY → RUN_FAILED` transition、schema pointer 或 migration。

用户已确认该最小修正。应在串行 Integration Task 中同步 `docs/documents/ROOM_PROTOCOL.md`、`docs/documents/ARCHITECTURE.md`、相关测试与 protocol version；两个 leaf module 不修改这些共享文件。

### 2.2 本机真实 CLI fixture

本机 Claude Code `2.1.241` 已确认支持：

- `-p` / `--print`
- `--output-format stream-json`
- `--json-schema`
- `--mcp-config` / `--strict-mcp-config`
- `--resume` / `--session-id`
- `--permission-mode` / `--allowedTools`

用户已授权并完成一次受限真实 smoke：禁用全部普通 tools、`--permission-mode dontAsk`、预算上限 `$0.25`，实际费用 `$0.06222`，exit code `0`，未修改项目文件。实证结果：

- `--print --output-format stream-json` 在本机版本必须同时使用 `--verbose`。
- Zod 4 `toJSONSchema` 的根 `$schema` 与 `minLength` 不被当前 Claude CLI structured-output schema 接受；CLI schema 只删除这两个实际出现且不兼容的 keyword，terminal object 仍用原始 `codingResultSchema` 严格验证。
- hook event 可以先于 init；单个 hook failure 不等于 process/Run failure，本次 hook failure 后仍得到成功 terminal result。
- initialization event 为 `type=system, subtype=init`，包含 `session_id`、`tools`、`mcp_servers`、`permissionMode` 与 CLI version。
- terminal event 为 `type=result, subtype=success, is_error=false`，包含 `session_id`、JSON string `result` 与 object `structured_output`；Structured Output 成功时 `stop_reason` 可以是 `tool_use`。
- terminal `structured_output` 通过现有 `codingResultSchema`，且 `task_id` 与 smoke Task 相同。

MCP initialization evidence 采用 init `tools` 中存在预期 `room_ask_question` tool，不依赖未公开的内部 connection status field。

Increment 4 之前真实 Room MCP server 尚不存在，因此本轮用 fake-process fixture 验证 required tool 存在/缺失分支；真实 Room MCP end-to-end connection 留给 Increment 4。

## 3. Dependency DAG

```text
用户已确认本计划与 lifecycle 修正
        │
        ├── 已完成受限真实 Claude CLI smoke
        │      └── 冻结 sanitized init/result shape 与 CLI argument contract
        │
        └── 串行 Scaffold Task：更新共享 Scope regression
               │
            接受并提交 Scaffold
               │
          确认两个完整 Leaf Task Contract
               │
               ├── Leaf A: Claude Process Transport
               │
               └── Leaf B: Claude Stream Interpreter
                       （并行、无相互依赖）
                               │
                 各自 Review → 用户接受 → 各自提交
                               │
                     串行 Integration Task
                               │
             module commits 组合 + Runner orchestration
                               │
             Increment 3 Review → 用户接受 → integration commit
```

现有 `tests/scope.test.ts` 明确拒绝 `src/runner` 存在，因此两个 leaf module 派发前必须由串行 Scaffold Task 更新该共享 regression：只允许两个已冻结 leaf 文件，继续拒绝 central Runner、MCP、CLI 与 dependency drift。公共 protocol、Room lifecycle、package metadata、lockfile、central Runner、Git wiring 与 development documentation 不属于任一 leaf Task。

串行前置 Contract：[Increment 3 Scope Scaffold Task Contract](./INCREMENT_3_SCOPE_SCAFFOLD_TASK_CONTRACT.md)。

## 4. Leaf A — Claude Process Transport

### 4.1 单一目标

以 Node.js process API 启动一个非交互 Claude Code process，使用 argument array 和 stdin 传入完整 Task prompt，并向调用方报告原始 stdout line、stderr chunk、exit code、signal 与 spawn failure。

### 4.2 逻辑 scope

- `src/runner/claude-process.ts`
- `tests/claude-process.test.ts`
- 必要的 process fixture，限定在 `tests/runner-fixtures/claude-process-*`

### 4.3 冻结接口边界

Integration consumer 提供：

- target `cwd`
- 完整 prompt string
- Zod 4 从现有 `codingResultSchema` 生成的 raw JSON Schema
- serialized Room MCP config
- new session 或 `resumeSessionId`
- stdout-line / stderr-chunk callback

该模块返回：

- process 是否成功 spawn
- `exitCode`
- `signal`

该模块不解析 JSON、不判断 MCP 是否 ready、不验证 Coding Result、不调用 `RoomService`、Git 或 artifact store，也不把 process fact 映射为 protocol error。

### 4.4 CLI argument contract

基础参数使用本机已确认 capability：

```text
claude
-p
--output-format stream-json
--verbose
--json-schema <serialized-schema>
--mcp-config <serialized-config>
--strict-mcp-config
--permission-mode dontAsk
--tools <approved-built-in-tool-list>
--allowedTools <approved-tool-list>
[--resume <session-id>]
```

完整 prompt 通过 stdin 传入，避免 Windows command-line length 成为 Task Contract 长度边界。process 使用 `shell: false`；不得调用 Git mutation、Room state 或 Claude 内部 transcript。

`approved-built-in-tool-list` 限定为实现 Contract 所需的 `Read`、`Edit`、`Write`、`Glob`、`Grep` 与 `Bash`；`approved-tool-list` 对这些 built-in tool 与 `mcp__agent_room__room_ask_question` 免除交互式 prompt。其它 tool 在 non-interactive `dontAsk` 模式下不可用。该边界服务于可重复执行和“不因 permission prompt 挂起”，不是对抗性 sandbox。

CLI schema normalization 只递归删除当前 raw schema 实际包含、且本机预检明确拒绝的根 `$schema` 与 `minLength`；不得建立通用 JSON Schema compatibility framework。CLI terminal result仍必须由原始 `codingResultSchema` 复验。

### 4.5 独立验收

- argument order 和 new/resume session 分支准确；new Task 不带 `--resume`。
- argument 包含 `--verbose`；缺少它的组合由测试证明会违反已冻结 CLI contract。
- schema normalization 精确删除 `$schema` 与 `minLength`，保留 object property、required、enum 和 `additionalProperties`。
- stdin 收到完整、未摘要的 prompt。
- stdout 按完整 JSONL line 交给 callback；stderr 原样交给 callback。
- exit 0、non-zero exit、signal exit 与 spawn failure 保持可区分。
- fake process 测试不调用真实 Claude，不修改 Git worktree。

## 5. Leaf B — Claude Stream Interpreter

### 5.1 单一目标

逐行解释 Claude `stream-json`，从 initialization 与 terminal result 建立可验证 outcome，并使用现有 `codingResultSchema` 验证最终 Coding Result。

### 5.2 逻辑 scope

- `src/runner/claude-stream.ts`
- `tests/claude-stream.test.ts`
- 只读使用派发前冻结的 sanitized JSONL fixtures

### 5.3 冻结接口边界

Process/Integration consumer 逐行提供 stdout。Interpreter 对外报告：

- initialization 是否出现且只出现一次；允许 hook event 在 init 前出现
- `sessionId`
- init `tools` 是否包含 required `room_ask_question` tool
- progress message 的最小 metadata，供 Integration 追加 Event/artifact
- `type=result` terminal 是否出现且只出现一次
- 通过现有 schema 验证的 `CodingResult`
- 可区分的 parse/init/MCP/terminal/result failure reason

该模块不启动 process、不保存 artifact、不修改 Run、不调用 Git，也不执行 Room transition。Protocol error mapping 由 Integration 拥有。

### 5.4 独立验收

- 有效 new-session stream 返回 session ID、MCP-ready evidence 和 Coding Result。
- 有效 resumed-session stream 保留 CLI 报告的同一 session ID。
- init 前 hook failure 被保留为 progress evidence，但在成功 terminal 存在时不被误判为 Run failure。
- malformed JSON line、missing/duplicate init、missing required MCP、missing/duplicate terminal 与 invalid Coding Result 分别失败。
- terminal 必须同时满足 `subtype=success`、`is_error=false`、session 与 init 一致，并优先验证 object `structured_output`；不能以 assistant text 或 progress event 代替。
- `CodingResult.task_id` 与 expected Task 不同被判为 invalid result。
- progress message 不能被当作 terminal authority。
- Oracle 使用冻结 fixture 与 literal expectation，不从 interpreter implementation 反向生成。

## 6. 写入所有权

| 路径 | Leaf A | Leaf B | Integration |
|---|---:|---:|---:|
| `src/runner/claude-process.ts` | 写 | 禁止 | 只连接 |
| `tests/claude-process.test.ts` | 写 | 禁止 | 不改，除非 confirmed integration finding |
| `tests/runner-fixtures/claude-process-*` | 写 | 禁止 | 只读 |
| `src/runner/claude-stream.ts` | 禁止 | 写 | 只连接 |
| `tests/claude-stream.test.ts` | 禁止 | 写 | 不改，除非 confirmed integration finding |
| Frozen sanitized JSONL fixture | 只读 | 只读 | 只读 |
| `src/protocol/**` | 禁止 | 只读 | 必要时按已确认协议修正修改 |
| `src/room/**` | 禁止 | 禁止 | 写 |
| `src/git/**` | 禁止 | 禁止 | 只读连接 |
| `package.json` / lockfile / `tsconfig.json` | 禁止 | 禁止 | 默认禁止；真实依赖需要另行确认 |
| `PROJECT_RULES.md` / architecture / protocol / log | 禁止 | 禁止 | 写 |

两个 leaf Task 都不得修改对方文件、共享配置、central wiring、Scope test 或开发状态文档。必要变更返回 `needs_decision`。

## 7. Integration Task 边界

Integration Task 在两个 module commit 分别 Review、接受和提交后创建。它负责：

- 从同一 planning baseline 组合两个 accepted module commit。
- 实现 central Runner orchestration。
- 在 process 启动前使用 Git Observer 确立 clean baseline。
- atomic 创建 Run 并进入包含 startup/init 的 `CODING`。
- 连接 process line callback 与 stream interpreter。
- 持久化 session ID、exit code、Git evidence 与 artifact reference。
- 将 startup、MCP、exit 和 result failure 映射为既有 protocol error code，并且只请求一个 terminal transition。
- success 只在 exit 0、required MCP ready、唯一有效 completed Coding Result 与 completion Git evidence 都成立时进入 `REVIEW_REQUIRED`。
- failure 保留 worktree；不得 stage、commit、reset、checkout、clean 或保存权威 patch。
- 同步 protocol、architecture、plan、development state 与 tests。

Integration 是 Increment 3 的唯一 end-to-end owner。两个 leaf module 通过不等于 Increment 3 通过。

## 8. Git dispatch 方案

计划中的 branch/worktree 尚未创建。用户已确认两份 Leaf Contract 并授权本 documentation baseline commit；用户另行授权后，两个 leaf 使用本 commit 形成的同一实际 `main` HEAD：

| Task | Branch | Proposed worktree |
|---|---|---|
| Leaf A | `codex/inc3-claude-process` | `D:\agent\case\codex-claudecode-room-worktrees\inc3-claude-process` |
| Leaf B | `codex/inc3-claude-stream` | `D:\agent\case\codex-claudecode-room-worktrees\inc3-claude-stream` |
| Integration | `codex/inc3-integration` | `D:\agent\case\codex-claudecode-room-worktrees\inc3-integration` |

派发前要求：

- main worktree clean；
- 含 Accepted Task Contract 的 planning baseline 已提交；
- 三个 branch 都不是 detached HEAD；
- dispatch metadata 记录 baseline、branch、worktree 与 task owner；
- branch/worktree 创建、module commit、组合 module commits、integration commit 与清理分别获取用户权限。

## 9. Verification 与决策

每个 leaf module 独立执行：

```text
npm run typecheck
node --test <owned-test-file>
npm test
```

- 聚焦测试失败：module 不可交付，修复限定在该 module Contract。
- 全量测试失败且属于共享 boundary：停止 module 工作，返回 `needs_decision`，不跨 scope 修复。
- 两个 module 都接受后，Integration 重新运行全量测试和 fake-process lifecycle tests。
- 经单独授权的真实 Claude smoke 只证明本机 CLI flags、terminal event shape、session 与 permission behavior；不替代 fake-process MCP/failure matrix、Git evidence 或 Room lifecycle tests，也不宣称 Increment 4 的真实 Room MCP connection 已验证。

## 10. 用户确认与授权边界

用户于 2026-08-24 进一步确认 Increment 3A/3B 两份完整 Task Contract，该确认只把它们从 Draft 提升为 Accepted，不自动授权以下动作：

1. 发起额外有费用的真实 Claude CLI smoke。
2. 创建 branch/worktree。
3. 派发两个 Claude Coding Task。
4. 实现 commit、组合 module commits、Integration dispatch、push 或清理 worktree。

后续仍需用户分别确认：

- branch/worktree 创建与并行派发权限；
- 各 leaf Review 后的 module commit、后续 integration 组合与清理。
