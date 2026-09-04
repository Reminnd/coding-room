# Stage 4 No-API-Key Architecture Amendment

| 属性 | 值 |
|---|---|
| 状态 | Approved / User Confirmed |
| 日期 | 2026-09-03 |
| 修订对象 | [Stage 4 Architecture Review](./STAGE_4_GITHUB_CHAT_REVIEW_ARCHITECTURE_REVIEW.md) |

## 决定

Stage 4的Codex执行surface固定为ChatGPT Pro下的Codex Cloud。GitHub Actions只执行确定性的GitHub API、文件解析和测试命令；不持有或使用`OPENAI_API_KEY`，不调用`openai/codex-action`，不运行LLM，也不使用self-hosted runner。

正式Review由ChatGPT fixed Chat完成，正式Review surface为GitHub Pull Request。Actions发布无`@codex` mention的dispatch handoff，由用户按Accepted Supervisor guide显式投递命令。Work只发送通知。

## 后果

- 无API key轮换、LLM billing或模型调用失败处理面。
- Actions不能自动规划、Review、Fix、批准或合并。
- 人工dispatch与Chat Review是预期门禁，不设置fallback或第二权威。
