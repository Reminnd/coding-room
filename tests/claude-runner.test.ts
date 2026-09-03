import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { GitCommandError } from '../src/git/git-process.ts';
import { getRoomStateSnapshot } from '../src/room/state-snapshot.ts';
import { runClaude, type ClaudeRunnerInput } from '../src/runner/claude-runner.ts';
import { RoomService } from '../src/room/room-service.ts';
import {
  makeAttemptSettle,
  makeCodingResult,
  makeFixTask,
  makeFinding,
  makeParticipant,
  makeQuestion,
  makeReview,
  makeRoleAssignment,
  makeTask,
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

// Stage 2 LocalExecutor 的集成测试：全部通过 production runClaude public boundary，注入
// fake spawner 与 temp Git repo，断言 claim 前 worktree/session/adapter/route 门禁、
// atomic claim、progress、artifact/Git evidence 与唯一 terminal settlement。Run 是 execution
// lineage 的唯一 owner（submitTask 已创建 ready Run），attempt 冻结 executor/worker 并拥有
// session/exit/result/evidence/failure；Room 保持 planning-only DISCUSSION。
const SESSION_ID = 'sess-00000000-0000-4000-8000-000000000001';
const REPLACEMENT_SESSION_ID = 'sess-00000000-0000-4000-8000-000000000002';

// v0.4 actor literal：与默认 bootstrap assignment 一致（测试侧独立 literal，不导入实现）。
const PLANNER = { participant_id: 'codex-app', actor_role: 'planner' as const };
const REVIEWER = { participant_id: 'codex-app', actor_role: 'reviewer' as const };
const WORKER = { participant_id: 'claude-code-cli', actor_role: 'worker' as const };
const EXECUTOR = { participant_id: 'local-runner', actor_role: 'executor' as const };
const ORCHESTRATOR = { participant_id: 'codex-app', actor_role: 'orchestrator' as const };
const REQUIRED_TOOL = 'mcp__agent_room__room_ask_question';
const TASK_ID = 'task-1';
// worker route 校验要求 agent_room server 的 url 精确指向 resolved worker participant 的
// canonical framed route（`p~` + raw identity，Fix inc9-fr4；测试侧 literal，不导入实现）。
const MCP_CONFIG =
  '{"mcpServers":{"agent_room":{"url":"http://127.0.0.1:8080/mcp/participants/p~claude-code-cli","command":"node","args":["server.js"]}}}';
const ARTIFACT_STDOUT = '.agent-room/artifacts/attempt-1/stdout.jsonl';
const ARTIFACT_STDERR = '.agent-room/artifacts/attempt-1/stderr.log';

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
// 首 attempt 之后被精确区分。
function makeRepo(): { fixture: string } {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runner-'));
  git(fixture, 'init', '-q', '-b', 'main');
  git(fixture, 'config', '--local', 'commit.gpgsign', 'false');
  git(fixture, 'config', '--local', 'core.autocrlf', 'false');
  writeFileSync(join(fixture, 'seed.txt'), 'base');
  writeFileSync(join(fixture, 'unstaged.txt'), 'base');
  git(fixture, 'add', '.');
  git(fixture, 'commit', '-q', '-m', 'base');
  return { fixture };
}

// 准备一个已提交 Implementation Task 的 RoomService：Room planning round 完成、Run 已由
// submitTask 创建为 ready、尚无 attempt（首 attempt 由 Executor 冻结 canonical worktree）。
// 带 db 的变体仅供最窄 fixture SQL 测试表达正常 public lifecycle 无法产生的损坏状态。
function makeServiceWithDb(): { service: RoomService; db: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  const service = new RoomService(db);
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER); // run-1 ready
  return { service, db };
}

function makeService(): RoomService {
  return makeServiceWithDb().service;
}

// service-level claim helper：模拟 Executor 已冻结 canonical worktree 的首 attempt claim（Executor 的
// Git 门禁由本文件各测试经真实 runClaude 覆盖，service claim 本身不做 Git 检查）。
function claimAttempt(
  service: RoomService,
  attemptId: string,
  worktree: string,
): void {
  service.claimRunAttempt(
    {
      attempt_id: attemptId,
      run_id: 'run-1',
      room_id: 'room-1',
      worktree_path: worktree,
    },
    EXECUTOR,
  );
}

function settleSucceeded(
  service: RoomService,
  attemptId: string,
  sessionId: string | null = 'session-1',
): void {
  service.settleRunAttempt(
    makeAttemptSettle({
      attempt_id: attemptId,
      status: 'succeeded',
      result: makeCodingResult(),
      agent_session_ref: sessionId,
      process_exit_code: 0,
    }),
    EXECUTOR,
  );
}

// 完整 Implementation -> Review(changes_requested) -> Fix Task 链路：run-1 回到 ready，
// current task 为 fix task-2，attempt-1 已 succeeded。
function makeFixReadyService(worktree: string): RoomService {
  const service = makeService();
  claimAttempt(service, 'attempt-1', worktree);
  settleSucceeded(service, 'attempt-1');
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER);
  service.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', run_id: 'run-1' }),
    PLANNER,
  );
  return service;
}

// decision resume 前置：attempt-1 完成 askQuestion + needs_decision settle + answer(false)，
// Run 回到 ready、attempt-1 带 exact session。
function makeDecisionReadyService(worktree: string): RoomService {
  const service = makeService();
  claimAttempt(service, 'attempt-1', worktree);
  service.askQuestion(makeQuestion(), WORKER);
  service.settleRunAttempt(
    makeAttemptSettle({
      attempt_id: 'attempt-1',
      status: 'needs_decision',
      result: makeCodingResult({ status: 'needs_decision' }),
      agent_session_ref: SESSION_ID,
      process_exit_code: 0,
    }),
    EXECUTOR,
  );
  service.answerQuestion('question-1', 'pick opt-a', false, PLANNER); // Run -> ready
  return service;
}

// fix resume 前置：attempt-1 succeeded + review(changes_requested) + fix task-2，current
// task = task-2，source attempt 带 exact session。
function makeFixContinuationReadyService(worktree: string): RoomService {
  const service = makeService();
  claimAttempt(service, 'attempt-1', worktree);
  settleSucceeded(service, 'attempt-1', SESSION_ID);
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER);
  service.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', run_id: 'run-1' }),
    PLANNER,
  );
  return service;
}

// retry 前置：attempt-1 failed + retryRun → Run ready，source attempt 的 session 由调用方
// 决定（'' 表示无可靠 session）。
function makeRetryReadyService(
  worktree: string,
  sessionId: string | null = SESSION_ID,
): RoomService {
  const service = makeService();
  claimAttempt(service, 'attempt-1', worktree);
  service.settleRunAttempt(
    makeAttemptSettle({
      attempt_id: 'attempt-1',
      status: 'failed',
      result: null,
      failure: { code: 'claude_exit_failed', message: 'boom' },
      agent_session_ref: sessionId,
      process_exit_code: 1,
    }),
    EXECUTOR,
  );
  service.retryRun('room-1', 'run-1', PLANNER); // Run -> ready
  return service;
}

function makeInput(
  service: RoomService,
  fixture: string,
  overrides: Partial<ClaudeRunnerInput> = {},
): ClaudeRunnerInput {
  return {
    roomService: service,
    runId: 'run-1',
    attemptId: 'attempt-1',
    targetWorktree: fixture,
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

function durableSnapshot(service: RoomService): unknown {
  return getRoomStateSnapshot(service, { room_id: 'room-1' });
}

// central failure settlement 的单一断言：唯一 failure mapping、一次 run_attempt_failed、
// 零次 run_attempt_succeeded，Room 保持 DISCUSSION、Run=failed、attempt.failure.code 匹配。
function assertFailure(
  service: RoomService,
  result: {
    run: { status: string };
    attempt: { status: string; failure: { code: string } | null };
    room: { state: string };
  },
  code: string,
  attemptStatus = 'failed',
): void {
  assert.equal(result.room.state, 'DISCUSSION');
  assert.equal(result.run.status, 'failed');
  assert.equal(result.attempt.status, attemptStatus);
  assert.equal(result.attempt.failure?.code, code);
  const events = service.listEvents('room-1');
  assert.equal(events.filter((e) => e.type === 'run_attempt_failed').length, 1, 'exactly one run_attempt_failed event');
  assert.equal(events.filter((e) => e.type === 'run_attempt_succeeded').length, 0, 'zero run_attempt_succeeded events');
}

test('non-repository target rejects with git_repository_missing before claiming an attempt', async () => {
  const service = makeService();
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runner-norepo-'));
  try {
    await assert.rejects(
      () => runClaude(makeInput(service, fixture)),
      (err: unknown) => errCode(err) === 'git_repository_missing',
    );
    assert.equal(service.getRun('run-1')!.status, 'ready', 'no attempt may be claimed');
    assert.equal(service.getAttempt('attempt-1'), null);
    assert.equal(service.getRoom('room-1')!.state, 'DISCUSSION');
    assert.equal(existsSync(join(fixture, '.agent-room')), false);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('clean unborn repository completes a first attempt', async () => {
  const service = makeService();
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-runner-unborn-'));
  git(fixture, 'init', '-q', '-b', 'main');
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = autoSpawner(child, () => {
    writeLines(child, [initLine(SESSION_ID), resultLine(SESSION_ID)]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assert.equal(run.status, 'review_required');
    assert.equal(attempt.status, 'succeeded');
    assert.equal(invocations.length, 1);
    assert.equal(service.getRoom('room-1')!.state, 'DISCUSSION');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('dirty worktree rejects with worktree_not_clean before claiming an attempt', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  writeFileSync(join(fixture, 'dirty.txt'), 'dirty');
  try {
    await assert.rejects(
      () => runClaude(makeInput(service, fixture)),
      (err: unknown) => errCode(err) === 'worktree_not_clean',
    );
    assert.equal(service.getRun('run-1')!.status, 'ready');
    assert.equal(service.getRoom('room-1')!.state, 'DISCUSSION');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('damaged index propagates Git failure before first-attempt claim, process or artifact', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  writeFileSync(join(fixture, '.git', 'index'), 'corrupt-index-bytes');
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const before = durableSnapshot(service);
  try {
    await assert.rejects(
      () => runClaude(makeInput(service, fixture, { spawnProcess: spawner })),
      (err: unknown) => {
        assert.ok(err instanceof GitCommandError);
        assert.equal(err.command, 'diff');
        assert.deepEqual(err.args, ['--cached', '--name-only', '-z']);
        assert.equal(err.cwd, fixture);
        assert.equal(err.exitCode, 128);
        return true;
      },
    );
    assert.equal(invocations.length, 0, 'damaged index must not spawn a worker process');
    assert.equal(existsSync(join(fixture, '.agent-room')), false, 'damaged index must not create artifacts');
    assert.deepEqual(durableSnapshot(service), before, 'damaged index must not change durable state');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('new-session success settles review_required with session, exit code, evidence and artifacts', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = autoSpawner(child, () => {
    writeLines(child, [initLine(), line({ type: 'system', subtype: 'hook_started' }), resultLine()]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'review_required');
    assert.equal(attempt.status, 'succeeded');
    assert.equal(attempt.agent_session_ref, SESSION_ID);
    assert.equal(attempt.process_exit_code, 0);
    assert.equal(attempt.result?.task_id, TASK_ID);
    assert.deepEqual(attempt.git_evidence, { staged: [], unstaged: [], untracked: [] });
    assert.deepEqual(attempt.artifact_refs, [ARTIFACT_STDOUT, ARTIFACT_STDERR]);
    assert.equal(existsSync(join(fixture, '.agent-room', 'artifacts', 'attempt-1', 'stdout.jsonl')), true);
    assert.equal(existsSync(join(fixture, '.agent-room', 'artifacts', 'attempt-1', 'stderr.log')), true);

    // new-session mode 不传 --resume/--continue；完整 Contract 经 stdin 送达。
    assert.ok(!invocations[0].args.includes('--resume'));
    assert.ok(!invocations[0].args.includes('--continue'));
    await whenStdinFinished(child);
    assert.ok(child.stdinWritten.includes(TASK_ID), 'stdin must carry the full persisted contract');
    assert.ok(child.stdinWritten.includes('goal'), 'stdin must include the contract goal');
    assert.ok(child.stdinWritten.includes('continuation_kind: new_implementation'));

    // 非终态 progress line 追加了一条 run_attempt_progress Event。
    const progressEvents = service.listEvents('room-1').filter((e) => e.type === 'run_attempt_progress');
    assert.equal(progressEvents.length, 1);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// Fix inc9-fr2-1 direct regression：production runClaude 必须把 resolved executor participant
// 作为唯一 executor actor 传给 claim 与 terminal settlement。这里注册非默认 Task-scope
// executor runner-2，完整 claim + progress + terminal 均经真实 runClaude 完成；若 Runner 仍
// 使用固定 local-runner，claim（冻结 identity 校验）与 settle（attempt 冻结 executor 校验）
// 都会拒绝，测试即失败。
test('a non-default task-scope executor drives the production runClaude claim and terminal settlement', async () => {
  const service = makeService();
  service.registerParticipant(
    makeParticipant({ participant_id: 'runner-2', kind: 'service', provider: 'local', adapter_id: 'local_runner', capabilities: ['execution'] }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-e2', scope_type: 'task', scope_id: 'task-1', role: 'executor', participant_id: 'runner-2' }),
    ORCHESTRATOR,
  );
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = autoSpawner(child, () => {
    writeLines(child, [initLine(), line({ type: 'system', subtype: 'hook_started' }), resultLine()]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'review_required');
    assert.equal(attempt.status, 'succeeded');
    // claim 时固化的 executor identity 来自 Task-scope assignment，不是 bootstrap default。
    assert.equal(attempt.executor_participant_id, 'runner-2');
    assert.equal(run.worker_participant_id, 'claude-code-cli');
    assert.equal(service.getAttempt('attempt-1')!.executor_participant_id, 'runner-2');
    const events = service.listEvents('room-1');
    assert.equal(events.filter((e) => e.type === 'run_attempt_succeeded').length, 1, 'exactly one terminal settlement');
    // progress 与 terminal Event 的 actor 都是 resolved executor，不是固定 local-runner。
    for (const e of events.filter((e) => e.type === 'run_attempt_progress' || e.type === 'run_attempt_succeeded')) {
      assert.equal(e.participant_id, 'runner-2');
      assert.equal(e.actor_role, 'executor');
    }
    assert.ok(!invocations[0].args.includes('--resume'));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// Fix inc9-fr3/fr4 direct regression：production runClaude 必须从 Run 冻结 worker 的 raw
// identity 独立构造 canonical framed route（`p~` + encodeURIComponent）并以该 exact route
// 验证 mcpConfig。Contract 规定 worker 在 Run 创建时解析冻结、assignment replacement 不得
// 改写既有 Run worker，而 task-scope assignment 要求 Task 已存在（Task 与 Run 同事务创建），
// 因此含斜杠等非默认 worker 经 Room scope latest assignment 在 submitTask 前生效。framed
// mcp-url 穿过 route gate、claim 与 terminal settlement；authority 继续接收 raw identity，
// Run 冻结的 worker_participant_id 保持 worker/2 而不是 route string。framed 期望值
// p~worker%2F2 是测试侧 literal，不从 production route builder 导出。
function makeServiceWithWorker(participantId: string): RoomService {
  const db = new DatabaseSync(':memory:');
  const service = new RoomService(db);
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.registerParticipant(
    makeParticipant({
      participant_id: participantId,
      display_name: participantId,
      kind: 'agent',
      provider: 'anthropic',
      adapter_id: 'claude_code_cli',
      capabilities: ['coding', 'questioning'],
    }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({
      assignment_id: `a-${participantId}`,
      role: 'worker',
      participant_id: participantId,
    }),
    ORCHESTRATOR,
  );
  service.submitTask(makeTask(), PLANNER); // run-1 创建时冻结该 worker identity
  return service;
}

test('a slash worker identity passes the runClaude framed route gate and settles with raw authority identity', async () => {
  const service = makeServiceWithWorker('worker/2');
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(), line({ type: 'system', subtype: 'hook_started' }), resultLine()]);
    child.emit('close', 0, null);
  });
  try {
    const mcpConfig =
      '{"mcpServers":{"agent_room":{"url":"http://127.0.0.1:8080/mcp/participants/p~worker%2F2","command":"node","args":["server.js"]}}}';
    const { run, attempt, room } = await runClaude(
      makeInput(service, fixture, { spawnProcess: spawner, mcpConfig }),
    );
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'review_required');
    assert.equal(attempt.status, 'succeeded');
    assert.equal(run.worker_participant_id, 'worker/2');
    assert.equal(service.getRun('run-1')!.worker_participant_id, 'worker/2');
    const events = service.listEvents('room-1');
    assert.equal(events.filter((e) => e.type === 'run_attempt_succeeded').length, 1, 'exactly one terminal settlement');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('raw multi-segment and unframed encoded worker URLs reject runClaude before spawn, Run, Event or artifact', async () => {
  const service = makeServiceWithWorker('worker/2');
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = autoSpawner(child, () => {
    writeLines(child, [initLine(), resultLine()]);
    child.emit('close', 0, null);
  });
  try {
    const eventsBefore = service.listEvents('room-1');
    // raw 多 segment 与 unframed encoded 单 segment 都不是 canonical framed route（Fix inc9-fr3/fr4）。
    const invalidConfigs = [
      '{"mcpServers":{"agent_room":{"url":"http://127.0.0.1:8080/mcp/participants/worker/2","command":"node","args":["server.js"]}}}',
      '{"mcpServers":{"agent_room":{"url":"http://127.0.0.1:8080/mcp/participants/worker%2F2","command":"node","args":["server.js"]}}}',
    ];
    for (const mcpConfig of invalidConfigs) {
      await assert.rejects(
        runClaude(makeInput(service, fixture, { spawnProcess: spawner, mcpConfig })),
        (err: unknown) => errCode(err) === 'validation_failed',
        `${mcpConfig} must be rejected`,
      );
    }
    assert.equal(invocations.length, 0, 'route rejection must never spawn');
    assert.equal(service.getRun('run-1')!.status, 'ready', 'no attempt may be claimed');
    assert.equal(service.getAttempt('attempt-1'), null);
    assert.deepEqual(service.listEvents('room-1'), eventsBefore, 'durable Event list unchanged');
    assert.equal(existsSync(join(fixture, '.agent-room')), false, 'no artifact owner path');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// Fix inc9-fr4 direct regression：`.`/`..` 是合法 raw worker identity，production runClaude
// 的 framed route 必须是测试侧 literal `p~.`/`p~..`。每个 identity 走完整 claim + terminal
// settlement，Run 冻结的 worker_participant_id 保持 raw identity；unframed mcp-url 在
// spawn/claim 前被 exact route gate 拒绝。
test('a dot worker identity passes the runClaude framed route gate and settles with raw authority identity', async () => {
  const service = makeServiceWithWorker('.');
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(), line({ type: 'system', subtype: 'hook_started' }), resultLine()]);
    child.emit('close', 0, null);
  });
  try {
    const mcpConfig =
      '{"mcpServers":{"agent_room":{"url":"http://127.0.0.1:8080/mcp/participants/p~.","command":"node","args":["server.js"]}}}';
    const { run, attempt, room } = await runClaude(
      makeInput(service, fixture, { spawnProcess: spawner, mcpConfig }),
    );
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'review_required');
    assert.equal(attempt.status, 'succeeded');
    assert.equal(run.worker_participant_id, '.');
    assert.equal(service.getRun('run-1')!.worker_participant_id, '.');
    const events = service.listEvents('room-1');
    assert.equal(events.filter((e) => e.type === 'run_attempt_succeeded').length, 1, 'exactly one terminal settlement');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('a dotdot worker identity passes the runClaude framed route gate and settles with raw authority identity', async () => {
  const service = makeServiceWithWorker('..');
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(), line({ type: 'system', subtype: 'hook_started' }), resultLine()]);
    child.emit('close', 0, null);
  });
  try {
    const mcpConfig =
      '{"mcpServers":{"agent_room":{"url":"http://127.0.0.1:8080/mcp/participants/p~..","command":"node","args":["server.js"]}}}';
    const { run, attempt, room } = await runClaude(
      makeInput(service, fixture, { spawnProcess: spawner, mcpConfig }),
    );
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'review_required');
    assert.equal(attempt.status, 'succeeded');
    assert.equal(run.worker_participant_id, '..');
    assert.equal(service.getRun('run-1')!.worker_participant_id, '..');
    const events = service.listEvents('room-1');
    assert.equal(events.filter((e) => e.type === 'run_attempt_succeeded').length, 1, 'exactly one terminal settlement');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('decision continuation resumes the exact lineage session and preserves a dirty worktree', async () => {
  const { fixture } = makeRepo();
  // 保留 lineage 的 dirty 变更：decision continuation 不得要求 clean worktree。
  writeFileSync(join(fixture, 'impl-change.txt'), 'impl');
  const service = makeDecisionReadyService(fixture);
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = autoSpawner(child, () => {
    writeLines(child, [initLine(SESSION_ID), resultLine(SESSION_ID)]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(
      makeInput(service, fixture, { attemptId: 'attempt-2', spawnProcess: spawner }),
    );
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'review_required');
    assert.equal(run.run_id, 'run-1');
    assert.equal(attempt.status, 'succeeded');
    assert.equal(attempt.agent_session_ref, SESSION_ID);

    // exact --resume 来自 source attempt session，绝不使用 --continue 或最近 session 推断。
    const args = invocations[0].args;
    const resumeIndex = args.indexOf('--resume');
    assert.ok(resumeIndex >= 0, 'decision continuation must pass --resume');
    assert.equal(args[resumeIndex + 1], SESSION_ID);
    assert.ok(!args.includes('--continue'), 'must never use --continue');

    // prompt 包含完整 Task 与完整 answered Question/answer context。
    await whenStdinFinished(child);
    assert.ok(child.stdinWritten.includes('continuation_kind: decision'));
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
  const { fixture } = makeRepo();
  // 保留 implementation Diff：fix continuation 不得要求 clean worktree。
  writeFileSync(join(fixture, 'impl-diff.txt'), 'diff');
  const service = makeFixContinuationReadyService(fixture);
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = autoSpawner(child, () => {
    writeLines(child, [initLine(SESSION_ID), resultLine(SESSION_ID, makeCodingResult({ task_id: 'task-2' }))]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(
      makeInput(service, fixture, { attemptId: 'attempt-2', spawnProcess: spawner }),
    );
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'review_required');
    assert.equal(attempt.status, 'succeeded');
    assert.equal(attempt.result?.task_id, 'task-2');
    assert.equal(attempt.agent_session_ref, SESSION_ID);

    const args = invocations[0].args;
    const resumeIndex = args.indexOf('--resume');
    assert.ok(resumeIndex >= 0, 'fix continuation must pass --resume');
    assert.equal(args[resumeIndex + 1], SESSION_ID);

    // prompt 包含完整 Fix Contract（confirmed_findings 的 solution 与 review_fixes_only scope）。
    await whenStdinFinished(child);
    assert.ok(child.stdinWritten.includes('continuation_kind: fix'));
    assert.ok(child.stdinWritten.includes('apply the fix'), 'stdin must carry the confirmed fix solution');
    assert.ok(child.stdinWritten.includes('review_fixes_only'), 'stdin must carry the fix scope');
    assert.equal(existsSync(join(fixture, 'impl-diff.txt')), true);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('answer_changes_contract=true rejects continuation before spawn, claim, artifact or Event', async () => {
  const { fixture } = makeRepo();
  const service = makeService();
  claimAttempt(service, 'attempt-1', fixture);
  service.askQuestion(makeQuestion(), WORKER);
  service.settleRunAttempt(
    makeAttemptSettle({
      attempt_id: 'attempt-1',
      status: 'needs_decision',
      result: makeCodingResult({ status: 'needs_decision' }),
      agent_session_ref: SESSION_ID,
      process_exit_code: 0,
    }),
    EXECUTOR,
  );
  service.answerQuestion('question-1', 'change the scope', true, PLANNER); // -> WAITING_FOR_USER_CONFIRMATION
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const eventsBefore = service.listEvents('room-1').length;
  try {
    await assert.rejects(
      () => runClaude(makeInput(service, fixture, { attemptId: 'attempt-2', spawnProcess: spawner })),
      (err: unknown) => errCode(err) === 'validation_failed',
    );
    assert.equal(invocations.length, 0, 'changed contract must not spawn');
    assert.equal(service.getRoom('room-1')!.state, 'WAITING_FOR_USER_CONFIRMATION');
    assert.equal(service.getRun('run-1')!.status, 'needs_decision', 'Run waits for user, not executor');
    assert.equal(service.getAttempt('attempt-2'), null, 'changed contract must not claim an attempt');
    assert.equal(service.listEvents('room-1').length, eventsBefore, 'changed contract must not append an Event');
    assert.equal(existsSync(join(fixture, '.agent-room')), false);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('new commit and branch change do not block decision continuation in the same canonical worktree', async () => {
  const { fixture } = makeRepo();
  const service = makeDecisionReadyService(fixture);
  writeFileSync(join(fixture, 'drift.txt'), 'x');
  git(fixture, 'add', '.');
  git(fixture, 'commit', '-q', '-m', 'drift');
  git(fixture, 'switch', '-q', '-c', 'continuation-branch');
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = autoSpawner(child, () => {
    writeLines(child, [initLine(SESSION_ID), resultLine(SESSION_ID)]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt } = await runClaude(
      makeInput(service, fixture, { attemptId: 'attempt-2', spawnProcess: spawner }),
    );
    assert.equal(invocations.length, 1);
    assert.equal(attempt.status, 'succeeded');
    assert.equal(service.getRoom('room-1')!.state, 'DISCUSSION');
    assert.equal(run.status, 'review_required');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('decision continuation rejects a different canonical worktree before claim, process or artifact', async () => {
  const { fixture: canonicalWorktree } = makeRepo();
  const { fixture: otherWorktree } = makeRepo();
  const service = makeDecisionReadyService(canonicalWorktree);
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const before = durableSnapshot(service);
  try {
    await assert.rejects(
      () => runClaude(
        makeInput(service, otherWorktree, { attemptId: 'attempt-2', spawnProcess: spawner }),
      ),
      (err: unknown) => errCode(err) === 'validation_failed',
    );
    assert.equal(invocations.length, 0, 'wrong canonical worktree must not spawn a worker process');
    assert.equal(existsSync(join(otherWorktree, '.agent-room')), false, 'wrong worktree must not create artifacts');
    assert.equal(service.getAttempt('attempt-2'), null, 'wrong worktree must not claim an attempt');
    assert.deepEqual(durableSnapshot(service), before, 'wrong worktree must not change durable state');
  } finally {
    rmSync(canonicalWorktree, { recursive: true, force: true });
    rmSync(otherWorktree, { recursive: true, force: true });
  }
});

test('completion evidence classifies staged/unstaged/untracked and excludes runner artifacts', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
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
    const { attempt } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assert.equal(attempt.status, 'succeeded');
    assert.deepEqual(attempt.git_evidence, { staged: ['seed.txt'], unstaged: ['unstaged.txt'], untracked: ['untracked.txt'] });
    // Runner 自写的 artifact 不得进入 git evidence。
    const all = [...attempt.git_evidence.staged, ...attempt.git_evidence.unstaged, ...attempt.git_evidence.untracked];
    assert.ok(!all.some((p) => p.startsWith('.agent-room/')), 'artifact paths must not pollute git evidence');
    assert.deepEqual(attempt.artifact_refs, [ARTIFACT_STDOUT, ARTIFACT_STDERR]);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('spawn failure settles claude_start_failed exactly once', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const { spawner, invocations } = makeThrowingSpawner(new Error('ENOENT'));
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'failed');
    assert.equal(attempt.status, 'failed');
    assert.equal(attempt.failure?.code, 'claude_start_failed');
    assert.equal(invocations.length, 1);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('non-zero exit settles claude_exit_failed even with a valid terminal stream', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(), resultLine()]);
    child.emit('close', 7, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'failed');
    assert.equal(attempt.status, 'failed');
    assert.equal(attempt.failure?.code, 'claude_exit_failed');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('init missing the required room tool settles room_mcp_unavailable', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(SESSION_ID, ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'])]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    // required tool 缺失但合法 session 已观察：failure code=room_mcp_unavailable，且该
    // session 原子持久化到 attempt.agent_session_ref。
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'failed');
    assert.equal(attempt.status, 'failed');
    assert.equal(attempt.failure?.code, 'room_mcp_unavailable');
    assert.equal(attempt.agent_session_ref, SESSION_ID);
    const events = service.listEvents('room-1');
    assert.equal(events.filter((e) => e.type === 'run_attempt_failed').length, 1);
    assert.equal(events.filter((e) => e.type === 'run_attempt_succeeded').length, 0);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('non-completed coding result settles coding_result_invalid', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(), resultLine(SESSION_ID, makeCodingResult({ status: 'blocked' }))]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assertFailure(service, { run, attempt, room }, 'coding_result_invalid');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('git observation failure settles git_evidence_failed', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    // 在 clean-worktree check 之后损坏 index，仅让 completion evidence 失败。
    writeFileSync(join(fixture, '.git', 'index'), 'corrupt');
    writeLines(child, [initLine(), resultLine()]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'failed');
    assert.equal(attempt.failure?.code, 'git_evidence_failed');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('artifact write failure settles artifact_write_failed with empty refs', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    // 用文件挡住 .agent-room 目录，使 writeArtifacts 的 mkdirSync 失败。
    writeFileSync(join(fixture, '.agent-room'), 'blocker');
    writeLines(child, [initLine(), resultLine()]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'failed');
    assert.equal(attempt.failure?.code, 'artifact_write_failed');
    assert.deepEqual(attempt.artifact_refs, []);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// ---- central failure matrix ----
// 直接经 runClaude 覆盖 Contract 点名的 transport/stream failure path，证明每个 case 的
// 唯一 failure mapping、single terminal settlement（一次 run_attempt_failed、零次
// run_attempt_succeeded）与 Room/Run/attempt terminal state 一致。

test('asynchronous child error event settles claude_start_failed exactly once', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    child.emit('error', new Error('ECONNREFUSED'));
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assertFailure(service, { run, attempt, room }, 'claude_start_failed');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('stdin EPIPE then late close(0) settles claude_start_failed exactly once', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess(new Error('EPIPE'));
  const { spawner } = makeSpawner(child);
  // 先挂载 stdin error 等待，再启动；EPIPE 送达 transport 后再 emit late close(0)。
  const stdinError = whenStdinError(child);
  try {
    const outcome = runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    await stdinError;
    child.emit('close', 0, null); // late close 不得把已 settle 的 start failure 改写为 exit 0
    const { run, attempt, room } = await outcome;
    assertFailure(service, { run, attempt, room }, 'claude_start_failed');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('signal exit settles claude_exit_failed as interrupted even with a valid terminal stream', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(), resultLine()]);
    child.emit('close', null, 'SIGTERM');
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    // signal exit（非 cancel intent）：attempt interrupted，Run 仍 failed。
    assertFailure(service, { run, attempt, room }, 'claude_exit_failed', 'interrupted');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('missing init settles room_mcp_unavailable', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [resultLine()]); // terminal without init
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assertFailure(service, { run, attempt, room }, 'room_mcp_unavailable');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('invalid init (empty session) settles room_mcp_unavailable', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine('')]); // empty session_id -> init_error
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assertFailure(service, { run, attempt, room }, 'room_mcp_unavailable');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('duplicate init settles room_mcp_unavailable', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(), initLine()]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assertFailure(service, { run, attempt, room }, 'room_mcp_unavailable');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('malformed JSON line settles coding_result_invalid', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(), 'not json']);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assertFailure(service, { run, attempt, room }, 'coding_result_invalid');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('terminal session mismatch settles coding_result_invalid', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(SESSION_ID), resultLine('sess-other-0000-0000-0000-000000000000')]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assertFailure(service, { run, attempt, room }, 'coding_result_invalid');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('missing terminal settles coding_result_invalid', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine()]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assertFailure(service, { run, attempt, room }, 'coding_result_invalid');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('duplicate terminal settles coding_result_invalid', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    writeLines(child, [initLine(), resultLine(), resultLine()]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assertFailure(service, { run, attempt, room }, 'coding_result_invalid');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('error terminal settles coding_result_invalid', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
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
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assertFailure(service, { run, attempt, room }, 'coding_result_invalid');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('invalid CodingResult (schema failure) settles coding_result_invalid', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
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
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assertFailure(service, { run, attempt, room }, 'coding_result_invalid');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('mismatched CodingResult task_id settles coding_result_invalid', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
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
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assertFailure(service, { run, attempt, room }, 'coding_result_invalid');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// ---- needs-decision pause settlement ----
// Claude 在 attempt 内成功调用 room_ask_question 后，attempt 已被原子置为 decision_requested；
// Runner 必须走 pause classification 而不是普通 terminal：attempt 以 needs_decision settle，
// session/exit/result/failure/Git/artifact evidence 写回同一 attempt，绝不把 Run 改写为
// failed/review_required，也不改写 durable Question。

test('needs-decision pause finalizes session, result and evidence without succeeded/failed settlement', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    // 模拟 Claude 在 attempt 内经 room_ask_question 调用 RoomService（同步把 attempt 置
    // decision_requested），随后返回 valid needs_decision CodingResult 并 exit 0。
    service.askQuestion(makeQuestion(), WORKER);
    writeLines(child, [initLine(), resultLine(SESSION_ID, makeCodingResult({ status: 'needs_decision' }))]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'needs_decision');
    assert.equal(attempt.status, 'needs_decision');
    assert.notEqual(attempt.settled_at, null);
    assert.equal(attempt.agent_session_ref, SESSION_ID);
    assert.equal(attempt.process_exit_code, 0);
    assert.equal(attempt.result?.status, 'needs_decision');
    assert.deepEqual(attempt.git_evidence, { staged: [], unstaged: [], untracked: [] });
    assert.deepEqual(attempt.artifact_refs, [ARTIFACT_STDOUT, ARTIFACT_STDERR]);
    const events = service.listEvents('room-1');
    assert.equal(events.filter((e) => e.type === 'question_asked').length, 1, 'exactly one question_asked');
    assert.equal(events.filter((e) => e.type === 'run_attempt_needs_decision').length, 1, 'exactly one run_attempt_needs_decision');
    assert.equal(events.filter((e) => e.type === 'run_attempt_succeeded').length, 0, 'zero run_attempt_succeeded');
    assert.equal(events.filter((e) => e.type === 'run_attempt_failed').length, 0, 'zero run_attempt_failed');
    assert.equal(service.getQuestion('question-1')!.status, 'open');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('needs-decision pause with non-zero exit records claude_exit_failed and keeps the question open', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    service.askQuestion(makeQuestion(), WORKER);
    writeLines(child, [initLine(), resultLine()]);
    child.emit('close', 7, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'needs_decision');
    assert.equal(attempt.status, 'needs_decision');
    assert.equal(attempt.failure?.code, 'claude_exit_failed');
    assert.equal(attempt.agent_session_ref, SESSION_ID, 'observed session is still persisted on pause failure');
    assert.equal(service.getQuestion('question-1')!.status, 'open');
    const events = service.listEvents('room-1');
    assert.equal(events.filter((e) => e.type === 'run_attempt_needs_decision').length, 1);
    assert.equal(events.filter((e) => e.type === 'run_attempt_failed').length, 0);
    assert.equal(events.filter((e) => e.type === 'run_attempt_succeeded').length, 0);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('needs-decision pause with contradictory completed result records coding_result_invalid', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    service.askQuestion(makeQuestion(), WORKER);
    writeLines(child, [initLine(), resultLine(SESSION_ID, makeCodingResult({ status: 'completed' }))]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'needs_decision');
    assert.equal(attempt.status, 'needs_decision');
    assert.equal(attempt.failure?.code, 'coding_result_invalid');
    assert.equal(attempt.result, null);
    assert.equal(service.getQuestion('question-1')!.status, 'open');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('needs-decision pause with git observation failure records git_evidence_failed', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    service.askQuestion(makeQuestion(), WORKER);
    // 在 clean-worktree check 之后损坏 index，仅让 completion evidence 失败。
    writeFileSync(join(fixture, '.git', 'index'), 'corrupt');
    writeLines(child, [initLine(), resultLine(SESSION_ID, makeCodingResult({ status: 'needs_decision' }))]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'needs_decision');
    assert.equal(attempt.status, 'needs_decision');
    assert.equal(attempt.failure?.code, 'git_evidence_failed');
    assert.equal(service.getQuestion('question-1')!.status, 'open');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('needs-decision pause with artifact failure records artifact_write_failed', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    service.askQuestion(makeQuestion(), WORKER);
    // 用文件挡住 .agent-room 目录，使 writeArtifacts 的 mkdirSync 失败。
    writeFileSync(join(fixture, '.agent-room'), 'blocker');
    writeLines(child, [initLine(), resultLine(SESSION_ID, makeCodingResult({ status: 'needs_decision' }))]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'needs_decision');
    assert.equal(attempt.status, 'needs_decision');
    assert.equal(attempt.failure?.code, 'artifact_write_failed');
    assert.deepEqual(attempt.artifact_refs, []);
    assert.equal(service.getQuestion('question-1')!.status, 'open');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('needs-decision pause keeps pre-question progress before question_asked and appends none after', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    // Question 前：attempt 仍 running，init + 一个可识别非终态 progress 应追加恰好一个
    // run_attempt_progress。
    child.stdout.write(initLine() + '\n');
    child.stdout.write(line({ type: 'assistant', message: { content: 'before question' } }) + '\n');
    // 经真实 RoomService.askQuestion 把同一 attempt 原子置为 decision_requested。
    service.askQuestion(makeQuestion(), WORKER);
    // Question 后：assistant/tool_result 等非终态 progress 仍被 Runner 消费以完成 pause
    // evidence，但不得再进入 running-only appendAttemptProgress（修复前会抛 validation_failed）。
    child.stdout.write(line({ type: 'tool_result', tool_use_id: 'call-1', content: [{ type: 'text', text: 'asked' }] }) + '\n');
    child.stdout.write(resultLine(SESSION_ID, makeCodingResult({ status: 'needs_decision' })) + '\n');
    child.stdout.end();
    child.stderr.end();
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(makeInput(service, fixture, { spawnProcess: spawner }));
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'needs_decision');
    assert.equal(attempt.status, 'needs_decision');
    assert.notEqual(attempt.settled_at, null);
    assert.equal(attempt.agent_session_ref, SESSION_ID);
    assert.equal(attempt.process_exit_code, 0);
    assert.equal(attempt.result?.status, 'needs_decision');
    assert.deepEqual(attempt.git_evidence, { staged: [], unstaged: [], untracked: [] });
    assert.deepEqual(attempt.artifact_refs, [ARTIFACT_STDOUT, ARTIFACT_STDERR]);

    const events = service.listEvents('room-1');
    const progressEvents = events.filter((e) => e.type === 'run_attempt_progress');
    const questionEvents = events.filter((e) => e.type === 'question_asked');
    assert.equal(progressEvents.length, 1, 'exactly one pre-question run_attempt_progress');
    assert.equal(questionEvents.length, 1, 'exactly one question_asked');
    // 以 Event sequence 而非仅总数证明分界：Question 前 progress 的 sequence 小于 question_asked，
    // 且 Question 后没有新增任何 run_attempt_progress。
    assert.ok(progressEvents[0].sequence < questionEvents[0].sequence, 'progress must precede question_asked');
    assert.equal(events.filter((e) => e.type === 'run_attempt_needs_decision').length, 1, 'exactly one run_attempt_needs_decision');
    assert.equal(events.filter((e) => e.type === 'run_attempt_succeeded').length, 0, 'zero run_attempt_succeeded');
    assert.equal(events.filter((e) => e.type === 'run_attempt_failed').length, 0, 'zero run_attempt_failed');
    assert.equal(service.getQuestion('question-1')!.status, 'open');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('retry continuation resumes the exact lineage session and preserves a dirty worktree', async () => {
  const { fixture } = makeRepo();
  // 保留 source attempt 未完成的变更：retry 不得要求 clean worktree，也不清理 lineage 变更。
  writeFileSync(join(fixture, 'failed-change.txt'), 'partial');
  const service = makeRetryReadyService(fixture, SESSION_ID);
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = autoSpawner(child, () => {
    writeLines(child, [initLine(SESSION_ID), resultLine(SESSION_ID)]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(
      makeInput(service, fixture, { attemptId: 'attempt-2', spawnProcess: spawner }),
    );
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'review_required');
    assert.equal(run.run_id, 'run-1');
    assert.equal(attempt.status, 'succeeded');
    assert.equal(attempt.result?.task_id, TASK_ID);
    assert.equal(attempt.agent_session_ref, SESSION_ID);

    const args = invocations[0].args;
    const resumeIndex = args.indexOf('--resume');
    assert.ok(resumeIndex >= 0, 'retry with a session must pass --resume');
    assert.equal(args[resumeIndex + 1], SESSION_ID);
    assert.ok(!args.includes('--continue'), 'must never use --continue');

    // prompt 包含完整 persisted TaskContract 且明确 continuation_kind=retry。
    await whenStdinFinished(child);
    assert.ok(child.stdinWritten.includes('continuation_kind: retry'), 'stdin must mark continuation_kind retry');
    assert.ok(child.stdinWritten.includes(TASK_ID), 'stdin must carry the full persisted contract');

    assert.equal(existsSync(join(fixture, 'failed-change.txt')), true, 'retry must keep the dirty worktree change');

    // resume 语义：retry 只追加 run_retried（retryRun）+ 第二个 attempt 的 claim/terminal；
    // task_submitted 仅来自 fixture 的原始提交，retry 不创建新 Task/lineage。
    const events = service.listEvents('room-1');
    assert.equal(events.filter((e) => e.type === 'run_retried').length, 1);
    assert.equal(events.filter((e) => e.type === 'run_created').length, 1);
    assert.equal(events.filter((e) => e.type === 'task_submitted').length, 1);
    assert.equal(events.filter((e) => e.type === 'run_attempt_claimed').length, 2);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('retry with an empty source session omits --resume and starts a replacement session in the same task lineage', async () => {
  const { fixture } = makeRepo();
  // source attempt 的 agent_session_ref 为空字符串：不得生成 --resume ''，由 Claude 创建
  // replacement session，但 Task lineage 保持不变。
  const service = makeRetryReadyService(fixture, '');
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = autoSpawner(child, () => {
    writeLines(child, [initLine(REPLACEMENT_SESSION_ID), resultLine(REPLACEMENT_SESSION_ID)]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt, room } = await runClaude(
      makeInput(service, fixture, { attemptId: 'attempt-2', spawnProcess: spawner }),
    );
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'review_required');
    assert.equal(run.run_id, 'run-1');
    assert.equal(attempt.status, 'succeeded');
    assert.equal(attempt.result?.task_id, TASK_ID);
    assert.equal(attempt.agent_session_ref, REPLACEMENT_SESSION_ID);

    const args = invocations[0].args;
    assert.ok(!args.includes('--resume'), 'empty source session must omit --resume');
    assert.ok(!args.includes('--continue'), 'must never use --continue');
    await whenStdinFinished(child);
    assert.ok(child.stdinWritten.includes('continuation_kind: retry'));
    // 同一 Task lineage：无新 task_submitted，retry 语义 Event 正确。
    const events = service.listEvents('room-1');
    assert.equal(events.filter((e) => e.type === 'run_retried').length, 1);
    assert.equal(events.filter((e) => e.type === 'task_submitted').length, 1);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('retry continues after HEAD drift in the same canonical worktree', async () => {
  const { fixture } = makeRepo();
  const service = makeRetryReadyService(fixture, SESSION_ID);
  writeFileSync(join(fixture, 'new-commit.txt'), 'drift');
  git(fixture, 'add', '.');
  git(fixture, 'commit', '-q', '-m', 'new commit');
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = autoSpawner(child, () => {
    writeLines(child, [initLine(SESSION_ID), resultLine(SESSION_ID)]);
    child.emit('close', 0, null);
  });
  try {
    const { run, attempt } = await runClaude(
      makeInput(service, fixture, { attemptId: 'attempt-2', spawnProcess: spawner }),
    );
    assert.equal(invocations.length, 1);
    assert.equal(attempt.status, 'succeeded');
    assert.equal(run.status, 'review_required');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('a fix continuation without a reliable session rejects before spawn, claim, artifact or Event', async () => {
  const { fixture } = makeRepo();
  const db = new DatabaseSync(':memory:');
  const service = new RoomService(db);
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER);
  claimAttempt(service, 'attempt-1', fixture);
  settleSucceeded(service, 'attempt-1', null); // source attempt 无 session
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER);
  service.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', run_id: 'run-1' }),
    PLANNER,
  ); // fix task-2, run-1 ready
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const eventsBefore = service.listEvents('room-1').length;
  try {
    await assert.rejects(
      () => runClaude(makeInput(service, fixture, { attemptId: 'attempt-2', spawnProcess: spawner })),
      (err: unknown) => errCode(err) === 'validation_failed',
    );
    assert.equal(invocations.length, 0, 'session-less fix must not spawn');
    assert.equal(service.getAttempt('attempt-2'), null, 'session-less fix must not claim an attempt');
    assert.equal(service.listEvents('room-1').length, eventsBefore, 'session-less fix must not append an Event');
    assert.equal(service.getRun('run-1')!.status, 'ready');
    assert.equal(existsSync(join(fixture, '.agent-room')), false);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('a Run with no resolved executor assignment rejects before spawn, claim, artifact or Event', async () => {
  const { service, db } = makeServiceWithDb();
  const { fixture } = makeRepo();
  // 最窄 fixture mutation：删除 room 与 task scope 的全部 executor assignment，表达
  // assignment 损坏；正常 public lifecycle 无法产生（bootstrap 固定 executor=local-runner）。
  db.prepare("DELETE FROM role_assignments WHERE json_extract(content_json, '$.role') = ?").run('executor');
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const eventsBefore = service.listEvents('room-1').length;
  try {
    await assert.rejects(
      () => runClaude(makeInput(service, fixture, { spawnProcess: spawner })),
      (err: unknown) => errCode(err) === 'validation_failed',
    );
    assert.equal(invocations.length, 0, 'missing executor assignment must not spawn');
    assert.equal(service.getAttempt('attempt-1'), null, 'missing executor assignment must not claim');
    assert.equal(service.listEvents('room-1').length, eventsBefore, 'missing executor assignment must not append an Event');
    assert.equal(service.getRoom('room-1')!.state, 'DISCUSSION');
    assert.equal(existsSync(join(fixture, '.agent-room')), false);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('a failed Run that was not retried rejects before spawn with unchanged durable snapshot', async () => {
  const { fixture } = makeRepo();
  const service = makeService();
  claimAttempt(service, 'attempt-1', fixture);
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
  ); // Run failed，未 retryRun
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const eventsBefore = service.listEvents('room-1').length;
  try {
    await assert.rejects(
      () => runClaude(makeInput(service, fixture, { attemptId: 'attempt-2', spawnProcess: spawner })),
      (err: unknown) => errCode(err) === 'validation_failed',
    );
    assert.equal(invocations.length, 0, 'failed Run must not spawn');
    assert.equal(service.getAttempt('attempt-2'), null, 'failed Run must not claim an attempt');
    assert.equal(service.listEvents('room-1').length, eventsBefore, 'failed Run must not append an Event');
    assert.equal(service.getRun('run-1')!.status, 'failed');
    assert.equal(service.getRoom('room-1')!.state, 'DISCUSSION');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// Review 2 confirmed finding inc6-r2-retry-negative-matrix-incomplete：损坏的 current-Run
// retry source（正常 public lifecycle 无法产生，只能经最窄 fixture SQL 构造）必须直接穿过
// runClaude public boundary，在 spawn/新 attempt/artifact/Event 之前以既有 ProtocolError
// 拒绝。runs/run_attempts 存 content_json，可在测试侧临时 SQLite 内表达 dangling reference
// 与 status 不一致；不引入 production mutation API。

test('retry with a missing source run rejects before spawn, attempt, artifact or Event with unchanged durable snapshot', async () => {
  const { fixture } = makeRepo();
  const service = makeService();
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const snapshot = () => {
    const events = service.listEvents('room-1');
    return {
      room: service.getRoom('room-1'),
      task: service.getTask(TASK_ID),
      runs: [service.getRun('ghost-run')],
      reviews: [service.getReview('review-1')],
      questions: [service.getQuestion('question-1')],
      events,
      cursor: events.length === 0 ? 0 : events[events.length - 1].sequence,
    };
  };
  const before = snapshot();
  const worktreeBefore = {
    head: git(fixture, 'rev-parse', 'HEAD'),
    porcelain: git(fixture, 'status', '--porcelain'),
  };
  try {
    await assert.rejects(
      () => runClaude(makeInput(service, fixture, { runId: 'ghost-run', spawnProcess: spawner })),
      (err: unknown) => errCode(err) === 'entity_not_found',
    );
    assert.equal(invocations.length, 0, 'missing source run must not spawn a Claude process');
    assert.equal(service.getAttempt('attempt-1'), null, 'missing source run must not claim an attempt');
    assert.equal(existsSync(join(fixture, '.agent-room')), false, 'missing source run must not write artifacts');
    assert.deepEqual(snapshot(), before, 'Room/Task/Run/Review/Question/Event/cursor must be unchanged');
    assert.deepEqual(
      { head: git(fixture, 'rev-parse', 'HEAD'), porcelain: git(fixture, 'status', '--porcelain') },
      worktreeBefore,
      'worktree authority must be unchanged',
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('retry with a non-ready source run rejects before spawn, attempt, artifact or Event with unchanged durable snapshot', async () => {
  const { fixture } = makeRepo();
  const db = new DatabaseSync(':memory:');
  const service = new RoomService(db);
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER);
  claimAttempt(service, 'attempt-1', fixture);
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
  service.retryRun('room-1', 'run-1', PLANNER); // Run -> ready
  // 最窄 fixture mutation：run-1 已回到 ready，但其 status 被翻转为 running，表达 source
  // Run 状态不一致。Run 以 content_json 存储，必须 parse + set + re-stringify 整体替换。
  const runRow = db.prepare('SELECT content_json FROM runs WHERE run_id = ?').get('run-1') as {
    content_json: string;
  };
  const runJson = JSON.parse(runRow.content_json) as { status: string };
  runJson.status = 'running';
  db.prepare('UPDATE runs SET content_json = ? WHERE run_id = ?').run(JSON.stringify(runJson), 'run-1');
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const snapshot = () => {
    const events = service.listEvents('room-1');
    return {
      room: service.getRoom('room-1'),
      task: service.getTask(TASK_ID),
      runs: [service.getRun('run-1')],
      reviews: [service.getReview('review-1')],
      questions: [service.getQuestion('question-1')],
      events,
      cursor: events.length === 0 ? 0 : events[events.length - 1].sequence,
    };
  };
  const before = snapshot();
  const worktreeBefore = {
    head: git(fixture, 'rev-parse', 'HEAD'),
    porcelain: git(fixture, 'status', '--porcelain'),
  };
  try {
    await assert.rejects(
      () => runClaude(makeInput(service, fixture, { attemptId: 'attempt-2', spawnProcess: spawner })),
      (err: unknown) => errCode(err) === 'validation_failed',
    );
    assert.equal(invocations.length, 0, 'non-ready source run must not spawn a Claude process');
    assert.equal(service.getAttempt('attempt-2'), null, 'non-ready source run must not claim an attempt');
    assert.equal(existsSync(join(fixture, '.agent-room')), false, 'non-ready source run must not write artifacts');
    assert.deepEqual(snapshot(), before, 'Room/Task/Run/Review/Question/Event/cursor must be unchanged');
    assert.deepEqual(
      { head: git(fixture, 'rev-parse', 'HEAD'), porcelain: git(fixture, 'status', '--porcelain') },
      worktreeBefore,
      'worktree authority must be unchanged',
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('retry with a non-terminal source attempt rejects before spawn, attempt, artifact or Event with unchanged durable snapshot', async () => {
  const { fixture } = makeRepo();
  const db = new DatabaseSync(':memory:');
  const service = new RoomService(db);
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER);
  claimAttempt(service, 'attempt-1', fixture);
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
  service.retryRun('room-1', 'run-1', PLANNER); // Run -> ready
  // 最窄 fixture mutation：attempt-1 已 failed，但其 status 被翻转为 running，表达 source
  // attempt 与 Run ready 不一致（active attempt）；正常 lifecycle 无法产生。claim 的 active
  // attempt gate 必须以 run_already_active 拒绝。
  const attemptRow = db.prepare('SELECT content_json FROM run_attempts WHERE attempt_id = ?').get('attempt-1') as {
    content_json: string;
  };
  const attemptJson = JSON.parse(attemptRow.content_json) as { status: string };
  attemptJson.status = 'running';
  // projection status 列与 content_json 是同一事务写入的持久化事实，gate 与 partial unique
  // index 都读 projection；fixture 必须同步翻转两处，否则 claim 门禁看不见该损坏状态。
  db.prepare('UPDATE run_attempts SET content_json = ?, status = ? WHERE attempt_id = ?').run(
    JSON.stringify(attemptJson),
    'running',
    'attempt-1',
  );
  const { spawner, invocations } = makeSpawner(new FakeClaudeProcess());
  const snapshot = () => {
    const events = service.listEvents('room-1');
    return {
      room: service.getRoom('room-1'),
      task: service.getTask(TASK_ID),
      runs: [service.getRun('run-1')],
      reviews: [service.getReview('review-1')],
      questions: [service.getQuestion('question-1')],
      events,
      cursor: events.length === 0 ? 0 : events[events.length - 1].sequence,
    };
  };
  const before = snapshot();
  const worktreeBefore = {
    head: git(fixture, 'rev-parse', 'HEAD'),
    porcelain: git(fixture, 'status', '--porcelain'),
  };
  try {
    await assert.rejects(
      () => runClaude(makeInput(service, fixture, { attemptId: 'attempt-2', spawnProcess: spawner })),
      (err: unknown) => errCode(err) === 'run_already_active',
    );
    assert.equal(invocations.length, 0, 'non-terminal source attempt must not spawn a Claude process');
    assert.equal(service.getAttempt('attempt-2'), null, 'non-terminal source attempt must not claim an attempt');
    assert.equal(existsSync(join(fixture, '.agent-room')), false, 'non-terminal source attempt must not write artifacts');
    assert.deepEqual(snapshot(), before, 'Room/Task/Run/Review/Question/Event/cursor must be unchanged');
    assert.deepEqual(
      { head: git(fixture, 'rev-parse', 'HEAD'), porcelain: git(fixture, 'status', '--porcelain') },
      worktreeBefore,
      'worktree authority must be unchanged',
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('retry run that fails again settles failed with terminal evidence and keeps the worktree', async () => {
  const { fixture } = makeRepo();
  const service = makeRetryReadyService(fixture, SESSION_ID);
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    // retry 期间产生新的未完成变更；non-zero exit 使 retry attempt 失败。
    writeFileSync(join(fixture, 'retry-change.txt'), 'again');
    writeLines(child, [initLine(SESSION_ID)]);
    child.emit('close', 1, null);
  });
  try {
    const { run, attempt, room } = await runClaude(
      makeInput(service, fixture, { attemptId: 'attempt-2', spawnProcess: spawner }),
    );
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.run_id, 'run-1');
    assert.equal(run.status, 'failed');
    assert.equal(attempt.attempt_id, 'attempt-2');
    assert.equal(attempt.status, 'failed');
    assert.equal(attempt.failure?.code, 'claude_exit_failed');
    assert.equal(attempt.agent_session_ref, SESSION_ID, 'observed session persists even on failure');
    assert.notEqual(attempt.settled_at, null);
    // 失败 attempt 的 completion evidence 捕获 retry 期间产生的变更，不降级为空；
    // artifact refs 属于 retry attempt 自身（attempt-2），不是 source attempt。
    assert.deepEqual(attempt.git_evidence, { staged: [], unstaged: [], untracked: ['retry-change.txt'] });
    assert.deepEqual(attempt.artifact_refs, [
      '.agent-room/artifacts/attempt-2/stdout.jsonl',
      '.agent-room/artifacts/attempt-2/stderr.log',
    ]);
    assert.equal(existsSync(join(fixture, 'retry-change.txt')), true, 'failed retry keeps worktree changes');

    const events = service.listEvents('room-1');
    assert.equal(events.filter((e) => e.type === 'run_retried').length, 1);
    assert.equal(events.filter((e) => e.type === 'run_attempt_failed').length, 2, 'two failures in the lineage');
    assert.equal(events.filter((e) => e.type === 'run_attempt_succeeded').length, 0);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// ---- cancel boundary ----
// planner 经 room_cancel_run 写入 cancel_requested 后，Executor 的 poll boundary 必须 abort
// owned process 并以 canceled 唯一 settle attempt；canonical canceled payload（Review finding
// inc10-r2）为 result=null + failure=null，Run 与 Room 不再进入 failed/review_required。

test('planner cancel settles the active attempt as canceled and kills the owned process', async () => {
  const service = makeService();
  const { fixture } = makeRepo();
  const child = new FakeClaudeProcess();
  const { spawner } = autoSpawner(child, () => {
    child.stdout.write(`${initLine()}\n`);
    // planner 在 attempt running 期间取消：Run+active attempt -> cancel_requested。
    service.cancelRun(
      { room_id: 'room-1', run_id: 'run-1', reason: 'stop', confirmed_by_user: true },
      PLANNER,
    );
  });
  try {
    const { run, attempt, room } = await runClaude(
      makeInput(service, fixture, { spawnProcess: spawner, pollIntervalMs: 10 }),
    );
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(run.status, 'canceled');
    assert.equal(attempt.status, 'canceled');
    // canonical canceled payload：service 丢弃 Executor 的 canceled failure 分类。
    assert.equal(attempt.failure, null);
    assert.equal(attempt.result, null);
    assert.equal(child.killed, 'SIGTERM', 'cancel must kill the owned process');
    const events = service.listEvents('room-1');
    assert.equal(events.filter((e) => e.type === 'run_cancel_requested').length, 1);
    assert.equal(events.filter((e) => e.type === 'run_attempt_canceled').length, 1);
    assert.equal(events.filter((e) => e.type === 'run_attempt_failed').length, 0);
    assert.equal(events.filter((e) => e.type === 'run_attempt_succeeded').length, 0);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
