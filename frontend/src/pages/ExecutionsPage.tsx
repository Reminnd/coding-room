import { useState } from 'react';
import { api } from '../api';
import { Badge, ErrorNotice, Field, JsonView, Panel, SuccessNotice, formatTime, statusTone, type PageProps } from '../components/Primitives';

export function ExecutionsPage({ projectId, snapshot, refresh, launches }: PageProps & { launches: Array<Record<string, unknown>> }) {
  const [selected, setSelected] = useState<string | null>(snapshot.runs[0]?.run_id ?? null);
  const [guidance, setGuidance] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const run = snapshot.runs.find((item) => item.run_id === selected) ?? null;
  const item = snapshot.run_work_items.find((candidate) => candidate.run_id === selected);

  async function act(label: string, fn: () => Promise<unknown>) {
    setError(null); setSuccess(null);
    try { await fn(); setSuccess(`${label}已提交。`); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }
  const activeAttempt = run ? snapshot.attempts.find((attempt) => attempt.run_id === run.run_id && ['running', 'decision_requested', 'cancel_requested'].includes(String(attempt.status))) : null;
  const pendingLaunch = launches.some((launch) => launch.run_id === run?.run_id && ['starting', 'running'].includes(String(launch.status)));
  const canStart = run?.status === 'ready' && !activeAttempt && !pendingLaunch;
  const canRetry = run && ['failed', 'canceled'].includes(run.status);
  const canCancel = Boolean(activeAttempt);
  const canGuide = Boolean(run && !activeAttempt && run.status !== 'accepted');

  return <div className="split-view">
    <aside className="record-list" aria-label="Run 列表">{snapshot.runs.map((candidate) => <button className={candidate.run_id === selected ? 'selected' : ''} onClick={() => setSelected(candidate.run_id)} key={candidate.run_id}><span><strong>{candidate.run_id}</strong><small>{formatTime(candidate.updated_at)}</small></span><Badge tone={statusTone(candidate.status)}>{candidate.status}</Badge></button>)}</aside>
    <div className="page-grid execution-detail">
      <ErrorNotice error={error} /><SuccessNotice message={success} />
      {!run ? <Panel title="执行"><p className="muted">选择一个 Run。</p></Panel> : <>
        <Panel title={run.run_id} className="span-all" aside={<Badge tone={statusTone(run.status)}>{run.status}</Badge>}>
          <div className="meta-grid"><span>等待 actor<strong>{item?.waiting_actor ?? '—'}</strong></span><span>Task<strong>{item?.current_task_id ?? '—'}</strong></span><span>Attempt<strong>{item?.current_attempt_id ?? '—'}</strong></span><span>Worktree<strong>{run.worktree_path ?? '尚未冻结'}</strong></span></div>
          <div className="button-row top-gap">
            <button className="primary" disabled={!canStart} title={canStart ? '' : '仅 ready 且无 active attempt 时可启动'} onClick={() => void act('Run', () => api.startRun(projectId, { run_id: run.run_id }))}>启动 one-shot Run</button>
            <button disabled={!canRetry} title={canRetry ? '' : '仅 failed/canceled 可重试'} onClick={() => void act('Retry', () => api.action(projectId, 'retry-run', { run_id: run.run_id }))}>重试</button>
            <button className="danger" disabled={!canCancel} title={canCancel ? '' : '没有 active attempt'} onClick={() => void act('Cancel', () => api.action(projectId, 'cancel-run', { run_id: run.run_id, reason: '用户从 Room UI 请求取消', confirmed_by_user: true }))}>取消</button>
            <button onClick={() => void act('VS Code', () => api.openVscode(projectId, run.run_id))}>在 VS Code 打开</button>
          </div>
        </Panel>
        <Panel title="下一次 Attempt guidance">
          <Field label="Guidance" hint={canGuide ? '保存后由下一 attempt 恰好消费一次。' : 'active attempt 期间不可 live steer。'}><textarea value={guidance} onChange={(e) => setGuidance(e.target.value)} /></Field>
          <button disabled={!canGuide || !guidance.trim()} onClick={() => void act('Guidance', () => api.action(projectId, 'add-guidance', { guidance_id: `guidance-${crypto.randomUUID()}`, run_id: run.run_id, text: guidance }))}>保存 guidance</button>
        </Panel>
        <Panel title="Attempt / durable evidence" className="span-2"><JsonView value={snapshot.attempts.filter((attempt) => attempt.run_id === run.run_id)} /></Panel>
        <Panel title="UI launch 状态"><JsonView value={launches.filter((launch) => launch.run_id === run.run_id)} /></Panel>
      </>}
    </div>
  </div>;
}
