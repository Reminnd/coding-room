import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { collectCompletionEvidence } from '../git/git-observer.ts';
import { RoomService } from '../room/room-service.ts';
import { ClaudeStreamInterpreter, REQUIRED_ROOM_TOOL_NAME } from '../runner/claude-stream.ts';
import { VerificationRunner } from '../runner/verification.ts';
import { DesktopProcesses, liveOwnedProcesses, readProcessTable, type ProcessEntry, type ProcessOwner } from './desktop-processes.ts';
import type { ProjectRegistry } from './project-registry.ts';
import { WorkbenchStore } from './workbench-store.ts';

export interface RecoveryObservation {
  state: 'unknown' | 'running' | 'stopped' | 'inactive'; message: string;
  live_pids: number[]; worktree_path: string | null; attempt_id: string | null; verification_ids: string[];
}

export class WorkbenchRecovery {
  private readonly registry: ProjectRegistry;
  private readonly readProcesses: () => Promise<ProcessEntry[]>;
  constructor(registry: ProjectRegistry, readProcesses = readProcessTable) { this.registry = registry; this.readProcesses = readProcesses; }
  private open(projectId: string, taskId: string) {
    const project = this.registry.get(projectId);
    if (!existsSync(project.database_path)) throw new Error('项目数据库不存在');
    const db = new DatabaseSync(project.database_path);
    try {
      const service = new RoomService(db);
      service.assertRoomParticipant(project.room_id, project.control_participant_id);
      const store = new WorkbenchStore(db, project.room_id);
      const task = store.get(taskId);
      return { project, db, service, store, task };
    } catch (error) { db.close(); throw error; }
  }
  async inspect(projectId: string, taskId: string): Promise<RecoveryObservation> {
    const { project, db, service, task } = this.open(projectId, taskId);
    try {
      const run = task.run_id ? service.getRun(task.run_id) : null;
      const attempt = run && service.activeAttemptForRun(run.run_id);
      const pending = run ? new VerificationRunner(db, service).list(project.room_id, run.run_id).filter((item) => !item.completed_at) : [];
      const result: RecoveryObservation = { state: 'inactive', message: '没有需要恢复的活动记录', live_pids: [], worktree_path: run?.worktree_path ?? null,
        attempt_id: attempt?.attempt_id ?? null, verification_ids: pending.map((item) => item.id) };
      if (!attempt && !pending.length) return result;
      const records = new DesktopProcesses(db);
      const owners = [...(attempt ? [`attempt:${attempt.attempt_id}`] : []), ...pending.map((item) => `verification:${item.id}`)].map((id) => records.get(id, project.room_id));
      if (owners.some((owner) => !owner)) return { ...result, state: 'unknown', message: '旧记录没有桌面进程归属，无法自动确认停止。请保留目录和记录，检查原执行入口。' };
      try {
        const alive = liveOwnedProcesses(owners as ProcessOwner[], await this.readProcesses());
        if (alive.length) return { ...result, state: 'running', live_pids: alive, message: '旧服务或相关进程仍在运行，请在原执行入口停止后重新检查。不会启动第二份执行。' };
        return { ...result, state: 'stopped', message: '已确认旧服务及记录关联的执行进程不存在，可保留改动并结束遗留记录。' };
      } catch (error) { return { ...result, state: 'unknown', message: `无法读取系统进程：${error instanceof Error ? error.message : String(error)}` }; }
    } finally { db.close(); }
  }
  async recover(projectId: string, taskId: string, raw: unknown): Promise<RecoveryObservation> {
    z.object({ confirmed_by_user: z.literal(true) }).strict().parse(raw);
    const observation = await this.inspect(projectId, taskId);
    if (observation.state !== 'stopped') throw new Error(observation.message);
    const { project, db, service, store, task } = this.open(projectId, taskId);
    try {
      store.assertEditable(task);
      const attempt = observation.attempt_id ? service.getAttempt(observation.attempt_id) : null;
      if (attempt && task.run_id !== attempt.run_id) throw new Error('任务执行引用已改变，请重新检查');
      if (attempt && service.activeAttemptForRun(attempt.run_id)?.attempt_id === attempt.attempt_id) {
        const logs = join(dirname(project.database_path), 'artifacts', attempt.attempt_id);
        const refs = ['stdout.jsonl', 'stderr.log'].map((name) => join(logs, name)).filter(existsSync);
        const priorSession = service.listAttemptsByRun(attempt.run_id).filter((item) => item.attempt_no < attempt.attempt_no && item.agent_session_ref).at(-1)?.agent_session_ref ?? null;
        const interpreter = new ClaudeStreamInterpreter({ expectedTaskId: attempt.task_id, requiredToolName: REQUIRED_ROOM_TOOL_NAME, expectedSessionId: priorSession });
        const stdout = join(logs, 'stdout.jsonl');
        if (existsSync(stdout)) for (const line of readFileSync(stdout, 'utf8').split(/\r?\n/)) interpreter.acceptLine(line);
        const session = interpreter.finish().sessionId ?? priorSession;
        const evidence = await collectCompletionEvidence(attempt.worktree_path);
        service.settleRunAttempt({ attempt_id: attempt.attempt_id,
          status: attempt.status === 'decision_requested' ? 'needs_decision' : 'interrupted', result: null,
          failure: { code: 'desktop_executor_stopped', message: '系统进程检查确认旧桌面执行器及记录关联的进程已停止；保留代码和已观察日志，未获得完整退出结果。' },
          agent_session_ref: session, process_exit_code: null, git_evidence: evidence, artifact_refs: refs },
        { participant_id: attempt.executor_participant_id, actor_role: 'executor' });
      }
      const verifier = new VerificationRunner(db, service);
      for (const id of observation.verification_ids) verifier.recordInterrupted(project.room_id, task.run_id!, id);
      return { ...observation, state: 'inactive', message: '遗留记录已结束，代码与证据已保留。请核对工作区后继续任务。' };
    } finally { db.close(); }
  }
}
