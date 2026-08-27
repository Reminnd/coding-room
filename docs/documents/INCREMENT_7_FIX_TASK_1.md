# Increment 7 Fix Task 1 — Plugin Marketplace 与完整 Codex Workflow

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（仅在用户另行派发后） |
| 创建/确认日期 | 2026-08-27 |
| Review ID | `review-increment-007-codex-002` |
| Parent Task | `increment-007-codex-plugin-multi-project` |
| Lineage baseline | `b9ebeffdcc8dd9c34718111b50fa3605a21ad17e` |
| Current manual dispatch HEAD | 用户已授权先形成 documentation-only successor commit；人工派发前读取并报告 live Git，且核对其为 lineage baseline 的仅文档后继 |
| Target | `main` / `D:/agent/case/codex-claudecode-room` |

```yaml
task_id: increment-007-codex-plugin-multi-project-fix-001
room_id: agent-room-main
type: fix
parent_task_id: increment-007-codex-plugin-multi-project
based_on_review_id: review-increment-007-codex-002

background: >
  Increment 7 已从 clean exact baseline
  b9ebeffdcc8dd9c34718111b50fa3605a21ad17e 严格重执行完整 Accepted
  Implementation Contract。Review 1 的 launcher root、dispatch baseline 与
  Task/Review/Question isolation 三项 finding 已闭合，typecheck、focused tests 与
  全量 249/249 均通过。Codex Review 2 仍确认四项阻塞 finding：repository-local
  marketplace 不是 Codex 当前 marketplace schema；Skill 从 CODING/active Run
  错误启动 launcher 且使用不存在的 room:run status 形式；首次 Implementation
  baseline 错误读取 live Git；完整 planning/Review/Question/retry workflow、project
  binding 校验、fresh stable run_id、uncertain-outcome recovery、post-run durable reread
  及 setup templates 未实现。用户已确认四项 finding 与以下最小方案。

goal: >
  仅闭合 review-increment-007-codex-002 的四项 confirmed finding：把 repository-local
  marketplace 改为 Codex 当前 schema，使唯一 Agent Room Skill 与 setup reference
  完整、准确地表达 Accepted Contract 的 project binding、Room lifecycle、baseline
  authority 和 one-shot Codex launcher，并以独立 packaging regression 直接证明这些
  边界；保持已通过的 two-project runtime isolation 与 production runtime 不变。

confirmed_findings:
  - finding_id: inc7-r2-marketplace-schema
    solution: >
      把 .agents/plugins/marketplace.json 改为 repository marketplace root：顶层包含
      name、interface 与 plugins；interface.displayName 为 marketplace 显示名；plugins
      恰好登记一个 agent-room entry，其 source 为 {source: local,
      path: ./plugins/agent-room}，policy 为 {installation: AVAILABLE,
      authentication: ON_INSTALL}，保留最小 category。packaging test 使用测试侧 literal
      断言完整嵌套 shape，不再把当前错误 flat object 当成 Oracle。
  - finding_id: inc7-r2-state-status-entry
    solution: >
      Skill 先通过 project-scoped /mcp/codex 的 room_get_state 读取 durable Room snapshot，
      只在 PLAN_READY 或 FIX_PLAN_READY，或完成合法 Decision/retry transition 后形成新的
      one-shot invocation。CODING/active Run只报告并停止，不再启动第二个Run。删除不受
      src/cli/run.ts 支持的 room:run ... status；如文档需要 CLI 辅助查看，只能使用真实
      room:status script及其现有参数，但project MCP snapshot仍是workflow authority。
  - finding_id: inc7-r2-baseline-authority
    solution: >
      首次new Implementation的--baseline-head只来自同一workflow step首次成功
      room_submit_task响应中的non-null observed_baseline_head，并在展示、host approval与
      exact command之间保持同一值。禁止git rev-parse HEAD、live HEAD、Event time或其它
      fallback；idempotent retry返回null、后续turn只看到PLAN_READY或值已丢失时fail closed
      并报告needs_decision。Fix、Decision resume与failure retry省略caller baseline，继续由
      persisted source Run拥有。
  - finding_id: inc7-r2-workflow-setup-incomplete
    solution: >
      扩充唯一Skill与project-setup reference：校验runtime.json五字段、absolute paths、
      current project、project-scoped MCP endpoint/port与Room binding；覆盖create、
      architecture review、user confirmation、task submission、one-shot run、question answer、
      failure retry、actual Diff review、Fix submission与acceptance；每次planned invocation
      生成Room内fresh non-empty run_id并在展示/审批/执行间保持稳定；approval或process
      outcome不确定时先按同一run_id重读Room，command返回后也必须重读durable snapshot。
      setup reference补齐placeholder-only .codex/config.toml、.agent-room/runtime.json与
      .gitignore模板；exact command默认引用所有path参数。packaging tests使用测试侧literal、
      negative assertion、可解析template与从无room:run manifest的temporary target cwd调用
      Agent Room launcher等直接Oracle，不再只检查正向marker。

requirements:
  - 只修复review-increment-007-codex-002的四项confirmed finding；review_fixes_only。
  - .agents/plugins/marketplace.json必须是一个repository marketplace object：顶层只表达marketplace identity/interface/plugins；plugins恰好一个agent-room entry；entry.source与entry.policy使用Codex当前嵌套object，不保留旧flat displayName/source/installation/authentication布局。
  - marketplace与Plugin仍只指向plugins/agent-room这一份Skill authority；不得复制Skill、增加第二Plugin、MCP bundle、hook、App、asset、dependency或project-specific值。
  - Skill必须先读取当前项目.agent-room/runtime.json，并把它校验为仅含agent_room_root、database_path、project_path、port、room_id五个required fields的object；三个path为absolute path，port为1..65535整数，room_id为non-empty string。
  - Skill必须验证project_path经当前host正常path resolution后等于当前target project，agent_room_root可定位本仓库package.json及room:run script，database_path属于本项目operator选择的file-backed database；不得猜测、扫描或回退到其它项目配置。
  - Skill必须读取当前项目.codex/config.toml的[mcp_servers.agent_room]，确认url精确为http://127.0.0.1:<runtime.port>/mcp/codex；随后通过该project-scoped MCP调用room_get_state(runtime.room_id)，并确认返回Room identity与runtime.room_id一致。任一missing/invalid/mismatch在Task command或launcher前停止并报告。
  - Skill必须使用Current /mcp/codex九个tool中的既有public workflow：room_create、room_get_state、room_begin_architecture_review、room_request_user_confirmation、room_submit_task、room_answer_question、room_retry_run、room_submit_review、room_accept_review；不得要求不存在的tool、私有service method或第二状态authority。
  - Skill必须明确state/action mapping：DISCUSSION只进入Architecture Review；ARCHITECTURE_REVIEW在方案就绪后请求用户确认；WAITING_FOR_USER_CONFIRMATION等待用户明确确认后才提交完整Accepted Task；PLAN_READY/FIX_PLAN_READY才可计划一次Run；CODING只报告active Run且零launch；NEEDS_DECISION读取current open Question并在用户回答后调用room_answer_question；RUN_FAILED仅在用户决定retry后调用room_retry_run；REVIEW_REQUIRED由Codex审查actual task-owned Diff并调用room_submit_review；REVIEW_DISCUSSION等待用户决定后才提交confirmed Fix Task或调用room_accept_review；ACCEPTED只报告并停止。
  - 新Room只能通过room_create创建；planning、Review、Fix与acceptance均保持Codex角色和用户门禁。Skill不得把Codex变成business Coding actor，不得自动生成未确认solution、自动Fix、自动accept或循环调度。
  - 首次new Implementation仅接受同一次首次成功room_submit_task response中的non-null observed_baseline_head；Skill须立即把exact value绑定到同一planned command。禁止git rev-parse HEAD或其它live Git fallback，也不得写入runtime.json、本地mirror或新protocol field。值为null或丢失时零launch并报告needs_decision。
  - Fix、answer_changes_contract=false的Decision resume与RUN_FAILED retry调用room:run时不得传--baseline-head；它们继续由Current Runner从persisted source Run继承baseline/session。answer_changes_contract=true返回planning/confirmation，不得resume旧Task。
  - 每个planned invocation必须选择Room内尚不存在的fresh non-empty run_id；该ID在展示exact command、host approval request与实际invocation间不得改变。不得复用completed/failed/needs_decision/active Run ID，也不得因approval或process outcome不确定而生成第二ID。
  - one-shot exact command必须从target project working directory执行，并严格使用已校验的Agent Room root定位script：npm --prefix "<AGENT_ROOM_ROOT>" run room:run -- --db "<DATABASE_PATH>" --project "<PROJECT_PATH>" --task-id "<TASK_ID>" --run-id "<RUN_ID>" --mcp-url "http://127.0.0.1:<PORT>/mcp/claude"；只有首次new Implementation追加--baseline-head "<OBSERVED_BASELINE_HEAD>"。所有path/ID/URL placeholder默认引用，不要求target project提供package.json或room:run script。
  - host approval模式仍为operator配置的UI“帮我批准”/approvals_reviewer=auto_review。Skill展示同一exact command后只请求一次eligible escalation；通过时Codex执行至多一次，拒绝时零invocation并报告；不得修改approval policy、写active prefix_rule、请求任意npm/shell allow rule或回退为operator direct run。
  - approval result或process outcome不确定时，Skill必须先对同一room_id调用room_get_state并核对同一run_id/current Run，再决定报告或请求operator处理；在未确认零claim前不得重新执行或生成第二run_id。
  - command结束后，无论exit/stdout/model self-report如何，Skill必须重新调用room_get_state，并只按durable snapshot报告REVIEW_REQUIRED、NEEDS_DECISION、RUN_FAILED、CODING或其它实际state；不得把process输出当作Room authority。
  - project-setup.md必须提供三个placeholder-only模板：project-scoped .codex/config.toml的[mcp_servers.agent_room]与/mcp/codex URL；五字段.agent-room/runtime.json，其中port placeholder替换后为JSON integer；目标项目.gitignore至少忽略.agent-room/runtime.json与本地artifact目录。模板不得包含开发机真实路径、secret、active permission rule或可直接污染其它项目的默认值。
  - setup说明必须要求merge而非覆盖existing .codex/config.toml/.gitignore；mcp_servers.agent_room名称冲突、现有URL冲突或无法确定project binding时停止并请求operator决定。
  - tests/plugin-packaging.test.ts必须以测试侧literal直接断言marketplace嵌套shape、唯一Plugin/Skill、三份setup模板、runtime字段/type替换、quoted launcher与forbidden live-HEAD/malformed-status/active-state/retry行为；Oracle不得从candidate导出的schema/helper/allowed table生成。
  - launcher regression必须从一个没有package.json或room:run script的temporary target cwd调用npm --prefix <actual Agent Room root> run room:run --，并断言执行到Agent Room CLI的existing missing-required-argument boundary；不得启动真实Claude、network或修改target Git authority。
  - 保留Review 1已通过的agent_room_root launcher定位、clean exact lineage baseline与two-project Task/Review/Question isolation；tests/multi-project-e2e.test.ts与production source默认不修改。
  - 只把本Fix实际Diff、verification、deviation与REVIEW_REQUIRED candidate事实写入DEVELOPMENT_LOG；其它项目文档由Codex在Fix Review documentation impact audit中维护，Claude不得把Plugin提升为Current。

non_goals:
  - 修改src/、package.json、package-lock.json、dependency、package script、RoomService、Runner、MCP、CLI或production configuration。
  - 修改tests/multi-project-e2e.test.ts、tests/scope.test.ts或plugin.json；若新packaging test证明这些路径存在真实阻塞缺陷，返回needs_decision，不静默扩张。
  - 改变Room state、transition、entity、schema/table/migration、Event、error、protocol version、session/baseline ownership或same-Room single-active-Run invariant。
  - 新增baseline mirror、run pointer、scheduler、daemon、background polling、automatic retry、generic config/parser framework、wrapper、compatibility layer、feature flag、hash/checksum或secret manager。
  - 把operator direct room:run作为Plugin正常路径或approval rejection fallback；修改host approval/sandbox/rules/trusted-project配置。
  - 真实Claude、paid process、manual Codex Desktop smoke、network、global Plugin install、runtime初始化、stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout、stash删除或其它清理。

architecture_decisions:
  - Plugin继续只是Codex workflow packaging；SQLite、Git、Runner process/session与host approval policy仍是各自唯一authority。
  - project binding由project-local.codex/config.toml、local-only runtime.json与room_get_state identity共同校验；现有public API不暴露MCP service背后的database_path，因此本Fix不虚构remote database introspection或新增protocol field。
  - Room state决定下一合法action；launcher只消费已经由planning/confirmation public workflow产生的PLAN_READY/FIX_PLAN_READY Task，不负责创建Room、推进planning、提交Review或自动决定retry。
  - first Implementation baseline是room_submit_task response的ephemeral dispatch evidence；Fix/Decision/retry baseline与session属于persisted source Run。不得用live Git或Plugin local state建立第二authority。
  - fresh run_id是一次planned invocation的稳定identity；uncertain outcome先读durable Room，不以新ID重试。
  - packaging regression针对可执行文档契约使用测试侧literal与真实existing CLI preflight；不新增production parser或test-only product interface。

scope:
  - review_fixes_only
  - .agents/plugins/marketplace.json
  - plugins/agent-room/skills/agent-room/SKILL.md
  - plugins/agent-room/skills/agent-room/references/project-setup.md
  - tests/plugin-packaging.test.ts
  - docs/documents/DEVELOPMENT_LOG.md中的Fix Coding/verification candidate事实

constraints:
  - 保留原Implementation lineage baseline_head b9ebeffdcc8dd9c34718111b50fa3605a21ad17e；Fix不重新执行clean-worktree gate。
  - 当前branch为main、target worktree为D:/agent/case/codex-claudecode-room。用户已独立授权先提交本Accepted Fix Contract与同步文档；该documentation-only commit可以使live HEAD成为lineage baseline的后继，但不得改变lineage baseline。人工派发前重新读取live branch/HEAD/status，确认0 staged，并核对b9ebeffdcc8dd9c34718111b50fa3605a21ad17e是ancestor、baseline后新增commit只含Codex-owned文档、existing Increment 7 implementation candidate path ownership未变。
  - 当前dirty worktree包含同一Increment 7 Implementation candidate与Codex-owned Review/Fix planning文档；不得覆盖、回滚、拆分、stage、格式化或修改scope外candidate。
  - 用户已确认finding与solution、授权Codex提交本Accepted Fix Task及同步文档，并选择暂时自行人工派发；未授权Codex启动Claude。
  - Claude必须在原Increment 7 implementation lineage/session中执行；若不能确认lineage，返回needs_decision，不创建无关新session冒充continuation。
  - tests必须使用temporary owner directory、local package/dependencies与existing fake boundaries，finally清理handle/fixture；不得读取operator全局Codex settings、安装Plugin、访问network或启动真实Claude。
  - 不得删除、弱化或改名规避既有assertion。若本Fix要求source、package、multi-project E2E、scope allowlist、protocol或dependency变化，停止并返回needs_decision。

acceptance_criteria:
  - marketplace.json符合Codex当前repository marketplace root/interface/plugins schema，且唯一agent-room entry的source与policy为嵌套object；旧flat schema被测试明确拒绝。
  - 唯一Skill从project-local config开始，能按Current九个Codex MCP tools与完整Room state mapping推进planning、confirmation、Task、Question、retry、Review、Fix和acceptance；CODING/active Run、wrong state或任一binding mismatch均零launch。
  - 首次Implementation command只使用同一room_submit_task response的non-null observed_baseline_head；Skill与setup中不存在git rev-parse HEAD/live HEAD fallback。值为null/丢失时fail closed；Fix/Decision/retry省略caller baseline。
  - 每次planned invocation使用fresh stable run_id；exact command经quoted npm --prefix "<AGENT_ROOM_ROOT>"定位Agent Room script，target project无package manifest仍到达existing Agent Room CLI preflight。
  - auto_review approval一次至多一个invocation；拒绝为零invocation。不确定outcome先按同一run_id重读Room；每次command返回后均重读durable Room并按snapshot报告。
  - project-setup.md包含可替换的.codex/config.toml、runtime.json与.gitignore三个placeholder-only模板及merge/no-overwrite说明，不含project-specific值、secret或permission mutation。
  - tests/plugin-packaging.test.ts以independent literal与negative/direct Oracle覆盖上述边界；focused test、unchanged two-project E2E、scope、typecheck与full suite全部通过，full suite不启动真实Claude。
  - live task-owned Diff不包含src、package/lock、dependency、plugin manifest、multi-project E2E、scope regression或production config变化；Coding Result完整、数量与live output一致。

verification:
  - command: node --test "tests/plugin-packaging.test.ts"
    detects: marketplace nested schema、完整Skill/state/baseline/run identity/durable reread、三份setup template、quoted launcher与temporary target direct preflight是否满足，及旧flat/live-HEAD/malformed-status/active-run路径是否仍存在。
    decision_if_failed: 只修复本Fix的marketplace/Skill/reference/test Oracle；需要production/package/multi-project/scope变化时返回needs_decision。
  - command: node --test "tests/multi-project-e2e.test.ts"
    detects: packaging/workflow文字修复是否意外破坏Review 1已闭合的A/B in-flight overlap与Task/Review/Question/Run/Event/Git/artifact isolation。
    decision_if_failed: 不修改该test或production语义来掩盖失败；若失败不是本Fix fixture副作用，返回needs_decision。
  - command: node --test "tests/scope.test.ts"
    detects: 本Fix是否越过Increment 7 exact plugin/config/test/document boundary或改变dependency/package scripts。
    decision_if_failed: 不放宽allowlist；移除本Fix越界Diff，既有candidate问题则报告needs_decision。
  - command: npm run typecheck
    detects: packaging test使用的JSON shape、template parser、child-process或fixture是否产生TypeScript偏移。
    decision_if_failed: 仅修复本Fix引入的类型问题；不得使用any、ts-ignore、skipLibCheck或wrapper规避。
  - command: npm test
    detects: 本Fix是否破坏Increment 1-6 lifecycle、Increment 7 isolation或全量test discovery，以及是否误启动真实Claude/network。
    decision_if_failed: 只修复task-owned regression；不得删除/弱化既有test或扩大production scope。
  - command: git diff --name-only
    detects: 本Fix净新增修改是否只位于marketplace、唯一Skill/reference、packaging test与DEVELOPMENT_LOG，且未覆盖其它candidate。
    decision_if_failed: 不回滚既有lineage/Codex文档；报告无法安全分离的scope drift并停止。
  - command: git status --short --branch
    detects: branch、HEAD、staged/untracked状态或candidate ownership是否漂移。
    decision_if_failed: 不stage、清理、回滚或重定baseline；报告drift并停止。

documentation_updates:
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录Fix Task 1实际marketplace/Skill/reference/test Diff、direct Oracle、live verification、deviation与REVIEW_REQUIRED candidate状态；用户接受并版本化前不得提升Current capability。

question_policy: >
  若正确修复需要修改src、package.json、package-lock.json、dependency、package script、plugin manifest、
  multi-project E2E、scope allowlist、production config、Room state/transition/entity/schema/Event/error、
  MCP/Runner/CLI semantics、same-Room parallel、host approval policy，或需要network、global install、
  runtime初始化、真实/paid Claude、manual Desktop smoke或任何Git mutation，停止受影响工作并返回
  needs_decision。Skill章节组织、测试侧局部parser/fixture、placeholder命名与fresh run_id示例格式由Claude
  在本Contract冻结行为内作最小选择，并在Coding Result记录。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: 2026-08-27
```

## 人工派发边界

- 用户已确认Review 2四项finding与上述最小solution，因此本Fix Task为`Accepted`，项目阶段为`FIX_PLAN_READY`。
- 本次确认不授权Codex启动Claude；用户选择暂时在原Increment 7 lineage/session中自行人工派发本文。
- 派发前必须确认`main`、0 staged与当前candidate path ownership；live `HEAD`允许是本次documentation-only successor，但必须证明`b9ebeffdcc8dd9c34718111b50fa3605a21ad17e`为ancestor且中间commit只含Codex-owned文档。Fix继续继承原lineage baseline，不要求dirty worktree clean。
- 标准客户端能可靠解析`@<path>`时使用下方指令；不能解析时必须注入本文全文，不得只发送finding摘要。
- 不授权manual Codex Desktop smoke、真实Claude、stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout、stash删除、runtime初始化或其它清理。

## 人工派发指令

```text
执行 @docs/documents/INCREMENT_7_FIX_TASK_1.md 中已批准的完整 Fix Task。严格遵守其中的 confirmed_findings、review_fixes_only、scope、non_goals、constraints、acceptance_criteria、verification、documentation_updates 和 question_policy；保持 Review 1 已闭合的 launcher root、clean exact lineage baseline 与 two-project Task/Review/Question isolation，不修改 production source、package、plugin manifest、multi-project E2E 或 scope allowlist。完成后按 ROOM_PROTOCOL.md 的 Coding Result Contract 返回完整结果。不要执行 stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout、stash删除、runtime初始化或其它清理操作。
```

如果人工客户端不能可靠解析`@docs/documents/INCREMENT_7_FIX_TASK_1.md`，必须把本文件完整内容直接注入同一次prompt；不得只发送上面一行或自行摘要Contract。

## 相关文档

- [Increment 7 Task Contract](./INCREMENT_7_TASK_CONTRACT.md)
- [Architecture](./ARCHITECTURE.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [MVP Plan](./MVP_PLAN.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
