import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error The GitHub Actions boundary is intentionally a dependency-free .mjs script.
import { readRouterContract } from '../.github/scripts/read-router-contract.mjs';

const valid = {
  contract_type: 'router', contract_version: 1,
  work_id: 'wf-increment-015-github-workflow-foundation', stage_id: 'S01-foundation-pilot',
  task_id: 'T01-room-status-help', status: 'dispatch_ready', dispatch_id: 'wf15-s01-t01-dispatch-001',
  repository: 'Reminnd/coding-room',
  stage_branch: 'stage/wf-increment-015-github-workflow-foundation/S01-foundation-pilot',
  task_branch: 'task/wf-increment-015-github-workflow-foundation/T01-room-status-help',
  review: { authority: 'chatgpt_fixed_chat', transport: 'github_pull_request', work_event_task: 'notification_only', supervisor_may_approve: false, supervisor_may_merge: false },
  fix_policy: { mode: 'always_confirm' },
};
const document = (value: unknown = valid) => `# Router\n\n<!-- ROUTER_CONTRACT_V1 -->\n\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n`;

test('reads and normalizes a valid Router', () => assert.deepEqual(readRouterContract(document()), valid));
test('rejects a missing marker', () => assert.throws(() => readRouterContract(document().replace('<!-- ROUTER_CONTRACT_V1 -->', '')), /exactly one.*marker/));
test('rejects duplicate markers and blocks', () => {
  assert.throws(() => readRouterContract(`${document()}\n<!-- ROUTER_CONTRACT_V1 -->`), /exactly one.*marker/);
  assert.throws(() => readRouterContract(`${document()}\n\`\`\`json\n{}\n\`\`\``), /exactly one JSON/);
});
test('rejects malformed JSON', () => assert.throws(() => readRouterContract(document().replace(JSON.stringify(valid), '{')), /malformed JSON/));
test('rejects a non-ready Router', () => assert.throws(() => readRouterContract(document({ ...valid, status: 'draft' })), /status/));
test('rejects a missing required field', () => {
  const { task_id: _, ...missing } = valid;
  assert.throws(() => readRouterContract(document(missing)), /task_id is required/);
});
test('normalized output omits static Git SHA fields', () => {
  const result = readRouterContract(document({ ...valid, contract_commit_sha: 'bad', base_sha: 'bad', head_sha: 'bad' }));
  assert.equal('contract_commit_sha' in result, false);
  assert.equal('base_sha' in result, false);
  assert.equal('head_sha' in result, false);
});
