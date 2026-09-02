import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoomService } from '../src/room/room-service.ts';
import {
  EXECUTOR,
  makeAttemptSettle,
  makeCodingResult,
  makeFinding,
  makeFixTask,
  makeParticipant,
  makeQuestion,
  makeReview,
  makeRoleAssignment,
  makeTask,
  ORCHESTRATOR,
  PLANNER,
  REVIEWER,
  WORKER,
  type AttemptSettleInput,
} from './fixtures.ts';

// v0.4 actor literal：与默认 bootstrap assignment 一致（测试侧独立 literal，不导入实现）。
// codex-app 是 single control orchestrator 兼 planner/reviewer（Fix inc9-r4）。
// operator 只保留 human profile，无 active assignment：任何 command 都必须被拒。
const OPERATOR = { participant_id: 'operator', actor_role: 'orchestrator' as const };

// 独立 literal 的 claim/settle 默认值：worktree 是 claim 的 caller-owned 输入。
const WORKTREE = 'D:\\agent\\case\\project';

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

function toReady(service: RoomService): void {
  toWaiting(service);
  service.submitTask(makeTask(), PLANNER);
}

function claim(
  service: RoomService,
  overrides: { attempt_id?: string; run_id?: string; worktree_path?: string } = {},
): void {
  service.claimRunAttempt(
    {
      attempt_id: overrides.attempt_id ?? 'attempt-1',
      run_id: overrides.run_id ?? 'run-1',
      room_id: 'room-1',
      worktree_path: overrides.worktree_path ?? WORKTREE,
    },
    EXECUTOR,
  );
}

function settle(service: RoomService, overrides: Partial<AttemptSettleInput> = {}): void {
  service.settleRunAttempt(
    makeAttemptSettle({
      attempt_id: 'attempt-1',
      ...overrides,
    }),
    EXECUTOR,
  );
}

// 完整 Implementation → Review(changes_requested) → Fix Task 链路，使 Run 回到 ready 且
// current Task 为 fix task-2，用于验证 Fix Task 附着与下一 attempt 的 lineage 语义。
function toFixReady(service: RoomService): void {
  toReady(service);
  claim(service); // attempt-1 running
  settle(service, { status: 'succeeded', result: makeCodingResult(), process_exit_code: 0 }); // review_required
  service.submitReview(
    makeReview({ decision: 'changes_requested', findings: [makeFinding()] }),
    REVIEWER,
  ); // review_discussion
  service.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', run_id: 'run-1' }),
    PLANNER,
  ); // run-1 ready, current task = task-2
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

test('createRoom bootstraps the three room-member participants and six room-scope assignments', () => {
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
  assert.equal(assignments.length, 6);
  assert.deepEqual(
    assignments.map((a) => `${a.role}:${a.participant_id}`).sort(),
    [
      'executor:local-runner',
      'git_controller:local-runner',
      'orchestrator:codex-app',
      'planner:codex-app',
      'reviewer:codex-app',
      'worker:claude-code-cli',
    ],
  );
  assert.deepEqual(assignments.map((a) => a.scope_type), ['room', 'room', 'room', 'room', 'room', 'room']);
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

test('submitTask (implementation) atomically creates a ready Run and returns the Room to DISCUSSION', () => {
  const { service } = makeService();
  toWaiting(service);
  const eventsBefore = service.listEvents('room-1').length;
  const { room, task, run, created } = service.submitTask(makeTask(), PLANNER);
  assert.equal(created, true);
  assert.equal(room.state, 'DISCUSSION'); // planning-only：execution 生命周期归 Run
  assert.equal(task.goal, 'goal');
  assert.equal(service.getTask('task-1')?.task_id, 'task-1');
  // 原子创建的 ready Run：worker 冻结、worktree 尚未冻结、无 accepted_at。
  assert.equal(run.run_id, 'run-1');
  assert.equal(run.root_task_id, 'task-1');
  assert.equal(run.status, 'ready');
  assert.equal(run.worker_participant_id, 'claude-code-cli');
  assert.equal(run.worktree_path, null);
  assert.equal(run.accepted_at, null);
  assert.equal(service.getRun('run-1')!.status, 'ready');
  // 恰好两个新 Event：run_created + task_submitted。
  const events = service.listEvents('room-1');
  assert.equal(events.length, eventsBefore + 2);
  assert.equal(events[events.length - 2].type, 'run_created');
  assert.equal(events[events.length - 1].type, 'task_submitted');
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

test('submitTask (implementation) outside WAITING_FOR_USER_CONFIRMATION fails with no partial write', () => {
  const { service } = makeService();
  service.createRoom('room-1', PLANNER); // DISCUSSION
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(errCode(() => service.submitTask(makeTask(), PLANNER)), 'validation_failed');
  assert.equal(service.getTask('task-1'), null);
  assert.equal(service.getRun('run-1'), null);
  assert.equal(service.getRoom('room-1')!.state, 'DISCUSSION');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

test('submitTask same-ID retry returns the existing Run with created=false and zero events; different content id_conflicts', () => {
  const { service } = makeService();
  toWaiting(service);
  const first = service.submitTask(makeTask(), PLANNER);
  assert.equal(first.created, true);
  const eventsAfterFirst = service.listEvents('room-1').length;
  const second = service.submitTask(makeTask(), PLANNER);
  assert.equal(second.created, false);
  assert.equal(second.task.goal, 'goal');
  assert.equal(second.run.run_id, 'run-1');
  assert.equal(service.listEvents('room-1').length, eventsAfterFirst);
  assert.equal(errCode(() => service.submitTask(makeTask({ goal: 'changed' }), PLANNER)), 'id_conflict');
  assert.equal(service.listEvents('room-1').length, eventsAfterFirst);
});

test('fix task gates: the run must be review_discussion and the parent task must exist', () => {
  const { service } = makeService();
  toReady(service);
  // run-1 仍是 ready：fix 的 status gate 先于 parent 校验。
  assert.equal(
    errCode(() => service.submitTask(makeFixTask({ task_id: 'task-2' }), PLANNER)),
    'validation_failed',
  );
  assert.equal(service.getTask('task-2'), null);
  assert.equal(service.getRun('run-1')!.status, 'ready');

  // review_discussion 后：missing parent → entity_not_found，零写入。
  claim(service);
  settle(service, { status: 'succeeded', result: makeCodingResult(), process_exit_code: 0 });
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER);
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(
    errCode(() => service.submitTask(makeFixTask({ task_id: 'task-2', parent_task_id: 'missing' }), PLANNER)),
    'entity_not_found',
  );
  assert.equal(service.getTask('task-2'), null);
  assert.equal(service.getRun('run-1')!.status, 'review_discussion');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

// ---- claim ----

test('claimRunAttempt freezes the canonical worktree, creates attempt #1 and moves the Run to running', () => {
  const { service } = makeService();
  toReady(service);
  const eventsBefore = service.listEvents('room-1').length;
  const { run, attempt, guidance, created } = service.claimRunAttempt(
    {
      attempt_id: 'attempt-1',
      run_id: 'run-1',
      room_id: 'room-1',
      worktree_path: WORKTREE,
    },
    EXECUTOR,
  );
  assert.equal(created, true);
  assert.equal(run.status, 'running');
  assert.equal(run.worktree_path, WORKTREE); // 首 attempt 冻结
  assert.equal(attempt.attempt_no, 1);
  assert.equal(attempt.status, 'running');
  assert.equal(attempt.worker_participant_id, 'claude-code-cli');
  assert.equal(attempt.executor_participant_id, 'local-runner');
  assert.equal(attempt.task_id, 'task-1');
  assert.equal(attempt.worktree_path, WORKTREE);
  assert.deepEqual(guidance, []);
  assert.equal(service.getRoom('room-1')!.state, 'DISCUSSION'); // Room 保持 planning-only
  const events = service.listEvents('room-1');
  assert.equal(events.length, eventsBefore + 1);
  assert.equal(events[events.length - 1].type, 'run_attempt_claimed');
  assert.equal(events[events.length - 1].entity_id, 'attempt-1');
});

test('claimRunAttempt rejects a run that is not ready or already has an active attempt', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  // 已有 active attempt：run_already_active。
  assert.equal(
    errCode(() => service.claimRunAttempt({ attempt_id: 'attempt-2', run_id: 'run-1', room_id: 'room-1', worktree_path: WORKTREE }, EXECUTOR)),
    'run_already_active',
  );
  assert.equal(service.getAttempt('attempt-2'), null);
  // Run 离开 ready 后同样拒绝（settle failed 后不经 retry 直接 claim）。
  const s2 = makeService().service;
  toReady(s2);
  claim(s2);
  settle(s2, { status: 'failed', result: null, failure: { code: 'claude_exit_failed', message: 'boom' }, process_exit_code: 1 });
  assert.equal(
    errCode(() => s2.claimRunAttempt({ attempt_id: 'attempt-2', run_id: 'run-1', room_id: 'room-1', worktree_path: WORKTREE }, EXECUTOR)),
    'validation_failed',
  );
});

test('claimRunAttempt rejects a non-executor actor with no partial write', () => {
  const { service } = makeService();
  toReady(service);
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(
    errCode(() => service.claimRunAttempt({ attempt_id: 'attempt-1', run_id: 'run-1', room_id: 'room-1', worktree_path: WORKTREE }, WORKER)),
    'actor_not_allowed',
  );
  assert.equal(service.getAttempt('attempt-1'), null);
  assert.equal(service.getRun('run-1')!.status, 'ready');
  assert.equal(service.getRun('run-1')!.worktree_path, null);
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

test('later attempts must reuse the frozen canonical worktree', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  settle(service, { status: 'succeeded', result: makeCodingResult(), process_exit_code: 0 });
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER);
  service.submitTask(makeFixTask({ task_id: 'task-2', room_id: 'room-1', run_id: 'run-1' }), PLANNER); // ready
  // 相同 canonical worktree：attempt #2 成功。
  const second = service.claimRunAttempt(
    { attempt_id: 'attempt-2', run_id: 'run-1', room_id: 'room-1', worktree_path: WORKTREE },
    EXECUTOR,
  );
  assert.equal(second.created, true);
  assert.equal(second.attempt.attempt_no, 2);
  assert.equal(second.attempt.task_id, 'task-2'); // fix Task 是当前 Task
  // 不同 worktree：validation_failed 且 rollback；随后同 worktree 仍可成功。
  const s2 = makeService().service;
  toReady(s2);
  claim(s2);
  settle(s2, { status: 'failed', result: null, failure: { code: 'claude_exit_failed', message: 'boom' }, process_exit_code: 1 });
  s2.retryRun('room-1', 'run-1', PLANNER);
  assert.equal(
    errCode(() => s2.claimRunAttempt({ attempt_id: 'attempt-2', run_id: 'run-1', room_id: 'room-1', worktree_path: 'D:\\other' }, EXECUTOR)),
    'validation_failed',
  );
  assert.equal(s2.getAttempt('attempt-2'), null);
  const retried = s2.claimRunAttempt(
    { attempt_id: 'attempt-2', run_id: 'run-1', room_id: 'room-1', worktree_path: WORKTREE },
    EXECUTOR,
  );
  assert.equal(retried.created, true);
});

test('claimRunAttempt same-ID retry is idempotent; different payload conflicts', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  const beforeRetry = snapshot(service);
  const retry = service.claimRunAttempt(
    { attempt_id: 'attempt-1', run_id: 'run-1', room_id: 'room-1', worktree_path: WORKTREE },
    EXECUTOR,
  );
  assert.equal(retry.created, false);
  assert.equal(retry.attempt.attempt_no, 1);
  assert.deepEqual(snapshot(service), beforeRetry, 'same-ID retry must not change durable state');
  const beforeConflict = snapshot(service);
  assert.equal(
    errCode(() => service.claimRunAttempt({ attempt_id: 'attempt-1', run_id: 'run-1', room_id: 'room-1', worktree_path: 'D:\\other' }, EXECUTOR)),
    'id_conflict',
  );
  assert.deepEqual(snapshot(service), beforeConflict, 'same-ID content conflict must not change durable state');
});

test('claimRunAttempt rejects a worker whose adapter is not available (worker_adapter_unavailable, zero writes)', () => {
  const { service } = makeService();
  toWaiting(service);
  // 注册 provider-neutral worker（adapter 非 claude_code_cli）并替换 room default worker。
  service.registerParticipant(
    makeParticipant({
      participant_id: 'worker-x',
      kind: 'agent',
      provider: 'other',
      adapter_id: 'other_agent',
      capabilities: ['coding', 'questioning'],
    }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-worker-x', room_id: 'room-1', role: 'worker', participant_id: 'worker-x' }),
    ORCHESTRATOR,
  );
  service.submitTask(makeTask(), PLANNER);
  assert.equal(service.getRun('run-1')!.worker_participant_id, 'worker-x'); // worker assignment 允许 provider-neutral
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(
    errCode(() => service.claimRunAttempt({ attempt_id: 'attempt-1', run_id: 'run-1', room_id: 'room-1', worktree_path: WORKTREE }, EXECUTOR)),
    'worker_adapter_unavailable',
  );
  assert.equal(service.getAttempt('attempt-1'), null);
  assert.equal(service.getRun('run-1')!.status, 'ready');
  assert.equal(service.getRun('run-1')!.worktree_path, null); // 未冻结
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

// ---- settlement ----

test('settleRunAttempt succeeded stores evidence and moves the Run to review_required', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  const evidence = {
    agent_session_ref: 'sess-1',
    process_exit_code: 0,
    git_evidence: { staged: ['a.txt'], unstaged: ['b.txt'], untracked: ['c.txt'] },
    artifact_refs: ['.agent-room/artifacts/attempt-1/stdout.jsonl', '.agent-room/artifacts/attempt-1/stderr.log'],
  };
  const { run, attempt } = service.settleRunAttempt(
    makeAttemptSettle({ attempt_id: 'attempt-1', status: 'succeeded', result: makeCodingResult(), ...evidence }),
    EXECUTOR,
  );
  assert.equal(attempt.status, 'succeeded');
  assert.equal(attempt.settled_at !== null, true);
  assert.equal(attempt.agent_session_ref, 'sess-1');
  assert.equal(attempt.process_exit_code, 0);
  assert.deepEqual(attempt.git_evidence, evidence.git_evidence);
  assert.deepEqual(attempt.artifact_refs, evidence.artifact_refs);
  assert.equal(attempt.result?.status, 'completed');
  assert.equal(attempt.failure, null);
  assert.equal(run.status, 'review_required');
  const events = service.listEvents('room-1');
  assert.equal(events[events.length - 1].type, 'run_attempt_succeeded');
});

test('settleRunAttempt failed/interrupted move the Run to failed; retryRun returns it to ready', () => {
  const a = makeService().service;
  toReady(a);
  claim(a);
  const failed = a.settleRunAttempt(
    makeAttemptSettle({ attempt_id: 'attempt-1', status: 'failed', result: null, failure: { code: 'claude_exit_failed', message: 'boom' }, agent_session_ref: 'sess-1', process_exit_code: 7 }),
    EXECUTOR,
  );
  assert.equal(failed.attempt.status, 'failed');
  assert.equal(failed.attempt.failure?.code, 'claude_exit_failed');
  assert.equal(failed.run.status, 'failed');
  assert.equal(a.listEvents('room-1').at(-1)!.type, 'run_attempt_failed');
  const retried = a.retryRun('room-1', 'run-1', PLANNER);
  assert.equal(retried.run.status, 'ready');
  assert.equal(a.listEvents('room-1').at(-1)!.type, 'run_retried');

  const b = makeService().service;
  toReady(b);
  claim(b);
  const interrupted = b.settleRunAttempt(
    makeAttemptSettle({ attempt_id: 'attempt-1', status: 'interrupted', result: null, failure: { code: 'claude_exit_failed', message: 'interrupted' }, process_exit_code: null }),
    EXECUTOR,
  );
  assert.equal(interrupted.attempt.status, 'interrupted');
  assert.equal(interrupted.run.status, 'failed');
  assert.equal(b.listEvents('room-1').at(-1)!.type, 'run_attempt_failed');
  assert.equal(b.retryRun('room-1', 'run-1', PLANNER).run.status, 'ready');
});

test('settleRunAttempt needs_decision is only legal from decision_requested', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  // running → needs_decision 不在 transition 表：invalid_transition。
  assert.equal(
    errCode(() => settle(service, { status: 'needs_decision', result: makeCodingResult({ status: 'needs_decision' }), process_exit_code: 0 })),
    'invalid_transition',
  );
  // worker 提问 → decision_requested → executor settle needs_decision。
  service.askQuestion(makeQuestion(), WORKER);
  const settled = service.settleRunAttempt(
    makeAttemptSettle({ attempt_id: 'attempt-1', status: 'needs_decision', result: makeCodingResult({ status: 'needs_decision' }), agent_session_ref: 'sess-1', process_exit_code: 0 }),
    EXECUTOR,
  );
  assert.equal(settled.attempt.status, 'needs_decision');
  assert.equal(settled.run.status, 'needs_decision');
  assert.equal(service.listEvents('room-1').at(-1)!.type, 'run_attempt_needs_decision');
});

test('settleRunAttempt rejects a non-executor actor with no partial write', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(
    errCode(() => service.settleRunAttempt(makeAttemptSettle(), { participant_id: 'codex-app', actor_role: 'planner' as const })),
    'actor_not_allowed',
  );
  assert.equal(service.getAttempt('attempt-1')!.status, 'running');
  assert.equal(service.getRun('run-1')!.status, 'running');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

test('settleRunAttempt same-payload retry is idempotent; different payload id_conflicts', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  const input = makeAttemptSettle({ attempt_id: 'attempt-1', status: 'succeeded', result: makeCodingResult(), process_exit_code: 0 });
  service.settleRunAttempt(input, EXECUTOR);
  const eventsAfterFirst = service.listEvents('room-1').length;
  const retry = service.settleRunAttempt(input, EXECUTOR);
  assert.equal(retry.attempt.status, 'succeeded');
  assert.equal(service.listEvents('room-1').length, eventsAfterFirst); // 零 Event
  assert.equal(
    errCode(() => service.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-1', status: 'succeeded', result: makeCodingResult(), process_exit_code: 1 }), EXECUTOR)),
    'id_conflict',
  );
  assert.equal(service.getAttempt('attempt-1')!.process_exit_code, 0);
  assert.equal(service.listEvents('room-1').length, eventsAfterFirst);
});

// ---- terminal evidence validation (Review finding inc10-r2) ----
// terminal status 与持久化 result/failure 必须 canonical 一致：矛盾 evidence 在写入前以
// validation_failed 拒绝，完整 public durable snapshot 与调用前 deepEqual。行为 Oracle 来自
// Confirmed Fix 方案文本（测试侧独立 literal，不导入实现 helper）。

// 完整 public durable snapshot：只经 RoomService 公开 read method 读取，invalid settle 后
// 必须逐字段不变（room/tasks/runs/attempts/questions/reviews/guidance/events/cursor）。
function snapshot(service: RoomService): unknown {
  const events = service.listEvents('room-1');
  return {
    room: service.getRoom('room-1'),
    tasks: service.listTasks('room-1'),
    runs: service.listRuns('room-1'),
    attempts: service.listAttemptsByRoom('room-1'),
    questions: service.listQuestions('room-1'),
    reviews: service.listReviews('room-1'),
    guidance: service.listGuidanceByRoom('room-1'),
    participants: service.listRoomParticipants('room-1'),
    role_assignments: service.listRoleAssignments('room-1'),
    events,
    cursor: events.length === 0 ? 0 : events[events.length - 1].sequence,
  };
}

test('succeeded rejects null result, non-completed result, wrong task id and non-null failure with unchanged snapshot', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  const before = snapshot(service);
  const invalid = [
    makeAttemptSettle({ attempt_id: 'attempt-1', status: 'succeeded', result: null }),
    makeAttemptSettle({ attempt_id: 'attempt-1', status: 'succeeded', result: makeCodingResult({ status: 'blocked' }) }),
    makeAttemptSettle({ attempt_id: 'attempt-1', status: 'succeeded', result: makeCodingResult({ task_id: 'task-other' }) }),
    makeAttemptSettle({ attempt_id: 'attempt-1', status: 'succeeded', result: makeCodingResult(), failure: { code: 'x', message: 'y' } }),
  ];
  for (const input of invalid) {
    assert.equal(errCode(() => service.settleRunAttempt(input, EXECUTOR)), 'validation_failed');
    assert.deepEqual(snapshot(service), before, 'invalid succeeded evidence must leave the durable snapshot unchanged');
  }
  assert.equal(service.getAttempt('attempt-1')!.status, 'running');
  assert.equal(service.getRun('run-1')!.status, 'running');
});

test('failed/interrupted reject a result or missing failure evidence with unchanged snapshot', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  const before = snapshot(service);
  const invalid = [
    makeAttemptSettle({ attempt_id: 'attempt-1', status: 'failed', result: makeCodingResult(), failure: null, process_exit_code: 1 }),
    makeAttemptSettle({ attempt_id: 'attempt-1', status: 'failed', result: null, failure: null, process_exit_code: 1 }),
    makeAttemptSettle({ attempt_id: 'attempt-1', status: 'interrupted', result: makeCodingResult(), failure: null }),
  ];
  for (const input of invalid) {
    assert.equal(errCode(() => service.settleRunAttempt(input, EXECUTOR)), 'validation_failed');
    assert.deepEqual(snapshot(service), before, 'invalid failed/interrupted evidence must leave the durable snapshot unchanged');
  }
  // 合法 failed 仍可推进：evidence 校验不是死锁。
  const settled = service.settleRunAttempt(
    makeAttemptSettle({ attempt_id: 'attempt-1', status: 'failed', result: null, failure: { code: 'claude_exit_failed', message: 'boom' }, process_exit_code: 1 }),
    EXECUTOR,
  );
  assert.equal(settled.attempt.status, 'failed');
  assert.equal(settled.run.status, 'failed');
});

test('needs_decision rejects a mismatched result or a failure alongside a result with unchanged snapshot', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  service.askQuestion(makeQuestion(), WORKER);
  const before = snapshot(service);
  const invalid = [
    makeAttemptSettle({ attempt_id: 'attempt-1', status: 'needs_decision', result: makeCodingResult({ status: 'completed' }) }),
    makeAttemptSettle({ attempt_id: 'attempt-1', status: 'needs_decision', result: makeCodingResult({ status: 'needs_decision', task_id: 'task-other' }) }),
    makeAttemptSettle({ attempt_id: 'attempt-1', status: 'needs_decision', result: makeCodingResult({ status: 'needs_decision' }), failure: { code: 'x', message: 'y' } }),
  ];
  for (const input of invalid) {
    assert.equal(errCode(() => service.settleRunAttempt(input, EXECUTOR)), 'validation_failed');
    assert.deepEqual(snapshot(service), before, 'invalid needs_decision evidence must leave the durable snapshot unchanged');
  }
  assert.equal(service.getAttempt('attempt-1')!.status, 'decision_requested');
  // 合法 needs_decision result 仍可推进。
  const settled = service.settleRunAttempt(
    makeAttemptSettle({ attempt_id: 'attempt-1', status: 'needs_decision', result: makeCodingResult({ status: 'needs_decision' }), process_exit_code: 0 }),
    EXECUTOR,
  );
  assert.equal(settled.attempt.status, 'needs_decision');
  assert.equal(settled.run.status, 'needs_decision');
});

test('needs_decision rejects empty evidence (result=null and failure=null) with unchanged snapshot', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  service.askQuestion(makeQuestion(), WORKER);
  const before = snapshot(service);
  // null/null 不表达任何可接受 terminal 事实（Review finding inc10-fix1-r1）：必须以
  // validation_failed 拒绝，attempt 保持 decision_requested，完整 durable snapshot 不变。
  assert.equal(
    errCode(() =>
      service.settleRunAttempt(
        makeAttemptSettle({ attempt_id: 'attempt-1', status: 'needs_decision', result: null, process_exit_code: 0 }),
        EXECUTOR,
      ),
    ),
    'validation_failed',
  );
  assert.deepEqual(snapshot(service), before, 'empty needs_decision evidence must leave the durable snapshot unchanged');
  assert.equal(service.getAttempt('attempt-1')!.status, 'decision_requested');
  // union validation 不是死锁：拒绝后 pause-failure form 仍可合法推进并保留 open Question。
  const settled = service.settleRunAttempt(
    makeAttemptSettle({
      attempt_id: 'attempt-1',
      status: 'needs_decision',
      result: null,
      failure: { code: 'claude_exit_failed', message: 'exit 7' },
      process_exit_code: 7,
    }),
    EXECUTOR,
  );
  assert.equal(settled.attempt.status, 'needs_decision');
  assert.equal(settled.attempt.failure?.code, 'claude_exit_failed');
  assert.equal(service.getQuestion('question-1')!.status, 'open');
});

test('needs_decision keeps result=null + failure as legal pause evidence (user-confirmed terminal evidence clarification)', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  service.askQuestion(makeQuestion(), WORKER);
  // Executor 在 decision_requested 后收集 process/stream/Git/artifact evidence 失败的唯一
  // legal terminal：result=null + failure（transition table 无 decision_requested→failed）。
  // 用户已确认 terminal evidence 方案 1（2026-08-31）：result-carrying needs_decision 按
  // 同 Task result + failure=null 校验，该 pause-failure form 保留且不是第二个 business
  // Decision result；Executor 与 transition table 不变。
  const settled = service.settleRunAttempt(
    makeAttemptSettle({
      attempt_id: 'attempt-1',
      status: 'needs_decision',
      result: null,
      failure: { code: 'claude_exit_failed', message: 'exit 7' },
      process_exit_code: 7,
    }),
    EXECUTOR,
  );
  assert.equal(settled.attempt.status, 'needs_decision');
  assert.equal(settled.attempt.result, null);
  assert.equal(settled.attempt.failure?.code, 'claude_exit_failed');
  assert.equal(settled.run.status, 'needs_decision');
  assert.equal(service.getQuestion('question-1')!.status, 'open');
});

test('cancel_requested settles to canonical canceled with result=null and failure=null; retry compares the canonical payload', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  service.cancelRun({ room_id: 'room-1', run_id: 'run-1', reason: 'stop', confirmed_by_user: true }, PLANNER);
  // Executor 带着 succeeded classification 与 failure 分类 settle：canonical payload 丢弃
  // result/failure，保留 session/process/Git/artifact evidence。
  const input = makeAttemptSettle({
    attempt_id: 'attempt-1',
    status: 'succeeded',
    result: makeCodingResult(),
    failure: { code: 'canceled', message: 'run canceled by planner' },
    agent_session_ref: 'sess-1',
    process_exit_code: 130,
    git_evidence: { staged: [], unstaged: ['dirty.txt'], untracked: [] },
    artifact_refs: ['.agent-room/artifacts/attempt-1/stdout.jsonl'],
  });
  const settled = service.settleRunAttempt(input, EXECUTOR);
  assert.equal(settled.attempt.status, 'canceled');
  assert.equal(settled.attempt.result, null, 'cancel canonical payload drops the caller result');
  assert.equal(settled.attempt.failure, null, 'cancel canonical payload drops the caller failure classification');
  assert.equal(settled.attempt.agent_session_ref, 'sess-1');
  assert.equal(settled.attempt.process_exit_code, 130);
  assert.deepEqual(settled.attempt.git_evidence, { staged: [], unstaged: ['dirty.txt'], untracked: [] });
  assert.deepEqual(settled.attempt.artifact_refs, ['.agent-room/artifacts/attempt-1/stdout.jsonl']);
  assert.equal(settled.run.status, 'canceled');
  assert.equal(service.listEvents('room-1').filter((e) => e.type === 'run_attempt_canceled').length, 1);

  // 相同原始 payload retry：按 canonical payload 比较，幂等零 Event。
  const eventsAfter = service.listEvents('room-1').length;
  const retry = service.settleRunAttempt(input, EXECUTOR);
  assert.equal(retry.attempt.status, 'canceled');
  assert.equal(service.listEvents('room-1').length, eventsAfter, 'canonical retry must append no Event');

  // 不同 evidence：id_conflict，terminal 不变，Event 不变。
  assert.equal(
    errCode(() =>
      service.settleRunAttempt(
        makeAttemptSettle({
          attempt_id: 'attempt-1',
          status: 'canceled',
          result: null,
          failure: null,
          agent_session_ref: 'sess-1',
          process_exit_code: 130,
          git_evidence: { staged: [], unstaged: ['other.txt'], untracked: [] },
          artifact_refs: [],
        }),
        EXECUTOR,
      ),
    ),
    'id_conflict',
  );
  assert.equal(service.getAttempt('attempt-1')!.status, 'canceled');
  assert.equal(service.listEvents('room-1').length, eventsAfter);
});

test('appendAttemptProgress appends a run_attempt_progress event without changing state', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  const eventsBefore = service.listEvents('room-1').length;
  service.appendAttemptProgress({ attempt_id: 'attempt-1', type: 'system', subtype: 'hook_started', outcome: null }, EXECUTOR);
  const events = service.listEvents('room-1');
  assert.equal(events.length, eventsBefore + 1);
  const last = events[events.length - 1];
  assert.equal(last.type, 'run_attempt_progress');
  assert.equal(last.participant_id, 'local-runner');
  assert.equal(last.actor_role, 'executor');
  assert.equal(last.entity_type, 'run_attempt');
  assert.equal(last.entity_id, 'attempt-1');
  assert.equal(last.summary, 'attempt attempt-1 progress system:hook_started');
  assert.equal(service.getRun('run-1')!.status, 'running');
  assert.equal(service.getAttempt('attempt-1')!.status, 'running');
});

test('appendAttemptProgress rejects a non-running attempt with no partial write', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  settle(service, { status: 'failed', result: null, failure: { code: 'x', message: 'y' }, process_exit_code: 1 });
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(
    errCode(() => service.appendAttemptProgress({ attempt_id: 'attempt-1', type: 'assistant', subtype: null, outcome: null }, EXECUTOR)),
    'validation_failed',
  );
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

// ---- Question ----

test('askQuestion binds to the active attempt and moves it to decision_requested; Run stays running', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  const eventsBefore = service.listEvents('room-1').length;
  const asked = service.askQuestion(makeQuestion(), WORKER);
  assert.equal(asked.created, true);
  assert.equal(asked.question.status, 'open');
  assert.equal(asked.attempt.status, 'decision_requested');
  assert.equal(service.getAttempt('attempt-1')!.status, 'decision_requested');
  assert.equal(service.getRun('run-1')!.status, 'running'); // Run 保持 running，等 executor settle
  assert.equal(service.listEvents('room-1').length, eventsBefore + 1);
  assert.equal(service.listEvents('room-1').at(-1)!.type, 'question_asked');
});

test('askQuestion same-ID retry is idempotent and only the frozen worker may ask', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  service.askQuestion(makeQuestion(), WORKER);
  const eventsAfterFirst = service.listEvents('room-1').length;
  const retry = service.askQuestion(makeQuestion(), WORKER);
  assert.equal(retry.created, false);
  assert.equal(service.listEvents('room-1').length, eventsAfterFirst);
  // wrong-role actor 的 retry 被拒且零 Event。
  assert.equal(errCode(() => service.askQuestion(makeQuestion(), REVIEWER)), 'actor_not_allowed');
  assert.equal(service.listEvents('room-1').length, eventsAfterFirst);
});

test('askQuestion rejects a non-running attempt or mismatched run/task/room with rollback', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  settle(service, { status: 'failed', result: null, failure: { code: 'x', message: 'y' }, process_exit_code: 1 });
  assert.equal(errCode(() => service.askQuestion(makeQuestion(), WORKER)), 'validation_failed');
  assert.equal(service.getQuestion('question-1'), null);

  const s2 = makeService().service;
  toReady(s2);
  claim(s2);
  assert.equal(errCode(() => s2.askQuestion(makeQuestion({ run_id: 'other' }), WORKER)), 'validation_failed');
  assert.equal(s2.getQuestion('question-1'), null);
  assert.equal(s2.getAttempt('attempt-1')!.status, 'running');
});

test('answerQuestion requires the attempt terminal-finalized needs_decision', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  service.askQuestion(makeQuestion(), WORKER); // decision_requested，未 settle
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(errCode(() => service.answerQuestion('question-1', 'pick a', false, PLANNER)), 'validation_failed');
  assert.equal(service.getQuestion('question-1')!.status, 'open');
  assert.equal(service.getRun('run-1')!.status, 'running');
  assert.equal(service.listEvents('room-1').length, eventsBefore);

  settle(service, { status: 'needs_decision', result: makeCodingResult({ status: 'needs_decision' }), agent_session_ref: 'sess-1', process_exit_code: 0 });
  const answered = service.answerQuestion('question-1', 'pick a', false, PLANNER);
  assert.equal(answered.question.status, 'answered');
  assert.equal(answered.question.answer_changes_contract, false);
  assert.equal(answered.run.status, 'ready');
  assert.equal(service.listEvents('room-1').at(-1)!.type, 'question_answered');
});

test('scope-changing answer moves the Room to planning confirmation and keeps the Run needs_decision', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  service.askQuestion(makeQuestion(), WORKER);
  settle(service, { status: 'needs_decision', result: makeCodingResult({ status: 'needs_decision' }), process_exit_code: 0 });
  // Room 是 DISCUSSION（submitTask 后）：scope-changing answer → WAITING_FOR_USER_CONFIRMATION。
  const answered = service.answerQuestion('question-1', 'change the scope', true, PLANNER);
  assert.equal(answered.room.state, 'WAITING_FOR_USER_CONFIRMATION');
  assert.equal(answered.run.status, 'needs_decision'); // Run 不 resume
  assert.equal(answered.question.answer_changes_contract, true);
});

test('scope-changing answer on a Room already awaiting confirmation is a no-op re-transition', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  service.askQuestion(makeQuestion(), WORKER);
  settle(service, { status: 'needs_decision', result: makeCodingResult({ status: 'needs_decision' }), process_exit_code: 0 });
  // 先由 planner 把 Room 移到 planning confirmation（planning 与 Run needs_decision 无关）。
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  const eventsBefore = service.listEvents('room-1').length;
  const answered = service.answerQuestion('question-1', 'change the scope', true, PLANNER);
  assert.equal(answered.room.state, 'WAITING_FOR_USER_CONFIRMATION');
  assert.equal(answered.run.status, 'needs_decision');
  assert.equal(service.listEvents('room-1').length, eventsBefore + 1); // 只记 question_answered
});

test('scope-changing answer from ARCHITECTURE_REVIEW is rejected with no write', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  service.askQuestion(makeQuestion(), WORKER);
  settle(service, { status: 'needs_decision', result: makeCodingResult({ status: 'needs_decision' }), process_exit_code: 0 });
  service.transitionToArchitectureReview('room-1', PLANNER);
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(
    errCode(() => service.answerQuestion('question-1', 'change the scope', true, PLANNER)),
    'validation_failed',
  );
  assert.equal(service.getQuestion('question-1')!.status, 'open'); // 回答整体回滚
  assert.equal(service.getRoom('room-1')!.state, 'ARCHITECTURE_REVIEW');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

test('answerQuestion requires the question to be the current open question of the Run', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  service.askQuestion(makeQuestion(), WORKER);
  settle(service, { status: 'needs_decision', result: makeCodingResult({ status: 'needs_decision' }), process_exit_code: 0 });
  service.answerQuestion('question-1', 'pick a', false, PLANNER);
  assert.equal(errCode(() => service.answerQuestion('question-1', 'again', false, PLANNER)), 'validation_failed');
});

// ---- Review ----

test('review flow: settle succeeded → submitReview → run review_discussion → acceptReview → accepted', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  settle(service, { status: 'succeeded', result: makeCodingResult(), process_exit_code: 0 });
  const submitted = service.submitReview(makeReview(), REVIEWER);
  assert.equal(submitted.created, true);
  assert.equal(submitted.run.status, 'review_discussion');
  assert.equal(service.listEvents('room-1').at(-1)!.type, 'review_submitted');
  const accepted = service.acceptReview('review-1', true, REVIEWER);
  assert.equal(accepted.run.status, 'accepted');
  assert.notEqual(accepted.run.accepted_at, null);
  assert.equal(service.listEvents('room-1').at(-1)!.type, 'review_accepted');
});

test('submitReview rejects a run that is not review_required or a stale/non-latest attempt', () => {
  const a = makeService().service;
  toReady(a);
  claim(a);
  assert.equal(errCode(() => a.submitReview(makeReview(), REVIEWER)), 'validation_failed'); // running
  assert.equal(a.getReview('review-1'), null);

  const b = makeService().service;
  toReady(b);
  claim(b);
  settle(b, { status: 'succeeded', result: makeCodingResult(), process_exit_code: 0 });
  // attempt_id 不是该 Run 的 latest succeeded attempt。
  assert.equal(
    errCode(() => b.submitReview(makeReview({ attempt_id: 'attempt-other' }), REVIEWER)),
    'validation_failed',
  );
  assert.equal(b.getReview('review-1'), null);
  // 不存在的 task：requireTask 直接 entity_not_found（review insert 整体回滚）。
  assert.equal(
    errCode(() => b.submitReview(makeReview({ task_id: 'task-other' }), REVIEWER)),
    'entity_not_found',
  );
  assert.equal(b.getReview('review-1'), null);

  // 第二个 attempt 失败后 Run failed：review_required 只在最新 attempt succeeded 时成立。
  const c = makeService().service;
  toFixReady(c); // attempt-1 succeeded 已 review；fix 后 attempt-2 走 failed 路径
  // 简化：直接对 fix ready Run claim attempt-2 并 settle failed。
  c.claimRunAttempt({ attempt_id: 'attempt-2', run_id: 'run-1', room_id: 'room-1', worktree_path: WORKTREE }, EXECUTOR);
  c.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-2', status: 'failed', result: null, failure: { code: 'x', message: 'y' }, process_exit_code: 1 }), EXECUTOR);
  assert.equal(errCode(() => c.submitReview(makeReview({ review_id: 'review-2', task_id: 'task-2', attempt_id: 'attempt-2' }), REVIEWER)), 'validation_failed');
});

test('acceptReview rejects unconfirmed, blocking findings or a non-current review', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  settle(service, { status: 'succeeded', result: makeCodingResult(), process_exit_code: 0 });
  service.submitReview(makeReview(), REVIEWER);
  assert.equal(errCode(() => service.acceptReview('review-1', false, REVIEWER)), 'validation_failed');
  assert.equal(service.getRun('run-1')!.status, 'review_discussion');

  const b = makeService().service;
  toReady(b);
  claim(b);
  settle(b, { status: 'succeeded', result: makeCodingResult(), process_exit_code: 0 });
  b.submitReview(makeReview({ findings: [{ ...makeFinding(), severity: 'blocker' }] }), REVIEWER);
  assert.equal(errCode(() => b.acceptReview('review-1', true, REVIEWER)), 'validation_failed');
  assert.equal(b.getRun('run-1')!.status, 'review_discussion');

  // stale review：fix → 新 attempt → 新 review 后，旧 review 不能再 accept。
  const c = makeService().service;
  toFixReady(c);
  c.claimRunAttempt({ attempt_id: 'attempt-2', run_id: 'run-1', room_id: 'room-1', worktree_path: WORKTREE }, EXECUTOR);
  c.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-2', status: 'succeeded', result: makeCodingResult({ task_id: 'task-2' }), process_exit_code: 0 }), EXECUTOR);
  c.submitReview(makeReview({ review_id: 'review-2', task_id: 'task-2', attempt_id: 'attempt-2' }), REVIEWER);
  const eventsBefore = c.listEvents('room-1').length;
  assert.equal(errCode(() => c.acceptReview('review-1', true, REVIEWER)), 'validation_failed');
  assert.equal(c.getRun('run-1')!.status, 'review_discussion');
  assert.equal(c.listEvents('room-1').length, eventsBefore);
  assert.equal(c.acceptReview('review-2', true, REVIEWER).run.status, 'accepted');
});

test('submitReview idempotency and id_conflict follow the frozen reviewer identity', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  settle(service, { status: 'succeeded', result: makeCodingResult(), process_exit_code: 0 });
  const content = { decision: 'changes_requested' as const, findings: [makeFinding()] };
  service.submitReview(makeReview(content), REVIEWER);
  const eventsAfterFirst = service.listEvents('room-1').length;
  const retry = service.submitReview(makeReview(content), REVIEWER);
  assert.equal(retry.created, false);
  assert.equal(retry.review.decision, 'changes_requested');
  assert.equal(service.listEvents('room-1').length, eventsAfterFirst);
  assert.equal(errCode(() => service.submitReview(makeReview({ decision: 'approved' }), REVIEWER)), 'id_conflict');
  assert.equal(service.listEvents('room-1').length, eventsAfterFirst);
});

test('fix task attaches to the review_discussion Run and returns it to ready without changing the Room', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  settle(service, { status: 'succeeded', result: makeCodingResult(), process_exit_code: 0 });
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER);
  const { task, run, room, created } = service.submitTask(
    makeFixTask({ task_id: 'task-2', room_id: 'room-1', run_id: 'run-1' }),
    PLANNER,
  );
  assert.equal(created, true);
  assert.equal(task.type, 'fix');
  assert.equal(run.run_id, 'run-1'); // 同一 Run lineage
  assert.equal(run.status, 'ready');
  assert.equal(run.root_task_id, 'task-1'); // root_task_id 不随 fix 改写
  assert.equal(room.state, 'DISCUSSION'); // Room 状态不变（review 期间本就在 DISCUSSION）
  assert.equal(service.latestTaskForRun('run-1')!.task_id, 'task-2');
});

test('fix task referencing a finding not in the review is rejected with no persistence', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  settle(service, { status: 'succeeded', result: makeCodingResult(), process_exit_code: 0 });
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER);
  const eventsBefore = service.listEvents('room-1').length;
  const phantom = makeFixTask({
    task_id: 'task-2',
    room_id: 'room-1',
    run_id: 'run-1',
    confirmed_findings: [{ finding_id: 'ghost', solution: 'x' }],
  });
  assert.equal(errCode(() => service.submitTask(phantom, PLANNER)), 'validation_failed');
  assert.equal(service.getTask('task-2'), null);
  assert.equal(service.getRun('run-1')!.status, 'review_discussion');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

test('full cycle: implementation → review → fix → review → accepted (same Run lineage)', () => {
  const { service } = makeService();
  toReady(service);
  claim(service); // attempt-1, task-1
  settle(service, { status: 'succeeded', result: makeCodingResult(), process_exit_code: 0 });
  service.submitReview(makeReview({ decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER);
  service.submitTask(makeFixTask({ task_id: 'task-2', room_id: 'room-1', run_id: 'run-1' }), PLANNER);
  service.claimRunAttempt({ attempt_id: 'attempt-2', run_id: 'run-1', room_id: 'room-1', worktree_path: WORKTREE }, EXECUTOR);
  service.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-2', status: 'succeeded', result: makeCodingResult({ task_id: 'task-2' }), process_exit_code: 0 }), EXECUTOR);
  service.submitReview(makeReview({ review_id: 'review-2', task_id: 'task-2', attempt_id: 'attempt-2' }), REVIEWER);
  const accepted = service.acceptReview('review-2', true, REVIEWER);
  assert.equal(accepted.run.run_id, 'run-1');
  assert.equal(accepted.run.status, 'accepted');
  assert.equal(service.listAttemptsByRun('run-1').length, 2);
  assert.deepEqual(service.listAttemptsByRun('run-1').map((a) => a.attempt_no), [1, 2]);
});

// ---- retry / cancel / guidance ----

test('retryRun only accepts failed/canceled Runs in the same room', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  settle(service, { status: 'failed', result: null, failure: { code: 'x', message: 'y' }, process_exit_code: 1 });
  assert.equal(errCode(() => service.retryRun('room-1', 'run-1', WORKER)), 'actor_not_allowed');
  assert.equal(errCode(() => service.retryRun('room-1', 'run-other', PLANNER)), 'entity_not_found');
  assert.equal(service.retryRun('room-1', 'run-1', PLANNER).run.status, 'ready');
  assert.equal(errCode(() => service.retryRun('room-1', 'run-1', PLANNER)), 'validation_failed'); // 已 ready
  // canceled Run 同样可 retry。
  const b = makeService().service;
  toReady(b);
  claim(b);
  b.cancelRun({ room_id: 'room-1', run_id: 'run-1', reason: 'stop', confirmed_by_user: true }, PLANNER);
  b.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-1', status: 'succeeded', result: null, failure: null, process_exit_code: null }), EXECUTOR); // cancel intent 强制 canceled
  assert.equal(b.getRun('run-1')!.status, 'canceled');
  assert.equal(b.retryRun('room-1', 'run-1', PLANNER).run.status, 'ready');
});

test('cancelRun moves the Run and active attempt to cancel_requested and is idempotent', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  const canceled = service.cancelRun({ room_id: 'room-1', run_id: 'run-1', reason: 'stop', confirmed_by_user: true }, PLANNER);
  assert.equal(canceled.created, true);
  assert.equal(canceled.run.status, 'cancel_requested');
  assert.equal(canceled.attempt.status, 'cancel_requested');
  assert.equal(service.listEvents('room-1').at(-1)!.type, 'run_cancel_requested');
  const eventsAfter = service.listEvents('room-1').length;
  // same-ID retry：幂等零 Event。
  const retry = service.cancelRun({ room_id: 'room-1', run_id: 'run-1', reason: 'stop', confirmed_by_user: true }, PLANNER);
  assert.equal(retry.created, false);
  assert.equal(service.listEvents('room-1').length, eventsAfter);
});

test('cancelRun rejects unconfirmed requests and Runs without an active attempt', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  assert.equal(
    errCode(() => service.cancelRun({ room_id: 'room-1', run_id: 'run-1', reason: 'stop', confirmed_by_user: false }, PLANNER)),
    'validation_failed',
  );
  settle(service, { status: 'failed', result: null, failure: { code: 'x', message: 'y' }, process_exit_code: 1 });
  assert.equal(
    errCode(() => service.cancelRun({ room_id: 'room-1', run_id: 'run-1', reason: 'stop', confirmed_by_user: true }, PLANNER)),
    'validation_failed',
  );
});

test('planner cancel intent forces the executor terminal to canceled with exactly one terminal event', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  service.cancelRun({ room_id: 'room-1', run_id: 'run-1', reason: 'stop', confirmed_by_user: true }, PLANNER);
  // executor 即使带着 succeeded classification settle，也按 planner 意图落 canceled。
  const settled = service.settleRunAttempt(
    makeAttemptSettle({ attempt_id: 'attempt-1', status: 'succeeded', result: makeCodingResult(), process_exit_code: 0 }),
    EXECUTOR,
  );
  assert.equal(settled.attempt.status, 'canceled');
  assert.equal(settled.run.status, 'canceled');
  const types = service.listEvents('room-1').map((e) => e.type);
  assert.equal(types.filter((t) => t === 'run_attempt_canceled').length, 1);
  assert.equal(types.filter((t) => t === 'run_attempt_succeeded').length, 0);
});

test('cancel during decision_requested supersedes the open question', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  service.askQuestion(makeQuestion(), WORKER);
  service.cancelRun({ room_id: 'room-1', run_id: 'run-1', reason: 'stop', confirmed_by_user: true }, PLANNER);
  assert.equal(service.getQuestion('question-1')!.status, 'superseded');
  assert.equal(service.getAttempt('attempt-1')!.status, 'cancel_requested');
  service.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-1', status: 'needs_decision', result: null, process_exit_code: 0 }), EXECUTOR);
  assert.equal(service.getRun('run-1')!.status, 'canceled');
  // question 已 superseded：不能 answer。
  assert.equal(errCode(() => service.answerQuestion('question-1', 'x', false, PLANNER)), 'validation_failed');
});

test('addRunGuidance is consumed exactly once by the next claim and rejected during an active attempt', () => {
  const { service } = makeService();
  toReady(service);
  const added = service.addRunGuidance(
    { guidance_id: 'g-1', room_id: 'room-1', run_id: 'run-1', text: 'prefer the repo helper' },
    PLANNER,
  );
  assert.equal(added.created, true);
  assert.equal(added.guidance.planner_participant_id, 'codex-app');
  assert.equal(added.guidance.consumed_by_attempt_id, null);
  assert.equal(service.listEvents('room-1').at(-1)!.type, 'run_guidance_added');
  // same-ID retry：created=false。
  assert.equal(
    service.addRunGuidance({ guidance_id: 'g-1', room_id: 'room-1', run_id: 'run-1', text: 'prefer the repo helper' }, PLANNER).created,
    false,
  );
  // claim 消费 pending guidance。
  const claimed = service.claimRunAttempt({ attempt_id: 'attempt-1', run_id: 'run-1', room_id: 'room-1', worktree_path: WORKTREE }, EXECUTOR);
  assert.equal(claimed.guidance.length, 1);
  assert.equal(claimed.guidance[0].guidance_id, 'g-1');
  assert.equal(service.getGuidance('g-1')!.consumed_by_attempt_id, 'attempt-1');
  // 运行期间新增 guidance：validation_failed 零写入。
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(
    errCode(() => service.addRunGuidance({ guidance_id: 'g-2', room_id: 'room-1', run_id: 'run-1', text: 'live steer' }, PLANNER)),
    'validation_failed',
  );
  assert.equal(service.getGuidance('g-2'), null);
  assert.equal(service.listEvents('room-1').length, eventsBefore);
});

// ---- 多 Run 与 worktree lease ----

test('same-Room multi-Run requires different canonical worktrees while the first Run is unaccepted', () => {
  const { service } = makeService();
  toReady(service); // run-1 ready
  // 第二个 Implementation Task：Room 需再次进入 WAITING_FOR_USER_CONFIRMATION。
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask({ task_id: 'task-2', run_id: 'run-2' }), PLANNER);

  claim(service); // run-1 running on WORKTREE
  // run-2 使用同一 worktree：worktree_already_owned，零写入。
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(
    errCode(() => service.claimRunAttempt({ attempt_id: 'attempt-2', run_id: 'run-2', room_id: 'room-1', worktree_path: WORKTREE }, EXECUTOR)),
    'worktree_already_owned',
  );
  assert.equal(service.getAttempt('attempt-2'), null);
  assert.equal(service.listEvents('room-1').length, eventsBefore);

  // 不同 canonical worktree：两个 Run 可同时 active。
  const claimed = service.claimRunAttempt(
    { attempt_id: 'attempt-2', run_id: 'run-2', room_id: 'room-1', worktree_path: 'D:\\agent\\case\\project-b' },
    EXECUTOR,
  );
  assert.equal(claimed.created, true);
  assert.equal(service.getRun('run-1')!.status, 'running');
  assert.equal(service.getRun('run-2')!.status, 'running');
});

test('an accepted Run releases the worktree lease for the next Run', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  settle(service, { status: 'succeeded', result: makeCodingResult(), process_exit_code: 0 });
  service.submitReview(makeReview(), REVIEWER);
  service.acceptReview('review-1', true, REVIEWER);
  // accepted 后同 worktree 可被新 Run 认领。
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask({ task_id: 'task-2', run_id: 'run-2' }), PLANNER);
  const claimed = service.claimRunAttempt(
    { attempt_id: 'attempt-2', run_id: 'run-2', room_id: 'room-1', worktree_path: WORKTREE },
    EXECUTOR,
  );
  assert.equal(claimed.created, true);
});

// ---- frozen authority / assignment resolution ----

test('attempt commands use the frozen worker/executor; replacement participants are rejected', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  // 替换 worker 与 executor assignment。
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

  // 冻结 worker 仍可 askQuestion；replacement worker 被拒。
  assert.equal(service.askQuestion(makeQuestion(), WORKER).created, true);
  const s2 = makeService().service;
  toReady(s2);
  claim(s2);
  assert.equal(errCode(() => s2.askQuestion(makeQuestion(), WORKER_2)), 'actor_not_allowed');
  // 冻结 executor 仍可 settle；replacement executor 被拒。
  assert.equal(
    errCode(() => service.settleRunAttempt(makeAttemptSettle({ status: 'needs_decision', result: makeCodingResult({ status: 'needs_decision' }), process_exit_code: 0 }), RUNNER_2)),
    'actor_not_allowed',
  );
  service.settleRunAttempt(makeAttemptSettle({ status: 'needs_decision', result: makeCodingResult({ status: 'needs_decision' }), process_exit_code: 0 }), EXECUTOR);
  assert.equal(service.getAttempt('attempt-1')!.executor_participant_id, 'local-runner');

  // disabled 冻结 worker 不能发起 command；re-enable 后恢复（不修改 Run/Event 历史）。
  const b = makeService().service;
  toReady(b);
  claim(b);
  b.setParticipantEnabled('claude-code-cli', false, ORCHESTRATOR);
  assert.equal(errCode(() => b.askQuestion(makeQuestion(), WORKER)), 'actor_not_allowed');
  b.setParticipantEnabled('claude-code-cli', true, ORCHESTRATOR);
  assert.equal(b.askQuestion(makeQuestion(), WORKER).created, true);
});

test('task-scope worker/executor/reviewer are consumed and frozen by the next Run/Review', () => {
  const { service } = makeService();
  toWaiting(service);
  // task-1 提交前先建立 task-scope worker（Run 创建时消费）——task 不存在前只能 room scope；
  // 这里验证 room scope 替换 worker 的冻结与 task-scope reviewer 的消费。
  service.registerParticipant(
    makeParticipant({ participant_id: 'reviewer-2', kind: 'agent', provider: 'codex', adapter_id: 'codex_app', capabilities: ['reviewing'] }),
    ORCHESTRATOR,
  );
  service.submitTask(makeTask(), PLANNER); // run-1 冻结 room default worker
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-r2', scope_type: 'task', scope_id: 'task-1', role: 'reviewer', participant_id: 'reviewer-2' }),
    ORCHESTRATOR,
  );
  claim(service);
  settle(service, { status: 'succeeded', result: makeCodingResult(), process_exit_code: 0 });
  const REVIEWER_2 = { participant_id: 'reviewer-2', actor_role: 'reviewer' as const };
  // Review 首次提交消费 task-scope reviewer 并固化；room default reviewer 被 task scope 取代。
  const submitted = service.submitReview(makeReview({ reviewer_participant_id: 'reviewer-2' }), REVIEWER_2);
  assert.equal(submitted.run.status, 'review_discussion');
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
  assert.equal(service.getRun('run-1')!.worker_participant_id, 'claude-code-cli');
  assert.equal(service.getReview('review-1')!.reviewer_participant_id, 'reviewer-2');
});

test('acceptReview authorizes the frozen reviewer; replacement reviewers are rejected', () => {
  const { service } = makeService();
  toReady(service);
  claim(service);
  settle(service, { status: 'succeeded', result: makeCodingResult(), process_exit_code: 0 });
  service.submitReview(makeReview(), REVIEWER); // 冻结 codex-app
  // 替换 reviewer。
  service.registerParticipant(
    makeParticipant({ participant_id: 'reviewer-2', kind: 'agent', provider: 'codex', adapter_id: 'codex_app', capabilities: ['reviewing'] }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-reviewer-2', role: 'reviewer', participant_id: 'reviewer-2' }),
    ORCHESTRATOR,
  );
  const REVIEWER_2 = { participant_id: 'reviewer-2', actor_role: 'reviewer' as const };
  const eventsBefore = service.listEvents('room-1').length;
  assert.equal(errCode(() => service.acceptReview('review-1', true, REVIEWER_2)), 'actor_not_allowed');
  assert.equal(service.getRun('run-1')!.status, 'review_discussion');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
  // 冻结 reviewer 仍可 accept。
  assert.equal(service.acceptReview('review-1', true, REVIEWER).run.status, 'accepted');
});

test('same-ID Task retry authenticates the frozen submit identity after planner replacement', () => {
  const { service } = makeService();
  toReady(service);
  // 注册并替换 planner。
  service.registerParticipant(
    makeParticipant({ participant_id: 'planner-2', kind: 'agent', provider: 'codex', adapter_id: 'codex_app', capabilities: ['planning'] }),
    ORCHESTRATOR,
  );
  service.createRoleAssignment(
    makeRoleAssignment({ assignment_id: 'a-planner-2', role: 'planner', participant_id: 'planner-2' }),
    ORCHESTRATOR,
  );
  const PLANNER_2 = { participant_id: 'planner-2', actor_role: 'planner' as const };
  const eventsBefore = service.listEvents('room-1').length;
  // 冻结 planner 同 content → created=false；replacement planner 被拒；different content → id_conflict。
  assert.equal(service.submitTask(makeTask(), PLANNER).created, false);
  assert.equal(service.listEvents('room-1').length, eventsBefore);
  assert.equal(errCode(() => service.submitTask(makeTask(), PLANNER_2)), 'actor_not_allowed');
  assert.equal(errCode(() => service.submitTask(makeTask({ background: 'other' }), PLANNER)), 'id_conflict');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
  assert.equal(service.getTask('task-1')!.planner_participant_id, 'codex-app');
});

// ---- participant / assignment commands ----

test('participant and assignment commands require orchestrator authority', () => {
  const { service } = makeService();
  toReady(service);
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
  toReady(service);
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
  toReady(service);
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
  assert.equal(service.getRoleAssignment('a-1'), null);
  assert.equal(service.getRoleAssignment('a-3'), null);
  assert.equal(service.getRoleAssignment('a-4'), null);
  assert.equal(service.getRoleAssignment('a-5'), null);
});

test('resolveAssignment prefers exact entity scope over room default and the latest assignment', () => {
  const { service } = makeService();
  toReady(service);
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

test('replaced historical orchestrator loses participant management authority until it becomes active again', () => {
  const { service } = makeService();
  toReady(service);
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
});

// ---- durability ----

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
  toReady(service);
  claim(service);
  settle(service, { status: 'succeeded', result: makeCodingResult(), process_exit_code: 0 });
  const eventsBefore = service.listEvents('room-1').length;
  assert.ok(eventsBefore > 0);
  db.close();

  db = new DatabaseSync(dbPath);
  service = new RoomService(db);
  assert.equal(service.getRoom('room-1')!.state, 'DISCUSSION');
  assert.equal(service.getTask('task-1')!.goal, 'goal');
  assert.equal(service.getTask('task-1')!.planner_participant_id, 'codex-app');
  assert.equal(service.getRun('run-1')!.status, 'review_required');
  assert.equal(service.getRun('run-1')!.worktree_path, WORKTREE);
  assert.equal(service.getAttempt('attempt-1')!.status, 'succeeded');
  assert.equal(service.listEvents('room-1').length, eventsBefore);
  assert.equal(service.listEvents('room-1', eventsBefore).length, 0);
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
