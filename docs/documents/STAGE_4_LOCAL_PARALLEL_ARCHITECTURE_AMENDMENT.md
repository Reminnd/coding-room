# Stage 4 Local Parallel Architecture Amendment

| 属性 | 内容 |
|---|---|
| 文档状态 | Current |
| Owner | Codex |
| Current implementation | S02 accepted/integrated `main=c6f22fa110076a2784a39702c18a7c6ba99199db` |
| Increment 15 terminal | `accepted_and_integrated` at `97ae2d869c39730fe77fb14df2ac34f57c681eb8`; Active Stage/Task均为空 |

`97ae2d869c39730fe77fb14df2ac34f57c681eb8`同时是manual non-Router closure reconciliation exact base；它记录Increment 15终态与本次reconciliation起点，不是reconciliation完成后的永久current `main` HEAD。

## 1. 结论与主路径

GitHub/Git 是持久化项目开发事实；Local Bridge 是唯一 scheduler、Task worktree 与 Git delivery boundary；Local Codex native task thread 是 ephemeral implementation surface；ChatGPT fixed Chat 是唯一 Formal Review Authority。Supervisor Integration、GitHub Actions、native thread/UI history 与 Agent Room SQLite 都不是项目开发 Review 或 recovery authority。

```text
GitHub/Git accepted Contract and dispatch facts
→ Local Bridge DAG / Ready Set
→ one fresh native Codex task thread in the assigned Task worktree
→ task-generic Worker Result + native process facts
→ Controller-owned Git observation, Router verification and candidate commit
→ Supervisor Integration
→ controlled Task-to-Stage cherry-pick
→ Stage exact-head verification
→ fixed Chat Formal Review
→ user exact-SHA acceptance
→ separately authorized non-force fast-forward to main
```

## 2. Native Worker boundary

- Current backend 是 `codex_native_task_threads`。每个 Ready Task 通过 `codex app-server --listen stdio://` 获得一个 fresh ephemeral thread；不持久化 thread registry，也不存在 pre-S02 `codex exec` Worker fallback。
- `thread/start` 与 `turn/start` 都显式绑定 Task worktree `cwd` 和 resolved model；turn 原生接收 Router 指定的 reasoning effort。approval policy 固定为 `never`。
- thread 使用 `workspace-write`；turn 的 `sandboxPolicy` 只有 Task worktree 一个 `writableRoots`，并设置 `networkAccess=false`。
- 成功必须观察同一 `threadId`/`turnId` 的 `final_answer` 与 `turn/completed`，且 terminal status 只能是 `completed | failed | interrupted`。无关 thread/turn event 不参与结算。
- native capability 不可用、request failure、fresh thread/turn identity 无效、requested model reroute、匹配 terminal event 缺失或 terminal status 不受支持，均返回 `needs_decision`；不得降级到另一 Worker backend。

Native thread 是一次性 process execution surface，不保存 DAG、Ready Set、recovery、Review 或 merge 状态。其 identity/status 只由 `processResult.native` 提供并进入 Controller/Supervisor/lifecycle evidence；UI/thread history 仅供观察。

## 3. Prompt 与 delegation authority

每个 Worker 必须收到完整 Accepted Task Contract，以及包含 `task_id`、`dispatch_id`、repository、immutable dispatch `base_sha`、Stage/Task branch、Task worktree、Contract path、model policy、resolved model 和 reasoning effort 的 dispatch envelope；Router `owns` 与 dependency facts 也必须完整注入。

Worker 只能修改 owned paths，留下 unstaged working-tree Diff，不执行 Formal Review 或 Git staging/commit/push/integration。Subagent delegation 默认禁止；只有 exact Accepted Contract 可以授权 Root Worker 使用 native multi-agent，授权不向 child 传递，child-spawned writing descendants 始终禁止。

## 4. Task-generic Worker Result

Worker Result 是 semantic handoff，不是 native、verification、ownership 或 Git authority。所有状态都要求以下 common fields：

```yaml
task_id: string
dispatch_id: string
reported_base_sha: string
deviations: [string]
unresolved: [string]
questions: [string]
status: implementation_ready | blocked | needs_decision
```

只有 `implementation_ready` 额外要求 non-empty `changed_files: [string]`。不得要求 Worker 提供 `native_backend`、`verification` 或 `reported_task_head_sha`；不得用 Task-specific parser branch 改写 generic grammar。

Authority 分离如下：

| Fact | Owner |
|---|---|
| Worker semantic status 与 self-reported paths | task-generic Worker Result |
| native thread/turn identity 与 status | `processResult.native` |
| verification | Router `task.verification → runVerification()` |
| ownership | Router `owns`、Controller observed working paths、`mechanicalGate()` |
| candidate commit identity、parent 与 changed files | Controller-observed Git facts |

## 5. Controller、Integration 与 Review gates

Worker 的 `implementation_ready` 只允许 Controller 开始独立交付链；它不表示 candidate 已创建或通过 Review。精确 Git 顺序与 recovery 规则由 [Git 与并行工作流指南](./agent-guides/GIT_AND_PARALLEL_WORKFLOW.md) 维护。

Local Bridge 必须在 conflict、path drift、verification failure、mechanical failure 或 inconsistent recovery facts 时停止；不得 rebase、auto-resolve、repair、replay 或把失败解释为空事实。Task→Stage 只允许 controlled cherry-pick 并记录 `source_task_sha → stage_commit_sha`。Stage 只有在 exact head verification 后才可交给 fixed Chat；任何 Stage change 都使先前 readiness 失效。Stage→main 只允许在用户接受 exact reviewed Stage SHA 后，经独立授权执行 non-force fast-forward。

## 6. Agent Room product boundary

本控制面只约束 repository development。Agent Room 产品 runtime 继续由 Room SQLite、Room protocol、product Runner 与 Claude Code execution surface 管理；本 amendment 不修改 Room entity/state/Event/schema、MCP/CLI、SQLite、Claude session 或 product Runner 行为。

## 7. Increment 16 Candidate lifecycle extension

本节只描述尚未进入`main`的 Candidate overlay；§1–6 的 Current S02 native Worker/generic Result 与 Increment 15 terminal authority不变。Increment 16 采用唯一的 Option A：GitHub PR comments保存 lifecycle facts，initial Router Contract与prepared Fix Router bundle保存于repository/GitHub lineage，不增加本地 database、Room entity或新 authority。

Authority严格分离：Fixed Chat独占 Formal Review；用户独占 Fix solution确认、Fix/Stage acceptance与 Git-write/closure authorization；GitHub Actions只执行 mechanical verification/projection，不作 Review、不接受、不授权 Git write，也不启动 Worker。三类 grammar互不替代：decision records仅有`FORMAL_REVIEW_V1`、`FIX_ROUND_OPENED_V1`、`FIX_BUNDLE_ACCEPTANCE_V1`、`STAGE_ACCEPTANCE_V1`、`STAGE_CLOSURE_AUTHORIZATION_V1`；mechanical records仅有`FIX_PREPARED_V1`、`STAGE_VERIFICATION_V1`、`STAGE_CLOSED_V1`；Review/Fix handoff使用各自独立 closed marker/schema。所有 caller-supplied `source_reference`必须是只含`source_kind`与非空`decision_reference`的 closed object：Formal Review使用`fixed_chat_assistant_decision`，四类用户决定使用`fixed_chat_user_decision`，不得从label、author、comment order或mechanical fact推断。

公开 lifecycle CLI 恰有四个 command：`record-review`、`prepare-fix`、`record-acceptance`、`close-stage`。`record-acceptance`强制显式`--record-type`，只接受`FIX_BUNDLE_ACCEPTANCE_V1`或`STAGE_ACCEPTANCE_V1`；identity为`[record_type, acceptance_id]`，相同 scalar ID 跨类型隔离且不可替代 downstream gate。

Actions selector只有`canonical_stage_router`与`prepared_fix_router`两种 mode；`needs_decision`是失败。initial Router继续使用 Current reader兼容的`ROUTER_CONTRACT_V1` shape。canonical path不泄漏 Fix gate；prepared Fix严格按 verification → exact `STAGE_VERIFICATION_V1` PASS → Fix handoff → 独立 typed acceptance推进，Actions在 handoff 后停止。

Controller在读取 scheduler、创建 worktree、发布 event、消费 dispatch或启动 Worker之前，必须一次性验证 batch内全部 launch authority、current exact SHA与known start state。拒绝属于 command-level zero-event `PRE_MUTATION_FAILURE`，不消费预分配 dispatch；补齐 authority 后 fresh invocation仍使用原 mapping。完整成功时，Worker使用该 invocation在 gate时缓存的 exact Accepted Contract bytes。任何可能已调用 external mutation后的不可确认结果属于`POST_MUTATION_UNCERTAIN`：停止当前及依赖 mutation，不盲目 retry/rollback；fresh invocation重读 durable GitHub/Git authority后再判定。

`close-stage`只有三态：若`main`已等于 accepted Stage SHA，则不 push，只补缺失 terminal projection；若`main`等于 authorization冻结的 expected baseline，经独立 host approval执行 exact `<accepted_stage_sha>:refs/heads/main`、`force=false`、fast-forward-only；若为第三 SHA或不可观察，则不 push并返回`needs_decision`。terminal response loss只能在 exact closure已可观察时修补 projection，不得自动创建 Fix、Worker、acceptance或第二次 push。
