import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ProtocolError } from '../protocol/errors.ts';
import {
  codingResultSchema,
  participantProfileSchema,
  persistedTaskSchema,
  questionSchema,
  reviewSchema,
  roleAssignmentSchema,
  runSchema,
  taskContractSchema,
  type CodingResult,
  type Event,
  type EventActor,
  type ParticipantProfile,
  type PersistedTask,
  type Question,
  type Review,
  type Role,
  type RoleAssignment,
  type RoomState,
  type Run,
  type TaskContract,
} from '../protocol/schema.ts';
import { RoomRepository, type RoomRecord } from './repository.ts';
import { resolveTransition } from './state-machine.ts';

// ---- v0.3 bootstrap profiles / assignments ----
// 创建 Room 时注册的最小 identity 集合。adapter_id 是 Stage 1 已验收 adapter 的 key；
// provider/config_ref 只是描述性 metadata，config_ref 不存 secret。
export const BOOTSTRAP_PARTICIPANTS: readonly Omit<ParticipantProfile, 'created_at'>[] = [
  {
    participant_id: 'operator',
    display_name: 'Operator',
    kind: 'human',
    provider: 'local',
    adapter_id: 'human',
    capabilities: ['supervising'],
    config_ref: null,
    enabled: true,
  },
  {
    participant_id: 'codex-app',
    display_name: 'Codex App',
    kind: 'agent',
    provider: 'codex',
    adapter_id: 'codex_app',
    // codex-app 是 project 唯一 control endpoint participant：planner/reviewer 之外还持有
    // supervising capability，承担 Room orchestrator（Review finding inc9-r4）。
    capabilities: ['planning', 'reviewing', 'supervising'],
    config_ref: null,
    enabled: true,
  },
  {
    participant_id: 'claude-code-cli',
    display_name: 'Claude Code CLI',
    kind: 'agent',
    provider: 'anthropic',
    adapter_id: 'claude_code_cli',
    capabilities: ['coding', 'questioning'],
    config_ref: null,
    enabled: true,
  },
  {
    participant_id: 'local-runner',
    display_name: 'Local Runner',
    kind: 'service',
    provider: 'local',
    adapter_id: 'local_runner',
    capabilities: ['execution'],
    config_ref: null,
    enabled: true,
  },
];

// bootstrap room-scope assignments：codex-app 是 single control orchestrator 兼
// planner/reviewer，Claude Code CLI 是 worker，local service 是 executor。operator 只保留
// human profile，不持有 active assignment（Review finding inc9-r4）。git_controller 在
// Stage 1 只可登记 assignment 不执行，因此 bootstrap 不分配。
export const BOOTSTRAP_ASSIGNMENTS: readonly Omit<
  RoleAssignment,
  'assignment_id' | 'room_id' | 'created_at'
>[] = [
  { scope_type: 'room', scope_id: null, role: 'orchestrator', participant_id: 'codex-app' },
  { scope_type: 'room', scope_id: null, role: 'planner', participant_id: 'codex-app' },
  { scope_type: 'room', scope_id: null, role: 'reviewer', participant_id: 'codex-app' },
  { scope_type: 'room', scope_id: null, role: 'worker', participant_id: 'claude-code-cli' },
  { scope_type: 'room', scope_id: null, role: 'executor', participant_id: 'local-runner' },
];

// Runner / system Event 使用的 local service participant。
export const LOCAL_SERVICE_PARTICIPANT_ID = 'local-runner';

// Stage 1 role → 已验收 adapter 映射：只有已验收 adapter 的 participant 才能被解析为可执行
// assignment；其它 provider profile 可注册但不可承担可执行 role（ADR-0003 §4.3）。
const ROLE_REQUIRED_ADAPTERS: Partial<Record<Role, readonly string[]>> = {
  planner: ['codex_app'],
  reviewer: ['codex_app'],
  worker: ['claude_code_cli'],
  executor: ['local_runner'],
  orchestrator: ['human', 'codex_app'],
  // git_controller 兼容规则冻结为 local_runner（Review finding inc9-r5）；Stage 1 只可
  // 登记 assignment，不执行 Git write。
  git_controller: ['local_runner'],
};

// role → 必需 capability：profile.capabilities 必须包含该 capability 才能承担 role。
const ROLE_REQUIRED_CAPABILITIES: Partial<Record<Role, string>> = {
  planner: 'planning',
  reviewer: 'reviewing',
  worker: 'coding',
  executor: 'execution',
  orchestrator: 'supervising',
  git_controller: 'git_control',
};

// Runner 在 terminal transition 时必须随 result/failure 一并持久化的完成证据：agent session
// ref、process exit、Git evidence 与 artifact refs 都在同一 RoomService transaction 内提交，
// 避免 succeeded/failed Run 缺少已观察到的 process/Git/artifact evidence。git_evidence 的
// shape 与 Run.git_evidence 一致，但不 import schema.ts 的未导出 zod schema。
export interface RunTerminalEvidence {
  agent_session_ref: string | null;
  process_exit_code: number | null;
  git_evidence: { staged: string[]; unstaged: string[]; untracked: string[] };
  artifact_refs: string[];
}

// 只读 continuation context：Runner 在 spawn 前据此推导 Decision/Fix/retry resume 的 exact
// session、baseline 与 answered Question，不接受 caller 覆盖这些 authority。new_implementation
// 表示首次 Implementation（无 source Run），走 clean-baseline start；retry 表示同一 current
// Task 存在已 terminal-finalized 的 failed source Run，继承其 baseline 与可选 session。
export type ContinuationContext =
  | { kind: 'new_implementation'; sourceRun: null; question: null; review: null }
  | { kind: 'decision'; sourceRun: Run; question: Question; review: null }
  | { kind: 'fix'; sourceRun: Run; question: null; review: Review }
  | { kind: 'retry'; sourceRun: Run; question: null; review: null };

// application service 是唯一拥有 rooms.state 修改权限的模块。每个公开方法都在单个
// SQLite transaction 内完成 entity write、state change 与 Event append，失败即回滚。
// v0.3 的每个 command 都接收 EventActor（participant_id + actor_role）：role 决定转换
// authority，participant 决定谁实际执行；Event 与 lifecycle entity 在创建时固化 identity。
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
  // bootstrap 在 Room 创建时注册 profiles/assignments；room_create 的 caller 必须持有新 Room
  // 的 planner assignment（bootstrap 后的 codex-app 通过，orchestrator-only participant 被拒）。
  createRoom(roomId: string, actor: EventActor): { room: RoomRecord; created: boolean } {
    return this.tx(() => {
      const createdAt = this.now();
      const { room, created } = this.repo.createRoom(roomId, createdAt);
      if (!created) {
        // same-ID retry 不是 authority bypass：返回既有 Room 前同样校验 planner authority
        //（Review finding inc9-r3）。
        this.assertAuthority(roomId, actor, 'planner');
        return { room, created: false };
      }
      this.bootstrapRoom(roomId, createdAt);
      this.assertAuthority(roomId, actor, 'planner');
      this.repo.appendEvent({
        room_id: roomId,
        type: 'room_created',
        actor: { participant_id: LOCAL_SERVICE_PARTICIPANT_ID, actor_role: 'orchestrator' },
        entity_type: 'room',
        entity_id: roomId,
        summary: `room ${roomId} created`,
        created_at: this.now(),
      });
      return { room, created: true };
    });
  }

  // ---- Planning transitions (planner) ----
  transitionToArchitectureReview(roomId: string, actor: EventActor): RoomRecord {
    return this.tx(() => {
      this.assertAuthority(roomId, actor, 'planner');
      return this.planningTransition(
        roomId,
        'ARCHITECTURE_REVIEW',
        `room ${roomId} moved to ARCHITECTURE_REVIEW`,
        actor,
      );
    });
  }

  transitionToWaitingForUserConfirmation(roomId: string, actor: EventActor): RoomRecord {
    return this.tx(() => {
      this.assertAuthority(roomId, actor, 'planner');
      return this.planningTransition(
        roomId,
        'WAITING_FOR_USER_CONFIRMATION',
        `room ${roomId} moved to WAITING_FOR_USER_CONFIRMATION`,
        actor,
      );
    });
  }

  retryAfterFailure(roomId: string, actor: EventActor): RoomRecord {
    return this.tx(() => {
      this.assertAuthority(roomId, actor, 'planner');
      return this.planningTransition(roomId, 'PLAN_READY', `room ${roomId} retry after failure`, actor);
    });
  }

  // ---- Task submission (planner) ----
  submitTask(
    input: unknown,
    actor: EventActor,
  ): { room: RoomRecord; task: PersistedTask; created: boolean } {
    const contract = this.parse(taskContractSchema, input, 'TaskContract') as TaskContract;
    return this.tx(() => {
      this.requireRoom(contract.room_id);
      const existing = this.repo.getTask(contract.task_id);
      if (existing) {
        // same-ID retry 按 stored Task 冻结的提交 identity 认证（Review finding inc9-fr2-3）：
        // 不使用 current assignment 重新 augment existing content 后比较。content 判定复用
        // repository：layered content（caller-owned contract + stored frozen identity）与
        // stored 相同 → created=false 且零写入；不同 → id_conflict。两种失败都由 transaction
        // 保证 Room/entity/Event 零写入。
        this.assertTaskRetryAuthority(existing, actor);
        const retry = {
          ...contract,
          planner_participant_id: existing.planner_participant_id,
          orchestrator_participant_id: existing.orchestrator_participant_id,
        };
        this.repo.insertTask(retry);
        return { room: this.requireRoom(contract.room_id), task: existing, created: false };
      }
      // 新 Task 继续使用 current assignment authority 并在提交时固化 planner/orchestrator
      // identity；输入契约本身不含这两个字段。
      this.assertAuthority(contract.room_id, actor, 'planner');
      const task = this.augmentTaskWithIdentities(contract);
      this.repo.insertTask(task);
      if (task.type === 'fix') {
        this.validateFixReferences(task);
        this.applyTransition(task.room_id, 'FIX_PLAN_READY', actor);
      } else {
        this.applyTransition(task.room_id, 'PLAN_READY', actor);
      }
      this.repo.appendEvent({
        room_id: task.room_id,
        type: 'task_submitted',
        actor,
        entity_type: 'task',
        entity_id: task.task_id,
        summary: `task ${task.task_id} submitted (${task.type})`,
        created_at: this.now(),
      });
      return { room: this.requireRoom(task.room_id), task, created: true };
    });
  }

  // ---- Run lifecycle (executor) ----
  startRun(input: unknown, actor: EventActor): { room: RoomRecord; run: Run; created: boolean } {
    const run = this.normalizeRunForCoding(this.parse(runSchema, input, 'Run') as Run);
    return this.tx(() => {
      this.assertRunTask(run);
      this.assertCurrentTask(run);
      this.assertStartableState(run);
      const existing = this.repo.getRun(run.run_id);
      if (existing) {
        // same-ID retry 按 stored Run 冻结的 executor identity 认证（Review finding
        // inc9-fr2-3）：不要求 current worker/executor assignment 与历史 identity 一致。
        // content 判定复用 repository：同 content → created=false 且零写入；不同 → id_conflict。
        this.assertRunCommandAuthority(existing, actor, 'executor');
        this.repo.insertRun(run);
        return { room: this.requireRoom(run.room_id), run: existing, created: false };
      }
      // 新 Run：claim authority（current assignment）与冻结 identity 一致性校验先于 insert，
      // guard 失败由 transaction 整体 rollback，无 partial write。
      this.assertExecutorClaimAuthority(run, actor);
      this.validateClaimIdentity(run, actor);
      this.repo.insertRun(run);
      this.applyTransition(run.room_id, 'CODING', actor);
      this.repo.appendEvent({
        room_id: run.room_id,
        type: 'run_started',
        actor,
        entity_type: 'run',
        entity_id: run.run_id,
        summary: `run ${run.run_id} started`,
        created_at: this.now(),
      });
      return { room: this.requireRoom(run.room_id), run, created: true };
    });
  }

  resumeRun(input: unknown, actor: EventActor): { room: RoomRecord; run: Run; created: boolean } {
    const run = this.normalizeRunForCoding(this.parse(runSchema, input, 'Run') as Run);
    return this.tx(() => {
      this.assertRunTask(run);
      this.assertCurrentTask(run);
      this.assertResumableState(run);
      const existing = this.repo.getRun(run.run_id);
      if (existing) {
        // 与 startRun 相同的 replacement-safe retry（Review finding inc9-fr2-3）。
        this.assertRunCommandAuthority(existing, actor, 'executor');
        this.repo.insertRun(run);
        return { room: this.requireRoom(run.room_id), run: existing, created: false };
      }
      this.assertExecutorClaimAuthority(run, actor);
      this.validateClaimIdentity(run, actor);
      this.repo.insertRun(run);
      this.applyTransition(run.room_id, 'CODING', actor);
      this.repo.appendEvent({
        room_id: run.room_id,
        type: 'run_resumed',
        actor,
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
    actor: EventActor,
  ): { room: RoomRecord; run: Run } {
    return this.tx(() => {
      const run = this.requireRun(runId);
      // 已创建 Run 的 command authority：先校验 route actor（存在/enabled/role），再只对照
      // claim 时冻结的 executor；不要求仍持有 current assignment（Review finding inc9-r1）。
      this.assertRunCommandAuthority(run, actor, 'executor');
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
        agent_session_ref: evidence.agent_session_ref,
        process_exit_code: evidence.process_exit_code,
        git_evidence: evidence.git_evidence,
        artifact_refs: evidence.artifact_refs,
        completed_at: this.now(),
      };
      this.repo.updateRun(updated);
      this.applyTransition(run.room_id, 'REVIEW_REQUIRED', actor);
      this.repo.appendEvent({
        room_id: run.room_id,
        type: 'run_completed',
        actor,
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
    actor: EventActor,
  ): { room: RoomRecord; run: Run } {
    return this.tx(() => {
      const run = this.requireRun(runId);
      // 与 completeRun 相同的冻结 executor authority：actor 校验先于 lifecycle guard。
      this.assertRunCommandAuthority(run, actor, 'executor');
      this.assertRunRunning(run);
      // 即使 Run 失败也持久化已成功观察到的 evidence，避免 failed Run 丢失已观察的
      // process/Git/artifact 事实；evidence 与 failure 在同一 transaction 提交。
      const updated: Run = {
        ...run,
        status: 'failed',
        failure,
        agent_session_ref: evidence.agent_session_ref,
        process_exit_code: evidence.process_exit_code,
        git_evidence: evidence.git_evidence,
        artifact_refs: evidence.artifact_refs,
        completed_at: this.now(),
      };
      this.repo.updateRun(updated);
      this.applyTransition(run.room_id, 'RUN_FAILED', actor);
      this.repo.appendEvent({
        room_id: run.room_id,
        type: 'run_failed',
        actor,
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
    actor: EventActor,
  ): void {
    this.tx(() => {
      const run = this.requireRun(runId);
      // progress 与 terminal 命令共享冻结 executor authority（Review finding inc9-r1）。
      this.assertRunCommandAuthority(run, actor, 'executor');
      this.assertRunRunning(run);
      const label = [progress.type, progress.subtype].filter((p): p is string => p !== null).join(':') || 'unknown';
      this.repo.appendEvent({
        room_id: run.room_id,
        type: 'run_progress',
        actor,
        entity_type: 'run',
        entity_id: runId,
        summary: `run ${runId} progress ${label}`,
        created_at: this.now(),
      });
    });
  }

  // ---- Question (worker / planner) ----
  askQuestion(input: unknown, actor: EventActor): { room: RoomRecord; question: Question; created: boolean } {
    const question = this.parse(questionSchema, input, 'Question') as Question;
    return this.tx(() => {
      // authority 先于 insert：same-ID retry 必须先认证 actor（Review finding inc9-r3），且
      // authority 只对照 claim 时冻结的 worker（Review finding inc9-r1），失败整体回滚。
      const run = this.requireRun(question.run_id);
      this.assertRunCommandAuthority(run, actor, 'worker');
      const normalized: Question = {
        ...question,
        status: 'open',
        answer: null,
        answer_changes_contract: null,
        answered_at: null,
      };
      const inserted = this.repo.insertQuestion(normalized);
      if (!inserted.created) {
        // authorized same-content retry 直接返回既有 Question：首次 ask 已把 Run 置为
        // needs_decision，running/task-room guard 只约束 newly inserted Question，不误伤 retry。
        return {
          room: this.requireRoom(question.room_id),
          question: this.requireQuestion(question.question_id),
          created: false,
        };
      }
      // 以下 guard 只在 newly inserted Question 上执行；失败由 transaction 整体回滚，
      // insert 不残留，可观察错误码与 insert 前校验一致。
      this.assertRunRunning(run);
      if (run.room_id !== question.room_id || run.task_id !== question.task_id) {
        throw new ProtocolError(
          'validation_failed',
          `question ${question.question_id} references run ${run.run_id} that does not match task/room`,
        );
      }
      const updatedRun: Run = { ...run, status: 'needs_decision' };
      this.repo.updateRun(updatedRun);
      this.applyTransition(question.room_id, 'NEEDS_DECISION', actor);
      this.repo.appendEvent({
        room_id: question.room_id,
        type: 'question_asked',
        actor,
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
    actor: EventActor,
  ): { room: RoomRecord; question: Question } {
    return this.tx(() => {
      const question = this.requireQuestion(questionId);
      this.assertAuthority(question.room_id, actor, 'planner');
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
        this.applyTransition(question.room_id, 'WAITING_FOR_USER_CONFIRMATION', actor);
      }
      this.repo.appendEvent({
        room_id: question.room_id,
        type: 'question_answered',
        actor,
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
    actor: EventActor,
  ): { room: RoomRecord; run: Run; created: boolean } {
    return this.tx(() => {
      const run = this.requireRun(runId);
      // same-ID/payload retry 不是 authority bypass：先校验冻结 executor authority
      //（Review finding inc9-r1/r3），再进入幂等/conflict 判定与首次 lifecycle guard。
      this.assertRunCommandAuthority(run, actor, 'executor');
      if (run.completed_at !== null) {
        // 已 finalize：按已持久化 result/failure/evidence 与 incoming payload 比较，作为幂等
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
        agent_session_ref: evidence.agent_session_ref,
        process_exit_code: evidence.process_exit_code,
        git_evidence: evidence.git_evidence,
        artifact_refs: evidence.artifact_refs,
        completed_at: this.now(),
      };
      this.repo.updateRun(updated);
      this.repo.appendEvent({
        room_id: run.room_id,
        type: 'run_paused',
        actor,
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
        return this.deriveRetryOrNewImplementation(roomId, task);
      case 'NEEDS_DECISION':
        return this.deriveDecisionContinuation(roomId, task);
      case 'FIX_PLAN_READY':
        return this.deriveFixContinuation(roomId, task);
      default:
        throw new ProtocolError('validation_failed', `room ${roomId} state ${room.state} cannot start a run`);
    }
  }

  // ---- Review (reviewer) ----
  submitReview(input: unknown, actor: EventActor): { room: RoomRecord; review: Review; created: boolean } {
    const review = this.parse(reviewSchema, input, 'Review') as Review;
    return this.tx(() => {
      const existing = this.repo.getReview(review.review_id);
      if (existing) {
        // same-ID retry 按 stored Review 冻结的 reviewer identity 认证（Review finding
        // inc9-fr2-3）：不要求 current reviewer assignment。content 判定复用 repository：
        // 同 content → created=false 且零写入；不同 → id_conflict。
        this.assertReviewCommandAuthority(existing, actor);
        this.repo.insertReview(review);
        return { room: this.requireRoom(review.room_id), review: existing, created: false };
      }
      // 新 Review 继续使用 current reviewer assignment（Task scope 优先、Room fallback，
      // Review finding inc9-r2）并固化 identity；task/run/status/result/current Run guard
      // 只作用于 newly created Review，失败由 transaction 整体 rollback。
      this.assertReviewerAuthority(review, actor);
      this.repo.insertReview(review);
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
      this.applyTransition(review.room_id, 'REVIEW_DISCUSSION', actor);
      this.repo.appendEvent({
        room_id: review.room_id,
        type: 'review_submitted',
        actor,
        entity_type: 'review',
        entity_id: review.review_id,
        summary: `review ${review.review_id} submitted`,
        created_at: this.now(),
      });
      return { room: this.requireRoom(review.room_id), review, created: true };
    });
  }

  acceptReview(
    reviewId: string,
    confirmedByUser: boolean,
    actor: EventActor,
  ): { room: RoomRecord; review: Review } {
    return this.tx(() => {
      const review = this.requireReview(reviewId);
      // acceptance authority 只对照 Review 提交时冻结的 reviewer identity（Review finding
      // inc9-fr2-2）：先校验 route participant 存在、enabled 且 actor_role=reviewer，再与
      // review.reviewer_participant_id 比较；不要求仍持有 current assignment。
      this.assertReviewCommandAuthority(review, actor);
      if (confirmedByUser !== true) {
        throw new ProtocolError('validation_failed', `review ${reviewId} acceptance requires confirmed_by_user`);
      }
      if (review.findings.some((f) => f.severity === 'blocker')) {
        throw new ProtocolError('validation_failed', `review ${reviewId} still has blocking findings`);
      }
      if (review.review_id !== this.currentReviewId(review.room_id)) {
        throw new ProtocolError('validation_failed', `review ${reviewId} is not the current review`);
      }
      this.applyTransition(review.room_id, 'ACCEPTED', actor);
      this.repo.appendEvent({
        room_id: review.room_id,
        type: 'review_accepted',
        actor,
        entity_type: 'review',
        entity_id: reviewId,
        summary: `review ${reviewId} accepted`,
        created_at: this.now(),
      });
      return { room: this.requireRoom(review.room_id), review };
    });
  }

  // ---- Participant / RoleAssignment commands (orchestrator) ----
  registerParticipant(
    input: unknown,
    actor: EventActor,
  ): { profile: ParticipantProfile; created: boolean } {
    const profile = this.parse(participantProfileSchema, input, 'ParticipantProfile') as ParticipantProfile;
    return this.tx(() => {
      this.assertAnyRoomOrchestrator(actor);
      const inserted = this.repo.insertParticipant(profile);
      if (!inserted.created) {
        const existing = this.repo.getParticipant(profile.participant_id);
        if (!existing) {
          throw new ProtocolError('entity_not_found', `participant ${profile.participant_id} missing after idempotent insert`);
        }
        return { profile: existing, created: false };
      }
      return { profile, created: true };
    });
  }

  setParticipantEnabled(
    participantId: string,
    enabled: boolean,
    actor: EventActor,
  ): { profile: ParticipantProfile } {
    return this.tx(() => {
      this.assertAnyRoomOrchestrator(actor);
      const existing = this.repo.getParticipant(participantId);
      if (!existing) {
        throw new ProtocolError('entity_not_found', `participant ${participantId} not found`);
      }
      // 只改写 enabled 字段；既有 Run/Review/Event 的 participant/role 逐字段不变。
      const updated: ParticipantProfile = { ...existing, enabled };
      this.repo.updateParticipant(updated);
      return { profile: updated };
    });
  }

  createRoleAssignment(
    input: unknown,
    actor: EventActor,
  ): { assignment: RoleAssignment; created: boolean } {
    const assignment = this.parse(roleAssignmentSchema, input, 'RoleAssignment') as RoleAssignment;
    return this.tx(() => {
      this.requireRoom(assignment.room_id);
      this.assertAuthority(assignment.room_id, actor, 'orchestrator');
      this.validateAssignmentTarget(assignment);
      const inserted = this.repo.insertRoleAssignment(assignment);
      if (!inserted.created) {
        const existing = this.repo.getRoleAssignment(assignment.assignment_id);
        if (!existing) {
          throw new ProtocolError('entity_not_found', `assignment ${assignment.assignment_id} missing after idempotent insert`);
        }
        return { assignment: existing, created: false };
      }
      return { assignment, created: true };
    });
  }

  // ---- Assignment resolution ----
  // 公开只读解析：exact entity scope 优先于 Room default；同 scope/role 的最新 assignment 是
  // active（Review finding inc9-r5：只由成功 insert 的 rowid 顺序决定，不信任 caller
  // created_at）。Stage 1 消费点：Task 提交使用 Room planner/orchestrator；Run claim 与
  // Review 提交按 Task scope 优先、Room default fallback 解析（Review finding inc9-r2）。
  resolveAssignment(
    roomId: string,
    scopeType: RoleAssignment['scope_type'],
    scopeId: string | null,
    role: Role,
  ): RoleAssignment | null {
    if (scopeType !== 'room' && scopeId !== null) {
      const exact = this.repo.latestAssignment(roomId, scopeType, scopeId, role);
      if (exact) return exact;
    }
    return this.repo.latestAssignment(roomId, 'room', null, role);
  }

  // snapshot 读取前的 reader 校验：caller 必须是该 Room 的 member（任意 role 的 assignment）。
  assertRoomParticipant(roomId: string, participantId: string): void {
    const profile = this.repo.getParticipant(participantId);
    if (!profile) {
      throw new ProtocolError('actor_not_allowed', `participant ${participantId} is not registered`);
    }
    if (!profile.enabled) {
      throw new ProtocolError('actor_not_allowed', `participant ${participantId} is disabled`);
    }
    if (!this.repo.participantHasAssignmentInRoom(participantId, roomId)) {
      throw new ProtocolError(
        'actor_not_allowed',
        `participant ${participantId} is not a member of room ${roomId}`,
      );
    }
  }

  // ---- Read (delegated, read-only) ----
  getRoom(roomId: string): RoomRecord | null {
    return this.repo.getRoom(roomId);
  }

  getTask(taskId: string): PersistedTask | null {
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

  getParticipant(participantId: string): ParticipantProfile | null {
    return this.repo.getParticipant(participantId);
  }

  getRoleAssignment(assignmentId: string): RoleAssignment | null {
    return this.repo.getRoleAssignment(assignmentId);
  }

  listTasks(roomId: string): PersistedTask[] {
    return this.repo.listTasks(roomId);
  }

  listRuns(roomId: string): Run[] {
    return this.repo.listRuns(roomId);
  }

  listReviews(roomId: string): Review[] {
    return this.repo.listReviews(roomId);
  }

  listQuestions(roomId: string): Question[] {
    return this.repo.listQuestions(roomId);
  }

  listRoleAssignments(roomId: string): RoleAssignment[] {
    return this.repo.listRoleAssignments(roomId);
  }

  listRoomParticipants(roomId: string): ParticipantProfile[] {
    return this.repo.listRoomParticipants(roomId);
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

  private bootstrapRoom(roomId: string, createdAt: string): void {
    for (const base of BOOTSTRAP_PARTICIPANTS) {
      // profile 是 database 级 identity：已有则复用（不重复创建、不改写 enabled 状态）。
      if (!this.repo.getParticipant(base.participant_id)) {
        this.repo.insertParticipant({ ...base, created_at: createdAt });
      }
    }
    for (const base of BOOTSTRAP_ASSIGNMENTS) {
      this.repo.insertRoleAssignment({
        ...base,
        assignment_id: randomUUID(),
        room_id: roomId,
        created_at: createdAt,
      });
    }
  }

  private applyTransition(roomId: string, to: RoomState, actor: EventActor): RoomRecord {
    const room = this.requireRoom(roomId);
    resolveTransition(room.state, to, actor.actor_role);
    const updatedAt = this.now();
    this.setStateStmt.run(to, updatedAt, roomId);
    return { ...room, state: to, updated_at: updatedAt };
  }

  private planningTransition(
    roomId: string,
    to: RoomState,
    summary: string,
    actor: EventActor,
  ): RoomRecord {
    const room = this.applyTransition(roomId, to, actor);
    this.repo.appendEvent({
      room_id: roomId,
      type: 'state_transition',
      actor,
      entity_type: 'room',
      entity_id: roomId,
      summary,
      created_at: this.now(),
    });
    return room;
  }

  // 每个 command 的 role authority：participant 必须存在、enabled，actor_role 与 command 的
  // required role 一致，且持有该 Room 内对应 role 的 active assignment。
  private assertAuthority(roomId: string, actor: EventActor, requiredRole: Role): void {
    this.assertParticipantActive(actor);
    if (actor.actor_role !== requiredRole) {
      throw new ProtocolError(
        'actor_not_allowed',
        `participant ${actor.participant_id} cannot act as ${requiredRole} (role ${actor.actor_role})`,
      );
    }
    const assignment = this.resolveAssignment(roomId, 'room', null, requiredRole);
    if (!assignment) {
      throw new ProtocolError('actor_not_allowed', `no ${requiredRole} assignment in room ${roomId}`);
    }
    this.assertAssignable(assignment);
    if (assignment.participant_id !== actor.participant_id) {
      throw new ProtocolError(
        'actor_not_allowed',
        `participant ${actor.participant_id} has no active ${requiredRole} assignment in room ${roomId}`,
      );
    }
  }

  private assertParticipantActive(actor: EventActor): void {
    const profile = this.repo.getParticipant(actor.participant_id);
    if (!profile) {
      throw new ProtocolError('actor_not_allowed', `participant ${actor.participant_id} is not registered`);
    }
    if (!profile.enabled) {
      throw new ProtocolError('actor_not_allowed', `participant ${actor.participant_id} is disabled`);
    }
  }

  // register/setEnabled 是 database 级操作，无目标 Room：要求 actor 在至少一个适用 Room 的
  // 某个 scope/role 组持有 active latest orchestrator assignment（Review finding
  // inc9-fr2-4）。同 scope/role 只有 rowid 最新 assignment 授权；被新 assignment 替换的
  // historical orchestrator 立即失去管理 authority，重新成为 active 后才恢复。
  private assertAnyRoomOrchestrator(actor: EventActor): void {
    this.assertParticipantActive(actor);
    if (actor.actor_role !== 'orchestrator') {
      throw new ProtocolError('actor_not_allowed', `participant ${actor.participant_id} cannot act as orchestrator`);
    }
    if (!this.repo.isActiveLatestAssignment(actor.participant_id, 'orchestrator')) {
      throw new ProtocolError('actor_not_allowed', `participant ${actor.participant_id} has no active orchestrator assignment`);
    }
  }

  // assignment 的 participant 必须存在、enabled 且 capability/adapter 与 role 兼容；Stage 1
  // scope 只允许 room|task（Review finding inc9-r5）：room scope 的 scope_id 必须为 null，
  // task scope 必须引用同一 Room 内已存在的 Task，避免悬空或跨 Room assignment。run/review
  // scope 已在 schema boundary 拒绝，不会到达本层。
  private validateAssignmentTarget(assignment: RoleAssignment): void {
    this.assertAssignable(assignment);
    if (assignment.scope_type === 'room') {
      if (assignment.scope_id !== null) {
        throw new ProtocolError(
          'validation_failed',
          `assignment ${assignment.assignment_id} with room scope must have scope_id null`,
        );
      }
      return;
    }
    if (assignment.scope_id === null) {
      throw new ProtocolError(
        'validation_failed',
        `assignment ${assignment.assignment_id} with scope_type ${assignment.scope_type} requires scope_id`,
      );
    }
    const task = this.requireTask(assignment.scope_id);
    if (task.room_id !== assignment.room_id) {
      throw new ProtocolError(
        'validation_failed',
        `assignment ${assignment.assignment_id} references task from another room`,
      );
    }
  }

  private assertAssignable(assignment: RoleAssignment): void {
    const profile = this.repo.getParticipant(assignment.participant_id);
    if (!profile) {
      throw new ProtocolError('validation_failed', `participant ${assignment.participant_id} not found for assignment`);
    }
    if (!profile.enabled) {
      throw new ProtocolError('validation_failed', `participant ${assignment.participant_id} is disabled`);
    }
    const adapters = ROLE_REQUIRED_ADAPTERS[assignment.role];
    if (adapters && !adapters.includes(profile.adapter_id)) {
      throw new ProtocolError(
        'validation_failed',
        `adapter ${profile.adapter_id} is not compatible with role ${assignment.role}`,
      );
    }
    const capability = ROLE_REQUIRED_CAPABILITIES[assignment.role];
    if (capability && !profile.capabilities.includes(capability)) {
      throw new ProtocolError(
        'validation_failed',
        `participant ${assignment.participant_id} lacks capability ${capability} for role ${assignment.role}`,
      );
    }
  }

  // 提交 Task 时从当时 resolved assignment 固化 planner/orchestrator identity。
  private augmentTaskWithIdentities(contract: TaskContract): PersistedTask {
    const planner = this.requireResolvedAssignment(contract.room_id, 'room', null, 'planner');
    const orchestrator = this.requireResolvedAssignment(contract.room_id, 'room', null, 'orchestrator');
    const persisted = persistedTaskSchema.safeParse({
      ...contract,
      planner_participant_id: planner.participant_id,
      orchestrator_participant_id: orchestrator.participant_id,
    });
    if (!persisted.success) {
      throw new ProtocolError('validation_failed', 'persisted task augmentation failed');
    }
    return persisted.data;
  }

  // 解析 assignment 并要求 participant 可执行（存在、enabled、capability/adapter 兼容）。
  private requireResolvedAssignment(
    roomId: string,
    scopeType: RoleAssignment['scope_type'],
    scopeId: string | null,
    role: Role,
  ): RoleAssignment {
    const assignment = this.resolveAssignment(roomId, scopeType, scopeId, role);
    if (!assignment) {
      throw new ProtocolError('validation_failed', `no ${role} assignment for room ${roomId}`);
    }
    this.assertAssignable(assignment);
    return assignment;
  }

  // Run claim 时固化 worker/executor：两者必须来自当时 resolved assignment（Task scope 优先、
  // Room default fallback，Review finding inc9-r2），且 executor 就是执行 claim 的 actor。
  private validateClaimIdentity(run: Run, actor: EventActor): void {
    const worker = this.requireResolvedAssignment(run.room_id, 'task', run.task_id, 'worker');
    if (worker.participant_id !== run.worker_participant_id) {
      throw new ProtocolError(
        'validation_failed',
        `run ${run.run_id} worker ${run.worker_participant_id} does not match resolved assignment ${worker.participant_id}`,
      );
    }
    const executor = this.requireResolvedAssignment(run.room_id, 'task', run.task_id, 'executor');
    if (executor.participant_id !== run.executor_participant_id) {
      throw new ProtocolError(
        'validation_failed',
        `run ${run.run_id} executor ${run.executor_participant_id} does not match resolved assignment ${executor.participant_id}`,
      );
    }
    if (run.executor_participant_id !== actor.participant_id) {
      throw new ProtocolError(
        'actor_not_allowed',
        `participant ${actor.participant_id} cannot claim run ${run.run_id} as executor`,
      );
    }
  }

  // 已创建 Run 的 command authority（Review finding inc9-r1）：先校验 route participant 存在、
  // enabled 且 actor_role 与 required role 一致，再只对照 Run claim 时冻结的 worker/executor
  // identity；不要求该 participant 仍持有 current assignment，因此 assignment replacement 不
  // 撤销冻结 authority，replacement participant 也不能接管旧 Run。disabled 冻结 participant
  // 必须先 re-enable 才能恢复 command。
  private assertRunCommandAuthority(run: Run, actor: EventActor, role: 'worker' | 'executor'): void {
    this.assertParticipantActive(actor);
    if (actor.actor_role !== role) {
      throw new ProtocolError(
        'actor_not_allowed',
        `participant ${actor.participant_id} cannot act as ${role} (role ${actor.actor_role})`,
      );
    }
    const frozenParticipantId = role === 'worker' ? run.worker_participant_id : run.executor_participant_id;
    if (frozenParticipantId !== actor.participant_id) {
      throw new ProtocolError(
        'actor_not_allowed',
        `run ${run.run_id} ${role} is ${frozenParticipantId}, not ${actor.participant_id}`,
      );
    }
  }

  // Run claim 的 executor authority（Review finding inc9-r2）：actor 必须存在、enabled、role
  // 正确，且等于 run.task_id 的 Task scope 优先（Room fallback）解析的 executor。Run 冻结
  // identity 与解析结果的一致性由 validateClaimIdentity 校验。
  private assertExecutorClaimAuthority(run: Run, actor: EventActor): void {
    this.assertParticipantActive(actor);
    if (actor.actor_role !== 'executor') {
      throw new ProtocolError(
        'actor_not_allowed',
        `participant ${actor.participant_id} cannot act as executor (role ${actor.actor_role})`,
      );
    }
    const assignment = this.resolveAssignment(run.room_id, 'task', run.task_id, 'executor');
    if (!assignment) {
      throw new ProtocolError(
        'actor_not_allowed',
        `no executor assignment for task ${run.task_id} in room ${run.room_id}`,
      );
    }
    this.assertAssignable(assignment);
    if (assignment.participant_id !== actor.participant_id) {
      throw new ProtocolError(
        'actor_not_allowed',
        `participant ${actor.participant_id} has no active executor assignment for task ${run.task_id} in room ${run.room_id}`,
      );
    }
  }

  // same-ID Task retry 的 authority（Review finding inc9-fr2-3）：actor 必须存在、enabled、
  // role 正确，且等于 stored Task 冻结的提交 planner identity；不使用 current assignment。
  private assertTaskRetryAuthority(task: PersistedTask, actor: EventActor): void {
    this.assertParticipantActive(actor);
    if (actor.actor_role !== 'planner') {
      throw new ProtocolError(
        'actor_not_allowed',
        `participant ${actor.participant_id} cannot act as planner (role ${actor.actor_role})`,
      );
    }
    if (task.planner_participant_id !== actor.participant_id) {
      throw new ProtocolError(
        'actor_not_allowed',
        `task ${task.task_id} planner is ${task.planner_participant_id}, not ${actor.participant_id}`,
      );
    }
  }

  // Review 的 command authority（Review finding inc9-fr2-2/r3）：先校验 route participant
  // 存在、enabled 且 actor_role=reviewer，再只对照 Review 提交时冻结的 reviewer identity；
  // 不要求仍持有 current assignment，replacement 不转移既有 Review 的 acceptance/retry 权。
  private assertReviewCommandAuthority(review: Review, actor: EventActor): void {
    this.assertParticipantActive(actor);
    if (actor.actor_role !== 'reviewer') {
      throw new ProtocolError(
        'actor_not_allowed',
        `participant ${actor.participant_id} cannot act as reviewer (role ${actor.actor_role})`,
      );
    }
    if (review.reviewer_participant_id !== actor.participant_id) {
      throw new ProtocolError(
        'actor_not_allowed',
        `review ${review.review_id} reviewer is ${review.reviewer_participant_id}, not ${actor.participant_id}`,
      );
    }
  }

  // Review 提交的 reviewer authority（Review finding inc9-r2/r3）：actor 必须存在、enabled、
  // role 正确，且等于 review.task_id 的 Task scope 优先（Room fallback）解析的 reviewer；
  // review.reviewer_participant_id 同时必须等于 actor，保证提交时固化的 identity 与授权
  // actor 一致。
  private assertReviewerAuthority(review: Review, actor: EventActor): void {
    this.assertParticipantActive(actor);
    if (actor.actor_role !== 'reviewer') {
      throw new ProtocolError(
        'actor_not_allowed',
        `participant ${actor.participant_id} cannot act as reviewer (role ${actor.actor_role})`,
      );
    }
    const assignment = this.resolveAssignment(review.room_id, 'task', review.task_id, 'reviewer');
    if (!assignment) {
      throw new ProtocolError(
        'actor_not_allowed',
        `no reviewer assignment for task ${review.task_id} in room ${review.room_id}`,
      );
    }
    this.assertAssignable(assignment);
    if (assignment.participant_id !== actor.participant_id) {
      throw new ProtocolError(
        'actor_not_allowed',
        `participant ${actor.participant_id} has no active reviewer assignment for task ${review.task_id} in room ${review.room_id}`,
      );
    }
    if (review.reviewer_participant_id !== actor.participant_id) {
      throw new ProtocolError(
        'actor_not_allowed',
        `review ${review.review_id} reviewer ${review.reviewer_participant_id} does not match actor ${actor.participant_id}`,
      );
    }
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
      evidence.agent_session_ref,
      evidence.process_exit_code,
      result,
      failure,
      evidence.git_evidence,
      evidence.artifact_refs,
    ]);
  }

  private runPauseSignature(run: Run): string {
    return JSON.stringify([
      run.agent_session_ref,
      run.process_exit_code,
      run.result,
      run.failure,
      run.git_evidence,
      run.artifact_refs,
    ]);
  }

  // PLAN_READY 分支：Room 状态由 source lineage 决定 retry 或 new_implementation。权威 retry
  // source 是 latest run_failed Event 引用的 Run；该 Run 必须属于 current Room/current Task 且已
  // terminal-finalized（status=failed、completed_at 非 null）。缺失 source 或 source 来自更早
  // lineage/task 时保持首次 new Implementation 语义，绝不从 artifact/session history 猜测 source。
  private deriveRetryOrNewImplementation(roomId: string, task: TaskContract): ContinuationContext {
    const failedRunId = this.repo.latestEventEntityId(roomId, 'run_failed');
    if (failedRunId === null) {
      return { kind: 'new_implementation', sourceRun: null, question: null, review: null };
    }
    const run = this.requireRun(failedRunId);
    if (run.room_id !== roomId || run.task_id !== task.task_id) {
      return { kind: 'new_implementation', sourceRun: null, question: null, review: null };
    }
    if (run.status !== 'failed' || run.completed_at === null) {
      throw new ProtocolError(
        'validation_failed',
        `retry source run ${run.run_id} is not a terminal failed run of task ${task.task_id}`,
      );
    }
    return { kind: 'retry', sourceRun: run, question: null, review: null };
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
    if (run.agent_session_ref === null || run.agent_session_ref === '') {
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
    if (run.agent_session_ref === null || run.agent_session_ref === '') {
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

  private requireTask(taskId: string): PersistedTask {
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
