import { useState } from 'react';
import { ErrorNotice, Field } from './Primitives';
import { Modal } from './Modal';
import { SddPlan } from './SddPlan';
import { workbenchApi, type WorkbenchTask, type ProposalVersion, type ExecutionPreview } from '../workbench-api';

export function PlanPanel({ projectId, task, refresh, discuss, onExecuted, onDirty, requestLeave }: { projectId: string; task: WorkbenchTask; refresh: () => Promise<void>; discuss: () => void; onExecuted: () => void; onDirty: (save: (() => Promise<void>) | null) => void; requestLeave: (action: () => void) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.proposal);
  const [details, setDetails] = useState(task.proposal_details);
  const [versions, setVersions] = useState<ProposalVersion[] | null>(null);
  const [selectedVersion, setSelectedVersion] = useState(0);
  const [operating, setBusy] = useState(false);
  const readOnly = task.archived || task.cancelled;
  const busy = operating || readOnly;
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExecutionPreview | null>(null);
  async function switchToSdd() {
    setBusy(true); setError(null);
    try { await workbenchApi.manageTask(projectId, task.id, { action: 'switch_sdd' }); await refresh(); discuss(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  async function checkExecution() {
    setBusy(true); setError(null);
    try { setPreview(await workbenchApi.checkExecution(projectId, task.id)); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  async function execute() {
    if (!preview) return;
    setBusy(true); setError(null);
    try { await workbenchApi.execute(projectId, task.id, preview.preview_id); await refresh(); setPreview(null); onExecuted(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); await refresh(); }
    finally { setBusy(false); }
  }
  async function save(value = text, proposalDetails = details) {
    setBusy(true); setError(null);
    try {
      await workbenchApi.saveProposal(projectId, task.id, { text: value, details: proposalDetails, expected_version: task.proposal_version });
      await refresh(); setEditing(false); onDirty(null);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); throw error; }
    finally { setBusy(false); }
  }
  function edit(value: string, proposalDetails = details) {
    setText(value); setDetails(proposalDetails);
    onDirty(() => save(value, proposalDetails));
  }
  async function history() {
    try { setVersions(await workbenchApi.versions(projectId, task.id)); setSelectedVersion(0); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  }
  const current = versions?.[selectedVersion];
  const sdd = task.proposal_details?.sdd;
  const blockedReason = !task.proposal_details ? '请先补全方案、影响范围与验收条件。'
    : task.verification === 'tdd' && !task.proposal_details.verification.length ? '测试驱动任务需要明确验证命令。'
    : task.mode === 'sdd' && (!sdd?.specification.trim() || !sdd.technical_design.trim() || !sdd.tasks.length) ? '请先补全 SDD 规格、技术设计和实施任务。' : null;
  const pendingRepair = (!!task.proposal_review_id || !!task.proposal_question_id) && task.approved_version !== task.proposal_version;
  return <section><header className="page-heading"><h2>方案 · v{task.proposal_version}</h2><div className="inline-options"><span className="badge">{task.approved_version === task.proposal_version && task.proposal_version > 0 ? '已确认' : '草稿'}</span>{task.proposal && <button onClick={() => void history()}>查看版本差异</button>}{task.proposal && (!task.run_id || pendingRepair) && !editing && !readOnly && <button onClick={() => { setText(task.proposal); setDetails(task.proposal_details); setEditing(true); }}>编辑</button>}</div></header><ErrorNotice error={error} />
    {task.mode === 'task' && !task.run_id && !editing && !readOnly && <button disabled={busy} onClick={() => void switchToSdd()}>切换为 SDD</button>}
    {task.proposal_details?.proposed_fixes?.length ? <section className="proposal-criteria"><h3>本轮修复</h3>{task.proposal_details.proposed_fixes.map((fix) => <article key={fix.finding_id}><strong>{fix.finding_id}</strong><p>{fix.solution}</p></article>)}</section> : null}
    {editing ? <form onSubmit={(event) => { event.preventDefault(); void save().catch(() => {}); }}><>{task.mode === "sdd" && details && <SddPlan value={details.sdd} onChange={(sdd) => edit(text, { ...details, sdd })} />}</><Field label="方案内容"><textarea aria-label="方案内容" rows={16} required value={text} onChange={(event) => edit(event.target.value)} /></Field>{details && <><Field label="影响范围（每行一个项目路径）"><textarea aria-label="影响范围（每行一个项目路径）" rows={3} value={details.scope.join('\n')} onChange={(event) => edit(text, { ...details, scope: event.target.value.split('\n') })} /></Field><Field label="验收条件（每行一项）"><textarea aria-label="验收条件（每行一项）" rows={4} value={details.acceptance_criteria.join('\n')} onChange={(event) => edit(text, { ...details, acceptance_criteria: event.target.value.split('\n') })} /></Field>{details.verification.map((step, index) => <Field key={index} label={`验证命令 ${index + 1}`}><input value={step.command} onChange={(event) => edit(text, { ...details, verification: details.verification.map((item, itemIndex) => itemIndex === index ? { ...item, command: event.target.value } : item) })} /></Field>)}</>}<footer className="editor-actions"><button type="button" disabled={busy} onClick={() => requestLeave(() => setEditing(false))}>取消</button><button className="primary push-right" disabled={busy}>保存修改</button></footer></form> : <>{task.proposal ? task.mode === "sdd" ? <><SddPlan value={task.proposal_details?.sdd} /><details><summary>方案总览</summary><div className="prose-text">{task.proposal}</div></details></> : <div className="prose-text">{task.proposal}</div> : <div className="empty">尚未生成方案。请在对话中明确目标与验收条件。</div>}{task.proposal_details && <section className="proposal-criteria"><details><summary>需求、非目标与约束</summary><h3>需求</h3><ul>{task.proposal_details.requirements.map((item, index) => <li key={index}>{item}</li>)}</ul><h3>本次不做</h3><ul>{task.proposal_details.non_goals.map((item, index) => <li key={index}>{item}</li>)}</ul><h3>约束</h3><ul>{task.proposal_details.constraints.map((item, index) => <li key={index}>{item}</li>)}</ul></details><h3>执行范围</h3><p className="path-text">{task.proposal_details.scope.join(' · ')}</p><h3>验收条件</h3><ul>{task.proposal_details.acceptance_criteria.map((item, index) => <li key={index}>{item}</li>)}</ul><h3>验证命令</h3>{task.proposal_details.verification.length ? task.proposal_details.verification.map((step, index) => <div className="verification-command" key={index}><code>{step.command}</code><p className="muted">{step.detects}</p></div>) : <p className="muted">方案尚未给出可运行的验证命令。</p>}</section>}{task.proposal && !task.proposal_details && <p className="notice">方案还缺少可执行的范围、验收条件或验证信息，请让 Agent 补全。</p>}<button disabled={readOnly} onClick={discuss}>让 Agent 调整</button>{task.mode === "sdd" && !task.run_id && <button disabled={busy} onClick={() => { setBusy(true); void workbenchApi.chatgpt(projectId, task.id, 'send', '保留当前规格，补全技术设计、接口、模块组织和实施任务及测试场景，形成可确认的完整方案。').then(discuss).catch((error: Error) => setError(error.message)).finally(() => setBusy(false)); }}>补全技术设计与任务</button>}</>}
    {versions && <Modal title="方案版本" onClose={() => setVersions(null)}><Field label="查看历史版本"><select value={selectedVersion} onChange={(event) => setSelectedVersion(Number(event.target.value))}>{versions.map((version, index) => <option key={version.version} value={index}>v{version.version} · {new Date(version.created_at).toLocaleString()}</option>)}</select></Field>{current && <><h3>历史方案 v{current.version}</h3><div className="prose-text">{current.text}</div>{!!current.sources?.length && <><h3>该版本引用的资料</h3>{current.sources.map((source) => <p className="path-text" key={source.id}>{source.label} · {source.location} · {source.purpose === 'constraints' ? '项目约束' : '实现参考'}</p>)}</>}{current.version !== task.proposal_version && <><h3>当前方案 v{task.proposal_version}</h3><div className="prose-text">{task.proposal}</div><h3>影响范围对比</h3><p>历史：{current.details?.scope.join('；') ?? '尚未定义'}</p><p>当前：{task.proposal_details?.scope.join('；') ?? '尚未定义'}</p><h3>验收条件对比</h3><p>历史：{current.details?.acceptance_criteria.join('；') ?? '尚未定义'}</p><p>当前：{task.proposal_details?.acceptance_criteria.join('；') ?? '尚未定义'}</p></>}</>}</Modal>}
    {!editing && (!task.run_id || pendingRepair) && <footer className="editor-actions">{blockedReason && <p className="muted">{blockedReason}</p>}<button className="primary push-right" disabled={busy || !!blockedReason} title={blockedReason ?? undefined} onClick={() => void checkExecution()}>检查并执行…</button></footer>}
    {preview && <Modal title="确认本轮执行" onClose={() => { if (!busy) setPreview(null); }}><ErrorNotice error={error} /><p><strong>方案 v{preview.proposal_version}</strong> · {preview.worker} · {preview.verification_mode === 'tdd' ? '测试驱动' : '普通验证'}</p><h3>本轮目标</h3><p>{preview.goal}</p><h3>影响范围</h3><p className="path-text">{preview.scope.join('\n')}</p><h3>验收条件</h3><ul>{preview.acceptance_criteria.map((item) => <li key={item}>{item}</li>)}</ul><h3>验证命令</h3>{preview.verification.map((command) => <p className="path-text" key={command}>{command}</p>)}<h3>执行目录与 Git 操作</h3>{preview.carried_changes && <><h3>带入新目录的已有改动</h3><ul>{preview.carried_changes.map((path) => <li key={path}><code>{path}</code></li>)}</ul><p>旧目录和旧执行记录保留。新范围从此修订开始生效。</p></>}{task.proposal_details?.proposed_fixes?.map((fix) => <p key={fix.finding_id}>{fix.finding_id}：{fix.solution}</p>)}<p className="path-text">{preview.worktree_path}</p><p>{task.run_id && task.proposal_review_id ? `继续分支 ${preview.branch}` : `从 ${preview.source_ref} 创建 ${preview.branch}`}</p>{preview.git_operations.map((operation) => <p key={operation}>{operation}</p>)}{!pendingRepair && preview.original_changes.length > 0 && <details open><summary>原目录有 {preview.original_changes.length} 项未提交改动</summary><p>这些改动保留在原目录，不会自动带入新执行目录。需要将它们用于本任务时，请返回整理后重新检查。</p><div className="prose-text path-text">{preview.original_changes.join('\n')}</div></details>}<footer className="editor-actions"><button disabled={busy} onClick={() => setPreview(null)}>返回修改</button><button className="primary push-right" disabled={busy} onClick={() => void execute()}>{busy ? '正在准备…' : '开始执行'}</button></footer></Modal>}
  </section>;
}
