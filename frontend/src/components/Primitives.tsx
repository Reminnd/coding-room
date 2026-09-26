import type { PropsWithChildren, ReactNode } from 'react';

export function Panel({ title, aside, children, className = '' }: PropsWithChildren<{ title: string; aside?: ReactNode; className?: string }>) {
  return <section className={`panel ${className}`}><header className="panel-head"><h2>{title}</h2>{aside}</header><div className="panel-body">{children}</div></section>;
}

export function Badge({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info' }>) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Field({ label, children, hint }: PropsWithChildren<{ label: string; hint?: string }>) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Empty({ children }: PropsWithChildren) {
  return <div className="empty">{children}</div>;
}

export function JsonView({ value }: { value: unknown }) {
  return <pre className="json-view">{JSON.stringify(value, null, 2)}</pre>;
}

export function ErrorNotice({ error }: { error: string | null }) {
  return error ? <div className="notice error" role="alert">{error}</div> : null;
}

export function SuccessNotice({ message }: { message: string | null }) {
  return message ? <div className="notice success" role="status">{message}</div> : null;
}

export function formatTime(value: unknown): string {
  if (typeof value !== 'string') return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

export function statusTone(status: unknown): 'neutral' | 'good' | 'warn' | 'bad' | 'info' {
  if (['accepted', 'succeeded', 'completed', 'approved'].includes(String(status))) return 'good';
  if (['failed', 'interrupted', 'blocked', 'rejected', 'outcome_unknown'].includes(String(status))) return 'bad';
  if (['needs_decision', 'review_required', 'review_discussion', 'awaiting_git', 'cancel_requested'].includes(String(status))) return 'warn';
  if (['running', 'ready', 'dispatched'].includes(String(status))) return 'info';
  return 'neutral';
}

export interface PageProps {
  projectId: string;
  snapshot: import('../types').Snapshot;
  refresh: () => Promise<void>;
}
