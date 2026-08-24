# Increment 3 Scope Scaffold Task Contract

> 状态：Accepted
> 日期：2026-08-24
> 用户批准日期：2026-08-24
> Parent goal：Increment 3 — Claude Runner 并行 Leaf Module 试点
> Execution mode：Serial prerequisite
> Bootstrap transport：`claude -p`
> 派发状态：未派发

本 Contract 只更新共享 Scope regression，为后续两个独立 leaf branch 提供可通过的测试边界。用户已明确批准完整 Contract；批准不自动授予 documentation commit、Coding dispatch 或其它 Git 写权限。

```yaml
task_id: increment-003-scope-scaffold
room_id: bootstrap-codex-claudecode-room
type: implementation
parent_task_id: null
based_on_review_id: null

background: >
  Increment 2 已完成、Review、接受并提交。用户已确认 Increment 3 使用两个独立
  branch/worktree 试点并行 leaf module：Claude Process Transport 与 Claude Stream
  Interpreter。当前 tests/scope.test.ts 仍明确断言 src/runner 不得存在，因此任一 leaf
  branch 新增合法 Runner 文件后 npm test 都会必然失败。该共享边界不能由两个并行
  worker 分别修改，必须在派发前以一个串行 Scaffold Task 更新并形成共同 baseline。

goal: >
  仅更新 tests/scope.test.ts，使当前尚无 src/runner 的 baseline、只存在任一合法 leaf
  文件的 module branch，以及同时存在两个合法 leaf 文件的 Integration branch 都通过
  Scope regression，同时继续拒绝未批准的 central Runner、MCP、CLI 和 dependency drift。

requirements:
  - 只修改 tests/scope.test.ts；不得创建、删除或修改任何其它业务代码、测试、配置或共享文档。
  - 把现有 Increment 2 专属测试名称和 assertion 更新为 Increment 3 parallel leaf scaffold 的当前边界，不再声称 Runner 完全未实现。
  - 当前 src/runner 不存在时测试必须通过；不得为了让测试通过而创建 src/runner 目录、placeholder、empty file 或 .gitkeep。
  - src/runner 存在时，只允许 root-level claude-process.ts 与 claude-stream.ts；允许两者任意 0/1/2 组合，以支持两个独立 module branch 和后续 Integration branch。
  - src/runner 下出现任何其它 file 或 directory 时测试必须失败，包括 central runner、index barrel、shared contract、artifact、fixture 或未批准 placeholder。
  - src 顶层继续只允许现有 git、protocol、room 和可选 runner；src/mcp 与 src/cli 必须继续不存在，任何其它未批准顶层 module 必须失败。
  - dependency baseline 继续精确限定 runtime dependency 只有 zod，dev dependency 只有 @types/node 与 typescript；不得放宽为 subset、count-only 或跳过 package.json 检查。
  - assertion 必须直接检查当前 filesystem 与 package.json，不从未来 leaf implementation 导入 allowed paths、helper 或配置生成期望，保持测试 Oracle 独立。
  - 代码保持最小；允许在 tests/scope.test.ts 内声明 literal allowed path list，不提取通用 filesystem-policy helper、共享 module manifest 或 feature flag。
  - 测试失败信息应指出实际违反的 scope boundary；不增加与当前计划无关的 security、encoding、symlink 或 concurrency guard。

non_goals:
  - 创建 src/runner 或实现 Claude Process Transport、Claude Stream Interpreter、central Runner、fixture、artifact 或 integration seam。
  - 修改任何 src/** 文件、其它 tests/** 文件、package.json、package-lock.json、tsconfig.json 或 runtime directory。
  - 修改 protocol、Room state、SQLite schema、Git Observer、error code、Room lifecycle 或已确认的 CODING startup/initialization 语义。
  - 实现 MCP、Status CLI、Claude CLI invocation、stream parser、session resume、Question 或 terminal Run transition。
  - 为未来未知 Runner 文件、nested directory、plugin、adapter 或 arbitrary module 提供扩展机制。
  - 修改 PROJECT_RULES.md、ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、ADR、DEVELOPMENT_LOG.md、AGENTS.md、CLAUDE.md 或三个 Increment 3 planning/leaf Draft。
  - commit、push、branch/worktree creation、merge、rebase、cherry-pick、stage、reset、clean、checkout 或历史改写。

architecture_decisions:
  - tests/scope.test.ts 是当前 increment module/dependency negative boundary；本 Task 只把它从 Increment 2 boundary 前移到已确认的两个 leaf interface，不实现产品能力。
  - shared Scope regression 必须在并行派发前串行完成，使两个 worktree 从同一 accepted commit 继承相同 Oracle。
  - allowed Runner path 使用测试侧 literal 声明，不能由被测 src/runner 导出，以避免 implementation 与 Oracle 同源。
  - optional 0/1/2 leaf file 组合反映真实 branch lifecycle；不以 exact-two assertion 迫使 Scaffold 创建 placeholder 或使单 leaf branch 红灯。
  - package dependency baseline 保持不变；两个 leaf module 都使用 Node.js 24 与现有 Zod 4。

scope:
  - tests/scope.test.ts

constraints:
  - Coding 前读取完整 Accepted Contract、并行试点计划、两个 Leaf Draft、PROJECT_RULES.md、ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md 与相关 agent guide。
  - 执行前目标 worktree 必须 clean，baseline_head 由 Codex 在派发时记录；当前 planning Draft 必须先形成独立 documentation baseline，不得被本 Task 吸收或修改。
  - 只允许 tests/scope.test.ts 出现在 Coding Result changed_files；出现其它 path 必须视为 deviation 并回滚本 Task 自己产生的越界修改，无法安全处理则返回 needs_decision。
  - 不增加 dependency，不运行 formatter，不重排无关 import/test，不重构相邻测试。
  - 注释仅在 literal optional-leaf boundary 非显然时使用简体中文解释；不得增加逐行复述或未来框架说明。
  - 完成后停在 REVIEW_REQUIRED；不得 commit、stage 或宣布 Scaffold/Increment 3 已被接受。

acceptance_criteria:
  - tests/scope.test.ts 的测试名称准确描述 Increment 3 parallel leaf scope 和 dependency boundary，不再声称 src/runner 必须不存在。
  - 当前 baseline 没有 src/runner 时，node --test tests/scope.test.ts 通过。
  - 测试逻辑明确允许 src/runner/claude-process.ts 单独存在、src/runner/claude-stream.ts 单独存在、以及两者同时存在；不要求创建这些文件来完成 Scaffold。
  - 测试逻辑会拒绝 src/runner 下除两个批准文件外的任何 entry，包括 subdirectory。
  - src/mcp、src/cli 与其它未批准 src 顶层 module 继续被拒绝。
  - package.json runtime/dev dependency key set 的独立 literal assertion 保持为 zod 与 @types/node/typescript，不发生放宽或漂移。
  - git diff -- tests/scope.test.ts 只包含可追溯到上述边界迁移的最小修改，没有相邻清理、业务实现或 shared config 变化。
  - npm run typecheck、node --test tests/scope.test.ts 与 npm test 全部通过；现有 57 项 Protocol/Room/Git 测试无回归，测试总数不要求增加。

verification:
  - command: npm run typecheck
    detects: tests/scope.test.ts 的 Node.js filesystem/path type、JSON parsing type 或 assertion code 出现 TypeScript 偏移。
    decision_if_failed: 不得报告 completed；只修复本 Task 对 tests/scope.test.ts 引入的类型错误。
  - command: node --test "tests/scope.test.ts"
    detects: 当前 no-runner baseline 被错误拒绝，或 module/dependency literal boundary 的测试自身无法执行。
    decision_if_failed: 不得报告 completed；保持 scope 不变并修复该单一 regression test。
  - command: npm test
    detects: Scope Scaffold 修改破坏既有 Protocol、Room、Git 测试发现，或当前 dependency/module baseline 被错误分类。
    decision_if_failed: 不得报告 completed；只修复 task-owned regression；若必须修改其它文件或改变批准边界则返回 needs_decision。
  - command: git diff -- tests/scope.test.ts
    detects: 实际 Diff 是否只包含共享 Scope regression 的最小迁移，没有 Runner 实现、其它测试或配置变化。
    decision_if_failed: 不得报告 completed；移除本 Task 产生的越界修改，无法安全区分时返回 needs_decision。

documentation_updates: []

question_policy: >
  如果正确更新 Scope regression 需要创建 Runner 文件、修改其它测试/配置、改变 dependency、
  扩展允许路径、修改已确认 leaf interface 或触及其它 worker scope，停止并返回 needs_decision。
  Bootstrap 阶段不得自行创建 branch、worktree、commit 或改写 Contract。

confirmed_by_user: true
created_by: codex
created_at: 2026-08-24T06:07:59Z
```

## 派发前置条件

1. 已完成：用户 Review 本 Contract 并明确批准；状态为 `Accepted`、`confirmed_by_user=true`。
2. 当前四份 Increment 3 planning/Contract 文档形成独立 documentation baseline，使 main worktree clean。
3. Codex 重新读取 `HEAD`，记录实际 `baseline_head`、target worktree、branch 与 task owner。
4. 用户另行明确授权通过 bootstrap transport 派发本 Scaffold Coding Task；批准 Contract 不自动等于派发授权。
5. Claude Code 收到本文件全文；摘要不能替代 Contract。
6. Coding 完成后进入 Codex Review；只有 Review approved、用户接受并授权具体 scope，才能提交 tests/scope.test.ts。

## 参考文档

- [并行试点计划](./INCREMENT_3_PARALLEL_PILOT_PLAN.md)
- [Leaf A Draft](./INCREMENT_3A_TASK_CONTRACT.md)
- [Leaf B Draft](./INCREMENT_3B_TASK_CONTRACT.md)
- [PROJECT_RULES.md](../../PROJECT_RULES.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [ROOM_PROTOCOL.md](./ROOM_PROTOCOL.md)
- [MVP_PLAN.md](./MVP_PLAN.md)
- [ADR-0002](./ADR/0002-agent-integration-lifecycle.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
