# EXECUTION PLAN — wf-increment-015-github-workflow-foundation

- status: `contract_frozen_locally_waiting_for_s03_stage_push_authorization`
- planning_base: `c6f22fa110076a2784a39702c18a7c6ba99199db`
- stage: `S03-native-codex-thread-contracts`
- stage_branch: `stage/wf-increment-015-github-workflow-foundation/S03-native-codex-thread-contracts`
- router: [`S03 Stage Router`](./stages/S03-native-codex-thread-contracts/ROUTER_CONTRACT.md)
- current_tasks: `T06-native-codex-thread-contracts`
- fix_policy: `always_confirm`

S01 与 S02 是 immutable accepted/integrated history。S03 的 Ready Set 仅含 T06；其跨 Stage prerequisite 是 S02 exact accepted/integrated `main=c6f22fa110076a2784a39702c18a7c6ba99199db`，因此 Router 内 `depends_on=[]`。T06 使用当前 native Codex task-thread backend，并只同步 exact 6 governance files。

当前 gate 顺序固定为：local Contract freeze → 单独 Stage push authorization → existing `stage/**` Actions Router validation/handoff → user acceptance of exact pushed Contract SHA → separate T06 environment/`run-once` authorization → native Worker → Controller candidate commit → Supervisor Integration → Stage verification → fixed Chat Formal Review → exact-SHA user acceptance → non-force fast-forward。当前 freeze 不跨越任何后续 gate。

Repository 已 Ready；不得再次 bootstrap。Normal `start`/`run-once` 继续只做 read-only prerequisite checks，不得 silent bootstrap、fallback、replay S02 或把本地 Contract commit 当作 dispatch authority。
