import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { RoomService } from '../src/room/room-service.ts';
import { makeRun, makeTask } from './fixtures.ts';

// read-only Status CLI 的黑盒测试：以独立 child process 运行 `node src/cli/status.ts`，
// 验证 deterministic JSON 输出、missing db 回归、missing room 回归、invalid args 回归，
// 以及“只读不变性”——运行 CLI 不创建 entity/Event、不改变 Room state。
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const statusCli = join(root, 'src', 'cli', 'status.ts');

function makeDbDir(): string {
  return mkdtempSync(join(tmpdir(), 'agent-room-status-'));
}

function runStatus(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [statusCli, ...args], { encoding: 'utf8' });
  return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

function seedDb(dbPath: string): void {
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun()); // CODING，cursor 5
  db.close();
}

test('status CLI prints deterministic pretty JSON matching the seeded Room state', () => {
  const dir = makeDbDir();
  const dbPath = join(dir, 'room.db');
  seedDb(dbPath);

  const r = runStatus(['--db', dbPath, '--room-id', 'room-1']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');

  const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
  // 固定 key 顺序是 formatStatus 的确定性契约。
  assert.deepEqual(Object.keys(parsed), [
    'room_id',
    'state',
    'waiting_actor',
    'cursor',
    'current_task_id',
    'current_run_id',
    'current_review_id',
    'current_question_id',
    'latest_run_status',
    'latest_run_failure',
    'git_evidence',
  ]);
  // 值来自测试侧 seed fixture 的独立 literal，不从实现导入。
  assert.equal(parsed.room_id, 'room-1');
  assert.equal(parsed.state, 'CODING');
  assert.equal(parsed.waiting_actor, 'claude');
  assert.equal(parsed.cursor, 5);
  assert.equal(parsed.current_task_id, 'task-1');
  assert.equal(parsed.current_run_id, 'run-1');
  assert.equal(parsed.current_review_id, null);
  assert.equal(parsed.current_question_id, null);
  assert.equal(parsed.latest_run_status, 'running');
  assert.equal(parsed.latest_run_failure, null);
  assert.deepEqual(parsed.git_evidence, { staged: [], unstaged: [], untracked: [] });

  rmSync(dir, { recursive: true, force: true });
});

test('status CLI exits non-zero without creating a database when --db is missing', () => {
  const dir = makeDbDir();
  const missing = join(dir, 'does-not-exist.db');
  const r = runStatus(['--db', missing, '--room-id', 'room-1']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /does not exist/);
  assert.equal(r.stdout, '');
  assert.equal(existsSync(missing), false); // 不创建空 database/schema
  rmSync(dir, { recursive: true, force: true });
});

test('status CLI exits non-zero for a missing room in a valid database', () => {
  const dir = makeDbDir();
  const dbPath = join(dir, 'room.db');
  seedDb(dbPath);
  const r = runStatus(['--db', dbPath, '--room-id', 'nope']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /entity_not_found/);
  assert.equal(r.stdout, '');
  rmSync(dir, { recursive: true, force: true });
});

test('status CLI rejects missing --db or --room-id with non-zero exit', () => {
  const r1 = runStatus(['--room-id', 'room-1']);
  assert.notEqual(r1.status, 0);
  assert.match(r1.stderr, /--db <path> is required/);

  const r2 = runStatus(['--db', 'x.db']);
  assert.notEqual(r2.status, 0);
  assert.match(r2.stderr, /--room-id <id> is required/);
});

test('status CLI is read-only: no entity, Event or Room state change', () => {
  const dir = makeDbDir();
  const dbPath = join(dir, 'room.db');
  seedDb(dbPath);

  const eventsBefore = (() => {
    const db = new DatabaseSync(dbPath);
    const n = new RoomService(db).listEvents('room-1').length;
    db.close();
    return n;
  })();

  const r = runStatus(['--db', dbPath, '--room-id', 'room-1']);
  assert.equal(r.status, 0, r.stderr);

  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  assert.equal(service.listEvents('room-1').length, eventsBefore);
  assert.equal(service.getRoom('room-1')!.state, 'CODING');
  assert.equal(service.getTask('task-1')!.goal, 'goal');
  assert.equal(service.getRun('run-1')!.status, 'running');
  db.close();

  rmSync(dir, { recursive: true, force: true });
});

test('status CLI exits non-zero for an existing empty database and writes no Room schema', () => {
  const dir = makeDbDir();
  const dbPath = join(dir, 'room.db');
  writeFileSync(dbPath, ''); // 既存 0-byte 空 database，非 valid schema
  const r = runStatus(['--db', dbPath, '--room-id', 'room-1']);
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /cannot read database/);
  // readOnly 打开 + schema init 失败后不得写入任何 schema/table。
  assert.equal(statSync(dbPath).size, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('status CLI exits non-zero for a corrupt database file and prints no status JSON', () => {
  const dir = makeDbDir();
  const dbPath = join(dir, 'room.db');
  writeFileSync(dbPath, 'not a sqlite database file at all');
  const r = runStatus(['--db', dbPath, '--room-id', 'room-1']);
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /cannot (open|read) database/);
  rmSync(dir, { recursive: true, force: true });
});
