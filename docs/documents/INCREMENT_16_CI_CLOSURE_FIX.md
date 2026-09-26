# Increment 16 CI closure fix

| Field | Value |
|---|---|
| task_id | F16-ci-closure |
| type | Fix Task |
| Status | Accepted under user-delegated delivery authority |
| review_id | local-inc16-ci-diagnosis-20260927 |
| review_fixes_only | true |
| baseline_head | bcff0fe5fc1d8e6cda61de2b835dacdc13e5fef8 |

## Background and goal

The actual Ubuntu Actions runs fail at the canonical handoff exact-comment comparison and CLI fixture absolute-path validation. Restore passing CI for the supported Windows local/Linux CI workflow with minimal changes.

## Confirmed findings and solution

1. `.github/workflows/codex-supervisor-dispatch.yml` assigns a file to a shell variable using command substitution, removing terminal LF characters. GitHub's saved comment retains its terminal LF. The exact equality check then reports failure after a successful publication. Normalize only terminal LF consistently at each repeated exact-comment comparison, retain duplicate/conflicting-payload rejection, and preserve internal whitespace/content.
2. `tools/codex-github-bridge/tests/cli.test.mjs:57` uses the production Windows executable constant in a parser test that runs on Linux. Use a platform-valid absolute fixture for parsing, keeping real executable policy and production absolute-path validation unchanged.

## Scope

Owned paths:
- `.github/workflows/codex-supervisor-dispatch.yml`
- `tools/codex-github-bridge/tests/cli.test.mjs`
- `tests/stage-contract-selector.test.ts`
- `tests/plugin-packaging.test.ts`

Controller extension under the user's continuous delivery authorization: the full Windows suite exposed six existing packaging fixture failures with `core.autocrlf=true`. Normalize CRLF at the test's Markdown text reader before its LF-specific grammar checks. Preserve all packaging assertions and production files.

The last file may receive focused regression evidence for comment normalization if it fits the existing suite. No production Bridge, Room protocol, database, dependency, schema, model policy or unrelated documentation changes.

## Architecture decisions and constraints

Reuse existing Actions publication logic. Do not introduce generalized publication infrastructure or weaken conflict detection. No subagents, Git staging/commit/push, branch changes or remote mutations by the Worker. The controller owns Git delivery. Existing task-scoped authorization is documented in ROOM_UI_DELIVERY_PLAN.md and supersedes repetitive approval requests for this fix.

## Acceptance and verification

- Saved comments with a terminal LF compare equal to the shell-captured body; identical retries create no duplicates; genuinely different bodies and duplicate records still fail.
- The supervise-only parser accepts the current platform's absolute fixture and still rejects missing/relative executable arguments.
- `node --test tools/codex-github-bridge/tests/cli.test.mjs` detects parser fixture/validation regressions; failure blocks delivery.
- `node --test tests/stage-contract-selector.test.ts` detects selector/publication regressions; failure blocks delivery.
- `git diff --check` detects patch whitespace errors; repair before handoff.
- Controller will run complete Bridge tests, typecheck, full tests and real Ubuntu Actions after delivery. Worker must not claim Ubuntu validation without having run it.

## Documentation updates and question policy

Controller records actual results and closure in Development Log after verification. Worker changes no documentation. Resolve routine implementation choices within scope; return needs_decision only for a substantive contradiction or required scope expansion.

## Required Coding Result

Return JSON with task_id, dispatch_id, reported_base_sha, deviations, unresolved, questions, status; implementation_ready additionally requires exact nonempty changed_files. Leave changes unstaged. Do not self-report a candidate commit or formal approval.
