# Codex Review、架构与规划指南

> 状态：Current  
> Reader：Codex  
> Trigger：需求分析、架构、规划、Task Contract、Code Review、Fix finding、解决方案、Review 后运维文档维护或 Fix 验收后经验回收

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
8. 本次 Diff 是否改变人工运维所需的接口、架构、结构、命令、状态/制品位置、故障或恢复语义。

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

每次 Review 输出完成后必须调用 `backend-doc-authoring` skill，并继续读取和执行 [Codex 项目文档编写与维护指南](./CODEX_DOCUMENTATION_AUTHORING.md)：审计需求、架构、协议、计划、开发状态、运维及执行指南等受影响文档。有变化时更新对应权威文档与 [文档中心](../README.md)；无变化时在 Verification Summary 明确记录 `documentation: no_change` 及理由。文档维护不改变上述 Review 输出顺序，也不把未接受 candidate 提升为 current capability。

## 9. Increment 2 Fix 经验：观察失败不是空状态

### 9.1 Observer 结果至少区分三种事实

审查外部事实 observer、adapter 或 process boundary 时，必须区分：

```text
command 成功 + 结果为空
→ 已确认没有对应事实

command 成功 + 结果非空
→ 已确认存在对应事实

command 失败
→ 未完成观察，不能对事实作空或非空判断
```

Increment 2 初始实现把 `git diff` exit 128 分类为 `missing`，再把 `stdout=null` 解析为 `[]`，因此损坏 index 的 repository 被错误接受为 clean。Review 时不能只检查 happy path 的分类准确性；还要检查失败是否被默认值、空集合、fallback 或 catch 分支降级为成功。

### 9.2 Process fact 与 domain semantic 必须在正确边界分离

- process boundary 拥有 command、args、cwd、exit code、stdout 与 stderr，只报告成功或失败。
- `git_repository_missing`、`git_head_missing` 等业务语义由知道 operation intent 的 semantic boundary 映射。
- 同一个 exit code 在 repository probe 中可以表示预期缺失，在 evidence command 中则可能表示观察失败；不得在底层 process helper 全局绑定一个 domain meaning。
- Review error mapping 时沿调用链检查每个 caller 是否能把 failure 重新解释成 clean、empty 或默认成功。

### 9.3 Fault injection 必须命中公开入口

共享 helper 的测试不能替代 public operation 证据。对依赖 Git、CLI、filesystem 或其他外部 process 的模块：

- 使用项目支持路径上的真实失败 fixture，例如保留合法 `HEAD` 但损坏 index；
- 直接调用 Contract 点名的每个 public operation；
- 断言它没有返回成功结果，并核对 error type 与必要 context；
- 不精确匹配平台相关完整错误文案；
- 同时确认失败注入和 cleanup 都没有修改目标 authority 或遗留 fixture。

### 9.4 类型通过不证明 callback 数据来源正确

Increment 2 中 `execFile` 的 stderr 来自 callback 第三个参数，但类型断言使“从 error object 读取 `.stderr`”仍可通过 typecheck。Review 对交付说明声称保留的 context 字段，应核对实际 runtime API signature 与最小失败证据，不能只依赖类型检查或对象 shape 注释。

## 10. Fix Task 验收后的经验回收

### 10.1 Trigger 与完成条件

每个 Fix Task 经完整二次 Review、Review Decision 为 `approved`，且用户明确接受该 Fix/Increment 后，Codex 在派发下一 Implementation/Fix Task 前执行一次经验回收。它不增加 Room state、Event type、protocol field 或 runtime hook；`ACCEPTED` 的产品语义保持不变。

经验回收只使用已经成立的证据链：原 finding、用户批准的 solution、Accepted Fix Task、实际 task-owned Diff、直接 regression、独立验证与最终接受。讨论中的猜测、未采用方案和偶然代码形式不升级为规则。

### 10.2 判断与文档路由

先把经验写成可脱离当前文件名和 ID 使用的行为规则，并判断它是否会改变未来相同任务的 Review、实现或测试决定：

- 只记录本次发生了什么：写入 `DEVELOPMENT_LOG.md`。
- Codex 的证据边界、Review 方法、方案收窄或 Task 设计经验：写入本指南。
- Claude Code 的实现顺序、process/API 使用、regression 或 fixture 经验：写入 `CLAUDE_CODING_AND_FIX.md`。
- 需要每次入口都持有的角色硬门禁：在用户明确授权下，用一句短规则更新 `AGENTS.md` 或 `CLAUDE.md`，细节仍留在指南。
- 双方共享的项目流程规则：更新 `PROJECT_RULES.md`；只有实际改变产品 architecture/protocol 时才更新 ADR 或 `ROOM_PROTOCOL.md`。

已有规则能够完整覆盖时不重复扩写；没有新的可复用经验时，在 `DEVELOPMENT_LOG.md` 记录“无新增可复用经验”即可。不得为了完成流程制造 checklist、抽象或案例专属规则。

### 10.3 自动化边界

可自动化的是 Trigger、必读路由、证据来源和文档一致性检查；经验是否可复用、属于哪个角色以及如何表述仍由 Codex 基于证据判断。未来即使 Room runtime 建成，也不应为该文档动作新增状态或阻塞 `room_accept_review`；若用户以后要求 runtime 自动生成或持久化 retrospective，再单独进行 Architecture Review。

## 11. Increment 3A/3B Fix 经验：并发终态与冻结 Authority

### 11.1 多 event process boundary 必须审查 first settlement

一个 Promise 同时由 stdin `error`、child `error`、`close` 或类似 event 竞争完成时，不能分别判断每个 handler 看起来是否正确。Review 必须确认这些 event 共享唯一 settlement owner，并构造项目支持路径上的直接顺序证据：先发生真实 failure，再发生表面 success event；最终结果仍必须保留最先成立的 failure 及其 context，后续 event 不得改写或触发第二次 settlement。

### 11.2 冻结 capability 不能由普通 caller value 重新定义

Contract 已冻结 exact tool、actor、schema discriminator 或其它 authority 时，Review 应沿 TypeScript input、runtime lookup 与 success evidence 三处检查其来源。三者必须由同一 module-owned frozen definition 驱动；普通 caller value 只能满足已冻结 literal，不能改变实际校验对象。negative regression 应注入一个看似可用但无权替代的值（例如 built-in tool），直接证明系统仍拒绝缺失的 frozen capability。

## 12. Increment 3 Integration Fix 经验：Partial Evidence 与 Central Mapping

### 12.1 Failure classification 与可靠 evidence 分开判断

下游 capability、schema 或 terminal 校验失败，不自动否定此前已经可靠观察到的 lifecycle evidence。Review 必须为每个 evidence field 找到最窄可靠性边界：例如 session ID 只有在 non-empty 且通过 expected-session 约束后才可保存；随后 required capability 缺失仍保持 failure，但不能把该 session 丢为 `null`。反之，missing、empty 或 identity mismatch 的值不得为了“保留 evidence”而持久化。

检查顺序应回答两个独立问题：本次 operation 是否成功；失败前有哪些事实已经可靠成立。二者必须同时反映在 terminal failure 与 durable evidence 中，不能用 partial evidence 把 failure 变成 success，也不能用 failure 抹掉可靠事实。

### 12.2 Leaf tests 不能替代 central orchestrator mapping

process transport 与 stream interpreter 的聚焦测试只证明各 leaf 产生的原始 outcome。central Runner 还拥有 failure precedence、protocol error mapping、Room/Run terminal state、evidence persistence 与 single settlement，因此每个 Contract 点名的 transport/stream failure class 都必须直接经过 central public operation。

Central regression 至少同时断言测试侧 literal error code、`Room=RUN_FAILED`、`Run=failed`、恰好一次 `run_failed`、零次 `run_completed`，并按场景核对 session/exit/Git/artifact evidence。参数化 fixture 可以复用 setup，但 mapping Oracle 不得从 classifier、transition table 或 leaf implementation 导入。

### 12.3 Lifecycle 文档必须反映真实执行顺序

Review Runner lifecycle 时，transition table、Architecture failure table 与代码顺序必须描述同一链路。例如 atomic claim 先进入 `CODING`，随后执行 process startup/MCP init，失败再走 `CODING → RUN_FAILED`；不能在一处把 MCP init 写成进入 `CODING` 的前置条件，另一处又让 init failure 从 `CODING` 结束。若现有已批准 state/transition 能表达真实顺序，优先修正文档和实现次序，不为文字冲突新增中间 state。

## 13. Increment 5 Fix 经验：同一执行边界与完整零副作用 Oracle

### 13.1 stream 内状态切换必须由同一 execution 证明

当 finding 约束“状态切换前允许、切换后禁止”的 stream/process 行为时，分开的 unit test、只发送 interpreter 忽略的 line，或只检查最终 Event 总数都不能证明时间边界。Regression 必须在同一 public execution 内依次产生：切换前可识别的非终态输入、真实 durable state transition、切换后可识别的非终态输入与 terminal settlement；再用 Event sequence 证明切换前 evidence 已提交、切换后没有同类 durable evidence，并同时断言最终 settlement。这样才能区分“整个路径从未记录 progress”与“只在状态切换后停止记录”。

### 13.2 零副作用结论必须覆盖 Contract 声称的全部 authority

Review 声称某个 validation 在 Run/process/artifact/Event 创建前拒绝时，不能只检查 error code 或下游 callback count。应在 operation 前保存 public durable snapshot，并在失败后比较完整 Room、相关 entity、Event list 与 cursor；同时按该 boundary 断言零 process invocation、零新 Run 与零 artifact。对已完成 command 的 same-payload retry 与 different-payload conflict，应分别在每次 operation 前保存完整 snapshot并在 operation 后 `deepEqual`，避免 selected field 或 Event count 掩盖其它 durable write。
