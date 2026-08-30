# Increment 9 Fix Task 2 — Frozen Consumer Authority and Replacement-safe Retry

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（仅在用户另行授权 one-shot `room:run` 后） |
| 创建/确认日期 | 2026-08-29 |
| Review ID | `review-increment-009-codex-002` |
| Parent Task | `increment-009-protocol-v03-participant-role-foundation-fix-001` |
| Original Implementation | `increment-009-protocol-v03-participant-role-foundation` |
| Lineage baseline | `b6df9269dae9bf417abc4aa95f78ae22a6026ea7` |
| Target | `main` / `D:/agent/case/codex-claudecode-room` |

## 1. 结论与边界

本 Fix 只闭合 `review-increment-009-codex-002` 的五项 confirmed finding。用户确认以下最小方案：

1. production Runner MUST 使用为当前 Task 解析并固化的 executor Participant 执行 Run claim、progress、pause finalization 与 terminal settlement；固定 `local-runner` 只可作为 bootstrap default identity，不能覆盖 Task-scope resolution。
2. Review acceptance MUST 使用 Review 创建时冻结的 reviewer Participant。assignment replacement只路由未来Review，不允许Room default或replacement reviewer接管既有Review；被冻结Participant被disable时仍拒绝command，re-enable后恢复。
3. Task、Run、Review的same-ID retry MUST先识别existing entity，再使用该entity冻结的command actor验证调用者；比较caller-owned contract与stored server-augmented entity时不得因重新解析current assignment产生虚假冲突。新entity仍使用current assignment。
4. Participant管理authority MUST只认可至少一个Room中的active latest orchestrator assignment；历史已被替换assignment不再授权。
5. existing v0.3 binding的`control_participant_id` MUST exact为`codex-app`，MCP URL MUST由同一已验证identity生成；mismatch在任何文件写入前拒绝。

```yaml
task_id: increment-009-protocol-v03-participant-role-foundation-fix-002
room_id: room-4f175b12-3e18-417a-a0da-8fda8b002353
type: fix
parent_task_id: increment-009-protocol-v03-participant-role-foundation-fix-001
based_on_review_id: review-increment-009-codex-002

background: >
  Increment 9 Fix Task 1 retry Run run-increment-009-fix-002 已从 lineage baseline
  b6df9269dae9bf417abc4aa95f78ae22a6026ea7 成功结算，process exit 0。Claude
  报告 full 304/304；Codex 独立 typecheck、focused 123/123 与 diff check 通过。
  Fix Review 2 的 direct public-path probes 仍确认五项缺口：production Runner
  忽略 resolved Task-scope executor；Task-scope reviewer不能接受其冻结Review；
  assignment replacement后Task/Run/Review无合法same-ID retry；historical
  orchestrator仍保留Participant管理权；existing binding允许control identity与
  codex-app URL不一致。用户已确认全部finding与本文最小方案。

goal: >
  在不扩大Protocol v0.3 Stage 1范围的前提下，使Runner、Review acceptance、
  replacement后的same-ID retry、orchestrator revocation与existing binding
  validation统一遵循已冻结的Participant/Role authority，并由public-path
  regression直接证明。

confirmed_findings:
  - finding_id: inc9-fr2-1
    solution: >
      production Runner从resolved executor assignment取得executor actor，并在
      startRun/resumeRun、progress、pause finalization、complete与fail的整个Run
      lifecycle中一致使用；增加非默认Task-scope executor的runClaude/CLI direct regression。
  - finding_id: inc9-fr2-2
    solution: >
      acceptReview按Review冻结的reviewer identity授权，不重新解析Room default或
      current Task assignment；提交该Review的enabled冻结reviewer可接受，
      unrelated Room default/replacement reviewer被拒绝。
  - finding_id: inc9-fr2-3
    solution: >
      Task、Run、Review same-ID retry先识别existing entity，再按其冻结的command
      participant与required role认证；caller-owned contract与stored server-augmented
      content分层比较。authorized same-content返回created=false且零write；
      different content保持id_conflict；new entity继续解析current assignment。
  - finding_id: inc9-fr2-4
    solution: >
      database-level Participant management检查只认可至少一个适用Room中同scope/role
      的active latest orchestrator assignment；被新assignment替换的历史orchestrator
      立即失去管理authority，重新成为active后才恢复。
  - finding_id: inc9-fr2-5
    solution: >
      existing v0.3 binding只在control_participant_id exact等于codex-app时复用，
      participant MCP URL由同一validated identity生成；mismatch按configuration
      conflict在任何runtime/config/gitignore写入前失败，并用public CLI证明零write。

requirements:
  - 只修复上述五项confirmed findings；review_fixes_only。
  - runClaude MUST把resolved executor Participant作为唯一executor actor传给startRun或resumeRun，并继续用于appendRunProgress、finalizePausedRun、completeRun和failRun。
  - bootstrap默认local-runner仍可作为Room-scope executor；Task-scope executor存在时MUST覆盖Room default，且production Runner不得回退到固定常量。
  - Runner direct regression MUST使用非默认Task-scope executor穿过实际runClaude claim与至少一个terminal path；固定local-runner不得通过该Run的executor authority。
  - acceptReview MUST先校验route Participant存在、enabled且actor_role=reviewer，再对照Review冻结reviewer identity；不得要求其仍是current assignment。
  - assignment replacement后，冻结reviewer仍可接受既有Review；Room default或replacement reviewer对该Review返回actor_not_allowed，且Review、Room、Event、cursor不变。
  - Task same-ID retry MUST按stored Task冻结的提交actor/role认证；不得用current assignment重新augment existing content后比较。
  - Run same-ID retry MUST按stored Run冻结executor identity认证；不得在existing retry前要求current worker/executor assignment与历史identity一致。
  - Review same-ID retry MUST按stored Review冻结reviewer identity认证；不得在existing retry前要求current reviewer assignment。
  - authorized same-content Task/Run/Review retry返回existing与created=false，Event/cursor及完整durable snapshot不变；different caller-owned content返回id_conflict且零write。
  - unknown、disabled、wrong-role、replacement或其它非冻结Participant对existing retry返回actor_not_allowed且零write。
  - 新Task、Run与Review继续使用current active assignment并固化resolved identity；本Fix不得弱化new entity creation authority。
  - Participant management的orchestrator检查MUST使用active latest assignment语义，而不是任意历史row；同scope/role只有rowid最新assignment授权。
  - replaced historical orchestrator的registerParticipant、setParticipantEnabled与createRoleAssignment public path MUST被拒绝且零write；active orchestrator继续成功。
  - existing v0.3 binding的control_participant_id MUST exact为codex-app；expected MCP URL MUST从该validated identity构造，不得分别使用stored任意值与hardcoded route。
  - binding mismatch MUST在runtime.json、.codex/config.toml与.gitignore任何write前失败；三类文件逐byte不变。
  - candidate文档必须同步Fix Task 2、confirmed authority边界与FIX_PLAN_READY状态；v0.3仍不得写成Current。

non_goals:
  - Stage 2 multi-Run、Executor scheduler、cancel、parallel Worker或automatic retry。
  - Stage 3 TaskGraph、Plan、Approval、run/review/plan scope、Git Controller write、worktree或Integration Run。
  - Stage 4–6 Chat、SSE/VS Code、GitHub provider或external identity。
  - 新provider/adapter、generic authority framework、auth/multi-user、secret storage或remote worker。
  - 新schema field/table、active pointer、assignment counter、migration framework、hash/checksum或第二authority。
  - v0.2原地migration/backfill、历史rewrite、legacy route、dual runtime、feature flag或compatibility wrapper。
  - 修改AGENTS.md、CLAUDE.md、PROJECT_RULES.md、host approval/global config、detached launcher或当前v0.2 binding。
  - stage、commit、push、merge、rebase、reset、restore、clean、checkout、branch/worktree、runtime cutover或旧database删除。
  - 未经用户另行授权启动任何one-shot Run。

architecture_decisions:
  - current assignment只决定future entity；existing command与same-ID retry使用entity冻结participant identity。
  - Runner是executor authority的consumer，不得把bootstrap default常量重新提升为全局authority。
  - Review acceptance与Review retry共享冻结reviewer identity；assignment replacement不转移既有Review ownership。
  - caller-owned contract字段与server-resolved frozen identity分层比较，避免current assignment变化破坏existing idempotency。
  - Participant管理authority由active latest orchestrator assignment表达，不新增global admin或第二authority。
  - codex-app继续是Stage 1唯一control endpoint identity；binding field与URL从同一validated value产生。

scope:
  - review_fixes_only
  - src/runner/claude-runner.ts及必要src/cli/run.ts wiring中的resolved executor actor传递
  - src/room/room-service.ts与repository.ts中的frozen Review authority、replacement-safe Task/Run/Review retry及active orchestrator检查
  - plugins/agent-room/skills/agent-room/scripts/setup-project.ts中的existing v0.3 control identity validation与URL construction
  - tests/claude-runner.test.ts、room-service.test.ts、room-mcp.test.ts、plugin-setup.test.ts及直接受影响的既有fixture
  - tests/scope.test.ts的Fix 2允许路径更新（仅在现有scope Oracle需要时）
  - docs/documents/ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、OPERATIONS.md、DEVELOPMENT_LOG.md、ADR/0003-participant-role-and-v03-evolution.md

constraints:
  - 继承lineage baseline_head b6df9269dae9bf417abc4aa95f78ae22a6026ea7；Fix resume不重新执行clean-worktree gate。
  - target为main、HEAD保持lineage baseline、0 staged；已有Increment 9 candidate与Codex-owned Contract/index/status更新不得被覆盖、回滚、stage或清理。
  - launcher固定为D:/agent/case/codex-claudecode-room-v02-launcher的detached clean v0.2 worktree；Claude不得修改。
  - 本Contract确认不授权one-shot room:run；只有用户另行指定fresh run_id并明确授权后才能派发。
  - 继续使用现有Node.js、SQLite、Zod与MCP SDK；不新增dependency、package script、source module或generic abstraction。
  - retry与authority guard调整必须保持existing/new command的同一transaction rollback；失败后Room、entity、Event、cursor与worktree authority不变。
  - direct Oracle使用测试侧literal identity/error/state，不得从implementation resolver、role map或authority helper导出期望。
  - 如正确修复需要non_goals中的能力或修改Current v0.2 authority，停止并调用room_ask_question。

acceptance_criteria:
  - 非默认Task-scope executor可通过production runClaude完成claim与terminal settlement；固定local-runner不能接管，Room fallback executor仍在无Task override时成立。
  - Task-scope冻结reviewer可接受其Review；replacement与Room default对该Review被拒，disabled/re-enable语义与冻结Run authority一致。
  - assignment replacement后，原冻结actor对Task/Run/Review same-ID same-content retry均获得created=false与零write；replacement actor不能接管，different content仍id_conflict。
  - new Task/Run/Review继续消费replacement后的current assignment，existing历史identity不被改写。
  - historical replaced orchestrator不能执行任何Participant/Assignment管理command；active latest orchestrator仍可执行且replacement/re-enable路径可直接验证。
  - existing v0.3 binding仅接受codex-app control identity；mismatch的public setup CLI失败且runtime/config/gitignore逐byte不变。
  - focused与full regression通过，未新增Stage 2–6、dependency、source module、Git write或v0.2 authority变更。
  - candidate文档与实际行为一致；Current仍为Increment 8/protocol 0.2，未执行cutover、删除或commit。

verification:
  - command: npm run typecheck
    detects: executor actor plumbing、frozen reviewer/retry authority、orchestrator active check与binding validation之间的TypeScript drift。
    decision_if_failed: 只修复本Fix类型；不得使用any、ts-ignore、skipLibCheck、wrapper或新dependency。
  - command: node --test "tests/claude-runner.test.ts" "tests/room-service.test.ts"
    detects: production Runner固定executor、Review acceptance takeover、replacement后Task/Run/Review retry与historical orchestrator authority错误。
    decision_if_failed: 修复现有Runner/application/repository最窄boundary；不得增加authority framework或schema。
  - command: node --test "tests/room-mcp.test.ts" "tests/plugin-setup.test.ts"
    detects: participant public route authority、acceptance/management adapter wiring与control identity mismatch零写入错误。
    decision_if_failed: 修复现有MCP/setup public path与direct Oracle；不得恢复legacy/operator route。
  - command: node --test "tests/scope.test.ts"
    detects: Stage 2–6、新module/dependency、global config、launcher或scope外path进入Fix。
    decision_if_failed: 移除越界修改；无法在scope内修复则返回needs_decision。
  - command: npm test
    detects: Increment 1–8 Current workflow与Increment 9其余candidate behavior回归。
    decision_if_failed: 只修复task-owned regression；不得删除、跳过或弱化既有assertion。
  - command: git diff --check && git status --short --branch
    detects: whitespace、staged/untracked/HEAD与scope ownership漂移。
    decision_if_failed: 不stage、清理、回滚或改写历史；只修复本Fix新增格式错误，无法归属时停止。

documentation_updates:
  - path: docs/documents/ARCHITECTURE.md
    expected_change: 记录Runner resolved executor、Review frozen authority与replacement-safe retry candidate事实。
  - path: docs/documents/ROOM_PROTOCOL.md
    expected_change: 记录existing entity frozen authority、active orchestrator与binding identity一致性candidate contract。
  - path: docs/documents/MVP_PLAN.md
    expected_change: 记录Fix Review 2 confirmed findings、Accepted Fix Task 2与Stage 2 entry gate未满足。
  - path: docs/documents/OPERATIONS.md
    expected_change: 增加control identity mismatch的cutover stop condition及Fix 2状态。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录用户确认、Fix Task 2、verification与后续Room状态。
  - path: docs/documents/ADR/0003-participant-role-and-v03-evolution.md
    expected_change: 记录Stage 1 frozen consumer authority细化，不提升Current。

question_policy: >
  如果正确修复需要Stage 2 multi-Run/Executor scheduler、Stage 3 Plan/Approval/DAG/Git
  write或run/review/plan scope、Stage 4–6 Chat/UI/GitHub、新provider/dependency、
  新schema/authority framework、v0.2原地migration、legacy route、global config、
  host approval、runtime cutover、旧数据删除、launcher修改或任何Git write，停止并调用
  room_ask_question。局部helper命名、transaction内existing/new分支位置、fixture组织与
  文档段落位置可作最小选择。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: "2026-08-29T08:41:31.583Z"
```

## 2. Room 派发边界

- durable Room在提交本文前为`REVIEW_DISCUSSION`，current Review为`review-increment-009-codex-002`。
- 本文通过Current v0.2 `room_submit_task`完整提交后，Room MUST原子进入`FIX_PLAN_READY`；Fix继承reviewed Run的baseline与Claude session。
- 本次用户确认只授权创建并提交Accepted Fix Contract，不授权`room:run`。fresh `run_id`必须由后续单独授权指定或确认。
- 后续如获Run授权，launcher只从detached v0.2 worktree执行；Fix Run不传`--baseline-head`，运行期间不并发读取完整Room snapshot。
- 不授权accept、stage、commit、push、database/binding cutover、旧数据删除或其它Git write。

## 3. 相关文档

- [Increment 9 Accepted Contract](./INCREMENT_9_TASK_CONTRACT.md)
- [Increment 9 Fix Task 1](./INCREMENT_9_FIX_TASK_1.md)
- [Agent Room v0.3 Roadmap](./AGENT_ROOM_V03_ROADMAP.md)
- [ADR-0003](./ADR/0003-participant-role-and-v03-evolution.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [MVP Plan](./MVP_PLAN.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
