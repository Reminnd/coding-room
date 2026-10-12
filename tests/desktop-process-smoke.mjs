import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readProcessTable, liveOwnedProcesses } from '../src/ui/desktop-processes.ts';

const root = mkdtempSync(join(tmpdir(), 'room-process-smoke-'));
const child = spawn(process.execPath, [resolve('desktop/electron/service.ts'), join(root, 'projects.json'), resolve('frontend/dist')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
let output = '';
let stderr = '';
child.stderr.on('data', (chunk) => { stderr += chunk; });
try {
  const ready = await new Promise((resolveReady, reject) => {
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const line = output.split(/\r?\n/).find((item) => item.startsWith('{"ready":true'));
      if (line) resolveReady(JSON.parse(line));
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Service exited before readiness (${code}): ${stderr}`)));
  });
  const table = await readProcessTable();
  assert.ok(table.some((entry) => entry.pid === child.pid), 'Windows reports the actual service process');
  const owner = { id: 'probe', room_id: 'test', run_id: 'test', owner_pid: child.pid, child_pid: null };
  assert.ok(liveOwnedProcesses([owner], table).includes(child.pid));
  assert.equal((await fetch(`${ready.url}/api/health`)).status, 200);
  const exited = once(child, 'exit');
  child.disconnect();
  const [code, signal] = await exited;
  assert.equal(code, 0, stderr);
  assert.equal(signal, null);
  assert.equal(liveOwnedProcesses([owner], await readProcessTable()).length, 0);
  await assert.rejects(fetch(`${ready.url}/api/health`));
  console.log('PASS: real Windows process observation and service shutdown after Electron IPC disconnect');
} finally {
  if (child.exitCode === null && child.signalCode === null) { const ended = once(child, 'exit'); child.kill(); await ended; }
  rmSync(root, { recursive: true, force: true });
}
