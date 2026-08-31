import type { Role } from '../protocol/schema.ts';
import { ProtocolError } from '../protocol/errors.ts';

// v0.4 transition authority 由 Role 表达：actor enum 已移除，具体 participant identity
// 由调用方（service/MCP/runner）在 EventActor 中提供，这里只校验 role 是否允许该转换。
// 三层状态所有权分别对应三张表：Room 只有 planning 状态；Run 拥有 execution/review/
// acceptance lifecycle；RunAttempt 拥有单次 process 与唯一 terminal outcome。
export interface TransitionRule {
  readonly from: string;
  readonly to: string;
  readonly initiators: readonly Role[];
}

// ---- Room planning transitions ----
// Room 只拥有单一 planning artifact 的确认阶段。WAITING_FOR_USER_CONFIRMATION → DISCUSSION
// 由 confirmed implementation Task 提交（原子创建 ready Run）触发；DISCUSSION →
// WAITING_FOR_USER_CONFIRMATION 由 scope-changing Question answer 触发（重新进入 planning
// confirmation），也覆盖 planner 为新 Run 启动确认流程（经 ARCHITECTURE_REVIEW）。
export const TRANSITIONS: readonly TransitionRule[] = [
  { from: 'DISCUSSION', to: 'ARCHITECTURE_REVIEW', initiators: ['planner'] },
  { from: 'ARCHITECTURE_REVIEW', to: 'WAITING_FOR_USER_CONFIRMATION', initiators: ['planner'] },
  { from: 'DISCUSSION', to: 'WAITING_FOR_USER_CONFIRMATION', initiators: ['planner'] },
  { from: 'WAITING_FOR_USER_CONFIRMATION', to: 'DISCUSSION', initiators: ['planner'] },
];

// ---- Run lifecycle transitions ----
// Run 是 Implementation/Fix lineage；accepted 是唯一完成终态。failed/needs_decision/
// canceled 保留 evidence 等待人工决定，只有显式 retry/answer/Fix 回到 ready。
export const RUN_TRANSITIONS: readonly TransitionRule[] = [
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

// ---- RunAttempt transitions ----
// terminal status（succeeded|failed|needs_decision|canceled|interrupted）由 executor 唯一
// settle，first-writer-wins；decision_requested 由 frozen worker 的 Question 提交触发，
// cancel_requested 由 planner 的 confirmed cancel 触发（可覆盖 decision_requested）。
export const ATTEMPT_TRANSITIONS: readonly TransitionRule[] = [
  { from: 'running', to: 'decision_requested', initiators: ['worker'] },
  { from: 'running', to: 'cancel_requested', initiators: ['planner'] },
  { from: 'decision_requested', to: 'cancel_requested', initiators: ['planner'] },
  { from: 'running', to: 'succeeded', initiators: ['executor'] },
  { from: 'running', to: 'failed', initiators: ['executor'] },
  { from: 'running', to: 'interrupted', initiators: ['executor'] },
  { from: 'decision_requested', to: 'needs_decision', initiators: ['executor'] },
  { from: 'cancel_requested', to: 'canceled', initiators: ['executor'] },
];

// 纯校验：未列出的 (from, to) 返回 invalid_transition；列出的 pair 但 role 不
// 允许时返回 actor_not_allowed。不接触任何持久化状态，便于 exhaustive matrix 测试。
function resolve(table: readonly TransitionRule[], from: string, to: string, role: Role): TransitionRule {
  const rule = table.find((t) => t.from === from && t.to === to);
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

export function resolveTransition(from: string, to: string, role: Role): TransitionRule {
  return resolve(TRANSITIONS, from, to, role);
}

export function resolveRunTransition(from: string, to: string, role: Role): TransitionRule {
  return resolve(RUN_TRANSITIONS, from, to, role);
}

export function resolveAttemptTransition(from: string, to: string, role: Role): TransitionRule {
  return resolve(ATTEMPT_TRANSITIONS, from, to, role);
}
