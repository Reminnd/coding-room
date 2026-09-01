import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProtocolError } from '../protocol/errors.ts';
import type { CodingResult, EventActor, PersistedTask, Run, RunAttempt } from '../protocol/schema.ts';
import type { RoomRecord } from '../room/repository.ts';
import { RoomService } from '../room/room-service.ts';
import {
  collectCompletionEvidence,
  establishCleanWorktree,
  observeContinuation,
  type GitEvidence,
} from '../git/git-observer.ts';
import {
  ClaudeProcessInputError,
  ClaudeProcessStartError,
  serializeCodingResultCliSchema,
  type ClaudeProcessOutcome,
  type ClaudeProcessSpawn,
} from './claude-process.ts';
import {
  type ClaudeStreamFailureReason,
  type ClaudeStreamOutcome,
} from './claude-stream.ts';
import { selectWorkerAdapter } from './worker-adapter.ts';

// Stage 2 Local Executor：provider-neutral Executor/WorkerAdapter seam 的唯一 consumer。
// 它拥有一次 RunAttempt 的完整生命周期：claim 前 worktree/session/adapter/route 校验 →
// atomic claim → process startup → cancel poll boundary → progress → artifact/Git evidence →
// 单一 terminal settlement。不写 SQLite 绕过 transition，不拥有 CLI flag 或 JSONL 解析；
// process startup 严格发生在 claim commit 之后。

export interface LocalExecutorInput {
  roomService: RoomService;
  runId: string;
  attemptId: string;
  targetWorktree: string;
  // serialized Room MCP config，直接作为 --mcp-config 传入 process。
  mcpConfig: string;
  // process boundary 注入 seam：仅 fake-process 测试替换 spawn，不是通用 command runner。
  spawnProcess?: ClaudeProcessSpawn;
  // cancel poll boundary 的检查间隔；仅测试注入以加速取消观察。
  pollIntervalMs?: number;
}

export interface LocalExecutorResult {
  room: RoomRecord;
  run: Run;
  attempt: RunAttempt;
}

// init/required-tool 类 stream failure 映射 room_mcp_unavailable；其余 stream failure
// 映射 coding_result_invalid。该 set 是已批准的映射边界，不是通用 registry。
const MCP_INIT_FAILURE_REASONS: ReadonlySet<ClaudeStreamFailureReason> = new Set([
  'init_missing',
  'init_error',
  'init_duplicate',
  'required_tool_missing',
]);

type ContinuationKind = 'new_implementation' | 'decision' | 'fix' | 'retry';

export class LocalExecutor {
  private readonly input: LocalExecutorInput;

  constructor(input: LocalExecutorInput) {
    this.input = input;
  }

  async execute(): Promise<LocalExecutorResult> {
    const service = this.input.roomService;
    const run = service.getRun(this.input.runId);
    if (!run) {
      throw new ProtocolError('entity_not_found', `run ${this.input.runId} not found`);
    }
    const task = service.latestTaskForRun(run.run_id);
    if (!task) {
      throw new ProtocolError('entity_not_found', `run ${run.run_id} has no task`);
    }

    // ---- claim 前 worktree gate ----
    // 首 attempt：clean Git gate（任一变更 → worktree_not_clean）并解析 repository root；
    // 后续 attempt：允许 dirty evidence，但必须使用同一 canonical worktree。claim 只冻结/
    // 继承 worktree，不创建、切换、删除或清理 worktree。
    const priorAttempt = service.latestAttemptForRun(run.run_id);
    let repositoryRoot: string;
    if (priorAttempt === null) {
      const observation = await establishCleanWorktree(this.input.targetWorktree);
      repositoryRoot = observation.repositoryRoot;
    } else {
      if (run.worktree_path === null) {
        throw new ProtocolError(
          'validation_failed',
          `run ${run.run_id} has attempts but no frozen worktree`,
        );
      }
      const observation = await observeContinuation(this.input.targetWorktree);
      if (observation.repositoryRoot !== run.worktree_path) {
        throw new ProtocolError(
          'validation_failed',
          `actual repository root ${observation.repositoryRoot} does not match lineage worktree ${run.worktree_path}`,
        );
      }
      repositoryRoot = observation.repositoryRoot;
    }

    // ---- session lineage（per-Run，绝不跨 Run 继承）----
    // Decision/Fix 从 latest reliable attempt（agent_session_ref 非空的 attempt_no 最大者）
    // 恢复 exact session；failure retry 在 session 缺失时允许同 Run replacement session
    //（省略 --resume，由 Claude 创建同一 Task lineage 的新 session）。
    const attempts = service.listAttemptsByRun(run.run_id);
    const reliableAttempt = [...attempts]
      .reverse()
      .find((a) => a.agent_session_ref !== null && a.agent_session_ref !== '') ?? null;
    const resumeSessionId = reliableAttempt?.agent_session_ref ?? null;
    if (
      priorAttempt !== null &&
      (priorAttempt.status === 'needs_decision' || task.type === 'fix') &&
      reliableAttempt === null
    ) {
      throw new ProtocolError(
        'validation_failed',
        `run ${run.run_id} decision/fix resume requires an exact session from a reliable attempt`,
      );
    }
    const continuationKind = this.deriveContinuationKind(priorAttempt, task);

    // ---- executor authority 与 worker adapter ----
    // executor actor 来自 Run 当前 Task 的 Task scope 优先、Room fallback 解析（claim 时
    // service 校验并冻结同一 identity）。worker adapter 门禁先于 claim：非 claude_code_cli
    // 在此 worker_adapter_unavailable，零 attempt/process/Event/artifact。
    const executorAssignment = service.resolveAssignment(run.room_id, 'task', task.task_id, 'executor');
    if (!executorAssignment) {
      throw new ProtocolError(
        'validation_failed',
        `no executor assignment for task ${task.task_id} in room ${run.room_id}`,
      );
    }
    const executorActor: EventActor = {
      participant_id: executorAssignment.participant_id,
      actor_role: 'executor',
    };
    const workerProfile = service.getParticipant(run.worker_participant_id);
    if (!workerProfile) {
      throw new ProtocolError('entity_not_found', `worker participant ${run.worker_participant_id} not found`);
    }
    const adapter = selectWorkerAdapter(workerProfile.adapter_id);

    // ---- MCP worker route ----
    // 使用 Run 冻结的 worker identity（assignment replacement 不改写既有 Run worker）；
    // canonical framed route 为 `p~` + encodeURIComponent(raw identity)，恰好一个 URI
    // segment（Fix inc9-fr3/fr4）。错误 URL 在 spawn/claim 前拒绝。
    const workerRoute = `/mcp/participants/p~${encodeURIComponent(run.worker_participant_id)}`;
    assertWorkerMcpRoute(this.input.mcpConfig, workerRoute);

    // ---- prompt（guidance 在 claim 后由消费事实拼接）----
    // decision resume 额外附上该 attempt 的完整 Question/answer context；Fix Task 本身已是
    // 完整 Fix Contract，无需额外拼接。
    let prompt = buildPrompt(task, continuationKind, this.input.targetWorktree, run);
    if (continuationKind === 'decision' && priorAttempt !== null) {
      const question = service
        .listQuestions(run.room_id)
        .filter((q) => q.attempt_id === priorAttempt.attempt_id)
        .at(-1);
      if (question) {
        prompt += [
          '',
          '--- BEGIN ANSWERED QUESTION CONTEXT ---',
          JSON.stringify(question, null, 2),
          '--- END ANSWERED QUESTION CONTEXT ---',
        ].join('\n');
      }
    }

    // ---- atomic claim（process startup 之前的最后一步）----
    const claimed = service.claimRunAttempt(
      {
        attempt_id: this.input.attemptId,
        run_id: run.run_id,
        room_id: run.room_id,
        worktree_path: repositoryRoot,
      },
      executorActor,
    );
    const attempt = claimed.attempt;

    // ---- cancel poll boundary ----
    // claim 后每 pollIntervalMs 检查一次 attempt status：planner 写入 cancel_requested 后
    // abort → WorkerAdapter/process 层终止 owned process。该 poll 只观察 durable status，
    // 不做自动 retry/queue。
    const controller = new AbortController();
    const pollInterval = setInterval(() => {
      const current = service.getAttempt(attempt.attempt_id);
      if (current === null) {
        clearInterval(pollInterval);
        return;
      }
      if (current.status === 'cancel_requested') {
        controller.abort();
      }
      if (this.isTerminalStatus(current.status)) {
        clearInterval(pollInterval);
      }
    }, this.input.pollIntervalMs ?? 500);

    let adapterOutcome;
    try {
      adapterOutcome = await adapter.execute({
        cwd: this.input.targetWorktree,
        prompt: this.addGuidanceSection(prompt, claimed.guidance),
        codingResultJsonSchema: serializeCodingResultCliSchema(),
        mcpConfig: this.input.mcpConfig,
        resumeSessionId,
        expectedTaskId: task.task_id,
        signal: controller.signal,
        spawnProcess: this.input.spawnProcess,
        onProgress: (progress) => {
          // progress 只在 attempt 仍 running 时追加：room_ask_question 已把 attempt 置
          // decision_requested、cancel 已置 cancel_requested 之后不再写 progress。progress
          // 是证据不是权威，cancel race 下的追加失败不改变 terminal 分类。
          try {
            if (service.getAttempt(attempt.attempt_id)?.status === 'running') {
              service.appendAttemptProgress(
                {
                  attempt_id: attempt.attempt_id,
                  type: progress.type,
                  subtype: progress.subtype,
                  outcome: progress.outcome,
                },
                executorActor,
              );
            }
          } catch {
            // 忽略 cancel/decision race 的 progress 拒绝：不影响 attempt 的 terminal 事实。
          }
        },
      });
    } finally {
      clearInterval(pollInterval);
    }

    // ---- evidence 收集（无论 terminal 分类如何都保留已观察事实）----
    let gitEvidence: GitEvidence = { staged: [], unstaged: [], untracked: [] };
    let gitError: unknown = null;
    try {
      gitEvidence = await collectCompletionEvidence(this.input.targetWorktree);
    } catch (err) {
      gitError = err;
    }
    let artifactRefs: string[] = [];
    let artifactError: unknown = null;
    try {
      artifactRefs = writeArtifacts(
        repositoryRoot,
        attempt.attempt_id,
        adapterOutcome.stdoutLines,
        adapterOutcome.stderrChunks,
      );
    } catch (err) {
      artifactError = err;
    }

    // ---- terminal 分类与单一 settlement ----
    // 分类前重读 durable attempt status：planner 的 cancel 或 worker 的 Question 都可能在
    // process 结束后、settle 前已推进 status；settle 以最新 status 为 authority（cancel
    // intent 优先，terminal 只可能是 canceled）。
    const finalAttempt = service.getAttempt(attempt.attempt_id);
    if (!finalAttempt) {
      throw new ProtocolError('entity_not_found', `attempt ${attempt.attempt_id} missing before settle`);
    }
    const evidence = {
      agent_session_ref: adapterOutcome.streamOutcome.sessionId,
      process_exit_code: adapterOutcome.processOutcome?.exitCode ?? null,
      git_evidence: gitEvidence,
      artifact_refs: artifactRefs,
    };
    if (finalAttempt.status === 'cancel_requested') {
      const settled = service.settleRunAttempt(
        {
          attempt_id: attempt.attempt_id,
          status: 'canceled',
          result: null,
          failure: { code: 'canceled', message: 'run canceled by planner' },
          agent_session_ref: evidence.agent_session_ref,
          process_exit_code: evidence.process_exit_code,
          git_evidence: evidence.git_evidence,
          artifact_refs: evidence.artifact_refs,
        },
        executorActor,
      );
      return { room: settled.room, run: settled.run, attempt: settled.attempt };
    }
    if (finalAttempt.status === 'decision_requested') {
      // needs-decision pause：Worker 已在 process 内调用 room_ask_question。valid
      // status=needs_decision CodingResult 才持久化 result；process/stream/Git/artifact
      // 任一失败都记录为 failure，但不把 Run 改为 failed/review_required。
      const pause = classifyNeedsDecisionPause(
        adapterOutcome.processError,
        adapterOutcome.processOutcome,
        adapterOutcome.streamOutcome,
        gitError,
        artifactError,
      );
      const settled = service.settleRunAttempt(
        {
          attempt_id: attempt.attempt_id,
          status: 'needs_decision',
          result: pause.result,
          failure: pause.failure,
          agent_session_ref: evidence.agent_session_ref,
          process_exit_code: evidence.process_exit_code,
          git_evidence: evidence.git_evidence,
          artifact_refs: evidence.artifact_refs,
        },
        executorActor,
      );
      return { room: settled.room, run: settled.run, attempt: settled.attempt };
    }
    const terminal = classifyTerminal(
      adapterOutcome.processError,
      adapterOutcome.processOutcome,
      adapterOutcome.streamOutcome,
      gitError,
      artifactError,
    );
    if (terminal.kind === 'success') {
      const settled = service.settleRunAttempt(
        {
          attempt_id: attempt.attempt_id,
          status: 'succeeded',
          result: terminal.codingResult,
          failure: null,
          agent_session_ref: evidence.agent_session_ref,
          process_exit_code: evidence.process_exit_code,
          git_evidence: evidence.git_evidence,
          artifact_refs: evidence.artifact_refs,
        },
        executorActor,
      );
      return { room: settled.room, run: settled.run, attempt: settled.attempt };
    }
    const settled = service.settleRunAttempt(
      {
        attempt_id: attempt.attempt_id,
        status: terminal.attemptStatus,
        result: null,
        failure: { code: terminal.code, message: terminal.message },
        agent_session_ref: evidence.agent_session_ref,
        process_exit_code: evidence.process_exit_code,
        git_evidence: evidence.git_evidence,
        artifact_refs: evidence.artifact_refs,
      },
      executorActor,
    );
    return { room: settled.room, run: settled.run, attempt: settled.attempt };
  }

  // continuation kind 只由本 Run 的 attempt lineage 推导：无 prior attempt → 首实现；
  // 最近 attempt 以 needs_decision 终结 → decision resume；当前 Task 是 fix → fix resume；
  // 其余（failed/canceled/interrupted 后 retry）→ retry。
  private deriveContinuationKind(priorAttempt: RunAttempt | null, task: PersistedTask): ContinuationKind {
    if (priorAttempt === null) return 'new_implementation';
    if (priorAttempt.status === 'needs_decision') return 'decision';
    if (task.type === 'fix') return 'fix';
    return 'retry';
  }

  private isTerminalStatus(status: string): boolean {
    return ['succeeded', 'failed', 'needs_decision', 'canceled', 'interrupted'].includes(status);
  }

  private addGuidanceSection(prompt: string, guidance: readonly { text: string }[]): string {
    if (guidance.length === 0) return prompt;
    const lines = [
      prompt,
      '',
      '--- BEGIN RUN GUIDANCE ---',
      ...guidance.map((g, index) => `[${index + 1}] ${g.text}`),
      '--- END RUN GUIDANCE ---',
    ];
    return lines.join('\n');
  }
}

// 把完整 persisted TaskContract 序列化为结构化 prompt；decision continuation 由 caller
// 额外拼 answered Question context，guidance 由 claim 消费后附加。不接受摘要代替 persisted
// Contract，也不从 Review prose 或 session history 猜测 confirmed solution。
function buildPrompt(
  task: PersistedTask,
  continuationKind: ContinuationKind,
  targetWorktree: string,
  run: Run,
): string {
  const lines = [
    '执行下面完整、已批准的 Implementation Task Contract，并返回符合提供的 JSON Schema 的 Coding Result。',
    '',
    'Dispatch metadata:',
    `- task_id: ${task.task_id}`,
    `- run_id: ${run.run_id}`,
    `- target_worktree: ${targetWorktree}`,
    `- continuation_kind: ${continuationKind}`,
    `- confirmed_by_user: true`,
    '',
    '--- BEGIN ACCEPTED CONTRACT ---',
    JSON.stringify(task, null, 2),
    '--- END ACCEPTED CONTRACT ---',
  ];
  return lines.join('\n');
}

// Claude MCP config 的 worker route 校验：agent_room server 的 URL 必须精确指向 Run 冻结
// worker 的 canonical framed route（`p~` + encodeURIComponent(raw identity)，单一 URI
// segment，transport framing 与 authority identity 分离，Fix inc9-fr3/fr4），任何其它
// path（含 raw 多 segment 与 unframed candidate）都在 spawn/claim 前以 validation_failed
// 拒绝。
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
  | { kind: 'failure'; code: string; message: string; attemptStatus: 'failed' | 'interrupted' };

// terminal 分类的唯一 settlement owner：按 process → stream → status → Git → artifact 的
// 优先级返回单一 terminal result，成功需要全部条件同时满足。signal exit（非 cancel）映射
// attempt interrupted（Run 仍 failed）；cancel 路径不经过本分类。
function classifyTerminal(
  processError: ClaudeProcessStartError | ClaudeProcessInputError | null,
  processOutcome: ClaudeProcessOutcome | null,
  streamOutcome: ClaudeStreamOutcome,
  gitError: unknown,
  artifactError: unknown,
): TerminalResult {
  // 1. process 启动 / stdin 交付失败。
  if (processError !== null) {
    return {
      kind: 'failure',
      code: 'claude_start_failed',
      message: processError.message,
      attemptStatus: 'failed',
    };
  }
  // 2. non-zero exit 或 signal exit；即使 stdout 含看似成功 terminal 也不得成功。
  // signal 判断必须在前：signal 退出时 close 报告的 exitCode 为 null，`null !== 0` 会误入
  // non-zero exit 分支，使 interrupted 分类不可达。
  if (processOutcome !== null && processOutcome.signal !== null) {
    return {
      kind: 'failure',
      code: 'claude_exit_failed',
      message: `claude exited by signal ${processOutcome.signal}`,
      attemptStatus: 'interrupted',
    };
  }
  if (processOutcome !== null && processOutcome.exitCode !== 0) {
    return {
      kind: 'failure',
      code: 'claude_exit_failed',
      message: `claude exited with code ${processOutcome.exitCode}`,
      attemptStatus: 'failed',
    };
  }
  // 3. stream 失败：init 类映射 room_mcp_unavailable，其余映射 coding_result_invalid。
  if (!streamOutcome.ok) {
    if (MCP_INIT_FAILURE_REASONS.has(streamOutcome.reason)) {
      return {
        kind: 'failure',
        code: 'room_mcp_unavailable',
        message: streamOutcome.message,
        attemptStatus: 'failed',
      };
    }
    return {
      kind: 'failure',
      code: 'coding_result_invalid',
      message: streamOutcome.message,
      attemptStatus: 'failed',
    };
  }
  // 4. CodingResult 非 completed（task_id 匹配已由 interpreter 保证）。
  if (streamOutcome.codingResult.status !== 'completed') {
    return {
      kind: 'failure',
      code: 'coding_result_invalid',
      message: `coding result status ${streamOutcome.codingResult.status} cannot complete a run`,
      attemptStatus: 'failed',
    };
  }
  // 5. completion Git observation 失败。
  if (gitError !== null) {
    return {
      kind: 'failure',
      code: 'git_evidence_failed',
      message: errorMessage(gitError),
      attemptStatus: 'failed',
    };
  }
  // 6. artifact 写入失败。
  if (artifactError !== null) {
    return {
      kind: 'failure',
      code: 'artifact_write_failed',
      message: errorMessage(artifactError),
      attemptStatus: 'failed',
    };
  }
  return { kind: 'success', codingResult: streamOutcome.codingResult };
}

// needs-decision pause 的分类：有效 status=needs_decision CodingResult 才持久化 result；
// process/stream/Git/artifact 任一失败或 contradictory terminal 都记录为该 attempt.failure。
// 与 classifyTerminal 的差异：这里不要求 completed，也不产生 failed/review_required。
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
  // 4. paused attempt 的 valid CodingResult 必须为 status=needs_decision；completed/blocked
  // 属 contradictory terminal，不持久化 result。
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
// <attempt-id>/；artifact_refs 使用 repository-root-relative path。不保存 Task/Review JSON
// mirror 或权威 diff.patch。
function writeArtifacts(
  repositoryRoot: string,
  attemptId: string,
  stdoutLines: string[],
  stderrChunks: string[],
): string[] {
  const dir = join(repositoryRoot, '.agent-room', 'artifacts', attemptId);
  mkdirSync(dir, { recursive: true });
  const stdoutContent = stdoutLines.length > 0 ? `${stdoutLines.join('\n')}\n` : '';
  writeFileSync(join(dir, 'stdout.jsonl'), stdoutContent);
  writeFileSync(join(dir, 'stderr.log'), stderrChunks.join(''));
  return [
    ['.agent-room', 'artifacts', attemptId, 'stdout.jsonl'].join('/'),
    ['.agent-room', 'artifacts', attemptId, 'stderr.log'].join('/'),
  ];
}
