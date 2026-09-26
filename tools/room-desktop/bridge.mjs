import { createServer, createConnection } from 'node:net';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { attachPanel, codexTargets } from './cdp.mjs';

export function bridgePipe(port) { return `\\\\.\\pipe\\agent-room-cdp-${port}`; }

export function bridgeStatus(port, command = 'status') {
  return new Promise((resolve) => {
    const socket = createConnection(bridgePipe(port));
    socket.on('connect', () => socket.write(command));
    let text = '';
    socket.setTimeout(1500, () => { socket.destroy(); resolve(null); });
    socket.on('data', (chunk) => { text += chunk; });
    socket.on('end', () => { try { resolve(JSON.parse(text)); } catch { resolve(null); } });
    socket.on('error', () => resolve(null));
  });
}

export async function runBridge({ port, url }) {
  const sessions = new Map();
  let state = { connected: false, targets: 0, url, message: '等待 Codex 调试端口' };
  let stopped = false;
  const server = createServer((socket) => socket.once('data', (data) => {
    socket.end(JSON.stringify(state));
    if (data.toString() === 'stop') stop();
  }));
  const stop = () => {
    stopped = true;
    for (const attached of sessions.values()) attached.session.close();
    server.close();
  };
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(bridgePipe(port), resolve); });
  let lastMessage = '';
  const report = (next) => {
    state = next;
    if (next.message !== lastMessage) {
      console.log(`${new Date().toISOString()} ${next.message}`);
      lastMessage = next.message;
    }
  };
  const tick = async () => {
    try {
      const targets = await codexTargets(port);
      for (const [id, attached] of sessions) {
        if (!targets.some((target) => target.id === id) || attached.session.socket.readyState !== WebSocket.OPEN) {
          attached.session.close();
          sessions.delete(id);
        }
      }
      for (const target of targets) {
        if (!sessions.has(target.id)) sessions.set(target.id, await attachPanel(target, url));
      }
      report({ connected: sessions.size > 0, targets: sessions.size, url, message: sessions.size ? 'Codex 侧边栏 Room 面板已连接' : '等待 Codex 主界面' });
    } catch (error) {
      report({ connected: false, targets: 0, url, message: `等待 Codex：${error.message}` });
    }
  };
  await tick();
  const loop = async () => { if (stopped) return; await tick(); if (!stopped) setTimeout(loop, 2000); };
  setTimeout(loop, 2000);
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return { stop, status: () => state };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { port: { type: 'string', default: '9223' }, url: { type: 'string' } } });
  if (!values.url) throw new Error('--url is required');
  if (!await bridgeStatus(Number(values.port))) await runBridge({ port: Number(values.port), url: values.url });
}
