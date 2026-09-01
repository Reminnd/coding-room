import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { ProtocolError } from '../protocol/errors.ts';
import type { Run, RunAttempt } from '../protocol/schema.ts';
import type { RoomRecord } from '../room/repository.ts';
import { RoomService } from '../room/room-service.ts';
import type { ClaudeProcessSpawn } from '../runner/claude-process.ts';
import { runClaude } from '../runner/claude-runner.ts';

// one-shot room:run CLI（v0.4）：打开既有 file-backed Room database、连接 loopback worker
// participant route（/mcp/participants/{worker}）并执行恰好一个 attempt，然后退出。
// --run-id 与 fresh --attempt-id 必须显式提供；一次 operator approval 内至多执行一个
// attempt，不轮询 ready queue、不自动启动下一 Run。所有 preflight 在 spawn/claim/Event
// 前完成且零副作用；argument/preflight/ProtocolError 与未 settle 异常写 stderr 并 non-zero
// exit；succeeded/needs_decision/canceled 写 deterministic JSON {room,run,attempt} 并
// exit 0，failed/interrupted 输出相同 JSON 但 exit 1。canonical worktree 由 persisted Run
//（首 attempt 的 clean gate 冻结 owning repository root）拥有，caller 无法覆盖。

export interface RunCliConfig {
  db: string;
  project: string;
  runId: string;
  attemptId: string;
  mcpUrl: string;
}

export interface RunCliResult {
  room: RoomRecord;
  run: Run;
  attempt: RunAttempt;
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
        'run-id': { type: 'string' },
        'attempt-id': { type: 'string' },
        'mcp-url': { type: 'string' },
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
  const runId = values['run-id'];
  const attemptId = values['attempt-id'];
  const mcpUrl = values['mcp-url'];
  if (typeof db !== 'string' || db === '') throw new Error('--db <path> is required');
  if (typeof project !== 'string' || project === '') throw new Error('--project <path> is required');
  if (typeof runId !== 'string' || runId === '') throw new Error('--run-id <id> is required');
  if (typeof attemptId !== 'string' || attemptId === '') throw new Error('--attempt-id <fresh id> is required');
  if (typeof mcpUrl !== 'string' || mcpUrl === '') {
    throw new Error('--mcp-url <loopback http(s) /mcp/participants/{worker} URL> is required');
  }
  return { db, project, runId, attemptId, mcpUrl };
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

// MCP URL preflight：必须 http/https loopback 且 pathname 精确为 Run 冻结 worker 的
// canonical framed route（/mcp/participants/p~{encodeURIComponent(worker_participant_id)}），
// 不允许 search 或 hash。完整 raw identity 折叠为恰好一个 `p~`-framed URI segment
//（Fix inc9-fr4，`.`/`..`/斜杠 identity 不被 WHATWG URL dot-segment normalization 归并；
// Fix inc9-fr3 的 encoded 单 segment 语义保留）。worker 使用 Run 冻结 identity，assignment
// replacement 不改写既有 Run。错误 URL 在 spawn/claim 前拒绝，不创建任何文件。
function parseMcpUrlOrThrow(value: string, run: Run): URL {
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
  const expectedPath = `/mcp/participants/p~${encodeURIComponent(run.worker_participant_id)}`;
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
  pollIntervalMs?: number,
): Promise<RunCliResult> {
  requireExistingFile(config.db, 'database file');
  requireDirectory(config.project);
  const db = openRoomDatabaseOrThrow(config.db);
  try {
    const service = new RoomService(db);
    const run = service.getRun(config.runId);
    if (!run) {
      throw new ProtocolError('entity_not_found', `run ${config.runId} not found`);
    }
    const mcpUrl = parseMcpUrlOrThrow(config.mcpUrl, run);
    const mcpConfig = JSON.stringify({
      mcpServers: {
        agent_room: { type: 'http', url: mcpUrl.toString(), alwaysLoad: true },
      },
    });
    const result = await runClaude({
      roomService: service,
      runId: config.runId,
      attemptId: config.attemptId,
      targetWorktree: config.project,
      mcpConfig,
      ...(spawnProcess === undefined ? {} : { spawnProcess }),
      ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
    });
    return { room: result.room, run: result.run, attempt: result.attempt };
  } finally {
    // one-shot 进程语义：runClaude 完全 settle 后立即释放 file handle（Windows 下否则
    // 目录删除/后续进程会 EPERM），成功后输出由 runCliMain 在 close 之后写入。
    db.close();
  }
}

// main() 的可测试 seam：进程默认使用 process io；测试注入 fake spawner + recording io，证明
// stdout {room,run,attempt} 与 exit 0/1 契约，而不调用真实 Claude CLI 或 process.exit。
export async function runCliMain(
  argv: string[],
  deps: { spawnProcess?: ClaudeProcessSpawn; pollIntervalMs?: number } = {},
  io: RunCliIo = processIo,
): Promise<void> {
  try {
    const config = parseRunConfig(argv);
    const result = await runRoomRun(config, deps.spawnProcess, deps.pollIntervalMs);
    io.stdout(
      `${JSON.stringify({ room: result.room, run: result.run, attempt: result.attempt }, null, 2)}\n`,
    );
    // 只有 attempt 以 failed/interrupted 终结才 non-zero exit；succeeded/needs_decision/
    // canceled 都是该 approval 内已 settle 的合法 outcome。
    const failed =
      result.attempt.status === 'failed' || result.attempt.status === 'interrupted';
    io.exit(failed ? 1 : 0);
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
