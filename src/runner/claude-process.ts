import { spawn, type ChildProcess } from 'node:child_process';
import { z } from 'zod';
import { codingResultSchema } from '../protocol/schema.ts';

// 本 leaf 只拥有 Claude OS process 的原始事实：argument array、stdin prompt、stdout
// line、stderr chunk、exit code、signal 与 spawn 失败。stream 语义解释、Room 状态、
// Git evidence 与 protocol error 映射分别归 Stream Interpreter 与 Integration 所有。

// 冻结的 built-in tool list：只含实现 Contract 所需的最小只读与编辑工具。
const BUILT_IN_TOOLS: readonly string[] = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'];

// allowed tool list = built-in tools + 唯一 MCP tool room_ask_question；不含 Agent/Task、
// Web、browser、Git wrapper 或其它 MCP tool。两列表都以逗号分隔的单个 argument 传入。
const ALLOWED_TOOLS: readonly string[] = [...BUILT_IN_TOOLS, 'mcp__agent_room__room_ask_question'];

// Zod 4 toJSONSchema 生成的根 $schema 与 string minLength 已被本机真实 smoke 否证不被
// Claude CLI structured-output schema 接受。此处只在 CLI serialization boundary 递归删除
// 这两个 keyword，保留 properties/required/enum/array items/additionalProperties；CLI
// terminal object 仍由 Interpreter 用原始 codingResultSchema 严格验证，不建通用 registry。
function stripCliIncompatibleKeywords(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripCliIncompatibleKeywords);
  }
  if (node !== null && typeof node === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === '$schema' || key === 'minLength') continue;
      result[key] = stripCliIncompatibleKeywords(value);
    }
    return result;
  }
  return node;
}

// 生成已序列化的 CLI raw JSON Schema：从 codingResultSchema 经 Zod 生成后删除上述两个
// 不兼容 keyword，返回 JSON string 供 --json-schema 直接使用。
export function serializeCodingResultCliSchema(): string {
  return JSON.stringify(stripCliIncompatibleKeywords(z.toJSONSchema(codingResultSchema)));
}

export interface ClaudeProcessInput {
  cwd: string;
  prompt: string;
  codingResultJsonSchema: string;
  mcpConfig: string;
  resumeSessionId: string | null;
  // Stage 2 cancel boundary：Executor 通过 poll boundary 观察到 cancel_requested 后 abort，
  // 本模块只负责终止 owned child process；terminal 分类（canceled）由 Executor 在 abort
  // 之后按 attempt status 唯一 settle，不在此伪造 exit code。
  signal?: AbortSignal;
  onStdoutLine: (line: string) => void;
  onStderrChunk: (chunk: string) => void;
}

// 正常 close 时区分 exit 0 / non-zero exit / signal exit；两者互斥。
export interface ClaudeProcessOutcome {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

// spawn 无法启动时的最小 typed failure：保留 command/args/cwd 与原始 cause，绝不伪造
// exit code 或返回成功 outcome。args 可能含大体积 JSON（schema/mcp config），因此错误
// 消息不拼接 args，避免把 prompt 或配置泄入日志。
export class ClaudeProcessStartError extends Error {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;

  constructor(command: string, args: readonly string[], cwd: string, cause: unknown) {
    super(`claude process could not be started in ${cwd}`, { cause });
    this.name = 'ClaudeProcessStartError';
    this.command = command;
    this.args = args;
    this.cwd = cwd;
  }
}

// stdin prompt delivery failure（如 child 在读取前退出导致 write EPIPE）是独立于
// process-start failure 的 transport fact：完整 Contract 未送达，不得降级为普通 exit outcome。
export class ClaudeProcessInputError extends Error {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;

  constructor(command: string, args: readonly string[], cwd: string, cause: unknown) {
    super(`claude stdin prompt delivery failed in ${cwd}`, { cause });
    this.name = 'ClaudeProcessInputError';
    this.command = command;
    this.args = args;
    this.cwd = cwd;
  }
}

// stdout line callback 属于本 process Promise 的 delivery boundary。callback 失败必须
// 回到可等待链并停止 owned child，不能从 EventEmitter listener 逸出为 uncaught exception。
export class ClaudeProcessCallbackError extends Error {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;

  constructor(command: string, args: readonly string[], cwd: string, cause: unknown) {
    super(`claude stdout callback failed in ${cwd}: ${errorMessage(cause)}`, { cause });
    this.name = 'ClaudeProcessCallbackError';
    this.command = command;
    this.args = args;
    this.cwd = cwd;
  }
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// process boundary 注入 seam：仅供 fake-process 测试替换 spawn，不是通用 command runner。
export interface ClaudeProcessSpawnOptions {
  cwd: string;
  shell: false;
}

export type ClaudeProcessSpawn = (
  command: string,
  args: readonly string[],
  options: ClaudeProcessSpawnOptions,
) => ChildProcess;

function defaultSpawn(
  command: string,
  args: readonly string[],
  options: ClaudeProcessSpawnOptions,
): ChildProcess {
  return spawn(command, [...args], options);
}

function buildClaudeArgs(input: ClaudeProcessInput): string[] {
  const args: string[] = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--json-schema', input.codingResultJsonSchema,
    '--mcp-config', input.mcpConfig,
    '--strict-mcp-config',
    '--permission-mode', 'dontAsk',
    '--tools', BUILT_IN_TOOLS.join(','),
    '--allowedTools', ALLOWED_TOOLS.join(','),
  ];
  // 只有 resumeSessionId 非 null 才精确追加 --resume；绝不使用 --continue 或推断最近 session。
  if (input.resumeSessionId !== null) {
    args.push('--resume', input.resumeSessionId);
  }
  return args;
}

export function startClaudeProcess(
  input: ClaudeProcessInput,
  spawnProcess: ClaudeProcessSpawn = defaultSpawn,
): Promise<ClaudeProcessOutcome> {
  const args = buildClaudeArgs(input);

  return new Promise<ClaudeProcessOutcome>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnProcess('claude', args, { cwd: input.cwd, shell: false });
    } catch (cause) {
      reject(new ClaudeProcessStartError('claude', args, input.cwd, cause));
      return;
    }

    let settled = false;
    let stopRequested = false;

    const stopChild = (): void => {
      if (stopRequested) return;
      stopRequested = true;
      child.kill();
    };

    const rejectStdoutCallback = (cause: unknown): void => {
      if (settled) return;
      settled = true;
      const error = new ClaudeProcessCallbackError('claude', args, input.cwd, cause);
      try {
        stopChild();
      } finally {
        reject(error);
      }
    };

    const deliverStdoutLine = (line: string): boolean => {
      if (settled) return false;
      try {
        input.onStdoutLine(line);
        return true;
      } catch (cause) {
        rejectStdoutCallback(cause);
        return false;
      }
    };

    // abort 只终止 process；close 之后按正常 outcome 返回（exitCode null + signal 非 null），
    // 是否映射为 canceled terminal 由 Executor 依据 attempt status 决定，不在本层判定。
    if (input.signal !== undefined) {
      const abortHandler = () => {
        stopChild();
      };
      if (input.signal.aborted) {
        abortHandler();
      } else {
        input.signal.addEventListener('abort', abortHandler, { once: true });
        child.once('close', () => {
          input.signal?.removeEventListener('abort', abortHandler);
        });
      }
    }

    child.once('error', (cause) => {
      if (settled) return;
      settled = true;
      reject(new ClaudeProcessStartError('claude', args, input.cwd, cause));
    });

    child.once('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      resolve({ exitCode, signal });
    });

    // stdout 按 UTF-8 JSONL line boundary 交给 callback：一个 chunk 可含多行、一行可跨
    // 多个 chunk；本模块不做 JSON.parse，也不识别 event subtype。
    let stdoutBuffer = '';
    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        if (settled) return;
        stdoutBuffer += chunk;
        let newlineIndex: number;
        while ((newlineIndex = stdoutBuffer.indexOf('\n')) !== -1) {
          const line = stdoutBuffer.slice(0, newlineIndex);
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
          if (!deliverStdoutLine(line)) return;
        }
      });
      child.stdout.on('end', () => {
        if (settled) return;
        // JSONL 正常以换行结尾，此处 buffer 应为空；仅在尾行无换行时按 EOF flush。
        if (stdoutBuffer.length > 0) {
          const line = stdoutBuffer;
          stdoutBuffer = '';
          deliverStdoutLine(line);
        }
      });
    }

    // stderr 与 stdout 分离，原样交给 callback；stderr 内容不解释为 Run success/failure。
    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        input.onStderrChunk(chunk);
      });
    }

    // 完整 prompt 经 stdin 写入后关闭。stdin 写入失败（如 child 在读取前退出导致 EPIPE）
    // 表示完整 Contract 未送达，是 transport failure；以 ClaudeProcessInputError 拒绝并
    // 复用单次 settlement，之后 close/error event 不得把该结果改写为普通 exit outcome。
    if (child.stdin) {
      child.stdin.on('error', (cause) => {
        if (settled) return;
        settled = true;
        reject(new ClaudeProcessInputError('claude', args, input.cwd, cause));
      });
      child.stdin.end(input.prompt);
    }
  });
}
