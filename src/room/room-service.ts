import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { ProtocolError } from '../protocol/errors.ts';
import {
  codingResultSchema,
  questionSchema,
  reviewSchema,
  runSchema,
  taskContractSchema,
  type Actor,
  type CodingResult,
  type Event,
  type Question,
  type Review,
  type RoomState,
  type Run,
  type TaskContract,
} from '../protocol/schema.ts';
import { RoomRepository, type RoomRecord } from './repository.ts';
import { resolveTransition } from './state-machine.ts';

// application service 是唯一拥有 rooms.state 修改权限的模块。每个公开方法都在单个
// SQLite transaction 内完成 entity write、state change 与 Event append，失败即回滚。
export class RoomService {
  private readonly db: DatabaseSync;
  private readonly repo: RoomRepository;
  private readonly setStateStmt: ReturnType<DatabaseSync['prepare']>;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.repo = new RoomRepository(db);
    this.setStateStmt = db.prepare('UPDATE rooms SET state = ?, updated_at = ? WHERE room_id = ?');
  }

  // ---- Room creation ----
  createRoom(roomId: string): { room: RoomRecord; created: boolean } {
    return this.tx(() => {
      const { room, created } = this.repo.createRoom(roomId, this.now());
      if (!created) return { room, created: false };
      this.repo.appendEvent({
        room_id: roomId,
        type: 'room_created',
        actor: 'system',
        entity_type: 'room',
        entity_id: roomId,
        summary: `room ${roomId} created`,
        created_at: this.now(),
      });
      return { room, created: true };
    });
  }

  // ---- Planning transitions (codex) ----
  transitionToArchitectureReview(roomId: string): RoomRecord {
    return this.tx(() =>
      this.planningTransition(roomId, 'ARCHITECTURE_REVIEW', `room ${roomId} moved to ARCHITECTURE_REVIEW`),
    );
  }

  transitionToWaitingForUserConfirmation(roomId: string): RoomRecord {
    return this.tx(() =>
      this.planningTransition(
        roomId,
        'WAITING_FOR_USER_CONFIRMATION',
        `room ${roomId} moved to WAITING_FOR_USER_CONFIRMATION`,
      ),
    );
  }

  retryAfterFailure(roomId: string): RoomRecord {
    return this.tx(() =>
      this.planningTransition(roomId, 'PLAN_READY', `room ${roomId} retry after failure`),
    );
  }

  // ---- Task submission (codex) ----
  submitTask(input: unknown): { room: RoomRecord; task: TaskContract; created: boolean } {
    const task = this.parse(taskContractSchema, input, 'TaskContract') as TaskContract;
    return this.tx(() => {
      this.requireRoom(task.room_id);
      const inserted = this.repo.insertTask(task);
      if (!inserted.created) {
        return { room: this.requireRoom(task.room_id), task: this.requireTask(task.task_id), created: false };
      }
      if (task.type === 'fix') {
        this.validateFixReferences(task);
        this.applyTransition(task.room_id, 'FIX_PLAN_READY', 'codex');
      } else {
        this.applyTransition(task.room_id, 'PLAN_READY', 'codex');
      }
      this.repo.appendEvent({
        room_id: task.room_id,
        type: 'task_submitted',
        actor: 'codex',
        entity_type: 'task',
        entity_id: task.task_id,
        summary: `task ${task.task_id} submitted (${task.type})`,
        created_at: this.now(),
      });
      return { room: this.requireRoom(task.room_id), task, created: true };
    });
  }

  // ---- Run lifecycle (runner) ----
  startRun(input: unknown): { room: RoomRecord; run: Run; created: boolean } {
    const run = this.normalizeRunForCoding(this.parse(runSchema, input, 'Run') as Run);
    return this.tx(() => {
      this.assertRunTask(run);
      const inserted = this.repo.insertRun(run);
      if (!inserted.created) {
        return { room: this.requireRoom(run.room_id), run: this.requireRun(run.run_id), created: false };
      }
      this.applyTransition(run.room_id, 'CODING', 'runner');
      this.repo.appendEvent({
        room_id: run.room_id,
        type: 'run_started',
        actor: 'runner',
        entity_type: 'run',
        entity_id: run.run_id,
        summary: `run ${run.run_id} started`,
        created_at: this.now(),
      });
      return { room: this.requireRoom(run.room_id), run, created: true };
    });
  }

  resumeRun(input: unknown): { room: RoomRecord; run: Run; created: boolean } {
    const run = this.normalizeRunForCoding(this.parse(runSchema, input, 'Run') as Run);
    return this.tx(() => {
      this.assertRunTask(run);
      const inserted = this.repo.insertRun(run);
      if (!inserted.created) {
        return { room: this.requireRoom(run.room_id), run: this.requireRun(run.run_id), created: false };
      }
      this.applyTransition(run.room_id, 'CODING', 'runner');
      this.repo.appendEvent({
        room_id: run.room_id,
        type: 'run_resumed',
        actor: 'runner',
        entity_type: 'run',
        entity_id: run.run_id,
        summary: `run ${run.run_id} resumed`,
        created_at: this.now(),
      });
      return { room: this.requireRoom(run.room_id), run, created: true };
    });
  }

  completeRun(runId: string, resultInput: unknown): { room: RoomRecord; run: Run } {
    return this.tx(() => {
      const run = this.requireRun(runId);
      this.assertRunRunning(run);
      const result = this.parseCodingResult(resultInput);
      if (result.status !== 'completed') {
        throw new ProtocolError(
          'coding_result_invalid',
          `coding result status ${result.status} cannot complete a run`,
        );
      }
      if (result.task_id !== run.task_id) {
        throw new ProtocolError(
          'coding_result_invalid',
          `coding result task_id ${result.task_id} does not match run task ${run.task_id}`,
        );
      }
      const updated: Run = { ...run, status: 'succeeded', result, completed_at: this.now() };
      this.repo.updateRun(updated);
      this.applyTransition(run.room_id, 'REVIEW_REQUIRED', 'runner');
      this.repo.appendEvent({
        room_id: run.room_id,
        type: 'run_completed',
        actor: 'runner',
        entity_type: 'run',
        entity_id: runId,
        summary: `run ${runId} completed`,
        created_at: this.now(),
      });
      return { room: this.requireRoom(run.room_id), run: updated };
    });
  }

  failRun(runId: string, failure: { code: string; message: string }): { room: RoomRecord; run: Run } {
    return this.tx(() => {
      const run = this.requireRun(runId);
      this.assertRunRunning(run);
      const updated: Run = { ...run, status: 'failed', failure, completed_at: this.now() };
      this.repo.updateRun(updated);
      this.applyTransition(run.room_id, 'RUN_FAILED', 'runner');
      this.repo.appendEvent({
        room_id: run.room_id,
        type: 'run_failed',
        actor: 'runner',
        entity_type: 'run',
        entity_id: runId,
        summary: `run ${runId} failed`,
        created_at: this.now(),
      });
      return { room: this.requireRoom(run.room_id), run: updated };
    });
  }

  // ---- Question (claude / codex) ----
  askQuestion(input: unknown): { room: RoomRecord; question: Question; created: boolean } {
    const question = this.parse(questionSchema, input, 'Question') as Question;
    return this.tx(() => {
      const normalized: Question = {
        ...question,
        status: 'open',
        answer: null,
        answer_changes_contract: null,
        answered_at: null,
      };
      const inserted = this.repo.insertQuestion(normalized);
      if (!inserted.created) {
        return {
          room: this.requireRoom(question.room_id),
          question: this.requireQuestion(question.question_id),
          created: false,
        };
      }
      const run = this.requireRun(question.run_id);
      this.assertRunRunning(run);
      if (run.room_id !== question.room_id || run.task_id !== question.task_id) {
        throw new ProtocolError(
          'validation_failed',
          `question ${question.question_id} references run ${run.run_id} that does not match task/room`,
        );
      }
      const updatedRun: Run = { ...run, status: 'needs_decision' };
      this.repo.updateRun(updatedRun);
      this.applyTransition(question.room_id, 'NEEDS_DECISION', 'claude');
      this.repo.appendEvent({
        room_id: question.room_id,
        type: 'question_asked',
        actor: 'claude',
        entity_type: 'question',
        entity_id: question.question_id,
        summary: `question ${question.question_id} asked`,
        created_at: this.now(),
      });
      return {
        room: this.requireRoom(question.room_id),
        question: normalized,
        created: true,
      };
    });
  }

  answerQuestion(
    questionId: string,
    answer: string,
    answerChangesContract: boolean,
  ): { room: RoomRecord; question: Question } {
    return this.tx(() => {
      const question = this.requireQuestion(questionId);
      if (question.status !== 'open') {
        throw new ProtocolError('validation_failed', `question ${questionId} is not open`);
      }
      const answered: Question = {
        ...question,
        status: 'answered',
        answer,
        answer_changes_contract: answerChangesContract,
        answered_at: this.now(),
      };
      this.repo.updateQuestion(answered);
      if (answerChangesContract) {
        this.applyTransition(question.room_id, 'WAITING_FOR_USER_CONFIRMATION', 'codex');
      }
      this.repo.appendEvent({
        room_id: question.room_id,
        type: 'question_answered',
        actor: 'codex',
        entity_type: 'question',
        entity_id: questionId,
        summary: `question ${questionId} answered`,
        created_at: this.now(),
      });
      return { room: this.requireRoom(question.room_id), question: answered };
    });
  }

  // ---- Review (codex) ----
  submitReview(input: unknown): { room: RoomRecord; review: Review; created: boolean } {
    const review = this.parse(reviewSchema, input, 'Review') as Review;
    return this.tx(() => {
      // 幂等判断优先：同 ID/同 content 的重复提交是已完成 create 的幂等重试，直接返回既有
      // Review 且不新增 Event；同 ID/异 content 由 insertReview 抛 id_conflict。只有新 Review
      // 才进入后续 lifecycle guard 与 state transition。
      const inserted = this.repo.insertReview(review);
      if (!inserted.created) {
        return { room: this.requireRoom(review.room_id), review: this.requireReview(review.review_id), created: false };
      }
      const task = this.requireTask(review.task_id);
      const run = this.requireRun(review.run_id);
      if (task.room_id !== review.room_id) {
        throw new ProtocolError('validation_failed', `review ${review.review_id} references task from another room`);
      }
      if (run.task_id !== review.task_id) {
        throw new ProtocolError('validation_failed', `review ${review.review_id} references run ${run.run_id} of another task`);
      }
      if (run.room_id !== review.room_id) {
        throw new ProtocolError('validation_failed', `review ${review.review_id} references run ${run.run_id} from another room`);
      }
      if (run.status !== 'succeeded') {
        throw new ProtocolError('validation_failed', `review ${review.review_id} references run ${run.run_id} that is not succeeded`);
      }
      if (!run.result || run.result.status !== 'completed') {
        throw new ProtocolError('validation_failed', `review ${review.review_id} references run ${run.run_id} without a completed coding result`);
      }
      // REVIEW_REQUIRED 只能由 completeRun 在同一 transaction 内追加 run_completed Event 产生，
      // 因此该 Room sequence 最大的 run_completed Event 指向的 Run 就是当前可审查 Run。
      if (run.run_id !== this.currentRunId(review.room_id)) {
        throw new ProtocolError('validation_failed', `review ${review.review_id} references run ${run.run_id} which is not the current completed run`);
      }
      this.applyTransition(review.room_id, 'REVIEW_DISCUSSION', 'codex');
      this.repo.appendEvent({
        room_id: review.room_id,
        type: 'review_submitted',
        actor: 'codex',
        entity_type: 'review',
        entity_id: review.review_id,
        summary: `review ${review.review_id} submitted`,
        created_at: this.now(),
      });
      return { room: this.requireRoom(review.room_id), review, created: true };
    });
  }

  acceptReview(reviewId: string, confirmedByUser: boolean): { room: RoomRecord; review: Review } {
    return this.tx(() => {
      const review = this.requireReview(reviewId);
      if (confirmedByUser !== true) {
        throw new ProtocolError('validation_failed', `review ${reviewId} acceptance requires confirmed_by_user`);
      }
      if (review.findings.some((f) => f.severity === 'blocker')) {
        throw new ProtocolError('validation_failed', `review ${reviewId} still has blocking findings`);
      }
      if (review.review_id !== this.currentReviewId(review.room_id)) {
        throw new ProtocolError('validation_failed', `review ${reviewId} is not the current review`);
      }
      this.applyTransition(review.room_id, 'ACCEPTED', 'codex');
      this.repo.appendEvent({
        room_id: review.room_id,
        type: 'review_accepted',
        actor: 'codex',
        entity_type: 'review',
        entity_id: reviewId,
        summary: `review ${reviewId} accepted`,
        created_at: this.now(),
      });
      return { room: this.requireRoom(review.room_id), review };
    });
  }

  // ---- Read (delegated, read-only) ----
  getRoom(roomId: string): RoomRecord | null {
    return this.repo.getRoom(roomId);
  }

  getTask(taskId: string): TaskContract | null {
    return this.repo.getTask(taskId);
  }

  getRun(runId: string): Run | null {
    return this.repo.getRun(runId);
  }

  getReview(reviewId: string): Review | null {
    return this.repo.getReview(reviewId);
  }

  getQuestion(questionId: string): Question | null {
    return this.repo.getQuestion(questionId);
  }

  listEvents(roomId: string, afterSequence?: number): Event[] {
    return this.repo.listEvents(roomId, afterSequence);
  }

  // ---- Private ----
  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  private now(): string {
    return new Date().toISOString();
  }

  private applyTransition(roomId: string, to: RoomState, actor: Actor): RoomRecord {
    const room = this.requireRoom(roomId);
    resolveTransition(room.state, to, actor);
    const updatedAt = this.now();
    this.setStateStmt.run(to, updatedAt, roomId);
    return { ...room, state: to, updated_at: updatedAt };
  }

  private planningTransition(roomId: string, to: RoomState, summary: string): RoomRecord {
    const room = this.applyTransition(roomId, to, 'codex');
    this.repo.appendEvent({
      room_id: roomId,
      type: 'state_transition',
      actor: 'codex',
      entity_type: 'room',
      entity_id: roomId,
      summary,
      created_at: this.now(),
    });
    return room;
  }

  private validateFixReferences(task: TaskContract): void {
    if (task.type !== 'fix') return;
    const parent = this.requireTask(task.parent_task_id ?? '');
    const review = this.requireReview(task.based_on_review_id ?? '');
    if (parent.room_id !== task.room_id) {
      throw new ProtocolError(
        'validation_failed',
        `fix task ${task.task_id} references parent task from another room`,
      );
    }
    if (review.room_id !== task.room_id || review.task_id !== parent.task_id) {
      throw new ProtocolError(
        'validation_failed',
        `fix task ${task.task_id} references review ${review.review_id} that does not target parent task ${parent.task_id}`,
      );
    }
    if (review.review_id !== this.currentReviewId(task.room_id)) {
      throw new ProtocolError(
        'validation_failed',
        `fix task ${task.task_id} references review ${review.review_id} which is not the current review`,
      );
    }
    for (const finding of task.confirmed_findings ?? []) {
      if (!review.findings.some((f) => f.finding_id === finding.finding_id)) {
        throw new ProtocolError(
          'validation_failed',
          `confirmed finding ${finding.finding_id} does not exist in review ${review.review_id}`,
        );
      }
    }
  }

  private assertRunTask(run: Run): void {
    const task = this.requireTask(run.task_id);
    if (task.room_id !== run.room_id) {
      throw new ProtocolError('validation_failed', `run ${run.run_id} references task from another room`);
    }
  }

  private normalizeRunForCoding(run: Run): Run {
    if (run.status !== 'starting' && run.status !== 'running') {
      throw new ProtocolError('validation_failed', `run ${run.run_id} status ${run.status} cannot enter CODING`);
    }
    return { ...run, status: 'running' };
  }

  private assertRunRunning(run: Run): void {
    if (run.status !== 'running') {
      throw new ProtocolError('validation_failed', `run ${run.run_id} is not running (status ${run.status})`);
    }
  }

  private currentReviewId(roomId: string): string | null {
    return this.repo.latestEventEntityId(roomId, 'review_submitted');
  }

  private currentRunId(roomId: string): string | null {
    return this.repo.latestEventEntityId(roomId, 'run_completed');
  }

  private requireRoom(roomId: string): RoomRecord {
    const room = this.repo.getRoom(roomId);
    if (!room) throw new ProtocolError('entity_not_found', `room ${roomId} not found`);
    return room;
  }

  private requireTask(taskId: string): TaskContract {
    const task = this.repo.getTask(taskId);
    if (!task) throw new ProtocolError('entity_not_found', `task ${taskId} not found`);
    return task;
  }

  private requireRun(runId: string): Run {
    const run = this.repo.getRun(runId);
    if (!run) throw new ProtocolError('entity_not_found', `run ${runId} not found`);
    return run;
  }

  private requireReview(reviewId: string): Review {
    const review = this.repo.getReview(reviewId);
    if (!review) throw new ProtocolError('entity_not_found', `review ${reviewId} not found`);
    return review;
  }

  private requireQuestion(questionId: string): Question {
    const question = this.repo.getQuestion(questionId);
    if (!question) throw new ProtocolError('entity_not_found', `question ${questionId} not found`);
    return question;
  }

  private parse(schema: z.ZodTypeAny, data: unknown, label: string): unknown {
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((issue) => issue.message).join('; ');
      throw new ProtocolError('validation_failed', `${label} validation failed: ${detail}`);
    }
    return parsed.data;
  }

  private parseCodingResult(input: unknown): CodingResult {
    const parsed = codingResultSchema.safeParse(input);
    if (!parsed.success) {
      throw new ProtocolError('coding_result_invalid', 'coding result is invalid');
    }
    return parsed.data;
  }
}
