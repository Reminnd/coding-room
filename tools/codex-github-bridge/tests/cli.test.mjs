import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArgs } from '../cli.mjs';

test('CLI exposes start and run-once with explicit external binary overrides', () => {
  assert.deepEqual(parseArgs(['start']), { mode: 'start' });
  assert.deepEqual(parseArgs(['run-once', '--repository', 'owner/repo', '--gh-bin', 'C:\\bin\\gh.exe', '--codex-bin', 'C:\\bin\\codex.exe']), {
    mode: 'run-once', repository: 'owner/repo', ghBin: 'C:\\bin\\gh.exe', codexBin: 'C:\\bin\\codex.exe',
  });
  assert.throws(() => parseArgs(['watch']), /usage:/);
});
