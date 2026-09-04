import assert from 'node:assert/strict';
import test from 'node:test';
import { runVerification, splitCommand, verificationInvocation } from '../verification.mjs';

test('runs executable verification without a shell and leaves semantic audits for Supervisor evidence', async () => {
  const calls = [];
  const evidence = await runVerification([
    'node --test "tests/example.test.mjs"',
    'relative Markdown link audit',
  ], '.', async (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd });
    return { exitCode: 0, stdout: 'ok', stderr: '', error: null };
  });
  assert.deepEqual(calls, [{ command: 'node', args: ['--test', 'tests/example.test.mjs'], cwd: '.' }]);
  assert.equal(evidence[0].passed, true);
  assert.equal(evidence[1].kind, 'supervisor_check');
  assert.equal(evidence[1].passed, null);
});

test('parses quoted command arguments deterministically', () => {
  assert.deepEqual(splitCommand('node --test "a b.test.mjs"'), ['node', '--test', 'a b.test.mjs']);
});

test('uses the Node-distributed npm CLI on Windows without enabling a shell', () => {
  const invocation = verificationInvocation(['npm', 'run', 'typecheck']);
  if (process.platform === 'win32') {
    assert.equal(invocation.command, process.execPath);
    assert.match(invocation.args[0], /node_modules[\\/]npm[\\/]bin[\\/]npm-cli\.js$/);
  } else {
    assert.deepEqual(invocation, { command: 'npm', args: ['run', 'typecheck'] });
  }
});
