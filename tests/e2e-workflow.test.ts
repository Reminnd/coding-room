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
import {
  makeCodingResult,
  makeFinding,
  makeFixTask,
  makeReview,
  makeTask,
} from './fixtures.ts';
import {
  FakeClaudeProcess,
  type FakeSpawn,
  type SpawnInvocation,
} from './runner-fixtures/claude-process-fake.ts';

// 完整验收 workflow 的端到端测试：file-backed SQLite + representative temporary Git
// repository + actual loopback MCP（Codex 侧真实 HTTP）+ fake Claude process（Runner 侧
// 可注入 spawn seam）。所有 CLI 动作都经 room:run 的 main() seam 执行，与真实 one-shot
// 调用同一条代码路径。
const SESSION_ID = 'sess-00000000-0000-4000-8000-000000000001';
const REPLACEMENT_SESSION = 'sess-00000000-0000-4000-8000-000000000002';

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

// fixture 根放 file-backed database；repository 在 repo 子目录，避免 room.db 作为 untracked
// 文件污染 worktree 而违反 room:run 的 clean-baseline start gate。
function makeFixture(): { fixture: string; repo: string; baselineHead: string } {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-e2e-'));
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

// 只读 public snapshot：room/current entity/cursor/全量 Event 都来自 MCP route。
async function snapshot(client: Client, roomId: string): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name: 'room_get_state', arguments: { room_id: roomId } });
  assert.equal(result.isError, undefined);
  const state = result.structuredContent;
  assert.ok(typeof state === 'object' && state !== null);
  return state as Record<string, unknown>;
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

function initLine(sessionId = SESSION_ID): string {
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

function resultLine(sessionId = SESSION_ID, codingResult = makeCodingResult()): string {
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

// 挂到 setImmediate 的 drive：确保 startClaudeProcess 同步挂载 handler 后才写 stdout/close。
function autoSpawner(
  child: FakeClaudeProcess,
  drive: () => void,
): { spawner: FakeSpawn; invocations: SpawnInvocation[] } {
  const invocations: SpawnInvocation[] = [];
  const spawner: FakeSpawn = (command, args, options) => {
    invocations.push({ command, args, options });
    setImmediate(drive);
    return child as unknown as ChildProcess;
  };
  return { spawner, invocations };
}

// 经 room:run 的 main() seam 执行一次 one-shot 调用：v0.4 显式输入 --run-id 与 fresh
// --attempt-id；baseline 由 persisted Run 冻结值拥有，caller 不能传 --baseline-head。
async function runCli(
  url: string,
  dbPath: string,
  fixture: string,
  runId: string,
  attemptId: string,
  spawnProcess: FakeSpawn,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  const args = [
    '--db', dbPath,
    '--project', fixture,
    '--run-id', runId,
    '--attempt-id', attemptId,
    '--mcp-url', `${url}/mcp/participants/p~claude-code-cli`,
  ];
  const { io, out } = recordingIo();
  await runCliMain(args, { spawnProcess }, io);
  return out;
}

test('full workflow: Implementation -> Review(finding) -> Fix resume -> Review(approved) -> ACCEPTED', async () => {
  const { fixture, repo, baselineHead } = makeFixture();
  const dbPath = join(fixture, 'room.db');
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  const { url, close } = await startApp(service, repo);
  const codex = await connect(url, '/mcp/participants/p~codex-app');
  try {
    // 1. Codex 创建 Room 并完成 planning gate。
    const created = await codex.callTool({ name: 'room_create', arguments: { room_id: 'room-1' } });
    assert.equal((created.structuredContent as { created: boolean }).created, true);
    await codex.callTool({ name: 'room_begin_architecture_review', arguments: { room_id: 'room-1' } });
    await codex.callTool({ name: 'room_request_user_confirmation', arguments: { room_id: 'room-1' } });
    const task = await codex.callTool({
      name: 'room_submit_task',
      arguments: makeTask() as unknown as Record<string, unknown>,
    });
    assert.equal(task.isError, undefined);

    // 2. one-shot CLI 执行首次 Implementation（clean-baseline start）。
    const child1 = new FakeClaudeProcess();
    const { spawner: spawner1, invocations: invocations1 } = autoSpawner(child1, () => {
      writeFileSync(join(repo, 'impl-a.txt'), 'impl');
      child1.stdout.write(`${initLine()}\n${resultLine()}\n`);
      child1.stdout.end();
      child1.stderr.end();
      child1.emit('close', 0, null);
    });
    const run1 = await runCli(url, dbPath, repo, 'run-1', 'attempt-1', spawner1);
    assert.equal(run1.exitCode, 0);
    const payload1 = JSON.parse(run1.stdout) as {
      room: { state: string };
      run: { status: string };
      attempt: { status: string };
    };
    assert.equal(payload1.room.state, 'DISCUSSION'); // Room 保持 planning-only
    assert.equal(payload1.run.status, 'review_required');
    assert.equal(payload1.attempt.status, 'succeeded');
    assert.ok(!invocations1[0].args.includes('--resume'), 'first implementation must not resume');

    // 3. Codex Review 提交 finding → confirmed Fix Task。
    const review1 = await codex.callTool({
      name: 'room_submit_review',
      arguments: makeReview({ decision: 'changes_requested', findings: [makeFinding()] }) as unknown as Record<string, unknown>,
    });
    assert.equal(review1.isError, undefined);
    const fix = await codex.callTool({
      name: 'room_submit_task',
      arguments: makeFixTask({ task_id: 'task-2' }) as unknown as Record<string, unknown>,
    });
    assert.equal(fix.isError, undefined);

    // 4. one-shot CLI 以 exact session/exact baseline resume 执行 Fix。
    const child2 = new FakeClaudeProcess();
    const { spawner: spawner2, invocations: invocations2 } = autoSpawner(child2, () => {
      writeFileSync(join(repo, 'fix-a.txt'), 'fix');
      child2.stdout.write(`${initLine(SESSION_ID)}\n${resultLine(SESSION_ID, makeCodingResult({ task_id: 'task-2' }))}\n`);
      child2.stdout.end();
      child2.stderr.end();
      child2.emit('close', 0, null);
    });
    const run2 = await runCli(url, dbPath, repo, 'run-1', 'attempt-2', spawner2);
    assert.equal(run2.exitCode, 0);
    const payload2 = JSON.parse(run2.stdout) as {
      room: { state: string };
      run: { status: string };
      attempt: { status: string };
    };
    assert.equal(payload2.room.state, 'DISCUSSION');
    assert.equal(payload2.run.status, 'review_required');
    assert.equal(payload2.attempt.status, 'succeeded');
    const resumeIndex = invocations2[0].args.indexOf('--resume');
    assert.ok(resumeIndex >= 0, 'fix continuation must resume');
    assert.equal(invocations2[0].args[resumeIndex + 1], SESSION_ID, 'fix must resume the exact lineage session');

    // 5. approved Review + 用户 accept → ACCEPTED。
    const review2 = await codex.callTool({
      name: 'room_submit_review',
      arguments: makeReview({ review_id: 'review-2', attempt_id: 'attempt-2', task_id: 'task-2', decision: 'approved' }) as unknown as Record<string, unknown>,
    });
    assert.equal(review2.isError, undefined);
    const accept = await codex.callTool({
      name: 'room_accept_review',
      arguments: { review_id: 'review-2', confirmed_by_user: true },
    });
    assert.equal(accept.isError, undefined);

    // 6. final snapshot：planning state、per-Run work item、cursor 与完整 Event 序列。
    const finalState = await snapshot(codex, 'room-1');
    assert.equal((finalState.room as { state: string }).state, 'DISCUSSION');
    const workItems = finalState.run_work_items as {
      run_id: string;
      run_status: string;
      waiting_actor: string | null;
      current_task_id: string | null;
      current_attempt_id: string | null;
      current_review_id: string | null;
    }[];
    assert.equal(workItems.length, 1);
    assert.deepEqual(workItems[0], {
      run_id: 'run-1',
      run_status: 'accepted',
      waiting_actor: null,
      current_task_id: 'task-2',
      current_attempt_id: 'attempt-2',
      current_review_id: 'review-2',
      current_question_id: null,
    });
    assert.equal(finalState.cursor, 13);
    const events = finalState.events as { type: string; sequence: number }[];
    assert.equal(events.length, 13);
    assert.equal(events[events.length - 1].type, 'review_accepted');
    assert.equal(events.filter((e) => e.type === 'run_attempt_claimed').length, 2);
    assert.equal(events.filter((e) => e.type === 'run_attempt_succeeded').length, 2);
    assert.equal(events.filter((e) => e.type === 'task_submitted').length, 2);
    assert.equal(events.filter((e) => e.type === 'review_submitted').length, 2);

    // 7. durable 证据从 file-backed SQLite 的第二个连接验证：attempt session/baseline 连续、
    // Git evidence 精确、artifact refs 与磁盘文件一致。连接用完即关，避免 Windows 下
    // file handle 阻塞临时目录删除。
    const verifyDb = new DatabaseSync(dbPath);
    const verify = new RoomService(verifyDb);
    const run1Row = verify.getRun('run-1')!;
    const attempt1Row = verify.getAttempt('attempt-1')!;
    const attempt2Row = verify.getAttempt('attempt-2')!;
    assert.equal(run1Row.status, 'accepted');
    assert.equal(attempt1Row.agent_session_ref, SESSION_ID);
    assert.equal(attempt1Row.baseline_head, baselineHead);
    assert.equal(attempt2Row.agent_session_ref, SESSION_ID, 'fix attempt must reuse the lineage session');
    assert.equal(attempt2Row.baseline_head, baselineHead, 'fix attempt must inherit the source baseline');
    assert.deepEqual(attempt1Row.git_evidence, { staged: [], unstaged: [], untracked: ['impl-a.txt'] });
    // attempt-2 的 completion evidence 在 attempt-1 已写 artifact 之后采集：.agent-room/ 是
    // 未版本化 runtime 目录，attempt-1 的 artifact 文件以 untracked 出现在 attempt-2 evidence
    // 中（porcelain 排序），而 attempt-2 自己的 artifact 在其 evidence 采集后才写入。
    assert.deepEqual(attempt2Row.git_evidence, {
      staged: [],
      unstaged: [],
      untracked: [
        '.agent-room/artifacts/attempt-1/stderr.log',
        '.agent-room/artifacts/attempt-1/stdout.jsonl',
        'fix-a.txt',
        'impl-a.txt',
      ],
    });
    assert.deepEqual(attempt2Row.artifact_refs, [
      '.agent-room/artifacts/attempt-2/stdout.jsonl',
      '.agent-room/artifacts/attempt-2/stderr.log',
    ]);
    assert.equal(existsSync(join(repo, '.agent-room', 'artifacts', 'attempt-1', 'stdout.jsonl')), true);
    assert.equal(existsSync(join(repo, '.agent-room', 'artifacts', 'attempt-2', 'stdout.jsonl')), true);
    verifyDb.close();
    await codex.close();
  } finally {
    await close();
    db.close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('failure recovery: failed run -> room_retry_run -> one-shot retry preserves worktree and resumes exactly', async () => {
  const { fixture, repo, baselineHead } = makeFixture();
  const dbPath = join(fixture, 'room.db');
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  const { url, close } = await startApp(service, repo);
  const codex = await connect(url, '/mcp/participants/p~codex-app');
  try {
    await codex.callTool({ name: 'room_create', arguments: { room_id: 'room-1' } });
    await codex.callTool({ name: 'room_begin_architecture_review', arguments: { room_id: 'room-1' } });
    await codex.callTool({ name: 'room_request_user_confirmation', arguments: { room_id: 'room-1' } });
    await codex.callTool({
      name: 'room_submit_task',
      arguments: makeTask() as unknown as Record<string, unknown>,
    });

    // 1. 首次 run 失败：non-zero exit，且失败期间产生可观察 worktree 变更。
    const child1 = new FakeClaudeProcess();
    const { spawner: spawner1 } = autoSpawner(child1, () => {
      writeFileSync(join(repo, 'impl-wip.txt'), 'wip');
      child1.stdout.write(`${initLine()}\n`);
      child1.stdout.end();
      child1.stderr.end();
      child1.emit('close', 1, null);
    });
    const failed = await runCli(url, dbPath, repo, 'run-1', 'attempt-1', spawner1);
    assert.equal(failed.exitCode, 1, 'failed attempt must exit 1');
    assert.equal(failed.stderr, '', 'terminal failure is reported on stdout');
    const failedPayload = JSON.parse(failed.stdout) as {
      room: { state: string };
      run: { status: string };
      attempt: { status: string };
    };
    assert.equal(failedPayload.room.state, 'DISCUSSION');
    assert.equal(failedPayload.run.status, 'failed');
    assert.equal(failedPayload.attempt.status, 'failed');
    assert.equal(existsSync(join(repo, 'impl-wip.txt')), true, 'failed attempt keeps its worktree change');

    // 2. Codex 经 actual MCP room_retry_run 把 Run 返回 ready。
    const retry = await codex.callTool({ name: 'room_retry_run', arguments: { room_id: 'room-1', run_id: 'run-1' } });
    assert.equal((retry.structuredContent as { run: { status: string } }).run.status, 'ready');

    // 3. one-shot retry：同一 Run、同一 session、继承 baseline；dirty worktree 被保留。
    const child2 = new FakeClaudeProcess();
    const { spawner: spawner2, invocations: invocations2 } = autoSpawner(child2, () => {
      writeFileSync(join(repo, 'retry-ok.txt'), 'ok');
      child2.stdout.write(`${initLine(SESSION_ID)}\n${resultLine()}\n`);
      child2.stdout.end();
      child2.stderr.end();
      child2.emit('close', 0, null);
    });
    const ok = await runCli(url, dbPath, repo, 'run-1', 'attempt-2', spawner2);
    assert.equal(ok.exitCode, 0);
    const okPayload = JSON.parse(ok.stdout) as {
      room: { state: string };
      run: { status: string };
      attempt: { status: string };
    };
    assert.equal(okPayload.room.state, 'DISCUSSION');
    assert.equal(okPayload.run.status, 'review_required');
    assert.equal(okPayload.attempt.status, 'succeeded');
    const resumeIndex = invocations2[0].args.indexOf('--resume');
    assert.ok(resumeIndex >= 0, 'retry must resume the source session');
    assert.equal(invocations2[0].args[resumeIndex + 1], SESSION_ID);

    // 4. durable 证据：HEAD 未变、baseline/session 继承、失败变更与新变更都在 evidence 中。
    assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), baselineHead, 'retry must not change HEAD');
    assert.equal(existsSync(join(repo, 'impl-wip.txt')), true, 'retry must preserve the failed attempt change');
    const verifyDb = new DatabaseSync(dbPath);
    const verify = new RoomService(verifyDb);
    const run1Row = verify.getRun('run-1')!;
    const attempt1Row = verify.getAttempt('attempt-1')!;
    const attempt2Row = verify.getAttempt('attempt-2')!;
    assert.equal(run1Row.status, 'review_required'); // retry 后同一 Run 进入 review
    assert.equal(attempt1Row.status, 'failed');
    assert.equal(attempt1Row.baseline_head, baselineHead);
    assert.equal(attempt2Row.status, 'succeeded');
    assert.equal(attempt2Row.agent_session_ref, SESSION_ID);
    assert.equal(attempt2Row.baseline_head, baselineHead, 'retry must inherit the lineage baseline');
    assert.deepEqual(attempt1Row.git_evidence, { staged: [], unstaged: [], untracked: ['impl-wip.txt'] });
    // attempt-2 的 evidence 包含 attempt-1（失败 attempt 同样写 artifact）的 artifact 文件；
    // attempt-2 自身的 artifact 在其 evidence 采集后写入，不出现。
    assert.deepEqual(attempt2Row.git_evidence, {
      staged: [],
      unstaged: [],
      untracked: [
        '.agent-room/artifacts/attempt-1/stderr.log',
        '.agent-room/artifacts/attempt-1/stdout.jsonl',
        'impl-wip.txt',
        'retry-ok.txt',
      ],
    });
    const state = await snapshot(codex, 'room-1');
    const events = state.events as { type: string }[];
    assert.equal(events.filter((e) => e.type === 'task_submitted').length, 1, 'retry must not create a new task');
    assert.equal(events.filter((e) => e.type === 'run_retried').length, 1);
    assert.equal(events.filter((e) => e.type === 'run_attempt_failed').length, 1);
    assert.equal(events.filter((e) => e.type === 'run_attempt_succeeded').length, 1);
    verifyDb.close();
    await codex.close();
  } finally {
    await close();
    db.close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('retry with an empty source session creates a replacement session without --resume', async () => {
  const { fixture, repo, baselineHead } = makeFixture();
  const dbPath = join(fixture, 'room.db');
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  const { url, close } = await startApp(service, repo);
  const codex = await connect(url, '/mcp/participants/p~codex-app');
  try {
    await codex.callTool({ name: 'room_create', arguments: { room_id: 'room-1' } });
    await codex.callTool({ name: 'room_begin_architecture_review', arguments: { room_id: 'room-1' } });
    await codex.callTool({ name: 'room_request_user_confirmation', arguments: { room_id: 'room-1' } });
    await codex.callTool({
      name: 'room_submit_task',
      arguments: makeTask() as unknown as Record<string, unknown>,
    });

    // 1. 首次 run 在 init 前失败：source session 缺失（null）。
    const child1 = new FakeClaudeProcess();
    const { spawner: spawner1 } = autoSpawner(child1, () => {
      child1.stdout.end();
      child1.stderr.end();
      child1.emit('close', 1, null);
    });
    const failed = await runCli(url, dbPath, repo, 'run-1', 'attempt-1', spawner1);
    assert.equal(failed.exitCode, 1);
    const failedPayload = JSON.parse(failed.stdout) as { attempt: { agent_session_ref: string | null } };
    assert.equal(failedPayload.attempt.agent_session_ref, null, 'failed attempt persists no session');

    await codex.callTool({ name: 'room_retry_run', arguments: { room_id: 'room-1', run_id: 'run-1' } });

    // 2. retry：无 --resume，Claude 创建 replacement session，仍继承 baseline 与 Task lineage。
    const child2 = new FakeClaudeProcess();
    const { spawner: spawner2, invocations: invocations2 } = autoSpawner(child2, () => {
      child2.stdout.write(`${initLine(REPLACEMENT_SESSION)}\n${resultLine(REPLACEMENT_SESSION)}\n`);
      child2.stdout.end();
      child2.stderr.end();
      child2.emit('close', 0, null);
    });
    const ok = await runCli(url, dbPath, repo, 'run-1', 'attempt-2', spawner2);
    assert.equal(ok.exitCode, 0);
    const args = invocations2[0].args;
    assert.ok(!args.includes('--resume'), 'empty source session must omit --resume');
    assert.ok(!args.includes('--continue'), 'must never use --continue');

    const verifyDb = new DatabaseSync(dbPath);
    const verify = new RoomService(verifyDb);
    const attempt2Row = verify.getAttempt('attempt-2')!;
    assert.equal(attempt2Row.status, 'succeeded');
    assert.equal(attempt2Row.agent_session_ref, REPLACEMENT_SESSION);
    assert.equal(attempt2Row.baseline_head, baselineHead, 'replacement session still inherits the baseline');
    const state = await snapshot(codex, 'room-1');
    const events = state.events as { type: string }[];
    assert.equal(events.filter((e) => e.type === 'task_submitted').length, 1, 'replacement session keeps the task lineage');
    verifyDb.close();
    await codex.close();
  } finally {
    await close();
    db.close();
    rmSync(fixture, { recursive: true, force: true });
  }
});
