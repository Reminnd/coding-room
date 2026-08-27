# Increment 7 Fix Task 2 — Skill Front Matter 与 Decision Resume Gate

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（仅在用户人工派发后） |
| 创建/确认日期 | 2026-08-27 |
| Review ID | `review-increment-007-codex-003` |
| Parent Task | `increment-007-codex-plugin-multi-project` |
| Lineage baseline | `b9ebeffdcc8dd9c34718111b50fa3605a21ad17e` |
| Current manual dispatch HEAD | 本Accepted Contract与同步文档形成docs-only successor commit后读取live Git；该HEAD必须是lineage baseline的仅文档后继 |
| Target | `main` / `D:/agent/case/codex-claudecode-room` |

```yaml
task_id: increment-007-codex-plugin-multi-project-fix-002
room_id: agent-room-main
type: fix
parent_task_id: increment-007-codex-plugin-multi-project
based_on_review_id: review-increment-007-codex-003

background: >
  Increment 7 Fix Task 1 已按 Review 2 四项 confirmed finding 完成 marketplace、
  Skill lifecycle/baseline、project setup 与 packaging Oracle 修复，并报告 typecheck、
  focused tests 与全量 259/259 通过。Codex Review 3 仍确认两个阻塞 finding：全仓库
  唯一 authoritative SKILL.md 缺少 Codex Skill 所需 YAML front matter；Skill 的
  NEEDS_DECISION 分支虽然说明 answer_changes_contract=false 后进入 Step 4，却把
  Step 4 限制为 PLAN_READY/FIX_PLAN_READY，而 Current Room lifecycle 在 answer(false)
  后保持 durable NEEDS_DECISION，直到 resumeRun claim 才进入 CODING。用户已确认
  两项 finding 与以下最小方案。

goal: >
  仅闭合 review-increment-007-codex-003 的两项 confirmed finding：使唯一 Agent Room
  Skill 具有可被 Codex validator加载的最小YAML front matter，并使Skill准确允许已完成
  answer(false)的NEEDS_DECISION Decision continuation进入一次one-shot resume，同时用
  独立packaging Oracle直接证明front matter与组合state gate；保持其它Plugin、Room
  lifecycle、production runtime及已通过的Fix Task 1行为不变。

confirmed_findings:
  - finding_id: inc7-r3-skill-frontmatter-missing
    solution: >
      在唯一plugins/agent-room/skills/agent-room/SKILL.md开头增加最小YAML front matter。
      name固定为agent-room；description必须准确描述触发条件和本Skill负责的project-local
      Room planning、one-shot run、Question、Review/Fix workflow，不加入未实现能力。
      tests/plugin-packaging.test.ts使用测试侧literal解析文件起始front matter并直接断言
      name与non-empty trigger-oriented description，不能只断言Skill路径存在或导入candidate
      validator/schema作为Oracle。
  - finding_id: inc7-r3-decision-resume-state-gate
    solution: >
      保留Current lifecycle：open Question时NEEDS_DECISION只允许用户回答并调用
      room_answer_question；answer_changes_contract=true进入planning/confirmation且不得resume；
      answer_changes_contract=false成功后Room保持NEEDS_DECISION，随后才由一次room:run的
      resumeRun claim进入CODING。Skill Step 4必须把“已成功answer(false)的current Decision
      continuation”明确列为合法入口，与PLAN_READY/FIX_PLAN_READY并列；该resume省略
      --baseline-head并继承persisted source Run。未回答/open Question、CODING/active Run或
      outcome不确定且尚未确认durable state时仍为零launcher。packaging test必须把
      NEEDS_DECISION open-question gate、answer(false)后resume eligibility、answer(true)禁止
      resume、CODING零launch与continuation无caller baseline作为同一组合Oracle验证。

requirements:
  - 只修复review-increment-007-codex-003的两项confirmed finding；review_fixes_only。
  - 唯一SKILL.md必须以YAML front matter开始并包含exact `name: agent-room`与non-empty `description`；front matter后保留一份Skill正文，不新增第二Skill或复制workflow authority。
  - description必须面向Skill discovery说明何时使用Agent Room workflow，覆盖project-local Room binding、planning、one-shot Claude Run、Question与Review/Fix continuation；不得声称automatic dispatch、business Coding、same-Room parallel、daemon、global config或其它非目标能力。
  - Skill的durable state/action mapping必须区分两种NEEDS_DECISION：current_question仍为open时只读取Question、取得用户答案并调用room_answer_question，零launcher；room_answer_question成功返回answer_changes_contract=false后，允许在同一workflow continuation计划一次Decision resume。
  - 若后续room_get_state返回Room=NEEDS_DECISION且current_question=null，该durable read model表示最新Question已不再open；Skill可把它作为Decision continuation候选，但仍必须使用同一current Task/Run lineage并由existing room:run preflight/getContinuationContext验证，不猜测或创建新Task。
  - answer_changes_contract=true时Room进入WAITING_FOR_USER_CONFIRMATION，旧Task不得resume；Skill不得把该分支送入Step 4。
  - Step 4合法入口必须明确包含PLAN_READY、FIX_PLAN_READY与已完成answer(false)的NEEDS_DECISION Decision continuation；不得继续声称只有PLAN_READY/FIX_PLAN_READY可以计划launcher。
  - Decision resume继续省略--baseline-head；baseline与session由persisted source Run拥有。不得读取live Git、复用首次submission ephemeral baseline、写baseline mirror或新增protocol field。
  - CODING/active Run继续只报告并停止，零launcher；NEEDS_DECISION存在open current_question时零launcher；每次eligible continuation仍只计划一个fresh stable run_id和至多一次invocation。
  - 保留Fix Task 1已经实现的project binding、九public tools、marketplace嵌套schema、setup templates、quoted npm --prefix launcher、approval at most one、uncertain-outcome reread、post-run durable reread、无malformed status与无active permission mutation语义。
  - tests/plugin-packaging.test.ts必须新增front matter direct Oracle：从文件第一个字符解析YAML delimiter和字段，断言exact name与有效description，并显式拒绝heading-first/no-front-matter形态；不得只搜索正文中出现的name/description单词。
  - tests/plugin-packaging.test.ts必须把Decision resume作为组合direct Oracle：证明open NEEDS_DECISION只answer且零launch、answer(false)后仍在NEEDS_DECISION可进入Step 4、answer(true)不得resume、CODING零launch、Decision resume不传--baseline-head，并显式拒绝“Step 4仅允许PLAN_READY/FIX_PLAN_READY”的旧限制。
  - packaging Oracle使用测试侧literal/局部parser，不导入Skill、RoomService或candidate导出的allowed table生成期望；不增加production parser、dependency或generic test framework。
  - 只把本Fix实际Diff、verification、deviation与REVIEW_REQUIRED candidate事实写入DEVELOPMENT_LOG；其它项目文档由Codex在Fix Review documentation impact audit中维护，Claude不得把Plugin提升为Current。

non_goals:
  - 修改marketplace.json、project-setup.md、plugin.json、tests/multi-project-e2e.test.ts、tests/scope.test.ts或Fix Task 1已闭合的其它实现。
  - 修改src/、package.json、package-lock.json、dependency、package script、production configuration、RoomService、Runner、MCP、CLI或state snapshot read model。
  - 新Room state、transition、entity、schema/table/migration、Event、error、protocol version、MCP tool、baseline/session ownership或same-Room concurrency语义。
  - 新增answered-question pointer、baseline mirror、local workflow state、wrapper、compatibility layer、feature flag、generic YAML framework、hash/checksum或defensive scaffolding。
  - 修改host approval/sandbox/rules/trusted-project配置，或把operator direct room:run作为Plugin正常路径/fallback。
  - 真实Claude、paid process、manual Codex Desktop smoke、network、global Plugin install、runtime初始化、stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout、stash删除或其它清理。

architecture_decisions:
  - YAML front matter只提供Codex Skill discovery metadata；Skill正文继续是唯一workflow authority，不新增Plugin component或runtime state。
  - Current Room lifecycle保持不变：answer(false)不执行Room transition；resumeRun从NEEDS_DECISION原子claim进入CODING。Fix仅让Skill state gate匹配该既有事实。
  - project-scoped room_get_state只返回open current_question；在supported lifecycle中，NEEDS_DECISION加current_question=null可表示Question已经answer(false)。最终continuation legality仍由existing room:run/getContinuationContext与persisted Question/source Run校验，不在Skill建立第二authority。
  - Decision resume继续复用persisted source Run的baseline/session；Skill不持久化Question、Run或baseline镜像。
  - packaging regression验证可执行Skill契约，使用独立literal/parser；不修改production implementation来适配测试。

scope:
  - review_fixes_only
  - plugins/agent-room/skills/agent-room/SKILL.md
  - tests/plugin-packaging.test.ts
  - docs/documents/DEVELOPMENT_LOG.md中的Fix Coding/verification candidate事实

constraints:
  - 保留原Implementation lineage baseline_head b9ebeffdcc8dd9c34718111b50fa3605a21ad17e；Fix不重新执行clean-worktree gate。
  - 当前branch为main、target worktree为D:/agent/case/codex-claudecode-room。用户已授权提交本Accepted Fix Contract与同步文档；该docs-only commit可使live HEAD成为lineage baseline的后继，但不得改变lineage baseline。人工派发前重新读取live branch/HEAD/status，确认0 staged，并核对lineage baseline为ancestor、baseline后commits只含Codex-owned文档。
  - 当前dirty worktree包含同一Increment 7 candidate与Codex-owned文档；不得覆盖、回滚、拆分、stage、格式化或修改scope外candidate。
  - 用户已确认两项finding与solution、授权Codex提交本Accepted Fix Task及同步文档，并选择暂时自行人工派发；未授权Codex启动Claude。
  - Claude必须在原Increment 7 implementation lineage/session中执行；不能确认lineage时返回needs_decision，不创建无关新session冒充continuation。
  - tests使用existing local package/dependencies与temporary fixture；不得访问network、读取operator全局Codex settings、安装Plugin或启动真实Claude。
  - 不得删除、弱化或改名规避既有assertion。若正确修复需要scope外Plugin/reference/source/package/E2E/scope/protocol/dependency变化，停止并返回needs_decision。

acceptance_criteria:
  - 唯一SKILL.md具有合法起始YAML front matter，exact name为agent-room，description可用于准确discovery且不声明非目标能力；packaging test直接解析并拒绝heading-first缺失front matter。
  - Skill明确区分NEEDS_DECISION open Question与已answer(false)的Decision continuation；前者零launcher，后者可进入一次Step 4 resume，answer(true)不得resume。
  - Step 4明确允许PLAN_READY、FIX_PLAN_READY与已answer(false)的NEEDS_DECISION；CODING仍零launcher，所有continuation仍遵守fresh stable run_id、one-shot approval与durable reread。
  - Decision resume command省略--baseline-head并继承persisted source Run；首次Implementation baseline authority、Fix/retry continuation及其它Fix Task 1行为不回归。
  - tests/plugin-packaging.test.ts以independent literal/parser和negative assertion覆盖front matter与完整Decision resume组合语义；focused test、unchanged two-project E2E、scope、typecheck及full suite全部通过且不启动真实Claude/network。
  - live task-owned Diff仅新增本Fix允许的Skill、packaging test与DEVELOPMENT_LOG candidate事实；marketplace/setup/manifest/E2E/scope/source/package/protocol无本Fix变化。

verification:
  - command: node --test "tests/plugin-packaging.test.ts"
    detects: Skill front matter是否可直接解析并具有exact name/有效description，以及open/answered NEEDS_DECISION、answer(false/true)、CODING、Step 4与caller baseline组合gate是否准确。
    decision_if_failed: 只修复本Fix的Skill/test Oracle；需要scope外Plugin/reference/source/package变化时返回needs_decision。
  - command: node --test "tests/multi-project-e2e.test.ts"
    detects: Skill packaging文字与Oracle修改是否意外破坏既有A/B concurrent isolation candidate。
    decision_if_failed: 不修改E2E或production语义掩盖失败；若非本Fix副作用则返回needs_decision。
  - command: node --test "tests/scope.test.ts"
    detects: 本Fix是否越过Increment 7 exact boundary或改变dependency/package scripts。
    decision_if_failed: 不放宽allowlist；移除本Fix越界Diff或返回needs_decision。
  - command: npm run typecheck
    detects: front matter局部parser或packaging assertion是否产生TypeScript偏移。
    decision_if_failed: 仅修复本Fix类型问题；不得使用any、ts-ignore、skipLibCheck、dependency或wrapper规避。
  - command: npm test
    detects: 本Fix是否破坏Increment 1-6 lifecycle、Increment 7 Fix Task 1/多项目隔离或全量test discovery，以及是否误启动真实Claude/network。
    decision_if_failed: 只修复task-owned regression；不得删除/弱化既有test或扩大production scope。
  - command: git diff --name-only
    detects: 本Fix净新增修改是否仅位于唯一Skill、packaging test与DEVELOPMENT_LOG，且未覆盖其它candidate。
    decision_if_failed: 不回滚既有lineage或Codex文档；报告无法安全分离的scope drift并停止。
  - command: git status --short --branch
    detects: branch、HEAD、staged/untracked状态或candidate ownership是否漂移。
    decision_if_failed: 不stage、清理、回滚或重定baseline；报告drift并停止。

documentation_updates:
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录Fix Task 2实际Skill/test Diff、front matter与Decision resume direct Oracle、live verification、deviation及REVIEW_REQUIRED candidate事实；用户接受并版本化前不得提升Current capability。

question_policy: >
  若正确修复需要修改marketplace、project setup、plugin manifest、multi-project E2E、scope allowlist、
  src、package/lock/dependency/script、production config、Room state/transition/entity/schema/Event/error、
  MCP/Runner/CLI/state snapshot semantics、baseline/session ownership、same-Room parallel或host approval
  policy，或需要network、global install、runtime初始化、真实/paid Claude、manual Desktop smoke或任何
  Git mutation，停止受影响工作并返回needs_decision。front matter description的准确措辞、Skill内部
  小节组织与test侧最小局部parser由Claude在本Contract冻结行为内作最小选择，并在Coding Result记录。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: 2026-08-27
```

## 人工派发边界

- 用户已确认Review 3两项finding与上述最小solution，因此本Fix Task为`Accepted`，项目阶段为`FIX_PLAN_READY`。
- 本次确认不授权Codex启动Claude；用户选择暂时在原Increment 7 lineage/session中自行人工派发本文。
- 派发前必须确认`main`、0 staged与当前candidate path ownership；live `HEAD`允许是本次docs-only successor，但必须证明lineage baseline为ancestor且中间commits只含Codex-owned文档。Fix继续继承原lineage baseline，不要求dirty worktree clean。
- 标准客户端能可靠解析`@<path>`时使用下方指令；不能解析时必须注入本文全文，不得只发送finding摘要。
- 不授权manual Codex Desktop smoke、真实Claude、stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout、stash删除、runtime初始化或其它清理。

## 人工派发指令

```text
执行 @docs/documents/INCREMENT_7_FIX_TASK_2.md 中已批准的完整 Fix Task。严格遵守其中的 confirmed_findings、review_fixes_only、scope、non_goals、constraints、acceptance_criteria、verification、documentation_updates 和 question_policy；保持 Fix Task 1 已闭合的 marketplace、project binding、setup templates、baseline authority、stable run_id、quoted launcher、approval、durable reread与two-project isolation，不修改 production source、package、plugin manifest、project setup、marketplace、multi-project E2E 或 scope allowlist。完成后按 ROOM_PROTOCOL.md 的 Coding Result Contract 返回完整结果。不要执行 stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout、stash删除、runtime初始化或其它清理操作。
```

如果人工客户端不能可靠解析`@docs/documents/INCREMENT_7_FIX_TASK_2.md`，必须把本文件完整内容直接注入同一次prompt；不得只发送上面一行或自行摘要Contract。

## 相关文档

- [Increment 7 Task Contract](./INCREMENT_7_TASK_CONTRACT.md)
- [Increment 7 Fix Task 1](./INCREMENT_7_FIX_TASK_1.md)
- [Architecture](./ARCHITECTURE.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [MVP Plan](./MVP_PLAN.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
