# Stage 4 No-API-Key Architecture Amendment

| 属性 | 值 |
|---|---|
| 状态 | Superseded（2026-09-04） |
| 日期 | 2026-09-03 |
| 修订对象 | [Stage 4 Architecture Review](./STAGE_4_GITHUB_CHAT_REVIEW_ARCHITECTURE_REVIEW.md) |

## 决定

No-API-Key 约束继续有效，但执行面已迁移至 Local Codex + Local Bridge；Current 方案见 [Stage 4 Local Parallel amendment](./STAGE_4_LOCAL_PARALLEL_ARCHITECTURE_AMENDMENT.md)。

正式Review由ChatGPT fixed Chat完成，正式Review surface为GitHub Pull Request。Actions发布无`@codex` mention的dispatch handoff，由用户按Accepted Supervisor guide显式投递命令。Work只发送通知。

## 后果

- 无API key轮换、LLM billing或模型调用失败处理面。
- Actions不能自动规划、Review、Fix、批准或合并。
- 人工dispatch与Chat Review是预期门禁，不设置fallback或第二权威。
