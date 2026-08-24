import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProtocolError } from '../protocol/errors.ts';
import type { CodingResult, Run, TaskContract } from '../protocol/schema.ts';
import type { RoomRecord } from '../room/repository.ts';
import { RoomService, type RunTerminalEvidence } from '../room/room-service.ts';
import { collectCompletionEvidence, establishCleanBaseline, type GitEvidence } from '../git/git-observer.ts';
import {
  ClaudeProcessInputError,
  ClaudeProcessStartError,
  serializeCodingResultCliSchema,
  startClaudeProcess,
  type ClaudeProcessOutcome,
  type ClaudeProcessSpawn,
} from './claude-process.ts';
import {
  ClaudeStreamInterpreter,
  REQUIRED_ROOM_TOOL_NAME,
  type ClaudeStreamFailureReason,
  type ClaudeStreamOutcome,
} from './claude-stream.ts';

// central Runner orchestration：唯一组合两个 accepted leaf（process transport 与 stream
// interpreter）与 RoomService / Git Observer / artifact 的模块。它不拥有 CLI flag、JSONL
// 解析、required-tool authority 或 Git command set，也不写 repository/SQLite 绕过 state
// transition；process/stream/Git/artifact 的 terminal 分类由本模块唯一 settle。

export interface ClaudeRunnerInput {
  roomService: RoomService;
  runId: string;
  taskId: string;
  targetWorktree: string;
  expectedBaselineHead: string;
  // serialized Room MCP config，直接作为 --mcp-config 传入 process。
  mcpConfig: string;
  mode: 'start' | 'resume';
  resumeSessionId: string | null;
  // process boundary 注入 seam：仅 fake-process 测试替换 spawn，不是通用 command runner。
  spawnProcess?: ClaudeProcessSpawn;
}

export interface ClaudeRunResult {
  run: Run;
  room: RoomRecord;
}

// init/required-tool 类 stream failure 映射 room_mcp_unavailable；其余 stream failure
// 映射 coding_result_invalid。该 set 是本 Task 已批准的映射边界，不是通用 registry。
const MCP_INIT_FAILURE_REASONS: ReadonlySet<ClaudeStreamFailureReason> = new Set([
  'init_missing',
  'init_error',
  'init_duplicate',
  'required_tool_missing',
]);

// 单一 central Runner public operation：clean baseline gate、完整 persisted Task prompt、
// start/resume claim、accepted process/stream leaf、progress Event、raw artifact、completion
// Git evidence 与单一 terminal transition。
export async function runClaude(input: ClaudeRunnerInput): Promise<ClaudeRunResult> {
  // 读取已持久化的完整 TaskContract。confirmed_by_user 由 schema 强制为 literal true，
  // 持久化后不可能为 false，因此只做存在性检查，不做冗余断言。
  const task = input.roomService.getTask(input.taskId);
  if (!task) {
    throw new ProtocolError('entity_not_found', `task ${input.taskId} not found`);
  }

  // start/resume mode 校验：start 要求 resumeSessionId=null；resume 要求 non-empty exact
  // id；绝不使用 --continue 或推断最近 session。
  if (input.mode === 'start' && input.resumeSessionId !== null) {
    throw new ProtocolError('validation_failed', 'start mode requires resumeSessionId=null');
  }
  if (input.mode === 'resume' && (input.resumeSessionId === null || input.resumeSessionId === '')) {
    throw new ProtocolError('validation_failed', 'resume mode requires a non-empty resumeSessionId');
  }

  // pre-run clean baseline：repository/HEAD/dirty error 原样拒绝，此时尚未创建
  // Run/Event/artifact，也不进入 CODING。
  const baseline = await establishCleanBaseline(input.targetWorktree);

  // actual HEAD 必须等于 dispatch metadata 的 expected baseline_head。
  if (baseline.baselineHead !== input.expectedBaselineHead) {
    throw new ProtocolError(
      'validation_failed',
      `actual HEAD ${baseline.baselineHead} does not match expected baseline_head ${input.expectedBaselineHead}`,
    );
  }

  const prompt = buildPrompt(task, input);
  const codingResultJsonSchema = serializeCodingResultCliSchema();

  // 构造 Run 输入并原子 claim：startRun/resumeRun 先创建 running Run 并进入 CODING，
  // 之后 Runner 才启动 process 并验证 MCP init。
  const runInput: Run = {
    run_id: input.runId,
    room_id: task.room_id,
    task_id: task.task_id,
    status: 'starting',
    baseline_head: baseline.baselineHead,
    claude_session_id: null,
    process_exit_code: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    result: null,
    git_evidence: { staged: [], unstaged: [], untracked: [] },
    artifact_refs: [],
    failure: null,
  };

  const claimed =
    input.mode === 'start'
      ? input.roomService.startRun(runInput)
      : input.roomService.resumeRun(runInput);

  return executeRun(input, task, baseline.repositoryRoot, prompt, codingResultJsonSchema, claimed.run.run_id);
}

// 把完整 persisted TaskContract 序列化为结构化 prompt。不得接受摘要代替 persisted
// Contract，也不从普通文本猜测 Task。
function buildPrompt(task: TaskContract, input: ClaudeRunnerInput): string {
  return [
    '执行下面完整、已批准的 Implementation Task Contract，并返回符合提供的 JSON Schema 的 Coding Result。',
    '',
    'Dispatch metadata:',
    `- task_id: ${task.task_id}`,
    `- target_worktree: ${input.targetWorktree}`,
    `- expected_baseline_head: ${input.expectedBaselineHead}`,
    `- mode: ${input.mode}`,
    `- resume_session_id: ${input.resumeSessionId ?? ''}`,
    `- confirmed_by_user: true`,
    '',
    '--- BEGIN ACCEPTED CONTRACT ---',
    JSON.stringify(task, null, 2),
    '--- END ACCEPTED CONTRACT ---',
  ].join('\n');
}

async function executeRun(
  input: ClaudeRunnerInput,
  task: TaskContract,
  repositoryRoot: string,
  prompt: string,
  codingResultJsonSchema: string,
  runId: string,
): Promise<ClaudeRunResult> {
  const interpreter = new ClaudeStreamInterpreter({
    expectedTaskId: task.task_id,
    requiredToolName: REQUIRED_ROOM_TOOL_NAME,
    expectedSessionId: input.mode === 'resume' ? input.resumeSessionId : null,
  });

  const stdoutLines: string[] = [];
  const stderrChunks: string[] = [];

  let processError: ClaudeProcessStartError | ClaudeProcessInputError | null = null;
  let processOutcome: ClaudeProcessOutcome | null = null;

  try {
    const processInput = {
      cwd: input.targetWorktree,
      prompt,
      codingResultJsonSchema,
      mcpConfig: input.mcpConfig,
      resumeSessionId: input.resumeSessionId,
      onStdoutLine: (line: string) => {
        stdoutLines.push(line);
        const progress = interpreter.acceptLine(line);
        if (progress !== null) {
          // run 刚被 startRun/resumeRun 置为 running，streaming 期间始终可写 progress；
          // progress 不改变 Run/Room state，也不影响 terminal 分类。
          input.roomService.appendRunProgress(runId, progress);
        }
      },
      onStderrChunk: (chunk: string) => {
        stderrChunks.push(chunk);
      },
    };
    processOutcome = input.spawnProcess === undefined
      ? await startClaudeProcess(processInput)
      : await startClaudeProcess(processInput, input.spawnProcess);
  } catch (err) {
    if (err instanceof ClaudeProcessStartError || err instanceof ClaudeProcessInputError) {
      processError = err;
    } else {
      throw err;
    }
  }

  // stream outcome：成功或失败；失败携带已观察的 sessionId 与 progress。
  const streamOutcome = interpreter.finish();

  // 无论 process 成功与否都收集 completion Git evidence 并保留已观察 path；失败映射
  // git_evidence_failed，不降级为空 evidence。
  let gitEvidence: GitEvidence = { staged: [], unstaged: [], untracked: [] };
  let gitError: unknown = null;
  try {
    gitEvidence = await collectCompletionEvidence(input.targetWorktree);
  } catch (err) {
    gitError = err;
  }

  // 写入 raw stdout/stderr artifact；失败映射 artifact_write_failed，不伪造 artifact ref。
  let artifactRefs: string[] = [];
  let artifactError: unknown = null;
  try {
    artifactRefs = writeArtifacts(repositoryRoot, runId, stdoutLines, stderrChunks);
  } catch (err) {
    artifactError = err;
  }

  const evidence: RunTerminalEvidence = {
    claude_session_id: streamOutcome.sessionId,
    process_exit_code: processOutcome?.exitCode ?? null,
    git_evidence: gitEvidence,
    artifact_refs: artifactRefs,
  };

  const terminal = classifyTerminal(processError, processOutcome, streamOutcome, gitError, artifactError);

  // 单一 terminal settlement：无论 process/stream/Git/artifact 出现几个 failure，completeRun/
  // failRun 最多调用一次；后续事实不得改写已确定的 terminal result。
  if (terminal.kind === 'success') {
    return input.roomService.completeRun(runId, terminal.codingResult, evidence);
  }
  return input.roomService.failRun(runId, { code: terminal.code, message: terminal.message }, evidence);
}

type TerminalResult =
  | { kind: 'success'; codingResult: CodingResult }
  | { kind: 'failure'; code: string; message: string };

// terminal 分类的唯一 settlement owner：按 process → stream → status → Git → artifact 的
// 优先级返回单一 terminal result，成功需要全部条件同时满足。
function classifyTerminal(
  processError: ClaudeProcessStartError | ClaudeProcessInputError | null,
  processOutcome: ClaudeProcessOutcome | null,
  streamOutcome: ClaudeStreamOutcome,
  gitError: unknown,
  artifactError: unknown,
): TerminalResult {
  // 1. process 启动 / stdin 交付失败。
  if (processError !== null) {
    return { kind: 'failure', code: 'claude_start_failed', message: processError.message };
  }
  // 2. non-zero exit 或 signal exit；即使 stdout 含看似成功 terminal 也不得成功。
  if (processOutcome !== null && (processOutcome.exitCode !== 0 || processOutcome.signal !== null)) {
    return {
      kind: 'failure',
      code: 'claude_exit_failed',
      message: `claude exited with code ${processOutcome.exitCode} signal ${processOutcome.signal}`,
    };
  }
  // 3. stream 失败：init 类映射 room_mcp_unavailable，其余映射 coding_result_invalid。
  if (!streamOutcome.ok) {
    if (MCP_INIT_FAILURE_REASONS.has(streamOutcome.reason)) {
      return { kind: 'failure', code: 'room_mcp_unavailable', message: streamOutcome.message };
    }
    return { kind: 'failure', code: 'coding_result_invalid', message: streamOutcome.message };
  }
  // 4. CodingResult 非 completed（task_id 匹配已由 interpreter 保证）。
  if (streamOutcome.codingResult.status !== 'completed') {
    return {
      kind: 'failure',
      code: 'coding_result_invalid',
      message: `coding result status ${streamOutcome.codingResult.status} cannot complete a run`,
    };
  }
  // 5. completion Git observation 失败。
  if (gitError !== null) {
    return { kind: 'failure', code: 'git_evidence_failed', message: errorMessage(gitError) };
  }
  // 6. artifact 写入失败。
  if (artifactError !== null) {
    return { kind: 'failure', code: 'artifact_write_failed', message: errorMessage(artifactError) };
  }
  return { kind: 'success', codingResult: streamOutcome.codingResult };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// 把 raw stdout JSONL 与 stderr 写入 target repository root 下的 .agent-room/artifacts/
// <run-id>/；artifact_refs 使用 repository-root-relative path。不保存 Task/Review JSON
// mirror 或权威 diff.patch。
function writeArtifacts(
  repositoryRoot: string,
  runId: string,
  stdoutLines: string[],
  stderrChunks: string[],
): string[] {
  const dir = join(repositoryRoot, '.agent-room', 'artifacts', runId);
  mkdirSync(dir, { recursive: true });
  const stdoutContent = stdoutLines.length > 0 ? `${stdoutLines.join('\n')}\n` : '';
  writeFileSync(join(dir, 'stdout.jsonl'), stdoutContent);
  writeFileSync(join(dir, 'stderr.log'), stderrChunks.join(''));
  return [
    ['.agent-room', 'artifacts', runId, 'stdout.jsonl'].join('/'),
    ['.agent-room', 'artifacts', runId, 'stderr.log'].join('/'),
  ];
}
