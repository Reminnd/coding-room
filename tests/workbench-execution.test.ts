import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { ProjectRegistry } from '../src/ui/project-registry.ts';
import { RoomUiApplication } from '../src/ui/application.ts';
import { createRoomUiHttpServer } from '../src/ui/http-server.ts';
import { RoomService } from '../src/room/room-service.ts';
import { WorkbenchReview } from '../src/ui/workbench-review.ts';
import { WorkbenchStore } from '../src/ui/workbench-store.ts';
import { makeCodingResult } from './fixtures.ts';
import { runRoomRun, type RunCliResult } from '../src/cli/run.ts';
import { FakeClaudeProcess, makeSpawner } from './runner-fixtures/claude-process-fake.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('execution HTTP confirmation creates an approved graph and isolated worktree without changing original edits', async () => {
  const root = mkdtempSync(join(tmpdir(), 'room-execution-ui-'));
  const folder = join(root, 'Project');
  mkdirSync(folder);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: folder, encoding: 'utf8', stdio: 'pipe' });
  git('init', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  writeFileSync(join(folder, 'example.txt'), 'committed'); git('add', '.'); git('commit', '-m', 'test: seed project');
  writeFileSync(join(folder, 'example.txt'), 'user uncommitted work');
  const registry = new ProjectRegistry(join(root, 'registry.json'));
  let launches = 0;
  let completed: Promise<RunCliResult> | null = null;
  const application = new RoomUiApplication(registry, {
    checkRunner: async () => {},
    runOneShot: async (config) => {
      launches += 1;
      const db = new DatabaseSync(config.db);
      try {
        const service = new RoomService(db);
        const run = service.getRun(config.runId)!;
        assert.notEqual(config.project, folder);
        assert.equal(readFileSync(join(config.project, 'example.txt'), 'utf8'), launches === 1 ? 'committed' : 'implemented behavior');
        assert.match(config.mcpUrl, /^http:\/\/127\.0\.0\.1:\d+\/mcp\/participants\/p~claude-code-cli$/);
        const child = new FakeClaudeProcess();
        const { spawner } = makeSpawner(child);
        completed = runRoomRun(config, (...args) => {
          const process = spawner(...args);
          setImmediate(() => {
            child.emit('spawn');
            void (async () => {
              const client = new Client({ name: 'desktop-execution-test', version: '1.0.0' });
              try {
                await client.connect(new StreamableHTTPClientTransport(new URL(config.mcpUrl)));
                const inspectionDb = new DatabaseSync(config.db);
                try {
                  const activeStore = new WorkbenchStore(inspectionDb, run.room_id);
                  const activeTask = activeStore.list().find((item) => item.run_id === run.run_id)!;
                  assert.throws(() => activeStore.manage(activeTask.id, { action: 'archive' }), /停止活动执行/);
                  assert.equal(activeStore.get(activeTask.id).archived, false);
                } finally { inspectionDb.close(); }
                const evidence = await client.callTool({ name: 'room_run_verification', arguments: { room_id: run.room_id, run_id: run.run_id, attempt_id: config.attemptId, command_index: 0, stage: 'green', behavior: 'The approved command runs in the execution directory' } });
                assert.notEqual(evidence.isError, true, JSON.stringify(evidence));
                child.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'session-desktop', tools: ['mcp__agent_room__room_ask_question', 'mcp__agent_room__room_run_verification'], mcp_servers: [{ name: 'agent_room' }] }) + '\n');
                writeFileSync(join(config.project, 'example.txt'), 'implemented behavior');
                child.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: 'session-desktop', structured_output: makeCodingResult({ task_id: run.root_task_id }) }) + '\n');
                child.emit('close', 0, null);
              } catch (error) { child.stderr.write(String(error)); child.emit('close', 1, null); }
              finally { await client.close(); }
            })();
          });
          return process;
        });
        return completed;
      } finally { db.close(); }
    },
  });
  const project = application.openProject({ project_path: folder, confirm_create: true }).project!;
  const db = new DatabaseSync(project.database_path);
  const store = new WorkbenchStore(db, project.room_id);
  const task = store.save({ title: 'Change behavior', goal: 'Change the requested behavior', mode: 'task', verification: 'standard', source_ids: [] });
  const details = { requirements: ['Expected behavior'], non_goals: [], architecture_decisions: [], scope: ['example.txt'], constraints: [], acceptance_criteria: ['Example has expected behavior'], verification: [{ command: 'node -e "console.log(\'verified-in-worktree\')"', detects: 'Behavior regression', decision_if_failed: 'Fix before review' }], documentation_updates: [], question_policy: 'Ask on scope changes' };
  store.saveProposal(task.id, { text: 'Approved candidate plan', details, expected_version: 0 });
  const server = createRoomUiHttpServer(application, root);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const prefix = `http://127.0.0.1:${address.port}/api/projects/${project.project_id}/workbench/tasks/${task.id}`;
  async function post(action: string, body = {}) {
    const response = await fetch(`${prefix}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() as any };
  }
  try {
    const preview = await post('check-execution');
    assert.equal(preview.status, 200);
    assert.equal(launches, 0);
    assert.equal(existsSync(preview.data.worktree_path), false);
    assert.ok(preview.data.original_changes.includes('example.txt'));
    const invalid = await post('execute', { preview_id: preview.data.preview_id });
    assert.equal(invalid.status, 400);
    assert.equal(launches, 0);
    store.saveProposal(task.id, { text: 'Revised plan', details, expected_version: 1 });
    const stale = await post('execute', { preview_id: preview.data.preview_id, confirmed_by_user: true });
    assert.equal(stale.status, 400);
    assert.equal(launches, 0);
    const fresh = await post('check-execution');
    mkdirSync(fresh.data.worktree_path, { recursive: true });
    writeFileSync(join(fresh.data.worktree_path, 'occupied.txt'), 'Existing directory must not be overwritten');
    const preparationFailed = await post('execute', { preview_id: fresh.data.preview_id, confirmed_by_user: true });
    assert.equal(preparationFailed.status, 409);
    assert.equal(launches, 0);
    assert.ok(store.get(task.id).run_id, 'Materialized task remains available for recovery');
    rmSync(fresh.data.worktree_path, { recursive: true });
    const recovery = await post('check-execution');
    assert.equal(recovery.status, 200, JSON.stringify(recovery.data));
    const started = await post('execute', { preview_id: recovery.data.preview_id, confirmed_by_user: true });
    assert.equal(started.status, 202, JSON.stringify(started.data));
    assert.equal(launches, 1);
    const outcome = await completed!;
    assert.equal(outcome.attempt.status, 'succeeded', JSON.stringify(outcome.attempt.failure));
    assert.equal(existsSync(join(fresh.data.worktree_path, '.agent-room', 'artifacts')), false, 'Desktop logs must not dirty the execution worktree');
    assert.ok(outcome.attempt.artifact_refs.every((path) => existsSync(path)), 'Desktop artifact references resolve without source cwd');
    const runtime = application.execution.read(project.project_id, task.id) as any;
    assert.equal(runtime.verification.length, 1);
    assert.equal(runtime.verification[0].exit_code, 0);
    assert.match(runtime.verification[0].stdout, /verified-in-worktree/);
    const rerun = await post('verify', { command_index: 0 });
    assert.equal(rerun.status, 200, JSON.stringify(rerun.data));
    assert.equal(rerun.data.exit_code, 0);
    assert.equal(rerun.data.stage, 'verification');
    assert.equal(readFileSync(join(folder, 'example.txt'), 'utf8'), 'user uncommitted work');
    assert.equal(git('branch', '--show-current').trim(), 'main');
    assert.ok(store.get(task.id).run_id);
    assert.equal(store.get(task.id).approved_version, 2);
    const duplicate = await post('execute', { preview_id: fresh.data.preview_id, confirmed_by_user: true });
    assert.equal(duplicate.status, 400);
    assert.equal(launches, 1);
    const reviewer = new WorkbenchReview(registry, async () => ({ decision: 'approved', findings: [], open_questions: [], verification_summary: 'Test fixture independent review' }));
    const job = reviewer.start(project.project_id, task.id);
    while (job.status === 'running') await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(job.status, 'completed', job.error ?? 'Review failed');
    await reviewer.accept(project.project_id, task.id, { confirmed_by_user: true });
    const commitPreview = await post('delivery', { operation: 'commit_paths', commit_message: 'feat(example): implement behavior' });
    assert.equal(commitPreview.status, 200, JSON.stringify(commitPreview.data));
    assert.deepEqual(commitPreview.data.action.preview.paths, ['example.txt']);
    writeFileSync(join(fresh.data.worktree_path, 'example.txt'), 'post acceptance edit');
    const changed = await post('delivery-execute', { git_action_id: commitPreview.data.action.git_action_id, confirmed_by_user: true });
    assert.equal(changed.status, 400);
    writeFileSync(join(fresh.data.worktree_path, 'example.txt'), 'implemented behavior');
    const commit = await post('delivery-execute', { git_action_id: commitPreview.data.action.git_action_id, confirmed_by_user: true });
    assert.equal(commit.status, 200, JSON.stringify(commit.data));
    assert.equal(commit.data.status, 'succeeded');
    assert.equal(readFileSync(join(folder, 'example.txt'), 'utf8'), 'user uncommitted work');
    const dirtyTarget = await post('delivery', { operation: 'integrate_fast_forward', target_worktree_path: folder });
    assert.equal(dirtyTarget.status, 409);
    writeFileSync(join(folder, 'example.txt'), 'committed');
    writeFileSync(join(folder, '.git', 'info', 'exclude'), '.agent-room/\n');
    const integration = await post('delivery', { operation: 'integrate_fast_forward', target_worktree_path: folder });
    assert.equal(integration.status, 200, JSON.stringify(integration.data));
    const integrated = await post('delivery-execute', { git_action_id: integration.data.action.git_action_id, confirmed_by_user: true });
    assert.equal(integrated.status, 200, JSON.stringify(integrated.data));
    assert.equal(integrated.data.status, 'succeeded');
    assert.equal(readFileSync(join(folder, 'example.txt'), 'utf8'), 'implemented behavior');
    assert.equal(git('rev-parse', 'HEAD').trim(), commit.data.result.resulting_commit_id);
    const cancelAccepted = await post('manage', { action: 'cancel', confirmed_by_user: true });
    assert.equal(cancelAccepted.status, 409);
    assert.match(cancelAccepted.data.error.message, /已接受任务只能归档/);
    const archived = await post('manage', { action: 'archive' });
    assert.equal(archived.status, 200, JSON.stringify(archived.data));
    assert.equal(archived.data.task.archived, true);
    assert.equal((await post('verify', { command_index: 0 })).status, 409);
    assert.equal((await post('delivery', { operation: 'commit_paths', commit_message: 'feat(example): change after archive' })).status, 409);
    assert.equal((application.execution.read(project.project_id, task.id) as any).run.status, 'accepted');
    assert.equal(readFileSync(join(fresh.data.worktree_path, 'example.txt'), 'utf8'), 'implemented behavior');
    // An existing desktop database may still carry the former one-plan-per-Room index.
    db.exec('DROP INDEX idx_plans_room; CREATE UNIQUE INDEX idx_plans_room ON plans(room_id)');
    const second = store.save({ title: 'Second task', goal: 'Implement the next task independently', mode: 'task', verification: 'standard', source_ids: [] });
    store.saveProposal(second.id, { text: 'Second approved plan', details, expected_version: 0 });
    const secondPreview = await application.execution.preview(project.project_id, second.id);
    await application.execution.start(project.project_id, second.id, { preview_id: secondPreview.preview_id, confirmed_by_user: true });
    assert.equal((await completed!).attempt.status, 'succeeded');
    assert.equal(launches, 2);
    const service = new RoomService(db);
    assert.equal(service.listPlans(project.room_id).length, 2);
    assert.equal(service.getRun(store.get(task.id).run_id!)?.status, 'accepted');
    assert.notEqual(store.get(task.id).plan_id, store.get(second.id).plan_id);
    assert.notEqual(secondPreview.worktree_path, fresh.data.worktree_path);
    reviewer.close();
  } finally {
    await application.close(); db.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
