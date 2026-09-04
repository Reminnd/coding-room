# Stage 4 — GitHub / Chat Review Architecture Review

| 属性 | 值 |
|---|---|
| 状态 | Superseded（2026-09-04） |
| 日期 | 2026-09-03 |
| Owner | Codex |
| 决策范围 | 项目开发控制面；不替换 Agent Room 产品运行时 |

## 结论

本文件保留 PR #3 的历史 Cloud/Work 方案证据。Current 执行架构见 [Stage 4 Local Parallel amendment](./STAGE_4_LOCAL_PARALLEL_ARCHITECTURE_AMENDMENT.md)。

## 边界与数据流

```text
Accepted Plan/Contract in GitHub
→ mechanical Actions dispatch handoff
→ user posts accepted dispatch command to Codex Cloud
→ task branch result enters Stage branch
→ mechanical verification
→ GitHub PR CHAT_REVIEW_HANDOFF
→ ChatGPT fixed Chat formal review
→ user-confirmed fix when needed
→ exact accepted_head_sha non-force fast-forward to main
```

- Stage integration branch承载一个Stage；Task/Subtask branch承载具体Coding。单写入Task不拆Subtask。
- `fix_policy=always_confirm`；Supervisor不得批准、合并或自动Fix。
- 最终集成只能把`main` non-force fast-forward到exact `accepted_head_sha`；不自动rebase、不解冲突、不force push、不创建integration merge commit，最终FF后不重复Review。
- 外部边界只验证Git、GitHub、Router文本/JSON、filesystem、Actions event/API与外部配置。typed内部对象、框架/事务保证及immutable Git SHA受信任。

## Authority

Room SQLite继续且只拥有Agent Room产品运行时的Run、RunAttempt及关联产品事实。现有Room能力不删除；Stage 1–3历史Accepted成果继续有效。Room不再是项目开发Plan、Contract或Review Authority。

## 非目标

不建立daemon、queue database、webhook receiver、provider registry、第二Review Authority、automatic Fix或LLM Actions runner；不使用self-hosted runner、`OPENAI_API_KEY`或`openai/codex-action`。
