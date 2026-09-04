import assert from 'node:assert/strict';
import test from 'node:test';
import { BRIDGE_MARKER, CANDIDATE_MARKER, DISPATCH_MARKER, GitHubClient, latestTaskStates } from '../github.mjs';

function ok(stdout) {
  return { exitCode: 0, stdout, stderr: '', error: null };
}

test('discovers a labeled Stage PR and reconstructs Bridge task/mapping facts from comments', async () => {
  const event = {
    task_id: 'T01', status: 'task_integrated', source_task_sha: 'source', stage_commit_sha: 'stage',
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
  const state = latestTaskStates(found.events);
  assert.equal(state.states.get('T01'), 'integrated');
  assert.equal(state.mappings.get('T01').source_task_sha, 'source');
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
