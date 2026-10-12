import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'room-layout-'));
const project = join(root, 'fixture'); mkdirSync(project);
const scale = process.env.ROOM_TEST_SCALE;
const instance = await electron.launch({ args: ['.', ...(scale ? [`--force-device-scale-factor=${scale}`] : [])], env: { ...process.env, ROOM_USER_DATA: join(root, 'profile') }, timeout: 60000 });
const child = instance.process();
try {
  const page = await instance.firstWindow(); page.setDefaultTimeout(15000);
  if (scale) assert.ok(Math.abs(await page.evaluate(() => devicePixelRatio) - Number(scale)) < 0.01);
  await instance.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, project);
  await page.getByRole('button', { name: '打开项目文件夹', exact: true }).click();
  await page.getByRole('button', { name: '为此项目创建 Room', exact: true }).click();
  await page.getByRole('heading', { name: '全部任务', exact: true }).waitFor();
  await instance.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(1000, 700); window.webContents.setZoomFactor(1.5); });
  await page.getByRole('button', { name: '导航', exact: true }).click();
  await page.getByRole('dialog', { name: '工作台导航', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: '导航', exact: true }).evaluate((element) => element === document.activeElement), true);
  await page.getByRole('button', { name: '导航', exact: true }).click();
  await page.getByRole('button', { name: '＋ 新建任务' }).click();
  await page.getByLabel('任务标题', { exact: true }).fill('缩放与键盘测试');
  await page.getByLabel('希望完成什么', { exact: true }).fill('缩放后完整操作且保留输入');
  await page.getByRole('button', { name: '导航', exact: true }).click();
  await page.getByRole('button', { name: '全部任务', exact: true }).click();
  await page.getByRole('dialog', { name: '保存未完成的编辑？' }).waitFor();
  await page.getByRole('button', { name: '继续编辑', exact: true }).click();
  assert.equal(await page.getByLabel('任务标题', { exact: true }).inputValue(), '缩放与键盘测试');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await page.getByRole('button', { name: /缩放与键盘测试/ }).click();
  assert.equal(await page.locator('.task-context').isVisible(), false, 'Narrow window initially collapses task context');
  await page.getByRole('button', { name: '任务概况', exact: true }).click();
  await page.getByRole('dialog', { name: '任务概况', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: '任务概况', exact: true }).evaluate((element) => element === document.activeElement), true);
  for (const [width, height, zoom] of [[1440, 900, 1], [1000, 700, 1], [1000, 700, 1.25], [1000, 700, 1.5]]) {
    const expectedWidth = await instance.evaluate(({ BrowserWindow }, [width, height, zoom]) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(width, height); window.webContents.setZoomFactor(zoom); return window.getContentBounds().width / zoom; }, [width, height, zoom]);
    await page.waitForFunction((expected) => Math.abs(window.innerWidth - expected) < 2, expectedWidth);
    await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    assert.equal(await page.locator('.workbench-content').evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true, `No page overflow at ${width}/${zoom}`);
    const pixels = await instance.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
    writeFileSync(join(root, `task-${width}-${zoom}.png`), Buffer.from(pixels, 'base64'));
  }
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('主题', { exact: true }).selectOption('dark');
  await page.getByRole('button', { name: '导航', exact: true }).click();
  await page.getByRole('button', { name: '全部任务', exact: true }).click();
  await page.getByRole('button', { name: /缩放与键盘测试/ }).click();
  await page.getByLabel('讨论内容', { exact: true }).fill('验证键盘可以到达发送按钮');
  await page.keyboard.press('Tab');
  const send = page.getByRole('button', { name: '发送', exact: true });
  assert.equal(await send.evaluate((element) => element === document.activeElement), true);
  const bounds = await send.boundingBox();
  assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= await page.evaluate(() => innerHeight) + 1);
  const dark = await instance.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  writeFileSync(join(root, 'task-dark-150.png'), Buffer.from(dark, 'base64'));
  const exited = new Promise((resolve) => child.once('exit', resolve)); await page.evaluate(() => window.roomDesktop.quit()); assert.equal(await exited, 0);
  console.log(`PASS: native window sizes, renderer zoom, drawer keyboard/focus and page overflow; screenshots ${root}`);
} catch (error) { await instance.firstWindow().then((page) => page.screenshot({ path: join(root, 'failure.png') })).catch(() => {}); console.error(root); throw error; }
finally { if (child.exitCode === null) await instance.close(); }
