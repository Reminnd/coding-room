import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ProtocolError } from '../protocol/errors.ts';
import {
  participantProfileSchema,
  persistedTaskSchema,
  questionSchema,
  reviewSchema,
  roleAssignmentSchema,
  runAttemptSchema,
  runGuidanceSchema,
  runSchema,
  taskContractSchema,
  type EventActor,
} from '../protocol/schema.ts';
import type { RoomService } from '../room/room-service.ts';
import {
  getRoomStateSnapshot,
  roomRecordSchema,
  roomStateSnapshotInputSchema,
  roomStateSnapshotSchema,
} from '../room/state-snapshot.ts';

// v0.4 tool surface 的注册层：单一路由 /mcp/participants/:participantId 把 participant
// identity 从 route 传入，每个 tool 映射到 frozen required role，service 层按该 role 的
// RoleAssignment 校验 authority。不信任 caller 传入的 actor string/header；write tool 只
// 映射 RoomService application operation，不直接访问 repository/SQLite，不复制 state
// transition 或 idempotency logic。execution authority 已下放 per-Run：cancel/retry/
// guidance 都以 run_id 显式路由，不存在单一 current Run 被 tools 隐式覆盖。

export interface RoomMcpDependencies {
  service: RoomService;
  projectPath: string;
}

// 成功结果同时返回 JSON text content 与 schema-backed structuredContent。
function toolSuccess(structured: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured as Record<string, unknown>,
  };
}

// ProtocolError → 稳定 {code,message} tool error，不泄露 stack。非 ProtocolError 在
// runTool 中重新抛出，交 SDK 映射为 internal/tool error，不新增平行 Room error code。
function toolError(code: string, message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ code, message }) }],
  };
}

async function runTool(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return toolSuccess(await fn());
  } catch (err) {
    if (err instanceof ProtocolError) {
      return toolError(err.code, err.message);
    }
    throw err;
  }
}

const submitTaskOutputSchema = z.object({
  room: roomRecordSchema,
  task: persistedTaskSchema,
  run: runSchema,
  created: z.boolean(),
});

const submitReviewOutputSchema = z.object({
  room: roomRecordSchema,
  review: reviewSchema,
  run: runSchema,
  created: z.boolean(),
});

const answerQuestionInputSchema = z.object({
  question_id: z.string().min(1),
  answer: z.string(),
  answer_changes_contract: z.boolean(),
});

const answerQuestionOutputSchema = z.object({
  room: roomRecordSchema,
  question: questionSchema,
  run: runSchema,
});

const acceptReviewInputSchema = z.object({
  review_id: z.string().min(1),
  confirmed_by_user: z.boolean(),
});

const acceptReviewOutputSchema = z.object({
  room: roomRecordSchema,
  review: reviewSchema,
  run: runSchema,
});

const askQuestionOutputSchema = z.object({
  room: roomRecordSchema,
  question: questionSchema,
  attempt: runAttemptSchema,
  created: z.boolean(),
});

const roomIdInputSchema = z.object({
  room_id: z.string().min(1),
});

const retryRunInputSchema = z.object({
  room_id: z.string().min(1),
  run_id: z.string().min(1),
});

const retryRunOutputSchema = z.object({
  room: roomRecordSchema,
  run: runSchema,
});

// confirmed_by_user 是 protocol 级 literal true gate：cancel 必须携带用户确认，与
// accept_review 同口径；schema boundary 直接拒绝 false，service 不再重复校验。
const cancelRunInputSchema = z.object({
  room_id: z.string().min(1),
  run_id: z.string().min(1),
  reason: z.string(),
  confirmed_by_user: z.literal(true),
});

const cancelRunOutputSchema = z.object({
  room: roomRecordSchema,
  run: runSchema,
  attempt: runAttemptSchema,
  created: z.boolean(),
});

const addRunGuidanceInputSchema = z.object({
  guidance_id: z.string().min(1),
  room_id: z.string().min(1),
  run_id: z.string().min(1),
  text: z.string().min(1),
});

const addRunGuidanceOutputSchema = z.object({
  room: roomRecordSchema,
  guidance: runGuidanceSchema,
  created: z.boolean(),
});

const createRoomOutputSchema = z.object({
  room: roomRecordSchema,
  created: z.boolean(),
});

const roomOnlyOutputSchema = z.object({
  room: roomRecordSchema,
});

const setParticipantEnabledInputSchema = z.object({
  participant_id: z.string().min(1),
  enabled: z.boolean(),
});

const participantProfileOutputSchema = z.object({
  profile: participantProfileSchema,
  created: z.boolean(),
});

const setParticipantEnabledOutputSchema = z.object({
  profile: participantProfileSchema,
});

const roleAssignmentOutputSchema = z.object({
  assignment: roleAssignmentSchema,
  created: z.boolean(),
});

// tool → frozen required role（与 ROOM_PROTOCOL v0.4 candidate 一致）：
// planner = create/planning/submit/answer/retry/cancel/guidance；reviewer = review/accept；
// worker = ask_question；orchestrator = participant/assignment 管理；executor 只经 Runner
// 的 one-shot claim/settle/progress service boundary 执行，无 MCP write tool；
// room_get_state 是 reader，任意 room member 可读。
export function registerParticipantTools(
  server: McpServer,
  deps: RoomMcpDependencies,
  participantId: string,
): void {
  const planner: EventActor = { participant_id: participantId, actor_role: 'planner' };
  const reviewer: EventActor = { participant_id: participantId, actor_role: 'reviewer' };
  const worker: EventActor = { participant_id: participantId, actor_role: 'worker' };
  const orchestrator: EventActor = { participant_id: participantId, actor_role: 'orchestrator' };

  server.registerTool(
    'room_create',
    {
      description:
        'Create a Room with bootstrap participant profiles and room-scope role assignments, or return the existing Room with created=false when the ID already exists.',
      inputSchema: roomIdInputSchema,
      outputSchema: createRoomOutputSchema,
    },
    (args) => runTool(async () => deps.service.createRoom(args.room_id, planner)),
  );

  server.registerTool(
    'room_begin_architecture_review',
    {
      description: 'Move the Room to ARCHITECTURE_REVIEW for the current planning artifact.',
      inputSchema: roomIdInputSchema,
      outputSchema: roomOnlyOutputSchema,
    },
    (args) =>
      runTool(async () => ({ room: deps.service.transitionToArchitectureReview(args.room_id, planner) })),
  );

  server.registerTool(
    'room_request_user_confirmation',
    {
      description: 'Move the Room to WAITING_FOR_USER_CONFIRMATION to request user confirmation of the plan.',
      inputSchema: roomIdInputSchema,
      outputSchema: roomOnlyOutputSchema,
    },
    (args) =>
      runTool(async () => ({
        room: deps.service.transitionToWaitingForUserConfirmation(args.room_id, planner),
      })),
  );

  server.registerTool(
    'room_retry_run',
    {
      description:
        'Return a failed or canceled Run to ready so its next attempt can be claimed. Needs-decision Runs resume via room_answer_question and review_discussion Runs via a Fix Task; other Runs are unaffected.',
      inputSchema: retryRunInputSchema,
      outputSchema: retryRunOutputSchema,
    },
    (args) => runTool(async () => deps.service.retryRun(args.room_id, args.run_id, planner)),
  );

  server.registerTool(
    'room_cancel_run',
    {
      description:
        'Request cancellation of a Run with an active attempt. The attempt and Run move to cancel_requested; the Executor observes the durable status and settles canceled. Requires confirmed_by_user=true.',
      inputSchema: cancelRunInputSchema,
      outputSchema: cancelRunOutputSchema,
    },
    (args) => runTool(async () => deps.service.cancelRun(args, planner)),
  );

  server.registerTool(
    'room_add_run_guidance',
    {
      description:
        'Add guidance for a Run. Only allowed while the Run has no active attempt; the next claim consumes it exactly once and injects it into the full prompt. Requests during a running attempt are rejected with zero writes.',
      inputSchema: addRunGuidanceInputSchema,
      outputSchema: addRunGuidanceOutputSchema,
    },
    (args) => runTool(async () => deps.service.addRunGuidance(args, planner)),
  );

  server.registerTool(
    'room_get_state',
    {
      description:
        'Read the current Room state snapshot: room, participants, role assignments, all tasks/runs/attempts/guidance/reviews/questions, planning waiting actor, per-Run work items, event cursor, and events after the given sequence.',
      inputSchema: roomStateSnapshotInputSchema,
      outputSchema: roomStateSnapshotSchema,
    },
    (args) =>
      runTool(async () => {
        deps.service.assertRoomParticipant(args.room_id, participantId);
        return getRoomStateSnapshot(deps.service, {
          room_id: args.room_id,
          after_sequence: args.after_sequence ?? null,
        });
      }),
  );

  server.registerTool(
    'room_submit_task',
    {
      description:
        'Submit a Task Contract with an explicit run_id. An implementation Task atomically creates a ready Run and returns the Room to DISCUSSION; a fix Task attaches to an existing review_discussion Run and returns it to ready.',
      inputSchema: taskContractSchema,
      outputSchema: submitTaskOutputSchema,
    },
    (args) => runTool(async () => deps.service.submitTask(args, planner)),
  );

  server.registerTool(
    'room_submit_review',
    {
      description: 'Submit a Review for the latest succeeded attempt of a Run in review_required.',
      inputSchema: reviewSchema,
      outputSchema: submitReviewOutputSchema,
    },
    (args) => runTool(async () => deps.service.submitReview(args, reviewer)),
  );

  server.registerTool(
    'room_answer_question',
    {
      description:
        'Answer an open Question. A contract answer returns the Run to ready; a scope-changing answer moves the Room to planning confirmation and keeps the Run in needs_decision.',
      inputSchema: answerQuestionInputSchema,
      outputSchema: answerQuestionOutputSchema,
    },
    (args) =>
      runTool(async () =>
        deps.service.answerQuestion(args.question_id, args.answer, args.answer_changes_contract, planner),
      ),
  );

  server.registerTool(
    'room_accept_review',
    {
      description: 'Accept the current Review of a Run on behalf of the user, once no blocking findings remain.',
      inputSchema: acceptReviewInputSchema,
      outputSchema: acceptReviewOutputSchema,
    },
    (args) =>
      runTool(async () => deps.service.acceptReview(args.review_id, args.confirmed_by_user, reviewer)),
  );

  server.registerTool(
    'room_ask_question',
    {
      description:
        'Ask a blocking question from the active attempt of a Run. The attempt moves to decision_requested; the Executor stops the process and settles needs_decision. Only the frozen worker of the attempt may call this.',
      inputSchema: questionSchema,
      outputSchema: askQuestionOutputSchema,
    },
    (args) => runTool(async () => deps.service.askQuestion(args, worker)),
  );

  server.registerTool(
    'room_register_participant',
    {
      description: 'Register a new ParticipantProfile (identity). The participant has no command authority until assigned a role.',
      inputSchema: participantProfileSchema,
      outputSchema: participantProfileOutputSchema,
    },
    (args) => runTool(async () => deps.service.registerParticipant(args, orchestrator)),
  );

  server.registerTool(
    'room_set_participant_enabled',
    {
      description: 'Enable or disable a participant. Disabled participants keep readable history but lose new command authority.',
      inputSchema: setParticipantEnabledInputSchema,
      outputSchema: setParticipantEnabledOutputSchema,
    },
    (args) =>
      runTool(async () => deps.service.setParticipantEnabled(args.participant_id, args.enabled, orchestrator)),
  );

  server.registerTool(
    'room_create_role_assignment',
    {
      description: 'Create or replace a RoleAssignment. Exact entity scope resolves before the Room default; the latest assignment for a scope/role is active.',
      inputSchema: roleAssignmentSchema,
      outputSchema: roleAssignmentOutputSchema,
    },
    (args) => runTool(async () => deps.service.createRoleAssignment(args, orchestrator)),
  );
}
