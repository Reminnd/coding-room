const { app, BrowserWindow, Menu, Tray, crashReporter, dialog, ipcMain, nativeImage, shell } = require('electron');
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const { createInterface } = require('node:readline');
const { appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } = require('node:fs');
const { installChatgpt } = require('./chatgpt.cjs');

if (process.env.ROOM_USER_DATA) app.setPath('userData', process.env.ROOM_USER_DATA);
app.setName('Room');
let window;
let tray;
let service;
let origin;
let quitting = false;
let quitPending = false;

function showWindow() {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

async function quit() {
  if (quitPending) return;
  quitPending = true;
  try {
    if (origin && service && service.exitCode === null) {
      const activity = await fetch(`${origin}/api/desktop/activity`).then((r) => r.json());
      if (activity.launches.length || activity.verifications.length) {
        const { response } = await dialog.showMessageBox(window, { type: 'question', message: '任务仍在运行', detail: '退出前可停止本窗口启动的任务。停止将保留代码改动，并等待执行器保存终态。', buttons: ['继续后台运行', '停止任务并退出', '返回工作台'], cancelId: 2 });
        if (response === 0) { window.hide(); return; }
        if (response === 2) { showWindow(); return; }
        const stopped = await fetch(`${origin}/api/desktop/stop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmed_by_user: true }) });
        if (!stopped.ok) throw new Error((await stopped.json()).error?.message ?? '无法停止任务');
      }
    }
    quitting = true;
    if (service && service.exitCode === null) {
      await new Promise((resolve) => { service.once('exit', resolve); service.send('shutdown'); });
    }
    app.quit();
  } catch (error) {
    dialog.showErrorBox('无法退出 Room', error.message);
  } finally { quitPending = false; }
}

async function start() {
  const root = app.getAppPath();
  const data = app.getPath('userData');
  mkdirSync(data, { recursive: true });
  const logPath = join(data, 'service.log');
  const node = app.isPackaged ? join(process.resourcesPath, 'runtime', 'node.exe') : process.env.ROOM_NODE_PATH || 'node';
  service = spawn(node, [join(root, 'desktop/electron/service.ts'), join(data, 'projects.json'), join(root, 'frontend/dist')], { cwd: data, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  service.stderr.on('data', (chunk) => appendFileSync(logPath, chunk));
  origin = await new Promise((resolve, reject) => {
    const lines = createInterface({ input: service.stdout });
    service.once('error', reject);
    service.once('exit', (code) => reject(new Error(`Room service exited (${code}). See ${logPath}`)));
    lines.on('line', (line) => {
      appendFileSync(logPath, `${line}\n`);
      try { const event = JSON.parse(line); if (event.ready) resolve(event.url); } catch { /* Service logs may contain plain text. */ }
    });
  });
  window = new BrowserWindow({ width: 1440, height: 900, minWidth: 1000, minHeight: 700, title: 'Room', icon: join(__dirname, 'icon.png'), backgroundColor: '#f8fafc', show: false, webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('render-process-gone', (_event, details) => appendFileSync(logPath, JSON.stringify({ event: 'renderer_process_gone', at: new Date().toISOString(), ...details }) + '\n'));
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  window.on('close', (event) => { if (!quitting) { event.preventDefault(); window.hide(); } });
  const assertSender = (event) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw new Error('Unexpected IPC sender');
  };
  const preferencesPath = join(data, 'ui-preferences.json');
  const chatgpt = installChatgpt(window, origin);
  ipcMain.handle('room:chatgpt', (event, projectId, taskId, action, value) => { assertSender(event); return chatgpt(projectId, taskId, action, value); });
  const preferences = existsSync(preferencesPath) ? JSON.parse(readFileSync(preferencesPath, 'utf8')) : {};
  ipcMain.handle('room:read-preferences', (event) => { assertSender(event); return preferences; });
  ipcMain.handle('room:write-preference', (event, key, value) => {
    assertSender(event);
    if (typeof key !== 'string' || !key.startsWith('room-') || (value !== null && typeof value !== 'string')) throw new Error('Invalid UI preference');
    if (value === null) delete preferences[key]; else preferences[key] = value;
    writeFileSync(preferencesPath, JSON.stringify(preferences), 'utf8');
  });
  ipcMain.handle('room:select-directory', async (event) => {
    assertSender(event);
    const result = await dialog.showOpenDialog(window, { title: '打开项目文件夹', properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('room:quit', async (event) => { assertSender(event); void quit(); });
  ipcMain.handle('room:diagnostics', (event) => { assertSender(event); return { version: app.getVersion(), data_path: data }; });
  ipcMain.handle('room:open-logs', async (event) => {
    assertSender(event);
    const error = await shell.openPath(data);
    if (error) throw new Error(error);
  });
  ipcMain.handle('room:select-reference', async (event, kind) => {
    assertSender(event);
    if (!['file', 'directory'].includes(kind)) throw new Error('请选择文件或目录');
    const result = await dialog.showOpenDialog(window, { title: '选择项目资料', properties: [kind === 'file' ? 'openFile' : 'openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('room:open-reference', async (event, location) => {
    assertSender(event);
    if (typeof location !== 'string' || !['https:', 'http:'].includes(new URL(location).protocol)) throw new Error('只支持 HTTP 或 HTTPS 链接');
    await shell.openExternal(location);
  });
  tray = new Tray(nativeImage.createFromPath(join(__dirname, 'icon.png')));
  tray.setToolTip('Room — 任务工作台');
  tray.setContextMenu(Menu.buildFromTemplate([{ label: '打开 Room', click: showWindow }, { type: 'separator' }, { label: '退出', click: () => void quit() }]));
  tray.on('double-click', showWindow);
  service.on('exit', (code) => {
    if (!quitting) { showWindow(); dialog.showErrorBox('Room 服务已停止', `退出码 ${code}。请关闭并重新打开 Room。日志：${logPath}`); }
  });
  await window.loadURL(origin);
  window.show();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  const crashPath = join(app.getPath('userData'), 'crash-dumps');
  mkdirSync(crashPath, { recursive: true });
  app.setPath('crashDumps', crashPath);
  crashReporter.start({ uploadToServer: false });
  app.on('child-process-gone', (_event, details) => appendFileSync(join(app.getPath('userData'), 'service.log'), JSON.stringify({ event: 'child_process_gone', at: new Date().toISOString(), ...details }) + '\n'));
  app.on('second-instance', showWindow);
  app.on('before-quit', (event) => { if (!quitting) { event.preventDefault(); void quit(); } });
  app.on('activate', showWindow);
  app.whenReady().then(start).catch((error) => { quitting = true; service?.kill(); dialog.showErrorBox('Room 启动失败', error.message); app.quit(); });
}
