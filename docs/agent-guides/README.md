# Agent 细分指南索引

> 状态：Current  
> 维护者：Codex；Claude Code 可按 Implementation Task 提交候选更新  
> 作用：为 `AGENTS.md` 与 `CLAUDE.md` 提供按任务触发的渐进式读取结构

## 1. 权威关系

- `AGENTS.md` 与 `CLAUDE.md` 是各自角色的入口和最高角色契约。
- `PROJECT_RULES.md` 是共享规范入口；本目录不复制或替代其项目事实。
- 本目录只承载会随任务类型选择性加载的方法细节。入口文档路由命中时，执行者必须完整读取对应文件。
- 若细分指南与用户当前要求、角色入口、`PROJECT_RULES.md` 或 Accepted Contract 冲突，停止受影响工作并报告，不得自行调和。

## 2. 路由表

| Reader | Trigger | Required guide |
|---|---|---|
| Codex | 架构、规划、Task Contract、Review、Fix finding 或解决方案 | [CODEX_REVIEW_AND_PLANNING.md](./CODEX_REVIEW_AND_PLANNING.md) |
| Claude Code | 任意 Implementation Task 或 Fix Task | [CLAUDE_CODING_AND_FIX.md](./CLAUDE_CODING_AND_FIX.md) |
| Codex | branch、worktree、并行拆分、integration、baseline 或 commit | [GIT_AND_PARALLEL_WORKFLOW.md](./GIT_AND_PARALLEL_WORKFLOW.md) 的 Codex 部分 |
| Claude Code | 并行模块、worktree、integration 或任何 Git 写操作 | [GIT_AND_PARALLEL_WORKFLOW.md](./GIT_AND_PARALLEL_WORKFLOW.md) 的 Claude Code 部分 |

## 3. 维护规则

- 新经验先判断属于角色入口硬边界、共享项目规则还是任务方法；只有任务方法写入本目录。
- 一条规则只保留一个详细权威位置；入口文件用强制路由和短摘要索引，不复制全文。
- 指南必须写成可执行的触发条件、判断顺序、证据要求和停止条件，不写抽象口号。
- 案例可以解释规则来源，但规则必须能脱离单次案例用于后续相同类别任务。
- 每次修改检查链接、merge marker、Documentation Map 和入口文件大小。
