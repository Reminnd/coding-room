import { useState } from 'react';
import { ErrorNotice, formatTime } from './Primitives';
import { SourceEditor } from './SourceEditor';
import { workbenchApi, type Source } from '../workbench-api';

export function SourceLibrary({ projectId, sources, refresh, onUse }: { projectId: string; sources: Source[]; refresh: () => Promise<void>; onUse?: (source: Source) => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Source | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function action(source: Source, run: () => Promise<unknown>) {
    setBusy(source.id); setError(null);
    try { await run(); await refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(null); }
  }
  const filtered = sources.filter((source) => `${source.label} ${source.location}`.toLowerCase().includes(query.toLowerCase()));
  return <section><header className="page-heading"><div><p className="eyebrow">上下文与参考</p><h1>项目资料</h1></div><button className="primary" onClick={() => setEditing('new')}>添加资料</button></header>
    <ErrorNotice error={error} /><input className="search" aria-label="搜索资料" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或位置" />
    {(['project', 'external'] as const).map((ownership) => <section className="source-group" key={ownership}><h2>{ownership === 'project' ? '本项目资料' : '外部参考'}</h2>
      {filtered.filter((source) => source.ownership === ownership).map((source) => <article className="source-card" key={source.id}><div><strong>{source.label}</strong><span className="badge">{source.purpose === 'constraints' ? '需求 / 接口 / 约束' : '实现与模块参考'}</span><p className="path-text">{source.location}</p>
        <p className="muted">{source.reading ? `${source.reading.status === 'readable' ? '预览已读取' : '读取失败'} · ${formatTime(source.reading.checked_at)}` : '待读取'}</p>
        <ErrorNotice error={source.reading?.error ?? null} />
        {source.reading?.status === 'readable' && <details><summary>查看读取预览</summary><p className="muted">{source.reading.truncated ? '只展示部分内容。' : ''}目录预览只列出条目；Agent 是否采用此来源以任务对话为准。</p><pre className="code-output">{source.reading.preview || '空文件或空目录'}</pre></details>}
      </div><div className="inline-options"><button disabled={busy !== null} onClick={() => void action(source, () => workbenchApi.openSource(projectId, source.id))}>打开原文</button><button disabled={busy !== null} onClick={() => void action(source, () => workbenchApi.readSource(projectId, source.id))}>{busy === source.id ? '处理中…' : source.reading?.status === 'failed' ? '重试读取' : '读取预览'}</button>{onUse && <button disabled={busy !== null} onClick={() => void action(source, () => onUse(source))}>用于当前任务</button>}<button onClick={() => setEditing(source)}>更正分类</button><button disabled={busy !== null} onClick={() => void action(source, () => workbenchApi.removeSource(projectId, source.id))}>从资料库移除</button></div></article>)}
      {!filtered.some((source) => source.ownership === ownership) && <p className="muted">没有匹配的资料</p>}
    </section>)}
    {editing && <SourceEditor projectId={projectId} initial={editing === 'new' ? undefined : editing} onSaved={refresh} onClose={() => setEditing(null)} />}
  </section>;
}
