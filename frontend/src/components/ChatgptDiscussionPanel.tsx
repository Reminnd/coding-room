import { useEffect, useRef, useState } from 'react';
import { savePreference } from '../preferences';
import { workbenchApi, type ChatgptDiscussion, type WorkbenchTask } from '../workbench-api';
import { ErrorNotice } from './Primitives';
import { Modal } from './Modal';

function readableReply(text: string): string {
  return text.replace(/```json\s*\n([\s\S]*?)\n```/g, (block, json: string) => {
    try { const value = JSON.parse(json); return value.room_task || value.room_questions ? '' : block; }
    catch { return block; }
  }).trim();
}

export function ChatgptDiscussionPanel({ projectId, task, onChanged, onPlan }: {
  projectId: string; task: WorkbenchTask; onChanged: () => void; onPlan: () => void;
}) {
  const draftKey = `room-chatgpt-draft-${projectId}-${task.id}`;
  const [text, setText] = useState(() => localStorage.getItem(draftKey) ?? '');
  const [state, setState] = useState<ChatgptDiscussion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState<string | null>(null);
  const notifiedVersion = useRef(task.proposal_version);
  const messages = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const submitted = useRef<string | null>(null);
  const readOnly = task.archived || task.cancelled;
  function updateText(value: string) { setText(value); savePreference(draftKey, value || null); }
  useEffect(() => {
    if (busy || !submitted.current || state?.confirmedText !== submitted.current) return;
    if (text.trim() === submitted.current) { setText(''); savePreference(draftKey, null); }
    setAnswers({});
    setError(previous => previous?.includes('尚未确认网页发送结果') ? null : previous);
    submitted.current = null;
  }, [busy, state?.confirmedText, text, draftKey]);
  useEffect(() => {
    const version = state?.output?.proposal_version;
    if (version != null && version > notifiedVersion.current) { notifiedVersion.current = version; onChanged(); }
  }, [state?.output?.proposal_version, onChanged]);
  useEffect(() => {
    if (followLatest.current && messages.current) messages.current.scrollTop = messages.current.scrollHeight;
  }, [state?.messages]);
  useEffect(() => {
    if (readOnly) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const result = await workbenchApi.chatgpt(projectId, task.id, 'read');
        if (!disposed) { setState(previous => result.loading && previous ? { ...result, messages: previous.messages } : result); setConnectionError(null); }
      } catch (error) { if (!disposed) setConnectionError(error instanceof Error ? error.message : String(error)); }
      if (!disposed) timer = setTimeout(() => void read(), 700);
    }
    void read();
    return () => { disposed = true; clearTimeout(timer); };
  }, [projectId, task.id, readOnly]);
  async function action(kind: 'send' | 'show' | 'stop' | 'adopt', value?: string) {
    setBusy(true); setError(null);
    if (kind === 'send') submitted.current = value?.trim() ?? null;
    try {
      const result = await workbenchApi.chatgpt(projectId, task.id, kind, value);
      setState(result);
      if (kind === 'send') { updateText(''); setAnswers({}); }
      if (kind === 'adopt') { onChanged(); onPlan(); }
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  const unavailable = busy || readOnly || !state?.ready || Boolean(connectionError) || state.loading;
  const questions = state?.output?.questions ?? [];
  const questionId = state?.output?.message_id;
  const status = busy ? '正在处理…' : state?.loading ? '正在连接 ChatGPT 网页…' : state?.phase === 'sending' ? '正在发送并确认网页接收…'
    : state?.phase === 'unconfirmed' ? '等待网页确认，正在继续同步…'
    : state?.phase === 'thinking' ? 'ChatGPT 正在思考或准备回复…' : state?.phase === 'responding' ? 'ChatGPT 正在输出…'
    : state?.phase === 'saving' ? '正在保存方案草稿…' : state?.phase === 'stopped' ? '已停止生成，部分回复未自动保存'
    : questions.length ? '等待你明确需求' : state?.output?.proposal_version != null ? `方案草稿已自动保存 · v${state.output.proposal_version}`
    : state?.messages.at(-1)?.role === 'assistant' ? '回复已完成；未识别到结构化方案，可手动采用' : '准备就绪';
  return <section className="discussion chatgpt-discussion">
    <div className="editor-actions"><strong>ChatGPT 普通聊天</strong>
      <button className="push-right" disabled={busy || readOnly} onClick={() => void action('show')}>打开网页 / 登录</button>
      {task.proposal && <button onClick={onPlan}>查看方案</button>}</div>
    <ErrorNotice error={error ?? connectionError ?? state?.error ?? null} />
    <div role="status" className="notice">{status}</div>
    {questions.length > 0 && dismissed === questionId && <button onClick={() => setDismissed(null)}>回答需求问题</button>}
    <p className="muted">直接在此讨论。任务资料随消息发送；上传文件或处理登录时打开网页。</p>
    <div className="messages" ref={messages} onScroll={event => { const element = event.currentTarget; followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48; }} aria-live="polite" aria-busy={state?.generating || busy}>
      {state?.messages.map(message => <article className={`message ${message.role === 'user' ? 'user' : ''}`} key={message.id}>
        <strong>{message.role === 'user' ? '你' : 'ChatGPT'}</strong><div className="prose-text">{message.role === 'assistant' ? readableReply(message.text) : message.text}</div>
        {message.role === 'assistant' && message.text && state.output?.message_id === message.id && state.output.proposal_version != null
          ? <button onClick={onPlan}>查看已保存方案</button>
          : message.role === 'assistant' && message.text && !/"room_questions"\s*:/.test(message.text) && <button disabled={unavailable || state.generating || state.pending || state.phase === 'responding'} onClick={() => void action('adopt', message.id)}>采用此方案</button>}
      </article>)}
      {!state?.messages.length && <p className="empty">{readOnly ? '任务已归档或取消，可查看已保存方案。' : state?.loading || !state ? '正在连接 ChatGPT 网页…' : '发送目标、补充需求或方案修改意见，开始讨论。'}</p>}
    </div>
    <form className="composer" onSubmit={event => { event.preventDefault(); if (!unavailable && !state?.generating && !state?.pending && text.trim()) void action('send', text); }}>
      <textarea aria-label="讨论内容" disabled={readOnly || busy} rows={3} value={text} onChange={event => updateText(event.target.value)} placeholder="补充需求、回答问题或提出方案修改意见" />
      <div className="editor-actions"><span className="muted">ChatGPT 普通聊天 · 规划讨论</span>
        {state?.generating ? <button className="push-right" type="button" disabled={busy || readOnly} onClick={() => void action('stop')}>停止生成</button>
          : <button className="primary push-right" disabled={unavailable || state?.pending || !text.trim()}>发送</button>}</div>
    </form>
    {questions.length > 0 && questionId !== dismissed && !readOnly && <Modal title="需要你明确需求" onClose={() => setDismissed(questionId ?? null)}>
      <form onSubmit={event => {
        event.preventDefault();
        const reply = questions.map(question => `${question.question}\n回答：${answers[question.id]?.trim()}`).join('\n\n');
        void action('send', reply);
      }}>
        {questions.map(question => <fieldset key={`${questionId}-${question.id}`}><legend>{question.question}</legend>
          {question.options.map(option => <label className="source-choice" key={option.label}><input type="radio" name={question.id} disabled={busy} checked={answers[question.id] === option.label} onChange={() => setAnswers(previous => ({ ...previous, [question.id]: option.label }))} /><span>{option.label}<small>{option.description}</small></span></label>)}
          <input aria-label={`${question.question}：自定义答案`} disabled={busy} placeholder="也可以输入自己的答案" value={answers[question.id] ?? ''} onChange={event => setAnswers(previous => ({ ...previous, [question.id]: event.target.value }))} />
        </fieldset>)}
        <ErrorNotice error={error} />
        <button className="primary" disabled={unavailable || questions.some(question => !answers[question.id]?.trim())}>提交答案并继续</button>
      </form>
    </Modal>}
  </section>;
}
