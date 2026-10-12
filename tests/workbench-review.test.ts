import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout } from 'node:timers/promises';
import test from 'node:test';
import { RoomService } from '../src/room/room-service.ts';
import { ProjectRegistry } from '../src/ui/project-registry.ts';
import { WorkbenchStore } from '../src/ui/workbench-store.ts';
import { WorkbenchExecution } from '../src/ui/workbench-execution.ts';
import { WorkbenchReview } from '../src/ui/workbench-review.ts';
import { VerificationRunner } from '../src/runner/verification.ts';
import { EXECUTOR, PLANNER, makeTask, makeAttemptSettle } from './fixtures.ts';

test('review acceptance rejects changed candidates and permits an independent review of the new candidate', { timeout: 15000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'room-review-ui-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  writeFileSync(join(root, '.gitignore'), '*.sqlite*\nregistry.json\n');
  writeFileSync(join(root, 'example.txt'), 'original'); git('add', '.'); git('commit', '-m', 'test: seed review');
  const dbPath = join(root, 'room.sqlite');
  const db = new DatabaseSync(dbPath);
  const registry = new ProjectRegistry(join(root, 'registry.json'));
  registry.add({ project_id: 'project', name: 'Project', project_path: root, database_path: dbPath, room_id: 'room-1', control_participant_id: 'codex-app', port: null });
  const service = new RoomService(db);
  service.createRoom('room-1', PLANNER); service.transitionToArchitectureReview('room-1', PLANNER); service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  const command = 'node -e "process.exit(require(\'node:fs\').existsSync(\'example.txt\') ? 0 : 1)"';
  service.submitTask(makeTask({ verification: [
    { command, detects: 'Missing implementation (Red)', decision_if_failed: 'Implement' },
    { command, detects: 'Present implementation (Green)', decision_if_failed: 'Fix' },
  ] }), PLANNER);
  service.claimRunAttempt({ room_id: 'room-1', run_id: 'run-1', attempt_id: 'attempt-1', worktree_path: root }, EXECUTOR);
  const verifier = new VerificationRunner(db, service);
  const verificationInput = { room_id: 'room-1', run_id: 'run-1', attempt_id: 'attempt-1', behavior: 'Implementation exists' };
  rmSync(join(root, 'example.txt'));
  const red = await verifier.run('claude-code-cli', { ...verificationInput, command_index: 0, stage: 'red' });
  assert.equal(red.exit_code, 1);
  writeFileSync(join(root, 'example.txt'), 'original');
  const green = await verifier.run('claude-code-cli', { ...verificationInput, command_index: 1, stage: 'green' });
  assert.equal(green.exit_code, 0);
  service.settleRunAttempt(makeAttemptSettle(), EXECUTOR);
  const store = new WorkbenchStore(db, 'room-1');
  const task = store.save({ title: 'Review', goal: 'Review the candidate', mode: 'task', verification: 'tdd', source_ids: [] });
  store.update(task.id, { task_id: 'task-1', run_id: 'run-1' });
  const review = new WorkbenchReview(registry, async (prompt) => {
    assert.match(prompt, /Candidate diff/);
    return { decision: 'approved', findings: [], open_questions: [], verification_summary: 'Reviewed the candidate against the supplied task' };
  });
  async function reviewCandidate() {
    const job = review.start('project', task.id);
    while (job.status === 'running') await setTimeout(5);
    assert.equal(job.status, 'completed', job.error ?? 'Review failed');
  }
  try {
    writeFileSync(join(root, 'example.txt'), 'first candidate');
    await reviewCandidate();
    writeFileSync(join(root, 'example.txt'), 'new candidate');
    await assert.rejects(review.accept('project', task.id, { confirmed_by_user: true }), /已改变/);
    assert.equal(service.getRun('run-1')?.status, 'review_discussion');
    await reviewCandidate();
    await review.accept('project', task.id, { confirmed_by_user: true });
    assert.equal(service.getRun('run-1')?.status, 'accepted');
    assert.equal(service.listReviews('room-1').length, 2);
  } finally { review.close(); db.close(); rmSync(root, { recursive: true, force: true }); }
});


test('confirmed repair proposal attaches a Fix Task to the reviewed Run and rejects a stale review basis', async () => {
  const root = mkdtempSync(join(tmpdir(), 'room-fix-ui-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  writeFileSync(join(root, '.gitignore'), '*.sqlite*\nregistry.json\n');
  git('add', '.'); git('commit', '-m', 'test: seed fix');
  const dbPath = join(root, 'room.sqlite');
  const db = new DatabaseSync(dbPath);
  const registry = new ProjectRegistry(join(root, 'registry.json'));
  registry.add({ project_id: 'project', name: 'Project', project_path: root, database_path: dbPath, room_id: 'room-1', control_participant_id: 'codex-app', port: null });
  const service = new RoomService(db);
  service.createRoom('room-1', PLANNER); service.transitionToArchitectureReview('room-1', PLANNER); service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask({ verification: [] }), PLANNER);
  service.claimRunAttempt({ room_id: 'room-1', run_id: 'run-1', attempt_id: 'attempt-1', worktree_path: root }, EXECUTOR);
  service.settleRunAttempt(makeAttemptSettle(), EXECUTOR);
  const review = { review_id: 'review-fix', room_id: 'room-1', run_id: 'run-1', task_id: 'task-1', attempt_id: 'attempt-1', reviewer_participant_id: 'codex-app', decision: 'changes_requested' as const,
    findings: [{ finding_id: 'finding-1', severity: 'high' as const, title: 'Wrong result', file: 'example.txt', line: 1, trigger: 'Request example', evidence: 'Wrong output', impact: 'Acceptance fails', requirement_relation: 'Expected result', minimal_direction: 'Correct output' }],
    open_questions: [], verification_summary: 'Actual mismatch', created_at: new Date().toISOString() };
  service.submitReview(review, { participant_id: 'codex-app', actor_role: 'reviewer' });
  const store = new WorkbenchStore(db, 'room-1');
  const task = store.save({ title: 'Repair', goal: 'Expected result', mode: 'task', verification: 'standard', source_ids: [] });
  store.update(task.id, { run_id: 'run-1', task_id: 'task-1' });
  let launches = 0;
  const execution = new WorkbenchExecution(registry, { assertPlanningIdle: () => {}, checkRunner: async () => {}, launch: async (_project, runId) => { launches++; assert.equal(runId, 'run-1'); } });
  const details = { requirements: ['Correct result'], non_goals: [], architecture_decisions: [], scope: ['example.txt'], constraints: [], acceptance_criteria: ['Correct output'], verification: [], documentation_updates: [], question_policy: 'Ask on scope changes', proposed_fixes: [{ finding_id: 'finding-1', solution: 'Correct the output and add regression coverage' }] };
  try {
    store.saveProposal(task.id, { text: 'Repair the confirmed mismatch', details, expected_version: 0 });
    const preview = await execution.preview('project', task.id);
    assert.equal(preview.worktree_path, root);
    assert.equal(launches, 0);
    service.submitReview({ ...review, review_id: 'review-new' }, { participant_id: 'codex-app', actor_role: 'reviewer' });
    await assert.rejects(execution.start('project', task.id, { preview_id: preview.preview_id, confirmed_by_user: true }), /Review/);
    store.saveProposal(task.id, { text: 'Repair latest reviewed mismatch', details, expected_version: 1 });
    const fresh = await execution.preview('project', task.id);
    await execution.start('project', task.id, { preview_id: fresh.preview_id, confirmed_by_user: true });
    const fix = service.latestTaskForRun('run-1')!;
    assert.equal(fix.type, 'fix'); assert.equal(fix.parent_task_id, 'task-1'); assert.equal(fix.based_on_review_id, 'review-new');
    assert.deepEqual(fix.confirmed_findings, details.proposed_fixes);
    assert.ok(fix.scope.includes('review_fixes_only'));
    assert.equal(service.getRun('run-1')?.worktree_path, root);
    assert.equal(launches, 1);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});
