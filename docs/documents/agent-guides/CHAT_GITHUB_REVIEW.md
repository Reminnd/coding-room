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

## Increment 16 lifecycle

`CHAT_REVIEW_HANDOFF_V1`只把 exact PR/base/head、Stage/Router path与PASS verification交给 Fixed Chat，不是 Review decision。Fixed Chat以 caller-supplied closed `source_reference={source_kind, decision_reference}`记录`FORMAL_REVIEW_V1`；不得由Actions comment、label、author或comment order推断。`PASS`必须具有显式空 findings，`REQUEST_CHANGES`必须具有非空且唯一 findings。

`REQUEST_CHANGES`后，只有用户确认 exact solution才能记录`FIX_ROUND_OPENED_V1`并执行`prepare-fix`。Fix顺序固定为 verification → exact `STAGE_VERIFICATION_V1` PASS → Fix handoff → 用户的 typed `FIX_BUNDLE_ACCEPTANCE_V1`；Actions在 handoff后停止且不启动 Worker。`record-acceptance --record-type`无默认值，只接受`FIX_BUNDLE_ACCEPTANCE_V1`与`STAGE_ACCEPTANCE_V1`，identity为`[record_type, acceptance_id]`，跨类型相同 scalar ID也不相等。

Formal Review PASS、`STAGE_ACCEPTANCE_V1`与`STAGE_CLOSURE_AUTHORIZATION_V1`仍是三个独立决定；只有最后一项授权 exact expected-main/accepted-Stage non-force closure。Increment 16 已整合；本次委托下实际采用的 manual non-Router closure 见 [closure](../INCREMENT_16_CLOSURE.md)，不得把它伪装成此处 frozen record。
