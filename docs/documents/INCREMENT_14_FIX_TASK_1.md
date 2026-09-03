# `Reminnd/coding-room` Increment 14 Fix Task 1

## Progress Callback Failure Propagation and Concurrent Settlement Evidence

> **文档状态：** Accepted / `FIX_PLAN_READY` / 可直接派发
> **confirmed_by_user：** `true`
> **用户确认日期：** 2026-09-03
> **Parent Task：** `increment-014-validation-ownership-and-invariant-simplification`
> **Based on Review：** `review-increment-014-root-001`
> **原始基线：** `ee3cd96315ed0c14220692c3bc92d6ecaff7430a`
> **待修复Candidate：** `41496df6b37d40d871460f1164dacaade37e1c3d`
> **待修复Candidate分支：** `codex/increment-14-validation-boundary-ee3cd96`
> **目标仓库：** `Reminnd/coding-room`
> **执行者：** 独立Codex Coding任务
> **交付方式：** 从精确Candidate提交新建独立Fix分支，完成代码、测试和文档后生成一个提交并推送GitHub
> **Review者：** 当前对话中的ChatGPT根会话，通过GitHub审查Fix提交及原始基线到Fix分支的完整累计Diff

---

## 0. 可直接复制给Codex的派发指令

```text
请执行 `D:\coding-room-increment-14-fix-task-1-codex.md` 中定义的完整Increment 14 Fix Task 1。

在本次请求中，该文档是我明确指定、已经确认的Fix Task Contract和执行依据，不是仅供分析、审查或总结的参考材料。请完整读取并严格遵守其中的confirmed_findings、goal、requirements、scope、non_goals、constraints、acceptance_criteria、verification、documentation_updates、Git交付规则和question_policy。

执行要求：

1. 读取仓库中的`AGENTS.md`、`PROJECT_RULES.md`、`docs/documents/agent-guides/CODEX_REVIEW_AND_PLANNING.md`、`docs/documents/agent-guides/CLAUDE_CODING_AND_FIX.md`、`docs/documents/INCREMENT_14_TASK_CONTRACT.md`及本Fix Contract要求的相关权威文档。
2. 执行`git fetch origin`，确认远端分支`origin/codex/increment-14-validation-boundary-ee3cd96`精确指向`41496df6b37d40d871460f1164dacaade37e1c3d`。若不一致，停止并返回`blocked`，不得猜测新的Candidate。
3. 从精确提交`41496df6b37d40d871460f1164dacaade37e1c3d`创建全新分支：
   `codex/increment-14-fix-1-progress-settlement-41496df`
   不得改写、追加提交或force-push原Candidate分支，也不得直接修改`main`。
4. 只修复`review-increment-014-root-001`中已经确认的两个Finding：
   - progress/stdout回调异常必须进入`startClaudeProcess` Promise与Runner可等待错误链，终止owned process，并在可写时使用现有`interrupted`终态完成Attempt结算；
   - 增加同一Attempt由两个独立SQLite连接真实并发settle的直接证据。
5. 完成本Contract范围内的代码、测试和项目文档维护。不得顺手处理Snapshot性能、RoomService拆分、Setup/Plugin清理、界面文案、其它测试损坏状态或无关重构。
6. 运行本Contract规定的全部验证。不得省略失败项，不得把未运行写成通过，不得通过放宽断言、跳过测试或增加重试掩盖问题。
7. 全部验证通过后，使用单一提交保存全部Fix代码、测试和文档，提交信息固定为：
   `fix(runner): close increment 14 review findings`
8. 执行`git push -u origin codex/increment-14-fix-1-progress-settlement-41496df`，并核对远端分支HEAD等于本地提交SHA。
9. 推送后不得amend、追加提交、force-push、创建Pull Request、合并`main`或删除任何分支。
10. 完成后按本Contract的Coding Result格式返回真实Git信息、完整changed files、验证结果、文档维护、deviations、unresolved和questions。后续Review将直接通过GitHub完成。
```

---

## 1. 已确认的Review结论

用户已确认`review-increment-014-root-001`中的两个Finding及其最小修复方向。当前阶段从`REVIEW_DISCUSSION`进入`FIX_PLAN_READY`。

### 1.1 Finding `inc14-r1-progress-callback-promise-gap`

- **Severity：** blocker
- **位置：**
  - `src/runner/executor.ts`中的`LocalExecutor.execute()` progress callback；
  - `src/runner/worker-adapter.ts`中的`ClaudeCodeWorkerAdapter.execute()`；
  - `src/runner/claude-process.ts`中的stdout `data`/EOF callback boundary。
- **证据：**
  - Increment 14 Candidate删除了Executor中的宽泛`catch {}`，改为同步调用`appendAttemptProgress`；
  - `startClaudeProcess`在Node.js Stream事件监听器中直接调用`input.onStdoutLine(...)`；
  - callback抛出的异常不会自动成为`startClaudeProcess()`返回Promise的rejection，而会从EventEmitter调用栈逸出；
  - Claim已经提交，异常逸出后Runner无法沿正常控制流收集证据和settle，Attempt可能留在`running`。
- **已确认方案：**
  - stdout callback必须由`startClaudeProcess`的Promise owner捕获；
  - 捕获后停止owned child process，并把失败送回Promise/WorkerAdapter/LocalExecutor的可等待链；
  - 如果Attempt仍为`running`且SQLite/authority允许写入，复用现有`interrupted` Attempt终态、Run=`failed`及既有`run_attempt_failed` Event完成一次结算；
  - 不新增Run/Attempt状态、ProtocolError code、后台恢复、自动重试、错误队列或全局`uncaughtException`处理器；
  - 如果结算本身因数据库或authority错误失败，必须返回真实错误，不得伪造已结算成功。

### 1.2 Finding `inc14-r1-settlement-concurrency-evidence`

- **Severity：** medium
- **位置：** `tests/execution-core.test.ts`及必要的test worker/helper。
- **证据：**
  - Increment 14把`settleRunAttempt`从CAS/re-read loop改为依赖`BEGIN IMMEDIATE`在读取前串行化writer；
  - 当前“terminal settlement is first-writer-wins”测试在同一个`RoomService`上顺序调用settle与retry；
  - 它没有两个独立`DatabaseSync`连接真实同时竞争同一Attempt，不能直接证明等待者取得写锁后读取winner已提交终态。
- **已确认方案：**
  - 使用同一个test-owned file-backed SQLite database；
  - 两个Worker或子进程各自创建独立`DatabaseSync`和`RoomService`；
  - 通过`SharedArrayBuffer`或等价有界barrier同时调用公开`settleRunAttempt`；
  - 覆盖same-payload与different-payload两个场景；
  - 最终证明只有一个terminal mutation/Event，loser幂等返回或稳定`id_conflict`，没有partial write。

---

## 2. Fix Task Contract

```yaml
task_id: increment-014-validation-ownership-fix-001
type: fix
parent_task_id: increment-014-validation-ownership-and-invariant-simplification
based_on_review_id: review-increment-014-root-001

background: >
  Increment 14 Candidate从ee3cd96315ed0c14220692c3bc92d6ecaff7430a形成单一提交
  41496df6b37d40d871460f1164dacaade37e1c3d，完成validation ownership收敛、内部
  不可达分支删除、Attempt settlement与GitAction reservation简化。GitHub Review确认主要方向正确，
  但发现两个阻塞交付的问题：stdout EventEmitter callback中的progress持久化异常没有被
  startClaudeProcess Promise捕获，可能在Claim后以uncaught exception终止并留下running Attempt；
  同时新的BEGIN IMMEDIATE settlement所有权缺少两个独立SQLite连接的真实并发回归。
  用户已经确认两个Finding与本文最小方案。

goal: >
  在不撤销Increment 14 validation ownership原则、不恢复宽泛catch/CAS retry loop、不改变公开
  protocol、schema、state、error enum、CLI/MCP输出或Git行为的前提下，使stdout/progress callback
  失败进入可等待的process→adapter→executor控制流，在可结算时以现有interrupted终态闭环Claim，
  并以两个独立SQLite连接的public-path并发settlement测试证明BEGIN IMMEDIATE下first-writer-wins。

confirmed_findings:
  - finding_id: inc14-r1-progress-callback-promise-gap
    severity: blocker
    evidence: >
      src/runner/claude-process.ts在stdout data/end事件中直接调用input.onStdoutLine；
      WorkerAdapter的try/await只能接收Promise rejection，不能接收从EventEmitter listener逸出的throw。
      Candidate的LocalExecutor progress callback直接调用appendAttemptProgress，故真实SQLite、authority
      或编程异常可能成为uncaught exception；Claim已经提交但terminal settlement没有执行。
    confirmed_solution: >
      由startClaudeProcess Promise boundary捕获onStdoutLine callback异常，停止owned child并把失败
      送回可等待链。WorkerAdapter/LocalExecutor保留已有stdout/stderr、Git与artifact事实，在Attempt仍
      running且settlement可写时使用现有interrupted terminal、Run failed和run_attempt_failed Event；
      结算不可写时传播真实错误。不得恢复宽泛catch、全局异常处理、自动重试或新状态。

  - finding_id: inc14-r1-settlement-concurrency-evidence
    severity: medium
    evidence: >
      tests/execution-core.test.ts现有terminal first-writer-wins测试只在单一RoomService中顺序执行，
      没有两个独立DatabaseSync连接同时进入public settleRunAttempt，未直接覆盖本次删除CAS loop后
      实际依赖的BEGIN IMMEDIATE串行化。
    confirmed_solution: >
      增加test-owned file-backed database与两个independent Worker/DatabaseSync/RoomService，使用
      bounded barrier同时settle同一Attempt，分别证明same payload双成功但单Event，以及different
      payload一成功一id_conflict且单Event。不得增加production hook、lock、retry或CAS。

requirements:
  - 只修复上述两个confirmed findings；review_fixes_only。
  - startClaudeProcess MUST 在它拥有的stdout line delivery boundary捕获input.onStdoutLine抛出的异常；
    newline-delimited delivery与EOF剩余行delivery都不得让异常从EventEmitter listener逸出。
  - callback失败 MUST 通过startClaudeProcess返回Promise进入WorkerAdapter/LocalExecutor可等待链；
    不得注册process.on('uncaughtException')、domain、全局error handler或测试专用production hook。
  - callback失败后 MUST 对owned child执行一次停止请求；既有close/error listener必须继续遵守单一
    Promise settlement，不得因随后close/error产生第二次resolve/reject或未处理异常。
  - 可以增加一个职责单一的内部typed process/callback error，用于区分spawn/stdin failure与
    stdout callback failure；不得增加ProtocolErrorCode、公开schema字段、通用callback framework
    或错误registry。
  - WorkerAdapter MUST 保留callback失败前已收集的stdoutLines/stderrChunks；LocalExecutor MUST 能
    继续执行一次Git evidence和artifact collection，并让callback failure在terminal分类中优先于
    stream/Git/artifact派生失败，避免把原始问题误报为coding_result_invalid或成功。
  - 当callback失败被处理时，如果Attempt仍为running且settleRunAttempt成功，MUST 使用现有
    status=interrupted、Run=failed、failure非空和既有run_attempt_failed Event；不得新增状态或Event。
  - callback failure的failure code MUST 复用现有`claude_exit_failed`，message MUST保留原始异常的
    可诊断信息；不得新增公开错误码。process_exit_code可保持null，agent_session_ref与已观察
    Git/artifact evidence按实际事实保存。
  - 如果在callback失败处理前Attempt已经cancel_requested，现有planner cancel intent仍优先，
    走既有canceled settlement；decision_requested/terminal late progress继续由
    appendAttemptProgress=false表达，不得转化为callback failure。
  - 如果terminal settlement本身抛出真实SQLite、authority或其它错误，Runner MUST reject/throw该
    真实失败且不得返回伪造的interrupted成功结果；不得自动重试settlement。
  - appendAttemptProgress现有running=>true、non-running=>false语义保持不变；不得恢复宽泛catch或
    预读状态后再写的TOCTOU路径。
  - 增加claude-process direct regression：stdout callback抛错时Promise可观察地reject/返回typed
    failure，owned child收到停止请求，后续close不形成第二次结果，测试进程无uncaughtException。
  - 增加runClaude/LocalExecutor public-path regression：注入一次progress persistence exception，
    证明一个process invocation、owned child被停止、Attempt=interrupted、Run=failed、恰好一个
    run_attempt_failed Event、零run_attempt_progress Event，并保留原始错误message及可获得证据。
  - 增加same-Attempt真实并发settlement helper/test；每个contender MUST使用独立DatabaseSync和
    RoomService，不得共享in-memory connection或单一service。
  - same-payload并发场景 MUST 使用完全相同的failed settlement payload；两个调用均可成功返回，
    durable Attempt/Run只写一次，run_attempt_failed Event恰好一个。
  - different-payload并发场景 MUST 使用同一terminal status但不同failure payload，避免以不同状态
    混淆Oracle；最终恰好一个成功、一个id_conflict，durable payload等于winner之一且Event恰好一个。
  - 并发测试 MUST 有bounded timeout、Worker error/non-zero exit处理、connection close和fixture cleanup；
    不得以sleep或多次重试制造“并发”。
  - 保留Increment 14全部既有boundary validation、terminal idempotency、cancel priority、GitAction
    concurrency、CLI/MCP技术输出和完整回归；不得回退原Candidate正确简化。
  - 文档只记录Fix lifecycle与实际行为，不得把Fix Candidate标记为Accepted、Current、merged或cutover。

non_goals:
  - Snapshot查询性能、N+1、Event cursor或SQLite索引优化。
  - RoomService拆分、Command Bus、通用Result/Either、通用callback/error framework或依赖注入。
  - Setup、Plugin、旧protocol migration、runtime cutover、service manager或后台health/recovery。
  - 新Run/Attempt状态、新Event、新ProtocolErrorCode、新公开failure schema或CLI/MCP输出改造。
  - 自动retry、settlement retry、process restart、queue、buffer replay、fallback、自愈或silent ignore。
  - 修改Git Controller、Scheduler、Plan/Revision、write scope、Git allowlist或integration_only语义。
  - 处理Review之外的测试损坏状态、Participant管理策略或其它既有问题。
  - 修改或追加提交到原Candidate分支、直接push main、创建PR、merge、rebase、amend或force-push。

architecture_decisions:
  - Node.js event listener callback异常必须由创建并返回Promise的process boundary重新纳入Promise
    settlement；不能依赖外层await自动捕获EventEmitter listener throw。
  - callback failure发生在Claim之后，LocalExecutor仍是Attempt terminal owner；可写时复用现有
    interrupted/failed/run_attempt_failed事实，不增加第二套恢复状态。
  - progress race与progress failure分开：合法Question/Cancel/terminal竞争由false表达；真实异常
    必须形成可观察失败，不能宽泛吞掉。
  - settleRunAttempt writer serialization由既有BEGIN IMMEDIATE和busy_timeout拥有；并发证据只通过
    两个independent SQLite connections验证，不恢复CAS或新增锁。

scope:
  - src/runner/claude-process.ts
  - src/runner/worker-adapter.ts
  - src/runner/executor.ts
  - tests/claude-process.test.ts
  - tests/claude-runner.test.ts
  - tests/execution-core.test.ts
  - tests/execution-core-settle-worker.ts
  - docs/documents/INCREMENT_14_FIX_TASK_1.md
  - docs/documents/README.md
  - docs/documents/MVP_PLAN.md
  - docs/documents/DEVELOPMENT_LOG.md
  - PROJECT_RULES.md

constraints:
  - Fix base MUST be exact commit 41496df6b37d40d871460f1164dacaade37e1c3d from remote Candidate branch.
  - Create only branch codex/increment-14-fix-1-progress-settlement-41496df; if it already exists remotely,
    return blocked and do not overwrite or choose another name.
  - Preserve original Candidate branch byte-for-byte; do not amend, reset, rebase, merge or force-push it.
  - Production changes MUST remain in the three runner files listed in scope; RoomService/repository/protocol/MCP/
    Git Controller changes are prohibited unless current code proves the confirmed solution impossible, in which
    case stop and return needs_decision with evidence.
  - tests/execution-core-settle-worker.ts may be added solely as a test-owned independent-connection worker;
    it must not be imported by production source.
  - Do not add dependency or modify package.json/package-lock.json/tsconfig.json.
  - Do not modify AGENTS.md、CLAUDE.md、ARCHITECTURE.md、ROOM_PROTOCOL.md、OPERATIONS.md、plugins/**、
    .agent-room/**或.codex/**。
  - Do not update CLAUDE_CODING_AND_FIX.md in this Coding task; reusable experience recovery belongs to the
    root reviewer after Fix Review approval and user acceptance.
  - Do not use any/ts-ignore/ts-expect-error/skipLibCheck, arbitrary casts to suppress the new failure flow, or
    production test seams.
  - Keep developer-facing technical terminology, state values, error strings and structured JSON unchanged
    except the confirmed interrupted failure evidence produced by this real path.
  - If correct repair requires protocol/schema/state/Event/error-enum changes, a new public command, automatic
    recovery or files outside the allowed conditional scope, stop and return needs_decision.

acceptance_criteria:
  - No exception thrown by input.onStdoutLine can escape a stdout data/end EventEmitter listener; it reaches the
    returned process Promise exactly once and the owned child receives a stop request.
  - A progress persistence exception injected through public runClaude completes without uncaughtException;
    the returned result has Attempt=interrupted and Run=failed, failure.code=claude_exit_failed, failure.message
    contains the injected marker, exactly one run_attempt_failed Event, and no run_attempt_progress Event.
  - The callback-failure path retains partial stdout/stderr artifacts and live Git evidence when those boundaries
    succeed; process_exit_code and session fields reflect actual observed facts rather than invented values.
  - If settlement is deliberately made to fail, runClaude rejects with a real error and does not claim a durable
    interrupted settlement succeeded; no automatic second settlement is attempted.
  - Existing decision/cancel late-progress regression still proves no post-question/post-cancel progress Event;
    cancel intent remains dominant and existing terminal behavior does not regress.
  - Two independent SQLite connections concurrently submit the same settlement payload: both public calls return
    successfully, final Attempt payload is exact, Run=failed, and exactly one run_attempt_failed Event exists.
  - Two independent SQLite connections concurrently submit different failure payloads: outcome multiset is one
    success plus one id_conflict; final Attempt payload equals one submitted winner payload and exactly one terminal
    Event exists with no other durable residue.
  - No CAS/retry loop, memory mutex, file lock, sleep-based retry, global error handler, new protocol code/state/
    Event or production test hook is introduced.
  - Increment 14 original focused and full regression remain green; GitAction cross-connection reservation test
    and existing sequential terminal retry/id_conflict tests continue to pass.
  - Fix documentation accurately records Accepted Fix Contract and REVIEW_REQUIRED Fix Candidate without claiming
    merge, acceptance, main update or active runtime change.
  - Fix branch contains one commit whose parent is 41496df6b37d40d871460f1164dacaade37e1c3d and whose remote
    SHA matches local SHA; main and original Candidate branch remain unchanged.

verification:
  - command: npm run typecheck
    detects: process callback failure type、WorkerAdapter outcome和Executor terminal mapping的类型漂移。
    decision_if_failed: 只修复本Fix类型；不得使用any、ignore、skipLibCheck或扩大协议类型。

  - command: node --test "tests/claude-process.test.ts" "tests/claude-runner.test.ts"
    detects: EventEmitter callback throw是否进入Promise、owned child停止、public Runner interrupted settlement、
      原始诊断与零uncaughtException。
    decision_if_failed: 修复最窄process/adapter/executor链；不得恢复宽泛catch或把异常静默忽略。

  - command: node --test "tests/execution-core.test.ts"
    detects: 两个独立SQLite连接的same/different payload settlement竞争、单一terminal Event、幂等与id_conflict。
    decision_if_failed: 修复test worker/barrier或本Fix引入回归；不得恢复production CAS/retry loop。

  - command: node --test "tests/room-service.test.ts" "tests/room-mcp.test.ts" "tests/runner-cli.test.ts" "tests/git-controller.test.ts" "tests/git-controller-cli.test.ts"
    detects: appendAttemptProgress布尔语义、CLI/MCP输出、Runner exit、GitAction并发与其它公开边界回归。
    decision_if_failed: 仅修复本Fix造成的回归；不得修改无关协议或放宽既有Oracle。

  - command: npm test
    detects: Fix对Increment 1-14累计Candidate的完整回归。
    decision_if_failed: 只修复本Fix引入问题；不得跳过、重命名掩盖或降低断言。

  - command: git diff --check 41496df6b37d40d871460f1164dacaade37e1c3d...HEAD
    detects: whitespace、patch damage和未解析格式问题。
    decision_if_failed: 只清理本Fix新增格式，不格式化无关文件。

  - command: git status --short; git diff --name-only 41496df6b37d40d871460f1164dacaade37e1c3d...HEAD
    detects: 工作区残留或超出Fix scope文件。
    decision_if_failed: 不clean/stash/reset；返回blocked并报告实际文件。

  - command: git rev-parse HEAD^; git log -1 --pretty=%s; git rev-list --count 41496df6b37d40d871460f1164dacaade37e1c3d..HEAD
    detects: parent、提交信息和单一提交约束。
    decision_if_failed: 不amend/rebase；停止交付并报告。

  - command: git ls-remote --heads origin codex/increment-14-fix-1-progress-settlement-41496df; git ls-remote --heads origin main; git ls-remote --heads origin codex/increment-14-validation-boundary-ee3cd96
    detects: Fix远端SHA、main不变和原Candidate分支不变。
    decision_if_failed: 不force-push或修订其它分支；返回blocked。

documentation_updates:
  - path: docs/documents/INCREMENT_14_FIX_TASK_1.md
    expected_change: 保存本文完整Accepted Fix Contract，并在Coding完成后记录实际Fix分支、提交和REVIEW_REQUIRED状态。
  - path: docs/documents/README.md
    expected_change: 在文档中心索引Increment 14 Fix Task 1，状态为Accepted / Fix Candidate REVIEW_REQUIRED。
  - path: docs/documents/MVP_PLAN.md
    expected_change: 记录两个confirmed finding、Fix Candidate与等待GitHub Fix Review，不复制完整实现细节。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录实际实现、changed files、callback Promise链、interrupted settlement、并发Oracle、验证结果和Git交付事实。
  - path: PROJECT_RULES.md
    expected_change: 只最小更新当前阶段与Documentation Map，使其显示Increment 14 Fix Task 1 Candidate处于REVIEW_REQUIRED；不改角色或长期规则。

question_policy: >
  如果正确修复需要改变公开protocol/schema/state/Event/ProtocolErrorCode、修改RoomService或Repository、
  新增自动retry/queue/recovery、恢复CAS loop、增加dependency、修改Git Controller/Plugin/Setup/runtime、
  扩大到无关测试或文档、改写原Candidate分支或直接更新main，立即停止受影响工作并返回
  needs_decision。局部内部错误类型、测试Worker文件名和fixture组织可按现有风格做最小选择，
  但必须满足所有observable acceptance criteria并在Coding Result说明。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: "2026-09-03T00:00:00Z"
```

---

## 3. 实现边界说明

### 3.1 推荐的数据流

```text
Claude stdout data / EOF flush
→ startClaudeProcess调用onStdoutLine
→ callback成功：继续正常process/stream流程
→ callback抛错：startClaudeProcess停止owned child并以Promise failure结束一次
→ WorkerAdapter保留partial stdout/stderr并返回可分类失败
→ LocalExecutor收集Git evidence与artifact
→ Attempt仍running：settle interrupted
→ Run failed + exactly one run_attempt_failed Event
→ room:run按既有interrupted规则返回非零exit
```

这是一条推荐的最小闭环，不要求建立通用事件投递层。实现可以在现有类型布局内选择最小函数或内部错误类，但不得改变上述事实所有者和结果。

### 3.2 不可伪造的失败情况

如果`appendAttemptProgress`失败的原因同时使`settleRunAttempt`无法写入，例如数据库不可写或冻结Executor当前被禁用，则：

```text
停止owned process
→ 尝试既有结算边界
→ 结算失败
→ 向调用者返回真实错误
```

不得返回一个实际上没有写入SQLite的`interrupted`结果，也不得在后台重试。该场景不要求新增自动恢复功能。

### 3.3 并发测试Oracle

并发测试不能只启动两个Promise调用同一个RoomService。每个竞争者必须：

```text
独立Worker/子进程
→ 独立DatabaseSync(file-backed same db)
→ 独立RoomService
→ barrier同时释放
→ 调用public settleRunAttempt
```

主测试在线程结束后使用fresh read connection读取最终事实。允许归一化`settled_at`、Event UUID等测试明确允许的非确定字段，不得归一化Attempt status、failure payload、Run status、Event type/count或其它关键事实。

---

## 4. Git交付规则

### 4.1 起点核对

Codex开始前必须核对：

```text
origin/codex/increment-14-validation-boundary-ee3cd96
= 41496df6b37d40d871460f1164dacaade37e1c3d
```

Fix分支必须从该提交创建。`origin/main`是否后来前进不改变本Fix父提交；不得把新main merge或rebase进Fix。

### 4.2 分支与提交

```text
branch:
  codex/increment-14-fix-1-progress-settlement-41496df

commit message:
  fix(runner): close increment 14 review findings

required parent:
  41496df6b37d40d871460f1164dacaade37e1c3d

commit count:
  exactly 1
```

### 4.3 禁止操作

- 不直接push `main`；
- 不修改或追加提交到`codex/increment-14-validation-boundary-ee3cd96`；
- 不merge、rebase、amend、reset、clean、stash或force-push；
- 不创建Pull Request、tag或release；
- 不删除Candidate或Fix分支；
- 不在完成后创建第二个“补文档”或“补测试”提交。

---

## 5. Coding Result返回格式

Codex完成后必须返回：

```markdown
## Status
`completed | blocked | needs_decision`

## Baseline and delivery
- repository: Reminnd/coding-room
- parent_candidate_branch: codex/increment-14-validation-boundary-ee3cd96
- parent_candidate_sha: 41496df6b37d40d871460f1164dacaade37e1c3d
- branch:
- commit_sha:
- parent_sha:
- remote_branch_sha:
- commit_message: fix(runner): close increment 14 review findings
- end_git_status:
- origin_main_sha:
- original_candidate_remote_sha:
- pushed_to_main: false
- original_candidate_modified: false
- force_push_performed: false
- additional_commits: 0

## Summary
说明两个Finding如何闭环，不使用“全部完成优化”等笼统表述。

## Confirmed findings fixed
### inc14-r1-progress-callback-promise-gap
- implementation:
- Promise/error ownership:
- process stop behavior:
- interrupted settlement behavior:
- settlement-failure behavior:
- direct regression:

### inc14-r1-settlement-concurrency-evidence
- worker/connection design:
- same-payload outcome:
- different-payload outcome:
- final durable Oracle:

## Changed files
- `path`：修改目的与公开行为变化

## Verification
- command:
  exit_code:
  status: passed | failed | not_run
  result:

## Tests changed
- `path`：实际覆盖的public path和独立Oracle

## Documentation changed
- `path`：维护内容与candidate状态
- documentation_impact: updated | no_change | blocked

## Deviations
- 无则写`none`
- 有则说明Contract条目、证据、影响和未擅自扩大的处理

## Unresolved
- 无则写`none`

## Questions
- 无则写`none`

## GitHub review target
- original_base: ee3cd96315ed0c14220692c3bc92d6ecaff7430a
- fix_base: 41496df6b37d40d871460f1164dacaade37e1c3d
- head: <fix branch>
- commit: <fix commit sha>
```

---

## 6. 后续Review方式

根会话收到结果后将通过GitHub同时审查：

```text
Fix-only Diff:
41496df6b37d40d871460f1164dacaade37e1c3d
...codex/increment-14-fix-1-progress-settlement-41496df

完整累计Diff:
ee3cd96315ed0c14220692c3bc92d6ecaff7430a
...codex/increment-14-fix-1-progress-settlement-41496df
```

Review重点：

1. callback异常是否真正进入Promise，而不是被另一个catch吞掉；
2. child停止和Promise settlement是否恰好一次；
3. partial stdout/stderr、Git和artifact事实是否保留；
4. `interrupted`、Run=`failed`、failure和Event是否与既有协议一致；
5. settlement失败时是否错误宣称成功；
6. 是否保持Question/Cancel的`false`竞争语义；
7. same/different payload是否由两个真实独立连接同时settle；
8. 是否出现sleep、重试、CAS恢复、生产测试Hook或新协议；
9. 文档是否仍保持Candidate / REVIEW_REQUIRED；
10. main、原Candidate分支、Fix parent和单一提交是否与Coding Result一致。


---

## 7. Fix Candidate 交付状态

- 文档状态：Accepted Fix Contract / Fix Candidate `REVIEW_REQUIRED`。
- Fix branch：`codex/increment-14-fix-1-progress-settlement-41496df`。
- Parent Candidate：`41496df6b37d40d871460f1164dacaade37e1c3d`（`codex/increment-14-validation-boundary-ee3cd96`）。
- 单一提交信息：`fix(runner): close increment 14 review findings`；exact commit SHA 与 remote branch SHA 由本次 Coding Result 和 Git history 提供，避免在提交内容中建立自引用。
- Candidate 行为：stdout progress callback failure 已进入 process Promise → WorkerAdapter → LocalExecutor 可等待链；owned child 被停止，partial stdout/stderr、Git 与 artifact evidence 保留，可写时复用既有 `interrupted` / Run=`failed` / `run_attempt_failed` 终态。
- 并发证据：两个 test-owned Worker 分别打开独立 `DatabaseSync` 与 `RoomService`，在 bounded barrier 后同时调用 public `settleRunAttempt`；same payload 双方成功且单 Event，different payload 为一个成功、一个 `id_conflict` 且单 Event。
- 公开 protocol、Schema、state、Event、`ProtocolErrorCode`、CLI/MCP 输出、Git Controller 与 active runtime 均未改变。
- 下一步：等待根会话对 Fix-only 与累计 Diff 执行 GitHub Fix Review；本文不声明 Fix 已接受、merged、cutover 或进入 `main`。
