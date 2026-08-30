# Increment 9 Fix Task 4 — Dot-Segment-Safe Participant Route Framing

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（仅在用户另行授权 one-shot `room:run` 后） |
| 创建/确认日期 | 2026-08-29 |
| Review ID | `review-increment-009-codex-004` |
| Parent Task | `increment-009-protocol-v03-participant-role-foundation-fix-003` |
| Original Implementation | `increment-009-protocol-v03-participant-role-foundation` |
| Lineage baseline | `b6df9269dae9bf417abc4aa95f78ae22a6026ea7` |
| Target | `main` / `D:/agent/case/codex-claudecode-room` |

## 1. 结论与边界

本 Fix 只闭合 `review-increment-009-codex-004` 的一项 confirmed finding。用户确认以下最小方案：

1. `participant_id` 继续是公开协议允许的任意非空 opaque identity；不通过禁止 `.`、`..` 或其它值回避 route 问题。
2. participant route 的 canonical segment MUST 使用固定 transport framing：`p~` + `encodeURIComponent(raw participant_id)`。完整 route 为 `/mcp/participants/p~{encoded_participant_id}`。
3. 固定前缀保证 segment 永不等于 `.` 或 `..`；例如 raw `.` → `p~.`、raw `..` → `p~..`、raw `worker/2` → `p~worker%2F2`。
4. `p~` 只是 HTTP transport framing，不是第二套 identity。MCP framework完成标准URI decode后，application MUST验证并只移除一次固定前缀，把剩余值作为raw `participant_id`；不得再次percent-decode。
5. 所有v0.3 participant route consumer必须切换到同一canonical representation，包括MCP、Runner、CLI、setup-generated control URL与Plugin workflow。未加前缀的旧candidate route必须拒绝，不增加compatibility route。

```yaml
task_id: increment-009-protocol-v03-participant-role-foundation-fix-004
room_id: room-4f175b12-3e18-417a-a0da-8fda8b002353
type: fix
parent_task_id: increment-009-protocol-v03-participant-role-foundation-fix-003
based_on_review_id: review-increment-009-codex-004

background: >
  Increment 9 Fix Task 3 Run run-increment-009-fix-005 已从 lineage baseline
  b6df9269dae9bf417abc4aa95f78ae22a6026ea7 成功结算，process exit 0。Fix Review 4
  确认worker/2的MCP、production runClaude与public room:run路径已正确闭合，Codex独立
  验证typecheck与full 314/314通过；但participant_id public schema允许.与..，
  encodeURIComponent不会编码dot，WHATWG URL parser分别把/mcp/participants/.与
  /mcp/participants/..归一化为当前/父路径，使合法Participant仍不可达。用户已确认
  保留任意opaque identity并采用固定安全前缀的单段transport framing。

goal: >
  在不收窄Participant identity contract、不改变Room authority或Protocol v0.3 Stage 1
  范围的前提下，为所有v0.3 participant routes统一增加dot-segment-safe固定framing，
  使.、..、worker/2与default Participant均以唯一canonical单段URL穿过MCP、Runner、
  CLI与setup/Plugin consumer，并由direct public-path regression证明raw identity恢复
  与未加前缀route的零副作用拒绝。

confirmed_findings:
  - finding_id: inc9-fr4-dot-segment-normalization
    solution: >
      保留任意非空opaque participant_id；canonical participant route segment统一为
      p~ + encodeURIComponent(raw participant_id)。MCP framework完成标准URI decode后，
      application验证并移除一次p~前缀以恢复raw identity，不进行第二次percent decode。
      Runner、CLI、MCP、setup-generated control URL与Plugin workflow全部使用同一表示，
      并以.、..及worker/2补direct public-path regression。

requirements:
  - 只修复上述confirmed finding；review_fixes_only。
  - participant_id MUST继续使用现有公开schema与raw durable identity；不得禁止.、..、斜杠或其它既有合法值，不得增加route_id、alias或改写历史entity。
  - canonical route segment MUST exact为p~ + encodeURIComponent(raw participant_id)；固定prefix属于transport framing，不得进入Participant/Assignment/Task/Run/Review/Event identity。
  - MCP HTTP boundary MUST只接受带p~ framing的single-segment participant route；framework decode后application验证并移除一次prefix，剩余值直接作为raw participant_id，不得二次percent-decode。
  - 未加前缀的旧candidate route（包括/mcp/participants/codex-app、/mcp/participants/claude-code-cli与/mcp/participants/worker%2F2）MUST不进入同一participant authority；不得提供legacy alias、wildcard、catch-all或dual-route fallback。
  - runClaude MUST从resolved worker assignment取得raw participant_id，构造exact framed route并验证mcpConfig；Room claim、Event与Run冻结identity继续使用raw值。
  - room:run CLI MUST从同一resolved worker assignment构造exact framed expected pathname；wrong/unframed/raw multi-segment/trailing slash/query/fragment继续在spawn、Run claim、Event/cursor与artifact write前拒绝。
  - setup-project MUST从validated control_participant_id生成framed control URL；fresh、v0.2 migrated与v0.3 reused路径、project config、Skill说明和setup reference必须一致。
  - existing v0.3 binding若config仍使用未加前缀的旧candidate URL，MUST作为binding/config mismatch在任何runtime/config/gitignore写入前拒绝；本Fix不提供未接受candidate的自动兼容迁移。
  - Plugin normal workflow的control endpoint与one-shot worker mcp-url MUST分别使用p~codex-app与p~claude-code-cli；multi-project E2E、setup E2E与packaging Oracle必须直接覆盖生成/消费结果。
  - MCP direct regression MUST分别注册并分配participant_id=.与participant_id=..，通过测试侧literal /mcp/participants/p~.与/mcp/participants/p~..调用实际tool，并证明Event actor恢复为对应raw identity。
  - production runClaude与public room:run CLI direct regression MUST覆盖.和..的framed route成功路径、raw identity冻结与至少一个terminal settlement；不得只测试string helper或new URL。
  - worker/2 regression MUST更新为/mcp/participants/p~worker%2F2并保持raw multi-segment及unframed encoded route拒绝；default codex-app/claude-code-cli/local-runner lifecycle回归全部保持。
  - candidate文档必须同步Fix Review 4 confirmed solution、Accepted Fix Task 4与FIX_PLAN_READY状态；v0.3不得写成Current。

non_goals:
  - 收窄participant_id schema、ID migration、history rewrite、slug/route_id、alias table或第二identity。
  - legacy/unframed participant route、wildcard/catch-all、多segment fallback、dual route或compatibility rewrite。
  - application第二次percent-decode、自定义通用URL framework、新dependency、package script或新source module。
  - 修改Participant/Role/Assignment resolution、frozen authority、retry ordering、Event identity、database schema或protocol version。
  - Stage 2 multi-Run/Executor scheduler、Stage 3 DAG/Git Controller、Stage 4–6 Chat/UI/GitHub。
  - 修改当前v0.2 runtime binding、detached launcher、host approval/global config、database cutover或旧数据删除。
  - stage、commit、push、merge、rebase、reset、restore、clean、checkout或其它Git write。
  - 未经用户另行授权启动任何one-shot Run。

architecture_decisions:
  - raw participant_id仍是唯一authority identity；p~仅标记participant route transport payload的开始。
  - canonical segment语法冻结为p~ + encodeURIComponent(raw participant_id)，对所有Participant一致使用，不按identity内容分支。
  - MCP route保持单一/mcp/participants/:participantSegment；framework负责URI decode，application只验证/移除一次p~，不执行第二次percent decode。
  - Runner、CLI与setup helper在各自现有文件内构造同一表示；可使用最小file-local helper，禁止新增generic routing module。
  - 既有未接受candidate URL不建立compatibility contract；mismatch零写入比隐式重写更符合setup保守边界。

scope:
  - review_fixes_only
  - src/mcp/http.ts中的framed participant route validation与raw identity恢复
  - src/runner/claude-runner.ts中的resolved worker framed route construction/comparison
  - src/cli/run.ts中的resolved worker framed MCP URL exact preflight
  - plugins/agent-room/skills/agent-room/scripts/setup-project.ts中的framed control URL generation/validation
  - plugins/agent-room/skills/agent-room/SKILL.md与references/project-setup.md中的v0.3 control/worker route
  - tests/room-mcp.test.ts、tests/claude-runner.test.ts、tests/runner-cli.test.ts中的dot/dotdot/slash/default direct regression
  - tests/plugin-setup.test.ts、tests/plugin-packaging.test.ts、tests/multi-project-e2e.test.ts、tests/e2e-workflow.test.ts、tests/room-serve.test.ts中的framed consumer与zero-write regression
  - 直接受影响的既有test fixture与tests/scope.test.ts允许路径（仅在上述regression需要时）
  - docs/documents/ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、OPERATIONS.md、DEVELOPMENT_LOG.md、ADR/0003-participant-role-and-v03-evolution.md

constraints:
  - 继承lineage baseline_head b6df9269dae9bf417abc4aa95f78ae22a6026ea7；Fix resume不重新执行clean-worktree gate。
  - target为main、HEAD保持lineage baseline、0 staged；已有Increment 9 candidate、Codex-owned Contract/index/status更新与用户修改不得被覆盖、回滚、stage或清理。
  - launcher固定为D:/agent/case/codex-claudecode-room-v02-launcher的detached clean v0.2 worktree；Claude不得修改。
  - 当前.agent-room/runtime.json与.codex/config.toml继续指向v0.2 /mcp/codex authority；本Fix不得读取为v0.3 migration target或改写。
  - 本Contract确认不授权one-shot room:run；只有用户另行指定或确认fresh run_id并明确授权后才能派发。
  - 继续使用现有Node.js URL/encodeURIComponent语义、Express/MCP SDK、SQLite与Zod；不新增dependency、package script、source module或generic abstraction。
  - direct Oracle使用测试侧literal route，不得从production framing helper或constant导出expected value。
  - 任一negative preflight必须以完整durable snapshot、process invocation与artifact owner path证明零副作用。
  - 如正确修复需要schema restriction、compatibility route、new module/dependency、v0.2修改、cutover或其它non-goal，停止并调用room_ask_question。

acceptance_criteria:
  - participant_id=.与..均可注册、分配，并分别通过/mcp/participants/p~.与/mcp/participants/p~..到达实际MCP tool；Event actor保持raw identity。
  - production runClaude与public room:run CLI对.与..构造并接受framed route，完成claim与terminal settlement；Run冻结raw participant_id。
  - participant_id=worker/2继续通过/mcp/participants/p~worker%2F2工作；raw multi-segment与unframed encoded route在任何副作用前失败。
  - default control/worker routes统一为p~codex-app与p~claude-code-cli；setup fresh/migrated/reused、Plugin normal workflow和multi-project E2E使用同一canonical representation。
  - 未加前缀的旧candidate route不获得Participant authority；setup遇到existing v0.3 unframed config时三份project file逐byte不变。
  - Fix 1–3冻结authority、replacement-safe retry、active orchestrator、binding identity及terminal settlement回归全部保持通过。
  - focused与full regression通过；schema、database、protocol version、Stage 2–6、dependency与source module不变。
  - candidate文档与实际行为一致；Current仍为Increment 8/protocol 0.2，未执行Run、accept、cutover、删除或Git write。

verification:
  - command: npm run typecheck
    detects: framed route construction、MCP raw identity恢复、setup/Plugin consumer与fixture之间的TypeScript drift。
    decision_if_failed: 只修复本Fix类型；不得使用any、ts-ignore、skipLibCheck、wrapper或新dependency。
  - command: node --test "tests/room-mcp.test.ts" "tests/claude-runner.test.ts" "tests/runner-cli.test.ts"
    detects: .或..仍被URL normalization移除、MCP未恢复raw identity、Runner/CLI仍接受unframed route，或negative path产生process/Room/artifact副作用。
    decision_if_failed: 修复现有MCP/Runner/CLI最窄boundary；不得收窄schema或增加compatibility route。
  - command: node --test "tests/plugin-setup.test.ts" "tests/plugin-packaging.test.ts"
    detects: fresh/migrated/reused setup、Skill command/reference或existing binding validation仍生成/接受unframed control/worker URL。
    decision_if_failed: 修复现有setup/packaging consumer；保持zero-write conflict与v0.2 archive不变。
  - command: node --test "tests/e2e-workflow.test.ts" "tests/multi-project-e2e.test.ts" "tests/room-serve.test.ts"
    detects: framed default participant route未贯穿真实service、control tools、one-shot lifecycle或跨database隔离。
    decision_if_failed: 只修复task-owned wiring/fixture；不得改变Room lifecycle或跨项目权威边界。
  - command: node --test "tests/scope.test.ts"
    detects: schema、database、Stage 2–6、新module/dependency、v0.2 launcher/global config或scope外path进入Fix。
    decision_if_failed: 移除越界修改；无法在scope内修复则返回needs_decision。
  - command: npm test
    detects: Increment 1–8 Current workflow与Increment 9其余candidate authority/lifecycle回归。
    decision_if_failed: 只修复task-owned regression；不得删除、跳过或弱化既有assertion。
  - command: git diff --check && git status --short --branch
    detects: whitespace、staged/untracked/HEAD与scope ownership漂移。
    decision_if_failed: 不stage、清理、回滚或改写历史；只修复本Fix新增格式错误，无法归属时停止。

documentation_updates:
  - path: docs/documents/ARCHITECTURE.md
    expected_change: 记录p~ framing在MCP/Runner/CLI/setup/Plugin consumer间的candidate boundary。
  - path: docs/documents/ROOM_PROTOCOL.md
    expected_change: 冻结canonical participant segment grammar、single prefix removal、raw identity与unframed rejection语义。
  - path: docs/documents/MVP_PLAN.md
    expected_change: 记录Fix Review 4 confirmed finding、Accepted Fix Task 4与Stage 2 entry gate未满足。
  - path: docs/documents/OPERATIONS.md
    expected_change: 把framed control/worker URL及unframed binding mismatch加入candidate cutover stop condition。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录用户确认、Fix Task 4、Room提交与未授权边界。
  - path: docs/documents/ADR/0003-participant-role-and-v03-evolution.md
    expected_change: 记录fixed transport framing修正，不提升Current。

question_policy: >
  如果正确修复需要收窄participant_id、schema/database migration、legacy/dual/wildcard route、
  新dependency/source module/framework、Stage 2–6能力、v0.2 runtime/launcher修改、host approval、
  runtime cutover、旧数据删除或任何Git write，停止并调用room_ask_question。现有文件内helper命名、
  test fixture组织与文档段落位置可作最小选择。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: "2026-08-29T15:11:34.910Z"
```

## 2. Room 派发边界

- durable Room在提交本文前为`REVIEW_DISCUSSION`，current Review为`review-increment-009-codex-004`。
- 本文通过Current v0.2 `room_submit_task`完整提交后，Room MUST原子进入`FIX_PLAN_READY`；Fix继承reviewed Run的baseline与Claude session。
- 本次用户确认只授权创建并提交Accepted Fix Contract，不授权`room:run`。fresh `run_id`必须由后续单独授权指定或确认。
- 后续如获Run授权，launcher只从detached v0.2 worktree执行；Fix Run不传`--baseline-head`，运行期间不并发读取完整Room snapshot。
- 不授权accept、stage、commit、push、database/binding cutover、旧数据删除或其它Git write。

## 3. 相关文档

- [Increment 9 Accepted Contract](./INCREMENT_9_TASK_CONTRACT.md)
- [Increment 9 Fix Task 1](./INCREMENT_9_FIX_TASK_1.md)
- [Increment 9 Fix Task 2](./INCREMENT_9_FIX_TASK_2.md)
- [Increment 9 Fix Task 3](./INCREMENT_9_FIX_TASK_3.md)
- [Agent Room v0.3 Roadmap](./AGENT_ROOM_V03_ROADMAP.md)
- [ADR-0003](./ADR/0003-participant-role-and-v03-evolution.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [MVP Plan](./MVP_PLAN.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
