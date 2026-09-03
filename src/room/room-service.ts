import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { ProtocolError } from '../protocol/errors.ts';
import {
  type Approval,
  type CodingResult,
  type Event,
  type EventActor,
  type GitAction,
  type GitActionPreview,
  type GitActionResult,
  type NodeDispatch,
  type ParticipantProfile,
  type Plan,
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
  type TaskGraphNode,
  type TaskGraphRevision,
} from '../protocol/schema.ts';
import { RoomRepository, type RoomRecord } from './repository.ts';
import { resolveAttemptTransition, resolveRunTransition, resolveTransition } from './state-machine.ts';
import {
  assertNoUnorderedScopeOverlap,
  dependencyAncestors,
  orderedEligibleNodes,
  scopeContainsPath,
  scopesOverlap,
  validateTaskGraphRevision,
} from '../scheduler/plan-scheduler.ts';

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
    capabilities: ['execution', 'git_control'],
    config_ref: null,
    enabled: true,
  },
];

// bootstrap room-scope assignments：codex-app 是 single control orchestrator 兼
// planner/reviewer，Claude Code CLI 是 worker，local service 是 executor。operator 只保留
// human profile不持有active assignment；local-runner同时承担executor与Git Controller。
export const BOOTSTRAP_ASSIGNMENTS: readonly Omit<
  RoleAssignment,
  'assignment_id' | 'room_id' | 'created_at'
>[] = [
  { scope_type: 'room', scope_id: null, role: 'orchestrator', participant_id: 'codex-app' },
  { scope_type: 'room', scope_id: null, role: 'planner', participant_id: 'codex-app' },
  { scope_type: 'room', scope_id: null, role: 'reviewer', participant_id: 'codex-app' },
  { scope_type: 'room', scope_id: null, role: 'worker', participant_id: 'claude-code-cli' },
  { scope_type: 'room', scope_id: null, role: 'executor', participant_id: 'local-runner' },
  { scope_type: 'room', scope_id: null, role: 'git_controller', participant_id: 'local-runner' },
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

type WithoutPreviewSequence<T> = T extends unknown ? Omit<T, 'preview_event_sequence'> : never;
export type GitActionPreviewIntent = WithoutPreviewSequence<GitActionPreview>;

export interface PreviewGitActionInput {
  git_action_id: string;
  room_id: string;
  revision_id: string;
  node_id: string;
  preview: GitActionPreviewIntent;
}

export interface SettleGitActionInput {
  git_action_id: string;
  status: 'succeeded' | 'failed';
  result: GitActionResult;
}

export interface CancelRunInput {
  room_id: string;
  run_id: string;
  reason: string;
  confirmed_by_user: boolean;
}

export interface AddRunGuidanceInput {
  guidance_id: string;
  room_id: string;
  run_id: string;
  text: string;
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

  // ---- Stage 3 planning graph ----
  createPlan(plan: Plan, actor: EventActor): { plan: Plan; created: boolean } {
    return this.tx(() => {
      const existing = this.repo.getPlan(plan.plan_id);
      if (existing) {
        // existing same-ID retry 只按 stored frozen creator 认证（Review finding
        // inc12-r1）：不使用 current assignment，replacement planner 不能接管旧 Plan；
        // content 比较复用 repository idempotency owner，同 content → created=false 且
        // 零 Event，不同 content → id_conflict。
        this.assertFrozenPlannerRetryAuthority(`plan ${existing.plan_id}`, existing.created_by_participant_id, actor);
        this.repo.insertPlan(plan);
        return { plan: existing, created: false };
      }
      // new Plan 创建消费 current assignment 并固化 creator identity。
      this.requireRoom(plan.room_id);
      this.assertAuthority(plan.room_id, actor, 'planner');
      if (plan.created_by_participant_id !== actor.participant_id) {
        throw new ProtocolError('actor_not_allowed', 'plan creator must be the authenticated planner');
      }
      const inserted = this.repo.insertPlan(plan);
      if (inserted.created) {
        this.repo.appendEvent({
          room_id: plan.room_id,
          type: 'plan_created',
          actor,
          entity_type: 'plan',
          entity_id: plan.plan_id,
          summary: `plan ${plan.plan_id} created`,
          created_at: this.now(),
        });
      }
      return { plan: this.repo.getPlan(plan.plan_id) ?? plan, created: inserted.created };
    });
  }

  createPlanRevision(revision: TaskGraphRevision, actor: EventActor): { revision: TaskGraphRevision; created: boolean } {
    return this.tx(() => {
      const existing = this.repo.getTaskGraphRevision(revision.revision_id);
      if (existing) {
        // existing same-ID retry 只按 stored frozen creator 认证（Review finding
        // inc12-r1）：不使用 current assignment，replacement planner 不能重放 old
        // creator entity；content 比较复用 repository idempotency owner。
        this.assertFrozenPlannerRetryAuthority(`revision ${existing.revision_id}`, existing.created_by_participant_id, actor);
        this.repo.insertTaskGraphRevision(revision);
        return { revision: existing, created: false };
      }
      const plan = this.requirePlan(revision.plan_id);
      if (plan.room_id !== revision.room_id) {
        throw new ProtocolError('validation_failed', 'revision plan belongs to another room');
      }
      this.assertPlanAuthority(revision.room_id, revision.plan_id, actor, 'planner');
      if (revision.created_by_participant_id !== actor.participant_id) {
        throw new ProtocolError('actor_not_allowed', 'revision creator must be the authenticated planner');
      }
      const latest = this.repo.latestTaskGraphRevision(revision.plan_id);
      const expectedNo = (latest?.revision_no ?? 0) + 1;
      if (revision.revision_no !== expectedNo || revision.supersedes_revision_id !== (latest?.revision_id ?? null)) {
        throw new ProtocolError('validation_failed', 'revision number and supersedes reference must extend the latest revision');
      }
      validateTaskGraphRevision(revision);
      for (const node of revision.nodes) this.assertNodeWorkerAssignment(revision, node);
      this.assertAmendmentImmutable(revision);
      this.repo.insertTaskGraphRevision(revision);
      this.repo.appendEvent({
        room_id: revision.room_id,
        type: 'task_graph_revision_created',
        actor,
        entity_type: 'task_graph_revision',
        entity_id: revision.revision_id,
        summary: `task graph revision ${revision.revision_id} created`,
        created_at: this.now(),
      });
      return { revision, created: true };
    });
  }

  decidePlanRevision(approval: Approval, actor: EventActor): { room: RoomRecord; approval: Approval; created: boolean } {
    if (approval.target_type !== 'task_graph_revision') {
      throw new ProtocolError('validation_failed', 'plan revision decision requires target_type=task_graph_revision');
    }
    return this.tx(() => {
      const existing = this.repo.getApproval(approval.approval_id);
      if (existing) {
        // existing same-ID retry 只按 stored frozen planner 认证（Review finding
        // inc12-r1）：不使用 current assignment，replacement planner 不能重放 old
        // planner entity；content 比较复用 repository idempotency owner。
        this.assertFrozenPlannerRetryAuthority(`approval ${existing.approval_id}`, existing.planner_participant_id, actor);
        this.repo.insertApproval(approval);
        return { room: this.requireRoom(existing.room_id), approval: existing, created: false };
      }
      const revision = this.requireRevision(approval.target_id);
      if (revision.room_id !== approval.room_id) throw new ProtocolError('validation_failed', 'approval targets another room');
      this.assertPlanAuthority(revision.room_id, revision.plan_id, actor, 'planner');
      if (approval.planner_participant_id !== actor.participant_id) {
        throw new ProtocolError('actor_not_allowed', 'approval planner must be the authenticated planner');
      }
      const room = this.requireRoom(revision.room_id);
      if (room.state !== 'WAITING_FOR_USER_CONFIRMATION') {
        throw new ProtocolError('validation_failed', 'revision decision requires WAITING_FOR_USER_CONFIRMATION');
      }
      const latest = this.repo.latestTaskGraphRevision(revision.plan_id);
      if (latest?.revision_id !== revision.revision_id) {
        throw new ProtocolError('plan_revision_not_approved', 'only the latest revision may receive a decision');
      }
      validateTaskGraphRevision(revision);
      for (const node of revision.nodes) this.assertNodeWorkerAssignment(revision, node);
      this.assertAmendmentImmutable(revision);
      if (approval.decision === 'approved') assertNoUnorderedScopeOverlap(revision);
      this.repo.insertApproval(approval);
      this.repo.appendEvent({
        room_id: revision.room_id,
        type: approval.decision === 'approved' ? 'task_graph_revision_approved' : 'task_graph_revision_rejected',
        actor,
        entity_type: 'approval',
        entity_id: approval.approval_id,
        summary: `revision ${revision.revision_id} ${approval.decision}`,
        created_at: this.now(),
      });
      const updatedRoom = this.applyTransition(revision.room_id, 'DISCUSSION', actor);
      return { room: updatedRoom, approval, created: true };
    });
  }

  previewGitAction(input: PreviewGitActionInput, actor: EventActor): { action: GitAction; created: boolean } {
    return this.tx(() => {
      const existing = this.repo.getGitAction(input.git_action_id);
      if (existing) {
        this.assertFrozenGitController(existing, actor);
        const { preview_event_sequence: _sequence, ...storedPreview } = existing.preview;
        if (JSON.stringify({ room_id: existing.room_id, revision_id: existing.revision_id, node_id: existing.node_id, preview: storedPreview }) !==
            JSON.stringify({ room_id: input.room_id, revision_id: input.revision_id, node_id: input.node_id, preview: input.preview })) {
          throw new ProtocolError('id_conflict', `git action id ${input.git_action_id} already exists with different content`);
        }
        return { action: existing, created: false };
      }
      this.assertAuthority(input.room_id, actor, 'git_controller');
      const revision = this.requireRevision(input.revision_id);
      const current = this.repo.currentApprovedTaskGraphRevision(revision.plan_id);
      if (revision.room_id !== input.room_id || current?.revision_id !== revision.revision_id) {
        throw new ProtocolError('plan_revision_not_approved', 'git action requires the current approved revision');
      }
      const node = revision.nodes.find((candidate) => candidate.node_id === input.node_id);
      if (!node) throw new ProtocolError('validation_failed', `node ${input.node_id} is not in revision ${revision.revision_id}`);
      const dispatch = this.findLineageDispatch(revision, node.node_id);
      if (!dispatch || dispatch.scope_violated || dispatch.status === 'blocked') {
        throw new ProtocolError('validation_failed', `node ${node.node_id} has no eligible dispatch`);
      }
      this.validateGitPreviewForDispatch(revision, node, dispatch, input.preview);
      const createdAt = this.now();
      const event = this.repo.appendEvent({
        room_id: input.room_id,
        type: 'git_action_previewed',
        actor,
        entity_type: 'git_action',
        entity_id: input.git_action_id,
        summary: `git action ${input.git_action_id} previewed for ${input.preview.operation}`,
        created_at: createdAt,
      });
      const preview = { ...input.preview, preview_event_sequence: event.sequence } as GitActionPreview;
      const action = {
        git_action_id: input.git_action_id,
        room_id: input.room_id,
        revision_id: input.revision_id,
        node_id: input.node_id,
        operation: input.preview.operation,
        status: 'previewed',
        git_controller_participant_id: actor.participant_id,
        preview_event_sequence: event.sequence,
        approval_id: null,
        preview,
        result: null,
        created_at: createdAt,
        settled_at: null,
      } satisfies GitAction;
      this.repo.insertGitAction(action);
      return { action, created: true };
    });
  }

  authorizeGitActionPreview(roomId: string, gitActionId: string, actor: EventActor): GitAction | null {
    const existing = this.repo.getGitAction(gitActionId);
    if (existing) {
      this.assertFrozenGitController(existing, actor);
      return existing;
    }
    this.assertAuthority(roomId, actor, 'git_controller');
    return null;
  }

  authorizeGitAction(gitActionId: string, actor: EventActor): GitAction {
    const action = this.requireGitAction(gitActionId);
    this.assertFrozenGitController(action, actor);
    return action;
  }

  decideGitAction(approval: Approval, actor: EventActor): { approval: Approval; action: GitAction; created: boolean } {
    if (approval.target_type !== 'git_action_preview') {
      throw new ProtocolError('validation_failed', 'git action decision requires target_type=git_action_preview');
    }
    return this.tx(() => {
      const existing = this.repo.getApproval(approval.approval_id);
      if (existing) {
        this.assertFrozenPlannerRetryAuthority(`approval ${existing.approval_id}`, existing.planner_participant_id, actor);
        this.repo.insertApproval(approval);
        const existingAction = this.requireGitAction(existing.target_id);
        return { approval: existing, action: existingAction, created: false };
      }
      const action = this.requireGitAction(approval.target_id);
      if (action.room_id !== approval.room_id) throw new ProtocolError('validation_failed', 'approval targets another room');
      this.assertPlanAuthority(action.room_id, this.requireRevision(action.revision_id).plan_id, actor, 'planner');
      if (approval.planner_participant_id !== actor.participant_id) {
        throw new ProtocolError('actor_not_allowed', 'approval planner must be the authenticated planner');
      }
      if (action.status !== 'previewed' || action.approval_id !== null) {
        throw new ProtocolError('git_action_already_terminal', `git action ${action.git_action_id} already has a decision`);
      }
      if (this.currentCursor(action.room_id) !== action.preview_event_sequence) {
        throw new ProtocolError('git_preview_stale', `git action ${action.git_action_id} preview is stale`);
      }
      this.repo.insertApproval(approval);
      const event = this.repo.appendEvent({
        room_id: action.room_id,
        type: approval.decision === 'approved' ? 'git_action_approved' : 'git_action_rejected',
        actor,
        entity_type: 'approval',
        entity_id: approval.approval_id,
        summary: `git action ${action.git_action_id} ${approval.decision}`,
        created_at: this.now(),
      });
      const updated = {
        ...action,
        status: approval.decision === 'approved' ? 'approved' : 'previewed',
        approval_id: approval.approval_id,
      } satisfies GitAction;
      this.repo.updateGitAction(updated);
      // event is deliberately the last write: execute reserves only when this exact decision
      // remains the current Room fact.
      void event;
      return { approval, action: updated, created: true };
    });
  }

  reserveGitAction(gitActionId: string, observedPreview: GitActionPreviewIntent, actor: EventActor): GitAction {
    return this.tx(() => {
      const action = this.requireGitAction(gitActionId);
      this.assertFrozenGitController(action, actor);
      if (action.status === 'executing' || this.isTerminalGitAction(action)) {
        throw new ProtocolError('git_action_already_terminal', `git action ${gitActionId} cannot be executed again`);
      }
      const approval = action.approval_id ? this.repo.getApproval(action.approval_id) : null;
      if (!approval || approval.decision !== 'approved' || action.status !== 'approved') {
        throw new ProtocolError('git_action_not_approved', `git action ${gitActionId} is not approved`);
      }
      const approvalEvent = this.repo.listEvents(action.room_id).find((event) => event.entity_id === approval.approval_id && event.type === 'git_action_approved');
      if (!approvalEvent || this.currentCursor(action.room_id) !== approvalEvent.sequence) {
        throw new ProtocolError('git_preview_stale', `git action ${gitActionId} approval is stale`);
      }
      const { preview_event_sequence: _sequence, ...expected } = action.preview;
      if (JSON.stringify(expected) !== JSON.stringify(observedPreview)) {
        throw new ProtocolError('git_preview_stale', `git action ${gitActionId} Git facts changed`);
      }
      const executing = { ...action, status: 'executing' } satisfies GitAction;
      this.repo.updateGitAction(executing);
      this.repo.appendEvent({ room_id: action.room_id, type: 'git_action_executing', actor, entity_type: 'git_action', entity_id: gitActionId, summary: `git action ${gitActionId} executing`, created_at: this.now() });
      return executing;
    });
  }

  settleGitAction(input: SettleGitActionInput, actor: EventActor): GitAction {
    return this.tx(() => {
      const action = this.requireGitAction(input.git_action_id);
      this.assertFrozenGitController(action, actor);
      if (this.isTerminalGitAction(action)) {
        if (action.status === input.status && JSON.stringify(action.result) === JSON.stringify(input.result)) return action;
        throw new ProtocolError('git_action_already_terminal', `git action ${action.git_action_id} is already terminal`);
      }
      if (action.status !== 'executing') throw new ProtocolError('git_action_not_approved', `git action ${action.git_action_id} is not executing`);
      const settledAt = this.now();
      const settled = { ...action, status: input.status, result: input.result, settled_at: settledAt } satisfies GitAction;
      this.repo.updateGitAction(settled);
      if (input.status === 'succeeded') this.applySuccessfulGitAction(settled, settledAt);
      this.repo.appendEvent({ room_id: action.room_id, type: input.status === 'succeeded' ? 'git_action_succeeded' : 'git_action_failed', actor, entity_type: 'git_action', entity_id: action.git_action_id, summary: `git action ${action.git_action_id} ${input.status}`, created_at: settledAt });
      return settled;
    });
  }

  reconcileGitAction(gitActionId: string, result: GitActionResult, actor: EventActor): GitAction {
    return this.tx(() => {
      const action = this.requireGitAction(gitActionId);
      this.assertFrozenGitController(action, actor);
      if (this.isTerminalGitAction(action)) return action;
      if (action.status !== 'executing') throw new ProtocolError('validation_failed', `git action ${gitActionId} is not executing`);
      const settledAt = this.now();
      const updated = { ...action, status: 'outcome_unknown', result, settled_at: settledAt } satisfies GitAction;
      this.repo.updateGitAction(updated);
      this.repo.appendEvent({ room_id: action.room_id, type: 'git_action_outcome_unknown', actor, entity_type: 'git_action', entity_id: gitActionId, summary: `git action ${gitActionId} outcome unknown`, created_at: settledAt });
      return updated;
    });
  }

  reconcilePlan(
    input: { room_id: string; plan_id: string; worktrees: Array<{ node_id: string; dispatch_id: string; canonical_worktree_path: string | null }> },
    actor: EventActor,
  ): { revision: TaskGraphRevision | null; dispatches: NodeDispatch[] } {
    return this.tx(() => {
      const plan = this.requirePlan(input.plan_id);
      if (plan.room_id !== input.room_id) throw new ProtocolError('validation_failed', 'plan belongs to another room');
      this.assertPlanAuthority(input.room_id, input.plan_id, actor, 'orchestrator');
      // current approved revision（Review finding inc12-r1）：exact latest revision 的
      // terminal decision 必须为 approved；Draft/rejected 时不回退旧 approved，直接返回
      // 零 new materialization。
      const revision = this.repo.currentApprovedTaskGraphRevision(input.plan_id);
      if (!revision) return { revision: null, dispatches: [] };
      validateTaskGraphRevision(revision);
      assertNoUnorderedScopeOverlap(revision);
      this.assertAmendmentImmutable(revision);
      if (revision.acceptance_policy === 'integration_only') {
        this.projectIntegrationPolicyAcceptance(revision, actor);
      }
      const existingDispatches = revision.nodes
        .map((node) => this.findLineageDispatch(revision, node.node_id))
        .filter((dispatch): dispatch is NodeDispatch => dispatch !== null);
      const requestedNodeIds = new Set<string>();
      const requestedDispatchIds = new Set<string>();
      for (const mapping of input.worktrees) {
        if (!revision.nodes.some((node) => node.node_id === mapping.node_id)) {
          throw new ProtocolError('validation_failed', `node ${mapping.node_id} is not in revision ${revision.revision_id}`);
        }
        if (requestedNodeIds.has(mapping.node_id) || requestedDispatchIds.has(mapping.dispatch_id)) {
          throw new ProtocolError('validation_failed', 'reconcile worktree mappings must use unique node and dispatch identifiers');
        }
        requestedNodeIds.add(mapping.node_id);
        requestedDispatchIds.add(mapping.dispatch_id);
      }
      // dependency readiness 的统一权威语义（Review finding inc12-r1）：dependency 必须
      // Run=accepted、对应 NodeDispatch=completed 且 scope_violated=false，三者缺一不可；
      // blocked dispatch 不得经 acceptance 解锁 descendant。
      const satisfiedRunIds = new Set(
        this.repo
          .listRuns(input.room_id)
          .filter((run) => {
            if (run.status !== 'accepted') return false;
            const dispatch = this.repo.nodeDispatchForRun(run.run_id);
            return dispatch !== null && dispatch.status === 'completed' && !dispatch.scope_violated;
          })
          .map((run) => run.run_id),
      );
      const eligible = orderedEligibleNodes(revision, satisfiedRunIds, new Set(existingDispatches.map((d) => d.node_id)));
      const requested = new Map(input.worktrees.map((item) => [item.node_id, item]));
      const result = [...existingDispatches];
      for (const dispatch of existingDispatches) {
        const mapping = requested.get(dispatch.node_id);
        if (mapping && (mapping.dispatch_id !== dispatch.dispatch_id || mapping.canonical_worktree_path !== dispatch.canonical_worktree_path)) {
          throw new ProtocolError('id_conflict', `node ${dispatch.node_id} was materialized with different dispatch content`);
        }
      }
      for (const node of eligible) {
        const mapping = requested.get(node.node_id);
        if (!mapping) continue;
        result.push(this.materializeApprovedGraphNode(revision, node.node_id, mapping.dispatch_id, mapping.canonical_worktree_path));
      }
      return { revision, dispatches: result };
    });
  }

  private materializeApprovedGraphNode(revision: TaskGraphRevision, nodeId: string, dispatchId: string, worktreePath: string | null): NodeDispatch {
    const node = revision.nodes.find((candidate) => candidate.node_id === nodeId);
    if (!node) throw new ProtocolError('validation_failed', `node ${nodeId} is not in revision ${revision.revision_id}`);
    const existing = this.repo.nodeDispatchForNode(revision.revision_id, nodeId);
    if (existing) {
      if (existing.dispatch_id !== dispatchId || existing.canonical_worktree_path !== worktreePath) {
        throw new ProtocolError('id_conflict', `node ${nodeId} was materialized with different dispatch content`);
      }
      return existing;
    }
    const approval = this.repo.approvalForTarget('task_graph_revision', revision.revision_id);
    if (!approval || approval.decision !== 'approved') throw new ProtocolError('plan_revision_not_approved', 'revision is not approved');
    const assignment = this.assertGraphWorkerAssignment(revision, node.worker_assignment_id);
    const orchestrator = this.requireResolvedAssignment(revision.room_id, 'plan', revision.plan_id, 'orchestrator');
    const task = {
      ...node.task_spec,
      confirmed_by_user: true,
      planner_participant_id: approval.planner_participant_id,
      orchestrator_participant_id: orchestrator.participant_id,
    } satisfies PersistedTask;
    this.repo.insertTask(task);
    const createdAt = this.now();
    const run: Run = {
      run_id: task.run_id,
      room_id: task.room_id,
      root_task_id: task.task_id,
      status: 'ready',
      worker_participant_id: assignment.participant_id,
      worktree_path: worktreePath,
      created_at: createdAt,
      updated_at: createdAt,
      accepted_at: null,
    };
    this.repo.insertRun(run);
    const dispatch = {
      dispatch_id: dispatchId,
      revision_id: revision.revision_id,
      node_id: node.node_id,
      task_id: task.task_id,
      run_id: task.run_id,
      canonical_worktree_path: worktreePath,
      status: worktreePath === null ? 'awaiting_git' : 'dispatched',
      created_at: createdAt,
      updated_at: createdAt,
      dispatched_at: worktreePath === null ? null : createdAt,
      completed_at: null,
      scope_violated: false,
    } satisfies NodeDispatch;
    this.repo.insertNodeDispatch(dispatch);
    this.repo.appendEvent({ room_id: revision.room_id, type: 'graph_node_materialized', actor: { participant_id: LOCAL_SERVICE_PARTICIPANT_ID, actor_role: 'orchestrator' }, entity_type: 'node_dispatch', entity_id: dispatch.dispatch_id, summary: `node ${node.node_id} materialized`, created_at: createdAt });
    this.repo.appendEvent({ room_id: revision.room_id, type: 'run_created', actor: { participant_id: LOCAL_SERVICE_PARTICIPANT_ID, actor_role: 'orchestrator' }, entity_type: 'run', entity_id: run.run_id, summary: `run ${run.run_id} created for graph node ${node.node_id}`, created_at: createdAt });
    this.repo.appendEvent({ room_id: revision.room_id, type: 'task_submitted', actor: { participant_id: approval.planner_participant_id, actor_role: 'planner' }, entity_type: 'task', entity_id: task.task_id, summary: `task ${task.task_id} materialized from approved revision`, created_at: createdAt });
    return dispatch;
  }

  // ---- Task submission (planner) ----
  // v0.4：implementation 要求 Room=WAITING_FOR_USER_CONFIRMATION，在同一 transaction 原子创建
  // ready Run（冻结 worker）并把 Room 返回 DISCUSSION；fix 附着到既有 review_discussion Run，
  // 校验 current Review 后把 Run 转回 ready，Room 状态不变。两种类型的 Run/Review/failure
  // authority 都是 per-Run，不再写入 Room.state。
  submitTask(
    contract: TaskContract,
    actor: EventActor,
  ): { room: RoomRecord; task: PersistedTask; run: Run; created: boolean } {
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
    claim: ClaimAttemptInput,
    actor: EventActor,
  ): { room: RoomRecord; run: Run; attempt: RunAttempt; guidance: RunGuidance[]; created: boolean } {
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
      const task = this.repo.latestTaskForRun(claim.run_id)!;
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
      this.assertGraphClaim(run, worktreePath);
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
  // BEGIN IMMEDIATE 在读取前串行化 writer。第一个事务写 terminal status + evidence +
  // 恰好一个 terminal Event；等待者取得写锁后读取已提交终态，再按 canonical payload
  // 判定幂等（零 Event）或 id_conflict（完整 snapshot 不变）。
  // planner 已先行写入 cancel_requested 时，唯一合法 terminal 是 canceled（planner 意图优先）。
  // Review finding inc10-r2：terminal status 与持久化 result/failure 必须 canonical 一致，
  // 矛盾 evidence 以 validation_failed 拒绝且完整 durable snapshot 不变；canceled 的
  // canonical payload 为 result=null + failure=null。
  settleRunAttempt(settle: SettleAttemptInput, actor: EventActor): { room: RoomRecord; run: Run; attempt: RunAttempt } {
    return this.tx(() => {
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
      this.repo.updateAttempt(updated);
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
      if (target === 'succeeded') this.applyScopeProjection(updated, actor);
      return { room: this.requireRoom(attempt.room_id), run: updatedRun, attempt: updated };
    });
  }

  // Executor 实时把非终态 progress evidence 追加为 run_attempt progress Event。progress 不是
  // 状态权威来源：不改变 Room/Run/Attempt state。只接受 frozen executor 与仍 running 的
  // attempt；已知 lifecycle 竞争返回 false，其它错误继续传播。
  appendAttemptProgress(
    input: { attempt_id: string; type: string | null; subtype: string | null; outcome: string | null },
    actor: EventActor,
  ): boolean {
    return this.tx(() => {
      const attempt = this.requireAttempt(input.attempt_id);
      this.assertAttemptCommandAuthority(attempt, actor, 'executor');
      if (attempt.status !== 'running') return false;
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
      return true;
    });
  }

  // ---- Question (worker / planner) ----
  // v0.4：Question 由 frozen worker 对 active attempt 提出，原子创建 Question 并把 attempt
  // 置 decision_requested；Run 保持 running 直到 Executor 停止 process 并 settle
  // needs_decision。answer 要求 attempt 已 terminal-finalized。
  askQuestion(question: Question, actor: EventActor): { room: RoomRecord; question: Question; attempt: RunAttempt; created: boolean } {
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
  submitReview(review: Review, actor: EventActor): { room: RoomRecord; review: Review; run: Run; created: boolean } {
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
      // scope violation 是 NodeDispatch 的 current safety projection（Review finding
      // inc12-r1）：blocked/scope_violated dispatch 不得经 acceptance 置 completed 或
      // 解锁 descendant；必须先由同一 Run 后续成功且全部 in-scope 的 Fix attempt 恢复。
      // 该 gate 在写 Run/Dispatch/Event 之前，失败整体回滚。
      const dispatch = this.repo.nodeDispatchForRun(run.run_id);
      if (dispatch && (dispatch.scope_violated || dispatch.status === 'blocked')) {
        throw new ProtocolError(
          'validation_failed',
          `review ${reviewId} run ${run.run_id} is blocked by a scope violation; a successful in-scope fix attempt must clear it before acceptance`,
        );
      }
      let graphNode: TaskGraphNode | null = null;
      let graphRevision: TaskGraphRevision | null = null;
      if (dispatch) {
        graphRevision = this.requireRevision(dispatch.revision_id);
        graphNode = graphRevision.nodes.find((node) => node.node_id === dispatch.node_id) ?? null;
        if (graphRevision.acceptance_policy === 'integration_only' && graphNode?.kind !== 'integration') {
          throw new ProtocolError('validation_failed', `component run ${run.run_id} is accepted only by integration_only reconciliation`);
        }
      }
      const updated: Run = { ...run, status: 'accepted', accepted_at: this.now(), updated_at: this.now() };
      resolveRunTransition(run.status, updated.status, actor.actor_role);
      // accepted 后 partial unique index 不再占用 worktree（status != 'accepted' 的 WHERE
      // 集合），canonical worktree lease 释放；lineage 字段保留为历史事实。
      this.repo.updateRun(updated);
      if (dispatch) {
        const completedAt = this.now();
        const attempt = this.repo.latestAttemptForRun(run.run_id);
        const hasChanges = Boolean(attempt && (
          attempt.git_evidence.staged.length > 0 || attempt.git_evidence.unstaged.length > 0 || attempt.git_evidence.untracked.length > 0
        ));
        const awaitsCommit = graphRevision?.acceptance_policy === 'integration_only' && graphNode?.kind === 'integration' && hasChanges;
        this.repo.updateNodeDispatch({
          ...dispatch,
          status: awaitsCommit ? 'awaiting_git' : 'completed',
          completed_at: awaitsCommit ? null : completedAt,
          updated_at: completedAt,
        });
      }
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

  auditAttemptWriteScope(attemptId: string, actor: EventActor): { violated: boolean; dispatch: NodeDispatch | null } {
    return this.tx(() => {
      const attempt = this.requireAttempt(attemptId);
      this.assertAttemptCommandAuthority(attempt, actor, 'executor');
      return this.markScopeViolation(attempt, actor);
    });
  }

  private markScopeViolation(attempt: RunAttempt, actor: EventActor): { violated: boolean; dispatch: NodeDispatch | null } {
    const dispatch = this.repo.nodeDispatchForRun(attempt.run_id);
    if (!dispatch) return { violated: false, dispatch: null };
    const revision = this.requireRevision(dispatch.revision_id);
    const node = revision.nodes.find((candidate) => candidate.node_id === dispatch.node_id);
    if (!node) throw new ProtocolError('validation_failed', `dispatch node ${dispatch.node_id} missing from revision`);
    const paths = [...attempt.git_evidence.staged, ...attempt.git_evidence.unstaged, ...attempt.git_evidence.untracked];
    const violated = paths.some((path) => !node.write_scopes.some((scope) => scopeContainsPath(scope, path)));
    if (!violated || dispatch.scope_violated) return { violated, dispatch };
    const updated = { ...dispatch, status: 'blocked' as const, scope_violated: true, updated_at: this.now() };
    this.repo.updateNodeDispatch(updated);
    this.repo.appendEvent({ room_id: attempt.room_id, type: 'node_scope_violated', actor, entity_type: 'node_dispatch', entity_id: dispatch.dispatch_id, summary: `node ${dispatch.node_id} produced paths outside declared write scopes`, created_at: this.now() });
    return { violated: true, dispatch: updated };
  }

  // settle 时的 scope projection（Review finding inc12-r1）：succeeded attempt 的完整 live
  // evidence 决定 NodeDispatch projection。任意 out-of-scope path → 沿用 markScopeViolation
  // 置 blocked/scope_violated（已 blocked 时零写入，历史 node_scope_violated Event 保留）；
  // 全部 in-scope 且该 attempt 是同一 Run 的 Fix attempt → 清除 blocked projection 恢复
  // dispatched，不新增 Event type（attempt terminal Event 已是审计事实）。failed/
  // interrupted/needs_decision/canceled 与非 Fix attempt 不改变 projection。
  private applyScopeProjection(attempt: RunAttempt, actor: EventActor): void {
    const dispatch = this.repo.nodeDispatchForRun(attempt.run_id);
    if (!dispatch) return;
    const revision = this.requireRevision(dispatch.revision_id);
    const node = revision.nodes.find((candidate) => candidate.node_id === dispatch.node_id);
    if (!node) throw new ProtocolError('validation_failed', `dispatch node ${dispatch.node_id} missing from revision`);
    const paths = [...attempt.git_evidence.staged, ...attempt.git_evidence.unstaged, ...attempt.git_evidence.untracked];
    const violated = paths.some((path) => !node.write_scopes.some((scope) => scopeContainsPath(scope, path)));
    if (violated) {
      this.markScopeViolation(attempt, actor);
      return;
    }
    const task = this.repo.getTask(attempt.task_id);
    if (task?.type === 'fix' && (dispatch.scope_violated || dispatch.status === 'blocked')) {
      const restored: NodeDispatch = { ...dispatch, status: 'dispatched', scope_violated: false, updated_at: this.now() };
      this.repo.updateNodeDispatch(restored);
    }
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
    cancel: CancelRunInput,
    actor: EventActor,
  ): { room: RoomRecord; run: Run; attempt: RunAttempt; created: boolean } {
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
    guidanceInput: AddRunGuidanceInput,
    actor: EventActor,
  ): { room: RoomRecord; guidance: RunGuidance; created: boolean } {
    // 输入只含 caller-owned 字段：planner_participant_id/created_at/consumed_by_attempt_id
    // 由 service 固化，caller 不可指定（与其它 entity 的 caller-provided timestamp 不同，
    // guidance 是 planner 在 claim 间隙的指令，不需要 caller 提供时间）。
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
    profile: ParticipantProfile,
    actor: EventActor,
  ): { profile: ParticipantProfile; created: boolean } {
    return this.tx(() => {
      this.assertAnyRoomOrchestrator(actor);
      const inserted = this.repo.insertParticipant(profile);
      if (!inserted.created) {
        return { profile: this.repo.getParticipant(profile.participant_id)!, created: false };
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
    assignment: RoleAssignment,
    actor: EventActor,
  ): { assignment: RoleAssignment; created: boolean } {
    return this.tx(() => {
      this.requireRoom(assignment.room_id);
      this.assertAuthority(assignment.room_id, actor, 'orchestrator');
      this.validateAssignmentTarget(assignment);
      const inserted = this.repo.insertRoleAssignment(assignment);
      if (!inserted.created) {
        return { assignment: this.repo.getRoleAssignment(assignment.assignment_id)!, created: false };
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
      if (scopeType === 'task') {
        const task = this.repo.getTask(scopeId);
        const dispatch = task ? this.repo.nodeDispatchForRun(task.run_id) : null;
        const revision = dispatch ? this.repo.getTaskGraphRevision(dispatch.revision_id) : null;
        if (revision) {
          const planAssignment = this.repo.latestAssignment(roomId, 'plan', revision.plan_id, role);
          if (planAssignment) return planAssignment;
        }
      }
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

  getPlan(planId: string): Plan | null { return this.repo.getPlan(planId); }
  getTaskGraphRevision(revisionId: string): TaskGraphRevision | null { return this.repo.getTaskGraphRevision(revisionId); }
  getApproval(approvalId: string): Approval | null { return this.repo.getApproval(approvalId); }
  getNodeDispatch(dispatchId: string): NodeDispatch | null { return this.repo.getNodeDispatch(dispatchId); }
  nodeDispatchForRun(runId: string): NodeDispatch | null { return this.repo.nodeDispatchForRun(runId); }
  listPlans(roomId: string): Plan[] { return this.repo.listPlans(roomId); }
  listTaskGraphRevisions(roomId: string): TaskGraphRevision[] { return this.repo.listTaskGraphRevisions(roomId); }
  currentApprovedTaskGraphRevision(planId: string): TaskGraphRevision | null { return this.repo.currentApprovedTaskGraphRevision(planId); }
  listApprovals(roomId: string): Approval[] { return this.repo.listApprovals(roomId); }
  listNodeDispatches(roomId: string): NodeDispatch[] { return this.repo.listNodeDispatches(roomId); }
  getGitAction(gitActionId: string): GitAction | null { return this.repo.getGitAction(gitActionId); }
  listGitActions(roomId: string): GitAction[] { return this.repo.listGitActions(roomId); }

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

  private currentCursor(roomId: string): number {
    const events = this.repo.listEvents(roomId);
    return events.at(-1)?.sequence ?? 0;
  }

  private projectIntegrationPolicyAcceptance(revision: TaskGraphRevision, actor: EventActor): void {
    for (const node of revision.nodes) {
      if (node.kind === 'integration') continue;
      const dispatch = this.findLineageDispatch(revision, node.node_id);
      if (!dispatch || dispatch.scope_violated || dispatch.status === 'blocked') continue;
      const run = this.repo.getRun(dispatch.run_id);
      const review = run ? this.repo.latestReviewForRun(run.run_id) : null;
      if (!run || run.status !== 'review_discussion' || review?.decision !== 'approved') continue;
      const acceptedAt = this.now();
      this.repo.updateRun({ ...run, status: 'accepted', accepted_at: acceptedAt, updated_at: acceptedAt });
      this.repo.updateNodeDispatch({ ...dispatch, status: 'awaiting_git', completed_at: null, updated_at: acceptedAt });
      this.repo.appendEvent({
        room_id: revision.room_id,
        type: 'run_policy_accepted',
        actor,
        entity_type: 'run',
        entity_id: run.run_id,
        summary: `run ${run.run_id} accepted by integration_only policy and awaits commit`,
        created_at: acceptedAt,
      });
    }
  }

  private requireGitAction(gitActionId: string): GitAction {
    const action = this.repo.getGitAction(gitActionId);
    if (!action) throw new ProtocolError('entity_not_found', `git action ${gitActionId} not found`);
    return action;
  }

  private assertFrozenGitController(action: GitAction, actor: EventActor): void {
    this.assertParticipantActive(actor);
    if (actor.actor_role !== 'git_controller' || actor.participant_id !== action.git_controller_participant_id) {
      throw new ProtocolError('actor_not_allowed', `participant ${actor.participant_id} does not own git action ${action.git_action_id}`);
    }
    const assignment = this.resolveAssignment(action.room_id, 'room', null, 'git_controller');
    if (!assignment || assignment.participant_id !== actor.participant_id) {
      throw new ProtocolError('actor_not_allowed', `git controller ${actor.participant_id} is no longer active`);
    }
    this.assertAssignable(assignment);
  }

  private isTerminalGitAction(action: GitAction): boolean {
    return action.status === 'succeeded' || action.status === 'failed' || action.status === 'outcome_unknown';
  }

  private validateGitPreviewForDispatch(
    revision: TaskGraphRevision,
    node: TaskGraphNode,
    dispatch: NodeDispatch,
    preview: GitActionPreviewIntent,
  ): void {
    if (preview.operation === 'create_worktree') {
      if (dispatch.status !== 'awaiting_git' || dispatch.canonical_worktree_path !== null) {
        throw new ProtocolError('validation_failed', `dispatch ${dispatch.dispatch_id} does not await worktree creation`);
      }
      const componentAncestors = [...dependencyAncestors(revision.nodes, node.node_id)]
        .filter((ancestorId) => revision.nodes.find((candidate) => candidate.node_id === ancestorId)?.kind !== 'integration');
      if (revision.acceptance_policy === 'integration_only' && componentAncestors.length > 0) {
        const maximalPredecessors = componentAncestors.filter((candidateId) => componentAncestors.every((otherId) =>
          candidateId === otherId || !dependencyAncestors(revision.nodes, otherId).has(candidateId)));
        if (maximalPredecessors.length !== 1) {
          throw new ProtocolError('validation_failed', `node ${node.node_id} must have one maximal component predecessor`);
        }
        const predecessor = revision.nodes.find((candidate) => candidate.node_id === maximalPredecessors[0]);
        if (!predecessor) {
          throw new ProtocolError('validation_failed', `node ${node.node_id} has no valid component predecessor`);
        }
        const commit = this.repo.latestGitActionForNode(revision.revision_id, predecessor.node_id, 'commit_paths');
        if (!commit || commit.status !== 'succeeded' || commit.preview.operation !== 'commit_paths' || preview.source_ref !== commit.preview.branch) {
          throw new ProtocolError('validation_failed', `worktree source_ref must be the predecessor committed branch for node ${node.node_id}`);
        }
      }
      return;
    }

    if (preview.operation === 'commit_paths') {
      if (dispatch.canonical_worktree_path !== preview.worktree_path || dispatch.status !== 'awaiting_git') {
        throw new ProtocolError('validation_failed', `dispatch ${dispatch.dispatch_id} does not await commit`);
      }
      const run = this.requireRun(dispatch.run_id);
      if (run.status !== 'accepted') throw new ProtocolError('validation_failed', `run ${run.run_id} is not accepted`);
      const create = this.repo.latestGitActionForNode(revision.revision_id, node.node_id, 'create_worktree');
      if (create?.status === 'succeeded' && create.preview.operation === 'create_worktree' && preview.branch !== create.preview.new_branch) {
        throw new ProtocolError('validation_failed', `commit branch must match the managed worktree branch for node ${node.node_id}`);
      }
      if (!/^(feat|fix|refactor|perf|test|docs|build|ci|chore)(\([a-z0-9][a-z0-9-]*\))?!?: .+$/u.test(preview.commit_message)) {
        throw new ProtocolError('validation_failed', 'commit message must follow Conventional Commits');
      }
      const unique = [...new Set(preview.paths)].sort();
      if (unique.length !== preview.paths.length || JSON.stringify(unique) !== JSON.stringify(preview.paths)) {
        throw new ProtocolError('validation_failed', 'commit paths must be unique and sorted');
      }
      const live = [...new Set([
        ...preview.git_evidence.staged,
        ...preview.git_evidence.unstaged,
        ...preview.git_evidence.untracked,
      ])].sort();
      if (JSON.stringify(live) !== JSON.stringify(preview.paths)) {
        throw new ProtocolError('validation_failed', 'commit paths must equal live Git evidence');
      }
      if (preview.paths.some((path) => !node.write_scopes.some((scope) => scopeContainsPath(scope, path)))) {
        throw new ProtocolError('scope_conflict', `commit paths exceed node ${node.node_id} write scopes`);
      }
      return;
    }

    if (node.kind !== 'integration') throw new ProtocolError('validation_failed', 'fast-forward requires the integration node');
    const run = this.requireRun(dispatch.run_id);
    if (run.status !== 'accepted' || dispatch.status !== 'completed') {
      throw new ProtocolError('validation_failed', 'fast-forward requires accepted integration run and satisfied commit gate');
    }
    if (preview.source_branch === preview.target_branch) {
      throw new ProtocolError('validation_failed', 'source and target branch must differ');
    }
    const create = this.repo.latestGitActionForNode(revision.revision_id, node.node_id, 'create_worktree');
    if (!create || create.status !== 'succeeded' || create.preview.operation !== 'create_worktree' || preview.source_branch !== create.preview.new_branch) {
      throw new ProtocolError('validation_failed', 'fast-forward source must be the terminal integration branch');
    }
  }

  private applySuccessfulGitAction(action: GitAction, settledAt: string): void {
    const dispatch = this.findLineageDispatch(this.requireRevision(action.revision_id), action.node_id);
    const ownedDispatch = dispatch!;
    if (action.preview.operation === 'create_worktree') {
      const path = action.preview.worktree_path;
      const run = this.requireRun(ownedDispatch.run_id);
      this.repo.updateRun({ ...run, worktree_path: path, updated_at: settledAt });
      this.repo.updateNodeDispatch({
        ...ownedDispatch,
        canonical_worktree_path: path,
        status: 'ready',
        updated_at: settledAt,
      });
    } else if (action.preview.operation === 'commit_paths') {
      this.repo.updateNodeDispatch({ ...ownedDispatch, status: 'completed', completed_at: settledAt, updated_at: settledAt });
    }
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

  private assertPlanAuthority(roomId: string, planId: string, actor: EventActor, requiredRole: 'planner' | 'orchestrator'): void {
    this.assertParticipantActive(actor);
    if (actor.actor_role !== requiredRole) {
      throw new ProtocolError('actor_not_allowed', `participant ${actor.participant_id} cannot act as ${requiredRole}`);
    }
    const assignment = this.resolveAssignment(roomId, 'plan', planId, requiredRole);
    if (!assignment || assignment.participant_id !== actor.participant_id) {
      throw new ProtocolError('actor_not_allowed', `participant ${actor.participant_id} has no active ${requiredRole} assignment for plan ${planId}`);
    }
    this.assertAssignable(assignment);
  }

  private assertGraphWorkerAssignment(revision: TaskGraphRevision, assignmentId: string): RoleAssignment {
    const assignment = this.repo.getRoleAssignment(assignmentId);
    if (!assignment || assignment.room_id !== revision.room_id || assignment.role !== 'worker') {
      throw new ProtocolError('validation_failed', `worker assignment ${assignmentId} is not compatible with revision room`);
    }
    const active = this.resolveAssignment(revision.room_id, 'plan', revision.plan_id, 'worker');
    if (!active || active.assignment_id !== assignment.assignment_id) {
      throw new ProtocolError('validation_failed', `worker assignment ${assignmentId} is not active for plan ${revision.plan_id}`);
    }
    this.assertAssignable(assignment);
    return assignment;
  }

  // existing entity same-ID retry 的 frozen planner 认证（Review finding inc12-r1）：
  // Plan/Revision/Approval 的 existing 分支只按 stored creator/planner participant 与
  // required role 认证，不消费 current assignment；replacement/unknown/disabled/
  // wrong-role 一律 actor_not_allowed 且在 transaction 内零写入。
  private assertFrozenPlannerRetryAuthority(entityLabel: string, frozenParticipantId: string, actor: EventActor): void {
    this.assertParticipantActive(actor);
    if (actor.actor_role !== 'planner') {
      throw new ProtocolError('actor_not_allowed', `participant ${actor.participant_id} cannot act as planner`);
    }
    if (actor.participant_id !== frozenParticipantId) {
      throw new ProtocolError('actor_not_allowed', `only stored planner ${frozenParticipantId} may retry ${entityLabel}`);
    }
  }

  // node worker assignment 校验（Review finding inc12-r1）：已 dispatch 的 inherited node
  // 只验证 frozen identity 一致性——assignment 存在、同 Room、role=worker 且 lineage Run
  // 的 frozen worker 与其一致，不要求 assignment 仍 active（replacement 只路由 future
  // materialization）；new/undispatched node 继续要求 exact current active assignment。
  private assertNodeWorkerAssignment(revision: TaskGraphRevision, node: TaskGraphNode): void {
    const lineage = this.findLineageDispatch(revision, node.node_id);
    if (!lineage) {
      this.assertGraphWorkerAssignment(revision, node.worker_assignment_id);
      return;
    }
    const assignment = this.repo.getRoleAssignment(node.worker_assignment_id);
    if (!assignment || assignment.room_id !== revision.room_id || assignment.role !== 'worker') {
      throw new ProtocolError('validation_failed', `worker assignment ${node.worker_assignment_id} is not compatible with revision room`);
    }
    const run = this.repo.getRun(lineage.run_id);
    if (!run || run.worker_participant_id !== assignment.participant_id) {
      throw new ProtocolError('immutable_revision_violation', `dispatched node ${node.node_id} worker must stay frozen`);
    }
  }

  private assertAmendmentImmutable(revision: TaskGraphRevision): void {
    if (revision.supersedes_revision_id === null) return;
    const prior = this.requireRevision(revision.supersedes_revision_id);
    const earlierRevisions = new Map(
      this.repo.listTaskGraphRevisions(revision.room_id)
        .filter((candidate) => candidate.plan_id === revision.plan_id && candidate.revision_no < revision.revision_no)
        .map((candidate) => [candidate.revision_id, candidate]),
    );
    const priorDispatches = this.repo.listNodeDispatches(revision.room_id)
      .filter((dispatch) => earlierRevisions.has(dispatch.revision_id));
    if (priorDispatches.length > 0) {
      if (revision.acceptance_policy !== prior.acceptance_policy) {
        throw new ProtocolError('immutable_revision_violation', 'acceptance policy cannot change after dispatch');
      }
      const oldIntegration = prior.nodes.filter((node) => node.kind === 'integration');
      const newIntegration = revision.nodes.filter((node) => node.kind === 'integration');
      if (JSON.stringify(oldIntegration) !== JSON.stringify(newIntegration)) {
        throw new ProtocolError('immutable_revision_violation', 'integration node cannot change after dispatch');
      }
    }
    for (const dispatch of priorDispatches) {
      const dispatchedRevision = earlierRevisions.get(dispatch.revision_id);
      const oldNode = dispatchedRevision?.nodes.find((node) => node.node_id === dispatch.node_id);
      const newNode = revision.nodes.find((node) => node.node_id === dispatch.node_id);
      if (!oldNode || !newNode || JSON.stringify(oldNode) !== JSON.stringify(newNode)) {
        throw new ProtocolError('immutable_revision_violation', `dispatched node ${dispatch.node_id} cannot be changed or removed`);
      }
      const oldAncestors = [...dependencyAncestors(dispatchedRevision!.nodes, dispatch.node_id)].sort();
      const newAncestors = [...dependencyAncestors(revision.nodes, dispatch.node_id)].sort();
      if (JSON.stringify(oldAncestors) !== JSON.stringify(newAncestors)) {
        throw new ProtocolError('immutable_revision_violation', `dispatched node ${dispatch.node_id} ancestor relation cannot change`);
      }
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
    if (assignment.scope_type === 'plan') {
      const plan = this.requirePlan(assignment.scope_id);
      if (plan.room_id !== assignment.room_id) {
        throw new ProtocolError('validation_failed', `assignment ${assignment.assignment_id} references plan from another room`);
      }
      return;
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
    const profile = this.repo.getParticipant(workerParticipantId)!;
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
    return {
      ...contract,
      planner_participant_id: planner.participant_id,
      orchestrator_participant_id: orchestrator.participant_id,
    } satisfies PersistedTask;
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

  private assertGraphClaim(run: Run, worktreePath: string): void {
    const dispatch = this.repo.nodeDispatchForRun(run.run_id);
    // Direct service calls remain an internal Stage 2 test seam; the MCP boundary no longer
    // exposes implementation submission. Every graph-created Run has a dispatch and is gated.
    if (!dispatch) return;
    const currentTask = this.repo.latestTaskForRun(run.run_id);
    if (dispatch.status === 'awaiting_git' || dispatch.canonical_worktree_path === null) {
      throw new ProtocolError('validation_failed', `node dispatch ${dispatch.dispatch_id} awaits Git worktree setup`);
    }
    if (dispatch.status !== 'ready' && dispatch.status !== 'dispatched' && !(dispatch.status === 'blocked' && currentTask?.type === 'fix')) {
      throw new ProtocolError('validation_failed', `node dispatch ${dispatch.dispatch_id} is not claimable (status ${dispatch.status})`);
    }
    // claim gate 统一消费同一 exact current approved snapshot（Review finding inc12-r1）：
    // node、write_scopes 与 concurrency_limit 都来自 current revision，dispatch source
    // revision 只保留历史 materialization reference，不再混用其 limit 或 node 定义。
    const sourceRevision = this.requireRevision(dispatch.revision_id);
    const current = this.repo.currentApprovedTaskGraphRevision(sourceRevision.plan_id);
    const currentNode = current?.nodes.find((candidate) => candidate.node_id === dispatch.node_id);
    const dispatchedNode = sourceRevision.nodes.find((candidate) => candidate.node_id === dispatch.node_id);
    if (!current || !currentNode || !dispatchedNode || JSON.stringify(currentNode) !== JSON.stringify(dispatchedNode)) {
      throw new ProtocolError('plan_revision_not_approved', `run ${run.run_id} is not from the current approved revision`);
    }
    if (dispatch.canonical_worktree_path !== worktreePath) {
      throw new ProtocolError('validation_failed', `claim worktree does not match node dispatch ${dispatch.dispatch_id}`);
    }
    if (dispatch.status === 'ready') {
      const dispatchedAt = this.now();
      this.repo.updateNodeDispatch({ ...dispatch, status: 'dispatched', dispatched_at: dispatchedAt, updated_at: dispatchedAt });
    }
    const active = this.repo.listAttemptsByRoom(run.room_id).filter((attempt) =>
      attempt.status === 'running' || attempt.status === 'decision_requested' || attempt.status === 'cancel_requested');
    if (active.length >= current.concurrency_limit) {
      throw new ProtocolError('concurrency_limit_reached', `room ${run.room_id} reached graph concurrency limit ${current.concurrency_limit}`);
    }
    for (const attempt of active) {
      const otherDispatch = this.repo.nodeDispatchForRun(attempt.run_id);
      if (!otherDispatch) continue;
      const otherNode = current.nodes.find((candidate) => candidate.node_id === otherDispatch.node_id);
      if (otherNode && scopesOverlap(currentNode.write_scopes, otherNode.write_scopes)) {
        throw new ProtocolError('scope_conflict', `run ${run.run_id} overlaps active run ${attempt.run_id}`);
      }
    }
  }

  private requirePlan(planId: string): Plan {
    const plan = this.repo.getPlan(planId);
    if (!plan) throw new ProtocolError('entity_not_found', `plan ${planId} not found`);
    return plan;
  }

  private findLineageDispatch(revision: TaskGraphRevision, nodeId: string): NodeDispatch | null {
    const revisionNumbers = new Map(
      this.repo.listTaskGraphRevisions(revision.room_id)
        .filter((candidate) => candidate.plan_id === revision.plan_id && candidate.revision_no <= revision.revision_no)
        .map((candidate) => [candidate.revision_id, candidate.revision_no]),
    );
    return this.repo.listNodeDispatches(revision.room_id)
      .filter((dispatch) => dispatch.node_id === nodeId && revisionNumbers.has(dispatch.revision_id))
      .sort((left, right) => (revisionNumbers.get(right.revision_id) ?? 0) - (revisionNumbers.get(left.revision_id) ?? 0))[0] ?? null;
  }

  private requireRevision(revisionId: string): TaskGraphRevision {
    const revision = this.repo.getTaskGraphRevision(revisionId);
    if (!revision) throw new ProtocolError('entity_not_found', `revision ${revisionId} not found`);
    return revision;
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

}
