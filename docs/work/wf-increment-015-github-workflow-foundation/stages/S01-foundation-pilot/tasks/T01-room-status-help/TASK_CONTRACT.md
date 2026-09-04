# Task Contract — T01-room-status-help

> Status: **Deferred / Superseded for current S01 dispatch**. Not part of the active Foundation task set.

| 字段 | 值 |
|---|---|
| status | Deferred / Superseded for current S01 dispatch |
| confirmed_by_user | true |
| task_id | T01-room-status-help |
| type | Implementation Task |

## Background

这是Increment 15的真实Pilot，用一个最小CLI行为验证GitHub Plan/Contract/Actions/Codex Cloud/PR/Chat Review闭环。

## Goal

为`room:status`增加无副作用的`--help`。

## Requirements

运行`npm run room:status -- --help`必须：

- stdout精确为：

```text
Usage:
  npm run room:status -- --db <path> --room-id <id>

Options:
  --db <path>       Agent Room SQLite database path.
  --room-id <id>    Room ID to display.
  --help            Show this help message.
```

（最后有一个newline。）
- exit code为`0`且stderr为空。
- `--help`不要求`--db`或`--room-id`，不打开SQLite、不读Room、不创建文件、不修改状态。

## Architecture decisions

Review Authority为ChatGPT fixed Chat，Review surface为GitHub PR。Actions只机械验证；`fix_policy=always_confirm`。

## Scope

只允许修改：

- `src/cli/status.ts`
- `tests/status-cli.test.ts`

## Non-goals与Constraints

不修改其它路径、Room protocol/schema/migration、package manifests或dependency；不重构CLI，不增加fallback、自愈或抽象。本Bootstrap不实现本Task。

## Acceptance criteria

精确stdout、exit 0、空stderr、参数独立和零SQLite/Room/filesystem副作用均由`tests/status-cli.test.ts`直接覆盖。

## Verification

| command | detects | decision_if_failed |
|---|---|---|
| `node --test tests/status-cli.test.ts` | public CLI help与既有status行为 | 不交付 |
| `npm run typecheck` | TypeScript边界 | 不交付 |
| `npm test` | 全量回归 | 不交付 |
| `git diff --check` | patch whitespace | 不交付 |

## Documentation updates

无；行为已由本Accepted Contract冻结。

## Question policy

若正确实现需要突破两文件scope或改变冻结public behavior，停止并返回`needs_decision`；不得自行改写Contract。
