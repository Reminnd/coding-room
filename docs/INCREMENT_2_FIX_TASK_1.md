# Increment 2 Fix Task 1

> 状态：Accepted
> 用户确认日期：2026-08-24
> Review ID：`review-increment-002-codex-001`
> Bootstrap transport：`claude -p`
> 派发状态：已完成，Codex 二次 Review approved

```yaml
task_id: increment-002-fix-001-git-failure-semantics
room_id: bootstrap-codex-claudecode-room
type: fix
parent_task_id: increment-002-git-preconditions-evidence
based_on_review_id: review-increment-002-codex-001

background: >
  Increment 2 Implementation 的 typecheck 与 55 项测试通过，正常 repository、HEAD、
  clean/dirty worktree 和三类 evidence 行为正确。Codex Review 通过临时 repository
  fault injection 复现：当 evidence command 因损坏的 index 以 exit 128 失败时，runGit
  将失败分类为 missing，collectEvidence 又把 null stdout 解析为空 array，导致
  establishCleanBaseline 错误返回 clean baseline。Review 同时确认异步 execFile 的 stderr
  来自 callback 第三个参数，当前 GitCommandError 丢失该 diagnostic；non-existent target
  测试还会稳定遗留 makeFixture 创建的 parent temporary directory。用户已确认以下三项
  finding 与最小解决方案。

goal: >
  在保持 Git Observer public API、只读 Git command set 与架构边界不变的前提下，确保
  evidence command 的任何非零失败都不能被解释为 clean/empty evidence，并使
  GitCommandError diagnostic 与 temporary-repository cleanup 符合已批准交付事实。

confirmed_findings:
  - finding_id: inc2-r1-evidence-exit-128
    solution: >
      将 Git process failure 与 repository/HEAD 的业务缺失语义分离：runGit 对非零退出保留
      command、args、cwd、exitCode 与 stderr 并抛出 GitCommandError；只有
      resolveWorktreeRoot 和 resolveBaselineHead 在各自 semantic boundary 将预期的
      exit 128 映射为 git_repository_missing / git_head_missing。collectEvidence 不得捕获或
      降级 diff/ls-files failure，因此 establishCleanBaseline 与 collectCompletionEvidence
      在 evidence command fatal failure 时都必须拒绝，而不是返回 empty evidence。
  - finding_id: inc2-r1-git-error-stderr
    solution: >
      从异步 execFile callback 的第三个 stderr 参数读取 Buffer/string diagnostic，并传给
      GitCommandError；不得继续从普通 error object 假设 stderr 属性存在。
  - finding_id: inc2-r1-temp-fixture-cleanup
    solution: >
      non-existent target 测试显式保留 makeFixture 返回的 parent path，并在 finally 中删除
      该 parent，确保成功或 assertion failure 都不遗留本测试创建的 temporary directory。

requirements:
  - runGit 的成功结果必须继续保留原始 Buffer stdout；任何 Git 非零退出必须以 GitCommandError 向上抛出，不返回可被解析为成功 evidence 的 null stdout。
  - GitCommandError 必须保留实际 command、args、cwd、数字 exitCode（不存在时为 null）与 execFile callback stderr。
  - resolveWorktreeRoot 继续把 non-repository、bare repository、不存在或非目录 target 映射为 git_repository_missing。
  - resolveBaselineHead 继续把 HEAD 不可解析为 commit 映射为 git_head_missing，并继续使用 git rev-parse --verify --end-of-options HEAD^{commit}。
  - establishCleanBaseline 在 staged、unstaged、untracked command 任一失败时必须拒绝，不得返回 CleanBaseline。
  - collectCompletionEvidence 在 staged、unstaged、untracked command 任一失败时必须拒绝，不得返回 empty GitEvidence。
  - 使用 isolated temporary repository 直接覆盖两个 public operation 的 evidence fatal-failure path；测试不得依赖实现导出的 classification helper 作为 Oracle。
  - 保持现有正常 repository、missing repository、missing HEAD、dirty gate、path classification、stable sort、dedup、subdirectory、ignored path 与只读 invariant 测试。
  - 修正 non-existent target fixture cleanup；测试成功与失败路径均删除实际创建的 parent directory。
  - 更新 DEVELOPMENT_LOG.md，记录 Review 1、Fix 1、实际 changed files、验证结果、偏差和 REVIEW_REQUIRED / Increment 2 状态。

non_goals:
  - 修改 GitEvidence、CleanBaseline 或两个 public operation 的 external shape。
  - 新增 protocol error code、修改 ROOM_PROTOCOL、State Machine、SQLite repository、Runner、MCP 或 CLI。
  - 增加 retry、fallback、Git status parser、saved patch、hash、checksum、fingerprint、cache 或 second authority。
  - 新增 dependency、process wrapper、test framework、feature flag、compatibility layer 或 generic command abstraction。
  - 处理对抗性 operator、并发修改同一 worktree、exotic path encoding 或本 Review 未确认的问题。
  - 修改 AGENTS.md、CLAUDE.md、PROJECT_RULES.md、ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、ADR、package.json、package-lock.json 或 tests/scope.test.ts。

architecture_decisions:
  - Git process boundary 只报告 process success/failure 与原始 output；repository_missing 和 head_missing 继续由了解 operation intent 的 semantic boundary 映射。
  - evidence 只有在对应 Git command 成功后才能解释为空 set；failure 与 empty 是不同状态，不增加第三份持久化状态。
  - Git CLI、execFile argument array、NUL-delimited output 与 repository-root cwd 保持不变。

scope:
  - review_fixes_only
  - src/git/git-process.ts 的非零退出与 stderr 传播语义。
  - src/git/git-observer.ts 的 repository/HEAD ProtocolError 映射与 evidence failure propagation。
  - tests/git-observer.test.ts 的两个 public-path fatal-failure regression 与 temporary fixture cleanup。
  - DEVELOPMENT_LOG.md 的 Review/Fix 实现事实与阶段同步。

constraints:
  - 保留 Increment 2 原始 baseline_head 6e7e5eb8869b2947d7738f1f23b6eb7fdde64742。
  - 当前 branch 为 main，target worktree 为 D:/agent/case/codex-claudecode-room；Fix 继续修改当前未提交的 Increment 2 task-owned Diff。
  - 只修改完成三项 confirmed finding 所必需的实现、测试与 DEVELOPMENT_LOG.md；保留 Codex 创建的本 Fix Contract 与 PROJECT_RULES.md 状态更新，不覆盖或整理其他文件。
  - product code 继续只能执行 rev-parse、diff 与 ls-files；不得执行任何 Git mutation command。
  - 不执行 commit、push、checkout、reset、restore、clean、branch、worktree 或 history rewrite。

acceptance_criteria:
  - 有合法 HEAD 但 index 损坏的 temporary repository 调用 establishCleanBaseline 时抛出 GitCommandError，不返回 CleanBaseline 或 worktree_not_clean。
  - 等价 fixture 直接调用 collectCompletionEvidence 时抛出 GitCommandError，不返回 empty GitEvidence。
  - fatal evidence error 保留实际 command、args、repository-root cwd、exitCode=128 与非空 stderr；测试不精确匹配平台相关完整英文错误文本。
  - non-repository、non-existent target 仍返回 git_repository_missing；无 commit worktree 仍返回 git_head_missing。
  - 现有 clean/dirty evidence、root-relative path、stable sort、dedup、ignored path、只读 invariant 与 mutation-command boundary 全部继续通过。
  - non-existent target 测试不遗留 makeFixture 创建的 parent temporary directory。
  - npm run typecheck、聚焦 Git Observer tests 与完整 npm test 全部通过；Increment 1 的 46 项测试无回归。
  - DEVELOPMENT_LOG.md 与实际 Fix 行为、测试计数及 REVIEW_REQUIRED 状态一致。

verification:
  - command: node --test "tests/git-observer.test.ts"
    detects: >
      两个 public operation 仍把 fatal evidence failure 解释为 clean/empty、GitCommandError
      丢失 process context/stderr、ProtocolError 映射回归、temporary fixture 泄漏，或既有
      Git Observer public behavior 被破坏。
    decision_if_failed: 不得报告 completed；仅修复本 Review 的 confirmed finding 后重跑。
  - command: npm run typecheck
    detects: execFile callback、GitCommandError、Buffer output 或 public operation error flow 的 TypeScript 偏移。
    decision_if_failed: 不得报告 completed；修复本 Fix 引入的类型错误。
  - command: npm test
    detects: Fix 破坏 Increment 1 protocol/state behavior、Increment 2 scope/dependency baseline 或完整 Git Observer regression。
    decision_if_failed: 不得报告 completed；只修复 task-owned regression，若必须扩大范围则返回 needs_decision。

documentation_updates:
  - path: DEVELOPMENT_LOG.md
    expected_change: 记录 Increment 2 Review 1、Fix 1、fatal-path regression、实际命令结果与 REVIEW_REQUIRED 状态。

question_policy: >
  若正确修复需要改变 public API、protocol error set、Git state ownership、architecture、
  dependency baseline、approved command set、package metadata 或处理未确认 finding，停止并
  返回 needs_decision；不得自行扩大范围。

confirmed_by_user: true
created_by: codex
created_at: 2026-08-24T04:00:14Z
```

## 相关文档

- [Increment 2 Task Contract](./INCREMENT_2_TASK_CONTRACT.md)
- [ROOM_PROTOCOL.md](./ROOM_PROTOCOL.md)
- [PROJECT_RULES.md](../PROJECT_RULES.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
