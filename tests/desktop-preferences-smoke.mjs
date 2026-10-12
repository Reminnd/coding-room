import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'room-preferences-'));
const project = join(root, 'fixture');
mkdirSync(project);
let instance;
async function launch() {
  instance = await electron.launch({ args: ['.'], env: { ...process.env, ROOM_USER_DATA: join(root, 'profile') }, timeout: 60000 });
  const page = await instance.firstWindow();
  page.setDefaultTimeout(15000);
  return page;
}
async function quit(page) {
  const child = instance.process();
  const exited = new Promise((resolve) => child.once('exit', resolve));
  await page.evaluate(() => window.roomDesktop.quit());
  assert.equal(await exited, 0);
  instance = null;
}
try {
  let page = await launch();
  await instance.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, project);
  await page.getByRole('button', { name: '打开项目文件夹', exact: true }).click();
  await page.getByRole('button', { name: '为此项目创建 Room', exact: true }).click();
  await page.getByRole('button', { name: '＋ 新建任务' }).click();
  await page.getByLabel('任务标题', { exact: true }).fill('重启定位任务');
  await page.getByLabel('希望完成什么', { exact: true }).fill('恢复所选任务、页签和外观。');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await page.getByRole('button', { name: /重启定位任务/ }).waitFor();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('主题', { exact: true }).selectOption('dark');
  await page.getByLabel('字号', { exact: true }).selectOption('16');
  await page.evaluate(async () => {
    const { projects } = await (await fetch('/api/projects')).json();
    for (let index = 0; index < 20; index++) {
      const response = await fetch(`/api/projects/${projects[0].project_id}/workbench/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: `重启定位列表项 ${index}`, goal: '验证列表位置', mode: 'task', verification: 'tdd', source_ids: [] }) });
      if (!response.ok) throw new Error(await response.text());
    }
  });
  await page.reload();
  await page.getByRole('button', { name: '全部任务', exact: true }).click();
  await page.getByLabel('搜索任务标题', { exact: true }).fill('重启定位');
  await page.getByRole('button', { name: /重启定位任务/ }).scrollIntoViewIfNeeded();
  const listPosition = await page.locator('.workbench-content').evaluate((element) => element.scrollTop);
  assert.ok(listPosition > 0);
  await page.getByRole('button', { name: /重启定位任务/ }).click();
  await page.getByLabel('讨论内容', { exact: true }).fill('尚未发送的补充说明');
  await page.getByRole('button', { name: '变更', exact: true }).click();
  await quit(page);
  page = await launch();
  await page.getByRole('heading', { name: '重启定位任务', exact: true }).waitFor();
  await page.getByRole('heading', { name: '工作区变更', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).fontSize), '16px');
  await page.getByRole('button', { name: '对话', exact: true }).click();
  assert.equal(await page.getByLabel('讨论内容', { exact: true }).inputValue(), '尚未发送的补充说明');
  await page.getByRole('button', { name: '← 返回任务列表', exact: true }).click();
  assert.equal(await page.getByLabel('搜索任务标题', { exact: true }).inputValue(), '重启定位');
  assert.equal(await page.locator('.workbench-content').evaluate((element) => element.scrollTop), listPosition);
  await quit(page);
  page = await launch();
  await page.getByRole('button', { name: /重启定位任务/ }).waitFor();
  assert.equal(await page.locator('.workbench-content').evaluate((element) => element.scrollTop), listPosition, 'List position also survives restart while the list itself is open');
  await quit(page);
  console.log(`PASS: project, task, tab, search and appearance survive Electron restart; evidence ${root}`);
} finally { if (instance) await instance.close(); }
