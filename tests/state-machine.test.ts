import assert from 'node:assert/strict';
import test from 'node:test';
import { roomStateSchema, type Actor, type RoomState } from '../src/protocol/schema.ts';
import { resolveTransition, TRANSITIONS } from '../src/room/state-machine.ts';

const STATES = roomStateSchema.options as readonly RoomState[];
const ACTORS: readonly Actor[] = ['user', 'codex', 'claude', 'runner', 'system'];

// 独立 oracle：直接从 ROOM_PROTOCOL.md 第 4 节逐条列出 14 条合法 transition 与 initiator，
// 不 import 实现表来生成期望值。若实现表与协议表不一致，本测试会失败。
const PROTOCOL_TRANSITIONS: readonly {
  from: RoomState;
  to: RoomState;
  initiators: readonly Actor[];
}[] = [
  { from: 'DISCUSSION', to: 'ARCHITECTURE_REVIEW', initiators: ['codex'] },
  { from: 'ARCHITECTURE_REVIEW', to: 'WAITING_FOR_USER_CONFIRMATION', initiators: ['codex'] },
  { from: 'WAITING_FOR_USER_CONFIRMATION', to: 'PLAN_READY', initiators: ['codex'] },
  { from: 'PLAN_READY', to: 'CODING', initiators: ['runner'] },
  { from: 'CODING', to: 'NEEDS_DECISION', initiators: ['claude', 'runner'] },
  { from: 'NEEDS_DECISION', to: 'CODING', initiators: ['codex', 'runner'] },
  { from: 'NEEDS_DECISION', to: 'WAITING_FOR_USER_CONFIRMATION', initiators: ['codex'] },
  { from: 'CODING', to: 'RUN_FAILED', initiators: ['runner'] },
  { from: 'RUN_FAILED', to: 'PLAN_READY', initiators: ['codex'] },
  { from: 'CODING', to: 'REVIEW_REQUIRED', initiators: ['runner'] },
  { from: 'REVIEW_REQUIRED', to: 'REVIEW_DISCUSSION', initiators: ['codex'] },
  { from: 'REVIEW_DISCUSSION', to: 'FIX_PLAN_READY', initiators: ['codex'] },
  { from: 'FIX_PLAN_READY', to: 'CODING', initiators: ['runner'] },
  { from: 'REVIEW_DISCUSSION', to: 'ACCEPTED', initiators: ['codex'] },
];

function errorCode(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return (err as { code?: string }).code ?? null;
  }
}

test('implementation transition table matches the protocol table exactly', () => {
  assert.equal(TRANSITIONS.length, PROTOCOL_TRANSITIONS.length);
  for (const expected of PROTOCOL_TRANSITIONS) {
    const actual = TRANSITIONS.find((t) => t.from === expected.from && t.to === expected.to);
    assert.ok(actual, `missing transition ${expected.from} -> ${expected.to}`);
    assert.deepEqual(
      [...actual.initiators].sort(),
      [...expected.initiators].sort(),
      `${expected.from} -> ${expected.to} initiators mismatch`,
    );
  }
});

test('every protocol transition accepts its documented initiator and rejects other actors', () => {
  for (const rule of PROTOCOL_TRANSITIONS) {
    for (const actor of rule.initiators) {
      assert.doesNotThrow(
        () => resolveTransition(rule.from, rule.to, actor),
        `${rule.from} -> ${rule.to} should accept ${actor}`,
      );
    }
    for (const actor of ACTORS) {
      if (rule.initiators.includes(actor)) continue;
      assert.equal(
        errorCode(() => resolveTransition(rule.from, rule.to, actor)),
        'actor_not_allowed',
        `${rule.from} -> ${rule.to} should reject ${actor} with actor_not_allowed`,
      );
    }
  }
});

test('exhaustive matrix: every pair not in the protocol table returns invalid_transition', () => {
  for (const from of STATES) {
    for (const to of STATES) {
      const listed = PROTOCOL_TRANSITIONS.some((t) => t.from === from && t.to === to);
      if (listed) continue;
      for (const actor of ACTORS) {
        assert.equal(
          errorCode(() => resolveTransition(from, to, actor)),
          'invalid_transition',
          `${from} -> ${to} should return invalid_transition`,
        );
      }
    }
  }
});
