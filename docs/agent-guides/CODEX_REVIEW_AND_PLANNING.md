# Codex Review、架构与规划指南

> 状态：Current  
> Reader：Codex  
> Trigger：需求分析、架构、规划、Task Contract、Code Review、Fix finding 或解决方案

## 1. 开始前建立证据边界

1. 读取 `PROJECT_RULES.md`、会话必读文档、当前 Accepted Contract、相关协议/ADR/计划与开发状态。
2. 读取正确 baseline、完整 staged/unstaged/untracked 状态和 task-owned Diff；把并发文档、用户既有修改与本 Task 分开。
3. 把用户目标、Contract acceptance criteria 和当前阶段写成可观察结果。
4. 对每个准备运行的检查先写清：检测什么失败；失败后改变哪个 Review、架构或规划决定。
5. 模型报告和测试绿灯是导航证据，不替代实际 Diff、状态数据和 public behavior。

## 2. 架构与规划判断

### 2.1 先确定 invariant 与所有者

- 明确被约束的事实是什么，例如 current Run、current Review、idempotent create 或合法 transition。
- 明确事实的唯一所有者和既有表达：Room state、entity status、cross-entity reference、Event sequence、Git 或 process result。
- 先判断现有权威事实能否唯一且稳定推导；能推导就复用，不能推导且确实影响行为时才讨论新持久化字段。
- 不因字段“更直观”或未来可能并发就新增 `active_*` pointer、同步状态或 migration。

### 2.2 公开入口就是当前支持边界

- 当前 Increment 一旦暴露 application service public method，就必须满足该路径当前可到达的 lifecycle、reference、membership 和失败 invariant。
- 不能用“完整 orchestration 在后续 Increment”解释已经公开入口接受 stale entity。
- 若当前 Task 明确不支持某条路径，应保持入口未实现，而不是暴露后用文档免责。

### 2.3 规划最小闭环

- 一个 Task 只有一个可验证 goal；requirements 写行为，acceptance criteria 写观察证据，non-goals 阻止范围扩张。
- 并行前画真实 dependency DAG；公共 protocol、schema、package metadata、lockfile、central wiring 必须由串行前置或 Integration Task 单独拥有。
- 不先搭通用 framework、placeholder、兼容层或面向未知模块的 extension seam。

`PROJECT_RULES.md` 不存在时，首次 Architecture Review 至少输出：项目理解、核心模块、模块依赖、核心数据流、风险、建议优化、推荐开发顺序和是否存在架构问题；用户确认前不创建业务实现。

选择或改变核心架构、protocol、storage、state ownership、module boundary、重要 dependency、公开接口、持久化或恢复语义时，创建或更新 ADR，记录状态、日期、上下文、决策、备选、理由、后果和重新评估条件。仅整理文档结构或澄清既有规则时不制造 ADR。

## 3. Task Contract 设计

每项 finding 或新行为至少转换为四类场景：

| 场景 | Contract 应明确的结果 |
|---|---|
| 新的合法请求 | entity、Room state 和 Event 的成功结果 |
| 新的非法请求 | error code、rollback 与 durable state 不变 |
| 同 ID/同 content 重试 | 返回既有 entity、`created=false`、不新增 Event |
| 同 ID/异 content | `id_conflict`，不改变 durable state |

涉及 lifecycle 时，再加入 stale entity、current entity、错误 room/task/run membership 和非法 initial status。不要只写 happy path 或单个 guard。

Verification 条目必须包含：

- `command`：最窄且能直接覆盖行为的检查。
- `detects`：会否证的具体行为。
- `decision_if_failed`：失败后不得交付、需缩小修复还是需用户决定。

## 4. Review 方法

### 4.1 先审行为，再审局部代码

按以下顺序：

1. 需求与 Contract 是否满足。
2. state owner、dependency direction 和 public lifecycle 是否正确。
3. entity reference、status、membership、current entity 与 idempotency 是否同时成立。
4. transaction 内 write、guard、transition 与 Event 的顺序是否保持 rollback/重试语义。
5. 测试是否直接调用目标 public path、Oracle 是否独立、名称与 assertion 是否一致。
6. 新增或修改代码是否对关键职责、invariant、非显然顺序、取舍和失败语义提供必要的简体中文注释，同时避免逐行复述。
7. 文档、Coding Result 和实际 Diff 是否描述同一行为。

Coding Result 至少核对 `task_id`、status、summary、changed files、deviations、verification、tests、documentation changes、unresolved 和 questions；模型自述不能替代实际 Git 与命令证据。

### 4.2 测试全绿后的必要追问

- 是否只测了共享 helper，却声称覆盖多个 public method？
- 是否只证明新的非法请求被拒绝，遗漏已成功请求的 retry？
- 是否只检查 error code，遗漏 Room、entity 和 Event 的 partial write？
- 是否用实现导出的 allowed table/helper 生成期望，使实现与 Oracle 同源？
- 是否跨至少两个 lifecycle entity 重放了 stale/current 关系？

这些问题只在项目支持路径可达时形成 finding；不得扩展到假设性攻击或无消费者路径。

## 5. Fix Task 2 经验

### 5.1 current entity 应优先由现有事实推导

`REVIEW_REQUIRED` 由 `completeRun` 在同一 transaction 内产生，并追加 `run_completed` Event。因此该 Room sequence 最大的 `run_completed` Event 可以作为 current completed Run，不需要新增 `active_run_id`。

可复用判断：

1. 状态转换是否唯一产生某类 Event？
2. Event 与状态是否在同一 transaction 内？
3. per-Room sequence 是否给出稳定顺序？
4. 若三项成立，优先在 application boundary 查询最新 Event，而不是扩展 schema。

### 5.2 public path 证据不能由共享 validator 代替

`startRun` 与 `resumeRun` 共用 `normalizeRunForCoding`，只能说明实现复用；测试若只调用 `startRun`，不能声称 `resumeRun` 已被直接验收。

对每个 Contract 点名的 public method：

- 直接调用该 method；
- 构造其真实 source state；
- 覆盖要求的非法 status；
- 断言 error、Room、entity 与 Event；
- 测试名只描述实际调用的路径。

## 6. Fix Task 3 经验

### 6.1 新 guard 可能破坏既有 retry invariant

Fix 2 的 current Run guard 能正确拒绝“新 review_id + stale run”，但 guard 最初位于 `insertReview` 幂等判断之前，导致已持久化 `review-1` 在 `run-2` 完成后同 ID/同 content 重试也被拒绝。

Review 新 guard 时必须区分：

```text
existing same ID + same content
→ 已完成 create 的幂等重试

existing same ID + different content
→ id_conflict

new ID + stale entity
→ lifecycle validation failure + rollback

new ID + current entity
→ 新 transition
```

不要把“引用旧 entity”作为唯一分类；先判断请求是 retry 还是新 command。

### 6.2 顺序必须结合 transaction 语义判断

最小正确方向是复用 repository 的结构比较：先 `insertReview` 区分 retry/conflict/new，再只对新 Review 执行 lifecycle guard。新 stale Review 虽在 transaction 内暂时 insert，但 guard 抛错后整体 rollback，因此没有 durable partial write。

评审顺序调整时检查：

- 哪一步拥有同 ID/content 判定；
- 哪些 validation 只适用于新 command；
- 失败是否处于同一 transaction；
- rollback 后 Room、entity 与 Event 是否全部不变；
- retry 是否避免重复 transition 和 Event。

## 7. 从 Finding 到最小方案

1. 独立确认 finding：给出项目支持路径上的最小复现或充分代码证据。
2. 写出被破坏 invariant，不先命名解决技术。
3. 定位 invariant 当前所有者和最窄 application/repository boundary。
4. 优先复用现有事实与 helper；增加直接 regression。
5. 只有现有事实无法正确表达时才讨论 schema、pointer、dependency 或架构变化。
6. 删除不能追溯到 finding 或 acceptance criterion 的状态、分支、抽象和防御。
7. 向用户说明推荐方案、修复范围、明确 non-goals、验证方式和真实取舍；等待确认。

finding 成立不自动证明某个方案正确。Reviewer 也可能错误；未经验证的意见不得直接派发。

## 8. Review 输出与阶段

每个 finding 包含：严重性、标题、文件/行号、触发路径、错误与证据、影响、规则关系、最小方向。

输出顺序：Findings → Open Questions → Review Decision → Verification Summary。

- 无 finding：明确 `approved`，不制造问题。
- 有明确阻塞 finding：`changes_requested`。
- 方案存在真实产品/架构取舍：`needs_discussion`。

Review 后进入 `REVIEW_DISCUSSION`。只有用户确认最小方案，才能创建 `review_fixes_only` Fix Task；Fix 完成后重新审查完整 task-owned Diff，不因上轮方案正确就假定本轮没有新回归。
