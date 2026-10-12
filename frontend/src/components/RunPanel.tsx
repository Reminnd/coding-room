import { useEffect, useState } from 'react';
import { api } from '../api';
import { workbenchApi, type ExecutionPreview, type ReviewJob, type RuntimeData, type WorkbenchTask, type RecoveryObservation } from '../workbench-api';
import { ErrorNotice, formatTime } from './Primitives';
import { Modal } from './Modal';
import { DeliveryPanel } from './DeliveryPanel';

export function RunPanel({ projectId, task, page, refresh, onDiscuss, onEvidence }: { projectId: string; task: WorkbenchTask; page: '执行' | '测试' | '验收'; refresh: () => Promise<void>; onDiscuss: () => void; onEvidence: (page: '测试' | '变更' | '执行') => void }) {
  const [runtime, setRuntime] = useState<RuntimeData | null>(null);
  const [reviewJob, setReviewJob] = useState<ReviewJob | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [preparation, setPreparation] = useState<ExecutionPreview | null>(null);
  const [recovery, setRecovery] = useState<RecoveryObservation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operating, setBusy] = useState(false);
  const readOnly = task.archived || task.cancelled;
  const busy = operating || readOnly;
  const [answer, setAnswer] = useState('');
  const [changesContract, setChangesContract] = useState(false);
  const [guidance, setGuidance] = useState('');
  const [confirm, setConfirm] = useState<'stop' | 'resume' | null>(null);
  const [showTdd, setShowTdd] = useState(false);
  const [testFilter, setTestFilter] = useState('all');
  const [launchError, setLaunchError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const [data, launches, review] = await Promise.all([workbenchApi.runtime(projectId, task.id), api.launches(projectId), workbenchApi.review(projectId, task.id)]);
        if (!disposed) {
          setRuntime(data);
          setReviewJob(review);
          const launch = launches.find((item) => item.run_id === task.run_id);
          setLaunchError(typeof launch?.error === 'string' ? launch.error : null);
        }
      } catch (error) { if (!disposed) setError(error instanceof Error ? error.message : String(error)); }
      if (!disposed) timer = setTimeout(() => void read(), 2000);
    }
    void read();
    return () => { disposed = true; clearTimeout(timer); };
  }, [projectId, task.id, task.run_id]);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); setRuntime(await workbenchApi.runtime(projectId, task.id)); await refresh(); setConfirm(null); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  if (!task.run_id) return <div className="empty">{page === '测试' ? '尚未运行测试。' : '请先确认方案并开始执行。'}</div>;
  const latest = runtime?.attempts.at(-1);
  const active = ['running', 'decision_requested', 'cancel_requested'].includes(latest?.status ?? '');
  const unknown = runtime?.execution_observation === 'unknown';
  const run = runtime?.run;
  const verification = runtime?.verification ?? [];
  const currentTests = runtime?.verification_current ?? [];
  const latestTests = currentTests.filter((item, index) => !currentTests.slice(index + 1).some((later) => later.command === item.command));
  const failedCommands = latestTests.filter((item) => item.completed_at && item.exit_code !== 0).map((item) => item.command_index);
  const verifying = verification.some((item) => !item.completed_at);
  const shownTests = (showTdd ? verification : latestTests).filter((item) => testFilter === 'all' || (testFilter === 'passed' ? item.completed_at && item.exit_code === 0 : item.completed_at && item.exit_code !== 0));
  return <section><ErrorNotice error={error ?? launchError ?? latest?.failure?.message ?? null} />
    {(unknown || verifying || recovery) && <section className="question-card"><h2>检查旧执行</h2><p>应用重启或服务中断后，先读取系统进程情况。检查不会启动任务或撤销代码。</p><button disabled={busy} onClick={() => void action(async () => setRecovery(await workbenchApi.recovery(projectId, task.id)))}>检查进程状态</button>
      {recovery && <><p role="status">{recovery.message}</p><p className="path-text">{recovery.worktree_path}</p>{recovery.live_pids.length > 0 && <p>关联 PID：{recovery.live_pids.join('、')}</p>}{recovery.state === 'stopped' && <button className="primary" disabled={busy} onClick={() => void action(async () => setRecovery(await workbenchApi.recover(projectId, task.id)))}>确认结束遗留记录，保留改动</button>}</>}
    </section>}
    {page === '执行' && run?.status === 'needs_decision' && runtime?.scope_question && <section className="question-card"><h2>回答改变了任务范围</h2><p>{runtime.scope_question.answer}</p><p>先更新完整方案，再确认新的执行范围与需要保留的已有改动。</p><button className="primary" onClick={onDiscuss}>修改方案</button></section>}
    {page === '执行' && !!runtime?.prior_runs?.length && <details><summary>范围修订前的执行记录</summary>{runtime.prior_runs.map(({ run, attempts }) => <section key={run.run_id}><p className="path-text">{run.worktree_path}</p><p>{run.run_id} · 由当前修订替代，原目录保留</p>{attempts.map((attempt) => <p key={attempt.attempt_id}>{attempt.attempt_id} · {attempt.status}</p>)}</section>)}</details>}
    {page === '测试' && <div className="editor-actions"><button disabled={busy || active || verifying || !failedCommands.length} onClick={() => void action(async () => { for (const index of failedCommands) await workbenchApi.verify(projectId, task.id, index); })}>重跑失败测试</button><button disabled={busy || active || verifying || !runtime?.verification_commands?.length} onClick={() => void action(async () => { for (const [index] of (runtime?.verification_commands ?? []).entries()) await workbenchApi.verify(projectId, task.id, index); })}>运行本任务验证</button>{verifying && <span role="status">验证命令执行中…</span>}</div>}
    {page === '验收' && run?.status === 'accepted' && !readOnly && <DeliveryPanel projectId={projectId} task={task} />}
    {page === '验收' && run?.status === 'review_discussion' && !!runtime?.reviews.at(-1)?.findings.length && <section className="question-card"><h2>讨论修复方案</h2><p>在对话中选择需要解决的 findings，明确最小修复与验证，再到方案页确认本轮执行。</p><button className="primary" disabled={busy || reviewJob?.status === 'running'} onClick={onDiscuss}>讨论 findings 与修复方案</button></section>}
    {unknown && <p className="notice" role="status">执行状态未知：数据库仍有活动记录，但当前桌面没有对应执行进程的观察信息。请检查原执行器与日志；确认旧执行已停止前不能再次启动。</p>}
    {page === '执行' && run?.status === 'ready' && (!run.worktree_path || task.carry_from_run_id) && <section className="question-card"><h2>执行目录尚未准备完成</h2><p>处理准备错误后，重新检查实际目录与分支，再继续执行。</p><button disabled={busy} onClick={() => void action(async () => setPreparation(await workbenchApi.checkExecution(projectId, task.id)))}>重新检查执行准备…</button></section>}
    {preparation && <Modal title="重新准备执行目录" onClose={() => setPreparation(null)}><p>方案 v{preparation.proposal_version} · {preparation.goal}</p><p className="path-text">{preparation.worktree_path}</p><p>从 {preparation.source_ref} 创建 {preparation.branch}</p><h3>带入的已有改动</h3><p className="path-text">{preparation.carried_changes?.join("\n") ?? "无"}</p><h3>影响范围</h3><p className="path-text">{preparation.scope.join('\n')}</p><h3>验证命令</h3>{preparation.verification.map((command) => <p className="path-text" key={command}>{command}</p>)}{preparation.original_changes.length > 0 && <p>原目录 {preparation.original_changes.length} 项未提交改动将保留在原目录。</p>}<ErrorNotice error={error} /><footer className="editor-actions"><button disabled={busy} onClick={() => setPreparation(null)}>返回</button><button className="primary push-right" disabled={busy} onClick={() => void action(async () => { await workbenchApi.execute(projectId, task.id, preparation.preview_id); setPreparation(null); })}>确认准备并执行</button></footer></Modal>}
    {page === '验收' && <><header className="page-heading"><h2>{run?.status === 'accepted' ? '已接受' : '审阅与验收'}</h2><div className="inline-options">{['review_required', 'review_discussion'].includes(run?.status ?? '') && <button disabled={busy || reviewJob?.status === 'running'} onClick={() => void action(async () => setReviewJob(await workbenchApi.startReview(projectId, task.id)))}>{reviewJob?.status === 'running' ? '正在独立审阅…' : runtime?.reviews.length ? '重新审阅当前候选' : '开始独立审阅'}</button>}{run?.status === 'review_discussion' && runtime?.reviews.at(-1)?.decision === 'approved' && <button className="primary" disabled={busy || reviewJob?.status === 'running'} onClick={() => setAccepting(true)}>接受本次结果</button>}</div></header><ErrorNotice error={reviewJob?.error ?? null} />{accepting && <Modal title="接受当前结果？" onClose={() => setAccepting(false)}><p>确认目标和验收条件已满足。系统将核对当前代码、测试证据与通过的 Review 是否一致。接受后另行选择提交或集成。</p><p className="path-text">{run?.worktree_path}</p><ErrorNotice error={error} /><footer className="editor-actions"><button disabled={busy} onClick={() => setAccepting(false)}>返回检查</button><button className="primary push-right" disabled={busy} onClick={() => void action(async () => { await workbenchApi.accept(projectId, task.id); setAccepting(false); })}>确认接受</button></footer></Modal>}</>}
    {page === '执行' && <><header className="page-heading"><h2>{unknown ? '执行状态未知' : active ? run?.status === 'cancel_requested' ? '正在停止…' : '任务执行中' : run?.status === 'review_required' ? '实现完成，待审阅' : '执行记录'}</h2>{active && !unknown && run?.status !== 'cancel_requested' && <button disabled={busy} onClick={() => setConfirm('stop')}>停止执行</button>}{!active && run?.worktree_path && ['ready', 'failed', 'canceled'].includes(run?.status ?? '') && <button className="primary" disabled={busy} onClick={() => setConfirm('resume')}>{run?.status === 'failed' ? '重试失败步骤' : '继续任务'}</button>}</header><p className="path-text">{run?.worktree_path ?? '执行目录准备中'}</p>{latest?.result && <div className="prose-text">{latest.result.summary}</div>}
      {runtime?.question && <section className="question-card"><h2>需要你的回答</h2><p>{runtime.question.question}</p>{runtime.question.options.map((option) => <label className="source-choice" key={option.label}><input type="radio" name="run-answer" checked={answer === option.label} onChange={() => setAnswer(option.label)} /><span>{option.label}<small>{option.tradeoff}</small></span></label>)}<textarea aria-label="执行问题答案" rows={3} value={answer} onChange={(event) => setAnswer(event.target.value)} /><label className="source-choice"><input type="checkbox" checked={changesContract} onChange={(event) => setChangesContract(event.target.checked)} />答案改变范围，需要修订方案</label><button className="primary" disabled={busy || active || !answer.trim()} onClick={() => void action(async () => { await api.action(projectId, 'answer-question', { question_id: runtime.question!.question_id, answer, answer_changes_contract: changesContract }); if (!changesContract) await workbenchApi.continue(projectId, task.id); else onDiscuss(); })}>{active ? '等待旧执行停止' : changesContract ? '保存答案并返回规划' : '提交答案并继续'}</button></section>}
      <ol className="event-list">{runtime?.events.map((event) => <li key={event.sequence}><time>{formatTime(event.created_at)}</time><span>{event.summary}</span></li>)}</ol>
      {!active && <details><summary>补充下一次执行说明</summary><textarea aria-label="下一次执行说明" rows={3} value={guidance} onChange={(event) => setGuidance(event.target.value)} /><button disabled={busy || !guidance.trim()} onClick={() => void action(async () => { await api.action(projectId, 'add-guidance', { guidance_id: crypto.randomUUID(), run_id: task.run_id, text: guidance }); setGuidance(''); })}>保存补充说明</button><p className="muted">在下一次执行开始时读取。</p></details>}
      <details><summary>查看完整日志</summary>{runtime?.logs.length ? runtime.logs.map((log) => <details key={log.name}><summary>{log.name}</summary><pre className="code-output">{log.text}</pre></details>) : <p className="muted">完整日志在本次执行停止后保存；运行进展见上方事件。</p>}</details></>}
    {page === '测试' && <><header className="page-heading"><h2>实际命令证据</h2><select aria-label="测试结果筛选" value={testFilter} onChange={(event) => setTestFilter(event.target.value)}><option value="all">全部</option><option value="failed">命令失败</option><option value="passed">命令成功</option></select></header><div className="inline-options"><button aria-pressed={!showTdd} onClick={() => setShowTdd(false)}>当前结果</button><button aria-pressed={showTdd} onClick={() => setShowTdd(true)}>TDD 过程</button></div><p className="muted">阶段表示执行时的意图。请结合实际输出核对失败原因和目标用例；退出码 0 本身不证明目标行为已覆盖。</p>{shownTests.length ? shownTests.map((item) => <article className="verification-card" key={item.id}><header className="page-heading"><strong>{item.stage.toUpperCase()} · {item.behavior}</strong><span className="badge">{item.completed_at ? `退出码 ${item.exit_code ?? '无'} ` : '正在运行'}</span></header><code>{item.command}</code><p className="path-text">{item.cwd}</p><time>{formatTime(item.started_at)}</time><details><summary>查看命令与输出</summary><ErrorNotice error={item.error} /><pre className="code-output">{item.stdout}{item.stderr}</pre></details></article>) : <div className="empty">尚无实际验证命令记录。Agent 自述不会显示为测试通过。</div>}</>}
    {page === '验收' && <><h2>本次结果</h2><h3>目标</h3><p>{task.goal}</p><div className="inline-options"><button onClick={() => onEvidence('测试')}>查看测试证据</button><button onClick={() => onEvidence('变更')}>查看代码变更</button><button onClick={() => onEvidence('执行')}>查看执行日志</button></div><h3>验收条件</h3><ul>{task.proposal_details?.acceptance_criteria.map((item) => <li key={item}>{item}</li>)}</ul>{runtime?.reviews.length ? runtime.reviews.map((review) => <section className="panel" key={review.review_id}><header className="panel-head"><h2>{review.decision}</h2></header><div className="panel-body"><p>{review.verification_summary}</p>{review.findings.map((finding, index) => <article key={index}><h3>{finding.severity} · {finding.title}</h3><p className="path-text">{finding.file}:{finding.line}</p><p>触发条件：{finding.trigger}</p><p>{finding.impact}</p><p>需求关系：{finding.requirement_relation}</p><p>{finding.evidence}</p><p>{finding.minimal_direction}</p></article>)}{!review.findings.length && <p>本次 Review 未报告 findings。</p>}{!!review.open_questions?.length && <><h3>未决问题</h3><ul>{review.open_questions.map((question, index) => <li key={index}>{question}</li>)}</ul></>}</div></section>) : <p className="muted">尚未产生 Review 结果。</p>}</>}
    {confirm && <Modal title={confirm === 'stop' ? '停止当前执行？' : '继续当前任务？'} onClose={() => setConfirm(null)}><p>{confirm === 'stop' ? '将请求停止任务，保留现有代码和证据。收到执行器终态后才会显示已停止。' : '在下列实际目录继续此任务，保留已完成的代码；由执行器按已有任务和会话恢复。'}</p><p className="path-text">{run?.worktree_path}</p><ErrorNotice error={error} /><footer className="editor-actions"><button disabled={busy} onClick={() => setConfirm(null)}>返回</button><button className="primary push-right" disabled={busy} onClick={() => void action(() => confirm === 'stop' ? api.action(projectId, 'cancel-run', { run_id: task.run_id, reason: '用户在任务工作台停止执行', confirmed_by_user: true }) : workbenchApi.continue(projectId, task.id))}>{confirm === 'stop' ? '停止执行' : '继续任务'}</button></footer></Modal>}
  </section>;
}
