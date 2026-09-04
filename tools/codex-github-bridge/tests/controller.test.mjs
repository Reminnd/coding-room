import assert from 'node:assert/strict';
import test from 'node:test';
import { BridgeController } from '../controller.mjs';

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
