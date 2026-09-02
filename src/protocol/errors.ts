import { z } from 'zod';

// ROOM_PROTOCOL.md 第 14 节定义的协议错误码。Increment 1 只实现 schema/type 与
// state machine 会触发的错误；git/mcp/claude 相关错误由后续 Increment 抛出。
export const protocolErrorCodeSchema = z.enum([
  'invalid_transition',
  'actor_not_allowed',
  'entity_not_found',
  'id_conflict',
  'validation_failed',
  'protocol_version_mismatch',
  'git_repository_missing',
  'worktree_not_clean',
  'run_already_active',
  // v0.4：未 accepted Run 的 canonical worktree 已被另一 Run 持有（partial unique
  // index race 或 service guard 检测），禁止同 worktree 双 Run。
  'worktree_already_owned',
  // v0.4：Run 冻结的 worker 不是本实现提供的唯一 claude_code_cli adapter；
  // claim 前拒绝，零副作用。
  'worker_adapter_unavailable',
  'plan_revision_not_approved',
  'scope_conflict',
  'immutable_revision_violation',
  'concurrency_limit_reached',
  'claude_start_failed',
  'room_mcp_unavailable',
  'claude_exit_failed',
  'coding_result_invalid',
  'git_evidence_failed',
  'artifact_write_failed',
]);
export type ProtocolErrorCode = z.infer<typeof protocolErrorCodeSchema>;

export class ProtocolError extends Error {
  readonly code: ProtocolErrorCode;

  constructor(code: ProtocolErrorCode, message: string) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
  }
}
