# Increment 12 Task Contract — DAG Scheduler Foundation

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | 独立Codex Coding task：`gpt-5.6-sol` / `medium`（仅在本Contract全文获用户确认且dispatch prerequisites满足后） |
| 创建日期 | 2026-09-01 |
| 用户确认日期 | 2026-09-01 |
| Architecture Decision | [Stage 3 Architecture Review](./STAGE_3_DAG_CONTROL_PLANE_ARCHITECTURE_REVIEW.md) `Approved`；[ADR-0006](./ADR/0006-stage-3-dag-control-plane-and-git-controller.md) `Accepted` |
| Parent goal | Agent Room Stage 3 — DAG Control Plane |
| Dispatch baseline | accepted Increment 10/11 source与本规划文档已由本次提交版本化；创建Coding task前从clean target `main`读取并记录live exact `HEAD` |
| 评审目标 | 交付Plan/immutable TaskGraphRevision/Approval、structured scope、deterministic ready scheduling与`per_task` acceptance；不执行任何Git write |

## 1. Confirmation boundary

用户于2026-09-01先确认Stage 3 Architecture Review §17三项推荐决定，随后明确确认本Contract全文。本文件现为`Accepted`、`confirmed_by_user=true`，阶段进入`PLAN_READY`；该确认不自动授权Git写入、Coding task创建、runtime/database/binding cutover或旧database处理。

```yaml
task_id: increment-012-dag-scheduler-foundation
type: implementation
parent_task_id: null
based_on_review_id: null

background: >
  Increment 10/11 accepted candidate已经提供baseline-free protocol 0.4-design Execution Core：logical Run、
  per-process RunAttempt、atomic claim、canonical worktree lease、per-Run Question/Review/Fix/acceptance、
  provider-neutral Executor和live Git path evidence。Stage 3已确认使用fresh 0.5-design，引入Plan、immutable
  TaskGraphRevision、Approval、structured write scope与one-shot Scheduler；Increment 12只交付Graph/Scheduler
  foundation和per_task acceptance，managed worktree、Git Controller与integration_only留到Increment 13。

goal: >
  交付Stage 3首个最小闭环：用户创建Plan和immutable TaskGraphRevision、通过exact Approval确认revision，
  orchestrator以确定性one-shot reconcile把dependency-ready node原子物化为existing Task+Run，Executor claim
  在同一transaction执行approved-revision、concurrency 1..3和structured write-scope gate；每个node继续沿用
  Stage 2 per-Run Review/Fix/用户接受，并通过SQLite并发、MCP/Status/Plugin public paths和独立Oracle证明
  Draft不可执行、Amendment不改写已dispatch Contract、branch isolation与零Git mutation。

requirements:
  - 将target protocol exact提升为`0.5-design`，使用fresh `room-v0.5.sqlite`与new Room；active v0.3及archived v0.2 database不原地迁移、backfill或删除。Setup只支持当前真实v0.3→v0.5与fresh v0.5路径，不为未cutover v0.4 binding增加compatibility layer。
  - 新增stable`Plan`entity：plan_id、room_id、created_by_participant_id、created_at。一个Room首版至多创建一个Plan lineage；same-ID/same-content retry返回existing，same-ID/different content为`id_conflict`，第二plan_id在同Room以`validation_failed`零写入拒绝。
  - 新增`room_create_plan` planner command。只有enabled planner且Room属于同一project可以创建；Plan创建不推进Room state、不创建Revision/Approval/Task/Run。
  - 将RoleAssignment scope扩展为`room|plan|task`，resolution exact优先级固定为task > plan > room。Plan-scope assignment必须引用existing same-Room Plan；success/retry/conflict、wrong room/plan、disabled/replaced orchestrator authority均覆盖完整rollback。
  - 新增immutable`TaskSpec`schema：保存现有TaskContract全部业务字段、preallocated task_id/run_id、created_by=`codex`和frozen created_at，但不得包含`confirmed_by_user`。Draft不得满足正式TaskContract确认literal；approved revision物化时只能补入`confirmed_by_user=true`。
  - 新增immutable`TaskGraphRevision`：revision_id、plan_id、room_id、server-validated positive revision_no、nullable supersedes_revision_id、concurrency_limit、acceptance_policy、ordered nodes、creator identity与created_at。Increment 12 acceptance_policy schema只允许literal`per_task`；不得提前暴露`integration_only`可用能力。
  - 每个node至少包含node_id、kind=`task`、TaskSpec、dependencies、structured write_scopes、exact worker_assignment_id与integer priority。Increment 12不接受kind=`integration`、managed-worktree config或Git action reference。
  - structured write scope只允许repo-relative POSIX`path`与`kind=file|tree`；root tree使用`.`。拒绝absolute path、empty、backslash、`.`/`..` traversal component、glob以及normalize后逃出repository的输入。Component-aware overlap不得把`src/a`误判为`src/ab`。
  - 新增`room_create_plan_revision` planner command。Revision insert前验证Plan/Room membership、revision_no连续、supersedes指向该Planlatest revision、node/task/run ID在revision内唯一、dependency存在、无self-edge/cycle、concurrency_limit为1..3、worker Assignment active/compatible，以及TaskSpec完整schema；成功只创建Draft revision与Event。
  - 新增generic`Approval`entity，但Increment 12 target_type只开放`task_graph_revision` consumer。字段至少包含approval_id、room_id、target_type、target_id、decision=`approved|rejected`、confirmed_by_user=true、planner_participant_id、created_at；Approval immutable，target terminal decision唯一。
  - 新增`room_decide_plan_revision` planner command。只允许Room=`WAITING_FOR_USER_CONFIRMATION`且`confirmed_by_user=true`；在一个`BEGIN IMMEDIATE`transaction内重新验证完整DAG/scope/assignment/amendment、创建Approval与Event并把Room返回`DISCUSSION`。Draft或rejected revision永远不可由Scheduler消费。
  - Revision Approval拒绝任意两个无dependency reachability顺序且write scope overlap的node，返回`scope_conflict`且Room、Plan、Revision、Approval、Assignment、Dispatch、Task、Run、Attempt、Review、Question与Event snapshot完整不变。
  - Amendment必须创建new revision，旧revision/content/Approval/Event永不更新。已有NodeDispatch的node在new revision中必须完整结构相等且ancestor关系不变；只能修改、删除或rewire尚未dispatch node。违反时返回`immutable_revision_violation`且零写入。
  - `answer_changes_contract=true`不得修改或resume原node/Run。新revision保留原node历史并使用fresh node/task/run IDs增加replacement；只有未dispatch descendant可rewire。已有dispatch descendant需要new Plan，但首版one-Plan-per-Room不支持该路径，必须以`validation_failed`零写入拒绝并提示operator新建Room/Plan，不得静默改图。
  - 新增`NodeDispatch`：dispatch_id、revision_id、node_id、task_id、run_id、nullable canonical worktree_path、status=`waiting|ready|dispatched|blocked|completed`及timestamps。`UNIQUE(revision_id,node_id)`、`UNIQUE(task_id)`和`UNIQUE(run_id)`是并发最终Oracle。
  - 新增internal`materializeApprovedGraphNode` application boundary。它复用Stage 2 Task/Run creation、identity、idempotency、worker freeze与transaction invariants，但confirmation source只能是exact approved revision；不得调用public implementation`room_submit_task`或重复Room confirmation transition。
  - Target public`room_submit_task`只接受`type=fix`并继续挂入existing review_discussion Run。任何`type=implementation` direct submission以`validation_failed`零写入拒绝；single Implementation使用one-node Plan revision表达。
  - 新增one-shot`room_reconcile_plan` orchestrator command。它只读取该Plan latest approved revision，按priority降序、revision node order、node_id字典序确定候选；Draft/rejected/old approved revision不得物化new node。
  - reconcile input可以为eligible node提供operator-prepared existing worktree path。使用existing Git Observer只读解析canonical non-bare repository root并冻结到NodeDispatch；不创建、切换、删除、清理worktree，不执行stage/commit/merge。未提供worktree的eligible node保持`waiting`，不是failure。
  - reconcile在`BEGIN IMMEDIATE`transaction内对dependency、latest Approval、dispatch uniqueness与scope重新校验，并原子创建NodeDispatch、正式TaskContract（只补confirmed_by_user=true）、ready Run和Events。same reconcile retry返回既有references且零duplicate；两个SQLite connection竞争同node恰好一组entity成功。
  - `per_task` dependency只在所有direct dependency Run=`accepted`后满足。ready/running/needs_decision/failed/canceled/review_required/review_discussion均不得解锁descendant；一个branch的Question/failure/Review只阻塞该node descendants，无dependency且scope不冲突的其它branch继续ready。
  - Executor`claimRunAttempt`在Stage 2 existing atomic claim transaction内新增graph guard：Run必须来自current approved revision的NodeDispatch，Room active attempt count必须小于revision concurrency_limit，declared scopes不得与其它active attempt overlap，claim worktree必须等于NodeDispatch canonical worktree。失败分别为`plan_revision_not_approved`、`concurrency_limit_reached`、`scope_conflict`或existing validation error，且零attempt/process/Event/artifact。
  - claim concurrency只统计RunAttempt status=`running|decision_requested|cancel_requested`；等待Question答案、Review、Fix或用户acceptance的terminal attempt不占active process slot，但其Run与NodeDispatch worktree ownership继续遵守Stage 2 lease。
  - attempt成功收集live staged/unstaged/untracked evidence后，使用测试独立grammar核对所有path属于declared write scopes。越界不篡改Coding Result、不自动清理；Run仍进入`review_required`以允许Reviewer说明finding，NodeDispatch原子标记`blocked`并追加`node_scope_violated` Event，descendant与Git consumer保持blocked。
  - Review Decision与用户acceptance继续由Stage 2 Run lifecycle拥有。`per_task`下Reviewer approved不自动accept；只有用户existing acceptance command把Run置accepted后，NodeDispatch derived/completed projection才满足dependency。
  - snapshot新增plans、task_graph_revisions、approvals、node_dispatches与graph_work_items。graph_work_item至少包含plan/revision/node/task/run/dispatch references、derived waiting reason、dependency readiness、scope violation与worktree path；数组按revision node order稳定输出并严格Room-filter。
  - 新增Event entity types`plan|task_graph_revision|approval|node_dispatch`，至少产生`plan_created`、`task_graph_revision_created`、`task_graph_revision_approved|rejected`、`graph_node_materialized`、`node_scope_violated`。Event只保存reference/summary，不复制Graph/Task/Diff。
  - 新增stable errors`plan_revision_not_approved`、`scope_conflict`、`immutable_revision_violation`、`concurrency_limit_reached`；process/Git observer failure继续传播，不能降级为empty scope/worktree evidence。
  - MCP tools新增room_create_plan、room_create_plan_revision、room_decide_plan_revision、room_reconcile_plan并扩展room_get_state；Status CLI与Plugin Skill按graph_work_items选择合法人工下一步。Plugin不得自动reconcile、自动启动Run或绕过revision Approval。
  - setup helper、binding/reference与packaging tests更新为fresh target`0.5-design`，只声明Increment 12已实现能力；active v0.3 binding/database直到独立cutover授权前保持不变。
  - 所有new create/decide/reconcile/claim path覆盖合法请求、invalid请求、same-ID same-content retry、same-ID different-content、wrong room/plan/revision/node/task/run membership、stale revision、disabled/replaced participant及完整public durable snapshot rollback。

non_goals:
  - Git Controller、GitAction、Git preview/approval/execution、managed worktree或任何Git mutation command。
  - `integration_only` acceptance、integration node、automatic component acceptance、commit/integration dependency或Plan batch acceptance。
  - automatic Agent/Codex/Claude launch、background scheduler/daemon、polling queue、automatic retry/Fix/Review/acceptance。
  - push、fetch/pull、stage、commit、merge、rebase、reset、clean、checkout、branch/worktree创建/删除或conflict resolution。
  - file hash、Diff fingerprint、commit hash precondition、branch mirror、timestamp token或其它replacement validator。
  - 多active Plan lineage、cross-Room/global scheduler、machine-level concurrency、remote worker或cross-repository DAG。
  - new WorkerAdapter/provider、dynamic adapter registry、model routing、live steer、Chat、VS Code Cockpit、SSE或GitHub。
  - v0.2/v0.3 in-place migration、v0.4 binding compatibility、dual-read/write、legacy implementation submission path或compatibility wrapper。
  - 修改AGENTS.md、CLAUDE.md、global Codex config、host approval policy或Plugin marketplace identity。

architecture_decisions:
  - 用户已确认accepted v0.4 candidate先版本化但不cutover，Stage 3使用fresh`0.5-design`并在完整Stage 3接受后单次cutover。
  - 用户已确认Stage 3拆分为Increment 12 Graph/Approval/Scheduler + per_task与Increment 13 Git Controller + integration_only。
  - 用户已确认未来Git Controller首版allowlist，但Increment 12不创建GitAction schema、process boundary或任何Git write。
  - Plan是stable lineage；TaskGraphRevision内容immutable；Approval是exact user decision；current approved revision由Event sequence推导，不新增mutable current pointer。
  - Graph拥有dependency/readiness/scope；Stage 2 Run/RunAttempt/Review继续拥有execution、terminal evidence与acceptance，不复制状态authority。
  - Scheduler是explicit one-shot reconcile component，由orchestrator调用；它不等于Agent launcher或background service。
  - TaskSpec与TaskContract分离：Draft不持有confirmed literal，Approval后物化只补`confirmed_by_user=true`。
  - Machine scope使用独立file/tree grammar，不解析TaskContract的人类scope字符串。

scope:
  - src/protocol/schema.ts与errors.ts的0.5 Plan/TaskSpec/TaskGraphRevision/Approval/NodeDispatch/Event/error contract
  - src/room/repository.ts、room-service.ts、state-snapshot.ts与必要state-machine wiring的Plan、Approval、materialization、graph claim/scope transaction
  - new src/scheduler/plan-scheduler.ts的deterministic one-shot reconcile与pure DAG/scope eligibility logic
  - src/mcp/tools.ts与src/cli/status.ts的Stage 3 planning/snapshot public consumer
  - plugins/agent-room/skills/agent-room/SKILL.md、setup-project.ts与project-setup.md的0.5 binding和manual graph workflow
  - tests/protocol.test.ts、state-machine.test.ts、room-service.test.ts、room-state-snapshot.test.ts、execution-core.test.ts、room-mcp.test.ts、status-cli.test.ts、plugin-setup.test.ts、plugin-packaging.test.ts、e2e-workflow.test.ts与scope.test.ts
  - new tests/plan-scheduler.test.ts及必要test-only SQLite concurrency worker/fixture
  - docs/documents/ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、OPERATIONS.md、DEVELOPMENT_LOG.md与ADR-0006的Candidate/Review Required事实
  - 不修改src/git production、src/runner WorkerAdapter/process/stream transport、src/cli/run.ts、package dependency/lockfile、AGENTS.md、CLAUDE.md或Increment 13 source

constraints:
  - Coding不得在当前dirty root或Increment 11 candidate worktree继续叠加。Dispatch前必须经独立Git授权把accepted Increment 10/11 implementation、Fix、Review文档与Stage 3 planning文档形成clean versioned`main` baseline。
  - Coding task使用saved project`codex-claudecode-room`的独立worktree，model=`gpt-5.6-sol`、thinking=`medium`；task创建仍需用户独立授权。
  - Coding task不得commit、push、merge、rebase、reset、clean、checkout、创建/删除branch/worktree、启动Claude/Agent Room Run或执行runtime/database/binding cutover。
  - 不新增runtime dependency。若existing Zod、Node、SQLite、MCP与Git Observer read-only capability不足以实现，停止并返回`needs_decision`。
  - 不修改Git Observer production；worktree canonicalization必须复用accepted read-only public boundary。若确需改变其contract，返回`needs_decision`。
  - 新代码只为state owner、transaction/unique race、scope component grammar、amendment immutability和derived read model添加必要简体中文注释，不逐行复述。
  - Test Oracle必须使用测试侧literal graph、scope component比较、expected error和full snapshot；不得导入production validator、transition table、sort helper或allowed-scope collection生成期望。
  - Candidate文档只写`Candidate / Review Required`；Review、用户接受、版本化与v0.5 cutover前不得标记Current。

acceptance_criteria:
  - fresh 0.5 database可创建Room/Plan/Draft revision；v0.3/v0.2 database在任何schema write前拒绝且bytes不变，setup rerun复用exact v0.5 identity/archive order。
  - Draft与rejected revision经过reconcile返回零materialization；approved revision的eligible node恰好创建一组NodeDispatch/Task/Run/Event，retry与双connection race无duplicate。
  - cycle、missing dependency、wrong assignment、invalid scope、unordered overlap和修改已dispatch node均在Approval前拒绝，完整public snapshot逐字段不变。
  - task > plan > room Assignment resolution、replacement freeze与disabled participant authority在Plan/Revision/materialization/claim public paths直接成立。
  - dependency chain只在upstream Run accepted后解锁；Question/failure/Review只阻塞相关descendant，无关branch可继续materialize和claim。
  - concurrency_limit=1、2、3均由真实并发claim证明不会超限；scope overlap race恰好一个claim成功，loser零attempt/process/Event/artifact。
  - operator-provided existing worktree只读canonicalize并冻结；missing/non-repository/wrong worktree失败不产生Git mutation或partial durable write。
  - out-of-scope staged/unstaged/untracked completion evidence把target NodeDispatch标记blocked、保留Run review_required与live worktree，不解锁descendant、不自动清理。
  - direct Implementation submission被零写入拒绝；one-node approved revision可完成Implementation→Review/Fix→user acceptance，Fix仍留在同一Run。
  - MCP、Status CLI与Plugin从同一snapshot展示Plan/revision/Approval/graph work item，并且Plugin只建议人工approval/reconcile/run动作，不自动调用。
  - production/source/static scope中不存在Git mutation、GitAction/integration_only、hash replacement、background scheduler、new provider/dependency或Stage 4–6能力。

verification:
  - command: npm run typecheck
    detects: 0.5 Plan/Revision/Approval/Dispatch、RoleAssignment plan scope、Scheduler、snapshot、MCP/CLI与setup type contract漂移。
    decision_if_failed: 修复task-owned类型；不得使用any、ts-ignore、skipLibCheck或compatibility wrapper。
  - command: node --test "tests/protocol.test.ts" "tests/state-machine.test.ts" "tests/room-service.test.ts" "tests/room-state-snapshot.test.ts"
    detects: entity schema、planning transition、authority/membership、approval/idempotency、amendment immutability、materialization或snapshot rollback错误。
    decision_if_failed: 修复最窄protocol/application/repository owner；不得新增mutable current pointer或复制Run status。
  - command: node --test "tests/plan-scheduler.test.ts" "tests/execution-core.test.ts"
    detects: cycle/dependency/scope grammar、deterministic order、reconcile race、concurrency 1..3、active-scope race和branch isolation错误。
    decision_if_failed: 修复Scheduler pure logic或claim transaction/index；未通过不得交付DAG scheduling。
  - command: node --test "tests/room-mcp.test.ts" "tests/status-cli.test.ts" "tests/e2e-workflow.test.ts"
    detects: Plan/Revision/Approval/reconcile public route、Draft零执行、one-node lifecycle、Fix-only submit与graph snapshot consumer错误。
    decision_if_failed: 修复public adapter/wiring；不得以service unit test替代MCP/CLI path。
  - command: node --test "tests/plugin-setup.test.ts" "tests/plugin-packaging.test.ts" "tests/multi-project-e2e.test.ts"
    detects: 0.5 fresh binding/archive、Plugin manual graph workflow、cross-project isolation或automatic launch/Git wording越界。
    decision_if_failed: 修复setup/Plugin consumer；不得增加v0.4 compatibility或自动副作用。
  - command: node --test "tests/scope.test.ts"
    detects: src/scheduler exact boundary之外的新module、Git mutation、Increment 13、new dependency、AGENTS/CLAUDE/global config或未批准文件进入Diff。
    decision_if_failed: 删除越界修改；正确实现必须扩大scope时返回needs_decision。
  - command: npm test
    detects: focused suite未进入full regression，accepted Stage 1/2 identity、Execution Core、Git failure、Plugin/setup与one-shot Runner语义回归。
    decision_if_failed: 只修复task-owned regression；不得放宽既有independent Oracle。
  - command: git diff --check
    detects: whitespace error、unresolved patch formatting或文档/code diff损坏。
    decision_if_failed: 修复task-owned formatting；不得格式化无关文件。

documentation_updates:
  - path: docs/documents/ARCHITECTURE.md
    expected_change: Candidate 0.5 Plan/Revision/Approval/Scheduler component、dependency direction与existing-worktree flow。
  - path: docs/documents/ROOM_PROTOCOL.md
    expected_change: Candidate entities、commands、state/transaction/idempotency、scope/conflict/error/Event与snapshot exact contract。
  - path: docs/documents/MVP_PLAN.md
    expected_change: Increment 12 Candidate/Review Required进度、验收与Increment 13 dependency gate。
  - path: docs/documents/OPERATIONS.md
    expected_change: Draft/approved graph、manual reconcile、existing worktree mapping、concurrency/scope blocked状态与v0.5 cutover边界。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: exact dispatch baseline、Coding Result、changed files、verification、deviation、questions与Candidate状态。
  - path: docs/documents/ADR/0006-stage-3-dag-control-plane-and-git-controller.md
    expected_change: 只追加Increment 12 Candidate实现事实，不改变Accepted decision或提前声明Increment 13能力。

question_policy: >
  如果正确实现需要Git mutation/GitAction/managed worktree、integration_only、automatic Agent launch、background daemon、
  多active Plan、new provider/dependency、hash/fingerprint validator、v0.3原地migration、v0.4 compatibility、修改Git
  Observer production、AGENTS/CLAUDE/global config或改变已确认三项Architecture Decision，停止受影响工作并返回
  needs_decision。局部type/helper/index/test fixture名称和文档段落位置可按existing style作最小选择，但必须在
  Coding Result记录且不得改变observable contract。

confirmed_by_user: true
created_by: codex
created_at: 2026-09-01T00:00:00Z
```

## 2. Dispatch prerequisites

1. 已完成：Stage 3 Architecture Review三项Decision已确认；Review=`Approved`，ADR-0006=`Accepted`。
2. 已完成：用户完整确认本Contract全文；`confirmed_by_user=true`，阶段=`PLAN_READY`，但未自动创建Coding task。
3. 已完成：用户授权把Increment 10/11 accepted candidate、Fix/Review文档、Stage 3 Architecture与本Contract由本次提交形成versioned clean`main` baseline；Coding task创建前记录提交完成后的live exact HEAD与task-owned file set。
4. 待独立task创建授权：从saved project`codex-claudecode-room`创建Codex worktree task，model=`gpt-5.6-sol`、thinking=`medium`，完整注入本Contract，不使用摘要。
5. Coding task不映射到terminal active v0.3 Room，不启动Claude或Agent Room Run，不执行commit/push/cutover。
6. v0.5 database/binding cutover只有Increment 12/13完成Review、用户接受并获独立授权后才可执行。
