import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { GitController } from '../git/git-controller.ts';
import { observeContinuation } from '../git/git-observer.ts';
import { runGit } from '../git/git-process.ts';
import { RoomService } from '../room/room-service.ts';
import { VerificationRunner } from '../runner/verification.ts';
import type { EventActor } from '../protocol/schema.ts';
import type { ProjectRegistry } from './project-registry.ts';
import { WorkbenchStore } from './workbench-store.ts';
import { captureReviewCandidate } from './workbench-review.ts';

const intentSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('commit_paths'), commit_message: z.string().trim().min(1) }).strict(),
  z.object({ operation: z.literal('integrate_fast_forward'), target_worktree_path: z.string().min(1) }).strict(),
]);

export class WorkbenchDelivery {
  private readonly registry: ProjectRegistry;
  constructor(registry: ProjectRegistry) { this.registry = registry; }

  private open(projectId: string, taskId: string) {
    const project = this.registry.get(projectId);
    if (!existsSync(project.database_path)) throw new Error('项目数据库不存在');
    const db = new DatabaseSync(project.database_path);
    try {
      const service = new RoomService(db);
      service.assertRoomParticipant(project.room_id, project.control_participant_id);
      const store = new WorkbenchStore(db, project.room_id);
      const task = store.get(taskId);
      store.assertEditable(task);
      const run = task.run_id ? service.getRun(task.run_id) : null;
      if (!run?.worktree_path || run.status !== 'accepted') throw new Error('接受当前结果后才能交付代码');
      const dispatch = service.listNodeDispatches(project.room_id).find((item) => item.run_id === run.run_id);
      if (!dispatch) throw new Error('此历史任务没有 Git 交付 lineage');
      const controller = service.resolveAssignment(project.room_id, 'room', null, 'git_controller');
      if (!controller) throw new Error('项目没有 Git Controller');
      const actor: EventActor = { participant_id: controller.participant_id, actor_role: 'git_controller' };
      return { project, db, service, run, dispatch, actor };
    } catch (error) { db.close(); throw error; }
  }

  private async assertAcceptedCandidate(db: DatabaseSync, service: RoomService, runId: string, worktree: string) {
    const review = service.latestReviewForRun(runId);
    const row = review && db.prepare('SELECT content FROM workbench_review_candidates WHERE review_id=?').get(review.review_id);
    if (!row || JSON.stringify(JSON.parse(String(row.content)).candidate) !== JSON.stringify(await captureReviewCandidate(worktree))) {
      throw new Error('代码已不同于接受的候选，请对新增改动创建后续任务并审阅');
    }
    const task = service.latestTaskForRun(runId)!;
    const attempts = new Set(service.listAttemptsByRun(runId).filter((attempt) => attempt.task_id === task.task_id).map((attempt) => attempt.attempt_id));
    const evidence = new VerificationRunner(db, service).list(task.room_id, runId);
    for (const step of task.verification) {
      const latest = evidence.filter((item) => attempts.has(item.attempt_id) && item.command === step.command && item.command === task.verification[item.command_index]?.command).at(-1);
      if (!latest?.completed_at || latest.exit_code !== 0) throw new Error('当前验证尚未全部成功，不能提交代码');
    }
  }

  private async assertCommittedCandidate(service: RoomService, roomId: string, revisionId: string, nodeId: string, worktree: string) {
    const actions = service.listGitActions(roomId).filter((item) => item.revision_id === revisionId && item.node_id === nodeId);
    const commit = actions.filter((item) => item.preview.operation === 'commit_paths' && item.status === 'succeeded').at(-1);
    const current = (await runGit('rev-parse', ['HEAD'], worktree)).toString('utf8').trim();
    const observation = await observeContinuation(worktree);
    if (!commit || current !== commit.result?.resulting_commit_id || Object.values(observation.evidence).some((paths) => paths.length)) {
      throw new Error('集成需要当前任务已确认的提交，且执行目录没有后续改动');
    }
  }

  async preview(projectId: string, taskId: string, raw: unknown) {
    const input = intentSchema.parse(raw);
    const { project, db, service, run, dispatch, actor } = this.open(projectId, taskId);
    try {
      const worktree = run.worktree_path!;
      const branch = (await runGit('symbolic-ref', ['--short', 'HEAD'], worktree)).toString('utf8').trim();
      const common = { git_action_id: `delivery-${randomUUID()}`, room_id: project.room_id,
        revision_id: dispatch.revision_id, node_id: dispatch.node_id, repository_root: project.project_path };
      const controller = new GitController(service);
      if (input.operation === 'commit_paths') {
        await this.assertAcceptedCandidate(db, service, run.run_id, worktree);
        const observation = await observeContinuation(worktree);
        const paths = [...new Set([...observation.evidence.staged, ...observation.evidence.unstaged, ...observation.evidence.untracked])].sort();
        if (!paths.length) throw new Error('当前任务没有未提交改动');
        return await controller.preview({ ...common, operation: input.operation, worktree_path: worktree, branch, paths, commit_message: input.commit_message }, actor);
      }
      await this.assertCommittedCandidate(service, project.room_id, dispatch.revision_id, dispatch.node_id, worktree);
      const targetBranch = (await runGit('symbolic-ref', ['--short', 'HEAD'], input.target_worktree_path)).toString('utf8').trim();
      return await controller.preview({ ...common, operation: input.operation, source_branch: branch,
        target_branch: targetBranch, target_worktree_path: input.target_worktree_path }, actor);
    } finally { db.close(); }
  }

  async execute(projectId: string, taskId: string, raw: unknown) {
    const input = z.object({ git_action_id: z.string().min(1), confirmed_by_user: z.literal(true) }).strict().parse(raw);
    const { project, db, service, run, dispatch, actor } = this.open(projectId, taskId);
    try {
      const action = service.getGitAction(input.git_action_id);
      if (!action || action.room_id !== project.room_id || action.revision_id !== dispatch.revision_id || action.node_id !== dispatch.node_id) throw new Error('Git preview 不属于当前任务');
      if (action.preview.operation === 'commit_paths') await this.assertAcceptedCandidate(db, service, run.run_id, run.worktree_path!);
      else if (action.preview.operation === 'integrate_fast_forward') await this.assertCommittedCandidate(service, project.room_id, dispatch.revision_id, dispatch.node_id, run.worktree_path!);
      else throw new Error('交付只支持提交和 fast-forward');
      service.decideGitAction({ approval_id: `approval-${action.git_action_id}`, room_id: project.room_id,
        target_type: 'git_action_preview', target_id: action.git_action_id, decision: 'approved', confirmed_by_user: true,
        planner_participant_id: project.control_participant_id, created_at: new Date().toISOString() },
      { participant_id: project.control_participant_id, actor_role: 'planner' });
      return await new GitController(service).execute(action.git_action_id, actor);
    } finally { db.close(); }
  }
}
