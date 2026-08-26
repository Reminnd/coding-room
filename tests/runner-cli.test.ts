import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runCliMain, type RunCliIo } from '../src/cli/run.ts';
import { RoomService } from '../src/room/room-service.ts';
import { makeCodingResult, makeQuestion, makeRun, makeTask, makeTerminalEvidence } from './fixtures.ts';
import {
  FakeClaudeProcess,
  makeSpawner,
  type FakeSpawn,
  type SpawnInvocation,
} from './runner-fixtures/claude-process-fake.ts';

// room:run one-shot CLI 的 black-box 测试：全部通过 runCliMain 的 main() seam 执行，注入
// recording io（stdout/stderr/exit）与 fake spawner，证明 stdout {room,run}、exit 0/1 契约、
// preflight 拒绝与零副作用，而不调用真实 Claude CLI 或 process.exit。
const SESSION_ID = 'sess-00000000-0000-4000-8000-000000000001';
const MCP_URL = 'http://127.0.0.1:8080/mcp/claude';

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

// file-backed database 处于 PLAN_READY：room-1 + 已提交 implementation task-1。
function makeReadyDb(fixture: string): { dbPath: string; repo: string; baselineHead: string } {
  const { repo, baselineHead } = makeRepo(fixture);
  const dbPath = join(fixture, 'room.db');
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
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
    '--task-id', 'task-1',
    '--run-id', 'run-1',
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

test('successful run prints deterministic {room,run} JSON to stdout and exits 0', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-ok-'));
  const { dbPath, repo, baselineHead } = makeReadyDb(fixture);
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
      runArgs(dbPath, repo, ['--baseline-head', baselineHead]),
      { spawnProcess: spawner },
      io,
    );
    assert.equal(out.exitCode, 0);
    assert.equal(out.stderr, '');
    const payload = JSON.parse(out.stdout) as {
      room: { state: string };
      run: { status: string; run_id: string; claude_session_id: string | null };
    };
    assert.equal(payload.room.state, 'REVIEW_REQUIRED');
    assert.equal(payload.run.status, 'succeeded');
    assert.equal(payload.run.run_id, 'run-1');
    assert.equal(payload.run.claude_session_id, SESSION_ID);

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

test('failed run prints the same {room,run} JSON to stdout but exits 1 with empty stderr', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-fail-'));
  const { dbPath, repo, baselineHead } = makeReadyDb(fixture);
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    child.stdout.write(`${initLine()}\n`);
    child.stdout.end();
    child.stderr.end();
    child.emit('close', 1, null);
  });
  const { io, out } = recordingIo();
  try {
    await runCliMain(
      runArgs(dbPath, repo, ['--baseline-head', baselineHead]),
      { spawnProcess: spawner },
      io,
    );
    assert.equal(out.exitCode, 1, 'failed run must exit 1');
    assert.equal(out.stderr, '', 'terminal failure must still be reported on stdout');
    const payload = JSON.parse(out.stdout) as {
      room: { state: string };
      run: { status: string; failure: { code: string } | null };
    };
    assert.equal(payload.room.state, 'RUN_FAILED');
    assert.equal(payload.run.status, 'failed');
    assert.equal(payload.run.failure?.code, 'claude_exit_failed');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('paused needs-decision run prints {room,run} to stdout and exits 0', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-pause-'));
  const { dbPath, repo, baselineHead } = makeReadyDb(fixture);
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    // fake process 经第二个 file-backed connection 调用 room_ask_question 对应服务操作，
    // 与 Runner 测试中 in-memory 共享 service 等价，走真实 SQLite 持久化。
    const db = new DatabaseSync(dbPath);
    const service = new RoomService(db);
    service.askQuestion(makeQuestion());
    db.close();
    child.stdout.write(`${initLine()}\n${resultLine(SESSION_ID, makeCodingResult({ status: 'needs_decision' }))}\n`);
    child.stdout.end();
    child.stderr.end();
    child.emit('close', 0, null);
  });
  const { io, out } = recordingIo();
  try {
    await runCliMain(
      runArgs(dbPath, repo, ['--baseline-head', baselineHead]),
      { spawnProcess: spawner },
      io,
    );
    assert.equal(out.exitCode, 0, 'needs_decision is not a failure exit');
    assert.equal(out.stderr, '');
    const payload = JSON.parse(out.stdout) as {
      room: { state: string };
      run: { status: string };
    };
    assert.equal(payload.room.state, 'NEEDS_DECISION');
    assert.equal(payload.run.status, 'needs_decision');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('retry continuation succeeds without --baseline-head because the source run owns the baseline', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-retry-'));
  const { repo, baselineHead } = makeRepo(fixture);
  const dbPath = join(fixture, 'room.db');
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun({ baseline_head: baselineHead }));
  service.failRun(
    'run-1',
    { code: 'claude_exit_failed', message: 'boom' },
    makeTerminalEvidence({ claude_session_id: SESSION_ID, process_exit_code: 1 }),
  );
  service.retryAfterFailure('room-1'); // PLAN_READY
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
      runArgs(dbPath, repo, ['--run-id', 'run-2']), // 故意不传 --baseline-head
      { spawnProcess: spawner },
      io,
    );
    assert.equal(out.exitCode, 0);
    assert.equal(out.stderr, '');
    const payload = JSON.parse(out.stdout) as { room: { state: string }; run: { run_id: string } };
    assert.equal(payload.room.state, 'REVIEW_REQUIRED');
    assert.equal(payload.run.run_id, 'run-2');
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
      ['--db', join(fixture, 'room.db'), '--project', fixture, '--task-id', 'task-1', '--mcp-url', MCP_URL],
      { spawnProcess: spawner },
      io,
    );
    assert.equal(out.exitCode, 1);
    assert.match(out.stderr, /--run-id/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('missing --baseline-head for a first new implementation writes stderr and exits 1 without spawning', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-base-'));
  const { dbPath } = makeReadyDb(fixture);
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const { io, out } = recordingIo();
  try {
    await runCliMain(runArgs(dbPath, fixture), { spawnProcess: spawner }, io);
    assert.equal(out.exitCode, 1);
    assert.equal(out.stdout, '');
    assert.match(out.stderr, /--baseline-head .* required/);
    assert.equal(invocations.length, 0, 'preflight failure must not spawn');
    // 该失败不写 database：rooms/events 保持 submitTask 后的状态。
    const db = new DatabaseSync(dbPath);
    const service = new RoomService(db);
    assert.equal(service.getRoom('room-1')!.state, 'PLAN_READY');
    assert.equal(service.getRun('run-1'), null);
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
    await runCliMain(runArgs(dbPath, fixture, ['--baseline-head', 'deadbeef']), { spawnProcess: spawner }, io);
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
    await runCliMain(runArgs(dbPath, fixture, ['--baseline-head', 'deadbeef']), { spawnProcess: spawner }, io);
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
    await runCliMain(runArgs(dbPath, fixture, ['--baseline-head', 'deadbeef']), { spawnProcess: spawner }, io);
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
  const { dbPath, baselineHead } = makeReadyDb(fixture);
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const { io, out } = recordingIo();
  try {
    const urls = [
      'http://example.com/mcp/claude', // 非 loopback
      'http://127.0.0.1:8080/mcp/codex', // 错误 route
      'http://127.0.0.1:8080/other', // 任意 path
      'http://127.0.0.1:8080/mcp/claude/', // 尾斜杠 ≠ 精确 route
      'ftp://127.0.0.1/mcp/claude', // 非 http(s)
      'http://127.0.0.1:8080/mcp/claude?x=1', // query 不允许
      'not-a-url', // 不可解析
    ];
    for (const mcpUrl of urls) {
      await runCliMain(
        ['--db', dbPath, '--project', fixture, '--task-id', 'task-1', '--run-id', 'run-1', '--mcp-url', mcpUrl, '--baseline-head', baselineHead],
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

test('missing task and non-directory project write stderr and exit 1 without spawning', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-preflight-'));
  const { dbPath, baselineHead } = makeReadyDb(fixture);
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const { io, out } = recordingIo();
  try {
    await runCliMain(
      ['--db', dbPath, '--project', fixture, '--task-id', 'missing', '--run-id', 'run-1', '--mcp-url', MCP_URL, '--baseline-head', baselineHead],
      { spawnProcess: spawner },
      io,
    );
    assert.equal(out.exitCode, 1);
    assert.equal(out.stdout, '');
    assert.match(out.stderr, /task missing not found/);
    assert.equal(invocations.length, 0);

    await runCliMain(
      ['--db', dbPath, '--project', join(fixture, 'nope'), '--task-id', 'task-1', '--run-id', 'run-1', '--mcp-url', MCP_URL, '--baseline-head', baselineHead],
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

test('a non-repository project writes stderr and exits 1 before creating a Run', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-norepo-'));
  const dbPath = join(fixture, 'room.db');
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  db.close();
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const { io, out } = recordingIo();
  try {
    await runCliMain(
      ['--db', dbPath, '--project', fixture, '--task-id', 'task-1', '--run-id', 'run-1', '--mcp-url', MCP_URL, '--baseline-head', 'deadbeef'],
      { spawnProcess: spawner },
      io,
    );
    assert.equal(out.exitCode, 1);
    assert.equal(out.stdout, '');
    assert.match(out.stderr, /git_repository_missing/);
    assert.equal(invocations.length, 0);
    const readDb = new DatabaseSync(dbPath);
    const readService = new RoomService(readDb);
    assert.equal(readService.getRun('run-1'), null, 'non-repository must not create a Run');
    assert.equal(readService.getRoom('room-1')!.state, 'PLAN_READY');
    readDb.close();
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('a Room in an unstartable state writes stderr and exits 1 without spawning', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runcli-state-'));
  const { repo, baselineHead } = makeRepo(fixture);
  const dbPath = join(fixture, 'room.db');
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun({ baseline_head: baselineHead })); // CODING
  db.close();
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const { io, out } = recordingIo();
  try {
    await runCliMain(
      runArgs(dbPath, repo, ['--baseline-head', baselineHead]),
      { spawnProcess: spawner },
      io,
    );
    assert.equal(out.exitCode, 1);
    assert.equal(out.stdout, '');
    assert.match(out.stderr, /cannot start a run/);
    assert.equal(invocations.length, 0, 'unstartable state must not spawn');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
