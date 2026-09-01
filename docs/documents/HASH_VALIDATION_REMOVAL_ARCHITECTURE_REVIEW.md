# Git Baseline Hash Validation 删除 Architecture Review

| 属性 | 内容 |
|---|---|
| 文档状态 | Approved |
| Owner | Codex |
| 评审人 | 用户、Codex |
| 创建/确认日期 | 2026-08-31 |
| 生效范围 | target `0.4-design` protocol、Git Observer、Execution Core、SQLite schema、MCP/CLI/Plugin consumer |
| 关联材料 | [哈希校验删除规划](./HASH_VALIDATION_REMOVAL_PLAN.md)、[ADR-0005](./ADR/0005-remove-git-baseline-hash-validation.md)、[Increment 11 Task Contract](./INCREMENT_11_TASK_CONTRACT.md) |

## 1. Review Decision

`Approved`。用户确认以下两项产品决策：

1. “删除所有哈希校验”限定为删除全部 project-owned runtime hash validation；npm lockfile integrity、URL fragment、UUID与历史commit object ID不在范围内。
2. 接受continuation不再因HEAD、branch或commit drift自动拒绝；剩余边界为canonical worktree、first-attempt clean gate、live Git evidence、Task/Run/session reference与人工Diff Review。

本决定改变target protocol/schema和恢复语义，但不改变Current v0.3 runtime。实现、Review、用户接受与获授权的`main`版本化已经完成；runtime/database/binding cutover继续单独授权。

## 2. 现状与问题

仓库没有自行计算SHA/MD5/checksum/fingerprint。当前唯一以digest值改变运行结果的production机制是：

```text
Git Observer读取HEAD commit object ID
→ first attempt冻结baseline_head
→ Run/RunAttempt与SQLite保存baseline_head
→ continuation读取actual HEAD
→ actual HEAD != baseline_head时拒绝
```

该机制同时导致clean unborn repository因`git_head_missing`被拒绝。用户已明确要求删除这条验证，不以branch mirror、file hash、Diff fingerprint或其它字段替换。

## 3. 已确认不变量

| ID | 不变量 | 权威位置 | 验证方式 |
|---|---|---|---|
| HASH-1 | production schema、persistence与public consumer不再保存、接收或输出commit hash baseline | protocol/schema、SQLite、MCP/CLI/Plugin | source/schema absence与public-path tests |
| HASH-2 | first attempt仍只允许existing non-bare Git worktree且staged/unstaged/untracked为空 | Git Observer、Executor | clean committed/unborn成功；三类dirty分别拒绝 |
| HASH-3 | continuation仍必须解析为Run冻结的同一canonical worktree | Executor、Run persistence | same worktree成功；different worktree零写入拒绝 |
| HASH-4 | HEAD、branch或commit drift不再参与continuation决策 | Git Observer、Executor | commit/branch变化后的direct continuation成功 |
| HASH-5 | Git command失败不得降级为空evidence | Git process/observer boundary | damaged-index等fatal fixture直接拒绝 |
| HASH-6 | 删除baseline不得改变Run/Task/session、authority、idempotency、terminal settlement或worktree lease | RoomService、repository、state/read model | focused lifecycle与full regression |

## 4. Target 数据与接口

### 4.1 删除字段

fresh target database与public schema MUST 删除：

- `Run.baseline_head`；
- `RunAttempt.baseline_head`；
- claim/Executor input中的`baseline_head`；
- Current v0.3 submission transport中的`observed_baseline_head`不得进入target v0.4 consumer；
- snapshot、status、Coding prompt与Plugin workflow中的baseline authority描述。

SQLite采用fresh target database，不对已归档v0.2/v0.3 database执行DDL、backfill、dual-read或compatibility migration。

### 4.2 Git Observer

first-attempt observation返回canonical repository root与三类path evidence；continuation observation返回相同结构。两者均不执行`rev-parse HEAD^{commit}`，因此clean unborn repository是合法输入。

`rev-parse --show-toplevel`仍用于repository/worktree identity，它返回path而不是digest，不属于删除范围。

### 4.3 Execution Core

首attempt在claim前验证clean并冻结canonical worktree。后续attempt只比较canonical worktree；不读取或比较HEAD。RoomService same-ID content comparison移除baseline成员，但existing retry/conflict、transaction rollback和partial unique worktree lease保持。

### 4.4 Error contract

- 删除`git_head_missing`。
- 保留`git_repository_missing`、`worktree_not_clean`及Git process failure。
- wrong canonical worktree继续以既有validation/domain error零写入拒绝。
- HEAD/branch/commit变化不再产生ProtocolError。

## 5. Lifecycle 与失败路径

```text
first attempt
→ resolve canonical worktree
→ collect live Git evidence
→ dirty: worktree_not_clean / zero attempt-process-event-artifact
→ clean: claim attempt

continuation
→ resolve canonical worktree
→ collect live Git evidence
→ wrong worktree: reject / complete durable snapshot unchanged
→ same worktree: claim regardless of HEAD/branch/commit
```

Observer failure保持“事实未知”而不是“empty evidence”；process startup仍发生在successful claim之后。删除baseline不改变cancel-wins、terminal first-writer-wins、Question/Review/Fix或guidance消费顺序。

## 6. 兼容、发布与回滚

- 在v0.4首次cutover前完成，避免激活后立即废弃baseline schema。
- Current v0.3 Room `room-ebfafef2-f0e9-4fb1-9eef-ac5adef7445f`已`ACCEPTED`且保持只读workflow终态；不复用它提交Increment 11。
- 已归档database不修改。fresh target database由最终accepted source/setup创建。
- 若实现Review失败，不cutover；回滚是保留Current v0.3 binding/runtime和accepted Increment 10 candidate，不建立compatibility layer。

## 7. Coding 路由与门禁

用户明确要求Increment 11 Coding路由到独立Codex task，模型固定为`gpt-5.6-sol`、reasoning effort为`medium`。这是本Task的一次性用户覆盖：

- 不使用Agent Room `room_submit_task`或Claude `room:run`；
- 不把Codex task伪装成Claude Worker/Run或写入terminal v0.3 Room；
- 不永久修改项目默认“Claude Code负责Coding、Codex负责Review”的角色设计；
- 当前root Codex保留Contract、最终Review、文档维护与用户接受责任。

Coding dispatch前必须先获得独立Git授权，把已接受的Increment 10 scope及本轮planning baseline版本化为clean、可复现起点；不得直接把新的Implementation Diff叠加在当前未提交candidate上后宣称可审查。

## 8. Architecture Review 验收

- 范围、非目标、行为损失与剩余边界已获用户确认。
- target schema、Git Observer、Executor、RoomService、consumer、tests与docs责任均有唯一落点。
- migration/cutover不引入in-place兼容路径。
- Coding actor例外、模型、reasoning effort与dispatch prerequisite明确。
- 无开放架构问题；完整Task Contract已获用户单独确认并转为`Accepted`。

## 9. 变更历史

- 2026-08-31：用户确认删除边界、branch/commit drift取舍及Codex `gpt-5.6-sol`/`medium` Coding路由；Architecture Review=`Approved`。
