import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
import test from 'node:test';
import { RoomService } from '../src/room/room-service.ts';
import { RoomUiApplication } from '../src/ui/application.ts';
import { ProjectRegistry } from '../src/ui/project-registry.ts';
import { WorkbenchStore } from '../src/ui/workbench-store.ts';
import { DesktopProcesses } from '../src/ui/desktop-processes.ts';
import { EXECUTOR, PLANNER, makeAttemptSettle, makeTask } from './fixtures.ts';

test('desktop stop waits for its owned launch terminal state and does not cancel external runs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'room-shutdown-'));
  const dbPath = join(root, 'room.sqlite');
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  const registry = new ProjectRegistry(join(root, 'registry.json'));
  registry.add({ project_id: 'project', name: 'Project', project_path: root, database_path: dbPath, room_id: 'room-1', control_participant_id: 'codex-app', port: 12345 });
  service.createRoom('room-1', PLANNER);
  for (const name of ['owned', 'external']) {
    service.transitionToArchitectureReview('room-1', PLANNER);
    service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
    service.submitTask(makeTask({ task_id: `task-${name}`, run_id: `run-${name}` }), PLANNER);
  }
  service.claimRunAttempt({ room_id: 'room-1', run_id: 'run-external', attempt_id: 'external-attempt', worktree_path: join(root, 'external') }, EXECUTOR);
  const application = new RoomUiApplication(registry, {
    runOneShot: async (config, spawnProcess) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      service.claimRunAttempt({ room_id: 'room-1', run_id: config.runId, attempt_id: config.attemptId, worktree_path: root }, EXECUTOR);
      assert.ok(spawnProcess);
      const child = spawnProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: root, shell: false });
      const owner = new DesktopProcesses(db).get(`attempt:${config.attemptId}`, 'room-1');
      assert.equal(owner?.owner_pid, process.pid);
      assert.equal(owner?.child_pid, child.pid);
      await new Promise<void>((resolve) => {
        const poll = setInterval(() => {
          if (service.getRun(config.runId)?.status === 'cancel_requested') { clearInterval(poll); resolve(); }
        }, 5);
      });
      const exited = once(child, 'exit');
      child.kill();
      await exited;
      return service.settleRunAttempt(makeAttemptSettle({ attempt_id: config.attemptId, status: 'canceled', result: null, failure: null }), EXECUTOR);
    },
  });
  const store = new WorkbenchStore(db, 'room-1');
  const tasks = ['owned', 'external'].map((name) => {
    const task = store.save({ title: name, goal: name, mode: 'task', verification: 'standard', source_ids: [] });
    store.update(task.id, { run_id: `run-${name}`, task_id: `task-${name}` });
    return task;
  });
  try {
    application.startRun('project', { run_id: 'run-owned', attempt_id: 'owned-attempt' });
    assert.equal(service.activeAttemptForRun('run-owned'), null, 'Stop is requested while the owned launch is still preparing');
    assert.equal((application.execution.read('project', tasks[1].id) as any).execution_observation, 'unknown');
    await application.stopOwnedRuns();
    assert.equal(service.getRun('run-owned')?.status, 'canceled');
    assert.equal(service.getAttempt('owned-attempt')?.status, 'canceled');
    assert.equal(application.listLaunches('project')[0].status, 'completed');
    assert.equal(service.getRun('run-external')?.status, 'running');
  } finally { await application.stopOwnedRuns(); await application.close(); db.close(); rmSync(root, { recursive: true, force: true }); }
});

test('desktop activity includes manual verification and stop waits for the real command to finish', { timeout: 15000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'room-verification-shutdown-'));
  const dbPath = join(root, 'room.sqlite');
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER); service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask({ verification: [{ command: 'node -e "setInterval(() => {}, 1000)"', detects: 'Long verification command', decision_if_failed: 'Inspect termination' }] }), PLANNER);
  service.claimRunAttempt({ room_id: 'room-1', run_id: 'run-1', attempt_id: 'attempt-1', worktree_path: root }, EXECUTOR);
  service.settleRunAttempt(makeAttemptSettle(), EXECUTOR);
  const registry = new ProjectRegistry(join(root, 'registry.json'));
  registry.add({ project_id: 'project', name: 'Project', project_path: root, database_path: dbPath, room_id: 'room-1', control_participant_id: 'codex-app', port: null });
  const store = new WorkbenchStore(db, 'room-1');
  const task = store.save({ title: 'Manual verification', goal: 'Wait for termination', mode: 'task', verification: 'standard', source_ids: [] });
  store.update(task.id, { run_id: 'run-1', task_id: 'task-1' });
  const application = new RoomUiApplication(registry);
  let pending: Promise<unknown> | null = null;
  try {
    pending = application.runVerification('project', task.id, { command_index: 0 });
    const deadline = Date.now() + 5000;
    let activity: any;
    do {
      activity = await application.desktopActivity();
      if (activity.verifications.length) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    } while (Date.now() < deadline);
    assert.deepEqual(activity.verifications, [{ project_id: 'project', run_id: 'run-1' }]);
    assert.equal(activity.launches.length, 0);
    await application.stopOwnedRuns();
    const result = await pending as any;
    assert.ok(result.completed_at);
    assert.notEqual(result.exit_code, 0);
    assert.equal((await application.desktopActivity() as any).verifications.length, 0);
    assert.equal(service.getRun('run-1')?.status, 'review_required');
  } finally { await application.close(); await pending; db.close(); rmSync(root, { recursive: true, force: true }); }
});
