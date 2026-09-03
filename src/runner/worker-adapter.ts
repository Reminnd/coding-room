import { ProtocolError } from '../protocol/errors.ts';
import {
  ClaudeProcessCallbackError,
  ClaudeProcessInputError,
  ClaudeProcessStartError,
  startClaudeProcess,
  type ClaudeProcessOutcome,
  type ClaudeProcessSpawn,
} from './claude-process.ts';
import {
  ClaudeStreamInterpreter,
  REQUIRED_ROOM_TOOL_NAME,
  type ClaudeStreamOutcome,
} from './claude-stream.ts';

// provider-neutral WorkerAdapter execution contract：Executor 与具体 Worker 之间的唯一 seam。
// Stage 2 只实现并验收 claude_code_cli；接口只抽象当前 Executor 的真实调用边界（一次
// process invocation → process/stream/outcome 事实），不等于 provider capability，也没有
// dynamic registry/discovery 或第二个 adapter（Contract non-goal）。

export interface WorkerAdapterExecuteInput {
  cwd: string;
  prompt: string;
  codingResultJsonSchema: string;
  mcpConfig: string;
  resumeSessionId: string | null;
  expectedTaskId: string;
  // cancel boundary：Executor 观察到 cancel_requested 后 abort 本 process invocation。
  signal?: AbortSignal;
  // process boundary 注入 seam：仅 fake-process 测试替换 spawn，不是通用 command runner。
  spawnProcess?: ClaudeProcessSpawn;
  // 非终态 progress evidence（interpreter 逐条产出），供 Executor 追加 progress Event。
  // raw stdout/stderr 不进 callback：adapter 在 outcome.stdoutLines/stderrChunks 单点累积，
  // Executor 在 settlement 后一次性消费，避免同一事实的双 delivery 路径。
  onProgress: (progress: { type: string | null; subtype: string | null; outcome: string | null }) => void;
}

// adapter 的完整观察事实：process 层失败（start/stdin）与正常 outcome 互斥，stream
// interpretation 结果永远存在（成功或失败）。terminal 分类与 Room 状态由 Executor 拥有，
// adapter 不接触 SQLite/transition。
export interface WorkerAdapterOutcome {
  processError: ClaudeProcessStartError | ClaudeProcessInputError | ClaudeProcessCallbackError | null;
  processOutcome: ClaudeProcessOutcome | null;
  streamOutcome: ClaudeStreamOutcome;
  stdoutLines: string[];
  stderrChunks: string[];
}

export interface WorkerAdapter {
  readonly adapterId: 'claude_code_cli';
  execute(input: WorkerAdapterExecuteInput): Promise<WorkerAdapterOutcome>;
}

// 唯一 adapter 选择边界：非 claude_code_cli 以 worker_adapter_unavailable 拒绝。claim 前由
// Executor 调用，保证失败时零 attempt/process/Event/artifact 副作用。
export function selectWorkerAdapter(adapterId: string): WorkerAdapter {
  if (adapterId !== 'claude_code_cli') {
    throw new ProtocolError(
      'worker_adapter_unavailable',
      `worker adapter ${adapterId} is not available; only claude_code_cli is implemented`,
    );
  }
  return new ClaudeCodeWorkerAdapter();
}

// Claude Code CLI adapter：复用 existing process transport 与 stream interpreter。
// session 语义 per-Run：resumeSessionId 只由 Executor 从同一 Run 的 attempt lineage 推导，
// adapter 自身绝不跨 Run 推断 session。
export class ClaudeCodeWorkerAdapter implements WorkerAdapter {
  readonly adapterId = 'claude_code_cli' as const;

  async execute(input: WorkerAdapterExecuteInput): Promise<WorkerAdapterOutcome> {
    const interpreter = new ClaudeStreamInterpreter({
      expectedTaskId: input.expectedTaskId,
      requiredToolName: REQUIRED_ROOM_TOOL_NAME,
      expectedSessionId: input.resumeSessionId,
    });

    const stdoutLines: string[] = [];
    const stderrChunks: string[] = [];

    let processError: ClaudeProcessStartError | ClaudeProcessInputError | ClaudeProcessCallbackError | null = null;
    let processOutcome: ClaudeProcessOutcome | null = null;
    try {
      processOutcome = await startClaudeProcess(
        {
          cwd: input.cwd,
          prompt: input.prompt,
          codingResultJsonSchema: input.codingResultJsonSchema,
          mcpConfig: input.mcpConfig,
          resumeSessionId: input.resumeSessionId,
          signal: input.signal,
          onStdoutLine: (line: string) => {
            stdoutLines.push(line);
            const progress = interpreter.acceptLine(line);
            if (progress !== null) {
              input.onProgress(progress);
            }
          },
          onStderrChunk: (chunk: string) => {
            stderrChunks.push(chunk);
          },
        },
        input.spawnProcess,
      );
    } catch (err) {
      if (
        err instanceof ClaudeProcessStartError ||
        err instanceof ClaudeProcessInputError ||
        err instanceof ClaudeProcessCallbackError
      ) {
        processError = err;
      } else {
        throw err;
      }
    }

    const streamOutcome = interpreter.finish();
    return { processError, processOutcome, streamOutcome, stdoutLines, stderrChunks };
  }
}
