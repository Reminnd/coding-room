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

// Runner 在 terminal transition 时必须随 result/failure 一并持久化的完成证据：session、
// process exit、Git evidence 与 artifact refs 都在同一 RoomService transaction 内提交，
// 避免 succeeded/failed Run 缺少已观察到的 process/Git/artifact evidence。git_evidence 的
// shape 与 Run.git_evidence 一致，但不 import schema.ts 的未导出 zod schema。
export interface RunTerminalEvidence {
  claude_session_id: string | null;
  process_exit_code: number | null;
  git_evidence: { staged: string[]; unstaged: string[]; untracked: string[] };
  artifact_refs: string[];
}

// 只读 continuation context：Runner 在 spawn 前据此推导 Decision/Fix resume 的 exact session、
// baseline 与 answered Question，不接受 caller 覆盖这些 authority。new_implementation 表示首次
// Implementation（或 RUN_FAILED retry）走 clean-baseline start，不继承任何 lineage。
export type ContinuationContext =
  | { kind: 'new_implementation'; sourceRun: null; question: null; review: null }
  | { kind: 'decision'; sourceRun: Run; question: Question; review: null }
  | { kind: 'fix'; sourceRun: Run; question: null; review: Review };

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
      this.assertCurrentTask(run);
      this.assertStartableState(run);
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
      this.assertCurrentTask(run);
      this.assertResumableState(run);
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

  completeRun(
    runId: string,
    resultInput: unknown,
    evidence: RunTerminalEvidence,
  ): { room: RoomRecord; run: Run } {
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
      // terminal evidence 与 succeeded status 在同一 transaction 提交，保证 succeeded Run
      // 始终携带已观察的 session/exit/Git/artifact evidence。
      const updated: Run = {
        ...run,
        status: 'succeeded',
        result,
        claude_session_id: evidence.claude_session_id,
        process_exit_code: evidence.process_exit_code,
        git_evidence: evidence.git_evidence,
        artifact_refs: evidence.artifact_refs,
        completed_at: this.now(),
      };
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

  failRun(
    runId: string,
    failure: { code: string; message: string },
    evidence: RunTerminalEvidence,
  ): { room: RoomRecord; run: Run } {
    return this.tx(() => {
      const run = this.requireRun(runId);
      this.assertRunRunning(run);
      // 即使 Run 失败也持久化已成功观察到的 evidence，避免 failed Run 丢失已观察的
      // process/Git/artifact 事实；evidence 与 failure 在同一 transaction 提交。
      const updated: Run = {
        ...run,
        status: 'failed',
        failure,
        claude_session_id: evidence.claude_session_id,
        process_exit_code: evidence.process_exit_code,
        git_evidence: evidence.git_evidence,
        artifact_refs: evidence.artifact_refs,
        completed_at: this.now(),
      };
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

  // Runner 实时把非终态 progress evidence 追加为 entity_type=run 的非终态 Event。progress
  // 不是状态权威来源：不改变 Room/Run state，也不产生 transition。只接受 current running
  // Run，stale/non-running Run 以 validation_failed 拒绝且不新增 Event。
  appendRunProgress(
    runId: string,
    progress: { type: string | null; subtype: string | null; outcome: string | null },
  ): void {
    this.tx(() => {
      const run = this.requireRun(runId);
      this.assertRunRunning(run);
      const label = [progress.type, progress.subtype].filter((p): p is string => p !== null).join(':') || 'unknown';
      this.repo.appendEvent({
        room_id: run.room_id,
        type: 'run_progress',
        actor: 'runner',
        entity_type: 'run',
        entity_id: runId,
        summary: `run ${runId} progress ${label}`,
        created_at: this.now(),
      });
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
      // answer 前必须确认该 Question 是 Room 最新 question_asked 引用的 open Question、
      // source Run 为 current needs_decision Run 且已完成 pause finalization（completed_at
      // 非 null），避免旧 process 与 resume process 并行修改同一 worktree。
      this.assertAnswerableQuestion(question);
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

  // needs-decision Run 的 pause finalization：Claude process 退出后 Runner 调用，把已观察的
  // session/exit/result/failure/Git/artifact evidence 与 completed_at 原子写回同一 needs_decision
  // Run，保持 Room=NEEDS_DECISION、Run.status=needs_decision，并追加恰好一个 run_paused Event。
  // 相同 finalization payload 的 retry 返回既有 Run 且不重复 Event，不同 payload 以 id_conflict 拒绝。
  finalizeNeedsDecision(
    runId: string,
    result: CodingResult | null,
    failure: { code: string; message: string } | null,
    evidence: RunTerminalEvidence,
  ): { room: RoomRecord; run: Run; created: boolean } {
    return this.tx(() => {
      const run = this.requireRun(runId);
      if (run.completed_at !== null) {
        // 已 finalize：先按已持久化 result/failure/evidence 与 incoming payload 比较，作为幂等
        // retry / conflict 边界。该判定不依赖 Question 仍 open 或 Room 仍在首次 finalization
        // state，故须在首次 lifecycle guard 之前执行，保证 answer 后同 payload retry 仍幂等。
        const existingSignature = this.runPauseSignature(run);
        const incomingSignature = this.pausePayloadSignature(result, failure, evidence);
        if (existingSignature === incomingSignature) {
          return { room: this.requireRoom(run.room_id), run, created: false };
        }
        throw new ProtocolError('id_conflict', `run ${runId} already pause-finalized with a different payload`);
      }
      this.assertNeedsDecisionFinalizable(run);
      const updated: Run = {
        ...run,
        result,
        failure,
        claude_session_id: evidence.claude_session_id,
        process_exit_code: evidence.process_exit_code,
        git_evidence: evidence.git_evidence,
        artifact_refs: evidence.artifact_refs,
        completed_at: this.now(),
      };
      this.repo.updateRun(updated);
      this.repo.appendEvent({
        room_id: run.room_id,
        type: 'run_paused',
        actor: 'runner',
        entity_type: 'run',
        entity_id: runId,
        summary: `run ${runId} paused for decision`,
        created_at: this.now(),
      });
      return { room: this.requireRoom(run.room_id), run: updated, created: true };
    });
  }

  // 只从当前 Room/Task 与既有 Event/reference 推导 continuation kind、source Run、exact
  // baseline/session 与 answered Question，不接受 caller 覆盖。该 boundary 在 spawn 前由
  // Runner 调用，任何 stale/wrong-state 都以 validation_failed 拒绝。
  getContinuationContext(roomId: string, taskId: string): ContinuationContext {
    const room = this.requireRoom(roomId);
    const task = this.requireTask(taskId);
    if (task.room_id !== roomId) {
      throw new ProtocolError('validation_failed', `task ${taskId} is not in room ${roomId}`);
    }
    if (task.task_id !== this.currentTaskId(roomId)) {
      throw new ProtocolError('validation_failed', `task ${taskId} is not the current task of room ${roomId}`);
    }
    switch (room.state) {
      case 'PLAN_READY':
        return { kind: 'new_implementation', sourceRun: null, question: null, review: null };
      case 'NEEDS_DECISION':
        return this.deriveDecisionContinuation(roomId, task);
      case 'FIX_PLAN_READY':
        return this.deriveFixContinuation(roomId, task);
      default:
        throw new ProtocolError('validation_failed', `room ${roomId} state ${room.state} cannot start a run`);
    }
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

  // current Task authority 复用每个 Room sequence 最大的 task_submitted Event；该 Event 与
  // submitTask transition 在同一 transaction 内，sequence 提供稳定顺序。guard 只在 newly
  // inserted Run 上执行，避免破坏同 ID/同 content 的 retry 与同 ID/异 content 的 conflict。
  private assertCurrentTask(run: Run): void {
    if (run.task_id !== this.currentTaskId(run.room_id)) {
      throw new ProtocolError(
        'validation_failed',
        `run ${run.run_id} references task ${run.task_id} which is not the current task`,
      );
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

  // startRun 只用于新 Implementation lineage（PLAN_READY）或 RUN_FAILED retry；NEEDS_DECISION
  // 与 FIX_PLAN_READY 必须 resumeRun（继承 lineage session/baseline）。guard 只在 newly
  // inserted Run 上执行，不误伤同 ID/同 content 的 retry。
  private assertStartableState(run: Run): void {
    const room = this.requireRoom(run.room_id);
    if (room.state === 'NEEDS_DECISION' || room.state === 'FIX_PLAN_READY') {
      throw new ProtocolError(
        'validation_failed',
        `startRun cannot be used in ${room.state}; use resumeRun to continue the lineage`,
      );
    }
  }

  // resumeRun 要求存在 prior lineage Run：NEEDS_DECISION（decision）与 FIX_PLAN_READY（fix）
  // 必然有先前的 source Run；PLAN_READY 只有 RUN_FAILED retry（已有 prior Run）才允许 resume，
  // 首次 Implementation 必须 startRun。guard 只在 newly inserted Run 上执行。
  private assertResumableState(run: Run): void {
    const room = this.requireRoom(run.room_id);
    if (room.state === 'PLAN_READY' && !this.hasPriorRun(run.room_id)) {
      throw new ProtocolError(
        'validation_failed',
        'resumeRun requires a prior lineage Run; first PLAN_READY must use startRun',
      );
    }
  }

  // 任一 run_started/run_resumed Event 存在即表示已有 prior lineage Run。首 Run 一定由
  // startRun 产生 run_started，resumeRun 永远只在既有 lineage 之后发生。
  private hasPriorRun(roomId: string): boolean {
    return (
      this.repo.latestEventEntityId(roomId, 'run_started') !== null ||
      this.repo.latestEventEntityId(roomId, 'run_resumed') !== null
    );
  }

  // answer 前 gate：source Run 必须是 current needs_decision Run，且 pause finalization 已完成。
  // Question 的 currency 由最新 question_asked Event reference 决定，不扫描 JSON content 猜 identity。
  private assertAnswerableQuestion(question: Question): void {
    const room = this.requireRoom(question.room_id);
    if (room.state !== 'NEEDS_DECISION') {
      throw new ProtocolError('validation_failed', `room ${question.room_id} is not NEEDS_DECISION`);
    }
    if (question.question_id !== this.repo.latestEventEntityId(question.room_id, 'question_asked')) {
      throw new ProtocolError('validation_failed', `question ${question.question_id} is not the current open question`);
    }
    const run = this.requireRun(question.run_id);
    if (run.status !== 'needs_decision') {
      throw new ProtocolError('validation_failed', `question ${question.question_id} source run ${run.run_id} is not needs_decision`);
    }
    if (run.room_id !== question.room_id || run.task_id !== question.task_id) {
      throw new ProtocolError('validation_failed', `question ${question.question_id} source run ${run.run_id} does not match task/room`);
    }
    if (run.completed_at === null) {
      throw new ProtocolError('validation_failed', `question ${question.question_id} source run ${run.run_id} has not been pause-finalized`);
    }
  }

  // pause finalization 的前置：只接受 current Run 已 needs_decision、Room=NEEDS_DECISION、最新
  // question_asked 引用的 open Question 与该 Run 的 task/room/run 一致的场景。Question 必须在
  // finalize 前保持 open（answer 会把它置为 answered）。
  private assertNeedsDecisionFinalizable(run: Run): void {
    if (run.status !== 'needs_decision') {
      throw new ProtocolError('validation_failed', `run ${run.run_id} is not needs_decision (status ${run.status})`);
    }
    const room = this.requireRoom(run.room_id);
    if (room.state !== 'NEEDS_DECISION') {
      throw new ProtocolError('validation_failed', `room ${run.room_id} is not NEEDS_DECISION`);
    }
    const questionId = this.repo.latestEventEntityId(run.room_id, 'question_asked');
    if (questionId === null) {
      throw new ProtocolError('validation_failed', `room ${run.room_id} has no open question for pause finalization`);
    }
    const question = this.requireQuestion(questionId);
    if (question.status !== 'open') {
      throw new ProtocolError('validation_failed', `question ${questionId} is not open for pause finalization`);
    }
    if (question.run_id !== run.run_id || question.task_id !== run.task_id || question.room_id !== run.room_id) {
      throw new ProtocolError('validation_failed', `question ${questionId} does not reference run ${run.run_id} task/room`);
    }
  }

  // pause payload 的稳定签名：比较 pause evidence 是否与既有 Run 一致，用于 idempotent retry /
  // id_conflict。result/failure 已经过 schema normalization，JSON.stringify 的 key 顺序稳定。
  private pausePayloadSignature(
    result: CodingResult | null,
    failure: { code: string; message: string } | null,
    evidence: RunTerminalEvidence,
  ): string {
    return JSON.stringify([
      evidence.claude_session_id,
      evidence.process_exit_code,
      result,
      failure,
      evidence.git_evidence,
      evidence.artifact_refs,
    ]);
  }

  private runPauseSignature(run: Run): string {
    return JSON.stringify([
      run.claude_session_id,
      run.process_exit_code,
      run.result,
      run.failure,
      run.git_evidence,
      run.artifact_refs,
    ]);
  }

  private deriveDecisionContinuation(roomId: string, task: TaskContract): ContinuationContext {
    const questionId = this.repo.latestEventEntityId(roomId, 'question_asked');
    if (questionId === null) {
      throw new ProtocolError('validation_failed', `room ${roomId} has no question for decision continuation`);
    }
    const question = this.requireQuestion(questionId);
    if (question.status !== 'answered') {
      throw new ProtocolError('validation_failed', `question ${questionId} is not answered`);
    }
    if (question.answer_changes_contract !== false) {
      throw new ProtocolError('validation_failed', `question ${questionId} changes the contract and cannot be resumed`);
    }
    if (question.task_id !== task.task_id || question.room_id !== roomId) {
      throw new ProtocolError('validation_failed', `question ${questionId} does not match task ${task.task_id}/room ${roomId}`);
    }
    const run = this.requireRun(question.run_id);
    if (run.status !== 'needs_decision') {
      throw new ProtocolError('validation_failed', `decision source run ${run.run_id} is not needs_decision`);
    }
    if (run.room_id !== roomId || run.task_id !== task.task_id) {
      throw new ProtocolError('validation_failed', `decision source run ${run.run_id} does not match task/room`);
    }
    if (run.completed_at === null) {
      throw new ProtocolError('validation_failed', `decision source run ${run.run_id} has not been pause-finalized`);
    }
    if (run.claude_session_id === null || run.claude_session_id === '') {
      throw new ProtocolError('validation_failed', `decision source run ${run.run_id} has no session to resume`);
    }
    return { kind: 'decision', sourceRun: run, question, review: null };
  }

  private deriveFixContinuation(roomId: string, task: TaskContract): ContinuationContext {
    if (task.type !== 'fix') {
      throw new ProtocolError('validation_failed', `room ${roomId} is FIX_PLAN_READY but task ${task.task_id} is not a fix task`);
    }
    const review = this.requireReview(task.based_on_review_id ?? '');
    if (review.room_id !== roomId || review.task_id !== task.parent_task_id) {
      throw new ProtocolError('validation_failed', `fix task ${task.task_id} review ${review.review_id} does not target parent task`);
    }
    if (review.review_id !== this.currentReviewId(roomId)) {
      throw new ProtocolError('validation_failed', `fix task ${task.task_id} review ${review.review_id} is not current`);
    }
    const run = this.requireRun(review.run_id);
    if (run.status !== 'succeeded') {
      throw new ProtocolError('validation_failed', `fix source run ${run.run_id} is not succeeded`);
    }
    if (run.room_id !== roomId || run.task_id !== review.task_id) {
      throw new ProtocolError('validation_failed', `fix source run ${run.run_id} does not match review task/room`);
    }
    if (run.claude_session_id === null || run.claude_session_id === '') {
      throw new ProtocolError('validation_failed', `fix source run ${run.run_id} has no session to resume`);
    }
    return { kind: 'fix', sourceRun: run, question: null, review };
  }

  private currentReviewId(roomId: string): string | null {
    return this.repo.latestEventEntityId(roomId, 'review_submitted');
  }

  private currentTaskId(roomId: string): string | null {
    return this.repo.latestEventEntityId(roomId, 'task_submitted');
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
