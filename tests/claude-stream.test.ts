import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ClaudeStreamInterpreter,
  type ClaudeStreamFailure,
  type ClaudeStreamFailureReason,
  type ClaudeStreamOutcome,
  type ClaudeStreamSuccess,
} from '../src/runner/claude-stream.ts';

// 独立 literal：session/tool/task 与 CodingResult 期望来自本测试侧，不从实现导入。
const SESSION_ID = 'sess-00000000-0000-4000-8000-000000000001';
const REQUIRED_TOOL = 'mcp__agent_room__room_ask_question' as const;
const TASK_ID = 'increment-003b-claude-stream-interpreter';

function expectedCodingResult(): Record<string, unknown> {
  return {
    task_id: TASK_ID,
    status: 'completed',
    summary: 'Claude stream interpreter implemented and verified',
    changed_files: [{ path: 'src/runner/claude-stream.ts', purpose: 'stream interpretation leaf' }],
    deviations: [],
    verification: [{ command: 'npm test', status: 'passed', result: 'all tests pass' }],
    tests: [{ path: 'tests/claude-stream.test.ts', behavior: 'stream interpretation coverage' }],
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

function interpret(lines: string[], expectedSessionId: string | null = null): ClaudeStreamOutcome {
  const interpreter = new ClaudeStreamInterpreter({
    expectedTaskId: TASK_ID,
    requiredToolName: REQUIRED_TOOL,
    expectedSessionId,
  });
  for (const l of lines) interpreter.acceptLine(l);
  return interpreter.finish();
}

function expectSuccess(outcome: ClaudeStreamOutcome): ClaudeStreamSuccess {
  if (!outcome.ok) {
    assert.fail(`expected success but got failure: ${outcome.reason}`);
  }
  return outcome;
}

function expectFailure(
  outcome: ClaudeStreamOutcome,
  reason: ClaudeStreamFailureReason,
): ClaudeStreamFailure {
  if (outcome.ok) {
    assert.fail(`expected failure ${reason} but got success`);
  }
  assert.equal(outcome.reason, reason);
  return outcome;
}

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'runner-fixtures');

function fixtureLines(name: string): string[] {
  return readFileSync(join(fixtureDir, name), 'utf8').split('\n');
}

test('new-session stream with pre-init hooks and StructuredOutput round-trip yields a validated success', () => {
  const outcome = expectSuccess(interpret(fixtureLines('claude-stream-new-session.jsonl')));

  assert.equal(outcome.sessionId, SESSION_ID);
  assert.deepEqual(outcome.requiredTool, { name: REQUIRED_TOOL, present: true });
  assert.equal(outcome.terminal.stopReason, 'tool_use');
  assert.equal(outcome.codingResult.task_id, TASK_ID);
  // CodingResult 与 terminal structured_output object 结构一致，无额外或缺失字段。
  assert.deepEqual(outcome.codingResult, expectedCodingResult());
  // terminal result JSON string 作为 raw evidence 保留，内容与 structured_output 一致。
  assert.equal(typeof outcome.terminal.resultRaw, 'string');
  assert.deepEqual(JSON.parse(outcome.terminal.resultRaw as string), expectedCodingResult());

  // init 抽取的可用字段。
  assert.deepEqual(outcome.init.tools, ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', REQUIRED_TOOL]);
  assert.equal(outcome.init.permissionMode, 'dontAsk');
  assert.equal(outcome.init.claudeCodeVersion, '2.1.241');
  assert.deepEqual(outcome.init.mcpServers, [{ name: 'agent_room' }]);

  // hook_started / hook_response(outcome=error) / thinking_tokens 保留为非终态 progress evidence；
  // hook failure 不决定 Run failure。
  const subtypes = outcome.progress.map((p) => `${p.type}:${p.subtype}`);
  assert.ok(subtypes.includes('system:hook_started'), 'hook_started must be progress evidence');
  assert.ok(subtypes.includes('system:hook_response'), 'hook_response must be progress evidence');
  assert.ok(subtypes.includes('system:thinking_tokens'), 'thinking_tokens must be progress evidence');
  const hookError = outcome.progress.find((p) => p.subtype === 'hook_response');
  assert.equal(hookError?.outcome, 'error');
  // terminal 与 init 都不进入 progress evidence。
  assert.ok(!subtypes.includes('system:init'));
});

test('resume stream with exact expectedSessionId yields success and reports that session id', () => {
  const outcome = expectSuccess(interpret(fixtureLines('claude-stream-resume.jsonl'), SESSION_ID));
  assert.equal(outcome.sessionId, SESSION_ID);
  assert.equal(outcome.codingResult.task_id, TASK_ID);
});

test('init session_id differing from expectedSessionId fails with session_mismatch', () => {
  const outcome = interpret([makeInit({ session_id: 'sess-other-0000-0000-0000-000000000000' }), makeResult()], SESSION_ID);
  expectFailure(outcome, 'session_mismatch');
});

test('terminal session_id differing from init session_id fails with session_mismatch', () => {
  const outcome = interpret([makeInit(), makeResult({ session_id: 'sess-other-0000-0000-0000-000000000000' })]);
  expectFailure(outcome, 'session_mismatch');
});

test('terminal session_id differing from expectedSessionId fails with session_mismatch', () => {
  const outcome = interpret([makeInit(), makeResult({ session_id: 'sess-other-0000-0000-0000-000000000000' })], SESSION_ID);
  expectFailure(outcome, 'session_mismatch');
});

test('missing init fails with init_missing, not partial success', () => {
  const outcome = interpret([makeResult()]);
  expectFailure(outcome, 'init_missing');
});

test('duplicate init fails with init_duplicate', () => {
  const outcome = interpret([makeInit(), makeInit()]);
  expectFailure(outcome, 'init_duplicate');
});

test('init tools missing the required room tool fails with required_tool_missing', () => {
  const outcome = interpret([makeInit({ tools: ['Read', 'Edit', 'Write'] })]);
  expectFailure(outcome, 'required_tool_missing');
});

test('required_tool_missing preserves the observed session id as failure evidence', () => {
  // 合法 non-empty session 已通过 expected-session 约束，required tool 缺失时仍保留该 session。
  const outcome = interpret([makeInit({ tools: ['Read', 'Edit', 'Write'] })]);
  const failure = expectFailure(outcome, 'required_tool_missing');
  assert.equal(failure.sessionId, SESSION_ID);
});

test('required_tool_missing with an empty session id does not fabricate session evidence', () => {
  // 空 session 先于 required tool 校验失败为 init_error，不伪造可靠 session。
  const outcome = interpret([makeInit({ session_id: '', tools: ['Read', 'Edit', 'Write'] })]);
  const failure = expectFailure(outcome, 'init_error');
  assert.equal(failure.sessionId, null);
});

test('built-in tools alone cannot satisfy the frozen Room tool authority', () => {
  const outcome = interpret([
    makeInit({ tools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'] }),
  ]);
  expectFailure(outcome, 'required_tool_missing');
});

test('a caller-provided built-in name cannot substitute the frozen Room tool authority', () => {
  // 绕过 literal type 向 constructor 注入 built-in Read：interpreter 仍以 frozen constant
  // 为 authority，init 只含 built-in 时返回 required_tool_missing，不把 Read 报告为 evidence。
  const interpreter = new ClaudeStreamInterpreter({
    expectedTaskId: TASK_ID,
    requiredToolName: 'Read' as never,
    expectedSessionId: null,
  });
  interpreter.acceptLine(makeInit({ tools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'] }));
  expectFailure(interpreter.finish(), 'required_tool_missing');
});

test('a non-empty malformed JSON line fails with malformed_json_line and is not silently skipped', () => {
  const outcome = interpret([makeInit(), 'this is not json', makeResult()]);
  expectFailure(outcome, 'malformed_json_line');
});

test('a non-object JSON line fails with malformed_json_line', () => {
  const outcome = interpret([makeInit(), '123', makeResult()]);
  expectFailure(outcome, 'malformed_json_line');
});

test('empty lines are ignored and an unknown but valid progress event is not treated as terminal', () => {
  const unknownProgress = line({ type: 'system', subtype: 'custom_progress', detail: 'x' });
  const outcome = expectSuccess(interpret([makeInit(), '', unknownProgress, '', makeResult()]));
  assert.equal(outcome.codingResult.task_id, TASK_ID);
  assert.ok(
    outcome.progress.some((p) => p.type === 'system' && p.subtype === 'custom_progress'),
    'unknown progress event must be preserved as non-terminal evidence',
  );
});

test('assistant StructuredOutput tool_use and tool_result do not complete the interpreter', () => {
  const toolUse = line({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'toolu-1', name: 'StructuredOutput', input: expectedCodingResult() }],
    },
    session_id: SESSION_ID,
  });
  const toolResult = line({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu-1', content: 'ok' }] },
    session_id: SESSION_ID,
  });
  // 没有 type=result 时，interpreter 不得因 tool_use/tool_result 提前完成。
  const outcome = interpret([makeInit(), toolUse, toolResult]);
  expectFailure(outcome, 'terminal_missing');
});

test('missing terminal fails with terminal_missing', () => {
  const outcome = interpret([makeInit()]);
  expectFailure(outcome, 'terminal_missing');
});

test('duplicate terminal fails with terminal_duplicate', () => {
  const outcome = interpret([makeInit(), makeResult(), makeResult()]);
  expectFailure(outcome, 'terminal_duplicate');
});

test('terminal subtype non-success fails with terminal_error', () => {
  const outcome = interpret([makeInit(), makeResult({ subtype: 'error' })]);
  expectFailure(outcome, 'terminal_error');
});

test('terminal is_error=true fails with terminal_error', () => {
  const outcome = interpret([makeInit(), makeResult({ is_error: true })]);
  expectFailure(outcome, 'terminal_error');
});

test('terminal missing structured_output fails with structured_output_missing', () => {
  const outcome = interpret([makeInit(), makeResult({ structured_output: undefined })]);
  expectFailure(outcome, 'structured_output_missing');
});

test('terminal stop_reason=tool_use is a legal success fact', () => {
  const outcome = expectSuccess(interpret([makeInit(), makeResult({ stop_reason: 'tool_use' })]));
  assert.equal(outcome.terminal.stopReason, 'tool_use');
});

test('structured_output failing codingResultSchema fails with coding_result_invalid', () => {
  const outcome = interpret([makeInit(), makeResult({ structured_output: { task_id: TASK_ID } })]);
  expectFailure(outcome, 'coding_result_invalid');
});

test('CodingResult.task_id differing from expectedTaskId fails with task_id_mismatch', () => {
  const outcome = interpret([makeInit(), makeResult({ structured_output: { ...expectedCodingResult(), task_id: 'other-task' } })]);
  expectFailure(outcome, 'task_id_mismatch');
});

test('a valid result string does not substitute for a missing structured_output', () => {
  // result string 是完整合法 CodingResult JSON，但 structured_output 缺失时不得回退到 result string。
  const resultOnly = line({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: SESSION_ID,
    result: JSON.stringify(expectedCodingResult()),
    stop_reason: 'tool_use',
  });
  const outcome = interpret([makeInit(), resultOnly]);
  expectFailure(outcome, 'structured_output_missing');
});

test('after finish, a second init or terminal does not change the returned outcome', () => {
  const interpreter = new ClaudeStreamInterpreter({
    expectedTaskId: TASK_ID,
    requiredToolName: REQUIRED_TOOL,
    expectedSessionId: null,
  });
  for (const l of [makeInit(), makeResult()]) interpreter.acceptLine(l);
  const outcome = interpreter.finish();
  expectSuccess(outcome);

  interpreter.acceptLine(makeInit());
  interpreter.acceptLine(makeResult());
  assert.strictEqual(interpreter.finish(), outcome, 'finish must return the unchanged outcome');
});

test('acceptLine returns progress evidence for non-terminal lines and null otherwise', () => {
  const interpreter = new ClaudeStreamInterpreter({
    expectedTaskId: TASK_ID,
    requiredToolName: REQUIRED_TOOL,
    expectedSessionId: null,
  });
  assert.equal(interpreter.acceptLine(makeInit()), null, 'init is not progress');
  assert.equal(interpreter.acceptLine(''), null, 'empty line is not progress');
  const progress = interpreter.acceptLine(line({ type: 'assistant', subtype: 'text', outcome: 'ok' }));
  assert.deepEqual(progress, { type: 'assistant', subtype: 'text', outcome: 'ok' });
  assert.equal(interpreter.acceptLine(makeResult()), null, 'result is not progress');
});

test('failure carries the observed session id and accumulated progress evidence', () => {
  const interpreter = new ClaudeStreamInterpreter({
    expectedTaskId: TASK_ID,
    requiredToolName: REQUIRED_TOOL,
    expectedSessionId: null,
  });
  interpreter.acceptLine(makeInit());
  interpreter.acceptLine(line({ type: 'system', subtype: 'hook_started' }));
  interpreter.acceptLine('not json'); // malformed line ends the stream
  const failure = expectFailure(interpreter.finish(), 'malformed_json_line');
  assert.equal(failure.sessionId, SESSION_ID);
  assert.deepEqual(failure.progress, [{ type: 'system', subtype: 'hook_started', outcome: null }]);
});

test('failure before a validated init carries null session id and empty progress', () => {
  const failure = expectFailure(interpret(['not json']), 'malformed_json_line');
  assert.equal(failure.sessionId, null);
  assert.deepEqual(failure.progress, []);
});
