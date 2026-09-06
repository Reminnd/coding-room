import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';
import { runNativeWorker } from '../codex-app-server.mjs';
import { CodexLauncher, buildWorkerPrompt } from '../codex.mjs';

class FakeAppServer extends EventEmitter {
  constructor({ threadId, turnId, failMethod = null }) {
    super();
    this.threadId = threadId;
    this.turnId = turnId;
    this.failMethod = failMethod;
    this.requests = [];
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.buffer = '';
    this.killed = false;
    this.turnStarted = new Promise((resolve) => { this.resolveTurnStarted = resolve; });
    this.stdin = new Writable({
      write: (chunk, _encoding, callback) => {
        try {
          this.buffer += chunk.toString();
          let newline = this.buffer.indexOf('\n');
          while (newline >= 0) {
            const line = this.buffer.slice(0, newline);
            this.buffer = this.buffer.slice(newline + 1);
            if (line) this.#receive(JSON.parse(line));
            newline = this.buffer.indexOf('\n');
          }
          callback();
        } catch (error) {
          callback(error);
        }
      },
    });
  }

  #receive(message) {
    this.requests.push(message);
    if (message.method === 'initialized') return;
    if (message.method === this.failMethod) {
      this.#write({ id: message.id, error: { code: -32602, message: `${message.method} unsupported` } });
      return;
    }
    if (message.method === 'initialize') {
      this.#write({ id: message.id, result: { userAgent: 'fake' } });
      return;
    }
    if (message.method === 'thread/start') {
      this.#write({ id: message.id, result: { thread: { id: this.threadId, ephemeral: true } } });
      this.notify('thread/started', { thread: { id: this.threadId } });
      return;
    }
    if (message.method === 'turn/start') {
      this.turnRequest = message;
      this.#write({ id: message.id, result: { turn: { id: this.turnId, status: 'inProgress', items: [] } } });
      this.notify('turn/started', {
        threadId: this.threadId,
        turn: { id: this.turnId, status: 'inProgress', items: [] },
      });
      this.resolveTurnStarted();
    }
  }

  #write(message) {
    this.stdout.write(`${JSON.stringify(message)}\n`);
  }

  notify(method, params) {
    this.#write({ method, params });
  }

  finish(status, lastMessage = null) {
    if (lastMessage !== null) {
      this.notify('item/completed', {
        threadId: this.threadId,
        turnId: this.turnId,
        item: { id: `message-${this.turnId}`, type: 'agentMessage', phase: 'final_answer', text: lastMessage },
      });
    }
    this.notify('turn/completed', {
      threadId: this.threadId,
      turn: {
        id: this.turnId,
        status,
        items: [],
        error: status === 'failed' ? { message: 'worker failed' } : null,
      },
    });
  }

  closeBeforeTerminal() {
    this.emit('close', 0, null);
  }

  kill() {
    this.killed = true;
    queueMicrotask(() => this.emit('close', null, 'SIGTERM'));
    return true;
  }
}

function context(taskId, worktree, overrides = {}) {
  return {
    repository: 'owner/repo',
    task: {
      task_id: taskId,
      dispatch_id: `dispatch-${taskId}`,
      task_branch: `task/wf/${taskId}`,
      task_contract_path: `docs/${taskId}.md`,
      owns: [`owned/${taskId}/**`],
      depends_on: overrides.dependsOn ?? [],
    },
    baseSha: 'base-sha',
    stageBranch: 'stage/wf/S02',
    worktree,
    model: {
      modelPolicy: 'coding_strong',
      resolvedModel: 'gpt-5.6-sol',
      reasoningEffort: 'high',
    },
    dependencies: overrides.dependencies ?? [],
  };
}

function immediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('native worker resolves the Git common dir before launch and sends the exact sandbox policy', async () => {
  const worktree = 'C:\\workers\\A';
  const gitCommonDir = 'C:\\repositories\\shared.git';
  const server = new FakeAppServer({ threadId: 'thread-preflight', turnId: 'turn-preflight' });
  const runCalls = [];
  let spawnCalls = 0;
  const promise = runNativeWorker({
    codexBin: 'codex-test',
    worktree,
    model: context('preflight', worktree).model,
    prompt: 'contract-preflight',
    run: async (command, args, options) => {
      runCalls.push({ command, args, options });
      return { command, args, exitCode: 0, signal: null, stdout: `  ${gitCommonDir}\n`, stderr: '', error: null };
    },
    spawn: () => {
      spawnCalls += 1;
      return server;
    },
  });
  await server.turnStarted;

  assert.deepEqual(runCalls, [{
    command: 'git',
    args: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    options: { cwd: worktree },
  }]);
  assert.equal(spawnCalls, 1);
  const threadStart = server.requests.find((request) => request.method === 'thread/start');
  assert.equal(threadStart.params.sandbox, 'workspace-write');
  assert.equal(threadStart.params.approvalPolicy, 'never');
  assert.equal(threadStart.params.cwd, worktree);
  assert.deepEqual(server.turnRequest.params.sandboxPolicy, {
    type: 'workspaceWrite',
    writableRoots: [worktree, gitCommonDir],
    networkAccess: false,
  });
  assert.equal(server.turnRequest.params.approvalPolicy, 'never');
  assert.equal(server.turnRequest.params.cwd, worktree);

  server.finish('completed', 'status: candidate_ready');
  const result = await promise;
  assert.equal(result.exitCode, 0);
});

test('invalid Git common-dir preflight needs a decision without launching App Server', async (t) => {
  const cases = [
    {
      name: 'command failure',
      result: { exitCode: 1, signal: null, stdout: '', stderr: 'git failed', error: null },
      message: /git rev-parse .* failed: git failed/,
    },
    {
      name: 'empty output',
      result: { exitCode: 0, signal: null, stdout: '  \n', stderr: '', error: null },
      message: /non-empty absolute path/,
    },
    {
      name: 'non-absolute output',
      result: { exitCode: 0, signal: null, stdout: '..\\.git\n', stderr: '', error: null },
      message: /non-empty absolute path/,
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      let spawnCalls = 0;
      const result = await runNativeWorker({
        codexBin: 'codex-test',
        worktree: 'C:\\workers\\preflight-failure',
        model: context('preflight-failure', 'C:\\workers\\preflight-failure').model,
        prompt: 'contract-preflight-failure',
        run: async (command, args) => ({ command, args, ...testCase.result }),
        spawn: () => {
          spawnCalls += 1;
          throw new Error('App Server must not launch');
        },
      });
      assert.equal(result.error.status, 'needs_decision');
      assert.match(result.error.message, testCase.message);
      assert.equal(spawnCalls, 0);
      assert.deepEqual(result.native, { threadId: null, turnId: null, status: null });
    });
  }
});

test('native worker sends exact task fields and ignores unrelated terminal events', async () => {
  const worktree = process.cwd();
  const server = new FakeAppServer({ threadId: 'thread-A', turnId: 'turn-A' });
  let execCalls = 0;
  const launcher = new CodexLauncher({
    codexBin: 'codex-test',
    run: async () => { execCalls += 1; throw new Error('codex exec must not run for a Worker'); },
    spawn: (command, args, options) => {
      assert.equal(command, 'codex-test');
      assert.deepEqual(args, ['app-server', '--listen', 'stdio://']);
      assert.equal(options.cwd, worktree);
      return server;
    },
  });
  const workerContext = context('A', worktree, {
    dependencies: [{ task_id: 'dependency-A', source_task_sha: 'dependency-sha' }],
  });
  const promise = launcher.launchWorker(workerContext, 'contract-A-only');
  let settled = false;
  promise.then(() => { settled = true; });
  await server.turnStarted;

  assert.deepEqual(server.requests.map((request) => request.method), [
    'initialize', 'initialized', 'thread/start', 'turn/start',
  ]);
  const threadStart = server.requests.find((request) => request.method === 'thread/start');
  assert.deepEqual(threadStart.params, {
    cwd: worktree,
    model: 'gpt-5.6-sol',
    approvalPolicy: 'never',
    sandbox: 'workspace-write',
    ephemeral: true,
    serviceName: 'codex_github_bridge',
  });
  assert.equal(server.turnRequest.params.threadId, 'thread-A');
  assert.equal(server.turnRequest.params.cwd, worktree);
  assert.equal(server.turnRequest.params.model, 'gpt-5.6-sol');
  assert.equal(server.turnRequest.params.effort, 'high');
  const prompt = server.turnRequest.params.input[0].text;
  assert.match(prompt, /contract-A-only/);
  assert.match(prompt, /owned\/A\/\*\*/);
  assert.match(prompt, /dependency-sha/);
  assert.match(prompt, /worker_spawned_subagents=false/);
  assert.doesNotMatch(prompt, /contract-B-only/);

  server.notify('item/completed', {
    threadId: 'thread-other', turnId: 'turn-other',
    item: { id: 'other', type: 'agentMessage', phase: 'final_answer', text: 'status: candidate_ready' },
  });
  server.notify('turn/completed', {
    threadId: 'thread-other', turn: { id: 'turn-other', status: 'completed', items: [], error: null },
  });
  server.notify('turn/completed', {
    threadId: 'thread-A', turn: { id: 'turn-stale', status: 'completed', items: [], error: null },
  });
  await immediate();
  assert.equal(settled, false);

  server.finish('completed', 'status: candidate_ready');
  const result = await promise;
  assert.equal(result.exitCode, 0);
  assert.equal(result.lastMessage, 'status: candidate_ready');
  assert.deepEqual(result.native, { threadId: 'thread-A', turnId: 'turn-A', status: 'completed' });
  assert.equal(server.killed, true);
  assert.equal(execCalls, 0);
});

test('two independent native Worker turns overlap with isolated requests', async () => {
  const worktreeA = join(process.cwd(), 'tools');
  const worktreeB = join(process.cwd(), 'docs');
  const serverA = new FakeAppServer({ threadId: 'thread-A', turnId: 'turn-A' });
  const serverB = new FakeAppServer({ threadId: 'thread-B', turnId: 'turn-B' });
  const launcher = new CodexLauncher({
    codexBin: 'codex-test',
    spawn: (_command, _args, options) => (options.cwd === worktreeA ? serverA : serverB),
  });
  const launchA = launcher.launchWorker(context('A', worktreeA), 'contract-A-only');
  const launchB = launcher.launchWorker(context('B', worktreeB), 'contract-B-only');
  let settledA = false;
  let settledB = false;
  launchA.then(() => { settledA = true; });
  launchB.then(() => { settledB = true; });
  await Promise.all([serverA.turnStarted, serverB.turnStarted]);

  assert.equal(settledA, false);
  assert.equal(settledB, false);
  assert.equal(serverA.turnRequest.params.cwd, worktreeA);
  assert.equal(serverB.turnRequest.params.cwd, worktreeB);
  assert.equal(serverA.turnRequest.params.threadId, 'thread-A');
  assert.equal(serverB.turnRequest.params.threadId, 'thread-B');
  assert.match(serverA.turnRequest.params.input[0].text, /contract-A-only/);
  assert.doesNotMatch(serverA.turnRequest.params.input[0].text, /contract-B-only/);
  assert.match(serverB.turnRequest.params.input[0].text, /contract-B-only/);
  assert.doesNotMatch(serverB.turnRequest.params.input[0].text, /contract-A-only/);

  serverA.finish('completed', 'status: candidate_ready');
  await immediate();
  assert.equal(settledA, true);
  assert.equal(settledB, false);
  serverB.finish('completed', 'status: candidate_ready');
  const [resultA, resultB] = await Promise.all([launchA, launchB]);
  assert.equal(resultA.native.threadId, 'thread-A');
  assert.equal(resultB.native.threadId, 'thread-B');
});

for (const status of ['failed', 'interrupted']) {
  test(`native ${status} terminal status produces a failed normalized Worker outcome`, async () => {
    const server = new FakeAppServer({ threadId: `thread-${status}`, turnId: `turn-${status}` });
    const launcher = new CodexLauncher({ codexBin: 'codex-test', spawn: () => server });
    const promise = launcher.launchWorker(context(status, process.cwd()), `contract-${status}`);
    await server.turnStarted;
    server.finish(status, `status: ${status === 'failed' ? 'blocked' : 'needs_decision'}`);
    const result = await promise;
    assert.equal(result.exitCode, 1);
    assert.equal(result.error, null);
    assert.equal(result.native.status, status);
  });
}

test('native request rejection and missing terminal observation need a decision without exec fallback', async (t) => {
  await t.test('unsupported turn fields', async () => {
    const server = new FakeAppServer({ threadId: 'thread-error', turnId: 'turn-error', failMethod: 'turn/start' });
    let execCalls = 0;
    const launcher = new CodexLauncher({
      codexBin: 'codex-test',
      run: async () => { execCalls += 1; },
      spawn: () => server,
    });
    const result = await launcher.launchWorker(context('error', process.cwd()), 'contract-error');
    assert.equal(result.error.status, 'needs_decision');
    assert.match(result.error.message, /turn\/start unsupported/);
    assert.deepEqual(result.args, ['app-server', '--listen', 'stdio://']);
    assert.equal(execCalls, 0);
  });

  await t.test('app-server closes before terminal event', async () => {
    const server = new FakeAppServer({ threadId: 'thread-close', turnId: 'turn-close' });
    const launcher = new CodexLauncher({ codexBin: 'codex-test', spawn: () => server });
    const promise = launcher.launchWorker(context('close', process.cwd()), 'contract-close');
    await server.turnStarted;
    server.closeBeforeTerminal();
    const result = await promise;
    assert.equal(result.error.status, 'needs_decision');
    assert.match(result.error.message, /before the matching terminal event/);
  });

  await t.test('requested model is rerouted', async () => {
    const server = new FakeAppServer({ threadId: 'thread-reroute', turnId: 'turn-reroute' });
    const launcher = new CodexLauncher({ codexBin: 'codex-test', spawn: () => server });
    const promise = launcher.launchWorker(context('reroute', process.cwd()), 'contract-reroute');
    await server.turnStarted;
    server.notify('model/rerouted', {
      threadId: 'thread-reroute',
      turnId: 'turn-reroute',
      fromModel: 'gpt-5.6-sol',
      toModel: 'gpt-5.6-luna',
      reason: 'unavailable',
    });
    const result = await promise;
    assert.equal(result.error.status, 'needs_decision');
    assert.match(result.error.message, /rerouted requested model/);
  });
});

test('worker prompt contains only its contract, dispatch, ownership and dependency facts', () => {
  const prompt = buildWorkerPrompt(context('A', 'C:\\workers\\A', {
    dependencies: [{ task_id: 'dependency-A', stage_commit_sha: 'stage-A' }],
  }), 'contract-A-only');
  assert.match(prompt, /DISPATCH ENVELOPE/);
  assert.match(prompt, /OWNED PATHS/);
  assert.match(prompt, /DEPENDENCY FACTS/);
  assert.match(prompt, /contract-A-only/);
  assert.match(prompt, /stage-A/);
  assert.match(prompt, /worker_spawned_subagents=false/);
});
