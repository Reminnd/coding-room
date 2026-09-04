# Git、并行 Worktree 与 Integration 指南

## Current Local Parallel control plane

Local Bridge owns discovery, dependency-DAG/Ready-Set scheduling, independent worktrees, task-branch Git facts, task push and controlled task-to-Stage cherry-pick. Model policy and reasoning effort are immutable dispatch facts. Integration MUST stop on conflict; it never rebases or auto-resolves. Stage verification records the exact head and invalidates Ready for Review after any Stage change. Stage-to-main is a non-force fast-forward of the exact user-accepted Stage SHA.

> 状态：Current  
> Reader：Codex / Claude Code（只读取与自身角色相关部分）  
> Trigger：baseline、branch、worktree、并行 Task、integration、commit 或其他 Git 写操作

## 1. 共同原则

- Git working tree 是代码、staged/unstaged/untracked 状态的唯一权威来源。
- Room/Contract 保存协作与 dispatch metadata，不建立代码镜像或 saved patch 权威副本。
- branch/worktree 创建、child commit、merge/cherry-pick、integration commit、push 和清理是相互独立的权限。
- 用户批准并行方案、测试通过、Review 通过或既往提交授权都不自动授予下一项 Git 写权限。

## 2. Codex：baseline 与派发

- 默认使用用户当前 workspace/branch；未获授权不创建或切换 branch/worktree。
- 派发前记录 `baseline_head`、target worktree、branch 和 task owner；需要提交的 Task 不得处于 detached HEAD。
- 新 Implementation Task 执行 clean-worktree gate；同一 Implementation lineage 的 Fix 共享原始 baseline。
- Review 覆盖 task-owned staged、unstaged 和 untracked 文件；并发文档与其他 Task 变更单独归属，不混入 finding。
- 当前 HEAD 因获准文档 commit 前进时，必须核对 baseline ancestry 和 commit file scope，不能只比较 hash 字符串。

## 3. Codex：并行 Task 规划

- 先由串行 Task 建立当前模块所需的最小 package/test 骨架、稳定接口、错误语义与 integration seam。
- 只有 dependency DAG 中互不等待、接口已稳定、写入不交叉且可独立验证的 leaf module 才能并行。
- 公共 protocol、schema、package metadata、lockfile、central entry point 和跨模块 wiring 由前置串行或后续 Integration Task 独占。
- 每个模块 Contract 写清 parent goal、accepted interface、逻辑所有权、禁止修改的共享边界、独立验收和 integration expectation；branch/worktree/baseline 是 dispatch metadata，不增加协议字段。
- 每个模块分别 Review 和接受。单模块通过不等于 parent goal 完成；accepted module commits 只能在独立 Integration Task 中组合。
- 冲突或接口不一致进入 Review discussion 或范围受限 Fix/Integration Task，不自动选择一方覆盖。

## 4. Claude Code：并行模块执行

- 只有 Contract 与 dispatch context 已明确 parent goal、accepted interface、scope、共享边界、baseline、branch/worktree 和独立验收时才开始。
- 只在分配 worktree 工作；不读取其他 worker 未接受修改作为依赖，不向其他 worktree 写入。
- 正确实现若必须修改共享 protocol/schema/package metadata/lockfile/central wiring 或其他 worker 所有路径，返回 `needs_decision`。
- 只报告当前模块 Coding Result 和独立验证；不宣称 parent goal/integration 完成。
- 不自行 merge、cherry-pick、commit、创建/删除 branch/worktree 或解决跨分支冲突。

## 5. Commit 权限

### 5.1 角色契约文档

用户明确授权“仅提交 `AGENTS.md` 和 `CLAUDE.md`”时，Codex 必须检查完整 Diff、branch 与 staged 状态，只使用明确 pathspec，不得 `git add .` 或吸收实现文件。该授权不覆盖细分指南、业务代码、测试、配置、开发日志或其他文档，除非用户明确列入 scope。

### 5.2 Increment 实现

- Implementation 与 Fix 在 Coding/Review discussion 期间保持未提交。
- 只有 Codex 最终 Review 无阻塞 finding、用户明确接受 Increment，并再次授权具体实现 scope 后，Codex 才提交已 Review 的代码、测试、必要配置和实现文档。
- 提交前核对 branch、最终 Review、验证证据和 task-owned files；不夹带角色契约或下一 Increment 文件。
- commit 后报告 hash、实际 files、验证摘要和剩余 worktree；未获 push 授权时停止。

### 5.3 Claude Code

Claude Code 不执行角色契约或 Increment 自动提交，不预先 stage，不把文档授权、测试通过或 `completed` 状态解释为 Git 写权限。


## GitHub Stage integration路线（Current）

项目开发采用Stage integration + Task/Subtask branch；单写入Task不拆Subtask。GitHub持久化Plan、Contract、commit、branch、PR、Check与Review交接。最终main集成只允许exact `accepted_head_sha`的non-force fast-forward；不得自动rebase、解冲突、force push或创建integration merge commit，真实Git失败立即停止。ChatGPT fixed Chat正式Review后若immutable reviewed SHA不变，最终FF后不重复Review。Supervisor不得approve或merge；Fix始终需要用户确认。
