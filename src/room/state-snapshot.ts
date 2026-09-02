import { z } from 'zod';
import { ProtocolError } from '../protocol/errors.ts';
import {
  approvalSchema,
  eventSchema,
  gitActionSchema,
  nodeDispatchSchema,
  participantProfileSchema,
  planSchema,
  persistedTaskSchema,
  questionSchema,
  reviewSchema,
  roleAssignmentSchema,
  roomStateSchema,
  runAttemptSchema,
  runGuidanceSchema,
  runSchema,
  runStatusSchema,
  taskGraphRevisionSchema,
  type Event,
  type GitAction,
  type Approval,
  type NodeDispatch,
  type Plan,
  type ParticipantProfile,
  type PersistedTask,
  type Question,
  type Review,
  type RoleAssignment,
  type Run,
  type RunAttempt,
  type RunGuidance,
  type RunStatus,
  type TaskGraphRevision,
} from '../protocol/schema.ts';
import type { RoomRecord } from './repository.ts';
import type { RoomService } from './room-service.ts';

// MCP room_get_state 与 Status CLI 共同调用的只读 Room state snapshot boundary。两个
// adapter 都从这一层读取 planning state、全部 Runs/Attempts/Guidance 与 per-Run
// run_work_items，不各自重建推断规则。只组合 RoomService 既有 read method；snapshot 本身
// 不写 SQLite、不改变任何 state。
//
// v0.4 移除单一 current_task/current_run/current_review/current_question 作为 execution
// authority：每个 work item 从该 Run 的持久化 status、latest attempt/reference 与 Event
// 推导，跨 Run 互不覆盖。

// RoomRecord 的持久化 shape 在 repository 定义；协议未定义独立 Room entity schema，这里
// 只为其补充 zod schema，供 MCP structuredContent 输出校验复用。
export const roomRecordSchema = z.object({
  room_id: z.string().min(1),
  state: roomStateSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

// waiting actor 由权威状态固定映射决定，不接受 caller 传入的 actor string/header，不引入
// 第二条 transition path。以 Role 表达下一位 actor（user 仍是人工确认点）；没有下一位
// actor（accepted）返回 null。
export type WaitingActor = 'planner' | 'worker' | 'reviewer' | 'executor' | 'user' | null;

export const waitingActorSchema = z.enum(['planner', 'worker', 'reviewer', 'executor', 'user']).nullable();

// planning_waiting_actor 只由 Room planning state 决定：planner 推进 planning；user 只在
// 确认点等待。
const PLANNING_WAITING_ACTOR: Record<string, WaitingActor> = {
  DISCUSSION: 'planner',
  ARCHITECTURE_REVIEW: 'planner',
  WAITING_FOR_USER_CONFIRMATION: 'user',
};

// per-Run work item：只存 reference id（entity 本身在 snapshot 数组里），由 Run status 与
// active attempt status 决定下一位 actor。
export interface RunWorkItem {
  run_id: string;
  run_status: RunStatus;
  waiting_actor: WaitingActor;
  current_task_id: string | null;
  current_attempt_id: string | null;
  current_question_id: string | null;
  current_review_id: string | null;
}

export const runWorkItemSchema = z.object({
  run_id: z.string().min(1),
  run_status: runStatusSchema,
  waiting_actor: waitingActorSchema,
  current_task_id: z.string().min(1).nullable(),
  current_attempt_id: z.string().min(1).nullable(),
  current_question_id: z.string().min(1).nullable(),
  current_review_id: z.string().min(1).nullable(),
});

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
  attempts: RunAttempt[];
  run_guidance: RunGuidance[];
  reviews: Review[];
  questions: Question[];
  plans: Plan[];
  task_graph_revisions: TaskGraphRevision[];
  approvals: Approval[];
  node_dispatches: NodeDispatch[];
  git_actions: GitAction[];
  graph_work_items: GraphWorkItem[];
  plan_work_items: PlanWorkItem[];
  planning_waiting_actor: WaitingActor;
  run_work_items: RunWorkItem[];
  cursor: number;
  events: Event[];
}

export const roomStateSnapshotSchema = z.object({
  room: roomRecordSchema,
  participants: z.array(participantProfileSchema),
  role_assignments: z.array(roleAssignmentSchema),
  tasks: z.array(persistedTaskSchema),
  runs: z.array(runSchema),
  attempts: z.array(runAttemptSchema),
  run_guidance: z.array(runGuidanceSchema),
  reviews: z.array(reviewSchema),
  questions: z.array(questionSchema),
  plans: z.array(planSchema),
  task_graph_revisions: z.array(taskGraphRevisionSchema),
  approvals: z.array(approvalSchema),
  node_dispatches: z.array(nodeDispatchSchema),
  git_actions: z.array(gitActionSchema),
  graph_work_items: z.array(z.object({
    plan_id: z.string().min(1), revision_id: z.string().min(1), node_id: z.string().min(1),
    task_id: z.string().min(1), run_id: z.string().min(1), dispatch_id: z.string().min(1).nullable(),
    waiting_reason: z.enum(['revision_not_approved', 'dependency_not_accepted', 'worktree_required', 'awaiting_git', 'ready', 'dispatched', 'blocked', 'completed']),
    dependency_ready: z.boolean(), scope_violated: z.boolean(), worktree_path: z.string().min(1).nullable(),
    git_waiting_reason: z.enum(['worktree_required', 'commit_required', 'final_fast_forward_required', 'action_failed', 'outcome_unknown']).nullable(),
    commit_gate_satisfied: z.boolean(),
  })),
  plan_work_items: z.array(z.object({ plan_id: z.string().min(1), revision_id: z.string().min(1), completed: z.boolean() })),
  planning_waiting_actor: waitingActorSchema,
  run_work_items: z.array(runWorkItemSchema),
  cursor: z.number().int().min(0),
  events: z.array(eventSchema),
});

export interface GraphWorkItem {
  plan_id: string;
  revision_id: string;
  node_id: string;
  task_id: string;
  run_id: string;
  dispatch_id: string | null;
  waiting_reason: 'revision_not_approved' | 'dependency_not_accepted' | 'worktree_required' | 'awaiting_git' | 'ready' | 'dispatched' | 'blocked' | 'completed';
  dependency_ready: boolean;
  scope_violated: boolean;
  worktree_path: string | null;
  git_waiting_reason: 'worktree_required' | 'commit_required' | 'final_fast_forward_required' | 'action_failed' | 'outcome_unknown' | null;
  commit_gate_satisfied: boolean;
}

export interface PlanWorkItem { plan_id: string; revision_id: string; completed: boolean }

// Run 下一位 actor：execution 阶段由 active attempt status 细分（worker 仍在运行 vs
// executor 必须停止/终止 process），其余由 Run status 固定映射。
function runWaitingActor(run: Run, activeAttempt: RunAttempt | null): WaitingActor {
  switch (run.status) {
    case 'ready':
      return 'executor';
    case 'running': {
      if (!activeAttempt) return 'worker';
      if (activeAttempt.status === 'decision_requested') return 'executor';
      if (activeAttempt.status === 'cancel_requested') return 'executor';
      return 'worker';
    }
    case 'cancel_requested':
      return 'executor';
    case 'needs_decision':
      return 'user';
    case 'failed':
    case 'canceled':
      return 'planner';
    case 'review_required':
      return 'reviewer';
    case 'review_discussion':
      return 'user';
    case 'accepted':
      return null;
  }
}

export function getRoomStateSnapshot(
  service: RoomService,
  input: { room_id: string; after_sequence?: number | null },
): RoomStateSnapshot {
  const room = service.getRoom(input.room_id);
  if (!room) throw new ProtocolError('entity_not_found', `room ${input.room_id} not found`);

  // 全量升序 Event 用于 cursor/events 计算。current reference 由 repository 的 per-Run
  // latest 读取提供（latestTaskForRun / latestAttemptForRun / latestOpenQuestionForRun /
  // latestReviewForRun），不扫描 entity content 猜测身份。
  const allEvents = service.listEvents(input.room_id);
  const after = input.after_sequence ?? 0;

  const runs = service.listRuns(input.room_id);
  const plans = service.listPlans(input.room_id);
  const revisions = service.listTaskGraphRevisions(input.room_id);
  const approvals = service.listApprovals(input.room_id);
  const nodeDispatches = service.listNodeDispatches(input.room_id);
  const gitActions = service.listGitActions(input.room_id);
  const revisionsById = new Map(revisions.map((revision) => [revision.revision_id, revision]));
  const graphWorkItems: GraphWorkItem[] = [];
  const planWorkItems: PlanWorkItem[] = [];
  for (const plan of plans) {
    const latest = revisions.filter((revision) => revision.plan_id === plan.plan_id).sort((a, b) => b.revision_no - a.revision_no)[0];
    if (!latest) continue;
    const approved = approvals.some((approval) => approval.target_id === latest.revision_id && approval.decision === 'approved');
    const byNode = new Map(latest.nodes.map((node) => [node.node_id, node]));
    // lineage dispatch 按 plan 内 revision_no 升序取最新，node 与 dependency readiness
    // 共用同一 frozen dispatch lookup（Review finding inc12-r1）。
    const dispatchByNode = new Map(
      latest.nodes.map((node) => [
        node.node_id,
        nodeDispatches
          .filter((candidate) => {
            const source = revisionsById.get(candidate.revision_id);
            return candidate.node_id === node.node_id && source?.plan_id === latest.plan_id && source.revision_no <= latest.revision_no;
          })
          .sort((left, right) => (revisionsById.get(right.revision_id)?.revision_no ?? 0) - (revisionsById.get(left.revision_id)?.revision_no ?? 0))[0] ?? null,
      ]),
    );
    for (const node of latest.nodes) {
      const dispatch = dispatchByNode.get(node.node_id) ?? null;
      // dependency readiness 与 Scheduler 同一权威语义（Review finding inc12-r1）：
      // dependency Run accepted + 对应 NodeDispatch completed + scope_violated=false 缺一
      // 不可；blocked dispatch 不得经 acceptance 解锁 descendant。
      const dependencyReady = node.dependencies.every((dependency) => {
        const dependencyDispatch = dispatchByNode.get(dependency);
        if (!dependencyDispatch) return false;
        return runs.some((run) => run.run_id === dependencyDispatch.run_id && run.status === 'accepted')
          && dependencyDispatch.status === 'completed'
          && !dependencyDispatch.scope_violated;
      });
      let waitingReason: GraphWorkItem['waiting_reason'];
      if (!approved) waitingReason = 'revision_not_approved';
      else if (!dependencyReady) waitingReason = 'dependency_not_accepted';
      else if (!dispatch) waitingReason = 'worktree_required';
      else if (dispatch.status === 'blocked') waitingReason = 'blocked';
      else if (dispatch.status === 'completed') waitingReason = 'completed';
      else if (dispatch.status === 'dispatched') waitingReason = 'dispatched';
      else if (dispatch.status === 'awaiting_git') waitingReason = 'awaiting_git';
      else waitingReason = 'ready';
      const nodeActions = gitActions.filter((action) => action.revision_id === latest.revision_id && action.node_id === node.node_id);
      const latestAction = nodeActions.at(-1) ?? null;
      let gitWaitingReason: GraphWorkItem['git_waiting_reason'] = null;
      if (latestAction?.status === 'failed') gitWaitingReason = 'action_failed';
      else if (latestAction?.status === 'outcome_unknown') gitWaitingReason = 'outcome_unknown';
      else if (dispatch?.status === 'awaiting_git' && dispatch.canonical_worktree_path === null) gitWaitingReason = 'worktree_required';
      else if (dispatch?.status === 'awaiting_git') gitWaitingReason = 'commit_required';
      else if (latest.acceptance_policy === 'integration_only' && node.kind === 'integration'
        && runs.some((run) => run.run_id === dispatch?.run_id && run.status === 'accepted')
        && dispatch?.status === 'completed'
        && !nodeActions.some((action) => action.operation === 'integrate_fast_forward' && action.status === 'succeeded')) {
        gitWaitingReason = 'final_fast_forward_required';
      }
      graphWorkItems.push({
        plan_id: plan.plan_id, revision_id: latest.revision_id, node_id: node.node_id,
        task_id: node.task_spec.task_id, run_id: node.task_spec.run_id,
        dispatch_id: dispatch?.dispatch_id ?? null, waiting_reason: waitingReason,
        dependency_ready: dependencyReady, scope_violated: dispatch?.scope_violated ?? false,
        worktree_path: dispatch?.canonical_worktree_path ?? null,
        git_waiting_reason: gitWaitingReason,
        commit_gate_satisfied: dispatch?.status === 'completed',
      });
    }
    const terminal = latest.nodes.find((node) => node.kind === 'integration') ?? null;
    const terminalDispatch = terminal ? dispatchByNode.get(terminal.node_id) ?? null : null;
    const terminalAccepted = Boolean(terminalDispatch && runs.some((run) => run.run_id === terminalDispatch.run_id && run.status === 'accepted'));
    const finalFastForward = Boolean(terminal && gitActions.some((action) => action.revision_id === latest.revision_id && action.node_id === terminal.node_id && action.operation === 'integrate_fast_forward' && action.status === 'succeeded'));
    const completed = latest.acceptance_policy === 'integration_only'
      ? terminalAccepted && terminalDispatch?.status === 'completed' && finalFastForward
      : latest.nodes.every((node) => {
        const dispatch = dispatchByNode.get(node.node_id);
        return Boolean(dispatch && dispatch.status === 'completed' && runs.some((run) => run.run_id === dispatch.run_id && run.status === 'accepted'));
      });
    planWorkItems.push({ plan_id: plan.plan_id, revision_id: latest.revision_id, completed });
  }
  // run_work_items 稳定排序：created_at 升序，同 created_at 按 run_id 字典序。
  const sortedRuns = [...runs].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.run_id < b.run_id ? -1 : a.run_id > b.run_id ? 1 : 0;
  });

  const runWorkItems: RunWorkItem[] = sortedRuns.map((run) => {
    const latestAttempt = service.latestAttemptForRun(run.run_id);
    const openQuestion = service.latestOpenQuestionForRun(run.run_id);
    const latestReview = service.latestReviewForRun(run.run_id);
    const activeAttempt = service
      .listAttemptsByRun(run.run_id)
      .find(
        (a) => a.status === 'running' || a.status === 'decision_requested' || a.status === 'cancel_requested',
      ) ?? null;
    // current task 从该 Run 的最新 persisted Task 推导（Review finding inc10-r3），独立于
    // latest attempt：initial-ready 显示 Implementation Task，fix-ready（claim 前）已显示
    // Fix Task，不等待下一 attempt 创建才切换。
    const latestTask = service.latestTaskForRun(run.run_id);
    return {
      run_id: run.run_id,
      run_status: run.status,
      waiting_actor: runWaitingActor(run, activeAttempt),
      current_task_id: latestTask?.task_id ?? null,
      current_attempt_id: latestAttempt?.attempt_id ?? null,
      current_question_id: openQuestion?.question_id ?? null,
      current_review_id: latestReview?.review_id ?? null,
    };
  });

  // 稳定数组一律按 room membership 过滤（repository 层按 content room_id / assignment 归属），
  // 跨 Room 不泄漏；run_work_items 只是 derived convenience，不替代 Run/Attempt status authority。
  const snapshot: RoomStateSnapshot = {
    room,
    participants: service.listRoomParticipants(input.room_id),
    role_assignments: service.listRoleAssignments(input.room_id),
    tasks: service.listTasks(input.room_id),
    runs,
    attempts: service.listAttemptsByRoom(input.room_id),
    run_guidance: service.listGuidanceByRoom(input.room_id),
    reviews: service.listReviews(input.room_id),
    questions: service.listQuestions(input.room_id),
    plans,
    task_graph_revisions: revisions,
    approvals,
    node_dispatches: nodeDispatches,
    git_actions: gitActions,
    graph_work_items: graphWorkItems,
    plan_work_items: planWorkItems,
    planning_waiting_actor: PLANNING_WAITING_ACTOR[room.state] ?? null,
    run_work_items: runWorkItems,
    cursor: allEvents.length === 0 ? 0 : allEvents[allEvents.length - 1].sequence,
    events: allEvents.filter((e) => e.sequence > after),
  };
  return snapshot;
}
