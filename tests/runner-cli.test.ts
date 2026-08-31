import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runCliMain, type RunCliIo } from '../src/cli/run.ts';
import { RoomService } from '../src/room/room-service.ts';
import { getRoomStateSnapshot } from '../src/room/state-snapshot.ts';
import {
  makeAttemptSettle,
  makeCodingResult,
  makeParticipant,
  makeQuestion,
  makeRoleAssignment,
  makeTask,
} from './fixtures.ts';
import {
  FakeClaudeProcess,
  makeSpawner,
  type FakeSpawn,
  type SpawnInvocation,
} from './runner-fixtures/claude-process-fake.ts';

// room:run one-shot CLI 的 black-box 测试：全部通过 runCliMain 的 main() seam 执行，注入
// recording io（stdout/stderr/exit）与 fake spawner，证明 v0.4 stdout {room,run,attempt}、
// exit 0/1 契约、preflight 拒绝与零副作用，而不调用真实 Claude CLI 或 process.exit。
// --run-id 与 fresh --attempt-id 是 v0.4 的显式 one-shot 输入；baseline 由 persisted Run
// 冻结值拥有（首 attempt clean gate 冻结 actual HEAD），caller 不能传 --baseline-head。
const SESSION_ID = 'sess-00000000-0000-4000-8000-000000000001';
const MCP_URL = 'http://127.0.0.1:8080/mcp/participants/p~claude-code-cli';

// v0.4 actor literal：与默认 bootstrap assignment 一致（测试侧独立 literal，不导入实现）。
const PLANNER = { participant_id: 'codex-app', actor_role: 'planner' as const };
const WORKER = { participant_id: 'claude-code-cli', actor_role: 'worker' as const };
const EXECUTOR = { participant_id: 'local-runner', actor_role: 'executor' as const };
const ORCHESTRATOR = { participant_id: 'codex-app', actor_role: 'orchestrator' as const };

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

// fixture 根放 file-backed database，repository 在 repo 子目录：db 文件不进入 worktree，
// 保持 room:run 启动前的 clean-baseline gate 前提。
function makeRepo(fixture: string): { repo: string; baselineHead: string } {
  const repo = join(fixture, 'repo');
  mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', '--local', 'commit.gpgsign', 'false');
  git(repo, 'config', '--local', 'core.autocrlf', 'false');
  writeFileSync(join(repo, 'seed.txt'), 'base');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
  return { repo, baselineHead: git(repo, 'rev-parse', 'HEAD').trim() };
}

// file-backed database：room-1 + 已提交 implementation task-1 + ready run-1。customWorker
// 非 null 时在 Run 创建前注册该 worker 并以 Room scope latest assignment 替换默认 worker
// assignment：Contract 规定 worker 在 Run 创建时解析冻结、assignment replacement 不得改写
// 既有 Run worker，而 task-scope assignment 要求 Task 已存在（Task 与 Run 同事务创建），
// 因此非默认 worker（含 Fix inc9-fr3/fr4 的 worker/2、`.`、`..` raw identity）只能在
// submitTask 前经 Room scope 生效并被 Run 冻结。
function makeReadyDb(
  fixture: string,
  customWorker: string | null = null,
): { dbPath: string; repo: string; baselineHead: string } {
  const { repo, baselineHead } = makeRepo(fixture);
  const dbPath = join(fixture, 'room.db');
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  if (customWorker !== null) {
    service.registerParticipant(
      makeParticipant({
        participant_id: customWorker,
        display_name: customWorker,
        kind: 'agent',
        provider: 'anthropic',
        adapter_id: 'claude_code_cli',
        capabilities: ['coding', 'questioning'],
      }),
      ORCHESTRATOR,
    );
    service.createRoleAssignment(
      makeRoleAssignment({
        assignment_id: `a-${customWorker}`,
        role: 'worker',
        participant_id: customWorker,
      }),
      ORCHESTRATOR,
    );
  }
  service.submitTask(makeTask(), PLANNER); // run-1 创建时冻结该 worker identity
  db.close();
  return { dbPath, repo, baselineHead };
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

function runArgs(dbPath: string, project: string, extra: string[] = []): string[] {
  return [
    '--db', dbPath,
    '--project', project,
    '--run-id', 'run-1',
    '--attempt-id', 'attempt-1',
    '--mcp-url', MCP_URL,
    ...extra,
  ];
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

test('successful run prints deterministic {room,run,attempt} JSON to stdout and exits 0', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-ok-'));
  const { dbPath, repo } = makeReadyDb(fixture);
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = autoSpawner(child, () => {
    child.stdout.write(`${initLine()}\n${resultLine()}\n`);
    child.stdout.end();
    child.stderr.end();
    child.emit('close', 0, null);
  });
  const { io, out } = recordingIo();
  try {
    await runCliMain(runArgs(dbPath, repo), { spawnProcess: spawner }, io);
    assert.equal(out.exitCode, 0);
    assert.equal(out.stderr, '');
    const payload = JSON.parse(out.stdout) as {
      room: { state: string };
      run: { status: string; run_id: string; worktree_path: string };
      attempt: { status: string; agent_session_ref: string | null; attempt_no: number };
    };
    assert.equal(payload.room.state, 'DISCUSSION'); // Room 保持 planning-only
    assert.equal(payload.run.status, 'review_required');
    assert.equal(payload.run.run_id, 'run-1');
    assert.equal(payload.attempt.status, 'succeeded');
    assert.equal(payload.attempt.agent_session_ref, SESSION_ID);
    assert.equal(payload.attempt.attempt_no, 1);

    // 首次 Implementation：无 --resume；exact MCP config 原样传给 process。
    const args = invocations[0].args;
    assert.ok(!args.includes('--resume'), 'new implementation must not resume');
    const mcpIndex = args.indexOf('--mcp-config');
    assert.ok(mcpIndex >= 0, 'mcp config must be passed');
    const mcpConfig = JSON.parse(args[mcpIndex + 1]) as {
      mcpServers: Record<string, { type: string; url: string; alwaysLoad: boolean }>;
    };
    assert.deepEqual(mcpConfig.mcpServers.agent_room, {
      type: 'http',
      url: MCP_URL,
      alwaysLoad: true,
    });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('failed run prints the same {room,run,attempt} JSON to stdout but exits 1 with empty stderr', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-fail-'));
  const { dbPath, repo } = makeReadyDb(fixture);
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    child.stdout.write(`${initLine()}\n`);
    child.stdout.end();
    child.stderr.end();
    child.emit('close', 1, null);
  });
  const { io, out } = recordingIo();
  try {
    await runCliMain(runArgs(dbPath, repo), { spawnProcess: spawner }, io);
    assert.equal(out.exitCode, 1, 'failed run must exit 1');
    assert.equal(out.stderr, '', 'terminal failure must still be reported on stdout');
    const payload = JSON.parse(out.stdout) as {
      room: { state: string };
      run: { status: string };
      attempt: { status: string; failure: { code: string } | null };
    };
    assert.equal(payload.room.state, 'DISCUSSION');
    assert.equal(payload.run.status, 'failed');
    assert.equal(payload.attempt.status, 'failed');
    assert.equal(payload.attempt.failure?.code, 'claude_exit_failed');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('paused needs-decision run prints {room,run,attempt} to stdout and exits 0', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-pause-'));
  const { dbPath, repo } = makeReadyDb(fixture);
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    // fake process 经第二个 file-backed connection 对 active attempt 调用 room_ask_question
    // 对应服务操作，与 Runner 测试中 in-memory 共享 service 等价，走真实 SQLite 持久化。
    const db = new DatabaseSync(dbPath);
    const service = new RoomService(db);
    service.askQuestion(makeQuestion(), WORKER);
    db.close();
    child.stdout.write(`${initLine()}\n${resultLine(SESSION_ID, makeCodingResult({ status: 'needs_decision' }))}\n`);
    child.stdout.end();
    child.stderr.end();
    child.emit('close', 0, null);
  });
  const { io, out } = recordingIo();
  try {
    await runCliMain(runArgs(dbPath, repo), { spawnProcess: spawner }, io);
    assert.equal(out.exitCode, 0, 'needs_decision is not a failure exit');
    assert.equal(out.stderr, '');
    const payload = JSON.parse(out.stdout) as {
      room: { state: string };
      run: { status: string };
      attempt: { status: string };
    };
    assert.equal(payload.room.state, 'DISCUSSION');
    assert.equal(payload.run.status, 'needs_decision');
    assert.equal(payload.attempt.status, 'needs_decision');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('retry continuation resumes the reliable session of the same Run', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-retry-'));
  const { repo, baselineHead } = makeRepo(fixture);
  const dbPath = join(fixture, 'room.db');
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER);
  service.claimRunAttempt(
    { attempt_id: 'attempt-1', run_id: 'run-1', room_id: 'room-1', worktree_path: repo, baseline_head: baselineHead },
    EXECUTOR,
  );
  service.settleRunAttempt(
    makeAttemptSettle({
      attempt_id: 'attempt-1',
      status: 'failed',
      result: null,
      failure: { code: 'claude_exit_failed', message: 'boom' },
      agent_session_ref: SESSION_ID,
      process_exit_code: 1,
    }),
    EXECUTOR,
  );
  service.retryRun('room-1', 'run-1', PLANNER); // ready
  db.close();
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = autoSpawner(child, () => {
    child.stdout.write(`${initLine(SESSION_ID)}\n${resultLine(SESSION_ID)}\n`);
    child.stdout.end();
    child.stderr.end();
    child.emit('close', 0, null);
  });
  const { io, out } = recordingIo();
  try {
    await runCliMain(
      runArgs(dbPath, repo, ['--attempt-id', 'attempt-2']),
      { spawnProcess: spawner },
      io,
    );
    assert.equal(out.exitCode, 0);
    assert.equal(out.stderr, '');
    const payload = JSON.parse(out.stdout) as {
      room: { state: string };
      run: { run_id: string; status: string };
      attempt: { attempt_no: number };
    };
    assert.equal(payload.room.state, 'DISCUSSION');
    assert.equal(payload.run.run_id, 'run-1');
    assert.equal(payload.run.status, 'review_required');
    assert.equal(payload.attempt.attempt_no, 2);
    const args = invocations[0].args;
    const resumeIndex = args.indexOf('--resume');
    assert.ok(resumeIndex >= 0, 'retry must resume the source session');
    assert.equal(args[resumeIndex + 1], SESSION_ID);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('missing required arguments write stderr and exit 1 without spawning', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-args-'));
  makeRepo(fixture);
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const { io, out } = recordingIo();
  try {
    await runCliMain([], { spawnProcess: spawner }, io);
    assert.equal(out.exitCode, 1);
    assert.equal(out.stdout, '');
    assert.match(out.stderr, /--db/);
    assert.equal(invocations.length, 0);
    await runCliMain(
      ['--db', join(fixture, 'room.db'), '--project', fixture, '--run-id', 'run-1', '--mcp-url', MCP_URL],
      { spawnProcess: spawner },
      io,
    );
    assert.equal(out.exitCode, 1);
    assert.match(out.stderr, /--attempt-id/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('a dirty first-attempt worktree fails the clean-baseline gate without spawning', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-clean-'));
  const { dbPath, repo } = makeReadyDb(fixture);
  writeFileSync(join(repo, 'dirty.txt'), 'x'); // 首 attempt clean gate 必须拒绝
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const { io, out } = recordingIo();
  try {
    await runCliMain(runArgs(dbPath, repo), { spawnProcess: spawner }, io);
    assert.equal(out.exitCode, 1);
    assert.equal(out.stdout, '');
    assert.match(out.stderr, /worktree_not_clean/);
    assert.equal(invocations.length, 0, 'preflight failure must not spawn');
    // 该失败不写 database：run-1 保持 ready，Room 保持 DISCUSSION。
    const db = new DatabaseSync(dbPath);
    const service = new RoomService(db);
    assert.equal(service.getRoom('room-1')!.state, 'DISCUSSION');
    assert.equal(service.getRun('run-1')!.status, 'ready');
    db.close();
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('missing database file writes stderr and exits 1 without creating it', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-missingdb-'));
  makeRepo(fixture);
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const { io, out } = recordingIo();
  try {
    const dbPath = join(fixture, 'missing.db');
    await runCliMain(runArgs(dbPath, fixture), { spawnProcess: spawner }, io);
    assert.equal(out.exitCode, 1);
    assert.equal(out.stdout, '');
    assert.match(out.stderr, /database file does not exist/);
    assert.equal(invocations.length, 0);
    assert.equal(existsSync(dbPath), false, 'missing db must not be created');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('an existing empty database file is rejected as not-a-Room-database and stays untouched', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-emptydb-'));
  makeRepo(fixture);
  const dbPath = join(fixture, 'room.db');
  writeFileSync(dbPath, '');
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const { io, out } = recordingIo();
  try {
    await runCliMain(runArgs(dbPath, fixture), { spawnProcess: spawner }, io);
    assert.equal(out.exitCode, 1);
    assert.equal(out.stdout, '');
    assert.match(out.stderr, /not an existing Room database/);
    assert.equal(invocations.length, 0);
    assert.equal(readFileSync(dbPath).length, 0, 'empty db file must not be schema-initialized');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('a non-Room SQLite file is rejected as not-a-Room-database and gains no Room tables', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-nonroom-'));
  makeRepo(fixture);
  const dbPath = join(fixture, 'room.db');
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE other (x TEXT)');
  db.close();
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const { io, out } = recordingIo();
  try {
    await runCliMain(runArgs(dbPath, fixture), { spawnProcess: spawner }, io);
    assert.equal(out.exitCode, 1);
    assert.match(out.stderr, /not an existing Room database/);
    assert.equal(invocations.length, 0);
    const probe = new DatabaseSync(dbPath, { readOnly: true });
    const row = probe.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rooms'").get();
    assert.equal(row, undefined, 'non-Room db must gain no rooms table');
    probe.close();
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('invalid MCP URLs write stderr and exit 1 before any spawn', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-url-'));
  const { dbPath } = makeReadyDb(fixture);
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const { io, out } = recordingIo();
  try {
    const urls = [
      'http://example.com/mcp/claude', // 非 loopback
      'http://127.0.0.1:8080/mcp/codex', // 错误 route（v0.2 route 已废弃）
      'http://127.0.0.1:8080/other', // 任意 path
      'http://127.0.0.1:8080/mcp/participants/p~claude-code-cli/', // 尾斜杠 ≠ 精确 route
      'http://127.0.0.1:8080/mcp/participants/claude-code-cli', // unframed candidate（Fix inc9-fr4）
      'ftp://127.0.0.1/mcp/claude', // 非 http(s)
      'http://127.0.0.1:8080/mcp/participants/p~claude-code-cli?x=1', // query 不允许
      'http://127.0.0.1:8080/mcp/participants/p~claude-code-cli#frag', // fragment 不允许
      'not-a-url', // 不可解析
    ];
    for (const mcpUrl of urls) {
      await runCliMain(
        ['--db', dbPath, '--project', fixture, '--run-id', 'run-1', '--attempt-id', 'attempt-1', '--mcp-url', mcpUrl],
        { spawnProcess: spawner },
        io,
      );
      assert.equal(out.exitCode, 1, `URL ${mcpUrl} must be rejected`);
      assert.equal(out.stdout, '', `URL ${mcpUrl} must not write stdout`);
      assert.ok(out.stderr.length > 0, `URL ${mcpUrl} must write stderr`);
    }
    assert.equal(invocations.length, 0, 'URL preflight failure must never spawn');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// Fix inc9-fr3/fr4 direct regression：Run 冻结 worker 为含斜杠的 worker/2 时，public
// room:run CLI 必须接受 canonical framed single-segment mcp-url（期望值 p~worker%2F2 是
// 测试侧 literal，不从 production route builder 导出）并完成 fake-process Run 与 terminal
// settlement；Run 持久化的 worker identity 保持 raw worker/2。
test('a slash worker identity accepts the canonical framed MCP URL and completes a run', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-slash-ok-'));
  const { dbPath, repo } = makeReadyDb(fixture, 'worker/2');
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = autoSpawner(child, () => {
    child.stdout.write(`${initLine()}\n${resultLine()}\n`);
    child.stdout.end();
    child.stderr.end();
    child.emit('close', 0, null);
  });
  const { io, out } = recordingIo();
  try {
    await runCliMain(
      runArgs(dbPath, repo, [
        '--mcp-url', 'http://127.0.0.1:8080/mcp/participants/p~worker%2F2',
      ]),
      { spawnProcess: spawner },
      io,
    );
    assert.equal(out.exitCode, 0);
    assert.equal(out.stderr, '');
    const payload = JSON.parse(out.stdout) as {
      room: { state: string };
      run: { status: string; worker_participant_id: string };
      attempt: { status: string };
    };
    assert.equal(payload.room.state, 'DISCUSSION');
    assert.equal(payload.run.status, 'review_required');
    assert.equal(payload.run.worker_participant_id, 'worker/2');
    assert.equal(payload.attempt.status, 'succeeded');
    // process 收到的 exact MCP config 使用 canonical framed URL。
    const args = invocations[0].args;
    const mcpIndex = args.indexOf('--mcp-config');
    assert.ok(mcpIndex >= 0, 'mcp config must be passed');
    const mcpConfig = JSON.parse(args[mcpIndex + 1]) as {
      mcpServers: Record<string, { url: string }>;
    };
    assert.equal(mcpConfig.mcpServers.agent_room.url, 'http://127.0.0.1:8080/mcp/participants/p~worker%2F2');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// Fix inc9-fr3/fr4 direct regression：raw 多 segment（/mcp/participants/worker/2）与 unframed
// encoded 单 segment（/mcp/participants/worker%2F2）都不是 canonical framed route，必须在
// spawn、attempt claim、Event/cursor 与 artifact 写入前失败；完整 durable read-model snapshot
// 逐字段不变，artifact owner path 不存在。
test('raw multi-segment and unframed encoded worker URLs fail the CLI preflight with zero side effects', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-slash-raw-'));
  const { dbPath, repo } = makeReadyDb(fixture, 'worker/2');
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const { io, out } = recordingIo();
  try {
    const probe = new DatabaseSync(dbPath);
    const probeService = new RoomService(probe);
    const before = getRoomStateSnapshot(probeService, { room_id: 'room-1' });
    probe.close();
    for (const mcpUrl of [
      'http://127.0.0.1:8080/mcp/participants/worker/2',
      'http://127.0.0.1:8080/mcp/participants/worker%2F2',
    ]) {
      await runCliMain(
        runArgs(dbPath, repo, ['--mcp-url', mcpUrl]),
        { spawnProcess: spawner },
        io,
      );
      assert.equal(out.exitCode, 1, `URL ${mcpUrl} must be rejected`);
      assert.equal(out.stdout, '');
      assert.match(out.stderr, /exact .* route/);
    }
    assert.equal(invocations.length, 0, 'URL preflight failure must never spawn');
    const afterDb = new DatabaseSync(dbPath);
    const afterService = new RoomService(afterDb);
    assert.deepEqual(
      getRoomStateSnapshot(afterService, { room_id: 'room-1' }),
      before,
      'durable read-model snapshot must stay unchanged',
    );
    assert.equal(afterService.getRun('run-1')!.status, 'ready', 'no attempt may be claimed');
    afterDb.close();
    assert.equal(existsSync(join(repo, '.agent-room')), false, 'no artifact owner path');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// Fix inc9-fr4 direct regression：`.`/`..` worker identity 的 canonical framed mcp-url（测试侧
// literal `p~.`/`p~..`）必须被 public room:run CLI 接受并完成 terminal settlement；Run 持久化
// 的 worker identity 保持 raw `.`/`..`，传给 process 的 exact MCP config 保持 framed URL。
test('a dot worker identity accepts the canonical framed MCP URL and completes a run', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-dot-ok-'));
  const { dbPath, repo } = makeReadyDb(fixture, '.');
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = autoSpawner(child, () => {
    child.stdout.write(`${initLine()}\n${resultLine()}\n`);
    child.stdout.end();
    child.stderr.end();
    child.emit('close', 0, null);
  });
  const { io, out } = recordingIo();
  try {
    await runCliMain(
      runArgs(dbPath, repo, [
        '--mcp-url', 'http://127.0.0.1:8080/mcp/participants/p~.',
      ]),
      { spawnProcess: spawner },
      io,
    );
    assert.equal(out.exitCode, 0);
    assert.equal(out.stderr, '');
    const payload = JSON.parse(out.stdout) as {
      room: { state: string };
      run: { status: string; worker_participant_id: string };
      attempt: { status: string };
    };
    assert.equal(payload.room.state, 'DISCUSSION');
    assert.equal(payload.run.status, 'review_required');
    assert.equal(payload.run.worker_participant_id, '.');
    assert.equal(payload.attempt.status, 'succeeded');
    const args = invocations[0].args;
    const mcpIndex = args.indexOf('--mcp-config');
    assert.ok(mcpIndex >= 0, 'mcp config must be passed');
    const mcpConfig = JSON.parse(args[mcpIndex + 1]) as {
      mcpServers: Record<string, { url: string }>;
    };
    assert.equal(mcpConfig.mcpServers.agent_room.url, 'http://127.0.0.1:8080/mcp/participants/p~.');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('a dotdot worker identity accepts the canonical framed MCP URL and completes a run', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-dotdot-ok-'));
  const { dbPath, repo } = makeReadyDb(fixture, '..');
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = autoSpawner(child, () => {
    child.stdout.write(`${initLine()}\n${resultLine()}\n`);
    child.stdout.end();
    child.stderr.end();
    child.emit('close', 0, null);
  });
  const { io, out } = recordingIo();
  try {
    await runCliMain(
      runArgs(dbPath, repo, [
        '--mcp-url', 'http://127.0.0.1:8080/mcp/participants/p~..',
      ]),
      { spawnProcess: spawner },
      io,
    );
    assert.equal(out.exitCode, 0);
    assert.equal(out.stderr, '');
    const payload = JSON.parse(out.stdout) as {
      room: { state: string };
      run: { status: string; worker_participant_id: string };
      attempt: { status: string };
    };
    assert.equal(payload.room.state, 'DISCUSSION');
    assert.equal(payload.run.status, 'review_required');
    assert.equal(payload.run.worker_participant_id, '..');
    assert.equal(payload.attempt.status, 'succeeded');
    const args = invocations[0].args;
    const mcpIndex = args.indexOf('--mcp-config');
    assert.ok(mcpIndex >= 0, 'mcp config must be passed');
    const mcpConfig = JSON.parse(args[mcpIndex + 1]) as {
      mcpServers: Record<string, { url: string }>;
    };
    assert.equal(mcpConfig.mcpServers.agent_room.url, 'http://127.0.0.1:8080/mcp/participants/p~..');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// Fix inc9-fr4 direct regression：unframed `.`/`..` mcp-url 被 WHATWG URL 归一化出
// participant route（/mcp/participants/ 与 /mcp/），不是 framed exact route，必须在 spawn、
// attempt claim、Event/cursor 与 artifact 写入前失败，durable snapshot 逐字段不变。
test('unframed dot worker URLs fail the CLI preflight with zero side effects', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-dot-raw-'));
  const { dbPath, repo } = makeReadyDb(fixture, '.');
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const { io, out } = recordingIo();
  try {
    const probe = new DatabaseSync(dbPath);
    const probeService = new RoomService(probe);
    const before = getRoomStateSnapshot(probeService, { room_id: 'room-1' });
    probe.close();
    for (const mcpUrl of [
      'http://127.0.0.1:8080/mcp/participants/.',
      'http://127.0.0.1:8080/mcp/participants/..',
    ]) {
      await runCliMain(
        runArgs(dbPath, repo, ['--mcp-url', mcpUrl]),
        { spawnProcess: spawner },
        io,
      );
      assert.equal(out.exitCode, 1, `URL ${mcpUrl} must be rejected`);
      assert.equal(out.stdout, '');
      assert.match(out.stderr, /exact .* route/);
    }
    assert.equal(invocations.length, 0, 'URL preflight failure must never spawn');
    const afterDb = new DatabaseSync(dbPath);
    const afterService = new RoomService(afterDb);
    assert.deepEqual(
      getRoomStateSnapshot(afterService, { room_id: 'room-1' }),
      before,
      'durable read-model snapshot must stay unchanged',
    );
    assert.equal(afterService.getRun('run-1')!.status, 'ready', 'no attempt may be claimed');
    afterDb.close();
    assert.equal(existsSync(join(repo, '.agent-room')), false, 'no artifact owner path');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('a missing run and a non-directory project write stderr and exit 1 without spawning', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-preflight-'));
  const { dbPath } = makeReadyDb(fixture);
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const { io, out } = recordingIo();
  try {
    await runCliMain(
      ['--db', dbPath, '--project', fixture, '--run-id', 'missing', '--attempt-id', 'attempt-1', '--mcp-url', MCP_URL],
      { spawnProcess: spawner },
      io,
    );
    assert.equal(out.exitCode, 1);
    assert.equal(out.stdout, '');
    assert.match(out.stderr, /run missing not found/);
    assert.equal(invocations.length, 0);

    await runCliMain(
      ['--db', dbPath, '--project', join(fixture, 'nope'), '--run-id', 'run-1', '--attempt-id', 'attempt-1', '--mcp-url', MCP_URL],
      { spawnProcess: spawner },
      io,
    );
    assert.equal(out.exitCode, 1);
    assert.match(out.stderr, /project directory does not exist/);
    assert.equal(invocations.length, 0);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('a non-repository project writes stderr and exits 1 before claiming an attempt', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-norepo-'));
  const dbPath = join(fixture, 'room.db');
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER);
  db.close();
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const { io, out } = recordingIo();
  try {
    await runCliMain(
      ['--db', dbPath, '--project', fixture, '--run-id', 'run-1', '--attempt-id', 'attempt-1', '--mcp-url', MCP_URL],
      { spawnProcess: spawner },
      io,
    );
    assert.equal(out.exitCode, 1);
    assert.equal(out.stdout, '');
    assert.match(out.stderr, /git_repository_missing/);
    assert.equal(invocations.length, 0);
    const readDb = new DatabaseSync(dbPath);
    const readService = new RoomService(readDb);
    assert.equal(readService.getRun('run-1')!.status, 'ready', 'non-repository must not claim');
    assert.equal(readService.getRoom('room-1')!.state, 'DISCUSSION');
    readDb.close();
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('a Run with an active attempt writes stderr and exits 1 without spawning', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-state-'));
  const { repo, baselineHead } = makeRepo(fixture);
  const dbPath = join(fixture, 'room.db');
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER);
  service.claimRunAttempt(
    { attempt_id: 'attempt-1', run_id: 'run-1', room_id: 'room-1', worktree_path: repo, baseline_head: baselineHead },
    EXECUTOR,
  ); // running
  db.close();
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const { io, out } = recordingIo();
  try {
    await runCliMain(
      runArgs(dbPath, repo, ['--attempt-id', 'attempt-2']),
      { spawnProcess: spawner },
      io,
    );
    assert.equal(out.exitCode, 1);
    assert.equal(out.stdout, '');
    assert.match(out.stderr, /run_already_active/);
    assert.equal(invocations.length, 0, 'unstartable state must not spawn');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
