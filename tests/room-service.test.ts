import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoomService } from '../src/room/room-service.ts';
import type { Review } from '../src/protocol/schema.ts';
import {
  makeCodingResult,
  makeFinding,
  makeFixTask,
  makeParticipant,
  makeQuestion,
  makeReview,
  makeRoleAssignment,
  makeRun,
  makeTask,
  makeTerminalEvidence,
} from './fixtures.ts';

// v0.3 actor literal：与默认 bootstrap assignment 一致（测试侧独立 literal，不导入实现）。
// codex-app 是 single control orchestrator 兼 planner/reviewer（Fix inc9-r4）。
const PLANNER = { participant_id: 'codex-app', actor_role: 'planner' as const };
const REVIEWER = { participant_id: 'codex-app', actor_role: 'reviewer' as const };
const WORKER = { participant_id: 'claude-code-cli', actor_role: 'worker' as const };
const EXECUTOR = { participant_id: 'local-runner', actor_role: 'executor' as const };
const ORCHESTRATOR = { participant_id: 'codex-app', actor_role: 'orchestrator' as const };
// operator 只保留 human profile，无 active assignment：任何 command 都必须被拒。
const OPERATOR = { participant_id: 'operator', actor_role: 'orchestrator' as const };

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
  service.createRoom(roomId, PLANNER);
  service.transitionToArchitectureReview(roomId, PLANNER);
  service.transitionToWaitingForUserConfirmation(roomId, PLANNER);
}

function toPlanReady(service: RoomService): void {
  toWaiting(service);
  service.submitTask(makeTask(), PLANNER);
}

function toCoding(service: RoomService): void {
  toPlanReady(service);
  service.startRun(makeRun(), EXECUTOR);
}

// 完整 Implementation -> Review(changes_requested) -> Fix Task 链路，使 current Task 为
// fix task-2，用于验证 startRun/resumeRun 只接受该 Room 最新 task_submitted 指向的 Task。
function toFixPlanReady(service: RoomService): void {
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER); // task-1 implementation, PLAN_READY
  service.startRun(makeRun(), EXECUTOR); // run-1, CODING
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence(), EXECUTOR); // REVIEW_REQUIRED
  service.submitReview(
    makeReview({ decision: 'changes_requested', findings: [makeFinding()] }),
    REVIEWER,
  ); // REVIEW_DISCUSSION
  service.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', parent_task_id: 'task-1', based_on_review_id: 'review-1' }),
    PLANNER,
  ); // FIX_PLAN_READY, current task = task-2
}

test('createRoom sets initial state DISCUSSION and appends first event', () => {
  const { service } = makeService();
  const { room, created } = service.createRoom('room-1', PLANNER);
  assert.equal(created, true);
  assert.equal(room.state, 'DISCUSSION');
  const events = service.listEvents('room-1');
  assert.equal(events.length, 1);
  assert.equal(events[0].sequence, 1);
  // system room_created event：local service participant + orchestrator role
  assert.equal(events[0].participant_id, 'local-runner');
  assert.equal(events[0].actor_role, 'orchestrator');
});

test('createRoom bootstraps the three room-member participants and five room-scope assignments', () => {
  const { service } = makeService();
  service.createRoom('room-1', PLANNER);
  // operator 保留 human profile 但无 assignment（Fix inc9-r4），因此不是 room member；
  // room member 由在 Room 内至少持有 assignment 的 participant 构成。
  const participants = service.listRoomParticipants('room-1');
  assert.deepEqual(
    participants.map((p) => p.participant_id).sort(),
    ['claude-code-cli', 'codex-app', 'local-runner'],
  );
  assert.deepEqual(participants.map((p) => p.enabled), [true, true, true]);
  const assignments = service.listRoleAssignments('room-1');
  assert.equal(assignments.length, 5);
  assert.deepEqual(
    assignments.map((a) => `${a.role}:${a.participant_id}`).sort(),
    [
      'executor:local-runner',
      'orchestrator:codex-app',
      'planner:codex-app',
      'reviewer:codex-app',
      'worker:claude-code-cli',
    ],
  );
  assert.deepEqual(assignments.map((a) => a.scope_type), ['room', 'room', 'room', 'room', 'room']);
});

test('createRoom rejects a caller without the planner assignment and rolls back the bootstrap', () => {
  const { service } = makeService();
  // operator 无任何 assignment（bootstrap 前也不存在该 participant）：planner authority 校验
  // 失败后 Room 与 bootstrap 全部回滚。
  assert.equal(errCode(() => service.createRoom('room-1', OPERATOR)), 'actor_not_allowed');
  assert.equal(service.getRoom('room-1'), null);
  assert.deepEqual(service.listRoomParticipants('room-1'), []);
  assert.deepEqual(service.listRoleAssignments('room-1'), []);
});

test('planning transitions move DISCUSSION -> ARCHITECTURE_REVIEW -> WAITING_FOR_USER_CONFIRMATION', () => {
  const { service } = makeService();
  service.createRoom('room-1', PLANNER);
  assert.equal(service.transitionToArchitectureReview('room-1', PLANNER).state, 'ARCHITECTURE_REVIEW');
  assert.equal(
    service.transitionToWaitingForUserConfirmation('room-1', PLANNER).state,
    'WAITING_FOR_USER_CONFIRMATION',
  );
});

test('planning transitions reject a non-planner actor with no state change', () => {
  const { service } = makeService();
  service.createRoom('room-1', PLANNER);
  assert.equal(errCode(() => service.transitionToArchitectureReview('room-1', WORKER)), 'actor_not_allowed');
  assert.equal(service.getRoom('room-1')!.state, 'DISCUSSION');
});

test('submitTask (implementation) moves to PLAN_READY and persists the task', () => {
  const { service } = makeService();
  toWaiting(service);
  const { room, task, created } = service.submitTask(makeTask(), PLANNER);
  assert.equal(created, true);
  assert.equal(room.state, 'PLAN_READY');
  assert.equal(task.goal, 'goal');
  assert.equal(service.getTask('task-1')?.task_id, 'task-1');
});

test('submitTask persists planner/orchestrator from the resolved assignment at submission time', () => {
  const { service } = makeService();
  toWaiting(service);
  const { task } = service.submitTask(makeTask(), PLANNER);
  assert.equal(task.planner_participant_id, 'codex-app');
  assert.equal(task.orchestrator_participant_id, 'codex-app');
  // 之后 replace planner 也不回填既有 Task（read 不按当前 assignment 推断历史 identity）。
  service.registerParticipant(
    makeParticipant({
      participant_id: 'planner-2',
      kind: 'agent',
      provider: 'codex',
      adapter_id: 'codex_app',
      capabilities: ['planning'],
    }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-planner-2', room_id: 'room-1', role: 'planner', participant_id: 'planner-2' }),
    ORCHESTRATOR,
  );
  assert.equal(service.getTask('task-1')!.planner_participant_id, 'codex-app');
  assert.equal(service.getTask('task-1')!.orchestrator_participant_id, 'codex-app');
});

test('submitTask in wrong state fails with invalid_transition and leaves no partial write', () => {
  const { service } = makeService();
  service.createRoom('room-1', PLANNER); // DISCUSSION
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(errCode(() => service.submitTask(makeTask(), PLANNER)), 'invalid_transition');
  assert.equal(service.getTask('task-1'), null);
  assert.equal(service.getRoom('room-1')!.state, 'DISCUSSION');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

test('fix task requires existing parent task and review, else entity_not_found', () => {
  const { service } = makeService();
  toWaiting(service);
  service.submitTask(makeTask(), PLANNER); // PLAN_READY
  // missing parent reference
  assert.equal(
    errCode(() => service.submitTask(makeFixTask({ task_id: 'task-2', parent_task_id: 'missing' }), PLANNER)),
    'entity_not_found',
  );
});

test('run lifecycle: PLAN_READY -> CODING -> REVIEW_REQUIRED stores result', () => {
  const { service } = makeService();
  toPlanReady(service);
  assert.equal(service.startRun(makeRun(), EXECUTOR).room.state, 'CODING');
  const { room, run } = service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence(), EXECUTOR);
  assert.equal(room.state, 'REVIEW_REQUIRED');
  assert.equal(run.status, 'succeeded');
  assert.equal(run.result?.status, 'completed');
});

test('run failure: CODING -> RUN_FAILED -> PLAN_READY retry', () => {
  const { service } = makeService();
  toCoding(service);
  const failed = service.failRun('run-1', { code: 'claude_exit_failed', message: 'boom' }, makeTerminalEvidence(), EXECUTOR);
  assert.equal(failed.room.state, 'RUN_FAILED');
  assert.equal(failed.run.status, 'failed');
  assert.equal(failed.run.failure?.code, 'claude_exit_failed');
  assert.equal(service.retryAfterFailure('room-1', PLANNER).state, 'PLAN_READY');
});

test('completeRun persists terminal evidence in the same transaction as succeeded status', () => {
  const { service } = makeService();
  toCoding(service);
  const evidence = makeTerminalEvidence({
    agent_session_ref: 'sess-1',
    process_exit_code: 0,
    git_evidence: { staged: ['a.txt'], unstaged: ['b.txt'], untracked: ['c.txt'] },
    artifact_refs: ['.agent-room/artifacts/run-1/stdout.jsonl', '.agent-room/artifacts/run-1/stderr.log'],
  });
  const { run } = service.completeRun('run-1', makeCodingResult(), evidence, EXECUTOR);
  assert.equal(run.status, 'succeeded');
  assert.equal(run.agent_session_ref, 'sess-1');
  assert.equal(run.process_exit_code, 0);
  assert.deepEqual(run.git_evidence, evidence.git_evidence);
  assert.deepEqual(run.artifact_refs, evidence.artifact_refs);
});

test('failRun persists terminal evidence in the same transaction as failed status', () => {
  const { service } = makeService();
  toCoding(service);
  const evidence = makeTerminalEvidence({ agent_session_ref: 'sess-1', process_exit_code: 7 });
  const { run } = service.failRun('run-1', { code: 'claude_exit_failed', message: 'boom' }, evidence, EXECUTOR);
  assert.equal(run.status, 'failed');
  assert.equal(run.failure?.code, 'claude_exit_failed');
  assert.equal(run.agent_session_ref, 'sess-1');
  assert.equal(run.process_exit_code, 7);
  assert.deepEqual(run.artifact_refs, evidence.artifact_refs);
});

test('appendRunProgress appends a run_progress event without changing Room or Run state', () => {
  const { service } = makeService();
  toCoding(service);
  const eventsBefore = service.listEvents('room-1').length;
  service.appendRunProgress('run-1', { type: 'system', subtype: 'hook_started', outcome: null }, EXECUTOR);
  const events = service.listEvents('room-1');
  assert.equal(events.length, eventsBefore + 1);
  const last = events[events.length - 1];
  assert.equal(last.type, 'run_progress');
  assert.equal(last.participant_id, 'local-runner');
  assert.equal(last.actor_role, 'executor');
  assert.equal(last.entity_type, 'run');
  assert.equal(last.entity_id, 'run-1');
  assert.equal(last.summary, 'run run-1 progress system:hook_started');
  assert.equal(service.getRoom('room-1')!.state, 'CODING');
  assert.equal(service.getRun('run-1')!.status, 'running');
});

test('appendRunProgress rejects a non-running run with no partial write', () => {
  const { service } = makeService();
  toCoding(service);
  service.failRun('run-1', { code: 'x', message: 'y' }, makeTerminalEvidence(), EXECUTOR); // RUN_FAILED
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(
    errCode(() => service.appendRunProgress('run-1', { type: 'assistant', subtype: null, outcome: null }, EXECUTOR)),
    'validation_failed',
  );
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

test('completeRun rejects a coding result for a different task', () => {
  const { service } = makeService();
  toCoding(service);
  assert.equal(
    errCode(() => service.completeRun('run-1', makeCodingResult({ task_id: 'other' }), makeTerminalEvidence(), EXECUTOR)),
    'coding_result_invalid',
  );
});

test('question flow: CODING -> NEEDS_DECISION -> answer(false) -> resumeRun -> CODING', () => {
  const { service } = makeService();
  toCoding(service);
  const asked = service.askQuestion(makeQuestion(), WORKER);
  assert.equal(asked.room.state, 'NEEDS_DECISION');
  assert.equal(service.getRun('run-1')!.status, 'needs_decision');

  // answer 前必须由 Runner 完成 pause finalization（completed_at 非 null）。
  const paused = service.finalizeNeedsDecision(
    'run-1',
    makeCodingResult({ status: 'needs_decision' }),
    null,
    makeTerminalEvidence({ agent_session_ref: 'sess-1' }),
    EXECUTOR,
  );
  assert.equal(paused.created, true);
  assert.equal(paused.room.state, 'NEEDS_DECISION');

  const answered = service.answerQuestion('question-1', 'pick a', false, PLANNER);
  assert.equal(answered.room.state, 'NEEDS_DECISION'); // no transition yet
  assert.equal(answered.question.answer_changes_contract, false);

  const resumed = service.resumeRun(makeRun({ run_id: 'run-2' }), EXECUTOR);
  assert.equal(resumed.room.state, 'CODING');
});

test('question flow: answer(true) moves NEEDS_DECISION -> WAITING_FOR_USER_CONFIRMATION', () => {
  const { service } = makeService();
  toCoding(service);
  service.askQuestion(makeQuestion(), WORKER);
  service.finalizeNeedsDecision(
    'run-1',
    makeCodingResult({ status: 'needs_decision' }),
    null,
    makeTerminalEvidence({ agent_session_ref: 'sess-1' }),
    EXECUTOR,
  );
  const answered = service.answerQuestion('question-1', 'change it', true, PLANNER);
  assert.equal(answered.room.state, 'WAITING_FOR_USER_CONFIRMATION');
});

test('review flow: REVIEW_REQUIRED -> REVIEW_DISCUSSION -> ACCEPTED', () => {
  const { service } = makeService();
  toCoding(service);
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence(), EXECUTOR);
  const submitted = service.submitReview(makeReview(), REVIEWER);
  assert.equal(submitted.room.state, 'REVIEW_DISCUSSION');
  assert.equal(service.acceptReview('review-1', true, REVIEWER).room.state, 'ACCEPTED');
});

test('acceptReview rejects when confirmed_by_user is false or a blocker finding remains', () => {
  const { service } = makeService();
  toCoding(service);
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence(), EXECUTOR);
  service.submitReview(makeReview(), REVIEWER);
  assert.equal(errCode(() => service.acceptReview('review-1', false, REVIEWER)), 'validation_failed');
  assert.equal(service.getRoom('room-1')!.state, 'REVIEW_DISCUSSION');
});

test('idempotency: same task content returns existing entity and adds no event', () => {
  const { service } = makeService();
  toWaiting(service);
  const first = service.submitTask(makeTask(), PLANNER);
  assert.equal(first.created, true);
  const eventsAfterFirst = service.listEvents('room-1').length;
  const second = service.submitTask(makeTask(), PLANNER);
  assert.equal(second.created, false);
  assert.equal(second.task.goal, 'goal');
  assert.equal(service.listEvents('room-1').length, eventsAfterFirst);
});

test('id_conflict: same id with different content fails', () => {
  const { service } = makeService();
  toWaiting(service);
  service.submitTask(makeTask(), PLANNER);
  assert.equal(errCode(() => service.submitTask(makeTask({ goal: 'changed' }), PLANNER)), 'id_conflict');
});

test('event sequence is per-room and strictly increasing from 1', () => {
  const { service } = makeService();
  service.createRoom('room-a', PLANNER);
  service.createRoom('room-b', PLANNER);
  assert.deepEqual(service.listEvents('room-a').map((e) => e.sequence), [1]);
  assert.deepEqual(service.listEvents('room-b').map((e) => e.sequence), [1]);
  service.transitionToArchitectureReview('room-a', PLANNER);
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
  assert.equal(service.getTask('task-1')!.planner_participant_id, 'codex-app');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
  assert.equal(service.listEvents('room-1', eventsBefore).length, 0);
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('full cycle: DISCUSSION -> ... -> FIX -> ... -> ACCEPTED', () => {
  const { service } = makeService();
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER); // PLAN_READY
  service.startRun(makeRun(), EXECUTOR); // CODING
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence(), EXECUTOR); // REVIEW_REQUIRED
  service.submitReview(
    makeReview({ decision: 'changes_requested', findings: [makeFinding()] }),
    REVIEWER,
  ); // REVIEW_DISCUSSION

  service.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', parent_task_id: 'task-1', based_on_review_id: 'review-1' }),
    PLANNER,
  ); // FIX_PLAN_READY
  service.resumeRun(makeRun({ run_id: 'run-2', task_id: 'task-2' }), EXECUTOR); // CODING
  service.completeRun('run-2', makeCodingResult({ task_id: 'task-2' }), makeTerminalEvidence(), EXECUTOR); // REVIEW_REQUIRED
  service.submitReview(
    makeReview({ review_id: 'review-2', run_id: 'run-2', task_id: 'task-2' }),
    REVIEWER,
  ); // REVIEW_DISCUSSION
  assert.equal(service.acceptReview('review-2', true, REVIEWER).room.state, 'ACCEPTED');
});

test('startRun rejects a run with terminal or needs_decision status', () => {
  const { service } = makeService();
  toPlanReady(service);
  assert.equal(errCode(() => service.startRun(makeRun({ status: 'succeeded' }), EXECUTOR)), 'validation_failed');
  assert.equal(errCode(() => service.startRun(makeRun({ status: 'failed' }), EXECUTOR)), 'validation_failed');
  assert.equal(errCode(() => service.startRun(makeRun({ status: 'needs_decision' }), EXECUTOR)), 'validation_failed');
  assert.equal(service.getRoom('room-1')!.state, 'PLAN_READY');
});

test('startRun rejects worker/executor not matching the resolved assignment with no partial write', () => {
  const { service } = makeService();
  toPlanReady(service);
  assert.equal(
    errCode(() => service.startRun(makeRun({ worker_participant_id: 'ghost' }), EXECUTOR)),
    'validation_failed',
  );
  assert.equal(
    errCode(() => service.startRun(makeRun({ executor_participant_id: 'ghost' }), EXECUTOR)),
    'validation_failed',
  );
  assert.equal(service.getRun('run-1'), null);
  assert.equal(service.getRoom('room-1')!.state, 'PLAN_READY');
  assert.equal(service.listEvents('room-1').length, 4); // 无 run_started
});

test('resumeRun rejects terminal or needs_decision status with no partial write', () => {
  const { service } = makeService();
  toCoding(service); // run-1 running, CODING
  service.askQuestion(makeQuestion(), WORKER); // NEEDS_DECISION, run-1 -> needs_decision
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(
    errCode(() => service.resumeRun(makeRun({ run_id: 'run-2', status: 'succeeded' }), EXECUTOR)),
    'validation_failed',
  );
  assert.equal(
    errCode(() => service.resumeRun(makeRun({ run_id: 'run-3', status: 'failed' }), EXECUTOR)),
    'validation_failed',
  );
  assert.equal(
    errCode(() => service.resumeRun(makeRun({ run_id: 'run-4', status: 'needs_decision' }), EXECUTOR)),
    'validation_failed',
  );
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
    errCode(() => service.startRun(makeRun({ run_id: 'run-2', task_id: 'task-1' }), EXECUTOR)),
    'validation_failed',
  );
  assert.equal(service.getRoom('room-1')!.state, 'FIX_PLAN_READY');
  assert.equal(service.getRun('run-2'), null);
  assert.equal(service.listEvents('room-1').length, eventsBefore);
  // current Fix Task task-2 也禁止 startRun：FIX_PLAN_READY 必须 resumeRun 继承 lineage。
  assert.equal(
    errCode(() => service.startRun(makeRun({ run_id: 'run-2', task_id: 'task-2' }), EXECUTOR)),
    'validation_failed',
  );
  assert.equal(service.getRun('run-2'), null);
  // 同 run_id 对 current task-2 的合法 resumeRun 继续进入 CODING。
  assert.equal(service.resumeRun(makeRun({ run_id: 'run-2', task_id: 'task-2' }), EXECUTOR).room.state, 'CODING');
});

test('resumeRun in NEEDS_DECISION rejects a stale implementation Task with no partial write', () => {
  const { service } = makeService();
  toFixPlanReady(service); // current task = task-2
  service.resumeRun(makeRun({ run_id: 'run-2', task_id: 'task-2' }), EXECUTOR); // CODING
  service.askQuestion(makeQuestion({ run_id: 'run-2', task_id: 'task-2' }), WORKER); // NEEDS_DECISION
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(
    errCode(() => service.resumeRun(makeRun({ run_id: 'run-3', task_id: 'task-1' }), EXECUTOR)),
    'validation_failed',
  );
  assert.equal(service.getRoom('room-1')!.state, 'NEEDS_DECISION');
  assert.equal(service.getRun('run-3'), null);
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

test('resumeRun for the current fix Task continues to CODING', () => {
  const { service } = makeService();
  toFixPlanReady(service); // current task = task-2
  service.resumeRun(makeRun({ run_id: 'run-2', task_id: 'task-2' }), EXECUTOR); // CODING
  service.askQuestion(makeQuestion({ run_id: 'run-2', task_id: 'task-2' }), WORKER); // NEEDS_DECISION
  service.finalizeNeedsDecision(
    'run-2',
    makeCodingResult({ status: 'needs_decision', task_id: 'task-2' }),
    null,
    makeTerminalEvidence({ agent_session_ref: 'sess-1' }),
    EXECUTOR,
  );
  service.answerQuestion('question-1', 'pick a', false, PLANNER);
  const resumed = service.resumeRun(makeRun({ run_id: 'run-3', task_id: 'task-2' }), EXECUTOR);
  assert.equal(resumed.room.state, 'CODING');
  assert.equal(service.getRun('run-3')!.task_id, 'task-2');
});

test('new stale Run rollback leaves the run_id reusable for the current Task', () => {
  const { service } = makeService();
  toFixPlanReady(service); // current task = task-2
  // stale run_id=run-2 引用 task-1 被拒绝并回滚，不留 Run。
  assert.equal(
    errCode(() => service.startRun(makeRun({ run_id: 'run-2', task_id: 'task-1' }), EXECUTOR)),
    'validation_failed',
  );
  assert.equal(service.getRun('run-2'), null);
  // 同 run_id 对 current task-2 可经 resumeRun 成功创建。
  assert.equal(service.resumeRun(makeRun({ run_id: 'run-2', task_id: 'task-2' }), EXECUTOR).created, true);
  assert.equal(service.getRoom('room-1')!.state, 'CODING');
});

test('startRun retry/conflict ordering is preserved for a current Task', () => {
  const { service } = makeService();
  toPlanReady(service); // current task = task-1
  assert.equal(service.startRun(makeRun(), EXECUTOR).created, true); // run-1, CODING
  const eventsBefore = service.listEvents('room-1').length;
  // 同 ID/同 content retry 返回 created=false 且不新增 Event。
  const retry = service.startRun(makeRun(), EXECUTOR);
  assert.equal(retry.created, false);
  assert.equal(service.listEvents('room-1').length, eventsBefore);
  // 同 ID/异 content 继续 id_conflict。
  assert.equal(
    errCode(() => service.startRun(makeRun({ baseline_head: 'other' }), EXECUTOR)),
    'id_conflict',
  );
});

test('completeRun rejects a stale run after failure and retry', () => {
  const { service } = makeService();
  toCoding(service); // run-1 running
  service.failRun('run-1', { code: 'claude_exit_failed', message: 'boom' }, makeTerminalEvidence(), EXECUTOR); // RUN_FAILED
  service.retryAfterFailure('room-1', PLANNER); // PLAN_READY
  service.startRun(makeRun({ run_id: 'run-2' }), EXECUTOR); // CODING, run-2 running
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(
    errCode(() => service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence(), EXECUTOR)),
    'validation_failed',
  );
  assert.equal(service.getRoom('room-1')!.state, 'CODING');
  assert.equal(service.getRun('run-2')!.status, 'running');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

test('completeRun rejects a non-completed coding result', () => {
  const { service } = makeService();
  toCoding(service);
  assert.equal(
    errCode(() => service.completeRun('run-1', makeCodingResult({ status: 'blocked' }), makeTerminalEvidence(), EXECUTOR)),
    'coding_result_invalid',
  );
  assert.equal(
    errCode(() => service.completeRun('run-1', makeCodingResult({ status: 'needs_decision' }), makeTerminalEvidence(), EXECUTOR)),
    'coding_result_invalid',
  );
  assert.equal(service.getRoom('room-1')!.state, 'CODING');
  assert.equal(service.getRun('run-1')!.status, 'running');
});

test('failRun/askQuestion reject a non-running run with no partial write', () => {
  const { service } = makeService();
  toCoding(service);
  service.failRun('run-1', { code: 'x', message: 'y' }, makeTerminalEvidence(), EXECUTOR); // run-1 failed
  service.retryAfterFailure('room-1', PLANNER); // PLAN_READY
  assert.equal(
    errCode(() => service.failRun('run-1', { code: 'x', message: 'y' }, makeTerminalEvidence(), EXECUTOR)),
    'validation_failed',
  );
  assert.equal(errCode(() => service.askQuestion(makeQuestion(), WORKER)), 'validation_failed');
  assert.equal(service.getQuestion('question-1'), null); // rolled back
});

test('submitReview rejects a run that is not succeeded', () => {
  const { db, service } = makeService();
  toCoding(service); // run-1 running, room CODING
  db.prepare("UPDATE rooms SET state = 'REVIEW_REQUIRED', updated_at = '2026-08-23T00:00:00.000Z' WHERE room_id = 'room-1'").run();
  assert.equal(errCode(() => service.submitReview(makeReview(), REVIEWER)), 'validation_failed');
  assert.equal(service.getRun('run-1')!.status, 'running');
});

test('submitReview rejects a succeeded run without a completed coding result', () => {
  const { db, service } = makeService();
  toCoding(service);
  db.prepare("UPDATE rooms SET state = 'REVIEW_REQUIRED', updated_at = '2026-08-23T00:00:00.000Z' WHERE room_id = 'room-1'").run();
  db.prepare("UPDATE runs SET content_json = json_set(content_json, '$.status', 'succeeded') WHERE run_id = 'run-1'").run();
  assert.equal(errCode(() => service.submitReview(makeReview(), REVIEWER)), 'validation_failed');
});

test('submitReview rejects a stale succeeded run after a newer run completed', () => {
  const { service } = makeService();
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER); // PLAN_READY
  service.startRun(makeRun(), EXECUTOR); // CODING, run-1
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence(), EXECUTOR); // REVIEW_REQUIRED, run_completed run-1
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER); // review-1, REVIEW_DISCUSSION
  service.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', parent_task_id: 'task-1', based_on_review_id: 'review-1' }),
    PLANNER,
  ); // FIX_PLAN_READY
  service.resumeRun(makeRun({ run_id: 'run-2', task_id: 'task-2' }), EXECUTOR); // CODING
  service.completeRun('run-2', makeCodingResult({ task_id: 'task-2' }), makeTerminalEvidence(), EXECUTOR); // REVIEW_REQUIRED, run_completed run-2

  const eventsBefore = service.listEvents('room-1').length;
  // 引用旧 succeeded run-1 的 Review 必须以 validation_failed 拒绝，Room 保持 REVIEW_REQUIRED，且不持久化 Review/Event
  const stale = makeReview({ review_id: 'review-2', room_id: 'room-1', task_id: 'task-1', run_id: 'run-1' });
  assert.equal(errCode(() => service.submitReview(stale, REVIEWER)), 'validation_failed');
  assert.equal(service.getRoom('room-1')!.state, 'REVIEW_REQUIRED');
  assert.equal(service.getReview('review-2'), null);
  assert.equal(service.listEvents('room-1').length, eventsBefore);

  // 引用当前 run-2 的合法 Review 必须继续成功进入 REVIEW_DISCUSSION
  const current = makeReview({ review_id: 'review-3', room_id: 'room-1', task_id: 'task-2', run_id: 'run-2' });
  assert.equal(service.submitReview(current, REVIEWER).room.state, 'REVIEW_DISCUSSION');
});

test('submitReview is idempotent for a persisted review across a later run', () => {
  const { service } = makeService();
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER); // PLAN_READY
  service.startRun(makeRun(), EXECUTOR); // CODING, run-1
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence(), EXECUTOR); // REVIEW_REQUIRED, run_completed run-1
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER); // review-1 持久化, REVIEW_DISCUSSION
  service.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', parent_task_id: 'task-1', based_on_review_id: 'review-1' }),
    PLANNER,
  ); // FIX_PLAN_READY
  service.resumeRun(makeRun({ run_id: 'run-2', task_id: 'task-2' }), EXECUTOR); // CODING
  service.completeRun('run-2', makeCodingResult({ task_id: 'task-2' }), makeTerminalEvidence(), EXECUTOR); // REVIEW_REQUIRED, run_completed run-2

  const eventsBefore = service.listEvents('room-1').length;
  // 同 ID/同 content 重试已持久化 review-1：created=false，返回既有 review，Room 与 Event 不变
  const retry = service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER);
  assert.equal(retry.created, false);
  assert.equal(retry.review.review_id, 'review-1');
  assert.equal(retry.review.decision, 'changes_requested');
  assert.equal(service.getRoom('room-1')!.state, 'REVIEW_REQUIRED');
  assert.equal(service.listEvents('room-1').length, eventsBefore);

  // 同 ID/不同 content 返回 id_conflict，Room 与 Event 不变
  assert.equal(errCode(() => service.submitReview(makeReview({ decision: 'approved' }), REVIEWER)), 'id_conflict');
  assert.equal(service.getRoom('room-1')!.state, 'REVIEW_REQUIRED');
  assert.equal(service.listEvents('room-1').length, eventsBefore);

  // 新 review_id 引用旧 run-1：validation_failed，不持久化 Review/Event
  const stale = makeReview({ review_id: 'review-2', room_id: 'room-1', task_id: 'task-1', run_id: 'run-1' });
  assert.equal(errCode(() => service.submitReview(stale, REVIEWER)), 'validation_failed');
  assert.equal(service.getReview('review-2'), null);
  assert.equal(service.getRoom('room-1')!.state, 'REVIEW_REQUIRED');
  assert.equal(service.listEvents('room-1').length, eventsBefore);

  // 新 review_id 引用当前 run-2：成功进入 REVIEW_DISCUSSION
  const current = makeReview({ review_id: 'review-3', room_id: 'room-1', task_id: 'task-2', run_id: 'run-2' });
  assert.equal(service.submitReview(current, REVIEWER).room.state, 'REVIEW_DISCUSSION');
});

test('acceptReview rejects a stale review after a newer review is submitted', () => {
  const { service } = makeService();
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER);
  service.startRun(makeRun(), EXECUTOR);
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence(), EXECUTOR);
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER); // review-1
  service.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', parent_task_id: 'task-1', based_on_review_id: 'review-1' }),
    PLANNER,
  );
  service.resumeRun(makeRun({ run_id: 'run-2', task_id: 'task-2' }), EXECUTOR);
  service.completeRun('run-2', makeCodingResult({ task_id: 'task-2' }), makeTerminalEvidence(), EXECUTOR);
  service.submitReview(makeReview({ review_id: 'review-2', run_id: 'run-2', task_id: 'task-2' }), REVIEWER); // review-2
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(errCode(() => service.acceptReview('review-1', true, REVIEWER)), 'validation_failed');
  assert.equal(service.getRoom('room-1')!.state, 'REVIEW_DISCUSSION');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

test('fix task referencing a finding not in the review is rejected with no persistence', () => {
  const { service } = makeService();
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER);
  service.startRun(makeRun(), EXECUTOR);
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence(), EXECUTOR);
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER); // review-1 has f-1
  const eventsBefore = service.listEvents('room-1').length;
  const phantom = makeFixTask({
    task_id: 'task-2',
    room_id: 'room-1',
    parent_task_id: 'task-1',
    based_on_review_id: 'review-1',
    confirmed_findings: [{ finding_id: 'ghost', solution: 'x' }],
  });
  assert.equal(errCode(() => service.submitTask(phantom, PLANNER)), 'validation_failed');
  assert.equal(service.getTask('task-2'), null);
  assert.equal(service.getRoom('room-1')!.state, 'REVIEW_DISCUSSION');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

test('finalizeNeedsDecision persists pause evidence and appends run_paused without terminal events', () => {
  const { service } = makeService();
  toCoding(service);
  service.askQuestion(makeQuestion(), WORKER); // NEEDS_DECISION, run-1 needs_decision
  const evidence = makeTerminalEvidence({
    agent_session_ref: 'sess-1',
    process_exit_code: 0,
    git_evidence: { staged: ['a.txt'], unstaged: ['b.txt'], untracked: ['c.txt'] },
    artifact_refs: ['.agent-room/artifacts/run-1/stdout.jsonl', '.agent-room/artifacts/run-1/stderr.log'],
  });
  const { room, run, created } = service.finalizeNeedsDecision(
    'run-1',
    makeCodingResult({ status: 'needs_decision' }),
    null,
    evidence,
    EXECUTOR,
  );
  assert.equal(created, true);
  assert.equal(room.state, 'NEEDS_DECISION');
  assert.equal(run.status, 'needs_decision');
  assert.equal(run.completed_at !== null, true);
  assert.equal(run.agent_session_ref, 'sess-1');
  assert.equal(run.process_exit_code, 0);
  assert.equal(run.result?.status, 'needs_decision');
  assert.equal(run.failure, null);
  assert.deepEqual(run.git_evidence, evidence.git_evidence);
  assert.deepEqual(run.artifact_refs, evidence.artifact_refs);
  const events = service.listEvents('room-1');
  assert.equal(events.filter((e) => e.type === 'question_asked').length, 1);
  assert.equal(events.filter((e) => e.type === 'run_paused').length, 1);
  assert.equal(events.filter((e) => e.type === 'run_completed').length, 0);
  assert.equal(events.filter((e) => e.type === 'run_failed').length, 0);
});

test('finalizeNeedsDecision same-payload retry is idempotent; different payload conflicts', () => {
  const { service } = makeService();
  toCoding(service);
  service.askQuestion(makeQuestion(), WORKER);
  const result = makeCodingResult({ status: 'needs_decision' });
  const evidence = makeTerminalEvidence({ agent_session_ref: 'sess-1', process_exit_code: 0 });
  const first = service.finalizeNeedsDecision('run-1', result, null, evidence, EXECUTOR);
  assert.equal(first.created, true);
  const eventsAfterFirst = service.listEvents('room-1').length;

  const retry = service.finalizeNeedsDecision('run-1', result, null, evidence, EXECUTOR);
  assert.equal(retry.created, false);
  assert.equal(retry.run.status, 'needs_decision');
  assert.equal(service.listEvents('room-1').length, eventsAfterFirst);

  // 不同 payload 以 id_conflict 失败，durable state 不变。
  assert.equal(
    errCode(() => service.finalizeNeedsDecision('run-1', result, null, makeTerminalEvidence({ process_exit_code: 1 }), EXECUTOR)),
    'id_conflict',
  );
  assert.equal(service.listEvents('room-1').length, eventsAfterFirst);
  assert.equal(service.getRun('run-1')!.process_exit_code, 0);
});

test('finalizeNeedsDecision same-payload retry stays idempotent and different payload conflicts after the question is answered', () => {
  const { service } = makeService();
  toCoding(service);
  service.askQuestion(makeQuestion(), WORKER);
  const result = makeCodingResult({ status: 'needs_decision' });
  const evidence = makeTerminalEvidence({ agent_session_ref: 'sess-1', process_exit_code: 0 });
  const first = service.finalizeNeedsDecision('run-1', result, null, evidence, EXECUTOR);
  assert.equal(first.created, true);
  service.answerQuestion('question-1', 'pick a', false, PLANNER);
  assert.equal(service.getQuestion('question-1')!.status, 'answered');

  // 完整 durable snapshot：Run、Question、Room、Event list 与 cursor，均来自 public RoomService
  // read method，不从实现 helper 生成期望。cursor 为 Event list 最大 sequence。
  const snapshot = () => {
    const events = service.listEvents('room-1');
    return {
      run: service.getRun('run-1'),
      question: service.getQuestion('question-1'),
      room: service.getRoom('room-1'),
      events,
      cursor: events.length === 0 ? 0 : events[events.length - 1].sequence,
    };
  };

  // answer 后 exact same pause payload retry 仍幂等：created=false，完整 snapshot 前后 deepEqual。
  const beforeRetry = snapshot();
  const retry = service.finalizeNeedsDecision('run-1', result, null, evidence, EXECUTOR);
  assert.equal(retry.created, false);
  assert.equal(retry.run.status, 'needs_decision');
  assert.equal(retry.run.completed_at !== null, true);
  assert.deepEqual(snapshot(), beforeRetry, 'same-payload retry must not change any durable state');

  // answer 后 different payload 返回 literal id_conflict，完整 snapshot 前后 deepEqual。
  const beforeConflict = snapshot();
  assert.equal(
    errCode(() =>
      service.finalizeNeedsDecision(
        'run-1',
        result,
        null,
        makeTerminalEvidence({ agent_session_ref: 'sess-1', process_exit_code: 1 }),
        EXECUTOR,
      ),
    ),
    'id_conflict',
  );
  assert.deepEqual(snapshot(), beforeConflict, 'different-payload conflict must not change any durable state');
});

test('answerQuestion before pause finalization returns validation_failed with no partial write', () => {
  const { service } = makeService();
  toCoding(service);
  service.askQuestion(makeQuestion(), WORKER); // completed_at 仍 null
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(errCode(() => service.answerQuestion('question-1', 'pick a', false, PLANNER)), 'validation_failed');
  assert.equal(service.getQuestion('question-1')!.status, 'open');
  assert.equal(service.getRoom('room-1')!.state, 'NEEDS_DECISION');
  assert.equal(service.listEvents('room-1').length, eventsBefore);

  // finalization 后 answer 成功。
  service.finalizeNeedsDecision(
    'run-1',
    makeCodingResult({ status: 'needs_decision' }),
    null,
    makeTerminalEvidence({ agent_session_ref: 'sess-1' }),
    EXECUTOR,
  );
  assert.equal(service.answerQuestion('question-1', 'pick a', false, PLANNER).question.status, 'answered');
});

test('startRun rejects NEEDS_DECISION; resumeRun rejects first PLAN_READY with no prior lineage', () => {
  const { service } = makeService();
  // 首次 PLAN_READY 无 prior lineage Run，resumeRun 拒绝且不留 Run。
  toPlanReady(service);
  assert.equal(errCode(() => service.resumeRun(makeRun({ run_id: 'run-1' }), EXECUTOR)), 'validation_failed');
  assert.equal(service.getRun('run-1'), null);
  assert.equal(service.getRoom('room-1')!.state, 'PLAN_READY');

  // NEEDS_DECISION 禁止 startRun；必须 resumeRun 继承 lineage。
  service.startRun(makeRun(), EXECUTOR); // CODING
  service.askQuestion(makeQuestion(), WORKER); // NEEDS_DECISION
  assert.equal(errCode(() => service.startRun(makeRun({ run_id: 'run-2' }), EXECUTOR)), 'validation_failed');
  assert.equal(service.getRun('run-2'), null);
  assert.equal(service.getRoom('room-1')!.state, 'NEEDS_DECISION');
});

test('getContinuationContext derives new_implementation and decision kinds from lineage', () => {
  const { service } = makeService();
  // new_implementation
  toPlanReady(service);
  const fresh = service.getContinuationContext('room-1', 'task-1');
  assert.equal(fresh.kind, 'new_implementation');
  assert.equal(fresh.sourceRun, null);

  // decision：finalize + answer(false) 后从 persisted Question/source Run 推导 session/baseline。
  service.startRun(makeRun(), EXECUTOR);
  service.askQuestion(makeQuestion(), WORKER);
  service.finalizeNeedsDecision(
    'run-1',
    makeCodingResult({ status: 'needs_decision' }),
    null,
    makeTerminalEvidence({ agent_session_ref: 'sess-1' }),
    EXECUTOR,
  );
  service.answerQuestion('question-1', 'pick a', false, PLANNER);
  const decision = service.getContinuationContext('room-1', 'task-1');
  assert.equal(decision.kind, 'decision');
  if (decision.kind === 'decision') {
    assert.equal(decision.sourceRun.run_id, 'run-1');
    assert.equal(decision.sourceRun.agent_session_ref, 'sess-1');
    assert.equal(decision.question.question_id, 'question-1');
    assert.equal(decision.question.answer_changes_contract, false);
  }
});

test('getContinuationContext derives fix kind from the reviewed lineage session and baseline', () => {
  const { service } = makeService();
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER);
  service.startRun(makeRun(), EXECUTOR);
  service.completeRun(
    'run-1',
    makeCodingResult(),
    makeTerminalEvidence({ agent_session_ref: 'sess-1' }),
    EXECUTOR,
  );
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER);
  service.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', parent_task_id: 'task-1', based_on_review_id: 'review-1' }),
    PLANNER,
  );
  const fix = service.getContinuationContext('room-1', 'task-2');
  assert.equal(fix.kind, 'fix');
  if (fix.kind === 'fix') {
    assert.equal(fix.sourceRun.run_id, 'run-1');
    assert.equal(fix.sourceRun.agent_session_ref, 'sess-1');
    assert.equal(fix.sourceRun.baseline_head, 'deadbeef');
    assert.equal(fix.review.review_id, 'review-1');
  }
});

test('getContinuationContext rejects changed-contract answer, missing session and wrong state', () => {
  const { service } = makeService();
  // answer_changes_contract=true：不能 resume 旧 Task。
  toCoding(service);
  service.askQuestion(makeQuestion(), WORKER);
  service.finalizeNeedsDecision(
    'run-1',
    makeCodingResult({ status: 'needs_decision' }),
    null,
    makeTerminalEvidence({ agent_session_ref: 'sess-1' }),
    EXECUTOR,
  );
  service.answerQuestion('question-1', 'change it', true, PLANNER); // WAITING_FOR_USER_CONFIRMATION
  assert.equal(errCode(() => service.getContinuationContext('room-1', 'task-1')), 'validation_failed');

  // missing session：source Run 无 agent_session_ref 时拒绝 fix continuation。
  const { service: s2 } = makeService();
  s2.createRoom('room-1', PLANNER);
  s2.transitionToArchitectureReview('room-1', PLANNER);
  s2.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  s2.submitTask(makeTask(), PLANNER);
  s2.startRun(makeRun(), EXECUTOR);
  s2.completeRun('run-1', makeCodingResult(), makeTerminalEvidence(), EXECUTOR); // session null
  s2.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER);
  s2.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', parent_task_id: 'task-1', based_on_review_id: 'review-1' }),
    PLANNER,
  );
  assert.equal(errCode(() => s2.getContinuationContext('room-1', 'task-2')), 'validation_failed');

  // wrong state：CODING 不能 start run。
  const { service: s3 } = makeService();
  toCoding(s3);
  assert.equal(errCode(() => s3.getContinuationContext('room-1', 'task-1')), 'validation_failed');
});

test('getContinuationContext derives retry kind from the current task failed run after retryAfterFailure', () => {
  const { service } = makeService();
  toCoding(service);
  service.failRun(
    'run-1',
    { code: 'claude_exit_failed', message: 'boom' },
    makeTerminalEvidence({ agent_session_ref: 'sess-1', process_exit_code: 1 }),
    EXECUTOR,
  ); // RUN_FAILED
  assert.equal(service.getRoom('room-1')!.state, 'RUN_FAILED');
  service.retryAfterFailure('room-1', PLANNER); // PLAN_READY
  const retry = service.getContinuationContext('room-1', 'task-1');
  assert.equal(retry.kind, 'retry');
  if (retry.kind === 'retry') {
    // source 是 latest run_failed Event 引用的 current Task Run，带 persisted session/baseline。
    assert.equal(retry.sourceRun.run_id, 'run-1');
    assert.equal(retry.sourceRun.status, 'failed');
    assert.equal(retry.sourceRun.agent_session_ref, 'sess-1');
    assert.equal(retry.sourceRun.baseline_head, 'deadbeef');
    assert.notEqual(retry.sourceRun.completed_at, null);
  }
});

test('getContinuationContext retry kind tolerates a source run without a session (replacement session)', () => {
  const { service } = makeService();
  toCoding(service);
  service.failRun('run-1', { code: 'claude_exit_failed', message: 'boom' }, makeTerminalEvidence(), EXECUTOR);
  service.retryAfterFailure('room-1', PLANNER);
  const retry = service.getContinuationContext('room-1', 'task-1');
  assert.equal(retry.kind, 'retry');
  if (retry.kind === 'retry') {
    // 与 decision/fix 不同，retry 不要求 session：Runner 据此省略 --resume 创建 replacement session。
    assert.equal(retry.sourceRun.agent_session_ref, null);
  }
});

test('getContinuationContext keeps new_implementation when no failed run exists or the latest run_failed references an old task run', () => {
  // 无 run_failed Event → new_implementation。
  const { service } = makeService();
  toPlanReady(service);
  assert.equal(service.getContinuationContext('room-1', 'task-1').kind, 'new_implementation');

  // stale failure：更早 lineage 的 run_failed 不作为 current Task 的 retry source；从
  // RUN_FAILED 提交新 Implementation 后保持首次 new Implementation 语义。
  const { service: s2 } = makeService();
  toCoding(s2);
  s2.failRun('run-1', { code: 'claude_exit_failed', message: 'boom' }, makeTerminalEvidence(), EXECUTOR); // RUN_FAILED
  s2.submitTask(makeTask({ task_id: 'task-2' }), PLANNER); // RUN_FAILED -> PLAN_READY, current task = task-2
  const fresh = s2.getContinuationContext('room-1', 'task-2');
  assert.equal(fresh.kind, 'new_implementation');
  assert.equal(fresh.sourceRun, null);
});

test('getContinuationContext rejects a stale task while a failed source run exists', () => {
  const { service } = makeService();
  toCoding(service);
  service.failRun('run-1', { code: 'claude_exit_failed', message: 'boom' }, makeTerminalEvidence(), EXECUTOR); // RUN_FAILED
  service.submitTask(makeTask({ task_id: 'task-2' }), PLANNER); // current task = task-2
  assert.equal(errCode(() => service.getContinuationContext('room-1', 'task-1')), 'validation_failed');
});

// ---- v0.3 Participant / RoleAssignment commands ----

test('participant and assignment commands require orchestrator authority', () => {
  const { service } = makeService();
  toPlanReady(service);
  assert.equal(
    errCode(() => service.registerParticipant(makeParticipant({ participant_id: 'p2' }), PLANNER)),
    'actor_not_allowed',
  );
  assert.equal(errCode(() => service.setParticipantEnabled('operator', false, PLANNER)), 'actor_not_allowed');
  assert.equal(
    errCode(() => service.createRoleAssignment(makeRoleAssignment({ assignment_id: 'a-1' }), PLANNER)),
    'actor_not_allowed',
  );
  assert.equal(service.getParticipant('p2'), null);
  assert.equal(service.getRoleAssignment('a-1'), null);
});

test('registerParticipant and setParticipantEnabled are idempotent and durable', () => {
  const { service } = makeService();
  toPlanReady(service);
  const { profile, created } = service.registerParticipant(
    makeParticipant({ participant_id: 'p2', kind: 'agent', provider: 'codex', adapter_id: 'codex_app', capabilities: ['planning'] }),
    ORCHESTRATOR,
  );
  assert.equal(created, true);
  assert.equal(profile.participant_id, 'p2');
  // 同 ID 幂等：不改写既有 profile
  const again = service.registerParticipant(
    makeParticipant({ participant_id: 'p2', kind: 'agent', provider: 'codex', adapter_id: 'codex_app', capabilities: ['planning'] }),
    ORCHESTRATOR,
  );
  assert.equal(again.created, false);
  assert.equal(service.getParticipant('p2')!.enabled, true);

  service.setParticipantEnabled('p2', false, ORCHESTRATOR);
  assert.equal(service.getParticipant('p2')!.enabled, false);
  assert.equal(errCode(() => service.setParticipantEnabled('ghost', false, ORCHESTRATOR)), 'entity_not_found');
});

test('createRoleAssignment rejects unknown, disabled or incompatible participants before persistence', () => {
  const { service } = makeService();
  toPlanReady(service);
  // unknown participant
  assert.equal(
    errCode(() =>
      service.createRoleAssignment(
        makeRoleAssignment({ assignment_id: 'a-1', role: 'worker', participant_id: 'ghost' }),
        ORCHESTRATOR,
      ),
    ),
    'validation_failed',
  );
  // adapter 与 role 不兼容（operator 是 human adapter，不能承担 worker）
  assert.equal(
    errCode(() =>
      service.createRoleAssignment(
        makeRoleAssignment({ assignment_id: 'a-2', role: 'worker', participant_id: 'operator' }),
        ORCHESTRATOR,
      ),
    ),
    'validation_failed',
  );
  // 悬空 entity scope：scope_id 必须引用同 Room 已存在的 Task；不存在 → entity_not_found
  assert.equal(
    errCode(() =>
      service.createRoleAssignment(
        makeRoleAssignment({ assignment_id: 'a-3', scope_type: 'task', scope_id: 'missing-task', role: 'worker', participant_id: 'claude-code-cli' }),
        ORCHESTRATOR,
      ),
    ),
    'entity_not_found',
  );
  // task scope 引用其它 Room 的 Task：validation_failed（Fix inc9-r5 跨 Room shape）
  service.createRoom('room-2', PLANNER);
  assert.equal(
    errCode(() =>
      service.createRoleAssignment(
        makeRoleAssignment({ assignment_id: 'a-4', room_id: 'room-2', scope_type: 'task', scope_id: 'task-1', role: 'worker', participant_id: 'claude-code-cli' }),
        ORCHESTRATOR,
      ),
    ),
    'validation_failed',
  );
  // room scope 的 scope_id 必须为 null：validation_failed（Fix inc9-r5）
  assert.equal(
    errCode(() =>
      service.createRoleAssignment(
        makeRoleAssignment({ assignment_id: 'a-5', scope_type: 'room', scope_id: 'task-1', role: 'worker', participant_id: 'claude-code-cli' }),
        ORCHESTRATOR,
      ),
    ),
    'validation_failed',
  );
  // git_controller 兼容规则冻结为 local_runner + git_control：claude_code_cli worker 不兼容
  assert.equal(
    errCode(() =>
      service.createRoleAssignment(
        makeRoleAssignment({ assignment_id: 'a-6', role: 'git_controller', participant_id: 'claude-code-cli' }),
        ORCHESTRATOR,
      ),
    ),
    'validation_failed',
  );
  // local-runner 缺少 git_control capability：同样不兼容（bootstrap profile 不带 git_control）
  assert.equal(
    errCode(() =>
      service.createRoleAssignment(
        makeRoleAssignment({ assignment_id: 'a-7', role: 'git_controller', participant_id: 'local-runner' }),
        ORCHESTRATOR,
      ),
    ),
    'validation_failed',
  );
  assert.equal(service.getRoleAssignment('a-1'), null);
  assert.equal(service.getRoleAssignment('a-2'), null);
  assert.equal(service.getRoleAssignment('a-3'), null);
  assert.equal(service.getRoleAssignment('a-4'), null);
  assert.equal(service.getRoleAssignment('a-5'), null);
  assert.equal(service.getRoleAssignment('a-6'), null);
  assert.equal(service.getRoleAssignment('a-7'), null);
});

test('resolveAssignment prefers exact entity scope over room default and the latest assignment', () => {
  const { service } = makeService();
  toPlanReady(service);
  // room default worker = claude-code-cli
  assert.equal(service.resolveAssignment('room-1', 'room', null, 'worker')?.participant_id, 'claude-code-cli');
  // exact task scope assignment wins for that task
  service.createRoleAssignment(
    makeRoleAssignment({
      assignment_id: 'a-worker-1',
      scope_type: 'task',
      scope_id: 'task-1',
      role: 'worker',
      participant_id: 'claude-code-cli',
    }),
    ORCHESTRATOR,
  );
  assert.equal(service.resolveAssignment('room-1', 'task', 'task-1', 'worker')?.assignment_id, 'a-worker-1');
  // 其它 task scope 回落 room default
  assert.equal(service.resolveAssignment('room-1', 'task', 'other-task', 'worker')?.participant_id, 'claude-code-cli');
  // replace：同 scope/role 的新 assignment 成为 active，旧 assignment 只保留历史。
  // Fix inc9-r5：active 顺序只由成功 insert 的 rowid 决定——backdated created_at 不得阻止
  // 新 insert 成为 active，caller timestamp 不能操纵 resolution。
  service.createRoleAssignment(
    makeRoleAssignment({
      assignment_id: 'a-worker-2',
      role: 'worker',
      participant_id: 'claude-code-cli',
      created_at: '2000-01-01T00:00:00.000Z',
    }),
    ORCHESTRATOR,
  );
  assert.equal(service.resolveAssignment('room-1', 'room', null, 'worker')?.assignment_id, 'a-worker-2');
  assert.equal(service.getRoleAssignment('a-worker-1')!.participant_id, 'claude-code-cli'); // 历史仍在
  // same-ID retry 不产生新 row，因此不提升旧 assignment（rowid 顺序不变）。
  service.createRoleAssignment(
    makeRoleAssignment({
      assignment_id: 'a-worker-2',
      role: 'worker',
      participant_id: 'claude-code-cli',
      created_at: '2000-01-01T00:00:00.000Z',
    }),
    ORCHESTRATOR,
  );
  assert.equal(service.resolveAssignment('room-1', 'room', null, 'worker')?.assignment_id, 'a-worker-2');
});

test('Task/Run/Review freeze identities at creation; later assignment changes never rewrite them', () => {
  const { service } = makeService();
  toCoding(service);
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence(), EXECUTOR);
  service.submitReview(makeReview(), REVIEWER); // REVIEW_DISCUSSION
  const eventsBefore = service.listEvents('room-1').length;

  // register 一个新 worker-capable participant 并 replace worker assignment
  service.registerParticipant(
    makeParticipant({
      participant_id: 'worker-2',
      kind: 'agent',
      provider: 'codex',
      adapter_id: 'claude_code_cli',
      capabilities: ['coding'],
    }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({
      assignment_id: 'a-worker-2',
      role: 'worker',
      participant_id: 'worker-2',
      // active 顺序由 insert rowid 决定（Fix inc9-r5），created_at 只是历史 metadata。
      created_at: '2026-08-23T00:00:00.000Z',
    }),
    ORCHESTRATOR,
  );
  assert.equal(service.resolveAssignment('room-1', 'room', null, 'worker')?.participant_id, 'worker-2');

  // 既有 entity 的固化 identity 不回填、不改写；participant/assignment 命令不追加 Room Event。
  assert.equal(service.getTask('task-1')!.planner_participant_id, 'codex-app');
  assert.equal(service.getTask('task-1')!.orchestrator_participant_id, 'codex-app');
  assert.equal(service.getRun('run-1')!.worker_participant_id, 'claude-code-cli');
  assert.equal(service.getRun('run-1')!.executor_participant_id, 'local-runner');
  assert.equal(service.getReview('review-1')!.reviewer_participant_id, 'codex-app');
  assert.equal(service.listEvents('room-1').length, eventsBefore);

  // disable 同样不改写既有 entity。
  service.setParticipantEnabled('codex-app', false, ORCHESTRATOR);
  assert.equal(service.getTask('task-1')!.planner_participant_id, 'codex-app');
  assert.equal(service.getReview('review-1')!.reviewer_participant_id, 'codex-app');
});

test('disabled participant loses new command authority but history stays readable', () => {
  const { service } = makeService();
  toCoding(service);
  service.setParticipantEnabled('claude-code-cli', false, ORCHESTRATOR);
  assert.equal(errCode(() => service.askQuestion(makeQuestion(), WORKER)), 'actor_not_allowed');
  assert.equal(service.getRoom('room-1')!.state, 'CODING');
  assert.equal(service.getQuestion('question-1'), null);
  // 历史 Run/Event 仍可读。
  assert.equal(service.getRun('run-1')!.worker_participant_id, 'claude-code-cli');
  assert.ok(service.listEvents('room-1').length > 0);
});

// ---- Increment 9 Fix Task 1 regressions ----

// Fix inc9-r1：assignment replacement 不撤销冻结 authority。注册 replacement worker/executor
// 后，冻结 worker 仍可 askQuestion、冻结 executor 仍可 progress/pause/complete；replacement
// 对旧 Run 返回 actor_not_allowed；disabled 冻结 actor 必须 re-enable 后恢复。
test('active Run commands use frozen identity after worker/executor replacement; disabled frozen actor re-enables', () => {
  const { service } = makeService();
  toCoding(service); // run-1 running, CODING
  service.registerParticipant(
    makeParticipant({ participant_id: 'worker-2', kind: 'agent', provider: 'anthropic', adapter_id: 'claude_code_cli', capabilities: ['coding', 'questioning'] }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-worker-2', role: 'worker', participant_id: 'worker-2' }),
    ORCHESTRATOR,
  );
  service.registerParticipant(
    makeParticipant({ participant_id: 'runner-2', kind: 'service', provider: 'local', adapter_id: 'local_runner', capabilities: ['execution'] }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-executor-2', role: 'executor', participant_id: 'runner-2' }),
    ORCHESTRATOR,
  );
  const WORKER_2 = { participant_id: 'worker-2', actor_role: 'worker' as const };
  const RUNNER_2 = { participant_id: 'runner-2', actor_role: 'executor' as const };

  // 冻结 executor 仍可 progress；replacement executor 被拒。
  const progress = { type: 'line', subtype: 'tool', outcome: 'done' };
  assert.equal(errCode(() => service.appendRunProgress('run-1', progress, RUNNER_2)), 'actor_not_allowed');
  service.appendRunProgress('run-1', progress, EXECUTOR);

  // disabled 冻结 worker 不能发起 command；re-enable 后恢复（不修改 Run/Event 历史）。
  service.setParticipantEnabled('claude-code-cli', false, ORCHESTRATOR);
  assert.equal(errCode(() => service.askQuestion(makeQuestion(), WORKER)), 'actor_not_allowed');
  service.setParticipantEnabled('claude-code-cli', true, ORCHESTRATOR);
  assert.equal(service.askQuestion(makeQuestion(), WORKER).created, true);
  assert.equal(service.getRoom('room-1')!.state, 'NEEDS_DECISION');
  assert.equal(service.getRun('run-1')!.worker_participant_id, 'claude-code-cli');

  // 冻结 executor 仍可 pause finalization；replacement executor 对旧 Run 被拒。
  assert.equal(
    errCode(() =>
      service.finalizeNeedsDecision(
        'run-1',
        makeCodingResult({ status: 'needs_decision' }),
        null,
        makeTerminalEvidence({ agent_session_ref: 'sess-1' }),
        RUNNER_2,
      ),
    ),
    'actor_not_allowed',
  );
  service.finalizeNeedsDecision(
    'run-1',
    makeCodingResult({ status: 'needs_decision' }),
    null,
    makeTerminalEvidence({ agent_session_ref: 'sess-1' }),
    EXECUTOR,
  );
  service.answerQuestion('question-1', 'pick a', false, PLANNER);

  // 下一 Run 由 replacement worker/executor 消费（Fix inc9-r2）：旧冻结 actor 对新 Run 被拒，
  // 新 executor 可 complete 到唯一 terminal state。
  const resumed = service.resumeRun(
    makeRun({ run_id: 'run-2', worker_participant_id: 'worker-2', executor_participant_id: 'runner-2' }),
    RUNNER_2,
  );
  assert.equal(resumed.room.state, 'CODING');
  assert.equal(errCode(() => service.askQuestion(makeQuestion({ run_id: 'run-2', question_id: 'q-2' }), WORKER)), 'actor_not_allowed');
  assert.equal(
    errCode(() => service.completeRun('run-2', makeCodingResult(), makeTerminalEvidence(), EXECUTOR)),
    'actor_not_allowed',
  );
  const completed = service.completeRun('run-2', makeCodingResult(), makeTerminalEvidence(), RUNNER_2);
  assert.equal(completed.run.status, 'succeeded');
  assert.equal(completed.room.state, 'REVIEW_REQUIRED');
  const types = service.listEvents('room-1').map((e) => e.type);
  assert.equal(types.filter((t) => t === 'run_completed').length, 1);
});

// Fix inc9-r1：冻结 executor 仍可 fail 被替换后的 active Run，且恰好一个 terminal Event。
test('frozen executor can fail the active Run after replacement; replacement executor is rejected', () => {
  const { service } = makeService();
  toCoding(service);
  service.registerParticipant(
    makeParticipant({ participant_id: 'runner-2', kind: 'service', provider: 'local', adapter_id: 'local_runner', capabilities: ['execution'] }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-executor-2', role: 'executor', participant_id: 'runner-2' }),
    ORCHESTRATOR,
  );
  const RUNNER_2 = { participant_id: 'runner-2', actor_role: 'executor' as const };
  assert.equal(
    errCode(() => service.failRun('run-1', { code: 'claude_exit_failed', message: 'boom' }, makeTerminalEvidence(), RUNNER_2)),
    'actor_not_allowed',
  );
  const result = service.failRun('run-1', { code: 'claude_exit_failed', message: 'boom' }, makeTerminalEvidence(), EXECUTOR);
  assert.equal(result.run.status, 'failed');
  assert.equal(result.room.state, 'RUN_FAILED');
  const types = service.listEvents('room-1').map((e) => e.type);
  assert.equal(types.filter((t) => t === 'run_failed').length, 1);
  assert.equal(types.filter((t) => t === 'run_completed').length, 0);
});

// Fix inc9-r2：task-scope worker/executor/reviewer 被下一 Run/Review 首次创建消费并固化；
// Room default fallback 成立；之后替换 task-scope assignment 不改写历史。
test('task-scope worker/executor/reviewer are consumed and frozen by the next Run/Review', () => {
  const { service } = makeService();
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER); // task-1, PLAN_READY
  service.registerParticipant(
    makeParticipant({ participant_id: 'worker-2', kind: 'agent', provider: 'anthropic', adapter_id: 'claude_code_cli', capabilities: ['coding', 'questioning'] }),
    ORCHESTRATOR,
  );
  service.registerParticipant(
    makeParticipant({ participant_id: 'runner-2', kind: 'service', provider: 'local', adapter_id: 'local_runner', capabilities: ['execution'] }),
    ORCHESTRATOR,
  );
  service.registerParticipant(
    makeParticipant({ participant_id: 'reviewer-2', kind: 'agent', provider: 'codex', adapter_id: 'codex_app', capabilities: ['reviewing'] }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-w2', scope_type: 'task', scope_id: 'task-1', role: 'worker', participant_id: 'worker-2' }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-e2', scope_type: 'task', scope_id: 'task-1', role: 'executor', participant_id: 'runner-2' }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-r2', scope_type: 'task', scope_id: 'task-1', role: 'reviewer', participant_id: 'reviewer-2' }),
    ORCHESTRATOR,
  );
  const WORKER_2 = { participant_id: 'worker-2', actor_role: 'worker' as const };
  const RUNNER_2 = { participant_id: 'runner-2', actor_role: 'executor' as const };
  const REVIEWER_2 = { participant_id: 'reviewer-2', actor_role: 'reviewer' as const };

  // claim：task-scope executor 优先于 room default，room default executor 被拒。
  assert.equal(errCode(() => service.startRun(makeRun(), EXECUTOR)), 'actor_not_allowed');
  // room default worker 与 task scope 不一致 → validation_failed。
  assert.equal(
    errCode(() => service.startRun(makeRun({ executor_participant_id: 'runner-2' }), RUNNER_2)),
    'validation_failed',
  );
  const started = service.startRun(
    makeRun({ worker_participant_id: 'worker-2', executor_participant_id: 'runner-2' }),
    RUNNER_2,
  );
  assert.equal(started.room.state, 'CODING');
  assert.equal(service.getRun('run-1')!.worker_participant_id, 'worker-2');
  assert.equal(service.getRun('run-1')!.executor_participant_id, 'runner-2');

  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence(), RUNNER_2); // REVIEW_REQUIRED
  // Review 首次提交消费 task-scope reviewer 并固化；room default reviewer 被 task scope 取代。
  const submitted = service.submitReview(makeReview({ reviewer_participant_id: 'reviewer-2' }), REVIEWER_2);
  assert.equal(submitted.room.state, 'REVIEW_DISCUSSION');
  assert.equal(service.getReview('review-1')!.reviewer_participant_id, 'reviewer-2');
  assert.equal(
    errCode(() => service.submitReview(makeReview({ review_id: 'review-2', reviewer_participant_id: 'codex-app' }), REVIEWER)),
    'actor_not_allowed',
  );

  // 替换 task-scope assignment 后，既有 entity 不回填、不改写。
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-w3', scope_type: 'task', scope_id: 'task-1', role: 'worker', participant_id: 'claude-code-cli' }),
    ORCHESTRATOR,
  );
  assert.equal(service.getRun('run-1')!.worker_participant_id, 'worker-2');
  assert.equal(service.getReview('review-1')!.reviewer_participant_id, 'reviewer-2');
});

// Fix inc9-r3：same-ID retry 在返回 existing 前执行 authority 校验——disabled、wrong-role 或
// 非冻结 participant 不能通过 retry 成功；authorized retry 保持 created=false/零 Event。
test('same-ID retries validate authority before returning existing entities', () => {
  const { service } = makeService();
  toCoding(service); // task-1 已提交、run-1 running、CODING

  // 注册 replacement orchestrator（human），disable codex-app 后 retry 必须被拒。
  service.registerParticipant(
    makeParticipant({ participant_id: 'human-2', kind: 'human', provider: 'local', adapter_id: 'human', capabilities: ['supervising'] }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-orch-2', role: 'orchestrator', participant_id: 'human-2' }),
    ORCHESTRATOR,
  );
  const HUMAN_2 = { participant_id: 'human-2', actor_role: 'orchestrator' as const };
  service.setParticipantEnabled('codex-app', false, HUMAN_2);
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(errCode(() => service.submitTask(makeTask(), PLANNER)), 'actor_not_allowed');
  assert.equal(service.getRoom('room-1')!.state, 'CODING');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
  service.setParticipantEnabled('codex-app', true, HUMAN_2);

  // wrong-role actor 不能通过同 ID/同 content Run retry 成功。
  assert.equal(
    errCode(() => service.startRun(makeRun(), { participant_id: 'claude-code-cli', actor_role: 'worker' as const })),
    'actor_not_allowed',
  );
  assert.equal(service.getRoom('room-1')!.state, 'CODING');
  assert.equal(service.listEvents('room-1').length, eventsBefore);

  // Question：authorized retry（冻结 worker）保持 created=false 且零 Event；
  // wrong-role actor 的 retry 被拒且零 Event。
  assert.equal(service.askQuestion(makeQuestion(), WORKER).created, true); // NEEDS_DECISION
  const eventsAfterQuestion = service.listEvents('room-1').length;
  const retry = service.askQuestion(makeQuestion(), WORKER);
  assert.equal(retry.created, false);
  assert.equal(service.listEvents('room-1').length, eventsAfterQuestion);
  assert.equal(errCode(() => service.askQuestion(makeQuestion(), REVIEWER)), 'actor_not_allowed');
  assert.equal(service.listEvents('room-1').length, eventsAfterQuestion);

  // createRoom：同 ID retry 同样需要 planner authority（operator 无 assignment 被拒）。
  assert.equal(service.createRoom('room-2', PLANNER).created, true);
  const room2Events = service.listEvents('room-2').length;
  assert.equal(errCode(() => service.createRoom('room-2', OPERATOR)), 'actor_not_allowed');
  assert.equal(service.listEvents('room-2').length, room2Events);

  // RoleAssignment：authorized retry created=false；planner 无权 retry。a-orch-2 已把
  // room-1 的 active orchestrator 替换为 human-2，因此后续 orchestrator 命令用 HUMAN_2。
  assert.equal(
    service.createRoleAssignment(makeRoleAssignment({ assignment_id: 'a-x', role: 'worker', participant_id: 'claude-code-cli' }), HUMAN_2).created,
    true,
  );
  const retried = service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-x', role: 'worker', participant_id: 'claude-code-cli' }),
    HUMAN_2,
  );
  assert.equal(retried.created, false);
  assert.equal(
    errCode(() =>
      service.createRoleAssignment(
        makeRoleAssignment({ assignment_id: 'a-x', role: 'worker', participant_id: 'claude-code-cli' }),
        PLANNER,
      ),
    ),
    'actor_not_allowed',
  );
});

// ---- Increment 9 Fix Task 2 regressions ----

// Fix inc9-fr2-2：acceptReview 按 Review 提交时冻结的 reviewer identity 授权，不重新解析
// Room default 或 current Task assignment。replacement 与 Room default reviewer 均被拒且
// Review/Room/Event 零变化；disabled 冻结 reviewer 必须 re-enable 后恢复（与冻结 Run
// authority 语义一致）。
test('acceptReview authorizes the frozen task-scope reviewer; replacement and room default reviewers are rejected', () => {
  const { service } = makeService();
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask(), PLANNER); // task-1, PLAN_READY
  // task-scope reviewer-2 在 Review 提交前成为 active → review-1 固化 reviewer-2。
  service.registerParticipant(
    makeParticipant({ participant_id: 'reviewer-2', kind: 'agent', provider: 'codex', adapter_id: 'codex_app', capabilities: ['reviewing'] }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-r2', scope_type: 'task', scope_id: 'task-1', role: 'reviewer', participant_id: 'reviewer-2' }),
    ORCHESTRATOR,
  );
  service.startRun(makeRun(), EXECUTOR);
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence(), EXECUTOR); // REVIEW_REQUIRED
  const REVIEWER_2 = { participant_id: 'reviewer-2', actor_role: 'reviewer' as const };
  service.submitReview(makeReview({ reviewer_participant_id: 'reviewer-2' }), REVIEWER_2); // REVIEW_DISCUSSION
  // 替换 task-scope reviewer → reviewer-3；Room default reviewer 仍是 codex-app。
  service.registerParticipant(
    makeParticipant({ participant_id: 'reviewer-3', kind: 'agent', provider: 'codex', adapter_id: 'codex_app', capabilities: ['reviewing'] }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-r3', scope_type: 'task', scope_id: 'task-1', role: 'reviewer', participant_id: 'reviewer-3' }),
    ORCHESTRATOR,
  );
  const REVIEWER_3 = { participant_id: 'reviewer-3', actor_role: 'reviewer' as const };
  const eventsBefore = service.listEvents('room-1').length;

  // replacement reviewer 与 Room default reviewer 对该 Review 均被拒；Review/Room/Event 不变。
  assert.equal(errCode(() => service.acceptReview('review-1', true, REVIEWER_3)), 'actor_not_allowed');
  assert.equal(errCode(() => service.acceptReview('review-1', true, REVIEWER)), 'actor_not_allowed');
  assert.equal(service.getRoom('room-1')!.state, 'REVIEW_DISCUSSION');
  assert.equal(service.getReview('review-1')!.reviewer_participant_id, 'reviewer-2');
  assert.equal(service.listEvents('room-1').length, eventsBefore);

  // disabled 冻结 reviewer 被拒；re-enable 后恢复。
  service.setParticipantEnabled('reviewer-2', false, ORCHESTRATOR);
  assert.equal(errCode(() => service.acceptReview('review-1', true, REVIEWER_2)), 'actor_not_allowed');
  assert.equal(service.getRoom('room-1')!.state, 'REVIEW_DISCUSSION');
  service.setParticipantEnabled('reviewer-2', true, ORCHESTRATOR);
  const accepted = service.acceptReview('review-1', true, REVIEWER_2);
  assert.equal(accepted.room.state, 'ACCEPTED');
  assert.equal(service.getReview('review-1')!.reviewer_participant_id, 'reviewer-2');
});

// Fix inc9-fr2-3：assignment replacement 后，Task/Run/Review same-ID same-content retry 由
// 冻结提交 identity 认证（created=false、零 Event）；replacement actor 被拒、different
// content 仍 id_conflict；新 Task 继续消费 replacement 后的 current assignment，历史不改写。
test('same-ID Task/Run/Review retries authenticate the frozen submit identity after assignment replacement', () => {
  const { service } = makeService();
  toCoding(service); // task-1（planner codex-app）已提交、run-1 running（默认 worker/executor）
  // 注册并替换 planner/worker/executor 三类 assignment（reviewer 在 review-1 固化后再替换）。
  service.registerParticipant(
    makeParticipant({ participant_id: 'planner-2', kind: 'agent', provider: 'codex', adapter_id: 'codex_app', capabilities: ['planning'] }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-planner-2', role: 'planner', participant_id: 'planner-2' }),
    ORCHESTRATOR,
  );
  service.registerParticipant(
    makeParticipant({ participant_id: 'worker-2', kind: 'agent', provider: 'anthropic', adapter_id: 'claude_code_cli', capabilities: ['coding', 'questioning'] }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-worker-2', role: 'worker', participant_id: 'worker-2' }),
    ORCHESTRATOR,
  );
  service.registerParticipant(
    makeParticipant({ participant_id: 'runner-2', kind: 'service', provider: 'local', adapter_id: 'local_runner', capabilities: ['execution'] }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-executor-2', role: 'executor', participant_id: 'runner-2' }),
    ORCHESTRATOR,
  );
  const PLANNER_2 = { participant_id: 'planner-2', actor_role: 'planner' as const };
  const RUNNER_2 = { participant_id: 'runner-2', actor_role: 'executor' as const };
  const eventsBefore = service.listEvents('room-1').length;

  // Task retry：冻结 planner 同 content → created=false；replacement planner 被拒；
  // different content → id_conflict。全部零 Event 且历史 identity 不被改写。
  assert.equal(service.submitTask(makeTask(), PLANNER).created, false);
  assert.equal(service.listEvents('room-1').length, eventsBefore);
  assert.equal(service.getRoom('room-1')!.state, 'CODING');
  assert.equal(errCode(() => service.submitTask(makeTask(), PLANNER_2)), 'actor_not_allowed');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
  assert.equal(errCode(() => service.submitTask(makeTask({ background: 'other' }), PLANNER)), 'id_conflict');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
  assert.equal(service.getRoom('room-1')!.state, 'CODING');
  assert.equal(service.getTask('task-1')!.planner_participant_id, 'codex-app');

  // Run retry：冻结 executor 同 content → created=false；replacement executor 被拒；
  // different content → id_conflict。
  assert.equal(service.startRun(makeRun(), EXECUTOR).created, false);
  assert.equal(service.listEvents('room-1').length, eventsBefore);
  assert.equal(service.getRoom('room-1')!.state, 'CODING');
  assert.equal(errCode(() => service.startRun(makeRun(), RUNNER_2)), 'actor_not_allowed');
  assert.equal(errCode(() => service.startRun(makeRun({ baseline_head: 'other' }), EXECUTOR)), 'id_conflict');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
  assert.equal(service.getRoom('room-1')!.state, 'CODING');
  assert.equal(service.getRun('run-1')!.executor_participant_id, 'local-runner');

  // 冻结 executor 仍可 complete（Fix inc9-r1）；review-1 在替换 reviewer 前提交以固化 codex-app。
  service.completeRun('run-1', makeCodingResult(), makeTerminalEvidence(), EXECUTOR); // REVIEW_REQUIRED
  const reviewContent: Partial<Review> = { decision: 'changes_requested', findings: [makeFinding()] };
  service.submitReview(makeReview(reviewContent), REVIEWER); // REVIEW_DISCUSSION
  service.registerParticipant(
    makeParticipant({ participant_id: 'reviewer-2', kind: 'agent', provider: 'codex', adapter_id: 'codex_app', capabilities: ['reviewing'] }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-reviewer-2', role: 'reviewer', participant_id: 'reviewer-2' }),
    ORCHESTRATOR,
  );
  const REVIEWER_2 = { participant_id: 'reviewer-2', actor_role: 'reviewer' as const };
  const eventsAfterReview = service.listEvents('room-1').length;

  // Review retry：冻结 reviewer 同 content → created=false；replacement reviewer 被拒；
  // different content → id_conflict。
  assert.equal(service.submitReview(makeReview(reviewContent), REVIEWER).created, false);
  assert.equal(service.listEvents('room-1').length, eventsAfterReview);
  assert.equal(service.getRoom('room-1')!.state, 'REVIEW_DISCUSSION');
  assert.equal(errCode(() => service.submitReview(makeReview(reviewContent), REVIEWER_2)), 'actor_not_allowed');
  assert.equal(
    errCode(() => service.submitReview(makeReview({ ...reviewContent, open_questions: ['q'] }), REVIEWER)),
    'id_conflict',
  );
  assert.equal(service.listEvents('room-1').length, eventsAfterReview);
  assert.equal(service.getRoom('room-1')!.state, 'REVIEW_DISCUSSION');
  assert.equal(service.getReview('review-1')!.reviewer_participant_id, 'codex-app');

  // 新 Task 继续消费 replacement 后的 current assignment：fix task-2 由 planner-2 提交并
  // 固化 identity；被替换的冻结 planner codex-app 不能接管新实体，历史 task-1 不被改写。
  assert.equal(
    errCode(() => service.submitTask(makeFixTask({ task_id: 'task-2', parent_task_id: 'task-1', based_on_review_id: 'review-1' }), PLANNER)),
    'actor_not_allowed',
  );
  const fix = service.submitTask(
    makeFixTask({ task_id: 'task-2', parent_task_id: 'task-1', based_on_review_id: 'review-1' }),
    PLANNER_2,
  );
  assert.equal(fix.created, true);
  assert.equal(fix.room.state, 'FIX_PLAN_READY');
  assert.equal(service.getTask('task-2')!.planner_participant_id, 'planner-2');
  assert.equal(service.getTask('task-2')!.orchestrator_participant_id, 'codex-app');
  assert.equal(service.getTask('task-1')!.planner_participant_id, 'codex-app');
});

// Fix inc9-fr2-4：Participant 管理只认可 active latest orchestrator assignment。被新
// assignment 替换的 historical orchestrator 的三个管理 public path 全部被拒且零写入；
// active orchestrator 继续成功；重新成为 active 后 authority 恢复。
test('replaced historical orchestrator loses participant management authority until it becomes active again', () => {
  const { service } = makeService();
  toPlanReady(service);
  const human2 = { participant_id: 'human-2', kind: 'human' as const, provider: 'local', adapter_id: 'human', capabilities: ['supervising'] };
  service.registerParticipant(makeParticipant(human2), ORCHESTRATOR);
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-orch-2', role: 'orchestrator', participant_id: 'human-2' }),
    ORCHESTRATOR,
  );
  const HUMAN_2 = { participant_id: 'human-2', actor_role: 'orchestrator' as const };
  const eventsBefore = service.listEvents('room-1').length;
  const planner2 = { participant_id: 'p2', kind: 'agent' as const, provider: 'codex', adapter_id: 'codex_app', capabilities: ['planning'] };

  // historical codex-app 的三个管理 public path 全部被拒且零写入。
  assert.equal(errCode(() => service.registerParticipant(makeParticipant(planner2), ORCHESTRATOR)), 'actor_not_allowed');
  assert.equal(errCode(() => service.setParticipantEnabled('claude-code-cli', false, ORCHESTRATOR)), 'actor_not_allowed');
  assert.equal(
    errCode(() =>
      service.createRoleAssignment(makeRoleAssignment({ assignment_id: 'a-x', role: 'worker', participant_id: 'claude-code-cli' }), ORCHESTRATOR),
    ),
    'actor_not_allowed',
  );
  assert.equal(service.getParticipant('p2'), null);
  assert.equal(service.getParticipant('claude-code-cli')!.enabled, true);
  assert.equal(service.getRoleAssignment('a-x'), null);
  assert.equal(service.listEvents('room-1').length, eventsBefore);

  // active human-2 继续成功。
  assert.equal(service.registerParticipant(makeParticipant(planner2), HUMAN_2).created, true);

  // human-2 被 human-3 替换后同样失去 authority；human-2 重新成为 active 后恢复。
  const human3 = { participant_id: 'human-3', kind: 'human' as const, provider: 'local', adapter_id: 'human', capabilities: ['supervising'] };
  service.registerParticipant(makeParticipant(human3), HUMAN_2);
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-orch-3', role: 'orchestrator', participant_id: 'human-3' }),
    HUMAN_2,
  );
  const HUMAN_3 = { participant_id: 'human-3', actor_role: 'orchestrator' as const };
  const planner3 = { participant_id: 'p3', kind: 'agent' as const, provider: 'codex', adapter_id: 'codex_app', capabilities: ['planning'] };
  assert.equal(errCode(() => service.registerParticipant(makeParticipant(planner3), HUMAN_2)), 'actor_not_allowed');
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-orch-4', role: 'orchestrator', participant_id: 'human-2' }),
    HUMAN_3,
  );
  assert.equal(service.registerParticipant(makeParticipant(planner3), HUMAN_2).created, true);
});
