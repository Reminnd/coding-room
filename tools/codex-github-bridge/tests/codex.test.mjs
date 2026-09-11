import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';
import { runNativeWorker } from '../codex-app-server.mjs';
import {
  CodexLauncher,
  SUPERVISOR_ONLY_CODEX_EXECUTABLE,
  SUPERVISOR_ONLY_DISABLED_FEATURES,
  SUPERVISOR_ONLY_MODEL,
  SupervisorOnlyLauncher,
  buildWorkerPrompt,
} from '../codex.mjs';

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

test('Supervisor-only launcher fixes executable, model, sandbox, integrations, and sanitized environment for one call', async () => {
  const codexBin = SUPERVISOR_ONLY_CODEX_EXECUTABLE;
  const worktree = 'C:\\workers\\T01';
  const calls = [];
  const base = new CodexLauncher({
    codexBin,
    run: async (command, args, options) => {
      calls.push({ command, args, options });
      return { exitCode: 0, signal: null, error: null, stdout: '', stderr: '' };
    },
  });
  const launcher = new SupervisorOnlyLauncher({
    launcher: base,
    canonicalCodexExecutable: codexBin,
    worktree,
    environmentSource: {
      SystemRoot: 'C:\\Windows',
      PATH: 'C:\\Windows\\System32',
      USERPROFILE: 'C:\\Users\\operator',
      CODEX_HOME: 'C:\\secret-codex-home',
      CODEX_CLI_PATH: 'C:\\wrong.exe',
      OPENAI_API_KEY: 'secret',
      ARBITRARY_SECRET: 'secret',
      HTTP_PROXY: 'http://wrong-proxy.test',
    },
  });

  const result = await launcher.execute({
    worktree,
    model: SUPERVISOR_ONLY_MODEL,
    prompt: 'supervisor prompt',
    outputSchema: { type: 'object' },
    sandbox: 'read-only',
  });
  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 1);
  const [{ command, args, options }] = calls;
  assert.equal(command, codexBin);
  assert.equal(options.cwd, worktree);
  assert.equal(options.input, 'supervisor prompt');
  assert.deepEqual(options.env, {
    SystemRoot: 'C:\\Windows',
    PATH: 'C:\\Windows\\System32',
    USERPROFILE: 'C:\\Users\\operator',
    HTTP_PROXY: 'http://127.0.0.1:7890',
    HTTPS_PROXY: 'http://127.0.0.1:7890',
  });
  assert.equal(args.includes('--ignore-user-config'), true);
  assert.equal(args.includes('--strict-config'), true);
  assert.equal(args.includes('--ephemeral'), true);
  assert.equal(args.includes('read-only'), true);
  assert.equal(args.includes(SUPERVISOR_ONLY_MODEL.resolvedModel), true);
  assert.equal(args.includes(`model_reasoning_effort="${SUPERVISOR_ONLY_MODEL.reasoningEffort}"`), true);
  for (const feature of SUPERVISOR_ONLY_DISABLED_FEATURES) {
    assert.equal(args.some((value, index) => value === '--disable' && args[index + 1] === feature), true);
  }
  for (const override of [
    'mcp_servers.agent_room.enabled=false',
    'mcp_servers.node_repl.enabled=false',
    'mcp_servers.cua_repl.enabled=false',
    'notify=[]',
  ]) {
    assert.equal(args.some((value, index) => value === '--config' && args[index + 1] === override), true);
  }
});

test('ordinary CodexLauncher execute keeps its existing environment and integration defaults', async () => {
  const calls = [];
  const launcher = new CodexLauncher({
    codexBin: 'codex-test',
    run: async (command, args, options) => {
      calls.push({ command, args, options });
      return { exitCode: 0, signal: null, error: null, stdout: '', stderr: '' };
    },
  });
  await launcher.execute({
    worktree: 'C:\\workers\\ordinary',
    model: context('ordinary', 'C:\\workers\\ordinary').model,
    prompt: 'ordinary prompt',
  });
  assert.equal(calls.length, 1);
  assert.equal(Object.hasOwn(calls[0].options, 'env'), false);
  assert.equal(calls[0].args.includes('--ignore-user-config'), false);
  assert.equal(calls[0].args.includes('--disable'), false);
  assert.equal(calls[0].args.includes('workspace-write'), true);
});

test('native worker uses only the exact worktree as its writable root', async () => {
  const worktree = 'C:\\workers\\A';
  const server = new FakeAppServer({ threadId: 'thread-preflight', turnId: 'turn-preflight' });
  let spawnCalls = 0;
  const promise = runNativeWorker({
    codexBin: 'codex-test',
    worktree,
    model: context('preflight', worktree).model,
    prompt: 'contract-preflight',
    spawn: () => {
      spawnCalls += 1;
      return server;
    },
  });
  await server.turnStarted;

  assert.equal(spawnCalls, 1);
  const threadStart = server.requests.find((request) => request.method === 'thread/start');
  assert.equal(threadStart.params.sandbox, 'workspace-write');
  assert.equal(threadStart.params.approvalPolicy, 'never');
  assert.equal(threadStart.params.cwd, worktree);
  assert.deepEqual(server.turnRequest.params.sandboxPolicy, {
    type: 'workspaceWrite',
    writableRoots: [worktree],
    networkAccess: false,
  });
  assert.equal(server.turnRequest.params.approvalPolicy, 'never');
  assert.equal(server.turnRequest.params.cwd, worktree);

  server.finish('completed', 'status: implementation_ready');
  const result = await promise;
  assert.equal(result.exitCode, 0);
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
  assert.match(prompt, /must not spawn subagents unless the complete exact Accepted Task Contract explicitly authorizes Root-only native multi-agent delegation/);
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
    assert.equal(result.error.details.failure_class, 'POST_MUTATION_UNCERTAIN');
    assert.equal(result.error.details.boundary, 'worker_launch');
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
    assert.equal(result.error.details.failure_class, 'POST_MUTATION_UNCERTAIN');
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
    assert.equal(result.error.details.failure_class, 'POST_MUTATION_UNCERTAIN');
    assert.match(result.error.message, /rerouted requested model/);
  });
});

test('ordinary worker prompt defaults to forbidding subagent delegation', () => {
  const prompt = buildWorkerPrompt(context('A', 'C:\\workers\\A', {
    dependencies: [{ task_id: 'dependency-A', stage_commit_sha: 'stage-A' }],
  }), 'contract-A-only');
  assert.match(prompt, /DISPATCH ENVELOPE/);
  assert.match(prompt, /OWNED PATHS/);
  assert.match(prompt, /DEPENDENCY FACTS/);
  assert.match(prompt, /contract-A-only/);
  assert.match(prompt, /stage-A/);
  assert.match(prompt, /must not spawn subagents unless the complete exact Accepted Task Contract explicitly authorizes Root-only native multi-agent delegation/);
  assert.match(prompt, /child-spawned writing descendants remain forbidden/);
  assert.doesNotMatch(prompt, /worker_spawned_subagents=false/);
  assert.match(prompt, /Do not run git add, git commit, git checkout, git branch, git reset, git rebase, or git push/);
  assert.match(prompt, /status implementation_ready/);
  assert.doesNotMatch(prompt, /create exactly one Conventional Commit/);
});

test('worker prompt preserves exact Root-only native multi-agent authorization', () => {
  const contract = `status: Accepted
confirmed_by_user: true
internal_multi_agent: true
worker_spawned_subagents: true
authorization: Root-only native multi-agent delegation`;
  const prompt = buildWorkerPrompt(context('root-authorized', 'C:\\workers\\root-authorized', {
    dependencies: [{ task_id: 'dependency-root', stage_commit_sha: 'stage-root' }],
  }), contract);

  assert.match(prompt, new RegExp(contract));
  assert.match(prompt, /task_id=root-authorized/);
  assert.match(prompt, /owned\/root-authorized\/\*\*/);
  assert.match(prompt, /stage-root/);
  assert.match(prompt, /unless the complete exact Accepted Task Contract explicitly authorizes Root-only native multi-agent delegation/);
  assert.match(prompt, /child-spawned writing descendants remain forbidden/);
  assert.doesNotMatch(prompt, /worker_spawned_subagents=false/);
  assert.doesNotMatch(prompt, /and do not spawn subagents\./);
});
