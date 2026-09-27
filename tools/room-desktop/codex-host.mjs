import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const runFile = promisify(execFile);
export async function codexHost(action = 'inspect', processId = 0) {
  const result = await runFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./codex-host.ps1', import.meta.url)), '-Action', action, '-ProcessId', String(processId)], { windowsHide: true });
  return JSON.parse(result.stdout.replace(/^\uFEFF/, ''));
}

// Only the user's existing profile may own the integration. Never adopt a
// leftover Room profile just because it exposes a working CDP endpoint.
export function selectCodexHost(host, port) {
  const normalize = (path) => path.replaceAll('/', '\\').replace(/\\+$/, '').toLowerCase();
  const primary = host.processes.find((item) => normalize(item.profile) === normalize(host.profile));
  if (primary && primary.port !== port) return { state: 'restart_required', pid: primary.pid };
  if (host.processes.some((item) => item.port === port && item !== primary)) return { state: 'port_in_use' };
  if (primary) return { state: 'running', pid: primary.pid };
  if (!host.executable) throw new Error('找不到已安装的 Codex。');
  return { state: 'start', executable: host.executable, args: [`--user-data-dir=${host.profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'] };
}
