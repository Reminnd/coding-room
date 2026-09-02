# Increment 12 Fix Task 4 — Candidate Links and Coding Result Closure

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| Reader | 用户、Codex Coding task、Codex Reviewer |
| 评审目标 | 执行 `review-increment-012-codex-004` 两项已确认 finding 的最小 documentation/result-only Fix Contract |
| 生效范围 | Increment 12 candidate Development Log 的失效 Contract 引用、Fix 4 current status，以及结构化 Coding Result |
| Parent Task | `increment-012-dag-scheduler-foundation-fix-003` |
| Based on Review | `review-increment-012-codex-004` |
| 执行状态 | Coding completed / Fix Review 5 `changes_requested`；链接finding已闭合，结构化Coding Result仍缺失 |
| 创建日期 | 2026-09-02 |

## 1. 已确认决定与全文确认

用户已于 2026-09-02 确认 Review 4 的两项 finding、最窄方案，并要求后续使用 `gpt-5.6-luna`、reasoning effort=`max` 派发到原 candidate task：

- 只在 candidate `docs/documents/DEVELOPMENT_LOG.md` 内把九个指向不存在的 Fix 1/2/3 Contract 相对链接改为非链接 code/text reference；不复制 Contract、不新增 candidate 文件。
- 由原 candidate task 补交结构化 Coding Result，包含 Contract 要求的全部字段；不得补造未运行的测试。
- 随本 Fix 的真实 lifecycle 更新 candidate current status、Fix 4 Coding entry、阻塞项与下一步为等待独立 Fix Review 5。
- 不修改或重跑 tests、production source、schema、Plugin、runtime 或其它候选文档。

用户随后于 2026-09-02 明确回复“确认 Fix Task 4 完整 Contract 并派发”，并要求启用subagent。本文现为`Accepted`、`confirmed_by_user=true`；subagent只执行只读派发门禁审计，不修改candidate、不替代原candidate Coding task。主Codex与subagent均确认门禁通过后，本文完整Contract已内联发送到原candidate task，model=`gpt-5.6-luna`、reasoning effort=`max`，阶段=`CODING`；不授权任何Git/runtime写操作。

## 2. Accepted Task Contract

```yaml
task_id: increment-012-dag-scheduler-foundation-fix-004
type: fix
parent_task_id: increment-012-dag-scheduler-foundation-fix-003
based_on_review_id: review-increment-012-codex-004

background: >
  Increment 12 Fix Task 3 已在 detached candidate worktree、exact lineage baseline
  51c9a50c83064fb9e2e4cc83e2f3942e4e06e5ae 上完成。Fix Review 4
  review-increment-012-codex-004 确认 Fix 3 已正确分离 Fix 1/2 verification provenance，
  current status、阻塞项与下一步也已更新；Review 3 的 production/test 结论保持闭合。
  剩余两项 low finding 是：candidate DEVELOPMENT_LOG 的九个 Fix 1/2/3 Contract
  相对链接目标不存在，以及 completed task 未返回 Accepted Fix 3 Contract 要求的结构化
  Coding Result。用户已确认两项 finding、最窄方案与 gpt-5.6-luna/max 执行路由。

goal: >
  仅在 candidate DEVELOPMENT_LOG 内消除九个失效的 main-workspace-only Contract 链接，
  同步 Fix 4 / Review 5 当前事实，并由原 candidate task 返回字段完整、与实际 Git/verification
  一致的结构化 Coding Result；不改变或重验证任何代码、测试、production behavior、architecture
  或 protocol。

confirmed_findings:
  - finding_id: inc12-fr4-candidate-contract-links
    severity: low
    evidence: >
      candidate docs/documents/DEVELOPMENT_LOG.md 有九个 Markdown 相对链接指向 candidate
      中不存在的 INCREMENT_12_FIX_TASK_1.md、INCREMENT_12_FIX_TASK_2.md 与
      INCREMENT_12_FIX_TASK_3.md；Fix 3 Contract 明确位于主工作区且要求 relative links 有效。
    confirmed_solution: >
      只在 candidate DEVELOPMENT_LOG 内把这些 main-workspace-only Contract 引用改为非链接的
      inline code 或普通文本；不复制 Contract、不新增 candidate 文件、不改变历史事实语义。
  - finding_id: inc12-fr4-structured-coding-result
    severity: low
    evidence: >
      completed Fix 3 task 没有 assistant final；用户 handoff 只有 task_id、status、stage、
      based_on_review、exact_baseline 与 current_head，缺少 required summary、changed_files、
      acceptance/verification、tests、documentation changes、deviations、unresolved 与 questions。
    confirmed_solution: >
      由原 candidate task 在 Fix 4 完成时返回字段完整的结构化 Coding Result；不得把 not_run
      测试写成 passed，不用文档自述替代 final result。

requirements:
  - 只修复上述 confirmed findings；review_fixes_only、documentation_and_result_only。
  - candidate docs/documents/DEVELOPMENT_LOG.md MUST 是唯一 changed file；不得修改 tests、src、plugins、package/config、其它 docs 或 root control files。
  - MUST 将当前九个指向不存在的 INCREMENT_12_FIX_TASK_1.md、INCREMENT_12_FIX_TASK_2.md 与 INCREMENT_12_FIX_TASK_3.md 的 Markdown links 转为非链接 inline code 或普通文本；不得复制这些 Contract 到 candidate，也不得新建 INCREMENT_12_FIX_TASK_4.md candidate 副本。
  - MUST 保持对应句子的 task identity、Accepted/Coding/Review 历史与 provenance 语义不变；除消除失效 link markup 外不得改写既有 Fix 1/2/3 历史事实。
  - DEVELOPMENT_LOG 顶部 current status MUST 记录 Fix Task 4 documentation/result-only Coding 已完成、candidate 为 Review Required，并等待独立 Fix Review 5；不得写成 Accepted、Current、versioned 或 cutover。
  - MUST 新增最小 Fix Task 4 Coding entry；该 entry 以非链接 text/code 标识本 Task，记录唯一 changed file、九个 link correction、结构化 result closure、代码测试 not_run、文档检查、0 staged、exact HEAD、active runtime=v0.3 与未执行 Git/runtime writes。
  - 无日期“阻塞项” MUST 说明没有 unresolved Coding question，两项 Review 4 finding 已按 Fix Task 4处理，candidate等待Review 5与用户最终接受。
  - 无日期“下一步” MUST 指向独立 Review 5 对单一 documentation/result-only Delta、完整 candidate provenance、relative-link zero-missing 与 Coding Result shape 的核对。
  - 代码测试 MUST 记录为 not_run；理由是 Review 3 已独立通过 typecheck、focused 190/190 与 full 373/373，Fix 4 不修改 production/test inputs。
  - Coding Result MUST 由 task assistant final 直接返回，并至少包含 task_id、status、summary、changed_files、acceptance_criteria、verification、tests、documentation_changes、deviations、unresolved、questions、stage、exact_baseline 与 current_head。
  - Coding Result changed_files MUST 只列 candidate docs/documents/DEVELOPMENT_LOG.md；verification 对未运行的代码测试不得写 passed；无 deviation/unresolved/question 时使用显式空列表或 none，不得省略字段。

non_goals:
  - 修改 tests、fixtures、snapshot helper、src production、schema、MCP、Scheduler、repository、RoomService、Plugin、setup、package、lockfile或configuration。
  - 修改 ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、OPERATIONS.md、ADR、Task Contract、AGENTS.md、CLAUDE.md或root PROJECT_RULES.md。
  - 把主工作区 Fix Contract 复制、移动、链接或镜像到 candidate；新增 compatibility link、stub、redirect 或第二份权威文档。
  - 重跑 npm run typecheck、focused suites、npm test、race tests或其它代码验证。
  - 修改 Fix 1/2/3 的已确认技术结论、verification count、production behavior、architecture或protocol。
  - 新 schema/Event/state/error/protocol、Git/hash/Increment 13 capability、migration、compatibility layer或new dependency。
  - 启动 Claude/Agent Room Run、创建新 Codex task、runtime/database/binding cutover、旧 database处理或Plugin install/reload。
  - stage、commit、push、merge、rebase、reset、restore、clean、checkout、branch/worktree创建删除或任何其它Git write。

architecture_decisions:
  - 本 Fix 只更正文档导航、current lifecycle事实与result transport，不改变 Increment 12 production architecture、protocol、test behavior 或 Review 3技术结论。
  - Main workspace Contract 是planning authority；candidate Development Log只以非链接文字引用main-only Contract，不复制权威文档。
  - Coding Result必须由执行task直接返回；Development Log记录事实但不替代result transport。
  - 输入未变化时不重复昂贵代码验证；documentation/result-only Fix由精确Diff、relative-link解析、status/HEAD/staged检查与完整assistant final证明。

scope:
  - review_fixes_only
  - documentation_and_result_only
  - candidate docs/documents/DEVELOPMENT_LOG.md 的九个失效Contract引用、Fix 4 Coding/current status、阻塞项与下一步
  - 原candidate task的结构化assistant final Coding Result

constraints:
  - Work only in the original candidate worktree C:/Users/RM/.codex/worktrees/a1da/codex-claudecode-room; preserve its complete Increment 12 task-owned staged/unstaged/untracked Diff and exact lineage baseline 51c9a50c83064fb9e2e4cc83e2f3942e4e06e5ae.
  - Candidate worktree remains detached with 0 staged。不得创建或切换 branch/worktree，不得 commit、stage、clean、reset、restore 或覆盖原 candidate Diff。
  - 本 Contract 只位于主工作区 D:/agent/case/codex-claudecode-room/docs/documents/INCREMENT_12_FIX_TASK_4.md；不得从candidate创建指向它的相对link或复制本文。
  - 执行必须复用原candidate task 01a05c82-6144-7911-b2fc-31cc8ba3cfd5，model=gpt-5.6-luna、reasoning effort=max；不得创建新task/worktree。
  - 修改前先核对九个missing targets仍是Fix 1/2/3 Contract links。若数量或目标集合变化、正确修复需要其它文件、代码测试、production行为或Git write，立即停止并返回needs_decision。
  - 修改前后人工核对 DEVELOPMENT_LOG 顶部current status、Fix 1/2/3/4历史段落、验证段、阻塞项与下一步；不得用全局替换改写其它Increment历史。

acceptance_criteria:
  - candidate DEVELOPMENT_LOG 的全部 relative Markdown links 均可解析，missing target count=0；原九个main-workspace-only Fix 1/2/3 Contract references保留为非链接text/code。
  - candidate中未新增Fix Contract副本、stub、redirect或其它文件；actual Fix 4 changed file只有DEVELOPMENT_LOG.md。
  - Fix 1/2/3 historical/current provenance继续与Review 4已确认事实一致，没有删除、倒填或重新归属verification evidence。
  - candidate只有一个current fact：Fix Task 4 documentation/result-only Coding完成，Candidate / Review Required，等待Fix Review 5与用户接受。
  - assistant final Coding Result包含全部required fields，changed_files与actual Delta一致，代码tests明确not_run且无伪造passed结果。
  - HEAD exact、detached、0 staged，无Git/runtime write；active runtime继续为v0.3，candidate未Accepted、未versioned、未cutover。
  - 无merge marker，git diff --check通过。

verification:
  - command: git diff -- docs/documents/DEVELOPMENT_LOG.md
    detects: 九个link correction、Fix 4 current事实与历史provenance是否保持最窄scope，是否误删或改写其它历史。
    decision_if_failed: 只修正Development Log内的本Fix delta；不得修改其它文件或运行代码测试。
  - command: PowerShell relative Markdown link resolution for docs/documents/DEVELOPMENT_LOG.md
    detects: 每个非HTTP、非anchor relative link的目标在candidate中是否存在，missing target count是否为0。
    decision_if_failed: 只把main-workspace-only Contract引用改为非链接text/code；若其它既有link缺失则返回needs_decision，不扩张scope。
  - command: rg -n "\\]\\(\\./INCREMENT_12_FIX_TASK_[123]\\.md\\)" docs/documents/DEVELOPMENT_LOG.md
    detects: 原九个失效Fix Contract Markdown link是否仍有残留。
    decision_if_failed: 在Development Log内移除残留link markup并保留原文字事实。
  - command: rg -n -C 4 "Fix Task 4 Coding|阻塞项|下一步|review-increment-012-codex-004|REVIEW_REQUIRED" docs/documents/DEVELOPMENT_LOG.md
    detects: Fix 4/current next-step是否仍有互斥陈述。
    decision_if_failed: 只修正Development Log current lifecycle文案。
  - command: rg -n "^(<<<<<<<|=======|>>>>>>>)$" docs/documents/DEVELOPMENT_LOG.md
    detects: 未解析merge marker。
    decision_if_failed: 只移除本Fix引入的marker；既有marker则返回needs_decision。
  - command: git diff --check
    detects: whitespace、merge marker或patch hygiene错误。
    decision_if_failed: 只修复本Fix新增格式错误，不格式化无关文件。
  - command: git status --short; git diff --cached --name-only; git rev-parse HEAD
    detects: unexpected file、staged change、candidate ownership、detached lineage或HEAD drift。
    decision_if_failed: 不执行Git写入或清理；返回needs_decision并报告实际状态。
  - command: npm run typecheck; focused suites; npm test
    status: not_run
    reason: Review 3已独立通过typecheck、focused 190/190与full 373/373；本Fix禁止修改production/test输入，重复运行不会改变结论。

documentation_updates:
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: >
      消除九个main-workspace-only Contract失效链接，新增Fix 4 documentation/result-only Candidate事实，
      更新current status、阻塞项与下一步为Review 5；保持active runtime v0.3及未versioned/cutover边界。

question_policy: >
  如果执行开始时九个missing link的数量/目标已变化，或正确闭合finding需要修改Development Log以外文件、
  复制Contract、删除历史Review/Coding事实、运行或修改tests、修改production/schema/MCP/Plugin/runtime、
  new dependency、Git/hash/Increment 13 capability、runtime cutover、旧database处理或任何Git write，
  立即停止受影响工作并返回needs_decision。Development Log内非链接reference的最小措辞、Fix 4 entry
  与current next-step可在本文冻结事实内选择，并在Coding Result deviations中记录。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: "2026-09-02T00:00:00Z"
```

## 3. Accepted 与派发边界

- 用户已经确认Review 4 findings、最窄方案、计划模型及本文完整Contract；本文具备派发资格，阶段=`FIX_PLAN_READY`。
- 派发前仍须通过主Codex与只读subagent的baseline、0 staged、scope、字段及路由核对；失败时保持未派发并报告。
- 计划执行路由固定为原candidate task `01a05c82-6144-7911-b2fc-31cc8ba3cfd5`，model=`gpt-5.6-luna`、reasoning effort=`max`；不创建新task/worktree。
- 派发只授权该task修改candidate `docs/documents/DEVELOPMENT_LOG.md`并返回结构化assistant final；不得修改主工作区文档或扩大Contract scope。
- Accepted Contract已完整内联发送到原candidate task；派发成功，阶段=`CODING`。
- Coding完成后只进入`REVIEW_REQUIRED`；执行者不得自行接受、stage、commit、push、cutover或清理。
- Fix Review 5 `review-increment-012-codex-005`确认relative-link验收已闭合，但执行task没有assistant final，本次handoff也未包含完整Coding Result字段；candidate Development Log关于result已返回的表述与task事实冲突。Decision=`changes_requested`，阶段=`REVIEW_DISCUSSION`。

## 4. 相关文档

- [Increment 12 Fix Task 3](./INCREMENT_12_FIX_TASK_3.md)
- [Increment 12 Fix Task 2](./INCREMENT_12_FIX_TASK_2.md)
- [Increment 12 Fix Task 1](./INCREMENT_12_FIX_TASK_1.md)
- [Increment 12 Accepted Contract](./INCREMENT_12_TASK_CONTRACT.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
