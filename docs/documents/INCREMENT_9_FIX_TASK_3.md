# Increment 9 Fix Task 3 — Opaque Participant Route Segment Encoding

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（仅在用户另行授权 one-shot `room:run` 后） |
| 创建/确认日期 | 2026-08-29 |
| Review ID | `review-increment-009-codex-003` |
| Parent Task | `increment-009-protocol-v03-participant-role-foundation-fix-002` |
| Original Implementation | `increment-009-protocol-v03-participant-role-foundation` |
| Lineage baseline | `b6df9269dae9bf417abc4aa95f78ae22a6026ea7` |
| Target | `main` / `D:/agent/case/codex-claudecode-room` |

## 1. 结论与边界

本 Fix 只闭合 `review-increment-009-codex-003` 的一项 confirmed finding。用户确认以下最小方案：

1. `participant_id` 继续是公开协议允许的非空 opaque identity，不通过收窄 schema 回避 route 问题。
2. 把完整 `participant_id` 使用标准 URI component encoding 表示为 `/mcp/participants/{participant_id}` 的一个 path segment；Runner 构造、CLI exact comparison 与 MCP public route 使用同一表示。
3. Room、Assignment、Run、Review 与 Event 中继续保存 raw participant identity；percent encoding 只属于 HTTP URL 表示，不建立第二套 identity。
4. 增加含 `/` identity 的 MCP、production Runner 与 public CLI direct regression，证明 encoded route 可达且 raw extra-segment route不会被误接受。

```yaml
task_id: increment-009-protocol-v03-participant-role-foundation-fix-003
room_id: room-4f175b12-3e18-417a-a0da-8fda8b002353
type: fix
parent_task_id: increment-009-protocol-v03-participant-role-foundation-fix-002
based_on_review_id: review-increment-009-codex-003

background: >
  Increment 9 Fix Task 2 Run run-increment-009-fix-004 已从 lineage baseline
  b6df9269dae9bf417abc4aa95f78ae22a6026ea7 成功结算，process exit 0。Codex
  独立验证 typecheck、claude-runner/room-service 114/114、room-mcp/plugin-setup
  51/51、scope 1/1、full 309/309 与 git diff --check 全部通过，并确认 Fix Task 2
  五项finding闭合。Fix Review 3仍证明一项public path缺口：participant_id schema
  接受worker/2等opaque identity，raw /mcp/participants/worker/2无法匹配单一route
  segment，而encoded /mcp/participants/worker%2F2虽命中MCP route，却被Runner/CLI
  以raw expected pathname拒绝。用户已确认本文最小方案。

goal: >
  在不改变Participant identity contract、assignment authority或Protocol v0.3 Stage 1
  范围的前提下，使任意已批准participant_id以一个canonical percent-encoded URI path
  segment穿过MCP、production Runner和one-shot CLI，并由含斜杠identity的direct public-path
  regression证明可达性与exact route gate。

confirmed_findings:
  - finding_id: inc9-fr3-participant-route-segment
    solution: >
      保留opaque participant_id；在participant route construction与exact pathname
      comparison中对完整identity使用encodeURIComponent等价的标准URI component encoding，
      MCP route继续把decoded param作为raw participant identity传给authority layer；增加
      worker/2的MCP、runClaude与room:run CLI direct regression。

requirements:
  - 只修复上述confirmed finding；review_fixes_only。
  - participant_id MUST继续使用现有公开schema与raw durable identity；不得禁止斜杠、增加route-specific ID字段或改写历史entity。
  - participant route的URL representation MUST把完整raw participant_id编码为恰好一个URI path segment；不得逐部分编码、保留raw slash或double-encode。
  - runClaude MUST从resolved worker assignment取得raw participant_id，构造canonical encoded worker route，并以该exact route验证mcpConfig；Room authority仍接收raw identity。
  - room:run CLI MUST按resolved worker assignment构造同一canonical encoded expected pathname；合法encoded URL通过preflight，raw extra-segment、wrong participant、trailing slash、query或fragment继续在spawn/claim前拒绝。
  - MCP HTTP public-path regression MUST注册并分配participant_id=worker/2，通过/mcp/participants/worker%2F2调用实际tool，并证明service收到的actor identity仍为raw worker/2。
  - MCP regression MUST证明raw /mcp/participants/worker/2不被当作同一participant route；不得通过wildcard route或多segment fallback实现。
  - production runClaude regression MUST使用participant_id=worker/2的Task-scope worker assignment与真实runner route assertion，穿过claim和至少一个terminal settlement；不得只测试独立string helper。
  - public room:run CLI regression MUST使用participant_id=worker/2证明canonical encoded mcp-url可启动fake process并完成Run；raw extra-segment URL必须零spawn、零Run、零Event/cursor write。
  - existing default codex-app、claude-code-cli、local-runner participant routes与全部authority、retry、terminal settlement行为必须保持不变。
  - candidate文档必须同步confirmed solution、Accepted Fix Task 3与FIX_PLAN_READY状态；v0.3仍不得写成Current。

non_goals:
  - 收窄participant_id schema、增加slug/route_id、ID migration、history rewrite或alias table。
  - wildcard/catch-all MCP route、多segment participant identity、legacy route或dual route fallback。
  - generic URL builder module、routing framework、new dependency、package script或source abstraction。
  - 修改Participant/Role/Assignment resolution、frozen authority、retry ordering、Event identity或database schema。
  - Stage 2 multi-Run/Executor scheduler、Stage 3 DAG/Git Controller、Stage 4–6 Chat/UI/GitHub。
  - v0.2 runtime、detached launcher、host approval/global config、database/binding cutover或旧数据删除。
  - stage、commit、push、merge、rebase、reset、restore、clean、checkout或其它Git write。
  - 未经用户另行授权启动任何one-shot Run。

architecture_decisions:
  - participant_id只有一个raw identity；HTTP path segment是其transport encoding，不是新identifier或authority source。
  - canonical route segment由完整participant_id执行标准URI component encoding；Runner与CLI必须从同一raw resolved assignment独立构造相同表示。
  - MCP framework负责把匹配到的encoded segment解码为route param；application authority继续比较raw participant_id，不进行第二次decode。
  - exact route gate保持单segment与无query/fragment约束；不使用wildcard或compatibility fallback放宽public boundary。
  - 现有文件内的最小表达优先，不新增通用routing层。

scope:
  - review_fixes_only
  - src/runner/claude-runner.ts中的resolved worker participant route construction/comparison
  - src/cli/run.ts中的resolved worker MCP URL exact preflight
  - tests/claude-runner.test.ts中的slash identity production Runner direct regression
  - tests/runner-cli.test.ts中的canonical encoded route success与raw extra-segment zero-side-effect regression
  - tests/room-mcp.test.ts中的encoded participant route public-path regression
  - 直接受影响的既有test fixture（仅在上述三类regression需要时）
  - tests/scope.test.ts的Fix 3允许路径更新（仅在现有scope Oracle需要时）
  - docs/documents/ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、OPERATIONS.md、DEVELOPMENT_LOG.md、ADR/0003-participant-role-and-v03-evolution.md

constraints:
  - 继承lineage baseline_head b6df9269dae9bf417abc4aa95f78ae22a6026ea7；Fix resume不重新执行clean-worktree gate。
  - target为main、HEAD保持lineage baseline、0 staged；已有Increment 9 candidate与Codex-owned Contract/index/status更新不得被覆盖、回滚、stage或清理。
  - launcher固定为D:/agent/case/codex-claudecode-room-v02-launcher的detached clean v0.2 worktree；Claude不得修改。
  - 本Contract确认不授权one-shot room:run；只有用户另行指定或确认fresh run_id并明确授权后才能派发。
  - 继续使用现有Node.js URL/encodeURIComponent语义、Express/MCP SDK、SQLite与Zod；不新增dependency、package script、source module或generic abstraction。
  - direct Oracle使用测试侧literal raw identity与canonical encoded route，不得从production route builder导出expected value。
  - URL preflight失败必须发生在spawn、Run claim、Event/cursor与artifact write前；完整durable snapshot保持不变。
  - 如正确修复需要non_goals中的能力或修改Current v0.2 authority，停止并调用room_ask_question。

acceptance_criteria:
  - participant_id=worker/2可注册、分配，并通过/mcp/participants/worker%2F2到达MCP tool；application收到raw worker/2 actor。
  - production runClaude对worker/2构造并接受canonical encoded route，完成claim与terminal settlement；raw extra-segment mcpConfig被拒绝。
  - public room:run CLI对worker/2的canonical encoded mcp-url完成fake-process Run；raw extra-segment URL在任何副作用前失败。
  - default participant routes与Fix Task 1/2冻结authority、replacement-safe retry、active orchestrator及binding identity回归全部保持通过。
  - focused与full regression通过，未改变schema、database、protocol version、Stage 2–6、dependency或source module。
  - candidate文档与实际行为一致；Current仍为Increment 8/protocol 0.2，未执行Run、accept、cutover、删除或Git write。

verification:
  - command: npm run typecheck
    detects: encoded route construction、CLI URL comparison与test fixture之间的TypeScript drift。
    decision_if_failed: 只修复本Fix类型；不得使用any、ts-ignore、skipLibCheck、wrapper或新dependency。
  - command: node --test "tests/claude-runner.test.ts" "tests/runner-cli.test.ts"
    detects: production Runner或public CLI仍以raw identity比较pathname、发生double encoding，或preflight失败后产生process/Room副作用。
    decision_if_failed: 修复现有Runner/CLI最窄construction/comparison boundary；不得新增routing abstraction或放宽exact gate。
  - command: node --test "tests/room-mcp.test.ts"
    detects: encoded slash identity未匹配单一participant route、route param未恢复raw authority identity，或raw extra-segment被错误接受。
    decision_if_failed: 只在现有MCP route boundary修复；不得增加wildcard、legacy route或第二identity。
  - command: node --test "tests/scope.test.ts"
    detects: schema、Stage 2–6、新module/dependency、launcher、global config或scope外path进入Fix。
    decision_if_failed: 移除越界修改；无法在scope内修复则返回needs_decision。
  - command: npm test
    detects: Increment 1–8 Current workflow与Increment 9其余candidate authority/lifecycle回归。
    decision_if_failed: 只修复task-owned regression；不得删除、跳过或弱化既有assertion。
  - command: git diff --check && git status --short --branch
    detects: whitespace、staged/untracked/HEAD与scope ownership漂移。
    decision_if_failed: 不stage、清理、回滚或改写历史；只修复本Fix新增格式错误，无法归属时停止。

documentation_updates:
  - path: docs/documents/ARCHITECTURE.md
    expected_change: 记录raw participant identity与canonical encoded route segment的candidate transport boundary。
  - path: docs/documents/ROOM_PROTOCOL.md
    expected_change: 记录participant route的single-segment encoding、decode与authority语义。
  - path: docs/documents/MVP_PLAN.md
    expected_change: 记录Fix Review 3 confirmed finding、Accepted Fix Task 3与Stage 2 entry gate未满足。
  - path: docs/documents/OPERATIONS.md
    expected_change: 记录route encoding cutover stop condition及Fix Task 3状态。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录用户确认、Fix Task 3、Room提交与未授权边界。
  - path: docs/documents/ADR/0003-participant-role-and-v03-evolution.md
    expected_change: 记录identity与HTTP segment encoding分离，不提升Current。

question_policy: >
  如果正确修复需要收窄participant_id、schema/database migration、route alias/wildcard、
  新dependency/module/framework、Stage 2–6能力、v0.2修改、launcher/global config、host approval、
  runtime cutover、旧数据删除或任何Git write，停止并调用room_ask_question。现有文件内helper
  命名、test fixture组织与文档段落位置可作最小选择。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: "2026-08-29T14:19:34.005Z"
```

## 2. Room 派发边界

- durable Room在提交本文前为`REVIEW_DISCUSSION`，current Review为`review-increment-009-codex-003`。
- 本文通过Current v0.2 `room_submit_task`完整提交后，Room MUST原子进入`FIX_PLAN_READY`；Fix继承reviewed Run的baseline与Claude session。
- 本次用户确认只授权创建并提交Accepted Fix Contract，不授权`room:run`。fresh `run_id`必须由后续单独授权指定或确认。
- 后续如获Run授权，launcher只从detached v0.2 worktree执行；Fix Run不传`--baseline-head`，运行期间不并发读取完整Room snapshot。
- 不授权accept、stage、commit、push、database/binding cutover、旧数据删除或其它Git write。

## 3. 相关文档

- [Increment 9 Accepted Contract](./INCREMENT_9_TASK_CONTRACT.md)
- [Increment 9 Fix Task 1](./INCREMENT_9_FIX_TASK_1.md)
- [Increment 9 Fix Task 2](./INCREMENT_9_FIX_TASK_2.md)
- [Agent Room v0.3 Roadmap](./AGENT_ROOM_V03_ROADMAP.md)
- [ADR-0003](./ADR/0003-participant-role-and-v03-evolution.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [MVP Plan](./MVP_PLAN.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
