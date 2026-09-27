import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Desktop helpers are native Node modules.
import { selectCodexHost } from '../tools/room-desktop/codex-host.mjs';

const profile = 'C:\\Users\\Operator\\AppData\\Roaming\\Codex\\web\\Codex';
const host = { profile, executable: 'C:\\Program Files\\Codex\\ChatGPT.exe', processes: [] as any[] };

test('cold Codex startup keeps the existing profile and only enables loopback debugging', () => {
  const selection = selectCodexHost(host, 9223);
  assert.equal(selection.state, 'start');
  assert.deepEqual(selection.args, [`--user-data-dir=${profile}`, '--remote-debugging-port=9223', '--remote-debugging-address=127.0.0.1']);
  assert.equal(selection.executable, host.executable);
});

test('normal Codex without CDP requires restart instead of creating an independent profile', () => {
  assert.deepEqual(selectCodexHost({ ...host, processes: [
    { pid: 1, profile, port: null },
    { pid: 2, profile: 'D:\\project\\.agent-room\\codex-browser-profile', port: 9223 },
  ] }, 9223), { state: 'restart_required', pid: 1 });
});

test('warm launch reuses the primary profile and refuses a foreign debugging endpoint', () => {
  assert.deepEqual(selectCodexHost({ ...host, processes: [{ pid: 3, profile: profile.toLowerCase().replaceAll('\\', '/'), port: 9223 }] }, 9223), { state: 'running', pid: 3 });
  assert.deepEqual(selectCodexHost({ ...host, processes: [{ pid: 4, profile: 'D:\\room-profile', port: 9223 }] }, 9223), { state: 'port_in_use' });
});
