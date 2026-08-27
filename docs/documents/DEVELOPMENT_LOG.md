# 开发日志

## 当前状态

- 日期：2026-08-27
- 项目阶段：PLAN_READY / Increment 8 Accepted Contract / documentation baseline commit已授权 / 用户人工派发
- Room runtime state：当前未启动 service；bootstrap transport 已 `Superseded`。Room MCP/Status CLI/runtime command 已为 Current capability，由 operator 使用显式参数启动或查询
- Architecture：Increment 1–7已接受；Increment 8 Accepted target保持既有Room authority与protocol不变，在唯一Skill增加automatic project setup与reload continuation
- Implementation Task：[Increment 8 Accepted Contract](./INCREMENT_8_TASK_CONTRACT.md)已获用户完整确认，`confirmed_by_user=true`；全部requirements、scope、non-goals、acceptance、verification、documentation updates与question policy已冻结，automatic setup尚未实现
- Previous Increment：Increment 4 Fix 1/2/3 已完成；Review `review-increment-004-codex-004` 无 finding、Decision 为 `approved`；用户已明确接受并完成版本化提交
- 业务代码：`src/protocol`（schema/types/errors）、`src/room`（repository/state-machine/room-service/state-snapshot）、`src/git`（git-process/git-observer）、`src/runner`（claude-process/claude-stream/claude-runner；`main` Current implementation）、`src/mcp`（http/tools/serve；`main` Current implementation）、`src/cli`（status/run；均为`main` Current implementation）；Current packaging：`plugins/agent-room/`（`.codex-plugin/plugin.json`、`skills/agent-room/SKILL.md`、`references/project-setup.md`）与`.agents/plugins/marketplace.json`
- Git repository：branch=`main`；Increment 8 planning HEAD=`992a32e28869ac745d6cd5bae6a761f5aba045c4`。本轮仅有Codex-owned Accepted planning文档变更；未执行stage、commit、push、Claude启动、service启动、runtime初始化或产品`room:run`

## 已完成

### 2026-08-27 — Increment 8 Documentation Baseline 与人工派发授权

- 用户明确授权提交当前Increment 8 Accepted planning文档范围，commit message遵循Conventional Commits：`docs(agent-room): accept automatic project setup contract`。
- 用户选择暂时自行人工派发完整[Increment 8 Accepted Contract](./INCREMENT_8_TASK_CONTRACT.md)；Codex不启动Claude或service。manual dispatch必须使用本commit完成后的clean live Git exact`HEAD`并完整注入Contract。
- 授权不覆盖Plugin implementation、Claude/Room service启动、implementation commit、push、branch/worktree、runtime初始化、manual paid smoke、stash删除或其它清理。
- Documentation impact audit：`documentation: updated`。

### 2026-08-27 — Increment 8 完整 Contract 确认

- 用户明确回复“确认 Increment 8 完整 Contract”，确认全部requirements、non-goals、architecture decisions、scope、constraints、acceptance criteria、verification、documentation updates与question policy。
- [Increment 8 Task Contract](./INCREMENT_8_TASK_CONTRACT.md)更新为`Accepted`、`confirmed_by_user=true`，阶段从`WAITING_FOR_USER_CONFIRMATION`进入`PLAN_READY`；automatic setup仍不是Current capability。
- ADR-0002新增Accepted setup lifecycle澄清；Architecture、MVP Plan、Operations、Project Rules与文档中心同步为Accepted target。
- 本次确认不授权stage/commit、跳过clean documentation baseline、Claude/service启动、`room:run`、runtime初始化或paid smoke。
- Documentation impact audit：`documentation: updated`。

### 2026-08-27 — Increment 8 Automatic Project Setup Draft

- 用户确认`.codex/config.toml`与`.gitignore`由setup自动建立或保守合并，`database_path`、`port`、`room_id`自动生成，`agent_room_root`由operator首次提供一次并持久化复用。
- [Increment 8 Draft Contract](./INCREMENT_8_TASK_CONTRACT.md)将其收敛为单一Skill显式setup mode、Skill-owned deterministic helper、loopback service start、Codex Desktop reload与project-scoped `room_create`/`room_get_state` continuation；Room protocol/state/schema/authority保持不变。
- 完整Contract尚待用户确认，`confirmed_by_user=false`；未修改Plugin、tests、production source/config、ADR-0002或Room protocol，未启动service/Claude，未执行Git写操作或paid smoke。
- Documentation impact audit：`documentation: updated`。同步Project Rules、文档中心、Architecture candidate、MVP Plan、Operations candidate与本日志；automatic setup未写成Current。

### 2026-08-27 — Increment 7 Fix Task 3 Coding 完成（candidate，REVIEW_REQUIRED）

- task_id：`increment-007-codex-plugin-multi-project-fix-003`（Review ID `review-increment-007-codex-004`）。`review_fixes_only=true`；仅改写唯一Skill front matter description scalar表示与packaging test对应局部parser/negative Oracle，未触碰Skill正文、Decision resume组合语义、marketplace、project setup、plugin manifest、two-project E2E、scope regression、`src/`、package/lock、dependency、package script、production config或protocol。
- Finding `inc7-r4-frontmatter-yaml-invalid` 闭合：唯一`SKILL.md`的front matter仍从第一个字符以`---`开始、保留exact `name: agent-room`；现有trigger-oriented `description`改为合法YAML double-quoted scalar（冻结值逐字符一致，仅scalar表示变化，不改写语义或增加非目标能力）。`binding: validate`的colon-space现位于double-quoted scalar内，标准YAML parser不再以mapping values are not allowed here拒绝；Skill正文、Step 3/Step 4、Decision answer(false/true)、CODING零launcher、baseline/session、approval与durable reread语义零改动。
- Direct Oracle：`tests/plugin-packaging.test.ts`的局部parser不再按第一个colon拆分任意value——name只接受未引用且不含colon-space的plain scalar；description必须解析为JSON-compatible double-quoted scalar（直接`JSON.parse`取回内容并断言non-empty string），任何未引用形态都被拒绝。新增当前错误形态的direct negative fixture（未引用description含`binding: validate`，parser断言失败）；heading-first与无delimiter两条既有negative evidence保留。front matter测试另增加exact断言：`JSON.parse`取回的description与测试侧frozen literal逐字符一致；既有五个trigger词与五项非目标能力断言不变。
- Verification（live）：先以新Oracle对修复前SKILL.md运行focused packaging，17/18通过、唯一失败正是真实未引用description被JSON.parse拒绝（证明Oracle能检测当前错误形态）；修正后`node --test "tests/plugin-packaging.test.ts"` 18/18通过；`node --test "tests/multi-project-e2e.test.ts"` 1/1通过；`node --test "tests/scope.test.ts"` 1/1通过；`npm run typecheck`通过；`npm test` 261/261通过 exit 0；`git diff --name-only`与派发时基线一致（仅9个预存在Codex文档与`tests/scope.test.ts`路径，无新增tracked路径）；`git status --short --branch` `main`、HEAD=`c9b5985`、0 staged，untracked均为本Increment候选path。未启动真实或paid Claude process、未访问network、未安装Plugin、未执行runtime初始化。
- Deviations（question_policy允许的最小选择）：未引用`binding: validate` negative fixture组织在既有front matter测试内（不新增测试项，18项总数不变）；name plain scalar合法性按“未引用且不含colon-space”作最小约束；frozen description以测试侧literal引入并做exact equality断言。
- 状态：`completed`（Coding Result按ROOM_PROTOCOL契约返回）。Fix Coding为candidate，等待Codex下一轮Fix Review；未commit、未stage、未提升Plugin为Current、未执行任何Git写操作或runtime初始化。

### 2026-08-27 — Increment 7 Fix Task 3 Review 5（approved，用户已接受，ACCEPTED）

- Review ID：`review-increment-007-codex-005`。输入为Accepted Fix Task 3 Contract、原Implementation lineage baseline `b9ebeffdcc8dd9c34718111b50fa3605a21ad17e`、当前`main`/`HEAD=c9b59855beb4528de6800106123913f9a237b06e`、完整staged/unstaged/untracked task-owned Diff、Fix Coding Result、Plugin/Skill/setup、packaging/two-project/scope tests与Current/Accepted文档；Review前0 staged，baseline为HEAD ancestor，candidate path ownership与派发时一致。
- Findings：无。唯一Skill front matter仍以第一个字符`---`开始，`name: agent-room` exact；`description`现为冻结值逐字符一致的合法YAML double-quoted scalar，`binding: validate`位于quoted scalar内。Skill正文、Decision continuation、baseline/session、approval、durable reread、Room lifecycle与production source未发生非scope变化。
- Direct Oracle与回归：修复前新Oracle对真实未引用`binding: validate`形态返回预期拒绝（focused packaging 17/18，唯一失败为该负向证据）；修复后`node --test "tests/plugin-packaging.test.ts"` 18/18、`node --test "tests/multi-project-e2e.test.ts"` 1/1、`node --test "tests/scope.test.ts"` 1/1、`npm run typecheck`与`npm test` 261/261均通过。独立标准YAML解析实际Skill front matter通过；heading-first、无delimiter与未引用colon-space均被Oracle拒绝。
- Review Decision：`approved`。用户已明确接受，阶段进入`ACCEPTED`；版本化 `main` commit 为 `97005f54555f6485c79f15860a58fe79c3ed593d`。Plugin与跨项目runtime现为Current capability，不执行manual Codex Desktop/paid Claude smoke。
- Git与权限：Review前为`main`、`HEAD=c9b5985`、0 staged；提交后为`main`、`HEAD=97005f5`，测试与文档回写后无未提交漂移；用户明确授权本次版本化 commit，未授权push、runtime初始化、产品`room:run`或其它Git写操作。
- Fix 经验回收：该 finding 形成一条可复用规则——声明 metadata 可被标准格式加载时，测试 Oracle 必须对真实 consumer grammar 做独立验证；局部 parser 只能验证冻结字段子集，并对已知 malformed scalar 提供 direct negative fixture。规则写入 [CODEX_REVIEW_AND_PLANNING.md](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)。
- Documentation impact audit：`documentation: updated`。同步Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations与本日志的接受状态、真实commit hash和Review证据；无architecture、protocol version或runtime command变化。

### 2026-08-27 — Increment 7 Review 4 方案确认与 Fix Task 3

- 用户明确确认`review-increment-007-codex-004`的High finding `inc7-r4-frontmatter-yaml-invalid`与最小方案：把唯一Skill的现有description改为合法YAML quoted/block scalar，并让测试侧局部parser直接拒绝当前未引用colon-space形态，不增加dependency、generic YAML framework或第二Skill。
- [Increment 7 Fix Task 3](./INCREMENT_7_FIX_TASK_3.md)已创建为`Accepted`，`review_fixes_only=true`、`confirmed_by_user=true`，继承原Implementation lineage baseline `b9ebeffdcc8dd9c34718111b50fa3605a21ad17e`；冻结为double-quoted description、JSON.parse局部Oracle与malformed `binding: validate` negative fixture。
- Fix scope仅允许`SKILL.md` front matter description scalar表示、`tests/plugin-packaging.test.ts`对应局部parser/negative Oracle与本日志candidate事实；Skill正文、Decision resume组合语义、其它Plugin/test、`src/`、package/lock、dependency、production config与protocol均为非目标。
- 阶段从`REVIEW_DISCUSSION`进入`FIX_PLAN_READY`。本次确认不授权Codex启动Claude或执行任何Git写操作；等待用户选择在原lineage/session人工派发或另行明确授权。Plugin保持candidate/unavailable，manual Codex Desktop smoke继续pending。
- Documentation impact audit：`documentation: updated`。同步Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations与本日志为confirmed solution/Fix gate；不改变architecture、protocol version或Current capability。

### 2026-08-27 — Increment 7 Fix Task 2 Review 4（changes_requested）

- Review ID：`review-increment-007-codex-004`。输入为Accepted Implementation/Fix Contracts、lineage baseline `b9ebeffdcc8dd9c34718111b50fa3605a21ad17e`、docs-only successor `HEAD=c9b59855beb4528de6800106123913f9a237b06e`、完整staged/unstaged/untracked task-owned Diff、Fix Coding Result、Plugin/Skill/setup、packaging/two-project/scope tests与Current/Accepted文档；当前`main`、0 staged，baseline为HEAD ancestor且baseline..HEAD只有两项Codex-owned documentation commits，未执行Git写操作。
- Review 3的Decision resume finding已闭合：Skill明确区分open Question与answered `NEEDS_DECISION` continuation，后者可进入Step 4且省略caller baseline；`answer_changes_contract=true`与`CODING`继续零launcher，没有发现Room lifecycle、baseline/session ownership或production runtime回归。
- High `inc7-r4-frontmatter-yaml-invalid`：`SKILL.md:3`的front matter `description`是未加引号plain scalar，其中`binding: validate`包含YAML mapping delimiter（colon + space）。标准PyYAML `safe_load`以`mapping values are not allowed here`拒绝（line 2 column 143），因此唯一Skill仍不能满足“合法、可加载YAML front matter”验收。`tests/plugin-packaging.test.ts`的局部parser只按每行第一个colon拆分，focused packaging仍18/18通过，说明Oracle没有验证真实YAML scalar合法性。最小方向是把description改成合法quoted/block scalar，并让测试侧局部parser直接拒绝当前未引用colon-space形态；不增加dependency、generic YAML framework或第二Skill。
- Review Decision：`changes_requested`。阶段进入`REVIEW_DISCUSSION`；用户确认finding与最小方案前不生成或派发下一Fix Task。manual Codex Desktop smoke不执行：Skill当前仍不能通过标准YAML加载，真实paid Claude不能改变Review结论。
- Verification：`node --test "tests/plugin-packaging.test.ts"` 18/18通过；独立`yaml.safe_load`对实际front matter失败；live Git branch/HEAD/ancestry/docs-only successor/0 staged与candidate path ownership核对通过。已知finding已决定Review，未重复运行Coding Result报告已通过的typecheck、two-project/scope与全量261项。
- Documentation impact audit：`documentation: updated`。同步Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations与本日志为Review 4结果；不改变architecture/protocol version/运维命令，不提升Plugin为Current。

### 2026-08-27 — Increment 7 Fix Task 2 Coding 完成（candidate，REVIEW_REQUIRED）

- task_id：`increment-007-codex-plugin-multi-project-fix-002`（Review ID `review-increment-007-codex-003`）。`review_fixes_only=true`；仅改写唯一Skill与packaging test两项scope path，未触碰marketplace、project setup、plugin manifest、two-project E2E、scope regression、`src/`、package/lock、dependency、package script或production config。
- Finding `inc7-r3-skill-frontmatter-missing` 闭合：唯一`SKILL.md`现以最小YAML front matter开始——`name: agent-room` exact、trigger-oriented `description`（何时使用Agent Room workflow：project-local `.agent-room/runtime.json` binding、planning、one-shot Claude Run、Question、Review/Fix与acceptance），不声称automatic dispatch、business coding、same-Room parallel、daemon、global config等非目标能力；front matter后仅保留一份Skill正文，未新增第二Skill或复制workflow authority。
- Finding `inc7-r3-decision-resume-state-gate` 闭合：Skill区分两种`NEEDS_DECISION`——open current Question只读Question、取用户答案并调用`room_answer_question`，零launcher；`answer_changes_contract=false`成功后durable Room保持`NEEDS_DECISION`，该answered continuation成为Step 4合法入口（与`PLAN_READY`/`FIX_PLAN_READY`并列）并省略`--baseline-head`、继承persisted source Run；read model为`NEEDS_DECISION`+`current_question`=null且由existing `room:run` preflight/getContinuationContext校验同一current Task/Run lineage，不猜测或创建Task；`answer_changes_contract=true`回到planning/confirmation，旧Task不得resume且该分支never enters Step 4；`CODING`/active Run继续零launcher；旧“Only from `PLAN_READY` / `FIX_PLAN_READY`”排他gate表述已删除。
- Direct Oracle：`tests/plugin-packaging.test.ts`新增2项测试（16→18）。front matter Oracle使用测试侧literal局部parser从文件第一个字符解析YAML delimiter与字段，断言exact `name: agent-room`、non-empty且覆盖五个trigger词的description、拒绝非目标能力声称，并对heading-first/无分隔符形态做`assert.throws`负向验证；组合Decision Oracle断言open-question零launcher、answer(false)后`NEEDS_DECISION`可进入Step 4、answer(true)不得resume且never enters Step 4、`CODING`零launch、Decision resume省略`--baseline-head`、answered read model须经既有preflight校验，并显式拒绝旧ready-state-only短语与排他声明。既有state mapping断言同步为“These ready states allow planning exactly one Run”，baseline authority测试中原“Only from `PLAN_READY` / `FIX_PLAN_READY`”正断言按Contract要求由组合Oracle的显式拒绝取代。
- Verification（live）：`node --test "tests/plugin-packaging.test.ts"` 18/18通过；`node --test "tests/multi-project-e2e.test.ts"` 1/1通过；`node --test "tests/scope.test.ts"` 1/1通过；`npm run typecheck`通过；`npm test` 261/261通过 exit 0；`git diff --name-only`仅预存在candidate `tests/scope.test.ts`（本Fix未改动）；`git status --short --branch` `main`、0 staged、untracked均为本Increment候选path。
- Deviations（question_policy允许的最小选择）：front matter `description`措辞（单行literal，触发词与负向词表与Oracle一致）；Skill内部小节组织保持不变，仅改动NEEDS_DECISION行、PLAN_READY/FIX_PLAN_READY行与Step 4入口行；test侧局部parser为最小literal实现，不新增production parser、dependency或generic framework。
- 状态：`completed`（Coding Result按ROOM_PROTOCOL契约返回）。Fix Coding为candidate，等待Codex Review 4；未commit、未stage、未提升Plugin为Current、未执行任何Git写操作或runtime初始化。

### 2026-08-27 — Increment 7 Review 3 方案确认与 Fix Task 2

- 用户明确确认`review-increment-007-codex-003`两项finding与推荐最小方案：唯一`SKILL.md`增加`name: agent-room`与准确trigger-oriented `description`的YAML front matter并由测试直接解析；Step 4除`PLAN_READY`/`FIX_PLAN_READY`外，明确允许已成功answer(false)且durable Room仍为`NEEDS_DECISION`的Decision continuation，open Question与`CODING`仍零launch，resume继续省略caller baseline。
- [Increment 7 Fix Task 2](./INCREMENT_7_FIX_TASK_2.md)已创建为`Accepted`，`review_fixes_only=true`、`confirmed_by_user=true`，继承原Implementation lineage baseline `b9ebeffdcc8dd9c34718111b50fa3605a21ad17e`，Fix不重新执行clean-worktree gate。
- Fix scope仅允许唯一Skill、`tests/plugin-packaging.test.ts`与本日志candidate事实；不修改marketplace、project setup、plugin manifest、two-project E2E、scope regression、`src/`、package/lock、dependency、production config或protocol。
- 用户授权提交本Accepted Fix Contract与同步文档，并选择暂时自行人工派发；授权不覆盖implementation candidate、Claude启动、manual smoke、push、runtime初始化、branch/worktree、stash删除或其它清理。阶段为`FIX_PLAN_READY`。
- Documentation impact audit：`documentation: updated`。同步Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations与本日志为confirmed solution/Fix gate；Plugin仍保持candidate/unavailable。

### 2026-08-27 — Increment 7 Fix Task 1 Review 3（changes_requested）

- Review ID：`review-increment-007-codex-003`。输入为Accepted Implementation/Fix Contract、lineage baseline `b9ebeffdcc8dd9c34718111b50fa3605a21ad17e`、docs-only successor `HEAD=f807d4afc338b9661d745ac3399cb9d869a220da`、完整staged/unstaged/untracked task-owned Diff、Fix Coding Result、Plugin/Skill/setup、packaging/two-project/scope tests与Current/Accepted文档；当前`main`、0 staged，baseline是HEAD ancestor且baseline..HEAD只有一项Codex-owned docs commit，未执行Git写操作。
- Review 2四项finding中，marketplace嵌套schema、无效status形态、首次baseline authority、runtime/setup模板、fresh stable `run_id`、quoted launcher、approval与post-run durable reread均已按confirmed solution修正；marketplace shape与Codex当前官方Plugin文档一致。
- High `inc7-r3-skill-frontmatter-missing`：全仓库唯一authoritative `SKILL.md`从Markdown heading开始，没有Codex Skill要求的YAML front matter；当前packaging test只证明路径唯一，未证明Skill本身可被validator加载。最小方向是在该Skill增加`name: agent-room`及准确的trigger-oriented `description`，并补独立literal Oracle。
- High `inc7-r3-decision-resume-state-gate`：Current `room_answer_question(answer_changes_contract=false)`后durable Room仍为`NEEDS_DECISION`，随后`resumeRun`才claim进入`CODING`；Skill的NEEDS_DECISION分支虽指向Step 4，却把Step 4 launcher限制为`PLAN_READY`/`FIX_PLAN_READY`，合法Decision resume因此被自身gate阻断。最小方向是把已回答的current Question / durable `NEEDS_DECISION`明确纳入Step 4合法入口，同时保持`CODING`零launcher，并用组合路径direct Oracle证明。
- Review Decision：`changes_requested`。阶段进入`REVIEW_DISCUSSION`；用户确认finding与最小方案前不生成或派发后续Fix Task。manual Codex Desktop smoke不执行：Skill当前不能通过front matter validator且Decision resume workflow自相矛盾，真实paid Claude不能改变Review结论。
- Verification：核对official OpenAI Plugin文档的marketplace与Skill front matter要求，并静态追踪`RoomService.answerQuestion`、`getContinuationContext`及既有Decision resume public-path测试。上述证据已决定Review；未重复运行Coding Result报告已通过的typecheck、focused suites与全量259项。
- Documentation impact audit：`documentation: updated`。同步Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations与本日志为Review 3结果；不改变architecture/protocol version，不提升Plugin为Current。

### 2026-08-27 — Increment 7 Fix Task 1 Coding 完成（candidate，REVIEW_REQUIRED）

- task_id：`increment-007-codex-plugin-multi-project-fix-001`（Review ID `review-increment-007-codex-002`）。`review_fixes_only=true`；仅改写四项scope path，未触碰`src/`、package/lock、dependency、package script、plugin manifest、two-project E2E、scope regression或production config。
- Finding `inc7-r2-marketplace-schema` 闭合：`.agents/plugins/marketplace.json` 重写为Codex当前repository marketplace root schema——顶层仅`name`/`interface.displayName`/`plugins[]`，唯一entry使用嵌套`source:{source:"local",path:"./plugins/agent-room"}`与`policy:{installation:"AVAILABLE",authentication:"ON_INSTALL"}`，entry级`category:"Productivity"`；测试独立断言顶层keys、entry source/policy deepEqual、旧flat根/entry keys被显式拒绝。
- Finding `inc7-r2-state-status-entry` 闭合：唯一SKILL.md按durable Room state映射每state唯一合法action（DISCUSSION→`room_begin_architecture_review`、ARCHITECTURE_REVIEW→`room_request_user_confirmation`、WAITING_FOR_USER_CONFIRMATION→`room_submit_task`、PLAN_READY/FIX_PLAN_READY→计划恰好一次Run、CODING→Zero launcher invocations、NEEDS_DECISION→`room_answer_question`、RUN_FAILED→用户决定retry后`room_retry_run`、REVIEW_REQUIRED→`room_submit_review`、REVIEW_DISCUSSION→Fix/`room_accept_review`、ACCEPTED→Report and stop）；删除一切`room:run ... status`形态，手工查看仅用真实`room:status` script；九个public `/mcp/codex` tool全部被引用，任何其它`room_*`标识符（runtime字段`room_id`除外）测试侧判非public。
- Finding `inc7-r2-baseline-authority` 闭合：首次`--baseline-head`只来自同一首次成功`room_submit_task`响应的non-null`observed_baseline_head`；禁止live Git HEAD读取/rev-parse fallback；值`null`或丢失→zero invocation并报告`needs_decision`；Fix/decision(false) resume/retry省略`--baseline-head`，`answer_changes_contract=true`必须回到planning且不得resume旧Task。
- Finding `inc7-r2-workflow-setup-incomplete` 闭合：Skill补齐完整Codex lifecycle步骤（Step 1 runtime.json五字段严格校验含absolute path/JSON integer port 1..65535/room_id非空、Step 2 `.codex/config.toml`精确`http://127.0.0.1:<port>/mcp/codex`匹配与`room_get_state` identity核对、Step 3 state/action、Step 4 fresh stable `run_id`计划）；`references/project-setup.md`补齐三份placeholder-only模板（`.codex/config.toml` MCP entry、`.agent-room/runtime.json`五字段、`.gitignore`两行），明确`merge; never overwrite`与冲突/无法判定binding时`stop and ask the operator`。
- Direct Oracle：`tests/plugin-packaging.test.ts`重写为16项独立literal/negative断言——marketplace嵌套shape与flat拒绝、唯一plugin/Skill（skills树递归收集deepEqual单一权威SKILL.md）、shared包无project-specific token/secret/权限变更步骤、runtime.json模板替换后JSON.parse且`"port": <PROJECT_PORT>`不带引号、config.toml无硬编码端口、gitignore、merge/conflict指令、state/action与九tool白名单、baseline authority、run_id稳定性、quoted one-shot launcher（`npm --prefix "<AGENT_ROOM_ROOT>" run room:run -- --db ...`完整quoted占位符、含`[--baseline-head "<OBSERVED_BASELINE_HEAD>"]`、无package.json引用）、无status形态、approval语义（at most one/zero invocations/`帮我批准`/`approvals_reviewer=auto_review`/never modify approval policy/never fall back）、post-run durable reread、以及临时目标cwd无package.json仍经`--prefix`到达CLI的launcher regression。
- Verification（live）：`npm run typecheck`通过；`node --test "tests/plugin-packaging.test.ts"` 16/16通过；`node --test "tests/multi-project-e2e.test.ts"` 1/1通过；`node --test "tests/scope.test.ts"` 1/1通过；`npm test` 259/259通过 exit 0；`git diff --name-only`仅预存在candidate `tests/scope.test.ts`（本Fix未改动）；`git status --short --branch` 0 staged，untracked均为本Increment候选path；临时launcher测试fixture已finally清理。
- Deviations（按question_policy记录的最小选择）：placeholder统一命名`<PROJECT_PORT>`/`<OBSERVED_BASELINE_HEAD>`等，`"port": <PROJECT_PORT>`保持不带引号以保证替换后为JSON integer；`run_id`仅要求fresh non-empty且不规定示例格式；marketplace `category`置于entry而非plugin.json（plugin manifest为非scope path，未触碰）。
- 状态：`completed`（Coding Result按ROOM_PROTOCOL契约返回）。Fix Coding为candidate，随后进入Codex Review 3；未commit、未stage、未提升Plugin为Current、未执行任何Git写操作或runtime初始化。

### 2026-08-27 — Increment 7 Review 2 方案确认与 Fix Task 1

- 用户明确确认`review-increment-007-codex-002`四项finding与推荐最小方案：repository marketplace改为Codex当前root/interface/plugins schema；Skill只按durable Room state从合法ready state计划one-shot launcher，删除错误`room:run ... status`；首次baseline只取同一`room_submit_task`响应的non-null`observed_baseline_head`；补齐完整Codex lifecycle、project binding、fresh stable`run_id`、uncertain-outcome/post-run reread、三份setup template与independent packaging direct Oracle。
- [Increment 7 Fix Task 1](./INCREMENT_7_FIX_TASK_1.md)已创建为`Accepted`，`review_fixes_only=true`、`confirmed_by_user=true`；继承原Implementation lineage baseline `b9ebeffdcc8dd9c34718111b50fa3605a21ad17e`，Fix不重新执行clean-worktree gate。
- Fix scope仅允许`.agents/plugins/marketplace.json`、唯一Skill、`project-setup.md`、`tests/plugin-packaging.test.ts`与本日志candidate事实；不修改`src/`、package/lock、dependency、plugin manifest、two-project E2E、scope regression、production config或protocol。
- pre-commit live gate：`main`、`HEAD=b9ebeffdcc8dd9c34718111b50fa3605a21ad17e`、0 staged；现有dirty worktree仍为同一Increment 7 lineage candidate与Codex-owned Review/Fix文档。用户随后授权提交本Accepted Fix Contract及同步文档，并选择暂时自行人工派发；授权不覆盖implementation candidate、Claude启动、manual smoke、push或其它Git写操作。阶段保持`FIX_PLAN_READY`。
- Documentation impact audit：`documentation: updated`。同步Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations与本日志为confirmed solution/Fix gate；Plugin仍保持candidate/unavailable。

### 2026-08-27 — Increment 7 Review 2（changes_requested）

- Review ID：`review-increment-007-codex-002`。输入为Accepted Contract、严格重执行Coding Result、live `main`/`HEAD=b9ebeffdcc8dd9c34718111b50fa3605a21ad17e`、0 staged、完整13-path staged/unstaged/untracked task-owned Diff、Plugin/Skill/setup、packaging与two-project E2E、candidate文档；未执行Git写操作。
- Review 1三项finding已闭合：dispatch确从clean exact baseline开始；launcher模板使用`npm --prefix <AGENT_ROOM_ROOT>`；two-project E2E直接覆盖Task/Review/Question cross-database lookup与snapshot current引用。
- High `inc7-r2-marketplace-schema`：`.agents/plugins/marketplace.json`把单个entry平铺为根对象；Codex当前repository marketplace要求顶层`name`/`interface`/`plugins[]`，entry内使用`source:{source,path}`与`policy:{installation,authentication}`。当前Plugin不能据此被正确发现/安装，测试则按同一错误shape断言。
- High `inc7-r2-state-status-entry`：Skill要求Room已在`CODING`且存在active Run才执行`room:run`，并用不受支持的`room:run --db ... --room-id ... status`检查状态；真实launcher负责从`PLAN_READY`/`FIX_PLAN_READY`等claim进入`CODING`，active Run时再次调用只会被拒绝。
- High `inc7-r2-baseline-authority`：Skill用live `git rev-parse HEAD`生成首次`--baseline-head`；Accepted Contract明确只允许首次成功`room_submit_task`响应的non-null`observed_baseline_head`，值丢失必须fail closed。
- High `inc7-r2-workflow-setup-incomplete`：Skill未覆盖Contract要求的Room create/planning/user-confirmation/Task submission/Review/Question/accept流程，未具体校验runtime五字段、project-scoped endpoint port、project path与Room binding，未建立fresh stable `run_id`及不确定outcome/post-run durable reread；setup reference也缺`.codex/config.toml`与`.gitignore`模板。command模板未默认给path placeholder加引号，packaging tests主要检查marker，未形成这些行为的direct Oracle。
- Review Decision：`changes_requested`。manual Codex Desktop smoke不执行：marketplace当前不可发现且Skill会走错误state/baseline；真实paid Claude不能改变Review结论。阶段进入`REVIEW_DISCUSSION`，用户确认finding与最小方案前不生成或派发Fix Task。
- Verification：Git baseline/path/staged核对通过；静态public workflow、`src/cli/run.ts`参数/claim语义与本机Codex bundled marketplace guide提供充分反证。已知finding已决定Review，因此未重复运行Claude报告已通过的typecheck/249项测试。
- Documentation impact audit：`documentation: updated`。同步Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations与本日志为Review 2结果；未把candidate提升为Current。

### 2026-08-27 — Increment 7 Review 1 方案确认与严格重执行

- 用户明确确认`review-increment-007-codex-001`三项finding与最小方案：launcher必须以已校验的`agent_room_root`作为cwd或使用等价`npm --prefix`定位Agent Room package；two-project E2E必须直接证明cross-database Task/current Task，并通过public lifecycle覆盖Review/Question isolation；不豁免clean documentation baseline违约。
- 用户选择从clean exact `main` baseline严格重执行完整[Increment 7 Accepted Contract](./INCREMENT_7_TASK_CONTRACT.md)。首轮candidate不作为重执行或最终Review authority；本次不是局部Review Fix，因此不生成Fix Task，阶段回到`PLAN_READY`。
- 待独立Git授权后，仅隔离首轮candidate的七个path：`.agents/plugins/marketplace.json`、`plugins/agent-room/.codex-plugin/plugin.json`、`plugins/agent-room/skills/agent-room/SKILL.md`、`plugins/agent-room/skills/agent-room/references/project-setup.md`、`tests/plugin-packaging.test.ts`、`tests/multi-project-e2e.test.ts`、`tests/scope.test.ts`。不得包含文档，不删除隔离结果。
- candidate隔离并验证工作树仅剩文档后，再另行取得documentation commit授权，将`PROJECT_RULES.md`、Increment 7 Contract及本次同步的文档状态形成clean baseline，读取live exact`HEAD`后才可重新派发完整Contract。重执行不得恢复或依赖首轮candidate。
- 本次确认不授权stash、commit、Coding派发、产品`room:run`、manual paid smoke、push、runtime初始化、branch/worktree、stash删除或其它清理。
- 用户随后独立授权仅隔离上述七个candidate path。Codex执行path-scoped `git stash push --include-untracked`，stash object为`a341a34df62795fed315ef21eb31831967184203`；`git stash show --name-status --include-untracked`确认精确包含六个新增文件与`tests/scope.test.ts`修改，`git status --short`确认工作树仅剩九个Accepted/review文档。stash保留，未包含文档、未删除candidate、未commit或派发。
- 用户随后独立授权将当前九个Accepted/review文档提交到`main`，形成严格重执行的clean documentation baseline；授权不包含恢复或删除stash、Claude Coding派发、实现提交、push、runtime初始化、manual paid smoke、branch/worktree或其它清理。本次commit不在自身内容中记录自身hash；提交后从clean live Git读取exact `HEAD`作为人工派发baseline。
- Documentation impact audit：`documentation: updated`。两项confirmed correction已并入原Accepted Contract，Project Rules、Architecture、Protocol、ADR、MVP、Operations、文档中心与开发状态同步为严格重执行门禁；accepted architecture与Current runtime capability不变。

### 2026-08-27 — Increment 7 Review 1（changes_requested）

- Review ID：`review-increment-007-codex-001`。输入为Accepted Contract、Coding Result、live `main`/`HEAD=ca10034f0332ff1eb5b2410dbc5c0cf19ce894cd`、完整staged/unstaged/untracked Diff、Plugin/Skill/templates、two-project E2E、scope与candidate文档；0 staged，未执行Git写操作。
- High `inc7-r1-runtime-root-not-used`：Skill读取`agent_room_root`，但exact command仍是当前目录下的`npm run room:run`，既未以该root为cwd，也未使用`npm --prefix`。在安装Plugin的普通目标项目中会查找目标项目自己的`package.json`/script，无法到达Agent Room one-shot launcher；marker-only packaging regression未覆盖该执行语义。
- High `inc7-r1-dispatch-baseline`：Contract要求Accepted documentation先进入clean exact `main` baseline再Coding；live Git仍停在planning `HEAD`，Accepted Contract为untracked且Project Rules/文档索引与candidate实现共同dirty。该历史前置不能由后续测试修复，需要用户决定接受combined Diff为本次Review authority，或形成clean documentation baseline后重新执行Implementation。
- Medium `inc7-r1-entity-isolation-evidence-incomplete`：two-project E2E证明Run overlap、Run/Event room ID、Git/process/MCP/artifact隔离与second-active-run拒绝，但未直接断言cross-database Task/current Task，且未通过public lifecycle创建或检查Review/Question；不足以支撑Contract点名的Task/Run/Review/Question/Event完整隔离结论。
- 独立验证：`npm run typecheck`通过；`node --test "tests/plugin-packaging.test.ts"` 6/6、`node --test "tests/multi-project-e2e.test.ts"` 1/1、`node --test "tests/scope.test.ts"` 1/1通过。官方OpenAI Plugin文档核对确认最小manifest与repository marketplace schema本身正确。静态finding已成立，因此未重复运行全量249项。
- Review Decision：`changes_requested`。manual Codex Desktop smoke不执行：当前Skill command已知不可达，继续启动真实paid Claude不会改变Review决定。用户确认finding与最小方案前不生成Fix Task、不修改Plugin/test、不提交candidate。
- Documentation impact audit：`documentation: updated`。同步Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations与本日志为Review 1结果；candidate仍未提升为Current。

### 2026-08-27 — Increment 7 完整 Contract 确认与人工派发选择

- 用户先确认`room:run`为one-shot operator-authorized boundary，随后进一步固定Increment 7 Plugin workflow：实际caller为Codex，host内部审批模式为UI“帮我批准”（`approvals_reviewer=auto_review`），operator direct run不再是Plugin正常路径或approval拒绝fallback。`auto_review`通过只授权一次invocation；拒绝时停止并报告。Plugin不得创建、修改、放宽或绕过active approval/rules。
- 用户确认Agent Room Plugin安装一次并共享通用Skill；Project A/B各自保存port、database与project path，分别使用独立Room service、SQLite、worktree、artifact tree与Claude process，因此可跨项目并行。同一Room parallel Claude Runs继续不支持并延后。
- 用户明确确认[Increment 7 Task Contract](./INCREMENT_7_TASK_CONTRACT.md)全部内容，要求所有requirements、acceptance criteria、verification与documentation updates完整完成；Contract更新为`Accepted`、`confirmed_by_user=true`，阶段进入`PLAN_READY`。
- Accepted scope包含repository-local`plugins/agent-room/`与marketplace、project-scoped`.codex/config.toml`、local-only`.agent-room/runtime.json`、Codex + `auto_review` one-shot execution、two-project concurrent E2E和manual Codex Desktop smoke。首次`room_submit_task` baseline在同一workflow step保留，丢失时fail closed；不以live HEAD猜测、不建立本地baseline mirror。planned`run_id`在approval前后保持稳定，outcome不确定时先读Room。
- 用户选择暂时人工派发本Implementation Task。该delivery选择不改变目标Plugin workflow；当前Accepted documentation尚未形成clean exact baseline，因此只提供完整派发指令，尚未实际派发。派发前须另行授权documentation commit、确认worktree clean并记录live exact`HEAD`。
- Planning evidence：开始时`main`、`HEAD=ca10034f0332ff1eb5b2410dbc5c0cf19ce894cd`、worktree clean。未派发Claude、未执行`room:run`、未初始化database/service、未运行真实Claude、未执行Git写操作。
- Documentation impact audit：`documentation: updated`。同步Project Rules、文档中心、Architecture、Room Protocol、MVP Plan、Operations、ADR-0002与本日志为Accepted Contract、`PLAN_READY`和人工派发门禁；Plugin capability继续保持unavailable。

### 2026-08-27 — Increment 7 严格重执行 Implementation 完成（candidate，REVIEW_REQUIRED）

按 [Increment 7 Accepted Contract](./INCREMENT_7_TASK_CONTRACT.md) 从 clean documentation baseline（dispatch `HEAD=b9ebeffdcc8dd9c34718111b50fa3605a21ad17e`、0 staged）严格重执行完整 Implementation Task；未恢复或依赖首轮candidate stash，未执行任何 Git 写操作，未修改 `src/`、`package.json`、`package-lock.json` 或 production configuration：

- `plugins/agent-room/.codex-plugin/plugin.json`：官方最小 manifest（`name`/`version`/`description`/`skills: "./skills/"`），无 hooks/App/MCP bundle/assets/dependency，也无静态 `.mcp.json`。
- `plugins/agent-room/skills/agent-room/SKILL.md`：全仓库唯一 authoritative Skill。先读项目 `.agent-room/runtime.json` 五个字段（`agent_room_root`/`database_path`/`project_path`/`port`/`room_id`）并校验 endpoint port、project path 与 Room mismatch，不满足即停止报告；只调用 public MCP tools；首次 Implementation baseline 只取首次成功 `room_submit_task` 响应的 `observed_baseline_head` 并在同一 workflow step 保存 exact command，丢失时 fail closed；`room:run` 固定由 Codex 在 UI“帮我批准”（`approvals_reviewer=auto_review`）下至多执行一次，拒绝时零次执行并报告，不 fallback 到 operator direct run；run 后重读 `room_get_state`。
- Review 1 两项 implementation finding 已在重执行中闭合：one-shot command 模板固定经已校验 `agent_room_root` 以 `npm --prefix <AGENT_ROOM_ROOT> run room:run` 定位 Agent Room 的 `room:run` package script（status 检查同样使用该 launcher root），不在普通目标项目 cwd 查找 `room:run` script，也不要求目标项目复制或暴露 Agent Room 的 npm script/package manifest；Skill 明确说明不提供任何 active `prefix_rule`（或等价 allow/sandbox rule）写入步骤，且不得要求目标项目暴露 manifest。plugin-packaging.test.ts 以真实 `package.json` 的 `room:run` script 为直接证据证明 launcher root 可达。
- `plugins/agent-room/skills/agent-room/references/project-setup.md`：`.codex/config.toml`、`.agent-room/runtime.json` 与 `.gitignore` placeholder 模板，不含开发机真实路径、secret 或默认值。
- `.agents/plugins/marketplace.json`：repository-local 登记，source 指向 `./plugins/agent-room`，installation `AVAILABLE`、authentication `ON_INSTALL`，不复制 Skill 内容。
- 测试：
  - `tests/plugin-packaging.test.ts`（6 项全过）：manifest 最小字段与单一 Skill authority、marketplace 登记、无 project-specific 硬编码与无 secret 形态（code-fence 内扫描）、无 active permission mutation 步骤且 SKILL 含禁止 marker、one-shot authorization exactly-once 措辞、launcher root 直接证明（模板以 `npm --prefix <AGENT_ROOM_ROOT>` 开头、无裸 `npm run room:run`、无 `package.json` 引用、真实 script 指向 `src/cli/run.ts`）。
  - `tests/multi-project-e2e.test.ts`：两个独立 Git repo/database/loopback port/Room 并发 `room:run`；显式 barrier 保证两个 drive 在写 child 输出前交叉读取对方 DB，观察到对方 Run 为 in-flight `running`；断言 durable `completed_at >=` 对方 `started_at`、DB/Event/cursor、Git HEAD/evidence、process cwd/`--mcp-config` endpoint、artifact 树完全隔离；second active Run 被既有 guard 以 `validation_failed` 拒绝（exit 1、零 spawn、无新 Run row）。Review 1 finding 3 已闭合：Project A 经 claude-route actual MCP `room_ask_question` 在 in-flight 窗口把 run-a-1 转为 needs_decision，Project B 经公开 lifecycle 提交 review-b-1；cross-database 直接查找断言 `getTask`/`getQuestion`/`getReview` 双向隔离（A 看不到 task-b-1/review-b-1，B 看不到 task-a-1/question-a-1），snapshot current Task/Review/Question 引用各自只指向本房间实体，Event 全量 room_id 校验。
  - `tests/scope.test.ts`：Increment 7 exact boundary（`plugins/agent-room` 与 `.agents/plugins` 目录树精确条目；dependencies 不变）。
- 验证：`npm run typecheck`（`tsc --noEmit`）无错误；`node --test "tests/plugin-packaging.test.ts"`、`node --test "tests/multi-project-e2e.test.ts"`、`node --test "tests/scope.test.ts"` 全部通过；`npm test` 全量 249 个测试通过（含既有 242 项无回归）。
- 状态：candidate、`REVIEW_REQUIRED`。Plugin、project binding 与跨项目并行 runtime 尚未经 Codex Review 2、未获用户接受、未进入版本化 `main`，不是 Current capability；manual Codex Desktop smoke 未执行（需真实 paid Claude，由 Codex 在 `auto_review` 通过时执行一次）。
- Documentation impact audit：`documentation: updated`。同步 Architecture §3.11、ROOM_PROTOCOL §12.3、ADR-0002、MVP Plan §增量 7、Operations §4.4 与本日志为严格重执行 implementation facts（candidate）；未修改受保护的 PROJECT_RULES/CLAUDE.md/AGENTS.md 或文档索引，未把 Plugin 写成 Current。

### 2026-08-26 — Increment 6 提交授权与版本化 Current

- 用户在Increment 6通过Review、获明确接受且Fix经验回收完成后，另行授权把完整accepted scope作为一个commit提交到`main`；授权不包含push、runtime初始化、真实Claude smoke、branch/worktree、stash删除或其它清理。
- 提交scope精确包含4个source、6个test、1个config、Implementation/Fix两个Contract、8个Current/planning文档与1个角色指南，共22个path；无额外staged、unstaged或untracked path。exact commit object以live Git为权威，不在同一commit内容中自引用hash。
- planning coordination tools、one-shot Runner CLI、failure retry、端到端acceptance/failure recovery与三类current-task source direct regression现为版本化`main` Current capability。首次invalid-baseline candidate继续隔离在`stash@{0}`，本次提交未恢复或依赖它。
- Documentation impact audit：`documentation: updated`。Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations与本日志从accepted candidate同步为版本化Current；历史条目保留原时点事实。

### 2026-08-26 — Increment 6 用户接受与 Fix 经验回收

- 用户明确接受Review `review-increment-006-codex-003`、Increment 6 Implementation与Fix Task 1；项目阶段从`REVIEW_DISCUSSION`进入`ACCEPTED`。该确认不授权stage、commit、push、runtime初始化、真实Claude smoke、branch/worktree、stash删除或其它清理。
- 接受时live Git仍为`main`、`HEAD=7ac639a30ab2a94170ef69498e065fb16e77f833`、0 staged；完整accepted candidate保留在working tree，进入版本化`main`前不提升为Current capability，operator仍不得调用`room:run`。
- 经验回收基于Review 2两项finding、用户确认的最小方案、Accepted Fix Contract、完整task-owned Diff、三类`runClaude` direct regression、Review 3独立验证与本次最终接受。既有指南已覆盖public-path evidence与完整零副作用Oracle；新增一条可复用fixture规则：正常public lifecycle无法产生、但Contract明确要求拒绝的durable-state损坏，应只在temporary test database做最窄test-owned mutation，再穿过public boundary验证，不新增production mutation API或generic corruption framework。该规则写入[Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)第12.3节；Codex Review指南无需重复扩写。
- Documentation impact audit：`documentation: updated`。同步Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations、Claude Coding指南与本日志为用户接受、经验回收及pending versioned commit事实；不改变product architecture、protocol version、public contract或实现。

### 2026-08-26 — Increment 6 Fix Task 1 Review 3（approved）

- Review ID：`review-increment-006-codex-003`。输入为Accepted Implementation/Fix Contract、lineage baseline `7ac639a30ab2a94170ef69498e065fb16e77f833`、完整staged/unstaged/untracked task-owned Diff、Fix Coding Result、源码、测试与Current/Accepted文档；当前`main`、`HEAD`等于baseline、0 staged，未执行Git写操作。
- `inc6-r2-retry-negative-matrix-incomplete`已闭环：missing source Run、current Task non-failed source、current Task failed但`completed_at=null`三类fixture均直接调用`runClaude`，以测试侧literal `entity_not_found`/`validation_failed`在Git observation、`resumeRun` claim、spawn、新Run、artifact与Event前拒绝；每类完整Room/Task/fixture-owned Run/Review/Question/Event list/cursor snapshot、`run-2`、fake invocation与worktree `HEAD/status` oracle均成立。
- `inc6-r2-stale-source-semantics`已闭环：旧Task `run_failed` Event对新current Task继续返回`new_implementation/sourceRun=null`，stale caller taskId继续独立以`validation_failed`拒绝；测试名称与confirmed语义一致，production source无需修改。
- Findings：无。Review Decision：`approved`。阶段进入`REVIEW_DISCUSSION`，等待用户明确接受；Review通过不授权candidate提交、push、runtime初始化、真实Claude smoke、branch/worktree、stash删除或其它清理。
- 独立验证：`npm run typecheck`通过；`node --test tests/room-service.test.ts tests/claude-runner.test.ts` 95/95通过。Claude Coding Result报告e2e/CLI/MCP 50/50、其余单元97/97与全量242/242通过；输入未再变化，因此Codex不重复运行同一全量suite。
- Documentation impact audit：`documentation: updated`。同步Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations与本日志为Review 3结果；只更新candidate阶段和验证事实，不改变architecture/protocol/运维语义，不提升Current capability。

### 2026-08-26 — Increment 6 Fix Task 1 Coding 完成（candidate，REVIEW_REQUIRED）

- task_id `increment-006-end-to-end-mvp-runtime-fix-001`，`type=fix`，`review_fixes_only=true`，`based_on_review_id=review-increment-006-codex-002`，lineage baseline `7ac639a30ab2a94170ef69498e065fb16e77f833`。
- `tests/claude-runner.test.ts` 新增三项 current-task retry source direct negative regression，全部直接穿过 `runClaude` public boundary 并以测试侧 literal ProtocolError 拒绝：latest `run_failed` Event 引用不存在的 Run → `entity_not_found`（dangling Event 经无 FK 的 events 表以最窄 fixture SQL 构造）；latest `run_failed` 引用 current Task 的 non-failed（`status` 翻转为 `running`）Run → `validation_failed`；引用 current Task 的 failed 但 `completed_at` 为显式 null（parse + set + re-stringify，避免 `json_set(..., NULL)` 移除 key）的 Run → `validation_failed`。
- 每项均断言既有 guard 语义：fake process invocation=0、目标 `run-2` 不存在、`.agent-room` artifact 目录不存在、完整 Room/current Task/Run/Review/Question/Event list/cursor snapshot 前后 deepEqual、worktree `HEAD` 与 `git status --porcelain` 前后不变。三类场景在既有 `deriveRetryOrNewImplementation` guard（`requireRun` → `entity_not_found`；`status !== 'failed' || completed_at === null` → `validation_failed`）下直接通过，未新增 production mutation API，production source 零改动。
- `tests/room-service.test.ts` 最小对齐：既有 old-Task `run_failed` Event regression 的测试名称从“the failure is stale”改为明确表达语义的“latest run_failed references an old task run”，消除 finding 点名的 stale-source 措辞歧义；assertion 与既有注释（旧 Task Event 对新 current Task 按无 source 的 `new_implementation` 处理）不变。
- 验证：`npm run typecheck` 通过；focused `node --test "tests/room-service.test.ts" "tests/claude-runner.test.ts"` 95/95 通过；`node --test "tests/e2e-workflow.test.ts" "tests/runner-cli.test.ts" "tests/room-mcp.test.ts"` 50/50 通过；其余 `git-observer/room-serve/status-cli/scope/state-machine/protocol/claude-process/claude-stream/room-state-snapshot` 97/97 通过；`npm test` 242/242 通过且 exit 0（239 既有 + 3 新增）。未启动、付费或依赖真实 Claude process。
- 未执行任何 Git 写操作（stage/commit/push/branch/worktree/reset/restore/clean/checkout/stash 删除/其它清理）；未改变 Room state/transition/Run status/Event type/entity/schema/table/migration/protocol/error/MCP/CLI/dependency。candidate 未提升为 Current，等待 Codex Review。
- Documentation impact audit：`documentation: updated`。仅更新本日志为 Fix Task 1 candidate 事实；未修改 Codex-owned 文档（PROJECT_RULES、ARCHITECTURE、ROOM_PROTOCOL、ADR、MVP、OPERATIONS、README、Accepted Contract、Fix Contract）。

### 2026-08-26 — Increment 6 Review 2 方案确认与 Fix Task 1

- 用户明确确认`review-increment-006-codex-002`的两项finding与推荐最小方案：补齐missing/non-failed/non-terminal current-task retry source的Runner public-boundary direct regression；只有新测试暴露真实guard缺陷时才允许最小production修复。
- 用户确认retry source是current Task scoped authority：latest `run_failed` Event若引用旧Task Run，对新current Task表示无source的`new_implementation`并继续clean exact baseline gate；caller传入stale/wrong `taskId`仍拒绝，missing Event target及current-task non-failed/non-terminal source仍拒绝。
- 已创建[Increment 6 Fix Task 1](./INCREMENT_6_FIX_TASK_1.md)，状态为Accepted、`confirmed_by_user=true`、`review_fixes_only=true`，保留原Implementation lineage baseline `7ac639a30ab2a94170ef69498e065fb16e77f833`与当前完整candidate Diff；阶段进入`FIX_PLAN_READY`。
- 用户继续在原Increment 6 Claude session中人工派发。该确认不授权Codex启动Claude，也不授权stage、commit、push、branch/worktree、真实Claude smoke、reset、restore、clean、checkout、stash删除或其它清理。
- Documentation impact audit：`documentation: updated`。同步Accepted Implementation Contract澄清、Fix Contract、Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations与本日志；该用户确认收敛既有lineage语义，不新增state/schema/Event/error/dependency或protocol version，不把candidate提升为Current。

### 2026-08-26 — Increment 6 clean-baseline re-execution Review 2（changes_requested）

- Review ID：`review-increment-006-codex-002`。输入为Accepted Contract、clean dispatch baseline `7ac639a30ab2a94170ef69498e065fb16e77f833`、live staged/unstaged/untracked完整Diff、首次candidate `stash@{0}`、Coding Result、源码/测试与Current/Accepted文档。
- Review 1闭合情况：dispatch baseline、exact `/mcp/claude` route、existing empty/non-Room database read-only preflight、CLI `runCliMain` stdout/exit 0/1，以及四个coordination tool的逐tool invalid-input/internal-failure/cleanup与完整snapshot evidence均已闭合。
- Medium `inc6-r2-retry-negative-matrix-incomplete`：`tests/room-service.test.ts`与`tests/claude-runner.test.ts`新增了retry happy、empty-session、HEAD drift、stale `taskId`、未执行`retryAfterFailure`与retry再次失败，但没有直接构造Accepted Contract点名的missing source Run、latest `run_failed`引用non-failed Run或source未terminal三类场景，也没有对这些拒绝逐项比较完整Room/Task/Run/Review/Question/Event list/cursor与零spawn/artifact。Coding Result与candidate docs称“retry negative matrix全部闭合”不成立。
- Medium `inc6-r2-stale-source-semantics`：`RoomService.deriveRetryOrNewImplementation`在latest `run_failed` Event引用旧Task Run时返回`new_implementation`，`tests/room-service.test.ts`通过`RUN_FAILED`后提交新Implementation Task直接固定该行为；Accepted Contract与ROOM_PROTOCOL又写“stale source必须拒绝”。该路径由现有public `submitTask`可达，不能同时把实现与文档都视为正确。推荐把“旧Task Event不属于current Task source”定义为当前Task无source、允许new Implementation，并把“stale taskId调用”保留为拒绝；若用户要求所有stale Event均拒绝，则改实现与测试。
- 独立验证：`npm run typecheck`通过；`npm test` 239/239通过且exit 0。绿灯证明现有assertion成立，不替代缺失的Contract-named Oracle或协议语义决定。
- Review Decision：`changes_requested`。阶段进入`REVIEW_DISCUSSION`；用户确认两项solution前不生成Fix Task、不提交candidate。
- Documentation impact audit：`documentation: updated`。同步Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations与本日志为Review 2结果；未把candidate提升为Current，未修改Accepted Contract或业务实现。

### 2026-08-26 — Increment 6 clean-baseline re-execution Coding 完成（candidate，REVIEW_REQUIRED）

按 [Increment 6 Accepted Contract](./INCREMENT_6_TASK_CONTRACT.md) 从用户人工派发的 clean exact `main` baseline（dispatch `HEAD`=`7ac639a30ab2a94170ef69498e065fb16e77f833`、branch `main`、dispatch 时 worktree clean、0 staged）重新执行完整 Implementation Task。未恢复、应用或依赖 `stash@{0}` 中的首次 candidate，未执行任何 Git 写操作：

- `src/mcp/tools.ts`：`/mcp/codex` 在既有五个 tools 上增加且只增加 `room_create`、`room_begin_architecture_review`、`room_request_user_confirmation`、`room_retry_run`（共九个），均直接适配既有 `RoomService.createRoom` / `transitionToArchitectureReview` / `transitionToWaitingForUserConfirmation` / `retryAfterFailure`，复用既有 actor isolation、stateless HTTP request lifecycle、ProtocolError/invalid-input/unexpected-error mapping 与 request cleanup；`/mcp/claude` 仍只注册 `room_ask_question`（一个）。
- `src/room/room-service.ts`：`getContinuationContext` 的 `ContinuationContext` union 增加最小 `retry` kind——Room=`PLAN_READY` 且 current Task 已有由 latest `run_failed` Event 确定的 current failed source Run 时判定为 failure retry，无 source Run 时保持 `new_implementation`；retry source 必须属于 current Room/current Task、`status=failed` 且 `completed_at` 非空。
- `src/runner/claude-runner.ts`：`runClaude` 对 `retry` kind 走 `observeContinuation`（dirty-allowed、exact-HEAD）继承 source Run baseline；source `claude_session_id` 非空时经 `resumeRun` 追加既有 `run_resumed` 并向 process 传 exact `--resume`，为空时同样经 `resumeRun` 保持同一 Task lineage 但省略 `--resume` 建立 replacement session；retry prompt 携带完整 persisted current TaskContract 与 `continuation_kind=retry`。
- `src/cli/run.ts`（新增）与 `package.json`：one-shot `room:run` application entry——只打开既有 file-backed Room database（read-only probe 确认 `rooms` table，绝不初始化 schema，空文件/非 Room database 在构造 `RoomService` 前拒绝）、preflight 拒绝 missing database/non-directory project/non-loopback 或 pathname 非 exact `/mcp/claude` 的 MCP URL/不完整参数、`new_implementation` 要求 `--baseline-head`、构造 exact `agent_room` HTTP MCP config（`alwaysLoad=true`）并执行恰好一个 Run、输出 deterministic JSON `{room, run}`；succeeded/needs_decision exit 0，failed 仍输出结果但 exit 1，argument/preflight/ProtocolError 或未 settle 异常写 stderr 并 non-zero exit。`package.json` 只新增 `room:run` script，未新增 dependency。
- tests：`tests/runner-cli.test.ts`（新增，13 项）与 `tests/e2e-workflow.test.ts`（新增，3 项）覆盖 CLI 黑盒（argument/preflight/ProtocolError non-zero exit、失败不创建/不初始化 database、route gate、`main()` stdout/exitCode 契约）与完整 acceptance workflow（实际 loopback MCP + file-backed SQLite + representative Git + fake Claude process 从 `room_create` 到 `ACCEPTED`）、独立 failure recovery（`room_retry_run` 后保留 dirty worktree、unchanged HEAD、exact session resume 成功）及 source session 为空时同 lineage replacement session；`tests/room-mcp.test.ts`、`tests/room-service.test.ts`、`tests/claude-runner.test.ts`、`tests/scope.test.ts` 增加四个新增 tool 的 actor/rollback/idempotency、`retry` continuation kind、retry source authority/session 选择/baseline gate、resumeRun/Event/terminal settlement 与 Increment 6 exact MCP tool list/scope/dependency boundary 的 direct regression。

验证：`npm run typecheck` 通过；`node --test "tests/e2e-workflow.test.ts" "tests/runner-cli.test.ts"` 16/16 通过；`node --test "tests/room-mcp.test.ts" "tests/room-service.test.ts" "tests/claude-runner.test.ts"` 126/126 通过；`node --test "tests/git-observer.test.ts" "tests/room-serve.test.ts" "tests/status-cli.test.ts" "tests/scope.test.ts"` 30/30 通过；`npm test` 239/239 通过且 exit 0。未启动、付费或依赖真实 Claude process，未依赖外部 network 或固定 port。

本次从 clean baseline 重新实现的同时，已直接闭合 Review 1 点名的 evidence 缺口：dispatch baseline 现为包含 Accepted/review documentation 的 clean exact `main`（`inc6-r1-dispatch-baseline`）；CLI `main()` 经 `runCliMain` seam 穿过 stdout `{room,run}` 与 process exit 0/1（`inc6-r1-cli-main-oracle`）；MCP URL preflight 拒绝非 `/mcp/claude` route、既有空 database 不被初始化 schema（`inc6-r1-mcp-url-route-preflight` / `inc6-r1-existing-db-schema-mutation`）；四个新增 coordination tools 的逐 tool negative public evidence 与 retry wrong-current/stale/non-failed source 等 Contract-named direct regression 全部补齐（`inc6-r1-mcp-negative-public-evidence` / `inc6-r1-retry-negative-oracle`）。

未 commit、未 stage、未执行 branch/worktree/push/清理；candidate 未提升为 Current，operator 仍不得使用 `room:run`，等待 Codex 新 Review。

Documentation impact audit：`documentation: updated`。同步 Architecture §3.10、ROOM_PROTOCOL §11.8/§12.2、ADR-0002、MVP Plan §增量6、Operations §1/§4.3/§5.2/§9 与本日志为「clean-baseline re-execution 完成、candidate、未 Review/接受」；未把 Increment 6 写成 Current capability，未新增 Room state/transition/entity/schema/Event/error/dependency。

### 2026-08-26 — Increment 6 Review 1 方案确认：clean-baseline re-execution

- 用户确认Review `review-increment-006-codex-001`的六项finding，并在baseline处理方案中选择“不豁免”：当前combined/mixed Diff不作为Fix或后续Review authority，不生成Increment 6 Fix Task。
- 阶段从`REVIEW_DISCUSSION`回到`PLAN_READY`；原[Increment 6 Accepted Contract](./INCREMENT_6_TASK_CONTRACT.md)的目标、requirements、non-goals、architecture decisions与acceptance criteria保持不变，后续从包含Accepted/review documentation的clean exact`main` baseline重新执行完整Implementation Task。
- 用户另行授权限定stash；Codex仅对明确列出的11个implementation/test/config pathspec执行`git stash push --include-untracked`，生成`stash@{0}: On main: increment-6-invalid-baseline-candidate`。核对stash内容恰好为授权路径，working tree只剩九个documentation路径；未包含或回退任何文档。
- 用户进一步授权把九个documentation路径stage并以`docs(room): establish increment 6 clean baseline`单独提交到`main`，随后由用户人工派发完整Contract；“以上内容需全部完成”明确要求Claude不得拆分、省略requirements、acceptance criteria或verification。Codex只提供指令，不启动Claude。
- commit授权不包含push、branch/worktree、runtime、真实Claude smoke、stash删除或其它清理；Claude也不得执行stage、commit、push、branch/worktree、reset、clean或cleanup。exact dispatch HEAD与clean status在commit完成后从live Git记录。
- Documentation impact audit：`documentation: updated`。同步Project Rules、文档中心、Accepted Contract、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations与本日志；未修改business source、test或implementation config，未把candidate提升为Current。

### 2026-08-26 — Increment 6 Review 1（changes_requested）

- Review ID：`review-increment-006-codex-001`。输入为Accepted Contract、Coding Result、live `main`/`HEAD`、完整staged/unstaged/untracked working-tree Diff、源码/测试与Current/Accepted权威文档。实际HEAD仍为planning时的`9ccf820cab268123f294075c6362a649d0f8540c`，Accepted Contract及同步文档没有按dispatch prerequisite先提交成clean baseline；因此Coding Result把该planning HEAD称作lineage baseline不成立，且`git diff HEAD`不能无条件称为纯task-owned Diff。
- High `inc6-r1-mcp-url-route-preflight`：`src/cli/run.ts`的URL gate只校验`http`与loopback hostname，未校验exact `/mcp/claude` route。定向probe传入`http://127.0.0.1:9/mcp/codex`后越过URL preflight并返回`entity_not_found`，证明错误actor route可进入database/application检查；在有效Task下会在preflight本应拒绝前创建Run/process pipeline。
- Medium `inc6-r1-existing-db-schema-mutation`：`room:run`只用`existsSync`检查database后以writable `DatabaseSync`构造`RoomService`，后者会执行`CREATE TABLE IF NOT EXISTS`。定向probe对既存空文件调用CLI后观察到`rooms/tasks/runs/reviews/questions/events`六张表，违反“只打开既有Room database、preflight失败不初始化database/schema”的边界。
- Medium `inc6-r1-cli-main-oracle`：`tests/runner-cli.test.ts`的黑盒仅覆盖argument/preflight/ProtocolError；成功/failed路径只分别调用`runRoomRun`和`exitCodeForRun` helper，没有穿过`main()`同时证明stdout `{room,run}`与process exit。Coding Result记录的“`main()`误传整个Run导致failed exit 0”正是现有tests无法捕获的application wiring回归。
- Medium `inc6-r1-mcp-negative-public-evidence`：四个新增coordination tools的actual HTTP route tests覆盖success、部分wrong-state与invalid input，但unexpected internal failure仍只由既有`room_get_state`路径测试；invalid input也只断言Event count，不对每个新增public tool比较完整Room/entity/Event/cursor snapshot，未满足Contract点名的逐tool direct evidence。
- Medium `inc6-r1-retry-negative-oracle`：retry tests只直接覆盖happy session/null-session与changed HEAD；缺少wrong current Task、missing/stale/non-failed/non-terminal source及其它preflight failure的Contract-named direct regression。changed-HEAD case只断言selected Room/Event count，没有按Accepted Contract与现有Review规则deepEqual完整Room/Task/Run/Review/Question/Event list/cursor snapshot。
- High `inc6-r1-dispatch-baseline`：Contract要求在包含Accepted documentation的clean exact `main` baseline上Coding；live Git证明documentation commit从未形成，且Coding Result未记录deviation。该历史前置不能由后续test修复，用户需决定是明确豁免并接受当前combined Diff作为Review authority，还是先形成documentation baseline后重新执行Implementation。
- 独立验证全部通过：e2e/CLI 12/12、Room MCP/RoomService/Runner 118/118、Git/serve/status/scope 30/30、`npm run typecheck`、全量227/227。绿灯证明现有assertion成立，但不替代上述Contract-named public path与durable-state evidence。
- Review Decision：`changes_requested`。阶段进入`REVIEW_DISCUSSION`；用户确认findings、baseline处理与最小方案前，不生成或派发Fix Task，不提交candidate。
- Documentation impact audit：`documentation: updated`。同步Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations与本日志为Review 1 changes-requested candidate；未改变Accepted target semantics、state/schema/Event/error/dependency，也未把Increment 6提升为Current。

### 2026-08-26 — Increment 6 Coding 完成（candidate，REVIEW_REQUIRED）

按 [Increment 6 Accepted Contract](./INCREMENT_6_TASK_CONTRACT.md) 交付端到端 MVP runtime 的最小 wiring，lineage baseline 为 `9ccf820cab268123f294075c6362a649d0f8540c`，未执行任何 Git 写操作：

- `src/mcp/tools.ts`：`/mcp/codex` 在既有五个 tools 上增加且只增加 `room_create`、`room_begin_architecture_review`、`room_request_user_confirmation`、`room_retry_run`，均直接适配既有 `RoomService.createRoom` / `transitionToArchitectureReview` / `transitionToWaitingForUserConfirmation` / `retryAfterFailure`，复用既有 actor isolation、stateless HTTP request lifecycle、ProtocolError/invalid-input/unexpected-error mapping 与 request cleanup；`/mcp/claude` 仍只注册 `room_ask_question`。
- `src/room/room-service.ts`：`getContinuationContext` 的 `ContinuationContext` union 增加最小 `retry` kind——Room=`PLAN_READY` 且 current Task 已有由 latest `run_failed` Event 确定的 current failed source Run 时判定为 failure retry，无 source Run 时保持 `new_implementation`；retry source 必须属于 current Room/current Task、`status=failed` 且 `completed_at` 非空。
- `src/runner/claude-runner.ts`：`runClaude` 对 `retry` kind 走 `observeContinuation`（dirty-allowed、exact-HEAD）继承 source Run baseline；source `claude_session_id` 非空时经 `resumeRun` 追加既有 `run_resumed` 并向 process 传 exact `--resume`，为空时同样经 `resumeRun` 保持同一 Task lineage 但省略 `--resume` 建立 replacement session；retry prompt 携带完整 persisted current TaskContract 与 `continuation_kind=retry`。
- `src/cli/run.ts`（新增）：one-shot `room:run` application entry——打开既有 file-backed SQLite、preflight 拒绝 missing database/non-directory project/non-loopback MCP URL/不完整参数、`new_implementation` 要求 `--baseline-head`、构造 exact `agent_room` HTTP MCP config（`alwaysLoad=true`）并执行恰好一个 Run、输出 deterministic JSON `{room, run}`；succeeded/needs_decision exit 0，failed 仍输出 result 但 exit 1，argument/preflight/ProtocolError 或未 settle 异常写 stderr 并 non-zero exit。`package.json` 只新增 `room:run` script，未新增 dependency。
- `tests/runner-cli.test.ts`（新增）与 `tests/e2e-workflow.test.ts`（新增）：CLI 黑盒（argument/preflight/ProtocolError non-zero exit、失败不创建 database）与 application-boundary（exact MCP config、baseline 透传、无 `--resume`、failed exit 1、durable `{room,run}`）；完整 acceptance workflow（实际 loopback MCP + file-backed SQLite + representative Git + fake Claude process 从 `room_create` 到 `ACCEPTED`）与 failure recovery（`room_retry_run` 后保留 dirty worktree、unchanged HEAD、exact session resume 成功），并覆盖 source session 为空时同 lineage replacement session。
- `tests/room-mcp.test.ts`、`tests/room-service.test.ts`、`tests/claude-runner.test.ts`、`tests/scope.test.ts`：四个新增 tool 的 actor/rollback/idempotency、`retry` continuation kind、retry source authority/session 选择/baseline gate、resumeRun/Event/terminal settlement 与 Increment 6 exact MCP tool list/scope/dependency boundary 的 direct regression。

验证：`npm run typecheck` 通过；`node --test "tests/e2e-workflow.test.ts" "tests/runner-cli.test.ts"` 12/12 通过；`node --test "tests/room-mcp.test.ts" "tests/room-service.test.ts" "tests/claude-runner.test.ts"` 118/118 通过；`node --test "tests/git-observer.test.ts" "tests/room-serve.test.ts" "tests/status-cli.test.ts" "tests/scope.test.ts"` 30/30 通过；`npm test` 227/227 通过且 exit 0。未启动、付费或依赖真实 Claude process，未依赖外部 network 或固定 port。

Coding 期间修正三处 task-owned 缺陷：`src/cli/run.ts` 的 `getContinuationContext` 误传 `task.taskId`（应为 `task.task_id`）、`main()` 的 `exitCodeForRun` 误传整个 `Run` 对象（应为 `result.run.status`，否则 failed Run 会错误 exit 0）、`tests/runner-cli.test.ts` 的 `runCli` 标识符与 helper 冲突（路径常量改名 `runCliPath`）。未 commit、未 stage、未执行 branch/worktree/push/清理；candidate 未提升为 Current。

Documentation impact audit：`documentation: updated`。同步 Architecture §3.10、ROOM_PROTOCOL §11.8/§12.2、ADR-0002、MVP Plan §增量6、Operations §4.3 与本日志为「Coding 完成、candidate、未 Review/接受」；未把 Increment 6 写成 Current capability，未新增 Room state/transition/entity/schema/Event/error/dependency。

### 2026-08-26 — Increment 6 完整方案确认与 Accepted Contract

- 用户明确确认Increment 6完整方案，并要求四个Codex coordination tools、one-shot Runner CLI、完整RUN_FAILED retry，以及actual loopback MCP + file-backed SQLite + representative Git + fake Claude process的acceptance/failure E2E全部在同一Implementation Task完成；[Increment 6 Task Contract](./INCREMENT_6_TASK_CONTRACT.md) 状态置为`Accepted`，阶段进入`PLAN_READY`。
- Contract冻结`/mcp/codex` candidate exact tool count为九、`/mcp/claude`仍为一个；`room:run`每次只执行一个Run；首次Implementation使用caller clean exact baseline，Decision/Fix/retry使用persisted source baseline；failure source session存在时exact resume，不存在时同一Task lineage replacement session。
- 用户选择暂时自行人工派发。Codex不启动Claude或runtime；本轮确认不授权stage、commit、push、branch/worktree、reset、clean、真实Claude smoke或清理。Accepted documentation必须先经单独commit授权形成clean `main` baseline，实际dispatch时再读取exact HEAD。
- Planning evidence：开始编辑前branch=`main`、HEAD=`9ccf820cab268123f294075c6362a649d0f8540c`且worktree clean；本轮只创建Contract并同步Project Rules、文档中心、Architecture、Protocol、ADR、MVP Plan、Operations与本日志，不修改source/test/config。
- Documentation impact audit：`documentation: updated`。Increment 6为Accepted candidate，当前runtime仍没有Room initialization/planning tools或Runner launcher，文档未把未实现能力标记为Current。

### 2026-08-26 — Increment 5 提交授权与版本化 Current

- 用户在 Increment 5 已通过 Review、获明确接受且经验回收完成后，另行授权把完整 accepted scope 作为一个 commit 提交到 `main`；授权不包含 push、runtime初始化、Runner launcher、branch/worktree、真实Claude smoke或清理。
- 提交scope精确包含3个source、6个test、Fix Task 2 Contract、8个Current/planning文档与2个角色指南，共20个path；无额外 staged、unstaged或untracked path。exact commit object 以 live Git为权威，不在同一 commit内容中自引用hash。
- Decision/Fix continuation、pause finalization、lineage-derived resume、dirty-allowed exact-HEAD observation与三项test-only Oracle现为版本化`main` Current application capability。repository仍没有Room initialization或Runner launcher command，因此该状态不等于operator已有可调用的runtime workflow。
- Documentation impact audit：`documentation: updated`。Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations与本日志从accepted candidate同步为版本化Current；历史条目保留原时点事实。

### 2026-08-26 — Increment 5 用户接受与 Fix 经验回收

- 用户明确接受 `review-increment-005-codex-003` 与 Increment 5，项目阶段从 `REVIEW_DISCUSSION` 进入 `ACCEPTED`；无 unresolved finding。该确认不授权commit、push、runtime初始化、Runner launcher、branch/worktree、真实Claude smoke或清理。
- Experience recovery 使用Review 2三项finding、Accepted Fix Task 2、两个test文件的实际Diff、三项direct Oracle与Review 3独立验证。新增两类可复用规则：stream内状态切换必须在同一public execution中用切换前后recognized input与Event sequence证明；validation-before-spawn与retry/conflict的零副作用必须覆盖完整public durable snapshot、cursor及process/Run/artifact boundary。
- Codex规则写入[Codex Review与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)第13节；Claude实现与regression规则写入[Claude Coding与Fix指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)第12节。既有public-path、idempotency与transaction规则保留，不新增入口硬门禁、Room state、Event type、protocol field、runtime hook或ADR。
- Documentation impact audit：`documentation: updated`。同步Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations、两个角色指南与本日志为“用户已接受但尚未版本化提交”；未把dirty working-tree candidate写成Current capability。

### 2026-08-26 — Increment 5 Fix Task 2 Review 3（approved）

- Codex 以原 lineage baseline `bcb9a9f9da451d64b4787d3967c0032cbc453602`、docs-only descendant `HEAD=60683dd96aea24e8c2d3d7173a84c716cddbfabf`、Accepted Fix Task 2、完整 staged/unstaged/untracked candidate与 Coding Result为输入复审。原 baseline仍为live `HEAD` ancestor，`baseline..HEAD`仅含九个已授权 planning/state文档，0 staged；Fix Task 2净新增只涉及两个test文件与本日志，未修改source/runtime。
- 三项 confirmed finding均闭合：同一 fake process中Question前recognized progress产生恰好一个`run_progress`且`sequence < question_asked`，Question后recognized progress不新增`run_progress`并完成单一pause settlement；answer后same-payload retry与different-payload conflict分别对完整Run/Question/Room/Event list/cursor snapshot保持`deepEqual`；baseline mismatch拒绝前后Room/Event/cursor完整`deepEqual`，并保持零spawn、零Run、零artifact。
- 独立验证：`npm run typecheck`通过；`node --test "tests/room-service.test.ts" "tests/claude-runner.test.ts"` 82/82通过；`node --test "tests/git-observer.test.ts" "tests/room-mcp.test.ts" "tests/scope.test.ts"` 45/45通过；`npm test` 207/207通过且exit 0。未启动或依赖真实Claude process。
- Review ID：`review-increment-005-codex-003`；Findings：无；Decision：`approved`。阶段进入`REVIEW_DISCUSSION`，等待用户明确接受；Review通过不授权commit、push、runtime初始化、真实Claude smoke或清理。
- Documentation impact audit：`documentation: updated`。同步Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations与本日志为Review 3 approved candidate状态；无需求、public API、architecture、protocol、state、schema、Event、dependency或运维命令变化，Increment 5未提升为Current。

### 2026-08-26 — Increment 5 Fix Task 2 Coding 完成（candidate，test-only，REVIEW_REQUIRED）

按 [Increment 5 Fix Task 2](./INCREMENT_5_FIX_TASK_2.md) 补齐 `review-increment-005-codex-002` 的三项 test-evidence Oracle，保持原 Implementation lineage baseline `bcb9a9f9da451d64b4787d3967c0032cbc453602` 与当前 dirty candidate Diff，`review_fixes_only`、test-only，未修改任何 source/runtime，未执行任何 Git 写操作：

- `inc5-r2-pause-sequence-oracle`：`tests/claude-runner.test.ts` 的 needs-decision regression 改为同一 `runClaude` fake-process execution 内先写 `init` + 一个可识别非终态 `assistant` progress（Run 仍 `running`，经同步 `child.stdout.write` 使 `onStdoutLine` 在 `askQuestion` 前被消费并追加恰好一个 `run_progress`），再经真实 `RoomService.askQuestion` 把 Run 原子置为 `needs_decision`，随后写 `tool_result` progress 与 needs-decision terminal。断言 `run_progress` 数量为 1 且其 `sequence < question_asked`，Question 后零 `run_progress`，恰好一个 `question_asked`/`run_paused`、零 `run_completed`/`run_failed`，并完成 session/exit/result/Git evidence/artifact refs 持久化。
- `inc5-r2-finalization-snapshot-oracle`：`tests/room-service.test.ts` 的 answer 后 retry/conflict regression 增加测试侧 `snapshot()`（完整 Run、Question、Room、Event list 与 cursor，cursor 为 Event list 最大 sequence，均来自 public `RoomService` read method）；same-payload retry 断言 `created=false` 且前后完整 snapshot `deepEqual`，different-payload 断言 literal `id_conflict` 且前后完整 snapshot `deepEqual`。
- `inc5-r2-baseline-zero-side-effect-oracle`：`tests/claude-runner.test.ts` 的 baseline mismatch regression 在调用 `runClaude` 前保存完整 Room 与 Event list/cursor，`validation_failed` 后 `deepEqual`；继续保留 guaranteed-unequal valid hex、injected fake spawner、`invocations.length === 0`、Run 不存在与 artifact 不存在断言。

验证：`npm run typecheck` 通过；`node --test "tests/room-service.test.ts" "tests/claude-runner.test.ts"` combined 82/82 通过（Runner 37、RoomService 45）；`node --test "tests/git-observer.test.ts" "tests/room-mcp.test.ts" "tests/scope.test.ts"` 45/45 通过；`npm test` 207/207 通过，未启动或依赖真实 Claude process。三项 Oracle 均直接通过，未暴露 source/runtime 缺陷，故未修改任何 `src/` 文件。未 commit、未 stage、未执行 branch/worktree/push/清理；candidate 未提升为 Current。

Documentation impact audit：`documentation: updated`。仅更新本日志的 Fix Task 2 candidate test Diff/验证事实与 `REVIEW_REQUIRED` 状态；净变更为两个 test 文件与本日志，未修改 Project Rules/Architecture/Room Protocol/ADR/MVP Plan/Operations/README 或 Fix Contract，无 source/protocol/state/schema/Event/dependency 漂移。

### 2026-08-26 — Increment 5 Review 2 方案确认与 Fix Task 2

- 用户明确确认 `review-increment-005-codex-002` 的三项 finding 与最小 test-only solution：Runner regression在同一 fake process中构造 recognized running progress → durable Question → post-Question recognized progress，并直接断言 Question前保留一次有序`run_progress`、Question后不再增加且pause finalization完成；RoomService regression对answer后same-payload retry与different-payload conflict分别deepEqual完整Run、Question、Room、Event list与cursor；baseline mismatch regression在零spawn/零Run/零artifact之外deepEqual拒绝前后Room与Event/cursor。
- 已创建 [Increment 5 Fix Task 2](./INCREMENT_5_FIX_TASK_2.md)，状态为 `Accepted`、`confirmed_by_user=true`、`review_fixes_only=true`、test-only；scope仅允许`tests/claude-runner.test.ts`、`tests/room-service.test.ts`与candidate Development Log。禁止修改任何source、protocol、state、schema、Event type、MCP、dependency或runtime interface；若新增断言暴露runtime/source缺陷，Claude必须返回`needs_decision`而不是越界修复。
- Fix继续复用原Implementation lineage baseline `bcb9a9f9da451d64b4787d3967c0032cbc453602`、当前`main` dirty candidate与原Increment 5 Claude session；派发前读取live `HEAD`与worktree状态，不重新执行clean-worktree gate，不覆盖或拆分既有candidate。
- 阶段进入`FIX_PLAN_READY`，等待用户人工派发。本次确认不授权Codex启动Claude，也不授权runtime初始化、真实Claude smoke、stage、commit、push、branch/worktree、reset、restore、clean或清理。
- Documentation impact audit：`documentation: updated`。同步Accepted Fix Contract、Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations与本日志；没有产品行为或architecture decision变化，candidate保持unavailable、未提升为Current。

### 2026-08-26 — Increment 5 Fix Task 1 Review 2（changes_requested）

- Codex 以原 lineage baseline `bcb9a9f9da451d64b4787d3967c0032cbc453602` 审查完整 18-file task-owned Diff，并确认当前 `main` `HEAD=60683dd96aea24e8c2d3d7173a84c716cddbfabf` 是原 baseline 的 docs-only descendant；0 staged、0 untracked，未混入未授权 Git 写操作。
- Review 1 的三项实现缺陷均按 Accepted solution 闭合：Question durable 后的 progress routing 只在 Run仍为 `running` 时调用 `appendRunProgress`；completed pause finalization 在首次 lifecycle guard 前处理 same-payload retry/different-payload conflict；baseline mismatch 使用 guaranteed-unequal hex与 injected fake spawner，零 invocation。未发现新的 source/runtime behavior、architecture、protocol、state、schema、Event type、dependency或scope漂移。
- Medium `inc5-r2-pause-sequence-oracle`：`tests/claude-runner.test.ts` 的 post-question regression 在写任何 stream line 前先调用 `askQuestion`，并断言总 `run_progress=0`；没有按 Fix Contract 直接执行并证明 `init/running progress -> Question -> assistant/tool_result progress` 的同一 process顺序，无法同时验收 Question 前保留 progress 与 Question 后停止 durable progress。
- Medium `inc5-r2-finalization-snapshot-oracle`：`tests/room-service.test.ts` 的 answer 后 retry/conflict regression 只检查少数字段与 Event count，没有在 same-payload retry及different-payload conflict前后 deepEqual完整 Run、Question、Room、Event list/cursor，未满足 Accepted Fix Contract点名的完整 durable-state不变证据。
- Low `inc5-r2-baseline-zero-side-effect-oracle`：baseline mismatch regression 已证明 guaranteed mismatch、零 spawn、零 Run与零 artifact，但未保存并比较 Room与 Event/cursor，尚未直接证明拒绝前后没有 Event/cursor或Room副作用。
- 独立验证：`npm run typecheck`通过；`node --test "tests/room-service.test.ts" "tests/claude-runner.test.ts"` 82/82通过（Runner 37、RoomService 45）；`node --test "tests/git-observer.test.ts" "tests/room-mcp.test.ts" "tests/scope.test.ts"` 45/45通过；`npm test` 207/207通过，未启动或依赖真实Claude process。Coding Result把 combined focused suite的82项误记为RoomService 82项，且`npm test` verification item缺少`status/result`；Review仅以live命令为authority。
- Review ID：`review-increment-005-codex-002`；Decision：`changes_requested`。阶段进入`REVIEW_DISCUSSION`；用户确认 findings 与最小测试方案前不生成或派发下一 Fix Task，不提交candidate实现。
- Documentation impact audit：`documentation: updated`。同步Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations与本日志为Review 2 candidate状态；实现行为未变化，Increment 5未提升为Current。

### 2026-08-26 — Increment 5 Fix Task 1 Coding 完成（candidate，REVIEW_REQUIRED）

按 [Increment 5 Fix Task 1](./INCREMENT_5_FIX_TASK_1.md) 修复 `review-increment-005-codex-001` 的三项 confirmed finding，保持原 Implementation lineage baseline `bcb9a9f9da451d64b4787d3967c0032cbc453602` 与当前未提交 candidate Diff，`review_fixes_only`，未执行任何 Git 写操作：

- `inc5-r1-pause-progress-after-question`：`src/runner/claude-runner.ts` 的 `onStdoutLine` 在调用 `appendRunProgress` 前增加 `getRun(runId)?.status === 'running'` guard。Room Run status 仍是 durable progress eligibility authority：`room_ask_question` 把同一 Run 原子置为 `needs_decision` 后，Runner 继续消费后续 stdout 以完成 interpreter/artifact/terminal/pause evidence，但不再把非终态 progress 交给只接受 running 的 `appendRunProgress`。未放宽 `appendRunProgress` 的 running-only invariant。
- `inc5-r1-finalization-idempotency-order`：`src/room/room-service.ts` 的 `finalizeNeedsDecision` 在同一 transaction 内把 `run.completed_at !== null` 的 retry/conflict 判定移到 `assertNeedsDecisionFinalizable` 之前；只有首次 finalization 执行 current Run/Room/latest open Question/membership guard。answer 后 exact same pause payload retry 返回既有 Run、`created=false` 且不新增 Event；different payload 返回 `id_conflict` 且 durable state 不变。
- `inc5-r1-baseline-test-real-claude`：`tests/claude-runner.test.ts` 的 lineage `HEAD` drift regression 改为用翻转首字符构造 guaranteed-unequal 且仍为合法 hex object ID 的 expected hash（不再依赖末位替换为 `0`），并显式注入 `makeSpawner(new FakeClaudeProcess())` 记录 invocation count，断言 `validation_failed` 在 process start 前拒绝且 `invocations.length === 0`、不创建 Run/artifact。

- tests：`tests/claude-runner.test.ts` 新增 `needs-decision pause consumes post-question progress lines without appending run_progress`（askQuestion 后经 assistant/tool_result 非终态 progress line，断言恰好一次 `question_asked`、一次 `run_paused`、零 `run_completed`/`run_failed`/`run_progress`，且不抛 `validation_failed`），并改写 baseline mismatch regression；`tests/room-service.test.ts` 把原 `finalizeNeedsDecision rejects after the question is answered` 更正为 answer 后 same-payload retry 幂等 + different-payload conflict regression，不再把违反 Accepted Contract 的 `validation_failed` 固化为期望。

验证：`npm run typecheck` 通过；`node --test "tests/room-service.test.ts" "tests/claude-runner.test.ts"` combined 82/82 通过（Runner 37、RoomService 45）；`node --test "tests/git-observer.test.ts" "tests/room-mcp.test.ts" "tests/scope.test.ts"` 45/45 通过；`npm test` 207/207 通过，未启动或依赖真实 Claude process。未 commit、未 stage、未执行 branch/worktree/push/清理；candidate 未提升为 Current。

Documentation impact audit：`documentation: updated`。仅更新本日志的 candidate Coding/验证事实与 `REVIEW_REQUIRED` 状态，未修改 Project Rules/Architecture/Room Protocol/ADR/MVP Plan/Operations 或 Fix Contract；净 source 变更为 `src/runner/claude-runner.ts` 与 `src/room/room-service.ts` 的最小 guard/顺序调整，净 test 变更为两个 test 文件，无 schema/state/Event/protocol/dependency 漂移。

### 2026-08-26 — Increment 5 Fix Task 1 docs-only commit 与人工派发授权

- 用户明确要求完成 Accepted Fix Task文档提交，并继续由自己人工派发；授权的 Git scope只包含 `PROJECT_RULES.md`、Increment 5 Fix Task 1与本次 Codex Review/planning/state的八个 `docs/documents/`路径，不包含任何source、test、package、runtime或artifact。
- 原 Implementation lineage baseline继续为`bcb9a9f9da451d64b4787d3967c0032cbc453602`。本次docs-only commit只允许让manual dispatch `HEAD`成为该baseline的descendant；派发前必须验证ancestry、commit path、0 staged与既有source/test candidate path set。人工delivery不调用candidate `runClaude`，因此不为产品exact-HEAD gate增加runtime例外。
- Fix Coding仍由用户在原Increment 5 Claude session中人工派发；Claude不得执行任何Git写操作。Codex后续Review从原lineage baseline读取docs commit与未提交Fix candidate的完整task-owned Diff。
- 本节不预写commit自身hash；exact commit与派发`HEAD`由commit完成后的live Git输出作为权威证据。
- Documentation impact audit：`documentation: updated`。只具体化经用户授权的docs-only commit/manual dispatch metadata，不改变confirmed finding、Fix solution、product architecture、Room protocol或candidate Current状态。

### 2026-08-26 — Increment 5 Review 1 方案确认与 Fix Task 1

- 用户明确确认 `review-increment-005-codex-001` 的三项 finding 与最小 solution：Question durable 后不再把后续非终态 stream progress 交给 running-only `appendRunProgress`，但继续消费 stdout/artifact/terminal 并完成 pause settlement；completed finalization 先按已持久化 payload 处理 retry/conflict，只有首次 finalization 执行 open-Question lifecycle guard；baseline mismatch regression 使用 guaranteed-unequal valid hash、injected fake/throwing spawner 与零 invocation assertion。
- 已创建 [Increment 5 Fix Task 1](./INCREMENT_5_FIX_TASK_1.md)，状态为 Accepted、`confirmed_by_user=true`、`review_fixes_only=true`，只允许最小修改 `src/runner/claude-runner.ts`、`src/room/room-service.ts`、对应两个 test 与 candidate Development Log；不新增或修改 state/schema/Event/protocol/MCP/dependency/Runner CLI。
- Fix 继续复用原 Implementation lineage baseline `bcb9a9f9da451d64b4787d3967c0032cbc453602`、当前 `main` dirty candidate 与原 Increment 5 Claude session；不重新执行 clean-worktree gate，不覆盖或拆分既有 candidate。
- 当前进入 `FIX_PLAN_READY`，等待用户人工派发。此次确认不授权 Codex 启动 Claude，也不授权真实 Claude smoke、stage、commit、push、branch/worktree、reset、restore、clean 或清理。
- Documentation impact audit：`documentation: updated`。新增 Accepted Fix Contract并同步 Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP、Operations与当前开发状态；candidate 未提升为 Current。

### 2026-08-26 — Increment 5 Review 1（changes_requested）

- Codex 以 lineage baseline `bcb9a9f9da451d64b4787d3967c0032cbc453602` 核对 Accepted Contract、Coding Result、完整 staged/unstaged/untracked candidate、source/test/document Diff 与独立验证；Review ID 为 `review-increment-005-codex-001`，Decision 为 `changes_requested`。
- High `inc5-r1-pause-progress-after-question`：`room_ask_question` 将 Run 持久化为 `needs_decision` 后，后续正常 Claude stream progress 仍调用只接受 `running` 的 `appendRunProgress`，可抛出 `validation_failed` 并在 `finalizeNeedsDecision` 前中断 pause settlement。既有 fake-process tests 在 Question 后只发出 interpreter 忽略的 `init`/`result`，未覆盖真实可达顺序。
- High `inc5-r1-baseline-test-real-claude`：lineage HEAD drift regression 通过把真实 hash 末位替换为 `0` 构造 expected hash；当真实 `HEAD` 本身以 `0` 结尾时没有 mismatch，且该测试未注入 fake spawner，会进入本机真实 Claude process path。本次 `npm test` 即以 60.6 秒失败于 “Missing expected rejection”，全量结果为 205/206。
- Medium `inc5-r1-finalization-idempotency-order`：`finalizeNeedsDecision` 在检查既有 `completed_at` payload retry/conflict 前要求 latest Question 仍 open；成功 finalization 并 answer 后，同 payload retry 返回 `validation_failed`，不再满足 Contract 的幂等返回既有 Run 语义。
- 最小方向分别为：在 Question durable 后停止把后续 stream progress 追加到只接受 `running` 的 Room progress path，并补真实事件顺序 regression；先按已完成 Run 的持久化 payload 判定 retry/conflict，再只对首次 finalization 执行 open-Question lifecycle guard；构造 guaranteed-unequal valid hash 并注入 asserting fake/throwing spawner，证明 mismatch 在 process start 前拒绝。三个方向均不新增 state/schema/MCP/dependency，待用户确认后才能形成 `review_fixes_only` Fix Task。
- Documentation impact audit：`documentation: updated`。同步 Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP Plan、Operations 与本日志为 Review 1 `changes_requested`；未把 candidate 提升为 Current，未修改业务代码、测试或实现配置。

### 2026-08-26 — Increment 5 Coding 完成（candidate，REVIEW_REQUIRED）

按 [Increment 5 Task Contract](./INCREMENT_5_TASK_CONTRACT.md) 交付 Decision/Fix continuation 的最小编排，lineage baseline `HEAD` 为 `bcb9a9f9da451d64b4787d3967c0032cbc453602`，0 staged，未执行任何 Git 写操作：

- `src/room/room-service.ts`：新增 `ContinuationContext` type（`new_implementation` / `decision` / `fix`）；`startRun`/`resumeRun` 在 `assertCurrentTask` 之后分别执行 `assertStartableState`（拒绝 `NEEDS_DECISION`/`FIX_PLAN_READY`）与 `assertResumableState`（拒绝无 prior Run 的 `PLAN_READY`）；`answerQuestion` 在 open 检查后执行 `assertAnswerableQuestion`（source Run 未 pause-finalized 时拒绝）。新增 public `finalizeNeedsDecision(runId, result, failure, evidence)`（单 transaction：校验 `assertNeedsDecisionFinalizable`；`completed_at` 已存在时比较 `runPauseSignature` 与 `pausePayloadSignature`，相等→返回既有、不等→`id_conflict`；否则写 evidence+`completed_at`、追加 `run_paused` Event、保持 `needs_decision` status、不 `applyTransition`）与 `getContinuationContext(roomId, taskId)`（从 persisted Question/Review lineage 推导 continuation）。
- `src/git/git-observer.ts`：新增 `ContinuationObservation` interface 与 `observeContinuation(targetPath)`，返回 `{repositoryRoot, head, evidence}`，dirty-allowed、不执行 clean gate、失败向上抛。
- `src/runner/claude-runner.ts`：改写 `runClaude`，移除 caller 提供的 `mode`/`resumeSessionId`；改由 `getContinuationContext` 决定——`new_implementation` 走 `establishCleanBaseline`（mode=start），`decision`/`fix` 走 `observeContinuation` 并校验 `HEAD === sourceRun.baseline_head`（mode=resume、`resumeSessionId=sourceRun.claude_session_id`）。`executeRun` 用 `getRun(runId).status === 'needs_decision'` 分流：true→`classifyNeedsDecisionPause`→`finalizeNeedsDecision`，false→`classifyTerminal`→`completeRun`/`failRun`。

- tests（fake-process matrix，覆盖 decision/fix continuation、answer_changes_contract 拒绝、lineage `HEAD` drift 与 needs-decision pause settlement）：`tests/claude-runner.test.ts`（`makeQuestion`/`makeDecisionReadyService`/`makeFixContinuationReadyService`，移除 `mode`/`resumeSessionId`，新增 4 项 continuation + 5 项 pause settlement）、`tests/room-service.test.ts`（`finalizeNeedsDecision` 持久化/幂等/冲突/reject-after-answered、answer-before-pause gate、start/resume wrong-mode guard、`getContinuationContext` 推导与拒绝）、`tests/git-observer.test.ts`（`observeContinuation` dirty-allowed、subdirectory root、fatal failure、non-repo、unborn HEAD）、`tests/room-mcp.test.ts`（pause-finalized gate、fix flow `resumeRun`）、`tests/room-state-snapshot.test.ts`（`finalizeNeedsDecision` 前置）、`tests/scope.test.ts`（test name Increment 5）。

Coding Result 报告的验证为：`npm run typecheck` 通过；`node --test "tests/room-service.test.ts" "tests/claude-runner.test.ts"` 81/81；`node --test "tests/git-observer.test.ts" "tests/room-mcp.test.ts"` 44/44；`node --test "tests/scope.test.ts"` 1/1；`npm test` 206/206。Review 独立验证的当前事实以上一节为准。未 commit、未 stage、未执行 branch/worktree/push/清理；candidate 未提升为 Current。

Documentation impact audit：`documentation: updated`。同步 Architecture §3.9、ROOM_PROTOCOL §12.1、ADR-0002、MVP Plan、Operations §4.2 与开发状态为「Coding 完成、candidate、未 Review/接受」；未把 Increment 5 写成 Current capability。

### 2026-08-26 — Increment 5 documentation baseline 与人工派发门禁

- 用户明确授权修正提交后仍保留的“baseline尚未提交”Current状态，并 amend当前未推送 documentation commit；授权范围只覆盖本次 planning/state文档一致性与同一 baseline commit，不包含 Claude Coding、实现 commit、push、branch/worktree、runtime初始化或清理。
- `PROJECT_RULES.md`、Increment 5 Contract、文档中心、MVP Plan、Operations与本日志统一记录：Accepted documentation已进入 clean `main` baseline，项目仍为 `PLAN_READY`，下一 actor为用户人工派发 Claude Code。
- 派发 metadata固定为 target worktree `D:\agent\case\codex-claudecode-room`、branch `main`、task owner `Claude Code（用户人工派发）`；exact `baseline_head`在 amend完成后从 live Git读取并随派发指令报告。
- 未运行代码测试：本次只修正文档状态，source、test、package与runtime输入未变化；重复执行代码测试不会改变 documentation/dispatch gate判断。
- Documentation impact audit：`documentation: updated`。Current状态、Contract prerequisite、运维视图与下一步已一致；Accepted design与尚不存在的 Candidate implementation保持分离。

### 2026-08-25 — Increment 5 Task Contract 用户确认与人工派发选择

- 用户明确确认 [Increment 5 Task Contract](./INCREMENT_5_TASK_CONTRACT.md) 的完整内容；Contract更新为 `Accepted`、`confirmed_by_user=true`，阶段从 `WAITING_FOR_USER_CONFIRMATION`进入 `PLAN_READY`。
- 用户明确选择“暂时由我人工派发，给出指令”。Codex不启动 Claude、Room service、runtime database或 Runner launcher，只提供引用完整 Accepted Contract的可复制指令。
- 本次人工 delivery是为开发当前缺失 continuation capability的一次性 execution bridge；不恢复通用 `claude -p` bootstrap规则，不建立第二套 Room state，不改变 Runner-owned product lifecycle，也不把模型自述当作验收证据。
- 派发前置仍未满足：本轮9个 planning/state文档尚未获 commit授权，worktree非 clean，actual dispatch `baseline_head`尚未形成。用户不得在 documentation baseline提交并重新核对 branch/HEAD/status前执行指令。
- 本次确认不授权 documentation commit、stage、Claude process、真实 paid smoke、实现 commit、push、branch/worktree、runtime初始化或清理。
- Documentation impact audit：`documentation: updated`。同步 Contract、Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP、Operations与开发阶段；Accepted design与尚不存在的 Candidate implementation继续分离。

### 2026-08-25 — Increment 5 Decision/Fix Resume Draft

- 用户确认继续进入 Increment 5 planning；该确认不等于批准 Contract，也不授权 runtime 初始化、Runner launcher、Coding、真实 Claude smoke或任何 Git写操作。
- Codex 从 clean `main` `44fd34959834b28c8909b589a203e4c48eadc5b0` 核对 Current Architecture、Room Protocol、MVP、ADR-0002、RoomService、Git Observer、central Runner、MCP public path与 tests，形成 [Increment 5 Draft Contract](./INCREMENT_5_TASK_CONTRACT.md)，`confirmed_by_user=false`。
- 已确认的现状：RoomService已有 Question/answer/Fix reference/resume primitives，Process Transport已有 exact `--resume`；但 `runClaude` 对 Question使 Run变为 `needs_decision` 后仍只会调用 `completeRun`/`failRun`，并对 explicit resume继续执行 clean-worktree gate，session/baseline/mode与 answer context仍由 caller提供。
- Draft的最小方向：Runner在 Question后提交同一 needs-decision Run的 pause evidence与 `run_paused` Event；answer等待 source Run `completed_at`，避免旧/新 process并行；Decision/Fix continuation分别从 persisted Question或 Review/source Run推导 exact session/baseline，保留 dirty Diff并验证 unchanged `HEAD`。
- Draft不新增 state、transition、entity、schema/table/migration、MCP tool、source module、dependency、package script、Runner CLI、daemon或 scheduler；Increment 6/7 boundary保持不变。
- Dispatch prerequisite事实：repository当前只有历史 `.agent-room/artifacts/`，没有 Room runtime database；`room:serve`不创建 Room/planning state，且没有 Runner launcher command。Contract确认后仍需用户另行授权一次性 runtime初始化、service启动与受限 Current Runner launcher，不恢复旧 `claude -p` Task transport。
- 本轮未运行代码测试：只修改 planning文档，runtime输入未变化，重复执行186项 regression不会改变 Draft设计判断。文档完成前将运行 link/map/merge-marker/status consistency检查。
- Documentation impact audit：`documentation: updated`。新增 Draft Contract并同步 Project Rules、文档中心、Architecture、Room Protocol、ADR-0002、MVP、Operations与当前阶段；Candidate未提升为 Current。

### 2026-08-25 — Increment 4 实现提交授权与版本化集成

- 用户在明确的下一门禁中授权提交完整、已 Review 的 Increment 4 implementation scope；授权不包含 push、branch/worktree、真实 Claude smoke 或清理。
- 本次 atomic commit 包含 Room MCP、Status CLI、shared Room snapshot、package dependency/script、scope 与集成测试、Fix Task 1–3、Project Rules 及最终 Current 文档状态；不包含 `AGENTS.md`、`CLAUDE.md` 或下一 Increment 文件。
- Commit：`44fd34959834b28c8909b589a203e4c48eadc5b0`，message `feat(mcp): add room coordination service and status CLI`。提交前 `main`、lineage baseline `6bb99797c95e0ad99a7cd1b38350bf6a0d8e6c31`、0 staged 与 exact task-owned path set 已核对；提交后 worktree clean。
- Review 4 的验证输入未变化：`npm run typecheck`、MCP 27/27 与全量 186/186 通过。此次只维护接受后的 Current 文档状态，不重复运行相同代码测试。
- Documentation impact audit：`documentation: updated`。Room MCP、Status CLI 与 runtime command 随同已接受实现进入版本化 `main` baseline；bootstrap transport 保持 `Superseded`，protocol version 不变。

### 2026-08-25 — Increment 4 用户接受与 Fix 经验回收

- 用户明确接受 Increment 4；阶段从 `REVIEW_DISCUSSION` 进入 `ACCEPTED`。该确认只完成产品验收，不授权 commit、push、branch/worktree、真实 Claude smoke 或清理。
- `PROJECT_RULES.md` 的受限 `claude -p` bootstrap transport 已标记为 `Superseded`；后续 Coding Task 不再使用该路径。Increment 4 实现 commit 前不派发下一 Coding Task。
- 接受时实现仍位于当前 `main` working tree，`HEAD` 保持 lineage baseline `6bb99797c95e0ad99a7cd1b38350bf6a0d8e6c31`，0 staged；后续独立 commit 授权已完成，最终集成事实见上一节。
- 经验回收基于 Review 3 finding、用户确认的 Fix 3 方案、Accepted Fix Contract、实际 test-only Diff、MCP direct regression、独立验证与最终接受。现有 `CODEX_REVIEW_AND_PLANNING.md` 已完整覆盖“Contract 点名 public path 必须直接测试”“跨 lifecycle entity 构造 stale/current 关系”“失败后核对 entity/Room/Event/cursor durable state”与“正确时不制造 source 修改”；无新增可复用经验，不重复扩写角色指南。
- Documentation impact audit：`documentation: updated`。同步 Project Rules、文档中心、Architecture、Room Protocol、MVP Plan、Operations 与开发状态；不改变 product architecture、protocol version、public contract 或实现文件。

### 2026-08-25 — Increment 4 Fix Task 3 Review 4

- Codex 以 lineage baseline `6bb99797c95e0ad99a7cd1b38350bf6a0d8e6c31` 核对 Accepted Fix Task 3、Coding Result、当前 `main` staged/unstaged/untracked candidate、目标 regression、source mapping 与候选文档；`HEAD` 等于 baseline，0 staged，未执行 Git 写操作。
- confirmed finding `inc4-r3-submit-review-stale-public-path` 已闭环：测试经真实 SDK Client 与 `/mcp/codex` 的 `room_submit_review`，以新 `review-stale` 引用旧 succeeded `run-1`，而 current completed Run 为 `run-2`；adapter 返回测试侧 literal `validation_failed`。
- 失败后 `review-stale` 不存在，Room 保持 `REVIEW_REQUIRED`，public `room_get_state` snapshot 前后 `deepEqual`，current Task/Run/Review 保持 `task-2/run-2/review-1`，直接证明 Review rollback、Event list/count 与 cursor 不变。regression 直接通过，`src/mcp/tools.ts` 与其它 source 无需修改。
- Review ID：`review-increment-004-codex-004`；Findings：无；Decision：`approved`。当前进入 `REVIEW_DISCUSSION`，等待用户明确接受；接受前不提交、不终止 bootstrap transport、不派发 Increment 5。
- 独立验证：`npm run typecheck` 通过；`node --test "tests/room-mcp.test.ts"` 27/27；`npm test` 186/186。
- Documentation impact audit：`documentation: updated`。同步 Project Rules、文档中心、Architecture、Room Protocol、MVP Plan、Operations 与开发状态；只更新 candidate Review/阶段/验证事实，不改变 product architecture、protocol version、public contract 或 Current capability。

### 2026-08-25 — Increment 4 Fix Task 3 Coding 完成（candidate，REVIEW_REQUIRED）

按 [Increment 4 Fix Task 3](./INCREMENT_4_FIX_TASK_3.md) 补齐 `review-increment-004-codex-003` 的单一 confirmed finding `inc4-r3-submit-review-stale-public-path`，保持原 Implementation lineage baseline `6bb99797c95e0ad99a7cd1b38350bf6a0d8e6c31` 与现有未提交 candidate Diff，未执行任何 Git 写操作：

- `tests/room-mcp.test.ts` 新增单一 MCP public-path regression：经 service 完成 task-1/run-1/review-1，再提交已确认 Fix Task task-2、完成 run-2，使 Room 回到 `REVIEW_REQUIRED` 且 run-2 成为 current completed Run；随后通过真实 `/mcp/codex` 的 `room_submit_review` 以从未持久化的新 review_id（`review-stale`）引用旧 succeeded run-1，命中 `submitReview` 的 wrong-current guard（`run.run_id !== currentRunId`）。
- 断言：`room_submit_review` 返回 `validation_failed`（经 adapter 稳定 `{code,message}` tool error）；stale Review 未持久化（`getReview('review-stale') === null`）；Room 仍为 `REVIEW_REQUIRED`；调用前后经既有 `room_get_state` snapshot `deepEqual` 证明 Event list/count、cursor 与 durable state 完全不变；current Task/Run/Review 仍为 task-2/run-2/review-1。
- **source 未改动**：该 regression 直接通过，证明现有 adapter 行为正确，未触发 Contract「只有 direct regression 失败并证明 src/mcp/tools.ts mapping defect 时才允许最小修复」；`src/mcp/tools.ts`、`src/mcp/http.ts`、RoomService 与其它 candidate boundary 均保持不变。

验证：`npm run typecheck` 通过；聚焦 `tests/room-mcp.test.ts` 27/27 通过；`npm test` 186/186 通过。未 commit、未 stage、未执行 branch/worktree/push/清理，未运行真实 Claude smoke；candidate 进入 `REVIEW_REQUIRED`，未提升为 Current。

Documentation impact audit：`documentation: updated`。本次仅新增本 candidate Coding 事实与 source-未改动结论，未修改 Project Rules/Architecture/Room Protocol/MVP Plan/Operations 或任何 source；净变更仅为 `tests/room-mcp.test.ts` 新增一条测试。

### 2026-08-25 — Increment 4 Review 3 方案确认与 Fix Task 3

- 用户明确确认 `review-increment-004-codex-003` finding `inc4-r3-submit-review-stale-public-path` 与最小方案：只在 `tests/room-mcp.test.ts` 经真实 `/mcp/codex` 构造两轮 Run/Fix lifecycle，以新 review_id 重放旧 succeeded run-1，并断言 `validation_failed`、Review rollback、Room/current Task/current Run/current Review、Event 与 cursor 不变。
- 已创建 [Increment 4 Fix Task 3](./INCREMENT_4_FIX_TASK_3.md)，状态为 Accepted、`confirmed_by_user=true`、`review_fixes_only=true`，保留原 Implementation lineage baseline `6bb99797c95e0ad99a7cd1b38350bf6a0d8e6c31`、当前 `main` worktree 与完整 candidate Diff；阶段进入 `FIX_PLAN_READY`。
- 预期现有 adapter 行为直接通过，默认不修改 source；只有 direct regression 失败并证明 `src/mcp/tools.ts` mapping defect 时才允许最小修复。`src/mcp/http.ts`、RoomService、protocol、dependency 与其它 candidate boundary 均为 non-goal。
- 用户继续在原 Increment 4 Claude session 中人工派发。该确认不授权 Codex 调用 Claude，也不授权 stage、commit、branch/worktree、真实 Claude smoke、push 或清理。
- Documentation impact audit：`documentation: updated`。同步 Accepted Fix Contract、Project Rules、文档中心、Architecture、Room Protocol、MVP Plan、Operations 与开发状态；没有 product behavior 或 architecture decision 变化，candidate 保持 unavailable。

### 2026-08-25 — Increment 4 Fix Task 2 Review 3

- Codex 以原 lineage baseline `6bb99797c95e0ad99a7cd1b38350bf6a0d8e6c31` 核对 Accepted Fix Task 2、Coding Result、当前 `main` 完整 staged/unstaged/untracked candidate Diff、源码、测试与候选文档；`HEAD` 等于 baseline，0 staged，未执行 Git 写操作。
- `inc4-r2-cleanup-direct-evidence` 已闭环：actual `McpServer.close()`/`StreamableHTTPServerTransport.close()` observation 覆盖 success、`ProtocolError`、invalid input、non-ProtocolError internal failure 与 client abort；每个 request 无遗漏或 late duplicate close。direct regression 未证明 `closeOnce` source defect，因此 source 保持原 ownership 顺序是正确的。
- `inc4-r2-public-path-durable-matrix` 的 Task failure、answer/accept/ask failure、review/question retry/conflict 与 stale accept evidence 已闭环；但 finding `inc4-r3-submit-review-stale-public-path` 仍成立：`tests/room-mcp.test.ts` 只以当前 `running` Run 触发 status guard，没有构造旧 succeeded Run 在新 completed Run 之后经 `room_submit_review` MCP route 重放的 wrong-current 场景，因而未直接证明该 guard 的 error、Review rollback、Room/current identity、Event 与 cursor 不变。
- Review ID：`review-increment-004-codex-003`；Decision：`changes_requested`。当前进入 `REVIEW_DISCUSSION`；用户确认 finding 与最小方案前不创建或派发下一 Fix Task，不提交、不 stage、不执行 branch/worktree、真实 Claude smoke、push 或清理。
- 独立验证：`npm run typecheck` 通过；`tests/room-mcp.test.ts` 26/26；相关 suite 69/69；`npm test` 185/185。全量 suite 中 stale succeeded Run 仅由 `RoomService` public path 覆盖，不能替代 MCP route/tool direct evidence。
- Documentation impact audit：`documentation: updated`。同步 Project Rules、文档中心、Architecture、Room Protocol、MVP Plan、Operations 与开发状态；candidate 继续 unavailable，未提升为 Current。

### 2026-08-25 — Increment 4 Fix Task 2 Coding 完成（candidate，REVIEW_REQUIRED）

按 [Increment 4 Fix Task 2](./INCREMENT_4_FIX_TASK_2.md) 补齐 `review-increment-004-codex-002` 的两项 confirmed finding，保持原 Implementation lineage baseline `6bb99797c95e0ad99a7cd1b38350bf6a0d8e6c31` 与现有未提交 candidate Diff，未执行任何 Git 写操作：

- `inc4-r2-cleanup-direct-evidence`：`src/mcp/http.ts` 的 `RoomMcpHttpDeps` 增加测试 seam `observeRequestResource`（request-owned server/transport 创建后、connect 前同步回调一次，只服务本 Contract 的实际 close observation，不改变 public contract，runtime entry 不设置）。`tests/room-mcp.test.ts` 通过该 seam 包装实际实例的 `.close()`，直接计数 `transport.close()`/`server.close()` 调用，覆盖成功、`ProtocolError`、SDK invalid input、non-ProtocolError 内部失败（`node:sqlite` 关闭后 `.prepare()` 抛普通 `Error`）、client abort（在 `observeRequestResource` 触发后 `req.destroy()`）五种真实 MCP route 场景，并断言同一 request 无遗漏或 late duplicate close。
- **关键偏差（source 未改动）**：经 direct regression 验证，当前 `closeOnce`（先 `transport.close()` 后 `server.close()`）**不存在重复或遗漏 close 缺陷**。SDK `WebStandardStreamableHTTPServerTransport.close()` 同步触发 `onclose` → `Protocol._onclose()` 将 `_transport` 置为 `undefined`，因此后续 `server.close()`（经 `Protocol.close()` 传递关闭 transport）是 no-op；old 与 new 两种顺序下 `transport.close()`/`server.close()` 实际调用均各为一次。据此 Contract「只有 direct regression 失败并证明 adapter defect 时才允许最小修改」未触发，`closeOnce` 保持 Fix Task 1 的原实现不变，未在 `src/mcp/http.ts` 之外作任何 source 修改。
- `inc4-r2-public-path-durable-matrix`：`tests/room-mcp.test.ts` 新增 `snapshot()` 经 `room_get_state` 捕获 public Room snapshot（cursor/events/room state/current entity），对 `room_submit_task` missing repository/HEAD/dirty/invalid、`room_submit_review` 当前 non-succeeded Run rollback、`room_answer_question` 已回答、`room_accept_review` blocking、`room_ask_question` non-running rollback 全部补齐失败前后 `assert.deepEqual` 的 durable-state 不变断言；新增 `room_submit_review` 与 `room_ask_question` 的 same-ID/same-content retry（返回既有 entity、无新增 Event）与 same-ID/different-content conflict（`id_conflict`、durable state 不变）；新增 `room_accept_review` 经 fix-path 二次 review 构造 stale（非 current）拒绝。

验证：`npm run typecheck` 通过；聚焦 `tests/room-mcp.test.ts` 26/26 通过；`npm test` 185/185 通过。未 commit、未 stage、未执行 branch/worktree/push/清理，未运行真实 Claude smoke；candidate 进入 `REVIEW_REQUIRED`，未提升为 Current。

Documentation impact audit：`documentation: updated`。本次仅新增本 candidate Coding 事实与上述 source-未改动偏差，未修改 Project Rules/Architecture/Room Protocol/MVP Plan/Operations；`src/mcp/http.ts` 的净变更为新增 `observeRequestResource` seam，`closeOnce`、`onRequestCleanedUp`、JSON response 与全部 public tool/schema/error mapping 保持不变。

### 2026-08-25 — Increment 4 Review 2 方案确认与 Fix Task 2

- 用户明确确认 `review-increment-004-codex-002` 的两项 finding 与最小方案：直接构造 client abort/connection close 和 handler/internal failure 并观察实际 `McpServer.close()`/`StreamableHTTPServerTransport.close()` 的 request-owned cleanup；为全部 write tool 补齐 durable Event/cursor rollback，并覆盖 `room_submit_review`、`room_ask_question` 的 retry/conflict/idempotency public path。
- 已创建 [Increment 4 Fix Task 2](./INCREMENT_4_FIX_TASK_2.md)，状态为 Accepted、`confirmed_by_user=true`、`review_fixes_only=true`，保留原 Implementation lineage baseline `6bb99797c95e0ad99a7cd1b38350bf6a0d8e6c31`、当前 `main` worktree 与完整 candidate Diff；阶段进入 `FIX_PLAN_READY`。
- 用户选择在原 Increment 4 Claude session 中人工派发。该确认不授权 Codex 调用 Claude，也不授权 stage、commit、branch/worktree、真实 Claude smoke、push 或清理。
- Documentation impact audit：`documentation: updated`。同步 Accepted Fix Contract、Project Rules、文档中心、Architecture、Room Protocol、MVP Plan、Operations 与开发状态；没有产品行为或 architecture decision 变化，candidate 保持 unavailable，未提升为 Current。

### 2026-08-25 — Increment 4 Fix Task 1 Review 2

- Codex 以原 lineage baseline `6bb99797c95e0ad99a7cd1b38350bf6a0d8e6c31` 核对 Accepted Implementation/Fix Contract、当前 `main` 完整 staged/unstaged/untracked candidate Diff、Coding Result、源码、测试与候选文档；未执行 Git 写操作。
- `inc4-r1-typecheck`、JSON response、Status CLI read-only 与 runtime project startup gate 已由源码和独立命令闭环：`npm run typecheck` 通过，聚焦 34/34、全量 180/180 通过，exact dependency 未漂移。
- Finding `inc4-r2-cleanup-direct-evidence`：`tests/room-mcp.test.ts` 的 cleanup regression 只覆盖正常 success、`ProtocolError` 与 invalid arguments；没有构造 Accepted Fix Task 要求的 client abort/connection close 或 handler/internal failure，且 `onRequestCleanedUp` 只计数 owner callback，删除实际 `transport.close()`/`server.close()` 后仍可通过，不能直接证明 request-owned resource close boundary。
- Finding `inc4-r2-public-path-durable-matrix`：新增 MCP failure tests 多数只断言 error、entity 与 Room state，未同时断言 Event count/cursor rollback；除 `room_submit_task` 外，没有直接覆盖 create retry/conflict/idempotency public path。共享 `RoomService` tests 不能替代 adapter evidence。
- Review ID：`review-increment-004-codex-002`；Decision：`changes_requested`。当前进入 `REVIEW_DISCUSSION`；用户确认最小方案前不创建或派发下一 Fix Task，不提交、不 stage、不执行 branch/worktree、真实 Claude smoke、push 或清理。
- Documentation impact audit：`documentation: updated`。同步 Project Rules、文档中心、Architecture、Room Protocol、MVP Plan、Operations 与开发状态；candidate 保持 unavailable，未提升为 Current。

### 2026-08-25 — Increment 4 Review 1 方案确认与 Fix Task 1

- 用户明确确认 `review-increment-004-codex-001` 的五项 finding 与最小方案：type-safe SDK result narrowing、JSON response 与 request-owned idempotent cleanup、SQLite read-only Status CLI、database open 前的 project directory startup gate，以及直接 MCP public-path failure/rollback/restart matrix。
- 已创建 [Increment 4 Fix Task 1](./INCREMENT_4_FIX_TASK_1.md)，状态为 Accepted、`confirmed_by_user=true`、`review_fixes_only=true`，保留原 Implementation lineage baseline `6bb99797c95e0ad99a7cd1b38350bf6a0d8e6c31`、当前 `main` worktree 与完整 candidate Diff；阶段进入 `FIX_PLAN_READY`。
- 原 Increment 4 Claude session ID 尚待从 bootstrap 证据恢复；本次确认不授权 Fix Coding 派发、真实 Claude 调用、stage、commit、branch/worktree、push 或清理。
- Documentation impact audit：`documentation: updated`。同步 Accepted Fix Contract、Project Rules、文档中心、Architecture、Room Protocol、MVP Plan、Operations 与开发状态；candidate 保持 unavailable，未提升为 Current。

### 2026-08-25 — Increment 4 Fix Task 1 Coding 完成（candidate，REVIEW_REQUIRED）

按 [Increment 4 Fix Task 1](./INCREMENT_4_FIX_TASK_1.md) 修复 `review-increment-004-codex-001` 的五项 confirmed finding，保持原 Implementation lineage baseline `6bb99797c95e0ad99a7cd1b38350bf6a0d8e6c31` 与现有未提交 candidate Diff，未执行任何 Git 写操作：

- `inc4-r1-typecheck`：`tests/room-mcp.test.ts` 用最小 `resultText` type guard 收窄 SDK `callTool` union result 读取 content text；不含 any、ts-ignore、skipLibCheck 或放宽 SDK type。`npm run typecheck` 通过。
- `inc4-r1-json-response-lifecycle`：`src/mcp/http.ts` 每个 request-owned `StreamableHTTPServerTransport` 显式 `enableJsonResponse: true`，单一 idempotent `closeOnce` owner 在正常完成、connection close/abort、异常路径只关闭一次；`RoomMcpHttpDeps` 增加测试 seam `onRequestCleanedUp`（不改变 public contract）。
- `inc4-r1-status-read-only`：`src/cli/status.ts` 用 `new DatabaseSync(config.db, { readOnly: true })` 只读打开，`new RoomService(db)` 包 try/catch → non-zero；既存空 database 不再初始化 schema，missing path 不创建文件。
- `inc4-r1-runtime-startup-validation`：`src/mcp/serve.ts` 在 `openDbOrExit` 前调用 `validateProjectOrExit`，missing/non-directory project 写 stderr、non-zero exit 且不创建 `--db` 文件、不输出 listening。
- `inc4-r1-public-path-matrix`：`tests/room-mcp.test.ts` 新增 raw HTTP Content-Type（initialize/tools-list/tools-call 为 `application/json` 且不含 SSE）、可观察 cleanup 恰好一次、missing repo/HEAD、invalid schema、stale submit_review/answer_question/ask_question、blocking accept_review、file-backed restart persistence；`tests/status-cli.test.ts` 新增既存空/损坏 database 回归；新增 `tests/room-serve.test.ts` child-process startup/bind/config 回归。

验证：`npm run typecheck` 通过；聚焦 `tests/room-mcp.test.ts`/`tests/status-cli.test.ts`/`tests/room-serve.test.ts` 34/34 通过；`npm test` 180/180 通过。未 commit、未 stage、未执行 branch/worktree/push/清理，未运行真实 Claude smoke。

Documentation impact audit：`documentation: updated`。同步 Architecture/ROOM_PROTOCOL candidate transport 事实、MVP Plan 状态、Operations candidate 运维视图与开发状态；candidate 进入 `REVIEW_REQUIRED`，未提升为 Current。

### 2026-08-25 — Increment 4 Review 1

- Codex 以 `main` `6bb9979` 为 baseline，核对完整 staged/unstaged/untracked task-owned Diff、Accepted Contract、Coding Result、源码、测试与候选文档。实际变更为 8 个 modified、8 个 untracked、0 staged，均在 Contract scope；未执行 Git 写操作。
- Review `review-increment-004-codex-001` 确认五项 finding：`inc4-r1-typecheck`（当前 `npm run typecheck` 在 `tests/room-mcp.test.ts:131/141` 失败）、`inc4-r1-json-response-lifecycle`（raw initialization 返回 `Content-Type: text/event-stream`，且成功路径在 `handleRequest` 返回后才注册 `close` cleanup）、`inc4-r1-status-read-only`（既存空 database 调用 `room:status` 后创建六张 Room tables）、`inc4-r1-runtime-startup-validation`（不存在的 project 仍输出 listening，并创建 database）、`inc4-r1-public-path-matrix`（Accepted Contract 点名的 missing repo/HEAD、invalid schema/current entity、blocking Review、rollback 与 restart 没有经各自 MCP public path 直接验证）。Decision：`changes_requested`。
- 独立验证：`npm test` 162/162 通过；`npm ls --depth=0` 确认 exact direct dependency；两个 raw behavior probe 与一个 runtime startup probe 复现上述偏离。全绿 tests 没有覆盖 raw response mode、request resource cleanup、既存 invalid database 不变性或 invalid project startup。
- 当前进入 `REVIEW_DISCUSSION`。用户确认 finding 与最小方案前，不创建或派发 Fix Task；不提交、不 stage、不执行 branch/worktree、真实 Claude smoke、push 或清理。
- Documentation impact audit：`documentation: updated`。同步 Project Rules、文档中心、Architecture、Room Protocol、MVP Plan、Operations 与开发状态；candidate 保持 unavailable，未提升为 Current。

### 2026-08-25 — Increment 4 Coding 完成（candidate）

按 [Increment 4 Task Contract](./INCREMENT_4_TASK_CONTRACT.md) 交付 loopback-only Room MCP service 与 read-only Status CLI：

- `package.json`/`package-lock.json`：新增 `@modelcontextprotocol/sdk@1.30.0`（runtime）与 `@types/express@5.0.6`（dev），增加 `room:serve`/`room:status` script；保留现有 `zod@4.4.3`、Node/npm engine 与 TypeScript 配置。
- `src/room/state-snapshot.ts`（新增）：MCP 与 CLI 共用的只读 Room state snapshot boundary —— 输入 `room_id` + nullable `after_sequence`，返回完整 Room、nullable current Task/Run/Review/open Question、`waiting_actor`、`cursor` 与 `sequence > after_sequence` 的升序 Event；current entity 以最新 `task_submitted`/`run_started|run_resumed`/`review_submitted`/`question_asked` Event reference 解析，waiting actor 用 Contract 固定映射。
- `src/mcp/tools.ts`（新增）：`registerCodexTools`（五个 Codex tool）与 `registerClaudeTools`（仅 `room_ask_question`）；`room_submit_task` 在 existing Task lookup 之后、仅首次 `type=implementation` 时调用 `establishCleanBaseline(projectPath)` 并返回 `observed_baseline_head`，`type=fix` 不重新建立 baseline；ProtocolError 经 `runTool` 映射为稳定 `{code,message}` tool error，非 ProtocolError 保持 SDK internal/tool error。
- `src/mcp/http.ts`（新增）：`createRoomMcpApp` 使用 `createMcpExpressApp({host:'127.0.0.1'})` 暴露 `/mcp/codex` 与 `/mcp/claude`，每个 request 独立 stateless server/transport（`sessionIdGenerator: undefined`），GET/DELETE 返回 405。
- `src/mcp/serve.ts`（新增）：`room:serve` runtime entry，显式 `--db`/`--project`/`--port`，host 固定 `127.0.0.1`。
- `src/cli/status.ts`（新增）：read-only Status CLI，显式 `--db`/`--room-id`，调用共享 snapshot，输出 deterministic pretty JSON；打开 SQLite 前确认 `--db` 已存在，missing path 不创建空 database。
- `tests/room-state-snapshot.test.ts`、`tests/room-mcp.test.ts`、`tests/status-cli.test.ts`（新增）与 `tests/scope.test.ts`（改写）覆盖 snapshot authority/cursor/waiting actor、actor-scoped tool surface、HTTP transport/error mapping、new-only Git gate/idempotency order、CLI read-only parity 与 scope/dependency drift。

Claude Coding Result 报告：`npm run typecheck` 通过；聚焦测试 `tests/room-state-snapshot.test.ts` `tests/room-mcp.test.ts` `tests/status-cli.test.ts` 23/23 通过；`npm test` 162/162 通过。Codex Review 独立复跑时 `npm run typecheck` 失败，故前述 typecheck 自述不是当前有效验收证据；未运行真实 Claude smoke。

Claude Coding Result 报告无 deviation/unresolved；Codex Review 1 已确认五项 finding，Decision 为 `changes_requested`。未 commit、未 stage、未执行 branch/worktree/push/清理。

Documentation impact audit：`documentation: updated`。同步 Architecture/ROOM_PROTOCOL candidate 标记、MVP Plan 状态、Operations candidate 运维视图与当前开发状态；未把 MCP/CLI、runtime command 或 bootstrap replacement 写成 Current。

### 2026-08-25 — Increment 4 Task Contract 用户确认

- 用户明确确认 [Increment 4 Task Contract](./INCREMENT_4_TASK_CONTRACT.md) 的完整内容；文档状态更新为 `Accepted`、`confirmed_by_user=true`，项目阶段进入 `PLAN_READY`。
- 已确认的 Implementation boundary 包括 dual actor-scoped stateless routes、MCP/CLI shared Room snapshot、new-only Implementation clean Git gate、fixed loopback/explicit runtime parameters，以及 exact MCP SDK/type dependency。
- 本次确认只批准完整 Implementation Task Contract，不自动授权 documentation commit、branch/worktree、Claude Coding 派发、真实 Claude smoke、实现 commit、push 或清理。
- Documentation impact audit：`documentation: updated`。同步 Contract、Project Rules、文档中心、Architecture、Room Protocol、MVP Plan、Operations 与当前开发状态；明确区分 Accepted design 与尚未实现的 runtime capability。
- 未运行测试：本次仅更新确认状态，业务代码与 runtime 输入未变化；重复测试不会改变 `PLAN_READY` 判断。

### 2026-08-24 — Increment 4 Room MCP 与 Status CLI Draft

- 用户要求“继续”后，Codex 从 clean `main` `2c2b880905eb7b39a0a84814dd7d5c3b0165a763` 核对 Current Architecture、Room Protocol、MVP、RoomService/Repository public API、Git Observer、Runner tool authority、Scope regression 与 package dependency baseline。
- 已形成 [Increment 4 Task Contract](./INCREMENT_4_TASK_CONTRACT.md)，单一目标是 actor-scoped loopback Room MCP 与 read-only Status CLI；`confirmed_by_user=false`，当前只等待用户评审。
- Draft 冻结两个 stateless Streamable HTTP route：`/mcp/codex` 只注册五个 Codex tool，`/mcp/claude` 只注册 `room_ask_question`；actor authority 不依赖 caller string/header。
- Draft 增加 MCP/CLI 共享的只读 Room state snapshot candidate，以 Event reference 解析 current Task/Run/Review/open Question、cursor 与 fixed waiting actor mapping；不新增 Room state、entity、table 或 migration。
- Draft 把既有 Git clean gate 连接到首次 Implementation Task submission，并明确 existing-ID retry/conflict 先于 new-only gate、Fix Task 不重新建立 baseline，避免破坏既有 idempotency 与 retry semantics。
- 核对现有 schema 后修正旧 Architecture 描述：`baseline_head` 属于 Run 而非 Task。MCP submission 只返回 clean-gate observation 作为 dispatch evidence，Runner start 仍独立重检并持久化到 Run；本 Draft 不修改 Task schema。
- dependency capability 已核对：`@modelcontextprotocol/sdk@1.30.0`、`@types/express@5.0.6`、现有 `zod@4.4.3`；本机 Claude Code `2.1.241` 支持 HTTP MCP registration。未修改 package/lock 或业务代码。
- Documentation impact audit：`documentation: updated`。同步 Draft Contract、Documentation Map/中心、Architecture/Protocol candidate、MVP、Operations 与当前开发状态；未把 MCP/CLI 或 proposed command 写成 Current。
- 本次未运行测试：规划文档不改变 runtime，测试结果不会改变 Draft 设计判断。未执行 commit、branch/worktree、Claude Coding 派发、真实 Claude smoke、push 或清理。

### 2026-08-24 — Increment 3 fast-forward 集成到 main

- 用户明确授权执行 `git merge --ff-only e8f0da6db9f3f4ff426355fa1a84d19bae4db9f2`，且明确排除 push、branch/worktree 清理与后续文档 commit。
- 合并前核对当前 branch 为 clean `main`、`HEAD=e3eb438bc7aeb6734d897cc4a222eb6b5eb8d983`、目标 commit 存在，且当前 `HEAD` 是目标 commit 的 ancestor；随后 fast-forward 成功，`main` 前进到 `e8f0da6db9f3f4ff426355fa1a84d19bae4db9f2`。
- 该操作未生成 merge commit，未改写历史，未 push，也未清理任何 branch/worktree。Runner 代码、测试、Fix Contract、Review 后项目文档与 experience recovery 现已进入 `main`。
- Documentation impact audit：`documentation: updated`。合并 commit 中保留的“尚未进入 main”状态已失效；用户随后明确授权将本次 main integration 状态同步作为单独 docs-only commit 提交。文档不预写其自身 commit hash，exact current `HEAD` 以 Git 为准。

### 2026-08-24 — Increment 3 用户接受与经验回收

- 用户明确接受 `review-increment-003-integration-codex-002` 与 Increment 3 Claude Runner，项目阶段进入 `ACCEPTED`；没有 unresolved finding。
- 接受先完成产品/Review 门禁；用户随后另行授权提交当前已 Review 的 Integration/Fix 代码、测试和项目文档。提交已在 `codex/inc3-integration` 完成，授权不包含 push、merge、branch/worktree 清理或历史改写，当前尚未进入 `main`。
- Experience recovery 使用原四项 finding、Accepted Fix Task、实际完整 Diff、direct regression 与 Review 2 证据。已有 current entity 与 guard/idempotency 规则已覆盖，不重复扩写；新增两项可复用规则：failure classification 与可靠 partial lifecycle evidence 分开判断，以及 central orchestrator 必须直接证明 leaf outcome 到 protocol mapping、durable evidence 与唯一 terminal transition。
- Codex 经验写入 [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md) 第 12 节；Claude 实现与 regression 经验写入 [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md) 第 11 节。该回收不新增 Room state、Event、protocol field、runtime hook 或 ADR。

### 2026-08-24 — Increment 3 Integration Fix 1 Review 2

- Codex 以 `63059189e97f7419238f5a3678513d4ca5e50f0d` 为 lineage baseline，确认其同时包含 exact leaf commits `86c77a7c68b953343d67da3857859b0dd6d6c09c` 与 `1062a7500f8bb3e22c7c3818ddcac2e9eb625efa`，并审查完整 staged、unstaged、untracked task-owned Diff；当前 0 staged，Runner 仍为未提交 candidate。
- 四项 confirmed finding 均闭环：new Run 的 current Task guard 位于 Run retry/conflict 判定之后并保持 rollback；`required_tool_missing` 保留通过 expected-session 约束的 observed session；central `runClaude` failure matrix 直接断言唯一 mapping 与 single terminal transition；`ROOM_PROTOCOL.md`/`ARCHITECTURE.md` 统一为进入 `CODING` 后执行 startup/init、失败经 `CODING → RUN_FAILED`。
- 独立验证：`npm run typecheck` 通过；聚焦测试 96/96 通过；Scope 1/1 通过；`npm test` 139/139 通过。未运行真实 Claude smoke。
- Review ID：`review-increment-003-integration-codex-002`；Findings：无；Decision：`approved`。阶段进入 `REVIEW_DISCUSSION`，等待用户明确接受；Review 通过不自动授权 commit、push 或清理。
- Documentation impact audit：`documentation: updated`。修正 `PROJECT_RULES.md`、文档中心、Architecture/Protocol candidate 标记、MVP/Development/Operations 状态与并行计划中的历史 lifecycle 描述；未把 candidate 提升为 main Current capability。

### 2026-08-24 — Increment 3 Integration Fix 1 Coding 完成（candidate）

按 [Increment 3 Integration Fix Task 1](./INCREMENT_3_INTEGRATION_FIX_TASK_1.md) 修复 `review-increment-003-integration-codex-001` 的四项 confirmed finding：

- `inc3-integration-r1-current-task-guard`：`RoomService.startRun/resumeRun` 在同一 transaction 内复用该 Room 最新 `task_submitted` Event（`latestEventEntityId(roomId, 'task_submitted')`）作为 current Task authority；guard 位于 insertRun 幂等/conflict 判断之后，只对 newly inserted Run 执行，stale Task 以 `validation_failed` 回滚且不产生 partial write。
- `inc3-integration-r1-partial-session-evidence`：`ClaudeStreamInterpreter.acceptInit` 在 non-empty session 通过 expectedSessionId 约束后、required tool 校验前保存 `observedSessionId`；`required_tool_missing` failure 携带该 sessionId，`failRun` 原子持久化到 `Run.claude_session_id`；空 session 仍先失败为 `init_error` 且不伪造 session。
- `inc3-integration-r1-central-failure-matrix`：`tests/claude-runner.test.ts` 经 central `runClaude` 直接覆盖 asynchronous child error、stdin EPIPE 后 late close(0)、signal exit、四类 init failure（missing/invalid/duplicate/required_tool_missing）、malformed JSON、terminal session mismatch、missing/duplicate/error terminal、invalid/mismatched/non-completed CodingResult；每个 case 断言唯一 failure mapping、恰好一次 `run_failed`、零次 `run_completed`。
- `inc3-integration-r1-lifecycle-documentation`：`ROOM_PROTOCOL.md` transition table 与 `ARCHITECTURE.md` failure table 修正为 `CODING` 先于 process startup/MCP init，startup/init failure 经既有 `CODING → RUN_FAILED` 结束。

changed files：`src/room/room-service.ts`、`src/runner/claude-stream.ts`、`tests/room-service.test.ts`、`tests/claude-stream.test.ts`、`tests/claude-runner.test.ts`、`docs/documents/ROOM_PROTOCOL.md`、`docs/documents/ARCHITECTURE.md`、`docs/documents/DEVELOPMENT_LOG.md`、`docs/documents/MVP_PLAN.md`、`docs/documents/OPERATIONS.md`。未修改 accepted leaf（`claude-process.ts`/`claude-process.test.ts`/`claude-process-fake.ts`）、Git Observer、repository schema、state-machine transition table、package metadata、lockfile、tsconfig 或 dependency。未 commit、未 stage、未运行真实 Claude smoke。

### 2026-08-24 — Increment 3 Integration Review 1、方案确认与 Fix Task

- Codex 读取 baseline `63059189e97f7419238f5a3678513d4ca5e50f0d` 以来完整 staged/unstaged/untracked task-owned Diff，核对 Accepted Contract、Coding Result、源码、测试、候选文档与 Git 状态；Diff 为 13 个 modified、2 个 untracked、0 staged，全部位于 Integration scope。
- Review `review-increment-003-integration-codex-001` 确认四项 finding：`inc3-integration-r1-current-task-guard`（`FIX_PLAN_READY` 可启动旧 Task）、`inc3-integration-r1-partial-session-evidence`（`required_tool_missing` 丢失已观察 session）、`inc3-integration-r1-central-failure-matrix`（central public-path evidence 不完整）、`inc3-integration-r1-lifecycle-documentation`（协议/架构仍保留相反的 MCP-init 前置语义）。Decision：`changes_requested`。
- 定向复现证明：当前 Room 在 `FIX_PLAN_READY` 可创建 `task_id=task-1` 的旧 Run 并进入 `CODING`；含合法 `session_id=sess-observed` 但缺少 Room tool 的 init 返回 `required_tool_missing` 且 `sessionId=null`。
- Codex 独立验证 `npm run typecheck` 与 `npm test`（118/118）全部通过；现有 assertions 正确，但不能否定未覆盖 public path。文档检查 221 个 relative links 全部有效，无 merge marker 或越界 Markdown。
- 用户明确确认四项 finding 与最小方案。已创建 [Increment 3 Integration Fix Task 1](./INCREMENT_3_INTEGRATION_FIX_TASK_1.md)，阶段进入 `FIX_PLAN_READY`；确认不自动授权 Coding 派发、真实 Claude smoke 或 Git 写操作。
- Documentation impact audit：`documentation: updated`。同步 Accepted Fix Task、Review、当前阶段、文档中心、计划与运维状态；冲突的 `ROOM_PROTOCOL`/`ARCHITECTURE` candidate 语义由 Fix Coding 按 confirmed solution 修正，Runner 未提升为 main Current capability。

### 2026-08-24 — Increment 3 Integration Coding 完成（candidate）

按 [Increment 3 Integration Task Contract](./INCREMENT_3_INTEGRATION_TASK_CONTRACT.md) 在 `codex/inc3-integration` worktree（baseline_head `63059189e97f7419238f5a3678513d4ca5e50f0d`）交付 central Runner orchestration：

- `src/runner/claude-runner.ts`（新增）：单一 central operation `runClaude`，组合两个 accepted leaf（`claude-process.ts` + `claude-stream.ts`）与 `RoomService`/Git Observer/artifact。读取 persisted `confirmed_by_user=true` TaskContract、`establishCleanBaseline` 前置 gate、HEAD 与 expected baseline 一致校验、start/resume mode 校验（start 要求 `resumeSessionId=null`，resume 要求 non-empty exact id、绝不 `--continue`）、完整 Contract 经 stdin 送达、消费 stream、追加 progress Event、写入 `.agent-room/artifacts/<run-id>/stdout.jsonl` 与 `stderr.log`、收集 completion Git evidence，并以 `RunTerminalEvidence` 单一 settle 为 `completeRun`（`REVIEW_REQUIRED`）或 `failRun`（`RUN_FAILED`）。
- `src/protocol/errors.ts`：新增 `git_evidence_failed` 与 `artifact_write_failed`。
- `src/runner/claude-stream.ts`：`acceptLine` 对非终态 line 返回 `ClaudeProgressEvidence`；failure outcome 携带 nullable `sessionId` 与累积 `progress`。不改变 init/tool/terminal/CodingResult authority。
- `src/room/room-service.ts`：新增 `RunTerminalEvidence` 接口与 `appendRunProgress`（`run_progress` 非终态 Event，不改变状态）；`completeRun`/`failRun` 在同一 transaction 持久化 terminal evidence（`claude_session_id`、`process_exit_code`、`git_evidence`、`artifact_refs`）。
- failure mapping 优先级（单一 terminal settlement）：`claude_start_failed` > `claude_exit_failed` > `room_mcp_unavailable` > `coding_result_invalid` > `git_evidence_failed` > `artifact_write_failed`。
- 测试：`tests/claude-runner.test.ts`（新增，fake-process + temp-repo fixture 覆盖 start/resume、process/stream/Git/artifact evidence、全部六类 failure mapping 与单一 terminal transition）；`tests/claude-stream.test.ts`、`tests/room-service.test.ts` 新增 progress/evidence regression；`tests/scope.test.ts` 允许 `claude-runner.ts`。
- 未 commit、未 stage、未运行真实 Claude/付费 smoke；Git evidence 在 artifact 写入前收集，Runner 自写 artifact 不污染 evidence。

### 2026-08-24 — Increment 3 Integration Task Contract 批准

- 用户明确批准 [Increment 3 Integration Task Contract](./INCREMENT_3_INTEGRATION_TASK_CONTRACT.md)，其状态改为 `Accepted`、`confirmed_by_user=true`；项目阶段进入 `PLAN_READY`。
- 用户决定暂时人工派发。派发必须在 clean Integration worktree 中进行，且该 worktree 必须包含本次 Accepted Contract、main documentation baseline 与两个 exact accepted leaf commits，并记录组合后的实际 `baseline_head`。
- 本次确认不授权 Codex 提交当前文档、创建 branch/worktree、组合 leaf commits、执行 Claude Coding 派发、push 或清理；这些 Git/dispatch 动作仍未发生，Runner 也未提升为 Current capability。
- Documentation impact audit：`documentation: updated`。同步 Contract 状态、阶段、索引、计划与运维边界；Architecture、Room Protocol、ADR 和 runtime implementation 事实未改变。

### 2026-08-24 — Increment 3 Integration Draft Contract

- 用户要求继续后，Codex 依据已确认 Parallel Pilot boundary、两个 accepted leaf commits、当前 RoomService/Git Observer public API 与 protocol lifecycle 形成 [Increment 3 Integration Draft](./INCREMENT_3_INTEGRATION_TASK_CONTRACT.md)。
- Draft 的单一目标是交付 central Runner orchestration：clean baseline gate、完整 persisted Task prompt、start/resume claim、accepted process/stream leaf、progress Event、raw artifact、completion Git evidence、atomic terminal evidence 与单一 terminal transition。
- Draft 将已确认的 `CODING` startup/init clarification 具体化为 `ROOM_PROTOCOL 0.2-design`，不新增 Room state；同时把实际 Integration gap 列为待确认 scope：RoomService terminal evidence boundary、Interpreter progress/partial failure evidence seam，以及 `git_evidence_failed` / `artifact_write_failed` 两个机器可处理 error。
- Git 事实重新核对：上一轮 acceptance documents 已由 commit `320c730497b02ce7ae91e1dadc906fffe2a10a9f` 提交到 clean main；两个 leaf worktree 已移除，但 branch refs 与 accepted commits 仍存在且未进入 main ancestry。Integration baseline 必须在用户后续授权的 documentation commit、Integration worktree 创建与 exact leaf commit 组合后重新记录。
- 本次只创建 Draft 并同步 planning/state 文档；未提交、未创建 branch/worktree、未组合 commits、未派发 Coding、未运行真实 Claude 或测试。

### 2026-08-24 — Increment 3A/3B 接受、Leaf Commit 与 Fix 经验回收

- 用户明确接受 Increment 3A/3B Fix，并分别授权提交两个 leaf 的已 Review task-owned files；授权不包含 Integration、merge/cherry-pick、push、branch/worktree 清理或其它 Git 写操作。
- 3A 在 `codex/inc3-claude-process` 提交为 `86c77a7c68b953343d67da3857859b0dd6d6c09c`（`feat(runner): add Claude process transport`），实际仅包含 `src/runner/claude-process.ts`、`tests/claude-process.test.ts` 与 `tests/runner-fixtures/claude-process-fake.ts`；提交后 worktree clean。
- 3B 在 `codex/inc3-claude-stream` 提交为 `1062a7500f8bb3e22c7c3818ddcac2e9eb625efa`（`feat(runner): add Claude stream interpreter`），实际仅包含 `src/runner/claude-stream.ts`、`tests/claude-stream.test.ts` 与两个已 Review JSONL fixture；提交后 worktree clean。
- 提交前 staged diff 与 Review 2 path set 完全一致；实现输入自 Review 2 后未变化，因此未重复运行已经证明同一事实的 typecheck/测试，沿用 3A 聚焦 14/14、全量 71/71 与 3B 聚焦 24/24、全量 81/81 的独立验证证据。
- Fix 经验回收新增两类可复用规则：多 event process Promise 必须让 stdin/error/close 共享 first-settlement ownership，并用“failure 后出现表面成功事件”的 public-path regression 证明失败不会被改写；冻结 capability authority 时，TypeScript input、runtime lookup 与 success evidence 必须来自同一 module-owned constant，negative regression 必须证明普通 caller value 或 built-in 不能替代它。规则分别写入 Codex Review 与 Claude Coding 指南。
- Documentation impact audit：`documentation: updated`。仅同步用户接受、leaf commit、经验回收与 Integration 前置事实；Architecture、Room Protocol、ADR、dependency direction 和 `main` 的 current runtime capability 均未变化。

### 2026-08-24 — Increment 3A/3B Fix Review 2

- 自动 bootstrap result capture 失败后，用户人工恢复两个原 Claude session 并返回 Coding Result；两份结果均为 `completed`，无 deviation、unresolved 或 question。Codex 以用户返回结果作为导航，并以实时 Git、完整 task-owned Diff、源码、测试和独立命令作为 Review authority。
- `review-increment-003a-codex-002`：`ClaudeProcessInputError` 独立保留 command、完整 args、cwd 与 cause；stdin `error`、child `error` 与 `close` 共用 single-settlement boundary。直接 `EPIPE → close(0, null)` regression 证明 stdin failure 不再被普通 exit outcome 改写。完整 Diff 仅含 `src/runner/claude-process.ts`、`tests/claude-process.test.ts` 与最小 fake-process fixture；无 finding，Decision：`approved`。
- `review-increment-003b-codex-002`：`REQUIRED_ROOM_TOOL_NAME` 精确冻结为 `mcp__agent_room__room_ask_question`，同时拥有 literal input type、runtime init tools lookup 与 success evidence。built-in-only 与强制注入 `Read` 的两个 direct regression 均返回 `required_tool_missing`；JSONL fixture 未修改。完整 Diff 仅含本 leaf 原有四个 task-owned files；无 finding，Decision：`approved`。
- Codex 独立验证：3A 聚焦测试 14/14、`npm run typecheck`、全量测试 71/71；3B 聚焦测试 24/24、`npm run typecheck`、全量测试 81/81，全部通过。两边保持原 `HEAD` `97c47fed770fea675834538e2ca4550d37fdc548`、正确 branch、无 staged file 或 scope drift。
- Documentation impact audit：`documentation: updated`。仅同步 manual retry、Review 2、验证与当前阶段；Architecture、Room Protocol、ADR、dependency direction、public runtime capability 和 Integration boundary 均无变化，candidate 未提升为 Current。

### 2026-08-24 — Increment 3A/3B Fix 并行派发与 Result Validation Failure

- 用户明确授权并行派发两份 Accepted Fix Task。派发前核对共同 `baseline_head`、独立 branch/worktree、未 staged 状态、task-owned path set、原 Claude session 与本机 Claude Code `2.1.241`；两条 leaf 均通过。
- 受 sandbox Git ownership gate 影响的首轮启动在 Claude process 前失败且未修改代码；随后使用宿主执行权限并行恢复 session `082e2b70-0e35-440d-a9a4-71f1515e2660` 与 `b386f58f-4005-490e-8ee1-292b33cb2ed9`，两路 process 均 exit `0`。
- 两路 terminal stdout 行均无法通过 `JSON.parse`：3A 在 position 1892，3B 在 position 2041。artifact 中中文内容出现 mojibake，嵌套 `result` JSON 的 property quote escape 被吞掉；因此 stdout final result 不满足 bootstrap Coding Result transport，不能以 process exit 或模型自述替代。
- 两个 worktree 继续停留在原 branch 与原 `HEAD`，无 staged file；candidate 与 `.agent-room/artifacts/` 全部保留。当前按 `coding_result_invalid` 进入 `RUN_FAILED`，未执行 Codex Review、stage、module commit、Integration、push 或清理。
- 文档影响仅为 dispatch/result validation/current phase 事实；Architecture、Room Protocol、ADR、Accepted Fix scope 与 current runtime capability 不变。

### 2026-08-24 — Increment 3A/3B Review 1 方案确认与 Fix Task

- 用户明确确认 `review-increment-003a-codex-001` finding `inc3a-r1-stdin-write-failure` 及最小方案：stdin prompt delivery error 以独立 typed input/transport failure 向上拒绝，single-settlement guard 阻止后续 `close(0)` 改写失败，并增加 `EPIPE → close(0)` public-path regression。
- 用户明确确认 `review-increment-003b-codex-001` finding `inc3b-r1-required-tool-freeze` 及最小方案：用 single frozen constant 与 literal input type 固定 `mcp__agent_room__room_ask_question`，init lookup 和 success evidence 不再受任意 caller string 控制，并增加 built-in 不能替代 Room tool 的 regression。
- 已创建 [Increment 3A Fix Task 1](./INCREMENT_3A_FIX_TASK_1.md) 与 [Increment 3B Fix Task 1](./INCREMENT_3B_FIX_TASK_1.md)；两者均为 `review_fixes_only=true`、`confirmed_by_user=true`，保留原共同 baseline、独立 branch/worktree 与原 Claude session lineage。
- 当前阶段进入 `FIX_PLAN_READY / Increment 3A + Increment 3B`。本次确认不授权 Fix Coding 派发、真实付费 smoke、stage、module commit、Integration、push 或清理。
- 文档影响限于 Fix Contract、当前阶段、并行执行事实、文档索引与 candidate 运维视图；Architecture、Room Protocol、ADR、Accepted Implementation Contract 与 runtime capability 不变。

### 2026-08-24 — Increment 3A/3B Leaf Review 1

- Codex 分别收集两个 worktree 相对共同 `baseline_head` `97c47fed770fea675834538e2ca4550d37fdc548` 的完整 task-owned staged、unstaged 与 untracked Diff，并核对 Accepted Contract、Claude Coding Result、源码、测试、Git 状态和 module ownership；两边均只有 Contract scope 内的 untracked candidate files，无 staged/unstaged tracked change、commit 或 push。
- Review `review-increment-003a-codex-001` finding `inc3a-r1-stdin-write-failure`：`src/runner/claude-process.ts` 静默吞掉 child stdin error。最小 fault injection 证明 prompt write 返回 `EPIPE` 后 child `close(0, null)` 会被报告为普通 exit outcome，无法区分“完整 Task Contract 未送达”与成功 process fact，违反 Accepted Contract 的完整 stdin delivery 与 process failure boundary。Review Decision：`changes_requested`。
- Review `review-increment-003b-codex-001` finding `inc3b-r1-required-tool-freeze`：`ClaudeStreamInterpreterInput.requiredToolName` 接受任意 string，interpreter 直接以调用者值校验 init tools。最小复现移除 `mcp__agent_room__room_ask_question` 并传入 built-in `Read` 后仍返回 `ok: true`，违反 Accepted Contract 冻结 required Room tool authority 的要求。Review Decision：`changes_requested`。
- Codex 独立验证 Increment 3A：`npm run typecheck`、聚焦测试 13/13、全量测试 70/70；Increment 3B：`npm run typecheck`、聚焦测试 22/22、全量测试 79/79。既有测试无回归，但未覆盖上述两个 authority/failure boundary。
- 阶段进入 `REVIEW_DISCUSSION / Increment 3A + Increment 3B`。用户确认 finding 与最小方案前，不创建或派发 Fix Task；候选 leaf 不接受、不提交、不集成。Architecture、Room Protocol、Accepted Contract 和 Integration 计划不变，候选实现不提升为 Current capability。

### 2026-08-24 — Increment 3A/3B Task Contract 批准

- 用户明确批准 [Increment 3A Claude Process Transport](./INCREMENT_3A_TASK_CONTRACT.md) 与 [Increment 3B Claude Stream Interpreter](./INCREMENT_3B_TASK_CONTRACT.md) 两份完整 Task Contract；两者状态改为 `Accepted`，`confirmed_by_user=true`。
- 批准不改变已确认 module boundary：Leaf A 只拥有 process transport 与 line framing，Leaf B 只拥有 stream interpretation；公共 protocol、Room lifecycle、central Runner、Git wiring、package metadata 与 documentation 继续由后续 Integration Task 独占。
- 确认前 clean parent 为 `b35f7a2284c90285e897789aa2ac9e26e596c4ac`。由于 Accepted Contract 本身必须先进入 Git，最终共同 `baseline_head` 不预写为 parent hash，而在 documentation baseline commit 完成后按实际 `main` HEAD 记录。
- 用户随后单独授权本 Accepted Contract documentation baseline commit；仍未授权 branch/worktree 创建、Claude Coding 派发、真实付费 smoke、实现提交、push 或清理。当前阶段为 `PLAN_READY / Increment 3A + Increment 3B`。

### 2026-08-24 — Increment 3 Scope Scaffold 集成到 main

- 用户明确授权把 accepted Scaffold source commit `eb3637b642aaa88e1faab51a570c6fea688c3cf9` 集成并提交到 `main`；授权不包含 push 或 source branch/worktree 清理。
- `main` 在共同 ancestor `1416de2429e2124192442e8b6e7db3645db805c6` 后已有文档集中迁移 commit `71bb2db803a8dc96bb1b172996ef5f8ad3b8e96f`，因此采用 `cherry-pick --no-commit` 组合 accepted tree，并在提交前把 Fix Contract 从旧 `docs/` 路径归位到 `docs/documents/`；测试实现保持 accepted source commit 内容。
- 集成验证通过：聚焦 Scope test 1/1、`npm run typecheck`、`npm test` 57/57；文档目录、索引、相对链接、merge marker 与 staged scope 检查通过后才提交。
- 集成不新增 Runner、MCP、CLI、runtime interface、Room state、protocol field 或 dependency；Architecture 与 ADR 无变化。当前进入 `WAITING_FOR_USER_CONFIRMATION / Increment 3A/3B Task Contracts`。

### 2026-08-24 — Codex 全项目文档角色、Skill 门禁与文档集中迁移

- 用户明确将 Codex 的“运维文档编写者及维护者”扩展为全项目文档编写者及维护者；Codex 编写、补全、迁移、Review 或维护任何项目文档时 MUST 调用 `backend-doc-authoring` skill，并在每次 Review 后执行 documentation impact audit。
- 全部人类可查看项目文档已集中迁入 `docs/documents/`，新增 [项目文档中心](./README.md) 统一列出用途、状态、Owner 与依赖；根目录仅保留 `AGENTS.md`、`CLAUDE.md`、`PROJECT_RULES.md` 三个 agent/tooling 控制入口，旧路径不保留副本。
- 原运维专用指南由 [Codex 项目文档编写与维护指南](./agent-guides/CODEX_DOCUMENTATION_AUTHORING.md) 替代；运维手册继续作为全项目文档集中的人工操作与故障处置权威视图。
- 已同步角色入口、Claude candidate 文档边界、Documentation Map、细分指南路由和 Review Verification Summary 字段 `documentation: updated | no_change | blocked`。
- 该变更只调整文档角色、目录和维护工作流，不修改 business code、test、implementation config、Room state、Event、protocol 或 runtime，因此不新增 ADR。

### 2026-08-24 — Codex 运维文档角色与 Review 后维护门禁（Superseded）

- 用户明确为 Codex 增加“运维文档编写者及维护者”角色，要求每次 Review 后维护人工可查看的接口、架构与结构说明。
- 新建 `docs/documents/OPERATIONS.md`，按 accepted/current 与 candidate/integration 状态分离，记录当前 public application API、Git Observer、组件结构、可用命令、状态/制品位置和故障边界；明确 Runner、MCP、CLI 与 service entry 尚未实现，不发明启动命令。
- 当时新建的运维专用指南现已由 `docs/documents/agent-guides/CODEX_DOCUMENTATION_AUTHORING.md` 替代；Review 后运维影响审计继续由全项目文档门禁覆盖。
- 该角色是 Codex 文档工作流，不修改 Room state、Event、protocol、runtime、业务代码或测试，因此不新增 ADR。

### 2026-08-24 — Increment 3 Scope Scaffold Review、Fix、接受与独立提交

- Scope Scaffold 在 `codex/increment-003-scope-scaffold` 从 baseline `1416de2429e2124192442e8b6e7db3645db805c6` 执行；Implementation 只修改 `tests/scope.test.ts`。
- Review 1 复现 allowed filename 对应 directory 被错误接受；用户确认最小 `Dirent.isFile()` 与 literal filename 联合校验方案，并通过恢复原 Claude session 完成 Fix。
- Review 2 无 finding；Codex 独立 8-scenario matrix、`npm run typecheck` 与 `npm test`（57/57）全部通过。用户明确接受并授权提交。
- branch commit 为 `eb3637b642aaa88e1faab51a570c6fea688c3cf9`，提交时的实际 files 为 `tests/scope.test.ts` 与 `docs/INCREMENT_3_SCOPE_SCAFFOLD_FIX_TASK_1.md`；当时未 push、尚未集成到 `main`，后续集成事实见上方记录。
- 运维影响：Scope regression 与开发 branch baseline 变化，不新增 runtime interface、service command、Runner、MCP 或 CLI；已在 `docs/documents/OPERATIONS.md` 标明 accepted branch 与 main integration pending。

### 2026-08-24 — Increment 2 Fix 1 经验回收与流程自动化

- 按用户要求从 `review-increment-002-codex-001`、Accepted Fix Task、实际 Diff、两个 public-path corrupt-index regression 与二次 Review 提炼可复用经验，而不是复制单次历史描述。
- Codex Review 经验写入 `CODEX_REVIEW_AND_PLANNING.md`：observer 必须区分 success-empty、success-nonempty 与 failure；process exit fact 和 domain error mapping 属于不同 boundary；外部依赖 failure injection 必须直达每个 public operation；typecheck 不能证明 runtime callback context 来源正确。
- Claude Coding 经验写入 `CLAUDE_CODING_AND_FIX.md`：process failure 不得降级为 empty evidence；异步 `execFile` 从 callback 第三个参数读取 stderr；用“合法 HEAD + 损坏 index”构造最小 Git failure fixture；fixture cleanup 删除实际 owner path。
- `AGENTS.md`、`PROJECT_RULES.md` 与指南路由新增硬 Trigger：每个 Fix Task 二次 Review approved 且获用户明确接受后，Codex 在派发下一 Implementation/Fix Task 前执行经验回收；已有规则已覆盖或无新增经验时如实记录，不制造规则。
- 该自动化是 Codex 文档工作流，不修改 Room state、Event、protocol、Runner、业务代码或 Architecture，因此不新增 ADR；当前项目阶段保持 `PLAN_READY / Increment 3 Scope Scaffold`。

### 2026-08-24 — Increment 3 并行试点与 Scope Scaffold Contract 批准

- 用户确认 Increment 3 先试点两个独立 leaf module：`Claude Process Transport` 与 `Claude Stream Interpreter`；两者不交叉写入、独立 Review/接受/提交，随后由串行 Integration Task 组合。
- 用户确认 `CODING` 覆盖 Runner claim 后的 process startup 与 MCP initialization；startup/init failure 继续通过既有 `CODING → RUN_FAILED` 结束，不新增 Room state 或 transition。正式 protocol version、ADR 与实现同步留给 Integration Task。
- 经用户授权完成一次受限真实 Claude Code `2.1.241` smoke：禁用普通 tools、预算上限 `$0.25`，实际费用 `$0.06222`，exit code `0`，未修改项目文件；确认 `--verbose`、CLI JSON Schema normalization、hook/init/result/session 与 `structured_output` shape。
- 发现现有 `tests/scope.test.ts` 明确拒绝 `src/runner`，会使两个 leaf branch 的 `npm test` 必然失败；共享 regression 不能由两个 worker 并行修改，因此增加串行 Scope Scaffold 前置任务。
- 用户已批准 [Scope Scaffold Task Contract](./INCREMENT_3_SCOPE_SCAFFOLD_TASK_CONTRACT.md)，其唯一实现 scope 为 `tests/scope.test.ts`，不创建或实现 Runner；项目阶段进入 `PLAN_READY / Increment 3 Scope Scaffold`。
- 用户已授权当前 7 个 planning/state 文档的 documentation baseline commit 与随后的 Scope Scaffold bootstrap dispatch；未授权 branch/worktree、实现提交或 push，Leaf A/B Contract 保持 Draft。

### 2026-08-24 — Increment 2 接受与提交授权

- 用户明确接受 Increment 2，并授权将本次已 Review 的 task-owned 代码、测试、必要配置、Fix Contract 与实现状态文档提交到当前 `main`。
- 授权 scope 为 `src/git/git-process.ts`、`src/git/git-observer.ts`、`tests/git-observer.test.ts`、`tests/scope.test.ts`、`package.json`、`docs/INCREMENT_2_FIX_TASK_1.md`、`PROJECT_RULES.md` 与 `DEVELOPMENT_LOG.md`。
- 本次授权不包含 push、branch/worktree 操作、merge/rebase、历史改写或下一 Increment 文件。

### 2026-08-24 — Increment 2 Review 2

- Codex 读取原始 `baseline_head` `6e7e5eb8869b2947d7738f1f23b6eb7fdde64742` 以来的完整 task-owned staged/unstaged/untracked Diff，并核对 Fix Coding Result、Accepted Contract、Git 状态、源码、测试与实现文档；未发现新的 finding。
- `inc2-r1-evidence-exit-128` 已闭环：process boundary 对任何非零退出抛出 `GitCommandError`，repository/HEAD 的 exit 128 仅在对应 semantic boundary 映射为 ProtocolError，两个 public evidence operation 的 corrupt-index regression 直接证明观察失败不会返回 clean/empty evidence。
- `inc2-r1-git-error-stderr` 已闭环：`execFile` callback 第三个参数的 stderr 被保留到 `GitCommandError`；测试同时断言 command、args、cwd、exitCode 与非空 stderr。
- `inc2-r1-temp-fixture-cleanup` 已闭环：non-existent target 测试在 `finally` 删除实际创建的 parent fixture。
- Codex 独立运行 `node --test "tests/git-observer.test.ts"`（11/11）、`npm run typecheck` 与 `npm test`（57/57），全部通过；scope/dependency baseline、只读 Git command set、Increment 1 的 46 项测试均无回归。
- Review Decision：`approved`。阶段进入 `REVIEW_DISCUSSION / Increment 2`，等待用户明确接受；未获接受与 commit 授权前不提交。

### 2026-08-24 — Increment 2 Fix 1: Git Failure Semantics

按 [Increment 2 Fix Task 1](./INCREMENT_2_FIX_TASK_1.md) 修复 `review-increment-002-codex-001` 的 3 项 confirmed findings：

- `inc2-r1-evidence-exit-128`：`runGit` 不再把 exit 128 分类为 `missing`，而是对任何非零退出或进程启动失败以 `GitCommandError` 携带 command、args、cwd、exitCode 与 stderr 向上抛出；`resolveWorktreeRoot`/`resolveBaselineHead` 在各自 semantic boundary 捕获 `GitCommandError` 且 `exitCode === 128` 时映射为 `git_repository_missing`/`git_head_missing`，其余失败继续向上抛。`collectEvidence` 不再捕获或降级任何 diff/ls-files 失败，因此 `establishCleanBaseline`/`collectCompletionEvidence` 在 evidence command fatal failure 时都拒绝，不再返回 clean/empty evidence。
- `inc2-r1-git-error-stderr`：`runGit` 从异步 `execFile` callback 第三个参数读取 stderr（Buffer/string）并传入 `GitCommandError`，不再从 error object 假设 `.stderr` 属性存在。
- `inc2-r1-temp-fixture-cleanup`：non-existent target 测试显式保留 `makeFixture` 返回的 parent path，并在 `finally` 中删除，成功与 assertion failure 都不遗留 temporary directory。

changed files：`src/git/git-process.ts`、`src/git/git-observer.ts`、`tests/git-observer.test.ts`、`DEVELOPMENT_LOG.md`。保持只读命令集（rev-parse/diff/ls-files）与 `GitEvidence`/`CleanBaseline`/两个 public operation 的 external shape 不变，未新增 dependency、protocol error、状态或 mutation command。

### 2026-08-24 — Increment 2 Review 1 与 Fix 1 确认

- Codex 审查完整 task-owned Diff，`npm run typecheck` 通过，`npm test` 55 项全部通过；正常 repository、HEAD、clean/dirty worktree、三类 path evidence、scope 与 dependency baseline 实现正确。
- Review `review-increment-002-codex-001` 通过损坏 temporary repository index 的 fault injection 复现：evidence command exit 128 被 `runGit` 分类为 `missing`，随后 null stdout 被解释为空 array，使 `establishCleanBaseline` 在观察失败时错误返回 clean baseline。
- Review 同时确认异步 `execFile` 的 stderr 来自 callback 第三个参数，当前 `GitCommandError.stderr` 实际为空；non-existent target 测试只删除不存在的 child，稳定遗留 `makeFixture` 创建的 parent temporary directory。
- 用户确认三项 finding 与最小方向：process boundary 对非零退出抛出携带完整 context/stderr 的 `GitCommandError`，仅由 repository/HEAD semantic boundary 映射预期 ProtocolError；两个 public evidence operation 直接覆盖 fatal failure；测试删除实际创建的 parent fixture。
- 已创建 [Increment 2 Fix Task 1](./INCREMENT_2_FIX_TASK_1.md)，Fix lineage 保留原始 `baseline_head` `6e7e5eb8869b2947d7738f1f23b6eb7fdde64742`，阶段进入 `FIX_PLAN_READY`。

### 2026-08-24 — Increment 2: Git Preconditions and Evidence

按 [Increment 2 Task Contract](./INCREMENT_2_TASK_CONTRACT.md) 在独立 `src/git` infrastructure module 实现只读 Git Observer：

- `src/git/git-process.ts`：唯一 Git 调用入口，`node:child_process.execFile('git', [command, ...args])` 直接传 argument array（无 shell）、`encoding: 'buffer'` 保留 NUL 分隔输出；exit 128 分类为 `missing`，其余 process 失败以 `GitCommandError` 携带 command context（command、args、cwd、exit code、stderr）抛出。
- `src/git/git-observer.ts`：`GitEvidence`（staged/unstaged/untracked 去重、稳定排序的 root-relative path）与 `establishCleanBaseline` / `collectCompletionEvidence` 两个 operation。
- `establishCleanBaseline`：目标非目录/非 worktree/裸仓库 → `git_repository_missing`；`rev-parse --verify --end-of-options HEAD^{commit}` 无法解析 → `git_head_missing`；三类 evidence 任一非空 → `worktree_not_clean`；全空返回 repository root、完整 `baselineHead` 与 empty evidence。
- `collectCompletionEvidence`：不要求 worktree clean，从解析出的 owning worktree root 执行，覆盖整个 worktree 并返回 root-relative path。
- 三类 evidence 用 NUL-delimited output：staged `git diff --cached --name-only -z`、unstaged `git diff --name-only -z`、untracked `git ls-files --others --exclude-standard --full-name -z`；不解析 human-readable status。
- product code 只含 `rev-parse`/`diff`/`ls-files` 只读命令；fixture 的 `init/config/add/commit` 写操作只存在于测试代码。
- `package.json` description 改为项目级描述（`Local Agent Room — single-user MVP`），不改 dependency/script baseline。
- `tests/scope.test.ts` 改为拒绝 `src/runner`、`src/mcp`、`src/cli` 并允许 `src/git`，同时证明 dependency baseline 未漂移。

Git command boundary：`runGit` 是唯一 process 边界，所有 command 从解析出的 repository root 执行；`resolveWorktreeRoot` 先用 `fs.statSync` 区分“路径不存在”与“git 不可用”，再按 git exit 128 分类为非 worktree，其余失败带 command context 向上抛出。

### 2026-08-24 — Increment 2 Task Contract 批准

- 用户明确批准 [Increment 2 Task Contract](./INCREMENT_2_TASK_CONTRACT.md)，阶段进入 `PLAN_READY / Increment 2`。
- 已确认最小方案：独立 `src/git` Git Observer 使用 Node.js `child_process.execFile` 直接调用 Git CLI 只读命令；以完整 `HEAD` commit object ID 作为 baseline，并以 NUL-delimited output 收集 root-relative staged、unstaged、untracked path evidence。
- 本增量不接入 Runner、MCP 或 Room state，不修改 SQLite/schema/protocol error set，不增加 dependency，不生成 patch、hash、mirror 或 Git mutation path。
- 派发前仍需把 Accepted Contract 与现有协作文档形成 clean documentation baseline，并重新记录实际 `baseline_head`；当前批准不包含 commit、push 或 Claude Coding 派发授权。

### 2026-08-24 — Increment 1 Fix 3 Review 与接受

- Codex 复审完整 task-owned Diff，无 finding，Review Decision 为 `approved`。
- 聚焦幂等 regression 1 项通过，`npm run typecheck` 通过，`npm test` 46 项全部通过。
- 用户明确接受 Increment 1，并授权将已 Review 的代码、测试、必要配置、Fix Contract 与实现状态文档提交到当前 `main`；该授权不包含 push 或无关并发文档。

### 2026-08-24 — Fix 2/3 经验结构化与角色入口精简

- 按项目职责将 Fix 2/3 经验拆分：Codex 侧覆盖 lifecycle Review、public-path 证据、current entity 权威事实、guard 与 idempotency 组合审查、最小解决方案和 Task Contract 场景；Claude Code 侧覆盖最小实现、transaction 内 guard/idempotency 顺序、直接 public-path regression、durable-state assertion 与独立 Oracle。
- 新建的细分指南当前集中在 `docs/documents/agent-guides/`；`AGENTS.md` 与 `CLAUDE.md` 通过明确 Trigger 强制索引，形成入口 + 按需完整读取的渐进式结构。
- 清除 `AGENTS.md` 与 `CLAUDE.md` 中未解析的 merge marker，保留冲突内容中的有效派发、并行、注释语言和 Git 权限规则，并将细节归入对应指南。
- 同步 `PROJECT_RULES.md` Documentation Map 与规则变更记录；本次只修改角色/协作文档，不改变业务代码、测试、产品架构、Room protocol 或当前 `REVIEW_REQUIRED` 阶段。
- 文档结构验证：`AGENTS.md` 为 9,848 bytes / 163 行，`CLAUDE.md` 为 8,875 bytes / 137 行；两者均显著低于 32 KiB 入口预算。八份相关入口/指南无 merge marker，全部 relative Markdown link 可解析。

### 2026-08-24 — Increment 1 Review 3 与 Fix 3 确认

- Codex 再次 Review 确认 Fix 2 的 typecheck 与 45 项测试通过，stale succeeded Run guard 与 `resumeRun` public-path regression 已正确落地。
- 受支持的两轮 Run/Fix 最小复现同时证明：`review-1` 已成功持久化、`run-2` 完成后，同 ID/同 content 重试 `review-1` 会因 current Run guard 位于 `insertReview` 幂等判断之前而返回 `validation_failed`，违反 Increment 1 已批准的 entity create idempotency contract。
- 用户确认最小方案：先复用 `insertReview` 区分既有同内容 Review、ID 冲突与新 Review，只对新 Review 执行 current Run guard；新 stale Review 继续由同一 transaction rollback。不新增 schema、pointer、migration 或通用 abstraction。
- 已创建 [Increment 1 Fix Task 3](./INCREMENT_1_FIX_TASK_3.md)，阶段进入 `FIX_PLAN_READY`。

### 2026-08-24 — Increment 1 Fix 3: Submit-Review Idempotency Order

按 [Increment 1 Fix Task 3](./INCREMENT_1_FIX_TASK_3.md) 修复 `review-increment-001-codex-003` 的 1 项 confirmed finding：

- `inc1-r3-submit-review-idempotency`：将 `submitReview` 内 `insertReview` 的幂等判断移到 transaction 开头，先区分既有同内容 Review（直接返回 `created=false` 且不新增 Event）、同 ID/异 content（`id_conflict`）与新 Review；只有新 Review 才执行 task/room、succeeded、completed 与 current Run guard。新 stale Review 的 guard 失败仍由同一 transaction rollback，不留下 partial write。

current Run 权威事实继续来自该 Room sequence 最大的 `run_completed` Event；未新增 pointer、schema、migration 或通用 abstraction。

### 2026-08-24 — Increment 1 Fix 2: Submit-Review Current-Run Guard and resumeRun Coverage

按 [Increment 1 Fix Task 2](./INCREMENT_1_FIX_TASK_2.md) 修复 `review-increment-001-codex-002` 的 2 项 confirmed findings：

- `inc1-r2-submit-review-current-run`：`submitReview` 在写入 Review 前校验 `review.run_id` 等于该 Room sequence 最大的 `run_completed` Event 指向的 Run（复用 `latestEventEntityId`），不新增 active_run_id 或其他持久化 pointer。
- `inc1-r2-resume-run-test-coverage`：新增 NEEDS_DECISION 状态下直接调用 `resumeRun` 的 public-path regression，验证 terminal 与 `needs_decision` 初始 status 被拒绝且不产生 partial write；将原有测试重命名为仅描述 `startRun`，消除测试名与覆盖范围不符。

新增 guard 的失败路径仍在同一 transaction 内 rollback，不产生 Review、Run、Room 或 Event partial write。

### 2026-08-23 — Increment 1 Review 2 与 Fix 2 确认

- Codex 二次 Review 确认 Fix 1 的 typecheck 与 43 项测试通过，Fix finding membership、UTC timestamp 和独立 transition oracle 已正确落地。
- 受支持的两轮 Run/Fix 复现证明：run-2 完成后，旧的 succeeded run-1 仍可通过 `submitReview` 创建 current Review；`inc1-r1-active-entity` 尚未完全闭环。
- Review 同时确认 `startRun/resumeRun` 非法 status 测试实际只调用 `startRun`；当前 `resumeRun` 实现因共享 validator 行为正确，但缺少 Task Contract 要求的直接 public-path 验收证据。
- 用户确认最小方案：复用最近一次 `run_completed` Event 校验 `submitReview` 的 current Run，并补充 `resumeRun` 聚焦测试；不新增 pointer、schema、migration 或通用 active-entity abstraction。
- 已创建 [Increment 1 Fix Task 2](./INCREMENT_1_FIX_TASK_2.md)，阶段进入 `FIX_PLAN_READY`。

### 2026-08-23 — Increment 1: Protocol and State Core

按 [Increment 1 Task Contract](./INCREMENT_1_TASK_CONTRACT.md) 完成 MVP 第一个增量，实现可持久化、可恢复、atomic 执行或拒绝 state transition 的最小 domain core。

实现内容：

- 单 package npm 项目（ESM、TypeScript strict、无 formatter/lint/build framework）。
- `src/protocol`：RoomState、Actor、TaskContract（含 Fix 变体 superRefine 校验）、Run、CodingResult、Review、Question、Event 与 protocol error 的 zod runtime schema 及对应 TS type。
- `src/room/repository.ts`：`node:sqlite` DatabaseSync 的 rooms/tasks/runs/reviews/questions/events 最小 schema 与 CRUD；无 ORM。repository 不暴露绕过 transition 校验的 rooms.state 修改原语。
- `src/room/state-machine.ts`：ROOM_PROTOCOL.md 第 4 节 14 条合法 transition 表与纯校验（未列 pair → `invalid_transition`，错误 actor → `actor_not_allowed`）。
- `src/room/room-service.ts`：application service，在单个 SQLite transaction 内协调 entity write、state change 与 Event append；idempotency（同 id 同 content 返回既有 entity 不重复写 Event，同 id 异 content → `id_conflict`）；Event sequence 按 Room 从 1 严格递增。
- 依赖 baseline 落地：`zod@4.4.3`（runtime）、`typescript@7.0.2` + `@types/node@24.13.3`（dev）。

### 2026-08-23 — Increment 1 Fix 1: Stale Entity and Protocol Validation Guards

按 [Increment 1 Fix Task 1](./INCREMENT_1_FIX_TASK_1.md) 修复 `review-increment-001-codex-001` 的 4 项 confirmed findings，阻止 stale entity 推进 Room state 并补齐协议校验：

- `inc1-r1-active-entity`：用现有 Room state、Run status 与 per-Room Event sequence 判定当前 Run/Review，不新增 active_* pointer column。`startRun`/`resumeRun` 拒绝 terminal 或 `needs_decision` Run；`completeRun`/`failRun`/`askQuestion` 只接受 `running` Run；`acceptReview` 与 Fix Task 只引用最近一次 `review_submitted` Event 指向的 Review。
- `inc1-r1-fix-finding-membership`：`validateFixReferences` 校验每个 `confirmed_findings.finding_id` 都存在于 referenced current Review.findings。
- `inc1-r1-timestamp-validation`：所有 protocol timestamp 复用严格 `z.iso.datetime()` validator，拒绝非 ISO 8601、非 UTC offset 与无效日期；内部 `now()` 继续用 `Date.toISOString()`。
- `inc1-r1-transition-test-oracle`：`state-machine.test.ts` 改为测试侧独立声明 14 条 transition 与 initiator，不再用实现表生成期望值。

每个新增 guard 的失败路径都在同一 transaction 内 rollback，不产生 partial write 或 Event。

### 2026-08-23 — Architecture Review 与文档基线

- 根据当前 Codex 与 Claude Code capability 审查了初始 Agent Room 方案。
- 用户接受 MVP 使用 explicit Codex pull 的 notification model。
- 建立 Git、SQLite、Runner、Codex App 与 VS Code 的状态所有权。
- 用 Task-lineage session scope 替代 Room-wide Claude session scope。
- 把 process completion 与 Room transition ownership 交给 Runner。
- 定义当前 State Machine、Task/Run/Review/Question entity 和六个 MCP tool。
- 创建 MVP increment plan 和已接受的 architecture ADR。
- 将共享文档语言规范固化为“简体中文叙述，代码、标识符、命令、Schema 字段和技术专名保持 English”，并统一本轮创建的全部项目文档。

已创建文档：

- [PROJECT_RULES.md](../../PROJECT_RULES.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [ROOM_PROTOCOL.md](./ROOM_PROTOCOL.md)
- [MVP_PLAN.md](./MVP_PLAN.md)
- [ADR/0001-local-room-and-state-ownership.md](./ADR/0001-local-room-and-state-ownership.md)
- [ADR/0002-agent-integration-lifecycle.md](./ADR/0002-agent-integration-lifecycle.md)

## 当前事实

- Increment 1 已完成：`src/protocol`、`src/room` 与 `tests/` 已就绪；Git、MCP、process 等外部事实未在本增量实现，由 `tests/scope.test.ts` 负向断言证明。
- Increment 1 dependency baseline 已选择并落地：Node.js 24、npm 11、TypeScript 7、`@types/node` 24、Zod 4、内建 `node:sqlite` 与 `node:test`。
- MCP SDK 与 Claude Runner flags 留待其所属增量（Increment 3/4）验证，不属于 Increment 1。
- 用户已批准在 Room MCP 建成前使用受限 `claude -p` bootstrap transport；Increment 4 被接受后该路径终止。
- 用户已授权初始化 Git 并创建首个 documentation baseline commit；该授权不包含后续代码 commit、push 或历史改写。

## 验证

### 2026-08-26 — Increment 5 Review 1 独立验证

- `npm run typecheck`：通过。
- 聚焦 suite：RoomService/Runner 81/81、Git Observer/MCP 44/44、Scope 1/1 通过；但既有 tests 未覆盖 Question 后可识别非终态 progress，并把 answer 后 finalization retry 的错误拒绝写成期望。
- `npm test`：205/206；dispatch baseline mismatch regression 在 temporary commit hash 以 `0` 结尾时未形成 mismatch，进入默认真实 Claude process path并在约 60.6 秒后以 “Missing expected rejection” 失败。相同输入不重复运行，等待 Fix Task 1 先隔离 process boundary。
- 两个 direct RoomService probe 分别复现 Question 后 running-only progress rejection 与 answer 后 same-payload finalization retry rejection。

### 2026-08-26 — Increment 5 Coding Result 报告

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/room-service.test.ts" "tests/claude-runner.test.ts"`：81/81 通过，覆盖 `finalizeNeedsDecision` 持久化/幂等/冲突/reject-after-answered、answer-before-pause gate、start/resume wrong-mode guard、`getContinuationContext` 推导/拒绝，以及 decision/fix continuation、answer_changes_contract 拒绝、lineage `HEAD` drift 与 needs-decision pause settlement 的 fake-process matrix。
- `node --test "tests/git-observer.test.ts" "tests/room-mcp.test.ts"`：44/44 通过，覆盖 `observeContinuation` dirty-allowed/subdirectory/fatal/non-repo/unborn HEAD 与 pause-finalized MCP gate、fix flow `resumeRun`。
- `node --test "tests/scope.test.ts"`：1/1 通过，Scope boundary 与 dependency baseline 不变。
- `npm test`（`node --test`）：206/206 通过，无回归。

### 2026-08-25 — Increment 4 Fix Task 3 Review 4

- `npm run typecheck`：通过。
- `node --test "tests/room-mcp.test.ts"`：27/27 通过，包含 stale succeeded Run / wrong-current `room_submit_review` MCP direct regression。
- `npm test`：186/186 通过。

### 2026-08-25 — Increment 4 Fix Task 2 Review 3

- `npm run typecheck`：通过。
- `node --test "tests/room-mcp.test.ts"`：26/26 通过。
- `node --test "tests/room-state-snapshot.test.ts" "tests/room-service.test.ts" "tests/git-observer.test.ts" "tests/status-cli.test.ts" "tests/room-serve.test.ts" "tests/scope.test.ts"`：69/69 通过。
- `npm test`：185/185 通过；MCP suite 未包含 stale succeeded Run / wrong-current `room_submit_review` direct regression，因此绿灯不闭合该验收项。

### 2026-08-25 — Increment 4 Fix Review 2

- `npm run typecheck`：通过。
- `node --test "tests/room-mcp.test.ts" "tests/status-cli.test.ts" "tests/room-serve.test.ts"`：34/34 通过。
- `npm test`：180/180 通过。
- `npm ls --depth=0`：direct dependency 精确为 `@modelcontextprotocol/sdk@1.30.0`、`zod@4.4.3`、`@types/express@5.0.6`、`@types/node@24.13.3`、`typescript@7.0.2`。
- 代码/测试审查：上述绿灯没有构造 cleanup abort/internal-failure，也没有完整断言 MCP failure 后 Event/cursor 与非 Task create retry/conflict，因此不满足 Accepted Fix Task 的 direct public-path evidence。

### 2026-08-25 — Increment 4 Fix Task 1

- `npm run typecheck`（`tsc --noEmit`）：无错误；`tests/room-mcp.test.ts` 的 SDK result boundary 经 `resultText` 类型收窄，不含 any/ts-ignore/skipLibCheck。
- `node --test "tests/room-mcp.test.ts" "tests/status-cli.test.ts" "tests/room-serve.test.ts"`：34 个测试全部通过。新增 raw HTTP Content-Type（initialize/tools-list/tools-call 为 `application/json` 且不含 `text/event-stream`）、idempotent cleanup 恰好一次、missing repository/HEAD、invalid schema、stale submit_review/answer_question/ask_question、blocking accept_review、file-backed restart persistence；Status CLI 既存空/损坏 database 回归；room:serve invalid project/port/corrupt db/occupied port/valid listen 回归。
- `npm test`（`node --test`）：180 个测试全部通过，无回归。

### 2026-08-24 — Increment 3 Integration

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/claude-runner.test.ts" "tests/room-service.test.ts" "tests/claude-stream.test.ts"`：聚焦 76 个测试全部通过，覆盖 start/resume lifecycle、process/stream/Git/artifact evidence、六类 failure mapping、单一 terminal transition 与 Room atomic evidence 持久化。
- `node --test "tests/scope.test.ts"`：1 项通过，确认 central runner exact file allowance 与 MCP/CLI/额外 module 禁止边界。
- `npm test`（`node --test`）：118 个测试全部通过，无回归。

### 2026-08-24 — Increment 3 Integration Fix 1

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/room-service.test.ts" "tests/claude-stream.test.ts" "tests/claude-runner.test.ts"`：聚焦 96 个测试全部通过，新增 stale current Task guard（start/resume/rollback/retry）、required-tool partial session evidence 与 central failure matrix（async error/EPIPE/signal/init/malformed/session/terminal/CodingResult）regression。
- `node --test "tests/scope.test.ts"`：1 项通过，central runner exact file allowance 边界不变。
- `npm test`（`node --test`）：139 个测试全部通过，无回归。

### 2026-08-23 — Increment 1

- `npm ci`：从 package-lock.json 重建 dependency tree，5 packages、0 vulnerabilities。
- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `npm test`（`node --test`）：33 个测试全部通过。
  - protocol schema 对每类 entity 的有效 fixture 与代表性无效 fixture（缺必填、非法 enum、非法 Fix shape、`confirmed_by_user=false`、非正 Event sequence）。
  - 14 条合法 transition 各自的正向测试 + 错误 actor 反向测试；exhaustive 11×11 transition matrix 证明所有未列 state pair 返回 `invalid_transition`。
  - 失败 create/transition 不产生 entity/state/Event partial write。
  - 同 id 同 content 幂等（不重复 Event）、同 id 异 content → `id_conflict`。
  - Event sequence 按 Room 从 1 递增、多 Room 相互独立。
  - database close/reopen 恢复 state、entity 与 event cursor。
  - 完整 Discussion → Plan → Coding → Review → Fix → Coding → Review → Accepted 循环。

### 2026-08-23 — Increment 1 Fix 1

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/room-service.test.ts" "tests/protocol.test.ts" "tests/state-machine.test.ts"`：42 个测试全部通过。
- `npm test`（`node --test`）：43 个测试全部通过（含 `scope.test.ts`）。
  - 新增 timestamp regression（合法 UTC ISO 8601 被接受；非 ISO 8601、非 UTC offset、无效日期被拒绝）。
  - 新增 stale Run / stale Review / phantom finding / 非 completed CodingResult / 非法 Run status 的聚焦 regression tests。
  - `state-machine.test.ts` 独立 oracle 与 ROOM_PROTOCOL.md 的 14 条规则一致，并验证未列 pair 与错误 actor。

### 2026-08-24 — Increment 1 Fix 2

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/room-service.test.ts"`：27 个测试全部通过。
- `npm test`（`node --test`）：45 个测试全部通过（含 `scope.test.ts`）。
  - 新增 stale succeeded Run（引用旧 run-1 被拒绝、引用当前 run-2 成功）与 resumeRun 非法初始 status 的聚焦 regression tests。
  - 原有 43 项测试继续通过，无回归。

### 2026-08-24 — Increment 1 Fix 3

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/room-service.test.ts"`：28 个测试全部通过。
- `npm test`（`node --test`）：46 个测试全部通过（含 `scope.test.ts`）。
  - 新增跨后续 Run 的 Review 幂等重试 regression（同 ID/同 content 返回既有 review、同 ID/异 content → `id_conflict`、新 review_id 引用旧 run-1 仍被拒、引用当前 run-2 成功）。
  - 原有 45 项测试继续通过，无回归。

### 2026-08-24 — Increment 2

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/git-observer.test.ts"`：9 个测试全部通过。
  - 非 repository 与不存在路径 → `git_repository_missing`；无 commit worktree → `git_head_missing`（HEAD 校验先于 clean gate）。
  - clean repo 返回与独立 `git rev-parse HEAD` 相同的 `baselineHead`、正确 repository root 与三个 empty array。
  - staged-only、unstaged-only、untracked-only 分别 → `worktree_not_clean`。
  - 组合 fixture 精确证明 staged / unstaged / 同 path 双分类 / 带空格 untracked 归入正确 set，ignored path 不归入 untracked。
  - 子目录调用仍观察整个 worktree 并返回 root-relative path；repository root 解析为 owning root。
  - merge-conflict fixture 证明 `git diff --name-only` 对同一 path 重复输出时 observer 正确去重；clean 与 dirty fixture 调用前后 HEAD 与 `git status --porcelain` 不变，证明只读。
  - 源码静态断言只发出 `rev-parse`/`diff`/`ls-files` 只读命令，且不含 mutation subcommand 字符串。
- `npm test`（`node --test`）：55 个测试全部通过（含 `scope.test.ts`）；原有 46 项 Increment 1 测试无回归。

### 2026-08-24 — Increment 2 Fix 1

- `npm run typecheck`（`tsc --noEmit`）：无错误。
- `node --test "tests/git-observer.test.ts"`：11 个测试全部通过。
  - 新增两个 public-path fatal-failure regression：损坏 index 的临时仓库调用 `establishCleanBaseline` 与 `collectCompletionEvidence` 均以 `GitCommandError` 拒绝，且保留 command `diff`、args `['--cached','--name-only','-z']`、repository-root cwd、`exitCode=128` 与非空 stderr。
  - non-existent target 测试在 `finally` 中删除 `makeFixture` 返回的 parent directory，不再遗留临时目录。
  - 原有 9 项 Git Observer 测试（正常 repository、missing repository/HEAD、dirty gate、path classification、stable sort、dedup、subdirectory、ignored path、只读 invariant 与 mutation-command boundary）全部继续通过。
- `npm test`（`node --test`）：57 个测试全部通过（含 `scope.test.ts`）；原有 46 项 Increment 1 测试无回归。

### 2026-08-23 — 文档基线

- 枚举全部九个 Markdown 文档；
- 确认所有 relative Markdown link 均可解析；
- 确认所有新增 shared design document 都登记在 Documentation Map；
- 确认目录中没有意外生成的非文档文件；
- 确认 JSON mirror、保存 patch、Room-wide session 和 model-owned result reporting 只出现在拒绝、替代或历史语境；
- 修正过早使用 `PLAN_READY` 的状态标签，因为当前尚无有效 Task Contract。
- 确认叙述性英文段落已清除；剩余 English 内容仅为技术专名、标识符、状态、Schema、命令或文件名。
- 确认 Markdown code fence 与 inline code 的 backtick 可正常渲染，不存在转义残留。

## 阻塞项

Increment 8 Contract已Accepted，当前Accepted planning scope的documentation baseline commit已获授权但尚待本次操作完成。Plugin当前仍只支持Increment 7人工binding prerequisite；manual Codex Desktop smoke保持pending。未获implementation commit/push、Codex启动Claude/service、runtime初始化、真实Claude smoke、branch/worktree、stash删除或其它清理授权。

## 下一步

完成当前Accepted planning scope的documentation baseline commit并核对clean live Git exact`HEAD`；随后由用户按标准指令人工派发完整Increment 8 Contract。Codex不得启动Claude/service或执行其它Git写操作。
