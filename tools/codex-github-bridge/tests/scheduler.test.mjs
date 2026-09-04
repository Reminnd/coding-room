import assert from 'node:assert/strict';
import test from 'node:test';
import { computeReadySet, runOnceSchedule, runStartSchedule } from '../scheduler.mjs';

const task = (task_id, depends_on = [], owns = [`${task_id}/**`]) => ({ task_id, depends_on, owns });

test('Ready Set includes independent tasks and unlocks dependencies only after integration', () => {
  const tasks = [task('A'), task('B'), task('C', ['A'])];
  const statuses = new Map();
  assert.deepEqual(computeReadySet(tasks, statuses).map((item) => item.task_id), ['A', 'B']);
  statuses.set('A', 'integrated');
  statuses.set('B', 'running');
  assert.deepEqual(computeReadySet(tasks, statuses, [tasks[1]]).map((item) => item.task_id), ['C']);
});

test('Ready Set prevents owned-path overlap with running and same-set tasks', () => {
  const tasks = [
    task('A', [], ['src/shared/**']),
    task('B', [], ['src/shared/file.ts']),
    task('C', [], ['src/other/**']),
  ];
  assert.deepEqual(computeReadySet(tasks).map((item) => item.task_id), ['A', 'C']);
  assert.deepEqual(computeReadySet(tasks, new Map(), [tasks[0]]).map((item) => item.task_id), ['C']);
});

test('run-once launches one complete Ready Set and does not launch newly-unblocked work', async () => {
  const tasks = [task('A'), task('B', ['A'])];
  const statuses = new Map();
  const launched = [];
  const result = await runOnceSchedule({
    tasks,
    statuses,
    launch: async (item) => { launched.push(item.task_id); return item.task_id; },
    processResult: async (item) => { statuses.set(item.task_id, 'integrated'); },
  });
  assert.deepEqual(result.launched, ['A']);
  assert.deepEqual(launched, ['A']);
  assert.equal(statuses.get('B'), undefined);
});

test('start launches a newly-unblocked dependency before an unrelated worker completes', async () => {
  const tasks = [task('A'), task('B'), task('C', ['A'])];
  const statuses = new Map();
  const launched = [];
  let finishB;
  const b = new Promise((resolve) => { finishB = resolve; });

  await runStartSchedule({
    tasks,
    statuses,
    launch: async (item) => {
      launched.push(item.task_id);
      if (item.task_id === 'B') return b;
      return item.task_id;
    },
    processResult: async (item) => {
      statuses.set(item.task_id, 'integrated');
      if (item.task_id === 'C') finishB('B');
    },
    terminal: () => tasks.every((item) => statuses.get(item.task_id) === 'integrated'),
  });

  assert.deepEqual(launched, ['A', 'B', 'C']);
  assert.ok(launched.indexOf('C') > launched.indexOf('B'));
  assert.equal(statuses.get('B'), 'integrated');
});
