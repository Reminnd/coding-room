# Local Parallel Codex — S03 Native Contract Supervisor Router Agent

Owner: Codex。当前 lifecycle：`contract_frozen_locally_waiting_for_stage_push_authorization`。

## Role and authority

Local Bridge owns discovery, DAG/Ready Set scheduling and controlled Git delivery. The native Codex thread is the T06 Worker execution surface. Supervisor Integration only determines `ready_to_integrate | blocked | needs_decision`; fixed Chat remains the sole Formal Review Authority.

The Supervisor must not implement T06, edit authority documents, approve, publish `REQUEST_CHANGES`, merge, modify `main`, broaden ownership or repair a failed Router/Worker result.

## Authoritative inputs

Read exactly:

1. [`ROUTER_CONTRACT.md`](./ROUTER_CONTRACT.md)
2. [`tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md`](./tasks/T06-native-codex-thread-contracts/TASK_CONTRACT.md)
3. actual GitHub/Git facts for repository, exact pushed Stage head, dispatch identity, worktree, changed files, candidate commit and Stage integration
4. native process facts emitted by the integrated app-server Worker boundary

S02 Contracts and review-repair history may establish ancestry but are not active S03 dispatch sources. Native thread/UI history is observation, not persistent workflow authority.

## Preconditions

Before dispatch, all conditions must hold:

- repository Actions settings are already Ready; no bootstrap is required;
- actual GitHub `main` contains exact accepted S02 head `c6f22fa110076a2784a39702c18a7c6ba99199db`;
- S03 branch, branch-derived identity, Router path and normalized Router fields agree;
- the exact S03 Contract bundle has been pushed, mechanically validated and explicitly accepted by the user at that pushed SHA;
- separate authorization exists for T06 task branch/worktree preparation and one `run-once`;
- actual Stage worktree is clean and has no conflicting current dispatch/recovery fact.

Failure returns `needs_decision`. Do not bootstrap, push, create a branch/worktree, replay, repair, rebase or fall back.

## Single-task Ready Set

The only S03 Ready Set is `{T06-native-codex-thread-contracts}`. Its Router `depends_on=[]`; S02 is a Stage prerequisite already present in the accepted main base.

Dispatch T06 through `CodexLauncher.launchWorker` as one fresh native app-server task thread:

- `thread/start`: exact task worktree `cwd`, resolved model, `approvalPolicy=never`, `sandbox=workspace-write`, `ephemeral=true`;
- `turn/start`: the same worktree `cwd`, thread ID, model/effort, `workspaceWrite` with only that worktree writable and network disabled;
- prompt: exact Accepted T06 Contract, dispatch envelope, exact six owned paths and dependency facts;
- subagents: forbidden for T06; no Contract exception is present;
- completion: only the matching thread/turn `final_answer` plus matching terminal `turn/completed` is relevant.

Model reroute, native request failure, missing fresh ephemeral thread/turn identity, missing matching terminal observation, or unsupported terminal status becomes `needs_decision`. Never invoke the legacy `codex exec` Worker path as fallback.

## Generic Worker Result and candidate gate

The Worker final result has only the task-generic required shape frozen by the T06 Contract. `blocked` and `needs_decision` settle before Git observation. `implementation_ready` additionally requires non-empty `changed_files`.

Authority remains separated:

- native thread/turn/status: `processResult.native`;
- verification: Router `task.verification → runVerification()`;
- ownership: Router `owns` + observed working paths + `mechanicalGate()`;
- candidate identity: Controller-observed Git facts after exact-path staging and deterministic commit.

For `implementation_ready`, require exact base/branch, zero pre-existing staged paths, exact six working paths, Worker/observed path equality, ownership, Router verification, post-verification path stability, exact-path candidate commit, candidate-file equality and mechanical gate. Then run Supervisor Integration; only `ready_to_integrate` permits Task push and controlled cherry-pick.

## Stop boundaries

This locally frozen bundle authorizes none of the dispatch or delivery actions above. Until later gates are separately granted, do not push S03, create T06 branch/worktree, invoke `start`/`run-once`, start a Worker/Supervisor, stage implementation files, integrate or publish lifecycle events.

During later execution, conflict means abort the cherry-pick and return `blocked`. Automatic retry, repair, rebase, conflict resolution, force push, formal Review, Stage-to-main write, alternate workflow, hash/patch-id index and local workflow/thread database remain forbidden.
