import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { RoomService } from '../src/room/room-service.ts';
import { getRoomStateSnapshot } from '../src/room/state-snapshot.ts';
import {
  EXECUTOR,
  makeAttemptSettle,
  makeCodingResult,
  makeFinding,
  makeFixTask,
  makeQuestion,
  makeReview,
  makeTask,
  PLANNER,
  REVIEWER,
  WORKER,
} from './fixtures.ts';

// 共享只读 Room state snapshot boundary 的回归测试：cursor、planning waiting actor、
// per-Run run_work_items 与 reference 推导都由 RoomService 既有 read method 提供，测试侧
// 只驱动公开 application operation，不直接访问 repository/SQLite。v0.4 无单一 current
// entity authority：work items 是 per-Run derived 视图。
const WORKTREE_A = 'D:\\agent\\case\\project-a';
const WORKTREE_B = 'D:\\agent\\case\\project-b';

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
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
}

function toReady(service: RoomService): void {
  toWaiting(service);
  service.submitTask(makeTask(), PLANNER);
}

function claim(
  service: RoomService,
  runId = 'run-1',
  attemptId = 'attempt-1',
  worktree = WORKTREE_A,
): void {
  service.claimRunAttempt(
    {
      attempt_id: attemptId,
      run_id: runId,
      room_id: 'room-1',
      worktree_path: worktree,
    },
    EXECUTOR,
  );
}

function settleSucceeded(service: RoomService, attemptId = 'attempt-1'): void {
  service.settleRunAttempt(
    makeAttemptSettle({
      attempt_id: attemptId,
      status: 'succeeded',
      result: makeCodingResult(),
      process_exit_code: 0,
    }),
    EXECUTOR,
  );
}

function settleNeedsDecision(service: RoomService, attemptId = 'attempt-1'): void {
  service.settleRunAttempt(
    makeAttemptSettle({
      attempt_id: attemptId,
      status: 'needs_decision',
      result: makeCodingResult({ status: 'needs_decision' }),
      process_exit_code: 0,
    }),
    EXECUTOR,
  );
}

test('snapshot of a missing room returns entity_not_found', () => {
  const { service } = makeService();
  assert.equal(errCode(() => snap(service, 'missing')), 'entity_not_found');
});

test('freshly created room: one event, planner waiting, no work items, bootstrap profiles', () => {
  const { service } = makeService();
  service.createRoom('room-1', PLANNER);
  const s = snap(service);
  assert.equal(s.room.state, 'DISCUSSION');
  assert.equal(s.planning_waiting_actor, 'planner');
  assert.equal(s.cursor, 1);
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].sequence, 1);
  assert.deepEqual(s.run_work_items, []);
  // snapshot 返回 bootstrap 的稳定 participants/role_assignments 数组（room-scoped）。
  // operator 保留 human profile 但无 assignment（Fix inc9-r4），不属于 room member。
  assert.deepEqual(
    s.participants.map((p) => p.participant_id).sort(),
    ['claude-code-cli', 'codex-app', 'local-runner'],
  );
  assert.equal(s.role_assignments.length, 6);
  assert.deepEqual(
    s.role_assignments.map((a) => `${a.role}:${a.participant_id}`).sort(),
    [
      'executor:local-runner',
      'git_controller:local-runner',
      'orchestrator:codex-app',
      'planner:codex-app',
      'reviewer:codex-app',
      'worker:claude-code-cli',
    ],
  );
});

test('cursor is the max event sequence; events respect after_sequence', () => {
  const { service } = makeService();
  toReady(service); // room_created, state_transition, state_transition, run_created, task_submitted
  const all = snap(service);
  assert.equal(all.cursor, 5);
  assert.deepEqual(all.events.map((e) => e.sequence), [1, 2, 3, 4, 5]);

  const after2 = snap(service, 'room-1', 2);
  assert.equal(after2.cursor, 5);
  assert.deepEqual(after2.events.map((e) => e.sequence), [3, 4, 5]);

  assert.deepEqual(snap(service, 'room-1', 5).events, []);
  assert.equal(snap(service, 'room-1', null).events.length, 5);
});

test('a ready Run yields one work item waiting on executor with no attempt reference yet', () => {
  const { service } = makeService();
  toReady(service);
  const s = snap(service);
  assert.equal(s.run_work_items.length, 1);
  assert.deepEqual(s.run_work_items[0], {
    run_id: 'run-1',
    run_status: 'ready',
    waiting_actor: 'executor',
    // Review finding inc10-r3：current task 从该 Run 的最新 persisted Task 推导，独立于
    // attempt —— initial-ready 已显示 Implementation Task，不等待首次 claim。
    current_task_id: 'task-1',
    current_attempt_id: null,
    current_question_id: null,
    current_review_id: null,
  });
});

test('planning_waiting_actor follows the planning-only Room state mapping', () => {
  const { service } = makeService();
  service.createRoom('room-1', PLANNER);
  assert.equal(snap(service).planning_waiting_actor, 'planner'); // DISCUSSION
  service.transitionToArchitectureReview('room-1', PLANNER);
  assert.equal(snap(service).planning_waiting_actor, 'planner'); // ARCHITECTURE_REVIEW
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  assert.equal(snap(service).planning_waiting_actor, 'user'); // WAITING_FOR_USER_CONFIRMATION
  service.submitTask(makeTask(), PLANNER);
  assert.equal(snap(service).planning_waiting_actor, 'planner'); // Room 回到 DISCUSSION
  const s = snap(service);
  assert.equal(s.run_work_items[0].run_status, 'ready');
});

test('work item follows the Run lifecycle: claim → review → fix → accepted', () => {
  const { service } = makeService();
  toReady(service);
  claim(service); // attempt-1 running
  let s = snap(service);
  assert.deepEqual(s.run_work_items[0], {
    run_id: 'run-1',
    run_status: 'running',
    waiting_actor: 'worker',
    current_task_id: 'task-1',
    current_attempt_id: 'attempt-1',
    current_question_id: null,
    current_review_id: null,
  });

  settleSucceeded(service); // REVIEW_REQUIRED
  s = snap(service);
  assert.equal(s.run_work_items[0].run_status, 'review_required');
  assert.equal(s.run_work_items[0].waiting_actor, 'reviewer');

  service.submitReview(
    makeReview({ decision: 'changes_requested', findings: [makeFinding()] }),
    REVIEWER,
  );
  s = snap(service);
  assert.equal(s.run_work_items[0].run_status, 'review_discussion');
  assert.equal(s.run_work_items[0].waiting_actor, 'user');
  assert.equal(s.run_work_items[0].current_review_id, 'review-1');

  service.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', run_id: 'run-1' }),
    PLANNER,
  );
  s = snap(service);
  assert.equal(s.run_work_items[0].run_status, 'ready');
  assert.equal(s.run_work_items[0].waiting_actor, 'executor');
  assert.equal(s.run_work_items[0].current_review_id, 'review-1'); // 历史 reference 保留
  // fix-ready（claim 前）：current task 已从 latest Task 推导为 Fix Task，attempt reference
  // 仍指向已 settled 的 attempt-1。
  assert.equal(s.run_work_items[0].current_task_id, 'task-2');
  assert.equal(s.run_work_items[0].current_attempt_id, 'attempt-1');

  claim(service, 'run-1', 'attempt-2');
  // canonical evidence（Review finding inc10-r2）：attempt-2 的 current task 是 fix task-2，
  // succeeded result 必须同 task。
  service.settleRunAttempt(
    makeAttemptSettle({
      attempt_id: 'attempt-2',
      status: 'succeeded',
      result: makeCodingResult({ task_id: 'task-2' }),
      process_exit_code: 0,
    }),
    EXECUTOR,
  );
  s = snap(service);
  assert.equal(s.run_work_items[0].run_status, 'review_required');
  assert.equal(s.run_work_items[0].current_task_id, 'task-2'); // fix Task 是当前 Task
  assert.equal(s.run_work_items[0].current_attempt_id, 'attempt-2');

  service.submitReview(
    makeReview({ review_id: 'review-2', attempt_id: 'attempt-2', task_id: 'task-2' }),
    REVIEWER,
  );
  service.acceptReview('review-2', true, REVIEWER);
  s = snap(service);
  assert.equal(s.run_work_items[0].run_status, 'accepted');
  assert.equal(s.run_work_items[0].waiting_actor, null);
});

test('question binds to the active attempt: decision_requested → needs_decision → answered resume', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  service.askQuestion(makeQuestion(), WORKER);
  let s = snap(service);
  // Question 已提出：attempt decision_requested，等待 executor 停止并 settle。
  assert.equal(s.run_work_items[0].run_status, 'running');
  assert.equal(s.run_work_items[0].waiting_actor, 'executor');
  assert.equal(s.run_work_items[0].current_question_id, 'question-1');

  settleNeedsDecision(service);
  s = snap(service);
  assert.equal(s.run_work_items[0].run_status, 'needs_decision');
  assert.equal(s.run_work_items[0].waiting_actor, 'user');
  assert.equal(s.run_work_items[0].current_question_id, 'question-1');

  service.answerQuestion('question-1', 'pick a', false, PLANNER);
  s = snap(service);
  assert.equal(s.run_work_items[0].run_status, 'ready');
  assert.equal(s.run_work_items[0].waiting_actor, 'executor');
  assert.equal(s.run_work_items[0].current_question_id, null); // answered Question 不再 open
});

test('scope-changing answer moves the Room to planning confirmation and keeps the Run needs_decision', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  service.askQuestion(makeQuestion(), WORKER);
  settleNeedsDecision(service);
  service.answerQuestion('question-1', 'change the scope', true, PLANNER);
  const s = snap(service);
  assert.equal(s.room.state, 'WAITING_FOR_USER_CONFIRMATION');
  assert.equal(s.planning_waiting_actor, 'user');
  assert.equal(s.run_work_items[0].run_status, 'needs_decision');
  assert.equal(s.run_work_items[0].waiting_actor, 'user');
});

test('run_work_items is stably sorted by (created_at, run_id) and per-Run references do not leak', () => {
  const { service } = makeService();
  // run-1 完整走到 accepted（释放 worktree lease）。
  toReady(service);
  claim(service, 'run-1', 'attempt-1', WORKTREE_A);
  settleSucceeded(service, 'attempt-1');
  service.submitReview(makeReview({ review_id: 'review-1' }), REVIEWER);
  service.acceptReview('review-1', true, REVIEWER);
  // run-2 在第二个 planning round 提交并进入 review_discussion。
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask({ task_id: 'task-2', run_id: 'run-2' }), PLANNER);
  claim(service, 'run-2', 'attempt-2', WORKTREE_B);
  // canonical evidence（Review finding inc10-r2）：attempt-2 属于 task-2，succeeded result
  // 必须同 task；task-1 result 会被 validation_failed 拒绝。
  service.settleRunAttempt(
    makeAttemptSettle({
      attempt_id: 'attempt-2',
      status: 'succeeded',
      result: makeCodingResult({ task_id: 'task-2' }),
      process_exit_code: 0,
    }),
    EXECUTOR,
  );
  service.submitReview(
    makeReview({ review_id: 'review-2', task_id: 'task-2', run_id: 'run-2', attempt_id: 'attempt-2' }),
    REVIEWER,
  );

  const s = snap(service);
  assert.equal(s.run_work_items.length, 2);
  // 稳定排序 oracle：测试侧独立重排，不导入实现排序 helper。
  const expectedOrder = s.runs
    .slice()
    .sort((a, b) => {
      if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
      return a.run_id < b.run_id ? -1 : a.run_id > b.run_id ? 1 : 0;
    })
    .map((r) => r.run_id);
  assert.deepEqual(s.run_work_items.map((w) => w.run_id), expectedOrder);

  const run1 = s.run_work_items.find((w) => w.run_id === 'run-1');
  const run2 = s.run_work_items.find((w) => w.run_id === 'run-2');
  assert.equal(run1?.run_status, 'accepted');
  assert.equal(run1?.waiting_actor, null);
  assert.equal(run1?.current_review_id, 'review-1');
  assert.equal(run2?.run_status, 'review_discussion');
  assert.equal(run2?.waiting_actor, 'user');
  assert.equal(run2?.current_review_id, 'review-2'); // review-2 不泄漏进 run-1
  assert.equal(run2?.current_task_id, 'task-2');
});

test('snapshot arrays list persisted task/run/attempt/question/review identities', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  service.askQuestion(makeQuestion(), WORKER);
  settleNeedsDecision(service);
  service.answerQuestion('question-1', 'pick a', false, PLANNER);
  const s = snap(service);
  assert.deepEqual(s.tasks.map((t) => t.task_id), ['task-1']);
  assert.deepEqual(s.runs.map((r) => r.run_id), ['run-1']);
  assert.deepEqual(s.attempts.map((a) => a.attempt_id), ['attempt-1']);
  assert.deepEqual(s.questions.map((q) => q.question_id), ['question-1']);
  assert.deepEqual(s.reviews, []);
  assert.deepEqual(s.run_guidance, []);
});

test('run guidance is listed and consumed by the next claim', () => {
  const { service } = makeService();
  toReady(service);
  service.addRunGuidance(
    { guidance_id: 'g-1', room_id: 'room-1', run_id: 'run-1', text: 'prefer the repo helper' },
    PLANNER,
  );
  let s = snap(service);
  assert.equal(s.run_guidance.length, 1);
  assert.equal(s.run_guidance[0].guidance_id, 'g-1');
  assert.equal(s.run_guidance[0].consumed_by_attempt_id, null);

  claim(service);
  s = snap(service);
  assert.equal(s.run_guidance[0].consumed_by_attempt_id, 'attempt-1');
});
