# Increment 15 Revision 2 — GitHub Workflow Foundation Task Contract

| 字段 | 值 |
|---|---|
| status | Accepted / PLAN_READY |
| confirmed_by_user | true |
| task_id | increment-015-revision-2-bootstrap |
| type | one-time bootstrap |
| baseline | `d5827a052190d63fb2fbbd9fbd970ba9db92ed64` |

## Background与Goal

在不改变Agent Room产品能力的前提下，一次性建立GitHub机械Supervisor控制面、文档分层、Router reader与Increment 15真实Pilot Contract，使后续闭环可以从Accepted Git事实显式派发。

## Requirements

1. 建立已批准Architecture Review、No-API-Key Amendment、长期Authority与`docs/work/`实例文档。
2. Router只有一个marker与一个JSON fenced block；Git SHA来自实际Git事实而非静态Contract。
3. Actions处理Router dispatch push与Pilot代码push，创建/更新Draft Stage PR、机械验证、Ready for Review、label及handoff；不得运行LLM。
4. Pilot冻结`room:status --help`行为，但Bootstrap不实现Pilot。

## Architecture decisions

Review Authority=`chatgpt_fixed_chat`；transport=`github_pull_request`；Codex surface=`github_pr_to_codex_cloud`；Work=`notification_only`；`fix_policy=always_confirm`。Stage integration + Task/Subtask branch；单写入Task不拆Subtask。最终main集成为exact accepted SHA的non-force fast-forward。

## Scope

本Contract列明的Authority文档、Agent guides、`docs/work/`、`.github/scripts/read-router-contract.mjs`、其直接测试及`.github/workflows/codex-supervisor-dispatch.yml`。

## Non-goals与Constraints

不修改`src/cli/status.ts`、`tests/status-cli.test.ts`、其它`src/**`、package manifests、Room schema/protocol/migration。不新增dependency、daemon、registry、database、provider abstraction或fallback。不调用OpenAI API/Codex，不自动Fix/approve/merge/rebase/conflict resolution。

## Acceptance criteria

- Router reader的正反例测试通过，normalized output不含静态SHA。
- Actions权限最小且两个push路径行为符合Architecture Review。
- 文档链接、状态、目录Authority和Increment 14最终状态一致。
- Pilot Contract精确冻结help stdout/exit/stderr/零SQLite副作用和两文件scope。

## Verification

`node --test tests/router-contract-reader.test.ts`、`npm run typecheck`、`npm test`、`git diff --check`，并做相对链接、merge marker、目录/状态一致性检查。任一失败均不得push。

## Documentation updates

更新本Contract列出的全部Authority、guide与workflow文档；本Bootstrap完成后记录commit、branch、push及PR事实。

## Question policy

只有实现必须改变冻结Architecture、Git策略、permission、dependency、Room schema/protocol或Pilot public behavior时返回`needs_decision`；否则按Contract执行。
