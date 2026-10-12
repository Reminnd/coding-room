import assert from 'node:assert/strict';
import test from 'node:test';
import { startPlanTurn, type RpcTransport } from '../src/ui/codex-client.ts';

test('native Plan preserves built-in mode instructions and resumes persistent threads read-only', async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const client: RpcTransport = {
    notify() {},
    async request(method, params) {
      calls.push({ method, params });
      return ({ 'collaborationMode/list': { data: [{ mode: 'plan', model: 'configured-model', reasoning_effort: 'high' }] },
        'thread/resume': { thread: { id: 'thread-1' }, model: 'configured-model' }, 'turn/start': { turn: { id: 'turn-2' } } } as any)[method];
    },
  };
  let saved = '';
  const result = await startPlanTurn(client, { cwd: 'C:/project', threadId: 'thread-1', text: 'Plan the task', onThread: (id) => { saved = id; } });
  assert.equal(saved, 'thread-1');
  assert.deepEqual(result, { threadId: 'thread-1', turnId: 'turn-2' });
  assert.equal(calls[1].method, 'thread/resume');
  assert.equal(calls[1].params.sandbox, 'read-only');
  assert.equal(calls[1].params.approvalPolicy, 'never');
  assert.deepEqual(calls[2].params.collaborationMode, { mode: 'plan', settings: { model: 'configured-model', reasoning_effort: 'high', developer_instructions: null } });
  calls.length = 0;
  await startPlanTurn(client, { cwd: 'C:/project', threadId: 'thread-1', text: 'Use project model', model: 'selected-model', onThread() {} });
  assert.equal(calls[1].params.model, 'selected-model');
  assert.deepEqual(calls[2].params.collaborationMode, { mode: 'plan', settings: { model: 'selected-model', reasoning_effort: null, developer_instructions: null } });
});

test('unavailable native Plan does not fall back to a prompt imitation', async () => {
  const calls: string[] = [];
  const client: RpcTransport = { notify() {}, async request(method) { calls.push(method); return { data: [] } as any; } };
  await assert.rejects(startPlanTurn(client, { cwd: 'C:/project', threadId: null, text: 'Plan', onThread() {} }), /原生 Plan/);
  assert.deepEqual(calls, ['collaborationMode/list']);
});
