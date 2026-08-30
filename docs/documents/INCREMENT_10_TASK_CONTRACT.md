# Increment 10 Task Contract — Stage 2 Execution Core

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（仅在完整Contract获用户确认、状态改为`Accepted`且dispatch gate满足后） |
| 创建日期 | 2026-08-30 |
| 用户确认日期 | 2026-08-30 |
| 架构决定确认 | 2026-08-30（三项；不等于确认本Contract全文） |
| Parent goal | Agent Room Stage 2 — Execution Core |
| Planning main HEAD | `d7bf281c0ef4d40583ec972bcbe5440444665934` |
| Dispatch baseline | 本文件所在clean planning baseline提交完成后，从target main live Git确认exact clean `HEAD`；首次成功`room_submit_task`返回的`observed_baseline_head`为Run command authority |
| 评审目标 | 在不实现DAG/Scheduler/Git Controller的前提下，交付Run/RunAttempt、atomic claim、same-Room multi-Run、cancel/new attempt、per-Run Question/Review及Claude Code WorkerAdapter完整闭环 |

## 1. Accepted boundary

用户已于2026-08-30确认[Stage 2 Architecture Review](./STAGE_2_EXECUTION_CORE_ARCHITECTURE_REVIEW.md)、[ADR-0004](./ADR/0004-execution-core-run-attempt-and-concurrency.md)三项Decision与本Contract全文，本Contract现为`Accepted`。之后用户分别授权planning Room transition与clean planning baseline；durable Room现为`WAITING_FOR_USER_CONFIRMATION`且没有Task。`room_submit_task`与`room:run`仍未授权。

本文件自身仍是由Current `0.3-design` Room提交的协调Contract，因此顶层不包含target `run_id`；下文“为target TaskContract新增required `run_id`”是Claude必须在`0.4-design` schema与public command中实现并测试的目标行为，不得反向伪造为当前Room已经支持该字段。

```yaml
task_id: increment-010-execution-core-multi-run
room_id: room-ebfafef2-f0e9-4fb1-9eef-ac5adef7445f
type: implementation
parent_task_id: null
based_on_review_id: null

background: >
  Current protocol 0.3-design已完成Participant/Role/Assignment、generic session、framed participant route与
  fresh database cutover，但仍使用全局Room.state、单一current Task/Run/Review/Question及single active Run。
  Current Run同时表示logical lineage和一次Claude process attempt；Question、failure与Review会改变整个Room状态。
  Stage 2路线要求provider-neutral Executor、atomic claim、multiple Runs、cancel/new attempt与唯一terminal state，
  同时明确Scheduler、TaskGraph和Git Controller留到Stage 3。

goal: >
  交付Stage 2最小Execution Core：把稳定logical Run与per-process RunAttempt分离，将execution/question/
  failure/review/acceptance authority下沉为per-Run lifecycle；在同一Room中允许多个Run使用不同canonical
  worktree独立claim和settle，提供provider-neutral Executor与唯一Claude Code WorkerAdapter，并通过真实SQLite、
  MCP、Git observer、one-shot CLI和fake process证明atomic claim、worktree isolation、cancel/new attempt、
  guidance、Question、Review/Fix与single terminal settlement。

requirements:
  - 将target protocol exact提升为`0.4-design`；使用fresh v0.4 database/new Room，不原地改写v0.3/v0.2 database。binding把single archived path替换为有序`archived_database_paths`，active path不得出现在archive list；setup rerun复用同一v0.4 identity。
  - 把Room state收窄为planning-only `DISCUSSION|ARCHITECTURE_REVIEW|WAITING_FOR_USER_CONFIRMATION`。confirmed implementation Task提交时原子创建ready Run并把Room返回DISCUSSION；execution/review状态不得再写入Room.state。
  - 为target TaskContract新增required`run_id`。implementation必须创建fresh Run；fix必须引用existing review_discussion Run及该Run current Review，在同一transaction附着Task并把Run转为ready。
  - 将Run改为logical Implementation/Fix lineage，至少持久化run_id、room_id、root_task_id、status、frozen worker_participant_id、nullable frozen canonical worktree_path/baseline_head、created/updated/accepted timestamps。assignment replacement不得改写既有Run worker。
  - 新增RunAttempt，至少持久化attempt_id、run_id、room_id、task_id、server-assigned attempt_no、status、frozen worker/executor、worktree/baseline、agent_session_ref、process exit、timestamps、Coding Result、Git evidence、artifact refs与failure。
  - RunAttempt non-terminal状态为running|decision_requested|cancel_requested；terminal状态为succeeded|failed|needs_decision|canceled|interrupted。terminal fields first-writer-wins且immutable；相同payload retry幂等零Event，不同payload返回id_conflict且完整snapshot不变。
  - atomic claim在单一SQLite transaction认证authority、验证Run ready、拒绝已有active attempt、解析并冻结executor、校验Worker adapter、冻结/继承canonical worktree与baseline、分配attempt_no、创建running attempt、消费pending guidance、更新Run并追加Event。process startup发生在claim提交后。
  - SQLite增加支持并发事实的projection/index：UNIQUE(run_id,attempt_no)、per-Run active-attempt partial unique index、未accepted Run canonical worktree partial unique index与existing per-Room Event sequence uniqueness。constraint race映射stable run_already_active/worktree_already_owned error，不泄漏raw SQLite error。
  - 首attempt在claim前对目标worktree执行existing clean Git gate并冻结repository root与HEAD；后续attempt允许dirty evidence但必须使用同一canonical worktree且actual HEAD等于Run baseline。Stage 2不创建、切换、删除或清理worktree。
  - 同一Room多个Run只在不同canonical worktree上允许active；Run处于failed/needs_decision/canceled/review_required/review_discussion时继续占有worktree，accepted后释放。另一Run即使字符串path不同但解析到同一repository worktree也必须被拒。
  - 新增最小WorkerAdapter execution contract与Local Executor。只实现并验收adapter_id=claude_code_cli的ClaudeCodeWorkerAdapter，复用existing process transport/stream interpreter；其它adapter在claim前worker_adapter_unavailable且零attempt/process/Event/artifact。不得增加dynamic registry、discovery或第二adapter。
  - process lifetime改为per-attempt，session lifetime改为per-Run。Decision/Fix从latest reliable attempt恢复exact session；failure retry在session缺失时允许同Run replacement session；新Run不得继承其它Run session。
  - Question增加attempt_id；room_ask_question只允许frozen worker对active attempt调用，原子创建Question并把attempt置decision_requested。Runner停止后settle needs_decision；回答前必须已terminal-finalized。contract内答案只把该Run置ready；scope-changing答案进入Room planning confirmation但不得改变其它Run。
  - Review增加attempt_id；只允许target Run latest succeeded attempt进入review_required并提交Review。Review/Fix/acceptance只改变目标Run；Fix Task必须留在同一Run并由下一attempt执行，复用Run baseline/worktree/session lineage。
  - room_retry_run输入增加run_id，只把目标failed/canceled Run转ready；不存在、wrong room、wrong status、stale request与same-ID retry/conflict按current project invariants处理，零写入Oracle覆盖Room其它Runs。
  - 新增room_cancel_run：planner提交run_id、reason、confirmed_by_user=true，把目标active attempt与Run置cancel_requested并追加Event。Executor通过AbortSignal/可测试poll boundary终止owned process并唯一settle canceled；cancel与success/failure竞争不得产生两个terminal Event。
  - 新增room_add_run_guidance与RunGuidance entity。只有目标Run无active attempt时可创建，下一attempt claim原子消费一次并把guidance注入完整prompt；running/decision_requested/cancel_requested期间请求以validation_failed零写入拒绝，不宣称Claude live steer。
  - room_get_state返回planning_waiting_actor、全部Runs/Attempts/Guidance及per-Run run_work_items；移除单一current_run/current_review/current_question作为execution authority。每个work item从Run/Event/reference推导current Task/Attempt/Question/Review并稳定排序，跨Room不泄漏。
  - Event entity_type增加run_attempt与run_guidance，并按Architecture Review定义产生run_created、attempt claim/progress/terminal、cancel、guidance、Question、Review/acceptance Event。Event继续保存raw participant_id+actor_role，不复制Task/result/Diff。
  - 更新MCP tools、Status CLI和room:run CLI。one-shot CLI必须显式接收run_id与fresh attempt_id，并在一次operator approval内最多执行一个attempt；不轮询ready queue、不自动启动下一Run。Plugin Skill必须按Run选择合法下一动作，未知或并发状态先durable reread。
  - 使用两个RoomService/SQLite connection与deterministic fake Worker直接证明同Run双claim、同worktree双Run、不同worktree双Run重叠执行、Question/failure/Review隔离、terminal race、cancel和guidance；Oracle不得从production transition/index/route helper导入期望值。
  - Stage 2 candidate文档只写Proposed/Candidate implementation facts；Review、用户接受、版本化集成及独立v0.4 cutover前不得写成Current，不得删除v0.3/v0.2 database。

non_goals:
  - TaskGraphDraft/Revision、Plan、Approval、dependency、priority、concurrency policy、scope conflict或automatic Scheduler。
  - Git Controller、worktree/branch创建与分配、commit、merge、push、reset、clean、checkout或automatic conflict resolution。
  - 两个Run修改同一worktree、cross-Room scheduler或machine-level global concurrency。
  - 新provider adapter、dynamic adapter registry/discovery、remote Worker、automatic model routing、secret storage或remote/auth。
  - running Claude Code live guidance、free Worker chat、automatic retry、automatic Fix、automatic Review/acceptance。
  - VS Code Cockpit、SSE、Webview、GitHub App/Issue/PR/Check或webhook。
  - v0.3/v0.2 in-place migration/backfill、history rewrite、dual-read/dual-write、legacy route或compatibility wrapper。

architecture_decisions:
  - Room只拥有planning phase；Run拥有独立execution/review lifecycle；RunAttempt拥有单次process与terminal evidence。
  - 一个Run等于一条Implementation/Fix/session/worktree lineage，一个RunAttempt等于一次process invocation。
  - SQLite transaction+partial unique index共同拥有claim/worktree concurrency truth；Event只提供ordered evidence和read-model reference。
  - Stage 2提供manual one-shot execution core，不提供Stage 3 Scheduler或Git Controller。
  - WorkerAdapter只抽象当前Executor真实调用边界；只有Claude Code adapter可用，接口不等于provider capability。
  - breaking self-host implementation由固定planning baseline的detached v0.3 launcher驱动target main/current v0.3 Room；最终v0.4 cutover单独授权。

scope:
  - src/protocol/schema.ts与errors.ts的0.4 Run/RunAttempt/Guidance/Review/Question/Event/public error contract
  - src/room/repository.ts、room-service.ts、state-machine.ts与state-snapshot.ts的planning/per-Run lifecycle、SQLite schema、atomic claim与read model
  - src/runner下provider-neutral Executor/WorkerAdapter seam与Claude Code adapter、process cancellation、prompt/guidance/session/terminal wiring
  - src/mcp/tools.ts、http.ts、serve.ts与src/cli/run.ts/status.ts的targeted multi-Run public paths
  - plugins/agent-room唯一Skill、setup helper与project-setup reference的0.4 binding/archive、per-Run workflow及one-shot attempt command
  - tests下protocol/service/repository/snapshot/MCP/Runner/CLI/setup/packaging/E2E/scope direct regression
  - docs/documents/ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、OPERATIONS.md、DEVELOPMENT_LOG.md与ADR-0004的candidate实现同步
  - 不修改AGENTS.md、CLAUDE.md、active host approval、global Codex config或Stage 3–6 source

constraints:
  - Coding必须从包含Accepted Contract、同步planning文档、project-local binding与Plugin安装元数据的clean exact target main baseline开始。上述pre-existing changes由Codex在dispatch前按独立scope版本化；Claude不得改写或清理这些baseline历史。
  - 用户另行授权后创建detached v0.3 launcher worktree；agent_room_root临时指向launcher，project_path仍指向target main。Claude不得修改launcher或active v0.3 database/binding。
  - Claude不得执行Git write、commit、push、merge、branch/worktree、reset、clean、checkout、database/binding cutover或旧database删除。
  - 不新增runtime dependency，除非existing Node/SQLite/process/MCP capability经直接证据无法实现；届时返回needs_decision。
  - 每个new create/claim/settle command覆盖success、invalid、same-ID same-content retry、same-ID different-content、wrong room/run/task/attempt membership、stale entity、disabled/replaced participant与完整rollback。
  - 代码必须包含解释state ownership、transaction/index race、first settlement、worktree lease与adapter failure边界所需的简体中文注释；不得逐行复述。

acceptance_criteria:
  - fresh 0.4 database可创建planning-only Room；v0.3/v0.2 database在任何schema write前拒绝且bytes不变，setup rerun复用exact v0.4 database/Room/binding/archive list。
  - 同一Room可持久化至少两个ready/running/review/decision状态不同的Run；Run A的Question/failure/cancel/Review/Fix/acceptance不改变Run B任何entity/status/Event reference。
  - 同Run两个concurrent claim恰好一个成功；不同Run同canonical worktree claim恰好一个成功；不同worktree的两个Run可在fake-process E2E中真实时间重叠并独立settle。
  - 每个attempt terminal outcome唯一且immutable；success/failure/cancel竞争只产生一个terminal Event，retry/conflict与完整snapshot零副作用符合Contract。
  - initial/Fix/Decision/retry attempts逐字段继承正确Run worktree、baseline与session semantics；new Run不继承旧Run session，Fix保持同Run lineage。
  - Claude Code adapter完成Implementation→Question/answer→retry/failure→Review→Fix→Review→accepted；non-Claude adapter assignment在claim前稳定拒绝且无side effect。
  - cancel request实际使fake/real process boundary收到AbortSignal并settle canceled；guidance只被下一attempt消费一次，running guidance直接拒绝。
  - snapshot/Status CLI/Plugin Skill准确显示planning state与多个run_work_items；不存在单一current Run造成的覆盖，participant route与Role frozen authority保持。
  - Stage 3–6 capability、Git mutation、in-place migration、second adapter、live steer、daemon或automatic scheduling未进入Diff。

verification:
  - command: npm run typecheck
    detects: 0.4 schema、Run/RunAttempt reference、Executor/WorkerAdapter、MCP/CLI/snapshot与binding的TypeScript contract漂移。
    decision_if_failed: 修复task-owned类型；不得使用any/ts-ignore/skipLibCheck或compatibility wrapper。
  - command: node --test "tests/protocol.test.ts" "tests/state-machine.test.ts" "tests/room-service.test.ts" "tests/room-state-snapshot.test.ts"
    detects: planning/per-Run state ownership、membership、idempotency、stale/replacement authority、Question/Review/Fix reference或rollback错误。
    decision_if_failed: 修复最窄protocol/application/repository boundary；不得恢复global execution state或active pointer。
  - command: node --test "tests/execution-core.test.ts"
    detects: same-Run双claim、same-worktree双Run、different-worktree concurrency、partial unique index/domain error mapping与terminal race。
    decision_if_failed: 修复transaction/index/settlement owner；该suite未通过不得交付multi-Run。
  - command: node --test "tests/claude-process.test.ts" "tests/claude-stream.test.ts" "tests/claude-runner.test.ts" "tests/worker-adapter.test.ts"
    detects: Claude adapter、Abort/cancel、guidance prompt、session lineage、progress与process/stream/Git/artifact single settlement回归。
    decision_if_failed: 修复Executor/Claude adapter边界；不得增加第二adapter或把failure降级为空evidence。
  - command: node --test "tests/room-mcp.test.ts" "tests/runner-cli.test.ts" "tests/status-cli.test.ts" "tests/e2e-workflow.test.ts"
    detects: targeted public commands、run_id/attempt_id routing、per-Run isolation、one-shot attempt和完整Review/Fix lifecycle错误。
    decision_if_failed: 修复public adapter/wiring；不得用service unit test替代MCP/CLI path。
  - command: node --test "tests/plugin-setup.test.ts" "tests/plugin-packaging.test.ts" "tests/multi-project-e2e.test.ts"
    detects: 0.4 binding/archive、Skill per-Run workflow、v0.3/v0.2 mutation、cross-project或multi-Run identity串扰。
    decision_if_failed: 修复setup/Plugin consumer；不得原地migration、raw HTTP fallback或第二Skill。
  - command: node --test "tests/scope.test.ts"
    detects: Stage 3–6、Git mutation、new provider/dependency、AGENTS/CLAUDE/global config或未批准文件进入Diff。
    decision_if_failed: 删除越界修改；正确实现必须扩大scope时返回needs_decision。
  - command: npm test
    detects: focused suites未进入full regression、Stage 1 Participant/Role/framed route与现有Git/Runner失败语义回归。
    decision_if_failed: 只修复task-owned regression；不得放宽既有独立Oracle。

documentation_updates:
  - path: docs/documents/ARCHITECTURE.md
    expected_change: Candidate 0.4 Room/Run/RunAttempt ownership、Executor/WorkerAdapter与worktree isolation实现事实。
  - path: docs/documents/ROOM_PROTOCOL.md
    expected_change: Candidate planning/per-Run state、entity、command、Event、error、idempotency与cutover exact contract。
  - path: docs/documents/MVP_PLAN.md
    expected_change: Increment 10 candidate进度、验收与Stage 3 entry gate。
  - path: docs/documents/OPERATIONS.md
    expected_change: multi-Run status、cancel/retry/guidance、v0.4 setup/cutover/rollback与old database preservation。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: dispatch baseline/launcher/Room、Coding Result、verification、deviation与candidate状态。
  - path: docs/documents/ADR/0004-execution-core-run-attempt-and-concurrency.md
    expected_change: 用户确认后Accepted；实现、Review与最终cutover事实按阶段同步。

question_policy: >
  如果正确实现需要Stage 3 TaskGraph/Scheduler/Git Controller/worktree creation、same-worktree parallel、
  new provider/dependency、live Claude steer、daemon/automatic retry、v0.3原地migration、legacy compatibility、
  Git mutation、global config或改变三项已确认Architecture Decision，停止受影响工作并返回needs_decision。
  局部type/helper/index名称、test fixture组织、cancel poll/grace常量和文档段落位置可按existing style作最小选择，
  但必须在Coding Result记录且不得改变observable contract。

confirmed_by_user: true
created_by: codex
created_at: 2026-08-30T00:00:00Z
```

## 2. Dispatch prerequisites

1. 已完成：Architecture Review三项Decision与本Contract全文均已确认，Contract为`Accepted`。
2. 未授权：通过Current v0.3 Room记录Architecture Review/confirmation并调用`room_submit_task`创建Task；成功后才可进入durable `PLAN_READY`。
3. 用户另行决定并处理当前`.codex/config.toml`、`.gitignore`、Plugin manifest已有修改；target worktree必须clean。
4. 用户另行授权planning documentation commit、detached v0.3 launcher worktree及Gitignored local binding临时更新。
5. 从首次成功`room_submit_task`响应保留exact `observed_baseline_head`，再按host UI审批发起至多一次one-shot Run。
6. 未授权push、implementation commit、v0.4 cutover、旧database删除或第二次Run。
