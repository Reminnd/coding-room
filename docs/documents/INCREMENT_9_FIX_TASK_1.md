# Increment 9 Fix Task 1 — Participant Authority, Task Scope and v0.2 Migration Evidence

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（仅通过现有 v0.2 Room 的一次 authorized one-shot `room:run`） |
| 创建/确认日期 | 2026-08-29 |
| Review ID | `review-increment-009-codex-001` |
| Parent Task | `increment-009-protocol-v03-participant-role-foundation` |
| Lineage baseline | `b6df9269dae9bf417abc4aa95f78ae22a6026ea7` |
| Target | `main` / `D:/agent/case/codex-claudecode-room` |

## 1. 结论与边界

本 Fix 只闭合 `review-increment-009-codex-001` 的六项 confirmed finding。用户同时确认：

1. project binding 的单一 control endpoint 使用 `codex-app`；`codex-app` 是 active Room `orchestrator`，同时保留 `planner`/`reviewer`。`operator` 仍是 human ParticipantProfile，但不竞争 active orchestrator assignment。人工决定继续由 `confirmed_by_user` 等 command payload 与既有用户门禁表达。
2. Stage 1 只支持 `room|task` RoleAssignment scope。Task scope 选择下一 Run 的 `worker`/`executor`及下一 Review 的 `reviewer`；`run|review` scope 在出现真实 consumer 前不进入 schema 或 public command。

既有 Run 的 Question、progress、pause finalization 与 terminal settlement 使用 claim 时冻结的 identity。assignment replacement 不撤销冻结 authority；被 disabled 的冻结 Participant 仍不能发起新 command，恢复前必须 re-enable。replacement Participant 只影响之后创建的 entity，不能接管旧 Run。

```yaml
task_id: increment-009-protocol-v03-participant-role-foundation-fix-001
room_id: room-4f175b12-3e18-417a-a0da-8fda8b002353
type: fix
parent_task_id: increment-009-protocol-v03-participant-role-foundation
based_on_review_id: review-increment-009-codex-001

background: >
  Increment 9 Implementation Run run-increment-009-implementation-003 已从 exact lineage
  baseline b6df9269dae9bf417abc4aa95f78ae22a6026ea7 完成。Codex 独立 typecheck、
  focused suites、scope、full 297/297 与 diff check 均通过，但公开 RoomService/MCP
  路径确认六项缺口：active Run 在 assignment replacement 后无 actor 可结算；
  Task-scope assignment 未被 Run/Review creation 消费；same-ID retry 在 authority
  check 前返回；binding 指定的 codex-app 无 orchestrator assignment；assignment
  接受无效 scope shape、caller timestamp ordering 与缺失的 git_controller
  compatibility；v0.2 migration/version gate 没有直接证据。用户已确认全部 finding
  与本文最小方案。

goal: >
  在不扩大 Protocol v0.3 Stage 1 范围的前提下，使 Participant/Role authority 对新
  entity、历史冻结 entity、same-ID retry、Task-scope routing、project control
  endpoint 与 v0.2 archive migration/version gate 形成一致且可直接验证的闭环。

confirmed_findings:
  - finding_id: inc9-r1
    solution: >
      已创建 Run 的 askQuestion、progress、pause finalization、complete 与 fail 先校验
      route actor 存在、enabled、actor_role 正确，再只对照 Run 冻结的 worker/executor；
      不要求该 Participant 仍持有 current assignment。replacement actor 对旧 Run 返回
      actor_not_allowed；disabled 冻结 actor 必须 re-enable 后才能恢复。
  - finding_id: inc9-r2
    solution: >
      Stage 1 scope 收窄为 room|task。Run claim 以 run.task_id 的 Task scope优先、
      Room default fallback解析 worker/executor；Review首次提交以 review.task_id 的
      Task scope优先、Room default fallback解析 reviewer并固化。Task提交继续使用Room
      planner/orchestrator；run/review scope从Stage 1 schema/public command移除。
  - finding_id: inc9-r3
    solution: >
      所有same-ID retry在返回existing entity之前验证route Participant存在、enabled、
      required role与existing entity冻结identity或合法control authority一致。授权的
      same content返回created=false且不新增Event；different content仍id_conflict；
      unauthorized/disabled/wrong-role返回actor_not_allowed且完整durable snapshot不变。
  - finding_id: inc9-r4
    solution: >
      bootstrap为codex-app增加supervising capability与Room-scope orchestrator assignment；
      移除operator的active orchestrator assignment但保留human profile。binding的
      control_participant_id与MCP URL继续指向codex-app；single endpoint直接覆盖
      planner/reviewer/orchestrator tools，不用额外/operator route。
  - finding_id: inc9-r5
    solution: >
      active assignment只由成功insert顺序(rowid DESC)决定，不信任caller created_at；
      same-ID retry不产生新row。room scope必须scope_id=null，task scope必须引用同Room
      现有Task。git_controller兼容规则冻结为adapter_id=local_runner且capability=git_control；
      不bootstrap assignment、不增加Git command或write。
  - finding_id: inc9-r6
    solution: >
      增加setup helper public CLI与room:serve/public open直接regression：valid v0.2
      binding migration返回mode=migrated，旧database逐byte不变，生成独立v0.3 identity；
      rerun identity稳定且mode=reused；conflict零写入。缺metadata的v0.2 database与
      wrong exact metadata在schema/state write前以protocol_version_mismatch拒绝。

requirements:
  - 只修复上述六项confirmed findings；review_fixes_only。
  - existing Run command authority来自Run冻结identity；assignment replacement不得使旧Run死锁，也不得允许replacement participant接管旧Run。
  - disabled participant不能发起任何新command，包括历史Run command；re-enable恢复冻结authority，不修改Run/Review/Event历史字段。
  - 新Run的worker/executor按Task scope优先、Room fallback解析；新Review的reviewer同样解析。已经创建的entity不随assignment变化。
  - roleAssignmentScopeSchema只接受room|task。room scope的scope_id必须为null；task scope必须非null、Task存在且room_id匹配。run|review输入在schema/MCP boundary拒绝且零write。
  - active assignment使用server-owned insert row order；backdated/future created_at不得改变active assignment，same-ID retry不得提升旧assignment。
  - git_controller只接受adapter_id=local_runner且capabilities包含git_control的enabled Participant；其它组合在assignment/Event写前validation_failed。
  - bootstrap保持四个identity；codex-app capabilities包含planning/reviewing/supervising并拥有planner/reviewer/orchestrator三个Room assignments；operator没有active assignment；worker/executor defaults不变。
  - control MCP URL与control_participant_id必须为同一validated codex-app；该endpoint直接执行planner/reviewer/orchestrator tools。
  - createRoom、Task、Run、Review、Question、Participant、RoleAssignment及pause finalization的same-ID retry在返回existing前执行对应authority校验。
  - authorized same-content retry返回existing/created=false且Event/cursor不变；different content为id_conflict；unknown、disabled或wrong-role为actor_not_allowed，完整snapshot不变。
  - v0.2 migration test必须经过setup helper public CLI，保存old database bytes并在success、rerun与conflict后逐byte比较。
  - version gate必须经repository/service或room:serve实际public open path证明拒绝发生在任何v0.3 schema/Room/Event write前。
  - 修正candidate ARCHITECTURE、ROOM_PROTOCOL、MVP_PLAN、OPERATIONS、ADR-0003与DEVELOPMENT_LOG；v0.3仍不得写成Current。

non_goals:
  - Stage 2 multi-Run/Executor scheduler、cancel、parallel Worker或automatic retry。
  - Stage 3 TaskGraph/Plan/Approval、run/review/plan scope、Git Controller write、worktree或Integration Run。
  - Stage 4–6 Chat、SSE/VS Code、GitHub provider或external identity。
  - 新provider/adapter、generic capability framework、auth/multi-user、secret storage或remote worker。
  - v0.2原地migration/backfill、历史rewrite、legacy alias、dual runtime、feature flag或compatibility wrapper。
  - active pointer、assignment counter、migration framework、hash/checksum或第二authority。
  - 修改AGENTS.md、CLAUDE.md、host approval/global config、detached launcher或当前v0.2 binding。
  - stage、commit、push、merge、rebase、reset、restore、clean、checkout、branch/worktree或旧database删除。

architecture_decisions:
  - Participant enabled状态与entity冻结identity共同决定历史command authority；current assignment只路由future entity。
  - Stage 1 exact entity routing以Task为最窄真实consumer；Run/Review scope在没有pre-creation consumer时不暴露。
  - same-ID retry不是authority bypass；先认证actor，再按existing frozen identity或control assignment分类retry/conflict。
  - assignment active顺序由SQLite insert rowid表达，不增加pointer/version table，也不信任caller timestamp。
  - codex-app是project唯一control endpoint participant，并承担planner、reviewer、orchestrator；human confirmation仍是独立用户门禁。
  - v0.2 archive和v0.3 writable database继续物理分离；direct public-path evidence证明切换边界。

scope:
  - review_fixes_only
  - src/protocol/schema.ts与errors.ts的room|task scope、role compatibility与error contract
  - src/room/repository.ts、room-service.ts、state-snapshot.ts及必要state-machine wiring的frozen authority、Task-scope resolution、idempotency order与assignment ordering
  - src/mcp/tools.ts、http.ts、serve.ts的single control endpoint与required-role public path
  - src/runner/claude-runner.ts及src/cli/run.ts/status.ts中由Task-scope或participant route直接影响的最小wiring
  - plugins/agent-room/skills/agent-room/SKILL.md、references/project-setup.md、scripts/setup-project.ts中的control participant与migration/reuse contract
  - tests下对应protocol/service/snapshot/MCP/serve/CLI/Runner/E2E/setup/packaging/multi-project/scope regression
  - docs/documents/ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、OPERATIONS.md、DEVELOPMENT_LOG.md、ADR/0003-participant-role-and-v03-evolution.md

constraints:
  - 继承lineage baseline_head b6df9269dae9bf417abc4aa95f78ae22a6026ea7；Fix resume不重新执行clean-worktree gate。
  - target为main、HEAD等于lineage baseline、0 staged；已有Implementation candidate与Codex-owned Fix文档/index/status更新，Claude不得覆盖、回滚、stage或清理。
  - launcher固定为D:/agent/case/codex-claudecode-room-v02-launcher的detached clean v0.2 worktree；Claude不得修改。
  - 只允许一次本Fix的authorized one-shot room:run；不得自动retry、派发下一Task、accept或切换binding/database。
  - 继续使用现有Node.js、SQLite、Zod和MCP SDK；不新增dependency、package script、source module或generic abstraction。
  - guard与顺序调整必须保持同一transaction rollback；失败后Room、entity、Event、cursor及worktree authority不变。
  - 测试Oracle使用测试侧literal，不得从implementation resolver、role map或transition table导出期望。
  - 如正确修复需要non_goals中的能力或修改Current v0.2 authority，停止并调用room_ask_question。

acceptance_criteria:
  - active Run后替换worker/executor，冻结worker仍可ask Question、冻结executor仍可progress/pause/complete/fail；replacement对旧Run拒绝，Run可到唯一terminal state。
  - Task-scope worker/executor/reviewer被下一Run/Review首次创建消费并固化；Room fallback成立；之后replace不改写历史。
  - unknown、disabled、wrong-role或非冻结participant不能通过same-ID retry成功；authorized retry保持created=false/零Event，different payload保持id_conflict。
  - codex-app control route可完成Room planning、Participant/Assignment管理、Review与Fix submission所需planner/reviewer/orchestrator命令；不依赖operator route。
  - RoleAssignment拒绝invalid shape、run/review scope、跨Room/missing Task及不兼容git_controller；caller created_at不能操纵active assignment。
  - setup migration证明mode=migrated、old bytes不变、new identity/URL正确、rerun mode=reused且identity稳定、conflict零写入；public open拒绝v0.2/no metadata与wrong version且无mutation。
  - 默认profiles仍完成串行Implementation、Question/answer、failure retry、Review、Fix与acceptance；agent_session_ref、single terminal、snapshot隔离及Stage 2–6 non-goals无回归。
  - candidate文档与实际行为一致，Current仍为Increment 8/protocol 0.2；未执行cutover、删除或Git write。

verification:
  - command: npm run typecheck
    detects: frozen authority、Task-scope resolver、room|task schema、control participant、migration和tests之间的TypeScript drift。
    decision_if_failed: 只修复本Fix类型；不得使用any、ts-ignore、skipLibCheck、wrapper或新dependency。
  - command: node --test "tests/protocol.test.ts" "tests/room-service.test.ts" "tests/room-state-snapshot.test.ts"
    detects: active Run deadlock、Task-scope消费、retry authority bypass、scope shape、ordering、git_controller、history freeze或rollback错误。
    decision_if_failed: 修复现有schema/application/repository最窄boundary；不得增加pointer、counter或Stage 2 abstraction。
  - command: node --test "tests/room-mcp.test.ts" "tests/room-serve.test.ts" "tests/status-cli.test.ts"
    detects: codex-app orchestrator、unauthorized retry、participant route或public version gate错误。
    decision_if_failed: 修复MCP/service wiring与direct Oracle；不得恢复operator/fixed legacy route。
  - command: node --test "tests/claude-process.test.ts" "tests/claude-stream.test.ts" "tests/claude-runner.test.ts" "tests/runner-cli.test.ts" "tests/e2e-workflow.test.ts"
    detects: Task-scope worker/executor、frozen identity、agent_session_ref、Question/failure/Fix resume或single terminal回归。
    decision_if_failed: 只修复现有adapter/Runner wiring；不得引入scheduler、第二provider或automatic retry。
  - command: node --test "tests/plugin-setup.test.ts" "tests/plugin-packaging.test.ts" "tests/multi-project-e2e.test.ts"
    detects: migration mode/byte preservation/rerun identity/control URL、conflict zero-write、packaging或project隔离缺口。
    decision_if_failed: 修复现有setup/Skill/public CLI；不得打开或改写old database或增加migration framework。
  - command: node --test "tests/scope.test.ts"
    detects: Stage 2–6、新module/dependency/Skill、global config或scope外path是否进入Fix。
    decision_if_failed: 移除越界修改；无法在scope内修复则返回needs_decision。
  - command: npm test
    detects: Increment 1–8 Current workflow与Increment 9其它candidate behavior回归。
    decision_if_failed: 只修复task-owned regression；不得删除、跳过或弱化既有assertion。
  - command: git diff --check && git status --short --branch
    detects: whitespace、staged/untracked/HEAD或scope ownership漂移。
    decision_if_failed: 不stage、清理、回滚或改写历史；只修复本Fix新增格式错误，无法归属时停止。

documentation_updates:
  - path: docs/documents/ARCHITECTURE.md
    expected_change: 修正single control orchestrator、room|task consumer、frozen Run authority与migration evidence。
  - path: docs/documents/ROOM_PROTOCOL.md
    expected_change: 修正scope、authority/idempotency order、git_controller、bootstrap与version gate candidate contract。
  - path: docs/documents/MVP_PLAN.md
    expected_change: 记录Review 1、Accepted Fix Task与Stage 2 entry gate未满足。
  - path: docs/documents/OPERATIONS.md
    expected_change: 修正control route、migration/reuse成功信号、old byte preservation与version mismatch处置。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录Fix Coding Result、Diff、verification、Room Run与REVIEW_REQUIRED candidate事实。
  - path: docs/documents/ADR/0003-participant-role-and-v03-evolution.md
    expected_change: 记录codex-app single control orchestrator与Stage 1仅room/task scope，不提升Current。

question_policy: >
  如果正确修复需要Stage 2 multi-Run/Executor、Stage 3 Plan/Approval/DAG/Git write或
  run/review/plan scope、Stage 4–6 Chat/UI/GitHub、新provider/dependency、v0.2原地
  migration、legacy route、active pointer/counter、global config、host approval、
  runtime cutover、旧数据删除、launcher修改或任何Git write，停止并调用room_ask_question。
  局部helper命名、transaction内guard位置、fixture组织与文档段落位置可作最小选择。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: "2026-08-29T07:19:59.0016233Z"
```

## 2. Room 派发边界

- durable Room当前为 `REVIEW_DISCUSSION`，current Review为 `review-increment-009-codex-001`。
- 本文通过 v0.2 `/mcp/codex` 完整提交后，Room应原子进入 `FIX_PLAN_READY`；Fix继承 reviewed Run的baseline与Claude session。
- 唯一授权 Run ID：`run-increment-009-fix-001`。Fix Run不传 `--baseline-head`。
- launcher只从detached v0.2 worktree执行；运行期间不并发读取完整Room snapshot。
- 不授权第二次Run、retry、accept、commit、push、database/binding cutover、旧数据删除或其它Git write。

## 3. 相关文档

- [Increment 9 Accepted Contract](./INCREMENT_9_TASK_CONTRACT.md)
- [Agent Room v0.3 Roadmap](./AGENT_ROOM_V03_ROADMAP.md)
- [ADR-0003](./ADR/0003-participant-role-and-v03-evolution.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [MVP Plan](./MVP_PLAN.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
