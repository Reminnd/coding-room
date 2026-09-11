import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SUPERVISOR_ONLY_CODEX_EXECUTABLE } from '../codex.mjs';
import { BridgeController, SUPERVISOR_ONLY_BINDING, SupervisorOnlyController } from '../controller.mjs';

async function recoveryFixture(overrides = {}) {
  const owner = await mkdtemp(join(tmpdir(), 'codex-bridge-recovery-'));
  await mkdir(join(owner, '.github', 'scripts'), { recursive: true });
  await writeFile(join(owner, '.github', 'scripts', 'read-router-contract.mjs'), 'export function readRouterContract(source) { return JSON.parse(source); }\n');
  const task = {
    task_id: 'T01', dispatch_id: 'dispatch-current', task_branch: 'task/wf/T01', task_contract_path: 'docs/T01.md',
    depends_on: [], owns: ['owned/**'], verification: [],
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
    readRepositoryFile: async (_repository, path) => path === 'docs/router.md'
      ? JSON.stringify(router)
      : `## Contract\n\n\`\`\`yaml\n+task_id: T01\n+dispatch_id: dispatch-current\n+status: Accepted\n+confirmed_by_user: true\n+task_branch: task/wf/T01\n+task_contract_path: docs/T01.md\n+\`\`\`\n`.replaceAll('\n+', '\n'),
  };
  const git = {
    remoteBranchHead: async (branch) => {
      calls.push(`remoteBranchHead:${branch}`);
      return branch === 'stage/wf/S01' ? (overrides.actualStageSha ?? 'stage-head') : (overrides.remoteTaskSha ?? 'task-head');
    },
    fetchStage: async () => overrides.actualStageSha ?? 'stage-head',
    ensureStageWorktree: async () => owner,
    head: async () => overrides.localStageSha ?? 'stage-head',
    status: async () => '',
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
    changed_files: ['owned/result.txt'],
    deviations: [],
    unresolved: [],
    questions: [],
    status: 'implementation_ready',
    ...overrides,
  };
  return [
    `task_id: ${values.task_id}`,
    `dispatch_id: ${values.dispatch_id}`,
    `reported_base_sha: ${values.reported_base_sha}`,
    ...(values.changed_files === undefined
      ? []
      : ['changed_files:', ...values.changed_files.map((path) => `  - ${path}`)]),
    values.deviations.length === 0 ? 'deviations: []' : `deviations:\n${values.deviations.map((item) => `  - ${item}`).join('\n')}`,
    values.unresolved.length === 0 ? 'unresolved: []' : `unresolved:\n${values.unresolved.map((item) => `  - ${item}`).join('\n')}`,
    values.questions.length === 0 ? 'questions: []' : `questions:\n${values.questions.map((item) => `  - ${item}`).join('\n')}`,
    `status: ${values.status}`,
  ].join('\n');
}

function setup(supervisorStatus, overrides = {}) {
  const calls = [];
  const records = { candidateCommits: [], publishedEvents: [], supervisorInputs: [] };
  const workingPaths = overrides.workingPaths ?? ['owned/result.txt'];
  const facts = {
    baseSha: 'base-sha',
    taskHeadSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    parentSha: 'base-sha',
    actualChangedFiles: [...workingPaths],
  };
  const observation = {
    head: 'base-sha',
    branch: 'task/test/T01',
    stagedPaths: [],
    workingPaths: [...workingPaths],
  };
  const git = {
    run: async () => { throw new Error('verification process should not run'); },
    observeWorkingTree: async () => { calls.push('working:observe'); return observation; },
    createCandidateCommit: async (...args) => { calls.push('candidate:commit'); records.candidateCommits.push(args); },
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
    publishEvent: async (_repository, _prNumber, event) => {
      calls.push(`publish:${event.status}`);
      records.publishedEvents.push(event);
    },
  };
  const launcher = {
    execute: async (input) => {
      calls.push(`supervisor:${supervisorStatus}`);
      records.supervisorInputs.push(input);
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
    owns: overrides.owns ?? ['owned/**'],
    verification: overrides.verification ?? [],
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
      lastMessage: validCodingResult({ changed_files: overrides.workerPaths ?? [...workingPaths] }),
      native: overrides.native,
    },
  };
  return { calls, controller, facts, records, task, result };
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

test('docs-owned generic result reaches the unchanged Controller delivery path', async () => {
  const paths = ['docs/second.md', 'docs/example.md'];
  const context = setup('ready_to_integrate', {
    owns: ['docs/example.md', 'docs/second.md'],
    workingPaths: ['docs/example.md', 'docs/second.md'],
    workerPaths: paths,
  });
  await context.controller.processResult(context.task, context.result);

  assert.equal(context.calls.filter((call) => call === 'working:observe').length, 2);
  assert.ok(context.calls.indexOf('working:observe') < context.calls.indexOf('candidate:commit'));
  assert.ok(context.calls.indexOf('candidate:commit') < context.calls.indexOf('mechanical:facts'));
  assert.ok(context.calls.indexOf('mechanical:facts') < context.calls.indexOf('mechanical:gate'));
  assert.ok(context.calls.indexOf('mechanical:gate') < context.calls.indexOf('supervisor:ready_to_integrate'));
  assert.equal(context.calls.filter((call) => call === 'push:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa').length, 1);
  assert.ok(context.calls.indexOf('supervisor:ready_to_integrate') < context.calls.indexOf('push:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
  assert.ok(context.calls.indexOf('push:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') < context.calls.indexOf('integrate'));
  assert.ok(context.calls.includes('publish:task_integrated'));
  assert.deepEqual(context.records.candidateCommits, [[context.task, 'task-worktree', ['docs/example.md', 'docs/second.md']]]);
  assert.equal(context.records.publishedEvents.at(-1).source_task_sha, context.facts.taskHeadSha);
  assert.deepEqual(context.records.publishedEvents.at(-1).actual_changed_files, ['docs/example.md', 'docs/second.md']);
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

test('implementation_ready without changed_files is blocked before Git observation', async () => {
  const context = setup('ready_to_integrate');
  context.result.processResult.lastMessage = validCodingResult({ changed_files: undefined });
  await context.controller.processResult(context.task, context.result);
  assert.equal(context.calls.includes('working:observe'), false);
  assert.equal(context.calls.includes('mechanical:facts'), false);
  assert.equal(context.calls.some((call) => call.startsWith('push:')), false);
  assert.equal(context.calls.includes('integrate'), false);
  assert.ok(context.calls.includes('publish:blocked'));
});

for (const field of [
  'task_id',
  'dispatch_id',
  'reported_base_sha',
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
  ['changed_files scalar', (message) => message.replace('changed_files:\n  - owned/result.txt', 'changed_files: result.txt')],
  ['invalid status', (message) => message.replace('status: implementation_ready', 'status: completed')],
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

test('worker changed_files mismatch is blocked before verification or commit', async () => {
  const context = setup('ready_to_integrate', { verification: ['node --test must-not-run.test.mjs'] });
  context.controller.git.run = async () => {
    context.calls.push('verification:run');
    return { exitCode: 0, stdout: '', stderr: '', error: null };
  };
  context.result.processResult.lastMessage = validCodingResult({
    changed_files: ['owned/other.txt'],
  });
  await context.controller.processResult(context.task, context.result);
  assert.equal(context.calls[0], 'working:observe');
  assert.equal(context.calls.includes('verification:run'), false);
  assert.equal(context.calls.includes('candidate:commit'), false);
  assert.equal(context.calls.includes('mechanical:facts'), false);
  assert.equal(context.calls.includes('mechanical:gate'), false);
  assert.equal(context.calls.some((call) => call.startsWith('supervisor:')), false);
  assert.equal(context.calls.some((call) => call.startsWith('push:')), false);
  assert.equal(context.calls.includes('integrate'), false);
  assert.ok(context.calls.includes('publish:blocked'));
});

test('matching Worker and observed paths still pass through the independent Router ownership gate', async () => {
  const context = setup('ready_to_integrate', {
    owns: ['owned/**'],
    workingPaths: ['other/result.txt'],
    workerPaths: ['other/result.txt'],
    verification: ['node --test must-not-run.test.mjs'],
  });
  context.controller.git.run = async () => {
    context.calls.push('verification:run');
    return { exitCode: 0, stdout: '', stderr: '', error: null };
  };
  await context.controller.processResult(context.task, context.result);
  assert.deepEqual(context.calls, ['working:observe', 'publish:blocked']);
});

for (const [name, override] of [
  ['HEAD mismatch', { head: 'other-head' }],
  ['branch mismatch', { branch: 'task/test/other' }],
  ['preexisting staged change', { stagedPaths: ['owned/staged.txt'] }],
  ['empty working tree', { workingPaths: [] }],
]) {
  test(`${name} is blocked before verification and Controller commit`, async () => {
    const context = setup('ready_to_integrate');
    context.controller.git.observeWorkingTree = async () => ({
      head: 'base-sha', branch: 'task/test/T01', stagedPaths: [], workingPaths: ['owned/result.txt'], ...override,
    });
    await context.controller.processResult(context.task, context.result);
    assert.equal(context.calls.includes('candidate:commit'), false);
    assert.equal(context.calls.includes('mechanical:facts'), false);
    assert.ok(context.calls.includes('publish:blocked'));
  });
}

test('verification failure blocks before staging and commit', async () => {
  const context = setup('ready_to_integrate');
  context.task.verification = ['node --test failing.test.mjs'];
  context.controller.git.run = async () => {
    context.calls.push('verification:run');
    return { exitCode: 1, stdout: '', stderr: 'failed', error: null };
  };
  await context.controller.processResult(context.task, context.result);
  assert.equal(context.calls.filter((call) => call === 'working:observe').length, 1);
  assert.ok(context.calls.indexOf('working:observe') < context.calls.indexOf('verification:run'));
  assert.equal(context.calls.includes('candidate:commit'), false);
  assert.equal(context.calls.includes('mechanical:facts'), false);
  assert.ok(context.calls.includes('publish:blocked'));
});

test('post-verification working path drift blocks before staging and commit', async () => {
  const context = setup('ready_to_integrate');
  let observations = 0;
  context.controller.git.observeWorkingTree = async () => {
    observations += 1;
    return {
      head: 'base-sha', branch: 'task/test/T01', stagedPaths: [],
      workingPaths: observations === 1 ? ['owned/result.txt'] : ['owned/drift.txt', 'owned/result.txt'],
    };
  };
  await context.controller.processResult(context.task, context.result);
  assert.equal(observations, 2);
  assert.equal(context.calls.includes('candidate:commit'), false);
  assert.ok(context.calls.includes('publish:blocked'));
});

for (const [name, override] of [
  ['HEAD', { head: 'other-head' }],
  ['branch', { branch: 'task/test/other' }],
  ['staged paths', { stagedPaths: ['owned/result.txt'] }],
]) {
  test(`post-verification ${name} drift blocks before Controller commit`, async () => {
    const context = setup('ready_to_integrate');
    let observations = 0;
    context.controller.git.observeWorkingTree = async () => {
      observations += 1;
      return {
        head: 'base-sha', branch: 'task/test/T01', stagedPaths: [], workingPaths: ['owned/result.txt'],
        ...(observations === 2 ? override : {}),
      };
    };
    await context.controller.processResult(context.task, context.result);
    assert.equal(observations, 2);
    assert.equal(context.calls.includes('candidate:commit'), false);
    assert.ok(context.calls.includes('publish:blocked'));
  });
}

test('post-commit changed path mismatch blocks before the mechanical gate', async () => {
  const context = setup('ready_to_integrate');
  context.controller.git.collectTaskFacts = async () => {
    context.calls.push('mechanical:facts');
    return {
      baseSha: 'base-sha',
      taskHeadSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      parentSha: 'base-sha',
      actualChangedFiles: ['owned/other.txt'],
    };
  };
  await context.controller.processResult(context.task, context.result);
  assert.equal(context.calls.filter((call) => call === 'candidate:commit').length, 1);
  assert.equal(context.calls.includes('mechanical:gate'), false);
  assert.ok(context.calls.includes('publish:blocked'));
});

for (const status of ['blocked', 'needs_decision']) {
  test(`complete ${status} result settles before Git observation`, async () => {
    const context = setup('ready_to_integrate');
    context.result.processResult.lastMessage = validCodingResult({ status, changed_files: undefined });
    await context.controller.processResult(context.task, context.result);
    assert.equal(context.calls.includes('working:observe'), false);
    assert.equal(context.calls.includes('mechanical:facts'), false);
    assert.equal(context.calls.some((call) => call.startsWith('push:')), false);
    assert.equal(context.calls.includes('integrate'), false);
    assert.ok(context.calls.includes(`publish:${status}`));
  });
}

test('native process facts continue into Supervisor evidence and lifecycle publication', async () => {
  const native = { threadId: 'thread-7', turnId: 'turn-9', status: 'completed' };
  const context = setup('ready_to_integrate', { native });
  await context.controller.processResult(context.task, context.result);

  assert.equal(context.records.supervisorInputs.length, 1);
  assert.match(context.records.supervisorInputs[0].prompt, /"native_thread_id": "thread-7"/);
  assert.match(context.records.supervisorInputs[0].prompt, /"native_turn_id": "turn-9"/);
  assert.match(context.records.supervisorInputs[0].prompt, /"native_turn_status": "completed"/);
  assert.deepEqual(
    {
      native_thread_id: context.records.publishedEvents.at(-1).native_thread_id,
      native_turn_id: context.records.publishedEvents.at(-1).native_turn_id,
      native_turn_status: context.records.publishedEvents.at(-1).native_turn_status,
    },
    { native_thread_id: 'thread-7', native_turn_id: 'turn-9', native_turn_status: 'completed' },
  );
});

test('missing dependency blocks after Supervisor and before Task push', async () => {
  const context = setup('ready_to_integrate');
  context.task.depends_on = ['T00'];
  await context.controller.processResult(context.task, context.result);
  assert.ok(context.calls.includes('supervisor:ready_to_integrate'));
  assert.equal(context.calls.some((call) => call.startsWith('push:')), false);
  assert.equal(context.calls.includes('integrate'), false);
  assert.ok(context.calls.includes('publish:blocked'));
});

test('production result boundary contains no transition Task-ID or amendment special case', async () => {
  const source = await readFile(new URL('../controller.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /T05(?:F00|F01)?/);
  assert.doesNotMatch(source, /pass-under-accepted-amendment/);
});

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

test('uncertain Worker launch stops without a dependent lifecycle event', async () => {
  const context = setup('ready_to_integrate');
  const error = new Error('matching terminal observation is missing');
  error.status = 'needs_decision';
  error.details = { failure_class: 'POST_MUTATION_UNCERTAIN', boundary: 'worker_launch' };
  context.result.processResult = { error, exitCode: null, stderr: '', lastMessage: '' };
  await assert.rejects(context.controller.processResult(context.task, context.result), (caught) => caught === error);
  assert.equal(context.calls.some((call) => call.startsWith('publish:')), false);
  assert.equal(context.calls.includes('mechanical:facts'), false);
});

test('restores a current integrated dispatch only after matching Git recovery facts', async () => {
  const data = await recoveryFixture();
  try {
    const context = await data.controller.load();
    await data.controller.prepareExecution();
    assert.equal(context.states.get('T01'), 'integrated');
    assert.equal(context.mappings.get('T01').stage_commit_sha, 'stage-commit');
    assert.deepEqual(data.calls, ['remoteBranchHead:stage/wf/S01', 'remoteBranchHead:task/wf/T01', 'commitExists', 'isAncestor', 'changedFiles']);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('treats an older unmatched dispatch as unknown prior-start state', async () => {
  const data = await recoveryFixture({
    events: [{
      repository: 'owner/repo', workflow_id: 'wf', stage_id: 'S01', stage_branch: 'stage/wf/S01',
      task_id: 'T01', dispatch_id: 'dispatch-old', status: 'task_integrated', source_task_sha: 'old-task', stage_commit_sha: 'old-stage',
    }],
  });
  try {
    await assert.rejects(
      data.controller.load(),
      (error) => error.status === 'needs_decision' && /prior Task start state is ambiguous/.test(error.message),
    );
    assert.deepEqual(data.calls, ['remoteBranchHead:stage/wf/S01']);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('recovery requires handoff Stage head to equal the actual remote and PR head', async () => {
  const data = await recoveryFixture({ handoff: { stage_head_sha: 'stale-stage' } });
  try {
    await assert.rejects(data.controller.load(), (error) => error.status === 'needs_decision' && /handoff Stage head/.test(error.message));
    assert.deepEqual(data.calls, ['remoteBranchHead:stage/wf/S01']);
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
        (async () => { await data.controller.load(); await data.controller.prepareExecution(); })(),
        (error) => error.status === 'needs_decision' && scenario.message.test(error.message),
      );
    } finally {
      await rm(data.owner, { recursive: true, force: true });
    }
  });
}

async function preparedGateFixture(scenario = 'valid') {
  const owner = await mkdtemp(join(tmpdir(), 'codex-bridge-fix-gate-'));
  await mkdir(join(owner, '.github', 'scripts'), { recursive: true });
  await writeFile(join(owner, '.github', 'scripts', 'read-router-contract.mjs'), 'export function readRouterContract(source) { return JSON.parse(source); }\n');
  const calls = [];
  const task = {
    task_id: 'T01F01', dispatch_id: 'dispatch-original', task_contract_path: 'docs/T01F01.md',
    task_branch: 'task/wf/T01F01', depends_on: [], owns: ['owned/**'], model_policy: 'coding_strong',
    reasoning_effort: 'high', fallback_model_policy: null, verification: [],
  };
  const router = { repository: 'owner/repo', workflow_id: 'wf', stage_id: 'S01', stage_branch: 'stage/wf/S01', tasks: [task] };
  const contract = `## Contract\n\n\`\`\`yaml\n+task_id: T01F01\n+dispatch_id: dispatch-original\n+status: Accepted\n+confirmed_by_user: true\n+task_branch: task/wf/T01F01\n+task_contract_path: docs/T01F01.md\n+\`\`\`\n`.replaceAll('\n+', '\n');
  const preparation = {
    record_type: 'FIX_PREPARED_V1', fix_preparation_id: 'preparation-1', fix_round_id: 'round-1', workflow_id: 'wf',
    stage_id: 'S01', repository: 'owner/repo', pull_request_number: 7, stage_branch: 'stage/wf/S01',
    source_review_id: 'review-1', source_confirmation_id: 'confirmation-1', source_stage_sha: 'source-sha',
    solution_id: 'solution-1', prepared_stage_sha: 'prepared-sha', router_contract_path: 'docs/router.md',
    tasks: [{
      task_id: 'T01F01', dispatch_id: 'dispatch-original', fix_round_id: 'round-1', fix_preparation_id: 'preparation-1',
      task_branch: 'task/wf/T01F01', task_contract_path: 'docs/T01F01.md', immutable_dispatch_facts: { base_sha: 'source-sha' },
    }],
    record_authority: 'local_bridge_controller', source_kind: 'git_observation',
  };
  if (scenario === 'cross-lineage') preparation.repository = 'other/repo';
  const verification = {
    record_type: 'STAGE_VERIFICATION_V1', verification_id: 'verification-1', event_id: 'event-1', workflow_id: 'wf',
    stage_id: 'S01', stage_sha: scenario === 'stale-pass' ? 'old-sha' : 'prepared-sha', result: 'PASS', checks: [],
    record_authority: 'github_actions',
  };
  const acceptance = {
    record_type: 'FIX_BUNDLE_ACCEPTANCE_V1', acceptance_id: 'acceptance-1', fix_round_id: 'round-1',
    fix_preparation_id: 'preparation-1', prepared_stage_sha: 'prepared-sha', router_contract_path: 'docs/router.md',
    verification_id: 'verification-1', handoff_id: 'fix-handoff-1', task_dispatch_mapping: { T01F01: 'dispatch-original' },
    decision: 'accepted', decision_authority: 'user',
    source_reference: { source_kind: 'fixed_chat_user_decision', decision_reference: 'user-message-1' },
  };
  const handoff = {
    status: 'ready_for_fix_dispatch', repository: 'owner/repo', pull_request_number: 7, workflow_id: 'wf', stage_id: 'S01',
    stage_branch: 'stage/wf/S01', prepared_stage_sha: scenario === 'stale-handoff' ? 'old-sha' : 'prepared-sha',
    router_contract_path: 'docs/router.md', fix_round_id: 'round-1', fix_preparation_id: 'preparation-1',
    source_review_id: 'review-1', source_confirmation_id: 'confirmation-1', verification_id: 'verification-1',
    handoff_id: 'fix-handoff-1', task_dispatch_mapping: { T01F01: 'dispatch-original' }, execution_surface: 'local_codex',
  };
  const records = [preparation, verification];
  if (scenario !== 'missing-acceptance') records.push(acceptance);
  const lifecycle = { records, fixHandoffs: [handoff], reviewHandoffs: [], errors: [] };
  const events = scenario === 'unknown-start' ? [{
    repository: 'owner/repo', workflow_id: 'wf', stage_id: 'S01', stage_branch: 'stage/wf/S01', task_id: 'T01F01',
    dispatch_id: 'dispatch-old', status: 'task_dispatched',
  }] : [];
  const github = {
    discover: async () => [{
      prNumber: 7, prHeadSha: 'prepared-sha', prHeadBranch: 'stage/wf/S01', handoff: null,
      handoffErrors: [], eventErrors: [], lifecycle, events,
    }],
    readRepositoryFileBytes: async (_repository, path) => Buffer.from(path === 'docs/router.md' ? JSON.stringify(router) : contract),
    publishEvent: async (_repository, _pr, event) => { calls.push(`publish:${event.status}:${event.dispatch_id}`); },
    publishCandidate: async () => { calls.push('candidate'); },
  };
  const git = {
    remoteBranchHead: async () => 'prepared-sha',
    fetchStage: async () => { calls.push('fetchStage'); return 'prepared-sha'; },
    ensureStageWorktree: async () => { calls.push('ensureStageWorktree'); return 'stage-worktree'; },
    ensureTaskWorktree: async () => { calls.push('ensureTaskWorktree'); return 'task-worktree'; },
    head: async () => 'prepared-sha',
    currentBranch: async (worktree) => worktree === 'task-worktree' ? 'task/wf/T01F01' : 'stage/wf/S01',
    status: async () => '',
  };
  const launcher = {
    launchWorker: async (_context, cachedContract) => {
      calls.push(`launch:${cachedContract === contract ? 'cached' : 'wrong'}:${_context.task.dispatch_id}`);
      return { exitCode: 0, error: null, stderr: '', lastMessage: '' };
    },
  };
  const schedule = async ({ tasks, launch }) => {
    calls.push('scheduler');
    await launch(tasks[0]);
    return { launched: [tasks[0].task_id] };
  };
  const controller = new BridgeController({
    repository: 'owner/repo', repositoryRoot: owner, worktreeRoot: owner, github, git, launcher,
    capability: { models: new Set(['gpt-5.6-sol']), modelEfforts: new Map([['gpt-5.6-sol', new Set(['high'])]]) },
    schedules: { start: schedule, 'run-once': schedule }, log: () => {},
  });
  return { owner, calls, controller, lifecycle, acceptance };
}

for (const mode of ['start', 'run-once']) {
  test(`${mode} rejects cross-lineage prepared Fix before execution preparation`, async () => {
    const data = await preparedGateFixture('cross-lineage');
    data.controller.processResult = async () => { data.calls.push('processResult'); };
    try {
      const result = await data.controller.run(mode);
      assert.equal(result.status, 'needs_decision');
      assert.equal(result.failure_class, 'PRE_MUTATION_FAILURE');
      assert.deepEqual(data.calls, []);
    } finally {
      await rm(data.owner, { recursive: true, force: true });
    }
  });

  for (const [scenario, label] of [
    ['missing-acceptance', 'acceptance absent'],
    ['stale-pass', 'PASS stale'],
    ['stale-handoff', 'handoff stale'],
    ['unknown-start', 'prior start unknown'],
  ]) {
    test(`${mode} rejects prepared Fix when ${label} before every mutation`, async () => {
      const data = await preparedGateFixture(scenario);
      try {
        const result = await data.controller.run(mode);
        assert.equal(result.status, 'needs_decision');
        assert.equal(result.failure_class, 'PRE_MUTATION_FAILURE');
        assert.deepEqual(data.calls, []);
      } finally {
        await rm(data.owner, { recursive: true, force: true });
      }
    });
  }

  test(`${mode} dispatches a valid prepared Fix once with cached bytes and the original ID`, async () => {
    const data = await preparedGateFixture('valid');
    try {
      const result = await data.controller.run(mode);
      assert.equal(result.status, 'idle');
      assert.deepEqual(data.calls, [
        'fetchStage', 'ensureStageWorktree', 'scheduler', 'ensureTaskWorktree',
        'publish:task_dispatched:dispatch-original', 'launch:cached:dispatch-original',
      ]);
    } finally {
      await rm(data.owner, { recursive: true, force: true });
    }
  });

  test(`${mode} rejection does not consume the preallocated dispatch ID`, async () => {
    const data = await preparedGateFixture('missing-acceptance');
    try {
      const rejected = await data.controller.run(mode);
      assert.equal(rejected.failure_class, 'PRE_MUTATION_FAILURE');
      assert.deepEqual(data.calls, []);
      data.lifecycle.records.push(data.acceptance);
      const accepted = await data.controller.run(mode);
      assert.equal(accepted.status, 'idle');
      assert.equal(data.calls.filter((call) => call === 'publish:task_dispatched:dispatch-original').length, 1);
      assert.equal(data.calls.filter((call) => call === 'launch:cached:dispatch-original').length, 1);
      assert.equal(data.calls.some((call) => call.includes('replacement')), false);
    } finally {
      await rm(data.owner, { recursive: true, force: true });
    }
  });
}

const T01_PATHS = [
  'tools/codex-github-bridge/cli.mjs',
  'tools/codex-github-bridge/codex.mjs',
  'tools/codex-github-bridge/controller.mjs',
  'tools/codex-github-bridge/git.mjs',
  'tools/codex-github-bridge/github.mjs',
  'tools/codex-github-bridge/index.mjs',
  'tools/codex-github-bridge/lifecycle.mjs',
  'tools/codex-github-bridge/structured-records.mjs',
  'tools/codex-github-bridge/tests/cli.test.mjs',
  'tools/codex-github-bridge/tests/codex.test.mjs',
  'tools/codex-github-bridge/tests/controller.test.mjs',
  'tools/codex-github-bridge/tests/git.test.mjs',
  'tools/codex-github-bridge/tests/github.test.mjs',
  'tools/codex-github-bridge/tests/lifecycle.test.mjs',
  'tools/codex-github-bridge/tests/structured-records.test.mjs',
].sort();

const CURRENT_CANDIDATE_SHA = '612b46fdb11a4c72289e5be53b3bed73048fd3b1';
const ALTERNATE_CANDIDATE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CURRENT_ACCEPTED_STAGE_SHA = 'e3aa947ed7436b43db5775588753c95e2d5cc0ec';
const CURRENT_TASK_CONTRACT_BLOB_SHA = '9ead0beb0c3528a1f9b65befab5422f09184139a';
const ALTERNATE_ACCEPTED_STAGE_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const ALTERNATE_TASK_CONTRACT_BLOB_SHA = 'cccccccccccccccccccccccccccccccccccccccc';

function supervisorOnlyRequest(worktree, {
  candidateSha = CURRENT_CANDIDATE_SHA,
  acceptedStageSha = CURRENT_ACCEPTED_STAGE_SHA,
  taskContractBlobSha = CURRENT_TASK_CONTRACT_BLOB_SHA,
} = {}) {
  return {
    ...SUPERVISOR_ONLY_BINDING,
    accepted_stage_sha: acceptedStageSha,
    task_contract_blob_sha: taskContractBlobSha,
    candidate_sha: candidateSha,
    canonical_task_worktree: worktree,
    verification_evidence: {
      task_id: SUPERVISOR_ONLY_BINDING.task_id,
      dispatch_id: SUPERVISOR_ONLY_BINDING.dispatch_id,
      candidate_sha: candidateSha,
      dispatch_base_sha: SUPERVISOR_ONLY_BINDING.candidate_parent_sha,
      focused: '23/23',
      bridge: '121/121',
      typecheck: 'pass',
      diff_check: 'pass',
      full_suite: '403/409',
      baseline: '403/409',
      failure_sets_identical: true,
      failure_evidence_identical: true,
      classification: 'baseline_equivalent_no_new_regression',
      new_regressions: 0,
    },
  };
}

async function supervisorOnlyFixture(overrides = {}) {
  const owner = await mkdtemp(join(tmpdir(), 'codex-supervisor-only-'));
  const readCalls = [];
  const mutationCalls = [];
  const supervisorCalls = [];
  const launcherCalls = [];
  const request = supervisorOnlyRequest(owner, {
    candidateSha: overrides.candidateSha,
    acceptedStageSha: overrides.acceptedStageSha,
    taskContractBlobSha: overrides.taskContractBlobSha,
  });
  const freshAuthority = {
    remoteStageSha: overrides.remoteStageSha ?? request.accepted_stage_sha,
    contractBlobSha: overrides.contractBlobSha ?? request.task_contract_blob_sha,
  };
  const candidate = {
    head: request.candidate_sha,
    branch: request.task_branch,
    status: '',
    stagedPaths: [],
    unstagedPaths: [],
    untrackedPaths: [],
    commitExists: true,
    parents: [request.candidate_parent_sha],
    parentSha: request.candidate_parent_sha,
    changedFiles: [...T01_PATHS],
    diffCheckPassed: true,
    diffCheckError: '',
    ...overrides.candidate,
  };
  const worktrees = overrides.worktrees ?? [{ path: owner, head: request.candidate_sha, branch: request.task_branch }];
  const router = {
    repository: request.repository,
    workflow_id: request.workflow_id,
    stage_id: request.stage_id,
    stage_branch: request.remote_stage_branch,
    tasks: [{
      task_id: request.task_id,
      dispatch_id: request.dispatch_id,
      task_branch: request.task_branch,
      task_contract_path: request.task_contract_path,
      model_policy: 'coding_strong',
      reasoning_effort: 'high',
      fallback_model_policy: null,
      owns: [...T01_PATHS],
    }],
    ...overrides.router,
  };
  const git = {
    readBlobAtCommit: async (commit, path, expectedBlobSha) => {
      readCalls.push(`blob:${commit}:${path}:${expectedBlobSha ?? ''}`);
      if (path === request.task_contract_path) {
        return { blobSha: freshAuthority.contractBlobSha, bytes: Buffer.from('exact accepted contract') };
      }
      return { blobSha: 'router-blob-sha', bytes: Buffer.from('exact accepted router') };
    },
    listWorktrees: async () => worktrees,
    observeSupervisorOnlyCandidate: async () => candidate,
    mechanicalGate: async () => {
      readCalls.push('mechanicalGate');
      if (overrides.mechanicalGateError) throw new Error(overrides.mechanicalGateError);
    },
    remoteBranchHead: async (branch) => {
      readCalls.push(`remote:${branch}`);
      if (branch === request.task_branch) return overrides.remoteTaskSha ?? null;
      return freshAuthority.remoteStageSha;
    },
    completeDiff: async (base, head) => {
      readCalls.push(`diff:${base}..${head}`);
      return overrides.completeDiff ?? 'complete parent-to-candidate diff';
    },
    fetchStage: async () => { mutationCalls.push('fetchStage'); },
    ensureStageWorktree: async () => { mutationCalls.push('ensureStageWorktree'); },
    ensureTaskWorktree: async () => { mutationCalls.push('ensureTaskWorktree'); },
    createCandidateCommit: async () => { mutationCalls.push('createCandidateCommit'); },
    add: async () => { mutationCalls.push('gitAdd'); },
    commit: async () => { mutationCalls.push('gitCommit'); },
    amend: async () => { mutationCalls.push('gitAmend'); },
    pushTask: async () => { mutationCalls.push('pushTask'); },
    integrate: async () => { mutationCalls.push('integrate'); },
    pushPreparedStage: async () => { mutationCalls.push('pushPreparedStage'); },
    pushMain: async () => { mutationCalls.push('pushMain'); },
  };
  const pr = {
    number: request.pull_request_number,
    state: 'OPEN',
    isDraft: true,
    headRefName: request.remote_stage_branch,
    headRefOid: request.accepted_stage_sha,
    baseRefName: 'main',
    baseRefOid: 'main-base-sha',
    ...overrides.pr,
  };
  const github = {
    pullRequestFacts: async () => {
      readCalls.push(`pr:${request.pull_request_number}`);
      return pr;
    },
    publishEvent: async () => { mutationCalls.push('publishEvent'); },
    publishCandidate: async () => { mutationCalls.push('publishCandidate'); },
    comment: async () => { mutationCalls.push('comment'); },
    label: async () => { mutationCalls.push('label'); },
    markReady: async () => { mutationCalls.push('markReady'); },
  };
  const supervisorRunner = overrides.supervisorRunner ?? (async (input) => {
    supervisorCalls.push(input);
    return overrides.supervisorResult ?? { status: 'ready_to_integrate', reason: 'exact\nmultiline\nreason' };
  });
  const launcher = {
    launchWorker: async () => { mutationCalls.push('launchWorker'); },
    execute: async (...args) => {
      launcherCalls.push(args);
      return { error: null, exitCode: 0, stderr: '', lastMessage: '' };
    },
    ...(overrides.launcher ?? {}),
  };
  const controller = new SupervisorOnlyController({
    repository: request.repository,
    repositoryRoot: owner,
    github,
    git,
    launcher,
    canonicalCodexExecutable: overrides.codexBin ?? SUPERVISOR_ONLY_CODEX_EXECUTABLE,
    environmentSource: overrides.environmentSource ?? { SystemRoot: 'C:\\Windows', PATH: 'C:\\Windows\\System32' },
    routerLoader: async () => router,
    supervisorRunner,
  });
  controller.finishIfComplete = async () => { mutationCalls.push('finishIfComplete'); };
  return {
    owner, request, controller, candidate, worktrees, freshAuthority, pr,
    readCalls, mutationCalls, supervisorCalls, launcherCalls,
  };
}

test('Supervisor-only plan binds exact authority, mechanical facts, policy, evidence, and complete Diff without launch', async () => {
  const data = await supervisorOnlyFixture();
  try {
    assert.equal(Object.hasOwn(SUPERVISOR_ONLY_BINDING, 'candidate_sha'), false);
    assert.equal(Object.hasOwn(SUPERVISOR_ONLY_BINDING, 'accepted_stage_sha'), false);
    assert.equal(Object.hasOwn(SUPERVISOR_ONLY_BINDING, 'task_contract_blob_sha'), false);
    assert.equal(Object.hasOwn(SUPERVISOR_ONLY_BINDING, 'remote_stage_expected_sha'), false);
    const result = await data.controller.plan(data.request);
    assert.equal(result.status, 'supervisor_only_plan_ready');
    assert.equal(result.execution_plan.candidate_sha, CURRENT_CANDIDATE_SHA);
    assert.equal(result.execution_plan.accepted_stage_sha, CURRENT_ACCEPTED_STAGE_SHA);
    assert.equal(result.execution_plan.task_contract_blob_sha, CURRENT_TASK_CONTRACT_BLOB_SHA);
    assert.deepEqual(result.execution_plan.exact_changed_files, T01_PATHS);
    assert.equal(result.execution_plan.complete_diff, 'complete parent-to-candidate diff');
    assert.equal(result.execution_plan.model, 'gpt-5.6-sol');
    assert.equal(result.execution_plan.reasoning_effort, 'high');
    assert.equal(result.execution_plan.environment_policy.inheritance, 'explicit_allowlist');
    assert.equal(result.execution_plan.provider_and_destination.destination_family, 'chatgpt.com:443');
    assert.equal(result.execution_plan.retry_policy.bridge_retry, 'none');
    assert.equal(result.execution_plan.child_process_policy.worker_launch, false);
    assert.equal(data.supervisorCalls.length, 0);
    assert.deepEqual(data.mutationCalls, []);
    assert.ok(data.readCalls.includes(`diff:${data.request.candidate_parent_sha}..${data.request.candidate_sha}`));
    const remoteStageRead = data.readCalls.indexOf(`remote:${data.request.remote_stage_branch}`);
    const prRead = data.readCalls.indexOf(`pr:${data.request.pull_request_number}`);
    const contractRead = data.readCalls.indexOf(
      `blob:${CURRENT_ACCEPTED_STAGE_SHA}:${data.request.task_contract_path}:${CURRENT_TASK_CONTRACT_BLOB_SHA}`,
    );
    assert.ok(remoteStageRead >= 0 && remoteStageRead < prRead);
    assert.ok(prRead < contractRead);
    assert.ok(data.readCalls.includes(
      `blob:${CURRENT_ACCEPTED_STAGE_SHA}:${data.request.router_contract_path}:`,
    ));

    const alternateRequest = structuredClone(data.request);
    alternateRequest.verification_evidence.focused = '24/24';
    alternateRequest.verification_evidence.bridge = '122/122';
    alternateRequest.verification_evidence.full_suite = '404/410';
    alternateRequest.verification_evidence.baseline = '404/410';
    const alternate = await data.controller.plan(alternateRequest);
    assert.equal(alternate.status, 'supervisor_only_plan_ready');
    assert.equal(alternate.execution_plan.verification_evidence.bridge, '122/122');
    assert.equal(data.supervisorCalls.length, 0);
    assert.deepEqual(data.mutationCalls, []);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('Supervisor-only request accepts another exact Stage and Contract blob authority without a compiled identity', async () => {
  const data = await supervisorOnlyFixture({
    acceptedStageSha: ALTERNATE_ACCEPTED_STAGE_SHA,
    taskContractBlobSha: ALTERNATE_TASK_CONTRACT_BLOB_SHA,
  });
  try {
    const result = await data.controller.plan(data.request);
    assert.equal(result.status, 'supervisor_only_plan_ready');
    assert.equal(result.execution_plan.accepted_stage_sha, ALTERNATE_ACCEPTED_STAGE_SHA);
    assert.equal(result.execution_plan.task_contract_blob_sha, ALTERNATE_TASK_CONTRACT_BLOB_SHA);
    assert.ok(data.readCalls.includes(
      `blob:${ALTERNATE_ACCEPTED_STAGE_SHA}:${data.request.task_contract_path}:${ALTERNATE_TASK_CONTRACT_BLOB_SHA}`,
    ));
    assert.equal(data.supervisorCalls.length, 0);
    assert.deepEqual(data.launcherCalls, []);
    assert.deepEqual(data.mutationCalls, []);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('Supervisor-only production binding contains no concrete Stage or Contract blob authority', async () => {
  const source = await readFile(new URL('../controller.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /accepted_stage_sha:\s*['"][0-9a-f]{40}['"]/);
  assert.doesNotMatch(source, /task_contract_blob_sha:\s*['"][0-9a-f]{40}['"]/);
  for (const historicalOrCurrentSha of [
    '99a317074f6ebcd6b61f66eb0c0f3df801d41d88',
    CURRENT_ACCEPTED_STAGE_SHA,
    'aca8d8b5f6421ae943c1effa04b1110bbffd1d8b',
    CURRENT_TASK_CONTRACT_BLOB_SHA,
  ]) {
    assert.equal(source.includes(historicalOrCurrentSha), false);
  }
});

test('Supervisor-only request accepts any exact candidate SHA that matches Git facts', async () => {
  const data = await supervisorOnlyFixture({ candidateSha: ALTERNATE_CANDIDATE_SHA });
  try {
    const result = await data.controller.plan(data.request);
    assert.equal(result.status, 'supervisor_only_plan_ready');
    assert.equal(result.execution_plan.candidate_sha, ALTERNATE_CANDIDATE_SHA);
    assert.ok(data.readCalls.includes(
      `diff:${data.request.candidate_parent_sha}..${ALTERNATE_CANDIDATE_SHA}`,
    ));
    assert.equal(data.supervisorCalls.length, 0);
    assert.deepEqual(data.mutationCalls, []);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('Supervisor-only execute returns every complete Supervisor status and reason then stops structurally', async () => {
  for (const status of ['ready_to_integrate', 'blocked', 'needs_decision']) {
    const reason = `${status}\nline two\nline three`;
    const data = await supervisorOnlyFixture({ supervisorResult: { status, reason } });
    try {
      const approved = await data.controller.plan(data.request);
      const reordered = {
        execution_plan: Object.fromEntries(Object.entries(approved.execution_plan).reverse()),
        status: approved.status,
      };
      const result = await data.controller.execute(reordered);
      assert.deepEqual(result, {
        status,
        reason,
        external_supervisor_started: true,
        git_mutation: false,
        github_mutation: false,
      });
      assert.equal(data.supervisorCalls.length, 1);
      assert.equal(data.supervisorCalls[0].contract, 'exact accepted contract');
      assert.equal(data.supervisorCalls[0].diff, 'complete parent-to-candidate diff');
      assert.deepEqual(data.mutationCalls, []);
    } finally {
      await rm(data.owner, { recursive: true, force: true });
    }
  }
});

test('Supervisor-only invalid output and process failure preserve existing blocked semantics with zero mutation', async () => {
  for (const processResult of [
    { error: null, exitCode: 0, stderr: '', lastMessage: '{"status":"invalid","reason":"bad"}' },
    { error: new Error('host process rejected'), exitCode: null, stderr: '', lastMessage: '' },
  ]) {
    const data = await supervisorOnlyFixture({
      supervisorRunner: undefined,
      launcher: { execute: async () => processResult },
    });
    data.controller.supervisorRunner = (await import('../supervisor.mjs')).runSupervisor;
    try {
      const approved = await data.controller.plan(data.request);
      const result = await data.controller.execute(approved);
      assert.equal(result.status, 'blocked');
      assert.equal(result.external_supervisor_started, true);
      assert.deepEqual(data.mutationCalls, []);
    } finally {
      await rm(data.owner, { recursive: true, force: true });
    }
  }
});

test('Supervisor-only lost reason becomes needs_decision without repository or GitHub mutation', async () => {
  const data = await supervisorOnlyFixture({ supervisorResult: { status: 'blocked', reason: '' } });
  try {
    const approved = await data.controller.plan(data.request);
    const result = await data.controller.execute(approved);
    assert.equal(result.status, 'needs_decision');
    assert.equal(result.reason, 'supervisor_reason_lost');
    assert.equal(result.external_supervisor_started, true);
    assert.equal(data.supervisorCalls.length, 1);
    assert.deepEqual(data.mutationCalls, []);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('Supervisor-only preflight drift prevents launch and every mutation', async () => {
  const cases = [
    ['candidate SHA', { candidate: { head: 'candidate-drift' } }],
    ['parent', { candidate: { parents: ['parent-drift'], parentSha: 'parent-drift' } }],
    ['branch', { candidate: { branch: 'task/wrong' } }],
    ['dirty worktree', { candidate: { status: ' M dirty.txt', unstagedPaths: ['dirty.txt'] } }],
    ['staged path', { candidate: { status: 'M  staged.txt', stagedPaths: ['staged.txt'] } }],
    ['changed path ownership', { candidate: { changedFiles: [...T01_PATHS.slice(1), 'outside.txt'] } }],
    ['worktree registration', { worktrees: [] }],
    ['remote Task branch', { remoteTaskSha: CURRENT_CANDIDATE_SHA }],
    ['Stage head', { remoteStageSha: 'stage-drift' }],
    ['PR state', { pr: { state: 'CLOSED' } }],
    ['PR draft', { pr: { isDraft: false } }],
    ['PR head branch', { pr: { headRefName: 'stage/wrong/S01' } }],
    ['PR head', { pr: { headRefOid: 'pr-head-drift' } }],
    ['PR base', { pr: { baseRefName: 'develop' } }],
    ['Contract blob', { contractBlobSha: 'contract-blob-drift' }],
    ['mechanical gate', { mechanicalGateError: 'mechanical failure' }],
    ['Codex executable', { codexBin: 'C:\\wrong\\codex.exe' }],
  ];
  for (const [label, overrides] of cases) {
    const data = await supervisorOnlyFixture(overrides);
    try {
      const result = await data.controller.plan(data.request);
      assert.equal(result.status, 'needs_decision', label);
      assert.equal(result.external_supervisor_started, false, label);
      assert.equal(data.supervisorCalls.length, 0, label);
      assert.deepEqual(data.launcherCalls, [], label);
      assert.deepEqual(data.mutationCalls, [], label);
    } finally {
      await rm(data.owner, { recursive: true, force: true });
    }
  }
});

test('Supervisor-only approved-plan executable, model, effort, environment, config, or Diff drift prevents launch', async () => {
  for (const mutate of [
    (plan) => { plan.canonical_codex_executable = 'C:\\wrong\\codex.exe'; },
    (plan) => { plan.model = 'wrong-model'; },
    (plan) => { plan.reasoning_effort = 'medium'; },
    (plan) => { plan.environment_policy.effective_environment.PATH = 'C:\\drift'; },
    (plan) => { plan.argv_template = [...plan.argv_template, '--unexpected']; },
    (plan) => { plan.complete_diff = 'partial diff'; },
  ]) {
    const data = await supervisorOnlyFixture();
    try {
      const approved = await data.controller.plan(data.request);
      const changed = structuredClone(approved);
      mutate(changed.execution_plan);
      const result = await data.controller.execute(changed);
      assert.equal(result.status, 'needs_decision');
      assert.equal(result.external_supervisor_started, false);
      assert.equal(data.supervisorCalls.length, 0);
      assert.deepEqual(data.mutationCalls, []);
    } finally {
      await rm(data.owner, { recursive: true, force: true });
    }
  }

  const data = await supervisorOnlyFixture();
  try {
    const approved = await data.controller.plan(data.request);
    const fresh = structuredClone(approved);
    fresh.execution_plan.verification_evidence.bridge = '122/122';
    data.controller.plan = async (request) => {
      assert.equal(request.verification_evidence.bridge, '121/121');
      return fresh;
    };

    const result = await data.controller.execute(approved);
    assert.equal(result.status, 'needs_decision');
    assert.equal(result.reason, 'approved execution plan does not directly equal fresh read-only facts');
    assert.equal(result.external_supervisor_started, false);
    assert.equal(data.supervisorCalls.length, 0);
    assert.deepEqual(data.mutationCalls, []);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('Supervisor-only execute rejects an approved candidate after fresh HEAD drifts', async () => {
  const data = await supervisorOnlyFixture();
  try {
    const approved = await data.controller.plan(data.request);
    data.candidate.head = ALTERNATE_CANDIDATE_SHA;
    data.worktrees[0].head = ALTERNATE_CANDIDATE_SHA;

    const result = await data.controller.execute(approved);
    assert.equal(result.status, 'needs_decision');
    assert.match(result.reason, /candidate/);
    assert.equal(result.external_supervisor_started, false);
    assert.equal(data.supervisorCalls.length, 0);
    assert.deepEqual(data.mutationCalls, []);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('Supervisor-only execute rejects fresh Stage and Contract blob authority drift before Supervisor launch', async () => {
  const data = await supervisorOnlyFixture();
  try {
    const approved = await data.controller.plan(data.request);
    data.freshAuthority.remoteStageSha = ALTERNATE_ACCEPTED_STAGE_SHA;
    data.freshAuthority.contractBlobSha = ALTERNATE_TASK_CONTRACT_BLOB_SHA;
    data.pr.headRefOid = ALTERNATE_ACCEPTED_STAGE_SHA;

    const result = await data.controller.execute(approved);
    assert.equal(result.status, 'needs_decision');
    assert.match(result.reason, /Stage head/);
    assert.equal(result.external_supervisor_started, false);
    assert.equal(data.supervisorCalls.length, 0);
    assert.deepEqual(data.launcherCalls, []);
    assert.deepEqual(data.mutationCalls, []);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('Supervisor-only strict request rejects malformed or inconsistent verification evidence before observation', async () => {
  const cases = [
    ['missing request field', (request) => { delete request.dispatch_id; }],
    ['extra request field', (request) => { request.extra = true; }],
    ['malformed accepted Stage SHA', (request) => { request.accepted_stage_sha = 'stage'; }],
    ['malformed Task Contract blob SHA', (request) => { request.task_contract_blob_sha = 'blob'; }],
    ['Task Contract path drift', (request) => { request.task_contract_path = 'docs/wrong.md'; }],
    ['missing candidate SHA', (request) => { request.candidate_sha = ''; request.verification_evidence.candidate_sha = ''; }],
    ['malformed candidate SHA', (request) => { request.candidate_sha = 'candidate'; request.verification_evidence.candidate_sha = 'candidate'; }],
    ['partial bridge', (request) => { request.verification_evidence.bridge = '120/121'; }],
    ['partial focused', (request) => { request.verification_evidence.focused = '22/23'; }],
    ...['121', '121/', '/121', 'foo', '0/0', '122/121'].map((value) => [
      `malformed count ${value}`,
      (request) => { request.verification_evidence.bridge = value; },
    ]),
    ['full suite differs from baseline', (request) => { request.verification_evidence.full_suite = '402/409'; }],
    ['failure sets differ', (request) => { request.verification_evidence.failure_sets_identical = false; }],
    ['failure evidence differs', (request) => { request.verification_evidence.failure_evidence_identical = false; }],
    ['new regression', (request) => { request.verification_evidence.new_regressions = 1; }],
    ['typecheck failure', (request) => { request.verification_evidence.typecheck = 'fail'; }],
    ['diff check failure', (request) => { request.verification_evidence.diff_check = 'fail'; }],
    ['classification mismatch', (request) => { request.verification_evidence.classification = 'pass'; }],
    ['extra evidence field', (request) => { request.verification_evidence.extra = true; }],
    ['missing evidence field', (request) => { delete request.verification_evidence.baseline; }],
    ['candidate mismatch', (request) => { request.verification_evidence.candidate_sha = 'candidate-drift'; }],
  ];
  for (const [label, mutate] of cases) {
    const data = await supervisorOnlyFixture();
    try {
      const request = structuredClone(data.request);
      mutate(request);
      const result = await data.controller.plan(request);
      assert.equal(result.status, 'needs_decision', label);
      assert.equal(data.readCalls.length, 0, label);
      assert.equal(data.supervisorCalls.length, 0, label);
      assert.deepEqual(data.mutationCalls, [], label);
    } finally {
      await rm(data.owner, { recursive: true, force: true });
    }
  }
});
