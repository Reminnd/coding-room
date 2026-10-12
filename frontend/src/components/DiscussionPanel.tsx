import { useEffect, useState } from 'react';
import { savePreference } from '../preferences';
import { ErrorNotice } from './Primitives';
import { ChatgptDiscussionPanel } from './ChatgptDiscussionPanel';
import { workbenchApi, type Discussion, type WorkbenchTask } from '../workbench-api';

type DiscussionProps = { projectId: string; task: WorkbenchTask; onChanged: () => void; onPlan: () => void };

export function DiscussionPanel(props: DiscussionProps) {
  return props.task.mode === 'sdd' ? <ChatgptDiscussionPanel {...props} /> : <NativeDiscussionPanel {...props} />;
}

function NativeDiscussionPanel({ projectId, task, onChanged, onPlan }: DiscussionProps) {
  const [discussion, setDiscussion] = useState<Discussion | null>(null);
  const draftKey = `room-discussion-draft-${projectId}-${task.id}`;
  const [text, setText] = useState(() => localStorage.getItem(draftKey) ?? '');
  function updateText(value: string) { setText(value); savePreference(draftKey, value || null); }
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [operating, setBusy] = useState(false);
  const readOnly = task.archived || task.cancelled;
  const busy = operating || readOnly;
  const active = ['starting', 'running', 'waiting'].includes(discussion?.state?.status ?? '');
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const result = await workbenchApi.discussion(projectId, task.id);
        if (!disposed) { setDiscussion(result); setError(null); }
      } catch (error) { if (!disposed) setError(error instanceof Error ? error.message : String(error)); }
      if (!disposed) timer = setTimeout(() => void read(), 2000);
    }
    void read();
    return () => { disposed = true; clearTimeout(timer); };
  }, [projectId, task.id]);
  async function action(fn: () => Promise<unknown>, clear = false) {
    setBusy(true); setError(null);
    try { await fn(); if (clear) updateText(''); setDiscussion(await workbenchApi.discussion(projectId, task.id)); onChanged(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  const items = discussion?.thread?.turns.flatMap((turn) => turn.items) ?? [];
  const stream = discussion?.state;
  const visibleItems = active && stream?.stream_item_id && stream.text
    ? items.some((item) => item.id === stream.stream_item_id)
      ? items.map((item) => item.id === stream.stream_item_id ? { ...item, text: stream.text } : item)
      : [...items, { id: stream.stream_item_id, type: 'agentMessage', text: stream.text }]
    : items;
  return <section className="discussion"><ErrorNotice error={error ?? discussion?.state?.error ?? null} />
    {discussion?.thread?.turns.some((turn) => turn.items.some((item) => ['commandExecution', 'mcpToolCall', 'webSearch'].includes(item.type))) && <details><summary>来源读取与研究记录</summary>{discussion.thread.turns.flatMap((turn) => turn.items).filter((item) => ['commandExecution', 'mcpToolCall', 'webSearch'].includes(item.type)).map((item) => <details key={item.id}><summary>{item.command ?? item.tool ?? item.query ?? item.type} · {item.status ?? '记录'}</summary>{item.cwd && <p className="path-text">{item.cwd}</p>}<pre className="code-output">{item.aggregatedOutput ?? JSON.stringify(item.error ?? item.result ?? {}, null, 2)}</pre></details>)}</details>}
    {!active && <div className="editor-actions"><button disabled={busy} onClick={() => void action(() => workbenchApi.send(projectId, task.id, task.mode === 'sdd' ? '根据已确认的本项目要求和选中的参考，生成规格与验收场景草稿。请保留未决问题，暂不实现。' : '请根据当前讨论生成完整原生 Plan，明确步骤、影响范围、验收与实际验证命令，暂不实现。'))}>{task.mode === 'sdd' ? '生成规格' : '生成计划'}</button></div>}
    <div className="messages" aria-live="polite">{visibleItems.filter((item) => ['userMessage', 'agentMessage', 'plan'].includes(item.type)).map((item) => <article className={`message ${item.type === 'userMessage' ? 'user' : ''}`} key={item.id}><strong>{item.type === 'userMessage' ? '你' : item.type === 'plan' ? '方案' : 'Codex'}</strong><div className="prose-text">{item.text ?? item.content?.map((entry) => entry.text ?? '').join('\n')}</div>{item.type === 'plan' && <button onClick={onPlan}>查看方案</button>}</article>)}
      {!visibleItems.length && !active && <div className="empty">发送目标或补充说明，开始规划讨论。</div>}
      {active && <div role="status" className="muted">{discussion?.state?.status === 'waiting' ? '等待你的回答' : 'Codex 正在研究与规划…'}</div>}
      {discussion?.state?.question && <form className="question-card" onSubmit={(e) => { e.preventDefault(); void action(() => workbenchApi.answer(projectId, task.id, Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, { answers: [answer] }])))); }}><h2>需要你确认</h2>{discussion.state.question.questions.map((question) => <fieldset key={question.id}><legend>{question.question}</legend>{question.options?.map((option) => <label className="source-choice" key={option.label}><input type="radio" name={question.id} checked={answers[question.id] === option.label} onChange={() => setAnswers({ ...answers, [question.id]: option.label })} /><span>{option.label}<small>{option.description}</small></span></label>)}<input aria-label={`${question.question}：自定义答案`} placeholder="输入你的答案" value={answers[question.id] ?? ''} onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })} /></fieldset>)}<button className="primary" disabled={busy}>提交答案并继续</button></form>}
    </div>
    <form className="composer" onSubmit={(e) => { e.preventDefault(); if (!active && text.trim()) void action(() => workbenchApi.send(projectId, task.id, text), true); }}><textarea disabled={readOnly} aria-label="讨论内容" rows={3} value={text} onChange={(e) => updateText(e.target.value)} placeholder="补充需求、回答问题或提出方案修改意见" /><div className="editor-actions"><span className="muted">原生 Plan · 只读研究</span>{active ? <button className="push-right" type="button" disabled={busy} onClick={() => void action(() => workbenchApi.interrupt(projectId, task.id))}>停止生成</button> : <button className="primary push-right" disabled={busy || !text.trim()}>发送</button>}</div></form>
  </section>;
}
