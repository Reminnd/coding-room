import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

// room:serve runtime entry 的黑盒回归：以独立 child process 运行 `node src/mcp/serve.ts`，
// 验证 startup validation 边界 —— project shape 先于 database open 校验、invalid args、
// corrupt database、occupied-port bind failure 均 non-zero 退出且不伪装 ready；valid config
// 真实监听 127.0.0.1 后才输出 listening。
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const serveCli = join(root, 'src', 'mcp', 'serve.ts');

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'agent-room-serve-'));
}

// 对预期退出的场景：spawnSync 阻塞至进程结束，timeout 兜底防止异常挂起。
function runServe(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [serveCli, ...args], { encoding: 'utf8', timeout: 10000 });
  return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

// 对长期存活的 valid-config 场景：绑定临时端口后释放，取得可用端口。
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('no port bound')));
      }
    });
    srv.on('error', reject);
  });
}

test('room:serve exits non-zero when --project does not exist and creates no --db file', () => {
  const dir = makeDir();
  const dbPath = join(dir, 'room.db');
  const missingProject = join(dir, 'nope');
  const r = runServe(['--db', dbPath, '--project', missingProject, '--port', '7777']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /project directory does not exist/);
  assert.equal(r.stdout, ''); // 不输出 listening
  assert.equal(existsSync(dbPath), false); // project validation 先于 db open，不创建 db 文件
  rmSync(dir, { recursive: true, force: true });
});

test('room:serve exits non-zero when --project is not a directory and creates no --db file', () => {
  const dir = makeDir();
  const dbPath = join(dir, 'room.db');
  const fileProject = join(dir, 'file.txt');
  writeFileSync(fileProject, 'x');
  const r = runServe(['--db', dbPath, '--project', fileProject, '--port', '7777']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /project path is not a directory/);
  assert.equal(r.stdout, '');
  assert.equal(existsSync(dbPath), false);
  rmSync(dir, { recursive: true, force: true });
});

test('room:serve rejects an invalid --port and missing required args with non-zero exit', () => {
  const dir = makeDir();
  const project = join(dir, 'proj');
  mkdirSync(project);
  const dbPath = join(dir, 'room.db');

  const r1 = runServe(['--db', dbPath, '--project', project, '--port', 'not-a-port']);
  assert.notEqual(r1.status, 0);
  assert.match(r1.stderr, /--port must be an integer in 1\.\.65535/);

  const r2 = runServe(['--project', project, '--port', '7777']);
  assert.notEqual(r2.status, 0);
  assert.match(r2.stderr, /--db <path> is required/);

  const r3 = runServe(['--db', dbPath, '--port', '7777']);
  assert.notEqual(r3.status, 0);
  assert.match(r3.stderr, /--project <path> is required/);

  rmSync(dir, { recursive: true, force: true });
});

test('room:serve exits non-zero on a corrupt database and does not print listening', () => {
  const dir = makeDir();
  const project = join(dir, 'proj');
  mkdirSync(project);
  const dbPath = join(dir, 'room.db');
  writeFileSync(dbPath, 'not a sqlite database file at all');
  const r = runServe(['--db', dbPath, '--project', project, '--port', '7777']);
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, '');
  rmSync(dir, { recursive: true, force: true });
});

// Fix inc9-r6：v0.3 writable open 门禁。缺 protocol_metadata 的 v0.2 archive 与 wrong
// exact metadata 都必须在任何 schema/state write 前以 protocol_version_mismatch 拒绝，
// 且旧 database 逐 byte 不变。
test('room:serve refuses a v0.2 archive without protocol metadata and leaves it byte-identical', () => {
  const dir = makeDir();
  const project = join(dir, 'proj');
  mkdirSync(project);
  const dbPath = join(dir, 'room.db');
  // 测试侧 literal 建立真实 v0.2 archive：rooms 表存在、无 protocol_metadata 表。
  const archive = new DatabaseSync(dbPath);
  archive.exec(
    'CREATE TABLE rooms (room_id TEXT PRIMARY KEY, state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);',
  );
  archive
    .prepare('INSERT INTO rooms (room_id, state, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run('room-old', 'ACCEPTED', '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z');
  archive.close();
  const before = readFileSync(dbPath);
  const r = runServe(['--db', dbPath, '--project', project, '--port', '7777']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /protocol_version_mismatch/);
  assert.equal(r.stdout, '');
  assert.deepEqual(readFileSync(dbPath), before, 'v0.2 archive must be preserved byte-for-byte');
  rmSync(dir, { recursive: true, force: true });
});

test('room:serve refuses wrong exact protocol metadata and leaves the database byte-identical', () => {
  const dir = makeDir();
  const project = join(dir, 'proj');
  mkdirSync(project);
  const dbPath = join(dir, 'room.db');
  const archive = new DatabaseSync(dbPath);
  archive.exec(
    'CREATE TABLE rooms (room_id TEXT PRIMARY KEY, state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);' +
      'CREATE TABLE protocol_metadata (protocol_version TEXT NOT NULL);' +
      "INSERT INTO protocol_metadata (protocol_version) VALUES ('0.2');",
  );
  archive.close();
  const before = readFileSync(dbPath);
  const r = runServe(['--db', dbPath, '--project', project, '--port', '7777']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /protocol_version_mismatch/);
  assert.equal(r.stdout, '');
  assert.deepEqual(readFileSync(dbPath), before, 'wrong-version database must be preserved byte-for-byte');
  rmSync(dir, { recursive: true, force: true });
});

test('room:serve exits non-zero when the port is already bound', async () => {
  const dir = makeDir();
  const project = join(dir, 'proj');
  mkdirSync(project);
  const dbPath = join(dir, 'room.db');

  const blocker = net.createServer();
  await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const addr = blocker.address();
  assert.ok(addr && typeof addr === 'object');
  const port = addr.port;

  try {
    const r = runServe(['--db', dbPath, '--project', project, '--port', String(port)]);
    assert.notEqual(r.status, 0);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /failed to bind/);
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('room:serve with a valid config starts and listens on 127.0.0.1', async () => {
  const dir = makeDir();
  const project = join(dir, 'proj');
  mkdirSync(project);
  const dbPath = join(dir, 'room.db');
  const port = await getFreePort();

  const child = spawn(process.execPath, [
    serveCli,
    '--db',
    dbPath,
    '--project',
    project,
    '--port',
    String(port),
  ]);
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => {
    stdout += d;
  });
  child.stderr.on('data', (d) => {
    stderr += d;
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new Error(`timeout waiting for listening; stderr=${stderr}`)),
        5000,
      );
      const onData = () => {
        if (stdout.includes('Room MCP listening on')) {
          clearTimeout(deadline);
          resolve();
        }
      };
      child.stdout.on('data', onData);
      child.on('exit', (code) => {
        clearTimeout(deadline);
        reject(new Error(`exited early code=${code}; stderr=${stderr}`));
      });
    });

    assert.match(stdout, /Room MCP listening on http:\/\/127\.0\.0\.1:/);
    assert.equal(existsSync(dbPath), true);

    // 真实监听：framed participant route 上 GET 走 405 而非连接失败；v0.2 alias 已废弃。
    const res = await fetch(`http://127.0.0.1:${port}/mcp/participants/p~codex-app`, { method: 'GET' });
    assert.equal(res.status, 405);
  } finally {
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => child.once('close', () => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});
