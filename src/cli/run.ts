import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { ProtocolError } from '../protocol/errors.ts';
import type { Run } from '../protocol/schema.ts';
import type { RoomRecord } from '../room/repository.ts';
import { RoomService } from '../room/room-service.ts';
import type { ClaudeProcessSpawn } from '../runner/claude-process.ts';
import { runClaude, type ClaudeRunnerInput } from '../runner/claude-runner.ts';

// one-shot room:run CLI：打开既有 file-backed Room database、连接 loopback worker participant
// route（/mcp/participants/{worker}）并执行恰好一个 Run，然后退出。不启动 daemon/server/
// scheduler，不隐式创建 Room 或推进 planning。所有 preflight 在 spawn/claim/Event 前完成且
// 零副作用；argument/preflight/ProtocolError 与未 settle 异常写 stderr 并 non-zero exit；
// succeeded/needs_decision 写 deterministic JSON {room,run} 并 exit 0，failed 输出相同 JSON
// 但 exit 1。--baseline-head 仅首次 new Implementation 必需；continuation/retry 的 baseline
// 由 persisted source Run 拥有，caller 无法覆盖。

export interface RunCliConfig {
  db: string;
  project: string;
  taskId: string;
  runId: string;
  mcpUrl: string;
  baselineHead: string | null;
}

export interface RunCliResult {
  room: RoomRecord;
  run: Run;
}

export interface RunCliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  exit(code: number): void;
}

const processIo: RunCliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  // 设置 exitCode 而非调用 process.exit()：让 stdout/stderr 先 drain，避免管道截断；
  // 测试注入 recording io 时不会杀死 test process。
  exit: (code) => {
    process.exitCode = code;
  },
};

function parseRunConfig(argv: string[]): RunCliConfig {
  let values: Record<string, unknown>;
  try {
    const parsed = parseArgs({
      args: argv,
      options: {
        db: { type: 'string' },
        project: { type: 'string' },
        'task-id': { type: 'string' },
        'run-id': { type: 'string' },
        'mcp-url': { type: 'string' },
        'baseline-head': { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    });
    values = parsed.values as Record<string, unknown>;
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err));
  }
  const db = values.db;
  const project = values.project;
  const taskId = values['task-id'];
  const runId = values['run-id'];
  const mcpUrl = values['mcp-url'];
  const baselineHead = values['baseline-head'];
  if (typeof db !== 'string' || db === '') throw new Error('--db <path> is required');
  if (typeof project !== 'string' || project === '') throw new Error('--project <path> is required');
  if (typeof taskId !== 'string' || taskId === '') throw new Error('--task-id <id> is required');
  if (typeof runId !== 'string' || runId === '') throw new Error('--run-id <id> is required');
  if (typeof mcpUrl !== 'string' || mcpUrl === '') {
    throw new Error('--mcp-url <loopback http(s) /mcp/participants/{worker} URL> is required');
  }
  if (baselineHead !== undefined && typeof baselineHead !== 'string') {
    throw new Error('--baseline-head must be a string');
  }
  return {
    db,
    project,
    taskId,
    runId,
    mcpUrl,
    baselineHead: baselineHead ?? null,
  };
}

function requireExistingFile(path: string, what: string): void {
  let st;
  try {
    st = statSync(path);
  } catch {
    throw new Error(`${what} does not exist: ${path}`);
  }
  if (!st.isFile()) {
    throw new Error(`${what} is not a file: ${path}`);
  }
}

function requireDirectory(path: string): void {
  let st;
  try {
    st = statSync(path);
  } catch {
    throw new Error(`project directory does not exist: ${path}`);
  }
  if (!st.isDirectory()) {
    throw new Error(`project path is not a directory: ${path}`);
  }
}

// MCP URL preflight：必须 http/https loopback 且 pathname 精确为 resolved worker participant
// 的 canonical framed route（/mcp/participants/p~{encodeURIComponent(worker_participant_id)}），
// 不允许 search 或 hash。完整 raw identity 折叠为恰好一个 `p~`-framed URI segment
// （Fix inc9-fr4，`.`/`..`/斜杠 identity 不被 WHATWG URL dot-segment normalization 归并；
// Fix inc9-fr3 的 encoded 单 segment 语义保留）：raw 多 segment、未编码、unframed 或错误
// participant 的 URL 都不匹配 exact route。worker 按 Task scope 优先、Room default
// fallback 解析（Review finding inc9-r2），与 Runner claim 的解析口径一致。错误 URL 在
// spawn/claim 前拒绝，不创建任何文件。
function parseMcpUrlOrThrow(value: string, service: RoomService, roomId: string, taskId: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`invalid MCP URL: ${value}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`MCP URL must be http(s): ${value}`);
  }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error(`MCP URL must target a loopback host: ${value}`);
  }
  const worker = service.resolveAssignment(roomId, 'task', taskId, 'worker');
  if (!worker) {
    throw new Error(`no worker assignment for task ${taskId} in room ${roomId}`);
  }
  const expectedPath = `/mcp/participants/p~${encodeURIComponent(worker.participant_id)}`;
  if (url.pathname !== expectedPath) {
    throw new Error(`MCP URL must target the exact ${expectedPath} route: ${value}`);
  }
  if (url.search !== '' || url.hash !== '') {
    throw new Error(`MCP URL must not contain query or fragment: ${value}`);
  }
  return url;
}

// 既有 database preflight：先以 read-only 连接确认该 file 是 Room database（存在 rooms 表），
// 再打开 writable。空文件/非 Room database 在构造 RoomService 前被拒绝，绝不初始化 schema，
// 原文件保持原样。
function openRoomDatabaseOrThrow(path: string): DatabaseSync {
  const probe = new DatabaseSync(path, { readOnly: true });
  try {
    const row = probe
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rooms'")
      .get() as { name: string } | undefined;
    if (!row) {
      throw new Error(`database is not an existing Room database (missing rooms table): ${path}`);
    }
  } finally {
    probe.close();
  }
  return new DatabaseSync(path);
}

export async function runRoomRun(
  config: RunCliConfig,
  spawnProcess?: ClaudeProcessSpawn,
): Promise<RunCliResult> {
  requireExistingFile(config.db, 'database file');
  requireDirectory(config.project);
  const db = openRoomDatabaseOrThrow(config.db);
  try {
    const service = new RoomService(db);
    const task = service.getTask(config.taskId);
    if (!task) {
      throw new ProtocolError('entity_not_found', `task ${config.taskId} not found`);
    }
    // continuation kind 决定 --baseline-head 是否必需：仅首次 new Implementation 要求 caller
    // 提供 exact baseline；retry/decision/fix 的 baseline 由 persisted source Run 拥有。
    const context = service.getContinuationContext(task.room_id, task.task_id);
    const mcpUrl = parseMcpUrlOrThrow(config.mcpUrl, service, task.room_id, task.task_id);
    if (context.kind === 'new_implementation' && (config.baselineHead === null || config.baselineHead === '')) {
      throw new Error('--baseline-head <full HEAD> is required for a new implementation');
    }
    const mcpConfig = JSON.stringify({
      mcpServers: {
        agent_room: { type: 'http', url: mcpUrl.toString(), alwaysLoad: true },
      },
    });
    const input: ClaudeRunnerInput = {
      roomService: service,
      runId: config.runId,
      taskId: config.taskId,
      targetWorktree: config.project,
      expectedBaselineHead: config.baselineHead ?? '',
      mcpConfig,
      ...(spawnProcess === undefined ? {} : { spawnProcess }),
    };
    const result = await runClaude(input);
    return { room: result.room, run: result.run };
  } finally {
    // one-shot 进程语义：runClaude 完全 settle 后立即释放 file handle（Windows 下否则
    // 目录删除/后续进程会 EPERM），成功后输出由 runCliMain 在 close 之后写入。
    db.close();
  }
}

// main() 的可测试 seam：进程默认使用 process io；测试注入 fake spawner + recording io，证明
// stdout {room,run} 与 exit 0/1 契约，而不调用真实 Claude CLI 或 process.exit。
export async function runCliMain(
  argv: string[],
  deps: { spawnProcess?: ClaudeProcessSpawn } = {},
  io: RunCliIo = processIo,
): Promise<void> {
  try {
    const config = parseRunConfig(argv);
    const result = await runRoomRun(config, deps.spawnProcess);
    io.stdout(`${JSON.stringify({ room: result.room, run: result.run }, null, 2)}\n`);
    io.exit(result.run.status === 'failed' ? 1 : 0);
  } catch (err) {
    // ProtocolError 带稳定 code 前缀，operator 可直接按 code 处理；与 status CLI 一致。
    const message =
      err instanceof ProtocolError
        ? `${err.code}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    io.stderr(`${message}\n`);
    io.exit(1);
  }
}

function main(): void {
  void runCliMain(process.argv.slice(2));
}

// 只在作为 CLI entry point 直接执行时运行 main()：测试 import runCliMain 走 main() seam，
// 不触发进程级 stderr/exitCode 副作用；status CLI 走 subprocess 测试模式，无需此 guard。
const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  main();
}
