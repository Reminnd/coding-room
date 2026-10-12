import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Project } from '../types';
import { workbenchApi, type AgentStatus, type ProjectSettings } from '../workbench-api';
import { ErrorNotice, Field, SuccessNotice } from './Primitives';
import { Modal } from './Modal';

export function SettingsPanel({ project, initial, theme, setTheme, fontSize, setFontSize, onDirty, onSaved, onRemoved, onAgentChecked }: {
  project: Project; initial: ProjectSettings; theme: string; setTheme: (value: string) => void;
  fontSize: string; setFontSize: (value: string) => void; onDirty: (save: () => Promise<void>) => void;
  onAgentChecked: (kind: 'codex' | 'claude', status: AgentStatus) => void;
  onSaved: (settings: ProjectSettings) => Promise<void>; onRemoved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState({ ...initial, name: project.name });
  const [agents, setAgents] = useState<Partial<Record<'codex' | 'claude', AgentStatus>>>({});
  const [checking, setChecking] = useState<string | null>(null);
  const [login, setLogin] = useState<{ status: string; error: string | null } | null>(null);
  const [diagnostics, setDiagnostics] = useState<{ version: string; data_path: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void window.roomDesktop?.diagnostics().then(setDiagnostics).catch((error: Error) => setError(error.message));
    void workbenchApi.loginStatus().then(setLogin).catch((error: Error) => setError(error.message));
  }, []);
  useEffect(() => {
    if (!login || !['starting', 'pending'].includes(login.status)) return;
    const timer = setInterval(() => { void workbenchApi.loginStatus().then(setLogin).catch((error: Error) => setError(error.message)); }, 1500);
    return () => clearInterval(timer);
  }, [login]);
  async function save(value = draft) {
    setBusy(true); setError(null);
    try { const settings = await workbenchApi.saveSettings(project.project_id, value); await onSaved(settings); setSaved(true); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); throw error; }
    finally { setBusy(false); }
  }
  function edit(value: typeof draft) { setDraft(value); setSaved(false); onDirty(() => save(value)); }
  async function check(kind: 'codex' | 'claude') {
    setChecking(kind); setError(null);
    try { setAgents((values) => ({ ...values, [kind]: undefined })); const result = await workbenchApi.checkAgent(kind); setAgents((values) => ({ ...values, [kind]: result })); onAgentChecked(kind, result); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setChecking(null); }
  }
  async function signIn() {
    setChecking('login'); setError(null);
    try {
      const result = await workbenchApi.login();
      setLogin(await workbenchApi.loginStatus());
      if (window.roomDesktop) await window.roomDesktop.openReference(result.url); else window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setChecking(null); }
  }
  return <section><header className="page-heading"><h1>设置</h1></header><ErrorNotice error={error} /><SuccessNotice message={saved ? '项目设置已保存，新建任务将采用这些默认值。' : null} />
    <section className="panel"><header className="panel-head"><h2>项目</h2></header><div className="panel-body form-stack">
      <Field label="项目名称"><input value={draft.name} onChange={(event) => edit({ ...draft, name: event.target.value })} /></Field><p className="path-text">{project.project_path}</p>
      <Field label="默认开发入口"><select aria-label="默认开发入口" value={draft.default_mode} onChange={(event) => edit({ ...draft, default_mode: event.target.value as ProjectSettings['default_mode'] })}><option value="task">任务模式 · 原生 Plan</option><option value="sdd">规格模式 · SDD</option></select></Field>
      <Field label="默认验证方式"><select aria-label="默认验证方式" value={draft.default_verification} onChange={(event) => edit({ ...draft, default_verification: event.target.value as ProjectSettings['default_verification'] })}><option value="tdd">测试驱动</option><option value="standard">普通验证</option></select></Field>
      <details><summary>数据位置</summary><p className="path-text">{project.database_path}</p><p>{project.configuration_error ?? '项目绑定有效'}</p></details>
    </div></section>
    <section className="panel"><header className="panel-head"><h2>Agent</h2></header><div className="panel-body">
      {(['codex', 'claude'] as const).map((kind) => { const agent = agents[kind]; return <section className="agent-card" key={kind}><header className="page-heading"><h3>{kind === 'codex' ? 'Codex · 规划与 Review' : 'Claude Code · 执行'}</h3><button disabled={checking !== null} onClick={() => void check(kind)}>{checking === kind ? '检测中…' : '检测连接'}</button></header>
        {!agent ? <p className="muted">尚未检测</p> : <><p>{agent.connected ? '已连接本机客户端' : '连接不可用'}{agent.version ? ` · ${agent.version}` : ''}</p><p>{agent.requires_auth === false ? '当前 provider 不要求 OpenAI 登录' : agent.signed_in === true ? `已读取登录信息${agent.account_type ? ` · ${agent.account_type}` : ''}` : agent.signed_in === false ? '尚未登录' : '登录状态未确定'}</p><ErrorNotice error={agent.error} />{kind === 'codex' && <p>原生 Plan：{agent.native_plan ? '可用' : '未检测到'}</p>}</>}
        {kind === 'codex' ? <button disabled={checking !== null || login?.status === 'pending'} onClick={() => void signIn()}>登录 / 重新登录 Codex</button> : <p className="muted">使用 Claude CLI 当前模型与权限配置；在终端运行 <code>claude auth login</code> 登录，再检测连接。</p>}
      </section>; })}
      {login && <div role="status"><p>{login.status === 'completed' ? '登录完成，请重新检测连接。' : login.status === 'pending' ? '请在浏览器完成登录。' : login.status}</p><ErrorNotice error={login.error} />{login.status === 'pending' && <button onClick={() => void workbenchApi.cancelLogin().then(() => setLogin(null)).catch((error: Error) => setError(error.message))}>取消登录</button>}</div>}
      <Field label="Codex 规划模型"><select aria-label="Codex 规划模型" value={draft.codex_model ?? ''} onChange={(event) => edit({ ...draft, codex_model: event.target.value || null })}><option value="">使用 Codex 当前配置</option>{draft.codex_model && !agents.codex?.models?.some((model) => model.model === draft.codex_model) && <option value={draft.codex_model}>{draft.codex_model} · 待检测</option>}{agents.codex?.models?.map((model) => <option key={model.model} value={model.model}>{model.display_name}</option>)}</select></Field>
    </div></section>
    <section className="panel"><header className="panel-head"><h2>执行</h2></header><div className="panel-body"><p>每项任务使用独立 Git worktree。执行前的确认卡片显示实际目录、分支、影响范围和验证命令。</p><p className="muted">项目规范和执行器权限继续生效。保存这些默认设置不批准任何任务执行或 Git 交付。</p></div></section>
    <footer className="editor-actions"><button className="primary" disabled={busy || !draft.name.trim()} onClick={() => void save().catch(() => {})}>保存项目设置</button></footer>
    <section className="panel"><header className="panel-head"><h2>外观</h2></header><div className="panel-body form-stack"><Field label="主题"><select aria-label="主题" value={theme} onChange={(event) => setTheme(event.target.value)}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></Field><Field label="字号"><select aria-label="字号" value={fontSize} onChange={(event) => setFontSize(event.target.value)}><option value="14">标准</option><option value="16">大</option><option value="18">更大</option></select></Field></div></section>
    <section className="panel"><header className="panel-head"><h2>关于与诊断</h2></header><div className="panel-body"><p>Room {diagnostics?.version ?? '开发预览'}</p><p className="path-text">{diagnostics?.data_path ?? '浏览器预览无桌面日志目录'}</p>{window.roomDesktop && <button onClick={() => void window.roomDesktop!.openLogs().catch((error: Error) => setError(error.message))}>打开日志目录</button>}<details><summary>查看更新说明</summary><p>独立 Electron 任务工作台：原生 Plan、SDD、实际测试证据、Review、Git 交付与重启恢复。本版本由本地安装包更新。</p></details></div></section>
    <section className="panel"><header className="panel-head"><h2>从列表移除项目</h2></header><div className="panel-body"><p>仅移除本应用中的绑定，保留项目文件和数据库。</p><button onClick={() => setRemoving(true)}>从列表移除项目…</button></div></section>
    {removing && <Modal title="移除项目绑定？" onClose={() => setRemoving(false)}><p>{project.name}</p><p className="path-text">{project.project_path}</p><p>文件和数据库保留。再次打开同一目录可重新绑定。</p><ErrorNotice error={error} /><footer className="editor-actions"><button disabled={busy} onClick={() => setRemoving(false)}>返回</button><button disabled={busy} onClick={() => { setBusy(true); void api.removeProject(project.project_id).then(onRemoved).catch((error: Error) => setError(error.message)).finally(() => setBusy(false)); }}>确认移除绑定</button></footer></Modal>}
  </section>;
}
