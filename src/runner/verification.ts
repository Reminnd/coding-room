import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { RoomService } from '../room/room-service.ts';
import { DesktopProcesses } from '../ui/desktop-processes.ts';

export const verificationInputSchema = z.object({
  room_id: z.string().min(1), run_id: z.string().min(1), attempt_id: z.string().min(1),
  command_index: z.number().int().nonnegative(), stage: z.enum(['red', 'green', 'refactor', 'verification']),
  behavior: z.string().trim().min(1),
}).strict();
export type VerificationInput = z.infer<typeof verificationInputSchema>;
export interface VerificationEvidence extends VerificationInput {
  id: string; command: string; cwd: string; started_at: string; completed_at: string | null;
  exit_code: number | null; stdout: string; stderr: string; error: string | null;
}

export class VerificationRunner {
  private readonly db: DatabaseSync;
  private readonly service: RoomService;
  private readonly active = new Map<string, () => Promise<void>>();
  private readonly pending = new Set<Promise<VerificationEvidence>>();
  constructor(db: DatabaseSync, service: RoomService) {
    this.db = db; this.service = service;
    db.exec('CREATE TABLE IF NOT EXISTS verification_runs (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, run_id TEXT NOT NULL, content TEXT NOT NULL)');
  }
  list(roomId: string, runId: string): VerificationEvidence[] {
    return this.db.prepare('SELECT content FROM verification_runs WHERE room_id=? AND run_id=? ORDER BY rowid').all(roomId, runId).map((row) => JSON.parse(String(row.content)) as VerificationEvidence);
  }
  private save(evidence: VerificationEvidence): void {
    this.db.prepare('INSERT INTO verification_runs(id,room_id,run_id,content) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content').run(evidence.id, evidence.room_id, evidence.run_id, JSON.stringify(evidence));
  }
  recordInterrupted(roomId: string, runId: string, id: string): void {
    const record = this.list(roomId, runId).find((item) => item.id === id);
    if (!record || record.completed_at) return;
    this.save({ ...record, completed_at: new Date().toISOString(), exit_code: null, error: '原验证进程已停止，未获得完整退出结果；请重新运行此验证。' });
  }
  async run(participantId: string, raw: unknown): Promise<VerificationEvidence> {
    const input = verificationInputSchema.parse(raw);
    this.service.assertRoomParticipant(input.room_id, participantId);
    const attempt = this.service.getAttempt(input.attempt_id);
    if (!attempt || attempt.room_id !== input.room_id || attempt.run_id !== input.run_id || attempt.worker_participant_id !== participantId || attempt.status !== 'running') throw new Error('Verification requires the current running attempt and its assigned worker');
    const task = this.service.getTask(attempt.task_id)!;
    const step = task.verification[input.command_index];
    if (!step) throw new Error('Command is not in the approved task verification plan');
    return this.track(this.execute(input, step.command, attempt.worktree_path, () => this.service.getAttempt(input.attempt_id)?.status !== 'running'));
  }
  async runManual(participantId: string, raw: unknown): Promise<VerificationEvidence> {
    const input = z.object({ room_id: z.string().min(1), run_id: z.string().min(1), command_index: z.number().int().nonnegative() }).strict().parse(raw);
    this.service.assertRoomParticipant(input.room_id, participantId);
    const run = this.service.getRun(input.run_id);
    const task = run && this.service.latestTaskForRun(run.run_id);
    if (!run || run.room_id !== input.room_id || task?.planner_participant_id !== participantId) throw new Error('Manual verification requires the task planner');
    if (this.service.activeAttemptForRun(run.run_id)) throw new Error('Cannot run manual verification during an active attempt');
    const attempt = this.service.latestAttemptForRun(run.run_id);
    if (!attempt || !task || attempt.task_id !== task.task_id) throw new Error('Current task has not executed yet');
    const step = task.verification[input.command_index];
    if (!step) throw new Error('Command is not in the approved task verification plan');
    return this.track(this.execute({ ...input, attempt_id: attempt.attempt_id, stage: 'verification', behavior: step.detects }, step.command, attempt.worktree_path,
      () => !!this.service.activeAttemptForRun(run.run_id)));
  }
  private track(pending: Promise<VerificationEvidence>): Promise<VerificationEvidence> {
    this.pending.add(pending);
    void pending.then(() => this.pending.delete(pending), () => this.pending.delete(pending));
    return pending;
  }
  private async execute(input: VerificationInput, command: string, cwd: string, shouldStop: () => boolean): Promise<VerificationEvidence> {
    if (this.active.has(input.run_id)) throw new Error('This task already has a verification command running');
    const evidence: VerificationEvidence = { ...input, id: randomUUID(), command, cwd,
      started_at: new Date().toISOString(), completed_at: null, exit_code: null, stdout: '', stderr: '', error: null };
    this.save(evidence);
    const owners = new DesktopProcesses(this.db);
    owners.record(`verification:${evidence.id}`, input.room_id, input.run_id);
    const shell = process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : '/bin/sh';
    // The command is exact user-approved shell code from TaskContract.verification.
    const child = spawn(command, { shell, cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    owners.record(`verification:${evidence.id}`, input.room_id, input.run_id, child.pid ?? null);
    let stopPending: Promise<void> | null = null;
    let stopFailed = false;
    const stop = (): Promise<void> => {
      if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
      if (stopPending) return stopPending;
      stopPending = (async () => {
        if (process.platform === 'win32' && child.pid) await promisify(execFile)('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
        else if (!child.kill()) throw new Error('Process termination request failed');
      })().catch((error: Error) => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        stopFailed = true; stopPending = null;
        evidence.error = `无法停止验证进程：${error.message}`;
        this.save(evidence);
        throw new Error(evidence.error);
      });
      return stopPending;
    };
    this.active.set(input.run_id, stop);
    child.stdout.on('data', (chunk) => { evidence.stdout += String(chunk); this.save(evidence); });
    child.stderr.on('data', (chunk) => { evidence.stderr += String(chunk); this.save(evidence); });
    const poll = setInterval(() => {
      if (!stopFailed && shouldStop()) void stop().catch(() => {});
    }, 250);
    try {
      await new Promise<void>((resolve) => {
        child.once('error', (error) => { evidence.error = error.message; });
        child.once('close', (code) => { evidence.exit_code = code; resolve(); });
      });
      evidence.completed_at = new Date().toISOString();
      this.save(evidence);
      return evidence;
    } finally { clearInterval(poll); this.active.delete(input.run_id); }
  }
  async stop(): Promise<void> { await Promise.all([...this.active.values()].map((stop) => stop())); }
  isActive(runId: string): boolean { return this.active.has(runId); }
  activeRunIds(): string[] { return [...this.active.keys()]; }
  async close(): Promise<void> { await this.stop(); await Promise.allSettled([...this.pending]); }
}
