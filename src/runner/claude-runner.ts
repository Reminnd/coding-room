import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProtocolError } from '../protocol/errors.ts';
import type { CodingResult, EventActor, Run, TaskContract } from '../protocol/schema.ts';
import type { RoomRecord } from '../room/repository.ts';
import {
  RoomService,
  type ContinuationContext,
  type RunTerminalEvidence,
} from '../room/room-service.ts';
import {
  collectCompletionEvidence,
  establishCleanBaseline,
  observeContinuation,
  type GitEvidence,
} from '../git/git-observer.ts';
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

// 单一 central Runner public operation：从 SQLite lineage 推导 continuation kind / mode /
// session，再执行 clean-baseline 或 continuation observation gate、完整 persisted Task prompt、
// start/resume claim、accepted process/stream leaf、progress Event、raw artifact、completion
// Git evidence 与单一 terminal settlement。
export async function runClaude(input: ClaudeRunnerInput): Promise<ClaudeRunResult> {
  // 读取已持久化的完整 TaskContract。confirmed_by_user 由 schema 强制为 literal true，
  // 持久化后不可能为 false，因此只做存在性检查，不做冗余断言。
  const task = input.roomService.getTask(input.taskId);
  if (!task) {
    throw new ProtocolError('entity_not_found', `task ${input.taskId} not found`);
  }

  // read-only continuation context：continuation kind、source Run、exact session/baseline 与
  // answered Question 全部从 persisted Room/Task/Event reference 推导，caller 不提供 mode/session。
  const context = input.roomService.getContinuationContext(task.room_id, task.task_id);

  let mode: 'start' | 'resume';
  let resumeSessionId: string | null;
  let baselineHead: string;
  let repositoryRoot: string;

  if (context.kind === 'new_implementation') {
    // 新 Implementation lineage：clean-worktree gate + actual HEAD 等于 dispatch expected baseline。
    mode = 'start';
    resumeSessionId = null;
    const baseline = await establishCleanBaseline(input.targetWorktree);
    if (baseline.baselineHead !== input.expectedBaselineHead) {
      throw new ProtocolError(
        'validation_failed',
        `actual HEAD ${baseline.baselineHead} does not match expected baseline_head ${input.expectedBaselineHead}`,
      );
    }
    baselineHead = baseline.baselineHead;
    repositoryRoot = baseline.repositoryRoot;
  } else {
    // Decision/Fix/retry continuation：允许保留 dirty evidence，但 actual HEAD 必须等于 source
    // Run.baseline_head，否则在创建新 Run/process/artifact/Event 前拒绝。retry 的 source session
    // 可能为空（replacement session）：空/缺失 session 时省略 --resume，由 Claude 创建同一 Task
    // lineage 的新 session；decision/fix 的 session 已由 service 保证非空，normalization 无副作用。
    mode = 'resume';
    resumeSessionId =
      context.sourceRun.agent_session_ref !== null && context.sourceRun.agent_session_ref !== ''
        ? context.sourceRun.agent_session_ref
        : null;
    const observation = await observeContinuation(input.targetWorktree);
    if (observation.head !== context.sourceRun.baseline_head) {
      throw new ProtocolError(
        'validation_failed',
        `actual HEAD ${observation.head} does not match lineage baseline_head ${context.sourceRun.baseline_head}`,
      );
    }
    baselineHead = context.sourceRun.baseline_head;
    repositoryRoot = observation.repositoryRoot;
  }

  const prompt = buildPrompt(task, context, input);
  const codingResultJsonSchema = serializeCodingResultCliSchema();

  // MCP config 必须指向 resolved worker participant route（requirement：Runner 生成的 Claude
  // MCP config 使用 worker route；tool 调用的 Event actor 来自 route participant + worker role）。
  // worker/executor 按 Task scope 优先、Room default fallback 解析（Review finding inc9-r2），
  // 与 service claim 校验的解析口径一致。participant_id 是 raw opaque identity，HTTP path
  // segment 只是其 transport framing（Fix inc9-fr4）：canonical segment 为 `p~` +
  // encodeURIComponent(完整 raw identity)，恰好一个 URI segment，`.`/`..`/斜杠 identity
  // 都不会被 WHATWG URL dot-segment normalization 归并；raw 多 segment、未编码或 unframed
  // value 不在 exact route 上（Fix inc9-fr3/fr4）。
  const workerAssignment = input.roomService.resolveAssignment(task.room_id, 'task', task.task_id, 'worker');
  if (!workerAssignment) {
    throw new ProtocolError('validation_failed', `no worker assignment for task ${task.task_id} in room ${task.room_id}`);
  }
  const workerRoute = `/mcp/participants/p~${encodeURIComponent(workerAssignment.participant_id)}`;
  assertWorkerMcpRoute(input.mcpConfig, workerRoute);

  // 构造 Run 输入并原子 claim：startRun/resumeRun 先创建 running Run 并进入 CODING，
  // 之后 Runner 才启动 process 并验证 MCP init。worker/executor 在 claim 时来自当时 resolved
  // assignment，service 校验与输入一致；agent_session_ref 初始为 null，由 terminal evidence 写入。
  const executorAssignment = input.roomService.resolveAssignment(task.room_id, 'task', task.task_id, 'executor');
  if (!executorAssignment) {
    throw new ProtocolError('validation_failed', `no executor assignment for task ${task.task_id} in room ${task.room_id}`);
  }
  // Runner 是 executor authority 的 consumer：claim 与整个 Run lifecycle 的 command actor
  // 必须来自 resolved executor assignment（Task scope 优先、Room default fallback），不得
  // 回退固定常量（Review finding inc9-fr2-1）。service 在 claim 时校验并冻结该 identity，
  // 之后 progress/pause finalization/terminal 都沿用同一 actor（inc9-fr2-1 冻结语义）。
  const executorActor: EventActor = {
    participant_id: executorAssignment.participant_id,
    actor_role: 'executor',
  };
  const runInput: Run = {
    run_id: input.runId,
    room_id: task.room_id,
    task_id: task.task_id,
    status: 'starting',
    baseline_head: baselineHead,
    worker_participant_id: workerAssignment.participant_id,
    executor_participant_id: executorAssignment.participant_id,
    agent_session_ref: null,
    process_exit_code: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    result: null,
    git_evidence: { staged: [], unstaged: [], untracked: [] },
    artifact_refs: [],
    failure: null,
  };

  const claimed =
    mode === 'start'
      ? input.roomService.startRun(runInput, executorActor)
      : input.roomService.resumeRun(runInput, executorActor);

  return executeRun(
    input,
    task,
    repositoryRoot,
    prompt,
    codingResultJsonSchema,
    claimed.run.run_id,
    mode,
    resumeSessionId,
    executorActor,
  );
}

// 把完整 persisted TaskContract 序列化为结构化 prompt；Decision continuation 额外附上完整
// answered Question/answer context。Fix Task 本身已是完整 Fix Contract，无需额外拼接。不得
// 接受摘要代替 persisted Contract，也不从 Review prose 或 session history 猜测 confirmed solution。
function buildPrompt(task: TaskContract, context: ContinuationContext, input: ClaudeRunnerInput): string {
  const lines = [
    '执行下面完整、已批准的 Implementation Task Contract，并返回符合提供的 JSON Schema 的 Coding Result。',
    '',
    'Dispatch metadata:',
    `- task_id: ${task.task_id}`,
    `- target_worktree: ${input.targetWorktree}`,
    `- continuation_kind: ${context.kind}`,
    `- confirmed_by_user: true`,
    '',
    '--- BEGIN ACCEPTED CONTRACT ---',
    JSON.stringify(task, null, 2),
    '--- END ACCEPTED CONTRACT ---',
  ];
  if (context.kind === 'decision') {
    lines.push(
      '',
      '--- BEGIN ANSWERED QUESTION CONTEXT ---',
      JSON.stringify(context.question, null, 2),
      '--- END ANSWERED QUESTION CONTEXT ---',
    );
  }
  return lines.join('\n');
}

async function executeRun(
  input: ClaudeRunnerInput,
  task: TaskContract,
  repositoryRoot: string,
  prompt: string,
  codingResultJsonSchema: string,
  runId: string,
  mode: 'start' | 'resume',
  resumeSessionId: string | null,
  executorActor: EventActor,
): Promise<ClaudeRunResult> {
  const interpreter = new ClaudeStreamInterpreter({
    expectedTaskId: task.task_id,
    requiredToolName: REQUIRED_ROOM_TOOL_NAME,
    expectedSessionId: mode === 'resume' ? resumeSessionId : null,
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
      resumeSessionId,
      onStdoutLine: (line: string) => {
        stdoutLines.push(line);
        const progress = interpreter.acceptLine(line);
        // Room Run status 是 durable progress eligibility authority：仅 running Run 可写
        // run_progress。room_ask_question 已把同一 Run 原子置为 needs_decision 后，Runner 继续
        // 消费后续 stdout 以完成 interpreter/artifact/terminal/pause evidence，但不得再追加
        // running-only progress。progress 不改变 Run/Room state，也不影响 terminal 分类。
        if (progress !== null && input.roomService.getRun(runId)?.status === 'running') {
          input.roomService.appendRunProgress(runId, progress, executorActor);
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
    agent_session_ref: streamOutcome.sessionId,
    process_exit_code: processOutcome?.exitCode ?? null,
    git_evidence: gitEvidence,
    artifact_refs: artifactRefs,
  };

  // Claude 在 run 内成功调用 room_ask_question 后，Run 已被原子置为 needs_decision：此时必须走
  // needs-decision pause finalization，而不是 completeRun/failRun；不得把 durable Question 改写为
  // REVIEW_REQUIRED/RUN_FAILED。
  const currentRun = input.roomService.getRun(runId);
  if (currentRun?.status === 'needs_decision') {
    const pause = classifyNeedsDecisionPause(processError, processOutcome, streamOutcome, gitError, artifactError);
    const finalized = input.roomService.finalizeNeedsDecision(runId, pause.result, pause.failure, evidence, executorActor);
    return { run: finalized.run, room: finalized.room };
  }

  const terminal = classifyTerminal(processError, processOutcome, streamOutcome, gitError, artifactError);

  // 单一 terminal settlement：无论 process/stream/Git/artifact 出现几个 failure，completeRun/
  // failRun 最多调用一次；后续事实不得改写已确定的 terminal result。
  if (terminal.kind === 'success') {
    return input.roomService.completeRun(runId, terminal.codingResult, evidence, executorActor);
  }
  return input.roomService.failRun(runId, { code: terminal.code, message: terminal.message }, evidence, executorActor);
}

// Claude MCP config 的 worker route 校验：agent_room server 的 URL 必须精确指向 resolved
// worker participant 的 canonical framed route（`p~` + encodeURIComponent(raw identity)，
// 单一 URI segment，transport framing 与 authority identity 分离，Fix inc9-fr3/fr4），
// 任何其它 path（含 raw 多 segment 与 unframed candidate）都在 spawn/claim 前以
// validation_failed 拒绝。
function assertWorkerMcpRoute(mcpConfig: string, workerRoute: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(mcpConfig);
  } catch {
    throw new ProtocolError('validation_failed', 'MCP config is not valid JSON');
  }
  const url = (parsed as { mcpServers?: { agent_room?: { url?: unknown } } })?.mcpServers?.agent_room
    ?.url;
  if (typeof url !== 'string') {
    throw new ProtocolError('validation_failed', 'MCP config has no agent_room url');
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new ProtocolError('validation_failed', `MCP url is invalid: ${url}`);
  }
  if (parsedUrl.pathname !== workerRoute) {
    throw new ProtocolError(
      'validation_failed',
      `MCP url must target the exact ${workerRoute} route: ${url}`,
    );
  }
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

// needs-decision pause 的分类：有效 status=needs_decision CodingResult 才持久化 result；
// process/stream/Git/artifact 任一失败或 contradictory terminal 都记录为该 paused Run.failure。
// 与 classifyTerminal 的差异：这里不要求 completed，也不产生 RUN_FAILED/REVIEW_REQUIRED。
function classifyNeedsDecisionPause(
  processError: ClaudeProcessStartError | ClaudeProcessInputError | null,
  processOutcome: ClaudeProcessOutcome | null,
  streamOutcome: ClaudeStreamOutcome,
  gitError: unknown,
  artifactError: unknown,
): { result: CodingResult | null; failure: { code: string; message: string } | null } {
  // 1. process 启动 / stdin 交付失败。
  if (processError !== null) {
    return { result: null, failure: { code: 'claude_start_failed', message: processError.message } };
  }
  // 2. non-zero exit 或 signal exit。
  if (processOutcome !== null && (processOutcome.exitCode !== 0 || processOutcome.signal !== null)) {
    return {
      result: null,
      failure: {
        code: 'claude_exit_failed',
        message: `claude exited with code ${processOutcome.exitCode} signal ${processOutcome.signal}`,
      },
    };
  }
  // 3. stream 失败：init 类映射 room_mcp_unavailable，其余映射 coding_result_invalid。
  if (!streamOutcome.ok) {
    if (MCP_INIT_FAILURE_REASONS.has(streamOutcome.reason)) {
      return { result: null, failure: { code: 'room_mcp_unavailable', message: streamOutcome.message } };
    }
    return { result: null, failure: { code: 'coding_result_invalid', message: streamOutcome.message } };
  }
  // 4. paused Run 的 valid CodingResult 必须为 status=needs_decision；completed/blocked 属
  // contradictory terminal，不持久化 result。
  if (streamOutcome.codingResult.status !== 'needs_decision') {
    return {
      result: null,
      failure: {
        code: 'coding_result_invalid',
        message: `coding result status ${streamOutcome.codingResult.status} is not needs_decision for a paused run`,
      },
    };
  }
  // 5. completion Git observation 失败。
  if (gitError !== null) {
    return { result: null, failure: { code: 'git_evidence_failed', message: errorMessage(gitError) } };
  }
  // 6. artifact 写入失败。
  if (artifactError !== null) {
    return { result: null, failure: { code: 'artifact_write_failed', message: errorMessage(artifactError) } };
  }
  return { result: streamOutcome.codingResult, failure: null };
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
