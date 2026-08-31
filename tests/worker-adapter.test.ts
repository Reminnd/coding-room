import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FakeClaudeProcess,
  makeSpawner,
  makeThrowingSpawner,
} from './runner-fixtures/claude-process-fake.ts';
import {
  ClaudeProcessInputError,
  ClaudeProcessStartError,
  type ClaudeProcessSpawn,
} from '../src/runner/claude-process.ts';
import { ProtocolError } from '../src/protocol/errors.ts';
import {
  ClaudeCodeWorkerAdapter,
  selectWorkerAdapter,
  type WorkerAdapterExecuteInput,
  type WorkerAdapterOutcome,
} from '../src/runner/worker-adapter.ts';

// v0.4 Stage 2 worker-adapter 单元回归：Executor 与 Worker 之间唯一 provider-neutral seam。
// 只验证 adapter 边界本身——
//   - selectWorkerAdapter 只接受 claude_code_cli，其余 adapter id 一律 worker_adapter_unavailable
//     （claim 前拒绝，零 attempt/process/Event/artifact 副作用）；
//   - ClaudeCodeWorkerAdapter.execute 把一次 process invocation 汇总为 process/stream/raw
//     输出三类观察事实：process 层失败与正常 outcome 互斥，stream 解释结果永远存在；
//     terminal 分类与 Room 状态不属于本层。
// 独立 literal oracle：session/tool/task、CodingResult 期望、progress 形状全部来自本测试侧。

const SESSION_ID = 'sess-00000000-0000-4000-8000-00000000000a';
const REQUIRED_TOOL = 'mcp__agent_room__room_ask_question' as const;
const TASK_ID = 'increment-010-worker-adapter';
const PROMPT = 'FULL CONTRACT PROMPT';
const CWD = 'C:\\work\\fixture';

function expectedCodingResult(): Record<string, unknown> {
  return {
    task_id: TASK_ID,
    status: 'completed',
    summary: 'worker adapter facts collected',
    changed_files: [{ path: 'src/runner/worker-adapter.ts', purpose: 'adapter seam' }],
    deviations: [],
    verification: [{ command: 'npm test', status: 'passed', result: 'all tests pass' }],
    tests: [{ path: 'tests/worker-adapter.test.ts', behavior: 'adapter seam coverage' }],
    documentation_changes: [],
    unresolved: [],
    questions: [],
  };
}

function line(event: Record<string, unknown>): string {
  return JSON.stringify(event);
}

function makeInit(overrides: Record<string, unknown> = {}): string {
  return line({
    type: 'system',
    subtype: 'init',
    session_id: SESSION_ID,
    tools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', REQUIRED_TOOL],
    mcp_servers: [{ name: 'agent_room' }],
    permissionMode: 'dontAsk',
    claude_code_version: '2.1.241',
    ...overrides,
  });
}

function makeResult(overrides: Record<string, unknown> = {}): string {
  return line({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: SESSION_ID,
    result: JSON.stringify(expectedCodingResult()),
    structured_output: expectedCodingResult(),
    stop_reason: 'tool_use',
    ...overrides,
  });
}

function makeInput(
  spawnProcess: ClaudeProcessSpawn,
  overrides: Partial<WorkerAdapterExecuteInput> = {},
): WorkerAdapterExecuteInput {
  return {
    cwd: CWD,
    prompt: PROMPT,
    codingResultJsonSchema: '{"type":"object"}',
    mcpConfig: '{"mcpServers":{"agent_room":{}}}',
    resumeSessionId: SESSION_ID,
    expectedTaskId: TASK_ID,
    spawnProcess,
    onProgress: () => {},
    ...overrides,
  };
}

// 在 startClaudeProcess 同步挂载 handler 之后才写 stdout/stderr 并 close。
function driveOnSpawn(child: FakeClaudeProcess, drive: () => void): void {
  setImmediate(drive);
}

// ---- adapter selection ----

test('selectWorkerAdapter returns the only implemented adapter for claude_code_cli', () => {
  const adapter = selectWorkerAdapter('claude_code_cli');
  assert.ok(adapter instanceof ClaudeCodeWorkerAdapter);
  assert.equal(adapter.adapterId, 'claude_code_cli');
});

test('selectWorkerAdapter rejects every other adapter id with worker_adapter_unavailable', () => {
  for (const adapterId of ['codex', 'openai_agent', 'claude_code_api', '']) {
    assert.throws(
      () => selectWorkerAdapter(adapterId),
      (err: unknown) => err instanceof ProtocolError && err.code === 'worker_adapter_unavailable',
    );
  }
});

// ---- execute：三类观察事实 ----

test('execute collects process/stream/raw-output facts from one invocation', async () => {
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = makeSpawner(child);
  const progress: { type: string | null; subtype: string | null; outcome: string | null }[] = [];
  const progressLine = line({ type: 'assistant', subtype: null });
  const input = makeInput(spawner, {
    onProgress: (p) => progress.push(p),
  });
  const adapter = new ClaudeCodeWorkerAdapter();

  const outcomePromise = adapter.execute(input);
  driveOnSpawn(child, () => {
    child.stdout.write(`${makeInit()}\n`);
    child.stdout.write(`${progressLine}\n`);
    child.stdout.write(`${makeResult()}\n`);
    child.stdout.end();
    child.stderr.write('warn: chunk one');
    child.emit('close', 0, null);
  });
  const outcome: WorkerAdapterOutcome = await outcomePromise;

  // process 边界：spawn 只调用一次，argument contract 完整且 resume 按 lineage 精确传递。
  assert.equal(invocations.length, 1);
  const invocation = invocations[0];
  assert.equal(invocation.command, 'claude');
  assert.deepEqual(invocation.options, { cwd: CWD, shell: false });
  const args = invocation.args;
  assert.ok(args.includes('-p'));
  assert.ok(args.includes('--output-format'));
  assert.ok(args.includes('stream-json'));
  assert.equal(args[args.indexOf('--json-schema') + 1], input.codingResultJsonSchema);
  assert.equal(args[args.indexOf('--mcp-config') + 1], input.mcpConfig);
  assert.equal(args[args.indexOf('--resume') + 1], SESSION_ID);
  assert.ok(!args.includes('--continue'), 'adapter 绝不使用 --continue 推断最近 session');
  assert.ok(child.stdinWritten.includes(PROMPT), '完整 prompt 必须送达 stdin');

  // process 层事实：正常 exit outcome，无 process 层错误。
  assert.equal(outcome.processError, null);
  assert.deepEqual(outcome.processOutcome, { exitCode: 0, signal: null });

  // stream 层事实：成功 outcome，session 与 task 通过约束。
  if (!outcome.streamOutcome.ok) {
    assert.fail(`expected stream success, got ${outcome.streamOutcome.reason}`);
  }
  assert.equal(outcome.streamOutcome.sessionId, SESSION_ID);
  assert.equal(outcome.streamOutcome.codingResult.task_id, TASK_ID);

  // raw 输出事实：只在 outcome 单点累积，逐行/逐 chunk 保序。
  assert.deepEqual(outcome.stdoutLines, [makeInit(), progressLine, makeResult()]);
  assert.deepEqual(outcome.stderrChunks, ['warn: chunk one']);

  // 非终态 progress evidence 逐条透传，init/result 不算 progress。
  assert.deepEqual(progress, [{ type: 'assistant', subtype: null, outcome: null }]);
});

test('execute omits --resume when no lineage session exists', async () => {
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = makeSpawner(child);
  const adapter = new ClaudeCodeWorkerAdapter();

  const outcomePromise = adapter.execute(makeInput(spawner, { resumeSessionId: null }));
  driveOnSpawn(child, () => {
    child.stdout.write(`${makeInit()}\n`);
    child.stdout.write(`${makeResult()}\n`);
    child.stdout.end();
    child.emit('close', 0, null);
  });
  const outcome = await outcomePromise;

  assert.ok(!invocations[0].args.includes('--resume'));
  if (!outcome.streamOutcome.ok) {
    assert.fail(`expected stream success, got ${outcome.streamOutcome.reason}`);
  }
  assert.equal(outcome.streamOutcome.sessionId, SESSION_ID);
});

// ---- process 层失败：与 stream outcome 互斥共存 ----

test('execute reports spawn start failure as processError without throwing', async () => {
  const { spawner, invocations } = makeThrowingSpawner(new Error('ENOENT'));
  const outcome = await new ClaudeCodeWorkerAdapter().execute(makeInput(spawner));

  assert.equal(invocations.length, 1);
  assert.ok(outcome.processError instanceof ClaudeProcessStartError);
  assert.equal(outcome.processError.command, 'claude');
  assert.equal(outcome.processError.cwd, CWD);
  assert.equal(outcome.processOutcome, null);
  // stream 从未收到任何 line，解释结果固定为 init_missing 失败，仍存在。
  if (outcome.streamOutcome.ok) {
    assert.fail('expected stream failure after process start error');
  }
  assert.equal(outcome.streamOutcome.reason, 'init_missing');
  assert.deepEqual(outcome.stdoutLines, []);
  assert.deepEqual(outcome.stderrChunks, []);
});

test('execute reports stdin delivery failure as processError without throwing', async () => {
  const child = new FakeClaudeProcess(new Error('EPIPE'));
  const { spawner, invocations } = makeSpawner(child);
  const outcome = await new ClaudeCodeWorkerAdapter().execute(makeInput(spawner));

  assert.equal(invocations.length, 1);
  assert.ok(outcome.processError instanceof ClaudeProcessInputError);
  assert.equal(outcome.processError.command, 'claude');
  assert.equal(outcome.processError.cwd, CWD);
  assert.equal(outcome.processOutcome, null);
  if (outcome.streamOutcome.ok) {
    assert.fail('expected stream failure after stdin delivery error');
  }
  assert.equal(outcome.streamOutcome.reason, 'init_missing');
});

// ---- cancel boundary：signal 原样透传，不伪造 exit code ----

test('execute passes abort through to the owned process and keeps facts separate', async () => {
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = makeSpawner(child);
  const controller = new AbortController();
  const adapter = new ClaudeCodeWorkerAdapter();

  const outcomePromise = adapter.execute(
    makeInput(spawner, { signal: controller.signal }),
  );
  driveOnSpawn(child, () => {
    child.stdout.write(`${makeInit()}\n`);
    child.stdout.end();
    controller.abort();
  });
  const outcome = await outcomePromise;

  assert.equal(invocations.length, 1);
  assert.equal(child.killed, 'SIGTERM', 'abort 必须终止 owned process');
  // 正常 close outcome：exitCode null + signal，terminal canceled 分类由 Executor 决定。
  assert.deepEqual(outcome.processOutcome, { exitCode: null, signal: 'SIGTERM' });
  assert.equal(outcome.processError, null);
  if (outcome.streamOutcome.ok) {
    assert.fail('expected stream failure after abort before result');
  }
  assert.equal(outcome.streamOutcome.reason, 'terminal_missing');
});

// ---- 单次 settlement：process 成功但 stream 失败时两类事实并存、adapter 不分类 ----

test('execute keeps process success and stream failure separate on task id mismatch', async () => {
  const child = new FakeClaudeProcess();
  const { spawner } = makeSpawner(child);
  const adapter = new ClaudeCodeWorkerAdapter();

  const outcomePromise = adapter.execute(makeInput(spawner));
  driveOnSpawn(child, () => {
    child.stdout.write(`${makeInit()}\n`);
    child.stdout.write(
      `${makeResult({ structured_output: { ...expectedCodingResult(), task_id: 'other-task' } })}\n`,
    );
    child.stdout.end();
    child.emit('close', 0, null);
  });
  const outcome = await outcomePromise;

  assert.deepEqual(outcome.processOutcome, { exitCode: 0, signal: null });
  assert.equal(outcome.processError, null);
  if (outcome.streamOutcome.ok) {
    assert.fail('expected task_id_mismatch stream failure');
  }
  assert.equal(outcome.streamOutcome.reason, 'task_id_mismatch');
});

test('execute threads resumeSessionId into interpreter session lineage check', async () => {
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = makeSpawner(child);
  const adapter = new ClaudeCodeWorkerAdapter();

  const outcomePromise = adapter.execute(makeInput(spawner, { resumeSessionId: 'sess-other' }));
  driveOnSpawn(child, () => {
    child.stdout.write(`${makeInit()}\n`);
    child.stdout.write(`${makeResult()}\n`);
    child.stdout.end();
    child.emit('close', 0, null);
  });
  const outcome = await outcomePromise;

  // lineage session 既进入 --resume argument，也进入 interpreter 的 expected-session 约束。
  assert.equal(invocations[0].args[invocations[0].args.indexOf('--resume') + 1], 'sess-other');
  if (outcome.streamOutcome.ok) {
    assert.fail('expected session_mismatch stream failure');
  }
  assert.equal(outcome.streamOutcome.reason, 'session_mismatch');
  // 未通过 expected-session 约束的 session 不可靠，interpreter 不把它当已观察事实。
  assert.equal(outcome.streamOutcome.sessionId, null);
});
