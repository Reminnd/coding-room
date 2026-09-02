# Increment 13 Fix Task 2 — Simultaneous Reservation and Retry Evidence

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| Reader | 用户、原 Increment 13 Coding task、Codex Reviewer |
| 评审目标 | 执行 `review-increment-013-codex-002` 三项已确认 finding 的最小 test/result-only Fix Contract |
| 生效范围 | Increment 13 Fix Task 1 candidate 的并发/retry直接证据与 Coding Result provenance |
| Parent Task | `increment-013-git-controller-integration-only-fix-001` |
| Based on Review | `review-increment-013-codex-002` |
| 执行状态 | Dispatched / Coding |
| 创建日期 | 2026-09-02 |

## 1. 已确认决定与全文确认门禁

用户已于 2026-09-02 确认 Review `review-increment-013-codex-002` 的三项 finding 与以下最小方向：

1. 使用同一 test-owned file-backed database、两个 Worker threads 和两个独立 SQLite connections，使双方经 public `GitController.execute` 在 test-side reservation barrier 后同时竞争同一 approved action；证明恰好一个 reservation/mutation，loser 为稳定 domain error，完整 durable snapshot 与单次执行 control 等价。
2. 对已有 `failed` GitAction 直接执行 same-ID same-content `preview` retry，证明 `created=false`、零 observer/process、零 Event 且完整 snapshot 不变。
3. 复用原 candidate task，由新的 Fix turn 返回字段完整的结构化 Coding Result；candidate Development Log 只记录实际 Fix 2 事实，不补造 Fix Task 1 不存在的 assistant final。

用户已于 2026-09-02 进一步确认下方完整 Contract。本文现为 `Accepted`、`confirmed_by_user=true`。用户随后按任务类型矩阵授权以 `gpt-5.6-luna` / `max` 派发到原candidate task；完整Contract已内联发送，阶段为 `CODING`。

## 2. Accepted Task Contract

```yaml
task_id: increment-013-git-controller-integration-only-fix-002
type: fix
parent_task_id: increment-013-git-controller-integration-only-fix-001
based_on_review_id: review-increment-013-codex-002

background: >
  Increment 13 candidate与Fix Task 1均基于exact baseline
  c7b4c2db0095632194940df40b49e0788257f099，在原detached candidate worktree完成。
  Fix Review 2独立确认DAG maximal predecessor、successful settlement exception与delayed
  same-ID preview retry三项production修复正确；typecheck、focused 9/9 + 90/90 + 53/53、
  full 385/385与git diff --check均通过。Remaining gaps只有：two-connection测试在首个
  reservation已提交并进入mutation后才启动第二个execute，未形成simultaneous reservation；
  same-ID preview matrix未直接覆盖failed；最新completed Fix turn
  01a061cf-928a-7192-be87-4a6f3ec80c84的items=[]，没有结构化assistant final。
  用户已确认三项finding与最小test/result-only方案。

goal: >
  不修改任何production behavior，以两个独立SQLite connections在public execute路径上的真实同时
  reservation竞争、failed GitAction的same-ID preview retry完整Oracle，以及原task字段完整的结构化
  Coding Result，闭合Increment 13 Fix Review 2的三项remaining evidence/provenance findings。

confirmed_findings:
  - finding_id: inc13-fr2-reservation-not-simultaneous
    severity: medium
    evidence: >
      tests/git-controller.test.ts现有race先启动第一个execute，等待其mutation callback开始并确认
      durable action=executing后，才调用第二个controller.execute。两个connection虽独立，但第二个
      operation只读取已经提交的terminal-for-execution状态，没有同时竞争BEGIN IMMEDIATE reservation。
    confirmed_solution: >
      新增最小test-only Worker entry。每个Worker打开同一file-backed database的独立DatabaseSync，
      构造自己的RoomService与GitController，并经SharedArrayBuffer barrier同时进入public execute。
      test-only RoomService override只在调用super.reserveGitAction前同步双方到达，不改变production
      code或绕过public execute；双方释放后由existing transaction决定winner。断言exact一个mutation、
      一个success、一个ProtocolError/git_action_already_terminal，并将完整最终snapshot与相同fixture只
      执行一次execute的control snapshot比较；只归一化test root、Event UUID与wall-clock timestamp。
  - finding_id: inc13-fr2-failed-preview-retry-missing
    severity: medium
    evidence: >
      tests/git-controller.test.ts已有commit-a-failed与ff-diverged两个failed action，但失败后均未以
      同一git_action_id和同一caller-owned command再次调用GitController.preview。现有direct matrix只
      覆盖previewed、approved、succeeded与outcome_unknown。
    confirmed_solution: >
      复用现有commit-a-failed public path，在failed settlement后保存完整snapshot，并用记录所有Git
      process/observer调用的controller执行same-ID same-content preview retry；断言返回原stored action、
      created=false、调用数组为空、Event/cursor及完整snapshot不变。不得以service/repository helper
      或其它terminal状态替代failed public preview path。
  - finding_id: inc13-fr2-structured-coding-result-missing
    severity: low
    evidence: >
      原candidate task 01a06171-2d2e-7831-9e77-1a9d4395fdf2的最新completed Fix Task 1 turn
      01a061cf-928a-7192-be87-4a6f3ec80c84为items=[]，不存在assistant final。candidate
      DEVELOPMENT_LOG记录的实现事实不能替代Coding Result transport。
    confirmed_solution: >
      继续复用原candidate task并由本次Fix turn真实返回结构化assistant final。Result使用项目现有
      required fields，明确Fix Task 1 result缺失是历史provenance事实；changed_files只列Fix Task 2
      实际Diff，不把Fix Task 1 production files伪装成本次修改。

requirements:
  - 只修复上述三项confirmed findings；review_fixes_only。任何production source change均越界。
  - concurrent execute regression MUST 使用同一test-owned file-backed SQLite database、两个Worker threads、两个独立DatabaseSync/RoomService/GitController instances。
  - 两个Worker MUST 都通过public GitController.execute进入；不得直接调用reserveGitAction作为被测operation，也不得使用同一connection或按先后顺序调用两个execute。
  - test-side reservation barrier MAY 通过Worker-local RoomService subclass在super.reserveGitAction前同步双方；该override只能等待/释放，MUST 原样调用super且不得返回伪造结果、修改production transaction或建立production test hook。
  - 每个Worker MUST 回传是否为ProtocolError、stable error code、execute outcome与本Worker mutation-process count；主测试必须证明一个success、一个git_action_already_terminal、两个outcome合计exact一个mutation invocation。
  - race完成后 MUST 由fresh third SQLite connection读取完整public durable snapshot，并与相同fixture只执行一个public execute的control snapshot deepEqual；只允许测试侧显式归一化temp root、Event UUID和wall-clock timestamp，不得忽略entity、status、result、Event type/payload/sequence、cursor、Dispatch、Run或其它durable field。
  - concurrent fixture MUST 有bounded barrier timeout与Worker error/exit handling，避免失败时hang；这些只属于test harness，不得引入通用concurrency framework或production dependency。
  - failed preview retry MUST 直接复用现有public commit_paths failure path；same-ID same-content retry返回同一stored failed action与created=false，并证明零Git observer/process、零Event及完整snapshot不变。
  - 保留Fix Task 1已通过Review的production实现和全部既有positive、failure、retry、settlement、lineage、CLI、MCP、Plugin/setup与scope assertions；不得删除、skip、todo、重命名掩盖或弱化无关Oracle。
  - candidate DEVELOPMENT_LOG MUST 记录Review 2三项confirmed solution、Fix Task 2 actual changed files、verification、deviation、unresolved与REVIEW_REQUIRED next step；不得声称Fix Task 1 assistant final存在。
  - Fix Task 2 assistant final MUST 包含task_id、status、stage、based_on_review_id、exact_baseline、current_head、summary、changed_files、deviations、verification、tests、documentation_changes、unresolved和questions。
  - Coding Result changed_files MUST 与本次Fix 2实际Git Diff exact一致；summary明确Fix Task 1 completed turn没有assistant final，本次Result不追溯伪造历史Result。

non_goals:
  - 修改src下任何production code、public API、Git Controller、RoomService、repository、scheduler、schema、MCP、CLI、Plugin或setup实现。
  - 改变GitAction/Approval/Event/error/status/transaction/cursor语义，新增schema/table/index/field、migration、pointer、hash、fingerprint或dependency。
  - 增加Git operation、parallel fan-in、merge commit、cherry-pick、rebase、reset、clean、cleanup、automatic retry或arbitrary argv/shell。
  - 建立通用Worker/concurrency test framework、production test hook、lock wrapper、mock authority、compatibility path或new runtime dependency。
  - 修改package.json、package-lock.json、AGENTS.md、CLAUDE.md、PROJECT_RULES.md、Architecture、Room Protocol、ADR、MVP、Operations、Plugin或active binding。
  - 启动Agent Room service/Claude Run、创建新Codex task/worktree、安装Plugin、runtime/database/binding cutover或处理旧database。
  - stage、commit、push、merge、rebase、reset、restore、clean、checkout或创建/删除真实branch/worktree。

architecture_decisions:
  - Fix Review 2没有production finding；Fix Task 1的GitAction implementation保持原样，Fix 2只增加独立证据和Result provenance。
  - concurrency authority仍由existing BEGIN IMMEDIATE transaction、status guard与conditional update拥有；test barrier只让两个真实caller同时到达该boundary，不替代或改写它。
  - concurrent loser零残留由完整race-versus-single-winner control snapshot表达；selected Event count或局部entity projection不足以替代。
  - failed retry的idempotency owner仍是durable GitAction与caller-owned command intent；测试必须在public preview boundary证明live Git observer不参与existing-ID判定。
  - Coding Result只描述本次actual Diff；历史缺失通过summary与Development Log如实记录，不建立第二份Result authority。

scope:
  - review_fixes_only
  - tests/git-controller.test.ts中的simultaneous two-connection execute与failed preview retry Oracle
  - tests/git-action-execute-worker.ts或等价单一non-test-glob Worker entry，仅服务本次public execute race
  - docs/documents/DEVELOPMENT_LOG.md中的Fix Task 2 candidate事实
  - 原candidate task本次assistant final中的结构化Coding Result

constraints:
  - Work only in the original candidate worktree C:/Users/RM/.codex/worktrees/b0ba/codex-claudecode-room and preserve exact lineage baseline c7b4c2db0095632194940df40b49e0788257f099.
  - Candidate MUST remain detached with zero staged changes；不得清理、覆盖、拆分或回滚现有Increment 13完整task-owned Diff。
  - Reuse original candidate task 01a06171-2d2e-7831-9e77-1a9d4395fdf2 and its current model/reasoning settings；不得创建新task/worktree或自行改变model。
  - 本Accepted Contract位于主工作区D:/agent/case/codex-claudecode-room/docs/documents/INCREMENT_13_FIX_TASK_2.md；只有另获派发授权后才能完整注入，摘要不得替代Contract。
  - 测试expected outcome来自本Contract与测试侧literal/control fixture；不得从production error/status table、mutation helper或被测snapshot投影生成期望。
  - 如direct regression证明Review finding或confirmed solution不成立，返回证据并停止受影响修改；不得为了迎合Review制造测试。
  - 如正确闭合证据需要production/API/schema/dependency/Plugin/runtime修改或任何Git write，立即停止并返回needs_decision。

acceptance_criteria:
  - 两个Worker各自使用独立SQLite connection，并在test-side reservation-entry barrier后同时通过public execute竞争同一approved action；一个success、一个ProtocolError/git_action_already_terminal，合计exact一个mutation invocation。
  - race最终完整public snapshot与otherwise identical的single-execute control snapshot在仅归一化temp root、Event UUID与wall-clock timestamp后deepEqual；无loser Event/entity/status/result/cursor residue。
  - race后action恰好经历git_action_previewed、git_action_approved、git_action_executing、git_action_succeeded，Dispatch/Run与created worktree结果和单次control一致。
  - failed commit_paths action的same-ID same-content public preview retry返回原stored action、created=false、零observer/process、零Event且完整snapshot不变。
  - src、package、Plugin、schema、MCP、CLI与active runtime bytes均无Fix 2变更；candidate保持detached、0 staged、未commit、未cutover。
  - candidate Development Log与本次结构化assistant final如实区分Fix Task 1 result缺失和Fix Task 2实际changed_files；Result required fields完整、无伪造historical Result。
  - typecheck、Git Controller focused suite、scope/public regression、full npm test、Diff hygiene与final status全部通过，零fail/skip/todo。

verification:
  - command: npm run typecheck
    detects: Worker message、barrier subclass、snapshot normalization与test fixture的TypeScript contract drift。
    decision_if_failed: 只修复Fix 2 test/documentation类型；不得修改production type或使用any、ts-ignore、skipLibCheck。
  - command: node --test "tests/git-controller.test.ts" "tests/git-controller-cli.test.ts"
    detects: simultaneous reservation、single mutation、stable loser、race-control完整snapshot及failed preview retry Oracle未闭合。
    decision_if_failed: 只修复本Fix test harness/assertion；若production行为与confirmed solution冲突则返回needs_decision，不得放宽Oracle。
  - command: node --test "tests/plan-scheduler.test.ts" "tests/room-service.test.ts" "tests/room-state-snapshot.test.ts" "tests/room-mcp.test.ts" "tests/status-cli.test.ts" "tests/scope.test.ts"
    detects: test-only Fix是否引入Graph/Room/snapshot/public surface/scope regression或越界production file。
    decision_if_failed: 删除Fix 2引入的越界或修复test fixture；不得修改production/Scope assertion掩盖失败。
  - command: npm test
    detects: focused范围外的Increment 1-12、Runner、Git Observer、Plugin/setup或完整Increment 13 regression。
    decision_if_failed: 只修复Fix 2引入的test regression；不得删除、skip或弱化既有Oracle。
  - command: git diff --check
    detects: whitespace、patch damage或formatting error。
    decision_if_failed: 只修复Fix 2新增格式，不格式化无关文件。
  - command: git status --short; git diff --cached --name-only; git rev-parse HEAD; git branch --show-current
    detects: unexpected scope、staged state、baseline/detached lineage或未授权Git写入。
    decision_if_failed: 不执行Git清理或改写；返回needs_decision并报告actual fact。

documentation_updates:
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: >
      记录Review 2三项confirmed solution、Fix Task 2 actual changed files与verification、Fix Task 1
      assistant final缺失的historical provenance、0 staged、Candidate / Review Required及等待Fix Review 3；
      保持active v0.3未cutover，不修改Architecture、Protocol、ADR、MVP或Operations。

question_policy: >
  如果正确闭合finding需要production source/API/schema/Event/state/error、MCP/CLI/Plugin/setup、new
  dependency/framework、active runtime/binding、Git operation/parallel fan-in或任何Git write，立即停止受影响
  工作并返回needs_decision。Worker entry文件名、最小snapshot normalization helper和failed retry assertion位置
  可在本文冻结行为内按existing style选择，并在Coding Result记录；不得改变observable contract。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: "2026-09-02T00:00:00Z"
```

## 3. Candidate 与派发边界

- 用户已确认三项 finding、最小方案及本文完整 Contract；本文为 `Accepted`、`confirmed_by_user=true`。
- 用户已单独授权派发。门禁确认candidate `HEAD=c7b4c2db0095632194940df40b49e0788257f099`、detached、0 staged且finding未漂移后，完整Contract已内联发送到原candidate task `01a06171-2d2e-7831-9e77-1a9d4395fdf2`。
- 本次任务按用户模型矩阵归类为regression tests、public-path coverage与证据补全，使用`gpt-5.6-luna` / `max`；未创建新task/worktree，阶段=`CODING`。
- Coding完成后只进入`REVIEW_REQUIRED`；执行者不得自行接受、stage、commit、push、cutover或清理。

## 4. 相关文档

- [Increment 13 Fix Task 1](./INCREMENT_13_FIX_TASK_1.md)
- [Increment 13 Accepted Contract](./INCREMENT_13_TASK_CONTRACT.md)
- [Increment 13 Architecture Review](./INCREMENT_13_GIT_CONTROLLER_ARCHITECTURE_REVIEW.md)
- [MVP Plan](./MVP_PLAN.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
