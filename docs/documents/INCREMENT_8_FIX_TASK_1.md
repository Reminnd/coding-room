# Increment 8 Fix Task 1 — Dotted-key Config Conflict 与 Actual Skill Consumer Evidence

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（仅在用户人工派发后）；actual Skill consumer evaluation 由 Codex/operator 在另行授权后执行 |
| 创建/确认日期 | 2026-08-27 |
| Review ID | `review-increment-008-codex-001` |
| Parent Task | `increment-008-automatic-project-setup` |
| Lineage baseline | `0872dda067c6af4d7333c58da8d9ac2a967acce2` |
| Current manual dispatch HEAD | `0872dda067c6af4d7333c58da8d9ac2a967acce2`；派发前重新读取 live Git |
| Target | `main` / `D:/agent/case/codex-claudecode-room` |

```yaml
task_id: increment-008-automatic-project-setup-fix-001
room_id: agent-room-main
type: fix
parent_task_id: increment-008-automatic-project-setup
based_on_review_id: review-increment-008-codex-001

background: >
  Increment 8 Implementation Coding 已从 clean exact main baseline 完成，focused setup
  9/9、packaging 20/20、scope 1/1、typecheck 与 full suite 272/272 均报告通过。
  Codex Review 1 仍确认两项 finding。第一，setup helper 只识别 agent_room table
  header 与局部 inline 形态，遗漏标准 TOML dotted-key
  `mcp_servers.agent_room.url = "..."`：runtime 缺失时仍创建 runtime/gitignore 并追加
  第二个 agent_room table，违反 conflict-before-write 与 zero-write invariant。第二，
  Accepted Contract 要求 actual Codex Skill consumer validation，但 Coding Result 标记
  manual Desktop smoke not_run，测试侧局部 parser 不能替代真实 package load、activation
  与 bundled resource resolution。用户已确认两项 finding 与以下最小方案。

goal: >
  仅闭合 review-increment-008-codex-001 的两项 confirmed finding：让 setup helper 对
  本项目支持的 agent_room/other-server dotted URL assignment 作保守 ownership 分类并在
  conflict 时保持零写入，同时移除局部 parser 的“等价 consumer evidence”主张；Fix Coding
  后由 Codex/operator 在另行授权的真实 installed-plugin consumer evaluation 中验证唯一
  Skill 的 activation、negative routing 与 bundled helper/reference resolution。

confirmed_findings:
  - finding_id: inc8-r1-dotted-key-config-conflict
    solution: >
      在 setup-project.ts 现有最窄 config classifier 中识别 active direct dotted URL
      assignment：`mcp_servers.agent_room.url`、`mcp_servers."agent_room".url` 与
      `mcp_servers.'agent_room'.url`。runtime 缺失且任一形态定义 agent_room 时，必须在
      port/UUID allocation及任何文件写入前拒绝；runtime 有效时，matching exact URL
      视为已有匹配binding而不追加table，different URL按mismatch拒绝。其它server以
      direct dotted URL assignment占用exact expected URL时按existing other-server conflict
      拒绝。使用focused direct regression证明全部目标文件不存在或byte-identical；不引入
      TOML dependency、generic parser或额外兼容层。
  - finding_id: inc8-r1-actual-skill-validator-missing
    solution: >
      将 tests/plugin-packaging.test.ts 中“局部 parser 提供离线等价consumer证据”的表述
      改为准确边界：它只验证冻结metadata子集，不能替代actual installed-plugin consumer。
      Claude继续运行offline packaging regression，但不得安装/reload Plugin或宣称actual
      validation通过。Fix Coding完成后，Codex/operator在另行授权下按OpenAI官方完整Plugin
      测试路径安装candidate，开启新conversation，以direct setup、indirect setup、normal
      workflow/missing-binding negative和unsupported request验证activation/routing，并确认
      bundled scripts/setup-project.ts与references/project-setup.md可解析。未获授权或未运行时
      如实保持pending，Fix Review不得把该验收项写成passed。

requirements:
  - 只修复`review-increment-008-codex-001`的两项confirmed finding；`review_fixes_only`。
  - helper必须在现有读取/计划阶段识别本Contract冻结的三种agent_room direct dotted URL key；不得扩展为通用TOML parser。
  - runtime缺失且config含任一冻结agent_room dotted key时，在allocateLoopbackPort、randomUUID、directory/file write与service boundary之前失败；existing config保持byte-identical，`.agent-room/runtime.json`和`.gitignore`不得出现。
  - valid runtime + matching agent_room dotted URL必须成功复用existing五字段identity，config保持byte-identical且不得追加`[mcp_servers.agent_room]`；gitignore只遵循原Contract的missing-entry merge。
  - valid runtime + different agent_room dotted URL必须按runtime/config mismatch失败；runtime、config与gitignore前后byte-identical。
  - valid runtime +其它server的direct dotted URL等于expected URL时必须按other-server ownership conflict失败；三份目标文件前后byte-identical。
  - quoted `"agent_room"`与`'agent_room'`只作为同一冻结dotted-key grammar的server-name表示；不得新增任意quoted key、multiline value、array/table AST或general TOML normalization。
  - focused regression必须直接执行setup helper public CLI boundary并断言exit/result与目标文件状态；不得只测试内部regex/helper或从candidate classifier导出test Oracle。
  - 保留现有table-header、inline agent_room、same-URL、fresh setup、valid rerun、probe、bind failure与actual loopback E2E regression；不得删除或弱化断言以维持绿灯。
  - tests/plugin-packaging.test.ts只修正consumer-evidence边界文字或对应断言命名；现有front matter frozen value、setup discovery、helper/reference packaging与negative workflow Oracle保持不变。
  - Claude Coding Result必须把actual installed-plugin consumer evaluation报告为`not_run`，除非用户另行明确授权且由Codex/operator真实执行并提供结果；Claude不得用局部parser、标准YAML parser或模型自述替代。
  - Codex Fix Review在批准前必须核对actual consumer evidence：candidate完整Plugin已安装/启用，新conversation对direct/indirect/negative/boundary prompts的activation符合预期，bundled helper/reference可解析；失败则保持`changes_requested`或`needs_discussion`。
  - 只把本Fix实际helper/test Diff、verification、deviation与`REVIEW_REQUIRED` candidate事实写入DEVELOPMENT_LOG；其它项目文档由Codex维护，用户接受前不得把automatic setup提升为Current。

non_goals:
  - 通用解析、重写、格式化或修复任意TOML；支持multiline string、dynamic key、array、dotted table组合或所有合法TOML等价写法。
  - 修改Skill setup/workflow正文、frozen description、project-setup reference、Plugin manifest、marketplace、scope allowlist或其它Increment 8已通过行为。
  - 修改`src/`、root package.json/package-lock.json、dependency、package script、production CLI、MCP、RoomService、Runner、State Machine、SQLite、protocol或active project config。
  - 新Room state、transition、entity、schema/table/migration、Event、error、MCP tool或protocol version。
  - 把local parser扩展为production validator，新增YAML/TOML dependency、generic framework、wrapper、compatibility layer、feature flag、hash/checksum或defensive scaffolding。
  - Claude安装/重装Plugin、修改personal marketplace/cache、reload Codex Desktop、启动service、初始化runtime、执行room:run或paid Claude。
  - global config、raw HTTP、direct SQLite、host approval/sandbox/rules/trusted-project修改，或任何Git mutation/cleanup。

architecture_decisions:
  - 本Fix只收紧Skill-owned helper的existing-config ownership分类与验收证据边界，不改变automatic setup target architecture、Room authority、reload lifecycle或production dependency direction。
  - dotted-key处理采用现有classifier中的窄literal/regex识别；无法保守判定继续fail closed，不引入generic TOML library。
  - offline parser只负责冻结metadata子集的快速regression；actual consumer activation与bundled resource resolution由真实installed-plugin evaluation拥有。

scope:
  - review_fixes_only
  - plugins/agent-room/skills/agent-room/scripts/setup-project.ts中的最窄dotted URL ownership分类
  - tests/plugin-setup.test.ts中的dotted-key matching/conflict/zero-write direct regression
  - tests/plugin-packaging.test.ts中的actual-consumer evidence边界文字或对应assertion命名
  - docs/documents/DEVELOPMENT_LOG.md中的Fix Coding/verification candidate事实

constraints:
  - 保留原Implementation lineage baseline_head `0872dda067c6af4d7333c58da8d9ac2a967acce2`；Fix不重新执行clean-worktree gate。
  - 当前branch为main、当前HEAD为lineage baseline、0 staged；派发前重新读取live branch/HEAD/status并核对candidate ownership。
  - 当前dirty worktree包含同一Increment 8 candidate与Codex-owned Review/Fix文档；不得覆盖、回滚、拆分、stage、格式化或修改scope外candidate及Codex文档。
  - 当前项目仍缺少`.agent-room/runtime.json`与`.codex/config.toml`，无法通过durable Room提交Fix；用户选择人工派发时必须完整注入本Contract，不得把missing binding解释为setup授权。
  - 用户确认finding与solution只使本Fix Contract进入Accepted/`FIX_PLAN_READY`；不授权Codex启动Claude，不授权Plugin installation/reload/manual consumer evaluation，也不授权任何Git写操作。
  - tests使用temporary owner directory并在finally释放handle、server、database、process与fixture；不得访问external network或operator全局Codex settings。
  - 如果正确修复需要scope外Skill/reference/Plugin/source/package/protocol/dependency变化，停止并返回`needs_decision`。

acceptance_criteria:
  - missing runtime +任一冻结agent_room dotted URL key被helper拒绝，发生在identity allocation和全部目标写入前；config byte-identical，runtime/gitignore保持不存在。
  - valid runtime + matching dotted agent_room URL成功幂等复用原identity且不追加table；different URL与other-server exact URL ownership均失败并保持全部目标文件byte-identical。
  - existing table-header/inline/conflict、fresh/idempotent/probe/service/E2E regression继续通过，helper仍只使用Node.js standard library且不spawn process。
  - packaging test不再声称局部parser等价于actual consumer；全部既有metadata/discovery/resource regression继续通过。
  - actual installed-plugin consumer evaluation由Codex/operator真实执行并记录：direct与indirect setup请求激活唯一Skill；normal workflow或missing-binding不得隐式进入setup；unsupported request不激活；bundled helper/reference在安装后可解析。未运行时不得批准该验收项。
  - focused setup、packaging、scope、typecheck与full suite全部通过；live Fix-owned净Diff仅包含本Fix允许路径，automatic setup仍为candidate。

verification:
  - command: node --test "tests/plugin-setup.test.ts"
    detects: dotted agent_room/other-server URL ownership是否在helper public CLI boundary正确分类，conflict是否发生在allocation/write前，以及matching rerun是否错误追加table或漂移identity。
    decision_if_failed: 只修复helper classifier与focused fixture；不得新增generic TOML framework、dependency或放宽zero-write语义。
  - command: node --test "tests/plugin-packaging.test.ts"
    detects: consumer-evidence边界修正是否破坏frozen front matter、setup discovery、helper/reference packaging或既有workflow negative Oracle。
    decision_if_failed: 只修复本Fix允许的test文字/命名或由helper改动造成的task-owned regression；不得把局部parser重新宣称为actual consumer。
  - command: node --test "tests/scope.test.ts"
    detects: Fix是否越过Increment 8 exact plugin/source/package/dependency boundary。
    decision_if_failed: 不放宽allowlist；移除Fix新增越界Diff或返回needs_decision。
  - command: npm run typecheck
    detects: dotted-key classifier或focused fixture是否产生TypeScript drift。
    decision_if_failed: 仅修复本Fix类型问题；不得使用any、ts-ignore、skipLibCheck、dependency或wrapper规避。
  - command: npm test
    detects: Fix是否破坏Increment 1-7 Protocol/Room/Git/Runner/MCP/CLI/Plugin workflow或Increment 8其它setup行为。
    decision_if_failed: 只修复task-owned regression；不得删除/弱化既有assertion或扩大production scope。
  - command: actual installed-plugin Skill consumer evaluation（Codex/operator；需另行授权）
    detects: candidate Plugin是否能被真实consumer加载，唯一Skill是否按direct/indirect/negative/boundary request正确activation/routing，以及bundled helper/reference是否在安装后解析。
    decision_if_failed: 记录exact Codex version、安装来源、conversation/prompt、activation与resource evidence；只修复已确认Skill/package缺陷。未授权或未运行时保持pending，不把offline parser结果标为passed。
  - command: git diff --name-only / git status --short --branch
    detects: Fix净新增path、branch、HEAD、staged/untracked状态或candidate ownership是否漂移。
    decision_if_failed: 不stage、清理、回滚或重定baseline；报告无法安全分离的drift并停止。

documentation_updates:
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录Fix Task 1实际helper/test Diff、dotted-key direct Oracle、offline/actual consumer verification边界、live结果、deviation与REVIEW_REQUIRED candidate事实；用户接受前不提升Current capability。

question_policy: >
  若正确修复需要通用TOML parser/dependency、修改Skill正文或reference/manifest/marketplace/scope、
  修改src/root package/lock/dependency/script、production config、Room state/transition/entity/schema/
  Event/error/MCP/Runner/CLI/protocol，安装/reload Plugin、启动service/runtime/room:run/paid Claude、
  global config/raw HTTP/direct SQLite、host policy或任何Git mutation，停止受影响工作并返回
  needs_decision。dotted-key局部helper命名、regex组织、parameterized fixture结构与test title可在本
  Contract冻结grammar和行为内作最小选择，并在Coding Result记录。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: 2026-08-27
```

## 人工派发边界

- 用户已确认Review 1两项finding与上述最小solution，因此本Fix Task为`Accepted`，项目阶段为`FIX_PLAN_READY`。
- 当前项目没有有效Room binding，无法调用`room_submit_task`；这不授权运行候选setup。用户可在原Increment 8 Claude session/conversation中人工派发本文，或另行授权Codex使用可验证的Room workflow。
- 本次确认不授权Codex启动Claude，也不授权actual installed-plugin consumer evaluation、Plugin install/reload、service/runtime初始化、manual smoke或任何Git写操作。
- 派发前必须确认`main`、live `HEAD`、原lineage baseline、0 staged与candidate path ownership；Fix继续继承原lineage baseline，不要求dirty worktree clean。
- 客户端能可靠解析`@<path>`时使用下方指令；不能解析时必须直接注入本文全文，不得只发送finding摘要。

## 人工派发指令

```text
执行 @docs/documents/INCREMENT_8_FIX_TASK_1.md 中已批准的完整 Fix Task。严格遵守其中的 confirmed_findings、review_fixes_only、scope、non_goals、constraints、acceptance_criteria、verification、documentation_updates 和 question_policy；只修正 setup helper 的冻结 dotted URL ownership 分类、对应 direct zero-write regression，以及 packaging test 的 actual-consumer evidence 边界表述。不要安装或reload Plugin，不要把局部 parser 声称为 actual consumer validation。完成后按 ROOM_PROTOCOL.md 的 Coding Result Contract 返回完整结果。不要执行 stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout、stash删除、runtime初始化或其它清理操作。
```

如果人工客户端不能可靠解析`@docs/documents/INCREMENT_8_FIX_TASK_1.md`，必须把本文件完整内容直接注入同一次prompt；不得只发送上面一行或自行摘要Contract。

## 相关文档

- [Increment 8 Task Contract](./INCREMENT_8_TASK_CONTRACT.md)
- [Architecture](./ARCHITECTURE.md)
- [ADR-0002](./ADR/0002-agent-integration-lifecycle.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [MVP Plan](./MVP_PLAN.md)
- [Operations](./OPERATIONS.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
