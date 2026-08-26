# ADR-0002：Agent 集成与生命周期

> 状态：Accepted  
> 日期：2026-08-23

## 背景

目标用户体验要求 Codex App 继续承担讨论、规划和 Review，Claude Code CLI 作为 Coding worker。Standard Room MCP tool 可以在 active Codex turn 中调用，但本项目尚未确认存在公开机制，可以向用户已经打开的 Codex Desktop task 注入消息并启动新 turn。

初始方案还把一个 Claude session 映射到整个长期 Room，并依赖 Claude 调用 progress/result tool 推进 durable state。

## 决策

### Codex 集成

- MVP 使用 explicit pull。
- 用户发起 Codex turn，Codex 调用 `room_get_state` 发现 pending result 或 Question。
- 自动唤醒 Codex Desktop 或向当前 task 注入消息不是 MVP dependency。

### Claude 集成

- Claude Code 保持为 CLI worker。
- Runner 为每个 Run 创建一个 non-interactive CLI process。
- Runner 拥有 startup、output parsing、exit classification、Git evidence 与 terminal state transition。
- Claude 可以调用 `room_ask_question`，但不拥有 durable Run completion。

### Session 范围

- 每个新的 Implementation Task 创建一个 Claude session。
- 该 Task lineage 中的 Fix Run 和 decision-resume Run 复用 session。
- 新的无关 Implementation Task 创建新 session。
- 每个 Run 都接收完整关键 Task Contract。

## 备选方案

### Room 主动推送到当前 Codex Desktop task

延后。与用户当前 Desktop task 集成所需的接口尚未确认。Codex App Server 可以支持 custom client，但采用它会改变 product surface。

### 基于 App Server 构建 Custom Codex Client

MVP 不采用。用户明确要求 Codex App 作为交互界面，不需要另一个 client。

### 整个 Room 使用一个 Persistent Claude Process

拒绝。Process recovery 会更困难，长期 project Room 也会累积无关 context。

### 整个 Room 使用一个 Claude Session

拒绝。后续 Task 可能继承过期 decision 与不断增长的 context。Task lineage 才是 durable continuity boundary。

### Claude 调用 `room_report_result`

拒绝把它作为权威 completion mechanism。模型可能在修改文件后退出、失败或漏掉该调用；Runner 观察到的 process 与 Git fact 才是可靠 lifecycle evidence。

### Claude Channels 方案

延后。Channels 是 research-preview capability；Runner 已经显式启动每个 Coding Run，因此 MVP 不依赖它。

## 后果

- MVP 中，Codex update discovery 需要用户或 Codex 显式操作。
- Claude process failure 有确定的 Room outcome。
- Fix Run 保留有用的 implementation context，同时不会污染无关 Task。
- 后续可以添加 automatic notification，而不改变 Task、Review 或 Git ownership。

## 重新评估条件

出现以下情况时重新评估：

- OpenAI 记录了向用户当前 Codex Desktop task 通知或启动 turn 的受支持方式；
- 用户决定构建 custom App Server client；
- Claude Channels 进入稳定状态，并解决已确认 workflow need；
- 经测量，process-per-Run startup cost 对受支持工作流造成实质影响。

## 2026-08-24 澄清（Accepted implementation，不重写原决策）

用户于 2026-08-24 确认，`CODING` 覆盖 Runner atomic claim 之后的 process startup 与 MCP initialization：`startRun`/`resumeRun` 先创建 running Run 并进入 `CODING`，随后 Runner 才启动 Claude process 并校验 MCP init；startup/init failure 继续通过既有 `CODING → RUN_FAILED` 结束，不新增 Room state 或 transition。本澄清只具体化原「Runner 拥有 startup、output parsing、exit classification、Git evidence 与 terminal state transition」决策，不改变 Codex pull、process-per-Run、Task-lineage session 或 Runner-owned terminal state 的 accepted 边界。

## 2026-08-25 Accepted design 澄清（Increment 5）

[Increment 5 Accepted Contract](../INCREMENT_5_TASK_CONTRACT.md) 已获用户确认，按原决策具体化 Question/Fix continuation：

- `room_ask_question` 先持久化 Question并进入 `NEEDS_DECISION`；旧 Claude process结束后仍由 Runner把 session、exit、result/failure、Git与artifact evidence提交到同一 needs-decision Run，并用 `run_paused` Event表明 process已停止。
- Decision resume的 session/baseline来自 answered Question引用的 source Run；Fix resume来自 Fix Task引用的 Review及其 reviewed Run。caller与“最近 session”都不是 lineage authority。
- clean-worktree gate只建立新的 Implementation lineage；Task-lineage continuation保留已有 worktree changes，但必须验证 owning repository的 `HEAD` 仍等于 inherited baseline。

该 Accepted design不改变 explicit Codex pull、process-per-Run、Task-lineage session或 Runner-owned lifecycle决策，也不新增 Room state/schema、daemon或 scheduler。Candidate implementation只有在通过Review、获用户接受并提交进入版本化`main`后才能标记为Current implementation；本Task的一次性人工派发也不替代Runner-owned product lifecycle。

### 2026-08-26 Current implementation（Increment 5）

Claude Code 已完成 Decision/Fix continuation、[Fix Task 1](../INCREMENT_5_FIX_TASK_1.md) 与 test-only [Fix Task 2](../INCREMENT_5_FIX_TASK_2.md)：`RoomService.finalizeNeedsDecision`/`getContinuationContext`、`GitObserver.observeContinuation` 与改写后的 `runClaude` 按本澄清从 persisted Question/Review/source Run lineage 推导 exact session/baseline，并持久化 pause evidence 与 `run_paused` Event。Review `review-increment-005-codex-003` 无 finding且已获用户明确接受；event-order、完整 durable snapshot 与 baseline mismatch 零副作用 Oracle 已闭合。用户另行授权提交完整 accepted scope，当前实现已进入版本化 `main`；未新增 Room state/schema/daemon/scheduler，也未改变 Task-lineage session、Runner-owned lifecycle 或本 ADR 决策。

## 2026-08-26 Accepted design 澄清（Increment 6）

[Increment 6 Accepted Contract](../INCREMENT_6_TASK_CONTRACT.md) 已获用户确认，按原决策补齐operator execution与failure process recovery：

- `room:run`是每次显式执行一个Run的one-shot boundary；Room service、Codex planning/Review与下一Run调度仍是独立显式操作，不引入persistent Runner、daemon、scheduler或automatic wakeup。
- `RUN_FAILED → PLAN_READY`后的retry仍属于current Task lineage并经既有`resumeRun/run_resumed` claim。source Run拥有baseline；保留worktree但要求actual HEAD不变。
- source Run有可靠session时新process使用exact `--resume`；session缺失时replacement process省略`--resume`并建立新session，但不会创建新Task或新lineage。process recovery与Task continuity是不同事实。
- 真实loopback MCP、file-backed SQLite与representative Git负责E2E product evidence；external Claude process在默认验收中使用deterministic fake，以验证Runner ownership且不依赖paid availability。

该澄清不改变explicit Codex pull、process-per-Run、Task-lineage session、Runner-owned terminal settlement或SQLite state ownership，不新增Room state/schema/Event/error/dependency。首次Coding已形成candidate，但Review `review-increment-006-codex-001` 为`changes_requested`；用户已确认findings并选择不豁免dispatch baseline，当前mixed Diff不作为Fix/Review authority。该设计须在clean documentation baseline上重新实现，新的完整task-owned Diff只有在Review通过、用户接受与版本化提交后才成为Current。

## 相关文档

- [PROJECT_RULES.md](../../../PROJECT_RULES.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [ROOM_PROTOCOL.md](../ROOM_PROTOCOL.md)
