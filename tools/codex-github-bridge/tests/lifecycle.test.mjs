import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FAILURE_CLASS,
  LifecycleController,
  gateDispatchBatch,
  postMutationUncertain,
  preMutationFailure,
  runObservedMutation,
  validateTaskContractBinding,
} from '../lifecycle.mjs';
import { RECORD_MARKERS, formatRecordEnvelope } from '../structured-records.mjs';

const userReference = { source_kind: 'fixed_chat_user_decision', decision_reference: 'user-message-1' };
const reviewReference = { source_kind: 'fixed_chat_assistant_decision', decision_reference: 'assistant-message-1' };

function taskContract(task) {
  return `# TASK CONTRACT\n\n## Contract\n\n\`\`\`yaml\n+task_id: ${task.task_id}\n+dispatch_id: ${task.dispatch_id}\n+type: Implementation Task\n+status: Accepted\n+confirmed_by_user: true\n+implementation_authorized: false\n+depends_on: []\n+task_branch: ${task.task_branch}\n+task_contract_path: ${task.task_contract_path}\n+model_policy: coding_strong\n+reasoning_effort: high\n+fallback_model_policy: null\n+\`\`\`\n`.replaceAll('\n+', '\n');
}

function preparedFixture() {
  const task = {
    task_id: 'T01F01', dispatch_id: 'dispatch-original', task_branch: 'task/wf/T01F01',
    task_contract_path: 'docs/T01F01.md', depends_on: [], owns: ['owned/**'], verification: [],
  };
  const preparation = {
    record_type: 'FIX_PREPARED_V1', fix_preparation_id: 'preparation-1', fix_round_id: 'round-1', workflow_id: 'wf',
    stage_id: 'S01', repository: 'owner/repo', pull_request_number: 7, stage_branch: 'stage/wf/S01',
    source_review_id: 'review-1', source_confirmation_id: 'confirmation-1', source_stage_sha: 'source-sha',
    solution_id: 'solution-1', prepared_stage_sha: 'prepared-sha', router_contract_path: 'docs/router.md',
    tasks: [{
      task_id: task.task_id, dispatch_id: task.dispatch_id, fix_round_id: 'round-1', fix_preparation_id: 'preparation-1',
      task_branch: task.task_branch, task_contract_path: task.task_contract_path,
      immutable_dispatch_facts: { base_sha: 'source-sha', model_policy: 'coding_strong' },
    }],
    record_authority: 'local_bridge_controller', source_kind: 'git_observation',
  };
  const verification = {
    record_type: 'STAGE_VERIFICATION_V1', verification_id: 'verification-1', event_id: 'event-1', workflow_id: 'wf',
    stage_id: 'S01', stage_sha: 'prepared-sha', result: 'PASS', checks: [], record_authority: 'github_actions',
  };
  const handoff = {
    status: 'ready_for_fix_dispatch', repository: 'owner/repo', pull_request_number: 7, workflow_id: 'wf', stage_id: 'S01',
    stage_branch: 'stage/wf/S01', prepared_stage_sha: 'prepared-sha', router_contract_path: 'docs/router.md',
    fix_round_id: 'round-1', fix_preparation_id: 'preparation-1', source_review_id: 'review-1',
    source_confirmation_id: 'confirmation-1', verification_id: 'verification-1', handoff_id: 'fix-handoff-1',
    task_dispatch_mapping: { T01F01: 'dispatch-original' }, execution_surface: 'local_codex',
  };
  const acceptance = {
    record_type: 'FIX_BUNDLE_ACCEPTANCE_V1', acceptance_id: 'acceptance-1', fix_round_id: 'round-1',
    fix_preparation_id: 'preparation-1', prepared_stage_sha: 'prepared-sha', router_contract_path: 'docs/router.md',
    verification_id: 'verification-1', handoff_id: 'fix-handoff-1', task_dispatch_mapping: { T01F01: 'dispatch-original' },
    decision: 'accepted', decision_authority: 'user', source_reference: userReference,
  };
  const router = { repository: 'owner/repo', workflow_id: 'wf', stage_id: 'S01', stage_branch: 'stage/wf/S01', tasks: [task] };
  const stage = {
    prNumber: 7, prHeadSha: 'prepared-sha', prHeadBranch: 'stage/wf/S01', eventErrors: [], ambiguousTaskEvents: [],
    lifecycle: { records: [preparation, verification, acceptance], fixHandoffs: [handoff], reviewHandoffs: [], errors: [] },
  };
  return { task, preparation, verification, handoff, acceptance, router, stage };
}

test('Task Contract binding requires Accepted, confirmed, and exact Router identity', () => {
  const { task } = preparedFixture();
  assert.equal(validateTaskContractBinding(task, taskContract(task)).status, 'Accepted');
  assert.throws(() => validateTaskContractBinding(task, taskContract(task).replace('confirmed_by_user: true', 'confirmed_by_user: false')), /not Accepted and confirmed/);
  assert.throws(() => validateTaskContractBinding(task, taskContract(task).replace('dispatch-original', 'dispatch-other')), /dispatch_id/);
});

test('canonical batch gate does not require Fix evidence', () => {
  const { task, router, stage } = preparedFixture();
  stage.prHeadSha = 'canonical-sha';
  stage.lifecycle = { records: [], fixHandoffs: [], reviewHandoffs: [], errors: [] };
  const gate = gateDispatchBatch({
    repository: 'owner/repo', router, stage, remoteStageSha: 'canonical-sha',
    taskContractBytes: new Map([[task.task_id, Buffer.from(taskContract(task))]]),
    states: new Map([[task.task_id, 'not_started']]),
  });
  assert.equal(gate.routerMode, 'canonical_stage_router');
});

test('prepared Fix batch gate requires exact current PASS, handoff, acceptance, mapping, and known start state', () => {
  const base = preparedFixture();
  const invoke = (overrides = {}) => gateDispatchBatch({
    repository: 'owner/repo', router: base.router, stage: { ...base.stage, ...overrides.stage }, remoteStageSha: 'prepared-sha',
    taskContractBytes: new Map([[base.task.task_id, Buffer.from(taskContract(base.task))]]),
    states: overrides.states ?? new Map([[base.task.task_id, 'not_started']]),
  });
  assert.equal(invoke().routerMode, 'prepared_fix_router');

  const noAcceptance = preparedFixture();
  noAcceptance.stage.lifecycle.records = [noAcceptance.preparation, noAcceptance.verification];
  assert.throws(() => gateDispatchBatch({
    repository: 'owner/repo', router: noAcceptance.router, stage: noAcceptance.stage, remoteStageSha: 'prepared-sha',
    taskContractBytes: new Map([[noAcceptance.task.task_id, Buffer.from(taskContract(noAcceptance.task))]]),
    states: new Map([[noAcceptance.task.task_id, 'not_started']]),
  }), (error) => error.details.failure_class === FAILURE_CLASS.PRE_MUTATION_FAILURE && /acceptance/.test(error.message));

  const stalePass = preparedFixture();
  stalePass.verification.stage_sha = 'old-sha';
  assert.throws(() => gateDispatchBatch({
    repository: 'owner/repo', router: stalePass.router, stage: stalePass.stage, remoteStageSha: 'prepared-sha',
    taskContractBytes: new Map([[stalePass.task.task_id, Buffer.from(taskContract(stalePass.task))]]),
    states: new Map([[stalePass.task.task_id, 'not_started']]),
  }), /current exact PASS/);

  assert.throws(() => invoke({ states: new Map([[base.task.task_id, 'dispatched']]) }), /mapping|Task set/);
  assert.throws(() => invoke({ stage: { ambiguousTaskEvents: ['T01F01:old:task_dispatched'] } }), /prior Task start state is ambiguous/);
});

test('prepared Fix batch gate rejects each forged preparation lineage field', () => {
  for (const field of ['repository', 'pull_request_number', 'workflow_id', 'stage_id', 'stage_branch']) {
    const { task, preparation, router, stage } = preparedFixture();
    const args = {
      repository: 'owner/repo', router, stage, remoteStageSha: 'prepared-sha',
      taskContractBytes: new Map([[task.task_id, Buffer.from(taskContract(task))]]),
      states: new Map([[task.task_id, 'not_started']]),
    };
    assert.equal(gateDispatchBatch(args).routerMode, 'prepared_fix_router');
    preparation[field] = field === 'pull_request_number' ? 8 : 'forged-lineage';
    assert.throws(() => gateDispatchBatch(args), (error) =>
      error.details.failure_class === FAILURE_CLASS.PRE_MUTATION_FAILURE && /preparation lineage/.test(error.message), field);
  }
});

test('observed mutation reuses exact projection and separates pre/post mutation failures', async () => {
  let writes = 0;
  const reused = await runObservedMutation({
    boundary: 'pr_comment', observe: async () => ['present'], isApplied: (value) => value.includes('present'), mutate: async () => { writes += 1; },
  });
  assert.equal(reused.status, 'reused');
  assert.equal(writes, 0);

  await assert.rejects(runObservedMutation({
    boundary: 'label_projection', observe: async () => { throw new Error('read failed'); }, isApplied: () => false, mutate: async () => { writes += 1; },
  }), (error) => error.details.failure_class === FAILURE_CLASS.PRE_MUTATION_FAILURE);
  assert.equal(writes, 0);

  let state = false;
  await assert.rejects(runObservedMutation({
    boundary: 'main_push', observe: async () => state, isApplied: Boolean,
    mutate: async () => { state = true; throw new Error('response lost'); },
  }), (error) => error.details.failure_class === FAILURE_CLASS.POST_MUTATION_UNCERTAIN && error.details.effect_observed === true);
});

test('record-review binds the exact handoff, PASS verification, remote Stage, and caller decision payload', async () => {
  const published = [];
  const review = {
    record_type: 'FORMAL_REVIEW_V1', review_id: 'review-1', review_handoff_id: 'review-handoff-1', verification_id: 'verification-1',
    workflow_id: 'wf', stage_id: 'S01', repository: 'owner/repo', pull_request_number: 7, stage_branch: 'stage/wf/S01',
    reviewed_stage_sha: 'stage-sha', decision: 'REQUEST_CHANGES', decision_authority: 'chatgpt_fixed_chat',
    source_reference: reviewReference, finding_ids: ['F-1'],
  };
  const verification = {
    record_type: 'STAGE_VERIFICATION_V1', verification_id: 'verification-1', event_id: 'event-1', workflow_id: 'wf',
    stage_id: 'S01', stage_sha: 'stage-sha', result: 'PASS', checks: [], record_authority: 'github_actions',
  };
  const handoff = {
    status: 'ready_for_chat_review', repository: 'owner/repo', pull_request_number: 7, workflow_id: 'wf', stage_id: 'S01',
    base_branch: 'main', base_sha: 'base-sha', head_branch: 'stage/wf/S01', head_sha: 'stage-sha',
    stage_contract_path: 'docs/stage.md', router_contract_path: 'docs/router.md', verification_id: 'verification-1',
    review_authority: 'chatgpt_fixed_chat', handoff_id: 'review-handoff-1',
  };
  const github = {
    comments: async () => [
      { body: formatRecordEnvelope(verification) },
      { body: formatRecordEnvelope(handoff, RECORD_MARKERS.review_handoff) },
    ],
    pullRequestFacts: async () => ({ number: 7, state: 'OPEN', isDraft: false, headRefName: 'stage/wf/S01', headRefOid: 'stage-sha', baseRefName: 'main', baseRefOid: 'base-sha', labels: [] }),
    publishStructuredRecord: async (_repository, _pr, record) => { published.push(record); return { status: 'created' }; },
  };
  const lifecycle = new LifecycleController({ repository: 'owner/repo', github, git: { remoteBranchHead: async () => 'stage-sha' } });
  await lifecycle.recordReview({ pull_request_number: 7, record: review });
  assert.strictEqual(published[0], review);

  for (const field of ['workflow_id', 'stage_id']) {
    const original = verification[field];
    verification[field] = `${original}-other`;
    published.length = 0;
    await assert.rejects(
      lifecycle.recordReview({ pull_request_number: 7, record: review }),
      (error) => error.details.failure_class === FAILURE_CLASS.PRE_MUTATION_FAILURE,
      `verification ${field}`,
    );
    assert.deepEqual(published, [], `verification ${field}`);
    verification[field] = original;
  }
});

function fixSourceReview() {
  return {
    record_type: 'FORMAL_REVIEW_V1', review_id: 'review-1', review_handoff_id: 'review-handoff-1', verification_id: 'verification-1',
    workflow_id: 'wf', stage_id: 'S01', repository: 'owner/repo', pull_request_number: 7, stage_branch: 'stage/wf/S01',
    reviewed_stage_sha: 'source-sha', decision: 'REQUEST_CHANGES', decision_authority: 'chatgpt_fixed_chat',
    source_reference: reviewReference, finding_ids: ['F-1'],
  };
}

function prepareFixCommand() {
  return {
    pull_request_number: 7,
    fix_round: {
      fix_round_id: 'round-1', confirmation_id: 'confirmation-1', review_id: 'review-1', reviewed_stage_sha: 'source-sha',
      solution_decision: 'confirmed', decision_authority: 'user', source_reference: userReference,
      confirmed_finding_ids: ['F-1'], confirmed_solution_id: 'solution-1', confirmed_solution_payload: { exact: '保持原文' },
    },
    preparation: {
      fix_preparation_id: 'preparation-1', workflow_id: 'wf', stage_id: 'S01', repository: 'owner/repo', pull_request_number: 7,
      stage_branch: 'stage/wf/S01', source_review_id: 'review-1', source_confirmation_id: 'confirmation-1',
      source_stage_sha: 'source-sha', solution_id: 'solution-1', router_contract_path: 'docs/router.md',
      tasks: [{
        task_id: 'T01F01', dispatch_id: 'dispatch-1', fix_round_id: 'round-1', fix_preparation_id: 'preparation-1',
        task_branch: 'task/wf/T01F01', task_contract_path: 'docs/T01F01.md', immutable_dispatch_facts: { base_sha: 'source-sha' },
      }],
      record_authority: 'local_bridge_controller', source_kind: 'git_observation',
    },
    files: { 'docs/router.md': 'router bytes' },
    commit_message: 'chore(fix): prepare round-1',
  };
}

test('prepare-fix preserves the confirmed solution and preallocated dispatch IDs through commit and push', async () => {
  const published = [];
  const calls = [];
  const order = [];
  const solution = { exact_text: '保持 原文 ', ordered: ['B', 'A'] };
  const sourceReview = {
    record_type: 'FORMAL_REVIEW_V1', review_id: 'review-1', review_handoff_id: 'review-handoff-1', verification_id: 'verification-1',
    workflow_id: 'wf', stage_id: 'S01', repository: 'owner/repo', pull_request_number: 7, stage_branch: 'stage/wf/S01',
    reviewed_stage_sha: 'source-sha', decision: 'REQUEST_CHANGES', decision_authority: 'chatgpt_fixed_chat',
    source_reference: reviewReference, finding_ids: ['F-1'],
  };
  const unrelatedRound = {
    ...prepareFixCommand().fix_round,
    record_type: 'FIX_ROUND_OPENED_V1',
    fix_round_id: 'round-unrelated',
    confirmation_id: 'confirmation-unrelated',
  };
  const github = {
    comments: async () => [sourceReview, unrelatedRound].map((record) => ({ body: formatRecordEnvelope(record) })),
    pullRequestFacts: async () => ({ number: 7, state: 'OPEN', isDraft: false, headRefName: 'stage/wf/S01', headRefOid: 'source-sha', baseRefName: 'main', baseRefOid: 'base-sha', labels: [] }),
    publishStructuredRecord: async (_repository, _pr, record) => {
      published.push(record);
      order.push(`record:${record.record_type}`);
      return { status: 'created' };
    },
  };
  const git = {
    remoteBranchHead: async () => 'source-sha',
    materializePreparedFix: async (input) => {
      calls.push(['commit', input]);
      order.push('commit');
      return { status: 'created', worktree: 'stage-worktree', preparedStageSha: 'prepared-sha' };
    },
    pushPreparedStage: async (...args) => { calls.push(['push', ...args]); order.push('push'); },
  };
  const ids = ['round-generated', 'preparation-generated'];
  const lifecycle = new LifecycleController({ repository: 'owner/repo', github, git, createId: () => ids.shift() });
  const result = await lifecycle.prepareFix({
    pull_request_number: 7,
    fix_round: {
      confirmation_id: 'confirmation-1', review_id: 'review-1', reviewed_stage_sha: 'source-sha', solution_decision: 'confirmed',
      decision_authority: 'user', source_reference: userReference, confirmed_finding_ids: ['F-1'],
      confirmed_solution_id: 'solution-1', confirmed_solution_payload: solution,
    },
    preparation: {
      workflow_id: 'wf', stage_id: 'S01', repository: 'owner/repo', pull_request_number: 7, stage_branch: 'stage/wf/S01',
      source_review_id: 'review-1', source_confirmation_id: 'confirmation-1', source_stage_sha: 'source-sha', solution_id: 'solution-1',
      router_contract_path: 'docs/router.md', tasks: [{
        task_id: 'T01F01', dispatch_id: 'dispatch-original', fix_round_id: 'round-generated',
        fix_preparation_id: 'preparation-generated', task_branch: 'task/wf/T01F01', task_contract_path: 'docs/T01F01.md',
        immutable_dispatch_facts: { base_sha: 'source-sha' },
      }], record_authority: 'local_bridge_controller', source_kind: 'git_observation',
    },
    files: { 'docs/router.md': 'router bytes' },
    commit_message: 'chore(fix): prepare round-generated',
  });
  assert.equal(result.prepared_stage_sha, 'prepared-sha');
  assert.strictEqual(published[0].confirmed_solution_payload, solution);
  assert.equal(published[1].tasks[0].dispatch_id, 'dispatch-original');
  assert.deepEqual(calls.map((item) => item[0]), ['commit', 'push']);
  assert.deepEqual(order, ['record:FIX_ROUND_OPENED_V1', 'commit', 'record:FIX_PREPARED_V1', 'push']);
});

test('prepare-fix rejects malformed preparation and stale Stage facts before any external write', async () => {
  const cases = [
    ['empty files', (input) => { input.files = {}; }, 'source-sha', 'source-sha'],
    ['non-string file content', (input) => { input.files['docs/router.md'] = null; }, 'source-sha', 'source-sha'],
    ['invalid file path', (input) => { input.files = { '../router.md': 'router bytes' }; }, 'source-sha', 'source-sha'],
    ['absolute Windows file path', (input) => { input.files = { 'C:/router.md': 'router bytes' }; }, 'source-sha', 'source-sha'],
    ['empty commit message', (input) => { input.commit_message = ''; }, 'source-sha', 'source-sha'],
    ['empty dispatch list', (input) => { input.preparation.tasks = []; }, 'source-sha', 'source-sha'],
    ['empty dispatch ID', (input) => { input.preparation.tasks[0].dispatch_id = ''; }, 'source-sha', 'source-sha'],
    ['duplicate dispatch IDs', (input) => {
      input.preparation.tasks.push({ ...input.preparation.tasks[0], task_id: 'T02F01' });
    }, 'source-sha', 'source-sha'],
    ['dispatch ID collides with Fix round', (input) => { input.preparation.tasks[0].dispatch_id = 'round-1'; }, 'source-sha', 'source-sha'],
    ['dispatch ID collides with Fix preparation', (input) => { input.preparation.tasks[0].dispatch_id = 'preparation-1'; }, 'source-sha', 'source-sha'],
    ['duplicate task IDs', (input) => {
      input.preparation.tasks.push({ ...input.preparation.tasks[0], dispatch_id: 'dispatch-2' });
    }, 'source-sha', 'source-sha'],
    ['malformed preparation mapping', (input) => { input.preparation.tasks[0].immutable_dispatch_facts = {}; }, 'source-sha', 'source-sha'],
    ['malformed preparation lineage', (input) => { input.preparation.tasks[0].fix_round_id = 'round-other'; }, 'source-sha', 'source-sha'],
    ['preparation source Review mismatch', (input) => { input.preparation.source_review_id = 'review-other'; }, 'source-sha', 'source-sha'],
    ['preparation source confirmation mismatch', (input) => { input.preparation.source_confirmation_id = 'confirmation-other'; }, 'source-sha', 'source-sha'],
    ['preparation source Stage mismatch', (input) => { input.preparation.source_stage_sha = 'stage-other'; }, 'stage-other', 'stage-other'],
    ['preparation solution mismatch', (input) => { input.preparation.solution_id = 'solution-other'; }, 'source-sha', 'source-sha'],
    ['stale remote Stage head', () => {}, 'stale-sha', 'source-sha'],
    ['stale PR Stage head', () => {}, 'source-sha', 'stale-sha'],
  ];

  for (const [label, mutate, remoteStageSha, pullRequestHeadSha] of cases) {
    const writes = [];
    const input = prepareFixCommand();
    mutate(input);
    const github = {
      comments: async () => [{ body: formatRecordEnvelope(fixSourceReview()) }],
      pullRequestFacts: async () => ({ number: 7, state: 'OPEN', isDraft: false, headRefName: 'stage/wf/S01', headRefOid: pullRequestHeadSha, baseRefName: 'main', baseRefOid: 'base-sha', labels: [] }),
      publishStructuredRecord: async () => { writes.push('github:record'); return { status: 'created' }; },
    };
    const git = {
      remoteBranchHead: async () => remoteStageSha,
      materializePreparedFix: async () => { writes.push('git:commit'); return { status: 'created', worktree: 'stage-worktree', preparedStageSha: 'prepared-sha' }; },
      pushPreparedStage: async () => { writes.push('git:push'); },
    };
    const lifecycle = new LifecycleController({ repository: 'owner/repo', github, git });
    await assert.rejects(
      lifecycle.prepareFix(input),
      (error) => error.details.failure_class === FAILURE_CLASS.PRE_MUTATION_FAILURE,
      label,
    );
    assert.deepEqual(writes, [], label);
  }
});

test('prepare-fix reclassifies Stage worktree PRE failures only after this invocation creates the Fix round', async () => {
  for (const reason of ['branch mismatch', 'HEAD mismatch', 'dirty worktree']) {
    const calls = [];
    const github = {
      comments: async () => [{ body: formatRecordEnvelope(fixSourceReview()) }],
      pullRequestFacts: async () => ({ number: 7, state: 'OPEN', isDraft: false, headRefName: 'stage/wf/S01', headRefOid: 'source-sha', baseRefName: 'main', baseRefOid: 'base-sha', labels: [] }),
      publishStructuredRecord: async (_repository, _pr, record) => {
        calls.push(`record:${record.record_type}`);
        return { status: 'created' };
      },
    };
    const git = {
      remoteBranchHead: async () => 'source-sha',
      materializePreparedFix: async () => { throw preMutationFailure(reason); },
      pushPreparedStage: async () => { calls.push('push'); },
    };
    const lifecycle = new LifecycleController({ repository: 'owner/repo', github, git });
    await assert.rejects(
      lifecycle.prepareFix(prepareFixCommand()),
      (error) => error.details.failure_class === FAILURE_CLASS.POST_MUTATION_UNCERTAIN
        && error.details.boundary === 'local_prepared_commit',
      reason,
    );
    assert.deepEqual(calls, ['record:FIX_ROUND_OPENED_V1'], reason);
  }
});

test('prepare-fix uses confirmation-first retry identity before any mutation', async () => {
  const existingRound = prepareFixCommand().fix_round;
  existingRound.record_type = 'FIX_ROUND_OPENED_V1';

  {
    const input = prepareFixCommand();
    input.fix_round.fix_round_id = 'round-replacement';
    input.preparation.prepared_stage_sha = 'prepared-sha';
    const existingPreparation = {
      ...input.preparation,
      record_type: 'FIX_PREPARED_V1',
      fix_round_id: existingRound.fix_round_id,
    };
    const publicationAttempts = [];
    const lifecycle = new LifecycleController({
      repository: 'owner/repo',
      github: {
        comments: async () => [fixSourceReview(), existingRound, existingPreparation]
          .map((record) => ({ body: formatRecordEnvelope(record) })),
        pullRequestFacts: async () => ({ number: 7, state: 'OPEN', isDraft: false, headRefName: 'stage/wf/S01', headRefOid: 'prepared-sha', baseRefName: 'main', baseRefOid: 'base-sha', labels: [] }),
        publishStructuredRecord: async (_repository, _pr, record) => {
          publicationAttempts.push(record);
          return { status: 'reused' };
        },
      },
      git: {
        remoteBranchHead: async () => 'prepared-sha',
        materializePreparedFix: async () => { throw new Error('completed retry must not materialize'); },
        pushPreparedStage: async () => { throw new Error('completed retry must not push'); },
      },
      createId: () => { throw new Error('completed retry must not generate an identity'); },
    });

    const result = await lifecycle.prepareFix(input);
    assert.equal(result.fix_round_id, 'round-1');
    assert.deepEqual(publicationAttempts, [existingRound]);
  }

  for (const [label, mutate, rounds] of [
    ['caller replacement lineage', (input) => {
      input.fix_round.fix_round_id = 'round-replacement';
      input.preparation.fix_preparation_id = 'preparation-replacement';
      input.preparation.tasks[0].fix_round_id = 'round-replacement';
      input.preparation.tasks[0].fix_preparation_id = 'preparation-replacement';
    }, [existingRound]],
    ['different decision payload', (input) => {
      input.fix_round.confirmed_solution_payload = { exact: 'different' };
    }, [existingRound]],
    ['ambiguous confirmation', () => {}, [existingRound, { ...existingRound, fix_round_id: 'round-duplicate' }]],
  ]) {
    const calls = [];
    const input = prepareFixCommand();
    mutate(input);
    const durableComments = [fixSourceReview(), ...rounds]
      .map((record) => ({ body: formatRecordEnvelope(record) }));
    const before = structuredClone(durableComments);
    const lifecycle = new LifecycleController({
      repository: 'owner/repo',
      github: {
        comments: async () => durableComments,
        pullRequestFacts: async () => ({ number: 7, state: 'OPEN', isDraft: false, headRefName: 'stage/wf/S01', headRefOid: 'source-sha', baseRefName: 'main', baseRefOid: 'base-sha', labels: [] }),
        publishStructuredRecord: async () => { calls.push('record'); return { status: 'created' }; },
      },
      git: {
        remoteBranchHead: async () => 'source-sha',
        materializePreparedFix: async () => { calls.push('commit'); throw preMutationFailure('dirty worktree'); },
        pushPreparedStage: async () => { calls.push('push'); },
      },
      createId: () => { calls.push('create-id'); return 'generated-id'; },
    });

    await assert.rejects(
      lifecycle.prepareFix(input),
      (error) => error.status === 'needs_decision'
        && error.details.failure_class === FAILURE_CLASS.PRE_MUTATION_FAILURE,
      label,
    );
    assert.deepEqual(calls, [], label);
    assert.deepEqual(durableComments, before, label);
  }

  {
    const calls = [];
    const lifecycle = new LifecycleController({
      repository: 'owner/repo',
      github: {
        comments: async () => [fixSourceReview(), existingRound]
          .map((record) => ({ body: formatRecordEnvelope(record) })),
        pullRequestFacts: async () => ({ number: 7, state: 'OPEN', isDraft: false, headRefName: 'stage/wf/S01', headRefOid: 'source-sha', baseRefName: 'main', baseRefOid: 'base-sha', labels: [] }),
        publishStructuredRecord: async () => ({ status: 'reused' }),
      },
      git: {
        remoteBranchHead: async () => 'source-sha',
        materializePreparedFix: async () => { throw preMutationFailure('dirty worktree'); },
        pushPreparedStage: async () => { calls.push('push'); },
      },
    });
    await assert.rejects(
      lifecycle.prepareFix(prepareFixCommand()),
      (error) => error.details.failure_class === FAILURE_CLASS.PRE_MUTATION_FAILURE,
    );
    assert.deepEqual(calls, []);
  }
});

test('prepare-fix converts later record and push pre-observation failures after earlier mutations and stops', async () => {
  const scenarios = [
    {
      label: 'FIX_PREPARED publication',
      failRecord: true,
      expectedBoundary: 'pr_comment',
      expectedCalls: ['record:FIX_ROUND_OPENED_V1', 'commit', 'record:FIX_PREPARED_V1'],
    },
    {
      label: 'prepared Stage push',
      failRecord: false,
      expectedBoundary: 'prepared_stage_push',
      expectedCalls: ['record:FIX_ROUND_OPENED_V1', 'commit', 'record:FIX_PREPARED_V1', 'push'],
    },
  ];
  for (const scenario of scenarios) {
    const calls = [];
    const github = {
      comments: async () => [{ body: formatRecordEnvelope(fixSourceReview()) }],
      pullRequestFacts: async () => ({ number: 7, state: 'OPEN', isDraft: false, headRefName: 'stage/wf/S01', headRefOid: 'source-sha', baseRefName: 'main', baseRefOid: 'base-sha', labels: [] }),
      publishStructuredRecord: async (_repository, _pr, record) => {
        calls.push(`record:${record.record_type}`);
        if (scenario.failRecord && record.record_type === 'FIX_PREPARED_V1') {
          throw preMutationFailure('comment could not be observed', { boundary: 'pr_comment' });
        }
        return { status: 'created' };
      },
    };
    const git = {
      remoteBranchHead: async () => 'source-sha',
      materializePreparedFix: async () => {
        calls.push('commit');
        return { status: 'created', worktree: 'stage-worktree', preparedStageSha: 'prepared-sha' };
      },
      pushPreparedStage: async () => {
        calls.push('push');
        throw preMutationFailure('remote could not be observed', { boundary: 'prepared_stage_push' });
      },
    };
    const lifecycle = new LifecycleController({ repository: 'owner/repo', github, git });
    await assert.rejects(
      lifecycle.prepareFix(prepareFixCommand()),
      (error) => error.details.failure_class === FAILURE_CLASS.POST_MUTATION_UNCERTAIN
        && error.details.boundary === scenario.expectedBoundary,
      scenario.label,
    );
    assert.deepEqual(calls, scenario.expectedCalls, scenario.label);
  }
});

test('record-acceptance isolates Fix and Stage targets even when acceptance IDs are equal', async () => {
  const prepared = preparedFixture();
  const fixComments = [prepared.preparation, prepared.verification]
    .map((record) => ({ body: formatRecordEnvelope(record) }));
  fixComments.push({ body: formatRecordEnvelope(prepared.handoff, RECORD_MARKERS.fix_handoff) });
  const published = [];
  const github = {
    comments: async () => fixComments,
    pullRequestFacts: async () => ({ number: 7, state: 'OPEN', isDraft: false, headRefName: 'stage/wf/S01', headRefOid: 'prepared-sha', baseRefName: 'main', baseRefOid: 'base', labels: [] }),
    publishStructuredRecord: async (_repository, _pr, record) => { published.push(record); return { status: 'created' }; },
  };
  const lifecycle = new LifecycleController({ repository: 'owner/repo', github, git: { remoteBranchHead: async () => 'prepared-sha' } });
  await lifecycle.recordAcceptance('FIX_BUNDLE_ACCEPTANCE_V1', { pull_request_number: 7, record: prepared.acceptance });
  assert.deepEqual(published[0], prepared.acceptance);
  await assert.rejects(
    lifecycle.recordAcceptance('STAGE_ACCEPTANCE_V1', { pull_request_number: 7, record: prepared.acceptance }),
    (error) => error.details.failure_class === 'PRE_MUTATION_FAILURE' && /does not match/.test(error.message),
  );
});

test('record-acceptance rejects false, missing, stale, ambiguous, or mismatched Fix binding before publication', async () => {
  const cases = [
    {
      label: 'mismatched verification ID',
      mutate({ prepared, records }) {
        records.push({ ...prepared.verification, verification_id: 'verification-2', event_id: 'event-2' });
        prepared.acceptance.verification_id = 'verification-2';
      },
    },
    {
      label: 'wrong handoff lineage',
      mutate({ prepared }) {
        prepared.handoff.fix_preparation_id = 'preparation-other';
      },
    },
    {
      label: 'stale PASS',
      mutate({ prepared }) {
        prepared.verification.stage_sha = 'stale-sha';
      },
    },
    {
      label: 'failed verification',
      mutate({ prepared }) {
        prepared.verification.result = 'FAIL';
      },
    },
    {
      label: 'missing verification',
      mutate({ records }) {
        records.length = 1;
      },
    },
    {
      label: 'ambiguous verification',
      mutate({ prepared, records }) {
        records.push({ ...prepared.verification, event_id: 'event-other' });
      },
    },
    {
      label: 'missing handoff',
      mutate({ handoffs }) {
        handoffs.length = 0;
      },
    },
    {
      label: 'ambiguous handoff',
      mutate({ prepared, handoffs }) {
        handoffs.push({ ...prepared.handoff });
      },
    },
  ];

  for (const scenario of cases) {
    const prepared = preparedFixture();
    const records = [prepared.preparation, prepared.verification];
    const handoffs = [prepared.handoff];
    scenario.mutate({ prepared, records, handoffs });
    const durableComments = records.map((record) => ({ body: formatRecordEnvelope(record) }));
    durableComments.push(...handoffs.map((handoff) => ({ body: formatRecordEnvelope(handoff, RECORD_MARKERS.fix_handoff) })));
    const before = structuredClone(durableComments);
    const publications = [];
    const github = {
      comments: async () => durableComments,
      pullRequestFacts: async () => ({
        number: 7, state: 'OPEN', isDraft: false, headRefName: 'stage/wf/S01', headRefOid: 'prepared-sha',
        baseRefName: 'main', baseRefOid: 'base', labels: [],
      }),
      publishStructuredRecord: async (_repository, _pr, record) => {
        publications.push(record);
        durableComments.push({ body: formatRecordEnvelope(record) });
        return { status: 'created' };
      },
    };
    const lifecycle = new LifecycleController({
      repository: 'owner/repo',
      github,
      git: { remoteBranchHead: async () => 'prepared-sha' },
    });

    await assert.rejects(
      lifecycle.recordAcceptance('FIX_BUNDLE_ACCEPTANCE_V1', {
        pull_request_number: 7,
        record: prepared.acceptance,
      }),
      (error) => error.status === 'needs_decision'
        && error.details.failure_class === FAILURE_CLASS.PRE_MUTATION_FAILURE,
      scenario.label,
    );
    assert.deepEqual(publications, [], scenario.label);
    assert.deepEqual(durableComments, before, scenario.label);
  }
});

function closureRecords() {
  const review = {
    record_type: 'FORMAL_REVIEW_V1', review_id: 'review-1', review_handoff_id: 'review-handoff-1', verification_id: 'verification-1',
    workflow_id: 'wf-increment-016-github-review-fix-acceptance-closure', stage_id: 'S01-review-fix-acceptance-closure',
    repository: 'Reminnd/coding-room', pull_request_number: 7,
    stage_branch: 'stage/wf-increment-016-github-review-fix-acceptance-closure/S01-review-fix-acceptance-closure',
    reviewed_stage_sha: 'accepted-sha', decision: 'PASS', decision_authority: 'chatgpt_fixed_chat',
    source_reference: reviewReference, finding_ids: [],
  };
  const acceptance = {
    record_type: 'STAGE_ACCEPTANCE_V1', acceptance_id: 'acceptance-1', review_id: 'review-1', handoff_id: 'review-handoff-1',
    verification_id: 'verification-1', accepted_stage_sha: 'accepted-sha', decision: 'accepted', decision_authority: 'user',
    source_reference: userReference,
  };
  const authorization = {
    record_type: 'STAGE_CLOSURE_AUTHORIZATION_V1', closure_authorization_id: 'authorization-1', stage_acceptance_id: 'acceptance-1',
    review_id: 'review-1', repository: 'Reminnd/coding-room',
    stage_branch: 'stage/wf-increment-016-github-review-fix-acceptance-closure/S01-review-fix-acceptance-closure',
    accepted_stage_sha: 'accepted-sha', expected_main_sha: '02ca6e1fa54c6aad2120da42f2bd951ae0e6039e',
    exact_refspec: 'accepted-sha:refs/heads/main', force: false, execution_semantics: 'non_force_fast_forward_only',
    decision: 'authorized', decision_authority: 'user', source_reference: userReference,
  };
  return [review, acceptance, authorization];
}

function closureContext(mainSha) {
  const calls = [];
  const comments = closureRecords().map((record) => ({ body: formatRecordEnvelope(record) }));
  const branch = closureRecords()[2].stage_branch;
  comments.push({ body: formatRecordEnvelope({
    record_type: 'STAGE_VERIFICATION_V1', verification_id: 'verification-1', event_id: 'event-1',
    workflow_id: 'wf-increment-016-github-review-fix-acceptance-closure', stage_id: 'S01-review-fix-acceptance-closure',
    stage_sha: 'accepted-sha', result: 'PASS', checks: [], record_authority: 'github_actions',
  }) });
  comments.push({ body: formatRecordEnvelope({
    status: 'ready_for_chat_review', repository: 'Reminnd/coding-room', pull_request_number: 7,
    workflow_id: 'wf-increment-016-github-review-fix-acceptance-closure', stage_id: 'S01-review-fix-acceptance-closure',
    base_branch: 'main', base_sha: '02ca6e1fa54c6aad2120da42f2bd951ae0e6039e', head_branch: branch,
    head_sha: 'accepted-sha', stage_contract_path: 'docs/stage.md', router_contract_path: 'docs/router.md',
    verification_id: 'verification-1', review_authority: 'chatgpt_fixed_chat', handoff_id: 'review-handoff-1',
  }, RECORD_MARKERS.review_handoff) });
  const github = {
    comments: async () => comments,
    pullRequestFacts: async () => ({ number: 7, state: 'OPEN', isDraft: false, headRefName: branch, headRefOid: 'accepted-sha', baseRefName: 'main', baseRefOid: mainSha, labels: [] }),
    publishStructuredRecord: async (_repository, _pr, record) => { calls.push(`record:${record.record_type}`); return { status: 'created' }; },
    projectTerminalLabels: async () => { calls.push('labels'); return { status: 'created' }; },
    closePullRequest: async () => { calls.push('close'); return { status: 'created' }; },
  };
  const git = {
    remoteBranchHead: async (name) => name === 'main' ? mainSha : 'accepted-sha',
    pushMain: async (accepted, expected) => { calls.push(`push:${accepted}:${expected}`); return { status: 'pushed' }; },
  };
  const lifecycle = new LifecycleController({ repository: 'Reminnd/coding-room', github, git, hostApproval: async () => { calls.push('approval'); return true; } });
  return { calls, lifecycle };
}

function statefulClosureContext(failure) {
  const expectedMainSha = '02ca6e1fa54c6aad2120da42f2bd951ae0e6039e';
  const branch = closureRecords()[2].stage_branch;
  const state = {
    mainSha: expectedMainSha,
    comments: closureRecords().map((record) => ({ body: formatRecordEnvelope(record) })),
    closedRecord: false,
    labelsApplied: false,
    pullRequestClosed: false,
  };
  state.comments.push({ body: formatRecordEnvelope({
    record_type: 'STAGE_VERIFICATION_V1', verification_id: 'verification-1', event_id: 'event-1',
    workflow_id: 'wf-increment-016-github-review-fix-acceptance-closure', stage_id: 'S01-review-fix-acceptance-closure',
    stage_sha: 'accepted-sha', result: 'PASS', checks: [], record_authority: 'github_actions',
  }) });
  state.comments.push({ body: formatRecordEnvelope({
    status: 'ready_for_chat_review', repository: 'Reminnd/coding-room', pull_request_number: 7,
    workflow_id: 'wf-increment-016-github-review-fix-acceptance-closure', stage_id: 'S01-review-fix-acceptance-closure',
    base_branch: 'main', base_sha: expectedMainSha, head_branch: branch, head_sha: 'accepted-sha',
    stage_contract_path: 'docs/stage.md', router_contract_path: 'docs/router.md',
    verification_id: 'verification-1', review_authority: 'chatgpt_fixed_chat', handoff_id: 'review-handoff-1',
  }, RECORD_MARKERS.review_handoff) });

  const attempts = [];
  const observations = { comments: 0, pullRequest: 0, remoteStage: 0, remoteMain: 0 };
  const writes = { push: 0, record: 0, labels: 0, close: 0 };
  const remainingFailures = new Set([failure]);
  const failOnce = (name) => remainingFailures.delete(name);
  const controller = () => new LifecycleController({
    repository: 'Reminnd/coding-room',
    github: {
      comments: async () => { observations.comments += 1; return state.comments; },
      pullRequestFacts: async () => {
        observations.pullRequest += 1;
        return {
          number: 7, state: state.pullRequestClosed ? 'CLOSED' : 'OPEN', isDraft: false,
          headRefName: branch, headRefOid: 'accepted-sha', baseRefName: 'main', baseRefOid: state.mainSha,
          labels: state.labelsApplied ? [{ name: 'codex-stage-closed' }] : [],
        };
      },
      publishStructuredRecord: async (_repository, _pr, record) => {
        attempts.push('record');
        if (state.closedRecord) return { status: 'reused' };
        if (failOnce('record_pre')) throw preMutationFailure('record observation failed', { boundary: 'pr_comment' });
        state.closedRecord = true;
        state.comments.push({ body: formatRecordEnvelope(record) });
        writes.record += 1;
        return { status: 'created' };
      },
      projectTerminalLabels: async () => {
        attempts.push('labels');
        if (state.labelsApplied) return { status: 'reused' };
        if (failOnce('labels_pre')) throw preMutationFailure('label observation failed', { boundary: 'terminal_label' });
        state.labelsApplied = true;
        writes.labels += 1;
        return { status: 'created' };
      },
      closePullRequest: async () => {
        attempts.push('close');
        if (state.pullRequestClosed) return { status: 'reused' };
        if (failOnce('close_pre')) throw preMutationFailure('close observation failed', { boundary: 'pr_close' });
        state.pullRequestClosed = true;
        writes.close += 1;
        return { status: 'created' };
      },
    },
    git: {
      remoteBranchHead: async (name) => {
        if (name === 'main') {
          observations.remoteMain += 1;
          return state.mainSha;
        }
        observations.remoteStage += 1;
        return 'accepted-sha';
      },
      pushMain: async () => {
        attempts.push('push');
        if (failOnce('push_pre')) throw preMutationFailure('main observation failed', { boundary: 'main_push' });
        state.mainSha = 'accepted-sha';
        writes.push += 1;
        if (failOnce('push_loss')) throw postMutationUncertain('main_push', 'main push response was lost');
        return { status: 'pushed' };
      },
    },
    hostApproval: async () => { attempts.push('approval'); return true; },
  });
  return { attempts, observations, writes, controller };
}

test('close-stage uses main tri-state, exact terminal order, and repairs without a second push', async () => {
  const expected = closureContext('02ca6e1fa54c6aad2120da42f2bd951ae0e6039e');
  const result = await expected.lifecycle.closeStage({ pull_request_number: 7, closure_authorization_id: 'authorization-1', closure_id: 'closure-1' });
  assert.equal(result.pushed, true);
  assert.deepEqual(expected.calls, [
    'approval',
    'push:accepted-sha:02ca6e1fa54c6aad2120da42f2bd951ae0e6039e',
    'record:STAGE_CLOSED_V1',
    'labels',
    'close',
  ]);

  const already = closureContext('accepted-sha');
  const repaired = await already.lifecycle.closeStage({ pull_request_number: 7, closure_authorization_id: 'authorization-1', closure_id: 'closure-1' });
  assert.equal(repaired.pushed, false);
  assert.deepEqual(already.calls, ['record:STAGE_CLOSED_V1', 'labels', 'close']);

  const third = closureContext('third-sha');
  await assert.rejects(
    third.lifecycle.closeStage({ pull_request_number: 7, closure_authorization_id: 'authorization-1', closure_id: 'closure-1' }),
    (error) => error.details.failure_class === FAILURE_CLASS.PRE_MUTATION_FAILURE,
  );
  assert.deepEqual(third.calls, []);

  const scenarios = [
    ['push_loss', 'main_push', ['approval', 'push'], { push: 1, record: 0, labels: 0, close: 0 }],
    ['record_pre', 'pr_comment', ['approval', 'push', 'record'], { push: 1, record: 0, labels: 0, close: 0 }],
    ['labels_pre', 'terminal_label', ['approval', 'push', 'record', 'labels'], { push: 1, record: 1, labels: 0, close: 0 }],
    ['close_pre', 'pr_close', ['approval', 'push', 'record', 'labels', 'close'], { push: 1, record: 1, labels: 1, close: 0 }],
  ];

  for (const [failure, boundary, firstAttempts, firstWrites] of scenarios) {
    const context = statefulClosureContext(failure);
    await assert.rejects(
      context.controller().closeStage({ pull_request_number: 7, closure_authorization_id: 'authorization-1', closure_id: 'closure-1' }),
      (error) => error.details.failure_class === FAILURE_CLASS.POST_MUTATION_UNCERTAIN
        && error.details.boundary === boundary,
      failure,
    );
    assert.deepEqual(context.attempts, firstAttempts, failure);
    assert.deepEqual(context.writes, firstWrites, failure);

    const recovered = await context.controller().closeStage({
      pull_request_number: 7,
      closure_authorization_id: 'authorization-1',
      closure_id: 'closure-1',
    });
    assert.deepEqual(recovered, { status: 'closed', accepted_stage_sha: 'accepted-sha', pushed: false }, failure);
    assert.equal(context.attempts.filter((item) => item === 'approval').length, 1, failure);
    assert.equal(context.attempts.filter((item) => item === 'push').length, 1, failure);
    assert.deepEqual(context.writes, { push: 1, record: 1, labels: 1, close: 1 }, failure);
    assert.deepEqual(context.observations, { comments: 2, pullRequest: 2, remoteStage: 2, remoteMain: 2 }, failure);
  }

  const beforePush = statefulClosureContext('push_pre');
  await assert.rejects(
    beforePush.controller().closeStage({ pull_request_number: 7, closure_authorization_id: 'authorization-1', closure_id: 'closure-1' }),
    (error) => error.details.failure_class === FAILURE_CLASS.PRE_MUTATION_FAILURE
      && error.details.boundary === 'main_push',
  );
  assert.deepEqual(beforePush.attempts, ['approval', 'push']);
  assert.deepEqual(beforePush.writes, { push: 0, record: 0, labels: 0, close: 0 });

  const invalidRecord = closureContext('02ca6e1fa54c6aad2120da42f2bd951ae0e6039e');
  await assert.rejects(
    invalidRecord.lifecycle.closeStage({ pull_request_number: 7, closure_authorization_id: 'authorization-1', closure_id: '' }),
    (error) => error.details.failure_class === FAILURE_CLASS.PRE_MUTATION_FAILURE,
  );
  assert.deepEqual(invalidRecord.calls, []);
});

test('handoff markers remain distinct at the public lifecycle boundary', () => {
  assert.notEqual(RECORD_MARKERS.review_handoff, RECORD_MARKERS.fix_handoff);
});
