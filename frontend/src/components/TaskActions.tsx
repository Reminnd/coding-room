import { useState } from 'react';
import { Modal } from './Modal';
import { ErrorNotice, Field } from './Primitives';
import { workbenchApi, type TaskAction, type WorkbenchTask } from '../workbench-api';

export function TaskActions({ projectId, task, accepted, onChanged, disabled = false }: { projectId: string; task: WorkbenchTask; accepted: boolean; onChanged: (task: WorkbenchTask, followup: boolean) => Promise<void>; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'rename' | 'cancel' | null>(null);
  const [title, setTitle] = useState(task.title);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function act(command: TaskAction) {
    setBusy(true); setError(null);
    try { const updated = await workbenchApi.manageTask(projectId, task.id, command); await onChanged(updated, command.action === 'followup'); setOpen(false); setDialog(null); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <div className="task-actions"><button disabled={disabled} title={disabled ? '请先保存或取消方案编辑' : '任务操作'} aria-label="任务操作" aria-expanded={open} onClick={() => setOpen(!open)}>•••</button>
    {open && <div className="task-action-list"><ErrorNotice error={error} />
      <button disabled={busy} onClick={() => { setTitle(task.title); setDialog('rename'); }}>重命名</button>
      <button disabled={busy} onClick={() => void act({ action: 'followup' })}>新建后续任务</button>
      <button disabled={busy} onClick={() => void act({ action: task.archived ? 'restore' : 'archive' })}>{task.archived ? '恢复到任务列表' : '归档任务'}</button>
      {!accepted && !task.cancelled && <button disabled={busy} onClick={() => setDialog('cancel')}>取消任务…</button>}
    </div>}
    {dialog && <Modal title={dialog === 'rename' ? '重命名任务' : '取消任务？'} onClose={() => setDialog(null)}><form onSubmit={(event) => { event.preventDefault(); void act(dialog === 'rename' ? { action: 'rename', title } : { action: 'cancel', confirmed_by_user: true }); }}>
      <ErrorNotice error={error} />{dialog === 'rename' ? <Field label="新任务标题"><input required value={title} onChange={(event) => setTitle(event.target.value)} /></Field> : <p>取消后保留代码、方案和执行记录，移至项目历史。活动执行必须先停止；继续需求时可新建后续任务。</p>}
      <footer className="editor-actions"><button type="button" disabled={busy} onClick={() => setDialog(null)}>返回</button><button className="primary push-right" disabled={busy || (dialog === 'rename' && !title.trim())}>{dialog === 'rename' ? '保存名称' : '确认取消任务'}</button></footer>
    </form></Modal>}
  </div>;
}
