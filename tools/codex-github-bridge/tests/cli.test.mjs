import assert from 'node:assert/strict';
import test from 'node:test';
import { main, parseArgs } from '../cli.mjs';
import { SUPERVISOR_ONLY_CODEX_EXECUTABLE } from '../codex.mjs';

test('CLI exposes start and run-once with explicit external binary overrides', () => {
  assert.deepEqual(parseArgs(['bootstrap']), { mode: 'bootstrap' });
  assert.deepEqual(parseArgs(['start']), { mode: 'start' });
  assert.deepEqual(parseArgs(['run-once', '--repository', 'owner/repo', '--gh-bin', 'C:\\bin\\gh.exe', '--codex-bin', 'C:\\bin\\codex.exe']), {
    mode: 'run-once', repository: 'owner/repo', ghBin: 'C:\\bin\\gh.exe', codexBin: 'C:\\bin\\codex.exe',
  });
  assert.throws(() => parseArgs(['watch']), /usage:/);
});

test('CLI exposes exactly four lifecycle commands with strict JSON input and typed acceptance', async () => {
  assert.deepEqual(parseArgs(['record-review', '--input', '-']), { mode: 'record-review', inputPath: '-' });
  assert.deepEqual(parseArgs(['prepare-fix', '--input', 'fix.json']), { mode: 'prepare-fix', inputPath: 'fix.json' });
  assert.deepEqual(parseArgs(['close-stage', '--input', 'close.json']), { mode: 'close-stage', inputPath: 'close.json' });
  assert.deepEqual(parseArgs(['record-acceptance', '--input', '-', '--record-type', 'STAGE_ACCEPTANCE_V1']), {
    mode: 'record-acceptance', inputPath: '-', recordType: 'STAGE_ACCEPTANCE_V1',
  });
  assert.throws(
    () => parseArgs(['record-acceptance', '--input', '-']),
    (error) => error.status === 'needs_decision' && error.details.failure_class === 'PRE_MUTATION_FAILURE',
  );
  assert.throws(
    () => parseArgs(['record-acceptance', '--input', '-', '--record-type', 'FORMAL_REVIEW_V1']),
    (error) => error.status === 'needs_decision' && error.details.failure_class === 'PRE_MUTATION_FAILURE',
  );

  for (const [mode, method, extra] of [
    ['record-review', 'recordReview', []],
    ['prepare-fix', 'prepareFix', []],
    ['record-acceptance', 'recordAcceptance', ['--record-type', 'FIX_BUNDLE_ACCEPTANCE_V1']],
    ['close-stage', 'closeStage', []],
  ]) {
    const calls = [];
    const lifecycle = {
      [method]: async (...args) => { calls.push(args); return { status: 'ok' }; },
    };
    const dependencies = {
      git: { repositoryOrigin: async () => 'git@github.com:owner/repo.git' },
      github: {
        assertRepositoryAccess: async () => {},
        assertActionsReady: async () => { throw new Error('lifecycle command must not inspect execution readiness'); },
      },
      lifecycle,
      readInput: async () => '{"pull_request_number":7}',
      writeOutput: () => {},
    };
    await main([mode, '--repository', 'owner/repo', '--input', '-', ...extra], dependencies);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].at(-1), { pull_request_number: 7 });
  }
});

test('supervise-only is an operational two-phase mode outside the four lifecycle commands', async () => {
  const codexBin = SUPERVISOR_ONLY_CODEX_EXECUTABLE;
  assert.deepEqual(parseArgs(['supervise-only', '--phase', 'plan', '--request-file', 'request.json', '--codex-bin', codexBin]), {
    mode: 'supervise-only', phase: 'plan', requestFile: 'request.json', codexBin,
  });
  assert.deepEqual(parseArgs(['supervise-only', '--phase', 'execute', '--approved-plan-file', 'plan.json', '--codex-bin', codexBin]), {
    mode: 'supervise-only', phase: 'execute', approvedPlanFile: 'plan.json', codexBin,
  });
  for (const argv of [
    ['supervise-only', '--phase', 'plan', '--request-file', 'request.json'],
    ['supervise-only', '--phase', 'plan', '--approved-plan-file', 'plan.json', '--codex-bin', codexBin],
    ['supervise-only', '--phase', 'execute', '--request-file', 'request.json', '--codex-bin', codexBin],
    ['supervise-only', '--phase', 'unknown', '--request-file', 'request.json', '--codex-bin', codexBin],
  ]) {
    assert.throws(() => parseArgs(argv), (error) => error.status === 'needs_decision');
  }

  for (const [phase, fileFlag, method] of [
    ['plan', '--request-file', 'plan'],
    ['execute', '--approved-plan-file', 'execute'],
  ]) {
    const calls = [];
    const expected = { status: phase === 'plan' ? 'supervisor_only_plan_ready' : 'blocked' };
    const dependencies = {
      git: { repositoryOrigin: async () => { calls.push('git:origin'); return 'git@github.com:owner/repo.git'; } },
      github: {
        assertRepositoryAccess: async () => { calls.push('github:repository'); },
        assertActionsReady: async () => { throw new Error('supervise-only must not inspect normal Actions readiness'); },
      },
      supervisorOnlyController: {
        [method]: async (input) => { calls.push(`supervisor-only:${method}`); assert.deepEqual(input, { exact: 'input' }); return expected; },
      },
      canonicalizeCodexExecutable: async (value) => value,
      controller: { run: async () => { throw new Error('supervise-only must not call BridgeController.run'); } },
      lifecycle: { recordReview: async () => { throw new Error('supervise-only must not call LifecycleController'); } },
      readInput: async () => '{"exact":"input"}',
      writeOutput: () => {},
    };
    assert.deepEqual(await main([
      'supervise-only', '--phase', phase, fileFlag, 'input.json', '--codex-bin', codexBin,
      '--repository', 'owner/repo',
    ], dependencies), expected);
    assert.deepEqual(calls, ['git:origin', 'github:repository', `supervisor-only:${method}`]);
  }
});

test('supervise-only rejects malformed or duplicate-member JSON before its Controller', async () => {
  let controllerCalls = 0;
  const dependencies = {
    git: { repositoryOrigin: async () => 'git@github.com:owner/repo.git' },
    github: { assertRepositoryAccess: async () => {} },
    supervisorOnlyController: { plan: async () => { controllerCalls += 1; } },
    canonicalizeCodexExecutable: async (value) => value,
    readInput: async () => '{"task_id":"one","task_id":"two"}',
  };
  await assert.rejects(
    main([
      'supervise-only', '--phase', 'plan', '--request-file', '-', '--codex-bin',
      SUPERVISOR_ONLY_CODEX_EXECUTABLE, '--repository', 'owner/repo',
    ], dependencies),
    (error) => error.status === 'needs_decision' && error.details.failure_class === 'PRE_MUTATION_FAILURE',
  );
  assert.equal(controllerCalls, 0);
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
