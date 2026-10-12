import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DatabaseSync } from 'node:sqlite';

export interface ProcessEntry { pid: number; parent_pid: number }
export interface ProcessOwner { id: string; room_id: string; run_id: string; owner_pid: number; child_pid: number | null }

export async function readProcessTable(): Promise<ProcessEntry[]> {
  if (process.platform !== 'win32') throw new Error('桌面进程恢复目前仅支持 Windows');
  const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress'],
  { windowsHide: true, timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
  const entries = JSON.parse(stdout);
  return (Array.isArray(entries) ? entries : [entries]).map((entry) => ({ pid: Number(entry.ProcessId), parent_pid: Number(entry.ParentProcessId) }));
}

export function liveOwnedProcesses(owners: ProcessOwner[], processes: ProcessEntry[]): number[] {
  const roots = new Set(owners.flatMap((owner) => [owner.owner_pid, ...(owner.child_pid ? [owner.child_pid] : [])]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of processes) if (roots.has(entry.parent_pid) && !roots.has(entry.pid)) { roots.add(entry.pid); changed = true; }
  }
  return processes.filter((entry) => roots.has(entry.pid)).map((entry) => entry.pid);
}

export class DesktopProcesses {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec('CREATE TABLE IF NOT EXISTS desktop_processes (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, content TEXT NOT NULL)');
  }
  record(id: string, roomId: string, runId: string, childPid: number | null = null): void {
    const record: ProcessOwner = { id, room_id: roomId, run_id: runId, owner_pid: process.pid, child_pid: childPid };
    this.db.prepare('INSERT INTO desktop_processes(id,room_id,content) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content').run(id, roomId, JSON.stringify(record));
  }
  get(id: string, roomId: string): ProcessOwner | null {
    const row = this.db.prepare('SELECT content FROM desktop_processes WHERE id=? AND room_id=?').get(id, roomId);
    return row ? JSON.parse(String(row.content)) as ProcessOwner : null;
  }
}
