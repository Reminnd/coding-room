# Increment 12 Fix Task 1 — Current Revision、Scope Recovery 与 Frozen Authority

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（由用户人工派发；不通过 Agent Room 或 Codex task 启动） |
| 创建与确认日期 | 2026-09-01 |
| Based on Review | `review-increment-012-codex-001`（`changes_requested`） |
| Parent Contract | [Increment 12 Task Contract](./INCREMENT_12_TASK_CONTRACT.md) |
| Lineage baseline | `51c9a50c83064fb9e2e4cc83e2f3942e4e06e5ae` |
| Candidate worktree | `C:/Users/RM/.codex/worktrees/a1da/codex-claudecode-room`（detached；保留完整 Increment 12 task-owned Diff） |

## 1. Accepted boundary

用户已确认 Review 1 的五项代码 finding、候选文档证据 finding 与本文件冻结的推荐方案。本 Fix 只闭合 exact latest revision、current concurrency、scope violation recovery、dispatched worker freeze、new entity same-ID retry authority及候选文档证据一致性；不得扩大 Increment 12、实现 Increment 13 或执行任何 Git/runtime 写操作。

```yaml
task_id: increment-012-dag-scheduler-foundation-fix-001
type: fix
parent_task_id: increment-012-dag-scheduler-foundation
based_on_review_id: review-increment-012-codex-001
review_fixes_only: true

background: >
  Increment 12 candidate从exact baseline 51c9a50c83064fb9e2e4cc83e2f3942e4e06e5ae形成于
  detached independent worktree。Codex独立Review覆盖24个tracked logical changes与2个untracked
  files；typecheck、受影响96/96与full 367/367 tests、git diff --check均通过，且未发现dependency、
  Git mutation、hash/fingerprint validator、GitAction或integration_only越界。但测试Oracle遗漏或
  固化了五项可达错误：newer Draft/rejected后旧approved revision仍可执行；Amendment收紧
  concurrency后claim仍使用dispatch source revision的limit；scope violation可被acceptance覆盖并
  解锁descendant；worker assignment replacement使immutable dispatched node无法进入合法Amendment；
  Plan/Revision/Approval same-ID retry未按stored frozen identity授权。原Coding task因usage limit结束，
  未返回结构化Coding Result，候选Development Log却把自述记录为Coding Result。

goal: >
  仅修复review-increment-012-codex-001确认的current revision、concurrency、scope recovery、
  replacement freeze、same-ID retry authority与候选文档证据问题，使Scheduler和Executor在完整
  public lifecycle中严格消费exact latest approved revision，blocked node只有经成功且完全in-scope的
  Fix attempt才可恢复，既有dispatch与entity retry继续遵循frozen identity，并以独立Oracle证明零
  partial write和无Increment 13/Git/hash范围扩张。

confirmed_findings:
  - finding_id: inc12-r1-stale-approved-revision
    severity: high
    evidence: >
      repository.latestApprovedTaskGraphRevision选择revision_no最大的approved row；当revision-1已approved、
      revision-2为Draft或rejected时，reconcilePlan与assertGraphClaim仍消费revision-1。candidate test还
      直接断言newer Draft存在时reconcile返回revision-1。
    confirmed_solution: >
      先读取Plan exact latest revision，再只在该revision的terminal decision exact为approved时把它作为
      current approved revision；Draft或rejected时不得回退旧approved。reconcile返回零new materialization，
      旧dispatch的新claim返回plan_revision_not_approved；历史entity/Event保持可读，不新增mutable pointer。
  - finding_id: inc12-r1-scope-violation-acceptance-bypass
    severity: high
    evidence: >
      settle可把NodeDispatch标记blocked/scope_violated，但acceptReview无条件写completed，dependency
      readiness又只检查Run accepted，因此越界node可经无blocker Review与用户acceptance解锁descendant。
    confirmed_solution: >
      blocked/scope_violated dispatch不得accept或满足dependency。只有同一Run中经用户确认的后续Fix
      attempt以succeeded结算，且其完整live staged/unstaged/untracked evidence全部属于原node declared
      scopes时，才在同一settlement transaction清除current blocked projection并恢复为dispatched；历史
      node_scope_violated Event保留，不增加新Event type。随后仍需正常Review与用户acceptance才可completed。
  - finding_id: inc12-r1-stale-concurrency-limit
    severity: high
    evidence: >
      assertGraphClaim使用dispatch source revision的concurrency_limit，同时使用latest revision的currentNode；
      revision-1 limit=3已dispatch A/B、revision-2保留A/B并收紧limit=1后，A/B仍可同时claim。
    confirmed_solution: >
      approved-revision、node、scope与concurrency gate必须统一使用同一exact current approved revision；
      Amendment后的真实双连接claim直接证明收紧limit不会被历史dispatch绕过。
  - finding_id: inc12-r1-dispatched-worker-replacement-freeze
    severity: medium
    evidence: >
      create/approve/reconcile对revision所有node要求worker_assignment_id仍是current active assignment；
      assignment replacement后，已dispatch node既不能保留旧assignment，也不能在Amendment中修改它，
      因而Plan lineage无法继续。
    confirmed_solution: >
      已dispatch inherited node只验证immutable node、frozen assignment/Run一致性与compatible historical
      identity，不要求旧assignment仍active；尚未dispatch或新增node继续要求exact current active assignment。
      replacement只路由future materialization，不改写既有Run的worker freeze。
  - finding_id: inc12-r1-new-entity-retry-authority
    severity: medium
    evidence: >
      Plan existing retry同时要求current assignment与stored creator，replacement后无合法caller；Revision与
      Approval existing retry则允许current replacement planner重放old creator/planner entity。三者均不符合
      existing entity frozen retry invariant。
    confirmed_solution: >
      Plan、TaskGraphRevision与Approval existing分支先按stored creator/planner participant与required role
      认证，再比较normalized caller-owned content；enabled frozen identity的same-content retry返回existing/
      created=false且零Event，different content为id_conflict，replacement/unknown/disabled/wrong-role拒绝。
      只有new entity创建消费current assignment。
  - finding_id: inc12-r1-coding-result-provenance
    severity: low
    evidence: >
      原Coding task没有返回结构化Coding Result，但candidate DEVELOPMENT_LOG把该段标题和整组verification
      写成Increment 12 Coding Result。
    confirmed_solution: >
      把原段落改为candidate implementation facts并明确结构化Coding Result缺失；只把Codex独立Review实际
      运行的typecheck、focused 96/96、full 367/367与diff check写成独立证据。Fix完成后另行返回合法完整
      Coding Result，不补造或倒填原结果。

requirements:
  - 只修复上述confirmed findings；`review_fixes_only`。每个changed line必须能追溯到finding或direct regression。
  - current approved revision MUST由existing immutable revision、Approval与既有顺序事实推导；不得新增current pointer、mutable approval state、cache、hash、fingerprint或migration。
  - `room_reconcile_plan`遇到latest Draft或rejected revision时 MUST返回该Plan无new materialization结果；不得读取旧approved revision创建Task/Run/Dispatch/Event。
  - latest Draft或rejected存在时，旧revision的ready/failed/canceled Run发起new claim MUST返回`plan_revision_not_approved`，且Attempt、Run、NodeDispatch、Event与完整public snapshot不变。已经active的Attempt settlement不由本Fix追溯取消。
  - latest exact revision approved后，reconcile与claim MUST统一使用该revision的nodes、dependencies、write_scopes与`concurrency_limit`；不得混用dispatch source revision的limit。
  - Amendment把limit从3收紧为1并保留两个已dispatch immutable nodes时，两个独立SQLite connection同时claim MUST恰好一个成功，loser为`concurrency_limit_reached`且零Attempt/Event残留。
  - `scope_violated=true`或NodeDispatch=`blocked`时，`acceptReview` MUST在写Run/Dispatch/Event前拒绝，且该node不得被dependency readiness视为完成。
  - blocked node的后续Fix仍沿用existing Review/Fix/Run lineage。只有successful Fix attempt的完整current live evidence全部in-scope时才清除`scope_violated`并把dispatch恢复为`dispatched`；failed/interrupted/needs_decision、仍含任意out-of-scope path或非Fix attempt均不得清除。
  - scope恢复使用existing attempt terminal Event作为审计事实，不新增`node_scope_cleared`或其它Event type；原`node_scope_violated` Event不可删除或改写。
  - dependency eligibility MUST同时要求dependency Run=`accepted`、对应NodeDispatch=`completed`且`scope_violated=false`；snapshot与Scheduler使用同一权威语义，但测试期望不得从production helper生成。
  - Amendment validation MUST先识别lineage inherited dispatch。已dispatch node保留old exact worker_assignment_id与frozen Run worker，assignment replacement不阻止创建/批准合法new revision；new/undispatched node继续要求current active compatible assignment。
  - Plan、TaskGraphRevision、Approval的existing same-ID retry MUST使用stored creator/planner frozen identity；新entity继续解析current assignment。authority失败与content conflict均在同一transaction内零write。
  - public MCP direct regressions MUST覆盖Plan/Revision/Approval frozen retry的same-content、different-content、replacement、disabled/re-enable与wrong-role代表路径；不得只测private helper或repository。
  - 修正candidate `tests/plan-scheduler.test.ts`中把newer Draft继续使用旧approved revision写成成功的Oracle；新增latest Draft、rejected、amendment concurrency、scope blocked/恢复、assignment replacement与retry authority回归。
  - 保留全部既有positive graph、MCP、Status、Plugin/setup、Execution Core与SQLite race assertions；不得删除、skip、todo或弱化无关测试。
  - candidate文档只记录`Fix Candidate / Review Required`；active runtime仍为v0.3，Increment 12未接受、未versioned、未cutover，Increment 13仍未开始。

non_goals:
  - 新schema field/table/index、mutable current pointer、新Event type、migration/backfill或历史entity/Event rewrite。
  - Git Controller、GitAction、managed worktree、`integration_only`、automatic acceptance、automatic reconcile/launch、background scheduler或Increment 13能力。
  - 任何hash/checksum/fingerprint、commit/HEAD validator、branch mirror、timestamp token或replacement validator。
  - 修改Git Observer production、Runner process/stream transport、package dependency/lockfile、Plugin marketplace identity、AGENTS.md、CLAUDE.md或global config。
  - 自动接受Review、改变Reviewer finding severity规则、取消active Attempt或为scope recovery建立新lifecycle/state。
  - 启动Claude/Agent Room Run、创建Codex task、runtime/database/binding cutover、旧database处理或真实Plugin install/reload。
  - stage、commit、push、merge、rebase、reset、restore、clean、checkout、branch/worktree创建删除或任何其它Git write。

architecture_decisions:
  - Plan exact latest revision及其Approval是current execution authority；旧approved只是历史，不在newer Draft/rejected时回退为可执行current。
  - Graph claim的revision/node/scope/concurrency必须来自同一current approved snapshot；NodeDispatch source revision只保留历史materialization reference。
  - `scope_violated`是NodeDispatch current safety projection；历史violation由immutable Event保留。恢复只能由后续successful in-scope Fix attempt产生，仍须独立Review与用户acceptance。
  - assignment replacement只影响future entity。已dispatch node和Run保留frozen worker；new/undispatched node使用current assignment。
  - create retry与new command分流：existing entity使用stored frozen actor，new entity使用current assignment；content comparison继续复用repository normalized idempotency owner。

scope:
  - review_fixes_only
  - src/room/repository.ts、src/room/room-service.ts与src/room/state-snapshot.ts中的current revision、dependency、scope recovery、assignment及retry最窄逻辑
  - src/scheduler/plan-scheduler.ts only if pure eligibility must consume an explicit completed/non-violated dependency set
  - src/mcp/tools.ts only if existing tool wiring must expose corrected retry/rollback behavior；不得新增tool
  - tests/plan-scheduler.test.ts、tests/room-service.test.ts、tests/room-state-snapshot.test.ts、tests/room-mcp.test.ts、tests/execution-core.test.ts及必要existing fixture/SQLite worker
  - tests/status-cli.test.ts或tests/e2e-workflow.test.ts only if corrected snapshot/blocked lifecycle requires direct public consumer evidence
  - tests/scope.test.ts only for exact allowed-path update caused by this Fix；不得放宽module/dependency/non-goal boundary
  - docs/documents/ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、OPERATIONS.md、DEVELOPMENT_LOG.md与ADR/0006-stage-3-dag-control-plane-and-git-controller.md的Fix Candidate事实

constraints:
  - Work only in the original candidate worktree `C:/Users/RM/.codex/worktrees/a1da/codex-claudecode-room`; preserve its complete Increment 12 task-owned staged/unstaged/untracked Diff and exact lineage baseline `51c9a50c83064fb9e2e4cc83e2f3942e4e06e5ae`.
  - Candidate worktree is detached by original dispatch design。不得创建/切换branch或worktree，不得commit/stage/clean/reset/restore现有Diff。
  - 本Accepted Fix Contract位于主工作区 `D:/agent/case/codex-claudecode-room/docs/documents/INCREMENT_12_FIX_TASK_1.md`；人工派发必须完整注入本文，Claude不得以摘要替代或修改Contract。
  - 继续使用existing Node.js、SQLite、Zod、MCP与Git Observer；不新增dependency、package script、source module或通用framework。
  - Test Oracle使用测试侧literal revision/Approval/assignment/scope/error/status/full snapshot；不得从production current-revision、scope、sort、authority helper导出expected value。
  - 所有拒绝路径在现有`BEGIN IMMEDIATE`transaction内保持Room、Plan、Revision、Approval、Assignment、Dispatch、Task、Run、Attempt、Review、Question、Event与cursor完整不变。
  - 如direct regression证明finding事实或已确认方案不成立，返回证据并停止受影响修改；不得为了迎合Review制造行为。
  - 不重复运行不会改变完成决定的昂贵检查；最终必须运行本Contract列出的focused与full验证。

acceptance_criteria:
  - rev1 approved后创建rev2 Draft或rejected，reconcile均不创建new entity/Event；rev1旧Run new claim被`plan_revision_not_approved`零写入拒绝；snapshot显示latest revision不可执行。
  - rev2 exact approved后才重新允许其eligible node reconcile/claim，且历史dispatch reference正确复用，不产生duplicate。
  - rev1 limit=3已dispatch A/B、rev2 exact approved并收紧limit=1后，真实双连接并发claim恰好一个成功，loser稳定为`concurrency_limit_reached`且完整snapshot无partial residue。
  - out-of-scope success把dispatch置blocked；Review acceptance在blocked时零写入拒绝，descendant不能materialize。后续confirmed Fix attempt仍越界时保持blocked；全部in-scope success时恢复projection，经新Review与用户acceptance后才completed并解锁descendant。
  - worker assignment replacement后，合法Amendment可保留已dispatch A的old frozen assignment，并让new B使用replacement assignment；A/B的Run worker identity分别正确且claim authority不被互换。
  - Plan、Revision、Approval的frozen actor对same-ID/same-content retry返回existing/created=false且零Event；different content为id_conflict；replacement/disabled/wrong-role不能接管；new revision/decision继续使用current replacement actor。
  - MCP、snapshot、Status与Plugin描述不再把旧approved、blocked acceptance或stale concurrency暴露为合法人工下一步。
  - Development Log明确原结构化Coding Result缺失，并准确记录本Fix新Coding Result、actual changed files、verification、deviation与unresolved；候选仍为Review Required。
  - typecheck、focused suites、full npm test、scope与diff hygiene全部通过，零skip/todo，未引入Git/hash/Increment 13能力。

verification:
  - command: npm run typecheck
    detects: current revision、scope recovery、frozen authority与snapshot/MCP wiring的TypeScript contract drift。
    decision_if_failed: 修复最窄task-owned类型；不得使用any、ts-ignore、skipLibCheck、wrapper或new dependency。
  - command: node --test "tests/plan-scheduler.test.ts" "tests/room-service.test.ts" "tests/room-state-snapshot.test.ts" "tests/execution-core.test.ts"
    detects: stale revision fallback、amendment concurrency、blocked dependency、scope recovery、assignment freeze或transaction rollback错误。
    decision_if_failed: 修复existing repository/application/scheduler最窄owner；不得新增pointer、state、Event或framework。
  - command: node --test "tests/room-mcp.test.ts" "tests/status-cli.test.ts" "tests/e2e-workflow.test.ts"
    detects: new entity retry authority、latest revision、blocked lifecycle或snapshot consumer未经过public boundary闭合。
    decision_if_failed: 修复existing MCP/read-model wiring与direct Oracle；不得以service unit test替代public evidence。
  - command: node --test "tests/plugin-setup.test.ts" "tests/plugin-packaging.test.ts" "tests/multi-project-e2e.test.ts" "tests/scope.test.ts"
    detects: candidate文档/Plugin人工动作漂移、setup回归、cross-project泄漏、scope外module/dependency或Increment 13能力进入Diff。
    decision_if_failed: 只修复本Fix造成的Plugin/test/scope regression；正确修复必须扩大范围时返回needs_decision。
  - command: npm test
    detects: focused范围外的Stage 1/2 authority、Runner、Git Observer、Plugin/setup或historical MVP regression。
    decision_if_failed: 只修复task-owned regression；不得删除、skip或弱化既有Oracle。
  - command: rg -n "createHash|sha256|checksum|fingerprint|integration_only|GitAction|create_worktree|commit_paths|integrate_fast_forward" src plugins/agent-room/skills/agent-room tests
    detects: Fix重新引入hash/replacement validator或提前实现Increment 13能力。
    decision_if_failed: 删除Fix引入越界；若命中是既有明确negative test/文档literal，人工分类并记录，不机械删除。
  - command: git diff --check
    detects: whitespace、merge marker或patch hygiene错误。
    decision_if_failed: 只修复本Fix引入的格式问题，不格式化无关文件。
  - command: git status --short
    detects: staging、unexpected files、original candidate ownership或Fix scope漂移。
    decision_if_failed: 不执行Git写入或清理；报告unexpected ownership并返回needs_decision。

documentation_updates:
  - path: docs/documents/ARCHITECTURE.md
    expected_change: 记录Fix Candidate的exact latest revision、current concurrency、scope recovery与replacement freeze，不提升Current。
  - path: docs/documents/ROOM_PROTOCOL.md
    expected_change: 记录current revision推导、blocked acceptance/dependency、Fix recovery与Plan/Revision/Approval retry exact语义。
  - path: docs/documents/MVP_PLAN.md
    expected_change: 记录Review 1 changes_requested、Accepted Fix Task与Fix Candidate/Review Required门禁。
  - path: docs/documents/OPERATIONS.md
    expected_change: 记录latest Draft/rejected、blocked dispatch、scope recovery和manual next-action语义。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 更正原Coding Result provenance并记录Fix实际Diff、验证、deviation、questions与Candidate状态。
  - path: docs/documents/ADR/0006-stage-3-dag-control-plane-and-git-controller.md
    expected_change: 只追加已确认的Increment 12 Fix行为细化，不改变ADR Accepted decision或加入Increment 13能力。

question_policy: >
  如果正确修复需要new schema/table/index/current pointer/Event type、migration/backfill、Git mutation/GitAction/
  managed worktree、integration_only、automatic Agent launch、background scheduler、多active Plan、new provider/dependency、
  hash/fingerprint validator、Git Observer或Runner transport修改、AGENTS/CLAUDE/global config、runtime cutover、旧database
  处理或任何Git write，立即停止受影响工作并返回needs_decision。局部helper命名、existing transaction内guard
  顺序、test fixture组织与candidate文档段落位置可在本文冻结行为内作最小选择，并在Coding Result记录。

confirmed_by_user: true
created_by: codex
created_at: 2026-09-01T00:00:00Z
```

## 2. Manual dispatch boundary

- 用户选择人工派发给 Claude Code；Codex不启动Claude、不创建Codex task、不创建Agent Room Task/Run。
- Claude Code必须在原candidate worktree `C:/Users/RM/.codex/worktrees/a1da/codex-claudecode-room`继续，并完整读取本Contract、Parent Contract、`CLAUDE.md`、`PROJECT_RULES.md`及其强制路由文档。
- 原candidate worktree保持detached HEAD与完整task-owned Diff；Fix共享lineage baseline，不重新执行clean-worktree gate，不移动或复制candidate到clean `main`。
- Claude完成后只返回Candidate Coding Result并停止在`REVIEW_REQUIRED`；不得自我接受、stage、commit、push、cutover或清理。

## 3. Coding Result requirement

Claude Code最终输出必须包含：`task_id`、`status`、`summary`、`changed_files`、`deviations`、`verification`、`tests`、`documentation_changes`、`unresolved`和`questions`。`task_id`必须exact为`increment-012-dag-scheduler-foundation-fix-001`；完成状态只能表示Candidate可Review，不表示Fix或Increment已接受。
