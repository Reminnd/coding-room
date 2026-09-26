import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { RoomUiApplication } from '../src/ui/application.ts';
import { createRoomUiHttpServer } from '../src/ui/http-server.ts';
import { ProjectRegistry } from '../src/ui/project-registry.ts';
import { RoomService } from '../src/room/room-service.ts';
import { PlanScheduler } from '../src/scheduler/plan-scheduler.ts';
import { getRoomStateSnapshot } from '../src/room/state-snapshot.ts';
import {
  EXECUTOR,
  ORCHESTRATOR,
  PLANNER,
  REVIEWER,
  WORKER,
  makeAttemptSettle,
  makeCodingResult,
  makeQuestion,
  makeTask,
} from './fixtures.ts';

interface Fixture {
  root: string;
  project: string;
  dbPath: string;
  roomId: string;
}

function makeFixture(name: string): Fixture {
  const root = mkdtempSync(join(tmpdir(), `room-ui-${name}-`));
  const project = join(root, `${name} project`);
  mkdirSync(project);
  spawnSync('git', ['init', '-b', 'main'], { cwd: project, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'ui-test@example.invalid'], { cwd: project });
  spawnSync('git', ['config', 'user.name', 'UI Test'], { cwd: project });
  writeFileSync(join(project, 'README.txt'), name);
  spawnSync('git', ['add', 'README.txt'], { cwd: project });
  spawnSync('git', ['commit', '-m', 'test fixture'], { cwd: project, encoding: 'utf8' });
  const dbPath = join(root, 'room.sqlite');
  const roomId = `room-${name}`;
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  service.createRoom(roomId, PLANNER);
  db.close();
  return { root, project, dbPath, roomId };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function request(base: string, path: string, options?: RequestInit): Promise<{ status: number; body: any }> {
  const response = await fetch(base + path, options?.body === undefined ? options : { ...options, headers: { 'content-type': 'application/json' } });
  return { status: response.status, body: await response.json() };
}

function openService(fixture: Fixture): { db: DatabaseSync; service: RoomService } {
  const db = new DatabaseSync(fixture.dbPath);
  return { db, service: new RoomService(db) };
}

test('HTTP API keeps project routing explicit, persists registry, and rejects actor override', async () => {
  const a = makeFixture('alpha');
  const b = makeFixture('beta');
  const registryPath = join(a.root, 'ui-projects.json');
  const registry = new ProjectRegistry(registryPath);
  registry.add({ project_id: 'alpha', name: 'Alpha', project_path: a.project, database_path: a.dbPath, room_id: a.roomId, control_participant_id: 'codex-app', port: 41001 });
  registry.add({ project_id: 'beta', name: 'Beta', project_path: b.project, database_path: b.dbPath, room_id: b.roomId, control_participant_id: 'codex-app', port: 41002 });
  const server = createRoomUiHttpServer(new RoomUiApplication(registry), join(a.root, 'missing-dist'));
  const base = await listen(server);
  try {
    const alpha = await request(base, '/api/projects/alpha/state');
    const beta = await request(base, '/api/projects/beta/state');
    assert.equal(alpha.status, 200);
    assert.equal(alpha.body.room.room_id, a.roomId);
    assert.equal(beta.body.room.room_id, b.roomId);

    const before = alpha.body.cursor;
    const override = await request(base, '/api/projects/alpha/actions/begin-architecture-review', {
      method: 'POST',
      body: JSON.stringify({ actor: { participant_id: 'local-runner', actor_role: 'planner' } }),
    });
    assert.equal(override.status, 400);
    assert.equal(override.body.error.code, 'validation_failed');
    const unchanged = await request(base, '/api/projects/alpha/state');
    assert.equal(unchanged.body.cursor, before);
    assert.equal(unchanged.body.room.state, 'DISCUSSION');
  } finally {
    await close(server);
  }

  const restarted = createRoomUiHttpServer(new RoomUiApplication(new ProjectRegistry(registryPath)), join(a.root, 'missing-dist'));
  const restartedBase = await listen(restarted);
  try {
    const projects = await request(restartedBase, '/api/projects');
    assert.deepEqual(projects.body.projects.map((project: { project_id: string }) => project.project_id), ['alpha', 'beta']);
  } finally {
    await close(restarted);
    rmSync(a.root, { recursive: true, force: true });
    rmSync(b.root, { recursive: true, force: true });
  }
});

test('missing database stays absent until the explicit create-room confirmation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'room-ui-create-'));
  const project = join(root, 'project');
  mkdirSync(project);
  const dbPath = join(root, 'state', 'fresh.sqlite');
  const registry = new ProjectRegistry(join(root, 'registry.json'));
  registry.add({ project_id: 'fresh', name: 'Fresh', project_path: project, database_path: dbPath, room_id: 'room-fresh', control_participant_id: 'codex-app', port: null });
  const server = createRoomUiHttpServer(new RoomUiApplication(registry), join(root, 'missing-dist'));
  const base = await listen(server);
  try {
    const missing = await request(base, '/api/projects/fresh/state');
    assert.equal(missing.status, 404);
    assert.equal(existsSync(dbPath), false);
    const unconfirmed = await request(base, '/api/projects/fresh/create-room', { method: 'POST', body: '{}' });
    assert.equal(unconfirmed.status, 400);
    assert.equal(existsSync(dbPath), false);
    const created = await request(base, '/api/projects/fresh/create-room', { method: 'POST', body: JSON.stringify({ confirm_create: true }) });
    assert.equal(created.status, 201);
    assert.equal(created.body.room.room_id, 'room-fresh');
    assert.equal(existsSync(dbPath), true);
  } finally {
    await close(server);
    rmSync(root, { recursive: true, force: true });
  }
});

test('HTTP actions persist Question answer and Review acceptance through restart', async () => {
  const fixture = makeFixture('lifecycle');
  const registry = new ProjectRegistry(join(fixture.root, 'ui-projects.json'));
  registry.add({ project_id: 'project', name: 'Lifecycle', project_path: fixture.project, database_path: fixture.dbPath, room_id: fixture.roomId, control_participant_id: 'codex-app', port: 42001 });
  {
    const { db, service } = openService(fixture);
    service.transitionToArchitectureReview(fixture.roomId, PLANNER);
    service.transitionToWaitingForUserConfirmation(fixture.roomId, PLANNER);
    service.submitTask(makeTask({ task_id: 'task-life', room_id: fixture.roomId, run_id: 'run-life' }), PLANNER);
    service.claimRunAttempt({ attempt_id: 'attempt-question', run_id: 'run-life', room_id: fixture.roomId, worktree_path: fixture.project }, EXECUTOR);
    service.askQuestion(makeQuestion({ question_id: 'question-life', room_id: fixture.roomId, task_id: 'task-life', run_id: 'run-life', attempt_id: 'attempt-question' }), WORKER);
    service.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-question', status: 'needs_decision', result: makeCodingResult({ task_id: 'task-life', status: 'needs_decision' }), failure: null }), EXECUTOR);
    db.close();
  }
  const server = createRoomUiHttpServer(new RoomUiApplication(registry), join(fixture.root, 'missing-dist'));
  const base = await listen(server);
  try {
    const answered = await request(base, '/api/projects/project/actions/answer-question', { method: 'POST', body: JSON.stringify({ question_id: 'question-life', answer: '保持 Contract', answer_changes_contract: false }) });
    assert.equal(answered.status, 200);
    assert.equal(answered.body.question.status, 'answered');
    assert.equal(answered.body.run.status, 'ready');

    const { db, service } = openService(fixture);
    service.claimRunAttempt({ attempt_id: 'attempt-review', run_id: 'run-life', room_id: fixture.roomId, worktree_path: fixture.project }, EXECUTOR);
    service.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-review', result: makeCodingResult({ task_id: 'task-life' }) }), EXECUTOR);
    db.close();
    const review = await request(base, '/api/projects/project/actions/submit-review', { method: 'POST', body: JSON.stringify({ review_id: 'review-life', task_id: 'task-life', run_id: 'run-life', attempt_id: 'attempt-review', decision: 'approved', findings: [], open_questions: [], verification_summary: 'verified' }) });
    assert.equal(review.status, 200);
    assert.equal(review.body.run.status, 'review_discussion');
    const accepted = await request(base, '/api/projects/project/actions/accept-review', { method: 'POST', body: JSON.stringify({ review_id: 'review-life', confirmed_by_user: true }) });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.run.status, 'accepted');
  } finally {
    await close(server);
  }

  const restarted = createRoomUiHttpServer(new RoomUiApplication(new ProjectRegistry(registry.path)), join(fixture.root, 'missing-dist'));
  const restartedBase = await listen(restarted);
  try {
    const state = await request(restartedBase, '/api/projects/project/state');
    assert.equal(state.body.questions.find((question: { question_id: string }) => question.question_id === 'question-life').status, 'answered');
    assert.equal(state.body.runs.find((run: { run_id: string }) => run.run_id === 'run-life').status, 'accepted');
  } finally {
    await close(restarted);
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Run launch returns immediately, uses the configured MCP binding, and rejects duplicate UI launches', async () => {
  const fixture = makeFixture('launch');
  const registry = new ProjectRegistry(join(fixture.root, 'registry.json'));
  registry.add({ project_id: 'launch', name: 'Launch', project_path: fixture.project, database_path: fixture.dbPath, room_id: fixture.roomId, control_participant_id: 'codex-app', port: 44001 });
  {
    const { db, service } = openService(fixture);
    service.transitionToArchitectureReview(fixture.roomId, PLANNER);
    service.transitionToWaitingForUserConfirmation(fixture.roomId, PLANNER);
    service.submitTask(makeTask({ task_id: 'task-launch', room_id: fixture.roomId, run_id: 'run-launch' }), PLANNER);
    db.close();
  }
  const observed: { launched?: Record<string, unknown> } = {};
  let finish!: (value: any) => void;
  const pending = new Promise<any>((resolve) => { finish = resolve; });
  const application = new RoomUiApplication(registry, { runOneShot: async (config) => { observed.launched = config as unknown as Record<string, unknown>; return pending; } });
  const server = createRoomUiHttpServer(application, join(fixture.root, 'missing-dist'));
  const base = await listen(server);
  try {
    const first = await request(base, '/api/projects/launch/runs/start', { method: 'POST', body: JSON.stringify({ run_id: 'run-launch', attempt_id: 'attempt-ui' }) });
    assert.equal(first.status, 202);
    assert.equal(first.body.launch.status, 'running');
    assert.equal(observed.launched?.mcpUrl, 'http://127.0.0.1:44001/mcp/participants/p~claude-code-cli');
    assert.equal(observed.launched?.project, fixture.project);
    const duplicate = await request(base, '/api/projects/launch/runs/start', { method: 'POST', body: JSON.stringify({ run_id: 'run-launch', attempt_id: 'attempt-ui-2' }) });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'run_already_active');
    finish({});
  } finally {
    await close(server);
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Git preview uses GitController and VS Code opens the selected run worktree as one target', async () => {
  const fixture = makeFixture('git');
  const registry = new ProjectRegistry(join(fixture.root, 'ui-projects.json'));
  registry.add({ project_id: 'project', name: 'Git', project_path: fixture.project, database_path: fixture.dbPath, room_id: fixture.roomId, control_participant_id: 'codex-app', port: 43001 });
  let assignmentId = '';
  {
    const { db, service } = openService(fixture);
    assignmentId = String(service.listRoleAssignments(fixture.roomId).find((assignment) => assignment.role === 'worker')?.assignment_id);
    service.transitionToArchitectureReview(fixture.roomId, PLANNER);
    service.transitionToWaitingForUserConfirmation(fixture.roomId, PLANNER);
    service.createPlan({ plan_id: 'plan-git', room_id: fixture.roomId, created_by_participant_id: 'codex-app', created_at: '2026-09-27T00:00:00.000Z' }, PLANNER);
    service.createPlanRevision({
      revision_id: 'revision-git', plan_id: 'plan-git', room_id: fixture.roomId, revision_no: 1, supersedes_revision_id: null,
      concurrency_limit: 1, acceptance_policy: 'per_task', created_by_participant_id: 'codex-app', created_at: '2026-09-27T00:00:01.000Z',
      nodes: [{
        node_id: 'node-git', kind: 'task', dependencies: [], write_scopes: [{ path: 'src', kind: 'tree' }], worker_assignment_id: assignmentId, priority: 1,
        task_spec: { task_id: 'task-git', room_id: fixture.roomId, run_id: 'run-git', type: 'implementation', parent_task_id: null, based_on_review_id: null, background: '', goal: 'git preview', requirements: [], non_goals: [], architecture_decisions: [], scope: ['src/**'], constraints: [], acceptance_criteria: [], verification: [], documentation_updates: [], question_policy: 'ask', created_by: 'codex', created_at: '2026-09-27T00:00:01.000Z' },
      }],
    }, PLANNER);
    service.decidePlanRevision({ approval_id: 'approval-git', room_id: fixture.roomId, target_type: 'task_graph_revision', target_id: 'revision-git', decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: '2026-09-27T00:00:02.000Z' }, PLANNER);
    await new PlanScheduler(service).reconcile({ room_id: fixture.roomId, plan_id: 'plan-git', worktrees: [{ node_id: 'node-git', dispatch_id: 'dispatch-git', worktree_path: null }] }, ORCHESTRATOR);
    service.transitionToArchitectureReview(fixture.roomId, PLANNER);
    service.transitionToWaitingForUserConfirmation(fixture.roomId, PLANNER);
    service.submitTask(makeTask({ task_id: 'task-open', room_id: fixture.roomId, run_id: 'run-open' }), PLANNER);
    service.claimRunAttempt({ attempt_id: 'attempt-open', run_id: 'run-open', room_id: fixture.roomId, worktree_path: fixture.project }, EXECUTOR);
    db.close();
  }
  const opened: string[] = [];
  const app = new RoomUiApplication(registry, { openVscode: async (target) => { opened.push(target); } });
  const server = createRoomUiHttpServer(app, join(fixture.root, 'missing-dist'));
  const base = await listen(server);
  try {
    const preview = await request(base, '/api/projects/project/actions/git-preview', { method: 'POST', body: JSON.stringify({
      git_action_id: 'git-action-preview', room_id: fixture.roomId, revision_id: 'revision-git', node_id: 'node-git', operation: 'create_worktree',
      repository_root: fixture.project, source_ref: 'main', new_branch: 'task/ui-preview', worktree_path: join(fixture.root, 'future worktree'),
    }) });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.action.status, 'previewed');
    const state = await request(base, '/api/projects/project/state');
    assert.equal(state.body.git_actions.some((action: { git_action_id: string }) => action.git_action_id === 'git-action-preview'), true);

    const open = await request(base, '/api/projects/project/open-vscode', { method: 'POST', body: JSON.stringify({ run_id: 'run-git' }) });
    assert.equal(open.status, 409, 'run has no worktree until create_worktree succeeds');
    const openRun = await request(base, '/api/projects/project/open-vscode', { method: 'POST', body: JSON.stringify({ run_id: 'run-open' }) });
    assert.equal(openRun.status, 202);
    assert.deepEqual(opened, [fixture.project]);
  } finally {
    await close(server);
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
