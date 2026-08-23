import type { Actor, RoomState } from '../protocol/schema.ts';
import { ProtocolError } from '../protocol/errors.ts';

// ROOM_PROTOCOL.md 第 4 节的合法 transition table。initiators 精确反映表中
// "Initiator" 列（`claude/runner` 与 `codex/runner` 展开为集合）。
export interface TransitionRule {
  readonly from: RoomState;
  readonly to: RoomState;
  readonly initiators: readonly Actor[];
}

export const TRANSITIONS: readonly TransitionRule[] = [
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

// 纯校验：未列出的 (from, to) 返回 invalid_transition；列出的 pair 但 actor 不
// 允许时返回 actor_not_allowed。不接触任何持久化状态，便于 exhaustive matrix 测试。
export function resolveTransition(from: RoomState, to: RoomState, actor: Actor): TransitionRule {
  const rule = TRANSITIONS.find((t) => t.from === from && t.to === to);
  if (!rule) {
    throw new ProtocolError('invalid_transition', `invalid transition from ${from} to ${to}`);
  }
  if (!rule.initiators.includes(actor)) {
    throw new ProtocolError(
      'actor_not_allowed',
      `actor ${actor} is not allowed for transition ${from} -> ${to}`,
    );
  }
  return rule;
}
