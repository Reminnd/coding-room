import { useMemo, useState } from 'react';
import { api } from '../api';
import { Dag } from '../components/Dag';
import { ErrorNotice, Field, JsonView, Panel, SuccessNotice, type PageProps } from '../components/Primitives';
import type { Entity } from '../types';

function parseJson(text: string): unknown {
  return JSON.parse(text);
}

export function PlansPage({ projectId, snapshot, refresh }: PageProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Entity | null>(null);
  const [graphPlan, setGraphPlan] = useState('');
  const [planId, setPlanId] = useState('plan-ui');
  const [revision, setRevision] = useState({ planId: 'plan-ui', revisionId: 'revision-ui-1', revisionNo: 1, concurrency: 1, policy: 'per_task', supersedes: '' });
  const [nodesJson, setNodesJson] = useState('[\n  \n]');
  const [decision, setDecision] = useState({ approvalId: 'approval-ui-1', revisionId: 'revision-ui-1' });
  const [worktreesJson, setWorktreesJson] = useState('[]');
  const latestByPlan = useMemo(() => snapshot.task_graph_revisions.reduce<Record<string, Entity>>((result, item) => {
    const key = String(item.plan_id); const current = result[key];
    if (!current || Number(item.revision_no) > Number(current.revision_no)) result[key] = item;
    return result;
  }, {}), [snapshot.task_graph_revisions]);

  async function run(label: string, action: string, body: unknown) {
    setError(null); setSuccess(null);
    try { await api.action(projectId, action, typeof body === 'function' ? body() : body); setSuccess(`${label}已提交。`); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  return <div className="page-grid">
    <ErrorNotice error={error} /><SuccessNotice message={success} />
    <Panel title="Task DAG" className="span-all" aside={<select aria-label="DAG Plan" value={graphPlan || String(snapshot.plans[0]?.plan_id ?? '')} onChange={(event) => { setGraphPlan(event.target.value); setSelectedNode(null); }}>{snapshot.plans.map((plan) => <option key={String(plan.plan_id)} value={String(plan.plan_id)}>{String(plan.plan_id)}</option>)}</select>}>
      <Dag revisions={snapshot.task_graph_revisions.filter((item) => item.plan_id === (graphPlan || snapshot.plans[0]?.plan_id))} workItems={snapshot.graph_work_items} onSelect={setSelectedNode} />
      {selectedNode && <details open><summary>节点详情：{String(selectedNode.node_id)}</summary><div className="scope-details"><div><strong>Scope</strong><ul>{(((selectedNode.task_spec as Entity)?.scope as string[] | undefined) ?? []).map((item) => <li key={item}>{item}</li>)}</ul></div><div><strong>Acceptance criteria</strong><ul>{(((selectedNode.task_spec as Entity)?.acceptance_criteria as string[] | undefined) ?? []).map((item) => <li key={item}>{item}</li>)}</ul></div></div><JsonView value={selectedNode} /></details>}
    </Panel>
    <Panel title="创建 Plan">
      <form onSubmit={(event) => { event.preventDefault(); void run('Plan', 'create-plan', { plan_id: planId }); }}>
        <Field label="Plan ID"><input value={planId} onChange={(e) => setPlanId(e.target.value)} required /></Field>
        <button className="primary" type="submit">创建 Plan</button>
      </form>
      <div className="list compact top-gap">{snapshot.plans.map((plan) => <div className="list-row" key={String(plan.plan_id)}><strong>{String(plan.plan_id)}</strong><span>{latestByPlan[String(plan.plan_id)] ? `r${String(latestByPlan[String(plan.plan_id)].revision_no)}` : '无 revision'}</span></div>)}</div>
    </Panel>
    <Panel title="创建 TaskGraphRevision" className="span-2">
      <form onSubmit={(event) => { event.preventDefault(); void run('Revision', 'create-plan-revision', () => ({
        plan_id: revision.planId, revision_id: revision.revisionId, revision_no: revision.revisionNo,
        supersedes_revision_id: revision.supersedes || null, concurrency_limit: revision.concurrency,
        acceptance_policy: revision.policy, nodes: parseJson(nodesJson), created_at: new Date().toISOString(),
      })); }}>
        <div className="form-grid">
          <Field label="Plan ID"><input value={revision.planId} onChange={(e) => setRevision({ ...revision, planId: e.target.value })} required /></Field>
          <Field label="Revision ID"><input value={revision.revisionId} onChange={(e) => setRevision({ ...revision, revisionId: e.target.value })} required /></Field>
          <Field label="Revision No"><input type="number" min="1" value={revision.revisionNo} onChange={(e) => setRevision({ ...revision, revisionNo: Number(e.target.value) })} /></Field>
          <Field label="Supersedes"><input value={revision.supersedes} onChange={(e) => setRevision({ ...revision, supersedes: e.target.value })} placeholder="首版留空" /></Field>
          <Field label="Concurrency"><input type="number" min="1" max="3" value={revision.concurrency} onChange={(e) => setRevision({ ...revision, concurrency: Number(e.target.value) })} /></Field>
          <Field label="Acceptance policy"><select value={revision.policy} onChange={(e) => setRevision({ ...revision, policy: e.target.value })}><option value="per_task">per_task</option><option value="integration_only">integration_only</option></select></Field>
        </div>
        <Field label="Advanced JSON：nodes" hint="每个 node 包含 task_spec、dependencies、write_scopes、worker_assignment_id、priority。不会自动批准。"><textarea className="code-input tall" value={nodesJson} onChange={(e) => setNodesJson(e.target.value)} /></Field>
        <button className="primary" type="submit">保存 immutable revision</button>
      </form>
    </Panel>
    <Panel title="审批 Revision">
      <div className="form-stack">
        <Field label="Approval ID"><input value={decision.approvalId} onChange={(e) => setDecision({ ...decision, approvalId: e.target.value })} /></Field>
        <Field label="Revision ID"><input value={decision.revisionId} onChange={(e) => setDecision({ ...decision, revisionId: e.target.value })} /></Field>
        <div className="button-row"><button className="primary" onClick={() => void run('Revision approval', 'decide-plan-revision', { approval_id: decision.approvalId, revision_id: decision.revisionId, decision: 'approved', confirmed_by_user: true })}>明确批准</button><button onClick={() => void run('Revision rejection', 'decide-plan-revision', { approval_id: decision.approvalId, revision_id: decision.revisionId, decision: 'rejected', confirmed_by_user: true })}>拒绝</button></div>
      </div>
    </Panel>
    <Panel title="Reconcile Plan">
      <Field label="Plan ID"><input value={revision.planId} onChange={(e) => setRevision({ ...revision, planId: e.target.value })} /></Field>
      <Field label="Advanced JSON：worktree mappings"><textarea className="code-input" value={worktreesJson} onChange={(e) => setWorktreesJson(e.target.value)} /></Field>
      <button className="primary" onClick={() => void run('Plan reconcile', 'reconcile-plan', () => ({ plan_id: revision.planId, worktrees: parseJson(worktreesJson) }))}>执行一次 reconcile</button>
    </Panel>
  </div>;
}
