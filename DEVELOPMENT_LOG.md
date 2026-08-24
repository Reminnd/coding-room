# 开发日志

## 当前状态

- 日期：2026-08-24
- 项目阶段：ACCEPTED / Increment 2
- Room runtime state：不适用；目标 Room runtime 尚未实现，Increment 1 通过已批准 bootstrap transport 完成
- Architecture：用户已批准
- Implementation Task：`increment-002-git-preconditions-evidence` 与 Fix 1（`increment-002-fix-001-git-failure-semantics`）已实现、Codex 二次 Review approved，并获用户明确接受
- 业务代码：`src/protocol`（schema/types/errors）、`src/room`（repository/state-machine/room-service）、`src/git`（git-process/git-observer）
- Git repository：用户已接受 Increment 2，并授权提交本次已 Review 的 task-owned 文件；未授权 push

## 已完成

### 2026-08-24 — Increment 2 接受与提交授权

- 用户明确接受 Increment 2，并授权将本次已 Review 的 task-owned 代码、测试、必要配置、Fix Contract 与实现状态文档提交到当前 `main`。
- 授权 scope 为 `src/git/git-process.ts`、`src/git/git-observer.ts`、`tests/git-observer.test.ts`、`tests/scope.test.ts`、`package.json`、`docs/INCREMENT_2_FIX_TASK_1.md`、`PROJECT_RULES.md` 与 `DEVELOPMENT_LOG.md`。
- 本次授权不包含 push、branch/worktree 操作、merge/rebase、历史改写或下一 Increment 文件。

### 2026-08-24 — Increment 2 Review 2

- Codex 读取原始 `baseline_head` `6e7e5eb8869b2947d7738f1f23b6eb7fdde64742` 以来的完整 task-owned staged/unstaged/untracked Diff，并核对 Fix Coding Result、Accepted Contract、Git 状态、源码、测试与实现文档；未发现新的 finding。
- `inc2-r1-evidence-exit-128` 已闭环：process boundary 对任何非零退出抛出 `GitCommandError`，repository/HEAD 的 exit 128 仅在对应 semantic boundary 映射为 ProtocolError，两个 public evidence operation 的 corrupt-index regression 直接证明观察失败不会返回 clean/empty evidence。
- `inc2-r1-git-error-stderr` 已闭环：`execFile` callback 第三个参数的 stderr 被保留到 `GitCommandError`；测试同时断言 command、args、cwd、exitCode 与非空 stderr。
- `inc2-r1-temp-fixture-cleanup` 已闭环：non-existent target 测试在 `finally` 删除实际创建的 parent fixture。
- Codex 独立运行 `node --test "tests/git-observer.test.ts"`（11/11）、`npm run typecheck` 与 `npm test`（57/57），全部通过；scope/dependency baseline、只读 Git command set、Increment 1 的 46 项测试均无回归。
- Review Decision：`approved`。阶段进入 `REVIEW_DISCUSSION / Increment 2`，等待用户明确接受；未获接受与 commit 授权前不提交。

### 2026-08-24 — Increment 2 Fix 1: Git Failure Semantics

按 [Increment 2 Fix Task 1](./docs/INCREMENT_2_FIX_TASK_1.md) 修复 `review-increment-002-codex-001` 的 3 项 confirmed findings：

- `inc2-r1-evidence-exit-128`：`runGit` 不再把 exit 128 分类为 `missing`，而是对任何非零退出或进程启动失败以 `GitCommandError` 携带 command、args、cwd、exitCode 与 stderr 向上抛出；`resolveWorktreeRoot`/`resolveBaselineHead` 在各自 semantic boundary 捕获 `GitCommandError` 且 `exitCode === 128` 时映射为 `git_repository_missing`/`git_head_missing`，其余失败继续向上抛。`collectEvidence` 不再捕获或降级任何 diff/ls-files 失败，因此 `establishCleanBaseline`/`collectCompletionEvidence` 在 evidence command fatal failure 时都拒绝，不再返回 clean/empty evidence。
- `inc2-r1-git-error-stderr`：`runGit` 从异步 `execFile` callback 第三个参数读取 stderr（Buffer/string）并传入 `GitCommandError`，不再从 error object 假设 `.stderr` 属性存在。
- `inc2-r1-temp-fixture-cleanup`：non-existent target 测试显式保留 `makeFixture` 返回的 parent path，并在 `finally` 中删除，成功与 assertion failure 都不遗留 temporary directory。

changed files：`src/git/git-process.ts`、`src/git/git-observer.ts`、`tests/git-observer.test.ts`、`DEVELOPMENT_LOG.md`。保持只读命令集（rev-parse/diff/ls-files）与 `GitEvidence`/`CleanBaseline`/两个 public operation 的 external shape 不变，未新增 dependency、protocol error、状态或 mutation command。

### 2026-08-24 — Increment 2 Review 1 与 Fix 1 确认

- Codex 审查完整 task-owned Diff，`npm run typecheck` 通过，`npm test` 55 项全部通过；正常 repository、HEAD、clean/dirty worktree、三类 path evidence、scope 与 dependency baseline 实现正确。
- Review `review-increment-002-codex-001` 通过损坏 temporary repository index 的 fault injection 复现：evidence command exit 128 被 `runGit` 分类为 `missing`，随后 null stdout 被解释为空 array，使 `establishCleanBaseline` 在观察失败时错误返回 clean baseline。
- Review 同时确认异步 `execFile` 的 stderr 来自 callback 第三个参数，当前 `GitCommandError.stderr` 实际为空；non-existent target 测试只删除不存在的 child，稳定遗留 `makeFixture` 创建的 parent temporary directory。
- 用户确认三项 finding 与最小方向：process boundary 对非零退出抛出携带完整 context/stderr 的 `GitCommandError`，仅由 repository/HEAD semantic boundary 映射预期 ProtocolError；两个 public evidence operation 直接覆盖 fatal failure；测试删除实际创建的 parent fixture。
- 已创建 [Increment 2 Fix Task 1](./docs/INCREMENT_2_FIX_TASK_1.md)，Fix lineage 保留原始 `baseline_head` `6e7e5eb8869b2947d7738f1f23b6eb7fdde64742`，阶段进入 `FIX_PLAN_READY`。

### 2026-08-24 — Increment 2: Git Preconditions and Evidence

按 [Increment 2 Task Contract](./docs/INCREMENT_2_TASK_CONTRACT.md) 在独立 `src/git` infrastructure module 实现只读 Git Observer：

- `src/git/git-process.ts`：唯一 Git 调用入口，`node:child_process.execFile('git', [command, ...args])` 直接传 argument array（无 shell）、`encoding: 'buffer'` 保留 NUL 分隔输出；exit 128 分类为 `missing`，其余 process 失败以 `GitCommandError` 携带 command context（command、args、cwd、exit code、stderr）抛出。
- `src/git/git-observer.ts`：`GitEvidence`（staged/unstaged/untracked 去重、稳定排序的 root-relative path）与 `establishCleanBaseline` / `collectCompletionEvidence` 两个 operation。
- `establishCleanBaseline`：目标非目录/非 worktree/裸仓库 → `git_repository_missing`；`rev-parse --verify --end-of-options HEAD^{commit}` 无法解析 → `git_head_missing`；三类 evidence 任一非空 → `worktree_not_clean`；全空返回 repository root、完整 `baselineHead` 与 empty evidence。
- `collectCompletionEvidence`：不要求 worktree clean，从解析出的 owning worktree root 执行，覆盖整个 worktree 并返回 root-relative path。
- 三类 evidence 用 NUL-delimited output：staged `git diff --cached --name-only -z`、unstaged `git diff --name-only -z`、untracked `git ls-files --others --exclude-standard --full-name -z`；不解析 human-readable status。
- product code 只含 `rev-parse`/`diff`/`ls-files` 只读命令；fixture 的 `init/config/add/commit` 写操作只存在于测试代码。
- `package.json` description 改为项目级描述（`Local Agent Room — single-user MVP`），不改 dependency/script baseline。
- `tests/scope.test.ts` 改为拒绝 `src/runner`、`src/mcp`、`src/cli` 并允许 `src/git`，同时证明 dependency baseline 未漂移。

Git command boundary：`runGit` 是唯一 process 边界，所有 command 从解析出的 repository root 执行；`resolveWorktreeRoot` 先用 `fs.statSync` 区分“路径不存在”与“git 不可用”，再按 git exit 128 分类为非 worktree，其余失败带 command context 向上抛出。

### 2026-08-24 — Increment 2 Task Contract 批准

- 用户明确批准 [Increment 2 Task Contract](./docs/INCREMENT_2_TASK_CONTRACT.md)，阶段进入 `PLAN_READY / Increment 2`。
- 已确认最小方案：独立 `src/git` Git Observer 使用 Node.js `child_process.execFile` 直接调用 Git CLI 只读命令；以完整 `HEAD` commit object ID 作为 baseline，并以 NUL-delimited output 收集 root-relative staged、unstaged、untracked path evidence。
- 本增量不接入 Runner、MCP 或 Room state，不修改 SQLite/schema/protocol error set，不增加 dependency，不生成 patch、hash、mirror 或 Git mutation path。
- 派发前仍需把 Accepted Contract 与现有协作文档形成 clean documentation baseline，并重新记录实际 `baseline_head`；当前批准不包含 commit、push 或 Claude Coding 派发授权。

### 2026-08-24 — Increment 1 Fix 3 Review 与接受

- Codex 复审完整 task-owned Diff，无 finding，Review Decision 为 `approved`。
- 聚焦幂等 regression 1 项通过，`npm run typecheck` 通过，`npm test` 46 项全部通过。
- 用户明确接受 Increment 1，并授权将已 Review 的代码、测试、必要配置、Fix Contract 与实现状态文档提交到当前 `main`；该授权不包含 push 或无关并发文档。

### 2026-08-24 — Fix 2/3 经验结构化与角色入口精简

- 按项目职责将 Fix 2/3 经验拆分：Codex 侧覆盖 lifecycle Review、public-path 证据、current entity 权威事实、guard 与 idempotency 组合审查、最小解决方案和 Task Contract 场景；Claude Code 侧覆盖最小实现、transaction 内 guard/idempotency 顺序、直接 public-path regression、durable-state assertion 与独立 Oracle。
- 新建 `docs/agent-guides/` 路由目录及 Codex、Claude Code、Git/并行三份细分指南；`AGENTS.md` 与 `CLAUDE.md` 通过明确 Trigger 强制索引，形成入口 + 按需完整读取的渐进式结构。
- 清除 `AGENTS.md` 与 `CLAUDE.md` 中未解析的 merge marker，保留冲突内容中的有效派发、并行、注释语言和 Git 权限规则，并将细节归入对应指南。
- 同步 `PROJECT_RULES.md` Documentation Map 与规则变更记录；本次只修改角色/协作文档，不改变业务代码、测试、产品架构、Room protocol 或当前 `REVIEW_REQUIRED` 阶段。
- 文档结构验证：`AGENTS.md` 为 9,848 bytes / 163 行，`CLAUDE.md` 为 8,875 bytes / 137 行；两者均显著低于 32 KiB 入口预算。八份相关入口/指南无 merge marker，全部 relative Markdown link 可解析。

### 2026-08-24 — Increment 1 Review 3 与 Fix 3 确认

- Codex 再次 Review 确认 Fix 2 的 typecheck 与 45 项测试通过，stale succeeded Run guard 与 `resumeRun` public-path regression 已正确落地。
- 受支持的两轮 Run/Fix 最小复现同时证明：`review-1` 已成功持久化、`run-2` 完成后，同 ID/同 content 重试 `review-1` 会因 current Run guard 位于 `insertReview` 幂等判断之前而返回 `validation_failed`，违反 Increment 1 已批准的 entity create idempotency contract。
- 用户确认最小方案：先复用 `insertReview` 区分既有同内容 Review、ID 冲突与新 Review，只对新 Review 执行 current Run guard；新 stale Review 继续由同一 transaction rollback。不新增 schema、pointer、migration 或通用 abstraction。
- 已创建 [Increment 1 Fix Task 3](./docs/INCREMENT_1_FIX_TASK_3.md)，阶段进入 `FIX_PLAN_READY`。

### 2026-08-24 — Increment 1 Fix 3: Submit-Review Idempotency Order

按 [Increment 1 Fix Task 3](./docs/INCREMENT_1_FIX_TASK_3.md) 修复 `review-increment-001-codex-003` 的 1 项 confirmed finding：

- `inc1-r3-submit-review-idempotency`：将 `submitReview` 内 `insertReview` 的幂等判断移到 transaction 开头，先区分既有同内容 Review（直接返回 `created=false` 且不新增 Event）、同 ID/异 content（`id_conflict`）与新 Review；只有新 Review 才执行 task/room、succeeded、completed 与 current Run guard。新 stale Review 的 guard 失败仍由同一 transaction rollback，不留下 partial write。

current Run 权威事实继续来自该 Room sequence 最大的 `run_completed` Event；未新增 pointer、schema、migration 或通用 abstraction。

### 2026-08-24 — Increment 1 Fix 2: Submit-Review Current-Run Guard and resumeRun Coverage

按 [Increment 1 Fix Task 2](./docs/INCREMENT_1_FIX_TASK_2.md) 修复 `review-increment-001-codex-002` 的 2 项 confirmed findings：

- `inc1-r2-submit-review-current-run`：`submitReview` 在写入 Review 前校验 `review.run_id` 等于该 Room sequence 最大的 `run_completed` Event 指向的 Run（复用 `latestEventEntityId`），不新增 active_run_id 或其他持久化 pointer。
- `inc1-r2-resume-run-test-coverage`：新增 NEEDS_DECISION 状态下直接调用 `resumeRun` 的 public-path regression，验证 terminal 与 `needs_decision` 初始 status 被拒绝且不产生 partial write；将原有测试重命名为仅描述 `startRun`，消除测试名与覆盖范围不符。

新增 guard 的失败路径仍在同一 transaction 内 rollback，不产生 Review、Run、Room 或 Event partial write。

### 2026-08-23 — Increment 1 Review 2 与 Fix 2 确认

- Codex 二次 Review 确认 Fix 1 的 typecheck 与 43 项测试通过，Fix finding membership、UTC timestamp 和独立 transition oracle 已正确落地。
- 受支持的两轮 Run/Fix 复现证明：run-2 完成后，旧的 succeeded run-1 仍可通过 `submitReview` 创建 current Review；`inc1-r1-active-entity` 尚未完全闭环。
- Review 同时确认 `startRun/resumeRun` 非法 status 测试实际只调用 `startRun`；当前 `resumeRun` 实现因共享 validator 行为正确，但缺少 Task Contract 要求的直接 public-path 验收证据。
- 用户确认最小方案：复用最近一次 `run_completed` Event 校验 `submitReview` 的 current Run，并补充 `resumeRun` 聚焦测试；不新增 pointer、schema、migration 或通用 active-entity abstraction。
- 已创建 [Increment 1 Fix Task 2](./docs/INCREMENT_1_FIX_TASK_2.md)，阶段进入 `FIX_PLAN_READY`。

### 2026-08-23 — Increment 1: Protocol and State Core

按 [Increment 1 Task Contract](./docs/INCREMENT_1_TASK_CONTRACT.md) 完成 MVP 第一个增量，实现可持久化、可恢复、atomic 执行或拒绝 state transition 的最小 domain core。

实现内容：

- 单 package npm 项目（ESM、TypeScript strict、无 formatter/lint/build framework）。
- `src/protocol`：RoomState、Actor、TaskContract（含 Fix 变体 superRefine 校验）、Run、CodingResult、Review、Question、Event 与 protocol error 的 zod runtime schema 及对应 TS type。
- `src/room/repository.ts`：`node:sqlite` DatabaseSync 的 rooms/tasks/runs/reviews/questions/events 最小 schema 与 CRUD；无 ORM。repository 不暴露绕过 transition 校验的 rooms.state 修改原语。
- `src/room/state-machine.ts`：ROOM_PROTOCOL.md 第 4 节 14 条合法 transition 表与纯校验（未列 pair → `invalid_transition`，错误 actor → `actor_not_allowed`）。
- `src/room/room-service.ts`：application service，在单个 SQLite transaction 内协调 entity write、state change 与 Event append；idempotency（同 id 同 content 返回既有 entity 不重复写 Event，同 id 异 content → `id_conflict`）；Event sequence 按 Room 从 1 严格递增。
- 依赖 baseline 落地：`zod@4.4.3`（runtime）、`typescript@7.0.2` + `@types/node@24.13.3`（dev）。

### 2026-08-23 — Increment 1 Fix 1: Stale Entity and Protocol Validation Guards

按 [Increment 1 Fix Task 1](./docs/INCREMENT_1_FIX_TASK_1.md) 修复 `review-increment-001-codex-001` 的 4 项 confirmed findings，阻止 stale entity 推进 Room state 并补齐协议校验：

- `inc1-r1-active-entity`：用现有 Room state、Run status 与 per-Room Event sequence 判定当前 Run/Review，不新增 active_* pointer column。`startRun`/`resumeRun` 拒绝 terminal 或 `needs_decision` Run；`completeRun`/`failRun`/`askQuestion` 只接受 `running` Run；`acceptReview` 与 Fix Task 只引用最近一次 `review_submitted` Event 指向的 Review。
- `inc1-r1-fix-finding-membership`：`validateFixReferences` 校验每个 `confirmed_findings.finding_id` 都存在于 referenced current Review.findings。
- `inc1-r1-timestamp-validation`：所有 protocol timestamp 复用严格 `z.iso.datetime()` validator，拒绝非 ISO 8601、非 UTC offset 与无效日期；内部 `now()` 继续用 `Date.toISOString()`。
- `inc1-r1-transition-test-oracle`：`state-machine.test.ts` 改为测试侧独立声明 14 条 transition 与 initiator，不再用实现表生成期望值。

每个新增 guard 的失败路径都在同一 transaction 内 rollback，不产生 partial write 或 Event。

### 2026-08-23 — Architecture Review 与文档基线

- 根据当前 Codex 与 Claude Code capability 审查了初始 Agent Room 方案。
- 用户接受 MVP 使用 explicit Codex pull 的 notification model。
- 建立 Git、SQLite、Runner、Codex App 与 VS Code 的状态所有权。
- 用 Task-lineage session scope 替代 Room-wide Claude session scope。
- 把 process completion 与 Room transition ownership 交给 Runner。
- 定义当前 State Machine、Task/Run/Review/Question entity 和六个 MCP tool。
- 创建 MVP increment plan 和已接受的 architecture ADR。
- 将共享文档语言规范固化为“简体中文叙述，代码、标识符、命令、Schema 字段和技术专名保持 English”，并统一本轮创建的全部项目文档。

已创建文档：

- [PROJECT_RULES.md](./PROJECT_RULES.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [docs/ROOM_PROTOCOL.md](./docs/ROOM_PROTOCOL.md)
- [docs/MVP_PLAN.md](./docs/MVP_PLAN.md)
- [ADR/0001-local-room-and-state-ownership.md](./ADR/0001-local-room-and-state-ownership.md)
- [ADR/0002-agent-integration-lifecycle.md](./ADR/0002-agent-integration-lifecycle.md)

## 当前事实

- Increment 1 已完成：`src/protocol`、`src/room` 与 `tests/` 已就绪；Git、MCP、process 等外部事实未在本增量实现，由 `tests/scope.test.ts` 负向断言证明。
- Increment 1 dependency baseline 已选择并落地：Node.js 24、npm 11、TypeScript 7、`@types/node` 24、Zod 4、内建 `node:sqlite` 与 `node:test`。
- MCP SDK 与 Claude Runner flags 留待其所属增量（Increment 3/4）验证，不属于 Increment 1。
- 用户已批准在 Room MCP 建成前使用受限 `claude -p` bootstrap transport；Increment 4 被接受后该路径终止。
- 用户已授权初始化 Git 并创建首个 documentation baseline commit；该授权不包含后续代码 commit、push 或历史改写。

## 验证

### 2026-08-23 — Increment 1

- `npm ci`：从 package-lock.json 重建 dependency tree，5 packages、0 vulnerabilities。
- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `npm test`（`node --test`）：33 个测试全部通过。
  - protocol schema 对每类 entity 的有效 fixture 与代表性无效 fixture（缺必填、非法 enum、非法 Fix shape、`confirmed_by_user=false`、非正 Event sequence）。
  - 14 条合法 transition 各自的正向测试 + 错误 actor 反向测试；exhaustive 11×11 transition matrix 证明所有未列 state pair 返回 `invalid_transition`。
  - 失败 create/transition 不产生 entity/state/Event partial write。
  - 同 id 同 content 幂等（不重复 Event）、同 id 异 content → `id_conflict`。
  - Event sequence 按 Room 从 1 递增、多 Room 相互独立。
  - database close/reopen 恢复 state、entity 与 event cursor。
  - 完整 Discussion → Plan → Coding → Review → Fix → Coding → Review → Accepted 循环。

### 2026-08-23 — Increment 1 Fix 1

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/room-service.test.ts" "tests/protocol.test.ts" "tests/state-machine.test.ts"`：42 个测试全部通过。
- `npm test`（`node --test`）：43 个测试全部通过（含 `scope.test.ts`）。
  - 新增 timestamp regression（合法 UTC ISO 8601 被接受；非 ISO 8601、非 UTC offset、无效日期被拒绝）。
  - 新增 stale Run / stale Review / phantom finding / 非 completed CodingResult / 非法 Run status 的聚焦 regression tests。
  - `state-machine.test.ts` 独立 oracle 与 ROOM_PROTOCOL.md 的 14 条规则一致，并验证未列 pair 与错误 actor。

### 2026-08-24 — Increment 1 Fix 2

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/room-service.test.ts"`：27 个测试全部通过。
- `npm test`（`node --test`）：45 个测试全部通过（含 `scope.test.ts`）。
  - 新增 stale succeeded Run（引用旧 run-1 被拒绝、引用当前 run-2 成功）与 resumeRun 非法初始 status 的聚焦 regression tests。
  - 原有 43 项测试继续通过，无回归。

### 2026-08-24 — Increment 1 Fix 3

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/room-service.test.ts"`：28 个测试全部通过。
- `npm test`（`node --test`）：46 个测试全部通过（含 `scope.test.ts`）。
  - 新增跨后续 Run 的 Review 幂等重试 regression（同 ID/同 content 返回既有 review、同 ID/异 content → `id_conflict`、新 review_id 引用旧 run-1 仍被拒、引用当前 run-2 成功）。
  - 原有 45 项测试继续通过，无回归。

### 2026-08-24 — Increment 2

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/git-observer.test.ts"`：9 个测试全部通过。
  - 非 repository 与不存在路径 → `git_repository_missing`；无 commit worktree → `git_head_missing`（HEAD 校验先于 clean gate）。
  - clean repo 返回与独立 `git rev-parse HEAD` 相同的 `baselineHead`、正确 repository root 与三个 empty array。
  - staged-only、unstaged-only、untracked-only 分别 → `worktree_not_clean`。
  - 组合 fixture 精确证明 staged / unstaged / 同 path 双分类 / 带空格 untracked 归入正确 set，ignored path 不归入 untracked。
  - 子目录调用仍观察整个 worktree 并返回 root-relative path；repository root 解析为 owning root。
  - merge-conflict fixture 证明 `git diff --name-only` 对同一 path 重复输出时 observer 正确去重；clean 与 dirty fixture 调用前后 HEAD 与 `git status --porcelain` 不变，证明只读。
  - 源码静态断言只发出 `rev-parse`/`diff`/`ls-files` 只读命令，且不含 mutation subcommand 字符串。
- `npm test`（`node --test`）：55 个测试全部通过（含 `scope.test.ts`）；原有 46 项 Increment 1 测试无回归。

### 2026-08-24 — Increment 2 Fix 1

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/git-observer.test.ts"`：11 个测试全部通过。
  - 新增两个 public-path fatal-failure regression：损坏 index 的临时仓库调用 `establishCleanBaseline` 与 `collectCompletionEvidence` 均以 `GitCommandError` 拒绝，且保留 command `diff`、args `['--cached','--name-only','-z']`、repository-root cwd、`exitCode=128` 与非空 stderr。
  - non-existent target 测试在 `finally` 中删除 `makeFixture` 返回的 parent directory，不再遗留临时目录。
  - 原有 9 项 Git Observer 测试（正常 repository、missing repository/HEAD、dirty gate、path classification、stable sort、dedup、subdirectory、ignored path、只读 invariant 与 mutation-command boundary）全部继续通过。
- `npm test`（`node --test`）：57 个测试全部通过（含 `scope.test.ts`）；原有 46 项 Increment 1 测试无回归。

### 2026-08-23 — 文档基线

- 枚举全部九个 Markdown 文档；
- 确认所有 relative Markdown link 均可解析；
- 确认所有新增 shared design document 都登记在 Documentation Map；
- 确认目录中没有意外生成的非文档文件；
- 确认 JSON mirror、保存 patch、Room-wide session 和 model-owned result reporting 只出现在拒绝、替代或历史语境；
- 修正过早使用 `PLAN_READY` 的状态标签，因为当前尚无有效 Task Contract。
- 确认叙述性英文段落已清除；剩余 English 内容仅为技术专名、标识符、状态、Schema、命令或文件名。
- 确认 Markdown code fence 与 inline code 的 backtick 可正常渲染，不存在转义残留。

## 阻塞项

无产品或架构阻塞。Increment 2 已通过 Codex 二次 Review并获用户明确接受，阶段为 `ACCEPTED`；用户已授权提交本次已 Review 的 task-owned 文件，未授权 push。

## 下一步

Codex 使用显式 pathspec 提交本次已 Review 的 8 个 task-owned 文件；提交后报告 commit hash、实际文件、验证摘要和剩余 worktree。未获 push 授权前不推送。Increment 3 或开发期并行试点需另行规划与用户确认。
