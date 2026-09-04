import assert from 'node:assert/strict';
import test from 'node:test';
import { main, parseArgs } from '../cli.mjs';

test('CLI exposes start and run-once with explicit external binary overrides', () => {
  assert.deepEqual(parseArgs(['bootstrap']), { mode: 'bootstrap' });
  assert.deepEqual(parseArgs(['start']), { mode: 'start' });
  assert.deepEqual(parseArgs(['run-once', '--repository', 'owner/repo', '--gh-bin', 'C:\\bin\\gh.exe', '--codex-bin', 'C:\\bin\\codex.exe']), {
    mode: 'run-once', repository: 'owner/repo', ghBin: 'C:\\bin\\gh.exe', codexBin: 'C:\\bin\\codex.exe',
  });
  assert.throws(() => parseArgs(['watch']), /usage:/);
});

test('bootstrap checks repository identity and Actions settings without Worker launch or Router scheduling', async () => {
  const calls = [];
  let output = '';
  const ready = { status: 'ready', repository: 'owner/repo' };
  const dependencies = {
    git: { repositoryOrigin: async () => { calls.push('git:origin'); return 'git@github.com:owner/repo.git'; } },
    github: {
      assertRepositoryAccess: async () => { calls.push('github:repository'); },
      bootstrapActions: async () => { calls.push('github:bootstrap'); return ready; },
    },
    controller: { run: async () => { throw new Error('bootstrap must not schedule Router work'); } },
    writeOutput: (value) => { output += value; },
  };

  const result = await main(['bootstrap', '--repository', 'owner/repo'], dependencies);
  assert.deepEqual(result, ready);
  assert.deepEqual(JSON.parse(output), ready);
  assert.deepEqual(calls, ['git:origin', 'github:repository', 'github:bootstrap']);
});

test('normal start and run-once perform a read-only ready preflight before scheduling', async () => {
  for (const mode of ['start', 'run-once']) {
    const calls = [];
    const dependencies = {
      git: { repositoryOrigin: async () => { calls.push('git:origin'); return 'git@github.com:owner/repo.git'; } },
      github: {
        assertRepositoryAccess: async () => { calls.push('github:repository'); },
        assertActionsReady: async () => { calls.push('github:assert-ready'); },
      },
      capability: {},
      launcher: {},
      controller: { run: async (selectedMode) => { calls.push(`controller:${selectedMode}`); return { status: 'idle' }; } },
      writeOutput: () => {},
    };

    await main([mode, '--repository', 'owner/repo'], dependencies);
    assert.deepEqual(calls, ['git:origin', 'github:repository', 'github:assert-ready', `controller:${mode}`]);
  }
});

test('normal execution reports missing repository prerequisites as needs_decision without bootstrap or scheduling', async () => {
  let scheduled = 0;
  let bootstrapped = 0;
  const dependencies = {
    git: { repositoryOrigin: async () => 'git@github.com:owner/repo.git' },
    github: {
      assertRepositoryAccess: async () => {},
      assertActionsReady: async () => { const error = new Error('Actions disabled'); error.status = 'needs_decision'; throw error; },
      bootstrapActions: async () => { bootstrapped += 1; },
    },
    capability: {},
    controller: { run: async () => { scheduled += 1; } },
  };

  await assert.rejects(
    main(['start', '--repository', 'owner/repo'], dependencies),
    (error) => error.status === 'needs_decision' && /Actions disabled/.test(error.message),
  );
  assert.equal(bootstrapped, 0);
  assert.equal(scheduled, 0);
});

test('missing local repository or origin is needs_decision before GitHub mutation', async () => {
  let githubCalls = 0;
  const dependencies = {
    git: { repositoryOrigin: async () => { throw new Error('origin is missing'); } },
    github: {
      assertRepositoryAccess: async () => { githubCalls += 1; },
      bootstrapActions: async () => { githubCalls += 1; },
    },
  };

  await assert.rejects(
    main(['bootstrap', '--repository', 'owner/repo'], dependencies),
    (error) => error.status === 'needs_decision' && /repository\/origin/.test(error.message),
  );
  assert.equal(githubCalls, 0);
});
