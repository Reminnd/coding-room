# Increment 13 Git Controller 与 `integration_only` Architecture Review

| 属性 | 内容 |
|---|---|
| 文档状态 | Approved |
| Owner | Codex |
| 评审人 | 用户、Codex、Coding task（实现可执行性） |
| 创建日期 | 2026-09-02 |
| 用户确认日期 | 2026-09-02 |
| 生效范围 | Agent Room Stage 3 — Increment 13 |
| 关联材料 | [Stage 3 Architecture Review](./STAGE_3_DAG_CONTROL_PLANE_ARCHITECTURE_REVIEW.md)、[ADR-0006](./ADR/0006-stage-3-dag-control-plane-and-git-controller.md)、[Increment 12 Contract](./INCREMENT_12_TASK_CONTRACT.md) |

## 1. 结论

Increment 13应在已接受并版本化的Increment 12 `0.5-design` source上补齐Git write与`integration_only`闭环，不重建Plan、Revision、Scheduler或Execution Core。目标边界保持为：

```text
GitAction preview（只读Git observation + durable intent）
→ 用户确认exact preview
→ durable Approval
→ one-shot fixed Git execution
→ succeeded | failed | outcome_unknown
```

当前权威资料已经确认Git allowlist、preview-confirm-execute和fresh v0.5最终cutover方向。用户于2026-09-02进一步确认Git Controller调用边界、`--ff-only`对`integration_only` graph的约束，以及active v0.3不cutover时的Coding route。本文Review Decision=`approved`；用户随后确认完整[Increment 13 Task Contract](./INCREMENT_13_TASK_CONTRACT.md)，Contract=`Accepted`。task创建与Git/runtime写操作继续分别授权。

## 2. 证据边界

### 2.1 已确认事实

- live Git为clean `main`，本轮读取的exact `HEAD`为`f010c456d8354e3c02d75fc5389cb68265586488`；该值只是规划证据，不是未来dispatch baseline的替代品。
- Increment 12 accepted source已经实现`Plan`、immutable `TaskGraphRevision`、revision `Approval`、`NodeDispatch`、structured scope、one-shot reconcile、claim concurrency/scope gate和`per_task` acceptance。
- target source protocol已经是`0.5-design`；active project runtime/database/binding仍是`0.3-design`，且当前installed `agent-room` workflow只接受v0.4 binding。正常Room workflow因此不能在本轮使用，setup/cutover也未获授权。
- `git_controller` role兼容条件已冻结为`adapter_id=local_runner`与capability=`git_control`；当前bootstrap `local-runner`只有`execution` capability，且没有active `git_controller` assignment。
- project-scoped MCP当前只配置`p~codex-app` control endpoint。`codex-app`不满足`git_controller`兼容条件，不能把Git execution伪装成planner/reviewer command。
- Git process boundary现有`runGit`使用无shell `execFile`与argument array；Git Observer只读解析canonical non-bare worktree及staged/unstaged/untracked evidence。
- 用户已确认首版Git operation exact allowlist为`create_worktree|commit_paths|integrate_fast_forward`，并明确排除merge commit、cherry-pick、rebase、reset、clean、delete、force、push和自动冲突解决。

### 2.2 本文不授权的事项

- 不授权Coding task创建、Claude/Room Run、GitAction执行、branch/worktree创建、stage、commit、merge、push或cleanup。
- 不授权active v0.3→v0.5 runtime/database/binding cutover、旧database处理或Plugin reinstall。
- 不把本文Reviewing方案、Git Controller或`integration_only`标记为Current capability。
- 不把本轮规划`HEAD`写成未来Coding task的dispatch baseline；派发前必须重新读取clean live Git事实。

## 3. 目标与非目标

### 3.1 目标

- 新增`GitAction`及generic `Approval(target_type=git_action_preview)` consumer，形成exact preview、user decision、single execution与durable settlement。
- Git write只由enabled active `git_controller`执行，Scheduler、Worker、Reviewer、planner和普通Executor不能直接调用mutation process。
- 交付`create_worktree`、`commit_paths`和`integrate_fast_forward`三个typed operation；每个operation使用固定argument grammar，不接受任意subcommand或argv。
- `integration_only`复用existing Run/Review accepted终态：non-integration approved Review按revision预授权转为accepted，但commit仍逐action确认；terminal integration Run仍需用户显式接受，Plan只有在最终fast-forward成功后完成。
- crash、retry、stale preview和Git非零退出均不得自动重放action或自动清理现场。

### 3.2 非目标

- 新Git operation、generic shell、arbitrary pathspec、remote Git、push/fetch/pull、merge commit、cherry-pick、rebase、reset、clean、delete或冲突解决。
- background scheduler、automatic Agent launch、automatic Git execution、automatic retry/Fix/Review/final acceptance。
- hash、Diff fingerprint、commit ID precondition、branch mirror、timestamp validator或saved patch。
- 并行branch fan-in、cross-repository integration、多active Plan、Stage 4 Chat、Stage 5 Cockpit或Stage 6 GitHub。
- 为active v0.3增加dual-read/write、compatibility layer或临时Git authority。

## 4. Decision 1 — Git Controller调用边界

### 4.1 推荐：fixed-actor one-shot `room:git` CLI

新增一个one-shot CLI/application boundary，固定以bootstrap `local-runner`的`git_controller` role执行：

```text
room:git preview --git-action-id <ID> --operation <OP> ...
→ 只读观察Git并持久化GitAction preview

codex-app MCP room_decide_git_action
→ confirmed_by_user=true，为exact preview写Approval

room:git execute --git-action-id <ID>
→ reserve executing；执行一次fixed operation；durable settle

room:git reconcile --git-action-id <ID>
→ 对遗留executing action只读观察并标记outcome_unknown；绝不重放
```

边界理由：

- `local-runner`已经是本地service identity，满足accepted `adapter_id=local_runner`约束；只需增加`git_control` capability和room-scope `git_controller` assignment。
- `codex-app`继续只承担planner/reviewer/orchestrator；用户decision仍从project control endpoint进入，不把Git mutation authority转移给Codex participant。
- 与现有`room:run`一致，CLI是显式one-shot process boundary，不引入daemon或第二MCP authority。
- Plugin Skill可以展示exact command、请求一次host approval、执行至多一次并重新读取durable Room；approval拒绝时零invocation。

### 4.2 不推荐方案

| 方案 | 不采用原因 |
|---|---|
| 给`codex-app`增加`git_controller` | 违反已接受的`local_runner + git_control`兼容规则，并混淆planner与mutation actor。 |
| 增加第二project MCP endpoint `p~local-runner` | project config需要冻结或动态追踪Git Controller participant；assignment replacement会使静态endpoint与current authority漂移。 |
| Scheduler或planner内部直接调用Git | 绕过独立actor、host approval和one-shot execution门禁。 |

## 5. Decision 2 — `integration_only`与`--ff-only`

### 5.1 已确认约束产生的事实

两个从同一base独立产生的parallel branch通常互不为ancestor。把第一个branch fast-forward到target后，第二个branch不能再通过`--ff-only`进入同一target。由于merge commit、cherry-pick和rebase均明确排除，首版不能承诺parallel candidate fan-in。

### 5.2 推荐：single fast-forward lineage

`integration_only` revision批准时增加以下MUST规则：

1. exact一个`kind=integration` terminal node。
2. 所有non-integration node在dependency reachability上形成全序；任意两者必须存在一个方向的ancestor关系。
3. 每个下游managed worktree从上游成功`commit_paths`后的named branch/ref创建，因此branch history保持fast-forward lineage。
4. terminal integration worktree从最后一个component branch创建；Integration Run负责跨模块验证和必要wiring。
5. non-integration Run只有在Review=`approved`后才按policy转为accepted；其NodeDispatch进入`awaiting_git`，成功`commit_paths`后才`completed`并解锁下游。
6. terminal Integration Run仍需正常Review和用户显式accept；若存在integration worktree修改，先单独preview/confirm/执行`commit_paths`。
7. Plan完成条件为：terminal Integration Run=`accepted`、其worktree已满足commit gate、且面向用户确认target branch的`integrate_fast_forward` GitAction=`succeeded`。

该方案牺牲`integration_only`下的parallel fan-in，但完整保留用户已确认的三个Git operation和no-merge/no-rebase边界。`per_task` graph仍可使用Increment 12已有parallel scheduling。

### 5.3 其它方案

| 方案 | 取舍 |
|---|---|
| 增加merge commit或cherry-pick | 可以组合parallel branches，但扩大已冻结allowlist，必须修改ADR-0006并重新确认。 |
| 允许parallel graph后在ff-only失败时人工合并 | 不能形成可独立验收的product闭环，并绕过Git Controller唯一写边界。 |
| 暂不交付`integration_only` | 不满足用户本次Increment 13目标。 |

## 6. Decision 3 — Coding route与runtime门禁

### 6.1 推荐

- Increment 13完整Contract确认后，继续使用saved project的独立Codex worktree task，model=`gpt-5.6-sol`、reasoning effort=`medium`，完整注入Contract。
- 该task只实现source/tests/candidate documentation，不连接active terminal v0.3 Room，不执行真实GitAction，不cutover runtime。
- Review与用户最终接受后，先获得独立版本化授权；Stage 3整体accepted后再单独授权fresh v0.5 setup/cutover和actual installed-Plugin consumer evaluation。

### 6.2 原因

- 当前active binding为v0.3，installed workflow要求v0.4，且Stage 3已确认不在Increment 13前做中间cutover。
- 在Coding前迁移runtime会违背“一次v0.5最终cutover”已确认方向；复用terminal v0.3 Room也没有合法Run lineage。
- 本方案延续既有Stage 3 planning中记录的Coding route，但task创建仍需用户独立授权，不从本次“开始规划”自动推导。

## 7. GitAction exact contract seed

Task Contract应把`GitAction.preview`定义为operation-discriminated union，而不是允许任意nullable字段组合。

### 7.1 `create_worktree`

```yaml
operation: create_worktree
repository_root: absolute canonical path
source_ref: non-empty named branch/ref
new_branch: non-empty branch name
worktree_path: absolute path
preview_event_sequence: positive integer
```

- preview要求source ref可解析、new branch不存在、worktree path不存在且未被Git占用。
- execute只允许`git worktree add -b <new_branch> <worktree_path> <source_ref>`等价argument array；不切换、删除或清理existing worktree。
- 成功后只读解析new worktree canonical root，冻结到对应NodeDispatch并推进`awaiting_git → ready`。

### 7.2 `commit_paths`

```yaml
operation: commit_paths
repository_root: absolute canonical path
worktree_path: absolute canonical path
branch: non-empty branch name
paths: non-empty unique repo-relative paths
commit_message: Conventional Commit message
git_evidence:
  staged: [path]
  unstaged: [path]
  untracked: [path]
preview_event_sequence: positive integer
```

- paths必须等于preview时live staged/unstaged/untracked union，且全部在NodeDispatch declared write scopes内；scope violation、blocked dispatch或空path set拒绝preview。
- execute前重新观察exact branch、worktree和三类path set；不一致为`git_preview_stale`，零mutation。
- fixed process只stagepreview paths并创建一次non-amend Conventional Commit。若stage成功而commit失败，GitAction=`failed`并保存live evidence；不reset或自动retry。
- 成功后要求live path sets为空，记录resulting commit ID作为historical evidence，并推进NodeDispatch gate。

### 7.3 `integrate_fast_forward`

```yaml
operation: integrate_fast_forward
repository_root: absolute canonical path
source_branch: non-empty branch name
target_branch: non-empty branch name
target_worktree_path: absolute canonical path
git_evidence:
  staged: []
  unstaged: []
  untracked: []
preview_event_sequence: positive integer
```

- source/target必须属于同一repository，target branch必须在exact target worktree checkout且clean。
- execute只允许在target worktree运行`git merge --ff-only <source_branch>`等价argument array。
- 非零退出保持branches/worktrees，不执行merge commit、rebase、reset或cleanup；Action=`failed`。
- 成功记录target resulting commit ID作为historical evidence；它不参与后续runtime validation。

## 8. Preview、Approval与cursor语义

为避免preview自身Event或Approval Event使cursor必然stale，Event gate定义为：

1. preview transaction保存`git_action_previewed` Event；GitAction记录该Event的exact sequence。
2. `room_decide_git_action`只在Room current cursor仍等于该preview Event sequence时接受decision；成功写Approval与`git_action_approved|rejected` Event。
3. execute reserve前要求current cursor等于该exact Approval Event sequence；任何插入的其它Room Event都使action=`git_preview_stale`，必须创建fresh action/preview。
4. reserve写`git_action_executing` Event后才启动Git process；该expected Event不反向使自身stale。

cursor只检测Room协作事实变化。execute前还必须重新观察§7的structured live Git facts；不增加hash、fingerprint、commit precondition或timestamp。

## 9. External side-effect settlement

```text
approved
→ executing（SQLite先提交）
→ Git process一次
→ succeeded | failed

executing + process ownership丢失/重启
→ explicit reconcile
→ outcome_unknown
```

- `approved` action只有一个execution reservation winner；并发或same-ID retry不得产生第二个process。
- `succeeded|failed|outcome_unknown`均为terminal；同一GitAction永不重新执行。
- `failed`保存exit code、stderr摘要与post-operation live Git evidence；不自动清理或重试。
- 遗留`executing`只允许`room:git reconcile`进行read-only Git observation并标记`outcome_unknown`；用户随后决定接受现状、人工恢复或以fresh ID创建new preview。
- external Git mutation与SQLite不能原子提交；`outcome_unknown`如实表达该gap，不用推测性success/failure覆盖。

## 10. Entity、状态与Event影响

### 10.1 `GitAction`

```yaml
status: previewed | approved | executing | succeeded | failed | outcome_unknown
result:
  command_exit_code: integer | null
  resulting_commit_id: string | null
  message: string | null
  git_evidence: GitEvidence | null
```

rejected decision保留`GitAction.status=previewed`与terminal rejected Approval；该action不可执行。任何后续尝试必须fresh `git_action_id`和fresh preview。

### 10.2 `NodeDispatch`

新增`awaiting_git`status：

- managed node未成功`create_worktree`时为`awaiting_git`；成功后为`ready`。
- `integration_only` non-integration Run由policy accepted后为`awaiting_git`；成功`commit_paths`后为`completed`。
- terminal integration Run accepted但尚未满足commit/final fast-forward gate时保持可推导的Git waiting reason；Plan不得提前完成。

### 10.3 Event

至少新增：

- `git_action_previewed`
- `git_action_approved|rejected`
- `git_action_executing`
- `git_action_succeeded|failed|outcome_unknown`

Component acceptance继续由existing Review/Run/NodeDispatch事实表达；Plan completion由terminal Integration Run、commit gate和final GitAction推导，不新增integration completion Event或mutable Plan status。GitAction Event只引用entity和摘要，不复制Diff、patch或完整preview。

## 11. Public boundary seed

| Boundary | Actor | 成功语义 |
|---|---|---|
| `previewGitAction` / `room:git preview` | active `git_controller` | 只读观察Git，持久化typed preview和Event；零Git mutation。 |
| `room_decide_git_action` MCP | planner + `confirmed_by_user=true` | 为exact unstale preview写terminal Approval；不执行Git。 |
| `executeGitAction` / `room:git execute` | frozen active `git_controller` | reserve后至多执行一次allowlisted operation并durable settle。 |
| `reconcileGitAction` / `room:git reconcile` | frozen active `git_controller` | 遗留executing转outcome_unknown；零Git mutation。 |
| `room_reconcile_plan` | orchestrator | integration policy projection、dependency/Git gate和ready materialization；不执行Git。 |
| `room_get_state` | assigned participant | 增加GitAction、Git waiting reason与derived Plan completion。 |

## 12. Failure semantics

| Failure | MUST行为 |
|---|---|
| unassigned/disabled/replaced Git Controller | `actor_not_allowed`；零Git process、零durable partial write。 |
| invalid operation/payload union | `validation_failed`；零preview/Event/Git process。 |
| preview/Approval cursor stale | `git_preview_stale`；零Git mutation，fresh preview required。 |
| branch/worktree/path evidence变化 | `git_preview_stale`；零Git mutation。 |
| blocked/scope-violated dispatch | preview前拒绝；完整snapshot不变。 |
| duplicate execute race | 一个reservation/process；loser返回existing state或stable conflict。 |
| Git process non-zero | Action=`failed`，保存evidence，不自动retry/cleanup。 |
| process ownership丢失 | Action=`outcome_unknown`，禁止自动重放。 |
| ff-only不成立 | Action=`failed`；source/target保留，不merge/rebase/resolve。 |
| non-linear `integration_only` graph | revision decision `validation_failed`；零Approval/Dispatch/Task/Run/Event。 |
| final integration accepted但ff未成功 | derived Plan completion保持false；不得用mutable Plan status覆盖。 |

## 13. Verification方向

Task Contract至少应冻结以下direct evidence：

- schema对三个operation union、`integration_only`、integration node和`awaiting_git`的正反例。
- real temporary repository验证create worktree、selected-path commit和ff-only success/failure；每项同时核对branches、worktrees、index、worktree evidence和SQLite/Event。
- stale/unapproved/rejected preview在Git process前拒绝，完整public snapshot与repository state不变。
- fake Git process验证single reservation、non-zero、crash/restart、outcome_unknown与terminal no-replay。
- `commit_paths`的stage-success/commit-failure partial side effect如实保存且不自动reset。
- `integration_only` linear revision、policy acceptance、commit gate、terminal Integration Review/user acceptance与final ff Plan completion的MCP/E2E public path。
- non-linear fan-in、missing integration node、multiple integration node、policy amendment、scope violation和failed GitAction均不解锁descendant或Plan completion。
- static source/scope证明没有任意argv、shell、hash/fingerprint、merge commit/cherry-pick/rebase/reset/clean/delete/push、background execution或new dependency。

## 14. Confirmed Decisions

用户于2026-09-02确认三项推荐：

1. **Git Controller transport**：采用fixed `local-runner` actor的one-shot `room:git` CLI；planner decision继续经`codex-app` MCP，不增加第二MCP endpoint，也不给`codex-app`增加Git mutation authority。
2. **`integration_only`范围**：首版只支持single fast-forward lineage，不支持parallel branch fan-in；`per_task`仍可使用Increment 12已有parallel scheduling。
3. **Coding route**：完整Contract确认并取得独立task创建授权后，使用saved project的独立Codex worktree task，model=`gpt-5.6-sol`、reasoning effort=`medium`；active v0.3保持不cutover。

这些架构确认允许生成完整[Increment 13 Task Contract](./INCREMENT_13_TASK_CONTRACT.md)；用户已于2026-09-02另行确认Contract全文。两次确认均不授权task创建、GitAction、版本化或runtime/database/binding cutover。

## 15. Review Decision

`approved`

原因：Stage 3总体方向、Git allowlist、Git Controller transport、ff-only可达范围和pre-cutover Coding route均已由用户明确确认，authority、state ownership、failure boundary与最小实现顺序形成闭环。完整Contract现已`Accepted`；Implementation仍必须经过clean versioned baseline、独立Coding task授权、Review与用户接受。

## 16. 验证摘要

- Git事实：clean `main`，exact `HEAD=f010c456d8354e3c02d75fc5389cb68265586488`；未执行任何Git写操作。
- source事实：Increment 12 accepted source不存在`GitAction`、Git mutation或`integration_only`；现有Git process为argument-array `execFile`，Observer为只读boundary。
- authority事实：`git_controller`兼容规则与current control endpoint不允许把Codex participant直接当作Git actor。
- lifecycle事实：parallel divergent branches无法由仅`--ff-only`汇合；single lineage是保持accepted allowlist的最小可执行范围。
- runtime事实：active binding为v0.3，installed Agent Room workflow要求v0.4；未调用Room MCP、setup或launcher。
- user decision：§14三项推荐已于2026-09-02确认；本Review提升为`Approved`。
- documentation: updated。完整Increment 13 Task Contract已获用户确认并提升为`Accepted`，相关状态同步到文档中心、Project Rules、Architecture、Protocol、ADR、MVP/Operations/Development；未把未实现能力写成Current。
