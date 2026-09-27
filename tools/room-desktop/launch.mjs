import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bridgeStatus } from './bridge.mjs';
import { codexTargets } from './cdp.mjs';

import { codexHost, selectCodexHost } from './codex-host.mjs';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function background(args, log, executable = process.execPath, visible = false) {
  const fd = openSync(log, 'a');
  try {
    const child = spawn(executable, args, { cwd: root, detached: true, windowsHide: !visible, stdio: ['ignore', fd, fd] });
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

async function ensureMcp(binding, logs) {
  if (!existsSync(binding.database_path)) throw new Error(`既有 Room 数据库不存在：${binding.database_path}`);
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
  const host = await codexHost();
  const selection = selectCodexHost(host, cdpPort);
  if (selection.state === 'restart_required') {
    await codexHost('activate', selection.pid);
    return { url, panel: false, status: 'restart_required', message: '当前 Codex 尚未启用 Room。请正常退出 Codex，再从已安装的 Codex 快捷方式打开；不会创建第二个窗口。' };
  }
  if (selection.state === 'port_in_use') throw new Error('Room 调试端口仍被旧的独立 Codex 窗口占用，请关闭旧窗口后重试。');
  const processId = selection.state === 'running' ? selection.pid : await background(selection.args, join(local, 'codex-window.log'), selection.executable, true);
  const targets = await waitFor(async () => { const entries = await codexTargets(cdpPort).catch(() => []); return entries.length ? entries : null; }, 45000);
  await codexHost('activate', processId);
  if (!targets) throw new Error('Codex 已启动，但调试端口尚未就绪。请从 Codex 快捷方式重试连接。');

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
  const prior = await bridgeStatus(cdpPort);
  if (prior && (prior.version !== 4 || (prior.url !== new URL(url).href && prior.url !== url))) {
    await bridgeStatus(cdpPort, 'stop');
    await waitFor(async () => !await bridgeStatus(cdpPort), 3000);
  }
  if (targets.length && !await bridgeStatus(cdpPort)) {
    await background([join(root, 'tools/room-desktop/bridge.mjs'), '--port', String(cdpPort), '--url', url], join(local, 'cdp.log'));
  }
  const connected = await waitFor(async () => { const status = await bridgeStatus(cdpPort); return status?.connected ? status : null; }, 35000);
  return {
    url,
    panel: Boolean(connected),
    status: connected ? 'connected' : 'connection_failed',
    message: connected ? 'Room 已接入当前 Codex，入口位于新对话（新聊天）下方。' : 'Codex 已启动，Room 入口尚未就绪。请再次点击 Codex 快捷方式重试连接。',
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
