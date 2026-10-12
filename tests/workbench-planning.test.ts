import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { CodexClient } from '../src/ui/codex-client.ts';
import { ProjectRegistry } from '../src/ui/project-registry.ts';
import { WorkbenchPlanning } from '../src/ui/workbench-planning.ts';
import { WorkbenchStore } from '../src/ui/workbench-store.ts';
import { RoomService } from '../src/room/room-service.ts';

test('ordinary SDD planning uses ChatGPT and imports a versioned draft without starting Codex or execution', () => {
  const db = new DatabaseSync(':memory:');
  new RoomService(db).createRoom('room', { participant_id: 'codex-app', actor_role: 'planner' });
  const store = new WorkbenchStore(db, 'room');
  const task = store.save({ title: 'Chat planning', goal: 'Discuss requirements', mode: 'sdd', verification: 'tdd', source_ids: [] });
  try {
    const context = store.chatgptContext(task.id);
    assert.equal(context.expected_version, 0);
    assert.match(context.prompt, /Discuss requirements/);
    assert.equal(context.url, 'https://chatgpt.com/');
    store.saveChatgptUrl(task.id, 'https://chatgpt.com/c/12345678-abcd');
    assert.equal(store.chatgptContext(task.id).url, 'https://chatgpt.com/c/12345678-abcd');
    assert.throws(() => store.saveChatgptUrl(task.id, 'https://example.com/'), /ChatGPT/);
    const saved = store.importChatgptProposal(task.id, { text: 'Reviewed requirements', expected_version: 0 });
    assert.equal(saved.proposal_version, 1);
    assert.equal(saved.proposal, 'Reviewed requirements');
    assert.equal(saved.approved_version, null);
    assert.equal(saved.thread_id, null);
    assert.equal(saved.run_id, null);
    assert.throws(() => store.importChatgptProposal(task.id, { text: 'Stale draft', expected_version: 0 }), /方案已更新/);
    store.manage(task.id, { action: 'archive' });
    assert.throws(() => store.chatgptContext(task.id), /归档/);
  } finally { db.close(); }
});

test('Chat output saves a proposal once and returns clarification choices without approving execution', () => {
  const db = new DatabaseSync(':memory:');
  new RoomService(db).createRoom('room', { participant_id: 'codex-app', actor_role: 'planner' });
  const store = new WorkbenchStore(db, 'room');
  const task = store.save({ title: 'Chat', goal: 'Clarify', mode: 'sdd', verification: 'tdd', source_ids: [] });
  try {
    const questions = [{ id: 'scope', question: 'Which scope?', options: [{ label: 'Local', description: 'One machine' }, { label: 'Shared', description: 'Multiple users' }] }];
    const ask = store.consumeChatgptOutput(task.id, { message_id: 'q1', text: '```json\n' + JSON.stringify({room_questions:questions}) + '\n```', expected_version: 0 });
    assert.deepEqual(ask.questions, questions);
    assert.equal(store.get(task.id).proposal_version, 0);
    const details = { requirements: ['Local'], non_goals: [], architecture_decisions: [], scope: ['src'], constraints: [], acceptance_criteria: ['Works'], verification: [], documentation_updates: [], question_policy: 'Ask', sdd: { specification: 'Local', technical_design: '', tasks: [] } };
    const input = { message_id: 'a1', text: 'Plan\n```json\n' + JSON.stringify({room_task:details}) + '\n```', expected_version: 0 };
    assert.equal(store.consumeChatgptOutput(task.id, input).proposal_version, 1);
    assert.equal(store.consumeChatgptOutput(task.id, input).proposal_version, 1);
    store.saveProposal(task.id, {text:'Human edit',details,expected_version:1});
    store.consumeChatgptOutput(task.id, input);
    assert.equal(store.get(task.id).proposal, 'Human edit');
    assert.throws(()=>store.consumeChatgptOutput(task.id, {...input,message_id:'a2'}),/方案已更新/);
    assert.equal(store.get(task.id).run_id,null);
    assert.equal(store.get(task.id).approved_version,null);
  } finally { db.close(); }
});

test('planning persists thread and completed proposal, routes questions, and clears live state on disconnect', async () => {
  const root = mkdtempSync(join(tmpdir(), 'room-planning-'));
  const dbPath = join(root, 'room.sqlite');
  const db = new DatabaseSync(dbPath);
  const registry = new ProjectRegistry(join(root, 'registry.json'));
  registry.add({ project_id: 'project', name: 'Project', project_path: root, database_path: dbPath, room_id: 'room', control_participant_id: 'codex-app', port: null });
  new RoomService(db).createRoom('room', { participant_id: 'codex-app', actor_role: 'planner' });
  const store = new WorkbenchStore(db, 'room');
  const task = store.save({ title: 'Test', goal: 'Implement expected behavior', mode: 'task', verification: 'tdd', source_ids: [] });
  const turnStarted = Promise.withResolvers<void>();
  class FakeClient extends EventEmitter {
    answers: unknown[] = [];
    notify() {}
    close() {}
    respond(id: unknown, result: unknown) { this.answers.push({ id, result }); }
    rejectRequest() { throw new Error('Unexpected server request'); }
    async request(method: string) {
      if (method === 'initialize') return {};
      if (method === 'collaborationMode/list') return { data: [{ mode: 'plan', model: 'configured-model' }] };
      if (method === 'thread/start') return { thread: { id: 'thread' }, model: 'configured-model' };
      if (method === 'turn/start') { turnStarted.resolve(); return { turn: { id: 'turn' } }; }
      if (method === 'thread/read') return { thread: { id: 'thread', turns: [{ id: 'turn', items: [{ id: 'user-1', type: 'userMessage', content: [{ type: 'text', text: 'Plan this task\nInternal application context' }] }] }] } };
      throw new Error(method);
    }
  }
  const client = new FakeClient();
  const planning = new WorkbenchPlanning(registry, () => client as unknown as CodexClient);
  try {
    const sdd = store.save({ title: 'SDD', goal: 'Use ordinary Chat', mode: 'sdd', verification: 'tdd', source_ids: [] });
    assert.throws(() => planning.start('project', sdd.id, { text: 'Discuss' }), /ChatGPT/);
    assert.equal(store.get(sdd.id).thread_id, null);
    const state = planning.start('project', task.id, { text: 'Plan this task' });
    await turnStarted.promise;
    assert.equal(store.get(task.id).thread_id, 'thread');
    await new Promise((resolve) => setImmediate(resolve));
    const reopened = new WorkbenchPlanning(registry, () => new FakeClient() as unknown as CodexClient);
    const history = await reopened.read('project', task.id) as any;
    assert.equal(history.thread.turns[0].items[0].content[0].text, 'Plan this task');
    client.emit('message', { method: 'item/agentMessage/delta', params: { threadId: 'thread', itemId: 'message-1', delta: 'Researching ' } });
    client.emit('message', { method: 'item/agentMessage/delta', params: { threadId: 'thread', itemId: 'message-1', delta: 'requirements.' } });
    assert.equal(state.text, 'Researching requirements.');
    client.emit('message', { method: 'item/agentMessage/delta', params: { threadId: 'thread', itemId: 'message-2', delta: 'Ready to plan.' } });
    assert.equal(state.text, 'Ready to plan.');
    assert.throws(() => planning.start('project', task.id, { text: 'Overlap' }), /仍在进行/);
    client.emit('message', { id: 7, method: 'item/tool/requestUserInput', params: { threadId: 'thread', questions: [{ id: 'choice', question: 'Which behavior?' }] } });
    assert.equal(state.status, 'waiting');
    assert.throws(() => planning.answer('project', task.id, { answers: {} }), /请回答/);
    planning.answer('project', task.id, { answers: { choice: { answers: ['Expected behavior'] } } });
    assert.equal(client.answers.length, 1);
    client.emit('message', { method: 'item/completed', params: { threadId: 'thread', item: { type: 'plan', text: 'Scope and acceptance' } } });
    assert.equal(store.get(task.id).proposal, 'Scope and acceptance');
    assert.equal(store.get(task.id).proposal_version, 1);
    client.emit('disconnected', new Error('Provider closed'));
    assert.equal(state.status, 'interrupted');
    assert.equal(state.question, null);
    assert.equal(store.get(task.id).thread_id, 'thread');
  } finally { planning.close(); db.close(); rmSync(root, { recursive: true, force: true }); }
});
