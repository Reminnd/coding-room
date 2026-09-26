import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { z } from 'zod';
import { runRoomRun } from '../cli/run.ts';
import { GitController, previewGitActionInputSchema } from '../git/git-controller.ts';
import { runGit } from '../git/git-process.ts';
import {
  approvalSchema,
  participantKindSchema,
  roleAssignmentScopeSchema,
  roleSchema,
  taskContractSchema,
  taskGraphRevisionSchema,
  type EventActor,
  type Role,
} from '../protocol/schema.ts';
import { ProtocolError } from '../protocol/errors.ts';
import { RoomService } from '../room/room-service.ts';
import { getRoomStateSnapshot } from '../room/state-snapshot.ts';
import { PlanScheduler } from '../scheduler/plan-scheduler.ts';
import { ProjectRegistry, type UiProject } from './project-registry.ts';

const id = z.string().min(1);
const timestamp = z.string().datetime({ offset: true });

const createPlanInput = z.object({ plan_id: id, created_at: timestamp.optional() }).strict();
const createRevisionInput = taskGraphRevisionSchema.omit({ room_id: true, created_by_participant_id: true }).strict();
const decideRevisionInput = z.object({
  approval_id: id,
  revision_id: id,
  decision: z.enum(['approved', 'rejected']),
  confirmed_by_user: z.literal(true),
  created_at: timestamp.optional(),
}).strict();
const reconcilePlanInput = z.object({
  plan_id: id,
  worktrees: z.array(z.object({ node_id: id, dispatch_id: id, worktree_path: z.string().min(1).nullable().optional() }).strict()),
}).strict();
const answerQuestionInput = z.object({ question_id: id, answer: z.string().min(1), answer_changes_contract: z.boolean() }).strict();
const submitReviewInput = z.object({
  review_id: id,
  task_id: id,
  run_id: id,
  attempt_id: id,
  decision: z.enum(['approved', 'changes_requested', 'needs_discussion']),
  findings: z.array(z.object({
    finding_id: id,
    severity: z.enum(['blocker', 'high', 'medium', 'low']),
    title: z.string(), file: z.string(), line: z.number().int().nullable(), trigger: z.string(), evidence: z.string(),
    impact: z.string(), requirement_relation: z.string(), minimal_direction: z.string(),
  }).strict()),
  open_questions: z.array(z.string()),
  verification_summary: z.string(),
  created_at: timestamp.optional(),
}).strict();
const acceptReviewInput = z.object({ review_id: id, confirmed_by_user: z.literal(true) }).strict();
const retryRunInput = z.object({ run_id: id }).strict();
const cancelRunInput = z.object({ run_id: id, reason: z.string().min(1), confirmed_by_user: z.literal(true) }).strict();
const guidanceInput = z.object({ guidance_id: id, run_id: id, text: z.string().min(1) }).strict();
const decideGitInput = z.object({
  approval_id: id, git_action_id: id, decision: z.enum(['approved', 'rejected']),
  confirmed_by_user: z.literal(true), created_at: timestamp.optional(),
}).strict();
const gitActionIdInput = z.object({ git_action_id: id }).strict();
const participantInput = z.object({
  participant_id: id, display_name: z.string().min(1), kind: participantKindSchema, provider: z.string().min(1),
  adapter_id: z.string().min(1), capabilities: z.array(z.string()), config_ref: z.string().nullable(), enabled: z.boolean(),
  created_at: timestamp.optional(),
}).strict();
const participantEnabledInput = z.object({ participant_id: id, enabled: z.boolean() }).strict();
const roleAssignmentInput = z.object({
  assignment_id: id, scope_type: roleAssignmentScopeSchema, scope_id: id.nullable(), role: roleSchema,
  participant_id: id, created_at: timestamp.optional(),
}).strict();
const openVscodeInput = z.object({ run_id: id.optional() }).strict();

export interface LaunchState {
  project_id: string;
  run_id: string;
  attempt_id: string;
  status: 'starting' | 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

export interface RoomUiApplicationDeps {
  runOneShot?: typeof runRoomRun;
  openVscode?: (target: string) => Promise<void>;
}

function now(): string {
  return new Date().toISOString();
}

function openVscodeDefault(target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('code', ['--reuse-window', target], { detached: true, stdio: 'ignore' });
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
    child.once('error', reject);
  });
}

function parseWorktrees(output: string): Array<{ path: string; head: string | null; branch: string | null; bare: boolean }> {
  return output.trim().split(/\r?\n\r?\n/).filter(Boolean).map((block) => {
    const fields = new Map(block.split(/\r?\n/).map((line) => {
      const space = line.indexOf(' ');
      return space === -1 ? [line, ''] : [line.slice(0, space), line.slice(space + 1)];
    }));
    return {
      path: fields.get('worktree') ?? '',
      head: fields.get('HEAD') || null,
      branch: fields.get('branch')?.replace('refs/heads/', '') || null,
      bare: fields.has('bare'),
    };
  });
}

export class RoomUiApplication {
  readonly registry: ProjectRegistry;
  private readonly runOneShot: typeof runRoomRun;
  private readonly openVscodeProcess: (target: string) => Promise<void>;
  private readonly launches = new Map<string, LaunchState>();

  constructor(registry: ProjectRegistry, deps: RoomUiApplicationDeps = {}) {
    this.registry = registry;
    this.runOneShot = deps.runOneShot ?? runRoomRun;
    this.openVscodeProcess = deps.openVscode ?? openVscodeDefault;
  }

  listProjects(): ReturnType<ProjectRegistry['diagnostics']> {
    return this.registry.diagnostics();
  }

  addProject(input: unknown): UiProject {
    const parsed = z.object({
      project_id: id.optional(), name: z.string().min(1), project_path: z.string().min(1), database_path: z.string().min(1),
      room_id: id, control_participant_id: id, port: z.number().int().min(1).max(65535).nullable(),
    }).strict().parse(input);
    return this.registry.add(parsed);
  }

  importRuntime(input: unknown): UiProject {
    const parsed = z.object({ project_path: z.string().min(1), name: z.string().min(1).optional() }).strict().parse(input);
    return this.registry.importRuntime(parsed.project_path, parsed.name);
  }

  removeProject(projectId: string): void {
    this.registry.remove(projectId);
  }

  createRoom(projectId: string, input: unknown): unknown {
    const project = this.registry.get(projectId);
    z.object({ confirm_create: z.literal(true) }).strict().parse(input);
    if (!statSync(project.project_path).isDirectory()) throw new Error(`project path is not a directory: ${project.project_path}`);
    if (!existsSync(project.database_path)) mkdirSync(dirname(project.database_path), { recursive: true });
    const db = new DatabaseSync(project.database_path);
    try {
      const service = new RoomService(db);
      return service.createRoom(project.room_id, { participant_id: project.control_participant_id, actor_role: 'planner' });
    } finally {
      db.close();
    }
  }

  getState(projectId: string, afterSequence?: number): unknown {
    return this.withService(projectId, (project, service) => {
      service.assertRoomParticipant(project.room_id, project.control_participant_id);
      return getRoomStateSnapshot(service, { room_id: project.room_id, after_sequence: afterSequence ?? null });
    });
  }

  async action(projectId: string, action: string, body: unknown): Promise<unknown> {
    const project = this.registry.get(projectId);
    if (action === 'git-preview') {
      const command = previewGitActionInputSchema.parse(body);
      this.assertProjectRoom(project, command.room_id);
      return this.withServiceAsync(project, async (_selected, service) => new GitController(service).preview(command, this.actor(service, project, 'git_controller')));
    }
    if (action === 'git-execute' || action === 'git-reconcile') {
      const input = gitActionIdInput.parse(body);
      return this.withServiceAsync(project, async (_selected, service) => {
        const controller = new GitController(service);
        const actor = this.actor(service, project, 'git_controller');
        return action === 'git-execute' ? controller.execute(input.git_action_id, actor) : controller.reconcile(input.git_action_id, actor);
      });
    }
    if (action === 'reconcile-plan') {
      const input = reconcilePlanInput.parse(body);
      return this.withServiceAsync(project, async (_selected, service) => new PlanScheduler(service).reconcile({ room_id: project.room_id, ...input }, this.actor(service, project, 'orchestrator')));
    }
    return this.withService(projectId, (_selected, service) => this.serviceAction(service, project, action, body));
  }

  async gitState(projectId: string): Promise<unknown> {
    const project = this.registry.get(projectId);
    const [branch, status, worktrees] = await Promise.all([
      runGit('branch', ['--show-current'], project.project_path),
      runGit('status', ['--porcelain=v1'], project.project_path),
      runGit('worktree', ['list', '--porcelain'], project.project_path),
    ]);
    return {
      branch: branch.toString('utf8').trim() || null,
      status: status.toString('utf8').split(/\r?\n/).filter(Boolean),
      worktrees: parseWorktrees(worktrees.toString('utf8')),
    };
  }

  startRun(projectId: string, input: unknown): LaunchState {
    const project = this.registry.get(projectId);
    const parsed = z.object({ run_id: id, attempt_id: id.optional() }).strict().parse(input);
    if (project.port === null) throw new Error('project port is required to launch the existing MCP-bound runner');
    const run = this.withService(projectId, (_selected, service) => {
      const candidate = service.getRun(parsed.run_id);
      if (!candidate) throw new ProtocolError('entity_not_found', `run ${parsed.run_id} not found`);
      if (candidate.status !== 'ready') throw new ProtocolError('validation_failed', `run ${parsed.run_id} is not ready`);
      if (service.activeAttemptForRun(parsed.run_id)) throw new ProtocolError('run_already_active', `run ${parsed.run_id} already has an active attempt`);
      return candidate;
    });
    const key = `${projectId}:${parsed.run_id}`;
    const active = this.launches.get(key);
    if (active && (active.status === 'starting' || active.status === 'running')) {
      throw new ProtocolError('run_already_active', `run ${parsed.run_id} already has an active UI launch`);
    }
    const launch: LaunchState = {
      project_id: projectId,
      run_id: parsed.run_id,
      attempt_id: parsed.attempt_id ?? `attempt-${randomUUID()}`,
      status: 'starting',
      started_at: now(),
      completed_at: null,
      error: null,
    };
    this.launches.set(key, launch);
    const mcpUrl = `http://127.0.0.1:${project.port}/mcp/participants/p~${encodeURIComponent(run.worker_participant_id)}`;
    launch.status = 'running';
    void this.runOneShot({
      db: project.database_path,
      project: run.worktree_path ?? project.project_path,
      runId: run.run_id,
      attemptId: launch.attempt_id,
      mcpUrl,
    }).then(() => {
      launch.status = 'completed';
      launch.completed_at = now();
    }).catch((error: unknown) => {
      launch.status = 'failed';
      launch.completed_at = now();
      launch.error = error instanceof Error ? error.message : String(error);
    });
    return launch;
  }

  listLaunches(projectId: string): LaunchState[] {
    this.registry.get(projectId);
    return [...this.launches.values()].filter((launch) => launch.project_id === projectId);
  }

  async openVscode(projectId: string, input: unknown): Promise<{ target: string }> {
    const project = this.registry.get(projectId);
    const parsed = openVscodeInput.parse(input);
    let target = project.project_path;
    if (parsed.run_id) {
      target = this.withService(projectId, (_selected, service) => {
        const run = service.getRun(parsed.run_id!);
        if (!run) throw new ProtocolError('entity_not_found', `run ${parsed.run_id} not found`);
        if (!run.worktree_path) throw new ProtocolError('validation_failed', `run ${parsed.run_id} has no worktree`);
        return run.worktree_path;
      });
    }
    await this.openVscodeProcess(target);
    return { target };
  }

  exportArchive(projectId: string): unknown {
    const project = this.registry.get(projectId);
    return {
      format: 'agent-room-ui-archive-v1',
      exported_at: now(),
      project: {
        project_id: project.project_id,
        name: project.name,
        project_path: project.project_path,
        database_path: project.database_path,
        room_id: project.room_id,
        control_participant_id: project.control_participant_id,
      },
      snapshot: this.getState(projectId),
    };
  }

  private serviceAction(service: RoomService, project: UiProject, action: string, body: unknown): unknown {
    const roomId = project.room_id;
    switch (action) {
      case 'begin-architecture-review':
        z.object({}).strict().parse(body);
        return service.transitionToArchitectureReview(roomId, this.actor(service, project, 'planner'));
      case 'request-user-confirmation':
        z.object({}).strict().parse(body);
        return service.transitionToWaitingForUserConfirmation(roomId, this.actor(service, project, 'planner'));
      case 'create-plan': {
        const input = createPlanInput.parse(body);
        return service.createPlan({ plan_id: input.plan_id, room_id: roomId, created_by_participant_id: project.control_participant_id, created_at: input.created_at ?? now() }, this.actor(service, project, 'planner'));
      }
      case 'create-plan-revision': {
        const input = createRevisionInput.parse(body);
        const revision = taskGraphRevisionSchema.parse({ ...input, room_id: roomId, created_by_participant_id: project.control_participant_id });
        return service.createPlanRevision(revision, this.actor(service, project, 'planner'));
      }
      case 'decide-plan-revision': {
        const input = decideRevisionInput.parse(body);
        const approval = approvalSchema.parse({ approval_id: input.approval_id, room_id: roomId, target_type: 'task_graph_revision', target_id: input.revision_id, decision: input.decision, confirmed_by_user: input.confirmed_by_user, planner_participant_id: project.control_participant_id, created_at: input.created_at ?? now() });
        return service.decidePlanRevision(approval, this.actor(service, project, 'planner'));
      }
      case 'submit-fix-task': {
        const contract = taskContractSchema.parse(body);
        if (contract.type !== 'fix') throw new ProtocolError('validation_failed', 'UI direct task submission only accepts Fix Task; implementation tasks belong to approved graph revisions');
        this.assertProjectRoom(project, contract.room_id);
        return service.submitTask(contract, this.actor(service, project, 'planner'));
      }
      case 'answer-question': {
        const input = answerQuestionInput.parse(body);
        return service.answerQuestion(input.question_id, input.answer, input.answer_changes_contract, this.actor(service, project, 'planner'));
      }
      case 'submit-review': {
        const input = submitReviewInput.parse(body);
        return service.submitReview({ ...input, room_id: roomId, reviewer_participant_id: project.control_participant_id, created_at: input.created_at ?? now() }, this.actor(service, project, 'reviewer'));
      }
      case 'accept-review': {
        const input = acceptReviewInput.parse(body);
        return service.acceptReview(input.review_id, input.confirmed_by_user, this.actor(service, project, 'reviewer'));
      }
      case 'retry-run': {
        const input = retryRunInput.parse(body);
        return service.retryRun(roomId, input.run_id, this.actor(service, project, 'planner'));
      }
      case 'cancel-run': {
        const input = cancelRunInput.parse(body);
        return service.cancelRun({ room_id: roomId, ...input }, this.actor(service, project, 'planner'));
      }
      case 'add-guidance': {
        const input = guidanceInput.parse(body);
        return service.addRunGuidance({ room_id: roomId, ...input }, this.actor(service, project, 'planner'));
      }
      case 'decide-git-action': {
        const input = decideGitInput.parse(body);
        const approval = approvalSchema.parse({ approval_id: input.approval_id, room_id: roomId, target_type: 'git_action_preview', target_id: input.git_action_id, decision: input.decision, confirmed_by_user: input.confirmed_by_user, planner_participant_id: project.control_participant_id, created_at: input.created_at ?? now() });
        return service.decideGitAction(approval, this.actor(service, project, 'planner'));
      }
      case 'register-participant': {
        const input = participantInput.parse(body);
        return service.registerParticipant({ ...input, created_at: input.created_at ?? now() }, this.actor(service, project, 'orchestrator'));
      }
      case 'set-participant-enabled': {
        const input = participantEnabledInput.parse(body);
        return service.setParticipantEnabled(input.participant_id, input.enabled, this.actor(service, project, 'orchestrator'));
      }
      case 'create-role-assignment': {
        const input = roleAssignmentInput.parse(body);
        return service.createRoleAssignment({ ...input, room_id: roomId, created_at: input.created_at ?? now() }, this.actor(service, project, 'orchestrator'));
      }
      default:
        throw new ProtocolError('validation_failed', `unknown UI action: ${action}`);
    }
  }

  private actor(service: RoomService, project: UiProject, role: Role): EventActor {
    if (role === 'planner' || role === 'reviewer' || role === 'orchestrator') {
      return { participant_id: project.control_participant_id, actor_role: role };
    }
    const assignment = service.resolveAssignment(project.room_id, 'room', null, role);
    if (!assignment) throw new ProtocolError('actor_not_allowed', `no ${role} assignment for room ${project.room_id}`);
    return { participant_id: assignment.participant_id, actor_role: role };
  }

  private assertProjectRoom(project: UiProject, roomId: string): void {
    if (roomId !== project.room_id) throw new ProtocolError('validation_failed', `request room_id must equal selected project room ${project.room_id}`);
  }

  private withService<T>(projectId: string, fn: (project: UiProject, service: RoomService) => T): T {
    const project = this.registry.get(projectId);
    if (!existsSync(project.database_path)) throw new Error(`database does not exist: ${project.database_path}`);
    const db = new DatabaseSync(project.database_path);
    try {
      return fn(project, new RoomService(db));
    } finally {
      db.close();
    }
  }

  private async withServiceAsync<T>(project: UiProject, fn: (project: UiProject, service: RoomService) => Promise<T>): Promise<T> {
    if (!existsSync(project.database_path)) throw new Error(`database does not exist: ${project.database_path}`);
    const db = new DatabaseSync(project.database_path);
    try {
      return await fn(project, new RoomService(db));
    } finally {
      db.close();
    }
  }
}
