import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { Project, Snapshot } from './types';
import { OverviewPage } from './pages/OverviewPage';
import { PlansPage } from './pages/PlansPage';
import { ExecutionsPage } from './pages/ExecutionsPage';
import { QuestionsPage } from './pages/QuestionsPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { GitPage } from './pages/GitPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { ErrorNotice, Field, Panel } from './components/Primitives';

const pages = [
  ['overview', '总览', '⌂'], ['plans', '计划 / Tasks', '◇'], ['executions', '执行', '▶'], ['questions', 'Questions', '?'],
  ['reviews', 'Reviews', '✓'], ['git', 'Git', '⑂'], ['history', '历史', '↺'], ['settings', '设置', '⚙'],
] as const;
type Page = typeof pages[number][0];

function Setup({ projects, onChanged }: { projects: Project[]; onChanged: (project?: Project) => Promise<void> }) {
  const [mode, setMode] = useState<'runtime' | 'manual'>('runtime');
  const [runtime, setRuntime] = useState({ projectPath: '', name: '' });
  const [manual, setManual] = useState({ name: '', projectPath: '', databasePath: '', roomId: '', control: 'codex-app', port: '' });
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setError(null);
    try {
      const project = mode === 'runtime'
        ? await api.importRuntime({ project_path: runtime.projectPath, ...(runtime.name ? { name: runtime.name } : {}) })
        : await api.addProject({ name: manual.name, project_path: manual.projectPath, database_path: manual.databasePath, room_id: manual.roomId, control_participant_id: manual.control, port: manual.port ? Number(manual.port) : null });
      await onChanged(project);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }
  return <main className="setup-shell"><div className="setup-card"><div className="brand large"><span>AR</span><div><strong>Agent Room</strong><small>本地协作工作台</small></div></div><h1>{projects.length ? '添加项目' : '连接第一个项目'}</h1><p>优先读取项目已有 `.agent-room/runtime.json`。绑定不会创建、迁移或覆盖数据库。</p><div className="segmented"><button className={mode === 'runtime' ? 'active' : ''} onClick={() => setMode('runtime')}>读取 runtime.json</button><button className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}>手动绑定</button></div><ErrorNotice error={error} />
      {mode === 'runtime' ? <div className="form-stack"><Field label="项目绝对路径"><input value={runtime.projectPath} onChange={(e) => setRuntime({ ...runtime, projectPath: e.target.value })} placeholder="D:\\work\\project" /></Field><Field label="显示名称（可选）"><input value={runtime.name} onChange={(e) => setRuntime({ ...runtime, name: e.target.value })} /></Field></div> : <div className="form-stack"><Field label="名称"><input value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} /></Field><Field label="项目绝对路径"><input value={manual.projectPath} onChange={(e) => setManual({ ...manual, projectPath: e.target.value })} /></Field><Field label="SQLite 绝对路径"><input value={manual.databasePath} onChange={(e) => setManual({ ...manual, databasePath: e.target.value })} /></Field><div className="form-grid"><Field label="Room ID"><input value={manual.roomId} onChange={(e) => setManual({ ...manual, roomId: e.target.value })} /></Field><Field label="Control participant"><input value={manual.control} onChange={(e) => setManual({ ...manual, control: e.target.value })} /></Field><Field label="MCP port（可选）"><input type="number" value={manual.port} onChange={(e) => setManual({ ...manual, port: e.target.value })} /></Field></div></div>}
      <button className="primary wide" onClick={() => void submit()}>保存项目绑定</button></div></main>;
}

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(localStorage.getItem('room-ui-project') ?? '');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [launches, setLaunches] = useState<Array<Record<string, unknown>>>([]);
  const [page, setPage] = useState<Page>('overview');
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [lastError, setLastError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [theme, setThemeState] = useState(localStorage.getItem('room-ui-theme') ?? 'system');

  const selected = projects.find((project) => project.project_id === projectId) ?? null;
  const setTheme = (value: string) => { setThemeState(value); localStorage.setItem('room-ui-theme', value); };
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const loadProjects = useCallback(async (preferred?: Project) => {
    try {
      const result = await api.projects(); setProjects(result);
      const next = preferred?.project_id ?? (result.some((project) => project.project_id === projectId) ? projectId : result[0]?.project_id ?? '');
      setProjectId(next); if (next) localStorage.setItem('room-ui-project', next); setShowSetup(false);
    } catch (err) { setConnection('error'); setLastError(err instanceof Error ? err.message : String(err)); }
  }, [projectId]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const [state, currentLaunches] = await Promise.all([api.state(projectId), api.launches(projectId)]);
      setSnapshot(state); setLaunches(currentLaunches); setConnection('connected');
    } catch (err) {
      setConnection('error'); setLastError(err instanceof Error ? err.message : String(err));
    }
  }, [projectId]);

  useEffect(() => { void loadProjects(); }, []);
  useEffect(() => { setSnapshot(null); setConnection('connecting'); void refresh(); const timer = window.setInterval(() => void refresh(), 4000); return () => window.clearInterval(timer); }, [refresh]);

  const pending = useMemo(() => snapshot ? snapshot.questions.filter((q) => q.status === 'open').length + snapshot.runs.filter((r) => ['review_required', 'review_discussion'].includes(r.status)).length : 0, [snapshot]);
  async function planning(action: string) { try { await api.action(projectId, action, {}); await refresh(); } catch (err) { setLastError(err instanceof Error ? err.message : String(err)); } }

  if (projects.length === 0 || showSetup) return <Setup projects={projects} onChanged={loadProjects} />;
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span>AR</span><div><strong>Agent Room</strong><small>local workbench</small></div></div><label className="project-picker"><span>项目</span><select value={projectId} onChange={(e) => { setProjectId(e.target.value); localStorage.setItem('room-ui-project', e.target.value); }} aria-label="选择项目">{projects.map((project) => <option value={project.project_id} key={project.project_id}>{project.name}</option>)}</select></label><nav>{pages.map(([id, label, icon]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><span>{icon}</span>{label}{id === 'questions' && pending > 0 && <em>{pending}</em>}</button>)}</nav><div className="sidebar-foot"><button onClick={() => setShowSetup(true)}>＋ 添加项目</button><small>{selected?.project_path}</small></div></aside>
    <div className="workspace"><header className="topbar"><div><div className="eyebrow">{selected?.name}</div><h1>{pages.find(([id]) => id === page)?.[1]}</h1></div><div className="header-actions"><span className={`connection ${connection}`}><i />{connection === 'connected' ? '已连接' : connection === 'connecting' ? '连接中' : '连接异常'}</span>{snapshot && <span className="room-chip">{snapshot.room.room_id} · {snapshot.room.state}</span>}<button onClick={() => void refresh()}>刷新</button><button onClick={() => void api.openVscode(projectId)}>VS Code</button></div></header>
      {lastError && <div className="persistent-error" role="alert"><span>{lastError}</span><button onClick={() => setLastError(null)}>关闭</button></div>}
      {selected?.configuration_error && <div className="setup-warning"><div><strong>项目配置未就绪</strong><p>{selected.configuration_error}</p></div>{!selected.database_exists && <button className="primary" onClick={async () => { try { await api.createRoom(projectId); await loadProjects(); await refresh(); } catch (err) { setLastError(err instanceof Error ? err.message : String(err)); } }}>显式创建新 Room</button>}</div>}
      {snapshot && <div className="planning-bar"><span>Planning：<strong>{snapshot.room.state}</strong></span><button disabled={snapshot.room.state !== 'DISCUSSION'} title="仅 DISCUSSION 可进入" onClick={() => void planning('begin-architecture-review')}>开始 Architecture Review</button><button disabled={snapshot.room.state !== 'ARCHITECTURE_REVIEW'} title="仅 ARCHITECTURE_REVIEW 可进入" onClick={() => void planning('request-user-confirmation')}>请求用户确认</button></div>}
      <main className="content">{!snapshot ? <Panel title="Room 状态"><div className="loading"><span />正在读取所选项目的 durable snapshot…</div></Panel> : <>
        {page === 'overview' && <OverviewPage projectId={projectId} snapshot={snapshot} refresh={refresh} />}
        {page === 'plans' && <PlansPage projectId={projectId} snapshot={snapshot} refresh={refresh} />}
        {page === 'executions' && <ExecutionsPage projectId={projectId} snapshot={snapshot} refresh={refresh} launches={launches} />}
        {page === 'questions' && <QuestionsPage projectId={projectId} snapshot={snapshot} refresh={refresh} />}
        {page === 'reviews' && <ReviewsPage projectId={projectId} snapshot={snapshot} refresh={refresh} />}
        {page === 'git' && <GitPage projectId={projectId} snapshot={snapshot} refresh={refresh} />}
        {page === 'history' && <HistoryPage projectId={projectId} snapshot={snapshot} refresh={refresh} />}
        {page === 'settings' && selected && <SettingsPage projectId={projectId} snapshot={snapshot} refresh={refresh} theme={theme} setTheme={setTheme} project={selected} removeProject={async () => { await api.removeProject(projectId); localStorage.removeItem('room-ui-project'); setSnapshot(null); await loadProjects(); }} />}
      </>}</main>
    </div>
  </div>;
}
