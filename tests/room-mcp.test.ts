import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { RoomService } from '../src/room/room-service.ts';
import { createRoomMcpApp } from '../src/mcp/http.ts';
import {
  makeCodingResult,
  makeFinding,
  makeFixTask,
  makeQuestion,
  makeReview,
  makeRun,
  makeTask,
  makeTerminalEvidence,
} from './fixtures.ts';

// actor-scoped Room MCP 的端到端测试：临时 git repository 提供 clean-baseline gate 的
// fixture，in-memory RoomService 挂在 createRoomMcpApp 上 listen 临时端口，再用 in-process
// SDK Client + StreamableHTTPClientTransport 走真实 loopback HTTP 连接验证 tool surface、
// Git gate、write tool 行为与 ProtocolError 稳定映射。
function makeFixture(): string {
  return mkdtempSync(join(tmpdir(), 'agent-room-mcp-'));
}

// fixture 内 git 写操作只允许出现在测试代码；product MCP 层不执行任何 mutation command。
function git(fixture: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: fixture,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });
}

function initRepo(fixture: string): void {
  git(fixture, 'init', '-q', '-b', 'main');
  git(fixture, 'config', '--local', 'commit.gpgsign', 'false');
  git(fixture, 'config', '--local', 'core.autocrlf', 'false');
  git(fixture, 'commit', '--allow-empty', '-q', '-m', 'base');
}

async function startApp(
  service: RoomService,
  projectPath: string,
  onRequestCleanedUp?: () => void,
  observeRequestResource?: (resource: {
    server: { close: () => Promise<void> };
    transport: { close: () => Promise<void> };
  }) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  const app = createRoomMcpApp({ service, projectPath, onRequestCleanedUp, observeRequestResource });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port bound');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

// 轮询等待条件成立；用于观察 request-owned cleanup 的异步 close 行为。
async function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 5));
  }
}

// 观察实际 close boundary：包装 request-owned server/transport 的 .close() 计数实际调用。
// server.close() 经 Protocol.close() 传递关闭其持有的 transport，因此 transport 的 close
// 计数也能捕获这次传递；若 closeOnce 再直接 transport.close()，transport 计数会重复。
function closeSpy(): {
  transportCloses: number[];
  serverCloses: number[];
  observe: (resource: {
    server: { close: () => Promise<void> };
    transport: { close: () => Promise<void> };
  }) => void;
} {
  const transportCloses: number[] = [];
  const serverCloses: number[] = [];
  const observe = (resource: {
    server: { close: () => Promise<void> };
    transport: { close: () => Promise<void> };
  }) => {
    const origTransportClose = resource.transport.close.bind(resource.transport);
    const origServerClose = resource.server.close.bind(resource.server);
    resource.transport.close = async () => {
      transportCloses.push(1);
      await origTransportClose();
    };
    resource.server.close = async () => {
      serverCloses.push(1);
      await origServerClose();
    };
  };
  return { transportCloses, serverCloses, observe };
}

// 捕获 room_get_state 的完整 public snapshot 供失败前后 deepEqual：Room record（含
// updated_at）、current entity 引用、waiting actor、cursor 与全量 Event list 都来自 MCP
// route 的只读 read-model，不直接读 RoomService/repository。
async function snapshot(client: Client, roomId: string): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name: 'room_get_state', arguments: { room_id: roomId } });
  assert.equal(result.isError, undefined);
  const state = result.structuredContent;
  assert.ok(typeof state === 'object' && state !== null);
  return state as Record<string, unknown>;
}

async function connect(url: string, route: string): Promise<Client> {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url + route));
  await client.connect(transport);
  return client;
}

async function toolNames(client: Client): Promise<string[]> {
  const { tools } = await client.listTools();
  return tools.map((t) => t.name).sort();
}

// 把 tool 的 error content text 解析为稳定 {code,message}。
function errorPayload(result: unknown): { code: string; message: string } {
  const content = (result as { content: unknown[] }).content;
  const first = content[0] as { text: string };
  return JSON.parse(first.text) as { code: string; message: string };
}

// callTool 的返回类型是 union（成员 2 带 [x: string]: unknown 索引签名），直接访问
// result.content 得到 unknown 无法索引。这里做类型安全收窄提取 content[0].text，
// 不使用 any / ts-ignore / 关闭 strict check。
function resultText(result: unknown): string {
  if (typeof result !== 'object' || result === null) return '';
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content) || content.length === 0) return '';
  const first = content[0];
  if (typeof first !== 'object' || first === null) return '';
  const text = (first as { text?: unknown }).text;
  return typeof text === 'string' ? text : '';
}

test('codex route exposes exactly the nine Codex tools; claude route exposes only room_ask_question', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    assert.deepEqual(await toolNames(codex), [
      'room_accept_review',
      'room_answer_question',
      'room_begin_architecture_review',
      'room_create',
      'room_get_state',
      'room_request_user_confirmation',
      'room_retry_run',
      'room_submit_review',
      'room_submit_task',
    ]);
    await codex.close();

    const claude = await connect(url, '/mcp/claude');
    assert.deepEqual(await toolNames(claude), ['room_ask_question']);
    await claude.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('each route rejects tools not registered on it', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const codexResult = await codex.callTool({
      name: 'room_ask_question',
      arguments: makeQuestion() as unknown as Record<string, unknown>,
    });
    assert.equal(codexResult.isError, true);
    assert.match(resultText(codexResult), /not found/);
    await codex.close();

    const claude = await connect(url, '/mcp/claude');
    await claude.listTools();
    const claudeResult = await claude.callTool({
      name: 'room_get_state',
      arguments: { room_id: 'room-1' },
    });
    assert.equal(claudeResult.isError, true);
    assert.match(resultText(claudeResult), /not found/);
    await claude.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('GET and DELETE on both routes return 405 with a JSON-RPC error body', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  const { url, close } = await startApp(service, fixture);
  try {
    for (const method of ['GET', 'DELETE']) {
      for (const route of ['/mcp/codex', '/mcp/claude']) {
        const res = await fetch(url + route, { method });
        assert.equal(res.status, 405);
        const body = (await res.json()) as { error: { code: number } };
        assert.equal(body.error.code, -32000);
      }
    }
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_get_state returns the shared snapshot as structuredContent', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun());
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const result = await codex.callTool({ name: 'room_get_state', arguments: { room_id: 'room-1' } });
    assert.equal(result.isError, undefined);
    const state = result.structuredContent as {
      cursor: number;
      waiting_actor: string | null;
      current_task: { task_id: string } | null;
      current_run: { run_id: string } | null;
    };
    assert.equal(state.cursor, 5);
    assert.equal(state.waiting_actor, 'claude');
    assert.equal(state.current_task?.task_id, 'task-1');
    assert.equal(state.current_run?.run_id, 'run-1');
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_submit_task first implementation on a clean worktree returns the baseline head', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const result = await codex.callTool({ name: 'room_submit_task', arguments: makeTask() as unknown as Record<string, unknown> });
    assert.equal(result.isError, undefined);
    const out = result.structuredContent as {
      created: boolean;
      observed_baseline_head: string | null;
      room: { state: string };
    };
    assert.equal(out.created, true);
    assert.equal(out.room.state, 'PLAN_READY');
    assert.match(out.observed_baseline_head ?? '', /^[0-9a-f]{40}$/);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_submit_task first implementation on a dirty worktree fails with worktree_not_clean and persists nothing', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  writeFileSync(join(fixture, 'a.txt'), 'dirty');
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    const result = await codex.callTool({ name: 'room_submit_task', arguments: makeTask() as unknown as Record<string, unknown> });
    assert.equal(result.isError, true);
    assert.equal(errorPayload(result).code, 'worktree_not_clean');
    assert.equal(service.getTask('task-1'), null);
    assert.equal(service.getRoom('room-1')!.state, 'WAITING_FOR_USER_CONFIRMATION');
    // 失败前后 public snapshot（Room/current entity/Event list/cursor）完全不变。
    assert.deepEqual(await snapshot(codex, 'room-1'), before);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_submit_task same-content retry is idempotent and different-content conflicts', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const first = await codex.callTool({ name: 'room_submit_task', arguments: makeTask() as unknown as Record<string, unknown> });
    assert.equal((first.structuredContent as { created: boolean }).created, true);

    writeFileSync(join(fixture, 'dirty.txt'), 'x'); // retry 不再要求 clean baseline
    const retry = await codex.callTool({ name: 'room_submit_task', arguments: makeTask() as unknown as Record<string, unknown> });
    assert.equal(retry.isError, undefined);
    const retryOut = retry.structuredContent as { created: boolean; observed_baseline_head: string | null };
    assert.equal(retryOut.created, false);
    assert.equal(retryOut.observed_baseline_head, null);

    const conflict = await codex.callTool({ name: 'room_submit_task', arguments: makeTask({ goal: 'changed' }) as unknown as Record<string, unknown> });
    assert.equal(conflict.isError, true);
    assert.equal(errorPayload(conflict).code, 'id_conflict');
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_submit_task fix task skips the clean-worktree gate and returns null baseline head', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun());
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence());
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }));
  writeFileSync(join(fixture, 'dirty.txt'), 'x'); // fix 提交不应触发 clean gate
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const fixTask = makeFixTask({
      task_id: 'task-2',
      room_id: 'room-1',
      parent_task_id: 'task-1',
      based_on_review_id: 'review-1',
    });
    const result = await codex.callTool({ name: 'room_submit_task', arguments: fixTask as unknown as Record<string, unknown> });
    assert.equal(result.isError, undefined);
    const out = result.structuredContent as {
      created: boolean;
      observed_baseline_head: string | null;
      room: { state: string };
    };
    assert.equal(out.created, true);
    assert.equal(out.room.state, 'FIX_PLAN_READY');
    assert.equal(out.observed_baseline_head, null);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_ask_question on the claude route asks and moves the Room to NEEDS_DECISION', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun());
  const { url, close } = await startApp(service, fixture);
  try {
    const claude = await connect(url, '/mcp/claude');
    await claude.listTools();
    const result = await claude.callTool({ name: 'room_ask_question', arguments: makeQuestion() as unknown as Record<string, unknown> });
    assert.equal(result.isError, undefined);
    const out = result.structuredContent as {
      created: boolean;
      question: { question_id: string };
      room: { state: string };
    };
    assert.equal(out.created, true);
    assert.equal(out.question.question_id, 'question-1');
    assert.equal(out.room.state, 'NEEDS_DECISION');
    await claude.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('codex write tools (answer_question, submit_review, accept_review) round-trip through the adapter', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun());
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();

    service.askQuestion(makeQuestion());
    service.finalizeNeedsDecision(
      'run-1',
      makeCodingResult({ status: 'needs_decision' }),
      null,
      makeTerminalEvidence({ claude_session_id: 'sess-1' }),
    );
    const answered = await codex.callTool({
      name: 'room_answer_question',
      arguments: { question_id: 'question-1', answer: 'pick a', answer_changes_contract: false },
    });
    assert.equal(answered.isError, undefined);
    assert.equal((answered.structuredContent as { question: { status: string } }).question.status, 'answered');

    service.resumeRun(makeRun({ run_id: 'run-2' }));
    service.completeRun('run-2', makeCodingResult(), makeTerminalEvidence());

    const reviewed = await codex.callTool({
      name: 'room_submit_review',
      arguments: makeReview({ run_id: 'run-2' }) as unknown as Record<string, unknown>,
    });
    assert.equal(reviewed.isError, undefined);
    assert.equal((reviewed.structuredContent as { room: { state: string } }).room.state, 'REVIEW_DISCUSSION');

    const accepted = await codex.callTool({
      name: 'room_accept_review',
      arguments: { review_id: 'review-1', confirmed_by_user: true },
    });
    assert.equal(accepted.isError, undefined);
    assert.equal((accepted.structuredContent as { room: { state: string } }).room.state, 'ACCEPTED');
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('a ProtocolError from a write tool surfaces as a stable {code,message} tool error', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1'); // DISCUSSION：submitTask 非法
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const result = await codex.callTool({ name: 'room_submit_task', arguments: makeTask() as unknown as Record<string, unknown> });
    assert.equal(result.isError, true);
    const err = errorPayload(result);
    assert.equal(err.code, 'invalid_transition');
    assert.ok(err.message.length > 0);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('raw POST responses are application/json (initialize/tools-list/tools-call), not SSE', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  const { url, close } = await startApp(service, fixture);
  try {
    const post = (route: string, method: string, params: unknown) =>
      fetch(url + route, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });

    const init = await post('/mcp/codex', 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 't', version: '1' },
    });
    assert.equal(init.status, 200);
    assert.match(init.headers.get('content-type') ?? '', /^application\/json/);
    assert.doesNotMatch(init.headers.get('content-type') ?? '', /text\/event-stream/);
    await init.text();

    const list = await post('/mcp/codex', 'tools/list', {});
    assert.match(list.headers.get('content-type') ?? '', /^application\/json/);
    assert.doesNotMatch(list.headers.get('content-type') ?? '', /text\/event-stream/);
    await list.text();

    const call = await post('/mcp/codex', 'tools/call', {
      name: 'room_get_state',
      arguments: { room_id: 'room-1' },
    });
    assert.match(call.headers.get('content-type') ?? '', /^application\/json/);
    assert.doesNotMatch(call.headers.get('content-type') ?? '', /text\/event-stream/);
    const body = (await call.json()) as { result: { content: unknown[] } };
    assert.ok(Array.isArray(body.result.content));
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('each request closes its server and transport exactly once: success, ProtocolError, and invalid input', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1'); // DISCUSSION：submitTask 非法 → ProtocolError
  const spy = closeSpy();
  const { url, close } = await startApp(service, fixture, undefined, spy.observe);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    // connect(initialize) 与 listTools 各自产生 request-owned resource；等其 settle 后以相对
    // 计数为基线，避免依赖 SDK client 内部的具体请求次数。
    await waitFor(
      () => spy.serverCloses.length >= 2 && spy.transportCloses.length === spy.serverCloses.length,
    );
    const base = spy.serverCloses.length;

    const success = await codex.callTool({ name: 'room_get_state', arguments: { room_id: 'room-1' } });
    assert.equal(success.isError, undefined);
    await waitFor(
      () => spy.serverCloses.length === base + 1 && spy.transportCloses.length === base + 1,
    );

    const transitionErr = await codex.callTool({
      name: 'room_submit_task',
      arguments: makeTask() as unknown as Record<string, unknown>,
    });
    assert.equal(transitionErr.isError, true);
    assert.equal(errorPayload(transitionErr).code, 'invalid_transition');
    await waitFor(
      () => spy.serverCloses.length === base + 2 && spy.transportCloses.length === base + 2,
    );

    const invalidErr = await codex.callTool({
      name: 'room_submit_task',
      arguments: { room_id: 'room-1' },
    });
    assert.equal(invalidErr.isError, true);
    assert.match(resultText(invalidErr), /Invalid arguments/);
    await waitFor(
      () => spy.serverCloses.length === base + 3 && spy.transportCloses.length === base + 3,
    );

    // 每个 request 的 transport close 次数始终等于 server close 次数：server.close() 经
    // Protocol 传递关闭 transport 一次，closeOnce 未再独立 transport.close() 产生 duplicate。
    await new Promise((r) => setTimeout(r, 150)); // settle：无 late duplicate close
    assert.equal(spy.serverCloses.length, base + 3);
    assert.equal(spy.transportCloses.length, base + 3);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('a non-ProtocolError internal failure surfaces the raw error and closes the resource once', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const db = new DatabaseSync(':memory:');
  const service = new RoomService(db);
  service.createRoom('room-1');
  db.close(); // 后续 room_get_state 的 SQLite prepare 抛 plain Error（非 ProtocolError）
  const spy = closeSpy();
  const { url, close } = await startApp(service, fixture, undefined, spy.observe);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    await waitFor(
      () => spy.serverCloses.length >= 2 && spy.transportCloses.length === spy.serverCloses.length,
    );
    const base = spy.serverCloses.length;

    const result = await codex.callTool({ name: 'room_get_state', arguments: { room_id: 'room-1' } });
    assert.equal(result.isError, true);
    const text = resultText(result);
    assert.ok(text.length > 0);
    // 非 ProtocolError 走 SDK internal tool-error path：content text 是原始错误消息，不是
    // runTool 映射的 {code,message} JSON，因此不可被 JSON.parse 为 code/message payload。
    assert.throws(() => JSON.parse(text));
    await waitFor(
      () => spy.serverCloses.length === base + 1 && spy.transportCloses.length === base + 1,
    );
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(spy.serverCloses.length, base + 1);
    assert.equal(spy.transportCloses.length, base + 1);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('client abort after request resource creation closes the server and transport exactly once', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  const spy = closeSpy();
  let signalCreated!: () => void;
  const createdSignal = new Promise<void>((resolve) => {
    signalCreated = resolve;
  });
  const { url, close } = await startApp(service, fixture, undefined, (resource) => {
    spy.observe(resource);
    // observeRequestResource 在 server/transport 创建后、connect 前同步触发：以它为
    // 「resource 已创建」信号，等其成立后由 client 主动 destroy 连接，保证是真实 abort。
    signalCreated();
  });
  try {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'room_get_state', arguments: { room_id: 'room-1' } },
    });
    await new Promise<void>((resolve) => {
      const req = http.request(
        url + '/mcp/codex',
        { method: 'POST', headers: { 'content-type': 'application/json' } },
        (res) => res.destroy(), // 若 response 先到也主动销毁，不消费 body
      );
      req.on('error', () => resolve()); // abort 触发的 ECONNRESET/socket hang up 属预期
      req.end(body);
      void (async () => {
        await createdSignal;
        req.destroy();
        resolve();
      })();
    });
    // abort 后 res.on('close') → closeOnce 关闭 server/transport 各一次，无 late duplicate。
    await waitFor(() => spy.serverCloses.length === 1 && spy.transportCloses.length === 1);
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(spy.serverCloses.length, 1);
    assert.equal(spy.transportCloses.length, 1);
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_submit_task on a non-git project returns git_repository_missing and persists nothing', async () => {
  const fixture = makeFixture(); // 不 initRepo：非 git 目录
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    const result = await codex.callTool({
      name: 'room_submit_task',
      arguments: makeTask() as unknown as Record<string, unknown>,
    });
    assert.equal(result.isError, true);
    assert.equal(errorPayload(result).code, 'git_repository_missing');
    assert.equal(service.getTask('task-1'), null);
    assert.equal(service.getRoom('room-1')!.state, 'WAITING_FOR_USER_CONFIRMATION');
    assert.deepEqual(await snapshot(codex, 'room-1'), before);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_submit_task on a repo with unborn HEAD returns git_head_missing and persists nothing', async () => {
  const fixture = makeFixture();
  git(fixture, 'init', '-q', '-b', 'main'); // 无 commit → unborn HEAD
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    const result = await codex.callTool({
      name: 'room_submit_task',
      arguments: makeTask() as unknown as Record<string, unknown>,
    });
    assert.equal(result.isError, true);
    assert.equal(errorPayload(result).code, 'git_head_missing');
    assert.equal(service.getTask('task-1'), null);
    assert.equal(service.getRoom('room-1')!.state, 'WAITING_FOR_USER_CONFIRMATION');
    assert.deepEqual(await snapshot(codex, 'room-1'), before);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_submit_task with invalid input is rejected by the SDK and persists nothing', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    const result = await codex.callTool({ name: 'room_submit_task', arguments: { room_id: 'room-1' } });
    assert.equal(result.isError, true);
    assert.match(resultText(result), /Invalid arguments/);
    assert.equal(service.getTask('task-1'), null);
    assert.equal(service.getRoom('room-1')!.state, 'WAITING_FOR_USER_CONFIRMATION');
    assert.deepEqual(await snapshot(codex, 'room-1'), before);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_submit_review rejects a non-succeeded run, rolls back the insert and stays CODING', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun()); // CODING，run 仍 running
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    const result = await codex.callTool({
      name: 'room_submit_review',
      arguments: makeReview() as unknown as Record<string, unknown>,
    });
    assert.equal(result.isError, true);
    assert.equal(errorPayload(result).code, 'validation_failed');
    assert.equal(service.getReview('review-1'), null);
    assert.equal(service.getRoom('room-1')!.state, 'CODING');
    assert.deepEqual(await snapshot(codex, 'room-1'), before);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_answer_question rejects an already-answered question', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun());
  service.askQuestion(makeQuestion());
  service.finalizeNeedsDecision(
    'run-1',
    makeCodingResult({ status: 'needs_decision' }),
    null,
    makeTerminalEvidence({ claude_session_id: 'sess-1' }),
  );
  service.answerQuestion('question-1', 'pick a', false);
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    const result = await codex.callTool({
      name: 'room_answer_question',
      arguments: { question_id: 'question-1', answer: 'again', answer_changes_contract: false },
    });
    assert.equal(result.isError, true);
    assert.equal(errorPayload(result).code, 'validation_failed');
    assert.equal(service.getRoom('room-1')!.state, 'NEEDS_DECISION');
    assert.deepEqual(await snapshot(codex, 'room-1'), before);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_answer_question rejects before pause finalization with no partial write', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun());
  service.askQuestion(makeQuestion()); // run 仍 needs_decision，completed_at null
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    const result = await codex.callTool({
      name: 'room_answer_question',
      arguments: { question_id: 'question-1', answer: 'pick a', answer_changes_contract: false },
    });
    assert.equal(result.isError, true);
    assert.equal(errorPayload(result).code, 'validation_failed');
    assert.equal(service.getQuestion('question-1')!.status, 'open');
    assert.equal(service.getRoom('room-1')!.state, 'NEEDS_DECISION');
    assert.deepEqual(await snapshot(codex, 'room-1'), before);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_accept_review rejects a review that still has blocking findings', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun());
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence());
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding({ severity: 'blocker' })] }));
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    const result = await codex.callTool({
      name: 'room_accept_review',
      arguments: { review_id: 'review-1', confirmed_by_user: true },
    });
    assert.equal(result.isError, true);
    assert.equal(errorPayload(result).code, 'validation_failed');
    assert.equal(service.getRoom('room-1')!.state, 'REVIEW_DISCUSSION');
    assert.deepEqual(await snapshot(codex, 'room-1'), before);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_ask_question rejects a question for a non-running run and rolls back the insert', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun());
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence()); // run 已 succeeded，非 running
  const { url, close } = await startApp(service, fixture);
  try {
    const claude = await connect(url, '/mcp/claude');
    await claude.listTools();
    const codex = await connect(url, '/mcp/codex'); // 仅用于 room_get_state 读 public snapshot
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    const result = await claude.callTool({
      name: 'room_ask_question',
      arguments: makeQuestion() as unknown as Record<string, unknown>,
    });
    assert.equal(result.isError, true);
    assert.equal(errorPayload(result).code, 'validation_failed');
    assert.equal(service.getQuestion('question-1'), null);
    assert.equal(service.getRoom('room-1')!.state, 'REVIEW_REQUIRED');
    assert.deepEqual(await snapshot(codex, 'room-1'), before);
    await claude.close();
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_submit_review same-content retry is idempotent and different-content conflicts', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun());
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence());
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const first = await codex.callTool({
      name: 'room_submit_review',
      arguments: makeReview() as unknown as Record<string, unknown>,
    });
    assert.equal(first.isError, undefined);
    assert.equal((first.structuredContent as { created: boolean }).created, true);
    const afterFirst = await snapshot(codex, 'room-1');

    const retry = await codex.callTool({
      name: 'room_submit_review',
      arguments: makeReview() as unknown as Record<string, unknown>,
    });
    assert.equal(retry.isError, undefined);
    const retryOut = retry.structuredContent as { created: boolean; review: { review_id: string } };
    assert.equal(retryOut.created, false);
    assert.equal(retryOut.review.review_id, 'review-1');
    assert.deepEqual(await snapshot(codex, 'room-1'), afterFirst);

    const conflict = await codex.callTool({
      name: 'room_submit_review',
      arguments: makeReview({ decision: 'changes_requested' }) as unknown as Record<string, unknown>,
    });
    assert.equal(conflict.isError, true);
    assert.equal(errorPayload(conflict).code, 'id_conflict');
    assert.deepEqual(await snapshot(codex, 'room-1'), afterFirst);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_submit_review rejects a new review_id referencing a stale succeeded run and changes no durable state', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask()); // task-1 → PLAN_READY
  service.startRun(makeRun()); // run-1 → CODING
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence()); // run-1 succeeded → REVIEW_REQUIRED
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] })); // review-1 → REVIEW_DISCUSSION
  // fix 路径提交 task-2、完成 run-2，使 Room 回到 REVIEW_REQUIRED 且 run-2 是 current completed Run。
  service.submitTask(makeFixTask({ task_id: 'task-2' })); // task-2 → FIX_PLAN_READY
  service.resumeRun(makeRun({ run_id: 'run-2', task_id: 'task-2' })); // run-2 → CODING
  service.completeRun('run-2', makeCodingResult({ task_id: 'task-2' }), makeTerminalEvidence()); // run-2 succeeded → REVIEW_REQUIRED

  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');

    // 新 review_id 引用旧 succeeded run-1：run-1 不是 current completed Run（run-2 才是），
    // 应命中 wrong-current guard 并整体回滚，不持久化 stale Review、不改 Room/Event/cursor。
    const result = await codex.callTool({
      name: 'room_submit_review',
      arguments: makeReview({
        review_id: 'review-stale',
        task_id: 'task-1',
        run_id: 'run-1',
      }) as unknown as Record<string, unknown>,
    });
    assert.equal(result.isError, true);
    assert.equal(errorPayload(result).code, 'validation_failed');

    assert.equal(service.getReview('review-stale'), null);
    assert.equal(service.getRoom('room-1')!.state, 'REVIEW_REQUIRED');
    const after = await snapshot(codex, 'room-1');
    assert.deepEqual(after, before);
    assert.equal((after.current_task as { task_id: string }).task_id, 'task-2');
    assert.equal((after.current_run as { run_id: string }).run_id, 'run-2');
    assert.equal((after.current_review as { review_id: string }).review_id, 'review-1');
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_ask_question same-content retry is idempotent and different-content conflicts', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun()); // CODING，run running
  const { url, close } = await startApp(service, fixture);
  try {
    const claude = await connect(url, '/mcp/claude');
    await claude.listTools();
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();

    const first = await claude.callTool({
      name: 'room_ask_question',
      arguments: makeQuestion() as unknown as Record<string, unknown>,
    });
    assert.equal(first.isError, undefined);
    assert.equal((first.structuredContent as { created: boolean }).created, true);
    const afterFirst = await snapshot(codex, 'room-1');

    const retry = await claude.callTool({
      name: 'room_ask_question',
      arguments: makeQuestion() as unknown as Record<string, unknown>,
    });
    assert.equal(retry.isError, undefined);
    assert.equal((retry.structuredContent as { created: boolean }).created, false);
    assert.deepEqual(await snapshot(codex, 'room-1'), afterFirst);

    const conflict = await claude.callTool({
      name: 'room_ask_question',
      arguments: makeQuestion({ question: 'different' }) as unknown as Record<string, unknown>,
    });
    assert.equal(conflict.isError, true);
    assert.equal(errorPayload(conflict).code, 'id_conflict');
    assert.deepEqual(await snapshot(codex, 'room-1'), afterFirst);
    await claude.close();
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_accept_review rejects a review that is no longer current', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun());
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence());
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }));
  // fix 路径提交第二个 task/run/review，使 review-1 不再是 current review。
  service.submitTask(makeFixTask({ task_id: 'task-2' }));
  service.resumeRun(makeRun({ run_id: 'run-2', task_id: 'task-2' }));
  service.completeRun('run-2', makeCodingResult({ task_id: 'task-2' }), makeTerminalEvidence());
  service.submitReview(makeReview({
    review_id: 'review-2',
    task_id: 'task-2',
    run_id: 'run-2',
    decision: 'changes_requested',
    findings: [makeFinding()],
  }));
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    const result = await codex.callTool({
      name: 'room_accept_review',
      arguments: { review_id: 'review-1', confirmed_by_user: true },
    });
    assert.equal(result.isError, true);
    assert.equal(errorPayload(result).code, 'validation_failed');
    assert.equal(service.getRoom('room-1')!.state, 'REVIEW_DISCUSSION');
    assert.deepEqual(await snapshot(codex, 'room-1'), before);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('restart persistence: a fresh file-backed app reads the same Room state', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const dbPath = join(fixture, 'room.db');

  const db1 = new DatabaseSync(dbPath);
  const service1 = new RoomService(db1);
  service1.createRoom('room-1');
  service1.transitionToArchitectureReview('room-1');
  service1.transitionToWaitingForUserConfirmation('room-1');
  service1.submitTask(makeTask());
  service1.startRun(makeRun());
  db1.close();

  const db2 = new DatabaseSync(dbPath);
  const service2 = new RoomService(db2);
  const { url, close } = await startApp(service2, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const result = await codex.callTool({ name: 'room_get_state', arguments: { room_id: 'room-1' } });
    assert.equal(result.isError, undefined);
    const state = result.structuredContent as {
      cursor: number;
      waiting_actor: string | null;
      current_task: { task_id: string } | null;
      current_run: { run_id: string } | null;
      room: { state: string };
    };
    assert.equal(state.room.state, 'CODING');
    assert.equal(state.current_task?.task_id, 'task-1');
    assert.equal(state.current_run?.run_id, 'run-1');
    assert.equal(state.cursor, 5);
    assert.equal(state.waiting_actor, 'claude');
    await codex.close();
  } finally {
    await close();
    db2.close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_create round-trips created/false idempotency through the adapter', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const created = await codex.callTool({ name: 'room_create', arguments: { room_id: 'room-1' } });
    assert.equal(created.isError, undefined);
    const createdBody = created.structuredContent as { room: { room_id: string; state: string }; created: boolean };
    assert.equal(createdBody.room.room_id, 'room-1');
    assert.equal(createdBody.room.state, 'DISCUSSION');
    assert.equal(createdBody.created, true);

    const duplicate = await codex.callTool({ name: 'room_create', arguments: { room_id: 'room-1' } });
    assert.equal(duplicate.isError, undefined);
    const duplicateBody = duplicate.structuredContent as { room: { room_id: string }; created: boolean };
    assert.equal(duplicateBody.created, false, 'same-content retry must be idempotent');
    assert.deepEqual(duplicateBody.room, createdBody.room);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_begin_architecture_review and room_request_user_confirmation move the Room through planning', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1'); // DISCUSSION
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const arch = await codex.callTool({ name: 'room_begin_architecture_review', arguments: { room_id: 'room-1' } });
    assert.equal(arch.isError, undefined);
    assert.equal((arch.structuredContent as { room: { state: string } }).room.state, 'ARCHITECTURE_REVIEW');

    const confirm = await codex.callTool({ name: 'room_request_user_confirmation', arguments: { room_id: 'room-1' } });
    assert.equal(confirm.isError, undefined);
    assert.equal((confirm.structuredContent as { room: { state: string } }).room.state, 'WAITING_FOR_USER_CONFIRMATION');
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_retry_run returns a failed Run to PLAN_READY', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun());
  service.failRun('run-1', { code: 'claude_exit_failed', message: 'boom' }, makeTerminalEvidence()); // RUN_FAILED
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const result = await codex.callTool({ name: 'room_retry_run', arguments: { room_id: 'room-1' } });
    assert.equal(result.isError, undefined);
    const body = result.structuredContent as { room: { room_id: string; state: string } };
    assert.equal(body.room.room_id, 'room-1');
    assert.equal(body.room.state, 'PLAN_READY');
    // source Run 保持 terminal failed；current_run 仍是该 Run。
    const state = await snapshot(codex, 'room-1');
    assert.equal((state.current_run as { status: string } | null)?.status, 'failed');
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('the four coordination tools reject wrong-state transitions with a stable ProtocolError and unchanged full snapshot', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask()); // PLAN_READY：planning transitions 全部非法
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    for (const name of [
      'room_begin_architecture_review',
      'room_request_user_confirmation',
      'room_retry_run',
    ]) {
      const result = await codex.callTool({ name, arguments: { room_id: 'room-1' } });
      assert.equal(result.isError, true, `${name} must reject the wrong-state transition`);
      const err = errorPayload(result);
      assert.equal(err.code, 'invalid_transition');
      assert.ok(err.message.length > 0);
      assert.deepEqual(await snapshot(codex, 'room-1'), before, `${name} must not change durable state`);
    }
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('the four coordination tools reject missing or empty room_id with invalid-arguments and leave the full snapshot unchanged', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1');
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    for (const name of [
      'room_create',
      'room_begin_architecture_review',
      'room_request_user_confirmation',
      'room_retry_run',
    ]) {
      for (const args of [{}, { room_id: '' }]) {
        const result = await codex.callTool({ name, arguments: args });
        assert.equal(result.isError, true, `${name} must reject invalid input`);
        assert.match(resultText(result), /Invalid arguments/);
        assert.deepEqual(await snapshot(codex, 'room-1'), before, `${name} must not change durable state`);
      }
    }
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('a non-ProtocolError internal failure in each coordination tool surfaces the raw error and cleans up its request resource', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const db = new DatabaseSync(':memory:');
  const service = new RoomService(db);
  service.createRoom('room-1');
  db.close(); // 后续任何 write/prepare 抛 plain Error（非 ProtocolError）
  const spy = closeSpy();
  const { url, close } = await startApp(service, fixture, undefined, spy.observe);
  try {
    const codex = await connect(url, '/mcp/codex');
    await codex.listTools();
    await waitFor(
      () => spy.serverCloses.length >= 2 && spy.transportCloses.length === spy.serverCloses.length,
    );
    let base = spy.serverCloses.length;
    for (const name of [
      'room_create',
      'room_begin_architecture_review',
      'room_request_user_confirmation',
      'room_retry_run',
    ]) {
      const result = await codex.callTool({ name, arguments: { room_id: 'room-1' } });
      assert.equal(result.isError, true, `${name} must surface the internal failure`);
      const text = resultText(result);
      assert.ok(text.length > 0);
      // 非 ProtocolError 走 SDK internal tool-error path：content text 是原始错误消息，
      // 不是 runTool 映射的 {code,message} JSON。
      assert.throws(() => JSON.parse(text));
      await waitFor(
        () => spy.serverCloses.length === base + 1 && spy.transportCloses.length === base + 1,
      );
      base += 1;
    }
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(spy.serverCloses.length, base);
    assert.equal(spy.transportCloses.length, base);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});
