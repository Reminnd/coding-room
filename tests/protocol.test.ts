import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attemptStatusSchema,
  codingResultSchema,
  eventActorSchema,
  eventSchema,
  participantProfileSchema,
  persistedTaskSchema,
  protocolVersionSchema,
  questionSchema,
  reviewSchema,
  roleAssignmentSchema,
  roleSchema,
  roomStateSchema,
  runAttemptSchema,
  runGuidanceSchema,
  runSchema,
  runStatusSchema,
  taskContractSchema,
  utcTimestampSchema,
} from '../src/protocol/schema.ts';
import {
  makeAttempt,
  makeCodingResult,
  makeFixTask,
  makeParticipant,
  makeQuestion,
  makeReview,
  makeRoleAssignment,
  makeRun,
  makeTask,
} from './fixtures.ts';

test('RoomState enum accepts only the v0.4 planning-only values', () => {
  assert.deepEqual(roomStateSchema.options, [
    'DISCUSSION',
    'ARCHITECTURE_REVIEW',
    'WAITING_FOR_USER_CONFIRMATION',
  ]);
});

test('protocol version is the frozen 0.4-design literal', () => {
  assert.equal(protocolVersionSchema.value, '0.4-design');
  assert.equal(protocolVersionSchema.safeParse('0.4-design').success, true);
  assert.equal(protocolVersionSchema.safeParse('0.3-design').success, false);
  assert.equal(protocolVersionSchema.safeParse('0.2').success, false);
});

test('Role enum accepts only the six frozen roles', () => {
  assert.deepEqual(roleSchema.options, [
    'planner',
    'worker',
    'reviewer',
    'executor',
    'git_controller',
    'orchestrator',
  ]);
});

test('ParticipantProfile accepts a valid profile and rejects illegal kind/adapter', () => {
  assert.equal(participantProfileSchema.safeParse(makeParticipant()).success, true);
  assert.equal(participantProfileSchema.safeParse(makeParticipant({ kind: 'robot' as never })).success, false);
  assert.equal(participantProfileSchema.safeParse(makeParticipant({ enabled: 'yes' as never })).success, false);
  assert.equal(participantProfileSchema.safeParse(makeParticipant({ config_ref: {} as never })).success, false);
});

test('RoleAssignment accepts valid shapes and rejects illegal scope/role', () => {
  assert.equal(roleAssignmentSchema.safeParse(makeRoleAssignment()).success, true);
  assert.equal(
    roleAssignmentSchema.safeParse(makeRoleAssignment({ scope_type: 'task', scope_id: 'task-1' })).success,
    true,
  );
  assert.equal(roleAssignmentSchema.safeParse(makeRoleAssignment({ scope_type: 'global' as never })).success, false);
  // Fix inc9-r2：Stage 1 scope 收窄为 room|task；run/review scope 不是合法 shape。
  assert.equal(roleAssignmentSchema.safeParse(makeRoleAssignment({ scope_type: 'run' as never })).success, false);
  assert.equal(roleAssignmentSchema.safeParse(makeRoleAssignment({ scope_type: 'review' as never })).success, false);
  assert.equal(roleAssignmentSchema.safeParse(makeRoleAssignment({ role: 'admin' as never })).success, false);
});

test('EventActor requires participant_id and a frozen Role; no fixed actor enum remains', () => {
  assert.equal(eventActorSchema.safeParse({ participant_id: 'codex-app', actor_role: 'planner' }).success, true);
  assert.equal(eventActorSchema.safeParse({ participant_id: 'codex-app' }).success, false);
  assert.equal(eventActorSchema.safeParse({ actor_role: 'planner' }).success, false);
  assert.equal(eventActorSchema.safeParse({ participant_id: 'codex-app', actor_role: 'user' as never }).success, false);
});

test('TaskContract accepts a valid implementation task with an explicit run_id', () => {
  assert.equal(taskContractSchema.safeParse(makeTask()).success, true);
});

test('TaskContract requires run_id', () => {
  const { run_id: _runId, ...missing } = makeTask();
  assert.equal(taskContractSchema.safeParse(missing).success, false);
  assert.equal(taskContractSchema.safeParse(makeTask({ run_id: '' })).success, false);
});

test('TaskContract accepts a valid fix task', () => {
  assert.equal(taskContractSchema.safeParse(makeFixTask()).success, true);
});

test('TaskContract rejects missing required field', () => {
  const { goal: _goal, ...missing } = makeTask();
  assert.equal(taskContractSchema.safeParse(missing).success, false);
});

test('TaskContract rejects illegal type enum', () => {
  assert.equal(taskContractSchema.safeParse(makeTask({ type: 'other' as never })).success, false);
});

test('TaskContract rejects confirmed_by_user=false', () => {
  assert.equal(taskContractSchema.safeParse(makeTask({ confirmed_by_user: false as never })).success, false);
});

test('TaskContract rejects invalid fix task shape (missing parent/review/findings/scope)', () => {
  assert.equal(
    taskContractSchema.safeParse(makeTask({ type: 'fix', scope: ['review_fixes_only'] })).success,
    false,
  );
  assert.equal(
    taskContractSchema.safeParse(
      makeFixTask({ parent_task_id: null }),
    ).success,
    false,
  );
  assert.equal(
    taskContractSchema.safeParse(makeFixTask({ confirmed_findings: [] })).success,
    false,
  );
  assert.equal(
    taskContractSchema.safeParse(makeFixTask({ scope: ['other'] })).success,
    false,
  );
});

test('PersistedTask adds frozen planner/orchestrator identities to a TaskContract', () => {
  const persisted = { ...makeTask(), planner_participant_id: 'codex-app', orchestrator_participant_id: 'operator' };
  assert.equal(persistedTaskSchema.safeParse(persisted).success, true);
  assert.equal(persistedTaskSchema.safeParse(makeTask()).success, false);
  assert.equal(
    persistedTaskSchema.safeParse({ ...persisted, planner_participant_id: '' }).success,
    false,
  );
});

test('RunStatus enum accepts only the v0.4 run lifecycle values', () => {
  assert.deepEqual(runStatusSchema.options, [
    'ready',
    'running',
    'cancel_requested',
    'needs_decision',
    'failed',
    'canceled',
    'review_required',
    'review_discussion',
    'accepted',
  ]);
});

test('Run accepts a valid run and rejects illegal status', () => {
  assert.equal(runSchema.safeParse(makeRun()).success, true);
  assert.equal(runSchema.safeParse(makeRun({ status: 'flying' as never })).success, false);
});

test('Run freezes worker identity and nullable worktree/baseline lineage fields', () => {
  const { worker_participant_id: _w, ...noWorker } = makeRun();
  assert.equal(runSchema.safeParse(noWorker).success, false);
  const { root_task_id: _r, ...noRoot } = makeRun();
  assert.equal(runSchema.safeParse(noRoot).success, false);
  assert.equal(runSchema.safeParse(makeRun({ worktree_path: 'D:\\agent\\case\\project' })).success, true);
  assert.equal(runSchema.safeParse(makeRun({ baseline_head: 'deadbeef' })).success, true);
  assert.equal(runSchema.safeParse(makeRun({ worktree_path: '' })).success, false);
  assert.equal(runSchema.safeParse(makeRun({ accepted_at: T() })).success, true);
  assert.equal(runSchema.safeParse(makeRun({ accepted_at: 42 as never })).success, false);
});

test('AttemptStatus enum accepts only the v0.4 attempt status values', () => {
  assert.deepEqual(attemptStatusSchema.options, [
    'running',
    'decision_requested',
    'cancel_requested',
    'succeeded',
    'failed',
    'needs_decision',
    'canceled',
    'interrupted',
  ]);
});

test('RunAttempt accepts a valid attempt and requires frozen worker/executor identities', () => {
  assert.equal(runAttemptSchema.safeParse(makeAttempt()).success, true);
  const { worker_participant_id: _w, ...noWorker } = makeAttempt();
  assert.equal(runAttemptSchema.safeParse(noWorker).success, false);
  const { executor_participant_id: _e, ...noExecutor } = makeAttempt();
  assert.equal(runAttemptSchema.safeParse(noExecutor).success, false);
  assert.equal(runAttemptSchema.safeParse(makeAttempt({ attempt_no: 0 })).success, false);
  assert.equal(runAttemptSchema.safeParse(makeAttempt({ attempt_no: -1 })).success, false);
  assert.equal(runAttemptSchema.safeParse(makeAttempt({ attempt_no: 1.5 })).success, false);
  assert.equal(
    runAttemptSchema.safeParse(makeAttempt({ settled_at: '2026-08-23T00:00:00.000Z' })).success,
    true,
  );
  assert.equal(runAttemptSchema.safeParse(makeAttempt({ settled_at: 42 as never })).success, false);
});

test('CodingResult accepts valid shape and rejects illegal status', () => {
  assert.equal(codingResultSchema.safeParse(makeCodingResult()).success, true);
  assert.equal(
    codingResultSchema.safeParse(makeCodingResult({ status: 'done' as never })).success,
    false,
  );
});

test('Review accepts valid shape with attempt_id and rejects illegal severity/decision', () => {
  assert.equal(reviewSchema.safeParse(makeReview()).success, true);
  const { attempt_id: _a, ...noAttempt } = makeReview();
  assert.equal(reviewSchema.safeParse(noAttempt).success, false);
  assert.equal(reviewSchema.safeParse(makeReview({ decision: 'maybe' as never })).success, false);
  const { reviewer_participant_id: _r, ...noReviewer } = makeReview();
  assert.equal(reviewSchema.safeParse(noReviewer).success, false);
  const badFinding = {
    finding_id: 'f-1',
    severity: 'critical',
    title: 't',
    file: 'a.ts',
    line: 1,
    trigger: 'x',
    evidence: 'x',
    impact: 'x',
    requirement_relation: 'x',
    minimal_direction: 'x',
  };
  assert.equal(
    reviewSchema.safeParse(makeReview({ findings: [badFinding as never] })).success,
    false,
  );
});

test('Question accepts valid shape with attempt_id and rejects illegal status', () => {
  assert.equal(questionSchema.safeParse(makeQuestion()).success, true);
  const { attempt_id: _a, ...noAttempt } = makeQuestion();
  assert.equal(questionSchema.safeParse(noAttempt).success, false);
  assert.equal(
    questionSchema.safeParse(makeQuestion({ status: 'closed' as never })).success,
    false,
  );
});

test('RunGuidance accepts valid shape and rejects empty text', () => {
  const guidance = {
    guidance_id: 'g-1',
    room_id: 'room-1',
    run_id: 'run-1',
    text: 'prefer the repo helper',
    planner_participant_id: 'codex-app',
    created_at: T(),
    consumed_by_attempt_id: null,
  };
  assert.equal(runGuidanceSchema.safeParse(guidance).success, true);
  assert.equal(runGuidanceSchema.safeParse({ ...guidance, text: '' }).success, false);
  assert.equal(
    runGuidanceSchema.safeParse({ ...guidance, consumed_by_attempt_id: 'attempt-1' }).success,
    true,
  );
  assert.equal(
    runGuidanceSchema.safeParse({ ...guidance, consumed_by_attempt_id: 42 as never }).success,
    false,
  );
});

test('Event accepts valid shape and rejects non-positive sequence or illegal actor role', () => {
  const event = {
    event_id: 'e-1',
    room_id: 'room-1',
    sequence: 1,
    type: 't',
    actor_role: 'planner',
    participant_id: 'codex-app',
    entity_type: 'run_attempt',
    entity_id: 'attempt-1',
    summary: 's',
    created_at: T(),
  };
  assert.equal(eventSchema.safeParse(event).success, true);
  assert.equal(eventSchema.safeParse({ ...event, sequence: 0 }).success, false);
  assert.equal(eventSchema.safeParse({ ...event, actor_role: 'robot' as never }).success, false);
  assert.equal(eventSchema.safeParse({ ...event, participant_id: '' }).success, false);
  assert.equal(eventSchema.safeParse({ ...event, entity_type: 'unknown' as never }).success, false);
});

test('utcTimestampSchema accepts valid UTC ISO 8601 and rejects invalid, non-UTC or invalid-date strings', () => {
  assert.equal(utcTimestampSchema.safeParse('2026-08-23T15:18:50Z').success, true);
  assert.equal(utcTimestampSchema.safeParse('2026-08-23T15:18:50.123Z').success, true);
  assert.equal(utcTimestampSchema.safeParse('2026-08-23T00:00:00.000Z').success, true);
  assert.equal(utcTimestampSchema.safeParse('not-a-timestamp').success, false);
  assert.equal(utcTimestampSchema.safeParse('2026-08-23').success, false);
  assert.equal(utcTimestampSchema.safeParse('2026-08-23T15:18:50').success, false);
  assert.equal(utcTimestampSchema.safeParse('2026-08-23T15:18:50+08:00').success, false);
  assert.equal(utcTimestampSchema.safeParse('2026-13-45T99:99:99Z').success, false);
});

test('entity schemas reject an invalid timestamp', () => {
  assert.equal(taskContractSchema.safeParse(makeTask({ created_at: 'not-a-timestamp' })).success, false);
  assert.equal(runSchema.safeParse(makeRun({ created_at: '2026-08-23T00:00:00' })).success, false);
});

function T(): string {
  return '2026-08-23T00:00:00.000Z';
}
