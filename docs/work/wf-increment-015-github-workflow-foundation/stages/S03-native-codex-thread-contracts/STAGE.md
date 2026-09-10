# STAGE — S03-native-codex-thread-contracts

- work_id: `wf-increment-015-github-workflow-foundation`
- status: `waiting_for_T06_environment_preparation_authorization`
- purpose: `synchronize_native_codex_thread_authority`
- goal: 通过一个 docs-owned native Codex Task，把已在 S02 接受并集成的 Worker backend 与 generic Worker Result boundary同步到 exact 14 份 Current/candidate authority文档。
- planning_base_sha: `c6f22fa110076a2784a39702c18a7c6ba99199db`
- stage_branch: `stage/wf-increment-015-github-workflow-foundation/S03-native-codex-thread-contracts`
- dependencies: S02 accepted and integrated at exact GitHub `main` `c6f22fa110076a2784a39702c18a7c6ba99199db`
- current_tasks: [`T06-native-codex-thread-contracts`](./tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md)
- router: [`ROUTER_CONTRACT.md`](./ROUTER_CONTRACT.md)
- supervisor: [`SUPERVISOR_ROUTER_AGENT.md`](./SUPERVISOR_ROUTER_AGENT.md)
- lifecycle: `waiting_for_T06_environment_preparation_authorization`
- accepted_contract_sha: `708462449d73345b0cc3d50ff065c743a4896960`
- implementation_authorized: `false`
- environment_preparation_completed: `false`
- run_once_authorized: `false`
- stage_push_authorized: `false`

## Entry facts

1. T05、T05F00 -005 与 T05F01 -002 的 production changes 已集成。
2. S02 Formal Review repair commits `10b48b42548d5595a27ed41db8423789ea1ac145` 与 `c6f22fa110076a2784a39702c18a7c6ba99199db` 已进入 GitHub `main`；S02 lifecycle 已 resolved。
3. 当前 native Worker 使用 app-server stdio transport、fresh ephemeral task thread、explicit task worktree `cwd`、exact model/effort 与 matching turn terminal evidence；unavailable/rerouted capability以 `needs_decision` 停止，无 `codex exec` Worker fallback。
4. Current generic Worker Result只由 identity、three common lists与status组成；`implementation_ready`另外要求 non-empty `changed_files`。Native execution、Router verification、ownership与candidate identity继续由各自既有authority提供。
5. S03 Stage branch 已建立并 push，Draft PR #7 已存在；pushed candidate `ddbc5a35d734eaca908090013b3ce29202086483` 因 Contract drift 未被用户接受。`S03CF01` repaired Contract 已由用户在 exact Stage SHA `708462449d73345b0cc3d50ff065c743a4896960` 接受；当前 lifecycle 等待 T06 environment preparation authorization。

## Frozen task and ownership

S03 只有 T06 一个 Task。Future T06 Worker implementation ownership 精确为 14 paths：

- `AGENTS.md`
- `CLAUDE.md`
- `PROJECT_RULES.md`
- `docs/documents/README.md`
- `docs/documents/ARCHITECTURE.md`
- `docs/documents/DEVELOPMENT_LOG.md`
- `docs/documents/MVP_PLAN.md`
- `docs/documents/STAGE_4_LOCAL_PARALLEL_ARCHITECTURE_AMENDMENT.md`
- `docs/documents/agent-guides/README.md`
- `docs/documents/agent-guides/CODEX_DOCUMENTATION_AUTHORING.md`
- `docs/documents/agent-guides/CODEX_REVIEW_AND_PLANNING.md`
- `docs/documents/agent-guides/CLAUDE_CODING_AND_FIX.md`
- `docs/documents/agent-guides/GIT_AND_PARALLEL_WORKFLOW.md`
- `docs/work/wf-increment-015-github-workflow-foundation/SUPERVISOR_ROUTER_AGENT.md`

本次 `S03CF01` Contract Freeze repair 的 writable governance scope 则只有 `PLAN.md`、`EXECUTION_PLAN.md`、本 `STAGE.md`、`ROUTER_CONTRACT.md`、本 Stage 的 `SUPERVISOR_ROUTER_AGENT.md` 与 T06 `TASK_CONTRACT.md`。这 6 个 repair files 不是 future T06 ownership。Future T06 不允许第 15 个 changed path；product source、Bridge source、tests、workflow与package保持不变，S01/S02文件保持 immutable history。

## Gate sequence

```text
user accepts exact repaired T06 Contract at Stage SHA 708462449d73345b0cc3d50ff065c743a4896960
→ local acceptance persistence commit
→ explicit acceptance-persistence Stage push authorization
→ separate T06 environment preparation and one-shot run authorization
→ native Worker leaves exact docs Diff unstaged
→ Controller verification and exact-path candidate commit
→ Supervisor Integration and controlled cherry-pick
→ Stage candidate verification
→ fixed Chat Formal Review
→ user accepts exact reviewed Stage SHA
→ separately authorized non-force fast-forward to main
```

当前动作止于本地 acceptance persistence commit。不得创建 T06 task branch/worktree、调用 Bridge、push、启动 Worker/Supervisor、进入 Formal Review、merge、rebase、reset 或修改 `main`；Contract acceptance 不表示 environment preparation 已完成、Implementation/run-once 已授权或 T06 已 dispatchable。
