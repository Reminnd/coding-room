import assert from 'node:assert/strict';
import test from 'node:test';
import { readCodexCapabilities } from '../src/ui/agent-connections.ts';
import type { RpcTransport } from '../src/ui/codex-client.ts';

test('agent detection uses provider auth requirements and paginates the actual model catalog without exposing account secrets', async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const client: RpcTransport = { notify() {}, async request(method, params) {
    calls.push({ method, params });
    if (method === 'account/read') return { account: null, requiresOpenaiAuth: false } as any;
    if (method === 'collaborationMode/list') return { data: [{ mode: 'plan' }] } as any;
    return { data: [{ model: params.cursor ? 'second' : 'first', displayName: 'Available model', isDefault: !params.cursor }], nextCursor: params.cursor ? null : 'page-2' } as any;
  } };
  const result = await readCodexCapabilities(client);
  assert.equal(result.connected, true);
  assert.equal(result.requires_auth, false);
  assert.equal(result.signed_in, false);
  assert.equal(result.native_plan, true);
  assert.deepEqual(result.models.map((model) => model.model), ['first', 'second']);
  assert.deepEqual(calls.find((call) => call.method === 'account/read')?.params, { refreshToken: false });
  assert.ok(calls.every((call) => !call.method.includes('login')));
});
