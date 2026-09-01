import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { ProtocolError } from '../protocol/errors.ts';
import { RoomService } from '../room/room-service.ts';
import { createRoomMcpApp } from './http.ts';

// Room MCP runtime entry：显式 --db/--project/--port，host 固定 127.0.0.1。不提供 remote
// bind、OAuth、user account 或隐式 production database path。配置错误或 bind/database
// failure 写 stderr 并 non-zero exit，不伪装 service ready。

interface ServeConfig {
  db: string;
  project: string;
  port: number;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseConfigOrExit(argv: string[]): ServeConfig {
  let values: { db?: unknown; project?: unknown; port?: unknown };
  try {
    const parsed = parseArgs({
      args: argv,
      options: {
        db: { type: 'string' },
        project: { type: 'string' },
        port: { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    });
    values = parsed.values as { db?: unknown; project?: unknown; port?: unknown };
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const db = values.db;
  const project = values.project;
  const portRaw = values.port;
  if (typeof db !== 'string' || db === '') fail('--db <path> is required');
  if (typeof project !== 'string' || project === '') fail('--project <path> is required');
  if (typeof portRaw !== 'string') fail('--port <1..65535> is required');
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail('--port must be an integer in 1..65535');
  }
  return { db, project, port };
}

function openDbOrExit(path: string): DatabaseSync {
  try {
    // 合法 startup 允许创建 database；corrupt/unopenable path 的失败由后续 schema
    // initialization 或此处抛错触发 non-zero exit，不伪装 ready。
    return new DatabaseSync(path);
  } catch (err) {
    fail(`cannot open database ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// project path shape validation 属于 runtime configuration boundary：在打开/初始化任何
// database 前拒绝 missing/non-directory project。Git repository/clean gate 仍只在
// 首次 Implementation submission 由 Git Observer 执行，不在 startup 提前强化。
function validateProjectOrExit(path: string): void {
  let st;
  try {
    st = statSync(path);
  } catch {
    fail(`project directory does not exist: ${path}`);
  }
  if (!st.isDirectory()) {
    fail(`project path is not a directory: ${path}`);
  }
}

function main(): void {
  const config = parseConfigOrExit(process.argv.slice(2));
  // 失败不得创建 --db 文件或输出 listening：project validation 必须先于 openDbOrExit。
  validateProjectOrExit(config.project);
  const db = openDbOrExit(config.db);
  let service: RoomService;
  try {
    service = new RoomService(db);
  } catch (err) {
    // v0.3 writable open 门禁（v0.2 archive / version mismatch）以稳定 code 拒绝，
    // 不初始化 schema、不改写 database。
    if (err instanceof ProtocolError) {
      fail(`${err.code}: ${err.message}`);
    }
    throw err;
  }
  const app = createRoomMcpApp({ service, projectPath: config.project });

  const server = app.listen(config.port, '127.0.0.1');
  server.on('error', (err) => {
    fail(`failed to bind 127.0.0.1:${config.port}: ${err.message}`);
  });
  server.on('listening', () => {
    process.stdout.write(`Room MCP listening on http://127.0.0.1:${config.port}\n`);
  });
}

main();
