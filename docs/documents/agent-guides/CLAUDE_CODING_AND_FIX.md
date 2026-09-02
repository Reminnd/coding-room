# Claude Code Coding 与 Fix 指南

> 状态：Current  
> Reader：Claude Code  
> Trigger：任意 Implementation Task 或 Fix Task

## 1. 从 Contract 到实现证据

Coding 前建立映射：

| Contract 内容 | 必须产出 |
|---|---|
| requirement | 对应 public behavior 和最小实现位置 |
| acceptance criterion | 具体 assertion 或可重复人工步骤 |
| non-goal | 明确不触及的代码、schema、dependency 或流程 |
| architecture decision | 必须复用的状态所有者、boundary 和数据流 |
| verification | 实际命令、结果和失败处理 |

若某项无法唯一映射且会改变方向，返回 `needs_decision`，不得自行补需求。

## 2. 工作区与范围

- Coding 前读取完整 Accepted Contract、相关文档、Git 状态和任务范围 Diff。
- 区分 task-owned、用户既有和其他并发修改；只改 task-owned scope，不回滚或整理其他变化。
- Fix Task 只实现 confirmed finding。Reviewer 建议与代码事实不符时，返回证据；不要为迎合 Review 制造改动。
- 先定位既有 service/repository/helper 和 transaction boundary，再写代码；不复制现有权威判断。

## 3. Lifecycle guard 的实现原则

application service 接收 `run_id`、`review_id`、`task_id` 或 `question_id` 时，按 Contract 校验：

- referenced entity 是否存在；
- room、task lineage 与 cross-entity membership；
- entity status 是否能执行当前 operation；
- entity 是否为当前 lifecycle 可操作对象；
- failure 是否保持 Room、entity 和 Event durable state 不变。

transition table 只证明 `(from_state, to_state, actor)` 合法，不能代替 entity lifecycle invariant。

优先复用 Room state、entity status、reference 和 Event sequence。Fix 未授权时，不新增 `active_*` pointer、migration、同步逻辑或通用 lifecycle framework。

## 4. Guard、idempotency 与 transaction 顺序

新增 validation 前必须列出四类请求：

| 请求 | 预期 |
|---|---|
| 同 ID/同 content 已存在 | 返回既有 entity，`created=false`，无新 Event |
| 同 ID/不同 content | `id_conflict`，durable state 不变 |
| 新 ID + 非法/stale reference | validation error，transaction rollback |
| 新 ID + 合法/current reference | create、transition、Event atomic 成功 |

实现顺序由 invariant owner 决定：

- repository 已拥有 schema-normalized ID/content 比较时，复用 repository，不在 service 复制结构比较。
- 只约束新 command 的 lifecycle guard 不得误伤已经完成的同内容 retry。
- transaction 内暂时写入不是 durable partial write；只有确认异常会 rollback entity、Room 和 Event 后，才允许“先 insert、后 guard”。
- 幂等返回必须避免重复 transition 和 Event。

## 5. Fix Task 2 Coding 经验

### 5.1 current Run guard

当 Contract 已确认最近 `run_completed` Event 是 current completed Run：

- 在 `submitReview` application boundary 复用 `latestEventEntityId`；
- 保留已有 task/room/status/result validation；
- 新 stale Review 返回 `validation_failed`；
- current Run Review 继续成功；
- 不新增 pointer、schema、migration 或 abstraction。

### 5.2 直接测试每个 public method

`resumeRun` 即使与 `startRun` 共用 validator，也必须在真实 `NEEDS_DECISION` source state 下直接调用：

- `succeeded`、`failed`、`needs_decision` 初始 status 均被拒绝；
- Room 仍为 `NEEDS_DECISION`；
- 新 Run 不存在；
- Event 数量不变。

不要用只调用 `startRun` 的测试声称覆盖 `resumeRun`。

## 6. Fix Task 3 Coding 经验

Fix 2 后，同内容旧 Review retry 被 current Run guard 误拒。最小修复应：

1. 在同一 transaction 内调用 `insertReview`。
2. 同 ID/同 content 时立即返回 existing Review 和 `created=false`。
3. 同 ID/异 content 继续由 repository 抛 `id_conflict`。
4. 仅对 `created=true` 的新 Review 执行 task/room/status/result/current Run guard。
5. 新 stale Review 的 guard 失败触发 rollback。
6. 只有合法新 Review 执行 transition 并追加 Event。

不要创建第二套 idempotency helper、额外 table 或 compatibility path。

## 7. 回归测试设计

### 7.1 public-path 与 durable-state assertion

每个失败测试至少断言适用项：

- error code；
- Room state；
- entity 是否存在及 status/content；
- Event count/sequence；
- current entity 未被意外替换。

只断言抛错不足以证明没有 partial write。

### 7.2 Fix 2/3 组合矩阵

在 `review-1` 已提交、Fix `run-2` 已完成的真实路径下直接覆盖：

1. 原 `review-1` 同 ID/同 content retry → existing、`created=false`、Room/Event 不变。
2. 原 `review-1` 同 ID/异 content → `id_conflict`、Room/Event 不变。
3. 新 `review_id` + stale `run-1` → `validation_failed`、Review 不存在、Room/Event 不变。
4. 新 `review_id` + current `run-2` → 成功进入 `REVIEW_DISCUSSION`。

### 7.3 独立 Oracle

- 期望来自 Contract、协议或测试侧 literal fixture。
- 不从被测实现导入 transition table、allowed values 或 helper 生成期望。
- 测试名和 Coding Result 只描述实际执行的 method 与 assertion。
- 测试全绿后逐项映射 acceptance criteria，补的是证据缺口，不是额外 framework。

## 8. Git Observer 与 process failure 经验

### 8.1 Failure 不能降级为空 evidence

调用外部 process 收集事实时，只有 command 成功后的空 output 才能表示 empty evidence。任何非零退出、启动失败、buffer failure 或解析前置失败都必须沿调用链传播，不得通过 `null`、`[]`、默认值或 catch fallback 解释为 clean/success。

process helper 只拥有 command execution fact。repository、HEAD、worktree 等 domain error 由知道 operation intent 的 caller 映射；不要把某个 exit code 在底层全局绑定为 `missing`，因为同一 exit code 在 evidence command 中可能表示真实 fatal failure。

### 8.2 按 runtime API 读取 error context

Node.js 异步 `execFile` 的 callback 为 `(error, stdout, stderr)`；stderr 来自第三个参数，不应假设普通 `error` object 含 `.stderr`。实现 process error 时直接保留 command、args、cwd、数字 exit code 与 callback stderr，并用聚焦失败测试证明这些字段实际可观察。类型断言和 typecheck 不能代替 runtime API 证据。

### 8.3 外部依赖 failure regression

- 使用真实且最小的 failure fixture；Git evidence 可使用“合法 HEAD + 损坏 index”，使 repository/HEAD probe 成功而 evidence command 失败。
- Contract 暴露多个 public operation 时逐一直接调用，不能用共享 helper 的一个测试代替。
- 断言 operation 拒绝且没有返回 clean/empty result；核对稳定的 error type/context，不匹配平台相关完整英文文本。
- fixture helper 必须保留实际创建资源的 owner path，并在 `finally` 删除 owner；不要只删除本来就不存在的 child path。

## 9. 注释、文档与交付

- 注释解释关键 invariant、非显然顺序及为什么 transaction 能保证 rollback；不逐行复述。
- `DEVELOPMENT_LOG.md` 记录实际 changed files、行为、测试数、命令结果、偏差和 `REVIEW_REQUIRED` 阶段。
- 不修改 Contract 禁止触及的共享规范或架构文档；若必须改变，返回 `needs_decision`。
- Coding Result 必须列出 task_id、状态、摘要、changed files、deviations、verification、tests、documentation changes、unresolved 和 questions。
- 完成后停止在 `REVIEW_REQUIRED`；不 commit、不宣布 Review 通过或 Increment 被接受。

## 10. Process settlement 与 Frozen Authority

### 10.1 多个 terminal event 共享一次 settlement

当 stdin `error`、child `error`、`close` 或其它 callback 都能完成同一个 Promise 时，使用一个最小 settlement guard 作为唯一 owner。第一个观察到的 terminal fact 决定 resolve/reject；所有后续 event 立即返回。回归测试必须直接调用 public operation，并至少覆盖“真实 failure 先发生、随后出现普通 success/close”这一顺序，断言 failure type、稳定 context 与结果都不被改写；不要为此创建通用 process state machine。

### 10.2 Frozen capability 使用单一 module-owned definition

Contract 冻结 exact capability name 时，定义一个 module-owned `as const` value，并让 input literal type、runtime lookup 与 success evidence 都引用它。caller 传入字段可以保留接口 shape，但不能成为第二 authority。negative regression 应绕过 compile-time literal constraint 注入普通 built-in 或其它替代值，证明 runtime 仍按 frozen value 校验并拒绝缺失 capability；不要增加 registry、alias 或 compatibility layer。

## 11. Integration Failure Evidence 与 Central Regression

### 11.1 在最窄可靠性边界保存 partial evidence

同一 event 同时携带 lifecycle identity 与 capability evidence 时，按依赖顺序处理：先校验 identity 是否 non-empty、是否匹配 expected value；通过后立即保存最小 observed evidence；再执行 required capability 等下游校验。下游校验失败时继续返回原 failure reason，并携带已可靠 evidence；identity 本身 missing、empty 或 mismatch 时保持 evidence 为 `null`。不得用 partial evidence 构造 partial success，也不得因为 operation 失败而清空已经可靠成立的事实。

### 11.2 Central mapping 必须通过 central public path 验证

leaf test 只负责 process/stream outcome；orchestrator test 负责 outcome 到 protocol error、terminal evidence 与 Room transition 的组合语义。Contract 点名的 asynchronous child error、stdin failure、signal、init、session、terminal 与 CodingResult failure 必须直接调用 central public operation，并断言：测试侧 literal error code、`Room=RUN_FAILED`、`Run=failed`、恰好一次 `run_failed`、零次 `run_completed`，以及场景要求的 session/exit/Git/artifact evidence。

可以参数化 fake process 与 stream lines 来减少重复 setup，但不得从 product classifier、failure-reason set 或 transition table生成期望；否则 implementation 与 Oracle 会同源。

## 12. Stream 状态边界与零副作用 Regression

### 12.1 在同一 fake process 内跨越 durable state transition

当 Fix 要求某类 progress 在 state transition 前写入、transition 后停止写入时，测试必须使用同一 `runClaude`/process execution。先发送 interpreter 可识别的非终态 line并确认它产生预期 Event，再调用真实 RoomService public method提交 durable transition，随后发送另一条可识别非终态 line与 terminal。最终用 Event sequence断言 transition前 Event存在且排序正确、transition后无新增同类 Event，并核对单一 terminal/pause settlement。不要用独立 service test、另一个 success Run或 init/result 这类返回 `null` 的 line替代该边界。

### 12.2 validation-before-spawn 同时证明 durable 与 external side effect 为零

若 Contract 声明 validation 在 Run、process、artifact与 Event创建前失败，测试在调用前保存完整 Room/相关entity/Event list/cursor snapshot，并在拒绝后 `deepEqual`；同时注入 recording/throwing fake spawner，断言 invocation count为零、新Run不存在且artifact owner path不存在。幂等 retry与`id_conflict`也分别在每次调用前保存完整 public snapshot，不只比较selected field或Event count。期望使用测试侧literal与public read method，不从private signature/helper生成。

### 12.3 正常 lifecycle 无法产生的 durable-state 损坏使用 test-owned mutation

当 Accepted Contract 明确要求 public boundary 拒绝某类 persisted-state 损坏，而正常 public lifecycle 无法构造该状态时，只在 temporary test database 内对最窄 storage row/reference 做 test-owned mutation，再直接调用目标 public operation。mutation 后、operation 前保存完整 durable snapshot，并按 12.2 节证明拒绝零副作用。不得为测试新增 production mutation API、通用 corruption framework、schema/migration或第二套状态权威；若 direct regression 证明既有 production guard 正确，production source保持不变。

## 13. Opaque Identity 的 URI Segment 表示

当Contract要求任意非空opaque identity映射到单个URI path segment时，不要假设`encodeURIComponent`已经处理所有URL parser语义：它可编码slash，却保留`.`与`..`，WHATWG parser会在request到达route handler前执行dot-segment normalization。若Accepted方案冻结固定framing，应先拼接固定prefix，再对raw identity执行component encoding；framework完成标准percent-decode后，application只验证并移除一次prefix，剩余值直接作为raw identity，不做第二次decode。

Regression期望必须使用测试侧literal，并分别覆盖slash、`.`与`..`经过真实MCP、production Runner和public CLI boundary的成功路径；同时证明unframed、raw multi-segment或旧candidate URL在spawn、Run、Event、artifact与config write前拒绝。framing只改变transport representation，不得进入Participant、Assignment、Run、Review或Event identity字段，也不得通过schema restriction、alias、wildcard或compatibility rewrite规避既有opaque identity contract。

## 14. Union-shaped Payload 的最小实现与回归

当 Contract 冻结多个互斥合法 payload shape 时，先把每个 shape 写成直接 boolean condition，再显式拒绝不属于 union 的 empty/overlap shape；不要以“某字段非空时才校验”的单边 guard 留下空分支，也不要为两个分支创建通用 validator framework。

若 operation 存在 cancel-wins 或其它 effective-target canonicalization，先确定 effective target，再执行该 target 的 payload union validation。回归必须直接调用公开 operation，分别证明每个合法 shape 成功、empty/overlap shape 返回冻结 error，并对非法调用前后的完整 public durable snapshot做 `deepEqual`；已有合法分支测试不得删除、skip或弱化。

## 15. Independent-Connection Reservation Race Regression

Contract要求真实reservation竞争时，每个contender使用自己的database connection、service与public controller/application boundary。test-only subclass或fixture可以在调用`super`进入production reservation transaction之前设置bounded barrier；所有contender到达后同时放行。不要在首个调用已经写入`executing`或terminal state后再启动第二个调用，也不要为测试向production source增加hook。

Worker必须返回结构化outcome与本地external mutation count；主测试聚合后断言exact一个mutation、一个success和Contract冻结的stable loser。完成后关闭Worker connection，用fresh read connection读取race完整public snapshot，并与从同一seed执行一次相同public operation得到的control snapshot比较；只归一化Contract允许的temp path、Event UUID或wall-clock字段。harness必须有bounded timeout、Worker error/non-zero exit处理与fixture cleanup，避免failure变成挂起。

若Contract逐项列出`previewed|approved|succeeded|failed|outcome_unknown`等status的same-ID retry，逐status直接调用public operation并断言stored result、`created=false`、零observer/process/Event与完整snapshot不变；不得以一个terminal case代表全部terminal状态。
