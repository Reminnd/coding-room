# ADR-0006：Stage 3 DAG Control Plane 与 Git Controller

| 属性 | 内容 |
|---|---|
| 状态 | Accepted |
| 日期 | 2026-09-01 |
| Owner | Codex |
| 决策者 | 用户 |
| 决策范围 | Plan/TaskGraphRevision/Approval、Scheduler、write scope、acceptance policy、Git Controller、target protocol/cutover |
| 关联评审 | [Stage 3 Architecture Review](../STAGE_3_DAG_CONTROL_PLANE_ARCHITECTURE_REVIEW.md) |

## 1. 背景

Stage 2 accepted candidate已经把execution lifecycle拆为logical `Run`与per-process `RunAttempt`，支持不同canonical worktree的same-Room multi-Run、atomic claim和唯一terminal settlement。Increment 11 accepted amendment又删除了runtime Git baseline hash validation。

Stage 3需要在该基础上交付immutable Task Graph、dependency-ready scheduling、scope conflict gate和Git write控制。Stage 1已预留`git_controller` role compatibility，但Plan-scope Assignment与Approval因没有consumer而未实现。

## 2. 决策

1. 使用stable `Plan`和immutable `TaskGraphRevision`；当前approved revision由immutable `Approval`和Room Event sequence推导，不保存可变current pointer。
2. Revision保存完整preallocated `TaskSpec`、dependency、structured write scope、exact Worker Assignment reference、priority、concurrency `1..3`和acceptance policy；`TaskSpec`包含Task Contract业务内容但不含`confirmed_by_user`，exact revision Approval后物化时才补入该literal。
3. Amendment创建新revision；已dispatch node内容与ancestor关系不可改变。
4. `Scheduler`是显式one-shot reconcile，只物化eligible `NodeDispatch + Task + Run`并在claim时执行concurrency/scope gate；不spawn process、不执行Git write。
5. 新Implementation统一由approved revision通过internal `materializeApprovedGraphNode`创建；public `room_submit_task`只保留Fix path，避免每个node重复消费Room confirmation。
6. unordered overlapping scopes在revision approval时拒绝；actual Diff越界阻塞目标node和Git commit，但不自动清理worktree。
7. Git Controller是唯一product Git write boundary；每个GitAction必须exact preview、用户确认、single execution和durable settlement。
8. 首版Git allowlist为`create_worktree`、`commit_paths`、`integrate_fast_forward`；不支持push、rebase、reset、clean、delete、merge commit、force或自动冲突解决。
9. 不恢复hash/fingerprint validator。Git preview只比较Room cursor与structured live facts；historical resulting commit ID不参与后续validation。
10. Stage 3 target为fresh `0.5-design` database，并在完整Stage 3接受后从active v0.3一次cutover；已接受v0.4 candidate先版本化为source baseline但不先cutover。
11. 分两个Increment：Graph/Approval/Scheduler + `per_task`；随后Git Controller + `integration_only`。

## 3. 备选方案

### 在Task row上直接增加dependency和mutable status

不采用。它会让Plan amendment改写已经running/reviewing的Contract，并把DAG content与execution projection混为同一authority。

### Scheduler直接启动Agent或执行Git

不采用。one-shot process授权与Git preview确认是独立人工门禁；合并后无法证明未批准Draft或stale preview不会产生外部副作用。

### 使用TaskContract人类scope字符串判断冲突

不采用。该字段没有机器grammar，不能稳定区分file、tree和component boundary；新增最小structured write scope而不改写人类Contract语义。

### 用commit hash或Diff fingerprint绑定Git preview

不采用。它会恢复ADR-0005明确删除的validator类别。cooperating operator承担同path内容在preview后变化无法自动检测的已知取舍。

### Stage 3全部能力放入单一Increment

不采用。immutable graph/transaction scheduling与external Git side effect recovery是不同故障域，必须独立Review。

### 先cutover v0.4再开发v0.5

可行但不推荐。当前没有先运营Stage 2的明确需求，会产生两次fresh Room/database/binding切换；保留v0.3 active直到Stage 3整体接受更简单。

## 4. 后果

- Draft/approved/replayed graph有单一durable owner，Stage 4 Chat可以只导出Draft而不能越过Approval。
- Stage 2 Run/RunAttempt lifecycle继续拥有execution事实；Graph不复制terminal evidence。
- Node级并行由dependency、structured scope、worktree lease和concurrency共同约束。
- Git write获得typed preview与crash recovery边界，但SQLite与Git side effect仍存在不可消除的crash gap；unknown outcome必须人工处理。
- `integration_only`允许预先批准non-integration node在Reviewer approved后成为integration input，但每次Git write和最终Integration acceptance仍需用户确认。
- Target protocol、SQLite、snapshot、MCP/Plugin和setup/cutover均为breaking change，需要fresh database和完整Contract。

## 5. 用户确认

用户于2026-09-01确认：

1. v0.4 source版本化但不cutover、fresh `0.5-design`单次最终cutover；
2. Increment 12/13拆分及两种acceptance policy的交付顺序；
3. 首版Git operation exact allowlist为`create_worktree|commit_paths|integrate_fast_forward`。

本ADR现为`Accepted`。该确认不等于确认任何Increment Contract全文，也不授权Coding task、Git write、database/binding cutover或旧database处理。

## 6. 重新评估条件

- 用户要求preview必须绑定immutable source revision；
- Stage 3需要跨Room或跨machine全局调度；
- Git operation需要push、merge commit、rebase、delete或自动冲突解决；
- 一个Room需要多个同时active Plan lineages；
- 新provider需要不同Scheduler或Git Controller authority模型。
