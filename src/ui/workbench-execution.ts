import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { z } from 'zod';
import { GitController } from '../git/git-controller.ts';
import { observeContinuation } from '../git/git-observer.ts';
import { runGit } from '../git/git-process.ts';
import type { EventActor, TaskGraphRevision } from '../protocol/schema.ts';
import { RoomService } from '../room/room-service.ts';
import { PlanScheduler, validateWriteScope, scopeContainsPath } from '../scheduler/plan-scheduler.ts';
import { VerificationRunner } from '../runner/verification.ts';
import type { ProjectRegistry, UiProject } from './project-registry.ts';
import { WorkbenchStore, type WorkbenchTask } from './workbench-store.ts';
import { captureReviewCandidate } from './workbench-review.ts';
import { assertSddReady } from './proposal.ts';

export interface ExecutionPreview {
  preview_id: string; task_id: string; proposal_version: number; goal: string; scope: string[];
  acceptance_criteria: string[]; verification: string[]; verification_mode: string;
  worker: string; worktree_path: string; branch: string; source_ref: string;
  original_changes: string[]; git_operations: string[];
  carried_changes?: string[];
}
interface ExecutionDeps {
  launch: (projectId: string, runId: string) => Promise<unknown>;
  assertPlanningIdle: (projectId: string, taskId: string) => void;
  checkRunner?: () => Promise<void>;
  isLaunchActive?: (projectId: string, runId: string) => boolean;
}

export class WorkbenchExecution {
  private readonly registry: ProjectRegistry;
  private readonly deps: ExecutionDeps;
  private readonly previews = new Map<string, { projectId: string; task: WorkbenchTask; preview: ExecutionPreview;
    carry?: { run_id: string; path: string; head: string; candidate: Awaited<ReturnType<typeof captureReviewCandidate>> } }>();
  private readonly starting = new Set<string>();
  constructor(registry: ProjectRegistry, deps: ExecutionDeps) { this.registry = registry; this.deps = deps; }
  assertIdle(projectId: string, taskId: string): void {
    if (this.starting.has(`${projectId}:${taskId}`)) throw new Error('正在准备执行，请等待准备完成');
  }

  private open(projectId: string) {
    const project = this.registry.get(projectId);
    if (!existsSync(project.database_path)) throw new Error(`database does not exist: ${project.database_path}`);
    const db = new DatabaseSync(project.database_path);
    try {
      const service = new RoomService(db);
      service.assertRoomParticipant(project.room_id, project.control_participant_id);
      return { project, db, service, store: new WorkbenchStore(db, project.room_id) };
    } catch (error) { db.close(); throw error; }
  }

  async preview(projectId: string, taskId: string): Promise<ExecutionPreview> {
    this.deps.assertPlanningIdle(projectId, taskId);
    const { project, db, service, store } = this.open(projectId);
    try {
      const task = store.validateDiscussion(taskId);
      const existingRun = task.run_id ? service.getRun(task.run_id) : null;
      const sourceRun = this.scopeChangeSource(service, task);
      if (task.run_id) {
        if (sourceRun) { /* The revised proposal creates a separate Run. */ }
        else if (existingRun?.status === 'review_discussion') this.repairBasis(service, task);
        else if (!existingRun || existingRun.status !== 'ready' || existingRun.worktree_path) throw new Error('任务已经准备执行，请在执行页继续');
      }
      if (!task.proposal || !task.proposal_details) throw new Error('请先补全方案、影响范围与验收条件');
      if (task.mode === 'sdd') assertSddReady(task.proposal_details.sdd);
      if (task.verification === 'tdd' && !task.proposal_details.verification.length) throw new Error('测试驱动任务需要明确验证命令');
      for (const path of task.proposal_details.scope) validateWriteScope({ path, kind: 'tree' });
      const assignment = service.resolveAssignment(project.room_id, 'room', null, 'worker');
      const worker = existingRun && !sourceRun ? service.getParticipant(existingRun.worker_participant_id) : assignment && service.getParticipant(assignment.participant_id);
      if (!worker || worker.adapter_id !== 'claude_code_cli') throw new Error('当前执行器仅支持已配置的 Claude Code CLI');
      if (this.deps.checkRunner) await this.deps.checkRunner();
      else await promisify(execFile)('claude', ['--version'], { windowsHide: true, timeout: 10000 });
      const sourcePath = sourceRun?.worktree_path ?? existingRun?.worktree_path ?? project.project_path;
      const observation = await observeContinuation(sourcePath);
      const source = (await runGit('branch', ['--show-current'], sourcePath)).toString('utf8').trim() || 'HEAD';
      const suffix = sourceRun ? `${task.id}-v${task.proposal_version}` : task.id;
      const branch = sourceRun ? `room/task-${suffix}` : existingRun?.worktree_path ? source : `room/task-${suffix}`;
      const worktree = sourceRun ? join(dirname(project.project_path), '.room-worktrees', basename(project.project_path), suffix)
        : existingRun?.worktree_path ?? join(dirname(observation.repositoryRoot), '.room-worktrees', basename(observation.repositoryRoot), suffix);
      const carry = sourceRun ? { run_id: sourceRun.run_id, path: sourcePath,
        head: (await runGit('rev-parse', ['HEAD'], sourcePath)).toString('utf8').trim(), candidate: await captureReviewCandidate(sourcePath) } : undefined;
      if (carry?.candidate.files.some((file) => !task.proposal_details!.scope.some((path) => path === '.' || scopeContainsPath({ path, kind: 'tree' }, file.path)))) throw new Error('新方案范围必须包含将保留的已有改动');
      const preview: ExecutionPreview = {
        preview_id: randomUUID(), task_id: task.id, proposal_version: task.proposal_version, goal: task.goal,
        scope: task.proposal_details.scope, acceptance_criteria: task.proposal_details.acceptance_criteria,
        verification: task.proposal_details.verification.map((step) => step.command), verification_mode: task.verification,
        worker: worker.display_name, worktree_path: worktree, branch, source_ref: carry?.head ?? source,
        original_changes: [...new Set([...observation.evidence.staged, ...observation.evidence.unstaged, ...observation.evidence.untracked])],
        git_operations: [sourceRun ? '创建修订后的独立分支和执行目录，并复制下列已有改动；旧目录保留'
          : existingRun?.worktree_path ? '在原任务目录执行已确认修复；保留现有改动' : '创建独立执行分支和 worktree；不自动提交或集成代码'],
        ...(carry ? { carried_changes: carry.candidate.files.map((file) => file.path) } : {}),
      };
      this.previews.set(preview.preview_id, { projectId, task, preview, carry });
      return preview;
    } finally { db.close(); }
  }

  async start(projectId: string, taskId: string, input: unknown): Promise<unknown> {
    const parsed = z.object({ preview_id: z.string().min(1), confirmed_by_user: z.literal(true) }).strict().parse(input);
    const cached = this.previews.get(parsed.preview_id);
    if (!cached || cached.projectId !== projectId || cached.task.id !== taskId) throw new Error('执行预览已失效，请重新检查');
    const key = `${projectId}:${taskId}`;
    if (this.starting.has(key)) throw new Error('正在准备此任务，请勿重复启动');
    this.deps.assertPlanningIdle(projectId, taskId);
    const { project, db, service, store } = this.open(projectId);
    this.starting.add(key);
    try {
      const task = store.get(taskId);
      const background = task.proposal + (task.proposal_details?.sdd ? `\n\nSDD specification, design and implementation tasks:\n${JSON.stringify(task.proposal_details.sdd, null, 2)}` : '');
      if (JSON.stringify(task) !== JSON.stringify(cached.task)) throw new Error('任务或方案已改变，请重新检查并确认');
      const sourceRun = this.scopeChangeSource(service, task);
      if (cached.carry) {
        if (!sourceRun || sourceRun.run_id !== cached.carry.run_id ||
          (await runGit('rev-parse', ['HEAD'], cached.carry.path)).toString('utf8').trim() !== cached.carry.head ||
          JSON.stringify(await captureReviewCandidate(cached.carry.path)) !== JSON.stringify(cached.carry.candidate)) throw new Error('已有改动发生变化，请重新检查并确认带入内容');
      }
      if (task.run_id && service.getRun(task.run_id)?.status === 'review_discussion') {
        const review = this.repairBasis(service, task);
        const parent = service.latestTaskForRun(task.run_id)!;
        const details = task.proposal_details!;
        const fixId = `fix-${task.id}-v${task.proposal_version}`;
        service.submitTask({ ...details, task_id: fixId, room_id: project.room_id, run_id: task.run_id,
          type: 'fix', parent_task_id: parent.task_id, based_on_review_id: review.review_id,
          background, goal: task.goal, scope: [...details.scope, 'review_fixes_only'],
          constraints: [...parent.constraints, ...details.constraints], confirmed_findings: details.proposed_fixes,
          confirmed_by_user: true, created_by: 'codex', created_at: new Date().toISOString() },
        { participant_id: project.control_participant_id, actor_role: 'planner' });
        store.update(taskId, { task_id: fixId, approved_version: task.proposal_version });
        this.previews.delete(parsed.preview_id);
        return await this.deps.launch(projectId, task.run_id);
      }
      if (task.run_id) {
        const run = service.getRun(task.run_id);
        if (!sourceRun && (!run || run.status !== 'ready' || run.worktree_path)) throw new Error('任务已启动，请从执行页查看当前状态');
      }
      const { preview } = cached;
      const planId = `plan-${task.id}-v${task.proposal_version}`;
      const revisionId = `revision-${task.id}-v${task.proposal_version}`;
      const nodeId = `node-${task.id}`;
      const suffix = sourceRun ? `${task.id}-v${task.proposal_version}` : task.id;
      const runId = `run-${suffix}`;
      const roomTaskId = `task-${suffix}`;
      const created = task.updated_at;
      const planner: EventActor = { participant_id: project.control_participant_id, actor_role: 'planner' };
      const orchestrator: EventActor = { ...planner, actor_role: 'orchestrator' };
      const worker = service.resolveAssignment(project.room_id, 'room', null, 'worker');
      if (!worker) throw new Error('当前项目没有执行 Agent');
      const details = task.proposal_details!;
      if (!task.run_id || (sourceRun && !task.carry_from_run_id)) {
      service.createPlan({ plan_id: planId, room_id: project.room_id, created_by_participant_id: planner.participant_id, created_at: created }, planner);
      const revision: TaskGraphRevision = {
        revision_id: revisionId, plan_id: planId, room_id: project.room_id, revision_no: 1, supersedes_revision_id: null,
        concurrency_limit: 1, acceptance_policy: 'integration_only', created_by_participant_id: planner.participant_id, created_at: created,
        // One deliverable node uses the existing commit and fast-forward gates.
        nodes: [{ node_id: nodeId, kind: 'integration', dependencies: [], worker_assignment_id: worker.assignment_id, priority: 0,
          write_scopes: details.scope.map((path) => ({ path, kind: 'tree' })),
          task_spec: { ...details, task_id: roomTaskId, run_id: runId, room_id: project.room_id, type: 'implementation',
            parent_task_id: null, based_on_review_id: null, background, goal: task.goal,
            constraints: [...details.constraints, 'Do not stage, commit, push, reset or clean; preserve changes for user review.',
              'Run approved verification commands via mcp__agent_room__room_run_verification using the dispatch room_id, run_id and attempt_id, zero-based command_index, intended stage and expected behavior. This records actual command evidence. Do not substitute self-reported command success.',
              ...(task.verification === 'tdd' ? ['Use actual Red then Green test commands. Environment failures are not Red. Preserve command/output evidence; refactor only when needed.'] : [])],
            created_by: 'codex', created_at: created },
        }],
      };
      service.createPlanRevision(revision, planner);
      const approvalId = `approval-${revisionId}`;
      if (!service.getApproval(approvalId)) {
        this.prepareConfirmation(service, project, planner);
        service.decidePlanRevision({ approval_id: approvalId, room_id: project.room_id, target_type: 'task_graph_revision', target_id: revisionId,
          decision: 'approved', confirmed_by_user: true, planner_participant_id: planner.participant_id, created_at: created }, planner);
      }
      await new PlanScheduler(service).reconcile({ room_id: project.room_id, plan_id: planId,
        worktrees: [{ node_id: nodeId, dispatch_id: `dispatch-${suffix}`, worktree_path: null }] }, orchestrator);
      // Record the Room references before external Git/process actions, allowing recovery from their failure.
      store.update(taskId, { plan_id: planId, task_id: roomTaskId, run_id: runId, approved_version: task.proposal_version,
        ...(sourceRun ? { carry_from_run_id: sourceRun.run_id, prior_run_ids: [...new Set([...(task.prior_run_ids ?? []), sourceRun.run_id])] } : {}) });
      }
      const controllerAssignment = service.resolveAssignment(project.room_id, 'room', null, 'git_controller');
      if (!controllerAssignment) throw new Error('当前项目没有 Git Controller');
      const controllerActor: EventActor = { participant_id: controllerAssignment.participant_id, actor_role: 'git_controller' };
      const controller = new GitController(service);
      const actionId = `worktree-${preview.preview_id}`;
      if (!service.getRun(runId)?.worktree_path) {
      await controller.preview({ git_action_id: actionId, room_id: project.room_id, revision_id: revisionId, node_id: nodeId,
        operation: 'create_worktree', repository_root: project.project_path, source_ref: preview.source_ref,
        new_branch: preview.branch, worktree_path: preview.worktree_path }, controllerActor);
      service.decideGitAction({ approval_id: `approval-${actionId}`, room_id: project.room_id, target_type: 'git_action_preview', target_id: actionId,
        decision: 'approved', confirmed_by_user: true, planner_participant_id: planner.participant_id, created_at: new Date().toISOString() }, planner);
      const action = await controller.execute(actionId, controllerActor);
      if (action.status !== 'succeeded') throw new Error(action.result?.message ?? '无法创建执行目录');
      }
      if (cached.carry) {
        if ((await runGit('rev-parse', ['HEAD'], preview.worktree_path)).toString('utf8').trim() !== cached.carry.head) throw new Error('新目录基线与确认的已有改动不匹配，请检查源分支');
        for (const file of cached.carry.candidate.files) {
          validateWriteScope({ path: file.path, kind: 'file' });
          const target = join(preview.worktree_path, file.path);
          if (file.content === null) rmSync(target, { force: true });
          else { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, Buffer.from(file.content, 'base64')); }
        }
        store.update(taskId, { carry_from_run_id: null, proposal_question_id: null,
          approved_initial_worktree: { run_id: runId, worktree_path: preview.worktree_path, head: cached.carry.head, files: cached.carry.candidate.files } });
      }
      this.previews.delete(parsed.preview_id);
      return await this.deps.launch(projectId, runId);
    } finally { db.close(); this.starting.delete(key); }
  }

  private scopeChangeSource(service: RoomService, task: WorkbenchTask) {
    if (!task.proposal_question_id) return null;
    const sourceId = task.carry_from_run_id ?? task.run_id;
    const run = sourceId ? service.getRun(sourceId) : null;
    const question = service.listQuestions(task.room_id).filter((item) => item.run_id === sourceId).at(-1);
    if (!run || run.status !== 'needs_decision' || !run.worktree_path || question?.question_id !== task.proposal_question_id || question.status !== 'answered' || !question.answer_changes_contract) throw new Error('范围修订的 Question 已变化，请重新确认方案');
    return run;
  }

  private repairBasis(service: RoomService, task: WorkbenchTask) {
    const review = service.latestReviewForRun(task.run_id!);
    if (!review || review.review_id !== task.proposal_review_id) throw new Error('Review 已更新，请重新生成并确认修复方案');
    const fixes = task.proposal_details?.proposed_fixes;
    if (!fixes?.length || fixes.some((fix) => !review.findings.some((finding) => finding.finding_id === fix.finding_id))) throw new Error('修复方案需要明确当前 Review findings 及对应解决方案');
    const dispatch = service.listNodeDispatches(task.room_id).find((item) => item.run_id === task.run_id);
    if (dispatch) {
      const revision = service.getTaskGraphRevision(dispatch.revision_id)!;
      const node = revision.nodes.find((item) => item.node_id === dispatch.node_id)!;
      if (task.proposal_details!.scope.some((path) => !node.write_scopes.some((scope) => scope.path === '.' || scopeContainsPath(scope, path)))) throw new Error('修复范围超出已确认节点，请先修订任务范围');
    }
    return review;
  }

  private prepareConfirmation(service: RoomService, project: UiProject, planner: EventActor): void {
    const room = service.getRoom(project.room_id)!;
    if (room.state === 'DISCUSSION') service.transitionToArchitectureReview(project.room_id, planner);
    if (service.getRoom(project.room_id)!.state === 'ARCHITECTURE_REVIEW') service.transitionToWaitingForUserConfirmation(project.room_id, planner);
  }

  read(projectId: string, taskId: string): unknown {
    const { project, db, service, store } = this.open(projectId);
    try {
      const task = store.get(taskId);
      const run = task.run_id ? service.getRun(task.run_id) : null;
      if (!run) return { run: null, attempts: [], question: null, reviews: [], events: [], logs: [] };
      const attempts = service.listAttemptsByRun(run.run_id);
      const latest = attempts.at(-1);
      const logRefs = latest?.artifact_refs ?? [];
      const logs = logRefs.map((reference) => {
        const path = isAbsolute(reference) ? reference : resolve(run.worktree_path ?? project.project_path, reference);
        return { name: basename(reference), text: existsSync(path) ? readFileSync(path, 'utf8') : '日志文件已不存在' };
      });
      const ids = new Set([run.run_id, task.task_id, ...attempts.map((attempt) => attempt.attempt_id)]);
      const contract = service.latestTaskForRun(run.run_id);
      const currentAttempts = new Set(attempts.filter((attempt) => attempt.task_id === contract?.task_id).map((attempt) => attempt.attempt_id));
      const verification = new VerificationRunner(db, service).list(project.room_id, run.run_id);
      return { run, attempts, question: service.latestOpenQuestionForRun(run.run_id),
        scope_question: service.listQuestions(project.room_id).filter((item) => item.run_id === run.run_id && item.status === 'answered' && item.answer_changes_contract).at(-1) ?? null,
        prior_runs: (task.prior_run_ids ?? []).map((id) => ({ run: service.getRun(id), attempts: service.listAttemptsByRun(id) })),
        execution_observation: service.activeAttemptForRun(run.run_id)
          ? this.deps.isLaunchActive?.(projectId, run.run_id) ? 'owned_active' : 'unknown' : 'inactive',
        reviews: service.listReviews(project.room_id).filter((review) => review.run_id === run.run_id),
        events: service.listEvents(project.room_id).filter((event) => ids.has(event.entity_id)), logs,
        verification, verification_commands: contract?.verification ?? [],
        verification_current: verification.filter((item) => currentAttempts.has(item.attempt_id) && item.command === contract?.verification[item.command_index]?.command) };
    } finally { db.close(); }
  }

  async continue(projectId: string, taskId: string, input: unknown): Promise<unknown> {
    z.object({ confirmed_by_user: z.literal(true) }).strict().parse(input);
    const { project, db, service, store } = this.open(projectId);
    try {
      const task = store.get(taskId);
      store.assertEditable(task);
      const run = task.run_id ? service.getRun(task.run_id) : null;
      if (!run || !run.worktree_path) throw new Error('执行目录尚未准备完成，请查看准备错误');
      if (task.carry_from_run_id) throw new Error('已有改动尚未带入完成，请重新检查执行准备');
      if (service.activeAttemptForRun(run.run_id)) throw new Error('上一次执行尚未停止');
      if (run.status === 'failed' || run.status === 'canceled') service.retryRun(project.room_id, run.run_id, { participant_id: project.control_participant_id, actor_role: 'planner' });
      else if (run.status !== 'ready') throw new Error('请先处理此任务的待办事项');
      return await this.deps.launch(projectId, run.run_id);
    } finally { db.close(); }
  }

  async changes(projectId: string, taskId: string, file?: string): Promise<unknown> {
    const { db, service, store } = this.open(projectId);
    try {
      const task = store.get(taskId);
      const run = task.run_id ? service.getRun(task.run_id) : null;
      if (!run?.worktree_path) return { branch: null, worktree_path: null, files: [], file: null, diff: '' };
      const observation = await observeContinuation(run.worktree_path);
      const files = [...new Set([...observation.evidence.staged, ...observation.evidence.unstaged, ...observation.evidence.untracked])].sort();
      const selected = file ?? files[0] ?? null;
      if (selected && !files.includes(selected)) throw new Error('此文件不在当前任务变更中');
      const branch = (await runGit('branch', ['--show-current'], run.worktree_path)).toString('utf8').trim() ||
        (await runGit('rev-parse', ['--short', 'HEAD'], run.worktree_path)).toString('utf8').trim();
      let diff = '';
      if (selected) {
        if (observation.evidence.untracked.includes(selected)) {
          const content = readFileSync(join(run.worktree_path, selected));
          diff = content.includes(0) ? 'Binary file added' : `--- /dev/null\n+++ b/${selected}\n${content.toString('utf8').split(/\r?\n/).map((line) => `+${line}`).join('\n')}`;
        } else diff = (await runGit('diff', ['--no-ext-diff', '--no-color', 'HEAD', '--', selected], run.worktree_path)).toString('utf8');
      }
      return { branch, worktree_path: run.worktree_path, files, file: selected, diff };
    } finally { db.close(); }
  }
}
