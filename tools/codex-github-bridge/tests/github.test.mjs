import assert from 'node:assert/strict';
import test from 'node:test';
import { BRIDGE_MARKER, CANDIDATE_MARKER, DISPATCH_MARKER, GitHubClient, latestTaskStates } from '../github.mjs';

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
  const client = new GitHubClient({ run: async (_command, args, options = {}) => { calls.push({ args, options }); return ok(''); } });
  await client.publishCandidate('owner/repo', 7, {
    workflow_id: 'wf', stage_id: 'S01', stage_branch: 'stage/wf/S01', stage_head_sha: 'abc', router_contract_path: 'docs/router.md', mappings: [{}],
  });
  assert.ok(calls[0].args.at(-1).includes(CANDIDATE_MARKER));
  assert.ok(calls[0].args.at(-1).includes('stage_head_sha: abc'));
  assert.ok(calls[0].args.at(-1).includes('task_mappings_json:'));
  assert.deepEqual(calls[1].args.slice(-2), ['--description', 'Local Codex Bridge integrated Stage candidate', '--force'].slice(-2));
  assert.deepEqual(calls[2].args.slice(-2), ['--add-label', 'codex-stage-candidate']);
  assert.deepEqual(calls[3].args.slice(-2), ['--remove-label', 'codex-dispatch-ready']);
  assert.deepEqual(calls[4].args, ['api', '--method', 'POST', 'repos/owner/repo/dispatches', '--input', '-']);
  assert.deepEqual(JSON.parse(calls[4].options.input), {
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
  assert.equal(calls.length, 5);
});
