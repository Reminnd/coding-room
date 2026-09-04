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
    { body: `${DISPATCH_MARKER}\n\nstatus: ready_for_codex_dispatch\nrepository: owner/repo\nworkflow_id: wf\nstage_id: S01\nrouter_contract_path: docs/router.md\ncontract_commit_sha: abc\nstage_branch: stage/wf/S01\nstage_head_sha: abc\nexecution_surface: local_codex` },
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

test('publishes exact Stage candidate facts and updates mechanical labels', async () => {
  const calls = [];
  const client = new GitHubClient({ run: async (_command, args) => { calls.push(args); return ok(''); } });
  await client.publishCandidate('owner/repo', 7, {
    workflow_id: 'wf', stage_id: 'S01', stage_branch: 'stage/wf/S01', stage_head_sha: 'abc', router_contract_path: 'docs/router.md', mappings: [{}],
  });
  assert.ok(calls[0].at(-1).includes(CANDIDATE_MARKER));
  assert.ok(calls[0].at(-1).includes('stage_head_sha: abc'));
  assert.ok(calls[0].at(-1).includes('task_mappings_json:'));
  assert.deepEqual(calls[1].slice(-2), ['--description', 'Local Codex Bridge integrated Stage candidate', '--force'].slice(-2));
  assert.deepEqual(calls[2].slice(-2), ['--add-label', 'codex-stage-candidate']);
  assert.deepEqual(calls[3].slice(-2), ['--remove-label', 'codex-dispatch-ready']);
});
