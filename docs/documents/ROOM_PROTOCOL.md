# Agent Room 协议

> 状态：Current  
> 版本：0.2-design  
> 批准日期：2026-08-23  
> 说明：0.2-design 变更（`CODING` 覆盖 process startup 与 MCP init、Runner terminal evidence 持久化、progress Event、`git_evidence_failed`/`artifact_write_failed`）已通过 Codex Review 2、获用户接受，并由 commit `e8f0da6db9f3f4ff426355fa1a84d19bae4db9f2` 集成到 `main`，现为 Current implementation。

本文档定义 MVP 的协作 entity、state transition、MCP command、Runner result handling 和 failure semantics。除非明确指定字段类型，否则不绑定实现语言。

## 1. 参与者

| Actor | 含义 |
|---|---|
| `user` | 通过 Codex App 确认需求、解决方案和最终接受 |
| `codex` | 在获得必要用户决定后创建 Task Contract 和 Review |
| `claude` | 执行已批准 Coding 工作，并可提出 Question |
| `runner` | 拥有 Claude process，并报告实际观察到的 Run outcome |
| `system` | 应用已验证的内部 transition 并记录 Event |

MVP 的 actor 固定。支持其他 Agent type 不是当前需求。

## 2. 标识符与时间

- `room_id`、`task_id`、`run_id`、`review_id`、`question_id` 和 `event_id` 是稳定的 opaque string。
- ID 在各自 entity type 内唯一。
- Timestamp 使用 UTC ISO 8601 string。
- 使用相同 ID 和完全相同的 structured content 重复执行 create command 时，返回既有 entity。
- 相同 ID 对应不同 content 时，以 `id_conflict` 失败。
- Idempotency 直接比较已保存的 structured field，不需要 checksum 或 fingerprint。

## 3. Room 状态

```text
DISCUSSION
→ ARCHITECTURE_REVIEW
→ WAITING_FOR_USER_CONFIRMATION
→ PLAN_READY
→ CODING
   ├→ NEEDS_DECISION
   │    ├→ CODING
   │    └→ WAITING_FOR_USER_CONFIRMATION
   ├→ RUN_FAILED
   │    └→ PLAN_READY
   └→ REVIEW_REQUIRED
→ REVIEW_DISCUSSION
   ├→ FIX_PLAN_READY → CODING
   └→ ACCEPTED
```

Room 只保存已提交的协作决定。用户与 Codex 的自由讨论保留在 Codex App。

## 4. 合法状态转换

| From | To | Initiator | 前置条件 |
|---|---|---|---|
| `DISCUSSION` | `ARCHITECTURE_REVIEW` | codex | Architecture Review artifact 已准备 |
| `ARCHITECTURE_REVIEW` | `WAITING_FOR_USER_CONFIRMATION` | codex | Architecture Review 已完成 |
| `WAITING_FOR_USER_CONFIRMATION` | `PLAN_READY` | codex | 用户已明确确认；有效 Implementation Task 已存在 |
| `PLAN_READY` | `CODING` | runner | Git 前置条件通过；Run 已创建（process startup 与 MCP init 在进入 CODING 后发生） |
| `CODING` | `NEEDS_DECISION` | claude/runner | open Question 已保存；当前 Run 停止 |
| `NEEDS_DECISION` | `CODING` | codex/runner | 用户答案不改变已批准 contract；resume Run 已创建 |
| `NEEDS_DECISION` | `WAITING_FOR_USER_CONFIRMATION` | codex | 答案改变 requirement、architecture 或 scope |
| `CODING` | `RUN_FAILED` | runner | process、initialization 或 result validation 失败 |
| `RUN_FAILED` | `PLAN_READY` | codex | retry decision 已记录；Task Contract 未变化 |
| `CODING` | `REVIEW_REQUIRED` | runner | process 成功；有效 Coding Result 与 Git evidence 已保存 |
| `REVIEW_REQUIRED` | `REVIEW_DISCUSSION` | codex | structured Review 已保存，包括无 finding 的 Review |
| `REVIEW_DISCUSSION` | `FIX_PLAN_READY` | codex | 用户已确认 finding 与 Fix solution；有效 Fix Task 已存在 |
| `FIX_PLAN_READY` | `CODING` | runner | 同一 Task lineage 的 resume Run 已创建 |
| `REVIEW_DISCUSSION` | `ACCEPTED` | codex | 没有 unresolved blocking finding，且用户明确接受 |

任何未列出的 transition 都以 `invalid_transition` 失败。State change 与触发它的 entity write 必须在同一个 SQLite transaction 中完成。

## 5. Task Contract 结构

```yaml
task_id: string
room_id: string
type: implementation | fix
parent_task_id: string | null
based_on_review_id: string | null
background: string
goal: string
requirements:
  - string
non_goals:
  - string
architecture_decisions:
  - string
scope:
  - string
constraints:
  - string
acceptance_criteria:
  - string
verification:
  - command: string
    detects: string
    decision_if_failed: string
documentation_updates:
  - path: string
    expected_change: string
question_policy: string
confirmed_by_user: true
created_by: codex
created_at: timestamp
```

Fix Task 还必须包含：

```yaml
type: fix
parent_task_id: string
based_on_review_id: string
confirmed_findings:
  - finding_id: string
    solution: string
scope:
  - review_fixes_only
```

Room 校验 schema 和 reference。由于用户确认发生在 Codex App，Room 信任 Codex 提交的 `confirmed_by_user=true` assertion。

## 6. Run

```yaml
run_id: string
room_id: string
task_id: string
status: starting | running | needs_decision | succeeded | failed | interrupted
baseline_head: string
claude_session_id: string | null
process_exit_code: integer | null
started_at: timestamp
completed_at: timestamp | null
result: CodingResult | null
git_evidence:
  staged: [string]
  unstaged: [string]
  untracked: [string]
artifact_refs:
  - string
failure:
  code: string
  message: string
```

新 Implementation Task 的 `baseline_head` 是通过 clean-worktree gate 后的当前 `HEAD`。Fix Run 继承该 lineage 的 baseline。

## 7. Coding Result 结构

```yaml
task_id: string
status: completed | blocked | needs_decision
summary: string
changed_files:
  - path: string
    purpose: string
deviations:
  - description: string
    reason: string
verification:
  - command: string
    status: passed | failed | not_run
    result: string
tests:
  - path: string
    behavior: string
documentation_changes:
  - path: string
    kind: implementation_fact | candidate_rule | candidate_architecture | candidate_adr
unresolved:
  - string
questions:
  - string
```

Runner 校验该 shape，但不能把它视为 command 已运行或文件已变更的证明。Git evidence 和 process outcome 是独立的观察事实。

## 8. Review 结构

```yaml
review_id: string
room_id: string
task_id: string
run_id: string
decision: approved | changes_requested | needs_discussion
findings:
  - finding_id: string
    severity: blocker | high | medium | low
    title: string
    file: string
    line: integer | null
    trigger: string
    evidence: string
    impact: string
    requirement_relation: string
    minimal_direction: string
open_questions:
  - string
verification_summary: string
created_by: codex
created_at: timestamp
```

实现正确时，必须使用空 `findings` list。Review 永远不能自动派发 Fix。

## 9. Question 结构

```yaml
question_id: string
room_id: string
task_id: string
run_id: string
status: open | answered | superseded
question: string
blocking_scope: string
options:
  - label: string
    tradeoff: string
answer: string | null
answer_changes_contract: boolean | null
asked_at: timestamp
answered_at: timestamp | null
```

只有当答案会改变 product behavior、architecture、scope、permission 或其他已批准 constraint 时，Claude 才应提问。安全的局部实现细节应作为 assumption 记录在 Coding Result 中。

## 10. Event 结构

```yaml
event_id: string
room_id: string
sequence: integer
type: string
actor: user | codex | claude | runner | system
entity_type: room | task | run | review | question
entity_id: string
summary: string
created_at: timestamp
```

`sequence` 在单个 Room 内单调递增，用于支持 `after_sequence` polling。Event 通过 reference 指向 structured entity，不复制其 content。

## 11. MCP Tools 接口

### 11.1 `room_get_state`

调用者：Codex。

输入：

```yaml
room_id: string
after_sequence: integer | null
```

返回 Room state、当前 Task/Run/Review/Question summary，以及 cursor 之后的 Event。

### 11.2 `room_submit_task`

调用者：Codex。

输入：完整 Task Contract。

行为：

- 校验必需的用户确认 marker；
- 校验合法 state，以及 Fix Task 引用的 Review；
- 对新 Implementation Task 应用 Git 前置条件；
- 把 clean gate 观察到的 `baseline_head` 作为 tool result/dispatch evidence 返回；TaskContract 不增加该 field，Runner start 时独立重检并持久化到 Run；
- atomic 地持久化 Task 和 transition。

### 11.3 `room_submit_review`

调用者：Codex。

输入：完整 Review。

行为：保存 Review，并执行 `REVIEW_REQUIRED → REVIEW_DISCUSSION`。

### 11.4 `room_answer_question`

调用者：Codex。

输入：

```yaml
question_id: string
answer: string
answer_changes_contract: boolean
```

`false` 时，Room 允许创建 resume Run；`true` 时，Room 返回规划和确认阶段。

### 11.5 `room_accept_review`

调用者：Codex。

输入：

```yaml
review_id: string
confirmed_by_user: true
```

行为：确认没有 unresolved blocking finding，然后执行 `REVIEW_DISCUSSION → ACCEPTED`。

### 11.6 `room_ask_question`

调用者：Claude。

输入：

```yaml
task_id: string
run_id: string
question: string
blocking_scope: string
options:
  - label: string
    tradeoff: string
```

行为：保存 Question，并通知 Runner 将当前 Run 结束为 `needs_decision`。

### 11.7 Increment 4 已接受 transport/read-model 设计（尚未实现）

[Increment 4 Task Contract](./INCREMENT_4_TASK_CONTRACT.md) 已于 2026-08-25 获用户确认，并冻结以下 interface；Coding 与 Review 完成前不改变 `0.2-design` Current implementation：

- `/mcp/codex` 只注册 `room_get_state`、`room_submit_task`、`room_submit_review`、`room_answer_question`、`room_accept_review`；`/mcp/claude` 只注册 `room_ask_question`。
- 两个 route 使用同一 SQLite Room authority，但每个 HTTP request 使用 stateless MCP server/transport；只接受 POST，GET/DELETE 返回 405。
- `room_get_state` 返回完整 Room、nullable current Task/Run/Review/open Question、`waiting_actor`、当前最大 Event `cursor` 与 `sequence > after_sequence` 的稳定升序 Event。
- current Task/Run/Review 分别由最新 `task_submitted`、`run_started|run_resumed`、`review_submitted` Event reference 决定；Question 只在最新 `question_asked` 引用的 entity 仍为 `open` 时 current。
- `waiting_actor` 固定映射：`DISCUSSION|ARCHITECTURE_REVIEW|RUN_FAILED|REVIEW_REQUIRED -> codex`；`WAITING_FOR_USER_CONFIRMATION|NEEDS_DECISION|REVIEW_DISCUSSION -> user`；`PLAN_READY|FIX_PLAN_READY -> runner`；`CODING -> claude`；`ACCEPTED -> null`。
- `room_submit_task` 先处理 existing Task idempotent retry/`id_conflict`；仅首次 `implementation` submission 应用 clean Git gate，`fix` 不重新建立 baseline。

上述内容是 Accepted implementation requirement，但尚未实现；现有六个 tool schema、Room transition、entity 与 error set 不变。

## 12. Runner 协议

每个 Run 中，Runner 必须：

1. 校验 Task 和 state；
2. 校验本机 Claude CLI 是否支持 Task 所需 capability；
3. 在目标项目目录启动一个非交互 Claude process；
4. 提供完整 Task Contract 和 Room MCP 配置；
5. 从 initialization output 确认 required MCP server 已加载；
6. 把 progress 流式写入 Run Event，但不把它作为状态权威来源；
7. 捕获 session ID 和最终 Coding Result；
8. 记录 exit code 和 artifact reference；
9. 收集实际 Git evidence；
10. 请求且只请求一个 terminal transition。

Implementation Task 的第一个 Run 创建 session。Fix Run 和 decision-resume Run 使用该 session ID。新的 Implementation Task 不能继承上一 Task 的 session。

## 13. Git 协议

在新 Implementation Task 之前：

- target path 必须是 Git worktree；
- `HEAD` 必须可解析；
- staged、unstaged 和 untracked set 必须全部为空。

完成 Run 时：

- 收集 staged path；
- 收集 unstaged path；
- 收集 untracked path；
- 无论成功或失败都保留全部文件；
- 不执行 stage 或 commit。

Codex Review 读取实时 repository。已保存 Git evidence 用于导航和检测状态变化，但不替代 repository。

## 14. 错误码

最低协议 error：

- `invalid_transition`
- `actor_not_allowed`
- `entity_not_found`
- `id_conflict`
- `validation_failed`
- `git_repository_missing`
- `git_head_missing`
- `worktree_not_clean`
- `run_already_active`
- `claude_start_failed`
- `room_mcp_unavailable`
- `claude_exit_failed`
- `coding_result_invalid`
- `git_evidence_failed`
- `artifact_write_failed`

除非 transition table 明确定义 failure transition，否则 error 必须保持当前 durable state 不变。

## 15. 版本管理

协议版本 `0.2-design` 由 Increment 3 Integration 具体化：`CODING` 从 `startRun`/`resumeRun` 的 atomic claim 开始并覆盖 process startup 与 MCP initialization；terminal transition 在同一 transaction 内持久化 session/process/Git/artifact evidence；progress 以非终态 Event 追加而不改变状态。任何 incompatible field、transition 或 failure-semantic 变更都必须同时完成：

1. 用户确认 architecture decision；
2. 更新 protocol version；
3. 更新受影响 ADR 和 Documentation Map；
4. 在同一个已 Review 增量中完成对应 implementation 与 integration test。
