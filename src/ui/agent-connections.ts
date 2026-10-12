import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CodexClient, initializeCodex, type RpcTransport } from './codex-client.ts';

export async function readCodexCapabilities(client: RpcTransport) {
  const [account, modes] = await Promise.all([
    client.request('account/read', { refreshToken: false }), client.request('collaborationMode/list', {}),
  ]);
  const models: Array<{ model: string; display_name: string; is_default: boolean }> = [];
  let cursor: string | null = null;
  do {
    const page: { data: Array<{ model: string; displayName: string; isDefault: boolean }>; nextCursor: string | null } = await client.request('model/list', { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) });
    for (const model of page.data) models.push({ model: model.model, display_name: model.displayName, is_default: model.isDefault });
    cursor = page.nextCursor ?? null;
  } while (cursor);
  return { connected: true, native_plan: modes.data.some((mode: { mode: string }) => mode.mode === 'plan'),
    requires_auth: account.requiresOpenaiAuth, signed_in: account.account !== null, account_type: account.account?.type ?? null, models, error: null };
}

export class AgentConnections {
  private readonly clients = new Set<CodexClient>();
  private loginClient: CodexClient | null = null;
  private loginId: string | null = null;
  private login: { status: 'idle' | 'starting' | 'pending' | 'completed' | 'failed'; error: string | null } = { status: 'idle', error: null };
  async check(kind: string): Promise<unknown> {
    if (kind === 'claude') {
      const execute = promisify(execFile);
      try {
        const version = await execute('claude', ['--version'], { windowsHide: true, timeout: 10000 });
        try {
          const result = await execute('claude', ['auth', 'status', '--json'], { windowsHide: true, timeout: 10000 });
          const auth = JSON.parse(result.stdout);
          return { connected: true, version: version.stdout.trim(), signed_in: auth.loggedIn === true, account_type: auth.authMethod ?? null, provider: auth.apiProvider ?? null, error: null };
        } catch (error) { return { connected: true, version: version.stdout.trim(), signed_in: null, error: error instanceof Error ? error.message : String(error) }; }
      } catch (error) { return { connected: false, version: null, signed_in: null, error: error instanceof Error ? error.message : String(error) }; }
    }
    if (kind !== 'codex') throw new Error('未知 Agent');
    const client = new CodexClient(); this.clients.add(client);
    const timeout = setTimeout(() => client.close(), 15000);
    try { await initializeCodex(client); return await readCodexCapabilities(client); }
    catch (error) { return { connected: false, native_plan: false, models: [], signed_in: null, error: error instanceof Error ? error.message : String(error) }; }
    finally { clearTimeout(timeout); this.clients.delete(client); client.close(); }
  }
  loginStatus() { return this.login; }
  async startLogin(): Promise<{ url: string }> {
    if (['starting', 'pending'].includes(this.login.status)) throw new Error('登录仍在进行，请完成或取消当前登录');
    const client = new CodexClient(); this.loginClient = client; this.clients.add(client);
    this.login = { status: 'starting', error: null };
    client.on('message', (message) => {
      if (message.method === 'account/login/completed') {
        this.login = { status: message.params.success ? 'completed' : 'failed', error: message.params.error ?? null };
        this.clients.delete(client); client.close(); this.loginClient = null;
      }
    });
    client.on('disconnected', (error: Error) => {
      if (['starting', 'pending'].includes(this.login.status)) this.login = { status: 'failed', error: error.message };
    });
    const timeout = setTimeout(() => client.close(), 15000);
    try {
      await initializeCodex(client);
      const result = await client.request('account/login/start', { type: 'chatgpt' });
      this.loginId = result.loginId;
      if (this.login.status === 'starting') this.login = { status: 'pending', error: null };
      return { url: result.authUrl };
    } catch (error) {
      this.login = { status: 'failed', error: error instanceof Error ? error.message : String(error) };
      this.clients.delete(client); client.close(); this.loginClient = null; throw error;
    } finally { clearTimeout(timeout); }
  }
  async cancelLogin(): Promise<void> {
    if (this.loginClient && this.loginId) await this.loginClient.request('account/login/cancel', { loginId: this.loginId });
    this.login = { status: 'idle', error: null };
    if (this.loginClient) { this.clients.delete(this.loginClient); this.loginClient.close(); this.loginClient = null; }
  }
  close(): void { for (const client of this.clients) client.close(); this.clients.clear(); }
}
