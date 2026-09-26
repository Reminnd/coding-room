import { useMemo, useState } from 'react';
import { Badge, Empty, Panel, formatTime, type PageProps } from '../components/Primitives';
import { api } from '../api';

export function HistoryPage({ projectId, snapshot }: PageProps) {
  const [filter, setFilter] = useState(''); const [query, setQuery] = useState('');
  const events = useMemo(() => snapshot.events.filter((event) => (!filter || event.type === filter) && (!query || `${event.summary} ${event.entity_id}`.toLowerCase().includes(query.toLowerCase()))), [snapshot.events, filter, query]);
  const types = [...new Set(snapshot.events.map((event) => event.type))].sort();
  return <div className="page-grid"><Panel title="历史与导出" className="span-all" aside={<a className="button primary" href={api.exportUrl(projectId)} download>导出 archive JSON</a>}><div className="toolbar"><label>类型<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">全部</option>{types.map((type) => <option key={type}>{type}</option>)}</select></label><label>搜索<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="summary / entity ID" /></label><span className="muted">导出只读 snapshot，不删除 SQLite 数据。</span></div>
      {events.length === 0 ? <Empty>没有匹配的 Event。</Empty> : <ol className="timeline">{events.map((event) => <li key={event.sequence}><div className="timeline-mark">{event.sequence}</div><div><div className="row-between"><strong>{event.summary}</strong><Badge>{event.type}</Badge></div><p>{event.entity_type} · {event.entity_id}</p><small>{formatTime(event.created_at)}</small></div></li>)}</ol>}
    </Panel></div>;
}
