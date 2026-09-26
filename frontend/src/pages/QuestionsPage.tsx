import { useState } from 'react';
import { api } from '../api';
import { Badge, Empty, ErrorNotice, Field, Panel, SuccessNotice, formatTime, type PageProps } from '../components/Primitives';

export function QuestionsPage({ projectId, snapshot, refresh }: PageProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [changes, setChanges] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  async function submit(questionId: string) {
    setError(null); setSuccess(null);
    try {
      await api.action(projectId, 'answer-question', { question_id: questionId, answer: answers[questionId] ?? '', answer_changes_contract: changes[questionId] ?? false });
      setSuccess(`Question ${questionId} 已回答。`); await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }
  return <div className="page-grid"><ErrorNotice error={error} /><SuccessNotice message={success} />
    {snapshot.questions.length === 0 ? <Panel title="Questions" className="span-all"><Empty>没有 Question。</Empty></Panel> : snapshot.questions.map((question) => {
      const id = String(question.question_id); const open = question.status === 'open';
      return <Panel key={id} title={id} className="span-all" aside={<Badge tone={open ? 'warn' : 'good'}>{String(question.status)}</Badge>}>
        <div className="question-copy"><h3>{String(question.question)}</h3><p>阻塞范围：{String(question.blocking_scope || '—')}</p><small>{formatTime(question.asked_at)}</small></div>
        <div className="option-grid">{((question.options as Array<{ label: string; tradeoff: string }>) ?? []).map((option) => <button type="button" key={option.label} disabled={!open} onClick={() => setAnswers({ ...answers, [id]: option.label })}><strong>{option.label}</strong><span>{option.tradeoff}</span></button>)}</div>
        {open ? <div className="answer-box"><Field label="回答"><textarea value={answers[id] ?? ''} onChange={(e) => setAnswers({ ...answers, [id]: e.target.value })} /></Field><label className="check"><input type="checkbox" checked={changes[id] ?? false} onChange={(e) => setChanges({ ...changes, [id]: e.target.checked })} />答案改变已批准 Contract（将回到确认门禁）</label><button className="primary" disabled={!answers[id]?.trim()} onClick={() => void submit(id)}>提交回答</button></div> : <p className="answer-readonly">回答：{String(question.answer ?? '—')}</p>}
      </Panel>;
    })}
  </div>;
}
