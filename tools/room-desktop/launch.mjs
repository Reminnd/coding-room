import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bridgeStatus } from './bridge.mjs';
import { codexTargets } from './cdp.mjs';

const runFile = promisify(execFile);
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function background(args, log, executable = process.execPath) {
  const fd = openSync(log, 'a');
  try {
    const child = spawn(executable, args, { cwd: root, detached: true, windowsHide: true, stdio: ['ignore', fd, fd] });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    child.unref();
    return child.pid;
  } finally { closeSync(fd); }
}

async function healthy(url) {
  try { return (await (await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) })).json()).status === 'ok'; }
  catch { return false; }
}

async function waitFor(check, milliseconds) {
  const end = Date.now() + milliseconds;
  while (Date.now() < end) { const result = await check(); if (result) return result; await delay(250); }
  return null;
}

async function codexExecutable() {
  const command = "Get-Process ChatGPT -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path";
  const current = (await runFile('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true })).stdout.trim();
  if (current && existsSync(current)) return current;
  const installed = (await runFile('powershell.exe', ['-NoProfile', '-Command', "Get-AppxPackage OpenAI.Codex | Select-Object -First 1 -ExpandProperty InstallLocation"], { windowsHide: true })).stdout.trim();
  const path = join(installed, 'app', 'ChatGPT.exe');
  if (installed && existsSync(path)) return path;
  throw new Error('找不到 Codex 桌面应用，请先打开 Codex。');
}

async function ensureMcp(binding, logs) {
  const endpoint = `http://127.0.0.1:${binding.port}/mcp/participants/p~${encodeURIComponent(binding.control_participant_id)}`;
  const check = async () => { try { return (await fetch(endpoint, { signal: AbortSignal.timeout(1000) })).status === 405; } catch { return false; } };
  if (await check()) return;
  await background([join(root, 'src/mcp/serve.ts'), '--db', binding.database_path, '--project', binding.project_path, '--port', String(binding.port)], join(logs, 'mcp.log'));
  if (!await waitFor(check, 10000)) throw new Error(`Room MCP 启动失败，请查看 ${join(logs, 'mcp.log')}`);
}

export async function launchRoom({ project, port = 4317, cdpPort = 9223 }) {
  const projectPath = resolve(project);
  const local = join(projectPath, '.agent-room');
  mkdirSync(local, { recursive: true });
  const url = `http://127.0.0.1:${port}`;
  if (!existsSync(join(root, 'frontend/dist/index.html'))) throw new Error('Room 前端未构建；请运行安装脚本后重试。');
  if (!await healthy(url)) {
    await background([join(root, 'src/ui/serve.ts'), '--port', String(port), '--config', join(local, 'ui-projects.json')], join(local, 'ui.log'));
    if (!await waitFor(() => healthy(url), 10000)) throw new Error(`Room UI 启动失败，请查看 ${join(local, 'ui.log')}`);
  }
  const runtimePath = join(local, 'runtime.json');
  if (existsSync(runtimePath)) {
    const response = await fetch(`${url}/api/projects`);
    const projects = (await response.json()).projects;
    if (!Array.isArray(projects)) throw new Error('Room project registry response is invalid');
    if (!projects.some((entry) => resolve(entry.project_path).toLowerCase() === projectPath.toLowerCase())) {
      const imported = await fetch(`${url}/api/projects/import-runtime`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project_path: projectPath }) });
      if (!imported.ok) throw new Error((await imported.json()).error?.message ?? '无法载入项目 Room');
    }
    await ensureMcp(JSON.parse(readFileSync(runtimePath, 'utf8')), local);
  }
  let targets = await codexTargets(cdpPort).catch(() => []);
  if (!targets.length) {
    await background([`--user-data-dir=${join(local, 'codex-browser-profile')}`, `--remote-debugging-port=${cdpPort}`, '--remote-debugging-address=127.0.0.1', '--no-first-run'], join(local, 'codex-window.log'), await codexExecutable());
    targets = await waitFor(async () => { const entries = await codexTargets(cdpPort).catch(() => []); return entries.length ? entries : null; }, 15000) ?? [];
  }
  const prior = await bridgeStatus(cdpPort);
  if (prior && prior.url !== new URL(url).href && prior.url !== url) {
    await bridgeStatus(cdpPort, 'stop');
    await waitFor(async () => !await bridgeStatus(cdpPort), 3000);
  }
  if (targets.length && !await bridgeStatus(cdpPort)) {
    await background([join(root, 'tools/room-desktop/bridge.mjs'), '--port', String(cdpPort), '--url', url], join(local, 'cdp.log'));
  }
  const connected = await waitFor(async () => { const status = await bridgeStatus(cdpPort); return status?.connected ? status : null; }, 6000);
  return {
    url,
    panel: Boolean(connected),
    message: connected ? '在 Codex 侧边栏点击 Room 打开工作台。服务在后台运行，关闭此启动窗口不会中断任务。' : `CDP 尚未连接。Room 服务已启动，可在 Codex 内置浏览器打开 ${url}；检查本地 cdp.log 后重试连接。`,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({ options: { project: { type: 'string' }, port: { type: 'string', default: '4317' }, 'cdp-port': { type: 'string', default: '9223' } } });
    if (!values.project) throw new Error('--project is required');
    for (const value of [values.port, values['cdp-port']]) if (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 65535) throw new Error('ports must be integers in 1..65535');
    console.log(JSON.stringify(await launchRoom({ project: values.project, port: Number(values.port), cdpPort: Number(values['cdp-port']) })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
