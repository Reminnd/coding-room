import { useEffect, useState } from 'react';
import { api } from '../api';
import { workbenchApi, type Changes, type WorkbenchTask } from '../workbench-api';
import { ErrorNotice } from './Primitives';
import { Modal } from './Modal';

type DiffLine = { kind: 'meta' | 'context' | 'add' | 'remove'; text: string; before?: number; after?: number };
function diffLines(diff: string): DiffLine[] {
  let before = 1, after = 1;
  let inHunk = false;
  return diff.split('\n').filter((line, index, all) => index < all.length - 1 || line !== '').map((text) => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) { before = Number(hunk[1]); after = Number(hunk[2]); inHunk = true; return { kind: 'meta', text }; }
    if (!inHunk && (text.startsWith('+++') || text.startsWith('---'))) return { kind: 'meta', text };
    if (text.startsWith('+')) { inHunk = true; return { kind: 'add', text: text.slice(1), after: after++ }; }
    if (text.startsWith('-')) { inHunk = true; return { kind: 'remove', text: text.slice(1), before: before++ }; }
    if (text.startsWith(' ')) return { kind: 'context', text: text.slice(1), before: before++, after: after++ };
    return { kind: 'meta', text };
  });
}
function splitRows(lines: DiffLine[]): Array<{ before?: DiffLine; after?: DiffLine; meta?: string }> {
  const rows: Array<{ before?: DiffLine; after?: DiffLine; meta?: string }> = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (line.kind === 'meta') { rows.push({ meta: line.text }); index++; }
    else if (line.kind === 'context') { rows.push({ before: line, after: line }); index++; }
    else {
      const removed: DiffLine[] = [], added: DiffLine[] = [];
      while (index < lines.length && ['add', 'remove'].includes(lines[index].kind)) {
        const changed = lines[index++]; (changed.kind === 'add' ? added : removed).push(changed);
      }
      for (let offset = 0; offset < Math.max(removed.length, added.length); offset++) rows.push({ before: removed[offset], after: added[offset] });
    }
  }
  return rows;
}

export function ChangesPanel({ projectId, task, onDiscuss }: { projectId: string; task: WorkbenchTask; onDiscuss: (text: string) => void }) {
  const [changes, setChanges] = useState<Changes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [split, setSplit] = useState(false);
  const [comment, setComment] = useState<{ location: string; line: string } | null>(null);
  const [opinion, setOpinion] = useState('');
  async function read(file?: string) {
    setBusy(true); setError(null);
    try { setChanges(await workbenchApi.changes(projectId, task.id, file)); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  useEffect(() => { void read(); }, [projectId, task.id]);
  const lines = diffLines(changes?.diff ?? '');
  function cell(line: DiffLine | undefined, side: 'before' | 'after') {
    if (!line) return <td />;
    const number = line[side];
    const location = changes?.file + ':' + number + (side === 'after' ? '（修改后）' : '（修改前）');
    return <td className={'diff-' + line.kind}><span className="diff-number">{number}</span><code>{line.text}</code>{number !== undefined && !task.archived && !task.cancelled && <button className="diff-comment" aria-label={'对此行提意见：' + location} title="对此行提意见" onClick={() => { setComment({ location, line: line.text }); setOpinion(''); }}>＋</button>}</td>;
  }
  return <section><header className="page-heading"><h2>工作区变更</h2><div className="inline-options"><button disabled={busy} onClick={() => void read(changes?.file ?? undefined)}>重新读取变更</button><button disabled={!changes?.worktree_path || busy} onClick={() => void api.openVscode(projectId, task.run_id ?? undefined, changes?.file ?? undefined).catch((error: Error) => setError(error.message))}>在编辑器打开</button></div></header>
    <ErrorNotice error={error} /><p className="path-text">{changes?.branch} · {changes?.worktree_path ?? '尚未准备执行目录'}</p>
    <div className="inline-options"><button aria-pressed={!split} onClick={() => setSplit(false)}>统一</button><button aria-pressed={split} onClick={() => setSplit(true)}>并排</button><span className="muted">{changes?.files.length ?? 0} 个变更文件 · 当前文件 +{lines.filter((line) => line.kind === 'add').length} / −{lines.filter((line) => line.kind === 'remove').length}</span></div>
    <div className="changes-layout"><nav aria-label="变更文件">{changes?.files.map((file) => <button disabled={busy} className={changes.file === file ? 'active' : ''} key={file} onClick={() => void read(file)}>{file}</button>)}</nav>{changes?.files.length ? <div className="diff-scroll"><table className="diff-table" aria-label={split ? '并排 Diff' : '统一 Diff'}><thead><tr>{split ? <><th>修改前</th><th>修改后</th></> : <th>{changes.file}</th>}</tr></thead><tbody>{split ? splitRows(lines).map((row, index) => <tr key={index}>{row.meta !== undefined ? <td className="diff-meta" colSpan={2}>{row.meta}</td> : <>{cell(row.before, 'before')}{cell(row.after, 'after')}</>}</tr>) : lines.map((line, index) => <tr key={index}>{line.kind === 'meta' ? <td className="diff-meta">{line.text}</td> : cell(line, line.kind === 'remove' ? 'before' : 'after')}</tr>)}</tbody></table></div> : <div className="empty">暂无未提交的文件变更。</div>}</div>
    {comment && <Modal title="针对此处提意见" onClose={() => setComment(null)}><p className="path-text">{comment.location}</p><pre className="code-output">{comment.line}</pre><label>变更意见<textarea aria-label="变更意见" rows={4} value={opinion} onChange={(event) => setOpinion(event.target.value)} /></label><div className="editor-actions"><button onClick={() => setComment(null)}>取消</button><button className="primary" disabled={!opinion.trim()} onClick={() => { onDiscuss('针对 ' + comment.location + '\n> ' + comment.line + '\n' + opinion.trim()); setComment(null); }}>添加到讨论</button></div></Modal>}
  </section>;
}
