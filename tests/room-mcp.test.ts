import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { RoomService } from '../src/room/room-service.ts';
import { createRoomMcpApp } from '../src/mcp/http.ts';
import {
  makeAttemptSettle,
  makeCodingResult,
  makeFinding,
  makeFixTask,
  makeParticipant,
  makeQuestion,
  makeReview,
  makeRoleAssignment,
  makeTask,
  type AttemptSettleInput,
} from './fixtures.ts';

// v0.4 actor-scoped Room MCP 的端到端测试：临时 git repository 提供 claim 冻结 baseline 的
// fixture，in-memory RoomService 挂在 createRoomMcpApp 上 listen 临时端口，再用 in-process
// SDK Client + StreamableHTTPClientTransport 走真实 loopback HTTP 连接验证 tool surface、
// participant route 的 authority 映射、write tool 行为与 ProtocolError 稳定映射。
// 单一路由 /mcp/participants/p~{encodeURIComponent(participant_id)} 把 participant identity
// 从 framed route 传入（`p~` transport framing，Fix inc9-fr4）；route 与测试侧 actor literal
// 必须与 bootstrap assignment 一致。
//
// v0.4 端口说明：Room 只拥有 planning 状态，Run/RunAttempt 是独立 execution authority。
// v0.3 的 startRun/completeRun/failRun/resumeRun/finalizeNeedsDecision service API 已移除，
// 测试改为 claimRunAttempt + settleRunAttempt（executor one-shot boundary）。v0.3 中
// room_submit_task 的 clean-worktree/Git gate 已整体移到 Executor claim 前（见
// claude-runner/execution-core 测试），MCP 层不再执行任何 Git 操作；worktree_not_clean /
// git_repository_missing / git_head_missing 三个 v0.3 submitTask 负例随行为迁移删除。

// v0.4 actor literal：与默认 bootstrap assignment 一致（测试侧独立 literal，不导入实现）。
const PLANNER = { participant_id: 'codex-app', actor_role: 'planner' as const };
const REVIEWER = { participant_id: 'codex-app', actor_role: 'reviewer' as const };
const WORKER = { participant_id: 'claude-code-cli', actor_role: 'worker' as const };
const EXECUTOR = { participant_id: 'local-runner', actor_role: 'executor' as const };
const ORCHESTRATOR = { participant_id: 'codex-app', actor_role: 'orchestrator' as const };

const CODEX_ROUTE = '/mcp/participants/p~codex-app';
const CLAUDE_ROUTE = '/mcp/participants/p~claude-code-cli';
const OPERATOR_ROUTE = '/mcp/participants/p~operator';

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

// executor 的 one-shot claim boundary（测试侧直接调用 service，代替 v0.3 startRun）：
// worktree/baseline 由 fixture repo 解析，claim 成功冻结后 Run 进入 running。
function claim(
  service: RoomService,
  fixture: string,
  overrides: { attempt_id?: string; run_id?: string; room_id?: string } = {},
): { attempt_id: string } {
  const attemptId = overrides.attempt_id ?? 'attempt-1';
  const runId = overrides.run_id ?? 'run-1';
  const roomId = overrides.room_id ?? 'room-1';
  const head = git(fixture, 'rev-parse', 'HEAD').trim();
  const out = service.claimRunAttempt(
    { attempt_id: attemptId, run_id: runId, room_id: roomId, worktree_path: fixture, baseline_head: head },
    EXECUTOR,
  );
  assert.equal(out.created, true);
  return { attempt_id: attemptId };
}

// executor 的 terminal settle boundary（代替 v0.3 completeRun/failRun/finalizeNeedsDecision）。
function settle(service: RoomService, input: AttemptSettleInput): void {
  service.settleRunAttempt(input, EXECUTOR);
}

// 完整 planning gate + 首次 Task 提交（返回创建的 Run lineage id）。
function submitFirstTask(service: RoomService): void {
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER);
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
// updated_at）、per-Run work item、planning waiting actor、cursor 与全量 Event list 都来自
// MCP route 的只读 read-model，不直接读 RoomService/repository。
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

test('a participant route exposes exactly the fifteen v0.4 tools', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    assert.deepEqual(await toolNames(codex), [
      'room_accept_review',
      'room_add_run_guidance',
      'room_answer_question',
      'room_ask_question',
      'room_begin_architecture_review',
      'room_cancel_run',
      'room_create',
      'room_create_role_assignment',
      'room_get_state',
      'room_register_participant',
      'room_request_user_confirmation',
      'room_retry_run',
      'room_set_participant_enabled',
      'room_submit_review',
      'room_submit_task',
    ]);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('an unknown tool name on a participant route is rejected as not found', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    const codexResult = await codex.callTool({
      name: 'room_bogus',
      arguments: makeQuestion() as unknown as Record<string, unknown>,
    });
    assert.equal(codexResult.isError, true);
    assert.match(resultText(codexResult), /not found/);
    await codex.close();

    const claude = await connect(url, CLAUDE_ROUTE);
    await claude.listTools();
    const claudeResult = await claude.callTool({
      name: 'room_get_state',
      arguments: { room_id: 'room-1' },
    });
    // claude-code-cli 是已注册 participant，但 room-1 不存在 → 非 member，读取被拒。
    assert.equal(claudeResult.isError, true);
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
      for (const route of [CODEX_ROUTE, CLAUDE_ROUTE]) {
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

test('room_get_state returns the shared v0.4 snapshot as structuredContent', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  submitFirstTask(service);
  claim(service, fixture);
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    const result = await codex.callTool({ name: 'room_get_state', arguments: { room_id: 'room-1' } });
    assert.equal(result.isError, undefined);
    const state = result.structuredContent as {
      cursor: number;
      planning_waiting_actor: string | null;
      run_work_items: {
        run_id: string;
        run_status: string;
        waiting_actor: string | null;
        current_task_id: string | null;
        current_attempt_id: string | null;
      }[];
    };
    assert.equal(state.cursor, 6);
    assert.equal(state.planning_waiting_actor, 'planner');
    assert.equal(state.run_work_items[0].run_id, 'run-1');
    assert.equal(state.run_work_items[0].run_status, 'running');
    assert.equal(state.run_work_items[0].waiting_actor, 'worker');
    assert.equal(state.run_work_items[0].current_task_id, 'task-1');
    assert.equal(state.run_work_items[0].current_attempt_id, 'attempt-1');
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_get_state shows the Implementation Task for an initial-ready Run before any claim', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  submitFirstTask(service); // ready，尚未 claim
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    // Review finding inc10-r3：ready work item 的 current task 从 latest persisted Task 推导，
    // claim 前 MCP 即显示 Implementation Task，attempt reference 为空。
    const state = await snapshot(codex, 'room-1');
    const items = state.run_work_items as {
      run_id: string;
      run_status: string;
      waiting_actor: string | null;
      current_task_id: string | null;
      current_attempt_id: string | null;
      current_question_id: string | null;
      current_review_id: string | null;
    }[];
    assert.equal(items.length, 1);
    assert.deepEqual(items[0], {
      run_id: 'run-1',
      run_status: 'ready',
      waiting_actor: 'executor',
      current_task_id: 'task-1',
      current_attempt_id: null,
      current_question_id: null,
      current_review_id: null,
    });
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_get_state shows the Fix Task for a fix-ready Run before the next claim', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  submitFirstTask(service);
  claim(service, fixture); // attempt-1
  settle(service, makeAttemptSettle({ attempt_id: 'attempt-1', result: makeCodingResult(), process_exit_code: 0 }));
  service.submitReview(
    makeReview({ decision: 'changes_requested', findings: [makeFinding()] }),
    REVIEWER,
  );
  service.submitTask(makeFixTask({ task_id: 'task-2', room_id: 'room-1', run_id: 'run-1' }), PLANNER);
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    // fix-ready（claim 前）：current task 已切换为 Fix Task（Review finding inc10-r3），
    // attempt reference 仍指向已 settled 的 attempt-1。
    const state = await snapshot(codex, 'room-1');
    const items = state.run_work_items as {
      run_id: string;
      run_status: string;
      waiting_actor: string | null;
      current_task_id: string | null;
      current_attempt_id: string | null;
      current_question_id: string | null;
      current_review_id: string | null;
    }[];
    assert.equal(items.length, 1);
    assert.deepEqual(items[0], {
      run_id: 'run-1',
      run_status: 'ready',
      waiting_actor: 'executor',
      current_task_id: 'task-2',
      current_attempt_id: 'attempt-1',
      current_question_id: null,
      current_review_id: 'review-1',
    });
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_submit_task creates a ready Run, freezes the bootstrap worker and returns the Room to DISCUSSION', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    const result = await codex.callTool({ name: 'room_submit_task', arguments: makeTask() as unknown as Record<string, unknown> });
    assert.equal(result.isError, undefined);
    const out = result.structuredContent as {
      created: boolean;
      room: { state: string };
      task: { task_id: string };
      run: { run_id: string; status: string; worker_participant_id: string };
    };
    assert.equal(out.created, true);
    assert.equal(out.room.state, 'DISCUSSION');
    assert.equal(out.task.task_id, 'task-1');
    assert.equal(out.run.run_id, 'run-1');
    assert.equal(out.run.status, 'ready');
    assert.equal(out.run.worker_participant_id, 'claude-code-cli');
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
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    const first = await codex.callTool({ name: 'room_submit_task', arguments: makeTask() as unknown as Record<string, unknown> });
    assert.equal((first.structuredContent as { created: boolean }).created, true);

    const retry = await codex.callTool({ name: 'room_submit_task', arguments: makeTask() as unknown as Record<string, unknown> });
    assert.equal(retry.isError, undefined);
    const retryOut = retry.structuredContent as { created: boolean; room: { state: string }; run: { status: string } };
    assert.equal(retryOut.created, false);
    assert.equal(retryOut.room.state, 'DISCUSSION');
    assert.equal(retryOut.run.status, 'ready');

    const conflict = await codex.callTool({ name: 'room_submit_task', arguments: makeTask({ goal: 'changed' }) as unknown as Record<string, unknown> });
    assert.equal(conflict.isError, true);
    assert.equal(errorPayload(conflict).code, 'id_conflict');
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_submit_task fix task attaches to the review_discussion Run and returns it to ready', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  submitFirstTask(service);
  claim(service, fixture);
  settle(service, makeAttemptSettle());
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER);
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
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
      room: { state: string };
      task: { type: string };
      run: { run_id: string; status: string };
    };
    assert.equal(out.created, true);
    assert.equal(out.room.state, 'DISCUSSION');
    assert.equal(out.task.type, 'fix');
    assert.equal(out.run.run_id, 'run-1');
    assert.equal(out.run.status, 'ready');
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_ask_question on the claude route marks the active attempt decision_requested', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  submitFirstTask(service);
  claim(service, fixture);
  const { url, close } = await startApp(service, fixture);
  try {
    const claude = await connect(url, CLAUDE_ROUTE);
    await claude.listTools();
    const result = await claude.callTool({ name: 'room_ask_question', arguments: makeQuestion() as unknown as Record<string, unknown> });
    assert.equal(result.isError, undefined);
    const out = result.structuredContent as {
      created: boolean;
      question: { question_id: string };
      room: { state: string };
      attempt: { status: string };
    };
    assert.equal(out.created, true);
    assert.equal(out.question.question_id, 'question-1');
    assert.equal(out.room.state, 'DISCUSSION');
    assert.equal(out.attempt.status, 'decision_requested');
    assert.equal(service.getRun('run-1')!.status, 'running');
    await claude.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

// Fix inc9-fr3/fr4 direct regression：含斜杠的 participant_id 只有一个 raw identity，其 HTTP
// route representation 是 canonical framed single segment（测试侧 literal
// p~worker%2F2：`p~` transport framing + encodeURIComponent）。framed URL 必须命中单一
// participant route、tool 调用成功且 service 收到的 actor identity 恢复为 raw worker/2
//（Event 冻结 raw identity）；unframed candidate（encoded 单 segment worker%2F2、raw 双
// segment worker/2、unframed default identity）都不是 participant route（404，无
// wildcard/alias/多 segment fallback），且不产生任何 durable 副作用。
test('a slash participant_id reaches its tool through the canonical framed route with raw authority identity', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.registerParticipant(
    makeParticipant({
      participant_id: 'worker/2',
      display_name: 'Worker 2',
      kind: 'agent',
      provider: 'anthropic',
      adapter_id: 'claude_code_cli',
      capabilities: ['coding', 'questioning'],
    }),
    ORCHESTRATOR,
  );
  // v0.4：Run 的 worker 在提交时冻结。task-scope assignment 要求 Task 已存在，因此非默认
  // worker 只能经 submitTask 前的 room-scope latest assignment 合法到达 Run。
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-w2', scope_type: 'room', scope_id: null, role: 'worker', participant_id: 'worker/2' }),
    ORCHESTRATOR,
  );
  service.submitTask(makeTask(), PLANNER);
  claim(service, fixture);
  const { url, close } = await startApp(service, fixture);
  try {
    // 1) canonical framed single segment：tool 调用成功，authority 收到 raw worker/2。
    const framed = await connect(url, '/mcp/participants/p~worker%2F2');
    await framed.listTools();
    const result = await framed.callTool({ name: 'room_ask_question', arguments: makeQuestion() as unknown as Record<string, unknown> });
    assert.equal(result.isError, undefined);
    const out = result.structuredContent as { question: { question_id: string }; attempt: { status: string } };
    assert.equal(out.question.question_id, 'question-1');
    assert.equal(out.attempt.status, 'decision_requested');
    const asked = service.listEvents('room-1').find((e) => e.type === 'question_asked');
    assert.ok(asked, 'question_asked Event must exist');
    assert.equal(asked.participant_id, 'worker/2');
    assert.equal(asked.actor_role, 'worker');
    assert.equal(service.getRun('run-1')!.worker_participant_id, 'worker/2');
    await framed.close();

    // 2) unframed candidate route 不是 participant route：全部 404，且 durable Event list 不变。
    const eventsBefore = service.listEvents('room-1');
    for (const unframed of ['/mcp/participants/worker%2F2', '/mcp/participants/worker/2', '/mcp/participants/codex-app', '/mcp/participants/claude-code-cli']) {
      const res = await fetch(`${url}${unframed}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} }),
      });
      assert.equal(res.status, 404, `${unframed} must not be a participant route`);
      await res.text();
    }
    assert.deepEqual(service.listEvents('room-1'), eventsBefore, 'unframed routes must not reach any tool');
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

// Fix inc9-fr4 direct regression：`.`/`..` 是 schema 允许的 raw opaque participant_id，其
// canonical framed route 是测试侧 literal `p~.`/`p~..`（`p~` prefix 阻止 WHATWG URL 的
// dot-segment normalization）。两个 participant 都注册并经 submitTask 前的 room-scope
// worker assignment 分别冻结进各自 Run，通过各自 framed route 调用实际 write tool，Event
// actor 与 Run 冻结 worker 都是 raw identity；unframed `.`/`..` URL 被 URL parser 归一化
// 出 participant route（404），且不产生任何 durable 副作用。
test('dot participant_ids reach their tools through framed routes with raw authority identity', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  for (const [pid, name] of [['.', 'Dot'], ['..', 'Dotdot']] as const) {
    service.registerParticipant(
      makeParticipant({
        participant_id: pid,
        display_name: name,
        kind: 'agent',
        provider: 'anthropic',
        adapter_id: 'claude_code_cli',
        capabilities: ['coding', 'questioning'],
      }),
      ORCHESTRATOR,
    );
  }
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-dot', scope_type: 'room', scope_id: null, role: 'worker', participant_id: '.' }),
    ORCHESTRATOR,
  );
  service.submitTask(makeTask(), PLANNER);
  claim(service, fixture);
  const { url, close } = await startApp(service, fixture);
  try {
    // 1) `.` 的 framed route：实际 tool 调用成功，authority 收到 raw `.`。
    const dot = await connect(url, '/mcp/participants/p~.');
    await dot.listTools();
    const askedDot = await dot.callTool({ name: 'room_ask_question', arguments: makeQuestion() as unknown as Record<string, unknown> });
    assert.equal(askedDot.isError, undefined);
    assert.equal((askedDot.structuredContent as { question: { question_id: string } }).question.question_id, 'question-1');
    const dotEvent = service.listEvents('room-1').find((e) => e.type === 'question_asked');
    assert.ok(dotEvent, 'question_asked Event must exist');
    assert.equal(dotEvent.participant_id, '.');
    assert.equal(dotEvent.actor_role, 'worker');
    assert.equal(service.getRun('run-1')!.worker_participant_id, '.');
    await dot.close();

    // 2) unframed `.`/`..` URL 被 WHATWG URL 归一化出 participant route：404，Event list 不变。
    const eventsBefore = service.listEvents('room-1');
    for (const unframed of ['/mcp/participants/.', '/mcp/participants/..']) {
      const res = await fetch(`${url}${unframed}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} }),
      });
      assert.equal(res.status, 404, `${unframed} must not be a participant route`);
      await res.text();
    }
    assert.deepEqual(service.listEvents('room-1'), eventsBefore, 'unframed dot routes must not reach any tool');

    // 3) `..` 的 framed route 走完整 lifecycle：run-1 经 needs_decision → answer → 第二次
    // attempt succeeded → approved review → accept（释放 worktree lease）后，task-2 的新
    // Run 由 `..` 的 room-scope assignment 冻结，Event actor 冻结为 raw `..`。
    settle(service, makeAttemptSettle({ status: 'needs_decision', result: makeCodingResult({ status: 'needs_decision' }), agent_session_ref: 'sess-1' }));
    service.answerQuestion('question-1', 'pick a', false, PLANNER);
    claim(service, fixture, { attempt_id: 'attempt-2' });
    settle(service, makeAttemptSettle({ attempt_id: 'attempt-2' }));
    service.submitReview(makeReview({ attempt_id: 'attempt-2', decision: 'approved' }), REVIEWER);
    service.acceptReview('review-1', true, REVIEWER);

    service.transitionToArchitectureReview('room-1', PLANNER);
    service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
    service.createRoleAssignment(
      makeRoleAssignment({ assignment_id: 'a-dotdot', scope_type: 'room', scope_id: null, role: 'worker', participant_id: '..' }),
      ORCHESTRATOR,
    );
    service.submitTask(makeTask({ task_id: 'task-2', run_id: 'run-2' }), PLANNER);
    claim(service, fixture, { attempt_id: 'attempt-r2', run_id: 'run-2' });

    const dotdot = await connect(url, '/mcp/participants/p~..');
    await dotdot.listTools();
    const askedDotdot = await dotdot.callTool({
      name: 'room_ask_question',
      arguments: makeQuestion({ question_id: 'question-2', run_id: 'run-2', task_id: 'task-2', attempt_id: 'attempt-r2' }) as unknown as Record<string, unknown>,
    });
    assert.equal(askedDotdot.isError, undefined);
    assert.equal((askedDotdot.structuredContent as { question: { question_id: string } }).question.question_id, 'question-2');
    const dotdotEvent = service.listEvents('room-1').find((e) => e.type === 'question_asked' && e.entity_id === 'question-2');
    assert.ok(dotdotEvent, 'second question_asked Event must exist');
    assert.equal(dotdotEvent.participant_id, '..');
    assert.equal(dotdotEvent.actor_role, 'worker');
    assert.equal(service.getRun('run-2')!.worker_participant_id, '..');
    await dotdot.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('codex write tools (answer_question, submit_review, accept_review) round-trip through the adapter', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  submitFirstTask(service);
  claim(service, fixture);
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();

    service.askQuestion(makeQuestion(), WORKER);
    settle(service, makeAttemptSettle({ status: 'needs_decision', result: makeCodingResult({ status: 'needs_decision' }), agent_session_ref: 'sess-1' }));
    const answered = await codex.callTool({
      name: 'room_answer_question',
      arguments: { question_id: 'question-1', answer: 'pick a', answer_changes_contract: false },
    });
    assert.equal(answered.isError, undefined);
    const answeredOut = answered.structuredContent as { question: { status: string }; run: { status: string } };
    assert.equal(answeredOut.question.status, 'answered');
    assert.equal(answeredOut.run.status, 'ready');

    claim(service, fixture, { attempt_id: 'attempt-2' });
    settle(service, makeAttemptSettle({ attempt_id: 'attempt-2' }));

    const reviewed = await codex.callTool({
      name: 'room_submit_review',
      arguments: makeReview({ attempt_id: 'attempt-2' }) as unknown as Record<string, unknown>,
    });
    assert.equal(reviewed.isError, undefined);
    assert.equal((reviewed.structuredContent as { room: { state: string }; run: { status: string } }).room.state, 'DISCUSSION');
    assert.equal((reviewed.structuredContent as { run: { status: string } }).run.status, 'review_discussion');

    const accepted = await codex.callTool({
      name: 'room_accept_review',
      arguments: { review_id: 'review-1', confirmed_by_user: true },
    });
    assert.equal(accepted.isError, undefined);
    assert.equal((accepted.structuredContent as { room: { state: string }; run: { status: string } }).room.state, 'DISCUSSION');
    assert.equal((accepted.structuredContent as { run: { status: string } }).run.status, 'accepted');
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
  service.createRoom('room-1', PLANNER); // DISCUSSION：implementation submitTask 非法
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    const result = await codex.callTool({ name: 'room_submit_task', arguments: makeTask() as unknown as Record<string, unknown> });
    assert.equal(result.isError, true);
    const err = errorPayload(result);
    assert.equal(err.code, 'validation_failed');
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
  service.createRoom('room-1', PLANNER);
  const { url, close } = await startApp(service, fixture);
  try {
    const post = (route: string, method: string, params: unknown) =>
      fetch(url + route, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });

    const init = await post(CODEX_ROUTE, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 't', version: '1' },
    });
    assert.equal(init.status, 200);
    assert.match(init.headers.get('content-type') ?? '', /^application\/json/);
    assert.doesNotMatch(init.headers.get('content-type') ?? '', /text\/event-stream/);
    await init.text();

    const list = await post(CODEX_ROUTE, 'tools/list', {});
    assert.match(list.headers.get('content-type') ?? '', /^application\/json/);
    assert.doesNotMatch(list.headers.get('content-type') ?? '', /text\/event-stream/);
    await list.text();

    const call = await post(CODEX_ROUTE, 'tools/call', {
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
  service.createRoom('room-1', PLANNER); // DISCUSSION：implementation submitTask 非法 → ProtocolError
  const spy = closeSpy();
  const { url, close } = await startApp(service, fixture, undefined, spy.observe);
  try {
    const codex = await connect(url, CODEX_ROUTE);
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
    assert.equal(errorPayload(transitionErr).code, 'validation_failed');
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
  service.createRoom('room-1', PLANNER);
  db.close(); // 后续 room_get_state 的 SQLite prepare 抛 plain Error（非 ProtocolError）
  const spy = closeSpy();
  const { url, close } = await startApp(service, fixture, undefined, spy.observe);
  try {
    const codex = await connect(url, CODEX_ROUTE);
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
  service.createRoom('room-1', PLANNER);
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
        url + CODEX_ROUTE,
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

test('room_submit_task with invalid input is rejected by the SDK and persists nothing', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
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

test('room_submit_review rejects a running run, rolls back the insert and keeps the Run running', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  submitFirstTask(service);
  claim(service, fixture); // Run running，attempt 仍 active
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    const result = await codex.callTool({
      name: 'room_submit_review',
      arguments: makeReview() as unknown as Record<string, unknown>,
    });
    assert.equal(result.isError, true);
    assert.equal(errorPayload(result).code, 'validation_failed');
    assert.equal(service.getReview('review-1'), null);
    assert.equal(service.getRun('run-1')!.status, 'running');
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
  submitFirstTask(service);
  claim(service, fixture);
  service.askQuestion(makeQuestion(), WORKER);
  settle(service, makeAttemptSettle({ status: 'needs_decision', result: makeCodingResult({ status: 'needs_decision' }), agent_session_ref: 'sess-1' }));
  service.answerQuestion('question-1', 'pick a', false, PLANNER);
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    const result = await codex.callTool({
      name: 'room_answer_question',
      arguments: { question_id: 'question-1', answer: 'again', answer_changes_contract: false },
    });
    assert.equal(result.isError, true);
    assert.equal(errorPayload(result).code, 'validation_failed');
    assert.equal(service.getRun('run-1')!.status, 'ready');
    assert.deepEqual(await snapshot(codex, 'room-1'), before);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_answer_question rejects before terminal finalization with no partial write', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  submitFirstTask(service);
  claim(service, fixture);
  service.askQuestion(makeQuestion(), WORKER); // attempt decision_requested，Run 仍 running
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    const result = await codex.callTool({
      name: 'room_answer_question',
      arguments: { question_id: 'question-1', answer: 'pick a', answer_changes_contract: false },
    });
    assert.equal(result.isError, true);
    assert.equal(errorPayload(result).code, 'validation_failed');
    assert.equal(service.getQuestion('question-1')!.status, 'open');
    assert.equal(service.getRun('run-1')!.status, 'running');
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
  submitFirstTask(service);
  claim(service, fixture);
  settle(service, makeAttemptSettle());
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding({ severity: 'blocker' })] }), REVIEWER);
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    const result = await codex.callTool({
      name: 'room_accept_review',
      arguments: { review_id: 'review-1', confirmed_by_user: true },
    });
    assert.equal(result.isError, true);
    assert.equal(errorPayload(result).code, 'validation_failed');
    assert.equal(service.getRun('run-1')!.status, 'review_discussion');
    assert.deepEqual(await snapshot(codex, 'room-1'), before);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_ask_question rejects a question for a non-running attempt and rolls back the insert', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  submitFirstTask(service);
  claim(service, fixture);
  settle(service, makeAttemptSettle()); // attempt 已 terminal succeeded，非 running
  const { url, close } = await startApp(service, fixture);
  try {
    const claude = await connect(url, CLAUDE_ROUTE);
    await claude.listTools();
    const codex = await connect(url, CODEX_ROUTE); // 仅用于 room_get_state 读 public snapshot
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    const result = await claude.callTool({
      name: 'room_ask_question',
      arguments: makeQuestion() as unknown as Record<string, unknown>,
    });
    assert.equal(result.isError, true);
    assert.equal(errorPayload(result).code, 'validation_failed');
    assert.equal(service.getQuestion('question-1'), null);
    assert.equal(service.getRun('run-1')!.status, 'review_required');
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
  submitFirstTask(service);
  claim(service, fixture);
  settle(service, makeAttemptSettle());
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
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

test('room_submit_review rejects a new review_id referencing a stale succeeded attempt and changes no durable state', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  submitFirstTask(service); // task-1 → run-1 ready
  claim(service, fixture); // attempt-1 running
  settle(service, makeAttemptSettle()); // attempt-1 succeeded → run review_required
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER); // review-1 → run review_discussion
  // fix 路径提交 task-2、完成 attempt-2，使 run 回到 review_required 且 attempt-2 是 latest
  // succeeded attempt。
  service.submitTask(makeFixTask({ task_id: 'task-2' }), PLANNER); // task-2 → run ready
  claim(service, fixture, { attempt_id: 'attempt-2' });
  settle(service, makeAttemptSettle({ attempt_id: 'attempt-2', result: makeCodingResult({ task_id: 'task-2' }) }));

  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');

    // 新 review_id 引用旧 succeeded attempt-1：attempt-1 不是 latest succeeded attempt
    //（attempt-2 才是），应命中 latest-attempt guard 并整体回滚，不持久化 stale Review、
    // 不改 Run/Event/cursor。
    const result = await codex.callTool({
      name: 'room_submit_review',
      arguments: makeReview({
        review_id: 'review-stale',
        task_id: 'task-1',
        run_id: 'run-1',
        attempt_id: 'attempt-1',
      }) as unknown as Record<string, unknown>,
    });
    assert.equal(result.isError, true);
    assert.equal(errorPayload(result).code, 'validation_failed');

    assert.equal(service.getReview('review-stale'), null);
    assert.equal(service.getRun('run-1')!.status, 'review_required');
    const after = await snapshot(codex, 'room-1');
    assert.deepEqual(after, before);
    const workItem = (after.run_work_items as {
      run_id: string;
      current_task_id: string | null;
      current_attempt_id: string | null;
      current_review_id: string | null;
    }[])[0];
    assert.equal(workItem.run_id, 'run-1');
    assert.equal(workItem.current_task_id, 'task-2');
    assert.equal(workItem.current_attempt_id, 'attempt-2');
    assert.equal(workItem.current_review_id, 'review-1');
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
  submitFirstTask(service);
  claim(service, fixture); // Run running，attempt active
  const { url, close } = await startApp(service, fixture);
  try {
    const claude = await connect(url, CLAUDE_ROUTE);
    await claude.listTools();
    const codex = await connect(url, CODEX_ROUTE);
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
  submitFirstTask(service);
  claim(service, fixture);
  settle(service, makeAttemptSettle());
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER);
  // fix 路径提交第二个 task/attempt/review，使 review-1 不再是 current review。
  service.submitTask(makeFixTask({ task_id: 'task-2' }), PLANNER);
  claim(service, fixture, { attempt_id: 'attempt-2' });
  settle(service, makeAttemptSettle({ attempt_id: 'attempt-2', result: makeCodingResult({ task_id: 'task-2' }) }));
  service.submitReview(makeReview({
    review_id: 'review-2',
    task_id: 'task-2',
    run_id: 'run-1',
    attempt_id: 'attempt-2',
    decision: 'changes_requested',
    findings: [makeFinding()],
  }), REVIEWER);
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    const result = await codex.callTool({
      name: 'room_accept_review',
      arguments: { review_id: 'review-1', confirmed_by_user: true },
    });
    assert.equal(result.isError, true);
    assert.equal(errorPayload(result).code, 'validation_failed');
    assert.equal(service.getRun('run-1')!.status, 'review_discussion');
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
  submitFirstTask(service1);
  claim(service1, fixture);
  db1.close();

  const db2 = new DatabaseSync(dbPath);
  const service2 = new RoomService(db2);
  const { url, close } = await startApp(service2, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    const result = await codex.callTool({ name: 'room_get_state', arguments: { room_id: 'room-1' } });
    assert.equal(result.isError, undefined);
    const state = result.structuredContent as {
      cursor: number;
      planning_waiting_actor: string | null;
      run_work_items: { run_id: string; run_status: string; current_task_id: string | null; current_attempt_id: string | null }[];
      room: { state: string };
    };
    assert.equal(state.room.state, 'DISCUSSION');
    assert.equal(state.run_work_items[0].run_id, 'run-1');
    assert.equal(state.run_work_items[0].run_status, 'running');
    assert.equal(state.run_work_items[0].current_task_id, 'task-1');
    assert.equal(state.run_work_items[0].current_attempt_id, 'attempt-1');
    assert.equal(state.cursor, 6);
    assert.equal(state.planning_waiting_actor, 'planner');
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
    const codex = await connect(url, CODEX_ROUTE);
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
  service.createRoom('room-1', PLANNER); // DISCUSSION
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
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

test('room_retry_run returns a failed Run to ready with the source attempt preserved', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  submitFirstTask(service);
  claim(service, fixture);
  settle(service, makeAttemptSettle({ status: 'failed', result: null, failure: { code: 'claude_exit_failed', message: 'boom' }, agent_session_ref: null, process_exit_code: 1 }));
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    const result = await codex.callTool({ name: 'room_retry_run', arguments: { room_id: 'room-1', run_id: 'run-1' } });
    assert.equal(result.isError, undefined);
    const body = result.structuredContent as { room: { room_id: string; state: string }; run: { run_id: string; status: string } };
    assert.equal(body.room.room_id, 'room-1');
    assert.equal(body.room.state, 'DISCUSSION');
    assert.equal(body.run.run_id, 'run-1');
    assert.equal(body.run.status, 'ready');
    // source Attempt 保持 terminal failed；work item 仍指向该 attempt。
    assert.equal(service.getAttempt('attempt-1')!.status, 'failed');
    const state = await snapshot(codex, 'room-1');
    const workItem = (state.run_work_items as { run_id: string; run_status: string; current_attempt_id: string | null }[])[0];
    assert.equal(workItem.run_id, 'run-1');
    assert.equal(workItem.run_status, 'ready');
    assert.equal(workItem.current_attempt_id, 'attempt-1');
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('the coordination tools reject wrong-state transitions with a stable ProtocolError and unchanged full snapshot', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  submitFirstTask(service);
  // 第二个 planning cycle 把 Room 送回 WAITING_FOR_USER_CONFIRMATION，制造 planning 负例。
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    // 重复/回退 planning transition 非法；run-1 仍 ready 时 retry/cancel 也非法。
    for (const [name, args, code] of [
      ['room_begin_architecture_review', { room_id: 'room-1' }, 'invalid_transition'],
      ['room_request_user_confirmation', { room_id: 'room-1' }, 'invalid_transition'],
      ['room_retry_run', { room_id: 'room-1', run_id: 'run-1' }, 'validation_failed'],
      ['room_cancel_run', { room_id: 'room-1', run_id: 'run-1', reason: 'stop', confirmed_by_user: true }, 'validation_failed'],
    ] as const) {
      const result = await codex.callTool({ name, arguments: { ...args } });
      assert.equal(result.isError, true, `${name} must reject the wrong-state transition`);
      const err = errorPayload(result);
      assert.equal(err.code, code);
      assert.ok(err.message.length > 0);
      assert.deepEqual(await snapshot(codex, 'room-1'), before, `${name} must not change durable state`);
    }
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('the coordination tools reject missing or empty ids with invalid-arguments and leave the full snapshot unchanged', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1', PLANNER);
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    const before = await snapshot(codex, 'room-1');
    for (const name of [
      'room_create',
      'room_begin_architecture_review',
      'room_request_user_confirmation',
      'room_retry_run',
      'room_cancel_run',
      'room_add_run_guidance',
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
  service.createRoom('room-1', PLANNER);
  db.close(); // 后续任何 write/prepare 抛 plain Error（非 ProtocolError）
  const spy = closeSpy();
  const { url, close } = await startApp(service, fixture, undefined, spy.observe);
  try {
    const codex = await connect(url, CODEX_ROUTE);
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
      'room_cancel_run',
      'room_add_run_guidance',
    ]) {
      const result = await codex.callTool({ name, arguments: { room_id: 'room-1', run_id: 'run-1' } });
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

// ---- v0.4 execution coordination tools：guidance 与 cancel ----

test('room_add_run_guidance round-trips through the adapter and is consumed by the next claim exactly once', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  submitFirstTask(service); // run-1 ready：无 active attempt，允许 guidance
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    const added = await codex.callTool({
      name: 'room_add_run_guidance',
      arguments: { guidance_id: 'guidance-1', room_id: 'room-1', run_id: 'run-1', text: 'focus on X' },
    });
    assert.equal(added.isError, undefined);
    const addedOut = added.structuredContent as { created: boolean; guidance: { guidance_id: string; consumed_by_attempt_id: string | null } };
    assert.equal(addedOut.created, true);
    assert.equal(addedOut.guidance.guidance_id, 'guidance-1');
    assert.equal(addedOut.guidance.consumed_by_attempt_id, null);

    const retry = await codex.callTool({
      name: 'room_add_run_guidance',
      arguments: { guidance_id: 'guidance-1', room_id: 'room-1', run_id: 'run-1', text: 'focus on X' },
    });
    assert.equal(retry.isError, undefined);
    assert.equal((retry.structuredContent as { created: boolean }).created, false);

    // 下一次 claim 原子消费该 guidance，消费归属固化在 attempt-1。
    const claimed = service.claimRunAttempt(
      {
        attempt_id: 'attempt-1',
        run_id: 'run-1',
        room_id: 'room-1',
        worktree_path: fixture,
        baseline_head: git(fixture, 'rev-parse', 'HEAD').trim(),
      },
      EXECUTOR,
    );
    assert.equal(claimed.created, true);
    assert.equal(claimed.guidance.length, 1);
    assert.equal(claimed.guidance[0].guidance_id, 'guidance-1');
    assert.equal(service.getGuidance('guidance-1')!.consumed_by_attempt_id, 'attempt-1');

    // active attempt 期间新增 guidance 被零写入拒绝：不宣称 live steer。
    const during = await codex.callTool({
      name: 'room_add_run_guidance',
      arguments: { guidance_id: 'guidance-2', room_id: 'room-1', run_id: 'run-1', text: 'live steer' },
    });
    assert.equal(during.isError, true);
    assert.equal(errorPayload(during).code, 'validation_failed');
    assert.equal(service.getGuidance('guidance-2'), null);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('room_cancel_run requires the confirmed_by_user literal gate and moves the active attempt to cancel_requested', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  submitFirstTask(service);
  claim(service, fixture);
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();

    // 1) confirmed_by_user=false 被 schema literal gate 拒绝，state 不变。
    const denied = await codex.callTool({
      name: 'room_cancel_run',
      arguments: { room_id: 'room-1', run_id: 'run-1', reason: 'stop', confirmed_by_user: false },
    });
    assert.equal(denied.isError, true);
    assert.match(resultText(denied), /Invalid arguments/);
    assert.equal(service.getAttempt('attempt-1')!.status, 'running');
    assert.equal(service.getRun('run-1')!.status, 'running');

    // 2) confirmed cancel 把 Run/Attempt 置 cancel_requested；same-ID retry 幂等。
    const canceled = await codex.callTool({
      name: 'room_cancel_run',
      arguments: { room_id: 'room-1', run_id: 'run-1', reason: 'stop', confirmed_by_user: true },
    });
    assert.equal(canceled.isError, undefined);
    const out = canceled.structuredContent as {
      created: boolean;
      room: { state: string };
      run: { status: string };
      attempt: { status: string };
    };
    assert.equal(out.created, true);
    assert.equal(out.room.state, 'DISCUSSION');
    assert.equal(out.run.status, 'cancel_requested');
    assert.equal(out.attempt.status, 'cancel_requested');

    const retry = await codex.callTool({
      name: 'room_cancel_run',
      arguments: { room_id: 'room-1', run_id: 'run-1', reason: 'stop', confirmed_by_user: true },
    });
    assert.equal(retry.isError, undefined);
    assert.equal((retry.structuredContent as { created: boolean }).created, false);

    // 3) Executor settle canceled 后 Run 进入 canceled，planner 可 retry 回 ready。
    settle(service, makeAttemptSettle({ status: 'canceled', result: null, failure: null, agent_session_ref: null, process_exit_code: null }));
    assert.equal(service.getRun('run-1')!.status, 'canceled');
    const retried = await codex.callTool({ name: 'room_retry_run', arguments: { room_id: 'room-1', run_id: 'run-1' } });
    assert.equal(retried.isError, undefined);
    assert.equal((retried.structuredContent as { run: { status: string } }).run.status, 'ready');
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

// ---- v0.3 participant route / command authority ----

test('participant commands on a route without the orchestrator assignment are rejected as actor_not_allowed', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1', PLANNER);
  const { url, close } = await startApp(service, fixture);
  try {
    // operator 是 bootstrap human profile、无任何 active assignment（Fix inc9-r4）：
    // orchestrator 命令必须被拒且不持久化。
    const operator = await connect(url, OPERATOR_ROUTE);
    await operator.listTools();
    const denied = await operator.callTool({
      name: 'room_register_participant',
      arguments: makeParticipant({ participant_id: 'p2' }) as unknown as Record<string, unknown>,
    });
    assert.equal(denied.isError, true);
    assert.equal(errorPayload(denied).code, 'actor_not_allowed');
    assert.equal(service.getParticipant('p2'), null);

    const deniedEnabled = await operator.callTool({
      name: 'room_set_participant_enabled',
      arguments: { participant_id: 'claude-code-cli', enabled: false },
    });
    assert.equal(deniedEnabled.isError, true);
    assert.equal(errorPayload(deniedEnabled).code, 'actor_not_allowed');
    assert.equal(service.getParticipant('claude-code-cli')!.enabled, true);

    const deniedAssign = await operator.callTool({
      name: 'room_create_role_assignment',
      arguments: makeRoleAssignment({ assignment_id: 'a-x' }) as unknown as Record<string, unknown>,
    });
    assert.equal(deniedAssign.isError, true);
    assert.equal(errorPayload(deniedAssign).code, 'actor_not_allowed');
    assert.equal(service.getRoleAssignment('a-x'), null);
    await operator.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('codex-app route registers participants, toggles enabled and creates role assignments; snapshot reflects them', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1', PLANNER);
  const { url, close } = await startApp(service, fixture);
  try {
    // Fix inc9-r4：codex-app 是 single control endpoint，bootstrap 持有 orchestrator assignment。
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();

    const registered = await codex.callTool({
      name: 'room_register_participant',
      arguments: makeParticipant({
        participant_id: 'p2',
        kind: 'agent',
        provider: 'codex',
        adapter_id: 'codex_app',
        capabilities: ['planning'],
      }) as unknown as Record<string, unknown>,
    });
    assert.equal(registered.isError, undefined);
    assert.equal((registered.structuredContent as { created: boolean }).created, true);

    // disabled 的 participant 不能被 assign。
    const disabled = await codex.callTool({
      name: 'room_set_participant_enabled',
      arguments: { participant_id: 'p2', enabled: false },
    });
    assert.equal(disabled.isError, undefined);
    const deniedAssign = await codex.callTool({
      name: 'room_create_role_assignment',
      arguments: makeRoleAssignment({ assignment_id: 'a-p2', role: 'planner', participant_id: 'p2' }) as unknown as Record<string, unknown>,
    });
    assert.equal(deniedAssign.isError, true);
    assert.equal(errorPayload(deniedAssign).code, 'validation_failed');
    assert.equal(service.getRoleAssignment('a-p2'), null);

    // 重新 enable 后可 assign，snapshot 反映新 profile/assignment。
    const enabled = await codex.callTool({
      name: 'room_set_participant_enabled',
      arguments: { participant_id: 'p2', enabled: true },
    });
    assert.equal(enabled.isError, undefined);
    const assigned = await codex.callTool({
      name: 'room_create_role_assignment',
      arguments: makeRoleAssignment({ assignment_id: 'a-p2', role: 'planner', participant_id: 'p2' }) as unknown as Record<string, unknown>,
    });
    assert.equal(assigned.isError, undefined);
    assert.equal((assigned.structuredContent as { created: boolean }).created, true);

    const state = await snapshot(codex, 'room-1');
    const participants = state.participants as { participant_id: string; enabled: boolean }[];
    const p2 = participants.find((p) => p.participant_id === 'p2');
    assert.equal(p2?.enabled, true);
    const assignments = state.role_assignments as { assignment_id: string; role: string; participant_id: string }[];
    assert.ok(assignments.some((a) => a.assignment_id === 'a-p2' && a.role === 'planner' && a.participant_id === 'p2'));
    assert.equal(assignments.length, 6);
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('a disabled participant loses new command authority through MCP but history stays readable', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  const service = new RoomService(new DatabaseSync(':memory:'));
  submitFirstTask(service);
  claim(service, fixture);
  const { url, close } = await startApp(service, fixture);
  try {
    const codex = await connect(url, CODEX_ROUTE);
    await codex.listTools();
    const disabled = await codex.callTool({
      name: 'room_set_participant_enabled',
      arguments: { participant_id: 'claude-code-cli', enabled: false },
    });
    assert.equal(disabled.isError, undefined);

    // disabled 后 worker 命令被拒；room_get_state（成员读）也因 disabled 拒绝。
    const claude = await connect(url, CLAUDE_ROUTE);
    await claude.listTools();
    const asked = await claude.callTool({
      name: 'room_ask_question',
      arguments: makeQuestion() as unknown as Record<string, unknown>,
    });
    assert.equal(asked.isError, true);
    assert.equal(errorPayload(asked).code, 'actor_not_allowed');
    assert.equal(service.getQuestion('question-1'), null);
    const read = await claude.callTool({ name: 'room_get_state', arguments: { room_id: 'room-1' } });
    assert.equal(read.isError, true);
    assert.equal(errorPayload(read).code, 'actor_not_allowed');
    await claude.close();

    // 历史 entity 仍可从 durable state 读取（codex route 读 snapshot 也正常）。
    const state = await snapshot(codex, 'room-1');
    const workItem = (state.run_work_items as { run_id: string; current_task_id: string | null; current_attempt_id: string | null }[])[0];
    assert.equal(workItem.run_id, 'run-1');
    assert.equal(workItem.current_task_id, 'task-1');
    assert.equal(workItem.current_attempt_id, 'attempt-1');
    const runs = state.runs as { run_id: string; worker_participant_id: string }[];
    assert.equal(runs[0]?.worker_participant_id, 'claude-code-cli');
    assert.equal(service.getRun('run-1')!.worker_participant_id, 'claude-code-cli');
    await codex.close();
  } finally {
    await close();
    rmSync(fixture, { recursive: true, force: true });
  }
});
