# Increment 9 Task Contract — Protocol v0.3 Participant / Role Foundation

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（仅在完整 Contract 获用户确认、状态改为 `Accepted` 且 dispatch gate满足后） |
| 创建日期 | 2026-08-29 |
| 用户确认日期 | 2026-08-29；用户明确确认完整Contract与三项设计 |
| Parent goal | Agent Room v0.3 Stage 1 — Protocol v0.3 |
| Planning main HEAD | `7b6d034bf2a9b44656d5ae7209b228071478b645` |
| Dispatch baseline | 待用户授权documentation/setup处理与v0.2 launcher worktree后，从目标main worktree live Git读取exact clean `HEAD` |
| 评审目标 | 在不实现multi-Run/DAG/UI/GitHub的前提下，将固定actor/session/route替换为Participant、Role、Assignment与generic binding，并完成v0.2只读保留到新v0.3 Room的可验证切换 |

## 1. Accepted 结论与授权边界

本Contract实现用户路线中的Stage 1。用户已明确确认以下两项最小收窄与detached launcher设计：

1. `Plan`和`Approval`当前没有domain entity或public consumer。Stage 1不创建空表/空API；Plan-scope assignment与Approval snapshot在Stage 3随TaskGraph/Git action lifecycle交付。
2. Stage 1继续在目标main worktree形成candidate，但`room:serve`/`room:run`从固定planning baseline的detached v0.2 launcher worktree加载，确保Fix/Decision Run不受candidate breaking代码影响；产品v0.2 database只在Stage 1被接受、提交后切换为只读保留。

```yaml
task_id: increment-009-protocol-v03-participant-role-foundation
room_id: room-4f175b12-3e18-417a-a0da-8fda8b002353
type: implementation
parent_task_id: null
based_on_review_id: null

background: >
  Current v0.2把Actor固定为user/codex/claude/runner/system，把MCP route固定为/mcp/codex与
  /mcp/claude，把Run session固定为claude_session_id；SQLite无protocol metadata，snapshot只返回
  latest current Task/Run/Review/Question。用户已要求六阶段v0.3路线，Stage 1先建立Participant、Role、
  Assignment、generic actor/session/route、新v0.3 Room与v0.2只读保留。Current开发协调Room自身仍是v0.2，
  因此breaking candidate必须与其launcher/worktree隔离。

goal: >
  交付Protocol v0.3的最小可用foundation：新v0.3 Room以ParticipantProfile和RoleAssignment解析
  planner/worker/reviewer/executor/git_controller/orchestrator，Event与lifecycle entity固化实际participant和role，
  Run使用opaque agent_session_ref，MCP与project binding切换为participant route；现有串行
  Implementation→Question/Retry→Review→Fix→Accepted工作流在默认Codex/Claude/local Runner profiles下
  行为等价，并且现有v0.2 database保持未改写、不可被v0.3 writable service打开。

requirements:
  - 将protocol version提升为`0.3-design`；v0.3 Room/database必须持久化并在writable open前校验exact protocol version。缺失metadata的v0.2 database只能被分类为archive，任何v0.3 service/schema write前以稳定`protocol_version_mismatch`拒绝。
  - 新增`ParticipantProfile`，字段冻结为`participant_id`、`display_name`、`kind=human|agent|service`、`provider`、`adapter_id`、`capabilities`、`config_ref`、`enabled`、`created_at`。`config_ref`是opaque local reference，不存secret或provider credential。
  - 新增`Role`枚举：`planner`、`worker`、`reviewer`、`executor`、`git_controller`、`orchestrator`。新增`RoleAssignment`，字段至少包含`assignment_id`、`room_id`、`scope_type=room|task|run|review`、nullable`scope_id`、`role`、`participant_id`、`created_at`。
  - assignment resolution按exact entity scope优先于Room default；同一scope/role只能有一个active assignment。participant必须存在、enabled且capability/adapter与role兼容，否则在entity/Run创建前拒绝且durable state不变。
  - 提供Room创建时的最小bootstrap profiles/assignments：operator human作为orchestrator；Codex App participant作为planner/reviewer；Claude Code CLI participant作为worker；local service participant作为executor。`git_controller`只可登记assignment，不在Stage 1执行Git write。
  - 提供Participant注册、enable/disable与RoleAssignment create/replace的RoomService/MCP command。只有尚未被Run/Review固化的未来assignment可变；disable或replace不得改写既有Run、Review或Event。
  - Task在提交时记录planner/orchestrator identity；Run在claim时固化worker与executor participant；Review在提交时固化reviewer participant。历史字段必须来自当时resolved assignment，不能在read时用current assignment回填。
  - `Event.actor`替换为required`actor_role`与`participant_id`；system-created Event使用local service participant及`orchestrator`或`executor`中与operation一致的role，不保留fixed actor enum作为v0.3 authority。
  - `Run.claude_session_id`替换为nullable opaque`agent_session_ref`，其value只由assigned WorkerAdapter写入和解释。Stage 1默认Claude Code adapter保持现有exact resume/replace语义，不新增其它provider adapter。
  - v0.3 MCP只暴露`/mcp/participants/{participant_id}`。route确定participant identity；每个tool映射到frozen required role并经RoleAssignment校验。v0.3不暴露`/mcp/codex`或`/mcp/claude`alias；v0.2 Current service仍可在Stage 1开发期间运行。
  - Runner生成Claude MCP config时使用resolved worker participant route；required Room tool仍是`mcp__agent_room__room_ask_question`，但tool调用的Event actor来自route participant与worker role。
  - v0.3 snapshot返回Room、ParticipantProfile、RoleAssignment以及该Room全部Task、Run、Review、Question与Event的稳定数组和cursor；保留current references作为derived convenience，但不得用数组顺序替代Event/assignment authority。
  - snapshot中的entity必须通过room membership过滤；不同Room participant assignment、entity与Event不得泄漏。disabled participant仍可在历史entity/Event中读取，但不能获得新command authority。
  - 新v0.3 runtime binding字段冻结为原五字段加`protocol_version`、`control_participant_id`、`archived_database_path`。`protocol_version`必须为`0.3-design`；`control_participant_id`指向project-scoped Codex/orchestrator participant；`archived_database_path`指向旧v0.2 database或null。
  - setup migration读取valid v0.2五字段binding后，保持旧database原路径与内容不变，创建新的`<project>/.agent-room/room-v0.3.sqlite`与新room_id/control participant，并保守更新project-scopedMCP URL到participant route。任何conflict在写入前拒绝；不删除、重命名或原地改写v0.2 database。
  - migration rerun必须复用同一v0.3 identity且不创建第二database/Room/profile/assignment。v0.2 archived path不能作为新service database_path。
  - 保留Current串行Room state和单activeRun行为；Stage 1不增加Execution Core、parallel claim、TaskGraph、Scheduler、worktree manager、Git write、Chat session、SSE、VS Code或GitHub capability。
  - 更新protocol/repository/service/snapshot/MCP/Runner/CLI/Plugin setup与直接tests，使默认profiles下完整acceptance/failure/fix lifecycle行为等价；删除只属于v0.3candidate的fixed actor/session/route assertions，不保留双协议runtime branch。
  - Claude只修改`documentation_updates`列出的candidate文档；Review、用户接受及versioned integration前不得把v0.3写成Current，也不得把ADR-0001/0002直接标记Superseded。

non_goals:
  - same-Room multi-Run、Executor scheduler、cancel/new attempt、automatic retry或parallel Worker。
  - TaskGraphDraft/Revision、Plan entity、Plan-scope assignment、Approval entity、acceptance policy、Integration Run或Git Controller write。
  - PlanningSession、ReviewSession、App Server stream/steer、自由Worker chat或自动Fix。
  - VS Code extension/Webview、SSE、ActionPreview、multi-root aggregator或machine-level Room Hub。
  - GitHub App、Issue/PR/Check、webhook或external identity sync。
  - v0.2 SQLite原地migration/backfill、历史Event actor rewrite、permanent legacy route alias或兼容wrapper。
  - 新provider adapter、automatic model routing、secret storage、remote worker、auth/multi-user。
  - 自动commit/push/merge/rebase/reset/clean/checkout、candidate worktree integration或旧database删除。

architecture_decisions:
  - Participant是identity，Role是authority，RoleAssignment是可变future routing；Run/Review/Event在创建时固化resolved identity，三者不可互相替代。
  - v0.3使用新database与新binding，不原地migration v0.2；v0.2历史只读保留。
  - dynamic participant route替代fixed actor route；tool自身冻结required role，route参数不能自行声明authority。
  - Stage 1保持serial lifecycle和现有Claude adapter，只建立Stage 2–6必须复用的generic boundary。
  - breaking self-hosted implementation由固定planning baseline的detached v0.2 launcher worktree驱动当前target main/Room，避免candidate破坏Fix/Review通道。

scope:
  - src/protocol/schema.ts与src/protocol/errors.ts的v0.3types/errors
  - src/room/repository.ts、room-service.ts、state-snapshot.ts与state-machine.ts的participant/assignment/version/identity wiring
  - src/mcp/tools.ts、http.ts、serve.ts的participant route与role authority
  - src/runner/claude-process.ts、claude-stream.ts、claude-runner.ts及src/cli/run.ts/status.ts的generic session/route/binding适配
  - plugins/agent-room/skills/agent-room/SKILL.md、project-setup reference与setup helper的v0.3 migration/binding
  - tests下对应protocol/repository/service/snapshot/MCP/Runner/CLI/setup/packaging/E2E/scope regression
  - docs/documents/ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、OPERATIONS.md、DEVELOPMENT_LOG.md、ADR/0003-participant-role-and-v03-evolution.md的candidate实现同步
  - 不修改AGENTS.md、CLAUDE.md、active host approval、global Codex config或其它项目

constraints:
  - Coding必须在当前target main worktree中从包含Accepted Contract和同步文档的clean exact baseline开始；`agent_room_root`临时指向用户授权创建的detached v0.2 launcher worktree，`project_path`仍指向target main。Claude不得修改launcher worktree。
  - Claude不得执行任何Git write、commit、push、merge、branch/worktree、reset、clean、checkout或旧database/binding切换。
  - v0.3 schema只面向new database；不得为self-hosting增加长期dual-read/dual-write、migration framework、feature flag或legacy alias。
  - 每个new command覆盖success、invalid、same-ID same-content retry、same-ID different-content、wrong room/membership、disabled participant与history frozen Oracle。
  - 代码与注释默认简体中文；code、identifier、command、field与technical term保持English。

acceptance_criteria:
  - fresh v0.3 database可创建Room、bootstrap profiles与Room-level assignments；profiles/assignments可读取，invalid或incompatible assignment在任何entity/Event写入前拒绝。
  - 修改future assignment只影响之后创建的Task/Run/Review；既有Run/Review/Event的participant/role逐字段不变，disabled participant历史仍可恢复。
  - 默认Codex/Claude/local Runner profiles经participant routes完成串行Implementation、Question/answer、failure retry、Review、Fix与acceptance；Run只暴露agent_session_ref且现有Claude exact resume语义不回归。
  - v0.3 route拒绝unknown/disabled/unassigned participant和role-incompatible tool，完整Room/entity/Event/cursor snapshot前后不变；fixedv0.2 routes在v0.3 app中返回not found。
  - snapshot按Room返回全部Task/Run/Review/Question、participants、assignments与Event，current references正确且跨Room隔离；不包含无consumer的Plan/Approval假数据。
  - valid v0.2 database与五字段binding被保留且byte content不变；migration创建独立v0.3database/binding/Room并可幂等rerun，v0.3 service拒绝对v0.2 database执行schema write。
  - Stage 1未新增parallel Run、DAG、Git write、Chat、SSE/UI或GitHub path；scope/dependency/package boundary与candidate文档状态一致。

verification:
  - command: npm run typecheck
    detects: v0.3schema、assignment resolver、route、snapshot、Runner与setup binding的TypeScript contract漂移。
    decision_if_failed: 修复task-owned类型；不得用any、ts-ignore、skipLibCheck或compatibility wrapper。
  - command: node --test "tests/protocol.test.ts" "tests/room-service.test.ts" "tests/room-state-snapshot.test.ts"
    detects: participant/role validation、assignment precedence、history freeze、Room membership、idempotency/rollback或multi-entity snapshot错误。
    decision_if_failed: 修复protocol/application/repository最窄boundary；不得增加active pointer或generic framework替代现有Event authority。
  - command: node --test "tests/room-mcp.test.ts" "tests/room-serve.test.ts" "tests/status-cli.test.ts"
    detects: participant route identity/role authority、unknown/disabled rejection、fixed route残留、startup version gate或read snapshot错误。
    decision_if_failed: 修复MCP/CLI wiring；不得恢复legacy alias或信任caller role字段。
  - command: node --test "tests/claude-process.test.ts" "tests/claude-stream.test.ts" "tests/claude-runner.test.ts" "tests/runner-cli.test.ts" "tests/e2e-workflow.test.ts"
    detects: agent_session_ref、worker route、exact resume、Question/failure/Review/Fix串行lifecycle或single terminal settlement回归。
    decision_if_failed: 修复现有Claude adapter/Runner wiring；不得引入Stage 2 Executor abstraction或第二provider。
  - command: node --test "tests/plugin-setup.test.ts" "tests/plugin-packaging.test.ts" "tests/multi-project-e2e.test.ts"
    detects: v0.2archive到v0.3binding切换、old database mutation、rerun identity漂移、participant URL/config mismatch或Plugin资源缺失。
    decision_if_failed: 修复Skill/helper/migration boundary；不得删除旧database、原地backfill或扫描其它project。
  - command: node --test "tests/scope.test.ts"
    detects: Stage 2–6代码、依赖、第二Skill、global config或未批准文件进入Stage 1 Diff。
    decision_if_failed: 删除越界实现；正确实现若必须扩大architecture boundary则返回needs_decision。
  - command: npm test
    detects: Current Increment 1–8受支持串行行为的非预期回归，以及focused suite未进入full regression。
    decision_if_failed: 只修复task-owned回归；不得放宽既有assertion或把v0.2 history rewrite成通过。

documentation_updates:
  - path: docs/documents/ARCHITECTURE.md
    expected_change: v0.3candidate组件、identity/role authority、new database/binding与default serial data flow。
  - path: docs/documents/ROOM_PROTOCOL.md
    expected_change: 0.3candidateParticipant/Assignment/Event/Run/snapshot/participant route exact contract与v0.2 archive语义。
  - path: docs/documents/MVP_PLAN.md
    expected_change: Stage 1 candidate实施状态、验收和Stage 2 entry gate。
  - path: docs/documents/OPERATIONS.md
    expected_change: candidate migration preview、old/new database、binding reload、成功信号与停止/恢复边界。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: dispatch baseline/worktree/Room、Coding Result、verification与candidate状态。
  - path: docs/documents/ADR/0003-participant-role-and-v03-evolution.md
    expected_change: 用户确认后Accepted；实现偏差、Review与最终cutover事实按阶段同步。

question_policy: >
  如果正确实现需要Stage 2 multi-Run/Executor、Stage 3 Plan/Approval/DAG/Git write、Stage 4 Chat、Stage 5 UI/SSE、
  Stage 6 GitHub、v0.2原地migration、permanent legacy route、new dependency/provider、global config、secret storage、
  自动Git操作或修改Current main协调Room，停止受影响工作并返回needs_decision。局部type/helper命名、test fixture组织、
  SQL index名称与文档段落位置由Claude按existing style作最小选择并在Coding Result记录。

confirmed_by_user: true
created_by: codex
created_at: 2026-08-29T00:00:00Z
```

## 2. 已授权的 dispatch prerequisites

1. 将本Contract与同步规划文档标记为Accepted并形成用户已授权的documentation baseline commit。
2. 对当前setup生成的`.gitignore`与`.codex/config.toml`作出独立Git处理决定；target main worktree未clean不得提交Implementation Task。
3. 用户独立授权从planning baseline创建detached v0.2 launcher worktree，并只更新Gitignored runtime binding的`agent_room_root`指向该worktree；`database_path`、`project_path`、`port`与`room_id`保持不变。
4. 通过当前Room提交完整Accepted Contract，保留首次`observed_baseline_head`，再由detached v0.2 launcher执行至多一次approved Run。
5. candidate通过Review和用户接受前，不切换当前project v0.2database/binding，不归档或删除任何database。
