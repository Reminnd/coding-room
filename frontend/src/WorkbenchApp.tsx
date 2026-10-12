import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { savePreference } from './preferences';
import { api } from './api';
import type { Project, Snapshot } from './types';
import { workbenchApi, type Source, type TaskDraft, type WorkbenchTask, type ProjectSettings, type AgentStatus } from './workbench-api';
import { LegacyTasks, legacyTasks } from './components/LegacyTasks';
import { HistoryExport } from './components/HistoryExport';
import { ExecutionContext } from './components/ExecutionContext';
import { TaskEditor } from './components/TaskEditor';
import { TaskActions } from './components/TaskActions';
import { SettingsPanel } from './components/SettingsPanel';
import { DiscussionPanel } from './components/DiscussionPanel';
import { SourceLibrary } from './components/SourceLibrary';
import { PlanPanel } from './components/PlanPanel';
import { RunPanel } from './components/RunPanel';
import { ChangesPanel } from './components/ChangesPanel';
import { Modal } from './components/Modal';
import { ErrorNotice, formatTime } from './components/Primitives';

const tabs = ['对话', '方案', '执行', '测试', '变更', '验收'] as const;
type View = 'all' | 'pending' | 'running' | 'completed' | 'sources' | 'history' | 'settings' | 'new' | 'detail' | 'edit';
type Tab = typeof tabs[number];
const labels: Partial<Record<View, string>> = { all: '全部任务', pending: '待我处理', running: '进行中', completed: '已完成', sources: '项目资料', history: '项目历史', settings: '设置' };

function taskStatus(task: WorkbenchTask, snapshot: Snapshot | null, activeRuns: Set<string>): string {
  if (task.archived) return '已归档';
  if (task.cancelled) return '已取消';
  const run = snapshot?.runs.find((run) => run.run_id === task.run_id);
  if (run && ['running', 'cancel_requested'].includes(run.status) && !activeRuns.has(run.run_id)) return '执行状态未知';
  if (run) return ({ ready: '待执行', running: '执行中', needs_decision: '待回答', review_required: '待审阅', review_discussion: '待验收', accepted: '已完成', failed: '执行失败', canceled: '已停止', interrupted: '已中断' } as Record<string, string>)[run.status] ?? run.status;
  return task.proposal ? '待确认方案' : task.thread_id ? '讨论中' : '草稿';
}

const pendingStatuses = new Set(['待确认方案', '待回答', '待审阅', '待验收', '执行状态未知']);
type PendingState = { count: number; error: string | null };

function ProjectWorkspace({ pending, project, onSwitch, onOpen, projects, onProjectsChanged, theme, setTheme, fontSize, setFontSize }: { pending: Record<string, PendingState>; theme: string; setTheme: (value: string) => void; fontSize: string; setFontSize: (value: string) => void; project: Project; projects: Project[]; onSwitch: (id: string, pending?: boolean) => void; onOpen: () => void; onProjectsChanged: () => Promise<void> }) {
  const [tasks, setTasks] = useState<WorkbenchTask[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [activeRuns, setActiveRuns] = useState<Set<string>>(new Set());
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [view, setView] = useState<View>(() => { const value = localStorage.getItem(`room-view-${project.project_id}`); return value && ['all', 'pending', 'running', 'completed', 'sources', 'history', 'settings', 'detail'].includes(value) ? value as View : 'all'; });
  const [selected, setSelected] = useState<string | null>(() => localStorage.getItem(`room-task-${project.project_id}`));
  const [tab, setTab] = useState<Tab>(() => { const value = localStorage.getItem(`room-tab-${project.project_id}`); return tabs.includes(value as Tab) ? value as Tab : '对话'; });
  const [query, setQuery] = useState(() => localStorage.getItem(`room-query-${project.project_id}`) ?? '');
  const [dateFrom, setDateFrom] = useState(localStorage.getItem(`room-date-from-${project.project_id}`) ?? '');
  const [dateTo, setDateTo] = useState(localStorage.getItem(`room-date-to-${project.project_id}`) ?? '');
  const [filter, setFilter] = useState(() => localStorage.getItem(`room-filter-${project.project_id}`) ?? '全部状态');
  const [error, setError] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [context, setContext] = useState(true);
  const [viewport, setViewport] = useState(window.innerWidth);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [contextDrawer, setContextDrawer] = useState(false);
  const compact = viewport < 1000;
  const narrow = viewport < 1280;
  useEffect(() => { const resize = () => setViewport(window.innerWidth); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  useEffect(() => { if (!compact) setNavigationOpen(false); if (!narrow) setContextDrawer(false); }, [compact, narrow]);
  const [pendingDraft, setPendingDraft] = useState<TaskDraft | null>(null);
  const [pendingForm, setPendingForm] = useState<(() => Promise<void>) | null>(null);
  const [agentStatus, setAgentStatus] = useState<Partial<Record<'codex' | 'claude', AgentStatus>>>({});
  const agentLabel = (kind: 'codex' | 'claude') => { const result = agentStatus[kind]; return !result ? '未检测' : !result.connected ? '不可用' : result.requires_auth === false ? '已连接' : result.signed_in === true ? '已登录' : result.signed_in === false ? '未登录' : '登录未确定'; };
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const listScroll = useRef(0);
  const content = useRef<HTMLElement>(null);
  const scrollKey = `room-scroll-${project.project_id}-${view}-${view === 'detail' ? `${selected}-${tab}` : ''}`;
  const hasSnapshot = snapshot !== null;
  useLayoutEffect(() => {
    const element = content.current;
    if (!element || !hasSnapshot) return;
    element.scrollTop = Number(localStorage.getItem(scrollKey)) || 0;
    const saveScroll = () => savePreference(scrollKey, String(element.scrollTop));
    element.addEventListener('scroll', saveScroll);
    return () => element.removeEventListener('scroll', saveScroll);
  }, [scrollKey, hasSnapshot, tasks.length]);
  const lastList = useRef<View>((localStorage.getItem(`room-list-${project.project_id}`) as View) || 'all');
  useEffect(() => {
    savePreference(`room-view-${project.project_id}`, ['new', 'edit'].includes(view) ? 'all' : view);
    savePreference(`room-task-${project.project_id}`, selected);
    savePreference(`room-tab-${project.project_id}`, tab);
    savePreference(`room-list-${project.project_id}`, lastList.current);
  }, [view, selected, tab, project.project_id]);
  const selectedTask = tasks.find((task) => task.id === selected);
  const readOnly = Boolean(selectedTask?.archived || selectedTask?.cancelled);
  const refresh = useCallback(async () => {
    const [tasks, sources, state, launches, preferences] = await Promise.all([workbenchApi.tasks(project.project_id), workbenchApi.sources(project.project_id), api.state(project.project_id), api.launches(project.project_id), workbenchApi.settings(project.project_id)]);
    setSettings(preferences);
    setTasks(tasks); setSources(sources); setSnapshot(state);
    setActiveRuns(new Set(launches.filter((launch) => ['starting', 'running'].includes(String(launch.status))).map((launch) => String(launch.run_id))));
  }, [project.project_id]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function update() {
      try { await refresh(); if (active) setError(null); }
      catch (error) { if (active) setError(error instanceof Error ? error.message : String(error)); }
      if (active) timer = setTimeout(() => void update(), 4000);
    }
    void update();
    void api.git(project.project_id).then((git) => { if (active) setBranch(git.branch); }).catch(() => { if (active) setBranch(null); });
    return () => { active = false; clearTimeout(timer); };
  }, [project.project_id, refresh]);
  function navigate(action: () => void) {
    setNavigationOpen(false);
    if (pendingDraft || pendingForm) setPendingNavigation(() => action); else action();
  }
  function openTask(task: WorkbenchTask) {
    lastList.current = view; listScroll.current = content.current?.scrollTop ?? 0;
    const status = taskStatus(task, snapshot, activeRuns);
    const target: Tab = ['待回答', '执行状态未知', '执行中', '执行失败', '已停止', '已中断', '待执行'].includes(status) ? '执行' : ['待审阅', '待验收', '已完成'].includes(status) ? '验收' : task.proposal ? '方案' : '对话';
    setSelected(task.id); setTab(target); setView('detail');
  }
  function back() {
    setView(lastList.current);
    requestAnimationFrame(() => {
      if (content.current) content.current.scrollTop = listScroll.current;
      const target = document.getElementById(`task-${selected}`) ?? content.current?.querySelector<HTMLElement>('h1');
      target?.focus();
    });
  }
  async function saveBeforeLeaving() {
    if (pendingForm) {
      try { await pendingForm(); setPendingForm(null); setPendingNavigation(null); pendingNavigation?.(); }
      catch (error) { setError(error instanceof Error ? error.message : String(error)); }
      return;
    }
    if (!pendingDraft) return;
    try { await workbenchApi.saveTask(project.project_id, pendingDraft); setPendingDraft(null); setPendingNavigation(null); pendingNavigation?.(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  }
  function matchesDate(timestamp: string) {
    if (view !== 'history') return true;
    const date = new Date(timestamp);
    const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    return (!dateFrom || key >= dateFrom) && (!dateTo || key <= dateTo);
  }
  const visible = tasks.filter((task) => {
    const status = taskStatus(task, snapshot, activeRuns);
    if (!matchesDate(task.updated_at)) return false;
    if (!task.title.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter !== '全部状态' && status !== filter) return false;
    if (view === 'history') return task.archived || task.cancelled || status === '已完成';
    if (task.archived || task.cancelled) return false;
    if (view === 'pending') return pendingStatuses.has(status);
    if (view === 'running') return ['执行中', '讨论中', '待执行'].includes(status);
    if (view === 'completed') return status === '已完成';
    return true;
  });
  const legacy = legacyTasks(snapshot, tasks, activeRuns).filter(({ task, run, status }) => {
    if (!matchesDate(run?.updated_at ?? String(task.created_at))) return false;
    if (!String(task.goal).toLowerCase().includes(query.toLowerCase()) || (filter !== '全部状态' && filter !== status)) return false;
    if (view === 'pending') return pendingStatuses.has(status);
    if (view === 'running') return ['执行中', '待执行'].includes(status);
    if (view === 'completed' || view === 'history') return status === '已完成' || (view === 'history' && status === '已停止');
    return true;
  });
  const inTask = view === 'detail' && selectedTask;
  const navigation = <><button className="primary new-task" onClick={() => navigate(() => { lastList.current = view; setView('new'); })}>＋ 新建任务</button><nav aria-label="工作台导航">{(['pending', 'all', 'running', 'completed', 'sources', 'history'] as View[]).map((item) => <button key={item} className={view === item ? 'active' : ''} aria-current={view === item ? 'page' : undefined} onClick={() => navigate(() => setView(item))}>{labels[item]}</button>)}</nav><div className="sidebar-footer"><p>{project.name}</p><small className="path-text">{project.project_path}</small></div></>;
  const overview = selectedTask ? <><h3>目标</h3><p>{selectedTask.goal || '尚未填写'}</p><h3>本次资料</h3>{selectedTask.source_ids.length ? selectedTask.source_ids.map((id) => { const source = sources.find((item) => item.id === id); return <p key={id}>{source?.label ?? '历史来源'}<small>{source?.purpose === 'constraints' ? '项目约束' : '实现参考'}</small></p>; }) : <p className="muted">未附加资料</p>}</> : null;
  return <div className="workbench-shell"><header className="app-topbar">{compact && <button onClick={() => { setContextDrawer(false); setNavigationOpen(true); }}>导航</button>}<span className="wordmark">Room<span>任务工作台</span></span><select aria-label="切换项目" value={project.project_id} onChange={(e) => navigate(() => onSwitch(e.target.value))}>{projects.map((item) => <option key={item.project_id} value={item.project_id}>{item.name} · {pending[item.project_id]?.error ? '状态不可用' : pending[item.project_id] ? `${pending[item.project_id].count} 项待办` : '读取中'}</option>)}</select><button onClick={() => navigate(onOpen)}>打开项目</button><details className="project-pending"><summary>{projects.some((item) => item.project_id !== project.project_id && (pending[item.project_id]?.count ?? 0) > 0) ? '其他项目有待办' : '项目待办'}</summary><div>{projects.map((item) => <div key={item.project_id}>{pending[item.project_id]?.error ? <p title={pending[item.project_id].error!}>{item.name} · 状态不可用</p> : <button disabled={!pending[item.project_id]} onClick={() => navigate(() => { if (item.project_id === project.project_id) { setQuery(''); setFilter('全部状态'); setView('pending'); } else onSwitch(item.project_id, true); })}>{item.name} · {pending[item.project_id]?.count ?? '…'} 项待办</button>}</div>)}</div></details><button className="agent-status" aria-label="Agent 状态" title="上次连接检测结果；点击进入设置重新检测" onClick={() => navigate(() => setView('settings'))}>Codex {agentLabel('codex')} · Claude {agentLabel('claude')}</button><span className="project-branch push-right" title={project.project_path}>项目分支 · {branch ?? '未识别 Git 分支'}</span><button onClick={() => navigate(() => setView('settings'))}>设置</button></header>
    {!compact && <aside className="app-sidebar">{navigation}</aside>}
    <main ref={content} className="workbench-content"><ErrorNotice error={error} />{error && <section className="notice"><p>{snapshot ? '已保留上次读取的项目记录。' : '项目状态不可用'}</p><button onClick={() => void refresh().then(() => setError(null)).catch((error: Error) => setError(error.message))}>重新读取项目</button></section>}
      {(view === 'new' || view === 'edit') && settings && <TaskEditor key={view + selected} projectId={project.project_id} initial={view === 'edit' ? selectedTask : undefined} sources={sources} refresh={refresh} defaults={settings} onDirty={setPendingDraft} onCancel={() => navigate(back)} onSaved={(task, discuss) => { setPendingDraft(null); setSelected(task.id); setTab('对话'); setView(discuss ? 'detail' : 'all'); void refresh(); }} />}
      {view === 'sources' && <SourceLibrary projectId={project.project_id} sources={sources} refresh={refresh} onUse={selectedTask && !selectedTask.run_id && !readOnly ? async (source) => { await workbenchApi.saveTask(project.project_id, { ...selectedTask, source_ids: [...new Set([...selectedTask.source_ids, source.id])] }); await refresh(); setView('detail'); } : undefined} />}
      {view === 'settings' && settings && <SettingsPanel onAgentChecked={(kind, status) => setAgentStatus((values) => ({ ...values, [kind]: status }))} project={project} initial={settings} theme={theme} setTheme={setTheme} fontSize={fontSize} setFontSize={setFontSize} onDirty={(save) => setPendingForm(() => save)} onSaved={async (value) => { setSettings(value); setPendingForm(null); await onProjectsChanged(); }} onRemoved={async () => { await onProjectsChanged(); onSwitch(''); }} />}
      {['all', 'pending', 'running', 'completed', 'history'].includes(view) && <section><header className="page-heading"><div><p className="eyebrow">{project.name}</p><h1 tabIndex={-1}>{labels[view]}</h1></div><div className="inline-options"><span className="muted">{snapshot ? `${visible.length + legacy.length} 项任务` : error ? '状态不可用' : '读取中…'}</span>{view === 'history' && <HistoryExport projectId={project.project_id} tasks={visible} legacy={legacy} sources={sources} snapshot={snapshot} />}</div></header><div className="list-toolbar"><input className="search" aria-label="搜索任务标题" placeholder="搜索任务标题" value={query} onChange={(e) => { setQuery(e.target.value); savePreference(`room-query-${project.project_id}`, e.target.value); }} /><select aria-label="状态筛选" value={filter} onChange={(e) => { setFilter(e.target.value); savePreference(`room-filter-${project.project_id}`, e.target.value); }}>{['全部状态', '草稿', '讨论中', '待确认方案', '执行中', '待回答', '待验收', '已完成', '已归档', '已取消', '已停止', '执行失败', '执行状态未知'].map((value) => <option key={value}>{value}</option>)}</select>{view === 'history' && <><label>更新日期从<input aria-label="更新日期从" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); savePreference(`room-date-from-${project.project_id}`, event.target.value); }} /></label><label>更新日期至<input aria-label="更新日期至" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); savePreference(`room-date-to-${project.project_id}`, event.target.value); }} /></label></>}</div><div className="task-list">{visible.map((task) => <article className="task-row" key={task.id}><button id={`task-${task.id}`} className="task-title" onClick={() => openTask(task)}>{task.title || '未命名草稿'}<small>{task.goal || '尚未填写目标'}</small></button><span className="badge">{task.mode === 'sdd' ? 'SDD' : '任务模式'}</span><span className="muted">{task.verification === 'tdd' ? '测试驱动' : '普通验证'}</span><span className="badge">{taskStatus(task, snapshot, activeRuns)}</span><time>{formatTime(task.updated_at)}</time></article>)}</div><LegacyTasks entries={legacy} snapshot={snapshot} />{snapshot && !visible.length && !legacy.length && <div className="empty"><h2>{query || filter !== '全部状态' || (view === 'history' && (dateFrom || dateTo)) ? '没有匹配的任务' : '暂无任务'}</h2><p>{query || filter !== '全部状态' || (view === 'history' && (dateFrom || dateTo)) ? '调整搜索或筛选条件。' : '请使用导航中的“＋ 新建任务”。'}</p>{(query || filter !== '全部状态' || (view === 'history' && (dateFrom || dateTo))) && <button onClick={() => { setQuery(''); setFilter('全部状态'); setDateFrom(''); setDateTo(''); savePreference(`room-date-from-${project.project_id}`, null); savePreference(`room-date-to-${project.project_id}`, null); savePreference(`room-query-${project.project_id}`, null); savePreference(`room-filter-${project.project_id}`, null); }}>清除筛选</button>}</div>}</section>}
      {inTask && <section className="task-detail"><button className="back-link" onClick={() => navigate(back)}>← 返回任务列表</button><header className="page-heading"><div><h1>{selectedTask.title || '未命名草稿'}</h1><p className="muted">{taskStatus(selectedTask, snapshot, activeRuns)} · {selectedTask.mode === 'sdd' ? 'SDD' : '原生 Plan'} · {selectedTask.verification === 'tdd' ? '测试驱动' : '普通验证'}</p><ExecutionContext key={selectedTask.id} projectId={project.project_id} taskId={selectedTask.id} runId={selectedTask.run_id} path={snapshot?.runs.find((run) => run.run_id === selectedTask.run_id)?.worktree_path ?? null} /></div><div className="inline-options">{!selectedTask.run_id && !readOnly && <button onClick={() => navigate(() => setView('edit'))}>编辑任务</button>}<TaskActions disabled={!!pendingForm} projectId={project.project_id} task={selectedTask} accepted={snapshot?.runs.find((run) => run.run_id === selectedTask.run_id)?.status === 'accepted'} onChanged={async (task, followup) => { await refresh(); if (followup) { setSelected(task.id); setView('edit'); } }} /><button onClick={() => { if (narrow) { setNavigationOpen(false); setContextDrawer(!contextDrawer); } else setContext(!context); }}>{(narrow ? contextDrawer : context) ? '收起概况' : '任务概况'}</button></div></header><nav className="task-tabs" aria-label="任务页面">{tabs.map((item) => <button key={item} className={tab === item ? 'active' : ''} aria-current={tab === item ? 'page' : undefined} onClick={() => { if (item !== tab) navigate(() => setTab(item)); }}>{item}</button>)}</nav><div className={`task-body ${context && !narrow ? '' : 'without-context'}`}><div className="task-main">{readOnly && <p className="notice">历史记录只读。可从任务菜单新建后续任务，或恢复已归档任务。</p>}{selectedTask.origin_task_id && <button className="back-link" onClick={() => { const origin = tasks.find((task) => task.id === selectedTask.origin_task_id); if (origin) navigate(() => openTask(origin)); }}>查看来源任务</button>}{tab === '对话' && <DiscussionPanel key={selectedTask.id} projectId={project.project_id} task={selectedTask} onChanged={() => void refresh()} onPlan={() => { void refresh(); setTab('方案'); }} />}{tab === '方案' && <PlanPanel onDirty={(save) => setPendingForm(() => save)} requestLeave={navigate} key={selectedTask.id} projectId={project.project_id} task={selectedTask} refresh={refresh} discuss={() => setTab('对话')} onExecuted={() => setTab('执行')} />}{(tab === '执行' || tab === '测试' || tab === '验收') && <RunPanel onEvidence={setTab} key={selectedTask.id} projectId={project.project_id} task={selectedTask} page={tab} refresh={refresh} onDiscuss={() => setTab('对话')} />}{tab === '变更' && <ChangesPanel onDiscuss={(text) => { const key = `room-discussion-draft-${project.project_id}-${selectedTask.id}`; const draft = localStorage.getItem(key); savePreference(key, draft ? `${draft}\n\n${text}` : text); setTab('对话'); }} key={selectedTask.id} projectId={project.project_id} task={selectedTask} />}</div>{context && !narrow && <aside className="task-context"><header className="page-heading"><h2>任务概况</h2><button aria-label="关闭任务概况" onClick={() => setContext(false)}>关闭</button></header>{overview}</aside>}</div></section>}
    </main>{compact && navigationOpen && <Modal title="工作台导航" className="drawer drawer-left" onClose={() => setNavigationOpen(false)}><div className="app-sidebar">{navigation}</div></Modal>}{narrow && contextDrawer && <Modal title="任务概况" className="drawer drawer-right" onClose={() => setContextDrawer(false)}>{overview}</Modal>}{pendingNavigation && <Modal title="保存未完成的编辑？" onClose={() => setPendingNavigation(null)}><p>当前页面有未保存的输入。</p><ErrorNotice error={error} /><div className="editor-actions"><button onClick={() => setPendingNavigation(null)}>继续编辑</button><button onClick={() => { setPendingDraft(null); setPendingForm(null); setPendingNavigation(null); pendingNavigation(); }}>放弃编辑</button><button className="primary" onClick={() => void saveBeforeLeaving()}>保存并离开</button></div></Modal>}
  </div>;
}

export function WorkbenchApp() {
  const [theme, setTheme] = useState(localStorage.getItem('room-theme') ?? 'system');
  const [fontSize, setFontSize] = useState(localStorage.getItem('room-font-size') ?? '14');
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme; };
    apply(); media.addEventListener('change', apply); savePreference('room-theme', theme);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => { document.documentElement.style.setProperty('--base-font-size', `${fontSize}px`); savePreference('room-font-size', fontSize); }, [fontSize]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(localStorage.getItem('room-ui-project') ?? '');
  const [pending, setPending] = useState<Record<string, PendingState>>({});
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      const results = await Promise.all(projects.map(async (project): Promise<[string, PendingState]> => {
        try {
          const [tasks, snapshot, launches] = await Promise.all([workbenchApi.tasks(project.project_id), api.state(project.project_id), api.launches(project.project_id)]);
          const active = new Set(launches.filter((launch) => ['starting', 'running'].includes(String(launch.status))).map((launch) => String(launch.run_id)));
          return [project.project_id, { count: tasks.filter((task) => !task.archived && !task.cancelled && pendingStatuses.has(taskStatus(task, snapshot, active))).length + legacyTasks(snapshot, tasks, active).filter((item) => pendingStatuses.has(item.status)).length, error: null }];
        } catch (error) { return [project.project_id, { count: 0, error: error instanceof Error ? error.message : String(error) }]; }
      }));
      if (!disposed) { setPending(Object.fromEntries(results)); timer = setTimeout(() => void read(), 10000); }
    }
    void read();
    return () => { disposed = true; clearTimeout(timer); };
  }, [projects]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void api.projects().then(setProjects).catch((error: Error) => setError(error.message)).finally(() => setLoaded(true)); }, []);
  useEffect(() => { const report = (event: Event) => setError(`界面偏好未保存：${(event as CustomEvent<string>).detail}`); window.addEventListener('room-preference-error', report); return () => window.removeEventListener('room-preference-error', report); }, []);
  function select(id: string, showPending = false) { if (showPending) { savePreference(`room-view-${id}`, 'pending'); savePreference(`room-query-${id}`, ''); savePreference(`room-filter-${id}`, '全部状态'); } setProjectId(id); savePreference('room-ui-project', id); }
  async function open(folder?: string, confirm?: true) {
    setError(null);
    try {
      const selected = folder ?? await window.roomDesktop?.selectDirectory();
      if (!selected) return;
      setBusy(true);
      const result = await workbenchApi.open(selected, confirm);
      if (result.needs_creation) { setPath(selected); return; }
      setProjects(await api.projects()); setPath(null); if (result.project) select(result.project.project_id);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  const project = projects.find((item) => item.project_id === projectId);
  return <>{project ? <ProjectWorkspace pending={pending} theme={theme} setTheme={setTheme} fontSize={fontSize} setFontSize={setFontSize} key={project.project_id} project={project} projects={projects} onSwitch={select} onOpen={() => void open()} onProjectsChanged={async () => setProjects(await api.projects())} /> : <main className="welcome"><div className="welcome-card"><div className="wordmark">Room</div><p className="eyebrow">独立桌面 · 任务与测试驱动</p><h1>从一个项目开始</h1><p className="muted">把需求、方案、执行与验收放在同一项任务里。</p><ErrorNotice error={error} />{window.roomDesktop ? <button className="primary" disabled={busy || !loaded} onClick={() => void open()}>打开项目文件夹</button> : <form onSubmit={(event) => { event.preventDefault(); void open(manualPath); }}><input aria-label="项目绝对路径" value={manualPath} onChange={(event) => setManualPath(event.target.value)} placeholder="项目绝对路径" /><button className="primary" disabled={busy}>打开项目</button></form>}<section className="recent-projects"><h2>最近项目</h2>{projects.length ? projects.map((item) => <button key={item.project_id} onClick={() => select(item.project_id)}><strong>{item.name}</strong><small>{item.project_path}</small></button>) : <p className="muted">尚未打开项目。</p>}</section></div></main>}{project && error && <div className="global-error" role="alert">{error}<button onClick={() => setError(null)}>关闭</button></div>}{path && <Modal title="为此项目创建 Room" onClose={() => setPath(null)}><p className="path-text">{path}</p><p>此目录没有 Room 绑定。确认后将创建项目数据：</p><p className="path-text">{path}\.agent-room\room.sqlite</p><ErrorNotice error={error} /><footer className="editor-actions"><button disabled={busy} onClick={() => { setPath(null); void open(); }}>重新选择</button><button className="primary push-right" disabled={busy} onClick={() => void open(path, true)}>为此项目创建 Room</button></footer></Modal>}</>;
}
