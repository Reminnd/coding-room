import type { Project } from './types';

export interface TaskDraft {
  id?: string; title: string; goal: string; mode: 'sdd' | 'task'; verification: 'tdd' | 'standard'; source_ids: string[];
}
export interface WorkbenchTask extends TaskDraft {
  id: string; updated_at: string; thread_id: string | null; run_id: string | null;
  task_id: string | null; plan_id: string | null; archived: boolean; cancelled: boolean;
  proposal: string; proposal_version: number; approved_version: number | null;
  proposal_details: ProposalDetails | null;
  proposal_review_id?: string | null;
  proposal_question_id?: string | null;
  carry_from_run_id?: string | null;
  prior_run_ids?: string[];
  origin_task_id?: string;
}
export interface ProposalDetails {
  requirements: string[]; non_goals: string[]; architecture_decisions: string[]; scope: string[];
  constraints: string[]; acceptance_criteria: string[];
  verification: Array<{ command: string; detects: string; decision_if_failed: string }>;
  documentation_updates: Array<{ path: string; expected_change: string }>; question_policy: string;
  proposed_fixes?: Array<{ finding_id: string; solution: string }>;
  sdd?: { specification: string; technical_design: string; tasks: Array<{ id: string; title: string; modules: string[]; dependencies: string[]; acceptance: string[]; tests: string[] }> };
}
export interface ProposalVersion { version: number; text: string; details: ProposalDetails | null; sources?: Source[]; created_at: string }
export interface ExecutionPreview {
  preview_id: string; proposal_version: number; goal: string; scope: string[]; acceptance_criteria: string[];
  verification: string[]; verification_mode: string; worker: string; worktree_path: string; branch: string;
  source_ref: string; original_changes: string[]; git_operations: string[];
  carried_changes?: string[];
}
export interface VerificationEvidence {
  id: string; command: string; cwd: string; stage: string; behavior: string; command_index: number;
  started_at: string; completed_at: string | null; exit_code: number | null; stdout: string; stderr: string; error: string | null;
}
export interface RuntimeData {
  execution_observation: 'owned_active' | 'unknown' | 'inactive';
  run: null | { run_id: string; status: string; worktree_path: string | null };
  attempts: Array<{ attempt_id: string; status: string; started_at: string; settled_at: string | null; failure: { message: string } | null; result: { summary: string; unresolved: string[] } | null }>;
  question: null | { question_id: string; question: string; options: Array<{ label: string; tradeoff: string }> };
  scope_question?: null | { question: string; answer: string };
  prior_runs?: Array<{ run: { run_id: string; status: string; worktree_path: string | null }; attempts: Array<{ attempt_id: string; status: string }> }>;
  reviews: Array<{ review_id: string; decision: string; verification_summary: string; open_questions: string[]; findings: Array<{ title: string; severity: string; file: string; line: number | null; impact: string; evidence: string; trigger: string; requirement_relation: string; minimal_direction: string }> }>;
  events: Array<{ sequence: number; summary: string; created_at: string }>;
  logs: Array<{ name: string; text: string }>; verification?: VerificationEvidence[];
  verification_current?: VerificationEvidence[];
  verification_commands?: Array<{ command: string; detects: string; decision_if_failed: string }>;
}
export interface Changes { branch: string | null; worktree_path: string | null; files: string[]; file: string | null; diff: string }
export interface ReviewJob { status: 'running' | 'completed' | 'failed'; error: string | null; review_id: string | null }
export interface RecoveryObservation { state: 'unknown' | 'running' | 'stopped' | 'inactive'; message: string; live_pids: number[]; worktree_path: string | null; attempt_id: string | null; verification_ids: string[] }
export interface DeliveryAction {
  git_action_id: string; status: string;
  preview: { operation: 'commit_paths' | 'integrate_fast_forward'; paths?: string[]; commit_message?: string;
    worktree_path?: string; branch?: string; source_branch?: string; target_branch?: string; target_worktree_path?: string };
  result: null | { message: string; resulting_commit_id: string | null };
}
export interface Source {
  id: string; label: string; location: string; kind: 'repository' | 'document' | 'code';
  ownership: 'project' | 'external'; purpose: 'constraints' | 'implementation';
  reading?: { status: 'readable' | 'failed'; checked_at: string; resolved_location: string; preview: string; truncated: boolean; error: string | null };
}
export type SourceDraft = Pick<Source, 'label' | 'kind' | 'ownership' | 'location'> & { id?: string };
export type TaskAction = { action: 'rename'; title: string } | { action: 'archive' | 'restore' | 'followup' | 'switch_sdd' } | { action: 'cancel'; confirmed_by_user: true };
export interface ProjectSettings { default_mode: 'task' | 'sdd'; default_verification: 'tdd' | 'standard'; codex_model: string | null }
export interface AgentStatus { connected: boolean; signed_in: boolean | null; requires_auth?: boolean; account_type?: string | null; native_plan?: boolean; version?: string | null; provider?: string | null; models?: Array<{ model: string; display_name: string; is_default: boolean }>; error: string | null }
export interface Discussion {
  state: null | { status: string; error: string | null; text: string; stream_item_id?: string | null; question: null | { questions: Array<{ id: string; question: string; options?: Array<{ label: string; description: string }> }> } };
  thread: null | { turns: Array<{ id: string; items: Array<{ id: string; type: string; text?: string; command?: string; cwd?: string; aggregatedOutput?: string; status?: string; tool?: string; server?: string; query?: string; result?: unknown; error?: unknown; content?: Array<{ type: string; text?: string }> }> }> };
}
async function request<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(path, { method: method ?? (body === undefined ? 'GET' : 'POST'),
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? `请求失败 (${response.status})`);
  return result as T;
}
const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/workbench`;
export const workbenchApi = {
  settings: async (id: string) => (await request<{ settings: ProjectSettings }>(`${base(id)}/settings`)).settings,
  saveSettings: async (id: string, settings: ProjectSettings & { name: string }) => (await request<{ settings: ProjectSettings }>(`${base(id)}/settings`, settings)).settings,
  checkAgent: (kind: 'codex' | 'claude') => request<AgentStatus>(`/api/desktop/agents/${kind}`, {}),
  login: () => request<{ url: string }>('/api/desktop/agents/login', { confirmed_by_user: true }),
  loginStatus: () => request<{ status: string; error: string | null }>('/api/desktop/agents/login'),
  cancelLogin: () => request('/api/desktop/agents/login', { cancel: true }),
  open: (project_path: string, confirm_create?: true) => request<{ needs_creation: boolean; project: Project | null }>('/api/projects/open', { project_path, ...(confirm_create ? { confirm_create } : {}) }),
  tasks: async (id: string) => (await request<{ tasks: WorkbenchTask[] }>(`${base(id)}/tasks`)).tasks,
  saveTask: async (id: string, draft: TaskDraft) => (await request<{ task: WorkbenchTask }>(`${base(id)}/tasks`, draft)).task,
  manageTask: async (id: string, taskId: string, action: TaskAction) => (await request<{ task: WorkbenchTask }>(`${base(id)}/tasks/${encodeURIComponent(taskId)}/manage`, action)).task,
  sources: async (id: string) => (await request<{ sources: Source[] }>(`${base(id)}/sources`)).sources,
  saveSource: async (id: string, source: SourceDraft) => (await request<{ source: Source }>(`${base(id)}/sources`, source)).source,
  readSource: (id: string, sourceId: string) => request(`${base(id)}/sources/${encodeURIComponent(sourceId)}/read`, {}),
  openSource: async (id: string, sourceId: string) => {
    const result = await request<{ url?: string }>(`${base(id)}/sources/${encodeURIComponent(sourceId)}/open`, {});
    if (result.url) {
      if (window.roomDesktop) await window.roomDesktop.openReference(result.url);
      else window.open(result.url, '_blank', 'noopener,noreferrer');
    }
  },
  removeSource: (id: string, sourceId: string) => request(`${base(id)}/sources/${encodeURIComponent(sourceId)}`, undefined, 'DELETE'),
  discussion: (id: string, taskId: string) => request<Discussion>(`${base(id)}/tasks/${encodeURIComponent(taskId)}/discussion`),
  send: (id: string, taskId: string, text: string) => request(`${base(id)}/tasks/${encodeURIComponent(taskId)}/discussion`, { text }),
  chatgpt: async (id: string, taskId: string, action: 'read' | 'send' | 'show' | 'stop' | 'adopt', value?: string) => {
    if (!window.roomDesktop) throw new Error('请在 Room 桌面应用内打开 ChatGPT 普通聊天');
    return window.roomDesktop.chatgpt(id, taskId, action, value);
  },
  answer: (id: string, taskId: string, answers: Record<string, { answers: string[] }>) => request(`${base(id)}/tasks/${encodeURIComponent(taskId)}/answer`, { answers }),
  interrupt: (id: string, taskId: string) => request(`${base(id)}/tasks/${encodeURIComponent(taskId)}/interrupt`, {}),
  versions: async (id: string, taskId: string) => (await request<{ versions: ProposalVersion[] }>(`${base(id)}/tasks/${encodeURIComponent(taskId)}/proposal`)).versions,
  saveProposal: async (id: string, taskId: string, body: { text: string; details: ProposalDetails | null; expected_version: number }) => (await request<{ task: WorkbenchTask }>(`${base(id)}/tasks/${encodeURIComponent(taskId)}/proposal`, body)).task,
  checkExecution: (id: string, taskId: string) => request<ExecutionPreview>(`${base(id)}/tasks/${encodeURIComponent(taskId)}/check-execution`, {}),
  execute: (id: string, taskId: string, preview_id: string) => request(`${base(id)}/tasks/${encodeURIComponent(taskId)}/execute`, { preview_id, confirmed_by_user: true }),
  runtime: (id: string, taskId: string) => request<RuntimeData>(`${base(id)}/tasks/${encodeURIComponent(taskId)}/runtime`),
  recovery: (id: string, taskId: string) => request<RecoveryObservation>(`${base(id)}/tasks/${encodeURIComponent(taskId)}/recovery`),
  recover: (id: string, taskId: string) => request<RecoveryObservation>(`${base(id)}/tasks/${encodeURIComponent(taskId)}/recovery`, { confirmed_by_user: true }),
  verify: (id: string, taskId: string, command_index: number) => request<VerificationEvidence>(`${base(id)}/tasks/${encodeURIComponent(taskId)}/verify`, { command_index }),
  review: async (id: string, taskId: string) => (await request<{ review: ReviewJob | null }>(`${base(id)}/tasks/${encodeURIComponent(taskId)}/review`)).review,
  startReview: async (id: string, taskId: string) => (await request<{ review: ReviewJob }>(`${base(id)}/tasks/${encodeURIComponent(taskId)}/review`, {})).review,
  accept: (id: string, taskId: string) => request(`${base(id)}/tasks/${encodeURIComponent(taskId)}/accept`, { confirmed_by_user: true }),
  deliveryPreview: async (id: string, taskId: string, body: { operation: 'commit_paths'; commit_message: string } | { operation: 'integrate_fast_forward'; target_worktree_path: string }) => (await request<{ action: DeliveryAction }>(`${base(id)}/tasks/${encodeURIComponent(taskId)}/delivery`, body)).action,
  deliver: (id: string, taskId: string, git_action_id: string) => request<DeliveryAction>(`${base(id)}/tasks/${encodeURIComponent(taskId)}/delivery-execute`, { git_action_id, confirmed_by_user: true }),
  continue: (id: string, taskId: string) => request(`${base(id)}/tasks/${encodeURIComponent(taskId)}/continue`, { confirmed_by_user: true }),
  changes: (id: string, taskId: string, file?: string) => request<Changes>(`${base(id)}/tasks/${encodeURIComponent(taskId)}/changes${file ? `?file=${encodeURIComponent(file)}` : ''}`),
};

export interface ChatgptDiscussion {
  messages: { id: string; role: 'user' | 'assistant'; text: string }[];
  ready: boolean; generating: boolean; pending: boolean; loading: boolean; error: string | null;
  phase?: 'sending' | 'unconfirmed' | 'thinking' | 'responding' | 'saving' | 'complete' | 'stopped';
  confirmedText?: string | null;
  output?: { message_id: string; proposal_version: number | null; questions: { id: string; question: string; options: { label: string; description: string }[] }[] } | null;
}

declare global {
  interface Window { roomDesktop?: { chatgpt(projectId: string, taskId: string, action: string, value?: string): Promise<ChatgptDiscussion>; readPreferences(): Promise<Record<string, string>>; writePreference(key: string, value: string | null): Promise<void>; selectDirectory(): Promise<string | null>; selectReference(kind: 'file' | 'directory'): Promise<string | null>; openReference(location: string): Promise<void>; diagnostics(): Promise<{ version: string; data_path: string }>; openLogs(): Promise<void>; quit(): Promise<void> } }
}
