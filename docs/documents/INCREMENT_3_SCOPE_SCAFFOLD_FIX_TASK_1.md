# Increment 3 Scope Scaffold Fix Task 1

> 状态：Accepted
> 用户确认日期：2026-08-24
> Review ID：`review-increment-003-scope-scaffold-codex-001`
> Bootstrap transport：`claude -p --resume`
> 派发状态：已完成，Codex 二次 Review approved

```yaml
task_id: increment-003-scope-scaffold-fix-001
room_id: bootstrap-codex-claudecode-room
type: fix
parent_task_id: increment-003-scope-scaffold
based_on_review_id: review-increment-003-scope-scaffold-codex-001

background: >
  Scope Scaffold Implementation 只修改了 tests/scope.test.ts，npm run typecheck 与 57 项
  npm test 均通过。Codex Review 发现 Runner entry 只按名称校验：当
  src/runner/claude-process.ts 是 directory 而不是 root-level file 时，聚焦 Scope test
  仍以 exit 0 通过。该行为违反 Accepted Contract 明确要求的“只允许两个 root-level
  leaf file，任何 directory 必须失败”。用户已确认以下最小解决方案。

goal: >
  使 Increment 3 Scope regression 在保留两个可选 leaf filename 的同时，拒绝
  src/runner 下任何 directory，包括名称恰好等于批准 leaf filename 的 directory。

confirmed_findings:
  - finding_id: inc3-scaffold-r1-runner-entry-type
    solution: >
      使用 readdirSync(..., { withFileTypes: true }) 获取 Dirent；每个合法 Runner entry
      必须同时满足 entry.isFile() 与名称属于 literal allowedRunnerFiles。保持现有 0/1/2
      optional leaf 语义，不提取 helper，不修改其它 boundary。

requirements:
  - 只修改 tests/scope.test.ts；不得修改或创建任何其它 tracked file。
  - src/runner 不存在时继续通过，不得为完成 Fix 持久创建 src/runner、placeholder、empty file 或 .gitkeep。
  - src/runner 存在时使用 Dirent 同时校验 entry type 与 literal filename。
  - claude-process.ts 与 claude-stream.ts 只有在各自为 root-level regular file 时才允许；两者保持任意 0/1/2 组合。
  - src/runner 下任何 directory 都必须失败，包括名称为 claude-process.ts 或 claude-stream.ts 的 directory。
  - 其它 filename、nested entry、src/mcp、src/cli、其它未批准顶层 module 与 dependency drift 的既有拒绝语义保持不变。
  - 失败信息必须指出 src/runner 下的实际不合法 entry；不增加通用 filesystem-policy helper 或未来扩展机制。

non_goals:
  - 实现或创建 Runner、Claude Process Transport、Claude Stream Interpreter、MCP、CLI、fixture 或 placeholder。
  - 修改 src/**、其它 tests/**、package.json、package-lock.json、tsconfig.json 或共享文档。
  - 改变 allowed filename、dependency baseline、protocol、Room state、Git Observer 或 lifecycle。
  - 处理 security、symlink race、encoding、concurrency 或本 Review 未确认的问题。
  - commit、push、stage、branch/worktree mutation、merge、rebase、reset、restore、clean、checkout 或历史改写。

architecture_decisions:
  - Scope regression 的 Oracle 继续由测试侧 literal 拥有；Dirent 只用于区分批准的 file 与任何 directory。
  - 最小修复位于现有 runner entry loop，不新增 helper、manifest、schema、dependency 或产品实现。

scope:
  - review_fixes_only
  - tests/scope.test.ts 中 src/runner entry 的 file-type 与 literal filename 联合校验。

constraints:
  - 保留原始 baseline_head 1416de2429e2124192442e8b6e7db3645db805c6。
  - 当前 branch 为 codex/increment-003-scope-scaffold，target worktree 为 D:/agent/case/codex-claudecode-room-increment-003-scope-scaffold。
  - 恢复原 Implementation Task 的 Claude session；Fix 继续修改当前未提交的 task-owned Diff。
  - 保留 Codex 创建的本 Fix Contract，不修改、删除或把它报告为 Claude changed_files。
  - 临时 filesystem 验证必须在 finally/等价 cleanup 中删除本次创建的 src/runner；完成后 Git status 只能保留 tests/scope.test.ts 与 Codex-owned Fix Contract。
  - 不运行 formatter，不重排无关代码，不修改测试名称或 dependency assertion。

acceptance_criteria:
  - 当前 no-runner baseline 的聚焦 Scope test 通过。
  - claude-process.ts file、claude-stream.ts file 及两者同时存在时聚焦 Scope test 均通过。
  - 名称为 claude-process.ts 的 directory 使聚焦 Scope test 以非零退出失败。
  - 名称为 claude-stream.ts 的 directory 使聚焦 Scope test 以非零退出失败。
  - 任意其它 file 或 directory 继续失败；src/mcp、src/cli、其它顶层 module 与 dependency literal assertion 不变。
  - npm run typecheck 与 npm test 全部通过；既有 57 项测试无回归。
  - 最终 Claude-owned Diff 仍仅为 tests/scope.test.ts，且只增加完成 confirmed finding 所需的最小 Dirent 校验。

verification:
  - command: node --test "tests/scope.test.ts"
    detects: no-runner baseline 或现有 module/dependency boundary 被 Fix 破坏。
    decision_if_failed: 不得报告 completed；只修复本 finding 引入的 regression。
  - command: temporary 0/1/2 regular-file and allowed-name-directory matrix
    detects: >
      两个批准 leaf file 组合被错误拒绝，或名称为批准 leaf 的 directory 仍被错误接受。
    decision_if_failed: 不得报告 completed；只调整现有 Dirent + literal filename 联合校验，并清理全部临时 entry。
  - command: npm run typecheck
    detects: readdirSync Dirent overload、entry narrowing 或 assertion code 的 TypeScript 偏移。
    decision_if_failed: 不得报告 completed；只修复 tests/scope.test.ts 的类型错误。
  - command: npm test
    detects: Fix 破坏既有 Protocol、Room、Git、Scope 或 dependency regression。
    decision_if_failed: 不得报告 completed；若必须扩大 scope 则返回 needs_decision。
  - command: git diff -- tests/scope.test.ts
    detects: Diff 是否仅包含 confirmed finding 的最小修复，无其它实现、测试或配置变化。
    decision_if_failed: 移除本 Fix 产生的越界修改；无法安全处理则返回 needs_decision。

documentation_updates: []

question_policy: >
  若正确修复需要改变 allowed leaf interface、其它 Scope boundary、dependency、共享文档、
  protocol、Room lifecycle、Runner 实现或任何其它文件，停止并返回 needs_decision。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: 2026-08-24T07:01:13Z
```

## 相关文档

- [Scope Scaffold Task Contract](./INCREMENT_3_SCOPE_SCAFFOLD_TASK_CONTRACT.md)
- [Increment 3 Parallel Pilot Plan](./INCREMENT_3_PARALLEL_PILOT_PLAN.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
