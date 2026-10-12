import { useState } from 'react';
import type { ProposalDetails } from '../workbench-api';
import { Field } from './Primitives';

type Sdd = NonNullable<ProposalDetails['sdd']>;
export function SddPlan({ value, onChange }: { value?: Sdd; onChange?: (value: Sdd) => void }) {
  const [tab, setTab] = useState<'specification' | 'technical_design' | 'tasks'>('specification');
  const sdd = value ?? { specification: '', technical_design: '', tasks: [] };
  const labels = { specification: '规格', technical_design: '技术设计', tasks: '实施任务' };
  const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean);
  function updateTask(index: number, changes: Partial<Sdd['tasks'][number]>) {
    onChange?.({ ...sdd, tasks: sdd.tasks.map((task, position) => position === index ? { ...task, ...changes } : task) });
  }
  return <section><div className="inline-options" role="tablist" aria-label="SDD 方案内容">{(Object.keys(labels) as Array<keyof typeof labels>).map((key) => <button type="button" role="tab" aria-selected={tab === key} key={key} onClick={() => setTab(key)}>{labels[key]}</button>)}</div><div role="tabpanel" aria-label={labels[tab]}>
    {tab !== 'tasks' ? onChange ? <Field label={labels[tab]}><textarea rows={14} value={sdd[tab]} onChange={(event) => onChange({ ...sdd, [tab]: event.target.value })} /></Field> : <div className="prose-text">{sdd[tab] || `尚未生成${labels[tab]}。`}</div> : <>{sdd.tasks.map((task, index) => <article className="verification-card" key={index}>{onChange ? <><Field label="任务标识"><input value={task.id} onChange={(event) => updateTask(index, { id: event.target.value })} /></Field><Field label="任务目标"><input value={task.title} onChange={(event) => updateTask(index, { title: event.target.value })} /></Field>{(['modules', 'dependencies', 'acceptance', 'tests'] as const).map((field) => <Field key={field} label={{ modules: '模块或路径（每行一项）', dependencies: '前序任务标识（每行一项）', acceptance: '验收条件（每行一项）', tests: '测试场景（每行一项）' }[field]}><textarea rows={2} value={task[field].join('\n')} onChange={(event) => updateTask(index, { [field]: lines(event.target.value) })} /></Field>)}<button type="button" onClick={() => onChange({ ...sdd, tasks: sdd.tasks.filter((_, position) => position !== index) })}>移除此实施任务</button></> : <><h3>{index + 1}. {task.title}</h3><p className="path-text">{task.id} · {task.modules.join(' · ')}</p><p>依赖：{task.dependencies.join('、') || '无'}</p><h4>验收</h4><ul>{task.acceptance.map((item, index) => <li key={index}>{item}</li>)}</ul><h4>测试场景</h4><ul>{task.tests.map((item, index) => <li key={index}>{item}</li>)}</ul></>}</article>)}{!sdd.tasks.length && <p className="empty">尚未生成实施任务。</p>}{onChange && <button type="button" onClick={() => onChange({ ...sdd, tasks: [...sdd.tasks, { id: `task-${sdd.tasks.length + 1}`, title: '', modules: [], dependencies: [], acceptance: [], tests: [] }] })}>添加实施任务</button>}</>}
  </div></section>;
}
