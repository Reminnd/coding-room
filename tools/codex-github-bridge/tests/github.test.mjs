import assert from 'node:assert/strict';
import test from 'node:test';
import { BRIDGE_MARKER, CANDIDATE_MARKER, DISPATCH_MARKER, GitHubClient, latestTaskStates } from '../github.mjs';
import { formatRecordEnvelope } from '../structured-records.mjs';

function ok(stdout) {
  return { exitCode: 0, stdout, stderr: '', error: null };
}

test('discovers a labeled Stage PR and reconstructs Bridge task/mapping facts from comments', async () => {
  const event = {
    repository: 'owner/repo', workflow_id: 'wf', stage_id: 'S01', stage_branch: 'stage/wf/S01',
    task_id: 'T01', dispatch_id: 'dispatch-1', status: 'task_integrated', source_task_sha: 'source', stage_commit_sha: 'stage',
  };
  const comments = [[
    { body: `${DISPATCH_MARKER}\n\nstatus: dispatch_ready\nrepository: owner/repo\nworkflow_id: wf\nstage_id: S01\nrouter_contract_path: docs/router.md\ncontract_commit_sha: abc\nstage_branch: stage/wf/S01\nstage_head_sha: abc\nexecution_surface: local_codex` },
    { body: `${BRIDGE_MARKER}\n\n\`\`\`json\n${JSON.stringify(event)}\n\`\`\`` },
  ]];
  const run = async (_command, args) => {
    if (args[0] === 'pr' && args[1] === 'list') return ok(JSON.stringify([{ number: 7, headRefName: 'stage/wf/S01', headRefOid: 'abc', url: 'https://example.test/pr/7', labels: [] }]));
    if (args[0] === 'api') return ok(JSON.stringify(comments));
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  };
  const client = new GitHubClient({ run });
  const [found] = await client.discover('owner/repo');
  assert.equal(found.handoff.execution_surface, 'local_codex');
  assert.equal(found.events[0].stage_commit_sha, 'stage');
  const state = latestTaskStates(found.events, {
    repository: 'owner/repo', workflow_id: 'wf', stage_id: 'S01', stage_branch: 'stage/wf/S01',
    tasks: [{ task_id: 'T01', dispatch_id: 'dispatch-1' }],
  });
  assert.equal(state.states.get('T01'), 'integrated');
  assert.equal(state.mappings.get('T01').source_task_sha, 'source');
});

test('reconstructs state only from the current Router task and dispatch identity', () => {
  const base = {
    repository: 'owner/repo', workflow_id: 'wf', stage_id: 'S01', stage_branch: 'stage/wf/S01', task_id: 'T01',
  };
  const state = latestTaskStates([
    { ...base, dispatch_id: 'dispatch-old', status: 'task_integrated', source_task_sha: 'old', stage_commit_sha: 'old-stage' },
    { ...base, dispatch_id: 'dispatch-current', status: 'task_dispatched' },
    { ...base, repository: 'other/repo', dispatch_id: 'dispatch-current', status: 'task_integrated' },
    { ...base, task_id: 'removed-task', dispatch_id: 'dispatch-current', status: 'task_integrated' },
    { ...base, dispatch_id: 'dispatch-current', status: 'unknown_status' },
  ], {
    repository: 'owner/repo', workflow_id: 'wf', stage_id: 'S01', stage_branch: 'stage/wf/S01',
    tasks: [{ task_id: 'T01', dispatch_id: 'dispatch-current' }],
  });
  assert.equal(state.states.get('T01'), 'dispatched');
  assert.equal(state.mappings.has('T01'), false);
});

test('repository bootstrap performs zero writes when required Actions settings are ready', async () => {
  const calls = [];
  const client = new GitHubClient({ run: async (_command, args, options = {}) => {
    calls.push({ args, options });
    if (args.at(-1) === 'repos/owner/repo/actions/permissions') return ok('{"enabled":true}');
    if (args.at(-1) === 'repos/owner/repo/actions/permissions/workflow') {
      return ok('{"default_workflow_permissions":"read","can_approve_pull_request_reviews":true}');
    }
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  } });

  const result = await client.bootstrapActions('owner/repo');
  assert.equal(result.status, 'ready');
  assert.equal(result.default_workflow_permissions, 'read');
  assert.equal(result.mutation_performed, false);
  assert.equal(calls.filter((call) => call.args.includes('PUT')).length, 0);
  assert.equal(calls.length, 2);
});

test('repository bootstrap mutates each missing setting once, re-reads it once, and preserves default workflow permissions', async () => {
  let actionsReads = 0;
  let workflowReads = 0;
  const calls = [];
  const client = new GitHubClient({ run: async (_command, args, options = {}) => {
    calls.push({ args, options });
    const endpoint = args.find((value) => value.startsWith('repos/'));
    const method = args[args.indexOf('--method') + 1];
    if (endpoint.endsWith('/actions/permissions') && method === 'GET') return ok(JSON.stringify({ enabled: actionsReads++ > 0 }));
    if (endpoint.endsWith('/actions/permissions') && method === 'PUT') return ok('');
    if (endpoint.endsWith('/actions/permissions/workflow') && method === 'GET') {
      return ok(JSON.stringify({ default_workflow_permissions: 'read', can_approve_pull_request_reviews: workflowReads++ > 0 }));
    }
    if (endpoint.endsWith('/actions/permissions/workflow') && method === 'PUT') return ok('');
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  } });

  const result = await client.bootstrapActions('owner/repo');
  const writes = calls.filter((call) => call.args.includes('PUT'));
  assert.equal(actionsReads, 2);
  assert.equal(workflowReads, 2);
  assert.equal(writes.length, 2);
  assert.deepEqual(JSON.parse(writes[0].options.input), { enabled: true });
  assert.deepEqual(JSON.parse(writes[1].options.input), {
    default_workflow_permissions: 'read', can_approve_pull_request_reviews: true,
  });
  assert.equal(result.default_workflow_permissions, 'read');
  assert.equal(result.mutation_performed, true);
});

test('repository bootstrap maps administration or policy rejection to needs_decision without retry', async () => {
  let writeCalls = 0;
  const client = new GitHubClient({ run: async (_command, args) => {
    const method = args[args.indexOf('--method') + 1];
    if (method === 'GET') return ok('{"enabled":false}');
    writeCalls += 1;
    return { exitCode: 1, stdout: '', stderr: 'policy rejects update', error: null };
  } });

  await assert.rejects(
    client.bootstrapActions('owner/repo'),
    (error) => error.status === 'needs_decision' && /enable failed/.test(error.message),
  );
  assert.equal(writeCalls, 1);
});

test('does not discover the old dispatch marker or old handoff status as Current', async () => {
  const prs = [
    { number: 7, headRefName: 'stage/wf/S01', headRefOid: 'abc', url: 'https://example.test/pr/7', labels: [] },
    { number: 8, headRefName: 'stage/wf/S02', headRefOid: 'def', url: 'https://example.test/pr/8', labels: [] },
  ];
  const comments = new Map([
    [7, [[{ body: '<!-- CODEX_DISPATCH_HANDOFF_V1 -->\n\nstatus: dispatch_ready' }]]],
    [8, [[{ body: `${DISPATCH_MARKER}\n\nstatus: ready_for_codex_dispatch` }]]],
  ]);
  const run = async (_command, args) => {
    if (args[0] === 'pr' && args[1] === 'list') return ok(JSON.stringify(prs));
    if (args[0] === 'api') {
      const prNumber = Number(/issues\/(\d+)\/comments/.exec(args.at(-1))[1]);
      return ok(JSON.stringify(comments.get(prNumber)));
    }
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  };

  const client = new GitHubClient({ run });
  assert.deepEqual(await client.discover('owner/repo'), []);
});

test('publishes exact Stage candidate facts and updates mechanical labels', async () => {
  const calls = [];
  const comments = [];
  let labels = ['codex-dispatch-ready'];
  let repositoryLabels = [];
  const client = new GitHubClient({ run: async (_command, args, options = {}) => {
    calls.push({ args, options });
    if (args[0] === 'api' && args.includes('--paginate')) return ok(JSON.stringify([comments]));
    if (args[0] === 'pr' && args[1] === 'comment') {
      comments.push({ body: args.at(-1) });
      return ok('');
    }
    if (args[0] === 'pr' && args[1] === 'view') {
      return ok(JSON.stringify({ number: 7, state: 'OPEN', isDraft: true, headRefName: 'stage/wf/S01', headRefOid: 'abc', baseRefName: 'main', baseRefOid: 'base', labels: labels.map((name) => ({ name })) }));
    }
    if (args[0] === 'pr' && args[1] === 'edit') {
      labels = ['codex-stage-candidate'];
      return ok('');
    }
    if (args[0] === 'label' && args[1] === 'list') return ok(JSON.stringify(repositoryLabels.map((name) => ({ name }))));
    if (args[0] === 'label' && args[1] === 'create') {
      repositoryLabels = ['codex-stage-candidate'];
      return ok('');
    }
    return ok('');
  } });
  await client.publishCandidate('owner/repo', 7, {
    workflow_id: 'wf', stage_id: 'S01', stage_branch: 'stage/wf/S01', stage_head_sha: 'abc', router_contract_path: 'docs/router.md', mappings: [{}],
  });
  const writes = calls.filter((call) => (call.args[0] === 'label' && call.args[1] === 'create')
    || (call.args[0] === 'pr' && ['comment', 'edit'].includes(call.args[1]))
    || (call.args[0] === 'api' && call.args.includes('POST')));
  assert.ok(writes[0].args.at(-1).includes(CANDIDATE_MARKER));
  assert.ok(writes[0].args.at(-1).includes('stage_head_sha: abc'));
  assert.ok(writes[0].args.at(-1).includes('task_mappings_json:'));
  assert.ok(writes[1].args.includes('--force'));
  assert.ok(writes[2].args.includes('codex-stage-candidate'));
  assert.ok(writes[2].args.includes('codex-dispatch-ready'));
  assert.deepEqual(writes[3].args, ['api', '--method', 'POST', 'repos/owner/repo/dispatches', '--input', '-']);
  assert.deepEqual(JSON.parse(writes[3].options.input), {
    event_type: 'stage_candidate_ready',
    client_payload: {
      status: 'candidate_ready',
      repository: 'owner/repo',
      pr_number: 7,
      workflow_id: 'wf',
      stage_id: 'S01',
      router_contract_path: 'docs/router.md',
      stage_branch: 'stage/wf/S01',
      stage_head_sha: 'abc',
    },
  });
  assert.equal(writes.length, 4);
});

const candidateFacts = {
  workflow_id: 'wf',
  stage_id: 'S01',
  stage_branch: 'stage/wf/S01',
  stage_head_sha: 'abc',
  router_contract_path: 'docs/router.md',
  mappings: [{ task_id: 'T01', source_task_sha: 'task-sha', stage_commit_sha: 'abc' }],
};

function candidateBody() {
  return [
    CANDIDATE_MARKER,
    '',
    'status: candidate_ready',
    'repository: owner/repo',
    'workflow_id: wf',
    'stage_id: S01',
    'stage_branch: stage/wf/S01',
    'stage_head_sha: abc',
    'router_contract_path: docs/router.md',
    'mapping_count: 1',
    'task_mappings_json: [{"task_id":"T01","source_task_sha":"task-sha","stage_commit_sha":"abc"}]',
  ].join('\n');
}

function stageVerificationComment() {
  return formatRecordEnvelope({
    record_type: 'STAGE_VERIFICATION_V1',
    verification_id: 'verification-1',
    event_id: 'event-1',
    workflow_id: 'wf',
    stage_id: 'S01',
    stage_sha: 'abc',
    result: 'PASS',
    checks: [{ name: 'bridge', result: 'PASS' }],
    record_authority: 'github_actions',
  });
}

function candidateHarness({
  commentPresent = false,
  downstreamPresent = false,
  repositoryLabelPresent = false,
  pullRequestProjectionPresent = false,
  observationFailure = null,
  responseLoss = null,
} = {}) {
  const comments = commentPresent ? [{ body: candidateBody() }] : [];
  if (downstreamPresent) comments.push({ body: stageVerificationComment() });
  let repositoryLabels = repositoryLabelPresent ? ['codex-stage-candidate'] : [];
  let pullRequestLabels = pullRequestProjectionPresent ? ['codex-stage-candidate'] : ['codex-dispatch-ready'];
  let failureConsumed = false;
  const writes = { comment: 0, repositoryLabel: 0, pullRequestLabel: 0, dispatch: 0 };
  const failOnce = (point) => {
    if (failureConsumed || observationFailure !== point) return false;
    failureConsumed = true;
    return true;
  };
  const client = new GitHubClient({ run: async (_command, args) => {
    if (args[0] === 'api' && args.includes('--paginate')) {
      const labelsApplied = repositoryLabels.includes('codex-stage-candidate')
        && pullRequestLabels.includes('codex-stage-candidate')
        && !pullRequestLabels.includes('codex-dispatch-ready');
      if (observationFailure === 'repository_dispatch' && labelsApplied && failOnce('repository_dispatch')) {
        return { exitCode: 1, stdout: '', stderr: 'dispatch observation failed', error: null };
      }
      return ok(JSON.stringify([comments]));
    }
    if (args[0] === 'pr' && args[1] === 'comment') {
      writes.comment += 1;
      comments.push({ body: args.at(-1) });
      return ok('');
    }
    if (args[0] === 'label' && args[1] === 'list') {
      if (failOnce('repository_label')) return { exitCode: 1, stdout: '', stderr: 'label observation failed', error: null };
      return ok(JSON.stringify(repositoryLabels.map((name) => ({ name }))));
    }
    if (args[0] === 'label' && args[1] === 'create') {
      writes.repositoryLabel += 1;
      repositoryLabels = ['codex-stage-candidate'];
      if (responseLoss === 'repository_label') return { exitCode: 1, stdout: '', stderr: 'label response lost', error: null };
      return ok('');
    }
    if (args[0] === 'pr' && args[1] === 'view') {
      if (failOnce('pull_request_label')) return { exitCode: 1, stdout: '', stderr: 'PR label observation failed', error: null };
      return ok(JSON.stringify({
        number: 7,
        state: 'OPEN',
        isDraft: true,
        headRefName: 'stage/wf/S01',
        headRefOid: 'abc',
        baseRefName: 'main',
        baseRefOid: 'base',
        labels: pullRequestLabels.map((name) => ({ name })),
      }));
    }
    if (args[0] === 'pr' && args[1] === 'edit') {
      writes.pullRequestLabel += 1;
      pullRequestLabels = ['codex-stage-candidate'];
      if (responseLoss === 'pull_request_label') return { exitCode: 1, stdout: '', stderr: 'PR label response lost', error: null };
      return ok('');
    }
    if (args[0] === 'api' && args.includes('POST')) {
      writes.dispatch += 1;
      if (responseLoss === 'repository_dispatch') return { exitCode: 1, stdout: '', stderr: 'dispatch response lost', error: null };
      return ok('');
    }
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  } });
  return {
    client,
    writes,
    addDownstream: () => comments.push({ body: stageVerificationComment() }),
  };
}

test('candidate publication preserves invocation-wide mutation classification and idempotent recovery', async (t) => {
  await t.test('current comment write followed by label observation failure is POST', async () => {
    const harness = candidateHarness({ observationFailure: 'repository_label' });
    await assert.rejects(
      harness.client.publishCandidate('owner/repo', 7, candidateFacts),
      (error) => error.details.failure_class === 'POST_MUTATION_UNCERTAIN'
        && error.details.boundary === 'label_projection',
    );
    assert.deepEqual(harness.writes, { comment: 1, repositoryLabel: 0, pullRequestLabel: 0, dispatch: 0 });
  });

  await t.test('pre-existing comment followed by label observation failure remains PRE', async () => {
    const harness = candidateHarness({ commentPresent: true, observationFailure: 'repository_label' });
    await assert.rejects(
      harness.client.publishCandidate('owner/repo', 7, candidateFacts),
      (error) => error.details.failure_class === 'PRE_MUTATION_FAILURE'
        && error.details.boundary === 'label_projection',
    );
    assert.deepEqual(harness.writes, { comment: 0, repositoryLabel: 0, pullRequestLabel: 0, dispatch: 0 });
  });

  await t.test('comment write followed by uncertain label write stops before dependent mutations', async () => {
    const harness = candidateHarness({ responseLoss: 'repository_label' });
    await assert.rejects(
      harness.client.publishCandidate('owner/repo', 7, candidateFacts),
      (error) => error.details.failure_class === 'POST_MUTATION_UNCERTAIN'
        && error.details.boundary === 'label_projection'
        && error.details.effect_observed === true,
    );
    assert.deepEqual(harness.writes, { comment: 1, repositoryLabel: 1, pullRequestLabel: 0, dispatch: 0 });
  });

  await t.test('comment and label writes followed by dispatch observation failure are POST', async () => {
    const harness = candidateHarness({ observationFailure: 'repository_dispatch' });
    await assert.rejects(
      harness.client.publishCandidate('owner/repo', 7, candidateFacts),
      (error) => error.details.failure_class === 'POST_MUTATION_UNCERTAIN'
        && error.details.boundary === 'repository_dispatch',
    );
    assert.deepEqual(harness.writes, { comment: 1, repositoryLabel: 1, pullRequestLabel: 1, dispatch: 0 });
  });

  await t.test('comment and label writes followed by uncertain dispatch do not retry', async () => {
    const harness = candidateHarness({ responseLoss: 'repository_dispatch' });
    await assert.rejects(
      harness.client.publishCandidate('owner/repo', 7, candidateFacts),
      (error) => error.details.failure_class === 'POST_MUTATION_UNCERTAIN'
        && error.details.boundary === 'repository_dispatch',
    );
    assert.deepEqual(harness.writes, { comment: 1, repositoryLabel: 1, pullRequestLabel: 1, dispatch: 1 });
  });

  await t.test('fresh retry reuses comment and repairs only proven-missing label projections', async () => {
    const harness = candidateHarness({ commentPresent: true, downstreamPresent: true });
    assert.equal((await harness.client.publishCandidate('owner/repo', 7, candidateFacts)).status, 'reused');
    assert.deepEqual(harness.writes, { comment: 0, repositoryLabel: 1, pullRequestLabel: 1, dispatch: 0 });
  });

  await t.test('fresh retry repairs only the missing PR label projection', async () => {
    const harness = candidateHarness({ commentPresent: true, downstreamPresent: true, repositoryLabelPresent: true });
    assert.equal((await harness.client.publishCandidate('owner/repo', 7, candidateFacts)).status, 'reused');
    assert.deepEqual(harness.writes, { comment: 0, repositoryLabel: 0, pullRequestLabel: 1, dispatch: 0 });
  });

  await t.test('pre-existing comment and labels without downstream authority do not trigger blind dispatch', async () => {
    const harness = candidateHarness({ commentPresent: true, repositoryLabelPresent: true, pullRequestProjectionPresent: true });
    await assert.rejects(
      harness.client.publishCandidate('owner/repo', 7, candidateFacts),
      (error) => error.details.failure_class === 'PRE_MUTATION_FAILURE'
        && error.details.boundary === 'repository_dispatch',
    );
    assert.deepEqual(harness.writes, { comment: 0, repositoryLabel: 0, pullRequestLabel: 0, dispatch: 0 });
  });

  await t.test('all existing projections are reused without duplicate external writes', async () => {
    const harness = candidateHarness({
      commentPresent: true,
      downstreamPresent: true,
      repositoryLabelPresent: true,
      pullRequestProjectionPresent: true,
    });
    assert.equal((await harness.client.publishCandidate('owner/repo', 7, candidateFacts)).status, 'reused');
    assert.deepEqual(harness.writes, { comment: 0, repositoryLabel: 0, pullRequestLabel: 0, dispatch: 0 });
  });

  await t.test('fresh invocation after downstream confirmation does not duplicate a successful candidate', async () => {
    const harness = candidateHarness();
    await harness.client.publishCandidate('owner/repo', 7, candidateFacts);
    assert.deepEqual(harness.writes, { comment: 1, repositoryLabel: 1, pullRequestLabel: 1, dispatch: 1 });
    harness.addDownstream();
    assert.equal((await harness.client.publishCandidate('owner/repo', 7, candidateFacts)).status, 'reused');
    assert.deepEqual(harness.writes, { comment: 1, repositoryLabel: 1, pullRequestLabel: 1, dispatch: 1 });
  });
});

function stageAcceptance(overrides = {}) {
  return {
    record_type: 'STAGE_ACCEPTANCE_V1', acceptance_id: 'acceptance-1', review_id: 'review-1', handoff_id: 'handoff-1',
    verification_id: 'verification-1', accepted_stage_sha: 'stage-sha', decision: 'accepted', decision_authority: 'user',
    source_reference: { source_kind: 'fixed_chat_user_decision', decision_reference: 'user-message-1' },
    ...overrides,
  };
}

test('structured PR comment publication reuses exact typed payload and rejects conflict before write', async () => {
  const comments = [];
  let writes = 0;
  const client = new GitHubClient({ run: async (_command, args) => {
    if (args[0] === 'api') return ok(JSON.stringify([comments]));
    if (args[0] === 'pr' && args[1] === 'comment') {
      writes += 1;
      comments.push({ body: args.at(-1) });
      return ok('');
    }
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  } });
  const record = stageAcceptance();
  assert.equal((await client.publishStructuredRecord('owner/repo', 7, record)).status, 'created');
  assert.equal((await client.publishStructuredRecord('owner/repo', 7, record)).status, 'reused');
  assert.equal(writes, 1);

  await assert.rejects(
    client.publishStructuredRecord('owner/repo', 7, stageAcceptance({ accepted_stage_sha: 'other-sha' })),
    (error) => error.details.failure_class === 'PRE_MUTATION_FAILURE' && /conflicting payload/.test(error.message),
  );
  assert.equal(writes, 1);
});

test('PR comment and terminal label projections preserve mutation uncertainty', async () => {
  const comments = [];
  const client = new GitHubClient({ run: async (_command, args) => {
    if (args[0] === 'api') return ok(JSON.stringify([comments]));
    if (args[0] === 'pr' && args[1] === 'comment') {
      comments.push({ body: args.at(-1) });
      return { exitCode: 1, stdout: '', stderr: 'response lost', error: null };
    }
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  } });
  await assert.rejects(
    client.publishStructuredRecord('owner/repo', 7, stageAcceptance()),
    (error) => error.details.failure_class === 'POST_MUTATION_UNCERTAIN' && error.details.effect_observed === true,
  );

  let repositoryLabels = [];
  let pullRequestLabels = ['chat-review'];
  let pullRequestObservationFailures = 1;
  let repositoryLabelWrites = 0;
  let pullRequestLabelWrites = 0;
  const labelClient = new GitHubClient({ run: async (_command, args) => {
    if (args[0] === 'label' && args[1] === 'list') {
      return ok(JSON.stringify(repositoryLabels.map((name) => ({ name }))));
    }
    if (args[0] === 'label' && args[1] === 'create') {
      repositoryLabelWrites += 1;
      repositoryLabels = ['codex-stage-closed'];
      return ok('');
    }
    if (args[0] === 'pr' && args[1] === 'view') {
      if (pullRequestObservationFailures-- > 0) {
        return { exitCode: 1, stdout: '', stderr: 'observation failed', error: null };
      }
      return ok(JSON.stringify({
        number: 7, state: 'OPEN', isDraft: false, headRefName: 'stage/wf/S01', headRefOid: 'abc',
        baseRefName: 'main', baseRefOid: 'base', labels: pullRequestLabels.map((name) => ({ name })),
      }));
    }
    if (args[0] === 'pr' && args[1] === 'edit') {
      pullRequestLabelWrites += 1;
      pullRequestLabels = ['codex-stage-closed'];
      return ok('');
    }
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  } });

  await assert.rejects(
    labelClient.projectTerminalLabels('owner/repo', 7),
    (error) => error.details.failure_class === 'POST_MUTATION_UNCERTAIN'
      && error.details.boundary === 'terminal_label',
  );
  assert.deepEqual([repositoryLabelWrites, pullRequestLabelWrites], [1, 0]);

  assert.equal((await labelClient.projectTerminalLabels('owner/repo', 7)).status, 'created');
  assert.equal((await labelClient.projectTerminalLabels('owner/repo', 7)).status, 'reused');
  assert.deepEqual([repositoryLabelWrites, pullRequestLabelWrites], [1, 1]);

  const zeroWriteClient = new GitHubClient({ run: async (_command, args) => {
    if (args[0] === 'label' && args[1] === 'list') {
      return ok('[{"name":"codex-stage-closed"}]');
    }
    if (args[0] === 'pr' && args[1] === 'view') {
      return { exitCode: 1, stdout: '', stderr: 'observation failed', error: null };
    }
    throw new Error(`unexpected mutation: ${args.join(' ')}`);
  } });
  await assert.rejects(
    zeroWriteClient.projectTerminalLabels('owner/repo', 7),
    (error) => error.details.failure_class === 'PRE_MUTATION_FAILURE'
      && error.details.boundary === 'terminal_label',
  );
});

test('ready and Draft projections read before write and preserve response-loss uncertainty', async () => {
  let isDraft = true;
  let readyWrites = 0;
  const client = new GitHubClient({ run: async (_command, args) => {
    if (args[0] === 'pr' && args[1] === 'view') {
      return ok(JSON.stringify({
        number: 7, state: 'OPEN', isDraft, headRefName: 'stage/wf/S01', headRefOid: 'abc',
        baseRefName: 'main', baseRefOid: 'base', labels: [],
      }));
    }
    if (args[0] === 'pr' && args[1] === 'ready') {
      readyWrites += 1;
      isDraft = false;
      return { exitCode: 1, stdout: '', stderr: 'response lost', error: null };
    }
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  } });

  await assert.rejects(
    client.projectPullRequestReady('owner/repo', 7, true),
    (error) => error.details.failure_class === 'POST_MUTATION_UNCERTAIN'
      && error.details.boundary === 'ready_projection'
      && error.details.effect_observed === true,
  );
  assert.equal(readyWrites, 1);
  assert.equal((await client.projectPullRequestReady('owner/repo', 7, true)).status, 'reused');
  assert.equal(readyWrites, 1);
});

test('discovery preserves malformed Bridge lifecycle evidence instead of treating it as absent', async () => {
  const comments = [[
    { body: `${DISPATCH_MARKER}\n\nstatus: dispatch_ready\nrepository: owner/repo\nworkflow_id: wf\nstage_id: S01\nrouter_contract_path: docs/router.md\ncontract_commit_sha: abc\nstage_branch: stage/wf/S01\nstage_head_sha: abc\nexecution_surface: local_codex` },
    { body: `${BRIDGE_MARKER}\n\n\`\`\`json\n{"task_id":"T01","task_id":"T02"}\n\`\`\`` },
  ]];
  const client = new GitHubClient({ run: async (_command, args) => {
    if (args[0] === 'pr') return ok(JSON.stringify([{ number: 7, headRefName: 'stage/wf/S01', headRefOid: 'abc', url: 'url', labels: [] }]));
    return ok(JSON.stringify(comments));
  } });
  const [found] = await client.discover('owner/repo');
  assert.equal(found.events.length, 0);
  assert.equal(found.eventErrors.length, 1);
  assert.match(found.eventErrors[0], /duplicate JSON member/);
});
