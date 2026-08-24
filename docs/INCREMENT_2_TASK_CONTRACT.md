# Increment 2 Task Contract — Git Preconditions and Evidence

> 状态：Accepted  
> 用户批准日期：2026-08-24  
> Bootstrap transport：`claude -p`  
> 派发状态：未派发

`room_id` 在本任务中是 bootstrap coordination identifier。它不声明目标 Agent Room runtime 已经存在，也不建立 Git 或 SQLite 之外的平行状态。

```yaml
task_id: increment-002-git-preconditions-evidence
room_id: bootstrap-codex-claudecode-room
type: implementation
parent_task_id: null
based_on_review_id: null

background: >
  Increment 1 已被用户接受并提交，Protocol 与 State Core 已形成稳定基础。
  MVP 的下一依赖是 Git Observer：在新 Implementation Task 开始前验证 repository、HEAD
  与 clean worktree，并在 Run 完成时提供 staged、unstaged、untracked path evidence。
  Git working tree 继续是代码与 Diff 的唯一权威来源；本任务不接入尚未实现的 Runner 或 MCP。

goal: >
  交付一个只调用 Git CLI 只读命令的最小 Git Observer，使调用方能够获得可验证的
  clean baseline，并在不修改 repository 的前提下收集 root-relative Git evidence。

requirements:
  - 在独立的 src/git infrastructure module 中实现 Git Observer，不把 Git CLI 调用放入 State Machine、SQLite repository 或 protocol schema。
  - 暴露 GitEvidence，其 staged、unstaged、untracked 均为去重、稳定排序的 repository-root-relative path array。
  - 暴露 clean-baseline operation：接收 target path，确认它属于 non-bare Git worktree，解析 worktree root，验证 HEAD 可解析为 commit，并收集三类 evidence。
  - non-repository、不是 worktree 或不存在的 target path 返回 git_repository_missing；worktree 存在但 HEAD 不可解析返回 git_head_missing。
  - staged、unstaged、untracked 任一 set 非空时，clean-baseline operation 返回 worktree_not_clean；三类 set 全空时返回 repository root、baseline_head 与 empty evidence。
  - baseline_head 必须来自 git rev-parse --verify --end-of-options HEAD^{commit} 的完整 object ID，不根据 branch name、日志或模型报告推断。
  - 暴露 completion-evidence operation：在 dirty worktree 中也能返回 staged、unstaged、untracked path；它不要求 worktree clean，也不生成或保存 patch。
  - Git path collection 使用 NUL-delimited output：staged 使用 git diff --cached --name-only -z，unstaged 使用 git diff --name-only -z，untracked 使用 git ls-files --others --exclude-standard --full-name -z。
  - 所有 evidence command 从解析出的 repository root 执行，因此 target path 位于 repository 子目录时仍检查整个 owning worktree，且返回 root-relative path。
  - 使用 Node.js child_process.execFile 或等价的无 shell Node process API 直接传递 argument array；不得拼接 shell command string。
  - product code 只能执行 Git read-only command，不得执行 add、commit、checkout、switch、reset、restore、clean、stash、merge、rebase、cherry-pick、worktree mutation 或 config mutation。
  - 测试可以在 OS temporary directory 中用 Git CLI 创建 isolated fixture repository，并执行 init、config、add、commit 等 fixture setup；这些写操作不得出现在 product Git Observer 中。
  - 已识别的前置条件失败使用现有 ProtocolError code；其他 Git process failure 必须带 command context 向上抛出，不得静默解释为 clean 或 empty evidence。
  - 更新 Increment 1 scope regression：允许 src/git，仅继续证明 Runner、MCP 与 CLI 尚未实现；不得删除对 dependency baseline 和未实现模块的负向边界。

non_goals:
  - 把 Git Observer 接入 room_submit_task、RoomService、Run lifecycle、Runner、MCP 或 Status CLI。
  - 修改 Room transition、Task/Run schema、SQLite table、protocol error code set 或持久化 baseline/evidence。
  - 收集 diff content、patch、line statistics、blob content、commit history、remote、branch policy 或 author metadata。
  - 自动 stage、commit、checkout、reset、restore、clean、stash、branch、worktree、merge、rebase、cherry-pick 或 push。
  - 保存 diff.patch、Git mirror、checksum、fingerprint、cache 或第二份代码状态。
  - 引入 simple-git、第三方 process wrapper、第三方 test framework、formatter 或 lint framework。
  - 为多用户、对抗性 operator、并发修改同一 worktree 或 exotic path encoding 增加防御层。
  - 修改 AGENTS.md、CLAUDE.md、PROJECT_RULES.md、ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md 或 ADR。

architecture_decisions:
  - Git CLI 继续是唯一 Git integration dependency；不增加 npm dependency，不修改 package-lock.json。
  - Git Observer 是 infrastructure boundary；State Machine 不执行 Git，Room repository 不保存 live Diff mirror。
  - Git path set 分别由 diff/index/worktree 命令获得，不解析 human-readable git status，也不依赖换行分隔或 core.quotePath。
  - clean baseline 是一次明确 application precondition check 的返回值；Increment 2 不新增数据库 column 或 runtime pointer。
  - target path 可以是 worktree root 或其子目录；Observer 解析 owning worktree root，并检查整个 worktree，避免只观察子目录而遗漏同一 Git state owner 的变更。
  - evidence 只包含 path classification，不复制 Coding Result 中的 purpose，也不把 evidence 当作实时 repository 的替代品。
  - 当前产品假设 cooperating operator 串行工作；本增量不引入 file lock、snapshot hash 或重复确认循环。

scope:
  - src/git 下的 Git Observer、Git process 调用与 evidence type。
  - Increment 2 的 temporary-repository focused integration tests。
  - 对 tests/scope.test.ts 的最小边界更新。
  - 如有必要，将 package description 从 Increment 1 专属描述改为项目级描述；不得改变 dependency 或 script baseline。
  - 本任务实现事实对应的 DEVELOPMENT_LOG.md 候选更新。

constraints:
  - 派发前必须记录实际 baseline_head，并满足 bootstrap clean-worktree gate；当前未提交的既有文档修改不得被本任务吸收、覆盖或回滚。
  - 所有行为必须符合 PROJECT_RULES.md、ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、Accepted ADR 与角色细分指南。
  - 不得修改已批准 Git state ownership、error semantics 或 Runner/Room 责任边界来迁就实现。
  - 不得增加 dependency；确有必要时返回 needs_decision。
  - 对路径使用 argument array 和 cwd，不使用 shell quoting workaround。
  - 不为 Increment 3 Runner 预建 fake process framework、generic command bus、plugin interface 或 placeholder wiring。
  - 只修改 task-owned scope；保留工作区中既有的并行协作文档修改。

acceptance_criteria:
  - non-repository temporary directory 直接调用 clean-baseline operation 返回 git_repository_missing。
  - git init 后尚无 commit 的 worktree 返回 git_head_missing，且不被误报为 clean baseline。
  - clean repository 返回与独立 git rev-parse HEAD 相同的完整 baseline_head、正确 repository root 和三个 empty array。
  - staged-only、unstaged-only、untracked-only fixture 分别使 clean-baseline operation 返回 worktree_not_clean。
  - 一个组合 fixture 精确证明 completion evidence：staged path、unstaged path、同一 path 同时 staged/unstaged、带空格的 untracked path均归入正确 set；ignored path 不归入 untracked。
  - 从 repository 子目录调用仍能观察 repository 其他目录中的变更，并返回 repository-root-relative path。
  - evidence array 去重且稳定排序；NUL parser 不把带空格 path 拆分。
  - clean 与 dirty fixture 在 Observer 调用前后具有相同 HEAD 和相同 Git status，证明 product operation 未修改 commit、index 或 worktree。
  - product Git Observer 不包含任何 Git mutation command；fixture setup 的 Git 写操作只存在于 test code。
  - npm run typecheck 无错误；Increment 1 的全部既有测试继续通过。
  - tests/scope.test.ts 继续拒绝 src/runner、src/mcp 与 src/cli，并证明没有新增 npm dependency。
  - DEVELOPMENT_LOG.md 如实记录 changed files、commands、测试结果、偏差、阻塞项和 REVIEW_REQUIRED / Increment 2 状态。

verification:
  - command: npm run typecheck
    detects: child_process API、Buffer/string parsing、ProtocolError 或 Git Observer public type 的 TypeScript 偏移。
    decision_if_failed: 不得报告 completed；修复本任务引入的类型错误。
  - command: node --test "tests/git-observer.test.ts"
    detects: repository/HEAD error mapping、clean gate、baseline、三类 evidence、root-relative path、ignored path 或只读 invariant 错误。
    decision_if_failed: 不得报告 completed；定位对应 Git public behavior 并修复后重跑。
  - command: npm test
    detects: Increment 2 实现破坏 Increment 1 protocol/state behavior，或 scope boundary/dependency baseline 发生漂移。
    decision_if_failed: 不得报告 completed；只修复 task-owned regression，若必须改变已批准 contract 则返回 needs_decision。

documentation_updates:
  - path: DEVELOPMENT_LOG.md
    expected_change: 记录 Increment 2 实际实现、Git command boundary、测试结果、偏差、阻塞项与下一阶段。

question_policy: >
  如果正确实现需要改变 requirement、scope、Git state ownership、protocol、architecture、
  persistence semantics、dependency baseline 或权限，停止受影响部分并返回 needs_decision。
  Bootstrap 阶段 room_ask_question 尚不可用，应在 Coding Result 中完整记录问题并终止本次 Run，
  不得自行决定。

confirmed_by_user: true
created_by: codex
created_at: 2026-08-24T03:13:30Z
```

## 派发前置条件

1. 已完成：用户于 2026-08-24 明确批准本 Contract。
2. 已完成：Contract 状态已改为 `Accepted`，并记录 `confirmed_by_user: true`。
3. 现有非 Increment 2 文档修改被单独处理，使目标 worktree clean；不得由本任务夹带提交。
4. Codex 在派发时重新读取 `HEAD`，记录实际 `baseline_head` 与 Git dispatch metadata。
5. 通过已批准 bootstrap transport 注入本文件全文；摘要不能替代 Contract。

## 参考文档

- [PROJECT_RULES.md](../PROJECT_RULES.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [ROOM_PROTOCOL.md](./ROOM_PROTOCOL.md)
- [MVP_PLAN.md](./MVP_PLAN.md)
- [ADR-0001](../ADR/0001-local-room-and-state-ownership.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
