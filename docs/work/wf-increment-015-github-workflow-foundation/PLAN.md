# PLAN — wf-increment-015-github-workflow-foundation

| 字段 | 值 |
|---|---|
| status | Accepted |
| goal | 证明GitHub Plan/Contract/Actions/Codex Cloud/PR/Chat Review闭环 |
| pilot | 为`room:status`增加`--help` |

本Bootstrap只建立Foundation和Accepted Pilot Contract，**禁止实现Pilot代码**。后续Pilot从Stage branch派发到唯一Task branch，经Codex Cloud Coding、Stage PR机械检查和ChatGPT fixed Chat正式Review完成闭环。Work只通知；Actions不运行LLM。

Stages：[`S01-foundation-pilot`](./stages/S01-foundation-pilot/STAGE.md)。最终接受后只允许把`main` non-force fast-forward到exact `accepted_head_sha`。
