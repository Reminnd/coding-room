# Increment 6 Task Contract — End-to-End MVP Runtime

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（仅在 documentation baseline 与 dispatch gate 满足后由用户人工派发） |
| 创建日期 | 2026-08-26 |
| 用户确认日期 | 2026-08-26 |
| Parent goal | Increment 6 — End-to-End MVP |
| Planning main HEAD | `9ccf820cab268123f294075c6362a649d0f8540c` |
| Dispatch baseline | 包含本 Accepted Contract 与同步权威文档的 clean `main` HEAD；实际派发前由 live Git 读取 exact object ID |
| 评审目标 | 规划入口、one-shot Runner launcher、failure retry lineage 与真实 MCP/SQLite/Git 边界的完整 MVP workflow |

## 1. Accepted 结论与授权边界

用户已于 2026-08-26 确认本完整 Contract，文档状态为 `Accepted`，项目阶段进入 `PLAN_READY`。用户要求以上已确认内容全部纳入同一个 Implementation Task，并选择暂时自行人工派发；Codex 只编写 Contract、同步权威文档并提供可复制指令，不启动 Claude、不创建 runtime database、不执行 Coding，也不执行 stage、commit、push、branch/worktree、reset、clean 或清理。

Increment 1–5 已交付 Room domain、Git Observer、central Runner、actor-scoped MCP、Status CLI 与 Decision/Fix continuation，但 operator 尚不能通过 product command 创建 Room、推进最初 planning state或执行一个 Run；`RUN_FAILED → PLAN_READY` 后 central Runner 又会误走新 Implementation clean gate，无法保留失败 Run 已产生的 worktree。Increment 6 只闭合这些 runtime wiring，并用 file-backed SQLite、representative Git repository、真实 loopback MCP 与 fake Claude process 证明完整生命周期。

```yaml
task_id: increment-006-end-to-end-mvp-runtime
room_id: agent-room-main
type: implementation
parent_task_id: null
based_on_review_id: null

background: >
  Increment 1–5 已把 Protocol/State Core、Git Observer、central Claude Runner、actor-scoped
  Room MCP、shared snapshot、Status CLI、Question pause 与 Decision/Fix continuation 纳入 main。
  RoomService 已有 createRoom、transitionToArchitectureReview、
  transitionToWaitingForUserConfirmation、retryAfterFailure、startRun 与 resumeRun；当前
  /mcp/codex 只公开五个 submit/read/answer/accept tools，package scripts只有 room:serve 与
  room:status，runClaude仍只能由 TypeScript caller调用。RUN_FAILED经 retryAfterFailure回到
  PLAN_READY后，Runner无法区分首次Implementation与failure retry，因而会重新要求clean
  worktree并信任dispatch baseline，不能保留失败过程产生的changes。当前也只有直接
  RoomService lifecycle tests，没有穿过真实MCP、file-backed SQLite、Git与Runner application
  boundary的完整Implementation -> Review -> Fix -> Review -> ACCEPTED证据。

goal: >
  交付最小可操作的端到端MVP runtime：Codex可通过actor-scoped MCP创建Room并推进planning
  与failure retry，operator可用显式one-shot room:run命令执行恰好一个当前Task/continuation，
  failed Run可在保留worktree与exact baseline的条件下按可靠session evidence选择resume或
  new session，并以真实loopback MCP、file-backed SQLite、representative Git repository和
  fake Claude process证明完整Implementation/Fix接受流程及failure recovery。

requirements:
  - 复用现有 RoomState、TaskContract、Run、Review、Question、Event、SQLite tables、RoomService transition 与 protocol error；不得新增 state、transition pair、entity、schema field、table、migration、Event type、error code、dependency、pointer、cache或第二套状态权威。
  - /mcp/codex 在既有五个 tools 基础上增加且只增加 room_create、room_begin_architecture_review、room_request_user_confirmation、room_retry_run；/mcp/claude 继续只注册 room_ask_question。
  - room_create input固定为 {room_id}，直接调用 createRoom，返回schema-backed {room, created}；相同room_id重试返回created=false且不重复Event，conflict/error沿用既有RoomService语义。
  - room_begin_architecture_review、room_request_user_confirmation与room_retry_run input均固定为 {room_id}，分别直接调用 transitionToArchitectureReview、transitionToWaitingForUserConfirmation与retryAfterFailure，并返回schema-backed {room}；重复或wrong-state调用沿用invalid_transition，Room/entity/Event/cursor全部不变。
  - 四个新增tool使用与既有/codex tools相同的actor isolation、stateless HTTP request lifecycle、ProtocolError mapping、invalid-input mapping、unexpected internal error mapping与request cleanup；不得把Claude或Runner control能力暴露到/codex或/claude错误route。
  - 新增显式package script room:run及最小one-shot CLI application entry。参数固定为 --db <path> --project <path> --task-id <id> --run-id <id> --mcp-url <loopback /mcp/claude URL>，并仅在首次new Implementation context要求 --baseline-head <full HEAD>；continuation/retry必须从persisted lineage推导baseline且caller不能覆盖。
  - room:run只打开已存在的file-backed SQLite database，拒绝missing database、invalid/non-repository project、invalid/non-loopback MCP URL与不完整参数；不得隐式创建Room、推进planning state、启动Room server、daemon、scheduler、background worker或第二次Run。
  - room:run必须构造并交给runClaude的exact serialized MCP config：server name为agent_room，transport type为http，url为显式--mcp-url，alwaysLoad=true；Claude required tool继续为mcp__agent_room__room_ask_question，不依赖operator全局Claude settings。
  - room:run每次调用执行恰好一个current Task/continuation并输出deterministic JSON {room, run}。Run最终为succeeded或needs_decision时exit 0；Run最终为failed时仍输出durable result但exit 1；argument/preflight/ProtocolError或未settle异常写stderr并non-zero exit。
  - 首次new Implementation必须继续使用establishCleanBaseline，并要求--baseline-head等于Room submit时observed baseline与live actual HEAD；错误必须发生在spawn、新Run、artifact与Event之前。
  - RoomService continuation context增加最小retry kind。Room=PLAN_READY且current Task已有由latest run_failed Event确定的current failed source Run时判定为failure retry；无该source Run时保持首次new Implementation语义。
  - failure retry source必须属于current Room/current Task、status=failed且completed_at非空；继承source Run.baseline_head并使用observeContinuation允许staged/unstaged/untracked changes，但owning repository actual HEAD必须exact匹配inherited baseline。
  - source Run有可靠non-empty claude_session_id时，retry必须经resumeRun创建新running Run、追加既有run_resumed Event并向Claude process传递exact --resume session；不得使用--continue、最近session或Room-wide session。
  - source Run没有可靠session时，retry仍经resumeRun保持同一Task lineage、继承exact baseline并省略--resume，使Claude创建replacement session；新session由现有stream evidence持久化到新Run，不建立新的Implementation Task或lineage。
  - retry prompt必须包含完整persisted current TaskContract并明确continuation_kind=retry；failure/source Run事实以SQLite为authority，不复制transcript、不从artifact或session history猜测Task scope。
  - caller指定wrong/stale current Task，或latest run_failed Event引用missing Run、current Task的non-failed Run、current Task的未terminal Run，以及changed HEAD、baseline mismatch或invalid state时，必须在spawn、新Run、artifact与Event前以现有ProtocolError拒绝；Room、Task、Run、Review、Question、Event list/cursor与worktree authority保持不变。
  - latest run_failed Event若引用旧Task的Run，该Event不属于新current Task的retry source；新current Task按无source的new Implementation处理，继续执行既有clean exact baseline gate，不继承旧Task session/baseline，也不向历史Event回扫其它source。
  - retry创建新Run后复用现有process/stream/progress/artifact/Git evidence/terminal settlement pipeline；成功进入REVIEW_REQUIRED，失败重新进入RUN_FAILED，Question按Increment 5语义进入NEEDS_DECISION；不得增加retry counter、queue、backoff、timeout、kill或automatic loop。
  - 增加一个end-to-end integration scenario：在representative temporary Git repository和file-backed SQLite上启动真实loopback Room MCP，通过实际/mcp/codex依次创建Room、进入ARCHITECTURE_REVIEW、进入WAITING_FOR_USER_CONFIRMATION并提交Implementation Task；用Runner application boundary与fake Claude process产生成功Implementation；经MCP提交有finding的Review、提交用户确认solution的Fix Task、执行exact-session/exact-baseline Fix resume、提交approved Review并accept，最终到达ACCEPTED。
  - 完整workflow scenario必须断言current Task/Run/Review、waiting_actor、Event sequence/cursor、Task/Review/Run structured references、baseline/session continuity、Git evidence与repository-root-relative artifact_refs；SQLite必须是唯一durable Room authority，不得用test-only parallel state推进生命周期。
  - 增加独立failure recovery scenario：首次fake Run在representative worktree产生可观察change后失败，MCP room_retry_run执行RUN_FAILED -> PLAN_READY，第二次one-shot Runner invocation保留dirty worktree和unchanged HEAD，并按source session evidence精确resume后成功。另以direct regression覆盖source session为空时retry省略--resume并在同一Task lineage成功。
  - E2E与CLI测试默认不得启动、付费或依赖真实Claude process；通过现有spawnProcess seam或最小application-boundary injection使用deterministic fake process。不得让production CLI暴露test-only flag。
  - 更新scope regression的Increment标识、exact source/test/document boundary与MCP exact tool list；不得放宽为任意source file、tool或package script。
  - 同步Architecture、ROOM_PROTOCOL、MVP Plan、Operations、Development Log、ADR-0002、PROJECT_RULES与文档中心的Accepted candidate事实；Review、用户接受并版本化提交前不得把Increment 6能力写成Current implementation。

non_goals:
  - daemon、scheduler、queue、background polling、automatic wakeup、automatic retry、service manager或persistent Claude process。
  - 真实/paid Claude smoke、operator全局Claude config修改、remote MCP、authentication、TLS、health check、backup或deployment packaging。
  - Increment 7 Codex packaging、plugin、skill、marketplace、custom App Server client或Web UI。
  - 新Room state/transition/status/entity/schema/table/migration/Event/error/dependency、protocol version升级或generic workflow/CLI framework。
  - retry counter、backoff、timeout、kill、parallel Run、multi-user、worktree manager、artifact transcript mirror、hash或checksum。
  - 自动stage、commit、push、merge、rebase、reset、clean、branch/worktree创建/切换或partial worktree清理。
  - 修改CodingResult schema、Claude Stream required-tool authority、existing failure precedence或Increment 5 Question/Decision/Fix语义。

architecture_decisions:
  - SQLite Room state和Event/reference继续是唯一lifecycle authority；四个MCP tools只是现有RoomService command adapter，不复制transition logic。
  - room:run是显式one-shot operator boundary，不是长期Runner runtime。Room server由operator单独启动，planning/Review仍经MCP，Run完成后由Codex explicit pull发现状态。
  - new Implementation dispatch baseline来自confirmed Task submission与live clean Git；Decision、Fix和failure retry baseline都来自persisted source Run，caller只选择显式database/project/task/run/MCP endpoint。
  - RUN_FAILED retry仍属于同一Task lineage并使用既有resumeRun/run_resumed。可靠session存在时resume；不存在时new session只是process recovery，不创建新Task、new lineage或new protocol state。
  - retry source authority限定在current Task：可识别的旧Task failed Run等价于current Task无source；missing Event target或current Task source的status/completed_at损坏则拒绝。stale caller taskId仍由current-entity guard独立拒绝。
  - 端到端验收使用真实product transport/storage/Git boundaries与fake external process boundary；这验证应用wiring且避免把paid Claude可用性误当成产品determinism。

scope:
  - src/mcp/tools.ts 中四个Codex coordination tool的strict input/output schema与现有RoomService adapter
  - src/room/room-service.ts中failure retry continuation context与既有transition/reference guard；仅在直接需要时最小调整repository query
  - src/runner/claude-runner.ts中retry lineage、conditional exact --resume、inherited baseline与完整Task prompt
  - src/cli/run.ts新增one-shot Runner CLI application entry，package.json新增且只新增room:run script；不得增加dependency
  - tests/room-mcp.test.ts、tests/room-service.test.ts、tests/claude-runner.test.ts与tests/scope.test.ts的direct regression
  - tests/runner-cli.test.ts与tests/e2e-workflow.test.ts的CLI及完整workflow/failure recovery evidence
  - docs/documents/ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、OPERATIONS.md、DEVELOPMENT_LOG.md、ADR/0002-agent-integration-lifecycle.md的candidate/current-state synchronization

constraints:
  - Coding必须从包含本Accepted Contract与同步文档的clean exact main baseline开始；Claude不得执行任何Git write、commit、push、branch/worktree、reset、clean或cleanup。
  - 保持single local Room、single active Run、process-per-Run、task-lineage session、explicit Codex pull与Runner-owned terminal settlement边界。
  - 新增MCP tool必须直接调用public RoomService method，并以actual HTTP route验证success、invalid input、ProtocolError、internal error与durable rollback；不能只测handler helper。
  - CLI parsing、database/project/MCP validation必须在spawn前完成；首次Implementation baseline failure与retry baseline failure都必须证明零spawn、零new Run、零artifact、零Event。
  - failure retry current source identity必须由现有Event/reference决定，不按updated_at、ID排序、artifact内容或JSON prose猜测。
  - fake-process E2E必须使用temporary owner directory并在finally释放server/database/process handles和临时目录；不得依赖固定port、network外连或operator全局settings。
  - 只添加解释lifecycle ownership、retry session选择与one-shot exit contract所必需的简体中文注释；代码、标识符与technical terms保持English。

acceptance_criteria:
  - 实际/mcp/codex route恰好注册九个tools：既有五个加四个新增coordination tools；/mcp/claude仍恰好一个room_ask_question。每个新增tool的success、invalid input、wrong-state ProtocolError、unexpected error cleanup与Room/Event/cursor rollback均有direct evidence。
  - room_create idempotent retry返回created=false且不重复room_created Event；三个transition tools重复/wrong-state调用返回invalid_transition并保持完整durable snapshot不变。
  - room:run从existing file-backed SQLite读取current Task，首次Implementation要求clean exact --baseline-head，构造agent_room HTTP MCP config并执行恰好一个Run；succeeded/needs_decision exit 0，failed exit 1，输出/错误确定且无隐式Room/server/daemon行为。
  - RUN_FAILED有non-empty source session时，room_retry_run后dirty worktree与HEAD均保留，new Run继承baseline、通过resumeRun追加单一run_resumed并使用exact --resume；成功后进入REVIEW_REQUIRED且completion evidence完整。
  - RUN_FAILED source session为空时，retry仍在同一Task lineage继承baseline并经resumeRun创建Run，process args不含--resume，新observed session持久化后可正常settle；不创建新Task或新Event type。
  - retry changed HEAD、wrong/stale caller Task、missing Event target、current Task non-failed/non-terminal source或preflight failure均在spawn/new Run/artifact/Event前拒绝，Room/Task/Run/Review/Question/Event list/cursor与worktree authority前后deepEqual；旧Task failed Event对新current Task则按无source的new Implementation处理并通过clean baseline evidence直接验证。
  - file-backed SQLite + representative Git + actual loopback MCP + fake Claude E2E从room_create开始，完整经历Implementation -> Review finding -> confirmed Fix -> Review approved -> ACCEPTED；assert current references、waiting_actor、Event sequence/cursor、session/baseline、Git evidence与artifact_refs。
  - 独立failure scenario先产生并保留worktree change与durablefailed Run，再经实际room_retry_run与第二次one-shot Runner application invocation恢复成功；测试不启动真实Claude或外部network。
  - npm run typecheck、全部focused tests、scope regression与npm test通过；现有Protocol/Room/Git/Runner/MCP/serve/status/Increment 5 regressions不退化。
  - candidate documentation与实际public tools、CLI args/exit、retry session/baseline语义、E2E证据及仍未实现的daemon/automatic wakeup/Increment 7边界一致。

verification:
  - command: node --test "tests/e2e-workflow.test.ts" "tests/runner-cli.test.ts"
    detects: one-shot CLI参数/MCP config/exit contract漂移，或真实MCP + file SQLite + Git + fake-process完整workflow与failure recovery未穿过product boundary。
    decision_if_failed: 不得以直接RoomService-only测试替代；修复本Contract wiring，若需要daemon、new state/schema或真实Claude则返回needs_decision。
  - command: node --test "tests/room-mcp.test.ts" "tests/room-service.test.ts" "tests/claude-runner.test.ts"
    detects: 四个新增tool actor/rollback错误，retry source authority、session选择、baseline gate、resumeRun/Event或terminal settlement错误。
    decision_if_failed: 不得放宽current-entity、transaction或zero-side-effect assertion；只修复task-owned defect，超出scope则返回needs_decision。
  - command: node --test "tests/git-observer.test.ts" "tests/room-serve.test.ts" "tests/status-cli.test.ts" "tests/scope.test.ts"
    detects: dirty-preserving observation、runtime boundary、read-only status、exact tool/script/source/dependency scope或Increment label回归。
    decision_if_failed: 不得用generic allowance、隐式database创建或Git mutation绕过；若正确实现确需新boundary则返回needs_decision。
  - command: npm run typecheck
    detects: CLI/application injection、MCP schemas、retry continuation union、nullable session与Run output的TypeScript偏移。
    decision_if_failed: 不得使用any、ts-ignore、skipLibCheck或compatibility wrapper；修复本Task类型问题，否则返回needs_decision。
  - command: npm test
    detects: Increment 6破坏既有Protocol/Room/Git/Runner/MCP/CLI lifecycle，或Contract承诺缺少direct regression。
    decision_if_failed: 不得跨scope清理或放宽既有测试；只修复task-owned regression，必要时返回needs_decision。

documentation_updates:
  - path: docs/documents/ARCHITECTURE.md
    expected_change: Accepted candidate coordination tools、one-shot launcher、failure retry与E2E boundary；接受前不提升为Current。
  - path: docs/documents/ROOM_PROTOCOL.md
    expected_change: Accepted additive tool interface、retry session/baseline semantics与one-shot Runner contract；不改变protocol version/state/Event/error set。
  - path: docs/documents/ADR/0002-agent-integration-lifecycle.md
    expected_change: Accepted clarification：failure retry仍属Task lineage，session缺失时replacement process不创建新Task，launcher保持one-shot。
  - path: docs/documents/MVP_PLAN.md
    expected_change: Increment 6 Accepted/PLAN_READY状态、完整scope、验收与非目标。
  - path: docs/documents/OPERATIONS.md
    expected_change: candidate room:run/MCP coordination interface、明确当前尚不可用与人工dispatch prerequisite。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 用户确认、planning evidence、实际candidate Diff/verification、dispatch baseline与后续Review事实。

question_policy: >
  如果正确实现需要新增Room state/transition/entity/schema/table/migration/Event/error/dependency、改变
  CodingResult或Increment 5 semantics、增加daemon/scheduler/automatic retry/remote/auth、真实paid Claude
  smoke、Git mutation、通用CLI/framework或超出上述exact MCP tool/script/source boundary，停止受影响工作并
  返回needs_decision。不会改变Contract的局部命名、现有文件内helper、CLI dependency injection seam与
  deterministic fake fixture选择由Claude判断并在Coding Result记录。

confirmed_by_user: true
created_by: codex
created_at: 2026-08-26T00:00:00Z
```

## 2. 2026-08-26 Review 2 用户确认澄清

用户已确认 [Increment 6 Fix Task 1](./INCREMENT_6_FIX_TASK_1.md) 的两项最小方案。本 Contract 中“stale source”只指 caller 指定非current Task，或 current Task retry reference 自身缺失/状态不合法；可明确识别为旧 Task 的 failed Run 不属于新 current Task 的 retry source，因此按无 source 的 `new_implementation` 处理并继续 clean exact baseline gate。三类损坏 source 的直接零副作用证据由 Fix Task 1 补齐；本澄清不改变 state、schema、Event、error、session/baseline ownership 或既有 production behavior。

## 3. 人工 Dispatch prerequisite（Contract 已确认，clean documentation baseline）

当前版本化 `main` 尚无 `room:run`，而本 Task 正在交付该执行入口；用户因此明确选择自行人工派发完整 Accepted Contract。这是 Increment 6 开发执行的一次性 bridge，不恢复已 `Superseded` 的通用 bootstrap，不建立平行 Room authority，也不把人工 process/result当成 Increment 6 runtime E2E 证据。首次Coding因未先形成clean documentation baseline而违反本节前置；Review `review-increment-006-codex-001` 后，用户明确选择不豁免该违约、不使用当前mixed Diff作为Fix/Review authority，并要求在clean documentation baseline上重新执行本Contract。

1. 首次candidate的11个implementation/test/config路径已按用户授权保存到`stash@{0}`（`increment-6-invalid-baseline-candidate`）；用户已另行授权把本Accepted Contract与同步权威文档作为独立documentation commit纳入`main`。该授权不包含删除stash、push或Claude Git写操作。
2. 实际派发前重新确认 `main` worktree的 staged、unstaged、untracked均为空，并从live Git记录exact `baseline_head`、target worktree、branch与task owner；planning时的 `9ccf820cab268123f294075c6362a649d0f8540c` 不能替代届时dispatch baseline。
3. target worktree为 `D:\agent\case\codex-claudecode-room`，branch为 `main`；若用户选择其它branch/worktree，属于独立授权并须重新记录metadata。
4. 人工客户端必须可靠解析 `@docs/documents/INCREMENT_6_TASK_CONTRACT.md`；不能解析时，直接注入本文件完整内容，不得只发送摘要或自行改写requirements。
5. Claude只执行本Contract并返回完整Coding Result；不得追加未确认finding、实现建议、scope或Git权限。需要产品、架构、scope、dependency或权限决定时返回`needs_decision`并停止受影响工作。
6. Codex后续Review以Accepted Contract、exact clean baseline、完整staged/unstaged/untracked task-owned Diff、Coding Result与独立验证为authority；人工process exit、模型自述或green suite不能替代Contract-named public-path/durable-state evidence。

## 4. 原 Implementation 人工派发指令（历史）

```text
执行 @docs/documents/INCREMENT_6_TASK_CONTRACT.md 中已批准的完整 Implementation Task。严格遵守其中的 scope、non_goals、constraints、verification、documentation_updates 和 question_policy；以上 requirements 与 acceptance_criteria 必须全部完成，不得拆分、省略或以摘要替代。完成后按 ROOM_PROTOCOL.md 的 Coding Result Contract 返回完整结果。不要执行 stage、commit、push、branch/worktree、reset、clean 或清理操作。
```

如果人工客户端不能可靠解析 `@docs/documents/INCREMENT_6_TASK_CONTRACT.md`，必须把本文件完整内容直接注入同一次 prompt；不得只发送上面一行。
