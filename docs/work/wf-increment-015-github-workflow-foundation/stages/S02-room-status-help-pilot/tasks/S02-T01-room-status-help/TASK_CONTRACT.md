# Task Contract — S02-T01-room-status-help

| 字段 | 值 |
|---|---|
| status | Draft / WAITING_FOR_USER_CONFIRMATION |
| confirmed_by_user | false |
| type | Implementation Task |
| task_id | `S02-T01-room-status-help` |
| parent_stage | `S02-room-status-help-pilot` |
| planning_base_sha | `bd41ea8a1e259300241a345a659e7da90e24af0d` |
| runtime_base_sha | Local Bridge 在获准 dispatch 时从 actual Stage head 读取 |
| depends_on | none |
| model_policy | `coding_strong` |
| reasoning_effort | `medium` |

## Background

Increment 15 S01 已 `accepted_and_integrated`。此前为 S01 dispatch 延后的 `room:status --help` public behavior 现迁移为 S02 的首个正常 Local Bridge / stage-generic Actions Pilot。本 Contract 是新的 S02 Stage-level execution authority；S01 旧 Router 仍为 superseded history，不重新启用。

## Goal

为 `room:status` 增加无副作用的 `--help`，并以现有正常 Stage candidate verification 路径形成可供 fixed Chat Review 的 exact-SHA candidate。

## Requirements

运行 `npm run room:status -- --help` MUST：

- stdout 精确为以下文本，并在最后包含一个 newline：

```text
Usage:
  npm run room:status -- --db <path> --room-id <id>

Options:
  --db <path>       Agent Room SQLite database path.
  --room-id <id>    Room ID to display.
  --help            Show this help message.
```

- exit code 为 `0`；
- stderr 为空；
- 不要求 `--db` 或 `--room-id`；
- 不打开 SQLite、不读取 Room、不创建文件、不修改 filesystem 或 durable state；
- 保持既有非 `--help` status CLI behavior 不变。

## Architecture decisions

- Review Authority=`chatgpt_fixed_chat`，Review surface=`github_pull_request`。
- GitHub Actions 只执行机械验证；Supervisor Integration 不是 formal Review。
- Task-to-Stage 使用 controlled cherry-pick；Stage-to-main 仅可在未来用户接受 exact Stage SHA 后 non-force fast-forward。
- `fix_policy=always_confirm`。
- 复用 `node:util` `parseArgs` 所在 CLI boundary；除非现有实现事实证明无法满足冻结行为，不新增 parser abstraction、dependency、fallback 或 compatibility layer。

## Scope and owns

只允许修改：

- `src/cli/status.ts`
- `tests/status-cli.test.ts`

## Constraints

- 必须从 dispatch 时 Local Bridge 读取的 actual Stage SHA 创建 Task branch/worktree；静态 Contract 不声明 runtime Git SHA。
- Task commit MUST 恰有一个 parent，且 parent 等于 dispatch `base_sha`；commit 必须只包含 owned paths并符合 Conventional Commits。
- 不得修改 S01、`F05`/`F06`/`F07`/`F08`、其它 source/test、package manifests、Room protocol/schema/migration、workflow、Bridge 或长期文档。
- 不得实现 formal Review、merge、rebase、force push、自动冲突处理、hash index、patch-id index或其它架构扩展。
- 不得使用 S01 Bootstrap-B；candidate 必须经现有唯一 `stage/**` workflow 的正常 `stage_candidate_ready` verification 路径。

## Non-goals

- 不重构 Status CLI。
- 不改变 status JSON、error wording 或非 `--help` 参数语义。
- 不新增 CLI command、dependency、configuration、database、state、Event 或 telemetry。
- 不修改文档；冻结 public behavior 由本 Accepted predecessor requirement 与本 S02 Contract 表达。

## Acceptance criteria

1. `npm run room:status -- --help` 的 stdout 与 Requirements 中 literal 完全一致，最后恰有一个 newline。
2. 该命令 exit `0` 且 stderr 为空。
3. `--help` 单独运行，不要求 `--db`/`--room-id`。
4. public child-process regression 证明 `--help` 不打开 SQLite、不读 Room、不创建文件、不改变 durable state。
5. 既有 `room:status` success/error/read-only regressions 保持通过。
6. actual Task commit 只包含两个 owned files；正常 Local Bridge gate 记录 exact source Task SHA 与 Stage integration SHA。
7. exact Stage candidate 通过现有 stage-generic Actions verification，并形成 fixed Chat handoff；Bootstrap-B 未被使用。

## Verification

| command | detects | decision_if_failed |
|---|---|---|
| `node --test tests/status-cli.test.ts` | `--help` public child-process output/exit/stderr/argument independence/zero-side-effect，以及既有 status behavior | `blocked`；不交付、不集成 |
| `npm run typecheck` | TypeScript public CLI boundary 与 test compile assumptions | `blocked`；不交付、不集成 |
| `npm test` | repository full regression | `blocked`；不交付、不集成 |
| `git diff --check` | Task commit whitespace error | `blocked`；不交付、不集成 |
| existing `stage/**` Actions candidate verification | exact Stage SHA、Router/event/PR identity、focused Bridge/Router tests、typecheck/full test及 stale-head gate | 不进入 `ready_for_chat_review` |

## Documentation updates

`none`。若实现必须改变冻结 public behavior、Scope、架构、协议或运维语义，返回 `needs_decision`，不得自行修改文档。

## Question policy

仅当满足冻结行为必须突破两个 owned paths、改变 public behavior、引入 dependency、改变 Room protocol/schema/migration，或正常 Actions candidate path不可用时返回 `needs_decision`。其它实现选择保持在本 Contract 内。

## Required Coding Result

```yaml
status: candidate_ready | blocked | needs_decision
task_id: S02-T01-room-status-help
summary: <implemented behavior or blocking fact>
task_head_sha: <actual Git SHA>
parent_sha: <actual dispatch base SHA>
changed_files:
  - <owned path>
verification:
  - command: <exact command>
    exit_code: <integer>
    result: <concise observed result>
deviations: <none or exact deviation>
documentation_changes: none
unresolved: <none or exact blocker>
questions: <none or exact decision needed>
```
