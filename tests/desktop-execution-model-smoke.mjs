// Opt-in continuation of desktop-model-smoke.mjs. Uses its temporary registry only.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { RoomUiApplication } from '../src/ui/application.ts';
import { ProjectRegistry } from '../src/ui/project-registry.ts';

const root = resolve(process.argv[2] ?? '');
assert.ok(root.startsWith(join(tmpdir(), 'room-model-smoke-')), 'Supply the temporary model smoke directory');
const report = JSON.parse(readFileSync(join(root, 'report.json'), 'utf8'));
const app = new RoomUiApplication(new ProjectRegistry(join(root, 'registry.json')));
async function until(done, label) {
  const deadline = Date.now() + 360000;
  let nextNotice = 0;
  while (!done()) {
    if (Date.now() > deadline) throw new Error(`${label} timed out`);
    if (Date.now() > nextNotice) { console.log(`${label}: running`); nextNotice = Date.now() + 15000; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
const results = [];
try {
  for (const entry of report.modes.filter((item) => !process.argv[3] || item.mode === process.argv[3])) {
    const preview = await app.execution.preview(report.project_id, entry.task_id);
    const launch = await app.execution.start(report.project_id, entry.task_id, { preview_id: preview.preview_id, confirmed_by_user: true });
    await until(() => !['starting', 'running'].includes(launch.status), `${entry.mode} Claude execution`);
    const runtime = app.execution.read(report.project_id, entry.task_id);
    results.push({ mode: entry.mode, launch, runtime });
    writeFileSync(join(root, 'execution-report.json'), JSON.stringify(results, null, 2));
    assert.equal(launch.status, 'completed', launch.error ?? 'Execution failed');
    assert.equal(runtime.attempts.at(-1)?.status, 'succeeded', JSON.stringify(runtime.attempts.at(-1)?.failure));
    assert.ok(runtime.verification.some((item) => item.stage === 'red' && item.exit_code !== null && item.exit_code !== 0 && /ERR_ASSERTION|AssertionError/.test(item.stdout + item.stderr)), 'Red must contain an actual behavioral assertion failure');
    assert.ok(runtime.verification.some((item) => item.stage === 'green' && item.exit_code === 0), 'Actual Green evidence is required');
    const review = app.review.start(report.project_id, entry.task_id);
    await until(() => review.status !== 'running', `${entry.mode} independent Codex Review`);
    results.at(-1).review = review;
    results.at(-1).runtime = app.execution.read(report.project_id, entry.task_id);
    writeFileSync(join(root, 'execution-report.json'), JSON.stringify(results, null, 2));
    assert.equal(review.status, 'completed', review.error ?? 'Review failed');
    await app.review.accept(report.project_id, entry.task_id, { confirmed_by_user: true });
    results.at(-1).accepted = true;
    writeFileSync(join(root, 'execution-report.json'), JSON.stringify(results, null, 2));
    console.log(`PASS: ${entry.mode} real Claude, Red/Green, independent Review and acceptance`);
  }
} finally { await app.stopOwnedRuns(); await app.close(); }
