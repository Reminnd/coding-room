import { z } from 'zod';
import { ProtocolError } from '../protocol/errors.ts';
import {
  eventSchema,
  participantProfileSchema,
  persistedTaskSchema,
  questionSchema,
  reviewSchema,
  roleAssignmentSchema,
  roomStateSchema,
  runSchema,
  type Event,
  type ParticipantProfile,
  type PersistedTask,
  type Question,
  type Review,
  type RoleAssignment,
  type RoomState,
  type Run,
} from '../protocol/schema.ts';
import type { RoomRecord } from './repository.ts';
import type { RoomService } from './room-service.ts';

// MCP room_get_state 与 Status CLI 共同调用的只读 Room state snapshot boundary。两个
// adapter 都从这一层读取 current entity / waiting actor / cursor，不各自重建推断规则。
// 只组合 RoomService 既有 read method；snapshot 本身不写 SQLite、不改变 Room state。

// RoomRecord 的持久化 shape 在 repository 定义；协议未定义独立 Room entity schema，这里
// 只为其补充 zod schema，供 MCP structuredContent 输出校验复用。
export const roomRecordSchema = z.object({
  room_id: z.string().min(1),
  state: roomStateSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

// waiting actor 由 Room.state 的固定映射决定，不接受 caller 传入的 actor string/header，
// 不引入第二条 transition path。v0.3 以 Role 表达下一位 actor（user 仍是人工确认点）；
// ACCEPTED 没有下一位 actor，返回 null。
export type WaitingActor = 'planner' | 'worker' | 'reviewer' | 'executor' | 'user' | null;

const WAITING_ACTOR_BY_STATE: Record<RoomState, WaitingActor> = {
  DISCUSSION: 'planner',
  ARCHITECTURE_REVIEW: 'planner',
  WAITING_FOR_USER_CONFIRMATION: 'user',
  PLAN_READY: 'executor',
  CODING: 'worker',
  NEEDS_DECISION: 'user',
  RUN_FAILED: 'planner',
  REVIEW_REQUIRED: 'reviewer',
  REVIEW_DISCUSSION: 'user',
  FIX_PLAN_READY: 'executor',
  ACCEPTED: null,
};

// after_sequence 必须是非负 integer，null/缺省表示从首个 Event 开始。
export const roomStateSnapshotInputSchema = z.object({
  room_id: z.string().min(1),
  after_sequence: z.number().int().min(0).nullable().optional(),
});

export interface RoomStateSnapshot {
  room: RoomRecord;
  participants: ParticipantProfile[];
  role_assignments: RoleAssignment[];
  tasks: PersistedTask[];
  runs: Run[];
  reviews: Review[];
  questions: Question[];
  current_task: PersistedTask | null;
  current_run: Run | null;
  current_review: Review | null;
  current_question: Question | null;
  waiting_actor: WaitingActor;
  cursor: number;
  events: Event[];
}

export const roomStateSnapshotSchema = z.object({
  room: roomRecordSchema,
  participants: z.array(participantProfileSchema),
  role_assignments: z.array(roleAssignmentSchema),
  tasks: z.array(persistedTaskSchema),
  runs: z.array(runSchema),
  reviews: z.array(reviewSchema),
  questions: z.array(questionSchema),
  current_task: persistedTaskSchema.nullable(),
  current_run: runSchema.nullable(),
  current_review: reviewSchema.nullable(),
  current_question: questionSchema.nullable(),
  waiting_actor: z.enum(['planner', 'worker', 'reviewer', 'executor', 'user']).nullable(),
  cursor: z.number().int().min(0),
  events: z.array(eventSchema),
});

// 在升序 Event 序列里解析指定 type 的最新 Event 的 entity_id；无匹配返回 null。current
// entity 以 Event reference 为权威，不扫描 entity content 猜测身份。
function latestEntityId(events: Event[], types: readonly string[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (types.includes(events[i].type)) {
      return events[i].entity_id;
    }
  }
  return null;
}

export function getRoomStateSnapshot(
  service: RoomService,
  input: { room_id: string; after_sequence?: number | null },
): RoomStateSnapshot {
  const room = service.getRoom(input.room_id);
  if (!room) throw new ProtocolError('entity_not_found', `room ${input.room_id} not found`);

  // 全量升序 Event 同时用于 current entity reference 解析与 cursor/events 计算，避免对
  // current identity 二次推断。单机单 Room MVP 规模下全量读取成本可忽略。
  const allEvents = service.listEvents(input.room_id);
  const after = input.after_sequence ?? 0;

  const taskId = latestEntityId(allEvents, ['task_submitted']);
  const runId = latestEntityId(allEvents, ['run_started', 'run_resumed']);
  const reviewId = latestEntityId(allEvents, ['review_submitted']);
  const questionId = latestEntityId(allEvents, ['question_asked']);

  // current Question 只在最新 question_asked 引用的 Question 仍为 open 时返回。
  const question = questionId ? service.getQuestion(questionId) : null;
  const currentQuestion = question !== null && question.status === 'open' ? question : null;

  // 稳定数组一律按 room membership 过滤（repository 层按 content room_id / assignment 归属），
  // 跨 Room 不泄漏；current references 只是 derived convenience，不替代 Event authority。
  const snapshot: RoomStateSnapshot = {
    room,
    participants: service.listRoomParticipants(input.room_id),
    role_assignments: service.listRoleAssignments(input.room_id),
    tasks: service.listTasks(input.room_id),
    runs: service.listRuns(input.room_id),
    reviews: service.listReviews(input.room_id),
    questions: service.listQuestions(input.room_id),
    current_task: taskId ? service.getTask(taskId) : null,
    current_run: runId ? service.getRun(runId) : null,
    current_review: reviewId ? service.getReview(reviewId) : null,
    current_question: currentQuestion,
    waiting_actor: WAITING_ACTOR_BY_STATE[room.state],
    cursor: allEvents.length === 0 ? 0 : allEvents[allEvents.length - 1].sequence,
    events: allEvents.filter((e) => e.sequence > after),
  };
  return snapshot;
}
