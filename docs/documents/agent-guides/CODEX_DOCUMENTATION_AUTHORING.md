# Codex 项目文档编写与维护指南

| 属性 | 内容 |
|---|---|
| 文档状态 | Current |
| Owner | Codex（项目文档编写者及维护者） |
| Reader | Codex |
| Trigger | 创建、补全、迁移、Review 或维护任意项目文档；每次 Codex Review 结束 |
| 生效范围 | 本仓库全部长期项目文档与Workflow实例文档 |
| 强制能力 | `backend-doc-authoring` skill |

## 1. 角色目标

Codex MUST 作为本项目统一的文档编写者及维护者，使用 `backend-doc-authoring` skill 把项目事实整理为可评审、可实施、可测试、可运维的 Markdown 文档集。人工查看入口统一为 [项目文档中心](../README.md)。

本文使用：

- `MUST`：强制要求；不满足时文档任务不能完成。
- `SHOULD`：默认应执行；只有明确不适用并说明原因时可省略。
- `MAY`：按实际风险和读者需要选择。

文档是事实投影，不建立新的代码、Git、SQLite、process 或 protocol authority。

## 2. 强制 Skill 调用与参考路由

Codex 在编写或维护任何项目文档前 MUST：

1. 调用并完整读取 `backend-doc-authoring/SKILL.md`。
2. 完整读取 `references/00-common.md`。
3. 按文档类型读取对应参考；完整文档集任务读取全部相关参考。
4. 先明确文档读者、评审目标、状态、Owner、生效范围、权威依赖和待确认项。
5. 仅把用户已确认、accepted commit、实际代码/测试/Git 或 Current/Accepted 权威文档支持的内容写成事实。

| 文档类型 | 必读参考 |
|---|---|
| 需求、MVP、Task Contract、验收 | `01-requirements.md` |
| 角色、协作流程、状态生命周期 | `02-business.md` |
| 技术架构、组件、dependency direction、ADR | `03-architecture-middleware.md` |
| SQLite schema、query、transaction、数据库运维 | `04-database.md` |
| 核心逻辑、public API、MCP/CLI/protocol | `05-logic-api.md` |
| 运维、制品、故障、恢复、监控告警 | `06-operations-observability.md` |
| 研发规范、Review、Git、并行工作流 | `07-development-governance.md` |

缺失信息不会改变方案时，使用 `[待确认: 问题 / Owner / YYYY-MM-DD]`；会改变实现路线时停止受影响编写并请求用户决策。不得把示例值写成已确认事实。

## 3. 文档目录硬边界

长期项目文档、Architecture Review、ADR、Current/Accepted状态与Agent guides MUST 位于 `docs/documents/`；具体Workflow实例的PLAN / EXECUTION_PLAN / STAGE / TASK / ROUTER / SUBTASK / FIX MUST 位于 `docs/work/`：

```text
docs/documents/
  README.md
  ARCHITECTURE.md
  DEVELOPMENT_LOG.md
  MVP_PLAN.md
  OPERATIONS.md
  ROOM_PROTOCOL.md
  ADR/
  agent-guides/
  INCREMENT_*.md
docs/work/
  README.md
  _templates/
  <work_id>/
```

仅有以下三个 agent/tooling 控制入口保留在仓库根目录：

- `AGENTS.md`
- `CLAUDE.md`
- `PROJECT_RULES.md`

这些入口 MUST 只保留启动所需角色边界、权威顺序和强制路由，详细项目内容通过链接指向 `docs/documents/`。不得在旧路径留下副本、兼容镜像或第二份权威文档。

## 4. 文档集与单一权威

[README.md](../README.md) MUST 列出每篇文档的用途、Owner、状态和依赖关系。新增、移动、废弃或更名文档时，同一变更中更新目录和 `PROJECT_RULES.md` Documentation Map。

| 事实 | 唯一详细权威位置 | 其它文档处理方式 |
|---|---|---|
| 项目目标、共享规则、角色边界 | `PROJECT_RULES.md` 与根级角色入口 | 链接，不复制全文 |
| 系统结构与 dependency direction | `ARCHITECTURE.md`、Accepted ADR | 运维/计划只引用当前结论 |
| entity、state、transition、error、MCP/Runner contract | `ROOM_PROTOCOL.md` | 接口/运维文档只解释使用视角 |
| Increment 顺序与验收 | `MVP_PLAN.md`、Accepted Task Contract | Development Log 只记录事实 |
| 当前阶段与验证历史 | `DEVELOPMENT_LOG.md` | 其它文档不维护平行进度 |
| 人工操作与故障处置 | `OPERATIONS.md` | 架构文档链接 Runbook |

## 5. 编写与维护流程

1. **定义交付物**：确定标题、状态、Owner、读者、评审目标、生效范围和关联材料。
2. **固定边界**：写明目标、非目标、约束、依赖、假设与待确认项。
3. **建模主路径**：按需使用状态机、时序、数据流或组件图；图后解释正常路径、异常路径和权威方。
4. **补全工程契约**：需求必须可验收；接口说明成功/失败/幂等；数据说明 transaction 和生命周期；运维步骤说明成功信号和失败动作。
5. **区分 Current 与 Candidate**：未接受或未集成内容只能标记 candidate，不得写成当前可用能力。
6. **一致性检查**：核对源码接口、`package.json` command、Git baseline、测试证据、协议和相对链接。
7. **收口决策**：集中列出风险、待确认项、Owner 和后续行动；不把开放问题藏在正文。

## 6. 每次 Review 后的文档维护门禁

每次 Implementation、Fix 或 Integration Review 结束后，Codex MUST 在派发下一 Coding Task 或请求交付提交前执行 documentation impact audit：

- 需求、范围、验收或 Task lineage 是否变化；
- public API、MCP/CLI、schema、error 或兼容语义是否变化；
- 架构、组件责任、dependency direction 或目录结构是否变化；
- SQLite、Git、runtime、artifact、log、command、故障或恢复语义是否变化；
- 当前阶段、accepted commit、branch/integration 或验证事实是否变化。

处理结果：

- 有影响：更新对应权威文档和 `README.md`；运维影响同时更新 `OPERATIONS.md`。
- 无影响：保持文件不变，在 Review Verification Summary 报告 `documentation: no_change` 及理由。
- 证据冲突：报告 `documentation: blocked`，把冲突列为 finding/Open Question，不猜测事实。

`approved` 但用户尚未接受的内容只能进入 candidate/pending 区域；用户接受且目标 branch 集成后才提升为 current operational view。

## 7. Claude Code 候选文档边界

Claude Code 只有在 Accepted Contract 的 `documentation_updates` 明确列出时才修改项目文档；长期文档路径 MUST 位于 `docs/documents/`，Workflow实例路径 MUST 位于 `docs/work/`。Claude 的文档 Diff 只是 candidate；Codex MUST 使用本 skill Review 完整内容并决定权威文档如何同步。

Codex 不得借文档角色编写业务代码、测试或实现配置；文档发现实现缺口时应形成 finding、Architecture Review 或 Task Contract。

## 8. 验证与完成条件

文档任务完成前 MUST 验证：

- `docs/documents/`与`docs/work/`按长期权威/Workflow实例边界放置Markdown；
- 根目录除三个控制入口外不存在项目 Markdown；
- 所有相对 Markdown link 可解析，无未解析 merge marker；
- `README.md` 与 `PROJECT_RULES.md` Documentation Map 覆盖全部文档；
- 文档中的 exported interface、command、path、branch/commit 和实现状态可由当前代码或 Git 证据验证；
- 没有把 Draft、model self-report、临时 bootstrap 或未集成 worktree写成 Current；
- 没有重复权威、空模板章节、无来源生产指标或不可执行形容词。

该角色与目录门禁只改变文档工作流，不增加 Room state、Event、protocol field、runtime hook 或 ADR。
