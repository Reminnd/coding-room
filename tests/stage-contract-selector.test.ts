import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// @ts-expect-error The Actions selector is intentionally a dependency-free .mjs script.
import { buildReviewArtifacts, selectStageContract } from '../.github/scripts/select-stage-contract.mjs';
// @ts-expect-error T01 owns the dependency-free .mjs lifecycle grammar consumed by this selector.
import { formatRecordEnvelope, parseFixDispatchHandoff, parseMechanicalRecord, parseReviewHandoff, RECORD_MARKERS } from '../tools/codex-github-bridge/structured-records.mjs';

const repository = 'Reminnd/coding-room';
const workflowId = 'wf-increment-016-github-review-fix-acceptance-closure';
const stageId = 'S01-review-fix-acceptance-closure';
const stageBranch = `stage/${workflowId}/${stageId}`;
const stageHeadSha = '1'.repeat(40);
const oldStageSha = '2'.repeat(40);
const baseSha = '3'.repeat(40);
const routerContractPath = `docs/work/${workflowId}/stages/${stageId}/ROUTER_CONTRACT.md`;
const stageContractPath = `docs/work/${workflowId}/stages/${stageId}/STAGE.md`;
const selectorPath = fileURLToPath(new URL('../.github/scripts/select-stage-contract.mjs', import.meta.url));
const workflowPath = fileURLToPath(new URL('../.github/workflows/codex-supervisor-dispatch.yml', import.meta.url));

const router = {
  contract_type: 'router',
  contract_version: 1,
  status: 'dispatch_ready',
  repository,
  workflow_id: workflowId,
  stage_id: stageId,
  stage_branch: stageBranch,
  scheduler: {
    mode: 'dependency_dag',
    primary_objective: 'minimize_wall_clock_time',
    safe_parallelism_first: true,
    ready_set: 'all_dependencies_integrated_and_owned_paths_non_overlapping',
    integration_order_when_simultaneously_eligible: ['topological_priority', 'task_id'],
  },
  tasks: [],
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

const facts = (comments: unknown[] = [], overrides: Record<string, unknown> = {}) => ({
  router,
  comments,
  repository,
  pullRequestNumber: 8,
  workflowId,
  stageId,
  stageBranch,
  stageHeadSha,
  routerContractPath,
  ...overrides,
});

const preparation = (overrides: Record<string, unknown> = {}) => ({
  record_type: 'FIX_PREPARED_V1',
  fix_preparation_id: 'fix-preparation-1',
  fix_round_id: 'fix-round-1',
  workflow_id: workflowId,
  stage_id: stageId,
  repository,
  pull_request_number: 8,
  stage_branch: stageBranch,
  source_review_id: 'review-1',
  source_confirmation_id: 'confirmation-1',
  source_stage_sha: oldStageSha,
  solution_id: 'solution-1',
  prepared_stage_sha: stageHeadSha,
  router_contract_path: routerContractPath,
  tasks: [{
    task_id: 'F01-fix',
    dispatch_id: 'fix-dispatch-1',
    fix_round_id: 'fix-round-1',
    fix_preparation_id: 'fix-preparation-1',
    task_branch: 'task/fix/F01-fix',
    task_contract_path: `docs/work/${workflowId}/fixes/fix-round-1/tasks/F01-fix/TASK_CONTRACT.md`,
    immutable_dispatch_facts: { model_policy: 'coding_strong', reasoning_effort: 'high' },
  }],
  record_authority: 'local_bridge_controller',
  source_kind: 'git_observation',
  ...overrides,
});

const preparationComment = (record = preparation()) => formatRecordEnvelope(record, RECORD_MARKERS.mechanical);

test('selects the exact Stage contract and emits only the matching strict handoff', async () => {
  {
  for (const comments of [
    [],
    [{ body: '<!-- CODEX_LOCAL_BRIDGE_V1 -->\n{"task_id":"T01-review-fix-lifecycle-core","status":"task_integrated"}' }],
    [{ body: '<!-- CODEX_LOCAL_BRIDGE_V1 -->\n{"task_id":"T02-review-fix-actions-selector","status":"task_integrated"}' }],
  ]) {
    const selected = selectStageContract(facts(comments));
    assert.equal(selected.mode, 'canonical_stage_router');
    assert.equal(selected.router, router);
    assert.equal(Object.hasOwn(selected, 'fix_handoff'), false);
  }
  }

  {
  const selected = selectStageContract(facts([{ body: preparationComment() }]));
  assert.equal(selected.mode, 'prepared_fix_router');
  assert.equal(selected.preparation.fix_preparation_id, 'fix-preparation-1');
  assert.deepEqual(selected.task_dispatch_mapping, { 'F01-fix': 'fix-dispatch-1' });
  assert.equal(selected.verification.result, 'PASS');
  assert.equal(selected.verification.stage_sha, stageHeadSha);
  assert.equal(selected.fix_handoff.verification_id, selected.verification.verification_id);
  assert.equal(selected.fix_handoff.source_review_id, 'review-1');
  assert.equal(selected.fix_handoff.source_confirmation_id, 'confirmation-1');
  assert.equal(JSON.stringify(selected).includes('FIX_BUNDLE_ACCEPTANCE_V1'), false);
  assert.deepEqual(parseMechanicalRecord(selected.verification_comment), selected.verification);
  assert.deepEqual(parseFixDispatchHandoff(selected.fix_handoff_comment), selected.fix_handoff);
  }

  {
  const body = preparationComment();
  const selected = selectStageContract(facts([{ body }, { body }]));
  assert.equal(selected.mode, 'prepared_fix_router');
  assert.deepEqual(selected.task_dispatch_mapping, { 'F01-fix': 'fix-dispatch-1' });
  }

  {
  const selected = selectStageContract(facts([{ body: preparationComment(preparation({ prepared_stage_sha: oldStageSha })) }]));
  assert.equal(selected.mode, 'canonical_stage_router');
  }

  {
  const first = preparation();
  const conflicting = preparation({ source_review_id: 'review-conflict' });
  const second = preparation({
    fix_preparation_id: 'fix-preparation-2',
    fix_round_id: 'fix-round-2',
    source_review_id: 'review-2',
    source_confirmation_id: 'confirmation-2',
    solution_id: 'solution-2',
    tasks: [{
      task_id: 'F02-fix',
      dispatch_id: 'fix-dispatch-2',
      fix_round_id: 'fix-round-2',
      fix_preparation_id: 'fix-preparation-2',
      task_branch: 'task/fix/F02-fix',
      task_contract_path: 'docs/work/fixes/F02-fix/TASK_CONTRACT.md',
      immutable_dispatch_facts: { model_policy: 'coding_strong' },
    }],
  });
  const malformedCurrent = `<!-- CODEX_GITHUB_LIFECYCLE_RECORD_V1 -->\n\n\`\`\`json\n{"record_type": "FIX_PREPARED_V1", "prepared_stage_sha": "${stageHeadSha}"}\n\`\`\``;
  const compactMalformedCurrent = `<!-- CODEX_GITHUB_LIFECYCLE_RECORD_V1 -->\n\n\`\`\`json\n{"record_type":"FIX_PREPARED_V1","prepared_stage_sha":"${stageHeadSha}"}\n\`\`\``;
  for (const comments of [
    [{ body: preparationComment(first) }, { body: preparationComment(conflicting) }],
    [{ body: preparationComment(first) }, { body: preparationComment(second) }],
    [{ body: malformedCurrent }],
    [{ body: compactMalformedCurrent }],
    [{ body: preparationComment(preparation({ repository: 'other/repository' })) }],
    [{ body: preparationComment(preparation({ pull_request_number: 9 })) }],
    [{ body: preparationComment(preparation({ workflow_id: 'other-workflow' })) }],
    [{ body: preparationComment(preparation({ stage_id: 'other-stage' })) }],
    [{ body: preparationComment(preparation({ stage_branch: 'stage/other/stage' })) }],
    [{ body: preparationComment(preparation({ router_contract_path: 'docs/work/other/ROUTER_CONTRACT.md' })) }],
  ]) {
    assert.throws(() => selectStageContract(facts(comments)), /needs_decision/);
  }
  }

  {
  const malformedOld = `<!-- CODEX_GITHUB_LIFECYCLE_RECORD_V1 -->\n\n\`\`\`json\n{"record_type": "FIX_PREPARED_V1", "prepared_stage_sha": "${oldStageSha}"}\n\`\`\``;
  assert.equal(selectStageContract(facts([{ body: malformedOld }])).mode, 'canonical_stage_router');
  }

  {
  const fix = selectStageContract(facts([{ body: preparationComment() }]));
  const review = buildReviewArtifacts({
    router,
    repository,
    pullRequestNumber: 8,
    workflowId,
    stageId,
    baseBranch: 'main',
    baseSha,
    headBranch: stageBranch,
    headSha: stageHeadSha,
    stageContractPath,
    routerContractPath,
  });
  assert.deepEqual(parseReviewHandoff(review.review_handoff_comment), review.review_handoff);
  assert.throws(() => parseReviewHandoff(fix.fix_handoff_comment));
  assert.throws(() => parseFixDispatchHandoff(review.review_handoff_comment));
  }

  {
  const directory = await mkdtemp(join(tmpdir(), 'stage-selector-'));
  const commentsPath = join(directory, 'comments.json');
  try {
    writeFileSync(commentsPath, JSON.stringify([{ body: preparationComment() }]));
    const args = ['select', routerContractPath, commentsPath, repository, '8', workflowId, stageId, stageBranch, stageHeadSha];
    const success = spawnSync(process.execPath, [selectorPath, ...args], { encoding: 'utf8' });
    assert.equal(success.status, 0, success.stderr);
    assert.equal(success.stdout.trim().split(/\r?\n/).length, 1);
    assert.equal(JSON.parse(success.stdout).mode, 'prepared_fix_router');

    writeFileSync(commentsPath, JSON.stringify([
      { body: preparationComment() },
      { body: preparationComment(preparation({ source_review_id: 'different' })) },
    ]));
    const failure = spawnSync(process.execPath, [selectorPath, ...args], { encoding: 'utf8' });
    assert.notEqual(failure.status, 0);
    assert.match(failure.stderr, /needs_decision/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  }

  {
  const source = readFileSync(workflowPath, 'utf8');
  const verification = source.indexOf('Publish exact prepared verification');
  const handoff = source.indexOf('Publish exact Fix dispatch handoff');
  assert.ok(verification >= 0 && handoff > verification);
  assert.match(source, /mode == 'prepared_fix_router'/);
  assert.match(source, /publish_exact_comment/);
  assert.match(source, /current_pr_head_sha.*GITHUB_SHA/s);
  const normalizedExactCommentComparison = 'select((.body | sub("\\n+$"; "")) == ($body | sub("\\n+$"; "")))';
  assert.equal(source.split(normalizedExactCommentComparison).length - 1, 10);
  assert.equal(source.includes('select(.body == $body)'), false);
  assert.equal((source.match(/Conflicting or ambiguous lifecycle projection/g) ?? []).length, 5);
  for (const forbidden of ['record-acceptance', 'FIX_BUNDLE_ACCEPTANCE_V1', 'launch Worker', 'start Worker']) {
    assert.equal(source.includes(forbidden), false);
  }
  assert.equal((source.match(/^name: Codex supervisor dispatch$/gm) ?? []).length, 1);
  }
});
