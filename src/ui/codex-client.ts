import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

export interface RpcTransport {
  request<T = any>(method: string, params: Record<string, unknown>): Promise<T>;
  notify(method: string, params?: Record<string, unknown>): void;
}

export function codexExecutable(): string {
  if (process.env.ROOM_CODEX_PATH) return process.env.ROOM_CODEX_PATH;
  const desktop = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe');
  return process.platform === 'win32' && existsSync(desktop) ? desktop : 'codex';
}

export class CodexClient extends EventEmitter implements RpcTransport {
  private readonly child: ChildProcessWithoutNullStreams;
  private nextId = 0;
  private readonly pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private failure: Error | null = null;
  constructor(executable = codexExecutable()) {
    super();
    this.child = spawn(executable, ['app-server', '--listen', 'stdio://'], { windowsHide: true, stdio: 'pipe' });
    createInterface({ input: this.child.stdout, crlfDelay: Infinity }).on('line', (line) => {
      let message;
      try { message = JSON.parse(line); } catch { this.fail(new Error('Codex App Server 返回无效协议')); return; }
      if ('id' in message && ('result' in message || 'error' in message)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending?.reject(new Error(message.error.message));
        else pending?.resolve(message.result);
      } else if ('method' in message) {
        this.emit('message', message);
      }
    });
    this.child.stderr.on('data', (chunk) => this.emit('diagnostic', String(chunk)));
    this.child.on('error', (error) => this.fail(error));
    this.child.stdin.on('error', (error) => this.fail(error));
    this.child.on('exit', (code) => this.fail(new Error(`Codex App Server 已退出 (${code})`)));
  }
  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.emit('disconnected', error);
  }
  request<T = any>(method: string, params: Record<string, unknown>): Promise<T> {
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }
  notify(method: string, params: Record<string, unknown> = {}): void {
    this.child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }
  respond(id: number | string, result: unknown): void {
    this.child.stdin.write(`${JSON.stringify({ id, result })}\n`);
  }
  rejectRequest(id: number | string, message: string): void {
    this.child.stdin.write(`${JSON.stringify({ id, error: { code: -32601, message } })}\n`);
  }
  close(): void {
    this.fail(new Error('Codex connection closed'));
    this.child.stdin.end();
    this.child.kill();
  }
}

export async function initializeCodex(client: RpcTransport): Promise<void> {
  await client.request('initialize', { clientInfo: { name: 'room_desktop', title: 'Room', version: '0.1.0' }, capabilities: { experimentalApi: true } });
  client.notify('initialized');
}

export async function startPlanTurn(client: RpcTransport, input: { cwd: string; threadId: string | null; text: string; model?: string | null; onThread: (id: string) => void }): Promise<{ threadId: string; turnId: string }> {
  const modes = await client.request<{ data: Array<{ mode?: string; model?: string; reasoning_effort?: string }> }>('collaborationMode/list', {});
  const plan = modes.data.find((mode) => mode.mode === 'plan');
  if (!plan) throw new Error('当前 Codex 不提供原生 Plan；请更新 Codex 后重试');
  const session = await client.request<{ thread: { id: string }; model: string }>(input.threadId ? 'thread/resume' : 'thread/start', {
    ...(input.threadId ? { threadId: input.threadId } : { ephemeral: false }),
    cwd: input.cwd, sandbox: 'read-only', approvalPolicy: 'never',
    ...(input.model ? { model: input.model } : {}),
  });
  input.onThread(session.thread.id);
  const result = await client.request<{ turn: { id: string } }>('turn/start', {
    threadId: session.thread.id,
    input: [{ type: 'text', text: input.text, text_elements: [] }],
    collaborationMode: { mode: 'plan', settings: { model: input.model ?? plan.model ?? session.model,
      reasoning_effort: input.model ? null : plan.reasoning_effort ?? null, developer_instructions: null } },
  });
  return { threadId: session.thread.id, turnId: result.turn.id };
}
