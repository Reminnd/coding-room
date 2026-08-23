import { z } from 'zod';

// ROOM_PROTOCOL.md 第 14 节定义的协议错误码。Increment 1 只实现 schema/type 与
// state machine 会触发的错误；git/mcp/claude 相关错误由后续 Increment 抛出。
export const protocolErrorCodeSchema = z.enum([
  'invalid_transition',
  'actor_not_allowed',
  'entity_not_found',
  'id_conflict',
  'validation_failed',
  'git_repository_missing',
  'git_head_missing',
  'worktree_not_clean',
  'run_already_active',
  'claude_start_failed',
  'room_mcp_unavailable',
  'claude_exit_failed',
  'coding_result_invalid',
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
