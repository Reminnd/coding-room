# `Reminnd/coding-room` Increment 14 Codex Coding Contract

> **任务状态：Accepted / 可直接派发 / Git交付已授权**
> **confirmed_by_user：** `true`
> **用户确认日期：** 2026-09-03
> **实际 start_head：** `ee3cd96315ed0c14220692c3bc92d6ecaff7430a`
> **目标仓库：** `Reminnd/coding-room`
> **执行者：** 独立Codex Coding任务
> **交付方式：** 从最新`origin/main`创建独立分支，完成代码、测试和文档后生成一个提交并推送到GitHub
> **Review者：** 当前对话中的ChatGPT根会话，通过GitHub分支与提交读取完整Diff
> **编写日期：** 2026-09-03
> **已核对的`main` HEAD：** `ee3cd96315ed0c14220692c3bc92d6ecaff7430a`
> **说明：** SHA只用于Git派发与Review溯源，不得写入运行时校验、哈希索引或版本阻断逻辑。Codex执行时以实际`origin/main`为准并记录精确起点。

---

## 0. 可直接复制给Codex的派发指令

```text
在 Reminnd/coding-room 仓库执行本文定义的完整Increment 14 Implementation Task，并完成代码、测试、项目文档、Git提交和远端分支推送。

本次由用户明确授权独立Codex Coding任务：
- 修改本文scope内的生产代码、测试和项目文档；
- 从最新origin/main创建一个全新的任务分支；
- 在全部验证通过后创建一个Conventional Commit；
- 把该分支推送到Reminnd/coding-room的origin远端，供根会话通过GitHub Review。

根会话不参与Coding，只通过GitHub读取实际提交和完整Diff进行Review。严格遵守本文的goal、requirements、scope、non_goals、constraints、acceptance_criteria、verification、documentation_updates与question_policy。

开始前：
1. 执行git fetch origin main。
2. 记录git rev-parse origin/main，作为start_head。
3. 记录git status --short。
4. 只有工作区干净时才继续；若存在任何未提交修改，不得覆盖、stash、clean或混入本任务，直接返回blocked。
5. 从start_head创建新分支，命名为codex/increment-14-validation-boundary-<start_head前7位>。不得复用或覆盖已有远端分支；若同名分支已经存在，返回blocked，不得force-push。

实现过程中：
- 完成本文全部代码、测试和文档维护；
- 将本文完整Task Contract保存为docs/documents/INCREMENT_14_TASK_CONTRACT.md，并按仓库文档规则维护相关索引、计划、开发日志和可复用编码指南；
- 不修改普通用户界面文案；coding-room是开发者工作台，技术状态、错误码和结构化JSON保持不变；
- 不提交中间失败状态，不把无关修改带入分支。

全部验证通过后：
1. 运行git diff --check。
2. 核对git status --short只包含本文scope内文件。
3. 使用单一提交保存本任务全部代码、测试和文档，提交信息固定为：
   refactor(room): simplify validation ownership
4. 执行git push -u origin <任务分支>。
5. 核对远端分支HEAD与本地commit SHA一致。
6. 推送完成后不得amend、force-push、追加提交、合并main或删除分支，等待根会话Review。

禁止直接push到main，禁止merge、rebase、reset、clean、stash、force-push、修改Git历史、创建tag或release。

完成后按本文“Coding Result返回格式”回复。必须返回start_head、branch、commit_sha、parent_sha、remote_branch_sha、完整changed files、文档维护结果和全部验证结果。无需生成patch文件；GitHub上的远端分支和提交是唯一Review输入。
```

---

## 1. Task Contract

```yaml
task_id: increment-014-validation-ownership-and-invariant-simplification
type: implementation
parent_task_id: null
based_on_review_id: null

background: >
  当前代码已具备Room、Run、RunAttempt、Plan、TaskGraph、MCP、Claude Runner、SQLite事务、
  Git Observer与Git Controller闭环，但多个内部层仍重复解析同一对象、重复确认同一关系，
  并为受支持public lifecycle无法产生的状态保留错误分支、循环重读、条件更新和测试构造。
  用户已确认新的实现原则：只在用户输入、MCP/CLI、配置文件、SQLite打开、Git、Claude等
  系统边界验证；进入可信内部代码后依赖TypeScript类型、事务、数据库约束和既有状态所有权；
  不为不可能场景增加错误处理、回退、自愈或兼容逻辑。coding-room是开发者工作台，
  本任务不进行普通用户产品文案改造，现有技术术语、状态枚举、错误码和结构化JSON继续保留。

goal: >
  在不改变公开协议、持久化Schema、状态机、权限模型、CLI/MCP输出、Git规则和外部失败语义的
  前提下，统一输入校验所有权，删除已由内部生命周期保证的不可能分支，简化BEGIN IMMEDIATE
  事务内的Attempt settlement与GitAction reservation，并移除Runner进度回调中的宽泛吞错，
  使生产代码更短、更直接、职责更清楚，同时保持真实外部边界、业务规则、幂等与并发行为正确。
```

---

## 2. 已确认的实现原则

### 2.1 只在真实系统边界验证

以下位置继续承担运行时验证：

| 边界 | 必须保留的验证 |
|---|---|
| CLI | 参数是否存在、类型、端口、路径、URL、子命令和选项组合 |
| MCP | Zod `inputSchema`、participant route、调用者身份入口、用户确认字段 |
| Setup与配置文件 | JSON/TOML结构、绝对路径、项目绑定、协议版本、端口和配置一致性 |
| SQLite打开 | 文件可打开、协议版本匹配、真实数据库错误和事务失败 |
| Git | 仓库、worktree、branch、ref、实时变更、命令退出和外部Git状态 |
| Claude | 进程启动、JSONL、MCP初始化、退出码、最终结果、Artifact与Git evidence |
| 业务命令 | authority、状态转换、用户确认、当前Revision、幂等ID、真实并发、write scope |

### 2.2 内部代码信任的保证

进入已经完成边界解析的内部调用链后，代码应信任：

- TypeScript具体类型；
- 同一事务内刚创建或刚读取的实体；
- `BEGIN IMMEDIATE`提供的写事务串行化；
- SQLite主键、唯一索引与外键之外已经明确建立的数据库约束；
- 由同一个原子业务命令共同创建的Task、Run、Attempt、Dispatch和GitAction关系；
- 当前代码没有删除API，因此已经创建且被后续生命周期引用的内部实体不会凭空消失；
- MCP SDK已经按注册的`inputSchema`解析成功后传入的`args`。

内部不变量若被程序错误或人工直接改库破坏，不增加业务回退、自愈、第二套校验框架或兼容路径。让错误在开发和测试阶段直接暴露。

### 2.3 开发者工作台输出保持不变

本任务保留：

- `DISCUSSION`、`ready`、`review_required`等状态枚举；
- `actor_not_allowed`、`scope_conflict`等协议错误码；
- `Room`、`Run`、`RunAttempt`、`Revision`、`Approval`、`GitAction`等领域术语；
- CLI确定性JSON、MCP structured content与现有字段名；
- 当前MCP工具名和开发者技术说明。

不得新增普通用户状态映射、消费级文案层、第二套展示DTO或默认/`--json`双模式。

---

## 3. Requirements

### 3.1 将对象形状校验移动到最外层边界

1. 将`RoomService`中由MCP、CLI、Runner、Scheduler或Git Controller调用的命令参数，从`unknown`改为现有具体TypeScript类型或最小专用Command interface。
2. 删除`RoomService`中的通用`parse(...)`辅助函数，以及只用于重复解析已验证内部对象的`zod`依赖。
3. 不复制现有Schema，不新增通用Command Bus、Validator registry、DTO mapper、Result/Either框架或依赖注入层。
4. MCP继续使用现有Zod `inputSchema`作为外部输入边界；callback取得类型正确的`args`后直接调用typed service。
5. `GitController.preview`改为接收`PreviewGitActionCommand`，不再接收`unknown`并自行解析。
6. `src/cli/git.ts`在CLI边界完成Git preview command的最终Schema解析，再调用typed `GitController.preview`。保留现有CLI错误输出和退出码。
7. 其它CLI继续在各自参数解析层验证；不要为了形式统一新增共享CLI framework。
8. 如果某个service method实际上仍被未经Schema解析的外部入口直接调用，应将验证放到该真实入口，而不是保留在service里。

### 3.2 删除可信内部对象的二次Schema解析

在内部对象只由已验证实体和常量构造时：

- 将`gitActionSchema.parse({...})`改为显式typed object，优先使用类型标注或`satisfies GitAction`；
- 将`persistedTaskSchema.safeParse({...})`改为显式typed object，优先使用`satisfies PersistedTask`；
- 对同类内部构造执行最窄检查，删除仅用于确认TypeScript已经表达的字段形状的运行时parse；
- 不删除MCP输入、CLI输入、Claude Coding Result、外部配置或协议版本的Schema验证；
- 不为替代Zod而新增手写字段检查。

### 3.3 删除已由当前public lifecycle保证的不可能分支

必须检查并处理以下已定位位置：

1. `RoomRepository.createRoom`：成功INSERT后不再重新查询并处理“刚创建的Room不存在”。直接返回刚构造的`RoomRecord`。
2. `RoomService.createRoleAssignment`：幂等插入后不再处理“刚确认存在的Assignment随后缺失”。以最小方式返回输入或已经读取的existing entity。
3. `LocalExecutor.execute`：
   - 已成功读取合法Run后，不再为“Run没有任何Task”建立业务错误分支；
   - 已存在prior attempt时，不再为“Run仍没有冻结worktree”建立恢复错误；
   - Run冻结的worker不再为“ParticipantProfile凭空消失”建立业务错误；
   - claim成功后，poll和settlement前不再为“Attempt凭空消失”建立业务错误或静默清理；
   - 使用现有生命周期保证和精确类型表达这些不变量，不要建立新的`assertExists`通用helper。
4. `RoomService.applySuccessfulGitAction`：已合法创建并执行的GitAction不再为“对应Dispatch凭空缺失”建立业务错误分支。
5. 在本任务已经修改的文件中，可删除其它同类分支，但必须在Coding Result中逐项说明：
   - 被删除分支；
   - 为什么受支持public lifecycle无法到达；
   - 哪个类型、事务、数据库约束或原子创建命令拥有该不变量。
6. 不得以“清理”为名全仓搜索并删除所有`entity_not_found`或`validation_failed`。用户提供ID、跨实体引用、外部配置及真实业务状态仍可能无效，相关检查必须保留。
7. 如果实际代码证明上述某一状态可以通过当前受支持public path到达，保留该检查，并在Coding Result的`deviations`中提供最小可复现路径；不得为了满足清单删除真实校验。

### 3.4 简化`RunAttempt`终结事务

`RoomService.tx`使用`BEGIN IMMEDIATE`。在同一个`settleRunAttempt`事务中，第二个writer只能在前一个事务完成后读取新状态，因此不得继续模拟事务内部存在第三个writer反复改写同一Attempt。

将`settleRunAttempt`改为单次事务流程：

```text
BEGIN IMMEDIATE
→ 读取Attempt一次
→ 校验frozen executor authority
→ 已terminal：比较canonical terminal payload，same payload幂等返回，different payload返回id_conflict
→ 未terminal：按当前status确定target；cancel_requested仍强制canceled
→ 校验Attempt transition
→ 生成canonical payload
→ 直接更新Attempt
→ 直接更新Run
→ 追加唯一terminal Event
→ succeeded时执行既有scope projection
→ COMMIT
```

具体要求：

- 删除最多三轮的`for`循环；
- 删除本路径依赖的`updateAttemptIfStatus`条件更新；若仓库中无其它真实用途，删除该Repository方法；
- 保持terminal same-payload retry、different-payload conflict、cancel intent优先、canonical evidence和唯一terminal Event语义；
- 保留`BEGIN IMMEDIATE`、`busy_timeout`、active-attempt唯一索引和真实跨连接并发测试；
- 不新增锁、内存mutex、retry loop、退避、队列或事务外补偿。

### 3.5 简化`GitAction`执行预留事务

在`reserveGitAction`的`BEGIN IMMEDIATE`事务内：

```text
读取Action
→ 校验frozen Git Controller
→ 校验Action状态、Approval、当前Event与重新观察的Git facts
→ 直接更新为executing
→ 追加git_action_executing Event
→ COMMIT
```

具体要求：

- 删除`updateGitActionIfStatus`条件更新路径；若无其它真实用途，删除Repository方法；
- 并发execute仍必须只有一个调用进入`executing`并启动Git process；等待者在获得写事务后读取新状态并返回既有stable domain error；
- 保留所有pre-process Git reobservation、Approval、cursor和外部Git facts校验；
- 不改变`failed|succeeded|outcome_unknown`终态、reconcile语义或Git命令allowlist；
- 不增加自动重试、reset、cleanup或结果推断。

### 3.6 移除Runner进度回调的宽泛吞错

当前progress callback使用无条件`catch {}`，可能吞掉SQLite、编程错误或其它非预期异常。改为一个最小、明确的内部竞争语义：

推荐实现：

- 将`appendAttemptProgress`改为在单一事务中读取Attempt；
- Attempt仍为`running`时追加Event并返回`true`；
- Attempt已因Question或cancel进入其它状态时零写入并返回`false`；
- claim后Attempt存在属于内部不变量，不为missing增加fallback；
- Executor callback直接调用该方法，不再使用宽泛`try/catch`；
- 不新增重试、缓冲队列、日志降级、错误分类registry或后台投递。

如果现有同步callback契约使上述返回值方案不适用，可仅捕获并忽略明确代表`running → decision_requested/cancel_requested`竞争的既有`ProtocolError`，其它错误必须继续抛出。Coding Result必须说明最终选择。

### 3.7 保留真实业务校验

以下规则不是“过度防御”，不得删除：

- actor身份、enabled状态、RoleAssignment和frozen authority；
- Room、Run和RunAttempt状态转换；
- Plan latest Revision、Approval、user confirmation与GitAction decision；
- same-ID同内容幂等、same-ID不同内容冲突；
- 跨Room、跨Run、跨Task和stale Review/Question引用；
- `concurrency_limit`、worktree ownership和unordered write-scope冲突；
- Git repository、canonical worktree、branch/ref、live evidence和command failure；
- Claude process、MCP init、stream、Coding Result、Artifact和completion evidence；
- SQLite协议版本和真实数据库打开/事务错误；
- MCP participant route framing与URL边界；
- setup/runtime/config文件边界。

### 3.8 测试按新的所有权调整

1. 保留并通过真实public-path测试：MCP、CLI、Runner、Git Controller、状态转换、权限、幂等和并发。
2. RoomService测试不再传入故意缺字段、错误类型或其它只应被MCP/CLI Schema拒绝的原始对象。
3. 若某项外部输入形状尚无边界测试，将测试移动或补到实际MCP/CLI入口；不得在service保留重复parse只为旧测试通过。
4. 删除只用于构造受支持public lifecycle无法产生的内部关系损坏的test-owned SQLite mutation，以及只服务该分支的production guard。
5. 不删除以下真实边界测试：
   - missing/unopenable/wrong-version/corrupt SQLite文件的startup或read行为；
   - Git repository/index/process真实失败；
   - Claude进程、stream和artifact失败；
   - 独立SQLite connection的真实并发竞争。
6. 对externally reachable且契约明确要求零副作用的失败路径，继续验证必要状态不变；不再对每个内部不可能分支机械复制完整snapshot `deepEqual`。
7. 并发验收必须继续证明：
   - 同Run双claim只有一个active attempt；
   - 同Attempt终结竞争只有一个terminal mutation/Event；
   - 同GitAction并发execute只有一个reservation和一个Git process；
   - loser读取winner提交后的durable状态并稳定失败或幂等返回。
8. 测试期望使用public contract或测试侧literal，不从生产helper导入Oracle。

### 3.9 注释和文档

- 只在本次实际修改的代码块中，把`Review finding incX...`、历史Fix过程和候选阶段叙述改为当前有效的不变量说明；不要全仓重写注释。
- 代码注释可以保留精确技术语言，但应解释当前行为和所有权，不把历史需求讨论当作运行时代码说明。
- 将本文完整、未经缩减的Accepted Contract保存为`docs/documents/INCREMENT_14_TASK_CONTRACT.md`，标明`confirmed_by_user=true`、用户确认日期、实际start head和Git交付边界。
- 更新`docs/documents/agent-guides/CLAUDE_CODING_AND_FIX.md`，写入可复用的当前规则：在CLI、MCP、配置、数据库打开、Git、外部进程等系统边界校验；进入typed内部调用链后信任框架、事务、数据库约束和原子生命周期保证；不得为public lifecycle不可达状态增加业务错误、fallback、自愈或测试专用production guard。
- 更新`docs/documents/DEVELOPMENT_LOG.md`，记录candidate实现、实际修改文件、删除的重复校验和不可能分支、保留的真实边界、事务简化、progress竞争语义、测试结果、任务分支和Git提交事实。
- 按仓库Documentation Map维护`docs/documents/README.md`与`docs/documents/MVP_PLAN.md`：登记Increment 14 Contract和candidate状态，不复制完整实现细节。
- 仅当当前实现使`PROJECT_RULES.md`中的Documentation Map或当前阶段描述失真时，最小更新对应条目；不得重写该文件或修改角色权限。
- 如果公开协议、状态、错误码、Schema和运维方式均未变化，`ARCHITECTURE.md`、`ROOM_PROTOCOL.md`和`OPERATIONS.md`不得为了形式修改。

### 3.10 GitHub交付

1. 任务分支必须从执行时最新`origin/main`精确创建，分支名为`codex/increment-14-validation-boundary-<start_head前7位>`。
2. 只允许创建并推送这一条新分支；不得直接修改或推送`main`。
3. 全部代码、测试和文档必须位于一个提交中，提交信息固定为`refactor(room): simplify validation ownership`。
4. 提交的parent必须等于记录的`start_head`；任务执行期间若`main`继续前进，不得rebase或合并最新main，Review按原start head比较。
5. 推送后远端分支HEAD必须等于本地`commit_sha`，工作区必须干净。
6. 不创建第二个修复提交，不amend、不force-push。Review发现问题后，由用户确认新的Fix Task，再在新授权下处理。
7. 无需生成本地patch。GitHub compare `start_head...branch`和该提交的changed files是后续Review的权威输入。

---

## 4. Scope

### 4.1 预计允许修改

```text
src/room/room-service.ts
src/room/repository.ts
src/runner/executor.ts
src/git/git-controller.ts
src/cli/git.ts
src/mcp/tools.ts                 # 仅typed调用适配；不得改工具名、说明或输出

tests/room-service.test.ts
tests/execution-core.test.ts
tests/claude-runner.test.ts
tests/git-controller.test.ts
tests/git-controller-cli.test.ts
tests/room-mcp.test.ts
tests/runner-cli.test.ts         # 存在且受变更影响时
tests/e2e-workflow.test.ts       # 仅真实回归需要时

docs/documents/INCREMENT_14_TASK_CONTRACT.md
docs/documents/README.md
docs/documents/MVP_PLAN.md
docs/documents/DEVELOPMENT_LOG.md
docs/documents/agent-guides/CLAUDE_CODING_AND_FIX.md
```

### 4.2 条件允许修改

仅当类型导出或已有调用关系确实需要时，可最小修改：

```text
src/protocol/schema.ts
src/protocol/errors.ts           # 原则上不应修改；不得新增错误码
src/runner/claude-runner.ts
PROJECT_RULES.md                 # 仅Documentation Map或当前阶段描述因本任务而失真时最小修改
```

### 4.3 超出Scope的文件

未经本文明确允许，不修改：

```text
AGENTS.md
CLAUDE.md
package.json
package-lock.json
tsconfig.json
plugins/**
.agent-room/**
.codex/**
docs/documents/ARCHITECTURE.md
docs/documents/ROOM_PROTOCOL.md
docs/documents/OPERATIONS.md
```

若测试名称与实际仓库略有不同，以当前同职责文件为准，但不得借机扩展业务范围。

---

## 5. Non-goals

本次明确不做：

- 面向普通用户的界面、状态文案或MCP工具说明改造；
- 新增Web UI、TUI、Dashboard、Cockpit或VS Code Extension；
- `state-snapshot.ts`查询优化、N+1消除、事件游标SQL优化或新增索引；
- 拆分`RoomService`为多个command service；
- Setup脚本、Plugin Skill、v0.2/v0.3/v0.4历史兼容和迁移路径清理；
- 删除WorkerAdapter抽象或新增第二Provider；
- 修改协议版本、数据库Schema、table、column、index、entity、status、Event type或error code；
- 修改TaskGraph、Scheduler、GitAction、integration_only、Review或Question业务语义；
- 修改CLI/MCP成功输出、字段顺序、错误输出或退出码；
- 新增缓存、后台任务、daemon、自动恢复、自动retry、fallback或兼容层；
- 新增hash、checksum、fingerprint、baseline validator或文件索引；
- 全仓格式化、重命名、目录重组或无关清理；
- 直接push到`main`、merge、rebase、reset、clean、stash、force-push、amend、删除分支、创建tag/release或修改既有Git历史；本文明确授权的新任务分支创建、单一commit和该分支首次push除外。

后续优化必须等本任务完成并通过根会话Review后另行规划。

---

## 6. Architecture decisions

1. **Validation ownership：** 原始外部数据只在最外层入口验证一次；内部service和repository消费具体类型。
2. **Internal invariant trust：** 原子创建、无删除API、事务和数据库约束建立的关系，不再转换为业务错误分支。
3. **Concurrency owner：** `BEGIN IMMEDIATE`负责writer串行化，唯一索引负责最终数据约束；service读取提交后的最新状态，不实现事务内CAS重试循环。
4. **Public compatibility：** 本次是内部实现重构，公开协议、输出、错误码和持久化格式保持不变。
5. **No abstraction expansion：** 优先删除代码；只有现有类型不足时才增加最小Command interface，不构建通用基础设施。
6. **Developer workbench：** 技术枚举和结构化数据是产品接口，不做消费级语言包装。

---

## 7. Constraints

- 保持Node、TypeScript、Zod、MCP SDK与SQLite现有版本，不新增依赖。
- 不使用`any`规避类型问题；不使用大面积类型断言掩盖真实边界。
- 对内部确定存在的实体，可以使用精确类型、局部非空断言或由上一步返回值直接传递；不得新增通用`assertExists`、`unwrap`或fallback helper。
- 不把删除的运行时Schema检查替换成手写重复检查。
- 不改变transaction边界；Git/Claude process仍不得运行在SQLite transaction内。
- 不删除数据库唯一索引、`BEGIN IMMEDIATE`和`busy_timeout`。
- 不删除真实外部错误处理。
- production代码不应因本次重构新增比删除更多的包装层；若生产代码净增长，Coding Result必须解释不可避免的原因。
- 保持代码格式与仓库现状一致，不运行全仓formatter。
- 遇到Scope外既有问题，只记录，不修复。
- Git提交前必须通过全部verification；失败结果不得提交或推送。
- 提交后不得为了让结果更好看而amend、追加提交或force-push。

---

## 8. Acceptance criteria

全部满足才可返回`completed`：

1. `RoomService`本次涉及的命令不再接收`unknown`后自行Zod解析。
2. `RoomService`不再拥有通用`parse`helper；若`z` import仅服务该helper，应完全移除。
3. MCP和CLI仍在外部边界拒绝无效输入，相关公开错误行为未回退。
4. 内部构造的`PersistedTask`与`GitAction`不再通过Zod二次parse确认自身形状。
5. 已列出的create-after-insert、Assignment missing、Run-without-Task、Attempt disappearing、worker missing、GitAction-without-Dispatch等不可能分支已删除，或对实际可达项提供证据并保留。
6. `settleRunAttempt`不存在三轮重读/conditional update循环；保持原有terminal、幂等、cancel和Event语义。
7. `reserveGitAction`不再使用conditional status update；并发execute仍只有一个Git process。
8. 无未使用的`updateAttemptIfStatus`或`updateGitActionIfStatus`残留；仍有用途时必须在Coding Result列出调用路径。
9. Runner progress callback不再使用无条件`catch {}`吞掉所有异常。
10. public protocol version、Schema、数据库结构、状态、Event、错误码、CLI/MCP输出与工具说明不变。
11. 独立连接并发测试、Runner、MCP、CLI与Git Controller回归全部通过。
12. 没有新增通用framework、fallback、自愈、兼容路径、hash或依赖。
13. `git diff --check`通过。
14. Accepted Contract、文档索引、MVP计划、开发日志和可复用编码指南已按实际实现维护；公开协议未变化时没有机械修改架构、协议或运维文档。
15. 任务分支从记录的`start_head`创建，唯一提交的parent等于`start_head`。
16. 提交信息精确为`refactor(room): simplify validation ownership`，提交包含且只包含本任务允许的代码、测试和文档。
17. 分支已推送到`origin`，`remote_branch_sha`等于`commit_sha`，`main`未被修改或推送。
18. 推送后本地工作区干净，未amend、未force-push、未创建第二个提交。

---

## 9. Verification

Codex先运行focused验证，再运行全量验证。命令不存在或文件名与当前仓库不同，可按实际同职责测试调整，但必须在结果中记录实际命令。

```bash
npm run typecheck

node --test \
  tests/room-service.test.ts \
  tests/execution-core.test.ts \
  tests/claude-runner.test.ts \
  tests/git-controller.test.ts \
  tests/git-controller-cli.test.ts \
  tests/room-mcp.test.ts

npm test

git diff --check
git status --short
git diff --stat
```

全部验证通过后才允许commit与push。交付后继续核对：

```bash
git status --short
git rev-parse HEAD
git rev-parse HEAD^
git log -1 --pretty=%s
git ls-remote --heads origin <任务分支>
git diff --check <start_head>...HEAD
git diff --stat <start_head>...HEAD
```

额外静态核对：

```bash
# 仅作为审查辅助；不得通过机械替换满足结果
rg "input: unknown|private parse|updateAttemptIfStatus|updateGitActionIfStatus|catch \{\}" src/room src/runner src/git src/mcp src/cli
```

对每个残留匹配，Coding Result说明它为何仍属于真实边界或不同语义。

---

## 10. Documentation updates

```yaml
documentation_updates:
  - path: docs/documents/INCREMENT_14_TASK_CONTRACT.md
    expected_change: 保存本次用户已确认的完整Task Contract、Git交付授权和Review边界。
  - path: docs/documents/agent-guides/CLAUDE_CODING_AND_FIX.md
    expected_change: 增加边界校验、内部不变量信任和禁止不可能场景fallback的可复用编码规则。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录Increment 14 candidate实现、修改文件、事务简化、保留边界、测试及Git分支/提交事实。
  - path: docs/documents/README.md
    expected_change: 将Increment 14 Contract加入文档索引并标明candidate/Review状态。
  - path: docs/documents/MVP_PLAN.md
    expected_change: 登记Increment 14目标、依赖、非目标和当前Review阶段，不复制Contract全文。
  - path: PROJECT_RULES.md
    expected_change: 仅在Documentation Map或当前阶段描述会失真时做最小同步；否则不修改。
```

如果实现发现公开协议必须改变，停止并返回`blocked`，不得自行修改`ROOM_PROTOCOL.md`、协议版本或数据库Schema。

---

## 11. Question policy

- 不为普通实现选择、命名或局部重构提问，按最小改动完成。
- 不因参考HEAD不同自动提问或停止；先检查当前代码是否仍满足任务前提。
- 如果工作区存在与本任务重叠的用户未提交修改，停止受影响文件并返回`blocked`，不得覆盖、stash或清理。
- 如果某个标记为“不可能”的状态可由当前受支持public path真实产生，保留对应校验，提供复现步骤并在`deviations`中报告。
- 如果完成任务必须改变公开Schema、数据库结构、状态机、错误码、CLI/MCP输出或Scope外文件，停止并返回`blocked`。
- 不扩大到Snapshot性能、Service拆分、Setup/Plugin清理或UI工作。
- 不制造未来Provider、损坏内部数据库、自愈或兼容场景。
- 若同名任务分支已存在、远端不可推送或工作区不干净，返回`blocked`；不得force-push、复用旧分支、切换到main直接提交或清理用户工作。
- 若测试失败，保留本地未提交修改并返回`blocked`；不得提交或推送失败结果。

---

## 12. Coding Result返回格式

Codex完成并推送后必须返回以下结构，供根会话直接从GitHub Review：

```markdown
# Increment 14 Coding Result

## Status
completed | blocked | needs_decision

## Baseline and delivery
- repository: Reminnd/coding-room
- start_head:
- start_git_status:
- branch:
- commit_sha:
- parent_sha:
- commit_message: refactor(room): simplify validation ownership
- remote_branch_sha:
- end_git_status:
- pushed_to_main: false
- force_push_performed: false
- additional_commits: 0

## Summary
说明实际完成的内部简化，不使用“已全部优化”等模糊表述。

## Changed files
- `path`：修改目的与公开行为是否变化

## Removed duplicate validation and impossible branches
对每一项列出：
- location:
- removed behavior:
- invariant owner: TypeScript | MCP/CLI boundary | transaction | SQLite constraint | atomic lifecycle
- why unreachable through supported public path:

## Retained boundary validation
列出仍保留的CLI、MCP、SQLite、Git、Claude和业务规则校验。

## Transaction changes
- settleRunAttempt:
- reserveGitAction:
- progress handling:
- concurrency behavior preserved by:

## Verification
- command:
  status: passed | failed | not_run
  result:

## Tests changed
- `path`：删除、移动或新增了什么证据，以及为什么属于正确边界

## Documentation changed
- `path`：维护内容及其权威范围
- documentation_impact: updated | no_change | blocked

## Deviations
- 无则写`None`
- 有则说明Contract条目、代码证据、影响和未擅自扩大的处理

## Unresolved
- 无则写`None`

## GitHub review target
- base: <start_head>
- head: <branch>
- commit: <commit_sha>
```

最终回复必须包含真实远端`branch`和`commit_sha`。无需粘贴完整Diff或生成patch；根会话将直接通过GitHub读取commit、changed files和`start_head...branch`比较结果。

---

## 13. Review重点预告

根会话收到结果后会重点检查：

1. 是否真的把验证移到边界，而不是删除所有业务校验；
2. 是否错误依赖TypeScript去保证外部运行时数据；
3. `BEGIN IMMEDIATE`下简化后的terminal/execute并发是否仍只有一个winner；
4. 是否删除了实际可达的stale、authority、scope或Git facts检查；
5. 是否用非空断言掩盖了真正的外部输入问题；
6. 是否保留CLI/MCP技术输出；
7. 是否出现Scope外重构、新抽象或测试降级；
8. GitHub远端branch、commit、parent与Coding Result是否一致；
9. `start_head...branch`完整Diff是否只包含允许的代码、测试和文档；
10. 文档是否准确记录当前实现，而不是复制历史过程或把candidate写成已接受事实。
