import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { BridgeController } from '../controller.mjs';

async function recoveryFixture(overrides = {}) {
  const owner = await mkdtemp(join(tmpdir(), 'codex-bridge-recovery-'));
  await mkdir(join(owner, '.github', 'scripts'), { recursive: true });
  await writeFile(join(owner, '.github', 'scripts', 'read-router-contract.mjs'), 'export function readRouterContract(source) { return JSON.parse(source); }\n');
  const task = {
    task_id: 'T01', dispatch_id: 'dispatch-current', task_branch: 'task/wf/T01', depends_on: [], owns: ['owned/**'], verification: [],
  };
  const router = {
    repository: 'owner/repo', workflow_id: 'wf', stage_id: 'S01', stage_branch: 'stage/wf/S01', tasks: [task],
  };
  const handoff = {
    status: 'dispatch_ready', repository: 'owner/repo', workflow_id: 'wf', stage_id: 'S01',
    router_contract_path: 'docs/router.md', contract_commit_sha: 'contract-sha', stage_branch: 'stage/wf/S01',
    stage_head_sha: 'stage-head', execution_surface: 'local_codex', ...overrides.handoff,
  };
  const integratedEvent = {
    repository: 'owner/repo', workflow_id: 'wf', stage_id: 'S01', stage_branch: 'stage/wf/S01',
    task_id: 'T01', dispatch_id: 'dispatch-current', status: 'task_integrated',
    source_task_sha: 'task-head', stage_commit_sha: 'stage-commit',
  };
  const calls = [];
  const github = {
    discover: async () => [{
      prNumber: 7, prUrl: 'https://example.test/pr/7', prHeadSha: 'stage-head', prHeadBranch: 'stage/wf/S01',
      handoff, events: overrides.events ?? [integratedEvent],
    }],
    readRepositoryFile: async () => JSON.stringify(router),
  };
  const git = {
    fetchStage: async () => overrides.actualStageSha ?? 'stage-head',
    ensureStageWorktree: async () => owner,
    head: async () => overrides.localStageSha ?? 'stage-head',
    status: async () => '',
    remoteBranchHead: async () => { calls.push('remoteBranchHead'); return overrides.remoteTaskSha ?? 'task-head'; },
    commitExists: async () => { calls.push('commitExists'); return overrides.commitExists ?? true; },
    isAncestor: async () => { calls.push('isAncestor'); return overrides.isAncestor ?? true; },
    changedFiles: async () => { calls.push('changedFiles'); return overrides.changedFiles ?? ['owned/result.txt']; },
  };
  const controller = new BridgeController({
    repository: 'owner/repo', repositoryRoot: owner, worktreeRoot: owner, github, git, launcher: {}, capability: {}, log: () => {},
  });
  return { owner, controller, calls };
}

function validCodingResult(overrides = {}) {
  const values = {
    task_id: 'T01',
    dispatch_id: 'dispatch-1',
    reported_base_sha: 'base-sha',
    reported_task_head_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    changed_files: ['tools/codex-github-bridge/controller.mjs'],
    native_backend: {
      interface: 'codex app-server JSON-RPC',
      worker_mode: 'one_thread_per_task',
      explicit_thread_cwd: 'pass',
      explicit_turn_cwd: 'pass',
      terminal_event: 'turn/completed',
      silent_fallback: false,
    },
    verification: {
      bridge_tests: 'pass - node --test tools/codex-github-bridge/tests/*.test.mjs',
      typecheck: 'pass - npm run typecheck',
      full_tests: 'pass - npm test',
      diff_check: 'pass - git diff --check',
    },
    deviations: [],
    unresolved: [],
    questions: [],
    status: 'candidate_ready',
    ...overrides,
  };
  return [
    `task_id: ${values.task_id}`,
    `dispatch_id: ${values.dispatch_id}`,
    `reported_base_sha: ${values.reported_base_sha}`,
    `reported_task_head_sha: ${values.reported_task_head_sha}`,
    'changed_files:',
    ...values.changed_files.map((path) => `  - ${path}`),
    'native_backend:',
    ...Object.entries(values.native_backend).map(([key, value]) => `  ${key}: ${value}`),
    'verification:',
    ...Object.entries(values.verification).map(([key, value]) => `  ${key}: ${value}`),
    values.deviations.length === 0 ? 'deviations: []' : `deviations:\n${values.deviations.map((item) => `  - ${item}`).join('\n')}`,
    values.unresolved.length === 0 ? 'unresolved: []' : `unresolved:\n${values.unresolved.map((item) => `  - ${item}`).join('\n')}`,
    values.questions.length === 0 ? 'questions: []' : `questions:\n${values.questions.map((item) => `  - ${item}`).join('\n')}`,
    `status: ${values.status}`,
  ].join('\n');
}

function setup(supervisorStatus) {
  const calls = [];
  const facts = {
    baseSha: 'base-sha',
    taskHeadSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    parentSha: 'base-sha',
    actualChangedFiles: ['owned/result.txt'],
  };
  const git = {
    run: async () => { throw new Error('verification process should not run'); },
    collectTaskFacts: async () => { calls.push('mechanical:facts'); return facts; },
    mechanicalGate: async () => { calls.push('mechanical:gate'); },
    status: async () => { calls.push('mechanical:status'); return ''; },
    completeDiff: async () => { calls.push('mechanical:diff'); return 'complete diff'; },
    pushTask: async (_task, _worktree, expectedSha) => { calls.push(`push:${expectedSha}`); },
    integrate: async () => {
      calls.push('integrate');
      return { status: 'integrated', sourceTaskSha: facts.taskHeadSha, stageCommitSha: 'stage-head-sha' };
    },
  };
  const github = {
    publishEvent: async (_repository, _prNumber, event) => { calls.push(`publish:${event.status}`); },
  };
  const launcher = {
    execute: async () => {
      calls.push(`supervisor:${supervisorStatus}`);
      return {
        error: null,
        exitCode: 0,
        stderr: '',
        lastMessage: JSON.stringify({ status: supervisorStatus, reason: 'focused test result' }),
      };
    },
  };
  const controller = new BridgeController({
    repository: 'owner/repo',
    repositoryRoot: '.',
    worktreeRoot: '.',
    github,
    git,
    launcher,
    capability: {},
    log: () => {},
  });
  controller.context = {
    stage: { prNumber: 7 },
    router: { stage_id: 'S01', stage_branch: 'stage/test' },
    workflowId: 'wf',
    dispatches: new Map(),
    mappings: new Map(),
    states: new Map([['T01', 'running']]),
  };
  const task = {
    task_id: 'T01',
    dispatch_id: 'dispatch-1',
    task_branch: 'task/test/T01',
    depends_on: [],
    verification: [],
  };
  const result = {
    baseSha: facts.baseSha,
    worktree: 'task-worktree',
    model: {},
    contract: 'accepted contract',
    processResult: {
      error: null,
      exitCode: 0,
      stderr: '',
      lastMessage: validCodingResult(),
    },
  };
  return { calls, controller, task, result };
}

test('does not push a task candidate when Supervisor Integration is not ready', async () => {
  for (const status of ['blocked', 'needs_decision']) {
    const context = setup(status);
    await context.controller.processResult(context.task, context.result);
    assert.ok(context.calls.includes(`supervisor:${status}`));
    assert.equal(context.calls.some((call) => call.startsWith('push:')), false);
    assert.equal(context.calls.includes('integrate'), false);
    assert.ok(context.calls.includes(`publish:${status}`));
  }
});

test('ordinary verification passes the semantic gate and continues through the normal controller path', async () => {
  const context = setup('ready_to_integrate');
  await context.controller.processResult(context.task, context.result);

  assert.ok(context.calls.indexOf('mechanical:facts') < context.calls.indexOf('mechanical:gate'));
  assert.ok(context.calls.indexOf('mechanical:gate') < context.calls.indexOf('supervisor:ready_to_integrate'));
  assert.equal(context.calls.filter((call) => call === 'push:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa').length, 1);
  assert.ok(context.calls.indexOf('supervisor:ready_to_integrate') < context.calls.indexOf('push:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
  assert.ok(context.calls.indexOf('push:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') < context.calls.indexOf('integrate'));
  assert.ok(context.calls.includes('publish:task_integrated'));
});

test('native failure and missing required Coding Result cannot reach Git facts or integration', async () => {
  for (const processResult of [
    { error: null, exitCode: 1, stderr: 'Native Codex turn failed', lastMessage: 'status: blocked' },
    { error: null, exitCode: 0, stderr: '', lastMessage: 'completed without structured result' },
  ]) {
    const context = setup('ready_to_integrate');
    context.result.processResult = processResult;
    await context.controller.processResult(context.task, context.result);
    assert.equal(context.calls.includes('mechanical:facts'), false);
    assert.equal(context.calls.some((call) => call.startsWith('push:')), false);
    assert.equal(context.calls.includes('integrate'), false);
    assert.ok(context.calls.includes('publish:blocked'));
  }
});

test('status-only candidate is blocked before Git fact collection', async () => {
  const context = setup('ready_to_integrate');
  context.result.processResult.lastMessage = 'status: candidate_ready';
  await context.controller.processResult(context.task, context.result);
  assert.equal(context.calls.includes('mechanical:facts'), false);
  assert.equal(context.calls.some((call) => call.startsWith('push:')), false);
  assert.equal(context.calls.includes('integrate'), false);
  assert.ok(context.calls.includes('publish:blocked'));
});

for (const field of [
  'task_id',
  'dispatch_id',
  'reported_base_sha',
  'reported_task_head_sha',
  'changed_files',
  'native_backend',
  'native_backend.interface',
  'native_backend.worker_mode',
  'native_backend.explicit_thread_cwd',
  'native_backend.explicit_turn_cwd',
  'native_backend.terminal_event',
  'native_backend.silent_fallback',
  'verification',
  'verification.bridge_tests',
  'verification.typecheck',
  'verification.full_tests',
  'verification.diff_check',
  'deviations',
  'unresolved',
  'questions',
  'status',
]) {
  test(`missing ${field} is blocked before Git fact collection`, async () => {
    const context = setup('ready_to_integrate');
    const [section, nested] = field.split('.');
    const pattern = nested
      ? new RegExp(`^  ${nested}:.*\\n?`, 'm')
      : new RegExp(`^${section}:(?:.*|\\n(?:  .+\\n?)*)`, 'm');
    context.result.processResult.lastMessage = validCodingResult().replace(pattern, '');
    await context.controller.processResult(context.task, context.result);
    assert.equal(context.calls.includes('mechanical:facts'), false);
    assert.equal(context.calls.some((call) => call.startsWith('push:')), false);
    assert.equal(context.calls.includes('integrate'), false);
    assert.ok(context.calls.includes('publish:blocked'));
  });
}

for (const [field, value] of [
  ['task_id', 'T02'],
  ['dispatch_id', 'dispatch-other'],
  ['reported_base_sha', 'other-base'],
]) {
  test(`mismatched ${field} is blocked before Git fact collection`, async () => {
    const context = setup('ready_to_integrate');
    context.result.processResult.lastMessage = validCodingResult({ [field]: value });
    await context.controller.processResult(context.task, context.result);
    assert.equal(context.calls.includes('mechanical:facts'), false);
    assert.equal(context.calls.some((call) => call.startsWith('push:')), false);
    assert.equal(context.calls.includes('integrate'), false);
    assert.ok(context.calls.includes('publish:blocked'));
  });
}

for (const [name, mutate] of [
  ['changed_files scalar', (message) => message.replace('changed_files:\n  - tools/codex-github-bridge/controller.mjs', 'changed_files: controller.mjs')],
  ['native_backend scalar', (message) => message.replace(/native_backend:\n(?:  .+\n)+/, 'native_backend: []\n')],
  ['quoted silent_fallback', (message) => message.replace('silent_fallback: false', 'silent_fallback: "false"')],
  ['enabled silent_fallback', (message) => message.replace('silent_fallback: false', 'silent_fallback: true')],
  ['wrong worker_mode', (message) => message.replace('worker_mode: one_thread_per_task', 'worker_mode: shared_thread')],
  ['invalid cwd outcome', (message) => message.replace('explicit_thread_cwd: pass', 'explicit_thread_cwd: yes')],
  ['failed explicit thread cwd', (message) => message.replace('explicit_thread_cwd: pass', 'explicit_thread_cwd: fail')],
  ['failed explicit turn cwd', (message) => message.replace('explicit_turn_cwd: pass', 'explicit_turn_cwd: fail')],
  ['verification without command', (message) => message.replace('typecheck: pass - npm run typecheck', 'typecheck: pass')],
  ['invalid reported Task SHA', (message) => message.replace('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'not-a-sha')],
  ['invalid status', (message) => message.replace('status: candidate_ready', 'status: completed')],
]) {
  test(`${name} is blocked before Git fact collection`, async () => {
    const context = setup('ready_to_integrate');
    context.result.processResult.lastMessage = mutate(validCodingResult());
    await context.controller.processResult(context.task, context.result);
    assert.equal(context.calls.includes('mechanical:facts'), false);
    assert.equal(context.calls.some((call) => call.startsWith('push:')), false);
    assert.equal(context.calls.includes('integrate'), false);
    assert.ok(context.calls.includes('publish:blocked'));
  });
}

for (const verification of ['bridge_tests', 'typecheck', 'full_tests', 'diff_check']) {
  test(`failed ${verification} is blocked before Git fact collection`, async () => {
    const context = setup('ready_to_integrate');
    context.result.processResult.lastMessage = validCodingResult({
      verification: {
        bridge_tests: 'pass - node --test tools/codex-github-bridge/tests/*.test.mjs',
        typecheck: 'pass - npm run typecheck',
        full_tests: 'pass - npm test',
        diff_check: 'pass - git diff --check',
        [verification]: `fail - ${verification} command`,
      },
    });
    await context.controller.processResult(context.task, context.result);
    assert.equal(context.calls.includes('mechanical:facts'), false);
    assert.equal(context.calls.includes('mechanical:gate'), false);
    assert.equal(context.calls.some((call) => call.startsWith('supervisor:')), false);
    assert.equal(context.calls.some((call) => call.startsWith('push:')), false);
    assert.equal(context.calls.includes('integrate'), false);
    assert.ok(context.calls.includes('publish:blocked'));
  });
}

for (const verification of ['bridge_tests', 'typecheck', 'diff_check']) {
  test(`accepted amendment marker is rejected for ${verification} before Git fact collection`, async () => {
    const context = setup('ready_to_integrate');
    context.result.processResult.lastMessage = validCodingResult({
      verification: {
        bridge_tests: 'pass - node --test tools/codex-github-bridge/tests/*.test.mjs',
        typecheck: 'pass - npm run typecheck',
        full_tests: 'pass - npm test',
        diff_check: 'pass - git diff --check',
        [verification]: `pass-under-accepted-amendment - ${verification} command`,
      },
    });
    await context.controller.processResult(context.task, context.result);
    assert.equal(context.calls.includes('mechanical:facts'), false);
    assert.equal(context.calls.includes('mechanical:gate'), false);
    assert.equal(context.calls.some((call) => call.startsWith('supervisor:')), false);
    assert.equal(context.calls.some((call) => call.startsWith('push:')), false);
    assert.equal(context.calls.includes('integrate'), false);
    assert.ok(context.calls.includes('publish:blocked'));
  });
}

test('task head mismatch is blocked immediately after independent Git fact collection', async () => {
  const context = setup('ready_to_integrate');
  context.result.processResult.lastMessage = validCodingResult({
    reported_task_head_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  });
  await context.controller.processResult(context.task, context.result);
  assert.equal(context.calls[0], 'mechanical:facts');
  assert.equal(context.calls.includes('mechanical:gate'), false);
  assert.equal(context.calls.some((call) => call.startsWith('supervisor:')), false);
  assert.equal(context.calls.some((call) => call.startsWith('push:')), false);
  assert.equal(context.calls.includes('integrate'), false);
  assert.ok(context.calls.includes('publish:blocked'));
});

test('matching task head and the full-tests amendment marker continue through the normal controller path', async () => {
  const context = setup('ready_to_integrate');
  context.result.processResult.lastMessage = validCodingResult({
    verification: {
      bridge_tests: 'pass - node --test tools/codex-github-bridge/tests/*.test.mjs',
      typecheck: 'pass - npm run typecheck',
      full_tests: 'pass-under-accepted-amendment - npm test',
      diff_check: 'pass - git diff --check',
    },
  });
  await context.controller.processResult(context.task, context.result);
  assert.ok(context.calls.includes('mechanical:facts'));
  assert.ok(context.calls.includes('mechanical:gate'));
  assert.ok(context.calls.includes('supervisor:ready_to_integrate'));
  assert.ok(context.calls.includes('push:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
  assert.ok(context.calls.includes('integrate'));
});

for (const status of ['blocked', 'needs_decision']) {
  test(`complete ${status} result is blocked before Git fact collection`, async () => {
    const context = setup('ready_to_integrate');
    context.result.processResult.lastMessage = validCodingResult({ status });
    await context.controller.processResult(context.task, context.result);
    assert.equal(context.calls.includes('mechanical:facts'), false);
    assert.equal(context.calls.some((call) => call.startsWith('push:')), false);
    assert.equal(context.calls.includes('integrate'), false);
    assert.ok(context.calls.includes('publish:blocked'));
  });
}

test('native capability failure is published as needs_decision before Git fact collection', async () => {
  const context = setup('ready_to_integrate');
  const error = new Error('native app-server unavailable');
  error.status = 'needs_decision';
  context.result.processResult = { error, exitCode: null, stderr: '', lastMessage: '' };
  await context.controller.processResult(context.task, context.result);
  assert.equal(context.calls.includes('mechanical:facts'), false);
  assert.equal(context.calls.some((call) => call.startsWith('push:')), false);
  assert.ok(context.calls.includes('publish:needs_decision'));
});

test('restores a current integrated dispatch only after matching Git recovery facts', async () => {
  const data = await recoveryFixture();
  try {
    const context = await data.controller.load();
    assert.equal(context.states.get('T01'), 'integrated');
    assert.equal(context.mappings.get('T01').stage_commit_sha, 'stage-commit');
    assert.deepEqual(data.calls, ['remoteBranchHead', 'commitExists', 'isAncestor', 'changedFiles']);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('ignores an integrated event from an older dispatch of the same task', async () => {
  const data = await recoveryFixture({
    events: [{
      repository: 'owner/repo', workflow_id: 'wf', stage_id: 'S01', stage_branch: 'stage/wf/S01',
      task_id: 'T01', dispatch_id: 'dispatch-old', status: 'task_integrated', source_task_sha: 'old-task', stage_commit_sha: 'old-stage',
    }],
  });
  try {
    const context = await data.controller.load();
    assert.equal(context.states.get('T01'), 'not_started');
    assert.deepEqual(data.calls, []);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('recovery requires handoff Stage head to equal the actual remote and PR head', async () => {
  const data = await recoveryFixture({ handoff: { stage_head_sha: 'stale-stage' } });
  try {
    await assert.rejects(data.controller.load(), (error) => error.status === 'needs_decision' && /handoff Stage head/.test(error.message));
    assert.deepEqual(data.calls, []);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

for (const scenario of [
  { name: 'remote Task SHA mismatch', overrides: { remoteTaskSha: 'other-task' }, message: /remote Task head/ },
  { name: 'missing recorded Stage commit', overrides: { commitExists: false }, message: /does not exist/ },
  { name: 'recorded Stage commit outside current Stage ancestry', overrides: { isAncestor: false }, message: /not an ancestor/ },
  { name: 'recovered Stage commit outside current task ownership', overrides: { changedFiles: ['other/result.txt'] }, message: /outside owned paths/ },
]) {
  test(`recovery maps ${scenario.name} to needs_decision`, async () => {
    const data = await recoveryFixture(scenario.overrides);
    try {
      await assert.rejects(
        data.controller.load(),
        (error) => error.status === 'needs_decision' && scenario.message.test(error.message),
      );
    } finally {
      await rm(data.owner, { recursive: true, force: true });
    }
  });
}
