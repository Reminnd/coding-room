# Increment 7 Task Contract — Codex Plugin 与多项目独立 Runtime

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（仅在完整 Contract 获用户确认、状态改为 `Accepted` 且 dispatch gate 满足后） |
| 创建日期 | 2026-08-27 |
| 用户确认日期 | 2026-08-27；用户确认完整 Contract；Review 1 后确认不豁免 baseline 违约，选择严格重执行并纳入两项最小修正 |
| Parent goal | Increment 7 — Codex Packaging |
| Planning main HEAD | `ca10034f0332ff1eb5b2410dbc5c0cf19ce894cd` |
| Dispatch baseline | 严格重执行；首次candidate已隔离，待Accepted/review文档形成clean `main`后从live Git读取exact HEAD |
| 评审目标 | 安装一次的 Agent Room Plugin、每项目独立 MCP/runtime 配置、Codex + `auto_review` one-shot `room:run` 与跨项目并行隔离 |

## 1. Accepted 结论与授权边界

用户已于2026-08-27确认以下Architecture Review结论：`room:run`继续是one-shot operator-authorized boundary；Increment 7 Plugin workflow固定由Codex执行，Codex host内部审批模式固定为UI“帮我批准”（`approvals_reviewer=auto_review`），不再把operator直接执行列为Plugin正常路径或fallback；Agent Room Plugin只共享通用Skill，Project A、Project B分别保存自己的port、database与project path；Increment 7采用“安装一次的Agent Room Plugin + 每个项目独立的MCP/runtime配置”。用户同时确认不同项目可使用独立Room、worktree与Claude process并行运行，同一Room内多个parallel Claude Run继续不支持。

以下YAML将上述架构决定收敛为可实现、可测试的完整Contract。用户已确认项目本地配置文件格式、Plugin布局、测试边界、manual smoke责任及所有requirements/acceptance criteria必须全部完成；文档状态为`Accepted`，项目阶段进入`PLAN_READY`。用户选择暂时人工派发本Implementation Task；该一次性delivery方式不改变目标Plugin workflow中由Codex + `auto_review`执行`room:run`的产品语义。Accepted documentation形成clean exact baseline前不得实际派发，Implementation通过Review、获用户接受并进入版本化`main`前不得把Increment 7写成Current capability。

```yaml
task_id: increment-007-codex-plugin-multi-project
room_id: agent-room-main
type: implementation
parent_task_id: null
based_on_review_id: null

background: >
  Increment 6 已在版本化 main 交付 actor-scoped Room MCP、file-backed SQLite、Status CLI、
  one-shot room:run、failure retry 与完整 fake-process E2E。当前 Codex 若要在多个无关项目使用
  Agent Room，仍需依赖人工记忆 MCP endpoint、runtime root、database、project path、Room 与命令；
  也没有可安装、可发现的通用 Skill。项目间隔离可以由现有“一项目一 Room service/database/
  worktree/process”边界表达，不需要把同一 Room 扩展为 parallel Runs。

goal: >
  交付可安装一次并供多个无关项目复用的 Agent Room Plugin：Plugin 共享通用 Codex Skill，
  每个目标项目以独立、local-only 的 MCP/runtime 配置绑定自己的 loopback port、SQLite database、
  project path、Room 与 Agent Room runtime root；Skill 严格按 Room state 工作，并固定由 Codex 在
  approvals_reviewer=auto_review 的 host approval policy 下发起 room:run，保持 one-shot authorization boundary，
  同时用两个独立临时项目证明跨项目并行且无状态、Git、artifact 或 Event 串扰。

requirements:
  - 在 repository 内新增 plugins/agent-room/，至少包含 .codex-plugin/plugin.json 与 skills/agent-room/SKILL.md；manifest 使用 Codex Plugin 当前要求的有效最小字段，不增加与本目标无关的 hook、App、MCP bundle、asset 或 dependency。
  - 在 .agents/plugins/marketplace.json 登记 repository-local marketplace entry，source 指向 plugins/agent-room/；该 entry 用于开发、验证和安装，不复制 Plugin 内容或建立第二份 Skill authority。
  - shared Plugin 只打包通用 Skill，不在 Plugin .mcp.json、Skill 或 marketplace 中硬编码 Project A/B 的 port、database、project path、Room ID、host path 或 active approval rule。
  - 每个目标项目使用 project-scoped .codex/config.toml 配置 [mcp_servers.agent_room] 与独立 http://127.0.0.1:<port>/mcp/codex URL；模板不得写入本 Agent Room repository 的 active .codex/config.toml，也不得覆盖目标项目已有 Codex 配置。
  - 每个目标项目使用被 Git 忽略的 .agent-room/runtime.json 保存 exact local runtime values：agent_room_root、database_path、project_path、port、room_id。路径为该 host 的 absolute path；project_path 必须对应配置所在项目，MCP URL port 必须与 runtime.json port 一致。
  - Plugin 提供最小 project setup reference/template，说明如何创建 .codex/config.toml entry、.agent-room/runtime.json 与目标项目 .gitignore 条目；模板只包含 placeholder，不包含开发机真实路径、secret 或可直接污染其它项目的默认值。
  - Skill 启动时先读取项目 local runtime config，再通过 project-scoped agent_room MCP 调用 room_get_state；missing/invalid config、endpoint/port mismatch、project path mismatch或Room mismatch时停止受影响动作并报告，不猜测其它项目配置。
  - Skill 按 Current Room protocol推进：创建/读取Room、进入Architecture Review、请求用户确认、提交已确认Task、读取Review/Question/Run状态，以及只在现有public MCP tool与当前合法state允许时提交相应command；不得绕过用户确认或把Codex变成business Coding actor。
  - 首次Implementation的exact baseline只采用首次成功room_submit_task响应中的non-null observed_baseline_head；Skill必须在同一workflow step保存到待执行/待复制的exact command。idempotent submit retry返回null或后续turn只读到PLAN_READY时，不得用live HEAD、Event time或其它推断替代；原值不可获得时停止并报告needs_decision。Decision/Fix/retry继续省略caller baseline并由persisted source Run拥有。
  - 当current state需要Coding且存在已确认Task时，Skill只能构造一个包含exact agent_room_root/database/project/task/run/MCP endpoint与所需baseline的one-shot room:run invocation。launcher必须以已校验的agent_room_root作为cwd，或使用等价的`npm --prefix <AGENT_ROOM_ROOT>`定位Agent Room package script；不得在普通目标项目cwd中查找目标项目自己的`room:run` script。一次授权只对应一次process invocation和一个Run，不得循环、轮询后续Run、自动retry、自动提交Fix或自动接受Review。
  - Skill为每次planned invocation选择一个在该Room内尚不存在的non-empty run_id，并在展示、prompt与实际执行之间保持不变。approval结果或process outcome不确定时，必须先room_get_state确认该run_id/current Run是否已被claim，再决定报告或请求operator处理；不得静默生成第二个run_id重试。
  - Plugin workflow的room:run caller固定为Codex。执行前Skill必须把host内部审批前置条件写明为UI“帮我批准”（approvals_reviewer=auto_review）；eligible escalation由auto_review审查，通过时Codex执行一次，拒绝时停止并报告，不转为operator direct run、不静默重试或生成第二个run_id。
  - Plugin、Skill、template与安装流程不得创建、修改、放宽或规避host approval/sandbox/rules，不提供active prefix_rule写入步骤，也不得推荐danger-full-access或任意shell/npm allow rule。审批模式不等于无条件allow，manual smoke必须保留auto_review可能拒绝的真实结果。
  - room:serve继续由operator为每个项目分别启动；Project A与B使用不同loopback port、database、project path、Room ID、worktree和artifact tree。Plugin不启动daemon、service manager或background monitor。
  - room:run返回后，Skill重新调用room_get_state并依据durable SQLite snapshot报告REVIEW_REQUIRED、NEEDS_DECISION、RUN_FAILED或其它实际状态；process stdout、自述或命令exit不能替代Room authority。
  - 增加Plugin packaging/config direct regression，验证manifest、marketplace source、单一Skill authority、placeholder template、无project-specific硬编码、无active permission mutation及required workflow boundary；必须直接证明launcher使用agent_room_root定位Agent Room package script，并且目标项目自身没有`room:run` script时不会错误地从目标项目cwd执行。
  - 增加two-project concurrent E2E：创建两个独立temporary Git repositories、两个file-backed databases、两个Room services与不同ephemeral loopback ports，通过真实MCP/runtime application boundary与deterministic fake Claude process使Project A和B的one-shot Runs在时间上实际重叠。
  - two-project E2E必须断言每个Room只引用本项目Task/Run/Review/Question/Event：至少直接比较cross-database Task lookup与snapshot current Task reference，并通过现有public MCP/Runner lifecycle创建或读取各项目自己的Review与Question后验证不交叉；database与cursor独立，Git HEAD/status与changes不交叉，artifact_refs解析到各自repository，process args/MCP endpoint/project cwd无串扰；每个Room仍不得同时claim第二个active Run。
  - 自动化测试不得启动、付费或依赖真实Claude、外部network、固定port、operator全局Codex settings或已安装personal Plugin；使用temporary owner directory并在finally关闭server/database/process handles与清理fixture。
  - 更新scope regression，使新增Plugin/marketplace/templates/tests是exact allowlist；不得放宽为任意plugin file、MCP server、source module、package script或dependency。
  - Codex已在本Accepted documentation baseline同步PROJECT_RULES与文档中心。Claude只同步scope/documentation_updates列出的Architecture、ROOM_PROTOCOL、MVP Plan、Operations、Development Log与ADR-0002 candidate事实；Review、用户接受及版本化提交前不得把Plugin或跨项目runtime写成Current implementation，也不得修改受保护的PROJECT_RULES或文档索引。

non_goals:
  - 同一Room内parallel Runs、parallel Task claim、queue、scheduler、daemon、automatic wakeup、automatic retry或background polling。
  - Plugin内嵌project-specific MCP endpoint、database、project path、Room ID、active approval policy或secret。
  - operator direct room:run作为Plugin正常路径或approval rejection fallback；Current CLI本身的人工可调用性不在本Task删除。
  - 自动创建、修改或放宽Codex host approval、sandbox、rules或trusted-project设置；danger-full-access或任意shell/npm allow rule。
  - 新Room state、transition、entity、schema/table/migration、Event type、error code、protocol version、MCP tool、Runner status或dependency。
  - 修改RoomService、Runner、MCP、CLI production semantics；若cross-project E2E暴露真实production defect，返回needs_decision而不是静默扩展本Task。
  - remote MCP、authentication、TLS、多用户、distributed locking、shared database、worktree manager、Plugin registry publishing或跨用户自动分发。
  - 自动stage、commit、push、merge、rebase、reset、clean、branch/worktree创建/切换或database初始化；Claude Coding与自动化测试不得启动真实paid Claude。Contract指定的post-Coding manual Codex Desktop smoke是独立验收步骤，只能由Codex在auto_review通过时执行一次。

architecture_decisions:
  - Plugin是Codex侧workflow packaging，不是Room runtime或第二状态权威；SQLite、Git、Runner process/session ownership与Codex explicit pull保持不变。
  - shared Skill与project-local binding分离：Plugin只表达稳定workflow，每项目.codex/config.toml选择MCP endpoint，.agent-room/runtime.json保存one-shot command所需local values。
  - room:run authorization由operator配置的host policy拥有；Increment 7 Plugin workflow caller固定为Codex，内部审批模式固定为“帮我批准”（approvals_reviewer=auto_review）。每次调用仍是one-shot，Room protocol、actor与state transition不因approval reviewer变化。
  - auto_review outcome是执行环境事实，不写入Room entity/Event，不由Plugin维护；通过只授权本次invocation，拒绝不创建Run、不推进Room且不回退为operator direct run。
  - 多项目并行通过多个独立Room service/database/worktree/Claude process实现；同一Room single-active-Run invariant保持不变。
  - shared Plugin不提供静态.mcp.json，因为单一静态endpoint不能正确表达多个项目各自的port与database binding。

scope:
  - plugins/agent-room/.codex-plugin/plugin.json
  - plugins/agent-room/skills/agent-room/SKILL.md及最少必要references/templates
  - .agents/plugins/marketplace.json
  - tests/plugin-packaging.test.ts
  - tests/multi-project-e2e.test.ts
  - tests/scope.test.ts的Increment 7 exact boundary更新
  - docs/documents/ARCHITECTURE.md、ROOM_PROTOCOL.md、MVP_PLAN.md、OPERATIONS.md、DEVELOPMENT_LOG.md、ADR/0002-agent-integration-lifecycle.md的candidate同步
  - 不修改src/、package.json、package-lock.json或现有production configuration；发现需要时返回needs_decision

constraints:
  - Coding必须从包含Accepted Contract与同步文档的clean exact main baseline开始；Claude不得执行Git write、commit、push、branch/worktree、reset、clean或cleanup。
  - Plugin/Skill指令必须保持Codex规划、Review和文档职责，不授权Codex写business code/test/config或绕过Task/Review用户门禁。
  - project-local runtime.json是operator convenience configuration，不复制Room lifecycle、Task Contract、Run、Review、Question、Event、Git evidence或artifact content。
  - config validation只覆盖本项目真实支持的mismatch，不增加hash、fingerprint、migration、compatibility layer、generic config framework或secret manager。
  - 两项目并行测试必须有可观察overlap oracle，不得以两个串行scenario名称或Promise.all外观替代真实重叠；失败后必须能定位是共享global、port/database混用、process/cwd混用或cleanup defect。
  - 只添加解释authority、approval、project binding和cross-project isolation所必需的简体中文说明；code、identifier、command、field与technical term保持English。

acceptance_criteria:
  - repository-local marketplace可定位一个valid Agent Room Plugin；Plugin只有一份authoritative Skill，未包含project-specific endpoint/path/Room或active permission mutation。
  - 两个无关项目可分别用自己的.codex/config.toml与.agent-room/runtime.json解析到不同MCP URL、database、project path、Room和artifact tree，且mismatch在任何room:run invocation前拒绝。
  - Skill固定由Codex发起room:run并明确要求host UI“帮我批准”/approvals_reviewer=auto_review；auto_review通过时至多一次invocation并在返回后重新读取Room，拒绝时零invocation、零Run且只报告结果。
  - Skill不会在未确认Task、错误state、missing config或approval denial时执行room:run，不会自动retry、自动Fix、自动accept或修改host policy。
  - 首次Implementation在同一submission response持有observed_baseline_head时可生成exact command；该值丢失时fail closed且不以live Git代替。Fix/retry无需caller baseline，保持现有source Run authority。
  - Skill生成的exact command从agent_room_root定位Agent Room package script；目标项目不提供`room:run` script时仍能到达正确launcher，且所有path参数按当前host shell安全传递。
  - actual two-project E2E证明A/B Runs时间重叠，Task/current Task、Run、public Review/Question、Event/cursor、Git HEAD/status/change、process args/cwd/MCP endpoint和artifact refs完全隔离；每个Room的second active Run继续被现有guard拒绝。
  - npm run typecheck、Plugin/config focused tests、two-project E2E、scope regression与npm test全部通过，Increment 1–6 lifecycle无回归且direct dependency/package scripts不变。
  - manual Codex Desktop smoke可从local marketplace安装/发现Plugin，在两个trusted target projects分别读取project-scoped agent_room MCP，确认host内部审批模式为UI“帮我批准”/approvals_reviewer=auto_review，并由Codex发起一次room:run；auto_review拒绝或实际run未执行时如实记录，不得报告为passed，也不得转为operator direct run。
  - candidate documentation与实际Plugin layout、project config、approval behavior、multi-project isolation及same-Room parallel non-goal一致；接受前保持candidate/unavailable措辞。

verification:
  - command: node --test "tests/plugin-packaging.test.ts"
    detects: invalid/missing manifest或marketplace source、重复Skill authority、project-specific硬编码、active permission mutation、config template、one-shot workflow drift，或launcher未使用agent_room_root而错误依赖目标项目cwd/package script。
    decision_if_failed: 修复task-owned packaging/reference；不得用更宽allowlist、global config mutation或duplicated Skill绕过。
  - command: node --test "tests/multi-project-e2e.test.ts"
    detects: 两项目并行未真实重叠，或port/database/Room/Git/process/cwd/MCP/artifact/Event发生cross-project串扰及same-Room guard退化。
    decision_if_failed: 先定位fixture还是existing production defect；fixture问题在scope内修复，production语义需要修改则返回needs_decision。
  - command: node --test "tests/scope.test.ts"
    detects: src、dependency、package script、Plugin file或test boundary超出本Contract exact allowlist。
    decision_if_failed: 删除越界实现；若正确实现确需production change或dependency，返回needs_decision。
  - command: npm run typecheck
    detects: 新测试、JSON/config parsing fixture或existing TypeScript public contract发生类型漂移。
    decision_if_failed: 修复task-owned类型问题；不得使用any、ts-ignore、skipLibCheck或compatibility wrapper。
  - command: npm test
    detects: Plugin/tests引起Increment 1–6 Protocol/Room/Git/Runner/MCP/CLI regression，或新增测试未纳入全量suite。
    decision_if_failed: 只修复task-owned regression；不得放宽既有assertion或跨scope重构。
  - command: manual Codex Desktop local marketplace/install/discovery and two-project configuration smoke
    detects: repository-local Plugin无法被实际Codex安装/发现、project-scoped MCP不生效、host不是“帮我批准”/auto_review，或Skill没有由Codex发起并按auto_review通过/拒绝结果执行一次或停止。
    decision_if_failed: 记录exact host/version/approval outcome/evidence并修复packaging/instructions；auto_review拒绝或真实room:run未执行时保持pending，不虚报通过且不改用operator direct run。

documentation_updates:
  - path: docs/documents/ARCHITECTURE.md
    expected_change: candidate Plugin/shared Skill/project-local binding、host approval与multi-project topology；接受前不提升Current。
  - path: docs/documents/ROOM_PROTOCOL.md
    expected_change: caller-independent one-shot authorization clarification与independent Room instances；不改变protocol version。
  - path: docs/documents/ADR/0002-agent-integration-lifecycle.md
    expected_change: Accepted Increment 7 design clarification，记录Plugin packaging、project binding、approval ownership与parallel boundary。
  - path: docs/documents/MVP_PLAN.md
    expected_change: Increment 7 confirmed architecture、Accepted scope、acceptance与non-goals。
  - path: docs/documents/OPERATIONS.md
    expected_change: planned install/setup、per-project serve/MCP/runtime config、Codex + auto_review one-shot run与A/B isolation runbook。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 用户确认的architecture inputs、Accepted Contract、planning HEAD、人工派发选择、未授权事项与下一门禁。

question_policy: >
  如果正确实现需要修改src、package scripts/dependencies、Room protocol/state/schema/Event/error、Runner/MCP/CLI
  production semantics、同Room parallel、daemon/automatic wakeup、global host config、超出named post-Coding manual smoke的真实paid Claude、remote/auth、
  Git mutation或未列出的Plugin component，停止受影响工作并返回needs_decision。Plugin manifest的required
  metadata wording、Skill内部章节结构、run_id生成格式、test helper与ephemeral port fixture由Claude按official Codex Plugin
  contract和existing style作最小选择，并在Coding Result记录。

confirmed_by_user: true
created_by: codex
created_at: 2026-08-27T00:00:00Z
```

## 2. 已确认的完整实现细节

用户已确认Plugin/shared Skill、每项目独立配置、one-shot approval ownership以及以下完整实现细节，Implementation不得拆分、省略或以摘要替代：

1. project-local runtime config 固定为 `.agent-room/runtime.json`，字段为 `agent_room_root`、`database_path`、`project_path`、`port`、`room_id`；该文件 local-only 且被目标项目 Git 忽略。
2. shared Plugin 位于 `plugins/agent-room/`，通过 `.agents/plugins/marketplace.json` 做 repository-local 安装验证；不包含静态 `.mcp.json`。
3. Increment 7 默认不修改 `src/`、package scripts或dependency；跨项目并行用两个现有runtime实例和fake process证明。
4. Plugin workflow固定由Codex发起`room:run`，host内部审批模式固定为UI“帮我批准”/`approvals_reviewer=auto_review`；Plugin不安装或修改active approval/rule，拒绝时不回退为operator direct run，manual Codex Desktop smoke与真实Claude执行如实记录。
5. Current Room只在首次成功`room_submit_task`响应返回`observed_baseline_head`，不在snapshot持久化；Accepted方案选择同一workflow step生成exact command，丢失后fail closed，不新增本地baseline mirror或protocol field。
6. Review 1 finding `inc7-r1-runtime-root-not-used` 的confirmed solution：launcher必须由已校验的`agent_room_root`定位；允许最小选择agent_room_root cwd或`npm --prefix`，但不得要求目标项目复制Agent Room `package.json`/script，也不得新增wrapper、dependency或global install。
7. Review 1 finding `inc7-r1-entity-isolation-evidence-incomplete` 的confirmed solution：two-project E2E补齐Task/current Task direct cross-lookup，并通过现有public lifecycle覆盖Review/Question isolation；不得以“数据库文件不同”或只检查Run/Event room_id替代Contract点名entity evidence。

以上内容全部属于本Accepted Contract。任何一项需要越过`scope`、`non_goals`、`constraints`或`question_policy`时，Claude必须返回`needs_decision`，不得以部分完成冒充交付。

## 3. Official capability basis

本Contract于2026-08-27按OpenAI官方文档核对以下边界：

- [Build plugins](https://developers.openai.com/plugins/build/plugins)：Plugin需要`.codex-plugin/plugin.json`，可以只打包Skill，并可通过repository/personal marketplace安装。
- [Build skills](https://learn.chatgpt.com/docs/build-skills)：Skill是可发现、可复用的instruction package；repository与user scope分离。
- [Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp)：trusted project可用`.codex/config.toml`定义project-scoped MCP server，HTTP transport使用`[mcp_servers.<name>]`与`url`。
- [Codex rules](https://learn.chatgpt.com/docs/agent-configuration/rules) 与 [Approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security)：host rules与approval reviewer由operator配置；`approvals_reviewer=auto_review`可以审查eligible escalation但仍可能拒绝，因此“帮我批准”不等于unconditional allow，Plugin不得隐式修改或放宽该配置。

## 4. 人工 Dispatch prerequisite 与完整指令

用户确认暂时由自己人工派发本Implementation Task。这只替代本次Task的delivery transport，不恢复已`Superseded`的通用bootstrap，不授权operator direct `room:run`成为Increment 7 Plugin workflow，也不建立第二套Room authority。首次candidate因未先形成clean documentation baseline而违反本节前置；Review `review-increment-007-codex-001` 后，用户明确选择不豁免该违约、不使用当前mixed Diff作为Fix或后续Review authority，并要求隔离首次candidate后从clean documentation baseline严格重执行本完整Contract。首次candidate已按独立授权隔离至stash object `a341a34df62795fed315ef21eb31831967184203`。

实际派发前必须同时满足：

1. 已满足：用户独立授权后，仅将七个implementation/test/config路径隔离至stash object `a341a34df62795fed315ef21eb31831967184203`：`.agents/plugins/marketplace.json`、`plugins/agent-room/.codex-plugin/plugin.json`、`plugins/agent-room/skills/agent-room/SKILL.md`、`plugins/agent-room/skills/agent-room/references/project-setup.md`、`tests/plugin-packaging.test.ts`、`tests/multi-project-e2e.test.ts`、`tests/scope.test.ts`。文档未被隔离，candidate未删除。
2. 用户已独立授权本次documentation commit；本Accepted Contract与同步Review/权威文档必须进入同一个clean `main` documentation baseline，且不得吸收第一项candidate路径。提交后须确认staged、unstaged与untracked均为空。
3. 从live Git重新记录exact `HEAD`作为dispatch `baseline_head`；planning `HEAD=ca10034f0332ff1eb5b2410dbc5c0cf19ce894cd`不得代替届时baseline。
4. target worktree为`D:\agent\case\codex-claudecode-room`、branch为`main`；改变branch/worktree需要独立用户授权和新的dispatch metadata。
5. 人工客户端必须可靠解析`@docs/documents/INCREMENT_7_TASK_CONTRACT.md`；不能解析时必须直接注入本文件完整内容，不得只发送摘要。
6. Claude必须重新执行完整Contract，不得恢复、应用或依赖首次candidate；必须完成全部requirements、acceptance_criteria、verification与documentation_updates，并按`question_policy`处理越界问题；不得自行执行stage、commit、push、branch/worktree、reset、clean或其它Git写操作。

满足以上前置后，使用以下完整派发指令：

```text
执行 @docs/documents/INCREMENT_7_TASK_CONTRACT.md 中已批准的完整 Implementation Task。以上内容必须全部完成；严格遵守其中的 goal、requirements、non_goals、architecture_decisions、scope、constraints、acceptance_criteria、verification、documentation_updates 和 question_policy，不得拆分、省略、降级或以摘要替代。完成后按 ROOM_PROTOCOL.md 的 Coding Result Contract 返回完整结果。不要执行 stage、commit、push、branch/worktree、reset、clean 或其它 Git 写操作；需要超出 Contract 的产品、架构、scope、dependency、权限或真实 paid Claude 决定时，返回 needs_decision 并停止受影响工作。
```
