# ADR-0005：删除 Git Baseline Hash Validation

| 属性 | 内容 |
|---|---|
| 状态 | Accepted |
| 日期 | 2026-08-31 |
| Owner | Codex |
| 决策者 | 用户 |
| 影响范围 | target `0.4-design` Git Observer、Run/RunAttempt、SQLite、Executor、MCP/CLI/Plugin |
| Supersedes | [ADR-0004](./0004-execution-core-run-attempt-and-concurrency.md)中`baseline_head`冻结与HEAD equality部分；其它决策保持 |

## 1. 上下文

Increment 10 accepted candidate以Git commit object ID作为Run lineage的一部分：first attempt冻结`baseline_head`，continuation比较actual HEAD。用户要求删除项目中的所有哈希校验，并确认该范围是全部project-owned runtime hash validation，不包含npm integrity、URL fragment、UUID或历史commit记录。

## 2. 决策

1. target production schema、SQLite与public consumer不再包含`baseline_head`或`observed_baseline_head`。
2. Git Observer不再读取commit object ID；clean unborn repository可以通过first-attempt clean gate。
3. first attempt仍要求existing non-bare Git worktree且staged/unstaged/untracked为空。
4. continuation仍要求同一canonical worktree，但HEAD、branch或commit drift不再拒绝。
5. 删除`git_head_missing`，保留repository missing、dirty worktree与Git command failure语义。
6. 不增加文件hash、Diff fingerprint、branch mirror、timestamp token或其它替代validator。
7. 仅修改fresh target schema；v0.2/v0.3 archive不迁移、不backfill、不兼容读取。

## 3. 方案比较

| 方案 | 结论 | 原因 |
|---|---|---|
| 保留`baseline_head` | 不采用 | 与用户确认的删除目标冲突 |
| 用branch name或file fingerprint替代 | 不采用 | 实质恢复同类校验并增加第二authority |
| 只删Executor compare、保留字段 | 不采用 | public/schema仍声明无效authority，形成死契约 |
| 完整删除baseline contract，保留canonical worktree与live evidence | 采用 | 最小且与确认范围一致 |

## 4. 后果

正向后果：

- target protocol不再保存或验证commit digest；
- clean unborn repository成为支持路径；
- schema、claim与consumer减少无后续行为的字段。

代价：

- operator在continuation前切换branch或创建commit时，Room不会自动拒绝；
- Review不能把`baseline..HEAD`作为必需边界，必须使用live staged/unstaged/untracked与task-owned Diff事实；
- 该变更是breaking schema change，必须在首次v0.4 cutover前完成或另行采用fresh后续protocol/database。

## 5. 实施与验证边界

实施范围和public regression由[Increment 11 Task Contract](../INCREMENT_11_TASK_CONTRACT.md)冻结。未通过Review及用户接受前，ADR只表示设计已接受，不表示Current capability；Current v0.3 runtime与accepted Increment 10 candidate继续保持既有事实。

Implementation状态：独立Codex task从clean exact baseline `c449f40aebe3ff018610c59f34782a698463f907`完成实现与Contract指定验证；Fix Review `review-increment-011-codex-002`无finding，用户已最终接受。Baseline-free source已由本次提交进入版本化`main`；无替代hash/fingerprint、dependency或migration，active runtime/database/binding仍为v0.3且未cutover。

## 6. 重新评估条件

- 项目从cooperating local operator转为真实adversarial/multi-user环境；
- future Git Controller需要可验证的immutable source revision作为业务输入；
- 用户重新要求continuation必须锁定commit ancestry。

这些条件出现时必须新建Architecture Review/ADR，不在本决策中预置兼容字段。
