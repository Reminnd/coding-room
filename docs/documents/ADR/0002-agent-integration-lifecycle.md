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

## 相关文档

- [PROJECT_RULES.md](../../../PROJECT_RULES.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [ROOM_PROTOCOL.md](../ROOM_PROTOCOL.md)
