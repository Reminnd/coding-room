import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { GitState } from '../types';
import { workbenchApi, type Changes, type DeliveryAction, type WorkbenchTask } from '../workbench-api';
import { ErrorNotice, Field } from './Primitives';
import { Modal } from './Modal';

export function DeliveryPanel({ projectId, task }: { projectId: string; task: WorkbenchTask }) {
  const [changes, setChanges] = useState<Changes | null>(null);
  const [git, setGit] = useState<GitState | null>(null);
  const [actions, setActions] = useState<DeliveryAction[]>([]);
  const [supported, setSupported] = useState(false);
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState('');
  const [form, setForm] = useState<'commit' | 'integrate' | null>(null);
  const [preview, setPreview] = useState<DeliveryAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [changes, git, snapshot] = await Promise.all([workbenchApi.changes(projectId, task.id), api.git(projectId), api.state(projectId)]);
    setChanges(changes); setGit(git);
    const dispatch = snapshot.node_dispatches.find((item) => item.run_id === task.run_id);
    const revision = snapshot.task_graph_revisions.find((item) => item.revision_id === dispatch?.revision_id);
    setSupported(!!dispatch && revision?.acceptance_policy === 'integration_only');
    setActions(snapshot.git_actions.filter((item) => item.node_id === dispatch?.node_id && item.revision_id === dispatch?.revision_id) as unknown as DeliveryAction[]);
  }, [projectId, task.id, task.run_id]);
  useEffect(() => { void load().catch((error: Error) => setError(error.message)); }, [load]);
  async function act(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); await load(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  const commit = actions.filter((item) => item.preview.operation === 'commit_paths' && item.status === 'succeeded').at(-1);
  const integrated = actions.filter((item) => item.preview.operation === 'integrate_fast_forward' && item.status === 'succeeded').at(-1);
  const targets = git?.worktrees.filter((item) => item.branch && item.path.toLowerCase() !== changes?.worktree_path?.toLowerCase()) ?? [];
  return <section className="panel"><header className="panel-head"><h2>代码交付</h2><button disabled={busy} onClick={() => void act(load)}>刷新 Git 状态</button></header><div className="panel-body"><ErrorNotice error={error} /><p>{changes?.files.length ? `${changes.files.length} 个文件尚未提交` : commit ? '当前目录没有未提交改动' : '当前目录没有待提交改动'}</p><p className="path-text">{changes?.branch} · {changes?.worktree_path}</p>{commit && <p className="path-text">本任务提交：{commit.result?.resulting_commit_id}</p>}{integrated && <p>已集成到 {integrated.preview.target_branch}</p>}<div className="editor-actions">{supported && !!changes?.files.length && <button onClick={() => { setPreview(null); setForm('commit'); }}>提交代码…</button>}{supported && commit && !changes?.files.length && !!targets.length && <button onClick={() => { setTarget(targets[0].path); setPreview(null); setForm('integrate'); }}>集成到目标分支…</button>}</div></div>
    {form && <Modal title={form === 'commit' ? '提交当前任务代码' : 'Fast-forward 集成'} onClose={() => { if (!busy) { setForm(null); setPreview(null); } }}><ErrorNotice error={error} />{!preview ? <>{form === 'commit' ? <Field label="Commit message"><input value={message} placeholder="feat(module): describe the change" onChange={(event) => setMessage(event.target.value)} /></Field> : <Field label="目标分支与实际目录"><select value={target} onChange={(event) => setTarget(event.target.value)}>{targets.map((item) => <option key={item.path} value={item.path}>{item.branch} · {item.path}</option>)}</select></Field>}<p className="muted">检查将生成具体 Git preview。确认后才执行。</p><footer className="editor-actions"><button onClick={() => setForm(null)} disabled={busy}>返回</button><button className="primary push-right" disabled={busy || (form === 'commit' ? !message.trim() : !target)} onClick={() => void act(async () => setPreview(await workbenchApi.deliveryPreview(projectId, task.id, form === 'commit' ? { operation: 'commit_paths', commit_message: message } : { operation: 'integrate_fast_forward', target_worktree_path: target })))}>检查并预览</button></footer></> : <><p className="path-text">{preview.preview.worktree_path ?? preview.preview.target_worktree_path}</p>{preview.preview.operation === 'commit_paths' ? <><p>分支：{preview.preview.branch}</p><p>{preview.preview.commit_message}</p><h3>本次提交文件</h3><ul>{preview.preview.paths?.map((path) => <li key={path}><code>{path}</code></li>)}</ul></> : <p>{preview.preview.source_branch} → {preview.preview.target_branch}（fast-forward）</p>}<footer className="editor-actions"><button disabled={busy} onClick={() => setPreview(null)}>返回修改</button><button className="primary push-right" disabled={busy} onClick={() => void act(async () => {
      const result = await workbenchApi.deliver(projectId, task.id, preview.git_action_id);
      if (result.status !== 'succeeded') throw new Error(result.result?.message ?? 'Git 操作未成功，请重新读取实际状态');
      setForm(null); setPreview(null);
    })}>{preview.preview.operation === 'commit_paths' ? '确认提交' : '确认集成'}</button></footer></>}</Modal>}
  </section>;
}
