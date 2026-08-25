import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { RoomService } from '../src/room/room-service.ts';
import { getRoomStateSnapshot } from '../src/room/state-snapshot.ts';
import {
  makeCodingResult,
  makeFinding,
  makeFixTask,
  makeQuestion,
  makeReview,
  makeRun,
  makeTask,
  makeTerminalEvidence,
} from './fixtures.ts';

// 共享只读 Room state snapshot boundary 的回归测试：cursor、waiting actor、current entity
// resolution 与 open question 都由 RoomService 既有 read method 推导，测试侧只驱动公开
// application operation，不直接访问 repository/SQLite。
function makeService(): { service: RoomService } {
  const db = new DatabaseSync(':memory:');
  return { service: new RoomService(db) };
}

function snap(service: RoomService, roomId = 'room-1', after?: number | null) {
  return getRoomStateSnapshot(service, { room_id: roomId, after_sequence: after ?? null });
}

function errCode(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return (err as { code?: string }).code ?? null;
  }
}

function toWaiting(service: RoomService): void {
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
}

function toPlanReady(service: RoomService): void {
  toWaiting(service);
  service.submitTask(makeTask());
}

function toCoding(service: RoomService): void {
  toPlanReady(service);
  service.startRun(makeRun());
}

test('snapshot of a missing room returns entity_not_found', () => {
  const { service } = makeService();
  assert.equal(errCode(() => snap(service, 'missing')), 'entity_not_found');
});

test('freshly created room: one event, codex waiting, no current entity', () => {
  const { service } = makeService();
  service.createRoom('room-1');
  const s = snap(service);
  assert.equal(s.room.state, 'DISCUSSION');
  assert.equal(s.waiting_actor, 'codex');
  assert.equal(s.cursor, 1);
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].sequence, 1);
  assert.equal(s.current_task, null);
  assert.equal(s.current_run, null);
  assert.equal(s.current_review, null);
  assert.equal(s.current_question, null);
});

test('cursor is the max event sequence; events respect after_sequence', () => {
  const { service } = makeService();
  toCoding(service); // room_created, state_transition, state_transition, task_submitted, run_started
  const all = snap(service);
  assert.equal(all.cursor, 5);
  assert.deepEqual(all.events.map((e) => e.sequence), [1, 2, 3, 4, 5]);

  const after2 = snap(service, 'room-1', 2);
  assert.equal(after2.cursor, 5);
  assert.deepEqual(after2.events.map((e) => e.sequence), [3, 4, 5]);

  assert.deepEqual(snap(service, 'room-1', 5).events, []);
  assert.equal(snap(service, 'room-1', null).events.length, 5);
});

test('current task/run/review resolve from the latest relevant Event reference', () => {
  const { service } = makeService();
  toCoding(service); // task-1, run-1 running
  let s = snap(service);
  assert.equal(s.current_task?.task_id, 'task-1');
  assert.equal(s.current_run?.run_id, 'run-1');
  assert.equal(s.current_review, null);

  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence()); // REVIEW_REQUIRED
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] })); // review-1
  s = snap(service);
  assert.equal(s.current_review?.review_id, 'review-1');
  assert.equal(s.current_run?.run_id, 'run-1'); // run_completed 不改变 current run 身份

  service.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', parent_task_id: 'task-1', based_on_review_id: 'review-1' }),
  ); // FIX_PLAN_READY
  s = snap(service);
  assert.equal(s.current_task?.task_id, 'task-2'); // 最新 task_submitted 覆盖 task-1
});

test('waiting_actor follows the fixed Room.state mapping across the primary path', () => {
  const { service } = makeService();
  service.createRoom('room-1');
  assert.equal(snap(service).waiting_actor, 'codex'); // DISCUSSION
  service.transitionToArchitectureReview('room-1');
  assert.equal(snap(service).waiting_actor, 'codex'); // ARCHITECTURE_REVIEW
  service.transitionToWaitingForUserConfirmation('room-1');
  assert.equal(snap(service).waiting_actor, 'user'); // WAITING_FOR_USER_CONFIRMATION
  service.submitTask(makeTask());
  assert.equal(snap(service).waiting_actor, 'runner'); // PLAN_READY
  service.startRun(makeRun());
  assert.equal(snap(service).waiting_actor, 'claude'); // CODING
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence());
  assert.equal(snap(service).waiting_actor, 'codex'); // REVIEW_REQUIRED
  service.submitReview(makeReview());
  assert.equal(snap(service).waiting_actor, 'user'); // REVIEW_DISCUSSION
  service.acceptReview('review-1', true);
  assert.equal(snap(service).waiting_actor, null); // ACCEPTED
});

test('waiting_actor for RUN_FAILED, FIX_PLAN_READY and NEEDS_DECISION', () => {
  const a = makeService().service;
  toCoding(a);
  a.failRun('run-1', { code: 'claude_exit_failed', message: 'boom' }, makeTerminalEvidence());
  assert.equal(snap(a).waiting_actor, 'codex'); // RUN_FAILED

  const b = makeService().service;
  toCoding(b);
  b.completeRun('run-1', makeCodingResult(), makeTerminalEvidence());
  b.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }));
  b.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', parent_task_id: 'task-1', based_on_review_id: 'review-1' }),
  );
  assert.equal(snap(b).waiting_actor, 'runner'); // FIX_PLAN_READY

  const c = makeService().service;
  toCoding(c);
  c.askQuestion(makeQuestion());
  assert.equal(snap(c).waiting_actor, 'user'); // NEEDS_DECISION
});

test('current_question only when the latest question_asked is still open', () => {
  const { service } = makeService();
  toCoding(service);
  service.askQuestion(makeQuestion());
  assert.equal(snap(service).current_question?.question_id, 'question-1');
  service.answerQuestion('question-1', 'pick a', false);
  assert.equal(snap(service).current_question, null);
});
