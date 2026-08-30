import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { runCliMain, type RunCliIo } from '../src/cli/run.ts';
import { createRoomMcpApp } from '../src/mcp/http.ts';
import { RoomService } from '../src/room/room-service.ts';
import { makeCodingResult, makeQuestion, makeReview, makeTask } from './fixtures.ts';
import { FakeClaudeProcess, type FakeSpawn, type SpawnInvocation } from './runner-fixtures/claude-process-fake.ts';

// 跨项目并行隔离的端到端测试：Project A/B 各自拥有独立 Room service、loopback port、
// SQLite database、project path/worktree 与 Claude process，经 barrier-gate 的 drive 交错
// 证明两者 one-shot Runs 在时间上实际重叠；Task/Review/Question 实体通过 cross-database
// 直接查找与 snapshot current 引用证明互不可见（Review 1 finding 3 的 contract 条款）。
const SESSION_A = 'sess-00000000-0000-4000-8000-0000000000a1';
const SESSION_B = 'sess-00000000-0000-4000-8000-0000000000b2';

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

function makeFixture(): { fixture: string; repo: string; baselineHead: string } {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-multi-'));
  const repo = join(fixture, 'repo');
  mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', '--local', 'commit.gpgsign', 'false');
  git(repo, 'config', '--local', 'core.autocrlf', 'false');
  writeFileSync(join(repo, 'seed.txt'), 'base');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
  const baselineHead = git(repo, 'rev-parse', 'HEAD').trim();
  return { fixture, repo, baselineHead };
}

async function startApp(
  service: RoomService,
  projectPath: string,
): Promise<{ url: string; close: () => Promise<void> }> {
  const app = createRoomMcpApp({ service, projectPath });
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

async function connect(url: string, route: string): Promise<Client> {
  const client = new Client({ name: 'e2e-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url + route));
  await client.connect(transport);
  return client;
}

async function snapshot(client: Client, roomId: string): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name: 'room_get_state', arguments: { room_id: roomId } });
  assert.equal(result.isError, undefined);
  const state = result.structuredContent;
  assert.ok(typeof state === 'object' && state !== null);
  return state as Record<string, unknown>;
}

async function plan(client: Client, roomId: string): Promise<void> {
  await client.callTool({ name: 'room_create', arguments: { room_id: roomId } });
  await client.callTool({ name: 'room_begin_architecture_review', arguments: { room_id: roomId } });
  await client.callTool({ name: 'room_request_user_confirmation', arguments: { room_id: roomId } });
}

function recordingIo(): {
  io: RunCliIo;
  out: { stdout: string; stderr: string; exitCode: number | null };
} {
  const out = { stdout: '', stderr: '', exitCode: null as number | null };
  const io: RunCliIo = {
    stdout: (text) => {
      out.stdout += text;
    },
    stderr: (text) => {
      out.stderr += text;
    },
    exit: (code) => {
      out.exitCode = code;
    },
  };
  return { io, out };
}

function line(event: Record<string, unknown>): string {
  return JSON.stringify(event);
}

function initLine(sessionId: string): string {
  return line({
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    tools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'mcp__agent_room__room_ask_question'],
    mcp_servers: [{ name: 'agent_room' }],
    permissionMode: 'dontAsk',
    claude_code_version: '2.1.241',
  });
}

function resultLine(sessionId: string, codingResult = makeCodingResult()): string {
  return line({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: sessionId,
    result: JSON.stringify(codingResult),
    structured_output: codingResult,
    stop_reason: 'tool_use',
  });
}

async function runCli(
  url: string,
  dbPath: string,
  fixture: string,
  taskId: string,
  runId: string,
  baselineHead: string | null,
  spawnProcess: FakeSpawn,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  const args = [
    '--db', dbPath,
    '--project', fixture,
    '--task-id', taskId,
    '--run-id', runId,
    '--mcp-url', `${url}/mcp/participants/p~claude-code-cli`,
  ];
  if (baselineHead !== null) args.push('--baseline-head', baselineHead);
  const { io, out } = recordingIo();
  await runCliMain(args, { spawnProcess }, io);
  return out;
}

test('two projects run parallel one-shot runs with cross-database entity isolation', async () => {
  const fixtureA = makeFixture();
  const fixtureB = makeFixture();
  const dbPathA = join(fixtureA.fixture, 'room.db');
  const dbPathB = join(fixtureB.fixture, 'room.db');
  const dbA = new DatabaseSync(dbPathA);
  const dbB = new DatabaseSync(dbPathB);
  const serviceA = new RoomService(dbA);
  const serviceB = new RoomService(dbB);
  const appA = await startApp(serviceA, fixtureA.repo);
  const appB = await startApp(serviceB, fixtureB.repo);
  const codexA = await connect(appA.url, '/mcp/participants/p~codex-app');
  const codexB = await connect(appB.url, '/mcp/participants/p~codex-app');
  const claudeA = await connect(appA.url, '/mcp/participants/p~claude-code-cli');
  try {
    // 各自完成 planning gate，提交各自 Task。
    await plan(codexA, 'room-a');
    await codexA.callTool({
      name: 'room_submit_task',
      arguments: makeTask({ task_id: 'task-a-1', room_id: 'room-a' }) as unknown as Record<string, unknown>,
    });
    await plan(codexB, 'room-b');
    await codexB.callTool({
      name: 'room_submit_task',
      arguments: makeTask({ task_id: 'task-b-1', room_id: 'room-b' }) as unknown as Record<string, unknown>,
    });

    // barrier-gate：两个 fake child 都 spawn 后 drive 才允许交错执行；每个 drive 只在自己
    // 的 read 门后写入 stdout/close，保证 cross-database 观察落在对方仍 in-flight 的窗口。
    let resolveBoth!: () => void;
    const bothSpawned = new Promise<void>((resolve) => {
      resolveBoth = resolve;
    });
    let resolveARead!: () => void;
    const aReadDone = new Promise<void>((resolve) => {
      resolveARead = resolve;
    });
    let resolveBRead!: () => void;
    const bReadDone = new Promise<void>((resolve) => {
      resolveBRead = resolve;
    });

    const childA = new FakeClaudeProcess();
    const childB = new FakeClaudeProcess();
    const invocationsA: SpawnInvocation[] = [];
    const invocationsB: SpawnInvocation[] = [];
    const invocationsA2: SpawnInvocation[] = [];
    let spawned = 0;

    const spawnerA: FakeSpawn = (command, args, options) => {
      invocationsA.push({ command, args, options });
      if (++spawned === 2) resolveBoth();
      setImmediate(driveA);
      return childA as unknown as ChildProcess;
    };
    const spawnerB: FakeSpawn = (command, args, options) => {
      invocationsB.push({ command, args, options });
      if (++spawned === 2) resolveBoth();
      setImmediate(driveB);
      return childB as unknown as ChildProcess;
    };
    // 被拒绝的 second run 不得 spawn：任何实际 spawn 都立即失败测试。
    const spawnerA2: FakeSpawn = (_command, _args, _options) => {
      invocationsA2.push({ command: _command, args: _args, options: _options });
      throw new Error('second active run must not spawn a Claude process');
    };

    // Project A drive：拒绝 second active run → 观察 B 仍 running → 放行 A 的 read → 等 B 完成
    // 后在 A 尚未完成前经 actual MCP room_ask_question 把 run-a-1 转为 needs_decision。
    async function driveA(): Promise<void> {
      await bothSpawned;
      const rejected = await runCli(appA.url, dbPathA, fixtureA.repo, 'task-a-1', 'run-a-2', fixtureA.baselineHead, spawnerA2);
      assert.equal(rejected.exitCode, 1, 'second active run must exit 1');
      assert.equal(rejected.stdout, '', 'validation failure is reported on stderr');
      assert.ok(rejected.stderr.includes('validation_failed'), 'second active run must be rejected');
      assert.equal(invocationsA2.length, 0, 'rejected run must not spawn a Claude process');
      const stateB = await snapshot(codexB, 'room-b');
      assert.equal((stateB.current_run as { run_id: string }).run_id, 'run-b-1');
      assert.equal((stateB.current_run as { status: string }).status, 'running', 'A must observe B in-flight');
      resolveARead();
      await bReadDone;
      const asked = await claudeA.callTool({
        name: 'room_ask_question',
        arguments: makeQuestion({ question_id: 'question-a-1', room_id: 'room-a', task_id: 'task-a-1', run_id: 'run-a-1' }) as unknown as Record<string, unknown>,
      });
      assert.equal((asked.structuredContent as { created: boolean }).created, true);
      writeFileSync(join(fixtureA.repo, 'impl-a.txt'), 'impl-a');
      childA.stdout.write(
        `${initLine(SESSION_A)}\n${resultLine(SESSION_A, makeCodingResult({ task_id: 'task-a-1', status: 'needs_decision' }))}\n`,
      );
      childA.stdout.end();
      childA.stderr.end();
      childA.emit('close', 0, null);
    }

    // Project B drive：观察 A 仍 running → 放行 B 的 read → 等 A 的 read → 正常完成。
    async function driveB(): Promise<void> {
      await bothSpawned;
      const stateA = await snapshot(codexA, 'room-a');
      assert.equal((stateA.current_run as { run_id: string }).run_id, 'run-a-1');
      assert.equal((stateA.current_run as { status: string }).status, 'running', 'B must observe A in-flight');
      resolveBRead();
      await aReadDone;
      writeFileSync(join(fixtureB.repo, 'impl-b.txt'), 'impl-b');
      childB.stdout.write(`${initLine(SESSION_B)}\n${resultLine(SESSION_B, makeCodingResult({ task_id: 'task-b-1' }))}\n`);
      childB.stdout.end();
      childB.stderr.end();
      childB.emit('close', 0, null);
    }

    const [runA, runB] = await Promise.all([
      runCli(appA.url, dbPathA, fixtureA.repo, 'task-a-1', 'run-a-1', fixtureA.baselineHead, spawnerA),
      runCli(appB.url, dbPathB, fixtureB.repo, 'task-b-1', 'run-b-1', fixtureB.baselineHead, spawnerB),
    ]);
    assert.equal(runA.exitCode, 0);
    assert.equal(runB.exitCode, 0);
    const payloadA = JSON.parse(runA.stdout) as {
      room: { state: string };
      run: { status: string; agent_session_ref: string; completed_at: string | null };
    };
    const payloadB = JSON.parse(runB.stdout) as { room: { state: string }; run: { status: string } };
    assert.equal(payloadA.room.state, 'NEEDS_DECISION');
    assert.equal(payloadA.run.status, 'needs_decision');
    assert.equal(payloadA.run.agent_session_ref, SESSION_A);
    assert.ok(payloadA.run.completed_at !== null, 'paused run is finalized with completed_at');
    assert.equal(payloadB.room.state, 'REVIEW_REQUIRED');
    assert.equal(payloadB.run.status, 'succeeded');
    assert.ok(!invocationsA[0].args.includes('--resume'), 'first run must not resume');
    assert.ok(!invocationsB[0].args.includes('--resume'), 'first run must not resume');

    // Project B 走公开 lifecycle 提交 Review：review-b-1 只属于 room-b。
    await codexB.callTool({
      name: 'room_submit_review',
      arguments: makeReview({ review_id: 'review-b-1', room_id: 'room-b', task_id: 'task-b-1', run_id: 'run-b-1', decision: 'approved' }) as unknown as Record<string, unknown>,
    });

    // snapshot current 引用：各房间只指向自己的实体。
    const stateA = await snapshot(codexA, 'room-a');
    const stateB = await snapshot(codexB, 'room-b');
    assert.equal((stateA.current_task as { task_id: string }).task_id, 'task-a-1');
    assert.equal((stateB.current_task as { task_id: string }).task_id, 'task-b-1');
    assert.equal((stateA.current_run as { run_id: string }).run_id, 'run-a-1');
    assert.equal((stateB.current_run as { run_id: string }).run_id, 'run-b-1');
    assert.equal((stateA.current_question as { question_id: string }).question_id, 'question-a-1');
    assert.equal(stateB.current_question, null, 'B must not see A question');
    assert.equal(stateA.current_review, null, 'A must not see B review');
    assert.equal((stateB.current_review as { review_id: string }).review_id, 'review-b-1');
    // Event 序列：A 只有 question pause 事件，B 只有完成 + review 事件。
    assert.equal(stateA.cursor, 7);
    assert.equal(stateB.cursor, 7);
    const eventsA = stateA.events as { type: string; room_id: string }[];
    const eventsB = stateB.events as { type: string; room_id: string }[];
    assert.equal(eventsA.length, 7);
    assert.equal(eventsA.filter((e) => e.type === 'run_started').length, 1);
    assert.equal(eventsA.filter((e) => e.type === 'question_asked').length, 1);
    assert.equal(eventsA.filter((e) => e.type === 'run_paused').length, 1);
    assert.equal(eventsA.filter((e) => e.type === 'run_completed').length, 0);
    assert.equal(eventsA.filter((e) => e.type === 'review_submitted').length, 0);
    assert.equal(eventsB.length, 7);
    assert.equal(eventsB.filter((e) => e.type === 'run_completed').length, 1);
    assert.equal(eventsB.filter((e) => e.type === 'review_submitted').length, 1);
    assert.equal(eventsB.filter((e) => e.type === 'question_asked').length, 0);
    assert.equal(eventsB.filter((e) => e.type === 'run_paused').length, 0);
    for (const e of eventsA) assert.equal(e.room_id, 'room-a');
    for (const e of eventsB) assert.equal(e.room_id, 'room-b');

    // durable 证据：第二个连接 cross-database 直接查找，证明实体隔离是持久化级的。
    const verifyDbA = new DatabaseSync(dbPathA);
    const verifyDbB = new DatabaseSync(dbPathB);
    const verifyA = new RoomService(verifyDbA);
    const verifyB = new RoomService(verifyDbB);
    assert.ok(verifyA.getTask('task-a-1'), 'A owns task-a-1');
    assert.equal(verifyB.getTask('task-a-1'), null, 'B must not see task-a-1');
    assert.ok(verifyB.getTask('task-b-1'), 'B owns task-b-1');
    assert.equal(verifyA.getTask('task-b-1'), null, 'A must not see task-b-1');
    assert.ok(verifyA.getQuestion('question-a-1'), 'A owns question-a-1');
    assert.equal(verifyB.getQuestion('question-a-1'), null, 'B must not see question-a-1');
    assert.equal(verifyA.getReview('review-b-1'), null, 'A must not see review-b-1');
    assert.ok(verifyB.getReview('review-b-1'), 'B owns review-b-1');
    assert.equal(verifyA.getRun('run-a-2'), null, 'rejected second run creates no row');

    // 时间重叠：A 的 pause finalize 与 B 的完成发生在各自 started_at 之后、对方 started_at 之前。
    const runA1 = verifyA.getRun('run-a-1')!;
    const runB1 = verifyB.getRun('run-b-1')!;
    assert.ok(runA1.completed_at !== null && runB1.completed_at !== null);
    assert.ok(runA1.completed_at! >= runB1.started_at, 'A completion must be after B start');
    assert.ok(runB1.completed_at! >= runA1.started_at, 'B completion must be after A start');
    assert.equal(runA1.agent_session_ref, SESSION_A);
    assert.equal(runA1.baseline_head, fixtureA.baselineHead);
    assert.equal(runB1.agent_session_ref, SESSION_B);
    assert.equal(runB1.baseline_head, fixtureB.baselineHead);
    assert.deepEqual(runA1.git_evidence, { staged: [], unstaged: [], untracked: ['impl-a.txt'] });
    assert.deepEqual(runB1.git_evidence, { staged: [], unstaged: [], untracked: ['impl-b.txt'] });
    assert.deepEqual(runA1.artifact_refs, [
      '.agent-room/artifacts/run-a-1/stdout.jsonl',
      '.agent-room/artifacts/run-a-1/stderr.log',
    ]);
    assert.deepEqual(runB1.artifact_refs, [
      '.agent-room/artifacts/run-b-1/stdout.jsonl',
      '.agent-room/artifacts/run-b-1/stderr.log',
    ]);
    assert.equal(existsSync(join(fixtureA.repo, '.agent-room', 'artifacts', 'run-a-1', 'stdout.jsonl')), true);
    assert.equal(existsSync(join(fixtureB.repo, '.agent-room', 'artifacts', 'run-b-1', 'stdout.jsonl')), true);
    assert.equal(git(fixtureA.repo, 'rev-parse', 'HEAD').trim(), fixtureA.baselineHead);
    assert.equal(git(fixtureB.repo, 'rev-parse', 'HEAD').trim(), fixtureB.baselineHead);
    verifyDbA.close();
    verifyDbB.close();
    await codexA.close();
    await codexB.close();
    await claudeA.close();
  } finally {
    await appA.close();
    await appB.close();
    dbA.close();
    dbB.close();
    rmSync(fixtureA.fixture, { recursive: true, force: true });
    rmSync(fixtureB.fixture, { recursive: true, force: true });
  }
});
