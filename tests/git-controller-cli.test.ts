import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import type { TaskGraphRevision, TaskSpec } from '../src/protocol/schema.ts';
import { RoomService } from '../src/room/room-service.ts';
import { ORCHESTRATOR, PLANNER, makeTask } from './fixtures.ts';

const T = '2026-09-02T00:00:00.000Z';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function taskSpec(): TaskSpec {
  const { confirmed_by_user: _confirmed, confirmed_findings: _findings, ...value } = makeTask({ task_id: 'task-a', run_id: 'run-a', created_at: T });
  return { ...value, type: 'implementation', parent_task_id: null, based_on_review_id: null };
}

test('room:git CLI previews and executes one exact approved action', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-room-git-cli-'));
  const repository = join(root, 'repo');
  const worktree = join(root, 'worktree');
  const dbPath = join(root, 'room.sqlite');
  try {
    execFileSync('git', ['init', '-b', 'main', repository]);
    git(repository, 'config', 'user.email', 'test@example.com');
    git(repository, 'config', 'user.name', 'Test');
    writeFileSync(join(repository, 'README.md'), 'base\n');
    git(repository, 'add', '--', 'README.md');
    git(repository, 'commit', '-m', 'chore: initial');
    const db = new DatabaseSync(dbPath);
    const service = new RoomService(db);
    service.createRoom('room-1', PLANNER);
    service.createPlan({ plan_id: 'plan-1', room_id: 'room-1', created_by_participant_id: 'codex-app', created_at: T }, PLANNER);
    const worker = service.listRoleAssignments('room-1').find((assignment) => assignment.role === 'worker');
    assert.ok(worker);
    const revision: TaskGraphRevision = { revision_id: 'revision-1', plan_id: 'plan-1', room_id: 'room-1', revision_no: 1, supersedes_revision_id: null, concurrency_limit: 1, acceptance_policy: 'per_task', nodes: [{ node_id: 'node-a', kind: 'task', task_spec: taskSpec(), dependencies: [], write_scopes: [{ path: '.', kind: 'tree' }], worker_assignment_id: worker.assignment_id, priority: 1 }], created_by_participant_id: 'codex-app', created_at: T };
    service.createPlanRevision(revision, PLANNER);
    service.transitionToArchitectureReview('room-1', PLANNER);
    service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
    service.decidePlanRevision({ approval_id: 'revision-approval', room_id: 'room-1', target_type: 'task_graph_revision', target_id: 'revision-1', decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
    service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [{ node_id: 'node-a', dispatch_id: 'dispatch-a', canonical_worktree_path: null }] }, ORCHESTRATOR);
    db.close();

    const crossArm = spawnSync(process.execPath, ['src/cli/git.ts', 'preview', '--db', dbPath, '--git-action-id', 'git-cross-arm', '--room-id', 'room-1', '--revision-id', 'revision-1', '--node-id', 'node-a', '--operation', 'create_worktree', '--repository-root', resolve(repository), '--source-ref', 'main', '--new-branch', 'codex/cross-arm', '--worktree-path', resolve(join(root, 'cross-arm')), '--commit-message', 'feat: ignored'], { cwd: process.cwd(), encoding: 'utf8' });
    assert.notEqual(crossArm.status, 0);
    assert.match(crossArm.stderr, /unexpected option.*--commit-message/);

    const preview = spawnSync(process.execPath, ['src/cli/git.ts', 'preview', '--db', dbPath, '--git-action-id', 'git-a', '--room-id', 'room-1', '--revision-id', 'revision-1', '--node-id', 'node-a', '--operation', 'create_worktree', '--repository-root', resolve(repository), '--source-ref', 'main', '--new-branch', 'codex/cli', '--worktree-path', resolve(worktree)], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(preview.status, 0, preview.stderr);
    assert.equal((JSON.parse(preview.stdout) as { action: { status: string } }).action.status, 'previewed');

    const decisionDb = new DatabaseSync(dbPath);
    const decisionService = new RoomService(decisionDb);
    decisionService.decideGitAction({ approval_id: 'git-approval', room_id: 'room-1', target_type: 'git_action_preview', target_id: 'git-a', decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
    decisionDb.close();

    const execute = spawnSync(process.execPath, ['src/cli/git.ts', 'execute', '--db', dbPath, '--git-action-id', 'git-a'], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(execute.status, 0, execute.stderr);
    assert.equal((JSON.parse(execute.stdout) as { status: string }).status, 'succeeded');
    assert.equal(git(worktree, 'branch', '--show-current'), 'codex/cli');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
