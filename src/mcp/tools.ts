import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { establishCleanBaseline } from '../git/git-observer.ts';
import { ProtocolError } from '../protocol/errors.ts';
import {
  questionSchema,
  reviewSchema,
  taskContractSchema,
  type TaskContract,
} from '../protocol/schema.ts';
import type { RoomService } from '../room/room-service.ts';
import {
  getRoomStateSnapshot,
  roomRecordSchema,
  roomStateSnapshotInputSchema,
  roomStateSnapshotSchema,
} from '../room/state-snapshot.ts';

// actor-scoped tool surface 的注册层。actor authority 由 route 的 exact registration 决定，
// 不信任 caller 传入的 actor string/header；write tool 只映射 RoomService application
// operation，不直接访问 repository/SQLite，不复制 state transition 或 idempotency logic。

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
async function submitTask(deps: RoomMcpDependencies, task: TaskContract): Promise<unknown> {
  const existing = deps.service.getTask(task.task_id);
  if (!existing && task.type === 'implementation') {
    const baseline = await establishCleanBaseline(deps.projectPath);
    const result = deps.service.submitTask(task);
    return { ...result, observed_baseline_head: baseline.baselineHead };
  }
  const result = deps.service.submitTask(task);
  return { ...result, observed_baseline_head: null };
}

const submitTaskOutputSchema = z.object({
  room: roomRecordSchema,
  task: taskContractSchema,
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

// /mcp/codex 只能列出并调用这九个 Codex tool。
export function registerCodexTools(server: McpServer, deps: RoomMcpDependencies): void {
  server.registerTool(
    'room_create',
    {
      description:
        'Create a Room, or return the existing Room with created=false when the ID already exists.',
      inputSchema: roomIdInputSchema,
      outputSchema: createRoomOutputSchema,
    },
    (args) => runTool(async () => deps.service.createRoom(args.room_id)),
  );

  server.registerTool(
    'room_begin_architecture_review',
    {
      description: 'Move the Room to ARCHITECTURE_REVIEW for the current Task.',
      inputSchema: roomIdInputSchema,
      outputSchema: roomOnlyOutputSchema,
    },
    (args) => runTool(async () => ({ room: deps.service.transitionToArchitectureReview(args.room_id) })),
  );

  server.registerTool(
    'room_request_user_confirmation',
    {
      description: 'Move the Room to WAITING_FOR_USER_CONFIRMATION to request user confirmation of the plan.',
      inputSchema: roomIdInputSchema,
      outputSchema: roomOnlyOutputSchema,
    },
    (args) =>
      runTool(async () => ({ room: deps.service.transitionToWaitingForUserConfirmation(args.room_id) })),
  );

  server.registerTool(
    'room_retry_run',
    {
      description: 'Return a failed Run to PLAN_READY so the Runner can retry the same Task.',
      inputSchema: roomIdInputSchema,
      outputSchema: roomOnlyOutputSchema,
    },
    (args) => runTool(async () => ({ room: deps.service.retryAfterFailure(args.room_id) })),
  );

  server.registerTool(
    'room_get_state',
    {
      description:
        'Read the current Room state snapshot: room state, current task/run/review/open question, waiting actor, event cursor, and events after the given sequence.',
      inputSchema: roomStateSnapshotInputSchema,
      outputSchema: roomStateSnapshotSchema,
    },
    (args) =>
      runTool(async () =>
        getRoomStateSnapshot(deps.service, {
          room_id: args.room_id,
          after_sequence: args.after_sequence ?? null,
        }),
      ),
  );

  server.registerTool(
    'room_submit_task',
    {
      description:
        'Submit a Task Contract. First-time implementation submission requires a clean Git worktree; fix tasks and same-content retries skip the gate.',
      inputSchema: taskContractSchema,
      outputSchema: submitTaskOutputSchema,
    },
    (args) => runTool(async () => submitTask(deps, args)),
  );

  server.registerTool(
    'room_submit_review',
    {
      description: 'Submit a Review for the current completed Run.',
      inputSchema: reviewSchema,
      outputSchema: submitReviewOutputSchema,
    },
    (args) => runTool(async () => deps.service.submitReview(args)),
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
        deps.service.answerQuestion(args.question_id, args.answer, args.answer_changes_contract),
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
      runTool(async () => deps.service.acceptReview(args.review_id, args.confirmed_by_user)),
  );
}

// /mcp/claude 只能列出并调用 room_ask_question；保持 Runner 已冻结的
// mcp__agent_room__room_ask_question required tool authority。
export function registerClaudeTools(server: McpServer, deps: RoomMcpDependencies): void {
  server.registerTool(
    'room_ask_question',
    {
      description: 'Ask a blocking question to the user, moving the Room to NEEDS_DECISION.',
      inputSchema: questionSchema,
      outputSchema: askQuestionOutputSchema,
    },
    (args) => runTool(async () => deps.service.askQuestion(args)),
  );
}
