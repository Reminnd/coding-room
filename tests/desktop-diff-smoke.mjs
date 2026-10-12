import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'room-diff-'));
const project = join(root, 'fixture');
mkdirSync(project);
const instance = await electron.launch({ args: ['.'], env: { ...process.env, ROOM_USER_DATA: join(root, 'profile') }, timeout: 60000 });
const child = instance.process();
try {
  const page = await instance.firstWindow();
  page.setDefaultTimeout(15000);
  await instance.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, project);
  await page.getByRole('button', { name: '打开项目文件夹', exact: true }).click();
  await page.getByRole('button', { name: '为此项目创建 Room', exact: true }).click();
  await page.getByRole('button', { name: '＋ 新建任务' }).click();
  await page.getByLabel('任务标题', { exact: true }).fill('审阅文件变更');
  await page.getByLabel('希望完成什么', { exact: true }).fill('理解变更并提出意见');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await page.getByRole('button', { name: /审阅文件变更/ }).click();
  await page.getByLabel('讨论内容', { exact: true }).fill('已有补充说明');
  await page.route('**/workbench/tasks/*/changes*', (route) => route.fulfill({ json: { branch: 'task/diff', worktree_path: project, files: ['sum.js'], file: 'sum.js', diff: '--- a/sum.js\n+++ b/sum.js\n@@ -1,3 +1,3 @@\n export function sum(a,b) {\n-  return 0;\n+  return a + b;\n }\n' } }));
  let opened;
  await page.route('**/open-vscode', (route) => { opened = route.request().postDataJSON(); return route.fulfill({ status: 202, json: { target: join(project, 'sum.js') } }); });
  await page.getByRole('button', { name: '变更', exact: true }).click();
  await page.getByRole('button', { name: '并排', exact: true }).click();
  await page.getByRole('table', { name: '并排 Diff', exact: true }).waitFor();
  await page.getByRole('button', { name: '在编辑器打开', exact: true }).click();
  assert.equal(opened.file, 'sum.js');
  await page.getByRole('button', { name: '对此行提意见：sum.js:2（修改后）', exact: true }).click();
  await page.getByLabel('变更意见', { exact: true }).fill('请说明负数用例如何覆盖');
  await page.getByRole('button', { name: '添加到讨论', exact: true }).click();
  const draft = await page.getByLabel('讨论内容', { exact: true }).inputValue();
  assert.match(draft, /已有补充说明/);
  assert.match(draft, /sum\.js:2（修改后）/);
  assert.match(draft, /请说明负数用例如何覆盖/);
  assert.equal(await page.locator('.message.user').count(), 0, 'Comment remains a draft until the user sends it');
  await page.route('**/workbench/tasks', async (route) => {
    const data = await (await route.fetch()).json();
    data.tasks[0].run_id = 'fixture-run';
    await route.fulfill({ json: data });
  });
  await page.route('**/api/projects/*/state', async (route) => {
    const state = await (await route.fetch()).json();
    state.runs.push({ run_id: 'fixture-run', status: 'review_discussion', worktree_path: project, updated_at: '2026-10-12T00:00:01Z' });
    await route.fulfill({ json: state });
  });
  await page.route('**/workbench/tasks/*/runtime', (route) => {
    const verification = [
      { id: 'red', command_index: 0, stage: 'red', exit_code: 1 },
      { id: 'green', command_index: 1, stage: 'green', exit_code: 0 },
    ].map((item) => ({ ...item, command: 'node --test sum.test.js', behavior: 'sum returns expected value', cwd: project, started_at: '2026-10-12T00:00:00Z', completed_at: '2026-10-12T00:00:01Z', stdout: '', stderr: '', error: null }));
    return route.fulfill({ json: { run: { run_id: 'fixture-run', status: 'review_discussion', worktree_path: project }, execution_observation: 'inactive', attempts: [], question: null, reviews: [{ review_id: 'fixture-review', decision: 'needs_discussion', verification_summary: 'Fixture review evidence', open_questions: ['是否需要处理非数字输入？'], findings: [{ title: '边界需确认', severity: 'low', file: 'sum.js', line: 2, trigger: '传入字符串时', evidence: '当前使用加法运算', impact: '可能产生字符串拼接', requirement_relation: '项目只要求有限数字', minimal_direction: '先澄清范围，不扩大实现' }] }], events: [], logs: [], verification, verification_current: verification, verification_commands: [] } });
  });
  await page.reload();
  await page.getByText('执行分支 · task/diff', { exact: true }).waitFor();
  await page.getByRole('button', { name: '测试', exact: true }).click();
  await page.getByRole('heading', { name: '实际命令证据', exact: true }).waitFor();
  assert.equal(await page.locator('.verification-card').count(), 1, 'Latest result is grouped by actual command, not its repeated plan index');
  assert.match(await page.locator('.verification-card').innerText(), /GREEN/);
  await page.getByRole('button', { name: 'TDD 过程', exact: true }).click();
  assert.equal(await page.locator('.verification-card').count(), 2);
  await page.getByRole('button', { name: '验收', exact: true }).click();
  await page.getByText('触发条件：传入字符串时', { exact: true }).waitFor();
  await page.getByText('需求关系：项目只要求有限数字', { exact: true }).waitFor();
  await page.getByText('是否需要处理非数字输入？', { exact: true }).waitFor();
  await page.getByRole('button', { name: '查看测试证据', exact: true }).click();
  await page.getByRole('heading', { name: '实际命令证据', exact: true }).waitFor();
  const exited = new Promise((resolve) => child.once('exit', resolve));
  await page.evaluate(() => window.roomDesktop.quit());
  assert.equal(await exited, 0);
  console.log(`PASS: split Diff, selected file and unsent line comment; evidence ${root}`);
} finally { if (child.exitCode === null) await instance.close(); }
