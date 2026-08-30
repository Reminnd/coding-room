import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { establishCleanBaseline } from '../git/git-observer.ts';
import { ProtocolError } from '../protocol/errors.ts';
import {
  participantProfileSchema,
  persistedTaskSchema,
  questionSchema,
  reviewSchema,
  roleAssignmentSchema,
  taskContractSchema,
  type EventActor,
  type TaskContract,
} from '../protocol/schema.ts';
import type { RoomService } from '../room/room-service.ts';
import {
  getRoomStateSnapshot,
  roomRecordSchema,
  roomStateSnapshotInputSchema,
  roomStateSnapshotSchema,
} from '../room/state-snapshot.ts';

// v0.3 tool surface 的注册层：单一路由 /mcp/participants/:participantId 把 participant
// identity 从 route 传入，每个 tool 映射到 frozen required role，service 层按该 role 的
// RoleAssignment 校验 authority。不信任 caller 传入的 actor string/header；write tool 只
// 映射 RoomService application operation，不直接访问 repository/SQLite，不复制 state
// transition 或 idempotency logic。

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

// room_submit_task 的 Git gate 顺序：先查 existing Task，命中则直接委托 RoomService 保留
// same-content idempotent retry 与 different-content id_conflict；仅首次 type=implementation
// 提交才调用 establishCleanBaseline。fix 不重新要求 clean baseline。
async function submitTask(
  deps: RoomMcpDependencies,
  actor: EventActor,
  task: TaskContract,
): Promise<unknown> {
  const existing = deps.service.getTask(task.task_id);
  if (!existing && task.type === 'implementation') {
    const baseline = await establishCleanBaseline(deps.projectPath);
    const result = deps.service.submitTask(task, actor);
    return { ...result, observed_baseline_head: baseline.baselineHead };
  }
  const result = deps.service.submitTask(task, actor);
  return { ...result, observed_baseline_head: null };
}

const submitTaskOutputSchema = z.object({
  room: roomRecordSchema,
  task: persistedTaskSchema,
  created: z.boolean(),
  observed_baseline_head: z.string().nullable(),
});

const submitReviewOutputSchema = z.object({
  room: roomRecordSchema,
  review: reviewSchema,
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
});

const acceptReviewInputSchema = z.object({
  review_id: z.string().min(1),
  confirmed_by_user: z.boolean(),
});

const acceptReviewOutputSchema = z.object({
  room: roomRecordSchema,
  review: reviewSchema,
});

const askQuestionOutputSchema = z.object({
  room: roomRecordSchema,
  question: questionSchema,
  created: z.boolean(),
});

const roomIdInputSchema = z.object({
  room_id: z.string().min(1),
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

// tool → frozen required role（与 ROOM_PROTOCOL v0.3 candidate 一致）：
// planner = create/planning/submit/answer；reviewer = review/accept；
// worker = ask_question；orchestrator = participant/assignment 管理；
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
      description: 'Move the Room to ARCHITECTURE_REVIEW for the current Task.',
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
      description: 'Return a failed Run to PLAN_READY so the Runner can retry the same Task.',
      inputSchema: roomIdInputSchema,
      outputSchema: roomOnlyOutputSchema,
    },
    (args) => runTool(async () => ({ room: deps.service.retryAfterFailure(args.room_id, planner) })),
  );

  server.registerTool(
    'room_get_state',
    {
      description:
        'Read the current Room state snapshot: room, participants, role assignments, all tasks/runs/reviews/questions, current task/run/review/open question, waiting actor, event cursor, and events after the given sequence.',
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
        'Submit a Task Contract. First-time implementation submission requires a clean Git worktree; fix tasks and same-content retries skip the gate.',
      inputSchema: taskContractSchema,
      outputSchema: submitTaskOutputSchema,
    },
    (args) => runTool(async () => submitTask(deps, planner, args)),
  );

  server.registerTool(
    'room_submit_review',
    {
      description: 'Submit a Review for the current completed Run.',
      inputSchema: reviewSchema,
      outputSchema: submitReviewOutputSchema,
    },
    (args) => runTool(async () => deps.service.submitReview(args, reviewer)),
  );

  server.registerTool(
    'room_answer_question',
    {
      description: 'Answer an open Question, optionally recording that the answer changes the contract.',
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
      description: 'Accept the current Review on behalf of the user, once no blocking findings remain.',
      inputSchema: acceptReviewInputSchema,
      outputSchema: acceptReviewOutputSchema,
    },
    (args) =>
      runTool(async () => deps.service.acceptReview(args.review_id, args.confirmed_by_user, reviewer)),
  );

  server.registerTool(
    'room_ask_question',
    {
      description: 'Ask a blocking question to the user, moving the Room to NEEDS_DECISION.',
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
