# ChatGPT / GitHub正式Review指南

| 属性 | 值 |
|---|---|
| 状态 | Current |
| Review Authority | ChatGPT fixed Chat |
| Review surface | GitHub Pull Request |

## 入口与证据

正式Review只在固定Chat中进行，并以GitHub PR持久化完整base/head Diff、Accepted Contract、Checks与handoff。Reviewer核对PR的actual base/head SHA、完整task-owned Diff和机械验证；不可用Supervisor自述、Work通知或Actions评论替代Git事实。

## 决策

输出`approved`、`changes_requested`或`needs_discussion`。Supervisor不得approve或merge。任何finding先进入用户讨论；`fix_policy=always_confirm`要求用户确认最小方案后才能形成Fix。Review结论及accepted head回写GitHub持久化面。

## 集成

用户明确接受后，只允许将`main` non-force fast-forward到exact `accepted_head_sha`。不自动rebase、解冲突、force push或创建integration merge commit；真实失败立即停止。最终FF不重复Review，因为reviewed immutable SHA未改变。
