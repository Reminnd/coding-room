import { useRef, useState } from 'react';
import { ErrorNotice, Field } from './Primitives';
import { SourceEditor } from './SourceEditor';
import { workbenchApi, type Source, type TaskDraft, type WorkbenchTask, type ProjectSettings } from '../workbench-api';

export function TaskEditor({ projectId, initial, sources, onSaved, onCancel, onDirty, refresh, defaults }: {
  projectId: string; initial?: WorkbenchTask; sources: Source[];
  onSaved: (task: WorkbenchTask, discuss: boolean) => void; onCancel: () => void;
  onDirty: (draft: TaskDraft) => void;
  refresh: () => Promise<void>;
  defaults: ProjectSettings;
}) {
  const [draft, setDraftState] = useState<TaskDraft>(initial ?? { title: '', goal: '', mode: defaults.default_mode, verification: defaults.default_verification, source_ids: sources.filter((source) => source.purpose === 'constraints').map((source) => source.id) });
  function setDraft(value: TaskDraft) { setDraftState(value); onDirty(value); }
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addingSource, setAddingSource] = useState(false);
  const title = useRef<HTMLInputElement>(null);
  const goal = useRef<HTMLTextAreaElement>(null);
  async function save(discuss: boolean) {
    if (discuss && !draft.title.trim()) { setError('请填写任务标题'); title.current?.focus(); return; }
    if (discuss && !draft.goal.trim()) { setError('请填写希望完成的目标'); goal.current?.focus(); return; }
    setBusy(true); setError(null);
    try {
      const task = await workbenchApi.saveTask(projectId, draft);
      if (discuss && task.mode === 'task') await workbenchApi.send(projectId, task.id, '请阅读本次资料，与我讨论目标、约束和验收条件，再形成方案。');
      onSaved(task, discuss);
    } catch (error) { setError(String(error instanceof Error ? error.message : error)); }
    finally { setBusy(false); }
  }
  return <section className="task-editor"><header><p className="eyebrow">从目标开始</p><h1>{initial ? '编辑任务' : '新建任务'}</h1><p className="muted">先讨论需求与方案，确认后开始执行。</p></header>
    <ErrorNotice error={error} />
    <div className="field-with-action"><Field label="任务标题"><input ref={title} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="用一句话描述任务" /></Field><button disabled={!draft.goal.trim() || Boolean(draft.title.trim())} onClick={() => setDraft({ ...draft, title: draft.goal.trim().split(/[。\n]/)[0].slice(0, 48) })}>从目标生成</button></div>
    <Field label="希望完成什么"><textarea ref={goal} rows={6} value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} placeholder="描述需要完成的目标、当前问题和预期结果" /></Field>
    <fieldset><legend>开发入口</legend><div className="choice-grid">{(['task', 'sdd'] as const).map((mode) => <label className={`choice-card ${draft.mode === mode ? 'selected' : ''}`} key={mode}><input type="radio" name="mode" checked={draft.mode === mode} onChange={() => setDraft({ ...draft, mode })} /><span><strong>{mode === 'task' ? '任务模式' : '规格模式（SDD）'}</strong><small>{mode === 'task' ? '使用 Codex 原生 Plan，明确步骤与验收' : '来源研究、规格场景、技术设计与模块边界'}</small></span></label>)}</div></fieldset>
    <fieldset><legend>验证方式</legend><div className="inline-options"><label><input type="radio" name="verification" checked={draft.verification === 'tdd'} onChange={() => setDraft({ ...draft, verification: 'tdd' })} /> 测试驱动</label><label><input type="radio" name="verification" checked={draft.verification === 'standard'} onChange={() => setDraft({ ...draft, verification: 'standard' })} /> 普通验证</label></div><details><summary>了解 TDD</summary><p>先写一个表达预期行为的测试，实际运行并确认因缺少行为而失败（Red）；再实现最小改动，让同一测试通过（Green）。需要整理代码时重构并复测（Refactor）。环境错误不算 Red，计划模式本身不等于 TDD。</p></details></fieldset>
    <fieldset><legend>本次资料</legend><button onClick={() => setAddingSource(true)}>添加资料并用于本任务</button>{sources.length ? sources.map((source) => <label className="source-choice" key={source.id}><input type="checkbox" checked={draft.source_ids.includes(source.id)} onChange={(e) => setDraft({ ...draft, source_ids: e.target.checked ? [...draft.source_ids, source.id] : draft.source_ids.filter((id) => id !== source.id) })} /><span>{source.label}<small>{source.purpose === 'constraints' ? '需求 / 接口 / 约束' : '实现与模块参考'}</small></span></label>) : <p className="muted">暂无项目资料，可在此添加。</p>}</fieldset>
    {addingSource && <SourceEditor projectId={projectId} onClose={() => setAddingSource(false)} onSaved={async (source) => { setDraft({ ...draft, source_ids: [...draft.source_ids, source.id] }); await refresh(); }} />}
    <footer className="editor-actions"><button disabled={busy} onClick={() => void save(false)}>保存草稿</button><button disabled={busy} onClick={onCancel}>取消</button><button className="primary push-right" disabled={busy} onClick={() => void save(true)}>{busy ? '正在保存…' : '开始讨论'}</button></footer>
  </section>;
}
