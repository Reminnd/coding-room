import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runClaude, type ClaudeRunnerInput } from '../src/runner/claude-runner.ts';
import { RoomService } from '../src/room/room-service.ts';
import {
  makeCodingResult,
  makeFixTask,
  makeFinding,
  makeQuestion,
  makeReview,
  makeRun,
  makeTask,
  makeTerminalEvidence,
} from './fixtures.ts';
import {
  FakeClaudeProcess,
  makeSpawner,
  makeThrowingSpawner,
  whenStdinError,
  whenStdinFinished,
  type FakeSpawn,
  type SpawnInvocation,
} from './runner-fixtures/claude-process-fake.ts';

// 测试侧独立 literal：session/tool/task 与证据期望来自 Contract/计划冻结值，不从实现导入。
const SESSION_ID = 'sess-00000000-0000-4000-8000-000000000001';
const REQUIRED_TOOL = 'mcp__agent_room__room_ask_question';
const TASK_ID = 'task-1';
const MCP_CONFIG = '{"mcpServers":{"agent-room":{"command":"node","args":["server.js"]}}}';
const ARTIFACT_STDOUT = '.agent-room/artifacts/run-1/stdout.jsonl';
const ARTIFACT_STDERR = '.agent-room/artifacts/run-1/stderr.log';

// 用独立 git CLI 设置 temp repo fixture。fixture 内的 init/config/add/commit 只出现在
// test code；product Runner 不得调用任何 git mutation command。
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

// 建立 clean repo 并预置两个 tracked 文件，使 staged/unstaged/untracked 三类证据可在
// baseline 之后被精确区分。
function makeRepo(): { fixture: string; baselineHead: string } {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runner-'));
  git(fixture, 'init', '-q', '-b', 'main');
  git(fixture, 'config', '--local', 'commit.gpgsign', 'false');
  git(fixture, 'config', '--local', 'core.autocrlf', 'false');
  writeFileSync(join(fixture, 'seed.txt'), 'base');
  writeFileSync(join(fixture, 'unstaged.txt'), 'base');
  git(fixture, 'add', '.');
  git(fixture, 'commit', '-q', '-m', 'base');
  const baselineHead = git(fixture, 'rev-parse', 'HEAD').trim();
  return { fixture, baselineHead };
}

// 准备一个已提交 Implementation Task 的 RoomService，使 getTask/startRun 有持久化实体。
function makeService(): RoomService {
  const db = new DatabaseSync(':memory:');
  const service = new RoomService(db);
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  return service;
}

// 完整 Implementation -> Review(changes_requested) -> Fix Task 链路，使 current Task 为
// fix task-2；用于验证 runClaude 对 stale task-1 的 current Task guard。
function makeFixReadyService(): RoomService {
  const db = new DatabaseSync(':memory:');
  const service = new RoomService(db);
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask()); // task-1, PLAN_READY
  service.startRun(makeRun()); // run-1, CODING
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence()); // REVIEW_REQUIRED
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] })); // REVIEW_DISCUSSION
  service.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', parent_task_id: 'task-1', based_on_review_id: 'review-1' }),
  ); // FIX_PLAN_READY, current task = task-2
  return service;
}

// 建立 decision resume 前置：task-1 已完成 askQuestion + pause finalization + answer(false)，
// 使 Room 保持 NEEDS_DECISION、source Run 为 needs_decision 且带 non-empty session。
function makeDecisionReadyService(baselineHead: string): RoomService {
  const db = new DatabaseSync(':memory:');
  const service = new RoomService(db);
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask()); // task-1, PLAN_READY
  service.startRun(makeRun({ baseline_head: baselineHead })); // run-1, CODING
  service.askQuestion(makeQuestion()); // NEEDS_DECISION, run-1 needs_decision
  service.finalizeNeedsDecision(
    'run-1',
    makeCodingResult({ status: 'needs_decision' }),
    null,
    makeTerminalEvidence({ claude_session_id: SESSION_ID, process_exit_code: 0 }),
  );
  service.answerQuestion('question-1', 'pick opt-a', false); // answered, NEEDS_DECISION
  return service;
}

// 建立 fix resume 前置：task-1 completed -> review(changes_requested) -> fix task-2，
// source Run run-1 succeeded 且带 non-empty session，current task = task-2。
function makeFixContinuationReadyService(baselineHead: string): RoomService {
  const db = new DatabaseSync(':memory:');
  const service = new RoomService(db);
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask()); // task-1, PLAN_READY
  service.startRun(makeRun({ baseline_head: baselineHead })); // run-1, CODING
  service.completeRun(
    'run-1',
    makeCodingResult(),
    makeTerminalEvidence({ claude_session_id: SESSION_ID, process_exit_code: 0 }),
  ); // REVIEW_REQUIRED, run-1 succeeded + session
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] })); // REVIEW_DISCUSSION
  service.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', parent_task_id: 'task-1', based_on_review_id: 'review-1' }),
  ); // FIX_PLAN_READY, current task = task-2
  return service;
}

function makeInput(
  service: RoomService,
  fixture: string,
  baselineHead: string,
  overrides: Partial<ClaudeRunnerInput> = {},
): ClaudeRunnerInput {
  return {
    roomService: service,
    runId: 'run-1',
    taskId: TASK_ID,
    targetWorktree: fixture,
    expectedBaselineHead: baselineHead,
    mcpConfig: MCP_CONFIG,
    ...overrides,
  };
}

function line(event: Record<string, unknown>): string {
  return JSON.stringify(event);
}

function initLine(
  sessionId = SESSION_ID,
  tools: string[] = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', REQUIRED_TOOL],
): string {
  return line({
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    tools,
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

function writeLines(child: FakeClaudeProcess, lines: string[]): void {
  child.stdout.write(lines.join('\n') + '\n');
  child.stdout.end();
  child.stderr.end();
}

// 把 drive 挂到 setImmediate，确保在 startClaudeProcess 同步挂载 handler 后才写 stdout/close。
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

function errCode(err: unknown): string | null {
  return (err as { code?: string }).code ?? null;
}

// central failure settlement 的单一断言：唯一 failure mapping、一次 run_failed、零次
// run_completed，且 Room=RUN_FAILED、Run=failed。
function assertFailure(
  service: RoomService,
  result: { run: { status: string; failure: { code: string } | null }; room: { state: string } },
  code: string,
): void {
  assert.equal(result.room.state, 'RUN_FAILED');
  assert.equal(result.run.status, 'failed');
  assert.equal(result.run.failure?.code, code);
  const events = service.listEvents('room-1');
  assert.equal(events.filter((e) => e.type === 'run_failed').length, 1, 'exactly one run_failed event');
  assert.equal(events.filter((e) => e.type === 'run_completed').length, 0, 'zero run_completed events');
}

test('non-repository target rejects with git_repository_missing before creating a Run', async () => {
  const service = makeService();
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runner-norepo-'));
  try {
    await assert.rejects(
      () => runClaude(makeInput(service, fixture, 'deadbeef')),
      (err: unknown) => errCode(err) === 'git_repository_missing',
    );
    assert.equal(service.getRun('run-1'), null);
    assert.equal(service.getRoom('room-1')!.state, 'PLAN_READY');
    assert.equal(existsSync(join(fixture, '.agent-room')), false);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('unborn HEAD rejects with git_head_missing before creating a Run', async () => {
  const service = makeService();
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runner-unborn-'));
  git(fixture, 'init', '-q', '-b', 'main');
  try {
    await assert.rejects(
      () => runClaude(makeInput(service, fixture, 'deadbeef')),
      (err: unknown) => errCode(err) === 'git_head_missing',
    );
    assert.equal(service.getRun('run-1'), null);
    assert.equal(service.getRoom('room-1')!.state, 'PLAN_READY');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('dirty worktree rejects with worktree_not_clean before creating a Run', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  writeFileSync(join(fixture, 'dirty.txt'), 'dirty');
  try {
    await assert.rejects(
      () => runClaude(makeInput(service, fixture, baselineHead)),
      (err: unknown) => errCode(err) === 'worktree_not_clean',
    );
    assert.equal(service.getRun('run-1'), null);
    assert.equal(service.getRoom('room-1')!.state, 'PLAN_READY');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('actual HEAD differing from expected baseline rejects with validation_failed before spawning a process and zero side effects', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  // 构造与真实 HEAD 首字符必不相同的合法 hex object ID：末位替换为 0 在真实 HEAD 已以 0
  // 结尾时不会形成 mismatch；翻转首字符保证对任意 40-hex SHA 都确定性地不同。
  const differentHead = `${baselineHead[0] === '0' ? '1' : '0'}${baselineHead.slice(1)}`;
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  // 调用前保存完整 Room 与 Event list/cursor，证明 mismatch 拒绝对 durable state 零副作用。
  const snapshot = () => {
    const events = service.listEvents('room-1');
    return {
      room: service.getRoom('room-1'),
      events,
      cursor: events.length === 0 ? 0 : events[events.length - 1].sequence,
    };
  };
  const before = snapshot();
  try {
    await assert.rejects(
      () => runClaude(makeInput(service, fixture, differentHead, { spawnProcess: spawner })),
      (err: unknown) => errCode(err) === 'validation_failed',
    );
    assert.equal(invocations.length, 0, 'baseline mismatch must not spawn a Claude process');
    assert.equal(service.getRun('run-1'), null, 'baseline mismatch must not create a Run');
    assert.equal(existsSync(join(fixture, '.agent-room')), false, 'baseline mismatch must not write artifacts');
    assert.deepEqual(snapshot(), before, 'Room/Event/cursor must be unchanged after rejection');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('missing task rejects with entity_not_found', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  try {
    await assert.rejects(
      () => runClaude(makeInput(service, fixture, baselineHead, { taskId: 'missing' })),
      (err: unknown) => errCode(err) === 'entity_not_found',
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('stale taskId in FIX_PLAN_READY rejects before spawn, artifact, Run or Event', async () => {
  const service = makeFixReadyService(); // current task = task-2 (fix)
  const { fixture, baselineHead } = makeRepo();
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const eventsBefore = service.listEvents('room-1').length;
  try {
    await assert.rejects(
      () => runClaude(makeInput(service, fixture, baselineHead, { runId: 'run-2', taskId: 'task-1', spawnProcess: spawner })),
      (err: unknown) => errCode(err) === 'validation_failed',
    );
    assert.equal(invocations.length, 0, 'stale task must not spawn a Claude process');
    assert.equal(existsSync(join(fixture, '.agent-room')), false, 'stale task must not write artifacts');
    assert.equal(service.getRoom('room-1')!.state, 'FIX_PLAN_READY');
    assert.equal(service.getRun('run-2'), null, 'stale task must not create a Run');
    assert.equal(service.listEvents('room-1').length, eventsBefore, 'stale task must not append any Event');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('new-session success settles REVIEW_REQUIRED with session, exit code, evidence and artifacts', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = autoSpawner(child, () => {
    writeLines(child, [initLine(), line({ type: 'system', subtype: 'hook_started' }), resultLine()]);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assert.equal(room.state, 'REVIEW_REQUIRED');
    assert.equal(run.status, 'succeeded');
    assert.equal(run.claude_session_id, SESSION_ID);
    assert.equal(run.process_exit_code, 0);
    assert.equal(run.result?.task_id, TASK_ID);
    assert.deepEqual(run.git_evidence, { staged: [], unstaged: [], untracked: [] });
    assert.deepEqual(run.artifact_refs, [ARTIFACT_STDOUT, ARTIFACT_STDERR]);
    assert.equal(existsSync(join(fixture, '.agent-room', 'artifacts', 'run-1', 'stdout.jsonl')), true);
    assert.equal(existsSync(join(fixture, '.agent-room', 'artifacts', 'run-1', 'stderr.log')), true);

    // new-session mode 不传 --resume/--continue；完整 Contract 经 stdin 送达。
    assert.ok(!invocations[0].args.includes('--resume'));
    assert.ok(!invocations[0].args.includes('--continue'));
    await whenStdinFinished(child);
    assert.ok(child.stdinWritten.includes(TASK_ID), 'stdin must carry the full persisted contract');
    assert.ok(child.stdinWritten.includes('goal'), 'stdin must include the contract goal');

    // 非终态 progress line 追加了一条 run_progress Event。
    const progressEvents = service.listEvents('room-1').filter((e) => e.type === 'run_progress');
    assert.equal(progressEvents.length, 1);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('decision continuation resumes the exact lineage session and preserves a dirty worktree', async () => {
  const { fixture, baselineHead } = makeRepo();
  // 保留 lineage 的 dirty 变更：decision continuation 不得要求 clean worktree。
  writeFileSync(join(fixture, 'impl-change.txt'), 'impl');
  const service = makeDecisionReadyService(baselineHead); // NEEDS_DECISION, answered question
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = autoSpawner(child, () => {
    writeLines(child, [initLine(SESSION_ID), resultLine(SESSION_ID)]);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(
      makeInput(service, fixture, baselineHead, { runId: 'run-2', spawnProcess: spawner }),
    );
    assert.equal(room.state, 'REVIEW_REQUIRED');
    assert.equal(run.status, 'succeeded');
    assert.equal(run.run_id, 'run-2');
    assert.equal(run.claude_session_id, SESSION_ID);
    assert.equal(run.baseline_head, baselineHead);

    // exact --resume 来自 source Run session，绝不使用 --continue 或最近 session 推断。
    const args = invocations[0].args;
    const resumeIndex = args.indexOf('--resume');
    assert.ok(resumeIndex >= 0, 'decision continuation must pass --resume');
    assert.equal(args[resumeIndex + 1], SESSION_ID);
    assert.ok(!args.includes('--continue'), 'must never use --continue');

    // prompt 包含完整 Task 与完整 answered Question/answer context。
    await whenStdinFinished(child);
    assert.ok(child.stdinWritten.includes('pick opt-a'), 'stdin must carry the answered question answer');
    assert.ok(child.stdinWritten.includes('need a decision'), 'stdin must carry the answered question text');
    assert.ok(child.stdinWritten.includes(TASK_ID), 'stdin must carry the full persisted contract');

    // dirty worktree 被保留，不清理 lineage 变更。
    assert.equal(existsSync(join(fixture, 'impl-change.txt')), true);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('fix continuation resumes the reviewed lineage session and carries the full fix contract', async () => {
  const { fixture, baselineHead } = makeRepo();
  // 保留 implementation Diff：fix continuation 不得要求 clean worktree。
  writeFileSync(join(fixture, 'impl-diff.txt'), 'diff');
  const service = makeFixContinuationReadyService(baselineHead); // FIX_PLAN_READY, current task = task-2
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = autoSpawner(child, () => {
    writeLines(child, [initLine(SESSION_ID), resultLine(SESSION_ID, makeCodingResult({ task_id: 'task-2' }))]);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(
      makeInput(service, fixture, baselineHead, { runId: 'run-2', taskId: 'task-2', spawnProcess: spawner }),
    );
    assert.equal(room.state, 'REVIEW_REQUIRED');
    assert.equal(run.status, 'succeeded');
    assert.equal(run.task_id, 'task-2');
    assert.equal(run.claude_session_id, SESSION_ID);
    assert.equal(run.baseline_head, baselineHead);

    const args = invocations[0].args;
    const resumeIndex = args.indexOf('--resume');
    assert.ok(resumeIndex >= 0, 'fix continuation must pass --resume');
    assert.equal(args[resumeIndex + 1], SESSION_ID);

    // prompt 包含完整 Fix Contract（confirmed_findings 的 solution 与 review_fixes_only scope）。
    await whenStdinFinished(child);
    assert.ok(child.stdinWritten.includes('apply the fix'), 'stdin must carry the confirmed fix solution');
    assert.ok(child.stdinWritten.includes('review_fixes_only'), 'stdin must carry the fix scope');
    assert.equal(existsSync(join(fixture, 'impl-diff.txt')), true);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('answer_changes_contract=true rejects continuation before spawn, Run, artifact or Event', async () => {
  const { fixture, baselineHead } = makeRepo();
  const db = new DatabaseSync(':memory:');
  const service = new RoomService(db);
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun({ baseline_head: baselineHead }));
  service.askQuestion(makeQuestion());
  service.finalizeNeedsDecision(
    'run-1',
    makeCodingResult({ status: 'needs_decision' }),
    null,
    makeTerminalEvidence({ claude_session_id: SESSION_ID, process_exit_code: 0 }),
  );
  service.answerQuestion('question-1', 'change the scope', true); // -> WAITING_FOR_USER_CONFIRMATION
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const eventsBefore = service.listEvents('room-1').length;
  try {
    await assert.rejects(
      () => runClaude(makeInput(service, fixture, baselineHead, { runId: 'run-2', spawnProcess: spawner })),
      (err: unknown) => errCode(err) === 'validation_failed',
    );
    assert.equal(invocations.length, 0, 'changed contract must not spawn');
    assert.equal(service.getRoom('room-1')!.state, 'WAITING_FOR_USER_CONFIRMATION');
    assert.equal(service.getRun('run-2'), null, 'changed contract must not create a Run');
    assert.equal(service.listEvents('room-1').length, eventsBefore, 'changed contract must not append an Event');
    assert.equal(existsSync(join(fixture, '.agent-room')), false);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('lineage HEAD drift rejects decision continuation before spawn', async () => {
  const { fixture, baselineHead } = makeRepo();
  const service = makeDecisionReadyService(baselineHead);
  // 在 lineage baseline 之后新增一个 commit，使 actual HEAD 偏离 source Run.baseline_head。
  writeFileSync(join(fixture, 'drift.txt'), 'x');
  git(fixture, 'add', '.');
  git(fixture, 'commit', '-q', '-m', 'drift');
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  try {
    await assert.rejects(
      () => runClaude(makeInput(service, fixture, baselineHead, { runId: 'run-2', spawnProcess: spawner })),
      (err: unknown) => errCode(err) === 'validation_failed',
    );
    assert.equal(invocations.length, 0, 'HEAD drift must not spawn');
    assert.equal(service.getRun('run-2'), null, 'HEAD drift must not create a Run');
    assert.equal(service.getRoom('room-1')!.state, 'NEEDS_DECISION');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('completion evidence classifies staged/unstaged/untracked and excludes runner artifacts', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    // staged：修改并 stage 一个已 tracked 文件。
    writeFileSync(join(fixture, 'seed.txt'), 'changed');
    git(fixture, 'add', 'seed.txt');
    // unstaged：修改已 tracked 文件但不 stage。
    writeFileSync(join(fixture, 'unstaged.txt'), 'changed');
    // untracked：新文件。
    writeFileSync(join(fixture, 'untracked.txt'), 'new');
    writeLines(child, [initLine(), resultLine()]);
    child.emit('close', 0, null);
  });
  try {
    const { run } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assert.equal(run.status, 'succeeded');
    assert.deepEqual(run.git_evidence.staged, ['seed.txt']);
    assert.deepEqual(run.git_evidence.unstaged, ['unstaged.txt']);
    assert.deepEqual(run.git_evidence.untracked, ['untracked.txt']);
    // Runner 自写的 artifact 不得进入 git evidence。
    const all = [...run.git_evidence.staged, ...run.git_evidence.unstaged, ...run.git_evidence.untracked];
    assert.ok(!all.some((p) => p.startsWith('.agent-room/')), 'artifact paths must not pollute git evidence');
    assert.deepEqual(run.artifact_refs, [ARTIFACT_STDOUT, ARTIFACT_STDERR]);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('spawn failure settles claude_start_failed exactly once', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const { spawner, invocations } = makeThrowingSpawner(new Error('ENOENT'));
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assert.equal(room.state, 'RUN_FAILED');
    assert.equal(run.status, 'failed');
    assert.equal(run.failure?.code, 'claude_start_failed');
    assert.equal(invocations.length, 1);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('non-zero exit settles claude_exit_failed even with a valid terminal stream', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(), resultLine()]);
    child.emit('close', 7, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assert.equal(room.state, 'RUN_FAILED');
    assert.equal(run.status, 'failed');
    assert.equal(run.failure?.code, 'claude_exit_failed');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('init missing the required room tool settles room_mcp_unavailable', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(SESSION_ID, ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'])]);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    // required tool 缺失但合法 session 已观察：failure code=room_mcp_unavailable，且该
    // session 原子持久化到 Run.claude_session_id。
    assert.equal(room.state, 'RUN_FAILED');
    assert.equal(run.status, 'failed');
    assert.equal(run.failure?.code, 'room_mcp_unavailable');
    assert.equal(run.claude_session_id, SESSION_ID);
    const events = service.listEvents('room-1');
    assert.equal(events.filter((e) => e.type === 'run_failed').length, 1);
    assert.equal(events.filter((e) => e.type === 'run_completed').length, 0);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('non-completed coding result settles coding_result_invalid', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(), resultLine(SESSION_ID, makeCodingResult({ status: 'blocked' }))]);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assertFailure(service, { run, room }, 'coding_result_invalid');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('git observation failure settles git_evidence_failed', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    // 在 clean-baseline 之后损坏 index，仅让 completion evidence 失败。
    writeFileSync(join(fixture, '.git', 'index'), 'corrupt');
    writeLines(child, [initLine(), resultLine()]);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assert.equal(room.state, 'RUN_FAILED');
    assert.equal(run.failure?.code, 'git_evidence_failed');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('artifact write failure settles artifact_write_failed with empty refs', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    // 用文件挡住 .agent-room 目录，使 writeArtifacts 的 mkdirSync 失败。
    writeFileSync(join(fixture, '.agent-room'), 'blocker');
    writeLines(child, [initLine(), resultLine()]);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assert.equal(room.state, 'RUN_FAILED');
    assert.equal(run.failure?.code, 'artifact_write_failed');
    assert.deepEqual(run.artifact_refs, []);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// ---- central failure matrix ----
// 直接经 runClaude 覆盖 Contract 点名的 transport/stream failure path，证明每个 case 的
// 唯一 failure mapping、single terminal settlement（一次 run_failed、零次 run_completed）
// 与 Room/Run terminal state 一致。

test('asynchronous child error event settles claude_start_failed exactly once', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    child.emit('error', new Error('ECONNREFUSED'));
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assertFailure(service, { run, room }, 'claude_start_failed');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('stdin EPIPE then late close(0) settles claude_start_failed exactly once', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess(new Error('EPIPE'));
  const { spawner } = makeSpawner(child);
  // 先挂载 stdin error 等待，再启动；EPIPE 送达 transport 后再 emit late close(0)。
  const stdinError = whenStdinError(child);
  try {
    const outcome = runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    await stdinError;
    child.emit('close', 0, null); // late close 不得把已 settle 的 start failure 改写为 exit 0
    const { run, room } = await outcome;
    assertFailure(service, { run, room }, 'claude_start_failed');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('signal exit settles claude_exit_failed even with a valid terminal stream', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(), resultLine()]);
    child.emit('close', null, 'SIGTERM');
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assertFailure(service, { run, room }, 'claude_exit_failed');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('missing init settles room_mcp_unavailable', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [resultLine()]); // terminal without init
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assertFailure(service, { run, room }, 'room_mcp_unavailable');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('invalid init (empty session) settles room_mcp_unavailable', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine('')]); // empty session_id -> init_error
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assertFailure(service, { run, room }, 'room_mcp_unavailable');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('duplicate init settles room_mcp_unavailable', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(), initLine()]);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assertFailure(service, { run, room }, 'room_mcp_unavailable');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('malformed JSON line settles coding_result_invalid', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(), 'not json']);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assertFailure(service, { run, room }, 'coding_result_invalid');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('terminal session mismatch settles coding_result_invalid', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(SESSION_ID), resultLine('sess-other-0000-0000-0000-000000000000')]);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assertFailure(service, { run, room }, 'coding_result_invalid');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('missing terminal settles coding_result_invalid', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine()]);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assertFailure(service, { run, room }, 'coding_result_invalid');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('duplicate terminal settles coding_result_invalid', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(), resultLine(), resultLine()]);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assertFailure(service, { run, room }, 'coding_result_invalid');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('error terminal settles coding_result_invalid', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [
      initLine(),
      line({
        type: 'result',
        subtype: 'success',
        is_error: true,
        session_id: SESSION_ID,
        result: '{}',
        structured_output: makeCodingResult(),
        stop_reason: 'tool_use',
      }),
    ]);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assertFailure(service, { run, room }, 'coding_result_invalid');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('invalid CodingResult (schema failure) settles coding_result_invalid', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [
      initLine(),
      line({
        type: 'result',
        subtype: 'success',
        is_error: false,
        session_id: SESSION_ID,
        result: '{}',
        structured_output: { task_id: TASK_ID }, // 缺少必填字段
        stop_reason: 'tool_use',
      }),
    ]);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assertFailure(service, { run, room }, 'coding_result_invalid');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('mismatched CodingResult task_id settles coding_result_invalid', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [
      initLine(),
      line({
        type: 'result',
        subtype: 'success',
        is_error: false,
        session_id: SESSION_ID,
        result: '{}',
        structured_output: makeCodingResult({ task_id: 'other-task' }),
        stop_reason: 'tool_use',
      }),
    ]);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assertFailure(service, { run, room }, 'coding_result_invalid');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// ---- needs-decision pause settlement ----
// Claude 在 run 内成功调用 room_ask_question 后，Run 已被原子置为 needs_decision；Runner 必须走
// pause finalization 而不是 completeRun/failRun，把 session/exit/result/failure/Git/artifact
// evidence 写回同一 Run 并追加 run_paused Event，绝不改写 durable Question 为 RUN_FAILED/REVIEW_REQUIRED。

test('needs-decision pause finalizes session, result and evidence without run_completed/run_failed', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    // 模拟 Claude 在 run 内经 room_ask_question 调用 RoomService（同步把 Run 置为 needs_decision），
    // 随后返回 valid needs_decision CodingResult 并 exit 0。
    service.askQuestion(makeQuestion());
    writeLines(child, [initLine(), resultLine(SESSION_ID, makeCodingResult({ status: 'needs_decision' }))]);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assert.equal(room.state, 'NEEDS_DECISION');
    assert.equal(run.status, 'needs_decision');
    assert.equal(run.completed_at !== null, true);
    assert.equal(run.claude_session_id, SESSION_ID);
    assert.equal(run.process_exit_code, 0);
    assert.equal(run.result?.status, 'needs_decision');
    assert.deepEqual(run.git_evidence, { staged: [], unstaged: [], untracked: [] });
    assert.deepEqual(run.artifact_refs, [ARTIFACT_STDOUT, ARTIFACT_STDERR]);
    const events = service.listEvents('room-1');
    assert.equal(events.filter((e) => e.type === 'question_asked').length, 1, 'exactly one question_asked');
    assert.equal(events.filter((e) => e.type === 'run_paused').length, 1, 'exactly one run_paused');
    assert.equal(events.filter((e) => e.type === 'run_completed').length, 0, 'zero run_completed');
    assert.equal(events.filter((e) => e.type === 'run_failed').length, 0, 'zero run_failed');
    assert.equal(service.getQuestion('question-1')!.status, 'open');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('needs-decision pause with non-zero exit records claude_exit_failed and keeps the question open', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    service.askQuestion(makeQuestion());
    writeLines(child, [initLine(), resultLine()]);
    child.emit('close', 7, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assert.equal(room.state, 'NEEDS_DECISION');
    assert.equal(run.status, 'needs_decision');
    assert.equal(run.failure?.code, 'claude_exit_failed');
    assert.equal(run.claude_session_id, SESSION_ID, 'observed session is still persisted on pause failure');
    assert.equal(service.getQuestion('question-1')!.status, 'open');
    const events = service.listEvents('room-1');
    assert.equal(events.filter((e) => e.type === 'run_paused').length, 1);
    assert.equal(events.filter((e) => e.type === 'run_failed').length, 0);
    assert.equal(events.filter((e) => e.type === 'run_completed').length, 0);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('needs-decision pause with contradictory completed result records coding_result_invalid', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    service.askQuestion(makeQuestion());
    writeLines(child, [initLine(), resultLine(SESSION_ID, makeCodingResult({ status: 'completed' }))]);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assert.equal(room.state, 'NEEDS_DECISION');
    assert.equal(run.status, 'needs_decision');
    assert.equal(run.failure?.code, 'coding_result_invalid');
    assert.equal(run.result, null);
    assert.equal(service.getQuestion('question-1')!.status, 'open');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('needs-decision pause with git observation failure records git_evidence_failed', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    service.askQuestion(makeQuestion());
    // 在 clean-baseline 之后损坏 index，仅让 completion evidence 失败。
    writeFileSync(join(fixture, '.git', 'index'), 'corrupt');
    writeLines(child, [initLine(), resultLine(SESSION_ID, makeCodingResult({ status: 'needs_decision' }))]);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assert.equal(room.state, 'NEEDS_DECISION');
    assert.equal(run.status, 'needs_decision');
    assert.equal(run.failure?.code, 'git_evidence_failed');
    assert.equal(service.getQuestion('question-1')!.status, 'open');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('needs-decision pause with artifact failure records artifact_write_failed', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    service.askQuestion(makeQuestion());
    // 用文件挡住 .agent-room 目录，使 writeArtifacts 的 mkdirSync 失败。
    writeFileSync(join(fixture, '.agent-room'), 'blocker');
    writeLines(child, [initLine(), resultLine(SESSION_ID, makeCodingResult({ status: 'needs_decision' }))]);
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assert.equal(room.state, 'NEEDS_DECISION');
    assert.equal(run.status, 'needs_decision');
    assert.equal(run.failure?.code, 'artifact_write_failed');
    assert.deepEqual(run.artifact_refs, []);
    assert.equal(service.getQuestion('question-1')!.status, 'open');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('needs-decision pause keeps pre-question run_progress before question_asked and appends none after', async () => {
  const service = makeService();
  const { fixture, baselineHead } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    // Question 前：Run 仍 running，init + 一个可识别非终态 progress 应追加恰好一个 run_progress。
    child.stdout.write(initLine() + '\n');
    child.stdout.write(line({ type: 'assistant', message: { content: 'before question' } }) + '\n');
    // 经真实 RoomService.askQuestion 把同一 Run 原子置为 needs_decision。
    service.askQuestion(makeQuestion());
    // Question 后：assistant/tool_result 等非终态 progress 仍被 Runner 消费以完成 pause
    // evidence，但不得再进入 running-only appendRunProgress（修复前会抛 validation_failed）。
    child.stdout.write(line({ type: 'tool_result', tool_use_id: 'call-1', content: [{ type: 'text', text: 'asked' }] }) + '\n');
    child.stdout.write(resultLine(SESSION_ID, makeCodingResult({ status: 'needs_decision' })) + '\n');
    child.stdout.end();
    child.stderr.end();
    child.emit('close', 0, null);
  });
  try {
    const { run, room } = await runClaude(makeInput(service, fixture, baselineHead, { spawnProcess: spawner }));
    assert.equal(room.state, 'NEEDS_DECISION');
    assert.equal(run.status, 'needs_decision');
    assert.equal(run.completed_at !== null, true);
    assert.equal(run.claude_session_id, SESSION_ID);
    assert.equal(run.process_exit_code, 0);
    assert.equal(run.result?.status, 'needs_decision');
    assert.deepEqual(run.git_evidence, { staged: [], unstaged: [], untracked: [] });
    assert.deepEqual(run.artifact_refs, [ARTIFACT_STDOUT, ARTIFACT_STDERR]);

    const events = service.listEvents('room-1');
    const progressEvents = events.filter((e) => e.type === 'run_progress');
    const questionEvents = events.filter((e) => e.type === 'question_asked');
    assert.equal(progressEvents.length, 1, 'exactly one pre-question run_progress');
    assert.equal(questionEvents.length, 1, 'exactly one question_asked');
    // 以 Event sequence 而非仅总数证明分界：Question 前 progress 的 sequence 小于 question_asked，
    // 且 Question 后没有新增任何 run_progress。
    assert.ok(progressEvents[0].sequence < questionEvents[0].sequence, 'run_progress must precede question_asked');
    assert.equal(events.filter((e) => e.type === 'run_paused').length, 1, 'exactly one run_paused');
    assert.equal(events.filter((e) => e.type === 'run_completed').length, 0, 'zero run_completed');
    assert.equal(events.filter((e) => e.type === 'run_failed').length, 0, 'zero run_failed');
    assert.equal(service.getQuestion('question-1')!.status, 'open');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
