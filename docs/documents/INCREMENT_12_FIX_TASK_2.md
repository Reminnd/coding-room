# Increment 12 Fix Task 2 — Complete Rollback and Retry Evidence

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| Reader | 用户、Claude Code、Codex Reviewer |
| 评审目标 | 执行 `review-increment-012-codex-002` 三项已确认 finding 的最小 test/result-only Fix Contract |
| 生效范围 | Increment 12 Fix Task 1 candidate 的 regression evidence 与 Coding Result provenance |
| Parent Task | `increment-012-dag-scheduler-foundation-fix-001` |
| Based on Review | `review-increment-012-codex-002` |
| 创建日期 | 2026-09-01 |

## 1. 已确认决定与全文确认门禁

用户已于 2026-09-01 确认 Review `review-increment-012-codex-002` 的三项 finding 及以下最小方向：

- 在 `tests/plan-scheduler.test.ts` 以完整 public snapshot 闭合 stale revision、concurrency loser 与 blocked acceptance 的零写 Oracle；不修改已通过 Review 的 production implementation。
- 在 `tests/room-mcp.test.ts` 补齐 `Plan`、`TaskGraphRevision`、`Approval` 逐实体 public MCP retry matrix，重点覆盖 replacement 后 frozen identity success 与 disabled/re-enable；wrong-role 继续由可表达该 actor 的 service direct regression 代表，不为测试新增 MCP tool 或 caller-controlled role。
- 更正 Fix Task 1 Coding Result 的实际 changed-files provenance；Fix Task 2 的 Coding Result 只列本次实际变更，并通过既有字段明确记录前次遗漏与正确归属。

上述 finding、方案与下方完整 Contract 已由用户于 2026-09-02 全文确认。本文状态为 `Accepted`、`confirmed_by_user=true`，阶段进入 `FIX_PLAN_READY`。用户选择自行人工派发；该确认不授权 Codex 创建 task、启动 Claude/Agent Room Run，且不授权任何 Git/runtime 写操作。

## 2. Accepted Task Contract

```yaml
task_id: increment-012-dag-scheduler-foundation-fix-002
type: fix
parent_task_id: increment-012-dag-scheduler-foundation-fix-001
based_on_review_id: review-increment-012-codex-002

background: >
  Increment 12 Fix Task 1 已在 detached candidate worktree、exact lineage baseline
  51c9a50c83064fb9e2e4cc83e2f3942e4e06e5ae 上完成。Fix Review
  review-increment-012-codex-002 独立确认 exact latest revision、blocked acceptance 与 in-scope
  Fix recovery、current concurrency、dispatched worker freeze、Plan/Revision/Approval frozen retry
  authority 六项 production 行为均已闭合；typecheck、focused 190/190 与 full 373/373 通过。
  Remaining gaps 只属于 Contract 已要求的完整 rollback Oracle、逐实体 public MCP retry evidence
  与 Coding Result changed-files provenance。用户已确认三项 finding 及最小 test/result-only 方案。

goal: >
  不修改 production behavior，仅以独立、完整的 public-state Oracle 补齐 stale revision、并发
  claim loser、blocked acceptance 及 Plan/Revision/Approval frozen retry 的直接证据，并更正 Fix Task 1
  Coding Result provenance，使 Increment 12 完整 task-owned candidate 可再次 Review。

confirmed_findings:
  - finding_id: inc12-fr2-complete-rollback-oracle
    severity: medium
    evidence: >
      tests/plan-scheduler.test.ts 对 stale Draft/rejected、concurrency loser 与 blocked acceptance
      只比较 selected collections、Attempt count 或局部 Run/Dispatch；测试名称和 Contract 却声称
      Room、Plan、Revision、Approval、Assignment、Task、Run、Dispatch、Attempt、Review、Question、
      Event 与 cursor 的完整 public snapshot 零写。
    confirmed_solution: >
      对每个 invalid command 在调用前后读取同一 public durable snapshot 并 deepEqual；并发场景
      因一个 winner 合法写入，应把 race 最终完整 snapshot 与 otherwise identical、只执行同一
      winner claim 的 control outcome 比较，或使用等价的测试侧独立完整 expected snapshot，证明
      loser 没有额外 Attempt、Event、entity、status 或 cursor residue。不得从 production helper
      生成 expected value。
  - finding_id: inc12-fr2-mcp-retry-matrix
    severity: medium
    evidence: >
      tests/room-mcp.test.ts 已覆盖三类 entity 的 replacement rejection，但 replacement 后 frozen
      identity success 与 disabled/re-enable 只直接覆盖 Plan；TaskGraphRevision 与 Approval 缺少
      对应 public MCP route evidence。
    confirmed_solution: >
      通过现有 public MCP tools 为 Plan、TaskGraphRevision、Approval 逐实体覆盖 frozen same-ID
      same-content retry、different-content conflict、replacement rejection、replacement 后原 frozen
      identity success、disabled rejection 与 re-enable 后 success；所有 retry/rejection 前后比较完整
      room_get_state。MCP tool 的 actor role 固定由 route/tool 映射，wrong-role 无合法 public MCP
      表达，因此保留 RoomService 的 REVIEWER direct regression，不增加测试专用 role input 或 tool。
  - finding_id: inc12-fr2-coding-result-files
    severity: low
    evidence: >
      Fix Task 1 Coding Result 的 changed_files 遗漏实际修改的 src/room/room-service.ts，且把
      src/room/state-snapshot.ts 的 snapshot 修复误归到 src/room/repository.ts；候选
      DEVELOPMENT_LOG 的 production file record 才是正确事实。
    confirmed_solution: >
      在 Fix Task 2 Coding Result summary 与 candidate DEVELOPMENT_LOG 中明确更正前次遗漏和归属：
      Fix Task 1 production paths 包含 src/room/repository.ts、src/room/room-service.ts、
      src/room/state-snapshot.ts、src/scheduler/plan-scheduler.ts；Fix Task 2 changed_files 只列本次
      实际修改，不把前次文件伪装为本次变更。

requirements:
  - 只修复上述 confirmed findings；review_fixes_only。不得修改任何 production source、schema、configuration、package 或 Plugin file。
  - 在 tests/plan-scheduler.test.ts 中建立测试侧完整 public snapshot Oracle；snapshot MUST 保留 public response 的全部 entity collections、current references、Events 与 cursor，不得只投影 selected fields。
  - latest Draft 与 rejected 两个场景 MUST 分别证明 room_reconcile_plan 零写，并分别证明旧 approved Run 的 new claim 以 plan_revision_not_approved 拒绝且完整 snapshot deepEqual 不变。
  - blocked/scope_violated acceptance MUST 在 acceptReview 调用前后比较完整 public snapshot；拒绝后 descendant reconcile 继续不得 materialize，且该 reconcile 自身也不得产生 durable write。
  - amendment concurrency_limit race MUST 继续使用两个独立 SQLite connections 并恰好产生一个 winner、一个 concurrency_limit_reached loser。最终完整 public snapshot MUST 与只应用该 winner claim 的独立 control outcome 等价；只断言 Attempt/Event count 不足以满足本项。
  - 对并发 control comparison 只允许测试侧显式归一化确属 race 非确定性的 winner identity、timestamp 或 ordering；不得忽略 entity、status、Event payload、sequence/cursor 或其它 durable field。
  - 在 tests/room-mcp.test.ts 中，Plan、TaskGraphRevision、Approval 每一类 entity MUST 通过现有 public MCP route 直接覆盖：same-content created=false、different-content id_conflict、replacement actor_not_allowed、replacement 后 frozen actor same-content success、disabled frozen actor actor_not_allowed、re-enable 后 same-content success。
  - 每次 MCP same-content retry、id_conflict 或 actor_not_allowed 前后 MUST 分别调用 room_get_state 并 deepEqual 完整 response；不得用 shared service helper、repository query 或 Event count 代替 public evidence。
  - wrong-role 代表路径继续由 room-service direct regression 中 Plan/Revision/Approval 各一个 REVIEWER case 覆盖。不得新增 caller-controlled actor_role、测试专用 MCP tool、compatibility route 或 production wiring。
  - 保留全部既有 positive graph、scope recovery、assignment replacement、retry、MCP、Status、Plugin/setup、Execution Core 与 SQLite race assertions；不得删除、skip、todo、重命名以掩盖覆盖或弱化无关 Oracle。
  - candidate DEVELOPMENT_LOG MUST 记录 Review 2 三项 confirmed finding、Fix Task 2 实际 changed files、验证结果、deviation、unresolved 与 REVIEW_REQUIRED 状态，并明确 Fix Task 1 production file provenance correction。
  - Fix Task 2 Coding Result MUST 使用现有 required fields；summary 明确前次 changed_files correction，changed_files 只列本次实际修改，documentation_changes 精确列 candidate DEVELOPMENT_LOG。不得增加伪造的 prior_result 或把 historical file 当作本次修改。
  - candidate 文档只记录 Fix Candidate / Review Required；active runtime 仍为 v0.3，Increment 12 未接受、未 versioned、未 cutover，Increment 13 未开始。

non_goals:
  - 修改 src 下任何 production code、public API、MCP tool、repository、scheduler、snapshot implementation 或 Runner/Git Observer。
  - 新 schema/table/index/field、Event type、error code、state transition、protocol version、migration、pointer、cache、hash、checksum 或 fingerprint。
  - Git Controller、GitAction、managed worktree、integration_only、automatic reconcile/launch/acceptance、background scheduler 或 Increment 13 能力。
  - 为 wrong-role 测试增加 caller-controlled role、测试专用 route/tool、mock production authority 或 compatibility path。
  - 重构 test framework、建立通用 snapshot library、新 module/dependency、修改 package/lockfile、Plugin、setup、AGENTS.md、CLAUDE.md 或 global config。
  - 启动 Claude/Agent Room Run、创建 Codex task、runtime/database/binding cutover、旧 database 处理或真实 Plugin install/reload。
  - stage、commit、push、merge、rebase、reset、restore、clean、checkout、branch/worktree 创建删除或任何其它 Git write。

architecture_decisions:
  - 本 Fix 不改变 Increment 12 production architecture、protocol 或 ownership；六项 Fix Task 1 production behavior 保持原样。
  - 零写结论由完整 public durable snapshot 拥有；selected collection、Event count 或 production-derived expected value不能替代该 Oracle。
  - 并发 loser 的零写以“race 最终状态等价于只发生同一 winner 的状态”表达；winner 的合法 write 不被错误要求整体 rollback。
  - MCP actor role 继续由 fixed route participant 与 tool-required role 派生；不可表达的 wrong-role path 在最窄 RoomService public boundary直接覆盖，不扩展产品接口。
  - Coding Result 的 current changed_files 与 historical correction 分离：前者只描述本次 Diff，后者通过 summary 和 Development Log 更正 provenance。

scope:
  - review_fixes_only
  - tests/plan-scheduler.test.ts 中 complete public snapshot Oracle 与并发 single-winner control evidence
  - tests/room-mcp.test.ts 中 Plan/TaskGraphRevision/Approval public retry matrix 与 room_get_state zero-write Oracle
  - docs/documents/DEVELOPMENT_LOG.md 中 Fix Task 1 provenance correction及 Fix Task 2 candidate事实

constraints:
  - Work only in the original candidate worktree C:/Users/RM/.codex/worktrees/a1da/codex-claudecode-room; preserve its complete Increment 12 task-owned staged/unstaged/untracked Diff and exact lineage baseline 51c9a50c83064fb9e2e4cc83e2f3942e4e06e5ae.
  - Candidate worktree remains detached with 0 staged。不得创建或切换 branch/worktree，不得 commit、stage、clean、reset、restore 或覆盖原 candidate Diff。
  - 本 Contract 位于主工作区 D:/agent/case/codex-claudecode-room/docs/documents/INCREMENT_12_FIX_TASK_2.md；只有全文 Accepted 后才能人工完整注入，摘要不得替代 Contract。
  - 测试 expected snapshot、error、status、entity content 与 control outcome MUST 来自测试侧 literal/fixture；不得从 production current-revision、scope、sort、authority 或 snapshot helper 导出 expected value。
  - 测试辅助只能服务本次多个 assertion 的最小复用；不得创建跨 suite framework、production wrapper 或可配置 abstraction。
  - 如 direct regression 证明 Review finding 或 confirmed solution 不成立，返回证据并停止受影响修改；不得为了迎合 Review 制造测试。
  - 如正确闭合证据需要 production code、public API、schema、new dependency、Plugin/runtime 或 Git write，立即停止并返回 needs_decision。

acceptance_criteria:
  - latest Draft 与 rejected 场景的 reconcile、旧 Run claim 均有逐操作完整 public snapshot deepEqual；错误分别保持 no materialization 与 plan_revision_not_approved。
  - blocked/scope_violated acceptReview 以完整 snapshot 证明零写；descendant reconcile 保持零 materialization 与零 durable write。
  - 两连接 concurrency race 恰好一成功、一 concurrency_limit_reached；race 完整最终 snapshot 与只执行同一 winner claim 的独立 control outcome 等价，无 loser Attempt/Event/entity/cursor residue。
  - Plan、TaskGraphRevision、Approval 三类 public MCP route 均直接证明 same-content、different-content、replacement、replacement 后 frozen success、disabled 与 re-enable matrix；每个零写操作有完整 room_get_state deepEqual。
  - wrong-role 仍由三类 RoomService direct regression 覆盖，且 production MCP surface 未变化。
  - Fix Task 1 production paths provenance 被明确更正；Fix Task 2 Coding Result 的 changed_files 与实际 Git Diff exact一致。
  - typecheck、三组 focused suites、full npm test、scope/residual scan 与 Diff hygiene 全部通过，零 fail/skip/todo，未引入 production、Git/hash 或 Increment 13 变更。

verification:
  - command: npm run typecheck
    detects: test fixture、public snapshot shape 与 current TypeScript contracts 的 drift。
    decision_if_failed: 只修复本 Fix test/documentation 类型问题；不得修改 production type 或使用 any、ts-ignore、skipLibCheck。
  - command: node --test "tests/plan-scheduler.test.ts" "tests/room-service.test.ts" "tests/room-state-snapshot.test.ts" "tests/execution-core.test.ts"
    detects: 完整 rollback Oracle 未闭合、并发 control outcome 不等价、blocked dependency/scope recovery 或既有 production regression。
    decision_if_failed: 只修复本 Fix test fixture/assertion；若 production 行为与已确认方案冲突则返回 needs_decision。
  - command: node --test "tests/room-mcp.test.ts" "tests/status-cli.test.ts" "tests/e2e-workflow.test.ts"
    detects: Plan/Revision/Approval public retry matrix、room_get_state zero-write 或 public consumer regression 未闭合。
    decision_if_failed: 只修复 public test setup/assertion；不得扩展 MCP tool、route 或 production role input。
  - command: node --test "tests/plugin-setup.test.ts" "tests/plugin-packaging.test.ts" "tests/multi-project-e2e.test.ts" "tests/scope.test.ts"
    detects: test-only Fix 是否引入 scope、Plugin/setup、cross-project 或 Increment 13 漂移。
    decision_if_failed: 移除本 Fix 引入的越界；不得放宽 scope test 或修改 Plugin/setup 掩盖失败。
  - command: npm test
    detects: focused 范围外的 Stage 1/2、Runner、Git Observer、Plugin/setup 或 historical MVP regression。
    decision_if_failed: 只修复本 Fix 引入的 test regression；不得删除、skip 或弱化既有 Oracle。
  - command: rg -n "createHash|sha256|checksum|fingerprint|integration_only|GitAction|create_worktree|commit_paths|integrate_fast_forward" src plugins/agent-room/skills/agent-room tests
    detects: Fix 是否引入 hash/replacement validator、production scope 或 Increment 13 capability。
    decision_if_failed: 删除本 Fix 引入的越界；既有 negative literal 只人工分类记录，不机械删除。
  - command: git diff --check
    detects: whitespace、merge marker 或 patch hygiene 错误。
    decision_if_failed: 只修复本 Fix 新增格式错误，不格式化无关文件。
  - command: git status --short
    detects: staging、unexpected files、original candidate ownership 或 test/result-only scope drift。
    decision_if_failed: 不执行 Git 写入或清理；报告 unexpected ownership 并返回 needs_decision。

documentation_updates:
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: >
      记录 Review 2 confirmed solutions、Fix Task 1 changed-files provenance correction、Fix Task 2
      actual changed files/verification/deviation/unresolved 与 Fix Candidate / Review Required 状态；
      不改变 Architecture、Room Protocol、ADR、Operations 或 Current runtime。

question_policy: >
  如果正确闭合 finding 需要 production source/API/schema/Event/state/error、MCP tool/route/role input、
  new dependency/framework、Plugin/setup/runtime/binding、Git/hash/Increment 13 capability、active runtime
  cutover、旧 database 处理或任何 Git write，立即停止受影响工作并返回 needs_decision。完整 snapshot
  fixture 的局部组织、race control database 的测试侧 normalization 与 test case placement 可在本文冻结
  行为内作最小选择，并在 Coding Result deviations 记录。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: "2026-09-01T00:00:00Z"
```

## 3. Candidate 与派发边界

- 本文已由用户全文确认，状态为 `Accepted`、`confirmed_by_user=true`，阶段为 `FIX_PLAN_READY`。
- 用户选择自行人工派发；Codex 不创建 Codex task、不启动 Claude/Agent Room Run，也不修改 candidate。
- 人工派发必须完整注入 Accepted 本文，并在原 detached candidate worktree 继续；不得使用摘要、复制 candidate 或重建 baseline。
- Coding 完成后只进入 `REVIEW_REQUIRED`；Claude Code 不得自行接受、stage、commit、push、cutover 或清理。

## 4. 相关文档

- [Increment 12 Fix Task 1](./INCREMENT_12_FIX_TASK_1.md)
- [Increment 12 Accepted Contract](./INCREMENT_12_TASK_CONTRACT.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [MVP Plan](./MVP_PLAN.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
