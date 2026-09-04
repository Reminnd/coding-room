import { tasksOverlap } from './scope.mjs';

export function orderTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const priority = (a.topological_priority ?? 0) - (b.topological_priority ?? 0);
    return priority || a.task_id.localeCompare(b.task_id);
  });
}

export function computeReadySet(tasks, statuses = new Map(), runningTasks = []) {
  // running process 只存在于内存；依赖与集成事实仍由调用者从 GitHub/Git 重建。
  const ready = [];
  for (const task of orderTasks(tasks)) {
    if ((statuses.get(task.task_id) ?? 'not_started') !== 'not_started') continue;
    if (!task.depends_on.every((id) => statuses.get(id) === 'integrated')) continue;
    if (runningTasks.some((running) => tasksOverlap(task, running))) continue;
    if (ready.some((selected) => tasksOverlap(task, selected))) continue;
    ready.push(task);
  }
  return ready;
}

export async function runOnceSchedule({ tasks, statuses, launch, processResult }) {
  const ready = computeReadySet(tasks, statuses);
  const completed = await Promise.all(ready.map(async (task) => ({ task, result: await launch(task) })));
  const ordered = orderTasks(completed.map((item) => item.task));
  for (const task of ordered) {
    const item = completed.find((candidate) => candidate.task === task);
    await processResult(item.task, item.result);
  }
  return { launched: ready.map((task) => task.task_id) };
}

export async function runStartSchedule({ tasks, statuses, launch, processResult, terminal }) {
  const running = new Map();
  const launched = [];
  const completedQueue = [];

  while (!terminal()) {
    const runningTasks = [...running.values()].map((item) => item.task);
    const ready = computeReadySet(tasks, statuses, runningTasks);
    for (const task of ready) {
      statuses.set(task.task_id, 'running');
      launched.push(task.task_id);
      const promise = Promise.resolve()
        .then(() => launch(task))
        .then((result) => {
          const completed = { task, result };
          completedQueue.push(completed);
          return completed;
        });
      running.set(task.task_id, { task, promise });
    }

    if (running.size === 0) break;
    await Promise.race([...running.values()].map((item) => item.promise));
    await Promise.resolve();
    const completedBatch = completedQueue.splice(0);
    for (const task of orderTasks(completedBatch.map((item) => item.task))) {
      const completed = completedBatch.find((item) => item.task === task);
      running.delete(task.task_id);
      await processResult(task, completed.result);
    }
  }

  if (running.size > 0) {
    await Promise.all([...running.values()].map((item) => item.promise));
    const rest = completedQueue.splice(0);
    for (const completed of orderTasks(rest.map((item) => item.task)).map((task) => rest.find((item) => item.task === task))) {
      await processResult(completed.task, completed.result);
    }
  }
  return { launched };
}
