import type { Role, RoomState } from '../protocol/schema.ts';
import { ProtocolError } from '../protocol/errors.ts';

// v0.3 transition authority 由 Role 表达：actor enum 已移除，具体 participant identity
// 由调用方（service/MCP/runner）在 EventActor 中提供，这里只校验 role 是否允许该转换。
export interface TransitionRule {
  readonly from: RoomState;
  readonly to: RoomState;
  readonly initiators: readonly Role[];
}

export const TRANSITIONS: readonly TransitionRule[] = [
  { from: 'DISCUSSION', to: 'ARCHITECTURE_REVIEW', initiators: ['planner'] },
  { from: 'ARCHITECTURE_REVIEW', to: 'WAITING_FOR_USER_CONFIRMATION', initiators: ['planner'] },
  { from: 'WAITING_FOR_USER_CONFIRMATION', to: 'PLAN_READY', initiators: ['planner'] },
  { from: 'PLAN_READY', to: 'CODING', initiators: ['executor'] },
  { from: 'CODING', to: 'NEEDS_DECISION', initiators: ['worker', 'executor'] },
  { from: 'NEEDS_DECISION', to: 'CODING', initiators: ['planner', 'executor'] },
  { from: 'NEEDS_DECISION', to: 'WAITING_FOR_USER_CONFIRMATION', initiators: ['planner'] },
  { from: 'CODING', to: 'RUN_FAILED', initiators: ['executor'] },
  { from: 'RUN_FAILED', to: 'PLAN_READY', initiators: ['planner'] },
  { from: 'CODING', to: 'REVIEW_REQUIRED', initiators: ['executor'] },
  { from: 'REVIEW_REQUIRED', to: 'REVIEW_DISCUSSION', initiators: ['reviewer'] },
  { from: 'REVIEW_DISCUSSION', to: 'FIX_PLAN_READY', initiators: ['planner'] },
  { from: 'FIX_PLAN_READY', to: 'CODING', initiators: ['executor'] },
  { from: 'REVIEW_DISCUSSION', to: 'ACCEPTED', initiators: ['reviewer'] },
];

// 纯校验：未列出的 (from, to) 返回 invalid_transition；列出的 pair 但 role 不
// 允许时返回 actor_not_allowed。不接触任何持久化状态，便于 exhaustive matrix 测试。
export function resolveTransition(from: RoomState, to: RoomState, role: Role): TransitionRule {
  const rule = TRANSITIONS.find((t) => t.from === from && t.to === to);
  if (!rule) {
    throw new ProtocolError('invalid_transition', `invalid transition from ${from} to ${to}`);
  }
  if (!rule.initiators.includes(role)) {
    throw new ProtocolError(
      'actor_not_allowed',
      `role ${role} is not allowed for transition ${from} -> ${to}`,
    );
  }
  return rule;
}
