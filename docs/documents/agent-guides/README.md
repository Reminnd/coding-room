# Agent 细分指南索引

> 状态：Current  
> 维护者：Codex；Claude Code 可按 Implementation Task 提交候选更新  
> 作用：为 `AGENTS.md` 与 `CLAUDE.md` 提供按任务触发的渐进式读取结构；项目文档总入口见 [文档中心](../README.md)

## 1. 权威关系

- `AGENTS.md` 与 `CLAUDE.md` 是各自角色的入口和最高角色契约。
- `PROJECT_RULES.md` 是共享规范入口；本目录不复制或替代其项目事实。
- 本目录只承载会随任务类型选择性加载的方法细节。入口文档路由命中时，执行者必须完整读取对应文件。
- 若细分指南与用户当前要求、角色入口、`PROJECT_RULES.md` 或 Accepted Contract 冲突，停止受影响工作并报告，不得自行调和。

## 2. 路由表

| Reader | Trigger | Required guide |
|---|---|---|
| Codex | 架构、规划、Task Contract、Review、Fix finding、解决方案或 Fix 验收后经验回收 | [CODEX_REVIEW_AND_PLANNING.md](./CODEX_REVIEW_AND_PLANNING.md) |
| Codex | 编写、补全、迁移、Review 或维护任意项目文档；每次 Review 结束 | `backend-doc-authoring` skill、[CODEX_DOCUMENTATION_AUTHORING.md](./CODEX_DOCUMENTATION_AUTHORING.md) 与 [文档中心](../README.md) |
| Claude Code | 任意 Implementation Task 或 Fix Task | [CLAUDE_CODING_AND_FIX.md](./CLAUDE_CODING_AND_FIX.md) |
| Codex | branch、worktree、并行拆分、integration、baseline 或 commit | [GIT_AND_PARALLEL_WORKFLOW.md](./GIT_AND_PARALLEL_WORKFLOW.md) 的 Codex 部分 |
| Codex Supervisor | GitHub Router dispatch或Codex Cloud Coding交接 | [CODEX_SUPERVISOR_ROUTER.md](./CODEX_SUPERVISOR_ROUTER.md) |
| ChatGPT fixed Chat | GitHub PR正式Review、finding或acceptance | [CHAT_GITHUB_REVIEW.md](./CHAT_GITHUB_REVIEW.md) 与 [CODEX_REVIEW_AND_PLANNING.md](./CODEX_REVIEW_AND_PLANNING.md) |
| Claude Code | 并行模块、worktree、integration 或任何 Git 写操作 | [GIT_AND_PARALLEL_WORKFLOW.md](./GIT_AND_PARALLEL_WORKFLOW.md) 的 Claude Code 部分 |

## 3. 维护规则

- 新经验先判断属于角色入口硬边界、共享项目规则还是任务方法；只有任务方法写入本目录。
- 一条规则只保留一个详细权威位置；入口文件用强制路由和短摘要索引，不复制全文。
- 指南必须写成可执行的触发条件、判断顺序、证据要求和停止条件，不写抽象口号。
- 案例可以解释规则来源，但规则必须能脱离单次案例用于后续相同类别任务。
- Codex 是全部项目文档的最终维护者；每次文档工作 MUST 调用 `backend-doc-authoring` skill，并把长期项目文档放在 `docs/documents/`，具体Workflow实例Contract放在 `docs/work/`。根目录仅保留三个 agent/tooling 控制入口。
- 每次 Review 后必须审计全部相关文档；有影响时更新对应权威文档和文档中心，无影响时在 Verification Summary 报告 `documentation: no_change` 及理由。
- 每次修改检查链接、merge marker、文档中心、Documentation Map 和入口文件大小。
