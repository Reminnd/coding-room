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

function setup(supervisorStatus) {
  const calls = [];
  const facts = {
    baseSha: 'base-sha',
    taskHeadSha: 'task-head-sha',
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
      lastMessage: 'status: candidate_ready',
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

test('pushes one ready candidate after Supervisor Integration and before Stage integration', async () => {
  const context = setup('ready_to_integrate');
  await context.controller.processResult(context.task, context.result);

  assert.equal(context.calls.filter((call) => call === 'push:task-head-sha').length, 1);
  assert.ok(context.calls.indexOf('supervisor:ready_to_integrate') < context.calls.indexOf('push:task-head-sha'));
  assert.ok(context.calls.indexOf('push:task-head-sha') < context.calls.indexOf('integrate'));
  assert.ok(context.calls.includes('publish:task_integrated'));
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
