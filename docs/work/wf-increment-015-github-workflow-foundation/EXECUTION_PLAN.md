# EXECUTION PLAN — wf-increment-015-github-workflow-foundation

- status: `waiting_for_T06_environment_preparation_authorization`
- planning_base: `c6f22fa110076a2784a39702c18a7c6ba99199db`
- repair_parent: `ddbc5a35d734eaca908090013b3ce29202086483`
- accepted_contract_sha: `708462449d73345b0cc3d50ff065c743a4896960`
- stage: `S03-native-codex-thread-contracts`
- stage_branch: `stage/wf-increment-015-github-workflow-foundation/S03-native-codex-thread-contracts`
- router: [`S03 Stage Router`](./stages/S03-native-codex-thread-contracts/ROUTER_CONTRACT.md)
- current_tasks: `T06-native-codex-thread-contracts`
- fix_policy: `always_confirm`

S01 与 S02 是 immutable accepted/integrated history。S03 的 Ready Set 仅含 T06；其跨 Stage prerequisite 是 S02 exact accepted/integrated `main=c6f22fa110076a2784a39702c18a7c6ba99199db`，因此 Router 内 `depends_on=[]`。T06 使用当前 native Codex task-thread backend，并同步 exact 14 个 future Worker-owned documents。本次 `S03CF01` 仅修复 6 个既有 freeze/governance files，不改变 future T06 ownership。

S03 Stage 与 Draft PR #7 已建立；remote candidate `ddbc5a35d734eaca908090013b3ce29202086483` 是未接受的历史。`S03CF01` repaired Contract 已由用户在 exact Stage SHA `708462449d73345b0cc3d50ff065c743a4896960` 接受。当前 lifecycle gate 为 `waiting_for_T06_environment_preparation_authorization`；Contract acceptance 不授权 environment preparation、T06 task branch/worktree、Local Bridge `start`/`run-once`、Worker、Supervisor execution、Formal Review、Task/Stage push、merge 或 main write。本次 acceptance persistence commit 只记录已发生事实，仍需单独的 Stage push authorization。

Repository 已 Ready；不得再次 bootstrap。Normal `start`/`run-once` 继续只做 read-only prerequisite checks，不得 silent bootstrap、fallback、replay S02，或把 Contract acceptance、尚未 push 的 acceptance persistence commit 当作 environment preparation 或 dispatch authority。
