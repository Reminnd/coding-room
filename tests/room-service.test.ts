import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoomService } from '../src/room/room-service.ts';
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

function makeService(): { db: DatabaseSync; service: RoomService } {
  const db = new DatabaseSync(':memory:');
  const service = new RoomService(db);
  return { db, service };
}

function errCode(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return (err as { code?: string }).code ?? null;
  }
}

function toWaiting(service: RoomService, roomId = 'room-1'): void {
  service.createRoom(roomId);
  service.transitionToArchitectureReview(roomId);
  service.transitionToWaitingForUserConfirmation(roomId);
}

function toPlanReady(service: RoomService): void {
  toWaiting(service);
  service.submitTask(makeTask());
}

function toCoding(service: RoomService): void {
  toPlanReady(service);
  service.startRun(makeRun());
}

// 完整 Implementation -> Review(changes_requested) -> Fix Task 链路，使 current Task 为
// fix task-2，用于验证 startRun/resumeRun 只接受该 Room 最新 task_submitted 指向的 Task。
function toFixPlanReady(service: RoomService): void {
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask()); // task-1 implementation, PLAN_READY
  service.startRun(makeRun()); // run-1, CODING
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence()); // REVIEW_REQUIRED
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] })); // REVIEW_DISCUSSION
  service.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', parent_task_id: 'task-1', based_on_review_id: 'review-1' }),
  ); // FIX_PLAN_READY, current task = task-2
}

test('createRoom sets initial state DISCUSSION and appends first event', () => {
  const { service } = makeService();
  const { room, created } = service.createRoom('room-1');
  assert.equal(created, true);
  assert.equal(room.state, 'DISCUSSION');
  const events = service.listEvents('room-1');
  assert.equal(events.length, 1);
  assert.equal(events[0].sequence, 1);
  assert.equal(events[0].actor, 'system');
});

test('planning transitions move DISCUSSION -> ARCHITECTURE_REVIEW -> WAITING_FOR_USER_CONFIRMATION', () => {
  const { service } = makeService();
  service.createRoom('room-1');
  assert.equal(service.transitionToArchitectureReview('room-1').state, 'ARCHITECTURE_REVIEW');
  assert.equal(
    service.transitionToWaitingForUserConfirmation('room-1').state,
    'WAITING_FOR_USER_CONFIRMATION',
  );
});

test('submitTask (implementation) moves to PLAN_READY and persists the task', () => {
  const { service } = makeService();
  toWaiting(service);
  const { room, task, created } = service.submitTask(makeTask());
  assert.equal(created, true);
  assert.equal(room.state, 'PLAN_READY');
  assert.equal(task.goal, 'goal');
  assert.equal(service.getTask('task-1')?.task_id, 'task-1');
});

test('submitTask in wrong state fails with invalid_transition and leaves no partial write', () => {
  const { service } = makeService();
  service.createRoom('room-1'); // DISCUSSION
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(errCode(() => service.submitTask(makeTask())), 'invalid_transition');
  assert.equal(service.getTask('task-1'), null);
  assert.equal(service.getRoom('room-1')!.state, 'DISCUSSION');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

test('fix task requires existing parent task and review, else entity_not_found', () => {
  const { service } = makeService();
  toWaiting(service);
  service.submitTask(makeTask()); // PLAN_READY
  // missing parent reference
  assert.equal(
    errCode(() => service.submitTask(makeFixTask({ task_id: 'task-2', parent_task_id: 'missing' }))),
    'entity_not_found',
  );
});

test('run lifecycle: PLAN_READY -> CODING -> REVIEW_REQUIRED stores result', () => {
  const { service } = makeService();
  toPlanReady(service);
  assert.equal(service.startRun(makeRun()).room.state, 'CODING');
  const { room, run } = service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence());
  assert.equal(room.state, 'REVIEW_REQUIRED');
  assert.equal(run.status, 'succeeded');
  assert.equal(run.result?.status, 'completed');
});

test('run failure: CODING -> RUN_FAILED -> PLAN_READY retry', () => {
  const { service } = makeService();
  toCoding(service);
  const failed = service.failRun('run-1', { code: 'claude_exit_failed', message: 'boom' }, makeTerminalEvidence());
  assert.equal(failed.room.state, 'RUN_FAILED');
  assert.equal(failed.run.status, 'failed');
  assert.equal(failed.run.failure?.code, 'claude_exit_failed');
  assert.equal(service.retryAfterFailure('room-1').state, 'PLAN_READY');
});

test('completeRun persists terminal evidence in the same transaction as succeeded status', () => {
  const { service } = makeService();
  toCoding(service);
  const evidence = makeTerminalEvidence({
    claude_session_id: 'sess-1',
    process_exit_code: 0,
    git_evidence: { staged: ['a.txt'], unstaged: ['b.txt'], untracked: ['c.txt'] },
    artifact_refs: ['.agent-room/artifacts/run-1/stdout.jsonl', '.agent-room/artifacts/run-1/stderr.log'],
  });
  const { run } = service.completeRun('run-1', makeCodingResult(), evidence);
  assert.equal(run.status, 'succeeded');
  assert.equal(run.claude_session_id, 'sess-1');
  assert.equal(run.process_exit_code, 0);
  assert.deepEqual(run.git_evidence, evidence.git_evidence);
  assert.deepEqual(run.artifact_refs, evidence.artifact_refs);
});

test('failRun persists terminal evidence in the same transaction as failed status', () => {
  const { service } = makeService();
  toCoding(service);
  const evidence = makeTerminalEvidence({ claude_session_id: 'sess-1', process_exit_code: 7 });
  const { run } = service.failRun('run-1', { code: 'claude_exit_failed', message: 'boom' }, evidence);
  assert.equal(run.status, 'failed');
  assert.equal(run.failure?.code, 'claude_exit_failed');
  assert.equal(run.claude_session_id, 'sess-1');
  assert.equal(run.process_exit_code, 7);
  assert.deepEqual(run.artifact_refs, evidence.artifact_refs);
});

test('appendRunProgress appends a run_progress event without changing Room or Run state', () => {
  const { service } = makeService();
  toCoding(service);
  const eventsBefore = service.listEvents('room-1').length;
  service.appendRunProgress('run-1', { type: 'system', subtype: 'hook_started', outcome: null });
  const events = service.listEvents('room-1');
  assert.equal(events.length, eventsBefore + 1);
  const last = events[events.length - 1];
  assert.equal(last.type, 'run_progress');
  assert.equal(last.actor, 'runner');
  assert.equal(last.entity_type, 'run');
  assert.equal(last.entity_id, 'run-1');
  assert.equal(last.summary, 'run run-1 progress system:hook_started');
  assert.equal(service.getRoom('room-1')!.state, 'CODING');
  assert.equal(service.getRun('run-1')!.status, 'running');
});

test('appendRunProgress rejects a non-running run with no partial write', () => {
  const { service } = makeService();
  toCoding(service);
  service.failRun('run-1', { code: 'x', message: 'y' }, makeTerminalEvidence()); // RUN_FAILED
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(
    errCode(() => service.appendRunProgress('run-1', { type: 'assistant', subtype: null, outcome: null })),
    'validation_failed',
  );
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

test('completeRun rejects a coding result for a different task', () => {
  const { service } = makeService();
  toCoding(service);
  assert.equal(
    errCode(() => service.completeRun('run-1', makeCodingResult({ task_id: 'other' }), makeTerminalEvidence())),
    'coding_result_invalid',
  );
});

test('question flow: CODING -> NEEDS_DECISION -> answer(false) -> resumeRun -> CODING', () => {
  const { service } = makeService();
  toCoding(service);
  const asked = service.askQuestion(makeQuestion());
  assert.equal(asked.room.state, 'NEEDS_DECISION');
  assert.equal(service.getRun('run-1')!.status, 'needs_decision');

  const answered = service.answerQuestion('question-1', 'pick a', false);
  assert.equal(answered.room.state, 'NEEDS_DECISION'); // no transition yet
  assert.equal(answered.question.answer_changes_contract, false);

  const resumed = service.resumeRun(makeRun({ run_id: 'run-2' }));
  assert.equal(resumed.room.state, 'CODING');
});

test('question flow: answer(true) moves NEEDS_DECISION -> WAITING_FOR_USER_CONFIRMATION', () => {
  const { service } = makeService();
  toCoding(service);
  service.askQuestion(makeQuestion());
  const answered = service.answerQuestion('question-1', 'change it', true);
  assert.equal(answered.room.state, 'WAITING_FOR_USER_CONFIRMATION');
});

test('review flow: REVIEW_REQUIRED -> REVIEW_DISCUSSION -> ACCEPTED', () => {
  const { service } = makeService();
  toCoding(service);
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence());
  const submitted = service.submitReview(makeReview());
  assert.equal(submitted.room.state, 'REVIEW_DISCUSSION');
  assert.equal(service.acceptReview('review-1', true).room.state, 'ACCEPTED');
});

test('acceptReview rejects when confirmed_by_user is false or a blocker finding remains', () => {
  const { service } = makeService();
  toCoding(service);
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence());
  service.submitReview(makeReview());
  assert.equal(errCode(() => service.acceptReview('review-1', false)), 'validation_failed');
  assert.equal(service.getRoom('room-1')!.state, 'REVIEW_DISCUSSION');
});

test('idempotency: same task content returns existing entity and adds no event', () => {
  const { service } = makeService();
  toWaiting(service);
  const first = service.submitTask(makeTask());
  assert.equal(first.created, true);
  const eventsAfterFirst = service.listEvents('room-1').length;
  const second = service.submitTask(makeTask());
  assert.equal(second.created, false);
  assert.equal(second.task.goal, 'goal');
  assert.equal(service.listEvents('room-1').length, eventsAfterFirst);
});

test('id_conflict: same id with different content fails', () => {
  const { service } = makeService();
  toWaiting(service);
  service.submitTask(makeTask());
  assert.equal(errCode(() => service.submitTask(makeTask({ goal: 'changed' }))), 'id_conflict');
});

test('event sequence is per-room and strictly increasing from 1', () => {
  const { service } = makeService();
  service.createRoom('room-a');
  service.createRoom('room-b');
  assert.deepEqual(service.listEvents('room-a').map((e) => e.sequence), [1]);
  assert.deepEqual(service.listEvents('room-b').map((e) => e.sequence), [1]);
  service.transitionToArchitectureReview('room-a');
  assert.deepEqual(service.listEvents('room-a').map((e) => e.sequence), [1, 2]);
  assert.deepEqual(service.listEvents('room-b').map((e) => e.sequence), [1]);
});

test('database reopen restores state, entities and event cursor', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-room-'));
  const dbPath = join(dir, 'room.db');
  let db = new DatabaseSync(dbPath);
  let service = new RoomService(db);
  toPlanReady(service);
  const eventsBefore = service.listEvents('room-1').length;
  assert.ok(eventsBefore > 0);
  db.close();

  db = new DatabaseSync(dbPath);
  service = new RoomService(db);
  assert.equal(service.getRoom('room-1')!.state, 'PLAN_READY');
  assert.equal(service.getTask('task-1')!.goal, 'goal');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
  assert.equal(service.listEvents('room-1', eventsBefore).length, 0);
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('full cycle: DISCUSSION -> ... -> FIX -> ... -> ACCEPTED', () => {
  const { service } = makeService();
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask()); // PLAN_READY
  service.startRun(makeRun()); // CODING
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence()); // REVIEW_REQUIRED
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] })); // REVIEW_DISCUSSION

  service.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', parent_task_id: 'task-1', based_on_review_id: 'review-1' }),
  ); // FIX_PLAN_READY
  service.startRun(makeRun({ run_id: 'run-2', task_id: 'task-2' })); // CODING
  service.completeRun('run-2', makeCodingResult({ task_id: 'task-2' }), makeTerminalEvidence()); // REVIEW_REQUIRED
  service.submitReview(makeReview({ review_id: 'review-2', run_id: 'run-2', task_id: 'task-2' })); // REVIEW_DISCUSSION
  assert.equal(service.acceptReview('review-2', true).room.state, 'ACCEPTED');
});

test('startRun rejects a run with terminal or needs_decision status', () => {
  const { service } = makeService();
  toPlanReady(service);
  assert.equal(errCode(() => service.startRun(makeRun({ status: 'succeeded' }))), 'validation_failed');
  assert.equal(errCode(() => service.startRun(makeRun({ status: 'failed' }))), 'validation_failed');
  assert.equal(errCode(() => service.startRun(makeRun({ status: 'needs_decision' }))), 'validation_failed');
  assert.equal(service.getRoom('room-1')!.state, 'PLAN_READY');
});

test('resumeRun rejects terminal or needs_decision status with no partial write', () => {
  const { service } = makeService();
  toCoding(service); // run-1 running, CODING
  service.askQuestion(makeQuestion()); // NEEDS_DECISION, run-1 -> needs_decision
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(errCode(() => service.resumeRun(makeRun({ run_id: 'run-2', status: 'succeeded' }))), 'validation_failed');
  assert.equal(errCode(() => service.resumeRun(makeRun({ run_id: 'run-3', status: 'failed' }))), 'validation_failed');
  assert.equal(errCode(() => service.resumeRun(makeRun({ run_id: 'run-4', status: 'needs_decision' }))), 'validation_failed');
  assert.equal(service.getRoom('room-1')!.state, 'NEEDS_DECISION');
  assert.equal(service.getRun('run-2'), null);
  assert.equal(service.getRun('run-3'), null);
  assert.equal(service.getRun('run-4'), null);
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

test('startRun in FIX_PLAN_READY rejects a stale implementation Task with no partial write', () => {
  const { service } = makeService();
  toFixPlanReady(service); // current task = task-2 (fix)
  const eventsBefore = service.listEvents('room-1').length;
  // 旧 Implementation Task task-1 不是 current Task，新建 Run 必须以 validation_failed 回滚。
  assert.equal(
    errCode(() => service.startRun(makeRun({ run_id: 'run-2', task_id: 'task-1' }))),
    'validation_failed',
  );
  assert.equal(service.getRoom('room-1')!.state, 'FIX_PLAN_READY');
  assert.equal(service.getRun('run-2'), null);
  assert.equal(service.listEvents('room-1').length, eventsBefore);
  // current Fix Task task-2 的合法 startRun 继续进入 CODING。
  assert.equal(service.startRun(makeRun({ run_id: 'run-2', task_id: 'task-2' })).room.state, 'CODING');
});

test('resumeRun in NEEDS_DECISION rejects a stale implementation Task with no partial write', () => {
  const { service } = makeService();
  toFixPlanReady(service); // current task = task-2
  service.startRun(makeRun({ run_id: 'run-2', task_id: 'task-2' })); // CODING
  service.askQuestion(makeQuestion({ run_id: 'run-2', task_id: 'task-2' })); // NEEDS_DECISION
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(
    errCode(() => service.resumeRun(makeRun({ run_id: 'run-3', task_id: 'task-1' }))),
    'validation_failed',
  );
  assert.equal(service.getRoom('room-1')!.state, 'NEEDS_DECISION');
  assert.equal(service.getRun('run-3'), null);
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

test('resumeRun for the current fix Task continues to CODING', () => {
  const { service } = makeService();
  toFixPlanReady(service); // current task = task-2
  service.startRun(makeRun({ run_id: 'run-2', task_id: 'task-2' })); // CODING
  service.askQuestion(makeQuestion({ run_id: 'run-2', task_id: 'task-2' })); // NEEDS_DECISION
  service.answerQuestion('question-1', 'pick a', false);
  const resumed = service.resumeRun(makeRun({ run_id: 'run-3', task_id: 'task-2' }));
  assert.equal(resumed.room.state, 'CODING');
  assert.equal(service.getRun('run-3')!.task_id, 'task-2');
});

test('new stale Run rollback leaves the run_id reusable for the current Task', () => {
  const { service } = makeService();
  toFixPlanReady(service); // current task = task-2
  // stale run_id=run-2 引用 task-1 被拒绝并回滚，不留 Run。
  assert.equal(errCode(() => service.startRun(makeRun({ run_id: 'run-2', task_id: 'task-1' }))), 'validation_failed');
  assert.equal(service.getRun('run-2'), null);
  // 同 run_id 对 current task-2 可成功创建。
  assert.equal(service.startRun(makeRun({ run_id: 'run-2', task_id: 'task-2' })).created, true);
  assert.equal(service.getRoom('room-1')!.state, 'CODING');
});

test('startRun retry/conflict ordering is preserved for a current Task', () => {
  const { service } = makeService();
  toPlanReady(service); // current task = task-1
  assert.equal(service.startRun(makeRun()).created, true); // run-1, CODING
  const eventsBefore = service.listEvents('room-1').length;
  // 同 ID/同 content retry 返回 created=false 且不新增 Event。
  const retry = service.startRun(makeRun());
  assert.equal(retry.created, false);
  assert.equal(service.listEvents('room-1').length, eventsBefore);
  // 同 ID/异 content 继续 id_conflict。
  assert.equal(
    errCode(() => service.startRun(makeRun({ baseline_head: 'other' }))),
    'id_conflict',
  );
});

test('completeRun rejects a stale run after failure and retry', () => {
  const { service } = makeService();
  toCoding(service); // run-1 running
  service.failRun('run-1', { code: 'claude_exit_failed', message: 'boom' }, makeTerminalEvidence()); // RUN_FAILED
  service.retryAfterFailure('room-1'); // PLAN_READY
  service.startRun(makeRun({ run_id: 'run-2' })); // CODING, run-2 running
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(errCode(() => service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence())), 'validation_failed');
  assert.equal(service.getRoom('room-1')!.state, 'CODING');
  assert.equal(service.getRun('run-2')!.status, 'running');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

test('completeRun rejects a non-completed coding result', () => {
  const { service } = makeService();
  toCoding(service);
  assert.equal(errCode(() => service.completeRun('run-1', makeCodingResult({ status: 'blocked' }), makeTerminalEvidence())), 'coding_result_invalid');
  assert.equal(errCode(() => service.completeRun('run-1', makeCodingResult({ status: 'needs_decision' }), makeTerminalEvidence())), 'coding_result_invalid');
  assert.equal(service.getRoom('room-1')!.state, 'CODING');
  assert.equal(service.getRun('run-1')!.status, 'running');
});

test('failRun/askQuestion reject a non-running run with no partial write', () => {
  const { service } = makeService();
  toCoding(service);
  service.failRun('run-1', { code: 'x', message: 'y' }, makeTerminalEvidence()); // run-1 failed
  service.retryAfterFailure('room-1'); // PLAN_READY
  assert.equal(errCode(() => service.failRun('run-1', { code: 'x', message: 'y' }, makeTerminalEvidence())), 'validation_failed');
  assert.equal(errCode(() => service.askQuestion(makeQuestion())), 'validation_failed');
  assert.equal(service.getQuestion('question-1'), null); // rolled back
});

test('submitReview rejects a run that is not succeeded', () => {
  const { db, service } = makeService();
  toCoding(service); // run-1 running, room CODING
  db.prepare("UPDATE rooms SET state = 'REVIEW_REQUIRED', updated_at = '2026-08-23T00:00:00.000Z' WHERE room_id = 'room-1'").run();
  assert.equal(errCode(() => service.submitReview(makeReview())), 'validation_failed');
  assert.equal(service.getRun('run-1')!.status, 'running');
});

test('submitReview rejects a succeeded run without a completed coding result', () => {
  const { db, service } = makeService();
  toCoding(service);
  db.prepare("UPDATE rooms SET state = 'REVIEW_REQUIRED', updated_at = '2026-08-23T00:00:00.000Z' WHERE room_id = 'room-1'").run();
  db.prepare("UPDATE runs SET content_json = json_set(content_json, '$.status', 'succeeded') WHERE run_id = 'run-1'").run();
  assert.equal(errCode(() => service.submitReview(makeReview())), 'validation_failed');
});

test('submitReview rejects a stale succeeded run after a newer run completed', () => {
  const { service } = makeService();
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask()); // PLAN_READY
  service.startRun(makeRun()); // CODING, run-1
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence()); // REVIEW_REQUIRED, run_completed run-1
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] })); // review-1, REVIEW_DISCUSSION
  service.submitTask(makeFixTask({ task_id: 'task-2', room_id: 'room-1', parent_task_id: 'task-1', based_on_review_id: 'review-1' })); // FIX_PLAN_READY
  service.startRun(makeRun({ run_id: 'run-2', task_id: 'task-2' })); // CODING
  service.completeRun('run-2', makeCodingResult({ task_id: 'task-2' }), makeTerminalEvidence()); // REVIEW_REQUIRED, run_completed run-2

  const eventsBefore = service.listEvents('room-1').length;
  // 引用旧 succeeded run-1 的 Review 必须以 validation_failed 拒绝，Room 保持 REVIEW_REQUIRED，且不持久化 Review/Event
  const stale = makeReview({ review_id: 'review-2', room_id: 'room-1', task_id: 'task-1', run_id: 'run-1' });
  assert.equal(errCode(() => service.submitReview(stale)), 'validation_failed');
  assert.equal(service.getRoom('room-1')!.state, 'REVIEW_REQUIRED');
  assert.equal(service.getReview('review-2'), null);
  assert.equal(service.listEvents('room-1').length, eventsBefore);

  // 引用当前 run-2 的合法 Review 必须继续成功进入 REVIEW_DISCUSSION
  const current = makeReview({ review_id: 'review-3', room_id: 'room-1', task_id: 'task-2', run_id: 'run-2' });
  assert.equal(service.submitReview(current).room.state, 'REVIEW_DISCUSSION');
});

test('submitReview is idempotent for a persisted review across a later run', () => {
  const { service } = makeService();
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask()); // PLAN_READY
  service.startRun(makeRun()); // CODING, run-1
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence()); // REVIEW_REQUIRED, run_completed run-1
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] })); // review-1 持久化, REVIEW_DISCUSSION
  service.submitTask(makeFixTask({ task_id: 'task-2', room_id: 'room-1', parent_task_id: 'task-1', based_on_review_id: 'review-1' })); // FIX_PLAN_READY
  service.startRun(makeRun({ run_id: 'run-2', task_id: 'task-2' })); // CODING
  service.completeRun('run-2', makeCodingResult({ task_id: 'task-2' }), makeTerminalEvidence()); // REVIEW_REQUIRED, run_completed run-2

  const eventsBefore = service.listEvents('room-1').length;
  // 同 ID/同 content 重试已持久化 review-1：created=false，返回既有 review，Room 与 Event 不变
  const retry = service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }));
  assert.equal(retry.created, false);
  assert.equal(retry.review.review_id, 'review-1');
  assert.equal(retry.review.decision, 'changes_requested');
  assert.equal(service.getRoom('room-1')!.state, 'REVIEW_REQUIRED');
  assert.equal(service.listEvents('room-1').length, eventsBefore);

  // 同 ID/不同 content 返回 id_conflict，Room 与 Event 不变
  assert.equal(errCode(() => service.submitReview(makeReview({ decision: 'approved' }))), 'id_conflict');
  assert.equal(service.getRoom('room-1')!.state, 'REVIEW_REQUIRED');
  assert.equal(service.listEvents('room-1').length, eventsBefore);

  // 新 review_id 引用旧 run-1：validation_failed，不持久化 Review/Event
  const stale = makeReview({ review_id: 'review-2', room_id: 'room-1', task_id: 'task-1', run_id: 'run-1' });
  assert.equal(errCode(() => service.submitReview(stale)), 'validation_failed');
  assert.equal(service.getReview('review-2'), null);
  assert.equal(service.getRoom('room-1')!.state, 'REVIEW_REQUIRED');
  assert.equal(service.listEvents('room-1').length, eventsBefore);

  // 新 review_id 引用当前 run-2：成功进入 REVIEW_DISCUSSION
  const current = makeReview({ review_id: 'review-3', room_id: 'room-1', task_id: 'task-2', run_id: 'run-2' });
  assert.equal(service.submitReview(current).room.state, 'REVIEW_DISCUSSION');
});

test('acceptReview rejects a stale review after a newer review is submitted', () => {
  const { service } = makeService();
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun());
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence());
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] })); // review-1
  service.submitTask(makeFixTask({ task_id: 'task-2', room_id: 'room-1', parent_task_id: 'task-1', based_on_review_id: 'review-1' }));
  service.startRun(makeRun({ run_id: 'run-2', task_id: 'task-2' }));
  service.completeRun('run-2', makeCodingResult({ task_id: 'task-2' }), makeTerminalEvidence());
  service.submitReview(makeReview({ review_id: 'review-2', run_id: 'run-2', task_id: 'task-2' })); // review-2
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(errCode(() => service.acceptReview('review-1', true)), 'validation_failed');
  assert.equal(service.getRoom('room-1')!.state, 'REVIEW_DISCUSSION');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

test('fix task referencing a finding not in the review is rejected with no persistence', () => {
  const { service } = makeService();
  service.createRoom('room-1');
  service.transitionToArchitectureReview('room-1');
  service.transitionToWaitingForUserConfirmation('room-1');
  service.submitTask(makeTask());
  service.startRun(makeRun());
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence());
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] })); // review-1 has f-1
  const eventsBefore = service.listEvents('room-1').length;
  const phantom = makeFixTask({
    task_id: 'task-2',
    room_id: 'room-1',
    parent_task_id: 'task-1',
    based_on_review_id: 'review-1',
    confirmed_findings: [{ finding_id: 'ghost', solution: 'x' }],
  });
  assert.equal(errCode(() => service.submitTask(phantom)), 'validation_failed');
  assert.equal(service.getTask('task-2'), null);
  assert.equal(service.getRoom('room-1')!.state, 'REVIEW_DISCUSSION');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});
