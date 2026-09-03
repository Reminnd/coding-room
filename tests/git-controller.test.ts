import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { GitController, type PreviewGitActionCommand } from '../src/git/git-controller.ts';
import { GitCommandError, runGit } from '../src/git/git-process.ts';
import type { EventActor, TaskGraphRevision, TaskSpec } from '../src/protocol/schema.ts';
import { RoomService, type SettleGitActionInput } from '../src/room/room-service.ts';
import { getRoomStateSnapshot } from '../src/room/state-snapshot.ts';
import type { GitExecuteWorkerData, GitExecuteWorkerMessage } from './git-action-execute-worker.ts';
import { EXECUTOR, ORCHESTRATOR, PLANNER, REVIEWER, makeAttemptSettle, makeCodingResult, makeReview, makeTask } from './fixtures.ts';

const T = '2026-09-02T00:00:00.000Z';
const GIT_CONTROLLER = { participant_id: 'local-runner', actor_role: 'git_controller' } as const;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function spec(): TaskSpec {
  const { confirmed_by_user: _confirmed, confirmed_findings: _findings, ...value } = makeTask({ task_id: 'task-a', run_id: 'run-a', created_at: T });
  return { ...value, type: 'implementation', parent_task_id: null, based_on_review_id: null };
}

function setupService(databaseOrService: DatabaseSync | RoomService = new DatabaseSync(':memory:')): { service: RoomService; revision: TaskGraphRevision } {
  const service = databaseOrService instanceof RoomService ? databaseOrService : new RoomService(databaseOrService);
  service.createRoom('room-1', PLANNER);
  service.createPlan({ plan_id: 'plan-1', room_id: 'room-1', created_by_participant_id: 'codex-app', created_at: T }, PLANNER);
  const worker = service.listRoleAssignments('room-1').find((assignment) => assignment.role === 'worker');
  assert.ok(worker);
  const revision: TaskGraphRevision = {
    revision_id: 'revision-1', plan_id: 'plan-1', room_id: 'room-1', revision_no: 1,
    supersedes_revision_id: null, concurrency_limit: 1, acceptance_policy: 'per_task',
    nodes: [{ node_id: 'node-a', kind: 'task', task_spec: spec(), dependencies: [], write_scopes: [{ path: 'src', kind: 'tree' }], worker_assignment_id: worker.assignment_id, priority: 1 }],
    created_by_participant_id: 'codex-app', created_at: T,
  };
  service.createPlanRevision(revision, PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.decidePlanRevision({ approval_id: 'revision-approval', room_id: 'room-1', target_type: 'task_graph_revision', target_id: revision.revision_id, decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
  service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [{ node_id: 'node-a', dispatch_id: 'dispatch-a', canonical_worktree_path: null }] }, ORCHESTRATOR);
  return { service, revision };
}

class SuccessSettlementFaultService extends RoomService {
  private failNextSuccessSettlement = true;

  settleGitAction(input: SettleGitActionInput, actor: EventActor) {
    if (this.failNextSuccessSettlement && input.status === 'succeeded') {
      this.failNextSuccessSettlement = false;
      throw new Error('injected success settlement failure');
    }
    return super.settleGitAction(input, actor);
  }
}

type GitExecuteWorkerResult = Extract<GitExecuteWorkerMessage, { kind: 'result' }>;

// 只归一化 race/control 之间按 Contract 允许变化的 wall-clock timestamp；两边复用同一
// seed database 与同一绝对 repository/worktree paths，因此不需要隐藏任何 durable field。
function normalizeGitExecutionSnapshot(value: unknown): unknown {
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
  return JSON.parse(JSON.stringify(value, (key, nested: unknown) => {
    if (key === 'event_id' && typeof nested === 'string') return '<EVENT_UUID>';
    if (typeof nested === 'string' && timestamp.test(nested)) return '<WALL_CLOCK>';
    return nested;
  }));
}

// 两个 Worker 都先完成 service 初始化，由 start barrier 同时进入 public execute；随后各自
// 的 RoomService subclass 在 super.reserveGitAction 前通过 reservation barrier 对齐。错误、
// 非零 exit 与 bounded timeout 都显式传回，避免测试 harness 在 Worker 故障时挂起。
function runConcurrentGitExecutions(dbPath: string, gitActionId: string): Promise<GitExecuteWorkerResult[]> {
  const startBarrier = new SharedArrayBuffer(4);
  const reservationBarrier = new SharedArrayBuffer(12);
  const workers = [0, 1].map(() => new Worker(new URL('./git-action-execute-worker.ts', import.meta.url), {
    workerData: {
      dbPath,
      gitActionId,
      startBarrier,
      reservationBarrier,
      barrierTimeoutMs: 10_000,
    } satisfies GitExecuteWorkerData,
  }));
  const results: Array<GitExecuteWorkerResult | undefined> = [];
  const run = new Promise<GitExecuteWorkerResult[]>((resolveRun, rejectRun) => {
    let readyCount = 0;
    let resultCount = 0;
    let settled = false;
    const timeout = setTimeout(() => finishError(new Error('Git execute Worker timeout')), 20_000);
    const finishError = (error: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectRun(error);
    };
    workers.forEach((worker, index) => {
      worker.on('message', (message: GitExecuteWorkerMessage) => {
        if (settled) return;
        if (message.kind === 'ready') {
          readyCount += 1;
          if (readyCount === workers.length) {
            const gate = new Int32Array(startBarrier);
            Atomics.store(gate, 0, 1);
            Atomics.notify(gate, 0, workers.length);
          }
          return;
        }
        results[index] = message;
        resultCount += 1;
        if (resultCount === workers.length) {
          settled = true;
          clearTimeout(timeout);
          resolveRun(results as GitExecuteWorkerResult[]);
        }
      });
      worker.once('error', finishError);
      worker.once('exit', (code) => {
        if (settled) return;
        if (code !== 0) finishError(new Error(`Git execute Worker exited with code ${code}`));
        else if (!results[index]) finishError(new Error('Git execute Worker exited without result'));
      });
    });
  });
  return run.finally(async () => {
    await Promise.all(workers.map((worker) => worker.terminate().catch(() => -1)));
  });
}

test('create_worktree preview is read-only and approved execution runs the fixed operation once', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-room-git-controller-'));
  const repository = join(root, 'repo');
  const worktree = join(root, 'managed');
  try {
    execFileSync('git', ['init', repository]);
    git(repository, 'config', 'user.email', 'test@example.com');
    git(repository, 'config', 'user.name', 'Test');
    writeFileSync(join(repository, 'README.md'), 'base\n');
    git(repository, 'add', '--', 'README.md');
    git(repository, 'commit', '-m', 'chore: initial');
    const beforeHead = git(repository, 'rev-parse', 'HEAD');
    const { service, revision } = setupService();
    const controller = new GitController(service);
    const previewInput = {
      git_action_id: 'git-a', room_id: 'room-1', revision_id: revision.revision_id, node_id: 'node-a',
      operation: 'create_worktree', repository_root: resolve(repository), source_ref: 'HEAD', new_branch: 'codex/component-a', worktree_path: resolve(worktree),
    } satisfies PreviewGitActionCommand;
    const previewed = await controller.preview(previewInput, GIT_CONTROLLER);
    assert.equal(previewed.action.status, 'previewed');
    assert.equal(git(repository, 'rev-parse', 'HEAD'), beforeHead);
    assert.equal(service.listEvents('room-1').filter((event) => event.type === 'git_action_previewed').length, 1);
    const previewedSnapshot = getRoomStateSnapshot(service, { room_id: 'room-1' });
    const previewRetryCalls: string[] = [];
    const previewRetryController = new GitController(service, async (command, args, cwd) => {
      previewRetryCalls.push(`${command} ${args.join(' ')}`);
      return runGit(command, args, cwd);
    });
    const previewRetry = await previewRetryController.preview(previewInput, GIT_CONTROLLER);
    assert.equal(previewRetry.created, false);
    assert.deepEqual(previewRetry.action, previewed.action);
    assert.deepEqual(previewRetryCalls, []);
    assert.deepEqual(getRoomStateSnapshot(service, { room_id: 'room-1' }), previewedSnapshot);
    service.decideGitAction({ approval_id: 'git-approval', room_id: 'room-1', target_type: 'git_action_preview', target_id: 'git-a', decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
    const approvedSnapshot = getRoomStateSnapshot(service, { room_id: 'room-1' });
    const approvedRetry = await previewRetryController.preview(previewInput, GIT_CONTROLLER);
    assert.equal(approvedRetry.created, false);
    assert.deepEqual(previewRetryCalls, []);
    assert.deepEqual(getRoomStateSnapshot(service, { room_id: 'room-1' }), approvedSnapshot);
    const settled = await controller.execute('git-a', GIT_CONTROLLER);
    assert.equal(settled.status, 'succeeded');
    assert.equal(git(worktree, 'branch', '--show-current'), 'codex/component-a');
    assert.equal(service.getRun('run-a')?.worktree_path?.toLowerCase(), resolve(worktree).toLowerCase());
    assert.equal(service.listNodeDispatches('room-1')[0].status, 'ready');
    const settledSnapshot = getRoomStateSnapshot(service, { room_id: 'room-1' });
    const settledRetry = await previewRetryController.preview(previewInput, GIT_CONTROLLER);
    assert.equal(settledRetry.created, false);
    assert.deepEqual(settledRetry.action, settled);
    assert.deepEqual(previewRetryCalls, []);
    assert.deepEqual(getRoomStateSnapshot(service, { room_id: 'room-1' }), settledSnapshot);
    await assert.rejects(() => previewRetryController.preview({ ...previewInput, new_branch: 'codex/other' }, GIT_CONTROLLER), (error: unknown) => (error as { code?: string }).code === 'id_conflict');
    assert.deepEqual(previewRetryCalls, []);
    assert.deepEqual(getRoomStateSnapshot(service, { room_id: 'room-1' }), settledSnapshot);
    await assert.rejects(() => previewRetryController.preview(previewInput, { participant_id: 'codex-app', actor_role: 'planner' }), (error: unknown) => (error as { code?: string }).code === 'actor_not_allowed');
    assert.deepEqual(previewRetryCalls, []);
    assert.deepEqual(getRoomStateSnapshot(service, { room_id: 'room-1' }), settledSnapshot);
    await assert.rejects(() => controller.execute('git-a', GIT_CONTROLLER), (error: unknown) => (error as { code?: string }).code === 'git_action_already_terminal');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejected and stale GitAction previews never execute a Git mutation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-room-git-controller-'));
  const repository = join(root, 'repo');
  try {
    execFileSync('git', ['init', repository]);
    git(repository, 'config', 'user.email', 'test@example.com');
    git(repository, 'config', 'user.name', 'Test');
    writeFileSync(join(repository, 'README.md'), 'base\n');
    git(repository, 'add', '--', 'README.md');
    git(repository, 'commit', '-m', 'chore: initial');
    const { service, revision } = setupService();
    const controller = new GitController(service);
    await controller.preview({ git_action_id: 'git-rejected', room_id: 'room-1', revision_id: revision.revision_id, node_id: 'node-a', operation: 'create_worktree', repository_root: resolve(repository), source_ref: 'HEAD', new_branch: 'codex/rejected', worktree_path: join(root, 'rejected') }, GIT_CONTROLLER);
    service.decideGitAction({ approval_id: 'reject', room_id: 'room-1', target_type: 'git_action_preview', target_id: 'git-rejected', decision: 'rejected', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
    await assert.rejects(() => controller.execute('git-rejected', GIT_CONTROLLER), (error: unknown) => (error as { code?: string }).code === 'git_action_not_approved');
    assert.equal(git(repository, 'branch', '--list', 'codex/rejected'), '');

    const stalePath = join(root, 'stale');
    await controller.preview({ git_action_id: 'git-stale', room_id: 'room-1', revision_id: revision.revision_id, node_id: 'node-a', operation: 'create_worktree', repository_root: resolve(repository), source_ref: 'HEAD', new_branch: 'codex/stale', worktree_path: stalePath }, GIT_CONTROLLER);
    service.decideGitAction({ approval_id: 'approve-stale', room_id: 'room-1', target_type: 'git_action_preview', target_id: 'git-stale', decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
    service.addRunGuidance({ guidance_id: 'guidance-after-preview', room_id: 'room-1', run_id: 'run-a', text: 'new room fact' }, PLANNER);
    await assert.rejects(() => controller.execute('git-stale', GIT_CONTROLLER), (error: unknown) => (error as { code?: string }).code === 'git_preview_stale');
    assert.equal(git(repository, 'branch', '--list', 'codex/stale'), '');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('wrong Git actor is rejected before any observer or mutation process', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-room-git-authority-'));
  const repository = join(root, 'repo');
  try {
    execFileSync('git', ['init', repository]);
    git(repository, 'config', 'user.email', 'test@example.com');
    git(repository, 'config', 'user.name', 'Test');
    writeFileSync(join(repository, 'README.md'), 'base\n');
    git(repository, 'add', '--', 'README.md');
    git(repository, 'commit', '-m', 'chore: initial');
    const { service, revision } = setupService();
    const calls: string[] = [];
    const controller = new GitController(service, async (command, args, cwd) => {
      calls.push(`${command} ${args.join(' ')}`);
      return runGit(command, args, cwd);
    });
    const wrongActor = { participant_id: 'codex-app', actor_role: 'planner' } as const;
    await assert.rejects(() => controller.preview({ git_action_id: 'git-wrong', room_id: 'room-1', revision_id: revision.revision_id, node_id: 'node-a', operation: 'create_worktree', repository_root: resolve(repository), source_ref: 'HEAD', new_branch: 'codex/wrong', worktree_path: join(root, 'wrong') }, wrongActor), (error: unknown) => (error as { code?: string }).code === 'actor_not_allowed');
    assert.deepEqual(calls, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('disabled and replaced Git controller actors cannot retry an existing preview', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-room-git-authority-retry-'));
  const repository = join(root, 'repo');
  try {
    execFileSync('git', ['init', repository]);
    git(repository, 'config', 'user.email', 'test@example.com');
    git(repository, 'config', 'user.name', 'Test');
    writeFileSync(join(repository, 'README.md'), 'base\n');
    git(repository, 'add', '--', 'README.md');
    git(repository, 'commit', '-m', 'chore: initial');
    const { service, revision } = setupService();
    const previewInput = {
      git_action_id: 'git-authority-retry', room_id: 'room-1', revision_id: revision.revision_id, node_id: 'node-a',
      operation: 'create_worktree', repository_root: resolve(repository), source_ref: 'HEAD', new_branch: 'codex/authority-retry', worktree_path: resolve(join(root, 'worktree')),
    } as const;
    const calls: string[] = [];
    const controller = new GitController(service, async (command, args, cwd) => {
      calls.push(`${command} ${args.join(' ')}`);
      return runGit(command, args, cwd);
    });
    await controller.preview(previewInput, GIT_CONTROLLER);
    calls.length = 0;

    const wrongActorSnapshot = getRoomStateSnapshot(service, { room_id: 'room-1' });
    await assert.rejects(() => controller.preview(previewInput, { participant_id: 'codex-app', actor_role: 'planner' }), (error: unknown) => (error as { code?: string }).code === 'actor_not_allowed');
    assert.deepEqual(calls, []);
    assert.deepEqual(getRoomStateSnapshot(service, { room_id: 'room-1' }), wrongActorSnapshot);

    service.setParticipantEnabled('local-runner', false, ORCHESTRATOR);
    const disabledSnapshot = getRoomStateSnapshot(service, { room_id: 'room-1' });
    await assert.rejects(() => controller.preview(previewInput, GIT_CONTROLLER), (error: unknown) => (error as { code?: string }).code === 'actor_not_allowed');
    assert.deepEqual(calls, []);
    assert.deepEqual(getRoomStateSnapshot(service, { room_id: 'room-1' }), disabledSnapshot);

    service.setParticipantEnabled('local-runner', true, ORCHESTRATOR);
    service.registerParticipant({ participant_id: 'local-runner-2', display_name: 'Local Runner 2', kind: 'service', provider: 'local', adapter_id: 'local_runner', capabilities: ['git_control'], config_ref: null, enabled: true, created_at: T }, ORCHESTRATOR);
    service.createRoleAssignment({ assignment_id: 'git-controller-replacement', room_id: 'room-1', scope_type: 'room', scope_id: null, role: 'git_controller', participant_id: 'local-runner-2', created_at: T }, ORCHESTRATOR);
    const replacedSnapshot = getRoomStateSnapshot(service, { room_id: 'room-1' });
    await assert.rejects(() => controller.preview(previewInput, GIT_CONTROLLER), (error: unknown) => (error as { code?: string }).code === 'actor_not_allowed');
    assert.deepEqual(calls, []);
    assert.deepEqual(getRoomStateSnapshot(service, { room_id: 'room-1' }), replacedSnapshot);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('concurrent execute across independent SQLite connections reserves once', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-room-git-reservation-'));
  const repository = join(root, 'repo');
  const worktree = resolve(join(root, 'managed'));
  const seedDbPath = join(root, 'seed.sqlite');
  const controlDbPath = join(root, 'control.sqlite');
  const raceDbPath = join(root, 'race.sqlite');
  let seedDb: DatabaseSync | null = null;
  let controlDb: DatabaseSync | null = null;
  try {
    const initializeRepository = (): void => {
      execFileSync('git', ['init', '-b', 'main', repository]);
      git(repository, 'config', 'user.email', 'test@example.com');
      git(repository, 'config', 'user.name', 'Test');
      writeFileSync(join(repository, 'README.md'), 'base\n');
      git(repository, 'add', '--', 'README.md');
      git(repository, 'commit', '-m', 'chore: initial');
    };
    initializeRepository();

    seedDb = new DatabaseSync(seedDbPath);
    const { service: seedService, revision } = setupService(seedDb);
    const previewInput = {
      git_action_id: 'git-race', room_id: 'room-1', revision_id: revision.revision_id, node_id: 'node-a',
      operation: 'create_worktree', repository_root: resolve(repository), source_ref: 'main', new_branch: 'codex/race', worktree_path: worktree,
    } as const;
    const seedController = new GitController(seedService);
    await seedController.preview(previewInput, GIT_CONTROLLER);
    seedService.decideGitAction({ approval_id: 'approve-race', room_id: 'room-1', target_type: 'git_action_preview', target_id: 'git-race', decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
    seedDb.close();
    seedDb = null;

    // Control 使用 seed 的 byte-identical DB 与同一路径，只执行一次 public execute；随后
    // 重建同一路径的初始 repository，race 才能与 control 共享全部 durable identity。
    copyFileSync(seedDbPath, controlDbPath);
    controlDb = new DatabaseSync(controlDbPath);
    const controlService = new RoomService(controlDb);
    let controlMutationCount = 0;
    const controlController = new GitController(controlService, async (command, args, cwd) => {
      if (command === 'worktree' && args[0] === 'add') controlMutationCount += 1;
      return runGit(command, args, cwd);
    });
    const controlResult = await controlController.execute('git-race', GIT_CONTROLLER);
    assert.equal(controlResult.status, 'succeeded');
    assert.equal(controlMutationCount, 1);
    controlDb.close();
    controlDb = null;
    const controlReadDb = new DatabaseSync(controlDbPath);
    const controlSnapshot = getRoomStateSnapshot(new RoomService(controlReadDb), { room_id: 'room-1' });
    controlReadDb.close();

    rmSync(worktree, { recursive: true, force: true });
    rmSync(repository, { recursive: true, force: true });
    initializeRepository();
    copyFileSync(seedDbPath, raceDbPath);
    const workerResults = await runConcurrentGitExecutions(raceDbPath, 'git-race');
    assert.equal(workerResults.length, 2);
    const successes = workerResults.filter((result) => result.error === null);
    const losers = workerResults.filter((result) => result.error !== null);
    assert.equal(successes.length, 1);
    assert.equal(losers.length, 1);
    assert.equal(successes[0]?.status, 'succeeded');
    assert.equal(losers[0]?.error?.isProtocolError, true);
    assert.equal(losers[0]?.error?.code, 'git_action_already_terminal');
    assert.equal(workerResults.reduce((total, result) => total + result.mutationProcessCount, 0), 1);
    assert.deepEqual(workerResults.map((result) => result.reservationBarrierArrivals), [2, 2]);

    const raceReadDb = new DatabaseSync(raceDbPath);
    const raceSnapshot = getRoomStateSnapshot(new RoomService(raceReadDb), { room_id: 'room-1' });
    raceReadDb.close();
    assert.deepEqual(normalizeGitExecutionSnapshot(raceSnapshot), normalizeGitExecutionSnapshot(controlSnapshot));
    assert.equal(raceSnapshot.git_actions.find((action) => action.git_action_id === 'git-race')?.status, 'succeeded');
    assert.deepEqual(raceSnapshot.events.filter((event) => event.entity_id === 'git-race' || event.entity_id === 'approve-race').map((event) => event.type), ['git_action_previewed', 'git_action_approved', 'git_action_executing', 'git_action_succeeded']);
    assert.equal(raceSnapshot.events.filter((event) => event.type === 'git_action_executing' && event.entity_id === 'git-race').length, 1);
  } finally {
    seedDb?.close();
    controlDb?.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('explicit reconcile records outcome_unknown without mutation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-room-git-reconcile-'));
  const repository = join(root, 'repo');
  try {
    execFileSync('git', ['init', repository]);
    git(repository, 'config', 'user.email', 'test@example.com');
    git(repository, 'config', 'user.name', 'Test');
    writeFileSync(join(repository, 'README.md'), 'base\n');
    git(repository, 'add', '--', 'README.md');
    git(repository, 'commit', '-m', 'chore: initial');
    const second = setupService();
    const crashController = new GitController(second.service);
    const crashPath = join(root, 'crash');
    const previewed = await crashController.preview({ git_action_id: 'git-crash', room_id: 'room-1', revision_id: second.revision.revision_id, node_id: 'node-a', operation: 'create_worktree', repository_root: resolve(repository), source_ref: 'HEAD', new_branch: 'codex/crash', worktree_path: resolve(crashPath) }, GIT_CONTROLLER);
    second.service.decideGitAction({ approval_id: 'approve-crash', room_id: 'room-1', target_type: 'git_action_preview', target_id: 'git-crash', decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
    const { preview_event_sequence: _sequence, ...observed } = previewed.action.preview;
    second.service.reserveGitAction('git-crash', observed, GIT_CONTROLLER);
    const reconciled = await crashController.reconcile('git-crash', GIT_CONTROLLER);
    assert.equal(reconciled.status, 'outcome_unknown');
    assert.equal(git(repository, 'branch', '--list', 'codex/crash'), '');
    assert.equal(second.service.getRun('run-a')?.worktree_path, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('success settlement failure preserves executing ownership until explicit reconcile', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-room-git-settlement-'));
  const repository = join(root, 'repo');
  try {
    execFileSync('git', ['init', repository]);
    git(repository, 'config', 'user.email', 'test@example.com');
    git(repository, 'config', 'user.name', 'Test');
    writeFileSync(join(repository, 'README.md'), 'base\n');
    git(repository, 'add', '--', 'README.md');
    git(repository, 'commit', '-m', 'chore: initial');
    const service = new SuccessSettlementFaultService(new DatabaseSync(':memory:'));
    const { revision } = setupService(service);
    const worktree = resolve(join(root, 'managed'));
    let mutationCalls = 0;
    const controller = new GitController(service, async (command, args, cwd) => {
      if (command === 'worktree' && args[0] === 'add') mutationCalls += 1;
      return runGit(command, args, cwd);
    });
    const previewInput = {
      git_action_id: 'git-settlement-fault', room_id: 'room-1', revision_id: revision.revision_id, node_id: 'node-a',
      operation: 'create_worktree', repository_root: resolve(repository), source_ref: 'HEAD', new_branch: 'codex/settlement-fault', worktree_path: worktree,
    } as const;
    await controller.preview(previewInput, GIT_CONTROLLER);
    service.decideGitAction({ approval_id: 'approve-settlement-fault', room_id: 'room-1', target_type: 'git_action_preview', target_id: 'git-settlement-fault', decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
    await assert.rejects(() => controller.execute('git-settlement-fault', GIT_CONTROLLER), /injected success settlement failure/);
    assert.equal(mutationCalls, 1);
    const executingSnapshot = getRoomStateSnapshot(service, { room_id: 'room-1' });
    assert.equal(executingSnapshot.git_actions.find((action) => action.git_action_id === 'git-settlement-fault')?.status, 'executing');
    assert.equal(executingSnapshot.node_dispatches.find((dispatch) => dispatch.node_id === 'node-a')?.status, 'awaiting_git');
    assert.equal(executingSnapshot.runs.find((run) => run.run_id === 'run-a')?.worktree_path, null);
    assert.equal(executingSnapshot.events.filter((event) => event.type === 'git_action_failed' && event.entity_id === 'git-settlement-fault').length, 0);

    await assert.rejects(() => controller.execute('git-settlement-fault', GIT_CONTROLLER), (error: unknown) => (error as { code?: string }).code === 'git_action_already_terminal');
    assert.equal(mutationCalls, 1);
    assert.deepEqual(getRoomStateSnapshot(service, { room_id: 'room-1' }), executingSnapshot);

    const reconciled = await controller.reconcile('git-settlement-fault', GIT_CONTROLLER);
    assert.equal(reconciled.status, 'outcome_unknown');
    const reconciledSnapshot = getRoomStateSnapshot(service, { room_id: 'room-1' });
    assert.equal(reconciledSnapshot.git_actions.find((action) => action.git_action_id === 'git-settlement-fault')?.status, 'outcome_unknown');
    assert.equal(reconciledSnapshot.events.filter((event) => event.type === 'git_action_failed' && event.entity_id === 'git-settlement-fault').length, 0);
    assert.deepEqual(reconciledSnapshot.events.filter((event) => event.entity_id === 'git-settlement-fault' || event.entity_id === 'approve-settlement-fault').map((event) => event.type), ['git_action_previewed', 'git_action_approved', 'git_action_executing', 'git_action_outcome_unknown']);
    const retryCalls: string[] = [];
    const retryController = new GitController(service, async (command, args, cwd) => {
      retryCalls.push(`${command} ${args.join(' ')}`);
      return runGit(command, args, cwd);
    });
    const retriedPreview = await retryController.preview(previewInput, GIT_CONTROLLER);
    assert.equal(retriedPreview.created, false);
    assert.deepEqual(retryCalls, []);
    assert.deepEqual(getRoomStateSnapshot(service, { room_id: 'room-1' }), reconciledSnapshot);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('integration_only follows review, commit, terminal acceptance and final ff gates', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-room-integration-only-'));
  const repository = join(root, 'repo');
  const componentPath = join(root, 'component');
  const secondComponentPath = join(root, 'component-b');
  const integrationPath = join(root, 'integration');
  try {
    execFileSync('git', ['init', '-b', 'main', repository]);
    git(repository, 'config', 'user.email', 'test@example.com');
    git(repository, 'config', 'user.name', 'Test');
    writeFileSync(join(repository, 'README.md'), 'base\n');
    git(repository, 'add', '--', 'README.md');
    git(repository, 'commit', '-m', 'chore: initial');

    const service = new RoomService(new DatabaseSync(':memory:'));
    service.createRoom('room-1', PLANNER);
    service.createPlan({ plan_id: 'plan-1', room_id: 'room-1', created_by_participant_id: 'codex-app', created_at: T }, PLANNER);
    const worker = service.listRoleAssignments('room-1').find((assignment) => assignment.role === 'worker');
    assert.ok(worker);
    const componentSpec = spec();
    const secondComponentSpec = { ...spec(), task_id: 'task-b', run_id: 'run-b' };
    const integrationSpec = { ...spec(), task_id: 'task-i', run_id: 'run-i' };
    const revision: TaskGraphRevision = {
      revision_id: 'revision-1', plan_id: 'plan-1', room_id: 'room-1', revision_no: 1,
      supersedes_revision_id: null, concurrency_limit: 1, acceptance_policy: 'integration_only',
      nodes: [
        { node_id: 'node-b', kind: 'task', task_spec: secondComponentSpec, dependencies: ['node-a'], write_scopes: [{ path: 'src', kind: 'tree' }], worker_assignment_id: worker.assignment_id, priority: 1 },
        { node_id: 'node-a', kind: 'task', task_spec: componentSpec, dependencies: [], write_scopes: [{ path: 'src', kind: 'tree' }], worker_assignment_id: worker.assignment_id, priority: 2 },
        { node_id: 'node-i', kind: 'integration', task_spec: integrationSpec, dependencies: ['node-b', 'node-a'], write_scopes: [{ path: '.', kind: 'tree' }], worker_assignment_id: worker.assignment_id, priority: 0 },
      ],
      created_by_participant_id: 'codex-app', created_at: T,
    };
    service.createPlanRevision(revision, PLANNER);
    service.transitionToArchitectureReview('room-1', PLANNER);
    service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
    service.decidePlanRevision({ approval_id: 'revision-approval', room_id: 'room-1', target_type: 'task_graph_revision', target_id: revision.revision_id, decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
    service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [{ node_id: 'node-a', dispatch_id: 'dispatch-a', canonical_worktree_path: null }] }, ORCHESTRATOR);
    let failCommit = false;
    const controller = new GitController(service, async (command, args, cwd) => {
      if (command === 'commit' && failCommit) {
        failCommit = false;
        throw new GitCommandError(command, args, cwd, 1, 'injected commit failure');
      }
      return runGit(command, args, cwd);
    });

    await controller.preview({ git_action_id: 'create-a', room_id: 'room-1', revision_id: revision.revision_id, node_id: 'node-a', operation: 'create_worktree', repository_root: resolve(repository), source_ref: 'main', new_branch: 'codex/component', worktree_path: resolve(componentPath) }, GIT_CONTROLLER);
    service.decideGitAction({ approval_id: 'approve-create-a', room_id: 'room-1', target_type: 'git_action_preview', target_id: 'create-a', decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
    await controller.execute('create-a', GIT_CONTROLLER);
    service.claimRunAttempt({ attempt_id: 'attempt-a', run_id: 'run-a', room_id: 'room-1', worktree_path: resolve(componentPath) }, EXECUTOR);
    mkdirSync(join(componentPath, 'src'), { recursive: true });
    writeFileSync(join(componentPath, 'src', 'component.ts'), 'component\n');
    service.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-a', result: makeCodingResult({ task_id: 'task-a' }), git_evidence: { staged: [], unstaged: [], untracked: ['src/component.ts'] } }), EXECUTOR);
    service.submitReview(makeReview({ review_id: 'review-a', task_id: 'task-a', run_id: 'run-a', attempt_id: 'attempt-a', decision: 'approved' }), REVIEWER);
    service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [] }, ORCHESTRATOR);
    assert.equal(service.getRun('run-a')?.status, 'accepted');
    assert.equal(service.listNodeDispatches('room-1').find((dispatch) => dispatch.node_id === 'node-a')?.status, 'awaiting_git');

    failCommit = true;
    const failedCommitInput = {
      git_action_id: 'commit-a-failed', room_id: 'room-1', revision_id: revision.revision_id, node_id: 'node-a',
      operation: 'commit_paths', repository_root: resolve(repository), worktree_path: resolve(componentPath), branch: 'codex/component', paths: ['src/component.ts'], commit_message: 'feat(component): add component',
    } satisfies PreviewGitActionCommand;
    await controller.preview(failedCommitInput, GIT_CONTROLLER);
    service.decideGitAction({ approval_id: 'approve-commit-a-failed', room_id: 'room-1', target_type: 'git_action_preview', target_id: 'commit-a-failed', decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
    const failedCommit = await controller.execute('commit-a-failed', GIT_CONTROLLER);
    assert.equal(failedCommit.status, 'failed');
    assert.deepEqual(failedCommit.result?.git_evidence?.staged, ['src/component.ts']);
    assert.equal(service.listNodeDispatches('room-1').find((dispatch) => dispatch.node_id === 'node-a')?.status, 'awaiting_git');
    const failedRetrySnapshot = getRoomStateSnapshot(service, { room_id: 'room-1' });
    const failedRetryCalls: string[] = [];
    const failedRetryController = new GitController(service, async (command, args, cwd) => {
      failedRetryCalls.push(`${command} ${args.join(' ')}`);
      return runGit(command, args, cwd);
    });
    const failedRetry = await failedRetryController.preview(failedCommitInput, GIT_CONTROLLER);
    assert.equal(failedRetry.created, false);
    assert.deepEqual(failedRetry.action, failedCommit);
    assert.deepEqual(failedRetryCalls, []);
    const failedRetryAfterSnapshot = getRoomStateSnapshot(service, { room_id: 'room-1' });
    assert.deepEqual(failedRetryAfterSnapshot, failedRetrySnapshot);
    assert.equal(failedRetryAfterSnapshot.cursor, failedRetrySnapshot.cursor);
    assert.deepEqual(failedRetryAfterSnapshot.events, failedRetrySnapshot.events);

    await controller.preview({ git_action_id: 'commit-a', room_id: 'room-1', revision_id: revision.revision_id, node_id: 'node-a', operation: 'commit_paths', repository_root: resolve(repository), worktree_path: resolve(componentPath), branch: 'codex/component', paths: ['src/component.ts'], commit_message: 'feat(component): add component' }, GIT_CONTROLLER);
    service.decideGitAction({ approval_id: 'approve-commit-a', room_id: 'room-1', target_type: 'git_action_preview', target_id: 'commit-a', decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
    await controller.execute('commit-a', GIT_CONTROLLER);
    const commitRetrySnapshot = getRoomStateSnapshot(service, { room_id: 'room-1' });
    const commitRetryCalls: string[] = [];
    const commitRetryController = new GitController(service, async (command, args, cwd) => {
      commitRetryCalls.push(`${command} ${args.join(' ')}`);
      return runGit(command, args, cwd);
    });
    const commitRetryInput = { git_action_id: 'commit-a', room_id: 'room-1', revision_id: revision.revision_id, node_id: 'node-a', operation: 'commit_paths', repository_root: resolve(repository), worktree_path: resolve(componentPath), branch: 'codex/component', paths: ['src/component.ts'], commit_message: 'feat(component): add component' } satisfies PreviewGitActionCommand;
    const commitRetry = await commitRetryController.preview(commitRetryInput, GIT_CONTROLLER);
    assert.equal(commitRetry.created, false);
    assert.deepEqual(commitRetryCalls, []);
    assert.deepEqual(getRoomStateSnapshot(service, { room_id: 'room-1' }), commitRetrySnapshot);
    await assert.rejects(() => commitRetryController.preview({ ...commitRetryInput, commit_message: 'fix(component): change component' }, GIT_CONTROLLER), (error: unknown) => (error as { code?: string }).code === 'id_conflict');
    assert.deepEqual(commitRetryCalls, []);
    assert.deepEqual(getRoomStateSnapshot(service, { room_id: 'room-1' }), commitRetrySnapshot);

    service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [{ node_id: 'node-b', dispatch_id: 'dispatch-b', canonical_worktree_path: null }] }, ORCHESTRATOR);
    await controller.preview({ git_action_id: 'create-b', room_id: 'room-1', revision_id: revision.revision_id, node_id: 'node-b', operation: 'create_worktree', repository_root: resolve(repository), source_ref: 'codex/component', new_branch: 'codex/component-b', worktree_path: resolve(secondComponentPath) }, GIT_CONTROLLER);
    service.decideGitAction({ approval_id: 'approve-create-b', room_id: 'room-1', target_type: 'git_action_preview', target_id: 'create-b', decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
    await controller.execute('create-b', GIT_CONTROLLER);
    service.claimRunAttempt({ attempt_id: 'attempt-b', run_id: 'run-b', room_id: 'room-1', worktree_path: resolve(secondComponentPath) }, EXECUTOR);
    mkdirSync(join(secondComponentPath, 'src'), { recursive: true });
    writeFileSync(join(secondComponentPath, 'src', 'component-b.ts'), 'component-b\n');
    service.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-b', result: makeCodingResult({ task_id: 'task-b' }), git_evidence: { staged: [], unstaged: [], untracked: ['src/component-b.ts'] } }), EXECUTOR);
    service.submitReview(makeReview({ review_id: 'review-b', task_id: 'task-b', run_id: 'run-b', attempt_id: 'attempt-b', decision: 'approved' }), REVIEWER);
    service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [] }, ORCHESTRATOR);
    assert.equal(service.getRun('run-b')?.status, 'accepted');

    await controller.preview({ git_action_id: 'commit-b', room_id: 'room-1', revision_id: revision.revision_id, node_id: 'node-b', operation: 'commit_paths', repository_root: resolve(repository), worktree_path: resolve(secondComponentPath), branch: 'codex/component-b', paths: ['src/component-b.ts'], commit_message: 'feat(component): add dependent component' }, GIT_CONTROLLER);
    service.decideGitAction({ approval_id: 'approve-commit-b', room_id: 'room-1', target_type: 'git_action_preview', target_id: 'commit-b', decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
    await controller.execute('commit-b', GIT_CONTROLLER);
    service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [{ node_id: 'node-i', dispatch_id: 'dispatch-i', canonical_worktree_path: null }] }, ORCHESTRATOR);

    const invalidPredecessorSnapshot = getRoomStateSnapshot(service, { room_id: 'room-1' });
    const invalidPredecessorCalls: string[] = [];
    const invalidPredecessorController = new GitController(service, async (command, args, cwd) => {
      invalidPredecessorCalls.push(`${command} ${args.join(' ')}`);
      return runGit(command, args, cwd);
    });
    await assert.rejects(() => invalidPredecessorController.preview({ git_action_id: 'create-i-wrong-source', room_id: 'room-1', revision_id: revision.revision_id, node_id: 'node-i', operation: 'create_worktree', repository_root: resolve(repository), source_ref: 'codex/component', new_branch: 'codex/integration-wrong-source', worktree_path: resolve(join(root, 'integration-wrong-source')) }, GIT_CONTROLLER), (error: unknown) => (error as { code?: string }).code === 'validation_failed');
    assert.ok(invalidPredecessorCalls.length > 0);
    assert.equal(invalidPredecessorCalls.some((call) => call.startsWith('worktree add')), false);
    assert.deepEqual(getRoomStateSnapshot(service, { room_id: 'room-1' }), invalidPredecessorSnapshot);

    await controller.preview({ git_action_id: 'create-i', room_id: 'room-1', revision_id: revision.revision_id, node_id: 'node-i', operation: 'create_worktree', repository_root: resolve(repository), source_ref: 'codex/component-b', new_branch: 'codex/integration', worktree_path: resolve(integrationPath) }, GIT_CONTROLLER);
    service.decideGitAction({ approval_id: 'approve-create-i', room_id: 'room-1', target_type: 'git_action_preview', target_id: 'create-i', decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
    await controller.execute('create-i', GIT_CONTROLLER);
    service.claimRunAttempt({ attempt_id: 'attempt-i', run_id: 'run-i', room_id: 'room-1', worktree_path: resolve(integrationPath) }, EXECUTOR);
    service.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-i', result: makeCodingResult({ task_id: 'task-i' }), git_evidence: { staged: [], unstaged: [], untracked: [] } }), EXECUTOR);
    service.submitReview(makeReview({ review_id: 'review-i', task_id: 'task-i', run_id: 'run-i', attempt_id: 'attempt-i', decision: 'approved' }), REVIEWER);
    service.acceptReview('review-i', true, REVIEWER);

    git(repository, 'switch', '-c', 'diverged-target');
    writeFileSync(join(repository, 'target-only.txt'), 'diverged\n');
    git(repository, 'add', '--', 'target-only.txt');
    git(repository, 'commit', '-m', 'test(integration): diverge target');
    const divergedHead = git(repository, 'rev-parse', 'HEAD');
    await controller.preview({ git_action_id: 'ff-diverged', room_id: 'room-1', revision_id: revision.revision_id, node_id: 'node-i', operation: 'integrate_fast_forward', repository_root: resolve(repository), source_branch: 'codex/integration', target_branch: 'diverged-target', target_worktree_path: resolve(repository) }, GIT_CONTROLLER);
    service.decideGitAction({ approval_id: 'approve-ff-diverged', room_id: 'room-1', target_type: 'git_action_preview', target_id: 'ff-diverged', decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
    const failedFastForward = await controller.execute('ff-diverged', GIT_CONTROLLER);
    assert.equal(failedFastForward.status, 'failed');
    assert.equal(git(repository, 'rev-parse', 'HEAD'), divergedHead);
    assert.equal(git(repository, 'rev-list', '--merges', '--count', 'HEAD'), '0');
    git(repository, 'switch', 'main');

    await controller.preview({ git_action_id: 'ff-i', room_id: 'room-1', revision_id: revision.revision_id, node_id: 'node-i', operation: 'integrate_fast_forward', repository_root: resolve(repository), source_branch: 'codex/integration', target_branch: 'main', target_worktree_path: resolve(repository) }, GIT_CONTROLLER);
    service.decideGitAction({ approval_id: 'approve-ff-i', room_id: 'room-1', target_type: 'git_action_preview', target_id: 'ff-i', decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
    await controller.execute('ff-i', GIT_CONTROLLER);
    assert.equal(git(repository, 'rev-parse', 'main'), git(repository, 'rev-parse', 'codex/integration'));
    assert.equal(getRoomStateSnapshot(service, { room_id: 'room-1' }).plan_work_items[0].completed, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
