# Increment 13 Task Contract — Git Controller + `integration_only`

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | 独立Codex Coding task：`gpt-5.6-sol` / `medium`（仅在本Contract全文获用户确认且dispatch prerequisites满足后） |
| 创建日期 | 2026-09-02 |
| 用户确认日期 | 2026-09-02 |
| Architecture Decision | [Stage 3 Architecture Review](./STAGE_3_DAG_CONTROL_PLANE_ARCHITECTURE_REVIEW.md) `Approved`；[ADR-0006](./ADR/0006-stage-3-dag-control-plane-and-git-controller.md) `Accepted`；[Increment 13 Architecture Review](./INCREMENT_13_GIT_CONTROLLER_ARCHITECTURE_REVIEW.md) `Approved` |
| Parent goal | Agent Room Stage 3 — DAG Control Plane |
| Dispatch baseline | 用户已授权由本次提交把规划文档版本化到`main`；提交完成后从clean target `main`读取并记录live exact `HEAD`，再创建独立Coding task |
| 评审目标 | 交付typed GitAction、fixed-actor one-shot Git Controller与single-lineage `integration_only`闭环；不cutover active v0.3 runtime |

## 1. Confirmation boundary

用户于2026-09-02先确认Increment 13 Architecture Review §14三项架构决定，随后明确确认本Contract全文。本文件现为`Accepted`、`confirmed_by_user=true`，documented planning阶段进入`PLAN_READY`。该确认不自动授权Coding task创建、规划文档版本化、GitAction、push或runtime/database/binding cutover。

```yaml
task_id: increment-013-git-controller-integration-only
type: implementation
parent_task_id: null
based_on_review_id: null

background: >
  Increment 12 accepted并版本化的0.5-design source已经提供Plan、immutable TaskGraphRevision、exact
  revision Approval、structured write scope、NodeDispatch、deterministic one-shot Scheduler、atomic claim和
  per_task acceptance，但不包含GitAction、Git mutation、managed worktree或integration_only。Stage 3与
  Increment 13 Architecture Review已经确认：Git write只由fixed local-runner git_controller通过one-shot
  room:git CLI执行；每个operation先形成typed preview，再由codex-app planner记录用户对exact preview的
  Approval，最后至多执行一次并durable settle；integration_only首版只允许single fast-forward lineage。

goal: >
  在accepted Increment 12 state owner上交付Stage 3 Git闭环：为create_worktree、commit_paths和
  integrate_fast_forward建立typed GitAction preview、用户Approval、single execution与crash settlement；
  由fixed local-runner Git Controller管理worktree/commit/ff-only side effect，并让single-lineage
  integration_only graph依次完成component Review、policy acceptance、commit gate、terminal Integration
  Review/用户acceptance及最终fast-forward，且通过真实临时repository、SQLite/MCP/CLI/Plugin public path、
  并发和独立Oracle证明stale、rejected、failed或unknown action不会重放、越权或提前完成Plan。

requirements:
  - 保持target protocol exact为`0.5-design`并扩展fresh v0.5 schema；active v0.3 database/binding不迁移、不写入、不cutover，v0.2/v0.4 database不增加compatibility path。
  - 新增operation-discriminated `GitAction` entity。公共字段至少包含git_action_id、room_id、revision_id、node_id、operation、status、frozen git_controller_participant_id、preview_event_sequence、nullable approval_id、created_at、settled_at与typed result；同一ID的union arm不得由nullable字段任意拼接。
  - `GitAction.status`只允许`previewed|approved|executing|succeeded|failed|outcome_unknown`。rejected Approval保留action=`previewed`但永久不可执行；后续操作必须fresh git_action_id和fresh preview。
  - `GitAction.result`至少保存nullable command_exit_code、resulting_commit_id、message和post-operation live Git evidence。resulting commit ID只作historical evidence，不参与后续validator、cursor或precondition。
  - 将generic Approval的target_type扩展为`task_graph_revision|git_action_preview`；Git action Approval保持immutable terminal decision、exact target和`confirmed_by_user=true`，不得复用revision Approval ID或直接修改action preview payload。
  - 新增`room_decide_git_action` planner MCP command。只有enabled current planner、same-project/same-Room target且`confirmed_by_user=true`可决定；成功创建Approval、写`git_action_approved|git_action_rejected` Event，并在approved时把action推进到`approved`，不执行Git process。
  - preview transaction写`git_action_previewed` Event并把该Event exact sequence保存为preview_event_sequence。decision只在Room current cursor等于该sequence时成功；execute reserve只在Room current cursor等于exact approval Event sequence时成功。任何插入Event返回`git_preview_stale`且零Git mutation。
  - preview与execute均使用existing read-only Git Observer/repository query观察operation要求的canonical worktree、branch和staged/unstaged/untracked facts。execute必须先完成read-only reobservation，再在reservation transaction内同时校验cursor/Approval/action与observed structured facts；变化返回`git_preview_stale`，action/snapshot不变且零process。不得增加hash、fingerprint、commit-head precondition、branch mirror或timestamp token。
  - `create_worktree` preview exact字段为repository_root、source_ref、new_branch、worktree_path和preview_event_sequence。preview要求source_ref可解析、new_branch不存在、path不存在且未被Git worktree占用；execute只允许argument-array等价`git worktree add -b <new_branch> <worktree_path> <source_ref>`。
  - `create_worktree`只能服务于current approved revision的eligible managed NodeDispatch；成功后只读确认new worktree canonical repository/branch，将canonical path冻结到dispatch并推进`awaiting_git -> ready`。失败保留现场，不切换、删除或清理任何worktree/branch。
  - `commit_paths` preview exact字段为repository_root、worktree_path、branch、paths、commit_message、Git evidence和preview_event_sequence。paths必须是非空、unique、repo-relative集合，并exact等于live staged/unstaged/untracked union；每个path必须属于该NodeDispatch declared write_scopes。
  - `commit_paths` message必须符合项目Conventional Commits `<type>(<scope>): <description>`或无scope标准形式；只执行fixed `git add -- <exact paths>`后一次non-amend `git commit -m <message>`。不得接受任意pathspec、arbitrary argv、shell string或额外Git option。
  - `commit_paths`成功要求live staged/unstaged/untracked为空，保存new commit ID并满足dispatch commit gate。若stage成功而commit失败，action=`failed`并保存exit/stderr摘要与live evidence；index/worktree保持现场，不reset、cleanup或自动retry。
  - `integrate_fast_forward` preview exact字段为repository_root、source_branch、target_branch、target_worktree_path、clean Git evidence和preview_event_sequence。source/target属于同一repository，target branch必须在exact target worktree checkout且clean。
  - `integrate_fast_forward`只允许在target worktree执行argument-array等价`git merge --ff-only <source_branch>`。成功记录target resulting commit ID；非零退出action=`failed`并保留branches/worktrees，不merge-commit、rebase、reset、cleanup或resolve conflict。
  - fixed Git actor为bootstrap `local-runner`：增加capability=`git_control`及room-scope active `git_controller` Assignment；planner/reviewer/worker/orchestrator或普通executor均不得调用mutation process。replacement/disabled/unassigned actor在process前以`actor_not_allowed`完整零写拒绝。
  - 新增one-shot `room:git preview|execute|reconcile` CLI/application boundary。preview只读Git并持久化intent；execute只处理exact approved action；reconcile只读观察遗留executing action并标记`outcome_unknown`，绝不启动Git process或猜测success/failure。
  - execute在SQLite transaction内原子reserve `approved -> executing`并写Event，transaction提交后才启动一次Git process；settlement另行transaction写`succeeded|failed`。并发execute或same-ID retry只能有一个reservation/process，loser返回existing state或stable terminal/conflict结果。
  - process在reserve后丢失ownership、进程重启或settlement缺失时，同一action不得重放。显式reconcile把仍为executing的action推进`outcome_unknown`；`failed|outcome_unknown|succeeded`均terminal。
  - 新增stable errors至少包括`git_preview_stale`、`git_action_not_approved`与`git_action_already_terminal`；invalid union/payload使用`validation_failed`，authority使用`actor_not_allowed`，scope/worktree/repository错误复用accepted stable error。所有pre-process failure均证明零Git mutation及完整durable snapshot rollback。
  - 将TaskGraphRevision acceptance_policy扩展为`per_task|integration_only`，node kind扩展为`task|integration`；policy与node kind冻结在immutable revision中。已有dispatch后不得amend acceptance_policy、integration node或已dispatch node ancestor关系。
  - 扩展one-shot reconcile materialization：eligible node有operator-provided existing worktree时保持Increment 12路径；未提供worktree时仍原子创建exact一组NodeDispatch/Task/Run，dispatch=`awaiting_git`且NodeDispatch与Run的worktree均为null。Draft/rejected/stale revision、dependency未满足或scope blocked时不得创建awaiting_git entity。
  - `integration_only` revision decision前必须验证exact一个terminal `kind=integration` node，所有其它node都能到达该node，且所有non-integration node在dependency reachability上形成全序。unordered component或parallel fan-in以`validation_failed`完整零写拒绝。
  - single lineage managed worktree顺序固定：首个component的source_ref由exact create_worktree preview供用户确认；每个下游component只能在上游successful commit_paths后，以该action冻结的named branch作为source_ref；terminal integration worktree从最后一个component的successful commit branch创建。只比较durable branch reference与live structured facts，不把historical resulting commit ID升级为validator。不得从共同旧base并行创建候选branch后再fan-in。
  - `NodeDispatch.status`扩展为`awaiting_git|waiting|ready|dispatched|blocked|completed`。无worktree的eligible node在create_worktree成功前为awaiting_git；create settlement必须在同一SQLite transaction把canonical worktree冻结到NodeDispatch与associated Run并推进ready。integration_only component在Run policy-accepted但commit未成功时再次进入awaiting_git；successful commit后completed并允许下游reconcile。
  - integration_only non-integration Run仍必须先产生Review=`approved`。`room_reconcile_plan`观察current approved Review后，按revision预授权policy把Run转为accepted并让dispatch等待commit；Reviewer rejected/needs_decision、scope blocked或非terminal attempt不得触发policy acceptance。
  - non-integration component必须具有非空in-scope live evidence并完成successful commit_paths；空evidence不伪造no-op commit，保持awaiting_git并由operator返回Task/Fix处理。terminal integration node在用户接受后若worktree dirty则必须successful commit_paths；若clean则derived commit gate直接满足且不创建empty GitAction。
  - terminal integration Run继续使用existing Review与用户显式acceptance path；policy不得自动接受integration Run。其Run未accepted、worktree commit gate未满足或final integrate_fast_forward未succeeded时，derived Plan completion必须为false。
  - Plan completion只由terminal integration Run accepted、terminal commit gate satisfied及面向用户确认target branch的exact final GitAction succeeded共同推导；不得新增mutable Plan status或integration-completed Event覆盖事实owner。
  - `room_reconcile_plan`继续是explicit one-shot orchestrator command，只投影policy acceptance、Git waiting reason与next eligible materialization；它不执行Git、启动Agent、自动决定Approval或循环poll。
  - snapshot新增Room-filtered GitActions、Approval references、typed preview/result、Git waiting reason、commit gate与derived Plan completion；稳定排序按Event/entity identity，Event只保存reference/summary，不复制Diff、patch、stderr全文或完整preview。
  - 至少新增`git_action_previewed`、`git_action_approved|rejected`、`git_action_executing`、`git_action_succeeded|failed|outcome_unknown` Event。GitAction与NodeDispatch settlement必须在同一SQLite transaction内更新对应durable projection和Event。
  - `room:git` CLI每次只执行一个action并以durable result退出；Plugin Skill必须先展示exact preview、请求用户确认、经planner decision后再请求一次host execution approval，至多调用execute一次并重新读取Room state。approval拒绝或tool approval拒绝时零execute invocation。
  - setup helper、project binding/reference和packaging只声明candidate v0.5 Git Controller能力；不修改active project `.agent-room/runtime.json`、global config或installed Plugin。future fresh v0.5 setup应生成local-runner git_control capability与git_controller assignment。
  - 所有preview/decision/execute/reconcile/policy path覆盖valid、invalid、same-ID same-content retry、same-ID different-content、wrong room/revision/node/action membership、stale cursor/facts、disabled/replaced actor、concurrent reservation及完整public snapshot rollback。

non_goals:
  - push、fetch、pull、remote tracking mutation、merge commit、cherry-pick、rebase、reset、clean、checkout、branch/worktree删除、force、amend或自动冲突解决。
  - arbitrary Git subcommand、arbitrary argv、shell execution、generic command runner public API、caller-provided executable或unbounded pathspec。
  - parallel branch fan-in、multiple integration nodes、cross-repository integration、cross-Room/global Git Controller或多active Plan lineage。
  - automatic Agent/Codex/Claude launch、background Scheduler/Git daemon、polling queue、automatic retry/Fix/Review/acceptance/cleanup。
  - baseline/file hash、Diff fingerprint、commit hash precondition、branch mirror、saved patch、timestamp validator或checksum。
  - 把Git mutation authority赋给codex-app、planner、reviewer、worker、orchestrator或普通executor；新增第二project MCP endpoint。
  - 改写Stage 2 Run/RunAttempt/Review terminal evidence owner，或用GitAction复制Task/Run/Review decision。
  - active v0.3→v0.5 runtime/database/binding cutover、旧database处理、Plugin reinstall或actual installed-Plugin consumer evaluation。
  - new WorkerAdapter/provider、model router、Chat、Cockpit、SSE、GitHub、remote CI/CD或Stage 4–6能力。
  - 修改AGENTS.md、CLAUDE.md、global Codex config、host approval policy、Plugin marketplace identity或package dependency/lockfile。

architecture_decisions:
  - 用户已确认fixed local-runner actor的one-shot room:git CLI；codex-app只记录planner/user decision，不持有Git mutation authority。
  - 用户已确认integration_only首版只支持single fast-forward lineage；parallel scheduling仍仅属于per_task，不扩展Git allowlist。
  - 用户已确认完整Contract后使用独立Codex worktree task gpt-5.6-sol/medium Coding，active v0.3保持不cutover；task创建仍需独立授权。
  - GitAction preview、Approval、execution reservation与settlement是四个独立事实；Git process永不在SQLite transaction内运行，crash gap由outcome_unknown表达。
  - Room cursor检测协作事实变化，structured live Git evidence检测worktree/branch/path-set变化；不恢复hash或commit precondition。
  - integration_only复用existing Run/Review acceptance owner；Graph拥有policy/readiness，GitAction拥有外部side effect，Plan completion保持derived。
  - exact allowlist固定为create_worktree、commit_paths、integrate_fast_forward；首版不通过隐藏helper引入其它write operation。

scope:
  - src/protocol/schema.ts与errors.ts的GitAction union、Approval target、integration policy/node kind、NodeDispatch/Event/result/error contract
  - src/room/repository.ts、room-service.ts、state-snapshot.ts与必要state-machine wiring的preview/decision/reservation/settlement/policy/derived completion transaction
  - src/scheduler/plan-scheduler.ts的single-lineage validation、integration_only projection与Git gate eligibility
  - new src/git/git-controller.ts及existing src/git/git-process.ts/read-only Observer的最小fixed operation integration
  - new src/cli/git.ts、package.json room:git script、src/mcp/tools.ts room_decide_git_action及src/cli/status.ts Git waiting view
  - plugins/agent-room/skills/agent-room/SKILL.md、plugins/agent-room/skills/agent-room/scripts/setup-project.ts与plugins/agent-room/skills/agent-room/references/project-setup.md的manual Git workflow、v0.5 actor capability/assignment和candidate binding reference
  - tests/protocol.test.ts、room-service.test.ts、room-state-snapshot.test.ts、plan-scheduler.test.ts、room-mcp.test.ts、status-cli.test.ts、plugin-setup.test.ts、plugin-packaging.test.ts、e2e-workflow.test.ts、multi-project-e2e.test.ts与scope.test.ts
  - new tests/git-controller.test.ts、tests/git-controller-cli.test.ts及必要test-only temporary repository/concurrency fixture
  - docs/documents/ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、OPERATIONS.md、DEVELOPMENT_LOG.md与ADR-0006的Candidate/Review Required事实
  - 不修改active .agent-room/runtime.json、AGENTS.md、CLAUDE.md、global config、package-lock.json或src/runner provider/process/stream transport

constraints:
  - Coding不得在当前dirty root继续叠加。用户完整确认后先由Codex维护Contract状态；规划文档版本化必须另获Git授权，Coding task再从clean versioned main的live exact HEAD创建独立worktree并记录baseline。
  - Coding task使用saved project`codex-claudecode-room`，model=`gpt-5.6-sol`、thinking=`medium`；创建task仍需用户独立授权，且完整注入Accepted Contract，不使用摘要。
  - Coding task不得commit、push、merge、rebase、reset、clean、checkout、创建/删除真实开发branch/worktree、启动Claude/Agent Room Run或执行runtime/database/binding cutover。测试只可在test-owned temporary repositories执行allowlisted Git mutations。
  - 不新增runtime dependency。若existing Zod、Node、SQLite、MCP、Git Observer与execFile argument-array boundary不足，停止并返回`needs_decision`。
  - Git mutation implementation只允许位于exact Git Controller/process boundary；Scheduler、Room service、MCP和Plugin不得直接spawn Git write command。
  - Test Oracle必须使用测试侧literal expected argv、repository refs/index/worktree state、snapshot与event sequence；不得导入production operation grammar、validator、sort helper或allowed-scope collection生成期望。
  - Candidate文档只写`Candidate / Review Required`；Review、用户接受、版本化与v0.5 cutover前不得标记Current。

acceptance_criteria:
  - 三种operation的strict union对valid payload通过，对cross-arm字段、missing/extra字段、arbitrary command/argv/pathspec和empty commit paths在任何写入前拒绝。
  - valid preview只产生GitAction和preview Event，repository refs/index/worktrees/working tree逐项不变；same-ID same-content retry不重复Event，different-content为id_conflict。
  - reconcile对eligible missing-worktree node恰好物化一组awaiting_git NodeDispatch/Task/Run；successful create_worktree settlement原子绑定Dispatch与Run canonical path并推进ready，failed action不绑定二者，crash gap保持executing/outcome_unknown且不猜测binding。
  - unapproved、rejected、stale-cursor、stale-Git-facts、wrong actor和scope-violated action均在process前失败，完整public durable snapshot与real repository state不变。
  - 两个SQLite connection并发execute同一approved action恰好一个获得reservation并启动一个process；retry、terminal action与reconcile均不产生第二次Git mutation。
  - real temporary repository证明create_worktree创建exact branch/path并冻结canonical dispatch path；branch/path已存在或Git failure不删除、切换或清理其它worktree。
  - real temporary repository证明commit_paths只stage/commit exact preview union并产生Conventional Commit；stage-success/commit-failure保留partial index与live evidence、不reset，successful action记录historical commit ID且worktree clean。
  - real temporary repository证明integrate_fast_forward只在clean exact target执行ff-only；可达lineage成功，diverged history失败且无merge commit/rebase/reset/cleanup side effect。
  - process ownership丢失后的explicit reconcile只把executing action标为outcome_unknown；同一action永不自动重放，operator只能以fresh ID重新preview。
  - integration_only只接受exact一个terminal integration node和component total order；parallel fan-in、missing/multiple/nonterminal integration node及post-dispatch policy/ancestry amendment完整零写拒绝。
  - component只有Review approved后才policy-accepted，successful non-empty commit_paths后才completed并解锁下游；rejected/needs_decision/blocked/failed/unknown action均不解锁。
  - terminal Integration Run必须沿existing Review和用户acceptance path；dirty terminal worktree必须commit，clean terminal worktree无需empty action；final ff succeeded前derived Plan completion始终false。
  - MCP、Status CLI与Plugin从同一snapshot展示exact preview、decision、Git waiting reason、result和derived completion；Plugin无自动decision、execute、retry、cleanup或launcher调用。
  - active `.agent-room/runtime.json`仍为v0.3且bytes不变；production/static scope中不存在banned Git operation、hash replacement、second MCP endpoint、background execution、new dependency或Stage 4–6能力。

verification:
  - command: npm run typecheck
    detects: GitAction union、Approval target、integration policy、NodeDispatch、Room transaction、MCP/CLI/Plugin wiring的type contract漂移。
    decision_if_failed: 修复task-owned类型；不得使用any、ts-ignore、skipLibCheck或compatibility wrapper。
  - command: node --test "tests/protocol.test.ts" "tests/room-service.test.ts" "tests/room-state-snapshot.test.ts"
    detects: strict schema、preview/decision/reservation/settlement、cursor/idempotency/authority、Event与完整snapshot rollback错误。
    decision_if_failed: 修复最窄protocol/application/repository owner；不得把Git process放入transaction或新增mutable Plan status。
  - command: node --test "tests/git-controller.test.ts" "tests/git-controller-cli.test.ts"
    detects: fixed argv、real create/commit/ff-only side effect、single reservation、partial failure、crash reconcile、terminal no-replay和CLI one-shot错误。
    decision_if_failed: 修复Git Controller/process boundary；不得放宽allowlist、自动清理或以mock替代real repository Oracle。
  - command: node --test "tests/plan-scheduler.test.ts" "tests/execution-core.test.ts"
    detects: single-lineage graph validation、policy acceptance、commit/dependency gate、scope/concurrency与derived Plan completion错误。
    decision_if_failed: 修复Scheduler projection或existing transaction owner；不得支持parallel fan-in或复制Run/Review state。
  - command: node --test "tests/room-mcp.test.ts" "tests/status-cli.test.ts" "tests/e2e-workflow.test.ts"
    detects: planner decision、Git waiting read model、component-to-integration public lifecycle及final ff completion没有通过真实public route。
    decision_if_failed: 修复public adapter/wiring；不得以service-only test代替MCP/CLI/E2E evidence。
  - command: node --test "tests/plugin-setup.test.ts" "tests/plugin-packaging.test.ts" "tests/multi-project-e2e.test.ts"
    detects: local-runner capability/assignment、manual preview-confirm-execute Skill、project isolation、active binding drift或automatic invocation越界。
    decision_if_failed: 修复setup/Plugin consumer；不得修改active binding、增加第二MCP endpoint或自动副作用。
  - command: node --test "tests/scope.test.ts"
    detects: Git mutation逃出exact controller boundary、banned command/hash/new dependency/global config/AGENTS/CLAUDE或未批准文件进入Diff。
    decision_if_failed: 删除越界修改；正确实现必须扩大scope时返回needs_decision。
  - command: npm test
    detects: focused suite未进入full regression，Increment 1–12 identity、Execution Core、Scheduler、Git Observer、Plugin/setup与one-shot Runner语义回归。
    decision_if_failed: 只修复task-owned regression；不得放宽既有independent Oracle。
  - command: git diff --check
    detects: whitespace error、unresolved patch formatting或文档/code diff损坏。
    decision_if_failed: 修复task-owned formatting；不得格式化无关文件。

documentation_updates:
  - path: docs/documents/ARCHITECTURE.md
    expected_change: Candidate Git Controller component、fixed actor/process boundary、single-lineage integration flow与dependency direction。
  - path: docs/documents/ROOM_PROTOCOL.md
    expected_change: Candidate GitAction/Approval union、commands、status/Event/cursor/idempotency/failure/snapshot与integration_only exact contract。
  - path: docs/documents/MVP_PLAN.md
    expected_change: Increment 13 Candidate/Review Required进度、验收、非目标及Stage 3 cutover gate。
  - path: docs/documents/OPERATIONS.md
    expected_change: manual room:git preview/decision/execute/reconcile runbook、Git waiting/outcome_unknown与no-cleanup recovery边界。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: exact dispatch baseline、Coding Result、changed files、verification、deviation、questions与Candidate状态。
  - path: docs/documents/ADR/0006-stage-3-dag-control-plane-and-git-controller.md
    expected_change: 只追加Increment 13 Candidate实现事实，不改变Accepted decision或提前声明runtime Current。

question_policy: >
  如果正确实现需要扩大Git allowlist、parallel fan-in、merge commit/cherry-pick/rebase/reset/cleanup、arbitrary
  argv/shell、hash/fingerprint/commit precondition、第二MCP endpoint、把Git authority赋给codex-app、automatic
  process/retry/acceptance、new dependency/provider、active runtime cutover、修改AGENTS/CLAUDE/global config或改变已确认
  三项Architecture Decision，停止受影响工作并返回needs_decision。局部type/helper/index/test fixture名称和文档段落位置
  可按existing style作最小选择，但必须在Coding Result记录且不得改变observable contract。

confirmed_by_user: true
created_by: codex
created_at: 2026-09-02T00:00:00Z
```

## 2. Dispatch prerequisites

1. 已完成：Stage 3总体Architecture Decision、ADR-0006及Increment 13三项细化Decision已获用户确认；Increment 13 Architecture Review=`Approved`。
2. 已完成：用户明确确认本Contract全文；文档为`Accepted`、`confirmed_by_user=true`，阶段=`PLAN_READY`。该确认未自动创建Coding task。
3. 已授权：把Increment 13规划/Contract文档由本次提交形成clean versioned `main` baseline；提交前重新核对task-owned Diff，提交后读取live exact HEAD。
4. 已授权：从该clean baseline和saved project`codex-claudecode-room`创建Codex worktree task，model=`gpt-5.6-sol`、thinking=`medium`，完整注入Accepted Contract，不使用摘要。
5. Coding task不映射到terminal active v0.3 Room，不启动Claude或Agent Room Run，不执行真实project GitAction、commit/push或runtime/database/binding cutover；real Git mutation tests仅限test-owned temporary repositories。
6. fresh v0.5 setup/cutover与actual installed-Plugin consumer evaluation只有Increment 13完成Review、用户接受、source版本化且另获授权后才可执行。
