import { createInterface } from 'node:readline';
import { isAbsolute } from 'node:path';
import { needsDecision } from './errors.mjs';
import { runChecked, runProcess, spawnProcess } from './process.mjs';

const APP_SERVER_ARGS = ['app-server', '--listen', 'stdio://'];
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'interrupted']);

class AppServerConnection {
  constructor(child) {
    this.child = child;
    this.nextId = 0;
    this.pending = new Map();
    this.notifications = [];
    this.notificationWaiters = [];
    this.stderr = '';
    this.failure = null;
    this.closing = false;
    this.lines = createInterface({ input: child.stdout, crlfDelay: Infinity });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { this.stderr += chunk; });
    child.stdin.once('error', (error) => this.#fail(error));
    this.lines.on('line', (line) => this.#receive(line));
    child.once('error', (error) => this.#fail(error));
    child.once('close', (exitCode, signal) => {
      if (!this.closing) this.#fail(new Error(`app-server exited before the matching terminal event (exit=${exitCode}, signal=${signal ?? 'none'})`));
    });
  }

  #receive(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      this.#fail(new Error(`app-server emitted invalid JSON: ${error.message}`));
      return;
    }

    if (Object.hasOwn(message, 'id') && (Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error'))) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`app-server ${pending.method} failed: ${message.error.message ?? JSON.stringify(message.error)}`));
      else pending.resolve(message.result);
      return;
    }

    if (typeof message.method === 'string' && !Object.hasOwn(message, 'id')) {
      const waiter = this.notificationWaiters.shift();
      if (waiter) waiter.resolve(message);
      else this.notifications.push(message);
      return;
    }

    this.#fail(new Error('app-server emitted an unsupported protocol message'));
  }

  #fail(error) {
    if (this.closing || this.failure) return;
    this.failure = error;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    for (const waiter of this.notificationWaiters) waiter.reject(error);
    this.notificationWaiters.length = 0;
  }

  #send(message) {
    if (this.failure) throw this.failure;
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
      try {
        this.#send({ method, id, params });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  notify(method, params = {}) {
    this.#send({ method, params });
  }

  nextNotification() {
    if (this.notifications.length > 0) return Promise.resolve(this.notifications.shift());
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => this.notificationWaiters.push({ resolve, reject }));
  }

  close() {
    if (this.closing) return;
    this.closing = true;
    this.lines.close();
    if (!this.child.stdin.destroyed) this.child.stdin.end();
    if (typeof this.child.kill === 'function' && !this.child.killed) this.child.kill();
  }
}

function nativeResult({ codexBin, status, threadId, turnId, lastMessage, stderr, error = null }) {
  return {
    command: codexBin,
    args: [...APP_SERVER_ARGS],
    exitCode: status === 'completed' ? 0 : status ? 1 : null,
    signal: null,
    stdout: '',
    stderr,
    error,
    lastMessage,
    native: { threadId, turnId, status },
  };
}

export async function runNativeWorker({ codexBin, worktree, model, prompt, run = runProcess, spawn = spawnProcess }) {
  let connection;
  let threadId = null;
  let turnId = null;
  let lastMessage = '';
  try {
    const gitCommonDirResult = await runChecked(
      run,
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd: worktree },
    );
    const gitCommonDir = gitCommonDirResult.stdout.trim();
    if (!gitCommonDir || !isAbsolute(gitCommonDir)) {
      throw new Error('git common directory must be a non-empty absolute path');
    }

    const child = spawn(codexBin, APP_SERVER_ARGS, { cwd: worktree });
    connection = new AppServerConnection(child);

    await connection.request('initialize', {
      clientInfo: {
        name: 'codex_github_bridge',
        title: 'Codex GitHub Bridge',
        version: '1.0.0',
      },
    });
    connection.notify('initialized');

    const threadResult = await connection.request('thread/start', {
      cwd: worktree,
      model: model.resolvedModel,
      approvalPolicy: 'never',
      sandbox: 'workspace-write',
      ephemeral: true,
      serviceName: 'codex_github_bridge',
    });
    threadId = threadResult?.thread?.id;
    if (typeof threadId !== 'string' || threadId.length === 0 || threadResult.thread.ephemeral !== true) {
      throw new Error('app-server thread/start did not return a fresh ephemeral thread');
    }

    const turnResult = await connection.request('turn/start', {
      threadId,
      input: [{ type: 'text', text: prompt }],
      cwd: worktree,
      model: model.resolvedModel,
      effort: model.reasoningEffort,
      approvalPolicy: 'never',
      sandboxPolicy: {
        type: 'workspaceWrite',
        writableRoots: [worktree, gitCommonDir],
        networkAccess: false,
      },
    });
    turnId = turnResult?.turn?.id;
    if (typeof turnId !== 'string' || turnId.length === 0) {
      throw new Error('app-server turn/start did not return a turn id');
    }

    // app-server进程存活不是Worker成功；只接受本Task thread/turn的terminal event。
    while (true) {
      const event = await connection.nextNotification();
      if (event.method === 'item/completed'
        && event.params?.threadId === threadId
        && event.params?.turnId === turnId
        && event.params?.item?.type === 'agentMessage'
        && event.params.item.phase === 'final_answer') {
        lastMessage = event.params.item.text;
      }
      if (event.method === 'model/rerouted'
        && event.params?.threadId === threadId
        && event.params?.turnId === turnId) {
        throw new Error(`app-server rerouted requested model ${event.params.fromModel ?? model.resolvedModel} to ${event.params.toModel ?? '<unknown>'}`);
      }
      if (event.method !== 'turn/completed'
        || event.params?.threadId !== threadId
        || event.params?.turn?.id !== turnId) continue;

      const status = event.params.turn.status;
      if (!TERMINAL_STATUSES.has(status)) {
        throw new Error(`app-server turn/completed carried unsupported status: ${status}`);
      }
      const detail = status === 'completed'
        ? connection.stderr
        : event.params.turn.error?.message ?? `Native Codex turn ${status}`;
      return nativeResult({ codexBin, status, threadId, turnId, lastMessage, stderr: detail });
    }
  } catch (error) {
    const decision = error?.status === 'needs_decision'
      ? error
      : needsDecision(`Local Codex native app-server capability is unavailable: ${error.message}`);
    return nativeResult({
      codexBin,
      status: null,
      threadId,
      turnId,
      lastMessage,
      stderr: connection?.stderr ?? '',
      error: decision,
    });
  } finally {
    connection?.close();
  }
}
