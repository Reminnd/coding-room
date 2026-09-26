import { Badge, Empty, statusTone } from './Primitives';
import type { Entity } from '../types';

export function Dag({ revisions, workItems, onSelect }: { revisions: Entity[]; workItems: Entity[]; onSelect: (node: Entity) => void }) {
  const latest = [...revisions].sort((a, b) => Number(b.revision_no) - Number(a.revision_no))[0];
  const nodes = (latest?.nodes as Entity[] | undefined) ?? [];
  if (!latest || nodes.length === 0) return <Empty>当前没有 TaskGraphRevision。</Empty>;
  const positions = new Map(nodes.map((node, index) => [String(node.node_id), { x: 70 + (index % 3) * 230, y: 60 + Math.floor(index / 3) * 145 }]));
  const height = Math.max(180, Math.ceil(nodes.length / 3) * 145);
  return <div className="dag-wrap">
    <svg className="dag-lines" viewBox={`0 0 700 ${height}`} role="img" aria-label="Task dependency graph">
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
      {nodes.flatMap((node) => ((node.dependencies as string[] | undefined) ?? []).map((dependency) => {
        const from = positions.get(dependency); const to = positions.get(String(node.node_id));
        return from && to ? <line key={`${dependency}-${String(node.node_id)}`} x1={from.x + 70} y1={from.y + 26} x2={to.x} y2={to.y + 26} markerEnd="url(#arrow)" /> : null;
      }))}
    </svg>
    <div className="dag-nodes" style={{ minHeight: height }}>
      {nodes.map((node) => {
        const pos = positions.get(String(node.node_id))!;
        const work = workItems.find((item) => item.node_id === node.node_id);
        return <button type="button" className="dag-node" style={{ left: pos.x, top: pos.y }} key={String(node.node_id)} onClick={() => onSelect(node)}>
          <strong>{String(node.node_id)}</strong>
          <span>{String(node.kind)}</span>
          <Badge tone={statusTone(work?.waiting_reason)}>{String(work?.waiting_reason ?? 'draft')}</Badge>
        </button>;
      })}
    </div>
  </div>;
}
