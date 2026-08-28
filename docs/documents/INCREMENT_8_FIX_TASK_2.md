# Increment 8 Fix Task 2 — TOML Dotted-key Table Context

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（仅在用户人工派发后）；actual installed-plugin consumer evaluation 由 Codex/operator 在另行授权后执行 |
| 创建/确认日期 | 2026-08-27 |
| Review ID | `review-increment-008-codex-002` |
| Parent Task | `increment-008-automatic-project-setup` |
| Lineage baseline | `0872dda067c6af4d7333c58da8d9ac2a967acce2` |
| Current manual dispatch HEAD | `0872dda067c6af4d7333c58da8d9ac2a967acce2`；派发前重新读取 live Git |
| Target | `main` / `D:/agent/case/codex-claudecode-room` |

```yaml
task_id: increment-008-automatic-project-setup-fix-002
room_id: agent-room-main
type: fix
parent_task_id: increment-008-automatic-project-setup
based_on_review_id: review-increment-008-codex-002

background: >
  Increment 8 Fix Task 1 Coding 已覆盖冻结的 top-level agent_room dotted URL grammar、
  top-level other-server ownership conflict 与 offline consumer-evidence 边界；Codex 独立
  验证 focused setup 10/10、packaging 20/20、scope 1/1、typecheck 与 full suite 273/273
  通过。Fix Review 2 仍确认一项 Medium finding：现有 dotted classifier 按整份 TOML
  逐行匹配，没有保留当前 table context，因此把 `[unrelated]` table 内的
  `mcp_servers.agent_room.url` 误判为 top-level project binding。public helper CLI 在
  runtime 缺失时错误拒绝该合法 existing config；valid runtime 路径也可能把嵌套同名
  key 当作 matching binding 或 other-server ownership。用户已确认该 finding 与以下最小方案。

goal: >
  仅闭合 review-increment-008-codex-002 的 confirmed finding：让现有窄 config classifier
  保留判断冻结 dotted URL assignment 是否位于 TOML top-level 所需的最小 table context，
  从而保留 unrelated table 内的嵌套同名 key，并继续对真正 top-level agent_room/other-server
  dotted assignment 执行 Fix Task 1 已冻结的 matching、mismatch、ownership 与零写入语义。

confirmed_findings:
  - finding_id: inc8-r2-dotted-key-table-context
    solution: >
      在 setup-project.ts 现有单一 config classifier 中按行序保留必要的 TOML current-table
      context。只有位于第一个 active table header 之前的冻结 dotted URL assignment 才按
      top-level agent_room/other-server binding 分类；`[unrelated]` 等 table header 后的同名
      dotted key 属于该 table，不得作为 project binding 或 URL ownership conflict。增加
      helper public CLI direct regression，分别证明 missing runtime 与 valid runtime 路径会
      逐字保留 unrelated table 内容、建立或补齐真正的 top-level agent_room binding，并保持
      Fix Task 1 的全部 top-level regression。不引入 generic TOML parser/dependency、兼容层
      或第二 authority。

requirements:
  - 只修复`review-increment-008-codex-002`的`inc8-r2-dotted-key-table-context`；`review_fixes_only`。
  - 复用`setup-project.ts`现有单一config classifier；只增加判断冻结dotted assignment是否处于TOML top-level所需的最小table context，不新增第二套scanner或parser authority。
  - top-level context只由现有按行config读取过程确定。遇到active table header后，后续key属于当前table，直到下一个table header；本Fix不尝试把table内key重新解释为root key。
  - `[unrelated]`下的`mcp_servers.agent_room.url = "..."`不得被`findAgentRoomDottedUrls`视为top-level agent_room binding；runtime缺失时helper必须按fresh setup成功，而不是返回`runtime binding is missing`。
  - fresh成功必须逐字保留existing unrelated config内容，并只追加一次真正的top-level`[mcp_servers.agent_room]`及generated expected URL；runtime/gitignore继续按原Accepted Contract生成。
  - valid runtime且config只有unrelated table内的nested agent_room dotted URL时，不论nested URL是否等于expected URL，都不得把它当作matching binding或mismatch；helper必须逐字保留该table并追加一次matching top-level agent_room section。
  - valid runtime且unrelated table内存在`mcp_servers.other.url = "<expected-url>"`时，不得按top-level other-server ownership conflict拒绝；helper必须保留该table并追加matching top-level agent_room section。
  - 真正top-level的三种agent_room dotted grammar与bare-key other-server dotted grammar继续保持Fix Task 1行为：matching复用、different URL mismatch、other-server exact URL ownership conflict、missing runtime conflict-before-allocation与全部reject零写入。
  - section+dotted混合、table-header/inline binding、fresh/idempotent/probe/bind failure与actual loopback E2E regression继续保持，不删除或弱化既有assertion。
  - focused regression必须通过setup helper public CLI boundary断言exit/result、preserved config内容、唯一追加section、runtime identity与gitignore状态；不得只测试内部regex/helper或从candidate classifier导出expected结果。
  - actual installed-plugin consumer evaluation不属于Claude Coding scope。Claude必须保持`not_run`，不得安装/reload Plugin或用offline test替代；Codex Fix Review批准前仍须按Fix Task 1的Accepted门禁核对真实activation与bundled resource evidence。
  - Claude只把本Fix实际helper/test Diff、verification、deviation与`REVIEW_REQUIRED`candidate事实写入`DEVELOPMENT_LOG.md`；其它项目文档由Codex维护，用户接受前不得把automatic setup提升为Current。

non_goals:
  - 通用TOML parser、AST、dependency、normalization、formatting或existing config修复。
  - 支持multiline string、dynamic key、array/table组合、任意quoted key或全部TOML等价写法。
  - 改写Fix Task 1已冻结的top-level dotted grammar、URL scalar grammar、matching/mismatch/ownership或zero-write语义。
  - 修改`tests/plugin-packaging.test.ts`、Skill正文、front matter、project-setup reference、Plugin manifest、marketplace或scope allowlist。
  - 修改`src/`、root package.json/package-lock.json、dependency、package script、production CLI、MCP、RoomService、Runner、State Machine、SQLite、protocol或active project config。
  - 新Room state、transition、entity、schema/table/migration、Event、error、MCP tool或protocol version。
  - Plugin install/reload、Codex Desktop reload、service/runtime初始化、`room:run`、paid Claude、global config、raw HTTP、direct SQLite、host policy修改或任何Git mutation/cleanup。

architecture_decisions:
  - 本Fix只修正Skill-owned helper对existing TOML config的top-level ownership判断，不改变automatic setup architecture、Room authority、reload lifecycle或production dependency direction。
  - TOML table context只用于排除table内nested dotted assignments；现有literal/regex继续拥有冻结top-level grammar，不引入generic parser。
  - actual consumer activation与bundled resource resolution继续由另行授权的真实installed-plugin evaluation拥有；本Fix不新增offline替代品。

scope:
  - review_fixes_only
  - plugins/agent-room/skills/agent-room/scripts/setup-project.ts中的最小TOML table-context分类
  - tests/plugin-setup.test.ts中的unrelated-table public CLI direct regression
  - docs/documents/DEVELOPMENT_LOG.md中的Fix Coding/verification candidate事实

constraints:
  - 保留原Implementation lineage baseline_head`0872dda067c6af4d7333c58da8d9ac2a967acce2`；Fix不重新执行clean-worktree gate。
  - 当前branch为`main`、live HEAD等于lineage baseline、0 staged；派发前重新读取live branch/HEAD/status并核对candidate ownership。
  - 当前dirty worktree包含同一Increment 8 candidate与Codex-owned Review/Fix文档；不得覆盖、回滚、拆分、stage、格式化或修改scope外candidate及Codex文档。
  - 当前项目缺少`.agent-room/runtime.json`与`.codex/config.toml`，无法通过durable Room提交Fix；人工派发必须完整注入本Contract，不得运行candidate setup猜测binding。
  - 用户本次确认只使Fix Task 2进入Accepted/`FIX_PLAN_READY`；不授权Codex启动Claude，不授权Plugin install/reload或actual consumer evaluation，也不授权任何Git写操作。
  - tests使用temporary owner directory并在finally释放handle、server、database、process与fixture；不得访问external network或operator全局Codex settings。
  - 如果正确修复需要scope外Skill/reference/Plugin/source/package/protocol/dependency变化，停止并返回`needs_decision`。

acceptance_criteria:
  - missing runtime + unrelated table内nested agent_room dotted URL不再误报binding conflict；helper fresh setup成功，preserve existing table bytes并追加唯一matching top-level agent_room section。
  - valid runtime + unrelated table内nested agent_room dotted URL不再被当作matching或mismatch；valid runtime + nested other-server exact URL不再被当作ownership conflict；两类均保留原table并补齐matching top-level section，existing五字段identity不漂移。
  - 全部真正top-level dotted matching/conflict/zero-write regression继续通过，table-header/inline/fresh/idempotent/probe/service/E2E行为无回归。
  - helper仍只使用Node.js standard library，不spawn process，不增加parser/dependency/second authority。
  - focused setup、packaging、scope、typecheck与full suite全部通过；live Fix-owned净新增Diff仅包含本Fix允许路径，automatic setup仍为candidate。
  - actual installed-plugin consumer evaluation由Codex/operator在另行授权后真实执行；未运行时保持`not_run`，Fix Review不得批准该验收项。

verification:
  - command: node --test "tests/plugin-setup.test.ts"
    detects: nested dotted key是否仍被误判为top-level binding/ownership、existing unrelated config是否被覆盖、真正top-level regression是否退化，或runtime identity/section数量是否错误。
    decision_if_failed: 只修复现有classifier的table-context判断与focused fixture；不得新增generic TOML parser/dependency或放宽top-level conflict语义。
  - command: node --test "tests/plugin-packaging.test.ts"
    detects: helper改动是否意外破坏唯一Skill metadata、setup discovery、helper/reference packaging或既有workflow negative Oracle。
    decision_if_failed: 只修复由本Fix helper改动造成的task-owned regression；不得修改packaging test、Skill/reference或把offline parser重新声明为actual consumer。
  - command: node --test "tests/scope.test.ts"
    detects: Fix是否越过Increment 8 exact plugin/source/package/dependency boundary。
    decision_if_failed: 不放宽allowlist；移除Fix新增越界Diff或返回needs_decision。
  - command: npm run typecheck
    detects: table-context classifier或focused fixture是否产生TypeScript drift。
    decision_if_failed: 仅修复本Fix类型问题；不得使用any、ts-ignore、skipLibCheck、dependency或wrapper规避。
  - command: npm test
    detects: Fix是否破坏Increment 1-7 Protocol/Room/Git/Runner/MCP/CLI/Plugin workflow或Increment 8其它setup行为。
    decision_if_failed: 只修复task-owned regression；不得删除/弱化既有assertion或扩大production scope。
  - command: actual installed-plugin Skill consumer evaluation（Codex/operator；需另行授权）
    detects: candidate Plugin是否能被真实consumer加载，唯一Skill是否按direct/indirect/negative/boundary request正确activation/routing，以及bundled helper/reference是否在安装后解析。
    decision_if_failed: 记录exact Codex version、安装来源、conversation/prompt、activation与resource evidence；只修复已确认Skill/package缺陷。未授权或未运行时保持pending。
  - command: git diff --name-only / git status --short --branch
    detects: Fix净新增path、branch、HEAD、staged/untracked状态或candidate ownership是否漂移。
    decision_if_failed: 不stage、清理、回滚或重定baseline；报告无法安全分离的drift并停止。

documentation_updates:
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录Fix Task 2实际helper/test Diff、table-context direct Oracle、live verification、deviation、actual consumer pending与`REVIEW_REQUIRED`candidate事实；用户接受前不提升Current capability。

question_policy: >
  若正确修复需要generic TOML parser/dependency、修改Skill正文/reference/packaging/scope、
  修改src/root package/lock/dependency/script、production config、Room state/transition/entity/
  schema/Event/error/MCP/Runner/CLI/protocol，安装/reload Plugin、启动service/runtime/room:run/
  paid Claude、global config/raw HTTP/direct SQLite、host policy或任何Git mutation，停止受影响
  工作并返回needs_decision。table-context局部helper命名、single-pass组织、parameterized fixture结构与
  test title可在本Contract冻结行为内作最小选择，并在Coding Result记录。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: 2026-08-27
```

## 人工派发边界

- 用户已确认Review 2的`inc8-r2-dotted-key-table-context` finding与上述最小solution，因此本Fix Task为`Accepted`，项目阶段为`FIX_PLAN_READY`。
- 当前项目没有有效Room binding，无法调用`room_submit_task`；这不授权运行candidate setup。用户可在原Increment 8 Claude session/conversation中人工派发本文，或另行授权Codex使用可验证的Room workflow。
- 本次确认不授权Codex启动Claude，也不授权actual installed-plugin consumer evaluation、Plugin install/reload、service/runtime初始化、manual smoke或任何Git写操作。
- 派发前必须确认`main`、live`HEAD`、原lineage baseline、0 staged与candidate path ownership；Fix继续继承原lineage baseline，不要求dirty worktree clean。
- 客户端能可靠解析`@<path>`时使用下方指令；不能解析时必须直接注入本文全文，不得只发送finding摘要。

## 人工派发指令

```text
执行 @docs/documents/INCREMENT_8_FIX_TASK_2.md 中已批准的完整 Fix Task。严格遵守其中的 confirmed_findings、review_fixes_only、scope、non_goals、constraints、acceptance_criteria、verification、documentation_updates 和 question_policy；只修正 setup helper 的最小 TOML table-context 分类及对应 unrelated-table public CLI regression。不要修改 Skill/reference/packaging，不要安装或 reload Plugin，不要把 offline test 声称为 actual consumer validation。完成后按 ROOM_PROTOCOL.md 的 Coding Result Contract 返回完整结果。不要执行 stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout、stash删除、runtime初始化或其它清理操作。
```

如果人工客户端不能可靠解析`@docs/documents/INCREMENT_8_FIX_TASK_2.md`，必须把本文件完整内容直接注入同一次prompt；不得只发送上面一行或自行摘要Contract。

## 相关文档

- [Increment 8 Task Contract](./INCREMENT_8_TASK_CONTRACT.md)
- [Increment 8 Fix Task 1](./INCREMENT_8_FIX_TASK_1.md)
- [Architecture](./ARCHITECTURE.md)
- [ADR-0002](./ADR/0002-agent-integration-lifecycle.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [MVP Plan](./MVP_PLAN.md)
- [Operations](./OPERATIONS.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
