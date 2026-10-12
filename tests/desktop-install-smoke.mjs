// Opt-in Windows installer verification. Never replaces an existing Room installation.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

assert.equal(process.platform, 'win32');
const execute = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const installer = join(repository, 'desktop/release/Room Setup 0.1.0.exe');
const resume = process.argv[2] ? JSON.parse(readFileSync(join(repository, 'desktop/release/install-smoke.json'), 'utf8')) : null;
if (resume) {
  assert.equal(resolve(process.argv[2]), resolve(resume.root));
  assert.equal(dirname(resolve(resume.root)), resolve(tmpdir()));
  assert.ok(resume.root.includes('room-install-smoke-'));
  assert.equal(resume.installer, installer);
  assert.equal(resume.installed, true);
  assert.equal(resume.uninstalled, false);
}
const registered = await execute('powershell.exe', ['-NoProfile', '-Command', "Get-ItemProperty 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*','HKLM:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match '^Room(\\s|$)' } | Select-Object DisplayName,UninstallString | ConvertTo-Json -Compress"], { windowsHide: true });
const installations = registered.stdout.trim() ? [JSON.parse(registered.stdout)].flat() : [];
if (resume) {
  assert.equal(installations.length, 1);
  assert.ok(installations[0].UninstallString.toLowerCase().startsWith(('"' + join(resolve(resume.root), 'application', 'Uninstall Room.exe') + '"').toLowerCase()));
} else assert.equal(installations.length, 0, 'An existing Room installation must not be replaced by the test');
const root = resume?.root ?? mkdtempSync(join(tmpdir(), 'room-install-smoke-'));
const install = join(root, 'application');
const profile = join(root, 'profile');
const project = join(root, 'fixture');
if (!resume) {
  mkdirSync(project);
  writeFileSync(join(project, 'keep.txt'), 'Preserve project data through reinstall and uninstall.');
}
const executable = join(install, 'Room.exe');
const result = resume ?? { root, installer, installed: false, launched: false, reinstalled: false, persisted: false, uninstalled: false };
const save = () => writeFileSync(join(repository, 'desktop/release/install-smoke.json'), JSON.stringify(result, null, 2));
console.log(`Temporary install: ${root}`);
save();
async function installPackage() {
  await execute(installer, ['/S', '/currentuser', `/D=${install}`], { windowsHide: true, timeout: 120000, env: { ...process.env, ROOM_USER_DATA: profile } });
  assert.ok(existsSync(executable));
  assert.ok(existsSync(join(install, 'resources/runtime/node.exe')));
  assert.equal(existsSync(join(install, 'resources/app/.agents')), false, 'Development Skills must not be packaged');
}
async function openAndCheck(first) {
  const instance = await electron.launch({ executablePath: executable, args: [], cwd: root, env: { ...process.env, ROOM_USER_DATA: profile }, timeout: 60000 });
  const child = instance.process();
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  try {
    const page = await instance.firstWindow();
    page.setDefaultTimeout(20000);
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    if (first) {
      await instance.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, project);
      await page.getByRole('button', { name: '打开项目文件夹', exact: true }).click();
      await page.getByRole('button', { name: '为此项目创建 Room', exact: true }).click();
      await page.getByRole('button', { name: '＋ 新建任务' }).click();
      await page.getByLabel('任务标题', { exact: true }).fill('安装升级保留草稿');
      await page.getByLabel('希望完成什么', { exact: true }).fill('保留项目与草稿。');
      await page.getByRole('button', { name: '保存草稿', exact: true }).click();
    } else {
      await page.waitForFunction(() => document.querySelector('.workbench-shell') || document.querySelector('.recent-projects button'));
      const recent = page.getByRole('button', { name: /fixture/ });
      if (await page.getByRole('heading', { name: '从一个项目开始' }).count()) await recent.click();
    }
    await page.getByRole('button', { name: /安装升级保留草稿/ }).waitFor();
    await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    assert.equal(await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
    await execute(executable, [], { cwd: root, windowsHide: true, timeout: 20000, env: { ...process.env, ROOM_USER_DATA: profile } });
    assert.equal(await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    assert.equal(await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
    await page.evaluate(() => window.roomDesktop.quit());
    assert.equal(await exited, 0);
  } catch (error) { await instance.close(); throw error; }
}
try {
  if (!result.installed) { await installPackage(); result.installed = true; save(); }
  if (!result.launched) { await openAndCheck(true); result.launched = true; save(); }
  if (!result.reinstalled) { await installPackage(); result.reinstalled = true; save(); }
  if (!result.persisted) { await openAndCheck(false); result.persisted = true; save(); }
  const uninstaller = join(install, 'Uninstall Room.exe');
  assert.ok(existsSync(uninstaller));
  await execute(uninstaller, ['/S', '/currentuser', `_?=${install}`], { windowsHide: true, timeout: 120000 });
  assert.equal(existsSync(executable), false);
  assert.equal(readFileSync(join(project, 'keep.txt'), 'utf8'), 'Preserve project data through reinstall and uninstall.');
  assert.ok(existsSync(join(project, '.agent-room/room.sqlite')));
  assert.ok(existsSync(join(profile, 'projects.json')));
  result.uninstalled = true; delete result.error; save();
  console.log('PASS: installed launch outside source cwd, tray/single-instance, reinstall preserves draft, uninstall preserves project/profile data');
} catch (error) { result.error = String(error); save(); throw error; }
