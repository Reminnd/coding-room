import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSupervisorResult, runSupervisor } from '../supervisor.mjs';

test('accepts exactly the three Supervisor Integration statuses', () => {
  for (const status of ['ready_to_integrate', 'blocked', 'needs_decision']) {
    assert.deepEqual(parseSupervisorResult(JSON.stringify({ status, reason: 'evidence' })), { status, reason: 'evidence' });
  }
  assert.throws(() => parseSupervisorResult('{"status":"APPROVE","reason":"no"}'), /allowed status/);
  assert.throws(() => parseSupervisorResult('{"status":"REQUEST_CHANGES","reason":"no"}'), /allowed status/);
});

test('invalid or failed Supervisor output blocks integration', async () => {
  const launcher = { execute: async () => ({ exitCode: 0, error: null, stderr: '', lastMessage: 'not-json' }) };
  const result = await runSupervisor({ launcher, worktree: '.', model: {}, contract: '', facts: {}, dependencies: [], verification: [], diff: '' });
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /not JSON/);
});
