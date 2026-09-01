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
  type RunAttempt,
  type RunGuidance,
  type TaskContract,
} from '../protocol/schema.ts';
import { RoomRepository, type RoomRecord } from './repository.ts';
import { resolveAttemptTransition, resolveRunTransition, resolveTransition } from './state-machine.ts';

// ---- v0.4 bootstrap profiles / assignments ----
// 创建 Room 时注册的最小 identity 集合。adapter_id 是已验收 adapter 的 key；
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
// Stage 2 只可登记 assignment 不执行，因此 bootstrap 不分配。
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

// role → 已验收 adapter 映射：只有已验收 adapter 的 participant 才能被解析为可执行
// assignment；其它 provider profile 可注册但不可承担可执行 role（ADR-0003 §4.3）。
// v0.4 worker 不再有 adapter 门禁：worker assignment 是 provider-neutral identity 路由，
// 具体 WorkerAdapter 可用性在 claim 时校验（worker_adapter_unavailable，零副作用）。
const ROLE_REQUIRED_ADAPTERS: Partial<Record<Role, readonly string[]>> = {
  planner: ['codex_app'],
  reviewer: ['codex_app'],
  executor: ['local_runner'],
  orchestrator: ['human', 'codex_app'],
  // git_controller 兼容规则冻结为 local_runner（Review finding inc9-r5）；Stage 2 只可
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

// Executor settle 请求的 terminal target 与完整 attempt evidence。service 是唯一 terminal
// 写入者：attempt 的 settled_at 与 evidence 在同一 transaction 提交，失败即整体回滚。
export interface SettleAttemptInput {
  attempt_id: string;
  status: 'succeeded' | 'failed' | 'needs_decision' | 'canceled' | 'interrupted';
  result: CodingResult | null;
  failure: { code: string; message: string } | null;
  agent_session_ref: string | null;
  process_exit_code: number | null;
  git_evidence: { staged: string[]; unstaged: string[]; untracked: string[] };
  artifact_refs: string[];
}

// atomic claim 的 caller-owned 输入：attempt_id 必须 fresh；worktree_path 由 Executor 在
// claim 前经 Git Observer 解析（首 attempt clean gate，后续 live evidence observation），
// claim 只负责冻结/继承 canonical worktree 与并发事实。
export interface ClaimAttemptInput {
  attempt_id: string;
  run_id: string;
  room_id: string;
  worktree_path: string;
}

// application service 是唯一拥有 rooms.state 与 Run/RunAttempt.status 修改权限的模块。
// v0.4 状态所有权三层分离：Room 只拥有 planning 状态；Run 拥有 execution/review/acceptance
// lifecycle；RunAttempt 拥有单次 process 与唯一 terminal outcome。每个公开方法都在单个
// SQLite transaction 内完成 entity write、state change 与 Event append，失败即回滚；
// BEGIN IMMEDIATE 使 writer 在 guard 读取前先取得写锁（Review finding inc10-r1）：跨
// process 写竞争在 PRAGMA busy_timeout 内串行化，loser 在 winner commit 后以 fresh state
// 重走 guard 或 partial unique index 路径确定性收敛，不泄漏 raw SQLite error。
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

  // ---- Task submission (planner) ----
  // v0.4：implementation 要求 Room=WAITING_FOR_USER_CONFIRMATION，在同一 transaction 原子创建
  // ready Run（冻结 worker）并把 Room 返回 DISCUSSION；fix 附着到既有 review_discussion Run，
  // 校验 current Review 后把 Run 转回 ready，Room 状态不变。两种类型的 Run/Review/failure
  // authority 都是 per-Run，不再写入 Room.state。
  submitTask(
    input: unknown,
    actor: EventActor,
  ): { room: RoomRecord; task: PersistedTask; run: Run; created: boolean } {
    const contract = this.parse(taskContractSchema, input, 'TaskContract') as TaskContract;
    return this.tx(() => {
      this.requireRoom(contract.room_id);
      const existing = this.repo.getTask(contract.task_id);
      if (existing) {
        // same-ID retry 按 stored Task 冻结的提交 identity 认证（Review finding inc9-fr2-3）：
        // 不使用 current assignment 重新 augment existing content 后比较。content 判定复用
        // repository：layered content（caller-owned contract + stored frozen identity）与
        // stored 相同 → created=false 且零写入；不同 → id_conflict。失败由 transaction 整体
        // rollback，Run/Event 零写入。
        this.assertTaskRetryAuthority(existing, actor);
        const retry = {
          ...contract,
          planner_participant_id: existing.planner_participant_id,
          orchestrator_participant_id: existing.orchestrator_participant_id,
        };
        this.repo.insertTask(retry);
        // 首次提交已创建/推进 Run；retry 只返回既有 authority 事实。
        return {
          room: this.requireRoom(contract.room_id),
          task: existing,
          run: this.requireRun(existing.run_id),
          created: false,
        };
      }
      // 新 Task 继续使用 current assignment authority 并在提交时固化 planner/orchestrator
      // identity；输入契约本身不含这两个字段。
      this.assertAuthority(contract.room_id, actor, 'planner');
      const task = this.augmentTaskWithIdentities(contract);
      this.repo.insertTask(task);
      if (task.type === 'fix') {
        const run = this.attachFixToRun(task);
        return { room: this.requireRoom(task.room_id), task, run, created: true };
      }
      const run = this.createReadyRunForImplementation(task);
      return { room: this.requireRoom(task.room_id), task, run, created: true };
    });
  }

  // ---- Run creation（implementation 的内部步骤，仍在同一 transaction 内）----
  private createReadyRunForImplementation(task: PersistedTask): Run {
    const room = this.requireRoom(task.room_id);
    if (room.state !== 'WAITING_FOR_USER_CONFIRMATION') {
      throw new ProtocolError(
        'validation_failed',
        `implementation task ${task.task_id} requires room ${task.room_id} to be WAITING_FOR_USER_CONFIRMATION (state ${room.state})`,
      );
    }
    // worker 在 Run 创建时解析并冻结：Task scope 优先、Room default fallback；此时 Task 已
    // insert，task-scoped assignment 可正常命中。adapter 门禁不在 assignment/创建层，claim
    // 时校验（provider-neutral worker routing）。
    const worker = this.requireResolvedAssignment(task.room_id, 'task', task.task_id, 'worker');
    const createdAt = this.now();
    const run: Run = {
      run_id: task.run_id,
      room_id: task.room_id,
      root_task_id: task.task_id,
      status: 'ready',
      worker_participant_id: worker.participant_id,
      worktree_path: null,
      created_at: createdAt,
      updated_at: createdAt,
      accepted_at: null,
    };
    this.repo.insertRun(run);
    this.applyTransition(task.room_id, 'DISCUSSION', {
      participant_id: LOCAL_SERVICE_PARTICIPANT_ID,
      actor_role: 'planner',
    });
    this.repo.appendEvent({
      room_id: task.room_id,
      type: 'run_created',
      actor: { participant_id: LOCAL_SERVICE_PARTICIPANT_ID, actor_role: 'planner' },
      entity_type: 'run',
      entity_id: run.run_id,
      summary: `run ${run.run_id} created for task ${task.task_id}`,
      created_at: createdAt,
    });
    this.repo.appendEvent({
      room_id: task.room_id,
      type: 'task_submitted',
      actor: { participant_id: task.planner_participant_id, actor_role: 'planner' },
      entity_type: 'task',
      entity_id: task.task_id,
      summary: `task ${task.task_id} submitted (${task.type})`,
      created_at: createdAt,
    });
    return run;
  }

  // ---- Fix attachment（fix 的内部步骤，仍在同一 transaction 内）----
  private attachFixToRun(task: PersistedTask): Run {
    const run = this.requireRun(task.run_id);
    if (run.room_id !== task.room_id) {
      throw new ProtocolError(
        'validation_failed',
        `fix task ${task.task_id} references run ${run.run_id} from another room`,
      );
    }
    if (run.status !== 'review_discussion') {
      throw new ProtocolError(
        'validation_failed',
        `fix task ${task.task_id} requires run ${run.run_id} to be review_discussion (status ${run.status})`,
      );
    }
    const parent = this.requireTask(task.parent_task_id ?? '');
    if (parent.room_id !== task.room_id || parent.run_id !== run.run_id) {
      throw new ProtocolError(
        'validation_failed',
        `fix task ${task.task_id} references parent task from another room or run`,
      );
    }
    const review = this.requireReview(task.based_on_review_id ?? '');
    if (review.room_id !== task.room_id || review.run_id !== run.run_id || review.task_id !== parent.task_id) {
      throw new ProtocolError(
        'validation_failed',
        `fix task ${task.task_id} references review ${review.review_id} that does not target parent task in run ${run.run_id}`,
      );
    }
    // Review 只审查 target Run 的 latest succeeded attempt；Fix 必须引用该 Run 的 current
    // Review（rowid latest），stale Review 即使属于同一 Run 也拒绝。
    const currentReview = this.repo.latestReviewForRun(run.run_id);
    if (!currentReview || currentReview.review_id !== review.review_id) {
      throw new ProtocolError(
        'validation_failed',
        `fix task ${task.task_id} references review ${review.review_id} which is not the current review of run ${run.run_id}`,
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
    const updated: Run = { ...run, status: 'ready', updated_at: this.now() };
    this.repo.updateRun(updated);
    this.repo.appendEvent({
      room_id: task.room_id,
      type: 'task_submitted',
      actor: { participant_id: task.planner_participant_id, actor_role: 'planner' },
      entity_type: 'task',
      entity_id: task.task_id,
      summary: `task ${task.task_id} submitted (${task.type})`,
      created_at: this.now(),
    });
    return updated;
  }

  // ---- Atomic attempt claim (executor) ----
  // 单一 transaction 内按 Contract 顺序执行：认证 authority → 验证 Run ready → 拒绝已有
  // active attempt → 解析并冻结 executor → 校验 Worker adapter → 冻结/继承 canonical
  // canonical worktree → 分配 attempt_no → 创建 running attempt → 消费 pending guidance →
  // 更新 Run → 追加 run_attempt_claimed Event。并发 loser 由 partial unique index 映射为
  // run_already_active / worktree_already_owned，零残留。
  claimRunAttempt(
    input: unknown,
    actor: EventActor,
  ): { room: RoomRecord; run: Run; attempt: RunAttempt; guidance: RunGuidance[]; created: boolean } {
    const claim = this.parse(claimInputSchema, input, 'ClaimAttemptInput') as ClaimAttemptInput;
    return this.tx(() => {
      const existing = this.repo.getAttempt(claim.attempt_id);
      if (existing) {
        // same-ID retry 按 stored attempt 冻结的 executor 认证；不要求 current assignment。
        // caller-owned 字段（run/room/worktree）与 stored 一致 → 幂等返回首次 claim
        // 事实（含已消费 guidance）且零写入；不一致 → id_conflict。
        this.assertAttemptCommandAuthority(existing, actor, 'executor');
        if (
          existing.run_id !== claim.run_id ||
          existing.room_id !== claim.room_id ||
          existing.worktree_path !== claim.worktree_path
        ) {
          throw new ProtocolError(
            'id_conflict',
            `attempt id ${claim.attempt_id} already exists with different claim payload`,
          );
        }
        return {
          room: this.requireRoom(existing.room_id),
          run: this.requireRun(existing.run_id),
          attempt: existing,
          guidance: this.repo.listGuidanceConsumedBy(existing.attempt_id),
          created: false,
        };
      }
      const run = this.requireRun(claim.run_id);
      const room = this.requireRoom(claim.room_id);
      if (run.room_id !== claim.room_id || room.room_id !== claim.room_id) {
        throw new ProtocolError(
          'validation_failed',
          `claim ${claim.attempt_id} references run/room from different rooms`,
        );
      }
      // 已有 active attempt（或 Run 已离开 ready）→ run_already_active；partial unique
      // index 同时兜底并发竞争。
      if (this.repo.activeAttemptForRun(claim.run_id)) {
        throw new ProtocolError('run_already_active', `run ${claim.run_id} already has an active attempt`);
      }
      if (run.status !== 'ready') {
        throw new ProtocolError(
          'validation_failed',
          `run ${claim.run_id} is not ready (status ${run.status})`,
        );
      }
      // executor 按 Run 当前 Task 的 Task scope 优先、Room fallback 解析并冻结为 actor。
      const task = this.repo.latestTaskForRun(claim.run_id);
      if (!task) {
        throw new ProtocolError('entity_not_found', `run ${claim.run_id} has no task`);
      }
      this.assertExecutorClaimAuthority(task, actor);
      // Worker adapter 门禁：本实现只验收 claude_code_cli；其它 adapter 在 claim 前拒绝且
      // 零 attempt/process/Event/artifact。worker assignment 本身允许 provider-neutral
      // 创建，因此该检查只出现在 claim boundary。
      this.assertWorkerAdapterAvailable(run.worker_participant_id);
      // canonical worktree：首 attempt 冻结 caller 解析的 repository root；后续 attempt
      // 必须使用同一 canonical worktree（live evidence 由 Executor 在 claim 前通过 Git
      // Observer 收集，claim 只验证 lineage 一致性）。
      let worktreePath: string;
      if (run.worktree_path === null) {
        worktreePath = claim.worktree_path;
      } else {
        if (run.worktree_path !== claim.worktree_path) {
          throw new ProtocolError(
            'validation_failed',
            `run ${claim.run_id} is frozen to worktree ${run.worktree_path}`,
          );
        }
        worktreePath = run.worktree_path;
      }
      const createdAt = this.now();
      const attempt: RunAttempt = {
        attempt_id: claim.attempt_id,
        run_id: claim.run_id,
        room_id: claim.room_id,
        task_id: task.task_id,
        attempt_no: this.repo.nextAttemptNo(claim.run_id),
        status: 'running',
        worker_participant_id: run.worker_participant_id,
        executor_participant_id: actor.participant_id,
        worktree_path: worktreePath,
        agent_session_ref: null,
        process_exit_code: null,
        started_at: createdAt,
        settled_at: null,
        result: null,
        git_evidence: { staged: [], unstaged: [], untracked: [] },
        artifact_refs: [],
        failure: null,
      };
      // insertAttempt 的 UNIQUE(run_id, attempt_no) / active-attempt partial index 把并发
      // double-claim 映射为 run_already_active。
      this.repo.insertAttempt(attempt);
      // 消费 pending guidance：每一条至多被一个 attempt 消费，consumed_by_attempt_id 固化。
      const guidance = this.repo.listUnconsumedGuidance(claim.run_id);
      for (const item of guidance) {
        this.repo.updateGuidance({ ...item, consumed_by_attempt_id: attempt.attempt_id });
      }
      // Run 冻结 worktree（首 attempt）并进入 running；同 worktree 未 accepted
      // 双 Run 由 partial unique index 映射为 worktree_already_owned。
      const updatedRun: Run = {
        ...run,
        status: 'running',
        worktree_path: worktreePath,
        updated_at: createdAt,
      };
      resolveRunTransition(run.status, updatedRun.status, actor.actor_role);
      this.repo.updateRun(updatedRun);
      this.repo.appendEvent({
        room_id: claim.room_id,
        type: 'run_attempt_claimed',
        actor,
        entity_type: 'run_attempt',
        entity_id: attempt.attempt_id,
        summary: `attempt ${attempt.attempt_id} (#${attempt.attempt_no}) claimed for run ${claim.run_id}`,
        created_at: createdAt,
      });
      return { room, run: updatedRun, attempt, guidance, created: true };
    });
  }

  // ---- Attempt settlement (executor) ----
  // terminal outcome 的 first-writer-wins：conditional UPDATE 在同一 attempt 上串行化
  // success/failure/cancel 竞争，winner 写 terminal status + evidence + 恰好一个 terminal
  // Event；loser 重读后按 payload 签名判定幂等（零 Event）或 id_conflict（完整 snapshot 不变）。
  // planner 已先行写入 cancel_requested 时，唯一合法 terminal 是 canceled（planner 意图优先）。
  // Review finding inc10-r2：terminal status 与持久化 result/failure 必须 canonical 一致，
  // 矛盾 evidence 以 validation_failed 拒绝且完整 durable snapshot 不变；canceled 的
  // canonical payload 为 result=null + failure=null。
  settleRunAttempt(input: unknown, actor: EventActor): { room: RoomRecord; run: Run; attempt: RunAttempt } {
    const settle = this.parse(settleInputSchema, input, 'SettleAttemptInput') as SettleAttemptInput;
    return this.tx(() => {
      // 至多三轮：首次按 caller 目标推进；conditional UPDATE 失败后重读（另一 writer 已
      // 推进 status），按新 status 重分类；再次失败说明存在第三个 writer，直接 id_conflict。
      for (let round = 0; round < 3; round++) {
        const attempt = this.requireAttempt(settle.attempt_id);
        this.assertAttemptCommandAuthority(attempt, actor, 'executor');
        if (this.isTerminalAttemptStatus(attempt.status)) {
          // canceled 首次结算已把 payload 规范化（result=null + failure=null）：幂等 retry
          // 必须按 canonical payload 比较，caller 首次携带的 success/decision 分类与
          // failure 分类均已作废，evidence 字段仍按首次结算事实比较。
          const canonicalSettle =
            attempt.status === 'canceled'
              ? this.canonicalSettlePayload(attempt.task_id, 'canceled', settle)
              : settle;
          const signature = this.attemptTerminalSignature({
            status: attempt.status,
            result: attempt.result,
            failure: attempt.failure,
            agent_session_ref: attempt.agent_session_ref,
            process_exit_code: attempt.process_exit_code,
            git_evidence: attempt.git_evidence,
            artifact_refs: attempt.artifact_refs,
          });
          if (signature === this.attemptTerminalSignature(canonicalSettle)) {
            // 相同 payload retry：返回既有 terminal attempt，零 Event。
            return {
              room: this.requireRoom(attempt.room_id),
              run: this.requireRun(attempt.run_id),
              attempt,
            };
          }
          throw new ProtocolError(
            'id_conflict',
            `attempt ${settle.attempt_id} already settled with a different payload`,
          );
        }
        const expected = attempt.status;
        // planner cancel intent 已先行写入 cancel_requested：Executor 的 terminal 只能是
        // canceled；进程已被 AbortSignal 终止，caller 提供的 success/decision 分类作废。
        const target = expected === 'cancel_requested' ? 'canceled' : settle.status;
        resolveAttemptTransition(expected, target, actor.actor_role);
        // canonical terminal payload（Review finding inc10-r2）：transition 校验保持最先
        //（既存错误优先级不变），随后按 target 校验/规范化 result/failure 并以 canonical
        // payload 写入；矛盾 evidence → validation_failed，transaction 整体回滚。
        const canonical = this.canonicalSettlePayload(attempt.task_id, target, settle);
        const updated: RunAttempt = {
          ...attempt,
          status: target,
          agent_session_ref: canonical.agent_session_ref,
          process_exit_code: canonical.process_exit_code,
          settled_at: this.now(),
          result: canonical.result,
          git_evidence: canonical.git_evidence,
          artifact_refs: canonical.artifact_refs,
          failure: canonical.failure,
        };
        if (!this.repo.updateAttemptIfStatus(updated, expected)) {
          continue; // 另一 writer 已推进：重读后重分类
        }
        // winner：Run 状态在同一 transaction 推进，terminal Event 恰好一个。
        const run = this.requireRun(attempt.run_id);
        const runStatus = this.runStatusForTerminal(target);
        resolveRunTransition(run.status, runStatus, actor.actor_role);
        const updatedRun: Run = { ...run, status: runStatus, updated_at: this.now() };
        this.repo.updateRun(updatedRun);
        this.repo.appendEvent({
          room_id: attempt.room_id,
          type: this.eventTypeForTerminal(target),
          actor,
          entity_type: 'run_attempt',
          entity_id: attempt.attempt_id,
          summary: `attempt ${attempt.attempt_id} settled ${target}`,
          created_at: this.now(),
        });
        return { room: this.requireRoom(attempt.room_id), run: updatedRun, attempt: updated };
      }
      throw new ProtocolError('id_conflict', `attempt ${settle.attempt_id} settlement raced repeatedly`);
    });
  }

  // Executor 实时把非终态 progress evidence 追加为 run_attempt progress Event。progress 不是
  // 状态权威来源：不改变 Room/Run/Attempt state。只接受 frozen executor 与仍 running 的
  // attempt；decision_requested/cancel_requested/terminal 一律 validation_failed。
  appendAttemptProgress(
    input: { attempt_id: string; type: string | null; subtype: string | null; outcome: string | null },
    actor: EventActor,
  ): void {
    this.tx(() => {
      const attempt = this.requireAttempt(input.attempt_id);
      this.assertAttemptCommandAuthority(attempt, actor, 'executor');
      if (attempt.status !== 'running') {
        throw new ProtocolError(
          'validation_failed',
          `attempt ${attempt.attempt_id} is not running (status ${attempt.status})`,
        );
      }
      const label =
        [input.type, input.subtype].filter((p): p is string => p !== null).join(':') || 'unknown';
      this.repo.appendEvent({
        room_id: attempt.room_id,
        type: 'run_attempt_progress',
        actor,
        entity_type: 'run_attempt',
        entity_id: attempt.attempt_id,
        summary: `attempt ${attempt.attempt_id} progress ${label}`,
        created_at: this.now(),
      });
    });
  }

  // ---- Question (worker / planner) ----
  // v0.4：Question 由 frozen worker 对 active attempt 提出，原子创建 Question 并把 attempt
  // 置 decision_requested；Run 保持 running 直到 Executor 停止 process 并 settle
  // needs_decision。answer 要求 attempt 已 terminal-finalized。
  askQuestion(input: unknown, actor: EventActor): { room: RoomRecord; question: Question; attempt: RunAttempt; created: boolean } {
    const question = this.parse(questionSchema, input, 'Question') as Question;
    return this.tx(() => {
      const attempt = this.requireAttempt(question.attempt_id);
      // frozen worker authority：actor 必须存在、enabled、role=worker 且等于 attempt 冻结的
      // worker identity（Review finding inc9-r1），失败整体回滚。
      this.assertAttemptCommandAuthority(attempt, actor, 'worker');
      const normalized: Question = {
        ...question,
        status: 'open',
        answer: null,
        answer_changes_contract: null,
        answered_at: null,
      };
      const inserted = this.repo.insertQuestion(normalized);
      if (!inserted.created) {
        // authorized same-content retry 直接返回既有 Question：首次 ask 已把 attempt 置为
        // decision_requested，running/task-room guard 只约束 newly inserted Question。
        return {
          room: this.requireRoom(question.room_id),
          question: this.requireQuestion(question.question_id),
          attempt,
          created: false,
        };
      }
      if (attempt.status !== 'running') {
        throw new ProtocolError(
          'validation_failed',
          `attempt ${attempt.attempt_id} is not running (status ${attempt.status})`,
        );
      }
      if (attempt.run_id !== question.run_id || attempt.task_id !== question.task_id || attempt.room_id !== question.room_id) {
        throw new ProtocolError(
          'validation_failed',
          `question ${question.question_id} references attempt ${attempt.attempt_id} that does not match run/task/room`,
        );
      }
      const updatedAttempt: RunAttempt = { ...attempt, status: 'decision_requested' };
      resolveAttemptTransition(attempt.status, updatedAttempt.status, actor.actor_role);
      this.repo.updateAttemptIfStatus(updatedAttempt, attempt.status);
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
        attempt: updatedAttempt,
        created: true,
      };
    });
  }

  answerQuestion(
    questionId: string,
    answer: string,
    answerChangesContract: boolean,
    actor: EventActor,
  ): { room: RoomRecord; question: Question; run: Run } {
    return this.tx(() => {
      const question = this.requireQuestion(questionId);
      this.assertAuthority(question.room_id, actor, 'planner');
      if (question.status !== 'open') {
        throw new ProtocolError('validation_failed', `question ${questionId} is not open`);
      }
      // 回答前 gate：source attempt 必须已 terminal-finalized（needs_decision）、Run 必须
      // needs_decision，且 Question 是该 Run 的 current open Question；避免旧 process 与
      // resume process 并行修改同一 worktree。
      const attempt = this.requireAttempt(question.attempt_id);
      if (attempt.status !== 'needs_decision') {
        throw new ProtocolError(
          'validation_failed',
          `question ${questionId} source attempt ${attempt.attempt_id} is not terminal-finalized needs_decision`,
        );
      }
      const run = this.requireRun(question.run_id);
      if (run.status !== 'needs_decision') {
        throw new ProtocolError(
          'validation_failed',
          `question ${questionId} source run ${run.run_id} is not needs_decision`,
        );
      }
      if (attempt.run_id !== question.run_id || run.room_id !== question.room_id || attempt.task_id !== question.task_id) {
        throw new ProtocolError(
          'validation_failed',
          `question ${questionId} source run/attempt does not match task/room`,
        );
      }
      const currentQuestion = this.repo.latestOpenQuestionForRun(run.run_id);
      if (!currentQuestion || currentQuestion.question_id !== questionId) {
        throw new ProtocolError(
          'validation_failed',
          `question ${questionId} is not the current open question of run ${run.run_id}`,
        );
      }
      const answered: Question = {
        ...question,
        status: 'answered',
        answer,
        answer_changes_contract: answerChangesContract,
        answered_at: this.now(),
      };
      this.repo.updateQuestion(answered);
      let updatedRun: Run;
      if (answerChangesContract) {
        // scope-changing answer：进入 Room planning confirmation，Run 保持 needs_decision
        //（planner 须提交 revised contract 的新 Implementation Run）；不改变其它 Run。
        const room = this.requireRoom(question.room_id);
        if (room.state === 'DISCUSSION') {
          this.applyTransition(question.room_id, 'WAITING_FOR_USER_CONFIRMATION', actor);
        } else if (room.state !== 'WAITING_FOR_USER_CONFIRMATION') {
          throw new ProtocolError(
            'validation_failed',
            `room ${question.room_id} state ${room.state} cannot enter planning confirmation`,
          );
        }
        updatedRun = run;
      } else {
        // contract 内答案：只把该 Run 置 ready；其它 Run 与 Room 状态不变。
        updatedRun = { ...run, status: 'ready', updated_at: this.now() };
        resolveRunTransition(run.status, updatedRun.status, actor.actor_role);
        this.repo.updateRun(updatedRun);
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
      return { room: this.requireRoom(question.room_id), question: answered, run: updatedRun };
    });
  }

  // ---- Review (reviewer) ----
  // v0.4：Review 只审查 target Run 的 latest succeeded attempt；attempt_id 固化该 attempt。
  // 提交把 Run review_required → review_discussion；acceptance 把 Run → accepted（accepted_at
  // 固化）并释放 worktree lease。Room 状态不参与。
  submitReview(input: unknown, actor: EventActor): { room: RoomRecord; review: Review; run: Run; created: boolean } {
    const review = this.parse(reviewSchema, input, 'Review') as Review;
    return this.tx(() => {
      const existing = this.repo.getReview(review.review_id);
      if (existing) {
        // same-ID retry 按 stored Review 冻结的 reviewer identity 认证（Review finding
        // inc9-fr2-3）。content 判定复用 repository：同 content → created=false 且零写入；
        // 不同 → id_conflict。
        this.assertReviewCommandAuthority(existing, actor);
        this.repo.insertReview(review);
        return {
          room: this.requireRoom(review.room_id),
          review: existing,
          run: this.requireRun(existing.run_id),
          created: false,
        };
      }
      // 新 Review 继续使用 current reviewer assignment（Task scope 优先、Room fallback，
      // Review finding inc9-r2）并固化 identity；guard 只作用于 newly created Review。
      this.assertReviewerAuthority(review, actor);
      this.repo.insertReview(review);
      const run = this.requireRun(review.run_id);
      const task = this.requireTask(review.task_id);
      if (task.room_id !== review.room_id || run.room_id !== review.room_id || task.run_id !== run.run_id) {
        throw new ProtocolError(
          'validation_failed',
          `review ${review.review_id} references task/run from another room or lineage`,
        );
      }
      if (run.status !== 'review_required') {
        throw new ProtocolError(
          'validation_failed',
          `review ${review.review_id} references run ${run.run_id} that is not review_required (status ${run.status})`,
        );
      }
      // 只允许 latest succeeded attempt 进入 review：attempt_id 必须等于该 Run attempt_no
      // 最大且 status=succeeded 的 attempt，且 Review 的 task 必须与该 attempt 一致。
      const latestAttempt = this.repo.latestAttemptForRun(run.run_id);
      if (!latestAttempt || latestAttempt.status !== 'succeeded' || latestAttempt.attempt_id !== review.attempt_id) {
        throw new ProtocolError(
          'validation_failed',
          `review ${review.review_id} attempt ${review.attempt_id} is not the latest succeeded attempt of run ${run.run_id}`,
        );
      }
      if (latestAttempt.task_id !== review.task_id) {
        throw new ProtocolError(
          'validation_failed',
          `review ${review.review_id} references task ${review.task_id} that is not the target of attempt ${latestAttempt.attempt_id}`,
        );
      }
      const updated: Run = { ...run, status: 'review_discussion', updated_at: this.now() };
      resolveRunTransition(run.status, updated.status, actor.actor_role);
      this.repo.updateRun(updated);
      this.repo.appendEvent({
        room_id: review.room_id,
        type: 'review_submitted',
        actor,
        entity_type: 'review',
        entity_id: review.review_id,
        summary: `review ${review.review_id} submitted`,
        created_at: this.now(),
      });
      return { room: this.requireRoom(review.room_id), review, run: updated, created: true };
    });
  }

  acceptReview(
    reviewId: string,
    confirmedByUser: boolean,
    actor: EventActor,
  ): { room: RoomRecord; review: Review; run: Run } {
    return this.tx(() => {
      const review = this.requireReview(reviewId);
      // acceptance authority 只对照 Review 提交时冻结的 reviewer identity（Review finding
      // inc9-fr2-2）：不要求仍持有 current assignment。
      this.assertReviewCommandAuthority(review, actor);
      if (confirmedByUser !== true) {
        throw new ProtocolError('validation_failed', `review ${reviewId} acceptance requires confirmed_by_user`);
      }
      if (review.findings.some((f) => f.severity === 'blocker')) {
        throw new ProtocolError('validation_failed', `review ${reviewId} still has blocking findings`);
      }
      // per-Run current Review：rowid latest；stale Review 即使属于同一 Run 也拒绝。
      const run = this.requireRun(review.run_id);
      if (run.status !== 'review_discussion') {
        throw new ProtocolError(
          'validation_failed',
          `review ${reviewId} run ${run.run_id} is not review_discussion (status ${run.status})`,
        );
      }
      const currentReview = this.repo.latestReviewForRun(run.run_id);
      if (!currentReview || currentReview.review_id !== reviewId) {
        throw new ProtocolError('validation_failed', `review ${reviewId} is not the current review of run ${run.run_id}`);
      }
      const updated: Run = { ...run, status: 'accepted', accepted_at: this.now(), updated_at: this.now() };
      resolveRunTransition(run.status, updated.status, actor.actor_role);
      // accepted 后 partial unique index 不再占用 worktree（status != 'accepted' 的 WHERE
      // 集合），canonical worktree lease 释放；lineage 字段保留为历史事实。
      this.repo.updateRun(updated);
      this.repo.appendEvent({
        room_id: review.room_id,
        type: 'review_accepted',
        actor,
        entity_type: 'review',
        entity_id: reviewId,
        summary: `review ${reviewId} accepted`,
        created_at: this.now(),
      });
      return { room: this.requireRoom(review.room_id), review, run: updated };
    });
  }

  // ---- Retry (planner) ----
  // 只把目标 failed/canceled Run 转 ready；needs_decision 由 Question answer 恢复，
  // review_discussion 由 Fix Task 恢复。其它 Run 与 Room 状态不变。
  retryRun(roomId: string, runId: string, actor: EventActor): { room: RoomRecord; run: Run } {
    return this.tx(() => {
      this.assertAuthority(roomId, actor, 'planner');
      const run = this.requireRun(runId);
      if (run.room_id !== roomId) {
        throw new ProtocolError('validation_failed', `run ${runId} is not in room ${roomId}`);
      }
      if (run.status !== 'failed' && run.status !== 'canceled') {
        throw new ProtocolError(
          'validation_failed',
          `run ${runId} status ${run.status} cannot be retried (only failed/canceled)`,
        );
      }
      const updated: Run = { ...run, status: 'ready', updated_at: this.now() };
      resolveRunTransition(run.status, updated.status, actor.actor_role);
      this.repo.updateRun(updated);
      this.repo.appendEvent({
        room_id: roomId,
        type: 'run_retried',
        actor,
        entity_type: 'run',
        entity_id: runId,
        summary: `run ${runId} retried`,
        created_at: this.now(),
      });
      return { room: this.requireRoom(roomId), run: updated };
    });
  }

  // ---- Cancel (planner) ----
  // 把目标 active attempt 与 Run 置 cancel_requested 并追加 Event；Executor 通过 poll
  // boundary 观察到 cancel_requested 后 AbortSignal 终止 owned process 并唯一 settle
  // canceled。与 terminal settle 的竞争由 conditional UPDATE 串行化，只产生一个 terminal
  // Event。open Question 随 attempt 被 supersede，避免 snapshot 误导。
  cancelRun(
    input: unknown,
    actor: EventActor,
  ): { room: RoomRecord; run: Run; attempt: RunAttempt; created: boolean } {
    const cancel = this.parse(cancelInputSchema, input, 'CancelRunInput') as {
      room_id: string;
      run_id: string;
      reason: string;
      confirmed_by_user: boolean;
    };
    return this.tx(() => {
      this.assertAuthority(cancel.room_id, actor, 'planner');
      if (cancel.confirmed_by_user !== true) {
        throw new ProtocolError('validation_failed', `cancel of run ${cancel.run_id} requires confirmed_by_user`);
      }
      const run = this.requireRun(cancel.run_id);
      if (run.room_id !== cancel.room_id) {
        throw new ProtocolError('validation_failed', `run ${cancel.run_id} is not in room ${cancel.room_id}`);
      }
      const active = this.repo.activeAttemptForRun(cancel.run_id);
      if (!active) {
        throw new ProtocolError(
          'validation_failed',
          `run ${cancel.run_id} has no active attempt to cancel`,
        );
      }
      // same-ID cancel retry（attempt 已 cancel_requested）：幂等返回既有事实，零 Event。
      if (active.status === 'cancel_requested' && run.status === 'cancel_requested') {
        return { room: this.requireRoom(cancel.room_id), run, attempt: active, created: false };
      }
      const updatedAttempt: RunAttempt = { ...active, status: 'cancel_requested' };
      resolveAttemptTransition(active.status, updatedAttempt.status, actor.actor_role);
      if (!this.repo.updateAttemptIfStatus(updatedAttempt, active.status)) {
        // 竞争 loser：attempt 已被 settle（terminal）→ 取消已不可能；或已 cancel_requested。
        const current = this.requireAttempt(active.attempt_id);
        if (current.status === 'cancel_requested') {
          return { room: this.requireRoom(cancel.room_id), run: this.requireRun(cancel.run_id), attempt: current, created: false };
        }
        throw new ProtocolError(
          'validation_failed',
          `attempt ${active.attempt_id} already settled (status ${current.status}); cancel is no longer possible`,
        );
      }
      // cancel 使 attempt 上的 open Question 失效：decision_requested → cancel_requested 后
      // Question 不能再被 answer（attempt 未以 needs_decision 终结），显式 supersede。
      const openQuestions = this.repo
        .listQuestions(cancel.room_id)
        .filter((q) => q.attempt_id === active.attempt_id && q.status === 'open');
      for (const q of openQuestions) {
        this.repo.updateQuestion({ ...q, status: 'superseded' });
      }
      const updatedRun: Run = { ...run, status: 'cancel_requested', updated_at: this.now() };
      resolveRunTransition(run.status, updatedRun.status, actor.actor_role);
      this.repo.updateRun(updatedRun);
      this.repo.appendEvent({
        room_id: cancel.room_id,
        type: 'run_cancel_requested',
        actor,
        entity_type: 'run',
        entity_id: cancel.run_id,
        summary: `run ${cancel.run_id} cancel requested: ${cancel.reason}`,
        created_at: this.now(),
      });
      return { room: this.requireRoom(cancel.room_id), run: updatedRun, attempt: updatedAttempt, created: true };
    });
  }

  // ---- Run guidance (planner) ----
  // 只有目标 Run 无 active attempt 时可创建；下一 attempt claim 原子消费一次并注入完整
  // prompt。running/decision_requested/cancel_requested 期间请求以 validation_failed 零写入
  // 拒绝，不宣称 Claude live steer。
  addRunGuidance(
    input: unknown,
    actor: EventActor,
  ): { room: RoomRecord; guidance: RunGuidance; created: boolean } {
    // 输入只含 caller-owned 字段：planner_participant_id/created_at/consumed_by_attempt_id
    // 由 service 固化，caller 不可指定（与其它 entity 的 caller-provided timestamp 不同，
    // guidance 是 planner 在 claim 间隙的指令，不需要 caller 提供时间）。
    const guidanceInput = this.parse(addGuidanceInputSchema, input, 'RunGuidanceInput') as {
      guidance_id: string;
      room_id: string;
      run_id: string;
      text: string;
    };
    return this.tx(() => {
      this.assertAuthority(guidanceInput.room_id, actor, 'planner');
      // same-ID retry：created_at 是 service 时间，无法与首次完全一致，因此按 caller-owned
      // 字段（room/run/text + 冻结 planner identity）判定幂等；不一致 → id_conflict。
      const existing = this.repo.getGuidance(guidanceInput.guidance_id);
      if (existing) {
        if (
          existing.room_id !== guidanceInput.room_id ||
          existing.run_id !== guidanceInput.run_id ||
          existing.text !== guidanceInput.text ||
          existing.planner_participant_id !== actor.participant_id
        ) {
          throw new ProtocolError(
            'id_conflict',
            `guidance id ${guidanceInput.guidance_id} already exists with different content`,
          );
        }
        return { room: this.requireRoom(guidanceInput.room_id), guidance: existing, created: false };
      }
      const run = this.requireRun(guidanceInput.run_id);
      if (run.room_id !== guidanceInput.room_id) {
        throw new ProtocolError(
          'validation_failed',
          `run ${guidanceInput.run_id} is not in room ${guidanceInput.room_id}`,
        );
      }
      if (this.repo.activeAttemptForRun(guidanceInput.run_id)) {
        throw new ProtocolError(
          'validation_failed',
          `run ${guidanceInput.run_id} has an active attempt; guidance must be added between attempts`,
        );
      }
      const normalized: RunGuidance = {
        guidance_id: guidanceInput.guidance_id,
        room_id: guidanceInput.room_id,
        run_id: guidanceInput.run_id,
        text: guidanceInput.text,
        planner_participant_id: actor.participant_id,
        created_at: this.now(),
        consumed_by_attempt_id: null,
      };
      this.repo.insertGuidance(normalized);
      this.repo.appendEvent({
        room_id: guidanceInput.room_id,
        type: 'run_guidance_added',
        actor,
        entity_type: 'run_guidance',
        entity_id: guidanceInput.guidance_id,
        summary: `guidance ${guidanceInput.guidance_id} added for run ${guidanceInput.run_id}`,
        created_at: this.now(),
      });
      return { room: this.requireRoom(guidanceInput.room_id), guidance: normalized, created: true };
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
  // created_at）。Stage 2 消费点：Task 提交使用 Room planner/orchestrator；Run 创建按 Task
  // scope 优先、Room default fallback 解析 worker（Review finding inc9-r2）；claim 按 Run
  // 当前 Task 解析 executor。
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

  getAttempt(attemptId: string): RunAttempt | null {
    return this.repo.getAttempt(attemptId);
  }

  getReview(reviewId: string): Review | null {
    return this.repo.getReview(reviewId);
  }

  getQuestion(questionId: string): Question | null {
    return this.repo.getQuestion(questionId);
  }

  getGuidance(guidanceId: string): RunGuidance | null {
    return this.repo.getGuidance(guidanceId);
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

  listAttemptsByRoom(roomId: string): RunAttempt[] {
    return this.repo.listAttemptsByRoom(roomId);
  }

  listAttemptsByRun(runId: string): RunAttempt[] {
    return this.repo.listAttemptsByRun(runId);
  }

  // per-Run latest reference readers：snapshot / Executor 的 work item 推导与 session lineage
  // 恢复共用，避免各自扫描 entity 内容。
  latestTaskForRun(runId: string): PersistedTask | null {
    return this.repo.latestTaskForRun(runId);
  }

  latestAttemptForRun(runId: string): RunAttempt | null {
    return this.repo.latestAttemptForRun(runId);
  }

  activeAttemptForRun(runId: string): RunAttempt | null {
    return this.repo.activeAttemptForRun(runId);
  }

  latestOpenQuestionForRun(runId: string): Question | null {
    return this.repo.latestOpenQuestionForRun(runId);
  }

  latestReviewForRun(runId: string): Review | null {
    return this.repo.latestReviewForRun(runId);
  }

  listReviews(roomId: string): Review[] {
    return this.repo.listReviews(roomId);
  }

  listQuestions(roomId: string): Question[] {
    return this.repo.listQuestions(roomId);
  }

  listGuidanceByRoom(roomId: string): RunGuidance[] {
    return this.repo.listGuidanceByRoom(roomId);
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
  // writer transaction：BEGIN IMMEDIATE 立即取得 RESERVED 写锁（Review finding inc10-r1），
  // 使 guard 读与后续写共享同一写锁；并发 writer 经 busy_timeout 串行化，loser 以 winner
  // commit 后的 fresh state 重走 guard，不会读到 stale active attempt / worktree lease。
  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
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

  // Worker adapter 门禁（claim boundary）：Run 冻结的 worker 必须是唯一已验收的
  // claude_code_cli adapter；其它 adapter 在此以 worker_adapter_unavailable 拒绝，且发生在
  // 任何 attempt/Event/artifact 写入之前（transaction 内先于 insertAttempt）。
  private assertWorkerAdapterAvailable(workerParticipantId: string): void {
    const profile = this.repo.getParticipant(workerParticipantId);
    if (!profile) {
      throw new ProtocolError('entity_not_found', `worker participant ${workerParticipantId} not found`);
    }
    if (profile.adapter_id !== 'claude_code_cli') {
      throw new ProtocolError(
        'worker_adapter_unavailable',
        `worker participant ${workerParticipantId} uses adapter ${profile.adapter_id}; only claude_code_cli is available`,
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

  // claim 的 executor authority（Review finding inc9-r2）：actor 必须存在、enabled、role
  // 正确，且等于 Run 当前 Task 的 Task scope 优先（Room fallback）解析的 executor。attempt
  // 冻结 identity 就是 actor 本身，与解析结果一致性在 freeze 点天然成立。
  private assertExecutorClaimAuthority(task: PersistedTask, actor: EventActor): void {
    this.assertParticipantActive(actor);
    if (actor.actor_role !== 'executor') {
      throw new ProtocolError(
        'actor_not_allowed',
        `participant ${actor.participant_id} cannot act as executor (role ${actor.actor_role})`,
      );
    }
    const assignment = this.resolveAssignment(task.room_id, 'task', task.task_id, 'executor');
    if (!assignment) {
      throw new ProtocolError(
        'actor_not_allowed',
        `no executor assignment for task ${task.task_id} in room ${task.room_id}`,
      );
    }
    this.assertAssignable(assignment);
    if (assignment.participant_id !== actor.participant_id) {
      throw new ProtocolError(
        'actor_not_allowed',
        `participant ${actor.participant_id} has no active executor assignment for task ${task.task_id} in room ${task.room_id}`,
      );
    }
  }

  // attempt 的 command authority（Review finding inc9-r1）：先校验 route participant 存在、
  // enabled 且 actor_role 与 required role 一致，再只对照 claim 时冻结的 worker/executor
  // identity；不要求该 participant 仍持有 current assignment，因此 assignment replacement 不
  // 撤销冻结 authority，replacement participant 也不能接管旧 attempt。disabled 冻结
  // participant 必须先 re-enable 才能恢复 command。
  private assertAttemptCommandAuthority(attempt: RunAttempt, actor: EventActor, role: 'worker' | 'executor'): void {
    this.assertParticipantActive(actor);
    if (actor.actor_role !== role) {
      throw new ProtocolError(
        'actor_not_allowed',
        `participant ${actor.participant_id} cannot act as ${role} (role ${actor.actor_role})`,
      );
    }
    const frozenParticipantId =
      role === 'worker' ? attempt.worker_participant_id : attempt.executor_participant_id;
    if (frozenParticipantId !== actor.participant_id) {
      throw new ProtocolError(
        'actor_not_allowed',
        `attempt ${attempt.attempt_id} ${role} is ${frozenParticipantId}, not ${actor.participant_id}`,
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

  // canonical terminal payload（Review finding inc10-r2）：terminal status 与持久化
  // result/failure 相互一致，矛盾 evidence 在写入前以 validation_failed 拒绝。
  // - succeeded：result.status=completed + result.task_id=attempt.task_id + failure=null
  // - failed/interrupted：result=null + failure 非 null（只保存 failure evidence）
  // - needs_decision：带 result 时必须 result.status=needs_decision + 同 task + failure=null；
  //   result=null + failure 非 null 保留为 pause evidence —— Executor 在 decision_requested
  //   后收集 process/stream/Git/artifact evidence 失败的唯一 legal terminal（transition
  //   table 无 decision_requested→failed）。用户已确认 terminal evidence 方案 1
  //   （2026-08-31）：result-carrying form 按上述校验，pause-failure form 保留且不是
  //   第二个 business Decision result；Executor 与 transition table 不变，claude-runner
  //   四个 pause-failure regression 不受影响。
  //   result=null + failure=null 不表达任何可接受 terminal 事实，validation_failed
  //   （Review finding inc10-fix1-r1）；legal evidence 是上述两种形态的 union。
  // - canceled：planner intent 优先，canonical payload 为 result=null + failure=null；
  //   caller 的 success/decision/failure 分类作废，session/process/Git/artifact evidence
  //   保留首次结算事实。
  private canonicalSettlePayload(
    taskId: string,
    target: SettleAttemptInput['status'],
    settle: SettleAttemptInput,
  ): SettleAttemptInput {
    if (target === 'canceled') {
      return { ...settle, status: 'canceled', result: null, failure: null };
    }
    if (target === 'succeeded') {
      if (
        settle.result === null ||
        settle.result.status !== 'completed' ||
        settle.result.task_id !== taskId ||
        settle.failure !== null
      ) {
        throw new ProtocolError(
          'validation_failed',
          `attempt ${settle.attempt_id} cannot settle succeeded without a completed same-task result and no failure`,
        );
      }
      return settle;
    }
    if (target === 'needs_decision') {
      if (
        settle.result !== null &&
        (settle.result.status !== 'needs_decision' ||
          settle.result.task_id !== taskId ||
          settle.failure !== null)
      ) {
        throw new ProtocolError(
          'validation_failed',
          `attempt ${settle.attempt_id} cannot settle needs_decision with a mismatched result or failure`,
        );
      }
      // 两种 legal shape 的 union：result-carrying（上方校验）或 pause-failure（result=null +
      // non-null failure）。null/null 不表达任何 terminal 事实（Review finding
      // inc10-fix1-r1），validation_failed 且 transaction 整体回滚。
      if (settle.result === null && settle.failure === null) {
        throw new ProtocolError(
          'validation_failed',
          `attempt ${settle.attempt_id} cannot settle needs_decision without result or failure evidence`,
        );
      }
      return settle;
    }
    if (settle.result !== null || settle.failure === null) {
      throw new ProtocolError(
        'validation_failed',
        `attempt ${settle.attempt_id} cannot settle ${target} with a result or without failure evidence`,
      );
    }
    return settle;
  }

  private isTerminalAttemptStatus(status: string): boolean {
    return ['succeeded', 'failed', 'needs_decision', 'canceled', 'interrupted'].includes(status);
  }

  private runStatusForTerminal(target: string): Run['status'] {
    switch (target) {
      case 'succeeded':
        return 'review_required';
      case 'needs_decision':
        return 'needs_decision';
      case 'canceled':
        return 'canceled';
      default:
        // failed 与 interrupted 都把 Run 置 failed：attempt 保留真实 terminal status 与
        // failure evidence，Run 表达 lineage 已失败等待 planner 决定。
        return 'failed';
    }
  }

  private eventTypeForTerminal(target: string): string {
    switch (target) {
      case 'succeeded':
        return 'run_attempt_succeeded';
      case 'needs_decision':
        return 'run_attempt_needs_decision';
      case 'canceled':
        return 'run_attempt_canceled';
      default:
        // interrupted 复用 run_attempt_failed Event：终端仍是失败语义。
        return 'run_attempt_failed';
    }
  }

  // terminal payload 的稳定签名：比较 settle evidence 是否与既有 attempt 一致，用于幂等
  // retry / id_conflict。字段已经过 schema normalization，JSON.stringify 的 key 顺序稳定；
  // settled_at 是 server 时间，不参与签名。
  private attemptTerminalSignature(input: {
    status: string;
    result: CodingResult | null;
    failure: { code: string; message: string } | null;
    agent_session_ref: string | null;
    process_exit_code: number | null;
    git_evidence: { staged: string[]; unstaged: string[]; untracked: string[] };
    artifact_refs: string[];
  }): string {
    return JSON.stringify([
      input.status,
      input.result,
      input.failure,
      input.agent_session_ref,
      input.process_exit_code,
      input.git_evidence,
      input.artifact_refs,
    ]);
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

  private requireAttempt(attemptId: string): RunAttempt {
    const attempt = this.repo.getAttempt(attemptId);
    if (!attempt) throw new ProtocolError('entity_not_found', `attempt ${attemptId} not found`);
    return attempt;
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
}

// claim/settle/cancel 输入的 service-local schema：只校验 caller-owned 字段，attempt_no、
// started_at 等 server-assigned 字段不进入输入契约。
const claimInputSchema = z.object({
  attempt_id: z.string().min(1),
  run_id: z.string().min(1),
  room_id: z.string().min(1),
  worktree_path: z.string().min(1),
});

const settleInputSchema = z.object({
  attempt_id: z.string().min(1),
  status: z.enum(['succeeded', 'failed', 'needs_decision', 'canceled', 'interrupted']),
  result: codingResultSchema.nullable(),
  failure: z.object({ code: z.string(), message: z.string() }).nullable(),
  agent_session_ref: z.string().nullable(),
  process_exit_code: z.number().int().nullable(),
  git_evidence: z.object({
    staged: z.array(z.string()),
    unstaged: z.array(z.string()),
    untracked: z.array(z.string()),
  }),
  artifact_refs: z.array(z.string()),
});

const cancelInputSchema = z.object({
  room_id: z.string().min(1),
  run_id: z.string().min(1),
  reason: z.string(),
  confirmed_by_user: z.boolean(),
});

const addGuidanceInputSchema = z.object({
  guidance_id: z.string().min(1),
  room_id: z.string().min(1),
  run_id: z.string().min(1),
  text: z.string().min(1),
});
