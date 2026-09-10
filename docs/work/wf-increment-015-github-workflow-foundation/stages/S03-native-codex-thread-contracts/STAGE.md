# STAGE — S03-native-codex-thread-contracts

- work_id: `wf-increment-015-github-workflow-foundation`
- status: `contract_frozen_locally_waiting_for_stage_push_authorization`
- purpose: `synchronize_native_codex_thread_authority`
- goal: 通过一个 docs-owned native Codex Task，把已在 S02 接受并集成的 Worker backend 与 generic Worker Result boundary同步到 exact 6 份 Current/candidate authority文档。
- planning_base_sha: `c6f22fa110076a2784a39702c18a7c6ba99199db`
- stage_branch: `stage/wf-increment-015-github-workflow-foundation/S03-native-codex-thread-contracts`
- dependencies: S02 accepted and integrated at exact GitHub `main` `c6f22fa110076a2784a39702c18a7c6ba99199db`
- current_tasks: [`T06-native-codex-thread-contracts`](./tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md)
- router: [`ROUTER_CONTRACT.md`](./ROUTER_CONTRACT.md)
- supervisor: [`SUPERVISOR_ROUTER_AGENT.md`](./SUPERVISOR_ROUTER_AGENT.md)
- lifecycle: `contract_frozen_local`
- implementation_authorized: `false`
- stage_push_authorized: `false`

## Entry facts

1. T05、T05F00 -005 与 T05F01 -002 的 production changes 已集成。
2. S02 Formal Review repair commits `10b48b42548d5595a27ed41db8423789ea1ac145` 与 `c6f22fa110076a2784a39702c18a7c6ba99199db` 已进入 GitHub `main`；S02 lifecycle 已 resolved。
3. 当前 native Worker 使用 app-server stdio transport、fresh ephemeral task thread、explicit task worktree `cwd`、exact model/effort 与 matching turn terminal evidence；unavailable/rerouted capability以 `needs_decision` 停止，无 `codex exec` Worker fallback。
4. Current generic Worker Result只由 identity、three common lists与status组成；`implementation_ready`另外要求 non-empty `changed_files`。Native execution、Router verification、ownership与candidate identity继续由各自既有authority提供。
5. 当前 planning branch、HEAD 与 clean gate已由Host核对；本Stage尚未push，T06 Contract尚未由用户在exact pushed SHA接受。

## Frozen task and ownership

S03 只有 T06 一个 Task，Router ownership精确为：

- `AGENTS.md`
- `PROJECT_RULES.md`
- `docs/documents/DEVELOPMENT_LOG.md`
- `docs/documents/README.md`
- `docs/documents/STAGE_4_LOCAL_PARALLEL_ARCHITECTURE_AMENDMENT.md`
- `docs/documents/agent-guides/GIT_AND_PARALLEL_WORKFLOW.md`

不允许额外文档、product source、Bridge source、tests、workflow或package变更。S01/S02文件保持immutable history。

## Gate sequence

```text
local T06 Contract freeze commit
→ explicit S03 Stage push authorization
→ existing stage/** Actions validates exact pushed Router/Stage head
→ user accepts exact pushed T06 Contract SHA
→ separate T06 environment preparation and one-shot run authorization
→ native Worker leaves exact docs Diff unstaged
→ Controller verification and exact-path candidate commit
→ Supervisor Integration and controlled cherry-pick
→ Stage candidate verification
→ fixed Chat Formal Review
→ user accepts exact reviewed Stage SHA
→ separately authorized non-force fast-forward to main
```

当前动作止于第一步。不得创建 T06 task branch/worktree、调用 Bridge、push、merge、rebase、reset或修改 `main`。
