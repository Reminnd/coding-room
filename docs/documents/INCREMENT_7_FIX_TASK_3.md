# Increment 7 Fix Task 3 — YAML Scalar Legality 与 Front Matter Oracle

| 属性 | 内容 |
|---|---|
| 文档状态 | Accepted |
| Owner | Codex |
| 执行者 | Claude Code（仅在用户人工派发后） |
| 创建/确认日期 | 2026-08-27 |
| Review ID | `review-increment-007-codex-004` |
| Parent Task | `increment-007-codex-plugin-multi-project` |
| Lineage baseline | `b9ebeffdcc8dd9c34718111b50fa3605a21ad17e` |
| Current manual dispatch HEAD | `c9b59855beb4528de6800106123913f9a237b06e`；派发前重新读取 live Git，允许存在未提交的 Codex-owned Review/Fix 文档，但该 HEAD 必须是 lineage baseline 的仅文档后继 |
| Target | `main` / `D:/agent/case/codex-claudecode-room` |

```yaml
task_id: increment-007-codex-plugin-multi-project-fix-003
room_id: agent-room-main
type: fix
parent_task_id: increment-007-codex-plugin-multi-project
based_on_review_id: review-increment-007-codex-004

background: >
  Increment 7 Fix Task 2 已补齐唯一 Skill 的 front matter、修正 answered
  NEEDS_DECISION continuation gate，并报告 focused 18/18 与全量 261/261 通过。
  Codex Review 4 确认 Decision resume lifecycle 已闭合，但唯一 SKILL.md 的
  description 使用未引用 plain scalar，内容中的 `binding: validate` 含 colon-space，
  标准 YAML parser 以 `mapping values are not allowed here` 拒绝加载。测试侧局部
  parser 只按第一个 colon 分割，因此未检测真实 YAML scalar legality。用户已确认
  该 finding 与以下最小方案。

goal: >
  仅闭合 review-increment-007-codex-004 的一个 confirmed finding：把唯一 Agent Room
  Skill 的 description 编码为合法 YAML double-quoted scalar，并使独立 packaging
  Oracle 显式拒绝当前未引用 colon-space 反例；保持 Skill 正文、Decision continuation、
  Plugin packaging、Room lifecycle、production runtime 与其它已通过行为不变。

confirmed_findings:
  - finding_id: inc7-r4-frontmatter-yaml-invalid
    solution: >
      将 plugins/agent-room/skills/agent-room/SKILL.md 的现有单行 description 改为
      YAML double-quoted scalar，保留现有 trigger-oriented 内容与非目标边界。更新
      tests/plugin-packaging.test.ts 的最小测试侧 front matter parser，使其只接受本任务
      所需的合法 name plain scalar 与 JSON-compatible YAML double-quoted description，
      对 description 使用 JSON.parse，并新增当前未引用 `binding: validate` 形态的直接
      negative fixture；保留 heading-first 与无 delimiter 的既有 negative evidence。
      不引入 production parser、YAML dependency 或 generic framework。

requirements:
  - 只修复review-increment-007-codex-004的一个confirmed finding；review_fixes_only。
  - >
    唯一SKILL.md继续从第一个字符以`---`开始，保留exact `name: agent-room`；只把现有
    description表示改为合法YAML double-quoted scalar，不改写其语义或增加非目标能力。
  - >
    description使用以下冻结值，避免实现时重新解释discovery范围：`"Use when the operator
    asks to run the Agent Room workflow for the current project or its local
    `.agent-room/runtime.json` binding: validate the project-local Room binding, follow the durable
    Room state through planning, one-shot Claude Run, Question, Review/Fix and acceptance, and
    invoke the Agent Room launcher at most once per approved task run."`。
  - 除front matter description的scalar表示外，不修改SKILL.md正文、Step 3/Step 4、Decision answer(false/true)、CODING零launcher、baseline/session、approval或durable reread语义。
  - tests/plugin-packaging.test.ts继续使用测试侧最小局部parser，从文件首字符验证opening/closing delimiter、exact name与description；不得导入candidate parser、production code或新增dependency。
  - 局部parser必须对description要求JSON-compatible double-quoted scalar并用JSON.parse取得值；不能继续把任意colon后的剩余文本都当成合法YAML value。
  - >
    packaging Oracle必须构造并显式拒绝当前错误形态：未引用description内容包含
    `binding: validate`；同时保留heading-first与无front matter delimiter的拒绝证据。
  - 现有trigger词与non-goal negative assertion继续成立；既有Decision resume组合Oracle及其它18项packaging行为不得被删除、弱化、重命名或改成只搜索目标字符串。
  - 只把本Fix实际Diff、verification、deviation与REVIEW_REQUIRED candidate事实写入DEVELOPMENT_LOG；其它项目文档由Codex在Fix Review documentation impact audit中维护，Claude不得把Plugin提升为Current。

non_goals:
  - 修改SKILL.md正文workflow、Decision lifecycle、launcher gate、command、baseline/session ownership、approval、durable reread或其它Skill行为。
  - 修改marketplace.json、project-setup.md、plugin.json、tests/multi-project-e2e.test.ts、tests/scope.test.ts或Fix Task 1/2已闭合的其它实现。
  - 修改src/、package.json、package-lock.json、dependency、package script、production configuration、RoomService、Runner、MCP、CLI或state snapshot read model。
  - 引入YAML package、production front matter parser、generic parser/framework、wrapper、compatibility layer、feature flag、hash/checksum或defensive scaffolding。
  - 新Room state、transition、entity、schema/table/migration、Event、error、protocol version、MCP tool或same-Room concurrency语义。
  - 修改host approval/sandbox/rules/trusted-project配置，或把operator direct room:run作为Plugin正常路径/fallback。
  - 真实Claude、paid process、manual Codex Desktop smoke、network、global Plugin install、runtime初始化、stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout、stash删除或其它清理。

architecture_decisions:
  - 本Fix只修正YAML metadata的序列化合法性与对应test Oracle，不改变Skill discovery语义、Plugin component、Room actor或runtime state。
  - 采用double-quoted scalar而非block scalar，使测试侧可用JSON.parse提供独立、最小且无需dependency的合法性边界；这不是通用YAML实现。
  - Current Decision continuation保持不变：answer(false)后的NEEDS_DECISION可由一次resumeRun claim进入CODING，answer(true)不得resume；本Fix不得触碰该已闭合行为。

scope:
  - review_fixes_only
  - plugins/agent-room/skills/agent-room/SKILL.md中的front matter description scalar表示
  - tests/plugin-packaging.test.ts中的最小front matter parser与malformed unquoted colon-space negative Oracle
  - docs/documents/DEVELOPMENT_LOG.md中的Fix Coding/verification candidate事实

constraints:
  - 保留原Implementation lineage baseline_head b9ebeffdcc8dd9c34718111b50fa3605a21ad17e；Fix不重新执行clean-worktree gate。
  - 当前branch为main、当前HEAD为c9b59855beb4528de6800106123913f9a237b06e、0 staged；派发前重新读取live branch/HEAD/status，并核对lineage baseline为ancestor、baseline后commits只含Codex-owned文档。
  - 当前dirty worktree包含同一Increment 7 candidate与未提交的Codex-owned Review 4/Fix Task 3文档；不得覆盖、回滚、拆分、stage、格式化或修改scope外candidate及Codex文档。
  - 用户已确认finding与solution；本次确认不授权Codex启动Claude，也不授权任何Git写操作。只有用户另行选择人工派发后，Claude才可执行本Contract。
  - Claude必须在原Increment 7 implementation lineage/session中执行；不能确认lineage时返回needs_decision，不创建无关新session冒充continuation。
  - tests使用existing local package/dependencies与temporary fixture；不得访问network、读取operator全局Codex settings、安装Plugin或启动真实Claude。
  - 不得删除、弱化或改名规避既有assertion。若正确修复需要scope外Skill正文、Plugin/reference/source/package/E2E/scope/protocol/dependency变化，停止并返回needs_decision。

acceptance_criteria:
  - 唯一SKILL.md front matter可按标准YAML scalar规则加载，exact name为agent-room，description与冻结值一致且保留既有trigger/non-goal边界。
  - >
    tests/plugin-packaging.test.ts的独立局部parser对description执行JSON.parse，并直接拒绝
    未引用且含`binding: validate`的当前错误fixture；heading-first与无delimiter fixture仍被拒绝。
  - Skill正文与Decision resume组合语义无本Fix变化；现有packaging Oracle全部保留并通过。
  - focused packaging test、unchanged two-project E2E、scope、typecheck及full suite全部通过，且不启动真实Claude/network。
  - live task-owned净Diff仅新增本Fix允许的description scalar、packaging parser/negative Oracle与DEVELOPMENT_LOG candidate事实；其它Plugin、test、source、package与protocol无本Fix变化。

verification:
  - command: node --test "tests/plugin-packaging.test.ts"
    detects: front matter是否能由受约束的独立parser取得exact字段，并拒绝未引用colon-space、heading-first与无delimiter反例，同时保留Decision resume等既有Oracle。
    decision_if_failed: 只修复本Fix的metadata/test Oracle；需要Skill正文、dependency或scope外变化时返回needs_decision。
  - command: node --test "tests/multi-project-e2e.test.ts"
    detects: metadata/parser修改是否意外破坏既有A/B concurrent isolation candidate。
    decision_if_failed: 不修改E2E或production语义掩盖失败；若非本Fix副作用则返回needs_decision。
  - command: node --test "tests/scope.test.ts"
    detects: 本Fix是否越过Increment 7 exact boundary或改变dependency/package scripts。
    decision_if_failed: 不放宽allowlist；移除本Fix越界Diff或返回needs_decision。
  - command: npm run typecheck
    detects: 局部parser或negative fixture是否产生TypeScript偏移。
    decision_if_failed: 仅修复本Fix类型问题；不得使用any、ts-ignore、skipLibCheck、dependency或wrapper规避。
  - command: npm test
    detects: 本Fix是否破坏Increment 1-6 lifecycle、Increment 7 Fix Task 1/2与全量test discovery，以及是否误启动真实Claude/network。
    decision_if_failed: 只修复task-owned regression；不得删除/弱化既有test或扩大production scope。
  - command: git diff --name-only
    detects: 本Fix净新增修改是否仅位于description scalar、packaging test与DEVELOPMENT_LOG，且未覆盖其它candidate。
    decision_if_failed: 不回滚既有lineage或Codex文档；报告无法安全分离的scope drift并停止。
  - command: git status --short --branch
    detects: branch、HEAD、staged/untracked状态或candidate ownership是否漂移。
    decision_if_failed: 不stage、清理、回滚或重定baseline；报告drift并停止。

documentation_updates:
  - path: docs/documents/DEVELOPMENT_LOG.md
    expected_change: 记录Fix Task 3实际Skill/test Diff、YAML scalar negative Oracle、live verification、deviation及REVIEW_REQUIRED candidate事实；用户接受并版本化前不得提升Current capability。

question_policy: >
  若正确修复需要修改Skill正文workflow、marketplace、project setup、plugin manifest、multi-project
  E2E、scope allowlist、src、package/lock/dependency/script、production config、Room
  state/transition/entity/schema/Event/error、MCP/Runner/CLI/state snapshot semantics、
  baseline/session ownership、same-Room parallel或host approval policy，或需要network、global
  install、runtime初始化、真实/paid Claude、manual Desktop smoke或任何Git mutation，停止受影响
  工作并返回needs_decision。测试侧helper命名与negative fixture组织可在本Contract冻结行为内作最小选择，
  并在Coding Result记录；不得改变冻结description值或替换double-quoted scalar方案。

review_fixes_only: true
confirmed_by_user: true
created_by: codex
created_at: 2026-08-27
```

## 人工派发边界

- 用户已确认Review 4 finding与上述最小solution，因此本Fix Task为`Accepted`，项目阶段为`FIX_PLAN_READY`。
- 本次确认不授权Codex启动Claude；等待用户选择并执行人工派发或另行明确授权。
- 派发前必须确认`main`、0 staged与当前candidate path ownership；live `HEAD`必须证明lineage baseline为ancestor且中间commits只含Codex-owned文档。Fix继续继承原lineage baseline，不要求dirty worktree clean。
- 标准客户端能可靠解析`@<path>`时使用下方指令；不能解析时必须注入本文全文，不得只发送finding摘要。
- 不授权manual Codex Desktop smoke、真实Claude、stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout、stash删除、runtime初始化或其它清理。

## 人工派发指令

```text
执行 @docs/documents/INCREMENT_7_FIX_TASK_3.md 中已批准的完整 Fix Task。严格遵守其中的 confirmed_findings、review_fixes_only、scope、non_goals、constraints、acceptance_criteria、verification、documentation_updates 和 question_policy；只修正唯一 Skill 的 front matter description YAML scalar表示与packaging test的对应局部parser/negative Oracle，保持Skill正文、Decision resume组合语义、Plugin其它文件、production source、package、multi-project E2E与scope allowlist不变。完成后按 ROOM_PROTOCOL.md 的 Coding Result Contract 返回完整结果。不要执行 stage、commit、push、branch/worktree、merge、rebase、reset、restore、clean、checkout、stash删除、runtime初始化或其它清理操作。
```

如果人工客户端不能可靠解析`@docs/documents/INCREMENT_7_FIX_TASK_3.md`，必须把本文件完整内容直接注入同一次prompt；不得只发送上面一行或自行摘要Contract。

## 相关文档

- [Increment 7 Task Contract](./INCREMENT_7_TASK_CONTRACT.md)
- [Increment 7 Fix Task 1](./INCREMENT_7_FIX_TASK_1.md)
- [Increment 7 Fix Task 2](./INCREMENT_7_FIX_TASK_2.md)
- [Architecture](./ARCHITECTURE.md)
- [Room Protocol](./ROOM_PROTOCOL.md)
- [MVP Plan](./MVP_PLAN.md)
- [Development Log](./DEVELOPMENT_LOG.md)
- [Codex Review 与规划指南](./agent-guides/CODEX_REVIEW_AND_PLANNING.md)
- [Claude Coding 与 Fix 指南](./agent-guides/CLAUDE_CODING_AND_FIX.md)
- [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md)
