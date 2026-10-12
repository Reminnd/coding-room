import { useState } from 'react';
import { ErrorNotice, Field } from './Primitives';
import { Modal } from './Modal';
import { workbenchApi, type Source, type SourceDraft } from '../workbench-api';

export function SourceEditor({ projectId, initial, onSaved, onClose }: { projectId: string; initial?: Source; onSaved: (source: Source) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState<SourceDraft>(initial ?? { label: '', kind: 'document', ownership: 'project', location: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [dirty, setDirty] = useState(false);
  function edit(value: SourceDraft) { setDraft(value); setDirty(true); }
  function close() { if (dirty) setDiscarding(true); else onClose(); }
  async function browse(kind: 'file' | 'directory') {
    try {
      const path = await window.roomDesktop?.selectReference(kind);
      if (path) edit({ ...draft, location: path, label: draft.label || path.split(/[\\/]/).at(-1) || '' });
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  }
  async function save() {
    setBusy(true); setError(null);
    try { await onSaved(await workbenchApi.saveSource(projectId, draft)); onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <Modal title={initial ? '编辑资料' : '添加资料'} onClose={close}>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}><ErrorNotice error={error} />
      <div className="form-stack">
        <Field label="名称"><input required value={draft.label} onChange={(event) => edit({ ...draft, label: event.target.value })} /></Field>
        <Field label="类型"><select aria-label="类型" value={draft.kind} onChange={(event) => edit({ ...draft, kind: event.target.value as Source['kind'] })}><option value="repository">GitHub 仓库</option><option value="document">文档</option><option value="code">代码文件 / 目录</option></select></Field>
        <Field label="归属"><select aria-label="归属" value={draft.ownership} onChange={(event) => edit({ ...draft, ownership: event.target.value as Source['ownership'] })}><option value="project">本项目</option><option value="external">外部参考</option></select></Field>
        <Field label="文件位置或 URL"><input required value={draft.location} onChange={(event) => edit({ ...draft, location: event.target.value })} placeholder="项目相对路径、绝对路径或 URL" /></Field>
        {window.roomDesktop && <div className="inline-options"><button type="button" onClick={() => void browse('file')}>浏览文件</button><button type="button" onClick={() => void browse('directory')}>浏览目录</button></div>}
        <p className="muted">{draft.kind === 'document' && draft.ownership === 'project' ? '作为本项目需求、接口与约束来源。' : '用于参考实现与模块组织。'}</p>
      </div>
      {discarding && <div role="alert"><p>资料有未保存的修改。</p><button type="button" onClick={() => setDiscarding(false)}>继续编辑</button><button type="button" onClick={onClose}>放弃修改</button></div>}
      <footer className="editor-actions"><button type="button" disabled={busy} onClick={close}>取消</button><button className="primary push-right" disabled={busy}>{busy ? '保存中…' : '保存资料'}</button></footer>
    </form>
  </Modal>;
}
