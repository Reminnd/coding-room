# Increment 1 Task Contract — Protocol and State Core

> 状态：Accepted  
> 用户批准日期：2026-08-23  
> Bootstrap transport：`claude -p`  
> 派发状态：未派发

`room_id` 在本任务中是 bootstrap coordination identifier。它不声明目标 Agent Room runtime 已经存在，也不建立 SQLite 之外的平行 Room state。

```yaml
task_id: increment-001-protocol-state-core
room_id: bootstrap-codex-claudecode-room
type: implementation
parent_task_id: null
based_on_review_id: null

background: >
  Agent Room 的架构与协议基线已经批准。当前项目只有治理、设计文档和本 Task Contract，
  尚无 package 或业务代码。本任务实现 MVP Increment 1：Protocol and State Core；
  后续 Increment 将在此基础上接入 Git Observer、Claude Runner、Room MCP 和恢复流程。

goal: >
  交付一个可从 SQLite 持久化恢复、能够验证协议 entity，并以 atomic transaction
  执行或拒绝 Room state transition 的最小可执行 TypeScript domain core。

requirements:
  - 初始化单 package npm 项目；使用 ESM、TypeScript strict mode，提交 package.json、package-lock.json、tsconfig.json 和必要的 .gitignore。
  - package scripts 至少提供 typecheck 和 test；不引入 formatter、lint framework 或 build framework。
  - 实现 ROOM_PROTOCOL.md 定义的 RoomState、Actor、TaskContract、Run、CodingResult、Review、Question、Event 和 protocol error runtime schema 及对应 TypeScript type。
  - schema validation 必须拒绝缺失必填字段、非法 enum、非法 Fix Task shape 和明显错误的关联字段；不得静默补全改变协议含义的数据。
  - 使用 SQLite 实现 rooms、tasks、runs、reviews、questions、events 的最小 schema 与 repository；SQLite 是唯一持久化权威来源。
  - 新建 Room 的初始状态为 DISCUSSION。Room creation、entity write、state change 与对应 Event 必须由 application service 协调。
  - 实现 ROOM_PROTOCOL.md transition table 中全部合法 transition；校验 current state、target state、initiator actor、active entity reference 和本增量能够拥有的 durable-state prerequisite。
  - 未列出的 state pair 必须返回 invalid_transition；错误时 durable state 和 entity table 保持不变。
  - entity creation、state change 和 Event append 必须在同一个 SQLite transaction 中完成，不能产生 partial write。
  - 相同 ID 与相同 schema-normalized structured content 的重复 create 返回既有 entity，且不重复写 Event；相同 ID 与不同 content 返回 id_conflict。
  - Event sequence 在单个 Room 内从 1 开始严格单调递增并保持唯一；Event 只保存 entity reference 和 summary，不复制完整 entity content。
  - 关闭并重新打开 SQLite database 后，Room state、entity 和 Event cursor 必须可恢复。
  - Git、MCP、process 等外部事实不由本增量伪造。相关 transition 的 domain test 使用已持久化 Run、Task、Review、Question fixture 验证内部规则；真实 Git、MCP 和 process gate 分别由后续 Increment 实现。

non_goals:
  - Claude Runner、Claude CLI process 或 session lifecycle。
  - Git repository 检查、clean-worktree gate、baseline 或 Git evidence collection。
  - Streamable HTTP、MCP tool handler 或 Status CLI。
  - Question resume、Fix session resume 或完整 end-to-end workflow。
  - Web UI、VS Code Extension、remote access、authentication 或 multi-user support。
  - ORM、migration framework、generic repository framework 或 Agent adapter framework。
  - JSON entity mirror、saved patch、checksum、fingerprint 或独立 event-log file。
  - 自动 commit、push、branch 或 worktree 管理。

architecture_decisions:
  - Runtime baseline 使用 Node.js >=24.15.0 <25 和 npm 11；package.json 声明对应 engines 与 packageManager。
  - TypeScript 直接由 Node.js native type stripping 执行；仅使用 erasable TypeScript syntax，不生成 dist build artifact。
  - 使用 typescript@7.0.2 执行 tsc --noEmit typecheck，使用 @types/node@24.13.3 对齐 Node 24 API。
  - 使用 Node.js 内建 node:sqlite DatabaseSync；不增加 native SQLite package 或 ORM。
  - 使用 zod@4.4.3 作为唯一 runtime schema-validation dependency。
  - 测试使用稳定的 node:test 与 node:assert/strict；不增加第三方 test framework。
  - SQLite structured field 可以使用 JSON TEXT 作为单个 entity 内部字段表示，但不得生成数据库外的平行 JSON 权威副本。
  - Idempotency 对 schema-normalized structured value 做直接结构比较，不使用 hash 或 fingerprint。
  - 只有 State Machine/application service 可以修改 rooms.state；repository primitive 不对调用方暴露绕过 transition validation 的路径。

scope:
  - npm/TypeScript project bootstrap。
  - src/protocol 下的 protocol type、schema 与 validation。
  - src/room 下的 SQLite repository、Room application service 与 State Machine。
  - Increment 1 所需的 focused integration tests。
  - 本任务实现事实对应的 DEVELOPMENT_LOG.md 候选更新。

constraints:
  - 开始 Coding 前，目标目录必须已经是 HEAD 可解析且 worktree clean 的 Git repository。
  - 所有行为必须符合 PROJECT_RULES.md、ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md 与 Accepted ADR。
  - 不得修改 ROOM_PROTOCOL.md 的 field、transition、actor 或 failure semantics 来迁就实现。
  - 不得增加已批准 dependency baseline 之外的 dependency；确有必要时返回 needs_decision。
  - Increment 2–5 的外部 gate 不得以恒为 true 的 placeholder、feature flag 或兼容 wrapper 伪实现。
  - 不要求为未来多进程或 adversarial operator 增加并发、防护或扩展层。
  - 不修改 AGENTS.md 或 CLAUDE.md。

acceptance_criteria:
  - npm ci 可以从 package-lock.json 重建 dependency tree。
  - npm run typecheck 无错误。
  - protocol schema 对每类 entity 至少包含有效 fixture 和代表性无效 fixture 测试。
  - ROOM_PROTOCOL.md 中每条合法 transition 均有正向测试，并至少覆盖 wrong actor、wrong source state 或 missing reference 的反向测试。
  - 独立的 exhaustive transition matrix 测试证明所有未列出的 state pair 返回 invalid_transition。
  - 失败的 create/transition 不留下 entity、state 或 Event partial write。
  - 相同 ID/相同 content 重试返回既有 entity且不增加 Event；相同 ID/不同 content 返回 id_conflict。
  - 每个 Room 的 Event sequence 严格递增；多个 Room 的 sequence 相互独立。
  - database reopen test 证明 state、entity 和 Event cursor 可恢复。
  - 测试显式证明 Increment 1 没有实现 Runner、Git integration 或 MCP transport。
  - DEVELOPMENT_LOG.md 如实记录 changed files、dependency baseline、验证命令、结果、偏差和下一步。

verification:
  - command: npm ci
    detects: package.json 与 package-lock.json 不一致、dependency 无法按锁文件复现。
    decision_if_failed: 不得交付；修正 package metadata 或报告 dependency blocker。
  - command: npm run typecheck
    detects: protocol type、schema、node:sqlite API 或 module configuration 的类型偏移。
    decision_if_failed: 不得报告 completed；修复本任务引入的类型错误。
  - command: npm test
    detects: 非法 actor/state 被接受、合法 transition 被拒绝、partial write、idempotency/id_conflict 错误、Event order 错误或 reopen 恢复失败。
    decision_if_failed: 不得报告 completed；定位失败对应的公开行为并修复后重跑。

documentation_updates:
  - path: DEVELOPMENT_LOG.md
    expected_change: 记录 Increment 1 实际实现、dependency、测试结果、偏差、阻塞项与下一增量状态。

question_policy: >
  如果正确实现需要改变 requirement、scope、protocol、architecture、persistence semantics、
  dependency baseline 或权限，停止受影响部分并返回 needs_decision。Bootstrap 阶段
  room_ask_question 尚不可用，应在 Coding Result 中完整记录问题并终止本次 Run，不得自行决定。

confirmed_by_user: true
created_by: codex
created_at: 2026-08-23T14:02:08Z
```

## 参考文档

- [PROJECT_RULES.md](../PROJECT_RULES.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [ROOM_PROTOCOL.md](./ROOM_PROTOCOL.md)
- [MVP_PLAN.md](./MVP_PLAN.md)
- [ADR-0001](../ADR/0001-local-room-and-state-ownership.md)
- [ADR-0002](../ADR/0002-agent-integration-lifecycle.md)
