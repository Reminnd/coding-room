import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { WorkbenchStore } from '../src/ui/workbench-store.ts';

test('changing the task invalidates its approved proposal and dispatched tasks cannot be rewritten', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const store = new WorkbenchStore(db, 'room-a');
    const task = store.save({ title: 'A', goal: 'Goal', mode: 'task', verification: 'tdd', source_ids: [] });
    store.update(task.id, { proposal: 'Original plan', proposal_version: 1, approved_version: 1 });
    const edited = store.save({ ...task, goal: 'Changed goal' });
    assert.equal(edited.approved_version, null);
    store.update(task.id, { run_id: 'run-a' });
    assert.throws(() => store.save({ ...edited, title: 'Changed after dispatch' }), /执行/);
  } finally { db.close(); }
});

test('drafts preserve incomplete input; discussion requires title and goal', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const store = new WorkbenchStore(db, 'room-a');
    const draft = store.save({ title: '', goal: '', mode: 'sdd', verification: 'tdd', source_ids: [] });
    assert.equal(store.get(draft.id).title, '');
    assert.throws(() => store.validateDiscussion(draft.id), /标题/);
    store.save({ ...draft, title: '项目切换', goal: '切换项目后显示正确任务' });
    assert.equal(store.validateDiscussion(draft.id).title, '项目切换');
  } finally { db.close(); }
});

test('room ownership is enforced for read and updates', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const a = new WorkbenchStore(db, 'room-a');
    const b = new WorkbenchStore(db, 'room-b');
    const draft = a.save({ title: 'A', goal: 'A goal', mode: 'task', verification: 'tdd', source_ids: [] });
    assert.equal(b.list().length, 0);
    assert.throws(() => b.get(draft.id), /not found/);
    assert.throws(() => b.save({ ...draft, title: 'B' }), /not found/);
    assert.equal(a.get(draft.id).title, 'A');
  } finally { db.close(); }
});

test('source classification distinguishes constraints from implementation references', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const store = new WorkbenchStore(db, 'room-a');
    const source = store.saveSource({ label: 'Project requirements', kind: 'document', ownership: 'project', location: '/project/docs/requirements.md' });
    assert.equal(source.purpose, 'constraints');
    const reference = store.saveSource({ label: 'Module', kind: 'code', ownership: 'project', location: '/project/src/module.ts' });
    assert.equal(reference.purpose, 'implementation');
    const draft = store.save({ title: '', goal: '', mode: 'sdd', verification: 'tdd', source_ids: [source.id] });
    store.removeSource(source.id);
    assert.equal(store.get(draft.id).source_ids[0], source.id);
    assert.equal(store.sources().length, 1);
    assert.equal(store.source(source.id).label, 'Project requirements');
  } finally { db.close(); }
});

test('proposal edits retain versions and reject stale saves without replacing current content', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const store = new WorkbenchStore(db, 'room-a');
    const task = store.save({ title: 'A', goal: 'Goal', mode: 'task', verification: 'tdd', source_ids: [] });
    store.saveProposal(task.id, { text: 'First plan', details: null, expected_version: 0 });
    store.saveProposal(task.id, { text: 'Revised plan', details: null, expected_version: 1 });
    assert.throws(() => store.saveProposal(task.id, { text: 'Stale plan', details: null, expected_version: 1 }), /已更新/);
    assert.equal(store.get(task.id).proposal, 'Revised plan');
    assert.equal(store.get(task.id).approved_version, null);
    assert.deepEqual(store.proposalHistory(task.id).map((version: any) => version.text), ['Revised plan', 'First plan']);
    store.update(task.id, { thread_id: 'existing-discussion' });
    const sdd = store.manage(task.id, { action: 'switch_sdd' });
    assert.equal(sdd.mode, 'sdd');
    assert.equal(sdd.thread_id, 'existing-discussion');
    assert.equal(sdd.proposal, 'Revised plan');
    assert.equal(store.proposalHistory(task.id).length, 2);
    assert.equal(sdd.run_id, null);
    store.update(task.id, { run_id: 'already-dispatched' });
    assert.throws(() => store.manage(task.id, { action: 'switch_sdd' }), /执行/);
  } finally { db.close(); }
});
