# Increment 11 Fix Task 1 — Complete Invalid-Path Oracles and Current Documentation

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | 原 Increment 11 Codex Coding task：`gpt-5.6-sol` / `medium` |
| 创建与确认日期 | 2026-08-31 |
| Based on Review | `review-increment-011-codex-001`（`changes_requested`） |
| Parent Contract | [Increment 11 Task Contract](./INCREMENT_11_TASK_CONTRACT.md) |
| Exact baseline | `c449f40aebe3ff018610c59f34782a698463f907` |

## 1. Accepted boundary

用户已确认 Review 1 的两项 finding 与本文件冻结的最小方案。本 Fix 只补完整 invalid-path regression Oracle，并使 Current 文档准确反映 Increment 11 已完成 Coding、Review 1 要求修改和 Fix Coding 状态；不得恢复任何 hash/revision validation，不改变已通过 Review 的 production 行为。

```yaml
task_id: increment-011-fix-001-complete-oracles-and-docs
type: fix
parent_task_id: increment-011-remove-git-baseline-hash-validation
based_on_review_id: review-increment-011-codex-001
review_fixes_only: true

background: >
  Increment 11 candidate已从exact baseline c449f40aebe3ff018610c59f34782a698463f907完成Coding。
  Codex Review确认production、Plugin与baseline-free正向行为正确，typecheck及353/353 tests通过，
  但Accepted Contract要求的若干invalid public path仍缺少完整durable snapshot、零process/artifact与
  combined/pre-claim直接Oracle；Current入口文档仍停留在PLAN_READY并声称task待创建。

goal: >
  在不修改已通过Review的production contract、不恢复任何hash/revision authority的前提下，补齐
  Increment 11 invalid public-path的完整零副作用与idempotency回归证据，并使Current文档准确描述
  Review 1与Fix Coding阶段，使完整candidate可再次Review。

confirmed_findings:
  - finding_id: inc11-r1-invalid-oracle-incomplete
    severity: medium
    evidence: >
      当前tests分别覆盖部分dirty、Git failure、wrong-worktree与claim retry/conflict结果，但没有对
      combined dirty first attempt、damaged-index pre-claim、wrong canonical worktree continuation以及
      same-ID claim retry/conflict统一比较调用前后完整public durable snapshot；process/artifact适用路径也
      未全部直接断言零调用与零创建。因此353/353绿灯不能证明Accepted invalid rollback矩阵完整闭合。
    confirmed_solution: >
      仅在既有public test boundary补最小snapshot helper/fixture与direct regressions；每个拒绝路径比较
      完整public durable snapshot，process/artifact适用时同时证明零副作用。不得以内部repository断言
      替代public path，不得修改production source来迁就测试。
  - finding_id: inc11-r1-current-docs-stale
    severity: medium
    evidence: >
      PROJECT_RULES.md与docs/documents/README.md仍标记Increment 11为PLAN_READY、clean baseline或task创建
      pending，与实际exact baseline、Coding完成、Review changes_requested及Fix已确认事实冲突。
    confirmed_solution: >
      只更新Current状态入口、文档索引与Development Log，使其准确记录Review 1、Accepted Fix Task、
      原Coding task continuation及candidate/Review Required边界；不得把candidate写成Current capability或Accepted。

requirements:
  - 为受影响invalid public paths建立或复用完整public durable snapshot；snapshot MUST覆盖Room、Task、Run、RunAttempt、Review、Question、Guidance、Participant、RoleAssignment、Event及cursor等该public snapshot实际暴露的全部durable集合，不得只比较计数或局部entity。
  - 通过public Executor/CLI边界直接覆盖first attempt同时存在staged、unstaged与untracked evidence；拒绝必须发生在attempt claim、worker process、Event与artifact之前，错误保持`worktree_not_clean`。
  - 通过public first-attempt claim边界直接覆盖damaged Git index；Git failure必须原样传播为既有stable public error，完整durable snapshot不变，worker process零调用、artifact零创建。
  - 通过public continuation边界直接覆盖different canonical worktree；保持既有stable validation error，完整durable snapshot不变，worker process零调用、artifact零创建。
  - 对same-ID claim retry证明返回existing/`created=false`语义且完整durable snapshot不变；对same ID/different remaining content证明`id_conflict`且完整durable snapshot不变。
  - 保留并继续验证clean committed、clean unborn、same-worktree HEAD/branch/commit drift、staged-only、unstaged-only、untracked-only与Git spawn/exit/buffer failure既有Oracle；不得删除、skip、todo或弱化无关assertion。
  - 更新`PROJECT_RULES.md`、`docs/documents/README.md`与`docs/documents/DEVELOPMENT_LOG.md`的Increment 11当前事实；Coding完成时应标记Fix candidate=`REVIEW_REQUIRED`，active runtime仍为v0.3，v0.4尚未接受、版本化或cutover。

non_goals:
  - 修改`src/**`、active Plugin behavior、schema、protocol、repository、RoomService、Executor、CLI或runtime逻辑。
  - 恢复`baseline_head`、`observed_baseline_head`、`git_head_missing`、commit-object probe、branch mirror、content hash、checksum、fingerprint或任何替代revision authority。
  - 新增dependency、compatibility/migration layer、defensive wrapper、Stage 3 capability或额外test abstraction。
  - 接受Increment 11、切换v0.4 runtime/database/binding，或修改active v0.3 runtime。
  - 创建Agent Room Task/Run、启动Claude、创建新Codex task。
  - commit、stage、push、merge、rebase、reset、clean、checkout或创建/删除branch/worktree。

architecture_decisions:
  - Review已确认baseline-free production与active Plugin行为正确；本Fix是test/documentation-only。
  - invalid-path Oracle必须从public operation前后的完整durable snapshot证明rollback，适用路径另外证明process/artifact为零。
  - snapshot helper只服务当前重复断言；保持现有test style，不抽象production API或建立第二authority。
  - Current文档记录workflow事实；candidate架构/协议仍保持Candidate/Review Required，不提前提升为Current。

scope:
  - tests/git-observer.test.ts
  - tests/claude-runner.test.ts
  - tests/room-service.test.ts
  - tests/runner-cli.test.ts
  - tests/fixtures.ts only if an existing fixture cannot express combined dirty or damaged index
  - PROJECT_RULES.md
  - docs/documents/README.md
  - docs/documents/DEVELOPMENT_LOG.md
  - docs/documents/MVP_PLAN.md only if its current stage statement is stale

constraints:
  - Work only in the original Increment 11 Coding task and preserve its complete task-owned Diff.
  - Keep exact baseline c449f40aebe3ff018610c59f34782a698463f907; do not create or switch worktrees/branches.
  - Do not modify production source. If a required public regression exposes a real production defect, stop and return `needs_decision` with the minimal reproduction and affected invariant.
  - Use the smallest test changes matching existing helpers and style; every changed line must trace to a confirmed finding.
  - Do not repeat expensive checks unless their failure would change the completion decision.

acceptance_criteria:
  - Combined staged+unstaged+untracked first attempt is rejected on a public execution path before attempt/process/Event/artifact, with complete public durable snapshot unchanged.
  - Damaged-index first attempt propagates the existing Git failure on a public execution path before claim/process/artifact, with complete public durable snapshot unchanged.
  - Different canonical worktree continuation is rejected on a public execution path before process/artifact, with complete public durable snapshot unchanged.
  - Same-ID/same-content claim retry and same-ID/different-content conflict each prove exact response/error semantics and complete public durable snapshot unchanged.
  - Existing positive unborn/drift behavior and all hash-removal scans remain green; no production or Plugin behavior changed.
  - Current documents no longer claim Increment 11 is PLAN_READY or waiting for clean baseline/task creation; they report Fix candidate Review Required after Coding while active runtime remains v0.3.
  - Typecheck, focused suites, full npm test and diff hygiene pass with zero skip/todo.

verification:
  - command: rg -n "baseline_head|observed_baseline_head|git_head_missing|HEAD\\^\\{commit\\}" src plugins/agent-room
    detects: production或active Plugin重新引入hash/revision contract。
    decision_if_failed: 删除Fix引入的残留；若是pre-existing候选残留则返回needs_decision，不扩大production scope。
  - command: node --test "tests/git-observer.test.ts" "tests/claude-runner.test.ts" "tests/room-service.test.ts" "tests/runner-cli.test.ts"
    detects: confirmed invalid public-path与零副作用Oracle未闭合，或既有unborn/drift行为回归。
    decision_if_failed: 只修复test/fixture；若失败证明production defect则返回needs_decision。
  - command: npm run typecheck
    detects: test helper、fixture或candidate doc-adjacent type usage不合法。
    decision_if_failed: 修复最窄test-owned类型，不使用any、ts-ignore或skipLibCheck。
  - command: npm test
    detects: focused范围外的Protocol、Room、Runner、MCP、Plugin或历史MVP回归。
    decision_if_failed: 只修复由本Fix test changes造成的问题；production defect返回needs_decision。
  - command: git diff --check
    detects: whitespace或patch hygiene错误。
    decision_if_failed: 只清理本Fix引入的格式问题。
  - command: rg -n "PLAN_READY|等待clean baseline|task创建" PROJECT_RULES.md docs/documents/README.md docs/documents/DEVELOPMENT_LOG.md
    detects: Current文档仍把Increment 11描述为未派发，或历史语境未明确标记。
    decision_if_failed: 只修正Current状态陈述；保留明确的历史记录。

documentation_updates:
  - path: PROJECT_RULES.md
    expected_change: 记录Review 1、Accepted Fix Task、原task continuation与Fix Review Required边界。
  - path: docs/documents/README.md
    expected_change: 登记Fix Task 1并同步当前阶段，不提前声明candidate为Current或Accepted。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录findings、用户确认、Fix changed files、verification与Coding Result。
  - path: docs/documents/MVP_PLAN.md
    expected_change: 仅在当前阶段陈述仍为PLAN_READY时同步为Fix Review Required；其它计划不变。

question_policy: >
  若direct public regression暴露production behavior defect，或正确修复需要修改src、Plugin、schema、protocol、
  runtime、hash/revision contract、dependency、migration、Git state或本Fix未确认范围，立即停止受影响工作并返回
  needs_decision。局部test helper/fixture组织可按existing style作最小选择并在Coding Result记录。

confirmed_by_user: true
created_by: codex
created_at: 2026-08-31T00:00:00Z
```

## 2. Dispatch

- 复用原 Increment 11 Coding task `01a05806-a6df-7301-a538-33888011241b`，不创建新task。
- 完整Contract必须内联发送，因为root权威文档不在该Codex worktree内。
- Model固定`gpt-5.6-sol`，reasoning effort固定`medium`。
- Coding task完成后只返回Candidate Coding Result；root Codex复审前不得自我接受。
