import type { PageProps } from '../components/Primitives';
import { Badge, Empty, Panel, statusTone } from '../components/Primitives';

export function OverviewPage({ snapshot }: PageProps) {
  const openQuestions = snapshot.questions.filter((question) => question.status === 'open');
  const reviewRuns = snapshot.runs.filter((run) => run.status === 'review_required' || run.status === 'review_discussion');
  const activeRuns = snapshot.runs.filter((run) => ['ready', 'running', 'cancel_requested'].includes(run.status));
  const pendingGit = snapshot.git_actions.filter((action) => !['succeeded', 'failed', 'outcome_unknown'].includes(String(action.status)));
  const actionable = [
    ...openQuestions.map((q) => ({ kind: 'Question', id: String(q.question_id), text: String(q.question) })),
    ...reviewRuns.map((r) => ({ kind: 'Review', id: r.run_id, text: `Run ${r.status}` })),
    ...pendingGit.map((g) => ({ kind: 'Git', id: String(g.git_action_id), text: `GitAction ${String(g.status)}` })),
  ];
  return <div className="page-grid">
    <div className="stat-grid span-all">
      <div className="stat"><span>Room</span><strong>{snapshot.room.state}</strong><small>等待 {snapshot.planning_waiting_actor ?? '—'}</small></div>
      <div className="stat"><span>Runs</span><strong>{snapshot.runs.length}</strong><small>{activeRuns.length} active / ready</small></div>
      <div className="stat"><span>Questions</span><strong>{openQuestions.length}</strong><small>待回答</small></div>
      <div className="stat"><span>Reviews</span><strong>{reviewRuns.length}</strong><small>待处理</small></div>
    </div>
    <Panel title="待处理事项" className="span-2">
      {actionable.length === 0 ? <Empty>没有待处理事项。状态来自当前 Room snapshot。</Empty> : <div className="list">{actionable.map((item) => <div className="list-row" key={`${item.kind}-${item.id}`}><Badge tone="warn">{item.kind}</Badge><div><strong>{item.id}</strong><p>{item.text}</p></div></div>)}</div>}
    </Panel>
    <Panel title="执行状态">
      {snapshot.run_work_items.length === 0 ? <Empty>尚无 Run。</Empty> : <div className="list compact">{snapshot.run_work_items.map((item) => <div className="list-row" key={item.run_id}><div><strong>{item.run_id}</strong><p>下一 actor：{item.waiting_actor ?? '无'}</p></div><Badge tone={statusTone(item.run_status)}>{item.run_status}</Badge></div>)}</div>}
    </Panel>
    <Panel title="计划状态">
      {snapshot.plan_work_items.length === 0 ? <Empty>尚无 Plan。</Empty> : <div className="list compact">{snapshot.plan_work_items.map((item) => <div className="list-row" key={String(item.plan_id)}><strong>{String(item.plan_id)}</strong><Badge tone={item.completed ? 'good' : 'info'}>{item.completed ? 'completed' : 'active'}</Badge></div>)}</div>}
    </Panel>
  </div>;
}
