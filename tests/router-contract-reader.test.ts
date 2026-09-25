import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
// @ts-expect-error The GitHub Actions boundary is intentionally a dependency-free .mjs script.
import { readRouterContract } from '../.github/scripts/read-router-contract.mjs';

const readerPath = fileURLToPath(new URL('../.github/scripts/read-router-contract.mjs', import.meta.url));
const acceptedRouterPath = fileURLToPath(new URL(
  '../docs/work/wf-increment-015-github-workflow-foundation/stages/S01-foundation-pilot/ROUTER_CONTRACT.md',
  import.meta.url,
));
const increment16RouterPath = fileURLToPath(new URL(
  '../docs/work/wf-increment-016-github-review-fix-acceptance-closure/stages/S01-review-fix-acceptance-closure/ROUTER_CONTRACT.md',
  import.meta.url,
));

// 该期望值是冻结的独立 Oracle；不得从被测 Router 或生产 reader 派生。
const expectedIncrement16Router = {
  contract_type: 'router',
  contract_version: 1,
  status: 'dispatch_ready',
  workflow_id: 'wf-increment-016-github-review-fix-acceptance-closure',
  stage_id: 'S01-review-fix-acceptance-closure',
  repository: 'Reminnd/coding-room',
  stage_branch: 'stage/wf-increment-016-github-review-fix-acceptance-closure/S01-review-fix-acceptance-closure',
  scheduler: {
    mode: 'dependency_dag',
    primary_objective: 'minimize_wall_clock_time',
    safe_parallelism_first: true,
    ready_set: 'all_dependencies_integrated_and_owned_paths_non_overlapping',
    integration_order_when_simultaneously_eligible: ['topological_priority', 'task_id'],
  },
  tasks: [
    {
      task_id: 'T01-review-fix-lifecycle-core',
      dispatch_id: 'wf16-s01-t01-review-fix-lifecycle-core-001',
      task_contract_path: 'docs/work/wf-increment-016-github-review-fix-acceptance-closure/stages/S01-review-fix-acceptance-closure/tasks/T01-review-fix-lifecycle-core/TASK_CONTRACT.md',
      task_branch: 'task/wf-increment-016-github-review-fix-acceptance-closure/T01-review-fix-lifecycle-core',
      depends_on: [],
      owns: [
        'tools/codex-github-bridge/structured-records.mjs',
        'tools/codex-github-bridge/lifecycle.mjs',
        'tools/codex-github-bridge/tests/structured-records.test.mjs',
        'tools/codex-github-bridge/tests/lifecycle.test.mjs',
        'tools/codex-github-bridge/cli.mjs',
        'tools/codex-github-bridge/github.mjs',
        'tools/codex-github-bridge/git.mjs',
        'tools/codex-github-bridge/controller.mjs',
        'tools/codex-github-bridge/codex.mjs',
        'tools/codex-github-bridge/index.mjs',
        'tools/codex-github-bridge/tests/cli.test.mjs',
        'tools/codex-github-bridge/tests/github.test.mjs',
        'tools/codex-github-bridge/tests/git.test.mjs',
        'tools/codex-github-bridge/tests/controller.test.mjs',
        'tools/codex-github-bridge/tests/codex.test.mjs',
      ],
      model_policy: 'coding_strong',
      reasoning_effort: 'high',
      fallback_model_policy: null,
      verification: [
        'node --test tools/codex-github-bridge/tests/structured-records.test.mjs tools/codex-github-bridge/tests/lifecycle.test.mjs',
        'node --test tools/codex-github-bridge/tests/cli.test.mjs tools/codex-github-bridge/tests/github.test.mjs tools/codex-github-bridge/tests/git.test.mjs tools/codex-github-bridge/tests/controller.test.mjs tools/codex-github-bridge/tests/codex.test.mjs',
        'npm run typecheck',
        'npm test',
        'git diff --check',
      ],
    },
    {
      task_id: 'T02-review-fix-actions-selector',
      dispatch_id: 'wf16-s01-t02-review-fix-actions-selector-001',
      task_contract_path: 'docs/work/wf-increment-016-github-review-fix-acceptance-closure/stages/S01-review-fix-acceptance-closure/tasks/T02-review-fix-actions-selector/TASK_CONTRACT.md',
      task_branch: 'task/wf-increment-016-github-review-fix-acceptance-closure/T02-review-fix-actions-selector',
      depends_on: ['T01-review-fix-lifecycle-core'],
      owns: [
        '.github/scripts/read-router-contract.mjs',
        '.github/scripts/select-stage-contract.mjs',
        '.github/workflows/codex-supervisor-dispatch.yml',
        'tests/router-contract-reader.test.ts',
        'tests/stage-contract-selector.test.ts',
      ],
      model_policy: 'coding_strong',
      reasoning_effort: 'high',
      fallback_model_policy: null,
      verification: [
        'node --test tests/router-contract-reader.test.ts',
        'node --test tests/router-contract-reader.test.ts tests/stage-contract-selector.test.ts',
        'npm run typecheck',
        'npm test',
        'git diff --check',
      ],
    },
    {
      task_id: 'T03-review-fix-documentation',
      dispatch_id: 'wf16-s01-t03-review-fix-documentation-001',
      task_contract_path: 'docs/work/wf-increment-016-github-review-fix-acceptance-closure/stages/S01-review-fix-acceptance-closure/tasks/T03-review-fix-documentation/TASK_CONTRACT.md',
      task_branch: 'task/wf-increment-016-github-review-fix-acceptance-closure/T03-review-fix-documentation',
      depends_on: ['T02-review-fix-actions-selector'],
      owns: [
        'AGENTS.md',
        'PROJECT_RULES.md',
        'docs/documents/README.md',
        'docs/documents/ARCHITECTURE.md',
        'docs/documents/DEVELOPMENT_LOG.md',
        'docs/documents/MVP_PLAN.md',
        'docs/documents/OPERATIONS.md',
        'docs/documents/STAGE_4_LOCAL_PARALLEL_ARCHITECTURE_AMENDMENT.md',
        'docs/documents/agent-guides/README.md',
        'docs/documents/agent-guides/CODEX_REVIEW_AND_PLANNING.md',
        'docs/documents/agent-guides/GIT_AND_PARALLEL_WORKFLOW.md',
        'docs/documents/agent-guides/CHAT_GITHUB_REVIEW.md',
        'docs/work/README.md',
        'docs/work/_templates/ROUTER_CONTRACT_TEMPLATE.md',
        'docs/work/_templates/TASK_CONTRACT_TEMPLATE.md',
        'docs/work/_templates/FIX_TEMPLATE.md',
        'docs/work/_templates/STAGE_TEMPLATE.md',
        'docs/work/_templates/CHAT_REVIEW_HANDOFF_TEMPLATE.md',
      ],
      model_policy: 'coding_strong',
      reasoning_effort: 'high',
      fallback_model_policy: null,
      verification: [
        'git diff --check',
        'npm run typecheck',
        'npm test',
        'relative Markdown link and Documentation Map audit',
        'decision/mechanical/handoff, Router-mode, four-command, lifecycle-order and failure-semantics audit',
        'merge marker audit',
      ],
    },
  ],
  integration: {
    task_to_stage: 'controlled_cherry_pick',
    record_mapping: ['task_id', 'source_task_sha', 'stage_commit_sha'],
    automatic_rebase: false,
    automatic_conflict_resolution: false,
    force: false,
  },
  review: {
    authority: 'chatgpt_fixed_chat',
    transport: 'github_pull_request',
    supervisor_may_approve: false,
    supervisor_may_merge: false,
  },
  fix_policy: { mode: 'always_confirm' },
  execution: { primary_surface: 'local_codex', cloud_primary: false, work: 'removed', local_state_database: false },
};

const task = (taskId: string, dispatchId: string, owns: string[], dependsOn: string[] = []) => ({
  task_id: taskId,
  dispatch_id: dispatchId,
  task_contract_path: `docs/work/tasks/${taskId}/TASK_CONTRACT.md`,
  task_branch: `task/workflow/${taskId}`,
  depends_on: dependsOn,
  owns,
  model_policy: 'coding_strong',
  reasoning_effort: 'high',
  fallback_model_policy: null,
  verification: ['node --test tests/example.test.ts'],
});

const valid = {
  contract_type: 'router',
  contract_version: 1,
  status: 'dispatch_ready',
  workflow_id: 'workflow',
  stage_id: 'S01',
  repository: 'owner/repository',
  stage_branch: 'stage/workflow/S01',
  scheduler: {
    mode: 'dependency_dag',
    primary_objective: 'minimize_wall_clock_time',
    safe_parallelism_first: true,
    ready_set: 'all_dependencies_integrated_and_owned_paths_non_overlapping',
    integration_order_when_simultaneously_eligible: ['topological_priority', 'task_id'],
  },
  tasks: [task('T01', 'dispatch-1', ['src/one.ts']), task('T02', 'dispatch-2', ['src/two.ts'], ['T01'])],
  integration: {
    task_to_stage: 'controlled_cherry_pick',
    record_mapping: ['task_id', 'source_task_sha', 'stage_commit_sha'],
    automatic_rebase: false,
    automatic_conflict_resolution: false,
    force: false,
  },
  review: {
    authority: 'chatgpt_fixed_chat',
    transport: 'github_pull_request',
    supervisor_may_approve: false,
    supervisor_may_merge: false,
  },
  fix_policy: { mode: 'always_confirm' },
  execution: { primary_surface: 'local_codex', cloud_primary: false, work: 'removed', local_state_database: false },
};

const document = (value: unknown = valid) => `# Router\n\n<!-- ROUTER_CONTRACT_V1 -->\n\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n`;
const clone = () => structuredClone(valid);

test('reads the accepted Stage Routers without losing frozen fields', () => {
  const result = readRouterContract(readFileSync(acceptedRouterPath, 'utf8'));
  assert.equal(result.workflow_id, 'wf-increment-015-github-workflow-foundation');
  assert.deepEqual(result.tasks.map((entry: { task_id: string }) => entry.task_id), ['T01-router', 'T02-actions', 'T03-docs', 'T04-bridge']);
  assert.deepEqual(readRouterContract(readFileSync(increment16RouterPath, 'utf8')), expectedIncrement16Router);
});

test('CLI emits one normalized JSON line for one path argument', () => {
  const result = spawnSync(process.execPath, [readerPath, acceptedRouterPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.endsWith('\n'), true);
  assert.equal(result.stdout.trim().split(/\r?\n/).length, 1);
  assert.equal(JSON.parse(result.stdout).tasks.length, 4);
});

test('rejects missing or duplicate markers and extra fenced blocks', () => {
  assert.throws(() => readRouterContract(document().replace('<!-- ROUTER_CONTRACT_V1 -->', '')), /exactly one.*marker/);
  assert.throws(() => readRouterContract(`${document()}\n<!-- ROUTER_CONTRACT_V1 -->`), /exactly one.*marker/);
  assert.throws(() => readRouterContract(document().replace('```json', '```text')), /exactly one JSON/);
  assert.throws(() => readRouterContract(`${document()}\n\`\`\`text\nextra\n\`\`\``), /exactly one JSON/);
  assert.throws(() => readRouterContract(`${document()}\n~~~text\nextra\n~~~`), /exactly one JSON/);
});

test('accepts a JSON fenced block with CRLF line endings', () => {
  assert.equal(readRouterContract(document().replaceAll('\n', '\r\n')).tasks.length, 2);
});

test('rejects malformed JSON and non-object roots', () => {
  assert.throws(() => readRouterContract(document().replace(JSON.stringify(valid), '{')), /malformed JSON/);
  for (const value of [null, [], 'router']) assert.throws(() => readRouterContract(document(value)), /root must be an object/);
});

test('rejects wrong fixed contract fields', () => {
  for (const [field, value] of [['contract_type', 'task'], ['contract_version', 2], ['status', 'draft']] as const) {
    assert.throws(() => readRouterContract(document({ ...valid, [field]: value })), new RegExp(field));
  }
});

test('rejects missing or empty repository, workflow, Stage, and branch fields', () => {
  for (const field of ['repository', 'workflow_id', 'stage_id', 'stage_branch'] as const) {
    assert.throws(() => readRouterContract(document({ ...valid, [field]: '  ' })), new RegExp(`${field} is required`));
  }
});

test('rejects a missing or empty task list', () => {
  assert.throws(() => readRouterContract(document({ ...valid, tasks: undefined })), /tasks must be a non-empty array/);
  assert.throws(() => readRouterContract(document({ ...valid, tasks: [] })), /tasks must be a non-empty array/);
});

test('rejects duplicate task and dispatch IDs', () => {
  const duplicateTask = clone();
  duplicateTask.tasks[1].task_id = duplicateTask.tasks[0].task_id;
  assert.throws(() => readRouterContract(document(duplicateTask)), /duplicate task_id/);
  const duplicateDispatch = clone();
  duplicateDispatch.tasks[1].dispatch_id = duplicateDispatch.tasks[0].dispatch_id;
  assert.throws(() => readRouterContract(document(duplicateDispatch)), /duplicate dispatch_id/);
});

test('rejects unknown dependencies and dependency cycles', () => {
  const unknown = clone();
  unknown.tasks[1].depends_on = ['missing'];
  assert.throws(() => readRouterContract(document(unknown)), /depends on unknown task_id/);
  const cycle = clone();
  cycle.tasks[0].depends_on = ['T02'];
  assert.throws(() => readRouterContract(document(cycle)), /dependency cycle/);
});

test('rejects missing required task fields', () => {
  for (const field of ['task_contract_path', 'task_branch', 'model_policy', 'reasoning_effort'] as const) {
    const value = clone();
    value.tasks[0][field] = ' ';
    assert.throws(() => readRouterContract(document(value)), new RegExp(field));
  }
  for (const field of ['owns', 'verification'] as const) {
    const value = clone();
    value.tasks[0][field] = [];
    assert.throws(() => readRouterContract(document(value)), new RegExp(field));
  }
});

test('rejects exact owned-path and identical-pattern overlaps across tasks', () => {
  for (const ownedPath of ['src/one.ts', 'docs/**']) {
    const value = clone();
    value.tasks[0].owns = [ownedPath];
    value.tasks[1].owns = [ownedPath];
    assert.throws(() => readRouterContract(document(value)), /owned path.*overlaps tasks/);
  }
});

test('rejects invalid Review authority and Supervisor permissions', () => {
  for (const [field, invalid] of [['authority', 'other'], ['transport', 'other'], ['supervisor_may_approve', true], ['supervisor_may_merge', true]] as const) {
    const value = clone();
    value.review[field] = invalid as never;
    assert.throws(() => readRouterContract(document(value)), new RegExp(`review.${field}`));
  }
});

test('rejects a fix policy other than always_confirm', () => {
  assert.throws(() => readRouterContract(document({ ...valid, fix_policy: { mode: 'automatic' } })), /fix_policy.mode/);
});

test('rejects non-local, cloud-primary, Work-enabled, and local-state execution', () => {
  for (const [field, invalid] of [['primary_surface', 'codex_cloud'], ['cloud_primary', true], ['work', 'notification_only'], ['local_state_database', true]] as const) {
    const value = clone();
    value.execution[field] = invalid as never;
    assert.throws(() => readRouterContract(document(value)), new RegExp(`execution.${field}`));
  }
});

test('rejects unsafe task-to-Stage integration policy', () => {
  for (const [field, invalid] of [['task_to_stage', 'merge'], ['automatic_rebase', true], ['automatic_conflict_resolution', true], ['force', true]] as const) {
    const value = clone();
    value.integration[field] = invalid as never;
    assert.throws(() => readRouterContract(document(value)), new RegExp(`integration.${field}`));
  }
});

test('normalized output recursively omits static Git SHA fields', () => {
  const value = clone() as typeof valid & { contract_commit_sha?: string; accepted_head_sha?: string };
  value.contract_commit_sha = 'bad';
  value.accepted_head_sha = 'bad';
  Object.assign(value.tasks[0], { base_sha: 'bad', task_head_sha: 'bad' });
  const result = readRouterContract(document(value));
  const normalized = JSON.stringify(result);
  for (const field of ['contract_commit_sha', 'accepted_head_sha', 'base_sha', 'task_head_sha']) {
    assert.equal(normalized.includes(`"${field}"`), false);
  }
});
