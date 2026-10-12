// Opt-in feasibility probe. Uses a fresh profile and never signs in or sends a message.
import { _electron as electron } from 'playwright';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const { chatgptPage } = createRequire(import.meta.url)('../desktop/electron/chatgpt-page.cjs');

const root = mkdtempSync(join(tmpdir(), 'room-chatgpt-probe-'));
const main = join(root, 'main.cjs');
writeFileSync(main, `
const { app, BrowserWindow, WebContentsView } = require('electron');
app.setPath('userData', process.env.ROOM_USER_DATA);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 850 });
  global.probeWindow = win;
  const view = new WebContentsView({ webPreferences: {
    partition: 'persist:chatgpt', nodeIntegration: false, contextIsolation: true, sandbox: true
  } });
  global.probeView = view;
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1200, height: 850 });
  global.probeResult = { loaded: false, error: null };
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.loadURL('https://chatgpt.com/').then(() => {
    global.probeResult.loaded = true;
  }).catch(error => { global.probeResult.error = error.message; });
});
`);
let instance;
try {
  instance = await electron.launch({ args: [main], env: { ...process.env, ROOM_USER_DATA: join(root, 'profile') }, timeout: 30000 });
  const started = Date.now();
  let result;
  do {
    result = await instance.evaluate(() => global.probeResult ?? { loaded: false, error: null });
    if (result.loaded || result.error) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  } while (Date.now() - started < 25000);
  const details = await instance.evaluate(async () => {
    const contents = global.probeView.webContents;
    return { url: contents.getURL(), title: contents.getTitle(),
      text: await contents.executeJavaScript('document.body?.innerText?.slice(0, 1600) ?? ""'),
      controls: await contents.executeJavaScript(`Array.from(document.querySelectorAll('textarea,[contenteditable="true"],button[data-testid],button[aria-label]')).map(e=>({tag:e.tagName,id:e.id,testid:e.getAttribute('data-testid'),label:e.getAttribute('aria-label'),editable:e.getAttribute('contenteditable')}))`),
      screenshot: (await contents.capturePage()).toPNG().toString('base64') };
  });
  writeFileSync(join(root, 'page.png'), Buffer.from(details.screenshot, 'base64'));
  details.bridge = await instance.evaluate(async (_electron, source) => global.probeView.webContents.executeJavaScriptInIsolatedWorld(1001, [{code: `(${source})('read')`}]), chatgptPage.toString());
  delete details.screenshot;
  const report = { root, ...result, ...details, signed_in: false, message_sent: false };
  writeFileSync(join(root, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await instance?.close();
}
