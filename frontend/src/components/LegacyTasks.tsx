import type { Entity, Snapshot } from '../types';
import type { WorkbenchTask } from '../workbench-api';
import { formatTime } from './Primitives';

export function legacyTasks(snapshot: Snapshot | null, tasks: WorkbenchTask[], active: Set<string>) {
  const linked = new Set(tasks.flatMap((task) => [task.run_id, ...(task.prior_run_ids ?? [])]));
  const latest = new Map<string, Entity>();
  for (const task of snapshot?.tasks ?? []) {
    const runId = String(task.run_id);
    if (linked.has(runId)) continue;
    const previous = latest.get(runId);
    if (!previous || String(task.created_at) >= String(previous.created_at)) latest.set(runId, task);
  }
  return [...latest.values()].map((task) => {
    const run = snapshot?.runs.find((item) => item.run_id === task.run_id);
    const status = run && ['running', 'cancel_requested'].includes(run.status) && !active.has(run.run_id) ? '执行状态未知' :
      ({ ready: '待执行', running: '执行中', needs_decision: '待回答', review_required: '待审阅', review_discussion: '待验收', accepted: '已完成', failed: '执行失败', canceled: '已停止', interrupted: '已中断' } as Record<string, string>)[run?.status ?? ''] ?? '记录';
    return { task, run, status };
  });
}

function lines(value: unknown): string[] { return Array.isArray(value) ? value.map(String) : []; }

export function LegacyTasks({ entries, snapshot }: { entries: ReturnType<typeof legacyTasks>; snapshot: Snapshot | null }) {
  if (!entries.length || !snapshot) return null;
  return <section aria-label="既有 Room 任务"><h2>既有 Room 任务</h2><p className="muted">原入口创建的任务记录。此处只读，原执行入口与授权保持有效。</p>{entries.map(({ task, run, status }) => <details className="panel" key={String(task.run_id)}>
    <summary><strong>{String(task.goal)}</strong> · {status} · {formatTime(String(task.created_at))}</summary>
    <div className="panel-body"><p className="path-text">{run?.worktree_path ?? '尚未设置执行目录'}</p>
      {snapshot.tasks.filter((item) => item.run_id === task.run_id).map((record) => <section key={String(record.task_id)}>
        <h3>{record.type === 'fix' ? '修复任务' : '实施任务'} · {String(record.task_id)}</h3><p>{String(record.background ?? '')}</p>
        <h4>要求</h4><ul>{lines(record.requirements).map((line, index) => <li key={index}>{line}</li>)}</ul>
        <h4>范围</h4><p>{lines(record.scope).join('、')}</p>
        <h4>验收条件</h4><ul>{lines(record.acceptance_criteria).map((line, index) => <li key={index}>{line}</li>)}</ul>
      </section>)}
      {snapshot.questions.filter((item) => item.run_id === task.run_id).map((question, index) => <section key={index}><h3>执行问题</h3><p>{String(question.question)}</p><p>{question.answer ? String(question.answer) : '尚未回答'}</p></section>)}
      {snapshot.attempts.filter((item) => item.run_id === task.run_id).map((attempt, index) => <section key={index}><h3>执行记录 · {String(attempt.status)}</h3><p>{String((attempt.result as Entity | null)?.summary ?? '')}</p><p>{String((attempt.failure as Entity | null)?.message ?? '')}</p></section>)}
      {snapshot.reviews.filter((item) => item.run_id === task.run_id).map((review, index) => <section key={index}><h3>Review · {String(review.decision)}</h3><p>{String(review.verification_summary ?? '')}</p>{(review.findings as Entity[] ?? []).map((finding, index) => <p key={index}>{String(finding.severity)} · {String(finding.title)} · {String(finding.file)}:{String(finding.line ?? '')} — {String(finding.impact)}</p>)}</section>)}
    </div>
  </details>)}</section>;
}
