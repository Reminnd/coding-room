# Increment 8 Task Contract — Agent Room 自动项目 Setup

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（仅在完整 Contract 获用户确认、状态改为 `Accepted` 且 dispatch gate 满足后） |
| 创建日期 | 2026-08-27 |
| 用户确认日期 | 2026-08-27；用户明确确认完整 Contract |
| 用户已确认输入 | setup 自动创建或合并 `.codex/config.toml` 与 `.gitignore`；自动生成 `database_path`、`port`、`room_id`；`agent_room_root` 由 operator 首次提供一次 |
| Parent goal | Increment 8 — Automatic Project Setup |
| Planning main HEAD | `992a32e28869ac745d6cd5bae6a761f5aba045c4` |
| Dispatch baseline | 用户已授权提交本Accepted planning scope并选择人工派发；本commit完成且worktree clean后，从live Git读取exact`HEAD`作为manual dispatch baseline |
| 评审目标 | 用单一 Agent Room Skill 自动建立 project-local binding、启动 Room service，并在 Codex Desktop reload 后创建和验证 Room |

## 1. Accepted 结论与授权边界

用户已确认自动 setup 的核心输入与生成规则：operator 只在首次 setup 提供一次 `agent_room_root`；Skill 自动创建或保守合并 `.codex/config.toml` 与 `.gitignore`，并自动生成 `database_path`、`port`、`room_id`。本 Contract 将这些决定收敛为可实现、可测试和可运维的完整范围。

用户已于2026-08-27明确确认本文件全部 `requirements`、`non_goals`、`architecture_decisions`、`scope`、`constraints`、`acceptance_criteria`、`verification`、`documentation_updates` 与 `question_policy`，因此 `confirmed_by_user=true`，项目阶段进入 `PLAN_READY`。用户随后单独授权提交本Accepted planning文档范围并选择暂时自行人工派发；该授权不允许Codex启动Claude/service，也不免除commit后clean exact baseline、live dispatch metadata与完整Contract注入门禁。Implementation通过Review、获用户接受并进入版本化`main`前不得把automatic setup写成Current capability。

```yaml
task_id: increment-008-automatic-project-setup
room_id: agent-room-main
type: implementation
parent_task_id: null
based_on_review_id: null

background: >
  Increment 7 已交付可安装的单一 Agent Room Skill、project-scoped MCP binding template、
  local-only runtime.json 与多项目隔离，但 project setup 仍是人工 prerequisite：operator 必须自行选择
  database、port、Room ID，创建或合并配置并启动 room:serve。manual Codex Desktop smoke 因当前项目缺少
  .codex/config.toml、.agent-room/runtime.json 与已运行 service 而无法继续。现有 Room MCP 已提供
  room_create，现有 runtime 已提供 room:serve，因此自动 setup 不需要增加 Room protocol 或 production CLI。

goal: >
  在现有唯一 Agent Room Skill 中增加显式、可重复的 project setup mode：operator 首次只提供
  agent_room_root，Skill 自动为当前项目生成并持久化其 database_path、loopback port、room_id 与
  project_path，保守创建或合并 .codex/config.toml、.gitignore 和 .agent-room/runtime.json，启动对应
  room:serve；Codex Desktop reload 后继续使用现有 room_create 与 room_get_state 完成 Room 建立和绑定验证，
  且不触发 room:run、Claude process、Git mutation或host approval policy修改。

requirements:
  - 保留现有唯一 authoritative `plugins/agent-room/skills/agent-room/SKILL.md`；在其 discovery description 与正文中增加显式 setup mode，不创建第二 Skill、App、hook、MCP bundle、daemon manager或global config。
  - setup mode 只有在 operator 明确请求为当前项目初始化 Agent Room 时进入；普通 workflow 继续要求现有binding通过校验，missing binding不得静默触发setup。
  - operator首次setup只提供`agent_room_root`。Skill必须把它解析为absolute path，并验证该目录存在、其`package.json`同时定义`room:serve`与`room:run`；失败时在任何目标项目写入或service启动前停止。
  - `project_path`必须从当前target workspace按host normal path resolution自动取得absolute path；不得扫描、选择或修改其它project。
  - 新binding的`database_path`固定自动生成为`<project_path>/.agent-room/room.sqlite`的absolute path；helper创建所需parent directory，但database schema仍只由现有`room:serve`初始化。
  - 新binding的`port`通过在`127.0.0.1`请求OS分配available ephemeral port获得并保存为`1..65535`的JSON integer；helper关闭allocation probe后使用同一值生成config/runtime。项目只支持cooperating local operator，不为probe与service bind之间的理论race增加reservation daemon或retry framework；真实bind失败时报告并停止。
  - 新binding的`room_id`自动生成为`room-<UUID>`，UUID使用Node.js standard library；同一首次setup workflow中的runtime write、service command与后续`room_create`必须使用同一值。
  - 新binding的`.agent-room/runtime.json`必须恰好写入`agent_room_root`、`database_path`、`project_path`、`port`、`room_id`五个字段，无额外mirror、secret、hash、timestamp或setup status。
  - `.codex/config.toml`不存在时自动创建parent directory与文件；存在时保留全部原内容，只在没有`[mcp_servers.agent_room]`且没有相同URL冲突时追加该section，URL必须精确为`http://127.0.0.1:<port>/mcp/codex`。已有agent_room section、same URL由其它server占用、无法保守判断或runtime/config mismatch时，在任何写入前停止，不覆盖、不重命名server、不选择第二个port规避。
  - `.gitignore`不存在时自动创建；存在时保留原内容并只补充缺失的local runtime条目：`.agent-room/runtime.json`、`.agent-room/room.sqlite`、`.agent-room/room.sqlite-*`、`.agent-room/artifacts/`。不得覆盖现有ignore rule或自动修改`.git/info/exclude`。
  - 使用Skill-owned deterministic TypeScript helper完成输入校验、现有binding分类、port/UUID生成和三份文件的计划/写入；helper位于该唯一Skill的`scripts/`，只使用Node.js standard library，不新增root package script、dependency、generic config framework或production source module。
  - helper必须先读取并验证全部相关现有文件，再执行任何写入。runtime不存在且config无agent_room binding时生成fresh binding；runtime有效时复用其existing identity并只补齐匹配的config/gitignore；runtime无效、runtime缺失但config已有agent_room binding、或两者不一致时停止且目标文件保持不变。
  - 对完整valid binding重复执行setup必须幂等：复用原`database_path`、`port`、`room_id`与`agent_room_root`，不重写语义相同文件、不创建第二个Room。Skill在启动service前只探测runtime绑定的loopback port：port已开放时不启动第二个process并等待reload后的MCP identity验证；port关闭时才执行一次existing`room:serve`，从而允许先前`service_start_pending`恢复。该probe不是Room identity authority，不增加PID文件、service registry或health scheduler。
  - helper输出deterministic JSON summary，至少包含`mode=created|reused`、五个runtime值、config/gitignore变更摘要、exact room:serve command inputs与`reload_required`；stdout不能成为Room durable authority。
  - fresh文件写入成功后，或reused binding的loopback port关闭时，Skill用已验证的`agent_room_root`执行现有`room:serve`，参数为exact generated/reused database/project/port；使用host支持的background process boundary并等待existing listening success signal。setup不新增service manager、automatic restart、health scheduler或active permission rule；host approval拒绝或service startup失败时保留已生成binding、报告`service_start_pending`并停止。
  - `.codex/config.toml`在当前Codex Desktop task中不能热加载时，Skill明确报告reload required并停止；不得用raw HTTP、另一个project MCP、global Codex config或operator direct database mutation绕过project-scoped MCP加载边界。
  - reload后operator再次显式调用setup continuation。Skill按现有Step 1/2验证runtime、MCP URL与Room identity；如果exact generated`room_id`尚不存在，只在setup mode调用一次existing`room_create`，随后`room_get_state`必须返回同一Room且state=`DISCUSSION`。同ID Room已存在时按现有idempotency复用；其它MCP error停止并报告。
  - setup完成条件是binding一致、service可连接、Room存在且identity/state可读；完成后只报告结果，不进入Architecture Review、不提交Task、不执行`room:run`、不启动Claude、不自动创建下一turn。
  - 增加focused setup regression，直接覆盖missing files create、existing config/gitignore preserve-and-merge、fresh value shape、valid rerun idempotency、runtime/config mismatch、existing agent_room conflict与冲突前零写入。
  - 增加actual loopback setup E2E：在temporary Git project中使用generated database/port/room_id启动现有room:serve boundary，模拟Codex reload后的project-scoped MCP，调用existing room_create/get_state并到达DISCUSSION；不得启动或付费Claude、执行room:run、依赖external network、固定port、global Codex settings或installed personal Plugin。
  - 更新Plugin packaging与scope regression，直接证明唯一Skill正确路由setup/workflow、helper/reference可发现、无第二Skill/production source/package/dependency漂移，并以Codex Skill validator验证实际Skill package。
  - Claude只更新`documentation_updates`列出的candidate文档；Review、用户接受及版本化提交前不得把automatic setup写成Current capability，也不得修改受保护的PROJECT_RULES或文档索引。

non_goals:
  - 自动推导、扫描或下载`agent_room_root`；Plugin bundle内嵌Agent Room runtime；global install或PATH fallback。
  - 覆盖或通用解析任意TOML；修复目标项目既有invalid config；为config conflict自动重命名server、换port或写第二份binding。
  - 自动reload Codex Desktop、向当前task注入新turn、绕过project-scoped MCP加载或建立raw HTTP fallback。
  - 新Room state、transition、entity、schema/table/migration、Event、error、MCP tool、protocol version、production CLI、root package script或dependency。
  - daemon/service manager、automatic restart、background polling、automatic wakeup/retry、remote/auth、多用户或同Room parallel Runs。
  - `room:run`、Task submission、Architecture Review、Claude process、自动Fix/accept或任何paid smoke。
  - 自动stage、commit、push、merge、rebase、reset、clean、checkout、branch/worktree操作，或为保持clean worktree自动修改tracked `.codex/config.toml`的Git状态。
  - 创建、修改、放宽或绕过host approval、sandbox、rules、trusted-project或active prefix rule。

architecture_decisions:
  - 自动setup属于现有Codex Skill的显式模式和project-local deployment convenience，不是Room lifecycle state或第二持久化authority；SQLite、Git、Room MCP与Runner ownership保持不变。
  - 重复、确定性的file merge与value generation由Skill-owned TypeScript helper完成；Skill保留用户意图、host process approval、MCP continuation与停止条件的orchestration判断。
  - `agent_room_root`由operator提供并持久化；`project_path`来自当前workspace；database、port与Room ID按冻结规则自动生成。shared Plugin继续不硬编码machine-specific value。
  - setup采用reload boundary前后两段：第一段建立binding并启动service，第二段经project-scoped MCP创建/验证Room。该边界复用Codex Desktop现有配置加载行为，不增加global config或HTTP旁路。
  - Room creation继续由existing`room_create`拥有；database schema继续由existing`room:serve`拥有。helper不直接写SQLite，也不复制Room entity/Event。
  - setup request只授权当前项目的binding文件与Room service启动；`room:run`仍保持独立one-shot approval和现有Room workflow gate。

scope:
  - plugins/agent-room/skills/agent-room/SKILL.md
  - plugins/agent-room/skills/agent-room/references/project-setup.md
  - plugins/agent-room/skills/agent-room/scripts/setup-project.ts
  - tests/plugin-setup.test.ts
  - tests/plugin-packaging.test.ts的setup discovery/packaging regression
  - tests/scope.test.ts的Increment 8 exact boundary更新
  - docs/documents/ARCHITECTURE.md、MVP_PLAN.md、OPERATIONS.md、DEVELOPMENT_LOG.md、ADR/0002-agent-integration-lifecycle.md的candidate同步
  - 不修改src/、package.json、package-lock.json、.agents/plugins/marketplace.json、Plugin manifest或active project config；发现需要时返回needs_decision

constraints:
  - Coding必须从包含Accepted Contract与同步文档的clean exact main baseline开始；Claude不得执行Git write、commit、push、branch/worktree、reset、clean或cleanup。
  - helper只处理当前project和operator提供的agent_room_root；不得枚举其它workspace、database、Room、port reservation或Plugin installation。
  - conflict、invalid existing binding与service bind failure是supported failure；必须返回可定位结果，不得通过覆盖、删除、second identity或silent retry制造成功。
  - setup修改`.codex/config.toml`可能使tracked target config产生Git Diff；Skill如实报告，由operator按目标项目Git规则处理，不自动stage/commit/ignore tracked change，也不绕过后续clean-worktree gate。
  - 自动化测试使用temporary owner directory并在finally关闭server/database/process handle与删除fixture；只验证项目支持路径，不增加symlink race、exotic encoding、port reservation daemon或generic rollback framework。
  - 文档与必要代码注释默认使用简体中文；code、identifier、command、field与technical term保持English。

acceptance_criteria:
  - operator在fresh target project只提供valid agent_room_root后，setup自动生成matching absolute database/project path、OS-assigned loopback port、unique room_id，并创建valid exact-five-field runtime.json、project-scoped MCP config与required gitignore entries。
  - existing unrelated `.codex/config.toml`和`.gitignore`内容逐字保留；missing entries只追加一次；valid setup重复执行不改变identity、文件语义或启动第二service/Room。
  - invalid agent_room_root、existing binding conflict、runtime/config mismatch在任何文件写入、service启动或Room创建前拒绝；直接证据证明目标文件前后不变。
  - fresh setup启动existing room:serve并报告reload required；reload后的setup continuation只用project-scoped MCP创建或复用exact room_id，最终room_get_state返回同一Room与DISCUSSION。
  - setup workflow从未调用room:run、runClaude、room_submit_task或其它后续workflow command，不启动paid Claude、不修改host policy、不执行Git mutation。
  - Skill package保持唯一authoritative Skill，新增helper/reference可发现且通过actual Codex Skill validator；root package scripts/dependencies、production src与Room protocol完全不变。
  - focused setup、packaging、scope、typecheck与full regression全部通过；candidate文档与实际setup/reload/failure边界一致且接受前保持Draft/candidate措辞。

verification:
  - command: node --test "tests/plugin-setup.test.ts"
    detects: fresh value/file generation错误、existing content被覆盖、conflict后partial write、rerun identity漂移、helper output不稳定，或setup误触发room:run/Claude/Git mutation。
    decision_if_failed: 只修复Skill/helper及focused fixture；不得新增generic config framework、production CLI或放宽conflict语义。
  - command: node --test "tests/plugin-packaging.test.ts"
    detects: setup mode未被唯一Skill发现或路由、helper/reference缺失、Skill metadata/YAML/consumer grammar无效、第二Skill/active permission/global config/production bundle越界。
    decision_if_failed: 修复task-ownedSkill packaging；不得复制authority、修改marketplace shape或删除既有workflow gate。
  - command: node --test "tests/scope.test.ts"
    detects: src、package、dependency、manifest、marketplace、test或Plugin file超出本Contract exact allowlist。
    decision_if_failed: 删除越界实现；正确实现若必须改变production boundary则返回needs_decision。
  - command: npm run typecheck
    detects: setup helper、focused tests或existingTypeScript contract发生类型漂移。
    decision_if_failed: 修复task-owned类型问题；不得使用any、ts-ignore、skipLibCheck或compatibility wrapper。
  - command: npm test
    detects: Increment 1-7 Protocol/Room/Git/Runner/MCP/CLI/Plugin workflow regression，或新增focused test未进入full suite。
    decision_if_failed: 只修复task-owned regression；不得放宽既有assertion或跨scope重构。
  - command: manual Codex Desktop fresh-project setup and reload continuation smoke
    detects: Skill无法从operator-provided root自动创建binding、无法启动room:serve、project-scoped config reload后无法room_create/get_state，或setup意外进入room:run/Claude path。
    decision_if_failed: 记录exacthost/version/file/process/MCP evidence并修复Skill/setup boundary；不得改用global config、raw HTTP、operator手工补文件或paid Claude伪造通过。

documentation_updates:
  - path: docs/documents/ARCHITECTURE.md
    expected_change: candidate setup mode、Skill/helper责任、自动value/file flow与reload boundary；不改变Room authority或protocol version。
  - path: docs/documents/ADR/0002-agent-integration-lifecycle.md
    expected_change: 接受后记录explicit setup、service startup与Codex reload continuation的lifecycle澄清；Draft/Coding阶段只写candidate事实。
  - path: docs/documents/MVP_PLAN.md
    expected_change: Increment 8目标、范围、非目标与acceptance；接受前保持Draft。
  - path: docs/documents/OPERATIONS.md
    expected_change: candidate automatic setup输入、生成规则、reload handoff、成功信号与conflict/service failure处置。
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 用户已确认inputs、Draft Contract、planning HEAD、未授权Implementation/Git/paid smoke与下一门禁。

question_policy: >
  如果正确实现需要自动推导agent_room_root、修改src/root package/Plugin manifest/marketplace/dependency、
  增加production CLI/MCP/protocol/state/schema/Event/error、直接写SQLite、global Codex config、raw HTTP fallback、
  自动reload/notification、daemon/service manager、room:run/paid Claude、Git mutation或超出当前project的filesystem操作，
  停止受影响工作并返回needs_decision。helper内部函数组织、JSON summary字段顺序、UUID变量名、temporary fixture结构与
  Skill章节组织由Claude按existing style作最小选择并在Coding Result记录。

confirmed_by_user: true
created_by: codex
created_at: 2026-08-27T00:00:00Z
```

## 2. 已确认的完整实现细节

用户已确认以下输入规则及本Contract全部实现边界，Implementation不得拆分、省略或以摘要替代：

1. `.codex/config.toml`与`.gitignore`由setup自动创建或合并。
2. `database_path`、`port`、`room_id`由setup自动生成。
3. `agent_room_root`由operator首次提供一次，随后保存在runtime binding中复用。

4. deterministic helper、固定database path、ephemeral port/UUID规则、reload前后两段workflow、conflict/idempotency、scope、non-goals、verification与documentation updates全部属于本Accepted Contract。

任何一项需要越过`scope`、`non_goals`、`constraints`或`question_policy`时，Claude必须返回`needs_decision`，不得以部分完成冒充交付。
