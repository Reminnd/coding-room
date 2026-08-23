# ADR-0001：本地 Room 与状态所有权

> 状态：Accepted  
> 日期：2026-08-23

## 背景

本项目在同一位 operator 的本机上协调 Codex App、Claude Code CLI、Git 与 VS Code。初始概念同时包含 Room server、SQLite、JSON/JSONL 协作文件、保存的 patch 和未来 frontend。如果没有严格的所有权规则，同一个 Task、Review 或 Diff 可能出现多个相互冲突的表示。

## 决策

构建面向单用户串行工作流的本地单进程 Room Service。

- Git working tree 是代码与 Diff 的唯一权威来源。
- SQLite 是 Room state 和 structured collaboration entity 的唯一权威来源。
- Claude Runner 拥有 process 与 session lifecycle。
- Codex App 拥有用户与 Codex 的讨论。
- VS Code 负责人类查看代码与 Diff。
- Artifact file 只保存 SQLite 引用的大体积 Runner output。
- Room MCP 使用 loopback Streamable HTTP，使 Codex App 与 Claude Code 共享同一个长期运行的 Room instance。
- MVP 不包含 Web frontend、VS Code Extension、remote service 或 parallel worker。

## 备选方案

### 使用 JSON/JSONL 文件作为协作存储

拒绝。Atomic state/entity transition 和 indexed recovery 需要自行实现 file coordination，而可检查性不足以证明同时维护文件与 SQLite 合理。

### 同时使用 SQLite、镜像 JSON 和 Patch 文件

拒绝。Mirror 会过期并造成权威来源歧义；Git 已经提供实时 Diff state。

### Browser frontend 与完整 Room backend

拒绝。Codex App、VS Code 和 terminal 已提供所需交互界面。

### 多 Service 或 Remote Infrastructure

拒绝。受支持工作流是本地串行流程。Redis、Kafka、PostgreSQL 和 container 没有解决 MVP requirement。

## 后果

- 系统保持小型且可在本机直接检查。
- SQLite transaction 可以强制保证 State Machine atomicity。
- MCP 与 Runner coordination 依赖 Room Service process 正在运行。
- 后续 remote 或 multi-user requirement 必须形成新的 architecture decision，不能作为隐式扩展加入。

## 重新评估条件

只有用户批准以下需求之一时才重新评估：

- 从另一台机器 remote access；
- 多用户；
- 并行 Run；
- Room 管理 isolated worktree；
- 存在 Codex App 与 VS Code 无法满足的专用 UI requirement。

## 相关文档

- [PROJECT_RULES.md](../PROJECT_RULES.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [docs/ROOM_PROTOCOL.md](../docs/ROOM_PROTOCOL.md)
- [docs/MVP_PLAN.md](../docs/MVP_PLAN.md)
