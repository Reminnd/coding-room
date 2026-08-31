import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attemptStatusSchema,
  roomStateSchema,
  runStatusSchema,
  type AttemptStatus,
  type Role,
  type RoomState,
  type RunStatus,
} from '../src/protocol/schema.ts';
import {
  ATTEMPT_TRANSITIONS,
  resolveAttemptTransition,
  resolveRunTransition,
  resolveTransition,
  RUN_TRANSITIONS,
  TRANSITIONS,
} from '../src/room/state-machine.ts';

const ROOM_STATES = roomStateSchema.options as readonly RoomState[];
const RUN_STATES = runStatusSchema.options as readonly RunStatus[];
const ATTEMPT_STATES = attemptStatusSchema.options as readonly AttemptStatus[];
const ROLES: readonly Role[] = [
  'planner',
  'worker',
  'reviewer',
  'executor',
  'orchestrator',
  'git_controller',
];

// 独立 oracle：直接从 v0.4 Contract（Run/RunAttempt 三层状态所有权）逐条列出合法
// transition 与 initiator role，不 import 实现表来生成期望值。若实现表与 Contract 表
// 不一致，本测试会失败。

// Room 只拥有 planning-only 状态。
const ROOM_PROTOCOL_TRANSITIONS: readonly {
  from: RoomState;
  to: RoomState;
  initiators: readonly Role[];
}[] = [
  { from: 'DISCUSSION', to: 'ARCHITECTURE_REVIEW', initiators: ['planner'] },
  { from: 'ARCHITECTURE_REVIEW', to: 'WAITING_FOR_USER_CONFIRMATION', initiators: ['planner'] },
  { from: 'DISCUSSION', to: 'WAITING_FOR_USER_CONFIRMATION', initiators: ['planner'] },
  { from: 'WAITING_FOR_USER_CONFIRMATION', to: 'DISCUSSION', initiators: ['planner'] },
];

// Run 拥有 execution/review/acceptance lifecycle。
const RUN_PROTOCOL_TRANSITIONS: readonly {
  from: RunStatus;
  to: RunStatus;
  initiators: readonly Role[];
}[] = [
  { from: 'ready', to: 'running', initiators: ['executor'] },
  { from: 'running', to: 'needs_decision', initiators: ['executor'] },
  { from: 'running', to: 'failed', initiators: ['executor'] },
  { from: 'running', to: 'review_required', initiators: ['executor'] },
  { from: 'running', to: 'cancel_requested', initiators: ['planner'] },
  { from: 'cancel_requested', to: 'canceled', initiators: ['executor'] },
  { from: 'needs_decision', to: 'ready', initiators: ['planner'] },
  { from: 'failed', to: 'ready', initiators: ['planner'] },
  { from: 'canceled', to: 'ready', initiators: ['planner'] },
  { from: 'review_required', to: 'review_discussion', initiators: ['reviewer'] },
  { from: 'review_discussion', to: 'ready', initiators: ['planner'] },
  { from: 'review_discussion', to: 'accepted', initiators: ['reviewer'] },
];

// RunAttempt 拥有单次 process 与唯一 terminal outcome。
const ATTEMPT_PROTOCOL_TRANSITIONS: readonly {
  from: AttemptStatus;
  to: AttemptStatus;
  initiators: readonly Role[];
}[] = [
  { from: 'running', to: 'decision_requested', initiators: ['worker'] },
  { from: 'running', to: 'cancel_requested', initiators: ['planner'] },
  { from: 'decision_requested', to: 'cancel_requested', initiators: ['planner'] },
  { from: 'running', to: 'succeeded', initiators: ['executor'] },
  { from: 'running', to: 'failed', initiators: ['executor'] },
  { from: 'running', to: 'interrupted', initiators: ['executor'] },
  { from: 'decision_requested', to: 'needs_decision', initiators: ['executor'] },
  { from: 'cancel_requested', to: 'canceled', initiators: ['executor'] },
];

function errorCode(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return (err as { code?: string }).code ?? null;
  }
}

function assertTableMatches(
  tableName: string,
  actual: readonly { from: string; to: string; initiators: readonly Role[] }[],
  expected: readonly { from: string; to: string; initiators: readonly Role[] }[],
): void {
  assert.equal(actual.length, expected.length, `${tableName} length mismatch`);
  for (const rule of expected) {
    const found = actual.find((t) => t.from === rule.from && t.to === rule.to);
    assert.ok(found, `${tableName}: missing transition ${rule.from} -> ${rule.to}`);
    assert.deepEqual(
      [...found.initiators].sort(),
      [...rule.initiators].sort(),
      `${tableName}: ${rule.from} -> ${rule.to} initiators mismatch`,
    );
  }
}

test('Room planning transition table matches the v0.4 protocol table exactly', () => {
  assertTableMatches('TRANSITIONS', TRANSITIONS, ROOM_PROTOCOL_TRANSITIONS);
});

test('Run lifecycle transition table matches the v0.4 protocol table exactly', () => {
  assertTableMatches('RUN_TRANSITIONS', RUN_TRANSITIONS, RUN_PROTOCOL_TRANSITIONS);
});

test('RunAttempt transition table matches the v0.4 protocol table exactly', () => {
  assertTableMatches('ATTEMPT_TRANSITIONS', ATTEMPT_TRANSITIONS, ATTEMPT_PROTOCOL_TRANSITIONS);
});

function assertAcceptedAndRejected(
  resolveFn: (from: string, to: string, role: Role) => unknown,
  rules: readonly { from: string; to: string; initiators: readonly Role[] }[],
  label: string,
): void {
  for (const rule of rules) {
    for (const role of rule.initiators) {
      assert.doesNotThrow(
        () => resolveFn(rule.from, rule.to, role),
        `${label} ${rule.from} -> ${rule.to} should accept ${role}`,
      );
    }
    for (const role of ROLES) {
      if (rule.initiators.includes(role)) continue;
      assert.equal(
        errorCode(() => resolveFn(rule.from, rule.to, role)),
        'actor_not_allowed',
        `${label} ${rule.from} -> ${rule.to} should reject ${role} with actor_not_allowed`,
      );
    }
  }
}

function assertExhaustiveMatrix(
  resolveFn: (from: string, to: string, role: Role) => unknown,
  states: readonly string[],
  rules: readonly { from: string; to: string }[],
  label: string,
): void {
  for (const from of states) {
    for (const to of states) {
      const listed = rules.some((t) => t.from === from && t.to === to);
      if (listed) continue;
      for (const role of ROLES) {
        assert.equal(
          errorCode(() => resolveFn(from, to, role)),
          'invalid_transition',
          `${label} ${from} -> ${to} should return invalid_transition`,
        );
      }
    }
  }
}

test('every Room transition accepts its documented initiator and rejects other roles', () => {
  assertAcceptedAndRejected(resolveTransition, ROOM_PROTOCOL_TRANSITIONS, 'room');
});

test('Room exhaustive matrix: every unlisted pair returns invalid_transition', () => {
  assertExhaustiveMatrix(resolveTransition, ROOM_STATES, ROOM_PROTOCOL_TRANSITIONS, 'room');
});

test('every Run transition accepts its documented initiator and rejects other roles', () => {
  assertAcceptedAndRejected(resolveRunTransition, RUN_PROTOCOL_TRANSITIONS, 'run');
});

test('Run exhaustive matrix: every unlisted pair returns invalid_transition', () => {
  assertExhaustiveMatrix(resolveRunTransition, RUN_STATES, RUN_PROTOCOL_TRANSITIONS, 'run');
});

test('every RunAttempt transition accepts its documented initiator and rejects other roles', () => {
  assertAcceptedAndRejected(resolveAttemptTransition, ATTEMPT_PROTOCOL_TRANSITIONS, 'attempt');
});

test('RunAttempt exhaustive matrix: every unlisted pair returns invalid_transition', () => {
  assertExhaustiveMatrix(
    resolveAttemptTransition,
    ATTEMPT_STATES,
    ATTEMPT_PROTOCOL_TRANSITIONS,
    'attempt',
  );
});
