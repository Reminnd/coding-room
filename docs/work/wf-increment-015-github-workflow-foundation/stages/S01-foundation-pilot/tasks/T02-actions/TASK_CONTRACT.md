# TASK CONTRACT — T02-actions

## Contract

```yaml
status: Accepted
confirmed_by_user: true
task_id: T02-actions
type: Implementation Task
model_policy: coding_strong
reasoning_effort: medium
fallback_model_policy: none
base_sha: supplied_by_supervisor_at_dispatch
```

## Worker role

You own only the GitHub Actions mechanical control plane. Implement GitHub-native dispatch/verification state transitions around the accepted Stage Router. Actions must never run an LLM, act as formal Reviewer, or become a second scheduler.

Do not perform formal Review and do not modify any path outside this Contract.

## Goal

Migrate `.github/workflows/codex-supervisor-dispatch.yml` away from the old Codex Cloud/manual-dispatch Pilot path into a generic Local Bridge handoff and exact-SHA Stage verification workflow.

## Owned path

Only:

- `.github/workflows/codex-supervisor-dispatch.yml`

## Required architecture

```text
Stage Router / Stage branch facts
→ validate/read Router
→ create or locate Draft Stage PR
→ publish local dispatch-ready state
→ Local Bridge later pushes/integrates Task results
→ mechanically verify Stage candidate
→ ensure verified SHA is still current PR head
→ Ready for Review + chat-review
→ publish CHAT_REVIEW_HANDOFF_V1
```

Actions must not invoke Local Codex directly. Local Bridge discovers GitHub state from the user's machine.

## Mandatory migration behavior

Remove old Current semantics:

- `codex_surface: github_pr_to_codex_cloud`;
- user manual Cloud dispatch instructions;
- Work notification semantics;
- Pilot-only classification tied to `src/cli/status.ts` and `tests/status-cli.test.ts` as Stage completion trigger.

### Dispatch-ready path

When the accepted Stage Router becomes available/changes on the Stage branch:

1. check out the exact triggering SHA;
2. run the dependency-free Router reader against the Stage-level Router;
3. create or locate the Draft Stage PR targeting `main`;
4. keep it Draft during active development;
5. add/use `codex-dispatch-ready`;
6. publish structured handoff facts containing at least repository, workflow ID, Stage ID, Router path, contract commit SHA, Stage branch/head and `execution_surface: local_codex`.

No `@codex` mention and no Cloud dispatch wording.

### Ready invalidation

Any new Stage head after a previously Ready SHA must invalidate stale readiness before the new head can be reviewed:

- convert PR back to Draft if necessary;
- remove `chat-review` if present;
- do not preserve the old ready-for-chat-review claim for the new SHA.

No second Review-state database.

### Candidate verification

Only when accepted GitHub/Bridge handoff facts represent the Stage as `candidate_ready` may Actions run Stage verification.

At minimum verify:

```text
node --test tests/router-contract-reader.test.ts
node --test tools/codex-github-bridge/tests/*.test.mjs
npm run typecheck
npm test
git diff --check
```

After tests pass, re-read the PR's actual current head SHA. Only if `verified_sha == current_pr_head_sha` may the workflow mark Ready, add `chat-review`, and publish `<!-- CHAT_REVIEW_HANDOFF_V1 -->`.

The handoff must include repository, PR number, workflow ID, Stage ID, base branch/SHA, head branch/SHA, Stage Contract and `status: ready_for_chat_review`.

## Permissions

Use minimum token permissions needed for repository read and Stage PR state/comments/labels. Do not request package, deployment, secrets, workflow-write or unrelated permissions.

## Coding plan

1. Read the existing workflow completely and identify old Cloud/Pilot assumptions.
2. Read the accepted Stage Router and Supervisor Router Agent as read-only inputs.
3. Design the minimum transitions for dispatch-ready, stale-Ready invalidation and candidate verification.
4. Keep Actions mechanical; do not duplicate DAG scheduling or Local Bridge logic.
5. Replace product-file classification with Stage/Router/candidate facts.
6. Make exact candidate SHA and PR-head equality an explicit final gate.
7. Audit permissions, shell quoting, branch matching and `gh` commands.
8. Run syntax/path review and `git diff --check`.

## Model-specific guidance

This task uses a strong coding model at medium reasoning. Spend effort on GitHub event/state correctness, exact-SHA race prevention and shell/YAML quoting. Do not build a generalized Actions framework.

## Non-goals

- no Local Bridge source code;
- no Router parser code;
- no docs migration;
- no product Pilot implementation;
- no LLM in Actions;
- no API key;
- no self-hosted runner;
- no webhook/tunnel;
- no auto-review/approve/fix/merge;
- no main write.

## Verification

Required:

```text
git diff --check
mechanical YAML/shell/path audit
```

Use an existing workflow-lint mechanism only if already available; do not add a dependency solely for linting.

## Stop / needs_decision

Return `needs_decision` if accepted behavior requires another workflow file outside scope, a secret/API key, self-hosted infrastructure, Router schema change, Review Authority change, automatic merge or automatic conflict resolution.

## Required Coding Result

```yaml
task_id: T02-actions
dispatch_id: <dispatch id>
reported_base_sha: <dispatch base>
reported_task_head_sha: <worker-reported sha>
changed_files:
  - .github/workflows/codex-supervisor-dispatch.yml
verification:
  diff_check: <pass/fail>
  workflow_audit: <pass/fail + material checks>
status: candidate_ready | blocked | needs_decision
notes: <only material workflow facts>
```

The Supervisor independently re-reads actual Git facts and the complete diff.