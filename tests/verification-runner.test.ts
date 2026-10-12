import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { RoomService } from '../src/room/room-service.ts';
import { VerificationRunner } from '../src/runner/verification.ts';
import { EXECUTOR, PLANNER, makeTask, makeAttemptSettle } from './fixtures.ts';

test('verification captures real failing and passing command output and rejects unapproved commands', async () => {
  const root = mkdtempSync(join(tmpdir(), 'room-test-evidence-'));
  const db = new DatabaseSync(':memory:');
  try {
    const service = new RoomService(db);
    service.createRoom('room-1', PLANNER);
    service.transitionToArchitectureReview('room-1', PLANNER);
    service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
    service.submitTask(makeTask({ verification: [{ command: 'node behavior.cjs', detects: 'Expected behavior', decision_if_failed: 'Implement the expected behavior' }] }), PLANNER);
    service.claimRunAttempt({ room_id: 'room-1', run_id: 'run-1', attempt_id: 'attempt-1', worktree_path: root }, EXECUTOR);
    const runner = new VerificationRunner(db, service);
    const input = { room_id: 'room-1', run_id: 'run-1', attempt_id: 'attempt-1', command_index: 0, stage: 'red', behavior: 'The expected value is 2' };
    writeFileSync(join(root, 'behavior.cjs'), "require('node:assert/strict').equal(1, 2)");
    const red = await runner.run('claude-code-cli', input);
    assert.equal(red.exit_code, 1);
    assert.match(red.stderr, /AssertionError/);
    writeFileSync(join(root, 'behavior.cjs'), "require('node:assert/strict').equal(2, 2); console.log('expected behavior verified')");
    const green = await runner.run('claude-code-cli', { ...input, stage: 'green' });
    assert.equal(green.exit_code, 0);
    assert.match(green.stdout, /expected behavior verified/);
    assert.equal(runner.list('room-1', 'run-1').length, 2);
    await assert.rejects(runner.run('claude-code-cli', { ...input, command_index: 4 }), /approved task/);
    await assert.rejects(runner.run('codex-app', input), /assigned worker/);
    assert.equal(runner.list('room-1', 'run-1').length, 2);
    await assert.rejects(runner.runManual('codex-app', { room_id: 'room-1', run_id: 'run-1', command_index: 0 }), /active attempt/);
    service.settleRunAttempt(makeAttemptSettle(), EXECUTOR);
    const manual = await runner.runManual('codex-app', { room_id: 'room-1', run_id: 'run-1', command_index: 0 });
    assert.equal(manual.stage, 'verification');
    assert.equal(manual.exit_code, 0);
    assert.match(manual.stdout, /expected behavior verified/);
    assert.equal(service.getRun('run-1')?.status, 'review_required');
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});
