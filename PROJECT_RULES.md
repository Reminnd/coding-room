# Agent Room 项目共享规范

> 状态：Current  
> 生效日期：2026-08-23  
> 当前规划阶段：PLAN_READY / Increment 15 Revision 2已由用户确认；Increment 14已`accepted_and_integrated`，final commit=`d5827a052190d63fb2fbbd9fbd970ba9db92ed64`；Stage 1–3历史Accepted成果继续有效

本文件是 Codex 与 Claude Code 共同遵循的项目规范入口。Codex 的专属职责见 [AGENTS.md](./AGENTS.md)，Claude Code 的专属职责见 [CLAUDE.md](./CLAUDE.md)。项目目标、架构、协议、计划和当前事实以本文件及 Documentation Map 中标记为 `Current` 或 `Accepted` 的文档为准。

## 1. 项目目标

构建一个本地、单机、自用的 Agent Room，使以下工作流可持久化、可恢复、可审查：

```text
用户与 Codex 讨论方案
→ 用户确认
→ Codex 提交结构化 Task Contract
→ Claude Code CLI 修改共享 Git worktree 并验证
→ Codex 审查实际 Diff
→ 用户与 Codex 讨论 Review 和解决方案
→ Codex 提交 Fix Task
→ Claude Code CLI 修复
→ 循环直至用户接受
```

项目不以“两个 Agent 自由聊天”为目标。Room 的核心职责是保存协作状态、执行门禁以及明确下一位 actor，而不是复制 Codex、Claude Code、Git 或 VS Code 已有能力。

## 2. 范围

### 2.1 MVP 范围

- 一个本地 Room 对应一个项目工作目录。
- Codex App 通过 Room MCP 显式读取状态、提交 Task、Review、答案和接受决定。
- Claude Runner 以非交互方式启动 Claude Code CLI。
- Claude Cong de 在用户当前 Git worktree 中读取、编辑、测试和生成 CodiResult。
- Git 是代码状态唯一权威来源；VS Code 负责人工 Diff 查看。
- SQLite 是协作实体与状态机唯一权威来源。
- 支持 Implementation → Review → Fix → Accepted 完整循环。
- 支持 Claude 提问、Run 失败和显式恢复。
- 提供最小本地 CLI，例如查看 Room 状态。

### 2.2 非目标

- 不开发独立 Web 前端、浏览器 IDE 或自建 Diff Viewer。
- 不开发 VS Code Extension；它属于 MVP 后的可选阶段。
- 不依赖自动唤醒或向用户当前打开的 Codex Desktop task 注入消息。
- 不引入 Redis、Kafka、PostgreSQL、Docker、微服务或向量数据库。
- 不支持多用户、远程部署、对抗性 operator 或并行修改同一 worktree。
- 不在 MCP 中重复实现通用文件读取、文件写入、Shell、Patch 或 Git Diff 工具。
- 不以未来接入任意 Agent 为由增加插件化 actor 框架。

## 3. 权威来源与指令优先级

发生冲突时按以下顺序处理：

1. 用户当前明确要求。
2. Codex 执行时的 [AGENTS.md](./AGENTS.md)，或 Claude Code 执行时的 [CLAUDE.md](./CLAUDE.md)。
3. 本文件中当前有效的共享规则。
4. Documentation Map 中标记为 `Accepted` 或 `Current` 的架构、协议、计划和 ADR。
5. 源代码、测试和实际 Git 状态提供的实现事实。
6. 其他说明、示例、Issue、聊天记录和第三方资料。

发现冲突时必须停止受影响工作并指出冲突，不得静默选择。普通 Markdown 链接只是导航；执行者必须实际读取 Documentation Map 指定的文档。

## 4. 角色与权限

### 4.1 用户

- 确认需求、架构、Task Contract、Review 解决方案和最终接受。
- 决定是否初始化 Git、提交、推送或执行其他有外部影响的操作。

### 4.2 Codex

- 负责需求分析、架构、规划、共享文档和 Review。
- 作为全项目文档编写者及维护者，调用 `backend-doc-authoring` skill 编写、补全、迁移、Review 并维护 `docs/documents/` 下所有项目文档。
- 只有在用户确认后才能提交 Implementation Task 或 Fix Task。
- 可以读取代码、Git 状态和 Diff，并运行与 Review 结论直接相关的只读检查或测试。
- 不编写业务代码、测试或实现配置，不代替 Claude Code 完成 Coding Task。
- Review 后必须先与用户讨论；用户确认解决方案后才能提交 Fix Task。
- 已确认 Task 到达可执行 Coding state 后，Increment 7 Plugin workflow固定由Codex发起一次exact `room:run`，且host内部审批模式固定为UI“帮我批准”（`approvals_reviewer=auto_review`）。该权限不允许Codex或Plugin修改approval policy、绕过用户门禁、循环调度Run或代替Claude Code编写业务代码；`auto_review`拒绝时必须停止并报告。

### 4.3 Claude Code

- 只执行已批准 Task Contract 或 Fix Task。
- 负责业务代码、测试、必要配置和实现相关候选文档。
- 不改变需求、架构、范围或验收标准。
- 不自行 commit、push、切换分支或改写历史。
- 需要产品、架构或范围决定时调用 `room_ask_question` 并停止受影响工作。

### 4.4 Room 与 Runner

- Room 持久化协作状态并验证状态转换。
- Runner 启动和终止 Claude CLI、读取输出、判断进程结果、采集实际 Git 状态并推进 Run 状态。
- 模型自述不能代替 Runner 的进程结果或实际 Git 证据。

## 4.5 项目开发控制面（Current）

ChatGPT fixed Chat是正式Review Authority，GitHub Pull Request是正式Review surface。GitHub持久化项目开发Plan、Contract、commit、branch、PR、Check与Review交接；Codex通过ChatGPT Pro的Codex Cloud负责Plan初稿、Supervisor与Coding执行；Work只发送Ready for Review通知。GitHub Actions仅是机械控制面，不运行LLM。

Room SQLite继续拥有Agent Room产品运行时Run/RunAttempt等事实，但不再拥有项目开发Plan、Contract或Review authority。既有Room产品能力不删除，Stage 1–3历史Accepted成果继续有效。详细决定见[Stage 4 Architecture Review](./docs/documents/STAGE_4_GITHUB_CHAT_REVIEW_ARCHITECTURE_REVIEW.md)与[No-API-Key Amendment](./docs/documents/STAGE_4_NO_API_KEY_ARCHITECTURE_AMENDMENT.md)。

## 5. 状态所有权

| 状态 | 唯一所有者 |
|---|---|
| 源代码、staged/unstaged/untracked 变更 | Git working tree |
| Agent Room产品的Task、Review、Question、Run/RunAttempt、Event和Room状态 | SQLite |
| 项目开发Plan、Contract、commit、branch、PR、Check与Review handoff | GitHub |
| 项目开发正式Review decision | ChatGPT fixed Chat |
| Claude process 与 session 生命周期 | Claude Runner |
| 用户与 Codex 的自由讨论 | Codex App |
| 人工代码与 Diff 查看 | VS Code |
| Runner 大体积 stdout/stderr 制品 | `.agent-room/artifacts/` |

禁止用 `current/*.json`、任务 JSON 镜像、Review JSON 镜像或 `diff.patch` 建立平行权威状态。

## 6. 当前有效架构

- 本地单进程 Room Service。
- TypeScript 与 Node.js。
- Room MCP 通过 loopback 上的 Streamable HTTP 暴露给 Codex App 和 Claude Code。
- SQLite 直接保存 Room 协作实体；除非后续证据证明必要，否则不引入 ORM。
- Runner 使用 Node.js process API 启动 Claude Code CLI。
- Git 集成直接调用 Git CLI；不引入 `simple-git`。
- Claude 每个 Run 使用独立 CLI process。
- 一个新的 Implementation Task 创建新的 Claude session；其 Fix Task 链复用该 session。
- Codex App 使用显式拉取模型；用户触发 Codex 检查 Room 更新。

Increment 7 的用户已确认目标架构保持上述 Current runtime 不变，并增加以下 packaging/deployment boundary：

- 安装一次的 Agent Room Plugin 只共享通用 Codex Skill；project-specific MCP endpoint 与 runtime values 不进入 shared Plugin。
- Project A、Project B 分别拥有 Room service、loopback port、SQLite database、project path/worktree、Room 与 Claude process，因此可以跨项目并行。
- `room:run`仍是one-shot operator-authorized boundary；Increment 7 Plugin workflow的caller固定为Codex，host内部审批模式固定为operator配置的UI“帮我批准”（`approvals_reviewer=auto_review`）。Current CLI的人工可调用性不作为Plugin正常路径或fallback验收项。
- 同一 Room 内 parallel Claude Runs 继续不支持，不属于 Increment 7。

以上目标架构与完整实现范围均已获用户确认，权威入口为Accepted [Increment 7 Task Contract](./docs/documents/INCREMENT_7_TASK_CONTRACT.md)。首轮candidate未通过Review且不作为重执行或最终Review authority；严格重执行candidate已从clean exact baseline完成。Review 2四项finding已形成Accepted [Increment 7 Fix Task 1](./docs/documents/INCREMENT_7_FIX_TASK_1.md)，Fix Coding已完成。用户已确认Review 3 `review-increment-007-codex-003`的两项finding与最小方案，[Increment 7 Fix Task 2](./docs/documents/INCREMENT_7_FIX_TASK_2.md)为`Accepted`并已完成Coding。Review 4 `review-increment-007-codex-004`确认Decision resume gate已闭合，但Skill front matter的未加引号`description`包含`binding: validate`，标准YAML解析失败，而测试侧局部parser仍误报通过；Decision为`changes_requested`。用户已确认该finding与最小方案，[Increment 7 Fix Task 3](./docs/documents/INCREMENT_7_FIX_TASK_3.md)为`Accepted`并已完成Coding。Review `review-increment-007-codex-005`无finding、Decision为`approved`；用户已明确接受，当前阶段为`ACCEPTED`，已进入版本化 `main` commit `97005f54555f6485c79f15860a58fe79c3ed593d`。Fix 3不改变架构或协议版本；Plugin与多项目配置现为Current capability。

Increment 8 的用户已确认[完整Accepted Contract](./docs/documents/INCREMENT_8_TASK_CONTRACT.md)：setup自动创建或保守合并`.codex/config.toml`与`.gitignore`，自动生成`database_path`、`port`与`room_id`，operator首次提供一次`agent_room_root`；确定性helper、reload前后两段lifecycle、conflict/idempotency、scope、non-goals与verification同时获确认。Implementation Coding、[Fix Task 1](./docs/documents/INCREMENT_8_FIX_TASK_1.md)与[Fix Task 2](./docs/documents/INCREMENT_8_FIX_TASK_2.md)均已完成。Fix Review 3 `review-increment-008-codex-003`确认table-context finding已闭合，代码与direct regression无finding；focused setup 12/12、packaging 20/20、scope 1/1、typecheck及full test glob均独立通过。用户随后明确授权Plugin install/reload与actual installed-plugin consumer evaluation；candidate已从`agent-room-local`安装为`0.1.0`，installed cache与workspace Plugin逐文件一致，fresh tasks中的direct/indirect setup、missing-binding normal workflow、unsupported request与bundled helper/reference resolution全部符合Accepted门禁。Review Decision为`approved`，用户于2026-08-28明确最终接受，Fix验收经验回收已完成；完整accepted scope已由commit `8428046dded5f7542690735b3df8a5c5490e8090`进入版本化`main`，automatic setup现为Current implementation。未授权Codex启动Claude/service、runtime setup或push。

用户于2026-08-29确认[Agent Room v0.3六阶段路线](./docs/documents/AGENT_ROOM_V03_ROADMAP.md)、[ADR-0003](./docs/documents/ADR/0003-participant-role-and-v03-evolution.md)与[Increment 9完整Accepted Contract](./docs/documents/INCREMENT_9_TASK_CONTRACT.md)。Stage 1只交付Participant/Role/Assignment、generic actor/session/participant route、新v0.3 database与binding；`Plan`/`Approval`随Stage 3实际consumer交付。Implementation Review `review-increment-009-codex-001`的六项finding已由[Fix Task 1](./docs/documents/INCREMENT_9_FIX_TASK_1.md)处理；Fix Review 2的五项finding已由[Fix Task 2](./docs/documents/INCREMENT_9_FIX_TASK_2.md)处理。Fix Review 3 `review-increment-009-codex-003`确认上述五项修复与全部自动化验证通过，但公开schema允许包含URL path delimiter的`participant_id`，而Runner/CLI直接把identity拼入单一participant route segment，导致合法Participant不可达；用户确认方案后形成[Fix Task 3](./docs/documents/INCREMENT_9_FIX_TASK_3.md)。Fix Review 4 `review-increment-009-codex-004`确认`worker/2`路径已闭合，但`participant_id`仍允许`.`与`..`，`encodeURIComponent`不会编码dot，而WHATWG URL解析会把对应路径归一化为当前/父路径，任意opaque identity目标仍未满足；Decision为`changes_requested`。Increment 9 Stage 1现已通过Review、获用户最终接受并进入版本化`main`；用户于2026-08-30另行批准并完成active project runtime的v0.3 database/binding cutover，旧v0.2 database按设计只读归档。

Stage 2的[Architecture Review](./docs/documents/STAGE_2_EXECUTION_CORE_ARCHITECTURE_REVIEW.md)已完成，用户于2026-08-30确认三项设计方向并确认[Increment 10 Contract](./docs/documents/INCREMENT_10_TASK_CONTRACT.md)全文。Implementation、Fix与最终Review均已完成，用户已最终接受，历史v0.3 durable Room=`ACCEPTED`；accepted source已进入版本化`main`并于2026-09-02随Stage 3整体完成后进入active v0.5 runtime。用户于2026-08-31进一步确认[哈希校验删除规划](./docs/documents/HASH_VALIDATION_REMOVAL_PLAN.md)的范围和HEAD/branch drift取舍；[Architecture Review](./docs/documents/HASH_VALIDATION_REMOVAL_ARCHITECTURE_REVIEW.md)=`Approved`，[ADR-0005](./docs/documents/ADR/0005-remove-git-baseline-hash-validation.md)=`Accepted`，[Increment 11 Contract](./docs/documents/INCREMENT_11_TASK_CONTRACT.md)全文已确认并转为`Accepted`。

Increment 11获得的一次性执行路由例外已完成：Implementation与Fix均由独立Codex task使用`gpt-5.6-sol`、reasoning effort=`medium`执行，未走Agent Room Claude Runner。该例外不永久改变默认角色；current root Codex已完成Contract、Review、文档维护、用户接受与获授权的`main`版本化。用户另行指定下一Coding task继续使用同一model/effort；Increment 12 Contract已Accepted且clean versioned source baseline形成，task创建与runtime cutover继续独立授权。

Stage 3的[Architecture Review](./docs/documents/STAGE_3_DAG_CONTROL_PLANE_ARCHITECTURE_REVIEW.md)=`Approved`、[ADR-0006](./docs/documents/ADR/0006-stage-3-dag-control-plane-and-git-controller.md)=`Accepted`。Increment 12从exact baseline `51c9a50c83064fb9e2e4cc83e2f3942e4e06e5ae`形成；Review `review-increment-012-codex-001`的六项finding已由Accepted [Increment 12 Fix Task 1](./docs/documents/INCREMENT_12_FIX_TASK_1.md)处理。Fix Review `review-increment-012-codex-002`的三项test/evidence与Coding Result finding已由Accepted [Increment 12 Fix Task 2](./docs/documents/INCREMENT_12_FIX_TASK_2.md)处理。Fix Review 3 `review-increment-012-codex-003`的Development Log provenance finding已由Accepted [Increment 12 Fix Task 3](./docs/documents/INCREMENT_12_FIX_TASK_3.md)更正；Fix Review 4 `review-increment-012-codex-004`的两项low finding由[Increment 12 Fix Task 4](./docs/documents/INCREMENT_12_FIX_TASK_4.md)处理。Fix Review 5 `review-increment-012-codex-005`确认九个失效链接已闭合。派发门禁重新读取原candidate task后确认Fix Task 4的completed turn实际存在字段完整的`final_answer`，因此Review 5唯一finding失效、Decision更正为`approved`；[Increment 12 Fix Task 5](./docs/documents/INCREMENT_12_FIX_TASK_5.md)未派发并标记`Superseded / Not Dispatched`。用户已明确最终接受Increment 12，阶段=`ACCEPTED`；accepted implementation、tests、Plugin与权威文档已进入版本化`main`。其后Increment 13完成并版本化，active runtime于2026-09-02切换到v0.5；push与旧database处理仍未授权。

用户于2026-09-02确认[Increment 13 Git Controller Architecture Review](./docs/documents/INCREMENT_13_GIT_CONTROLLER_ARCHITECTURE_REVIEW.md)三项推荐，并随后明确确认[Increment 13完整Task Contract](./docs/documents/INCREMENT_13_TASK_CONTRACT.md)。Review Decision=`approved`；Contract=`Accepted`、`confirmed_by_user=true`，documented planning阶段=`PLAN_READY`。确认不自动授权Coding task创建、规划文档版本化、GitAction或runtime写入。

Increment 13 Implementation candidate已从exact baseline `c7b4c2db0095632194940df40b49e0788257f099`完成。Review `review-increment-013-codex-001`的四项finding已形成并派发Accepted [Increment 13 Fix Task 1](./docs/documents/INCREMENT_13_FIX_TASK_1.md)。Fix Review 2 `review-increment-013-codex-002`确认predecessor、successful settlement和delayed preview retry三项production修复已闭合，但simultaneous reservation、`failed` preview retry与结构化Coding Result证据未闭环；用户确认后由Accepted [Increment 13 Fix Task 2](./docs/documents/INCREMENT_13_FIX_TASK_2.md)补齐。Fix Review 3 `review-increment-013-codex-003`核对完整candidate Diff与本次结构化Coding Result，无finding、Decision=`approved`；独立`typecheck`、Git Controller/CLI 9/9、full 385/385与`git diff --check`通过。用户已明确最终接受Increment 13，阶段=`ACCEPTED`；完整accepted source由commit `004969190215e354fc468e824d9c5e798f01e4fc`进入版本化`main`，active runtime随后完成v0.5 cutover。

Increment 14已完成Review、获用户接受并集成；状态=`accepted_and_integrated`，final commit=`d5827a052190d63fb2fbbd9fbd970ba9db92ed64`。其validation boundary成果继续是Stage 1–3历史Accepted实现的一部分。

详细结构见 [ARCHITECTURE.md](./docs/documents/ARCHITECTURE.md)，协议见 [ROOM_PROTOCOL.md](./docs/documents/ROOM_PROTOCOL.md)。长期决策见 [ADR/0001-local-room-and-state-ownership.md](./docs/documents/ADR/0001-local-room-and-state-ownership.md) 与 [ADR/0002-agent-integration-lifecycle.md](./docs/documents/ADR/0002-agent-integration-lifecycle.md)。

## 7. 工作流与门禁

当前有效主流程：

```text
DISCUSSION
→ ARCHITECTURE_REVIEW
→ WAITING_FOR_USER_CONFIRMATION
→ PLAN_READY
→ CODING
→ REVIEW_REQUIRED
→ REVIEW_DISCUSSION
→ FIX_PLAN_READY
→ CODING
→ REVIEW_REQUIRED
→ ACCEPTED
```

协议可以增加 `NEEDS_DECISION` 和 `RUN_FAILED` 等真实失败状态，但不得绕过用户确认：

- 没有用户确认，不得从方案进入 Coding。
- Review 完成后必须进入 REVIEW_DISCUSSION。
- 没有用户确认解决方案，不得提交 Fix Task。
- 没有用户接受，不得进入 ACCEPTED。

具体合法转换、actor 和失败语义见 [ROOM_PROTOCOL.md](./docs/documents/ROOM_PROTOCOL.md)。

### 7.1 Superseded — Room MCP 建成前的 Bootstrap 路径

> 状态：Superseded（2026-08-25）。用户已明确接受并提交 Increment 4；后续 Task Contract 改用 Room MCP。Room runtime 初始化与 Runner launcher 是独立 dispatch prerequisite，不恢复旧 `claude -p` Task transport。

2026-08-25 一次性开发执行例外：Increment 5 正在实现的正是缺失的 Decision/Fix continuation，而当前 repository 尚无 Room initialization 与 Runner launcher command。用户明确选择暂时自行人工派发完整 [Increment 5 Accepted Contract](./docs/documents/INCREMENT_5_TASK_CONTRACT.md)；Codex 只提供指令、不启动 Claude。该例外只覆盖本次开发 Task 的人工 delivery/result return，不恢复通用 bootstrap规则、不建立平行 Room authority，也不授权 Claude执行任何 Git写操作。Accepted documentation已于 2026-08-26 形成 clean `main` baseline；实际派发仍须从 live Git记录 exact `HEAD` 并确认 staged、unstaged、untracked均为空。

2026-08-26 一次性开发执行例外：Increment 6 正在交付缺失的 Room initialization/planning coordination tools 与 one-shot Runner launcher，因此这些 product paths 不能用于派发自身。用户已确认完整 [Increment 6 Accepted Contract](./docs/documents/INCREMENT_6_TASK_CONTRACT.md)，并选择在 clean documentation baseline 形成后自行人工派发；Codex只提供指令、不启动Claude。该例外只覆盖本次开发Task的人工delivery/result return，不恢复通用bootstrap、不建立平行Room authority、不作为runtime E2E验收证据，也不授权Claude执行任何Git写操作。用户已另行授权把Accepted/review documentation单独提交到`main`；实际派发metadata必须从该commit完成后的live Git确认exact `HEAD`与clean worktree。

2026-08-27 一次性开发执行例外：Increment 7 正在交付尚不存在的Agent Room Plugin与project-local binding，用户已确认完整[Increment 7 Accepted Contract](./docs/documents/INCREMENT_7_TASK_CONTRACT.md)并选择自行人工派发。Review 1后用户不豁免baseline违约，要求先隔离首轮candidate并形成clean documentation baseline，再严格重执行完整Contract。Codex只提供引用完整Contract的指令，不启动Claude。本例外只覆盖本次Implementation Task delivery/result return，不改变目标Plugin中“Codex + `auto_review`执行one-shot `room:run`”的产品语义，不建立第二套Room authority，也不授权Claude执行Git写操作、真实paid Claude或越过Contract scope。用户已分别授权并完成candidate隔离、授权本次documentation baseline commit；再次派发前从commit完成后的clean live Git记录exact `HEAD`。

用户于 2026-08-23 明确批准 Increment 1 Task Contract，并批准以下临时 bootstrap 路径：

- 在 Increment 4 的 Room MCP 被 Review 并接受前，Codex 可以使用本机 `claude -p`，把完整且已由用户批准的 Task Contract 直接交给 Claude Code CLI。
- Bootstrap Task 必须包含稳定 `task_id`、`confirmed_by_user=true` 和本文件要求的完整契约字段；CLI prompt 摘要不能替代 Task Contract。
- Claude Code 的 stdout final result 暂时代替尚未可用的 Room Coding Result transport，但仍必须满足 [ROOM_PROTOCOL.md](./docs/documents/ROOM_PROTOCOL.md) 的 Coding Result shape。
- Claude 需要产品、架构、范围、依赖或权限决定时，必须返回 `needs_decision` 并结束当前 process；Codex 与用户确认后才能启动新的 process。
- Git baseline、clean-worktree gate、Codex Review、Review discussion、Fix approval 和最终接受门禁保持不变。
- Bootstrap 路径只改变 Task/Result 的临时 transport，不改变目标产品架构，不形成第二套持久化 Room state。
- 2026-08-25 用户接受 Increment 4 后，本路径已终止；后续 Task 改用经版本化集成的 Room MCP。

## 8. Task 与交付契约

Task Contract、Fix Task、Coding Result 和 Review 的必填信息以 [AGENTS.md](./AGENTS.md)、[CLAUDE.md](./CLAUDE.md) 和 [ROOM_PROTOCOL.md](./docs/documents/ROOM_PROTOCOL.md) 的共同约束为准。

核心规则：

- 一个 Task 只有一个可验证目标。
- Task 使用逻辑 scope；除非确有必要，不把预测文件列表当作硬边界。
- Fix Task 必须引用原 Review 和用户已确认的解决方案。
- Runner 捕获 CLI 最终结果并验证实际 Git 状态。
- Claude 的最终输出必须满足 Coding Result Contract；缺失或无效结果不能被标记为成功。
- Increment 10 Fix Task 1的terminal evidence clarification已获用户确认：effective `needs_decision`携带result时必须是同Task `needs_decision` result且`failure=null`；existing Executor的pause-failure form允许`result=null`与non-null `failure`。该决定不授权修改Executor、transition table或其它Fix non-goals。

## 9. Git 与工作区规则

- 首个 Implementation Task 派发前，目标目录必须是 Git repository 且 worktree clean。
- 一个 Implementation Task 及其全部 Fix Task 共用同一 `baseline_head`。
- clean-worktree gate只建立首个Implementation Run的exact baseline。`RUN_FAILED`后的retry/continuation继承同一Task lineage的`baseline_head`；当actual `HEAD`仍等于该baseline时，source Run保留的staged、unstaged与untracked evidence允许继续存在，并作为该Task拥有的partial implementation继续处理，不得仅为重新制造clean baseline而丢弃、回退或清理。
- 每次retry与新的one-shot Run仍须单独获得用户授权；continuation允许保留task-owned dirty evidence，不等于实现已完成、Review已通过或获得任何Git写操作权限。
- Runner 必须采集 tracked、staged、unstaged 和 untracked 状态。
- CODING 期间用户不同时编辑目标 worktree。
- Room 不自动 commit、checkout、reset、clean、merge、rebase 或 push。
- 未经用户明确授权，Codex、Claude Code 和 Runner 都不得执行上述操作。
- `.agent-room/` 默认是未版本化运行目录；只有本文件将某类制品明确列为版本化资产时才可提交。

### 9.1 开发期多 Claude Code 并行试点

- 本节只规范本项目的开发执行方式，不表示 Agent Room MVP 已支持一个 Room 多个并行 Run，也不授权 Room 管理 branch 或 worktree。
- Increment 1 与 Increment 2 保持串行；Increment 2 被 Review、接受并提交后，才可选择两个接口已稳定的独立 leaf module 进行首轮并行试点。
- 并行前由 Codex 完成最小项目骨架、公共协议、模块接口和 dependency direction，并由用户确认任务拆分及创建 branch/worktree 所需的 Git 权限。不得以并行为由先建通用 Agent framework 或空 placeholder。
- 每个 Claude Code 使用从同一已确认 `baseline_head` 创建的独立 branch 和独立 worktree，只执行自己的标准 Implementation Task Contract；禁止两个 Agent 修改同一 worktree。
- 模块 Task 必须能独立验证，并通过现有 Contract 字段明确依赖、接口、逻辑 scope 和禁止触及的共享边界。branch、worktree 与 baseline 属于 Git dispatch metadata，不增加 Room protocol field。公共 Schema、central configuration、package lockfile、公共入口和未稳定接口先串行完成，或留给后续 Integration Task。
- 每个模块 Task 分别经过 Coding Result、Codex Review、用户接受和独立提交。所有 module commit 被接受后，再由独立 Integration Task 组装并运行跨模块验证；merge、cherry-pick、commit 和 branch/worktree 操作仍分别需要用户明确授权。
- 并行试点失败时保留各 worktree 和证据，回到串行 integration；不得通过共享目录抢写、自动冲突覆盖或放宽测试维持并行。

## 10. 测试与验证

- 每次检查必须对应具体可检测失败及会改变的决定。
- 状态机、Task 交接、问题恢复、Run 失败和 Runner 协议优先使用集成测试。
- 新增行为必须有聚焦测试；无法自动化时提供可重复人工步骤。
- 不以模型自述、单个成功日志或测试通过代替完整验收。
- 不重复运行输入未变化且已证明同一事实的昂贵检查。

## 11. 开发原则

- 以一个可独立验收的端到端增量为开发单位。
- 产品代码实现最小正确闭环，不增加未请求的抽象、兼容层、Feature Flag 或 runtime 并行路径；开发执行并行仅适用第 9.1 节。
- 优先复用现有依赖；新增依赖前必须核查标准库、当前依赖和官方能力。
- 不顺手重构、格式化或清理无关代码。
- 重大架构、协议、持久化或状态所有权变化必须由用户确认并更新 ADR。
- 编写或维护任何项目文档前，Codex 必须读取 `backend-doc-authoring` skill 及对应 references，并按 `docs/documents/agent-guides/CODEX_DOCUMENTATION_AUTHORING.md` 执行；长期项目文档位于`docs/documents/`，具体Workflow实例位于`docs/work/`；根目录只保留三个agent/tooling控制入口。
- 每次 Review 后，Codex 必须审计需求、接口、架构、结构、状态、命令、运维与开发事实：有变化时更新对应权威文档，无变化时在 Review 验证摘要明确 `documentation: no_change`；未接受 candidate 不得写成 Current。该门禁不增加 Room state 或 runtime hook。
- 每个 Fix Task 经 Codex 二次 Review 通过并获用户明确接受后，Codex 在派发下一 Implementation/Fix Task 前完成一次证据化经验回收，按角色写入 `docs/documents/agent-guides/`；已有规则已覆盖或没有新增经验时如实记录，不制造规则。该文档门禁不增加 Room state、Event 或 protocol field。
- 代码必须包含解释模块职责、关键 invariant、非显然分支、取舍和失败语义所需的注释；注释默认使用简体中文，不逐行复述代码。
- 项目文档与代码注释默认使用简体中文；代码、标识符、命令、Schema 字段和技术专名保持 English。

## 12. 文档地图

| 文档 | 用途 | 维护者 | 读取时机 | 状态 |
|---|---|---|---|---|
| [PROJECT_RULES.md](./PROJECT_RULES.md) | 共享规范入口与当前有效规则 | Codex | 每个非简单项目任务 | Current |
| [AGENTS.md](./AGENTS.md) | Codex 专属角色与流程契约 | 用户/Codex | Codex 会话入口 | Protected |
| [CLAUDE.md](./CLAUDE.md) | Claude Code 专属执行契约 | 用户/Codex Review | 每次 Claude Coding | Protected |
| [docs/documents/README.md](./docs/documents/README.md) | 人工查看的项目文档总入口、用途与依赖关系 | Codex | 查看或维护任意项目文档 | Current |
| [docs/documents/agent-guides/README.md](./docs/documents/agent-guides/README.md) | Agent 细分指南路由与权威关系 | Codex | 角色入口路由或指南维护 | Current |
| [docs/documents/agent-guides/CODEX_DOCUMENTATION_AUTHORING.md](./docs/documents/agent-guides/CODEX_DOCUMENTATION_AUTHORING.md) | `backend-doc-authoring` 驱动的全项目文档编写与维护方法 | Codex | 任意文档工作；每次 Review 后 | Current |
| [docs/documents/agent-guides/CODEX_REVIEW_AND_PLANNING.md](./docs/documents/agent-guides/CODEX_REVIEW_AND_PLANNING.md) | Codex 架构、规划、Review、解决方案与 Fix 经验回收方法 | Codex | 需求、架构、规划、Task、Review、Fix 方案或 Fix 验收后 | Current |
| [docs/documents/agent-guides/CLAUDE_CODING_AND_FIX.md](./docs/documents/agent-guides/CLAUDE_CODING_AND_FIX.md) | Claude Code Coding、Fix、process failure 与回归测试方法 | Codex/Claude 候选 | 每个 Implementation Task 或 Fix Task | Current |
| [docs/documents/agent-guides/GIT_AND_PARALLEL_WORKFLOW.md](./docs/documents/agent-guides/GIT_AND_PARALLEL_WORKFLOW.md) | Git 权限、baseline、并行 worktree 与 integration | Codex/Claude | Git、并行或 integration 任务 | Current |
| [docs/documents/agent-guides/CHAT_GITHUB_REVIEW.md](./docs/documents/agent-guides/CHAT_GITHUB_REVIEW.md) | fixed Chat通过GitHub PR执行正式Review | Codex | 正式Review与集成 | Current |
| [docs/documents/agent-guides/CODEX_SUPERVISOR_ROUTER.md](./docs/documents/agent-guides/CODEX_SUPERVISOR_ROUTER.md) | GitHub Router到Codex Cloud的显式派发 | Codex | Supervisor dispatch | Current |
| [docs/documents/STAGE_4_GITHUB_CHAT_REVIEW_ARCHITECTURE_REVIEW.md](./docs/documents/STAGE_4_GITHUB_CHAT_REVIEW_ARCHITECTURE_REVIEW.md) | GitHub/Chat Review控制面 | Codex | Stage 4+开发工作流 | Approved |
| [docs/documents/STAGE_4_NO_API_KEY_ARCHITECTURE_AMENDMENT.md](./docs/documents/STAGE_4_NO_API_KEY_ARCHITECTURE_AMENDMENT.md) | No-API-Key Codex Cloud边界 | Codex | Actions与Codex交接 | Approved |
| [docs/documents/INCREMENT_15_GITHUB_WORKFLOW_FOUNDATION_TASK_CONTRACT.md](./docs/documents/INCREMENT_15_GITHUB_WORKFLOW_FOUNDATION_TASK_CONTRACT.md) | Increment 15 Revision 2 Bootstrap | Codex | Bootstrap与Pilot规划 | Accepted / PLAN_READY |
| [docs/work/README.md](./docs/work/README.md) | 具体Workflow实例与模板入口 | Codex | Workflow执行 | Current |
| [docs/documents/ARCHITECTURE.md](./docs/documents/ARCHITECTURE.md) | 系统结构、模块边界、依赖和数据流 | Codex | 每个非简单项目任务 | Current |
| [docs/documents/ROOM_PROTOCOL.md](./docs/documents/ROOM_PROTOCOL.md) | 状态机、实体、MCP 和 Runner 协议 | Codex | 协议、Runner、MCP、状态任务 | Current |
| [docs/documents/MVP_PLAN.md](./docs/documents/MVP_PLAN.md) | MVP 增量、顺序、验收和非目标 | Codex | 规划与 Task Contract 生成 | Current |
| [docs/documents/AGENT_ROOM_V03_ROADMAP.md](./docs/documents/AGENT_ROOM_V03_ROADMAP.md) | Agent Room v0.3六阶段路线、阶段门禁与人工控制点 | Codex | v0.3阶段规划与跨阶段架构校验 | Accepted |
| [docs/documents/STAGE_2_EXECUTION_CORE_ARCHITECTURE_REVIEW.md](./docs/documents/STAGE_2_EXECUTION_CORE_ARCHITECTURE_REVIEW.md) | Stage 2 Run/RunAttempt、并发隔离、public commands、SQLite/Event与测试矩阵Architecture Review | Codex | Stage 2架构、Contract与Review | Approved |
| [docs/documents/STAGE_3_DAG_CONTROL_PLANE_ARCHITECTURE_REVIEW.md](./docs/documents/STAGE_3_DAG_CONTROL_PLANE_ARCHITECTURE_REVIEW.md) | Stage 3 immutable graph、Scheduler、scope conflict、acceptance policy与Git Controller Architecture Review | Codex | Stage 3架构、Contract与Review | Approved |
| [docs/documents/INCREMENT_13_GIT_CONTROLLER_ARCHITECTURE_REVIEW.md](./docs/documents/INCREMENT_13_GIT_CONTROLLER_ARCHITECTURE_REVIEW.md) | Increment 13 Git Controller transport、ff-only integration范围与pre-cutover Coding route评审 | Codex | Increment 13规划与Task Contract生成 | Approved |
| [docs/documents/OPERATIONS.md](./docs/documents/OPERATIONS.md) | 人工运维接口、架构/结构、命令、状态/制品与恢复视图 | Codex | 人工运维；每次 Review 后维护 | Current |
| [docs/documents/INCREMENT_1_TASK_CONTRACT.md](./docs/documents/INCREMENT_1_TASK_CONTRACT.md) | Increment 1 已批准 Implementation Task Contract | Codex | Increment 1 Coding、Review 与 Fix 规划 | Accepted |
| [docs/documents/INCREMENT_1_FIX_TASK_1.md](./docs/documents/INCREMENT_1_FIX_TASK_1.md) | Increment 1 Review 1 已确认的最小 Fix Task | Codex | Increment 1 Fix Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_1_FIX_TASK_2.md](./docs/documents/INCREMENT_1_FIX_TASK_2.md) | Increment 1 Review 2 已确认的最小 Fix Task | Codex | Increment 1 Fix 2 Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_1_FIX_TASK_3.md](./docs/documents/INCREMENT_1_FIX_TASK_3.md) | Increment 1 Review 3 已确认的最小 Fix Task | Codex | Increment 1 Fix 3 Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_2_TASK_CONTRACT.md](./docs/documents/INCREMENT_2_TASK_CONTRACT.md) | Increment 2 已批准 Implementation Task Contract | Codex | Increment 2 Coding、Review 与 Fix 规划 | Accepted |
| [docs/documents/INCREMENT_2_FIX_TASK_1.md](./docs/documents/INCREMENT_2_FIX_TASK_1.md) | Increment 2 Review 1 已确认的最小 Fix Task | Codex | Increment 2 Fix Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_3_PARALLEL_PILOT_PLAN.md](./docs/documents/INCREMENT_3_PARALLEL_PILOT_PLAN.md) | Increment 3 两个 leaf module 并行试点与串行 Integration 计划 | Codex | Increment 3 Scaffold、Leaf 与 Integration 规划 | Current |
| [docs/documents/INCREMENT_3_SCOPE_SCAFFOLD_TASK_CONTRACT.md](./docs/documents/INCREMENT_3_SCOPE_SCAFFOLD_TASK_CONTRACT.md) | 并行派发前共享 Scope regression 串行前置任务 | Codex | Scope Scaffold Coding 与 Review | Accepted |
| [docs/documents/INCREMENT_3_SCOPE_SCAFFOLD_FIX_TASK_1.md](./docs/documents/INCREMENT_3_SCOPE_SCAFFOLD_FIX_TASK_1.md) | Scope Scaffold Review 1 已确认的最小 Fix Task | Codex | Scope Scaffold Fix Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_3A_TASK_CONTRACT.md](./docs/documents/INCREMENT_3A_TASK_CONTRACT.md) | Claude Process Transport leaf Implementation Task Contract | Codex | Leaf A Coding、Review 与 Integration 规划 | Accepted |
| [docs/documents/INCREMENT_3B_TASK_CONTRACT.md](./docs/documents/INCREMENT_3B_TASK_CONTRACT.md) | Claude Stream Interpreter leaf Implementation Task Contract | Codex | Leaf B Coding、Review 与 Integration 规划 | Accepted |
| [docs/documents/INCREMENT_3A_FIX_TASK_1.md](./docs/documents/INCREMENT_3A_FIX_TASK_1.md) | Leaf A Review 1 已确认的 stdin prompt delivery failure 最小 Fix Task | Codex | Leaf A Fix Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_3B_FIX_TASK_1.md](./docs/documents/INCREMENT_3B_FIX_TASK_1.md) | Leaf B Review 1 已确认的 required Room tool authority 最小 Fix Task | Codex | Leaf B Fix Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_3_INTEGRATION_TASK_CONTRACT.md](./docs/documents/INCREMENT_3_INTEGRATION_TASK_CONTRACT.md) | 两个 accepted leaf 与 Room/Git/artifact 的串行 Claude Runner Integration Task Contract | Codex | Increment 3 Integration Coding 与 Review | Accepted |
| [docs/documents/INCREMENT_3_INTEGRATION_FIX_TASK_1.md](./docs/documents/INCREMENT_3_INTEGRATION_FIX_TASK_1.md) | Integration Review 1 已确认的 current Task、partial session、central matrix 与 lifecycle 文档 Fix | Codex | Increment 3 Integration Fix Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_4_TASK_CONTRACT.md](./docs/documents/INCREMENT_4_TASK_CONTRACT.md) | actor-scoped Room MCP、共享状态 snapshot 与 read-only Status CLI Implementation Task Contract | Codex | Increment 4 Coding 与 Review | Accepted |
| [docs/documents/INCREMENT_4_FIX_TASK_1.md](./docs/documents/INCREMENT_4_FIX_TASK_1.md) | Increment 4 Review 1 五项 confirmed finding 的最小 Fix Task | Codex | Increment 4 Fix Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_4_FIX_TASK_2.md](./docs/documents/INCREMENT_4_FIX_TASK_2.md) | Increment 4 Review 2 cleanup 与 durable-state direct evidence 最小 Fix Task | Codex | Increment 4 Fix 2 Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_4_FIX_TASK_3.md](./docs/documents/INCREMENT_4_FIX_TASK_3.md) | Increment 4 Review 3 stale submit-review MCP direct evidence 最小 Fix Task | Codex | Increment 4 Fix 3 Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_5_TASK_CONTRACT.md](./docs/documents/INCREMENT_5_TASK_CONTRACT.md) | Decision/Fix Resume、Question pause 与 lineage continuation Implementation Task Contract | Codex | Increment 5 Coding、Review 与 Fix规划 | Accepted |
| [docs/documents/INCREMENT_5_FIX_TASK_1.md](./docs/documents/INCREMENT_5_FIX_TASK_1.md) | Increment 5 Review 1 三项 confirmed finding 的最小 Fix Task | Codex | Increment 5 Fix Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_5_FIX_TASK_2.md](./docs/documents/INCREMENT_5_FIX_TASK_2.md) | Increment 5 Review 2 三项 confirmed regression-oracle finding 的 test-only Fix Task | Codex | Increment 5 Fix Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_6_TASK_CONTRACT.md](./docs/documents/INCREMENT_6_TASK_CONTRACT.md) | planning coordination tools、one-shot Runner CLI、failure retry 与真实边界 E2E Implementation Task Contract | Codex | Increment 6 Coding、Review 与 Fix规划 | Accepted |
| [docs/documents/INCREMENT_6_FIX_TASK_1.md](./docs/documents/INCREMENT_6_FIX_TASK_1.md) | Increment 6 Review 2 retry negative evidence 与 current-Task source语义最小Fix Task | Codex | Increment 6 Fix Coding 与再次Review | Accepted |
| [docs/documents/INCREMENT_7_TASK_CONTRACT.md](./docs/documents/INCREMENT_7_TASK_CONTRACT.md) | shared Agent Room Plugin、project-local MCP/runtime binding 与跨项目并行隔离 Implementation Task Contract | Codex | Increment 7 Coding 与 Review | Accepted |
| [docs/documents/INCREMENT_7_FIX_TASK_1.md](./docs/documents/INCREMENT_7_FIX_TASK_1.md) | Increment 7 Review 2 marketplace、Skill lifecycle/baseline 与 setup/packaging evidence 最小 Fix Task | Codex | Increment 7 Fix Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_7_FIX_TASK_2.md](./docs/documents/INCREMENT_7_FIX_TASK_2.md) | Increment 7 Review 3 Skill front matter 与 Decision resume gate 最小 Fix Task | Codex | Increment 7 Fix 2 Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_7_FIX_TASK_3.md](./docs/documents/INCREMENT_7_FIX_TASK_3.md) | Increment 7 Review 4 YAML scalar legality 与 front matter negative Oracle 最小 Fix Task | Codex | Increment 7 Fix 3 Coding 与再次 Review | Accepted |
| [docs/documents/INCREMENT_8_TASK_CONTRACT.md](./docs/documents/INCREMENT_8_TASK_CONTRACT.md) | Agent Room Skill 自动project setup、service startup与reload continuation Implementation Task Contract | Codex | Increment 8 Coding与Review | Accepted |
| [docs/documents/INCREMENT_8_FIX_TASK_1.md](./docs/documents/INCREMENT_8_FIX_TASK_1.md) | Increment 8 dotted-key config conflict与actual Skill consumer evidence最小Fix Task | Codex | Increment 8 Fix Coding与再次Review | Accepted |
| [docs/documents/INCREMENT_8_FIX_TASK_2.md](./docs/documents/INCREMENT_8_FIX_TASK_2.md) | Increment 8 TOML dotted-key table-context误判最小Fix Task | Codex | Increment 8 Fix 2 Coding与再次Review | Accepted |
| [docs/documents/INCREMENT_9_TASK_CONTRACT.md](./docs/documents/INCREMENT_9_TASK_CONTRACT.md) | Protocol v0.3 Participant / Role Foundation Implementation Task Contract | Codex | Increment 9 Coding、Review与Fix规划 | Accepted |
| [docs/documents/INCREMENT_9_FIX_TASK_1.md](./docs/documents/INCREMENT_9_FIX_TASK_1.md) | Increment 9 frozen authority、Task scope、retry/control、assignment与migration evidence最小Fix Task | Codex | Increment 9 Fix Coding与再次Review | Accepted |
| [docs/documents/INCREMENT_9_FIX_TASK_2.md](./docs/documents/INCREMENT_9_FIX_TASK_2.md) | Increment 9 frozen consumer authority、replacement-safe retry与binding identity最小Fix Task | Codex | Increment 9 Fix 2 Coding与再次Review | Accepted |
| [docs/documents/INCREMENT_9_FIX_TASK_3.md](./docs/documents/INCREMENT_9_FIX_TASK_3.md) | Increment 9 opaque participant route single-segment encoding最小Fix Task | Codex | Increment 9 Fix 3 Coding与再次Review | Accepted |
| [docs/documents/INCREMENT_9_FIX_TASK_4.md](./docs/documents/INCREMENT_9_FIX_TASK_4.md) | Increment 9 dot-segment-safe participant route framing最小Fix Task | Codex | Increment 9 Fix 4 Coding与再次Review | Accepted |
| [docs/documents/INCREMENT_10_TASK_CONTRACT.md](./docs/documents/INCREMENT_10_TASK_CONTRACT.md) | Stage 2 Execution Core Implementation Task Contract | Codex | Increment 10 Coding与Review | Accepted |
| [docs/documents/INCREMENT_10_FIX_TASK_1.md](./docs/documents/INCREMENT_10_FIX_TASK_1.md) | Increment 10 claim serialization、terminal evidence与current Task最小Fix Task | Codex | Increment 10 Fix Coding与再次Review | Accepted |
| [docs/documents/INCREMENT_10_FIX_TASK_2.md](./docs/documents/INCREMENT_10_FIX_TASK_2.md) | Increment 10 empty needs_decision evidence guard最小Fix Task | Codex | Increment 10 Fix 2 Coding与再次Review | Accepted |
| [docs/documents/HASH_VALIDATION_REMOVAL_PLAN.md](./docs/documents/HASH_VALIDATION_REMOVAL_PLAN.md) | 删除project-owned Git baseline hash validation的范围、风险与实施顺序 | Codex | Increment 11 Architecture/Task规划 | Approved |
| [docs/documents/HASH_VALIDATION_REMOVAL_ARCHITECTURE_REVIEW.md](./docs/documents/HASH_VALIDATION_REMOVAL_ARCHITECTURE_REVIEW.md) | baseline-free Git/Execution Core目标架构、失败语义与dispatch边界 | Codex | Increment 11规划、Coding与Review | Approved |
| [docs/documents/INCREMENT_11_TASK_CONTRACT.md](./docs/documents/INCREMENT_11_TASK_CONTRACT.md) | 删除Git baseline hash validation的完整Implementation Task Contract | Codex | Increment 11 Coding与Review | Accepted |
| [docs/documents/INCREMENT_11_FIX_TASK_1.md](./docs/documents/INCREMENT_11_FIX_TASK_1.md) | Increment 11 invalid-path完整Oracle与Current文档状态最小Fix Task | Codex | Increment 11 Fix Coding与再次Review | Accepted |
| [docs/documents/INCREMENT_12_TASK_CONTRACT.md](./docs/documents/INCREMENT_12_TASK_CONTRACT.md) | Stage 3 Plan/immutable revision/Approval、structured scope与one-shot Scheduler完整Implementation Contract | Codex | Increment 12 Coding与Review | Accepted |
| [docs/documents/INCREMENT_12_FIX_TASK_1.md](./docs/documents/INCREMENT_12_FIX_TASK_1.md) | Increment 12 exact latest revision、scope recovery、current concurrency与frozen authority最小Fix Task | Codex | Increment 12 Fix Coding与再次Review | Accepted |
| [docs/documents/INCREMENT_12_FIX_TASK_2.md](./docs/documents/INCREMENT_12_FIX_TASK_2.md) | Increment 12完整rollback Oracle、逐实体MCP retry evidence与Coding Result provenance最小Fix Task | Codex | Increment 12 Fix 2 Coding与再次Review | Accepted |
| [docs/documents/INCREMENT_12_FIX_TASK_3.md](./docs/documents/INCREMENT_12_FIX_TASK_3.md) | Increment 12 Development Log Fix 1/2 verification provenance与current next-step文档修正 | Codex | Increment 12 Fix 3 Coding与再次Review | Accepted |
| [docs/documents/INCREMENT_12_FIX_TASK_4.md](./docs/documents/INCREMENT_12_FIX_TASK_4.md) | Increment 12 candidate失效Contract链接与结构化Coding Result闭合 | Codex | Increment 12 Fix 4 Coding与再次Review | Accepted |
| [docs/documents/INCREMENT_12_FIX_TASK_5.md](./docs/documents/INCREMENT_12_FIX_TASK_5.md) | Increment 12结构化Coding Result闭合的历史Fix Contract；派发门禁证明finding失效 | Codex | 审计记录，不得派发 | Superseded / Not Dispatched |
| [docs/documents/INCREMENT_13_TASK_CONTRACT.md](./docs/documents/INCREMENT_13_TASK_CONTRACT.md) | typed GitAction、fixed-actor one-shot Git Controller与single-lineage integration_only完整Implementation Contract | Codex | Increment 13 Coding与Review | Accepted |
| [docs/documents/INCREMENT_13_FIX_TASK_1.md](./docs/documents/INCREMENT_13_FIX_TASK_1.md) | Increment 13 preview idempotency、settlement crash gap、lineage predecessor与two-connection evidence最小Fix Task | Codex | Increment 13 Fix Coding与再次Review | Accepted |
| [docs/documents/INCREMENT_13_FIX_TASK_2.md](./docs/documents/INCREMENT_13_FIX_TASK_2.md) | Increment 13 simultaneous reservation、failed preview retry与结构化Coding Result最小Fix Task | Codex | Increment 13 Fix 2 Coding与再次Review | Accepted |
| [docs/documents/INCREMENT_14_TASK_CONTRACT.md](./docs/documents/INCREMENT_14_TASK_CONTRACT.md) | validation ownership、internal invariant与Attempt/GitAction事务简化完整Implementation Contract | Codex | Increment 14 Coding与Review | Accepted |
| [docs/documents/INCREMENT_14_FIX_TASK_1.md](./docs/documents/INCREMENT_14_FIX_TASK_1.md) | stdout callback failure settlement与same-attempt并发terminal evidence最小Fix Contract | Codex | Increment 14 Fix Coding与GitHub Fix Review | Accepted / Fix Candidate REVIEW_REQUIRED |
| [docs/documents/INCREMENT_14_FIX_TASK_2.md](./docs/documents/INCREMENT_14_FIX_TASK_2.md) | owned child close前禁止callback failure evidence collection与terminal settlement的最小Fix Contract | Codex | Increment 14 Fix 2 Coding与GitHub Fix Review 3 | Accepted / Fix Candidate REVIEW_REQUIRED |
| [docs/documents/DEVELOPMENT_LOG.md](./docs/documents/DEVELOPMENT_LOG.md) | 已完成事实、验证、阻塞与下一步 | Codex/Claude 候选 | 每个非简单项目任务 | Current |
| [docs/documents/ADR/0001-local-room-and-state-ownership.md](./docs/documents/ADR/0001-local-room-and-state-ownership.md) | 本地架构与状态所有权决策 | Codex | 架构、存储、Git 相关任务 | Accepted |
| [docs/documents/ADR/0002-agent-integration-lifecycle.md](./docs/documents/ADR/0002-agent-integration-lifecycle.md) | Codex 拉取与 Claude Runner 生命周期决策 | Codex | Agent 集成与 Runner 任务 | Accepted |
| [docs/documents/ADR/0003-participant-role-and-v03-evolution.md](./docs/documents/ADR/0003-participant-role-and-v03-evolution.md) | Participant/Role authority、v0.3新数据库与分阶段演进决策 | Codex | v0.3协议、binding、migration与阶段规划 | Accepted |
| [docs/documents/ADR/0004-execution-core-run-attempt-and-concurrency.md](./docs/documents/ADR/0004-execution-core-run-attempt-and-concurrency.md) | Stage 2 Run/RunAttempt、atomic claim、worktree lease与0.4 cutover决策 | Codex | Stage 2协议、storage、Executor与并发 | Proposed / decisions confirmed |
| [docs/documents/ADR/0005-remove-git-baseline-hash-validation.md](./docs/documents/ADR/0005-remove-git-baseline-hash-validation.md) | 删除baseline hash contract并保留canonical worktree/live evidence | Codex | Increment 11实现、Review与cutover | Accepted |
| [docs/documents/ADR/0006-stage-3-dag-control-plane-and-git-controller.md](./docs/documents/ADR/0006-stage-3-dag-control-plane-and-git-controller.md) | Stage 3 graph authority、ready scheduling、Git preview/approval与target cutover决策 | Codex | Stage 3协议、storage、Scheduler与Git Controller | Accepted |

“会话必读”文档为：

1. `PROJECT_RULES.md`
2. `docs/documents/ARCHITECTURE.md`
3. `docs/documents/DEVELOPMENT_LOG.md`

当前任务涉及协议、Runner、MCP、状态或 Git 基线时，还必须读取 `docs/documents/ROOM_PROTOCOL.md`。生成 Task Contract 时必须读取 `docs/documents/MVP_PLAN.md`。任何项目文档工作还必须调用 `backend-doc-authoring` skill 并读取 `docs/documents/agent-guides/CODEX_DOCUMENTATION_AUTHORING.md`。

## 13. 规则变更

- 当前规则不得被静默删除或覆盖。
- 变更规则时必须记录日期、原因、替代内容和相关 ADR。
- 旧规则必须明确标记为 `Superseded` 或 `Deprecated`，避免新旧规则同时表现为有效。
- Claude Code 对共享规则、架构和 ADR 的修改只是候选 Diff，必须由 Codex Review，并在重大变化时由用户确认。
- 2026-08-23：用户确认在 Increment 2 被接受后，以两个独立 leaf module 试点“独立 branch/worktree + 独立 Implementation Task + 串行 integration”的开发期并行方式。该规则不替代 MVP 的单 Room/单 Run 产品边界，因此本次不新增 ADR；若未来把并行 worker 或 worktree management 纳入产品 runtime，必须另行 Architecture Review、用户确认和 ADR。
- 2026-08-23：用户明确代码必须包含必要注释，代码注释默认使用简体中文，代码、标识符、命令、Schema 字段和技术专名保持 English；该规则只澄清编码与 Review 标准，不改变架构，因此不新增 ADR。
- 2026-08-24：用户要求把 Fix 2/3 的可复用经验按 Codex 与 Claude Code 职责拆分，并采用入口路由 + 细分指南的渐进式读取结构。`AGENTS.md`/`CLAUDE.md` 保留角色硬边界和强制索引，详细 Review/规划、Coding/Fix、Git/并行方法当前位于 `docs/documents/agent-guides/`；同时清除两份入口中的未解析 merge marker。该变更整理角色执行知识，不改变产品架构或 Room protocol，因此不新增 ADR。
- 2026-08-24：用户确认 Increment 3 并行试点拆分为 `Claude Process Transport` 与 `Claude Stream Interpreter` 两个独立 leaf module，先串行更新共享 Scope regression，再分别 Review、接受、提交并通过独立 Integration Task 组装。用户同时确认 `CODING` 覆盖 Runner claim 后的 process startup 与 MCP initialization，既有 startup/init failure 继续走 `CODING → RUN_FAILED`，不增加 Room state 或 transition；protocol version、ADR 与实现同步留给 Increment 3 Integration Task。
- 2026-08-24：用户要求总结 Increment 2 Fix 1 的可复用经验，并把“每个 Fix Task 验收后自动执行经验回收”固化为 Codex 文档工作流门禁。经验按 Codex Review 与 Claude Coding 职责写入细分指南；自动化只覆盖 Trigger、路由和一致性检查，不增加 Room state、protocol field、runtime hook 或 ADR。
- Superseded 2026-08-24：Codex 的“运维文档编写者及维护者”窄角色已由下一条全项目文档角色替代；Review 后运维维护要求继续包含在新角色中。
- 2026-08-24：用户明确要求 Codex 调用 `backend-doc-authoring` skill 编写和维护所有项目文档，并把人类可查看文档统一迁入 `docs/documents/`。根目录只保留 `AGENTS.md`、`CLAUDE.md`、`PROJECT_RULES.md` 三个 agent/tooling 控制入口；新增文档总索引和全项目文档维护指南，不保留旧路径副本。该变更只调整文档角色、目录和工作流，不改变产品 architecture、Room protocol 或 runtime，因此不新增 ADR。
- 2026-08-27：用户确认 Increment 7 采用“安装一次的 Agent Room Plugin + 每个项目独立的 MCP/runtime 配置”；Plugin共享通用Skill，Project A/B分别保存port、database与project path并可通过独立Room/worktree/Claude process并行。`room:run`保持one-shot operator-authorized boundary，Plugin workflow固定由Codex执行，host内部审批模式固定为UI“帮我批准”（`approvals_reviewer=auto_review`）；Current CLI的人工可调用性不纳入Plugin正常路径。同一Room parallel Runs继续延后。该决定是ADR-0002的additive clarification，不改变Room protocol version、state/schema/Event/error或Current runtime。
- 2026-08-27：用户先确认Increment 8 setup的三项输入边界，随后明确确认[完整Implementation Contract](./docs/documents/INCREMENT_8_TASK_CONTRACT.md)。Contract现为`Accepted`，阶段进入`PLAN_READY`；本次确认不授权Git写操作、跳过clean documentation baseline、直接启动Claude/service，或把automatic setup提升为Current。
- 2026-08-27：用户随后明确授权提交Increment 8 Accepted planning文档范围，并选择暂时自行人工派发完整Contract。授权不覆盖Codex/Plugin启动Claude或service、implementation commit、push、branch/worktree、runtime初始化、paid smoke或其它Git写操作；manual dispatch必须使用commit后clean live Git exact`HEAD`。
- 2026-08-27：用户确认Increment 8 Review 1的dotted-key conflict与actual Skill consumer evidence两项finding及最小方案；[Fix Task 1](./docs/documents/INCREMENT_8_FIX_TASK_1.md)为`Accepted`，阶段进入`FIX_PLAN_READY`。确认不授权Codex启动Claude、安装/reload Plugin、执行manual consumer evaluation或任何Git写操作。
- 2026-08-27：Increment 8 Fix Review 2 `review-increment-008-codex-002`确认Fix 1已覆盖top-level冻结dotted grammar与offline evidence边界，但classifier未跟踪TOML table context，导致合法unrelated table内的嵌套同名key被误判；actual installed-plugin consumer evaluation仍未运行。Decision为`changes_requested`，阶段进入`REVIEW_DISCUSSION`；用户确认finding与方案前不生成Fix Task，也不安装/reload Plugin或执行Git写操作。
- 2026-08-27：用户确认Fix Review 2的`inc8-r2-dotted-key-table-context` finding与最小方案；[Fix Task 2](./docs/documents/INCREMENT_8_FIX_TASK_2.md)为`Accepted`，阶段进入`FIX_PLAN_READY`。Fix只让现有窄classifier保留判断top-level dotted assignment所需的最小TOML table context并补public CLI regression；不授权Codex启动Claude、Plugin install/reload、actual consumer evaluation或Git写操作。
- 2026-08-27：Fix Review 3 `review-increment-008-codex-003`先确认Fix Task 2代码与direct regression无finding；因actual installed-plugin consumer evaluation未授权、未运行，Decision暂为`needs_discussion`。用户随后明确授权重试local marketplace注册与candidate安装；Codex从`agent-room-local`安装`agent-room@0.1.0`并在fresh tasks完成direct/indirect/negative/boundary activation与bundled resource检查，全部通过，Decision更新为`approved`。阶段保持`REVIEW_DISCUSSION`等待用户最终接受；automatic setup仍为candidate，不授权service/runtime、Claude或Git写操作。
- 2026-08-28：用户明确最终接受Increment 8 Implementation、Fix Task 1/2与`review-increment-008-codex-003`；阶段进入`ACCEPTED`。Codex完成Fix验收经验回收，将installed consumer evaluation的逐断言证据分配、失败/引导性task排除与replacement规则写入Review指南；本次确认不授权commit、push、service/runtime setup、Claude或其它Git写操作。
- 2026-08-28：用户另行明确授权提交Increment 8完整accepted scope；commit `8428046dded5f7542690735b3df8a5c5490e8090`已进入`main`，automatic setup成为Current capability。该授权不覆盖push、service/runtime setup、Claude、branch/worktree或其它操作。
- 2026-08-29：用户确认Agent Room v0.3六阶段路线、ADR-0003、Increment 9完整Contract与三项设计：Stage 1不提前创建无consumer的Plan/Approval；Participant是identity、Role是authority、Assignment只路由future entity且历史identity固化；breaking self-host实现由detached v0.2 launcher worktree驱动current target main。用户授权修改本文件，分别提交setup binding与v0.3 planning文档，创建`D:\agent\case\codex-claudecode-room-v02-launcher` detached worktree，更新Gitignored local runtime binding，并按`auto_review`发起一次one-shot `room:run`。不授权push、database cutover、旧数据删除或implementation commit；v0.3在Review、用户接受和单独cutover授权前仅为candidate。
- 2026-08-29：Review `review-increment-009-codex-001`确认六项finding；用户确认全部finding与最小方案：existing Run由冻结worker/executor推进，Task scope选择下一Run/Review，same-ID retry先验证authority，`codex-app`作为single control orchestrator，assignment active order使用server insert order，补齐v0.2 migration/version public evidence。[Increment 9 Fix Task 1](./docs/documents/INCREMENT_9_FIX_TASK_1.md)为`Accepted`，阶段进入`FIX_PLAN_READY`；只授权一次Fix Run，不授权commit、push、database cutover、旧数据删除或第二次Run。
- 2026-08-29：Fix Review 2 `review-increment-009-codex-002`确认五项remaining finding；用户确认Runner使用resolved executor、Review acceptance使用冻结reviewer、Task/Run/Review replacement后按冻结identity重试、Participant管理只认可active latest orchestrator、existing binding exact验证`codex-app`。[Increment 9 Fix Task 2](./docs/documents/INCREMENT_9_FIX_TASK_2.md)为`Accepted`，Room进入`FIX_PLAN_READY`；本次确认不授权Run、commit、push、database cutover或旧数据删除。
- 2026-08-29：Fix Review 3 `review-increment-009-codex-003`独立确认Fix Task 2五项finding闭合，typecheck、focused 114/114与51/51、scope 1/1、full 309/309及Diff检查通过；但`participant_id`仍是任意非空opaque string，Runner/CLI未把它percent-encode为单一route segment，实际`worker/2` raw route返回404，encoded route虽命中却被exact path comparison拒绝。Decision为`changes_requested`，阶段进入`REVIEW_DISCUSSION`；用户确认方案前不生成Fix Task、不accept或commit。
- 2026-08-29：用户确认Review 3 finding与最小方案：保留raw opaque `participant_id`，仅把其HTTP route representation统一编码为canonical single URI segment，Room authority继续使用raw identity，并补`worker/2`的MCP、production Runner与public CLI direct regression。[Increment 9 Fix Task 3](./docs/documents/INCREMENT_9_FIX_TASK_3.md)为`Accepted`，Room进入`FIX_PLAN_READY`；本次确认不授权Run、accept、commit、push、database cutover或旧数据删除。
- 2026-08-29：Fix Review 4 `review-increment-009-codex-004`确认Fix Task 3对`worker/2`的MCP、production Runner与public CLI路径修复正确，typecheck与full 314/314通过；但schema允许`.`/`..`作为opaque `participant_id`，而`encodeURIComponent`保留dot，WHATWG URL解析分别把participant route归一化为`/mcp/participants/`与`/mcp/`，合法Participant仍不可达。Decision为`changes_requested`，Room进入`REVIEW_DISCUSSION`；用户确认finding与方案前不生成下一Fix Task、不accept或执行Git/runtime write。
- 2026-08-29：用户确认Review 4 finding与推荐方案：保留任意非空opaque `participant_id`，所有v0.3 participant route统一使用`p~` + `encodeURIComponent(raw participant_id)`的固定单段transport framing；MCP只验证并移除一次prefix，不二次percent-decode，Runner/CLI/setup/Plugin consumer同步切换，unframed candidate route拒绝且无compatibility fallback。[Increment 9 Fix Task 4](./docs/documents/INCREMENT_9_FIX_TASK_4.md)为`Accepted`，Room进入`FIX_PLAN_READY`；本次确认不授权Run、accept、commit、push、database cutover或旧数据删除。
- 2026-08-30：Fix Review 5 `review-increment-009-codex-005`未发现finding；固定`p~` framing在MCP、production Runner、public CLI、setup与Plugin consumer中保持raw identity/authority，独立typecheck、focused 108/108、35/35、12/12、scope 1/1与full 321/321全部通过。Decision为`approved`，Room进入`REVIEW_DISCUSSION`等待用户最终接受；未accept、commit、push、database/binding cutover或删除旧数据。
- 2026-08-30：用户明确最终接受Increment 9 Implementation、Fix Task 1–4与Review `review-increment-009-codex-005`；Room通过`review_accepted` Event进入`ACCEPTED`。Fix验收经验回收已完成：opaque identity进入URI path时，Review与Coding必须区分percent-encoding和URL parser normalization，并在真实public boundary直接覆盖slash与dot-segment identity。此次确认不授权stage、commit、push、database/binding cutover、旧数据删除或其它Git/runtime写操作。
- 2026-08-30：用户另行明确授权提交Increment 9完整accepted scope；v0.3 source、tests、Plugin consumer、Fix Task 1–4、acceptance文档与经验回收指南由同一版本化commit进入`main`。该授权不覆盖push、database/binding cutover、旧数据删除、detached v0.2 launcher或其它Git/runtime写操作；active project Room继续使用v0.2 binding。
- 2026-08-30：用户另行明确批准active project runtime的v0.3 database/binding cutover。project-local八字段runtime binding现指向`room-v0.3.sqlite`与Room `room-ebfafef2-f0e9-4fb1-9eef-ac5adef7445f`，project MCP使用framed participant route `p~codex-app`；旧`room.sqlite`通过`archived_database_path`只读保留。v0.3 service、binding和Room identity已通过project-scoped MCP验证一致，Room为`DISCUSSION`且尚无Task/Run/Review/Question。本次授权不包含push、旧数据删除、commit或Claude Run。
- 2026-08-30：用户确认Stage 2三项Architecture Decision：fresh `0.4-design` database/new Room与archive array；Stage 2只交付one-shot multi-Run Execution Core，Scheduler/worktree creation留到Stage 3；guidance只在下一RunAttempt消费。用户授权同步Project Rules与相关Current文档，明确这些内容仍是Draft/Proposed而非Current implementation。Increment 10完整Contract未确认，未授权Task submission、Claude Run、stage、commit、push、database/binding cutover或旧数据删除。
- 2026-08-30：用户明确确认Increment 10完整Task Contract，Contract更新为`Accepted`、`confirmed_by_user=true`。本次确认不授权Git写操作、Task submission或Claude Run，因此Current v0.3 Room继续为`DISCUSSION`且无Task，尚未进入durable `PLAN_READY`；v0.4 cutover、旧数据删除、push与其它操作仍是独立门禁。
- 2026-08-30：用户授权仅把Current v0.3 Room依次推进到`ARCHITECTURE_REVIEW`与`WAITING_FOR_USER_CONFIRMATION`；durable Event sequence 2/3确认两次transition，waiting actor=`user`，Task/Run/Review/Question仍为空。用户随后授权处理dirty worktree并形成clean planning baseline；`room_submit_task`、Claude Run、push、v0.4 cutover与旧数据删除继续分别授权。
- 2026-08-30：用户随后分别授权并完成Increment 10 `room_submit_task`及同一Task lineage的one-shot Runs `run-increment-010-implementation-001`至`-006`。六个Run均已terminal failed：`-001/-003/-005`为`runner_process_lost`，`-002/-004`为`runner_database_locked`，`-006`为`coding_result_invalid`（Claude process exit 0但返回`needs_decision`且未创建正式Room Question）。Current Room=`RUN_FAILED`、waiting actor=`planner`、current Run=`-006`、current Question为空；baseline=`1be0cc2e37aebf69234276ff88c5c95eb92f6495`，Git evidence为0 staged、23 unstaged、2 untracked。用户确认这些dirty paths属于Increment 10同一Task lineage的partial implementation，后续retry按本文件第9节保留并续作；本次文档授权不包含下一次`room_retry_run`、Claude Run、stage、commit、push或其它Git写操作。
- 2026-08-31：continuation Run `run-increment-010-implementation-007`成功结算后，Review `review-increment-010-codex-001`以独立双Worker/SQLite probe、public settlement probe与snapshot probe确认三项finding，Decision=`changes_requested`，Room进入`REVIEW_DISCUSSION`。用户确认全部finding、最小方向与[Increment 10 Fix Task 1](./docs/documents/INCREMENT_10_FIX_TASK_1.md)全文；Contract转为`Accepted`、`confirmed_by_user=true`并经`room_submit_task`创建成功，Event sequence=`321217`，Room=`FIX_PLAN_READY`、waiting actor=`executor`。Fix Run、Git写操作与v0.4 cutover仍未授权。
- 2026-08-31：Fix Runs `run-increment-010-fix-003`与`run-increment-010-fix-004`的Claude process均exit 0，但因此前未成功创建Room Question，v0.3 retry continuation未获得聊天中的用户答案，两次都重复返回`status=needs_decision`并以`coding_result_invalid`终结；`-004`后的durable Room=`RUN_FAILED`、waiting actor=`planner`、current Question为空、cursor=`446434`，Git evidence为0 staged、37 unstaged、6 untracked。用户明确选择方案1并授权写入权威文档：result-carrying `needs_decision`按同Task result/`failure=null`校验，existing pause-failure form保留`result=null`/non-null `failure`；Executor与transition table不变。下一次`room_retry_run`与fresh Run ID仍需独立授权。
- 2026-08-31：Fix Run `run-increment-010-fix-005`成功结算后，Fix Review `review-increment-010-codex-002`独立确认writer reservation与latest Task snapshot两项修复正确；typecheck、focused 9/9、62/62、60/60、99/99及full 352/352均通过。但public `settleRunAttempt` probe证明`needs_decision + result=null + failure=null`仍被接受并推进Attempt/Run、追加terminal Event，违反用户确认的方案1与invalid-payload零写约束。Finding `inc10-fix1-r1-empty-needs-decision-evidence`=`high`，Decision=`changes_requested`；Room进入`REVIEW_DISCUSSION`。用户确认finding与最小方案前不生成或提交下一Fix Task，不启动Claude、不accept、不执行Git写操作或v0.4 cutover。
- 2026-08-31：用户确认`inc10-fix1-r1-empty-needs-decision-evidence`及最小方向：仅拒绝effective `needs_decision`的`result=null + failure=null`，保留同Task result-carrying与non-null failure pause两种legal shape，并增加public rollback regression；不改schema、transition、Executor、repository或其它Fix 1行为。Codex已创建Draft [Increment 10 Fix Task 2](./docs/documents/INCREMENT_10_FIX_TASK_2.md)并登记文档索引；全文尚未确认，未调用`room_submit_task`或启动Claude。
- 2026-08-31：用户随后确认Increment 10 Fix Task 2全文；Contract转为`Accepted`、`confirmed_by_user=true`。此次确认不授权`room_submit_task`、fresh continuation Run、Claude、stage、commit、push或v0.4 cutover；Room保持`REVIEW_DISCUSSION`。
- 2026-08-31：用户随后分别授权Fix Task 2 `room_submit_task`与one-shot Run `run-increment-010-fix-006`。Run以process exit 0、Coding Result `completed`成功结算并进入`REVIEW_REQUIRED`；Fix只修改`src/room/room-service.ts`与`tests/room-service.test.ts`，拒绝effective `needs_decision`的`result=null + failure=null`，保留result-carrying、pause-failure与cancel-wins语义。Fix Review `review-increment-010-codex-003`无finding、Decision=`approved`；Codex独立验证typecheck、room-service 63/63、claude-runner 51/51、scope 1/1与full 353/353全部通过。Room进入`REVIEW_DISCUSSION`等待用户最终接受；未执行stage、commit、push、v0.4 cutover或旧database删除。
- 2026-08-31：用户明确最终接受Review `review-increment-010-codex-003`与Increment 10；`room_accept_review`把durable Room推进到`ACCEPTED`，无finding或open question。Fix验收经验回收新增union-shaped evidence规则：必须显式排除empty/overlap形态，并分别验证每个合法分支、effective-target顺序与完整rollback。该确认不授权stage、commit、push、v0.4 cutover或旧database删除。
- 2026-08-31：用户提出“删除项目里所有哈希校验”。盘点确认project-owned runtime中唯一以哈希改变行为的是Git `HEAD`/`baseline_head`冻结与相等性校验；npm lockfile integrity、URL fragment、UUID与历史commit IDs不是同类。Codex创建Draft [哈希校验删除规划](./docs/documents/HASH_VALIDATION_REMOVAL_PLAN.md)，等待用户确认范围与失去HEAD/branch drift自动拒绝的取舍；未创建或提交Task，未启动Run或执行Git/runtime写操作。
- 2026-08-31：用户确认哈希删除范围、失去HEAD/branch drift自动拒绝的取舍，并指定Increment 11 Coding路由为独立Codex task `gpt-5.6-sol`/`medium`。Architecture Review=`Approved`、ADR-0005=`Accepted`，完整Task Contract为`Draft`等待全文确认；Agent Room terminal Room不复用，未创建Codex task、未启动Claude/Run或执行Git/runtime写操作。
- 2026-08-31：用户确认Increment 11完整Task Contract；Contract转为`Accepted`、`confirmed_by_user=true`，阶段进入`PLAN_READY`。本次确认不授权stage/commit、Codex task创建、Claude/Room Run、runtime cutover、database处理或push。
- 2026-08-31：Increment 11独立Codex task从exact baseline `c449f40aebe3ff018610c59f34782a698463f907`完成Coding。Review `review-increment-011-codex-001`确认baseline-free production与active Plugin行为正确、typecheck及353/353 tests通过，但invalid public-path的完整durable snapshot/零process-artifact/combined dirty/pre-claim evidence不完整，且Current入口文档仍停留在`PLAN_READY`；Decision=`changes_requested`。用户确认两项finding与test/documentation-only最小方案，[Increment 11 Fix Task 1](./docs/documents/INCREMENT_11_FIX_TASK_1.md)转为`Accepted`并已完整内联路由到原Coding task `01a05806-a6df-7301-a538-33888011241b`，model=`gpt-5.6-sol`、reasoning effort=`medium`，阶段=`CODING`；未创建新task，未授权Git写操作、runtime cutover、Claude或Agent Room Task/Run。
- 2026-09-01：Increment 11 Fix Review `review-increment-011-codex-002`未发现finding，Decision=`approved`。四类confirmed invalid path均通过public boundary证明完整durable snapshot不变，适用路径同时证明零process/artifact；Current文档已消除待派发陈述。Codex独立验证residual scan零命中、typecheck、focused 150/150与full 355/355通过，阶段进入`REVIEW_DISCUSSION`等待用户最终接受；未执行Git写操作或v0.4 cutover。
- 2026-09-01：用户明确最终接受Increment 11 Implementation、Fix Task 1与Review `review-increment-011-codex-002`；阶段进入`ACCEPTED`。Fix经验回收确认既有public-boundary完整snapshot与零process/artifact规则已完整覆盖，无新增可复用指南规则。本次确认不授权stage、commit、push、worktree/branch管理或v0.4 runtime/database/binding cutover。用户指定下一Coding task继续使用`gpt-5.6-sol`/`medium`；该路由只在Stage 3 Architecture Review、完整Accepted Contract、clean exact baseline与task创建授权全部满足后生效。
- 2026-09-01：Codex完成Draft [Stage 3 Architecture Review](./docs/documents/STAGE_3_DAG_CONTROL_PLANE_ARCHITECTURE_REVIEW.md)与Proposed [ADR-0006](./docs/documents/ADR/0006-stage-3-dag-control-plane-and-git-controller.md)。推荐复用accepted Stage 2 Execution Core，以immutable Plan revision + Approval、one-shot reconcile Scheduler、structured write scope和preview-confirm-execute Git Controller形成控制面；推荐先版本化v0.4 candidate但保持v0.3 active、Stage 3使用fresh `0.5-design`并最终单次cutover，且拆分Graph/Scheduler与Git Controller两个Increment。三项关键决定等待用户确认；尚无Task Contract，未创建Coding task、执行Git写入或cutover。
- 2026-09-01：用户确认Stage 3 Architecture Review三项推荐决定：先版本化accepted v0.4 source但不cutover、Stage 3使用fresh `0.5-design`并整体完成后单次cutover；Increment 12交付Graph/Approval/Scheduler + `per_task`且零Git write，Increment 13交付Git Controller + `integration_only`；Git Controller首版只允许`create_worktree|commit_paths|integrate_fast_forward`。Review提升为`Approved`、ADR-0006提升为`Accepted`，新增Draft [Increment 12 Contract](./docs/documents/INCREMENT_12_TASK_CONTRACT.md)等待全文确认；未创建Coding task或执行Git/runtime写操作。
- 2026-09-01：用户明确确认[Increment 12完整Contract](./docs/documents/INCREMENT_12_TASK_CONTRACT.md)；Contract转为`Accepted`、`confirmed_by_user=true`，阶段进入`PLAN_READY`。本次确认不授权stage、commit、push、branch/worktree、独立Codex task创建、Claude/Agent Room Run、runtime/database/binding cutover或旧database处理。
- 2026-09-01：用户另行授权把Increment 10/11 accepted candidate及Stage 3/Increment 12 planning文档提交到`main`形成clean baseline。本次版本化提交包含已Review的baseline-free source/tests/Plugin、Accepted Fix Contract与规划文档；不包含push、runtime/database/binding cutover、旧database处理或独立Coding task创建。
- 2026-09-01：Increment 12 Fix Review `review-increment-012-codex-002`确认五项代码finding与原provenance更正的生产行为已闭合，独立typecheck、focused 98/98 + 54/54 + 38/38及full 373/373全部通过；但`tests/plan-scheduler.test.ts`未以完整public snapshot证明stale revision、concurrency loser与blocked acceptance的零写，`tests/room-mcp.test.ts`未逐实体覆盖Revision/Approval replacement后frozen-success及disabled/re-enable，且本次Coding Result `changed_files`遗漏实际Fix路径。Decision=`changes_requested`，阶段进入`REVIEW_DISCUSSION`；用户确认方案前不生成Fix Task、不accept、不执行Git/runtime写操作。
- 2026-09-01：用户确认Review `review-increment-012-codex-002`三项finding与最小test/result-only方案。Codex创建Draft [Increment 12 Fix Task 2](./docs/documents/INCREMENT_12_FIX_TASK_2.md)，冻结完整public snapshot rollback、Plan/Revision/Approval逐实体MCP retry matrix与Fix Task 1 Coding Result provenance correction；全文尚未确认，阶段=`WAITING_FOR_USER_CONFIRMATION`，未修改candidate、派发task或执行Git/runtime写操作。
- 2026-09-02：用户确认[Increment 12 Fix Task 2](./docs/documents/INCREMENT_12_FIX_TASK_2.md)全文；Contract转为`Accepted`、`confirmed_by_user=true`，阶段=`FIX_PLAN_READY`。用户选择自行人工派发；Codex未创建task、启动Agent、修改candidate或执行Git/runtime写操作。
- 2026-09-02：Fix Review 3 `review-increment-012-codex-003`确认Fix Task 2两份test闭合完整public snapshot、single-winner control与Plan/Revision/Approval public MCP matrix；typecheck、focused 98/98 + 54/54 + 38/38及full 373/373均通过。唯一finding `inc12-fr3-development-log-provenance`：candidate Development Log的无日期阻塞/下一步仍指向Fix Task 1，且Fix Task 1验证段落混入Fix Task 2 evidence。Decision=`changes_requested`，阶段=`REVIEW_DISCUSSION`；用户确认前不生成下一Fix Task或执行Git/runtime写操作。
- 2026-09-02：用户确认`inc12-fr3-development-log-provenance`与最窄documentation-only方案。Codex创建Draft [Increment 12 Fix Task 3](./docs/documents/INCREMENT_12_FIX_TASK_3.md)，唯一candidate scope为`docs/documents/DEVELOPMENT_LOG.md`的Fix 1/2 verification provenance及current next-step；全文尚未确认，阶段=`WAITING_FOR_USER_CONFIRMATION`，未修改candidate、派发task或执行Git/runtime写操作。
- 2026-09-02：用户明确确认[Increment 12 Fix Task 3](./docs/documents/INCREMENT_12_FIX_TASK_3.md)全文并授权派发；Contract转为`Accepted`、`confirmed_by_user=true`。Accepted Contract已完整发送到原candidate Codex task `01a05c82-6144-7911-b2fc-31cc8ba3cfd5`，使用`gpt-5.6-luna`/`max`，阶段=`CODING`；未创建新task/worktree，Git写入与runtime cutover仍未授权。
- 2026-09-02：Fix Review 4 `review-increment-012-codex-004`确认Fix Task 3已正确分离Fix 1/2 verification provenance并更新current next-step；但candidate Development Log存在九个失效的Fix 1/2/3 Contract相对链接，违反Accepted Contract的relative-link验收条件，且completed task未返回包含`summary`、`changed_files`、acceptance/verification、deviations与questions的结构化Coding Result。Decision=`changes_requested`，阶段=`REVIEW_DISCUSSION`；用户确认finding与方案前不生成或派发下一Fix Task，不修改candidate或执行Git/runtime写操作。
- 2026-09-02：用户确认Review 4两项finding、最窄方案与`gpt-5.6-luna`/`max`执行路由。Codex创建Draft [Increment 12 Fix Task 4](./docs/documents/INCREMENT_12_FIX_TASK_4.md)，范围仅为candidate Development Log九个失效链接、Fix 4/Review 5 current事实及原task结构化assistant final；全文尚未确认，阶段=`WAITING_FOR_USER_CONFIRMATION`，未派发、修改candidate或执行Git/runtime写操作。
- 2026-09-02：用户明确确认[Increment 12 Fix Task 4](./docs/documents/INCREMENT_12_FIX_TASK_4.md)全文并授权派发，同时要求启用只读subagent核对门禁。Contract转为`Accepted`、`confirmed_by_user=true`，阶段=`FIX_PLAN_READY`；计划复用原candidate task、`gpt-5.6-luna`/`max`，未授权Git/runtime写操作。
- 2026-09-02：只读subagent与主Codex均确认Fix Task 4派发门禁通过；完整Accepted Contract已内联发送到原candidate task `01a05c82-6144-7911-b2fc-31cc8ba3cfd5`，使用`gpt-5.6-luna`/`max`，阶段=`CODING`。未创建新task/worktree，Git/runtime写入仍未授权。
- 2026-09-02：Fix Review 5 `review-increment-012-codex-005`确认candidate Development Log的104个relative links全部可解析、missing count为0、九个Fix 1/2/3 Contract link无残留，exact detached HEAD与0 staged边界成立；但原candidate task最新completed turn的`latestAssistantMessage=null`，用户handoff仍只含task/status/stage/baseline/head，未闭合Accepted Fix Task 4要求的结构化Coding Result，且candidate日志错误声称assistant final已返回。Finding=`inc12-fr5-structured-coding-result-still-missing`（low），Decision=`changes_requested`，阶段=`REVIEW_DISCUSSION`；用户确认方案前不派发下一Fix或执行Git/runtime写操作。
- 2026-09-02：用户确认`inc12-fr5-structured-coding-result-still-missing`与最窄documentation/result-only方案。Codex创建Draft [Increment 12 Fix Task 5](./docs/documents/INCREMENT_12_FIX_TASK_5.md)，范围仅为candidate Development Log的错误result事实、Fix 5/Review 6 lifecycle及原task真实结构化assistant final；全文尚未确认，阶段=`WAITING_FOR_USER_CONFIRMATION`，未派发、修改candidate或执行Git/runtime写操作。
- 2026-09-02：用户明确确认[Increment 12 Fix Task 5](./docs/documents/INCREMENT_12_FIX_TASK_5.md)完整Contract并授权派发到原candidate task，指定model=`gpt-5.6-luna`、reasoning effort=`max`。Contract转为`Accepted`、`confirmed_by_user=true`，阶段=`FIX_PLAN_READY`；派发前继续核对candidate exact HEAD、detached、0 staged、relative-link zero-missing与单文件scope，未授权Git/runtime写操作。
- 2026-09-02：Fix Task 5派发门禁重新读取原candidate task，确认最新completed turn `01a06042-85df-7961-9d11-b9c6a010b041`存在`phase=final_answer`的结构化Fix Task 4 Coding Result，且包含Contract要求的全部字段。该证据推翻Review 5唯一finding的前提；Decision更正为`approved`，Fix Task 5=`Superseded / Not Dispatched`，阶段=`REVIEW_DISCUSSION`并等待用户最终接受。candidate未修改，未调用`gpt-5.6-luna`，未执行Git/runtime写操作。
- 2026-09-02：用户明确最终接受Increment 12 candidate与更正后的Fix Review 5；阶段进入`ACCEPTED`，无unresolved finding或open question。Fix验收经验回收新增Codex-only规则：result缺失finding必须绑定exact completed turn并在派发前重新读取权威task result，单次summary中的`latestAssistantMessage=null`不得单独证明final不存在。随后用户另行授权版本化完整candidate；accepted implementation、tests、Plugin与最终文档由本次提交进入`main`。未授权push、branch/worktree cleanup或runtime/database/binding写操作。
- 2026-09-02：用户明确开始Increment 13（Git Controller + `integration_only`）规划。live Git为clean `main`、`HEAD=f010c456d8354e3c02d75fc5389cb68265586488`；active binding仍为v0.3，而installed Agent Room workflow要求v0.4，正常Room workflow与setup/cutover均未执行。Codex新增Reviewing [Increment 13 Architecture Review](./docs/documents/INCREMENT_13_GIT_CONTROLLER_ARCHITECTURE_REVIEW.md)，推荐fixed-actor `room:git` one-shot CLI、single fast-forward lineage和独立Codex worktree Coding route；三项等待用户确认，Decision=`needs_discussion`，阶段=`ARCHITECTURE_REVIEW`。
- 2026-09-02：用户确认Increment 13 Architecture Review三项推荐。Review提升为`Approved`；Codex据此创建完整Draft [Increment 13 Task Contract](./docs/documents/INCREMENT_13_TASK_CONTRACT.md)，冻结typed preview/Approval/single execution/unknown settlement、fixed `local-runner` actor、single-lineage `integration_only`及独立Codex worktree Coding route。Contract尚未全文确认，`confirmed_by_user=false`，阶段=`WAITING_FOR_USER_CONFIRMATION`；未创建task、执行GitAction、版本化或runtime/database/binding写操作。
- 2026-09-02：用户明确确认[Increment 13完整Task Contract](./docs/documents/INCREMENT_13_TASK_CONTRACT.md)。Contract提升为`Accepted`、`confirmed_by_user=true`，阶段=`PLAN_READY`；确认不授权Coding task创建、stage/commit/push、GitAction或runtime/database/binding cutover。Active v0.3 binding不满足installed v0.4 workflow，未提交durable Room Task或调用launcher。
- 2026-09-02：Increment 13 Implementation Review `review-increment-013-codex-001`确认三项implementation finding与一项verification finding，Decision=`changes_requested`。用户确认四项finding及最小方向；Codex创建Accepted [Increment 13 Fix Task 1](./docs/documents/INCREMENT_13_FIX_TASK_1.md)。派发门禁确认原candidate exact HEAD、detached、0 staged与finding未漂移后，完整Contract已发送到原task，阶段=`CODING`。未执行GitAction、commit/push或runtime/database/binding cutover。
- 2026-09-02：Increment 13 Fix Review 2 `review-increment-013-codex-002`确认三项production修复闭合；two-connection simultaneous reservation与`failed` preview retry仍缺直接证据，最新completed Fix turn没有结构化assistant final。Decision=`changes_requested`，阶段=`REVIEW_DISCUSSION`；用户确认最小test/result-only方案前不创建或派发下一Fix Task。
- 2026-09-02：用户确认Fix Review 2三项finding与最小方案。Codex创建Draft [Increment 13 Fix Task 2](./docs/documents/INCREMENT_13_FIX_TASK_2.md)，范围仅为Worker-based simultaneous reservation、`failed` same-ID preview retry、candidate Development Log与原task结构化assistant final；Contract全文尚未确认，阶段=`WAITING_FOR_USER_CONFIRMATION`，未修改candidate或派发。
- 2026-09-02：用户明确确认[Increment 13 Fix Task 2](./docs/documents/INCREMENT_13_FIX_TASK_2.md)完整Contract；文档转为`Accepted`、`confirmed_by_user=true`，阶段=`FIX_PLAN_READY`。本次确认不自动授权派发；未修改candidate、发送Fix指令或执行Git/runtime写操作。
- 2026-09-02：用户按任务类型矩阵授权派发Increment 13 Fix Task 2；本任务属于regression tests、public-path coverage与证据补全，选择`gpt-5.6-luna` / `max`。原candidate task `01a06171-2d2e-7831-9e77-1a9d4395fdf2`为idle；门禁确认`HEAD=c7b4c2db0095632194940df40b49e0788257f099`、detached、0 staged、两项test evidence与一项Result finding未漂移。完整Accepted Contract已内联发送，阶段=`CODING`；未创建新task/worktree，未执行GitAction、commit/push或runtime/database/binding写操作。
- 2026-09-02：Increment 13 Fix Review 3 `review-increment-013-codex-003`确认两个Worker/独立SQLite connections在`super.reserveGitAction`前同时竞争并精确产生一个mutation、一个success与一个`git_action_already_terminal` loser；race与single-execute control的完整public snapshot等价。`commit-a-failed` same-ID/same-content preview retry返回`created=false`，零process、零Event且完整snapshot不变；本次assistant final字段完整，并如实保留Fix Task 1历史final缺失。无finding，Decision=`approved`，阶段=`REVIEW_DISCUSSION`；等待用户最终接受，未执行Git/runtime写操作。
- 2026-09-02：用户明确最终接受Increment 13 Implementation、Fix Task 1–2与Fix Review 3，阶段进入`ACCEPTED`，无unresolved finding或open question。Fix经验回收新增“并发reservation证据必须在production transaction前对齐独立连接，并与single-execution control比较完整public snapshot”规则；既有指南已覆盖terminal retry与Result provenance，不重复扩写。接受本身不授权commit、push、真实GitAction或runtime/database/binding cutover。
- 2026-09-02：用户随后明确授权把完整accepted Increment 13 source、tests、Plugin与最终权威文档版本化到`main`，commit message=`feat(git): add controlled Git integration workflow`。本授权不包含push、真实项目GitAction、Plugin reinstall、candidate worktree cleanup或runtime/database/binding cutover。
- 2026-09-02：上述完整accepted scope已形成commit `004969190215e354fc468e824d9c5e798f01e4fc`。用户随后独立授权将clean detached launcher checkout到该accepted commit，并执行active v0.3→v0.5 cutover。setup helper生成`protocol_version=0.5-design`、database=`room-v0.5.sqlite`、Room `room-3f6e8b05-4c60-4114-a09a-0ab44f0ccca0`并复用port `59665`；v0.2/v0.3 database按序只读归档且长度/SHA-256不变。reload continuation通过project-scoped MCP创建并读取同一Room，state=`DISCUSSION`、planning waiting actor=`planner`、cursor=`1`且execution entities为空。未执行push、真实项目GitAction、Plugin reinstall、candidate worktree cleanup或旧database删除。
- 2026-09-02：用户随后明确授权把Increment 13规划文档与Accepted Contract提交到`main`形成clean baseline，并从该baseline创建独立Codex worktree task，model=`gpt-5.6-sol`、reasoning effort=`medium`。提交scope只含规划文档；GitAction、push、runtime/database/binding cutover与旧database处理仍未授权。
- 2026-09-03：用户明确确认Increment 14完整Contract并授权独立Codex Coding与GitHub分支交付。实际`origin/main`=`ee3cd96315ed0c14220692c3bc92d6ecaff7430a`且起始工作区clean；新分支`codex/increment-14-validation-boundary-ee3cd96`完成candidate实现、文档与验证，阶段=`REVIEW_REQUIRED`。未修改或push `main`，未执行merge/rebase/amend/force-push/reset/clean/stash。
- 2026-09-03：Increment 14 Review确认stdout progress callback异常结算链与same-attempt真实并发terminal evidence两项finding。用户明确确认Fix Task 1并授权从原candidate commit `41496df6b37d40d871460f1164dacaade37e1c3d`创建`codex/increment-14-fix-1-progress-settlement-41496df`、形成单一Fix commit并首次push；Fix candidate保持`REVIEW_REQUIRED`，不修改`main`、原candidate分支或active runtime。

## 14. 当前阶段

Increment 14=`accepted_and_integrated`，final commit=`d5827a052190d63fb2fbbd9fbd970ba9db92ed64`。Increment 15 Revision 2=`Accepted / PLAN_READY`、`confirmed_by_user=true`；当前一次性Bootstrap从该exact commit创建Stage branch。Room active v0.5 runtime继续存在且不因新项目开发控制面改变。
