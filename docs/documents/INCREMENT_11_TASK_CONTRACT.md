# Increment 11 Task Contract — Remove Git Baseline Hash Validation

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | 独立Codex Coding task：`gpt-5.6-sol` / `medium`（仅在本Contract全文获用户确认且dispatch prerequisites满足后） |
| 创建日期 | 2026-08-31 |
| 用户确认日期 | 2026-08-31 |
| Architecture Decision | [Architecture Review](./HASH_VALIDATION_REMOVAL_ARCHITECTURE_REVIEW.md) `Approved`；[ADR-0005](./ADR/0005-remove-git-baseline-hash-validation.md) `Accepted` |
| Parent goal | 在首次v0.4 cutover前删除全部project-owned runtime hash validation |
| Current Git fact | `main` HEAD=`1be0cc2e37aebf69234276ff88c5c95eb92f6495`；Increment 10 accepted candidate与规划文档仍为unstaged/untracked dirty evidence |
| Dispatch baseline | 先经独立授权版本化Increment 10 accepted scope与本规划文档，形成clean exact baseline；随后才创建Codex worktree task |

## 1. Accepted boundary

用户已于2026-08-31确认本Contract全文；本文件现为`Accepted`、`confirmed_by_user=true`。该确认只批准goal、requirements、non_goals、architecture_decisions、scope、constraints、acceptance、verification、documentation_updates、question_policy及Codex模型路由；不授权Git写操作、创建Codex Coding task、Agent Room Task/Run、runtime cutover或database处理。

```yaml
task_id: increment-011-remove-git-baseline-hash-validation
type: implementation
parent_task_id: null
based_on_review_id: null

background: >
  Increment 10 accepted candidate实现了target 0.4-design Execution Core，但仍把Git commit object ID作为
  Run/RunAttempt baseline持久化，并在continuation比较actual HEAD。用户确认删除全部project-owned runtime
  hash validation，同时明确排除npm lockfile integrity、URL fragment、UUID与历史commit记录，并接受
  branch/commit drift不再自动拒绝。

goal: >
  在不削弱first-attempt clean gate、canonical worktree lease、Git failure propagation、Run/Task/session lineage、
  idempotency或terminal lifecycle的前提下，从target protocol、persistence、Git Observer、Execution Core、
  public consumer、tests与candidate文档完整删除Git baseline hash contract，并证明clean unborn repository可启动、
  same-worktree continuation不受HEAD/branch/commit drift阻断、wrong worktree与dirty-first-attempt仍零写入拒绝。

requirements:
  - 从Run、RunAttempt、claim input、schema、SQLite tables/mappers、snapshot/status及相关type删除`baseline_head`；target consumer不得接收或输出`observed_baseline_head`。
  - 删除production中的commit object ID读取与比较；Git Observer不得执行`rev-parse HEAD`或`HEAD^{commit}`，但保留用于canonical repository root的`rev-parse --show-toplevel`。
  - first attempt继续要求existing non-bare Git worktree且staged、unstaged、untracked全部为空；clean committed与clean unborn repository都必须成功。
  - continuation/Fix/retry/Decision继续收集live Git evidence并校验Run冻结的same canonical worktree；HEAD、branch或commit变化不得阻止claim。
  - 删除`git_head_missing` protocol error及其dead mapping；保留`git_repository_missing`、`worktree_not_clean`和Git process failure，不把command failure降级为empty evidence。
  - RoomService/repository same-ID retry与content conflict移除baseline成员后仍保持structured idempotency：same ID/same content返回existing且零Event，same ID/different remaining content返回`id_conflict`且完整snapshot不变。
  - worktree lease、atomic claim、RunAttempt numbering、frozen worker/executor、session lineage、cancel/guidance、Question、Review/Fix、terminal first-writer-wins及per-Run isolation行为不得改变。
  - MCP、room:run/status CLI、Plugin Skill/setup/packaging consumer不得宣称、推导或回退到baseline hash authority；不得新增branch mirror、file/Diff hash、fingerprint或其它替代校验。
  - fresh target SQLite schema不得包含baseline column；v0.2/v0.3 archive不得被打开写入、迁移、backfill或删除。
  - tests删除只服务于baseline hash contract的format/mismatch Oracle，同时新增独立literal public-path regression；不得删除、skip或弱化与hash无关的既有assertion。
  - candidate文档必须把已实现行为标为Candidate/Review Required，不得在Review、用户接受、版本化与cutover前写成Current。

non_goals:
  - 删除或修改`package-lock.json` integrity metadata、更换package manager或依赖版本。
  - 删除URL fragment validation、UUID/opaque identity或历史文档中的commit object ID。
  - 放宽dirty-first-attempt、canonical worktree identity/lease、Git command failure、authority、membership、transaction rollback或用户/Git写门禁。
  - 引入content hash、checksum、fingerprint、branch-name mirror、timestamp token、compatibility wrapper、dual schema或migration framework。
  - v0.4 runtime cutover、旧database删除、commit、push、merge、rebase、reset、clean、checkout或branch管理。
  - Stage 3 Scheduler/TaskGraph/Git Controller、second WorkerAdapter、live steer或automatic retry/review/acceptance。
  - 修改`AGENTS.md`、`CLAUDE.md`或把本次Codex Coding路由变成永久角色规则。

architecture_decisions:
  - ADR-0005 supersede ADR-0004中baseline_head冻结与HEAD equality部分；ADR-0004其它Execution Core决策保持。
  - canonical worktree是continuation的唯一Git identity guard；live path evidence是当前导航事实，不是lineage digest。
  - first-attempt clean gate与continuation Git evidence sharing同一observer primitive，但只有first attempt把non-empty evidence映射为worktree_not_clean。
  - fresh target schema直接删除baseline field，不为尚未cutover的candidate增加migration/compatibility层。
  - Coding使用用户指定的独立Codex task `gpt-5.6-sol`/`medium`；Agent Room terminal v0.3 Room不表示该task状态。

scope:
  - src/git Git Observer与process/domain error mapping
  - src/protocol Run/RunAttempt/schema/error contract
  - src/room repository/schema/RoomService/snapshot的claim、idempotency与persistence
  - src/runner Executor、Claude adapter prompt/session/Git evidence wiring
  - src/mcp与src/cli public consumer
  - plugins/agent-room Skill/setup/reference/packaging consumer中的target v0.4 baseline声明
  - tests下Git Observer、protocol、RoomService、Execution Core、Runner、MCP/CLI、setup/packaging、E2E与scope regression
  - docs/documents中Architecture、Protocol、ADR、MVP、Operations与Development Log candidate事实

constraints:
  - Coding不得在当前dirty root worktree直接开始。dispatch前必须通过独立用户授权把Increment 10 accepted scope和Increment 11 accepted planning docs形成clean versioned baseline。
  - Coding task使用Codex project worktree，model=`gpt-5.6-sol`、thinking=`medium`；不得改用Claude、其它模型或projectless task。
  - Coding task不得commit、push、merge、rebase、reset、clean、checkout、创建/删除branch/worktree或执行runtime/database cutover。
  - 保留用户、root Codex与其它task-owned修改；只触及本Contract scope，不整理相邻代码。
  - 不新增runtime dependency；若existing Git/Node/SQLite/MCP capability无法实现，返回needs_decision。
  - 每项invalid regression在调用前后比较完整public durable snapshot；process/artifact side effect适用时同时断言零调用/零创建。
  - 必要注释使用简体中文，解释canonical worktree、observer failure与idempotency顺序，不逐行复述。

acceptance_criteria:
  - production source与active Plugin精确扫描不再命中`baseline_head`、`observed_baseline_head`、`git_head_missing`或runtime commit-object `rev-parse`；`rev-parse --show-toplevel`保留。
  - fresh target SQLite Run/RunAttempt schema、repository mapper、public snapshot与status均无baseline field；same-ID retry/conflict按remaining structured content正确。
  - clean committed与clean unborn repository均可完成first-attempt claim；staged-only、unstaged-only、untracked-only和组合dirty仍在attempt/process/Event/artifact前拒绝。
  - same canonical worktree在new commit、branch change或HEAD drift后仍可完成continuation；different canonical worktree以既有stable error拒绝且完整durable snapshot不变。
  - damaged index、Git spawn/exit/buffer failure继续向public operation传播，绝不返回empty evidence或成功claim。
  - atomic claim/worktree lease、terminal union、cancel/guidance、Question/Review/Fix、session与multi-Run isolation全部回归通过。
  - npm integrity、URL fragment gate、UUID/opaque identity与历史commit evidence保持不变。
  - typecheck、全部focused suites、scope test与full npm test通过，无skip、todo或弱化Oracle。

verification:
  - command: rg -n "baseline_head|observed_baseline_head|git_head_missing|HEAD\\^\\{commit\\}" src plugins/agent-room
    detects: production或active Plugin仍保留baseline hash字段、error或commit-object probe。
    decision_if_failed: 删除task-owned残留；若命中仅为明确的historical/non-runtime文本，逐项说明，不扩大删除范围。
  - command: npm run typecheck
    detects: schema、mapper、claim、Executor、snapshot、MCP/CLI与tests仍依赖已删除字段。
    decision_if_failed: 修复最窄task-owned类型；不得使用any、ts-ignore、skipLibCheck或compatibility field。
  - command: node --test "tests/git-observer.test.ts" "tests/claude-runner.test.ts"
    detects: clean unborn/dirty gate、continuation drift、Git failure propagation及Executor pre-process行为错误。
    decision_if_failed: 修复observer/Executor boundary；不得恢复commit hash或把failure降级为空。
  - command: node --test "tests/protocol.test.ts" "tests/room-service.test.ts" "tests/room-state-snapshot.test.ts" "tests/execution-core.test.ts"
    detects: fresh schema、claim/idempotency、wrong worktree rollback、atomic claim、worktree lease和terminal lifecycle回归。
    decision_if_failed: 修复protocol/repository/application最窄owner；不得增加migration或第二authority。
  - command: node --test "tests/room-mcp.test.ts" "tests/runner-cli.test.ts" "tests/status-cli.test.ts" "tests/e2e-workflow.test.ts"
    detects: public MCP/CLI/status/E2E仍要求或暴露baseline，以及continuation/Review/Fix路径回归。
    decision_if_failed: 修复public consumer/wiring；不得用service unit test替代。
  - command: node --test "tests/plugin-setup.test.ts" "tests/plugin-packaging.test.ts" "tests/multi-project-e2e.test.ts" "tests/scope.test.ts"
    detects: Plugin/setup/archive consumer残留、cross-project行为或越界修改。
    decision_if_failed: 修复task-owned consumer或删除越界修改；不得改archive database或package integrity。
  - command: npm test
    detects: focused suites之外的Participant/Role/Room/Runner/process/stream和历史MVP回归。
    decision_if_failed: 只修复task-owned regression；不得放宽既有独立Oracle。

documentation_updates:
  - path: docs/documents/ARCHITECTURE.md
    expected_change: 记录candidate baseline-free Git/Execution Core数据流及Current v0.3不变。
  - path: docs/documents/ROOM_PROTOCOL.md
    expected_change: 记录candidate field/error/public contract删除与remaining lifecycle invariants。
  - path: docs/documents/ADR/0005-remove-git-baseline-hash-validation.md
    expected_change: 只追加implementation/Review状态，不改已接受Decision。
  - path: docs/documents/MVP_PLAN.md
    expected_change: 记录Increment 11 Coding/Review阶段与v0.4 cutover gate。
  - path: docs/documents/OPERATIONS.md
    expected_change: 记录baseline-free first/continuation运维语义与rollback边界。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录dispatch metadata、changed files、verification、deviation与candidate状态。

question_policy: >
  若正确实现需要删除npm integrity、URL fragment、UUID/opaque identity、历史commit evidence，放宽canonical
  worktree/clean gate/Git failure，新增替代hash/fingerprint/branch mirror、dependency、migration/compatibility、
  Stage 3 capability、runtime cutover或Git写操作，停止受影响工作并返回needs_decision。局部function/type/test
  fixture命名可按existing style作最小选择，但必须记录且不得改变observable contract。

confirmed_by_user: true
created_by: codex
created_at: 2026-08-31T00:00:00Z
```

## 2. Dispatch prerequisites

1. 已完成：用户确认本Contract全文，文档状态为`Accepted`且`confirmed_by_user=true`。
2. 用户分别授权Increment 10 accepted scope与Increment 11 planning docs的Git写入，形成clean exact `main` baseline；未授权时不得stage/commit。
3. 通过Codex App为project `codex-claudecode-room`创建独立worktree task，starting state使用上述clean baseline；模型固定`gpt-5.6-sol`、reasoning effort=`medium`。
4. 新task prompt完整注入本Contract，不使用摘要替代，不创建Agent Room Task/Run，不启动Claude。
5. Coding完成后由当前root Codex读取task结果、完整branch/worktree Diff并执行Review；Coding task不得自行commit或宣布接受。

## 3. 用户确认事实

用户已确认goal、requirements、non_goals、architecture_decisions、scope、constraints、acceptance、verification、documentation_updates、question_policy及Codex模型路由。Git写操作、Codex task创建、runtime cutover、database处理与push仍需分别授权。
