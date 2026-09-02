# Increment 13 Fix Task 1 — GitAction Idempotency, Settlement and Lineage

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| Reader | 用户、原 Increment 13 Coding task、Codex Reviewer |
| 评审目标 | 执行 `review-increment-013-codex-001` 四项已确认 finding 的最小 Fix Contract |
| 生效范围 | Increment 13 candidate 的 Git Controller、single-lineage predecessor 与直接 regression evidence |
| Parent Task | `increment-013-git-controller-integration-only` |
| Based on Review | `review-increment-013-codex-001` |
| 执行状态 | Coding completed；Fix Review 2=`changes_requested` |
| 创建日期 | 2026-09-02 |

## 1. 已确认决定

用户已于 2026-09-02 确认 Review 1 的四项 finding 与对应最小方向：

1. `integration_only` worktree source必须由DAG reachability中的唯一maximal component predecessor决定，不得依赖`dependencies`数组顺序。
2. external Git mutation成功后的durable success settlement exception必须保留action=`executing`并等待显式reconcile，不得改写为`failed`。
3. existing same-ID preview必须先按frozen actor与caller-owned command content完成retry/conflict判定；不得先重新观察已经变化的live Git facts。
4. concurrent execute必须由两个independent SQLite connections对同一file-backed database提供直接证据。

这些决定不改变Accepted Increment 13 architecture、protocol schema、Git allowlist、fixed actor、runtime cutover边界或active v0.3状态。

## 2. Accepted Task Contract

```yaml
task_id: increment-013-git-controller-integration-only-fix-001
type: fix
parent_task_id: increment-013-git-controller-integration-only
based_on_review_id: review-increment-013-codex-001

background: >
  Increment 13 candidate从exact baseline c7b4c2db0095632194940df40b49e0788257f099
  完成Implementation Coding并通过typecheck与full 382/382。独立Review
  review-increment-013-codex-001确认三项implementation finding与一项verification finding：
  predecessor错误依赖dependencies数组末项；successful mutation后的settlement exception被catch为failed；
  delayed same-ID preview retry先重观测已变化Git facts；并发测试只使用一个in-memory SQLite connection。
  用户已确认四项finding与最小方案。

goal: >
  在不改变Increment 13 observable protocol与Git operation allowlist的前提下，修复GitAction
  preview idempotency、successful-mutation settlement crash gap和single-lineage predecessor选择，
  并以两个independent SQLite connections及直接public-path regression闭合四项confirmed findings。

confirmed_findings:
  - finding_id: inc13-r1-lineage-predecessor-order
    severity: high
    evidence: >
      src/room/room-service.ts validateGitPreviewForDispatch使用componentDependencies.at(-1)。
      合法total-order graph可使用reordered或redundant dependencies；例如A -> B -> I且
      I.dependencies=[B,A]仍通过reachability validator，但现实现选择A，允许integration
      worktree遗漏B committed branch。
    confirmed_solution: >
      复用existing dependencyAncestors/reachability事实，选择该node全部non-integration ancestors中
      唯一不再是其它component ancestor的maximal predecessor；结果必须与dependencies顺序无关。
      若不能得到唯一maximal predecessor则以validation_failed零写拒绝，不收窄schema或新增排序契约。
  - finding_id: inc13-r1-success-settlement-crash-gap
    severity: high
    evidence: >
      src/git/git-controller.ts execute的同一try/catch同时包围executeReserved与
      settleGitAction(status=succeeded)。Git mutation已经成功而success settlement抛错时，
      catch会尝试settle failed，形成与external fact相反的terminal状态。
    confirmed_solution: >
      只把Git execution/postcondition failure映射为failed；successful settlement调用移出该catch。
      success settlement exception原样传播并保持action=executing，之后只能由explicit reconcile
      推进outcome_unknown；不得自动重放mutation或猜测success/failure。
  - finding_id: inc13-r1-preview-retry-before-observation
    severity: medium
    evidence: >
      GitController.preview在authorizeGitActionPreview后仍无条件observeCommand，再由RoomService判定
      existing same-ID content。action执行后branch/path/evidence已经合法变化，相同caller command的
      delayed retry会失败或id_conflict，不能返回stored action created=false。
    confirmed_solution: >
      existing ID先按stored frozen controller authority与caller-owned command fields判断same-content或
      different-content；same-content直接返回existing/created=false且零observer/Event，different-content
      返回id_conflict且零observer/Event。只有new ID执行live Git observation与preview persistence。
  - finding_id: inc13-r1-two-connection-reservation-evidence
    severity: medium
    evidence: >
      tests/git-controller.test.ts的concurrent execute测试共享一个RoomService和
      DatabaseSync(':memory:')，未覆盖Accepted Contract要求的两个SQLite connections。
    confirmed_solution: >
      使用一个test-owned file-backed database与两个independent DatabaseSync/RoomService/
      GitController instances，同时竞争同一approved action；断言exact一个reservation/process，
      loser得到stable domain result，完整durable state无partial write。

requirements:
  - 只修复上述四项confirmed findings；review_fixes_only。
  - existing same-ID preview gate MUST 位于任何Git observer/process invocation之前，并继续要求stored frozen git_controller identity active且拥有current room-scope assignment。
  - preview same-content MUST 只比较caller-owned command intent的normalized exact fields；stored live evidence与preview_event_sequence不得因后续合法mutation变化而把retry变成conflict。
  - preview different-content、disabled/replaced/wrong actor MUST 分别保持id_conflict或actor_not_allowed，并证明observer零调用、Room/entity/Event/cursor完整不变。
  - new preview MUST 保持现有read-only observation、strict operation union、scope/dispatch/current revision validation与preview Event语义。
  - execute MUST 只把executeReserved或其postcondition failure持久化为failed；successful settlement exception MUST 保留executing且不得进入failed settlement branch。
  - explicit reconcile MUST 继续只读观察executing action并写outcome_unknown；settlement exception后重试execute MUST 不启动第二个mutation process。
  - integration_only predecessor MUST 由revision graph reachability唯一推导，与node.dependencies和revision.nodes数组顺序无关；不得增加caller-provided predecessor、mutable pointer或schema字段。
  - two-connection regression MUST 使用同一test-owned file-backed database的两个independent connections，不得用同一service、同一connection或production helper生成expected winner/process Oracle。
  - regression MUST 覆盖reordered/redundant dependency graph、successful create_worktree后的same-ID preview retry、successful commit_paths后的same-ID preview retry、different-content conflict、success settlement fault以及cross-connection reservation。
  - 每个invalid/retry/fault path MUST 直接核对process/observer invocation、完整public durable snapshot及Event sequence；不能只断言error code。
  - candidate文档继续保持Candidate / Review Required；只按actual Fix lifecycle更新DEVELOPMENT_LOG，不得标记Accepted、Current、versioned或cutover。

non_goals:
  - 新Git operation、parallel fan-in、merge commit、cherry-pick、rebase、reset、clean、cleanup、automatic retry或arbitrary argv/shell。
  - 修改GitAction/Approval/Event/schema/error的observable shape，新增migration、pointer、hash、fingerprint、commit precondition或dependency。
  - 放宽fixed local-runner authority、把Git mutation交给codex-app/planner/reviewer/worker/orchestrator或普通executor。
  - 修改MCP tool surface、Status snapshot shape、Plugin workflow、setup/binding format、active runtime/database或protocol cutover。
  - 重构无关Room lifecycle、Scheduler、repository、Git process/observer、tests或文档；修复既有无关问题。
  - stage、commit、push、merge、rebase、reset、restore、clean、checkout或创建/删除真实branch/worktree。

architecture_decisions:
  - idempotency owner是durable GitAction与caller-owned frozen command intent；live Git observer只服务new preview和approved execute前的stale-facts验证。
  - external Git effect与durable settlement是两个failure boundary；success settlement缺失由executing/outcome_unknown表达，不通过failed伪造external outcome。
  - single-lineage predecessor是DAG reachability的唯一maximal component ancestor，不是JSON数组位置。
  - cross-connection serialization继续由existing BEGIN IMMEDIATE transaction与conditional status update负责；本Fix只补真实direct evidence，不新增lock abstraction。

scope:
  - src/git/git-controller.ts
  - src/room/room-service.ts
  - tests/git-controller.test.ts
  - tests/git-controller-cli.test.ts（仅在public CLI retry evidence需要时）
  - docs/documents/DEVELOPMENT_LOG.md（仅Fix Coding事实、verification与Review Required next step）

constraints:
  - Work only in the original candidate worktree C:/Users/RM/.codex/worktrees/b0ba/codex-claudecode-room and preserve exact lineage baseline c7b4c2db0095632194940df40b49e0788257f099.
  - Candidate remains detached with zero staged changes；不得清理、覆盖或拆分现有Increment 13 task-owned Diff。
  - Reuse the original candidate task 01a06171-2d2e-7831-9e77-1a9d4395fdf2 and its current gpt-5.6-luna/max settings；不得创建新task/worktree。
  - Preserve Codex review documentation corrections already present in candidate ROOM_PROTOCOL.md and OPERATIONS.md；本Fix不得改写其余candidate docs。
  - 不新增runtime dependency，不修改package.json/package-lock.json、protocol schema、MCP/Plugin/setup或root control files。
  - 若正确修复要求改变observable protocol、schema、Git allowlist、single-lineage policy、fixed actor、active binding/runtime或上述scope，立即停止并返回needs_decision。

acceptance_criteria:
  - existing same-ID same-content preview在action仍previewed、approved、succeeded、failed或outcome_unknown时均返回同一stored action与created=false，零observer、零Event、完整durable snapshot不变。
  - existing same-ID different-content返回id_conflict；disabled/replaced/wrong actor返回actor_not_allowed；全部发生在observer/process前并保持完整durable snapshot不变。
  - successful Git mutation后注入success settlement exception：public execute rejects、exact一个mutation、action保持executing、无git_action_failed Event；再次execute零mutation，explicit reconcile后为outcome_unknown。
  - executeReserved或postcondition的真实failure仍settle failed并保留既有partial Git evidence，不因catch边界调整回归。
  - total-order A -> B -> I在I.dependencies=[B,A]及等价reordered/redundant表达下，只接受B的successful committed branch为I create_worktree source_ref；A branch被validation_failed零写拒绝。
  - 两个independent SQLite connections并发execute同一approved action恰好一个启动mutation，另一个返回stable terminal/conflict结果；最终action/Event/Dispatch/Run snapshot无partial write。
  - focused tests、typecheck、full regression、scope test与git diff --check全部通过；active v0.3 binding bytes不变，candidate仍0 staged、未commit、未cutover。

verification:
  - command: npm run typecheck
    detects: preview retry split、settlement boundary与reachability predecessor修改的type contract漂移。
    decision_if_failed: 只修复task-owned类型；不得使用any、ts-ignore、skipLibCheck或wrapper绕过。
  - command: node --test "tests/git-controller.test.ts" "tests/git-controller-cli.test.ts"
    detects: delayed same-ID retry、settlement fault、reordered predecessor、cross-connection reservation及零process/snapshot Oracle。
    decision_if_failed: 修复最窄GitController/RoomService或test fixture；不得放宽assertion或退回single-connection mock。
  - command: node --test "tests/plan-scheduler.test.ts" "tests/room-service.test.ts" "tests/room-state-snapshot.test.ts"
    detects: total-order validation、policy/dispatch projection与snapshot transaction regression。
    decision_if_failed: 只修复本Fix引入的owner regression；不得修改graph contract或新增state。
  - command: node --test "tests/room-mcp.test.ts" "tests/status-cli.test.ts" "tests/scope.test.ts"
    detects: public read model、MCP wiring、mutation boundary、banned operation/dependency与scope drift。
    decision_if_failed: 删除越界修改或修复本Fix回归；不得扩张MCP/Plugin/runtime范围。
  - command: npm test
    detects: focused修复对Increment 1-12及Increment 13完整candidate的回归。
    decision_if_failed: 只修复task-owned regression；不得放宽既有independent Oracle。
  - command: git diff --check
    detects: whitespace、patch damage或未解析formatting error。
    decision_if_failed: 只修复本Fix新增格式，不格式化无关文件。
  - command: git status --short; git diff --cached --name-only; git rev-parse HEAD; git branch --show-current
    detects: unexpected scope、staged state、baseline/detached lineage或未授权Git写入。
    decision_if_failed: 不清理或改写Git；返回needs_decision并报告实际事实。

documentation_updates:
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: >
      记录Fix Task 1四项confirmed finding、actual changed files、verification、0 staged、Candidate / Review Required与等待独立Fix Review 2；保持active v0.3未cutover。

question_policy: >
  如果正确修复需要改变observable protocol/schema/error/Event、增加Git operation/parallel fan-in/
  merge commit/rebase/reset/cleanup/automatic retry、引入hash/pointer/dependency、新MCP/Plugin/runtime能力、
  修改active binding、扩大scope或执行任何Git write，立即停止受影响工作并返回needs_decision。
  既有helper复用、局部函数名、test fixture与Development Log段落位置可按existing style作最小选择，
  但必须在Coding Result记录且不能改变Contract行为。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: "2026-09-02T00:00:00Z"
```

## 3. 派发边界

- 用户已确认全部finding与最小方案；本文为`Accepted`，阶段=`FIX_PLAN_READY`。
- 派发复用原candidate task `01a06171-2d2e-7831-9e77-1a9d4395fdf2`及其当前model/effort，不创建新task/worktree。
- 派发前必须核对candidate exact HEAD、detached、0 staged、四项finding仍存在及scope未漂移。
- 派发门禁已通过；完整Accepted Contract已内联发送到原candidate task并完成Coding。
- Fix Review 2 `review-increment-013-codex-002`确认三项production修复闭合，但两项direct test evidence与结构化Coding Result尚未闭合；用户已确认三项最小方案及[Fix Task 2](./INCREMENT_13_FIX_TASK_2.md)完整Contract，并授权按`gpt-5.6-luna` / `max`派发到原candidate task，阶段=`CODING`。
- 执行者不得自行接受、stage、commit、push、cutover或清理。

## 4. 相关文档

- [Increment 13 Accepted Contract](./INCREMENT_13_TASK_CONTRACT.md)
- [Increment 13 Architecture Review](./INCREMENT_13_GIT_CONTROLLER_ARCHITECTURE_REVIEW.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
