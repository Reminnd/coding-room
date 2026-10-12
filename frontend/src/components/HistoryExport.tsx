import { useState } from 'react';
import type { Snapshot } from '../types';
import { workbenchApi, type Source, type WorkbenchTask } from '../workbench-api';
import type { legacyTasks } from './LegacyTasks';
import { Modal } from './Modal';
import { ErrorNotice } from './Primitives';

export function HistoryExport({ projectId, tasks, legacy, sources, snapshot }: { projectId: string; tasks: WorkbenchTask[]; legacy: ReturnType<typeof legacyTasks>; sources: Source[]; snapshot: Snapshot | null }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = [...tasks.map((task) => ({ id: task.id, title: task.title || '未命名草稿' })), ...legacy.map(({ task }) => ({ id: `legacy:${task.run_id}`, title: String(task.goal) }))];
  async function download() {
    setBusy(true); setError(null);
    try {
      const records = await Promise.all(tasks.filter((task) => selected.includes(task.id)).map(async (task) => {
        const [proposal_versions, runtime] = await Promise.all([workbenchApi.versions(projectId, task.id), workbenchApi.runtime(projectId, task.id)]);
        return { task, proposal_versions, sources: sources.filter((source) => task.source_ids.includes(source.id)), run: runtime.run, prior_runs: runtime.prior_runs, attempts: runtime.attempts, reviews: runtime.reviews, question: runtime.question, verification: runtime.verification, log_references: runtime.logs.map((log) => log.name) };
      }));
      const oldRecords = legacy.filter(({ task }) => selected.includes(`legacy:${task.run_id}`)).map(({ task, run }) => ({
        run, tasks: snapshot?.tasks.filter((item) => item.run_id === task.run_id), attempts: snapshot?.attempts.filter((item) => item.run_id === task.run_id), questions: snapshot?.questions.filter((item) => item.run_id === task.run_id), reviews: snapshot?.reviews.filter((item) => item.run_id === task.run_id),
      }));
      const archive = { format: 'room-task-records-v1', exported_at: new Date().toISOString(), project_id: projectId, records, legacy_records: oldRecords };
      const url = URL.createObjectURL(new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `room-task-records-${new Date().toISOString().slice(0, 10)}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setOpen(false);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <><button disabled={!choices.length} onClick={() => { setSelected([]); setError(null); setOpen(true); }}>导出记录</button>{open && <Modal title="选择要导出的任务" onClose={() => { if (!busy) setOpen(false); }}><p>导出所选任务的方案版本、执行结果、测试证据、Review 和来源/日志引用（JSON）。不包含完整项目代码、日志文件或数据库备份。</p><ErrorNotice error={error} />{choices.map((item) => <label className="source-choice" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} />{item.title}</label>)}<footer className="editor-actions"><button disabled={busy} onClick={() => setOpen(false)}>取消</button><button className="primary" disabled={busy || !selected.length} onClick={() => void download()}>{busy ? '正在读取记录…' : '导出所选记录'}</button></footer></Modal>}</>;
}
