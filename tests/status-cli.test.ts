import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { RoomService } from '../src/room/room-service.ts';
import {
  makeAttemptSettle,
  makeCodingResult,
  makeFinding,
  makeFixTask,
  makeReview,
  makeTask,
} from './fixtures.ts';

// read-only Status CLI 的黑盒测试：以独立 child process 运行 `node src/cli/status.ts`，
// 验证 v0.4 deterministic JSON 输出（planning_waiting_actor + per-Run run_work_items）、
// missing db / missing room / invalid args / empty db / corrupt db 回归，以及“只读不变性”
// ——运行 CLI 不创建 entity/Event、不改变 Room/Run 状态。
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const statusCli = join(root, 'src', 'cli', 'status.ts');

function makeDbDir(): string {
  return mkdtempSync(join(tmpdir(), 'agent-room-status-'));
}

function runStatus(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [statusCli, ...args], { encoding: 'utf8' });
  return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

// v0.4 actor literal：与默认 bootstrap assignment 一致（测试侧独立 literal，不导入实现）。
const PLANNER = { participant_id: 'codex-app', actor_role: 'planner' as const };
const EXECUTOR = { participant_id: 'local-runner', actor_role: 'executor' as const };
const REVIEWER = { participant_id: 'codex-app', actor_role: 'reviewer' as const };

const WORKTREE = 'D:\\agent\\case\\project';

// seed：Room planning round → ready Run → claim attempt-1（cursor 6）。Room 保持 DISCUSSION，
// Run 是 execution/review lifecycle 的唯一 owner。
function seedDb(dbPath: string): void {
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER);
  service.claimRunAttempt(
    { attempt_id: 'attempt-1', run_id: 'run-1', room_id: 'room-1', worktree_path: WORKTREE },
    EXECUTOR,
  );
  db.close();
}

test('status CLI prints deterministic pretty JSON matching the seeded Room/Run state', () => {
  const dir = makeDbDir();
  const dbPath = join(dir, 'room.db');
  seedDb(dbPath);

  const r = runStatus(['--db', dbPath, '--room-id', 'room-1']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout.includes('baseline_head'), false, 'public status JSON must not expose the removed field');

  const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
  // 固定 key 顺序是 formatStatus 的确定性契约。
  assert.deepEqual(Object.keys(parsed), [
    'room_id',
    'state',
    'planning_waiting_actor',
    'cursor',
    'runs',
  ]);
  // 值来自测试侧 seed fixture 的独立 literal，不从实现导入。
  assert.equal(parsed.room_id, 'room-1');
  assert.equal(parsed.state, 'DISCUSSION');
  assert.equal(parsed.planning_waiting_actor, 'planner');
  assert.equal(parsed.cursor, 6);
  const runs = parsed.runs as Record<string, unknown>[];
  assert.equal(runs.length, 1);
  assert.deepEqual(Object.keys(runs[0]), [
    'run_id',
    'status',
    'waiting_actor',
    'current_task_id',
    'current_attempt_id',
    'current_question_id',
    'current_review_id',
  ]);
  assert.deepEqual(runs[0], {
    run_id: 'run-1',
    status: 'running',
    waiting_actor: 'worker',
    current_task_id: 'task-1',
    current_attempt_id: 'attempt-1',
    current_question_id: null,
    current_review_id: null,
  });

  rmSync(dir, { recursive: true, force: true });
});

test('status CLI shows the Implementation Task for an initial-ready Run before any claim', () => {
  const dir = makeDbDir();
  const dbPath = join(dir, 'room.db');
  // Review finding inc10-r3：ready work item 的 current task 从 latest persisted Task 推导，
  // 不依赖 attempt —— claim 前即显示 task-1。
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER);
  db.close();

  const r = runStatus(['--db', dbPath, '--room-id', 'room-1']);
  assert.equal(r.status, 0, r.stderr);
  const runs = (JSON.parse(r.stdout) as { runs: Record<string, unknown>[] }).runs;
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0], {
    run_id: 'run-1',
    status: 'ready',
    waiting_actor: 'executor',
    current_task_id: 'task-1',
    current_attempt_id: null,
    current_question_id: null,
    current_review_id: null,
  });
  rmSync(dir, { recursive: true, force: true });
});

test('status CLI shows the Fix Task for a fix-ready Run before the next claim', () => {
  const dir = makeDbDir();
  const dbPath = join(dir, 'room.db');
  // fix-ready：attempt-1 succeeded + changes_requested + Fix Task 已提交，Run 回到 ready、
  // 尚未 claim attempt-2。current task 必须已切换为 Fix Task（Review finding inc10-r3）。
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER);
  service.claimRunAttempt(
    { attempt_id: 'attempt-1', run_id: 'run-1', room_id: 'room-1', worktree_path: WORKTREE },
    EXECUTOR,
  );
  service.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-1', result: makeCodingResult(), process_exit_code: 0 }), EXECUTOR);
  service.submitReview(
    makeReview({ decision: 'changes_requested', findings: [makeFinding()] }),
    REVIEWER,
  );
  service.submitTask(makeFixTask({ task_id: 'task-2', room_id: 'room-1', run_id: 'run-1' }), PLANNER);
  db.close();

  const r = runStatus(['--db', dbPath, '--room-id', 'room-1']);
  assert.equal(r.status, 0, r.stderr);
  const runs = (JSON.parse(r.stdout) as { runs: Record<string, unknown>[] }).runs;
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0], {
    run_id: 'run-1',
    status: 'ready',
    waiting_actor: 'executor',
    current_task_id: 'task-2',
    current_attempt_id: 'attempt-1',
    current_question_id: null,
    current_review_id: 'review-1',
  });
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

test('status CLI is read-only: no entity, Event or Room/Run state change', () => {
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
  assert.equal(service.getRoom('room-1')!.state, 'DISCUSSION');
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
