# `Reminnd/coding-room` Increment 14 Fix Task 2

## Wait for Owned Process Close Before Evidence Collection and Settlement

> **文档状态：** Accepted / `FIX_PLAN_READY` / 可直接派发
> **confirmed_by_user：** `true`
> **用户确认日期：** 2026-09-03
> **Parent Task：** `increment-014-validation-ownership-fix-001`
> **Based on Review：** `review-increment-014-root-002`
> **原始基线：** `ee3cd96315ed0c14220692c3bc92d6ecaff7430a`
> **原始Candidate：** `41496df6b37d40d871460f1164dacaade37e1c3d`
> **待修复Fix 1 Candidate：** `f95c63c02817115d1ded566e3032a4c0d32cd085`
> **待修复Fix 1分支：** `codex/increment-14-fix-1-progress-settlement-41496df`
> **目标仓库：** `Reminnd/coding-room`
> **执行者：** 独立Codex Coding任务
> **交付方式：** 从精确Fix 1 Candidate提交创建独立Fix 2分支，完成代码、测试和文档后形成一个提交并推送GitHub
> **Review者：** 当前对话中的ChatGPT根会话，通过GitHub审查Fix 2提交和原始基线到Fix 2分支的完整累计Diff

---

## 0. 可直接复制给Codex的派发指令

```text
请执行 `D:\coding-room-increment-14-fix-task-2-codex.md` 中定义的完整Increment 14 Fix Task 2。

在本次请求中，该文档是我明确指定、已经确认的Fix Task Contract和执行依据，不是仅供分析、审查或总结的参考材料。请完整读取并严格遵守其中的confirmed_findings、goal、requirements、scope、non_goals、constraints、acceptance_criteria、verification、documentation_updates、Git交付规则和question_policy。

执行要求：

1. 读取仓库中的`AGENTS.md`、`PROJECT_RULES.md`、`docs/documents/agent-guides/CODEX_REVIEW_AND_PLANNING.md`、`docs/documents/agent-guides/CLAUDE_CODING_AND_FIX.md`、`docs/documents/INCREMENT_14_TASK_CONTRACT.md`、`docs/documents/INCREMENT_14_FIX_TASK_1.md`及本Fix Contract要求的相关权威文档。
2. 执行`git fetch origin`，并核对：
   - `origin/codex/increment-14-fix-1-progress-settlement-41496df`精确指向`f95c63c02817115d1ded566e3032a4c0d32cd085`；
   - `origin/codex/increment-14-validation-boundary-ee3cd96`仍指向`41496df6b37d40d871460f1164dacaade37e1c3d`；
   - `origin/main`仍指向`ee3cd96315ed0c14220692c3bc92d6ecaff7430a`。
   父Fix分支不一致时停止并返回`blocked`，不得猜测新的父提交。若只有`main`在本任务开始前正常前进，仍不得rebase或改用新main；应记录事实并以冻结的Fix 1 Candidate为父提交执行。
3. 确认工作区clean，并从精确提交`f95c63c02817115d1ded566e3032a4c0d32cd085`创建全新分支：
   `codex/increment-14-fix-2-process-close-f95c63c`
   该分支若已存在于本地或远端，停止并返回`blocked`；不得复用、覆盖或force-push。
4. 只修复`review-increment-014-root-002`中确认的一个剩余Finding：stdout callback失败后，`startClaudeProcess`必须等待owned child真正到达`close`边界，之后才能把CallbackError返回给WorkerAdapter，并允许Executor收集最终证据和结算Attempt。
5. Fix 1已闭合的same-Attempt独立SQLite连接并发settlement测试不得重写、删除、弱化或重新实现；只运行并保持通过。
6. 完成本Contract范围内的代码、测试和项目文档维护。不得顺手处理其它Runner、RoomService、Snapshot、Git、Setup、Plugin、界面或协议问题。
7. 运行本Contract规定的全部验证。不得省略失败项，不得把未运行写成通过，不得通过sleep重试、放宽断言、跳过测试或同步Fake行为掩盖真实Child Process时序。
8. 全部验证通过后，使用单一提交保存全部Fix 2代码、测试和文档，提交信息固定为：
   `fix(runner): wait for process close before settlement`
9. 执行：
   `git push -u origin codex/increment-14-fix-2-process-close-f95c63c`
   并核对远端分支HEAD等于本地提交SHA。
10. 推送后不得amend、追加提交、force-push、创建Pull Request、合并`main`或删除任何Candidate/Fix分支。
11. 完成后按本Contract的Coding Result格式返回真实Git信息、完整changed files、验证结果、文档维护、deviations、unresolved和questions。后续Review将直接通过GitHub完成。
```

---

## 1. 已确认的Review结论

用户已确认`review-increment-014-root-002`中的剩余Finding和最小修复方向。当前阶段从`REVIEW_DISCUSSION`进入`FIX_PLAN_READY`。

### 1.1 Finding `inc14-fr2-process-close-before-settlement`

- **Severity：** blocker
- **涉及位置：**
  - `src/runner/claude-process.ts`
  - `src/runner/worker-adapter.ts`
  - `src/runner/executor.ts`
  - `tests/claude-process.test.ts`
  - `tests/claude-runner.test.ts`
  - `tests/runner-fixtures/claude-process-fake.ts`或同职责test-only fake
- **已确认事实：**
  - Fix 1已经把stdout callback throw转换为`ClaudeProcessCallbackError`，不再让异常从EventEmitter listener逸出；
  - 当前`rejectStdoutCallback()`在记录失败后调用`child.kill()`，随后立即reject `startClaudeProcess()`返回的Promise；
  - `ChildProcess.kill()`只表示发送停止请求，不表示进程、stdio和owned resource已经关闭；真实完成边界是后续`close`事件；
  - 当前WorkerAdapter可以在`close`到达前返回，Executor随后可能提前收集Git evidence、写Artifact并settle Attempt；
  - 现有`FakeClaudeProcess.kill()`会同步emit `close`，无法模拟真实Child Process中`kill()`早于`close`的时序，因此现有绿色测试没有否证该缺口。
- **影响：**
  - Attempt/Run可能先进入terminal，而旧Claude进程仍在运行或仍持有stdio；
  - Git evidence和Artifact可能只反映中间状态；
  - Planner可能在旧进程真正关闭前retry同一Run，形成两个进程短暂操作同一worktree；
  - late stderr可能在Artifact写入后才到达；
  - “停止进程后结算”的文档描述与实际生命周期不一致。
- **已确认方案：**
  - callback失败时保存一个pending `ClaudeProcessCallbackError`；
  - 停止继续投递stdout line；
  - 对owned child只发送一次停止请求；
  - `startClaudeProcess` Promise保持未完成，直到同一child发出`close`；
  - `close`到达后，以保存的CallbackError完成唯一rejection；
  - WorkerAdapter在该rejection后完成interpreter并返回稳定partial evidence；
  - Executor随后才收集Git/Artifact并使用现有`interrupted`语义结算；
  - 不新增超时框架、后台清理、自动重试、新状态、新Event或ProtocolError code。

### 1.2 已闭合Finding不得重新打开

`inc14-r1-settlement-concurrency-evidence`已经由Fix 1闭合：两个Worker、两个独立`DatabaseSync`/`RoomService`连接通过bounded barrier同时调用公开`settleRunAttempt`，覆盖same-payload和different-payload。Fix 2不得修改其生产机制或降低测试Oracle。

---

## 2. Fix Task Contract

```yaml
task_id: increment-014-validation-ownership-fix-002
type: fix
parent_task_id: increment-014-validation-ownership-fix-001
based_on_review_id: review-increment-014-root-002

background: >
  Increment 14原Candidate从exact base ee3cd96315ed0c14220692c3bc92d6ecaff7430a形成
  commit 41496df6b37d40d871460f1164dacaade37e1c3d。Fix Task 1从该Candidate形成
  commit f95c63c02817115d1ded566e3032a4c0d32cd085，已经把stdout progress callback异常
  纳入startClaudeProcess Promise链，并补齐same-Attempt两个独立SQLite连接的真实并发settlement
  证据。GitHub Fix Review确认并发Finding已闭合，但process lifecycle仍有一个阻塞缺口：
  callback failure路径在child.kill()后立即reject Promise，没有等待真实Child Process的close；
  WorkerAdapter和Executor因而可能在owned process仍运行时收集证据和写入terminal settlement。
  用户已确认该Finding与本文最小方向。

goal: >
  在保留Fix 1 typed CallbackError、partial evidence、single settlement、Increment 14 validation
  ownership和BEGIN IMMEDIATE事务简化的前提下，把stdout callback failure的process Promise完成
  边界移动到owned child的真实close事件：先记录failure并请求停止，等待close后再把同一错误交给
  WorkerAdapter/Executor，确保Git evidence、Artifact和Attempt terminal settlement只发生在进程关闭后。

confirmed_findings:
  - finding_id: inc14-fr2-process-close-before-settlement
    severity: blocker
    evidence: >
      src/runner/claude-process.ts当前callback failure handler设置settled=true、调用child.kill并立即
      reject Promise。ChildProcess.kill只发送signal，close才表示process及stdio生命周期结束；因此
      WorkerAdapter可以在close前返回，LocalExecutor可以提前收集Git evidence、写Artifact并settle
      Attempt。tests/runner-fixtures/claude-process-fake.ts的kill同步emit close，使现有测试无法覆盖
      kill返回与close到达之间的真实窗口。
    confirmed_solution: >
      保存pending ClaudeProcessCallbackError，停止后续stdout delivery，idempotently kill owned child，
      并让startClaudeProcess Promise一直pending到child close。close handler若存在pending callback
      failure则reject该原始typed error，否则保持既有正常outcome。WorkerAdapter/Executor只在close
      之后继续partial evidence、Git/artifact collection和existing interrupted settlement。

requirements:
  - 只修复`inc14-fr2-process-close-before-settlement`；`review_fixes_only=true`。
  - `startClaudeProcess` MUST 将“Promise是否已完成”与“是否存在pending callback failure”作为两个
    不同事实；不得在callback throw发生时把Promise标记为已完成并立即reject。
  - callback failure MUST 先构造并保存唯一`ClaudeProcessCallbackError`，然后停止继续投递该chunk
    中剩余stdout line和之后的stdout data/end delivery。
  - pending callback failure建立后 MUST 对owned child请求停止；callback failure、AbortSignal和其它
    允许到达的停止来源共享现有idempotent stop owner，`child.kill()`总调用次数不得超过一次。
  - `startClaudeProcess`返回Promise MUST 在pending callback failure后保持未完成，直到同一child发出
    `close`事件。不得把`kill()`返回值、`killed`字段、stdout end、stderr end或任意timer当作process
    完成Oracle。
  - `close` handler MUST 是callback failure路径的唯一Promise完成点：存在pending callback error时
    reject该精确error；不存在时保持既有`{exitCode, signal}` resolve行为。
  - pending callback failure不得被随后到达的child `error`、stdin `error`、AbortSignal、stdout data/end
    或第二次`close`改写成其它错误、普通exit outcome或第二次settlement。实现可以忽略这些late signal，
    但不得增加全局handler、timer、retry、fallback或第二套resource manager。
  - 若现有Node ChildProcess语义保证`error`后仍有`close`，应直接依赖该framework保证；不要为
    “close永不到达”的假设场景增加超时、watchdog或强制第二次kill。
  - callback failure发生前已经收集的stdoutLines和stderrChunks继续保留；callback failure后、close前
    真实到达的stderr仍应由既有stderr callback收集，使WorkerAdapter返回时数组稳定并可写入Artifact。
  - WorkerAdapter MUST 在startClaudeProcess的close-bound rejection到达后才调用interpreter.finish并
    返回CallbackError outcome。若无需生产代码修改，应保持文件不变，不为形式改写。
  - LocalExecutor MUST 在adapter outcome返回后才执行completion Git evidence、Artifact write和
    settleRunAttempt；不得增加并行证据收集、提前Artifact、后台任务或补偿流程。若现有顺序已经满足，
    只增加直接测试，不为形式改写Executor。
  - callback failure的现有terminal映射保持不变：failure code=`claude_exit_failed`、Attempt=
    `interrupted`、Run=`failed`、Event=`run_attempt_failed`；不得新增状态、Event或ProtocolError code。
  - callback failure前若Attempt已进入`cancel_requested`，现有planner cancel intent继续优先；
    `decision_requested`或其它non-running late progress继续由`appendAttemptProgress=false`表达。
  - settlement本身抛错时仍原样reject且不重试；Fix 2不得掩盖或改写该语义。
  - 新增或调整test-only child fake，使`kill()`只记录停止请求而不自动emit `close`。不得改变所有既有
    Fake的默认时序以造成无关测试重写；优先增加职责单一的Delayed/ManualClose fake或局部subclass。
  - claude-process direct regression MUST 对newline callback failure证明：callback已发生、kill恰好一次，
    但在手工emit close前Promise尚未resolve/reject；close后才reject同一CallbackError。
  - claude-process direct regression MUST 覆盖EOF tail callback failure的同一close gate，避免仅修复
    newline data路径而遗漏stdout end路径。
  - direct regression MUST 证明pending期间后续stdout line不再投递、AbortSignal不产生第二次kill、
    late child error/第二次close不产生第二个Promise结果或uncaught exception。
  - runClaude/LocalExecutor public-path regression MUST 使用不会同步close的test child。callback failure
    发生并已请求kill后、手工close前，明确断言：
      * `settlementCalls === 0`；
      * Attempt仍为`running`；
      * Run仍为`running`；
      * terminal Event尚不存在；
      * `.agent-room/artifacts/<attempt-id>`尚未写入；
      * runClaude Promise尚未完成。
  - 同一Runner regression在close前追加一段stderr或可观察输出，close后再await result；最终必须证明：
      * 只结算一次；
      * Attempt=`interrupted`、Run=`failed`；
      * failure保留原始callback diagnostic；
      * `process_exit_code`保持实际可观察值（callback failure close通常为null）；
      * callback failure前stdout和close前stderr进入Artifact；
      * Git evidence在close后的稳定worktree上收集；
      * `run_attempt_failed`恰好一个、`run_attempt_succeeded`为零。
  - 现有“terminal settlement本身失败”回归 MUST 保持，并增加或保留`close`前settlementCalls=0的证明；
    close后settlement调用一次并将真实settlement error返回，Attempt/Run不被伪造为terminal。
  - Fix 1新增的`tests/execution-core-settle-worker.ts`及same/different payload并发测试不得删除、弱化、
    改成单连接或改用sleep；它们必须继续通过。
  - 公开protocol、SQLite schema、Room/Run/Attempt状态、ProtocolError code、CLI/MCP输出、Git行为、
    WorkerAdapter public shape和active runtime均不得改变。

non_goals:
  - 不重新设计Claude process abstraction、WorkerAdapter接口或LocalExecutor整体生命周期。
  - 不增加process close timeout、watchdog、escalating signal、SIGKILL fallback、process group管理、
    后台reaper、queue、retry、polling scheduler或自动恢复。
  - 不处理stderr callback throw、stdin重构、spawn error语义、cancel策略、Question语义或其它未确认问题。
  - 不修改RoomService settlement实现、Repository、BEGIN IMMEDIATE、SQLite busy_timeout、并发worker或
    Fix 1已经闭合的settlement concurrency Oracle。
  - 不修改protocol schema、error enum、Event类型、MCP tool、CLI输出、Git Controller、Scheduler、
    Snapshot、Setup、Plugin、binding、active database或UI文案。
  - 不进行RoomService拆分、性能优化、注释全仓清理、旧版本迁移或无关测试重构。
  - 不修改原Candidate提交、Fix 1提交或对应远端分支，不rebase、merge、amend或force-push。

architecture_decisions:
  - `child.kill()`是stop request，不是process completion；`close`是owned Child Process Promise的唯一
    正常完成边界。
  - callback failure由一个pending typed error表达，close到达后再完成Promise；不新增durable state。
  - process Promise完成后，WorkerAdapter才完成stream interpretation，Executor才收集最终外部事实并
    写terminal settlement。
  - 依赖Node ChildProcess现有`close`生命周期保证，不为框架保证之外的假设故障添加超时或回退。
  - test必须使用manual/delayed close fake表达真实时序；同步emit close的默认fake不能作为该Finding的
    独立Oracle。

scope:
  required_production:
    - src/runner/claude-process.ts
  conditionally_allowed_production:
    - src/runner/worker-adapter.ts
    - src/runner/executor.ts
  required_tests:
    - tests/claude-process.test.ts
    - tests/claude-runner.test.ts
  conditionally_allowed_tests:
    - tests/runner-fixtures/claude-process-fake.ts
  required_documentation:
    - docs/documents/INCREMENT_14_FIX_TASK_2.md
    - docs/documents/README.md
    - docs/documents/MVP_PLAN.md
    - docs/documents/DEVELOPMENT_LOG.md
  conditionally_allowed_documentation:
    - PROJECT_RULES.md

constraints:
  - 所有工作从exact parent `f95c63c02817115d1ded566e3032a4c0d32cd085`开始。
  - 新分支固定为`codex/increment-14-fix-2-process-close-f95c63c`。
  - 原Candidate分支`codex/increment-14-validation-boundary-ee3cd96`和Fix 1分支
    `codex/increment-14-fix-1-progress-settlement-41496df`必须保持原SHA，不追加提交。
  - 开始前工作区必须clean；不得stash、clean、reset或覆盖用户修改。
  - 生产代码优先只修改`src/runner/claude-process.ts`。只有类型或真实调用契约需要时，才最小修改
    `worker-adapter.ts`或`executor.ts`，并在Coding Result解释原因。
  - 不得修改`tests/execution-core.test.ts`和`tests/execution-core-settle-worker.ts`，除非当前代码无法
    编译且原因直接来自Fix 2类型变化；即使如此也只能做零语义类型适配，必须在deviations报告。
  - 不得修改AGENTS.md、CLAUDE.md、package.json、package-lock.json、tsconfig.json、plugins/**、
    .agent-room/**、.codex/**、protocol/schema、protocol/errors、RoomService、Repository或Git模块。
  - `docs/documents/INCREMENT_14_FIX_TASK_1.md`是历史Accepted Contract，不得回写或重写。
  - `PROJECT_RULES.md`仅在当前阶段或Documentation Map确实失真时最小更新，不得修改角色、权限或架构。
  - 全部Fix 2代码、测试和文档必须位于一个提交，提交信息精确为
    `fix(runner): wait for process close before settlement`。
  - 推送后停止；不得创建PR、merge、rebase、amend、force-push、tag、release或追加提交。
  - 若正确修复需要超出上述scope、改变公开行为或增加timeout/fallback，停止并返回`needs_decision`。

acceptance_criteria:
  - callback failure建立后，`child.kill()`恰好被请求一次，但startClaudeProcess Promise在`close`前
    保持pending。
  - newline和EOF tail两个stdout delivery路径都只能在`close`后reject保存的
    `ClaudeProcessCallbackError`。
  - pending callback failure后不会继续投递stdout line；late abort、error和重复close不会改写结果或
    触发第二次kill/settlement。
  - delayed-close Runner public-path测试在close前观察到Run/Attempt仍running、settlementCalls=0、
    无terminal Event、无Artifact和未完成的runClaude Promise。
  - close后Runner只结算一次，Attempt=interrupted、Run=failed、failure.code=claude_exit_failed，
    message含原始callback diagnostic，Git/Artifact/partial stdout和close前stderr证据正确。
  - settlement failure场景只在close后调用settlement一次，并把真实settlement error返回；不重试、
    不伪造terminal状态。
  - Fix 1的same-Attempt双连接并发测试继续通过且源码未被弱化。
  - `npm run typecheck`、所有focused tests、`npm test`、文档检查和`git diff --check`全部通过。
  - Diff只包含本Contract允许的代码、测试和文档；没有新依赖、Schema、状态、错误码或fallback。
  - Fix 2 Candidate文档保持`REVIEW_REQUIRED`，不得标记为`approved`、`ACCEPTED`、已进入`main`或已部署。
  - 远端Fix 2分支SHA等于本地提交SHA；提交parent精确等于`f95c63c02817115d1ded566e3032a4c0d32cd085`；
    `main`、原Candidate和Fix 1分支未被修改。

verification:
  - command: npm run typecheck
    detects: pending callback error、close handler和test fake类型契约漂移。
    decision_if_failed: 只修复Fix 2范围内类型；不得使用any、ts-ignore、skipLibCheck或包装绕过。

  - command: node --test "tests/claude-process.test.ts" "tests/claude-runner.test.ts"
    detects: kill-before-close窗口、newline/EOF callback failure、Promise pending、late signal、partial evidence、
      close前零settlement与close后single terminal settlement。
    decision_if_failed: 修复最窄process lifecycle或test fake；不得恢复立即reject、同步close Oracle或sleep重试。

  - command: node --test "tests/execution-core.test.ts"
    detects: Fix 1 same-Attempt独立连接并发settlement证据未被回归或弱化。
    decision_if_failed: 只修复Fix 2引入的Runner/process回归；不得改写BEGIN IMMEDIATE或并发Oracle。

  - command: node --test "tests/room-service.test.ts" "tests/runner-cli.test.ts" "tests/room-mcp.test.ts"
    detects: Attempt terminal、CLI exit、MCP和公开状态语义回归。
    decision_if_failed: 只修复Fix 2直接回归；不得改协议、状态、错误码或边界输出。

  - command: node --test "tests/git-controller.test.ts" "tests/git-controller-cli.test.ts"
    detects: Runner Fix越界影响GitAction或CLI行为。
    decision_if_failed: 删除越界修改；不得扩张Fix范围。

  - command: npm test
    detects: Increment 1-14累计回归。
    decision_if_failed: 只修复由Fix 2造成的task-owned regression；不得放宽既有断言或跳过测试。

  - command: git diff --check f95c63c02817115d1ded566e3032a4c0d32cd085...HEAD
    detects: whitespace、patch damage和格式错误。
    decision_if_failed: 只修复Fix 2新增格式，不格式化无关文件。

  - command: project Markdown relative-link and merge-marker scan
    detects: 新Fix Contract、索引和状态文档链接损坏或未解析merge marker。
    decision_if_failed: 修复本次文档链接/marker；不得重写无关文档。

  - command: git status --short; git diff --name-only f95c63c02817115d1ded566e3032a4c0d32cd085...HEAD; git rev-parse HEAD; git rev-parse HEAD^; git log -1 --pretty=%s
    detects: scope、工作区、parent和commit message不符合交付规则。
    decision_if_failed: 不清理或改写历史；返回blocked/needs_decision并报告事实。

  - command: git ls-remote --heads origin codex/increment-14-fix-2-process-close-f95c63c; git ls-remote --heads origin codex/increment-14-fix-1-progress-settlement-41496df; git ls-remote --heads origin codex/increment-14-validation-boundary-ee3cd96; git ls-remote --heads origin main
    detects: Fix 2推送结果及其它冻结分支/main是否被误改。
    decision_if_failed: 停止，不amend、不force-push、不修改其它分支；如实报告。

documentation_updates:
  - path: docs/documents/INCREMENT_14_FIX_TASK_2.md
    expected_change: >
      保存本Accepted Fix Contract全文，记录confirmed_by_user=true、based_on review、exact parent、
      Fix 2分支和Git交付边界；Coding完成后只更新执行事实与Candidate REVIEW_REQUIRED状态，不写Review结论。

  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: >
      记录Fix Review 2剩余Finding、实际close-gated实现、测试时序Oracle、验证结果、提交和远端分支事实；
      保持Increment 14未接受、未进入main、active runtime未变化。

  - path: docs/documents/README.md
    expected_change: >
      索引INCREMENT_14_FIX_TASK_2.md，并把当前未决行动更新为GitHub Fix Review 3。

  - path: docs/documents/MVP_PLAN.md
    expected_change: >
      最小登记Increment 14 Fix 2 Candidate范围、验证结果和REVIEW_REQUIRED阶段，不复制完整实现细节。

  - path: PROJECT_RULES.md
    expected_change: >
      仅在Documentation Map或当前阶段描述失真时，最小登记Fix Task 2和REVIEW_REQUIRED；不得修改角色、
      protocol、architecture或accepted capability。

question_policy: >
  如果正确修复需要改变公开protocol/schema/state/Event/error code、增加close timeout/watchdog/SIGKILL
  fallback/自动重试/后台reaper、修改RoomService或Repository、重写Fix 1并发机制、扩展到其它callback、
  修改active runtime、改变Git历史或超出scope，立即停止受影响工作并返回needs_decision。局部变量名、
  pending error表示方式、test-only delayed-close fake的位置可按现有代码风格作最小选择，但必须满足
  close是Promise完成Oracle、close前零evidence/settlement以及单一stop/single settlement全部验收。

review_fixes_only: true
confirmed_by_user: true
created_by: ChatGPT root reviewer
created_at: "2026-09-03T00:00:00+09:00"
```

---

## 3. 推荐的最小实现形态

本节说明允许的最小方向，不替代上方可观察验收标准。Codex应结合现有代码选择最窄实现。

### 3.1 `startClaudeProcess`状态所有权

推荐只保留三个局部事实：

```text
promiseSettled: boolean
stopRequested: boolean
pendingCallbackError: ClaudeProcessCallbackError | null
```

callback失败时：

```text
if promiseSettled或已有pendingCallbackError
  → 不重复处理

保存pendingCallbackError
→ 停止后续stdout line delivery
→ stopChild()一次
→ 不resolve、不reject
```

`close`时：

```text
if promiseSettled
  → return

promiseSettled = true
if pendingCallbackError存在
  → reject(pendingCallbackError)
else
  → resolve({exitCode, signal})
```

如果`stopChild()`触发测试Fake的同步`close`，必须因为pending error已先保存而得到相同结果；真实Child的异步`close`也必须保持Promise pending。

### 3.2 Late signals

pending callback error建立后：

- stdout `data`和`end`不再调用`onStdoutLine`；
- AbortSignal可以继续调用同一个`stopChild()`，但不能产生第二次kill；
- child `error`和stdin `error`不得覆盖pending callback error；依赖Node随后发出的`close`完成Promise；
- stderr仍按现有路径收集直到close；
- 第二次close或其它late event由single-settlement guard忽略。

不要增加timer或“如果close没来”的回退。

### 3.3 测试Oracle

不要仅检查最终`interrupted`。必须把时序分成两个观察点：

```text
callback throw + kill requested
→ close尚未发生
→ Promise pending / settlementCalls=0 / Attempt和Run仍running / Artifact不存在

手工emit close
→ Promise完成CallbackError路径
→ WorkerAdapter返回
→ Git/Artifact收集
→ 一次interrupted settlement
```

默认`FakeClaudeProcess.kill()`同步close不能作为该Finding的Oracle。使用test-only manual-close fake，其`kill()`只记录信号，由测试显式触发`close`。

---

## 4. 文件范围

### 4.1 应当修改

```text
src/runner/claude-process.ts

tests/claude-process.test.ts
tests/claude-runner.test.ts

docs/documents/INCREMENT_14_FIX_TASK_2.md
docs/documents/README.md
docs/documents/MVP_PLAN.md
docs/documents/DEVELOPMENT_LOG.md
```

### 4.2 仅真实需要时最小修改

```text
src/runner/worker-adapter.ts
src/runner/executor.ts
tests/runner-fixtures/claude-process-fake.ts
PROJECT_RULES.md
```

### 4.3 不得修改

```text
src/room/**
src/protocol/**
src/git/**
src/mcp/**
src/scheduler/**
src/cli/**

tests/execution-core.test.ts
tests/execution-core-settle-worker.ts
tests/git-action-execute-worker.ts

docs/documents/INCREMENT_14_TASK_CONTRACT.md
docs/documents/INCREMENT_14_FIX_TASK_1.md
docs/documents/ARCHITECTURE.md
docs/documents/ROOM_PROTOCOL.md
docs/documents/OPERATIONS.md

AGENTS.md
CLAUDE.md
package.json
package-lock.json
tsconfig.json
plugins/**
.agent-room/**
.codex/**
```

若类型编译证明必须对“不应修改”测试做零语义适配，停止并返回`needs_decision`，不得自行扩展。

---

## 5. Git交付契约

### 5.1 冻结父提交

```text
f95c63c02817115d1ded566e3032a4c0d32cd085
```

### 5.2 新分支

```text
codex/increment-14-fix-2-process-close-f95c63c
```

### 5.3 单一提交信息

```text
fix(runner): wait for process close before settlement
```

### 5.4 禁止操作

```text
直接push main
修改原Candidate分支
修改Fix 1分支
merge
rebase
amend
force-push
reset
clean
stash
checkout覆盖其它工作区
创建Pull Request
tag
release
追加第二个提交
```

---

## 6. Coding Result返回格式

Codex完成后必须按下列结构返回。不得只写“已完成”或只给测试总数。

```markdown
## Status
`completed | blocked | needs_decision`

## Baseline and delivery
- repository: Reminnd/coding-room
- parent_fix_branch: codex/increment-14-fix-1-progress-settlement-41496df
- parent_fix_sha: f95c63c02817115d1ded566e3032a4c0d32cd085
- branch: codex/increment-14-fix-2-process-close-f95c63c
- commit_sha:
- parent_sha:
- remote_branch_sha:
- commit_message: fix(runner): wait for process close before settlement
- end_git_status:
- origin_main_sha:
- original_candidate_remote_sha:
- fix_1_remote_sha:
- pushed_to_main: false
- original_candidate_modified: false
- fix_1_branch_modified: false
- force_push_performed: false
- additional_commits: 0

## Summary
说明实际close-gated生命周期修改，不使用“全部优化”等模糊表述。

## Confirmed finding fixed
### inc14-fr2-process-close-before-settlement
- pending callback error ownership:
- stop request behavior:
- close completion behavior:
- late event behavior:
- WorkerAdapter/Executor ordering:
- terminal settlement behavior:
- direct regression:

## Changed files
- `path`：修改目的，是否改变公开行为。

## Process lifecycle evidence
- callback observed before close:
- kill calls before close:
- process Promise state before close:
- settlement calls before close:
- Run/Attempt state before close:
- artifact state before close:
- result after close:
- partial stdout/stderr evidence:

## Retained Fix 1 evidence
- same-payload independent-connection settlement:
- different-payload independent-connection settlement:
- source files unchanged:

## Verification
- command:
  exit_code:
  status: passed | failed | not_run
  result:

## Tests changed
- `path`：新增或调整的独立Oracle及其真实时序。

## Documentation changed
- `path`：维护内容及权威范围。
- documentation_impact: updated | no_change | blocked

## Deviations
`none`或逐项说明Contract条目、证据和影响。

## Unresolved
`none`或列出未闭合事项。

## Questions
`none`或列出必须由用户决定的问题。

## GitHub review target
- original_base: ee3cd96315ed0c14220692c3bc92d6ecaff7430a
- original_candidate: 41496df6b37d40d871460f1164dacaade37e1c3d
- fix_1_base: f95c63c02817115d1ded566e3032a4c0d32cd085
- head: codex/increment-14-fix-2-process-close-f95c63c
- commit: <commit_sha>
```

---

## 7. 后续Review范围

根会话收到Coding Result后，将通过GitHub同时审查：

```text
f95c63c02817115d1ded566e3032a4c0d32cd085...<Fix 2 commit>
```

用于确认本轮最小Fix，以及：

```text
ee3cd96315ed0c14220692c3bc92d6ecaff7430a...<Fix 2 commit>
```

用于确认Increment 14完整累计Diff。

重点检查：

1. Promise是否真的在`close`前保持pending；
2. 是否把`kill()`错误当成close Oracle；
3. pending callback error是否会被late error/stdin error/abort覆盖；
4. close前是否仍可能写Artifact或settle；
5. close后是否只结算一次并保留partial evidence；
6. 是否添加了不必要的timeout、fallback、retry或资源框架；
7. Fix 1并发settlement测试是否保持不变并继续通过；
8. 文档是否保持Candidate / `REVIEW_REQUIRED`，未冒充已接受；
9. Git提交、parent、远端分支和冻结分支是否与Coding Result一致。

## 8. Candidate execution record

- 实现仅修改`src/runner/claude-process.ts`：`promiseSettled`、`stopRequested`与`pendingCallbackError`分别拥有Promise完成、stop请求与callback failure事实；pending error只由同一owned child的`close`完成。
- `tests/claude-process.test.ts`与`tests/claude-runner.test.ts`新增local manual-close Oracle，默认Fake和Fix 1的independent-connection settlement Oracle未改。
- 已完成`npm run typecheck`、Contract全部focused suites与`npm test`；Candidate保持`REVIEW_REQUIRED`，本记录不构成Review结论、用户接受、`main`合入或runtime部署声明。
