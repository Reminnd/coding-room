import assert from 'node:assert/strict';
import test from 'node:test';
import {
  actorSchema,
  codingResultSchema,
  eventSchema,
  questionSchema,
  reviewSchema,
  roomStateSchema,
  runSchema,
  taskContractSchema,
  utcTimestampSchema,
} from '../src/protocol/schema.ts';
import {
  makeCodingResult,
  makeFixTask,
  makeQuestion,
  makeReview,
  makeRun,
  makeTask,
} from './fixtures.ts';

test('RoomState and Actor enums accept only listed values', () => {
  assert.deepEqual(
    roomStateSchema.options,
    [
      'DISCUSSION',
      'ARCHITECTURE_REVIEW',
      'WAITING_FOR_USER_CONFIRMATION',
      'PLAN_READY',
      'CODING',
      'NEEDS_DECISION',
      'RUN_FAILED',
      'REVIEW_REQUIRED',
      'REVIEW_DISCUSSION',
      'FIX_PLAN_READY',
      'ACCEPTED',
    ],
  );
  assert.deepEqual(actorSchema.options, ['user', 'codex', 'claude', 'runner', 'system']);
});

test('TaskContract accepts a valid implementation task', () => {
  assert.equal(taskContractSchema.safeParse(makeTask()).success, true);
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

test('Run accepts a valid run and rejects illegal status', () => {
  assert.equal(runSchema.safeParse(makeRun()).success, true);
  assert.equal(runSchema.safeParse(makeRun({ status: 'flying' as never })).success, false);
});

test('CodingResult accepts valid shape and rejects illegal status', () => {
  assert.equal(codingResultSchema.safeParse(makeCodingResult()).success, true);
  assert.equal(
    codingResultSchema.safeParse(makeCodingResult({ status: 'done' as never })).success,
    false,
  );
});

test('Review accepts valid shape and rejects illegal severity/decision', () => {
  assert.equal(reviewSchema.safeParse(makeReview()).success, true);
  assert.equal(reviewSchema.safeParse(makeReview({ decision: 'maybe' as never })).success, false);
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

test('Question accepts valid shape and rejects illegal status', () => {
  assert.equal(questionSchema.safeParse(makeQuestion()).success, true);
  assert.equal(
    questionSchema.safeParse(makeQuestion({ status: 'closed' as never })).success,
    false,
  );
});

test('Event accepts valid shape and rejects non-positive sequence or illegal actor', () => {
  const event = {
    event_id: 'e-1',
    room_id: 'room-1',
    sequence: 1,
    type: 't',
    actor: 'system',
    entity_type: 'room',
    entity_id: 'room-1',
    summary: 's',
    created_at: '2026-08-23T00:00:00.000Z',
  };
  assert.equal(eventSchema.safeParse(event).success, true);
  assert.equal(eventSchema.safeParse({ ...event, sequence: 0 }).success, false);
  assert.equal(eventSchema.safeParse({ ...event, actor: 'robot' }).success, false);
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
  assert.equal(runSchema.safeParse(makeRun({ started_at: '2026-08-23T00:00:00' })).success, false);
});
