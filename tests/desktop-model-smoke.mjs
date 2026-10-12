// Opt-in integration smoke: uses the installed Codex and a temporary project.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ProjectRegistry } from '../src/ui/project-registry.ts';
import { RoomUiApplication } from '../src/ui/application.ts';
import { WorkbenchStore } from '../src/ui/workbench-store.ts';
import { WorkbenchPlanning } from '../src/ui/workbench-planning.ts';
import { assertSddReady } from '../src/ui/proposal.ts';

const root = mkdtempSync(join(tmpdir(), 'room-model-smoke-'));
const folder = join(root, 'project');
mkdirSync(folder);
writeFileSync(join(folder, '.gitignore'), '.agent-room/\n');
writeFileSync(join(folder, 'package.json'), JSON.stringify({ type: 'module', scripts: { test: 'node --test sum.test.js' } }));
writeFileSync(join(folder, 'sum.js'), 'export function sum(a, b) { return 0; }\n');
writeFileSync(join(folder, 'requirements.txt'), 'Export sum(a,b) from sum.js. Add two finite numbers. No coercion or validation is required. Test positive numbers, zero and negative numbers with node:test in sum.test.js. No dependencies. TDD is required.');
const git = (...args) => execFileSync('git', args, { cwd: folder, encoding: 'utf8', stdio: 'pipe' });
git('init', '-b', 'main'); git('config', 'user.name', 'Room Smoke'); git('config', 'user.email', 'smoke@example.invalid');
git('add', '.'); git('commit', '-m', 'test: seed temporary model smoke');
const registry = new ProjectRegistry(join(root, 'registry.json'));
const app = new RoomUiApplication(registry);
const project = app.openProject({ project_path: folder, confirm_create: true }).project;
const db = new DatabaseSync(project.database_path);
const store = new WorkbenchStore(db, project.room_id);
const source = store.saveSource({ label: 'Project requirements', kind: 'document', ownership: 'project', location: join(folder, 'requirements.txt') });
const report = { root, project_id: project.project_id, modes: [] };
console.log(`Temporary integration evidence: ${root}`);
try {
  for (const mode of ['task', 'sdd']) {
    const task = store.save({ title: `${mode} sum implementation`, goal: 'Implement the sum module and its tests exactly as requirements.txt specifies.', mode, verification: 'tdd', source_ids: [source.id] });
    const state = app.planning.start(project.project_id, task.id, { text: 'Read requirements.txt and the existing sum.js stub. Produce the complete proposed plan now. Requirements and all tradeoffs are settled: ESM JavaScript, sum.js and sum.test.js only, node --test sum.test.js, no new dependencies, no document changes, and three test scenarios (positive, zero, negative). First add assertions against the existing sum function and run them: Red must be an actual assertion mismatch because the stub always returns zero. Missing modules, import errors and unavailable tools are not valid Red. Then implement and rerun the same tests. Do not execute or modify files during planning. Include the exact structured room_task metadata required by this application in the native proposed plan.' });
    const deadline = Date.now() + 360000;
    let lastStatus = '';
    while (['starting', 'running', 'waiting'].includes(state.status)) {
      if (state.status !== lastStatus) { console.log(`${mode}: ${state.status}`); lastStatus = state.status; }
      if (state.status === 'waiting') throw new Error(`Unexpected clarification: ${JSON.stringify(state.question?.questions)}`);
      if (Date.now() >= deadline) { await app.planning.interrupt(project.project_id, task.id); throw new Error(`${mode}: planning timed out`); }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.equal(state.status, 'completed', state.error ?? state.status);
    assert.equal(state.error, null);
    const saved = store.get(task.id);
    assert.ok(saved.proposal && saved.proposal_details, 'Native plan must persist an executable proposal');
    assert.ok(saved.proposal_details.verification.some((step) => step.command.includes('sum.test.js')));
    if (mode === 'sdd') assertSddReady(saved.proposal_details.sdd);
    const reader = new WorkbenchPlanning(registry);
    try {
      const history = await reader.read(project.project_id, task.id);
      assert.ok(history.thread?.turns?.length, 'A fresh client must read the persisted conversation');
    } finally { reader.close(); }
    assert.equal(git('status', '--porcelain').trim(), '', 'Plan must leave project source unchanged');
    report.modes.push({ mode, task_id: task.id, thread_id: saved.thread_id, version: saved.proposal_version, proposal: saved.proposal, details: saved.proposal_details });
    writeFileSync(join(root, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`PASS: ${mode} native Plan, structured proposal, persisted history and read-only source`);
  }
} finally { await app.close(); db.close(); }
