# Increment 4 Task Contract — Room MCP 与 Status CLI

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（仅在用户确认并完成 dispatch gate 后） |
| 创建日期 | 2026-08-24 |
| 用户确认日期 | 2026-08-25 |
| Parent goal | Increment 4 — Room MCP 与 Status CLI |
| Planning main HEAD | `2c2b880905eb7b39a0a84814dd7d5c3b0165a763` |
| Dispatch baseline | 待 documentation baseline 形成后记录 |
| Bootstrap transport | 当前仍为 `claude -p`；Increment 4 Review、用户接受前不终止 |

## 1. Accepted 结论与授权边界

本 Accepted Contract 把已经接受的 loopback Streamable HTTP、六个 Room tool、actor boundary、event cursor 与 read-only Status CLI 具体化为一个最小 Implementation Task。用户已于 2026-08-25 确认完整 Contract；项目阶段进入 `PLAN_READY`，但尚未授权 documentation commit、branch/worktree、Claude Coding 派发、真实 Claude smoke、实现 commit、push 或清理。

本次规划核对了当前 `main` public API 与依赖事实：Room 已有 entity/state application API，但没有统一的 current-entity/waiting-actor read model；Git clean gate 已实现，但尚未连接首次 Implementation Task submission；仓库没有 `src/mcp`、`src/cli` 或 runtime service entry。依赖方案冻结为 `@modelcontextprotocol/sdk@1.30.0` 与 `@types/express@5.0.6`，继续复用现有 `zod@4.4.3`。本机 Claude Code `2.1.241` 已确认支持 HTTP MCP registration。

```yaml
task_id: increment-004-room-mcp-status-cli
room_id: bootstrap-codex-claudecode-room
type: implementation
parent_task_id: null
based_on_review_id: null

background: >
  Increment 1 已交付 Protocol/State Core，Increment 2 已交付只读 Git Observer，Increment 3 已交付
  central Claude Runner，并全部通过 Review、用户接受后进入 main。Architecture 与 ROOM_PROTOCOL 已批准
  loopback Streamable HTTP、六个 coordination tool、Codex explicit pull 与 read-only Status CLI，
  但当前仓库没有 MCP/CLI runtime entry。RoomService 只有按 ID 读取 entity 与 Event cursor 的 public API，
  尚无供 MCP/CLI 共享的 current entity、waiting actor 与 cursor snapshot；新 Implementation Task 的
  clean Git precondition 也尚未连接 room_submit_task public path。

goal: >
  交付一个仅监听 loopback 的 Room MCP service 与 read-only Status CLI，使 Codex 和 Claude 通过
  actor-scoped tool surface 使用同一 SQLite Room authority，并由共享 Room state snapshot 准确读取
  waiting actor、current entity 与 Event cursor，同时对首次 Implementation Task submission 执行既有
  clean Git gate。

requirements:
  - 增加 direct runtime dependency @modelcontextprotocol/sdk@1.30.0 与 direct dev dependency @types/express@5.0.6；保留现有 zod@4.4.3、Node/npm engine 与 TypeScript 配置，不增加其它 dependency。
  - 实现一个由 MCP room_get_state 与 Status CLI 共同调用的 Room state snapshot application boundary；不得让两个 adapter 分别推断 current entity、waiting actor 或 cursor。
  - snapshot 输入为 room_id 与 nullable after_sequence；after_sequence 必须是大于等于 0 的 integer，null 表示从首个 Event 开始。
  - snapshot 返回完整 Room、nullable current Task/Run/Review/open Question、waiting_actor、cursor 与 after_sequence 之后的 Event；entity 必须通过最新相关 Event reference 解析，不扫描 content 猜测 current identity。
  - current Task 使用最新 task_submitted Event；current Run 使用最新 run_started/run_resumed Event；current Review 使用最新 review_submitted Event；current Question 只在最新 question_asked 引用的 Question 仍为 open 时返回，否则为 null。
  - cursor 为 Room 当前最大 Event sequence；没有 Event 时为 0。events 只返回 sequence > after_sequence 的稳定升序结果；snapshot read 不写 SQLite、不改变 Room state。
  - waiting_actor 使用固定映射：DISCUSSION/ARCHITECTURE_REVIEW/RUN_FAILED/REVIEW_REQUIRED -> codex，WAITING_FOR_USER_CONFIRMATION/NEEDS_DECISION/REVIEW_DISCUSSION -> user，PLAN_READY/FIX_PLAN_READY -> runner，CODING -> claude，ACCEPTED -> null。
  - 实现单一 local process、单一 SQLite RoomService 与两个 stateless Streamable HTTP JSON-response routes：/mcp/codex 与 /mcp/claude；每个 request 创建独立 MCP server/transport，durable state 只属于 SQLite。
  - 每个 request 完成或 connection 关闭后必须关闭该 request-owned MCP server/transport；不得积累 session、listener 或 transport resource。
  - /mcp/codex 只能列出并调用 room_get_state、room_submit_task、room_submit_review、room_answer_question、room_accept_review；/mcp/claude 只能列出并调用 room_ask_question。
  - MCP 不注册 resources、prompts、file、Shell、Patch、通用 Git、Runner control 或任何额外 tool；actor authority 由 route 的 exact registration surface 决定，不信任 caller 提供的 actor string/header。
  - 六个 tool input 直接复用现有 Zod schema 或其最小 composition；不得复制 TaskContract、Review、Question 或 error schema。tool success 同时返回 JSON text content 与 schema-backed structuredContent。
  - ProtocolError 必须作为 tool error 返回稳定 code/message，且不得泄露 stack；非 ProtocolError 保持 SDK internal/tool error，不新增平行 Room protocol error code。
  - room_submit_task 必须在 existing Task lookup 之后处理 Git gate：已存在相同 ID 直接委托 RoomService 保留 same-content idempotent retry 与 different-content id_conflict；仅首次提交 type=implementation 时调用 establishCleanBaseline(project_path)；type=fix 不重新要求 clean baseline。
  - 首次 Implementation submission 的 tool result 必须返回 observed_baseline_head；TaskContract 当前没有 baseline_head field，不得为此修改 Task schema。Runner start 仍按既有 contract 独立重检 clean HEAD，并把 baseline_head 持久化到 Run；MCP observation 不替代 dispatch metadata 或 Runner gate。
  - Git gate failure 不得创建 Task/Event 或 state transition；MCP 不执行 stage、commit、checkout、reset、clean、merge、rebase、push 或其它 Git mutation。
  - 其余五个 write tool 只映射到既有 RoomService application operation，不直接访问 repository/SQLite，不复制 state transition 或 idempotency logic。
  - runtime command 必须显式接收 --db <path>、--project <path> 与 --port <1..65535>，host 固定为 127.0.0.1；不得提供 remote bind、OAuth、user account 或隐式 production database path。
  - runtime route 只接受 MCP POST；GET/DELETE 返回 405。MVP 不实现 SSE notification、session store、resumability token 或 background notification。
  - 增加 package script room:serve，调用 Node TypeScript entry 并允许 operator 透传上述显式参数；startup 配置错误或 bind/database failure 必须 stderr + non-zero exit，不伪装 service ready。
  - 实现 read-only Status CLI，显式接收 --db <path> 与 --room-id <id>，调用共享 snapshot boundary，把 deterministic pretty JSON 写到 stdout；成功 exit 0，invalid args/entity/protocol failure 写 stderr 并 non-zero exit。
  - Status CLI 必须在打开 SQLite 前确认 --db 指向已存在的文件；missing path 不得创建空 database/schema。对有效 database 只读 snapshot，不创建 Room/entity/Event 或执行 state transition。
  - Status CLI 输出至少包含 room_id/state、waiting_actor、current task/run/review/question identity、cursor、最近 Run status/failure 与 Git changed-file summary；缺失 current entity 使用 null，不创建第二条 transition path。
  - 增加 package script room:status；不得增加 interactive menu、watch mode、daemon manager、health database mutation 或自动恢复。
  - 更新 scope regression，只允许本 Contract 的 exact MCP/CLI/shared-read-model files 与批准 dependency；继续拒绝额外 top-level module、general-purpose tool 与 dependency drift。
  - 同步 Architecture、ROOM_PROTOCOL、MVP Plan、Operations 与 Development Log 的 candidate implementation fact；Review 与用户接受前不得把 MCP/CLI、runtime command 或 bootstrap replacement 写成 Current。

non_goals:
  - Increment 5 的完整 Question answer/resume orchestration、Fix lineage resume、automatic Runner wakeup、Task queue、scheduler 或 parallel Run。
  - MCP tool 启动/终止 Runner、自动领取 Task、background polling、Codex push notification 或 Claude process management。
  - remote access、OAuth、multi-user authorization、TLS、reverse proxy、browser UI、WebSocket、SSE notification 或 stateful MCP session recovery。
  - 新 Room state/transition/entity/table/field、SQLite migration、ORM、read-model cache、hash/checksum、mirror JSON 或第二份 event authority。
  - file、Shell、Patch、code search、general Git、commit、branch/worktree、push 或 repository cleanup tool。
  - Status CLI write command、interactive TUI、watch mode、service installer、production deployment、backup/restore 或 observability platform。
  - Codex App plugin/package distribution；属于后续 Increment 7。真实 Claude paid smoke 也不属于本 Task。

architecture_decisions:
  - 同一 process/SQLite authority 使用两个 route，而不是一个包含六个 tool 的 route；tool registration surface 本身证明 Codex/Claude actor boundary，并保持 Claude exact required tool name mcp__agent_room__room_ask_question。
  - 使用 stateless Streamable HTTP JSON response；Room coordination 是 request/response，SQLite/Event cursor 已拥有 durable state，MVP 不需要 MCP session state 或 server push。
  - MCP 与 CLI 共享 Room state snapshot application boundary；Event sequence/reference 是 current entity 和 cursor authority，adapter 不独立重建规则。
  - 新 Implementation Task 的 Git precondition 位于 MCP coordination boundary；existing-ID retry 先于 new-only Git gate，避免 dirty worktree 改写既有 idempotency/conflict 语义。
  - fixed loopback 与显式 db/project/port 参数符合单机协作边界；不引入身份系统或任意 bind 配置。
  - 两个 route 是已接受 loopback Room MCP 与 actor separation 的接口具体化，不改变单 Room、单 Runner、单 active Run 架构，因此本 Accepted Contract 不新增 ADR。

scope:
  - package.json 与 package-lock.json 的 exact SDK/type dependency、room:serve、room:status script
  - src/mcp/ 下的 actor-scoped tool registration、stateless Streamable HTTP adapter、ProtocolError mapping 与 runtime entry
  - src/cli/ 下的 read-only status entry/presentation
  - src/room/ 下供 MCP/CLI 共用的最小 Room state snapshot application boundary
  - tests/ 中 snapshot、MCP HTTP/tool surface、Git submission gate、Status CLI 与 scope regression
  - docs/documents/ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、OPERATIONS.md、DEVELOPMENT_LOG.md 的 candidate/current-state synchronization

constraints:
  - Coding 必须从用户授权后记录的 clean exact baseline_head 开始；Claude 不执行 Git write、commit、branch/worktree、push 或 cleanup。
  - 不修改现有 Room state transition pair、entity/schema/table、Runner process/stream/terminal ownership、Git Observer command set 或 Claude CLI flags。
  - snapshot 只能组合现有 repository/entity/Event fact；如果无法在不改 schema 的条件下表达 current entity 或 waiting actor，停止并返回 needs_decision。
  - runtime production CLI 必须显式 port；HTTP integration test 可由 test factory 使用 ephemeral loopback port 0，不能把测试便利变成隐式 production default。
  - service 必须通过 SDK 提供的 createMcpExpressApp 使用 localhost host validation；不得自行添加 generic auth wrapper 或直接信任 Host header。
  - MCP tool description、ownership、new-only Git gate/idempotency order、snapshot current-entity authority 与 CLI read-only boundary 必须有必要简体中文注释，不逐行复述代码。
  - 测试使用 temp SQLite/temp Git repository 与 in-process SDK client；不得依赖 operator 全局 Claude settings、真实网络、真实 paid Claude process 或长期后台 service。

acceptance_criteria:
  - /mcp/codex listTools 精确等于五个 Codex tool，/mcp/claude 精确等于 room_ask_question；Claude route 调用任一 Codex tool 与 Codex route 调用 question tool 均不可用。
  - 两个 route 均只监听 127.0.0.1，POST 可以完成 MCP initialization/tool call，GET/DELETE 为 405；server restart 后相同 SQLite Room state 可继续读取。
  - room_get_state 对 cursor 0/null 返回完整 ordered Event，并在后续 cursor poll 只返回新增 Event；cursor/current entity/open Question/waiting_actor 与全部 Room state 的固定映射有直接 regression。
  - Status CLI 与 room_get_state 对同一 database/room 输出相同 state、waiting_actor、current entity identity 与 cursor；CLI 不新增 Event、不修改 SQLite state。
  - 首次 Implementation Task 在 clean Git worktree 成功，tool result 的 observed_baseline_head 等于 actual HEAD；Task schema 不新增 baseline field。dirty/missing repository/missing HEAD 失败且 Task/Event/state 不变。
  - existing same-content Task retry 在随后 dirty 的 worktree 仍保持 idempotent success；existing different-content Task 仍返回 id_conflict；两者不得被 new-only Git gate 覆盖。Fix Task 不重复 clean gate。
  - submit review、answer question、accept review 与 ask question 经各自 route 调用时保留既有 RoomService state、current-entity guard、idempotency、rollback 与 ProtocolError 语义。
  - invalid schema、wrong entity/current state 与 unresolved blocking Review 返回 stable tool error；失败调用不留下 partial entity/Event/transition。
  - server invalid db/project/port 或 bind failure non-zero exit；Status CLI invalid args、missing Room 或 corrupt/unopenable database non-zero exit，不把 error 写成成功 JSON。
  - Status CLI 的 missing database regression 证明命令结束后该 path 仍不存在；existing database 调用前后 Room/entity/Event 内容与数量不变。
  - dependency baseline 精确增加 @modelcontextprotocol/sdk@1.30.0 与 @types/express@5.0.6；scope test 继续拒绝未批准 module/tool/dependency。
  - npm run typecheck 与 npm test 通过；candidate 文档与实际 command、route、schema、public API、未实现 Increment 5/7 boundary 一致。

verification:
  - command: node --test "tests/room-state-snapshot.test.ts" "tests/room-mcp.test.ts" "tests/status-cli.test.ts"
    detects: snapshot authority/cursor/waiting actor、actor-scoped tool surface、HTTP transport/error mapping、new-only Git gate/idempotency order 与 CLI read-only parity 失败。
    decision_if_failed: 不得报告 completed；只修复本 Contract boundary，若需要新 state/schema/session/auth/Runner orchestration 则返回 needs_decision。
  - command: node --test "tests/room-service.test.ts" "tests/git-observer.test.ts" "tests/scope.test.ts"
    detects: adapter 破坏既有 Room transaction/idempotency/current-entity 或 Git observation semantics，以及额外 module/tool/dependency drift。
    decision_if_failed: 不得放宽既有 regression；定位 task-owned integration 错误，超出 scope 则返回 needs_decision。
  - command: npm run typecheck
    detects: MCP SDK/Zod/Express types、snapshot union、tool result、CLI argument 与现有 application API 的 TypeScript 偏移。
    decision_if_failed: 不得绕过 strict 类型或增加 compatibility wrapper；修复本 Task 类型问题，否则返回 needs_decision。
  - command: npm test
    detects: Increment 4 破坏 Protocol/Room/Git/Runner/Scope 全量行为或文档承诺缺少 direct regression。
    decision_if_failed: 不得跨 scope 清理或修改 accepted Runner authority；仅修复 task-owned regression。

documentation_updates:
  - path: docs/documents/ARCHITECTURE.md
    expected_change: candidate dual-route actor boundary、stateless HTTP、shared snapshot 与 new-only Implementation Git gate；接受前不提升为 Current。
  - path: docs/documents/ROOM_PROTOCOL.md
    expected_change: candidate route/tool surface、room_get_state exact snapshot/cursor、waiting_actor mapping 与 submission gate order。
  - path: docs/documents/MVP_PLAN.md
    expected_change: Increment 4 candidate scope/verification status 与 Increment 5 boundary。
  - path: docs/documents/OPERATIONS.md
    expected_change: candidate room:serve/room:status exact parameters、route 与 failure boundary；Review 接受前继续标记 unavailable。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: actual files/dependency、test evidence、deviation、Review decision 与 documentation impact。

question_policy: >
  如果正确实现需要新增 Room state/transition/entity/schema/table/migration、改变 Runner/Claude lifecycle、
  使用 stateful MCP/SSE/remote auth、增加第三个 route 或额外 dependency、让 MCP 启动 Runner、改变
  Increment 5 Question/Fix semantics、执行真实 paid Claude smoke 或任何 Git 写操作，停止受影响工作并
  返回 needs_decision。不会改变 contract 的局部命名、SDK wiring 与 test fixture 选择由 Claude 判断并记录。

confirmed_by_user: true
created_by: codex
created_at: 2026-08-24T15:36:09Z
```

## 2. 已确认的设计点

用户确认了以下 Implementation boundary：

1. 使用 `/mcp/codex` 与 `/mcp/claude` 两个 stateless route，通过 exact tool registration enforce actor，而不是在单 route 信任 actor 参数。
2. 新增 MCP/CLI 共享的只读 Room state snapshot；current entity 以 Event reference 为权威，waiting actor 使用 Contract 中固定映射。
3. `room_submit_task` 只对首次 Implementation Task 执行 clean Git gate；existing-ID retry/conflict 先处理，Fix Task 沿用既有 baseline。
4. runtime 固定 `127.0.0.1`，显式要求 db/project/port；不增加 remote auth、SSE、stateful MCP session 或 daemon manager。
5. exact dependency 为 `@modelcontextprotocol/sdk@1.30.0` 与 `@types/express@5.0.6`；不新增其它 package。

本 Contract 已改为 `Accepted`、`confirmed_by_user=true`，项目阶段为 `PLAN_READY`。该确认不自动授权 documentation commit、branch/worktree、Claude Coding 派发、真实 Claude smoke、实现 commit、push 或清理。

## 3. Dispatch 前置条件

1. 已完成：用户于 2026-08-25 确认完整 Contract。
2. 待将 Accepted Contract 与同步 planning/state 文档形成经单独授权的 clean documentation baseline。
3. 待记录实际 dispatch branch/worktree、exact `baseline_head` 与 task owner。
4. 待用户单独授权 Claude Coding 派发；必须注入 Accepted Contract 全文，不得摘要。

## 4. 依赖与接口核对依据

- MCP TypeScript SDK `1.30.0`：Streamable HTTP、`McpServer.registerTool`、stateless transport 与 JSON response capability。
- SDK server guide：`createMcpExpressApp` 默认 loopback/localhost host validation；stateless server 对每个 request 创建 server/transport，GET/DELETE 可明确返回 405。
- Claude Code `2.1.241` 本机 CLI：`claude mcp add --transport http <name> <url>`；server name `agent_room` 保持 Runner 已冻结的 `mcp__agent_room__room_ask_question`。

参考：[MCP TypeScript SDK 1.30.0](https://github.com/modelcontextprotocol/typescript-sdk/tree/1.30.0)、[SDK server guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/1.30.0/docs/server.md)、[Room Protocol](./ROOM_PROTOCOL.md)、[Architecture](./ARCHITECTURE.md)、[MVP Plan](./MVP_PLAN.md)。
