const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron');
const { join } = require('node:path');
const { writeFileSync } = require('node:fs');
const { chatgptPage } = require('./chatgpt-page.cjs');

function installChatgpt(parent, origin) {
  const entries = new Map();
  const toolbars = new Map();
  let quitting = false;
  app.on('before-quit', event => { if (!event.defaultPrevented) quitting = true; });
  async function request(path, body) {
    const response = await fetch(`${origin}${path}`, body === undefined ? undefined : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message ?? 'Room 请求失败');
    return result;
  }
  async function page(entry, action, text) {
    if (action !== 'diagnose' && new URL(entry.view.webContents.getURL()).origin !== 'https://chatgpt.com') throw new Error('请在网页中完成登录并返回 ChatGPT');
    const result = await entry.view.webContents.executeJavaScriptInIsolatedWorld(1001, [{ code: `(() => { try { return { ok: true, value: (${chatgptPage.toString()})(${JSON.stringify(action)},${JSON.stringify(text ?? '')}) }; } catch (error) { return { ok: false, error: error.message }; } })()` }]);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }
  ipcMain.handle('room:chatgpt-action', async (event, action) => {
    const entry = toolbars.get(event.sender.id);
    if (!entry || event.senderFrame !== entry.window.webContents.mainFrame) throw new Error('Unexpected ChatGPT toolbar sender');
    if (action === 'close') { entry.window.hide(); parent.focus(); return ''; }
    if (action === 'diagnose') {
      const path = join(app.getPath('userData'), 'chatgpt-page-diagnostic.json');
      writeFileSync(path, JSON.stringify(await page(entry, 'diagnose'), null, 2), 'utf8');
      return `页面控件诊断已保存：${path}（不含聊天正文、输入内容或 cookies）`;
    }
    if (action === 'reload') {
      entry.pendingText = null;
      entry.view.webContents.reload();
      return '正在重新加载。返回 Room 后请核对消息是否已经发送，再决定重试。';
    }
    throw new Error('Unknown ChatGPT action');
  });
  async function create(path) {
    const context = await request(`${path}/chatgpt`);
    const win = new BrowserWindow({ width: 1200, height: 900, minWidth: 800, minHeight: 600,
      title: `${context.title} — ChatGPT 网页`, show: false,
      webPreferences: { preload: join(__dirname, 'chatgpt-toolbar.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
    win.setMenuBarVisibility(false);
    const view = new WebContentsView({ webPreferences: { partition: 'persist:room-chatgpt', sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    const entry = { window: win, view, path, version: context.expected_version, pendingText: null, sending: false, error: null,
      stopped: false, candidate: null, processed: null, output: null, saving: false, outputError: null,
      pendingIds: [], pendingValue: null, confirmedText: null };
    toolbars.set(win.webContents.id, entry);
    const resize = () => { const [width, height] = win.getContentSize(); view.setBounds({ x: 0, y: 112, width, height: Math.max(0, height - 112) }); };
    win.contentView.addChildView(view); win.on('resize', resize);
    // Keep the task's webpage alive when returning to Room; close it on app exit.
    win.on('close', event => {
      if (!quitting) { event.preventDefault(); win.hide(); parent.focus(); return; }
      win.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) view.webContents.close();
    });
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    view.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('https://')) event.preventDefault(); });
    view.webContents.setWindowOpenHandler(({ url }) => url.startsWith('https://') ? {
      action: 'allow', overrideBrowserWindowOptions: { parent: win, modal: true,
        webPreferences: { partition: 'persist:room-chatgpt', sandbox: true, contextIsolation: true, nodeIntegration: false } },
    } : { action: 'deny' });
    const remember = (_event, url) => {
      if (/^https:\/\/chatgpt\.com\/c\/[a-zA-Z0-9-]+$/.test(url)) {
        void request(`${path}/chatgpt`, { url }).catch(error => { entry.error = `会话地址未保存：${error.message}`; });
      }
    };
    view.webContents.on('did-navigate', remember); view.webContents.on('did-navigate-in-page', remember);
    view.webContents.on('render-process-gone', (_event, details) => { entry.error = `ChatGPT 页面已停止：${details.reason}。请打开网页重新加载。`; });
    view.webContents.on('did-start-loading', () => { entry.error = null; });
    await win.loadFile(join(__dirname, 'chatgpt-toolbar.html')); resize();
    void view.webContents.loadURL(context.url).catch(error => { entry.error = `ChatGPT 无法加载：${error.message}`; });
    return entry;
  }
  function ensure(projectId, taskId) {
    if (typeof projectId !== 'string' || !projectId || typeof taskId !== 'string' || !taskId) throw new Error('请选择任务');
    const path = `/api/projects/${encodeURIComponent(projectId)}/workbench/tasks/${encodeURIComponent(taskId)}`;
    if (!entries.has(path)) entries.set(path, create(path).catch(error => { entries.delete(path); throw error; }));
    return entries.get(path);
  }
  async function read(entry) {
    if (entry.view.webContents.isLoading()) return { messages: [], ready: false, generating: false, pending: Boolean(entry.pendingText), error: entry.error, loading: true };
    const state = await page(entry, 'read');
    const normalize = text => text.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();
    if (entry.pendingText) {
      const fresh = state.messages.filter(message => !entry.pendingIds.includes(message.id));
      const echoed = fresh.some(message => message.role === 'user' && normalize(message.raw) === normalize(entry.pendingText));
      // A newly rendered reply after our click, with the composer cleared, also
      // confirms receipt when the website abbreviates or reformats the user echo.
      const replied = state.composerEmpty && fresh.some(message => message.role === 'assistant' && message.text.trim());
      if (echoed || replied) { entry.pendingText = null; entry.confirmedText = entry.pendingValue; }
    }
    const last = state.messages.at(-1);
    const candidate = last?.role === 'assistant' && last.text.trim() ? last : null;
    if (!candidate || entry.candidate?.id !== candidate.id || entry.candidate?.text !== candidate.text || state.generating) {
      entry.candidate = candidate ? { id: candidate.id, text: candidate.text, since: Date.now() } : null;
    }
    const complete = candidate && !state.generating && !entry.pendingText && !entry.sending && !entry.stopped && Date.now() - entry.candidate.since >= 1400;
    if (complete && !entry.saving && entry.processed !== candidate.id + '\n' + candidate.text) {
      entry.saving = true;
      entry.processed = candidate.id + '\n' + candidate.text;
      try {
        const output = await request(`${entry.path}/chatgpt-output`, { message_id: candidate.id, text: candidate.text, expected_version: entry.version });
        entry.output = { ...output, message_id: candidate.id };
        if (output.proposal_version !== null) entry.version = output.proposal_version;
        entry.outputError = null;
      } catch (error) { entry.outputError = `回复未自动保存：${error.message}。可使用“采用此方案”重试。`; }
      finally { entry.saving = false; }
    }
    const phase = entry.saving ? 'saving' : entry.sending ? 'sending' : entry.pendingText ? 'unconfirmed' : entry.stopped ? 'stopped'
      : state.generating ? candidate ? 'responding' : 'thinking' : last?.role === 'user' ? 'thinking' : candidate && !complete ? 'responding' : 'complete';
    return { ...state, messages: state.messages.map(({ raw, ...message }) => message), pending: Boolean(entry.pendingText),
      phase, confirmedText: entry.confirmedText, output: entry.output?.message_id === candidate?.id ? entry.output : null,
      error: entry.error ?? state.error ?? entry.outputError ?? (entry.pendingText && !entry.sending ? '尚未确认网页发送结果，请打开网页核对；不会自动重发。' : null), loading: false };
  }
  return async function chatgpt(projectId, taskId, action = 'read', value) {
    const entry = await ensure(projectId, taskId);
    if (action === 'show') { if (entry.window.isMinimized()) entry.window.restore(); entry.window.show(); entry.window.focus(); return read(entry); }
    if (action === 'read') return read(entry);
    const context = await request(`${entry.path}/chatgpt`);
    if (action === 'send') {
      if (typeof value !== 'string' || !value.trim()) throw new Error('请输入讨论内容');
      if (entry.sending || entry.pendingText) throw new Error('上一条消息尚未确认，请先核对网页');
      entry.sending = true;
      try {
        const text = `[Room task context]\n${context.prompt}\n[Room user message]\n${value.trim()}`;
        const prepared = await page(entry, 'focus', text);
        entry.stopped = false; entry.output = null; entry.outputError = null;
        entry.version = context.expected_version;
        if (prepared !== 'reuse') await entry.view.webContents.insertText(text);
        entry.pendingIds = (await page(entry, 'read')).messages.map(message => message.id);
        entry.pendingValue = value.trim(); entry.confirmedText = null;
        let clicked = false;
        for (let attempt = 0; attempt < 20 && !clicked; attempt++) {
          clicked = await page(entry, 'send', text);
          if (!clicked) await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (!clicked) throw new Error('网页发送按钮不可用，草稿已保留，可在 Room 再次点击发送');
        entry.pendingText = text;
        for (let attempt = 0; attempt < 40; attempt++) {
          const state = await read(entry);
          if (!entry.pendingText) return state;
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        try {
          writeFileSync(join(app.getPath('userData'), 'chatgpt-send-diagnostic.json'), JSON.stringify(await page(entry, 'diagnose'), null, 2), 'utf8');
        } catch { /* A diagnostic write must not interrupt ongoing reply polling. */ }
        throw new Error('尚未确认网页发送结果，请打开网页核对；不会自动重发。');
      } finally { entry.sending = false; }
    }
    if (action === 'stop') { await page(entry, 'stop'); entry.stopped = true; return read(entry); }
    if (action === 'adopt') {
      const state = await read(entry);
      if (state.generating || state.pending) throw new Error('请等待回复结束后采用方案');
      if (state.output?.message_id === value && state.output.proposal_version !== null) return state;
      const message = state.messages.find(message => message.id === value && message.role === 'assistant');
      if (!message?.text.trim()) throw new Error('未找到选定回复，请刷新讨论');
      const result = await request(`${entry.path}/chatgpt-proposal`, { text: message.text, expected_version: entry.version });
      entry.version = result.task.proposal_version;
      return read(entry);
    }
    throw new Error('Unknown ChatGPT action');
  };
}
module.exports = { installChatgpt };
