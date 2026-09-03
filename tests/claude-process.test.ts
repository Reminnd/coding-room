import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ClaudeProcessCallbackError,
  ClaudeProcessInputError,
  ClaudeProcessStartError,
  serializeCodingResultCliSchema,
  startClaudeProcess,
  type ClaudeProcessInput,
} from '../src/runner/claude-process.ts';
import {
  FakeClaudeProcess,
  makeSpawner,
  makeThrowingSpawner,
  whenStdinError,
  whenStdinFinished,
} from './runner-fixtures/claude-process-fake.ts';

class CountingKillClaudeProcess extends FakeClaudeProcess {
  killCalls = 0;

  override kill(signal?: NodeJS.Signals): boolean {
    this.killCalls += 1;
    return super.kill(signal);
  }
}

const srcRunnerFile = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'runner',
  'claude-process.ts',
);

// 独立 oracle：argument contract 与 tool list 期望来自 Contract/计划冻结的 literal，
// 不从被测实现 import 生成。
const SCHEMA = '{"type":"object","properties":{}}';
const MCP_CONFIG = '{"mcpServers":{"agent-room":{"command":"node","args":["server.js"]}}}';

// 冻结基础 argument contract（new session）；resume 只在其尾部追加 --resume <id>。
const FROZEN_BASE_ARGS = [
  '-p',
  '--output-format', 'stream-json',
  '--verbose',
  '--json-schema', SCHEMA,
  '--mcp-config', MCP_CONFIG,
  '--strict-mcp-config',
  '--permission-mode', 'dontAsk',
  '--tools', 'Read,Edit,Write,Glob,Grep,Bash',
  '--allowedTools', 'Read,Edit,Write,Glob,Grep,Bash,mcp__agent_room__room_ask_question',
];

function makeInput(overrides: Partial<ClaudeProcessInput> = {}): ClaudeProcessInput {
  return {
    cwd: 'D:/target-worktree',
    prompt: 'complete prompt\nline two\n',
    codingResultJsonSchema: SCHEMA,
    mcpConfig: MCP_CONFIG,
    resumeSessionId: null,
    onStdoutLine: () => {},
    onStderrChunk: () => {},
    ...overrides,
  };
}

function hasKey(node: unknown, key: string): boolean {
  if (Array.isArray(node)) return node.some((n) => hasKey(n, key));
  if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (Object.hasOwn(record, key)) return true;
    return Object.values(record).some((v) => hasKey(v, key));
  }
  return false;
}

test('schema serialization strips root $schema and every minLength occurrence', () => {
  const schema = JSON.parse(serializeCodingResultCliSchema()) as Record<string, unknown>;
  assert.equal(Object.hasOwn(schema, '$schema'), false, 'root $schema must be removed');
  assert.equal(hasKey(schema, 'minLength'), false, 'no minLength keyword may remain');
});

test('schema serialization preserves CodingResult fields, required, enum, items and additionalProperties', () => {
  const schema = JSON.parse(serializeCodingResultCliSchema()) as Record<string, any>;
  assert.equal(schema.type, 'object');
  assert.deepEqual(schema.required, [
    'task_id',
    'status',
    'summary',
    'changed_files',
    'deviations',
    'verification',
    'tests',
    'documentation_changes',
    'unresolved',
    'questions',
  ]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.task_id.type, 'string');
  assert.deepEqual(schema.properties.status.enum, ['completed', 'blocked', 'needs_decision']);
  assert.equal(schema.properties.changed_files.type, 'array');
  assert.equal(schema.properties.changed_files.items.type, 'object');
  assert.equal(schema.properties.changed_files.items.additionalProperties, false);
  assert.deepEqual(schema.properties.verification.items.properties.status.enum, [
    'passed',
    'failed',
    'not_run',
  ]);
  assert.deepEqual(schema.properties.documentation_changes.items.properties.kind.enum, [
    'implementation_fact',
    'candidate_rule',
    'candidate_architecture',
    'candidate_adr',
  ]);
});

test('new-session invocation builds the frozen argument contract without resume/continue', async () => {
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = makeSpawner(child);
  const input = makeInput({ resumeSessionId: null });

  const outcome = startClaudeProcess(input, spawner);
  assert.equal(invocations.length, 1, 'spawn must be invoked exactly once');
  const inv = invocations[0];
  assert.equal(inv.command, 'claude');
  assert.equal(inv.options.cwd, input.cwd);
  assert.equal(inv.options.shell, false);
  assert.deepEqual(inv.args, FROZEN_BASE_ARGS);
  assert.ok(!inv.args.includes('--resume'), 'new session must not pass --resume');
  assert.ok(!inv.args.includes('--continue'), 'must never use --continue');
  assert.ok(inv.args.includes('--verbose'), '--verbose is part of the frozen contract');

  child.stdout.end();
  child.stderr.end();
  child.emit('close', 0, null);
  assert.deepEqual(await outcome, { exitCode: 0, signal: null });
});

test('resume invocation appends only --resume <exact-session-id>', async () => {
  const child = new FakeClaudeProcess();
  const { spawner, invocations } = makeSpawner(child);
  const input = makeInput({ resumeSessionId: 'session-abc-123' });

  const outcome = startClaudeProcess(input, spawner);
  const args = invocations[0].args;
  assert.deepEqual(args, [...FROZEN_BASE_ARGS, '--resume', 'session-abc-123']);
  assert.equal(args.filter((a) => a === '--resume').length, 1, 'exactly one --resume');
  assert.ok(!args.includes('--continue'), 'must never use --continue');

  child.stdout.end();
  child.stderr.end();
  child.emit('close', 0, null);
  assert.deepEqual(await outcome, { exitCode: 0, signal: null });
});

test('stdin receives the complete multi-line prompt unchanged', async () => {
  const child = new FakeClaudeProcess();
  const { spawner } = makeSpawner(child);
  const prompt = 'Task Contract line 1\nTask Contract line 2\n第三行，包含完整要求\n';

  const outcome = startClaudeProcess(makeInput({ prompt }), spawner);
  await whenStdinFinished(child);
  assert.equal(child.stdinWritten, prompt, 'stdin must carry the exact full prompt');
  assert.equal(child.stdinEnded, true, 'stdin must be closed after writing');

  child.stdout.end();
  child.stderr.end();
  child.emit('close', 0, null);
  await outcome;
});

test('stdin EPIPE rejects with ClaudeProcessInputError and late close does not override it', async () => {
  const cause = new Error('write EPIPE');
  const child = new FakeClaudeProcess(cause);
  const { spawner, invocations } = makeSpawner(child);
  const input = makeInput();

  // 先挂载 stdin error 等待，再启动，确保 EPIPE 送达 transport 后再 emit close。
  const stdinError = whenStdinError(child);
  const outcome = startClaudeProcess(input, spawner);
  await stdinError;

  // stdin failure 已确定后，后续 close(0, null) 不得把结果改写为普通 exit 0 outcome。
  child.emit('close', 0, null);

  await assert.rejects(outcome, (err: unknown) => {
    assert.ok(err instanceof ClaudeProcessInputError);
    const e = err as ClaudeProcessInputError;
    assert.equal(e.command, 'claude');
    assert.deepEqual(e.args, FROZEN_BASE_ARGS);
    assert.equal(e.cwd, input.cwd);
    assert.equal(e.cause, cause);
    return true;
  });
  assert.equal(invocations.length, 1);
});

test('stdout frames split lines, multi-line chunks and the final line in order', async () => {
  const child = new FakeClaudeProcess();
  const { spawner } = makeSpawner(child);
  const lines: string[] = [];

  const outcome = startClaudeProcess(makeInput({ onStdoutLine: (l) => lines.push(l) }), spawner);

  // 一行跨两个 chunk。
  child.stdout.write('{"a":');
  child.stdout.write('1}\n');
  // 一个 chunk 含多行。
  child.stdout.write('{"b":2}\n{"c":3}\n');
  // 最终完整行。
  child.stdout.write('{"d":4}\n');
  child.stdout.end();

  await once(child.stdout, 'end');
  assert.deepEqual(lines, ['{"a":1}', '{"b":2}', '{"c":3}', '{"d":4}']);

  child.stderr.end();
  child.emit('close', 0, null);
  await outcome;
});

test('newline stdout callback failure rejects once, stops the child once and never escapes the listener', async () => {
  const child = new CountingKillClaudeProcess();
  const { spawner } = makeSpawner(child);
  const abort = new AbortController();
  const cause = new Error('progress persistence failed');
  const delivered: string[] = [];
  const outcome = startClaudeProcess(
    makeInput({
      onStdoutLine: (line) => {
        delivered.push(line);
        throw cause;
      },
      signal: abort.signal,
    }),
    spawner,
  );

  child.stdout.write('first-line\nsecond-line\n');
  child.stdout.end();
  child.stderr.end();
  abort.abort();
  child.emit('close', 0, null);

  await assert.rejects(outcome, (err: unknown) => {
    assert.ok(err instanceof ClaudeProcessCallbackError);
    assert.equal(err.cause, cause);
    assert.match(err.message, /progress persistence failed/);
    return true;
  });
  assert.deepEqual(delivered, ['first-line']);
  assert.equal(child.killCalls, 1);
  assert.equal(child.killed, 'SIGTERM');
});

test('EOF stdout callback failure rejects through the process Promise and stops the owned child', async () => {
  const child = new CountingKillClaudeProcess();
  const { spawner } = makeSpawner(child);
  const cause = new Error('EOF callback marker');
  const outcome = startClaudeProcess(
    makeInput({
      onStdoutLine: () => {
        throw cause;
      },
    }),
    spawner,
  );

  child.stdout.end('tail-without-newline');
  child.stderr.end();

  await assert.rejects(outcome, (err: unknown) => {
    assert.ok(err instanceof ClaudeProcessCallbackError);
    assert.equal(err.cause, cause);
    return true;
  });
  assert.equal(child.killCalls, 1);
  child.emit('close', 0, null);
});

test('stderr stays separate and is delivered raw without line framing', async () => {
  const child = new FakeClaudeProcess();
  const { spawner } = makeSpawner(child);
  const stdoutLines: string[] = [];
  const stderrChunks: string[] = [];

  const outcome = startClaudeProcess(
    makeInput({
      onStdoutLine: (l) => stdoutLines.push(l),
      onStderrChunk: (c) => stderrChunks.push(c),
    }),
    spawner,
  );

  child.stderr.write('warn chunk one ');
  child.stderr.write('warn chunk two\n');
  child.stderr.end();
  child.stdout.end();

  // 在任一 stream 'end' 触发前同步挂载两个等待，避免先 await 一个导致另一个事件已错过。
  const stderrEnded = once(child.stderr, 'end');
  const stdoutEnded = once(child.stdout, 'end');
  await Promise.all([stderrEnded, stdoutEnded]);
  assert.deepEqual(stderrChunks, ['warn chunk one ', 'warn chunk two\n']);
  assert.deepEqual(stdoutLines, [], 'stderr must not leak into the stdout line callback');

  child.emit('close', 0, null);
  await outcome;
});

test('exit 0 resolves with exitCode 0 and null signal', async () => {
  const child = new FakeClaudeProcess();
  const { spawner } = makeSpawner(child);
  const outcome = startClaudeProcess(makeInput(), spawner);
  child.stdout.end();
  child.stderr.end();
  child.emit('close', 0, null);
  assert.deepEqual(await outcome, { exitCode: 0, signal: null });
});

test('non-zero exit resolves with its exit code and null signal', async () => {
  const child = new FakeClaudeProcess();
  const { spawner } = makeSpawner(child);
  const outcome = startClaudeProcess(makeInput(), spawner);
  child.stdout.end();
  child.stderr.end();
  child.emit('close', 7, null);
  assert.deepEqual(await outcome, { exitCode: 7, signal: null });
});

test('signal exit resolves with null exit code and the signal', async () => {
  const child = new FakeClaudeProcess();
  const { spawner } = makeSpawner(child);
  const outcome = startClaudeProcess(makeInput(), spawner);
  child.stdout.end();
  child.stderr.end();
  child.emit('close', null, 'SIGTERM');
  assert.deepEqual(await outcome, { exitCode: null, signal: 'SIGTERM' });
});

test('spawn synchronous failure rejects with ClaudeProcessStartError carrying command/args/cwd/cause', async () => {
  const cause = new Error('ENOENT');
  const { spawner, invocations } = makeThrowingSpawner(cause);
  const input = makeInput();

  await assert.rejects(startClaudeProcess(input, spawner), (err: unknown) => {
    assert.ok(err instanceof ClaudeProcessStartError);
    const e = err as ClaudeProcessStartError;
    assert.equal(e.command, 'claude');
    assert.equal(e.cwd, input.cwd);
    assert.equal(e.cause, cause);
    assert.ok(e.args.includes('--json-schema'));
    assert.ok(e.args.includes('--verbose'));
    return true;
  });
  assert.equal(invocations.length, 1);
});

test('spawn error event rejects with ClaudeProcessStartError carrying the original cause', async () => {
  const child = new FakeClaudeProcess();
  const { spawner } = makeSpawner(child);
  const cause = new Error('ENOENT claude');

  const outcome = startClaudeProcess(makeInput(), spawner);
  child.emit('error', cause);

  await assert.rejects(outcome, (err: unknown) => {
    assert.ok(err instanceof ClaudeProcessStartError);
    assert.equal((err as ClaudeProcessStartError).cause, cause);
    return true;
  });
});

test('product transport does not parse stdout, use shell/exec, or touch Room/Git/artifact', () => {
  const source = readFileSync(srcRunnerFile, 'utf8');
  assert.ok(!/JSON\.parse\s*\(/.test(source), 'transport must not JSON.parse stdout');
  assert.ok(!/\b(execFile|execSync|spawnSync)\b/.test(source));
  assert.ok(!/\.exec\s*\(/.test(source));
  assert.ok(!/shell\s*:\s*true/.test(source));
  assert.ok(/shell\s*:\s*false/.test(source));
  assert.ok(
    !source.includes("'--continue'") && !source.includes('"--continue"'),
    'must never pass --continue',
  );
  assert.ok(!source.includes("from '../room"));
  assert.ok(!source.includes("from '../git"));
  assert.ok(!source.includes('node:sqlite'));
  assert.ok(!source.includes('node:fs'));
  assert.ok(!source.includes('ProtocolError'));
});
