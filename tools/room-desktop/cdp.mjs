import { panelSource } from './panel.mjs';

export class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      for (const item of this.pending.values()) {
        clearTimeout(item.timer);
        item.reject(new Error('Codex CDP connection closed'));
      }
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('Codex CDP connection timed out')); }, 5000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Cannot connect to Codex CDP')); }, { once: true });
    });
    return new CdpSession(socket);
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, 8000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.socket.close(); }
}

export async function codexTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`Codex CDP returned HTTP ${response.status}`);
  return (await response.json()).filter((target) => target.type === 'page' && target.url === 'app://-/index.html');
}

export async function attachPanel(target, url) {
  const session = await CdpSession.connect(target.webSocketDebuggerUrl);
  try {
    const source = panelSource(url);
    await session.send('Page.enable');
    // Reloading during Codex's initial load aborts its bootstrap promise.
    // Wait for the actual application sidebar before the one-time CSP reload.
    const deadline = Date.now() + 15000;
    let ready = false;
    while (Date.now() < deadline) {
      const result = await session.send('Runtime.evaluate', { expression: "document.readyState === 'complete' && !!document.querySelector('aside nav')", returnByValue: true });
      if (result.result.value) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error('等待 Codex sidebar 完成加载');
    const prepared = await session.send('Runtime.evaluate', { expression: 'window.__roomCdpReady === true', returnByValue: true });
    // Codex's app:// frame-src policy blocks loopback frames until a new document
    // is loaded under this CDP override. Apply it only to this Codex renderer.
    await session.send('Page.setBypassCSP', { enabled: true });
    // Registered before evaluating the current document so reloads restore the entry.
    const registration = await session.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__roomCdpReady = true; ${source}` });
    const evaluated = await session.send('Runtime.evaluate', { expression: source, returnByValue: true });
    if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.text);
    if (!prepared.result.value) await session.send('Page.reload');
    const mountedDeadline = Date.now() + 10000;
    while (Date.now() < mountedDeadline) {
      const result = await session.send('Runtime.evaluate', { expression: 'window.__roomPanel?.status()', returnByValue: true });
      if (result.result.value?.mounted) return { session, registration: registration.identifier, status: result.result.value };
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('Room sidebar entry 未完成加载');
  } catch (error) {
    session.close();
    throw error;
  }
}
