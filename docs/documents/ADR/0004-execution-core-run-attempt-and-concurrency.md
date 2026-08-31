# ADR-0004：Execution Core 的 Run / RunAttempt 与并发所有权

| 属性 | 内容 |
|---|---|
| 状态 | Proposed / Decisions confirmed |
| 日期 | 2026-08-30 |
| Owner | Codex |
| 决策范围 | same-Room multi-Run、RunAttempt、Room/Run状态所有权、worktree隔离、WorkerAdapter与protocol/database cutover |
| 关联评审 | [Stage 2 Architecture Review](../STAGE_2_EXECUTION_CORE_ARCHITECTURE_REVIEW.md) |

## 1. 背景

Current `0.3-design`把一个Claude process invocation、Task lineage、worktree/baseline、Question/failure/Review状态和terminal evidence都放在`Run`中，并用全局`Room.state`与latest Event表达唯一current Task/Run/Review/Question。该模型正确支持single active Run，但不能让多个Run独立进入Question、failure、Review或acceptance。

[ADR-0003](./0003-participant-role-and-v03-evolution.md)已决定Stage 2交付Executor abstraction与same-Room multi-Run，Stage 3才交付DAG Scheduler与Git Controller。

## 2. Proposed decision

### 2.1 分离三个所有权层

- `Room.state`只拥有planning artifact的`DISCUSSION → ARCHITECTURE_REVIEW → WAITING_FOR_USER_CONFIRMATION`。
- `Run`拥有一条Implementation/Fix lineage、frozen Worker、worktree/baseline、Question/Review/acceptance状态。
- `RunAttempt`拥有一次process invocation、frozen Executor、session/result/process/Git/artifact evidence与唯一terminal outcome。

Room snapshot不再提供单一current execution authority，而提供planning state与per-Run work items。

### 2.2 Atomic claim 与worktree isolation

- 一个Run至多有一个active attempt。
- 一个未accepted Run独占其canonical Git worktree；不同Run只有在不同worktree上才可同时active。
- 首attempt通过clean gate并冻结Run worktree/baseline；后续attempt继承exact值并只读验证HEAD。
- SQLite partial unique indexes作为跨process最终并发约束，service guard映射稳定domain error。

Stage 2不创建worktree、不分析Task scope conflict、不自动调度；这些属于Stage 3。

### 2.3 Provider-neutral Executor

Executor只依赖最小`WorkerAdapter`执行契约。Stage 2提供唯一`ClaudeCodeWorkerAdapter`，其它adapter assignment在claim前以`worker_adapter_unavailable`拒绝。接口存在不表示其它provider可用。

Claude Code guidance只在无active attempt时保存并注入下一attempt；Stage 2不伪装未验收的live steer。

### 2.4 Protocol与database

- Target protocol exact为`0.4-design`。
- 使用fresh `room-v0.4.sqlite`与new Room，不原地改写v0.3；v0.3和v0.2 database只读保留。
- binding使用有序`archived_database_paths`保存全部archive路径。
- v0.4 service在schema write前拒绝v0.3/v0.2 database。

## 3. 备选方案

### 仅删除single-active Run guard

拒绝。全局Room state、latest Event current reference和room-level retry/review仍会让多个Run互相覆盖。

### 保留Run shape，只新增`active_run_ids`

拒绝。它增加同步pointer，却没有拆分logical lineage与process attempt；terminal race、retry/session和worktree ownership仍混在一个entity。

### Stage 2同时实现Scheduler与Git Controller

拒绝。Scheduler需要Accepted TaskGraphRevision，Git Controller需要preview/confirmation；两者是Stage 3真实consumer，混入会扩大状态、Git权限与Review故障域。

### v0.3 SQLite原地migration

不推荐。Current active Room没有Task/Run/Review/Question，fresh database可避免改写现有Event与Run shape；原地migration增加rollback、dual-version和历史重写成本而没有当前数据收益。

### running Claude process接受live guidance

拒绝进入baseline。Current non-interactive Claude process没有已验收的bidirectional steer contract；持久化无法消费的guidance会形成假能力。

## 4. 后果

- Question、failure、cancel、Review和acceptance成为per-Run lifecycle，不再阻塞其它Run。
- Current Agent Room Skill、MCP tools、Status CLI、Runner CLI、schema、repository与E2E均发生breaking change。
- 多Run数据/claim语义可以在Stage 2验收，但automatic scheduling和worktree creation仍不可宣称可用。
- 每个Implementation/Fix process从“Run”改称“RunAttempt”；session lifetime提升为稳定Run lineage。
- Stage 2自托管实现需要detached v0.3 launcher；最终v0.4 cutover仍需用户单独授权。

## 5. 用户确认

用户于2026-08-30确认：

1. fresh `0.4-design` database/new Room与archive array；
2. Stage 2不包含Scheduler/worktree creation；
3. guidance仅next-attempt生效。

本ADR继续标记为`Proposed`，用于明确该设计虽已由Increment 10实现、Review并获用户最终接受，但尚未版本化或完成v0.4 cutover，因而不是Current capability。用户接受candidate不等于Git写操作、runtime cutover或旧database处理授权。

首轮Review事实（2026-08-31，historical）：Increment 10 continuation Run `-007`在task-owned worktree完成Contract范围candidate实现；原8条verification及Codex独立typecheck/full 341/341通过。Review `review-increment-010-codex-001`以真实双connection probe确认deferred transaction泄漏`database is locked`，并确认terminal evidence一致性与ready current Task两项缺口，Decision=`changes_requested`。用户随后确认最小方向与[Fix Task 1](../INCREMENT_10_FIX_TASK_1.md)全文；该阶段Room曾为`FIX_PLAN_READY`。这些finding的最终结论由下段验收事实取代。

最终验收（2026-08-31）：Fix Task 1闭合atomic claim、terminal evidence与ready current Task三项finding；Fix Task 2补齐effective `needs_decision` empty evidence拒绝与public zero-write regression。Fix Review `review-increment-010-codex-003`无finding、Decision=`approved`，独立typecheck、focused suites与full 353/353通过；用户已最终接受，durable Room=`ACCEPTED`。本ADR仍保持`Proposed`，因为candidate未版本化且未cutover。

后续Accepted amendment：用户已确认删除所有project-owned runtime hash validation，[ADR-0005](./0005-remove-git-baseline-hash-validation.md) supersede本ADR中的Git `baseline_head`冻结与HEAD equality guard，同时保留first-attempt clean worktree、canonical worktree lease和live Git evidence。本ADR的Run/RunAttempt、atomic claim、worktree lease、Executor/WorkerAdapter、terminal settlement与其它Stage 2决策继续有效；Increment 11尚未实现，Current v0.3 runtime不变。

## 6. 重新评估条件

- Claude Code提供并被本项目直接验证的稳定live steer public interface；
- Stage 3需要worktree lease在多个Room或machine-level scheduler间协调；
- 用户要求迁移v0.3非空Run/Review历史而不是只读归档；
- 新Worker provider形成独立Accepted adapter Contract。
