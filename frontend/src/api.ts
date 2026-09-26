import type { GitState, Project, Snapshot } from './types';

export class ApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: options?.body === undefined ? options?.headers : { 'content-type': 'application/json', ...options.headers },
  });
  const data = await response.json() as { error?: { code?: string; message?: string } } & T;
  if (!response.ok) throw new ApiError(data.error?.code ?? `HTTP_${response.status}`, data.error?.message ?? response.statusText);
  return data;
}

export const api = {
  projects: async (): Promise<Project[]> => (await request<{ projects: Project[] }>('/api/projects')).projects,
  addProject: async (body: unknown): Promise<Project> => (await request<{ project: Project }>('/api/projects', { method: 'POST', body: JSON.stringify(body) })).project,
  importRuntime: async (body: unknown): Promise<Project> => (await request<{ project: Project }>('/api/projects/import-runtime', { method: 'POST', body: JSON.stringify(body) })).project,
  removeProject: async (id: string): Promise<void> => { await request(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
  createRoom: async (id: string): Promise<unknown> => request(`/api/projects/${encodeURIComponent(id)}/create-room`, { method: 'POST', body: JSON.stringify({ confirm_create: true }) }),
  state: async (id: string): Promise<Snapshot> => request(`/api/projects/${encodeURIComponent(id)}/state`),
  action: async <T = unknown>(id: string, action: string, body: unknown): Promise<T> => request(`/api/projects/${encodeURIComponent(id)}/actions/${encodeURIComponent(action)}`, { method: 'POST', body: JSON.stringify(body) }),
  startRun: async (id: string, body: unknown): Promise<unknown> => request(`/api/projects/${encodeURIComponent(id)}/runs/start`, { method: 'POST', body: JSON.stringify(body) }),
  launches: async (id: string): Promise<Entity[]> => (await request<{ launches: Entity[] }>(`/api/projects/${encodeURIComponent(id)}/launches`)).launches,
  git: async (id: string): Promise<GitState> => request(`/api/projects/${encodeURIComponent(id)}/git`),
  openVscode: async (id: string, runId?: string): Promise<unknown> => request(`/api/projects/${encodeURIComponent(id)}/open-vscode`, { method: 'POST', body: JSON.stringify(runId ? { run_id: runId } : {}) }),
  exportUrl: (id: string): string => `/api/projects/${encodeURIComponent(id)}/export`,
};

interface Entity { [key: string]: unknown }
